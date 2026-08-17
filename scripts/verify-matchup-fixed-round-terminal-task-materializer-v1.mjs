#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import {
  materializeWarmachineMatchupFixedRoundTerminalTaskV1,
  warmachineMatchupFixedRoundTerminalTaskSupportedV1,
} from
  "../src/matchup/matchup-fixed-round-terminal-task-materializer-v1.mjs";
import { auditWarmachineMatchupTerminalPartitionCapabilityV1 } from
  "../src/matchup/matchup-terminal-partition-capability-audit-v1.mjs";
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
assertSealed(openingRuntime, "runtimeHash");
assert.equal(plan.planHash, current.planHash);
assert.equal(openingRuntime.planHash, plan.planHash);

const fixedTasks = plan.selectedTasks.filter((task) =>
  task.representative?.terminalClassKey === "fixed_round_limit_result" &&
  task.executionEnvelope?.actionCategory ===
    "defender_fixed_round_turn_end_settlement");
assert.equal(fixedTasks.length, 13);

const strictTask = fixedTasks.find((task) => {
  const coordinates = task.representative.coordinates || {};
  return task.representative.scenarioKey === "pressure_point" &&
    task.representative.sourceResolutionStatus === "officially_confirmed" &&
    coordinates.leaderControl === "outside_or_not_required" &&
    coordinates.lifecycle === "both_rosters_complete" &&
    coordinates.damage === "critical_models_undamaged" &&
    coordinates.resource === "one_additional_purchase_available" &&
    coordinates.scenarioTerrainSetup ===
      "all_flags_fallback_no_valid_terrain" &&
    coordinates.baseTopology === "legal_separated";
});
const payloadFilteredTask = fixedTasks.find((task) => {
  const coordinates = task.representative.coordinates || {};
  return task.representative.scenarioKey === "payload" &&
    task.representative.sourceResolutionStatus === "officially_confirmed" &&
    coordinates.leaderControl === "on_boundary" &&
    coordinates.payloadMoveDecision === "eligible_move_declined" &&
    coordinates.lifecycle === "both_rosters_complete" &&
    coordinates.damage === "critical_models_undamaged" &&
    coordinates.resource === "zero_available" &&
    coordinates.baseTopology === "legal_separated";
});
const presenceTask = fixedTasks.find((task) => {
  const coordinates = task.representative.coordinates || {};
  return task.representative.scenarioKey === "fault_line" &&
    task.representative.sourceResolutionStatus === "officially_confirmed" &&
    coordinates.leaderControl === "outside_or_not_required" &&
    coordinates.lifecycle === "both_rosters_complete" &&
    coordinates.damage === "critical_models_undamaged" &&
    coordinates.resource === "maximum_native_resource" &&
    coordinates.scenarioTerrainSetup === "not_applicable" &&
    coordinates.baseTopology === "legal_separated";
});
const priorLossTask = fixedTasks.find((task) => {
  const coordinates = task.representative.coordinates || {};
  return task.representative.scenarioKey === "pressure_point" &&
    task.representative.sourceResolutionStatus === "officially_confirmed" &&
    coordinates.leaderControl === "outside_or_not_required" &&
    coordinates.lifecycle === "winner_prior_losses" &&
    coordinates.damage === "critical_models_undamaged" &&
    coordinates.resource === "zero_available" &&
    coordinates.scenarioTerrainSetup ===
      "all_flags_fallback_no_valid_terrain" &&
    coordinates.baseTopology === "legal_separated";
});
const contestedPresenceTask = fixedTasks.find((task) => {
  const coordinates = task.representative.coordinates || {};
  return task.representative.scenarioKey === "fault_line" &&
    task.representative.sourceResolutionStatus === "officially_confirmed" &&
    coordinates.leaderControl === "outside_or_not_required" &&
    coordinates.lifecycle === "both_rosters_complete" &&
    coordinates.damage === "critical_models_undamaged" &&
    coordinates.resource === "zero_available" &&
    coordinates.scenarioControl === "contested" &&
    coordinates.scenarioTerrainSetup === "not_applicable" &&
    coordinates.baseTopology === "legal_separated";
});
const incompatiblePaymentTask = fixedTasks.find((task) =>
  task.representative.sourceResolutionStatus === "officially_confirmed" &&
  task.representative.coordinates?.resource === "exact_terminal_payment");
