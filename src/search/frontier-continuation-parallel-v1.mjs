import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  finalizeWarmachineStrictFrontierContinuationBatchV1,
  prepareWarmachineStrictFrontierContinuationBatchV1,
} from "./frontier-continuation-batch-v1.mjs";
import { startWarmachineFrontierContinuationSupervisorV1 } from
  "./frontier-continuation-supervisor-v1.mjs";
import { WARMACHINE_FRONTIER_CONTINUATION_WORKER_V1_SCHEMA } from
  "./frontier-continuation-worker-v1.mjs";

export const WARMACHINE_FRONTIER_CONTINUATION_PARALLEL_V1_SCHEMA =
  "warmachine_frontier_continuation_parallel_v1";

const WORKER_PATH = fileURLToPath(new URL(
  "./frontier-continuation-worker-v1.mjs",
  import.meta.url,
));

function runWorker(
  entry,
  continuationOptions,
  workerPolicy,
  taskTimeoutMs,
  livenessProbeIntervalMs,
  onSupervisorEvent,
) {
  const taskKey = `continuation-task-${stableGraphHash({
    labelKey: entry.labelKey,
    continuationOptions,
    workerPolicy,
  }, 32)}`;
  const startedAt = Date.now();
  let startSignalAt = 0;
  return new Promise((resolve, reject) => {
    const worker = fork(WORKER_PATH, [], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WARMACHINE_FRONTIER_CONTINUATION_CHILD: "1",
      },
      serialization: "advanced",
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    let settled = false;
    let livenessProbeCount = 0;
    let timer = null;
    let livenessTimer = null;
    const emitSupervisorEvent = (event) => {
      onSupervisorEvent?.({ taskKey, labelKey: entry.labelKey, ...event });
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(livenessTimer);
      reject(error);
    };
    timer = setTimeout(() => {
      worker.kill("SIGTERM");
      try {
        emitSupervisorEvent({
          eventType: "timeout",
          state: "failed",
          errorMessage: `continuation_worker_timeout:${entry.labelKey}`,
        });
      } catch (error) {
        fail(error);
        return;
      }
      fail(new Error(`continuation_worker_timeout:${entry.labelKey}`));
    }, taskTimeoutMs);
    livenessTimer = setInterval(() => {
      if (settled) return;
      livenessProbeCount += 1;
      try {
        emitSupervisorEvent({
          eventType: "liveness_probe",
          state: startSignalAt > 0 ? "running" : "starting",
        });
      } catch (error) {
        worker.kill("SIGTERM");
        fail(error);
      }
    }, livenessProbeIntervalMs);
    try {
      emitSupervisorEvent({ eventType: "spawned", state: "starting" });
    } catch (error) {
      worker.kill("SIGTERM");
      fail(error);
      return;
    }
    worker.on("message", (message) => {
      if (message?.taskKey !== taskKey || message?.labelKey !== entry.labelKey) {
        worker.kill("SIGTERM");
        fail(new Error(`continuation_worker_message_binding_mismatch:${entry.labelKey}`));
        return;
      }
      if (message.messageType === "started") {
        startSignalAt = Date.now();
        try {
          emitSupervisorEvent({ eventType: "started", state: "running" });
        } catch (error) {
          worker.kill("SIGTERM");
          fail(error);
        }
        return;
      }
      if (message.messageType === "failed") {
        try {
          emitSupervisorEvent({
            eventType: "failed",
            state: "failed",
            errorMessage: message.errorMessage || "unknown",
          });
        } catch (error) {
          fail(error);
          return;
        }
        fail(new Error(
          `continuation_worker_failed:${entry.labelKey}:${message.errorMessage || "unknown"}`,
        ));
        return;
      }
      if (message.messageType !== "completed" || !message.report) {
        worker.kill("SIGTERM");
        fail(new Error(`continuation_worker_message_invalid:${entry.labelKey}`));
        return;
      }
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(livenessTimer);
      try {
        emitSupervisorEvent({ eventType: "completed", state: "completed" });
      } catch (error) {
        reject(error);
        return;
      }
      resolve({
        report: message.report,
        audit: {
          taskKey,
          labelKey: entry.labelKey,
          workerStarted: startSignalAt > 0,
          queueAndStartupMs: Math.max(0, startSignalAt - startedAt),
          executionAndReturnMs: Math.max(0, Date.now() - (startSignalAt || startedAt)),
          livenessProbeCount,
          completed: true,
        },
      });
    });
    worker.once("error", (error) => {
      try {
        emitSupervisorEvent({
          eventType: "process_error",
          state: "failed",
          errorMessage: error.message,
        });
      } catch (supervisorError) {
        fail(supervisorError);
        return;
      }
      fail(error);
    });
    worker.once("exit", (code) => {
      if (!settled) {
        try {
          emitSupervisorEvent({
            eventType: "premature_exit",
            state: "failed",
            errorMessage: `continuation_worker_exit:${entry.labelKey}:${code}`,
          });
        } catch (error) {
          fail(error);
          return;
        }
        fail(new Error(`continuation_worker_exit:${entry.labelKey}:${code}`));
      }
    });
    worker.send({
      schemaVersion: WARMACHINE_FRONTIER_CONTINUATION_WORKER_V1_SCHEMA,
      taskKey,
      entry,
      continuationOptions,
      policyModuleUrl: workerPolicy.moduleUrl,
      policyFactoryExportName: workerPolicy.factoryExportName,
      policyConfig: workerPolicy.config,
    }, (error) => {
      if (error) fail(new Error(
        `continuation_worker_send_failed:${entry.labelKey}:${error.message}`,
      ));
    });
  });
}

