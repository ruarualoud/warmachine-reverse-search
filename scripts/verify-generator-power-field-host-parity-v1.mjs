#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyRulesV1Action,
  enumerateRulesV1Actions,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const SEARCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ID = "14abc078-f655-4e10-91b9-40883345b401";
const ATOM_KEY = "generator_power_field_damage_reinforcement_response";
const SOURCE_TEXT = "When this model would suffer damage, it can immediately spend up to 1 focus point to reduce the damage it would suffer by 5. The model is still considered to have suffered damage even if the damage is reduced to 0 or less. Excess damage prevention is lost. This model cannot spend focus points to reduce damage while its Generator (G) or Head system (H) is crippled";

const attacker = {
  pieceKey: "search-attacker",
  label: "Search Attacker",
  sideKey: "player1",
  modelRole: "warrior",
  modelType: "warrior",
  traits: ["living", "warrior"],
  position: { xIn: 5, yIn: 8 },
  baseSizeIn: 1.18,
  defense: 12,
  armor: 16,
  rat: 7,
  resourceKind: "none",
  resourcePoints: 0,
  resourceMax: 0,
  damage: { boxesRemaining: 5, maxBoxes: 5 },
  attackProfiles: [{ profileKey: "search-cannon", name: "Search Cannon", mode: "ranged", rangeIn: 10, power: 13, attackStatKind: "RAT", attackStat: 7, count: 1 }],
};
const target = {
  pieceKey: "search-generator-target",
  label: "Search Generator Target",
  sideKey: "player2",
  modelRole: "warjack",
  modelType: "warjack",
  cardType: "Warjack",
  traits: ["construct", "warjack"],
  isWarjack: true,
  position: { xIn: 12, yIn: 8 },
  baseSizeIn: 1.97,
  defense: 12,
  armor: 16,
  resourceKind: "focus",
  resourcePoints: 2,
  resourceMax: 3,
  specialRules: [{ id: SOURCE_ID, sourceIds: [SOURCE_ID], sourceTexts: [SOURCE_TEXT], name: "Generator", description: SOURCE_TEXT }],
  damage: {
    boxesRemaining: 12,
    maxBoxes: 12,
    systems: { G: 2, C: 2, L: 2, R: 2, M: 4 },
    gridColumns: [["G", "G"], ["C", "C"], ["L", "L"], ["R", "R"], ["M", "M"], ["M", "M"]],
  },
};
const state = {
  stateKey: "search-generator-power-field",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 3,
  strictMode: true,
  enforceStrictExecutor: true,
  ruleAtomRuntimeMode: "authoritative",
  board: { widthIn: 48, heightIn: 48 },
  pieces: [attacker, target],
  terrain: [],
  movementPaths: [],
  commandCards: [],
  scenario: { zones: [], flags: [], actionObjectives: [], score: { player1: 0, player2: 0 }, victoryThreshold: 5 },
};

const attack = enumerateRulesV1Actions(state).actions.find((candidate) =>
  candidate.actionType === "ranged_attack" && candidate.actorPieceKey === attacker.pieceKey && candidate.targetPieceKey === target.pieceKey);
assert(attack, "Search must receive the shared Host ranged attack");
const pending = applyRulesV1Action(state, {
  actionKey: attack.actionKey,
  strictRollOutcome: { attackDice: [4, 4], damageDice: [5, 5], damageColumn: 2 },
});
assert.equal(pending.ok, true, pending.reason);
assert.equal(pending.reason, "power_field_damage_decision_required");
assert.equal(pending.events[0]?.ruleAtomEffects?.[0]?.atomKey, ATOM_KEY);
const reinforce = enumerateRulesV1Actions(pending.nextState).actions.find((candidate) =>
  candidate.actionType === "power_field_reinforce_damage");
assert(reinforce, "Search must receive the shared Host controller response");
const applied = applyRulesV1Action(pending.nextState, reinforce);
assert.equal(applied.ok, true, applied.reason);
const finalTarget = applied.nextState.pieces.find((piece) => piece.pieceKey === target.pieceKey);
assert.equal(finalTarget.resourcePoints, 1);
assert.equal(finalTarget.damage.boxesRemaining, 10);

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".mjs") ? [absolute] : [];
  });
}

const duplicateImplementations = sourceFiles(path.join(SEARCH_ROOT, "src")).filter((filePath) => {
  const sourceText = fs.readFileSync(filePath, "utf8");
  return sourceText.includes(SOURCE_ID) || sourceText.includes(ATOM_KEY);
});
assert.deepEqual(duplicateImplementations, [], "Search must consume the Engine Host and own no Generator semantics");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_generator_power_field_host_parity_v1",
  atomKey: ATOM_KEY,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  finalFocus: finalTarget.resourcePoints,
  finalBoxesRemaining: finalTarget.damage.boxesRemaining,
  searchSideRuleImplementationCount: duplicateImplementations.length,
  globalStrictReady: false,
  trainingTruth: false,
}, null, 2));
