#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import {
  materializeWarmachineMatchupAssassinationTerminalTaskV1,
} from
  "../src/matchup/matchup-assassination-terminal-task-materializer-v1.mjs";

const STRICT_FALLBACK_TASK_KEY =
  "matchup-terminal-task-6c100dec0a4a17d809071faa5f7e3486";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(repositoryRoot, ".scratch/ticket17-production-fixture-v6"));

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadInputs() {
  const batchRoot = path.join(outputDirectory, "terminal-root-batch-v1");
  const current = loadJson(path.join(batchRoot, "CURRENT.json"));
  const planDirectory = path.join(batchRoot, current.relativePlanDirectory);
  const plan = loadJson(path.join(planDirectory, "plan.json"));
  const openingReport = loadJson(path.join(
    planDirectory,
    "opening-batch-report.json",
  ));
  const openingRuntime = loadJson(path.join(
    planDirectory,
    "opening-batch-runtime.json",
  ));
  const evidenceCorpus = loadJson(path.join(
    outputDirectory,
    "terminal-demand-evidence-corpus.json",
  ));
  const terminalTask = plan.selectedTasks.find((task) =>
    task.taskKey === STRICT_FALLBACK_TASK_KEY);
  assert.ok(terminalTask);
  const groupPlan = plan.groupPlans.find((group) =>
    group.groupKey === terminalTask.groupKey);
  const ledger = openingReport.taskLedger.find((row) =>
    row.terminalTaskKey === terminalTask.taskKey);
  const opening = openingRuntime.openings.find((row) =>
    row.openingKey === ledger?.openingKey);
  assert.equal(ledger?.disposition, "strict_opening_materialized");
  assert.ok(opening);
  return { plan, terminalTask, groupPlan, opening, evidenceCorpus };
}

function materialize(inputs, context) {
  return materializeWarmachineMatchupAssassinationTerminalTaskV1({
    ...inputs,
    context,
  });
}

const inputs = loadInputs();
const commonContext = {
  candidateChunkSize: 1,
  updatedAtMs: 0,
};
const oneShot = materialize(inputs, {
  ...commonContext,
  transitionChunkSize: 24,
});
assert.equal(oneShot.report.disposition, "strict_materialized");
assert.equal(oneShot.report.strictReplayCertified, true);
assert.equal(oneShot.materializerProgress, undefined);
if (process.argv.includes("--one-shot-only")) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    oneShotOnly: true,
    reportHash: oneShot.report.reportHash,
    terminalStateHash: oneShot.report.root.terminalStateHash,
    candidateProgressHash: oneShot.report.root.candidateProgressHash,
  }, null, 2)}\n`);
  process.exit(0);
}

let chunked = materialize(inputs, {
  ...commonContext,
  transitionChunkSize: 1,
});
const recoveryRows = [];
for (let resumeIndex = 0; chunked.materializerProgress; resumeIndex += 1) {
  assert.ok(resumeIndex < 32, "assassination transition resume did not converge");
  const progress = chunked.materializerProgress;
  assert.equal(chunked.report.disposition, "budget_deferred");
  assert.equal(progress.candidateProgress.nextSlotIndex,
    progress.activeSlotIndex);
  assert.equal(progress.candidateProgress.mass.resolvedSlotCount,
    progress.activeSlotIndex);
  recoveryRows.push({
    resumeIndex,
    progressHash: progress.progressHash,
    activeSlotIndex: progress.activeSlotIndex,
    actionLineIndex: progress.actionLineIndex,
    phase: progress.phase,
    primaryCommittedTransitionCount:
      progress.primaryProgress.committedTransitionCount,
    replayCommittedTransitionCount:
      progress.replayProgress?.committedTransitionCount || 0,
  });
  chunked = materialize(inputs, {
    ...commonContext,
    transitionChunkSize: 1,
    materializerProgress: progress,
  });
}
assert.equal(chunked.report.disposition, "strict_materialized");
assert.equal(chunked.report.strictReplayCertified, true);
assert.ok(recoveryRows.length >= 2);
assert.equal(new Set(recoveryRows.map((row) => row.progressHash)).size,
  recoveryRows.length);

const oneShotRoot = oneShot.report.root;
const chunkedRoot = chunked.report.root;
for (const field of [
  "predecessorStateHash",
  "terminalStateHash",
  "replayTerminalStateHash",
  "actionSequenceHash",
  "candidateProgressHash",
]) {
  assert.equal(chunkedRoot[field], oneShotRoot[field], field);
}
assert.deepEqual(chunkedRoot.actionSequence, oneShotRoot.actionSequence);
assert.deepEqual(chunked.runtime.primaryReceiptHashes,
  oneShot.runtime.primaryReceiptHashes);
assert.deepEqual(chunked.runtime.replayReceiptHashes,
  oneShot.runtime.replayReceiptHashes);
assert.equal(chunked.report.reportHash, oneShot.report.reportHash);
assert.equal(stableGraphHash(chunked.runtime.candidateProgress),
  stableGraphHash(oneShot.runtime.candidateProgress));

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion: "verify_matchup_assassination_transition_resume_v1",
  taskKey: inputs.terminalTask.taskKey,
  modelCount: inputs.opening.modelCount,
  recoveryCheckpointCount: recoveryRows.length,
  recoveryRows,
  reportHash: oneShot.report.reportHash,
  terminalStateHash: oneShotRoot.terminalStateHash,
  actionTypes: oneShotRoot.actionSequence.map((row) => row.actionType),
  exactOneShotResumeParity: true,
  claimBoundary: "This verifier proves exact one-shot versus one-transition-at-a-time recovery parity for one current-receipt 78-model assassination task. It does not prove every task, action family, geometry or operating-system failure mode.",
}, null, 2)}\n`);
