import assert from "node:assert/strict";

import { stableGraphHash, stableGraphValue } from "../src/graph/typed-facts-v2.mjs";
import { buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-assassination-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerFixedRoundTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-fixed-round-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1 } from
  "../src/reverse/steamroller-terminal-execution-roster-witness-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";
import {
  runWarmachineCrossScenarioRosterValidationV1,
  warmachineCrossScenarioRosterTaskKeyV1,
} from "../src/validation/cross-scenario-roster-validation-v1.mjs";
import {
  auditRulesV1StaticPlacement,
  normalizeRulesV1State,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const scoreAnchors = buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1();
const witnessSpecs = [
  { rosterDomainKey: "sepsira-vs-nymara-balanced", faneListIndex: 0 },
  { rosterDomainKey: "sepsira-vs-hysene-balanced", faneListIndex: 4 },
  { rosterDomainKey: "sepsira-vs-nymara-compact", faneListIndex: 6 },
];

function rosterDomain(spec, runtimeWitness) {
  const pieces = runtimeWitness.fixture.stateTemplate.pieces || [];
  const leaders = pieces.filter((piece) => piece.isWarcaster || piece.isWarlock);
  const unitGroupCount = new Set(pieces.map((piece) =>
    String(piece.unitGroupId || piece.unitId || piece.metadata?.unitGroupId ||
      piece.metadata?.unitId || piece.pieceKey))).size;
  return {
    rosterDomainKey: spec.rosterDomainKey,
    witnessHash: runtimeWitness.witness.witnessHash,
    hostReceiptHash: runtimeWitness.witness.hostReceiptHash,
    rosterKeys: runtimeWitness.witness.sides.map((side) => side.listKey),
    leaderNames: runtimeWitness.witness.sides.map((side) => side.leader),
    resourceKinds: leaders.map((piece) => piece.resourceKind),
    resourceProfiles: leaders.map((piece) =>
      `${piece.sideKey}:${piece.resourceKind}:${piece.resourceMax}`),
    modelOrganizationKinds: [
      `models:${runtimeWitness.witness.modelCount}`,
      `activation_groups:${unitGroupCount}`,
    ],
    modelCount: runtimeWitness.witness.modelCount,
    strictDeploymentLegal: runtimeWitness.witness.strictDeploymentLegal,
    complete: runtimeWitness.witness.complete,
  };
}

function strictOutcome(task, root, evidenceSourceKey) {
  return {
    ...task,
    disposition: "strict_materialized",
    authority: "rules_v1_host",
    strictRulesConclusion: false,
    strictReplayCertified: true,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    rosterWitnessHash: task.rosterWitnessHash,
    receiptHash: root.receiptHash,
    replayReceiptHash: root.replayReceiptHash,
    evidenceSourceKey,
    trainingTruth: false,
  };
}

const runtimeWitnesses = witnessSpecs.map((spec) =>
  buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1({
    faneListIndex: spec.faneListIndex,
    seed: `cross-scenario-roster-validation:${spec.rosterDomainKey}`,
  }));
const rosterDomains = witnessSpecs.map((spec, index) =>
  rosterDomain(spec, runtimeWitnesses[index]));
const evidenceOutcomes = [];
for (let index = 0; index < runtimeWitnesses.length; index += 1) {
  const runtimeWitness = runtimeWitnesses[index];
  const domain = rosterDomains[index];
  const assassination = buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
    corpus: scoreAnchors.corpus,
    rosterWitness: runtimeWitness,
  });
  const assassinationTask = {
    scenarioKey: "two_fronts",
    firstPlayerSideKey: "player1",
    terminalGoalKey: "assassination",
    rosterDomainKey: domain.rosterDomainKey,
  };
  assassinationTask.taskKey = warmachineCrossScenarioRosterTaskKeyV1(assassinationTask);
  assassinationTask.rosterWitnessHash = domain.witnessHash;
  evidenceOutcomes.push(strictOutcome(
    assassinationTask,
    assassination.evidence.roots[0],
    assassination.evidence.evidenceHash,
  ));

  const fixedRound = buildWarmachineSteamrollerFixedRoundTerminalAnchorEvidenceV1({
    corpus: scoreAnchors.corpus,
    rosterWitness: runtimeWitness,
    scenarioProposals: scoreAnchors.proposals,
    scenarioKeys: ["pressure_point"],
  });
  const scoreTask = {
    scenarioKey: "pressure_point",
    firstPlayerSideKey: "player1",
    terminalGoalKey: "scenario_score",
    rosterDomainKey: domain.rosterDomainKey,
  };
  scoreTask.taskKey = warmachineCrossScenarioRosterTaskKeyV1(scoreTask);
  scoreTask.rosterWitnessHash = domain.witnessHash;
  evidenceOutcomes.push(strictOutcome(
    scoreTask,
    fixedRound.evidence.roots[0],
    fixedRound.evidence.evidenceHash,
  ));
}

