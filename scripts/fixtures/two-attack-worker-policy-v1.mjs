import { enumerateWarmachineBenchmarkActionsV2 } from
  "../../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import { canonicalWarmachineActingSideActionsV1 } from
  "../../src/search/opponent-response-v1.mjs";

export function createTwoAttackWorkerPolicyV1(rawConfig = {}) {
  const attackerPieceKey = String(rawConfig.attackerPieceKey || "");
  const targetPieceKey = String(rawConfig.targetPieceKey || "");
  const firstActionKey = String(rawConfig.firstActionKey || "");
  const maximumAttackCount = Math.max(1, Number(rawConfig.maximumAttackCount || 2));
  const selectPolicyAction = ({ state, cursor }) => {
    const scoped = enumerateWarmachineBenchmarkActionsV2(state, {
      actorPieceKeys: [attackerPieceKey],
      targetPieceKeys: [targetPieceKey],
      actionFamilyKeys: ["attack_or_effect", "resource", "timing"],
      includeUntargetedActions: false,
    });
    const legalAttacks = canonicalWarmachineActingSideActionsV1(scoped.enumeration)
      .filter((action) => action.targetPieceKey === targetPieceKey &&
        action.metadata?.attackResolution);
    const action = legalAttacks.find((candidate) =>
      Number(cursor) === 0 ? candidate.actionKey === firstActionKey : true) || null;
    return { scoped, action, nextPolicyCursor: Number(cursor) + 1 };
  };
  const classifyState = ({ state, cursor }) => {
    const target = state.pieces.find((piece) => piece.pieceKey === targetPieceKey);
    if (!target || target.destroyed === true || Number(target.damage?.boxesRemaining || 0) <= 0) {
      return { outcome: "success", reason: "warlock_destroyed" };
    }
    if (Number(cursor) >= maximumAttackCount) {
      return { outcome: "failure", reason: "two_attack_policy_exhausted" };
    }
    return { outcome: "continue" };
  };
  return { selectPolicyAction, classifyState };
}

export function createFaultInjectedTwoAttackWorkerPolicyV1(rawConfig = {}, context = {}) {
  if (String(context.labelKey || "") === String(rawConfig.failLabelKey || "")) {
    throw new Error(`fixture_worker_failure:${context.labelKey}`);
  }
  return createTwoAttackWorkerPolicyV1(rawConfig);
}
