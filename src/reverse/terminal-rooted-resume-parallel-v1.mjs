import { fork } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  auditWarmachineTerminalRootedResumeCheckpointV1,
  buildWarmachineTerminalRootedResumeCheckpointV1,
} from "./terminal-rooted-to-deployment-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";
import { WARMACHINE_TERMINAL_ROOTED_RESUME_WORKER_V1_SCHEMA } from
  "./terminal-rooted-resume-worker-v1.mjs";

export const WARMACHINE_TERMINAL_ROOTED_RESUME_PARALLEL_V1_SCHEMA =
  "warmachine_terminal_rooted_resume_parallel_v1";
export const WARMACHINE_TERMINAL_ROOTED_RESUME_TASK_CHECKPOINT_V1_SCHEMA =
  "warmachine_terminal_rooted_resume_task_checkpoint_v1";

const WORKER_PATH = fileURLToPath(new URL(
  "./terminal-rooted-resume-worker-v1.mjs",
  import.meta.url,
));

const CALLBACK_OPTION_KEYS = new Set([
  "onProgress",
  "onActivationProgress",
  "onCurrentTurnActivationProgress",
  "onControlProgress",
]);

function decodeActivationCheckpointMessage(message = {}, task = {}) {
  if (message.checkpoint) return message.checkpoint;
  if (message.checkpointEncoding !== "gzip-json-file-v1" ||
      !message.checkpointPath || !task.activationCheckpointSpoolDirectory) {
    throw new Error("terminal_rooted_activation_checkpoint_transport_invalid");
  }
  const spoolDirectory = path.resolve(task.activationCheckpointSpoolDirectory);
  const checkpointPath = path.resolve(message.checkpointPath);
  if (!checkpointPath.startsWith(`${spoolDirectory}${path.sep}`)) {
    throw new Error("terminal_rooted_activation_checkpoint_path_outside_spool");
  }
  let checkpoint;
  try {
    checkpoint = JSON.parse(gunzipSync(fs.readFileSync(checkpointPath))
      .toString("utf8"));
  } finally {
    fs.rmSync(checkpointPath, { force: true });
  }
  if (checkpoint.checkpointHash !== message.checkpointHash) {
    throw new Error("terminal_rooted_activation_checkpoint_transport_hash_mismatch");
  }
  return checkpoint;
}

function serializableSearchOptions(rawOptions = {}) {
  return stableGraphValue(Object.fromEntries(Object.entries(rawOptions).filter(([key, value]) =>
    !CALLBACK_OPTION_KEYS.has(key) && key !== "resumeCheckpoint" &&
    key !== "historicalResumeCheckpoint" && typeof value !== "function")));
}

function frontierGroupCheckpoint({
  terminalStateHash,
  terminalCell,
  deployments,
  searchOptions,
  frontiers,
  sourceSearchProgress,
}) {
  return buildWarmachineTerminalRootedResumeCheckpointV1({
    terminalStateHash,
    terminalCell,
    deployments,
    rawOptions: searchOptions,
    deferredFrontiers: frontiers,
    searchProgress: {
      ...(sourceSearchProgress || {}),
      labelKeys: frontiers.map((row) => row.labelKey),
      uniqueStateHashes: frontiers.map((row) => row.stateHash),
    },
  });
}

function groupedSearchOptions(searchOptions = {}, frontierCount = 1) {
  const factor = Math.max(1, Number(frontierCount || 1));
  const scaled = { ...searchOptions };
  for (const key of ["maximumRouteLabels", "maximumCompletedRoutes"]) {
    const value = Number(searchOptions[key] || 0);
    if (value > 0) scaled[key] = value * factor;
  }
  const witnessLimit = Number(searchOptions.stopAfterCompletedRouteCount || 0);
  if (witnessLimit > 0) {
    scaled.stopAfterCompletedRouteCount = witnessLimit * factor;
  }
  return stableGraphValue(scaled);
}

