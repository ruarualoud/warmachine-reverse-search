#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createWarmachineFixedAssassinationPolicyV1 } from
  "../src/benchmark/fixed-assassination-policy-v1.mjs";
import { stableGraphHash, stableGraphValue } from "../src/graph/typed-facts-v2.mjs";
import { buildWarmachineFixedActionHorizonReportV1 } from
  "../src/report/fixed-action-horizon-report-v1.mjs";
import {
  planWarmachineStrictFrontierContinuationBatchV1,
  runWarmachineStrictFrontierContinuationBatchV1,
} from "../src/search/frontier-continuation-batch-v1.mjs";
import { runWarmachineStrictFrontierContinuationBatchParallelV1 } from
  "../src/search/frontier-continuation-parallel-v1.mjs";
import { evaluateWarmachineStrictPolicyFrontierProbabilityAndMinV3 } from
  "../src/search/strict-policy-frontier-probability-and-min-v3.mjs";
import { createWarmachineExternalDagStore } from "../src/storage/external-dag-v1.mjs";
import {
  persistWarmachineStrictFrontierExternalDagV1,
  restoreWarmachineStrictFrontierExternalDagV1,
} from "../src/storage/strict-frontier-external-dag-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDagRoot = path.resolve(
  process.env.WARMACHINE_RAPTOR_ACTION_SOURCE_DAG ||
    path.join(projectRoot, ".scratch/current-host-sepsira-nymara-assassination-v2"),
);
const targetDagRoot = path.resolve(
  process.env.WARMACHINE_RAPTOR_ACTION_DAG ||
    path.join(projectRoot, ".scratch/current-host-raptor-nymara-action-horizon-v3"),
);
const outputDirectory = path.resolve(
  process.env.WARMACHINE_RAPTOR_ACTION_REPORT_OUTPUT ||
    path.join(projectRoot, "build/reports"),
);
const selectedSourceLabelKey = String(
  process.env.WARMACHINE_RAPTOR_ACTION_SOURCE_LABEL || "",
);
const batchSize = Math.max(1, Number(
  process.env.WARMACHINE_RAPTOR_ACTION_BATCH_SIZE || 32,
));
const workerCount = Math.max(1, Number(
  process.env.WARMACHINE_RAPTOR_ACTION_WORKERS || 8,
));
const maximumBatches = Math.max(0, Number(
  process.env.WARMACHINE_RAPTOR_ACTION_MAX_BATCHES || 0,
));
const taskTimeoutMs = Math.max(1_000, Number(
  process.env.WARMACHINE_RAPTOR_ACTION_TASK_TIMEOUT_MS || 15 * 60 * 1_000,
));
const stopWhenActionValueExact =
  process.env.WARMACHINE_RAPTOR_ACTION_STOP_WHEN_EXACT !== "0";

function progress(stage, detail = {}) {
  process.stderr.write(`${JSON.stringify({
    stage,
    at: new Date().toISOString(),
    ...stableGraphValue(detail),
  })}\n`);
}

function probabilityOrderDescending(left = {}, right = {}) {
  const leftNumerator = BigInt(left.numerator ?? 0);
  const leftDenominator = BigInt(left.denominator ?? 1);
  const rightNumerator = BigInt(right.numerator ?? 0);
  const rightDenominator = BigInt(right.denominator ?? 1);
  const difference = leftNumerator * rightDenominator - rightNumerator * leftDenominator;
  return difference > 0n ? -1 : difference < 0n ? 1 : 0;
}

function storeBinding(rootPath) {
  return JSON.parse(fs.readFileSync(path.join(rootPath, "STORE.json"), "utf8"));
}

function restore(rootPath, options, eagerFrontierLabelKeys = []) {
  const restored = restoreWarmachineStrictFrontierExternalDagV1(rootPath, {
    ...options,
    lazyRuntimePayloads: true,
    maximumEagerFrontierStates: 0,
    ...(eagerFrontierLabelKeys.length ? { eagerFrontierLabelKeys } : {}),
  });
  assert.equal(restored.ok, true, "strict frontier checkpoint restore failed");
  return restored;
}

const sourceStoreBinding = storeBinding(sourceDagRoot);
assert.equal(sourceStoreBinding.hostReceiptHash, warmachineHost.receipt.receiptHash,
  "source DAG and current Host receipt differ");
