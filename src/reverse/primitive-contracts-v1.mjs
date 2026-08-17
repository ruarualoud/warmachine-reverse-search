import { createHash } from "node:crypto";

import {
  recognizedWarmachineRuleAtoms,
  warmachineRuleAtomSourceContractStatus,
} from "../warmachine-host-runtime.mjs";

export const WARMACHINE_REVERSE_PRIMITIVE_CONTRACT_SCHEMA =
  "warmachine_reverse_primitive_contract_registry_v1";

const HOOK_REVERSE_CONTRACTS = Object.freeze({
  action_contribution: ["action_generation", "action_source_precondition"],
  targeting_validation: ["attack_legality", "targeting_precondition"],
  attack_participation_validation: ["attack_legality", "participation_precondition"],
  attack_sequence_validation: ["attack_legality", "sequence_precondition"],
  attack_range_modifier: ["attack_numeric_bound", "range_bound_precondition"],
  attack_modifier: ["attack_numeric_bound", "attack_roll_bound_precondition"],
  attack_hit: ["post_hit_branch", "hit_outcome_precondition"],
  attack_resolved: ["post_attack_branch", "resolved_attack_precondition"],
  damage_modifier: ["damage_numeric_bound", "damage_bound_precondition"],
  damage_applied: ["post_damage_branch", "positive_or_resolved_damage_precondition"],
  damage_removal_validation: ["damage_lifecycle", "damage_removal_precondition"],
  model_disabled: ["damage_lifecycle", "disabled_stage_precondition"],
  model_boxed: ["damage_lifecycle", "boxed_stage_precondition"],
  model_destroyed: ["damage_lifecycle", "destroyed_stage_precondition"],
  model_exploded: ["damage_lifecycle", "exploded_stage_precondition"],
  tough_validation: ["damage_lifecycle", "tough_resolution_precondition"],
  knockdown_prevention: ["status_transition", "knockdown_transition_precondition"],
  movement_allowance: ["movement_numeric_bound", "movement_allowance_precondition"],
  movement_cost: ["movement_numeric_bound", "movement_cost_precondition"],
  movement_validation: ["movement_legality", "movement_path_precondition"],
  movement_contact: ["movement_contact_branch", "base_contact_precondition"],
  after_move: ["movement_contact_branch", "completed_movement_precondition"],
  piece_geometry: ["geometry_state", "piece_geometry_precondition"],
  candidate_finalize: ["action_parameterization", "candidate_parameter_precondition"],
  activation_start: ["timing_transition", "activation_start_precondition"],
  activation_end: ["timing_transition", "activation_end_precondition"],
  control_phase_start: ["timing_transition", "control_phase_start_precondition"],
  turn_start: ["timing_transition", "turn_start_precondition"],
  turn_end: ["timing_transition", "turn_end_precondition"],
  source_leave_play: ["source_lifecycle", "source_leave_play_precondition"],
  roster_attachment_validation: ["roster_legality", "attachment_precondition"],
});

const GENERIC_SYMBOLIC_REGRESSION_PRIMITIVES = new Set([
  "combat_action_token_additional_attack",
  "combat_action_model_rfp_additional_melee_attack",
  "grant_attack_window_on_destroy",
  "grant_same_weapon_attack_window_after_hit",
  "grant_ranged_attack_window_after_hit",
  "grant_movement_window_on_destroy",
  "grant_movement_window_after_attack_resolved",
  "optional_push_follow_after_basic_attack",
  "status_on_hit",
  "soul_token_claim_on_destroy",
  "activation_sequence_contribution",
  "grant_action_window_on_destroy",
  "explosion_secondary_damage_batch_then_remove_source",
  "secondary_damage_batch_then_remove_boxed_model",
  "secondary_damage_on_direct_basic_attack_hit",
]);

const TERMINAL_CONSTRAINT_PRIMITIVES = new Set([
  "attack_targeting_override",
]);