function runWorker(task, rawOptions = {}) {
  const taskTimeoutMs = Math.max(1_000, Math.floor(Number(
    rawOptions.taskTimeoutMs ?? 2 * 60 * 60 * 1_000,
  )));
  const livenessProbeIntervalMs = Math.max(1_000, Math.floor(Number(
    rawOptions.livenessProbeIntervalMs ?? 10_000,
  )));
  return new Promise((resolve, reject) => {
    const worker = fork(WORKER_PATH, [], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WARMACHINE_TERMINAL_ROOTED_RESUME_CHILD: "1",
      },
      serialization: "advanced",
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    let settled = false;
    let startedAt = 0;
    let livenessProbeCount = 0;
    let activationCheckpointEmittedCount = 0;
    const startedProcessAt = Date.now();
    const timeout = setTimeout(() => {
      worker.kill("SIGTERM");
      finish(new Error(`terminal_rooted_resume_worker_timeout:${task.labelKey}`));
    }, taskTimeoutMs);
    const liveness = setInterval(() => {
      if (settled) return;
      livenessProbeCount += 1;
      rawOptions.onWorkerProgress?.({
        eventType: "liveness_probe",
        taskKey: task.taskKey,
        labelKey: task.labelKey,
        state: startedAt > 0 ? "running" : "starting",
        livenessProbeCount,
      });
    }, livenessProbeIntervalMs);
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(liveness);
      if (error) reject(error);
      else resolve(value);
    }
    worker.on("message", (message) => {
      if (message?.taskKey !== task.taskKey || message?.labelKey !== task.labelKey) {
        worker.kill("SIGTERM");
        finish(new Error(`terminal_rooted_resume_worker_binding_mismatch:${
          task.labelKey}`));
        return;
      }
      if (message.messageType === "started") {
        startedAt = Date.now();
        rawOptions.onWorkerProgress?.({
          eventType: "started",
          taskKey: task.taskKey,
          labelKey: task.labelKey,
          state: "running",
        });
        return;
      }
      if (message.messageType === "progress" && message.progress) {
        rawOptions.onWorkerProgress?.({
          eventType: "search_progress",
          taskKey: task.taskKey,
          labelKey: task.labelKey,
          state: "running",
          ...message.progress,
        });
        return;
      }
      if (message.messageType === "activation_checkpoint" &&
          message.resumeKey && (message.checkpoint || message.checkpointPath)) {
        activationCheckpointEmittedCount += 1;
        try {
          const checkpoint = decodeActivationCheckpointMessage(message, task);
          rawOptions.onActivationCheckpoint?.({
            taskKey: task.taskKey,
            labelKey: task.labelKey,
            resumeKey: message.resumeKey,
            stage: String(message.stage || ""),
            checkpoint,
          });
        } catch (error) {
          worker.kill("SIGTERM");
          finish(error);
        }
        return;
      }
      if (message.messageType === "failed") {
        finish(new Error(`terminal_rooted_resume_worker_failed:${
          task.labelKey}:${message.errorMessage || "unknown"}`));
        return;
      }
      if (message.messageType !== "completed" || !message.search) {
        worker.kill("SIGTERM");
        finish(new Error(`terminal_rooted_resume_worker_message_invalid:${
          task.labelKey}`));
        return;
      }
      finish(null, {
        labelKey: task.labelKey,
        search: message.search,
        deadEndDiagnostic: message.deadEndDiagnostic || null,
        audit: {
          taskKey: task.taskKey,
          labelKey: task.labelKey,
          workerStarted: startedAt > 0,
          queueAndStartupMs: Math.max(0, startedAt - startedProcessAt),
          executionAndReturnMs: Math.max(
            0,
            Date.now() - (startedAt || startedProcessAt),
          ),
          livenessProbeCount,
          activationCheckpointEmittedCount,
          activationCheckpointResumeCount: Object.keys(
            task.activationResumeCheckpoints || {},
          ).length,
          completed: true,
          searchDeadEnd: Boolean(message.deadEndDiagnostic),
        },
      });
    });
    worker.once("error", (error) => finish(error));
    worker.once("exit", (code) => {
      if (!settled) finish(new Error(
        `terminal_rooted_resume_worker_exit:${task.labelKey}:${code}`,
      ));
    });
    worker.send(task, (error) => {
      if (error) finish(new Error(
        `terminal_rooted_resume_worker_send_failed:${task.labelKey}:${error.message}`,
      ));
    });
  });
}