const incompatibleControllerRouteTask = fixedTasks.find((task) =>
  task.representative.sourceResolutionStatus === "officially_confirmed" &&
  task.representative.coordinates?.resource ===
    "controller_transfer_or_channel_available");
const highStakesReserveTask = fixedTasks.find((task) => {
  const coordinates = task.representative.coordinates || {};
  return task.representative.scenarioKey === "high_stakes" &&
    task.representative.sourceResolutionStatus === "officially_confirmed" &&
    coordinates.lifecycle === "reserve_replacement_or_dormant_history" &&
    coordinates.highStakesCountdownState ===
      "one_nonzero_element_reduced" &&
    coordinates.highStakesFuseResolution === "secured_50mm_remove_one" &&
    coordinates.highStakesBlastClosure === "no_detonation" &&
    coordinates.resource === "zero_available" &&
    coordinates.baseTopology === "legal_separated";
});
const unknownTask = fixedTasks.find((task) =>
  task.representative.sourceResolutionStatus ===
    "official_second_tiebreak_still_tied_result_unresolved");
const rejectedTask = fixedTasks.find((task) =>
  task.representative.coordinates?.baseTopology ===
    "outside_table_expected_reject");
assert.ok(strictTask);
assert.ok(presenceTask);
assert.ok(priorLossTask);
assert.ok(contestedPresenceTask);
assert.ok(incompatiblePaymentTask);
assert.ok(incompatibleControllerRouteTask);
assert.ok(highStakesReserveTask);
assert.ok(payloadFilteredTask);
assert.ok(unknownTask);
assert.ok(rejectedTask);
assert.equal(fixedTasks.filter((task) =>
  warmachineMatchupFixedRoundTerminalTaskSupportedV1(task)).length, 12);

const strictOpening = openingForTask(strictTask, openingRuntime.openings);
const presenceOpening = openingForTask(presenceTask, openingRuntime.openings);
const priorLossOpening = openingForTask(priorLossTask, openingRuntime.openings);
const contestedPresenceOpening = openingForTask(
  contestedPresenceTask,
  openingRuntime.openings,
);
const incompatiblePaymentOpening = openingForTask(
  incompatiblePaymentTask,
  openingRuntime.openings,
);
const incompatibleControllerRouteOpening = openingForTask(
  incompatibleControllerRouteTask,
  openingRuntime.openings,
);
const highStakesReserveOpening = openingForTask(
  highStakesReserveTask,
  openingRuntime.openings,
);
const payloadFilteredOpening = openingForTask(
  payloadFilteredTask,
  openingRuntime.openings,
);
const unknownOpening = openingForTask(unknownTask, openingRuntime.openings);
const rejectedOpening = openingForTask(rejectedTask, openingRuntime.openings);
assert.ok(strictOpening);
assert.ok(presenceOpening);
assert.ok(priorLossOpening);
assert.ok(contestedPresenceOpening);
assert.ok(incompatiblePaymentOpening);
assert.ok(incompatibleControllerRouteOpening);
assert.ok(highStakesReserveOpening);
assert.ok(payloadFilteredOpening);
assert.ok(unknownOpening);
assert.ok(rejectedOpening);

const strict = materializeWarmachineMatchupFixedRoundTerminalTaskV1({
  terminalTask: strictTask,
  opening: strictOpening,
  evidenceCorpus,
});
assertSealed(strict.report);
assert.equal(strict.report.disposition, "strict_materialized");
assert.equal(strict.report.terminalTaskKey, strictTask.taskKey);
assert.equal(strict.report.representativeSubcellKey,
  strictTask.representative.subcellKey);
