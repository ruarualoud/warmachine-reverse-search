#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import {
  advanceWarmachineCompleteActivationExactGraphV1,
  buildWarmachineCompleteActivationExactGraphReportV1,
  validateWarmachineCompleteActivationExactGraphCheckpointV1,
} from "../src/search/complete-activation-exact-graph-v1.mjs";
import {
  buildWarmachineCompleteActivationShardCheckpointV1,
  mergeWarmachineCompleteActivationShardCheckpointsV1,
} from "../src/search/complete-activation-shard-merge-v1.mjs";
import { WarmachineExternalDagStore } from
  "../src/storage/external-dag-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = fileURLToPath(import.meta.url);

function argument(name, fallback = "") {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}

function positiveInteger(name, fallback, maximum = 64) {
  const value = Number(argument(name, String(fallback)));
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`complete_activation_shards_${name}_invalid`);
  }
  return value;
}

function writeAtomically(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, value);
  fs.renameSync(temporaryPath, filePath);
}

function fileSetHash(relativePaths) {
  const hash = createHash("sha256");
  for (const relativePath of [...relativePaths].sort()) {
    hash.update(relativePath);
    hash.update(fs.readFileSync(path.join(repositoryRoot, relativePath)));
  }
  return hash.digest("hex");
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

function createStore(plan) {
  return new WarmachineExternalDagStore(plan.storeRoot, {
    hostReceiptHash: plan.hostReceiptHash,
    sourceHash: plan.sourceHash,
    configHash: plan.configHash,
  });
}

function runWorker(planPath) {
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const base = JSON.parse(fs.readFileSync(plan.baseCheckpointPath, "utf8"));
  const closure = JSON.parse(fs.readFileSync(plan.closurePath, "utf8"));
  if (base.checkpointHash !== plan.baseCheckpointHash) {
    throw new Error("complete_activation_shard_worker_base_changed");
  }
  const shard = buildWarmachineCompleteActivationShardCheckpointV1(
    base,
    plan.selectedWorkKeys,
  );
  const store = new ConcurrentFullStateStore(createStore(plan));
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
  process.stdout.write(`${JSON.stringify({
    workerKey: plan.workerKey,
    selectedWorkCount: plan.selectedWorkKeys.length,
    checkpointHash: checkpoint.checkpointHash,
    resultHash: result.resultHash,
    elapsedMs: result.elapsedMs,
  })}\n`);
}

function splitByAction(checkpoint, workerCount, workUnitsPerWorker) {
  const pending = new Set(checkpoint.workQueue || []);
  const groups = new Map();
  for (const work of checkpoint.workItems || []) {
    if (work.workKind !== "chance_response" || work.status !== "pending" ||
        !pending.has(work.workKey)) continue;
    if (!groups.has(work.actionBranchKey)) groups.set(work.actionBranchKey, []);
    groups.get(work.actionBranchKey).push(work.workKey);
  }
  const groupQueue = [...groups.values()].filter((group) => group.length);
  const assignments = Array.from({ length: workerCount }, () => []);
  let groupIndex = 0;
  for (const assignment of assignments) {
    while (assignment.length < workUnitsPerWorker && groupIndex < groupQueue.length) {
      const group = groupQueue[groupIndex];
      const needed = workUnitsPerWorker - assignment.length;
      assignment.push(...group.splice(0, needed));
      if (!group.length) groupIndex += 1;
    }
  }
  return assignments.filter((assignment) => assignment.length);
}

function spawnWorker(planPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, `--worker-plan=${planPath}`], {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`complete_activation_shard_worker_failed:${code}:${stderr}`));
    });
  });
}

function markdown(report = {}) {
  return [
    "# Raptor 单次完整激活精确搜索",
    "",
    `- Host 根合法动作分母：\`${report.rootAcceptedActionDenominator}\``,
    `- 玩家动作分母：\`${report.rootCanonicalActionDenominator}\``,
    `- 已执行随机/回应工作：\`${report.counts.completedChanceResponseWorkCount}\` / \`${report.counts.totalChanceResponseWorkCount}\``,
    `- 搜索图节点/边：\`${report.counts.nodeCount}\` / \`${report.counts.edgeCount}\``,
    `- strict 转移失败：\`${report.counts.strictTransitionFailureCount}\``,
    `- 当前 Host 有限激活图闭合：\`${report.currentHostFiniteActivationGraphComplete}\``,
    "",
    "## 未决",
    "",
    ...(report.unresolvedReasons.length
      ? report.unresolvedReasons.map((reason) => `- ${reason}`)
      : ["- 无"]),
    "",
    "## 结论边界",
    "",
    report.claimBoundary,
    "",
  ].join("\n");
}

