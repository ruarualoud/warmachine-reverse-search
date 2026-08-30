import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  strictOpponentReactionRequirementsForAction,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { buildWarmachineLazyActionCursorPlan } from "./lazy-action-cursor-v1.mjs";
import { buildWarmachineUnitCombatActionAttackSlotDomainV1 } from
  "./unit-combat-action-attack-slot-domain-v1.mjs";

export const WARMACHINE_COMPLETE_ACTIVATION_DOMAIN_V2_SCHEMA =
  "warmachine_complete_activation_domain_v2";
export const WARMACHINE_COMPLETE_ACTIVATION_DOMAIN_PAGE_V2_SCHEMA =
  "warmachine_complete_activation_domain_page_v2";

const CONTROL_PHASE_GLOBAL_FAMILY_KEY = "control_phase_global_window";
const ACTION_FAMILY_KEYS = [
  "scenario",
  "attack_or_effect",
  "movement",
  "resource",
  "timing",
  "special",
];

function array(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueSorted(values = []) {
  return [...new Set(Array.from(values).map(String).filter(Boolean))].sort();
}

function actionKeys(rows = []) {
  return uniqueSorted(rows.map((row) => row.actionKey));
}

function rejectionIdentity(row = {}) {
  return stableGraphHash(stableGraphValue({
    actionKey: String(row.actionKey || ""),
    rejection: row.rejection || null,
  }));
}

function rejectionIdentities(rows = []) {
  return uniqueSorted(rows.map(rejectionIdentity));
}

function equalStringSets(left = [], right = []) {
  return JSON.stringify(uniqueSorted(left)) === JSON.stringify(uniqueSorted(right));
}

function boundedPageLimit(value) {
  const parsed = Number(value ?? 8);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 64) {
    throw new Error("complete_activation_domain_page_limit_invalid");
  }
  return parsed;
}

export function classifyWarmachineCompleteActivationActionFamilyV2(action = {}) {
  const type = String(action.actionType || "").toLowerCase();
  if (/score|contest|objective/.test(type)) return "scenario";
  if (/attack|charge|slam|throw|headbutt|trample|spell|animus/.test(type)) {
    return "attack_or_effect";
  }
  if (/advance|run|move|place|reposition/.test(type)) return "movement";
  if (/focus|fury|force|leech|resource|upkeep/.test(type)) return "resource";
  if (/^end_|activation_end|pass|forfeit|resolve|decline|stand_up|shake/.test(type)) {
    return "timing";
  }
  return "special";
}

function hostFamilyContract(inputState = {}) {
  if (inputState.phaseKey === "control") {
    return {
      familyKeys: [CONTROL_PHASE_GLOBAL_FAMILY_KEY],
      scopeMode: "full_phase_global",
      probeReceiptHash: stableGraphHash(stableGraphValue({
        phaseKey: inputState.phaseKey,
        familyKey: CONTROL_PHASE_GLOBAL_FAMILY_KEY,
        rule: "control_phase_uses_one_global_mandatory_window",
      })),
    };
  }
  return {
    familyKeys: ACTION_FAMILY_KEYS,
    scopeMode: "search_mirror_verified_against_host_action_family_scope",
    probeReceiptHash: stableGraphHash(stableGraphValue({
      actionFamilyKeys: ACTION_FAMILY_KEYS,
      classifierVersion: "enumeration_action_family_regex_v20260825",
      hostReceiptHash: String(warmachineHost.receipt.receiptHash || ""),
    })),
  };
}

function groupEnumerationOptions(group = {}, groupIndex = 0, familyKey = "") {
  return {
    ...(array(group.actorPieceKeys).length
      ? { actorPieceKeys: uniqueSorted(group.actorPieceKeys) }
      : {}),
    ...(groupIndex === 0 ? { includeActorlessActions: true } : {}),
    ...(familyKey ? { actionFamilyKeys: [familyKey] } : {}),
  };
}

