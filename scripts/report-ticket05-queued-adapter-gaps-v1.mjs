#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from "../src/graph/typed-facts-v2.mjs";
import { buildWarmachineMatchupSourceUnresolvedTerminalAdapterV1 } from "../src/matchup/matchup-terminal-source-resolution-materializer-v1.mjs";
import { buildWarmachineMatchupFixedRoundTerminalTaskAdapterV1 } from "../src/matchup/matchup-fixed-round-terminal-task-materializer-v1.mjs";
import { buildWarmachineMatchupScoreTerminalTaskAdapterV1 } from "../src/matchup/matchup-score-terminal-task-materializer-v1.mjs";
import { buildWarmachineMatchupSimultaneousTerminalTaskAdapterV1 } from "../src/matchup/matchup-simultaneous-terminal-task-materializer-v1.mjs";
import { buildWarmachineMatchupAssassinationTerminalTaskAdapterV1 } from "../src/matchup/matchup-assassination-terminal-task-materializer-v1.mjs";
import {
  auditWarmachineMatchupTerminalPartitionCapabilityV1,
  warmachineMatchupTerminalPartitionCapabilityAuditRequiredV1,
} from "../src/matchup/matchup-terminal-partition-capability-audit-v1.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) => argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(repositoryRoot, ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1"));
const batchRoot = path.join(outputDirectory, "terminal-root-batch-v1");
const current = JSON.parse(fs.readFileSync(path.join(batchRoot, "CURRENT.json"), "utf8"));
const planDirectory = path.join(batchRoot, current.relativePlanDirectory);
const plan = JSON.parse(fs.readFileSync(path.join(planDirectory, "plan.json"), "utf8"));
const checkpoint = JSON.parse(fs.readFileSync(path.join(planDirectory, "checkpoint.json"), "utf8"));
const openingReport = JSON.parse(fs.readFileSync(path.join(planDirectory, "opening-batch-report.json"), "utf8"));
const openingRuntime = JSON.parse(fs.readFileSync(path.join(planDirectory, "opening-batch-runtime.json"), "utf8"));

const sourceUnresolvedAdapter = buildWarmachineMatchupSourceUnresolvedTerminalAdapterV1();
const fixedRoundAdapter = buildWarmachineMatchupFixedRoundTerminalTaskAdapterV1();
const scoreTerminalAdapter = buildWarmachineMatchupScoreTerminalTaskAdapterV1();
const simultaneousTerminalAdapter = buildWarmachineMatchupSimultaneousTerminalTaskAdapterV1();
const assassinationTerminalAdapter = buildWarmachineMatchupAssassinationTerminalTaskAdapterV1();
const simultaneousOrSourceUnresolvedAdapter = Object.freeze({
  supports: (context = {}) => simultaneousTerminalAdapter.supports(context) || sourceUnresolvedAdapter.supports(context),
});
const adapters = Object.freeze({
  assassination: assassinationTerminalAdapter,
  scenario_score_threshold: scoreTerminalAdapter,
  fixed_round_tiebreak: fixedRoundAdapter,
  simultaneous_leader_tiebreak: simultaneousOrSourceUnresolvedAdapter,
});
const taskByKey = new Map((plan.selectedTasks || []).map((task) => [task.taskKey, task]));
const groupByKey = new Map((plan.groupPlans || []).map((group) => [group.groupKey, group]));
const auditsByTaskKey = Object.fromEntries((plan.selectedTasks || []).filter((task) =>
  warmachineMatchupTerminalPartitionCapabilityAuditRequiredV1(task)).map((task) => [task.taskKey,
  auditWarmachineMatchupTerminalPartitionCapabilityV1({ plan, openingReport, openingRuntime, taskKey: task.taskKey }),
]));
const queued = (checkpoint.tasks || []).filter((task) => task.status === "queued").map((checkpointTask) => {
  const task = taskByKey.get(checkpointTask.taskKey) || {};
  const group = groupByKey.get(task.groupKey) || {};
  const adapter = adapters[group.goalFamily] || null;
  const context = { terminalTask: task, groupPlan: group, context: { partitionCapabilityAuditsByTaskKey: auditsByTaskKey } };
  const supported = adapter?.supports ? adapter.supports(context) === true : Boolean(adapter);
  const audit = auditsByTaskKey[task.taskKey] || null;
  return stableGraphValue({
    taskKey: checkpointTask.taskKey,
    shardIndex: checkpointTask.shardIndex,
    goalFamily: group.goalFamily || "",
    groupKey: task.groupKey || "",
    representativeSubcellKey: task.representative?.subcellKey || "",
    coordinates: task.representative?.coordinates || {},
    scenarioKey: task.representative?.scenarioKey || "",
    roundNumber: Number(task.representative?.roundNumber || 0),
    adapterRegistered: Boolean(adapter),
    adapterSupports: supported,
    partitionCapabilityAuditRequired: Boolean(audit),
    partitionCapability: audit?.capability || null,
    terminalRequirementKinds: [...new Set((task.requirements || []).map((entry) => entry.kind || "").filter(Boolean))].sort(),
    executionEnvelopeKeys: Object.keys(task.executionEnvelope || {}).sort(),
  });
});
const counts = Object.fromEntries(["assassination", "scenario_score_threshold", "fixed_round_tiebreak", "simultaneous_leader_tiebreak"].map((goalFamily) => [goalFamily, {
  queued: queued.filter((row) => row.goalFamily === goalFamily).length,
  supported: queued.filter((row) => row.goalFamily === goalFamily && row.adapterSupports).length,
  unsupported: queued.filter((row) => row.goalFamily === goalFamily && !row.adapterSupports).length,
}]));
const core = stableGraphValue({
  schemaVersion: "warmachine_ticket05_queued_adapter_gap_report_v1",
  planHash: plan.planHash,
  checkpointHash: checkpoint.checkpointHash,
  hostReceiptHash: current.hostReceiptHash,
  constructionHostReceiptHash: current.constructionHostReceiptHash,
  queuedTaskCount: queued.length,
  counts,
  queued,
});
process.stdout.write(`${JSON.stringify({ ...core, reportHash: stableGraphHash(core) }, null, 2)}\n`);
