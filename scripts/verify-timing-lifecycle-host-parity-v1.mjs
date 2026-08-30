#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyRulesV1Action,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const SEARCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function model(overrides = {}) {
  const boxes = overrides.boxesRemaining ?? 10;
  const xIn = overrides.xIn ?? 8;
  const yIn = overrides.yIn ?? 8;
  return {
    pieceKey: overrides.pieceKey || "model",
    label: overrides.label || overrides.pieceKey || "Model",
    sideKey: overrides.sideKey || "player1",
    factionKey: overrides.sideKey === "player2" ? "enemy" : "friendly",
    modelRole: overrides.modelRole || "warrior",
    modelType: overrides.modelType || "solo",
    traits: overrides.traits || ["living"],
    position: { xIn, yIn },
    baseSizeIn: overrides.baseSizeIn ?? 1.18,
    speedIn: overrides.speedIn ?? 6,
    meleeRangeIn: overrides.meleeRangeIn ?? 1,
    defense: overrides.defense ?? 12,
    armor: overrides.armor ?? 12,
    mat: overrides.mat ?? 7,
    rat: overrides.rat ?? 6,
    resourceKind: "none",
    resourcePoints: 0,
    resourceMax: 0,
    attackProfiles: overrides.attackProfiles || [],
    specialRules: overrides.specialRules || [],
    statusTags: overrides.statusTags || [],
    damage: { boxesRemaining: boxes, maxBoxes: boxes },
    activated: overrides.activated ?? false,
    ...overrides,
  };
}

function state(pieces, overrides = {}) {
  return normalizeRulesV1State({
    stateKey: overrides.stateKey || "search-timing-lifecycle-parity",
    activeSideKey: overrides.activeSideKey || "player1",
    firstPlayerSideKey: overrides.firstPlayerSideKey || "player1",
    phaseKey: "activation",
    turnNumber: overrides.turnNumber ?? 2,
    strictMode: true,
    enforceStrictExecutor: true,
    ruleAtomRuntimeMode: "authoritative",
    board: { widthIn: 48, heightIn: 48 },
    pieces,
    terrain: [],
    movementPaths: overrides.movementPaths || [],
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

function eventIndex(events, eventType, targetPieceKey) {
  return events.findIndex((event) =>
    event.eventType === eventType && event.targetPieceKey === targetPieceKey);
}

const reversedFirstPlayerState = state([
  model({ pieceKey: "second-player-model", activated: true }),
  model({ pieceKey: "first-player-model", sideKey: "player2", xIn: 32 }),
], {
  stateKey: "search-reversed-first-player-turn",
  firstPlayerSideKey: "player2",
  turnNumber: 2,
});
const endTurn = enumerateRulesV1Actions(reversedFirstPlayerState).actions
  .find((action) => action.actionType === "end_turn");
assert.ok(endTurn, "Host must expose end_turn for the completed second-player turn");
const ended = applyRulesV1Action(reversedFirstPlayerState, { actionKey: endTurn.actionKey });
assert.equal(ended.ok, true, ended.reason || "Host end_turn");
assert.equal(ended.nextState.activeSideKey, "player2");
assert.equal(ended.nextState.turnNumber, 3,
  "Search must observe a completed round by first-player role, not a fixed player number");

const runner = model({ pieceKey: "runner", boxesRemaining: 3 });
const guard = model({
  pieceKey: "guard",
  sideKey: "player2",
  xIn: 8.8,
  attackProfiles: [{
    profileKey: "guard-blade",
    sourceWeaponId: "guard-blade-source",
    name: "Guard Blade",
    mode: "melee",
    rangeIn: 1,
    power: 12,
    attackStatKind: "MAT",
    attackStat: 7,
    specialRules: [],
  }],
});
const freeStrikeState = state([runner, guard], {
  stateKey: "search-lethal-free-strike-lifecycle",
  movementPaths: [{
    actorPieceKey: runner.pieceKey,
    actionType: "advance",
    key: "runner-leaves-melee",
    waypoints: [{ xIn: 5.5, yIn: 8 }],
  }],
});
freeStrikeState.disengagementRuleMode = "legacy_free_strike";
const leaveMelee = enumerateRulesV1Actions(freeStrikeState).actions.find((action) =>
  action.actorPieceKey === runner.pieceKey &&
  action.actionType === "advance" &&
  action.metadata?.freeStrikeRisk &&
  action.metadata?.disengagingEnemyKeys?.includes(guard.pieceKey));
assert.ok(leaveMelee, "Host must expose the exact movement action with Free Strike risk");
const interrupted = applyRulesV1Action(freeStrikeState, {
  ...leaveMelee,
  strictRollOutcome: {
    freeStrikeByEnemy: {
      [guard.pieceKey]: { attackDice: [6, 6], damageDice: [3, 3] },
    },
  },
});
assert.equal(interrupted.ok, true, interrupted.reason || "Host lethal Free Strike");
const orderedTypes = ["damage_applied", "disabled", "boxed", "destroyed", "attack_resolved"];
const indexes = orderedTypes.map((eventType) => eventIndex(interrupted.events, eventType, runner.pieceKey));
assert.ok(indexes.every((index) => index >= 0), JSON.stringify({ orderedTypes, indexes }));
for (let index = 1; index < indexes.length; index += 1) {
  assert.ok(indexes[index - 1] < indexes[index], JSON.stringify({ orderedTypes, indexes }));
}
const resolvedEvent = interrupted.events[indexes.at(-1)];
assert.equal(resolvedEvent.lifecycleCompletedBeforeAttackResolved, true);
assert.equal(resolvedEvent.lifecycleOrderReceipt?.ok, true);

const searchSources = [
  "src/search/chance-outcomes-v1.mjs",
  "src/search/strict-policy-step-v1.mjs",
  "src/reverse/terminal-event-predecessor-v1.mjs",
].map((relativePath) => fs.readFileSync(path.join(SEARCH_ROOT, relativePath), "utf8")).join("\n");
assert.doesNotMatch(searchSources, /resolveTwoPlayerTurnAdvanceV1|validateAttackLifecycleEventOrderV1/,
  "Search must consume Host timing outcomes instead of owning rule timing primitives");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_timing_lifecycle_host_parity_v1",
  sliceKey: "23.2",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  authorityDisposition: warmachineHost.ruleSemanticsAuthority?.disposition || "rules_semantics_unreviewed",
  reversedFirstPlayerRoundAdvance: {
    nextSideKey: ended.nextState.activeSideKey,
    nextRoundNumber: ended.nextState.turnNumber,
  },
  lethalFreeStrikeLifecycle: {
    orderedTypes,
    indexes,
    receiptOk: resolvedEvent.lifecycleOrderReceipt.ok,
  },
  searchSideTimingRuleImplementationCount: 0,
  globalStrictReady: false,
  trainingTruth: false,
}, null, 2));
