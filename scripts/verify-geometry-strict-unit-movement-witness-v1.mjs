import assert from "node:assert/strict";

import {
  materializeWarmachineStrictUnitMovementWitnessV1,
  WARMACHINE_STRICT_UNIT_MOVEMENT_WITNESS_V1_SCHEMA,
} from "../src/geometry/strict-unit-movement-witness-v1.mjs";
import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";

function piece(pieceKey, xIn, yIn) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey: "player1",
    position: { xIn, yIn },
    baseSizeIn: 2,
    speedIn: 6,
    boxesRemaining: 5,
    unitGroupId: "unit-a",
  };
}

function state() {
  return {
    stateKey: "strict-unit-witness",
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 1,
    strictMode: true,
    enforceStrictExecutor: true,
    board: { widthIn: 48, heightIn: 48 },
    terrain: [],
    pieces: [
      piece("unit-a-1", 10, 10),
      piece("unit-a-2", 10, 13),
    ],
  };
}

const options = {
  actorPieceKey: "unit-a-1",
  actionType: "advance",
  selectedModelPathPoints: [
    { xIn: 10, yIn: 10 },
    { xIn: 11.5, yIn: 9 },
    { xIn: 13, yIn: 10 },
  ],
  placementDestinationsByModel: [{
    pieceKey: "unit-a-2",
    destination: { xIn: 13, yIn: 13 },
  }],
};
const accepted = materializeWarmachineStrictUnitMovementWitnessV1(
  state(),
  options,
);
assert.equal(accepted.schemaVersion,
  WARMACHINE_STRICT_UNIT_MOVEMENT_WITNESS_V1_SCHEMA);
assert.equal(accepted.ok, true);
assert.equal(accepted.suppliedJointParameterStrictlyExecuted, true);
assert.equal(accepted.jointParameterDomainComplete, false);
assert.equal(accepted.everyFinalPositionMatched, true);
assert.match(accepted.hostFocusedEngineSourceReceiptHash, /^[0-9a-f]{64}$/);
assert.match(accepted.successorRuleBehaviorStateHash, /^[0-9a-f]{64}$/);
assert.ok(accepted.transitionEvents.some((event) =>
  event.eventType === "move" && event.movementPathSegmentCount === 2));
assert.ok(accepted.transitionEvents.some((event) =>
  event.eventType === "place" && event.unitNormalMovementPlacement === true));
const { strictUnitMovementWitnessReceiptHash, ...acceptedCore } = accepted;
assert.equal(stableGraphHash(acceptedCore), strictUnitMovementWitnessReceiptHash);

const rejected = materializeWarmachineStrictUnitMovementWitnessV1(state(), {
  ...options,
  placementDestinationsByModel: [{
    pieceKey: "unit-a-2",
    destination: { xIn: 13, yIn: 10 },
  }],
});
assert.equal(rejected.ok, false);
assert.equal(rejected.strictTransitionAccepted, false);
assert.equal(rejected.rejectedReason, "unit_placement_destination_map_invalid");
assert.ok(rejected.issues.includes("strict_unit_host_action_not_legal"));
assert.equal(rejected.chanceMassAssigned, false);

console.log(JSON.stringify({
  ok: true,
  marker: "search_strict_unit_movement_witness_v1",
  acceptedActionKey: accepted.selectedActionKey,
  acceptedSuccessorHash: accepted.successorRuleBehaviorStateHash,
  selectedMoveAndEveryPlacementMatched: accepted.everyFinalPositionMatched,
  invalidJointPlacementRejected: !rejected.ok,
  jointParameterDomainComplete: accepted.jointParameterDomainComplete,
  chanceMassAssigned: accepted.chanceMassAssigned,
}, null, 2));
