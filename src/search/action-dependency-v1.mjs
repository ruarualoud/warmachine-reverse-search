export const WARMACHINE_SEARCH_DEPENDENCY_SCHEMA = "warmachine_search_dependency_v1";
export const WARMACHINE_SEARCH_ACTION_FOOTPRINT_SCHEMA = "warmachine_search_action_footprint_v1";
export const WARMACHINE_SEARCH_ACTION_INDEPENDENCE_SCHEMA = "warmachine_search_action_independence_v1";

const WILDCARD = "*";

const MOVEMENT_ACTION_TYPES = new Set([
  "advance",
  "advance_then_melee_attack",
  "boosted_advance_then_melee_attack",
  "boosted_advance_then_offensive_spell",
  "boosted_advance_then_ranged_attack",
  "boosted_hit_advance_then_melee_attack",
  "boosted_hit_advance_then_offensive_spell",
  "boosted_hit_advance_then_ranged_attack",
  "boosted_hit_damage_advance_then_melee_attack",
  "advance_then_offensive_spell",
  "advance_then_ranged_attack",
  "assault_charge",
  "beat_back_follow_up",
  "beat_back_follow_up_advance",
  "bulldoze_push",
  "cavalry_charge",
  "charge",
  "contest_zone_move",
  "failed_charge",
  "frenzy_charge",
  "lightning_strike_sprint",
  "nymara_feral_onslaught_use",
  "nymara_on_dark_wings_advance",
  "overtake_move",
  "place",
  "post_activation_reposition",
  "post_attack_advance",
  "ram_follow_advance",
  "reposition_move",
  "reposition_window_advance",
  "run",
  "side_step_advance",
  "stand_up_forfeit_combat_advance",
  "swift_hunter_advance",
  "trample_power_attack",
  "unit_group_advance",
  "unit_group_charge",
  "unit_group_failed_charge",
  "vengeance_move",
  "vengeance_move_attack",
]);

const ATTACK_ACTION_TYPES = new Set([
  "advance_then_melee_attack",
  "advance_then_offensive_spell",
  "advance_then_ranged_attack",
  "aimed_ranged_attack",
  "assault_charge",
  "automatic_attack_hit_audit",
  "boosted_charge",
  "boosted_advance_then_melee_attack",
  "boosted_advance_then_offensive_spell",
  "boosted_advance_then_ranged_attack",
  "boosted_aimed_ranged_attack",
  "boosted_hit_advance_then_melee_attack",
  "boosted_hit_advance_then_offensive_spell",
  "boosted_hit_advance_then_ranged_attack",
  "boosted_hit_aimed_ranged_attack",
  "boosted_hit_damage_advance_then_melee_attack",
  "boosted_hit_charge",
  "boosted_hit_melee_attack",
  "boosted_hit_offensive_spell",
  "boosted_hit_ranged_attack",
  "boosted_melee_attack",
  "boosted_offensive_spell",
  "boosted_ranged_attack",
  "both_barrels_ranged_attack",
  "cavalry_charge",
  "charge",
  "combined_melee_attack",
  "combined_ranged_attack",
  "deathly_domination_destroyed",
  "delegated_offensive_or_support_spell",
  "free_strike",
  "frenzy_charge",
  "headbutt_power_attack",
  "melee_attack",
  "minefield_magical_blast_damage",
  "offensive_spell",
  "prime_mine_pow14_blast_damage",
  "purchased_additional_melee_attack",
  "ranged_attack",
  "reaction_attack",
  "slam_power_attack",
  "soul_powered_melee_attack",
  "stand_up_forfeit_movement_melee_attack",
  "stand_up_forfeit_movement_offensive_spell",
  "stand_up_forfeit_movement_ranged_attack",
  "support_fire",
  "targetable_terrain_basic_attack",
  "throw_power_attack",
  "trample_power_attack",
  "unit_assault_ranged_attack",
  "unit_charge_melee_attack",
  "vengeance_move_attack",
]);

const SPELL_ACTION_TYPES = new Set([
  "advance_then_offensive_spell",
  "boosted_advance_then_offensive_spell",
  "boosted_hit_offensive_spell",
  "boosted_hit_advance_then_offensive_spell",
  "boosted_offensive_spell",
  "cast_animus",
  "cast_support_spell",
  "channeled_offensive_spell",
  "delegated_offensive_or_support_spell",
  "magic_ability_casting_contract",
  "offensive_spell",
  "stand_up_forfeit_movement_offensive_spell",
  "upkeep_spell",
]);

