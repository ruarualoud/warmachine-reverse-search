import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineHost } from "../warmachine-host-runtime.mjs";
import {
  reverseWarmachineActivationSequenceV2,
  warmachineDeploymentGeometryDebtV1,
} from
  "./activation-sequence-predecessor-v2.mjs";
import { generateWarmachineControlPhasePredecessorsV1 } from
  "./control-phase-predecessor-v1.mjs";
import { auditWarmachineLegalDeploymentReachabilityV1 } from
  "./deployment-reachability-v1.mjs";
import { generateWarmachinePreviousTurnEndPredecessorsV1 } from
  "./previous-turn-end-predecessor-v1.mjs";
import { buildWarmachineReverseReachabilityCandidateSetV2 } from
  "./reachability-contract-v2.mjs";
import { replayWarmachineTerminalReverseRouteV1 } from
  "./replay-terminal-reverse-route-v1.mjs";
import {
  generateWarmachineTerminalEventPredecessorsV1,
  warmachineReverseStateSemanticHashV1,
} from "./terminal-event-predecessor-v1.mjs";

export const WARMACHINE_TERMINAL_ROOTED_TO_DEPLOYMENT_V1_SCHEMA =
  "warmachine_terminal_rooted_to_deployment_v1";
export const WARMACHINE_TERMINAL_ROOTED_RESUME_CHECKPOINT_V1_SCHEMA =
  "warmachine_terminal_rooted_resume_checkpoint_v1";

function resumeContractHash(
  terminalStateHash = "",
  terminalCell = {},
  deployments = {},
  rawOptions = {},
) {
  return stableGraphHash(stableGraphValue({
    schemaVersion: WARMACHINE_TERMINAL_ROOTED_RESUME_CHECKPOINT_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    terminalStateHash,
    terminalCellKey: String(terminalCell.cellKey || ""),
    deployments,
    firstPlayerSideKey: String(rawOptions.firstPlayerSideKey || "player1"),
    terminalEventOptions: rawOptions.terminalEventOptions || {},
    activationGroupOrderKeys: rawOptions.activationGroupOrderKeys || [],
    activationGroupOrderKeysBySide: rawOptions.activationGroupOrderKeysBySide || {},
    activationGroupOrderKeysByTurnAndSide:
      rawOptions.activationGroupOrderKeysByTurnAndSide || {},
    includePass: rawOptions.includePass !== false,
    includeMovement: rawOptions.includeMovement !== false,
    movementActionTypes: rawOptions.movementActionTypes || ["advance", "run"],
    maximumActivationGroupsPerExpansion: Number(
      rawOptions.maximumActivationGroupsPerExpansion || 0,
    ),
    maximumActivationCandidatesPerExpansion: Number(
      rawOptions.maximumActivationCandidatesPerExpansion || 0,
    ),
    maximumActivationPassActorsPerExpansion: Number(
      rawOptions.maximumActivationPassActorsPerExpansion || 0,
    ),
    resourceEnvelopeModes: rawOptions.resourceEnvelopeModes || [],
    controlResidueModes: rawOptions.controlResidueModes || [],
    controlResidueModesBySide: rawOptions.controlResidueModesBySide || {},
    controlResidueModesByTurnAndSide:
      rawOptions.controlResidueModesByTurnAndSide || {},
    nextSideActivationRestoreModes: rawOptions.nextSideActivationRestoreModes || [],
    nextSideActivationRestoreModesBySide:
      rawOptions.nextSideActivationRestoreModesBySide || {},
    nextSideActivationRestoreModesByTurnAndSide:
      rawOptions.nextSideActivationRestoreModesByTurnAndSide || {},
    previousTurnEndMaintenanceResourcePreimageModes:
      rawOptions.previousTurnEndMaintenanceResourcePreimageModes || [],
    previousTurnEndExplicitMaintenanceResourcePreimages:
      rawOptions.previousTurnEndExplicitMaintenanceResourcePreimages || [],
  }));
}

function checkpointFrontier(row = {}) {
  return {
    labelKey: String(row.labelKey || ""),
    state: row.state,
    stateHash: String(row.stateHash || ""),
    reverseEdges: row.reverseEdges || [],
    reversedPriorTurnCount: Number(row.reversedPriorTurnCount || 0),
    deploymentGeometryDebt: Number(row.deploymentGeometryDebt || 0),
  };
}

export function buildWarmachineTerminalRootedResumeCheckpointV1({
  terminalStateHash = "",
  terminalCell = {},
  deployments = {},
  rawOptions = {},
  deferredFrontiers = [],
} = {}) {
  const frontiers = deferredFrontiers.map(checkpointFrontier);
  const core = {
    schemaVersion: WARMACHINE_TERMINAL_ROOTED_RESUME_CHECKPOINT_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    terminalStateHash: String(terminalStateHash || ""),
    terminalCellKey: String(terminalCell.cellKey || ""),
    resumeContractHash: resumeContractHash(
      terminalStateHash,
      terminalCell,
      deployments,
      rawOptions,
    ),
    frontierCount: frontiers.length,
    frontiers,
  };
  return {
    ...core,
    checkpointHash: stableGraphHash(stableGraphValue(core)),
  };
}

export function auditWarmachineTerminalRootedResumeCheckpointV1(
  checkpoint = {},
  {
    terminalStateHash = "",
    terminalCell = {},
    deployments = {},
    rawOptions = {},
  } = {},
) {
  const expectedResumeContractHash = resumeContractHash(
    terminalStateHash,
    terminalCell,
    deployments,
    rawOptions,
  );
  const issues = [];
  if (checkpoint.schemaVersion !== WARMACHINE_TERMINAL_ROOTED_RESUME_CHECKPOINT_V1_SCHEMA) {
    issues.push("resume_checkpoint_schema_mismatch");
  }
  if (checkpoint.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
    issues.push("ruleset_dependency_drift");
  }
  if (checkpoint.terminalStateHash !== terminalStateHash) {
    issues.push("resume_checkpoint_terminal_state_mismatch");
  }
  if (checkpoint.terminalCellKey !== String(terminalCell.cellKey || "")) {
    issues.push("resume_checkpoint_terminal_cell_mismatch");
  }
  if (checkpoint.resumeContractHash !== expectedResumeContractHash) {
    issues.push("resume_checkpoint_search_contract_mismatch");
  }
  const frontiers = Array.isArray(checkpoint.frontiers) ? checkpoint.frontiers : [];
  if (!frontiers.length) issues.push("resume_checkpoint_frontier_missing");
  for (const row of frontiers) {
    if (!row.state || warmachineReverseStateSemanticHashV1(row.state) !== row.stateHash) {
      issues.push("resume_checkpoint_state_hash_mismatch");
      break;
    }
  }
  return stableGraphValue({
    ok: issues.length === 0,
    issues: [...new Set(issues)],
    expectedResumeContractHash,
    receivedResumeContractHash: String(checkpoint.resumeContractHash || ""),
    checkpointHash: String(checkpoint.checkpointHash || ""),
    frontierCount: frontiers.length,
  });
}

