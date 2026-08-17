import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  auditRulesV1StaticPlacement,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { generateWarmachineTerminalEventPredecessorsV1 } from
  "../reverse/terminal-event-predecessor-v1.mjs";
import {
  auditWarmachineSearchConsolePresetReferenceV1,
  findWarmachineSearchConsolePresetV1,
} from
  "./search-console-presets-v1.mjs";

export const WARMACHINE_SEARCH_CONSOLE_EVENT_V1_SCHEMA =
  "warmachine_search_console_event_v1";
export const WARMACHINE_SEARCH_CONSOLE_SEED_V1_SCHEMA =
  "warmachine_search_console_seed_v1";

export const WARMACHINE_SEARCH_CONSOLE_EVENT_TYPES = Object.freeze([
  "session_created",
  "seed_validation_started",
  "seed_validated",
  "seed_rejected",
  "search_started",
  "search_paused",
  "search_resumed",
  "search_cancelled",
  "search_interrupted",
  "search_progress",
  "root_materialized",
  "node_discovered",
  "strict_edge_certified",
  "strict_edge_rejected",
  "branch_deferred",
  "result_published",
  "search_completed",
  "search_failed",
]);

const EVENT_TYPES = new Set(WARMACHINE_SEARCH_CONSOLE_EVENT_TYPES);
const COMMAND_STATES = Object.freeze({
  start: new Set(["ready", "completed", "cancelled", "failed", "interrupted"]),
  pause: new Set(["running"]),
  resume: new Set(["paused"]),
  cancel: new Set(["running", "paused"]),
});
const FORBIDDEN_ORACLE_KEYS = new Set([
  "forwardOracle",
  "forwardRoute",
  "opening",
  "openingState",
  "intermediateState",
  "intermediateStates",
  "strictReceipts",
]);

function collectForbiddenOraclePaths(value, path = "seed", output = []) {
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_ORACLE_KEYS.has(key)) output.push(childPath);
    collectForbiddenOraclePaths(child, childPath, output);
  }
  return output;
}

function normalizePresetSeed(rawSeed = {}) {
  const goalType = String(rawSeed.goalType || "assassination");
  if (!["assassination", "scenario_score"].includes(goalType)) {
    throw new Error(`search_console_seed_goal_invalid:${goalType}`);
  }
  const presetKey = String(rawSeed.presetKey ||
    (goalType === "assassination" ? "fixed-cryx-fane-assassination" :
      "fixed-cryx-fane-score"));
  const preset = findWarmachineSearchConsolePresetV1(presetKey)?.victorySeed || null;
  const anchorKey = String(rawSeed.anchorKey || preset?.anchors?.[0]?.anchorKey ||
    (goalType === "assassination"
      ? "round-three-west-lower-objective-flank"
      : "round-three-left-50-outer"));
  const defaultRandomSeed = goalType === "assassination"
    ? "fixed-terminal-position-domain-v1"
    : "fixed-terminal-score-position-domain-v1";
  return stableGraphValue({
    schemaVersion: WARMACHINE_SEARCH_CONSOLE_SEED_V1_SCHEMA,
    seedKind: "preset_reference",
    provenance: "user_injected",
    presetKey,
    scenarioKey: String(rawSeed.scenarioKey || "two-fronts"),
    goalType,
    roundNumber: Number(rawSeed.roundNumber || preset?.roundNumber || 3),
    anchorKey,
    randomSeed: String(rawSeed.randomSeed || preset?.randomSeed || defaultRandomSeed),
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    trainingTruth: false,
  });
}

function normalizeExactSeed(rawSeed = {}) {
  const terminalState = normalizeRulesV1State(rawSeed.terminalState || {});
  const terminalCell = stableGraphValue(rawSeed.terminalCell || {});
  return stableGraphValue({
    schemaVersion: WARMACHINE_SEARCH_CONSOLE_SEED_V1_SCHEMA,
    seedKind: "exact_terminal_root",
    provenance: "user_injected",
    scenarioKey: String(rawSeed.scenarioKey || terminalCell.scenarioKey || ""),
    goalType: String(rawSeed.goalType || terminalCell.goalType || ""),
    roundNumber: Number(rawSeed.roundNumber || terminalCell.roundNumber ||
      terminalState.turnNumber || 0),
    anchorKey: String(rawSeed.anchorKey || "user-exact-terminal-root"),
    hostReceiptHash: String(rawSeed.hostReceiptHash || terminalCell.hostReceiptHash || ""),
    terminalState,
    terminalCell,
    deployments: stableGraphValue(rawSeed.deployments || {}),
    terminalEventOptions: stableGraphValue(rawSeed.terminalEventOptions || {}),
    trainingTruth: false,
  });
}