export function warmachineStatusOnHitSupportsTerminalRegression(hook = {}) {
  const parameters = hook.parameters || {};
  const properties = parameters.statusProperties || {};
  const tags = [parameters.statusTag, ...(parameters.statusTags || [])].map(String).join(" ");
  return Number(properties.defenseDelta || 0) < 0 || Number.isFinite(Number(properties.setBaseDefense)) ||
    properties.spellAutoHit === true || properties.stealthSuppressed === true ||
    properties.toughDisabled === true || properties.cannotRemoveDamage === true ||
    properties.targetDoesNotBlockLineOfSight === true ||
    /stationary|knocked_down|grievous|tough_disabled|cannot_remove_damage/.test(tags);
}

export function warmachineActivationSequenceSupportsTerminalRegression(hook = {}) {
  const parameters = hook.parameters || {};
  return Number(parameters.attacksPerEligibleModel || 0) > 0 && (
    Number(parameters.maximumGrantedAttacks || 0) > 0 ||
    String(parameters.sequenceKind || "").includes("assault")
  );
}

export function warmachineDestroyActionWindowSupportsTerminalRegression(hook = {}) {
  return String(hook.parameters?.grantedActionKind || "") === "melee_attack";
}

export function warmachineExplosionSupportsTerminalRegression(hook = {}) {
  const parameters = hook.parameters || {};
  return Array.isArray(parameters.triggerKinds) && parameters.triggerKinds.length > 0 &&
    Number.isFinite(Number(parameters.targetRangeIn)) && Number(parameters.targetRangeIn) >= 0 &&
    Number.isFinite(Number(parameters.damagePower)) && Number(parameters.damagePower) > 0 &&
    Number.isFinite(Number(parameters.damageDiceCount)) && Number(parameters.damageDiceCount) > 0 &&
    ["all_models", "all_other_models", "enemy_models"].includes(
      String(parameters.targetAllegiance || ""),
    );
}

export function warmachineBridgeSecondaryDamageSupportsTerminalRegression(hook = {}) {
  const parameters = hook.parameters || {};
  return Number.isFinite(Number(parameters.targetRangeIn)) && Number(parameters.targetRangeIn) >= 0 &&
    Number.isFinite(Number(parameters.damagePower)) && Number(parameters.damagePower) > 0 &&
    Number.isFinite(Number(parameters.damageDiceCount)) && Number(parameters.damageDiceCount) > 0 &&
    Boolean(parameters.targetSelection);
}

function genericSymbolicRegressionSupportsHook(hook = {}) {
  const primitiveKey = String(hook.primitiveKey || "");
  if (!GENERIC_SYMBOLIC_REGRESSION_PRIMITIVES.has(primitiveKey)) return false;
  if (primitiveKey === "grant_movement_window_after_attack_resolved") {
    return String(hook.parameters?.movedModelScope || "actor") !== "target";
  }
  if (primitiveKey === "status_on_hit") return warmachineStatusOnHitSupportsTerminalRegression(hook);
  if (primitiveKey === "activation_sequence_contribution") {
    return warmachineActivationSequenceSupportsTerminalRegression(hook);
  }
  if (primitiveKey === "grant_action_window_on_destroy") {
    return warmachineDestroyActionWindowSupportsTerminalRegression(hook);
  }
  if (primitiveKey === "explosion_secondary_damage_batch_then_remove_source") {
    return warmachineExplosionSupportsTerminalRegression(hook);
  }
  if (["secondary_damage_batch_then_remove_boxed_model",
    "secondary_damage_on_direct_basic_attack_hit"].includes(primitiveKey)) {
    return warmachineBridgeSecondaryDamageSupportsTerminalRegression(hook);
  }
  return true;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableHash(value, length = 24) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex").slice(0, length);
}

function exactSourceMatch(atom = {}, piece = {}) {
  if (!piece?.pieceKey) return false;
  const status = warmachineRuleAtomSourceContractStatus(atom, piece);
  return status.ok === true && [
    "source_id_and_text_matched",
    "source_id_matched",
    "source_text_matched",
  ].includes(String(status.status || ""));
}