function candidateEdge(candidate = {}, layerKey = "") {
  return stableGraphValue({
    layerKey,
    candidateKey: String(candidate.candidateKey || ""),
    operatorKey: String(candidate.operatorKey || ""),
    actorPieceKey: String(candidate.actorPieceKey || ""),
    targetPieceKey: String(candidate.targetPieceKey || ""),
    actionType: String(candidate.actionType || ""),
    predecessorStateKey: String(candidate.predecessorStateKey || ""),
    predecessorStateHash: String(candidate.predecessorStateHash || ""),
    successorStateKey: String(candidate.successorStateKey || ""),
    successorStateHash: String(candidate.successorStateHash || ""),
    transitionActionKey: String(candidate.transitionActionKey || ""),
    strictReceiptHash: String(candidate.strictReceiptHash || ""),
    strictStepReceiptHashes: candidate.strictStepReceiptHashes || [],
    strictReplaySteps: candidate.strictReplaySteps || [],
    matchingOutcomes: candidate.matchingOutcomes || [],
    movementProposal: candidate.movementProposal || null,
    mutation: candidate.mutation || null,
    controlResidueMode: String(candidate.controlResidueMode || ""),
    resourceEnvelopeMode: String(candidate.resourceEnvelopeMode || ""),
    matchedProbability: candidate.matchedProbability || null,
    matchedProbabilityInterval: candidate.matchedProbabilityInterval || null,
    matchedProbabilityExact: candidate.matchedProbabilityExact === true,
    adversarialContextKey: String(candidate.adversarialContextKey || ""),
    provenance: candidate.provenance || null,
    strictWitness: candidate.strictWitness === true,
  });
}

function activationEdges(boundary = {}, layerKey = "") {
  return (boundary.reverseEdges || []).map((edge) => stableGraphValue({
    ...edge,
    layerKey,
    predecessorStateKey: String(edge.predecessorStateKey || ""),
    successorStateKey: String(edge.successorStateKey || ""),
    strictWitness: true,
  }));
}

function routeLabelKey(stateHash, reverseEdges = []) {
  return `terminal-deployment-label-${stableGraphHash({
    stateHash,
    reverseEdgeKeys: reverseEdges.map((edge) => edge.candidateKey || stableGraphHash(edge)),
  }, 32)}`;
}

function multiplyProbabilityRecords(records = []) {
  let numerator = 1n;
  let denominator = 1n;
  for (const record of records) {
    numerator *= BigInt(String(record?.numerator ?? 1));
    denominator *= BigInt(String(record?.denominator ?? 1));
  }
  return {
    numerator: String(numerator),
    denominator: String(denominator),
    decimal: Number(numerator) / Number(denominator),
  };
}

export function buildWarmachineReverseRouteHistoryEvidenceV1(
  reverseEdges = [],
  state = {},
) {
  const probabilityRecords = reverseEdges.map((edge) => edge.matchedProbability)
    .filter(Boolean);
  const unresolvedIntervals = reverseEdges.map((edge) => edge.matchedProbabilityInterval)
    .filter(Boolean);
  return stableGraphValue({
    cumulativeProbability: unresolvedIntervals.length
      ? null
      : multiplyProbabilityRecords(probabilityRecords),
    cumulativeProbabilityExact: unresolvedIntervals.length === 0,
    unresolvedProbabilityIntervals: unresolvedIntervals,
    resourceEnvelopeModes: reverseEdges.map((edge) => edge.resourceEnvelopeMode)
      .filter(Boolean),
    controlResidueModes: reverseEdges.map((edge) => edge.controlResidueMode)
      .filter(Boolean),
    scoreHistory: [
      ...reverseEdges.map((edge) => edge.mutation?.scoreBeforeTurnEnd)
        .filter(Boolean),
      state.scenario?.score || {},
    ],
    adversarialContextKeys: reverseEdges.map((edge) => edge.adversarialContextKey)
      .filter(Boolean),
    provenanceLabels: reverseEdges.map((edge) => ({
      candidateKey: edge.candidateKey,
      operatorKey: edge.operatorKey,
      terminalCellKey: String(edge.provenance?.terminalCellKey || ""),
      upstreamReceiptHash: String(edge.provenance?.upstreamReceiptHash || ""),
    })),
  });
}

function terminalSpatialEvidence(terminalCell = {}) {
  const geometry = terminalCell.geometryRelationCell || {};
  return stableGraphValue({
    terminalCellKey: String(terminalCell.cellKey || ""),
    goalType: String(terminalCell.goalType || ""),
    roundNumber: Number(terminalCell.roundNumber || 0),
    endingSideKey: String(terminalCell.endingSideKey || ""),
    actorPieceKey: String(terminalCell.actorPieceKey || ""),
    targetLeaderPieceKey: String(terminalCell.targetLeaderPieceKey || ""),
    controllerPieceKey: String(terminalCell.controllerPieceKey || ""),
    exactCoordinates: geometry.exactCoordinates || null,
    actionRangeBand: geometry.actionRangeBand || null,
    controlRangeBand: geometry.controlRangeBand || null,
    lineOfSightRelation: String(geometry.lineOfSightRelation || ""),
    pathRelation: String(geometry.pathRelation || ""),
    baseRelation: String(geometry.baseRelation || ""),
    scenarioRelations: geometry.scenarioRelations || [],
    relationChecks: geometry.relationChecks || [],
  });
}

