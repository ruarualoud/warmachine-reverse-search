#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  recognizedWarmachineRuleAtoms,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const SEARCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GRANT_DEFINITIONS = recognizedWarmachineRuleAtoms().filter((definition) =>
  definition.definitionModuleKey === "field_marshal_grants_v1" &&
    definition.hooks.some((hook) => hook.primitiveKey === "unit_special_rule_grant"));
const GRANTED_UNYIELDING_ATOM_KEY = "granted_unyielding_melee_damage_arm_bonus";
const TRUE_SIGHT_ATOM_KEY = "true_sight_observer_cloud_los_and_stealth_override";

function model(overrides = {}) {
  const boxes = overrides.boxesRemaining ?? 20;
  return {
    pieceKey: overrides.pieceKey || "model",
    label: overrides.label || overrides.pieceKey || "Model",
    sideKey: overrides.sideKey || "player1",
    modelRole: overrides.modelRole || "warrior",
    modelType: overrides.modelType || overrides.modelRole || "warrior",
    position: overrides.position || { xIn: 10, yIn: 10 },
    baseSizeIn: overrides.baseSizeIn ?? 1.57,
    speedIn: 6,
    meleeRangeIn: 1,
    defense: 12,
    armor: 16,
    mat: 7,
    rat: 7,
    damage: { boxesRemaining: boxes, maxBoxes: boxes },
    specialRules: overrides.specialRules || [],
    attackProfiles: overrides.attackProfiles || [],
    ...overrides,
  };
}

function stateForDefinition(definition, overrides = {}) {
  const hook = definition.hooks.find((entry) => entry.primitiveKey === "unit_special_rule_grant");
  const sourceId = definition.sourceContract.acceptedSourceIds[0];
  const sourceText = definition.sourceContract.requiredTextClauses[0][0];
  return normalizeRulesV1State({
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 3,
    strictMode: true,
    strictRun: true,
    enforceStrictExecutor: true,
    ruleAtomRuntimeMode: "authoritative",
    board: { widthIn: 48, heightIn: 48 },
    pieces: [
      model({
        pieceKey: "field-marshal-source",
        label: definition.ruleName,
        modelRole: "leader",
        modelType: "warcaster",
        isLeader: true,
        isWarcaster: true,
        battlegroupId: "source-battlegroup",
        position: { xIn: 5, yIn: 10 },
        specialRules: [{ id: sourceId, name: definition.ruleName, description: sourceText }],
      }),
      model({
        pieceKey: "cohort",
        label: "Cohort Warjack",
        modelRole: "warjack",
        modelType: "warjack",
        isWarjack: true,
        controllerPieceKey: "field-marshal-source",
        battlegroupId: "source-battlegroup",
        position: { xIn: 10, yIn: 10 },
        baseSizeIn: hook.parameters.targetScope === "medium_based_battlegroup_cohort" ? 1.57 : 1.97,
        attackProfiles: [
          { profileKey: "cohort-blade", name: "Blade", mode: "melee", rangeIn: 1, power: 12, specialRules: [] },
          { profileKey: "cohort-gun", name: "Gun", mode: "ranged", rangeIn: 20, power: 12, specialRules: [] },
        ],
      }),
      model({
        pieceKey: "enemy",
        sideKey: "player2",
        position: { xIn: 16, yIn: 10 },
        specialRules: [{ ruleKey: "stealth", name: "Stealth" }],
      }),
    ],
    terrain: overrides.terrain || [],
    scenario: { zones: [], flags: [], actionObjectives: [], score: { player1: 0, player2: 0 }, victoryThreshold: 5 },
  });
}

function exactGrantEntries(container = {}) {
  return (container.specialRules || []).filter((entry) => entry.ruleAtomFieldMarshalGrantSource === true);
}

