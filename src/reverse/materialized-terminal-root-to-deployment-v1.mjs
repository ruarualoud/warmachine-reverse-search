import {
  buildWarmachineBenchmarkMaximumStrictRollOutcomeV2,
  enumerateWarmachineBenchmarkActionsV2,
  executeScopedWarmachineBenchmarkActionV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { normalizeRulesV1State, warmachineHost } from
  "../warmachine-host-runtime.mjs";
import {
  reverseWarmachineActivationSequenceV2,
  warmachineDeploymentGeometryDebtV1,
} from "./activation-sequence-predecessor-v2.mjs";
import { generateWarmachineControlPhasePredecessorsV1 } from
  "./control-phase-predecessor-v1.mjs";
import { generateWarmachinePreviousTurnEndPredecessorsV1 } from
  "./previous-turn-end-predecessor-v1.mjs";
import {
  buildWarmachineActivationSequenceOptionsV1,
  buildWarmachineTerminalRootedResumeCheckpointV1,
  searchWarmachineTerminalRootedToDeploymentV1,
} from "./terminal-rooted-to-deployment-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";
import { auditWarmachineSteamrollerHistoricalSettlementV1 } from
  "./steamroller-historical-settlement-audit-v1.mjs";
import {
  auditWarmachineReverseStateBoundaryV1,
  summarizeWarmachineReverseStateBoundaryAuditV1,
} from "./reverse-state-invariants-v1.mjs";

export const WARMACHINE_MATERIALIZED_TERMINAL_ROOT_TO_DEPLOYMENT_V1_SCHEMA =
  "warmachine_materialized_terminal_root_to_deployment_v1";

function actionPatch(action = {}) {
  return action.metadata?.attackResolution
    ? {
      strictRollOutcome:
        buildWarmachineBenchmarkMaximumStrictRollOutcomeV2(action),
    }
    : {};
}

function publicActionIdentity(row = {}) {
  return stableGraphValue({
    actionKey: String(row.actionKey || ""),
    actionType: String(row.actionType || ""),
    actorPieceKey: String(row.actorPieceKey || ""),
    targetPieceKey: String(row.targetPieceKey || ""),
  });
}

export function replayWarmachineMaterializedTerminalActivationV1({
  predecessorState = {},
  terminalState = {},
  actionSequence = [],
  actorPieceKey = "",
  targetPieceKey = "",
  routeKey = "materialized-terminal-activation-v1",
} = {}) {
  let state = normalizeRulesV1State(predecessorState);
  const expectedTerminalStateHash = warmachineReverseStateSemanticHashV1(
    terminalState,
  );
  const receipts = [];
  const replaySteps = [];
  const failures = [];
  const stateInvariantAudits = [];
  const predecessorStateInvariantAudit =
    auditWarmachineReverseStateBoundaryV1(state, {
      boundaryKind: "materialized_terminal_replay_predecessor",
    });
  stateInvariantAudits.push(
    summarizeWarmachineReverseStateBoundaryAuditV1(
      predecessorStateInvariantAudit,
    ),
  );
  if (!predecessorStateInvariantAudit.ok) {
    failures.push(stableGraphValue({
      reason: "materialized_terminal_predecessor_state_invariant_rejected",
      stateInvariantAudit:
        summarizeWarmachineReverseStateBoundaryAuditV1(
          predecessorStateInvariantAudit,
        ),
      issues: predecessorStateInvariantAudit.issues,
    }));
  }
  for (const [stepIndex, declared] of actionSequence.entries()) {
    if (failures.length) break;
    const scoped = enumerateWarmachineBenchmarkActionsV2(state, {
      actorPieceKeys: actorPieceKey ? [actorPieceKey] : [],
      targetPieceKeys: targetPieceKey ? [targetPieceKey] : [],
      includeUntargetedActions: true,
    });
    const action = (scoped.enumeration.actions || []).find((candidate) =>
      candidate.actionKey === declared.actionKey) || null;
    if (!action) {
      failures.push(stableGraphValue({
        stepIndex,
        reason: "materialized_terminal_action_not_in_fresh_legal_space",
        declaredAction: publicActionIdentity(declared),
        legalActionKeys: (scoped.enumeration.actions || []).map((candidate) =>
          candidate.actionKey).sort(),
        rejectedAction: (scoped.enumeration.rejectedActions || []).find((candidate) =>
          candidate.actionKey === declared.actionKey) || null,
      }));
      break;
    }
    const patch = actionPatch(action);
    const executed = executeScopedWarmachineBenchmarkActionV2(
      scoped,
      action,
      { actionKey: action.actionKey },
      {
        routeKey: `${routeKey}:step:${stepIndex}`,
        actionPatch: patch,
      },
    );
    if (executed.receipt) receipts.push(executed.receipt);
    replaySteps.push(stableGraphValue({
      ...publicActionIdentity(action),
      actionPatch: stableGraphValue(patch),
    }));
    if (!executed.ok) {
      failures.push(stableGraphValue({
        stepIndex,
        reason: String(executed.reason ||
          "materialized_terminal_action_strictly_rejected"),
        action: publicActionIdentity(action),
      }));
      break;
    }
    state = normalizeRulesV1State(executed.normalizedState || executed.state);
    const successorStateInvariantAudit =
      auditWarmachineReverseStateBoundaryV1(state, {
        boundaryKind: "materialized_terminal_replay_step_successor",
      });
    stateInvariantAudits.push(
      summarizeWarmachineReverseStateBoundaryAuditV1(
        successorStateInvariantAudit,
      ),
    );
    if (!successorStateInvariantAudit.ok) {
      failures.push(stableGraphValue({
        stepIndex,
        reason: "materialized_terminal_successor_state_invariant_rejected",
        stateInvariantAudit:
          summarizeWarmachineReverseStateBoundaryAuditV1(
            successorStateInvariantAudit,
          ),
        issues: successorStateInvariantAudit.issues,
      }));
      break;
    }
  }
  const observedTerminalStateHash = warmachineReverseStateSemanticHashV1(state);
  if (!failures.length && observedTerminalStateHash !== expectedTerminalStateHash) {
    failures.push(stableGraphValue({
      reason: "materialized_terminal_activation_successor_hash_mismatch",
      expectedTerminalStateHash,
      observedTerminalStateHash,
    }));
  }
  const terminalEvents = receipts.flatMap((receipt) => receipt.events || [])
    .filter((event) => event.eventType === "terminal");
  if (!failures.length && !terminalEvents.length) {
    failures.push(stableGraphValue({
      reason: "materialized_terminal_activation_terminal_event_missing",
    }));
  }
  const predecessorStateHash = warmachineReverseStateSemanticHashV1(
    predecessorState,
  );
  const strictReplayCertified = failures.length === 0 &&
    replaySteps.length === actionSequence.length && replaySteps.length > 0;
  const core = stableGraphValue({
    schemaVersion: "warmachine_materialized_terminal_activation_replay_v1",
    predecessorStateHash,
    expectedTerminalStateHash,
    observedTerminalStateHash,
    declaredActionSequence: actionSequence.map(publicActionIdentity),
    replaySteps,
    freshReceiptHashes: receipts.map((receipt) => receipt.receiptHash),
    terminalEvents,
    priorReceiptHashesConsultedForExecution: false,
    freshEnumerationBeforeEveryTransition: true,
    stateInvariantAudits,
    stateInvariantAuditPassed: stateInvariantAudits.every((audit) => audit.ok),
    strictReplayCertified,
    failures,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
  });
  return {
    ...core,
    finalState: state,
    receipts,
    replayHash: stableGraphHash(core),
    ok: strictReplayCertified,
  };
}

function activationEdge(row = {}, layerKey = "terminal_turn_activation") {
  return stableGraphValue({
    layerKey,
    candidateKey: String(row.candidateKey || ""),
    operatorKey: String(row.operatorKey || ""),
    actorPieceKey: String(row.actorPieceKey || ""),
    targetPieceKey: String(row.targetPieceKey || ""),
    actionType: String(row.actionType || ""),
    predecessorStateHash: String(row.predecessorStateHash || ""),
    successorStateHash: String(row.successorStateHash || ""),
    transitionActionKey: String(row.transitionActionKey || ""),
    strictReceiptHash: String(row.strictReceiptHash || ""),
    strictStepReceiptHashes: row.strictStepReceiptHashes || [],
    strictReplaySteps: row.strictReplaySteps || [],
    movementProposal: row.movementProposal || null,
    mutation: row.mutation || null,
    predecessorStateInvariantAudit:
      row.predecessorStateInvariantAudit || null,
    strictWitness: true,
  });
}

function controlEdge(row = {}) {
  return stableGraphValue({
    layerKey: "terminal_turn_control",
    candidateKey: String(row.candidateKey || ""),
    operatorKey: String(row.operatorKey || ""),
    actorPieceKey: "",
    targetPieceKey: "",
    actionType: "control_phase_sequence",
    predecessorStateHash: String(row.predecessorStateHash || ""),
    successorStateHash: String(row.successorStateHash || ""),
    transitionActionKey: String(row.transitionActionKey || ""),
    strictReceiptHash: String(row.strictReceiptHash || ""),
    strictStepReceiptHashes: row.strictStepReceiptHashes || [],
    strictReplaySteps: row.strictReplaySteps || [],
    mutation: row.mutation || null,
    controlResidueMode: String(row.controlResidueMode || ""),
    resourceEnvelopeMode: String(row.resourceEnvelopeMode || ""),
    predecessorStateInvariantAudit:
      row.predecessorStateInvariantAudit || null,
    strictWitness: true,
  });
}

function terminalEdge(root = {}, replay = {}) {
  const core = stableGraphValue({
    layerKey: "victory_event",
    operatorKey: "materialized_terminal_activation_inverse_v1",
    actorPieceKey: String(root.actorPieceKey || ""),
    targetPieceKey: String(root.targetPieceKey || ""),
    actionType: "terminal_activation_sequence",
    predecessorStateHash: replay.predecessorStateHash,
    successorStateHash: replay.expectedTerminalStateHash,
    transitionActionKey: String(replay.replaySteps?.[0]?.actionKey || ""),
    strictReceiptHash: String(replay.freshReceiptHashes?.[0] || ""),
    strictStepReceiptHashes: replay.freshReceiptHashes || [],
    strictReplaySteps: replay.replaySteps || [],
    predecessorStateInvariantAudit:
      replay.stateInvariantAudits?.[0] || null,
    strictWitness: replay.strictReplayCertified === true,
    provenance: {
      upstreamReceiptHash: warmachineHost.receipt.receiptHash,
      priorReceiptHashesConsultedForExecution: false,
      materializedTerminalRootHash: stableGraphHash(root),
    },
  });
  return {
    ...core,
    candidateKey: `materialized-terminal-edge-${stableGraphHash(core, 32)}`,
  };
}

function activationGroupKeys(state = {}, sideKey = "") {
  return [...new Set((state.pieces || []).filter((piece) =>
    piece.sideKey === sideKey).map((piece) => String(
      piece.unitGroupId || piece.unitId || piece.metadata?.unitGroupId ||
      piece.metadata?.unitId || piece.pieceKey,
    )))].sort();
}

export function searchWarmachineMaterializedTerminalRootToDeploymentV1({
  materialized = {},
  terminalCell = {},
  rawOptions = {},
} = {}) {
  const root = materialized.report?.root || {};
  const runtime = materialized.runtime || {};
  const historicalSettlementAudit =
    auditWarmachineSteamrollerHistoricalSettlementV1(
      runtime.terminalState,
      {
        declaredTerminalRound: root.roundNumber,
        declaredTerminalEndingSideKey: root.endingSideKey,
      },
    );
  if (!historicalSettlementAudit.ok) {
    return stableGraphValue({
      schemaVersion: WARMACHINE_MATERIALIZED_TERMINAL_ROOT_TO_DEPLOYMENT_V1_SCHEMA,
      ok: false,
      stage: "terminal_historical_scenario_settlement_audit",
      historicalSettlementAudit,
    });
  }
  const terminalReplay = replayWarmachineMaterializedTerminalActivationV1({
    predecessorState: runtime.predecessorState,
    terminalState: runtime.terminalState,
    actionSequence: root.actionSequence || [],
    actorPieceKey: root.actorPieceKey,
    targetPieceKey: root.targetPieceKey,
    routeKey: `materialized-terminal-root:${materialized.taskKey || root.taskKey || "root"}`,
  });
  if (!terminalReplay.ok) {
    return stableGraphValue({
      schemaVersion: WARMACHINE_MATERIALIZED_TERMINAL_ROOT_TO_DEPLOYMENT_V1_SCHEMA,
      ok: false,
      stage: "terminal_activation_replay",
      terminalReplay,
    });
  }

  if (rawOptions.historicalResumeCheckpoint) {
    const search = searchWarmachineTerminalRootedToDeploymentV1(
      runtime.terminalState,
      terminalCell,
      {
        ...rawOptions,
        certifyFullRouteStrictReplay:
          rawOptions.certifyFullRouteStrictReplay !== false,
        resumeCheckpoint: rawOptions.historicalResumeCheckpoint,
      },
    );
    const core = stableGraphValue({
      schemaVersion: WARMACHINE_MATERIALIZED_TERMINAL_ROOT_TO_DEPLOYMENT_V1_SCHEMA,
      taskKey: String(materialized.taskKey || root.taskKey || ""),
      planHash: String(materialized.planHash || ""),
      terminalReplay: {
        replayHash: terminalReplay.replayHash,
        strictReplayCertified: terminalReplay.strictReplayCertified,
        actionCount: terminalReplay.replaySteps.length,
        priorReceiptHashesConsultedForExecution: false,
      },
      historicalSettlementAudit,
      terminalTurnActivation: {
        resumedFromHistoricalCheckpoint: true,
        boundaryRouteCount: 0,
        reverseDepth: 0,
        strictRejectedCount: 0,
        unresolvedCount: 0,
      },
      terminalTurnControl: {
        resumedFromHistoricalCheckpoint: true,
        strictCandidateCount: 0,
        strictRejectedCount: 0,
        unresolvedCount: 0,
        selectedCandidateKey: "",
      },
      resumeCheckpointHash: String(
        rawOptions.historicalResumeCheckpoint.checkpointHash || "",
      ),
      resumeCheckpointAccepted: search.resumeCheckpoint?.accepted === true,
      legalDeploymentRouteCount: search.legalDeploymentRouteCount,
      fullRouteStrictReplayCertifiedCount:
        search.fullRouteStrictReplayCertifiedCount,
      unresolvedCount: search.unresolvedCount,
      rejectedBranchCount: search.rejectedBranchCount,
      oracleIsolationPassed: search.oracleIsolationAudit?.passed === true,
      trainingTruth: false,
      hostReceiptHash: warmachineHost.receipt.receiptHash,
    });
    return {
      ...core,
      terminalReplay,
      currentTurnActivation: null,
      control: null,
      search,
      reportHash: stableGraphHash(core),
      ok: search.legalDeploymentRouteCount > 0 &&
        search.fullRouteStrictReplayCertifiedCount > 0,
    };
  }

  const sideKey = String(runtime.predecessorState?.activeSideKey ||
    root.endingSideKey || "");
  const sharedCurrentTurnOptions = buildWarmachineActivationSequenceOptionsV1(
    runtime.predecessorState,
    sideKey,
    "materialized_terminal_turn",
    rawOptions,
  );
  const currentTurnActivation = reverseWarmachineActivationSequenceV2(
    runtime.predecessorState,
    {
      ...sharedCurrentTurnOptions,
      sideKey,
      includePass: true,
      includeMovement: rawOptions.currentTurnIncludeMovement === true,
      movementActionTypes: rawOptions.movementActionTypes || ["run"],
      deployments: rawOptions.deployments || {},
      maximumDepth: Number(rawOptions.currentTurnMaximumActivationDepth || 64),
      maximumLabels: Number(rawOptions.currentTurnMaximumActivationLabels || 128),
      maximumUniqueStates: Number(
        rawOptions.currentTurnMaximumActivationUniqueStates || 128,
      ),
      maximumGroupsPerExpansion: Number(
        rawOptions.currentTurnMaximumActivationGroupsPerExpansion ||
        sharedCurrentTurnOptions.maximumGroupsPerExpansion || 1,
      ),
      maximumCandidatesPerExpansion: Number(
        rawOptions.currentTurnMaximumActivationCandidatesPerExpansion ||
        sharedCurrentTurnOptions.maximumCandidatesPerExpansion || 1,
      ),
      maximumCandidatesPerExpansionByGroupKey:
        rawOptions.currentTurnMaximumActivationCandidatesPerGroupKey ||
        sharedCurrentTurnOptions.maximumCandidatesPerExpansionByGroupKey,
      maximumPassActorsPerExpansion: Number(
        rawOptions.currentTurnMaximumActivationPassActorsPerExpansion ||
        sharedCurrentTurnOptions.maximumPassActorsPerExpansion || 1,
      ),
      maximumUnitMovementAnchorsPerGroup:
        rawOptions.maximumUnitMovementAnchorsPerGroup,
      maximumMovementStrictCandidateAttempts:
        rawOptions.maximumMovementStrictCandidateAttempts,
      groupOrderKeys: sharedCurrentTurnOptions.groupOrderKeys ||
        activationGroupKeys(runtime.predecessorState, sideKey),
      ...(Array.isArray(sharedCurrentTurnOptions.movementGroupKeys)
        ? { movementGroupKeys: sharedCurrentTurnOptions.movementGroupKeys }
        : {}),
      prioritizeControlResourceDependencies:
        rawOptions.prioritizeControlResourceDependencies === true,
      frontierOrder:
        rawOptions.currentTurnActivationFrontierOrder ===
          "breadth_first_by_activation_depth"
          ? "breadth_first_by_activation_depth"
          : "best_first_to_deployment",
      stopAfterBoundaryRouteCount: Number(
        rawOptions.currentTurnStopAfterActivationBoundaryRouteCount || 1,
      ),
      queryKey: `${terminalCell.cellKey}:materialized-terminal-turn`,
      onProgress: rawOptions.onCurrentTurnActivationProgress,
    },
  );
  const activationBoundaries = currentTurnActivation.runtimeBoundaries || [];
  if (!activationBoundaries.length) {
    return stableGraphValue({
      schemaVersion: WARMACHINE_MATERIALIZED_TERMINAL_ROOT_TO_DEPLOYMENT_V1_SCHEMA,
      ok: false,
      stage: "terminal_turn_activation_inverse",
      terminalReplay,
      currentTurnActivation,
    });
  }
  const boundaryControlRows = activationBoundaries.map((activationBoundary) => {
    const control = generateWarmachineControlPhasePredecessorsV1(
      activationBoundary.state,
      {
        resourceEnvelopeKey: String(rawOptions.resourceEnvelopeKey || "unchanged"),
        controlResidueModes: rawOptions.controlResidueModes,
        resourceEnvelopeModes:
          rawOptions.resourceEnvelopeModesByTurnAndSide?.[
            `${Number(activationBoundary.state?.turnNumber || 0)}:${sideKey}`
          ] || rawOptions.resourceEnvelopeModesBySide?.[sideKey] ||
          rawOptions.resourceEnvelopeModes,
        maximumControlSteps: rawOptions.maximumControlSteps,
        queryKey: `${terminalCell.cellKey}:materialized-terminal-control`,
      },
    );
    return (control.candidates || []).slice().sort((left, right) =>
      left.candidateKey.localeCompare(right.candidateKey)).map(
      (controlCandidate) => ({
        activationBoundary,
        control,
        controlCandidate,
      }),
    );
  }).flat();
  const historicalBoundaryDiagnostics = [];
  const maximumHistoricalBoundaryCandidateCount = Math.max(1, Number(
    rawOptions.currentTurnMaximumHistoricalBoundaryCandidateCount || 1,
  ));
  const retainedBoundaryControls = [];
  for (const row of boundaryControlRows) {
    if (rawOptions.currentTurnRequireHistoricalBoundaryPreflight !== true) {
      retainedBoundaryControls.push(row);
      if (retainedBoundaryControls.length >=
          maximumHistoricalBoundaryCandidateCount) break;
      continue;
    }
    const turnSideKey = `${Number(row.controlCandidate.predecessorState?.turnNumber || 0)}:${
      String(row.controlCandidate.predecessorState?.activeSideKey || "")}`;
    const nextSideActivationRestoreModes =
      rawOptions.nextSideActivationRestoreModesByTurnAndSide?.[turnSideKey] ||
      rawOptions.nextSideActivationRestoreModesBySide?.[
        String(row.controlCandidate.predecessorState?.activeSideKey || "")
      ] || rawOptions.nextSideActivationRestoreModes;
    const previousEnd = generateWarmachinePreviousTurnEndPredecessorsV1(
      row.controlCandidate.predecessorState,
      {
        nextSideActivationRestoreModes,
        maintenanceResourcePreimageModes:
          rawOptions.previousTurnEndMaintenanceResourcePreimageModes,
        explicitMaintenanceResourcePreimages:
          rawOptions.previousTurnEndExplicitMaintenanceResourcePreimages,
        recordMaintenanceResourcePreimageCoverageDebt:
          rawOptions.recordMaintenanceResourcePreimageCoverageDebt === true,
        includeRuntimeDiagnostics:
          rawOptions.includeRuntimeDiagnostics === true,
        scenarioSettlementWitnesses:
          rawOptions.previousTurnEndScenarioSettlementWitnesses || [],
        queryKey: `${terminalCell.cellKey}:materialized-terminal-history-preflight`,
      },
    );
    historicalBoundaryDiagnostics.push(stableGraphValue({
      activationBoundaryStateHash: String(row.activationBoundary.stateHash || ""),
      controlCandidateKey: row.controlCandidate.candidateKey,
      strictPreviousTurnCandidateCount: previousEnd.strictCandidateCount,
      strictRejectedCount: previousEnd.strictRejectedCount,
      unresolvedCount: previousEnd.unresolvedCount,
      rejectedReasons: (previousEnd.rejected || []).map((entry) => entry.reason),
    }));
    if (previousEnd.candidates.length > 0) {
      retainedBoundaryControls.push(row);
      if (retainedBoundaryControls.length >=
          maximumHistoricalBoundaryCandidateCount) break;
    }
  }
  const selectedBoundaryControl = retainedBoundaryControls[0] || null;
  const activationBoundary = selectedBoundaryControl?.activationBoundary || null;
  const control = selectedBoundaryControl?.control || boundaryControlRows[0]?.control || {
    candidates: [],
    strictCandidateCount: 0,
    strictRejectedCount: 0,
    unresolvedCount: 0,
  };
  const controlCandidate = selectedBoundaryControl?.controlCandidate || null;
  if (!controlCandidate) {
    return stableGraphValue({
      schemaVersion: WARMACHINE_MATERIALIZED_TERMINAL_ROOT_TO_DEPLOYMENT_V1_SCHEMA,
      ok: false,
      stage: "terminal_turn_control_inverse",
      terminalReplay,
      currentTurnActivation,
      control,
      historicalBoundaryDiagnostics,
    });
  }

  const retainedFrontiers = retainedBoundaryControls.map((row) => {
    const reverseEdges = [
      terminalEdge(root, terminalReplay),
      ...(row.activationBoundary.reverseEdges || []).map((edge) =>
        activationEdge(edge)),
      controlEdge(row.controlCandidate),
    ];
    const state = row.controlCandidate.predecessorState;
    const stateHash = row.controlCandidate.predecessorStateHash;
    const frontierCore = stableGraphValue({
      stateHash,
      reverseEdgeKeys: reverseEdges.map((edge) => edge.candidateKey),
    });
    return {
      labelKey: `materialized-terminal-label-${stableGraphHash(frontierCore, 32)}`,
      state,
      stateHash,
      reverseEdges,
      reversedPriorTurnCount: 0,
      deploymentGeometryDebt: warmachineDeploymentGeometryDebtV1(state, {
        deployments: rawOptions.deployments || {},
      }),
    };
  });
  const retainedBoundaryControlKeys = new Set(retainedBoundaryControls.map((row) =>
    `${row.activationBoundary.stateHash}::${row.controlCandidate.candidateKey}`));
  const boundaryControls = [...new Map(boundaryControlRows.map((row) => [
    String(row.activationBoundary.stateHash || ""),
    row.control,
  ])).values()];
  const currentTurnUnresolved = [
    ...(currentTurnActivation.unresolved || []).map((row) => stableGraphValue({
      stageKey: "materialized_terminal_turn_activation",
      reason: String(row.reason || "terminal_turn_activation_unresolved"),
      detail: row,
    })),
    ...boundaryControls.flatMap((boundaryControl) =>
      (boundaryControl.unresolved || []).map((row) => stableGraphValue({
        stageKey: "materialized_terminal_turn_control",
        reason: String(row.reason || "terminal_turn_control_unresolved"),
        detail: row,
      }))),
    ...boundaryControlRows.filter((row) => !retainedBoundaryControlKeys.has(
      `${row.activationBoundary.stateHash}::${row.controlCandidate.candidateKey}`,
    )).map((row) => stableGraphValue({
      stageKey: "materialized_terminal_boundary_control",
      reason: "materialized_terminal_boundary_control_witness_deferred",
      activationBoundaryStateHash:
        String(row.activationBoundary.stateHash || ""),
      controlCandidateKey: String(row.controlCandidate.candidateKey || ""),
    })),
  ];
  const currentTurnRejected = [
    ...(currentTurnActivation.rejected || []).map((row) => stableGraphValue({
      stageKey: "materialized_terminal_turn_activation",
      reason: String(row.reason || "terminal_turn_activation_rejected"),
      detail: row,
    })),
    ...boundaryControls.flatMap((boundaryControl) =>
      (boundaryControl.rejected || []).map((row) => stableGraphValue({
        stageKey: "materialized_terminal_turn_control",
        reason: String(row.reason || "terminal_turn_control_rejected"),
        detail: row,
      }))),
  ];
  const searchOptions = {
    ...rawOptions,
    certifyFullRouteStrictReplay: rawOptions.certifyFullRouteStrictReplay !== false,
  };
  const resumeCheckpoint = buildWarmachineTerminalRootedResumeCheckpointV1({
    terminalStateHash: warmachineReverseStateSemanticHashV1(runtime.terminalState),
    terminalCell,
    deployments: rawOptions.deployments || {},
    rawOptions: searchOptions,
    deferredFrontiers: retainedFrontiers,
    searchProgress: {
      labelKeys: retainedFrontiers.map((frontier) => frontier.labelKey),
      uniqueStateHashes: [...new Set(retainedFrontiers.map((frontier) =>
        frontier.stateHash))],
      unresolved: currentTurnUnresolved,
      rejected: currentTurnRejected,
      runtimeDiagnostics: historicalBoundaryDiagnostics,
    },
  });
  const search = searchWarmachineTerminalRootedToDeploymentV1(
    runtime.terminalState,
    terminalCell,
    { ...searchOptions, resumeCheckpoint },
  );
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_MATERIALIZED_TERMINAL_ROOT_TO_DEPLOYMENT_V1_SCHEMA,
    taskKey: String(materialized.taskKey || root.taskKey || ""),
    planHash: String(materialized.planHash || ""),
    terminalReplay: {
      replayHash: terminalReplay.replayHash,
      strictReplayCertified: terminalReplay.strictReplayCertified,
      actionCount: terminalReplay.replaySteps.length,
      priorReceiptHashesConsultedForExecution: false,
    },
    historicalSettlementAudit,
    terminalTurnActivation: {
      boundaryRouteCount: currentTurnActivation.boundaryRouteCount,
      reverseDepth: activationBoundary.depth,
      strictRejectedCount: currentTurnActivation.strictRejectedCount,
      unresolvedCount: currentTurnActivation.unresolvedCount,
    },
    terminalTurnControl: {
      strictCandidateCount: control.strictCandidateCount,
      strictRejectedCount: control.strictRejectedCount,
      unresolvedCount: control.unresolvedCount,
      selectedCandidateKey: controlCandidate.candidateKey,
      historicalBoundaryPreflightRequired:
        rawOptions.currentTurnRequireHistoricalBoundaryPreflight === true,
      historicalBoundaryCandidateCount:
        historicalBoundaryDiagnostics.length,
      retainedHistoricalBoundaryCandidateCount:
        retainedBoundaryControls.length,
    },
    resumeCheckpointHash: resumeCheckpoint.checkpointHash,
    resumeCheckpointAccepted: search.resumeCheckpoint?.accepted === true,
    legalDeploymentRouteCount: search.legalDeploymentRouteCount,
    fullRouteStrictReplayCertifiedCount:
      search.fullRouteStrictReplayCertifiedCount,
    unresolvedCount: search.unresolvedCount,
    rejectedBranchCount: search.rejectedBranchCount,
    oracleIsolationPassed: search.oracleIsolationAudit?.passed === true,
    trainingTruth: false,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
  });
  return {
    ...core,
    terminalReplay,
    currentTurnActivation,
    control,
    search,
    reportHash: stableGraphHash(core),
    ok: search.legalDeploymentRouteCount > 0 &&
      search.fullRouteStrictReplayCertifiedCount > 0,
  };
}
