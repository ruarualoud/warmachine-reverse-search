#!/usr/bin/env node

import assert from "node:assert/strict";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import {
  buildWarmachineMatchupTerminalRootBatchCheckpointV1,
  buildWarmachineMatchupTerminalRootBatchPlanV1,
} from "../src/matchup/matchup-terminal-root-batch-v1.mjs";
import { executeWarmachineMatchupTerminalTaskBatchV1 } from
  "../src/matchup/matchup-terminal-task-execution-batch-v1.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";
import { buildMinimalWarmachineMatchupTerminalBatchFixtureV1 } from
  "./fixtures/minimal-matchup-terminal-batch-v1.mjs";

function seal(value = {}, hashField = "") {
  const core = stableGraphValue(value);
  return { ...core, [hashField]: stableGraphHash(core) };
}

const fixture = buildMinimalWarmachineMatchupTerminalBatchFixtureV1();
const plan = buildWarmachineMatchupTerminalRootBatchPlanV1({
  ...fixture,
  maximumMaterializationTasks: 1,
  shardCount: 1,
});
const checkpoint = buildWarmachineMatchupTerminalRootBatchCheckpointV1(
  plan,
  { nowMs: 0 },
);
const terminalTask = plan.selectedTasks[0];
const state = stableGraphValue({
  strictMode: true,
  enforceStrictExecutor: true,
  activeSideKey: "player1",
  pieces: [],
});
const opening = stableGraphValue({
  openingKey: "minimal-current-opening",
  disposition: "strict_opening_materialized",
  subjectRosterKey: terminalTask.executionEnvelope.sourceRosterKeys.subject,
  challengerRosterKey: terminalTask.executionEnvelope.sourceRosterKeys.challenger,
  scenarioKey: terminalTask.representative.scenarioKey,
  mapKey: terminalTask.mapKey,
  deploymentSeedKey: terminalTask.deploymentSeedKey,
  firstPlayerTaskSideKey: terminalTask.firstPlayerTaskSideKey,
  strictOpeningStateHash: stableGraphHash(state),
  strictDeploymentReceiptHash: stableGraphHash({ minimalDeployment: true }),
  scenarioBindingHash: stableGraphHash({ minimalScenario: true }),
  state,
});
const ledger = stableGraphValue({
  terminalTaskKey: terminalTask.taskKey,
  openingKey: opening.openingKey,
  disposition: opening.disposition,
  strictOpeningStateHash: opening.strictOpeningStateHash,
  strictDeploymentReceiptHash: opening.strictDeploymentReceiptHash,
  scenarioBindingHash: opening.scenarioBindingHash,
});
const openingReport = seal({
  schemaVersion: "warmachine_matchup_terminal_root_opening_batch_v1",
  taskHash: plan.receipts.taskHash,
  planHash: plan.planHash,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  constructionHostReceiptHash:
    warmachineConstructionHost.receipt.receiptHash,
  taskLedger: [ledger],
}, "reportHash");
const openingRuntime = seal({
  schemaVersion: "warmachine_matchup_terminal_root_opening_batch_runtime_v1",
  taskHash: plan.receipts.taskHash,
  planHash: plan.planHash,
  reportHash: openingReport.reportHash,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  constructionHostReceiptHash:
    warmachineConstructionHost.receipt.receiptHash,
  openings: [opening],
}, "runtimeHash");

const deferred = executeWarmachineMatchupTerminalTaskBatchV1({
  plan,
  checkpoint,
  openingReport,
  openingRuntime,
  workerId: "minimal-no-materializer",
  nowMs: 1,
  maximumTasks: 1,
  materializersByGoalFamily: {},
});
assert.equal(deferred.report.executedTaskCount, 0);
assert.equal(deferred.report.dispositionCounts.budget_deferred, 1);
assert.equal(deferred.checkpoint.checkpointHash, checkpoint.checkpointHash);

