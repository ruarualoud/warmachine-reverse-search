import assert from "node:assert/strict";

import {
  applyRulesV1Action,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

function model(overrides = {}) {
  return {
    pieceKey: overrides.pieceKey || "model",
    label: overrides.label || overrides.pieceKey || "Model",
    sideKey: overrides.sideKey || "player1",
    modelRole: "warrior",
    modelType: "unit",
    position: overrides.position || { xIn: 4, yIn: 4 },
    baseSizeIn: overrides.baseSizeIn ?? 1.18,
    speedIn: 6,
    meleeRangeIn: 1,
    defense: overrides.defense ?? 10,
    armor: overrides.armor ?? 20,
    mat: 6,
    rat: 7,
    resourceKind: "generic_resource",
    resourcePoints: 0,
    resourceMax: 0,
    damage: { boxesRemaining: 10, maxBoxes: 10 },
    statusTags: [],
    attackProfiles: overrides.attackProfiles || [],
    specialRules: overrides.specialRules || [],
    ...overrides,
  };
}

const rifle = {
  profileKey: "host-authority-rifle",
  name: "Host Authority Rifle",
  mode: "ranged",
  rangeIn: 20,
  power: 10,
  attackStatKind: "RAT",
  attackStat: 7,
  hitModel: "attack_stat_vs_def_probability_v0",
};

function state(pieces, terrain = [], stateKey = "host-authority-state") {
  return normalizeRulesV1State({
    stateKey,
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 2,
    strictMode: true,
    enforceStrictExecutor: true,
    ruleAtomRuntimeMode: "authoritative",
    board: { widthIn: 48, heightIn: 48 },
    pieces,
    terrain,
    commandCards: [],
    scenario: {
      zones: [],
      flags: [],
      actionObjectives: [],
      score: { player1: 0, player2: 0 },
      victoryThreshold: 5,
    },
  });
}

function rangedRows(ruleState, actorPieceKey, targetPieceKey) {
  const enumeration = enumerateRulesV1Actions(ruleState);
  const matches = (row) => row.actionType === "ranged_attack" &&
    row.actorPieceKey === actorPieceKey && row.targetPieceKey === targetPieceKey;
  return {
    action: (enumeration.actions || []).find(matches),
    rejected: (enumeration.rejectedActions || []).find(matches),
  };
}

function attackRows(ruleState, actorPieceKey, targetPieceKey, actionType) {
  const enumeration = enumerateRulesV1Actions(ruleState);
  const matches = (row) => row.actionType === actionType &&
    row.actorPieceKey === actorPieceKey && row.targetPieceKey === targetPieceKey;
  return {
    action: (enumeration.actions || []).find(matches),
    rejected: (enumeration.rejectedActions || []).find(matches),
  };
}

const shooter = model({
  pieceKey: "shooter",
  position: { xIn: 4, yIn: 12 },
  attackProfiles: [rifle],
});
const stealthTarget = model({
  pieceKey: "stealth-target",
  sideKey: "player2",
  position: { xIn: 16, yIn: 12 },
  specialRules: [{ ruleKey: "stealth", name: "Stealth" }],
});

const stealthState = state([shooter, stealthTarget], [], "host-authority-stealth");
const stealth = rangedRows(stealthState, shooter.pieceKey, stealthTarget.pieceKey);
assert.ok(stealth.action, "Stealth must not be reinterpreted as an illegal declaration");
assert.equal(stealth.rejected, undefined);
assert.equal(stealth.action.metadata?.attackResolution?.automaticMiss, true);
assert.equal(stealth.action.metadata?.attackResolution?.hitProbability, 0);
const beforeBoxes = stealthTarget.damage.boxesRemaining;
const stealthTransition = applyRulesV1Action(stealthState, stealth.action);
assert.equal(stealthTransition.ok, true);
assert.equal(stealthTransition.nextState.pieces.find((piece) =>
  piece.pieceKey === stealthTarget.pieceKey).damage.boxesRemaining, beforeBoxes);
assert.ok(stealthTransition.events.some((event) =>
  event.eventType === "strict_automatic_miss_outcome_applied"));

const stealthAtFiveTarget = {
  ...stealthTarget,
  pieceKey: "stealth-target-at-five",
  position: { xIn: 10.18, yIn: 12 },
};
const stealthAtFiveState = state([shooter, stealthAtFiveTarget], [], "host-authority-stealth-at-five");
const stealthAtFive = rangedRows(stealthAtFiveState, shooter.pieceKey, stealthAtFiveTarget.pieceKey);
assert.ok(stealthAtFive.action);
assert.equal(stealthAtFive.action.metadata?.attackResolution?.automaticMiss, false,
  "Stealth's greater-than-five boundary is open at exactly 5 inches");

const sprayShooter = model({
  ...shooter,
  pieceKey: "spray-shooter",
  attackProfiles: [{ ...rifle, profileKey: "host-authority-spray", name: "Host Authority Spray", isSpray: true }],
});
const sprayState = state([sprayShooter, stealthTarget], [], "host-authority-spray-stealth");
const spray = rangedRows(sprayState, sprayShooter.pieceKey, stealthTarget.pieceKey);
assert.ok(spray.action);
assert.equal(spray.action.metadata?.attackResolution?.automaticMiss, false);
assert.equal(spray.action.metadata?.attackResolution?.automaticHitMissResolution?.outcome, "attack_roll");
const sprayTransition = applyRulesV1Action(sprayState, {
  actionKey: spray.action.actionKey,
  strictRollOutcome: { attackDice: [6, 6], damageDice: [1, 1], damageColumn: 1 },
});
assert.equal(sprayTransition.ok, true, sprayTransition.reason || "Spray ignores Stealth apply");

const arcaneShooter = model({
  ...shooter,
  pieceKey: "arcane-shooter",
  modelRole: "warcaster",
  modelType: "warcaster",
  resourceKind: "focus",
  resourcePoints: 5,
  resourceMax: 7,
  arc: 7,
  attackProfiles: [{
    profileKey: "host-authority-arcane",
    name: "Host Authority Arcane Attack",
    mode: "spell",
    rangeIn: 20,
    power: 10,
    cost: 1,
    attackStatKind: "ARC",
    attackStat: 7,
  }],
});
const arcaneState = state([arcaneShooter, stealthTarget], [], "host-authority-arcane-stealth");
const arcane = attackRows(arcaneState, arcaneShooter.pieceKey, stealthTarget.pieceKey, "offensive_spell");
assert.ok(arcane.action);
assert.equal(arcane.action.metadata?.attackResolution?.automaticMiss, true);
const arcaneTransition = applyRulesV1Action(arcaneState, { actionKey: arcane.action.actionKey });
assert.equal(arcaneTransition.ok, true, arcaneTransition.reason || "Arcane Stealth automatic miss apply");

const trueSightShooter = {
  ...shooter,
  pieceKey: "true-sight-shooter",
  specialRules: [{ ruleKey: "true_sight", name: "True Sight" }],
};
const trueSightState = state(
  [trueSightShooter, stealthTarget],
  [],
  "host-authority-true-sight",
);
const trueSight = rangedRows(
  trueSightState,
  trueSightShooter.pieceKey,
  stealthTarget.pieceKey,
);
assert.ok(trueSight.action);
assert.equal(trueSight.action.metadata?.attackResolution?.automaticMiss, false);
assert.ok((trueSight.action.metadata?.specialRuleAnalysis?.effects || []).some((effect) =>
  effect.ruleKey === "true_sight" && effect.effectType === "ignore_stealth"));

const terrainBlockedState = state([shooter, stealthTarget], [{
  terrainKey: "host-authority-obstruction",
  type: "obstruction",
  xIn: 10,
  yIn: 12,
  widthIn: 4,
  heightIn: 4,
  blocksLineOfSight: true,
  blocksMovement: false,
  baseElevationIn: 0,
  baseElevationMapped: true,
  verticalHeightIn: 4,
  verticalHeightMapped: true,
  exactWithinScope: true,
}], "host-authority-terrain-los");
const terrainBlocked = rangedRows(
  terrainBlockedState,
  shooter.pieceKey,
  stealthTarget.pieceKey,
);
assert.equal(terrainBlocked.action, undefined);
assert.equal(terrainBlocked.rejected?.rejection?.reason, "line_of_sight_blocked");

const interveningModel = model({
  pieceKey: "intervening-model",
  sideKey: "player2",
  position: { xIn: 10, yIn: 12 },
  baseSizeIn: 5,
});
const modelBlockedState = state(
  [shooter, interveningModel, stealthTarget],
  [],
  "host-authority-model-los",
);
const modelBlocked = rangedRows(
  modelBlockedState,
  shooter.pieceKey,
  stealthTarget.pieceKey,
);
assert.equal(modelBlocked.action, undefined);
assert.equal(modelBlocked.rejected?.rejection?.reason, "line_of_sight_blocked");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_terminal_state_host_rule_authority_v1",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  statePresetOwns: [
    "pieces",
    "positions",
    "terrain",
    "status",
    "resources",
    "timing",
  ],
  hostOwns: [
    "legal_action_enumeration",
    "stealth_resolution",
    "stealth_distance_boundary",
    "spray_ignores_stealth",
    "arcane_stealth_resolution",
    "true_sight_interaction",
    "terrain_line_of_sight",
    "model_line_of_sight",
    "strict_transition",
  ],
  stealthAttackLegalAutomaticMiss: true,
  stealthExactlyFiveUsesAttackRoll: true,
  sprayIgnoresStealthAndExecutes: true,
  arcaneAttackOverFiveAutomaticallyMissesAndExecutes: true,
  trueSightIgnoresStealth: true,
  terrainLosStrictRejected: true,
  modelLosStrictRejected: true,
  searchSideRuleImplementationCount: 0,
  trainingTruth: false,
}, null, 2));