function continuousDebtsForSlot(
  plan = {},
  slot = {},
  acceptedActions = [],
  enumeration = {},
) {
  const debts = [];
  if (slot.familyKey === "movement" && plan.phaseKey !== "control") {
    debts.push({
      debtKey: `${slot.slotKey}:continuous-movement`,
      reason: "continuous_movement_endpoint_path_and_unit_domain_unresolved",
      actorPieceKeys: slot.actorPieceKeys,
      chanceMass: null,
    });
  }
  const explicitCoordinateActionKeys = acceptedActions.filter((action) =>
    action.destination || array(action.destinationsByModel).length ||
    array(action.groupDestinations).length || action.metadata?.destination ||
    array(action.metadata?.movementPathPoints).length ||
    array(action.metadata?.destinationsByModel).length).map((action) => action.actionKey);
  if (explicitCoordinateActionKeys.length && slot.familyKey !== "movement") {
    debts.push({
      debtKey: `${slot.slotKey}:non-movement-coordinate-parameters`,
      reason: "non_movement_continuous_coordinate_parameter_audit_pending",
      actionKeys: uniqueSorted(explicitCoordinateActionKeys),
      chanceMass: null,
    });
  }
  const combinedAttackActionKeys = acceptedActions.filter((action) =>
    ["combined_melee_attack", "combined_ranged_attack"].includes(
      String(action.actionType || "").toLowerCase(),
    )).map((action) => action.actionKey);
  if (combinedAttackActionKeys.length) {
    const statePiecesByKey = new Map(array(enumeration.state?.pieces).map((piece) =>
      [String(piece.pieceKey || ""), piece]));
    const combinedUnitGroupIds = uniqueSorted(acceptedActions
      .filter((action) => ["combined_melee_attack", "combined_ranged_attack"].includes(
        String(action.actionType || "").toLowerCase(),
      ))
      .map((action) => statePiecesByKey.get(String(action.actorPieceKey || ""))?.unitGroupId));
    const hostAttackSlotPlans = combinedUnitGroupIds.map((unitGroupId) => {
      const domain = buildWarmachineUnitCombatActionAttackSlotDomainV1(
        enumeration.state,
        { unitGroupId, sideKey: enumeration.state?.activeSideKey || "" },
      );
      return {
        unitGroupId,
        hostAttackSlotPlanHash: domain.hostAttackSlotPlanHash,
        unitCombatActionAttackSlotDomainHash:
          domain.unitCombatActionAttackSlotDomainHash,
        printedInitialAttackSlotCount:
          domain.printedInitialAttackSlotCount,
        printedInitialAttackSlotDenominatorComplete:
          domain.printedInitialAttackSlotDenominatorComplete,
        combinedAttackExactSlotConsumptionLedgerPresent:
          domain.combinedAttackExactSlotConsumptionLedgerPresent,
        combinedAttackExactSlotConsumptionImplemented:
          domain.combinedAttackExactSlotConsumptionImplemented,
        currentCombinedAttackEnumeratesAllPrimarySlots:
          domain.currentCombinedAttackEnumeratesAllPrimarySlots,
        currentCombinedAttackEnumeratesAllHelperSlots:
          domain.currentCombinedAttackEnumeratesAllHelperSlots,
        currentCombinedAttackEnumeratesAllNonemptyParticipantSets:
          domain.currentCombinedAttackEnumeratesAllNonemptyParticipantSets,
        currentCombinedAttackTargetLegalityStrict:
          domain.currentCombinedAttackTargetLegalityStrict,
        currentCombinedMeleeChargeClassStrict:
          domain.currentCombinedMeleeChargeClassStrict,
        combinedAttackGroupingDomainComplete:
          domain.combinedAttackGroupingDomainComplete,
      };
    });
    debts.push({
      debtKey: `${slot.slotKey}:unit-combined-attack-partition-domain`,
      reason: "unit_combined_attack_full_combat_action_partition_unresolved",
      actionKeys: uniqueSorted(combinedAttackActionKeys),
      hostAttackSlotPlans,
      requiredAxes: [
        "ordered_mixed_individual_and_combined_initial_attacks",
        "ordered_multiple_combined_attacks",
        "opponent_reactions",
        "chance_outcomes",
        "successor_equivalence",
      ],
      chanceMass: null,
    });
  }
  const reactionRows = acceptedActions.map((action) => ({
    actionKey: action.actionKey,
    requirements: strictOpponentReactionRequirementsForAction(
      action,
      {
        rulesV1State: enumeration.state,
        rulesV1Enumeration: enumeration,
      },
      enumeration.state?.activeSideKey || "",
    ),
  })).filter((row) => row.requirements.length);
  if (reactionRows.length) {
    debts.push({
      debtKey: `${slot.slotKey}:opponent-response-domain`,
      reason: "opponent_response_use_decline_parameter_and_chance_domain_unresolved",
      actionKeys: uniqueSorted(reactionRows.map((row) => row.actionKey)),
      reactionRequirementCount: reactionRows.reduce((sum, row) =>
        sum + row.requirements.length, 0),
      requiredAxes: [
        "use_or_decline",
        "reaction_destination",
        "priority_order",
        "chance_outcome",
        "strict_successor",
      ],
      opponentQuantifier: "opponent_and",
      chanceMass: null,
    });
  }
  return stableGraphValue(debts);
}

