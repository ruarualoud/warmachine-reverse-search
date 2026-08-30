#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyRulesV1Action,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  recognizedWarmachineRuleAtomByAtomKey,
  resolveWarmachineHostPath,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const SEARCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRUE_SIGHT_SOURCE_ID = "25438572-3b68-4712-99c6-ccb33e449a9d";
const TRUE_SIGHT_ATOM_KEY = "true_sight_observer_cloud_los_and_stealth_override";
const TRUE_SIGHT_TEXT = "This model ignores cloud effects when determining LOS. This model also ignores Stealth.";
const GUIDED_SOURCE_ID = "f6fdad31-ce7e-4c15-8358-3504edf33404";
const GUIDED_ATOM_KEY = "guided_weapon_attack_automatic_hit";
const GUIDED_TEXT = "Attacks made with this weapon automatically hit.";
const HARDPOINT_SOURCE_ID = "6d1a4af7-76da-429d-bedf-b49031785bfa";
const WEAPON_CRATE_ATOM_KEY = "weapon_crate_valiant_contact_selected_heavy_weapon_upgrade";
const VALIANT_CARD_ID = "5afc446e-d0ce-4244-8b9a-40273ff03388";
const CRATE_CARD_ID = "509008d1-ff23-4e4f-987e-6d017a1d6dd1";
const ROCKET_POD_OPTION_ID = "125362fc-0c41-4ca1-a1d1-9ebeebb521f3";

function rule(id, name, text, ruleKey = "") {
  return { id, sourceIds: [id], sourceTexts: [text], ruleKey, name, description: text };
}

function profile(profileKey, specialRules = []) {
  return {
    profileKey,
    sourceWeaponId: `${profileKey}-source`,
    name: profileKey,
    mode: "ranged",
    rangeIn: 20,
    power: 10,
    attackStatKind: "RAT",
    attackStat: 7,
    count: 1,
    specialRules,
  };
}

function piece(overrides = {}) {
  const boxes = overrides.boxesRemaining ?? 20;
  return {
    pieceKey: overrides.pieceKey || "piece",
    label: overrides.label || overrides.pieceKey || "Piece",
    sideKey: overrides.sideKey || "player1",
    modelRole: overrides.modelRole || "warrior",
    modelType: overrides.modelType || "warrior",
    traits: overrides.traits || ["living", "warrior"],
    position: overrides.position || { xIn: 4, yIn: 4 },
    baseSizeIn: overrides.baseSizeIn ?? 1.18,
    speedIn: 6,
    meleeRangeIn: 1,
    defense: overrides.defense ?? 12,
    armor: overrides.armor ?? 16,
    mat: 7,
    rat: 7,
    resourceKind: overrides.resourceKind || "none",
    resourcePoints: overrides.resourcePoints ?? 0,
    resourceMax: overrides.resourceMax ?? 0,
    damage: { boxesRemaining: boxes, maxBoxes: boxes },
    specialRules: overrides.specialRules || [],
    attackProfiles: overrides.attackProfiles || [],
    ...overrides,
  };
}

function state(pieces, terrain = [], stateKey = "search-exact-reuse") {
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
    terrain,
    movementPaths: [],
    commandCards: [],
    scenario: { zones: [], flags: [], actionObjectives: [], score: { player1: 0, player2: 0 }, victoryThreshold: 5 },
  };
}

function attack(ruleState, actorPieceKey, targetPieceKey, profileKey) {
  return enumerateRulesV1Actions(ruleState).actions.find((candidate) =>
    candidate.actionType === "ranged_attack" && candidate.actorPieceKey === actorPieceKey &&
      candidate.targetPieceKey === targetPieceKey && candidate.metadata?.attackProfile?.profileKey === profileKey);
}

const trueSightActor = piece({
  pieceKey: "search-true-sight-actor",
  position: { xIn: 4, yIn: 16 },
  specialRules: [rule(TRUE_SIGHT_SOURCE_ID, "True Sight", TRUE_SIGHT_TEXT, "true_sight")],
  attackProfiles: [profile("search-true-sight-rifle")],
});
const trueSightTarget = piece({
  pieceKey: "search-true-sight-target",
  sideKey: "player2",
  position: { xIn: 16, yIn: 16 },
  specialRules: [{ ruleKey: "stealth", name: "Stealth" }],
});
const cloud = {
  terrainKey: "search-true-sight-cloud",
  type: "cloud",
  xIn: 10,
  yIn: 16,
  radiusIn: 1.5,
  widthIn: 3,
  heightIn: 3,
  isCloudEffect: true,
  cloudEffect: true,
  obscuresLineOfSight: true,
  grantsConcealment: true,
  strictObscuringVisibilityMapped: true,
  cloudForestVisibilityMapped: true,
  obscuringLosBehavior: "blocks_los_through",
};
const trueSight = attack(state([trueSightActor, trueSightTarget], [cloud]), trueSightActor.pieceKey, trueSightTarget.pieceKey, "search-true-sight-rifle");
assert(trueSight, "Search must receive the shared True Sight Host action through cloud and Stealth");
assert.equal(trueSight.metadata?.attackResolution?.automaticMiss, false);
assert(trueSight.metadata?.ruleAtomEffects?.some((effect) => effect.atomKey === TRUE_SIGHT_ATOM_KEY));

