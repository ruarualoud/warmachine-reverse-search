import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineConstructionHost } from
  "../warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../warmachine-host-runtime.mjs";
import { materializeWarmachineRepresentativeOpeningsV1 } from
  "./representative-opening-materializer-v1.mjs";

export const WARMACHINE_MATCHUP_TERMINAL_ROOT_OPENING_BATCH_V1_SCHEMA =
  "warmachine_matchup_terminal_root_opening_batch_v1";

function openingIdentity(row = {}) {
  return stableGraphValue({
    subjectRosterKey: String(row.subjectRosterKey || ""),
    challengerRosterKey: String(row.challengerRosterKey || ""),
    scenarioKey: String(row.scenarioKey || ""),
    mapKey: String(row.mapKey || ""),
    firstPlayerTaskSideKey: String(row.firstPlayerTaskSideKey || ""),
    deploymentSeedKey: String(row.deploymentSeedKey || ""),
    scenarioTerrainSetupClassKey: String(
      row.scenarioTerrainSetupClassKey || "",
    ),
  });
}

function openingIdentityHash(row = {}) {
  return stableGraphHash(openingIdentity(row));
}

function terminalRootOpeningKey(row = {}) {
  return `matchup-terminal-opening-${openingIdentityHash(row)}`;
}

function openingTaskFromTerminalTask(task = {}) {
  return {
    subjectRosterKey: String(task.executionEnvelope?.sourceRosterKeys?.subject || ""),
    challengerRosterKey: String(
      task.executionEnvelope?.sourceRosterKeys?.challenger || "",
    ),
    scenarioKey: String(task.representative?.scenarioKey || ""),
    mapKey: String(task.mapKey || ""),
    firstPlayerTaskSideKey: String(task.firstPlayerTaskSideKey || ""),
    deploymentSeedKey: String(task.deploymentSeedKey || ""),
    scenarioTerrainSetupClassKey: String(
      task.representative?.coordinates?.scenarioTerrainSetup || "",
    ),
    pairReason: `terminal-root-batch:${task.taskKey}`,
  };
}

function publicOpening(opening = {}) {
  const { state: _state, ...publicRow } = opening;
  return publicRow;
}

function terminalRootOpening(opening = {}) {
  return stableGraphValue({
    ...opening,
    constructionOpeningKey: String(opening.openingKey || ""),
    openingKey: terminalRootOpeningKey(opening),
  });
}