function hookApplicabilityForGoal(operatorFamily = "", goalType = "", sourceRole = "") {
  if (goalType === "scenario_score") {
    return sourceRole === "actor" && [
      "action_generation",
      "movement_numeric_bound",
      "movement_legality",
      "movement_contact_branch",
      "geometry_state",
      "action_parameterization",
      "timing_transition",
      "source_lifecycle",
    ].includes(operatorFamily);
  }
  if (goalType === "assassination") {
    if (sourceRole === "actor") return operatorFamily !== "roster_legality";
    return [
      "attack_legality",
      "attack_numeric_bound",
      "post_hit_branch",
      "post_attack_branch",
      "damage_numeric_bound",
      "post_damage_branch",
      "damage_lifecycle",
      "status_transition",
      "geometry_state",
      "timing_transition",
      "source_lifecycle",
    ].includes(operatorFamily);
  }
  return false;
}

function numericBoundDescriptor(operatorFamily = "", hook = {}) {
  if (!["attack_numeric_bound", "damage_numeric_bound", "movement_numeric_bound"].includes(operatorFamily)) {
    return null;
  }
  const parameters = hook.parameters || {};
  const fixedAmount = Number(parameters.amount);
  const parameterMode = Number.isFinite(fixedAmount) ? "fixed_delta"
    : parameters.amountContextPath ? "strict_context_delta"
      : Array.isArray(parameters.amountByThresholds) ? "piecewise_threshold_delta"
        : parameters.damageResolutionModel ? "damage_resolution_model"
          : parameters.automaticBoostedHit || parameters.automaticBoostedDamage ? "automatic_boost"
            : parameters.memoryKind ? "state_memory_automatic_hit"
              : parameters.ignoreRoughTerrain || parameters.treatOpenTerrainAsRoughTerrain ? "terrain_cost_override"
                : parameters.suppressionScope || Array.isArray(parameters.suppressedDamageTypes)
                  ? "conditional_damage_suppression"
                  : "structured_parameter_bound";
  return {
    schemaVersion: "warmachine_reverse_numeric_bound_descriptor_v1",
    boundDomain: operatorFamily === "attack_numeric_bound" ? "attack_success"
      : operatorFamily === "damage_numeric_bound" ? "damage_resolution"
        : "movement_reachability",
    parameterMode,
    fixedAmount: Number.isFinite(fixedAmount) ? fixedAmount : null,
    amountContextPath: String(parameters.amountContextPath || ""),
    amountByThresholds: parameters.amountByThresholds || [],
    damageResolutionModel: String(parameters.damageResolutionModel || ""),
    maximumSourceDistanceIn: Number.isFinite(Number(parameters.maxDistanceIn))
      ? Number(parameters.maxDistanceIn) : null,
    conditionalApplicability: Boolean(hook.applicabilityPredicate || hook.predicate ||
      (hook.requiredContextKeys || []).length || parameters.requireSourceInRange || parameters.requiresAim),
    strictContextEvaluationRequired: true,
    optimisticBoundOnlyUntilStrictContext: true,
  };
}