const RESOURCE_ACTION_TYPES = new Set([
  "allocate_resource",
  "force_fury",
  "fury_heal",
  "leech_fury",
  "leech_life_force_essence",
  "leech_life_force_fury",
  "maltreatment",
  "monstrosity_rage_fueled",
  "sacrifice_for_essence",
  "shed_fury",
  "spend_corpse_token",
  "spend_hunger_token",
  "spend_soul_token",
  "spirit_bond_gain_fury",
]);

const SCORE_ACTION_TYPES = new Set([
  "perform_scenario_action",
  "score_flag",
  "score_scenario_terrain",
  "score_zone",
  "stand_up_forfeit_movement_perform_scenario_action",
]);

const PHASE_ACTION_TYPES = new Set([
  "end_any_time_activation_window",
  "end_combat_purchase_window",
  "end_control_phase",
  "end_control_replenishment",
  "end_initial_attack_window",
  "end_maintenance_phase",
  "end_turn",
]);

const SIMPLE_ACTION_TYPES = new Set([
  "activation_end",
  "decline_reposition",
  "decline_unit_assault_attack",
  "decline_vengeance_attack",
  "decline_vengeance_move",
  "decline_vengeance_unit",
  "end_unit_trooper_combat_action",
  "forfeit_normal_movement",
  "pass",
  "required_charge_forfeit_activation",
  "shake_status",
  "stand_up_forfeit_combat",
  "stationary_forfeit_activation",
  "take_up_replacement",
  "unit_group_aim",
  "use_feat",
]);

const KNOWN_ACTION_TYPES = new Set([
  ...MOVEMENT_ACTION_TYPES,
  ...ATTACK_ACTION_TYPES,
  ...SPELL_ACTION_TYPES,
  ...RESOURCE_ACTION_TYPES,
  ...SCORE_ACTION_TYPES,
  ...PHASE_ACTION_TYPES,
  ...SIMPLE_ACTION_TYPES,
  "automatic_attack_modifier_audit",
  "automatic_damage_applied_audit",
  "automatic_damage_modifier_audit",
  "automatic_knockdown_prevention_audit",
  "automatic_movement_allowance_audit",
  "automatic_movement_cost_audit",
  "automatic_movement_validation_audit",
  "conditional_disabled_modifier_audit",
  "hazard_damage",
  "model_exploded",
  "resolve_continuous_effect",
  "resolve_standard_building_destruction",
  "resolve_threshold_check",
  "revive_grunt",
  "rule_atom_disabled_turn_start_destroy",
]);

function arrayValues(value) {
  return Array.isArray(value) ? value : [];
}

function sortedUnique(values) {
  return Array.from(new Set(arrayValues(values).map((value) => String(value || "")).filter(Boolean))).sort();
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

function pieceStateKey(pieceKey) {
  return `piece:${pieceKey}:state`;
}

function pieceFieldKey(pieceKey, field) {
  return `piece:${pieceKey}:${field}`;
}

function actionHasDestination(action = {}) {
  return Boolean(
    action.destination ||
    arrayValues(action.groupDestinations).length ||
    arrayValues(action.destinationsByModel).length ||
    arrayValues(action.metadata?.destinationsByModel).length
  );
}

function collectNamedPieceKeys(value, output = new Set(), seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) collectNamedPieceKeys(entry, output, seen);
    return output;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (/PieceKey$/.test(key) && typeof entry === "string" && entry) output.add(entry);
    if (/PieceKeys$/.test(key) && Array.isArray(entry)) {
      for (const pieceKey of entry) if (pieceKey) output.add(String(pieceKey));
    }
    if (entry && typeof entry === "object") collectNamedPieceKeys(entry, output, seen);
  }
  return output;
}

function unitMemberKeys(state = {}, actor = {}, action = {}) {
  const keys = new Set([
    ...arrayValues(action.metadata?.unitPieceKeys),
    ...arrayValues(action.unitPieceKeys),
  ].map(String));
  const unitGroupId = actor.unitGroupId || actor.unitId || actor.metadata?.unitGroupId || actor.metadata?.unitId || "";
  if (unitGroupId) {
    for (const piece of arrayValues(state.pieces)) {
      const candidateGroupId = piece.unitGroupId || piece.unitId || piece.metadata?.unitGroupId || piece.metadata?.unitId || "";
      if (candidateGroupId === unitGroupId) keys.add(String(piece.pieceKey || ""));
    }
  }
  return sortedUnique(Array.from(keys));
}

