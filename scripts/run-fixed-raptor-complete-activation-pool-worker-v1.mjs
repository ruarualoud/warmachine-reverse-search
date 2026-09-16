#!/usr/bin/env node

import fs from "node:fs";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import {
  advanceWarmachineCompleteActivationExactGraphV1,
} from "../src/search/complete-activation-exact-graph-v1.mjs";
import {
  buildWarmachineCompleteActivationShardCheckpointV1,
} from "../src/search/complete-activation-shard-merge-v1.mjs";
import { WarmachineExternalDagStore } from
  "../src/storage/external-dag-v1.mjs";

function argument(name, fallback = "") {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}

function writeAtomically(filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, value);
  fs.renameSync(temporaryPath, filePath);
}

class ConcurrentFullStateStore {
  constructor(store) {
    this.store = store;
  }

  readState(...args) {
    return this.store.readState(...args);
  }

  readContent(...args) {
    return this.store.readContent(...args);
  }

  putContent(...args) {
    return this.store.putContent(...args);
  }

  putState(state) {
    return this.store.putState(state);
  }
}

const basePlanPath = argument("base-plan");
if (!basePlanPath || typeof process.send !== "function") {
  throw new Error("complete_activation_pool_worker_parent_required");
}

const basePlan = JSON.parse(fs.readFileSync(basePlanPath, "utf8"));
const base = JSON.parse(fs.readFileSync(basePlan.baseCheckpointPath, "utf8"));
const closure = JSON.parse(fs.readFileSync(basePlan.closurePath, "utf8"));
if (base.checkpointHash !== basePlan.baseCheckpointHash) {
  throw new Error("complete_activation_pool_worker_base_changed");
}
const store = new ConcurrentFullStateStore(new WarmachineExternalDagStore(
  basePlan.storeRoot,
  {
    hostReceiptHash: basePlan.hostReceiptHash,
    sourceHash: basePlan.sourceHash,
    configHash: basePlan.configHash,
  },
));

function validatePlan(plan) {
  for (const key of [
    "baseCheckpointPath",
    "baseCheckpointHash",
    "closurePath",
    "storeRoot",
    "hostReceiptHash",
    "sourceHash",
    "configHash",
  ]) {
    if (plan[key] !== basePlan[key]) {
      throw new Error(`complete_activation_pool_worker_plan_drift:${key}`);
    }
  }
}

function runTask(planPath) {
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  validatePlan(plan);
  const shard = buildWarmachineCompleteActivationShardCheckpointV1(
    base,
    plan.selectedWorkKeys,
  );
  const startedAtMs = Date.now();
  const checkpoint = advanceWarmachineCompleteActivationExactGraphV1(
    shard,
    closure,
    store,
    { workUnitBudget: plan.selectedWorkKeys.length },
  );
  const core = stableGraphValue({
    schemaVersion: "warmachine_complete_activation_shard_worker_result_v1",
    workerKey: plan.workerKey,
    baseCheckpointHash: plan.baseCheckpointHash,
    selectedWorkKeys: plan.selectedWorkKeys,
    checkpoint,
    elapsedMs: Date.now() - startedAtMs,
  });
  const result = { ...core, resultHash: stableGraphHash(core) };
  writeAtomically(plan.outputPath, `${JSON.stringify(result)}\n`);
  return {
    workerKey: plan.workerKey,
    selectedWorkCount: plan.selectedWorkKeys.length,
    resultHash: result.resultHash,
    elapsedMs: result.elapsedMs,
  };
}

let busy = false;
process.on("message", (message) => {
  if (message?.type === "shutdown") {
    if (!busy) process.exit(0);
    return;
  }
  if (message?.type !== "run" || busy) return;
  busy = true;
  try {
    const row = runTask(message.planPath);
    process.send({ type: "task_complete", taskKey: message.taskKey, row });
  } catch (error) {
    process.send({
      type: "task_failed",
      taskKey: message.taskKey,
      error: error?.stack || String(error),
    });
  } finally {
    busy = false;
  }
});

process.send({
  type: "ready",
  baseCheckpointHash: base.checkpointHash,
  pid: process.pid,
});
