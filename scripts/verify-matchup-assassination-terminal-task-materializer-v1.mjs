#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import {
  buildWarmachineMatchupAssassinationTerminalTaskAdapterV1,
  materializeWarmachineMatchupAssassinationTerminalTaskV1,
  warmachineMatchupAssassinationTerminalTaskSupportedV1,
} from
  "../src/matchup/matchup-assassination-terminal-task-materializer-v1.mjs";
import { executeWarmachineMatchupTerminalTaskBatchV1 } from
  "../src/matchup/matchup-terminal-task-execution-batch-v1.mjs";
import {
  acquireWarmachineMatchupTerminalRootBatchLeaseV1,
  buildWarmachineMatchupTerminalRootBatchCheckpointV1,
} from "../src/matchup/matchup-terminal-root-batch-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const PREFERRED_FILTERED_TASK_KEY =
  "matchup-terminal-task-96a4c5b6a25498c83edc8531ff04d0dd";
const STRICT_FALLBACK_TASK_KEY =
  "matchup-terminal-task-6c100dec0a4a17d809071faa5f7e3486";
const ROLE_INCOMPATIBLE_FAULT_LINE_TASK_KEY =
  "matchup-terminal-task-7f89adfe2e1aa25b73169663330bdba5";
const MOVEMENT_FALLBACK_TASK_KEY =
  "matchup-terminal-task-b5de578bfa441af5556bf8528a9c9085";
const EXPECTED_ACTION_TYPES = [
  "melee_attack",
  "melee_attack",
  "end_initial_attack_window",
  "boosted_hit_damage_purchased_additional_melee_attack",
  "resolve_lifecycle_trigger_decline",
];

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(
    reverseDirectory,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
  ));

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertSealed(artifact = {}, hashField = "reportHash") {
  const core = { ...artifact };
  const declaredHash = String(core[hashField] || "");
  delete core[hashField];
  assert.ok(declaredHash);
  assert.equal(stableGraphHash(core), declaredHash);
}

function openingForTask(task = {}, openingReport = {}, openings = []) {
  const ledger = (openingReport.taskLedger || []).find((row) =>
    row.terminalTaskKey === task.taskKey);
  assert.equal(ledger?.disposition, "strict_opening_materialized");
  const opening = openings.find((row) => row.openingKey === ledger.openingKey);
  assert.ok(opening);
  return opening;
}

function actionTypes(root = {}) {
  return (root.actionSequence || []).map((row) => row.actionType);
}