assert.equal(strict.report.authority, "rules_v1_host");
assert.equal(strict.report.strictRulesConclusion, true);
assert.equal(strict.report.strictReplayCertified, true);
assert.equal(strict.report.matchupTerminalRootProven, true);
assert.equal(strict.report.root.taskKey, strictTask.taskKey);
assert.equal(strict.report.root.subcellKey,
  strictTask.representative.subcellKey);
assert.equal(strict.report.root.scenarioKey, "pressure_point");
assert.equal(strict.report.root.roundNumber, 7);
assert.equal(strict.report.root.actionType, "end_turn");
assert.equal(strict.report.root.resultKind, "win");
const stateSideByTaskSide = { subject: "player1", challenger: "player2" };
const expectedWinnerSideKey = stateSideByTaskSide[
  strictTask.executionEnvelope.sideBinding.winnerTaskSideKey
];
const expectedEndingSideKey = stateSideByTaskSide[
  strictTask.executionEnvelope.sideBinding.endingTaskSideKey
];
assert.equal(strict.report.root.winnerSideKey, expectedWinnerSideKey);
assert.equal(strict.report.root.endingSideKey, expectedEndingSideKey);
assert.equal(strict.report.root.strictReplayCertified, true);
assert.equal(strict.report.root.receiptHash,
  strict.report.root.replayReceiptHash);
assert.equal(strict.report.root.completeRealRosterState, true);
assert.equal(strict.report.root.modelCount, strictOpening.modelCount);
assert.equal(strict.report.root.partitionAudit.passed, true);
assert.equal(
  strict.report.root.scoreAfter[strict.report.root.winnerSideKey],
  strict.report.root.scoreAfter[strict.report.root.loserSideKey] + 1,
);
assert.equal(strict.report.root.partitionCoordinates.resource,
  "one_additional_purchase_available");
assert.ok(strict.report.root.resourcePieceKey);
assert.equal(strict.runtime.placementAudit.ok, true);
assert.equal(strict.runtime.formationAudit.ok, true);
assert.equal(strict.runtime.primary.predecessorStateHash,
  strict.runtime.replay.predecessorStateHash);
assert.equal(strict.runtime.primary.terminalStateHash,
  strict.runtime.replay.terminalStateHash);

const priorLoss = materializeWarmachineMatchupFixedRoundTerminalTaskV1({
  terminalTask: priorLossTask,
  opening: priorLossOpening,
  evidenceCorpus,
});
assertSealed(priorLoss.report);
assert.equal(priorLoss.report.disposition, "strict_materialized");
assert.equal(priorLoss.report.authority, "rules_v1_host");
assert.equal(priorLoss.report.strictReplayCertified, true);
assert.equal(priorLoss.report.root.scenarioKey, "pressure_point");
assert.equal(priorLoss.report.root.partitionCoordinates.lifecycle,
  "winner_prior_losses");
assert.equal(priorLoss.report.root.partitionAudit.passed, true);
assert.ok(priorLoss.report.root.priorLossPieceKey);
const priorLossPiece = priorLoss.runtime.predecessor.pieces.find((piece) =>
  piece.pieceKey === priorLoss.report.root.priorLossPieceKey);
assert.equal(priorLossPiece.sideKey, priorLoss.report.root.winnerSideKey);
assert.equal(priorLossPiece.destroyed, true);
assert.equal(priorLossPiece.offTable, true);
assert.equal(priorLossPiece.notDeployed, true);
assert.equal(priorLossPiece.removedFromPlay, false);
assert.equal(priorLoss.report.root.scoreAfter[
  priorLoss.report.root.winnerSideKey
], priorLoss.report.root.scoreAfter[
  priorLoss.report.root.loserSideKey
] + 1);
assert.equal(priorLoss.report.root.receiptHash,
  priorLoss.report.root.replayReceiptHash);
