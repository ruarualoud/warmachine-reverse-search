import assert from "node:assert/strict";
import fs from "node:fs";

import { enumerateRulesV1Actions, normalizeRulesV1State, resolveWarmachineHostPath } from "../src/warmachine-host-runtime.mjs";
import {
  buildWarmachineExactActionChanceClasses as buildLocalChanceClasses,
  exactChanceIntervalFromProcessedClasses as exactLocalInterval,
} from "../src/search/chance-outcomes-v1.mjs";
import { loadLegacyReverseSearchModules } from "../src/upstream-project-d.mjs";

const { modules: legacyModules } = await loadLegacyReverseSearchModules({
  moduleKeys: ["chanceOutcomes"],
});
const legacyChance = legacyModules.chanceOutcomes;
const parityCounts = { classes: 0, intervals: 0 };

function buildWarmachineExactActionChanceClasses(...args) {
  const local = buildLocalChanceClasses(...args);
  const upstream = legacyChance.buildWarmachineExactActionChanceClasses(...args);
  assert.deepEqual(local, upstream, `chance class parity failed for case ${parityCounts.classes + 1}`);
  parityCounts.classes += 1;
  return local;
}

function exactChanceIntervalFromProcessedClasses(...args) {
  const local = exactLocalInterval(...args);
  const upstream = legacyChance.exactChanceIntervalFromProcessedClasses(...args);
  assert.deepEqual(local, upstream, `chance interval parity failed for case ${parityCounts.intervals + 1}`);
  parityCounts.intervals += 1;
  return local;
}

const fixturePack = JSON.parse(fs.readFileSync(resolveWarmachineHostPath("data/function3-fixtures/warmachine-micro-battle-fixtures.json"), "utf8"));
const state = structuredClone(fixturePack.fixtures.find((entry) =>
  entry.fixtureId === "micro_boosted_ranged_spends_focus_and_destroys").state);
const enumeration = enumerateRulesV1Actions(normalizeRulesV1State(state), { actorPieceKeys: ["gunmage"] });
const action = enumeration.actions.find((entry) => entry.actionKey === "gunmage:ranged:heavy:v1");
assert.ok(action);

const exact = buildWarmachineExactActionChanceClasses(action);
assert.equal(exact.exactComplete, true);
assert.equal(exact.massNumerator, exact.massDenominator);
assert.equal(exact.attackOutcomeCount, 36);
assert.equal(exact.damageOutcomeCount, 36);
assert.equal(exact.classCount, 397);
assert.equal(exact.classes.filter((entry) => entry.hit === false).length, 1);
assert.deepEqual(exact.classes.find((entry) => entry.hit === false).strictRollOutcome.attackDice, [1, 1]);

const partial = exactChanceIntervalFromProcessedClasses([
  {
    chanceClass: exact.classes[0],
    interval: { lowerBound: 1, upperBound: 1, complete: true, possibleWitness: true, robustWitness: true },
  },
], exact, false);
assert.ok(partial.lowerBound > 0);
assert.equal(partial.upperBound, 1);
assert.ok(partial.unresolvedMass > 0);
assert.equal(partial.complete, false);

const special = buildWarmachineExactActionChanceClasses({
  ...action,
  metadata: {
    ...action.metadata,
    ruleAtomEffects: [{ atomKey: "test", active: true }],
  },
});
assert.equal(special.exactComplete, false);
assert.ok(special.reasons.includes("rule_atom_effects_present"));

const preChanceResolved = buildWarmachineExactActionChanceClasses({
  ...action,
  metadata: {
    ...action.metadata,
    ruleAtomEffects: [{
      atomKey: "exact-targeting-override",
      hookKey: "targeting_validation",
      effectType: "exact_targeting_override",
      active: true,
      exactWithinScope: true,
      outcomeRequirements: [],
    }],
  },
});
assert.equal(preChanceResolved.exactComplete, true);
assert.deepEqual(preChanceResolved.preChanceResolvedEffectTypes, ["exact_targeting_override"]);
const preChanceOutcomeRequirement = buildWarmachineExactActionChanceClasses({
  ...action,
  metadata: {
    ...action.metadata,
    ruleAtomEffects: [{
      atomKey: "targeting-override-needing-outcome",
      hookKey: "targeting_validation",
      effectType: "targeting_override_needing_outcome",
      active: true,
      exactWithinScope: true,
      outcomeRequirements: [{ outcomeKey: "external_choice" }],
    }],
  },
});
assert.equal(preChanceOutcomeRequirement.exactComplete, false);
assert.ok(preChanceOutcomeRequirement.reasons.includes("rule_atom_effects_present"));

