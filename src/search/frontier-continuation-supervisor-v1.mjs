import fs from "node:fs";
import path from "node:path";

import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_FRONTIER_CONTINUATION_SUPERVISOR_V1_SCHEMA =
  "warmachine_frontier_continuation_supervisor_v1";

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function withStatusHash(value) {
  const core = stableGraphValue({ ...value, statusHash: undefined });
  return { ...core, statusHash: stableGraphHash(core) };
}

function readStatus(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const status = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const expected = withStatusHash(status);
  if (status.schemaVersion !== WARMACHINE_FRONTIER_CONTINUATION_SUPERVISOR_V1_SCHEMA ||
      status.statusHash !== expected.statusHash) {
    throw new Error("continuation_supervisor_status_invalid");
  }
  return status;
}

function atomicWriteStatus(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const descriptor = fs.openSync(tempPath, "wx");
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(withStatusHash(value), null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(tempPath, filePath);
}

function acquireLease(lockPath, runKey) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(lockPath, `${JSON.stringify({ pid: process.pid, runKey })}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let lease = null;
      try {
        lease = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      } catch {
        throw new Error("continuation_supervisor_lease_corrupt");
      }
      if (processAlive(Number(lease.pid))) {
        throw new Error(`continuation_supervisor_lease_active:${lease.pid}`);
      }
      fs.unlinkSync(lockPath);
    }
  }
  throw new Error("continuation_supervisor_lease_acquire_failed");
}

function priorAttemptSummary(status) {
  return {
    runKey: status.runKey,
    attemptNumber: status.attemptNumber,
    state: status.state,
    pid: status.pid,
    startedAt: status.startedAt,
    heartbeatAt: status.heartbeatAt,
    finishedAt: status.finishedAt || "",
    completedTaskCount: Object.values(status.tasks || {}).filter((task) =>
      task.state === "completed").length,
    failedTaskCount: Object.values(status.tasks || {}).filter((task) =>
      task.state === "failed").length,
    statusHash: status.statusHash,
  };
}

export function startWarmachineFrontierContinuationSupervisorV1(
  statusPath,
  rawBinding = {},
) {
  if (!statusPath) return null;
  const binding = stableGraphValue(rawBinding);
  const runKey = `frontier-continuation-run-${stableGraphHash(binding, 32)}`;
  const lockPath = `${statusPath}.lock`;
  const previous = readStatus(statusPath);
  if (previous?.state === "running" && processAlive(Number(previous.pid))) {
    throw new Error(`continuation_supervisor_run_active:${previous.pid}`);
  }
  acquireLease(lockPath, runKey);
  const now = new Date().toISOString();
  const sameRun = previous?.runKey === runKey;
  let status = {
    schemaVersion: WARMACHINE_FRONTIER_CONTINUATION_SUPERVISOR_V1_SCHEMA,
    runKey,
    binding,
    attemptNumber: sameRun ? Number(previous.attemptNumber || 0) + 1 : 1,
    state: "running",
    pid: process.pid,
    startedAt: now,
    heartbeatAt: now,
    finishedAt: "",
    heartbeatCount: 0,
    recoveredInterruptedAttempt: previous?.state === "running",
    tasks: {},
    result: null,
    errorMessage: "",
    priorAttempts: [
      ...(previous?.priorAttempts || []),
      ...(previous ? [priorAttemptSummary(previous)] : []),
    ].slice(-32),
    claimBoundary: "This supervisor records parent-observed child-process liveness and terminal IPC events. It does not prove progress inside a synchronous rules action. A dead owner leaves a stale lease; a later identical run records recovery and recomputes unpublished work from the immutable ancestor checkpoint.",
  };

  const write = () => atomicWriteStatus(statusPath, status);
  const release = () => {
    try {
      const lease = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      if (Number(lease.pid) === process.pid && lease.runKey === runKey) fs.unlinkSync(lockPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  };
  write();

  const record = (event = {}) => {
    if (status.state !== "running") return;
    const eventAt = new Date().toISOString();
    status.heartbeatAt = eventAt;
    status.heartbeatCount += 1;
    if (event.taskKey) {
      const prior = status.tasks[event.taskKey] || {
        taskKey: event.taskKey,
        labelKey: event.labelKey || "",
        state: "queued",
        livenessProbeCount: 0,
      };
      status.tasks[event.taskKey] = {
        ...prior,
        labelKey: event.labelKey || prior.labelKey,
        state: event.state || prior.state,
        lastEventType: event.eventType || "heartbeat",
        lastEventAt: eventAt,
        livenessProbeCount: prior.livenessProbeCount +
          Number(event.eventType === "liveness_probe"),
        ...(event.errorMessage ? { errorMessage: String(event.errorMessage) } : {}),
      };
    }
    write();
  };

  const finish = (state, result = null, errorMessage = "") => {
    if (status.state !== "running") return;
    const nowFinished = new Date().toISOString();
    status = {
      ...status,
      state,
      heartbeatAt: nowFinished,
      finishedAt: nowFinished,
      result: result ? stableGraphValue(result) : null,
      errorMessage: String(errorMessage || ""),
    };
    write();
    release();
  };

  return {
    runKey,
    record,
    complete: (result) => finish("completed", result),
    fail: (error) => finish("failed", null, error?.message || error),
    snapshot: () => readStatus(statusPath),
  };
}