export function buildWarmachineCompleteActivationDomainPlanV2(
  inputState = {},
  options = {},
) {
  const state = normalizeRulesV1State(inputState);
  const lazyPlan = buildWarmachineLazyActionCursorPlan(state, {
    priorityActorPieceKeys: options.priorityActorPieceKeys,
  });
  const familyContract = hostFamilyContract(state);
  const slots = lazyPlan.groups.flatMap((group, groupIndex) =>
    familyContract.familyKeys.map((familyKey) => ({
      slotKey: `activation-slot-${String(groupIndex + 1).padStart(4, "0")}-${familyKey}`,
      groupIndex,
      groupKey: String(group.groupKey || ""),
      actorPieceKeys: uniqueSorted(group.actorPieceKeys),
      pieceCount: Number(group.pieceCount || 0),
      includeActorlessActions: groupIndex === 0,
      familyKey,
    }))).map((slot, slotIndex) => stableGraphValue({ ...slot, slotIndex }));
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_COMPLETE_ACTIVATION_DOMAIN_V2_SCHEMA,
    hostReceiptHash: String(warmachineHost.receipt.receiptHash || ""),
    hostFocusedExecutionReceiptCurrent:
      warmachineHost.focusedSourceReceipt?.current === true,
    stateHash: stableGraphHash(state),
    stateKey: String(state.stateKey || ""),
    phaseKey: String(state.phaseKey || ""),
    activeSideKey: String(state.activeSideKey || ""),
    lazyPlan,
    hostActionFamilyProbeReceiptHash: familyContract.probeReceiptHash,
    actionFamilyScopeMode: familyContract.scopeMode,
    actionFamilyKeys: familyContract.familyKeys,
    actionFamilyCount: familyContract.familyKeys.length,
    activationGroupCount: lazyPlan.groupCount,
    slotCount: slots.length,
    slots,
    discreteSlotPlanComplete: true,
    continuousDomainPlanComplete: false,
    chanceMassAssigned: false,
    claimBoundary:
      "This plan closes the current Host's actor-group by action-family slot denominator. It does not close continuous endpoints, paths, Unit placements, non-movement coordinate choices, transition stability, multi-action sequences or strategy value.",
  });
  return {
    ...core,
    activationDomainPlanHash: stableGraphHash(core),
  };
}

function validateCursor(plan = {}, cursor = {}) {
  const nextSlotIndex = Number(cursor.nextSlotIndex ?? 0);
  if (!Number.isInteger(nextSlotIndex) || nextSlotIndex < 0 ||
      nextSlotIndex > plan.slotCount) {
    throw new Error("complete_activation_domain_cursor_out_of_range");
  }
  if (cursor.activationDomainPlanHash &&
      cursor.activationDomainPlanHash !== plan.activationDomainPlanHash) {
    throw new Error("complete_activation_domain_cursor_plan_hash_mismatch");
  }
  return nextSlotIndex;
}