export function normalizeWarmachineSearchConsoleSeedV1(rawSeed = {}) {
  const kind = String(rawSeed.seedKind || "preset_reference");
  if (kind === "preset_reference") return normalizePresetSeed(rawSeed);
  if (kind === "exact_terminal_root") return normalizeExactSeed(rawSeed);
  throw new Error(`search_console_seed_kind_invalid:${kind}`);
}

export function validateWarmachineSearchConsoleSeedV1(rawSeed = {}) {
  const forbiddenOraclePaths = collectForbiddenOraclePaths(rawSeed);
  let seed;
  try {
    seed = normalizeWarmachineSearchConsoleSeedV1(rawSeed);
  } catch (error) {
    return {
      ok: false,
      seed: null,
      issues: [String(error?.message || error)],
      strictCertified: false,
      trainingTruth: false,
    };
  }
  const issues = [];
  if (forbiddenOraclePaths.length) issues.push("search_console_seed_contains_forward_oracle");
  if (seed.roundNumber < 1 || seed.roundNumber > 7) {
    issues.push("search_console_seed_round_out_of_bounds");
  }
  if (!seed.scenarioKey) issues.push("search_console_seed_scenario_required");
  if (!["assassination", "scenario_score"].includes(seed.goalType)) {
    issues.push("search_console_seed_goal_invalid");
  }
  if (seed.seedKind === "preset_reference") {
    issues.push(...auditWarmachineSearchConsolePresetReferenceV1(seed).issues);
  }
  let materialization = null;
  if (seed.seedKind === "exact_terminal_root") {
    if (seed.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
      issues.push("search_console_seed_host_receipt_mismatch");
    }
    if (seed.terminalState.strictMode !== true ||
        seed.terminalState.enforceStrictExecutor !== true) {
      issues.push("search_console_seed_strict_state_required");
    }
    if (seed.terminalCell.goalType !== seed.goalType ||
        Number(seed.terminalCell.roundNumber) !== seed.roundNumber) {
      issues.push("search_console_seed_terminal_cell_binding_mismatch");
    }
    const placement = auditRulesV1StaticPlacement(seed.terminalState);
    if (!placement.ok) issues.push("search_console_seed_static_placement_rejected");
    if (!issues.length) {
      try {
        const terminal = generateWarmachineTerminalEventPredecessorsV1(
          seed.terminalState,
          seed.terminalCell,
          seed.terminalEventOptions,
        );
        materialization = {
          strictCandidateCount: terminal.strictCandidateCount,
          strictRejectedCount: terminal.strictRejectedCount,
          unresolvedCount: terminal.unresolvedCount,
          successorSemanticHash: terminal.successorSemanticHash,
          oracleIsolationAudit: terminal.oracleIsolationAudit,
        };
        if (terminal.strictCandidateCount < 1) {
          issues.push("search_console_seed_terminal_inverse_has_no_strict_candidate");
        }
        if (terminal.oracleIsolationAudit?.passed !== true) {
          issues.push("search_console_seed_oracle_isolation_failed");
        }
      } catch (error) {
        issues.push(`search_console_seed_terminal_validation_failed:${error?.message || error}`);
      }
    }
  }
  const normalizedSeed = {
    ...seed,
    seedKey: `search-console-seed-${stableGraphHash(seed, 32)}`,
  };
  return stableGraphValue({
    ok: issues.length === 0,
    seed: normalizedSeed,
    issues,
    forbiddenOraclePaths,
    strictCertified: seed.seedKind === "exact_terminal_root" && issues.length === 0,
    presetMaterializationPending: seed.seedKind === "preset_reference" && issues.length === 0,
    materialization,
    trainingTruth: false,
  });
}

export function assertWarmachineSearchConsoleCommandV1(commandType, sessionState) {
  const type = String(commandType || "");
  const allowed = COMMAND_STATES[type];
  if (!allowed) throw new Error(`search_console_command_unknown:${type}`);
  if (!allowed.has(String(sessionState || ""))) {
    throw new Error(`search_console_command_state_invalid:${type}:${sessionState}`);
  }
  return true;
}

export function createWarmachineSearchConsoleEventV1(rawEvent = {}) {
  const eventType = String(rawEvent.eventType || "");
  if (!EVENT_TYPES.has(eventType)) {
    throw new Error(`search_console_event_type_invalid:${eventType}`);
  }
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_SEARCH_CONSOLE_EVENT_V1_SCHEMA,
    sessionId: String(rawEvent.sessionId || ""),
    sequence: Number(rawEvent.sequence || 0),
    eventType,
    occurredAt: String(rawEvent.occurredAt || new Date().toISOString()),
    state: String(rawEvent.state || ""),
    payload: stableGraphValue(rawEvent.payload || {}),
  });
  if (!core.sessionId || !Number.isInteger(core.sequence) || core.sequence < 1) {
    throw new Error("search_console_event_identity_invalid");
  }
  return {
    ...core,
    eventId: `search-console-event-${stableGraphHash(core, 32)}`,
  };
}
