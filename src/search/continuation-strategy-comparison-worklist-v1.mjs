import { stableGraphHash, stableGraphValue } from
  "../graph/typed-facts-v2.mjs";

export const WARMACHINE_CONTINUATION_STRATEGY_COMPARISON_WORKLIST_V1_SCHEMA =
  "warmachine_continuation_strategy_comparison_worklist_v1";

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

function validateReport(raw = {}, reason) {
  return validateReceipt(raw, "reportHash", reason);
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateActionPageReport(reportInput = {}) {
  const report = validateReport(
    reportInput,
    "continuation_strategy_comparison_action_page_report_invalid",
  );
  const frontier = validateReceipt(
    report.frontier,
    "activationActionFrontierReceiptHash",
    "continuation_strategy_comparison_action_frontier_invalid",
  );
  for (const edge of array(frontier.edges)) {
    validateReceipt(
      edge,
      "edgeReceiptHash",
      "continuation_strategy_comparison_action_edge_invalid",
    );
  }
  return report;
}

function edgeObservation(edge = {}, includeSuccessorState) {
  return stableGraphValue({
    familyKey: String(edge.familyKey || ""),
    actionType: String(edge.actionType || ""),
    transitionAccepted: edge.transitionAccepted === true,
    transitionReason: String(edge.transitionReason || ""),
    eventTypes: array(edge.eventTypes).map(String),
    terminalRows: edge.terminalRows || [],
    queryValueInterval: edge.queryValueInterval || {},
    chanceDomainResolved: edge.chanceDomainResolved === true,
    responseDomainResolved: edge.responseDomainResolved === true,
    deeperContinuationResolved: edge.deeperContinuationResolved === true,
    ...(includeSuccessorState
      ? { successorStateHash: String(edge.successorStateHash || "") }
      : {}),
  });
}

function sortedEdgeObservations(actionPageReports, includeSuccessorState) {
  return actionPageReports.flatMap((report) => report.frontier.edges)
    .map((edge) => edgeObservation(edge, includeSuccessorState))
    .sort((left, right) =>
      stableGraphHash(left).localeCompare(stableGraphHash(right)));
}

function comparisonRequirements(left, right) {
  return stableGraphValue({
    discreteSlotComplementRequired:
      left.remainingSlotCount > 0 || right.remainingSlotCount > 0,
    continuousParameterProofRequired: true,
    stateRelationProofRequired: true,
    actionCorrespondenceProofRequired: true,
    terminalAndGoalPreservationProofRequired: true,
    chanceKernelProofRequired: true,
    opponentResponseProofRequired: true,
    deeperContinuationProofRequired: true,
    historyAndObservationProofRequired: true,
  });
}

export function buildWarmachineContinuationStrategyComparisonWorklistV1(
  rawInputs = {},
) {
  const baseReport = validateReport(
    rawInputs.baseRefinementReport,
    "continuation_strategy_comparison_base_report_invalid",
  );
  const continuationReport = validateReport(
    rawInputs.continuationRefinementReport,
    "continuation_strategy_comparison_continuation_report_invalid",
  );
  const worklistReport = validateReport(
    rawInputs.planWorklistReport,
    "continuation_strategy_comparison_plan_report_invalid",
  );
  const slotLedgerReport = validateReport(
    rawInputs.slotLedgerReport,
    "continuation_strategy_comparison_slot_report_invalid",
  );
  const actionLedgerReport = validateReport(
    rawInputs.actionLedgerReport,
    "continuation_strategy_comparison_action_ledger_report_invalid",
  );
  const base = validateReceipt(
    baseReport.refinement,
    "strategyRefinementReceiptHash",
    "continuation_strategy_comparison_base_receipt_invalid",
  );
  const continuation = validateReceipt(
    continuationReport.refinement,
    "continuationRefinementReceiptHash",
    "continuation_strategy_comparison_continuation_receipt_invalid",
  );
  const planWorklist = validateReceipt(
    worklistReport.worklist,
    "continuationPlanWorklistReceiptHash",
    "continuation_strategy_comparison_plan_receipt_invalid",
  );
  const slotLedger = validateReceipt(
    slotLedgerReport.ledger,
    "continuationSlotMaterializationLedgerReceiptHash",
    "continuation_strategy_comparison_slot_receipt_invalid",
  );
  const actionLedger = validateReceipt(
    actionLedgerReport.actionExecutionLedger,
    "continuationActionExecutionLedgerReceiptHash",
    "continuation_strategy_comparison_action_ledger_receipt_invalid",
  );
  const actionPageReports = array(rawInputs.actionPageReports)
    .map(validateActionPageReport);

  const continuationPlanRow = array(
    continuation.nextLevelPlanAccounting?.planWorklistRows,
  ).find((row) => row.continuationPlanWorklistReceiptHash ===
    planWorklist.continuationPlanWorklistReceiptHash);
  const continuationSlotRow = array(
    continuation.nextLevelSlotMaterializationAccounting?.ledgerRows,
  ).find((row) => row.continuationSlotMaterializationLedgerReceiptHash ===
    slotLedger.continuationSlotMaterializationLedgerReceiptHash);
  const continuationActionRow = array(
    continuation.nextLevelActionExecutionAccounting?.ledgerRows,
  ).find((row) => row.continuationActionExecutionLedgerReceiptHash ===
    actionLedger.continuationActionExecutionLedgerReceiptHash);
  if (continuationReport.ticket22ReportHash !== baseReport.reportHash ||
      continuation.baseStrategyRefinementReceiptHash !==
        base.strategyRefinementReceiptHash ||
      continuation.bucketHash !== base.bucket?.bucketHash ||
      planWorklist.continuationContextKey !== base.bucket?.bucketHash ||
      planWorklist.hostReceiptHash !== base.bucket?.currentHostReceiptHash ||
      planWorklist.querySideKey !== base.bucket?.querySideKey ||
      planWorklist.sourceDecisionOwnerSideKey !==
        base.bucket?.decisionOwnerSideKey ||
      !continuationPlanRow || !continuationSlotRow ||
      !continuationActionRow ||
      slotLedger.sourceWorklistReceiptHash !==
        planWorklist.continuationPlanWorklistReceiptHash ||
      actionLedger.sourceSlotMaterializationLedgerReceiptHash !==
        slotLedger.continuationSlotMaterializationLedgerReceiptHash ||
      slotLedgerReport.worklistReportHash !== worklistReport.reportHash ||
      actionLedgerReport.worklistReportHash !== worklistReport.reportHash ||
      actionLedgerReport.slotLedgerReportHash !== slotLedgerReport.reportHash) {
    throw new Error(
      "continuation_strategy_comparison_evidence_chain_mismatch",
    );
  }
  if (slotLedger.continuationClassCount !==
      planWorklist.continuationClassCount ||
      actionLedger.hostReceiptHash !== planWorklist.hostReceiptHash ||
      actionLedger.querySideKey !== planWorklist.querySideKey ||
      actionLedger.allMaterializedActionsExecuted !== true ||
      Number(actionLedger.remainingActionCount || 0) !== 0 ||
      Number(actionLedger.transitionFailureCount || 0) !== 0 ||
      slotLedger.slotDenominatorConserved !== true ||
      Number(slotLedger.invalidSlotReceiptCount || 0) !== 0) {
    throw new Error(
      "continuation_strategy_comparison_execution_denominator_invalid",
    );
  }

  const plansByClassKey = new Map(array(planWorklist.planRows).map(
    (row, classIndex) => [String(row.continuationClassKey || ""), {
      ...row,
      classIndex,
    }],
  ));
  const slotsByClassKey = new Map(array(slotLedger.classRows).map((row) =>
    [String(row.continuationClassKey || ""), row]));
  const actionRowsByClassKey = new Map();
  for (const row of array(actionLedger.sourceRows)) {
    const classKey = String(row.continuationClassKey || "");
    if (!actionRowsByClassKey.has(classKey)) {
      actionRowsByClassKey.set(classKey, []);
    }
    actionRowsByClassKey.get(classKey).push(row);
  }
  const pagesByClassKey = new Map();
  const consumedFrontierHashes = new Set();
  for (const report of actionPageReports) {
    const classKey = String(report.continuationClassKey || "");
    if (!pagesByClassKey.has(classKey)) pagesByClassKey.set(classKey, []);
    pagesByClassKey.get(classKey).push(report);
    const receiptHash = String(
      report.frontier.activationActionFrontierReceiptHash || "",
    );
    if (!receiptHash || consumedFrontierHashes.has(receiptHash)) {
      throw new Error(
        "continuation_strategy_comparison_action_page_duplicate",
      );
    }
    consumedFrontierHashes.add(receiptHash);
  }

  const classRows = [...plansByClassKey.values()].map((plan) => {
    const classKey = String(plan.continuationClassKey || "");
    const slot = slotsByClassKey.get(classKey);
    const actionRows = array(actionRowsByClassKey.get(classKey));
    const pages = array(pagesByClassKey.get(classKey)).slice().sort(
      (left, right) =>
        String(left.sourceSlotPageReportHash || "").localeCompare(
          String(right.sourceSlotPageReportHash || ""),
        ) || left.frontier.page.startActionIndex -
          right.frontier.page.startActionIndex,
    );
    if (!slot || Number(slot.classIndex) !== plan.classIndex ||
        actionRows.length !== Number(slot.pageCount || 0) ||
        !pages.length) {
      throw new Error(
        "continuation_strategy_comparison_class_evidence_missing",
      );
    }
    const pageHashes = pages.map((page) =>
      page.frontier.activationActionFrontierReceiptHash);
    const expectedHashes = actionRows.flatMap((row) =>
      array(row.actionFrontierReceiptHashes));
    if (!sameArray(pageHashes.slice().sort(), expectedHashes.slice().sort()) ||
        pages.some((page) =>
          Number(page.classIndex) !== plan.classIndex ||
          page.worklistReportHash !== worklistReport.reportHash ||
          page.frontier.hostReceiptHash !== planWorklist.hostReceiptHash ||
          page.frontier.querySideKey !== planWorklist.querySideKey ||
          page.frontier.sourceStateId !== plan.representativeStateId ||
          page.frontier.sourceStateHash !== plan.successorStateHash ||
          page.frontier.activationDomainPlanHash !==
            plan.activationDomainPlanHash ||
          page.frontier.decisionOwnerSideKey !==
            planWorklist.sourceDecisionOwnerSideKey ||
          page.frontier.transitionFailureCount !== 0)) {
      throw new Error(
        "continuation_strategy_comparison_class_evidence_drift",
      );
    }
    const executedActionCount = pages.reduce((sum, page) =>
      sum + Number(page.frontier.page?.edgeCount || 0), 0);
    const actionDenominator = actionRows.reduce((sum, row) =>
      sum + Number(row.acceptedActionDenominator || 0), 0);
    if (executedActionCount !== actionDenominator ||
        actionRows.some((row) => row.exhausted !== true)) {
      throw new Error(
        "continuation_strategy_comparison_class_action_incomplete",
      );
    }
    const exactObservedTransitions = sortedEdgeObservations(pages, true);
    const abstractObservedActions = sortedEdgeObservations(pages, false);
    const exactObservedTransitionFingerprint = stableGraphHash({
      planShapeHash: plan.planShapeHash,
      decisionOwnerSideKey: planWorklist.sourceDecisionOwnerSideKey,
      quantifier: pages[0].frontier.quantifier,
      materializedSlotCount: Number(slot.materializedSlotCount || 0),
      remainingSlotCount: Number(slot.remainingSlotCount || 0),
      edges: exactObservedTransitions,
    });
    const abstractObservedActionShapeHash = stableGraphHash({
      planShapeHash: plan.planShapeHash,
      decisionOwnerSideKey: planWorklist.sourceDecisionOwnerSideKey,
      quantifier: pages[0].frontier.quantifier,
      materializedSlotCount: Number(slot.materializedSlotCount || 0),
      remainingSlotCount: Number(slot.remainingSlotCount || 0),
      edges: abstractObservedActions,
    });
    const core = stableGraphValue({
      continuationClassKey: classKey,
      classIndex: plan.classIndex,
      representativeStateId: plan.representativeStateId,
      sourceStateHash: plan.successorStateHash,
      planShapeHash: plan.planShapeHash,
      slotCount: Number(plan.slotCount || 0),
      materializedSlotCount: Number(slot.materializedSlotCount || 0),
      remainingSlotCount: Number(slot.remainingSlotCount || 0),
      discreteSlotsExhausted: slot.exhausted === true,
      observedActionCount: executedActionCount,
      exactObservedTransitionFingerprint,
      abstractObservedActionShapeHash,
      actionFrontierReceiptHashes: pageHashes.slice().sort(),
      exactStrategyEquivalenceCertified: false,
      hardMergeAllowed: false,
    });
    return { ...core, classComparisonReceiptHash: stableGraphHash(core) };
  }).sort((left, right) => left.continuationClassKey.localeCompare(
    right.continuationClassKey,
  ));
  if (classRows.length !== Number(planWorklist.continuationClassCount || 0) ||
      consumedFrontierHashes.size !== actionPageReports.length) {
    throw new Error(
      "continuation_strategy_comparison_class_denominator_mismatch",
    );
  }

  const exactGroups = new Map();
  const candidateGroups = new Map();
  for (const row of classRows) {
    if (!exactGroups.has(row.exactObservedTransitionFingerprint)) {
      exactGroups.set(row.exactObservedTransitionFingerprint, []);
    }
    exactGroups.get(row.exactObservedTransitionFingerprint).push(row);
    if (!candidateGroups.has(row.abstractObservedActionShapeHash)) {
      candidateGroups.set(row.abstractObservedActionShapeHash, []);
    }
    candidateGroups.get(row.abstractObservedActionShapeHash).push(row);
  }
  const candidateGroupRows = [...candidateGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([candidateGroupKey, members]) => {
      const sortedMembers = members.slice().sort((left, right) =>
        left.continuationClassKey.localeCompare(right.continuationClassKey));
      const representative = sortedMembers[0];
      const pairwiseComparisonCount =
        sortedMembers.length * (sortedMembers.length - 1) / 2;
      const core = stableGraphValue({
        candidateGroupKey,
        memberCount: sortedMembers.length,
        representativeClassKey: representative.continuationClassKey,
        continuationClassKeys: sortedMembers.map((row) =>
          row.continuationClassKey),
        pairwiseComparisonCount,
        initialRepresentativeChallengeCount:
          Math.max(0, sortedMembers.length - 1),
        candidateGroupingIsStrategyEquivalence: false,
        hardMergeAllowed: false,
      });
      return { ...core, candidateGroupReceiptHash: stableGraphHash(core) };
    });
  const comparisonTasks = candidateGroupRows.flatMap((group) => {
    const representative = classRows.find((row) =>
      row.continuationClassKey === group.representativeClassKey);
    return group.continuationClassKeys.slice(1).map((challengerClassKey) => {
      const challenger = classRows.find((row) =>
        row.continuationClassKey === challengerClassKey);
      const core = stableGraphValue({
        candidateGroupKey: group.candidateGroupKey,
        representativeClassKey: representative.continuationClassKey,
        representativeClassReceiptHash:
          representative.classComparisonReceiptHash,
        challengerClassKey: challenger.continuationClassKey,
        challengerClassReceiptHash: challenger.classComparisonReceiptHash,
        requirements: comparisonRequirements(representative, challenger),
        status: "pending",
        equivalenceCertified: false,
        dominanceCertified: false,
        hardPruneAllowed: false,
        adaptiveRegroupOnCounterexample: true,
      });
      return { ...core, comparisonTaskHash: stableGraphHash(core) };
    });
  });
  const allPairwiseCandidateCount = candidateGroupRows.reduce((sum, row) =>
    sum + row.pairwiseComparisonCount, 0);
  const core = stableGraphValue({
    schemaVersion:
      WARMACHINE_CONTINUATION_STRATEGY_COMPARISON_WORKLIST_V1_SCHEMA,
    sourceBaseStrategyRefinementReceiptHash:
      base.strategyRefinementReceiptHash,
    sourceContinuationRefinementReceiptHash:
      continuation.continuationRefinementReceiptHash,
    sourcePlanWorklistReceiptHash:
      planWorklist.continuationPlanWorklistReceiptHash,
    sourceSlotLedgerReceiptHash:
      slotLedger.continuationSlotMaterializationLedgerReceiptHash,
    sourceActionLedgerReceiptHash:
      actionLedger.continuationActionExecutionLedgerReceiptHash,
    goalContext: base.bucket,
    classCount: classRows.length,
    classRows,
    exactObservedTransitionClassCount: exactGroups.size,
    candidateGroupCount: candidateGroupRows.length,
    candidateGroupRows,
    allPairwiseCandidateCount,
    initialComparisonTaskCount: comparisonTasks.length,
    comparisonTasks,
    materializedSlotCount: Number(slotLedger.materializedSlotCount || 0),
    remainingSlotCount: Number(slotLedger.remainingSlotCount || 0),
    exhaustedClassCount: Number(slotLedger.exhaustedClassCount || 0),
    observedActionCount: Number(actionLedger.executedActionCount || 0),
    observedFirstPageCoverageComplete:
      Number(slotLedger.materializedClassCount || 0) === classRows.length &&
      actionLedger.allMaterializedActionsExecuted === true,
    exactObservedTransitionReuseCount:
      classRows.length - exactGroups.size,
    hardMergeCount: 0,
    hardPruneCount: 0,
    strategyEquivalenceCertified: false,
    strategyDominanceCertified: false,
    effectiveStrategyQuotientComplete: false,
    adaptiveComparisonClosureRequired: comparisonTasks.length > 0,
    strategyValuePublicationAllowed: false,
    unresolvedReasons: [
      ...(Number(slotLedger.remainingSlotCount || 0) > 0
        ? ["continuation_slot_complements_unmaterialized"]
        : []),
      "continuous_parameter_domains_unresolved",
      "candidate_pairs_not_compared",
      "state_relations_not_certified",
      "opponent_responses_unresolved",
      "chance_kernels_unresolved",
      "deeper_adaptive_continuations_unresolved",
      "terminal_union_and_opening_reachability_incomplete",
    ],
    claimBoundary:
      "This receipt groups all currently observed continuation classes only to schedule goal-conditioned equivalence or dominance challenges. Exact successor fingerprints remain distinct, every concrete class and action identity is retained, and no candidate group authorizes a merge or prune. Representative-first tasks are an adaptive initial worklist, not a substitute for counterexample-driven regrouping, unmaterialized slots, continuous parameters, responses, Chance or deeper continuation proof.",
  });
  return {
    ...core,
    continuationStrategyComparisonWorklistReceiptHash: stableGraphHash(core),
    ok: core.observedFirstPageCoverageComplete &&
      classRows.length > 0 && comparisonTasks.length > 0,
  };
}