function deploymentEndpointEvidence(state = {}, deploymentAudit = {}) {
  return stableGraphValue({
    stateKey: String(state.stateKey || ""),
    turnNumber: Number(state.turnNumber || 0),
    activeSideKey: String(state.activeSideKey || ""),
    phaseKey: String(state.phaseKey || ""),
    piecePositions: Object.fromEntries((state.pieces || []).map((piece) => [
      String(piece.pieceKey || ""),
      piece.position || null,
    ]).sort(([left], [right]) => left.localeCompare(right))),
    deploymentAudit: deploymentAudit || null,
  });
}

function unresolvedRow(stageKey, stateHash, reason, extra = {}) {
  return stableGraphValue({
    stageKey,
    stateHash: String(stateHash || ""),
    reason,
    ...extra,
  });
}

function publicFrontierEvidence(row = {}, incrementalReverseEdges = []) {
  const reverseEdges = row.reverseEdges || [];
  const strictReceiptHashes = reverseEdges.flatMap((edge) => [
    edge.strictReceiptHash,
    ...(edge.strictStepReceiptHashes || []),
  ]).filter(Boolean);
  return stableGraphValue({
    labelKey: row.labelKey,
    stateHash: row.stateHash,
    turnNumber: Number(row.state?.turnNumber || 0),
    activeSideKey: String(row.state?.activeSideKey || ""),
    phaseKey: String(row.state?.phaseKey || ""),
    reversedPriorTurnCount: Number(row.reversedPriorTurnCount || 0),
    score: row.state?.scenario?.score || {},
    reverseLayerKeys: reverseEdges.map((edge) => edge.layerKey),
    reverseOperatorKeys: reverseEdges.map((edge) => edge.operatorKey),
    strictReplayStepActionTypes: reverseEdges.flatMap((edge) =>
      (edge.strictReplaySteps || []).map((step) => step.actionType)),
    strictReceiptHashes,
    historyEvidence: buildWarmachineReverseRouteHistoryEvidenceV1(
      reverseEdges,
      row.state,
    ),
    incrementalReverseLayerKeys: incrementalReverseEdges.map((edge) => edge.layerKey),
    incrementalReverseOperatorKeys: incrementalReverseEdges.map((edge) => edge.operatorKey),
    incrementalStrictReplayStepActionTypes: incrementalReverseEdges.flatMap((edge) =>
      (edge.strictReplaySteps || []).map((step) => step.actionType)),
    strictWitness: reverseEdges.every((edge) => edge.strictWitness === true),
  });
}

function activationControlExtensions(activationEndState, sideKey, layerPrefix, rawOptions = {}) {
  const turnSideKey = `${Number(activationEndState?.turnNumber || 0)}:${sideKey}`;
  const activationGroupOrderKeys =
    rawOptions.activationGroupOrderKeysByTurnAndSide?.[turnSideKey] ||
    rawOptions.activationGroupOrderKeysBySide?.[sideKey] ||
    rawOptions.activationGroupOrderKeys;
  const controlResidueModes =
    rawOptions.controlResidueModesByTurnAndSide?.[turnSideKey] ||
    rawOptions.controlResidueModesBySide?.[sideKey] ||
    rawOptions.controlResidueModes;
  const activation = reverseWarmachineActivationSequenceV2(activationEndState, {
    sideKey,
    deployments: rawOptions.deployments,
    movementActionTypes: rawOptions.movementActionTypes,
    includePass: rawOptions.includePass,
    includeMovement: rawOptions.includeMovement,
    maximumDepth: rawOptions.maximumActivationDepth,
    maximumLabels: rawOptions.maximumActivationLabels,
    maximumUniqueStates: rawOptions.maximumActivationUniqueStates,
    maximumGroupsPerExpansion: rawOptions.maximumActivationGroupsPerExpansion,
    maximumCandidatesPerExpansion: rawOptions.maximumActivationCandidatesPerExpansion,
    maximumPassActorsPerExpansion: rawOptions.maximumActivationPassActorsPerExpansion,
    passResourcePreimagePointsByActor: rawOptions.passResourcePreimagePointsByActor,
    groupOrderKeys: activationGroupOrderKeys,
    frontierOrder: rawOptions.activationFrontierOrder,
    stopAfterBoundaryRouteCount: rawOptions.stopAfterActivationBoundaryRouteCount,
    deploymentSlotGapIn: rawOptions.deploymentSlotGapIn,
    maximumDeploymentSlotOrigins: rawOptions.maximumDeploymentSlotOrigins,
    maximumDeploymentSlotRings: rawOptions.maximumDeploymentSlotRings,
    rejectedAuditLimit: rawOptions.rejectedAuditLimit,
    onProgress: rawOptions.onActivationProgress,
    queryKey: `${rawOptions.queryKey || "terminal-to-deployment"}:${layerPrefix}:activation`,
  });
  const extensions = [];
  const runtimeDiagnostics = [];
  const unresolved = (activation.unresolved || []).map((row) => unresolvedRow(
    `${layerPrefix}_activation`,
    row.stateHash || activation.rootStateHash,
    row.reason || "activation_inverse_unresolved",
    { detail: row },
  ));
  const rejected = (activation.rejected || []).map((row) => stableGraphValue({
    stageKey: `${layerPrefix}_activation`,
    stateHash: row.stateHash || activation.rootStateHash,
    ...row,
  }));
  for (const boundary of activation.runtimeBoundaries || []) {
    const boundaryHash = warmachineReverseStateSemanticHashV1(boundary.state);
    const control = generateWarmachineControlPhasePredecessorsV1(boundary.state, {
      resourceEnvelopeKey: String(rawOptions.resourceEnvelopeKey || "unchanged"),
      maximumControlSteps: rawOptions.maximumControlSteps,
      controlResidueModes,
      resourceEnvelopeModes: rawOptions.resourceEnvelopeModes,
      includeRuntimeDiagnostics: rawOptions.includeRuntimeDiagnostics === true,
      scenarioSettlementWitnesses:
        rawOptions.previousTurnEndScenarioSettlementWitnesses || [],
      onProgress: rawOptions.onControlProgress,
      queryKey: `${rawOptions.queryKey || "terminal-to-deployment"}:${layerPrefix}:control:${boundaryHash}`,
    });
    runtimeDiagnostics.push(...(control.runtimeDiagnostics || []).map((diagnostic) => ({
      stageKey: `${layerPrefix}_control`,
      ...diagnostic,
    })));
    if (!control.candidates.length) {
      unresolved.push(unresolvedRow(
        `${layerPrefix}_control`,
        boundaryHash,
        control.unresolvedCount > 0
          ? "control_inverse_unresolved"
          : control.strictRejectedCount > 0
            ? "control_inverse_strict_rejected"
            : "control_inverse_has_no_candidate",
        { rejected: control.rejected || [], unresolved: control.unresolved || [] },
      ));
      continue;
    }
    for (const candidate of control.candidates) {
      extensions.push({
        state: candidate.predecessorState,
        stateHash: candidate.predecessorStateHash,
        reverseEdges: [
          ...activationEdges(boundary, `${layerPrefix}_activation`),
          candidateEdge(candidate, `${layerPrefix}_control`),
        ],
        activationReverseDepth: boundary.depth,
      });
    }
  }
  return {
    extensions,
    unresolved,
    rejected,
    runtimeDiagnostics,
    activationReportHash: activation.reportHash,
  };
}

