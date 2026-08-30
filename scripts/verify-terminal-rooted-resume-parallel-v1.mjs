import assert from "node:assert/strict";

import { buildWarmachineTerminalRootedResumeCheckpointV1 } from
  "../src/reverse/terminal-rooted-to-deployment-v1.mjs";
import { runWarmachineTerminalRootedResumeLayerParallelV1 } from
  "../src/reverse/terminal-rooted-resume-parallel-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";

function piece(pieceKey, sideKey, position, activated) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey,
    modelRole: "solo",
    modelType: "warrior model",
    position,
    baseSizeIn: 1.18,
    speedIn: 6,
    defense: 12,
    armor: 14,
    damage: { boxesRemaining: 5, maxBoxes: 5 },
    statusTags: [],
    attackProfiles: [],
    metadata: { upkeepsPaidThisControlPhase: [] },
    activated,
  };
}

const deployments = {
  p1_deploy: { id: "p1_deploy", x: 8, y: 24, width: 16, height: 36 },
  p2_deploy: { id: "p2_deploy", x: 40, y: 24, width: 16, height: 36 },
};
const terminalCell = {
  cellKey: "parallel-resume-focused-cell",
  goalType: "assassination",
};
const terminalState = {
  stateKey: "parallel-resume-terminal-binding",
  activeSideKey: "player2",
  phaseKey: "activation",
  turnNumber: 2,
  strictMode: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [],
  terrain: [],
  scenario: { score: { player1: 0, player2: 0 }, scoringHistory: [] },
};
function frontierState(suffix, yIn) {
  return {
    stateKey: `parallel-resume-frontier-${suffix}`,
    activeSideKey: "player2",
    phaseKey: "control",
    controlPhaseStepKey: "maintenance",
    controlPhaseProgressed: false,
    firstPlayerSideKey: "player1",
    turnNumber: 1,
    strictMode: true,
    deploymentComplete: true,
    preGameRuleChoicesComplete: true,
    board: { widthIn: 48, heightIn: 48 },
    pieces: [
      piece(`p1-mover-${suffix}`, "player1", { xIn: 20, yIn }, true),
      piece(`p2-support-${suffix}`, "player2", { xIn: 40, yIn }, false),
    ],
    terrain: [],
    scenario: { score: { player1: 0, player2: 0 }, scoringHistory: [] },
  };
}
const states = [frontierState("a", 20), frontierState("b", 28)];
const rawOptions = {
  deployments,
  firstPlayerSideKey: "player1",
  maximumReverseTurns: 2,
  maximumRouteLabels: 16,
  maximumUniqueStates: 16,
  maximumCompletedRoutes: 4,
  frontierOrder: "best_first_to_deployment",
  movementActionTypes: ["run"],
  maximumActivationDepth: 4,
  maximumActivationLabels: 16,
  maximumActivationUniqueStates: 16,
  activationFrontierOrder: "best_first_to_deployment",
  stopAfterActivationBoundaryRouteCount: 1,
  maximumActivationGroupsPerExpansion: 1,
  maximumActivationCandidatesPerExpansion: 1,
  maximumDeploymentSlotOrigins: 4,
  maximumDeploymentSlotRings: 1,
  nextSideActivationRestoreModes: ["all_alive_activated"],
  certifyFullRouteStrictReplay: false,
};
const terminalStateHash = warmachineReverseStateSemanticHashV1(terminalState);
const resumeFrontiers = [
  ...states.map((state, index) => ({
    labelKey: `parallel-resume-label-${index}`,
    state,
    stateHash: warmachineReverseStateSemanticHashV1(state),
    reverseEdges: [],
    reversedPriorTurnCount: 1,
    deploymentGeometryDebt: 5,
  })),
  {
    labelKey: "parallel-resume-label-a-alternate-history",
    state: states[0],
    stateHash: warmachineReverseStateSemanticHashV1(states[0]),
    reverseEdges: [{
      candidateKey: "parallel-resume-prior-route-a-alternate",
      operatorKey: "focused_prior_history_v1",
      strictWitness: true,
    }],
    reversedPriorTurnCount: 1,
    deploymentGeometryDebt: 5,
  },
];
const resumeCheckpoint = buildWarmachineTerminalRootedResumeCheckpointV1({
  terminalStateHash,
  terminalCell,
  deployments,
  rawOptions,
  deferredFrontiers: resumeFrontiers,
  searchProgress: {
    processedLabelCount: 3,
    expandedLabelCount: 2,
    unresolved: [{
      stageKey: "parallel_resume_seed",
      reason: "parallel_resume_seed_budget_deferred",
    }],
    rejected: [{
      stageKey: "parallel_resume_seed",
      reason: "parallel_resume_seed_strict_rejected",
    }],
  },
});

