import { stableGraphHash, stableGraphValue } from
  "../graph/typed-facts-v2.mjs";

export const WARMACHINE_KNOWN_ROUTE_CONTINUATION_REFINEMENT_V1_SCHEMA =
  "warmachine_known_route_continuation_refinement_v1";

function array(value) {
  return Array.isArray(value) ? value : [];
}

function validateReceipt(raw = {}, hashField, reason) {
  const receiptHash = String(raw[hashField] || "");
  const core = { ...raw };
  delete core[hashField];
  delete core.ok;
  if (!receiptHash || stableGraphHash(core) !== receiptHash) {
    throw new Error(reason);
  }
  return raw;
}

export function buildWarmachineKnownRouteContinuationRefinementV1(
  baseRefinementInput = {},
  continuationEvidenceInputs = [],
  continuationPlanWorklistInputs = [],
  continuationSlotMaterializationInputs = [],
  continuationActionExecutionInputs = [],
) {
  const base = validateReceipt(
    baseRefinementInput,
    "strategyRefinementReceiptHash",
    "known_route_continuation_refinement_base_invalid",
  );
  const planByActionKey = new Map(array(
    base.successorContinuationScheduling?.resumeCursors,
  ).map((row) => [String(row.sourceActionKey || ""), row]));
  const evidenceRows = array(continuationEvidenceInputs).map((input) => {
    const sourceActionKey = String(input.sourceActionKey || "");
    const materializedAcceptedActionCount = Number(
      input.materializedAcceptedActionCount,
    );
    const ledger = validateReceipt(
      input.ledger,
      "activationActionFrontierLedgerReceiptHash",
      "known_route_continuation_refinement_ledger_invalid",
    );
    const sourcePlan = planByActionKey.get(sourceActionKey);
    if (!sourceActionKey || !sourcePlan ||
        ledger.continuationContextKey !== base.bucket?.bucketHash ||
        ledger.querySideKey !== base.bucket?.querySideKey ||
        ledger.hostReceiptHash !== base.bucket?.currentHostReceiptHash ||
        ledger.sourceStateId !== sourcePlan.successorStateId ||
        ledger.activationDomainPlanHash !==
          sourcePlan.activationDomainPlanHash ||
        ledger.acceptedActionDenominator !==
          materializedAcceptedActionCount) {
      throw new Error(
        "known_route_continuation_refinement_ledger_binding_mismatch",
      );
    }
    return stableGraphValue({
      sourceActionKey,
      ledgerReceiptHash:
        ledger.activationActionFrontierLedgerReceiptHash,
      materializedAcceptedActionCount,
      executedActionCount: Number(ledger.executedActionCount || 0),
      unresolvedActionCount: Number(ledger.unresolvedActionCount || 0),
      continuationClassCount: Number(ledger.continuationClassCount || 0),
      sharedContinuationEdgeCount:
        Number(ledger.sharedContinuationEdgeCount || 0),
      currentMaterializedActionPageComplete:
        ledger.currentMaterializedActionPageComplete === true,
      rulesContinuationMemoizationAllowed:
        ledger.rulesContinuationMemoizationAllowed === true,
      strategyClassEquivalenceCertified:
        ledger.strategyClassEquivalenceCertified === true,
    });
  });
  const materializedAcceptedActionCount = Number(
    base.successorContinuationScheduling
      ?.materializedAcceptedActionCount || 0,
  );
  const executedMaterializedActionCount = evidenceRows.reduce((sum, row) =>
    sum + row.executedActionCount, 0);
  if (executedMaterializedActionCount > materializedAcceptedActionCount) {
    throw new Error(
      "known_route_continuation_refinement_executed_denominator_overflow",
    );
  }
  const remainingSlotCount = Number(
    base.successorContinuationScheduling?.remainingSlotCount || 0,
  );
  const evidenceByLedgerReceiptHash = new Map(evidenceRows.map((row) =>
    [String(row.ledgerReceiptHash || ""), row]));
  const planWorklistRows = array(continuationPlanWorklistInputs).map((input) => {
    const sourceActionKey = String(input.sourceActionKey || "");
    const worklist = validateReceipt(
      input.worklist,
      "continuationPlanWorklistReceiptHash",
      "known_route_continuation_refinement_worklist_invalid",
    );
    const evidence = evidenceByLedgerReceiptHash.get(
      String(worklist.sourceLedgerReceiptHash || ""),
    );
    if (!sourceActionKey || !evidence ||
        sourceActionKey !== evidence.sourceActionKey ||
        worklist.continuationContextKey !== base.bucket?.bucketHash ||
        worklist.hostReceiptHash !== base.bucket?.currentHostReceiptHash ||
        worklist.querySideKey !== base.bucket?.querySideKey ||
        worklist.sourceDecisionOwnerSideKey !==
          base.bucket?.decisionOwnerSideKey ||
        Number(worklist.continuationClassCount) !==
          Number(evidence.continuationClassCount)) {
      throw new Error(
        "known_route_continuation_refinement_worklist_binding_mismatch",
      );
    }
    return stableGraphValue({
      sourceActionKey,
      sourceLedgerReceiptHash: worklist.sourceLedgerReceiptHash,
      continuationPlanWorklistReceiptHash:
        worklist.continuationPlanWorklistReceiptHash,
      continuationClassCount: Number(worklist.continuationClassCount || 0),
      planRowCount: Number(worklist.planRowCount || 0),
      totalSlotCount: Number(worklist.totalSlotCount || 0),
      planShapeCount: Number(worklist.planShapeCount || 0),
      everyRepresentativeStateRecoverable:
        worklist.everyRepresentativeStateRecoverable === true,
      everyDiscretePlanCreated:
        worklist.everyDiscretePlanCreated === true,
      worklistReady: worklist.worklistReady === true,
      actionSlotsMaterialized: false,
      planShapesAuthorizeComputationSharing: false,
    });
  });
  const worklistByReceiptHash = new Map(planWorklistRows.map((row) =>
    [String(row.continuationPlanWorklistReceiptHash || ""), row]));
  const slotMaterializationRows = array(
    continuationSlotMaterializationInputs,
  ).map((input) => {
    const sourceActionKey = String(input.sourceActionKey || "");
    const ledger = validateReceipt(
      input.ledger,
      "continuationSlotMaterializationLedgerReceiptHash",
      "known_route_continuation_refinement_slot_ledger_invalid",
    );
    const worklist = worklistByReceiptHash.get(
      String(ledger.sourceWorklistReceiptHash || ""),
    );
    if (!sourceActionKey || !worklist ||
        sourceActionKey !== worklist.sourceActionKey ||
        ledger.continuationContextKey !== base.bucket?.bucketHash ||
        ledger.hostReceiptHash !== base.bucket?.currentHostReceiptHash ||
        ledger.querySideKey !== base.bucket?.querySideKey ||
        ledger.sourceDecisionOwnerSideKey !==
          base.bucket?.decisionOwnerSideKey ||
        Number(ledger.continuationClassCount) !==
          Number(worklist.continuationClassCount) ||
        Number(ledger.totalSlotCount) !== Number(worklist.totalSlotCount)) {
      throw new Error(
        "known_route_continuation_refinement_slot_ledger_binding_mismatch",
      );
    }
    return stableGraphValue({
      sourceActionKey,
      sourceWorklistReceiptHash: ledger.sourceWorklistReceiptHash,
      continuationSlotMaterializationLedgerReceiptHash:
        ledger.continuationSlotMaterializationLedgerReceiptHash,
      materializedClassCount: Number(ledger.materializedClassCount || 0),
      exhaustedClassCount: Number(ledger.exhaustedClassCount || 0),
      totalSlotCount: Number(ledger.totalSlotCount || 0),
      materializedSlotCount: Number(ledger.materializedSlotCount || 0),
      remainingSlotCount: Number(ledger.remainingSlotCount || 0),
      acceptedActionCount: Number(ledger.acceptedActionCount || 0),
      rejectedActionCount: Number(ledger.rejectedActionCount || 0),
      invalidSlotReceiptCount:
        Number(ledger.invalidSlotReceiptCount || 0),
      slotDenominatorConserved: ledger.slotDenominatorConserved === true,
      actionTransitionsExecuted: ledger.actionTransitionsExecuted === true,
    });
  });
  const slotLedgerByReceiptHash = new Map(slotMaterializationRows.map((row) =>
    [String(row.continuationSlotMaterializationLedgerReceiptHash || ""), row]));
  const actionExecutionRows = array(continuationActionExecutionInputs)
    .map((input) => {
      const sourceActionKey = String(input.sourceActionKey || "");
      const ledger = validateReceipt(
        input.ledger,
        "continuationActionExecutionLedgerReceiptHash",
        "known_route_continuation_refinement_action_ledger_invalid",
      );
      const sourceSlotLedger = slotLedgerByReceiptHash.get(String(
        ledger.sourceSlotMaterializationLedgerReceiptHash || "",
      ));
      if (!sourceActionKey || !sourceSlotLedger ||
          sourceActionKey !== sourceSlotLedger.sourceActionKey ||
          ledger.hostReceiptHash !== base.bucket?.currentHostReceiptHash ||
          ledger.querySideKey !== base.bucket?.querySideKey ||
          Number(ledger.materializedAcceptedActionDenominator) !==
            Number(sourceSlotLedger.acceptedActionCount)) {
        throw new Error(
          "known_route_continuation_refinement_action_ledger_binding_mismatch",
        );
      }
      return stableGraphValue({
        sourceActionKey,
        sourceSlotMaterializationLedgerReceiptHash:
          ledger.sourceSlotMaterializationLedgerReceiptHash,
        continuationActionExecutionLedgerReceiptHash:
          ledger.continuationActionExecutionLedgerReceiptHash,
        sourceSlotPageCount: Number(ledger.sourceSlotPageCount || 0),
        materializedAcceptedActionDenominator:
          Number(ledger.materializedAcceptedActionDenominator || 0),
        executedActionCount: Number(ledger.executedActionCount || 0),
        remainingActionCount: Number(ledger.remainingActionCount || 0),
        transitionFailureCount: Number(ledger.transitionFailureCount || 0),
        persistedSuccessorCount: Number(ledger.persistedSuccessorCount || 0),
        actionDenominatorConserved:
          ledger.actionDenominatorConserved === true,
        allMaterializedActionsExecuted:
          ledger.allMaterializedActionsExecuted === true,
      });
    });
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_KNOWN_ROUTE_CONTINUATION_REFINEMENT_V1_SCHEMA,
    baseStrategyRefinementReceiptHash:
      base.strategyRefinementReceiptHash,
    bucketHash: base.bucket?.bucketHash,
    querySideKey: base.bucket?.querySideKey,
    decisionOwnerSideKey: base.bucket?.decisionOwnerSideKey,
    evidenceRows,
    continuationAccounting: {
      successorPlanCount:
        Number(base.successorContinuationScheduling?.successorPlanCount || 0),
      totalSlotCount:
        Number(base.successorContinuationScheduling?.totalSlotCount || 0),
      materializedSlotCount:
        Number(base.successorContinuationScheduling?.materializedSlotCount || 0),
      remainingSlotCount,
      materializedAcceptedActionCount,
      executedMaterializedActionCount,
      pendingMaterializedActionCount:
        materializedAcceptedActionCount - executedMaterializedActionCount,
      materializedRejectedActionCount:
        Number(base.successorContinuationScheduling
          ?.materializedRejectedActionCount || 0),
      continuationClassCount: evidenceRows.reduce((sum, row) =>
        sum + row.continuationClassCount, 0),
      sharedContinuationEdgeCount: evidenceRows.reduce((sum, row) =>
        sum + row.sharedContinuationEdgeCount, 0),
      acceptedAndRejectedCountsAreStrategyProbabilities: false,
    },
    nextLevelPlanAccounting: {
      worklistCount: planWorklistRows.length,
      planWorklistRows,
      plannedContinuationClassCount: planWorklistRows.reduce((sum, row) =>
        sum + row.continuationClassCount, 0),
      plannedSlotCount: planWorklistRows.reduce((sum, row) =>
        sum + row.totalSlotCount, 0),
      actionSlotsMaterialized: false,
      plannedCountsAreExecutedActions: false,
    },
    nextLevelSlotMaterializationAccounting: {
      ledgerCount: slotMaterializationRows.length,
      ledgerRows: slotMaterializationRows,
      totalSlotCount: slotMaterializationRows.reduce((sum, row) =>
        sum + row.totalSlotCount, 0),
      materializedSlotCount: slotMaterializationRows.reduce((sum, row) =>
        sum + row.materializedSlotCount, 0),
      remainingSlotCount: slotMaterializationRows.reduce((sum, row) =>
        sum + row.remainingSlotCount, 0),
      acceptedActionCount: slotMaterializationRows.reduce((sum, row) =>
        sum + row.acceptedActionCount, 0),
      rejectedActionCount: slotMaterializationRows.reduce((sum, row) =>
        sum + row.rejectedActionCount, 0),
      acceptedAndRejectedCountsAreStrategyProbabilities: false,
      actionTransitionsExecuted: false,
    },
    nextLevelActionExecutionAccounting: {
      ledgerCount: actionExecutionRows.length,
      ledgerRows: actionExecutionRows,
      materializedAcceptedActionDenominator:
        actionExecutionRows.reduce((sum, row) =>
          sum + row.materializedAcceptedActionDenominator, 0),
      executedActionCount: actionExecutionRows.reduce((sum, row) =>
        sum + row.executedActionCount, 0),
      remainingActionCount: actionExecutionRows.reduce((sum, row) =>
        sum + row.remainingActionCount, 0),
      transitionFailureCount: actionExecutionRows.reduce((sum, row) =>
        sum + row.transitionFailureCount, 0),
      persistedSuccessorCount: actionExecutionRows.reduce((sum, row) =>
        sum + row.persistedSuccessorCount, 0),
      executedActionCountsAreStrategyProbabilities: false,
    },
    fixedRouteScriptValue: base.fixedRouteScriptRefinement?.interval,
    fixedRouteScriptNumericExpansionRequired:
      base.fixedRouteScriptRefinement?.numericExpansionRequired === true,
    wholeGameValue: base.wholeGameValue?.interval,
    wholeGameExpansionRequired: true,
    allMaterializedActionsExecuted:
      executedMaterializedActionCount === materializedAcceptedActionCount,
    allSlotsMaterialized: remainingSlotCount === 0,
    fullOpponentTurnComplete: false,
    chanceDomainComplete: false,
    responseDomainComplete: false,
    effectiveStrategyQuotientComplete: false,
    strategyValuePublicationAllowed: false,
    unresolvedReasons: [
      ...(executedMaterializedActionCount < materializedAcceptedActionCount
        ? ["materialized_successor_actions_unexecuted"]
        : []),
      ...(remainingSlotCount > 0
        ? ["successor_activation_slots_unmaterialized"]
        : []),
      ...(!planWorklistRows.length
        ? ["continuation_plan_worklists_missing"]
        : !slotMaterializationRows.length
          ? ["continuation_slot_materialization_missing"]
          : slotMaterializationRows.some((row) => row.remainingSlotCount > 0)
            ? ["planned_continuation_slots_unmaterialized"]
            : []),
      ...(actionExecutionRows.length && actionExecutionRows.every((row) =>
        row.allMaterializedActionsExecuted)
        ? []
        : ["materialized_continuation_actions_unexecuted"]),
      "continuation_classes_not_strategy_equivalence_classes",
      "deeper_adaptive_continuations_unexpanded",
      "response_and_chance_domains_unexpanded",
      "opening_and_terminal_union_incomplete",
    ],
    claimBoundary:
      "This extension conserves strict action execution below the bound Ticket 22 one-ply frontier and separately accounts for every generated next-level activation plan. Rule-identical continuation states may share computation while every action label remains attached; equal plan shapes only permit scheduling batches. It does not count planned slots as executed, turn rule-state sharing into strategy equivalence, close a complete opponent turn, or alter the whole-game value interval.",
  });
  return {
    ...core,
    continuationRefinementReceiptHash: stableGraphHash(core),
    ok: evidenceRows.length > 0 &&
      planWorklistRows.length === evidenceRows.length &&
      slotMaterializationRows.length === planWorklistRows.length &&
      actionExecutionRows.length === slotMaterializationRows.length &&
      evidenceRows.every((row) =>
        row.currentMaterializedActionPageComplete &&
        row.rulesContinuationMemoizationAllowed) &&
      planWorklistRows.every((row) => row.worklistReady) &&
      slotMaterializationRows.every((row) =>
        row.slotDenominatorConserved && row.invalidSlotReceiptCount === 0) &&
      actionExecutionRows.every((row) =>
        row.actionDenominatorConserved &&
        row.allMaterializedActionsExecuted &&
        row.transitionFailureCount === 0),
  };
}