const sourceRestored = restore(sourceDagRoot, sourceStoreBinding);
const sourceLabelByKey = new Map(sourceRestored.report.labels.map((label) =>
  [label.labelKey, label]));
const sourceCandidates = sourceRestored.report.stepAudits.filter((audit) =>
  audit.stepType === "chance_worklist" && audit.action?.actionType === "slam_power_attack")
  .map((audit) => ({ audit, label: sourceLabelByKey.get(audit.labelKey) }))
  .filter((row) => row.label)
  .filter((row) => !selectedSourceLabelKey || row.label.labelKey === selectedSourceLabelKey)
  .sort((left, right) =>
    probabilityOrderDescending(left.label.cumulativeProbability,
      right.label.cumulativeProbability) ||
    left.label.labelKey.localeCompare(right.label.labelKey));
assert.ok(sourceCandidates.length, "no persisted Raptor slam source state found");
const source = sourceCandidates[0];
const sourceStateId = sourceRestored.reusableContentReferences
  .stateIdByHash[source.label.stateHash];
assert.ok(sourceStateId, `source state object missing:${source.label.labelKey}`);
const sourceStore = createWarmachineExternalDagStore(sourceDagRoot, {
  ...sourceStoreBinding,
  create: false,
});
const sourceState = sourceStore.readState(sourceStateId).value;
assert.equal(stableGraphHash(sourceState), source.label.stateHash,
  "source state hash differs from selected route label");

const actor = sourceState.pieces.find((piece) =>
  piece.pieceKey === source.audit.action.actorPieceKey);
const target = sourceState.pieces.find((piece) =>
  piece.pieceKey === source.audit.action.targetPieceKey);
const caster = sourceState.pieces.find((piece) =>
  piece.sideKey === actor?.sideKey && (piece.isWarcaster || piece.isWarlock));
assert.ok(actor && target && caster, "fixed action source pieces incomplete");
const policy = createWarmachineFixedAssassinationPolicyV1({
  targetPieceKey: target.pieceKey,
  casterPieceKey: caster.pieceKey,
  channelerPieceKey: actor.pieceKey,
  firstActionKey: source.audit.action.actionKey,
});
const selected = policy.selectPolicyAction({
  state: sourceState,
  cursor: source.label.cursor,
  stateAlreadyNormalized: true,
  stateHash: source.label.stateHash,
});
assert.equal(selected.action?.actionKey, source.audit.action.actionKey,
  "current policy no longer selects the persisted Raptor slam");

const sourceHash = stableGraphHash(stableGraphValue({
  schemaVersion: "fixed_raptor_action_horizon_source_v3",
  sourceCheckpointId: sourceRestored.checkpointId,
  sourceReportHash: sourceRestored.reportHash,
  sourceLabelKey: source.label.labelKey,
  sourceStateHash: source.label.stateHash,
  actionKey: selected.action.actionKey,
}));
const configHash = stableGraphHash(stableGraphValue({
  schemaVersion: "fixed_raptor_action_horizon_config_v3",
  policyConfig: policy.config,
  actionHorizonDepth: 1,
  lowProbabilityThreshold: "0",
  deferChanceResponseExecution: true,
}));
const targetStoreOptions = {
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  sourceHash,
  configHash,
  partitionCount: 16,
  sortRunRecordLimit: 512,
  maxDeltaDepth: 8,
  maxDeltaRatio: 0.8,
  workerId: "fixed-raptor-action-horizon-v3",
};
const currentCheckpointPath = path.join(targetDagRoot, "checkpoints", "CURRENT");
let restored;
if (fs.existsSync(currentCheckpointPath)) {
  restored = restore(targetDagRoot, targetStoreOptions);
  progress("action_horizon_restored", {
    checkpointId: restored.checkpointId,
    generation: restored.generation,
    entryCount: restored.entryCount,
  });
} else {
  progress("action_horizon_initial_evaluation_start", {
    sourceLabelKey: source.label.labelKey,
    sourceProbability: source.label.cumulativeProbability,
    actionKey: selected.action.actionKey,
  });
  const initialReport = evaluateWarmachineStrictPolicyFrontierProbabilityAndMinV3(
    sourceState,
    policy.selectPolicyAction,
    {
      routeKey: "fixed-raptor-nymara-action-horizon-v3",
      perspectiveSideKey: actor.sideKey,
      initialDepth: 0,
      initialPolicyCursor: source.label.cursor,
      rootAdversarialContextKey: `fixed-action-horizon:${source.label.labelKey}`,
      initialContinuationKey: "continue",
      initialCumulativeProbability: { numerator: "1", denominator: "1" },
      maximumDepth: 1,
      maximumEvaluatedStates: 1,
      lowProbabilityThreshold: "0",
      deferChanceResponseExecution: true,
      includeRuntimeCheckpoint: true,
      classifyState: policy.classifyState,
    },
  );
  const rootAudit = initialReport.stepAudits.find((audit) =>
    audit.labelKey === initialReport.rootLabelKey);
  assert.equal(rootAudit?.stepType, "chance_worklist");
  assert.equal(rootAudit?.action?.actionKey, selected.action.actionKey);
  const persistence = persistWarmachineStrictFrontierExternalDagV1(
    targetDagRoot,
    initialReport,
    initialReport.runtimeCheckpoint,
    {
      ...targetStoreOptions,
      batchId: `initial-${initialReport.reportHash.slice(0, 20)}`,
    },
  );
  assert.equal(persistence.ok, true, "initial action-horizon checkpoint persistence failed");
  restored = restore(targetDagRoot, targetStoreOptions);
  progress("action_horizon_initial_evaluation_complete", {
    checkpointId: restored.checkpointId,
    generation: restored.generation,
    entryCount: restored.entryCount,
  });
}

