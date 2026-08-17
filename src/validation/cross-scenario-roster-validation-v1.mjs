import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_CROSS_SCENARIO_ROSTER_VALIDATION_V1_SCHEMA =
  "warmachine_cross_scenario_roster_validation_v1";

export const WARMACHINE_CROSS_SCENARIO_KEYS_V1 = Object.freeze([
  "trench_warfare",
  "two_fronts",
  "wolves_at_our_heels",
  "pressure_point",
  "high_stakes",
  "fault_line",
  "payload",
]);

export const WARMACHINE_CROSS_SCENARIO_TERMINAL_GOAL_KEYS_V1 = Object.freeze([
  "assassination",
  "scenario_score",
]);

const FIRST_PLAYER_SIDE_KEYS = Object.freeze(["player1", "player2"]);
const PUBLISHED_DISPOSITIONS = new Set([
  "strict_materialized",
  "strict_rejected",
  "inverse_unresolved",
]);

function countBy(rows = [], keyFn = () => "") {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right)));
}

function normalizeRosterDomain(domain = {}, hostReceiptHash = "") {
  const normalized = stableGraphValue({
    rosterDomainKey: String(domain.rosterDomainKey || ""),
    witnessHash: String(domain.witnessHash || ""),
    hostReceiptHash: String(domain.hostReceiptHash || ""),
    rosterKeys: [...new Set((domain.rosterKeys || []).map(String).filter(Boolean))].sort(),
    leaderNames: [...new Set((domain.leaderNames || []).map(String).filter(Boolean))].sort(),
    resourceKinds: [...new Set((domain.resourceKinds || []).map(String).filter(Boolean))].sort(),
    resourceProfiles: [...new Set(
      (domain.resourceProfiles || []).map(String).filter(Boolean),
    )].sort(),
    modelOrganizationKinds: [...new Set(
      (domain.modelOrganizationKinds || []).map(String).filter(Boolean),
    )].sort(),
    modelCount: Number(domain.modelCount || 0),
    strictDeploymentLegal: domain.strictDeploymentLegal === true,
    complete: domain.complete === true,
  });
  if (!normalized.rosterDomainKey || !normalized.witnessHash ||
      normalized.hostReceiptHash !== hostReceiptHash ||
      normalized.rosterKeys.length < 2 || normalized.leaderNames.length < 2 ||
      !normalized.resourceKinds.length || !normalized.resourceProfiles.length ||
      !normalized.modelOrganizationKinds.length ||
      normalized.modelCount <= 0 || !normalized.strictDeploymentLegal || !normalized.complete) {
    throw new Error(`cross_validation_roster_domain_invalid:${normalized.rosterDomainKey}`);
  }
  return normalized;
}

export function warmachineCrossScenarioRosterTaskKeyV1(coordinates = {}) {
  const identity = stableGraphValue({
    scenarioKey: String(coordinates.scenarioKey || ""),
    firstPlayerSideKey: String(coordinates.firstPlayerSideKey || ""),
    terminalGoalKey: String(coordinates.terminalGoalKey || ""),
    rosterDomainKey: String(coordinates.rosterDomainKey || ""),
  });
  if (!WARMACHINE_CROSS_SCENARIO_KEYS_V1.includes(identity.scenarioKey) ||
      !FIRST_PLAYER_SIDE_KEYS.includes(identity.firstPlayerSideKey) ||
      !WARMACHINE_CROSS_SCENARIO_TERMINAL_GOAL_KEYS_V1.includes(
        identity.terminalGoalKey,
      ) || !identity.rosterDomainKey) {
    throw new Error("cross_validation_task_coordinates_invalid");
  }
  return `cross-validation-task-${stableGraphHash(identity, 32)}`;
}

