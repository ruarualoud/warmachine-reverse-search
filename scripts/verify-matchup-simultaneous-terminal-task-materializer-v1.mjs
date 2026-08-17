#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import {
  buildWarmachineMatchupSimultaneousTerminalTaskAdapterV1,
  materializeWarmachineMatchupSimultaneousTerminalTaskV1,
  warmachineMatchupSimultaneousTerminalTaskSupportedV1,
} from
  "../src/matchup/matchup-simultaneous-terminal-task-materializer-v1.mjs";
import { executeWarmachineMatchupTerminalTaskBatchV1 } from
  "../src/matchup/matchup-terminal-task-execution-batch-v1.mjs";
import { buildWarmachineMatchupTerminalRootBatchCheckpointV1 } from
  "../src/matchup/matchup-terminal-root-batch-v1.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const TASK_KEY =
  "matchup-terminal-task-d5a87e643ed695dd51046193317fb95c";
const WOLVES_TASK_KEY =
  "matchup-terminal-task-f69320a22ec69c23abba2876e5a02cbe";
const PRESSURE_TASK_KEYS = Object.freeze([
  "matchup-terminal-task-316a75bb7ece185b5458788391efe0e2",
  "matchup-terminal-task-ad6248b170f3f21ac4c3be49b26b70bb",
  "matchup-terminal-task-5a609d19d9aa221dc9f4be5803217f15",
  "matchup-terminal-task-a2fdf0b760eab169a953414b22e744e7",
  "matchup-terminal-task-6517af440b1179e5ebb03da3b4095d8e",
]);
const GORMAN_FILTER_EXPECTATIONS = Object.freeze({
  "matchup-terminal-task-d3eddbffd6f093feebd6b96874a7c54b": {
    disposition: "strict_rejected",
    reason: "line_of_sight_blocked",
    partition: "terrain_blocked",
  },
  "matchup-terminal-task-891d34d003b0c212e65c9ceda3a35225": {
    disposition: "proposal_filtered",
    reason: "simultaneous_terminal_full_health_gorman_warhead_not_lethal",
    partition: "one_focus",
  },
  "matchup-terminal-task-45a743bb2473cb032c0e33bc1469b994": {
    disposition: "strict_rejected",
    reason: "line_of_sight_blocked",
    partition: "model_blocked",
  },
  "matchup-terminal-task-f4b010deae4d462a232948edac2e9028": {
    disposition: "proposal_filtered",
    reason: "simultaneous_terminal_full_health_gorman_warhead_not_lethal",
    partition: "removed_from_play_history",
  },
  "matchup-terminal-task-66e60897f2b884020789e78c29216404": {
    disposition: "proposal_filtered",
    reason: "simultaneous_terminal_full_health_gorman_warhead_not_lethal",
    partition: "channeled_excarnate",
  },
  "matchup-terminal-task-b864ada1c5480bf44dfd6991ff4d6628": {
    disposition: "proposal_filtered",
    reason: "simultaneous_terminal_gorman_stealth_automatic_miss_not_terminal",
    partition: "stealth_automatic_miss",
  },
});
const OPENING_KEY =
  "matchup-terminal-opening-69cb8614ced7860ec155bb6dc2e7b3bf3a0ff3572eb0771089b522be4bc24c48";
const FILTER_REASON = "simultaneous_terminal_full_health_spray_not_lethal";
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

