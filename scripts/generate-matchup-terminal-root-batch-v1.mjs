#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from "../src/graph/typed-facts-v2.mjs";
import {
  acquireWarmachineMatchupTerminalRootBatchLeaseV1,
  auditWarmachineMatchupTerminalRootBatchCheckpointV1,
  buildWarmachineMatchupTerminalRootBatchCheckpointV1,
  buildWarmachineMatchupTerminalRootBatchPlanV1,
  refreshWarmachineMatchupTerminalRootBatchPinnedResultsV1,
  recordWarmachineMatchupTerminalRootBatchResultsV1,
  summarizeWarmachineMatchupTerminalRootBatchV1,
} from "../src/matchup/matchup-terminal-root-batch-v1.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(reverseDirectory,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1"));
const maximumTasks = Math.max(2, Math.floor(Number(process.argv.find((argument) =>
  argument.startsWith("--maximum-tasks="))?.slice("--maximum-tasks=".length) || 64)));
const shardCount = Math.max(1, Math.floor(Number(process.argv.find((argument) =>
  argument.startsWith("--shards="))?.slice("--shards=".length) || 4)));
const TERMINAL_TASK_EXECUTION_CONTRACT_VERSION =
  "warmachine_terminal_task_execution_contract_v3_20260818";

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

const report = loadJson(path.join(outputDirectory, "report.json"));
const pool = loadJson(path.join(outputDirectory, "goal-conditioned-roster-pool.json"));
const routing = loadJson(path.join(outputDirectory, "terminal-demand-routing.json"));
const evidenceCorpus = loadJson(path.join(
  outputDirectory,
  "terminal-demand-evidence-corpus.json",
));
const groupByKey = new Map(routing.routedGroups.map((group) => [group.groupKey, group]));
const representativeByKey = new Map(
  evidenceCorpus.representativeSelection.selectedRepresentatives.map((representative) => [
    representative.subcellKey,
    representative,
  ]),
);
const cellByKey = new Map(evidenceCorpus.corpus.cells.map((cell) => [
  cell.cellKey,
  cell,
]));
const evidenceDirectory = path.join(outputDirectory, "terminal-route-evidence");
const strictReports = fs.readdirSync(evidenceDirectory)
  .filter((fileName) => fileName.endsWith("-report.json"))
  .map((fileName) => loadJson(path.join(evidenceDirectory, fileName)))
  .filter((rootReport) => rootReport.taskHash === report.task.taskHash &&
    rootReport.matchupTerminalRootProven === true &&
    rootReport.strictTerminalRootCount === 1)
  .sort((left, right) => String(left.routingGroupKey)
    .localeCompare(String(right.routingGroupKey)));
const strictFamilySet = new Set(strictReports.map((rootReport) =>
  rootReport.terminalRootKind === "scenario_score" ?
    "scenario_score_threshold" : "assassination"));