const rejectCoordinates = {
  scenarioKey: "two_fronts",
  firstPlayerSideKey: "player2",
  terminalGoalKey: "assassination",
  rosterDomainKey: rosterDomains[0].rosterDomainKey,
};
const rejectTaskKey = warmachineCrossScenarioRosterTaskKeyV1(rejectCoordinates);
const rejectedState = structuredClone(runtimeWitnesses[0].fixture.stateTemplate);
const rejectedLeaders = rejectedState.pieces.filter((piece) =>
  piece.isWarcaster || piece.isWarlock);
assert.equal(rejectedLeaders.length, 2);
rejectedLeaders[0].position = { xIn: 24, yIn: 24 };
rejectedLeaders[1].position = { xIn: 24, yIn: 24 };
const normalizedRejectedState = normalizeRulesV1State(rejectedState);
const staticRejectAudit = auditRulesV1StaticPlacement(normalizedRejectedState);
assert.equal(staticRejectAudit.ok, false);
const staticRejectReceiptHash = stableGraphHash({
  operation: "rules_v1_static_placement_audit",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  inputStateHash: warmachineReverseStateSemanticHashV1(normalizedRejectedState),
  audit: staticRejectAudit,
});
evidenceOutcomes.push({
  ...rejectCoordinates,
  taskKey: rejectTaskKey,
  disposition: "strict_rejected",
  authority: "rules_v1_host",
  strictRulesConclusion: true,
  strictReplayCertified: false,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  rosterWitnessHash: rosterDomains[0].witnessHash,
  receiptHash: staticRejectReceiptHash,
  replayReceiptHash: "",
  reason: "current_host_static_base_overlap_rejected",
  evidenceSourceKey: stableGraphHash(staticRejectAudit),
  trainingTruth: false,
});

const unresolvedCoordinates = {
  scenarioKey: "payload",
  firstPlayerSideKey: "player2",
  terminalGoalKey: "scenario_score",
  rosterDomainKey: rosterDomains[2].rosterDomainKey,
};
const unresolvedTaskKey = warmachineCrossScenarioRosterTaskKeyV1(unresolvedCoordinates);
const first = runWarmachineCrossScenarioRosterValidationV1({
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  corpusHash: scoreAnchors.corpus.corpusHash,
  rosterDomains,
  evidenceOutcomes,
  maximumExecutedTasks: 1,
  priorityTaskKeys: [unresolvedTaskKey],
  executeTask: (task) => ({
    ...task,
    disposition: "inverse_unresolved",
    reason: "payload_terminal_inverse_operator_not_selected_in_fixed_budget",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    rosterWitnessHash: task.rosterWitnessHash,
    trainingTruth: false,
  }),
});

assert.equal(first.matrixCoverage.complete, true);
assert.equal(first.matrixCoverage.taskCount, 84);
assert.equal(first.dispositionCounts.strict_materialized, 6);
assert.equal(first.dispositionCounts.strict_rejected, 1);
assert.equal(first.dispositionCounts.inverse_unresolved, 1);
assert.equal(first.dispositionCounts.budget_deferred, 76);
assert.equal(first.massLedger.conserved, true);
assert.equal(first.strictComparison.comparedRosterDomainKeys.length, 3);
assert.equal(first.strictComparison.strategyScoreUsed, false);
assert.equal(first.strictComparison.globalOptimalityProven, false);
assert.equal(first.trainingTruth, false);