function materializeSlot(state = {}, plan = {}, slot = {}, groupBaseCache = new Map()) {
  if (!groupBaseCache.has(slot.groupIndex)) {
    groupBaseCache.set(slot.groupIndex, enumerateRulesV1Actions(
      state,
      groupEnumerationOptions(plan.lazyPlan.groups[slot.groupIndex], slot.groupIndex),
    ));
  }
  const base = groupBaseCache.get(slot.groupIndex);
  const fullPhaseGlobal = plan.actionFamilyScopeMode === "full_phase_global";
  const acceptedActions = array(base.actions).filter((action) => fullPhaseGlobal ||
    classifyWarmachineCompleteActivationActionFamilyV2(action) === slot.familyKey);
  const rejectedActions = array(base.rejectedActions).filter((rejected) =>
    fullPhaseGlobal ||
    classifyWarmachineCompleteActivationActionFamilyV2(rejected) === slot.familyKey);
  const scopeValid = base.schemaVersion === "warmachine_rules_v1_legal_actions" &&
    (!slot.actorPieceKeys.length || (
      base.actorScopeApplied === true &&
      equalStringSets(base.actorScopePieceKeys, slot.actorPieceKeys)
    ));
  const continuousDomainDebts = continuousDebtsForSlot(
    plan,
    slot,
    acceptedActions,
    base,
  );
  const core = stableGraphValue({
    schemaVersion: "warmachine_complete_activation_domain_slot_v2",
    activationDomainPlanHash: plan.activationDomainPlanHash,
    ...slot,
    scopeValid,
    baseEnumerationActionCount: Number(base.actionCount || 0),
    baseEnumerationRejectedActionCount: Number(base.rejectedActionCount || 0),
    acceptedActionCount: acceptedActions.length,
    acceptedActionKeys: actionKeys(acceptedActions),
    acceptedActions: stableGraphValue(acceptedActions),
    rejectedActionCount: rejectedActions.length,
    rejectedActionIdentities: rejectionIdentities(rejectedActions),
    rejectedActions: stableGraphValue(rejectedActions),
    scopeOnlySuppressedActionCount: 0,
    scopeOnlySuppressedActionKeys: [],
    familyClassifierContractHash: plan.hostActionFamilyProbeReceiptHash,
    discreteShellDisposition: scopeValid
      ? "host_enumerated_current_discrete_shell"
      : "unresolved_host_scope_contract_invalid",
    continuousDomainDebts,
    continuousDomainComplete: continuousDomainDebts.length === 0,
    chanceMass: null,
    chanceMassAssigned: false,
    claimBoundary:
      "Accepted and rejected rows are partitioned from one unscoped current-window Host result by a versioned classifier whose focused verifier compares every row with Host family scopes. No family-scoped call can resurrect an action suppressed by a mandatory global window.",
  });
  return {
    ...core,
    slotReceiptHash: stableGraphHash(core),
  };
}

export function enumerateNextWarmachineCompleteActivationDomainPageV2(
  inputState = {},
  cursor = {},
  options = {},
) {
  const state = normalizeRulesV1State(inputState);
  const plan = buildWarmachineCompleteActivationDomainPlanV2(state, options);
  const nextSlotIndex = validateCursor(plan, cursor);
  const pageLimit = boundedPageLimit(options.pageLimit);
  const selectedSlots = plan.slots.slice(nextSlotIndex, nextSlotIndex + pageLimit);
  const groupBaseCache = new Map();
  const slotReceipts = selectedSlots.map((slot) =>
    materializeSlot(state, plan, slot, groupBaseCache));
  const followingSlotIndex = nextSlotIndex + selectedSlots.length;
  const exhausted = followingSlotIndex >= plan.slotCount;
  const remainingSlots = plan.slots.slice(followingSlotIndex);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_COMPLETE_ACTIVATION_DOMAIN_PAGE_V2_SCHEMA,
    activationDomainPlanHash: plan.activationDomainPlanHash,
    pageStartSlotIndex: nextSlotIndex,
    pageEndSlotIndexExclusive: followingSlotIndex,
    pageSlotCount: slotReceipts.length,
    slotReceipts,
    validSlotReceiptCount: slotReceipts.filter((row) => row.scopeValid).length,
    invalidSlotReceiptCount: slotReceipts.filter((row) => !row.scopeValid).length,
    cursor: {
      activationDomainPlanHash: plan.activationDomainPlanHash,
      nextSlotIndex: followingSlotIndex,
      exhausted,
    },
    exhausted,
    remainingSlotCount: remainingSlots.length,
    remainingSlotKeys: remainingSlots.map((slot) => slot.slotKey),
    unresolvedDiscreteSlotCount:
      remainingSlots.length + slotReceipts.filter((row) => !row.scopeValid).length,
    discreteSlotDenominatorComplete: nextSlotIndex === 0 && exhausted &&
      slotReceipts.length === plan.slotCount && slotReceipts.every((row) => row.scopeValid),
    activationDomainComplete: false,
    chanceMassAssigned: false,
    claimBoundary: exhausted
      ? "No later actor-family slot remains, but earlier pages and all continuous-domain debts must still be conserved before activation completeness."
      : "Unseen actor-family slots remain unresolved and are recoverable from the sealed cursor.",
  });
  return {
    ...core,
    pageReceiptHash: stableGraphHash(core),
  };
}

