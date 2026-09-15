import { stableGraphHash, stableGraphValue } from
  "../graph/typed-facts-v2.mjs";
import { guardWarmachineActionWithTaskLocalRuleClosureV1 } from
  "../contracts/task-local-action-rule-guard-v1.mjs";
import { warmachineRuleBehaviorStateHashV1 } from
  "../state/semantic-hash-v1.mjs";
import {
  applyRulesV1Action,
  enumerateRulesV1Actions,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import {
  buildWarmachineCurrentDecisionWindowDomainFromHostEnumerationV1,
} from "./current-decision-window-domain-v1.mjs";

export const WARMACHINE_CURRENT_WINDOW_ADVERSARIAL_FRONTIER_V1_SCHEMA =
  "warmachine_current_window_adversarial_frontier_v1";

function array(value) {
  return Array.isArray(value) ? value : [];
}

function requireText(value, reason) {
  const normalized = String(value || "");
  if (!normalized) throw new Error(reason);
  return normalized;
}

function boundedIndex(value, maximum, reason) {
  const parsed = Number(value ?? 0);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > maximum) {
    throw new Error(reason);
  }
  return parsed;
}

function boundedLimit(value) {
  const parsed = Number(value ?? 16);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 256) {
    throw new Error("current_window_adversarial_frontier_limit_invalid");
  }
  return parsed;
}

function binaryInterval(lowerBound, upperBound) {
  return stableGraphValue({
    lowerBound,
    upperBound,
    exact: lowerBound === upperBound,
    lower: { numerator: String(lowerBound), denominator: "1" },
    upper: { numerator: String(upperBound), denominator: "1" },
  });
}

function terminalEvents(events = []) {
  return array(events).filter((event) => event.eventType === "terminal")
    .map((event) => stableGraphValue({
      eventType: "terminal",
      winnerSideKey: String(event.winnerSideKey || ""),
      reason: String(event.reason || ""),
      marker: String(event.marker || ""),
    }));
}

function frontierInterval(events = [], querySideKey = "") {
  const terminals = terminalEvents(events);
  if (!terminals.length) return binaryInterval(0, 1);
  return terminals.some((event) => event.winnerSideKey === querySideKey)
    ? binaryInterval(1, 1)
    : binaryInterval(0, 0);
}

function persistState(persist, state, parentStateId = "") {
  if (typeof persist !== "function") return null;
  const record = persist(state, { parentStateId });
  return stableGraphValue({
    stateId: String(record?.id || record?.stateId || ""),
    created: record?.created === true,
    encoding: String(record?.encoding || ""),
    deltaDepth: Number(record?.deltaDepth || 0),
    physicalBytes: Number(record?.physicalBytes || 0),
  });
}

