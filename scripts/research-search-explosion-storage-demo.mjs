import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import zlib from "node:zlib";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const SCHEMA_VERSION = "warmachine_search_explosion_storage_research_v1";

function byteLength(value) {
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value));
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map((entry) => canonicalValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonicalValue(value[key])]));
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function digest(domain, payload) {
  return createHash("sha256").update(`${domain}\0${payload}`).digest("hex");
}

function gzip(payload) {
  return zlib.gzipSync(payload, { level: 9 });
}

function openDatabase(databasePath) {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA busy_timeout = 15000");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = FULL");
  return database;
}

function createSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS states (
      state_id TEXT PRIMARY KEY,
      canonical_hash TEXT NOT NULL,
      canonical_bytes INTEGER NOT NULL,
      codec TEXT NOT NULL,
      payload BLOB NOT NULL,
      host_receipt_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS edges (
      edge_id TEXT PRIMARY KEY,
      from_state_id TEXT NOT NULL,
      to_state_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      payload BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS route_labels (
      route_id TEXT PRIMARY KEY,
      proof_suffix_id TEXT NOT NULL,
      edge_id TEXT NOT NULL,
      chance_event_id TEXT NOT NULL,
      outcome_key TEXT NOT NULL,
      probability_numerator INTEGER NOT NULL,
      probability_denominator INTEGER NOT NULL,
      resolution_status TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS checkpoints (
      checkpoint_id TEXT PRIMARY KEY,
      host_receipt_hash TEXT NOT NULL,
      committed_route_count INTEGER NOT NULL,
      manifest TEXT NOT NULL
    );
  `);
}

function bindHostReceipt(database, receiptHash) {
  const existing = database.prepare("SELECT value FROM metadata WHERE key = 'host_receipt_hash'").get();
  if (!existing) {
    database.prepare("INSERT INTO metadata(key, value) VALUES ('host_receipt_hash', ?)").run(receiptHash);
    return;
  }
  if (existing.value !== receiptHash) {
    throw new Error(`host_receipt_drift:${existing.value}:${receiptHash}`);
  }
}

function insertState(database, canonicalPayload, receiptHash, forcedStateId = "") {
  const canonicalHash = digest("canonical-rules-state", canonicalPayload);
  const stateId = forcedStateId || `state:${canonicalHash}`;
  database.prepare(`
    INSERT OR IGNORE INTO states(
      state_id, canonical_hash, canonical_bytes, codec, payload, host_receipt_hash
    ) VALUES (?, ?, ?, 'gzip-9', ?, ?)
  `).run(stateId, canonicalHash, byteLength(canonicalPayload), gzip(canonicalPayload), receiptHash);
  const existing = database.prepare(`
    SELECT canonical_hash, canonical_bytes, codec, payload, host_receipt_hash
    FROM states WHERE state_id = ?
  `).get(stateId);
  const existingPayload = zlib.gunzipSync(Buffer.from(existing.payload)).toString("utf8");
  if (
    existing.canonical_hash !== canonicalHash ||
    existing.canonical_bytes !== byteLength(canonicalPayload) ||
    existing.codec !== "gzip-9" ||
    existing.host_receipt_hash !== receiptHash ||
    existingPayload !== canonicalPayload
  ) {
    throw new Error(`content_address_collision_or_receipt_mismatch:${stateId}`);
  }
  return stateId;
}

function insertEdge(database, edge) {
  const payload = canonicalJson(edge);
  const payloadHash = digest("strict-search-edge", payload);
  const edgeId = `edge:${payloadHash}`;
  database.prepare(`
    INSERT OR IGNORE INTO edges(edge_id, from_state_id, to_state_id, payload_hash, payload)
    VALUES (?, ?, ?, ?, ?)
  `).run(edgeId, edge.fromStateId, edge.toStateId, payloadHash, gzip(payload));
  const existing = database.prepare("SELECT payload_hash, payload FROM edges WHERE edge_id = ?").get(edgeId);
  const existingPayload = zlib.gunzipSync(Buffer.from(existing.payload)).toString("utf8");
  if (existing.payload_hash !== payloadHash || existingPayload !== payload) {
    throw new Error(`edge_content_collision:${edgeId}`);
  }
  return edgeId;
}

function routeRow(label) {
  const payload = canonicalJson(label);
  return {
    routeId: `route:${digest("route-label", payload)}`,
    proofSuffixId: label.terminalProofSuffix.proofSuffixId,
    edgeId: label.edgeIds[0],
    chanceEventId: label.chance.eventId,
    outcomeKey: label.chance.outcomeKey,
    probabilityNumerator: label.chance.probabilityNumerator,
    probabilityDenominator: label.chance.probabilityDenominator,
    resolutionStatus: label.chance.resolutionStatus,
    payloadHash: digest("route-label-payload", payload),
    payload,
  };
}

function insertRouteRows(database, rows, checkpoint = null) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const insert = database.prepare(`
      INSERT OR IGNORE INTO route_labels(
        route_id, proof_suffix_id, edge_id, chance_event_id, outcome_key,
        probability_numerator, probability_denominator, resolution_status,
        payload_hash, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const select = database.prepare("SELECT payload_hash, payload FROM route_labels WHERE route_id = ?");
    for (const row of rows) {
      insert.run(
        row.routeId,
        row.proofSuffixId,
        row.edgeId,
        row.chanceEventId,
        row.outcomeKey,
        row.probabilityNumerator,
        row.probabilityDenominator,
        row.resolutionStatus,
        row.payloadHash,
        row.payload,
      );
      const existing = select.get(row.routeId);
      if (existing.payload_hash !== row.payloadHash || existing.payload !== row.payload) {
        throw new Error(`route_idempotency_conflict:${row.routeId}`);
      }
    }
    if (checkpoint) {
      database.prepare(`
        INSERT OR REPLACE INTO checkpoints(
          checkpoint_id, host_receipt_hash, committed_route_count, manifest
        ) VALUES (?, ?, ?, ?)
      `).run(
        checkpoint.checkpointId,
        checkpoint.hostReceiptHash,
        checkpoint.committedRouteCount,
        canonicalJson(checkpoint.manifest),
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

async function insertRowsWithRetry(databasePath, rows) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const database = openDatabase(databasePath);
    try {
      insertRouteRows(database, rows);
      database.close();
      return;
    } catch (error) {
      lastError = error;
      database.close();
      if (!String(error?.message || error).includes("BUSY")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function workerMain() {
  if (workerData.mode === "duplicate-writer") {
    await insertRowsWithRetry(workerData.databasePath, workerData.rows);
    parentPort.postMessage({ ok: true });
    return;
  }
  if (workerData.mode === "uncommitted-crash-writer") {
    const database = openDatabase(workerData.databasePath);
    database.exec("BEGIN IMMEDIATE");
    const row = workerData.row;
    database.prepare(`
      INSERT INTO route_labels(
        route_id, proof_suffix_id, edge_id, chance_event_id, outcome_key,
        probability_numerator, probability_denominator, resolution_status,
        payload_hash, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.routeId,
      row.proofSuffixId,
      row.edgeId,
      row.chanceEventId,
      row.outcomeKey,
      row.probabilityNumerator,
      row.probabilityDenominator,
      row.resolutionStatus,
      row.payloadHash,
      row.payload,
    );
    parentPort.postMessage({ uncommitted: true });
    await new Promise(() => {});
  }
  throw new Error(`unknown_worker_mode:${workerData.mode}`);
}

function runWorker(workerOptions, expectedMessageKey = "ok") {
  return new Promise((resolve, reject) => {
    const worker = new Worker(SCRIPT_PATH, { workerData: workerOptions });
    worker.once("error", reject);
    worker.once("message", (message) => {
      if (!message?.[expectedMessageKey]) {
        reject(new Error(`unexpected_worker_message:${JSON.stringify(message)}`));
        return;
      }
      resolve({ worker, message });
    });
  });
}

function leafDiff(before, after) {
  const changes = [];
  function visit(left, right, pathParts) {
    if (Object.is(left, right)) return;
    if (
      left && right &&
      typeof left === "object" && typeof right === "object" &&
      Array.isArray(left) === Array.isArray(right)
    ) {
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      for (const key of keys) visit(left[key], right[key], [...pathParts, key]);
      return;
    }
    changes.push({ path: pathParts.join("/"), before: left, after: right });
  }
  visit(before, after, []);
  return changes;
}

function tableCount(database, table) {
  return Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}

function chanceMassByProof(database) {
  const rows = database.prepare(`
    SELECT proof_suffix_id, resolution_status,
      SUM(CAST(probability_numerator AS REAL) / probability_denominator) AS mass
    FROM route_labels
    GROUP BY proof_suffix_id, resolution_status
    ORDER BY proof_suffix_id, resolution_status
  `).all();
  return rows.map((row) => ({
    proofSuffixId: row.proof_suffix_id,
    resolutionStatus: row.resolution_status,
    mass: Number(row.mass.toFixed(6)),
  }));
}

function representationCapacity({ stateBytes, edgeBytes, labelBytes, routeCount }) {
  const fullJsonTreeBytes = routeCount * ((stateBytes * 2) + edgeBytes + labelBytes);
  const inMemoryDagBytes = (stateBytes * 2) + edgeBytes + (routeCount * labelBytes);
  return {
    fullJsonTreeBytes,
    inMemoryDagBytes,
    logicalReductionRatio: Number((fullJsonTreeBytes / inMemoryDagBytes).toFixed(3)),
  };
}

function projectedCapacity(diskGiB, writeAmplification = 4) {
  const bytesPerUniqueState = 1024;
  const retainedEdgesPerState = 2.5;
  const bytesPerEdge = 8192;
  const labelsPerState = 2;
  const bytesPerLabel = 2048;
  const liveBytesPerState = bytesPerUniqueState +
    (retainedEdgesPerState * bytesPerEdge) +
    (labelsPerState * bytesPerLabel);
  const diskBytes = diskGiB * (1024 ** 3);
  return {
    diskGiB,
    conservativeInputs: {
      bytesPerUniqueState,
      retainedEdgesPerState,
      bytesPerEdge,
      labelsPerState,
      bytesPerLabel,
      writeAmplification,
    },
    liveBytesPerState,
    estimatedLiveUniqueStates: Math.floor(diskBytes / liveBytesPerState),
    estimatedSafeUniqueStatesDuringCompaction: Math.floor(
      diskBytes / (liveBytesPerState * writeAmplification),
    ),
  };
}

async function main() {
  const hostRuntime = await import("../src/warmachine-host-runtime.mjs");
  const lazyRuntime = await import("../src/search/lazy-action-cursor-v1.mjs");
  const {
    applyRulesV1Action,
    buildWarmachineRulesV1ActionWithStrictRngOutcome,
    buildWarmachineRulesV1StateFromLayer3Room,
    enumerateRulesV1Actions,
    resolveWarmachineHostPath,
    warmachineHost,
  } = hostRuntime;

  const roomPath = resolveWarmachineHostPath(
    "build/warmachine-ai/sepsira-swarm-vs-fane-v20260805/strict-construction-search-v2/deep/" +
    "cryx-recursion-screen-fane-ashmael-scenario-blender-balanced-collision-player1-e4937ca7b578/" +
    "input-room-store.tmp.json",
  );
  const reportPath = resolveWarmachineHostPath(
    "build/warmachine-ai/sepsira-swarm-vs-fane-v20260805/strict-construction-search-v2/shallow/" +
    "cryx-recursion-screen-fane-ashmael-scenario-blender-balanced-collision-player1-e4937ca7b578/" +
    "report.json",
  );
  const store = JSON.parse(fs.readFileSync(roomPath, "utf8"));
  const room = Object.values(store.roomsById || {})[0];
  const initial = buildWarmachineRulesV1StateFromLayer3Room(room, {
    strictMode: true,
    enforceStrictExecutor: true,
  });
  const plan = lazyRuntime.buildWarmachineLazyActionCursorPlan(initial);
  const actorGroup = plan.groups[0];
  const enumeration = enumerateRulesV1Actions(initial, { actorPieceKeys: actorGroup.actorPieceKeys });
  const selectedAction = enumeration.actions[0];
  const strictAction = {
    ...buildWarmachineRulesV1ActionWithStrictRngOutcome(selectedAction, {
      room: {
        id: "search-explosion-storage-research",
        game: {
          round: enumeration.state.turnNumber,
          turnNumber: enumeration.state.turnNumber,
          activeSideKey: enumeration.state.activeSideKey,
        },
      },
      sourceContext: {
        rulesV1State: enumeration.state,
        rulesV1Enumeration: enumeration,
      },
      selectedActionKey: selectedAction.actionKey,
    }),
    __warmachineTrustedRulesV1Enumeration: enumeration,
  };
  const transition = applyRulesV1Action(enumeration.state, strictAction);
  assert.equal(transition.ok, true);
  const persistedAction = { ...strictAction };
  delete persistedAction.__warmachineTrustedRulesV1Enumeration;
  const receipt = {
    schemaVersion: "warmachine_strict_edge_receipt_research_v1",
    hostReceipt: warmachineHost.receipt,
    ok: transition.ok,
    rulesVersion: transition.rulesVersion,
    actionKey: selectedAction.actionKey,
    events: transition.events || [],
    quality: transition.quality || null,
  };
  const initialCanonical = canonicalJson(enumeration.state);
  const nextCanonical = canonicalJson(transition.nextState);
  const actionCanonical = canonicalJson(persistedAction);
  const receiptCanonical = canonicalJson(receipt);
  const changes = leafDiff(enumeration.state, transition.nextState);
  const patchCanonical = canonicalJson(changes);
  const historicalReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const historicalStep = historicalReport.search.principalVariation[0];

  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "warmachine-storage-research-"));
  const databasePath = path.join(tempDirectory, "graph.sqlite");
  const receiptHash = warmachineHost.receipt.receiptHash;
  let database = openDatabase(databasePath);
  createSchema(database);
  bindHostReceipt(database, receiptHash);
  const initialStateId = insertState(database, initialCanonical, receiptHash);
  const nextStateId = insertState(database, nextCanonical, receiptHash);
  const edgeId = insertEdge(database, {
    schemaVersion: "warmachine_strict_search_edge_research_v1",
    fromStateId: initialStateId,
    toStateId: nextStateId,
    action: persistedAction,
    receipt,
  });

  const outcomes = [
    { outcomeKey: "d6-1", numerator: 1, denominator: 6, status: "resolved" },
    { outcomeKey: "d6-2-3", numerator: 2, denominator: 6, status: "resolved" },
    { outcomeKey: "d6-4-5", numerator: 2, denominator: 6, status: "unresolved" },
    { outcomeKey: "d6-6", numerator: 1, denominator: 6, status: "resolved" },
  ];
  const proofSuffixes = [
    { proofSuffixId: "assassination-suffix-a", terminalKind: "assassination" },
    { proofSuffixId: "score-suffix-b", terminalKind: "scenario_score" },
  ];
  const labels = proofSuffixes.flatMap((suffix, suffixIndex) => outcomes.map((outcome) => ({
    schemaVersion: "warmachine_route_label_research_v1",
    searchContextKey: `steamroller-2026:two-fronts:mode-${suffixIndex}`,
    stateId: nextStateId,
    edgeIds: [edgeId],
    terminalProofSuffix: {
      ...suffix,
      victoryRelativeLayer: 0,
      absoluteRound: suffixIndex + 3,
    },
    chance: {
      eventId: `${suffix.proofSuffixId}:movement-event`,
      outcomeKey: outcome.outcomeKey,
      probabilityNumerator: outcome.numerator,
      probabilityDenominator: outcome.denominator,
      resolutionStatus: outcome.status,
    },
    paretoCost: {
      actionCount: suffixIndex + 1,
      resourceSpent: suffixIndex,
      modelPointsExchanged: suffixIndex * 3,
    },
    deliberateExchange: suffixIndex === 1 ? ["mechanithrall-screen-for-zone-tempo"] : [],
    intent: suffix.terminalKind === "assassination" ? "open-leader-lane" : "hold-score-lead",
    trainingProvenance: {
      source: "storage-research-only",
      trainingTruth: false,
      strictReceiptHash: digest("strict-receipt", receiptCanonical),
    },
  })));
  const rows = labels.map((label) => routeRow(label));

  insertRouteRows(database, rows.slice(0, rows.length / 2), {
    checkpointId: "checkpoint-phase-1",
    hostReceiptHash: receiptHash,
    committedRouteCount: rows.length / 2,
    manifest: { phase: 1, routeIds: rows.slice(0, rows.length / 2).map((row) => row.routeId) },
  });
  database.close();

  database = openDatabase(databasePath);
  createSchema(database);
  bindHostReceipt(database, receiptHash);
  assert.equal(tableCount(database, "route_labels"), rows.length / 2);
  database.close();

  const duplicateWorkers = await Promise.all([
    runWorker({ mode: "duplicate-writer", databasePath, rows }),
    runWorker({ mode: "duplicate-writer", databasePath, rows: [...rows].reverse() }),
  ]);
  await Promise.all(duplicateWorkers.map(({ worker }) => worker.terminate()));

  const phantom = routeRow({
    ...labels[0],
    terminalProofSuffix: {
      ...labels[0].terminalProofSuffix,
      proofSuffixId: "uncommitted-crash-phantom",
    },
  });
  const crashWorkerResult = await runWorker({
    mode: "uncommitted-crash-writer",
    databasePath,
    row: phantom,
  }, "uncommitted");
  await crashWorkerResult.worker.terminate();

  database = openDatabase(databasePath);
  createSchema(database);
  bindHostReceipt(database, receiptHash);
  assert.equal(tableCount(database, "states"), 2);
  assert.equal(tableCount(database, "edges"), 1);
  assert.equal(tableCount(database, "route_labels"), rows.length);
  assert.equal(
    Number(database.prepare("SELECT COUNT(*) AS count FROM route_labels WHERE route_id = ?").get(phantom.routeId).count),
    0,
  );

  const persistedLabels = database.prepare("SELECT payload FROM route_labels ORDER BY route_id").all()
    .map((row) => JSON.parse(row.payload));
  const expectedPersistedLabels = [...rows]
    .sort((left, right) => left.routeId.localeCompare(right.routeId))
    .map((row) => JSON.parse(row.payload));
  const expectedSemanticDigest = digest("semantic-route-set", canonicalJson(expectedPersistedLabels));
  const actualSemanticDigest = digest("semantic-route-set", canonicalJson(persistedLabels));
  assert.equal(actualSemanticDigest, expectedSemanticDigest);
  const probabilityMass = chanceMassByProof(database);
  for (const suffix of proofSuffixes) {
    const total = probabilityMass
      .filter((row) => row.proofSuffixId === suffix.proofSuffixId)
      .reduce((sum, row) => sum + row.mass, 0);
    assert.equal(Number(total.toFixed(6)), 1);
  }

  let collisionFailClosed = false;
  try {
    insertState(database, `${initialCanonical} `, receiptHash, initialStateId);
  } catch (error) {
    collisionFailClosed = String(error.message).startsWith("content_address_collision_or_receipt_mismatch");
  }
  assert.equal(collisionFailClosed, true);

  let receiptDriftFailClosed = false;
  try {
    bindHostReceipt(database, `drifted-${receiptHash}`);
  } catch (error) {
    receiptDriftFailClosed = String(error.message).startsWith("host_receipt_drift");
  }
  assert.equal(receiptDriftFailClosed, true);

  const orphanStateId = insertState(database, canonicalJson({ orphan: true }), receiptHash);
  const stateCountBeforeGc = tableCount(database, "states");
  database.prepare(`
    DELETE FROM states
    WHERE state_id NOT IN (
      SELECT from_state_id FROM edges WHERE edge_id IN (SELECT edge_id FROM route_labels)
      UNION
      SELECT to_state_id FROM edges WHERE edge_id IN (SELECT edge_id FROM route_labels)
    )
  `).run();
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM states WHERE state_id = ?").get(orphanStateId).count, 0);
  const stateCountAfterGc = tableCount(database, "states");
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  database.close();

  const stateBytes = byteLength(initialCanonical);
  const edgeBytes = byteLength(actionCanonical) + byteLength(receiptCanonical);
  const labelBytes = Math.ceil(rows.reduce((sum, row) => sum + byteLength(row.payload), 0) / rows.length);
  const representations = representationCapacity({
    stateBytes,
    edgeBytes,
    labelBytes,
    routeCount: rows.length,
  });
  const databaseBytes = fs.statSync(databasePath).size;
  const filesystem = fs.statfsSync(REPOSITORY_ROOT);
  const availableDiskBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
  const result = {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    researchOnly: true,
    productionReady: false,
    generatedAt: new Date().toISOString(),
    hostReceipt: warmachineHost.receipt,
    fixture: {
      roomPath,
      reportPath,
      modelCount: enumeration.state.pieces.length,
      topLevelStateKeyCount: Object.keys(enumeration.state).length,
      activationGroupCount: plan.groupCount,
      sampledActivationGroupKey: actorGroup.groupKey,
      sampledLegalActionCount: enumeration.actions.length,
      sampledRejectedActionCount: (enumeration.rejectedActions || []).length,
      sampledActionType: selectedAction.actionType,
      historicalPrincipalVariationStepBytes: byteLength(historicalStep),
    },
    measuredBytes: {
      canonicalState: byteLength(initialCanonical),
      canonicalStateGzip9: gzip(initialCanonical).byteLength,
      nextCanonicalState: byteLength(nextCanonical),
      nextCanonicalStateGzip9: gzip(nextCanonical).byteLength,
      persistedStrictAction: byteLength(actionCanonical),
      persistedStrictActionGzip9: gzip(actionCanonical).byteLength,
      strictReceipt: byteLength(receiptCanonical),
      strictReceiptGzip9: gzip(receiptCanonical).byteLength,
      routeLabelMean: labelBytes,
      routeLabelSetGzip9: gzip(canonicalJson(labels)).byteLength,
      leafDelta: byteLength(patchCanonical),
      leafDeltaGzip9: gzip(patchCanonical).byteLength,
      externalDatabaseAfterCheckpointAndGc: databaseBytes,
    },
    leafDelta: {
      changedLeafCount: changes.length,
      changedPaths: changes.map((change) => change.path),
    },
    representations: {
      ...representations,
      externalDatabaseBytes: databaseBytes,
      externalVsFullTreeReductionRatio: Number(
        (representations.fullJsonTreeBytes / databaseBytes).toFixed(3),
      ),
      semanticDigestEqual: actualSemanticDigest === expectedSemanticDigest,
    },
    correctnessChecks: {
      uniqueStateCount: stateCountAfterGc,
      uniqueEdgeCount: 1,
      routeLabelCount: rows.length,
      duplicateWorkerSubmissionCount: rows.length * 2,
      uncommittedCrashRowRolledBack: true,
      collisionFailClosed,
      hostReceiptDriftFailClosed: receiptDriftFailClosed,
      orphanStateGarbageCollected: stateCountBeforeGc - stateCountAfterGc === 1,
      probabilityMass,
      terminalSuffixIds: proofSuffixes.map((suffix) => suffix.proofSuffixId),
      deliberateExchangePreserved: persistedLabels.some((label) => label.deliberateExchange.length > 0),
      intentPreserved: persistedLabels.every((label) => Boolean(label.intent)),
      trainingProvenancePreserved: persistedLabels.every((label) => Boolean(label.trainingProvenance?.source)),
    },
    capacityBudgets: {
      availableDiskGiBAtMeasurement: Number((availableDiskBytes / (1024 ** 3)).toFixed(2)),
      localMicroFixture: {
        hotRamMiB: 512,
        diskGiB: 2,
        immutableSegmentMiB: 64,
        abortWhenFreeDiskBelowGiB: 20,
        projection: projectedCapacity(2),
      },
      localCryxFane: {
        hotRamMiB: 1024,
        diskGiB: 8,
        immutableSegmentMiB: 128,
        abortWhenFreeDiskBelowGiB: 20,
        projection: projectedCapacity(8),
      },
      provisionedServerTarget: {
        hotRamMiB: 4096,
        diskGiB: 256,
        immutableSegmentMiB: 256,
        projection: projectedCapacity(256),
      },
    },
    caveats: [
      "The Host receipt is dirty and all measurements are valid only for the recorded hashes.",
      "The leaf-delta sample contains one strict transition and is not a production percentile estimate.",
      "SQLite is the finite transactional demo, not the chosen large-scale DDD segment implementation.",
      "Capacity projections are conservative planning inputs and must be recalibrated from multi-layer traces.",
    ],
  };

  const outputFlagIndex = process.argv.indexOf("--output");
  if (outputFlagIndex >= 0 && process.argv[outputFlagIndex + 1]) {
    const outputPath = path.resolve(process.cwd(), process.argv[outputFlagIndex + 1]);
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  fs.rmSync(tempDirectory, { recursive: true, force: true });
  console.log(JSON.stringify(result, null, 2));
}

if (isMainThread) {
  await main();
} else {
  await workerMain();
}
