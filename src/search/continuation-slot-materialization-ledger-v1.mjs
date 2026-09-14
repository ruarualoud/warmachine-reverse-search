import { stableGraphHash, stableGraphValue } from
  "../graph/typed-facts-v2.mjs";

export const WARMACHINE_CONTINUATION_SLOT_MATERIALIZATION_LEDGER_V1_SCHEMA =
  "warmachine_continuation_slot_materialization_ledger_v1";

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

function validatePage(page = {}) {
  const pageReceiptHash = String(page.pageReceiptHash || "");
  const core = { ...page };
  delete core.pageReceiptHash;
  if (!pageReceiptHash || stableGraphHash(core) !== pageReceiptHash) {
    throw new Error("continuation_slot_materialization_page_invalid");
  }
  for (const slot of array(page.slotReceipts)) {
    const slotReceiptHash = String(slot.slotReceiptHash || "");
    const slotCore = { ...slot };
    delete slotCore.slotReceiptHash;
    if (!slotReceiptHash || stableGraphHash(slotCore) !== slotReceiptHash ||
        slot.activationDomainPlanHash !== page.activationDomainPlanHash) {
      throw new Error("continuation_slot_materialization_slot_invalid");
    }
  }
  return page;
}

export function buildWarmachineContinuationSlotMaterializationLedgerV1(
  worklistInput = {},
  pageEntryInputs = [],
) {
  const worklist = validateReceipt(
    worklistInput,
    "continuationPlanWorklistReceiptHash",
    "continuation_slot_materialization_worklist_invalid",
  );
  const planRows = array(worklist.planRows);
  const planByClassKey = new Map(planRows.map((row, classIndex) =>
    [String(row.continuationClassKey || ""), { row, classIndex }]));
  const pagesByClassKey = new Map();
  for (const input of array(pageEntryInputs)) {
    const continuationClassKey = String(input.continuationClassKey || "");
    const sourcePlan = planByClassKey.get(continuationClassKey);
    const page = validatePage(input.page);
    if (!sourcePlan ||
        Number(input.classIndex) !== sourcePlan.classIndex ||
        page.activationDomainPlanHash !==
          sourcePlan.row.activationDomainPlanHash) {
      throw new Error("continuation_slot_materialization_page_binding_invalid");
    }
    if (!pagesByClassKey.has(continuationClassKey)) {
      pagesByClassKey.set(continuationClassKey, []);
    }
    pagesByClassKey.get(continuationClassKey).push(page);
  }
  const classRows = planRows.map((plan, classIndex) => {
    const pages = array(pagesByClassKey.get(plan.continuationClassKey))
      .slice().sort((left, right) =>
        Number(left.pageStartSlotIndex) - Number(right.pageStartSlotIndex));
    let nextSlotIndex = 0;
    let acceptedActionCount = 0;
    let rejectedActionCount = 0;
    let invalidSlotReceiptCount = 0;
    for (const page of pages) {
      if (Number(page.pageStartSlotIndex) !== nextSlotIndex ||
          Number(page.pageEndSlotIndexExclusive) !==
            Number(page.cursor?.nextSlotIndex) ||
          Number(page.pageSlotCount) !== array(page.slotReceipts).length) {
        throw new Error(
          "continuation_slot_materialization_page_gap_or_overlap",
        );
      }
      nextSlotIndex = Number(page.pageEndSlotIndexExclusive);
      acceptedActionCount += array(page.slotReceipts).reduce((sum, slot) =>
        sum + Number(slot.acceptedActionCount || 0), 0);
      rejectedActionCount += array(page.slotReceipts).reduce((sum, slot) =>
        sum + Number(slot.rejectedActionCount || 0), 0);
      invalidSlotReceiptCount += Number(page.invalidSlotReceiptCount || 0);
    }
    if (nextSlotIndex > Number(plan.slotCount || 0)) {
      throw new Error("continuation_slot_materialization_slot_overflow");
    }
    const core = stableGraphValue({
      continuationClassKey: plan.continuationClassKey,
      classIndex,
      representativeStateId: plan.representativeStateId,
      activationDomainPlanHash: plan.activationDomainPlanHash,
      slotCount: Number(plan.slotCount || 0),
      pageCount: pages.length,
      pageReceiptHashes: pages.map((page) => page.pageReceiptHash),
      materializedSlotCount: nextSlotIndex,
      remainingSlotCount: Number(plan.slotCount || 0) - nextSlotIndex,
      acceptedActionCount,
      rejectedActionCount,
      invalidSlotReceiptCount,
      nextCursor: pages.length
        ? pages.at(-1).cursor
        : plan.resumeCursor,
      exhausted: nextSlotIndex === Number(plan.slotCount || 0),
      materializedActionCountsAreProbabilities: false,
    });
    return { ...core, classReceiptHash: stableGraphHash(core) };
  });
  const materializedSlotCount = classRows.reduce((sum, row) =>
    sum + row.materializedSlotCount, 0);
  const remainingSlotCount = classRows.reduce((sum, row) =>
    sum + row.remainingSlotCount, 0);
  const invalidSlotReceiptCount = classRows.reduce((sum, row) =>
    sum + row.invalidSlotReceiptCount, 0);
  const core = stableGraphValue({
    schemaVersion:
      WARMACHINE_CONTINUATION_SLOT_MATERIALIZATION_LEDGER_V1_SCHEMA,
    sourceWorklistReceiptHash:
      worklist.continuationPlanWorklistReceiptHash,
    continuationContextKey: worklist.continuationContextKey,
    hostReceiptHash: worklist.hostReceiptHash,
    querySideKey: worklist.querySideKey,
    sourceDecisionOwnerSideKey: worklist.sourceDecisionOwnerSideKey,
    continuationClassCount: planRows.length,
    materializedClassCount: classRows.filter((row) => row.pageCount > 0).length,
    exhaustedClassCount: classRows.filter((row) => row.exhausted).length,
    totalSlotCount: Number(worklist.totalSlotCount || 0),
    materializedSlotCount,
    remainingSlotCount,
    acceptedActionCount: classRows.reduce((sum, row) =>
      sum + row.acceptedActionCount, 0),
    rejectedActionCount: classRows.reduce((sum, row) =>
      sum + row.rejectedActionCount, 0),
    invalidSlotReceiptCount,
    classRows,
    slotDenominatorConserved:
      materializedSlotCount + remainingSlotCount ===
        Number(worklist.totalSlotCount || 0),
    actionTransitionsExecuted: false,
    completeOpponentTurn: false,
    chanceDomainComplete: false,
    responseDomainComplete: false,
    effectiveStrategyQuotientComplete: false,
    strategyValuePublicationAllowed: false,
    unresolvedReasons: [
      ...(remainingSlotCount ? ["continuation_slots_unmaterialized"] : []),
      "materialized_slot_actions_not_strict_expanded",
      "continuous_parameters_unresolved",
      "response_and_chance_domains_unexpanded",
    ],
    claimBoundary:
      "This ledger conserves immutable Host-enumerated slot pages against the complete continuation-plan worklist. Accepted and rejected rows are candidate counts, not probabilities. It does not strict-apply accepted actions or certify a full activation, response domain, Chance domain, opponent turn or strategy value.",
  });
  return {
    ...core,
    continuationSlotMaterializationLedgerReceiptHash: stableGraphHash(core),
    ok: core.slotDenominatorConserved && invalidSlotReceiptCount === 0,
  };
}
