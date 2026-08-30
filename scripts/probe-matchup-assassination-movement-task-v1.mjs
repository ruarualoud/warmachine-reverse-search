#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  materializeWarmachineMatchupAssassinationTerminalTaskV1,
} from
  "../src/matchup/matchup-assassination-terminal-task-materializer-v1.mjs";

const DEFAULT_MOVEMENT_TASK_KEY =
  "matchup-terminal-task-b5de578bfa441af5556bf8528a9c9085";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const taskKey = process.argv.find((argument) =>
  argument.startsWith("--task-key="))?.slice("--task-key=".length) ||
  DEFAULT_MOVEMENT_TASK_KEY;
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(repositoryRoot,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1"));
const candidateChunkSize = Math.max(1, Math.floor(Number(
  process.argv.find((argument) =>
    argument.startsWith("--candidate-chunk-size="))
    ?.slice("--candidate-chunk-size=".length) || 256,
)));
const transitionChunkSize = Math.max(1, Math.floor(Number(
  process.argv.find((argument) =>
    argument.startsWith("--transition-chunk-size="))
    ?.slice("--transition-chunk-size=".length) || 64,
)));
const maximumBatches = Math.max(1, Math.floor(Number(
  process.argv.find((argument) =>
    argument.startsWith("--maximum-batches="))
    ?.slice("--maximum-batches=".length) || 64,
)));
const resultOutputPath = process.argv.find((argument) =>
  argument.startsWith("--result-output="))?.slice("--result-output=".length) || "";

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

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
  task.taskKey === taskKey);
const groupPlan = plan.groupPlans.find((group) =>
  group.groupKey === terminalTask?.groupKey);
const openingLedger = openingReport.taskLedger.find((row) =>
  row.terminalTaskKey === terminalTask?.taskKey);
const opening = openingRuntime.openings.find((row) =>
  row.openingKey === openingLedger?.openingKey);
if (!terminalTask || !groupPlan || !opening) {
  throw new Error("assassination_movement_probe_inputs_missing");
}

let materializerProgress = null;
const batches = [];
for (let batchIndex = 0; batchIndex < maximumBatches; batchIndex += 1) {
  const actorGeometryStarts = [];
  const transitionTrace = [];
  const result = materializeWarmachineMatchupAssassinationTerminalTaskV1({
    terminalTask,
    groupPlan,
    opening,
    plan,
    evidenceCorpus,
    context: {
      candidateChunkSize,
      transitionChunkSize,
      ...(materializerProgress ? { materializerProgress } : {}),
      onProgress: (event = {}) => {
        if (event.stage === "actor_geometry_start") {
          actorGeometryStarts.push(event.actorPieceKey);
        }
        if ([
          "before_enumeration",
          "after_enumeration",
          "before_strict_transition",
          "after_strict_transition",
        ].includes(event.stage)) {
          transitionTrace.push(event);
        }
      },
    },
  });
  materializerProgress = result.materializerProgress || null;
  const candidateProgress = materializerProgress?.candidateProgress ||
    result.runtime?.candidateProgress || null;
  const row = {
    batchIndex,
    disposition: result.report.disposition,
    reason: result.report.reason,
    phase: materializerProgress?.phase || "completed",
    activeSlotIndex: materializerProgress?.activeSlotIndex ?? null,
    nextSlotIndex: candidateProgress?.nextSlotIndex ?? null,
    slotCount: candidateProgress?.slotCount ??
      result.runtime?.candidatePlan?.slotCount ?? null,
    resolvedSlotCount: candidateProgress?.mass?.resolvedSlotCount ?? null,
    actorGeometryStarts,
    completedActionLineCount:
      materializerProgress?.completedActionLines?.length || 0,
    completedActionLineDispositions:
      (materializerProgress?.completedActionLines || []).map((line) => ({
        actionLineIndex: line.actionLineIndex,
        disposition: line.disposition,
        reason: line.reason,
      })),
    primaryActionTypes:
      (materializerProgress?.primaryProgress?.committedReceipts || [])
        .map((receipt) => receipt.actionType),
    replayActionTypes:
      (materializerProgress?.replayProgress?.committedReceipts || [])
        .map((receipt) => receipt.actionType),
    transitionTrace,
    actorAttempts: result.report.actorAttempts || [],
  };
  batches.push(row);
  process.stderr.write(`${JSON.stringify(row)}\n`);
  if (!materializerProgress) {
    if (resultOutputPath) {
      writeJsonAtomic(path.resolve(resultOutputPath), {
        schemaVersion: "warmachine_matchup_assassination_probe_result_v1",
        taskKey: terminalTask.taskKey,
        planHash: plan.planHash,
        report: result.report,
        runtime: result.runtime,
      });
    }
    process.stdout.write(`${JSON.stringify({
      ok: result.report.disposition === "strict_materialized",
      taskKey: terminalTask.taskKey,
      candidateChunkSize,
      transitionChunkSize,
      batches,
      actionTypes: (result.report.root?.actionSequence || [])
        .map((receipt) => receipt.actionType),
      damageTimeline: result.report.root?.damageTimeline || [],
      forcedResources: result.report.root?.forcedResources || [],
      fatalActionType: result.report.root?.fatalActionType || "",
      fatalLineOfSightActionType:
        result.report.root?.lineOfSightEvidence?.actionType || "",
      reportHash: result.report.reportHash,
      resultOutputPath: resultOutputPath ? path.resolve(resultOutputPath) : "",
      strictReplayCertified: result.report.strictReplayCertified === true,
    }, null, 2)}\n`);
    process.exit(result.report.disposition === "strict_materialized" ? 0 : 1);
  }
}
process.stdout.write(`${JSON.stringify({
  ok: true,
  taskKey: terminalTask.taskKey,
  candidateChunkSize,
  transitionChunkSize,
  maximumBatches,
  stoppedWithProgress: Boolean(materializerProgress),
  batches,
}, null, 2)}\n`);
