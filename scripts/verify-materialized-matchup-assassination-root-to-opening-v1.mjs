#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import {
  replayWarmachineMaterializedTerminalActivationV1,
  searchWarmachineMaterializedTerminalRootToDeploymentV1,
} from "../src/reverse/materialized-terminal-root-to-deployment-v1.mjs";
import { runWarmachineTerminalRootedResumeLayerParallelV1 } from
  "../src/reverse/terminal-rooted-resume-parallel-v1.mjs";
import { buildWarmachineTerminalRootedResumeCheckpointV1 } from
  "../src/reverse/terminal-rooted-to-deployment-v1.mjs";
import {
  recoverWarmachineTerminalReverseRoutePrefixV1,
  reissueWarmachineTerminalReverseRouteV1,
} from
  "../src/reverse/replay-terminal-reverse-route-v1.mjs";
import { buildWarmachineTerminalHypothesisDomainV1 } from
  "../src/reverse/terminal-hypothesis-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultBundlePath = path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/ticket06",
  "movement-assassination-state-bundle.json",
);

function argumentValue(name, fallback = "") {
  return process.argv.find((argument) =>
    argument.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
}

function writeJsonAtomic(targetPath, value) {
  const target = path.resolve(targetPath);
  const directory = path.dirname(target);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx");
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, target);
    const directoryDescriptor = fs.openSync(directory, "r");
    try {
      fs.fsyncSync(directoryDescriptor);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  }
}

function deploymentMap(state = {}) {
  return Object.fromEntries((state.deploymentZones || []).map((zone) => [
    zone.sideKey === "player1" ? "p1_deploy" : "p2_deploy",
    {
      id: String(zone.id || zone.zoneKey || ""),
      x: Number(zone.xIn ?? zone.x),
      y: Number(zone.yIn ?? zone.y),
      width: Number(zone.widthIn ?? zone.width),
      height: Number(zone.heightIn ?? zone.height),
    },
  ]));
}

function activationGroupKeys(state = {}, sideKey = "") {
  return [...new Set((state.pieces || []).filter((piece) =>
    piece.sideKey === sideKey).map((piece) => String(
      piece.unitGroupId || piece.unitId || piece.metadata?.unitGroupId ||
      piece.metadata?.unitId || piece.pieceKey,
    )))].sort();
}

function terminalEventOptions(materialized = {}, cell = {}) {
  const terminalState = materialized.runtime?.terminalState || {};
  const root = materialized.scenarioRefinement?.currentRoot ||
    materialized.report?.root || {};
  const targetPieceKey = String(cell.targetLeaderPieceKey || "");
  const target = (terminalState.pieces || []).find((piece) =>
    piece.pieceKey === targetPieceKey) || {};
  const statusKey = target.isWarlock === true ? "wild" : "inert";
  const controlled = (terminalState.pieces || []).filter((piece) =>
    piece.controllerPieceKey === targetPieceKey &&
    (piece.statusTags || []).includes(statusKey));
  const firstAction = root.actionSequence?.[0] || {};
  return {
    terminalActionTypes: [String(firstAction.actionType || "")],
    terminalActionKeys: [String(firstAction.actionKey || "")],
    maximumTerminalActions: 1,
    maximumTerminalContinuationDepth: 2,
    maximumTerminalContinuationLabels: 8,
    controllerDestructionResourcePointsByPieceKey: Object.fromEntries(
      controlled.map((piece) => [piece.pieceKey, 0]),
    ),
    controllerDestructionStatusPreimageByPieceKey: Object.fromEntries(
      controlled.map((piece) => [piece.pieceKey, { [statusKey]: false }]),
    ),
    controllerDestructionUpkeepPreimageByControllerPieceKey: {
      [targetPieceKey]: { mode: "none_active" },
    },
  };
}

