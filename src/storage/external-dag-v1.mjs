import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import zlib from "node:zlib";

import {
  WARMACHINE_EXTERNAL_DAG_CONTENT_KINDS,
  WARMACHINE_EXTERNAL_DAG_SCHEMAS,
  applyWarmachineStateDelta,
  buildWarmachineExternalDagContentIdentity,
  buildWarmachineStateDelta,
  canonicalWarmachineSearchBytes,
  canonicalWarmachineSearchJson,
  compareWarmachineCanonicalBytes,
  digestWarmachineSearchBytes,
} from "./content-address-v1.mjs";

const CONTENT_KIND_SET = new Set(WARMACHINE_EXTERNAL_DAG_CONTENT_KINDS);
const DEFAULT_PARTITION_COUNT = 256;
const DEFAULT_DELTA_DEPTH = 16;
const DEFAULT_DELTA_RATIO = 0.25;
const DEFAULT_SORT_RUN_RECORDS = 2_048;

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function parseJson(bytes, context) {
  try {
    return JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes));
  } catch (error) {
    throw new Error(`invalid_json:${context}:${error.message}`);
  }
}

function readJson(filePath, context = filePath) {
  return parseJson(fs.readFileSync(filePath), context);
}

function fileBytesEqual(leftPath, rightPath) {
  const leftStat = fs.statSync(leftPath);
  const rightStat = fs.statSync(rightPath);
  if (leftStat.size !== rightStat.size) return false;
  const left = fs.openSync(leftPath, "r");
  const right = fs.openSync(rightPath, "r");
  const leftBuffer = Buffer.allocUnsafe(64 * 1024);
  const rightBuffer = Buffer.allocUnsafe(64 * 1024);
  try {
    let offset = 0;
    while (offset < leftStat.size) {
      const length = Math.min(leftBuffer.byteLength, leftStat.size - offset);
      const leftRead = fs.readSync(left, leftBuffer, 0, length, offset);
      const rightRead = fs.readSync(right, rightBuffer, 0, length, offset);
      if (leftRead !== rightRead || !leftBuffer.subarray(0, leftRead).equals(rightBuffer.subarray(0, rightRead))) {
        return false;
      }
      offset += leftRead;
    }
    return true;
  } finally {
    fs.closeSync(left);
    fs.closeSync(right);
  }
}

function publishImmutableTemp(tempPath, finalPath, collisionCode) {
  ensureDirectory(path.dirname(finalPath));
  try {
    fs.linkSync(tempPath, finalPath);
    fs.unlinkSync(tempPath);
    return { created: true };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    if (!fileBytesEqual(tempPath, finalPath)) throw new Error(`${collisionCode}:${finalPath}`);
    fs.unlinkSync(tempPath);
    return { created: false };
  }
}

function atomicReplaceBytes(filePath, bytes) {
  ensureDirectory(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const descriptor = fs.openSync(tempPath, "wx");
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(tempPath, filePath);
}

function writeImmutableJson(filePath, value, collisionCode = "immutable_json_collision") {
  ensureDirectory(path.dirname(filePath));
  const bytes = Buffer.from(`${canonicalWarmachineSearchJson(value)}\n`, "utf8");
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const descriptor = fs.openSync(tempPath, "wx");
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  return publishImmutableTemp(tempPath, filePath, collisionCode);
}

function *readLinesSync(filePath, options = {}) {
  const descriptor = fs.openSync(filePath, "r");
  const chunkSize = Number(options.chunkSize || 64 * 1024);
  const chunk = Buffer.allocUnsafe(chunkSize);
  let carry = "";
  let position = 0;
  try {
    while (true) {
      const read = fs.readSync(descriptor, chunk, 0, chunk.byteLength, position);
      if (!read) break;
      position += read;
      const text = carry + chunk.subarray(0, read).toString("utf8");
      const lines = text.split("\n");
      carry = lines.pop() || "";
      for (const line of lines) if (line) yield line;
    }
    if (carry) yield carry;
  } finally {
    fs.closeSync(descriptor);
  }
}

function listFiles(directoryPath, suffix = "") {
  if (!fs.existsSync(directoryPath)) return [];
  return fs.readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (!suffix || entry.name.endsWith(suffix)))
    .map((entry) => path.join(directoryPath, entry.name))
    .sort();
}

function walkFiles(directoryPath) {
  if (!fs.existsSync(directoryPath)) return [];
  const files = [];
  const stack = [directoryPath];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  }
  return files.sort();
}

function directoryBytes(directoryPath) {
  return walkFiles(directoryPath).reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
}

function artifactIdentity(prefix, schemaVersion, hostReceiptHash, payload) {
  const bytes = canonicalWarmachineSearchBytes({ hostReceiptHash, payload, schemaVersion });
  return `${prefix}:${digestWarmachineSearchBytes(`warmachine-external-${prefix}-v1`, bytes)}`;
}

function createBodyHasher(domain) {
  return createHash("sha256").update(String(domain)).update("\0");
}

function idDigest(id) {
  const separator = String(id).indexOf(":");
  return separator >= 0 ? String(id).slice(separator + 1) : String(id);
}

function partitionForId(id, partitionCount) {
  const digest = idDigest(id);
  const prefix = digest.slice(0, 8).padEnd(8, "0");
  return Number.parseInt(prefix, 16) % partitionCount;
}

function partitionKey(partition) {
  return `p${String(partition).padStart(4, "0")}`;
}

function objectKey(row) {
  return `${row.kind}\0${row.id}`;
}

function compareIndexRows(left, right) {
  return objectKey(left).localeCompare(objectKey(right));
}