function uniqueRows(rows = []) {
  const values = new Map();
  for (const row of rows) values.set(stableGraphHash(row), row);
  return [...values.values()];
}

function taskResultRecord(result = {}) {
  const core = stableGraphValue({
    taskKey: String(result.audit?.taskKey || ""),
    labelKey: String(result.labelKey || result.audit?.labelKey || ""),
    result,
  });
  return {
    ...core,
    resultHash: stableGraphHash(core),
  };
}

function taskActivationCheckpointRecord(record = {}) {
  const core = stableGraphValue({
    taskKey: String(record.taskKey || ""),
    labelKey: String(record.labelKey || ""),
    activationResumeCheckpoints: record.activationResumeCheckpoints || {},
  });
  return {
    ...core,
    recordHash: stableGraphHash(core),
  };
}

function buildTaskCheckpoint({
  sourceCheckpointHash = "",
  targetReverseTurnCount = 0,
  tasks = [],
  results = [],
  inProgressTasks = [],
} = {}) {
  const taskKeys = tasks.map((task) => task.taskKey).sort();
  const completedTasks = results.map(taskResultRecord).sort((left, right) =>
    left.taskKey.localeCompare(right.taskKey));
  const resumableTasks = inProgressTasks.map(taskActivationCheckpointRecord)
    .sort((left, right) => left.taskKey.localeCompare(right.taskKey));
  const core = stableGraphValue({
    schemaVersion:
      WARMACHINE_TERMINAL_ROOTED_RESUME_TASK_CHECKPOINT_V1_SCHEMA,
    sourceCheckpointHash: String(sourceCheckpointHash || ""),
    targetReverseTurnCount: Number(targetReverseTurnCount || 0),
    taskCount: taskKeys.length,
    taskKeys,
    completedTaskCount: completedTasks.length,
    completedTasks,
    inProgressTaskCount: resumableTasks.length,
    inProgressTasks: resumableTasks,
  });
  return {
    ...core,
    checkpointHash: stableGraphHash(core),
  };
}