let resumableCallCount = 0;
function resumableMaterializer({ terminalTask: selectedTask, context }) {
  resumableCallCount += 1;
  if (!context.materializerProgress) {
    const materializerProgress = seal({
      schemaVersion: "minimal_resumable_materializer_progress_v1",
      taskKey: selectedTask.taskKey,
      cursor: 1,
    }, "progressHash");
    return {
      report: seal({
        schemaVersion: "minimal_resumable_materialization_v1",
        terminalTaskKey: selectedTask.taskKey,
        disposition: "budget_deferred",
        reason: "transition_chunk_incomplete",
        authority: "transition_budget",
        hostReceiptHash: warmachineHost.receipt.receiptHash,
        constructionHostReceiptHash:
          warmachineConstructionHost.receipt.receiptHash,
      }, "reportHash"),
      materializerProgress,
    };
  }
  assert.equal(context.materializerProgress.cursor, 1);
  return {
    report: seal({
      schemaVersion: "minimal_resumable_materialization_v1",
      terminalTaskKey: selectedTask.taskKey,
      representativeSubcellKey: selectedTask.representative.subcellKey,
      disposition: "proposal_filtered",
      reason: "resumed_transition_finished_nonterminal",
      authority: "search_proposal",
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      constructionHostReceiptHash:
        warmachineConstructionHost.receipt.receiptHash,
    }, "reportHash"),
  };
}

const paused = executeWarmachineMatchupTerminalTaskBatchV1({
  plan,
  checkpoint,
  openingReport,
  openingRuntime,
  workerId: "minimal-resumable-worker-a",
  nowMs: 1,
  leaseDurationMs: 100,
  maximumTasks: 1,
  materializersByGoalFamily: { assassination: resumableMaterializer },
});
assert.equal(paused.report.dispositionCounts.selected_in_progress, 1);
assert.equal(paused.report.dispositionCounts.budget_deferred, 0);
assert.equal(paused.checkpoint.tasks[0].status, "queued");
assert.ok(paused.checkpoint.tasks[0].searchProgress?.searchProgressHash);
assert.equal(paused.checkpoint.tasks[0].result, null);

const resumedToCompletion = executeWarmachineMatchupTerminalTaskBatchV1({
  plan,
  checkpoint: paused.checkpoint,
  openingReport,
  openingRuntime,
  workerId: "minimal-resumable-worker-b",
  nowMs: 3,
  leaseDurationMs: 100,
  maximumTasks: 1,
  materializersByGoalFamily: { assassination: resumableMaterializer },
});
assert.equal(resumableCallCount, 2);
assert.equal(resumedToCompletion.report.dispositionCounts.proposal_filtered, 1);
assert.equal(resumedToCompletion.checkpoint.tasks[0].status, "completed");
assert.equal(resumedToCompletion.checkpoint.tasks[0].searchProgress, null);
assert.equal(resumedToCompletion.report.candidateMassConserved, true);

let materializerCallCount = 0;
function materialize({ terminalTask: selectedTask, opening: selectedOpening }) {
  materializerCallCount += 1;
  assert.equal(selectedTask.taskKey, terminalTask.taskKey);
  assert.equal(selectedOpening.openingKey, opening.openingKey);
  return {
    report: seal({
      schemaVersion: "minimal_current_terminal_materialization_v1",
      terminalTaskKey: selectedTask.taskKey,
      representativeSubcellKey: selectedTask.representative.subcellKey,
      disposition: "proposal_filtered",
      reason: "minimal_current_proposal_predicate_not_met",
      authority: "search_proposal",
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      constructionHostReceiptHash:
        warmachineConstructionHost.receipt.receiptHash,
    }, "reportHash"),
  };
}

const executed = executeWarmachineMatchupTerminalTaskBatchV1({
  plan,
  checkpoint,
  openingReport,
  openingRuntime,
  workerId: "minimal-current-worker",
  nowMs: 2,
  leaseDurationMs: 100,
  maximumTasks: 1,
  materializersByGoalFamily: { assassination: materialize },
});
assert.equal(materializerCallCount, 1);
assert.equal(executed.report.executedTaskCount, 1);
assert.equal(executed.report.dispositionCounts.proposal_filtered, 1);
assert.equal(executed.report.dispositionCounts.budget_deferred, 0);
assert.equal(executed.report.selectedTaskMassConserved, true);
assert.equal(executed.report.candidateMassConserved, true);
const result = executed.checkpoint.tasks[0].result;
assert.equal(result.executionSemanticReceiptHash,
  plan.receipts.executionSemanticReceiptHash);
assert.match(result.resultHash, /^[0-9a-f]{64}$/);

process.stdout.write(`${JSON.stringify({
  ok: true,
  selfGeneratedInput: true,
  noHistoricalScratchDependency: true,
  deferredWithoutMaterializer: true,
  intermediateProgressAtomicallyCheckpointed: true,
  intermediateProgressResumedToCompletion: true,
  completedMaterializerContractExecuted: true,
  resultExecutionSemanticReceiptBound: true,
}, null, 2)}\n`);