export async function runWarmachineStrictFrontierContinuationBatchParallelV1(
  ancestorReport = {},
  ancestorRuntimeCheckpoint = {},
  restoredEntries = [],
  rawOptions = {},
) {
  const prepared = prepareWarmachineStrictFrontierContinuationBatchV1(
    ancestorReport,
    ancestorRuntimeCheckpoint,
    restoredEntries,
    rawOptions,
  );
  const workerPolicy = {
    moduleUrl: String(rawOptions.workerPolicy?.moduleUrl || ""),
    factoryExportName: String(rawOptions.workerPolicy?.factoryExportName || ""),
    config: stableGraphValue(rawOptions.workerPolicy?.config || {}),
  };
  if (!workerPolicy.moduleUrl.startsWith("file:") || !workerPolicy.factoryExportName) {
    throw new Error("continuation_parallel_local_worker_policy_required");
  }
  const maximumWorkers = Math.max(1, Math.floor(Number(rawOptions.maximumWorkers ?? 2)));
  const taskTimeoutMs = Math.max(1_000, Math.floor(Number(
    rawOptions.taskTimeoutMs ?? 15 * 60 * 1_000,
  )));
  const livenessProbeIntervalMs = Math.max(100, Math.floor(Number(
    rawOptions.livenessProbeIntervalMs ?? 5_000,
  )));
  const continuationOptions = {
    routeKey: ancestorReport.routeKey,
    perspectiveSideKey: ancestorReport.perspectiveSideKey,
    continuationDepthIncrement: prepared.continuationDepthIncrement,
    maximumEvaluatedStatesPerContinuation: prepared.maximumEvaluatedStatesPerContinuation,
    lowProbabilityThreshold: prepared.threshold,
  };
  const supervisor = startWarmachineFrontierContinuationSupervisorV1(
    String(rawOptions.supervisorStatusPath || ""),
    {
      ancestorReportHash: ancestorReport.reportHash,
      ancestorRuntimeCheckpointHash: ancestorRuntimeCheckpoint.checkpointHash,
      selectedLabelKeys: prepared.selected.map((entry) => entry.labelKey),
      continuationOptions,
      maximumWorkers,
      taskTimeoutMs,
      livenessProbeIntervalMs,
      workerPolicy: {
        moduleUrl: workerPolicy.moduleUrl,
        factoryExportName: workerPolicy.factoryExportName,
        configHash: stableGraphHash(workerPolicy.config),
      },
      callerBinding: stableGraphValue(rawOptions.supervisorBinding || {}),
    },
  );
  const results = [];
  let batch = null;
  try {
    for (let offset = 0; offset < prepared.selected.length; offset += maximumWorkers) {
      const chunk = prepared.selected.slice(offset, offset + maximumWorkers);
      const settled = await Promise.allSettled(chunk.map((entry) => runWorker(
        entry,
        continuationOptions,
        workerPolicy,
        taskTimeoutMs,
        livenessProbeIntervalMs,
        (event) => supervisor?.record(event),
      )));
      const rejected = settled.find((row) => row.status === "rejected");
      if (rejected) throw rejected.reason;
      results.push(...settled.map((row) => row.value));
    }
    batch = finalizeWarmachineStrictFrontierContinuationBatchV1(
      prepared,
      results.map((row) => row.report),
    );
    supervisor?.complete({
      batchHash: batch.batchHash,
      reportHash: batch.reportHash,
      runtimeCheckpointHash: batch.runtimeCheckpointHash,
      completedTaskCount: results.length,
    });
  } catch (error) {
    supervisor?.fail(error);
    throw error;
  }
  const supervisorStatus = supervisor?.snapshot() || null;
  const parallelCore = {
    schemaVersion: WARMACHINE_FRONTIER_CONTINUATION_PARALLEL_V1_SCHEMA,
    batchHash: batch.batchHash,
    maximumWorkers,
    taskTimeoutMs,
    livenessProbeIntervalMs,
    taskCount: results.length,
    completedTaskCount: results.filter((row) => row.audit.completed).length,
    workerPolicy: {
      moduleUrl: workerPolicy.moduleUrl,
      factoryExportName: workerPolicy.factoryExportName,
      configHash: stableGraphHash(workerPolicy.config),
    },
    taskAudits: results.map((row) => row.audit).sort((left, right) =>
      left.labelKey.localeCompare(right.labelKey)),
    supervision: supervisorStatus ? {
      runKey: supervisorStatus.runKey,
      attemptNumber: supervisorStatus.attemptNumber,
      state: supervisorStatus.state,
      heartbeatCount: supervisorStatus.heartbeatCount,
      recoveredInterruptedAttempt: supervisorStatus.recoveredInterruptedAttempt,
      statusHash: supervisorStatus.statusHash,
    } : null,
    claimBoundary: "Child workers evaluate disjoint, already-validated immutable frontier labels under the same process-level Host loader as the parent. They never write the external DAG. The parent waits for every selected task, fails the batch on timeout/error, then performs one canonical stitch and one later single-writer checkpoint commit. Optional supervisor leases and periodic parent-observed liveness probes detect dead or silently lost processes and leave a restart record; they do not prove progress inside one synchronous rules action.",
  };
  return {
    ...batch,
    parallelExecution: {
      ...parallelCore,
      parallelExecutionHash: stableGraphHash(stableGraphValue(parallelCore)),
    },
  };
}
