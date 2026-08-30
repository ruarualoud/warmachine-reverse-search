import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_SEARCH_RUN_CONTRACT_V1_SCHEMA =
  "warmachine_search_run_contract_v1";

const RUNTIME_OPTION_KEYS = new Set([
  "activationResumeCheckpoints",
  "historicalResumeCheckpoint",
  "resumeCheckpoint",
  "resumeCheckpoints",
  "onActivationCheckpoint",
  "onActivationProgress",
  "onCheckpoint",
  "onControlProgress",
  "onCurrentTurnActivationProgress",
  "onProgress",
  "onSearchCheckpoint",
]);

function normalizedOptionValue(value, { root = false } = {}) {
  if (value === undefined || typeof value === "function" ||
      typeof value === "symbol") return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((entry) => normalizedOptionValue(entry))
      .filter((entry) => entry !== undefined);
  }
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !root || !RUNTIME_OPTION_KEYS.has(key))
    .map(([key, entry]) => [key, normalizedOptionValue(entry)])
    .filter(([, entry]) => entry !== undefined));
}

export function normalizeWarmachineSearchRunOptionsV1(rawOptions = {}) {
  return stableGraphValue(normalizedOptionValue(rawOptions, { root: true }));
}

export function buildWarmachineSearchRunContractV1(raw = {}) {
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_SEARCH_RUN_CONTRACT_V1_SCHEMA,
    hostReceiptHash: String(raw.hostReceiptHash || ""),
    searchSourceClosureHash: String(raw.searchSourceClosureHash || ""),
    fixtureHash: String(raw.fixtureHash || ""),
    terminalCellKey: String(raw.terminalCellKey || ""),
    options: normalizeWarmachineSearchRunOptionsV1(raw.options || {}),
  });
  return {
    ...core,
    searchRunContractHash: stableGraphHash(core),
  };
}
