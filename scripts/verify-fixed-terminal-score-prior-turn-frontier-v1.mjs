import assert from "node:assert/strict";

import { buildWarmachineFixedTerminalScorePositionCorpusV1 } from
  "../src/benchmark/fixed-terminal-score-position-corpus-v1.mjs";
import { replayWarmachineTerminalReverseRouteV1 } from
  "../src/reverse/replay-terminal-reverse-route-v1.mjs";
import { searchWarmachineTerminalRootedToDeploymentV1 } from
  "../src/reverse/terminal-rooted-to-deployment-v1.mjs";

function activationGroupKey(piece = {}) {
  return String(
    piece.unitGroupId || piece.unitId || piece.metadata?.unitGroupId ||
    piece.metadata?.unitId || piece.pieceKey,
  );
}

const corpus = buildWarmachineFixedTerminalScorePositionCorpusV1({
  maximumProposals: 4,
  maximumMaterializedCells: 1,
});
const root = corpus.materialized.runtimeRoots[0];
const cell = corpus.positionDomain.proposals.find((entry) =>
  entry.cellKey === root.cellKey);
assert.ok(cell);

const maximumReverseTurns = Math.max(1, Number(
  process.env.WARMACHINE_FIXED_TERMINAL_REVERSE_TURNS || 1,
));
const activationGroupOrderKeysBySide = Object.fromEntries(
  ["player1", "player2"].map((sideKey) => [
    sideKey,
    [...new Set(root.preTerminalState.pieces.filter((piece) =>
      piece.sideKey === sideKey).map(activationGroupKey))].sort(),
  ]),
);
const activationGroupOrderKeys = activationGroupOrderKeysBySide.player2;
const activationGroupCountBySide = Object.fromEntries(Object.entries(
  activationGroupOrderKeysBySide,
).map(([sideKey, keys]) => [sideKey, keys.length]));
assert.deepEqual(activationGroupCountBySide, { player1: 19, player2: 15 });
const terminalResourcePreimagePointsByPieceKey = Object.fromEntries(
  corpus.terminalResourceAssumptions.map((assumption) => [
    assumption.pieceKey,
    assumption.resourcePointsBeforeTerminalTurnEnd,
  ]),
);

const search = searchWarmachineTerminalRootedToDeploymentV1(
  root.terminalState,
  cell,
  {
    deployments: corpus.fixture.opening.room.deployments,
    firstPlayerSideKey: "player1",
    terminalEventOptions: {
      terminalActionTypes: ["end_turn"],
      maximumTerminalActions: 1,
      resourcePreimagePointsByPieceKey: terminalResourcePreimagePointsByPieceKey,
    },
    maximumReverseTurns,
    maximumRouteLabels: 6,
    maximumUniqueStates: 6,
    maximumCompletedRoutes: 1,
    maximumActivationDepth: 128,
    maximumActivationLabels: 128,
    maximumActivationUniqueStates: 128,
    maximumActivationGroupsPerExpansion: 1,
    maximumActivationCandidatesPerExpansion: 1,
    maximumActivationPassActorsPerExpansion: 1,
    stopAfterActivationBoundaryRouteCount: 1,
    activationGroupOrderKeys,
    activationGroupOrderKeysBySide,
    includeMovement: false,
    includePass: true,
    resourceEnvelopeKey: "search_control_predecessor",
    resourceEnvelopeModes: [maximumReverseTurns > 1
      ? "reverse_focus_control_pass_baseline"
      : "reverse_focus_control_baseline"],
    controlResidueModes: [maximumReverseTurns > 1
      ? "empty_previous_control"
      : "absent"],
    nextSideActivationRestoreModes: maximumReverseTurns > 1
      ? ["all_alive_activated"]
      : ["preserve_reset_state"],
    maximumControlSteps: 64,
    onProgress: process.env.WARMACHINE_FIXED_TERMINAL_PROGRESS === "1"
      ? (entry) => console.error(JSON.stringify(entry))
      : undefined,
    ...(maximumReverseTurns > 1
      ? {
        previousTurnEndMaintenanceResourcePreimageModes: [
          "focus_battlegroup_control_pass_baseline",
        ],
        recordMaintenanceResourcePreimageCoverageDebt: true,
      }
      : {}),
  },
);

assert.ok(search.reachedPriorTurnFrontierCount >= 1, JSON.stringify({
  rejected: search.rejected,
  unresolved: search.unresolved.filter((row) => ![
    "activation_reverse_group_order_budget_deferred",
    "pass_activation_actor_budget_deferred",
    "terminal_to_deployment_reverse_turn_budget_exhausted",
  ].includes(row.reason)),
}, null, 2));
const frontier = search.reachedPriorTurnFrontiers.find((entry) =>
  entry.reversedPriorTurnCount === 1);
assert.ok(frontier);
assert.equal(frontier.turnNumber, 3);
assert.equal(frontier.activeSideKey, "player1");
assert.equal(frontier.phaseKey, "control");
assert.equal(frontier.reversedPriorTurnCount, 1);
assert.deepEqual(frontier.score, { player1: 1, player2: 0 });
assert.equal(frontier.strictWitness, true);
assert.equal(search.terminalSpatialEvidence.terminalCellKey, cell.cellKey);
assert.ok(search.terminalSpatialEvidence.exactCoordinates);
assert.equal(frontier.incrementalReverseOperatorKeys[0],
  "previous_turn_end_inverse_v1");