if (!strictFamilySet.has("assassination") ||
    !strictFamilySet.has("scenario_score_threshold")) {
  throw new Error("matchup_terminal_batch_strict_family_seeds_missing");
}
const pinnedRows = strictReports.map((rootReport) => {
  const group = groupByKey.get(rootReport.routingGroupKey);
  if (!group) throw new Error("matchup_terminal_batch_strict_seed_group_missing");
  const subject = group.subjectRosterCandidates.find((candidate) =>
    candidate.sourceListKey === rootReport.opening.subjectRosterKey);
  const challenger = group.challengerRosterCandidates.find((candidate) =>
    candidate.sourceListKey === rootReport.opening.challengerRosterKey);
  if (!subject || !challenger) {
    throw new Error("matchup_terminal_batch_strict_seed_roster_route_missing");
  }
  const representative = representativeByKey.get(
    rootReport.representativeBinding.subcellKey,
  );
  const cell = cellByKey.get(representative?.cellKey);
  const canonicalWinnerTaskSideKey = cell?.winnerSideKey === "player1"
    ? "subject" : cell?.winnerSideKey === "player2" ? "challenger" : "";
  const observedWinnerTaskSideKey = rootReport.terminalRootKind === "scenario_score"
    ? rootReport.terminalRequest.winnerTaskSideKey
    : rootReport.terminalRequest.attackerTaskSideKey;
  if (!canonicalWinnerTaskSideKey || !observedWinnerTaskSideKey) {
    throw new Error("matchup_terminal_batch_strict_seed_side_binding_missing");
  }
  return stableGraphValue({
    groupKey: group.groupKey,
    representativeSubcellKey: rootReport.representativeBinding.subcellKey,
    subjectRosterKey: subject.rosterKey,
    challengerRosterKey: challenger.rosterKey,
    mapKey: rootReport.opening.mapKey,
    deploymentSeedKey: rootReport.opening.deploymentSeedKey,
    firstPlayerTaskSideKey: rootReport.opening.firstPlayerTaskSideKey,
    sidePermutationKey: canonicalWinnerTaskSideKey === observedWinnerTaskSideKey
      ? "identity" : "swap",
    reportHash: rootReport.reportHash,
    goalFamily: group.goalFamily,
  });
});
const plan = buildWarmachineMatchupTerminalRootBatchPlanV1({
  task: report.task,
  pool,
  routing,
  evidenceCorpus,
  pinnedMaterializationTasks: pinnedRows,
  preferredAxisValues: {
    mapKey: "mixed_table",
    deploymentSeedKey: "balanced",
    firstPlayerTaskSideKey: "challenger",
    sidePermutationKey: "identity",
  },
  maximumMaterializationTasks: maximumTasks,
  shardCount,
  terminalTaskExecutionContractVersion:
    TERMINAL_TASK_EXECUTION_CONTRACT_VERSION,
});
if (plan.pinnedTaskCount !== pinnedRows.length ||
    !plan.selectedTasks.slice(0, pinnedRows.length).every((task) =>
      task.selectionSource === "pinned_strict_seed")) {
  throw new Error("matchup_terminal_batch_strict_seed_plan_binding_failed");
}
const batchRoot = path.join(outputDirectory, "terminal-root-batch-v1");
const planDirectory = path.join(batchRoot, "plans", plan.planHash);
const planPath = path.join(planDirectory, "plan.json");
const checkpointPath = path.join(planDirectory, "checkpoint.json");
let checkpoint;
let resumed = false;
if (fs.existsSync(checkpointPath)) {
  checkpoint = loadJson(checkpointPath);
  const audit = auditWarmachineMatchupTerminalRootBatchCheckpointV1(checkpoint, plan);
  if (!audit.ok) {
    throw new Error(`matchup_terminal_batch_existing_checkpoint_invalid:${
      audit.issues.join(",")}`);
  }
  const selectedPinnedTasks = plan.selectedTasks.slice(0, pinnedRows.length);
  const refreshed = refreshWarmachineMatchupTerminalRootBatchPinnedResultsV1(
    checkpoint,
    plan,
    {
      workerId: "strict-seed-reconcile",
      nowMs: Number(checkpoint.updatedAtMs || 0) + 1,
      results: selectedPinnedTasks.map((task, index) => ({
        taskKey: task.taskKey,
        disposition: "strict_materialized",
        reason: "refreshed_task_roster_terminal_root",
        authority: "rules_v1_host",
        reportHash: pinnedRows[index].reportHash,
        hostReceiptHash: warmachineHost.receipt.receiptHash,
        constructionHostReceiptHash:
          warmachineConstructionHost.receipt.receiptHash,
      })),
    },
  );
  checkpoint = refreshed.checkpoint;
  if (refreshed.refreshedTaskCount > 0) writeJsonAtomic(checkpointPath, checkpoint);
  resumed = true;
} else {
  checkpoint = buildWarmachineMatchupTerminalRootBatchCheckpointV1(plan, { nowMs: 0 });
  const leased = acquireWarmachineMatchupTerminalRootBatchLeaseV1(
    checkpoint,
    plan,
    {
      workerId: "strict-seed-bootstrap",
      nowMs: 1,
      leaseDurationMs: 100,
      maximumTasks: pinnedRows.length,
    },
  );
  const selectedPinnedTasks = plan.selectedTasks.slice(0, pinnedRows.length);
  if (stableGraphHash(leased.acquiredTaskKeys) !==
      stableGraphHash(selectedPinnedTasks.map((task) => task.taskKey))) {
    throw new Error("matchup_terminal_batch_strict_seed_lease_order_mismatch");
  }
  checkpoint = recordWarmachineMatchupTerminalRootBatchResultsV1(
    leased.checkpoint,
    plan,
    {
      workerId: "strict-seed-bootstrap",
      nowMs: 2,
      results: selectedPinnedTasks.map((task, index) => ({
        taskKey: task.taskKey,
        disposition: "strict_materialized",
        reason: "pre_materialized_task_roster_terminal_root",
        authority: "rules_v1_host",
        reportHash: pinnedRows[index].reportHash,
        hostReceiptHash: warmachineHost.receipt.receiptHash,
        constructionHostReceiptHash:
          warmachineConstructionHost.receipt.receiptHash,
      })),
    },
  );
  writeJsonAtomic(planPath, plan);
  writeJsonAtomic(checkpointPath, checkpoint);
}
if (!fs.existsSync(planPath)) writeJsonAtomic(planPath, plan);
const summary = summarizeWarmachineMatchupTerminalRootBatchV1(checkpoint, plan);
const seedIndexCore = stableGraphValue({
  schemaVersion: "warmachine_matchup_terminal_root_strict_seed_index_v1",
  taskHash: report.task.taskHash,
  planHash: plan.planHash,
  strictSeedCount: pinnedRows.length,
  seeds: pinnedRows,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  constructionHostReceiptHash: warmachineConstructionHost.receipt.receiptHash,
  deploymentToTerminalReachabilityProven: false,
  trainingTruth: false,
});
const seedIndex = { ...seedIndexCore, seedIndexHash: stableGraphHash(seedIndexCore) };
writeJsonAtomic(path.join(planDirectory, "summary.json"), summary);
writeJsonAtomic(path.join(planDirectory, "strict-seed-index.json"), seedIndex);
const currentCore = stableGraphValue({
  schemaVersion: "warmachine_matchup_terminal_root_batch_current_v1",
  taskHash: report.task.taskHash,
  planHash: plan.planHash,
  relativePlanDirectory: path.relative(batchRoot, planDirectory),
  checkpointHash: checkpoint.checkpointHash,
  summaryHash: summary.summaryHash,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  constructionHostReceiptHash: warmachineConstructionHost.receipt.receiptHash,
});
const current = { ...currentCore, currentHash: stableGraphHash(currentCore) };
writeJsonAtomic(path.join(batchRoot, "CURRENT.json"), current);
process.stdout.write(`${JSON.stringify({
  ok: true,
  resumed,
  batchRoot,
  planHash: plan.planHash,
  checkpointHash: checkpoint.checkpointHash,
  selectedTaskCount: plan.selectedTaskCount,
  pinnedTaskCount: plan.pinnedTaskCount,
  completedTaskCount: summary.completedTaskCount,
  incompleteTaskCount: summary.incompleteTaskCount,
  strictTaskRootCount: summary.taskSpecificStrictRootCount,
  workQueues: plan.workQueues,
  shardTaskCounts: plan.shardTaskCounts,
  candidateVariantMass: plan.candidateVariantMass,
  deploymentToTerminalReachabilityProven: false,
}, null, 2)}\n`);