function terminalCell(materialized = {}) {
  const root = materialized.scenarioRefinement?.currentRoot ||
    materialized.report?.root || {};
  const terminalState = materialized.runtime?.terminalState || {};
  const piecePositions = Object.fromEntries((terminalState.pieces || []).map((piece) => [
    piece.pieceKey,
    piece.position,
  ]));
  const relationChecks = [{
    relationKey: "materialized-terminal-action-range",
    relationKind: "attack_profile_range",
    sourcePieceKey: root.actorPieceKey,
    targetPieceKey: root.targetPieceKey,
    profileKey: root.attackProfileKey,
  }, {
    relationKey: "materialized-terminal-controller-range",
    relationKind: "leader_control_range",
    sourcePieceKey: root.controllerPieceKey,
    targetPieceKey: root.actorPieceKey,
  }];
  return buildWarmachineTerminalHypothesisDomainV1({
    scenarioKey: root.scenarioKey,
    scenarioPacketKey: "steamroller-2026",
    scenarioPacketYear: "2026",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    rosterReceiptHash: materialized.planHash,
    specs: [{
      goalType: "assassination",
      roundNumbers: [Number(root.roundNumber)],
      winnerSideKeys: [root.winnerSideKey],
      loserSideKeys: [root.loserSideKey],
      endingSideKeys: [root.endingSideKey],
      causalActionFamilies: ["strict_melee_chain"],
      actorPieceKeys: [root.actorPieceKey],
      targetLeaderPieceKeys: [root.targetPieceKey],
      targetBoxesBeforeFinal: [1],
      resourceEnvelopeKeys: ["zero_available"],
      geometryRelationCells: [{
        relationKind: "materialized_terminal_activation_reachable",
        actorToTargetRangeBand: root.geometry?.actionRange || "rule_legal_range",
        lineOfSightRelation: "strict_los_required",
        pathRelation: root.geometry?.requiresPriorMovement
          ? "strict_explicit_path_required"
          : "no_movement_in_terminal_step",
        baseRelation: "legal_nonoverlap",
        exactCoordinatesKnown: true,
        exactCoordinates: { piecePositions },
        relationChecks,
      }],
      assumptionSources: {
        goalType: "user_constrained",
        roundNumber: "user_constrained",
        winnerSideKey: "user_constrained",
        loserSideKey: "rule_derived",
        endingSideKey: "user_constrained",
        causalActionFamily: "optimistic_proposal",
        actorPieceKey: "optimistic_proposal",
        targetLeaderPieceKey: "user_constrained",
        targetBoxesBeforeFinal: "optimistic_proposal",
        resourceEnvelopeKey: "rule_derived",
        geometryRelationCell: "optimistic_proposal",
      },
    }],
  }).cells[0];
}

const bundlePath = path.resolve(argumentValue("bundle", defaultBundlePath));
const maximumReverseTurns = Math.max(0, Number(argumentValue(
  "maximum-reverse-turns",
  "0",
)));
const maximumRouteLabels = Math.max(1, Math.floor(Number(argumentValue(
  "maximum-route-labels",
  "128",
))));
const maximumUniqueStates = Math.max(1, Math.floor(Number(argumentValue(
  "maximum-unique-states",
  "128",
))));
const maximumCompletedRoutes = Math.max(1, Math.floor(Number(argumentValue(
  "maximum-completed-routes",
  "1",
))));
const stopAfterCompletedRouteCount = Math.max(0, Math.floor(Number(argumentValue(
  "stop-after-completed-route-count",
  "1",
))));
const maximumActivationLabels = Math.max(1, Math.floor(Number(argumentValue(
  "maximum-activation-labels",
  "128",
))));
const maximumActivationUniqueStates = Math.max(1, Math.floor(Number(argumentValue(
  "maximum-activation-unique-states",
  "128",
))));
const stopAfterActivationBoundaryRouteCount = Math.max(0, Math.floor(Number(
  argumentValue("stop-after-activation-boundary-route-count", "1"),
)));
const maximumActivationGroupsPerExpansion = Math.max(0, Math.floor(Number(
  argumentValue("maximum-activation-groups-per-expansion", "1"),
)));
const maximumActivationCandidatesPerExpansion = Math.max(0, Math.floor(Number(
  argumentValue("maximum-activation-candidates-per-expansion", "1"),
)));
const maximumMovementStrictCandidateAttempts = Math.max(0, Math.floor(Number(
  argumentValue("maximum-movement-strict-candidate-attempts", "24"),
)));
const maximumMovementStrictCandidatesPerExpansion = Math.max(0, Math.floor(Number(
  argumentValue("maximum-movement-strict-candidates-per-expansion", "4"),
)));
const parallelWorkers = Math.max(1, Math.floor(Number(argumentValue(
  "parallel-workers",
  "1",
))));
const checkpointOutput = argumentValue("checkpoint-output", "");
const resultOutput = argumentValue("result-output", "");
const diagnosticOutput = argumentValue("diagnostic-output", "");
const parallelTaskCheckpointOutput = argumentValue(
  "parallel-task-checkpoint-output",
  checkpointOutput ? `${checkpointOutput}.tasks.json` : "",
);
const historicalResumePath = argumentValue("historical-resume", "");
const historicalReissueCheckpointOutput = argumentValue(
  "historical-reissue-checkpoint-output",
  "",
);
const historicalReissueOnly = argumentValue(
  "historical-reissue-only",
  "false",
) === "true";
const historicalFrontierIndex = Math.floor(Number(argumentValue(
  "historical-frontier-index",
  "-1",
)));
const historicalFrontierScenarioOverlay = argumentValue(
  "historical-frontier-scenario-overlay",
  "false",
) === "true";
const historicalPrefixReverseTurns = Math.floor(Number(argumentValue(
  "historical-prefix-reverse-turns",
  "-1",
)));
const loadedHistoricalResumeCheckpoint = historicalResumePath
  ? JSON.parse(fs.readFileSync(path.resolve(historicalResumePath), "utf8"))
  : null;