function expansionAtControlStart(controlStartState, rawOptions = {}) {
  const stateHash = warmachineReverseStateSemanticHashV1(controlStartState);
  const turnSideKey = `${Number(controlStartState?.turnNumber || 0)}:${String(
    controlStartState?.activeSideKey || "",
  )}`;
  const nextSideActivationRestoreModes =
    rawOptions.nextSideActivationRestoreModesByTurnAndSide?.[turnSideKey] ||
    rawOptions.nextSideActivationRestoreModesBySide?.[
      String(controlStartState?.activeSideKey || "")
    ] || rawOptions.nextSideActivationRestoreModes;
  let previousEnd;
  try {
    previousEnd = generateWarmachinePreviousTurnEndPredecessorsV1(controlStartState, {
      nextSideActivationRestoreModes,
      maintenanceResourcePreimageModes:
        rawOptions.previousTurnEndMaintenanceResourcePreimageModes,
      explicitMaintenanceResourcePreimages:
        rawOptions.previousTurnEndExplicitMaintenanceResourcePreimages,
      recordMaintenanceResourcePreimageCoverageDebt:
        rawOptions.recordMaintenanceResourcePreimageCoverageDebt === true,
      includeRuntimeDiagnostics: rawOptions.includeRuntimeDiagnostics === true,
      scenarioSettlementWitnesses:
        rawOptions.previousTurnEndScenarioSettlementWitnesses || [],
      queryKey: `${rawOptions.queryKey || "terminal-to-deployment"}:previous-end:${stateHash}`,
    });
  } catch (error) {
    return {
      extensions: [],
      unresolved: [unresolvedRow(
        "previous_turn_end",
        stateHash,
        String(error?.message || error || "previous_turn_inverse_failed"),
      )],
      rejected: [],
    };
  }
  const extensions = [];
  const unresolved = [];
  const rejected = (previousEnd.rejected || []).map((row) => stableGraphValue({
    stageKey: "previous_turn_end",
    stateHash,
    ...row,
  }));
  const runtimeDiagnostics = [...(previousEnd.runtimeDiagnostics || []).map((diagnostic) => ({
    stageKey: "previous_turn_end",
    ...diagnostic,
  }))];
  if (!previousEnd.candidates.length) {
    unresolved.push(unresolvedRow(
      "previous_turn_end",
      stateHash,
      previousEnd.unresolvedCount > 0
        ? "previous_turn_end_inverse_unresolved"
        : previousEnd.strictRejectedCount > 0
          ? "previous_turn_end_strict_rejected"
          : "previous_turn_end_has_no_candidate",
      { rejected: previousEnd.rejected || [], unresolved: previousEnd.unresolved || [] },
    ));
  }
  for (const previousEndCandidate of previousEnd.candidates) {
    const layerPrefix = `turn_${previousEndCandidate.endingTurnNumber}_${previousEndCandidate.endingSideKey}`;
    const turn = activationControlExtensions(
      previousEndCandidate.predecessorState,
      previousEndCandidate.endingSideKey,
      layerPrefix,
      rawOptions,
    );
    unresolved.push(...turn.unresolved);
    rejected.push(...turn.rejected);
    runtimeDiagnostics.push(...(turn.runtimeDiagnostics || []));
    for (const extension of turn.extensions) {
      extensions.push({
        ...extension,
        endingSideKey: previousEndCandidate.endingSideKey,
        endingTurnNumber: previousEndCandidate.endingTurnNumber,
        reverseEdges: [
          candidateEdge(previousEndCandidate, `${layerPrefix}_end`),
          ...extension.reverseEdges,
        ],
      });
    }
  }
  return {
    extensions,
    unresolved,
    rejected,
    runtimeDiagnostics,
  };
}

