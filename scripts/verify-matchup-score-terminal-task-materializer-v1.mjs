#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";
import {
  buildWarmachineMatchupScoreTerminalTaskAdapterV1,
  materializeWarmachineMatchupScoreTerminalTaskV1,
  warmachineMatchupScoreTerminalTaskSupportedV1,
} from "../src/matchup/matchup-score-terminal-task-materializer-v1.mjs";
import { executeWarmachineMatchupTerminalTaskBatchV1 } from
  "../src/matchup/matchup-terminal-task-execution-batch-v1.mjs";
import { buildWarmachineMatchupTerminalRootBatchCheckpointV1 } from
  "../src/matchup/matchup-terminal-root-batch-v1.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(reverseDirectory,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1"));

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

function openingForTask(task = {}, openings = []) {
  const envelope = task.executionEnvelope || {};
  const representative = task.representative || {};
  return openings.find((opening) =>
    opening.subjectRosterKey === envelope.sourceRosterKeys?.subject &&
    opening.challengerRosterKey === envelope.sourceRosterKeys?.challenger &&
    opening.scenarioKey === representative.scenarioKey &&
    opening.mapKey === task.mapKey &&
    opening.firstPlayerTaskSideKey === task.firstPlayerTaskSideKey &&
    opening.deploymentSeedKey === task.deploymentSeedKey &&
    opening.scenarioTerrainSetupClassKey ===
      representative.coordinates?.scenarioTerrainSetup);
}