export function materializeWarmachineMatchupTerminalRootOpeningBatchV1(raw = {}) {
  const plan = raw.plan || {};
  const task = raw.task || {};
  if (!plan.planHash || plan.taskKey !== task.taskKey ||
      plan.receipts?.taskHash !== task.taskHash) {
    throw new Error("matchup_terminal_opening_batch_plan_task_mismatch");
  }
  if (plan.receipts?.hostReceiptHash !== warmachineHost.receipt.receiptHash ||
      plan.receipts?.constructionHostReceiptHash !==
        warmachineConstructionHost.receipt.receiptHash) {
    throw new Error("matchup_terminal_opening_batch_receipt_drift");
  }
  const terminalTasks = plan.selectedTasks || [];
  const terminalTaskKeysByOpeningHash = new Map();
  const openingTasksByHash = new Map();
  for (const terminalTask of terminalTasks) {
    const openingTask = openingTaskFromTerminalTask(terminalTask);
    const hash = openingIdentityHash(openingTask);
    if (!openingTasksByHash.has(hash)) openingTasksByHash.set(hash, openingTask);
    const taskKeys = terminalTaskKeysByOpeningHash.get(hash) || [];
    taskKeys.push(terminalTask.taskKey);
    terminalTaskKeysByOpeningHash.set(hash, taskKeys);
  }
  const openingTasks = [...openingTasksByHash.values()].sort((left, right) =>
    openingIdentityHash(left).localeCompare(openingIdentityHash(right)));
  const materialization = materializeWarmachineRepresentativeOpeningsV1({
    task,
    poolsByTaskSideKey: raw.poolsByTaskSideKey,
    openingTasks,
    exactMapTemplatesByKey: raw.exactMapTemplatesByKey,
    resolveExactMapTemplate: raw.resolveExactMapTemplate,
    scenarioBindersByKey: raw.scenarioBindersByKey,
    maximumMaterializedOpenings: openingTasks.length,
    includeFullStates: true,
  });
  const runtimeOpenings = (materialization.openings || []).map(
    terminalRootOpening,
  );
  const openingByHash = new Map(runtimeOpenings.map((opening) => [
    openingIdentityHash(opening), opening,
  ]));
  const failureByHash = new Map((materialization.rejected || []).map((failure) => [
    openingIdentityHash(failure),
    failure,
  ]));
  const unresolvedByHash = new Map((materialization.unresolved || []).map((failure) => [
    openingIdentityHash(failure),
    failure,
  ]));
  const taskLedger = terminalTasks.map((terminalTask) => {
    const requested = openingTaskFromTerminalTask(terminalTask);
    const identityHash = openingIdentityHash(requested);
    const opening = openingByHash.get(identityHash);
    const failure = failureByHash.get(identityHash) || unresolvedByHash.get(identityHash);
    return stableGraphValue({
      terminalTaskKey: terminalTask.taskKey,
      groupKey: terminalTask.groupKey,
      representativeSubcellKey: terminalTask.representative?.subcellKey || "",
      openingIdentityHash: identityHash,
      openingKey: String(opening?.openingKey || ""),
      constructionOpeningKey: String(opening?.constructionOpeningKey || ""),
      strictOpeningStateHash: String(opening?.strictOpeningStateHash || ""),
      strictDeploymentReceiptHash: String(
        opening?.strictDeploymentReceiptHash || "",
      ),
      scenarioBindingHash: String(opening?.scenarioBindingHash || ""),
      disposition: opening ? "strict_opening_materialized" :
        String(failure?.disposition || "input_invalid"),
      authority: opening ? "rules_v1_host" :
        String(failure?.authority || "input_contract"),
      reason: opening ? "strict_deployment_and_scenario_binding_materialized" :
        String(failure?.reason || "opening_materialization_result_missing"),
    });
  });
  const dispositionCounts = Object.fromEntries([...new Set(taskLedger.map((row) =>
    row.disposition))].sort().map((disposition) => [
    disposition,
    taskLedger.filter((row) => row.disposition === disposition).length,
  ]));
  const publicOpenings = runtimeOpenings.map(publicOpening);
  const publicFailures = (materialization.rejected || []).map(publicOpening);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_MATCHUP_TERMINAL_ROOT_OPENING_BATCH_V1_SCHEMA,
    taskHash: task.taskHash,
    planHash: plan.planHash,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash:
      warmachineConstructionHost.receipt.receiptHash,
    selectedTerminalTaskCount: terminalTasks.length,
    uniqueOpeningTaskCount: openingTasks.length,
    deploymentSearchCount: materialization.deploymentSearchCount,
    strictUniqueOpeningCount: publicOpenings.length,
    failedUniqueOpeningCount: publicFailures.length,
    unresolvedUniqueOpeningCount: materialization.unresolvedCount,
    terminalTaskDispositionCounts: dispositionCounts,
    terminalTaskMassConserved: taskLedger.length === terminalTasks.length &&
      Object.values(dispositionCounts).reduce((sum, count) => sum + count, 0) ===
        terminalTasks.length,
    taskLedger,
    openings: publicOpenings,
    failures: publicFailures,
    unresolved: materialization.unresolved,
    sourceMaterializationHash: materialization.materializationHash,
    deploymentToTerminalReachabilityProven: false,
    trainingTruth: false,
    claimBoundary: "Every strict row proves only a current-Host legal deployment plus exact Steamroller scenario binding for the task's real rosters. It does not prove the authored later-round terminal state, reverse reachability, opponent closure, value, win rate or training truth.",
  });
  const report = { ...core, reportHash: stableGraphHash(core) };
  const runtimeCore = stableGraphValue({
    schemaVersion: "warmachine_matchup_terminal_root_opening_batch_runtime_v1",
    taskHash: task.taskHash,
    planHash: plan.planHash,
    reportHash: report.reportHash,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash:
      warmachineConstructionHost.receipt.receiptHash,
    openings: runtimeOpenings,
    trainingTruth: false,
  });
  return {
    report,
    runtime: { ...runtimeCore, runtimeHash: stableGraphHash(runtimeCore) },
  };
}
