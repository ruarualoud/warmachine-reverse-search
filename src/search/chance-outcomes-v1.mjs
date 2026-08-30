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
const EXACT_ENGINE_HIT_RESOLUTION_EFFECT_TYPES = new Set([
  "automatic_miss_ranged_or_spell_over_5",
  "engaged_ranged_targets_engaging_model",
  "ignore_stealth",
  "ranged_attack_during_charge",
  "spray_ignore_intervening_model_los",
  "target_in_melee_defense_bonus_ignored",
  "witch_mark_spell_target_override_active",
]);
const EXACT_POST_CHANCE_DECISION_EFFECT_TYPES = new Set([
  "precision_fire_ranged_damage_reroll",
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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
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
  if (String(effect.primitive?.primitiveType || "") === "tough_survival_roll") return true;
  const effectType = String(effect.effectType || "");
  if (!EXACT_DETERMINISTIC_SUCCESSOR_EFFECT_TYPES.has(effectType)) return false;
  if (effectType !== "killing_spree_melee_destroy_advance_additional_melee_available") return true;
  const atomKey = String(effect.atomKey || effect.ruleAtomKey || "");
  return !atomKey || EXACT_DETERMINISTIC_SUCCESSOR_ATOM_KEYS.has(atomKey);
}

function exactPreChanceResolvedEffect(effect = {}) {
  if (effect.exactWithinScope !== true || arrayValues(effect.outcomeRequirements).length) return false;
  return EXACT_PRE_CHANCE_HOOK_KEYS.has(String(effect.hookKey || "")) ||
    EXACT_ENGINE_HIT_RESOLUTION_EFFECT_TYPES.has(String(effect.effectType || ""));
}

function unsupportedActiveEffects(value) {
  return activeEffects(value).filter((entry) =>
    !exactDeterministicSuccessorEffect(entry) &&
    !exactPreChanceResolvedEffect(entry) &&
    !EXACT_POST_CHANCE_DECISION_EFFECT_TYPES.has(String(entry.effectType || "")));
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
  const resolution = action.metadata?.attackResolution || {};
  const layoutRequirements = resolution.damageLayoutOutcomeRequirements || {};
  if (!target) {
    return {
      targetStateBound: false,
      targetPieceKey: String(action.targetPieceKey || ""),
      damageLocationValues: [1, 2, 3, 4, 5, 6],
      toughDieValues: [1, 2, 3, 4, 5, 6],
      claimBoundary: "Without the exact target state, legacy conservative damage-location and Tough dimensions remain explicit.",
    };
  }
  const randomDamageLocation = layoutRequirements.damageColumnRequiredWhenDamagePositive === true ||
    (layoutRequirements.damageColumnRequiredWhenDamagePositive == null && targetUsesRandomDamageLocation(target));
  const toughRollRelevant = targetToughRollRelevant(action);
  const controllerDamageGridSideRequired =
    layoutRequirements.damageGridSideRequiredWhenDamagePositive === true;
  const selectedDamageGridSide = String(
    action.metadata?.damageGridSide ??
    action.metadata?.selectedDamageGridSide ??
    action.damageGridSide ??
    "",
  ).toLowerCase();
  const controllerDamageGridSideResolved = !controllerDamageGridSideRequired ||
    ["left", "right"].includes(selectedDamageGridSide);
  const damageLocationDeferredUntilGridChoice = controllerDamageGridSideRequired &&
    !controllerDamageGridSideResolved;
  return {
    targetStateBound: true,
    targetPieceKey: target.pieceKey,
    damageLocationValues: randomDamageLocation && !damageLocationDeferredUntilGridChoice
      ? [1, 2, 3, 4, 5, 6]
      : [1],
    toughDieValues: toughRollRelevant ? [1, 2, 3, 4, 5, 6] : [1],
    targetUsesRandomDamageLocation: randomDamageLocation && !damageLocationDeferredUntilGridChoice,
    targetToughRollRelevant: toughRollRelevant,
    controllerDamageGridSideRequired,
    controllerDamageGridSideResolved,
    selectedDamageGridSide: ["left", "right"].includes(selectedDamageGridSide) ? selectedDamageGridSide : null,
    damageLocationDeferredUntilGridChoice,
    postDamageAttackerChoiceRequired: damageLocationDeferredUntilGridChoice,
    overflowDamageColumnMayBeRequired: layoutRequirements.overflowDamageColumnMayBeRequired === true,
    claimBoundary: "Damage location and Tough are conditional Chance dimensions. A colossal attack grid is a controller choice and never a Chance dimension.",
  };
}

function primaryAttackExactnessReasons(action = {}, rawOptions = {}) {
  const metadata = action.metadata || {};
  const resolution = metadata.attackResolution || {};
  const analysis = metadata.specialRuleAnalysis || {};
  const provablyInactive = new Set(provablyInactiveSuccessorEffects(action, rawOptions));
  const unsupportedEffects = unsupportedActiveEffects(semanticActionEffects(action))
    .filter((effect) => !provablyInactive.has(effect));
  const chanceDimensions = exactChanceDimensions(action, rawOptions);
  const reasons = [];
  if (chanceDimensions.targetStateBound !== true) reasons.push("target_state_not_bound_for_conditional_chance");
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
  for (const [rollKind, effects] of [
    ["attack", arrayValues(resolution.attackRerollEffects)],
    ["damage", arrayValues(resolution.damageRerollEffects)],
  ]) {
    if (effects.some((effect) =>
      effect?.exactWithinScope === false ||
      !String(effect?.sourceKey || effect?.ruleKey || effect?.atomKey || ""))) {
      reasons.push(`${rollKind}_reroll_effect_not_exact`);
    }
  }
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
  if (chanceDimensions.controllerDamageGridSideRequired &&
    chanceDimensions.controllerDamageGridSideResolved === true) {
    reasons.push("prebound_colossal_grid_side_bypasses_post_damage_choice_window");
  }
  if (chanceDimensions.overflowDamageColumnMayBeRequired === true &&
    chanceDimensions.damageLocationDeferredUntilGridChoice !== true) {
    reasons.push("conditional_colossal_overflow_damage_column_not_yet_exact");
  }
  return Array.from(new Set(reasons)).sort();
}

function groupedAttackClasses(resolution = {}) {
  const semanticOutcome = String(resolution.automaticHitMissResolution?.outcome || "");
  const deterministicAutomaticMiss = semanticOutcome
    ? semanticOutcome === "automatic_miss"
    : resolution.automaticMiss === true;
  const deterministicAutomaticHit = semanticOutcome
    ? semanticOutcome === "automatic_hit"
    : !deterministicAutomaticMiss && (
      resolution.hitModel === "legacy_auto_hit_v1" ||
      resolution.autoHitStatusTarget === true ||
      resolution.autoHitStructureTarget === true ||
      resolution.autoHitSustainedAttack === true ||
      resolution.autoHitWitchMarkSpell === true
    );
  if (deterministicAutomaticMiss || deterministicAutomaticHit) {
    return {
      outcomeCount: 1,
      massConserved: true,
      semanticOutcome: deterministicAutomaticMiss ? "automatic_miss" : "automatic_hit",
      groups: [{
        hit: deterministicAutomaticHit,
        multiplicity: 1,
        representativeDice: [],
      }],
    };
  }
  const diceCount = Math.floor(numeric(resolution.attackDiceCount ?? resolution.diceCount, 2));
  const equivalence = enumerateWarmachineExactD6EquivalenceClasses(diceCount, {
    discardLowest: resolution.attackExtraDiceDiscardLowest,
  });
  const targetNumber = Math.max(2, Math.ceil(numeric(resolution.targetNumber, 2)));
  const groups = new Map();
  for (const row of equivalence.classes) {
    const allRolledDiceOnes = row.dice.length > 0 && row.dice.every((die) => die === 1);
    const allRolledDiceSixes = row.dice.length > 1 && row.dice.every((die) => die === 6);
    const hit = !allRolledDiceOnes && (allRolledDiceSixes || row.sum >= targetNumber);
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

function randomRofChanceModel(action = {}) {
  if (String(action.actionType || "") !== "declare_random_rof_ranged_attacks") return null;
  const requirements = arrayValues(action.metadata?.randomRofRequirements);
  const reasons = [];
  if (!requirements.length) reasons.push("random_rof_requirements_missing");
  const seenWeaponInstanceKeys = new Set();
  for (const requirement of requirements) {
    const weaponInstanceKey = String(requirement.weaponInstanceKey || "");
    const denominator = Math.floor(numeric(requirement.denominator, 0));
    const outcomes = arrayValues(requirement.outcomes);
    if (!weaponInstanceKey) reasons.push("random_rof_weapon_instance_key_missing");
    if (seenWeaponInstanceKeys.has(weaponInstanceKey)) {
      reasons.push(`random_rof_weapon_instance_key_duplicate:${weaponInstanceKey}`);
    }
    seenWeaponInstanceKeys.add(weaponInstanceKey);
    if (denominator < 1) reasons.push(`random_rof_denominator_invalid:${weaponInstanceKey}`);
    if (!outcomes.length) reasons.push(`random_rof_outcomes_missing:${weaponInstanceKey}`);
    const numeratorSum = outcomes.reduce((sum, outcome) =>
      sum + Math.max(0, Math.floor(numeric(outcome.numerator, 0))), 0);
    if (denominator > 0 && numeratorSum !== denominator) {
      reasons.push(`random_rof_probability_mass_invalid:${weaponInstanceKey}`);
    }
    for (const outcome of outcomes) {
      if (!Number.isInteger(Number(outcome.value)) || Number(outcome.value) < 1) {
        reasons.push(`random_rof_value_invalid:${weaponInstanceKey}`);
      }
      if (Math.floor(numeric(outcome.denominator, 0)) !== denominator) {
        reasons.push(`random_rof_outcome_denominator_mismatch:${weaponInstanceKey}`);
      }
      if (Math.floor(numeric(outcome.numerator, 0)) < 1) {
        reasons.push(`random_rof_outcome_numerator_invalid:${weaponInstanceKey}`);
      }
    }
  }
  if (reasons.length) {
    return {
      schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
      actionKey: String(action.actionKey || ""),
      exactComplete: false,
      classes: [],
      reasons: Array.from(new Set(reasons)).sort(),
      chanceKind: "factored_independent_random_rof",
      claimBoundary: "Random ROF remains unresolved because its Engine-owned factor support or probability mass is invalid.",
    };
  }

  let combinations = [{ outcomes: [], numerator: 1 }];
  let commonDenominator = 1;
  for (const requirement of requirements) {
    commonDenominator *= Math.floor(numeric(requirement.denominator, 1));
    combinations = combinations.flatMap((combination) =>
      arrayValues(requirement.outcomes).map((outcome) => ({
        outcomes: [...combination.outcomes, {
          weaponInstanceKey: String(requirement.weaponInstanceKey || ""),
          value: Math.floor(numeric(outcome.value, 1)),
        }],
        numerator: combination.numerator * Math.floor(numeric(outcome.numerator, 1)),
      })));
  }
  const classes = combinations.map((combination) => {
    const strictRandomRofOutcomes = combination.outcomes;
    return {
      classKey: `chance-${stableHash({ strictRandomRofOutcomes })}`,
      numerator: combination.numerator,
      denominator: commonDenominator,
      strictRandomRofOutcomes,
      actionPatch: {
        metadata: {
          strictRandomRofOutcomes,
          strictChanceOutcomeSource: "exact_factored_independent_random_rof_v1",
        },
      },
    };
  });
  const massNumerator = classes.reduce((sum, row) => sum + row.numerator, 0);
  return {
    schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
    actionKey: String(action.actionKey || ""),
    exactComplete: massNumerator === commonDenominator,
    chanceKind: "factored_independent_random_rof",
    chanceFactorCount: requirements.length,
    jointOutcomeCombinationCount: classes.length,
    classCount: classes.length,
    massNumerator,
    massDenominator: commonDenominator,
    classes,
    reasons: [],
    chanceDimensions: {
      randomRofWeaponInstanceKeys: requirements.map((entry) =>
        String(entry.weaponInstanceKey || "")),
      targetSelectionAfterChance: action.metadata?.targetSelectionAfterChance === true,
      combinedAttackGroupingAfterChance:
        action.metadata?.combinedAttackGroupingAfterChance === true,
    },
    orderingPolicy: "engine_factor_support_order_for_reproducible_exact_expansion",
    claimBoundary: "Exact mass covers every Engine-declared independent random-ROF weapon instance before target selection and combined-ranged-attack grouping.",
  };
}

function rerollDecisionChanceModel(action = {}) {
  const actionType = String(action.actionType || "");
  if (!["reroll_use_roll", "reroll_decline_roll"].includes(actionType)) return null;
  if (actionType === "reroll_decline_roll") {
    return {
      schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
      actionKey: String(action.actionKey || ""),
      exactComplete: true,
      chanceKind: "deterministic_reroll_decline",
      classCount: 1,
      massNumerator: 1,
      massDenominator: 1,
      classes: [{
        classKey: `chance-${stableHash({ actionKey: action.actionKey, decision: "keep" })}`,
        numerator: 1,
        denominator: 1,
        actionPatch: {},
      }],
      reasons: [],
      claimBoundary: "Keeping the observed roll is a player decision with one deterministic successor and no Chance mass.",
    };
  }
  const diceCount = Math.floor(numeric(action.metadata?.rerollDiceCount, 0));
  const sourceKey = String(action.metadata?.rerollSourceKey || "");
  const reasons = [];
  if (action.metadata?.rerollDiceRequired !== true) reasons.push("reroll_dice_requirement_missing");
  if (!sourceKey) reasons.push("reroll_source_key_missing");
  if (diceCount < 1 || diceCount > 6) reasons.push("reroll_dice_count_outside_exact_cursor_scope");
  if (reasons.length) {
    return {
      schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
      actionKey: String(action.actionKey || ""),
      exactComplete: false,
      chanceKind: "complete_modified_dice_pool_reroll",
      classes: [],
      reasons,
      claimBoundary: "The selected reroll remains unresolved because its complete modified D6 pool is not finite and source-bound in the certified cursor.",
    };
  }
  const equivalence = enumerateWarmachineExactD6EquivalenceClasses(diceCount);
  const classes = equivalence.classes.map((row) => ({
    classKey: `chance-${stableHash({ actionKey: action.actionKey, sourceKey, rerollDice: row.dice })}`,
    numerator: row.multiplicity,
    denominator: equivalence.outcomeCount,
    rerollDice: row.dice,
    actionPatch: {
      metadata: {
        rerollDice: row.dice,
        strictChanceOutcomeSource: "exact_complete_modified_dice_pool_reroll_v1",
      },
    },
  }));
  const massNumerator = classes.reduce((sum, row) => sum + row.numerator, 0);
  return {
    schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
    actionKey: String(action.actionKey || ""),
    exactComplete: equivalence.massConserved && massNumerator === equivalence.outcomeCount,
    chanceKind: "complete_modified_dice_pool_reroll",
    rollKind: String(action.metadata?.rerollRollKind || "roll"),
    sourceKey,
    classCount: classes.length,
    massNumerator,
    massDenominator: equivalence.outcomeCount,
    classes,
    reasons: [],
    claimBoundary: "Chance covers the complete replacement D6 pool only after the controller selected a legal reroll action; the preceding keep-or-reroll choice is not Chance.",
  };
}

function colossalDamageGridColumnChanceModel(action = {}) {
  const actionType = String(action.actionType || "");
  if (!["colossal_damage_grid_side_left", "colossal_damage_grid_side_right"].includes(actionType)) {
    return null;
  }
  const contract = action.metadata?.colossalDamageGridColumnChanceContract || {};
  const outcomes = arrayValues(contract.outcomes);
  const reasons = [];
  if (contract.schemaVersion !== "warmachine_colossal_damage_grid_column_chance_contract_v1") {
    reasons.push("colossal_damage_grid_column_chance_contract_missing");
  }
  if (contract.exactComplete !== true) reasons.push("colossal_damage_grid_column_chance_contract_not_exact");
  if (!outcomes.length) reasons.push("colossal_damage_grid_column_chance_support_empty");
  const denominator = Math.floor(numeric(contract.massDenominator, 0));
  if (denominator !== 36) reasons.push("colossal_damage_grid_column_denominator_invalid");
  const primarySupport = new Set();
  let numeratorSum = 0;
  for (const outcome of outcomes) {
    const damageColumn = Number(outcome.damageColumn);
    const overflowDamageColumn = Number(outcome.overflowDamageColumn);
    const numerator = Math.floor(numeric(outcome.numerator, 0));
    primarySupport.add(damageColumn);
    numeratorSum += numerator;
    if (!Number.isInteger(damageColumn) || damageColumn < 1 || damageColumn > 6) {
      reasons.push("colossal_primary_damage_column_outside_d6_support");
    }
    if (outcome.overflowRequired === true &&
      (!Number.isInteger(overflowDamageColumn) || overflowDamageColumn < 1 || overflowDamageColumn > 6)) {
      reasons.push("colossal_overflow_damage_column_outside_d6_support");
    }
    if (outcome.overflowRequired !== true && outcome.overflowDamageColumn != null) {
      reasons.push("colossal_unused_overflow_damage_column_present");
    }
    if (numerator < 1 || Number(outcome.denominator) !== denominator) {
      reasons.push("colossal_damage_grid_column_probability_row_invalid");
    }
  }
  if ([1, 2, 3, 4, 5, 6].some((value) => !primarySupport.has(value))) {
    reasons.push("colossal_primary_damage_column_support_incomplete");
  }
  if (numeratorSum !== denominator || Number(contract.massNumerator) !== denominator) {
    reasons.push("colossal_damage_grid_column_probability_mass_not_conserved");
  }
  const uniqueReasons = Array.from(new Set(reasons)).sort();
  const classes = uniqueReasons.length ? [] : outcomes.map((outcome) => {
    const strictRollOutcome = {
      damageColumn: outcome.damageColumn,
      damageBranch: outcome.damageColumn,
      ...(outcome.overflowRequired
        ? { overflowDamageColumn: outcome.overflowDamageColumn }
        : {}),
    };
    return {
      classKey: `chance-${stableHash({ actionKey: action.actionKey, strictRollOutcome })}`,
      numerator: outcome.numerator,
      denominator,
      damageColumn: outcome.damageColumn,
      overflowRequired: outcome.overflowRequired === true,
      overflowDamageColumn: outcome.overflowRequired ? outcome.overflowDamageColumn : null,
      actionPatch: { strictRollOutcome },
    };
  });
  return {
    schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
    actionKey: String(action.actionKey || ""),
    exactComplete: uniqueReasons.length === 0,
    chanceKind: "engine_declared_colossal_damage_grid_column_protocol",
    classCount: classes.length,
    massNumerator: uniqueReasons.length ? 0 : numeratorSum,
    massDenominator: denominator || 36,
    classes,
    reasons: uniqueReasons,
    choicePrecedesChance: contract.choicePrecedesChance === true,
    overflowChanceConditional: contract.overflowChanceConditional === true,
    claimBoundary: "The attacker has already chosen the colossal grid. Search consumes the Engine-declared primary d6 and conditional overflow d6 support without reimplementing grid-fill rules.",
  };
}

function compositeAttackPacketEntries(action = {}) {
  const metadata = action.metadata || {};
  if (metadata.dualAttack === true) {
    const ordered = metadata.dualAttackOrder === "ranged_then_melee"
      ? [
          { componentKind: "ranged", component: metadata.dualAttackRanged },
          { componentKind: "melee", component: metadata.dualAttackMelee },
        ]
      : [
          { componentKind: "melee", component: metadata.dualAttackMelee },
          { componentKind: "ranged", component: metadata.dualAttackRanged },
        ];
    return ordered.filter((entry) => entry.component?.attackResolution)
      .map((entry, componentIndex) => ({
        ...entry,
        componentIndex,
        outcomeRole: "component",
      }));
  }
  if (metadata.assaultChargeComponents === true) {
    return [
      { componentKind: "assault_ranged", component: metadata.assaultRangedAttack },
      { componentKind: "assault_charge_melee", component: metadata.assaultChargeMeleeAttack },
    ].filter((entry) => entry.component?.attackResolution)
      .map((entry, componentIndex) => ({
        ...entry,
        componentIndex,
        outcomeRole: "component",
      }));
  }
  const cavalry = arrayValues(metadata.cavalryImpactAttacks)
    .filter((component) => component?.attackResolution)
    .map((component, componentIndex) => ({
      componentKind: "cavalry_impact",
      component,
      componentIndex,
      outcomeRole: "component",
  }));
  if (!cavalry.length) return [];
  cavalry.push({
    componentKind: "cavalry_charge_primary",
    component: {
      attackProfile: cloneJson(metadata.attackProfile || {}),
      attackResolution: cloneJson(metadata.attackResolution || {}),
      specialRuleAnalysis: cloneJson(metadata.specialRuleAnalysis || {}),
      declaredTargetPieceKey: action.targetPieceKey,
      targetPieceKey: action.targetPieceKey,
      damageRecipientPieceKey: metadata.damageRecipientPieceKey || action.targetPieceKey,
    },
    componentIndex: cavalry.length,
    outcomeRole: "primary",
  });
  return cavalry;
}

function compositeAttackPacketChanceModel(action = {}, rawOptions = {}) {
  const packets = compositeAttackPacketEntries(action);
  if (!packets.length) return null;
  const maxClasses = Math.max(1, Math.floor(numeric(rawOptions.maxCompositeChanceClasses, 4096)));
  const packetModels = packets.map((packet) => {
    const component = packet.component || {};
    const targetPieceKey = String(
      component.damageRecipientPieceKey ||
      component.targetPieceKey ||
      component.declaredTargetPieceKey ||
      action.targetPieceKey ||
      "",
    );
    const profile = component.attackProfile || {};
    const pseudoAction = {
      actionKey: `${action.actionKey}:component:${packet.componentKind}:${packet.componentIndex}`,
      actionType: packet.outcomeRole === "primary"
        ? action.actionType
        : profile.mode === "ranged" || packet.componentKind.includes("ranged")
        ? "ranged_attack"
        : "melee_attack",
      actorPieceKey: action.actorPieceKey,
      targetPieceKey,
      metadata: {
        attackProfile: cloneJson(profile),
        attackResolution: cloneJson(component.attackResolution || {}),
        specialRuleAnalysis: cloneJson(component.specialRuleAnalysis || {}),
        attackProfileExecutableEffects: cloneJson(profile.executableEffects || profile.effects || []),
        ruleAtomEffects: cloneJson(component.attackResolution?.ruleAtomEffects || []),
        ruleAtomDiagnostics: cloneJson(component.attackResolution?.ruleAtomDiagnostics || []),
      },
    };
    return {
      ...packet,
      targetPieceKey,
      model: buildWarmachineExactActionChanceClasses(pseudoAction, rawOptions),
    };
  });
  const reasons = packetModels.flatMap((packet) =>
    packet.model.exactComplete === true
      ? []
      : packet.model.reasons.map((reason) =>
        `component_${packet.componentIndex}_${packet.componentKind}:${reason}`));
  let projectedClassCount = 1;
  let projectedDenominator = 1;
  for (const packet of packetModels) {
    projectedClassCount *= Math.max(1, packet.model.classCount || packet.model.classes.length);
    projectedDenominator *= Math.max(1, numeric(packet.model.massDenominator, 1));
  }
  if (projectedClassCount > maxClasses) reasons.push("composite_attack_chance_class_budget_exceeded");
  if (!Number.isSafeInteger(projectedDenominator)) reasons.push("composite_attack_probability_denominator_not_safe_integer");
  if (reasons.length) {
    return {
      schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
      actionKey: String(action.actionKey || ""),
      exactComplete: false,
      chanceKind: "exact_composite_attack_packet_product",
      classCount: 0,
      projectedClassCount,
      massNumerator: 0,
      massDenominator: projectedDenominator,
      classes: [],
      reasons: Array.from(new Set(reasons)).sort(),
      packetCount: packetModels.length,
      maxCompositeChanceClasses: maxClasses,
      claimBoundary: "The composite action remains unresolved unless every Engine-declared component has a complete exact chance model and their finite product stays inside the explicit class and integer-safety bounds.",
    };
  }
  let product = [{ numerator: 1, outcomes: [], packetOutcomes: [] }];
  for (const packet of packetModels) {
    const next = [];
    for (const prefix of product) {
      for (const chanceClass of packet.model.classes) {
        next.push({
          numerator: prefix.numerator * chanceClass.numerator,
          outcomes: [...prefix.outcomes, {
            outcomeRole: packet.outcomeRole || "component",
            strictRollOutcome: cloneJson(chanceClass.strictRollOutcome || {}),
          }],
          packetOutcomes: [...prefix.packetOutcomes, {
            componentKind: packet.componentKind,
            componentIndex: packet.componentIndex,
            outcomeRole: packet.outcomeRole || "component",
            targetPieceKey: packet.targetPieceKey,
            hit: chanceClass.hit === true,
            resolvedDamage: numeric(chanceClass.resolvedDamage, 0),
            postDamageAttackerChoiceRequired: chanceClass.postDamageAttackerChoiceRequired === true,
          }],
        });
      }
    }
    product = next;
  }
  const classes = product.map((entry) => {
    const strictRollOutcome = {};
    const componentOutcomes = [];
    for (const outcome of entry.outcomes) {
      if (outcome.outcomeRole === "primary") {
        Object.assign(strictRollOutcome, cloneJson(outcome.strictRollOutcome));
      } else {
        componentOutcomes.push(cloneJson(outcome.strictRollOutcome));
      }
    }
    if (componentOutcomes.length) strictRollOutcome.componentOutcomes = componentOutcomes;
    return {
      classKey: `chance-${stableHash({ actionKey: action.actionKey, strictRollOutcome })}`,
      numerator: entry.numerator,
      denominator: projectedDenominator,
      strictRollOutcome,
      packetOutcomes: entry.packetOutcomes,
      postDamageAttackerChoiceRequired: entry.packetOutcomes.some((packet) =>
        packet.postDamageAttackerChoiceRequired === true),
    };
  });
  const massNumerator = classes.reduce((sum, entry) => sum + entry.numerator, 0);
  return {
    schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
    actionKey: String(action.actionKey || ""),
    exactComplete: massNumerator === projectedDenominator,
    chanceKind: "exact_composite_attack_packet_product",
    classCount: classes.length,
    projectedClassCount,
    massNumerator,
    massDenominator: projectedDenominator,
    classes,
    reasons: massNumerator === projectedDenominator ? [] : ["composite_attack_probability_mass_not_conserved"],
    packetCount: packetModels.length,
    maxCompositeChanceClasses: maxClasses,
    orderingPolicy: "engine_component_order_then_exact_packet_product_v1",
    claimBoundary: "Each component distribution comes from its Engine-enumerated attack resolution. Search forms only the finite independent D6 product; player-owned target switches and Colossal grid choices remain later Engine windows.",
  };
}

function secondaryAttackPacketEntries(action = {}) {
  const metadata = action.metadata || {};
  if (arrayValues(metadata.spraySecondaryTargets).length) {
    return arrayValues(metadata.spraySecondaryTargets).map((entry, packetIndex) => ({
      packetKind: "spray_secondary_attack",
      packetIndex,
      targetPieceKey: String(entry.pieceKey || ""),
      outcomeBucket: "sprayAttackDamageByTarget",
      entry,
    }));
  }
  if (arrayValues(metadata.aoeBlastTargets).length || metadata.aoeMissTargetBlast) {
    const byTarget = new Map();
    for (const entry of [
      ...arrayValues(metadata.aoeBlastTargets),
      metadata.aoeMissTargetBlast,
    ].filter(Boolean)) {
      if (!entry.pieceKey || byTarget.has(entry.pieceKey)) continue;
      byTarget.set(entry.pieceKey, entry);
    }
    return Array.from(byTarget.values()).map((entry, packetIndex) => ({
      packetKind: entry.missedDirectTargetBlast === true
        ? "aoe_miss_target_blast_damage"
        : "aoe_blast_damage",
      packetIndex,
      targetPieceKey: String(entry.pieceKey || ""),
      outcomeBucket: entry.missedDirectTargetBlast === true
        ? "aoeMissBlastDamageByTarget"
        : "aoeBlastDamageByTarget",
      entry,
    }));
  }
  return [];
}

function primaryOnlyActionForSecondaryPacketProduct(action = {}) {
  const metadata = cloneJson(action.metadata || {});
  for (const key of [
    "aoeBlastTargets",
    "aoeMissTargetBlast",
    "aoeTemplatePlacement",
    "spraySecondaryTargets",
    "sprayBlockedTargets",
  ]) delete metadata[key];
  return {
    ...cloneJson(action),
    actionKey: `${action.actionKey}:primary-packet`,
    metadata,
  };
}

function secondaryPacketPseudoAction(action = {}, packet = {}) {
  const entry = packet.entry || {};
  const profile = action.metadata?.attackProfile || {};
  const sprayResolution = entry.attackResolution || null;
  const resolution = sprayResolution || {
    hitModel: "legacy_auto_hit_v1",
    automaticHitMissResolution: { outcome: "automatic_hit" },
    attackDiceCount: 1,
    diceCount: 1,
    damageDiceCount: Math.max(0, Math.floor(numeric(entry.damageDiceCount, 2))),
    staticDamage: numeric(entry.staticDamage, 0),
    damageLayoutOutcomeRequirements: {
      damageLayoutKind: entry.damageLayoutKind || "",
      damageLayoutKnown: entry.damageLayoutKnown === true,
      damageLayoutMappingRequired: entry.damageLayoutMappingRequired === true,
      damageColumnRequiredWhenDamagePositive: entry.damageColumnRequiredWhenDamagePositive === true,
      damageGridSideRequiredWhenDamagePositive: entry.damageGridSideRequiredWhenDamagePositive === true,
      damageGridSideRollRequiredWhenDamagePositive: entry.damageGridSideRollRequiredWhenDamagePositive === true,
      damageGridSideCausalityRequired: entry.damageGridSideCausalityRequired === true,
      overflowDamageColumnMayBeRequired: entry.overflowDamageColumnMayBeRequired === true,
    },
  };
  return {
    actionKey: `${action.actionKey}:${packet.packetKind}:${packet.packetIndex}:${packet.targetPieceKey}`,
    actionType: sprayResolution ? "ranged_attack" : "secondary_damage",
    actorPieceKey: action.actorPieceKey,
    targetPieceKey: packet.targetPieceKey,
    metadata: {
      attackProfile: cloneJson(profile),
      attackResolution: cloneJson(resolution),
      specialRuleAnalysis: cloneJson(entry.specialRuleAnalysis || {}),
      attackProfileExecutableEffects: cloneJson(
        sprayResolution ? profile.executableEffects || profile.effects || [] : [],
      ),
      ruleAtomEffects: cloneJson(sprayResolution?.ruleAtomEffects || []),
      ruleAtomDiagnostics: cloneJson(sprayResolution?.ruleAtomDiagnostics || []),
    },
  };
}

function secondaryAttackPacketChanceModel(action = {}, rawOptions = {}) {
  const packets = secondaryAttackPacketEntries(action);
  if (!packets.length) return null;
  const maxClasses = Math.max(1, Math.floor(numeric(rawOptions.maxSecondaryPacketChanceClasses, 4096)));
  const primaryModel = buildWarmachineExactActionChanceClasses(
    primaryOnlyActionForSecondaryPacketProduct(action),
    rawOptions,
  );
  const packetModels = packets.map((packet) => ({
    ...packet,
    model: buildWarmachineExactActionChanceClasses(
      secondaryPacketPseudoAction(action, packet),
      rawOptions,
    ),
  }));
  const reasons = primaryModel.exactComplete === true
    ? []
    : primaryModel.reasons.map((reason) => `primary:${reason}`);
  for (const packet of packetModels) {
    if (packet.model.exactComplete === true) continue;
    reasons.push(...packet.model.reasons.map((reason) =>
      `${packet.packetKind}_${packet.packetIndex}:${reason}`));
  }
  let projectedClassCount = Math.max(1, primaryModel.classCount || primaryModel.classes.length);
  let projectedDenominator = Math.max(1, numeric(primaryModel.massDenominator, 1));
  for (const packet of packetModels) {
    projectedClassCount *= Math.max(1, packet.model.classCount || packet.model.classes.length);
    projectedDenominator *= Math.max(1, numeric(packet.model.massDenominator, 1));
  }
  if (projectedClassCount > maxClasses) reasons.push("secondary_attack_packet_chance_class_budget_exceeded");
  if (!Number.isSafeInteger(projectedDenominator)) reasons.push("secondary_attack_packet_probability_denominator_not_safe_integer");
  if (reasons.length) {
    return {
      schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
      actionKey: String(action.actionKey || ""),
      exactComplete: false,
      chanceKind: "exact_primary_and_secondary_attack_packet_product",
      classCount: 0,
      projectedClassCount,
      massNumerator: 0,
      massDenominator: projectedDenominator,
      classes: [],
      reasons: Array.from(new Set(reasons)).sort(),
      packetCount: 1 + packetModels.length,
      maxSecondaryPacketChanceClasses: maxClasses,
      claimBoundary: "The attack remains unresolved unless the primary packet and every Engine-declared spray or AOE packet have a complete finite exact model inside the explicit product budget.",
    };
  }
  let product = primaryModel.classes.map((chanceClass) => ({
    numerator: chanceClass.numerator,
    strictRollOutcome: cloneJson(chanceClass.strictRollOutcome || {}),
    packetOutcomes: [{
      packetKind: "primary_attack",
      packetIndex: 0,
      targetPieceKey: String(action.targetPieceKey || ""),
      hit: chanceClass.hit === true,
      resolvedDamage: numeric(chanceClass.resolvedDamage, 0),
      postDamageAttackerChoiceRequired: chanceClass.postDamageAttackerChoiceRequired === true,
    }],
  }));
  for (const packet of packetModels) {
    const next = [];
    for (const prefix of product) {
      for (const chanceClass of packet.model.classes) {
        const strictRollOutcome = cloneJson(prefix.strictRollOutcome);
        strictRollOutcome[packet.outcomeBucket] ||= {};
        const packetOutcome = cloneJson(chanceClass.strictRollOutcome || {});
        if (packet.packetKind.startsWith("aoe_")) delete packetOutcome.attackDice;
        strictRollOutcome[packet.outcomeBucket][packet.targetPieceKey] = packetOutcome;
        next.push({
          numerator: prefix.numerator * chanceClass.numerator,
          strictRollOutcome,
          packetOutcomes: [...prefix.packetOutcomes, {
            packetKind: packet.packetKind,
            packetIndex: packet.packetIndex,
            targetPieceKey: packet.targetPieceKey,
            hit: chanceClass.hit === true,
            resolvedDamage: numeric(chanceClass.resolvedDamage, 0),
            postDamageAttackerChoiceRequired: chanceClass.postDamageAttackerChoiceRequired === true,
          }],
        });
      }
    }
    product = next;
  }
  const classes = product.map((entry) => ({
    classKey: `chance-${stableHash({ actionKey: action.actionKey, strictRollOutcome: entry.strictRollOutcome })}`,
    numerator: entry.numerator,
    denominator: projectedDenominator,
    strictRollOutcome: entry.strictRollOutcome,
    packetOutcomes: entry.packetOutcomes,
    hit: entry.packetOutcomes[0].hit,
    resolvedDamage: entry.packetOutcomes[0].resolvedDamage,
    postDamageAttackerChoiceRequired: entry.packetOutcomes.some((packet) =>
      packet.postDamageAttackerChoiceRequired === true),
  }));
  const massNumerator = classes.reduce((sum, entry) => sum + entry.numerator, 0);
  return {
    schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
    actionKey: String(action.actionKey || ""),
    exactComplete: massNumerator === projectedDenominator,
    chanceKind: "exact_primary_and_secondary_attack_packet_product",
    classCount: classes.length,
    projectedClassCount,
    massNumerator,
    massDenominator: projectedDenominator,
    classes,
    reasons: massNumerator === projectedDenominator ? [] : ["secondary_attack_packet_probability_mass_not_conserved"],
    packetCount: 1 + packetModels.length,
    maxSecondaryPacketChanceClasses: maxClasses,
    unusedConditionalPacketDiceIncludedInMass: true,
    orderingPolicy: "primary_then_engine_declared_secondary_packet_order_v1",
    claimBoundary: "The exact product includes every Engine-declared packet's independent D6 support. Packets unused by the realized hit branch retain probability mass but cannot mutate state; player choices remain later Engine windows.",
  };
}

export function warmachineExactChanceClassActionPatch(chanceClass = {}) {
  if (chanceClass.actionPatch && typeof chanceClass.actionPatch === "object") {
    return cloneJson(chanceClass.actionPatch);
  }
  return {
    strictRollOutcome: cloneJson(chanceClass.strictRollOutcome || {}),
  };
}

export function buildWarmachineExactPostResponseChanceClassesV1(
  action = {},
  response = {},
  primaryChanceClass = {},
  rawOptions = {},
) {
  const baseStrictRollOutcome = cloneJson(primaryChanceClass.strictRollOutcome || {});
  const identityClass = (reason = "post_response_chance_not_required") => {
    const strictRollOutcome = cloneJson(baseStrictRollOutcome);
    return {
      schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
      actionKey: String(action.actionKey || ""),
      responseKey: String(response.responseKey || ""),
      exactComplete: true,
      classCount: 1,
      massNumerator: 1,
      massDenominator: 1,
      reasons: [],
      classes: [{
        classKey: `post-response-chance-${stableHash({
          actionKey: action.actionKey,
          responseKey: response.responseKey,
          strictRollOutcome,
        })}`,
        numerator: 1,
        denominator: 1,
        strictRollOutcome,
        actionPatch: { strictRollOutcome },
        chanceKind: "identity",
        reason,
      }],
      orderingPolicy: "owned_response_before_post_response_chance",
      claimBoundary: "No new random damage-location outcome is required after this owned response.",
    };
  };

  if (String(response.choice || "") !== "transfer") {
    return identityClass("response_does_not_transfer_damage");
  }
  if (primaryChanceClass.hit === false || numeric(primaryChanceClass.resolvedDamage, 0) <= 0) {
    return identityClass("no_positive_transferred_damage");
  }

  const state = rawOptions.state || null;
  const recipientPieceKey = String(response.recipientPieceKey || "");
  const recipient = arrayValues(state?.pieces).find((piece) =>
    piece.pieceKey === recipientPieceKey) || null;
  if (!recipient) {
    return {
      schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
      actionKey: String(action.actionKey || ""),
      responseKey: String(response.responseKey || ""),
      exactComplete: false,
      classCount: 0,
      massNumerator: 0,
      massDenominator: 1,
      reasons: ["damage_transfer_recipient_not_bound_in_state"],
      classes: [],
      orderingPolicy: "owned_response_before_post_response_chance",
      claimBoundary: "A transferred-damage branch requires the exact recipient state.",
    };
  }

  const damage = recipient.damage || {};
  const layoutKind = String(damage.layoutKind || "").toLowerCase();
  const exactDamageGrid = layoutKind === "damage_grid" &&
    arrayValues(damage.gridColumns).length === 6;
  const exactLifeSpiral = layoutKind === "life_spiral" &&
    arrayValues(damage.lifeSpiralRows).length > 0;
  const exactDamageWeb = ["damage_web", "horror_web"].includes(layoutKind) &&
    damage.damageWebRings && typeof damage.damageWebRings === "object";
  const exactHitPoints = layoutKind === "hit_points";
  const exactColossalGrid = layoutKind === "colossal_damage_grid" &&
    arrayValues(damage.colossalGridColumns?.left).length === 6 &&
    arrayValues(damage.colossalGridColumns?.right).length === 6;
  if (exactHitPoints || exactDamageWeb) {
    return identityClass(exactDamageWeb
      ? "transfer_recipient_damage_web_has_deterministic_ring_order"
      : "transfer_recipient_uses_hit_points_only");
  }
  if (exactColossalGrid) {
    return {
      schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
      actionKey: String(action.actionKey || ""),
      responseKey: String(response.responseKey || ""),
      exactComplete: false,
      classCount: 0,
      massNumerator: 0,
      massDenominator: 1,
      reasons: ["transferred_damage_colossal_grid_side_choice_not_modeled"],
      classes: [],
      orderingPolicy: "owned_response_before_attacker_grid_choice_before_post_response_chance",
      claimBoundary: "Transferred damage to a colossal remains fail-closed until the attacker-owned grid-side choice precedes the location die.",
    };
  }
  if (!exactDamageGrid && !exactLifeSpiral) {
    return {
      schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
      actionKey: String(action.actionKey || ""),
      responseKey: String(response.responseKey || ""),
      exactComplete: false,
      classCount: 0,
      massNumerator: 0,
      massDenominator: 1,
      reasons: ["damage_transfer_recipient_layout_not_exact"],
      classes: [],
      orderingPolicy: "owned_response_before_post_response_chance",
      claimBoundary: "Search does not invent a damage column or life-spiral topology when the exact recipient layout is absent.",
    };
  }

  const classes = [1, 2, 3, 4, 5, 6].map((damageColumn) => {
    const strictRollOutcome = {
      ...cloneJson(baseStrictRollOutcome),
      damageColumn,
      damageBranch: damageColumn,
    };
    return {
      classKey: `post-response-chance-${stableHash({
        actionKey: action.actionKey,
        responseKey: response.responseKey,
        recipientPieceKey,
        strictRollOutcome,
      })}`,
      numerator: 1,
      denominator: 6,
      strictRollOutcome,
      actionPatch: { strictRollOutcome },
      chanceKind: "transferred_damage_location",
      recipientPieceKey,
      damageColumn,
      damageBranch: damageColumn,
    };
  });
  return {
    schemaVersion: WARMACHINE_SEARCH_CHANCE_OUTCOMES_SCHEMA,
    actionKey: String(action.actionKey || ""),
    responseKey: String(response.responseKey || ""),
    exactComplete: true,
    classCount: classes.length,
    massNumerator: 6,
    massDenominator: 6,
    reasons: [],
    classes,
    chanceKind: "transferred_damage_location",
    recipientPieceKey,
    orderingPolicy: "owned_response_before_transferred_damage_location_chance",
    claimBoundary: "After the defender selects a damage-transfer recipient with an exact ordinary grid or life spiral, its damage column or branch is an exact uniform D6 Chance node.",
  };
}

export function buildWarmachineExactActionChanceClasses(action = {}, rawOptions = {}) {
  const rerollDecision = rerollDecisionChanceModel(action);
  if (rerollDecision) return rerollDecision;
  const colossalDamageGridColumns = colossalDamageGridColumnChanceModel(action);
  if (colossalDamageGridColumns) return colossalDamageGridColumns;
  const randomRof = randomRofChanceModel(action);
  if (randomRof) return randomRof;
  const compositeAttackPackets = compositeAttackPacketChanceModel(action, rawOptions);
  if (compositeAttackPackets) return compositeAttackPackets;
  const secondaryAttackPackets = secondaryAttackPacketChanceModel(action, rawOptions);
  if (secondaryAttackPackets) return secondaryAttackPackets;
  const reasons = primaryAttackExactnessReasons(action, rawOptions);
  const deterministicSuccessorEffectTypes = exactDeterministicSuccessorEffectTypes(action);
  const preChanceResolvedEffectTypes = exactPreChanceResolvedEffectTypes(action);
  const postChanceDecisionEffectTypes = Array.from(new Set(semanticActionEffects(action)
    .filter((effect) => EXACT_POST_CHANCE_DECISION_EFFECT_TYPES.has(String(effect.effectType || "")))
    .map((effect) => String(effect.effectType || ""))
    .filter(Boolean))).sort();
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
      postChanceDecisionEffectTypes,
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
  const target = actionTargetFromState(action, rawOptions.state || null);
  const targetBoxesRemaining = Number(target?.boxesRemaining ?? target?.damage?.boxesRemaining);
  const staticDamage = numeric(resolution.staticDamage, 0);
  const commonDenominator = attack.outcomeCount * damage.outcomeCount *
    damageLocationValues.length * toughDieValues.length;
  const classes = [];
  for (const attackClass of attack.groups) {
    if (!attackClass.hit) {
      const numerator = attackClass.multiplicity * damage.outcomeCount *
        damageLocationValues.length * toughDieValues.length;
      const strictRollOutcome = {
        attackDice: attackClass.representativeDice,
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
      const resolvedDamage = Math.max(0, numeric(damageClass.sum, 0) + staticDamage);
      const damageLocationRequired = resolvedDamage > 0 && chanceDimensions.targetUsesRandomDamageLocation === true;
      const toughRollRequired = chanceDimensions.targetToughRollRelevant === true &&
        Number.isFinite(targetBoxesRemaining) && targetBoxesRemaining > 0 && resolvedDamage >= targetBoxesRemaining;
      const retainedDamageLocationValues = damageLocationRequired ? damageLocationValues : [null];
      const retainedToughDieValues = toughRollRequired ? toughDieValues : [null];
      const omittedLocationMultiplicity = damageLocationRequired ? 1 : damageLocationValues.length;
      const omittedToughMultiplicity = toughRollRequired ? 1 : toughDieValues.length;
      for (const damageColumn of retainedDamageLocationValues) {
        for (const toughDie of retainedToughDieValues) {
          const strictRollOutcome = {
            attackDice: attackClass.representativeDice,
            damageDice: damageClass.representativeDice,
            ...(damageLocationRequired ? {
              damageColumn,
              damageBranch: damageColumn,
            } : {}),
            ...(chanceDimensions.controllerDamageGridSideResolved === true &&
              chanceDimensions.controllerDamageGridSideRequired ? {
              damageGridSide: chanceDimensions.selectedDamageGridSide,
            } : {}),
            ...(toughRollRequired ? { toughDie } : {}),
          };
          classes.push({
            classKey: `chance-${stableHash({ strictRollOutcome, hit: true })}`,
            hit: true,
            damageSum: damageClass.sum,
            resolvedDamage,
            damageLocationRequired,
            toughRollRequired,
            postDamageAttackerChoiceRequired: resolvedDamage > 0 &&
              chanceDimensions.postDamageAttackerChoiceRequired === true,
            numerator: attackClass.multiplicity * damageClass.multiplicity *
              omittedLocationMultiplicity * omittedToughMultiplicity,
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
    postChanceDecisionEffectTypes,
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