const resumedCoordinates = {
  scenarioKey: "high_stakes",
  firstPlayerSideKey: "player2",
  terminalGoalKey: "assassination",
  rosterDomainKey: rosterDomains[1].rosterDomainKey,
};
const resumedTaskKey = warmachineCrossScenarioRosterTaskKeyV1(resumedCoordinates);
const resumed = runWarmachineCrossScenarioRosterValidationV1({
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  corpusHash: scoreAnchors.corpus.corpusHash,
  rosterDomains,
  priorCheckpoint: first.checkpoint,
  maximumExecutedTasks: 1,
  priorityTaskKeys: [resumedTaskKey],
  executeTask: (task) => ({
    ...task,
    disposition: "inverse_unresolved",
    reason: "high_stakes_assassination_terminal_inverse_not_materialized",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    rosterWitnessHash: task.rosterWitnessHash,
    trainingTruth: false,
  }),
});
assert.equal(resumed.execution.priorRecoveredOutcomeCount, 8);
assert.equal(resumed.dispositionCounts.inverse_unresolved, 2);
assert.equal(resumed.dispositionCounts.budget_deferred, 75);

const failed = runWarmachineCrossScenarioRosterValidationV1({
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  corpusHash: scoreAnchors.corpus.corpusHash,
  rosterDomains,
  priorCheckpoint: resumed.checkpoint,
  maximumExecutedTasks: 1,
  executeTask: () => {
    throw new Error("isolated-worker-fixture-failure");
  },
});
assert.equal(failed.execution.failedAttemptCount, 1);
assert.equal(failed.execution.priorRecoveredOutcomeCount, 9);
assert.equal(failed.massLedger.publishedTaskCount, 9);
assert.equal(failed.checkpoint.outcomes.length, 9);

const { checkpointHash: _priorHash, ...staleCheckpointCore } = resumed.checkpoint;
staleCheckpointCore.hostReceiptHash = "stale-host-receipt";
const normalizedStaleCheckpointCore = stableGraphValue(staleCheckpointCore);
const staleCheckpoint = stableGraphValue({
  ...normalizedStaleCheckpointCore,
  checkpointHash: stableGraphHash(normalizedStaleCheckpointCore),
});
const stale = runWarmachineCrossScenarioRosterValidationV1({
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  corpusHash: scoreAnchors.corpus.corpusHash,
  rosterDomains,
  priorCheckpoint: staleCheckpoint,
});
assert.equal(stale.execution.priorInvalidatedOutcomeCount, 9);
assert.equal(stale.execution.priorRecoveredOutcomeCount, 0);
assert.equal(stale.dispositionCounts.budget_deferred, 84);

const shards = [0, 1].map((shardIndex) =>
  runWarmachineCrossScenarioRosterValidationV1({
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    corpusHash: scoreAnchors.corpus.corpusHash,
    rosterDomains,
    shardIndex,
    shardCount: 2,
  }));
assert.equal(shards[0].shard.eligibleTaskCount + shards[1].shard.eligibleTaskCount, 84);
assert.equal(shards.every((shard) => shard.matrixHash === first.matrixHash), true);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_cross_scenario_roster_validation_v1",
  reportHash: first.reportHash,
  matrixHash: first.matrixHash,
  matrixCoverage: first.matrixCoverage,
  rosterDomains: first.rosterDomains.map((domain) => ({
    rosterDomainKey: domain.rosterDomainKey,
    leaderNames: domain.leaderNames,
    resourceKinds: domain.resourceKinds,
    resourceProfiles: domain.resourceProfiles,
    modelOrganizationKinds: domain.modelOrganizationKinds,
    modelCount: domain.modelCount,
  })),
  dispositionCounts: first.dispositionCounts,
  resumedDispositionCounts: resumed.dispositionCounts,
  failedAttemptCount: failed.execution.failedAttemptCount,
  staleInvalidatedOutcomeCount: stale.execution.priorInvalidatedOutcomeCount,
  shardTaskCounts: shards.map((shard) => shard.shard.eligibleTaskCount),
  strictComparison: first.strictComparison,
}, null, 2));