assert.equal(priorLoss.runtime.placementAudit.ok, true);
assert.equal(priorLoss.runtime.formationAudit.ok, true);

const presence = materializeWarmachineMatchupFixedRoundTerminalTaskV1({
  terminalTask: presenceTask,
  opening: presenceOpening,
  evidenceCorpus,
});
assertSealed(presence.report);
assert.equal(presence.report.disposition, "strict_materialized");
assert.equal(presence.report.authority, "rules_v1_host");
assert.equal(presence.report.strictRulesConclusion, true);
assert.equal(presence.report.strictReplayCertified, true);
assert.equal(presence.report.root.scenarioKey, "fault_line");
assert.equal(presence.report.root.roundNumber, 7);
assert.equal(presence.report.root.tiebreakClassKey,
  "victory_points_tied_scenario_presence_advantage");
assert.equal(presence.report.root.scoreAfter.player1,
  presence.report.root.scoreAfter.player2);
assert.equal(presence.report.root.scenarioPresenceScore.player1, 10);
assert.equal(presence.report.root.scenarioPresenceScore.player2, 0);
assert.equal(presence.report.root.scenarioPresenceContributors.length, 1);
assert.equal(
  presence.report.root.scenarioPresenceContributors[0].pieceKey,
  presence.report.root.geometryEvidence.leaderPieceKey,
);
assert.equal(presence.report.root.partitionAudit.passed, true);
assert.equal(presence.report.root.receiptHash,
  presence.report.root.replayReceiptHash);
assert.equal(presence.runtime.placementAudit.ok, true);
assert.equal(presence.runtime.formationAudit.ok, true);
assert.equal(presence.runtime.primary.predecessorStateHash,
  presence.runtime.replay.predecessorStateHash);
assert.equal(presence.runtime.primary.terminalStateHash,
  presence.runtime.replay.terminalStateHash);

const contestedPresence =
  materializeWarmachineMatchupFixedRoundTerminalTaskV1({
    terminalTask: contestedPresenceTask,
    opening: contestedPresenceOpening,
    evidenceCorpus,
  });
assertSealed(contestedPresence.report);
assert.equal(contestedPresence.report.disposition, "strict_materialized");
assert.equal(contestedPresence.report.authority, "rules_v1_host");
assert.equal(contestedPresence.report.strictReplayCertified, true);
assert.equal(contestedPresence.report.root.scenarioKey, "fault_line");
assert.equal(contestedPresence.report.root.partitionCoordinates.scenarioControl,
  "contested");
assert.equal(contestedPresence.report.root.partitionAudit.passed, true);
assert.deepEqual(
  contestedPresence.report.root.partitionAudit.scenarioControlEvidence
    .contestedRow.contestingSides,
  ["player1", "player2"],
);
assert.equal(
  contestedPresence.report.root.partitionAudit.scenarioControlEvidence
    .contestedRow.securingSides.length,
  0,
);
assert.equal(contestedPresence.report.root.scoreAfter.player1,
  contestedPresence.report.root.scoreAfter.player2);
assert.equal(contestedPresence.report.root.scenarioPresenceScore.player1, 10);
assert.equal(contestedPresence.report.root.scenarioPresenceScore.player2, 0);
assert.equal(contestedPresence.report.root.receiptHash,
  contestedPresence.report.root.replayReceiptHash);
assert.equal(contestedPresence.runtime.placementAudit.ok, true);
assert.equal(contestedPresence.runtime.formationAudit.ok, true);

const incompatiblePayment =
  materializeWarmachineMatchupFixedRoundTerminalTaskV1({
    terminalTask: incompatiblePaymentTask,
    opening: incompatiblePaymentOpening,
    evidenceCorpus,
  });
