#!/usr/bin/env node

import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import {
  buildWarmachineCompleteActivationExactGraphReportV1,
  validateWarmachineCompleteActivationExactGraphCheckpointV1,
} from "../src/search/complete-activation-exact-graph-v1.mjs";
import {
  mergeWarmachineCompleteActivationShardCheckpointsV1,
} from "../src/search/complete-activation-shard-merge-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const poolWorkerScriptPath = path.join(
  repositoryRoot,
  "scripts/run-fixed-raptor-complete-activation-pool-worker-v1.mjs",
);

function argument(name, fallback = "") {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}

function positiveInteger(name, fallback, maximum) {
  const value = Number(argument(name, String(fallback)));
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`complete_activation_rolling_${name}_invalid`);
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

function validateResult(result, plan) {
  const core = { ...result };
  delete core.resultHash;
  if (stableGraphHash(stableGraphValue(core)) !== result.resultHash) {
    throw new Error(`complete_activation_rolling_result_invalid:${plan.workerKey}`);
  }
  if (result.workerKey !== plan.workerKey ||
      result.baseCheckpointHash !== plan.baseCheckpointHash ||
      stableGraphHash(result.selectedWorkKeys) !==
        stableGraphHash(plan.selectedWorkKeys)) {
    throw new Error(`complete_activation_rolling_result_plan_mismatch:${plan.workerKey}`);
  }
  return result;
}

function buildChunks(checkpoint, chunkSize, workUnitBudget) {
  const pending = new Set(checkpoint.workQueue || []);
  const groups = new Map();
  for (const work of checkpoint.workItems || []) {
    if (work.workKind !== "chance_response" || work.status !== "pending" ||
        !pending.has(work.workKey)) continue;
    if (!groups.has(work.actionBranchKey)) groups.set(work.actionBranchKey, []);
    groups.get(work.actionBranchKey).push(work.workKey);
  }
  const chunks = [];
  let selectedCount = 0;
  for (const [actionBranchKey, workKeys] of groups) {
    for (let offset = 0;
      offset < workKeys.length && selectedCount < workUnitBudget;
      offset += chunkSize) {
      const selectedWorkKeys = workKeys.slice(
        offset,
        Math.min(offset + chunkSize, offset + workUnitBudget - selectedCount),
      );
      if (!selectedWorkKeys.length) break;
      chunks.push({ actionBranchKey, selectedWorkKeys });
      selectedCount += selectedWorkKeys.length;
    }
    if (selectedCount >= workUnitBudget) break;
  }
  return chunks;
}

