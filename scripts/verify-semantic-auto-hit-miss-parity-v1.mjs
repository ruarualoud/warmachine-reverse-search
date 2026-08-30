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
import { buildWarmachineExactActionChanceClasses } from "../src/search/chance-outcomes-v1.mjs";

const SEARCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function model(overrides = {}) {
  const boxes = overrides.boxesRemaining ?? 20;
  return {
    pieceKey: overrides.pieceKey || "model",
    label: overrides.label || overrides.pieceKey || "Model",
    sideKey: overrides.sideKey || "player1",
    factionKey: overrides.sideKey === "player2" ? "enemy" : "friendly",
    modelRole: overrides.modelRole || "warcaster",
    modelType: overrides.modelType || "warcaster",
    traits: overrides.traits || ["living", "warcaster"],
    position: overrides.position || { xIn: 5, yIn: 12 },
    baseSizeIn: overrides.baseSizeIn ?? 1.18,
    speedIn: 6,
    meleeRangeIn: 2,
    defense: overrides.defense ?? 12,
    armor: overrides.armor ?? 16,
    mat: 7,
    rat: 7,
    arc: 7,
    resourceKind: overrides.resourceKind || "focus",
    resourcePoints: overrides.resourcePoints ?? 6,
    resourceMax: overrides.resourceMax ?? 7,
    canBoost: overrides.canBoost ?? true,
    attackProfiles: overrides.attackProfiles || [],
    specialRules: overrides.specialRules || [],
    statusTags: overrides.statusTags || [],
    statusEffects: overrides.statusEffects || [],
    damage: { boxesRemaining: boxes, maxBoxes: boxes },
    ...overrides,
  };
}

const spell = {
  profileKey: "semantic-witch-mark-spell",
  name: "Semantic Witch Mark Spell",
  mode: "spell",
  rangeIn: 4,
  power: 12,
  cost: 1,
  attackStatKind: "ARC",
  attackStat: 7,
  specialRules: [],
};

function witchMarkedEffect(sourcePieceKey) {
  return {
    statusTag: "witch_marked",
    sourcePieceKey,
    ruleKey: "unmapped_witch_mark",
    ruleAtomKey: "witch_mark_direct_hit_spell_target_override",
    marker: "strict_witch_mark_hit_auto_spell_target_v20260710",
    spellAutoHit: true,
    spellIgnoresRange: true,
    spellIgnoresLineOfSight: true,
    duration: "activation",
    durationKind: "activation",
    exactWithinScope: true,
  };
}