export function buildWarmachineReverseHookOperator(atom = {}, hook = {}) {
  const contract = HOOK_REVERSE_CONTRACTS[hook.hookKey] || null;
  const explicitRegression = atom.reverseRegression || null;
  const boundDescriptor = numericBoundDescriptor(contract?.[0] || "", hook);
  const maturity = explicitRegression?.regressionKind
    ? "explicit_symbolic_operator"
    : genericSymbolicRegressionSupportsHook(hook)
      ? "generic_symbolic_operator"
      : TERMINAL_CONSTRAINT_PRIMITIVES.has(String(hook.primitiveKey || ""))
        ? "terminal_constraint_operator"
        : boundDescriptor
          ? "conservative_bound_operator"
          : contract
            ? "typed_obligation_only"
            : "unknown_fail_closed";
  const row = {
    schemaVersion: "warmachine_reverse_hook_operator_v1",
    atomKey: String(atom.atomKey || ""),
    atomVersion: Number(atom.atomVersion || 1),
    ruleName: String(atom.ruleName || ""),
    hookKey: String(hook.hookKey || ""),
    primitiveKey: String(hook.primitiveKey || ""),
    operatorFamily: contract?.[0] || "unknown",
    predecessorObligationKind: contract?.[1] || "unknown_fail_closed",
    requiredContextKeys: [...(hook.requiredContextKeys || [])].sort(),
    applicabilityPredicate: hook.applicabilityPredicate || null,
    predicate: hook.predicate || null,
    parameters: hook.parameters || {},
    boundDescriptor,
    maturity,
    explicitRegressionKind: String(explicitRegression?.regressionKind || ""),
    strictForwardWitnessRequired: true,
    hardPruningEnabled: false,
  };
  row.operatorKey = `reverse-hook-${stableHash(row)}`;
  return row;
}

let registryCache = null;

export function buildWarmachineReversePrimitiveContractRegistry() {
  if (registryCache) return registryCache;
  const atoms = recognizedWarmachineRuleAtoms();
  const operators = atoms.flatMap((atom) => (atom.hooks || [])
    .map((hook) => buildWarmachineReverseHookOperator(atom, hook)));
  const primitiveRows = Array.from(operators.reduce((map, operator) => {
    if (!map.has(operator.primitiveKey)) map.set(operator.primitiveKey, []);
    map.get(operator.primitiveKey).push(operator);
    return map;
  }, new Map()), ([primitiveKey, rows]) => ({
    primitiveKey,
    hookKeys: Array.from(new Set(rows.map((row) => row.hookKey))).sort(),
    operatorFamilies: Array.from(new Set(rows.map((row) => row.operatorFamily))).sort(),
    atomCount: new Set(rows.map((row) => row.atomKey)).size,
    hookOperatorCount: rows.length,
    explicitSymbolicOperatorCount: rows.filter((row) => row.maturity === "explicit_symbolic_operator").length,
    genericSymbolicOperatorCount: rows.filter((row) => row.maturity === "generic_symbolic_operator").length,
    terminalConstraintOperatorCount: rows.filter((row) => row.maturity === "terminal_constraint_operator").length,
    conservativeBoundOperatorCount: rows.filter((row) => row.maturity === "conservative_bound_operator").length,
    typedObligationOnlyCount: rows.filter((row) => row.maturity === "typed_obligation_only").length,
    unknownFailClosedCount: rows.filter((row) => row.maturity === "unknown_fail_closed").length,
  })).sort((left, right) => left.primitiveKey.localeCompare(right.primitiveKey));
  const unknown = operators.filter((operator) => operator.maturity === "unknown_fail_closed");
  registryCache = {
    schemaVersion: WARMACHINE_REVERSE_PRIMITIVE_CONTRACT_SCHEMA,
    registryKey: `reverse-primitive-registry-${stableHash(operators.map((operator) => operator.operatorKey), 32)}`,
    counts: {
      atomCount: atoms.length,
      hookOperatorCount: operators.length,
      primitiveCount: primitiveRows.length,
      hookKeyCount: new Set(operators.map((operator) => operator.hookKey)).size,
      typedHookOperatorCount: operators.length - unknown.length,
      explicitSymbolicOperatorCount: operators.filter((operator) =>
        operator.maturity === "explicit_symbolic_operator").length,
      genericSymbolicOperatorCount: operators.filter((operator) =>
        operator.maturity === "generic_symbolic_operator").length,
      terminalConstraintOperatorCount: operators.filter((operator) =>
        operator.maturity === "terminal_constraint_operator").length,
      conservativeBoundOperatorCount: operators.filter((operator) =>
        operator.maturity === "conservative_bound_operator").length,
      typedObligationOnlyCount: operators.filter((operator) =>
        operator.maturity === "typed_obligation_only").length,
      unknownFailClosedCount: unknown.length,
    },
    primitiveRows,
    operators,
    unknownOperators: unknown,
    fullTypedObligationCoverage: unknown.length === 0,
    fullStrictExecutablePredecessorCoverage: operators.length > 0 && operators.every((operator) =>
      operator.maturity === "explicit_symbolic_operator"),
    claimBoundary: "A typed primitive obligation records where an executed effect came from and which predecessor class must be proved. Generic and explicit symbolic operators can generate predecessor obligations, while terminal-constraint operators only preserve exact applicability predicates; none is an inverse rules state or executable proof until strict forward replay succeeds.",
  };
  return registryCache;
}

