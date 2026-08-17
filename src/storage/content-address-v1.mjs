import { createHash } from "node:crypto";

export const WARMACHINE_EXTERNAL_DAG_SCHEMAS = Object.freeze({
  store: "warmachine_external_dag_store_v1",
  state: "warmachine_external_dag_state_v1",
  edge: "warmachine_external_dag_edge_v1",
  label: "warmachine_external_dag_route_label_v1",
  chance: "warmachine_external_dag_chance_contribution_v1",
  receipt: "warmachine_external_dag_strict_receipt_v1",
  unresolved: "warmachine_external_dag_unresolved_v1",
  candidateSegment: "warmachine_external_dag_candidate_segment_v1",
  exactIndex: "warmachine_external_dag_exact_index_v1",
  merge: "warmachine_external_dag_merge_v1",
  checkpoint: "warmachine_external_dag_checkpoint_v1",
  gc: "warmachine_external_dag_gc_v1",
});

export const WARMACHINE_EXTERNAL_DAG_CONTENT_KINDS = Object.freeze([
  "state",
  "edge",
  "label",
  "chance",
  "receipt",
  "unresolved",
]);

const CONTENT_KIND_SET = new Set(WARMACHINE_EXTERNAL_DAG_CONTENT_KINDS);

function unsupported(path, value) {
  const type = value === null ? "null" : typeof value;
  throw new TypeError(`unsupported_canonical_value:${path || "/"}:${type}`);
}

function normalizeCanonical(value, path, seen, arrayEntry = false) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) unsupported(path, value);
    return Object.is(value, -0) ? 0 : value;
  }
  if (value === undefined) return arrayEntry ? null : undefined;
  if (typeof value !== "object") unsupported(path, value);
  if (seen.has(value)) throw new TypeError(`cyclic_canonical_value:${path || "/"}`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) => normalizeCanonical(entry, `${path}/${index}`, seen, true));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) unsupported(path, value);
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      const entry = normalizeCanonical(value[key], `${path}/${key}`, seen, false);
      if (entry !== undefined) normalized[key] = entry;
    }
    return normalized;
  } finally {
    seen.delete(value);
  }
}

export function canonicalizeWarmachineSearchValue(value) {
  return normalizeCanonical(value, "", new Set(), false);
}

export function canonicalWarmachineSearchJson(value) {
  const normalized = canonicalizeWarmachineSearchValue(value);
  if (normalized === undefined) unsupported("/", value);
  return JSON.stringify(normalized);
}

export function canonicalWarmachineSearchBytes(value) {
  return Buffer.from(canonicalWarmachineSearchJson(value), "utf8");
}

export function digestWarmachineSearchBytes(domain, bytes) {
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return createHash("sha256")
    .update(String(domain))
    .update("\0")
    .update(String(payload.byteLength))
    .update("\0")
    .update(payload)
    .digest("hex");
}

export function assertWarmachineExternalDagContentKind(kind) {
  if (!CONTENT_KIND_SET.has(kind)) throw new TypeError(`unknown_external_dag_content_kind:${kind}`);
  return kind;
}

export function warmachineExternalDagSchemaForKind(kind) {
  assertWarmachineExternalDagContentKind(kind);
  return WARMACHINE_EXTERNAL_DAG_SCHEMAS[kind];
}

export function buildWarmachineExternalDagContentIdentity(kind, payload, options = {}) {
  assertWarmachineExternalDagContentKind(kind);
  const schemaVersion = String(options.schemaVersion || warmachineExternalDagSchemaForKind(kind));
  const hostReceiptHash = String(options.hostReceiptHash || "");
  if (!hostReceiptHash) throw new TypeError(`missing_host_receipt_hash:${kind}`);
  const canonicalBytes = canonicalWarmachineSearchBytes(payload);
  const identityHeader = canonicalWarmachineSearchBytes({
    hostReceiptHash,
    kind,
    schemaVersion,
  });
  const digest = createHash("sha256")
    .update("warmachine-external-dag-content-v1")
    .update("\0")
    .update(identityHeader)
    .update("\0")
    .update(String(canonicalBytes.byteLength))
    .update("\0")
    .update(canonicalBytes)
    .digest("hex");
  return {
    id: `${kind}:${digest}`,
    kind,
    schemaVersion,
    hostReceiptHash,
    canonicalBytes,
    canonicalLength: canonicalBytes.byteLength,
    canonicalDigest: digestWarmachineSearchBytes(`warmachine-${kind}-canonical-v1`, canonicalBytes),
  };
}

export function compareWarmachineCanonicalBytes(left, right) {
  const leftBuffer = Buffer.isBuffer(left) ? left : Buffer.from(left);
  const rightBuffer = Buffer.isBuffer(right) ? right : Buffer.from(right);
  return leftBuffer.byteLength === rightBuffer.byteLength && leftBuffer.equals(rightBuffer);
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameJsonLeaf(left, right) {
  return Object.is(left, right) || (
    typeof left === "number" && typeof right === "number" && left === right
  );
}

export function buildWarmachineStateDelta(beforeValue, afterValue) {
  const before = canonicalizeWarmachineSearchValue(beforeValue);
  const after = canonicalizeWarmachineSearchValue(afterValue);
  const operations = [];

  function visit(left, right, path) {
    if (sameJsonLeaf(left, right)) return;
    if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) {
      for (let index = 0; index < left.length; index += 1) {
        visit(left[index], right[index], [...path, index]);
      }
      return;
    }
    if (plainObject(left) && plainObject(right)) {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      for (const key of keys) {
        if (!(key in right)) {
          operations.push({ op: "delete", path: [...path, key] });
        } else if (!(key in left)) {
          operations.push({ op: "set", path: [...path, key], value: right[key] });
        } else {
          visit(left[key], right[key], [...path, key]);
        }
      }
      return;
    }
    operations.push({ op: "set", path, value: right });
  }

  visit(before, after, []);
  return operations;
}

function cloneCanonical(value) {
  return JSON.parse(canonicalWarmachineSearchJson(value));
}

function assertPatchPath(path) {
  if (!Array.isArray(path)) throw new TypeError("invalid_state_delta_path");
  for (const part of path) {
    if (typeof part !== "string" && !Number.isInteger(part)) {
      throw new TypeError(`invalid_state_delta_path_part:${String(part)}`);
    }
  }
}

export function applyWarmachineStateDelta(beforeValue, operations = []) {
  let result = cloneCanonical(beforeValue);
  for (const operation of operations) {
    assertPatchPath(operation?.path);
    if (!operation || !["set", "delete"].includes(operation.op)) {
      throw new TypeError(`invalid_state_delta_operation:${operation?.op}`);
    }
    if (operation.path.length === 0) {
      if (operation.op === "delete") throw new TypeError("cannot_delete_state_root");
      result = cloneCanonical(operation.value);
      continue;
    }
    let parent = result;
    for (let index = 0; index < operation.path.length - 1; index += 1) {
      const part = operation.path[index];
      if (parent === null || typeof parent !== "object" || !(part in parent)) {
        throw new TypeError(`state_delta_path_missing:${operation.path.slice(0, index + 1).join("/")}`);
      }
      parent = parent[part];
    }
    const leaf = operation.path.at(-1);
    if (operation.op === "delete") {
      if (Array.isArray(parent)) throw new TypeError("state_delta_array_delete_requires_array_replace");
      delete parent[leaf];
    } else {
      parent[leaf] = cloneCanonical(operation.value);
    }
  }
  return canonicalizeWarmachineSearchValue(result);
}
