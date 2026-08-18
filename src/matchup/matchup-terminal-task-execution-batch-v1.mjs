import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineConstructionHost } from
  "../warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../warmachine-host-runtime.mjs";
import {
  acquireWarmachineMatchupTerminalRootBatchLeaseV1,
  auditWarmachineMatchupTerminalRootBatchCheckpointV1,
  recordWarmachineMatchupTerminalRootBatchCandidateProgressV1,
  recordWarmachineMatchupTerminalRootBatchResultsV1,
} from "./matchup-terminal-root-batch-v1.mjs";

export const WARMACHINE_MATCHUP_TERMINAL_TASK_EXECUTION_BATCH_V1_SCHEMA =
  "warmachine_matchup_terminal_task_execution_batch_v1";

const COMPLETED_DISPOSITIONS = new Set([
  "strict_materialized",
  "strict_rejected",
  "proposal_filtered",
  "input_invalid",
  "rules_unknown",
]);

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function assertSealed(value = {}, hashField = "", errorCode = "") {
  const core = { ...value };
  const declared = String(core[hashField] || "");
  delete core[hashField];
  if (!declared || stableGraphHash(core) !== declared) throw new Error(errorCode);
}

function assertOpeningArtifacts(plan = {}, report = {}, runtime = {}) {
  assertSealed(
    report,
    "reportHash",
    "matchup_terminal_execution_opening_report_hash_invalid",
  );
  assertSealed(
    runtime,
    "runtimeHash",
    "matchup_terminal_execution_opening_runtime_hash_invalid",
  );
  if (report.planHash !== plan.planHash || runtime.planHash !== plan.planHash ||
      runtime.reportHash !== report.reportHash ||
      report.taskHash !== plan.receipts?.taskHash ||
      runtime.taskHash !== plan.receipts?.taskHash) {
    throw new Error("matchup_terminal_execution_opening_identity_mismatch");
  }
  if (report.hostReceiptHash !== warmachineHost.receipt.receiptHash ||
      runtime.hostReceiptHash !== warmachineHost.receipt.receiptHash ||
      report.constructionHostReceiptHash !==
        warmachineConstructionHost.receipt.receiptHash ||
      runtime.constructionHostReceiptHash !==
        warmachineConstructionHost.receipt.receiptHash) {
    throw new Error("matchup_terminal_execution_opening_receipt_drift");
  }
  const taskKeys = new Set((plan.selectedTasks || []).map((task) => task.taskKey));
  const ledgerKeys = new Set((report.taskLedger || []).map((row) =>
    row.terminalTaskKey));
  if (taskKeys.size !== ledgerKeys.size || [...taskKeys].some((taskKey) =>
    !ledgerKeys.has(taskKey))) {
    throw new Error("matchup_terminal_execution_opening_task_ledger_mismatch");
  }
}

function findTaskOpening(terminalTask = {}, openingReport = {}, openingRuntime = {}) {
  const ledger = (openingReport.taskLedger || []).find((row) =>
    row.terminalTaskKey === terminalTask.taskKey);
  const opening = (openingRuntime.openings || []).find((row) =>
    row.openingKey === ledger?.openingKey);
  if (!ledger || ledger.disposition !== "strict_opening_materialized" || !opening) {
    return { ledger, opening: null };
  }
  const checks = [
    [opening.strictOpeningStateHash, ledger.strictOpeningStateHash],
    [opening.strictDeploymentReceiptHash, ledger.strictDeploymentReceiptHash],
    [opening.scenarioBindingHash, ledger.scenarioBindingHash],
    [opening.subjectRosterKey,
      terminalTask.executionEnvelope?.sourceRosterKeys?.subject],
    [opening.challengerRosterKey,
      terminalTask.executionEnvelope?.sourceRosterKeys?.challenger],
    [opening.scenarioKey, terminalTask.representative?.scenarioKey],
    [opening.mapKey, terminalTask.mapKey],
    [opening.deploymentSeedKey, terminalTask.deploymentSeedKey],
    [opening.firstPlayerTaskSideKey, terminalTask.firstPlayerTaskSideKey],
    [opening.strictOpeningStateHash, stableGraphHash(opening.state || {})],
  ];
  if (checks.some(([actual, expected]) => String(actual || "") !==
      String(expected || ""))) {
    throw new Error(`matchup_terminal_execution_task_opening_binding_mismatch:${
      terminalTask.taskKey}`);
  }
  return { ledger, opening };
}

