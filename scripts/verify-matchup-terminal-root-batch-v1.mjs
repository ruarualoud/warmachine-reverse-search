#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import {
  acquireWarmachineMatchupTerminalRootBatchLeaseV1,
  auditWarmachineMatchupTerminalRootBatchCheckpointV1,
  buildWarmachineMatchupTerminalRootBatchCheckpointV1,
  buildWarmachineMatchupTerminalRootBatchPlanV1,
  refreshWarmachineMatchupTerminalRootBatchPinnedResultsV1,
  recordWarmachineMatchupTerminalRootBatchResultsV1,
  summarizeWarmachineMatchupTerminalRootBatchV1,
  WARMACHINE_MATCHUP_TERMINAL_ROOT_BATCH_CHECKPOINT_V1_SCHEMA,
  WARMACHINE_MATCHUP_TERMINAL_ROOT_BATCH_PLAN_V1_SCHEMA,
} from "../src/matchup/matchup-terminal-root-batch-v1.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(reverseDirectory,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1"));

function loadJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(outputDirectory, fileName), "utf8"));
}

function resealCheckpoint(checkpoint = {}) {
  const clone = structuredClone(checkpoint);
  delete clone.checkpointHash;
  return { ...clone, checkpointHash: stableGraphHash(clone) };
}

function resealArtifact(artifact = {}, hashField = "") {
  const clone = structuredClone(artifact);
  delete clone[hashField];
  return { ...clone, [hashField]: stableGraphHash(clone) };
}

function assertSealedArtifact(artifact = {}, hashField = "") {
  const core = { ...artifact };
  const declaredHash = core[hashField];
  delete core[hashField];
  assert.equal(stableGraphHash(core), declaredHash);
}

function mockResult(taskKey, disposition) {
  return {
    taskKey,
    disposition,
    reason: `focused_${disposition}`,
    authority: disposition === "input_invalid" ? "input" :
      disposition === "proposal_filtered" ? "search_proposal" : "rules_v1_host",
    reportHash: stableGraphHash({ taskKey, disposition }),
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash:
      warmachineConstructionHost.receipt.receiptHash,
  };
}

