import {
  bindWarmachineBenchmarkExplicitMovementPathV2,
  enumerateWarmachineBenchmarkActionsV2,
  executeScopedWarmachineBenchmarkActionV2,
  executeWarmachineBenchmarkActivationV2,
  executeWarmachineBenchmarkControlPhaseV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { normalizeRulesV1State, warmachineHost } from "../warmachine-host-runtime.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";

export const WARMACHINE_TERMINAL_REVERSE_ROUTE_REPLAY_V1_SCHEMA =
  "warmachine_terminal_reverse_route_replay_v1";

function trainingStateEntry(stateInput = {}) {
  const state = normalizeRulesV1State(stateInput);
  return {
    stateHash: warmachineReverseStateSemanticHashV1(state),
    state,
  };
}

function trainingDecisionTrace(
  stateBeforeInput,
  scoped = {},
  action = {},
  executed = {},
  context = {},
) {
  const transformState = typeof context.transformState === "function"
    ? context.transformState
    : (state) => normalizeRulesV1State(state);
  const predecessor = trainingStateEntry(transformState(stateBeforeInput));
  const successor = trainingStateEntry(transformState(
    executed.normalizedState || executed.state || stateBeforeInput,
  ));
  const legalActions = (scoped.enumeration?.actions || []).map((candidate) => ({
    actionKey: String(candidate.actionKey || ""),
    actionType: String(candidate.actionType || ""),
    actorPieceKey: String(candidate.actorPieceKey || ""),
    targetPieceKey: String(candidate.targetPieceKey || ""),
  })).sort((left, right) => left.actionKey.localeCompare(right.actionKey));
  const publicStep = stableGraphValue({
    decisionIndexWithinEdge: Number(context.decisionIndexWithinEdge || 0),
    decisionKind: String(context.decisionKind || "rules_action"),
    decisionScopeKind: String(context.decisionScopeKind || "strict_enumeration_scope"),
    decisionScopeKey: String(context.decisionScopeKey || ""),
    predecessorStateHash: predecessor.stateHash,
    legalActionSpaceCompleteWithinDeclaredScope: true,
    legalActions,
    selectedAction: {
      actionKey: String(action.actionKey || ""),
      actionType: String(action.actionType || ""),
      actorPieceKey: String(action.actorPieceKey || ""),
      targetPieceKey: String(action.targetPieceKey || ""),
    },
    actionPatch: stableGraphValue(context.actionPatch || {}),
    successorStateHash: successor.stateHash,
    strictTransitionAccepted: executed.ok === true,
    strictReceiptHash: String(executed.receipt?.receiptHash || ""),
    terminalEvents: stableGraphValue((executed.receipt?.events || []).filter((event) =>
      event.eventType === "terminal")),
    witnessPayload: stableGraphValue(context.witnessPayload || {}),
  });
  return {
    publicStep,
    stateEntries: [predecessor, successor],
  };
}

function stripMovementProposal(stateInput = {}, pathKey = "") {
  const state = structuredClone(normalizeRulesV1State(stateInput));
  state.explicitMovementPaths = (state.explicitMovementPaths || []).filter((entry) =>
    String(entry.pathKey || entry.key || "") !== pathKey);
  for (const piece of state.pieces || []) {
    piece.explicitMovementPaths = (piece.explicitMovementPaths || []).filter((entry) =>
      String(entry.pathKey || entry.key || "") !== pathKey);
    if (piece.metadata?.explicitMovementPaths) {
      piece.metadata.explicitMovementPaths = piece.metadata.explicitMovementPaths.filter((entry) =>
        String(entry.pathKey || entry.key || "") !== pathKey);
    }
  }
  return normalizeRulesV1State(state);
}

function scopeForEdge(edge = {}, actionKey = "") {
  if (edge.operatorKey === "pass_activation_inverse_v1") {
    return {
      actorPieceKeys: edge.actorPieceKey ? [edge.actorPieceKey] : [],
      actionFamilyKeys: ["timing"],
    };
  }
  if (edge.operatorKey === "previous_turn_end_inverse_v1" ||
      edge.operatorKey === "scenario_score_turn_end_inverse_v1") {
    return { includeActorlessActions: true, actionFamilyKeys: ["timing"] };
  }
  if (edge.layerKey === "victory_event" ||
      edge.operatorKey === "assassination_terminal_attack_inverse_v1") {
    return {
      ...(edge.actorPieceKey ? { actorPieceKeys: [edge.actorPieceKey] } : {}),
      ...(edge.targetPieceKey ? { targetPieceKeys: [edge.targetPieceKey] } : {}),
      includeUntargetedActions: false,
      actionFamilyKeys: ["attack_or_effect", "special", "resource", "timing"],
    };
  }
  return actionKey ? {} : { actionFamilyKeys: ["timing"] };
}

function replayTerminalExecution(edge = {}) {
  for (const outcome of edge.matchingOutcomes || []) {
    const execution = (outcome.replayExecutions || [])[0] || null;
    if (execution) return execution;
  }
  return null;
}

function replaySingleAction(state, edge, rawOptions = {}) {
  const terminalExecution = edge.layerKey === "victory_event"
    ? replayTerminalExecution(edge)
    : null;
  const actionKey = String(terminalExecution?.actionKey || edge.transitionActionKey || "");
  const scoped = enumerateWarmachineBenchmarkActionsV2(
    state,
    scopeForEdge(edge, actionKey),
  );
  const action = (scoped.enumeration.actions || []).find((candidate) =>
    candidate.actionKey === actionKey) || null;
  if (!action) {
    return {
      ok: false,
      reason: "full_route_replay_action_not_in_fresh_legal_space",
      actionKey,
      legalActionKeys: (scoped.enumeration.actions || []).map((candidate) =>
        candidate.actionKey).sort(),
      rejectedAction: (scoped.enumeration.rejectedActions || []).find((candidate) =>
        candidate.actionKey === actionKey) || null,
      state,
      receipts: [],
    };
  }
  const actionPatch = terminalExecution?.strictRollOutcome
    ? { strictRollOutcome: terminalExecution.strictRollOutcome }
    : {};
  const executed = executeScopedWarmachineBenchmarkActionV2(
    scoped,
    action,
    { actionKey },
    {
      routeKey: `${rawOptions.routeKey}:edge:${rawOptions.edgeIndex}`,
      actionPatch,
    },
  );
  const training = rawOptions.captureTrainingTrace === true
    ? trainingDecisionTrace(state, scoped, action, executed, {
      decisionScopeKind: "reverse_edge_action_scope",
      decisionScopeKey: String(edge.layerKey || edge.operatorKey || ""),
      actionPatch,
    })
    : null;
  return {
    ok: executed.ok,
    reason: executed.reason,
    actionKey,
    state: executed.normalizedState || normalizeRulesV1State(executed.state),
    receipts: executed.receipt ? [executed.receipt] : [],
    trainingDecisionSteps: training ? [training.publicStep] : [],
    trainingStateEntries: training?.stateEntries || [],
  };
}

function replayTerminalComposite(stateInput, edge, rawOptions = {}) {
  const replaySteps = edge.strictReplaySteps || [];
  if (!replaySteps.length) return replaySingleAction(stateInput, edge, rawOptions);
  let state = stateInput;
  const receipts = [];
  const actionKeys = [];
  const trainingDecisionSteps = [];
  const trainingStateEntries = [];
  for (const [stepIndex, replayStep] of replaySteps.entries()) {
    const actionKey = String(replayStep.actionKey || "");
    const scoped = enumerateWarmachineBenchmarkActionsV2(
      state,
      stepIndex === 0
        ? scopeForEdge(edge, actionKey)
        : { includeActorlessActions: true },
    );
    const action = (scoped.enumeration.actions || []).find((candidate) =>
      candidate.actionKey === actionKey) || null;
    if (!action) {
      return {
        ok: false,
        reason: "full_route_replay_terminal_step_not_in_fresh_legal_space",
        actionKey,
        actionKeys,
        legalActionKeys: (scoped.enumeration.actions || []).map((candidate) =>
          candidate.actionKey).sort(),
        rejectedAction: (scoped.enumeration.rejectedActions || []).find((candidate) =>
          candidate.actionKey === actionKey) || null,
        state,
        receipts,
      };
    }
    const executed = executeScopedWarmachineBenchmarkActionV2(
      scoped,
      action,
      { actionKey },
      {
        routeKey: `${rawOptions.routeKey}:edge:${rawOptions.edgeIndex}:terminal:${stepIndex}`,
        actionPatch: replayStep.actionPatch || {},
      },
    );
    if (rawOptions.captureTrainingTrace === true) {
      const training = trainingDecisionTrace(state, scoped, action, executed, {
        decisionIndexWithinEdge: stepIndex,
        decisionScopeKind: stepIndex === 0
          ? "reverse_edge_action_scope"
          : "strict_continuation_window",
        decisionScopeKey: String(edge.layerKey || edge.operatorKey || ""),
        actionPatch: replayStep.actionPatch || {},
      });
      trainingDecisionSteps.push(training.publicStep);
      trainingStateEntries.push(...training.stateEntries);
    }
    actionKeys.push(actionKey);
    if (executed.receipt) receipts.push(executed.receipt);
    if (executed.normalizedState || executed.state) {
      state = executed.normalizedState || normalizeRulesV1State(executed.state);
    }
    if (!executed.ok) {
      return {
        ok: false,
        reason: executed.reason || "full_route_replay_terminal_step_rejected",
        actionKey,
        actionKeys,
        state,
        receipts,
      };
    }
  }
  return {
    ok: true,
    reason: "",
    actionKey: actionKeys[0] || edge.transitionActionKey,
    actionKeys,
    state,
    receipts,
    trainingDecisionSteps,
    trainingStateEntries,
  };
}

function replayMovementActivation(state, edge, rawOptions = {}) {
  const proposal = edge.movementProposal || {};
  const pathKey = String(proposal.pathKey || "");
  if (!pathKey || !edge.actorPieceKey || !(proposal.waypoints || []).length) {
    return {
      ok: false,
      reason: "full_route_replay_movement_path_evidence_missing",
      state,
      receipts: [],
    };
  }
  const prepared = bindWarmachineBenchmarkExplicitMovementPathV2(state, {
    actorPieceKey: edge.actorPieceKey,
    actionType: edge.actionType,
    pathKey,
    waypoints: proposal.waypoints,
    proposalSource: "independent_full_route_strict_replay_v1",
    label: `Replay ${edge.actionType} ${edge.candidateKey}`,
  });
  const replaySteps = edge.strictReplaySteps || [];
  if (!replaySteps.length) {
    return {
      ok: false,
      reason: "full_route_replay_movement_activation_steps_missing",
      state,
      receipts: [],
    };
  }
  const trainingDecisionSteps = [];
  const trainingStateEntries = [];
  const executed = executeWarmachineBenchmarkActivationV2(
    prepared,
    edge.actorPieceKey,
    {
      routeKey: `${rawOptions.routeKey}:edge:${rawOptions.edgeIndex}:movement`,
      enumerationScopeForStep: ({ stepIndex }) => stepIndex === 0
        ? {
          actionFamilyKeys: ["movement", "timing"],
          movementPathKindKeys: ["explicit_path"],
        }
        : {},
      selectAction: ({ stepIndex }) => {
        const replayStep = replaySteps[stepIndex] || null;
        return replayStep ? {
          actionKey: replayStep.actionKey,
          actionPatch: replayStep.actionPatch || {},
        } : null;
      },
      maxSteps: replaySteps.length,
      onTransition: ({ stateBefore, scoped, action, result, stepIndex }) => {
        if (rawOptions.captureTrainingTrace !== true) return;
        const replayStep = replaySteps[stepIndex] || {};
        const training = trainingDecisionTrace(stateBefore, scoped, action, result, {
          decisionIndexWithinEdge: stepIndex,
          decisionScopeKind: "activation_group_action_scope",
          decisionScopeKey: String(edge.actorPieceKey || ""),
          actionPatch: replayStep.actionPatch || {},
          witnessPayload: stepIndex === 0 ? { explicitMovementPath: proposal } : {},
          transformState: (candidate) => stripMovementProposal(candidate, pathKey),
        });
        trainingDecisionSteps.push(training.publicStep);
        trainingStateEntries.push(...training.stateEntries);
      },
    },
  );
  return {
    ok: executed.ok && executed.completed,
    reason: executed.reason,
    actionKey: String(replaySteps[0]?.actionKey || edge.transitionActionKey || ""),
    actionKeys: (executed.receipts || []).map((receipt) => receipt.actionKey),
    state: stripMovementProposal(executed.state, pathKey),
    receipts: executed.receipts || [],
    trainingDecisionSteps,
    trainingStateEntries,
  };
}

function replayControlPhase(state, edge, rawOptions = {}) {
  const replaySteps = edge.strictReplaySteps || [];
  if (!replaySteps.length) {
    return {
      ok: false,
      reason: "full_route_replay_control_phase_steps_missing",
      actionKey: edge.transitionActionKey,
      actionKeys: [],
      state,
      receipts: [],
    };
  }
  const trainingDecisionSteps = [];
  const trainingStateEntries = [];
  const executed = executeWarmachineBenchmarkControlPhaseV2(state, {
    routeKey: `${rawOptions.routeKey}:edge:${rawOptions.edgeIndex}:control`,
    maximumSteps: Math.max(replaySteps.length,
      Math.max(1, Number(rawOptions.maximumControlSteps || 64))),
    selectAction: ({ stepIndex }) => {
      const replayStep = replaySteps[stepIndex] || null;
      return replayStep ? {
        actionKey: replayStep.actionKey,
        actionPatch: replayStep.actionPatch || {},
      } : null;
    },
    onTransition: ({ stateBefore, scoped, action, result, stepIndex }) => {
      if (rawOptions.captureTrainingTrace !== true) return;
      const replayStep = replaySteps[stepIndex] || {};
      const training = trainingDecisionTrace(stateBefore, scoped, action, result, {
        decisionIndexWithinEdge: stepIndex,
        decisionScopeKind: "control_phase_action_space",
        decisionScopeKey: String(state.activeSideKey || ""),
        actionPatch: replayStep.actionPatch || {},
      });
      trainingDecisionSteps.push(training.publicStep);
      trainingStateEntries.push(...training.stateEntries);
    },
  });
  return {
    ok: executed.ok && executed.receipts.length === replaySteps.length,
    reason: executed.failures?.[0]?.reason || "",
    actionKey: edge.transitionActionKey,
    actionKeys: (executed.receipts || []).map((receipt) => receipt.actionKey),
    state: normalizeRulesV1State(executed.state),
    receipts: executed.receipts || [],
    trainingDecisionSteps,
    trainingStateEntries,
  };
}

function executeEdge(state, edge, rawOptions = {}) {
  if (edge.operatorKey === "movement_activation_inverse_v1") {
    return replayMovementActivation(state, edge, rawOptions);
  }
  if (edge.operatorKey === "control_phase_start_inverse_v1") {
    return replayControlPhase(state, edge, rawOptions);
  }
  if (edge.layerKey === "victory_event" ||
      edge.operatorKey === "assassination_terminal_attack_inverse_v1") {
    return replayTerminalComposite(state, edge, rawOptions);
  }
  if ([
    "previous_turn_end_inverse_v1",
    "scenario_score_turn_end_inverse_v1",
  ].includes(edge.operatorKey)) {
    return replayTerminalComposite(state, edge, rawOptions);
  }
  if (edge.operatorKey === "pass_activation_inverse_v1") {
    return replayTerminalComposite(state, edge, rawOptions);
  }
  return {
    ok: false,
    reason: "full_route_replay_operator_not_supported",
    operatorKey: edge.operatorKey,
    state,
    receipts: [],
  };
}

export function replayWarmachineTerminalReverseRouteV1(
  route = {},
  terminalStateInput = {},
  rawOptions = {},
) {
  let state = normalizeRulesV1State(route.predecessorState || {});
  const terminalState = normalizeRulesV1State(terminalStateInput);
  const routeKey = String(rawOptions.routeKey ||
    `terminal-reverse-route-replay:${route.candidateKey || "route"}`);
  const orderedEdges = [...(route.reverseEdges || [])].reverse();
  const steps = [];
  const failures = [];
  const freshReceiptHashes = [];
  const trainingDecisionSteps = [];
  const trainingStateEntries = new Map();
  for (const [edgeIndex, edge] of orderedEdges.entries()) {
    const observedPredecessorStateHash = warmachineReverseStateSemanticHashV1(state);
    const expectedPredecessorStateHash = String(edge.predecessorStateHash || "");
    if (observedPredecessorStateHash !== expectedPredecessorStateHash) {
      failures.push({
        edgeIndex,
        candidateKey: edge.candidateKey,
        reason: "full_route_replay_predecessor_hash_mismatch",
        expectedPredecessorStateHash,
        observedPredecessorStateHash,
      });
      break;
    }
    const result = executeEdge(state, edge, {
      ...rawOptions,
      routeKey,
      edgeIndex,
    });
    const observedSuccessorStateHash = result.state
      ? warmachineReverseStateSemanticHashV1(result.state)
      : "";
    const expectedSuccessorStateHash = String(edge.successorStateHash || "");
    const receiptHashes = (result.receipts || []).map((receipt) =>
      String(receipt.receiptHash || "")).filter(Boolean);
    freshReceiptHashes.push(...receiptHashes);
    for (const decision of result.trainingDecisionSteps || []) {
      trainingDecisionSteps.push(stableGraphValue({
        trajectoryDecisionIndex: trainingDecisionSteps.length,
        edgeIndex,
        reverseEdgeIndex: orderedEdges.length - edgeIndex - 1,
        layerKey: edge.layerKey,
        operatorKey: edge.operatorKey,
        ...decision,
      }));
    }
    for (const entry of result.trainingStateEntries || []) {
      if (!trainingStateEntries.has(entry.stateHash)) {
        trainingStateEntries.set(entry.stateHash, entry.state);
      }
    }
    const step = stableGraphValue({
      edgeIndex,
      reverseEdgeIndex: orderedEdges.length - edgeIndex - 1,
      layerKey: edge.layerKey,
      candidateKey: edge.candidateKey,
      operatorKey: edge.operatorKey,
      actionKey: result.actionKey || "",
      actionKeys: result.actionKeys || (result.actionKey ? [result.actionKey] : []),
      expectedPredecessorStateHash,
      observedPredecessorStateHash,
      expectedSuccessorStateHash,
      observedSuccessorStateHash,
      transitionAccepted: result.ok === true,
      successorMatched: observedSuccessorStateHash === expectedSuccessorStateHash,
      freshReceiptHashes: receiptHashes,
      reason: String(result.reason || ""),
    });
    steps.push(step);
    if (!result.ok || observedSuccessorStateHash !== expectedSuccessorStateHash) {
      failures.push({
        ...step,
        reason: !result.ok
          ? result.reason || "full_route_replay_transition_rejected"
          : "full_route_replay_successor_hash_mismatch",
        legalActionKeys: result.legalActionKeys || [],
        rejectedAction: result.rejectedAction || null,
      });
      break;
    }
    state = result.state;
  }
  const observedFinalStateHash = warmachineReverseStateSemanticHashV1(state);
  const expectedFinalStateHash = warmachineReverseStateSemanticHashV1(terminalState);
  if (!failures.length && observedFinalStateHash !== expectedFinalStateHash) {
    failures.push({
      reason: "full_route_replay_terminal_state_hash_mismatch",
      expectedFinalStateHash,
      observedFinalStateHash,
    });
  }
  const fullRouteStrictReplayCertified = failures.length === 0 &&
    steps.length === orderedEdges.length && orderedEdges.length > 0;
  const core = {
    schemaVersion: WARMACHINE_TERMINAL_REVERSE_ROUTE_REPLAY_V1_SCHEMA,
    routeKey,
    routeCandidateKey: String(route.candidateKey || ""),
    openingStateHash: String(route.predecessorStateHash || ""),
    expectedTerminalStateHash: expectedFinalStateHash,
    observedTerminalStateHash: observedFinalStateHash,
    reverseEdgeCount: orderedEdges.length,
    replayedEdgeCount: steps.length,
    freshStrictTransitionCount: freshReceiptHashes.length,
    freshReceiptHashes,
    steps,
    failures: stableGraphValue(failures),
    priorReceiptHashesConsultedForExecution: false,
    freshEnumerationBeforeEveryTransition: true,
    fullRouteStrictReplayCertified,
    trainingTrace: {
      captured: rawOptions.captureTrainingTrace === true,
      decisionCount: trainingDecisionSteps.length,
      uniqueStateCount: trainingStateEntries.size,
      decisions: stableGraphValue(trainingDecisionSteps),
    },
    trainingTruth: false,
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    claimBoundary: "This replay starts only from the recovered legal deployment, reverses the stored inverse edge order, freshly enumerates every action, executes through the current rules-v1 Host and checks every semantic successor hash through the supplied terminal. Stored prior receipts are comparison evidence only and are not used to execute the replay.",
  };
  return {
    ...core,
    finalState: state,
    runtimeTrainingStateEntries: [...trainingStateEntries.entries()].map(
      ([stateHash, trainingState]) => ({ stateHash, state: trainingState }),
    ),
    replayHash: stableGraphHash(stableGraphValue(core)),
    ok: fullRouteStrictReplayCertified,
  };
}
