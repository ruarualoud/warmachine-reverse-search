import { enumerateWarmachineBenchmarkActionsV2 } from
  "./fixed-steamroller-benchmark-v2.mjs";
import {
  warmachineBenchmarkRuntimeWindowActiveV2,
} from "./fixed-steamroller-benchmark-v2.mjs";
import { buildWarmachineActivationGroups } from "../search/matchup-search-v1.mjs";
import { canonicalWarmachineActingSideActionsV1 } from
  "../search/opponent-response-v1.mjs";

export const WARMACHINE_FIXED_ASSASSINATION_POLICY_V1_SCHEMA =
  "warmachine_fixed_assassination_policy_v1";

function destinationFor(action, actor) {
  const rows = action.destinationsByModel || action.metadata?.destinationsByModel || [];
  if (rows.length) {
    return {
      xIn: rows.reduce((sum, row) => sum + Number(row.to?.xIn || 0), 0) / rows.length,
      yIn: rows.reduce((sum, row) => sum + Number(row.to?.yIn || 0), 0) / rows.length,
    };
  }
  return action.destination || actor?.position || null;
}

function distanceBetween(left = {}, right = {}) {
  return Math.hypot(
    Number(left.xIn || 0) - Number(right.xIn || 0),
    Number(left.yIn || 0) - Number(right.yIn || 0),
  );
}

function effectSummary(effects = []) {
  return effects.map((effect) => ({
    atomKey: String(effect.atomKey || effect.ruleAtomKey || ""),
    hookKey: String(effect.hookKey || ""),
    effectType: String(effect.effectType || ""),
    active: effect.active !== false,
    conditionMatched: effect.conditionMatched ?? null,
    primitiveType: String(effect.primitive?.primitiveType || ""),
    outcomeRequirementCount: (effect.outcomeRequirements || []).length,
  }));
}