const report = loadJson("report.json");
const pool = loadJson("goal-conditioned-roster-pool.json");
const routing = loadJson("terminal-demand-routing.json");
const evidenceCorpus = loadJson("terminal-demand-evidence-corpus.json");
assert.equal(report.task.rulesetReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(evidenceCorpus.hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(pool.source.constructionHostReceiptHash,
  warmachineConstructionHost.receipt.receiptHash);
assert.equal(pool.source.forceBuilderSourceHash,
  warmachineConstructionHost.receipt.sourceHashes[
    "android-shell/assets/companion/force-builder.js"
  ]);
const staleTask = structuredClone(report.task);
staleTask.rulesetReceiptHash = "stale-host";
const resealedStaleTask = resealArtifact(staleTask, "taskHash");
assert.throws(() => buildWarmachineMatchupTerminalRootBatchPlanV1({
  task: resealedStaleTask,
  pool,
  routing,
  evidenceCorpus,
  maximumMaterializationTasks: 1,
}), /matchup_terminal_batch_task_host_receipt_drift/);
const stalePool = structuredClone(pool);
stalePool.source.constructionHostReceiptHash = "stale-construction-host";
const resealedStalePool = resealArtifact(stalePool, "poolSetHash");
assert.throws(() => buildWarmachineMatchupTerminalRootBatchPlanV1({
  task: report.task,
  pool: resealedStalePool,
  routing,
  evidenceCorpus,
  maximumMaterializationTasks: 1,
}), /matchup_terminal_batch_pool_construction_host_receipt_drift/);
assert.throws(() => buildWarmachineMatchupTerminalRootBatchPlanV1({
  task: report.task,
  pool,
  routing,
  evidenceCorpus: { ...evidenceCorpus, hostReceiptHash: "stale-host" },
  maximumMaterializationTasks: 1,
}), /matchup_terminal_batch_evidence_cache_hash_invalid/);
const plan = buildWarmachineMatchupTerminalRootBatchPlanV1({
  task: report.task,
  pool,
  routing,
  evidenceCorpus,
  maximumMaterializationTasks: 64,
  shardCount: 4,
});

assert.equal(plan.schemaVersion,
  WARMACHINE_MATCHUP_TERMINAL_ROOT_BATCH_PLAN_V1_SCHEMA);
assert.equal(plan.groupCount, routing.eligibleDemandGroupCount);
assert.equal(plan.groupCount, routing.routedGroups.length);
assert.equal(plan.groupCount, 1_992);
assert.equal(plan.representativeCount, routing.routedGroups.reduce((sum, group) =>
  sum + group.representativeCount, 0));
assert.equal(plan.constructionMacroProfileCount,
  routing.constructionMacroProfileCount);
assert.equal(plan.constructionMacroProfileCount, 13);
assert.equal(plan.allGroupsRepresented, true);
assert.equal(plan.allMacrosRepresentedInPlan, true);
assert.equal(plan.allMacrosSelectedWithinBudget, true);
assert.equal(plan.representativeMassConserved, true);
assert.equal(plan.candidateMassConserved, true);
assert.equal(BigInt(plan.candidateVariantMass),
  BigInt(plan.candidateDispositionMass.queued) +
    BigInt(plan.candidateDispositionMass.budget_deferred));
assert.equal(plan.selectedTaskCount, 64);
assert.equal(new Set(plan.selectedTasks.map((task) => task.taskKey)).size, 64);
assert.equal(Object.values(plan.shardTaskCounts).reduce((sum, count) =>
  sum + count, 0), 64);
assert.equal(Object.values(plan.shardTaskCounts).every((count) => count > 0), true);
assert.equal(plan.selectedFamilyCounts.assassination > 0, true);
assert.equal(plan.selectedFamilyCounts.scenario_score_threshold > 0, true);
assert.equal(plan.selectedConstructionMacroProfileCount, 13);
assert.equal(plan.genericCapabilityPinsCountAsTaskRoots, false);
assert.equal(plan.deploymentToTerminalReachabilityProven, false);
assert.deepEqual(plan.gameValueInterval, { lowerBound: 0, upperBound: 1 });
assert.equal(plan.naturalWinRate, null);
assert.equal(plan.trainingTruth, false);
assert.deepEqual(Object.keys(plan.workQueues).sort(), [
  "assassination",
  "fixed_round_tiebreak",
  "scenario_score_threshold",
  "simultaneous_leader_tiebreak",
]);
assert.equal(Object.values(plan.workQueues).every((queue) =>
  queue.groupCount > 0 && queue.selectedTaskCount > 0), true);
assert.equal(plan.groupLedger.every((group) =>
  group.representativeMassConserved && group.candidateMassConserved), true);
assert.equal(plan.selectedTasks.every((task) =>
  task.equivalenceMergeProven && task.equivalentTaskKeys.length === 1 &&
  task.equivalentTaskKeys[0] === task.taskKey &&
  task.firstPlayerTaskSideKey ===
    task.executionEnvelope?.sideBinding?.attackerTaskSideKey), true);
assert.equal(plan.selectedTasks.every((task) => {
  const envelope = structuredClone(task.executionEnvelope || {});
  const declaredHash = envelope.executionEnvelopeHash;
  delete envelope.executionEnvelopeHash;
  return declaredHash === stableGraphHash(envelope) &&
    task.sidePermutationKey === task.executionEnvelope.sidePermutationKey &&
    task.executionEnvelope.rulesAuthority === "project_d_rules_v1_host" &&
    task.executionEnvelope.strategyAuthority === false &&
    task.executionEnvelope.actorAxis?.exactModelIdentityExpansion ===
      "after_strict_opening" &&
    task.executionEnvelope.targetAxis?.exactModelIdentityExpansion ===
      "after_strict_opening" &&
    BigInt(task.executionEnvelope.finiteCandidatePairCount) > 0n;
}), true);
assert.deepEqual([...new Set(plan.selectedTasks.map((task) =>
  task.sidePermutationKey))].sort(), ["identity", "swap"]);
assert.deepEqual([...new Set(plan.selectedTasks.map((task) =>
  task.executionEnvelope.actorAxis.taskSideKey))].sort(), ["challenger", "subject"]);
assert.deepEqual([...new Set(plan.selectedTasks.map((task) =>
  task.executionEnvelope.actionCategory))].sort(), [
  "active_attack_or_effect",
  "defender_fixed_round_turn_end_settlement",
  "opponent_turn_reactive_or_continuous_effect",
  "single_simultaneous_resolution_window",
  "steamroller_turn_end_settlement",
]);

assert.throws(() => buildWarmachineMatchupTerminalRootBatchCheckpointV1({
  ...plan,
  schemaVersion: "wrong_schema",
}), /matchup_terminal_batch_plan_schema_invalid/);

const initialCheckpoint = buildWarmachineMatchupTerminalRootBatchCheckpointV1(
  plan,
  { nowMs: 1_000 },
);
assert.equal(initialCheckpoint.schemaVersion,
  WARMACHINE_MATCHUP_TERMINAL_ROOT_BATCH_CHECKPOINT_V1_SCHEMA);
assert.equal(initialCheckpoint.counts.queued, 64);
assert.equal(initialCheckpoint.counts.leased, 0);
assert.equal(initialCheckpoint.counts.completed, 0);
assert.equal(auditWarmachineMatchupTerminalRootBatchCheckpointV1(
  initialCheckpoint,
  plan,
).ok, true);

const workerA = acquireWarmachineMatchupTerminalRootBatchLeaseV1(
  initialCheckpoint,
  plan,
  {
    workerId: "worker-a",
    nowMs: 1_100,
    leaseDurationMs: 100,
    maximumTasks: 6,
    shardIndexes: [0],
  },
);
assert.equal(workerA.acquiredTaskKeys.length, 6);
assert.equal(workerA.checkpoint.counts.leased, 6);
assert.equal(auditWarmachineMatchupTerminalRootBatchCheckpointV1(
  workerA.checkpoint,
  plan,
).ok, true);

const workerC = acquireWarmachineMatchupTerminalRootBatchLeaseV1(
  workerA.checkpoint,
  plan,
  {
    workerId: "worker-c",
    nowMs: 1_201,
    leaseDurationMs: 500,
    maximumTasks: 6,
    shardIndexes: [0],
  },
);
assert.equal(workerC.staleLeaseTakeoverCount, 6);
assert.deepEqual(workerC.acquiredTaskKeys, workerA.acquiredTaskKeys);
assert.equal(workerC.checkpoint.staleLeaseTakeoverCount, 6);
assert.throws(() => recordWarmachineMatchupTerminalRootBatchResultsV1(
  workerC.checkpoint,
  plan,
  {
    workerId: "worker-a",
    nowMs: 1_202,
    results: [mockResult(workerA.acquiredTaskKeys[0], "strict_materialized")],
  },
), /matchup_terminal_batch_result_lease_mismatch/);

const dispositions = [
  "strict_materialized",
  "strict_rejected",
  "proposal_filtered",
  "input_invalid",
  "rules_unknown",
];
const completedCheckpoint = recordWarmachineMatchupTerminalRootBatchResultsV1(
  workerC.checkpoint,
  plan,
  {
    workerId: "worker-c",
    nowMs: 1_202,
    results: workerC.acquiredTaskKeys.map((taskKey, index) =>
      mockResult(taskKey, dispositions[index % dispositions.length])),
  },
);
const completedAudit = auditWarmachineMatchupTerminalRootBatchCheckpointV1(
  completedCheckpoint,
  plan,
);
assert.equal(completedAudit.ok, true);
assert.equal(completedCheckpoint.counts.completed, 6);
assert.equal(completedCheckpoint.counts.dispositions.strict_materialized, 2);
assert.equal(completedCheckpoint.counts.dispositions.strict_rejected, 1);
assert.equal(completedCheckpoint.counts.dispositions.proposal_filtered, 1);
assert.equal(completedCheckpoint.counts.dispositions.input_invalid, 1);
assert.equal(completedCheckpoint.counts.dispositions.rules_unknown, 1);

const workerB = acquireWarmachineMatchupTerminalRootBatchLeaseV1(
  completedCheckpoint,
  plan,
  {
    workerId: "worker-b",
    nowMs: 1_300,
    leaseDurationMs: 500,
    maximumTasks: 2,
    shardIndexes: [1],
  },
);
assert.equal(workerB.acquiredTaskKeys.length, 2);
assert.equal(workerB.acquiredTaskKeys.some((taskKey) =>
  workerC.acquiredTaskKeys.includes(taskKey)), false);

const wrongHostResult = mockResult(workerB.acquiredTaskKeys[0], "strict_rejected");
wrongHostResult.hostReceiptHash = "stale-host";
assert.throws(() => recordWarmachineMatchupTerminalRootBatchResultsV1(
  workerB.checkpoint,
  plan,
  {
    workerId: "worker-b",
    nowMs: 1_301,
    results: [wrongHostResult],
  },
), /matchup_terminal_batch_result_host_receipt_drift/);
const wrongConstructionResult = mockResult(
  workerB.acquiredTaskKeys[0],
  "strict_rejected",
);
wrongConstructionResult.constructionHostReceiptHash = "stale-construction-host";
assert.throws(() => recordWarmachineMatchupTerminalRootBatchResultsV1(
  workerB.checkpoint,
  plan,
  {
    workerId: "worker-b",
    nowMs: 1_301,
    results: [wrongConstructionResult],
  },
), /matchup_terminal_batch_result_construction_host_receipt_drift/);
assert.throws(() => recordWarmachineMatchupTerminalRootBatchResultsV1(
  workerB.checkpoint,
  plan,
  {
    workerId: "worker-b",
    nowMs: 1_301,
    results: [
      mockResult(workerB.acquiredTaskKeys[0], "strict_rejected"),
      mockResult(workerB.acquiredTaskKeys[0], "proposal_filtered"),
    ],
  },
), /matchup_terminal_batch_result_keys_invalid/);

const expiredWorker = acquireWarmachineMatchupTerminalRootBatchLeaseV1(
  completedCheckpoint,
  plan,
  {
    workerId: "worker-expired",
    nowMs: 2_000,
    leaseDurationMs: 10,
    maximumTasks: 1,
    shardIndexes: [2],
  },
);
assert.throws(() => recordWarmachineMatchupTerminalRootBatchResultsV1(
  expiredWorker.checkpoint,
  plan,
  {
    workerId: "worker-expired",
    nowMs: 2_010,
    results: [mockResult(expiredWorker.acquiredTaskKeys[0], "strict_rejected")],
  },
), /matchup_terminal_batch_result_lease_expired/);

const identityTamper = structuredClone(initialCheckpoint);
identityTamper.tasks[0].behaviorSignatureHash = "tampered";
const identityAudit = auditWarmachineMatchupTerminalRootBatchCheckpointV1(
  resealCheckpoint(identityTamper),
  plan,
);
assert.equal(identityAudit.ok, false);
assert.equal(identityAudit.issues.includes(
  "batch_checkpoint_task_identity_mismatch"), true);

const receiptTamper = structuredClone(initialCheckpoint);
receiptTamper.receipts.hostReceiptHash = "stale-host";
const receiptAudit = auditWarmachineMatchupTerminalRootBatchCheckpointV1(
  resealCheckpoint(receiptTamper),
  plan,
);
assert.equal(receiptAudit.ok, false);
assert.equal(receiptAudit.issues.includes(
  "batch_checkpoint_host_receipt_drift"), true);

const statusTamper = structuredClone(initialCheckpoint);
statusTamper.tasks[0].status = "invented_status";
statusTamper.counts.queued -= 1;
const statusAudit = auditWarmachineMatchupTerminalRootBatchCheckpointV1(
  resealCheckpoint(statusTamper),
  plan,
);
assert.equal(statusAudit.ok, false);
assert.equal(statusAudit.issues.includes(
  "batch_checkpoint_task_status_invalid"), true);

const resultTamper = structuredClone(completedCheckpoint);
const completedTask = resultTamper.tasks.find((task) => task.status === "completed");
completedTask.result.reportHash = "tampered";
const resultAudit = auditWarmachineMatchupTerminalRootBatchCheckpointV1(
  resealCheckpoint(resultTamper),
  plan,
);
assert.equal(resultAudit.ok, false);
assert.equal(resultAudit.issues.includes(
  "batch_checkpoint_completed_task_result_invalid"), true);

const summary = summarizeWarmachineMatchupTerminalRootBatchV1(
  completedCheckpoint,
  plan,
);
assert.equal(summary.checkpointAudit.ok, true);
assert.equal(summary.completedTaskCount, 6);
assert.equal(summary.incompleteTaskCount, 58);
assert.equal(summary.taskSpecificStrictRootCount, 2);
assert.equal(summary.genericCapabilityPinsCountAsTaskRoots, false);
assert.equal(summary.allSelectedTasksComplete, false);
assert.equal(summary.deploymentToTerminalReachabilityProven, false);
assert.deepEqual(summary.gameValueInterval, { lowerBound: 0, upperBound: 1 });
assert.equal(summary.naturalWinRate, null);
assert.equal(summary.trainingTruth, false);

const current = loadJson("terminal-root-batch-v1/CURRENT.json");
assertSealedArtifact(current, "currentHash");
assert.equal(current.taskHash, report.task.taskHash);
assert.equal(current.hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(current.constructionHostReceiptHash,
  warmachineConstructionHost.receipt.receiptHash);
assert.equal(current.relativePlanDirectory.startsWith("plans/"), true);
const productionPrefix = path.join("terminal-root-batch-v1",
  current.relativePlanDirectory);
const productionPlan = loadJson(path.join(productionPrefix, "plan.json"));
const productionCheckpoint = loadJson(path.join(productionPrefix, "checkpoint.json"));
const productionSummary = loadJson(path.join(productionPrefix, "summary.json"));
const strictSeedIndex = loadJson(path.join(productionPrefix, "strict-seed-index.json"));
assertSealedArtifact(productionPlan, "planHash");
assertSealedArtifact(productionSummary, "summaryHash");
assertSealedArtifact(strictSeedIndex, "seedIndexHash");
assert.equal(productionPlan.planHash, current.planHash);
assert.equal(productionCheckpoint.checkpointHash, current.checkpointHash);
assert.equal(productionSummary.summaryHash, current.summaryHash);
assert.equal(auditWarmachineMatchupTerminalRootBatchCheckpointV1(
  productionCheckpoint,
  productionPlan,
).ok, true);
assert.equal(productionPlan.selectedTaskCount, 64);
assert.equal(productionPlan.pinnedTaskCount, 2);
assert.deepEqual([...new Set(productionPlan.selectedTasks.map((task) =>
  task.sidePermutationKey))].sort(), ["identity", "swap"]);
assert.equal(productionPlan.selectedTasks.every((task) => {
  const envelope = structuredClone(task.executionEnvelope || {});
  const declaredHash = envelope.executionEnvelopeHash;
  delete envelope.executionEnvelopeHash;
  return declaredHash === stableGraphHash(envelope) &&
    task.sidePermutationKey === task.executionEnvelope.sidePermutationKey;
}), true);
assert.equal(productionPlan.selectedTasks.slice(0, 2).every((task) =>
  task.selectionSource === "pinned_strict_seed"), true);
assert.equal(productionSummary.completedTaskCount,
  productionCheckpoint.tasks.filter((task) => task.status === "completed").length);
assert.equal(productionSummary.incompleteTaskCount,
  productionPlan.selectedTaskCount - productionSummary.completedTaskCount);
assert.equal(productionSummary.completedTaskCount >= 2, true);
assert.equal(productionSummary.taskSpecificStrictRootCount,
  productionCheckpoint.tasks.filter((task) =>
    task.result?.disposition === "strict_materialized").length);
assert.equal(productionSummary.taskSpecificStrictRootCount >= 2, true);
assert.equal(strictSeedIndex.strictSeedCount, 2);
assert.equal(new Set(strictSeedIndex.seeds.map((seed) => seed.goalFamily)).size, 2);
assert.equal(strictSeedIndex.seeds.some((seed) => seed.goalFamily === "assassination"), true);
assert.equal(strictSeedIndex.seeds.some((seed) =>
  seed.goalFamily === "scenario_score_threshold"), true);
assert.equal(strictSeedIndex.seeds.every((seed) =>
  seed.mapKey === "mixed_table" && seed.deploymentSeedKey === "balanced" &&
  seed.firstPlayerTaskSideKey === "challenger"), true);
const productionPinnedTasks = productionPlan.selectedTasks.slice(
  0,
  strictSeedIndex.seeds.length,
);
const refreshRows = productionPinnedTasks.map((task, index) => ({
  taskKey: task.taskKey,
  disposition: "strict_materialized",
  reportHash: strictSeedIndex.seeds[index].reportHash,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  constructionHostReceiptHash: warmachineConstructionHost.receipt.receiptHash,
}));
const noChangeRefresh = refreshWarmachineMatchupTerminalRootBatchPinnedResultsV1(
  productionCheckpoint,
  productionPlan,
  { nowMs: 10, results: refreshRows },
);
assert.equal(noChangeRefresh.refreshedTaskCount, 0);
assert.equal(noChangeRefresh.checkpoint.checkpointHash,
  productionCheckpoint.checkpointHash);
const stalePinnedCheckpoint = structuredClone(productionCheckpoint);
const stalePinnedTask = stalePinnedCheckpoint.tasks.find((task) =>
  task.taskKey === productionPinnedTasks[0].taskKey);
stalePinnedTask.result.reportHash = "stale-strict-seed-report";
delete stalePinnedTask.result.resultHash;
stalePinnedTask.result.resultHash = stableGraphHash(stalePinnedTask.result);
const sealedStalePinnedCheckpoint = resealCheckpoint(stalePinnedCheckpoint);
const repairedPinned = refreshWarmachineMatchupTerminalRootBatchPinnedResultsV1(
  sealedStalePinnedCheckpoint,
  productionPlan,
  { nowMs: 11, results: refreshRows },
);
assert.equal(repairedPinned.refreshedTaskCount, 1);
assert.equal(auditWarmachineMatchupTerminalRootBatchCheckpointV1(
  repairedPinned.checkpoint,
  productionPlan,
).ok, true);
assert.equal(repairedPinned.checkpoint.tasks.find((task) =>
  task.taskKey === productionPinnedTasks[0].taskKey).result.reportHash,
strictSeedIndex.seeds[0].reportHash);
const completedProductionResults = productionCheckpoint.tasks.filter((task) =>
  task.status === "completed").map((task) => task.result);
const completedStrictResults = completedProductionResults.filter((result) =>
  result.disposition === "strict_materialized");
const strictSeedReportHashes = new Set(strictSeedIndex.seeds.map((seed) =>
  seed.reportHash));
assert.equal([...strictSeedReportHashes].every((reportHash) =>
  completedStrictResults.some((result) => result.reportHash === reportHash)), true);
const productionTaskByKey = new Map(productionPlan.selectedTasks.map((task) => [
  task.taskKey,
  task,
]));
for (const result of completedProductionResults.filter((row) =>
  !strictSeedReportHashes.has(row.reportHash))) {
  const terminalTask = productionTaskByKey.get(result.taskKey);
  assert.ok(terminalTask);
  const evidencePath = path.join(productionPrefix, "terminal-task-evidence",
    result.taskKey, "report.json");
  const evidence = loadJson(evidencePath);
  assertSealedArtifact(evidence, "reportHash");
  assert.equal(evidence.reportHash, result.reportHash);
  assert.equal(evidence.disposition, result.disposition);
  assert.equal(evidence.terminalTaskKey || evidence.taskKey, result.taskKey);
  if (result.disposition === "rules_unknown") {
    assert.notEqual(terminalTask.representative.sourceResolutionStatus,
      "officially_confirmed");
    assert.equal(evidence.strictReplayCertified, false);
  } else if (result.disposition === "strict_rejected") {
    assert.equal(evidence.authority, "rules_v1_host");
    const staticPlacementRejected =
      evidence.root?.staticPlacementIssueCodes?.length > 0;
    const actionRejected = Boolean(
      evidence.hostRejectionEvidence?.rejection?.reason,
    );
    assert.equal(staticPlacementRejected || actionRejected, true);
    if (actionRejected) {
      assert.equal(
        evidence.hostRejectionEvidence.rejection.reason,
        evidence.reason,
      );
    }
  } else if (result.disposition === "strict_materialized") {
    assert.equal(evidence.authority, "rules_v1_host");
    assert.equal(evidence.strictReplayCertified, true);
    assert.equal(evidence.matchupTerminalRootProven, true);
  } else if (result.disposition === "proposal_filtered") {
    assert.equal(evidence.authority, "search_relation");
    assert.equal(evidence.strictRulesConclusion, false);
    assert.equal(evidence.strictReplayCertified, false);
    assert.equal(evidence.matchupTerminalRootProven, false);
    if (evidence.partitionCapabilityAudit) {
      assertSealedArtifact(evidence.partitionCapabilityAudit, "auditHash");
      assert.equal(
        evidence.partitionCapabilityAudit.exactCandidateRoutingMismatch,
        true,
      );
      assert.equal(
        evidence.partitionCapabilityAudit.proposalDispositionEvidence,
        "proposal_filtered",
      );
    }
  } else {
    assert.fail(`unexpected production disposition: ${result.disposition}`);
  }
}
const routingEvidence = loadJson("terminal-demand-routing-task-evidence.json");
assertSealedArtifact(routingEvidence, "evidenceHash");
assert.equal(routingEvidence.taskHash, report.task.taskHash);
assert.equal(routingEvidence.counts.evaluatedGroupCount, 2);
assert.equal(routingEvidence.counts.strictTerminalRootCount, 2);
assert.equal(routingEvidence.counts.strictReachableRouteCount, 0);

console.log(JSON.stringify({
  ok: true,
  groupCount: plan.groupCount,
  representativeCount: plan.representativeCount,
  constructionMacroProfileCount: plan.constructionMacroProfileCount,
  selectedTaskCount: plan.selectedTaskCount,
  shardTaskCounts: plan.shardTaskCounts,
  familyCounts: plan.familyCounts,
  selectedFamilyCounts: plan.selectedFamilyCounts,
  candidateVariantMass: plan.candidateVariantMass,
  staleLeaseTakeoverCount: workerC.staleLeaseTakeoverCount,
  completedDispositionCounts: completedCheckpoint.counts.dispositions,
  planHash: plan.planHash,
  checkpointHash: completedCheckpoint.checkpointHash,
  production: {
    planHash: productionPlan.planHash,
    checkpointHash: productionCheckpoint.checkpointHash,
    strictSeedCount: strictSeedIndex.strictSeedCount,
    completedTaskCount: productionSummary.completedTaskCount,
    incompleteTaskCount: productionSummary.incompleteTaskCount,
    routingEvidenceHash: routingEvidence.evidenceHash,
  },
}, null, 2));