function buildTasks(rosterDomains = []) {
  return WARMACHINE_CROSS_SCENARIO_KEYS_V1.flatMap((scenarioKey) =>
    FIRST_PLAYER_SIDE_KEYS.flatMap((firstPlayerSideKey) =>
      WARMACHINE_CROSS_SCENARIO_TERMINAL_GOAL_KEYS_V1.flatMap((terminalGoalKey) =>
        rosterDomains.map((rosterDomain) => {
          const coordinates = {
            scenarioKey,
            firstPlayerSideKey,
            terminalGoalKey,
            rosterDomainKey: rosterDomain.rosterDomainKey,
          };
          return stableGraphValue({
            taskKey: warmachineCrossScenarioRosterTaskKeyV1(coordinates),
            ...coordinates,
            rosterWitnessHash: rosterDomain.witnessHash,
          });
        }))))
    .sort((left, right) => left.taskKey.localeCompare(right.taskKey));
}

function shardForTask(taskKey = "", shardCount = 1) {
  return Number.parseInt(stableGraphHash(taskKey, 8), 16) % shardCount;
}

function validatePublishedOutcome(outcome = {}, task = {}, hostReceiptHash = "") {
  if (!PUBLISHED_DISPOSITIONS.has(outcome.disposition)) {
    throw new Error(`cross_validation_outcome_disposition_invalid:${outcome.disposition || ""}`);
  }
  if (String(outcome.taskKey || "") !== task.taskKey ||
      String(outcome.hostReceiptHash || "") !== hostReceiptHash ||
      String(outcome.rosterWitnessHash || "") !== task.rosterWitnessHash) {
    throw new Error(`cross_validation_outcome_binding_mismatch:${task.taskKey}`);
  }
  if (outcome.disposition === "strict_materialized" &&
      (outcome.authority !== "rules_v1_host" ||
       outcome.strictReplayCertified !== true ||
       !outcome.receiptHash || !outcome.replayReceiptHash)) {
    throw new Error(`cross_validation_strict_materialized_evidence_invalid:${task.taskKey}`);
  }
  if (outcome.disposition === "strict_rejected" &&
      (outcome.authority !== "rules_v1_host" || !outcome.receiptHash ||
       outcome.strictRulesConclusion !== true)) {
    throw new Error(`cross_validation_strict_rejected_evidence_invalid:${task.taskKey}`);
  }
  if (outcome.disposition === "inverse_unresolved" && !String(outcome.reason || "")) {
    throw new Error(`cross_validation_inverse_unresolved_reason_missing:${task.taskKey}`);
  }
  return stableGraphValue({
    ...task,
    ...outcome,
    taskKey: task.taskKey,
    hostReceiptHash,
    rosterWitnessHash: task.rosterWitnessHash,
    trainingTruth: false,
  });
}

function checkpointCore(report = {}) {
  return stableGraphValue({
    schemaVersion: "warmachine_cross_scenario_roster_checkpoint_v1",
    hostReceiptHash: report.hostReceiptHash,
    matrixHash: report.matrixHash,
    outcomes: report.tasks.filter((task) => PUBLISHED_DISPOSITIONS.has(task.disposition))
      .map((task) => stableGraphValue({
        taskKey: task.taskKey,
        disposition: task.disposition,
        hostReceiptHash: task.hostReceiptHash,
        rosterWitnessHash: task.rosterWitnessHash,
        authority: task.authority || "",
        strictRulesConclusion: task.strictRulesConclusion === true,
        strictReplayCertified: task.strictReplayCertified === true,
        receiptHash: task.receiptHash || "",
        replayReceiptHash: task.replayReceiptHash || "",
        reason: task.reason || "",
        evidenceSourceKey: task.evidenceSourceKey || "",
        trainingTruth: false,
      })).sort((left, right) => left.taskKey.localeCompare(right.taskKey)),
  });
}

export function completedWarmachineCrossScenarioRosterOutcomesV1(report = {}) {
  const core = checkpointCore(report);
  return stableGraphValue({ ...core, checkpointHash: stableGraphHash(core) });
}