assertSealed(incompatiblePayment.report);
assert.equal(incompatiblePayment.report.disposition, "proposal_filtered");
assert.equal(incompatiblePayment.report.authority, "search_relation");
assert.equal(incompatiblePayment.report.reason,
  "fixed_round_terminal_payment_partition_incompatible");
assert.equal(incompatiblePayment.report.strictRulesConclusion, false);
assert.equal(incompatiblePayment.report.matchupTerminalRootProven, false);
assert.equal(
  incompatiblePayment.report.incompatibilityEvidence
    .requestedResourcePartition,
  "exact_terminal_payment",
);
assert.equal(
  incompatiblePayment.report.incompatibilityEvidence
    .exactTerminalActionType,
  "end_turn",
);
assert.equal(
  incompatiblePayment.report.incompatibilityEvidence
    .exactTerminalPaymentWitnessPossible,
  false,
);
assert.equal(incompatiblePayment.runtime, null);

const incompatibleControllerRoute =
  materializeWarmachineMatchupFixedRoundTerminalTaskV1({
    terminalTask: incompatibleControllerRouteTask,
    opening: incompatibleControllerRouteOpening,
    evidenceCorpus,
  });
assertSealed(incompatibleControllerRoute.report);
assert.equal(incompatibleControllerRoute.report.disposition,
  "proposal_filtered");
assert.equal(incompatibleControllerRoute.report.authority, "search_relation");
assert.equal(incompatibleControllerRoute.report.reason,
  "fixed_round_controller_or_channel_route_partition_incompatible");
assert.equal(incompatibleControllerRoute.report.strictRulesConclusion, false);
assert.equal(incompatibleControllerRoute.report.matchupTerminalRootProven, false);
assert.equal(
  incompatibleControllerRoute.report.incompatibilityEvidence
    .requestedResourcePartition,
  "controller_transfer_or_channel_available",
);
assert.equal(
  incompatibleControllerRoute.report.incompatibilityEvidence
    .exactTerminalActionUsesControllerTransfer,
  false,
);
assert.equal(
  incompatibleControllerRoute.report.incompatibilityEvidence
    .exactTerminalActionUsesSpellChannel,
  false,
);
assert.equal(incompatibleControllerRoute.runtime, null);

const highStakesReserve =
  materializeWarmachineMatchupFixedRoundTerminalTaskV1({
    terminalTask: highStakesReserveTask,
    opening: highStakesReserveOpening,
    evidenceCorpus,
  });
assertSealed(highStakesReserve.report);
assert.equal(highStakesReserve.report.disposition, "strict_materialized",
  JSON.stringify({
    disposition: highStakesReserve.report.disposition,
    reason: highStakesReserve.report.reason,
    partitionAudit: highStakesReserve.report.partitionAudit || null,
    executionPartitionAudit:
      highStakesReserve.report.executionPartitionAudit || null,
  }));
assert.equal(highStakesReserve.report.authority, "rules_v1_host");
assert.equal(highStakesReserve.report.strictRulesConclusion, true);
assert.equal(highStakesReserve.report.strictReplayCertified, true);
assert.equal(highStakesReserve.report.root.scenarioKey, "high_stakes");
assert.equal(highStakesReserve.report.root.partitionAudit.passed, true);
assert.ok(highStakesReserve.report.root.partitionAudit.reserveHistoryEvidence
  .reservePieceKeys.length > 0);
