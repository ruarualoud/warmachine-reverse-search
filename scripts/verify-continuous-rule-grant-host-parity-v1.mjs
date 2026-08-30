#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildWarmachineRulesV1StateFromLayer3Room,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";
import { buildWarmachineExactActionChanceClasses } from "../src/search/chance-outcomes-v1.mjs";

const SEARCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ID = "44cd8758-1d09-4477-9053-55b4e06d81f8";
const SOURCE_TEXT = "While B2B with this model, friendly Faction models gain Stealth.";
const ATOM_KEY = "black_mantle_friendly_faction_b2b_stealth_grant";

function piece(overrides = {}) {
  return {
    pieceKey: overrides.pieceKey || "piece",
    label: overrides.label || overrides.pieceKey || "Piece",
    sideKey: overrides.sideKey || "player1",
    factionKey: overrides.factionKey || "cryx",
    modelRole: overrides.modelRole || "warrior",
    modelType: overrides.modelType || "warrior",
    position: overrides.position || { xIn: 10, yIn: 10 },
    baseSizeIn: overrides.baseSizeIn ?? 1.2,
    speedIn: 6,
    meleeRangeIn: 1,
    defense: 12,
    armor: 14,
    mat: 6,
    rat: 7,
    damage: { boxesRemaining: 5, maxBoxes: 5 },
    specialRules: overrides.specialRules || [],
    attackProfiles: overrides.attackProfiles || [],
    ...overrides,
  };
}

function blackMantleSource(overrides = {}) {
  return piece({
    pieceKey: "mantle-source",
    position: { xIn: 13.2, yIn: 10 },
    specialRules: [{ id: SOURCE_ID, name: "Black Mantle", description: SOURCE_TEXT }],
    ...overrides,
  });
}

function recipient(overrides = {}) {
  return piece({
    pieceKey: "recipient",
    position: { xIn: 12, yIn: 10 },
    ...overrides,
  });
}

const rifle = {
  profileKey: "search-parity-rifle",
  name: "Search Parity Rifle",
  mode: "ranged",
  rangeIn: 20,
  power: 10,
  attackStatKind: "RAT",
  attackStat: 7,
};

function hostState(sourceOverrides = {}) {
  return normalizeRulesV1State({
    stateKey: "continuous-rule-grant-search-host-parity",
    activeSideKey: "player2",
    phaseKey: "activation",
    turnNumber: 3,
    strictMode: true,
    enforceStrictExecutor: true,
    ruleAtomRuntimeMode: "authoritative",
    board: { widthIn: 48, heightIn: 48 },
    pieces: [
      piece({
        pieceKey: "shooter",
        sideKey: "player2",
        factionKey: "khador",
        position: { xIn: 1, yIn: 10 },
        rangedRangeIn: 20,
        attackProfiles: [rifle],
      }),
      recipient(),
      blackMantleSource(sourceOverrides),
    ],
    terrain: [],
    scenario: { zones: [], flags: [], score: { player1: 0, player2: 0 }, victoryThreshold: 5 },
  });
}

function derivedGrant(ruleState) {
  return ruleState.pieces.find((entry) => entry.pieceKey === "recipient")
    ?.specialRules.find((entry) =>
      entry.ruleKey === "stealth" && entry.grantedByRuleAtom === ATOM_KEY) || null;
}

const direct = hostState();
assert(derivedGrant(direct), "Search Host must load the Engine Black Mantle projection");
const attack = enumerateRulesV1Actions(direct).actions.find((entry) =>
  entry.actorPieceKey === "shooter" && entry.targetPieceKey === "recipient" &&
    entry.actionType === "ranged_attack");
assert(attack, "Search Host must expose the ranged attack candidate");
assert.equal(attack.metadata?.attackResolution?.automaticMiss, true);
const chance = buildWarmachineExactActionChanceClasses(attack, { state: direct });
assert.equal(chance.exactComplete, true);
assert.equal(chance.classes.every((entry) => entry.hit === false), true,
  "Search chance expansion must consume the Engine automatic miss");

const unavailable = hostState({ removedFromPlay: true });
assert.equal(derivedGrant(unavailable), null,
  "Search Host must consume source-leave withdrawal from Engine");

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
    speedIn: model.speedIn,
    defense: model.defense,
    armor: model.armor,
    mat: model.mat,
    rat: model.rat,
    resource1: model.damage.boxesRemaining,
    resource1Max: model.damage.maxBoxes,
    modelType: model.modelType,
    modelRole: model.modelRole,
    specialRules: model.specialRules,
    attackProfiles: model.attackProfiles,
  };
}

const roomSource = blackMantleSource();
const roomTarget = recipient();
const room = {
  id: "continuous-rule-grant-search-layer3-room",
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
    source: token(roomSource, "source"),
    target: token(roomTarget, "target"),
  },
  terrain: {},
  widgets: {},
  logs: {},
};
const layer3 = normalizeRulesV1State(buildWarmachineRulesV1StateFromLayer3Room(room, {
  strictMode: true,
  enforceStrictExecutor: true,
}));
assert(derivedGrant(layer3), "Layer3 and Search Host must preserve the same grant");

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".mjs") ? [absolute] : [];
  });
}

const searchOwnedMatches = sourceFiles(path.join(SEARCH_ROOT, "src")).filter((filePath) => {
  const sourceText = fs.readFileSync(filePath, "utf8");
  return sourceText.includes(SOURCE_ID) || sourceText.includes(ATOM_KEY);
});
assert.deepEqual(searchOwnedMatches, [],
  "Search must not own a duplicate Black Mantle implementation");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_continuous_rule_grant_host_parity_v1",
  sourceId: SOURCE_ID,
  atomKey: ATOM_KEY,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  engineGrantSourcePieceKey: derivedGrant(direct)?.grantedByPieceKey || "",
  layer3GrantSourcePieceKey: derivedGrant(layer3)?.grantedByPieceKey || "",
  searchChanceClassCount: chance.classes.length,
  searchChanceAllMiss: chance.classes.every((entry) => entry.hit === false),
  sourceLeaveWithdrawal: derivedGrant(unavailable) == null,
  searchSideRuleImplementationCount: searchOwnedMatches.length,
  globalStrictReady: false,
  trainingTruth: false,
}, null, 2));
