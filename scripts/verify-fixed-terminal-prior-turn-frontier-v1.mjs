import assert from "node:assert/strict";

import { buildWarmachineFixedTerminalPositionCorpusV1 } from
  "../src/benchmark/fixed-terminal-position-corpus-v1.mjs";
import { replayWarmachineTerminalReverseRouteV1 } from
  "../src/reverse/replay-terminal-reverse-route-v1.mjs";
import { searchWarmachineTerminalRootedToDeploymentV1 } from
  "../src/reverse/terminal-rooted-to-deployment-v1.mjs";

const corpus = buildWarmachineFixedTerminalPositionCorpusV1({
  maximumProposals: 1,
  maximumMaterializedCells: 1,
});
const root = corpus.materialized.runtimeRoots[0];
const cell = corpus.positionDomain.proposals.find((entry) =>
  entry.cellKey === root.cellKey);
assert.ok(cell);
const defeatedLeader = root.preTerminalState.pieces.find((piece) =>
  piece.pieceKey === cell.targetLeaderPieceKey);
const defeatedBattlegroup = root.preTerminalState.pieces.filter((piece) =>
  piece.controllerPieceKey === defeatedLeader.pieceKey && piece.isWarbeast === true);

function activationGroupKey(piece = {}) {
  return String(
    piece.unitGroupId || piece.unitId || piece.metadata?.unitGroupId ||
    piece.metadata?.unitId || piece.pieceKey,
  );
}

const maximumReverseTurns = Math.max(1, Number(
  process.env.WARMACHINE_FIXED_TERMINAL_REVERSE_TURNS || 1,
));
const activationGroupOrderKeysBySide = Object.fromEntries(
  ["player1", "player2"].map((sideKey) => [
    sideKey,
    [...new Set(root.preTerminalState.pieces
      .filter((piece) => piece.sideKey === sideKey)
      .map(activationGroupKey))].sort(),
  ]),
);
const activationGroupOrderKeys = activationGroupOrderKeysBySide.player2;
const search = searchWarmachineTerminalRootedToDeploymentV1(
  root.terminalState,
  cell,
  {
    deployments: corpus.fixture.opening.room.deployments,
    firstPlayerSideKey: "player1",
    terminalEventOptions: {
      terminalActionTypes: ["melee_attack"],
      maximumTerminalActions: 1,
      controllerDestructionResourcePointsByPieceKey: Object.fromEntries(
        defeatedBattlegroup.map((piece) => [piece.pieceKey, Number(piece.resourcePoints || 0)]),
      ),
      controllerDestructionStatusPreimageByPieceKey: Object.fromEntries(
        defeatedBattlegroup.map((piece) => [piece.pieceKey, {
          wild: (piece.statusTags || []).includes("wild"),
        }]),
      ),
      controllerDestructionUpkeepPreimageByControllerPieceKey: {
        [defeatedLeader.pieceKey]: { mode: "none_active" },
      },
    },
    maximumReverseTurns,
    maximumRouteLabels: 4,
    maximumUniqueStates: 4,
    maximumCompletedRoutes: 1,
    maximumActivationDepth: 64,
    maximumActivationLabels: 64,
    maximumActivationUniqueStates: 64,
    maximumActivationGroupsPerExpansion: 1,
    maximumActivationCandidatesPerExpansion: 1,
    maximumActivationPassActorsPerExpansion: 1,
    stopAfterActivationBoundaryRouteCount: 1,
    activationGroupOrderKeys,
    activationGroupOrderKeysBySide,
    includeMovement: false,
    includePass: true,
    resourceEnvelopeKey: "search_focus_predecessor",
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
  unresolved: search.unresolved.filter((row) =>
    !["activation_reverse_group_order_budget_deferred",
      "pass_activation_actor_budget_deferred"].includes(row.reason)),
}));
const frontier = search.reachedPriorTurnFrontiers.find((entry) =>
  entry.reversedPriorTurnCount === 1);
assert.ok(frontier);
assert.equal(frontier.turnNumber, 2);
assert.equal(frontier.activeSideKey, "player2");
assert.equal(frontier.phaseKey, "control");
assert.equal(frontier.reversedPriorTurnCount, 1);
assert.deepEqual(frontier.score, { player1: 0, player2: 0 });
assert.equal(frontier.strictWitness, true);
assert.equal(search.terminalSpatialEvidence.terminalCellKey, cell.cellKey);
assert.ok(search.terminalSpatialEvidence.exactCoordinates);
assert.ok(frontier.historyEvidence.provenanceLabels.some((entry) =>
  entry.terminalCellKey === cell.cellKey));