assert.deepEqual(
  highStakesReserve.report.root.partitionAudit.reserveHistoryEvidence
    .reservePieceKeys,
  highStakesReserve.report.root.geometryEvidence.reserveHistory.pieceKeys,
);
assert.deepEqual(
  highStakesReserve.report.root.partitionAudit.reserveHistoryEvidence
    .reserveGroupRows[0].inPlayNonAmbushPieceKeys,
  highStakesReserve.report.root.geometryEvidence.reserveHistory
    .inPlayNonAmbushPieceKeys,
);
assert.equal(
  highStakesReserve.report.root.executionPartitionAudit.checks
    .highStakesFuseResolution,
  true,
);
assert.equal(
  highStakesReserve.report.root.executionPartitionAudit.checks
    .highStakesBlastClosure,
  true,
);
assert.equal(
  highStakesReserve.report.root.executionPartitionAudit.fuseEvent
    .countdownBefore,
  4,
);
assert.equal(
  highStakesReserve.report.root.executionPartitionAudit.fuseEvent
    .countdownAfter,
  3,
);
assert.equal(highStakesReserve.report.root.scoreAfter.player1,
  highStakesReserve.report.root.scoreAfter.player2);
assert.equal(highStakesReserve.report.root.scenarioPresenceScore.player1, 10);
assert.equal(highStakesReserve.report.root.scenarioPresenceScore.player2, 0);
assert.equal(highStakesReserve.report.root.receiptHash,
  highStakesReserve.report.root.replayReceiptHash);
assert.equal(highStakesReserve.runtime.placementAudit.ok, true);
assert.equal(highStakesReserve.runtime.formationAudit.ok, true);

const payloadFiltered = materializeWarmachineMatchupFixedRoundTerminalTaskV1({
  terminalTask: payloadFilteredTask,
  opening: payloadFilteredOpening,
  evidenceCorpus,
  context: {
    partitionCapabilityAuditsByTaskKey: {
      [payloadFilteredTask.taskKey]:
        auditWarmachineMatchupTerminalPartitionCapabilityV1({
          plan,
          openingReport,
          openingRuntime,
          taskKey: payloadFilteredTask.taskKey,
        }),
    },
  },
});
assertSealed(payloadFiltered.report);
assert.equal(payloadFiltered.report.disposition, "proposal_filtered");
assert.equal(payloadFiltered.report.authority, "search_relation");
assert.equal(payloadFiltered.report.reason,
  "fixed_round_exact_roster_cannot_carry_partition");
assert.equal(payloadFiltered.report.partitionCapabilityAudit.relationCount, 0);
assert.equal(payloadFiltered.report.strictRulesConclusion, false);
assert.equal(payloadFiltered.report.matchupTerminalRootProven, false);

const unknown = materializeWarmachineMatchupFixedRoundTerminalTaskV1({
  terminalTask: unknownTask,
  opening: unknownOpening,
  evidenceCorpus,
});
assertSealed(unknown.report);
assert.equal(unknown.report.disposition, "rules_unknown");
assert.equal(unknown.report.authority, "rules_source");
assert.equal(unknown.report.strictRulesConclusion, false);
assert.equal(unknown.report.requestedResultKind, "tie");
assert.equal(unknown.runtime, null);

const rejected = materializeWarmachineMatchupFixedRoundTerminalTaskV1({
  terminalTask: rejectedTask,
  opening: rejectedOpening,
  evidenceCorpus,
});
assertSealed(rejected.report);
assert.equal(rejected.report.disposition, "strict_rejected");
assert.equal(rejected.report.authority, "rules_v1_host");
assert.equal(rejected.report.strictRulesConclusion, true);
assert.equal(rejected.report.root.topology,
  "outside_table_expected_reject");
assert.equal(rejected.report.root.partitionCoordinates.baseTopology,
  "outside_table_expected_reject");