const loadedParallelTaskCheckpoint = parallelTaskCheckpointOutput &&
    fs.existsSync(path.resolve(parallelTaskCheckpointOutput))
  ? JSON.parse(fs.readFileSync(path.resolve(parallelTaskCheckpointOutput), "utf8"))
  : null;
let parallelTaskCheckpointHash = String(
  loadedParallelTaskCheckpoint?.checkpointHash || "",
);
const materialized = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
const root = materialized.scenarioRefinement?.currentRoot ||
  materialized.report?.root || {};
assert.equal(materialized.report?.disposition, "strict_materialized");
assert.equal(root.priorLossPieceKeys?.length || 0, 0);
assert.equal(root.geometry?.requiresPriorMovement, true);
assert.equal(materialized.runtime?.predecessorState?.pieces?.length, 80);

const state = materialized.runtime.predecessorState;
const cell = terminalCell(materialized);
const deployments = deploymentMap(state);
const activationGroupOrderKeysBySide = {
  player1: activationGroupKeys(state, "player1"),
  player2: activationGroupKeys(state, "player2"),
};
const emitProgress = (scope) => (event = {}) => {
  if (!["activation_expansion_ready", "activation_boundary_reached",
    "movement_predecessor_progress", "processing_label", "search_complete"]
    .includes(event.stage)) return;
  process.stderr.write(`${JSON.stringify({
    scope,
    stage: event.stage,
    sideKey: event.sideKey || "",
    depth: event.depth ?? null,
    selectedGroupKey: event.selectedGroups?.[0]?.groupKey || "",
    selectedOperatorKey: event.selectedCandidates?.[0]?.operatorKey || "",
    selectedActionType: event.selectedCandidates?.[0]?.actionType || "",
    candidateCount: event.candidateCount ?? null,
    rejectedCount: event.rejectedCount ?? null,
    unresolvedReasons: event.unresolvedReasons || [],
    processedLabelCount: event.processedLabelCount ?? null,
    completedRouteCount: event.completedRouteCount ?? null,
    movementStage: event.movementStage || "",
    actorPieceKey: event.actorPieceKey || "",
    movementProposalKey: event.movementProposalKey || event.proposalKey || "",
    strictCandidateAttemptCount:
      event.strictCandidateAttemptCount ?? null,
    acceptedStrictCandidateCount:
      event.acceptedStrictCandidateCount ?? null,
    visitedLabelCount: event.visitedLabelCount ?? null,
    queuedLabelCount: event.queuedLabelCount ?? null,
    routeCount: event.routeCount ?? null,
  })}\n`);
};
const searchOptions = {
  deployments,
  firstPlayerSideKey: String(state.firstPlayerSideKey || "player2"),
  maximumReverseTurns,
  maximumRouteLabels,
  maximumUniqueStates,
  maximumCompletedRoutes,
  stopAfterCompletedRouteCount,
  frontierOrder: "best_first_to_deployment",
  movementActionTypes: ["advance", "run"],
  maximumActivationDepth: 64,
  maximumActivationLabels,
  maximumActivationUniqueStates,
  activationFrontierOrder: "best_first_to_deployment",
  prioritizeControlResourceDependencies: true,
  stopAfterActivationBoundaryRouteCount,
  maximumActivationGroupsPerExpansion,
  maximumActivationCandidatesPerExpansion,
  maximumMovementStrictCandidatesPerExpansion,
  maximumMovementStrictCandidateAttempts,
  maximumUnitMovementAnchorsPerGroup: 1,
  maximumDeploymentSlotOrigins: 8,
  maximumDeploymentSlotRings: 2,
  includeResourceSpendPrefixes: true,
  includePostMovementResourceSpendSuffixes: true,
  maximumResourcePrefixTargets: 4,
  maximumResourcePrefixDepth: 4,
  maximumResourcePrefixLabels: 16,
  maximumResourcePrefixRoutes: 1,
  maximumResourceSuffixTargets: 4,
  maximumResourceSuffixDepth: 4,
  maximumResourceSuffixLabels: 16,
  maximumResourceSuffixRoutes: 1,
  maximumResourceSuffixMovementProposals: 2,
  resourceEnvelopeModes: ["unchanged", "reverse_focus_control_baseline"],
  activationGroupOrderKeysBySide,
  nextSideActivationRestoreModes: ["all_alive_activated"],
  currentTurnIncludeMovement: false,
  currentTurnMaximumActivationDepth: 64,
  currentTurnMaximumActivationLabels: 64,
  currentTurnMaximumActivationUniqueStates: 64,
  onCurrentTurnActivationProgress: emitProgress("terminal_turn_activation"),
  onActivationProgress: emitProgress("historical_activation"),
  onProgress: emitProgress("terminal_to_deployment"),
  terminalEventOptions: terminalEventOptions(materialized, cell),
  includeRuntimeDiagnostics: Boolean(diagnosticOutput),
  certifyFullRouteStrictReplay: true,
  progressEveryLabels: 5,
};
let historicalResumeCheckpoint = loadedHistoricalResumeCheckpoint;
let historicalFrontierReissue = null;
let historicalScenarioOverlayAudit = null;
let historicalPrefixRecovery = null;
if (historicalFrontierIndex >= 0) {
  assert.equal(Boolean(loadedHistoricalResumeCheckpoint), true,
    "--historical-frontier-index requires --historical-resume");
  const sourceFrontier = loadedHistoricalResumeCheckpoint
    .frontiers?.[historicalFrontierIndex];
  assert.equal(Boolean(sourceFrontier), true,
    `historical frontier index out of range: ${historicalFrontierIndex}`);
  let sourceFrontierState = sourceFrontier.state;
  let sourceFrontierEdges = sourceFrontier.reverseEdges || [];
  let sourceFrontierReversedPriorTurnCount = Number(
    sourceFrontier.reversedPriorTurnCount || 0,
  );
  if (historicalFrontierScenarioOverlay) {
    assert.equal(Boolean(materialized.scenarioRefinement), true,
      "scenario overlay requires a scenario-refinement bundle");
    const historicalOverlay = materialized.scenarioRefinement
      .historicalFrontierSettlementOverlay || null;
    const baseSettlement = historicalOverlay?.baseSettlement ||
      materialized.scenarioRefinement.rejectedHypothesis?.settlement || {};
    const refinedSettlement = historicalOverlay?.refinedSettlement ||
      materialized.scenarioRefinement.refinedHypothesis?.settlement || {};
    const sourceSettlement = {
      score: sourceFrontier.state?.scenario?.score || {},
      scoringHistory: sourceFrontier.state?.scenario?.scoringHistory || [],
    };
    assert.equal(
      JSON.stringify(stableGraphValue(sourceSettlement)),
      JSON.stringify(stableGraphValue(baseSettlement)),
      "historical frontier settlement does not match rejected hypothesis",
    );
    if (historicalOverlay?.sourceExpectedStateHash) {
      assert.equal(sourceFrontier.stateHash,
        historicalOverlay.sourceExpectedStateHash,
      "historical frontier state does not match strict counterexample input");
    }
    sourceFrontierState = structuredClone(sourceFrontier.state);
    sourceFrontierState.scenario = {
      ...(sourceFrontierState.scenario || {}),
      score: structuredClone(refinedSettlement.score || {}),
      scoringHistory: structuredClone(refinedSettlement.scoringHistory || []),
    };
    historicalScenarioOverlayAudit = stableGraphValue({
      baseSettlement,
      refinedSettlement,
      sourceFrontierStateHash: sourceFrontier.stateHash,
      overlaidFrontierStateHash:
        warmachineReverseStateSemanticHashV1(sourceFrontierState),
      strictCounterexampleExecutedStateHash: String(
        historicalOverlay?.sourceExecutedStateHash || "",
      ),
      onlyScenarioSettlementOverlaid: true,
    });
  }
  if (historicalPrefixReverseTurns >= 0) {
    historicalPrefixRecovery = recoverWarmachineTerminalReverseRoutePrefixV1({
      candidateKey: String(sourceFrontier.labelKey || "historical-frontier"),
      predecessorState: sourceFrontierState,
      predecessorStateHash: warmachineReverseStateSemanticHashV1(
        sourceFrontierState,
      ),
      reverseEdges: sourceFrontierEdges,
    }, historicalPrefixReverseTurns, {
      routeKey: `historical-frontier-prefix-recovery:${historicalFrontierIndex}`,
      maximumControlSteps: searchOptions.maximumControlSteps,
      onProgress: (event) => process.stderr.write(`${JSON.stringify({
        scope: "historical_prefix_recovery",
        ...event,
      })}\n`),
    });
    assert.equal(historicalPrefixRecovery.ok, true,
      JSON.stringify(historicalPrefixRecovery.failures, null, 2));
    sourceFrontierState =
      historicalPrefixRecovery.recoveredRoute.predecessorState;
    sourceFrontierEdges =
      historicalPrefixRecovery.recoveredRoute.reverseEdges;
    sourceFrontierReversedPriorTurnCount = historicalPrefixReverseTurns;
  }
  historicalFrontierReissue = reissueWarmachineTerminalReverseRouteV1({
    candidateKey: String(sourceFrontier.labelKey || "historical-frontier"),
    predecessorState: sourceFrontierState,
    predecessorStateHash: warmachineReverseStateSemanticHashV1(
      sourceFrontierState,
    ),
    reverseEdges: sourceFrontierEdges,
  }, materialized.runtime.terminalState, {
    routeKey: `historical-frontier-current-host-reissue:${historicalFrontierIndex}`,
    maximumControlSteps: searchOptions.maximumControlSteps,
    onProgress: (event) => process.stderr.write(`${JSON.stringify({
      scope: "historical_route_reissue",
      ...event,
    })}\n`),
  });
  assert.equal(historicalFrontierReissue.ok, true,
    JSON.stringify(historicalFrontierReissue.failures, null, 2));
  const selectedFrontier = {
    ...sourceFrontier,
    labelKey: `historical-${historicalFrontierReissue.reissuedRoute.candidateKey}`,
    state: historicalFrontierReissue.reissuedRoute.predecessorState,
    stateHash: historicalFrontierReissue.reissuedRoute.predecessorStateHash,
    reverseEdges: historicalFrontierReissue.reissuedRoute.reverseEdges,
    reversedPriorTurnCount: sourceFrontierReversedPriorTurnCount,
  };
  historicalResumeCheckpoint = buildWarmachineTerminalRootedResumeCheckpointV1({
    terminalStateHash: warmachineReverseStateSemanticHashV1(
      materialized.runtime.terminalState,
    ),
    terminalCell: cell,
    deployments,
    rawOptions: searchOptions,
    deferredFrontiers: [selectedFrontier],
  });
  if (historicalReissueCheckpointOutput) {
    writeJsonAtomic(
      historicalReissueCheckpointOutput,
      historicalResumeCheckpoint,
    );
  }
  if (historicalReissueOnly) {
    assert.equal(Boolean(historicalReissueCheckpointOutput), true,
      "--historical-reissue-only requires --historical-reissue-checkpoint-output");
    process.stdout.write(`${JSON.stringify({
      ok: true,
      schemaVersion: "verify_materialized_historical_reissue_only_v1",
      historicalFrontierIndex,
      historicalFrontierCurrentHostReissued:
        historicalFrontierReissue.currentHostStrictReplayCertified === true,
      historicalFrontierReissuedEdgeCount:
        historicalFrontierReissue.reverseEdgeCount,
      historicalFrontierReissueFreshStrictTransitionCount:
        historicalFrontierReissue.freshStrictTransitionCount,
      historicalFrontierReissueHash: historicalFrontierReissue.reissueHash,
      historicalFrontierScenarioOverlayApplied:
        historicalScenarioOverlayAudit?.onlyScenarioSettlementOverlaid === true,
      historicalFrontierScenarioOverlayHash: historicalScenarioOverlayAudit
        ? stableGraphHash(historicalScenarioOverlayAudit)
        : "",
      historicalPrefixRecoveryApplied:
        historicalPrefixRecovery?.currentHostPrefixRecoveryCertified === true,
      historicalPrefixRecoveryRetainedEdgeCount:
        historicalPrefixRecovery?.retainedReverseEdgeCount || 0,
      historicalPrefixRecoveryRemovedEdgeCount:
        historicalPrefixRecovery?.removedReverseEdgeCount || 0,
      historicalPrefixRecoveryFreshStrictTransitionCount:
        historicalPrefixRecovery?.freshStrictTransitionCount || 0,
      historicalPrefixRecoveryHash:
        historicalPrefixRecovery?.recoveryHash || "",
      checkpointHash: historicalResumeCheckpoint.checkpointHash,
      checkpointOutput: path.resolve(historicalReissueCheckpointOutput),
    }, null, 2)}\n`);
    process.exit(0);
  }
}
const parallelEnabled = Boolean(historicalResumeCheckpoint) && (
  parallelWorkers > 1 || historicalFrontierIndex >= 0
);
let result;
if (parallelEnabled) {
  const terminalReplay = replayWarmachineMaterializedTerminalActivationV1({
    predecessorState: materialized.runtime.predecessorState,
    terminalState: materialized.runtime.terminalState,
    actionSequence: root.actionSequence || [],
    actorPieceKey: root.actorPieceKey,
    targetPieceKey: root.targetPieceKey,
    routeKey: `materialized-terminal-root-parallel:${materialized.taskKey || "root"}`,
  });
  assert.equal(terminalReplay.ok, true,
    JSON.stringify(terminalReplay.failures, null, 2));
  const parallel = await runWarmachineTerminalRootedResumeLayerParallelV1({
    terminalState: materialized.runtime.terminalState,
    terminalCell: cell,
    rawOptions: searchOptions,
    resumeCheckpoint: historicalResumeCheckpoint,
    maximumWorkers: parallelWorkers,
    taskProgressCheckpoint: loadedParallelTaskCheckpoint,
    onTaskProgressCheckpoint: parallelTaskCheckpointOutput
      ? (checkpoint) => {
        writeJsonAtomic(parallelTaskCheckpointOutput, checkpoint);
        parallelTaskCheckpointHash = checkpoint.checkpointHash;
      }
      : undefined,
    onWorkerProgress: (event) => {
      if (!["started", "liveness_probe", "search_progress"]
        .includes(event.eventType)) return;
      process.stderr.write(`${JSON.stringify({
        scope: "parallel_historical_layer",
        ...event,
      })}\n`);
    },
  });
  result = {
    terminalReplay,
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
    resumeCheckpointAccepted: true,
    legalDeploymentRouteCount: parallel.legalDeploymentRouteCount,
    fullRouteStrictReplayCertifiedCount:
      parallel.fullRouteStrictReplayCertifiedCount,
    unresolvedCount: parallel.unresolvedCount,
    rejectedBranchCount: parallel.rejectedBranchCount,
    oracleIsolationPassed: parallel.oracleIsolationPassed,
    search: {
      reachedPriorTurnFrontierCount:
        parallel.reachedPriorTurnFrontierCount,
      runtimeReachedPriorTurnFrontiers:
        parallel.runtimeReachedPriorTurnFrontiers,
      runtimeResumeCheckpoint: parallel.runtimeResumeCheckpoint,
      runtimeDiagnostics: parallel.runtimeDiagnostics,
      unresolved: parallel.unresolved,
      rejected: parallel.rejected,
    },
    parallelExecution: parallel,
    reportHash: parallel.parallelExecutionHash,
    ok: parallel.legalDeploymentRouteCount > 0 &&
      parallel.fullRouteStrictReplayCertifiedCount > 0,
  };
} else {
  result = searchWarmachineMaterializedTerminalRootToDeploymentV1({
    materialized,
    terminalCell: cell,
    rawOptions: {
      ...searchOptions,
      ...(historicalResumeCheckpoint ? { historicalResumeCheckpoint } : {}),
    },
  });
}

