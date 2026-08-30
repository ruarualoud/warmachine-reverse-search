#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import {
  summarizeWarmachineMatchupTerminalRootBatchV1,
} from "../src/matchup/matchup-terminal-root-batch-v1.mjs";
import {
  buildWarmachineMatchupSourceUnresolvedTerminalAdapterV1,
} from "../src/matchup/matchup-terminal-source-resolution-materializer-v1.mjs";
import {
  buildWarmachineMatchupFixedRoundTerminalTaskAdapterV1,
} from "../src/matchup/matchup-fixed-round-terminal-task-materializer-v1.mjs";
import {
  buildWarmachineMatchupScoreTerminalTaskAdapterV1,
} from "../src/matchup/matchup-score-terminal-task-materializer-v1.mjs";
import {
  buildWarmachineMatchupSimultaneousTerminalTaskAdapterV1,
} from
  "../src/matchup/matchup-simultaneous-terminal-task-materializer-v1.mjs";
import {
  buildWarmachineMatchupAssassinationTerminalTaskAdapterV1,
} from
  "../src/matchup/matchup-assassination-terminal-task-materializer-v1.mjs";
import {
  auditWarmachineMatchupTerminalPartitionCapabilityV1,
  warmachineMatchupTerminalPartitionCapabilityAuditRequiredV1,
} from "../src/matchup/matchup-terminal-partition-capability-audit-v1.mjs";
import {
  executeWarmachineMatchupTerminalTaskBatchV1,
} from "../src/matchup/matchup-terminal-task-execution-batch-v1.mjs";
import {
  acquireWarmachineMatchupTerminalRootBatchWriterV1,
  commitWarmachineMatchupTerminalRootBatchCheckpointFileV1,
  loadWarmachineMatchupTerminalRootBatchCheckpointFileV1,
  releaseWarmachineMatchupTerminalRootBatchWriterV1,
} from
  "../src/matchup/matchup-terminal-root-batch-checkpoint-store-v1.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(reverseDirectory,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1"));
const maximumTasks = Math.max(0, Math.floor(Number(process.argv.find((argument) =>
  argument.startsWith("--maximum-tasks="))?.slice("--maximum-tasks=".length) || 16)));
const candidateChunkSize = Math.max(1, Math.floor(Number(process.argv.find(
  (argument) => argument.startsWith("--candidate-chunk-size="),
)?.slice("--candidate-chunk-size=".length) || 1)));
const transitionChunkSize = Math.max(1, Math.floor(Number(process.argv.find(
  (argument) => argument.startsWith("--transition-chunk-size="),
)?.slice("--transition-chunk-size=".length) || 1)));
const requestedShards = process.argv.find((argument) =>
  argument.startsWith("--shards="))?.slice("--shards=".length);
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

const batchRoot = path.join(outputDirectory, "terminal-root-batch-v1");
const currentPath = path.join(batchRoot, "CURRENT.json");
const current = loadJson(currentPath);
const planDirectory = path.join(batchRoot, current.relativePlanDirectory);
const plan = loadJson(path.join(planDirectory, "plan.json"));
const checkpointPath = path.join(planDirectory, "checkpoint.json");
const checkpointWriter =
  acquireWarmachineMatchupTerminalRootBatchWriterV1(checkpointPath);
const checkpoint =
  loadWarmachineMatchupTerminalRootBatchCheckpointFileV1(checkpointPath);
const openingReport = loadJson(path.join(planDirectory, "opening-batch-report.json"));
const openingRuntime = loadJson(path.join(planDirectory, "opening-batch-runtime.json"));
const evidenceCorpus = loadJson(path.join(
  outputDirectory,
  "terminal-demand-evidence-corpus.json",
));
const partitionCapabilityAuditsByTaskKey = Object.fromEntries(
  (plan.selectedTasks || []).filter((task) =>
    warmachineMatchupTerminalPartitionCapabilityAuditRequiredV1(task)).map((task) => [
    task.taskKey,
    auditWarmachineMatchupTerminalPartitionCapabilityV1({
      plan,
      openingReport,
      openingRuntime,
      taskKey: task.taskKey,
    }),
  ]),
);

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
    candidateChunkSize,
    transitionChunkSize,
  },
  materializersByGoalFamily: {
    assassination: assassinationTerminalAdapter,
    scenario_score_threshold: scoreTerminalAdapter,
    fixed_round_tiebreak: fixedRoundAdapter,
    simultaneous_leader_tiebreak: simultaneousOrSourceUnresolvedAdapter,
  },
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
commitWarmachineMatchupTerminalRootBatchCheckpointFileV1({
  checkpointPath,
  owner: checkpointWriter,
  expectedCheckpointHash: checkpoint.checkpointHash,
  checkpoint: execution.checkpoint,
});
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
releaseWarmachineMatchupTerminalRootBatchWriterV1(
  checkpointPath,
  checkpointWriter,
);

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
  candidateChunkSize,
  transitionChunkSize,
  candidateMassConserved: execution.report.candidateMassConserved,
}, null, 2)}\n`);