function normalizeMaterializerResult(terminalTask = {}, raw = {}) {
  const report = raw.report || raw;
  if (!report || typeof report !== "object") {
    throw new Error(`matchup_terminal_execution_materializer_report_missing:${
      terminalTask.taskKey}`);
  }
  assertSealed(
    report,
    "reportHash",
    `matchup_terminal_execution_materializer_report_hash_invalid:${terminalTask.taskKey}`,
  );
  const disposition = String(report.disposition || raw.disposition || "");
  if (!COMPLETED_DISPOSITIONS.has(disposition)) {
    throw new Error(`matchup_terminal_execution_materializer_disposition_invalid:${
      terminalTask.taskKey}:${disposition}`);
  }
  if (report.hostReceiptHash !== warmachineHost.receipt.receiptHash ||
      report.constructionHostReceiptHash !==
        warmachineConstructionHost.receipt.receiptHash) {
    throw new Error(`matchup_terminal_execution_materializer_receipt_drift:${
      terminalTask.taskKey}`);
  }
  if (report.representativeSubcellKey &&
      report.representativeSubcellKey !== terminalTask.representative?.subcellKey) {
    throw new Error(`matchup_terminal_execution_materializer_representative_mismatch:${
      terminalTask.taskKey}`);
  }
  if (report.terminalTaskKey && report.terminalTaskKey !== terminalTask.taskKey) {
    throw new Error(`matchup_terminal_execution_materializer_task_mismatch:${
      terminalTask.taskKey}`);
  }
  if (disposition === "strict_materialized" &&
      report.strictReplayCertified !== true &&
      report.matchupTerminalRootProven !== true) {
    throw new Error(`matchup_terminal_execution_strict_replay_missing:${
      terminalTask.taskKey}`);
  }
  return {
    report,
    runtime: raw.runtime || null,
    result: stableGraphValue({
      taskKey: terminalTask.taskKey,
      disposition,
      reason: String(report.reason || raw.reason || ""),
      authority: String(report.authority || raw.authority || ""),
      reportHash: report.reportHash,
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      constructionHostReceiptHash:
        warmachineConstructionHost.receipt.receiptHash,
    }),
  };
}

function currentTaskEligible(task = {}, nowMs = 0) {
  return task.status === "queued" || (task.status === "leased" &&
    numeric(task.lease?.expiresAtMs) <= nowMs);
}

function materializerForTask(materializers = {}, goalFamily = "", context = {}) {
  const entry = materializers[goalFamily];
  if (typeof entry === "function") return entry;
  if (!entry || typeof entry.materialize !== "function") return null;
  if (typeof entry.supports === "function" && entry.supports(context) !== true) {
    return null;
  }
  return entry.materialize;
}

function resultDispositionCounts(tasks = []) {
  const keys = [
    "strict_materialized",
    "strict_rejected",
    "proposal_filtered",
    "input_invalid",
    "rules_unknown",
    "selected_in_progress",
    "budget_deferred",
  ];
  return Object.fromEntries(keys.map((key) => [
    key,
    tasks.filter((task) => task.disposition === key).length,
  ]));
}

