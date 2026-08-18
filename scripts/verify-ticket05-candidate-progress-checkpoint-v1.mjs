#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  acquireWarmachineMatchupTerminalRootBatchLeaseV1,
  auditWarmachineMatchupTerminalRootBatchCheckpointV1,
  recordWarmachineMatchupTerminalRootBatchCandidateProgressV1,
} from "../src/matchup/matchup-terminal-root-batch-v1.mjs";
import {
  advanceWarmachineMatchupTerminalCandidateProgressV1,
  buildWarmachineMatchupTerminalCandidateChunkPlanV1,
  buildWarmachineMatchupTerminalCandidateProgressV1,
} from "../src/matchup/matchup-terminal-candidate-chunk-v1.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(reverseDirectory,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1"));
const batchRoot = path.join(outputDirectory, "terminal-root-batch-v1");
const current = JSON.parse(fs.readFileSync(path.join(batchRoot, "CURRENT.json"), "utf8"));
const planDirectory = path.join(batchRoot, current.relativePlanDirectory);
const plan = JSON.parse(fs.readFileSync(path.join(planDirectory, "plan.json"), "utf8"));
const checkpoint = JSON.parse(fs.readFileSync(path.join(planDirectory, "checkpoint.json"), "utf8"));

const baselineAudit = auditWarmachineMatchupTerminalRootBatchCheckpointV1(
  checkpoint,
  plan,
);
assert.equal(baselineAudit.ok, true);
const lease = acquireWarmachineMatchupTerminalRootBatchLeaseV1(checkpoint, plan, {
  workerId: "candidate-progress-verifier",
  nowMs: 1,
  leaseDurationMs: 10_000,
  maximumTasks: 1,
});
assert.equal(lease.acquiredTaskKeys.length, 1);
const taskKey = lease.acquiredTaskKeys[0];
const plannedTask = plan.selectedTasks.find((task) => task.taskKey === taskKey);
assert.ok(plannedTask);
const candidatePlan = buildWarmachineMatchupTerminalCandidateChunkPlanV1({
  taskKey,
  behaviorSignatureHash: plannedTask.behaviorSignatureHash,
  terminalTaskExecutionContractVersion: plan.terminalTaskExecutionContractVersion,
  candidateEnumerationVersion: "verify-geometry-slots-v1",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  constructionHostReceiptHash: warmachineConstructionHost.receipt.receiptHash,
  slots: [{
    actorPieceKey: "verification-actor",
    anchorIndex: 0,
    angleIndex: 0,
    attackProfileKey: "verification-melee",
    actionRange: "outside_direct_action_range_requires_prior_movement",
  }],
});
const initialProgress = buildWarmachineMatchupTerminalCandidateProgressV1({
  candidatePlan,
  updatedAtMs: 1,
});
const advancedProgress = advanceWarmachineMatchupTerminalCandidateProgressV1({
  candidatePlan,
  progress: initialProgress,
  maximumSlotCount: 1,
  candidateEvidenceHash: "verification-chunk-evidence",
  updatedAtMs: 2,
});
const resumedCheckpoint = recordWarmachineMatchupTerminalRootBatchCandidateProgressV1(
  lease.checkpoint,
  plan,
  {
    workerId: "candidate-progress-verifier",
    nowMs: 2,
    progressUpdates: [{ taskKey, candidatePlan, progress: advancedProgress }],
  },
);
const resumedAudit = auditWarmachineMatchupTerminalRootBatchCheckpointV1(
  resumedCheckpoint,
  plan,
);
assert.equal(resumedAudit.ok, true);
const resumedTask = resumedCheckpoint.tasks.find((task) => task.taskKey === taskKey);
assert.equal(resumedTask.status, "queued");
assert.equal(resumedTask.result, null);
assert.equal(resumedTask.searchProgress.progress.nextSlotIndex, 1);
assert.equal(resumedTask.searchProgress.progress.remainingSlotCount, 0);
assert.equal(resumedCheckpoint.counts.inProgress, 1);

const tampered = structuredClone(resumedCheckpoint);
tampered.tasks.find((task) => task.taskKey === taskKey)
  .searchProgress.progress.nextSlotIndex = 0;
const tamperedAudit = auditWarmachineMatchupTerminalRootBatchCheckpointV1(
  tampered,
  plan,
);
assert.equal(tamperedAudit.ok, false);
assert.ok(tamperedAudit.issues.includes(
  "matchup_terminal_candidate_progress_hash_invalid",
));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_ticket05_candidate_progress_checkpoint_v1",
  planHash: plan.planHash,
  taskKey,
  baselineCheckpointHash: checkpoint.checkpointHash,
  resumedCheckpointHash: resumedCheckpoint.checkpointHash,
  candidatePlanHash: candidatePlan.candidatePlanHash,
  progressHash: advancedProgress.progressHash,
  claimBoundary: "This verifier proves only sealed task-internal candidate progress can return a leased Ticket 05 task to queued without a final disposition. It does not execute a Warmachine action or prove a terminal root.",
}, null, 2));