const guidedActor = piece({
  pieceKey: "search-guided-actor",
  position: { xIn: 5, yIn: 5 },
  attackProfiles: [profile("search-guided-weapon", [rule(GUIDED_SOURCE_ID, "Guided", GUIDED_TEXT, "unmapped_guided")])],
});
const guidedTarget = piece({ pieceKey: "search-guided-target", sideKey: "player2", position: { xIn: 10, yIn: 5 } });
const guidedState = state([guidedActor, guidedTarget]);
const guided = attack(guidedState, guidedActor.pieceKey, guidedTarget.pieceKey, "search-guided-weapon");
assert(guided, "Search must receive the shared Guided Host action");
assert.equal(guided.metadata?.attackResolution?.automaticHitMissResolution?.outcome, "automatic_hit");
assert(guided.metadata?.ruleAtomEffects?.some((effect) => effect.atomKey === GUIDED_ATOM_KEY));
const guidedApplied = applyRulesV1Action(guidedState, {
  actionKey: guided.actionKey,
  strictRollOutcome: { damageDice: [1, 1] },
});
assert.equal(guidedApplied.ok, true, guidedApplied.reason);

const data = JSON.parse(fs.readFileSync(
  resolveWarmachineHostPath("android-shell/assets/default/warmachine-lite-data.json"),
  "utf8",
));
const card = (cardId) => {
  const found = data.cards.find((entry) => entry.id === cardId);
  assert(found, `missing current card ${cardId}`);
  return found;
};
const valiant = (overrides = {}) => ({
  pieceKey: "search-valiant",
  label: "Valiant",
  sideKey: "player1",
  cardId: VALIANT_CARD_ID,
  cardSnapshot: card(VALIANT_CARD_ID),
  modelRole: "warjack",
  modelType: "warjack",
  isWarjack: true,
  position: { xIn: 10, yIn: 10 },
  baseSizeIn: 1.97,
  speedIn: 6,
  armor: 18,
  resourceKind: "focus",
  resourcePoints: 0,
  damage: { boxesRemaining: 20, maxBoxes: 20 },
  ...overrides,
});
const crate = (position) => ({
  pieceKey: "search-crate",
  label: "Heavy Weapon Crate",
  sideKey: "player1",
  cardId: CRATE_CARD_ID,
  cardSnapshot: card(CRATE_CARD_ID),
  position,
  baseSizeIn: 1.18,
  armor: 19,
  damage: { boxesRemaining: 10, maxBoxes: 10 },
  optionSelections: { cardOption1: [ROCKET_POD_OPTION_ID] },
});
const probe = state([valiant()]);
const advance = enumerateRulesV1Actions(probe).actions.find((entry) =>
  entry.actionKey === "search-valiant:advance:forward-low:v1");
assert(advance);
const contactState = state([
  valiant(),
  crate({ xIn: advance.destination.xIn + 1.575, yIn: advance.destination.yIn }),
]);
const contactAdvance = enumerateRulesV1Actions(contactState).actions.find((entry) =>
  entry.actionKey === "search-valiant:advance:forward-low:v1");
const contactPending = applyRulesV1Action(contactState, contactAdvance);
assert.equal(contactPending.events[0]?.eventType, "weapon_crate_contact_window_opened");

const weaponCrateDefinition = recognizedWarmachineRuleAtomByAtomKey(WEAPON_CRATE_ATOM_KEY);
assert.equal(weaponCrateDefinition.participantSourceContracts[0]?.sourceContract?.acceptedSourceIds?.[0], HARDPOINT_SOURCE_ID);
const normalizedValiant = normalizeRulesV1State(contactState).pieces.find((entry) => entry.pieceKey === "search-valiant");
assert(JSON.stringify(normalizedValiant.specialRules).includes(HARDPOINT_SOURCE_ID));

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".mjs") ? [absolute] : [];
  });
}

const semanticNeedles = [
  TRUE_SIGHT_SOURCE_ID,
  TRUE_SIGHT_ATOM_KEY,
  GUIDED_SOURCE_ID,
  GUIDED_ATOM_KEY,
  HARDPOINT_SOURCE_ID,
  WEAPON_CRATE_ATOM_KEY,
];
const duplicateImplementations = sourceFiles(path.join(SEARCH_ROOT, "src")).filter((filePath) => {
  const sourceText = fs.readFileSync(filePath, "utf8");
  return semanticNeedles.some((needle) => sourceText.includes(needle));
});
assert.deepEqual(duplicateImplementations, [], "Search must consume Engine Host semantics and own no duplicate implementation");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_exact_reuse_bindings_host_parity_v1",
  atomKeys: [TRUE_SIGHT_ATOM_KEY, GUIDED_ATOM_KEY, WEAPON_CRATE_ATOM_KEY],
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  trueSightAttackLegal: true,
  guidedOutcome: guided.metadata?.attackResolution?.automaticHitMissResolution?.outcome,
  hardpointContactWindowOpened: true,
  searchSideRuleImplementationCount: duplicateImplementations.length,
  globalStrictReady: false,
  trainingTruth: false,
}, null, 2));