const continuationOptions = {
  maximumContinuationLabels: batchSize,
  continuationDepthIncrement: 1,
  maximumEvaluatedStatesPerContinuation: 1,
  lowProbabilityThreshold: "0",
  schedulingMode: "chance_response_work_opponent_min_witness_v1",
  deferChanceResponseExecution: true,
};
const buildCurrentActionReport = () => buildWarmachineFixedActionHorizonReportV1({
  probabilityReport: restored.report,
  route: {
    state: sourceState,
    nextAction: selected.action,
    checkpointReceiptHash: sourceRestored.runtimeCheckpointHash,
    transitionCount: Number(source.label.depth || 0),
    sourceDepth: Number(source.label.depth || 0),
    sourceLabelKey: source.label.labelKey,
  },
  casterPieceKey: caster.pieceKey,
  targetPieceKey: target.pieceKey,
  source: {
    hostReceiptHash: targetStoreOptions.hostReceiptHash,
    sourceHash,
    configHash,
    checkpointId: restored.checkpointId,
    probabilityReportHash: restored.reportHash,
    runtimeCheckpointHash: restored.runtimeCheckpointHash,
    upstreamCheckpointId: sourceRestored.checkpointId,
    upstreamReportHash: sourceRestored.reportHash,
  },
});
let completedBatchCount = 0;
let report = buildCurrentActionReport();
while ((maximumBatches === 0 || completedBatchCount < maximumBatches) &&
  (!stopWhenActionValueExact || !report.actionHorizonValue.exact)) {
  const planned = planWarmachineStrictFrontierContinuationBatchV1(
    restored.report,
    restored.entries,
    continuationOptions,
  );
  if (!planned.selected.length) break;
  const eager = restore(
    targetDagRoot,
    targetStoreOptions,
    planned.selected.map((entry) => entry.labelKey),
  );
  progress("action_horizon_batch_start", {
    batchNumber: completedBatchCount + 1,
    selectedCount: planned.selected.length,
    remainingWorkBeforeBatch: planned.ordered.length,
    workerCount,
  });
  const batch = workerCount > 1
    ? await runWarmachineStrictFrontierContinuationBatchParallelV1(
      eager.report,
      eager.runtimeCheckpoint,
      eager.entries,
      {
        ...continuationOptions,
        maximumWorkers: workerCount,
        taskTimeoutMs,
        livenessProbeIntervalMs: 5_000,
        supervisorStatusPath: path.join(
          targetDagRoot,
          "continuation-supervisor",
          "CURRENT.json",
        ),
        supervisorBinding: { sourceHash, configHash },
        workerPolicy: {
          moduleUrl: new URL(
            "../src/benchmark/fixed-assassination-policy-v1.mjs",
            import.meta.url,
          ).href,
          factoryExportName: "createWarmachineFixedAssassinationPolicyV1",
          config: policy.config,
        },
      },
    )
    : runWarmachineStrictFrontierContinuationBatchV1(
      eager.report,
      eager.runtimeCheckpoint,
      eager.entries,
      policy.selectPolicyAction,
      { ...continuationOptions, classifyState: policy.classifyState },
    );
  if (batch.ok !== true) {
    const failedContinuations = (batch.continuationReports || [])
      .filter((continuation) => continuation.ok !== true)
      .map((continuation) => ({
        rootLabelKey: continuation.rootLabelKey,
        chanceMassComplete: continuation.chanceMassComplete,
        lowerMassConserved: continuation.lowerAdversarialPolicyMass?.massConserved,
        upperMassConserved: continuation.upperAdversarialPolicyMass?.massConserved,
        strictRejectedResponseEdgeCount: continuation.strictRejectedResponseEdgeCount,
        strictRejectedDeterministicEdgeCount:
          continuation.strictRejectedDeterministicEdgeCount,
        unresolvedReasons: continuation.unresolvedReasons,
        finalStep: continuation.stepAudits?.at(-1) || null,
      }));
    throw new Error(`action_horizon_continuation_batch_failed:${JSON.stringify({
      strictRejectedResponseEdgeCount: batch.report.strictRejectedResponseEdgeCount,
      strictRejectedDeterministicEdgeCount: batch.report.strictRejectedDeterministicEdgeCount,
      chanceMassComplete: batch.report.chanceMassComplete,
      lowerMassConserved: batch.report.lowerAdversarialPolicyMass?.massConserved,
      upperMassConserved: batch.report.upperAdversarialPolicyMass?.massConserved,
      failedContinuations,
    })}`);
  }
  assert.equal(batch.report.strictRejectedResponseEdgeCount, 0);
  assert.equal(batch.report.strictRejectedDeterministicEdgeCount, 0);
  const persistence = persistWarmachineStrictFrontierExternalDagV1(
    targetDagRoot,
    batch.report,
    batch.runtimeCheckpoint,
    {
      ...targetStoreOptions,
      reusableContentReferences: eager.reusableContentReferences,
      batchId: `batch-${batch.reportHash.slice(0, 20)}`,
    },
  );
  assert.equal(persistence.ok, true, "action-horizon continuation persistence failed");
  restored = restore(targetDagRoot, targetStoreOptions);
  completedBatchCount += 1;
  const remainingWork = restored.entries.filter((entry) =>
    Boolean(entry.chanceResponseWork?.workKey)).length;
  progress("action_horizon_batch_complete", {
    batchNumber: completedBatchCount,
    checkpointId: restored.checkpointId,
    generation: restored.generation,
    completedTaskCount: batch.selectedLabelCount,
    remainingWork,
  });
  report = buildCurrentActionReport();
}