function activationGroupKey(actor = {}) {
  if (!actor.pieceKey) return "";
  const unitKey = actor.unitGroupId || actor.unitId || actor.metadata?.unitGroupId || actor.metadata?.unitId || "";
  return unitKey ? `unit:${unitKey}` : `piece:${actor.pieceKey}`;
}

function activeWindowKeys(state = {}) {
  return Object.entries(state)
    .filter(([key, value]) => /Window$/i.test(key) && hasValue(value))
    .map(([key]) => key)
    .sort();
}

function declaredSearchFootprint(effect = {}) {
  const declaration = effect.searchFootprint || effect.primitive?.searchFootprint || null;
  if (!declaration || declaration.conservativeComplete !== true) return null;
  return {
    reads: sortedUnique(declaration.reads),
    writes: sortedUnique(declaration.writes),
    enables: sortedUnique(declaration.enables),
    disables: sortedUnique(declaration.disables),
    chance: declaration.chance === true,
    reaction: declaration.reaction === true,
  };
}

function collectAtomicEffects(value, output = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) collectAtomicEffects(entry, output, seen);
    return output;
  }
  const sourceContractDiagnostic = Boolean(
    value.atomKey &&
      value.hookKey &&
      value.reason &&
      arrayValues(value.sourceContracts).length > 0 &&
      !value.primitiveKey &&
      !value.primitive,
  );
  if (!sourceContractDiagnostic && value.atomKey && (value.hookKey || value.primitiveKey || value.primitive)) output.push(value);
  for (const entry of Object.values(value)) collectAtomicEffects(entry, output, seen);
  return output;
}

function unresolvedMetadataReasons(metadata = {}) {
  const reasons = [];
  const inspect = (value, path = "metadata", seen = new Set()) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const [index, entry] of value.entries()) inspect(entry, `${path}[${index}]`, seen);
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (/^(unresolvedRuleKeys|unsupportedExecutableEffects|ruleAtomDiagnostics|sourceContractDiagnostics)$/.test(key) && hasValue(entry)) {
        reasons.push(`${path}.${key}`);
      }
      if (entry && typeof entry === "object") inspect(entry, `${path}.${key}`, seen);
    }
  };
  inspect(metadata);
  return sortedUnique(reasons);
}

function metadataImpliesChance(metadata = {}) {
  let found = false;
  const inspect = (value, seen = new Set()) => {
    if (found || !value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const entry of value) inspect(entry, seen);
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (/(diceCount|rollKind|rollOutcome|distribution|random)/i.test(key) && hasValue(entry)) {
        found = true;
        return;
      }
      if (entry && typeof entry === "object") inspect(entry, seen);
    }
  };
  inspect(metadata);
  return found;
}

function addPieceRead(reads, pieceKey, fields = []) {
  if (!pieceKey) return;
  reads.add(pieceStateKey(pieceKey));
  for (const field of fields) reads.add(pieceFieldKey(pieceKey, field));
}

function addPieceWrite(writes, pieceKey, fields = []) {
  if (!pieceKey) return;
  writes.add(pieceStateKey(pieceKey));
  for (const field of fields) writes.add(pieceFieldKey(pieceKey, field));
}

function classifyAction(action = {}) {
  const actionType = String(action.actionType || "");
  const movement = MOVEMENT_ACTION_TYPES.has(actionType) || actionHasDestination(action);
  const attack = ATTACK_ACTION_TYPES.has(actionType) || Boolean(action.metadata?.attackResolution);
  const spell = SPELL_ACTION_TYPES.has(actionType) || Boolean(action.spellName || action.metadata?.spellName);
  const resource = RESOURCE_ACTION_TYPES.has(actionType) || Number(action.resourceCost || 0) > 0 || Boolean(action.resourceKind);
  const score = SCORE_ACTION_TYPES.has(actionType);
  const phase = PHASE_ACTION_TYPES.has(actionType);
  const unit = actionType.startsWith("unit_") || arrayValues(action.metadata?.unitPieceKeys).length > 0;
  return sortedUnique([
    movement && "movement",
    attack && "attack",
    spell && "spell",
    resource && "resource",
    score && "scenario_score",
    phase && "phase",
    unit && "unit",
  ]);
}