const killingSpreeTough = buildWarmachineExactActionChanceClasses({
  ...action,
  metadata: {
    ...action.metadata,
    ruleAtomEffects: [{
      atomKey: "killing_spree_melee_destroy_advance_additional_melee_sequence",
      effectType: "killing_spree_melee_destroy_advance_additional_melee_available",
      active: true,
    }],
    specialRuleAnalysis: {
      effects: [
        { effectType: "killing_spree_melee_destroy_advance_additional_melee_available", active: true },
        { effectType: "prevent_destroyed_by_tough", active: true },
      ],
      ruleAtomEffects: [],
      ruleAtomDiagnostics: [],
      unresolvedRuleKeys: [],
    },
  },
});
assert.equal(killingSpreeTough.exactComplete, true);
assert.equal(killingSpreeTough.massNumerator, killingSpreeTough.massDenominator);
assert.deepEqual(killingSpreeTough.deterministicSuccessorEffectTypes, [
  "killing_spree_melee_destroy_advance_additional_melee_available",
  "prevent_destroyed_by_tough",
]);
assert.deepEqual(new Set(killingSpreeTough.classes.filter((entry) => entry.hit).map((entry) =>
  entry.strictRollOutcome.toughDie)), new Set([1, 2, 3, 4, 5, 6]));

const simpleWarriorState = {
  pieces: [{ pieceKey: action.targetPieceKey, isWarrior: true, modelRole: "warrior" }],
};
const simpleWarrior = buildWarmachineExactActionChanceClasses(action, { state: simpleWarriorState });
assert.equal(simpleWarrior.exactComplete, true);
assert.deepEqual(simpleWarrior.chanceDimensions.damageLocationValues, [1]);
assert.deepEqual(simpleWarrior.chanceDimensions.toughDieValues, [1]);
assert.equal(simpleWarrior.classCount, 12);
assert.equal(simpleWarrior.massNumerator, simpleWarrior.massDenominator);

const boxedEffect = {
  atomKey: "excarnate_box_living_enemy_warrior_rfp_add_grunt",
  hookKey: "model_boxed",
  effectType: "excarnate_box_living_enemy_warrior_rfp_add_grunt_boxed_rfp_return_grunt",
  active: true,
  conditionMatched: true,
};
const boundedBoxedAction = {
  ...action,
  metadata: {
    ...action.metadata,
    attackResolution: {
      ...action.metadata.attackResolution,
      damageRollDistribution: { outcomes: [{ damage: 11 }] },
      criticalDamageRollDistribution: { outcomes: [{ damage: 11 }] },
    },
    ruleAtomEffects: [boxedEffect],
    specialRuleAnalysis: {
      effects: [
        { effectType: boxedEffect.effectType },
        { effectType: "source_backed_profile_rule_atom_contract" },
      ],
      ruleAtomEffects: [],
      ruleAtomDiagnostics: [],
      unresolvedRuleKeys: [],
    },
  },
};
const boxedTargetState = {
  pieces: [{
    pieceKey: action.targetPieceKey,
    isWarrior: true,
    modelRole: "warrior",
    damage: { boxesRemaining: 24, maxBoxes: 24 },
  }],
};
const boxedEffectUnreachable = buildWarmachineExactActionChanceClasses(
  boundedBoxedAction,
  { state: boxedTargetState },
);
assert.equal(boxedEffectUnreachable.exactComplete, true);
assert.deepEqual(boxedEffectUnreachable.provablyInactiveSuccessorEffectTypes, [
  boxedEffect.effectType,
]);
const boxedEffectReachable = buildWarmachineExactActionChanceClasses(
  boundedBoxedAction,
  {
    state: {
      pieces: [{
        ...boxedTargetState.pieces[0],
        damage: { boxesRemaining: 10, maxBoxes: 24 },
      }],
    },
  },
);
assert.equal(boxedEffectReachable.exactComplete, false);
assert.ok(boxedEffectReachable.reasons.includes("rule_atom_effects_present"));
assert.ok(boxedEffectReachable.reasons.includes("special_rule_effects_present"));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_search_chance_outcomes_v1",
  exactClassCount: exact.classCount,
  exactMass: [exact.massNumerator, exact.massDenominator],
  partialBounds: [partial.lowerBound, partial.upperBound],
  unsupportedSpecialReasons: special.reasons,
  preChanceResolvedEffectTypes: preChanceResolved.preChanceResolvedEffectTypes,
  preChanceOutcomeRequirementReasons: preChanceOutcomeRequirement.reasons,
  killingSpreeToughExactMass: [killingSpreeTough.massNumerator, killingSpreeTough.massDenominator],
  stateBoundSimpleWarriorClassCount: simpleWarrior.classCount,
  boxedEffectUnreachableExact: boxedEffectUnreachable.exactComplete,
  boxedEffectReachableReasons: boxedEffectReachable.reasons,
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_chance_outcomes_parity_v1",
  parityCounts,
}, null, 2));
