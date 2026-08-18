#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const movementTasks = (plan.selectedTasks || []).map((task, selectedTaskIndex) =>
  ({ task, selectedTaskIndex })).filter(({ task }) =>
  task.representative?.coordinates?.actionRange ===
    "outside_direct_action_range_requires_prior_movement").map(({ task, selectedTaskIndex }) => ({
  taskKey: task.taskKey,
  selectedTaskIndex,
  shardIndex: Number(task.shardIndex ?? -1),
  groupKey: task.groupKey,
  terminalClassKey: task.representative?.terminalClassKey || "",
  scenarioKey: task.representative?.scenarioKey || "",
  roundNumber: Number(task.representative?.roundNumber || 0),
  coordinates: task.representative?.coordinates || {},
  executionContractVersion: plan.terminalTaskExecutionContractVersion || "",
})).sort((left, right) => left.taskKey.localeCompare(right.taskKey));

const report = {
  schemaVersion: "ticket05_movement_candidate_report_v1",
  planHash: plan.planHash,
  checkpointPath: path.join(planDirectory, "checkpoint.json"),
  executionContractVersion: plan.terminalTaskExecutionContractVersion || "",
  selectedTaskCount: (plan.selectedTasks || []).length,
  movementTaskCount: movementTasks.length,
  movementTasks,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
