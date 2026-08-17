import { enumerateWarmachineBenchmarkActionsV2 } from
  "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { expandWarmachineStrictPolicyStepV1 } from
  "../search/strict-policy-step-v1.mjs";
import { normalizeRulesV1State, warmachineHost } from "../warmachine-host-runtime.mjs";
import { buildWarmachineReverseReachabilityCandidateSetV2 } from
  "./reachability-contract-v2.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";
import { warmachinePieceInPlayV1 } from "./piece-lifecycle-v1.mjs";

export const WARMACHINE_PASS_ACTIVATION_PREDECESSOR_V1_SCHEMA =
  "warmachine_pass_activation_predecessor_v1";
export const WARMACHINE_PASS_ACTIVATION_SEQUENCE_V1_SCHEMA =
  "warmachine_pass_activation_sequence_v1";

function alive(piece = {}) {
  return warmachinePieceInPlayV1(piece);
}

function semanticDifferenceRows(left, right, path = "", rows = [], limit = 64) {
  if (rows.length >= limit || Object.is(left, right)) return rows;
  if (typeof left !== typeof right || left === null || right === null ||
      typeof left !== "object") {
    rows.push(stableGraphValue({ path, executed: left, expected: right }));
    return rows;
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => key !== "stateKey").sort();
  for (const key of keys) {
    semanticDifferenceRows(
      left[key],
      right[key],
      path ? `${path}.${key}` : key,
      rows,
      limit,
    );
    if (rows.length >= limit) break;
  }
  return rows;
}

const PASS_ACTIVATION_COMPLETION_ACTION_TYPES = new Set([
  "decline_reposition",
]);

function passCompletionRoutes(
  stateInput,
  successorSemanticHash,
  sideKey,
  rawOptions = {},
) {
  const maximumDepth = Math.max(0, Math.floor(Number(
    rawOptions.maximumCompletionDepth ?? 16,
  )));
  const maximumLabels = Math.max(1, Math.floor(Number(
    rawOptions.maximumCompletionLabels ?? 64,
  )));
  const queue = [{ state: stateInput, strictReplaySteps: [], strictReceiptHashes: [] }];
  const visited = new Set();
  const matching = [];
  const unresolved = [];
  while (queue.length && visited.size < maximumLabels) {
    const current = queue.shift();
    const stateHash = warmachineReverseStateSemanticHashV1(current.state);
    const visitKey = stableGraphHash({
      stateHash,
      actionKeys: current.strictReplaySteps.map((step) => step.actionKey),
    });
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);
    if (stateHash === successorSemanticHash) {
      matching.push(current);
      continue;
    }
    if (current.strictReplaySteps.length >= maximumDepth) {
      unresolved.push({
        stateHash,
        reason: "pass_activation_completion_depth_budget_exhausted",
      });
      continue;
    }
    const scoped = enumerateWarmachineBenchmarkActionsV2(current.state, {
      includeActorlessActions: true,
    });
    const actions = (scoped.enumeration.actions || []).filter((action) =>
      PASS_ACTIVATION_COMPLETION_ACTION_TYPES.has(action.actionType));
    if (!actions.length) {
      unresolved.push({
        stateHash,
        reason: "pass_activation_completion_action_not_available",
        activeWindowKeys: [
          "repositionWindow",
          "anyTimeActivationWindow",
          "initialAttackWindow",
          "combatPurchaseWindow",
        ].filter((key) => current.state[key]),
      });
      continue;
    }
    for (const action of actions) {
      const step = expandWarmachineStrictPolicyStepV1(
        current.state,
        () => ({ scoped, action, deterministicAction: true, nextPolicyCursor: 1 }),
        {
          routeKey: `pass-activation-completion:${action.actionKey}`,
          perspectiveSideKey: sideKey,
        },
      );
      if (step.stepType !== "deterministic" ||
          step.successor?.transitionAccepted !== true || !step.successor.state) {
        unresolved.push({
          stateHash,
          actionKey: action.actionKey,
          actionType: action.actionType,
          reason: step.reason || `pass_activation_completion_step_${step.stepType}`,
        });
        continue;
      }
      queue.push({
        state: step.successor.state,
        strictReplaySteps: [
          ...current.strictReplaySteps,
          stableGraphValue({
            actionKey: action.actionKey,
            actionType: action.actionType,
            actorPieceKey: String(action.actorPieceKey || ""),
            targetPieceKey: String(action.targetPieceKey || ""),
            actionPatch: {},
          }),
        ],
        strictReceiptHashes: [
          ...current.strictReceiptHashes,
          String(step.successor.receiptHash || ""),
        ].filter(Boolean),
      });
    }
  }
  if (queue.length) {
    unresolved.push(...queue.map((row) => ({
      stateHash: warmachineReverseStateSemanticHashV1(row.state),
      reason: "pass_activation_completion_label_budget_exhausted",
    })));
  }
  return { matching, unresolved };
}

