import { createHash } from "node:crypto";

import {
  recognizedWarmachineRuleAtoms,
  warmachineRuleAtomSourceContractStatus,
} from "../warmachine-host-runtime.mjs";
import {
  buildWarmachineKillingSpreeRelationCell,
  quotientWarmachineReverseAlternatives,
} from "./spatial-quotient-v1.mjs";
import {
  warmachineActivationSequenceSupportsTerminalRegression,
  warmachineBridgeSecondaryDamageSupportsTerminalRegression,
  warmachineDestroyActionWindowSupportsTerminalRegression,
  warmachineExplosionSupportsTerminalRegression,
  warmachineStatusOnHitSupportsTerminalRegression,
} from "./primitive-contracts-v1.mjs";

export const WARMACHINE_REVERSE_RULE_REGRESSION_SCHEMA = "warmachine_reverse_rule_regression_v1";

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function stableHash(value, length = 24) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, length);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function alive(piece = {}) {
  return piece.destroyed !== true && piece.removedFromPlay !== true && piece.offTable !== true &&
    numeric(piece.damage?.boxesRemaining ?? piece.boxesRemaining, 1) > 0;
}

function textOf(value = {}) {
  return [
    value.ruleKey,
    value.name,
    value.ruleName,
    value.description,
    value.text,
    ...(value.advantages || []),
    ...(value.statusTags || []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function pieceHasTough(piece = {}) {
  return /\btough\b/.test([
    textOf(piece),
    ...(piece.specialRules || []).map(textOf),
    ...(piece.abilities || []).map(textOf),
  ].join(" "));
}

function meleeRangeIn(piece = {}, profile = {}) {
  return Math.max(0, numeric(profile.rangeIn ?? profile.rng, numeric(piece.meleeRangeIn, 1)));
}

function exactSourceMatch(atom = {}, actor = {}) {
  const status = warmachineRuleAtomSourceContractStatus(atom, actor);
  return status.ok === true && ["source_id_and_text_matched", "source_id_matched", "source_text_matched"]
    .includes(String(status.status || ""));
}

function directAlternative(template = {}) {
  return {
    alternativeKey: `direct-${stableHash({ templateKey: template.templateKey || "", actor: template.attackerPieceKey, target: template.targetPieceKey })}`,
    predecessorKind: "direct_terminal_attack",
    terminalActionKind: template.attackMode || template.attackProfile?.mode || "attack",
    actorPieceKey: template.attackerPieceKey || "",
    terminalTargetPieceKey: template.targetPieceKey || "",
    strictForwardWitnessRequired: true,
    claimBoundary: "The terminal action still requires a concrete strict predecessor state.",
  };
}

function killingSpreeAlternatives(state = {}, template = {}, actor = {}, atom = {}, rawOptions = {}) {
  const regression = atom.reverseRegression || {};
  const terminalTarget = (state.pieces || []).find((piece) => piece.pieceKey === template.targetPieceKey) || null;
  const allCandidates = (state.pieces || []).filter((piece) =>
    alive(piece) && piece.sideKey !== actor.sideKey && piece.pieceKey !== terminalTarget?.pieceKey);
  const limit = Math.max(0, Math.floor(numeric(rawOptions.maximumBridgeCandidates, 32)));
  const selectedCandidates = allCandidates.slice().sort((left, right) =>
    numeric(left.damage?.boxesRemaining ?? left.boxesRemaining, 1) -
      numeric(right.damage?.boxesRemaining ?? right.boxesRemaining, 1) ||
    left.pieceKey.localeCompare(right.pieceKey)).slice(0, limit);
  const terminalRangeIn = meleeRangeIn(actor, template.attackProfile || {});
  const predecessorRangeIn = maximumKnownAttackRangeIn(actor, "melee", template.attackProfile || {}) ??
    terminalRangeIn;
  const maximumMovementIn = Math.max(0, numeric(regression.maximumMovementIn, 1));
  return {
    alternatives: selectedCandidates.map((bridgeTarget) => {
      const targetHasTough = pieceHasTough(bridgeTarget);
      const identity = {
        templateKey: template.templateKey || "",
        atomKey: atom.atomKey,
        bridgeTargetPieceKey: bridgeTarget.pieceKey,
      };
      const alternative = {
        alternativeKey: `rule-regression-${stableHash(identity)}`,
        predecessorKind: "killing_spree_destroy_advance_additional_melee",
        sourceAtomKey: atom.atomKey,
        sourceRuleName: atom.ruleName,
        actorPieceKey: actor.pieceKey,
        bridgeTargetPieceKey: bridgeTarget.pieceKey,
        terminalTargetPieceKey: terminalTarget?.pieceKey || template.targetPieceKey || "",
        effectToPreconditions: [
          "prior_melee_combat_action_attack_resolves",
          "prior_attack_destroys_one_or_more_enemy_models",
          "bridge_target_reaches_destroyed_after_disabled_boxed_replacement_and_tough",
          "actor_has_legal_zero_to_one_inch_advance_landing",
          "terminal_target_is_legal_for_mandatory_additional_melee_from_landing",
        ],
        previousActorPositionConstraint: {
          bridgeTargetMaximumEdgeDistanceIn: predecessorRangeIn,
          predecessorAttackKind: "melee",
          predecessorAttackRangePolicy: "maximum_declared_melee_profile_then_strict_source_profile",
          terminalTargetMaximumEdgeDistanceBeforeAdvanceIn: terminalRangeIn + maximumMovementIn,
          terminalTargetMaximumEdgeDistanceAfterAdvanceIn: terminalRangeIn,
          maximumAdvanceIn: maximumMovementIn,
          exactCoordinateKnown: false,
          geometryMeaning: "The previous actor position must be in the intersection of the bridge-target melee region and the terminal-target melee region expanded by the Killing Spree advance.",
        },
        damageLifecycleObligation: {
          requiredFinalStage: "destroyed",
          targetHasTough,
          toughBranchRequirement: targetHasTough ? "tough_fails_or_is_denied" : "not_applicable",
          disabledAndBoxedReplacementsMustBeResolved: true,
          removedFromPlayWithoutDestroyedIsInsufficient: true,
        },
        sequence: [
          "prior_melee_combat_action_attack",
          "bridge_enemy_destroyed_after_attack_resolves",
          "optional_advance_zero_to_one_inch",
          "mandatory_additional_melee_attack",
          "terminal_outcome",
        ],
        recursivePredecessorAvailable: regression.recursive === true,
        strictForwardWitnessRequired: true,
        claimBoundary: regression.proofBoundary ||
          "This is an abstract causal predecessor; strict forward replay must prove the victim, lifecycle, landing, target, and recursion.",
      };
      alternative.spatialRelationCell = buildWarmachineKillingSpreeRelationCell(state, {
        actorPieceKey: actor.pieceKey,
        bridgeTargetPieceKey: bridgeTarget.pieceKey,
        terminalTargetPieceKey: terminalTarget?.pieceKey || template.targetPieceKey || "",
        meleeRangeIn: predecessorRangeIn,
        maximumAdvanceIn: maximumMovementIn,
      });
      return alternative;
    }),
    totalCandidateCount: allCandidates.length,
    selectedCandidateCount: selectedCandidates.length,
    remainingCandidateCount: Math.max(0, allCandidates.length - selectedCandidates.length),
  };
}

function attackMode(template = {}) {
  return String(template.attackMode || template.attackProfile?.mode || "").toLowerCase();
}

function declaredAttackProfiles(actor = {}) {
  const direct = [
    ...(actor.attackProfiles || []),
    ...(actor.weaponProfiles || []),
    ...(actor.cardSnapshot?.attackProfiles || []),
    ...(actor.cardSnapshot?.weaponProfiles || []),
  ];
  const weaponProfiles = [...(actor.weapons || []), ...(actor.cardSnapshot?.weapons || [])]
    .flatMap((weapon) => [weapon, ...(weapon?.profiles || [])]);
  return [...direct, ...weaponProfiles].filter((profile) => profile && typeof profile === "object");
}

function maximumKnownAttackRangeIn(actor = {}, mode = "", terminalProfile = {}) {
  const normalizedMode = String(mode || "").toLowerCase();
  const candidates = declaredAttackProfiles(actor)
    .filter((profile) => String(profile.mode || profile.attackMode || profile.weaponType || "").toLowerCase()
      .includes(normalizedMode))
    .map((profile) => numeric(profile.rangeIn ?? profile.rng ?? profile.range, NaN))
    .filter(Number.isFinite);
  if (String(terminalProfile.mode || "").toLowerCase() === normalizedMode) {
    const terminalRange = numeric(terminalProfile.rangeIn ?? terminalProfile.rng, NaN);
    if (Number.isFinite(terminalRange)) candidates.push(terminalRange);
  }
  const summaryRange = normalizedMode === "melee"
    ? numeric(actor.meleeRangeIn, NaN)
    : normalizedMode === "ranged"
      ? numeric(actor.rangedRangeIn ?? actor.rangedRange, NaN)
      : NaN;
  if (Number.isFinite(summaryRange)) candidates.push(summaryRange);
  return candidates.length ? Math.max(0, ...candidates) : null;
}

function additionalAttackResourceAlternative(template = {}, actor = {}, atom = {}, hook = {}) {
  const parameters = hook.parameters || {};
  const mode = attackMode(template);
  const primitiveKey = String(hook.primitiveKey || "");
  if (primitiveKey === "combat_action_token_additional_attack" &&
    String(parameters.attackKind || "").toLowerCase() !== mode) return null;
  if (primitiveKey === "combat_action_model_rfp_additional_melee_attack" && mode !== "melee") return null;
  const tokenKinds = (parameters.tokenKinds || []).map(String).sort();
  const sacrificeModelKind = String(parameters.sacrificeModelKind || "");
  const identity = {
    templateKey: template.templateKey || "",
    atomKey: atom.atomKey,
    primitiveKey,
  };
  return {
    alternativeKey: `rule-regression-${stableHash(identity)}`,
    predecessorKind: primitiveKey === "combat_action_token_additional_attack"
      ? "token_funded_additional_terminal_attack"
      : "model_rfp_funded_additional_terminal_attack",
    sourceAtomKey: atom.atomKey,
    sourceRuleName: atom.ruleName,
    sourcePrimitiveKey: primitiveKey,
    actorPieceKey: actor.pieceKey,
    terminalTargetPieceKey: template.targetPieceKey || "",
    terminalActionKind: mode,
    terminalTargetMayHavePriorDamage: true,
    effectToPreconditions: [
      "same_actor_combat_action_active",
      "relevant_initial_attack_sequence_completed",
      primitiveKey === "combat_action_token_additional_attack"
        ? "declared_resource_token_available_and_spent"
        : "eligible_friendly_same_unit_grunt_available_and_removed_from_play",
      "terminal_target_and_weapon_remain_legal_for_additional_attack",
    ],
    actionSequenceObligation: {
      duringCombatActionOnly: parameters.duringCombatActionOnly !== false,
      requiresCompletedInitialAttackSequence: parameters.requiresCompletedInitialAttackSequence !== false,
      attackKind: mode,
      sourceWeaponOnly: parameters.sourceWeaponOnly === true,
      maximumAdditionalAttacks: numeric(parameters.maximumAdditionalAttacks, 0),
    },
    resourceObligation: primitiveKey === "combat_action_token_additional_attack" ? {
      paymentKind: "resource_token_spend",
      tokenKinds,
      tokenCostPerAttack: Math.max(1, numeric(parameters.tokenCostPerAttack, 1)),
      attacksGrantedPerPayment: Math.max(1, numeric(parameters.attacksGrantedPerToken, 1)),
      paymentEventType: String(parameters.tokenSpendEventType || ""),
    } : {
      paymentKind: "friendly_model_removed_from_play",
      sacrificeRelation: String(parameters.sacrificeRelation || "friendly"),
      sacrificeFactionScope: String(parameters.sacrificeFactionScope || "same_faction"),
      sacrificeModelKind,
      sacrificeMustShareUnitWithActor: parameters.sacrificeMustShareUnitWithActor === true,
      preventsDisabledBoxedDestroyed: parameters.preventsDisabledBoxedDestroyed === true,
      preventsResourceCollection: parameters.preventsResourceCollection === true,
      paymentEventType: String(parameters.sacrificeEventType || ""),
    },
    sequence: [
      "combat_action_initial_attack_sequence",
      "resource_or_model_payment",
      "additional_terminal_attack",
      "terminal_outcome",
    ],
    strictForwardWitnessRequired: true,
    claimBoundary: "The primitive contract proves the additional-attack payment shape only. A strict forward replay must prove the combat window, eligible payment source, target, weapon, attack, lifecycle, and chance result.",
  };
}

function generatedAttackAlternatives(state = {}, template = {}, actor = {}, atom = {}, hook = {}, rawOptions = {}) {
  const primitiveKey = String(hook.primitiveKey || "");
  const parameters = hook.parameters || {};
  const mode = attackMode(template);
  const terminalRangeIn = meleeRangeIn(actor, template.attackProfile || {});
  if (primitiveKey === "grant_attack_window_on_destroy" && mode !== "ranged") return null;
  if (primitiveKey === "grant_same_weapon_attack_window_after_hit" && mode !== "melee") return null;
  if (primitiveKey === "grant_ranged_attack_window_after_hit" && mode !== "ranged") return null;
  if (primitiveKey === "grant_same_weapon_attack_window_after_hit") {
    return {
      alternatives: [{
        alternativeKey: `rule-regression-${stableHash({
          templateKey: template.templateKey || "",
          atomKey: atom.atomKey,
          primitiveKey,
        })}`,
        predecessorKind: "critical_hit_same_target_additional_terminal_attack",
        sourceAtomKey: atom.atomKey,
        sourceRuleName: atom.ruleName,
        sourcePrimitiveKey: primitiveKey,
        actorPieceKey: actor.pieceKey,
        predecessorTargetPieceKey: template.targetPieceKey || "",
        terminalTargetPieceKey: template.targetPieceKey || "",
        terminalActionKind: mode,
        terminalTargetMayHavePriorDamage: true,
        effectToPreconditions: [
          "prior_same_weapon_attack_hits_terminal_target",
          "prior_attack_is_critical_during_combat_action",
          "terminal_target_survives_prior_attack",
          "optional_same_weapon_additional_attack_is_selected",
        ],
        previousActorPositionConstraint: {
          predecessorTargetMaximumEdgeDistanceIn: terminalRangeIn,
          terminalTargetMaximumEdgeDistanceBeforeAdvanceIn: terminalRangeIn,
          maximumAdvanceIn: 0,
          exactCoordinateKnown: false,
        },
        predecessorChanceObligation: {
          requiredOutcome: "critical_hit",
          exactChanceMassRequired: true,
        },
        actionSequenceObligation: {
          duringCombatActionOnly: true,
          sameWeaponRequired: parameters.sameWeaponRequired === true,
          sameTargetRequired: true,
          maximumGrantedAttacks: Math.max(1, numeric(parameters.maximumGrantedAttacks, 1)),
          recursiveTriggerAllowed: false,
        },
        strictForwardWitnessRequired: true,
        claimBoundary: "Strict replay must prove the prior critical hit, target survival, same combat action, same weapon, optional window choice, and terminal attack.",
      }],
      totalCandidateCount: 1,
      selectedCandidateCount: 1,
      remainingCandidateCount: 0,
    };
  }
  const allCandidates = (state.pieces || []).filter((piece) =>
    alive(piece) && piece.sideKey !== actor.sideKey && piece.pieceKey !== template.targetPieceKey);
  const limit = Math.max(0, Math.floor(numeric(rawOptions.maximumBridgeCandidates, 32)));
  const selectedCandidates = allCandidates.slice().sort((left, right) =>
    numeric(left.damage?.boxesRemaining ?? left.boxesRemaining, 1) -
      numeric(right.damage?.boxesRemaining ?? right.boxesRemaining, 1) ||
    left.pieceKey.localeCompare(right.pieceKey)).slice(0, limit);
  const alternatives = selectedCandidates.map((predecessorTarget) => {
    const isSnapFire = primitiveKey === "grant_attack_window_on_destroy";
    const targetHasTough = isSnapFire && pieceHasTough(predecessorTarget);
    const targetWithinOriginalTargetIn = numeric(parameters.targetWithinOriginalTargetIn, 0);
    return {
      alternativeKey: `rule-regression-${stableHash({
        templateKey: template.templateKey || "",
        atomKey: atom.atomKey,
        primitiveKey,
        predecessorTargetPieceKey: predecessorTarget.pieceKey,
      })}`,
      predecessorKind: isSnapFire
        ? "destroy_generated_same_weapon_terminal_attack"
        : "hit_generated_ricochet_terminal_attack",
      sourceAtomKey: atom.atomKey,
      sourceRuleName: atom.ruleName,
      sourcePrimitiveKey: primitiveKey,
      actorPieceKey: actor.pieceKey,
      predecessorTargetPieceKey: predecessorTarget.pieceKey,
      bridgeTargetPieceKey: predecessorTarget.pieceKey,
      terminalTargetPieceKey: template.targetPieceKey || "",
      terminalActionKind: mode,
      effectToPreconditions: isSnapFire ? [
        "prior_same_weapon_ranged_attack_destroys_enemy_during_combat_action",
        "destroyed_lifecycle_resolves_after_attack",
        "optional_nonrecursive_same_weapon_basic_ranged_attack_is_selected",
      ] : [
        "prior_same_weapon_ranged_attack_hits_original_target",
        "terminal_target_is_another_model_within_declared_radius_of_original_target",
        "optional_nonrecursive_same_weapon_generated_attack_is_selected",
      ],
      previousActorPositionConstraint: {
        bridgeTargetMaximumEdgeDistanceIn: terminalRangeIn,
        terminalTargetMaximumEdgeDistanceBeforeAdvanceIn: isSnapFire ? terminalRangeIn : null,
        bridgeToTerminalMaximumEdgeDistanceIn: isSnapFire ? null : targetWithinOriginalTargetIn,
        ignoreActorToTerminalRange: !isSnapFire && parameters.ignoresWeaponRange === true,
        ignoresLineOfSightForTerminalAttack: !isSnapFire && parameters.ignoresLineOfSight === true,
        maximumAdvanceIn: 0,
        exactCoordinateKnown: false,
      },
      damageLifecycleObligation: isSnapFire ? {
        requiredFinalStage: "destroyed",
        targetHasTough,
        toughBranchRequirement: targetHasTough ? "tough_fails_or_is_denied" : "not_applicable",
        disabledAndBoxedReplacementsMustBeResolved: true,
        removedFromPlayWithoutDestroyedIsInsufficient: true,
      } : null,
      predecessorChanceObligation: isSnapFire ? {
        requiredOutcome: "prior_attack_destroys_enemy",
        exactChanceMassRequired: true,
      } : {
        requiredOutcome: parameters.requiresCriticalHit === true ? "critical_hit" : "direct_hit",
        exactChanceMassRequired: true,
      },
      actionSequenceObligation: {
        duringCombatActionOnly: isSnapFire,
        sameWeaponRequired: parameters.sameWeaponRequired === true,
        maximumGrantedAttacks: Math.max(1, numeric(parameters.maximumGrantedAttacks, 1)),
        recursiveTriggerAllowed: false,
      },
      strictForwardWitnessRequired: true,
      claimBoundary: "Strict replay must prove the predecessor target, hit or destroyed lifecycle, source weapon, generated-attack window, target relation, recursion prohibition, and terminal attack.",
    };
  });
  return {
    alternatives,
    totalCandidateCount: allCandidates.length,
    selectedCandidateCount: selectedCandidates.length,
    remainingCandidateCount: Math.max(0, allCandidates.length - selectedCandidates.length),
  };
}

function movementBridgeAlternatives(state = {}, template = {}, actor = {}, atom = {}, hook = {}, rawOptions = {}) {
  const primitiveKey = String(hook.primitiveKey || "");
  const parameters = hook.parameters || {};
  if (primitiveKey === "grant_movement_window_after_attack_resolved" &&
    String(parameters.movedModelScope || "actor") === "target") return null;
  const destroysBridge = primitiveKey === "grant_movement_window_on_destroy";
  const pushesThenFollows = primitiveKey === "optional_push_follow_after_basic_attack";
  if (!destroysBridge && primitiveKey !== "grant_movement_window_after_attack_resolved" &&
    !pushesThenFollows) return null;
  const triggerText = String(parameters.trigger || "").toLowerCase();
  const predecessorAttackKind = triggerText.includes("ranged") ? "ranged"
    : triggerText.includes("melee") || primitiveKey === "grant_movement_window_after_attack_resolved"
      ? "melee"
      : "source_weapon_basic_attack";
  const terminalRangeIn = meleeRangeIn(actor, template.attackProfile || {});
  const maximumMovementIn = Math.max(0, numeric(
    pushesThenFollows ? parameters.followMaximumDistanceIn : parameters.maximumDistanceIn,
    0,
  ));
  const knownPredecessorRangeIn = ["melee", "ranged"].includes(predecessorAttackKind)
    ? maximumKnownAttackRangeIn(actor, predecessorAttackKind, template.attackProfile || {})
    : null;
  const allCandidates = (state.pieces || []).filter((piece) =>
    alive(piece) && piece.sideKey !== actor.sideKey &&
    (!destroysBridge || piece.pieceKey !== template.targetPieceKey));
  const limit = Math.max(0, Math.floor(numeric(rawOptions.maximumBridgeCandidates, 32)));
  const selectedCandidates = allCandidates.slice().sort((left, right) =>
    numeric(left.damage?.boxesRemaining ?? left.boxesRemaining, 1) -
      numeric(right.damage?.boxesRemaining ?? right.boxesRemaining, 1) ||
    left.pieceKey.localeCompare(right.pieceKey)).slice(0, limit);
  const alternatives = selectedCandidates.map((bridgeTarget) => ({
    alternativeKey: `rule-regression-${stableHash({
      templateKey: template.templateKey || "",
      atomKey: atom.atomKey,
      primitiveKey,
      bridgeTargetPieceKey: bridgeTarget.pieceKey,
    })}`,
    predecessorKind: destroysBridge
      ? "destroy_then_optional_actor_movement_before_terminal_attack"
      : pushesThenFollows
        ? "basic_hit_push_follow_before_terminal_attack"
        : "hit_then_optional_actor_movement_before_terminal_attack",
    sourceAtomKey: atom.atomKey,
    sourceRuleName: atom.ruleName,
    sourcePrimitiveKey: primitiveKey,
    actorPieceKey: actor.pieceKey,
    predecessorTargetPieceKey: bridgeTarget.pieceKey,
    bridgeTargetPieceKey: bridgeTarget.pieceKey,
    terminalTargetPieceKey: template.targetPieceKey || "",
    terminalActionKind: attackMode(template),
    terminalTargetMayHavePriorDamage: bridgeTarget.pieceKey === template.targetPieceKey,
    effectToPreconditions: [
      destroysBridge ? "prior_qualifying_attack_destroys_enemy" : "prior_qualifying_attack_hits_surviving_enemy",
      pushesThenFollows ? "optional_push_occurs_and_is_not_prevented" : "optional_actor_movement_window_is_selected",
      pushesThenFollows ? "optional_follow_advance_is_selected" : "actor_reaches_legal_landing",
      "actor_retains_or_purchases_a_later_terminal_attack_entitlement",
    ],
    previousActorPositionConstraint: {
      bridgeTargetMaximumEdgeDistanceIn: knownPredecessorRangeIn,
      predecessorAttackKind,
      predecessorAttackRangePolicy: knownPredecessorRangeIn == null
        ? "strict_source_profile_required_no_hard_range_bound"
        : "maximum_declared_matching_profile_then_strict_source_profile",
      terminalTargetMaximumEdgeDistanceBeforeAdvanceIn: terminalRangeIn + maximumMovementIn,
      terminalTargetMaximumEdgeDistanceAfterAdvanceIn: terminalRangeIn,
      maximumAdvanceIn: maximumMovementIn,
      movementType: pushesThenFollows ? parameters.followMovementType : parameters.movementType,
      directionPolicy: pushesThenFollows ? parameters.followDirection : parameters.directionPolicy,
      exactDirectionalLandingRequired: pushesThenFollows,
      exactCoordinateKnown: false,
    },
    damageLifecycleObligation: destroysBridge ? {
      requiredFinalStage: "destroyed",
      targetHasTough: pieceHasTough(bridgeTarget),
      toughBranchRequirement: pieceHasTough(bridgeTarget) ? "tough_fails_or_is_denied" : "not_applicable",
      disabledAndBoxedReplacementsMustBeResolved: true,
      removedFromPlayWithoutDestroyedIsInsufficient: true,
    } : null,
    predecessorTargetStateObligation: destroysBridge ? null : {
      requiredOutcome: "hit",
      targetMustSurvivePriorAttack: true,
      targetMustRemainInPlay: true,
      actualPushRequiredBeforeFollow: pushesThenFollows,
      pushPreventionMustFail: pushesThenFollows,
    },
    predecessorChanceObligation: {
      requiredOutcome: destroysBridge ? "prior_attack_destroys_enemy" : "prior_attack_hits_enemy",
      exactChanceMassRequired: true,
    },
    actionSequenceObligation: {
      duringCombatActionOnly: hook.requiredContextKeys?.includes("duringCombatAction") === true,
      predecessorAttackKind,
      predecessorBasicAttackRequired: hook.requiredContextKeys?.includes("isBasicAttack") === true,
      predecessorInitialOrSpecialAttackRequired:
        hook.requiredContextKeys?.includes("isInitialMeleeAttack") === true,
      movementWindowOptional: parameters.optional !== false,
      maximumMovementIn,
      subsequentAttackEntitlementRequired: true,
      subsequentAttackEntitlementMustBeStrictlyExecuted: true,
    },
    sequence: [
      "prior_qualifying_attack",
      destroysBridge ? "bridge_enemy_destroyed_after_lifecycle" : "bridge_enemy_hit_and_survives",
      pushesThenFollows ? "optional_push_then_optional_follow" : "optional_actor_movement",
      "strictly_entitled_later_terminal_attack",
      "terminal_outcome",
    ],
    strictForwardWitnessRequired: true,
    claimBoundary: "This route supplies an optimistic movement region only. Strict replay must prove the exact source weapon, trigger, target lifecycle, push or movement path, reactions, landing, remaining attack entitlement, and terminal attack.",
  }));
  return {
    alternatives,
    totalCandidateCount: allCandidates.length,
    selectedCandidateCount: selectedCandidates.length,
    remainingCandidateCount: Math.max(0, allCandidates.length - selectedCandidates.length),
  };
}

function statusOnHitAlternatives(state = {}, template = {}, actor = {}, atom = {}, hook = {}, rawOptions = {}) {
  if (!warmachineStatusOnHitSupportsTerminalRegression(hook)) return null;
  const terminalTarget = (state.pieces || []).find((piece) =>
    piece.pieceKey === template.targetPieceKey) || null;
  if (!terminalTarget || !alive(terminalTarget)) return null;
  const parameters = hook.parameters || {};
  const statusProperties = parameters.statusProperties || {};
  const removesLosBlock = statusProperties.targetDoesNotBlockLineOfSight === true;
  const affectedAreaIn = Math.max(0, numeric(parameters.affectedAreaIn, 0));
  const allEnemyCandidates = (state.pieces || []).filter((piece) =>
    alive(piece) && piece.sideKey !== actor.sideKey);
  const rawCandidates = removesLosBlock
    ? allEnemyCandidates.filter((piece) => piece.pieceKey !== terminalTarget.pieceKey)
    : affectedAreaIn > 0
      ? allEnemyCandidates
      : [terminalTarget];
  const limit = Math.max(0, Math.floor(numeric(rawOptions.maximumBridgeCandidates, 32)));
  const selectedCandidates = rawCandidates.slice().sort((left, right) =>
    Number(left.pieceKey !== terminalTarget.pieceKey) - Number(right.pieceKey !== terminalTarget.pieceKey) ||
    left.pieceKey.localeCompare(right.pieceKey)).slice(0, limit);
  const terminalRangeIn = meleeRangeIn(actor, template.attackProfile || {});
  const statusTags = Array.from(new Set([
    parameters.statusTag,
    ...(parameters.statusTags || []),
  ].filter(Boolean).map(String))).sort();
  const alternatives = selectedCandidates.map((predecessorTarget) => {
    const statusRecipient = removesLosBlock ? predecessorTarget : terminalTarget;
    const predecessorTargetsTerminal = predecessorTarget.pieceKey === terminalTarget.pieceKey;
    return {
      alternativeKey: `rule-regression-${stableHash({
        templateKey: template.templateKey || "",
        atomKey: atom.atomKey,
        predecessorTargetPieceKey: predecessorTarget.pieceKey,
        statusRecipientPieceKey: statusRecipient.pieceKey,
      })}`,
      predecessorKind: removesLosBlock
        ? "hit_screen_apply_los_status_before_terminal_attack"
        : "hit_apply_terminal_status_before_terminal_attack",
      sourceAtomKey: atom.atomKey,
      sourceRuleName: atom.ruleName,
      sourcePrimitiveKey: hook.primitiveKey,
      actorPieceKey: actor.pieceKey,
      predecessorTargetPieceKey: predecessorTarget.pieceKey,
      bridgeTargetPieceKey: predecessorTarget.pieceKey,
      terminalTargetPieceKey: terminalTarget.pieceKey,
      terminalActionKind: attackMode(template),
      terminalTargetMayHavePriorDamage: predecessorTargetsTerminal,
      effectToPreconditions: [
        "prior_source_attack_hits_declared_predecessor_target",
        affectedAreaIn > 0 && !predecessorTargetsTerminal
          ? "terminal_target_is_legally_affected_within_status_area"
          : "declared_status_recipient_is_hit",
        "status_is_not_prevented_and_remains_active",
        "status_effect_is_relevant_to_terminal_legality_or_resolution",
        "actor_retains_or_purchases_a_later_terminal_attack_entitlement",
      ],
      previousActorPositionConstraint: {
        bridgeTargetMaximumEdgeDistanceIn: null,
        predecessorAttackKind: "strict_source_attack_profile",
        predecessorAttackRangePolicy: "strict_source_profile_required_no_hard_range_bound",
        bridgeToTerminalMaximumEdgeDistanceIn:
          affectedAreaIn > 0 && !predecessorTargetsTerminal ? affectedAreaIn : null,
        terminalTargetMaximumEdgeDistanceBeforeAdvanceIn: terminalRangeIn,
        terminalTargetMaximumEdgeDistanceAfterAdvanceIn: terminalRangeIn,
        maximumAdvanceIn: 0,
        requiresActorTerminalLineOfSightBlockerRelation: removesLosBlock,
        exactCoordinateKnown: false,
      },
      predecessorTargetStateObligation: {
        requiredOutcome: "hit",
        targetMustSurvivePriorAttack: true,
        targetMustRemainInPlay: true,
      },
      predecessorChanceObligation: {
        requiredOutcome: String(parameters.trigger || "hit"),
        exactChanceMassRequired: true,
      },
      terminalStatusEffectObligation: {
        statusRecipientPieceKey: statusRecipient.pieceKey,
        statusTags,
        statusEffectType: String(parameters.statusEffectType || ""),
        statusProperties,
        duration: String(parameters.duration || ""),
        durationKind: String(parameters.durationKind || parameters.duration || ""),
        expiresAtSidePolicy: String(parameters.expiresAtSidePolicy || ""),
        expiresAtTurnOffset: numeric(parameters.expiresAtTurnOffset, 0),
        preventionPolicy: String(parameters.preventionPolicy || ""),
        coverageScope: String(parameters.coverageScope || ""),
        targetPredicate: hook.predicate || null,
        minimumSourceCorpseTokens: Math.max(0, numeric(parameters.minimumSourceCorpseTokens, 0)),
        requiredAtTerminalAction: true,
        strictDurationAndInteractionProofRequired: true,
      },
      actionSequenceObligation: {
        predecessorAttackKind: "strict_source_attack_profile",
        predecessorTrigger: String(parameters.trigger || "hit"),
        sameActivationRequired: String(parameters.durationKind || parameters.duration || "") === "activation",
        subsequentAttackEntitlementRequired: true,
        subsequentAttackEntitlementMustBeStrictlyExecuted: true,
      },
      sequence: [
        "prior_source_attack_hits",
        "status_application_and_prevention_resolution",
        "status_duration_remains_active",
        "strictly_entitled_later_terminal_attack",
        "terminal_outcome",
      ],
      strictForwardWitnessRequired: true,
      claimBoundary: "This route preserves the exact status payload and duration but does not assume it applied or helped. Strict replay must prove source-profile legality, hit coverage, prevention and immunity, duration, status interactions, later attack entitlement, and the terminal result.",
    };
  });
  return {
    alternatives,
    totalCandidateCount: rawCandidates.length,
    selectedCandidateCount: selectedCandidates.length,
    remainingCandidateCount: Math.max(0, rawCandidates.length - selectedCandidates.length),
  };
}

function soulClaimRelationMatches(piece = {}, actor = {}, relation = "any") {
  if (piece.pieceKey === actor.pieceKey) return false;
  if (relation === "enemy") return piece.sideKey !== actor.sideKey;
  if (["friendly", "friendly_faction"].includes(relation)) return piece.sideKey === actor.sideKey;
  return true;
}

function soulClaimAlternatives(state = {}, template = {}, actor = {}, baseAlternative = {}, atom = {}, hook = {}, rawOptions = {}) {
  const parameters = hook.parameters || {};
  const relation = String(parameters.targetRelation || "any");
  const allCandidates = (state.pieces || []).filter((piece) =>
    alive(piece) && soulClaimRelationMatches(piece, actor, relation) &&
    piece.pieceKey !== template.targetPieceKey && piece.generatesSoul !== false);
  const limit = Math.max(0, Math.floor(numeric(rawOptions.maximumResourceSourceCandidates, 24)));
  const selectedCandidates = allCandidates.slice().sort((left, right) =>
    numeric(left.damage?.boxesRemaining ?? left.boxesRemaining, 1) -
      numeric(right.damage?.boxesRemaining ?? right.boxesRemaining, 1) ||
    left.pieceKey.localeCompare(right.pieceKey)).slice(0, limit);
  const collectionRangeKind = String(parameters.collectionRangeKind || "");
  const collectionRangeIn = collectionRangeKind === "fixed"
    ? Math.max(0, numeric(parameters.collectionRangeIn, 0))
    : collectionRangeKind === "control"
      ? numeric(actor.controlRangeIn ?? actor.controlRange, NaN)
      : NaN;
  const maximumTokenCount = Math.max(0, numeric(parameters.maximumTokenCount, 0));
  const terminalRangeIn = meleeRangeIn(actor, template.attackProfile || {});
  const alternatives = selectedCandidates.map((soulSource) => ({
    ...cloneJson(baseAlternative),
    alternativeKey: `rule-regression-${stableHash({
      baseAlternativeKey: baseAlternative.alternativeKey,
      atomKey: atom.atomKey,
      soulSourcePieceKey: soulSource.pieceKey,
    })}`,
    predecessorKind: "destroy_soul_source_claim_token_then_fund_terminal_attack",
    baseAlternativeKey: baseAlternative.alternativeKey,
    sourceAtomKey: atom.atomKey,
    sourceRuleName: atom.ruleName,
    sourcePrimitiveKey: hook.primitiveKey,
    predecessorTargetPieceKey: soulSource.pieceKey,
    bridgeTargetPieceKey: soulSource.pieceKey,
    additionalAttackResourceCanBeAcquired: true,
    effectToPreconditions: [
      "declared_model_reaches_destroyed_after_full_lifecycle",
      "destroyed_model_generates_a_soul_token",
      "collector_is_nearest_eligible_source_and_has_capacity",
      "relation_range_attack_source_and_friendly_attack_prohibition_are_satisfied",
      "soul_token_is_claimed_before_the_terminal_resource_payment",
      "base_token_funded_terminal_attack_sequence_executes",
    ],
    previousActorPositionConstraint: {
      bridgeTargetMaximumEdgeDistanceIn: null,
      intermediateCollectionRangeIn: Number.isFinite(collectionRangeIn) ? collectionRangeIn : null,
      bridgeRangeOccursAtIntermediateEvent: true,
      predecessorAttackKind: parameters.requiresThisWeaponAttack
        ? "strict_this_weapon_attack"
        : parameters.requiresDestroyingCollectorAttack
          ? "strict_collector_attack"
          : "any_strict_soul_generating_destruction_source",
      predecessorAttackRangePolicy: parameters.requiresDestroyingCollectorAttack
        ? "strict_source_profile_required_no_hard_attack_range_bound"
        : "collection_range_only_then_strict_destruction_source",
      terminalTargetMaximumEdgeDistanceBeforeAdvanceIn: terminalRangeIn,
      terminalTargetMaximumEdgeDistanceAfterAdvanceIn: terminalRangeIn,
      maximumAdvanceIn: 0,
      exactCoordinateKnown: false,
    },
    damageLifecycleObligation: {
      requiredFinalStage: "destroyed",
      targetHasTough: pieceHasTough(soulSource),
      toughBranchRequirement: pieceHasTough(soulSource) ? "tough_fails_or_is_denied" : "not_applicable",
      disabledAndBoxedReplacementsMustBeResolved: true,
      removedFromPlayWithoutDestroyedIsInsufficient: true,
    },
    resourceAcquisitionObligation: {
      resourceKind: "soul",
      amountRequired: Math.max(1, numeric(baseAlternative.resourceObligation?.tokenCostPerAttack, 1)),
      collectorPieceKey: actor.pieceKey,
      soulSourcePieceKey: soulSource.pieceKey,
      targetRelation: relation,
      collectionRangeKind,
      collectionRangeIn: Number.isFinite(collectionRangeIn) ? collectionRangeIn : null,
      maximumTokenCount,
      requiresDestroyingCollectorAttack: parameters.requiresDestroyingCollectorAttack === true,
      requiresThisWeaponAttack: parameters.requiresThisWeaponAttack === true,
      targetFactionMatchRequired: parameters.targetFactionMatchRequired === true,
      conversionTiming: String(parameters.conversionTiming || ""),
      conversionResourceKind: String(parameters.conversionResourceKind || ""),
      nearestEligibleCollectorMustBeActor: true,
      targetMustGenerateSoul: true,
      friendlyAttackTokenGenerationMustNotBeProhibited: true,
      collectorCapacityRequired: maximumTokenCount > 0,
      sourcePredicate: hook.predicate || null,
      strictCollectionAndOrderingProofRequired: true,
    },
    predecessorChanceObligation: {
      requiredOutcome: "soul_source_destroyed_and_actor_claims_generated_soul",
      exactChanceMassRequired: true,
    },
    actionSequenceObligation: {
      ...(baseAlternative.actionSequenceObligation || {}),
      soulClaimMustPrecedeResourcePayment: true,
      subsequentAttackEntitlementRequired: true,
      subsequentAttackEntitlementMustBeStrictlyExecuted: true,
    },
    sequence: [
      "qualifying_soul_source_destruction",
      "full_destroyed_lifecycle_and_soul_generation",
      "nearest_eligible_collector_claim",
      "soul_token_payment",
      "additional_terminal_attack",
      "terminal_outcome",
    ],
    strictForwardWitnessRequired: true,
    claimBoundary: "This composition does not grant a free soul. Strict replay must prove the living/soul-generation state, destruction source, friendly-attack prohibition, nearest eligible collector, exact collection range, token capacity, timing, payment, attack entitlement, and terminal outcome.",
  }));
  return {
    alternatives,
    totalCandidateCount: allCandidates.length,
    selectedCandidateCount: selectedCandidates.length,
    remainingCandidateCount: Math.max(0, allCandidates.length - selectedCandidates.length),
  };
}

function activationSequenceTerminalAlternative(template = {}, actor = {}, atom = {}, hook = {}) {
  if (!warmachineActivationSequenceSupportsTerminalRegression(hook)) return null;
  const parameters = hook.parameters || {};
  const sequenceKind = String(parameters.sequenceKind || "");
  const terminalMode = attackMode(template);
  const grantedAttackKind = String(parameters.grantedAttackKind || (
    sequenceKind.includes("assault") || sequenceKind.includes("dual_shot") ? "ranged" : "melee"
  ));
  if (grantedAttackKind !== terminalMode) return null;
  const terminalRangeIn = meleeRangeIn(actor, template.attackProfile || {});
  const movementDistanceIn = numeric(
    parameters.grantedMovementDistanceIn ?? parameters.advanceDistanceIn,
    NaN,
  );
  const maximumMovementIn = Number.isFinite(movementDistanceIn) ? Math.max(0, movementDistanceIn) : 0;
  const trigger = String(parameters.trigger || "");
  const followsEarlierAttack = String(parameters.timing || "").includes("after_initial_or_special_attack");
  return {
    alternativeKey: `rule-regression-${stableHash({
      templateKey: template.templateKey || "",
      atomKey: atom.atomKey,
      sequenceKind,
    })}`,
    predecessorKind: "activation_sequence_granted_terminal_attack",
    sourceAtomKey: atom.atomKey,
    sourceRuleName: atom.ruleName,
    sourcePrimitiveKey: hook.primitiveKey,
    actorPieceKey: actor.pieceKey,
    terminalTargetPieceKey: template.targetPieceKey || "",
    terminalActionKind: terminalMode,
    terminalTargetMayHavePriorDamage: followsEarlierAttack,
    effectToPreconditions: [
      "exact_activation_sequence_source_is_active",
      "sequence_trigger_and_timing_are_satisfied",
      parameters.normalMovementOption ? "required_normal_movement_option_is_selected" : "sequence_movement_state_is_legal",
      parameters.tokenKind ? "declared_sequence_token_cost_is_available_and_paid" : "no_sequence_token_payment_required",
      "granted_attack_target_policy_accepts_terminal_target",
      "granted_terminal_attack_is_strictly_executed",
    ],
    previousActorPositionConstraint: {
      bridgeTargetMaximumEdgeDistanceIn: null,
      terminalTargetMaximumEdgeDistanceBeforeAdvanceIn: terminalRangeIn + maximumMovementIn,
      terminalTargetMaximumEdgeDistanceAfterAdvanceIn: terminalRangeIn,
      maximumAdvanceIn: Number.isFinite(movementDistanceIn) ? maximumMovementIn : null,
      movementDistanceFromRuleTextRequiresStrictContext:
        parameters.movementDistanceFromRuleText === true && !Number.isFinite(movementDistanceIn),
      movementType: String(parameters.grantedMovementKind || ""),
      exactCoordinateKnown: false,
    },
    activationSequenceObligation: {
      sequenceKind,
      trigger,
      timing: String(parameters.timing || parameters.independentTiming || parameters.unitTiming || ""),
      normalMovementOption: String(parameters.normalMovementOption || ""),
      requiresUnengagedForAimBonus: parameters.requiresUnengagedForAimBonus === true,
      tokenKind: String(parameters.tokenKind || ""),
      tokenCost: Math.max(0, numeric(parameters.tokenCost, 0)),
      independentTargetPolicy: String(parameters.independentTargetPolicy || ""),
      unitTargetPolicy: String(parameters.unitTargetPolicy || ""),
      optionalPerEligibleModel: parameters.optionalPerEligibleModel !== false,
      maximumGrantedAttacks: Math.max(1, numeric(parameters.maximumGrantedAttacks, 1)),
      attacksPerEligibleModel: Math.max(1, numeric(parameters.attacksPerEligibleModel, 1)),
      basicAttackOnly: parameters.basicAttackOnly === true,
      combinedRangedAttackAllowed: parameters.combinedRangedAttackAllowed === true,
      consumesCombatAction: parameters.consumesCombatAction === true,
      strictTriggerTimingAndTargetProofRequired: true,
    },
    actionSequenceObligation: {
      activationSequenceKind: sequenceKind,
      grantedAttackKind,
      priorAttackSequenceRequired: followsEarlierAttack,
      subsequentAttackEntitlementRequired: true,
      subsequentAttackEntitlementMustBeStrictlyExecuted: true,
    },
    sequence: [
      "activation_sequence_trigger",
      "movement_or_aim_requirement",
      "optional_sequence_choice",
      "granted_terminal_attack",
      "terminal_outcome",
    ],
    strictForwardWitnessRequired: true,
    claimBoundary: "The sequence grants only a symbolic attack entitlement. Strict replay must prove the exact trigger, phase, movement or aim state, resource cost, unit ordering, target policy, optional choice, attack roll, and terminal result.",
  };
}

function destroyGrantedMeleeAlternatives(state = {}, template = {}, actor = {}, atom = {}, hook = {}, rawOptions = {}) {
  if (!warmachineDestroyActionWindowSupportsTerminalRegression(hook) || attackMode(template) !== "melee") {
    return null;
  }
  const parameters = hook.parameters || {};
  const targetAllegiance = String(parameters.targetAllegiance || "enemy");
  const allCandidates = (state.pieces || []).filter((piece) => {
    if (!alive(piece) || piece.pieceKey === actor.pieceKey || piece.pieceKey === template.targetPieceKey) return false;
    if (targetAllegiance === "enemy") return piece.sideKey !== actor.sideKey;
    if (targetAllegiance === "friendly") return piece.sideKey === actor.sideKey;
    return true;
  });
  const limit = Math.max(0, Math.floor(numeric(rawOptions.maximumBridgeCandidates, 32)));
  const selectedCandidates = allCandidates.slice().sort((left, right) =>
    numeric(left.damage?.boxesRemaining ?? left.boxesRemaining, 1) -
      numeric(right.damage?.boxesRemaining ?? right.boxesRemaining, 1) ||
    left.pieceKey.localeCompare(right.pieceKey)).slice(0, limit);
  const predecessorRangeIn = maximumKnownAttackRangeIn(actor, "melee", template.attackProfile || {});
  const terminalRangeIn = meleeRangeIn(actor, template.attackProfile || {});
  const alternatives = selectedCandidates.map((bridgeTarget) => ({
    alternativeKey: `rule-regression-${stableHash({
      templateKey: template.templateKey || "",
      atomKey: atom.atomKey,
      bridgeTargetPieceKey: bridgeTarget.pieceKey,
    })}`,
    predecessorKind: "destroy_then_granted_additional_melee_terminal_attack",
    sourceAtomKey: atom.atomKey,
    sourceRuleName: atom.ruleName,
    sourcePrimitiveKey: hook.primitiveKey,
    actorPieceKey: actor.pieceKey,
    predecessorTargetPieceKey: bridgeTarget.pieceKey,
    bridgeTargetPieceKey: bridgeTarget.pieceKey,
    terminalTargetPieceKey: template.targetPieceKey || "",
    terminalActionKind: "melee",
    effectToPreconditions: [
      "prior_qualifying_melee_attack_resolves",
      "bridge_target_reaches_destroyed_after_full_lifecycle",
      "usage_limit_and_additional_target_conditions_are_satisfied",
      parameters.optional === false
        ? "mandatory_granted_melee_attack_targets_a_legal_model"
        : "optional_granted_melee_attack_is_selected",
      "granted_terminal_melee_attack_executes",
    ],
    previousActorPositionConstraint: {
      bridgeTargetMaximumEdgeDistanceIn: predecessorRangeIn,
      predecessorAttackKind: "melee",
      predecessorAttackRangePolicy: predecessorRangeIn == null
        ? "strict_source_profile_required_no_hard_range_bound"
        : "maximum_declared_melee_profile_then_strict_source_profile",
      terminalTargetMaximumEdgeDistanceBeforeAdvanceIn: terminalRangeIn,
      terminalTargetMaximumEdgeDistanceAfterAdvanceIn: terminalRangeIn,
      maximumAdvanceIn: 0,
      exactCoordinateKnown: false,
    },
    damageLifecycleObligation: {
      requiredFinalStage: "destroyed",
      targetHasTough: pieceHasTough(bridgeTarget),
      toughBranchRequirement: pieceHasTough(bridgeTarget) ? "tough_fails_or_is_denied" : "not_applicable",
      disabledAndBoxedReplacementsMustBeResolved: true,
      removedFromPlayWithoutDestroyedIsInsufficient: true,
    },
    predecessorChanceObligation: {
      requiredOutcome: "prior_melee_attack_destroys_qualifying_model",
      exactChanceMassRequired: true,
    },
    actionSequenceObligation: {
      duringCombatActionOnly: true,
      predecessorBasicAttackRequired: String(parameters.trigger || "").includes("basic_melee"),
      grantedActionKind: "melee_attack",
      grantedAttackMandatory: parameters.optional === false,
      maximumGrantedActions: Math.max(1, numeric(parameters.maximumGrantedActions, 1)),
      usageLimitKind: String(parameters.usageLimitKind || ""),
      recursiveTriggerAllowed: parameters.recursiveTriggerAllowed === true,
      targetPolicy: String(parameters.targetPolicy || ""),
      targetAllegiance,
      strictUsageAndTargetProofRequired: true,
    },
    sequence: [
      "prior_qualifying_melee_attack",
      "bridge_target_destroyed_after_lifecycle",
      "granted_additional_melee_window",
      "terminal_melee_attack",
      "terminal_outcome",
    ],
    strictForwardWitnessRequired: true,
    claimBoundary: "Strict replay must prove the qualifying prior melee attack, destroyed lifecycle, allegiance and target policy, usage limit, mandatory or optional window semantics, recursion, and terminal attack.",
  }));
  return {
    alternatives,
    totalCandidateCount: allCandidates.length,
    selectedCandidateCount: selectedCandidates.length,
    remainingCandidateCount: Math.max(0, allCandidates.length - selectedCandidates.length),
  };
}

function explosionSecondaryDamageAlternative(state = {}, template = {}, actor = {}, atom = {}, hook = {}) {
  if (template.goalType !== "assassination" ||
    !warmachineExplosionSupportsTerminalRegression(hook)) return null;
  const terminalTarget = (state.pieces || []).find((piece) =>
    piece.pieceKey === template.targetPieceKey) || null;
  if (!terminalTarget || !alive(terminalTarget) || terminalTarget.pieceKey === actor.pieceKey) return null;
  const parameters = hook.parameters || {};
  const targetAllegiance = String(parameters.targetAllegiance || "all_models");
  if (targetAllegiance === "enemy_models" && terminalTarget.sideKey === actor.sideKey) return null;
  if (targetAllegiance === "friendly_models" && terminalTarget.sideKey !== actor.sideKey) return null;
  const targetRangeIn = Math.max(0, numeric(parameters.targetRangeIn, 0));
  const triggerKinds = [...new Set((parameters.triggerKinds || []).map(String).filter(Boolean))].sort();
  const sourceRemovalKind = parameters.removeExplodingModelFromPlayAfterDamage === true
    ? "remove_source_model_from_play_after_secondary_damage"
    : parameters.removeExplodingMarkerFromTableAfterDamage === true
      ? "remove_source_marker_from_table_after_secondary_damage"
      : "source_remains_after_secondary_damage";
  return {
    alternativeKey: `rule-regression-${stableHash({
      templateKey: template.templateKey || "",
      atomKey: atom.atomKey,
      primitiveKey: hook.primitiveKey,
      triggerKinds,
    })}`,
    predecessorKind: "trigger_explosion_secondary_damage_terminal",
    sourceAtomKey: atom.atomKey,
    sourceRuleName: atom.ruleName,
    sourcePrimitiveKey: hook.primitiveKey,
    actorPieceKey: actor.pieceKey,
    terminalTargetPieceKey: terminalTarget.pieceKey,
    terminalActionKind: "secondary_damage",
    effectToPreconditions: [
      "exact_explosion_source_is_active",
      "one_declared_explosion_trigger_is_legally_reached",
      "terminal_target_is_present_in_the_radial_target_batch",
      "all_simultaneous_secondary_damage_targets_are_declared_before_resolution",
      "terminal_target_secondary_damage_roll_reaches_the_required_terminal_state",
      "source_lifecycle_resolves_after_the_damage_batch",
    ],
    previousActorPositionConstraint: {
      bridgeTargetMaximumEdgeDistanceIn: null,
      terminalTargetMaximumEdgeDistanceBeforeAdvanceIn: targetRangeIn,
      terminalTargetMaximumEdgeDistanceAfterAdvanceIn: targetRangeIn,
      maximumAdvanceIn: 0,
      movementType: "",
      exactCoordinateKnown: false,
    },
    explosionTriggerObligation: {
      triggerKinds,
      applicabilityPredicate: cloneJson(hook.applicabilityPredicate || null),
      triggerPredicate: cloneJson(hook.predicate || null),
      requiredContextKeys: [...(hook.requiredContextKeys || [])].sort(),
      exactTriggerActionAndTimingProofRequired: true,
    },
    terminalSecondaryDamageObligation: {
      targetPieceKey: terminalTarget.pieceKey,
      targetSelection: String(parameters.targetSelection || ""),
      targetAllegiance,
      includesExplodingModel: parameters.includesExplodingModel === true,
      targetRangeIn,
      maximumTargetCount: parameters.maximumTargetCount ?? "all",
      damagePower: numeric(parameters.damagePower, 0),
      damageDiceCount: Math.max(1, numeric(parameters.damageDiceCount, 2)),
      damageTypes: [...(parameters.damageTypes || [])].map(String).sort(),
      unboostable: parameters.unboostable === true,
      damageCausedByAttack: parameters.damageCausedByAttack === true,
      outcomeByTargetFieldKeys: [...(parameters.outcomeByTargetFieldKeys || [])].map(String),
      damageModel: String(parameters.damageModel || ""),
      strictBatchOrderingDamageAndTerminalProofRequired: true,
    },
    sourceLifecycleObligation: {
      sourcePieceKey: actor.pieceKey,
      sourceEntityKind: String(parameters.sourceEntityKind || "model"),
      sourceRemovalKind,
      removeFromPlayAfterDamage: parameters.removeExplodingModelFromPlayAfterDamage === true,
      removeMarkerFromTableAfterDamage: parameters.removeExplodingMarkerFromTableAfterDamage === true,
      preventsDisabledBoxedDestroyed: parameters.preventsDisabledBoxedDestroyed === true,
      preventsResourceCollection: parameters.preventsResourceCollection === true,
      strictPostBatchSourceLifecycleProofRequired: true,
    },
    predecessorChanceObligation: {
      requiredOutcome: "declared_trigger_occurs_and_secondary_damage_reaches_terminal_state",
      triggerKinds,
      exactChanceMassRequired: true,
    },
    sequence: [
      "legally_reach_declared_explosion_trigger",
      "declare_complete_radial_target_batch",
      "resolve_each_secondary_damage_roll_and_lifecycle",
      "resolve_terminal_target_outcome",
      "resolve_source_post_batch_lifecycle",
    ],
    strictForwardWitnessRequired: true,
    claimBoundary: "The radial bound is a necessary predecessor region, not an explosion witness. Strict replay must prove the exact trigger and timing, target batch, non-attack damage semantics, simultaneous ordering, every required roll and lifecycle branch, terminal result, and source removal policy.",
  };
}

function bridgeSecondaryDamageAlternatives(
  state = {},
  template = {},
  actor = {},
  atom = {},
  hook = {},
  rawOptions = {},
) {
  if (template.goalType !== "assassination" ||
    !warmachineBridgeSecondaryDamageSupportsTerminalRegression(hook)) return null;
  const primitiveKey = String(hook.primitiveKey || "");
  const boxedTrigger = primitiveKey === "secondary_damage_batch_then_remove_boxed_model";
  const hitTrigger = primitiveKey === "secondary_damage_on_direct_basic_attack_hit";
  if (!boxedTrigger && !hitTrigger) return null;
  const parameters = hook.parameters || {};
  const terminalTarget = (state.pieces || []).find((piece) =>
    piece.pieceKey === template.targetPieceKey) || null;
  if (!terminalTarget || !alive(terminalTarget) || terminalTarget.pieceKey === actor.pieceKey) return null;
  const targetAllegiance = String(parameters.targetAllegiance || "any");
  if (["enemy", "enemy_models"].includes(targetAllegiance) && terminalTarget.sideKey === actor.sideKey) {
    return null;
  }
  const allCandidates = (state.pieces || []).filter((piece) => {
    if (!alive(piece) || piece.pieceKey === actor.pieceKey || piece.pieceKey === terminalTarget.pieceKey) {
      return false;
    }
    return parameters.boxedTargetEnemyRequired !== true || piece.sideKey !== actor.sideKey;
  });
  const limit = Math.max(0, Math.floor(numeric(rawOptions.maximumBridgeCandidates, 32)));
  const selectedCandidates = allCandidates.slice().sort((left, right) =>
    numeric(left.damage?.boxesRemaining ?? left.boxesRemaining, 1) -
      numeric(right.damage?.boxesRemaining ?? right.boxesRemaining, 1) ||
    left.pieceKey.localeCompare(right.pieceKey)).slice(0, limit);
  const primaryAttackKind = attackMode(template);
  const predecessorRangeIn = maximumKnownAttackRangeIn(
    actor,
    primaryAttackKind,
    template.attackProfile || {},
  );
  const targetRangeIn = Math.max(0, numeric(parameters.targetRangeIn, 0));
  const alternatives = selectedCandidates.map((bridgeTarget) => ({
    alternativeKey: `rule-regression-${stableHash({
      templateKey: template.templateKey || "",
      atomKey: atom.atomKey,
      bridgeTargetPieceKey: bridgeTarget.pieceKey,
    })}`,
    predecessorKind: boxedTrigger
      ? "box_bridge_then_secondary_damage_terminal"
      : "hit_bridge_then_secondary_damage_terminal",
    sourceAtomKey: atom.atomKey,
    sourceRuleName: atom.ruleName,
    sourcePrimitiveKey: primitiveKey,
    actorPieceKey: actor.pieceKey,
    predecessorTargetPieceKey: bridgeTarget.pieceKey,
    bridgeTargetPieceKey: bridgeTarget.pieceKey,
    terminalTargetPieceKey: terminalTarget.pieceKey,
    terminalActionKind: "secondary_damage",
    effectToPreconditions: [
      boxedTrigger ? "primary_attack_boxes_qualifying_bridge_model" : "basic_attack_directly_hits_bridge_model",
      "bridge_model_and_terminal_target_satisfy_the_declared_secondary_target_policy",
      "terminal_target_is_within_the_secondary_origin_range",
      "complete_secondary_damage_batch_is_declared_before_resolution",
      "terminal_target_secondary_damage_reaches_the_terminal_state",
      boxedTrigger ? "boxed_bridge_model_is_removed_only_after_secondary_damage" :
        "primary_and_secondary_damage_follow_the_declared_simultaneous_order",
    ],
    previousActorPositionConstraint: {
      bridgeTargetMaximumEdgeDistanceIn: predecessorRangeIn,
      predecessorAttackKind: primaryAttackKind,
      predecessorAttackRangePolicy: predecessorRangeIn == null
        ? "strict_source_profile_required_no_hard_range_bound"
        : "maximum_declared_profile_then_strict_source_profile",
      bridgeToTerminalMaximumEdgeDistanceIn: targetRangeIn,
      terminalTargetMaximumEdgeDistanceBeforeAdvanceIn: null,
      terminalTargetMaximumEdgeDistanceAfterAdvanceIn: null,
      maximumAdvanceIn: 0,
      ignoreActorToTerminalRange: true,
      bridgeRangeOccursAtIntermediateEvent: true,
      intermediateRelationKind: "secondary_damage_origin_range",
      exactCoordinateKnown: false,
    },
    predecessorTargetStateObligation: {
      targetPieceKey: bridgeTarget.pieceKey,
      requiredStage: boxedTrigger ? "boxed" : "direct_hit",
      requiredTraits: [...(parameters.requiredBoxedTargetTraits || [])].map(String),
      targetEnemyRequired: parameters.boxedTargetEnemyRequired === true,
      directHitRequired: parameters.directHitRequired === true || hitTrigger,
      basicAttackRequired: hitTrigger,
      criticalHitRequired: parameters.criticalHitRequired === true,
      targetMustBeAliveAtOpening: true,
      strictTraitHitAndLifecycleProofRequired: true,
    },
    ...(boxedTrigger ? {
      damageLifecycleObligation: {
        requiredFinalStage: "boxed",
        targetHasTough: pieceHasTough(bridgeTarget),
        toughBranchRequirement: "not_reached_when_removed_from_play_at_boxed",
        disabledAndBoxedReplacementsMustBeResolved: true,
        removedFromPlayWithoutDestroyedIsInsufficient: false,
        removeTriggerModelFromPlayAfterSecondaryDamage:
          parameters.removeBoxedModelFromPlayAfterDamage === true,
      },
      sourceLifecycleObligation: {
        sourcePieceKey: bridgeTarget.pieceKey,
        sourceEntityKind: "boxed_model",
        sourceRemovalKind: parameters.removeBoxedModelFromPlayAfterDamage === true
          ? "remove_boxed_bridge_from_play_after_secondary_damage"
          : "boxed_bridge_ordinary_lifecycle_continues",
        removeFromPlayAfterDamage: parameters.removeBoxedModelFromPlayAfterDamage === true,
        removeMarkerFromTableAfterDamage: false,
        preventsDisabledBoxedDestroyed: false,
        preventsResourceCollection: parameters.removeBoxedModelFromPlayAfterDamage === true,
        strictPostBatchSourceLifecycleProofRequired: true,
      },
    } : {}),
    terminalSecondaryDamageObligation: {
      targetPieceKey: terminalTarget.pieceKey,
      originPieceKey: bridgeTarget.pieceKey,
      targetSelection: String(parameters.targetSelection || ""),
      targetAllegiance,
      targetRangeIn,
      maximumTargetCount: parameters.maximumTargetCount ?? "all",
      controllerChoosesTies: parameters.controllerChoosesTies === true,
      includeActorAsSecondaryTarget: parameters.includeActorAsSecondaryTarget === true,
      ignoredPieceRoles: [...(parameters.ignoredPieceRoles || [])].map(String),
      damagePower: numeric(parameters.damagePower, 0),
      damageDiceCount: Math.max(1, numeric(parameters.damageDiceCount, 2)),
      damageTypes: [...(parameters.damageTypes || [])].map(String).sort(),
      unboostable: parameters.unboostable === true,
      damageCausedByAttack: parameters.damageCausedByAttack === true,
      simultaneousWithPrimaryDamage: parameters.simultaneousWithPrimaryDamage === true,
      secondaryStatusTag: String(parameters.secondaryStatusTag || ""),
      outcomeByTargetFieldKeys: [...(parameters.outcomeByTargetFieldKeys || [])].map(String),
      damageModel: String(parameters.damageModel || ""),
      strictTargetPolicyBatchOrderingDamageAndTerminalProofRequired: true,
    },
    actionSequenceObligation: {
      priorAttackRequired: true,
      priorAttackKind: primaryAttackKind,
      priorAttackMustBeBasic: hitTrigger,
      priorAttackMustDirectlyHit: hitTrigger || parameters.directHitRequired === true,
      primaryOutcomeRequired: boxedTrigger ? "boxed" : "hit",
      optionalSecondaryEffect: parameters.optional !== false,
      secondaryOriginPieceKey: bridgeTarget.pieceKey,
      strictPrimaryAttackAndSecondaryChoiceProofRequired: true,
    },
    predecessorChanceObligation: {
      requiredOutcome: boxedTrigger
        ? "primary_attack_boxes_bridge_and_secondary_damage_reaches_terminal_state"
        : "primary_attack_hits_bridge_and_secondary_damage_reaches_terminal_state",
      exactChanceMassRequired: true,
    },
    sequence: [
      boxedTrigger ? "primary_attack_boxes_bridge_model" : "primary_basic_attack_hits_bridge_model",
      "resolve_secondary_target_policy_from_bridge_origin",
      "declare_complete_secondary_damage_batch",
      "resolve_terminal_secondary_damage",
      boxedTrigger ? "remove_boxed_bridge_after_batch" : "resolve_simultaneous_primary_damage",
    ],
    strictForwardWitnessRequired: true,
    claimBoundary: "The bridge relation is only a necessary spatial and causal predecessor. Strict replay must prove the exact source profile, primary hit or boxed outcome, bridge eligibility, closest/all target policy, simultaneous batch ordering, secondary roll, terminal result, and boxed-model removal timing.",
  }));
  return {
    alternatives,
    totalCandidateCount: allCandidates.length,
    selectedCandidateCount: selectedCandidates.length,
    remainingCandidateCount: Math.max(0, allCandidates.length - selectedCandidates.length),
  };
}

export function regressWarmachineTerminalThroughRuleAtoms(inputState = {}, template = {}, rawOptions = {}) {
  const actor = (inputState.pieces || []).find((piece) => piece.pieceKey === template.attackerPieceKey) || null;
  const alternatives = [directAlternative(template)];
  const operatorAudit = [];
  let remainingCandidateCount = 0;
  if (actor && alive(actor)) {
    for (const atom of recognizedWarmachineRuleAtoms()) {
      if (!exactSourceMatch(atom, actor)) continue;
      if ((template.attackMode === "melee" || template.attackProfile?.mode === "melee") &&
        atom.reverseRegression?.regressionKind === "post_destroy_movement_then_additional_attack") {
        const expanded = killingSpreeAlternatives(inputState, template, actor, atom, rawOptions);
        alternatives.push(...expanded.alternatives);
        remainingCandidateCount += expanded.remainingCandidateCount;
        operatorAudit.push({
          atomKey: atom.atomKey,
          regressionKind: atom.reverseRegression.regressionKind,
          totalCandidateCount: expanded.totalCandidateCount,
          selectedCandidateCount: expanded.selectedCandidateCount,
          remainingCandidateCount: expanded.remainingCandidateCount,
        });
      }
      for (const hook of atom.hooks || []) {
        if (!["combat_action_token_additional_attack", "combat_action_model_rfp_additional_melee_attack"]
          .includes(String(hook.primitiveKey || ""))) continue;
        const alternative = additionalAttackResourceAlternative(template, actor, atom, hook);
        if (!alternative) continue;
        alternatives.push(alternative);
        operatorAudit.push({
          atomKey: atom.atomKey,
          primitiveKey: hook.primitiveKey,
          regressionKind: alternative.predecessorKind,
          totalCandidateCount: 1,
          selectedCandidateCount: 1,
          remainingCandidateCount: 0,
        });
      }
      for (const hook of atom.hooks || []) {
        if (!["grant_attack_window_on_destroy", "grant_same_weapon_attack_window_after_hit",
          "grant_ranged_attack_window_after_hit"].includes(String(hook.primitiveKey || ""))) continue;
        const expanded = generatedAttackAlternatives(inputState, template, actor, atom, hook, rawOptions);
        if (!expanded) continue;
        alternatives.push(...expanded.alternatives);
        remainingCandidateCount += expanded.remainingCandidateCount;
        operatorAudit.push({
          atomKey: atom.atomKey,
          primitiveKey: hook.primitiveKey,
          regressionKind: expanded.alternatives[0]?.predecessorKind || "generated_attack_no_candidate",
          totalCandidateCount: expanded.totalCandidateCount,
          selectedCandidateCount: expanded.selectedCandidateCount,
          remainingCandidateCount: expanded.remainingCandidateCount,
        });
      }
      for (const hook of atom.hooks || []) {
        if (!["grant_movement_window_on_destroy", "grant_movement_window_after_attack_resolved",
          "optional_push_follow_after_basic_attack"].includes(String(hook.primitiveKey || ""))) continue;
        if (atom.reverseRegression?.regressionKind) continue;
        const expanded = movementBridgeAlternatives(inputState, template, actor, atom, hook, rawOptions);
        if (!expanded) continue;
        alternatives.push(...expanded.alternatives);
        remainingCandidateCount += expanded.remainingCandidateCount;
        operatorAudit.push({
          atomKey: atom.atomKey,
          primitiveKey: hook.primitiveKey,
          regressionKind: expanded.alternatives[0]?.predecessorKind || "movement_bridge_no_candidate",
          totalCandidateCount: expanded.totalCandidateCount,
          selectedCandidateCount: expanded.selectedCandidateCount,
          remainingCandidateCount: expanded.remainingCandidateCount,
        });
      }
      for (const hook of atom.hooks || []) {
        if (String(hook.primitiveKey || "") !== "status_on_hit") continue;
        const expanded = statusOnHitAlternatives(inputState, template, actor, atom, hook, rawOptions);
        if (!expanded) continue;
        alternatives.push(...expanded.alternatives);
        remainingCandidateCount += expanded.remainingCandidateCount;
        operatorAudit.push({
          atomKey: atom.atomKey,
          primitiveKey: hook.primitiveKey,
          regressionKind: expanded.alternatives[0]?.predecessorKind || "terminal_status_no_candidate",
          totalCandidateCount: expanded.totalCandidateCount,
          selectedCandidateCount: expanded.selectedCandidateCount,
          remainingCandidateCount: expanded.remainingCandidateCount,
        });
      }
      for (const hook of atom.hooks || []) {
        if (String(hook.primitiveKey || "") !== "activation_sequence_contribution") continue;
        const alternative = activationSequenceTerminalAlternative(template, actor, atom, hook);
        if (!alternative) continue;
        alternatives.push(alternative);
        operatorAudit.push({
          atomKey: atom.atomKey,
          primitiveKey: hook.primitiveKey,
          regressionKind: alternative.predecessorKind,
          totalCandidateCount: 1,
          selectedCandidateCount: 1,
          remainingCandidateCount: 0,
        });
      }
      for (const hook of atom.hooks || []) {
        if (String(hook.primitiveKey || "") !== "grant_action_window_on_destroy") continue;
        const expanded = destroyGrantedMeleeAlternatives(inputState, template, actor, atom, hook, rawOptions);
        if (!expanded) continue;
        alternatives.push(...expanded.alternatives);
        remainingCandidateCount += expanded.remainingCandidateCount;
        operatorAudit.push({
          atomKey: atom.atomKey,
          primitiveKey: hook.primitiveKey,
          regressionKind: expanded.alternatives[0]?.predecessorKind || "destroy_granted_melee_no_candidate",
          totalCandidateCount: expanded.totalCandidateCount,
          selectedCandidateCount: expanded.selectedCandidateCount,
          remainingCandidateCount: expanded.remainingCandidateCount,
        });
      }
      for (const hook of atom.hooks || []) {
        if (String(hook.primitiveKey || "") !==
          "explosion_secondary_damage_batch_then_remove_source") continue;
        const alternative = explosionSecondaryDamageAlternative(inputState, template, actor, atom, hook);
        if (!alternative) continue;
        alternatives.push(alternative);
        operatorAudit.push({
          atomKey: atom.atomKey,
          primitiveKey: hook.primitiveKey,
          regressionKind: alternative.predecessorKind,
          totalCandidateCount: 1,
          selectedCandidateCount: 1,
          remainingCandidateCount: 0,
        });
      }
      for (const hook of atom.hooks || []) {
        if (!["secondary_damage_batch_then_remove_boxed_model",
          "secondary_damage_on_direct_basic_attack_hit"].includes(String(hook.primitiveKey || ""))) continue;
        const expanded = bridgeSecondaryDamageAlternatives(
          inputState,
          template,
          actor,
          atom,
          hook,
          rawOptions,
        );
        if (!expanded) continue;
        alternatives.push(...expanded.alternatives);
        remainingCandidateCount += expanded.remainingCandidateCount;
        operatorAudit.push({
          atomKey: atom.atomKey,
          primitiveKey: hook.primitiveKey,
          regressionKind: expanded.alternatives[0]?.predecessorKind ||
            "bridge_secondary_damage_no_candidate",
          totalCandidateCount: expanded.totalCandidateCount,
          selectedCandidateCount: expanded.selectedCandidateCount,
          remainingCandidateCount: expanded.remainingCandidateCount,
        });
      }
    }
    const soulTokenFundedAlternatives = alternatives.filter((alternative) =>
      alternative.resourceObligation?.paymentKind === "resource_token_spend" &&
      (alternative.resourceObligation?.tokenKinds || []).includes("soul"));
    if (soulTokenFundedAlternatives.length) {
      for (const atom of recognizedWarmachineRuleAtoms()) {
        if (!exactSourceMatch(atom, actor)) continue;
        for (const hook of atom.hooks || []) {
          if (String(hook.primitiveKey || "") !== "soul_token_claim_on_destroy") continue;
          for (const baseAlternative of soulTokenFundedAlternatives) {
            const expanded = soulClaimAlternatives(
              inputState,
              template,
              actor,
              baseAlternative,
              atom,
              hook,
              rawOptions,
            );
            alternatives.push(...expanded.alternatives);
            remainingCandidateCount += expanded.remainingCandidateCount;
            operatorAudit.push({
              atomKey: atom.atomKey,
              primitiveKey: hook.primitiveKey,
              regressionKind: expanded.alternatives[0]?.predecessorKind || "soul_claim_no_candidate",
              baseAlternativeKey: baseAlternative.alternativeKey,
              totalCandidateCount: expanded.totalCandidateCount,
              selectedCandidateCount: expanded.selectedCandidateCount,
              remainingCandidateCount: expanded.remainingCandidateCount,
            });
          }
        }
      }
    }
  }
  const spatialQuotient = quotientWarmachineReverseAlternatives(inputState, alternatives, {
    declaredTransforms: rawOptions.declaredSpatialTransforms,
    fixedPieceKeys: [template.attackerPieceKey, template.targetPieceKey].filter(Boolean),
  });
  return {
    schemaVersion: WARMACHINE_REVERSE_RULE_REGRESSION_SCHEMA,
    regressionKey: `reverse-rule-regression-${stableHash({
      templateKey: template.templateKey || "",
      alternatives: alternatives.map((entry) => entry.alternativeKey),
    })}`,
    templateKey: template.templateKey || "",
    actorPieceKey: template.attackerPieceKey || "",
    terminalTargetPieceKey: template.targetPieceKey || "",
    alternatives,
    searchAlternatives: spatialQuotient.representatives,
    alternativeCount: alternatives.length,
    searchAlternativeCount: spatialQuotient.quotientAlternativeCount,
    certifiedSpatialCollapseCount: spatialQuotient.certifiedCollapsedCount,
    spatialQuotient,
    ruleDerivedAlternativeCount: Math.max(0, alternatives.length - 1),
    remainingCandidateCount,
    cursorExhausted: remainingCandidateCount === 0,
    operatorAudit,
    claimBoundary: "These are OR causal predecessors and position-region constraints, not inverse rules-v1 states. Every selected route still requires strict forward replay from the bound opening.",
  };
}