function state(actorRules = [], targetRules = [{ ruleKey: "stealth", name: "Stealth" }]) {
  const caster = model({
    pieceKey: "semantic-caster",
    position: { xIn: 5, yIn: 12 },
    specialRules: actorRules,
    attackProfiles: [spell],
  });
  const target = model({
    pieceKey: "semantic-target",
    sideKey: "player2",
    modelRole: "warrior",
    modelType: "unit",
    traits: ["living"],
    position: { xIn: 13, yIn: 12 },
    resourceKind: "none",
    resourcePoints: 0,
    resourceMax: 0,
    canBoost: false,
    specialRules: targetRules,
    statusEffects: [witchMarkedEffect(caster.pieceKey)],
  });
  return normalizeRulesV1State({
    stateKey: `semantic-auto-hit-miss-${actorRules.map((entry) => entry.ruleKey).join("-") || "plain"}`,
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 2,
    strictMode: true,
    enforceStrictExecutor: true,
    ruleAtomRuntimeMode: "authoritative",
    board: { widthIn: 48, heightIn: 48 },
    pieces: [caster, target],
    terrain: [],
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

function spellRows(ruleState) {
  const enumeration = enumerateRulesV1Actions(ruleState);
  const predicate = (entry) => entry.actorPieceKey === "semantic-caster" &&
    entry.targetPieceKey === "semantic-target" &&
    entry.actionType === "offensive_spell";
  return {
    actions: (enumeration.actions || []).filter(predicate),
    rejectedActions: (enumeration.rejectedActions || []).filter(predicate),
  };
}

function chanceSummary(action, ruleState) {
  const chance = buildWarmachineExactActionChanceClasses(action, { state: ruleState });
  assert.equal(chance.exactComplete, true, JSON.stringify(chance.reasons || []));
  assert.equal(chance.massNumerator, chance.massDenominator);
  return chance;
}

const stealthState = state();
const stealthRows = spellRows(stealthState);
const stealthAction = stealthRows.actions.find((entry) => entry.metadata?.rollInsteadOfAutomaticHit !== true);
assert.ok(stealthAction, JSON.stringify(stealthRows));
const stealthResolution = stealthAction.metadata?.attackResolution || {};
assert.equal(stealthResolution.autoHitWitchMarkSpell, true);
assert.equal(stealthResolution.automaticHitMissResolution?.outcome, "automatic_miss");
assert.equal(stealthResolution.hitProbability, 0);
assert.equal(stealthResolution.automaticMiss, true);
assert.equal(stealthRows.actions.some((entry) => entry.metadata?.rollInsteadOfAutomaticHit === true), false,
  "An automatic miss leaves no attack-roll choice even when an automatic-hit source is also present");
const stealthChance = chanceSummary(stealthAction, stealthState);
assert.equal(stealthChance.attackOutcomeCount, 1);
assert.equal(stealthChance.classes.every((entry) => entry.hit === false), true);
const stealthApplied = applyRulesV1Action(stealthState, { actionKey: stealthAction.actionKey });
assert.equal(stealthApplied.ok, true, stealthApplied.reason || "Stealth automatic miss apply");
assert.equal(stealthApplied.nextState.pieces.find((piece) => piece.pieceKey === "semantic-target").damage.boxesRemaining, 20);

const trueSightState = state([{
  id: "25438572-3b68-4712-99c6-ccb33e449a9d",
  ruleKey: "true_sight",
  name: "True Sight",
  description: "This model ignores cloud effects when determining LOS. This model also ignores Stealth.",
}]);
const trueSightRows = spellRows(trueSightState);
const trueSightAutoHit = trueSightRows.actions.find((entry) =>
  entry.metadata?.attackResolution?.automaticHitMissResolution?.outcome === "automatic_hit");
const trueSightRoll = trueSightRows.actions.find((entry) =>
  entry.metadata?.rollInsteadOfAutomaticHit === true);
assert.ok(trueSightAutoHit, JSON.stringify(trueSightRows));
assert.ok(trueSightRoll, JSON.stringify(trueSightRows));
assert.equal(trueSightAutoHit.metadata.attackResolution.hitProbability, 1);
assert.deepEqual(
  trueSightAutoHit.metadata.attackResolution.automaticHitMissResolution.availableChoices,
  ["use_automatic_hit", "make_attack_roll"],
);
assert.equal(trueSightRoll.metadata.attackResolution.automaticHitMissResolution.outcome, "attack_roll");
assert.equal(trueSightRoll.metadata.attackResolution.automaticHitMissResolution.automaticHitRelinquishedForRoll, true);
assert.ok((trueSightAutoHit.legality?.checks || []).some((check) =>
  check.code === "STRICT_AUTOMATIC_HIT_MISS_RESOLUTION_V1" &&
  check.outcome === "automatic_hit" &&
  check.availableChoices?.includes("make_attack_roll")));
assert.ok((trueSightRoll.legality?.checks || []).some((check) =>
  check.code === "STRICT_AUTOMATIC_HIT_ATTACK_ROLL_CHOICE_V1" &&
  check.selectedChoice === "make_attack_roll"));

const autoHitChance = chanceSummary(trueSightAutoHit, trueSightState);
assert.equal(autoHitChance.attackOutcomeCount, 1);
assert.equal(autoHitChance.classes.every((entry) => entry.hit === true), true);
const rollChance = chanceSummary(trueSightRoll, trueSightState);
assert.ok(rollChance.attackOutcomeCount > 1);
assert.equal(rollChance.classes.some((entry) => entry.hit === true), true);
assert.equal(rollChance.classes.some((entry) => entry.hit === false), true);

const syntheticConflict = {
  ...trueSightAutoHit,
  actionKey: "semantic-synthetic-conflict",
  metadata: {
    ...trueSightAutoHit.metadata,
    specialRuleAnalysis: {},
    ruleAtomEffects: [],
    attackResolution: {
      ...trueSightAutoHit.metadata.attackResolution,
      hitModel: "legacy_auto_hit_v1",
      autoHitWitchMarkSpell: true,
      automaticMiss: true,
      automaticHitMissResolution: {
        ...trueSightAutoHit.metadata.attackResolution.automaticHitMissResolution,
        outcome: "automatic_miss",
        automaticMissActive: true,
        automaticHitActive: false,
      },
    },
  },
};
const syntheticConflictChance = chanceSummary(syntheticConflict, trueSightState);
assert.equal(syntheticConflictChance.classes.every((entry) => entry.hit === false), true,
  "Search must consume the Engine semantic outcome instead of recomputing auto-hit precedence");

const wardedState = state([], [
  { ruleKey: "stealth", name: "Stealth" },
  { ruleKey: "spell_ward", name: "Spell Ward" },
]);
const wardedRows = spellRows(wardedState);
assert.equal(wardedRows.actions.length, 0);
assert.ok(wardedRows.rejectedActions.some((entry) => entry.rejection?.reason === "special_rule_blocked" ||
  (entry.legality?.checks || []).some((check) => check.specialRule?.ruleKey === "spell_ward" && check.status === "failed")));

const chanceSource = fs.readFileSync(path.join(SEARCH_ROOT, "src/search/chance-outcomes-v1.mjs"), "utf8");
assert.doesNotMatch(chanceSource, /resolveAutomaticHitMiss|resolveStealthAutomaticMissSignal/,
  "Search must consume the Engine result instead of owning a second rules implementation");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_semantic_auto_hit_miss_parity_v1",
  sliceKey: "23.1",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  authorityDisposition: warmachineHost.ruleSemanticsAuthority?.disposition || "rules_semantics_unreviewed",
  engineOutcomes: {
    witchMarkPlusStealth: stealthResolution.automaticHitMissResolution?.outcome,
    witchMarkPlusTrueSight: trueSightAutoHit.metadata.attackResolution.automaticHitMissResolution?.outcome,
    relinquishAutoHitForRoll: trueSightRoll.metadata.attackResolution.automaticHitMissResolution?.outcome,
  },
  searchChance: {
    automaticMissAttackOutcomeCount: stealthChance.attackOutcomeCount,
    automaticHitAttackOutcomeCount: autoHitChance.attackOutcomeCount,
    rollAttackOutcomeCount: rollChance.attackOutcomeCount,
    massConserved: [stealthChance, autoHitChance, rollChance, syntheticConflictChance]
      .every((entry) => entry.massNumerator === entry.massDenominator),
  },
  llmActionVisibility: {
    automaticHitActionVisible: true,
    explicitAttackRollChoiceVisible: true,
    automaticMissConflictHasNoFalseRollChoice: true,
    illegalSpellWardReplayVisible: true,
  },
  searchSideRuleImplementationCount: 0,
  globalStrictReady: false,
  trainingTruth: false,
}, null, 2));
