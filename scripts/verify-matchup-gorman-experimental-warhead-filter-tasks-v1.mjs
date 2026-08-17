import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import {
  materializeWarmachineMatchupSimultaneousTerminalTaskV1,
  warmachineMatchupSimultaneousTerminalTaskSupportedV1,
} from
  "../src/matchup/matchup-simultaneous-terminal-task-materializer-v1.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const EXPECTATIONS = Object.freeze({
  "matchup-terminal-task-d3eddbffd6f093feebd6b96874a7c54b": {
    disposition: "strict_rejected",
    reason: "line_of_sight_blocked",
    partition: "terrain_blocked",
  },
  "matchup-terminal-task-891d34d003b0c212e65c9ceda3a35225": {
    disposition: "proposal_filtered",
    reason: "simultaneous_terminal_full_health_gorman_warhead_not_lethal",
    partition: "one_focus",
  },
  "matchup-terminal-task-45a743bb2473cb032c0e33bc1469b994": {
    disposition: "strict_rejected",
    reason: "line_of_sight_blocked",
    partition: "model_blocked",
  },
  "matchup-terminal-task-f4b010deae4d462a232948edac2e9028": {
    disposition: "proposal_filtered",
    reason: "simultaneous_terminal_full_health_gorman_warhead_not_lethal",
    partition: "removed_from_play_history",
  },
  "matchup-terminal-task-66e60897f2b884020789e78c29216404": {
    disposition: "proposal_filtered",
    reason: "simultaneous_terminal_full_health_gorman_warhead_not_lethal",
    partition: "channeled_excarnate",
  },
  "matchup-terminal-task-b864ada1c5480bf44dfd6991ff4d6628": {
    disposition: "proposal_filtered",
    reason: "simultaneous_terminal_gorman_stealth_automatic_miss_not_terminal",
    partition: "stealth_automatic_miss",
  },
});

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(
    reverseDirectory,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
  ));
const requestedTaskKey = String(process.argv.find((argument) =>
  argument.startsWith("--task="))?.slice("--task=".length) || "");
if (requestedTaskKey && !EXPECTATIONS[requestedTaskKey]) {
  throw new Error(`unknown_gorman_filter_task:${requestedTaskKey}`);
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertSealed(artifact = {}, hashField = "reportHash") {
  const core = { ...artifact };
  const declaredHash = String(core[hashField] || "");
  delete core[hashField];
  assert.ok(declaredHash);
  assert.equal(stableGraphHash(core), declaredHash);
}

const batchRoot = path.join(outputDirectory, "terminal-root-batch-v1");
const current = loadJson(path.join(batchRoot, "CURRENT.json"));
assertSealed(current, "currentHash");
assert.equal(current.hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(
  current.constructionHostReceiptHash,
  warmachineConstructionHost.receipt.receiptHash,
);
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
assertSealed(plan, "planHash");
assertSealed(openingReport, "reportHash");
assertSealed(openingRuntime, "runtimeHash");

const groupByKey = new Map((plan.groupPlans || []).map((group) => [
  group.groupKey,
  group,
]));
const taskByKey = new Map((plan.selectedTasks || []).map((task) => [
  task.taskKey,
  task,
]));
const results = [];
const selectedExpectations = Object.entries(EXPECTATIONS).filter(
  ([taskKey]) => !requestedTaskKey || taskKey === requestedTaskKey,
);
for (const [taskKey, expectation] of selectedExpectations) {
  if (process.env.DEBUG_MATCHUP_SIMULTANEOUS_TASK === "1") {
    process.stderr.write(`gorman-filter-start:${taskKey}\n`);
  }
  const terminalTask = taskByKey.get(taskKey);
  assert.ok(terminalTask);
  assert.equal(
    warmachineMatchupSimultaneousTerminalTaskSupportedV1(terminalTask),
    true,
  );
  const groupPlan = groupByKey.get(terminalTask.groupKey);
  assert.ok(groupPlan);
  const openingLedger = openingReport.taskLedger.find((row) =>
    row.terminalTaskKey === taskKey);
  assert.equal(openingLedger?.disposition, "strict_opening_materialized");
  const opening = openingRuntime.openings.find((row) =>
    row.openingKey === openingLedger.openingKey);
  assert.ok(opening);
  const result = materializeWarmachineMatchupSimultaneousTerminalTaskV1({
    terminalTask,
    groupPlan,
    opening,
    plan,
    evidenceCorpus,
  });
  assertSealed(result.report);
  if (process.env.DEBUG_MATCHUP_SIMULTANEOUS_TASK === "1" &&
      (result.report.disposition !== expectation.disposition ||
        result.report.reason !== expectation.reason)) {
    process.stderr.write(`${JSON.stringify({
      taskKey,
      expectation,
      disposition: result.report.disposition,
      reason: result.report.reason,
      inputValidationEvidence: result.report.inputValidationEvidence,
      candidateFilterEvidence: result.report.candidateFilterEvidence,
      hostRejectionEvidence: result.report.hostRejectionEvidence,
      partitionAudit: result.report.partitionAudit,
    }, null, 2)}\n`);
  }
  assert.equal(result.report.disposition, expectation.disposition);
  assert.equal(result.report.reason, expectation.reason);
  const partitionAudit = expectation.disposition === "strict_rejected"
    ? result.report.hostRejectionEvidence.partitionAudit
    : result.report.partitionAudit;
  assert.equal(partitionAudit.ok, true);
  if (expectation.disposition === "strict_rejected") {
    assert.equal(result.report.strictRulesConclusion, true);
    assert.equal(
      result.report.hostRejectionEvidence.rejection.reason,
      "line_of_sight_blocked",
    );
  } else {
    assert.equal(result.report.strictActionReplayCertified, true);
    assert.equal(
      result.report.candidateFilterEvidence.requestedTerminalSatisfied,
      false,
    );
    assert.equal(result.runtime.primary.transition.ok, true);
    assert.equal(result.runtime.replay.transition.ok, true);
    assert.equal(
      result.runtime.primary.receiptHash,
      result.runtime.replay.receiptHash,
    );
  }
  if (expectation.partition === "one_focus") {
    assert.equal(partitionAudit.nonzeroResources.length, 1);
    assert.equal(partitionAudit.nonzeroResources[0].resource, 1);
  }
  if (expectation.partition === "removed_from_play_history") {
    assert.equal(partitionAudit.outOfPlayModelCount, 1);
    assert.equal(partitionAudit.priorLossPieceKeys.length, 1);
  }
  if (expectation.partition === "channeled_excarnate") {
    assert.equal(partitionAudit.controllerRouteEvidence.legalRoute, true);
    assert.equal(
      partitionAudit.controllerRouteEvidence.actionType,
      "boosted_hit_damage_channeled_offensive_spell",
    );
  }
  if (expectation.partition === "stealth_automatic_miss") {
    assert.equal(
      partitionAudit.stealthInteractionEvidence.automaticMiss,
      true,
    );
    assert.equal(
      result.report.candidateFilterEvidence.strictExecution
        .automaticMissObserved,
      true,
    );
  }
  results.push({
    taskKey,
    disposition: result.report.disposition,
    reason: result.report.reason,
    reportHash: result.report.reportHash,
  });
  if (process.env.DEBUG_MATCHUP_SIMULTANEOUS_TASK === "1") {
    process.stderr.write(`gorman-filter-complete:${taskKey}\n`);
  }
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion:
    "verify_matchup_gorman_experimental_warhead_filter_tasks_v1",
  planHash: plan.planHash,
  taskCount: results.length,
  results,
}, null, 2)}\n`);
