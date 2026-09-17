#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const serialRunnerPath = path.join(
  repositoryRoot,
  "scripts/run-fixed-raptor-complete-activation-v1.mjs",
);
const chanceRunnerPath = path.join(
  repositoryRoot,
  "scripts/run-fixed-raptor-complete-activation-bounded-epochs-v1.mjs",
);

function argument(name, fallback = "") {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}

function nonnegativeInteger(name, fallback, maximum) {
  const value = Number(argument(name, String(fallback)));
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new Error(`complete_activation_full_supervisor_${name}_invalid`);
  }
  return value;
}

function positiveInteger(name, fallback, maximum) {
  const value = nonnegativeInteger(name, fallback, maximum);
  if (value < 1) {
    throw new Error(`complete_activation_full_supervisor_${name}_invalid`);
  }
  return value;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function processIsAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function freeDiskGiB(targetPath) {
  const stats = fs.statfsSync(targetPath);
  return Number(stats.bavail * stats.bsize) / (1024 ** 3);
}

function checkpointMetrics(checkpoint = {}) {
  const pendingKeys = new Set(checkpoint.workQueue || []);
  let pendingActionWorkCount = 0;
  let pendingChanceResponseWorkCount = 0;
  for (const work of checkpoint.workItems || []) {
    if (work.status !== "pending" || !pendingKeys.has(work.workKey)) continue;
    if (work.workKind === "action") pendingActionWorkCount += 1;
    if (work.workKind === "chance_response") {
      pendingChanceResponseWorkCount += 1;
    }
  }
  return {
    checkpointHash: String(checkpoint.checkpointHash || ""),
    completedWorkUnitCount:
      Number(checkpoint.counts?.completedWorkUnitCount || 0),
    nodeCount: Number(checkpoint.counts?.nodeCount || 0),
    edgeCount: Number(checkpoint.counts?.edgeCount || 0),
    pendingNodeCount: Number(checkpoint.nodeQueue?.length || 0),
    pendingActionWorkCount,
    pendingChanceResponseWorkCount,
    unresolvedRowCount: Number(checkpoint.unresolvedRows?.length || 0),
    strictTransitionFailureCount:
      Number(checkpoint.counts?.strictTransitionFailureCount || 0),
    searchFinished: checkpoint.searchFinished === true,
    currentHostFiniteActivationGraphComplete:
      checkpoint.currentHostFiniteActivationGraphComplete === true,
  };
}

function readCheckpoint(checkpointPath) {
  return JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
}

function latestPoolProgress(evidenceRoot) {
  const rollingRoot = path.join(evidenceRoot, "rolling-shards-v1");
  if (!fs.existsSync(rollingRoot)) return null;
  let latest = null;
  for (const name of fs.readdirSync(rollingRoot)) {
    if (!name.startsWith("rolling-")) continue;
    const progressPath = path.join(rollingRoot, name, "progress.json");
    if (!fs.existsSync(progressPath)) continue;
    try {
      const progress = JSON.parse(fs.readFileSync(progressPath, "utf8"));
      if (!latest || Number(progress.updatedAtMs || 0) >
          Number(latest.updatedAtMs || 0)) {
        latest = { runKey: name, ...progress };
      }
    } catch {
      // A writer may be between its temporary write and atomic rename.
    }
  }
  return latest;
}

function emit(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({
    event,
    at: new Date().toISOString(),
    ...fields,
  })}\n`);
}

function acquireLock(lockPath) {
  const lock = {
    schemaVersion: "warmachine_complete_activation_full_supervisor_lock_v1",
    pid: process.pid,
    hostname: os.hostname(),
    startedAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, {
      flag: "wx",
    });
    return;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    throw new Error("complete_activation_full_supervisor_lock_unreadable");
  }
  if (existing.hostname === os.hostname() && processIsAlive(existing.pid)) {
    throw new Error(
      `complete_activation_full_supervisor_already_running:${existing.pid}`,
    );
  }
  fs.renameSync(lockPath, `${lockPath}.stale-${Date.now()}`);
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, {
    flag: "wx",
  });
}

async function waitForPredecessor(pid, heartbeatSeconds) {
  while (processIsAlive(pid)) {
    emit("full_activation_waiting_for_predecessor", { predecessorPid: pid });
    await sleep(heartbeatSeconds * 1000);
  }
}

async function runChild({ scriptPath, args, env, stage, evidenceRoot,
  checkpointPath, heartbeatSeconds }) {
  const child = spawn(process.execPath, [scriptPath, ...args], {
    cwd: repositoryRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  const heartbeat = setInterval(() => {
    let metrics = {};
    try {
      metrics = checkpointMetrics(readCheckpoint(checkpointPath));
    } catch (error) {
      metrics = { checkpointReadError: String(error?.message || error) };
    }
    emit("full_activation_heartbeat", {
      stage,
      childPid: child.pid,
      freeDiskGiB: Number(freeDiskGiB(evidenceRoot).toFixed(2)),
      ...metrics,
      poolProgress: stage === "chance_epoch"
        ? latestPoolProgress(evidenceRoot)
        : null,
    });
  }, heartbeatSeconds * 1000);
  heartbeat.unref();
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  clearInterval(heartbeat);
  if (code !== 0) {
    throw new Error(`complete_activation_full_supervisor_${stage}_failed:${code}`);
  }
}

async function main() {
  const evidenceRootArgument = argument("evidence-root");
  const sourceSnapshotArgument = argument("source-snapshot");
  if (!evidenceRootArgument) {
    throw new Error(
      "complete_activation_full_supervisor_evidence_root_required",
    );
  }
  if (!sourceSnapshotArgument) {
    throw new Error(
      "complete_activation_full_supervisor_source_snapshot_required",
    );
  }
  const evidenceRoot = path.resolve(evidenceRootArgument);
  const sourceSnapshotPath = path.resolve(sourceSnapshotArgument);
  const checkpointPath = path.join(evidenceRoot, "checkpoint.json");
  const lockPath = path.join(evidenceRoot, "full-supervisor.lock.json");
  const workers = positiveInteger("workers", 6, 12);
  const chunkSize = positiveInteger("chunk-size", 4, 64);
  const chanceEpochWorkUnitBudget = positiveInteger(
    "chance-epoch-work-unit-budget",
    256,
    512,
  );
  const checkpointWorkUnits = positiveInteger(
    "checkpoint-work-units",
    96,
    512,
  );
  const serialEpochWorkUnitBudget = positiveInteger(
    "serial-epoch-work-unit-budget",
    24,
    256,
  );
  const minimumFreeGiB = positiveInteger("minimum-free-gib", 8, 128);
  const heartbeatSeconds = positiveInteger("heartbeat-seconds", 60, 3600);
  const maxCycles = nonnegativeInteger("max-cycles", 0, 1000000);
  const waitForPid = nonnegativeInteger("wait-for-pid", 0, 99999999);

  if (!fs.existsSync(checkpointPath)) {
    throw new Error("complete_activation_full_supervisor_checkpoint_missing");
  }
  if (!fs.existsSync(sourceSnapshotPath)) {
    throw new Error("complete_activation_full_supervisor_source_snapshot_missing");
  }
  if (waitForPid) await waitForPredecessor(waitForPid, heartbeatSeconds);
  acquireLock(lockPath);

  let cycleIndex = 0;
  try {
    while (maxCycles === 0 || cycleIndex < maxCycles) {
      const before = checkpointMetrics(readCheckpoint(checkpointPath));
      if (before.searchFinished) {
        emit("full_activation_completed", { cycleIndex, ...before });
        return;
      }
      const freeBefore = freeDiskGiB(evidenceRoot);
      if (freeBefore < minimumFreeGiB) {
        throw new Error(
          `complete_activation_full_supervisor_disk_guard:${freeBefore.toFixed(2)}`,
        );
      }
      cycleIndex += 1;
      const stage = before.pendingChanceResponseWorkCount > 0
        ? "chance_epoch"
        : "decision_action_epoch";
      emit("full_activation_cycle_started", {
        cycleIndex,
        stage,
        freeDiskGiB: Number(freeBefore.toFixed(2)),
        ...before,
      });
      if (stage === "chance_epoch") {
        await runChild({
          scriptPath: chanceRunnerPath,
          args: [
            `--evidence-root=${evidenceRoot}`,
            `--workers=${workers}`,
            `--chunk-size=${chunkSize}`,
            `--epoch-work-unit-budget=${chanceEpochWorkUnitBudget}`,
            `--checkpoint-work-units=${checkpointWorkUnits}`,
            `--minimum-free-gib=${minimumFreeGiB}`,
            "--max-epochs=1",
          ],
          env: {},
          stage,
          evidenceRoot,
          checkpointPath,
          heartbeatSeconds,
        });
      } else {
        await runChild({
          scriptPath: serialRunnerPath,
          args: [`--work-units=${serialEpochWorkUnitBudget}`],
          env: {
            WARMACHINE_RAPTOR_ACTION_SOURCE_SNAPSHOT: sourceSnapshotPath,
            WARMACHINE_RAPTOR_COMPLETE_ACTIVATION_OUTPUT: evidenceRoot,
          },
          stage,
          evidenceRoot,
          checkpointPath,
          heartbeatSeconds,
        });
      }
      const after = checkpointMetrics(readCheckpoint(checkpointPath));
      if (after.checkpointHash === before.checkpointHash) {
        throw new Error("complete_activation_full_supervisor_no_progress");
      }
      emit("full_activation_cycle_completed", {
        cycleIndex,
        stage,
        freeDiskGiB: Number(freeDiskGiB(evidenceRoot).toFixed(2)),
        before,
        after,
      });
    }
    emit("full_activation_cycle_budget_exhausted", {
      cycleIndex,
      ...checkpointMetrics(readCheckpoint(checkpointPath)),
    });
  } finally {
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      if (lock.pid === process.pid && lock.hostname === os.hostname()) {
        fs.unlinkSync(lockPath);
      }
    } catch {
      // Preserve the original failure if lock cleanup cannot complete.
    }
  }
}

await main();
