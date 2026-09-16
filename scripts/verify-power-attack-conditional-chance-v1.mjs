#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  applyRulesV1Action,
  buildRulesV1StrictPowerAttackChanceContract,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
} from "../src/warmachine-host-runtime.mjs";
import {
  buildWarmachineExactActionChanceClasses,
  warmachineExactChanceClassActionPatch,
} from "../src/search/chance-outcomes-v1.mjs";

function piece(overrides = {}) {
  return {
    pieceKey: overrides.pieceKey,
    label: overrides.label || overrides.pieceKey,
    sideKey: overrides.sideKey || "player1",
    modelRole: "model",
    modelType: "model",
    position: overrides.position,
    baseSizeIn: 1.18,
    speedIn: 6,
    meleeRangeIn: overrides.sideKey === "player2" ? 0 : 1,
    meleePower: 12,
    defense: 10,
    armor: 20,
    mat: 8,
    resourceKind: "generic_resource",
    resourcePoints: 0,
    resourceMax: 0,
    damage: { boxesRemaining: 40, maxBoxes: 40 },
    statusTags: [],
    powerAttackTypes: overrides.powerAttackTypes || [],
    attackProfiles: [],
  };
}

const state = normalizeRulesV1State({
  stateKey: "search-power-attack-conditional-chance",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 1,
  strictMode: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    piece({
      pieceKey: "p1_slammer",
      position: { xIn: 2, yIn: 8 },
      powerAttackTypes: ["slam"],
    }),
    piece({
      pieceKey: "p2_slam_target",
      sideKey: "player2",
      position: { xIn: 6.25, yIn: 8 },
    }),
    piece({
      pieceKey: "p2_contact_blocker",
      sideKey: "player2",
      position: { xIn: 10.25, yIn: 8 },
    }),
  ],
  terrain: [],
  scenario: {
    zones: [],
    flags: [],
    score: { player1: 0, player2: 0 },
    victoryThreshold: 5,
  },
});
const action = enumerateRulesV1Actions(state).actions.find((candidate) =>
  candidate.actionType === "slam_power_attack" &&
  candidate.targetPieceKey === "p2_slam_target");
assert.ok(action, "strict Engine should enumerate the fixture Slam");

const contract = buildRulesV1StrictPowerAttackChanceContract(state, action);
assert.equal(contract.exactComplete, true);
assert.deepEqual(
  contract.branches.map((branch) => branch.primaryDamageDiceCount),
  [2, 2, 2, 3, 3, 3],
);
assert.deepEqual(
  contract.branches.map((branch) => branch.collateralTargets.length),
  [0, 0, 1, 1, 1, 1],
);

const chance = buildWarmachineExactActionChanceClasses(action, { state });
assert.equal(chance.exactComplete, true);
assert.equal(String(chance.massNumerator), String(chance.massDenominator));
const hitClasses = chance.classes.filter((chanceClass) => chanceClass.hit === true);
assert.deepEqual(
  [...new Set(hitClasses.filter((chanceClass) =>
    chanceClass.strictRollOutcome.slamDistanceIn <= 3)
    .map((chanceClass) => chanceClass.strictRollOutcome.damageDice.length))],
  [2],
  "short displacement branches must use the rebased 2d6 primary roll",
);
assert.deepEqual(
  [...new Set(hitClasses.filter((chanceClass) =>
    chanceClass.strictRollOutcome.slamDistanceIn >= 4)
    .map((chanceClass) => chanceClass.strictRollOutcome.damageDice.length))],
  [3],
  "contact displacement branches must use the rebased 3d6 primary roll",
);
assert.equal(hitClasses.filter((chanceClass) =>
  chanceClass.strictRollOutcome.slamDistanceIn >= 3).every((chanceClass) =>
  chanceClass.strictRollOutcome.slamCollisionDamageByTarget?.p2_contact_blocker), true,
  "every collision branch must include an independent collateral damage roll",
);

let acceptedClassCount = 0;
for (const chanceClass of chance.classes) {
  const transition = applyRulesV1Action(state, {
    actionKey: action.actionKey,
    ...warmachineExactChanceClassActionPatch(chanceClass),
  });
  assert.equal(transition.ok, true,
    `${chanceClass.classKey} strict-rejected: ${transition.reason || "unknown"}`);
  acceptedClassCount += 1;
}

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_power_attack_conditional_chance_v1",
  actionKey: action.actionKey,
  classCount: chance.classCount,
  acceptedClassCount,
  mass: [String(chance.massNumerator), String(chance.massDenominator)],
  primaryDamageDiceCountByDistance:
    contract.branches.map((branch) => branch.primaryDamageDiceCount),
  collateralTargetCountByDistance:
    contract.branches.map((branch) => branch.collateralTargets.length),
}, null, 2));