function validateCompletedPage(plan = {}, page = {}, expectedStartSlotIndex = 0) {
  const { pageReceiptHash, ...core } = page;
  if (page.schemaVersion !== WARMACHINE_COMPLETE_ACTIVATION_DOMAIN_PAGE_V2_SCHEMA ||
      !pageReceiptHash || stableGraphHash(core) !== pageReceiptHash) {
    throw new Error("complete_activation_domain_resume_page_receipt_invalid");
  }
  if (page.activationDomainPlanHash !== plan.activationDomainPlanHash ||
      page.cursor?.activationDomainPlanHash !== plan.activationDomainPlanHash) {
    throw new Error("complete_activation_domain_resume_page_plan_hash_mismatch");
  }
  if (Number(page.pageStartSlotIndex) !== expectedStartSlotIndex ||
      Number(page.pageEndSlotIndexExclusive) !== Number(page.cursor?.nextSlotIndex) ||
      Number(page.pageSlotCount) !== array(page.slotReceipts).length) {
    throw new Error("complete_activation_domain_resume_page_range_invalid");
  }
  for (const slot of page.slotReceipts) {
    const { slotReceiptHash, ...slotCore } = slot;
    if (!slotReceiptHash || stableGraphHash(slotCore) !== slotReceiptHash ||
        slot.activationDomainPlanHash !== plan.activationDomainPlanHash) {
      throw new Error("complete_activation_domain_resume_slot_receipt_invalid");
    }
  }
  return Number(page.pageEndSlotIndexExclusive);
}

