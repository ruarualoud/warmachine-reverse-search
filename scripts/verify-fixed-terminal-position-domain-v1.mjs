import assert from "node:assert/strict";

import { buildWarmachineFixedTerminalPositionCorpusV1 } from
  "../src/benchmark/fixed-terminal-position-corpus-v1.mjs";
import { auditRulesV1StaticPlacement } from "../src/warmachine-host-runtime.mjs";

const corpus = buildWarmachineFixedTerminalPositionCorpusV1({
  onStrictReplayProgress: process.env.WARMACHINE_FIXED_TERMINAL_PROGRESS === "1"
    ? (entry) => console.error(JSON.stringify(entry))
    : undefined,
});
const {
  fixture,
  stateTemplate,
  attackerLeader,
  targetLeader,
  actor,
  positionDomain,
  materialized,
} = corpus;

assert.equal(stateTemplate.pieces.length, 103);
const positionSummary = {
  consideredCount: positionDomain.consideredCount,
  proposedCount: positionDomain.proposedCount,
  rejectedCount: positionDomain.rejectedCount,
  rejected: positionDomain.rejected.map((row) => ({
    parentCellKey: row.parentCellKey,
    anchorKey: row.anchorKey,
    reason: row.reason,
    pieceKey: row.pieceKey,
    unitGroupKey: row.unitGroupKey,
    firstIssue: row.unitFormationRulesAudit?.issues?.[0] || null,
  })),
};
assert.equal(positionDomain.consideredCount, 4, JSON.stringify(positionSummary));
assert.equal(positionDomain.proposedCount, 4, JSON.stringify(positionSummary));
assert.equal(positionDomain.rejectedCount, 0, JSON.stringify(positionSummary));

const targetAnchors = [];
let controlAwarePieceCount = 0;
const sourcePositionByPieceKey = Object.fromEntries(stateTemplate.pieces.map((piece) => [
  piece.pieceKey,
  piece.position,
]));
const deployments = Object.values(fixture.opening.room.deployments || {});
const insideDeployment = (position) => deployments.some((deployment) =>
  position.xIn >= deployment.x - deployment.width / 2 &&
  position.xIn <= deployment.x + deployment.width / 2 &&
  position.yIn >= deployment.y - deployment.height / 2 &&
  position.yIn <= deployment.y + deployment.height / 2);
for (const proposal of positionDomain.proposals) {
  const positions = proposal.geometryRelationCell.exactCoordinates.piecePositions;
  assert.equal(Object.keys(positions).length, 103);
  targetAnchors.push(positions[targetLeader.pieceKey]);
  assert.equal(proposal.geometryRelationCell.temporalPositionKind,
    "later_round_pre_terminal_root");
  assert.equal(proposal.geometryRelationCell.deploymentEndpointRole,
    "downstream_multi_turn_acceptance_only");
  assert.equal(insideDeployment(positions[targetLeader.pieceKey]), false);
  for (const pieceKey of [attackerLeader.pieceKey, actor.pieceKey, targetLeader.pieceKey]) {
    assert.notDeepEqual(positions[pieceKey], sourcePositionByPieceKey[pieceKey]);
  }
  assert.ok(proposal.geometryRelationCell.generationEvidence
    .leaderSpatialInfluenceProfiles.some((row) =>
      row.influenceKey === "leader-control-range"));
  const evidence = proposal.geometryRelationCell.generationEvidence.remainingPlacementEvidence;
  assert.equal(evidence.everyLivePieceAssigned, true);
  assert.equal(evidence.deploymentCoordinatesRead, false);
  assert.equal(evidence.strictHistoryReachabilityProven, false);
  assert.equal(evidence.unitFormationAudit.length, 17);
  assert.equal(evidence.unitFormationAudit.every((row) =>
    row.everyMemberWithinTwoInchesOfAnchor === true), true);
  assert.equal(evidence.unitFormationRulesAudit.ok, true);
  controlAwarePieceCount = Math.max(controlAwarePieceCount, evidence.controlRelationAudit.length);
  const generatedState = structuredClone(stateTemplate);
  generatedState.turnNumber = 3;
  generatedState.phaseKey = "activation";
  for (const piece of generatedState.pieces) piece.position = positions[piece.pieceKey];
  const staticPlacementAudit = auditRulesV1StaticPlacement(generatedState);
  assert.equal(staticPlacementAudit.ok, true, JSON.stringify(staticPlacementAudit));
}
assert.deepEqual(new Set(targetAnchors.map((position) => `${position.xIn}:${position.yIn}`)),
  new Set(["18:21", "18:27", "30:21", "30:30"]));
