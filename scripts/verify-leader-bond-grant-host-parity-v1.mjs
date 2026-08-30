#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyRulesV1Action,
  buildWarmachineRulesV1StateFromLayer3Room,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const SEARCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UNYIELDING = Object.freeze({
  sourceId: "75a4e104-940d-4919-8758-aeb3e26d2d03",
  atomKey: "bond_unyielding_leader_control_grant",
  name: "Bond (Unyielding)",
  text: "This model is bonded to your Leader. This model is not considered to be bonded while under your opponent's control. While this model is bonded to your Leader and in its control range, it gains Unyielding. (A model with Unyielding gains +2 ARM against melee damage rolls.)",
  grantedRuleKey: "unyielding",
});
const REPOSITION = Object.freeze({
  sourceId: "a869db19-76b2-417a-b773-51b7b791a52d",
  atomKey: "bond_reposition_3_leader_control_grant",
  name: "Bond (Reposition [3\"])",
  text: "This model is bonded to your Leader. This model is not considered to be bonded while under your opponent’s control. While this model is bonded to your Leader and in its control range, it gains Reposition [3]. (At the end of a model/unit with Reposition [3\"]’s activation, it can advance up to 3\", then its activation ends.)",
  grantedRuleKey: "reposition",
});
const SPECS = Object.freeze([UNYIELDING, REPOSITION]);

function piece(overrides = {}) {
  const boxesRemaining = overrides.boxesRemaining ?? 20;
  return {
    pieceKey: overrides.pieceKey || "piece",
    label: overrides.label || overrides.pieceKey || "Piece",
    sideKey: overrides.sideKey || "player1",
    factionKey: overrides.factionKey || "test-faction",
    modelRole: overrides.modelRole || "warrior",
    modelType: overrides.modelType || overrides.modelRole || "warrior",
    position: overrides.position || { xIn: 10, yIn: 10, zIn: 0 },
    baseSizeIn: overrides.baseSizeIn ?? 1.2,
    speedIn: 6,
    meleeRangeIn: 1,
    defense: 12,
    armor: overrides.armor ?? 16,
    mat: 8,
    rat: 8,
    damage: overrides.damage || { boxesRemaining, maxBoxes: boxesRemaining },
    specialRules: overrides.specialRules || [],
    attackProfiles: overrides.attackProfiles || [],
    ...overrides,
  };
}

function leader(overrides = {}) {
  return piece({
    pieceKey: "leader",
    modelRole: "leader",
    modelType: "warcaster",
    assassinationLeader: true,
    controlRangeKnown: true,
    controlRangeIn: 12,
    ...overrides,
  });
}

function bonded(overrides = {}) {
  return piece({
    pieceKey: "bonded",
    modelRole: "warjack",
    modelType: "warjack",
    position: { xIn: 15, yIn: 10, zIn: 0 },
    startingControllerPieceKey: "leader",
    controllerPieceKey: "leader",
    specialRules: SPECS.map((spec) => ({
      id: spec.sourceId,
      name: spec.name,
      description: spec.text,
    })),
    ...overrides,
  });
}

function enemy(overrides = {}) {
  return piece({
    pieceKey: "enemy",
    sideKey: "player2",
    factionKey: "enemy",
    position: { xIn: 17, yIn: 10, zIn: 0 },
    attackProfiles: [{
      profileKey: "bond-parity-blade",
      name: "Bond Parity Blade",
      mode: "melee",
      rangeIn: 1,
      power: 14,
      attackStatKind: "MAT",
      attackStat: 8,
    }],
    ...overrides,
  });
}

function state(pieces, overrides = {}) {
  return normalizeRulesV1State({
    stateKey: overrides.stateKey || "leader-bond-search-host-parity",
    activeSideKey: overrides.activeSideKey || "player1",
    phaseKey: "activation",
    turnNumber: 3,
    strictMode: true,
    enforceStrictExecutor: true,
    ruleAtomRuntimeMode: "authoritative",
    board: { widthIn: 48, heightIn: 48 },
    pieces,
    terrain: [],
    scenario: { zones: [], flags: [], score: { player1: 0, player2: 0 }, victoryThreshold: 5 },
    ...overrides,
  });
}

function grant(ruleState, spec) {
  return ruleState.pieces.find((entry) => entry.pieceKey === "bonded")?.specialRules.find((entry) =>
    entry.ruleKey === spec.grantedRuleKey && entry.grantedByRuleAtom === spec.atomKey) || null;
}

function bondState(ruleState, spec) {
  return ruleState.pieces.find((entry) => entry.pieceKey === "bonded")?.ruleAtomLeaderBondStates?.find((entry) =>
    entry.atomKey === spec.atomKey) || null;
}