function assertSameIndexIdentity(left, right) {
  if (
    left.kind !== right.kind ||
    left.id !== right.id ||
    left.schemaVersion !== right.schemaVersion ||
    left.hostReceiptHash !== right.hostReceiptHash ||
    left.canonicalLength !== right.canonicalLength ||
    left.canonicalDigest !== right.canonicalDigest
  ) {
    throw new Error(`exact_index_identity_conflict:${left.kind}:${left.id}`);
  }
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function distribution(values) {
  return {
    count: values.length,
    min: values.length ? Math.min(...values) : 0,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length ? Math.max(...values) : 0,
  };
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unresolvedMass(payload = {}) {
  if (Number.isFinite(Number(payload.mass))) return Math.max(0, Number(payload.mass));
  const numerator = Number(payload.probabilityNumerator ?? payload.numerator);
  const denominator = Number(payload.probabilityDenominator ?? payload.denominator);
  if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
    return Math.max(0, numerator / denominator);
  }
  return 0;
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class WarmachineExternalDagStore {
  constructor(rootPath, options = {}) {
    this.rootPath = path.resolve(rootPath);
    this.partitionCount = Number(options.partitionCount || DEFAULT_PARTITION_COUNT);
    this.maxDeltaDepth = Number(options.maxDeltaDepth ?? DEFAULT_DELTA_DEPTH);
    this.maxDeltaRatio = Number(options.maxDeltaRatio ?? DEFAULT_DELTA_RATIO);
    this.sortRunRecordLimit = Number(options.sortRunRecordLimit || DEFAULT_SORT_RUN_RECORDS);
    this.hostReceiptHash = String(options.hostReceiptHash || "");
    this.sourceHash = String(options.sourceHash || "");
    this.configHash = String(options.configHash || "");
    this.requestedBinding = {
      hostReceiptHash: this.hostReceiptHash,
      sourceHash: this.sourceHash,
      configHash: this.configHash,
    };
    this.frozenReasons = [];
    this.io = {
      bytesRead: 0,
      bytesWritten: 0,
      candidateRecordsRead: 0,
      indexRowsRead: 0,
      sortRunsWritten: 0,
      maxBufferedCanonicalBytes: 0,
      merges: 0,
    };
    this.paths = {
      descriptor: path.join(this.rootPath, "STORE.json"),
      objects: path.join(this.rootPath, "objects"),
      candidates: path.join(this.rootPath, "segments", "candidates"),
      indexes: path.join(this.rootPath, "segments", "indexes"),
      inbox: path.join(this.rootPath, "control", "inbox"),
      acknowledged: path.join(this.rootPath, "control", "acknowledged"),
      outbox: path.join(this.rootPath, "control", "outbox"),
      checkpoints: path.join(this.rootPath, "checkpoints"),
      current: path.join(this.rootPath, "checkpoints", "CURRENT"),
      pins: path.join(this.rootPath, "pins"),
      locks: path.join(this.rootPath, "control", "locks"),
      temp: path.join(this.rootPath, "tmp"),
      gc: path.join(this.rootPath, "gc"),
    };
    this.#initialize(options);
  }

  #initialize(options) {
    if (!this.hostReceiptHash) throw new TypeError("missing_host_receipt_hash");
    if (!this.sourceHash) throw new TypeError("missing_local_source_hash");
    if (!this.configHash) throw new TypeError("missing_search_config_hash");
    for (const directoryPath of [
      this.rootPath,
      this.paths.objects,
      this.paths.candidates,
      this.paths.indexes,
      this.paths.inbox,
      this.paths.acknowledged,
      this.paths.outbox,
      this.paths.checkpoints,
      this.paths.pins,
      this.paths.locks,
      this.paths.temp,
      this.paths.gc,
    ]) ensureDirectory(directoryPath);
    for (const kind of WARMACHINE_EXTERNAL_DAG_CONTENT_KINDS) {
      ensureDirectory(path.join(this.paths.objects, kind));
    }
    const expected = {
      schemaVersion: WARMACHINE_EXTERNAL_DAG_SCHEMAS.store,
      hostReceiptHash: this.hostReceiptHash,
      sourceHash: this.sourceHash,
      configHash: this.configHash,
      partitionCount: this.partitionCount,
      maxDeltaDepth: this.maxDeltaDepth,
      maxDeltaRatio: this.maxDeltaRatio,
    };
    if (!fs.existsSync(this.paths.descriptor)) {
      if (options.create === false) throw new Error(`external_dag_store_missing:${this.rootPath}`);
      writeImmutableJson(this.paths.descriptor, expected, "external_dag_store_descriptor_collision");
      return;
    }
    const actual = readJson(this.paths.descriptor);
    for (const key of ["schemaVersion", "hostReceiptHash", "sourceHash", "configHash", "partitionCount"]) {
      if (actual[key] !== expected[key]) this.frozenReasons.push(`${key}_drift:${actual[key]}:${expected[key]}`);
    }
    this.hostReceiptHash = String(actual.hostReceiptHash);
    this.sourceHash = String(actual.sourceHash);
    this.configHash = String(actual.configHash);
    this.partitionCount = Number(actual.partitionCount);
    this.maxDeltaDepth = Number(actual.maxDeltaDepth ?? this.maxDeltaDepth);
    this.maxDeltaRatio = Number(actual.maxDeltaRatio ?? this.maxDeltaRatio);
  }

  get frozen() {
    return this.frozenReasons.length > 0;
  }

  assertWritable() {
    if (this.frozen) throw new Error(`external_dag_store_frozen:${this.frozenReasons.join("|")}`);
  }

  objectPath(kind, id) {
    if (!CONTENT_KIND_SET.has(kind)) throw new TypeError(`unknown_external_dag_content_kind:${kind}`);
    const digest = idDigest(id);
    return path.join(this.paths.objects, kind, digest.slice(0, 2), `${digest}.json`);
  }

  #recordIoRead(filePath) {
    if (fs.existsSync(filePath)) this.io.bytesRead += fs.statSync(filePath).size;
  }

  #recordIoWrite(filePath, created = true) {
    if (created && fs.existsSync(filePath)) this.io.bytesWritten += fs.statSync(filePath).size;
  }

  #putGeneric(kind, payload, options = {}) {
    this.assertWritable();
    const identity = buildWarmachineExternalDagContentIdentity(kind, payload, {
      hostReceiptHash: this.hostReceiptHash,
      schemaVersion: options.schemaVersion,
    });
    const id = String(options.forcedId || identity.id);
    const filePath = this.objectPath(kind, id);
    const record = {
      schemaVersion: identity.schemaVersion,
      kind,
      id,
      hostReceiptHash: this.hostReceiptHash,
      canonicalLength: identity.canonicalLength,
      canonicalDigest: identity.canonicalDigest,
      codec: "gzip-9-base64",
      payload: zlib.gzipSync(identity.canonicalBytes, { level: 9 }).toString("base64"),
    };
    const result = writeImmutableJson(filePath, record, `content_address_collision:${kind}:${id}`);
    this.#recordIoWrite(filePath, result.created);
    const restored = this.readContent(id);
    if (!compareWarmachineCanonicalBytes(identity.canonicalBytes, restored.canonicalBytes)) {
      throw new Error(`content_address_collision:${kind}:${id}`);
    }
    return { ...identity, id, created: result.created, physicalBytes: fs.statSync(filePath).size };
  }

  putState(state, options = {}) {
    this.assertWritable();
    const identity = buildWarmachineExternalDagContentIdentity("state", state, {
      hostReceiptHash: this.hostReceiptHash,
      schemaVersion: options.schemaVersion,
    });
    const id = String(options.forcedId || identity.id);
    const filePath = this.objectPath("state", id);
    if (fs.existsSync(filePath)) {
      const restored = this.readState(id);
      if (!compareWarmachineCanonicalBytes(identity.canonicalBytes, restored.canonicalBytes)) {
        throw new Error(`content_address_collision:state:${id}`);
      }
      return { ...identity, id, created: false, encoding: restored.encoding, physicalBytes: fs.statSync(filePath).size };
    }

    const fullGzip = zlib.gzipSync(identity.canonicalBytes, { level: 9 });
    let encoding = "full";
    let deltaDepth = 0;
    let parentStateId = "";
    let payload = fullGzip;
    let operationCount = 0;
    if (options.parentStateId && fs.existsSync(this.objectPath("state", String(options.parentStateId)))) {
      const parent = this.readState(String(options.parentStateId));
      const nextValue = parseJson(identity.canonicalBytes, `state:${id}`);
      const operations = buildWarmachineStateDelta(parent.value, nextValue);
      const deltaBytes = canonicalWarmachineSearchBytes(operations);
      const deltaGzip = zlib.gzipSync(deltaBytes, { level: 9 });
      const candidateDepth = parent.deltaDepth + 1;
      if (
        candidateDepth <= this.maxDeltaDepth &&
        deltaGzip.byteLength <= fullGzip.byteLength * this.maxDeltaRatio
      ) {
        encoding = "delta";
        deltaDepth = candidateDepth;
        parentStateId = String(options.parentStateId);
        payload = deltaGzip;
        operationCount = operations.length;
      }
    }
    const record = {
      schemaVersion: identity.schemaVersion,
      kind: "state",
      id,
      hostReceiptHash: this.hostReceiptHash,
      canonicalLength: identity.canonicalLength,
      canonicalDigest: identity.canonicalDigest,
      encoding,
      codec: "gzip-9-base64",
      deltaDepth,
      parentStateId,
      operationCount,
      payload: payload.toString("base64"),
    };
    const result = writeImmutableJson(filePath, record, `state_encoding_collision:${id}`);
    this.#recordIoWrite(filePath, result.created);
    const restored = this.readState(id);
    if (!compareWarmachineCanonicalBytes(identity.canonicalBytes, restored.canonicalBytes)) {
      throw new Error(`content_address_collision:state:${id}`);
    }
    return { ...identity, id, created: result.created, encoding, deltaDepth, physicalBytes: fs.statSync(filePath).size };
  }

  putContent(kind, payload, options = {}) {
    if (kind === "state") return this.putState(payload, options);
    return this.#putGeneric(kind, payload, options);
  }

  readContent(id) {
    const kind = String(id).split(":", 1)[0];
    if (kind === "state") return this.readState(id);
    const filePath = this.objectPath(kind, id);
    this.#recordIoRead(filePath);
    const record = readJson(filePath, `${kind}:${id}`);
    if (
      record.kind !== kind || record.id !== id || record.hostReceiptHash !== this.hostReceiptHash ||
      record.schemaVersion !== WARMACHINE_EXTERNAL_DAG_SCHEMAS[kind]
    ) {
      throw new Error(`content_record_header_mismatch:${kind}:${id}`);
    }
    const canonicalBytes = zlib.gunzipSync(Buffer.from(record.payload, "base64"));
    const payload = parseJson(canonicalBytes, `${kind}:${id}`);
    const identity = buildWarmachineExternalDagContentIdentity(kind, payload, {
      hostReceiptHash: this.hostReceiptHash,
      schemaVersion: record.schemaVersion,
    });
    if (
      identity.id !== id || identity.canonicalLength !== record.canonicalLength ||
      identity.canonicalDigest !== record.canonicalDigest ||
      !compareWarmachineCanonicalBytes(identity.canonicalBytes, canonicalBytes)
    ) {
      throw new Error(`content_record_verification_failed:${kind}:${id}`);
    }
    return { ...record, value: payload, canonicalBytes };
  }

  readState(stateId, ancestry = new Set()) {
    if (ancestry.has(stateId)) throw new Error(`state_delta_cycle:${stateId}`);
    ancestry.add(stateId);
    const filePath = this.objectPath("state", stateId);
    this.#recordIoRead(filePath);
    const record = readJson(filePath, `state:${stateId}`);
    if (
      record.kind !== "state" || record.id !== stateId || record.hostReceiptHash !== this.hostReceiptHash ||
      record.schemaVersion !== WARMACHINE_EXTERNAL_DAG_SCHEMAS.state
    ) {
      throw new Error(`state_record_header_mismatch:${stateId}`);
    }
    if (record.deltaDepth > this.maxDeltaDepth) throw new Error(`state_delta_depth_exceeded:${stateId}`);
    const physicalPayload = zlib.gunzipSync(Buffer.from(record.payload, "base64"));
    let value;
    if (record.encoding === "full") {
      value = parseJson(physicalPayload, `state-full:${stateId}`);
    } else if (record.encoding === "delta" && record.parentStateId) {
      const parent = this.readState(record.parentStateId, ancestry);
      const operations = parseJson(physicalPayload, `state-delta:${stateId}`);
      value = applyWarmachineStateDelta(parent.value, operations);
    } else {
      throw new Error(`invalid_state_encoding:${stateId}:${record.encoding}`);
    }
    ancestry.delete(stateId);
    const identity = buildWarmachineExternalDagContentIdentity("state", value, {
      hostReceiptHash: this.hostReceiptHash,
      schemaVersion: record.schemaVersion,
    });
    if (
      identity.id !== stateId || identity.canonicalLength !== record.canonicalLength ||
      identity.canonicalDigest !== record.canonicalDigest
    ) {
      throw new Error(`state_reconstruction_verification_failed:${stateId}`);
    }
    return { ...record, value, canonicalBytes: identity.canonicalBytes };
  }

  createCandidateSegment(options = {}) {
    this.assertWritable();
    return new WarmachineCandidateSegmentWriter(this, options);
  }

  candidateSegmentPath(segmentId) {
    return path.join(this.paths.candidates, `${idDigest(segmentId)}.segment`);
  }

  #submissionPath(submissionId) {
    return path.join(this.paths.inbox, `${idDigest(submissionId)}.json`);
  }

  #acknowledgmentPath(submissionId) {
    return path.join(this.paths.acknowledged, `${idDigest(submissionId)}.json`);
  }

  #mergePath(mergeId) {
    return path.join(this.paths.outbox, `${idDigest(mergeId)}.json`);
  }

  #validateAcknowledgment(submissionId) {
    const acknowledgmentPath = this.#acknowledgmentPath(submissionId);
    if (!fs.existsSync(acknowledgmentPath)) return false;
    const acknowledgment = readJson(acknowledgmentPath, `acknowledgment:${submissionId}`);
    if (
      acknowledgment.hostReceiptHash !== this.hostReceiptHash ||
      acknowledgment.submissionId !== submissionId
    ) throw new Error(`acknowledgment_verification_failed:${submissionId}`);
    const checkpoint = this.readCheckpoint(acknowledgment.checkpointId);
    if (!(checkpoint.consumedSubmissionIds || []).includes(submissionId)) {
      throw new Error(`acknowledgment_checkpoint_mismatch:${submissionId}:${acknowledgment.checkpointId}`);
    }
    return true;
  }

  publishCandidateSegment(segment, options = {}) {
    this.assertWritable();
    const validatedSegment = this.validateCandidateSegment(segment.segmentId);
    const workerId = String(options.workerId || segment.workerId || "worker");
    const batchId = String(options.batchId || segment.batchId || "batch");
    const submissionPayload = {
      schemaVersion: WARMACHINE_EXTERNAL_DAG_SCHEMAS.candidateSegment,
      hostReceiptHash: this.hostReceiptHash,
      workerId,
      batchId,
      segmentId: segment.segmentId,
      recordCount: validatedSegment.recordCount,
      unresolvedCount: segment.unresolvedCount,
      contentHash: validatedSegment.contentHash,
    };
    const submissionId = artifactIdentity(
      "submission",
      WARMACHINE_EXTERNAL_DAG_SCHEMAS.candidateSegment,
      this.hostReceiptHash,
      { workerId, batchId },
    );
    const manifest = { ...submissionPayload, submissionId };
    const result = writeImmutableJson(
      this.#submissionPath(submissionId),
      manifest,
      `candidate_batch_idempotency_conflict:${submissionId}`,
    );
    this.#recordIoWrite(this.#submissionPath(submissionId), result.created);
    return manifest;
  }

  validateCandidateSegment(segmentId) {
    const filePath = this.candidateSegmentPath(segmentId);
    if (!fs.existsSync(filePath)) throw new Error(`candidate_segment_missing:${segmentId}`);
    this.#recordIoRead(filePath);
    const hash = createBodyHasher("warmachine-candidate-segment-body-v1");
    let header = null;
    let trailer = null;
    let recordCount = 0;
    for (const line of readLinesSync(filePath)) {
      const row = parseJson(line, `candidate-segment:${segmentId}`);
      if (row.recordType === "header") {
        if (header || recordCount) throw new Error(`candidate_segment_header_order:${segmentId}`);
        header = row;
        hash.update(`${line}\n`);
      } else if (row.recordType === "record") {
        if (!header || trailer) throw new Error(`candidate_segment_record_order:${segmentId}`);
        recordCount += 1;
        hash.update(`${line}\n`);
      } else if (row.recordType === "trailer") {
        if (trailer) throw new Error(`candidate_segment_duplicate_trailer:${segmentId}`);
        trailer = row;
      } else {
        throw new Error(`candidate_segment_unknown_row:${segmentId}`);
      }
    }
    if (!header || !trailer) throw new Error(`candidate_segment_partial:${segmentId}`);
    const contentHash = hash.digest("hex");
    const expectedId = artifactIdentity(
      "segment",
      WARMACHINE_EXTERNAL_DAG_SCHEMAS.candidateSegment,
      this.hostReceiptHash,
      { contentHash, recordCount },
    );
    if (
      header.schemaVersion !== WARMACHINE_EXTERNAL_DAG_SCHEMAS.candidateSegment ||
      header.hostReceiptHash !== this.hostReceiptHash ||
      header.sourceHash !== this.sourceHash || header.configHash !== this.configHash ||
      trailer.contentHash !== contentHash ||
      trailer.recordCount !== recordCount || expectedId !== segmentId
    ) {
      throw new Error(`candidate_segment_verification_failed:${segmentId}`);
    }
    return { filePath, header, trailer, contentHash, recordCount };
  }

  *candidateRecords(segmentId) {
    const segment = this.validateCandidateSegment(segmentId);
    for (const line of readLinesSync(segment.filePath)) {
      const row = parseJson(line, `candidate-record:${segmentId}`);
      if (row.recordType !== "record") continue;
      this.io.candidateRecordsRead += 1;
      yield row;
    }
  }

  #checkpointPath(checkpointId) {
    return path.join(this.paths.checkpoints, `${idDigest(checkpointId)}.json`);
  }

  readCurrentCheckpoint() {
    if (!fs.existsSync(this.paths.current)) return null;
    const pointer = readJson(this.paths.current, "checkpoint-current");
    const checkpoint = this.readCheckpoint(pointer.checkpointId);
    if (pointer.checkpointDigest !== checkpoint.checkpointDigest) {
      throw new Error(`checkpoint_pointer_digest_mismatch:${pointer.checkpointId}`);
    }
    return checkpoint;
  }

  readCheckpoint(checkpointId) {
    const filePath = this.#checkpointPath(checkpointId);
    this.#recordIoRead(filePath);
    const checkpoint = readJson(filePath, `checkpoint:${checkpointId}`);
    const payload = { ...checkpoint };
    delete payload.checkpointId;
    delete payload.checkpointDigest;
    const expectedId = artifactIdentity(
      "checkpoint",
      WARMACHINE_EXTERNAL_DAG_SCHEMAS.checkpoint,
      this.hostReceiptHash,
      payload,
    );
    const checkpointDigest = digestWarmachineSearchBytes(
      "warmachine-checkpoint-manifest-v1",
      canonicalWarmachineSearchBytes(payload),
    );
    if (
      checkpoint.schemaVersion !== WARMACHINE_EXTERNAL_DAG_SCHEMAS.checkpoint ||
      checkpoint.hostReceiptHash !== this.hostReceiptHash || expectedId !== checkpointId ||
      checkpoint.checkpointDigest !== checkpointDigest ||
      checkpoint.sourceHash !== this.sourceHash || checkpoint.configHash !== this.configHash
    ) {
      throw new Error(`checkpoint_verification_failed:${checkpointId}`);
    }
    return checkpoint;
  }

  #acquireMergeLock() {
    this.assertWritable();
    const lockPath = path.join(this.paths.locks, "merge.lock");
    try {
      fs.mkdirSync(lockPath);
      writeImmutableJson(path.join(lockPath, "owner.json"), { pid: process.pid }, "merge_lock_owner_collision");
      return lockPath;
    } catch (error) {
      if (error.code === "EEXIST") throw new Error("external_dag_single_writer_busy");
      throw error;
    }
  }

  #releaseMergeLock(lockPath) {
    fs.rmSync(lockPath, { recursive: true, force: true });
  }

  #validPendingSubmissions(baseCheckpoint) {
    const consumed = new Set(baseCheckpoint?.consumedSubmissionIds || []);
    const pending = [];
    for (const filePath of listFiles(this.paths.inbox, ".json")) {
      const submission = readJson(filePath, `inbox:${filePath}`);
      const expectedSubmissionId = artifactIdentity(
        "submission",
        WARMACHINE_EXTERNAL_DAG_SCHEMAS.candidateSegment,
        this.hostReceiptHash,
        { workerId: submission.workerId, batchId: submission.batchId },
      );
      if (
        submission.schemaVersion !== WARMACHINE_EXTERNAL_DAG_SCHEMAS.candidateSegment ||
        submission.hostReceiptHash !== this.hostReceiptHash ||
        submission.submissionId !== expectedSubmissionId ||
        path.basename(filePath) !== `${idDigest(expectedSubmissionId)}.json`
      ) throw new Error(`candidate_submission_verification_failed:${submission.submissionId}`);
      if (consumed.has(submission.submissionId) || this.#validateAcknowledgment(submission.submissionId)) {
        continue;
      }
      const segment = this.validateCandidateSegment(submission.segmentId);
      if (
        segment.header.workerId !== submission.workerId || segment.header.batchId !== submission.batchId ||
        segment.recordCount !== submission.recordCount || segment.contentHash !== submission.contentHash
      ) throw new Error(`candidate_submission_segment_mismatch:${submission.submissionId}`);
      pending.push(submission);
    }
    return pending.sort((left, right) => left.submissionId.localeCompare(right.submissionId));
  }

  #putCandidateRecord(record) {
    if (!CONTENT_KIND_SET.has(record.kind)) throw new Error(`candidate_record_kind_invalid:${record.kind}`);
    if (
      record.schemaVersion !== WARMACHINE_EXTERNAL_DAG_SCHEMAS[record.kind] ||
      record.payloadCodec !== "gzip-9-base64"
    ) throw new Error(`candidate_record_schema_or_codec_invalid:${record.kind}:${record.expectedId}`);
    const canonicalBytes = zlib.gunzipSync(Buffer.from(record.payload, "base64"));
    const payload = parseJson(canonicalBytes, `candidate-payload:${record.expectedId}`);
    const identity = buildWarmachineExternalDagContentIdentity(record.kind, payload, {
      hostReceiptHash: this.hostReceiptHash,
      schemaVersion: record.schemaVersion,
    });
    if (
      record.canonicalLength !== identity.canonicalLength ||
      record.canonicalDigest !== identity.canonicalDigest ||
      !compareWarmachineCanonicalBytes(canonicalBytes, identity.canonicalBytes)
    ) throw new Error(`candidate_record_canonical_verification_failed:${record.expectedId}`);
    if (identity.id !== record.expectedId && !record.forcedId) {
      throw new Error(`candidate_record_identity_mismatch:${record.expectedId}:${identity.id}`);
    }
    const stored = this.putContent(record.kind, payload, {
      parentStateId: record.parentStateId,
      schemaVersion: record.schemaVersion,
      forcedId: record.forcedId || "",
    });
    if (stored.id !== record.expectedId) {
      throw new Error(`candidate_record_storage_identity_mismatch:${record.expectedId}:${stored.id}`);
    }
    this.io.maxBufferedCanonicalBytes = Math.max(this.io.maxBufferedCanonicalBytes, stored.canonicalLength);
    return {
      kind: record.kind,
      id: stored.id,
      schemaVersion: stored.schemaVersion,
      hostReceiptHash: this.hostReceiptHash,
      canonicalLength: stored.canonicalLength,
      canonicalDigest: stored.canonicalDigest,
    };
  }

  #indexPath(partition, indexId) {
    return path.join(this.paths.indexes, partitionKey(partition), `${idDigest(indexId)}.index`);
  }

  *#indexRows(partition, indexId) {
    if (!indexId) return;
    const filePath = this.#indexPath(partition, indexId);
    this.#recordIoRead(filePath);
    let header = null;
    let trailer = null;
    let count = 0;
    const bodyHash = createBodyHasher("warmachine-exact-index-body-v1");
    for (const line of readLinesSync(filePath)) {
      const row = parseJson(line, `exact-index:${indexId}`);
      if (row.recordType === "header") header = row;
      else if (row.recordType === "row") {
        count += 1;
        bodyHash.update(`${line}\n`);
        this.io.indexRowsRead += 1;
        yield row.value;
      } else if (row.recordType === "trailer") trailer = row;
      else throw new Error(`exact_index_unknown_row:${indexId}`);
    }
    const contentHash = bodyHash.digest("hex");
    const expectedId = artifactIdentity(
      "index",
      WARMACHINE_EXTERNAL_DAG_SCHEMAS.exactIndex,
      this.hostReceiptHash,
      { partition, contentHash, rowCount: count },
    );
    if (
      !header || !trailer || header.partition !== partition ||
      header.schemaVersion !== WARMACHINE_EXTERNAL_DAG_SCHEMAS.exactIndex ||
      header.hostReceiptHash !== this.hostReceiptHash || trailer.rowCount !== count ||
      trailer.contentHash !== contentHash || expectedId !== indexId
    ) {
      throw new Error(`exact_index_verification_failed:${indexId}`);
    }
  }

  *contentRows(checkpoint = this.readCurrentCheckpoint()) {
    if (!checkpoint) return;
    for (const [key, indexId] of Object.entries(checkpoint.indexByPartition || {}).sort()) {
      const partition = Number(key.slice(1));
      yield* this.#indexRows(partition, indexId);
    }
  }

  hasIndexedContent(id, checkpoint = this.readCurrentCheckpoint()) {
    if (!checkpoint) return false;
    const partition = partitionForId(id, this.partitionCount);
    const indexId = checkpoint.indexByPartition?.[partitionKey(partition)];
    if (!indexId) return false;
    for (const row of this.#indexRows(partition, indexId)) {
      if (row.id === id) return true;
    }
    return false;
  }

  #writeRawSortedRun(rows, runDirectory, runNumber) {
    rows.sort(compareIndexRows);
    const outputPath = path.join(runDirectory, `run-${String(runNumber).padStart(6, "0")}.jsonl`);
    const descriptor = fs.openSync(outputPath, "wx");
    let previous = null;
    try {
      for (const row of rows) {
        if (previous && objectKey(previous) === objectKey(row)) {
          assertSameIndexIdentity(previous, row);
          continue;
        }
        const line = `${canonicalWarmachineSearchJson(row)}\n`;
        fs.writeSync(descriptor, line);
        previous = row;
      }
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    this.io.bytesWritten += fs.statSync(outputPath).size;
    this.io.sortRunsWritten += 1;
    return outputPath;
  }

  *#rawRunRows(filePath) {
    this.#recordIoRead(filePath);
    for (const line of readLinesSync(filePath)) yield parseJson(line, `sort-run:${filePath}`);
  }

  #writeExactMergedIndex(partition, baseIndexId, incomingPath, workDirectory, failAt = "") {
    const runDirectory = path.join(workDirectory, partitionKey(partition));
    ensureDirectory(runDirectory);
    const runPaths = [];
    let rows = [];
    let bufferedRowBytes = 0;
    let runNumber = 0;
    if (incomingPath && fs.existsSync(incomingPath)) {
      for (const line of readLinesSync(incomingPath)) {
        rows.push(parseJson(line, `incoming-index:${partition}`));
        bufferedRowBytes += Buffer.byteLength(line);
        this.io.maxBufferedCanonicalBytes = Math.max(this.io.maxBufferedCanonicalBytes, bufferedRowBytes);
        if (rows.length >= this.sortRunRecordLimit) {
          runPaths.push(this.#writeRawSortedRun(rows, runDirectory, runNumber));
          runNumber += 1;
          rows = [];
          bufferedRowBytes = 0;
        }
      }
      if (rows.length) runPaths.push(this.#writeRawSortedRun(rows, runDirectory, runNumber));
    }
    if (failAt === "after_sort_runs") throw new Error("failure_injection:after_sort_runs");

    const sources = [];
    if (baseIndexId) sources.push({ source: "base", iterator: this.#indexRows(partition, baseIndexId) });
    for (const runPath of runPaths) sources.push({ source: "incoming", iterator: this.#rawRunRows(runPath) });
    const heads = sources.map((source) => ({ ...source, next: source.iterator.next() }));
    const header = {
      recordType: "header",
      schemaVersion: WARMACHINE_EXTERNAL_DAG_SCHEMAS.exactIndex,
      hostReceiptHash: this.hostReceiptHash,
      partition,
    };
    const tempPath = path.join(runDirectory, "merged.index.tmp");
    const addedPath = path.join(runDirectory, "added.jsonl");
    const descriptor = fs.openSync(tempPath, "wx");
    const addedDescriptor = fs.openSync(addedPath, "wx");
    const bodyHash = createBodyHasher("warmachine-exact-index-body-v1");
    let rowCount = 0;
    let addedCount = 0;
    let duplicateCount = 0;
    try {
      fs.writeSync(descriptor, `${canonicalWarmachineSearchJson(header)}\n`);
      while (true) {
        const active = heads.filter((entry) => !entry.next.done);
        if (!active.length) break;
        active.sort((left, right) => compareIndexRows(left.next.value, right.next.value));
        const key = objectKey(active[0].next.value);
        const matching = active.filter((entry) => objectKey(entry.next.value) === key);
        const selected = matching[0].next.value;
        for (const entry of matching.slice(1)) assertSameIndexIdentity(selected, entry.next.value);
        const hasBase = matching.some((entry) => entry.source === "base");
        const incomingMatchCount = matching.filter((entry) => entry.source === "incoming").length;
        const hasIncoming = incomingMatchCount > 0;
        if (hasIncoming && hasBase) duplicateCount += incomingMatchCount;
        else if (hasIncoming) {
          fs.writeSync(addedDescriptor, `${canonicalWarmachineSearchJson(selected)}\n`);
          addedCount += 1;
          duplicateCount += Math.max(0, incomingMatchCount - 1);
        }
        const bodyLine = `${canonicalWarmachineSearchJson({ recordType: "row", value: selected })}\n`;
        fs.writeSync(descriptor, bodyLine);
        bodyHash.update(bodyLine);
        rowCount += 1;
        for (const entry of matching) entry.next = entry.iterator.next();
      }
      const contentHash = bodyHash.digest("hex");
      const trailer = { recordType: "trailer", rowCount, contentHash };
      fs.writeSync(descriptor, `${canonicalWarmachineSearchJson(trailer)}\n`);
      fs.fsyncSync(descriptor);
      fs.fsyncSync(addedDescriptor);
      const indexId = artifactIdentity(
        "index",
        WARMACHINE_EXTERNAL_DAG_SCHEMAS.exactIndex,
        this.hostReceiptHash,
        { partition, contentHash, rowCount },
      );
      fs.closeSync(descriptor);
      fs.closeSync(addedDescriptor);
      const finalPath = this.#indexPath(partition, indexId);
      const published = publishImmutableTemp(tempPath, finalPath, `exact_index_collision:${indexId}`);
      this.#recordIoWrite(finalPath, published.created);
      return { indexId, rowCount, addedPath, addedCount, duplicateCount };
    } catch (error) {
      try { fs.closeSync(descriptor); } catch {}
      try { fs.closeSync(addedDescriptor); } catch {}
      throw error;
    }
  }

  #baseContainsIds(baseCheckpoint, ids) {
    const wantedByPartition = new Map();
    for (const id of ids) {
      const partition = partitionForId(id, this.partitionCount);
      if (!wantedByPartition.has(partition)) wantedByPartition.set(partition, new Set());
      wantedByPartition.get(partition).add(id);
    }
    const found = new Set();
    for (const [partition, wanted] of wantedByPartition) {
      const indexId = baseCheckpoint?.indexByPartition?.[partitionKey(partition)];
      if (!indexId) continue;
      for (const row of this.#indexRows(partition, indexId)) {
        if (wanted.has(row.id)) found.add(row.id);
      }
    }
    return found;
  }

  #verifyMergeManifest(merge) {
    const expectedMergeId = artifactIdentity(
      "merge",
      WARMACHINE_EXTERNAL_DAG_SCHEMAS.merge,
      this.hostReceiptHash,
      {
        baseCheckpointId: merge.baseCheckpointId,
        submissionIds: [...(merge.submissionIds || [])].sort(),
        segmentIds: [...(merge.segmentIds || [])].sort(),
      },
    );
    const payload = { ...merge };
    delete payload.mergeDigest;
    const expectedDigest = digestWarmachineSearchBytes(
      "warmachine-merge-manifest-v1",
      canonicalWarmachineSearchBytes(payload),
    );
    if (
      merge.schemaVersion !== WARMACHINE_EXTERNAL_DAG_SCHEMAS.merge ||
      merge.hostReceiptHash !== this.hostReceiptHash || merge.sourceHash !== this.sourceHash ||
      merge.configHash !== this.configHash || merge.mergeId !== expectedMergeId ||
      merge.mergeDigest !== expectedDigest
    ) {
      throw new Error(`merge_manifest_verification_failed:${merge.mergeId || "missing"}`);
    }
    return merge;
  }

  #readMergeManifest(filePath) {
    this.#recordIoRead(filePath);
    return this.#verifyMergeManifest(readJson(filePath, `merge:${filePath}`));
  }

  mergeInbox(options = {}) {
    const lockPath = this.#acquireMergeLock();
    const startedAt = performance.now();
    const startWritten = this.io.bytesWritten;
    try {
      const baseCheckpoint = this.readCurrentCheckpoint();
      const allPending = this.#validPendingSubmissions(baseCheckpoint);
      const requestedIds = options.submissionIds ? new Set(options.submissionIds) : null;
      const submissions = requestedIds
        ? allPending.filter((entry) => requestedIds.has(entry.submissionId))
        : allPending;
      if (!submissions.length) return null;
      const mergePayload = {
        baseCheckpointId: baseCheckpoint?.checkpointId || "",
        submissionIds: submissions.map((entry) => entry.submissionId).sort(),
        segmentIds: submissions.map((entry) => entry.segmentId).sort(),
      };
      const mergeId = artifactIdentity(
        "merge",
        WARMACHINE_EXTERNAL_DAG_SCHEMAS.merge,
        this.hostReceiptHash,
        mergePayload,
      );
      const outboxPath = this.#mergePath(mergeId);
      if (fs.existsSync(outboxPath)) return this.#readMergeManifest(outboxPath);
      const workDirectory = fs.mkdtempSync(path.join(this.paths.temp, `merge-${idDigest(mergeId).slice(0, 12)}-`));
      const incomingDescriptors = new Map();
      const proposalCounts = Object.fromEntries(WARMACHINE_EXTERNAL_DAG_CONTENT_KINDS.map((kind) => [kind, 0]));
      let stateProposalCount = 0;
      for (const submission of submissions) {
        for (const record of this.candidateRecords(submission.segmentId)) {
          proposalCounts[record.kind] += 1;
          if (record.kind === "state") stateProposalCount += 1;
          const row = this.#putCandidateRecord(record);
          const partition = partitionForId(row.id, this.partitionCount);
          if (!incomingDescriptors.has(partition)) {
            const incomingPath = path.join(workDirectory, `${partitionKey(partition)}.incoming`);
            incomingDescriptors.set(partition, {
              path: incomingPath,
              descriptor: fs.openSync(incomingPath, "wx"),
            });
          }
          fs.writeSync(incomingDescriptors.get(partition).descriptor, `${canonicalWarmachineSearchJson(row)}\n`);
        }
      }
      for (const entry of incomingDescriptors.values()) {
        fs.fsyncSync(entry.descriptor);
        fs.closeSync(entry.descriptor);
        this.io.bytesWritten += fs.statSync(entry.path).size;
      }
      if (options.failAt === "after_candidate_objects") {
        throw new Error("failure_injection:after_candidate_objects");
      }

      const indexByPartition = { ...(baseCheckpoint?.indexByPartition || {}) };
      const addedPaths = [];
      let duplicateRowCount = 0;
      const touchedPartitions = [...incomingDescriptors.keys()].sort((left, right) => left - right);
      for (const partition of touchedPartitions) {
        const key = partitionKey(partition);
        const merged = this.#writeExactMergedIndex(
          partition,
          indexByPartition[key] || "",
          incomingDescriptors.get(partition).path,
          workDirectory,
          options.failAt,
        );
        indexByPartition[key] = merged.indexId;
        addedPaths.push(merged.addedPath);
        duplicateRowCount += merged.duplicateCount;
        if (options.failAt === "after_first_partition" && partition === touchedPartitions[0]) {
          throw new Error("failure_injection:after_first_partition");
        }
      }

      const addedCounts = Object.fromEntries(WARMACHINE_EXTERNAL_DAG_CONTENT_KINDS.map((kind) => [kind, 0]));
      const duplicateCounts = Object.fromEntries(WARMACHINE_EXTERNAL_DAG_CONTENT_KINDS.map((kind) => [kind, 0]));
      const addedLabelStateIds = new Set();
      let addedUnresolvedMass = 0;
      for (const addedPath of addedPaths) {
        for (const line of readLinesSync(addedPath)) {
          const row = parseJson(line, `merge-added:${mergeId}`);
          addedCounts[row.kind] += 1;
          if (row.kind === "label") {
            const stateId = String(this.readContent(row.id).value.stateId || "");
            if (stateId) addedLabelStateIds.add(stateId);
          }
          if (row.kind === "unresolved") addedUnresolvedMass += unresolvedMass(this.readContent(row.id).value);
        }
      }
      for (const kind of WARMACHINE_EXTERNAL_DAG_CONTENT_KINDS) {
        duplicateCounts[kind] = proposalCounts[kind] - addedCounts[kind];
      }
      duplicateRowCount = Object.values(duplicateCounts).reduce((sum, count) => sum + count, 0);
      const reopenedStateIds = [...this.#baseContainsIds(baseCheckpoint, addedLabelStateIds)].sort();
      const previousCounts = baseCheckpoint?.counts || {};
      const counts = Object.fromEntries(WARMACHINE_EXTERNAL_DAG_CONTENT_KINDS.map((kind) => [
        kind,
        numeric(previousCounts[kind], 0) + addedCounts[kind],
      ]));
      const mergePayloadResult = {
        schemaVersion: WARMACHINE_EXTERNAL_DAG_SCHEMAS.merge,
        hostReceiptHash: this.hostReceiptHash,
        sourceHash: this.sourceHash,
        configHash: this.configHash,
        mergeId,
        baseCheckpointId: baseCheckpoint?.checkpointId || "",
        submissionIds: mergePayload.submissionIds,
        segmentIds: mergePayload.segmentIds,
        indexByPartition,
        touchedPartitions: touchedPartitions.map(partitionKey),
        proposalCounts,
        stateProposalCount,
        addedCounts,
        duplicateCounts,
        duplicateRowCount,
        counts,
        reopenedStateIds,
        unresolvedMass: numeric(baseCheckpoint?.unresolvedMass, 0) + addedUnresolvedMass,
        io: {
          durationMs: Number((performance.now() - startedAt).toFixed(3)),
          bytesWritten: this.io.bytesWritten - startWritten,
          sortRunsWritten: this.io.sortRunsWritten,
        },
      };
      const result = {
        ...mergePayloadResult,
        mergeDigest: digestWarmachineSearchBytes(
          "warmachine-merge-manifest-v1",
          canonicalWarmachineSearchBytes(mergePayloadResult),
        ),
      };
      const published = writeImmutableJson(outboxPath, result, `merge_manifest_collision:${mergeId}`);
      this.#recordIoWrite(outboxPath, published.created);
      this.io.merges += 1;
      if (typeof options.onStage === "function") options.onStage("outbox_published", result);
      if (options.failAt === "after_outbox") throw new Error("failure_injection:after_outbox");
      fs.rmSync(workDirectory, { recursive: true, force: true });
      return result;
    } finally {
      this.#releaseMergeLock(lockPath);
    }
  }

  commitMerge(merge, options = {}) {
    if (!merge) return this.readCurrentCheckpoint();
    this.#verifyMergeManifest(merge);
    const lockPath = this.#acquireMergeLock();
    try {
      const current = this.readCurrentCheckpoint();
      if (current?.mergeId === merge.mergeId) return current;
      if ((current?.checkpointId || "") !== merge.baseCheckpointId) {
        throw new Error(`checkpoint_compare_and_swap_failed:${merge.baseCheckpointId}:${current?.checkpointId || ""}`);
      }
      const consumedSubmissionIds = [...new Set(merge.submissionIds)].sort();
      const payload = {
        schemaVersion: WARMACHINE_EXTERNAL_DAG_SCHEMAS.checkpoint,
        hostReceiptHash: this.hostReceiptHash,
        sourceHash: this.sourceHash,
        configHash: this.configHash,
        parentCheckpointId: current?.checkpointId || "",
        generation: numeric(current?.generation, 0) + 1,
        mergeId: merge.mergeId,
        indexByPartition: merge.indexByPartition,
        consumedSubmissionIds,
        segmentIds: [...new Set(merge.segmentIds)].sort(),
        mergeDigest: merge.mergeDigest,
        counts: merge.counts,
        stateProposalCount: numeric(current?.stateProposalCount, 0) + merge.stateProposalCount,
        proposalCounts: Object.fromEntries(WARMACHINE_EXTERNAL_DAG_CONTENT_KINDS.map((kind) => [
          kind,
          numeric(current?.proposalCounts?.[kind], 0) + numeric(merge.proposalCounts?.[kind], 0),
        ])),
        unresolvedMass: merge.unresolvedMass,
        frontierRootIds: [...new Set(options.frontierRootIds || [])].sort(),
        inFlightLedger: options.inFlightLedger || [],
      };
      const checkpointId = artifactIdentity(
        "checkpoint",
        WARMACHINE_EXTERNAL_DAG_SCHEMAS.checkpoint,
        this.hostReceiptHash,
        payload,
      );
      const checkpointDigest = digestWarmachineSearchBytes(
        "warmachine-checkpoint-manifest-v1",
        canonicalWarmachineSearchBytes(payload),
      );
      const checkpoint = { ...payload, checkpointId, checkpointDigest };
      const checkpointPath = this.#checkpointPath(checkpointId);
      const published = writeImmutableJson(checkpointPath, checkpoint, `checkpoint_collision:${checkpointId}`);
      this.#recordIoWrite(checkpointPath, published.created);
      if (options.failAt === "after_checkpoint_manifest") {
        throw new Error("failure_injection:after_checkpoint_manifest");
      }
      atomicReplaceBytes(this.paths.current, Buffer.from(`${canonicalWarmachineSearchJson({ checkpointId, checkpointDigest })}\n`));
      this.#recordIoWrite(this.paths.current, true);
      if (options.failAt === "after_checkpoint_pointer") {
        throw new Error("failure_injection:after_checkpoint_pointer");
      }
      for (const submissionId of merge.submissionIds) {
        const acknowledgment = {
          checkpointId,
          hostReceiptHash: this.hostReceiptHash,
          submissionId,
        };
        writeImmutableJson(
          this.#acknowledgmentPath(submissionId),
          acknowledgment,
          `acknowledgment_collision:${submissionId}`,
        );
      }
      return checkpoint;
    } finally {
      this.#releaseMergeLock(lockPath);
    }
  }

  mergeAndCheckpoint(options = {}) {
    const merge = this.mergeInbox(options.merge || {});
    return this.commitMerge(merge, options.checkpoint || {});
  }

  recover(options = {}) {
    const startedAt = performance.now();
    const lockPath = path.join(this.paths.locks, "merge.lock");
    let staleLockRecovered = false;
    if (fs.existsSync(lockPath)) {
      let owner = {};
      try { owner = readJson(path.join(lockPath, "owner.json"), "merge-lock-owner"); } catch {}
      if (options.forceStaleLock || !processAlive(Number(owner.pid))) {
        fs.rmSync(lockPath, { recursive: true, force: true });
        staleLockRecovered = true;
      }
    }
    const gcRecovery = this.recoverGarbageCollection();
    let checkpoint = null;
    const dependencyFailures = [];
    try {
      checkpoint = this.readCurrentCheckpoint();
      if (checkpoint) {
        for (const row of this.contentRows(checkpoint)) {
          if (!fs.existsSync(this.objectPath(row.kind, row.id))) {
            throw new Error(`checkpoint_object_missing:${row.kind}:${row.id}`);
          }
        }
        for (const segmentId of checkpoint.segmentIds || []) this.validateCandidateSegment(segmentId);
      }
    } catch (error) {
      dependencyFailures.push(String(error.message));
      this.frozenReasons.push(`recovery_checkpoint_corruption:${error.message}`);
    }
    if (checkpoint && !this.frozen) {
      for (const submissionId of checkpoint.consumedSubmissionIds || []) {
        writeImmutableJson(this.#acknowledgmentPath(submissionId), {
          checkpointId: checkpoint.checkpointId,
          hostReceiptHash: this.hostReceiptHash,
          submissionId,
        }, `acknowledgment_collision:${submissionId}`);
      }
    }
    const invalidSubmissions = [];
    let pendingSubmissions = [];
    try {
      pendingSubmissions = this.#validPendingSubmissions(checkpoint);
    } catch (error) {
      invalidSubmissions.push(String(error.message));
      this.frozenReasons.push(`recovery_corruption:${error.message}`);
    }
    const ignoredPartialFiles = walkFiles(this.paths.temp).filter((filePath) =>
      filePath.includes(".tmp") || filePath.endsWith(".incoming"));
    let uncommittedMerges = [];
    try {
      uncommittedMerges = listFiles(this.paths.outbox, ".json")
        .map((filePath) => this.#readMergeManifest(filePath))
        .filter((merge) => merge.baseCheckpointId === (checkpoint?.checkpointId || ""));
    } catch (error) {
      dependencyFailures.push(String(error.message));
      this.frozenReasons.push(`recovery_outbox_corruption:${error.message}`);
    }
    return {
      checkpoint,
      pendingSubmissions,
      uncommittedMerges,
      invalidSubmissions,
      dependencyFailures,
      ignoredPartialFileCount: ignoredPartialFiles.length,
      staleLockRecovered,
      gcRecovery,
      frozen: this.frozen,
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
    };
  }

  pinCheckpoint(checkpointId, pinName = "report") {
    const checkpoint = this.readCheckpoint(checkpointId);
    const safeName = String(pinName).replaceAll(/[^a-zA-Z0-9._-]/g, "_");
    const pin = {
      schemaVersion: WARMACHINE_EXTERNAL_DAG_SCHEMAS.checkpoint,
      checkpointId: checkpoint.checkpointId,
      checkpointDigest: checkpoint.checkpointDigest,
      hostReceiptHash: this.hostReceiptHash,
    };
    atomicReplaceBytes(path.join(this.paths.pins, `${safeName}.json`), Buffer.from(`${canonicalWarmachineSearchJson(pin)}\n`));
    return pin;
  }

  #rootCheckpoints() {
    const roots = new Map();
    const current = this.readCurrentCheckpoint();
    if (current) roots.set(current.checkpointId, current);
    for (const filePath of listFiles(this.paths.pins, ".json")) {
      const pin = readJson(filePath, `pin:${filePath}`);
      const checkpoint = this.readCheckpoint(pin.checkpointId);
      roots.set(checkpoint.checkpointId, checkpoint);
    }
    return [...roots.values()];
  }

  #gcMarkedPaths() {
    const marked = new Set([
      path.relative(this.rootPath, this.paths.descriptor),
      path.relative(this.rootPath, this.paths.current),
    ]);
    for (const pinPath of listFiles(this.paths.pins, ".json")) marked.add(path.relative(this.rootPath, pinPath));
    for (const checkpoint of this.#rootCheckpoints()) {
      marked.add(path.relative(this.rootPath, this.#checkpointPath(checkpoint.checkpointId)));
      for (const [key, indexId] of Object.entries(checkpoint.indexByPartition || {})) {
        const partition = Number(key.slice(1));
        const indexPath = this.#indexPath(partition, indexId);
        marked.add(path.relative(this.rootPath, indexPath));
        for (const row of this.#indexRows(partition, indexId)) {
          marked.add(path.relative(this.rootPath, this.objectPath(row.kind, row.id)));
        }
      }
      for (const segmentId of checkpoint.segmentIds || []) {
        marked.add(path.relative(this.rootPath, this.candidateSegmentPath(segmentId)));
      }
      for (const submissionId of checkpoint.consumedSubmissionIds || []) {
        marked.add(path.relative(this.rootPath, this.#submissionPath(submissionId)));
        marked.add(path.relative(this.rootPath, this.#acknowledgmentPath(submissionId)));
      }
      if (checkpoint.mergeId) marked.add(path.relative(this.rootPath, this.#mergePath(checkpoint.mergeId)));
    }
    const current = this.readCurrentCheckpoint();
    const consumed = new Set(current?.consumedSubmissionIds || []);
    for (const inboxPath of listFiles(this.paths.inbox, ".json")) {
      const submission = readJson(inboxPath, `gc-inbox:${inboxPath}`);
      if (
        !consumed.has(submission.submissionId) &&
        !fs.existsSync(this.#acknowledgmentPath(submission.submissionId))
      ) {
        marked.add(path.relative(this.rootPath, inboxPath));
        marked.add(path.relative(this.rootPath, this.candidateSegmentPath(submission.segmentId)));
      }
    }
    return marked;
  }

  collectGarbage(options = {}) {
    this.assertWritable();
    const current = this.readCurrentCheckpoint();
    if (!current) return { removedCount: 0, deferredCount: 0, reason: "no_checkpoint" };
    const retentionGenerations = Number(options.retentionGenerations ?? 2);
    const marked = this.#gcMarkedPaths();
    const candidateRoots = [
      this.paths.objects,
      this.paths.candidates,
      this.paths.indexes,
      this.paths.inbox,
      this.paths.acknowledged,
      this.paths.outbox,
    ];
    const candidates = candidateRoots.flatMap(walkFiles)
      .map((filePath) => path.relative(this.rootPath, filePath))
      .filter((relativePath) => !marked.has(relativePath));
    const ledgerPath = path.join(this.paths.gc, "orphan-ledger.json");
    const previousLedger = fs.existsSync(ledgerPath) ? readJson(ledgerPath, "gc-orphan-ledger") : {};
    const nextLedger = {};
    const eligible = [];
    for (const relativePath of candidates) {
      const firstGeneration = numeric(previousLedger[relativePath], current.generation);
      nextLedger[relativePath] = firstGeneration;
      if (current.generation - firstGeneration >= retentionGenerations) eligible.push(relativePath);
    }
    atomicReplaceBytes(ledgerPath, Buffer.from(`${canonicalWarmachineSearchJson(nextLedger)}\n`));
    if (!eligible.length) return { removedCount: 0, deferredCount: candidates.length, generation: current.generation };
    const transactionPayload = {
      schemaVersion: WARMACHINE_EXTERNAL_DAG_SCHEMAS.gc,
      checkpointId: current.checkpointId,
      generation: current.generation,
      paths: eligible.sort(),
    };
    const gcId = artifactIdentity(
      "gc",
      WARMACHINE_EXTERNAL_DAG_SCHEMAS.gc,
      this.hostReceiptHash,
      transactionPayload,
    );
    const transactionPath = path.join(this.paths.gc, "transactions", idDigest(gcId));
    const quarantinePath = path.join(transactionPath, "quarantine");
    ensureDirectory(quarantinePath);
    writeImmutableJson(path.join(transactionPath, "manifest.json"), { ...transactionPayload, gcId }, `gc_manifest_collision:${gcId}`);
    let moved = 0;
    for (const relativePath of eligible) {
      if (marked.has(relativePath)) throw new Error(`gc_mark_changed:${relativePath}`);
      const sourcePath = path.join(this.rootPath, relativePath);
      if (!fs.existsSync(sourcePath)) continue;
      const targetPath = path.join(quarantinePath, relativePath);
      ensureDirectory(path.dirname(targetPath));
      fs.renameSync(sourcePath, targetPath);
      moved += 1;
      if (options.failAt === "after_first_quarantine" && moved === 1) {
        throw new Error("failure_injection:after_first_quarantine");
      }
    }
    writeImmutableJson(path.join(transactionPath, "COMMITTED.json"), { gcId, moved }, `gc_commit_collision:${gcId}`);
    if (options.failAt === "after_gc_commit") throw new Error("failure_injection:after_gc_commit");
    fs.rmSync(transactionPath, { recursive: true, force: true });
    const survivingLedger = Object.fromEntries(Object.entries(nextLedger).filter(([relativePath]) => !eligible.includes(relativePath)));
    atomicReplaceBytes(ledgerPath, Buffer.from(`${canonicalWarmachineSearchJson(survivingLedger)}\n`));
    return { removedCount: moved, deferredCount: candidates.length - moved, generation: current.generation, gcId };
  }

  recoverGarbageCollection() {
    const transactionsPath = path.join(this.paths.gc, "transactions");
    if (!fs.existsSync(transactionsPath)) return { restoredCount: 0, completedCount: 0 };
    let restoredCount = 0;
    let completedCount = 0;
    for (const entry of fs.readdirSync(transactionsPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const transactionPath = path.join(transactionsPath, entry.name);
      const manifestPath = path.join(transactionPath, "manifest.json");
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = readJson(manifestPath, `gc-recovery:${entry.name}`);
      if (fs.existsSync(path.join(transactionPath, "COMMITTED.json"))) {
        fs.rmSync(transactionPath, { recursive: true, force: true });
        completedCount += 1;
        continue;
      }
      for (const relativePath of manifest.paths || []) {
        const quarantinedPath = path.join(transactionPath, "quarantine", relativePath);
        if (!fs.existsSync(quarantinedPath)) continue;
        const restoredPath = path.join(this.rootPath, relativePath);
        ensureDirectory(path.dirname(restoredPath));
        if (fs.existsSync(restoredPath)) {
          if (!fileBytesEqual(quarantinedPath, restoredPath)) {
            throw new Error(`gc_restore_collision:${relativePath}`);
          }
          fs.unlinkSync(quarantinedPath);
        } else {
          fs.renameSync(quarantinedPath, restoredPath);
        }
        restoredCount += 1;
      }
      fs.rmSync(transactionPath, { recursive: true, force: true });
    }
    return { restoredCount, completedCount };
  }

  summarize(checkpoint = this.readCurrentCheckpoint()) {
    if (!checkpoint) return null;
    const physicalSizes = Object.fromEntries(WARMACHINE_EXTERNAL_DAG_CONTENT_KINDS.map((kind) => [kind, []]));
    const labelCounts = new Map();
    let liveCanonicalBytes = 0;
    for (const [key, indexId] of Object.entries(checkpoint.indexByPartition || {})) {
      const partition = Number(key.slice(1));
      for (const row of this.#indexRows(partition, indexId)) {
        liveCanonicalBytes += row.canonicalLength;
        const filePath = this.objectPath(row.kind, row.id);
        physicalSizes[row.kind].push(fs.statSync(filePath).size);
        if (row.kind === "label") {
          const stateId = String(this.readContent(row.id).value.stateId || "unbound");
          labelCounts.set(stateId, numeric(labelCounts.get(stateId), 0) + 1);
        }
      }
    }
    const totalPhysicalBytes = directoryBytes(this.rootPath);
    return {
      schemaVersion: "warmachine_external_dag_metrics_v1",
      checkpointId: checkpoint.checkpointId,
      V: numeric(checkpoint.counts?.state, 0),
      G: numeric(checkpoint.stateProposalCount, 0),
      E: numeric(checkpoint.counts?.edge, 0),
      L: numeric(checkpoint.counts?.label, 0),
      C: numeric(checkpoint.counts?.chance, 0),
      U: numeric(checkpoint.counts?.unresolved, 0),
      unresolvedMass: numeric(checkpoint.unresolvedMass, 0),
      objectPhysicalBytes: Object.fromEntries(Object.entries(physicalSizes).map(([kind, values]) => [kind, distribution(values)])),
      labelsPerState: distribution([...labelCounts.values()]),
      liveCanonicalBytes,
      totalPhysicalBytes,
      writeAmplification: totalPhysicalBytes > 0
        ? Number((this.io.bytesWritten / totalPhysicalBytes).toFixed(4))
        : 0,
      canonicalWriteRatio: liveCanonicalBytes > 0
        ? Number((this.io.bytesWritten / liveCanonicalBytes).toFixed(4))
        : 0,
      io: { ...this.io },
      partitionCount: Object.keys(checkpoint.indexByPartition || {}).length,
    };
  }
}

export class WarmachineCandidateSegmentWriter {
  constructor(store, options = {}) {
    this.store = store;
    this.workerId = String(options.workerId || `worker-${process.pid}`);
    this.batchId = String(options.batchId || `batch-${Date.now()}`);
    this.budgets = {
      maxAcceptedRecords: numeric(options.budgets?.maxAcceptedRecords, Number.POSITIVE_INFINITY),
      maxCandidateBytes: numeric(options.budgets?.maxCandidateBytes, Number.POSITIVE_INFINITY),
      maxWallTimeMs: numeric(options.budgets?.maxWallTimeMs, Number.POSITIVE_INFINITY),
      maxLabelsPerState: numeric(options.budgets?.maxLabelsPerState, Number.POSITIVE_INFINITY),
      maxHotMemoryBytes: numeric(options.budgets?.maxHotMemoryBytes, Number.POSITIVE_INFINITY),
      maxDiskBytes: numeric(options.budgets?.maxDiskBytes, Number.POSITIVE_INFINITY),
      minFreeDiskBytes: numeric(options.budgets?.minFreeDiskBytes, 0),
    };
    this.startedAt = performance.now();
    this.initialStoreBytes = Number.isFinite(this.budgets.maxDiskBytes)
      ? directoryBytes(store.rootPath)
      : 0;
    this.acceptedRecords = 0;
    this.recordCount = 0;
    this.bytesWritten = 0;
    this.labelCounts = new Map(Object.entries(options.existingLabelCounts || {}));
    this.unresolved = new Map();
    this.sealed = false;
    ensureDirectory(store.paths.temp);
    this.tempPath = path.join(
      store.paths.temp,
      `candidate-${this.workerId.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}-${this.batchId.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}-${process.pid}.tmp`,
    );
    this.descriptor = fs.openSync(this.tempPath, "wx");
    this.bodyHash = createBodyHasher("warmachine-candidate-segment-body-v1");
    const header = {
      recordType: "header",
      schemaVersion: WARMACHINE_EXTERNAL_DAG_SCHEMAS.candidateSegment,
      hostReceiptHash: store.hostReceiptHash,
      sourceHash: store.sourceHash,
      configHash: store.configHash,
      workerId: this.workerId,
      batchId: this.batchId,
    };
    this.#writeBody(header);
  }

  #writeRaw(value) {
    const line = `${canonicalWarmachineSearchJson(value)}\n`;
    fs.writeSync(this.descriptor, line);
    const bytes = Buffer.byteLength(line);
    this.bytesWritten += bytes;
    return { line, bytes };
  }

  #writeBody(value) {
    const written = this.#writeRaw(value);
    this.bodyHash.update(written.line);
  }

  #budgetReason(kind, identity) {
    if (this.acceptedRecords >= this.budgets.maxAcceptedRecords) return "record_budget_exhausted";
    if (performance.now() - this.startedAt >= this.budgets.maxWallTimeMs) return "time_budget_exhausted";
    if (process.memoryUsage().rss >= this.budgets.maxHotMemoryBytes) return "ram_budget_exhausted";
    if (this.initialStoreBytes + this.bytesWritten + identity.canonicalLength > this.budgets.maxDiskBytes) {
      return "disk_budget_exhausted";
    }
    if (this.bytesWritten + identity.canonicalLength > this.budgets.maxCandidateBytes) {
      return "candidate_segment_budget_exhausted";
    }
    if (this.budgets.minFreeDiskBytes > 0) {
      const stats = fs.statfsSync(this.store.rootPath);
      const freeBytes = Number(stats.bavail) * Number(stats.bsize);
      if (freeBytes < this.budgets.minFreeDiskBytes) return "free_disk_floor_reached";
    }
    if (kind === "label") {
      const stateId = String(parseJson(identity.canonicalBytes, "label-budget").stateId || "unbound");
      if (numeric(this.labelCounts.get(stateId), 0) >= this.budgets.maxLabelsPerState) {
        return "label_budget_exhausted";
      }
    }
    return "";
  }

  #recordUnresolved(reason, options, omittedIdentity) {
    const key = `${reason}\0${String(options.searchContextKey || "")}`;
    const current = this.unresolved.get(key) || {
      reason,
      searchContextKey: String(options.searchContextKey || ""),
      omittedCount: 0,
      mass: 0,
      omittedIds: [],
    };
    current.omittedCount += 1;
    current.mass += unresolvedMass(options);
    if (current.omittedIds.length < 32) current.omittedIds.push(omittedIdentity.id);
    this.unresolved.set(key, current);
  }

  append(kind, payload, options = {}) {
    if (this.sealed) throw new Error("candidate_segment_already_sealed");
    const identity = buildWarmachineExternalDagContentIdentity(kind, payload, {
      hostReceiptHash: this.store.hostReceiptHash,
      schemaVersion: options.schemaVersion,
    });
    const expectedId = String(options.forcedId || identity.id);
    const reason = this.#budgetReason(kind, identity);
    if (reason) {
      this.#recordUnresolved(reason, options, { ...identity, id: expectedId });
      return { accepted: false, unresolvedReason: reason, id: expectedId };
    }
    const record = {
      recordType: "record",
      kind,
      schemaVersion: identity.schemaVersion,
      expectedId,
      forcedId: options.forcedId ? expectedId : "",
      parentStateId: String(options.parentStateId || ""),
      canonicalLength: identity.canonicalLength,
      canonicalDigest: identity.canonicalDigest,
      payloadCodec: "gzip-9-base64",
      payload: zlib.gzipSync(identity.canonicalBytes, { level: 9 }).toString("base64"),
    };
    this.#writeBody(record);
    this.recordCount += 1;
    this.acceptedRecords += 1;
    if (kind === "label") {
      const stateId = String(payload.stateId || "unbound");
      this.labelCounts.set(stateId, numeric(this.labelCounts.get(stateId), 0) + 1);
    }
    return { accepted: true, id: expectedId };
  }

  #appendUnresolvedRecords() {
    for (const aggregate of [...this.unresolved.values()].sort((left, right) =>
      `${left.reason}:${left.searchContextKey}`.localeCompare(`${right.reason}:${right.searchContextKey}`))) {
      const payload = {
        schemaVersion: WARMACHINE_EXTERNAL_DAG_SCHEMAS.unresolved,
        ...aggregate,
        mass: Number(aggregate.mass.toFixed(12)),
      };
      const identity = buildWarmachineExternalDagContentIdentity("unresolved", payload, {
        hostReceiptHash: this.store.hostReceiptHash,
      });
      this.#writeBody({
        recordType: "record",
        kind: "unresolved",
        schemaVersion: identity.schemaVersion,
        expectedId: identity.id,
        forcedId: "",
        parentStateId: "",
        canonicalLength: identity.canonicalLength,
        canonicalDigest: identity.canonicalDigest,
        payloadCodec: "gzip-9-base64",
        payload: zlib.gzipSync(identity.canonicalBytes, { level: 9 }).toString("base64"),
      });
      this.recordCount += 1;
    }
  }

  seal(options = {}) {
    if (this.sealed) throw new Error("candidate_segment_already_sealed");
    this.#appendUnresolvedRecords();
    const contentHash = this.bodyHash.digest("hex");
    const segmentId = artifactIdentity(
      "segment",
      WARMACHINE_EXTERNAL_DAG_SCHEMAS.candidateSegment,
      this.store.hostReceiptHash,
      { contentHash, recordCount: this.recordCount },
    );
    this.#writeRaw({
      recordType: "trailer",
      recordCount: this.recordCount,
      unresolvedCount: this.unresolved.size,
      contentHash,
    });
    fs.fsyncSync(this.descriptor);
    fs.closeSync(this.descriptor);
    this.sealed = true;
    const finalPath = this.store.candidateSegmentPath(segmentId);
    const published = publishImmutableTemp(this.tempPath, finalPath, `candidate_segment_collision:${segmentId}`);
    this.store.io.bytesWritten += published.created ? fs.statSync(finalPath).size : 0;
    const segment = {
      segmentId,
      workerId: this.workerId,
      batchId: this.batchId,
      recordCount: this.recordCount,
      acceptedRecordCount: this.acceptedRecords,
      unresolvedCount: this.unresolved.size,
      contentHash,
      bytes: fs.statSync(finalPath).size,
    };
    this.store.validateCandidateSegment(segmentId);
    if (options.publish !== false) segment.submission = this.store.publishCandidateSegment(segment);
    return segment;
  }
}

export function createWarmachineExternalDagStore(rootPath, options = {}) {
  return new WarmachineExternalDagStore(rootPath, options);
}