fs.mkdirSync(outputDirectory, { recursive: true });
const jsonPath = path.join(outputDirectory, "fixed-raptor-nymara-action-horizon-v3.json");
const markdownPath = path.join(outputDirectory, "fixed-raptor-nymara-action-horizon-v3.md");
const { markdown, ...jsonReport } = report;
fs.writeFileSync(jsonPath, `${JSON.stringify(jsonReport, null, 2)}\n`, "utf8");
fs.writeFileSync(markdownPath, markdown, "utf8");
process.stdout.write(`${JSON.stringify({
  ok: true,
  complete: report.actionHorizonValue.exact,
  allWorkExecuted: report.counts.remainingChanceResponseWorkLabelCount === 0,
  completedBatchCount,
  checkpointId: restored.checkpointId,
  generation: restored.generation,
  sourceLabelKey: source.label.labelKey,
  selectedAction: {
    actionKey: report.selectedAction.actionKey,
    actionType: report.selectedAction.actionType,
    actorPieceKey: report.selectedAction.actorPieceKey,
    targetPieceKey: report.selectedAction.targetPieceKey,
    expectedDamage: report.selectedAction.expectedDamage,
  },
  actionHorizonValue: report.actionHorizonValue,
  counts: report.counts,
  jsonPath,
  markdownPath,
}, null, 2)}\n`);