assert.ok(rejected.report.root.receiptHash);
assert.equal(rejected.runtime.placementAudit.ok, false);
assert.equal(rejected.runtime.placementAudit.issueCount > 0, true);

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion:
    "verify_matchup_fixed_round_terminal_task_materializer_v1",
  planHash: plan.planHash,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  constructionHostReceiptHash:
    warmachineConstructionHost.receipt.receiptHash,
  productionFixedTaskCount: fixedTasks.length,
  strict: {
    taskKey: strictTask.taskKey,
    openingKey: strictOpening.openingKey,
    reportHash: strict.report.reportHash,
    receiptHash: strict.report.root.receiptHash,
    scoreAfter: strict.report.root.scoreAfter,
    scoreGain: strict.report.root.scoreGain,
    modelCount: strict.report.root.modelCount,
  },
  scenarioPresence: {
    taskKey: presenceTask.taskKey,
    openingKey: presenceOpening.openingKey,
    reportHash: presence.report.reportHash,
    receiptHash: presence.report.root.receiptHash,
    scoreBefore: presence.report.root.scoreBefore,
    scoreAfter: presence.report.root.scoreAfter,
    scenarioPresenceScore: presence.report.root.scenarioPresenceScore,
    modelCount: presence.report.root.modelCount,
  },
  priorLossVictoryPoint: {
    taskKey: priorLossTask.taskKey,
    openingKey: priorLossOpening.openingKey,
    reportHash: priorLoss.report.reportHash,
    receiptHash: priorLoss.report.root.receiptHash,
    priorLossPieceKey: priorLoss.report.root.priorLossPieceKey,
    scoreAfter: priorLoss.report.root.scoreAfter,
    modelCount: priorLoss.report.root.modelCount,
  },
  contestedScenarioPresence: {
    taskKey: contestedPresenceTask.taskKey,
    openingKey: contestedPresenceOpening.openingKey,
    reportHash: contestedPresence.report.reportHash,
    receiptHash: contestedPresence.report.root.receiptHash,
    scoreAfter: contestedPresence.report.root.scoreAfter,
    scenarioPresenceScore:
      contestedPresence.report.root.scenarioPresenceScore,
    contestedObjectiveKey:
      contestedPresence.report.root.geometryEvidence.contestedObjectiveKey,
    modelCount: contestedPresence.report.root.modelCount,
  },
  incompatibleTerminalPayment: {
    taskKey: incompatiblePaymentTask.taskKey,
    openingKey: incompatiblePaymentOpening.openingKey,
    reportHash: incompatiblePayment.report.reportHash,
    reason: incompatiblePayment.report.reason,
  },
  incompatibleControllerRoute: {
    taskKey: incompatibleControllerRouteTask.taskKey,
    openingKey: incompatibleControllerRouteOpening.openingKey,
    reportHash: incompatibleControllerRoute.report.reportHash,
    reason: incompatibleControllerRoute.report.reason,
  },
  highStakesReserveHistory: {
    taskKey: highStakesReserveTask.taskKey,
    openingKey: highStakesReserveOpening.openingKey,
    reportHash: highStakesReserve.report.reportHash,
    receiptHash: highStakesReserve.report.root.receiptHash,
    reservePieceKeys:
      highStakesReserve.report.root.geometryEvidence.reserveHistory.pieceKeys,
    fuseEvent:
      highStakesReserve.report.root.executionPartitionAudit.fuseEvent,
    scoreAfter: highStakesReserve.report.root.scoreAfter,
    scenarioPresenceScore:
      highStakesReserve.report.root.scenarioPresenceScore,
    modelCount: highStakesReserve.report.root.modelCount,
  },
  proposalFiltered: {
    taskKey: payloadFilteredTask.taskKey,
    openingKey: payloadFilteredOpening.openingKey,
    reportHash: payloadFiltered.report.reportHash,
    reason: payloadFiltered.report.reason,
  },
  rulesUnknown: {
    taskKey: unknownTask.taskKey,
    openingKey: unknownOpening.openingKey,
    reportHash: unknown.report.reportHash,
    sourceResolutionStatus: unknown.report.sourceResolutionStatus,
  },
  strictRejected: {
    taskKey: rejectedTask.taskKey,
    openingKey: rejectedOpening.openingKey,
    reportHash: rejected.report.reportHash,
    receiptHash: rejected.report.root.receiptHash,
    issueCodes: rejected.report.root.staticPlacementIssueCodes,
  },
}, null, 2)}\n`);