const batchRoot = path.join(outputDirectory, "terminal-root-batch-v1");
const current = loadJson(path.join(batchRoot, "CURRENT.json"));
assertSealed(current, "currentHash");
assert.equal(current.hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(current.constructionHostReceiptHash,
  warmachineConstructionHost.receipt.receiptHash);
const planDirectory = path.join(batchRoot, current.relativePlanDirectory);
const plan = loadJson(path.join(planDirectory, "plan.json"));
const checkpoint = loadJson(path.join(planDirectory, "checkpoint.json"));
const openingReport = loadJson(path.join(
  planDirectory,
  "opening-batch-report.json",
));
const openingRuntime = loadJson(path.join(
  planDirectory,
  "opening-batch-runtime.json",
));
const evidenceCorpus = loadJson(path.join(
  outputDirectory,
  "terminal-demand-evidence-corpus.json",
));
const routing = loadJson(path.join(
  outputDirectory,
  "terminal-demand-routing.json",
));
assertSealed(plan, "planHash");
assertSealed(checkpoint, "checkpointHash");
assertSealed(openingReport, "reportHash");
assertSealed(openingRuntime, "runtimeHash");
assert.equal(plan.planHash, current.planHash);
assert.equal(checkpoint.planHash, plan.planHash);
assert.equal(openingRuntime.planHash, plan.planHash);
assert.equal(plan.selectedTasks.length, 64);

const scoreGroups = new Map((plan.groupPlans || []).filter((group) =>
  group.goalFamily === "scenario_score_threshold").map((group) => [
  group.groupKey,
  group,
]));
const scoreTasks = (plan.selectedTasks || []).filter((task) =>
  scoreGroups.has(task.groupKey));
assert.equal(scoreTasks.length, 11);
const supportedTasks = scoreTasks.filter((task) =>
  warmachineMatchupScoreTerminalTaskSupportedV1(task));
assert.equal(supportedTasks.length, 10);
const terminalTask = supportedTasks.find((task) =>
  task.representative.scenarioKey === "wolves_at_our_heels" &&
  task.representative.coordinates?.scoreTransition ===
    "score-transition-87d5b7b6ca0bb8072508ee57" &&
  task.representative.coordinates?.resource === "maximum_native_resource");
const multiSourceTasks = supportedTasks.filter((task) =>
  task.representative.coordinates?.scoreTransition ===
    "score-transition-0054dada47e0734346ef9dfd" &&
  task.representative.coordinates?.resource !== "exact_terminal_payment");
const paymentTasks = supportedTasks.filter((task) =>
  task.representative.coordinates?.resource === "exact_terminal_payment");
const saturatedContestTasks = supportedTasks.filter((task) =>
  task.representative.coordinates?.scenarioControl === "contested");
const highStakesConflictTasks = supportedTasks.filter((task) =>
  task.representative.scenarioKey === "high_stakes");
const wolvesThirdGoalConflictTasks = supportedTasks.filter((task) =>
  task.representative.coordinates?.scoreTransition ===
    "score-transition-30987a13ea0f6d43d1ccd27a");
assert.ok(terminalTask);
assert.equal(paymentTasks.length, 2);
assert.equal(saturatedContestTasks.length, 2);
assert.equal(highStakesConflictTasks.length, 2);
assert.equal(wolvesThirdGoalConflictTasks.length, 1);
assert.deepEqual(multiSourceTasks.map((task) => task.taskKey).sort(), [
  "matchup-terminal-task-97b2ccb784680ff1fe55e41458f043fc",
  "matchup-terminal-task-c91fb293179a20e7265ec38b4483bdca",
]);
assert.equal(terminalTask.taskKey,
  "matchup-terminal-task-a86d7e93f7b5ffed6bca1104244249f7");
const checkpointTask = checkpoint.tasks.find((row) =>
  row.taskKey === terminalTask.taskKey);
assert.ok(checkpointTask);
const groupPlan = scoreGroups.get(terminalTask.groupKey);
const routedGroup = (routing.routedGroups || []).find((group) =>
  group.groupKey === terminalTask.groupKey);
assert.ok(routedGroup);
assert.equal(groupPlan.baseRoutingGroupHash,
  routedGroup.routingGroupHash || routedGroup.groupHash ||
    groupPlan.baseRoutingGroupHash);
assert.equal(routedGroup.goalFamily, "scenario_score_threshold");
assert.ok(routedGroup.representativeKeys.includes(
  terminalTask.representative.subcellKey,
));
const opening = openingForTask(terminalTask, openingRuntime.openings);
assert.ok(opening);
assert.equal(opening.modelCount, 108);
assert.equal(routedGroup.subjectRosterCandidates.some((candidate) =>
  candidate.sourceListKey === opening.subjectRosterKey), true);
assert.equal(routedGroup.challengerRosterCandidates.some((candidate) =>
  candidate.sourceListKey === opening.challengerRosterKey), true);

const adapter = buildWarmachineMatchupScoreTerminalTaskAdapterV1();
assert.equal(adapter.supports({ terminalTask, groupPlan }), true);
const strict = materializeWarmachineMatchupScoreTerminalTaskV1({
  terminalTask,
  groupPlan,
  opening,
  plan,
  evidenceCorpus,
});
assertSealed(strict.report);
assert.equal(strict.report.disposition, "strict_materialized");

const multiSourceRoots = [];
for (const multiSourceTask of multiSourceTasks) {
  const multiSourceOpening = openingForTask(
    multiSourceTask,
    openingRuntime.openings,
  );
  assert.ok(multiSourceOpening);
  const materialized = materializeWarmachineMatchupScoreTerminalTaskV1({
    terminalTask: multiSourceTask,
    groupPlan: scoreGroups.get(multiSourceTask.groupKey),
    opening: multiSourceOpening,
    plan,
    evidenceCorpus,
  });
  assertSealed(materialized.report);
  assert.equal(materialized.report.disposition, "strict_materialized");
  assert.equal(materialized.report.authority, "rules_v1_host");
  assert.equal(materialized.report.reason,
    "score_terminal_multi_source_threshold_strictly_materialized");
  assert.equal(materialized.report.strictReplayCertified, true);
  assert.equal(materialized.report.matchupTerminalRootProven, true);
  assert.deepEqual(materialized.report.root.winnerSourceCounts, {
    objective_40: 2,
    objective_50: 1,
    scenario_terrain_opponent: 1,
  });
  assert.deepEqual(materialized.report.root.opponentSourceCounts, {
    objective_50: 1,
    scenario_terrain_opponent: 1,
  });
  assert.equal(materialized.report.root.partitionAudit.ok, true);
  assert.equal(materialized.report.root.partitionAudit.evidence.every((row) =>
    row.passed), true);
  assert.equal(materialized.report.root.scoringGeometry.length, 6);
  assert.equal(materialized.runtime.placementAudit.ok, true);
  assert.equal(materialized.runtime.formationAudit.ok, true);
  assert.equal(
    warmachineReverseStateSemanticHashV1(
      materialized.runtime.scoreMaterializationRoot.terminalState,
    ),
    materialized.report.root.terminalStateHash,
  );
  if (multiSourceTask.representative.scenarioKey === "payload") {
    assert.equal(materialized.report.root.resourcePieceKey,
      "player1_raptor_22_1");
    assert.deepEqual(Object.keys(materialized.report.root.payloadDecision
      .moveByObjectiveKey).sort(), ["p1-payload", "p2-payload"]);
    assert.equal(Object.values(materialized.report.root.payloadDecision
      .moveByObjectiveKey).every((decision) => decision.decline === true), true);
    assert.equal(materialized.report.root.reserveHistory, null);
  } else {
    assert.equal(multiSourceTask.representative.scenarioKey, "trench_warfare");
    assert.equal(materialized.report.root.resourcePieceKey, "");
    assert.equal(materialized.report.root.reserveHistory.reservePieceKeys.length,
      5);
    assert.deepEqual(materialized.report.root.reserveHistory
      .inPlayNonAmbushPieceKeys, ["player2_sythyss_overseer_4_1"]);
    assert.equal(materialized.runtime.scoreMaterializationRoot.predecessorState
      .scenario.caches.filter((cache) => cache.active !== false).length, 2);
  }
  multiSourceRoots.push(materialized);
}

for (const paymentTask of paymentTasks) {
  const paymentOpening = openingForTask(
    paymentTask,
    openingRuntime.openings,
  );
  const payment = materializeWarmachineMatchupScoreTerminalTaskV1({
    terminalTask: paymentTask,
    groupPlan: scoreGroups.get(paymentTask.groupKey),
    opening: paymentOpening,
    plan,
    evidenceCorpus,
  });
  assertSealed(payment.report);
  assert.equal(payment.report.disposition, "proposal_filtered");
  assert.equal(payment.report.reason,
    "score_terminal_payment_partition_incompatible");
  assert.equal(payment.report.candidateFilterEvidence
    .requestedResourcePartition, "exact_terminal_payment");
  assert.equal(payment.report.candidateFilterEvidence
    .exactTerminalActionType, "end_turn");
  assert.equal(payment.report.candidateFilterEvidence
    .exactTerminalPaymentWitnessPossible, false);
}

for (const contestTask of saturatedContestTasks) {
  const contestOpening = openingForTask(
    contestTask,
    openingRuntime.openings,
  );
  const contest = materializeWarmachineMatchupScoreTerminalTaskV1({
    terminalTask: contestTask,
    groupPlan: scoreGroups.get(contestTask.groupKey),
    opening: contestOpening,
    plan,
    evidenceCorpus,
  });
  assertSealed(contest.report);
  assert.equal(contest.report.disposition, "proposal_filtered");
  assert.equal(contest.report.reason,
    "score_terminal_saturated_elements_contest_incompatible");
  assert.equal(contest.report.candidateFilterEvidence
    .everyScoringElementAllocated, true);
  assert.equal(contest.report.candidateFilterEvidence
    .contestedElementCanAlsoScoreForEitherSide, false);
}

for (const highStakesTask of highStakesConflictTasks) {
  const highStakesOpening = openingForTask(
    highStakesTask,
    openingRuntime.openings,
  );
  const highStakes = materializeWarmachineMatchupScoreTerminalTaskV1({
    terminalTask: highStakesTask,
    groupPlan: scoreGroups.get(highStakesTask.groupKey),
    opening: highStakesOpening,
    plan,
    evidenceCorpus,
  });
  assertSealed(highStakes.report);
  assert.equal(highStakes.report.disposition, "proposal_filtered");
  assert.equal(highStakes.report.reason,
    "score_terminal_high_stakes_zero_countdown_partition_incompatible");
  assert.equal(highStakes.report.candidateFilterEvidence.allowedAtZeroCount, 0);
  assert.equal(highStakes.report.candidateFilterEvidence
    .requestedZeroCountdown50mmBonusCount, 1);
}

const execution = executeWarmachineMatchupTerminalTaskBatchV1({
  plan,
  checkpoint: buildWarmachineMatchupTerminalRootBatchCheckpointV1(plan, {
    nowMs: 0,
  }),
  openingReport,
  openingRuntime,
  evidenceCorpus,
  workerId: "verify-score-terminal-task-adapter",
  nowMs: 1_000_000,
  maximumTasks: wolvesThirdGoalConflictTasks.length,
  materializersByGoalFamily: {
    scenario_score_threshold: {
      supports: ({ terminalTask: candidate } = {}) =>
        wolvesThirdGoalConflictTasks.some((task) =>
          task.taskKey === candidate?.taskKey),
      materialize: adapter.materialize,
    },
  },
});
assert.equal(execution.report.executedTaskCount,
  wolvesThirdGoalConflictTasks.length);
assert.deepEqual([...execution.report.executedTaskKeys].sort(),
  wolvesThirdGoalConflictTasks.map((task) => task.taskKey).sort());
assert.equal(execution.artifacts.length, wolvesThirdGoalConflictTasks.length);
for (const artifact of execution.artifacts) {
  assertSealed(artifact.report);
  assert.equal(artifact.report.disposition, "proposal_filtered");
  assert.equal(artifact.report.authority, "search_relation");
  assert.equal(artifact.report.reason,
    "score_terminal_wolves_declined_third_goal_incompatible");
  assert.equal(artifact.report.matchupTerminalRootProven, false);
  assert.equal(artifact.report.candidateFilterEvidence
    .requestedTokenDecision, "eligible_add_token_declined");
  assert.equal(artifact.report.candidateFilterEvidence
    .requestedThirdProgressTokenGoalCount, 1);
  assert.equal(artifact.report.candidateFilterEvidence
    .declinedDecisionAddsProgressToken, false);
  assert.equal(artifact.report.candidateFilterEvidence
    .thirdProgressTokenGoalRequiresAddedToken, true);
}
assert.equal(strict.report.disposition, "strict_materialized");
assert.equal(strict.report.authority, "rules_v1_host");
assert.equal(strict.report.strictRulesConclusion, true);
assert.equal(strict.report.reason,
  "score_terminal_wolves_threshold_strictly_materialized");
assert.equal(strict.report.terminalTaskKey, terminalTask.taskKey);
assert.equal(strict.report.representativeSubcellKey,
  terminalTask.representative.subcellKey);
assert.equal(strict.report.strictReplayCertified, true);
assert.equal(strict.report.matchupTerminalRootProven, true);
assert.equal(strict.report.root.scenarioKey, "wolves_at_our_heels");
assert.equal(strict.report.root.roundNumber, 3);
assert.equal(strict.report.root.actionType, "end_turn");
assert.equal(strict.report.root.winnerSideKey, "player2");
assert.equal(strict.report.root.endingSideKey, "player1");
assert.deepEqual(strict.report.root.scoreBefore, {
  player1: 0,
  player2: 2,
});
assert.deepEqual(strict.report.root.scoreAfter, {
  player1: 0,
  player2: 3,
});
assert.deepEqual(strict.report.root.winnerSourceCounts, {
  objective_40: 1,
});
assert.deepEqual(strict.report.root.opponentSourceCounts, {});
assert.equal(strict.report.root.objectiveKey, "p2-40");
assert.equal(strict.report.root.objectiveProgressTokensBefore, 2);
assert.equal(
  strict.report.root.wolvesDecision.addTokenByObjectiveKey["p2-40"],
  false,
);
assert.equal(strict.report.root.completeRealRosterState, true);
assert.equal(strict.report.root.modelCount, opening.modelCount);
assert.equal(strict.report.root.partitionAudit.ok, true);
assert.equal(strict.report.root.partitionAudit.evidence.every((row) =>
  row.passed), true);
assert.ok(strict.report.root.receiptHash);
assert.ok(strict.report.root.replayReceiptHash);
assert.equal(strict.report.root.strictReplayCertified, true);
assert.equal(
  strict.report.root.representativeMappingAudit.exactPartitionMappingProven,
  true,
);
assert.equal(
  strict.report.root.representativeMappingAudit.sidePermutationKey,
  "swap",
);
assert.notEqual(
  strict.report.root.taskRepresentativeSubcellKey,
  strict.report.root.hostRepresentativeSubcellKey,
);
assert.equal(strict.runtime.placementAudit.ok, true);
assert.equal(strict.runtime.formationAudit.ok, true);
assert.deepEqual(strict.runtime.objectiveControl.securingSides, ["player2"]);
assert.equal(
  strict.runtime.scoreMaterializationRoot.predecessorState.pieces.length,
  opening.modelCount,
);
assert.equal(
  warmachineReverseStateSemanticHashV1(
    strict.runtime.scoreMaterializationRoot.terminalState,
  ),
  strict.report.root.terminalStateHash,
);

const unsupported = scoreTasks.find((task) =>
  !warmachineMatchupScoreTerminalTaskSupportedV1(task));
assert.ok(unsupported);
assert.equal(adapter.supports({ terminalTask: unsupported }), false);

const tamperedEvidence = structuredClone(evidenceCorpus);
tamperedEvidence.hostReceiptHash = "tampered";
const invalid = materializeWarmachineMatchupScoreTerminalTaskV1({
  terminalTask,
  groupPlan,
  opening,
  plan,
  evidenceCorpus: tamperedEvidence,
});
assertSealed(invalid.report);
assert.equal(invalid.report.disposition, "input_invalid");
assert.equal(invalid.report.authority, "input_contract");
assert.equal(invalid.report.matchupTerminalRootProven, false);

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion: "verify_matchup_score_terminal_task_materializer_v1",
  planHash: plan.planHash,
  productionTaskCount: plan.selectedTasks.length,
  productionScoreTaskCount: scoreTasks.length,
  supportedTaskCount: supportedTasks.length,
  taskKey: terminalTask.taskKey,
  openingKey: opening.openingKey,
  taskRepresentativeSubcellKey:
    strict.report.root.taskRepresentativeSubcellKey,
  hostRepresentativeSubcellKey:
    strict.report.root.hostRepresentativeSubcellKey,
  modelCount: strict.report.root.modelCount,
  scoreBefore: strict.report.root.scoreBefore,
  scoreAfter: strict.report.root.scoreAfter,
  winnerSourceCounts: strict.report.root.winnerSourceCounts,
  receiptHash: strict.report.root.receiptHash,
  replayReceiptHash: strict.report.root.replayReceiptHash,
  reportHash: strict.report.reportHash,
  paymentFilteredTaskKeys: paymentTasks.map((task) => task.taskKey).sort(),
  saturatedContestFilteredTaskKeys: saturatedContestTasks.map((task) =>
    task.taskKey).sort(),
  highStakesConflictTaskKeys: highStakesConflictTasks.map((task) =>
    task.taskKey).sort(),
  wolvesThirdGoalConflictTaskKeys: wolvesThirdGoalConflictTasks.map((task) =>
    task.taskKey).sort(),
  multiSourceStrictTaskKeys: multiSourceTasks.map((task) =>
    task.taskKey).sort(),
  multiSourceReportHashes: multiSourceRoots.map((row) =>
    row.report.reportHash).sort(),
  invalidDisposition: invalid.report.disposition,
}, null, 2)}\n`);