export function auditWarmachineTerminalRootedResumeTaskCheckpointV1(
  checkpoint = {},
  {
    sourceCheckpointHash = "",
    targetReverseTurnCount = 0,
    tasks = [],
  } = {},
) {
  const issues = [];
  const expectedTaskKeys = tasks.map((task) => task.taskKey).sort();
  if (checkpoint.schemaVersion !==
      WARMACHINE_TERMINAL_ROOTED_RESUME_TASK_CHECKPOINT_V1_SCHEMA) {
    issues.push("terminal_rooted_task_checkpoint_schema_mismatch");
  }
  if (checkpoint.sourceCheckpointHash !== sourceCheckpointHash) {
    issues.push("terminal_rooted_task_checkpoint_source_mismatch");
  }
  if (Number(checkpoint.targetReverseTurnCount || 0) !==
      Number(targetReverseTurnCount || 0)) {
    issues.push("terminal_rooted_task_checkpoint_depth_mismatch");
  }
  if (stableGraphHash(checkpoint.taskKeys || []) !==
      stableGraphHash(expectedTaskKeys)) {
    issues.push("terminal_rooted_task_checkpoint_task_set_mismatch");
  }
  const { checkpointHash: _checkpointHash, ...checkpointCore } = checkpoint;
  if (stableGraphHash(stableGraphValue(checkpointCore)) !==
      checkpoint.checkpointHash) {
    issues.push("terminal_rooted_task_checkpoint_hash_mismatch");
  }
  const expectedTasks = new Map(tasks.map((task) => [task.taskKey, task]));
  const completedTasks = Array.isArray(checkpoint.completedTasks)
    ? checkpoint.completedTasks
    : [];
  const seenTaskKeys = new Set();
  for (const record of completedTasks) {
    const { resultHash: _resultHash, ...recordCore } = record;
    const expectedTask = expectedTasks.get(record.taskKey);
    if (seenTaskKeys.has(record.taskKey)) {
      issues.push("terminal_rooted_task_checkpoint_duplicate_task");
    }
    seenTaskKeys.add(record.taskKey);
    if (!expectedTask || expectedTask.labelKey !== record.labelKey) {
      issues.push("terminal_rooted_task_checkpoint_task_binding_mismatch");
    }
    if (stableGraphHash(stableGraphValue(recordCore)) !== record.resultHash) {
      issues.push("terminal_rooted_task_checkpoint_result_hash_mismatch");
    }
    if (record.result?.search?.resumeCheckpoint?.accepted !== true ||
        record.result?.audit?.completed !== true) {
      issues.push("terminal_rooted_task_checkpoint_result_incomplete");
    }
  }
  const inProgressTasks = Array.isArray(checkpoint.inProgressTasks)
    ? checkpoint.inProgressTasks
    : [];
  const seenInProgressTaskKeys = new Set();
  for (const record of inProgressTasks) {
    const { recordHash: _recordHash, ...recordCore } = record;
    const expectedTask = expectedTasks.get(record.taskKey);
    if (seenInProgressTaskKeys.has(record.taskKey)) {
      issues.push("terminal_rooted_task_checkpoint_duplicate_in_progress_task");
    }
    seenInProgressTaskKeys.add(record.taskKey);
    if (!expectedTask || expectedTask.labelKey !== record.labelKey) {
      issues.push("terminal_rooted_task_checkpoint_in_progress_binding_mismatch");
    }
    if (seenTaskKeys.has(record.taskKey)) {
      issues.push("terminal_rooted_task_checkpoint_completed_and_in_progress");
    }
    if (stableGraphHash(stableGraphValue(recordCore)) !== record.recordHash) {
      issues.push("terminal_rooted_task_checkpoint_in_progress_hash_mismatch");
    }
    for (const [resumeKey, activationCheckpoint] of Object.entries(
      record.activationResumeCheckpoints || {},
    )) {
      const {
        checkpointHash: _activationCheckpointHash,
        ...activationCheckpointCore
      } = activationCheckpoint || {};
      if (resumeKey !== activationCheckpoint?.resumeKey) {
        issues.push("terminal_rooted_task_checkpoint_activation_key_mismatch");
      }
      if (stableGraphHash(stableGraphValue(activationCheckpointCore)) !==
          activationCheckpoint?.checkpointHash) {
        issues.push("terminal_rooted_task_checkpoint_activation_hash_mismatch");
      }
    }
  }
  if (Number(checkpoint.taskCount || 0) !== expectedTaskKeys.length ||
      Number(checkpoint.completedTaskCount || 0) !== completedTasks.length ||
      Number(checkpoint.inProgressTaskCount || 0) !== inProgressTasks.length) {
    issues.push("terminal_rooted_task_checkpoint_count_mismatch");
  }
  return stableGraphValue({
    ok: issues.length === 0,
    issues: [...new Set(issues)],
    checkpointHash: String(checkpoint.checkpointHash || ""),
    completedTaskCount: completedTasks.length,
    inProgressTaskCount: inProgressTasks.length,
  });
}