assert.equal(frontier.historyEvidence.unresolvedProbabilityIntervals.length, 1);
assert.equal(frontier.incrementalReverseOperatorKeys[0], "previous_turn_end_inverse_v1");
assert.equal(frontier.incrementalReverseOperatorKeys.at(-1),
  "control_phase_start_inverse_v1");
assert.equal(frontier.incrementalReverseOperatorKeys.filter((operatorKey) =>
  operatorKey === "pass_activation_inverse_v1").length, activationGroupOrderKeys.length);
assert.ok(frontier.incrementalStrictReplayStepActionTypes.includes("end_turn"));
assert.equal(frontier.incrementalStrictReplayStepActionTypes.filter((actionType) =>
  actionType === "pass").length, activationGroupOrderKeys.length);
assert.equal(search.legalDeploymentRouteCount, 0);
if (maximumReverseTurns === 1) {
  assert.ok(search.unresolved.some((row) =>
    row.reason === "terminal_to_deployment_reverse_turn_budget_exhausted" &&
    row.reversedPriorTurnCount === 1));
}
assert.ok(search.unresolved.some((row) =>
  row.reason === "activation_reverse_group_order_budget_deferred"));
assert.ok(search.unresolved.some((row) =>
  row.reason === "pass_activation_actor_budget_deferred"));

const runtimeFrontier = search.runtimeReachedPriorTurnFrontiers.find((entry) =>
  entry.reversedPriorTurnCount === 1);
assert.ok(runtimeFrontier);
const replay = replayWarmachineTerminalReverseRouteV1({
  candidateKey: "fixed-terminal-prior-turn-frontier-v1",
  predecessorState: runtimeFrontier.state,
  predecessorStateHash: runtimeFrontier.stateHash,
  reverseEdges: runtimeFrontier.reverseEdges,
}, root.terminalState, {
  routeKey: "verify-fixed-terminal-prior-turn-frontier-v1",
  maximumControlSteps: 32,
});
assert.equal(replay.fullRouteStrictReplayCertified, true, JSON.stringify(replay.failures));

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
  assert.equal(secondFrontier.historyEvidence.provenanceLabels[0].terminalCellKey,
    cell.cellKey);
  assert.equal(secondFrontier.historyEvidence.resourceEnvelopeModes.includes(
    "reverse_focus_control_pass_baseline"), true);
  assert.equal(secondFrontier.historyEvidence.controlResidueModes.every((mode) =>
    mode === "empty_previous_control"), true);
  const secondRuntimeFrontier = search.runtimeReachedPriorTurnFrontiers.find((entry) =>
    entry.reversedPriorTurnCount === 2);
  assert.ok(secondRuntimeFrontier);
  secondPriorTurnReplay = replayWarmachineTerminalReverseRouteV1({
    candidateKey: "fixed-terminal-two-prior-turn-frontier-v1",
    predecessorState: secondRuntimeFrontier.state,
    predecessorStateHash: secondRuntimeFrontier.stateHash,
    reverseEdges: secondRuntimeFrontier.reverseEdges,
  }, root.terminalState, {
    routeKey: "verify-fixed-terminal-two-prior-turn-frontier-v1",
    maximumControlSteps: 64,
  });
  assert.equal(secondPriorTurnReplay.fullRouteStrictReplayCertified, true,
    JSON.stringify(secondPriorTurnReplay.failures, null, 2));
}

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_fixed_terminal_prior_turn_frontier_v1",
  modelCount: corpus.fixture.opening.modelCount,
  maximumReverseTurns,
  terminalPositionAnchorKey: cell.geometryRelationCell.generationEvidence.anchor.anchorKey,
  activationGroupCount: activationGroupOrderKeys.length,
  activationGroupCountBySide: Object.fromEntries(Object.entries(
    activationGroupOrderKeysBySide,
  ).map(([sideKey, keys]) => [sideKey, keys.length])),
  reachedPriorTurnFrontierCount: search.reachedPriorTurnFrontierCount,
  frontiers: search.reachedPriorTurnFrontiers,
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
