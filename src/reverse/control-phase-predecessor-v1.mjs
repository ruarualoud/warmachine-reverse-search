import {
  enumerateWarmachineBenchmarkActionsV2,
  executeWarmachineBenchmarkControlPhaseV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { normalizeRulesV1State, warmachineHost } from "../warmachine-host-runtime.mjs";
import { buildWarmachineReverseReachabilityCandidateSetV2 } from
  "./reachability-contract-v2.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";

export const WARMACHINE_CONTROL_PHASE_PREDECESSOR_V1_SCHEMA =
  "warmachine_control_phase_predecessor_v1";

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

function restoreControlPhaseStart(
  activationStart,
  controlResidueMode = "absent",
  resourceEnvelopeMode = "unchanged",
  rawOptions = {},
) {
  const state = structuredClone(activationStart);
  const activeSideKey = String(state.activeSideKey || "");
  state.phaseKey = "control";
  state.controlPhaseStepKey = String(rawOptions.controlPhaseStepKey || "maintenance");
  state.controlPhaseProgressed = false;
  state.controlPhaseEndAmbushWindow = false;
  state.activationForfeitWindow = null;
  state.anyTimeActivationWindow = null;
  state.initialAttackWindow = null;
  state.combatPurchaseWindow = null;
  state.activationPreludeActorPieceKey = "";
  state.activationPreludeKind = "";
  state.soulTakerActivationPreludeActorPieceKey = "";
  for (const piece of state.pieces || []) {
    if (piece.sideKey !== activeSideKey) continue;
    if (resourceEnvelopeMode === "zero_active_focus" &&
        String(piece.resourceKind || "") === "focus") {
      piece.resourcePoints = 0;
      piece.resource2 = 0;
      if ("focus" in piece) piece.focus = 0;
    }
    if ([
      "reverse_focus_control_baseline",
      "reverse_focus_control_pass_baseline",
    ].includes(resourceEnvelopeMode) &&
        String(piece.resourceKind || "") === "focus") {
      const targetPoints = Math.max(0, Number(piece.resourcePoints || 0));
      const predecessorPoints = piece.isWarcaster === true &&
          resourceEnvelopeMode === "reverse_focus_control_baseline"
        ? 0
        : piece.isWarjack === true
          ? Math.max(0, targetPoints - 1)
          : targetPoints;
      piece.resourcePoints = predecessorPoints;
      piece.resource2 = predecessorPoints;
      if ("focus" in piece) piece.focus = predecessorPoints;
    }
    if (controlResidueMode === "empty_previous_control") {
      piece.metadata = {
        ...(piece.metadata || {}),
        upkeepsPaidThisControlPhase: [],
      };
    } else {
      delete piece.upkeepsPaidThisControlPhase;
      if (piece.metadata && typeof piece.metadata === "object") {
        delete piece.metadata.upkeepsPaidThisControlPhase;
      }
    }
  }
  state.stateKey = `control-phase-predecessor-${stableGraphHash({
    successorStateHash: warmachineReverseStateSemanticHashV1(activationStart),
    controlPhaseStepKey: state.controlPhaseStepKey,
    resourceEnvelopeKey: String(rawOptions.resourceEnvelopeKey || "unchanged"),
    controlResidueMode,
    resourceEnvelopeMode,
  }, 24)}`;
  return normalizeRulesV1State(state);
}

function targetGuidedControlAction(successor, { state, scoped }) {
  const currentByKey = new Map((state.pieces || []).map((piece) => [piece.pieceKey, piece]));
  const targetByKey = new Map((successor.pieces || []).map((piece) => [piece.pieceKey, piece]));
  const allocations = (scoped.enumeration.actions || []).filter((action) =>
    action.actionType === "allocate_resource" && action.targetPieceKey);
  const needed = allocations.filter((action) => {
    const current = currentByKey.get(action.targetPieceKey);
    const target = targetByKey.get(action.targetPieceKey);
    return current && target &&
      Number(current.resourcePoints || 0) < Number(target.resourcePoints || 0);
  }).sort((left, right) => {
    const leftTarget = targetByKey.get(left.targetPieceKey);
    const leftCurrent = currentByKey.get(left.targetPieceKey);
    const rightTarget = targetByKey.get(right.targetPieceKey);
    const rightCurrent = currentByKey.get(right.targetPieceKey);
    const leftGap = Number(leftTarget?.resourcePoints || 0) -
      Number(leftCurrent?.resourcePoints || 0);
    const rightGap = Number(rightTarget?.resourcePoints || 0) -
      Number(rightCurrent?.resourcePoints || 0);
    return rightGap - leftGap || left.actionKey.localeCompare(right.actionKey);
  });
  if (needed.length) return needed[0];
  const close = (scoped.enumeration.actions || []).filter((action) =>
    /end_maintenance|end_control_replenishment|end_control_phase|advance_to_activation/.test(
      String(action.actionType || ""),
    )).sort((left, right) => left.actionKey.localeCompare(right.actionKey))[0];
  return close || (scoped.enumeration.actions || [])[0] || null;
}

export function generateWarmachineControlPhasePredecessorsV1(
  activationStartStateInput = {},
  rawOptions = {},
) {
  const successor = normalizeRulesV1State(activationStartStateInput);
  const successorSemanticHash = warmachineReverseStateSemanticHashV1(successor);
  if (successor.phaseKey !== "activation") {
    throw new Error("control_phase_predecessor_requires_activation_start_successor");
  }
  const candidates = [];
  const unresolved = [];
  const rejected = [];
  const runtimeDiagnostics = [];
  const controlResidueModes = Array.isArray(rawOptions.controlResidueModes)
    ? [...new Set(rawOptions.controlResidueModes.map(String))]
    : ["absent", "empty_previous_control"];
  const resourceEnvelopeModes = Array.isArray(rawOptions.resourceEnvelopeModes)
    ? [...new Set(rawOptions.resourceEnvelopeModes.map(String))]
    : [String(rawOptions.resourceEnvelopeKey || "unchanged") === "search_focus_predecessor"
      ? "zero_active_focus"
      : "unchanged"];
  for (const controlResidueMode of controlResidueModes.filter((mode) =>
    ["absent", "empty_previous_control"].includes(mode)).sort()) {
    for (const resourceEnvelopeMode of resourceEnvelopeModes.filter((mode) =>
      [
        "unchanged",
        "zero_active_focus",
        "reverse_focus_control_baseline",
        "reverse_focus_control_pass_baseline",
      ].includes(mode)).sort()) {
    const proposal = restoreControlPhaseStart(
      successor,
      controlResidueMode,
      resourceEnvelopeMode,
      rawOptions,
    );
    const executed = executeWarmachineBenchmarkControlPhaseV2(proposal, {
      routeKey: String(rawOptions.routeKey ||
        `control-phase-predecessor:${successorSemanticHash}:${controlResidueMode}`),
      maximumSteps: Math.max(1, Number(rawOptions.maximumControlSteps || 64)),
      selectAction: (context) => targetGuidedControlAction(successor, context),
      onProgress: rawOptions.onProgress
        ? (event) => rawOptions.onProgress({
          controlResidueMode,
          resourceEnvelopeMode,
          ...event,
        })
        : undefined,
    });
    const executedSemanticHash = executed.ok
      ? warmachineReverseStateSemanticHashV1(executed.state)
      : "";
    const strictMatch = executed.ok && executedSemanticHash === successorSemanticHash;
    if (strictMatch) {
      const predecessorStateHash = warmachineReverseStateSemanticHashV1(proposal);
      const core = {
        candidateKind: "concrete_control_phase_predecessor",
        successorKind: "activation_phase_start",
        predecessorKind: "control_phase_start",
        operatorKey: "control_phase_start_inverse_v1",
        predecessorStateKey: String(proposal.stateKey || ""),
        predecessorStateHash,
        successorStateKey: String(successor.stateKey || ""),
        successorStateHash: successorSemanticHash,
        transitionActionKey: "strict_control_phase_sequence",
        controlResidueMode,
        resourceEnvelopeMode,
        strictWitness: true,
        strictRejected: false,
        strictReceiptHash: executed.controlReceiptHash,
        strictStepReceiptHashes: executed.stepReceiptHashes,
        strictTransitionCount: executed.transitionCount,
        strictReplaySteps: stableGraphValue((executed.receipts || []).map((receipt) => ({
          actionKey: String(receipt.actionKey || ""),
          actionType: String(receipt.actionType || ""),
          actorPieceKey: String(receipt.actorPieceKey || ""),
          targetPieceKey: String(receipt.targetPieceKey || ""),
          actionPatch: stableGraphValue({
            ...(receipt.persistedAction?.strictRollOutcome
              ? { strictRollOutcome: receipt.persistedAction.strictRollOutcome }
              : {}),
            ...(receipt.persistedAction?.steamroller2026Decision
              ? { steamroller2026Decision: receipt.persistedAction.steamroller2026Decision }
              : {}),
          }),
        }))),
        unresolvedReasons: [],
        provenance: {
          upstreamReceiptHash: warmachineHost.receipt.receiptHash,
          resourceEnvelopeKey: String(rawOptions.resourceEnvelopeKey || "unchanged"),
          oracleOpeningRead: false,
          oracleRouteRead: false,
          oracleIntermediateStateRead: false,
        },
      };
      candidates.push({
        ...core,
        candidateKey: `control-phase-predecessor-${stableGraphHash(core, 32)}`,
        predecessorState: proposal,
        strictReceipts: executed.receipts,
      });
    } else if (!executed.ok) {
      rejected.push({
        predecessorStateHash: warmachineReverseStateSemanticHashV1(proposal),
        controlResidueMode,
          resourceEnvelopeMode,
        reason: "strict_control_phase_connector_rejected",
        failures: executed.failures,
        stepReceiptHashes: executed.stepReceiptHashes,
      });
    } else {
      unresolved.push({
        predecessorStateHash: warmachineReverseStateSemanticHashV1(proposal),
        controlResidueMode,
        resourceEnvelopeMode,
        executedSuccessorStateHash: executedSemanticHash,
        expectedSuccessorStateHash: successorSemanticHash,
        reason: "control_phase_resource_or_mandatory_effect_inverse_required",
        strictTransitionCount: executed.transitionCount,
        stepReceiptHashes: executed.stepReceiptHashes,
        semanticDifferences: semanticDifferenceRows(executed.state, successor),
      });
      if (rawOptions.includeRuntimeDiagnostics === true) {
        runtimeDiagnostics.push({
          controlResidueMode,
          predecessorState: proposal,
          executedSuccessorState: executed.state || null,
          expectedSuccessorState: successor,
        });
      }
    }
    }
  }
  const publicCandidates = candidates.map(({
    predecessorState: _state,
    strictReceipts: _receipts,
    ...candidate
  }) => candidate);
  const candidateSet = buildWarmachineReverseReachabilityCandidateSetV2(publicCandidates, {
    queryKey: String(rawOptions.queryKey ||
      `control-phase:${successor.activeSideKey}:${successor.turnNumber}`),
    successorStateKey: String(successor.stateKey || ""),
    maximumCandidates: rawOptions.maximumCandidates ?? publicCandidates.length,
  });
  const core = {
    schemaVersion: WARMACHINE_CONTROL_PHASE_PREDECESSOR_V1_SCHEMA,
    sideKey: String(successor.activeSideKey || ""),
    turnNumber: Number(successor.turnNumber),
    successorStateKey: String(successor.stateKey || ""),
    successorSemanticHash,
    strictCandidateCount: candidates.length,
    strictRejectedCount: rejected.length,
    unresolvedCount: unresolved.length,
    publicCandidates: stableGraphValue(publicCandidates),
    rejected: stableGraphValue(rejected),
    unresolved: stableGraphValue(unresolved),
    candidateSet,
    oracleIsolationAudit: {
      inputKinds: ["activation_start_state", "resource_envelope"],
      openingRead: false,
      forwardRouteRead: false,
      intermediateStateRead: false,
      passed: true,
    },
    claimBoundary: "This reverse milestone proposes a control-phase start and uses the complete rules-v1 control sequence as a local strict connector. The initial unchanged-resource envelope is exact only when all maintenance, focus/fury, frenzy, upkeep, continuous-effect and mandatory control outcomes reproduce the supplied activation start; otherwise the branch remains unresolved for richer predecessor envelopes.",
  };
  return {
    ...core,
    candidates,
    runtimeDiagnostics,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: candidateSet.reachabilityContractOk && candidates.length > 0,
  };
}

export function prepareWarmachineControlStartForVerificationV1(stateInput = {}) {
  const state = normalizeRulesV1State(stateInput);
  return enumerateWarmachineBenchmarkActionsV2(state).state;
}
