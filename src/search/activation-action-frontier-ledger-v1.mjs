import { stableGraphHash, stableGraphValue } from
  "../graph/typed-facts-v2.mjs";

export const WARMACHINE_ACTIVATION_ACTION_FRONTIER_LEDGER_V1_SCHEMA =
  "warmachine_activation_action_frontier_ledger_v1";

function array(value) {
  return Array.isArray(value) ? value : [];
}

function requireText(value, reason) {
  const normalized = String(value || "");
  if (!normalized) throw new Error(reason);
  return normalized;
}

function validateFrontier(frontier = {}) {
  const receiptHash = requireText(
    frontier.activationActionFrontierReceiptHash,
    "activation_action_frontier_ledger_receipt_required",
  );
  const core = { ...frontier };
  delete core.activationActionFrontierReceiptHash;
  delete core.ok;
  if (stableGraphHash(core) !== receiptHash) {
    throw new Error("activation_action_frontier_ledger_receipt_invalid");
  }
  for (const edge of array(frontier.edges)) {
    const edgeReceiptHash = requireText(
      edge.edgeReceiptHash,
      "activation_action_frontier_ledger_edge_receipt_required",
    );
    const edgeCore = { ...edge };
    delete edgeCore.edgeReceiptHash;
    if (stableGraphHash(edgeCore) !== edgeReceiptHash) {
      throw new Error("activation_action_frontier_ledger_edge_receipt_invalid");
    }
  }
  return frontier;
}

function sameValue(left, right) {
  return JSON.stringify(stableGraphValue(left)) ===
    JSON.stringify(stableGraphValue(right));
}

function assertSameScope(frontier, baseline) {
  for (const key of [
    "querySideKey",
    "hostReceiptHash",
    "sourceStateId",
    "sourceStateHash",
    "activationDomainPlanHash",
    "activationPageReceiptHash",
    "currentDecisionWindowDomainHash",
    "decisionOwnerSideKey",
    "quantifier",
  ]) {
    if (frontier[key] !== baseline[key]) {
      throw new Error(`activation_action_frontier_ledger_scope_drift:${key}`);
    }
  }
  if (Number(frontier.acceptedActionDenominator) !==
      Number(baseline.acceptedActionDenominator)) {
    throw new Error(
      "activation_action_frontier_ledger_denominator_drift",
    );
  }
}

function continuationClassIdentity(edge = {}, continuationContextKey = "") {
  return stableGraphValue({
    continuationContextKey,
    successorStateHash: String(edge.successorStateHash || ""),
    actionType: String(edge.actionType || ""),
    eventTypes: array(edge.eventTypes).map(String),
    terminalRows: edge.terminalRows || [],
    queryValueInterval: edge.queryValueInterval || {},
  });
}

