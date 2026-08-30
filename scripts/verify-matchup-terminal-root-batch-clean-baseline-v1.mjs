#!/usr/bin/env node

import assert from "node:assert/strict";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import {
  acquireWarmachineMatchupTerminalRootBatchLeaseV1,
  auditWarmachineMatchupTerminalRootBatchCheckpointV1,
  buildWarmachineMatchupTerminalRootBatchCheckpointV1,
  buildWarmachineMatchupTerminalRootBatchPlanV1,
  recordWarmachineMatchupTerminalRootBatchResultsV1,
  refreshWarmachineMatchupTerminalRootBatchPinnedResultsV1,
} from "../src/matchup/matchup-terminal-root-batch-v1.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";
import { buildMinimalWarmachineMatchupTerminalBatchFixtureV1 } from
  "./fixtures/minimal-matchup-terminal-batch-v1.mjs";

function reseal(value = {}, hashField = "") {
  const core = structuredClone(value);
  delete core[hashField];
  return { ...core, [hashField]: stableGraphHash(core) };
}

function resultFor(taskKey, executionSemanticReceiptHash, reportHash) {
  return {
    taskKey,
    disposition: "strict_materialized",
    reason: "minimal_current_receipt_replay",
    authority: "rules_v1_host",
    reportHash,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash:
      warmachineConstructionHost.receipt.receiptHash,
    executionSemanticReceiptHash,
  };
}

const fixture = buildMinimalWarmachineMatchupTerminalBatchFixtureV1();
const plan = buildWarmachineMatchupTerminalRootBatchPlanV1({
  ...fixture,
  maximumMaterializationTasks: 1,
  shardCount: 1,
});
assert.equal(plan.selectedTaskCount, 1);
assert.equal(plan.pinnedTaskCount, 1);
assert.equal(plan.candidateMassConserved, true);
assert.match(plan.receipts.executionSemanticReceiptHash, /^[0-9a-f]{64}$/);
assert.equal(
  plan.receipts.executionSemanticReceipt.executionReceiptHash,
  plan.receipts.executionSemanticReceiptHash,
);
assert.equal(
  plan.receipts.executionSemanticReceipt.engine.receiptHash,
  warmachineHost.receipt.receiptHash,
);

const initial = buildWarmachineMatchupTerminalRootBatchCheckpointV1(plan, { nowMs: 0 });
assert.equal(auditWarmachineMatchupTerminalRootBatchCheckpointV1(initial, plan).ok, true);
const leased = acquireWarmachineMatchupTerminalRootBatchLeaseV1(initial, plan, {
  workerId: "minimal-worker",
  nowMs: 1,
  leaseDurationMs: 100,
  maximumTasks: 1,
});
assert.equal(leased.acquiredTaskKeys.length, 1);
const reportHashes = leased.acquiredTaskKeys.map((taskKey) =>
  stableGraphHash({ taskKey, deterministicStrictReplay: true }));
assert.throws(() => recordWarmachineMatchupTerminalRootBatchResultsV1(
  leased.checkpoint,
  plan,
  {
    workerId: "minimal-worker",
    nowMs: 2,
    results: leased.acquiredTaskKeys.map((taskKey, index) => {
      const result = resultFor(
        taskKey,
        plan.receipts.executionSemanticReceiptHash,
        reportHashes[index],
      );
      delete result.executionSemanticReceiptHash;
      return result;
    }),
  },
), /result_execution_semantics_drift/);

const completed = recordWarmachineMatchupTerminalRootBatchResultsV1(
  leased.checkpoint,
  plan,
  {
    workerId: "minimal-worker",
    nowMs: 2,
    results: leased.acquiredTaskKeys.map((taskKey, index) => resultFor(
      taskKey,
      plan.receipts.executionSemanticReceiptHash,
      reportHashes[index],
    )),
  },
);
assert.equal(auditWarmachineMatchupTerminalRootBatchCheckpointV1(completed, plan).ok, true);

const staleCheckpoint = structuredClone(completed);
staleCheckpoint.receipts.executionSemanticReceiptHash = "stale-search-source";
const staleAudit = auditWarmachineMatchupTerminalRootBatchCheckpointV1(
  reseal(staleCheckpoint, "checkpointHash"),
  plan,
);
assert.equal(staleAudit.ok, false);
assert.equal(staleAudit.issues.includes("batch_checkpoint_receipts_mismatch"), true);
assert.equal(staleAudit.issues.includes(
  "batch_checkpoint_execution_semantics_drift"), true);

const pinnedTask = plan.selectedTasks.find((task) =>
  task.selectionSource === "pinned_strict_seed");
const replacementReportHash = stableGraphHash({
  taskKey: pinnedTask.taskKey,
  deterministicStrictReplay: true,
  revision: 2,
});
const refreshResult = resultFor(
  pinnedTask.taskKey,
  plan.receipts.executionSemanticReceiptHash,
  replacementReportHash,
);
assert.throws(() => refreshWarmachineMatchupTerminalRootBatchPinnedResultsV1(
  completed,
  plan,
  { results: [refreshResult] },
), /pinned_refresh_independent_replay_invalid/);
const replayCore = {
  passed: true,
  executionSemanticReceiptHash: plan.receipts.executionSemanticReceiptHash,
  sourceReportHash: replacementReportHash,
  replayedReportHash: replacementReportHash,
  strictReceiptHash: stableGraphHash({
    taskKey: pinnedTask.taskKey,
    independentlyExecuted: true,
  }),
};
refreshResult.independentReplay = {
  ...replayCore,
  replayHash: stableGraphHash(replayCore),
};
const refreshed = refreshWarmachineMatchupTerminalRootBatchPinnedResultsV1(
  completed,
  plan,
  { workerId: "independent-replay", nowMs: 3, results: [refreshResult] },
);
assert.equal(refreshed.refreshedTaskCount, 1);
assert.equal(
  refreshed.checkpoint.tasks.find((task) => task.taskKey === pinnedTask.taskKey)
    .result.independentReplay.passed,
  true,
);
assert.equal(
  auditWarmachineMatchupTerminalRootBatchCheckpointV1(
    refreshed.checkpoint,
    plan,
  ).ok,
  true,
);

process.stdout.write(`${JSON.stringify({
  ok: true,
  selfGeneratedInput: true,
  selectedTaskCount: plan.selectedTaskCount,
  compositeExecutionReceiptBound: true,
  staleCheckpointRejected: true,
  resultReceiptRequired: true,
  historicalRefreshRequiresIndependentReplay: true,
}, null, 2)}\n`);