async function runSupervisor() {
  const evidenceRootArgument = argument("evidence-root");
  if (!evidenceRootArgument) throw new Error("complete_activation_shards_evidence_root_required");
  const evidenceRoot = path.resolve(evidenceRootArgument);
  const checkpointPath = path.join(evidenceRoot, "checkpoint.json");
  const reportPath = path.join(evidenceRoot, "report.json");
  const markdownPath = path.join(evidenceRoot, "report.md");
  const closurePath = path.join(
    repositoryRoot,
    "config/warmachine-fixed-cryx-nymara-task-rule-closure-v1.json",
  );
  const base = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  const closure = JSON.parse(fs.readFileSync(closurePath, "utf8"));
  validateWarmachineCompleteActivationExactGraphCheckpointV1(base, {
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    taskLocalRuleClosureHash: closure.taskLocalRuleClosureHash,
    taskKey: closure.taskKey,
  });
  const workerCount = positiveInteger("workers", 2, 16);
  const workUnitsPerWorker = positiveInteger("work-units-per-worker", 1, 512);
  const assignments = splitByAction(base, workerCount, workUnitsPerWorker);
  if (!assignments.length) throw new Error("complete_activation_shards_no_pending_chance_work");
  const runKey = `shard-${Date.now()}-${base.checkpointHash.slice(0, 12)}`;
  const runRoot = path.join(evidenceRoot, "shards-v1", runKey);
  fs.mkdirSync(runRoot, { recursive: true });
  const plans = assignments.map((selectedWorkKeys, index) => {
    const workerKey = `${runKey}-worker-${String(index + 1).padStart(2, "0")}`;
    const plan = stableGraphValue({
      schemaVersion: "warmachine_complete_activation_shard_worker_plan_v1",
      workerKey,
      baseCheckpointPath: checkpointPath,
      baseCheckpointHash: base.checkpointHash,
      closurePath,
      storeRoot: path.join(evidenceRoot, "dag-store"),
      hostReceiptHash: base.hostReceiptHash,
      sourceHash: base.sourceHash,
      configHash: base.configHash,
      selectedWorkKeys,
      outputPath: path.join(runRoot, `${workerKey}.result.json`),
    });
    const planPath = path.join(runRoot, `${workerKey}.plan.json`);
    writeAtomically(planPath, `${JSON.stringify(plan)}\n`);
    return { plan, planPath };
  });
  const startedAtMs = Date.now();
  await Promise.all(plans.map(({ planPath }) => spawnWorker(planPath)));
  const current = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  if (current.checkpointHash !== base.checkpointHash) {
    throw new Error("complete_activation_shards_canonical_checkpoint_changed");
  }
  const results = plans.map(({ plan }) =>
    JSON.parse(fs.readFileSync(plan.outputPath, "utf8")));
  for (const result of results) {
    const core = { ...result };
    delete core.resultHash;
    if (stableGraphHash(stableGraphValue(core)) !== result.resultHash) {
      throw new Error(`complete_activation_shard_result_invalid:${result.workerKey}`);
    }
  }
  const schedulerSourceHash = fileSetHash([
    "scripts/run-fixed-raptor-complete-activation-shards-v1.mjs",
    "src/search/complete-activation-shard-merge-v1.mjs",
  ]);
  const merged = mergeWarmachineCompleteActivationShardCheckpointsV1(
    base,
    results,
    {
      runKey,
      schedulerSourceHash,
      workerResultHashes: results.map((result) => result.resultHash).sort(),
    },
  );
  const report = buildWarmachineCompleteActivationExactGraphReportV1(merged);
  const receiptCore = stableGraphValue({
    schemaVersion: "warmachine_complete_activation_shard_receipt_v1",
    runKey,
    schedulerSourceHash,
    baseCheckpointHash: base.checkpointHash,
    mergedCheckpointHash: merged.checkpointHash,
    selectedWorkKeys: assignments.flat().sort(),
    workerRows: results.map((result) => ({
      workerKey: result.workerKey,
      selectedWorkCount: result.selectedWorkKeys.length,
      resultHash: result.resultHash,
      checkpointHash: result.checkpoint.checkpointHash,
      elapsedMs: result.elapsedMs,
    })),
    elapsedMs: Date.now() - startedAtMs,
  });
  const receipt = { ...receiptCore, receiptHash: stableGraphHash(receiptCore) };
  writeAtomically(checkpointPath, `${JSON.stringify(merged)}\n`);
  writeAtomically(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeAtomically(markdownPath, `${markdown(report)}\n`);
  writeAtomically(path.join(runRoot, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    evidenceRoot,
    runRoot,
    receiptHash: receipt.receiptHash,
    baseCheckpointHash: base.checkpointHash,
    mergedCheckpointHash: merged.checkpointHash,
    workerCount: results.length,
    completedWorkCount: assignments.flat().length,
    counts: report.counts,
    elapsedMs: receipt.elapsedMs,
  }, null, 2)}\n`);
}

const workerPlan = argument("worker-plan");
if (workerPlan) runWorker(path.resolve(workerPlan));
else await runSupervisor();