function activationGroupPieces(state = {}, actor = {}) {
  if (!actor?.unitGroupId) return [actor].filter(Boolean);
  return (state.pieces || []).filter((piece) =>
    alive(piece) && piece.sideKey === actor.sideKey &&
    piece.unitGroupId === actor.unitGroupId);
}

function setPieceResourcePoints(piece = {}, points = 0) {
  const value = Math.max(0, Number(points || 0));
  piece.resourcePoints = value;
  piece.resource2 = value;
  if (String(piece.resourceKind || "") === "focus" || "focus" in piece) {
    piece.focus = value;
  }
  if (String(piece.resourceKind || "") === "fury" || "fury" in piece) {
    piece.fury = value;
  }
}

function resourcePreimagePoints(successor = {}, actorPieceKey = "") {
  const actor = (successor.pieces || []).find((piece) =>
    piece.pieceKey === actorPieceKey) || {};
  return [...new Set([Number(actor.resourcePoints || 0)].filter((value) =>
    Number.isInteger(value) && value >= 0))].sort((left, right) => right - left);
}

function restoreBeforePassActivation(successor, actorPieceKey, preActivationResourcePoints) {
  const state = structuredClone(successor);
  const actor = state.pieces.find((piece) => piece.pieceKey === actorPieceKey);
  if (!actor) throw new Error(`pass_activation_actor_missing:${actorPieceKey}`);
  const activationGroup = activationGroupPieces(state, actor);
  for (const member of activationGroup) {
    member.activated = false;
    member.activationKey = "";
  }
  setPieceResourcePoints(actor, preActivationResourcePoints);
  state.activationForfeitWindow = null;
  state.anyTimeActivationWindow = null;
  state.initialAttackWindow = null;
  state.combatPurchaseWindow = null;
  state.activationPreludeActorPieceKey = "";
  state.activationPreludeKind = "";
  state.soulTakerActivationPreludeActorPieceKey = "";
  state.stateKey = `pass-activation-predecessor-${stableGraphHash({
    successorStateHash: warmachineReverseStateSemanticHashV1(successor),
    actorPieceKey,
    preActivationResourcePoints,
    activationGroupPieceKeys: activationGroup.map((piece) => piece.pieceKey).sort(),
  }, 24)}`;
  return {
    state: normalizeRulesV1State(state),
    activationGroupPieceKeys: activationGroup.map((piece) => piece.pieceKey).sort(),
    preActivationResourcePoints,
  };
}

function candidateActorKeys(successor, rawOptions = {}) {
  const requested = Array.isArray(rawOptions.actorPieceKeys)
    ? new Set(rawOptions.actorPieceKeys.map(String))
    : null;
  const sideKey = String(rawOptions.sideKey || successor.activeSideKey || "");
  return (successor.pieces || []).filter((piece) =>
    alive(piece) && piece.sideKey === sideKey && piece.activated === true &&
    (!requested || requested.has(piece.pieceKey)))
    .map((piece) => piece.pieceKey).sort();
}