export function buildWarmachineSearchActionFootprint(state = {}, action = {}) {
  const actionType = String(action.actionType || "");
  const actionKey = String(action.actionKey || "");
  const pieces = arrayValues(state.pieces);
  const piecesByKey = new Map(pieces.map((piece) => [String(piece.pieceKey || ""), piece]));
  const actorPieceKey = String(action.actorPieceKey || "");
  const targetPieceKey = String(action.targetPieceKey || "");
  const actor = piecesByKey.get(actorPieceKey) || {};
  const targetIsPiece = piecesByKey.has(targetPieceKey);
  const categories = classifyAction(action);
  const categorySet = new Set(categories);
  const reads = new Set(["global:active-side", "global:phase", "global:turn"]);
  const writes = new Set();
  const enables = new Set();
  const disables = new Set();
  const completenessReasons = [];
  const chanceReasons = [];
  const reactionReasons = [];

  const affectedPieceKeys = new Set([
    ...arrayValues(action.metadata?.affectedPieceKeys),
    ...arrayValues(action.affectedPieceKeys),
    ...arrayValues(action.destinationsByModel).map((entry) => entry?.pieceKey),
    ...arrayValues(action.metadata?.destinationsByModel).map((entry) => entry?.pieceKey),
  ].map((key) => String(key || "")).filter(Boolean));
  const unitPieceKeys = unitMemberKeys(state, actor, action);
  const reactionRequirements = [
    ...arrayValues(action.metadata?.freeStrikeResolutionRequirements),
    ...arrayValues(action.metadata?.reactionResolutionRequirements),
  ];
  const reactionPieceKeys = collectNamedPieceKeys(reactionRequirements);

  if (!actionKey) completenessReasons.push("missing_action_key");
  if (!actionType || !KNOWN_ACTION_TYPES.has(actionType)) completenessReasons.push(`unknown_action_type:${actionType || "missing"}`);
  if (actorPieceKey && !actor.pieceKey && !categorySet.has("scenario_score") && !categorySet.has("phase")) {
    completenessReasons.push(`unknown_actor_piece:${actorPieceKey}`);
  }

  if (actor.pieceKey) addPieceRead(reads, actorPieceKey, ["alive", "activation", "position", "status"]);
  if (targetIsPiece) addPieceRead(reads, targetPieceKey, ["alive", "position", "status"]);
  for (const pieceKey of unitPieceKeys) addPieceRead(reads, pieceKey, ["alive", "activation", "position", "status"]);

  const activeWindows = activeWindowKeys(state);
  for (const windowKey of activeWindows) {
    reads.add(`window:${windowKey}`);
    writes.add(`window:${windowKey}`);
    if (/reaction|freeStrike|countercharge|admonition/i.test(windowKey)) reactionReasons.push(`active_window:${windowKey}`);
  }

  if (categorySet.has("movement")) {
    reads.add("global:board-occupancy");
    reads.add("global:terrain");
    reads.add("global:line-of-sight");
    writes.add("global:board-occupancy");
    enables.add("global:engagement-and-los");
    disables.add("global:engagement-and-los");
    const movedKeys = sortedUnique([actorPieceKey, ...unitPieceKeys, ...affectedPieceKeys]);
    for (const pieceKey of movedKeys) addPieceWrite(writes, pieceKey, ["position", "activation", "status"]);
    const reactionRequirementsDeclared =
      (Object.prototype.hasOwnProperty.call(action.metadata || {}, "reactionResolutionRequirements") &&
        Object.prototype.hasOwnProperty.call(action.metadata || {}, "freeStrikeResolutionRequirements")) ||
      (typeof action.metadata?.freeStrikeRisk === "boolean" &&
        Array.isArray(action.metadata?.disengagingEnemyKeys));
    if (!reactionRequirementsDeclared) {
      completenessReasons.push("movement_reaction_requirements_not_declared");
    }
  }

  if (categorySet.has("attack")) {
    reads.add("global:board-occupancy");
    reads.add("global:terrain");
    reads.add("global:line-of-sight");
    reads.add("global:lifecycle-resource-collectors");
    writes.add("global:lifecycle-resource-collectors");
    writes.add("global:board-occupancy");
    enables.add("global:post-attack-windows");
    disables.add("global:post-attack-windows");
    addPieceWrite(writes, actorPieceKey, ["activation", "resource", "attack-sequence"]);
    if (targetIsPiece) addPieceWrite(writes, targetPieceKey, ["health", "alive", "status", "position", "resource"]);
    chanceReasons.push(`attack_resolution:${actionType}`);
  }

  if (categorySet.has("spell")) {
    reads.add("global:spell-effects");
    writes.add("global:spell-effects");
    addPieceWrite(writes, actorPieceKey, ["resource", "activation", "spell-sequence"]);
    if (targetIsPiece) addPieceWrite(writes, targetPieceKey, ["status", "health", "position", "resource"]);
    const plainOffensiveSpell = categorySet.has("attack") &&
      arrayValues(action.metadata?.specialRuleAnalysis?.unresolvedRuleKeys).length === 0 &&
      arrayValues(action.metadata?.unsupportedExecutableEffects).length === 0;
    const exactNoEffectSpell = action.metadata?.spellTextRegistryMapped === true &&
      action.metadata?.exactWithinScope === true &&
      arrayValues(action.metadata?.spellExecutableEffects).length === 0 &&
      arrayValues(action.metadata?.unsupportedExecutableEffects).length === 0 &&
      arrayValues(action.metadata?.sourceContractDiagnostics).length === 0 &&
      arrayValues(action.metadata?.specialRuleAnalysis?.unresolvedRuleKeys).length === 0;
    if (!plainOffensiveSpell && !exactNoEffectSpell) completenessReasons.push("spell_effect_requires_declared_search_footprint");
  }

  if (categorySet.has("resource")) {
    const resourcePieceKeys = collectNamedPieceKeys(action.metadata || {});
    resourcePieceKeys.add(actorPieceKey);
    if (targetIsPiece) resourcePieceKeys.add(targetPieceKey);
    for (const pieceKey of resourcePieceKeys) {
      if (!piecesByKey.has(pieceKey)) continue;
      addPieceRead(reads, pieceKey, ["resource", "status", "control"]);
      addPieceWrite(writes, pieceKey, ["resource"]);
    }
    reads.add("global:resource-ledger");
    writes.add("global:resource-ledger");
  }

  if (categorySet.has("scenario_score")) {
    reads.add("global:board-occupancy");
    reads.add("global:scenario-elements");
    reads.add("global:scenario-score");
    writes.add("global:scenario-score");
    writes.add("global:scenario-scoring-ledger");
    if (targetPieceKey) reads.add(`scenario-element:${targetPieceKey}`);
  }

  if (categorySet.has("phase")) {
    reads.add("global:activation-ledger");
    writes.add("global:activation-ledger");
    writes.add("global:active-side");
    writes.add("global:phase");
    writes.add("global:turn");
    for (const piece of pieces) addPieceWrite(writes, piece.pieceKey, ["activation", "turn-status"]);
  }

  if (actionType === "pass" || actionType === "activation_end" || /forfeit_activation/.test(actionType)) {
    for (const pieceKey of sortedUnique([actorPieceKey, ...unitPieceKeys])) addPieceWrite(writes, pieceKey, ["activation"]);
  }
  if (actionType === "stand_up_forfeit_combat") {
    addPieceWrite(writes, actorPieceKey, ["activation", "status"]);
  }
  if (actionType === "forfeit_normal_movement") {
    addPieceWrite(writes, actorPieceKey, ["activation", "status"]);
    writes.add("window:anyTimeActivationWindow");
    enables.add("window:anyTimeActivationWindow");
  }
  if (actionType === "unit_group_aim") {
    writes.add("global:activation-ledger");
    writes.add("window:unitActivationWindow");
    for (const pieceKey of sortedUnique([actorPieceKey, ...unitPieceKeys])) {
      addPieceWrite(writes, pieceKey, ["activation", "status"]);
    }
  }
  if (actionType === "end_unit_trooper_combat_action") {
    reads.add("global:activation-ledger");
    writes.add("global:activation-ledger");
    reads.add("window:unitActivationWindow");
    writes.add("window:unitActivationWindow");
    for (const pieceKey of sortedUnique([actorPieceKey, ...unitPieceKeys])) {
      addPieceRead(reads, pieceKey, ["activation", "status"]);
      addPieceWrite(writes, pieceKey, ["activation", "status"]);
    }
  }
  if (actionType === "use_feat") {
    addPieceWrite(writes, actorPieceKey, ["feat", "status"]);
    writes.add("global:continuous-effects");
    completenessReasons.push("feat_effect_requires_declared_search_footprint");
  }
  if (actionType === "revive_grunt" || actionType === "take_up_replacement") {
    if (targetIsPiece) addPieceWrite(writes, targetPieceKey, ["alive", "health", "position", "status"]);
    writes.add("global:board-occupancy");
  }
  if (actionType === "resolve_continuous_effect" || actionType === "hazard_damage") chanceReasons.push(`random_resolution:${actionType}`);

  for (const pieceKey of affectedPieceKeys) {
    addPieceRead(reads, pieceKey, ["alive", "position", "status", "resource"]);
    addPieceWrite(writes, pieceKey, ["alive", "position", "status", "resource", "health"]);
  }

  if (reactionRequirements.length || action.metadata?.freeStrikeRisk === true) {
    reactionReasons.push(reactionRequirements.length ? "declared_reaction_requirements" : "free_strike_risk");
    for (const pieceKey of reactionPieceKeys) {
      addPieceRead(reads, pieceKey, ["alive", "position", "status", "attack"]);
      addPieceWrite(writes, pieceKey, ["activation-window", "position", "resource"]);
    }
  }
  if (actionType === "reaction_attack" || actionType === "free_strike" || actionType === "support_fire") {
    reactionReasons.push(`reaction_action:${actionType}`);
  }

  if (metadataImpliesChance(action.metadata || {})) chanceReasons.push("metadata_random_or_roll_contract");

  const atomicEffects = collectAtomicEffects(action.metadata || {});
  for (const effect of atomicEffects) {
    const declaration = declaredSearchFootprint(effect);
    if (!declaration) {
      if (effect.atomKey === "grievous_wounds_direct_hit_tough_and_damage_removal_lock" &&
          (effect.hookKey === "attack_hit" || effect.primitive?.primitiveType === "status_transition_on_attack_hit")) {
        addPieceRead(reads, targetPieceKey, ["alive", "status"]);
        addPieceWrite(writes, targetPieceKey, ["status"]);
        continue;
      }
      if (effect.atomKey === "assault_successful_charge_ranged_sequence" &&
          effect.hookKey === "action_contribution") {
        reads.add("window:unitActivationWindow");
        writes.add("window:unitActivationWindow");
        enables.add("window:unitActivationWindow:assault");
        for (const pieceKey of sortedUnique([actorPieceKey, ...unitPieceKeys])) {
          addPieceRead(reads, pieceKey, ["alive", "activation", "position", "status"]);
          addPieceWrite(writes, pieceKey, ["activation", "attack-sequence"]);
        }
        continue;
      }
      completenessReasons.push(`unknown_atom_impact:${effect.atomKey || "anonymous"}:${effect.primitive?.primitiveType || effect.primitiveKey || effect.hookKey || "unknown"}`);
      continue;
    }
    for (const key of declaration.reads) reads.add(key);
    for (const key of declaration.writes) writes.add(key);
    for (const key of declaration.enables) enables.add(key);
    for (const key of declaration.disables) disables.add(key);
    if (declaration.chance) chanceReasons.push(`declared_atom_chance:${effect.atomKey}`);
    if (declaration.reaction) reactionReasons.push(`declared_atom_reaction:${effect.atomKey}`);
  }
  completenessReasons.push(...unresolvedMetadataReasons(action.metadata || {}));

  const normalizedCompletenessReasons = sortedUnique(completenessReasons);
  const wildcard = normalizedCompletenessReasons.length > 0;
  if (wildcard) {
    reads.add(WILDCARD);
    writes.add(WILDCARD);
    enables.add(WILDCARD);
    disables.add(WILDCARD);
  }

  return {
    schemaVersion: WARMACHINE_SEARCH_ACTION_FOOTPRINT_SCHEMA,
    contractVersion: WARMACHINE_SEARCH_DEPENDENCY_SCHEMA,
    actionKey,
    actionType,
    categories,
    activationGroupKey: activationGroupKey(actor),
    controlOwnerSideKey: String(action.decisionSideKey || actor.sideKey || state.activeSideKey || ""),
    actorPieceKeys: sortedUnique([actorPieceKey]),
    targetPieceKeys: sortedUnique(targetIsPiece ? [targetPieceKey] : []),
    affectedPieceKeys: sortedUnique(Array.from(affectedPieceKeys)),
    unitPieceKeys,
    reads: sortedUnique(Array.from(reads)),
    writes: sortedUnique(Array.from(writes)),
    enables: sortedUnique(Array.from(enables)),
    disables: sortedUnique(Array.from(disables)),
    chance: {
      required: chanceReasons.length > 0,
      reasons: sortedUnique(chanceReasons),
    },
    reaction: {
      required: reactionReasons.length > 0,
      reasons: sortedUnique(reactionReasons),
      pieceKeys: sortedUnique(Array.from(reactionPieceKeys)),
    },
    wildcard,
    conservativeComplete: !wildcard,
    completenessReasons: normalizedCompletenessReasons,
    claimBoundary: "This contract is descriptive only; it does not enable stubborn-set or any hard pruning.",
  };
}