export function createWarmachineFixedAssassinationPolicyV1(rawConfig = {}) {
  const config = {
    targetPieceKey: String(rawConfig.targetPieceKey || ""),
    casterPieceKey: String(rawConfig.casterPieceKey || ""),
    channelerPieceKey: String(rawConfig.channelerPieceKey || ""),
    firstActionKey: String(rawConfig.firstActionKey || ""),
  };
  if (Object.values(config).some((value) => !value)) {
    throw new Error("fixed_assassination_policy_config_incomplete");
  }
  let firstActionAudit = null;
  const selectPolicyAction = ({ state, cursor }) => {
    const target = state.pieces.find((piece) => piece.pieceKey === config.targetPieceKey);
    if (!target || target.destroyed === true || Number(target.damage?.boxesRemaining || 0) <= 0) {
      return { nodeType: "terminal", outcome: "success", reason: "target_leader_destroyed" };
    }
    let scoped = null;
    if (warmachineBenchmarkRuntimeWindowActiveV2(state)) {
      scoped = enumerateWarmachineBenchmarkActionsV2(state, {
        targetPieceKeys: [config.targetPieceKey],
        includeUntargetedActions: true,
        actionFamilyKeys: ["movement", "attack_or_effect", "timing", "resource", "special"],
      });
    } else {
      const channelerGroup = buildWarmachineActivationGroups(state).find((group) =>
        group.actorPieceKeys.includes(config.channelerPieceKey));
      if (!channelerGroup) {
        return {
          nodeType: "terminal",
          outcome: "failure",
          reason: "raptor_activation_unavailable_before_target_destroyed",
        };
      }
      scoped = enumerateWarmachineBenchmarkActionsV2(state, {
        activationGroupKey: channelerGroup.groupKey,
        targetPieceKeys: [config.targetPieceKey],
        includeUntargetedActions: false,
        actionFamilyKeys: ["movement", "attack_or_effect", "timing", "resource"],
      });
    }
    const canonical = canonicalWarmachineActingSideActionsV1(scoped.enumeration);
    const runtimeActorKeys = new Set(scoped.actorPieceKeys || []);

    let selected = null;
    if (Number(cursor) === 0) {
      selected = canonical.find((action) => action.actionKey === config.firstActionKey) || null;
    } else if (runtimeActorKeys.has(config.casterPieceKey)) {
      const caster = state.pieces.find((piece) => piece.pieceKey === config.casterPieceKey);
      const channeler = state.pieces.find((piece) => piece.pieceKey === config.channelerPieceKey);
      const targetedSpells = canonical.filter((action) =>
        action.targetPieceKey === config.targetPieceKey && /spell/.test(action.actionType));
      const advance = canonical.filter((action) =>
        action.actorPieceKey === config.casterPieceKey && action.actionType === "advance")
        .sort((left, right) =>
          distanceBetween(destinationFor(left, caster), channeler?.position || {}) -
          distanceBetween(destinationFor(right, caster), channeler?.position || {}) ||
          left.actionKey.localeCompare(right.actionKey))[0] || null;
      selected = targetedSpells.slice().sort((left, right) =>
        Number(right.expectedDamage || 0) - Number(left.expectedDamage || 0) ||
        left.actionKey.localeCompare(right.actionKey))[0] || advance ||
        canonical.find((action) => /pass|end_|activation_complete/.test(action.actionType)) || null;
    } else if (runtimeActorKeys.has(config.channelerPieceKey)) {
      selected = canonical.filter((action) =>
        action.targetPieceKey === config.targetPieceKey &&
        /attack|charge|slam|throw|headbutt|trample/.test(action.actionType))
        .sort((left, right) =>
          Number(right.actionType === "charge") - Number(left.actionType === "charge") ||
          Number(right.expectedDamage || 0) - Number(left.expectedDamage || 0) ||
          left.actionKey.localeCompare(right.actionKey))[0] ||
        canonical.find((action) => /pass|end_|activation_complete/.test(action.actionType)) || null;
    }
    if (!selected) {
      return {
        nodeType: "terminal",
        outcome: "unresolved",
        reason: "fixed_assassination_policy_found_no_scoped_legal_action",
      };
    }
    const selectedAction = scoped.enumeration.actions.find((action) =>
      action.actionKey === selected.actionKey) || selected;
    if (Number(cursor) === 0) {
      const resolution = selectedAction.metadata?.attackResolution || {};
      const damageOutcomes = resolution.damageRollDistribution?.outcomes || [];
      firstActionAudit = {
        actionKey: selectedAction.actionKey,
        actionType: selectedAction.actionType,
        spellName: selectedAction.spellName,
        targetBoxesRemaining: Number(target.damage?.boxesRemaining || 0),
        attackResolution: {
          attackDiceCount: resolution.attackDiceCount,
          damageDiceCount: resolution.damageDiceCount,
          targetNumber: resolution.targetNumber,
          staticDamage: resolution.damageRollDistribution?.staticDamage,
          maximumDamage: damageOutcomes.reduce((maximum, outcome) =>
            Math.max(maximum, Number(outcome.damage || 0)), 0),
          damageRollNotRequired: resolution.damageRollNotRequired === true,
        },
        ruleAtomEffects: effectSummary(selectedAction.metadata?.ruleAtomEffects || []),
        specialRuleEffects: effectSummary(
          selectedAction.metadata?.specialRuleAnalysis?.effects || [],
        ),
        specialRuleAtomEffects: effectSummary(
          selectedAction.metadata?.specialRuleAnalysis?.ruleAtomEffects || [],
        ),
        unresolvedRuleKeys: selectedAction.metadata?.specialRuleAnalysis?.unresolvedRuleKeys || [],
      };
    }
    return {
      scoped,
      action: selectedAction,
      deterministicAction: !selectedAction.metadata?.attackResolution,
      nextPolicyCursor: Number(cursor) + 1,
    };
  };
  const classifyState = ({ state }) => {
    const target = state.pieces.find((piece) => piece.pieceKey === config.targetPieceKey);
    return !target || target.destroyed === true || Number(target.damage?.boxesRemaining || 0) <= 0
      ? { outcome: "success", reason: "target_leader_destroyed" }
      : { outcome: "continue" };
  };
  return {
    schemaVersion: WARMACHINE_FIXED_ASSASSINATION_POLICY_V1_SCHEMA,
    config,
    selectPolicyAction,
    classifyState,
    firstActionAudit: () => firstActionAudit,
  };
}