export function buildWarmachineCurrentWindowAdversarialFrontierV1(
  inputState = {},
  enumeration = {},
  rawOptions = {},
) {
  if (!enumeration.state) {
    throw new Error("current_window_adversarial_frontier_enumeration_required");
  }
  const querySideKey = requireText(
    rawOptions.querySideKey,
    "current_window_adversarial_frontier_query_side_required",
  );
  const taskKey = requireText(
    rawOptions.taskKey,
    "current_window_adversarial_frontier_task_required",
  );
  if (rawOptions.taskLocalRuleClosure &&
      rawOptions.taskLocalRuleClosure.taskKey !== taskKey) {
    throw new Error("current_window_adversarial_frontier_task_closure_mismatch");
  }
  const currentWindow =
    buildWarmachineCurrentDecisionWindowDomainFromHostEnumerationV1(
      inputState,
      enumeration,
      rawOptions.enumeratedInputStateReference === inputState
        ? {
          enumeratedInputStateReference: inputState,
          taskLocalRuleClosure: rawOptions.taskLocalRuleClosure || null,
        }
        : { taskLocalRuleClosure: rawOptions.taskLocalRuleClosure || null },
    );
  const acceptedActions = array(enumeration.actions).slice().sort((left, right) =>
    String(left.actionKey || "").localeCompare(String(right.actionKey || "")));
  const startIndex = boundedIndex(
    rawOptions.startIndex,
    acceptedActions.length,
    "current_window_adversarial_frontier_start_invalid",
  );
  const limit = boundedLimit(rawOptions.limit);
  const pageActions = acceptedActions.slice(startIndex, startIndex + limit);
  const rootState = enumeration.state;
  const rootStateHash = warmachineRuleBehaviorStateHashV1(rootState);
  const rootStoredState = persistState(rawOptions.persistState, rootState);
  const quantifier = currentWindow.decisionOwnerSideKey === querySideKey
    ? "owner_max"
    : "opponent_and_min";
  const successorEnumerationScopeKind = String(
    rawOptions.successorEnumerationScopeKind || "full_host_window",
  );
  if (!["full_host_window", "selected_actor_and_actorless"].includes(
    successorEnumerationScopeKind,
  )) {
    throw new Error(
      "current_window_adversarial_frontier_successor_scope_invalid",
    );
  }
  const edges = [];
  for (const candidate of pageActions) {
    const optionRow = array(currentWindow.optionRows).find((row) =>
      row.disposition === "host_accepted" &&
      row.actionKey === candidate.actionKey) || null;
    const dependencyGuardRejected =
      optionRow?.taskLocalRuleGuard?.disposition === "rules_unknown";
    if (dependencyGuardRejected) {
      const core = stableGraphValue({
        actionKey: String(candidate.actionKey || ""),
        actionType: String(candidate.actionType || ""),
        actorPieceKey: String(candidate.actorPieceKey || ""),
        targetPieceKey: String(candidate.targetPieceKey || ""),
        selectedOptionReceiptHash: String(optionRow?.optionReceiptHash || ""),
        hostTransitionAccepted: null,
        transitionAccepted: false,
        transitionReason: "task_local_rule_dependency_unresolved",
        dependencyGuardRejected: true,
        taskLocalRuleGuard: optionRow.taskLocalRuleGuard,
        eventTypes: [],
        terminalEvents: [],
        queryValueInterval: binaryInterval(0, 1),
        successorStateHash: "",
        successorStoredState: null,
        successorWindow: null,
        deeperContinuationResolved: false,
        chanceDomainResolved: false,
      });
      edges.push({ ...core, edgeReceiptHash: stableGraphHash(core) });
      rawOptions.onProgress?.({
        stage: "current_window_frontier_edge_rule_dependency_unresolved",
        actionKey: String(candidate.actionKey || ""),
        edgeIndex: startIndex + edges.length - 1,
        edgeCount: pageActions.length,
        transitionAccepted: false,
        successorDecisionOwnerSideKey: "",
      });
      continue;
    }
    const selected = {
      ...candidate,
      __warmachineTrustedRulesV1Enumeration: enumeration,
    };
    const transition = applyRulesV1Action(rootState, selected);
    const hostTransitionAccepted = transition.ok === true;
    const transitionRuleGuard = hostTransitionAccepted &&
        rawOptions.taskLocalRuleClosure
      ? guardWarmachineActionWithTaskLocalRuleClosureV1({
        action: candidate,
        transitionEvents: array(transition.events),
      }, rawOptions.taskLocalRuleClosure)
      : optionRow?.taskLocalRuleGuard || null;
    const transitionDependencyGuardRejected =
      transitionRuleGuard?.disposition === "rules_unknown";
    const accepted = hostTransitionAccepted &&
      !transitionDependencyGuardRejected;
    let successorStateHash = "";
    let successorStoredState = null;
    let successorWindow = null;
    if (accepted) {
      successorStateHash = warmachineRuleBehaviorStateHashV1(
        transition.nextState,
      );
      successorStoredState = persistState(
        rawOptions.persistState,
        transition.nextState,
        rootStoredState?.stateId || "",
      );
      const successorEnumerationOptions =
        successorEnumerationScopeKind === "selected_actor_and_actorless"
          ? {
            actorPieceKeys: candidate.actorPieceKey
              ? [String(candidate.actorPieceKey)]
              : [],
            includeActorlessActions: true,
          }
          : {};
      const successorEnumeration = enumerateRulesV1Actions(
        transition.nextState,
        successorEnumerationOptions,
      );
      const successorDomain =
        buildWarmachineCurrentDecisionWindowDomainFromHostEnumerationV1(
          transition.nextState,
          successorEnumeration,
          {
            enumeratedInputStateReference: transition.nextState,
            taskLocalRuleClosure: rawOptions.taskLocalRuleClosure || null,
          },
        );
      successorWindow = stableGraphValue({
        currentDecisionWindowDomainHash:
          successorDomain.currentDecisionWindowDomainHash,
        decisionOwnerSideKey: successorDomain.decisionOwnerSideKey,
        phaseKey: successorDomain.phaseKey,
        activeSideKey: successorDomain.activeSideKey,
        acceptedOptionCount: successorDomain.acceptedOptionCount,
        rejectedOptionCount: successorDomain.rejectedOptionCount,
        unresolvedReasons: successorDomain.unresolvedReasons,
        hostActionSpaceNarrowed:
          successorDomain.hostEnumerationScope?.hostActionSpaceNarrowed === true,
        successorEnumerationScopeKind,
      });
    }
    const core = stableGraphValue({
      actionKey: String(candidate.actionKey || ""),
      actionType: String(candidate.actionType || ""),
      actorPieceKey: String(candidate.actorPieceKey || ""),
      targetPieceKey: String(candidate.targetPieceKey || ""),
      selectedOptionReceiptHash: String(optionRow?.optionReceiptHash || ""),
      hostTransitionAccepted,
      transitionAccepted: accepted,
      transitionReason: transitionDependencyGuardRejected
        ? "task_local_transition_rule_dependency_unresolved"
        : String(transition.reason || ""),
      dependencyGuardRejected: transitionDependencyGuardRejected,
      taskLocalRuleGuard: transitionRuleGuard,
      eventTypes: array(transition.events).map((event) =>
        String(event.eventType || "")),
      terminalEvents: terminalEvents(transition.events),
      queryValueInterval: transitionDependencyGuardRejected
        ? binaryInterval(0, 1)
        : frontierInterval(transition.events, querySideKey),
      successorStateHash,
      successorStoredState,
      successorWindow,
      deeperContinuationResolved: false,
      chanceDomainResolved: false,
    });
    edges.push({ ...core, edgeReceiptHash: stableGraphHash(core) });
    rawOptions.onProgress?.({
      stage: transitionDependencyGuardRejected
        ? "current_window_frontier_edge_transition_rule_dependency_unresolved"
        : "current_window_frontier_edge_complete",
      actionKey: String(candidate.actionKey || ""),
      edgeIndex: startIndex + edges.length - 1,
      edgeCount: pageActions.length,
      transitionAccepted: accepted,
      successorDecisionOwnerSideKey:
        String(successorWindow?.decisionOwnerSideKey || ""),
    });
  }
  const nextIndex = startIndex + pageActions.length;
  const pageExhausted = nextIndex >= acceptedActions.length;
  const transitionFailureCount = edges.filter((edge) =>
    !edge.transitionAccepted && !edge.dependencyGuardRejected).length;
  const ruleDependencyUnresolvedCount = edges.filter((edge) =>
    edge.dependencyGuardRejected).length;
  const unresolvedReasons = [...new Set([
    ...array(currentWindow.unresolvedReasons),
    ...(successorEnumerationScopeKind !== "full_host_window"
      ? ["successor_host_enumeration_scope_narrowed"]
      : []),
    ...(!pageExhausted ? ["current_window_page_not_exhausted"] : []),
    ...(ruleDependencyUnresolvedCount > 0
      ? ["task_local_rule_dependency_unresolved"]
      : []),
    "successor_continuation_domain_unexpanded",
    "successor_chance_domain_unexpanded",
    "full_opponent_turn_domain_unexpanded",
  ])].sort();
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_CURRENT_WINDOW_ADVERSARIAL_FRONTIER_V1_SCHEMA,
    taskKey,
    querySideKey,
    currentHostReceiptHash: String(warmachineHost.receipt?.receiptHash || ""),
    currentDecisionWindowDomainHash:
      currentWindow.currentDecisionWindowDomainHash,
    taskLocalRuleClosureHash: String(
      currentWindow.taskLocalRuleClosureHash || "",
    ),
    taskLocalRuleGuardEnabled:
      currentWindow.taskLocalRuleGuardEnabled === true,
    taskLocalRulesUnknownOptionCount:
      Number(currentWindow.taskLocalRulesUnknownOptionCount || 0),
    rootStateHash,
    rootStoredState,
    decisionOwnerSideKey: currentWindow.decisionOwnerSideKey,
    quantifier,
    hostEnumerationScope: currentWindow.hostEnumerationScope,
    hostAcceptedActionCount: acceptedActions.length,
    hostRejectedActionCount: array(enumeration.rejectedActions).length,
    successorEnumerationScopeKind,
    successorEnumerationScopeComplete:
      successorEnumerationScopeKind === "full_host_window",
    page: {
      startIndex,
      endIndexExclusive: nextIndex,
      edgeCount: edges.length,
      pageExhausted,
      remainingAcceptedActionCount: acceptedActions.length - nextIndex,
      resumeCursor: {
        currentDecisionWindowDomainHash:
          currentWindow.currentDecisionWindowDomainHash,
        nextIndex,
        exhausted: pageExhausted,
      },
    },
    edges,
    transitionFailureCount,
    ruleDependencyUnresolvedCount,
    acceptedDenominatorConserved:
      nextIndex + (acceptedActions.length - nextIndex) ===
        acceptedActions.length,
    successorStatesPersisted: Boolean(rootStoredState) && edges.every((edge) =>
      !edge.transitionAccepted || Boolean(edge.successorStoredState?.stateId)),
    unresolvedReasons,
    onePlyFrontierReady:
      transitionFailureCount === 0 && edges.length === pageActions.length,
    fullOpponentTurnComplete: false,
    chanceDomainComplete: false,
    effectiveStrategyQuotientComplete: false,
    strategyValuePublicationAllowed: false,
    claimBoundary:
      "This frontier strict-applies one stable page of actions from one Host enumeration and re-enumerates every accepted successor. The owner quantifier and all omitted rows are preserved. Applied Host scopes, deeper adaptive continuations, complete opponent turns and Chance remain unresolved; one-ply success is not a complete strategy DAG or game value.",
  });
  return {
    ...core,
    adversarialFrontierReceiptHash: stableGraphHash(core),
    ok: core.onePlyFrontierReady && core.acceptedDenominatorConserved,
  };
}