const direct = state([leader(), bonded(), enemy()], { activeSideKey: "player2" });
for (const spec of SPECS) {
  assert.equal(bondState(direct, spec)?.assignedLeaderPieceKey, "leader");
  assert.equal(bondState(direct, spec)?.active, true);
  assert(grant(direct, spec), `Search Host must consume ${spec.atomKey}`);
}
const melee = enumerateRulesV1Actions(direct).actions.find((entry) =>
  entry.actionType === "melee_attack" && entry.actorPieceKey === "enemy" && entry.targetPieceKey === "bonded");
assert(melee, "Search Host must enumerate melee against the bonded model");
assert.equal(melee.metadata?.attackResolution?.modifiers?.find((entry) =>
  entry.atomKey === UNYIELDING.atomKey)?.armorBonus, 2);

const activationEnd = state([leader(), bonded()], {
  anyTimeActivationWindow: {
    active: true,
    actorPieceKey: "bonded",
    sourceActionType: "advance",
    sourceActionKey: "bonded:advance:v1",
    normalMovementUsed: true,
    combatActionUsed: true,
  },
});
const close = enumerateRulesV1Actions(activationEnd).actions.find((entry) =>
  entry.actionType === "end_any_time_activation_window" && entry.actorPieceKey === "bonded");
assert(close, "Search Host must expose the activation-end transition");
const pending = applyRulesV1Action(activationEnd, close);
assert.equal(pending.ok, true, pending.reason || "Bond Reposition transition failed");
assert.equal(pending.nextState.repositionWindow?.eligibleRows?.find((entry) =>
  entry.atomKeys?.includes(REPOSITION.atomKey))?.distanceIn, 3);
assert(enumerateRulesV1Actions(pending.nextState).actions.some((entry) =>
  entry.actionType === "decline_reposition" && entry.actorPieceKey === "bonded"));

const enemyControlled = state([
  leader(),
  bonded({ currentControllerSideKey: "player2", underOpponentControl: true }),
]);
for (const spec of SPECS) {
  assert.equal(bondState(enemyControlled, spec)?.assignedLeaderPieceKey, "leader");
  assert.equal(bondState(enemyControlled, spec)?.active, false);
  assert.equal(grant(enemyControlled, spec), null);
}
const outside = state([leader(), bonded({ position: { xIn: 30, yIn: 10, zIn: 0 } })]);
for (const spec of SPECS) assert.equal(grant(outside, spec), null);

function token(model, id) {
  return {
    ...model,
    id,
    tokenId: id,
    x: model.position.xIn,
    y: model.position.yIn,
    width: model.baseSizeIn,
    resource1: model.damage.boxesRemaining,
    resource1Max: model.damage.maxBoxes,
  };
}
const roomLeader = leader();
const roomBonded = bonded();
const room = {
  id: "leader-bond-search-layer3-room",
  game: {
    phase: "activation",
    activeSideKey: "player1",
    turnNumber: 3,
    width: 48,
    height: 48,
    strictMode: true,
    enforceStrictExecutor: true,
  },
  tokens: {
    leader: token(roomLeader, "leader"),
    bonded: token(roomBonded, "bonded"),
  },
  terrain: {},
  widgets: {},
  logs: {},
};
const layer3 = normalizeRulesV1State(buildWarmachineRulesV1StateFromLayer3Room(room, {
  strictMode: true,
  enforceStrictExecutor: true,
}));
for (const spec of SPECS) {
  assert.equal(bondState(layer3, spec)?.active, true);
  assert(grant(layer3, spec), `Layer3 must preserve ${spec.atomKey}`);
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".mjs") ? [absolute] : [];
  });
}
const searchOwnedMatches = sourceFiles(path.join(SEARCH_ROOT, "src")).filter((filePath) => {
  const sourceText = fs.readFileSync(filePath, "utf8");
  return SPECS.some((spec) => sourceText.includes(spec.sourceId) || sourceText.includes(spec.atomKey));
});
assert.deepEqual(searchOwnedMatches, [], "Search must not own duplicate Bond semantics");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_leader_bond_grant_host_parity_v1",
  sourceIds: SPECS.map((entry) => entry.sourceId).sort(),
  atomKeys: SPECS.map((entry) => entry.atomKey).sort(),
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  immutableLeaderAssignmentPreserved: true,
  transportedUnyieldingExecuted: true,
  transportedRepositionWindowExecuted: true,
  opponentControlWithdrawal: true,
  rangeWithdrawal: true,
  layer3Parity: true,
  searchSideRuleImplementationCount: searchOwnedMatches.length,
  globalStrictReady: false,
  trainingTruth: false,
}, null, 2));