const batchRoot = path.join(outputDirectory, "terminal-root-batch-v1");
const currentPath = path.join(batchRoot, "CURRENT.json");
const current = loadJson(currentPath);
assertSealed(current, "currentHash");
assert.equal(current.hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(
  current.constructionHostReceiptHash,
  warmachineConstructionHost.receipt.receiptHash,
);

const planDirectory = path.join(batchRoot, current.relativePlanDirectory);
const planPath = path.join(planDirectory, "plan.json");
const checkpointPath = path.join(planDirectory, "checkpoint.json");
const openingReportPath = path.join(
  planDirectory,
  "opening-batch-report.json",
);
const openingRuntimePath = path.join(
  planDirectory,
  "opening-batch-runtime.json",
);
const evidenceCorpusPath = path.join(
  outputDirectory,
  "terminal-demand-evidence-corpus.json",
);
const routingPath = path.join(
  outputDirectory,
  "terminal-demand-routing.json",
);

const productionCheckpointTextBefore = fs.readFileSync(checkpointPath, "utf8");
const plan = loadJson(planPath);
const productionCheckpoint = JSON.parse(productionCheckpointTextBefore);
const checkpoint = buildWarmachineMatchupTerminalRootBatchCheckpointV1(
  plan,
  { nowMs: 0 },
);
const openingReport = loadJson(openingReportPath);
const openingRuntime = loadJson(openingRuntimePath);
const evidenceCorpus = loadJson(evidenceCorpusPath);
const routing = loadJson(routingPath);
assertSealed(plan, "planHash");
assertSealed(checkpoint, "checkpointHash");
assertSealed(productionCheckpoint, "checkpointHash");
assertSealed(openingReport, "reportHash");
assertSealed(openingRuntime, "runtimeHash");
assert.equal(plan.planHash, current.planHash);
assert.equal(checkpoint.planHash, plan.planHash);
assert.equal(openingRuntime.planHash, plan.planHash);
assert.equal(plan.selectedTasks.length, 64);

const freshCheckpointObjectHashBefore = stableGraphHash(checkpoint);
const productionCheckpointObjectHashBefore = stableGraphHash(
  productionCheckpoint,
);
const assassinationGroups = new Map((plan.groupPlans || []).filter((group) =>
  group.goalFamily === "assassination").map((group) => [group.groupKey, group]));
const assassinationTasks = (plan.selectedTasks || []).filter((task) =>
  assassinationGroups.has(task.groupKey));
const supportedTasks = assassinationTasks.filter((task) =>
  warmachineMatchupAssassinationTerminalTaskSupportedV1(task));
const roleIncompatibleTasks = supportedTasks.filter((task) => {
  const actorTaskSideKey = task.executionEnvelope?.actorAxis?.taskSideKey;
  const sideBinding = task.executionEnvelope?.sideBinding || {};
  return actorTaskSideKey !== sideBinding.winnerTaskSideKey ||
    sideBinding.endingTaskSideKey !== sideBinding.winnerTaskSideKey;
});
assert.equal(supportedTasks.length, 10);
assert.equal(roleIncompatibleTasks.length, 7);
assert.ok(roleIncompatibleTasks.some((task) =>
  task.taskKey === ROLE_INCOMPATIBLE_FAULT_LINE_TASK_KEY));

const preferredTask = supportedTasks.find((task) =>
  task.taskKey === PREFERRED_FILTERED_TASK_KEY);
const fallbackTask = supportedTasks.find((task) =>
  task.taskKey === STRICT_FALLBACK_TASK_KEY);
const faultLineTask = supportedTasks.find((task) =>
  task.taskKey === ROLE_INCOMPATIBLE_FAULT_LINE_TASK_KEY);
const movementTask = supportedTasks.find((task) =>
  task.taskKey === MOVEMENT_FALLBACK_TASK_KEY);
assert.ok(preferredTask);
assert.ok(fallbackTask);
assert.ok(faultLineTask);
assert.ok(movementTask);
for (const terminalTask of supportedTasks) {
  assert.equal(
    checkpoint.tasks.find((row) => row.taskKey === terminalTask.taskKey)?.status,
    "queued",
  );
  const groupPlan = assassinationGroups.get(terminalTask.groupKey);
  const routedGroup = (routing.routedGroups || []).find((group) =>
    group.groupKey === terminalTask.groupKey);
  assert.ok(groupPlan);
  assert.ok(routedGroup);
  assert.equal(routedGroup.goalFamily, "assassination");
  assert.ok(groupPlan.representativeKeys.includes(
    terminalTask.representative.subcellKey,
  ));
  assert.ok(routedGroup.representativeKeys.includes(
    terminalTask.representative.subcellKey,
  ));
}

const preferredOpening = openingForTask(
  preferredTask,
  openingReport,
  openingRuntime.openings,
);
const fallbackOpening = openingForTask(
  fallbackTask,
  openingReport,
  openingRuntime.openings,
);
assert.equal(preferredOpening.modelCount, 78);
assert.equal(fallbackOpening.modelCount, 78);

const adapter = buildWarmachineMatchupAssassinationTerminalTaskAdapterV1();
assert.equal(adapter.supports({ terminalTask: preferredTask }), true);
assert.equal(adapter.supports({ terminalTask: fallbackTask }), true);
const unsupported = assassinationTasks.find((task) =>
  !supportedTasks.some((supported) => supported.taskKey === task.taskKey));
assert.ok(unsupported);
assert.equal(adapter.supports({ terminalTask: unsupported }), false);

// A disposable clone proves the real lease transition without touching the
// production checkpoint object or file. The execution batch below leases a
// second fresh clone and records its results through the same batch contract.
const leasePreview = acquireWarmachineMatchupTerminalRootBatchLeaseV1(
  structuredClone(checkpoint),
  plan,
  {
    workerId: "verify-assassination-terminal-task-adapter-lease-preview",
    nowMs: 2_000_000,
    leaseDurationMs: 600_000,
    maximumTasks: supportedTasks.length,
    taskKeys: supportedTasks.map((task) => task.taskKey),
  },
);
assert.deepEqual(leasePreview.acquiredTaskKeys,
  supportedTasks.map((task) => task.taskKey));
for (const taskKey of leasePreview.acquiredTaskKeys) {
  const leased = leasePreview.checkpoint.tasks.find((row) =>
    row.taskKey === taskKey);
  assert.equal(leased.status, "leased");
  assert.equal(
    leased.lease.workerId,
    "verify-assassination-terminal-task-adapter-lease-preview",
  );
  assert.ok(leased.lease.leaseKey);
}
assert.equal(stableGraphHash(checkpoint), freshCheckpointObjectHashBefore);

const firstExecution = executeWarmachineMatchupTerminalTaskBatchV1({
  plan,
  checkpoint: structuredClone(checkpoint),
  openingReport,
  openingRuntime,
  evidenceCorpus,
  workerId: "verify-assassination-terminal-task-adapter",
  nowMs: 3_000_000,
  leaseDurationMs: 600_000,
  maximumTasks: supportedTasks.length,
  materializerContext: {
    candidateChunkSize: 16,
    transitionChunkSize: 64,
  },
  materializersByGoalFamily: {
    assassination: adapter,
  },
});
let resumedCheckpoint = firstExecution.checkpoint;
const latestArtifactByTaskKey = new Map(firstExecution.artifacts.map(
  (artifact) => [artifact.taskKey, artifact],
));
let candidateResumeBatchCount = 0;
while (supportedTasks.some((task) => resumedCheckpoint.tasks.find((row) =>
  row.taskKey === task.taskKey)?.status !== "completed")) {
  candidateResumeBatchCount += 1;
  assert.ok(candidateResumeBatchCount <= 64);
  const resumedExecution = executeWarmachineMatchupTerminalTaskBatchV1({
    plan,
    checkpoint: resumedCheckpoint,
    openingReport,
    openingRuntime,
    evidenceCorpus,
    workerId:
      `verify-assassination-terminal-task-adapter-resume-${candidateResumeBatchCount}`,
    nowMs: 3_000_000 + candidateResumeBatchCount * 1_000,
    leaseDurationMs: 600_000,
    maximumTasks: supportedTasks.length,
    materializerContext: {
      candidateChunkSize: 16,
      transitionChunkSize: 64,
    },
    materializersByGoalFamily: {
      assassination: adapter,
    },
  });
  assert.ok(resumedExecution.report.executedTaskCount > 0);
  assert.equal(
    resumedExecution.report.checkpointBeforeHash,
    resumedCheckpoint.checkpointHash,
  );
  assert.notEqual(
    resumedExecution.report.checkpointAfterHash,
    resumedExecution.report.checkpointBeforeHash,
  );
  resumedCheckpoint = resumedExecution.checkpoint;
  for (const artifact of resumedExecution.artifacts) {
    latestArtifactByTaskKey.set(artifact.taskKey, artifact);
  }
}
const execution = {
  ...firstExecution,
  checkpoint: resumedCheckpoint,
  artifacts: supportedTasks.map((task) =>
    latestArtifactByTaskKey.get(task.taskKey)),
};
assert.equal(execution.report.executedTaskCount, supportedTasks.length);
assert.deepEqual(execution.report.executedTaskKeys,
  supportedTasks.map((task) => task.taskKey));
assert.equal(execution.artifacts.length, supportedTasks.length);
assert.notEqual(execution.report.checkpointAfterHash,
  execution.report.checkpointBeforeHash);
assert.equal(execution.report.checkpointBeforeHash, checkpoint.checkpointHash);
assert.equal(execution.checkpoint.tasks.find((row) =>
  row.taskKey === PREFERRED_FILTERED_TASK_KEY)?.status, "completed");
assert.equal(execution.checkpoint.tasks.find((row) =>
  row.taskKey === STRICT_FALLBACK_TASK_KEY)?.status, "completed");
assert.equal(execution.checkpoint.tasks.find((row) =>
  row.taskKey === ROLE_INCOMPATIBLE_FAULT_LINE_TASK_KEY)?.status, "completed");

const filtered = execution.artifacts.find((artifact) =>
  artifact.taskKey === PREFERRED_FILTERED_TASK_KEY);
assert.ok(filtered);
assertSealed(filtered.report);
if (process.env.DEBUG_MATCHUP_ASSASSINATION_TASK === "1") {
  process.stderr.write(`${JSON.stringify(filtered.report, null, 2)}\n`);
}
assert.equal(filtered.disposition, "proposal_filtered");
assert.equal(filtered.report.disposition, "proposal_filtered");
assert.equal(filtered.report.authority, "search_relation");
assert.equal(filtered.report.reason,
  "assassination_terminal_payload_decline_made_to_haul_incompatible");
assert.equal(filtered.report.matchupTerminalRootProven, false);
assert.equal(
  filtered.report.candidateFilterEvidence.requestedPayloadMoveDecision,
  "eligible_move_declined",
);
assert.equal(
  filtered.report.candidateFilterEvidence.requestedMadeToHaulDecision,
  "eligible_cohort_with_clear_path",
);
assert.equal(
  filtered.report.candidateFilterEvidence
    .madeToHaulDecisionWindowOccursAfterDecline,
  false,
);
assert.equal(
  filtered.report.candidateFilterEvidence.jointRelationExecutable,
  false,
);
assert.equal(
  filtered.report.candidateFilterEvidence.representativeMappingAudit
    .exactPartitionMappingProven,
  true,
);

const strict = execution.artifacts.find((artifact) =>
  artifact.taskKey === STRICT_FALLBACK_TASK_KEY);
assert.ok(strict);
assertSealed(strict.report);
if (process.env.DEBUG_MATCHUP_ASSASSINATION_TASK === "1") {
  process.stderr.write(`${JSON.stringify(strict.report, null, 2)}\n`);
}
assert.equal(strict.disposition, "strict_materialized");
assert.equal(strict.report.disposition, "strict_materialized");
assert.equal(strict.report.authority, "rules_v1_host");
assert.equal(strict.report.strictRulesConclusion, true);
assert.equal(strict.report.strictReplayCertified, true);
assert.equal(strict.report.matchupTerminalRootProven, true);
assert.equal(strict.report.reason,
  "assassination_terminal_full_health_route_strictly_materialized");

const root = strict.report.root;
assert.equal(root.taskKey, STRICT_FALLBACK_TASK_KEY);
assert.equal(root.scenarioKey, "pressure_point");
assert.equal(root.roundNumber, 7);
assert.equal(root.terminalClassKey, "unique_leader_assassination");
assert.equal(root.terminalCauseKey, "active_attack_or_effect");
assert.equal(root.winnerSideKey, "player2");
assert.equal(root.loserSideKey, "player1");
assert.equal(root.endingSideKey, "player2");
assert.equal(root.completeRealRosterState, true);
assert.equal(root.modelCount, 78);
assert.equal(root.inPlayModelCount, 76);
assert.deepEqual(root.priorLossPieceKeys, [
  "player1_gorman_di_wulfe_revolutionary_agent_14_1",
  "player2_cylena_raefyll_9_1",
]);
assert.equal(root.actorPieceKey, "player2_vordak_21_1");
assert.equal(root.controllerPieceKey,
  "player2_ashmael_keeper_of_whispers_1_1");
assert.equal(root.targetPieceKey,
  "player1_master_necrosurgeon_sepsira_1_1");
assert.equal(root.attackProfileKey,
  "b2930418-2cdf-42ac-9afa-bf7f3bb270a4");
assert.equal(root.attackProfileName, "Talon");
assert.equal(root.geometry.actorTargetEdgeDistanceIn, 0.4);
assert.ok(root.geometry.actorTargetEdgeDistanceIn <
  root.geometry.actorMeleeRangeIn);
assert.ok(root.geometry.actorControllerEdgeDistanceIn <
  root.geometry.controllerControlRangeIn);
assert.equal(root.geometrySearchAudit.completionMode, "existence");
assert.equal(root.geometrySearchAudit.candidateCount, 256);
assert.equal(root.geometrySearchAudit.witnessFound, true);
assert.ok(root.geometrySearchAudit.evaluatedCandidateCount >= 1);
assert.equal(
  root.geometrySearchAudit.evaluatedCandidateCount +
    root.geometrySearchAudit.unenumeratedCandidateCount,
  root.geometrySearchAudit.candidateCount,
);
assert.equal(root.geometrySearchAudit.probabilityClosureEligible, false);
assert.deepEqual(root.geometrySearchAudit.unresolvedValueInterval, [0, 1]);
assert.equal(root.geometrySearchAudit.equivalenceContract.sameBaseSizeAloneIsProof,
  false);
assert.equal(root.geometrySearchAudit.equivalenceContract
  .circularOrReflectionSymmetryAloneIsProof, false);
assert.ok(root.geometrySearchAudit.witnessRelationSignature.signatureHash);
assert.equal(root.lineOfSightEvidence.hasClearLine, true);
assert.equal(root.lineOfSightEvidence.blockedLineCount, 0);
assert.equal(root.lineOfSightEvidence.sampleLineCount, 81);
assert.equal(root.lineOfSightEvidence.clearLineCount, 81);
assert.equal(root.lineOfSightEvidence.actionType,
  "boosted_hit_damage_purchased_additional_melee_attack");
assert.equal(root.lineOfSightEvidence.actionKey, root.fatalActionKey);
assert.equal(root.lineOfSightEvidence.actorPieceKey, root.actorPieceKey);
assert.equal(root.lineOfSightEvidence.targetPieceKey, root.targetPieceKey);
assert.equal(root.lineOfSightEvidence.attackProfileKey,
  root.attackProfileKey);
assert.equal(root.fatalActionType,
  "boosted_hit_damage_purchased_additional_melee_attack");
assert.ok(root.fatalActionReceiptHash);
assert.ok(root.replayFatalActionReceiptHash);
assert.notEqual(root.fatalActionReceiptHash,
  root.replayFatalActionReceiptHash);
assert.equal(root.fatalDamageCommitActionType,
  "resolve_lifecycle_trigger_decline");
assert.ok(root.fatalDamageCommitReceiptHash);
assert.ok(root.replayFatalDamageCommitReceiptHash);
assert.notEqual(root.fatalDamageCommitReceiptHash,
  root.replayFatalDamageCommitReceiptHash);
assert.notEqual(root.fatalActionReceiptHash,
  root.fatalDamageCommitReceiptHash);
assert.equal(root.candidateLineOfSightEvidence.actionType, "melee_attack");
assert.equal(root.candidateLineOfSightEvidence.actorPieceKey,
  root.actorPieceKey);
assert.equal(root.candidateLineOfSightEvidence.targetPieceKey,
  root.targetPieceKey);
assert.equal(root.partitionAudit.ok, true);
assert.equal(root.partitionAudit.checks.every((check) => check.passed), true);
assert.equal(
  root.representativeMappingAudit.exactPartitionMappingProven,
  true,
);
assert.equal(root.representativeMappingAudit.sidePermutationKey, "identity");
assert.equal(root.taskRepresentativeSubcellKey,
  fallbackTask.representative.subcellKey);
assert.equal(root.hostRepresentativeSubcellKey,
  fallbackTask.representative.subcellKey);

assert.deepEqual(actionTypes(root), EXPECTED_ACTION_TYPES);
assert.equal(root.actionSequence.length, 5);
assert.equal(root.actionSequence.every((row) => Boolean(row.actionKey) &&
  Boolean(row.receiptHash)), true);
assert.deepEqual(root.damageTimeline.map((row) => row.damage), [8, 8, 14]);
assert.deepEqual(root.damageTimeline.map((row) => row.boxesRemainingAfter),
  [9, 1, 0]);
assert.equal(root.totalAppliedDamage, 30);
assert.equal(root.targetStartingBoxes, 17);
assert.equal(root.targetMaxBoxes, 17);
assert.equal(root.targetEndingBoxes, 0);
assert.equal(root.targetDestroyed, true);
assert.equal(root.targetRemovedFromPlay, false);
assert.deepEqual(root.lifecycleSequence, ["disabled", "boxed", "destroyed"]);
assert.equal(root.continuousEffects.length, 3);
assert.equal(root.continuousEffects.every((row) =>
  row.continuousEffectType === "torment"), true);
assert.deepEqual(root.forcedResources, [{
  amount: 3,
  eventType: "fury_forced",
  reason: "boosted_hit_damage_purchased_additional_melee_attack",
  remaining: 3,
  resourceKind: "fury",
}]);
assert.equal(root.terminalEvent.winnerSideKey, "player2");
assert.ok(root.receiptHash);
assert.ok(root.replayReceiptHash);
assert.ok(root.primaryActivationReceiptHash);
assert.ok(root.replayActivationReceiptHash);
assert.notEqual(root.receiptHash, root.replayReceiptHash);
assert.equal(root.terminalStateHash, root.replayTerminalStateHash);
assert.equal(root.strictReplayCertified, true);

assert.equal(strict.runtime.predecessorStateHash, root.predecessorStateHash);
assert.equal(strict.runtime.terminalStateHash, root.terminalStateHash);
assert.equal(strict.runtime.replayTerminalStateHash,
  root.replayTerminalStateHash);
assert.equal(warmachineReverseStateSemanticHashV1(
  strict.runtime.predecessorState,
), root.predecessorStateHash);
assert.equal(warmachineReverseStateSemanticHashV1(
  strict.runtime.terminalState,
), root.terminalStateHash);
assert.equal(warmachineReverseStateSemanticHashV1(
  strict.runtime.replayTerminalState,
), root.replayTerminalStateHash);
assert.equal(strict.runtime.placementAuditPassed, true);
assert.equal(strict.runtime.formationAuditPassed, true);
assert.equal(strict.runtime.primaryReceiptCount, 5);
assert.equal(strict.runtime.replayReceiptCount, 5);
assert.deepEqual(strict.runtime.primaryReceiptHashes,
  root.actionSequence.map((row) => row.receiptHash));
assert.equal(strict.runtime.primaryReceiptHashes.every(Boolean), true);
assert.equal(strict.runtime.replayReceiptHashes.every(Boolean), true);

const faultLine = execution.artifacts.find((artifact) =>
  artifact.taskKey === ROLE_INCOMPATIBLE_FAULT_LINE_TASK_KEY);
assert.ok(faultLine);
assertSealed(faultLine.report);
assert.equal(faultLine.disposition, "proposal_filtered");
assert.equal(faultLine.report.authority, "search_relation");
assert.equal(faultLine.report.reason,
  "assassination_terminal_active_action_role_relation_incompatible");
assert.equal(faultLine.report.candidateFilterEvidence
  .actionRoleBindingEvidence.compatible, false);
assert.equal(faultLine.report.candidateFilterEvidence
  .actionRoleBindingEvidence.actorTaskSideKey,
  "challenger");
assert.equal(faultLine.report.candidateFilterEvidence
  .actionRoleBindingEvidence.winnerTaskSideKey,
  "subject");
assert.equal(faultLine.report.candidateFilterEvidence
  .actionRoleBindingEvidence.endingTaskSideKey,
  "subject");
const roleIncompatibleArtifacts = execution.artifacts.filter((artifact) =>
  roleIncompatibleTasks.some((task) => task.taskKey === artifact.taskKey));
assert.equal(roleIncompatibleArtifacts.length, roleIncompatibleTasks.length);
assert.equal(roleIncompatibleArtifacts.every((artifact) =>
  artifact.disposition === "proposal_filtered" &&
  artifact.report.reason ===
    "assassination_terminal_active_action_role_relation_incompatible" &&
  artifact.report.candidateFilterEvidence?.actionRoleBindingEvidence
    ?.compatible === false), true);

const movement = execution.artifacts.find((artifact) =>
  artifact.taskKey === MOVEMENT_FALLBACK_TASK_KEY);
assert.ok(movement);
assertSealed(movement.report);
assert.equal(movement.disposition, "strict_materialized");
assert.equal(movement.report.root.scenarioKey, "pressure_point");
assert.equal(movement.report.root.roundNumber, 7);
assert.equal(movement.report.root.partitionAudit.ok, true);
assert.equal(movement.report.root.geometry.requiresPriorMovement, true);
assert.ok(movement.report.root.geometry.actorTargetEdgeDistanceIn >
  movement.report.root.geometry.actorMeleeRangeIn);
assert.equal(movement.report.root.actionSequence[0].actionType,
  "advance_then_melee_attack");
assert.equal(movement.report.root.candidateLineOfSightEvidence.actionType,
  "advance_then_melee_attack");
assert.equal(movement.report.root.candidateLineOfSightEvidence.code,
  "STRICT_ADVANCE_THEN_MELEE_LOS_BASE_TO_BASE_CLEAR_V20260821");
assert.equal(movement.report.root.strictReplayCertified, true);

const tamperedEvidence = structuredClone(evidenceCorpus);
tamperedEvidence.hostReceiptHash = "tampered";
const invalid = materializeWarmachineMatchupAssassinationTerminalTaskV1({
  terminalTask: fallbackTask,
  groupPlan: assassinationGroups.get(fallbackTask.groupKey),
  opening: fallbackOpening,
  plan,
  evidenceCorpus: tamperedEvidence,
});
assertSealed(invalid.report);
assert.equal(invalid.report.disposition, "input_invalid");
assert.equal(invalid.report.authority, "input_contract");
assert.equal(invalid.report.matchupTerminalRootProven, false);

assert.equal(stableGraphHash(checkpoint), freshCheckpointObjectHashBefore);
const productionCheckpointTextAfter = fs.readFileSync(checkpointPath, "utf8");
assert.equal(productionCheckpointTextAfter, productionCheckpointTextBefore);
const productionCheckpointAfter = JSON.parse(productionCheckpointTextAfter);
assert.equal(stableGraphHash(productionCheckpointAfter),
  productionCheckpointObjectHashBefore);
assert.equal(productionCheckpointAfter.checkpointHash,
  productionCheckpoint.checkpointHash);

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion:
    "verify_matchup_assassination_terminal_task_materializer_v1",
  planHash: plan.planHash,
  productionCheckpointHash: productionCheckpoint.checkpointHash,
  productionCheckpointUnchanged: true,
  cloneLeaseTaskKeys: leasePreview.acquiredTaskKeys,
  filteredTaskKey: PREFERRED_FILTERED_TASK_KEY,
  filteredReason: filtered.report.reason,
  strictTaskKey: STRICT_FALLBACK_TASK_KEY,
  roleIncompatibleFaultLineTaskKey: ROLE_INCOMPATIBLE_FAULT_LINE_TASK_KEY,
  roleIncompatibleTaskCount: roleIncompatibleTasks.length,
  movementTaskKey: MOVEMENT_FALLBACK_TASK_KEY,
  candidateResumeBatchCount,
  strictOpeningKey: fallbackOpening.openingKey,
  modelCount: root.modelCount,
  inPlayModelCount: root.inPlayModelCount,
  actorPieceKey: root.actorPieceKey,
  targetPieceKey: root.targetPieceKey,
  attackProfileName: root.attackProfileName,
  geometrySearch: {
    candidateCount: root.geometrySearchAudit.candidateCount,
    evaluatedCandidateCount: root.geometrySearchAudit.evaluatedCandidateCount,
    excludedCandidateCount: root.geometrySearchAudit.excludedCandidateCount,
    unenumeratedCandidateCount:
      root.geometrySearchAudit.unenumeratedCandidateCount,
    witnessCandidateKey: root.geometrySearchAudit.witnessCandidateKey,
    probabilityClosureEligible:
      root.geometrySearchAudit.probabilityClosureEligible,
    auditHash: root.geometrySearchAudit.auditHash,
  },
  actionTypes: actionTypes(root),
  damageTimeline: root.damageTimeline,
  lifecycleSequence: root.lifecycleSequence,
  primaryReceiptHash: root.receiptHash,
  replayReceiptHash: root.replayReceiptHash,
  terminalStateHash: root.terminalStateHash,
  reportHash: strict.report.reportHash,
  invalidDisposition: invalid.report.disposition,
  claimBoundary: strict.report.claimBoundary,
}, null, 2)}\n`);
