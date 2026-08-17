#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  bindWarmachineBenchmarkExplicitMovementPathV2,
  enumerateWarmachineBenchmarkActionsV2,
  executeWarmachineBenchmarkActivationV2,
} from "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";

function piece(overrides = {}) {
  return {
    pieceKey: overrides.pieceKey,
    label: overrides.label || overrides.pieceKey,
    sideKey: overrides.sideKey || "player1",
    modelRole: "model",
    modelType: "model",
    position: overrides.position,
    baseSizeIn: overrides.baseSizeIn ?? 1.18,
    speedIn: overrides.speedIn ?? 12,
    defense: 12,
    armor: 16,
    mat: 6,
    rat: 6,
    damage: { boxesRemaining: 10, maxBoxes: 10 },
    statusTags: [],
    specialRules: [],
    attackProfiles: [],
    activated: false,
  };
}

const laneMover = piece({ pieceKey: "lane-mover", position: { xIn: 2, yIn: 10 }, speedIn: 20 });
const laneBlocker = piece({ pieceKey: "lane-blocker", position: { xIn: 8, yIn: 10 }, speedIn: 6 });
const enemy = piece({ pieceKey: "enemy-anchor", sideKey: "player2", position: { xIn: 18, yIn: 18 } });
const initialState = {
  stateKey: "movement-order-initial",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 1,
  strictMode: true,
  board: { widthIn: 24, heightIn: 24 },
  pieces: [laneMover, laneBlocker, enemy],
  terrain: [],
  scenario: { zones: [], flags: [], score: { player1: 0, player2: 0 } },
};

const withMoverPath = bindWarmachineBenchmarkExplicitMovementPathV2(initialState, {
  actorPieceKey: laneMover.pieceKey,
  actionType: "advance",
  pathKey: "through-current-blocker",
  waypoints: [{ xIn: 12, yIn: 10 }],
  proposalSource: "activation_order_regression_v2",
});
const withBothPaths = bindWarmachineBenchmarkExplicitMovementPathV2(withMoverPath, {
  actorPieceKey: laneBlocker.pieceKey,
  actionType: "advance",
  pathKey: "clear-lane-first",
  waypoints: [{ xIn: 8, yIn: 14 }],
  proposalSource: "activation_order_regression_v2",
});

const moverActionKey = "lane-mover:advance-path:through-current-blocker:v1";
const blockerActionKey = "lane-blocker:advance-path:clear-lane-first:v1";
const beforeMover = enumerateWarmachineBenchmarkActionsV2(withBothPaths, {
  actorPieceKeys: [laneMover.pieceKey],
  actionFamilyKeys: ["movement", "timing"],
  movementPathKindKeys: ["explicit_path"],
});
assert.equal(
  beforeMover.enumeration.actions.some((action) => action.actionKey === moverActionKey),
  false,
  "the mover's route must be illegal while the earlier model still occupies its lane",
);
const blockedMover = beforeMover.enumeration.rejectedActions.find((action) => action.actionKey === moverActionKey);
assert.equal(blockedMover?.rejection?.evidence?.blocker?.blockerPieceKey, laneBlocker.pieceKey);

const blockerEnumerationAudit = [];
const blockerActivation = executeWarmachineBenchmarkActivationV2(withBothPaths, laneBlocker.pieceKey, {
  routeKey: "movement-order-clear-lane-first-v2",
  enumerationScope: {
    actionFamilyKeys: ["movement", "timing"],
    movementPathKindKeys: ["explicit_path"],
  },
  selectAction: ({ scoped, stepIndex }) => stepIndex === 0
    ? scoped.enumeration.actions.find((action) => action.actionKey === blockerActionKey) || null
    : null,
  onEnumeration: ({ scoped, stepIndex }) => blockerEnumerationAudit.push({
    stepIndex,
    runtimeWindowActive: scoped.runtimeWindowActive,
    enumerationOptions: scoped.options,
    actionKeys: scoped.enumeration.actions.map((action) => action.actionKey),
    actionTypes: scoped.enumeration.actions.map((action) => action.actionType),
    rejectedActionKeys: (scoped.enumeration.rejectedActions || [])
      .map((action) => action.actionKey),
  }),
});
assert.equal(blockerActivation.ok, true, JSON.stringify({
  reason: blockerActivation.reason,
  blockerEnumerationAudit,
}, null, 2));
assert.equal(blockerActivation.completed, true);
assert.deepEqual(blockerEnumerationAudit[0]?.enumerationOptions?.movementPathKindKeys, ["explicit_path"]);
assert.equal(blockerEnumerationAudit[1]?.runtimeWindowActive, true);
assert.equal(
  Object.hasOwn(blockerEnumerationAudit[1]?.enumerationOptions || {}, "movementPathKindKeys"),
  false,
  "automatic continuation must not inherit the first movement action's explicit-path filter",
);
assert.deepEqual(
  blockerActivation.state.pieces.find((entry) => entry.pieceKey === laneBlocker.pieceKey)?.position,
  { xIn: 8, yIn: 14 },
);
assert.equal(
  blockerActivation.state.pieces.find((entry) => entry.pieceKey === laneBlocker.pieceKey)?.activated,
  true,
  "the first model's activation ledger must remain in the successor state",
);

const afterMover = enumerateWarmachineBenchmarkActionsV2(blockerActivation.state, {
  actorPieceKeys: [laneMover.pieceKey],
  actionFamilyKeys: ["movement", "timing"],
  movementPathKindKeys: ["explicit_path"],
});
assert.ok(
  afterMover.enumeration.actions.some((action) => action.actionKey === moverActionKey),
  "the same route must become legal only after the blocking model has moved",
);

const moverActivation = executeWarmachineBenchmarkActivationV2(blockerActivation.state, laneMover.pieceKey, {
  routeKey: "movement-order-use-cleared-lane-v2",
  enumerationScope: {
    actionFamilyKeys: ["movement", "timing"],
    movementPathKindKeys: ["explicit_path"],
  },
  selectAction: ({ scoped, stepIndex }) => stepIndex === 0
    ? scoped.enumeration.actions.find((action) => action.actionKey === moverActionKey) || null
    : null,
});
assert.equal(moverActivation.ok, true, moverActivation.reason);
assert.equal(moverActivation.completed, true);
assert.deepEqual(
  moverActivation.state.pieces.find((entry) => entry.pieceKey === laneMover.pieceKey)?.position,
  { xIn: 12, yIn: 10 },
);

const initialHash = stableGraphHash(withBothPaths);
const blockerFirstHash = stableGraphHash(blockerActivation.state);
const completedOrderHash = stableGraphHash(moverActivation.state);
assert.notEqual(initialHash, blockerFirstHash, "moving the blocker and consuming its activation must create a distinct search state");
assert.notEqual(blockerFirstHash, completedOrderHash, "the second activation must create another distinct search state");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "warmachine_movement_activation_order_verifier_v2",
  beforeBlockerMoved: {
    moverPathLegal: false,
    blockerPieceKey: blockedMover.rejection.evidence.blocker.blockerPieceKey,
  },
  afterBlockerMoved: {
    moverPathLegal: true,
    blockerActivated: true,
    blockerPosition: { xIn: 8, yIn: 14 },
    blockerActivationEnumeration: blockerEnumerationAudit,
  },
  final: {
    moverPosition: { xIn: 12, yIn: 10 },
    distinctStateHashes: new Set([initialHash, blockerFirstHash, completedOrderHash]).size,
  },
  claimBoundary: "This proves one order-dependent strict reachability route. It does not rank clearing the lane above holding, blocking, attacking, or any other reachable branch.",
}, null, 2));
