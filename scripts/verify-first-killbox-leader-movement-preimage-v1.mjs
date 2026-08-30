import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { reverseWarmachineActivationSequenceV2 } from
  "../src/reverse/activation-sequence-predecessor-v2.mjs";
import { generateWarmachinePreviousTurnEndPredecessorsV1 } from
  "../src/reverse/previous-turn-end-predecessor-v1.mjs";

const checkpointPath = new URL(
  "../.scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/" +
    "ticket06/score-aligned-layer-3-accepted-checkpoint-v17.json",
  import.meta.url,
);
const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
const controlStart = checkpoint.frontiers?.[0]?.state;
assert.ok(controlStart, "real layer-3 control-start state should exist");

const previousTurn = generateWarmachinePreviousTurnEndPredecessorsV1(
  controlStart,
  {
    nextSideActivationRestoreModes: ["all_alive_activated"],
    queryKey: "verify-first-killbox-leader-movement-preimage-v1",
  },
);
assert.equal(previousTurn.candidates.length, 1);
const turnEnd = previousTurn.candidates[0];
const obligation = turnEnd.predecessorStateObligations?.find((row) =>
  row.obligationKind === "leader_outside_killbox_before_first_penalty");
assert.ok(obligation, "first Kill Box penalty should create an earlier-position obligation");
assert.equal(
  obligation.leaderPieceKey,
  "player2_ashmael_keeper_of_whispers_1_1",
);
assert.equal(obligation.ownTableEdgeKey, "south");
assert.equal(obligation.killBoxDistanceIn, 12);

const focusedState = structuredClone(turnEnd.predecessorState);
for (const piece of focusedState.pieces) {
  if (piece.sideKey === "player2") {
    piece.activated = piece.pieceKey === obligation.leaderPieceKey;
  }
}
const reverse = reverseWarmachineActivationSequenceV2(focusedState, {
  sideKey: "player2",
  includePass: true,
  includeMovement: true,
  movementActionTypes: ["advance", "run"],
  predecessorStateObligations: turnEnd.predecessorStateObligations,
  maximumDepth: 1,
  maximumLabels: 4,
  maximumUniqueStates: 4,
  maximumGroupsPerExpansion: 1,
  maximumCandidatesPerExpansion: 1,
  maximumMovementStrictCandidatesPerExpansion: 4,
  maximumMovementStrictCandidateAttempts: 4,
  stopAfterBoundaryRouteCount: 1,
  queryKey: "verify-first-killbox-leader-movement-preimage-v1:activation",
});
if (reverse.runtimeBoundaries.length !== 1) {
  console.error(JSON.stringify({
    boundaryRouteCount: reverse.runtimeBoundaries.length,
    strictRejectedCount: reverse.strictRejectedCount,
    unresolvedCount: reverse.unresolvedCount,
    rejected: reverse.rejected,
    unresolved: reverse.unresolved,
  }, null, 2));
}
assert.equal(reverse.runtimeBoundaries.length, 1);
const boundary = reverse.runtimeBoundaries[0];
assert.equal(boundary.reverseEdges.length, 1);
const movement = boundary.reverseEdges[0];
assert.equal(movement.operatorKey, "movement_activation_inverse_v1");
assert.equal(
  movement.movementProposal?.relationKind,
  "leader_killbox_avoidance_origin",
);
const ashmael = boundary.state.pieces.find((piece) =>
  piece.pieceKey === obligation.leaderPieceKey);
assert.ok(ashmael);
const completeBaseDistanceFromSouthIn =
  ashmael.position.yIn + ashmael.baseSizeIn / 2;
assert.ok(completeBaseDistanceFromSouthIn > obligation.killBoxDistanceIn);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_first_killbox_leader_movement_preimage_v1",
  leaderPieceKey: obligation.leaderPieceKey,
  destination: turnEnd.predecessorState.pieces.find((piece) =>
    piece.pieceKey === obligation.leaderPieceKey)?.position,
  origin: ashmael.position,
  completeBaseDistanceFromSouthIn,
  actionType: movement.actionType,
  operatorKey: movement.operatorKey,
  relationKind: movement.movementProposal.relationKind,
  strictTransitionCount: movement.strictReplaySteps.length,
}, null, 2));
