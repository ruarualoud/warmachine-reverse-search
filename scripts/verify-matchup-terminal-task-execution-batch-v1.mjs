#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import {
  acquireWarmachineMatchupTerminalRootBatchLeaseV1,
  buildWarmachineMatchupTerminalRootBatchCheckpointV1,
  recordWarmachineMatchupTerminalRootBatchResultsV1,
} from "../src/matchup/matchup-terminal-root-batch-v1.mjs";
import {
  executeWarmachineMatchupTerminalTaskBatchV1,
} from "../src/matchup/matchup-terminal-task-execution-batch-v1.mjs";
import {
  buildWarmachineMatchupSourceUnresolvedTerminalAdapterV1,
} from "../src/matchup/matchup-terminal-source-resolution-materializer-v1.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const batchRoot = path.join(
  reverseDirectory,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/terminal-root-batch-v1",
);

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const current = loadJson(path.join(batchRoot, "CURRENT.json"));
const planDirectory = path.join(batchRoot, current.relativePlanDirectory);
const plan = loadJson(path.join(planDirectory, "plan.json"));
const productionCheckpoint = loadJson(path.join(planDirectory, "checkpoint.json"));
const strictSeedIndex = loadJson(path.join(planDirectory, "strict-seed-index.json"));
const openingReport = loadJson(path.join(planDirectory, "opening-batch-report.json"));
const openingRuntime = loadJson(path.join(planDirectory, "opening-batch-runtime.json"));
const initialCheckpoint = buildWarmachineMatchupTerminalRootBatchCheckpointV1(
  plan,
  { nowMs: 0 },
);
const pinnedTasks = plan.selectedTasks.slice(0, strictSeedIndex.strictSeedCount);
const pinnedLease = acquireWarmachineMatchupTerminalRootBatchLeaseV1(
  initialCheckpoint,
  plan,
  {
    workerId: "verify-strict-seed-bootstrap",
    nowMs: 1,
    leaseDurationMs: 100,
    maximumTasks: pinnedTasks.length,
    taskKeys: pinnedTasks.map((task) => task.taskKey),
  },
);
const checkpoint = recordWarmachineMatchupTerminalRootBatchResultsV1(
  pinnedLease.checkpoint,
  plan,
  {
    workerId: "verify-strict-seed-bootstrap",
    nowMs: 2,
    results: pinnedTasks.map((task, index) => ({
      taskKey: task.taskKey,
      disposition: "strict_materialized",
      reason: "verifier_seed_bootstrap",
      authority: "rules_v1_host",
      reportHash: strictSeedIndex.seeds[index].reportHash,
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      constructionHostReceiptHash:
        warmachineConstructionHost.receipt.receiptHash,
    })),
  },
);

const deferredOnly = executeWarmachineMatchupTerminalTaskBatchV1({
  plan,
  checkpoint,
  openingReport,
  openingRuntime,
  workerId: "verify-no-adapters",
  nowMs: 10_000,
  maximumTasks: 4,
  materializersByGoalFamily: {},
});
assert.equal(deferredOnly.report.executedTaskCount, 0);
assert.equal(deferredOnly.report.dispositionCounts.strict_materialized, 2);
assert.equal(deferredOnly.report.dispositionCounts.budget_deferred, 62);
assert.equal(deferredOnly.report.selectedTaskMassConserved, true);
assert.equal(deferredOnly.report.candidateMassConserved, true);
assert.equal(deferredOnly.checkpoint.checkpointHash, checkpoint.checkpointHash);

const queuedAssassination = plan.selectedTasks.find((task) => {
  const group = plan.groupPlans.find((row) => row.groupKey === task.groupKey);
  const state = checkpoint.tasks.find((row) => row.taskKey === task.taskKey);
  return group?.goalFamily === "assassination" && state?.status === "queued";
});
assert.ok(queuedAssassination);

const filteredMaterializer = ({ terminalTask }) => {
  const core = stableGraphValue({
    schemaVersion: "verify_matchup_terminal_materializer_report_v1",
    terminalTaskKey: terminalTask.taskKey,
    representativeSubcellKey: terminalTask.representative.subcellKey,
    disposition: "proposal_filtered",
    reason: "verifier_declared_relation_not_met_after_host_execution",
    authority: "rules_v1_host_then_task_relation",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash:
      warmachineConstructionHost.receipt.receiptHash,
    trainingTruth: false,
  });
  return { report: { ...core, reportHash: stableGraphHash(core) } };
};