function readPriorOutcomes(priorCheckpoint = {}, matrixHash = "", hostReceiptHash = "") {
  if (!priorCheckpoint || !Object.keys(priorCheckpoint).length) {
    return { outcomes: [], invalidated: [] };
  }
  const { checkpointHash, ...rawCore } = priorCheckpoint;
  const expectedHash = stableGraphHash(stableGraphValue(rawCore));
  if (!checkpointHash || checkpointHash !== expectedHash) {
    throw new Error("cross_validation_checkpoint_hash_mismatch");
  }
  if (priorCheckpoint.matrixHash !== matrixHash ||
      priorCheckpoint.hostReceiptHash !== hostReceiptHash) {
    return {
      outcomes: [],
      invalidated: (priorCheckpoint.outcomes || []).map((outcome) => stableGraphValue({
        taskKey: String(outcome.taskKey || ""),
        priorDisposition: String(outcome.disposition || ""),
        disposition: "rules_drift",
        reason: priorCheckpoint.hostReceiptHash !== hostReceiptHash
          ? "host_receipt_mismatch"
          : "validation_matrix_mismatch",
      })),
    };
  }
  return { outcomes: priorCheckpoint.outcomes || [], invalidated: [] };
}

export function runWarmachineCrossScenarioRosterValidationV1({
  hostReceiptHash = "",
  corpusHash = "",
  rosterDomains = [],
  evidenceOutcomes = [],
  priorCheckpoint = {},
  maximumExecutedTasks = 0,
  priorityTaskKeys = [],
  shardIndex = 0,
  shardCount = 1,
  executeTask = null,
} = {}) {
  if (!hostReceiptHash || !corpusHash) {
    throw new Error("cross_validation_host_and_corpus_receipts_required");
  }
  const normalizedRosterDomains = rosterDomains
    .map((domain) => normalizeRosterDomain(domain, hostReceiptHash))
    .sort((left, right) => left.rosterDomainKey.localeCompare(right.rosterDomainKey));
  if (normalizedRosterDomains.length < 3 ||
      new Set(normalizedRosterDomains.map((domain) => domain.rosterDomainKey)).size !==
        normalizedRosterDomains.length ||
      new Set(normalizedRosterDomains.map((domain) => domain.witnessHash)).size !==
        normalizedRosterDomains.length) {
    throw new Error("cross_validation_requires_three_distinct_roster_domains");
  }
  const normalizedShardCount = Math.max(1, Math.floor(Number(shardCount) || 1));
  const normalizedShardIndex = Math.floor(Number(shardIndex) || 0);
  if (normalizedShardIndex < 0 || normalizedShardIndex >= normalizedShardCount) {
    throw new Error("cross_validation_shard_index_invalid");
  }
  const tasks = buildTasks(normalizedRosterDomains);
  const matrixCore = stableGraphValue({
    hostReceiptHash,
    corpusHash,
    rosterDomains: normalizedRosterDomains,
    taskIdentities: tasks,
  });
  const matrixHash = stableGraphHash(matrixCore);
  const taskByKey = new Map(tasks.map((task) => [task.taskKey, task]));
  const prior = readPriorOutcomes(priorCheckpoint, matrixHash, hostReceiptHash);
  const publishedByTaskKey = new Map();
  for (const outcome of [...prior.outcomes, ...evidenceOutcomes]) {
    const task = taskByKey.get(String(outcome.taskKey || ""));
    if (!task) throw new Error(`cross_validation_outcome_task_unknown:${outcome.taskKey || ""}`);
    const validated = validatePublishedOutcome(outcome, task, hostReceiptHash);
    const existing = publishedByTaskKey.get(task.taskKey);
    if (existing && stableGraphHash(existing) !== stableGraphHash(validated)) {
      throw new Error(`cross_validation_conflicting_outcomes:${task.taskKey}`);
    }
    publishedByTaskKey.set(task.taskKey, validated);
  }
  const priority = new Map(priorityTaskKeys.map((taskKey, index) => [String(taskKey), index]));
  const eligible = tasks.filter((task) =>
    shardForTask(task.taskKey, normalizedShardCount) === normalizedShardIndex &&
    !publishedByTaskKey.has(task.taskKey))
    .sort((left, right) =>
      (priority.get(left.taskKey) ?? Number.MAX_SAFE_INTEGER) -
        (priority.get(right.taskKey) ?? Number.MAX_SAFE_INTEGER) ||
      left.taskKey.localeCompare(right.taskKey));
  const budget = Math.max(0, Math.floor(Number(maximumExecutedTasks) || 0));
  const selected = eligible.slice(0, budget);
  const failedAttempts = [];
  for (const task of selected) {
    if (typeof executeTask !== "function") {
      throw new Error("cross_validation_execute_task_required_for_nonzero_budget");
    }
    try {
      const outcome = validatePublishedOutcome(executeTask(task), task, hostReceiptHash);
      publishedByTaskKey.set(task.taskKey, outcome);
    } catch (error) {
      failedAttempts.push(stableGraphValue({
        taskKey: task.taskKey,
        reason: "isolated_task_execution_failed",
        errorMessage: String(error?.message || error),
      }));
    }
  }
  const finalTasks = tasks.map((task) => publishedByTaskKey.get(task.taskKey) ||
    stableGraphValue({
      ...task,
      disposition: "budget_deferred",
      reason: failedAttempts.some((failure) => failure.taskKey === task.taskKey)
        ? "isolated_task_execution_failed_retryable"
        : shardForTask(task.taskKey, normalizedShardCount) !== normalizedShardIndex
          ? "not_selected_by_current_shard"
          : "validation_budget_not_executed",
      hostReceiptHash,
      strictReplayCertified: false,
      trainingTruth: false,
    }));
  const dispositionCounts = countBy(finalTasks, (task) => task.disposition);
  const strictRows = finalTasks.filter((task) => task.disposition === "strict_materialized");
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_CROSS_SCENARIO_ROSTER_VALIDATION_V1_SCHEMA,
    hostReceiptHash,
    corpusHash,
    matrixHash,
    rosterDomains: normalizedRosterDomains,
    matrixCoverage: {
      scenarioKeys: WARMACHINE_CROSS_SCENARIO_KEYS_V1,
      firstPlayerSideKeys: FIRST_PLAYER_SIDE_KEYS,
      terminalGoalKeys: WARMACHINE_CROSS_SCENARIO_TERMINAL_GOAL_KEYS_V1,
      rosterDomainCount: normalizedRosterDomains.length,
      taskCount: tasks.length,
      expectedTaskCount: 7 * 2 * 2 * normalizedRosterDomains.length,
      complete: tasks.length === 7 * 2 * 2 * normalizedRosterDomains.length,
    },
    shard: {
      shardIndex: normalizedShardIndex,
      shardCount: normalizedShardCount,
      eligibleTaskCount: tasks.filter((task) =>
        shardForTask(task.taskKey, normalizedShardCount) === normalizedShardIndex).length,
    },
    execution: {
      requestedBudget: budget,
      selectedTaskCount: selected.length,
      failedAttemptCount: failedAttempts.length,
      failedAttempts,
      priorRecoveredOutcomeCount: prior.outcomes.length,
      priorInvalidatedOutcomeCount: prior.invalidated.length,
      invalidatedPriorOutcomes: prior.invalidated,
    },
    tasks: finalTasks,
    dispositionCounts,
    massLedger: {
      totalTaskCount: finalTasks.length,
      publishedTaskCount: finalTasks.filter((task) =>
        PUBLISHED_DISPOSITIONS.has(task.disposition)).length,
      deferredTaskCount: dispositionCounts.budget_deferred || 0,
      conserved: Object.values(dispositionCounts).reduce((sum, count) => sum + count, 0) ===
        finalTasks.length,
    },
    strictComparison: {
      strictRouteCount: strictRows.length,
      comparedRosterDomainKeys: [...new Set(strictRows.map((row) => row.rosterDomainKey))]
        .sort(),
      comparedScenarioKeys: [...new Set(strictRows.map((row) => row.scenarioKey))].sort(),
      strategyScoreUsed: false,
      globalOptimalityProven: false,
      coverageDeficitMeansUnreachable: false,
    },
    trainingTruth: false,
    claimBoundary: "This matrix compares only exact current-Host strict evidence. Strict rejection applies only to the rejected authored state. Inverse-unresolved and budget-deferred tasks remain open; neither is unreachable evidence. Roster, scenario or first-player coverage and discovered strict routes do not establish global optimality, strategy value or natural win rate.",
  });
  const report = stableGraphValue({ ...core, reportHash: stableGraphHash(core) });
  return {
    ...report,
    checkpoint: completedWarmachineCrossScenarioRosterOutcomesV1(report),
  };
}
