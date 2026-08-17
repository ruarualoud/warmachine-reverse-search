import { performance } from "node:perf_hooks";

import {
  applyRulesV1Action,
  buildWarmachineRulesV1ActionWithStrictRngOutcome,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { buildWarmachineMinimalTerminalProofV2 } from "../reverse/terminal-proof-v2.mjs";

export const WARMACHINE_FORWARD_CONNECTOR_V2_SCHEMA =
  "warmachine_forward_connector_v2";
export const WARMACHINE_FORWARD_COMPLETION_COMPARISON_V2_SCHEMA =
  "warmachine_forward_completion_comparison_v2";

const ATTACK_ACTION_TYPES = new Set([
  "melee_attack",
  "ranged_attack",
  "magic_attack",
  "charge",
  "advance_then_melee_attack",
  "advance_then_ranged_attack",
]);

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function actionMatches(action = {}, selector = {}) {
  if (selector.actionKey && action.actionKey !== selector.actionKey) return false;
  if (selector.actionType && action.actionType !== selector.actionType) return false;
  if (Array.isArray(selector.actionTypes) && selector.actionTypes.length &&
    !selector.actionTypes.includes(action.actionType)) return false;
  if (selector.actorPieceKey && action.actorPieceKey !== selector.actorPieceKey) return false;
  if (selector.targetPieceKey && action.targetPieceKey !== selector.targetPieceKey) return false;
  if (selector.targetElementKey && action.targetElementKey !== selector.targetElementKey) return false;
  return true;
}

function point(value = {}) {
  return {
    xIn: numeric(value.xIn ?? value.x, 0),
    yIn: numeric(value.yIn ?? value.y, 0),
  };
}

function distance(left = {}, right = {}) {
  const a = point(left);
  const b = point(right);
  return Math.hypot(a.xIn - b.xIn, a.yIn - b.yIn);
}

function pieceByKey(state = {}, pieceKey = "") {
  return (state.pieces || []).find((piece) => piece.pieceKey === pieceKey) || null;
}

function actionDestination(action = {}, pieceKey = "") {
  const direct = action.targetPosition || action.destination || action.metadata?.targetPosition ||
    action.metadata?.destination;
  if (direct && typeof direct === "object") return point(direct);
  const row = (action.metadata?.destinationsByModel || []).find((entry) =>
    !pieceKey || entry.pieceKey === pieceKey);
  return row?.to ? point(row.to) : null;
}

function milestoneSatisfied(state = {}, enumeration = {}, milestone = {}) {
  if (milestone.milestoneKind === "action_available") {
    return (enumeration.actions || []).some((action) =>
      actionMatches(action, milestone.actionSelector || {}));
  }
  const piece = pieceByKey(state, milestone.pieceKey);
  if (!piece) return false;
  if (milestone.milestoneKind === "piece_distance_to_point_at_least") {
    return distance(piece.position, milestone.point) + 1e-9 >= numeric(milestone.distanceIn, 0);
  }
  if (milestone.milestoneKind === "piece_distance_to_point_at_most") {
    return distance(piece.position, milestone.point) <= numeric(milestone.distanceIn, 0) + 1e-9;
  }
  if (milestone.milestoneKind === "piece_distance_to_piece_at_most") {
    const target = pieceByKey(state, milestone.targetPieceKey);
    return Boolean(target && distance(piece.position, target.position) <=
      numeric(milestone.distanceIn, 0) + 1e-9);
  }
  if (milestone.milestoneKind === "piece_resource_at_least") {
    const amount = numeric(
      piece.resourcePoints ?? piece.focus ?? piece.fury ?? piece.soulTokens ?? piece.corpseTokens,
      0,
    );
    return amount >= numeric(milestone.amount, 0);
  }
  return false;
}

function milestoneProgressForAction(state = {}, action = {}, milestone = {}) {
  if (milestone.milestoneKind === "action_available") {
    return actionMatches(action, milestone.actionSelector || {}) ? 1 : 0;
  }
  if (action.actorPieceKey !== milestone.pieceKey) return 0;
  const actor = pieceByKey(state, milestone.pieceKey);
  const destination = actionDestination(action, milestone.pieceKey);
  if (!actor || !destination) return 0;
  if (milestone.milestoneKind === "piece_distance_to_point_at_least") {
    return distance(destination, milestone.point) - distance(actor.position, milestone.point);
  }
  if (milestone.milestoneKind === "piece_distance_to_point_at_most") {
    return distance(actor.position, milestone.point) - distance(destination, milestone.point);
  }
  if (milestone.milestoneKind === "piece_distance_to_piece_at_most") {
    const target = pieceByKey(state, milestone.targetPieceKey);
    return target
      ? distance(actor.position, target.position) - distance(destination, target.position)
      : 0;
  }
  return 0;
}

function actionGuidanceScore(state, action, terminalSelector, milestones, preferredPrefixActionTypes) {
  let score = actionMatches(action, terminalSelector) ? 1_000_000 : 0;
  for (const milestone of milestones) {
    score += milestoneProgressForAction(state, action, milestone) * 1_000;
    if (milestone.pieceKey && action.actorPieceKey === milestone.pieceKey) score += 10;
  }
  const preferredIndex = preferredPrefixActionTypes.indexOf(action.actionType);
  if (preferredIndex >= 0) score += 100 - preferredIndex;
  if (terminalSelector.actorPieceKey && action.actorPieceKey === terminalSelector.actorPieceKey) {
    score += 5;
  }
  if (terminalSelector.targetPieceKey && action.targetPieceKey === terminalSelector.targetPieceKey) {
    score += 5;
  }
  return score;
}

function orderedActions(state, actions, strategy, terminalSelector, milestones, preferredPrefixActionTypes) {
  const rows = actions.map((action) => ({
    action,
    score: strategy === "milestone_guided"
      ? actionGuidanceScore(
        state,
        action,
        terminalSelector,
        milestones,
        preferredPrefixActionTypes,
      )
      : 0,
  }));
  rows.sort((left, right) => right.score - left.score ||
    left.action.actionKey.localeCompare(right.action.actionKey));
  return rows;
}

function materializeStrictAction(state, enumeration, action, options, branchKey, actionPatch = {}) {
  const generated = buildWarmachineRulesV1ActionWithStrictRngOutcome(action, {
    room: {
      id: options.experimentKey,
      game: {
        round: state.turnNumber,
        turnNumber: state.turnNumber,
        activeSideKey: state.activeSideKey,
      },
    },
    sourceContext: {
      rulesV1State: state,
      rulesV1Enumeration: enumeration,
    },
    selectedActionKey: action.actionKey,
    branchKey,
  });
  const maxSuccessPatch = options.materializeMaximumSuccessDice !== false &&
    ATTACK_ACTION_TYPES.has(action.actionType)
    ? { strictRollOutcome: { attackDice: [6, 6], damageDice: [6, 6] } }
    : {};
  return {
    ...generated,
    ...maxSuccessPatch,
    ...stableGraphValue(actionPatch || {}),
    metadata: {
      ...(generated.metadata || {}),
      ...(actionPatch?.metadata || {}),
    },
    __warmachineTrustedRulesV1Enumeration: enumeration,
  };
}

function terminalProof(state, events, specification, beforeState = {}) {
  if (!events.some((event) => event?.eventType === "terminal")) return null;
  return buildWarmachineMinimalTerminalProofV2(state, specification, {
    strictEvents: events,
    terminalTurnNumber: beforeState.turnNumber,
    terminalPhaseKey: beforeState.phaseKey,
    endingSideKey: specification.endingSideKey || beforeState.activeSideKey,
    strictReceiptHash: stableGraphHash(events),
  });
}

function persistedStep(stepIndex, beforeState, action, transition) {
  return {
    stepIndex,
    stateKeyBefore: String(beforeState.stateKey || ""),
    turnNumberBefore: beforeState.turnNumber,
    activeSideKeyBefore: String(beforeState.activeSideKey || ""),
    phaseKeyBefore: String(beforeState.phaseKey || ""),
    actionKey: action.actionKey,
    actionType: action.actionType,
    actorPieceKey: String(action.actorPieceKey || ""),
    targetPieceKey: String(action.targetPieceKey || ""),
    transitionOk: transition.ok === true,
    nextStateKey: String(transition.nextState?.stateKey || ""),
    events: stableGraphValue(transition.events || []),
    rejection: stableGraphValue(transition.rejection || transition.error || null),
  };
}

function resultCore(mode, metrics, witness, startedAt, detail = {}) {
  const elapsedMs = Math.max(0, performance.now() - startedAt);
  const transitionCalls = metrics.transitionCalls;
  const witnessDepth = witness?.steps?.length || 0;
  const core = {
    schemaVersion: WARMACHINE_FORWARD_CONNECTOR_V2_SCHEMA,
    mode,
    strictWitness: Boolean(witness?.proof?.strictCertified),
    witness: witness || null,
    metrics: {
      ...metrics,
      elapsedMs: Number(elapsedMs.toFixed(3)),
      uselessBranchCount: Math.max(0, transitionCalls - witnessDepth),
      strictWitnessCount: witness?.proof?.strictCertified ? 1 : 0,
      witnessRate: metrics.routeCandidateCount > 0
        ? Number((Boolean(witness?.proof?.strictCertified) / metrics.routeCandidateCount).toFixed(6))
        : 0,
      omittedBranchFraction: metrics.legalActionCountObserved > 0
        ? Number((metrics.omittedActionCount / metrics.legalActionCountObserved).toFixed(6))
        : 0,
    },
    chanceMassComplete: false,
    opponentResponseSetComplete: false,
    terminalQuality: witness?.proof?.strictCertified
      ? "strict_concrete_terminal_witness"
      : "no_strict_terminal_witness",
    ...detail,
    globalOptimalityProven: false,
    trainingTruth: false,
    claimBoundary: "This experiment compares finite strict witness discovery under one declared RNG materialization and bounded action search. Omitted actions, opponent responses and Chance outcomes remain unresolved.",
  };
  const semanticCore = {
    ...core,
    metrics: {
      ...core.metrics,
      elapsedMs: undefined,
    },
  };
  return { ...core, resultHash: stableGraphHash(semanticCore) };
}

export function runWarmachineReverseAtomicRoutesV2(
  initialStateInput = {},
  routeProposals = [],
  terminalSpecification = {},
  rawOptions = {},
) {
  const startedAt = performance.now();
  const options = {
    experimentKey: String(rawOptions.experimentKey || "reverse-atomic-v2"),
    materializeMaximumSuccessDice: rawOptions.materializeMaximumSuccessDice !== false,
  };
  const metrics = {
    routeCandidateCount: routeProposals.length,
    enumerationCalls: 0,
    transitionCalls: 0,
    strictRejectedCount: 0,
    unavailableRequestedActionCount: 0,
    legalActionCountObserved: 0,
    omittedActionCount: 0,
    deadEndTerminalAttemptCount: 0,
    uniqueStateCount: 1,
    budgetUnresolvedCount: 0,
  };
  let witness = null;
  const candidateRows = [];
  for (const [proposalIndex, proposal] of routeProposals.entries()) {
    let state = normalizeRulesV1State(initialStateInput);
    const visited = new Set([stateIdentity(state)]);
    const steps = [];
    const allEvents = [];
    let candidateReason = "route_exhausted_without_terminal";
    for (const [stepIndex, step] of (proposal.steps || []).entries()) {
      const enumeration = enumerateRulesV1Actions(state, step.enumerationOptions || {});
      metrics.enumerationCalls += 1;
      metrics.legalActionCountObserved += (enumeration.actions || []).length;
      const action = (enumeration.actions || []).find((candidate) =>
        actionMatches(candidate, step.actionSelector || step));
      if (!action) {
        metrics.unavailableRequestedActionCount += 1;
        candidateReason = "requested_reverse_atomic_action_unavailable";
        break;
      }
      const strictAction = materializeStrictAction(
        state,
        enumeration,
        action,
        options,
        `proposal-${proposalIndex}-step-${stepIndex}`,
        step.actionPatch,
      );
      const transition = applyRulesV1Action(state, strictAction);
      metrics.transitionCalls += 1;
      steps.push(persistedStep(stepIndex, state, action, transition));
      allEvents.push(...(transition.events || []));
      if (!transition.ok) {
        metrics.strictRejectedCount += 1;
        candidateReason = "strict_transition_rejected";
        break;
      }
      const beforeState = state;
      state = transition.nextState;
      visited.add(stateIdentity(state));
      metrics.uniqueStateCount = Math.max(metrics.uniqueStateCount, visited.size);
      const proof = terminalProof(state, allEvents, terminalSpecification, beforeState);
      if (proof?.strictCertified) {
        witness = {
          proposalKey: String(proposal.proposalKey || `proposal-${proposalIndex}`),
          steps,
          proof,
          finalStateKey: String(state.stateKey || ""),
        };
        candidateReason = "strict_terminal_witness_found";
        break;
      }
    }
    candidateRows.push({
      proposalKey: String(proposal.proposalKey || `proposal-${proposalIndex}`),
      stepCount: steps.length,
      reason: candidateReason,
    });
    if (witness) break;
  }
  return resultCore("pure_reverse_atomic", metrics, witness, startedAt, {
    candidateRows,
    stopReason: witness ? "strict_terminal_witness_found" : "reverse_atomic_candidates_exhausted",
  });
}

function stateIdentity(state) {
  return stableGraphHash(normalizeRulesV1State(state));
}

export function runWarmachineStrictForwardConnectorV2(
  initialStateInput = {},
  terminalSpecification = {},
  rawOptions = {},
) {
  const startedAt = performance.now();
  const strategy = rawOptions.strategy === "milestone_guided"
    ? "milestone_guided"
    : "unguided";
  const options = {
    experimentKey: String(rawOptions.experimentKey || `forward-connector-${strategy}-v2`),
    materializeMaximumSuccessDice: rawOptions.materializeMaximumSuccessDice !== false,
    maximumDepth: Math.max(1, Math.floor(numeric(rawOptions.maximumDepth, 3))),
    maximumExpandedStates: Math.max(1, Math.floor(numeric(rawOptions.maximumExpandedStates, 128))),
    maximumTransitions: Math.max(1, Math.floor(numeric(rawOptions.maximumTransitions, 512))),
    maximumActionsPerState: Math.max(1, Math.floor(numeric(
      rawOptions.maximumActionsPerState,
      strategy === "milestone_guided" ? 4 : 64,
    ))),
    terminalActionSelector: stableGraphValue(rawOptions.terminalActionSelector || {}),
    milestones: stableGraphValue(rawOptions.milestones || []),
    preferredPrefixActionTypes: [...(rawOptions.preferredPrefixActionTypes || [])].map(String),
  };
  const initialState = normalizeRulesV1State(initialStateInput);
  const queue = [{ state: initialState, depth: 0, steps: [], allEvents: [] }];
  const visited = new Set([stateIdentity(initialState)]);
  const metrics = {
    routeCandidateCount: 0,
    enumerationCalls: 0,
    transitionCalls: 0,
    strictRejectedCount: 0,
    unavailableRequestedActionCount: 0,
    legalActionCountObserved: 0,
    omittedActionCount: 0,
    deadEndTerminalAttemptCount: 0,
    uniqueStateCount: 1,
    expandedStateCount: 0,
    milestoneSatisfiedStateCount: 0,
    budgetUnresolvedCount: 0,
  };
  let witness = null;
  let stopReason = "frontier_exhausted_without_terminal";
  while (queue.length) {
    if (metrics.expandedStateCount >= options.maximumExpandedStates) {
      metrics.budgetUnresolvedCount += queue.length;
      stopReason = "expanded_state_budget_exhausted";
      break;
    }
    if (metrics.transitionCalls >= options.maximumTransitions) {
      metrics.budgetUnresolvedCount += queue.length;
      stopReason = "transition_budget_exhausted";
      break;
    }
    const node = queue.shift();
    if (node.depth >= options.maximumDepth) continue;
    const enumeration = enumerateRulesV1Actions(node.state);
    metrics.enumerationCalls += 1;
    metrics.expandedStateCount += 1;
    const actions = enumeration.actions || [];
    metrics.legalActionCountObserved += actions.length;
    const satisfiedMilestones = options.milestones.filter((milestone) =>
      milestoneSatisfied(node.state, enumeration, milestone));
    if (satisfiedMilestones.length) metrics.milestoneSatisfiedStateCount += 1;
    const ordered = orderedActions(
      node.state,
      actions,
      strategy,
      options.terminalActionSelector,
      options.milestones,
      options.preferredPrefixActionTypes,
    );
    const selected = ordered.slice(0, options.maximumActionsPerState);
    metrics.omittedActionCount += Math.max(0, ordered.length - selected.length);
    for (const [actionIndex, row] of selected.entries()) {
      if (metrics.transitionCalls >= options.maximumTransitions) {
        metrics.budgetUnresolvedCount += selected.length - actionIndex;
        stopReason = "transition_budget_exhausted";
        break;
      }
      const action = row.action;
      const terminalAttempt = actionMatches(action, options.terminalActionSelector);
      const strictAction = materializeStrictAction(
        node.state,
        enumeration,
        action,
        options,
        `depth-${node.depth}-transition-${metrics.transitionCalls}`,
      );
      const transition = applyRulesV1Action(node.state, strictAction);
      metrics.transitionCalls += 1;
      metrics.routeCandidateCount += 1;
      const step = persistedStep(node.steps.length, node.state, action, transition);
      if (!transition.ok) {
        metrics.strictRejectedCount += 1;
        continue;
      }
      const allEvents = [...node.allEvents, ...(transition.events || [])];
      const proof = terminalProof(
        transition.nextState,
        allEvents,
        terminalSpecification,
        node.state,
      );
      if (proof?.strictCertified) {
        witness = {
          steps: [...node.steps, step],
          proof,
          finalStateKey: String(transition.nextState?.stateKey || ""),
          satisfiedMilestoneKeys: satisfiedMilestones.map((milestone) => milestone.milestoneKey),
        };
        stopReason = "strict_terminal_witness_found";
        break;
      }
      if (terminalAttempt) {
        metrics.deadEndTerminalAttemptCount += 1;
        continue;
      }
      const identity = stateIdentity(transition.nextState);
      if (visited.has(identity)) continue;
      visited.add(identity);
      metrics.uniqueStateCount = visited.size;
      queue.push({
        state: transition.nextState,
        depth: node.depth + 1,
        steps: [...node.steps, step],
        allEvents,
      });
    }
    if (witness || stopReason === "transition_budget_exhausted") break;
  }
  return resultCore(
    strategy === "milestone_guided" ? "reverse_milestone_forward_connector" : "unguided_forward",
    metrics,
    witness,
    startedAt,
    {
      stopReason,
      searchContract: {
        maximumDepth: options.maximumDepth,
        maximumExpandedStates: options.maximumExpandedStates,
        maximumTransitions: options.maximumTransitions,
        maximumActionsPerState: options.maximumActionsPerState,
        terminalActionSelector: options.terminalActionSelector,
        milestoneKeys: options.milestones.map((milestone) => milestone.milestoneKey),
      },
    },
  );
}

export function runWarmachineForwardCompletionComparisonV2(scenarios = [], rawOptions = {}) {
  const startedAt = performance.now();
  const rows = scenarios.map((scenario, scenarioIndex) => {
    const experimentKey = String(scenario.scenarioKey || `scenario-${scenarioIndex}`);
    const shared = {
      experimentKey,
      maximumDepth: scenario.maximumDepth ?? rawOptions.maximumDepth ?? 3,
      maximumExpandedStates: scenario.maximumExpandedStates ??
        rawOptions.maximumExpandedStates ?? 128,
      maximumTransitions: scenario.maximumTransitions ?? rawOptions.maximumTransitions ?? 512,
      materializeMaximumSuccessDice: scenario.materializeMaximumSuccessDice !== false,
      terminalActionSelector: scenario.terminalActionSelector,
      milestones: scenario.milestones || [],
      preferredPrefixActionTypes: scenario.preferredPrefixActionTypes || [],
    };
    const pureReverse = runWarmachineReverseAtomicRoutesV2(
      scenario.initialState,
      scenario.reverseRouteProposals || [],
      scenario.terminalSpecification,
      shared,
    );
    const unguidedForward = runWarmachineStrictForwardConnectorV2(
      scenario.initialState,
      scenario.terminalSpecification,
      {
        ...shared,
        strategy: "unguided",
        maximumActionsPerState: scenario.unguidedMaximumActionsPerState ?? 64,
      },
    );
    const milestoneConnector = runWarmachineStrictForwardConnectorV2(
      scenario.initialState,
      scenario.terminalSpecification,
      {
        ...shared,
        strategy: "milestone_guided",
        maximumActionsPerState: scenario.guidedMaximumActionsPerState ?? 4,
      },
    );
    const reverseAlreadyExact = pureReverse.strictWitness;
    const connectorRecoveredGap = !pureReverse.strictWitness && milestoneConnector.strictWitness;
    const guidedUsesFewerTransitions = milestoneConnector.metrics.transitionCalls <=
      unguidedForward.metrics.transitionCalls;
    return {
      scenarioKey: experimentKey,
      terminalSpecification: stableGraphValue(scenario.terminalSpecification),
      pureReverse,
      unguidedForward,
      milestoneConnector,
      decision: {
        reverseAlreadyExact,
        connectorRecoveredGap,
        guidedUsesFewerTransitions,
        preferredMode: reverseAlreadyExact
          ? "pure_reverse_atomic"
          : connectorRecoveredGap && guidedUsesFewerTransitions
            ? "reverse_milestone_forward_connector"
            : unguidedForward.strictWitness
              ? "unguided_forward_experiment_only"
              : "unresolved_no_witness",
      },
    };
  });
  const counts = {
    scenarioCount: rows.length,
    pureReverseWitnessCount: rows.filter((row) => row.pureReverse.strictWitness).length,
    unguidedForwardWitnessCount: rows.filter((row) => row.unguidedForward.strictWitness).length,
    milestoneConnectorWitnessCount: rows.filter((row) => row.milestoneConnector.strictWitness).length,
    connectorRecoveredGapCount: rows.filter((row) => row.decision.connectorRecoveredGap).length,
    directReversePreferredCount: rows.filter((row) =>
      row.decision.preferredMode === "pure_reverse_atomic").length,
    guidedConnectorPreferredCount: rows.filter((row) =>
      row.decision.preferredMode === "reverse_milestone_forward_connector").length,
    unresolvedScenarioCount: rows.filter((row) =>
      row.decision.preferredMode === "unresolved_no_witness").length,
  };
  const core = {
    schemaVersion: WARMACHINE_FORWARD_COMPLETION_COMPARISON_V2_SCHEMA,
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    rows,
    counts,
    decisionPolicy: {
      enableConnectorWhen: [
        "a complete rules state and a typed reverse milestone bound both connector endpoints",
        "the pure reverse atomic route lacks a strict witness",
        "the guided connector recovers a strict witness within declared budgets",
        "every omitted legal action is reported as unresolved",
      ],
      bypassConnectorWhen: [
        "the reverse route already replays to a strict terminal witness",
        "the terminal action is directly executable and certified",
      ],
      stopConnectorWhen: [
        "expanded-state or transition budget is exhausted",
        "the terminal action is attempted without producing the requested terminal",
        "the frontier is exhausted",
        "repeated strict rejection yields an exact CEGAR refinement for the same state/action",
      ],
      cegarFeedback: [
        "unavailable terminal action refines a missing predecessor obligation",
        "strict rejection refines the exact bound state/action only",
        "budget or omitted actions create unresolved records, never refutations",
      ],
      selectedArchitecture: "exact reverse suffix first, bounded milestone-guided strict connector only for explicit gaps; unguided forward search remains a benchmark and fallback experiment, not the default architecture",
    },
    elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    chanceMassComplete: false,
    opponentResponseSetComplete: false,
    globalOptimalityProven: false,
    trainingTruth: false,
    claimBoundary: "The selected architecture is based on this finite Host-backed batch. It does not establish that milestone completion always helps, and it never converts connector failure or omitted branches into a strategic impossibility proof.",
  };
  const semanticRows = rows.map((row) => ({
    scenarioKey: row.scenarioKey,
    terminalSpecification: row.terminalSpecification,
    pureReverseResultHash: row.pureReverse.resultHash,
    unguidedForwardResultHash: row.unguidedForward.resultHash,
    milestoneConnectorResultHash: row.milestoneConnector.resultHash,
    decision: row.decision,
  }));
  return {
    ...core,
    comparisonHash: stableGraphHash({
      schemaVersion: core.schemaVersion,
      upstreamReceiptHash: core.upstreamReceiptHash,
      rows: semanticRows,
      counts: core.counts,
      decisionPolicy: core.decisionPolicy,
      chanceMassComplete: core.chanceMassComplete,
      opponentResponseSetComplete: core.opponentResponseSetComplete,
      globalOptimalityProven: core.globalOptimalityProven,
      trainingTruth: core.trainingTruth,
      claimBoundary: core.claimBoundary,
    }),
  };
}
