#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyRulesV1Action,
  buildWarmachineRulesV1StateFromLayer3Room,
  enumerateRulesV1Actions,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const SEARCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NEVER_SOURCE_ID = "587bcdb5-5f0e-4d5f-bde1-c91ffab26ba6";
const NEVER_ATOM_KEY = "never_ending_pile_activation_start_corpse_gain";
const NEVER_TEXT = "At the start of this model’s activation, if it does not have any corpse tokens, it gains one corpse token.";
const SOUL_SOURCE_ID = "b2bc5004-98df-4c1a-b73f-f23a0b7fdcbd";
const SOUL_ATOM_KEY = "soul_generator_activation_start_soul_focus_exchange";
const SOUL_TEXT = "At the start of this model’s activation, you can spend soul tokens on this model to give it 1 focus point for each token spent.";
const TOKEN_GAIN_ACTION = "resolve_rule_atom_activation_start_token_gain";
const SOUL_EXCHANGE_ACTION = "resolve_soul_taker_activation_start_exchange";

function piece({ soul = false } = {}) {
  return {
    pieceKey: soul ? "search-deathjack" : "search-death-knell",
    label: soul ? "Deathjack" : "Death Knell",
    sideKey: "player1",
    factionKey: soul ? "cryx" : "grymkin",
    modelRole: "warrior",
    modelType: "warrior",
    position: { xIn: 10, yIn: 10 },
    baseSizeIn: 50 / 25.4,
    speedIn: 6,
    meleeRangeIn: 1,
    defense: 12,
    armor: 18,
    mat: 6,
    rat: 6,
    damage: { boxesRemaining: 18, maxBoxes: 18 },
    resourceKind: soul ? "focus" : "none",
    resourcePoints: soul ? 5 : 0,
    resourceMax: soul ? 5 : 0,
    soulTokens: soul ? 2 : 0,
    soulTokenMax: 3,
    corpseTokens: 0,
    corpseTokenMax: 5,
    specialRules: [{
      id: soul ? SOUL_SOURCE_ID : NEVER_SOURCE_ID,
      name: soul ? "•Soul Generator" : "Never Ending Pile",
      description: soul ? SOUL_TEXT : NEVER_TEXT,
    }],
    attackProfiles: [],
    statusTags: [],
  };
}

function state(model) {
  return {
    stateKey: `search-activation-start-${model.pieceKey}`,
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 3,
    strictMode: true,
    enforceStrictExecutor: true,
    ruleAtomRuntimeMode: "authoritative",
    board: { widthIn: 48, heightIn: 48 },
    pieces: [model],
    terrain: [],
    movementPaths: [],
    commandCards: [],
    scenario: { zones: [], flags: [], actionObjectives: [], score: { player1: 0, player2: 0 }, victoryThreshold: 5 },
  };
}

const neverState = state(piece());
const neverEnumeration = enumerateRulesV1Actions(neverState);
const neverAction = neverEnumeration.actions.find((candidate) => candidate.actionType === TOKEN_GAIN_ACTION);
assert(neverAction, "Search Host must expose the Engine Never Ending Pile action");
const neverTransition = applyRulesV1Action(neverState, { actionKey: neverAction.actionKey });
assert.equal(neverTransition.ok, true, neverTransition.reason);
assert.equal(neverTransition.nextState.pieces[0].corpseTokens, 1);
assert.equal(enumerateRulesV1Actions(neverTransition.nextState).actions.some((candidate) =>
  candidate.actionType === TOKEN_GAIN_ACTION), false);

const soulState = state(piece({ soul: true }));
const soulEnumeration = enumerateRulesV1Actions(soulState);
const soulChoices = soulEnumeration.actions.filter((candidate) => candidate.actionType === SOUL_EXCHANGE_ACTION);
assert.deepEqual(soulChoices.map((candidate) => candidate.metadata?.soulTokensRemoved), [0, 1, 2]);
const soulAction = soulChoices.find((candidate) => candidate.metadata?.soulTokensRemoved === 2);
const soulTransition = applyRulesV1Action(soulState, { actionKey: soulAction.actionKey });
assert.equal(soulTransition.ok, true, soulTransition.reason);
assert.equal(soulTransition.nextState.pieces[0].soulTokens, 0);
assert.equal(soulTransition.nextState.pieces[0].resourcePoints, 7);

function token(model) {
  return {
    id: model.pieceKey,
    pieceKey: model.pieceKey,
    name: model.label,
    owner: model.sideKey,
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
    resourceKind: model.resourceKind,
    resourcePoints: model.resourcePoints,
    resourceMax: model.resourceMax,
    soulTokens: model.soulTokens,
    soulTokenMax: model.soulTokenMax,
    corpseTokens: model.corpseTokens,
    corpseTokenMax: model.corpseTokenMax,
    specialRules: model.specialRules,
  };
}

for (const { model, expectedActionType } of [
  { model: piece(), expectedActionType: TOKEN_GAIN_ACTION },
  { model: piece({ soul: true }), expectedActionType: SOUL_EXCHANGE_ACTION },
]) {
  const room = {
    id: `search-layer3-${model.pieceKey}`,
    game: {
      phase: "activation",
      activeSideKey: "player1",
      turnNumber: 3,
      width: 48,
      height: 48,
      strictMode: true,
      enforceStrictExecutor: true,
    },
    tokens: { actor: token(model) },
    terrain: {},
    widgets: {},
    logs: {},
  };
  const projected = buildWarmachineRulesV1StateFromLayer3Room(room, {
    strictMode: true,
    enforceStrictExecutor: true,
  });
  assert(enumerateRulesV1Actions(projected).actions.some((candidate) =>
    candidate.actionType === expectedActionType),
  `Layer3 projection must preserve ${expectedActionType} into the shared Search Host`);
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".mjs") ? [absolute] : [];
  });
}

const duplicateImplementations = sourceFiles(path.join(SEARCH_ROOT, "src")).filter((filePath) => {
  const sourceText = fs.readFileSync(filePath, "utf8");
  return [NEVER_SOURCE_ID, NEVER_ATOM_KEY, SOUL_SOURCE_ID, SOUL_ATOM_KEY]
    .some((needle) => sourceText.includes(needle));
});
assert.deepEqual(duplicateImplementations, [],
  "Search must consume the shared Engine Host rather than own either activation-start resource rule");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_activation_start_resource_host_parity_v1",
  atomKeys: [NEVER_ATOM_KEY, SOUL_ATOM_KEY],
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  neverEndingPileCorpseAfter: neverTransition.nextState.pieces[0].corpseTokens,
  soulGeneratorChoiceAmounts: soulChoices.map((candidate) => candidate.metadata?.soulTokensRemoved),
  soulGeneratorFocusAfter: soulTransition.nextState.pieces[0].resourcePoints,
  layer3Parity: true,
  searchSideRuleImplementationCount: duplicateImplementations.length,
  globalStrictReady: false,
  trainingTruth: false,
}, null, 2));