export function exhaustWarmachineCompleteActivationDomainV2(
  inputState = {},
  options = {},
) {
  const state = normalizeRulesV1State(inputState);
  const plan = buildWarmachineCompleteActivationDomainPlanV2(state, options);
  const completedPages = array(options.completedPages);
  let expectedStartSlotIndex = 0;
  for (const page of completedPages) {
    expectedStartSlotIndex = validateCompletedPage(
      plan,
      page,
      expectedStartSlotIndex,
    );
  }
  let cursor = completedPages.length
    ? stableGraphValue(completedPages.at(-1).cursor)
    : {
    activationDomainPlanHash: plan.activationDomainPlanHash,
    nextSlotIndex: 0,
    exhausted: false,
  };
  const pageReceipts = completedPages.map((page) => stableGraphValue({
    pageReceiptHash: page.pageReceiptHash,
    pageStartSlotIndex: page.pageStartSlotIndex,
    pageEndSlotIndexExclusive: page.pageEndSlotIndexExclusive,
    pageSlotCount: page.pageSlotCount,
    validSlotReceiptCount: page.validSlotReceiptCount,
    invalidSlotReceiptCount: page.invalidSlotReceiptCount,
    remainingSlotCount: page.remainingSlotCount,
  }));
  const slotReceipts = completedPages.flatMap((page) => page.slotReceipts);
  while (!cursor.exhausted) {
    const page = enumerateNextWarmachineCompleteActivationDomainPageV2(
      state,
      cursor,
      options,
    );
    if (page.activationDomainPlanHash !== plan.activationDomainPlanHash) {
      throw new Error("complete_activation_domain_page_plan_hash_drift");
    }
    pageReceipts.push(stableGraphValue({
      pageReceiptHash: page.pageReceiptHash,
      pageStartSlotIndex: page.pageStartSlotIndex,
      pageEndSlotIndexExclusive: page.pageEndSlotIndexExclusive,
      pageSlotCount: page.pageSlotCount,
      validSlotReceiptCount: page.validSlotReceiptCount,
      invalidSlotReceiptCount: page.invalidSlotReceiptCount,
      remainingSlotCount: page.remainingSlotCount,
    }));
    slotReceipts.push(...page.slotReceipts);
    cursor = page.cursor;
    if (typeof options.onPage === "function") {
      options.onPage(pageReceipts.at(-1), page);
    }
  }
  const acceptedActions = new Map();
  const rejectedActions = new Map();
  const acceptedAssignmentCounts = new Map();
  const rejectedAssignmentCounts = new Map();
  for (const slot of slotReceipts) {
    for (const action of slot.acceptedActions) {
      acceptedActions.set(action.actionKey, action);
      acceptedAssignmentCounts.set(
        action.actionKey,
        Number(acceptedAssignmentCounts.get(action.actionKey) || 0) + 1,
      );
    }
    for (const rejected of slot.rejectedActions) {
      const identity = rejectionIdentity(rejected);
      rejectedActions.set(identity, rejected);
      rejectedAssignmentCounts.set(
        identity,
        Number(rejectedAssignmentCounts.get(identity) || 0) + 1,
      );
    }
  }
  const fullHostParityRequested = options.verifyFullHostParity !== false;
  const full = fullHostParityRequested ? enumerateRulesV1Actions(state) : null;
  const acceptedActionKeyParity = full
    ? equalStringSets(acceptedActions.keys(), actionKeys(full.actions))
    : null;
  const rejectedActionIdentityParity = full
    ? equalStringSets(rejectedActions.keys(), rejectionIdentities(full.rejectedActions))
    : null;
  const duplicateAcceptedActionKeys = uniqueSorted([...acceptedAssignmentCounts]
    .filter(([, count]) => count !== 1).map(([actionKey]) => actionKey));
  const duplicateRejectedActionIdentities = uniqueSorted([...rejectedAssignmentCounts]
    .filter(([, count]) => count !== 1).map(([identity]) => identity));
  const actionAssignmentUnique = duplicateAcceptedActionKeys.length === 0 &&
    duplicateRejectedActionIdentities.length === 0;
  const actorFamilySlotDenominatorComplete = slotReceipts.length === plan.slotCount &&
    slotReceipts.every((row) => row.scopeValid) &&
    actionAssignmentUnique;
  const discreteSlotDenominatorComplete = actorFamilySlotDenominatorComplete &&
    acceptedActionKeyParity === true && rejectedActionIdentityParity === true;
  const continuousDomainDebts = stableGraphValue([
    ...slotReceipts.flatMap((row) => row.continuousDomainDebts),
    {
      debtKey: "activation-domain:non-movement-continuous-parameter-audit",
      reason: "non_movement_continuous_parameter_families_not_yet_proven_closed",
      chanceMass: null,
    },
    ...(plan.lazyPlan.groups.some((group) => Number(group.pieceCount || 0) > 1)
      ? [{
        debtKey: "activation-domain:unit-joint-geometry",
        reason: "unit_joint_geometry_and_path_domain_unresolved",
        chanceMass: null,
      }]
      : []),
    {
      debtKey: "activation-domain:path-class-partition",
      reason: "path_class_and_ordered_trigger_partition_unresolved",
      chanceMass: null,
    },
    {
      debtKey: "activation-domain:transition-stability",
      reason: "alternating_transition_stability_unresolved",
      chanceMass: null,
    },
  ]);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_COMPLETE_ACTIVATION_DOMAIN_V2_SCHEMA,
    activationDomainPlanHash: plan.activationDomainPlanHash,
    hostReceiptHash: plan.hostReceiptHash,
    stateHash: plan.stateHash,
    pageCount: pageReceipts.length,
    pageReceipts,
    slotCount: plan.slotCount,
    slotReceiptCount: slotReceipts.length,
    slotReceipts,
    acceptedActionCount: acceptedActions.size,
    acceptedActionKeys: uniqueSorted(acceptedActions.keys()),
    rejectedActionCount: rejectedActions.size,
    rejectedActionIdentities: uniqueSorted(rejectedActions.keys()),
    fullHostParityRequested,
    fullHostAcceptedActionCount: full ? Number(full.actionCount || 0) : null,
    fullHostRejectedActionCount: full ? Number(full.rejectedActionCount || 0) : null,
    acceptedActionKeyParity,
    rejectedActionIdentityParity,
    actionAssignmentUnique,
    duplicateAcceptedActionKeys,
    duplicateRejectedActionIdentities,
    actorFamilySlotDenominatorComplete,
    discreteSlotDenominatorComplete,
    continuousDomainDebts,
    continuousDomainDebtCount: continuousDomainDebts.length,
    continuousDomainComplete: false,
    transitionStable: false,
    activationDomainComplete: false,
    chanceMassAssigned: false,
    claimBoundary:
      "The actor-family slot cursor may close independently, but the complete discrete shell requires exact unscoped Host parity. When that expensive parity is deferred it remains null, not true. Continuous choices, Unit joint geometry, path/trigger classes and transition stability remain explicit unresolved debts.",
  });
  return {
    ...core,
    completeActivationDomainReceiptHash: stableGraphHash(core),
  };
}
