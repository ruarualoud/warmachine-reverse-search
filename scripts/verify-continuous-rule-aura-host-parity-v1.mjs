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
import { buildWarmachineExactActionChanceClasses } from "../src/search/chance-outcomes-v1.mjs";

const SEARCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOTAL = Object.freeze({
  atomKey: "total_obedience_friendly_warrior_tough_aura",
  sourceId: "fcc057e9-77c5-4375-9770-14604599aeb3",
  name: "Total Obedience",
  text: "While within 10\" of this model, friendly warrior models gain Tough.",
});
const PRIMORDIAL = Object.freeze({
  atomKey: "primordial_resillience_friendly_shapeshifter_unyielding_aura",
  sourceId: "4a7702ca-0fd7-46c7-bb37-caa0b39e1119",
  name: "Primordial Resillience",
  text: "While within 10\" of this model, friendly Shapeshifter models gain Unyielding. (A model with Unyielding gains +2 ARM against melee damage rolls.)",
});
const ALL_SOURCE_IDS = Object.freeze([
  "41687da9-18fc-4d98-98c2-fcb5c21390aa",
  TOTAL.sourceId,
  "1071dfe3-7ee3-4bab-8731-68e1359befa0",
  PRIMORDIAL.sourceId,
  "cc0417c9-1623-449b-81de-0c72a8453693",
]);
const ALL_ATOM_KEYS = Object.freeze([
  "paragon_of_the_faith_friendly_exemplar_warrior_tough_aura",
  TOTAL.atomKey,
  "shadow_of_death_friendly_undead_faction_tough_control_aura",
  PRIMORDIAL.atomKey,
  "unconquerable_friendly_faction_warrior_unyielding_aura",
]);

function piece(overrides = {}) {
  const boxes = overrides.boxesRemaining ?? 8;
  return {
    pieceKey: overrides.pieceKey || "piece",
    label: overrides.label || overrides.pieceKey || "Piece",
    sideKey: overrides.sideKey || "player1",
    factionKey: overrides.factionKey || "test-faction",
    modelRole: overrides.modelRole || "warrior",
    modelType: overrides.modelType || overrides.modelRole || "warrior",
    position: overrides.position || { xIn: 10, yIn: 10 },
    baseSizeIn: overrides.baseSizeIn ?? 1.2,
    speedIn: 6,
    meleeRangeIn: 1,
    defense: overrides.defense ?? 10,
    armor: overrides.armor ?? 14,
    mat: 8,
    rat: 8,
    damage: { boxesRemaining: boxes, maxBoxes: overrides.maxBoxes ?? boxes },
    keywords: overrides.keywords || [],
    specialRules: overrides.specialRules || [],
    attackProfiles: overrides.attackProfiles || [],
    ...overrides,
  };
}

function source(spec, overrides = {}) {
  return piece({
    pieceKey: overrides.pieceKey || `${spec.atomKey}:source`,
    position: overrides.position || { xIn: 18, yIn: 10 },
    specialRules: [{ id: spec.sourceId, name: spec.name, description: spec.text }],
    ...overrides,
  });
}

function hostState(pieces, overrides = {}) {
  return normalizeRulesV1State({
    stateKey: overrides.stateKey || "continuous-rule-aura-search-host-parity",
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
  });
}

function grant(ruleState, pieceKey, atomKey, ruleKey) {
  return ruleState.pieces.find((entry) => entry.pieceKey === pieceKey)?.specialRules.find((entry) =>
    entry.ruleKey === ruleKey && entry.grantedByRuleAtom === atomKey) || null;
}

const rifle = {
  profileKey: "aura-parity-rifle",
  name: "Aura Parity Rifle",
  mode: "ranged",
  rangeIn: 20,
  power: 12,
  attackStatKind: "RAT",
  attackStat: 8,
};
const toughState = hostState([
  piece({
    pieceKey: "attacker",
    sideKey: "player1",
    factionKey: "enemy",
    position: { xIn: 2, yIn: 10 },
    attackProfiles: [rifle],
  }),
  source(TOTAL, { pieceKey: "total-source", sideKey: "player2" }),
  piece({
    pieceKey: "tough-target",
    sideKey: "player2",
    position: { xIn: 14, yIn: 10 },
    armor: 10,
    boxesRemaining: 3,
    maxBoxes: 3,
  }),
]);
assert(grant(toughState, "tough-target", TOTAL.atomKey, "tough"),
  "Search Host must consume the Engine continuous Tough grant");
const toughAction = enumerateRulesV1Actions(toughState).actions.find((entry) =>
  entry.actionType === "ranged_attack" && entry.actorPieceKey === "attacker" &&
    entry.targetPieceKey === "tough-target");
assert(toughAction, "Search Host must enumerate the attack against transported Tough");
const chance = buildWarmachineExactActionChanceClasses(toughAction, { state: toughState });
assert.equal(chance.exactComplete, true);
assert.equal(chance.massNumerator, chance.massDenominator,
  "Search Tough chance expansion must conserve exact probability mass");