export async function runWarmachineTerminalRootedResumeLayerParallelV1({
  terminalState = {},
  terminalCell = {},
  rawOptions = {},
  resumeCheckpoint = {},
  maximumWorkers = 2,
  taskTimeoutMs,
  livenessProbeIntervalMs,
  onWorkerProgress,
  taskProgressCheckpoint = null,
  onTaskProgressCheckpoint,
} = {}) {
  const terminalStateHash = warmachineReverseStateSemanticHashV1(terminalState);
  const deployments = rawOptions.deployments || {};
  const searchOptions = serializableSearchOptions(rawOptions);
  const activationCheckpointSpoolDirectory = path.resolve(
    process.cwd(),
    ".scratch/warmachine-terminal-rooted-activation-checkpoint-spool-v1",
  );
  const audit = auditWarmachineTerminalRootedResumeCheckpointV1(
    resumeCheckpoint,
    { terminalStateHash, terminalCell, deployments, rawOptions: searchOptions },
  );
  if (!audit.ok) {
    throw new Error(`terminal_rooted_parallel_resume_checkpoint_rejected:${
      audit.issues.join(",")}`);
  }
  const frontiers = resumeCheckpoint.frontiers || [];
  const reverseDepths = [...new Set(frontiers.map((frontier) =>
    Number(frontier.reversedPriorTurnCount || 0)))];
  if (reverseDepths.length !== 1) {
    throw new Error("terminal_rooted_parallel_frontiers_must_share_reverse_depth");
  }
  const targetReverseTurnCount = Math.max(0, Number(
    searchOptions.maximumReverseTurns,
  ));
  if (targetReverseTurnCount !== reverseDepths[0] + 1) {
    throw new Error("terminal_rooted_parallel_requires_exactly_one_reverse_layer");
  }
  const frontierGroups = new Map();
  for (const frontier of frontiers) {
    if (!frontierGroups.has(frontier.stateHash)) {
      frontierGroups.set(frontier.stateHash, []);
    }
    frontierGroups.get(frontier.stateHash).push(frontier);
  }
  const groupedFrontiers = [...frontierGroups.entries()].map(([
    stateHash,
    rows,
  ]) => ({
    stateHash,
    frontiers: rows.slice().sort((left, right) =>
      left.labelKey.localeCompare(right.labelKey)),
  })).sort((left, right) => left.stateHash.localeCompare(right.stateHash));
  const workerCount = Math.max(1, Math.min(
    groupedFrontiers.length,
    Math.floor(Number(maximumWorkers || 1)),
  ));
  const tasks = groupedFrontiers.map((group) => {
    const taskSearchOptions = groupedSearchOptions(
      searchOptions,
      group.frontiers.length,
    );
    const checkpoint = frontierGroupCheckpoint({
      terminalStateHash,
      terminalCell,
      deployments,
      searchOptions: taskSearchOptions,
      frontiers: group.frontiers,
      sourceSearchProgress: resumeCheckpoint.searchProgress,
    });
    const taskKey = `terminal-rooted-resume-task-${stableGraphHash({
      checkpointHash: checkpoint.checkpointHash,
      targetReverseTurnCount,
    }, 32)}`;
    return {
      schemaVersion: WARMACHINE_TERMINAL_ROOTED_RESUME_WORKER_V1_SCHEMA,
      taskKey,
      labelKey: `terminal-rooted-state-group-${stableGraphHash({
        stateHash: group.stateHash,
        sourceLabelKeys: group.frontiers.map((frontier) => frontier.labelKey),
      }, 32)}`,
      sourceLabelKeys: group.frontiers.map((frontier) => frontier.labelKey),
      activationCheckpointSpoolDirectory,
      terminalState,
      terminalCell,
      searchOptions: taskSearchOptions,
      resumeCheckpoint: checkpoint,
    };
  });
  const results = [];
  const inProgressByTask = new Map();
  let reusedTaskCount = 0;
  if (taskProgressCheckpoint) {
    const taskCheckpointAudit =
      auditWarmachineTerminalRootedResumeTaskCheckpointV1(
        taskProgressCheckpoint,
        {
          sourceCheckpointHash: resumeCheckpoint.checkpointHash,
          targetReverseTurnCount,
          tasks,
        },
      );
    if (!taskCheckpointAudit.ok) {
      throw new Error(`terminal_rooted_parallel_task_checkpoint_rejected:${
        taskCheckpointAudit.issues.join(",")}`);
    }
    for (const record of taskProgressCheckpoint.completedTasks || []) {
      results.push({
        ...record.result,
        audit: {
          ...record.result.audit,
          reusedFromTaskCheckpoint: true,
        },
      });
    }
    for (const record of taskProgressCheckpoint.inProgressTasks || []) {
      inProgressByTask.set(record.taskKey, {
        taskKey: record.taskKey,
        labelKey: record.labelKey,
        activationResumeCheckpoints:
          stableGraphValue(record.activationResumeCheckpoints || {}),
      });
    }
    reusedTaskCount = results.length;
  }
  const completedTaskKeys = new Set(results.map((result) =>
    result.audit?.taskKey));
  const pendingTasks = tasks.filter((task) => !completedTaskKeys.has(task.taskKey))
    .map((task) => ({
      ...task,
      activationResumeCheckpoints:
        inProgressByTask.get(task.taskKey)?.activationResumeCheckpoints || {},
    }));
  const publishTaskProgress = () => {
    const checkpoint = buildTaskCheckpoint({
      sourceCheckpointHash: resumeCheckpoint.checkpointHash,
      targetReverseTurnCount,
      tasks,
      results,
      inProgressTasks: [...inProgressByTask.values()],
    });
    onTaskProgressCheckpoint?.(checkpoint);
  };
  for (let offset = 0; offset < pendingTasks.length; offset += workerCount) {
    const chunk = pendingTasks.slice(offset, offset + workerCount);
    const settled = await Promise.allSettled(chunk.map((task) =>
      runWorker(task, {
        taskTimeoutMs,
        livenessProbeIntervalMs,
        onWorkerProgress,
        onActivationCheckpoint: (event) => {
          const existing = inProgressByTask.get(task.taskKey) || {
            taskKey: task.taskKey,
            labelKey: task.labelKey,
            activationResumeCheckpoints: {},
          };
          existing.activationResumeCheckpoints[event.resumeKey] =
            event.checkpoint;
          inProgressByTask.set(task.taskKey, existing);
          publishTaskProgress();
        },
      }).then((result) => {
        results.push(result);
        inProgressByTask.delete(task.taskKey);
        publishTaskProgress();
        return result;
      })));
    const failure = settled.find((row) => row.status === "rejected");
    if (failure) throw failure.reason;
  }
  const taskOrder = new Map(tasks.map((task, index) => [task.taskKey, index]));
  results.sort((left, right) =>
    Number(taskOrder.get(left.audit?.taskKey) ?? Number.MAX_SAFE_INTEGER) -
      Number(taskOrder.get(right.audit?.taskKey) ?? Number.MAX_SAFE_INTEGER));

  const mergedFrontiers = new Map();
  for (const result of results) {
    for (const frontier of result.search.runtimeResumeCheckpoint?.frontiers || []) {
      const existing = mergedFrontiers.get(frontier.labelKey);
      if (existing && (existing.stateHash !== frontier.stateHash ||
          stableGraphHash(existing.reverseEdges) !== stableGraphHash(frontier.reverseEdges))) {
        throw new Error(`terminal_rooted_parallel_frontier_merge_conflict:${
          frontier.labelKey}`);
      }
      mergedFrontiers.set(frontier.labelKey, frontier);
    }
  }
  const routes = uniqueRows(results.flatMap((result) => result.search.routes || []));
  const unresolved = uniqueRows(results.flatMap((result) =>
    result.search.unresolved || []));
  const rejected = uniqueRows(results.flatMap((result) =>
    result.search.rejected || []));
  const runtimeDiagnostics = uniqueRows(results.flatMap((result) =>
    result.search.runtimeDiagnostics || []));
  const runtimeReachedPriorTurnFrontiers = uniqueRows(results.flatMap((result) =>
    result.search.runtimeReachedPriorTurnFrontiers || []));
  const sourceProgress = resumeCheckpoint.searchProgress || {};
  const resultProgress = results.map((result) =>
    result.search.runtimeResumeCheckpoint?.searchProgress || {});
  const sumProgressDelta = (key) => Number(sourceProgress[key] || 0) +
    resultProgress.reduce((sum, progress) => sum + Math.max(
      0,
      Number(progress[key] || 0) - Number(sourceProgress[key] || 0),
    ), 0);
  const runtimeResumeCheckpoint = buildWarmachineTerminalRootedResumeCheckpointV1({
    terminalStateHash,
    terminalCell,
    deployments,
    rawOptions: searchOptions,
    deferredFrontiers: [...mergedFrontiers.values()].sort((left, right) =>
      left.labelKey.localeCompare(right.labelKey)),
    searchProgress: {
      labelKeys: [...new Set(resultProgress.flatMap((progress) =>
        progress.labelKeys || []))],
      uniqueStateHashes: [...new Set(resultProgress.flatMap((progress) =>
        progress.uniqueStateHashes || []))],
      processedLabelCount: sumProgressDelta("processedLabelCount"),
      expandedLabelCount: sumProgressDelta("expandedLabelCount"),
      initialFrontier: uniqueRows(resultProgress.flatMap((progress) =>
        progress.initialFrontier || [])),
      reachedPriorTurnFrontiers: uniqueRows(resultProgress.flatMap((progress) =>
        progress.reachedPriorTurnFrontiers || [])),
      runtimeReachedPriorTurnFrontiers,
      unresolved,
      rejected,
      runtimeDiagnostics,
      witnessStopTriggered: resultProgress.some((progress) =>
        progress.witnessStopTriggered === true),
      witnessStopDeferredLabelCount:
        sumProgressDelta("witnessStopDeferredLabelCount"),
      emittedDeploymentFailureCount:
        sumProgressDelta("emittedDeploymentFailureCount"),
    },
  });
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_TERMINAL_ROOTED_RESUME_PARALLEL_V1_SCHEMA,
    sourceCheckpointHash: resumeCheckpoint.checkpointHash,
    targetReverseTurnCount,
    inputFrontierCount: frontiers.length,
    uniqueInputStateCount: groupedFrontiers.length,
    reusedExactStateExpansionCount: frontiers.length - groupedFrontiers.length,
    workerCount,
    taskCount: tasks.length,
    completedTaskCount: results.length,
    executedTaskCount: results.length - reusedTaskCount,
    reusedTaskCount,
    activationCheckpointEmittedCount: results.reduce((sum, result) =>
      sum + Number(result.audit?.activationCheckpointEmittedCount || 0), 0),
    activationCheckpointResumeCount: results.reduce((sum, result) =>
      sum + Number(result.audit?.activationCheckpointResumeCount || 0), 0),
    deadEndTaskCount: results.filter((result) =>
      Boolean(result.deadEndDiagnostic)).length,
    mergedFrontierCount: runtimeResumeCheckpoint.frontierCount,
    reachedPriorTurnFrontierCount: runtimeReachedPriorTurnFrontiers.length,
    legalDeploymentRouteCount: routes.length,
    fullRouteStrictReplayCertifiedCount: routes.filter((route) =>
      route.fullRouteStrictReplayCertified === true).length,
    unresolvedCount: unresolved.length,
    rejectedBranchCount: rejected.length,
    oracleIsolationPassed: results.every((result) =>
      result.search.oracleIsolationAudit?.passed === true),
    taskAudits: results.map((result) => result.audit).sort((left, right) =>
      left.labelKey.localeCompare(right.labelKey)),
    childReportHashes: results.map((result) => result.search.reportHash).sort(),
    mergedCheckpointHash: runtimeResumeCheckpoint.checkpointHash,
    allOrNothingCheckpointCommit: true,
    childWritesSharedCheckpoint: false,
    claimBoundary: "Each child expands one independently hash-audited exact-state group through exactly one previous player turn under the same Host, search-source closure and reverse options. Route labels with the same exact state share the existing state-hash expansion cache, remain distinct labels, and receive their original per-route label/completion budget through proportional group scaling. Children do not write shared authoritative state. After each fully processed activation label, a child may write one private content-hash-bound transport spool file and send only its path and hash; the parent reads, validates and deletes that file before atomically folding the activation queue snapshot into the task-progress checkpoint, so restart repeats at most the currently executing atomic activation label. A Host enumeration or strict transition is never split. The parent may also persist each completed child and reuse only exact task identities after restart; neither provisional cache becomes the merged search checkpoint. Strictly rejected or unresolved search dead ends complete normally with their disposition ledger; only process, timeout, transport or protocol failure aborts the all-or-nothing merged checkpoint. The parent verifies exact label/state/edge convergence, then emits one merged checkpoint. This changes scheduling and recovery only; every omitted branch remains unresolved and no route gains strategy or training authority.",
  });
  return {
    ...core,
    routes,
    unresolved,
    rejected,
    runtimeDiagnostics,
    runtimeReachedPriorTurnFrontiers,
    runtimeResumeCheckpoint,
    workerResults: results,
    parallelExecutionHash: stableGraphHash(core),
    ok: results.length === tasks.length &&
      (runtimeResumeCheckpoint.frontierCount > 0 || routes.length > 0),
  };
}
