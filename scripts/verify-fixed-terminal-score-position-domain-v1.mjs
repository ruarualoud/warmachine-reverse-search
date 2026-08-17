import assert from "node:assert/strict";

import { buildWarmachineFixedTerminalScorePositionCorpusV1 } from
  "../src/benchmark/fixed-terminal-score-position-corpus-v1.mjs";
import { auditRulesV1StaticPlacement } from "../src/warmachine-host-runtime.mjs";

const corpus = buildWarmachineFixedTerminalScorePositionCorpusV1({
  onStrictReplayProgress: process.env.WARMACHINE_FIXED_TERMINAL_PROGRESS === "1"
    ? (entry) => console.error(JSON.stringify(entry))
    : undefined,
});
const {
  fixture,
  stateTemplate,
  scorer,
  scorerLeader,
  positionDomain,
  materialized,
} = corpus;

assert.equal(stateTemplate.pieces.length, 103);
assert.equal(positionDomain.consideredCount, 4);
assert.equal(positionDomain.proposedCount, 4, JSON.stringify(positionDomain.rejected));
assert.equal(positionDomain.rejectedCount, 0, JSON.stringify(positionDomain.rejected));
assert.equal(positionDomain.deferredCount, 0);
assert.equal(positionDomain.oracleIsolationAudit.sourceStatePositionsRead, false);
assert.equal(positionDomain.generationDomain.temporalPositionKind,
  "later_round_pre_terminal_root");
assert.equal(positionDomain.generationDomain.deploymentEndpointRole,
  "downstream_multi_turn_acceptance_only");

const sourcePositionByPieceKey = Object.fromEntries(stateTemplate.pieces.map((piece) => [
  piece.pieceKey,
  piece.position,
]));
const anchorKeys = new Set();
for (const proposal of positionDomain.proposals) {
  const geometry = proposal.geometryRelationCell;
  const positions = geometry.exactCoordinates.piecePositions;
  const generation = geometry.generationEvidence;
  anchorKeys.add(generation.anchor.anchorKey);
  assert.equal(geometry.temporalPositionKind, "later_round_pre_terminal_root");
  assert.equal(geometry.deploymentEndpointRole, "downstream_multi_turn_acceptance_only");
  assert.equal(Object.keys(positions).length, 103);
  assert.notDeepEqual(positions[scorer.pieceKey], sourcePositionByPieceKey[scorer.pieceKey]);
  assert.notDeepEqual(positions[scorerLeader.pieceKey],
    sourcePositionByPieceKey[scorerLeader.pieceKey]);
  assert.equal(generation.sourceStatePositionsRead, false);
  assert.equal(generation.remainingPlacementEvidence.deploymentCoordinatesRead, false);
  assert.equal(generation.remainingPlacementEvidence.everyLivePieceAssigned, true);
  assert.equal(generation.remainingPlacementEvidence.unitFormationRulesAudit.ok, true);
  const generatedState = structuredClone(stateTemplate);
  generatedState.turnNumber = 3;
  generatedState.activeSideKey = "player2";
  generatedState.phaseKey = "activation";
  for (const piece of generatedState.pieces) piece.position = positions[piece.pieceKey];
  assert.equal(auditRulesV1StaticPlacement(generatedState).ok, true);
}
assert.deepEqual(anchorKeys, new Set([
  "round-three-left-50-outer",
  "round-three-left-50-lower",
  "round-three-right-50-outer",
  "round-three-right-50-lower",
]));

assert.equal(materialized.strictMaterializedCount, 1, JSON.stringify(materialized.rejected));
assert.equal(materialized.rejectedCount, 0, JSON.stringify(materialized.rejected));
assert.equal(materialized.deferredCount, 3);
const root = materialized.runtimeRoots[0];
const rootCell = positionDomain.proposals.find((proposal) =>
  proposal.cellKey === root.cellKey);
assert.equal(rootCell.geometryRelationCell.generationEvidence.anchor.anchorKey,
  "round-three-left-50-outer");
assert.equal(root.preTerminalState.turnNumber, 3);
assert.equal(root.preTerminalState.activeSideKey, "player2");
assert.equal(root.preTerminalState.phaseKey, "activation");
assert.deepEqual(root.preTerminalState.scenario.score, { player1: 2, player2: 0 });
assert.deepEqual(root.terminalState.scenario.score, { player1: 3, player2: 0 });
assert.equal(root.terminalState.terminal?.winnerSideKey ||
  root.strictWitness.proof?.winnerSideKey, "player1");
assert.equal(root.scoreTransitionEvidence.exactWithinScope, true);
assert.deepEqual(root.scoreTransitionEvidence.observedGain, { player1: 1, player2: 0 });
assert.equal(root.scoreTransitionEvidence.settlementRows.length, 1);
assert.equal(root.scoreTransitionEvidence.settlementRows[0].elementKey, "left-50");
  assert.equal(root.preTerminalState.pieces.filter((piece) =>
    piece.sideKey === "player2" && piece.destroyed !== true).every((piece) =>
    piece.activated === true), true);
assert.equal(root.preTerminalState.pieces.filter((piece) =>
  piece.sideKey === "player1" && piece.isWarjack === true).every((piece) =>
  Number(piece.resourcePoints) === 1), true);
assert.equal(root.terminalState.pieces.filter((piece) =>
  piece.sideKey === "player1" && piece.isWarjack === true).every((piece) =>
  Number(piece.resourcePoints) === 0), true);
assert.equal(root.preTerminalAssumptions.currentTurnControl.source,
  "strict_current_turn_control_materialization");
assert.equal(root.preTerminalAssumptions.priorTurnSettlement.source,
  "strict_prior_turn_end_materialization");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_fixed_terminal_score_position_domain_v1",
  fixtureHash: fixture.fixtureHash,
  modelCount: fixture.opening.modelCount,
  positionRootCount: positionDomain.proposedCount,
  anchorKeys: [...anchorKeys].sort(),
  sourceStatePositionsRead: positionDomain.oracleIsolationAudit.sourceStatePositionsRead,
  strictMaterializedCount: materialized.strictMaterializedCount,
  materializationBudgetDeferredCount: materialized.deferredCount,
  scoreBefore: root.scoreTransitionEvidence.observedBefore,
  scoreGain: root.scoreTransitionEvidence.observedGain,
  scoreAfter: root.scoreTransitionEvidence.observedAfter,
  scoringElementKey: root.scoreTransitionEvidence.scoringElementKey,
  reportHash: positionDomain.reportHash,
}, null, 2));