export function searchWarmachineTerminalRootedToDeploymentV1(
  terminalStateInput = {},
  terminalCell = {},
  rawOptions = {},
) {
  const deployments = rawOptions.deployments || {};
  const firstPlayerSideKey = String(rawOptions.firstPlayerSideKey || "player1");
  const maximumReverseTurns = Math.max(0, Number(rawOptions.maximumReverseTurns ?? 8));
  const maximumRouteLabels = Math.max(1, Number(rawOptions.maximumRouteLabels ?? 10_000));
  const maximumUniqueStates = Math.max(1, Number(rawOptions.maximumUniqueStates ?? 10_000));
  const maximumCompletedRoutes = Math.max(1, Number(rawOptions.maximumCompletedRoutes ?? 1_000));
  const stopAfterCompletedRouteCount = Math.max(
    0,
    Number(rawOptions.stopAfterCompletedRouteCount ?? 0),
  );
  const frontierOrder = [
    "depth_first_to_deployment",
    "best_first_to_deployment",
  ].includes(rawOptions.frontierOrder)
    ? rawOptions.frontierOrder
    : "breadth_first_by_reverse_turn";
  const terminal = generateWarmachineTerminalEventPredecessorsV1(
    terminalStateInput,
    terminalCell,
    rawOptions.terminalEventOptions || {},
  );
  const queue = [];
  const labels = new Set();
  const uniqueStates = new Set();
  const unresolved = [];
  const rejected = [];
  const completed = [];
  const runtimeDiagnostics = [];
  const expansionCache = new Map();
  const initialFrontier = [];
  const reachedPriorTurnFrontiers = [];
  const runtimeReachedPriorTurnFrontiers = [];
  const runtimeDeferredFrontiers = [];
  const requestedResumeCheckpoint = rawOptions.resumeCheckpoint || null;
  const expectedResumeContractHash = resumeContractHash(
    terminal.successorSemanticHash,
    terminalCell,
    deployments,
    rawOptions,
  );
  let resumeCheckpointAccepted = false;
  let expandedLabelCount = 0;
  let processedLabelCount = 0;
  let queueIndex = 0;
  let witnessStopTriggered = false;
  let witnessStopDeferredLabelCount = 0;
  let emittedDeploymentFailureCount = 0;
  const progressEveryLabels = Math.max(1, Number(rawOptions.progressEveryLabels ?? 50));
  const progressDeploymentFailureLimit = Math.max(
    0,
    Number(rawOptions.progressDeploymentFailureLimit ?? 0),
  );
  const queuedLabelCount = () => [
    "depth_first_to_deployment",
    "best_first_to_deployment",
  ].includes(frontierOrder)
    ? queue.length
    : Math.max(0, queue.length - queueIndex);
  const takeNextLabel = () => {
    if (frontierOrder === "depth_first_to_deployment") return queue.pop() || null;
    if (frontierOrder === "best_first_to_deployment") {
      let bestIndex = 0;
      for (let index = 1; index < queue.length; index += 1) {
        const candidate = queue[index];
        const currentBest = queue[bestIndex];
        const candidateBeforeBest =
          candidate.reversedPriorTurnCount > currentBest.reversedPriorTurnCount ||
          (candidate.reversedPriorTurnCount === currentBest.reversedPriorTurnCount &&
            (candidate.deploymentGeometryDebt < currentBest.deploymentGeometryDebt ||
              (candidate.deploymentGeometryDebt === currentBest.deploymentGeometryDebt &&
                candidate.labelKey < currentBest.labelKey)));
        if (candidateBeforeBest) bestIndex = index;
      }
      return queue.splice(bestIndex, 1)[0] || null;
    }
    const row = queue[queueIndex] || null;
    queueIndex += row ? 1 : 0;
    return row;
  };
  const emitProgress = (stage, current = null) => rawOptions.onProgress?.({
    schemaVersion: "warmachine_terminal_rooted_to_deployment_progress_v1",
    stage,
    terminalCellKey: String(terminalCell.cellKey || ""),
    terminalGoalType: String(terminalCell.goalType || ""),
    processedLabelCount,
    expandedLabelCount,
    queuedLabelCount: queuedLabelCount(),
    routeLabelCount: labels.size,
    uniqueStateCount: uniqueStates.size,
    completedRouteCount: completed.length,
    rejectedBranchCount: rejected.length,
    unresolvedCount: unresolved.length,
    current: current ? {
      labelKey: current.labelKey,
      stateHash: current.stateHash,
      turnNumber: Number(current.state?.turnNumber || 0),
      activeSideKey: String(current.state?.activeSideKey || ""),
      reversedPriorTurnCount: current.reversedPriorTurnCount,
    } : null,
  });

  if (!terminal.candidates.length) {
    unresolved.push(unresolvedRow(
      "terminal_event",
      terminal.successorSemanticHash,
      terminal.unresolvedCount > 0
        ? "terminal_event_inverse_unresolved"
        : terminal.strictRejectedCount > 0
          ? "terminal_event_strict_rejected"
          : "terminal_event_has_no_candidate",
      { rejected: terminal.rejected || [], unresolved: terminal.unresolved || [] },
    ));
  }
  unresolved.push(...(terminal.unresolved || []).map((row) => unresolvedRow(
    "terminal_event",
    row.predecessorStateHash || terminal.successorSemanticHash,
    row.reason || "terminal_event_inverse_unresolved",
    { detail: row },
  )));
  rejected.push(...(terminal.rejected || []).map((row) => stableGraphValue({
    stageKey: "terminal_event",
    stateHash: row.predecessorStateHash || terminal.successorSemanticHash,
    ...row,
  })));

  if (requestedResumeCheckpoint) {
    const checkpointAudit = auditWarmachineTerminalRootedResumeCheckpointV1(
      requestedResumeCheckpoint,
      {
        terminalStateHash: terminal.successorSemanticHash,
        terminalCell,
        deployments,
        rawOptions,
      },
    );
    if (!checkpointAudit.ok) {
      unresolved.push(...checkpointAudit.issues.map((reason) => unresolvedRow(
        "resume_checkpoint",
        terminal.successorSemanticHash,
        reason,
        {
          checkpointHash: checkpointAudit.checkpointHash,
          expectedResumeContractHash: checkpointAudit.expectedResumeContractHash,
          receivedResumeContractHash: checkpointAudit.receivedResumeContractHash,
        },
      )));
    } else {
      resumeCheckpointAccepted = true;
      for (const row of requestedResumeCheckpoint.frontiers) {
        const restored = checkpointFrontier(row);
        labels.add(restored.labelKey);
        uniqueStates.add(restored.stateHash);
        queue.push(restored);
        initialFrontier.push(publicFrontierEvidence(restored, []));
      }
    }
  }

  if (!requestedResumeCheckpoint) for (const terminalCandidate of terminal.candidates) {
    unresolved.push(...(terminalCandidate.unresolvedReasons || []).map((reason) =>
      unresolvedRow(
        "terminal_event_probability",
        terminalCandidate.predecessorStateHash,
        reason,
        {
          candidateKey: terminalCandidate.candidateKey,
          matchedProbabilityInterval: terminalCandidate.matchedProbabilityInterval || null,
        },
      )));
    const current = activationControlExtensions(
      terminalCandidate.predecessorState,
      String(terminalCell.endingSideKey || terminalCandidate.predecessorState.activeSideKey || ""),
      "terminal_turn",
      { ...rawOptions, deployments, queryKey: terminalCell.cellKey },
    );
    unresolved.push(...current.unresolved);
    rejected.push(...current.rejected);
    runtimeDiagnostics.push(...(current.runtimeDiagnostics || []));
    for (const extension of current.extensions) {
      const reverseEdges = [
        candidateEdge(terminalCandidate, "victory_event"),
        ...extension.reverseEdges,
      ];
      const labelKey = routeLabelKey(extension.stateHash, reverseEdges);
      if (labels.size >= maximumRouteLabels) {
        runtimeDeferredFrontiers.push(checkpointFrontier({
          labelKey,
          state: extension.state,
          stateHash: extension.stateHash,
          reverseEdges,
          reversedPriorTurnCount: 0,
          deploymentGeometryDebt: warmachineDeploymentGeometryDebtV1(extension.state, {
            deployments,
          }),
        }));
        unresolved.push(unresolvedRow(
          "terminal_turn",
          extension.stateHash,
          "terminal_to_deployment_route_label_budget_exhausted",
        ));
        continue;
      }
      labels.add(labelKey);
      uniqueStates.add(extension.stateHash);
      const initialLabel = {
        labelKey,
        state: extension.state,
        stateHash: extension.stateHash,
        reverseEdges,
        reversedPriorTurnCount: 0,
        deploymentGeometryDebt: warmachineDeploymentGeometryDebtV1(extension.state, {
          deployments,
        }),
      };
      queue.push(initialLabel);
      initialFrontier.push(publicFrontierEvidence(initialLabel, reverseEdges));
    }
  }

  emitProgress("initial_frontier_ready");
  while (queuedLabelCount() > 0) {
    const current = takeNextLabel();
    if (!current) break;
    processedLabelCount += 1;
    if (processedLabelCount === 1 || processedLabelCount % progressEveryLabels === 0) {
      emitProgress("processing_label", current);
    }
    const deploymentAudit = auditWarmachineLegalDeploymentReachabilityV1(current.state, {
      firstPlayerSideKey,
      deployments,
    });
    if (deploymentAudit.ok) {
      if (completed.length >= maximumCompletedRoutes) {
        runtimeDeferredFrontiers.push(checkpointFrontier(current));
        unresolved.push(unresolvedRow(
          "legal_deployment",
          current.stateHash,
          "terminal_to_deployment_completed_route_budget_exhausted",
        ));
        continue;
      }
      completed.push({ ...current, deploymentAudit });
      if (stopAfterCompletedRouteCount > 0 &&
          completed.length >= stopAfterCompletedRouteCount) {
        witnessStopTriggered = true;
        const deferred = [
          "depth_first_to_deployment",
          "best_first_to_deployment",
        ].includes(frontierOrder)
          ? queue.splice(0)
          : queue.slice(queueIndex);
        if (frontierOrder !== "depth_first_to_deployment") queue.length = queueIndex;
        runtimeDeferredFrontiers.push(...deferred.map(checkpointFrontier));
        witnessStopDeferredLabelCount += deferred.length;
        unresolved.push(...deferred.map((row) => unresolvedRow(
          "recursive_turn",
          row.stateHash,
          "terminal_to_deployment_witness_budget_deferred",
          {
            labelKey: row.labelKey,
            reversedPriorTurnCount: row.reversedPriorTurnCount,
            reverseEdgeKeys: row.reverseEdges.map((edge) =>
              edge.candidateKey || stableGraphHash(edge)),
          },
        )));
        emitProgress("witness_budget_reached", current);
      }
      continue;
    }
    if (current.reversedPriorTurnCount >= maximumReverseTurns) {
      runtimeDeferredFrontiers.push(checkpointFrontier(current));
      unresolved.push(unresolvedRow(
        "recursive_turn",
        current.stateHash,
        "terminal_to_deployment_reverse_turn_budget_exhausted",
        {
          reversedPriorTurnCount: current.reversedPriorTurnCount,
          failedDeploymentChecks: deploymentAudit.failedChecks,
        },
      ));
      continue;
    }
    if (Number(current.state.turnNumber) === 1 &&
        current.state.activeSideKey === firstPlayerSideKey) {
      if (emittedDeploymentFailureCount < progressDeploymentFailureLimit) {
        emittedDeploymentFailureCount += 1;
        rawOptions.onProgress?.({
          schemaVersion: "warmachine_terminal_rooted_to_deployment_progress_v1",
          stage: "turn_one_deployment_audit_failed",
          terminalCellKey: String(terminalCell.cellKey || ""),
          terminalGoalType: String(terminalCell.goalType || ""),
          processedLabelCount,
          stateHash: current.stateHash,
          failedDeploymentChecks: deploymentAudit.failedChecks,
          score: stableGraphValue(current.state.scenario?.score || {}),
          pieces: stableGraphValue((current.state.pieces || []).map((piece) => ({
            pieceKey: piece.pieceKey,
            sideKey: piece.sideKey,
            position: piece.position,
            activated: piece.activated === true,
          }))),
        });
      }
      unresolved.push(unresolvedRow(
        "legal_deployment",
        current.stateHash,
        "turn_one_control_start_is_not_a_legal_deployment",
        {
          failedDeploymentChecks: deploymentAudit.failedChecks,
          deploymentAudit: deploymentAudit.deploymentAudit,
          ...(rawOptions.includeRuntimeDiagnostics === true
            ? {
              pieces: (current.state.pieces || []).map((piece) => ({
                pieceKey: piece.pieceKey,
                sideKey: piece.sideKey,
                position: piece.position,
                activated: piece.activated === true,
              })),
            }
            : {}),
        },
      ));
      continue;
    }
    let expansion = expansionCache.get(current.stateHash);
    if (!expansion) {
      expansion = expansionAtControlStart(current.state, {
        ...rawOptions,
        deployments,
        previousTurnEndScenarioSettlementWitnesses:
          rawOptions.previousTurnEndScenarioSettlementWitnesses ||
          terminalCell.predecessorHistoryEvidence?.turnEndSettlementWitnesses || [],
        queryKey: terminalCell.cellKey,
      });
      expansionCache.set(current.stateHash, expansion);
    }
    expandedLabelCount += 1;
    unresolved.push(...expansion.unresolved);
    rejected.push(...expansion.rejected);
    runtimeDiagnostics.push(...(expansion.runtimeDiagnostics || []));
    for (const extension of expansion.extensions) {
      const reverseEdges = [...current.reverseEdges, ...extension.reverseEdges];
      const labelKey = routeLabelKey(extension.stateHash, reverseEdges);
      if (labels.has(labelKey)) continue;
      if (labels.size >= maximumRouteLabels) {
        runtimeDeferredFrontiers.push(checkpointFrontier({
          labelKey,
          state: extension.state,
          stateHash: extension.stateHash,
          reverseEdges,
          reversedPriorTurnCount: current.reversedPriorTurnCount + 1,
          deploymentGeometryDebt: warmachineDeploymentGeometryDebtV1(extension.state, {
            deployments,
          }),
        }));
        unresolved.push(unresolvedRow(
          "recursive_turn",
          extension.stateHash,
          "terminal_to_deployment_route_label_budget_exhausted",
          { reversedPriorTurnCount: current.reversedPriorTurnCount + 1 },
        ));
        continue;
      }
      if (!uniqueStates.has(extension.stateHash) && uniqueStates.size >= maximumUniqueStates) {
        runtimeDeferredFrontiers.push(checkpointFrontier({
          labelKey,
          state: extension.state,
          stateHash: extension.stateHash,
          reverseEdges,
          reversedPriorTurnCount: current.reversedPriorTurnCount + 1,
          deploymentGeometryDebt: warmachineDeploymentGeometryDebtV1(extension.state, {
            deployments,
          }),
        }));
        unresolved.push(unresolvedRow(
          "recursive_turn",
          extension.stateHash,
          "terminal_to_deployment_unique_state_budget_exhausted",
          { reversedPriorTurnCount: current.reversedPriorTurnCount + 1 },
        ));
        continue;
      }
      labels.add(labelKey);
      uniqueStates.add(extension.stateHash);
      const nextLabel = {
        labelKey,
        state: extension.state,
        stateHash: extension.stateHash,
        reverseEdges,
        reversedPriorTurnCount: current.reversedPriorTurnCount + 1,
        deploymentGeometryDebt: warmachineDeploymentGeometryDebtV1(extension.state, {
          deployments,
        }),
      };
      queue.push(nextLabel);
      reachedPriorTurnFrontiers.push(publicFrontierEvidence(
        nextLabel,
        extension.reverseEdges,
      ));
      runtimeReachedPriorTurnFrontiers.push(nextLabel);
    }
  }
  emitProgress("search_complete");

  completed.sort((left, right) => left.labelKey.localeCompare(right.labelKey));
  let routes = completed.map((row) => {
    const strictReceiptHashes = [...new Set(row.reverseEdges.flatMap((edge) => [
      edge.strictReceiptHash,
      ...(edge.strictStepReceiptHashes || []),
    ]).filter(Boolean))].sort();
    const core = {
      candidateKind: "terminal_rooted_legal_deployment_predecessor",
      terminalCellKey: String(terminalCell.cellKey || ""),
      terminalGoalType: String(terminalCell.goalType || ""),
      terminalStateHash: terminal.successorSemanticHash,
      terminalSpatialEvidence: terminalSpatialEvidence(terminalCell),
      predecessorKind: "legal_turn_one_deployment",
      predecessorStateKey: String(row.state.stateKey || ""),
      predecessorStateHash: row.stateHash,
      successorStateKey: String(terminalStateInput.stateKey || ""),
      successorStateHash: terminal.successorSemanticHash,
      reverseEdges: stableGraphValue(row.reverseEdges),
      historyEvidence: buildWarmachineReverseRouteHistoryEvidenceV1(
        row.reverseEdges,
        row.state,
      ),
      reverseLayerKeys: row.reverseEdges.map((edge) => edge.layerKey),
      reversedPriorTurnCount: row.reversedPriorTurnCount,
      strictReceiptHashes,
      strictReceiptHash: strictReceiptHashes[0] || "",
      strictWitness: row.reverseEdges.every((edge) => edge.strictWitness === true),
      strictRejected: false,
      unresolvedReasons: [],
      legalDeploymentReached: true,
      deploymentAudit: stableGraphValue(row.deploymentAudit),
      deploymentEndpointEvidence: deploymentEndpointEvidence(
        row.state,
        row.deploymentAudit,
      ),
      fullRouteStrictReplayCertified: false,
      trainingTruth: false,
      provenance: {
        upstreamReceiptHash: warmachineHost.receipt.receiptHash,
        oracleOpeningRead: false,
        oracleRouteRead: false,
        oracleIntermediateStateRead: false,
      },
    };
    return {
      ...core,
      candidateKey: `terminal-deployment-route-${stableGraphHash(core, 32)}`,
      predecessorState: row.state,
    };
  });
  if (rawOptions.certifyFullRouteStrictReplay === true) {
    routes = routes.map((route) => {
      const replay = replayWarmachineTerminalReverseRouteV1(
        route,
        terminalStateInput,
        {
          routeKey: `terminal-to-deployment-full-replay:${route.candidateKey}`,
          maximumControlSteps: rawOptions.maximumControlSteps,
        },
      );
      const { finalState: _finalState, ...publicReplay } = replay;
      return {
        ...route,
        fullRouteStrictReplayCertified: replay.fullRouteStrictReplayCertified,
        fullRouteStrictReplay: stableGraphValue(publicReplay),
      };
    });
  }
  const publicCandidates = routes.map(({ predecessorState: _state, ...candidate }) => candidate);
  const candidateSet = buildWarmachineReverseReachabilityCandidateSetV2(publicCandidates, {
    queryKey: String(terminalCell.cellKey || "terminal-to-deployment"),
    successorStateKey: String(terminalStateInput.stateKey || ""),
    maximumCandidates: publicCandidates.length,
  });
  const deferredByLabel = new Map(runtimeDeferredFrontiers.map((row) => [
    row.labelKey,
    row,
  ]));
  const runtimeResumeCheckpoint = buildWarmachineTerminalRootedResumeCheckpointV1({
    terminalStateHash: terminal.successorSemanticHash,
    terminalCell,
    deployments,
    rawOptions,
    deferredFrontiers: [...deferredByLabel.values()],
  });
  const core = {
    schemaVersion: WARMACHINE_TERMINAL_ROOTED_TO_DEPLOYMENT_V1_SCHEMA,
    terminalCellKey: String(terminalCell.cellKey || ""),
    terminalGoalType: String(terminalCell.goalType || ""),
    terminalStateHash: terminal.successorSemanticHash,
    resumeCheckpoint: {
      requested: Boolean(requestedResumeCheckpoint),
      accepted: resumeCheckpointAccepted,
      checkpointHash: runtimeResumeCheckpoint.checkpointHash,
      resumeContractHash: expectedResumeContractHash,
      deferredFrontierCount: runtimeResumeCheckpoint.frontierCount,
    },
    terminalSpatialEvidence: terminalSpatialEvidence(terminalCell),
    firstPlayerSideKey,
    budgets: {
      maximumReverseTurns,
      maximumRouteLabels,
      maximumUniqueStates,
      maximumCompletedRoutes,
      stopAfterCompletedRouteCount,
      frontierOrder,
      maximumActivationDepth: Number(rawOptions.maximumActivationDepth || 0),
      maximumActivationLabels: Number(rawOptions.maximumActivationLabels || 0),
      maximumActivationUniqueStates: Number(rawOptions.maximumActivationUniqueStates || 0),
      maximumActivationGroupsPerExpansion: Number(
        rawOptions.maximumActivationGroupsPerExpansion || 0,
      ),
      maximumActivationCandidatesPerExpansion: Number(
        rawOptions.maximumActivationCandidatesPerExpansion || 0,
      ),
      maximumActivationPassActorsPerExpansion: Number(
        rawOptions.maximumActivationPassActorsPerExpansion || 0,
      ),
      stopAfterActivationBoundaryRouteCount: Number(
        rawOptions.stopAfterActivationBoundaryRouteCount || 0,
      ),
      activationFrontierOrder: String(rawOptions.activationFrontierOrder || ""),
      maximumDeploymentSlotOrigins: Number(rawOptions.maximumDeploymentSlotOrigins || 0),
      maximumDeploymentSlotRings: Number(rawOptions.maximumDeploymentSlotRings || 0),
    },
    movementProposalUniverse: {
      includePass: rawOptions.includePass !== false,
      includeMovement: rawOptions.includeMovement !== false,
      movementActionTypes: stableGraphValue(rawOptions.movementActionTypes || ["advance", "run"]),
      exhaustiveOverContinuousPaths: false,
    },
    terminalEventPredecessorCount: terminal.candidates.length,
    terminalEventPredecessors: stableGraphValue(terminal.candidates.map((candidate) => ({
      candidateKey: candidate.candidateKey,
      predecessorStateHash: candidate.predecessorStateHash,
      transitionActionKey: candidate.transitionActionKey,
      matchedProbability: candidate.matchedProbability || null,
      matchedProbabilityInterval: candidate.matchedProbabilityInterval || null,
      matchedProbabilityExact: candidate.matchedProbabilityExact !== false,
      unresolvedReasons: candidate.unresolvedReasons || [],
      mutation: candidate.mutation || null,
      strictReplayStepActionTypes: (candidate.strictReplaySteps || []).map((step) =>
        step.actionType),
      strictReceiptHashes: [
        candidate.strictReceiptHash,
        ...(candidate.strictStepReceiptHashes || []),
      ].filter(Boolean),
      continuationActionTypePaths: (candidate.matchingOutcomes || []).map((outcome) =>
        (outcome.continuationReplaySteps || []).map((step) => step.actionType)),
    }))),
    routeLabelCount: labels.size,
    initialFrontierCount: initialFrontier.length,
    initialFrontier: stableGraphValue(initialFrontier),
    reachedPriorTurnFrontierCount: reachedPriorTurnFrontiers.length,
    reachedPriorTurnFrontiers: stableGraphValue(reachedPriorTurnFrontiers),
    uniqueStateCount: uniqueStates.size,
    processedLabelCount,
    expandedLabelCount,
    cachedControlStartExpansionCount: expansionCache.size,
    witnessStopTriggered,
    witnessStopDeferredLabelCount,
    legalDeploymentRouteCount: routes.length,
    fullRouteStrictReplayRequested: rawOptions.certifyFullRouteStrictReplay === true,
    fullRouteStrictReplayCertifiedCount: routes.filter((route) =>
      route.fullRouteStrictReplayCertified === true).length,
    rejectedBranchCount: rejected.length,
    unresolvedCount: unresolved.length,
    publicCandidates: stableGraphValue(publicCandidates),
    rejected: stableGraphValue(rejected),
    unresolved: stableGraphValue(unresolved),
    candidateSet,
    oracleIsolationAudit: {
      inputKinds: [
        "terminal_state",
        "terminal_hypothesis_cell",
        "deployment_zones",
        "reverse_operator_budgets",
      ],
      openingRead: false,
      forwardRouteRead: false,
      intermediateStateRead: false,
      passed: terminal.oracleIsolationAudit.passed === true,
    },
    claimBoundary: "This finite worklist composes concrete strict inverse edges from a supplied terminal through alternating activation, control and end-turn boundaries until one complete rules state passes the legal turn-one deployment audit. Pass and the declared movement proposal families are peer predecessors. Continuous movement paths, unsupported activation families and every budget omission remain explicit unresolved coverage; a deployment route is not training truth until an independent whole-chain strict forward replay also passes.",
  };
  return {
    ...core,
    routes,
    runtimeReachedPriorTurnFrontiers,
    runtimeResumeCheckpoint,
    runtimeDiagnostics,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: candidateSet.reachabilityContractOk && routes.length > 0,
  };
}