assert.equal(GRANT_DEFINITIONS.length, 18);
for (const definition of GRANT_DEFINITIONS) {
  const hook = definition.hooks.find((entry) => entry.primitiveKey === "unit_special_rule_grant");
  const normalized = stateForDefinition(definition);
  const cohort = normalized.pieces.find((piece) => piece.pieceKey === "cohort");
  const container = hook.parameters.targetScope === "battlegroup_warjack_melee_weapons"
    ? cohort.attackProfiles.find((profile) => profile.profileKey === "cohort-blade")
    : cohort;
  assert.deepEqual(
    exactGrantEntries(container).map((entry) => entry.ruleKey).sort(),
    hook.parameters.grantedRuleKeys.slice().sort(),
    definition.atomKey,
  );
  assert.equal(
    cohort.attackProfiles.find((profile) => profile.profileKey === "cohort-gun")
      .specialRules.some((entry) => entry.ruleAtomFieldMarshalGrantSource === true),
    false,
  );
}

const trueSightDefinition = GRANT_DEFINITIONS.find((definition) =>
  definition.sourceContract.acceptedSourceIds.includes("849cd807-ba61-4585-b0e2-d7c340232609"));
const trueSightState = stateForDefinition(trueSightDefinition, {
  terrain: [{
    terrainKey: "cloud",
    type: "cloud",
    xIn: 13,
    yIn: 10,
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
  }],
});
const trueSightAttack = enumerateRulesV1Actions(trueSightState).actions.find((action) =>
  action.actionType === "ranged_attack" &&
    action.actorPieceKey === "cohort" &&
    action.targetPieceKey === "enemy" &&
    action.metadata?.attackProfile?.profileKey === "cohort-gun");
assert(trueSightAttack, "Search must receive Field Marshal True Sight through the shared Host");
assert(trueSightAttack.metadata?.ruleAtomEffects?.some((effect) => effect.atomKey === TRUE_SIGHT_ATOM_KEY));

const unyieldingDefinition = GRANT_DEFINITIONS.find((definition) =>
  definition.sourceContract.acceptedSourceIds.includes("5eb209f2-c4ea-46da-85b3-9afa36fa6713"));
const unyieldingState = stateForDefinition(unyieldingDefinition);
const unyieldingCohort = unyieldingState.pieces.find((piece) => piece.pieceKey === "cohort");
const unyieldingEnemy = unyieldingState.pieces.find((piece) => piece.pieceKey === "enemy");
const unyieldingEffects = warmachineHost.atoms.evaluateWarmachineRuleAtoms("damage_modifier", {
  state: unyieldingState,
  actor: unyieldingEnemy,
  target: unyieldingCohort,
  profile: { profileKey: "enemy-blade", mode: "melee" },
  actionType: "melee_attack",
  isDamageRoll: true,
  isAttackAction: true,
  isMeleeAttack: true,
  isRangedAttack: false,
  targetTraits: [],
}).effects.find((effect) => effect.atomKey === GRANTED_UNYIELDING_ATOM_KEY && effect.active !== false);
assert.equal(unyieldingEffects?.primitive?.armorDelta, 2);

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".mjs") ? [absolute] : [];
  });
}

const semanticNeedles = GRANT_DEFINITIONS.flatMap((definition) => [
  definition.atomKey,
  ...definition.sourceContract.acceptedSourceIds,
]);
const duplicateImplementations = sourceFiles(path.join(SEARCH_ROOT, "src")).filter((filePath) => {
  const sourceText = fs.readFileSync(filePath, "utf8");
  return semanticNeedles.some((needle) => sourceText.includes(needle));
});
assert.deepEqual(duplicateImplementations, [], "Search must consume Field Marshal grants from Engine Host only");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_field_marshal_grant_host_parity_v1",
  exactGrantSourceCount: GRANT_DEFINITIONS.length,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  trueSightAttackLegal: true,
  unyieldingArmorDelta: unyieldingEffects.primitive.armorDelta,
  searchSideRuleImplementationCount: duplicateImplementations.length,
  globalStrictReady: false,
  trainingTruth: false,
}, null, 2));