export function buildWarmachineTerminalReverseOperatorScope(state = {}, template = {}) {
  const registry = buildWarmachineReversePrimitiveContractRegistry();
  const actor = (state.pieces || []).find((piece) => piece.pieceKey === template.attackerPieceKey) || null;
  const target = (state.pieces || []).find((piece) => piece.pieceKey === template.targetPieceKey) || null;
  const piecesByRole = [["actor", actor], ["target", target]].filter((entry) => entry[1]);
  const scoped = [];
  for (const atom of recognizedWarmachineRuleAtoms()) {
    for (const [sourceRole, piece] of piecesByRole) {
      if (!exactSourceMatch(atom, piece)) continue;
      for (const hook of atom.hooks || []) {
        const operator = buildWarmachineReverseHookOperator(atom, hook);
        if (!hookApplicabilityForGoal(operator.operatorFamily, template.goalType, sourceRole)) continue;
        scoped.push({
          ...operator,
          sourceRole,
          sourcePieceKey: piece.pieceKey,
        });
      }
    }
  }
  const operators = Array.from(new Map(scoped.map((operator) => [
    `${operator.operatorKey}|${operator.sourceRole}|${operator.sourcePieceKey}`,
    operator,
  ])).values()).sort((left, right) =>
    left.sourceRole.localeCompare(right.sourceRole) ||
    left.operatorFamily.localeCompare(right.operatorFamily) ||
    left.operatorKey.localeCompare(right.operatorKey));
  return {
    schemaVersion: "warmachine_terminal_reverse_operator_scope_v1",
    scopeKey: `terminal-reverse-scope-${stableHash({
      templateKey: template.templateKey || "",
      operators: operators.map((operator) => [operator.operatorKey, operator.sourceRole, operator.sourcePieceKey]),
    })}`,
    templateKey: String(template.templateKey || ""),
    goalType: String(template.goalType || ""),
    actorPieceKey: String(template.attackerPieceKey || ""),
    targetPieceKey: String(template.targetPieceKey || ""),
    operators,
    counts: {
      relevantHookOperatorCount: operators.length,
      explicitSymbolicOperatorCount: operators.filter((operator) =>
        operator.maturity === "explicit_symbolic_operator").length,
      genericSymbolicOperatorCount: operators.filter((operator) =>
        operator.maturity === "generic_symbolic_operator").length,
      terminalConstraintOperatorCount: operators.filter((operator) =>
        operator.maturity === "terminal_constraint_operator").length,
      conservativeBoundOperatorCount: operators.filter((operator) =>
        operator.maturity === "conservative_bound_operator").length,
      typedObligationOnlyCount: operators.filter((operator) =>
        operator.maturity === "typed_obligation_only").length,
      unknownFailClosedCount: operators.filter((operator) =>
        operator.maturity === "unknown_fail_closed").length,
    },
    registryCoverage: {
      registryKey: registry.registryKey,
      counts: registry.counts,
      fullTypedObligationCoverage: registry.fullTypedObligationCoverage,
      fullStrictExecutablePredecessorCoverage: registry.fullStrictExecutablePredecessorCoverage,
    },
    strictForwardWitnessRequired: true,
    claimBoundary: registry.claimBoundary,
  };
}