if (diagnosticOutput) {
  const target = path.resolve(diagnosticOutput);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({
    schemaVersion:
      "verify_materialized_matchup_assassination_root_to_opening_diagnostics_v1",
    stage: result.stage,
    searchRuntimeDiagnostics: result.search?.runtimeDiagnostics || [],
    searchUnresolved: result.search?.unresolved || [],
    searchRejected: result.search?.rejected || [],
  }, null, 2)}\n`);
}

assert.equal(result.terminalReplay.strictReplayCertified, true,
  JSON.stringify(result.terminalReplay.failures, null, 2));
assert.equal(result.terminalReplay.priorReceiptHashesConsultedForExecution, false);
if (historicalResumeCheckpoint) {
  assert.equal(result.terminalTurnActivation.resumedFromHistoricalCheckpoint, true);
  assert.equal(result.terminalTurnControl.resumedFromHistoricalCheckpoint, true);
} else {
  assert.equal(result.terminalTurnActivation.boundaryRouteCount, 1);
  assert.equal(result.terminalTurnControl.strictCandidateCount > 0, true);
}
assert.equal(result.resumeCheckpointAccepted, true);
const resumeAlreadyAtRequestedDepth = Boolean(historicalResumeCheckpoint) &&
  (historicalResumeCheckpoint.frontiers || []).length > 0 &&
  (historicalResumeCheckpoint.frontiers || []).every((frontier) =>
    Number(frontier.reversedPriorTurnCount || 0) >= maximumReverseTurns);
if (maximumReverseTurns > 0 && !result.ok) {
  if (!resumeAlreadyAtRequestedDepth) {
    assert.equal(result.search?.reachedPriorTurnFrontierCount > 0, true,
      JSON.stringify({
        stage: result.stage,
        legalDeploymentRouteCount: result.legalDeploymentRouteCount,
        fullRouteStrictReplayCertifiedCount:
          result.fullRouteStrictReplayCertifiedCount,
        unresolved: result.search?.unresolved?.slice(0, 12),
        rejected: result.search?.rejected?.slice(0, 12),
      }, null, 2));
  }
  assert.equal(result.search?.runtimeResumeCheckpoint?.frontierCount > 0, true);
}

const reachedOrDeferredFrontiers =
  (result.search?.runtimeReachedPriorTurnFrontiers || []).length > 0
    ? result.search.runtimeReachedPriorTurnFrontiers
    : result.search?.runtimeResumeCheckpoint?.frontiers || [];
const deepestFrontier = reachedOrDeferredFrontiers
  .slice().sort((left, right) =>
    Number(right.reversedPriorTurnCount || 0) - Number(left.reversedPriorTurnCount || 0) ||
    String(left.labelKey || "").localeCompare(String(right.labelKey || "")))[0] || null;
const deepestEdges = deepestFrontier?.reverseEdges || [];
const operatorCounts = Object.fromEntries([...new Set(deepestEdges.map((edge) =>
  String(edge.operatorKey || "")))].sort().map((operatorKey) => [
  operatorKey,
  deepestEdges.filter((edge) => edge.operatorKey === operatorKey).length,
]));
const unitRunEdges = deepestEdges.filter((edge) =>
  edge.operatorKey === "movement_activation_inverse_v1" &&
  edge.actionType === "run" &&
  (edge.activationGroupPieceKeys || []).length > 1);
const outputSummary = {
  ok: maximumReverseTurns === 0
    ? result.resumeCheckpointAccepted
    : result.ok || Boolean(deepestFrontier),
  schemaVersion: "verify_materialized_matchup_assassination_root_to_opening_v1",
  taskKey: materialized.taskKey,
  planHash: materialized.planHash,
  modelCount: state.pieces.length,
  roundNumber: root.roundNumber,
  terminalActionTypes: result.terminalReplay.declaredActionSequence.map((row) =>
    row.actionType),
  terminalActivationStrictReplayCertified:
    result.terminalReplay.strictReplayCertified,
  priorReceiptHashesConsultedForExecution:
    result.terminalReplay.priorReceiptHashesConsultedForExecution,
  currentTurnReverseActivationDepth:
    result.terminalTurnActivation.reverseDepth,
  currentTurnControlCandidateCount:
    result.terminalTurnControl.strictCandidateCount,
  maximumReverseTurns,
  maximumMovementStrictCandidateAttempts:
    searchOptions.maximumMovementStrictCandidateAttempts,
  historicalResumeUsed: Boolean(historicalResumeCheckpoint),
  historicalFrontierCurrentHostReissued:
    historicalFrontierReissue?.currentHostStrictReplayCertified === true,
  historicalFrontierReissuedEdgeCount:
    historicalFrontierReissue?.reverseEdgeCount || 0,
  historicalFrontierReissueFreshStrictTransitionCount:
    historicalFrontierReissue?.freshStrictTransitionCount || 0,
  historicalFrontierReissueHash:
    historicalFrontierReissue?.reissueHash || "",
  historicalFrontierScenarioOverlayApplied:
    historicalScenarioOverlayAudit?.onlyScenarioSettlementOverlaid === true,
  historicalFrontierScenarioOverlayHash: historicalScenarioOverlayAudit
    ? stableGraphHash(historicalScenarioOverlayAudit)
    : "",
  historicalPrefixRecoveryApplied:
    historicalPrefixRecovery?.currentHostPrefixRecoveryCertified === true,
  historicalPrefixRecoveryRetainedEdgeCount:
    historicalPrefixRecovery?.retainedReverseEdgeCount || 0,
  historicalPrefixRecoveryRemovedEdgeCount:
    historicalPrefixRecovery?.removedReverseEdgeCount || 0,
  historicalPrefixRecoveryFreshStrictTransitionCount:
    historicalPrefixRecovery?.freshStrictTransitionCount || 0,
  historicalPrefixRecoveryHash:
    historicalPrefixRecovery?.recoveryHash || "",
  parallelExecutionUsed: parallelEnabled,
  parallelWorkerCount: parallelEnabled
    ? result.parallelExecution.workerCount
    : 0,
  parallelTaskCount: parallelEnabled
    ? result.parallelExecution.taskCount
    : 0,
  parallelMergedFrontierCount: parallelEnabled
    ? result.parallelExecution.mergedFrontierCount
    : 0,
  parallelAllOrNothingCheckpointCommit: parallelEnabled
    ? result.parallelExecution.allOrNothingCheckpointCommit
    : false,
  parallelExecutedTaskCount: parallelEnabled
    ? result.parallelExecution.executedTaskCount
    : 0,
  parallelReusedTaskCount: parallelEnabled
    ? result.parallelExecution.reusedTaskCount
    : 0,
  parallelTaskCheckpointHash: parallelEnabled
    ? parallelTaskCheckpointHash
    : "",
  parallelTaskAudits: parallelEnabled
    ? result.parallelExecution.taskAudits
    : [],
  resumeCheckpointAccepted: result.resumeCheckpointAccepted,
  reachedPriorTurnFrontierCount:
    result.search?.reachedPriorTurnFrontierCount || 0,
  deepestReversedPriorTurnCount:
    Number(deepestFrontier?.reversedPriorTurnCount || 0),
  deepestReverseEdgeCount: deepestEdges.length,
  deepestOperatorCounts: operatorCounts,
  unitRunEdgeCount: unitRunEdges.length,
  unitRunEdges: unitRunEdges.map((edge) => ({
    actorPieceKey: edge.actorPieceKey,
    activationGroupId: edge.activationGroupId,
    activationGroupPieceCount: edge.activationGroupPieceKeys.length,
    transitionActionKey: edge.transitionActionKey,
  })),
  legalDeploymentRouteCount: result.legalDeploymentRouteCount,
  fullRouteStrictReplayCertifiedCount:
    result.fullRouteStrictReplayCertifiedCount,
  deferredFrontierCount:
    result.search?.runtimeResumeCheckpoint?.frontierCount || 0,
  unresolvedCount: result.unresolvedCount,
  rejectedBranchCount: result.rejectedBranchCount,
  reportHash: result.reportHash,
};
if (checkpointOutput) {
  const target = path.resolve(checkpointOutput);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(
    result.search.runtimeResumeCheckpoint,
    null,
    2,
  )}\n`);
}
if (resultOutput) {
  const target = path.resolve(resultOutput);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(outputSummary, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(outputSummary, null, 2)}\n`);
