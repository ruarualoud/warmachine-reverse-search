import { createHash } from "node:crypto";

import { enumerateWarmachineExactD6EquivalenceClasses } from "../warmachine-host-runtime.mjs";

export const WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA = "warmachine_search_chance_outcomes_v1";

const EXACT_DETERMINISTIC_SUCCESSOR_EFFECT_TYPES = new Set([
  "prevent_destroyed_by_tough",
  "killing_spree_melee_destroy_advance_additional_melee_available",
]);
const EXACT_DETERMINISTIC_SUCCESSOR_ATOM_KEYS = new Set([
  "killing_spree_melee_destroy_advance_additional_melee_sequence",
]);
const NON_SEMANTIC_ANALYSIS_EFFECT_TYPES = new Set([
  "source_backed_profile_rule_atom_contract",
]);
const EXACT_PRE_CHANCE_HOOK_KEYS = new Set([
  "attack_modifier",
  "damage_modifier",
  "targeting_validation",
]);

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stableHash(value, length = 24) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, length);
}

function arrayValues(value) {
  return Array.isArray(value) ? value : [];
}

function nonEmpty(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

function activeEffects(value) {
  return arrayValues(value).filter((entry) => entry?.active !== false);
}

function exactDeterministicSuccessorEffect(effect = {}) {
  const effectType = String(effect.effectType || "");
  if (!EXACT_DETERMINISTIC_SUCCESSOR_EFFECT_TYPES.has(effectType)) return false;
  if (effectType !== "killing_spree_melee_destroy_advance_additional_melee_available") return true;
  const atomKey = String(effect.atomKey || effect.ruleAtomKey || "");
  return !atomKey || EXACT_DETERMINISTIC_SUCCESSOR_ATOM_KEYS.has(atomKey);
}

function exactPreChanceResolvedEffect(effect = {}) {
  return effect.exactWithinScope === true &&
    EXACT_PRE_CHANCE_HOOK_KEYS.has(String(effect.hookKey || "")) &&
    !arrayValues(effect.outcomeRequirements).length;
}

function unsupportedActiveEffects(value) {
  return activeEffects(value).filter((entry) =>
    !exactDeterministicSuccessorEffect(entry) && !exactPreChanceResolvedEffect(entry));
}

function semanticActionEffects(action = {}) {
  const metadata = action.metadata || {};
  const analysis = metadata.specialRuleAnalysis || {};
  const authoritative = [
    ...arrayValues(metadata.ruleAtomEffects),
    ...arrayValues(analysis.ruleAtomEffects),
  ];
  const authoritativeEffectTypes = new Set(authoritative
    .map((effect) => String(effect.effectType || ""))
    .filter(Boolean));
  const analysisOnly = arrayValues(analysis.effects).filter((effect) => {
    const effectType = String(effect.effectType || "");
    return effectType &&
      !authoritativeEffectTypes.has(effectType) &&
      !NON_SEMANTIC_ANALYSIS_EFFECT_TYPES.has(effectType);
  });
  return [...authoritative, ...analysisOnly];
}

function maximumResolvedPrimaryDamage(action = {}) {
  const resolution = action.metadata?.attackResolution || {};
  const outcomes = [
    ...arrayValues(resolution.damageRollDistribution?.outcomes),
    ...arrayValues(resolution.criticalDamageRollDistribution?.outcomes),
  ];
  if (!outcomes.length) return null;
  const values = outcomes.map((outcome) => Number(outcome.damage)).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function effectProvablyInactiveForBoundState(effect = {}, action = {}, rawOptions = {}) {
  if (String(effect.hookKey || "") !== "model_boxed") return false;
  const target = actionTargetFromState(action, rawOptions.state || null);
  const boxesRemaining = Number(target?.boxesRemaining ?? target?.damage?.boxesRemaining);
  const maximumDamage = maximumResolvedPrimaryDamage(action);
  return Number.isFinite(boxesRemaining) && boxesRemaining > 0 &&
    Number.isFinite(maximumDamage) && maximumDamage < boxesRemaining;
}

function provablyInactiveSuccessorEffects(action = {}, rawOptions = {}) {
  return unsupportedActiveEffects(semanticActionEffects(action)).filter((effect) =>
    effectProvablyInactiveForBoundState(effect, action, rawOptions));
}

function exactDeterministicSuccessorEffectTypes(action = {}) {
  return Array.from(new Set(semanticActionEffects(action)
    .filter(exactDeterministicSuccessorEffect)
    .map((effect) => String(effect.effectType || ""))
    .filter(Boolean))).sort();
}

function exactPreChanceResolvedEffectTypes(action = {}) {
  return Array.from(new Set(semanticActionEffects(action)
    .filter(exactPreChanceResolvedEffect)
    .map((effect) => String(effect.effectType || ""))
    .filter(Boolean))).sort();
}

function targetUsesRandomDamageLocation(target = null) {
  if (!target) return true;
  const roleText = [target.modelRole, target.modelType, target.cardTypeName, ...(target.keywords || [])]
    .filter(Boolean).join(" ").toLowerCase();
  if (target.isWarjack === true || target.isWarbeast === true || target.isMonstrosity === true ||
      target.isColossal === true || target.isGargantuan === true ||
      /warjack|warbeast|monstrosity|colossal|gargantuan/.test(roleText)) return true;
  const simpleWarrior = target.isWarrior === true || /warrior|grunt|solo|unit/.test(roleText);
  return !simpleWarrior;
}

function actionTargetFromState(action = {}, state = null) {
  if (!state || !action.targetPieceKey) return null;
  return arrayValues(state.pieces).find((piece) => piece.pieceKey === action.targetPieceKey) || null;
}

function targetToughRollRelevant(action = {}) {
  const effects = activeEffects(semanticActionEffects(action));
  const toughGranted = effects.some((effect) => effect.effectType === "prevent_destroyed_by_tough");
  const toughPrevented = effects.some((effect) => ["prevent_tough", "tough_denied", "cannot_make_tough_roll"]
    .includes(String(effect.effectType || "")));
  return toughGranted && !toughPrevented;
}

function exactChanceDimensions(action = {}, rawOptions = {}) {
  const target = actionTargetFromState(action, rawOptions.state || null);
  if (!target) {
    return {
      targetStateBound: false,
      targetPieceKey: String(action.targetPieceKey || ""),
      damageLocationValues: [1, 2, 3, 4, 5, 6],
      toughDieValues: [1, 2, 3, 4, 5, 6],
      claimBoundary: "Without the exact target state, legacy conservative damage-location and Tough dimensions remain explicit.",
    };
  }
  const randomDamageLocation = targetUsesRandomDamageLocation(target);
  const toughRollRelevant = targetToughRollRelevant(action);
  return {
    targetStateBound: true,
    targetPieceKey: target.pieceKey,
    damageLocationValues: randomDamageLocation ? [1, 2, 3, 4, 5, 6] : [1],
    toughDieValues: toughRollRelevant ? [1, 2, 3, 4, 5, 6] : [1],
    targetUsesRandomDamageLocation: randomDamageLocation,
    targetToughRollRelevant: toughRollRelevant,
    claimBoundary: "The exact target state removes only semantically irrelevant damage-location or Tough dimensions; strict execution still resolves every retained class.",
  };
}

function primaryAttackExactnessReasons(action = {}, rawOptions = {}) {
  const metadata = action.metadata || {};
  const resolution = metadata.attackResolution || {};
  const analysis = metadata.specialRuleAnalysis || {};
  const provablyInactive = new Set(provablyInactiveSuccessorEffects(action, rawOptions));
  const unsupportedEffects = unsupportedActiveEffects(semanticActionEffects(action))
    .filter((effect) => !provablyInactive.has(effect));
  const reasons = [];
  if (!nonEmpty(resolution)) reasons.push("missing_attack_resolution");
  if (!action.targetPieceKey) reasons.push("missing_piece_target");
  if (activeEffects(metadata.attackProfileExecutableEffects).length) reasons.push("attack_profile_executable_effects_present");
  if (unsupportedEffects.some((effect) => effect.atomKey || effect.ruleAtomKey)) {
    reasons.push("rule_atom_effects_present");
  }
  if (arrayValues(metadata.ruleAtomDiagnostics).length) reasons.push("rule_atom_diagnostics_present");
  if (arrayValues(analysis.unresolvedRuleKeys).length) reasons.push("unresolved_special_rules_present");
  if (unsupportedEffects.length) {
    reasons.push("special_rule_effects_present");
  }
  if (arrayValues(analysis.ruleAtomDiagnostics).length) reasons.push("special_rule_diagnostics_present");
  for (const key of [
    "aoeBlastTargets",
    "warheadBlastTargets",
    "spraySecondaryTargets",
    "sprayBlockedTargets",
    "freeStrikeResolutionRequirements",
    "reactionResolutionRequirements",
  ]) {
    if (arrayValues(metadata[key]).length) reasons.push(`${key}_present`);
  }
  if (metadata.aoeTemplatePlacement) reasons.push("aoe_template_present");
  if (resolution.damageRollNotRequired === true || resolution.fixedDamagePointsModel === true || resolution.punctureDamageModel === true) {
    reasons.push("nonstandard_damage_model");
  }
  if (resolution.damageRerollOnce === true || resolution.precisionFireDamageReroll === true) reasons.push("damage_reroll_present");
  if (numeric(resolution.criticalDamageDiceBonus, 0) !== 0 ||
      numeric(resolution.criticalExtraDamageDice, 0) !== 0 ||
      numeric(resolution.criticalBrutalDamageDice, 0) !== 0 ||
      numeric(resolution.criticalStaticDamageDelta, 0) !== 0 ||
      resolution.criticalDamageDiceMarker) {
    reasons.push("critical_damage_effect_present");
  }
  if (resolution.lifeTraderUse === true ||
      resolution.preRollTokenAttackRollBoosted === true ||
      resolution.preRollTokenDamageRollBoosted === true ||
      resolution.futureSightAttackRollBoostedAfterRolling === true ||
      resolution.futureSightDamageRollBoostedAfterRolling === true) {
    reasons.push("conditional_dice_protocol_present");
  }
  const attackDiceCount = Math.floor(numeric(resolution.attackDiceCount ?? resolution.diceCount, 0));
  const damageDiceCount = Math.floor(numeric(resolution.damageDiceCount, 0));
  if (attackDiceCount < 1 || attackDiceCount > 4) reasons.push("attack_dice_count_outside_exact_cursor_scope");
  if (damageDiceCount < 1 || damageDiceCount > 4) reasons.push("damage_dice_count_outside_exact_cursor_scope");
  return Array.from(new Set(reasons)).sort();
}

function groupedAttackClasses(resolution = {}) {
  const diceCount = Math.floor(numeric(resolution.attackDiceCount ?? resolution.diceCount, 2));
  const equivalence = enumerateWarmachineExactD6EquivalenceClasses(diceCount, {
    discardLowest: resolution.attackExtraDiceDiscardLowest,
  });
  const targetNumber = Math.max(2, Math.ceil(numeric(resolution.targetNumber, 2)));
  const autoHit = resolution.hitModel === "legacy_auto_hit_v1" ||
    resolution.autoHitStatusTarget === true ||
    resolution.autoHitStructureTarget === true ||
    resolution.autoHitSustainedAttack === true ||
    resolution.autoHitWitchMarkSpell === true;
  const autoMiss = resolution.automaticMiss === true;
  const groups = new Map();
  for (const row of equivalence.classes) {
    const allRolledDiceOnes = row.dice.length > 0 && row.dice.every((die) => die === 1);
    const allRolledDiceSixes = row.dice.length > 1 && row.dice.every((die) => die === 6);
    const hit = autoHit
      ? true
      : autoMiss
        ? false
        : !allRolledDiceOnes && (allRolledDiceSixes || row.sum >= targetNumber);
    const key = hit ? "hit" : "miss";
    const current = groups.get(key) || { hit, multiplicity: 0, representativeDice: row.dice };
    current.multiplicity += row.multiplicity;
    groups.set(key, current);
  }
  return {
    outcomeCount: equivalence.outcomeCount,
    massConserved: equivalence.massConserved,
    groups: Array.from(groups.values()).sort((left, right) => Number(right.hit) - Number(left.hit)),
  };
}

function groupedDamageClasses(resolution = {}) {
  const diceCount = Math.floor(numeric(resolution.damageDiceCount, 2));
  const equivalence = enumerateWarmachineExactD6EquivalenceClasses(diceCount, {
    discardLowest: resolution.damageExtraDiceDiscardLowest,
  });
  const groups = new Map();
  for (const row of equivalence.classes) {
    const current = groups.get(row.sum) || {
      sum: row.sum,
      multiplicity: 0,
      representativeDice: row.dice,
    };
    current.multiplicity += row.multiplicity;
    groups.set(row.sum, current);
  }
  return {
    outcomeCount: equivalence.outcomeCount,
    massConserved: equivalence.massConserved,
    groups: Array.from(groups.values()).sort((left, right) => right.sum - left.sum),
  };
}

export function buildWarmachineExactActionChanceClasses(action = {}, rawOptions = {}) {
  const reasons = primaryAttackExactnessReasons(action, rawOptions);
  const deterministicSuccessorEffectTypes = exactDeterministicSuccessorEffectTypes(action);
  const preChanceResolvedEffectTypes = exactPreChanceResolvedEffectTypes(action);
  const provablyInactiveSuccessorEffectTypes = Array.from(new Set(
    provablyInactiveSuccessorEffects(action, rawOptions)
      .map((effect) => String(effect.effectType || ""))
      .filter(Boolean),
  )).sort();
  const chanceDimensions = exactChanceDimensions(action, rawOptions);
  if (reasons.length) {
    return {
      schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
      actionKey: String(action.actionKey || ""),
      exactComplete: false,
      classes: [],
      reasons,
      deterministicSuccessorEffectTypes,
      preChanceResolvedEffectTypes,
      provablyInactiveSuccessorEffectTypes,
      chanceDimensions,
      claimBoundary: "The action is outside the complete basic-primary-attack chance cursor and must remain unresolved or sampled.",
    };
  }
  const resolution = action.metadata.attackResolution;
  const attack = groupedAttackClasses(resolution);
  const damage = groupedDamageClasses(resolution);
  const damageLocationValues = chanceDimensions.damageLocationValues;
  const toughDieValues = chanceDimensions.toughDieValues;
  const commonDenominator = attack.outcomeCount * damage.outcomeCount *
    damageLocationValues.length * toughDieValues.length;
  const classes = [];
  for (const attackClass of attack.groups) {
    if (!attackClass.hit) {
      const numerator = attackClass.multiplicity * damage.outcomeCount *
        damageLocationValues.length * toughDieValues.length;
      const strictRollOutcome = {
        attackDice: attackClass.representativeDice,
        damageDice: damage.groups[0].representativeDice,
        damageColumn: damageLocationValues[0],
        damageBranch: damageLocationValues[0],
        toughDie: toughDieValues[0],
      };
      classes.push({
        classKey: `chance-${stableHash({ strictRollOutcome, hit: false })}`,
        hit: false,
        damageSum: null,
        numerator,
        denominator: commonDenominator,
        strictRollOutcome,
      });
      continue;
    }
    for (const damageClass of damage.groups) {
      for (const damageColumn of damageLocationValues) {
        for (const toughDie of toughDieValues) {
          const strictRollOutcome = {
            attackDice: attackClass.representativeDice,
            damageDice: damageClass.representativeDice,
            damageColumn,
            damageBranch: damageColumn,
            toughDie,
          };
          classes.push({
            classKey: `chance-${stableHash({ strictRollOutcome, hit: true })}`,
            hit: true,
            damageSum: damageClass.sum,
            numerator: attackClass.multiplicity * damageClass.multiplicity,
            denominator: commonDenominator,
            strictRollOutcome,
          });
        }
      }
    }
  }
  const massNumerator = classes.reduce((sum, row) => sum + row.numerator, 0);
  return {
    schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
    actionKey: String(action.actionKey || ""),
    exactComplete: attack.massConserved && damage.massConserved && massNumerator === commonDenominator,
    attackOutcomeCount: attack.outcomeCount,
    damageOutcomeCount: damage.outcomeCount,
    classCount: classes.length,
    massNumerator,
    massDenominator: commonDenominator,
    classes,
    reasons: [],
    deterministicSuccessorEffectTypes,
    preChanceResolvedEffectTypes,
    provablyInactiveSuccessorEffectTypes,
    chanceDimensions,
    orderingPolicy: "hit_then_high_damage_first_for_early_terminal_witnesses_only",
    claimBoundary: "Exact mass covers the primary attack roll, damage roll, damage column or branch, and Tough die. Exact pre-chance targeting, attack and damage modifiers are already consumed by the strict action resolution; deterministic Tough survival and Killing Spree successor windows are resolved after each chance class. All other modeled special or secondary random effects remain rejected.",
  };
}

export function exactChanceIntervalFromProcessedClasses(processed = [], model = {}, cursorExhausted = false) {
  const denominator = Math.max(1, numeric(model.massDenominator, 1));
  let processedMass = 0;
  let lowerBound = 0;
  let upperBound = 0;
  let complete = model.exactComplete === true && cursorExhausted;
  let principalVariation = [];
  for (const entry of processed) {
    const mass = numeric(entry.chanceClass?.numerator, 0) / denominator;
    processedMass += mass;
    lowerBound += mass * numeric(entry.interval?.lowerBound, 0);
    upperBound += mass * numeric(entry.interval?.upperBound, 1);
    if (!principalVariation.length && entry.interval?.possibleWitness) {
      principalVariation = entry.interval.principalVariation || [];
    }
    if (entry.interval?.complete !== true) complete = false;
  }
  const unresolvedMass = Math.max(0, 1 - processedMass);
  upperBound += unresolvedMass;
  return {
    lowerBound: Math.max(0, Math.min(1, lowerBound)),
    upperBound: Math.max(0, Math.min(1, upperBound)),
    complete: complete && unresolvedMass <= 1e-12,
    unresolvedMass,
    processedMass,
    processedClassCount: processed.length,
    totalClassCount: numeric(model.classCount, model.classes?.length || 0),
    possibleWitness: processed.some((entry) => entry.interval?.possibleWitness) || unresolvedMass > 0,
    robustWitness: unresolvedMass <= 1e-12 && processed.every((entry) => entry.interval?.robustWitness),
    principalVariation,
  };
}
