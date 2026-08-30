import fs from "node:fs";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { searchWarmachineTerminalRootedToDeploymentV1 } from
  "./terminal-rooted-to-deployment-v1.mjs";

export const WARMACHINE_TERMINAL_ROOTED_RESUME_WORKER_V1_SCHEMA =
  "warmachine_terminal_rooted_resume_worker_v1";

function dispositionCounts(rows = []) {
  const counts = new Map();
  for (const row of rows) {
    const key = [row.stageKey, row.reason].filter(Boolean).join(":") || "unknown";
    counts.set(key, Number(counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12));
}

function noLayerProgressDiagnostic(search = {}, targetReverseTurnCount = 0) {
  const reached = search.runtimeReachedPriorTurnFrontiers || [];
  const deferred = search.runtimeResumeCheckpoint?.frontiers || [];
  return {
    targetReverseTurnCount,
    legalDeploymentRouteCount: Number(search.legalDeploymentRouteCount || 0),
    reachedPriorTurnFrontierCount: reached.length,
    reachedReverseDepths: [...new Set(reached.map((frontier) =>
      Number(frontier.reversedPriorTurnCount || 0)))].sort((left, right) => left - right),
    deferredFrontierCount: deferred.length,
    deferredReverseDepths: [...new Set(deferred.map((frontier) =>
      Number(frontier.reversedPriorTurnCount || 0)))].sort((left, right) => left - right),
    processedLabelCount: Number(search.processedLabelCount || 0),
    expandedLabelCount: Number(search.expandedLabelCount || 0),
    unresolvedCounts: dispositionCounts(search.unresolved),
    rejectedCounts: dispositionCounts(search.rejected),
  };
}

function writeActivationCheckpointTransportFile(task = {}, event = {}) {
  const spoolDirectory = path.resolve(String(
    task.activationCheckpointSpoolDirectory || "",
  ));
  if (!task.activationCheckpointSpoolDirectory ||
      !event.checkpoint?.checkpointHash) {
    throw new Error("terminal_rooted_activation_checkpoint_spool_invalid");
  }
  fs.mkdirSync(spoolDirectory, { recursive: true });
  const checkpointPayload = gzipSync(
    Buffer.from(JSON.stringify(event.checkpoint)),
    { level: 1 },
  );
  const basename = `${task.taskKey}-${event.checkpoint.checkpointHash}.json.gz`;
  const targetPath = path.join(spoolDirectory, basename);
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, checkpointPayload);
  fs.renameSync(temporaryPath, targetPath);
  return targetPath;
}

async function executeTask(task, emit) {
  if (task.schemaVersion !== WARMACHINE_TERMINAL_ROOTED_RESUME_WORKER_V1_SCHEMA) {
    throw new Error("terminal_rooted_resume_worker_schema_mismatch");
  }
  if (!task.resumeCheckpoint || task.resumeCheckpoint.frontierCount < 1) {
    throw new Error("terminal_rooted_resume_worker_requires_frontier_group");
  }
  await emit({
    messageType: "started",
    taskKey: task.taskKey,
    labelKey: task.labelKey,
  });
  const pendingProgressMessages = [];
  const queueProgress = (scope, event = {}) => {
    if (!["activation_expansion_ready", "activation_boundary_reached",
      "activation_expansion_ledger_ready", "activation_label_queue_ready",
      "activation_checkpoint_build_started", "activation_checkpoint_build_ready",
      "activation_checkpoint_published", "processing_label", "search_complete"]
      .includes(event.stage)) return;
    pendingProgressMessages.push(Promise.resolve(emit({
      messageType: "progress",
      taskKey: task.taskKey,
      labelKey: task.labelKey,
      progress: {
        scope,
        stage: event.stage,
        sideKey: String(event.sideKey || ""),
        depth: event.depth ?? null,
        selectedGroupKey: String(event.selectedGroups?.[0]?.groupKey || ""),
        selectedOperatorKey: String(
          event.selectedCandidates?.[0]?.operatorKey || "",
        ),
        selectedActionType: String(
          event.selectedCandidates?.[0]?.actionType || "",
        ),
        candidateCount: event.candidateCount ?? null,
        rejectedCount: event.rejectedCount ?? null,
        unresolvedReasons: event.unresolvedReasons || [],
        processedLabelCount: event.processedLabelCount ?? null,
        completedRouteCount: event.completedRouteCount ?? null,
      },
    })));
  };
  const queueActivationCheckpoint = (event = {}) => {
    if (!event.resumeKey || !event.checkpoint) return;
    const checkpointPath = writeActivationCheckpointTransportFile(task, event);
    pendingProgressMessages.push(Promise.resolve(emit({
      messageType: "activation_checkpoint",
      taskKey: task.taskKey,
      labelKey: task.labelKey,
      resumeKey: event.resumeKey,
      stage: String(event.stage || ""),
      checkpointEncoding: "gzip-json-file-v1",
      checkpointPath,
      checkpointHash: event.checkpoint.checkpointHash,
    })));
  };
  const search = searchWarmachineTerminalRootedToDeploymentV1(
    task.terminalState,
    task.terminalCell,
    {
      ...(task.searchOptions || {}),
      resumeCheckpoint: task.resumeCheckpoint,
      activationResumeCheckpoints: task.activationResumeCheckpoints || {},
      onActivationCheckpoint: queueActivationCheckpoint,
      onProgress: (event) => queueProgress("terminal_to_deployment", event),
      onActivationProgress: (event) =>
        queueProgress("historical_activation", event),
    },
  );
  await Promise.all(pendingProgressMessages);
  if (search.resumeCheckpoint?.accepted !== true) {
    throw new Error(`terminal_rooted_resume_worker_checkpoint_rejected:${
      task.labelKey}`);
  }
  const targetReverseTurnCount = Number(
    task.searchOptions?.maximumReverseTurns || 0,
  );
  const targetFrontiers = search.runtimeResumeCheckpoint?.frontiers || [];
  const reachedTarget = targetFrontiers.some((frontier) =>
    Number(frontier.reversedPriorTurnCount || 0) === targetReverseTurnCount);
  let deadEndDiagnostic = null;
  if (search.legalDeploymentRouteCount <= 0 && !reachedTarget) {
    deadEndDiagnostic = noLayerProgressDiagnostic(search, targetReverseTurnCount);
    await emit({
      messageType: "progress",
      taskKey: task.taskKey,
      labelKey: task.labelKey,
      progress: {
        scope: "terminal_to_deployment",
        stage: "no_layer_progress",
        ...deadEndDiagnostic,
      },
    });
  }
  await emit({
    messageType: "completed",
    taskKey: task.taskKey,
    labelKey: task.labelKey,
    search,
    deadEndDiagnostic,
  });
}

if (!isMainThread) {
  await executeTask(workerData || {}, async (message) => parentPort.postMessage(message));
} else if (process.env.WARMACHINE_TERMINAL_ROOTED_RESUME_CHILD === "1") {
  process.once("message", async (task) => {
    const emit = (message) => new Promise((resolve, reject) => {
      process.send(message, (error) => error ? reject(error) : resolve());
    });
    try {
      await executeTask(task || {}, emit);
      process.disconnect();
    } catch (error) {
      try {
        await emit({
          messageType: "failed",
          taskKey: task?.taskKey,
          labelKey: task?.labelKey,
          errorMessage: String(error?.message || error),
        });
      } catch {
        process.stderr.write(`${error?.stack || error}\n`);
      }
      process.exitCode = 1;
      process.disconnect();
    }
  });
}