assert.equal(positionDomain.generationDomain.temporalPositionKind,
  "later_round_pre_terminal_root");
assert.equal(positionDomain.generationDomain.deploymentEndpointRole,
  "downstream_multi_turn_acceptance_only");
assert.ok(Object.values(positionDomain.generationDomain
  .leaderSpatialInfluenceProfilesByParentCell).flat().some((row) =>
    row.sourceKind === "feat" || row.sourceKind === "spell" || row.sourceKind === "ability"));

assert.equal(materialized.strictMaterializedCount, 1, JSON.stringify(materialized.rejected));
assert.equal(materialized.rejectedCount, 0, JSON.stringify(materialized.rejected));
assert.equal(materialized.deferredCount, 3);
assert.equal(positionDomain.proposals.find((proposal) =>
  proposal.cellKey === materialized.runtimeRoots[0].cellKey)
  .geometryRelationCell.generationEvidence.anchor.anchorKey,
"round-three-west-lower-objective-flank");
assert.equal(materialized.runtimeRoots[0].preTerminalState.phaseKey, "activation");
assert.equal(materialized.runtimeRoots[0].preTerminalState.pieces
  .filter((piece) => piece.sideKey === "player1" && piece.destroyed !== true)
  .every((piece) => piece.activated === false), true);
assert.equal(materialized.runtimeRoots[0].preTerminalState.pieces
  .filter((piece) => piece.sideKey === "player2" && piece.destroyed !== true)
  .every((piece) => piece.activated === true), true);
assert.equal(materialized.runtimeRoots[0].preTerminalAssumptions
  .activationEnvelope.player1.mode, "all_alive_unactivated");
assert.equal(materialized.runtimeRoots[0].preTerminalAssumptions
  .activationEnvelope.player2.mode, "all_alive_activated");
assert.deepEqual(materialized.runtimeRoots[0].preTerminalState.scenario.score, {
  player1: 0,
  player2: 0,
});
assert.equal(materialized.runtimeRoots[0].preTerminalState.scenario.scoringHistory.length, 0);
assert.equal(materialized.runtimeRoots[0].preTerminalAssumptions
  .priorTurnSettlement.source, "strict_prior_turn_end_materialization");
assert.ok(materialized.runtimeRoots[0].preTerminalAssumptions
  .priorTurnSettlement.receiptHash);
assert.equal(materialized.runtimeRoots[0].preTerminalAssumptions
  .currentTurnControl.source, "strict_current_turn_control_materialization");
assert.deepEqual(materialized.runtimeRoots[0].preTerminalAssumptions
  .currentTurnControl.actionTypes, [
  "end_maintenance_phase",
  "end_control_replenishment",
  "end_control_phase",
]);
assert.equal(materialized.runtimeRoots[0].preTerminalState.pieces
  .filter((piece) => piece.sideKey === "player1" && piece.isWarjack === true)
  .every((piece) => Number(piece.resourcePoints) === 1), true);
assert.equal(materialized.runtimeRoots[0].preTerminalState.pieces.find((piece) =>
  piece.pieceKey === targetLeader.pieceKey).damage.boxesRemaining, 1);
assert.equal(materialized.runtimeRoots[0].staticUnitFormationAudit.ok, true);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_fixed_terminal_position_domain_v1",
  fixtureHash: fixture.fixtureHash,
  modelCount: fixture.opening.modelCount,
  positionRootCount: positionDomain.proposedCount,
  unitGroupCount: 17,
  controlAwarePieceCount,
  targetAnchors,
  sourceStatePositionsRead: positionDomain.oracleIsolationAudit.sourceStatePositionsRead,
  staticPlacementAuditOk: true,
  strictMaterializedCount: materialized.strictMaterializedCount,
  materializationBudgetDeferredCount: materialized.deferredCount,
  reportHash: positionDomain.reportHash,
}, null, 2));