export function generateWarmachinePassActivationPredecessorsV1(
  successorStateInput = {},
  rawOptions = {},
) {
  const successor = normalizeRulesV1State(successorStateInput);
  const successorSemanticHash = warmachineReverseStateSemanticHashV1(successor);
  const sideKey = String(rawOptions.sideKey || successor.activeSideKey || "");
  const allActors = candidateActorKeys(successor, { ...rawOptions, sideKey });
  const maximumActorCandidates = Math.max(0, Math.floor(Number(
    rawOptions.maximumActorCandidates || 0,
  )));
  const actors = maximumActorCandidates > 0
    ? allActors.slice(0, maximumActorCandidates)
    : allActors;
  const candidates = [];
  const unresolved = (maximumActorCandidates > 0
    ? allActors.slice(maximumActorCandidates)
    : []).map((actorPieceKey) => ({
    actorPieceKey,
    reason: "pass_activation_actor_budget_deferred",
  }));
  const rejected = [];
  for (const actorPieceKey of actors) {
    for (const preActivationResourcePoints of resourcePreimagePoints(
      successor,
      actorPieceKey,
    )) {
      const restored = restoreBeforePassActivation(
        successor,
        actorPieceKey,
        preActivationResourcePoints,
      );
      const predecessor = restored.state;
      const scoped = enumerateWarmachineBenchmarkActionsV2(predecessor, {
        actorPieceKeys: [actorPieceKey],
        actionFamilyKeys: ["timing"],
      });
      const actions = (scoped.enumeration.actions || []).filter((action) =>
        action.actionType === "pass" && action.actorPieceKey === actorPieceKey);
      if (!actions.length) {
        const rejectedPassActions = (scoped.enumeration.rejectedActions || [])
          .filter((action) => action.actionType === "pass" &&
            action.actorPieceKey === actorPieceKey)
          .map((action) => stableGraphValue(action));
        const availableActorActionTypes = [...new Set((scoped.enumeration.actions || [])
          .filter((action) => action.actorPieceKey === actorPieceKey)
          .map((action) => String(action.actionType || ""))
          .filter(Boolean))].sort();
        unresolved.push({
          actorPieceKey,
          preActivationResourcePoints,
          predecessorStateHash: warmachineReverseStateSemanticHashV1(predecessor),
          reason: "pass_activation_action_not_in_strict_legal_space",
          rejectedPassActions,
          availableActorActionTypes,
        });
        continue;
      }
      for (const action of actions) {
      const step = expandWarmachineStrictPolicyStepV1(
        predecessor,
        () => ({
          scoped,
          action,
          deterministicAction: true,
          nextPolicyCursor: 1,
        }),
        {
          routeKey: `pass-activation-predecessor:${actorPieceKey}`,
          perspectiveSideKey: sideKey,
        },
      );
      const strictAccepted = step.stepType === "deterministic" &&
        step.successor?.transitionAccepted === true && step.successor.state;
      const completion = strictAccepted
        ? passCompletionRoutes(
            step.successor.state,
            successorSemanticHash,
            sideKey,
            rawOptions,
          )
        : { matching: [], unresolved: [] };
      const strictMatch = completion.matching.length > 0;
      if (!strictMatch) {
        rejected.push({
          actorPieceKey,
          preActivationResourcePoints,
          actionKey: action.actionKey,
          predecessorStateHash: warmachineReverseStateSemanticHashV1(predecessor),
          reason: step.stepType !== "deterministic"
            ? step.reason || `pass_activation_step_${step.stepType}`
            : "strict_pass_successor_does_not_match_supplied_state",
          receiptHash: String(step.successor?.receiptHash || ""),
          semanticDifferences: step.successor?.state
            ? semanticDifferenceRows(step.successor.state, successor)
            : [],
          completionUnresolved: completion.unresolved,
        });
        continue;
      }
      const completionRoute = completion.matching[0];
      const predecessorStateHash = warmachineReverseStateSemanticHashV1(predecessor);
      const core = {
        candidateKind: "concrete_pass_activation_predecessor",
        successorKind: "state_after_pass_activation",
        predecessorKind: "state_before_pass_activation",
        operatorKey: "pass_activation_inverse_v1",
        actorPieceKey,
        activationGroupPieceKeys: restored.activationGroupPieceKeys,
        activationGroupId: String(
          predecessor.pieces.find((piece) => piece.pieceKey === actorPieceKey)?.unitGroupId || "",
        ),
        preActivationResourcePoints: restored.preActivationResourcePoints,
        predecessorStateKey: String(predecessor.stateKey || ""),
        predecessorStateHash,
        successorStateKey: String(successor.stateKey || ""),
        successorStateHash: successorSemanticHash,
        transitionActionKey: action.actionKey,
        strictWitness: true,
        strictRejected: false,
        strictReceiptHash: step.successor.receiptHash,
        strictStepReceiptHashes: [
          String(step.successor.receiptHash || ""),
          ...completionRoute.strictReceiptHashes,
        ].filter(Boolean),
        strictReplaySteps: stableGraphValue([{
          actionKey: action.actionKey,
          actionType: action.actionType,
          actorPieceKey: String(action.actorPieceKey || actorPieceKey),
          targetPieceKey: String(action.targetPieceKey || ""),
          actionPatch: {},
        }, ...completionRoute.strictReplaySteps]),
        unresolvedReasons: [],
        provenance: {
          upstreamReceiptHash: warmachineHost.receipt.receiptHash,
          oracleOpeningRead: false,
          oracleRouteRead: false,
          oracleIntermediateStateRead: false,
          resourcePreimageSource: "preserve_successor_resource_points",
        },
      };
      candidates.push({
        ...core,
        candidateKey: `pass-activation-predecessor-${stableGraphHash(core, 32)}`,
        predecessorState: predecessor,
      });
      }
    }
  }
  candidates.sort((left, right) => left.candidateKey.localeCompare(right.candidateKey));
  const publicCandidates = candidates.map(({ predecessorState: _state, ...candidate }) => candidate);
  const candidateSet = buildWarmachineReverseReachabilityCandidateSetV2(publicCandidates, {
    queryKey: String(rawOptions.queryKey ||
      `pass-activation:${sideKey}:${successorSemanticHash}`),
    successorStateKey: String(successor.stateKey || ""),
    maximumCandidates: rawOptions.maximumCandidates ?? publicCandidates.length,
  });
  const core = {
    schemaVersion: WARMACHINE_PASS_ACTIVATION_PREDECESSOR_V1_SCHEMA,
    sideKey,
    successorStateKey: String(successor.stateKey || ""),
    successorSemanticHash,
    candidateActorCount: allActors.length,
    attemptedActorCount: actors.length,
    strictCandidateCount: candidates.length,
    strictRejectedCount: rejected.length,
    unresolvedCount: unresolved.length,
    publicCandidates: stableGraphValue(publicCandidates),
    rejected: stableGraphValue(rejected),
    unresolved: stableGraphValue(unresolved),
    budgets: { maximumActorCandidates },
    candidateSet,
    claimBoundary: "This inverse covers only an activation whose complete rules effect is the strict pass transition. It cannot absorb movement, attacks, resource changes, triggers, reactions or any other activation side effect.",
  };
  return {
    ...core,
    candidates,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: candidateSet.reachabilityContractOk && candidates.length > 0,
  };
}

