import {
  bindWarmachineBenchmarkExplicitMovementPathV2,
  enumerateWarmachineBenchmarkActionsV2,
  executeScopedWarmachineBenchmarkActionV2,
  executeWarmachineBenchmarkActivationV2,
  executeWarmachineBenchmarkControlPhaseV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  buildRulesV1MovementPathProposalPlan,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";
import {
  auditWarmachineReverseStateBoundaryV1,
  summarizeWarmachineReverseStateBoundaryAuditV1,
} from "./reverse-state-invariants-v1.mjs";

export const WARMACHINE_TERMINAL_REVERSE_ROUTE_REPLAY_V1_SCHEMA =
  "warmachine_terminal_reverse_route_replay_v1";
export const WARMACHINE_TERMINAL_REVERSE_ROUTE_REISSUE_V1_SCHEMA =
  "warmachine_terminal_reverse_route_reissue_v1";
export const WARMACHINE_TERMINAL_REVERSE_ROUTE_PREFIX_RECOVERY_V1_SCHEMA =
  "warmachine_terminal_reverse_route_prefix_recovery_v1";

function trainingStateEntry(stateInput = {}) {
  const state = normalizeRulesV1State(stateInput);
  return {
    stateHash: warmachineReverseStateSemanticHashV1(state),
    state,
  };
}

function terminalEventsFromReceipts(receipts = []) {
  return receipts.flatMap((receipt) => receipt?.events || [])
    .filter((event) => event.eventType === "terminal");
}

function declaredTerminalEdge(edge = {}, edgeIndex = 0, edgeCount = 0) {
  if (edgeIndex !== edgeCount - 1) return false;
  return edge.layerKey === "victory_event" || [
    "assassination_terminal_attack_inverse_v1",
    "scenario_score_turn_end_inverse_v1",
  ].includes(edge.operatorKey);
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

function movementReplayProposalVariants(state, edge, rawOptions = {}) {
  const sourceProposal = edge.movementProposal || {};
  const sourceActorPieceKey = String(edge.actorPieceKey || "");
  const movementStep = (edge.strictReplaySteps || []).find((step) =>
    String(step.actionType || "") === String(edge.actionType || "") ||
    edge.actionType === "advance" && step.actionType === "unit_group_advance");
  const sourceActionKey = String(
    movementStep?.actionKey || edge.transitionActionKey || "",
  );
  const variants = [{
    proposal: sourceProposal,
    actorPieceKey: sourceActorPieceKey,
    actionKey: sourceActionKey,
    witnessRepair: null,
  }];
  if (rawOptions.repairBlockedMovementPathWitness !== true) return variants;
  const alternateAnchorAllowed =
    rawOptions.repairBlockedUnitMovementAnchorWitness === true &&
    (edge.strictReplaySteps || []).length === 1 &&
    (edge.activationGroupPieceKeys || []).length > 1;
  const actorPieceKeys = [
    sourceActorPieceKey,
    ...(alternateAnchorAllowed ? edge.activationGroupPieceKeys || [] : []),
  ].map(String).filter(Boolean).filter((pieceKey, index, rows) =>
    rows.indexOf(pieceKey) === index);
  const observedPathKeys = new Set([
    `${sourceActorPieceKey}:${stableGraphHash(sourceProposal.waypoints || [])}`,
  ]);
  for (const actorPieceKey of actorPieceKeys) {
    const destination =
      sourceProposal.destinationsByPieceKey?.[actorPieceKey] ||
      (actorPieceKey === sourceActorPieceKey
        ? sourceProposal.waypoints?.at(-1)
        : null);
    if (!destination) continue;
    const plan = buildRulesV1MovementPathProposalPlan(state, {
      actorPieceKey,
      actionType: edge.actionType,
      destination,
      ignoredPieceKeys: [actorPieceKey],
      targetKey: sourceProposal.proposalKey || edge.candidateKey,
      keyBase: `route-reissue:${edge.candidateKey || actorPieceKey}:${
        actorPieceKey}`,
    });
    for (const pathProposal of plan.proposals || []) {
      if (pathProposal.precheckPassed !== true) continue;
      const waypoints = pathProposal.waypoints || [];
      const pathHash = stableGraphHash(waypoints);
      const observedKey = `${actorPieceKey}:${pathHash}`;
      if (observedPathKeys.has(observedKey)) continue;
      observedPathKeys.add(observedKey);
      const actorChanged = actorPieceKey !== sourceActorPieceKey;
      const pathsByModel = (sourceProposal.pathsByModel || []).map((entry) =>
        String(entry.pieceKey || "") === actorPieceKey
          ? { ...entry, waypoints }
          : entry);
      const actionKey = actorChanged
        ? sourceActionKey.replace(/^[^:]+:/, `${actorPieceKey}:`)
        : sourceActionKey;
      const witnessRepair = stableGraphValue({
        kind: actorChanged
          ? "blocked_unit_movement_anchor_current_host_reproposal"
          : "blocked_movement_path_current_host_reproposal",
        sourceActorPieceKey,
        repairedActorPieceKey: actorPieceKey,
        sourceActionKey,
        repairedActionKey: actionKey,
        sourcePathHash: stableGraphHash(sourceProposal.waypoints || []),
        repairedPathHash: pathHash,
        actionIdentityPreserved: !actorChanged,
        activationGroupIdentityPreserved: true,
        destinationIdentityPreserved: true,
      });
      variants.push({
        proposal: stableGraphValue({
          ...sourceProposal,
          actorPieceKey,
          waypoints,
          pathsByModel,
          proposalSource: actorChanged
            ? "current_host_repaired_archived_unit_anchor_v1"
            : "current_host_repaired_archived_path_v1",
          sourceProposalKey: sourceProposal.proposalKey || "",
          hostPathProposal: pathProposal,
          witnessRepair,
        }),
        actorPieceKey,
        actionKey,
        witnessRepair,
      });
    }
  }
  return variants;
}

function replayMovementActivation(state, edge, rawOptions = {}) {
  const sourceProposal = edge.movementProposal || {};
  const pathKey = String(sourceProposal.pathKey || "");
  if (!pathKey || !edge.actorPieceKey || !(sourceProposal.waypoints || []).length) {
    return {
      ok: false,
      reason: "full_route_replay_movement_path_evidence_missing",
      state,
      receipts: [],
    };
  }
  const replaySteps = edge.strictReplaySteps || [];
  if (!replaySteps.length) {
    return {
      ok: false,
      reason: "full_route_replay_movement_activation_steps_missing",
      state,
      receipts: [],
    };
  }
  const activationGroupKey = String(edge.activationGroupId || edge.actorPieceKey);
  const movementStepActionTypes = edge.actionType === "advance"
    ? new Set(["advance", "unit_group_advance"])
    : new Set([String(edge.actionType || "run")]);
  const movementStepIndex = replaySteps.findIndex((step) =>
    movementStepActionTypes.has(String(step.actionType || "")));
  if (movementStepIndex < 0) {
    return {
      ok: false,
      reason: "full_route_replay_movement_step_missing",
      state,
      receipts: [],
    };
  }
  const attempts = [];
  for (const [proposalIndex, variant] of movementReplayProposalVariants(
    state,
    edge,
    rawOptions,
  ).entries()) {
    const proposal = variant.proposal;
    const replayMovementActorPieceKey = variant.actorPieceKey;
    const prepared = bindWarmachineBenchmarkExplicitMovementPathV2(state, {
      actorPieceKey: replayMovementActorPieceKey,
      actionType: edge.actionType,
      pathKey,
      waypoints: proposal.waypoints,
      pathsByModel: proposal.pathsByModel || [],
      proposalSource: proposalIndex === 0
        ? "independent_full_route_strict_replay_v1"
        : "current_host_repaired_archived_path_v1",
      label: `Replay ${edge.actionType} ${edge.candidateKey}`,
    });
    const trainingDecisionSteps = [];
    const trainingStateEntries = [];
    const executed = executeWarmachineBenchmarkActivationV2(
      prepared,
      activationGroupKey,
      {
      routeKey: `${rawOptions.routeKey}:edge:${rawOptions.edgeIndex}:movement`,
      repeatIntent: movementStepIndex > 0,
      enumerationScopeForStep: ({ stepIndex }) => {
        const replayActorPieceKey = String(
          stepIndex === movementStepIndex
            ? replayMovementActorPieceKey
            : replaySteps[stepIndex]?.actorPieceKey || "",
        );
        const actorScope = replayActorPieceKey
          ? { actorPieceKeys: [replayActorPieceKey] }
          : {};
        if (stepIndex < movementStepIndex) return {
          ...actorScope,
          actionFamilyKeys: ["attack_or_effect", "resource", "special"],
        };
        if (stepIndex === movementStepIndex) return {
          ...actorScope,
          actionFamilyKeys: ["movement", "timing"],
          movementPathKindKeys: ["explicit_path"],
        };
        return actorScope;
      },
      selectAction: ({ stepIndex }) => {
        const replayStep = replaySteps[stepIndex] || null;
        return replayStep ? {
          actionKey: stepIndex === movementStepIndex
            ? variant.actionKey
            : replayStep.actionKey,
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
          decisionScopeKey: activationGroupKey,
          actionPatch: replayStep.actionPatch || {},
          witnessPayload: stepIndex === movementStepIndex
            ? { explicitMovementPath: proposal }
            : {},
          transformState: (candidate) => stripMovementProposal(candidate, pathKey),
        });
        trainingDecisionSteps.push(training.publicStep);
        trainingStateEntries.push(...training.stateEntries);
      },
      },
    );
    attempts.push({
      proposalIndex,
      actorPieceKey: replayMovementActorPieceKey,
      actionKey: variant.actionKey,
      proposalSource: proposal.proposalSource || "",
      witnessRepair: variant.witnessRepair,
      ok: executed.ok === true && executed.completed === true,
      reason: String(executed.reason || ""),
    });
    if (!executed.ok || !executed.completed) continue;
    return {
      ok: true,
      reason: "",
      actionKey: String(
        executed.receipts?.[0]?.actionKey || variant.actionKey ||
        edge.transitionActionKey || "",
      ),
      actionKeys: (executed.receipts || []).map((receipt) => receipt.actionKey),
      state: stripMovementProposal(executed.state, pathKey),
      receipts: executed.receipts || [],
      trainingDecisionSteps,
      trainingStateEntries,
      movementProposal: proposal,
      movementPathWitnessRepaired: proposalIndex > 0,
      reissuedActorPieceKey: replayMovementActorPieceKey,
      reissuedTransitionActionKey: variant.actionKey,
      reissuedStrictReplaySteps: replaySteps.map((step, stepIndex) =>
        stepIndex === movementStepIndex
          ? {
            ...step,
            actorPieceKey: replayMovementActorPieceKey,
            actionKey: variant.actionKey,
          }
          : step),
      movementPathReplayAttempts: stableGraphValue(attempts),
    };
  }
  return {
    ok: false,
    reason: attempts.at(-1)?.reason ||
      "activation_policy_found_no_scoped_legal_action",
    actionKey: String(replaySteps[0]?.actionKey || edge.transitionActionKey || ""),
    actionKeys: [],
    state,
    receipts: [],
    trainingDecisionSteps: [],
    trainingStateEntries: [],
    movementProposal: sourceProposal,
    movementPathWitnessRepaired: false,
    movementPathReplayAttempts: stableGraphValue(attempts),
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
  if ([
    "movement_activation_inverse_v1",
    "resource_prefix_movement_activation_inverse_v1",
    "movement_resource_suffix_activation_inverse_v1",
  ].includes(edge.operatorKey)) {
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
  const stateInvariantAudits = [];
  const openingStateInvariantAudit = auditWarmachineReverseStateBoundaryV1(
    state,
    { boundaryKind: "full_route_replay_opening" },
  );
  stateInvariantAudits.push(
    summarizeWarmachineReverseStateBoundaryAuditV1(
      openingStateInvariantAudit,
    ),
  );
  if (!openingStateInvariantAudit.ok) {
    failures.push({
      reason: "full_route_replay_predecessor_state_invariant_rejected",
      edgeIndex: 0,
      stateInvariantAudit:
        summarizeWarmachineReverseStateBoundaryAuditV1(
          openingStateInvariantAudit,
        ),
      issues: openingStateInvariantAudit.issues,
    });
  }
  for (const [edgeIndex, edge] of orderedEdges.entries()) {
    if (failures.length) break;
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
    const successorStateInvariantAudit = result.state
      ? auditWarmachineReverseStateBoundaryV1(result.state, {
        boundaryKind: "full_route_replay_edge_successor",
      })
      : null;
    if (successorStateInvariantAudit) {
      stateInvariantAudits.push(
        summarizeWarmachineReverseStateBoundaryAuditV1(
          successorStateInvariantAudit,
        ),
      );
    }
    const expectedSuccessorStateHash = String(edge.successorStateHash || "");
    const receiptHashes = (result.receipts || []).map((receipt) =>
      String(receipt.receiptHash || "")).filter(Boolean);
    const emittedTerminalEvents = terminalEventsFromReceipts(
      result.receipts || [],
    );
    const unexpectedEarlyTerminal = emittedTerminalEvents.length > 0 &&
      !declaredTerminalEdge(edge, edgeIndex, orderedEdges.length);
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
      terminalEvents: emittedTerminalEvents,
      movementPathWitnessRepaired:
        result.movementPathWitnessRepaired === true,
      movementPathReplayAttempts: result.movementPathReplayAttempts || [],
      reason: String(result.reason || ""),
    });
    steps.push(step);
    if (unexpectedEarlyTerminal || !result.ok ||
        successorStateInvariantAudit?.ok === false ||
        observedSuccessorStateHash !== expectedSuccessorStateHash) {
      failures.push({
        ...step,
        reason: unexpectedEarlyTerminal
          ? "full_route_replay_unexpected_early_terminal"
          : !result.ok
          ? result.reason || "full_route_replay_transition_rejected"
          : successorStateInvariantAudit?.ok === false
          ? "full_route_replay_successor_state_invariant_rejected"
          : "full_route_replay_successor_hash_mismatch",
        legalActionKeys: result.legalActionKeys || [],
        rejectedAction: result.rejectedAction || null,
        stateInvariantAudit: successorStateInvariantAudit
          ? summarizeWarmachineReverseStateBoundaryAuditV1(
            successorStateInvariantAudit,
          )
          : null,
        stateInvariantIssues: successorStateInvariantAudit?.issues || [],
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
    stateInvariantAudits: stableGraphValue(stateInvariantAudits),
    stateInvariantAuditPassed: stateInvariantAudits.every((audit) =>
      audit.ok === true),
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

export function recoverWarmachineTerminalReverseRoutePrefixV1(
  route = {},
  targetReversedPriorTurnCount = 0,
  rawOptions = {},
) {
  const targetCount = Math.max(0, Math.floor(Number(
    targetReversedPriorTurnCount || 0,
  )));
  const sourceEdges = [...(route.reverseEdges || [])];
  let observedPreviousTurnCount = 0;
  let prefixLength = sourceEdges.length;
  for (const [index, edge] of sourceEdges.entries()) {
    if (edge.operatorKey !== "previous_turn_end_inverse_v1") continue;
    if (observedPreviousTurnCount === targetCount) {
      prefixLength = index;
      break;
    }
    observedPreviousTurnCount += 1;
  }
  const retainedEdges = sourceEdges.slice(0, prefixLength);
  const removedEdges = sourceEdges.slice(prefixLength);
  const retainedPreviousTurnCount = retainedEdges.filter((edge) =>
    edge.operatorKey === "previous_turn_end_inverse_v1").length;
  const failures = [];
  const steps = [];
  const freshReceiptHashes = [];
  let state = normalizeRulesV1State(route.predecessorState || {});
  if (retainedPreviousTurnCount !== targetCount) {
    failures.push({
      reason: "reverse_route_prefix_target_depth_not_present",
      targetReversedPriorTurnCount: targetCount,
      retainedPreviousTurnCount,
    });
  }
  for (const [edgeIndex, edge] of [...removedEdges].reverse().entries()) {
    if (failures.length) break;
    const observedPredecessorStateHash =
      warmachineReverseStateSemanticHashV1(state);
    if (observedPredecessorStateHash !== edge.predecessorStateHash) {
      failures.push({
        edgeIndex,
        reason: "reverse_route_prefix_predecessor_hash_mismatch",
        expectedPredecessorStateHash: edge.predecessorStateHash,
        observedPredecessorStateHash,
      });
      break;
    }
    const result = executeEdge(state, edge, {
      ...rawOptions,
      routeKey: String(rawOptions.routeKey ||
        `reverse-route-prefix-recovery:${route.candidateKey || "route"}`),
      edgeIndex,
    });
    const observedSuccessorStateHash = result.state
      ? warmachineReverseStateSemanticHashV1(result.state)
      : "";
    const receiptHashes = (result.receipts || []).map((receipt) =>
      String(receipt.receiptHash || "")).filter(Boolean);
    const emittedTerminalEvents = terminalEventsFromReceipts(
      result.receipts || [],
    );
    freshReceiptHashes.push(...receiptHashes);
    steps.push(stableGraphValue({
      edgeIndex,
      operatorKey: String(edge.operatorKey || ""),
      transitionAccepted: result.ok === true,
      expectedPredecessorStateHash: String(edge.predecessorStateHash || ""),
      observedPredecessorStateHash,
      expectedSuccessorStateHash: String(edge.successorStateHash || ""),
      observedSuccessorStateHash,
      freshReceiptHashes: receiptHashes,
      terminalEvents: emittedTerminalEvents,
      reason: String(result.reason || ""),
    }));
    rawOptions.onProgress?.({
      schemaVersion:
        WARMACHINE_TERMINAL_REVERSE_ROUTE_PREFIX_RECOVERY_V1_SCHEMA,
      stage: "prefix_recovery_edge_replayed",
      edgeIndex,
      replayedEdgeCount: steps.length,
      removedReverseEdgeCount: removedEdges.length,
      operatorKey: String(edge.operatorKey || ""),
      transitionAccepted: result.ok === true,
    });
    if (emittedTerminalEvents.length > 0 || !result.ok || !result.state ||
        observedSuccessorStateHash !== edge.successorStateHash) {
      failures.push({
        ...steps.at(-1),
        reason: emittedTerminalEvents.length > 0
          ? "reverse_route_prefix_unexpected_early_terminal"
          : !result.ok
          ? result.reason || "reverse_route_prefix_transition_rejected"
          : "reverse_route_prefix_successor_hash_mismatch",
      });
      break;
    }
    state = normalizeRulesV1State(result.state);
  }
  const recoveredStateHash = warmachineReverseStateSemanticHashV1(state);
  const expectedRecoveredStateHash = retainedEdges.length
    ? String(retainedEdges.at(-1).predecessorStateHash || "")
    : recoveredStateHash;
  if (!failures.length && recoveredStateHash !== expectedRecoveredStateHash) {
    failures.push({
      reason: "reverse_route_prefix_recovered_state_hash_mismatch",
      expectedRecoveredStateHash,
      recoveredStateHash,
    });
  }
  const currentHostPrefixRecoveryCertified = failures.length === 0 &&
    steps.length === removedEdges.length;
  const recoveredRoute = currentHostPrefixRecoveryCertified
    ? {
      candidateKey: `recovered-prefix-${stableGraphHash({
        sourceCandidateKey: String(route.candidateKey || ""),
        targetCount,
        recoveredStateHash,
      }, 32)}`,
      predecessorState: state,
      predecessorStateHash: recoveredStateHash,
      reverseEdges: retainedEdges,
      reversedPriorTurnCount: targetCount,
    }
    : null;
  const core = {
    schemaVersion: WARMACHINE_TERMINAL_REVERSE_ROUTE_PREFIX_RECOVERY_V1_SCHEMA,
    sourceRouteCandidateKey: String(route.candidateKey || ""),
    sourceReverseEdgeCount: sourceEdges.length,
    targetReversedPriorTurnCount: targetCount,
    retainedReverseEdgeCount: retainedEdges.length,
    removedReverseEdgeCount: removedEdges.length,
    recoveredStateHash,
    expectedRecoveredStateHash,
    freshStrictTransitionCount: freshReceiptHashes.length,
    freshReceiptHashes,
    steps,
    failures: stableGraphValue(failures),
    currentHostPrefixRecoveryCertified,
    priorReceiptHashesConsultedForExecution: false,
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
  };
  return {
    ...core,
    recoveredRoute,
    recoveryHash: stableGraphHash(stableGraphValue(core)),
    ok: currentHostPrefixRecoveryCertified,
  };
}

export function reissueWarmachineTerminalReverseRouteV1(
  route = {},
  terminalStateInput = {},
  rawOptions = {},
) {
  const openingState = normalizeRulesV1State(route.predecessorState || {});
  const terminalState = normalizeRulesV1State(terminalStateInput);
  const routeKey = String(rawOptions.routeKey ||
    `terminal-reverse-route-reissue:${route.candidateKey || "route"}`);
  const sourceEdges = [...(route.reverseEdges || [])];
  const orderedEdges = sourceEdges.map((edge, reverseEdgeIndex) => ({
    edge,
    reverseEdgeIndex,
  })).reverse();
  const reissuedEdges = Array(sourceEdges.length);
  const steps = [];
  const failures = [];
  const freshReceiptHashes = [];
  let state = openingState;

  for (const [edgeIndex, { edge, reverseEdgeIndex }] of orderedEdges.entries()) {
    const predecessorStateHash = warmachineReverseStateSemanticHashV1(state);
    const result = executeEdge(state, edge, {
      ...rawOptions,
      routeKey,
      edgeIndex,
    });
    const successorStateHash = result.state
      ? warmachineReverseStateSemanticHashV1(result.state)
      : "";
    const receiptHashes = (result.receipts || []).map((receipt) =>
      String(receipt.receiptHash || "")).filter(Boolean);
    const emittedTerminalEvents = terminalEventsFromReceipts(
      result.receipts || [],
    );
    const unexpectedEarlyTerminal = emittedTerminalEvents.length > 0 &&
      !declaredTerminalEdge(edge, edgeIndex, orderedEdges.length);
    const sourceSuccessorStateHash = String(edge.successorStateHash || "");
    const sourceSuccessorMatched = !sourceSuccessorStateHash ||
      successorStateHash === sourceSuccessorStateHash;
    freshReceiptHashes.push(...receiptHashes);
    const step = stableGraphValue({
      edgeIndex,
      reverseEdgeIndex,
      sourceCandidateKey: String(edge.candidateKey || ""),
      layerKey: String(edge.layerKey || ""),
      operatorKey: String(edge.operatorKey || ""),
      actionKeys: result.actionKeys || (result.actionKey ? [result.actionKey] : []),
      sourcePredecessorStateHash: String(edge.predecessorStateHash || ""),
      sourceSuccessorStateHash: String(edge.successorStateHash || ""),
      predecessorStateHash,
      successorStateHash,
      transitionAccepted: result.ok === true,
      freshReceiptHashes: receiptHashes,
      terminalEvents: emittedTerminalEvents,
      movementPathWitnessRepaired:
        result.movementPathWitnessRepaired === true,
      movementPathReplayAttempts: result.movementPathReplayAttempts || [],
      sourceSuccessorMatched,
      reason: String(result.reason || ""),
    });
    steps.push(step);
    rawOptions.onProgress?.({
      schemaVersion: WARMACHINE_TERMINAL_REVERSE_ROUTE_REISSUE_V1_SCHEMA,
      stage: "route_reissue_edge_replayed",
      edgeIndex,
      replayedEdgeCount: steps.length,
      reverseEdgeCount: sourceEdges.length,
      operatorKey: String(edge.operatorKey || ""),
      transitionAccepted: result.ok === true,
    });
    if (unexpectedEarlyTerminal || !result.ok || !result.state ||
        (rawOptions.requireSourceSuccessorStateHash === true &&
          !sourceSuccessorMatched)) {
      failures.push({
        ...step,
        reason: unexpectedEarlyTerminal
          ? "current_host_route_reissue_unexpected_early_terminal"
          : !result.ok || !result.state
          ? result.reason || "current_host_route_reissue_transition_rejected"
          : "current_host_route_reissue_source_successor_state_mismatch",
        legalActionKeys: result.legalActionKeys || [],
        rejectedAction: result.rejectedAction || null,
      });
      break;
    }

    const {
      candidateKey: sourceCandidateKey,
      predecessorStateKey: _sourcePredecessorStateKey,
      predecessorStateHash: _sourcePredecessorStateHash,
      successorStateKey: _sourceSuccessorStateKey,
      successorStateHash: _sourceSuccessorStateHash,
      strictReceiptHash: _sourceStrictReceiptHash,
      strictStepReceiptHashes: _sourceStrictStepReceiptHashes,
      provenance: sourceProvenance,
      ...preservedEdge
    } = edge;
    const currentReceiptHash = receiptHashes.length === 1
      ? receiptHashes[0]
      : stableGraphHash({
        schemaVersion: WARMACHINE_TERMINAL_REVERSE_ROUTE_REISSUE_V1_SCHEMA,
        receiptHashes,
      });
    const edgeCore = stableGraphValue({
      ...preservedEdge,
      ...(result.movementProposal
        ? { movementProposal: result.movementProposal }
        : {}),
      ...(result.reissuedActorPieceKey
        ? { actorPieceKey: result.reissuedActorPieceKey }
        : {}),
      ...(result.reissuedTransitionActionKey
        ? { transitionActionKey: result.reissuedTransitionActionKey }
        : {}),
      ...(result.reissuedStrictReplaySteps
        ? { strictReplaySteps: result.reissuedStrictReplaySteps }
        : {}),
      predecessorStateKey: String(state.stateKey || ""),
      predecessorStateHash,
      successorStateKey: String(result.state.stateKey || ""),
      successorStateHash,
      strictReceiptHash: currentReceiptHash,
      strictStepReceiptHashes: receiptHashes,
      strictWitness: true,
      provenance: {
        ...(sourceProvenance || {}),
        currentHostRouteReissued: true,
        reissuedFromCandidateKey: String(sourceCandidateKey || ""),
        sourcePredecessorStateHash: String(_sourcePredecessorStateHash || ""),
        sourceSuccessorStateHash: String(_sourceSuccessorStateHash || ""),
        reissueHostReceiptHash: warmachineHost.receipt.receiptHash,
      },
    });
    reissuedEdges[reverseEdgeIndex] = stableGraphValue({
      ...edgeCore,
      candidateKey: `current-route-edge-${stableGraphHash({
        schemaVersion: WARMACHINE_TERMINAL_REVERSE_ROUTE_REISSUE_V1_SCHEMA,
        sourceCandidateKey: String(sourceCandidateKey || ""),
        edgeCore,
      }, 32)}`,
    });
    state = normalizeRulesV1State(result.state);
  }

  const openingStateHash = warmachineReverseStateSemanticHashV1(openingState);
  const expectedTerminalStateHash = warmachineReverseStateSemanticHashV1(terminalState);
  const observedTerminalStateHash = warmachineReverseStateSemanticHashV1(state);
  if (!failures.length && observedTerminalStateHash !== expectedTerminalStateHash) {
    failures.push({
      reason: "current_host_route_reissue_terminal_state_mismatch",
      expectedTerminalStateHash,
      observedTerminalStateHash,
    });
  }
  const currentHostStrictReplayCertified = failures.length === 0 &&
    steps.length === sourceEdges.length && sourceEdges.length > 0 &&
    reissuedEdges.every(Boolean);
  const reissuedRouteCore = stableGraphValue({
    predecessorStateHash: openingStateHash,
    reverseEdges: reissuedEdges.filter(Boolean),
  });
  const reissuedRoute = currentHostStrictReplayCertified
    ? {
      candidateKey: `current-route-${stableGraphHash({
        schemaVersion: WARMACHINE_TERMINAL_REVERSE_ROUTE_REISSUE_V1_SCHEMA,
        sourceRouteCandidateKey: String(route.candidateKey || ""),
        ...reissuedRouteCore,
      }, 32)}`,
      predecessorState: openingState,
      ...reissuedRouteCore,
    }
    : null;
  const core = {
    schemaVersion: WARMACHINE_TERMINAL_REVERSE_ROUTE_REISSUE_V1_SCHEMA,
    routeKey,
    sourceRouteCandidateKey: String(route.candidateKey || ""),
    sourceOpeningStateHash: String(route.predecessorStateHash || ""),
    openingStateHash,
    expectedTerminalStateHash,
    observedTerminalStateHash,
    reverseEdgeCount: sourceEdges.length,
    replayedEdgeCount: steps.length,
    freshStrictTransitionCount: freshReceiptHashes.length,
    freshReceiptHashes,
    steps,
    failures: stableGraphValue(failures),
    currentHostStrictReplayCertified,
    storedActionWitnessesConsultedForExecution: true,
    priorReceiptHashesConsultedForExecution: false,
    freshEnumerationBeforeEveryTransition: true,
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    claimBoundary: "A stale route may be reissued only by freshly enumerating and executing every stored action/path witness through the current Host, rebuilding every edge hash and receipt, and exactly matching the current terminal state. Stored receipt hashes never authorize execution; one failed transition rejects the whole reissue.",
  };
  return {
    ...core,
    reissuedRoute,
    finalState: state,
    reissueHash: stableGraphHash(stableGraphValue(core)),
    ok: currentHostStrictReplayCertified,
  };
}
