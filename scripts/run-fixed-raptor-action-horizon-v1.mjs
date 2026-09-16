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
import {
  persistWarmachineStrictFrontierExternalDagV1,
  restoreWarmachineStrictFrontierExternalDagV1,
} from "../src/storage/strict-frontier-external-dag-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceSnapshotPath = path.resolve(
  process.env.WARMACHINE_RAPTOR_ACTION_SOURCE_SNAPSHOT ||
    path.join(projectRoot, ".scratch/current-host-raptor-nymara-action-source-v1.json"),
);
const outputDirectory = path.resolve(
  process.env.WARMACHINE_RAPTOR_ACTION_REPORT_OUTPUT ||
    path.join(projectRoot, "build/reports"),
);
const requestedActionKey = String(process.env.WARMACHINE_RAPTOR_ACTION_KEY || "");
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

assert.ok(fs.existsSync(sourceSnapshotPath),
  `fixed Raptor action source snapshot missing:${sourceSnapshotPath}`);
const sourceSnapshot = JSON.parse(fs.readFileSync(sourceSnapshotPath, "utf8"));
assert.equal(sourceSnapshot.schemaVersion, "warmachine_fixed_raptor_action_source_v1");
assert.equal(sourceSnapshot.hostReceiptHash, warmachineHost.receipt.receiptHash,
  "source snapshot and current Host receipt differ");
const sourceState = sourceSnapshot.sourceState;
assert.equal(stableGraphHash(sourceState), sourceSnapshot.sourceStateHash,
  "source snapshot state hash differs");
const declaredActions = sourceSnapshot.legalTargetActions || [];
const requestedAction = requestedActionKey
  ? declaredActions.find((action) => action.actionKey === requestedActionKey)
  : declaredActions.find((action) => action.actionType === "slam_power_attack") ||
    declaredActions[0];
assert.ok(requestedAction, `requested fixed Raptor action unavailable:${requestedActionKey}`);
const actionSlug = `${String(requestedAction.actionType || "action")}-${stableGraphHash(
  requestedAction.actionKey,
).slice(0, 12)}`.replace(/[^a-zA-Z0-9_-]+/g, "-");
const targetDagRoot = path.resolve(
  process.env.WARMACHINE_RAPTOR_ACTION_DAG ||
    path.join(projectRoot, `.scratch/current-host-raptor-nymara-${actionSlug}-horizon-v4`),
);
const reportBaseName = String(
  process.env.WARMACHINE_RAPTOR_ACTION_REPORT_BASENAME ||
    `fixed-raptor-nymara-${actionSlug}-action-horizon-v4`,
);
const sourceLabelKey = `fixed-raptor-source-${String(sourceSnapshot.sourceHash).slice(0, 24)}`;
const actor = sourceState.pieces.find((piece) =>
  piece.pieceKey === sourceSnapshot.channelerPieceKey);
const target = sourceState.pieces.find((piece) =>
  piece.pieceKey === sourceSnapshot.targetPieceKey);
const caster = sourceState.pieces.find((piece) =>
  piece.pieceKey === sourceSnapshot.casterPieceKey);
assert.ok(actor && target && caster, "fixed action source pieces incomplete");
const policy = createWarmachineFixedAssassinationPolicyV1({
  targetPieceKey: target.pieceKey,
  casterPieceKey: caster.pieceKey,
  channelerPieceKey: actor.pieceKey,
  firstActionKey: requestedAction.actionKey,
});
const selected = policy.selectPolicyAction({
  state: sourceState,
  cursor: 0,
  stateAlreadyNormalized: true,
  stateHash: sourceSnapshot.sourceStateHash,
});
assert.equal(selected.action?.actionKey, requestedAction.actionKey,
  "current policy no longer selects the declared Raptor action");

const sourceHash = stableGraphHash(stableGraphValue({
  schemaVersion: "fixed_raptor_action_horizon_source_v4",
  sourceSnapshotHash: sourceSnapshot.sourceHash,
  sourceLabelKey,
  sourceStateHash: sourceSnapshot.sourceStateHash,
  actionKey: selected.action.actionKey,
}));
const configHash = stableGraphHash(stableGraphValue({
  schemaVersion: "fixed_raptor_action_horizon_config_v4",
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
  workerId: `fixed-raptor-action-horizon-v4-${actionSlug}`,
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
    sourceLabelKey,
    sourceSnapshotHash: sourceSnapshot.sourceHash,
    actionKey: selected.action.actionKey,
  });
  const initialReport = evaluateWarmachineStrictPolicyFrontierProbabilityAndMinV3(
    sourceState,
    policy.selectPolicyAction,
    {
      routeKey: `fixed-raptor-nymara-action-horizon-v4:${actionSlug}`,
      perspectiveSideKey: actor.sideKey,
      initialDepth: 0,
      initialPolicyCursor: 0,
      rootAdversarialContextKey: `fixed-action-horizon:${sourceLabelKey}:${actionSlug}`,
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
    checkpointReceiptHash: sourceSnapshot.routeCheckpointReceiptHash,
    transitionCount: sourceSnapshot.routeTransitionCount,
    sourceDepth: 0,
    sourceLabelKey,
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
    sourceSnapshotHash: sourceSnapshot.sourceHash,
    sourceStateHash: sourceSnapshot.sourceStateHash,
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
const jsonPath = path.join(outputDirectory, `${reportBaseName}.json`);
const markdownPath = path.join(outputDirectory, `${reportBaseName}.md`);
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
  sourceLabelKey,
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