assert.equal(frontier.incrementalReverseOperatorKeys.at(-1),
  "control_phase_start_inverse_v1");
assert.equal(frontier.incrementalReverseOperatorKeys.filter((operatorKey) =>
  operatorKey === "pass_activation_inverse_v1").length,
activationGroupCountBySide.player1);
assert.equal(frontier.incrementalStrictReplayStepActionTypes.filter((actionType) =>
  actionType === "pass").length, activationGroupCountBySide.player1);
assert.equal(frontier.incrementalStrictReplayStepActionTypes.filter((actionType) =>
  actionType === "decline_reposition").length, 7);
assert.equal(search.legalDeploymentRouteCount, 0);
assert.equal(search.rejected.length, 0, JSON.stringify(search.rejected));
if (maximumReverseTurns === 1) {
  assert.ok(search.unresolved.some((row) =>
    row.reason === "terminal_to_deployment_reverse_turn_budget_exhausted" &&
    row.reversedPriorTurnCount === 1));
}

const runtimeFrontier = search.runtimeReachedPriorTurnFrontiers.find((entry) =>
  entry.reversedPriorTurnCount === 1);
assert.ok(runtimeFrontier);
const replay = replayWarmachineTerminalReverseRouteV1({
  candidateKey: "fixed-terminal-score-prior-turn-frontier-v1",
  predecessorState: runtimeFrontier.state,
  predecessorStateHash: runtimeFrontier.stateHash,
  reverseEdges: runtimeFrontier.reverseEdges,
}, root.terminalState, {
  routeKey: "verify-fixed-terminal-score-prior-turn-frontier-v1",
  maximumControlSteps: 64,
});
assert.equal(replay.fullRouteStrictReplayCertified, true,
  JSON.stringify(replay.failures, null, 2));

let secondPriorTurnReplay = null;
if (maximumReverseTurns > 1) {
  const secondFrontier = search.reachedPriorTurnFrontiers.find((entry) =>
    entry.reversedPriorTurnCount === 2);
  assert.ok(secondFrontier, JSON.stringify({
    rejected: search.rejected,
    unresolved: search.unresolved.filter((row) => ![
      "activation_reverse_group_order_budget_deferred",
      "pass_activation_actor_budget_deferred",
      "previous_turn_end_maintenance_resource_preimage_universe_deferred",
    ].includes(row.reason)),
  }, null, 2));
  assert.equal(secondFrontier.turnNumber, 2);
  assert.equal(secondFrontier.activeSideKey, "player2");
  assert.equal(secondFrontier.phaseKey, "control");
  assert.equal(secondFrontier.historyEvidence.controlResidueModes.every((mode) =>
    mode === "empty_previous_control"), true);
  const secondRuntimeFrontier = search.runtimeReachedPriorTurnFrontiers.find((entry) =>
    entry.reversedPriorTurnCount === 2);
  assert.ok(secondRuntimeFrontier);
  secondPriorTurnReplay = replayWarmachineTerminalReverseRouteV1({
    candidateKey: "fixed-terminal-score-two-prior-turn-frontier-v1",
    predecessorState: secondRuntimeFrontier.state,
    predecessorStateHash: secondRuntimeFrontier.stateHash,
    reverseEdges: secondRuntimeFrontier.reverseEdges,
  }, root.terminalState, {
    routeKey: "verify-fixed-terminal-score-two-prior-turn-frontier-v1",
    maximumControlSteps: 96,
  });
  assert.equal(secondPriorTurnReplay.fullRouteStrictReplayCertified, true,
    JSON.stringify(secondPriorTurnReplay.failures, null, 2));
}

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_fixed_terminal_score_prior_turn_frontier_v1",
  modelCount: corpus.fixture.opening.modelCount,
  maximumReverseTurns,
  terminalPositionAnchorKey:
    cell.geometryRelationCell.generationEvidence.anchor.anchorKey,
  activationGroupCountBySide,
  reachedPriorTurnFrontierCount: search.reachedPriorTurnFrontierCount,
  frontiers: search.reachedPriorTurnFrontiers,
  frontier: {
    stateHash: frontier.stateHash,
    turnNumber: frontier.turnNumber,
    activeSideKey: frontier.activeSideKey,
    phaseKey: frontier.phaseKey,
    score: frontier.score,
    reversedPriorTurnCount: frontier.reversedPriorTurnCount,
    strictWitness: frontier.strictWitness,
    incrementalReverseOperatorKeys: frontier.incrementalReverseOperatorKeys,
    incrementalStrictReplayStepActionTypes:
      frontier.incrementalStrictReplayStepActionTypes,
  },
  fullSegmentStrictReplayCertified: replay.fullRouteStrictReplayCertified,
  fullTwoPriorTurnStrictReplayCertified:
    secondPriorTurnReplay?.fullRouteStrictReplayCertified || false,
  rejectedBranchCount: search.rejected.length,
  unresolvedReasonCounts: Object.fromEntries([...new Set(search.unresolved.map((row) =>
    row.reason))].sort().map((reason) => [
    reason,
    search.unresolved.filter((row) => row.reason === reason).length,
  ])),
  legalDeploymentRouteCount: search.legalDeploymentRouteCount,
  reportHash: search.reportHash,
}, null, 2));