export function buildWarmachineActivationActionFrontierLedgerV1(
  frontierInputs = [],
  rawOptions = {},
) {
  const continuationContextKey = requireText(
    rawOptions.continuationContextKey,
    "activation_action_frontier_ledger_context_required",
  );
  const frontiers = array(frontierInputs).map(validateFrontier)
    .slice().sort((left, right) =>
      Number(left.page?.startActionIndex || 0) -
      Number(right.page?.startActionIndex || 0));
  if (!frontiers.length) {
    throw new Error("activation_action_frontier_ledger_pages_required");
  }
  const baseline = frontiers[0];
  let nextActionIndex = 0;
  const edges = [];
  for (const frontier of frontiers) {
    assertSameScope(frontier, baseline);
    if (Number(frontier.page?.startActionIndex) !== nextActionIndex ||
        Number(frontier.page?.edgeCount) !== array(frontier.edges).length) {
      throw new Error(
        "activation_action_frontier_ledger_page_gap_or_overlap",
      );
    }
    for (const [offset, edge] of array(frontier.edges).entries()) {
      if (Number(edge.globalActionIndex) !== nextActionIndex + offset) {
        throw new Error(
          "activation_action_frontier_ledger_edge_index_mismatch",
        );
      }
      edges.push(edge);
    }
    nextActionIndex = Number(frontier.page.endActionIndexExclusive);
  }
  const uniqueActionKeys = new Set(edges.map((edge) => edge.actionKey));
  if (uniqueActionKeys.size !== edges.length) {
    throw new Error("activation_action_frontier_ledger_duplicate_action");
  }
  const classRows = new Map();
  for (const edge of edges.filter((candidate) =>
    candidate.transitionAccepted === true)) {
    const identity = continuationClassIdentity(
      edge,
      continuationContextKey,
    );
    const classKey = stableGraphHash(identity);
    if (!classRows.has(classKey)) {
      classRows.set(classKey, { identity, edges: [] });
    } else if (!sameValue(classRows.get(classKey).identity, identity)) {
      throw new Error(
        "activation_action_frontier_ledger_class_hash_collision",
      );
    }
    classRows.get(classKey).edges.push(edge);
  }
  const continuationClasses = [...classRows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([classKey, row]) => {
      const members = row.edges.slice().sort((left, right) =>
        String(left.actionKey || "").localeCompare(
          String(right.actionKey || ""),
        ));
      const core = stableGraphValue({
        classKey,
        ...row.identity,
        representativeActionKey: String(members[0]?.actionKey || ""),
        representativeStateId:
          array(members.map((edge) =>
            edge.successorStoredState?.stateId).filter(Boolean)).sort()[0] ||
          "",
        memberCount: members.length,
        members: members.map((edge) => ({
          actionKey: edge.actionKey,
          edgeReceiptHash: edge.edgeReceiptHash,
          successorStateId: edge.successorStoredState?.stateId,
        })),
        incomingActionIdentityRetained: true,
        strategyEquivalenceClaimed: false,
      });
      return { ...core, classReceiptHash: stableGraphHash(core) };
    });
  const acceptedActionDenominator = Number(
    baseline.acceptedActionDenominator,
  );
  const transitionFailureCount = edges.filter((edge) =>
    edge.transitionAccepted !== true).length;
  const unresolvedActionCount = Math.max(
    0,
    acceptedActionDenominator - edges.length,
  );
  const currentMaterializedActionPageComplete = Boolean(
    nextActionIndex === acceptedActionDenominator &&
    unresolvedActionCount === 0 &&
    transitionFailureCount === 0 &&
    frontiers.at(-1)?.page?.pageExhausted === true,
  );
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_ACTIVATION_ACTION_FRONTIER_LEDGER_V1_SCHEMA,
    continuationContextKey,
    querySideKey: baseline.querySideKey,
    hostReceiptHash: baseline.hostReceiptHash,
    sourceStateId: baseline.sourceStateId,
    sourceStateHash: baseline.sourceStateHash,
    activationDomainPlanHash: baseline.activationDomainPlanHash,
    activationPageReceiptHash: baseline.activationPageReceiptHash,
    currentDecisionWindowDomainHash:
      baseline.currentDecisionWindowDomainHash,
    decisionOwnerSideKey: baseline.decisionOwnerSideKey,
    quantifier: baseline.quantifier,
    pageCount: frontiers.length,
    pageReceiptHashes: frontiers.map((frontier) =>
      frontier.activationActionFrontierReceiptHash),
    acceptedActionDenominator,
    executedActionCount: edges.length,
    transitionFailureCount,
    unresolvedActionCount,
    currentMaterializedActionPageComplete,
    continuationClassCount: continuationClasses.length,
    sharedContinuationEdgeCount:
      edges.length - continuationClasses.length,
    continuationClasses,
    rulesContinuationMemoizationAllowed:
      transitionFailureCount === 0 && continuationClasses.every((row) =>
        Boolean(row.representativeStateId)),
    strategyClassEquivalenceCertified: false,
    fullOpponentTurnComplete: false,
    chanceDomainComplete: false,
    responseDomainComplete: false,
    effectiveStrategyQuotientComplete: false,
    strategyValuePublicationAllowed: false,
    unresolvedReasons: [
      ...(!currentMaterializedActionPageComplete
        ? ["materialized_action_page_incomplete"]
        : []),
      "continuation_classes_not_strategy_equivalence_classes",
      "successor_adaptive_continuations_unexpanded",
      "later_activation_slots_unmaterialized",
      "response_and_chance_domains_unexpanded",
    ],
    claimBoundary:
      "This ledger conserves a contiguous action-page denominator and may share continuation computation only for edges from the same bound parent and strategy context with identical rule-behavior state, action type, ordered events, terminal rows and value interval. Every incoming action identity remains attached. It does not certify strategy equivalence, full opponent-turn closure or game value.",
  });
  return {
    ...core,
    activationActionFrontierLedgerReceiptHash: stableGraphHash(core),
    ok: currentMaterializedActionPageComplete &&
      core.rulesContinuationMemoizationAllowed,
  };
}
