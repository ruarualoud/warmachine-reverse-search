#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { executeWarmachineMatchupTerminalTaskBatchV1 } from
  "../src/matchup/matchup-terminal-task-execution-batch-v1.mjs";
import {
  buildWarmachineMatchupTerminalCandidateChunkPlanV1,
  buildWarmachineMatchupTerminalCandidateProgressV1,
  advanceWarmachineMatchupTerminalCandidateProgressV1,
} from "../src/matchup/matchup-terminal-candidate-chunk-v1.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(path.join(reverseDirectory,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1"));
const batchRoot = path.join(outputDirectory, "terminal-root-batch-v1");
const current = JSON.parse(fs.readFileSync(path.join(batchRoot, "CURRENT.json"), "utf8"));
const planDirectory = path.join(batchRoot, current.relativePlanDirectory);
const plan = JSON.parse(fs.readFileSync(path.join(planDirectory, "plan.json"), "utf8"));
const checkpoint = JSON.parse(fs.readFileSync(path.join(planDirectory, "checkpoint.json"), "utf8"));
const openingReport = JSON.parse(fs.readFileSync(
  path.join(planDirectory, "opening-batch-report.json"), "utf8"));
const openingRuntime = JSON.parse(fs.readFileSync(
  path.join(planDirectory, "opening-batch-runtime.json"), "utf8"));

const groupByKey = new Map((plan.groupPlans || []).map((group) => [
  group.groupKey,
  group,
]));
const targetCheckpointTask = (checkpoint.tasks || []).find((task) => {
  const planned = (plan.selectedTasks || []).find((row) => row.taskKey === task.taskKey);
  return task.status === "queued" &&
    groupByKey.get(planned?.groupKey)?.goalFamily === "assassination";
});
assert.ok(targetCheckpointTask, "queued_assassination_task_required");
const targetTask = (plan.selectedTasks || []).find((task) =>
  task.taskKey === targetCheckpointTask.taskKey);
const targetGroup = groupByKey.get(targetTask.groupKey);

function candidatePlanFor(task = {}) {
  return buildWarmachineMatchupTerminalCandidateChunkPlanV1({
    taskKey: task.taskKey,
    behaviorSignatureHash: task.behaviorSignatureHash,
    terminalTaskExecutionContractVersion: plan.terminalTaskExecutionContractVersion,
    candidateEnumerationVersion: "verification-ticket05-chunks-v1",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash: warmachineConstructionHost.receipt.receiptHash,
    slots: [0, 1, 2, 3].map((angleIndex) => ({
      actorPieceKey: "verification-actor",
      anchorIndex: 0,
      angleIndex,
      attackProfileKey: "verification-melee",
      actionRange: "outside_direct_action_range_requires_prior_movement",
    })),
  });
}

const mockAssassinationAdapter = Object.freeze({
  supports: ({ terminalTask } = {}) => terminalTask?.taskKey === targetTask.taskKey,
  materialize: ({ terminalTask, context = {} } = {}) => {
    const prior = context.candidateProgress || null;
    const candidatePlan = prior?.candidatePlan || candidatePlanFor(terminalTask);
    const progress = prior?.progress || buildWarmachineMatchupTerminalCandidateProgressV1({
      candidatePlan,
      updatedAtMs: 100,
    });
    const next = advanceWarmachineMatchupTerminalCandidateProgressV1({
      candidatePlan,
      progress,
      maximumSlotCount: 1,
      candidateEvidenceHash: `verification-evidence-${progress.nextSlotIndex}`,
      updatedAtMs: 101,
    });
    return { candidateProgress: { candidatePlan, progress: next } };
  },
});

const execution = executeWarmachineMatchupTerminalTaskBatchV1({
  plan,
  checkpoint,
  openingReport,
  openingRuntime,
  workerId: "candidate-progress-execution-verifier",
  nowMs: 100,
  maximumTasks: 1,
  materializersByGoalFamily: { assassination: mockAssassinationAdapter },
});
assert.equal(execution.report.executedTaskCount, 1);
assert.equal(execution.report.dispositionCounts.selected_in_progress, 1);
assert.equal(execution.report.candidateMassConserved, true);
const resumed = execution.checkpoint.tasks.find((task) =>
  task.taskKey === targetTask.taskKey);
assert.equal(resumed.status, "queued");
assert.equal(resumed.result, null);
assert.equal(resumed.searchProgress.progress.nextSlotIndex, 1);
assert.equal(resumed.searchProgress.progress.remainingSlotCount, 3);
assert.equal(execution.checkpoint.counts.inProgress, 1);
assert.equal(execution.artifacts[0].disposition, "selected_in_progress");
assert.ok(execution.artifacts[0].candidateProgress.progress.progressHash);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_ticket05_candidate_progress_execution_v1",
  planHash: plan.planHash,
  taskKey: targetTask.taskKey,
  goalFamily: targetGroup.goalFamily,
  checkpointAfterHash: execution.checkpoint.checkpointHash,
  progressHash: resumed.searchProgress.progress.progressHash,
  dispositionCounts: execution.report.dispositionCounts,
  claimBoundary: "This verifier proves only the batch executor can lease one selected task, atomically preserve sealed partial candidate progress, and report it as selected_in_progress. It does not execute a Warmachine candidate, prove a terminal route, or establish strategic value.",
}, null, 2));