const filtered = executeWarmachineMatchupTerminalTaskBatchV1({
  plan,
  checkpoint,
  openingReport,
  openingRuntime,
  workerId: "verify-filtered-adapter",
  nowMs: 20_000,
  maximumTasks: 1,
  materializersByGoalFamily: { assassination: filteredMaterializer },
});
assert.equal(filtered.report.executedTaskCount, 1);
assert.equal(filtered.report.executedTaskKeys[0], queuedAssassination.taskKey);
assert.equal(filtered.report.dispositionCounts.strict_materialized, 2);
assert.equal(filtered.report.dispositionCounts.proposal_filtered, 1);
assert.equal(filtered.report.dispositionCounts.budget_deferred, 61);
assert.equal(filtered.report.selectedTaskMassConserved, true);
assert.equal(filtered.report.candidateMassConserved, true);
assert.equal(filtered.artifacts.length, 1);
assert.equal(filtered.checkpoint.counts.completed, 3);

const strictWithoutReplay = ({ terminalTask }) => {
  const core = stableGraphValue({
    schemaVersion: "verify_matchup_terminal_materializer_report_v1",
    terminalTaskKey: terminalTask.taskKey,
    representativeSubcellKey: terminalTask.representative.subcellKey,
    disposition: "strict_materialized",
    reason: "invalid_strict_claim",
    authority: "rules_v1_host",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash:
      warmachineConstructionHost.receipt.receiptHash,
    trainingTruth: false,
  });
  return { report: { ...core, reportHash: stableGraphHash(core) } };
};
assert.throws(() => executeWarmachineMatchupTerminalTaskBatchV1({
  plan,
  checkpoint,
  openingReport,
  openingRuntime,
  workerId: "verify-invalid-strict-adapter",
  nowMs: 30_000,
  maximumTasks: 1,
  materializersByGoalFamily: { assassination: strictWithoutReplay },
}), /matchup_terminal_execution_strict_replay_missing/);

const filteredLease = acquireWarmachineMatchupTerminalRootBatchLeaseV1(
  checkpoint,
  plan,
  {
    workerId: "verify-task-filter",
    nowMs: 40_000,
    leaseDurationMs: 1_000,
    maximumTasks: 8,
    taskKeys: [queuedAssassination.taskKey],
  },
);
assert.deepEqual(filteredLease.acquiredTaskKeys, [queuedAssassination.taskKey]);
assert.throws(() => acquireWarmachineMatchupTerminalRootBatchLeaseV1(
  checkpoint,
  plan,
  {
    workerId: "verify-invalid-task-filter",
    nowMs: 40_000,
    taskKeys: ["unknown-task"],
  },
), /matchup_terminal_batch_requested_task_keys_invalid/);

const sourceUnresolvedAdapter =
  buildWarmachineMatchupSourceUnresolvedTerminalAdapterV1();
const sourceUnresolved = executeWarmachineMatchupTerminalTaskBatchV1({
  plan,
  checkpoint,
  openingReport,
  openingRuntime,
  workerId: "verify-source-unresolved-adapter",
  nowMs: 50_000,
  maximumTasks: 10,
  materializersByGoalFamily: {
    fixed_round_tiebreak: sourceUnresolvedAdapter,
    simultaneous_leader_tiebreak: sourceUnresolvedAdapter,
  },
});
assert.equal(sourceUnresolved.report.executedTaskCount, 6);
assert.equal(sourceUnresolved.report.dispositionCounts.strict_materialized, 2);
assert.equal(sourceUnresolved.report.dispositionCounts.rules_unknown, 6);
assert.equal(sourceUnresolved.report.dispositionCounts.budget_deferred, 56);
assert.equal(sourceUnresolved.report.selectedTaskMassConserved, true);
assert.equal(sourceUnresolved.report.candidateMassConserved, true);
assert.equal(sourceUnresolved.artifacts.every((artifact) =>
  artifact.disposition === "rules_unknown" &&
  artifact.report.hostExecutionAttempted === false), true);
assert.equal(sourceUnresolved.artifacts.every((artifact) => {
  const task = plan.selectedTasks.find((row) => row.taskKey === artifact.taskKey);
  return task.representative.sourceResolutionStatus !== "officially_confirmed";
}), true);

process.stdout.write(`${JSON.stringify({
  ok: true,
  planHash: plan.planHash,
  checkpointHash: checkpoint.checkpointHash,
  productionCheckpointHash: productionCheckpoint.checkpointHash,
  selectedTaskCount: plan.selectedTaskCount,
  deferredWithoutAdapters: deferredOnly.report.dispositionCounts.budget_deferred,
  focusedExecutedTaskKey: queuedAssassination.taskKey,
  focusedDisposition: filtered.artifacts[0].disposition,
  filteredLeaseTaskCount: filteredLease.acquiredTaskKeys.length,
  sourceUnresolvedTaskCount: sourceUnresolved.report.executedTaskCount,
}, null, 2)}\n`);
