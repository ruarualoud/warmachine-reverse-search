import { stableGraphHash, stableGraphValue } from
  "../graph/typed-facts-v2.mjs";

export const WARMACHINE_CONTINUATION_PLAN_WORKLIST_V1_SCHEMA =
  "warmachine_continuation_plan_worklist_v1";

function array(value) {
  return Array.isArray(value) ? value : [];
}

function validateLedger(ledger = {}) {
  const receiptHash = String(
    ledger.activationActionFrontierLedgerReceiptHash || "",
  );
  const core = { ...ledger };
  delete core.activationActionFrontierLedgerReceiptHash;
  delete core.ok;
  if (!receiptHash || stableGraphHash(core) !== receiptHash) {
    throw new Error("continuation_plan_worklist_ledger_invalid");
  }
  return ledger;
}

export function buildWarmachineContinuationPlanWorklistV1(
  ledgerInput = {},
  planRowInputs = [],
) {
  const ledger = validateLedger(ledgerInput);
  const classByKey = new Map(array(ledger.continuationClasses).map((row) =>
    [String(row.classKey || ""), row]));
  const planRows = array(planRowInputs).slice().sort((left, right) =>
    String(left.continuationClassKey || "").localeCompare(
      String(right.continuationClassKey || ""),
    ));
  if (planRows.length !== classByKey.size) {
    throw new Error("continuation_plan_worklist_class_count_mismatch");
  }
  const seen = new Set();
  for (const row of planRows) {
    const classKey = String(row.continuationClassKey || "");
    const sourceClass = classByKey.get(classKey);
    if (!sourceClass || seen.has(classKey) ||
        row.sourceClassReceiptHash !== sourceClass.classReceiptHash ||
        row.representativeStateId !== sourceClass.representativeStateId ||
        row.successorStateHash !== sourceClass.successorStateHash ||
        row.stateRecoverable !== true ||
        !row.activationDomainPlanHash) {
      throw new Error("continuation_plan_worklist_class_binding_invalid");
    }
    seen.add(classKey);
  }
  const planShapeGroups = new Map();
  for (const row of planRows) {
    if (!planShapeGroups.has(row.planShapeHash)) {
      planShapeGroups.set(row.planShapeHash, []);
    }
    planShapeGroups.get(row.planShapeHash).push(row.continuationClassKey);
  }
  const planShapeRows = [...planShapeGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([planShapeHash, continuationClassKeys]) => stableGraphValue({
      planShapeHash,
      continuationClassCount: continuationClassKeys.length,
      continuationClassKeys: continuationClassKeys.slice().sort(),
      computationSharingAllowed: false,
      schedulingBatchingAllowed: true,
    }));
  const totalSlotCount = planRows.reduce((sum, row) =>
    sum + Number(row.slotCount || 0), 0);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_CONTINUATION_PLAN_WORKLIST_V1_SCHEMA,
    sourceLedgerReceiptHash:
      ledger.activationActionFrontierLedgerReceiptHash,
    continuationContextKey: ledger.continuationContextKey,
    hostReceiptHash: ledger.hostReceiptHash,
    querySideKey: ledger.querySideKey,
    sourceDecisionOwnerSideKey: ledger.decisionOwnerSideKey,
    continuationClassCount: ledger.continuationClassCount,
    planRowCount: planRows.length,
    totalSlotCount,
    planRows,
    planShapeCount: planShapeRows.length,
    planShapeRows,
    everyRepresentativeStateRecoverable: planRows.every((row) =>
      row.stateRecoverable === true),
    everyDiscretePlanCreated: planRows.every((row) =>
      row.discreteSlotPlanComplete === true),
    worklistReady: planRows.length === ledger.continuationClassCount &&
      planRows.every((row) => row.stateRecoverable === true &&
        row.discreteSlotPlanComplete === true),
    completeOpponentTurn: false,
    chanceDomainComplete: false,
    responseDomainComplete: false,
    strategyValuePublicationAllowed: false,
    unresolvedReasons: [
      "continuation_plan_slots_not_materialized",
      "continuation_plan_actions_not_strict_expanded",
      "continuous_parameters_unresolved",
      "response_and_chance_domains_unexpanded",
      "plan_shapes_not_rule_or_strategy_equivalence_classes",
    ],
    claimBoundary:
      "This worklist gives every retained rule-behavior continuation class one recoverable representative and one exact discrete activation-slot cursor. Equal plan shapes may be scheduled together but cannot share action results without later strict successor equivalence. No slot, response, Chance outcome or full opponent turn is closed here.",
  });
  return {
    ...core,
    continuationPlanWorklistReceiptHash: stableGraphHash(core),
    ok: core.worklistReady,
  };
}