function intersection(left = [], right = []) {
  const rightSet = new Set(right);
  return sortedUnique(left.filter((key) => rightSet.has(key)));
}

function mutationKeys(footprint = {}) {
  return sortedUnique([
    ...arrayValues(footprint.writes),
    ...arrayValues(footprint.enables),
    ...arrayValues(footprint.disables),
  ]);
}

export function evaluateWarmachineSearchActionIndependence(left = {}, right = {}) {
  const reasons = [];
  const conflicts = [];
  const addConflicts = (kind, keys) => {
    for (const key of keys) conflicts.push({ kind, key });
  };

  if (left.schemaVersion !== WARMACHINE_SEARCH_ACTION_FOOTPRINT_SCHEMA) reasons.push("left_not_search_footprint_v1");
  if (right.schemaVersion !== WARMACHINE_SEARCH_ACTION_FOOTPRINT_SCHEMA) reasons.push("right_not_search_footprint_v1");
  if (left.conservativeComplete !== true) reasons.push("left_footprint_incomplete");
  if (right.conservativeComplete !== true) reasons.push("right_footprint_incomplete");
  if (left.wildcard === true || arrayValues(left.reads).includes(WILDCARD) || arrayValues(left.writes).includes(WILDCARD)) reasons.push("left_wildcard");
  if (right.wildcard === true || arrayValues(right.reads).includes(WILDCARD) || arrayValues(right.writes).includes(WILDCARD)) reasons.push("right_wildcard");
  if (!left.activationGroupKey) reasons.push("left_activation_group_unknown");
  if (!right.activationGroupKey) reasons.push("right_activation_group_unknown");
  if (!left.controlOwnerSideKey) reasons.push("left_control_owner_unknown");
  if (!right.controlOwnerSideKey) reasons.push("right_control_owner_unknown");
  if (left.controlOwnerSideKey && right.controlOwnerSideKey && left.controlOwnerSideKey !== right.controlOwnerSideKey) {
    reasons.push("different_control_owners_require_game_por_proof");
  }
  if (left.activationGroupKey && left.activationGroupKey === right.activationGroupKey) reasons.push("same_activation_group");
  if (left.chance?.required === true) reasons.push("left_has_chance");
  if (right.chance?.required === true) reasons.push("right_has_chance");
  if (left.reaction?.required === true) reasons.push("left_has_reaction");
  if (right.reaction?.required === true) reasons.push("right_has_reaction");

  const leftMutations = mutationKeys(left);
  const rightMutations = mutationKeys(right);
  addConflicts("left_write_right_read", intersection(leftMutations, arrayValues(right.reads)));
  addConflicts("right_write_left_read", intersection(rightMutations, arrayValues(left.reads)));
  addConflicts("write_write", intersection(leftMutations, rightMutations));
  if (conflicts.length) reasons.push("dependency_key_conflict");

  const normalizedReasons = sortedUnique(reasons);
  return {
    schemaVersion: WARMACHINE_SEARCH_ACTION_INDEPENDENCE_SCHEMA,
    contractVersion: WARMACHINE_SEARCH_DEPENDENCY_SCHEMA,
    leftActionKey: String(left.actionKey || ""),
    rightActionKey: String(right.actionKey || ""),
    independent: normalizedReasons.length === 0,
    reasons: normalizedReasons,
    conflicts,
    claimBoundary: "independent=true is a contract result only; no search pruning is enabled by this module.",
  };
}