export function executeWarmachineMatchupTerminalTaskBatchV1(raw = {}) {
  const plan = raw.plan || {};
  const checkpoint = raw.checkpoint || {};
  const openingReport = raw.openingReport || {};
  const openingRuntime = raw.openingRuntime || {};
  const checkpointAudit = auditWarmachineMatchupTerminalRootBatchCheckpointV1(
    checkpoint,
    plan,
  );
  if (!checkpointAudit.ok) {
    throw new Error(`matchup_terminal_execution_checkpoint_invalid:${
      checkpointAudit.issues.join(",")}`);
  }
  assertOpeningArtifacts(plan, openingReport, openingRuntime);
  const workerId = String(raw.workerId || "");
  if (!workerId) throw new Error("matchup_terminal_execution_worker_id_required");
  const nowMs = numeric(raw.nowMs);
  const materializers = raw.materializersByGoalFamily || {};
  const onProgress = typeof raw.onProgress === "function" ? raw.onProgress : () => {};
  const groupByKey = new Map((plan.groupPlans || []).map((group) => [
    group.groupKey,
    group,
  ]));
  const planTaskByKey = new Map((plan.selectedTasks || []).map((task) => [
    task.taskKey,
    task,
  ]));
  const checkpointTaskByKey = new Map((checkpoint.tasks || []).map((task) => [
    task.taskKey,
    task,
  ]));
  const availableTaskKeys = (checkpoint.tasks || []).filter((task) => {
    if (!currentTaskEligible(task, nowMs)) return false;
    const planned = planTaskByKey.get(task.taskKey);
    const groupPlan = groupByKey.get(planned?.groupKey);
    return Boolean(materializerForTask(materializers, groupPlan?.goalFamily, {
      terminalTask: planned,
      groupPlan,
      context: {
        ...(raw.materializerContext || {}),
        supportProbe: true,
      },
    }));
  }).map((task) => task.taskKey);
  onProgress({
    stage: "available_tasks_resolved",
    availableTaskCount: availableTaskKeys.length,
    availableTaskKeys: availableTaskKeys.slice(0, 8),
  });
  const maximumTasks = Math.max(0, Math.floor(numeric(
    raw.maximumTasks,
    availableTaskKeys.length,
  )));
  let nextCheckpoint = checkpoint;
  const artifacts = [];
  const executedTaskKeys = [];
  if (availableTaskKeys.length && maximumTasks > 0) {
    const lease = acquireWarmachineMatchupTerminalRootBatchLeaseV1(
      checkpoint,
      plan,
      {
        workerId,
        nowMs,
        leaseDurationMs: Math.max(1, numeric(raw.leaseDurationMs, 600_000)),
        maximumTasks,
        shardIndexes: raw.shardIndexes,
        taskKeys: availableTaskKeys,
      },
    );
    nextCheckpoint = lease.checkpoint;
    const results = [];
    const progressUpdates = [];
    for (const taskKey of lease.acquiredTaskKeys) {
      const terminalTask = planTaskByKey.get(taskKey);
      const group = groupByKey.get(terminalTask.groupKey);
      const materializer = materializerForTask(materializers, group.goalFamily, {
        terminalTask,
        groupPlan: group,
        context: raw.materializerContext || {},
      });
      if (!materializer) {
        throw new Error(`matchup_terminal_execution_materializer_disappeared:${taskKey}`);
      }
      const { ledger, opening } = findTaskOpening(
        terminalTask,
        openingReport,
        openingRuntime,
      );
      onProgress({
        stage: "task_materialization_start",
        taskKey,
        goalFamily: group.goalFamily,
      });
      const rawMaterialization = opening
        ? materializer({
          terminalTask,
          groupPlan: group,
          opening,
          openingLedger: ledger,
          plan,
          evidenceCorpus: raw.evidenceCorpus || null,
          context: {
            ...(raw.materializerContext || {}),
            candidateProgress: checkpointTaskByKey.get(taskKey)?.searchProgress || null,
          },
        })
        : {
          report: (() => {
            const core = stableGraphValue({
              schemaVersion: "warmachine_matchup_terminal_task_input_failure_v1",
              terminalTaskKey: taskKey,
              representativeSubcellKey:
                terminalTask.representative?.subcellKey || "",
              disposition: "input_invalid",
              reason: String(ledger?.reason || "strict_opening_missing"),
              authority: "opening_batch_contract",
              hostReceiptHash: warmachineHost.receipt.receiptHash,
              constructionHostReceiptHash:
                warmachineConstructionHost.receipt.receiptHash,
              trainingTruth: false,
            });
            return { ...core, reportHash: stableGraphHash(core) };
          })(),
        };
      if (rawMaterialization?.candidateProgress) {
        const candidatePlan = rawMaterialization.candidateProgress.candidatePlan || {};
        const progress = rawMaterialization.candidateProgress.progress || {};
        progressUpdates.push({ taskKey, candidatePlan, progress });
        onProgress({
          stage: "task_candidate_chunk_complete",
          taskKey,
          goalFamily: group.goalFamily,
          candidatePlanHash: String(candidatePlan.candidatePlanHash || ""),
          progressHash: String(progress.progressHash || ""),
          nextSlotIndex: Number(progress.nextSlotIndex || 0),
          remainingSlotCount: Number(progress.remainingSlotCount || 0),
        });
        artifacts.push(stableGraphValue({
          taskKey,
          goalFamily: group.goalFamily,
          disposition: "selected_in_progress",
          candidateProgress: stableGraphValue({ candidatePlan, progress }),
        }));
        executedTaskKeys.push(taskKey);
        continue;
      }
      const normalized = normalizeMaterializerResult(
        terminalTask,
        rawMaterialization,
      );
      onProgress({
        stage: "task_materialization_complete",
        taskKey,
        goalFamily: group.goalFamily,
        disposition: normalized.result.disposition,
      });
      results.push(normalized.result);
      artifacts.push(stableGraphValue({
        taskKey,
        goalFamily: group.goalFamily,
        disposition: normalized.result.disposition,
        report: normalized.report,
        runtime: normalized.runtime,
      }));
      executedTaskKeys.push(taskKey);
    }
    if (progressUpdates.length) {
      nextCheckpoint = recordWarmachineMatchupTerminalRootBatchCandidateProgressV1(
        nextCheckpoint,
        plan,
        {
          workerId,
          nowMs: nowMs + 1,
          progressUpdates,
        },
      );
    }
    if (results.length) {
      nextCheckpoint = recordWarmachineMatchupTerminalRootBatchResultsV1(
        nextCheckpoint,
        plan,
        {
          workerId,
          nowMs: nowMs + 2,
          results,
        },
      );
    }
  }
  const finalTaskLedger = (nextCheckpoint.tasks || []).map((task) => {
    if (task.status === "completed") {
      return stableGraphValue({
        taskKey: task.taskKey,
        disposition: task.result?.disposition || "input_invalid",
        reportHash: task.result?.reportHash || "",
        resultHash: task.result?.resultHash || "",
      });
    }
    const planned = planTaskByKey.get(task.taskKey);
    const goalFamily = groupByKey.get(planned?.groupKey)?.goalFamily || "";
    if (task.searchProgress !== null && task.searchProgress !== undefined) {
      return stableGraphValue({
        taskKey: task.taskKey,
        disposition: "selected_in_progress",
        goalFamily,
        candidatePlanHash: String(task.searchProgress.candidatePlan?.candidatePlanHash || ""),
        progressHash: String(task.searchProgress.progress?.progressHash || ""),
        nextSlotIndex: Number(task.searchProgress.progress?.nextSlotIndex || 0),
        remainingSlotCount:
          Number(task.searchProgress.progress?.remainingSlotCount || 0),
      });
    }
    const supported = Boolean(materializerForTask(materializers, goalFamily, {
      terminalTask: planned,
      groupPlan: groupByKey.get(planned?.groupKey),
    }));
    return stableGraphValue({
      taskKey: task.taskKey,
      disposition: "budget_deferred",
      goalFamily,
      reason: supported
        ? "execution_batch_budget_not_selected"
        : materializers[goalFamily]
          ? "terminal_task_partition_not_supported_by_registered_adapter"
          : "terminal_family_materializer_not_registered",
    });
  });
  const dispositionCounts = resultDispositionCounts(finalTaskLedger);
  const selectedBudgetDeferred = dispositionCounts.budget_deferred;
  const selectedInProgress = dispositionCounts.selected_in_progress;
  const globallyDeferred = BigInt(plan.candidateDispositionMass?.budget_deferred || "0");
  const selectedCompleted = finalTaskLedger.length - selectedBudgetDeferred -
    selectedInProgress;
  const candidateVariantMass = BigInt(plan.candidateVariantMass || "0");
  const candidateMassConserved = candidateVariantMass ===
    BigInt(selectedCompleted) + BigInt(selectedInProgress) +
      BigInt(selectedBudgetDeferred) + globallyDeferred;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_MATCHUP_TERMINAL_TASK_EXECUTION_BATCH_V1_SCHEMA,
    planHash: plan.planHash,
    checkpointBeforeHash: checkpoint.checkpointHash,
    checkpointAfterHash: nextCheckpoint.checkpointHash,
    openingReportHash: openingReport.reportHash,
    openingRuntimeHash: openingRuntime.runtimeHash,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash: warmachineConstructionHost.receipt.receiptHash,
    workerId,
    selectedTaskCount: finalTaskLedger.length,
    executedTaskCount: executedTaskKeys.length,
    executedTaskKeys,
    dispositionCounts,
    taskLedger: finalTaskLedger,
    selectedTaskMassConserved: finalTaskLedger.length ===
      Object.values(dispositionCounts).reduce((sum, count) => sum + count, 0),
    candidateDispositionMass: {
      completed: String(selectedCompleted),
      selectedInProgress: String(selectedInProgress),
      selectedBudgetDeferred: String(selectedBudgetDeferred),
      unselectedBudgetDeferred: String(globallyDeferred),
    },
    candidateVariantMass: String(candidateVariantMass),
    candidateMassConserved,
    taskSpecificStrictRootCount: dispositionCounts.strict_materialized,
    genericCapabilityPinsCountAsTaskRoots: false,
    deploymentToTerminalReachabilityProven: false,
    gameValueInterval: { lowerBound: 0, upperBound: 1 },
    naturalWinRate: null,
    trainingTruth: false,
    claimBoundary: "This batch executes only registered task-roster terminal adapters. A task with sealed candidate progress remains selected_in_progress until all its finite slots are consumed or a final strict result is certified. Missing adapters and unselected work remain budget_deferred; no generic capability pin, legal opening, failed proposal, partial candidate block or finite-budget omission is promoted to a strict root, unreachable result, game value or training label.",
  });
  if (!core.selectedTaskMassConserved || !core.candidateMassConserved) {
    throw new Error("matchup_terminal_execution_mass_not_conserved");
  }
  return {
    checkpoint: nextCheckpoint,
    report: { ...core, reportHash: stableGraphHash(core) },
    artifacts,
  };
}