function activationBoundaryReached(state, sideKey) {
  return !(state.pieces || []).some((piece) =>
    alive(piece) && piece.sideKey === sideKey && piece.activated === true);
}

export function reverseWarmachinePassActivationSequenceV1(
  successorStateInput = {},
  rawOptions = {},
) {
  const root = normalizeRulesV1State(successorStateInput);
  const sideKey = String(rawOptions.sideKey || root.activeSideKey || "");
  const maximumDepth = Math.max(0, Number(rawOptions.maximumDepth ?? root.pieces.length));
  const maximumStates = Math.max(1, Number(rawOptions.maximumStates ?? 10_000));
  const queue = [{ state: root, depth: 0, reverseEdges: [] }];
  const seen = new Set([warmachineReverseStateSemanticHashV1(root)]);
  const boundaries = [];
  const unresolved = [];
  while (queue.length) {
    const current = queue.shift();
    if (activationBoundaryReached(current.state, sideKey)) {
      boundaries.push(current);
      continue;
    }
    if (current.depth >= maximumDepth) {
      unresolved.push({
        stateHash: warmachineReverseStateSemanticHashV1(current.state),
        depth: current.depth,
        reason: "pass_activation_reverse_depth_budget_exhausted",
      });
      continue;
    }
    const expanded = generateWarmachinePassActivationPredecessorsV1(current.state, {
      sideKey,
      queryKey: `${rawOptions.queryKey || "pass-sequence"}:depth:${current.depth}`,
    });
    if (!expanded.candidates.length) {
      unresolved.push({
        stateHash: warmachineReverseStateSemanticHashV1(current.state),
        depth: current.depth,
        reason: "non_pass_activation_inverse_required",
        rejected: expanded.rejected,
        unresolved: expanded.unresolved,
      });
      continue;
    }
    for (const candidate of expanded.candidates) {
      const stateHash = candidate.predecessorStateHash;
      if (seen.has(stateHash)) continue;
      if (seen.size >= maximumStates) {
        unresolved.push({
          stateHash,
          depth: current.depth + 1,
          reason: "pass_activation_reverse_state_budget_exhausted",
        });
        continue;
      }
      seen.add(stateHash);
      queue.push({
        state: candidate.predecessorState,
        depth: current.depth + 1,
        reverseEdges: [...current.reverseEdges, {
          candidateKey: candidate.candidateKey,
          actorPieceKey: candidate.actorPieceKey,
          predecessorStateHash: candidate.predecessorStateHash,
          successorStateHash: candidate.successorStateHash,
          transitionActionKey: candidate.transitionActionKey,
          strictReceiptHash: candidate.strictReceiptHash,
        }],
      });
    }
  }
  boundaries.sort((left, right) =>
    warmachineReverseStateSemanticHashV1(left.state)
      .localeCompare(warmachineReverseStateSemanticHashV1(right.state)));
  const core = {
    schemaVersion: WARMACHINE_PASS_ACTIVATION_SEQUENCE_V1_SCHEMA,
    sideKey,
    rootStateHash: warmachineReverseStateSemanticHashV1(root),
    visitedStateCount: seen.size,
    boundaryCount: boundaries.length,
    unresolvedCount: unresolved.length,
    boundaries: boundaries.map((row) => ({
      stateKey: String(row.state.stateKey || ""),
      stateHash: warmachineReverseStateSemanticHashV1(row.state),
      reverseDepth: row.depth,
      reverseEdges: row.reverseEdges,
    })),
    unresolved: stableGraphValue(unresolved),
    claimBoundary: "The worklist reaches an activation-start boundary only when every alive model for the selected side can be reversed through an exact strict pass transition. Any activation with side effects remains unresolved for a dedicated inverse operator.",
  };
  return {
    ...core,
    runtimeBoundaries: boundaries,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: boundaries.length > 0,
  };
}