assert(chance.deterministicSuccessorEffectTypes.includes(
  "total_obedience_friendly_warrior_tough_aura_tough_survival_roll"),
"Search must consume the source-provenanced Tough primitive instead of rejecting it as an unknown atom effect");
assert(chance.classes.some((entry) => JSON.stringify(entry).includes("tough")),
  "Search chance expansion must retain the Tough chance branch");
const toughPass = applyRulesV1Action(toughState, {
  actionKey: toughAction.actionKey,
  strictRollOutcome: { attackDice: [6, 6], damageDice: [6, 6], toughDie: 5 },
});
assert.equal(toughPass.ok, true, toughPass.reason || "Search Host Tough apply failed");
assert.equal(toughPass.nextState.pieces.find((entry) => entry.pieceKey === "tough-target").damage.boxesRemaining, 1);
assert.equal(toughPass.events.find((entry) => entry.eventType === "tough_check")?.grantedByPieceKeys[0], "total-source");

const melee = {
  profileKey: "aura-parity-blade",
  name: "Aura Parity Blade",
  mode: "melee",
  rangeIn: 1,
  power: 14,
  attackStatKind: "MAT",
  attackStat: 8,
};
const unyieldingState = hostState([
  piece({
    pieceKey: "melee-attacker",
    sideKey: "player1",
    factionKey: "enemy",
    position: { xIn: 10, yIn: 20 },
    attackProfiles: [melee],
  }),
  source(PRIMORDIAL, { pieceKey: "primordial-source", sideKey: "player2", position: { xIn: 18, yIn: 20 } }),
  piece({
    pieceKey: "unyielding-target",
    sideKey: "player2",
    position: { xIn: 12, yIn: 20 },
    specialRules: ["Shapeshifter"],
    shapeshifter: true,
    armor: 16,
    boxesRemaining: 20,
    maxBoxes: 20,
  }),
]);
assert(grant(unyieldingState, "unyielding-target", PRIMORDIAL.atomKey, "unyielding"),
  "Search Host must consume the Engine continuous Unyielding grant");
const meleeAction = enumerateRulesV1Actions(unyieldingState).actions.find((entry) =>
  entry.actionType === "melee_attack" && entry.actorPieceKey === "melee-attacker" &&
    entry.targetPieceKey === "unyielding-target");
assert(meleeAction, "Search Host must enumerate melee against transported Unyielding");
assert.equal(meleeAction.metadata?.attackResolution?.modifiers?.find((entry) =>
  entry.atomKey === PRIMORDIAL.atomKey)?.armorBonus, 2);

const withdrawn = structuredClone(unyieldingState);
withdrawn.pieces.find((entry) => entry.pieceKey === "primordial-source").removedFromPlay = true;
assert.equal(grant(normalizeRulesV1State(withdrawn), "unyielding-target", PRIMORDIAL.atomKey, "unyielding"), null);

function token(model, id) {
  return {
    id,
    pieceKey: model.pieceKey,
    label: model.label,
    sideKey: model.sideKey,
    factionKey: model.factionKey,
    x: model.position.xIn,
    y: model.position.yIn,
    width: model.baseSizeIn,
    modelType: model.modelType,
    modelRole: model.modelRole,
    resource1: model.damage.boxesRemaining,
    resource1Max: model.damage.maxBoxes,
    specialRules: model.specialRules,
  };
}
const roomSource = source(TOTAL, { pieceKey: "room-source" });
const roomTarget = piece({ pieceKey: "room-target", position: { xIn: 14, yIn: 10 } });
const room = {
  id: "continuous-rule-aura-search-layer3-room",
  game: {
    phase: "activation",
    activeSideKey: "player1",
    turnNumber: 3,
    width: 48,
    height: 48,
    strictMode: true,
    enforceStrictExecutor: true,
  },
  tokens: { source: token(roomSource, "source"), target: token(roomTarget, "target") },
  terrain: {},
  widgets: {},
  logs: {},
};
const layer3 = normalizeRulesV1State(buildWarmachineRulesV1StateFromLayer3Room(room, {
  strictMode: true,
  enforceStrictExecutor: true,
}));
assert(grant(layer3, "room-target", TOTAL.atomKey, "tough"),
  "Layer3 and Search Host must preserve the same structured aura projection");

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".mjs") ? [absolute] : [];
  });
}
const searchOwnedMatches = sourceFiles(path.join(SEARCH_ROOT, "src")).filter((filePath) => {
  const text = fs.readFileSync(filePath, "utf8");
  return ALL_SOURCE_IDS.some((sourceId) => text.includes(sourceId)) ||
    ALL_ATOM_KEYS.some((atomKey) => text.includes(atomKey));
});
assert.deepEqual(searchOwnedMatches, [], "Search must not own duplicate continuous aura semantics");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_continuous_rule_aura_host_parity_v1",
  sourceIds: ALL_SOURCE_IDS,
  atomKeys: ALL_ATOM_KEYS,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  transportedToughExecuted: true,
  toughChanceBranchVisible: true,
  transportedUnyieldingExecuted: true,
  sourceLeaveWithdrawal: true,
  layer3Parity: true,
  searchSideRuleImplementationCount: searchOwnedMatches.length,
}, null, 2));
