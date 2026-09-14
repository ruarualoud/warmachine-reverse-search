import { stableGraphHash, stableGraphValue } from
  "../graph/typed-facts-v2.mjs";
import { warmachineRuleBehaviorStateHashV1 } from
  "../state/semantic-hash-v1.mjs";
import {
  applyRulesV1Action,
  enumerateRulesV1Actions,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import {
  classifyWarmachineCompleteActivationActionFamilyV2,
} from "./complete-activation-domain-v2.mjs";
import {
  buildWarmachineCurrentDecisionWindowDomainFromHostEnumerationV1,
} from "./current-decision-window-domain-v1.mjs";

export const WARMACHINE_ACTIVATION_ACTION_FRONTIER_V1_SCHEMA =
  "warmachine_activation_action_frontier_v1";

function array(value) {
  return Array.isArray(value) ? value : [];
}

function boundedInteger(value, minimum, maximum, reason) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(reason);
  }
  return parsed;
}

function validateActivationPage(page = {}) {
  const pageReceiptHash = String(page.pageReceiptHash || "");
  const core = { ...page };
  delete core.pageReceiptHash;
  if (!pageReceiptHash || stableGraphHash(core) !== pageReceiptHash) {
    throw new Error("activation_action_frontier_page_receipt_invalid");
  }
  for (const slot of array(page.slotReceipts)) {
    const slotReceiptHash = String(slot.slotReceiptHash || "");
    const slotCore = { ...slot };
    delete slotCore.slotReceiptHash;
    if (!slotReceiptHash || stableGraphHash(slotCore) !== slotReceiptHash) {
      throw new Error("activation_action_frontier_slot_receipt_invalid");
    }
    if (slot.activationDomainPlanHash !== page.activationDomainPlanHash) {
      throw new Error("activation_action_frontier_slot_plan_mismatch");
    }
  }
  return page;
}

function persistState(persist, state) {
  if (typeof persist !== "function") return null;
  const record = persist(state);
  return stableGraphValue({
    stateId: String(record?.id || record?.stateId || ""),
    created: record?.created === true,
    encoding: String(record?.encoding || ""),
    deltaDepth: Number(record?.deltaDepth || 0),
    physicalBytes: Number(record?.physicalBytes || 0),
  });
}

function terminalRows(events = []) {
  return array(events).filter((event) => event.eventType === "terminal")
    .map((event) => stableGraphValue({
      winnerSideKey: String(event.winnerSideKey || ""),
      reason: String(event.reason || ""),
      marker: String(event.marker || ""),
    }));
}

function binaryInterval(events = [], querySideKey = "") {
  const terminals = terminalRows(events);
  const lowerBound = terminals.some((terminal) =>
    terminal.winnerSideKey === querySideKey) ? 1 : 0;
  const upperBound = terminals.length ? lowerBound : 1;
  return stableGraphValue({
    lowerBound,
    upperBound,
    exact: lowerBound === upperBound,
    lower: { numerator: String(lowerBound), denominator: "1" },
    upper: { numerator: String(upperBound), denominator: "1" },
  });
}

function slotActionRows(page = {}) {
  const rows = [];
  const seen = new Set();
  for (const slot of array(page.slotReceipts).slice().sort((left, right) =>
    Number(left.slotIndex || 0) - Number(right.slotIndex || 0))) {
    const actions = array(slot.acceptedActions).slice().sort((left, right) =>
      String(left.actionKey || "").localeCompare(
        String(right.actionKey || ""),
      ));
    if (actions.length !== Number(slot.acceptedActionCount || 0)) {
      throw new Error("activation_action_frontier_slot_count_mismatch");
    }
    for (const action of actions) {
      const actionKey = String(action.actionKey || "");
      if (!actionKey || seen.has(actionKey)) {
        throw new Error("activation_action_frontier_action_assignment_invalid");
      }
      seen.add(actionKey);
      rows.push({
        groupIndex: Number(slot.groupIndex || 0),
        slotIndex: Number(slot.slotIndex || 0),
        slotKey: String(slot.slotKey || ""),
        familyKey: String(slot.familyKey || ""),
        actorPieceKeys: array(slot.actorPieceKeys).map(String).sort(),
        includeActorlessActions: slot.includeActorlessActions === true,
        action,
      });
    }
  }
  return rows;
}