const progressEvents = [];
const taskProgressCheckpoints = [];
const result = await runWarmachineTerminalRootedResumeLayerParallelV1({
  terminalState,
  terminalCell,
  rawOptions,
  resumeCheckpoint,
  maximumWorkers: 2,
  taskTimeoutMs: 120_000,
  livenessProbeIntervalMs: 1_000,
  onWorkerProgress: (event) => progressEvents.push(event),
  onTaskProgressCheckpoint: (checkpoint) =>
    taskProgressCheckpoints.push(checkpoint),
});
assert.equal(result.ok, true, JSON.stringify(result, null, 2));
assert.equal(result.inputFrontierCount, 3);
assert.equal(result.uniqueInputStateCount, 2);
assert.equal(result.reusedExactStateExpansionCount, 1);
assert.equal(result.workerCount, 2);
assert.equal(result.taskCount, 2);
assert.equal(result.completedTaskCount, 2);
assert.equal(result.allOrNothingCheckpointCommit, true);
assert.equal(result.childWritesSharedCheckpoint, false);
assert.equal(result.unresolved.some((row) =>
  row.reason === "parallel_resume_seed_budget_deferred"), true);
assert.equal(result.rejected.some((row) =>
  row.reason === "parallel_resume_seed_strict_rejected"), true);
assert.equal(result.runtimeResumeCheckpoint.searchProgress.unresolved.some((row) =>
  row.reason === "parallel_resume_seed_budget_deferred"), true);
assert.equal(result.runtimeResumeCheckpoint.searchProgress.rejected.some((row) =>
  row.reason === "parallel_resume_seed_strict_rejected"), true);
assert.equal(result.taskAudits.every((audit) =>
  audit.workerStarted && audit.completed), true);
assert.equal(progressEvents.filter((event) => event.eventType === "started").length, 2);
assert.equal(progressEvents.some((event) =>
  event.eventType === "search_progress" &&
  event.scope === "historical_activation" &&
  event.stage === "activation_boundary_reached"), true);
assert.equal(result.legalDeploymentRouteCount, 0);
assert.equal(result.mergedFrontierCount, 6);
assert.equal(result.runtimeResumeCheckpoint.frontiers.every((frontier) =>
  frontier.reversedPriorTurnCount === 2), true);
assert.equal(result.executedTaskCount, 2);
assert.equal(result.reusedTaskCount, 0);
assert.equal(taskProgressCheckpoints.length > 2, true);
assert.equal(result.activationCheckpointEmittedCount > 0, true);
assert.equal(taskProgressCheckpoints.some((checkpoint) =>
  checkpoint.completedTaskCount === 0 &&
  checkpoint.inProgressTaskCount > 0), true);
assert.equal(taskProgressCheckpoints.some((checkpoint) =>
  checkpoint.completedTaskCount === 1), true);
assert.equal(taskProgressCheckpoints.at(-1)?.completedTaskCount, 2);
assert.equal(taskProgressCheckpoints.at(-1)?.inProgressTaskCount, 0);

const partialTaskCheckpoint = taskProgressCheckpoints.find((checkpoint) =>
  checkpoint.completedTaskCount === 1);
const resumedProgressEvents = [];
const resumedTaskCheckpoints = [];
const resumed = await runWarmachineTerminalRootedResumeLayerParallelV1({
  terminalState,
  terminalCell,
  rawOptions,
  resumeCheckpoint,
  maximumWorkers: 2,
  taskTimeoutMs: 120_000,
  taskProgressCheckpoint: partialTaskCheckpoint,
  onWorkerProgress: (event) => resumedProgressEvents.push(event),
  onTaskProgressCheckpoint: (checkpoint) =>
    resumedTaskCheckpoints.push(checkpoint),
});
assert.equal(resumed.ok, true, JSON.stringify(resumed, null, 2));
assert.equal(resumed.completedTaskCount, 2);
assert.equal(resumed.executedTaskCount, 1);
assert.equal(resumed.reusedTaskCount, 1);
assert.equal(resumed.runtimeResumeCheckpoint.checkpointHash,
  result.runtimeResumeCheckpoint.checkpointHash);
assert.equal(resumedProgressEvents.filter((event) =>
  event.eventType === "started").length, 1);
assert.equal(resumedTaskCheckpoints.at(-1)?.completedTaskCount, 2);

const activationPartialTaskCheckpoint = taskProgressCheckpoints.find((checkpoint) =>
  checkpoint.completedTaskCount === 0 &&
  checkpoint.inProgressTaskCount > 0);
const activationResumed = await runWarmachineTerminalRootedResumeLayerParallelV1({
  terminalState,
  terminalCell,
  rawOptions,
  resumeCheckpoint,
  maximumWorkers: 2,
  taskTimeoutMs: 120_000,
  taskProgressCheckpoint: activationPartialTaskCheckpoint,
});
assert.equal(activationResumed.ok, true, JSON.stringify(activationResumed, null, 2));
assert.equal(activationResumed.activationCheckpointResumeCount > 0, true);
assert.equal(activationResumed.runtimeResumeCheckpoint.checkpointHash,
  result.runtimeResumeCheckpoint.checkpointHash);

