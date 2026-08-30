import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  buildRulesV1UnitCombatActionAttackSlotPlan,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";

export const WARMACHINE_UNIT_COMBAT_ACTION_ATTACK_SLOT_DOMAIN_V1_SCHEMA =
  "warmachine_unit_combat_action_attack_slot_domain_v1";

function array(value) {
  return Array.isArray(value) ? value : [];
}

function validHostPlan(plan = {}) {
  const expectedHash = String(plan.attackSlotPlanHash || "");
  if (!expectedHash) return false;
  const core = { ...plan };
  delete core.attackSlotPlanHash;
  return stableGraphHash(core) === expectedHash;
}

export function buildWarmachineUnitCombatActionAttackSlotDomainV1(
  inputState = {},
  options = {},
) {
  const state = normalizeRulesV1State(inputState);
  const hostPlan = buildRulesV1UnitCombatActionAttackSlotPlan(state, options);
  const hostPlanReceiptValid = validHostPlan(hostPlan);
  const attackSlots = array(hostPlan.memberRows).flatMap((member) =>
    array(member.attackModes).flatMap((mode) => array(mode.slots).map((slot) => ({
      ...slot,
      pieceKey: member.pieceKey,
      sideKey: member.sideKey,
      unitGroupId: member.unitGroupId,
      pendingInActiveUnitWindow: member.pendingInActiveUnitWindow,
      completedInActiveUnitWindow: member.completedInActiveUnitWindow,
      combatActionForfeited: member.combatActionForfeited,
      hasCombinedAttackRule: mode.hasCombinedAttackRule,
    }))));
  const slotIdentityKeys = attackSlots.map((slot) =>
    String(slot.attackSlotKey || ""));
  const duplicateSlotIdentityKeys = slotIdentityKeys.filter((slotKey, index) =>
    !slotKey || slotIdentityKeys.indexOf(slotKey) !== index);
  const issues = [
    ...(hostPlan.ok === true ? [] : ["host_attack_slot_plan_not_ok"]),
    ...(hostPlanReceiptValid ? [] : ["host_attack_slot_plan_hash_invalid"]),
    ...(duplicateSlotIdentityKeys.length
      ? ["host_attack_slot_identity_not_unique"]
      : []),
    ...(Number(hostPlan.printedInitialAttackSlotCount || 0) ===
      attackSlots.length
      ? []
      : ["host_attack_slot_count_mismatch"]),
  ];
  const combinedAttackRequired = array(hostPlan.combinedCapablePieceKeys).length > 0;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_UNIT_COMBAT_ACTION_ATTACK_SLOT_DOMAIN_V1_SCHEMA,
    hostReceiptHash: String(warmachineHost.receipt.receiptHash || ""),
    hostFocusedExecutionReceiptCurrent:
      warmachineHost.focusedSourceReceipt?.current === true,
    stateHash: stableGraphHash(state),
    sideKey: String(hostPlan.sideKey || ""),
    unitGroupId: String(hostPlan.unitGroupId || ""),
    hostAttackSlotPlanHash: String(hostPlan.attackSlotPlanHash || ""),
    hostAttackSlotPlanReceiptValid: hostPlanReceiptValid,
    liveMemberPieceKeys: array(hostPlan.liveMemberPieceKeys).map(String),
    printedInitialAttackSlotCount: attackSlots.length,
    attackSlots,
    unresolvedRandomRofRows: array(hostPlan.unresolvedRandomRofRows),
    randomRofChanceClosureRequired:
      hostPlan.randomRofChanceClosureRequired === true,
    combinedCapablePieceKeys: array(hostPlan.combinedCapablePieceKeys).map(String),
    combinedAttackRequired,
    printedInitialAttackSlotDenominatorComplete:
      issues.length === 0 &&
      hostPlan.printedInitialAttackSlotDenominatorComplete === true,
    combinedAttackExactSlotConsumptionLedgerPresent:
      hostPlan.combinedAttackSlotLedgerPresent === true,
    combinedAttackExactSlotConsumptionImplemented:
      hostPlan.combinedAttackExactSlotConsumptionImplemented === true,
    currentCombinedAttackEnumeratesAllPrimarySlots:
      hostPlan.currentCombinedAttackEnumeratesAllPrimarySlots === true,
    currentCombinedAttackEnumeratesAllHelperSlots:
      hostPlan.currentCombinedAttackEnumeratesAllHelperSlots === true,
    currentCombinedAttackEnumeratesAllNonemptyParticipantSets:
      hostPlan.currentCombinedAttackEnumeratesAllNonemptyParticipantSets === true,
    currentCombinedAttackTargetLegalityStrict:
      hostPlan.currentCombinedAttackTargetLegalityStrict === true,
    currentCombinedMeleeChargeClassStrict:
      hostPlan.currentCombinedMeleeChargeClassStrict === true,
    combinedAttackGroupingDomainComplete:
      hostPlan.wholeUnitCombatActionPartitionComplete === true,
    opponentResponseDomainComplete: false,
    chanceMassComplete: false,
    unitCombatActionDomainComplete: false,
    debts: array(hostPlan.debts),
    issues: [...new Set(issues)].sort(),
    continuousChoiceKind: "player_choice_not_chance",
    chanceMassAssigned: false,
    claimBoundary:
      "This Search domain binds and independently validates the Engine-owned printed initial-attack slot denominator. It does not invent slots from card text. The Host now implements exact per-contributor slot consumption and fully enumerates one current CMA/CRA over primary slots, helper slots and participant sets with strict target and charge classification. Ordered mixtures of individual and combined attacks, complete opponent responses, Chance outcomes and successor equivalence remain false until separately exhausted under the same Host receipt.",
  });
  return {
    ...core,
    unitCombatActionAttackSlotDomainHash: stableGraphHash(core),
  };
}