export function buildWarmachineActivationActionFrontierV1(
  inputState = {},
  activationPageInput = {},
  rawOptions = {},
) {
  const activationPage = validateActivationPage(activationPageInput);
  const querySideKey = String(rawOptions.querySideKey || "");
  const taskKey = String(rawOptions.taskKey || "");
  if (!querySideKey || !taskKey) {
    throw new Error("activation_action_frontier_scope_required");
  }
  const allRows = slotActionRows(activationPage);
  const cursor = rawOptions.cursor || {};
  if (cursor.activationDomainPlanHash &&
      cursor.activationDomainPlanHash !==
        activationPage.activationDomainPlanHash) {
    throw new Error("activation_action_frontier_cursor_plan_mismatch");
  }
  if (cursor.pageReceiptHash &&
      cursor.pageReceiptHash !== activationPage.pageReceiptHash) {
    throw new Error("activation_action_frontier_cursor_page_mismatch");
  }
  const startIndex = boundedInteger(
    cursor.nextActionIndex ?? 0,
    0,
    allRows.length,
    "activation_action_frontier_cursor_out_of_range",
  );
  const limit = boundedInteger(
    rawOptions.limit ?? 8,
    1,
    128,
    "activation_action_frontier_limit_invalid",
  );
  const selectedRows = allRows.slice(startIndex, startIndex + limit);
  const enumerationCache = new Map(
    rawOptions.trustedEnumerationsByGroupIndex instanceof Map
      ? rawOptions.trustedEnumerationsByGroupIndex
      : [],
  );
  for (const row of selectedRows) {
    const key = row.groupIndex;
    if (!enumerationCache.has(key)) {
      enumerationCache.set(key, enumerateRulesV1Actions(inputState, {
        ...(row.actorPieceKeys.length
          ? { actorPieceKeys: row.actorPieceKeys }
          : {}),
        ...(row.includeActorlessActions
          ? { includeActorlessActions: true }
          : {}),
      }));
    }
  }
  const firstEnumeration = enumerationCache.values().next().value ||
    enumerateRulesV1Actions(inputState);
  const rootState = firstEnumeration.state;
  const expectedStateHash = String(rawOptions.expectedStateHash || "");
  if (expectedStateHash && stableGraphHash(rootState) !== expectedStateHash) {
    throw new Error("activation_action_frontier_state_hash_mismatch");
  }
  const currentWindow =
    buildWarmachineCurrentDecisionWindowDomainFromHostEnumerationV1(
      rootState,
      firstEnumeration,
      { enumeratedInputStateReference: rootState },
    );
  const quantifier = currentWindow.decisionOwnerSideKey === querySideKey
    ? "owner_max"
    : "opponent_and_min";
  const edges = [];
  for (const [pageOffset, row] of selectedRows.entries()) {
    const enumeration = enumerationCache.get(row.groupIndex);
    const candidate = array(enumeration.actions).find((action) =>
      action.actionKey === row.action.actionKey &&
      classifyWarmachineCompleteActivationActionFamilyV2(action) ===
        row.familyKey);
    if (!candidate) {
      throw new Error("activation_action_frontier_action_binding_missing");
    }
    const applyStartedAtMs = Date.now();
    const transition = applyRulesV1Action(rootState, {
      ...candidate,
      __warmachineTrustedRulesV1Enumeration: enumeration,
    });
    const applyFinishedAtMs = Date.now();
    const accepted = transition.ok === true;
    const storedState = accepted
      ? persistState(rawOptions.persistState, transition.nextState)
      : null;
    const persistFinishedAtMs = Date.now();
    const core = stableGraphValue({
      globalActionIndex: startIndex + pageOffset,
      slotIndex: row.slotIndex,
      slotKey: row.slotKey,
      familyKey: row.familyKey,
      actionKey: String(candidate.actionKey || ""),
      actionType: String(candidate.actionType || ""),
      actorPieceKey: String(candidate.actorPieceKey || ""),
      targetPieceKey: String(candidate.targetPieceKey || ""),
      transitionAccepted: accepted,
      transitionReason: String(transition.reason || ""),
      eventTypes: array(transition.events).map((event) =>
        String(event.eventType || "")),
      terminalRows: terminalRows(transition.events),
      queryValueInterval: binaryInterval(
        transition.events,
        querySideKey,
      ),
      successorStateHash: accepted
        ? warmachineRuleBehaviorStateHashV1(transition.nextState)
        : "",
      successorStoredState: storedState,
      chanceDomainResolved: false,
      responseDomainResolved: false,
      deeperContinuationResolved: false,
    });
    edges.push({ ...core, edgeReceiptHash: stableGraphHash(core) });
    rawOptions.onProgress?.({
      stage: "activation_action_frontier_edge_complete",
      actionKey: core.actionKey,
      pageOffset,
      pageEdgeCount: selectedRows.length,
      transitionAccepted: accepted,
      applyDurationMs: applyFinishedAtMs - applyStartedAtMs,
      persistDurationMs: persistFinishedAtMs - applyFinishedAtMs,
    });
  }
  const nextActionIndex = startIndex + selectedRows.length;
  const pageExhausted = nextActionIndex >= allRows.length;
  const transitionFailureCount = edges.filter((edge) =>
    !edge.transitionAccepted).length;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_ACTIVATION_ACTION_FRONTIER_V1_SCHEMA,
    taskKey,
    querySideKey,
    hostReceiptHash: String(warmachineHost.receipt?.receiptHash || ""),
    sourceStateId: String(rawOptions.sourceStateId || ""),
    sourceStateHash: warmachineRuleBehaviorStateHashV1(rootState),
    activationDomainPlanHash: activationPage.activationDomainPlanHash,
    activationPageReceiptHash: activationPage.pageReceiptHash,
    currentDecisionWindowDomainHash:
      currentWindow.currentDecisionWindowDomainHash,
    decisionOwnerSideKey: currentWindow.decisionOwnerSideKey,
    quantifier,
    acceptedActionDenominator: allRows.length,
    page: {
      startActionIndex: startIndex,
      endActionIndexExclusive: nextActionIndex,
      edgeCount: edges.length,
      pageExhausted,
      remainingActionCount: allRows.length - nextActionIndex,
      resumeCursor: {
        activationDomainPlanHash: activationPage.activationDomainPlanHash,
        pageReceiptHash: activationPage.pageReceiptHash,
        nextActionIndex,
        exhausted: pageExhausted,
      },
    },
    edges,
    transitionFailureCount,
    acceptedDenominatorConserved:
      nextActionIndex + (allRows.length - nextActionIndex) === allRows.length,
    successorStatesPersisted: edges.every((edge) =>
      !edge.transitionAccepted || Boolean(edge.successorStoredState?.stateId)),
    currentMaterializedActionPageComplete:
      pageExhausted && transitionFailureCount === 0,
    completeOpponentTurn: false,
    chanceDomainComplete: false,
    responseDomainComplete: false,
    effectiveStrategyQuotientComplete: false,
    strategyValuePublicationAllowed: false,
    unresolvedReasons: [
      ...(!pageExhausted ? ["materialized_action_page_not_exhausted"] : []),
      "successor_response_domain_unexpanded",
      "successor_chance_domain_unexpanded",
      "successor_adaptive_continuation_unexpanded",
      "later_activation_slots_unmaterialized",
      "continuous_action_parameters_unresolved",
    ],
    claimBoundary:
      "This receipt strict-applies one stable page of Host-enumerated actions from one already-materialized activation page. Every edge starts from the same persisted parent state. Remaining actions, later slots, continuous parameters, responses, Chance and adaptive continuations stay unresolved; action counts are not probabilities.",
  });
  return {
    ...core,
    activationActionFrontierReceiptHash: stableGraphHash(core),
    ok: transitionFailureCount === 0 && core.acceptedDenominatorConserved &&
      core.successorStatesPersisted,
  };
}