const batchRoot = path.join(outputDirectory, "terminal-root-batch-v1");
const current = loadJson(path.join(batchRoot, "CURRENT.json"));
assertSealed(current, "currentHash");
assert.equal(current.hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(
  current.constructionHostReceiptHash,
  warmachineConstructionHost.receipt.receiptHash,
);
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
assertSealed(plan, "planHash");
assertSealed(checkpoint, "checkpointHash");
assertSealed(openingReport, "reportHash");
assertSealed(openingRuntime, "runtimeHash");
assert.equal(plan.planHash, current.planHash);
assert.equal(checkpoint.planHash, plan.planHash);
assert.equal(openingRuntime.planHash, plan.planHash);

const simultaneousGroups = new Map((plan.groupPlans || []).filter((group) =>
  group.goalFamily === "simultaneous_leader_tiebreak").map((group) => [
  group.groupKey,
  group,
]));
const simultaneousTasks = (plan.selectedTasks || []).filter((task) =>
  simultaneousGroups.has(task.groupKey));
const supportedTasks = simultaneousTasks.filter((task) =>
  warmachineMatchupSimultaneousTerminalTaskSupportedV1(task));
assert.equal(supportedTasks.length, 13);
const terminalTask = supportedTasks.find((task) => task.taskKey === TASK_KEY);
assert.ok(terminalTask);
assert.equal(terminalTask.taskKey, TASK_KEY);
assert.equal(
  terminalTask.representative.sourceResolutionStatus,
  "officially_confirmed",
);
assert.equal(
  terminalTask.representative.terminalClassKey,
  "simultaneous_leader_tiebreak",
);
assert.equal(terminalTask.sidePermutationKey, "swap");
const checkpointTask = checkpoint.tasks.find((row) =>
  row.taskKey === terminalTask.taskKey);
assert.ok(checkpointTask);
const groupPlan = simultaneousGroups.get(terminalTask.groupKey);
assert.ok(groupPlan);

const openingLedger = openingReport.taskLedger.find((row) =>
  row.terminalTaskKey === terminalTask.taskKey);
assert.equal(openingLedger?.disposition, "strict_opening_materialized");
assert.equal(openingLedger?.openingKey, OPENING_KEY);
const opening = openingRuntime.openings.find((row) =>
  row.openingKey === openingLedger.openingKey);
assert.ok(opening);
assert.equal(opening.openingKey, OPENING_KEY);
assert.equal(opening.modelCount, 81);
assert.equal(opening.state.pieces.length, opening.modelCount);
assert.equal(stableGraphHash(opening.state), opening.strictOpeningStateHash);
assert.ok(opening.state.pieces.every((piece) => piece.pieceKey));

const adapter = buildWarmachineMatchupSimultaneousTerminalTaskAdapterV1();
assert.equal(adapter.supports({ terminalTask, groupPlan }), true);
const unsupportedTask = simultaneousTasks.find((task) =>
  !supportedTasks.some((supported) => supported.taskKey === task.taskKey));
assert.ok(unsupportedTask);
assert.equal(adapter.supports({ terminalTask: unsupportedTask }), false);

const materialized =
  materializeWarmachineMatchupSimultaneousTerminalTaskV1({
    terminalTask,
    groupPlan,
    opening,
    plan,
    evidenceCorpus,
  });
assertSealed(materialized.report);
assert.equal(materialized.report.disposition, "proposal_filtered");
assert.equal(materialized.report.authority, "search_relation");
assert.equal(materialized.report.reason, FILTER_REASON);
assert.equal(materialized.report.strictRulesConclusion, false);
assert.equal(materialized.report.strictReplayCertified, false);
assert.equal(materialized.report.strictActionReplayCertified, true);
assert.equal(materialized.report.matchupTerminalRootProven, false);
assert.equal(materialized.report.completeRealRosterState, true);
assert.equal(materialized.report.modelCount, opening.modelCount);
assert.equal(materialized.report.terminalTaskKey, terminalTask.taskKey);
assert.equal(materialized.report.openingKey, opening.openingKey);
assert.equal(materialized.report.partitionAudit.ok, true);
assert.equal(materialized.report.partitionAudit.checks.every((row) =>
  row.passed), true);
assert.equal(
  materialized.report.representativeMappingAudit.exactPartitionMappingProven,
  true,
);
assert.equal(
  materialized.report.representativeMappingAudit.sidePermutationKey,
  "swap",
);

const filterEvidence = materialized.report.candidateFilterEvidence;
assert.equal(filterEvidence.sourceResolutionStatus, "officially_confirmed");
assert.equal(filterEvidence.completeRealRosterState, true);
assert.equal(filterEvidence.modelCount, opening.modelCount);
assert.equal(filterEvidence.candidateOnlyFiltered, true);
assert.equal(filterEvidence.hostRejectedAction, false);
assert.equal(filterEvidence.requestedTerminalSatisfied, false);
assert.equal(
  filterEvidence.fullHealthMaximumRollStillLeavesBothLeadersInPlay,
  true,
);

const execution = filterEvidence.strictExecution;
assert.equal(execution.strictActionReplayCertified, true);
assert.equal(execution.suppliedMaximumDice, true);
assert.equal(execution.friendlyLeaderStartingBoxes, 16);
assert.equal(execution.enemyLeaderStartingBoxes, 17);
assert.equal(execution.friendlyLeaderDamage, 7);
assert.equal(execution.enemyLeaderDamage, 5);
assert.equal(execution.friendlyLeaderEndingBoxes, 9);
assert.equal(execution.enemyLeaderEndingBoxes, 12);
assert.equal(execution.friendlyLeaderSurvived, true);
assert.equal(execution.enemyLeaderSurvived, true);
assert.equal(execution.terminalEventCount, 0);
assert.equal(execution.simultaneousLeaderDestructionEventCount, 0);
assert.equal(execution.receiptHash, execution.replayReceiptHash);
assert.equal(execution.terminalStateHash, execution.replayTerminalStateHash);
assert.equal(execution.eventHash, execution.replayEventHash);

assert.ok(materialized.runtime);
assert.equal(materialized.runtime.authoredState.pieces.length, 81);
assert.equal(materialized.runtime.placementAudit.ok, true);
assert.equal(materialized.runtime.formationAudit.ok, true);
assert.equal(materialized.runtime.terrainAudit.ok, true);
assert.deepEqual(materialized.runtime.centerControl.securingSides, [
  "player2",
]);
assert.deepEqual(materialized.runtime.presenceControl.securingSides, [
  "player2",
]);
assert.equal(materialized.runtime.primary.transition.ok, true);
assert.equal(materialized.runtime.replay.transition.ok, true);
assert.equal(
  materialized.runtime.primary.receiptHash,
  materialized.runtime.replay.receiptHash,
);
assert.equal(
  materialized.runtime.primary.terminalStateHash,
  materialized.runtime.replay.terminalStateHash,
);
assert.equal(
  stableGraphHash(materialized.runtime.primary.events),
  stableGraphHash(materialized.runtime.replay.events),
);

const pressureResults = new Map();
for (const taskKey of PRESSURE_TASK_KEYS) {
  const pressureTask = supportedTasks.find((task) => task.taskKey === taskKey);
  assert.ok(pressureTask);
  const pressureGroup = simultaneousGroups.get(pressureTask.groupKey);
  assert.ok(pressureGroup);
  const pressureOpeningLedger = openingReport.taskLedger.find((row) =>
    row.terminalTaskKey === pressureTask.taskKey);
  assert.equal(
    pressureOpeningLedger?.disposition,
    "strict_opening_materialized",
  );
  const pressureOpening = openingRuntime.openings.find((row) =>
    row.openingKey === pressureOpeningLedger.openingKey);
  assert.ok(pressureOpening);
  const pressureResult =
    materializeWarmachineMatchupSimultaneousTerminalTaskV1({
      terminalTask: pressureTask,
      groupPlan: pressureGroup,
      opening: pressureOpening,
      plan,
      evidenceCorpus,
    });
  assertSealed(pressureResult.report);
  pressureResults.set(taskKey, pressureResult);
  const coordinates = pressureTask.representative.coordinates;
  if (process.env.DEBUG_MATCHUP_SIMULTANEOUS_TASK === "1" &&
      pressureResult.report.reason ===
        "simultaneous_terminal_exact_partition_audit_failed") {
    process.stderr.write(`${JSON.stringify({
      taskKey,
      coordinates,
      partitionAudit: pressureResult.report.partitionAudit,
      candidateFilterEvidence:
        pressureResult.report.candidateFilterEvidence,
    }, null, 2)}\n`);
  }
  if (process.env.DEBUG_MATCHUP_SIMULTANEOUS_TASK === "1" &&
      pressureResult.report.disposition === "input_invalid") {
    process.stderr.write(`${JSON.stringify({
      taskKey,
      coordinates,
      reason: pressureResult.report.reason,
      inputValidationEvidence:
        pressureResult.report.inputValidationEvidence,
    }, null, 2)}\n`);
  }
  if (coordinates.lineOfSight === "terrain_blocked") {
    assert.equal(pressureResult.report.disposition, "strict_rejected");
    assert.equal(pressureResult.report.authority, "rules_v1_host");
    assert.equal(pressureResult.report.reason, "line_of_sight_blocked");
    assert.equal(
      pressureResult.report.hostRejectionEvidence.partitionAudit.ok,
      true,
    );
    assert.equal(
      pressureResult.report.hostRejectionEvidence
        .lineOfSightEvidence.terrainKey,
      "matchup-simultaneous-terminal-los-obstruction",
    );
    continue;
  }
  assert.equal(pressureResult.report.disposition, "proposal_filtered");
  assert.equal(pressureResult.report.reason, FILTER_REASON);
  assert.equal(pressureResult.report.partitionAudit.ok, true);
  assert.equal(pressureResult.report.strictActionReplayCertified, true);
  assert.equal(
    pressureResult.report.candidateFilterEvidence.requestedTerminalSatisfied,
    false,
  );
  assert.equal(
    pressureResult.runtime.primary.boostDecisionCount,
    pressureResult.runtime.primary.spraySecondaryTargetKeys.length * 2,
  );
  assert.equal(
    pressureResult.runtime.replay.boostDecisionCount,
    pressureResult.runtime.replay.spraySecondaryTargetKeys.length * 2,
  );
  if (coordinates.lifecycle === "loser_prior_losses") {
    assert.equal(pressureResult.runtime.priorLossPieceKeys.length, 1);
    assert.equal(pressureResult.report.partitionAudit.outOfPlayModelCount, 1);
  }
  if (coordinates.lineOfSight === "model_blocked") {
    assert.equal(
      pressureResult.runtime.lineOfSightEvidence.ignoresInterveningModels,
      true,
    );
    assert.equal(
      pressureResult.runtime.lineOfSightEvidence.modelBlockerKeys.includes(
        pressureResult.runtime.authoredModelBlocker.pieceKey,
      ),
      true,
    );
  }
  if (coordinates.actionRange === "on_boundary") {
    assert.ok(Math.abs(
      pressureResult.runtime.geometry.actorTargetEdgeDistanceIn -
      pressureResult.runtime.geometry.attackRangeIn,
    ) <= 1e-6);
  }
  if (coordinates.resource === "controller_transfer_or_channel_available") {
    assert.equal(
      pressureResult.report.partitionAudit.controllerRouteEvidence
        .controllerIsFriendlyLeader,
      true,
    );
    assert.equal(
      pressureResult.report.partitionAudit.controllerRouteEvidence
        .battlegroupIdentityBound,
      true,
    );
    assert.equal(
      pressureResult.report.partitionAudit.controllerRouteEvidence
        .controllerInControlRange,
      true,
    );
    assert.ok(pressureResult.runtime.primary.boostDecisionCount > 0);
  }
}

const wolvesTask = supportedTasks.find((task) =>
  task.taskKey === WOLVES_TASK_KEY);
assert.ok(wolvesTask);
const wolvesGroup = simultaneousGroups.get(wolvesTask.groupKey);
assert.ok(wolvesGroup);
const wolvesOpeningLedger = openingReport.taskLedger.find((row) =>
  row.terminalTaskKey === wolvesTask.taskKey);
assert.equal(
  wolvesOpeningLedger?.disposition,
  "strict_opening_materialized",
);
const wolvesOpening = openingRuntime.openings.find((row) =>
  row.openingKey === wolvesOpeningLedger.openingKey);
assert.ok(wolvesOpening);
const wolvesResult = materializeWarmachineMatchupSimultaneousTerminalTaskV1({
  terminalTask: wolvesTask,
  groupPlan: wolvesGroup,
  opening: wolvesOpening,
  plan,
  evidenceCorpus,
});
assertSealed(wolvesResult.report);
assert.equal(wolvesResult.report.disposition, "strict_materialized");
assert.equal(wolvesResult.report.authority, "rules_v1_host");
assert.equal(wolvesResult.report.strictRulesConclusion, true);
assert.equal(wolvesResult.report.strictReplayCertified, true);
assert.equal(wolvesResult.report.strictActionReplayCertified, true);
assert.equal(wolvesResult.report.matchupTerminalRootProven, true);
assert.equal(wolvesResult.report.completeRealRosterState, true);
assert.equal(wolvesResult.report.modelCount, 78);
assert.equal(wolvesResult.report.partitionAudit.ok, true);
assert.equal(
  wolvesResult.report.partitionAudit.checks.every((row) => row.passed),
  true,
);

const wolvesRoot = wolvesResult.report.root;
const wolvesExecution = wolvesRoot.strictExecution;
assert.equal(wolvesRoot.actionType, "ranged_attack");
assert.equal(wolvesRoot.attackTypeChoice, "experimental_warhead");
assert.equal(wolvesRoot.attackProbabilityEvidence.targetNumber, 14);
assert.equal(wolvesRoot.attackProbabilityEvidence.hitOutcomes, 1);
assert.equal(wolvesRoot.attackProbabilityEvidence.totalOutcomes, 36);
assert.equal(wolvesRoot.attackProbabilityEvidence.automaticHitOutcomes, 1);
assert.equal(wolvesRoot.attackProbabilityEvidence.targetInMelee, true);
assert.equal(
  wolvesRoot.attackProbabilityEvidence.targetInMeleeDefenseBonus,
  4,
);
assert.equal(wolvesRoot.objectiveProgressTokensBefore, 2);
assert.equal(wolvesRoot.objectiveProgressTokensAfter, 2);
assert.deepEqual(wolvesRoot.wolvesAdditions, []);
assert.equal(
  Object.values(wolvesRoot.wolvesDecision.addTokenByObjectiveKey)
    .every((decision) => decision === false),
  true,
);
assert.deepEqual(wolvesExecution.scoreBefore, { player1: 0, player2: 0 });
assert.deepEqual(wolvesExecution.scoreAfter, { player1: 1, player2: 1 });
assert.deepEqual(wolvesExecution.tiebreakerResult.score, {
  player1: 6,
  player2: 3,
});
assert.equal(wolvesExecution.friendlyLeaderEndingBoxes, 0);
assert.equal(wolvesExecution.enemyLeaderEndingBoxes, 0);
assert.ok(wolvesExecution.directHitTargetSwitchDeclineCount > 0);
assert.ok(wolvesExecution.shieldGuardDeclineCount > 0);
assert.equal(wolvesExecution.continuousFireApplied, true);
assert.equal(wolvesExecution.continuousCorrosionApplied, true);
assert.equal(wolvesExecution.requestedTerminalSatisfied, true);
assert.equal(
  wolvesExecution.simultaneousLeaderDestructionEvent.winnerSideKey,
  wolvesRoot.winnerSideKey,
);
assert.equal(wolvesExecution.receiptHash, wolvesExecution.replayReceiptHash);
assert.equal(
  wolvesExecution.terminalStateHash,
  wolvesExecution.replayTerminalStateHash,
);
assert.equal(wolvesExecution.eventHash, wolvesExecution.replayEventHash);
assert.equal(wolvesResult.runtime.primary.transition.ok, true);
assert.equal(wolvesResult.runtime.replay.transition.ok, true);

const gormanFilterResults = new Map();
for (const [taskKey, expectation] of Object.entries(
  GORMAN_FILTER_EXPECTATIONS,
)) {
  const task = supportedTasks.find((candidate) => candidate.taskKey === taskKey);
  assert.ok(task);
  const taskGroup = simultaneousGroups.get(task.groupKey);
  assert.ok(taskGroup);
  const taskOpeningLedger = openingReport.taskLedger.find((row) =>
    row.terminalTaskKey === task.taskKey);
  assert.equal(
    taskOpeningLedger?.disposition,
    "strict_opening_materialized",
  );
  const taskOpening = openingRuntime.openings.find((row) =>
    row.openingKey === taskOpeningLedger.openingKey);
  assert.ok(taskOpening);
  const result = materializeWarmachineMatchupSimultaneousTerminalTaskV1({
    terminalTask: task,
    groupPlan: taskGroup,
    opening: taskOpening,
    plan,
    evidenceCorpus,
  });
  assertSealed(result.report);
  if (process.env.DEBUG_MATCHUP_SIMULTANEOUS_TASK === "1" &&
      result.report.disposition !== expectation.disposition) {
    process.stderr.write(`${JSON.stringify({
      taskKey,
      expectation,
      disposition: result.report.disposition,
      reason: result.report.reason,
      inputValidationEvidence: result.report.inputValidationEvidence,
      candidateFilterEvidence: result.report.candidateFilterEvidence,
      hostRejectionEvidence: result.report.hostRejectionEvidence,
      runtime: result.runtime,
    }, null, 2)}\n`);
  }
  assert.equal(result.report.disposition, expectation.disposition);
  assert.equal(result.report.reason, expectation.reason);
  gormanFilterResults.set(taskKey, result);

  if (expectation.disposition === "strict_rejected") {
    assert.equal(result.report.authority, "rules_v1_host");
    assert.equal(result.report.strictRulesConclusion, true);
    assert.equal(result.report.hostRejectionEvidence.partitionAudit.ok, true);
    assert.equal(
      result.report.hostRejectionEvidence.rejection.reason,
      "line_of_sight_blocked",
    );
    if (expectation.partition === "terrain_blocked") {
      assert.equal(
        result.report.hostRejectionEvidence.lineOfSightEvidence.terrainKey,
        "matchup-simultaneous-terminal-gorman-los-obstruction",
      );
    } else {
      assert.ok(
        result.report.hostRejectionEvidence.lineOfSightEvidence
          .modelBlockerKeys.length > 0,
      );
    }
    continue;
  }

  assert.equal(result.report.authority, "search_relation");
  assert.equal(result.report.strictRulesConclusion, false);
  assert.equal(result.report.strictActionReplayCertified, true);
  assert.equal(result.report.partitionAudit.ok, true);
  assert.equal(
    result.report.candidateFilterEvidence.requestedTerminalSatisfied,
    false,
  );
  assert.equal(
    result.report.candidateFilterEvidence
      .fullHealthMaximumRollStillLeavesBothLeadersInPlay,
    true,
  );
  assert.equal(result.runtime.primary.transition.ok, true);
  assert.equal(result.runtime.replay.transition.ok, true);
  assert.equal(
    result.runtime.primary.receiptHash,
    result.runtime.replay.receiptHash,
  );
  assert.equal(
    result.runtime.primary.terminalStateHash,
    result.runtime.replay.terminalStateHash,
  );
  if (expectation.partition === "one_focus") {
    assert.equal(result.report.partitionAudit.nonzeroResources.length, 1);
    assert.equal(result.report.partitionAudit.nonzeroResources[0].resource, 1);
    assert.equal(
      result.report.partitionAudit.nonzeroResources[0].isWarjack,
      true,
    );
  }
  if (expectation.partition === "removed_from_play_history") {
    assert.equal(result.report.partitionAudit.outOfPlayModelCount, 1);
    assert.equal(result.report.partitionAudit.priorLossPieceKeys.length, 1);
  }
  if (expectation.partition === "channeled_excarnate") {
    assert.equal(
      result.report.partitionAudit.controllerRouteEvidence.legalRoute,
      true,
    );
    assert.equal(
      result.report.partitionAudit.controllerRouteEvidence.actionType,
      "boosted_hit_damage_channeled_offensive_spell",
    );
  }
  if (expectation.partition === "stealth_automatic_miss") {
    assert.equal(
      result.report.partitionAudit.stealthInteractionEvidence.automaticMiss,
      true,
    );
    assert.equal(
      result.report.candidateFilterEvidence.strictExecution
        .automaticMissObserved,
      true,
    );
    assert.equal(
      result.report.candidateFilterEvidence.strictExecution
        .friendlyLeaderDamage,
      0,
    );
    assert.equal(
      result.report.candidateFilterEvidence.strictExecution.enemyLeaderDamage,
      0,
    );
  }
}

const isolatedBatchCheckpoint =
  buildWarmachineMatchupTerminalRootBatchCheckpointV1(plan, { nowMs: 999_000 });
const expectedBatchTaskKey = isolatedBatchCheckpoint.tasks.find((row) =>
  supportedTasks.some((task) => task.taskKey === row.taskKey))?.taskKey;
assert.ok(expectedBatchTaskKey);
const directResultByTaskKey = new Map([
  [TASK_KEY, materialized],
  ...pressureResults.entries(),
  [WOLVES_TASK_KEY, wolvesResult],
  ...gormanFilterResults.entries(),
]);
const batchExecution = executeWarmachineMatchupTerminalTaskBatchV1({
  plan,
  checkpoint: isolatedBatchCheckpoint,
  openingReport,
  openingRuntime,
  evidenceCorpus,
  workerId: "verify-simultaneous-terminal-task-adapter",
  nowMs: 1_000_000,
  maximumTasks: 1,
  materializersByGoalFamily: {
    simultaneous_leader_tiebreak: adapter,
  },
});
assertSealed(batchExecution.report);
assert.equal(batchExecution.report.executedTaskCount, 1);
assert.deepEqual(batchExecution.report.executedTaskKeys, [expectedBatchTaskKey]);
assert.equal(batchExecution.artifacts.length, 1);
const batchArtifact = batchExecution.artifacts[0];
assert.equal(batchArtifact.taskKey, expectedBatchTaskKey);
assertSealed(batchArtifact.report);
const expectedBatchResult = directResultByTaskKey.get(expectedBatchTaskKey);
assert.ok(expectedBatchResult);
assert.equal(
  batchArtifact.report.disposition,
  expectedBatchResult.report.disposition,
);
assert.equal(batchArtifact.report.reason, expectedBatchResult.report.reason);
assert.equal(
  batchArtifact.report.reportHash,
  expectedBatchResult.report.reportHash,
);
assert.equal(batchArtifact.report.strictActionReplayCertified, true);
assert.equal(batchArtifact.report.completeRealRosterState, true);

const tamperedEvidence = structuredClone(evidenceCorpus);
tamperedEvidence.hostReceiptHash = "tampered";
const invalid = materializeWarmachineMatchupSimultaneousTerminalTaskV1({
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
  schemaVersion:
    "verify_matchup_simultaneous_terminal_task_materializer_v1",
  planHash: plan.planHash,
  productionSimultaneousTaskCount: simultaneousTasks.length,
  supportedTaskCount: supportedTasks.length,
  taskKey: terminalTask.taskKey,
  openingKey: opening.openingKey,
  disposition: materialized.report.disposition,
  reason: materialized.report.reason,
  modelCount: materialized.report.modelCount,
  receiptHash: execution.receiptHash,
  replayReceiptHash: execution.replayReceiptHash,
  reportHash: materialized.report.reportHash,
  wolvesTaskKey: wolvesTask.taskKey,
  wolvesReportHash: wolvesResult.report.reportHash,
  wolvesHitProbability:
    wolvesRoot.attackProbabilityEvidence.hitOutcomes /
    wolvesRoot.attackProbabilityEvidence.totalOutcomes,
  gormanFilterTaskCount: gormanFilterResults.size,
  invalidDisposition: invalid.report.disposition,
}, null, 2)}\n`);