const tamperedTaskCheckpoint = structuredClone(partialTaskCheckpoint);
tamperedTaskCheckpoint.completedTasks[0].resultHash = "tampered";
await assert.rejects(
  runWarmachineTerminalRootedResumeLayerParallelV1({
    terminalState,
    terminalCell,
    rawOptions,
    resumeCheckpoint,
    maximumWorkers: 2,
    taskProgressCheckpoint: tamperedTaskCheckpoint,
  }),
  /terminal_rooted_parallel_task_checkpoint_rejected/,
);
const tamperedActivationTaskCheckpoint = structuredClone(
  activationPartialTaskCheckpoint,
);
tamperedActivationTaskCheckpoint.inProgressTasks[0]
  .activationResumeCheckpoints[Object.keys(
    tamperedActivationTaskCheckpoint.inProgressTasks[0]
      .activationResumeCheckpoints,
  )[0]].checkpointHash = "tampered";
await assert.rejects(
  runWarmachineTerminalRootedResumeLayerParallelV1({
    terminalState,
    terminalCell,
    rawOptions,
    resumeCheckpoint,
    maximumWorkers: 2,
    taskProgressCheckpoint: tamperedActivationTaskCheckpoint,
  }),
  /terminal_rooted_parallel_task_checkpoint_rejected/,
);

const noProgressState = frontierState("no-progress", 24);
noProgressState.activeSideKey = "player1";
noProgressState.turnNumber = 1;
noProgressState.stateKey = "parallel-resume-illegal-turn-one-control-start";
const failureCheckpoint = buildWarmachineTerminalRootedResumeCheckpointV1({
  terminalStateHash,
  terminalCell,
  deployments,
  rawOptions,
  deferredFrontiers: [states[0], noProgressState].map((state, index) => ({
    labelKey: `parallel-failure-label-${index}`,
    state,
    stateHash: warmachineReverseStateSemanticHashV1(state),
    reverseEdges: [],
    reversedPriorTurnCount: 1,
    deploymentGeometryDebt: 5,
  })),
});
const noProgressEvents = [];
const mixedDeadEndResult = await runWarmachineTerminalRootedResumeLayerParallelV1({
  terminalState,
  terminalCell,
  rawOptions,
  resumeCheckpoint: failureCheckpoint,
  maximumWorkers: 2,
  taskTimeoutMs: 120_000,
  onWorkerProgress: (event) => noProgressEvents.push(event),
});
assert.equal(mixedDeadEndResult.completedTaskCount, 2);
assert.equal(mixedDeadEndResult.deadEndTaskCount, 1);
assert.equal(mixedDeadEndResult.taskAudits.some((audit) =>
  audit.searchDeadEnd === true), true);
assert.equal(mixedDeadEndResult.mergedFrontierCount > 0, true);
const noProgressEvent = noProgressEvents.find((event) =>
  event.eventType === "search_progress" && event.stage === "no_layer_progress");
assert.equal(Boolean(noProgressEvent), true);
assert.equal(noProgressEvent.targetReverseTurnCount, 2);
assert.equal(noProgressEvent.reachedPriorTurnFrontierCount, 0);
assert.equal(noProgressEvent.deferredFrontierCount, 0);
assert.equal(Object.keys(noProgressEvent.unresolvedCounts || {}).length > 0, true);

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion: "verify_terminal_rooted_resume_parallel_v1",
  inputFrontierCount: result.inputFrontierCount,
  uniqueInputStateCount: result.uniqueInputStateCount,
  reusedExactStateExpansionCount: result.reusedExactStateExpansionCount,
  workerCount: result.workerCount,
  completedTaskCount: result.completedTaskCount,
  legalDeploymentRouteCount: result.legalDeploymentRouteCount,
  mergedFrontierCount: result.mergedFrontierCount,
  allOrNothingCheckpointCommit: result.allOrNothingCheckpointCommit,
  perFrontierTaskCheckpointResumeProven: true,
  perActivationLabelCheckpointResumeProven: true,
  resumedExecutedTaskCount: resumed.executedTaskCount,
  resumedReusedTaskCount: resumed.reusedTaskCount,
  activationCheckpointEmittedCount: result.activationCheckpointEmittedCount,
  activationCheckpointResumeCount:
    activationResumed.activationCheckpointResumeCount,
  workerSearchProgressEventCount: progressEvents.filter((event) =>
    event.eventType === "search_progress").length,
  semanticDeadEndDoesNotAbortBatch: true,
  noProgressDiagnosticProven: true,
  parallelExecutionHash: result.parallelExecutionHash,
}, null, 2)}\n`);
