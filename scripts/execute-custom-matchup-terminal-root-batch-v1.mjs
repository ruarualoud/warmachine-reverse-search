#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let stableGraphHash;
let stableGraphValue;
let summarizeWarmachineMatchupTerminalRootBatchV1;
let buildWarmachineMatchupSourceUnresolvedTerminalAdapterV1;
let buildWarmachineMatchupFixedRoundTerminalTaskAdapterV1;
let buildWarmachineMatchupScoreTerminalTaskAdapterV1;
let buildWarmachineMatchupSimultaneousTerminalTaskAdapterV1;
let buildWarmachineMatchupAssassinationTerminalTaskAdapterV1;
let auditWarmachineMatchupTerminalPartitionCapabilityV1;
let warmachineMatchupTerminalPartitionCapabilityAuditRequiredV1;
let executeWarmachineMatchupTerminalTaskBatchV1;
let warmachineConstructionHost;
let warmachineHost;

async function loadRuntimeModules(progress) {
  const typedFacts = await import("../src/graph/typed-facts-v2.mjs");
  ({ stableGraphHash, stableGraphValue } = typedFacts);
  progress("runtime_module_loaded", { module: "typed_facts" });
  ({ summarizeWarmachineMatchupTerminalRootBatchV1 } =
    await import("../src/matchup/matchup-terminal-root-batch-v1.mjs"));
  progress("runtime_module_loaded", { module: "terminal_root_batch" });
  ({ executeWarmachineMatchupTerminalTaskBatchV1 } =
    await import("../src/matchup/matchup-terminal-task-execution-batch-v1.mjs"));
  progress("runtime_module_loaded", { module: "task_execution_batch" });
  ({ auditWarmachineMatchupTerminalPartitionCapabilityV1,
    warmachineMatchupTerminalPartitionCapabilityAuditRequiredV1 } =
    await import("../src/matchup/matchup-terminal-partition-capability-audit-v1.mjs"));
  progress("runtime_module_loaded", { module: "partition_capability_audit" });
  ({ buildWarmachineMatchupSourceUnresolvedTerminalAdapterV1 } =
    await import("../src/matchup/matchup-terminal-source-resolution-materializer-v1.mjs"));
  progress("runtime_module_loaded", { module: "source_unresolved_adapter" });
  ({ buildWarmachineMatchupFixedRoundTerminalTaskAdapterV1 } =
    await import("../src/matchup/matchup-fixed-round-terminal-task-materializer-v1.mjs"));
  progress("runtime_module_loaded", { module: "fixed_round_adapter" });
  ({ buildWarmachineMatchupScoreTerminalTaskAdapterV1 } =
    await import("../src/matchup/matchup-score-terminal-task-materializer-v1.mjs"));
  progress("runtime_module_loaded", { module: "score_adapter" });
  ({ buildWarmachineMatchupSimultaneousTerminalTaskAdapterV1 } =
    await import("../src/matchup/matchup-simultaneous-terminal-task-materializer-v1.mjs"));
  progress("runtime_module_loaded", { module: "simultaneous_adapter" });
  ({ buildWarmachineMatchupAssassinationTerminalTaskAdapterV1 } =
    await import("../src/matchup/matchup-assassination-terminal-task-materializer-v1.mjs"));
  progress("runtime_module_loaded", { module: "assassination_adapter" });
  ({ warmachineConstructionHost } =
    await import("../src/warmachine-construction-host-runtime.mjs"));
  progress("runtime_module_loaded", { module: "construction_host" });
  ({ warmachineHost } = await import("../src/warmachine-host-runtime.mjs"));
  progress("runtime_module_loaded", { module: "rules_host" });
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(reverseDirectory,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1"));
const maximumTasks = Math.max(0, Math.floor(Number(process.argv.find((argument) =>
  argument.startsWith("--maximum-tasks="))?.slice("--maximum-tasks=".length) || 16)));
const requestedShards = process.argv.find((argument) =>
  argument.startsWith("--shards="))?.slice("--shards=".length);
const progressLogPath = process.argv.find((argument) =>
  argument.startsWith("--progress-log="))?.slice("--progress-log=".length) || "";
function progress(stage, detail = {}) {
  if (!progressLogPath) return;
  fs.mkdirSync(path.dirname(progressLogPath), { recursive: true });
  fs.appendFileSync(progressLogPath, `${JSON.stringify({
    atMs: Date.now(),
    stage,
    ...detail,
  })}\n`, "utf8");
}
const TERMINAL_TASK_EXECUTION_CONTRACT_VERSION =
  "warmachine_terminal_task_execution_contract_v5_20260818";
const shardIndexes = requestedShards
  ? requestedShards.split(",").map(Number)
  : undefined;

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

progress("arguments_parsed", { maximumTasks, requestedShards: requestedShards || null });
await loadRuntimeModules(progress);
progress("runtime_modules_ready");
const batchRoot = path.join(outputDirectory, "terminal-root-batch-v1");
const currentPath = path.join(batchRoot, "CURRENT.json");
const current = loadJson(currentPath);
const planDirectory = path.join(batchRoot, current.relativePlanDirectory);
const plan = loadJson(path.join(planDirectory, "plan.json"));
if (plan.terminalTaskExecutionContractVersion !==
    TERMINAL_TASK_EXECUTION_CONTRACT_VERSION) {
  throw new Error("matchup_terminal_execution_contract_version_drift");
}
const checkpointPath = path.join(planDirectory, "checkpoint.json");
const checkpoint = loadJson(checkpointPath);
const openingReport = loadJson(path.join(planDirectory, "opening-batch-report.json"));
const openingRuntime = loadJson(path.join(planDirectory, "opening-batch-runtime.json"));
const evidenceCorpus = loadJson(path.join(
  outputDirectory,
  "terminal-demand-evidence-corpus.json",
));
progress("inputs_loaded", {
  selectedTaskCount: (plan.selectedTasks || []).length,
  checkpointRevision: checkpoint.revision,
});
const terminalTaskByKey = new Map((plan.selectedTasks || []).map((task) => [
  task.taskKey,
  task,
]));
const partitionCapabilityAuditCache = new Map();
const partitionCapabilityAuditsByTaskKey = new Proxy(Object.create(null), {
  get(_target, property) {
    if (typeof property !== "string") return undefined;
    if (partitionCapabilityAuditCache.has(property)) {
      return partitionCapabilityAuditCache.get(property);
    }
    const task = terminalTaskByKey.get(property);
    if (!task || !warmachineMatchupTerminalPartitionCapabilityAuditRequiredV1(task)) {
      return undefined;
    }
    const audit = auditWarmachineMatchupTerminalPartitionCapabilityV1({
      plan,
      openingReport,
      openingRuntime,
      taskKey: property,
      artifactsPrevalidatedByBatch: true,
    });
    partitionCapabilityAuditCache.set(property, audit);
    return audit;
  },
});

const sourceUnresolvedAdapter =
  buildWarmachineMatchupSourceUnresolvedTerminalAdapterV1();
const fixedRoundAdapter =
  buildWarmachineMatchupFixedRoundTerminalTaskAdapterV1();
const scoreTerminalAdapter =
  buildWarmachineMatchupScoreTerminalTaskAdapterV1();
const simultaneousTerminalAdapter =
  buildWarmachineMatchupSimultaneousTerminalTaskAdapterV1();
const assassinationTerminalAdapter =
  buildWarmachineMatchupAssassinationTerminalTaskAdapterV1();
const simultaneousOrSourceUnresolvedAdapter = Object.freeze({
  supports: (context = {}) => simultaneousTerminalAdapter.supports(context) ||
    sourceUnresolvedAdapter.supports(context),
  materialize: (context = {}) => simultaneousTerminalAdapter.supports({
    terminalTask: context.terminalTask,
    groupPlan: context.groupPlan,
  })
    ? simultaneousTerminalAdapter.materialize(context)
    : sourceUnresolvedAdapter.materialize(context),
});
progress("batch_execution_start");
const execution = executeWarmachineMatchupTerminalTaskBatchV1({
  plan,
  checkpoint,
  openingReport,
  openingRuntime,
  evidenceCorpus,
  workerId: `source-resolution-${process.pid}`,
  nowMs: Date.now(),
  maximumTasks,
  shardIndexes,
  materializerContext: {
    partitionCapabilityAuditsByTaskKey,
    onProgress: (detail) => progress("materializer", detail),
  },
  onProgress: (detail) => progress("batch", detail),
  materializersByGoalFamily: {
    assassination: assassinationTerminalAdapter,
    scenario_score_threshold: scoreTerminalAdapter,
    fixed_round_tiebreak: fixedRoundAdapter,
    simultaneous_leader_tiebreak: simultaneousOrSourceUnresolvedAdapter,
  },
});

progress("batch_execution_complete", {
  executedTaskCount: execution.report.executedTaskCount,
  checkpointAfterHash: execution.checkpoint.checkpointHash,
});
const evidenceDirectory = path.join(planDirectory, "terminal-task-evidence");
for (const artifact of execution.artifacts) {
  const taskDirectory = path.join(evidenceDirectory, artifact.taskKey);
  writeJsonAtomic(path.join(taskDirectory, "report.json"), artifact.report);
  if (artifact.runtime) {
    writeJsonAtomic(path.join(taskDirectory, "runtime.json"), artifact.runtime);
  }
}
const executionDirectory = path.join(planDirectory, "execution-batches");
writeJsonAtomic(path.join(
  executionDirectory,
  `${execution.report.reportHash}.json`,
), execution.report);
writeJsonAtomic(checkpointPath, execution.checkpoint);
const summary = summarizeWarmachineMatchupTerminalRootBatchV1(
  execution.checkpoint,
  plan,
);
writeJsonAtomic(path.join(planDirectory, "summary.json"), summary);
const currentCore = stableGraphValue({
  schemaVersion: "warmachine_matchup_terminal_root_batch_current_v1",
  taskHash: current.taskHash,
  planHash: plan.planHash,
  relativePlanDirectory: current.relativePlanDirectory,
  checkpointHash: execution.checkpoint.checkpointHash,
  summaryHash: summary.summaryHash,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  constructionHostReceiptHash:
    warmachineConstructionHost.receipt.receiptHash,
});
writeJsonAtomic(currentPath, {
  ...currentCore,
  currentHash: stableGraphHash(currentCore),
});

progress("artifacts_written", {
  executedTaskCount: execution.report.executedTaskCount,
  checkpointAfterHash: execution.checkpoint.checkpointHash,
});
process.stdout.write(`${JSON.stringify({
  ok: true,
  planHash: plan.planHash,
  checkpointBeforeHash: checkpoint.checkpointHash,
  checkpointAfterHash: execution.checkpoint.checkpointHash,
  executionReportHash: execution.report.reportHash,
  executedTaskCount: execution.report.executedTaskCount,
  dispositionCounts: execution.report.dispositionCounts,
  completedTaskCount: summary.completedTaskCount,
  incompleteTaskCount: summary.incompleteTaskCount,
  taskSpecificStrictRootCount: summary.taskSpecificStrictRootCount,
  candidateMassConserved: execution.report.candidateMassConserved,
}, null, 2)}\n`);
