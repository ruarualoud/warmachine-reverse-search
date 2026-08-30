#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  enumerateRulesV1Actions,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const SEARCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MURDEROUS_SOURCE_ID = "cc556cf4-09db-4943-b282-f2194d9974ca";
const MURDEROUS_ATOM_KEY = "murderous_melee_attack_die_against_warrior";
const MURDEROUS_TEXT = "This model gains an additional die on melee attack rolls against warrior models.";
const BLACK_PENNY_SOURCE_ID = "081bd629-159d-416f-98a5-a1546ba210ca";
const BLACK_PENNY_ATOM_KEY = "black_penny_weapon_attack_target_in_melee_defense_bonus_denial";
const BLACK_PENNY_TEXT = "This attack ignores the target in melee DEF bonus.";

function rule(id, name, text) {
  return { id, sourceIds: [id], sourceTexts: [text], name, description: text };
}

function profile(profileKey, mode, specialRules = []) {
  return {
    profileKey,
    sourceWeaponId: `${profileKey}-source`,
    name: profileKey,
    mode,
    rangeIn: mode === "ranged" ? 12 : 1,
    power: 10,
    attackStatKind: mode === "ranged" ? "RAT" : "MAT",
    attackStat: 7,
    count: 1,
    specialRules,
  };
}

function piece(overrides = {}) {
  const boxes = overrides.boxesRemaining ?? 30;
  return {
    pieceKey: overrides.pieceKey || "piece",
    label: overrides.label || overrides.pieceKey || "Piece",
    sideKey: overrides.sideKey || "player1",
    factionKey: overrides.sideKey === "player2" ? "enemy" : "friendly",
    modelRole: overrides.modelRole || "warrior",
    modelType: overrides.modelType || overrides.modelRole || "warrior",
    traits: overrides.traits || ["living", "warrior"],
    position: overrides.position || { xIn: 8, yIn: 8 },
    baseSizeIn: 1.18,
    speedIn: 6,
    meleeRangeIn: overrides.meleeRangeIn ?? 1,
    defense: overrides.defense ?? 13,
    armor: 20,
    mat: 7,
    rat: 7,
    resourceKind: overrides.resourceKind || "none",
    resourcePoints: overrides.resourcePoints ?? 0,
    resourceMax: overrides.resourceMax ?? 0,
    specialRules: overrides.specialRules || [],
    attackProfiles: overrides.attackProfiles || [],
    damage: { boxesRemaining: boxes, maxBoxes: boxes },
    ...overrides,
  };
}

function state(pieces, stateKey) {
  return {
    stateKey,
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 3,
    strictMode: true,
    enforceStrictExecutor: true,
    ruleAtomRuntimeMode: "authoritative",
    board: { widthIn: 48, heightIn: 48 },
    pieces,
    terrain: [],
    movementPaths: [],
    commandCards: [],
    scenario: { zones: [], flags: [], actionObjectives: [], score: { player1: 0, player2: 0 }, victoryThreshold: 5 },
  };
}

function attack(ruleState, actionType, profileKey) {
  return enumerateRulesV1Actions(ruleState).actions.find((candidate) =>
    candidate.actionType === actionType && candidate.metadata?.attackProfile?.profileKey === profileKey);
}

const murderousState = state([
  piece({
    pieceKey: "search-murderous-actor",
    modelRole: "warjack",
    modelType: "warjack",
    traits: ["construct", "warjack"],
    specialRules: [rule(MURDEROUS_SOURCE_ID, "Murderous", MURDEROUS_TEXT)],
    attackProfiles: [profile("search-murderous-blade", "melee")],
  }),
  piece({
    pieceKey: "search-warrior-target",
    sideKey: "player2",
    position: { xIn: 8.8, yIn: 8 },
  }),
], "search-murderous");
const murderous = attack(murderousState, "melee_attack", "search-murderous-blade");
assert(murderous, "Search shared Host must expose Murderous melee attack");
assert.equal(murderous.metadata?.attackResolution?.attackDiceCount, 3);
assert(murderous.metadata?.ruleAtomEffects?.some((effect) => effect.atomKey === MURDEROUS_ATOM_KEY));

const blackPennyState = state([
  piece({
    pieceKey: "search-black-penny-actor",
    position: { xIn: 5, yIn: 20 },
    attackProfiles: [profile("search-black-penny-gun", "ranged", [rule(BLACK_PENNY_SOURCE_ID, "Black Penny", BLACK_PENNY_TEXT)])],
  }),
  piece({
    pieceKey: "search-engager",
    sideKey: "player1",
    position: { xIn: 10, yIn: 21.1 },
    meleeRangeIn: 1,
  }),
  piece({
    pieceKey: "search-black-penny-target",
    sideKey: "player2",
    position: { xIn: 10, yIn: 20 },
    defense: 13,
  }),
], "search-black-penny");
const blackPenny = attack(blackPennyState, "ranged_attack", "search-black-penny-gun");
assert(blackPenny, "Search shared Host must expose Black Penny ranged attack");
assert.equal(blackPenny.metadata?.attackResolution?.targetDefense, 13);
assert(blackPenny.metadata?.attackResolution?.modifiers?.some((modifier) =>
  modifier.atomKey === BLACK_PENNY_ATOM_KEY && modifier.ignoredDefenseBonus === 4));

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".mjs") ? [absolute] : [];
  });
}

const duplicateImplementations = sourceFiles(path.join(SEARCH_ROOT, "src")).filter((filePath) => {
  const sourceText = fs.readFileSync(filePath, "utf8");
  return [MURDEROUS_SOURCE_ID, MURDEROUS_ATOM_KEY, BLACK_PENNY_SOURCE_ID, BLACK_PENNY_ATOM_KEY]
    .some((needle) => sourceText.includes(needle));
});
assert.deepEqual(duplicateImplementations, [],
  "Search must consume the shared Engine Host instead of owning either exact attack rule");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_exact_attack_source_host_parity_v1",
  atomKeys: [MURDEROUS_ATOM_KEY, BLACK_PENNY_ATOM_KEY],
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  murderousAttackDiceCount: murderous.metadata?.attackResolution?.attackDiceCount,
  blackPennyTargetDefense: blackPenny.metadata?.attackResolution?.targetDefense,
  searchSideRuleImplementationCount: duplicateImplementations.length,
  globalStrictReady: false,
  trainingTruth: false,
}, null, 2));