function createPoolWorker(basePlanPath, poolIndex) {
  const child = fork(
    poolWorkerScriptPath,
    [`--base-plan=${basePlanPath}`],
    {
      cwd: repositoryRoot,
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  let stderr = "";
  let current = null;
  let readyResolve;
  let readyReject;
  let exitResolve;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const exited = new Promise((resolve) => { exitResolve = resolve; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("message", (message) => {
    if (message?.type === "ready") {
      readyResolve(message);
      return;
    }
    if (!current || message?.taskKey !== current.taskKey) return;
    const active = current;
    current = null;
    if (message.type === "task_complete") active.resolve(message.row);
    else if (message.type === "task_failed") {
      active.reject(new Error(message.error));
    }
  });
  child.on("error", (error) => {
    readyReject(error);
    if (current) {
      current.reject(error);
      current = null;
    }
  });
  child.on("exit", (code) => {
    const error = code === 0 ? null : new Error(
      `complete_activation_pool_worker_failed:${poolIndex}:${code}:${stderr}`,
    );
    if (error) readyReject(error);
    if (error && current) current.reject(error);
    current = null;
    exitResolve({ code, error });
  });
  return {
    async run(planPath, taskKey) {
      await ready;
      if (current) {
        throw new Error(`complete_activation_pool_worker_busy:${poolIndex}`);
      }
      return new Promise((resolve, reject) => {
        current = { taskKey, resolve, reject };
        child.send({ type: "run", planPath, taskKey });
      });
    },
    async close() {
      await ready;
      child.send({ type: "shutdown" });
      const outcome = await exited;
      if (outcome.error) throw outcome.error;
    },
  };
}

function markdown(report = {}, receipt = {}) {
  return [
    "# Raptor 单次完整激活精确搜索",
    "",
    `- 本批动态 worker 上限：\`${receipt.workerLimit}\``,
    `- 本批已发布工作：\`${receipt.completedWorkCount}\` / \`${receipt.selectedWorkCount}\``,
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

function createRun({ evidenceRoot, base, closurePath, workerLimit, chunkSize,
  workUnitBudget }) {
  const chunks = buildChunks(base, chunkSize, workUnitBudget);
  if (!chunks.length) {
    throw new Error("complete_activation_rolling_no_pending_chance_work");
  }
  const runKey = `rolling-${Date.now()}-${base.checkpointHash.slice(0, 12)}`;
  const runRoot = path.join(evidenceRoot, "rolling-shards-v1", runKey);
  fs.mkdirSync(runRoot, { recursive: true });
  const baseCheckpointPath = path.join(runRoot, "base-checkpoint.json");
  writeAtomically(baseCheckpointPath, `${JSON.stringify(base)}\n`);
  const plans = chunks.map((chunk, index) => {
    const workerKey = `${runKey}-chunk-${String(index + 1).padStart(4, "0")}`;
    const plan = stableGraphValue({
      schemaVersion: "warmachine_complete_activation_shard_worker_plan_v1",
      workerKey,
      baseCheckpointPath,
      baseCheckpointHash: base.checkpointHash,
      closurePath,
      storeRoot: path.join(evidenceRoot, "dag-store"),
      hostReceiptHash: base.hostReceiptHash,
      sourceHash: base.sourceHash,
      configHash: base.configHash,
      selectedWorkKeys: chunk.selectedWorkKeys,
      outputPath: path.join(runRoot, `${workerKey}.result.json`),
    });
    const planPath = path.join(runRoot, `${workerKey}.plan.json`);
    writeAtomically(planPath, `${JSON.stringify(plan)}\n`);
    return { ...chunk, plan, planPath };
  });
  const manifestCore = stableGraphValue({
    schemaVersion: "warmachine_complete_activation_rolling_manifest_v1",
    runKey,
    evidenceRoot,
    baseCheckpointHash: base.checkpointHash,
    workerLimit,
    chunkSize,
    selectedWorkCount: chunks.reduce(
      (sum, chunk) => sum + chunk.selectedWorkKeys.length,
      0,
    ),
    plans: plans.map(({ actionBranchKey, plan, planPath }) => ({
      actionBranchKey,
      workerKey: plan.workerKey,
      selectedWorkKeys: plan.selectedWorkKeys,
      planPath,
      outputPath: plan.outputPath,
    })),
  });
  const manifest = {
    ...manifestCore,
    manifestHash: stableGraphHash(manifestCore),
  };
  writeAtomically(
    path.join(runRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { runKey, runRoot, plans, manifest };
}

async function executePlans(plans, workerLimit, progressPath, onProgress) {
  const results = new Array(plans.length);
  let nextIndex = 0;
  let completedCount = 0;
  let failed = null;
  const poolSize = Math.min(workerLimit, plans.length);
  const workers = Array.from(
    { length: poolSize },
    (_, index) => createPoolWorker(plans[0].planPath, index + 1),
  );

  async function slot(worker) {
    while (!failed) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= plans.length) return;
      const entry = plans[index];
      try {
        if (!fs.existsSync(entry.plan.outputPath)) {
          await worker.run(entry.planPath, entry.plan.workerKey);
        }
        const result = validateResult(
          JSON.parse(fs.readFileSync(entry.plan.outputPath, "utf8")),
          entry.plan,
        );
        results[index] = result;
        completedCount += 1;
        const completedWorkCount = results.reduce(
          (sum, row) => sum + (row?.selectedWorkKeys?.length || 0),
          0,
        );
        writeAtomically(progressPath, `${JSON.stringify(stableGraphValue({
          schemaVersion: "warmachine_complete_activation_rolling_progress_v1",
          completedChunkCount: completedCount,
          totalChunkCount: plans.length,
          completedWorkCount,
          activeSlotLimit: workerLimit,
          updatedAtMs: Date.now(),
        }), null, 2)}\n`);
        onProgress?.({
          results: results.filter(Boolean),
          completedChunkCount: completedCount,
          completedWorkCount,
        });
      } catch (error) {
        failed = error;
      }
    }
  }

  await Promise.all(workers.map((worker) => slot(worker)));
  await Promise.all(workers.map((worker) => worker.close()));
  if (failed) throw failed;
  return results;
}

function publishSnapshot({
  base,
  checkpointPath,
  reportPath,
  markdownPath,
  runKey,
  runRoot,
  schedulerSourceHash,
  manifest,
  workerLimit,
  chunkSize,
  startedAtMs,
  publicationIndex,
  expectedCheckpointHash,
  results,
  final,
}) {
  const current = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  if (current.checkpointHash !== expectedCheckpointHash) {
    throw new Error("complete_activation_rolling_canonical_checkpoint_changed");
  }
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
  const completedWorkCount = results.reduce(
    (sum, result) => sum + result.selectedWorkKeys.length,
    0,
  );
  const receiptCore = stableGraphValue({
    schemaVersion: "warmachine_complete_activation_rolling_receipt_v1",
    runKey,
    schedulerSourceHash,
    manifestHash: manifest.manifestHash,
    publicationIndex,
    final,
    baseCheckpointHash: base.checkpointHash,
    previousPublishedCheckpointHash: expectedCheckpointHash,
    mergedCheckpointHash: merged.checkpointHash,
    workerLimit,
    chunkSize,
    chunkCount: results.length,
    completedWorkCount,
    selectedWorkCount: manifest.selectedWorkCount,
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
  writeAtomically(markdownPath, `${markdown(report, receipt)}\n`);
  writeAtomically(
    path.join(
      runRoot,
      `receipt-${String(publicationIndex).padStart(4, "0")}.json`,
    ),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  if (final) {
    writeAtomically(
      path.join(runRoot, "receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
  }
  return { merged, report, receipt };
}

async function main() {
  const evidenceRootArgument = argument("evidence-root");
  if (!evidenceRootArgument) {
    throw new Error("complete_activation_rolling_evidence_root_required");
  }
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
  const workerLimit = positiveInteger("workers", 6, 12);
  const chunkSize = positiveInteger("chunk-size", 4, 64);
  const workUnitBudget = positiveInteger("work-unit-budget", 4096, 4096);
  const checkpointWorkUnits = positiveInteger(
    "checkpoint-work-units",
    96,
    4096,
  );
  const { runKey, runRoot, plans, manifest } = createRun({
    evidenceRoot,
    base,
    closurePath,
    workerLimit,
    chunkSize,
    workUnitBudget,
  });
  const startedAtMs = Date.now();
  const schedulerSourceHash = fileSetHash([
    "scripts/run-fixed-raptor-complete-activation-rolling-shards-v1.mjs",
    "scripts/run-fixed-raptor-complete-activation-pool-worker-v1.mjs",
    "src/search/complete-activation-shard-merge-v1.mjs",
  ]);
  let publicationIndex = 0;
  let publishedWorkCount = 0;
  let publishedCheckpointHash = base.checkpointHash;
  let latestPublication = null;
  const publishProgress = ({ results, completedWorkCount }) => {
    if (completedWorkCount - publishedWorkCount < checkpointWorkUnits) return;
    publicationIndex += 1;
    latestPublication = publishSnapshot({
      base,
      checkpointPath,
      reportPath,
      markdownPath,
      runKey,
      runRoot,
      schedulerSourceHash,
      manifest,
      workerLimit,
      chunkSize,
      startedAtMs,
      publicationIndex,
      expectedCheckpointHash: publishedCheckpointHash,
      results,
      final: false,
    });
    publishedWorkCount = completedWorkCount;
    publishedCheckpointHash = latestPublication.merged.checkpointHash;
  };
  const results = await executePlans(
    plans,
    workerLimit,
    path.join(runRoot, "progress.json"),
    publishProgress,
  );
  publicationIndex += 1;
  latestPublication = publishSnapshot({
    base,
    checkpointPath,
    reportPath,
    markdownPath,
    runKey,
    runRoot,
    schedulerSourceHash,
    manifest,
    workerLimit,
    chunkSize,
    startedAtMs,
    publicationIndex,
    expectedCheckpointHash: publishedCheckpointHash,
    results,
    final: true,
  });
  const { merged, report, receipt } = latestPublication;
  process.stdout.write(`${JSON.stringify({
    ok: true,
    evidenceRoot,
    runRoot,
    receiptHash: receipt.receiptHash,
    baseCheckpointHash: base.checkpointHash,
    mergedCheckpointHash: merged.checkpointHash,
    workerLimit,
    chunkSize,
    chunkCount: plans.length,
    completedWorkCount: manifest.selectedWorkCount,
    counts: report.counts,
    elapsedMs: receipt.elapsedMs,
  }, null, 2)}\n`);
}

await main();
