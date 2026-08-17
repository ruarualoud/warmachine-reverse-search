#!/usr/bin/env node

import assert from "node:assert/strict";
import { fork } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateWarmachineStrictPolicyProbabilityAndMinV2,
} from "../src/search/strict-policy-probability-and-min-v2.mjs";
import {
  evaluateWarmachineStrictPolicyFrontierProbabilityAndMinV3,
} from "../src/search/strict-policy-frontier-probability-and-min-v3.mjs";
import {
  stitchWarmachineStrictFrontierReportsV1,
  stitchWarmachineStrictFrontierRuntimeCheckpointsV1,
} from "../src/search/frontier-report-stitch-v1.mjs";
import {
  prepareWarmachineStrictFrontierContinuationBatchV1,
  runWarmachineStrictFrontierContinuationBatchV1,
} from "../src/search/frontier-continuation-batch-v1.mjs";
import { runWarmachineStrictFrontierContinuationBatchParallelV1 } from
  "../src/search/frontier-continuation-parallel-v1.mjs";
import { startWarmachineFrontierContinuationSupervisorV1 } from
  "../src/search/frontier-continuation-supervisor-v1.mjs";
import { canonicalWarmachineActingSideActionsV1 } from
  "../src/search/opponent-response-v1.mjs";
import { enumerateWarmachineBenchmarkActionsV2 } from
  "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import {
  persistWarmachineStrictFrontierExternalDagV1,
  restoreWarmachineStrictFrontierExternalDagV1,
} from "../src/storage/strict-frontier-external-dag-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

function piece(overrides = {}) {
  const boxesRemaining = overrides.boxesRemaining ?? 12;
  return {
    pieceKey: overrides.pieceKey || "piece",
    label: overrides.label || overrides.pieceKey || "Piece",
    sideKey: overrides.sideKey || "player1",
    modelRole: overrides.modelRole || "warrior",
    modelType: overrides.modelType || overrides.modelRole || "warrior",
    position: overrides.position || { xIn: 6, yIn: 6 },
    baseSizeIn: overrides.baseSizeIn ?? 1.18,
    speedIn: 6,
    meleeRangeIn: 1,
    defense: overrides.defense ?? 10,
    armor: overrides.armor ?? 10,
    mat: overrides.mat ?? 8,
    resourceKind: overrides.resourceKind || "none",
    resourcePoints: overrides.resourcePoints ?? 0,
    resourceMax: overrides.resourceMax ?? 0,
    controlRangeIn: overrides.controlRangeIn ?? 12,
    damage: { boxesRemaining, maxBoxes: overrides.maxBoxes ?? boxesRemaining },
    statusTags: [],
    attackProfiles: overrides.attackProfiles || [],
    ...overrides,
  };
}

const state = {
  stateKey: "strict-policy-and-min-two-attacks-v2",
  activeSideKey: "player2",
  phaseKey: "activation",
  turnNumber: 2,
  strictMode: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    piece({
      pieceKey: "defender-lock",
      modelRole: "warlock",
      modelType: "warlock",
      isWarlock: true,
      isWarrior: true,
      resourceKind: "fury",
      resourcePoints: 1,
      resourceMax: 6,
      battlegroupId: "defender-bg",
      boxesRemaining: 5,
      maxBoxes: 5,
    }),
    piece({
      pieceKey: "defender-beast",
      modelRole: "warbeast",
      modelType: "warbeast",
      position: { xIn: 9, yIn: 6 },
      baseSizeIn: 1.57,
      resourceKind: "fury",
      resourcePoints: 0,
      resourceMax: 4,
      controllerPieceKey: "defender-lock",
      battlegroupId: "defender-bg",
      boxesRemaining: 100,
      maxBoxes: 100,
    }),
    piece({
      pieceKey: "attacker",
      sideKey: "player2",
      modelRole: "warjack",
      modelType: "warjack",
      isWarjack: true,
      position: { xIn: 7, yIn: 6 },
      resourceKind: "focus",
      resourcePoints: 1,
      resourceMax: 3,
      attackProfiles: [{
        profileKey: "execution-blade",
        name: "Execution Blade",
        mode: "melee",
        rangeIn: 1,
        power: 20,
        attackStat: 8,
        attackStatKind: "MAT",
      }],
    }),
  ],
  terrain: [],
  scenario: { zones: [], flags: [], score: { player1: 0, player2: 0 }, victoryThreshold: 5 },
};

function targetDestroyed(currentState) {
  const target = currentState.pieces.find((candidate) =>
    candidate.pieceKey === "defender-lock");
  return !target || target.destroyed === true || Number(target.damage?.boxesRemaining || 0) <= 0;
}

const selectTwoAttackPolicy = ({ state: currentState, cursor }) => {
  const scoped = enumerateWarmachineBenchmarkActionsV2(currentState, {
    actorPieceKeys: ["attacker"],
    targetPieceKeys: ["defender-lock"],
    actionFamilyKeys: ["attack_or_effect", "resource", "timing"],
    includeUntargetedActions: false,
  });
  const legalAttacks = canonicalWarmachineActingSideActionsV1(scoped.enumeration)
    .filter((action) => action.targetPieceKey === "defender-lock" &&
      action.metadata?.attackResolution);
  const action = legalAttacks.find((candidate) =>
    Number(cursor) === 0
      ? candidate.actionKey === "attacker:melee:defender-lock:execution-blade:v1"
      : true) || null;
  return {
    scoped,
    action,
    nextPolicyCursor: Number(cursor) + 1,
  };
};
const classifyTwoAttackState = ({ state: currentState, cursor }) => {
  if (targetDestroyed(currentState)) return { outcome: "success", reason: "warlock_destroyed" };
  if (Number(cursor) >= 2) return { outcome: "failure", reason: "two_attack_policy_exhausted" };
  return { outcome: "continue" };
};
const sharedPolicyOptions = {
  routeKey: "verify-strict-policy-and-min-two-attacks-v2",
  perspectiveSideKey: "player2",
  maximumDepth: 3,
  classifyState: classifyTwoAttackState,
};

const report = evaluateWarmachineStrictPolicyProbabilityAndMinV2(
  state,
  selectTwoAttackPolicy,
  sharedPolicyOptions,
);

assert.equal(report.ok, true);
assert.equal(report.exactComplete, true);
assert.equal(report.chanceMassComplete, true);
assert.equal(report.opponentResponseSetComplete, true);
assert.equal(report.strictRejectedResponseEdgeCount, 0);
assert.equal(report.probabilityInterval.exact, true);
assert.equal(report.probabilityInterval.lowerBound.numerator, "1225");
assert.equal(report.probabilityInterval.lowerBound.denominator, "1296");
assert.deepEqual(report.probabilityInterval.lowerBound, report.probabilityInterval.upperBound);
assert.ok(report.stateMergeCount > 0);
assert.ok(report.responseAudits.some((audit) =>
  audit.quantifier === "opponent_and_min" &&
  audit.selectedLowerResponseKey.startsWith("transfer:")));
const acceptedResponseEdges = report.edges.filter((edge) =>
  edge.edgeType === "owned_response" && edge.transitionAccepted === true);
assert.ok(acceptedResponseEdges.length > 0);
assert.ok(acceptedResponseEdges.every((edge) =>
  edge.representativeReceiptHash &&
  edge.equivalentExecutionEvidence.length === edge.chanceClassKeys.length &&
  edge.equivalentExecutionEvidence.every((evidence) =>
    evidence.transitionAccepted === true && evidence.receiptHash)));
assert.ok(report.adversarialChanceEquivalenceAudits.length > 0);
assert.ok(report.adversarialChanceEquivalenceAudits.every((audit) =>
  audit.massConserved === true &&
  audit.inputMassNumerator === audit.groupedMassNumerator));
assert.ok(report.adversarialChanceEquivalenceAudits.some((audit) =>
  audit.mergedClassCount > 0));
assert.equal(report.capabilityBoundary.adversarialResponseVectorEquivalence, true);

const frontierReport = evaluateWarmachineStrictPolicyFrontierProbabilityAndMinV3(
  state,
  selectTwoAttackPolicy,
  { ...sharedPolicyOptions, lowProbabilityThreshold: "0" },
);
assert.equal(frontierReport.ok, true);
assert.equal(frontierReport.exactComplete, true);
assert.deepEqual(frontierReport.probabilityInterval, report.probabilityInterval);
assert.equal(frontierReport.strictRejectedResponseEdgeCount, 0);
assert.equal(frontierReport.strictRejectedDeterministicEdgeCount, 0);
assert.equal(frontierReport.lowerAdversarialPolicyMass.massConserved, true);
assert.equal(frontierReport.upperAdversarialPolicyMass.massConserved, true);
assert.ok(frontierReport.stepAudits.some((audit) =>
  audit.responseSet?.decisionKind === "damage_transfer"));

const thresholdReport = evaluateWarmachineStrictPolicyFrontierProbabilityAndMinV3(
  state,
  selectTwoAttackPolicy,
  { ...sharedPolicyOptions, lowProbabilityThreshold: "0.03" },
);
assert.equal(thresholdReport.ok, true);
assert.equal(thresholdReport.strictRejectedResponseEdgeCount, 0);
assert.equal(thresholdReport.lowerAdversarialPolicyMass.massConserved, true);
assert.equal(thresholdReport.upperAdversarialPolicyMass.massConserved, true);
assert.ok(thresholdReport.frontierAudits.some((audit) => audit.prunedFrontierCount > 0));
const prunedLabels = thresholdReport.labels.filter((label) =>
  label.status === "pruned_low_probability");
assert.ok(prunedLabels.length > 0);
assert.ok(prunedLabels.every((label) =>
  label.incomingEdgeKeys.length > 0 &&
  label.incomingProbabilityContributions.length === label.incomingEdgeKeys.length &&
  label.incomingProbabilityContributions.every((entry) =>
    entry.incomingEdgeKey && entry.contribution.numerator && entry.contribution.denominator)));
assert.match(thresholdReport.frontierMassSemantics, /may exceed one/);

const checkpointReport = evaluateWarmachineStrictPolicyFrontierProbabilityAndMinV3(
  state,
  selectTwoAttackPolicy,
  {
    ...sharedPolicyOptions,
    maximumDepth: 1,
    lowProbabilityThreshold: "0",
    includeRuntimeCheckpoint: true,
  },
);
assert.ok(checkpointReport.runtimeCheckpoint.resumableLabelKeys.length > 0);
assert.ok(checkpointReport.runtimeCheckpoint.receiptCount > 0);
const externalDagRoot = fs.mkdtempSync(path.join(os.tmpdir(), "strict-frontier-dag-"));
const parallelSupervisorStatusPath = path.join(
  externalDagRoot,
  "continuation-supervisor",
  "CURRENT.json",
);
const externalDagOptions = {
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  sourceHash: "verify-strict-frontier-source-v1",
  configHash: "verify-strict-frontier-config-v1",
  partitionCount: 4,
  sortRunRecordLimit: 64,
};
const persisted = persistWarmachineStrictFrontierExternalDagV1(
  externalDagRoot,
  checkpointReport,
  checkpointReport.runtimeCheckpoint,
  externalDagOptions,
);
assert.equal(persisted.ok, true);
assert.ok(persisted.resumableLabelCount > 0);
assert.ok(persisted.receiptCount > 0);
assert.ok(persisted.chanceContributionCount > 0);
assert.ok(persisted.externalDagCounts.C > 0);
const restored = restoreWarmachineStrictFrontierExternalDagV1(
  externalDagRoot,
  externalDagOptions,
);
assert.equal(restored.ok, true);
assert.equal(restored.entryCount, persisted.resumableLabelCount);
assert.equal(restored.report.reportHash, checkpointReport.reportHash);
assert.equal(restored.runtimeCheckpoint.checkpointHash,
  checkpointReport.runtimeCheckpoint.checkpointHash);
assert.ok(restored.reusableContentReferences.contentIdsByKind.label.length > 0);
assert.ok(restored.reusableContentReferences.contentIdsByKind.edge.length > 0);
assert.ok(restored.reusableContentReferences.contentIdsByKind.chance.length > 0);
assert.throws(() => persistWarmachineStrictFrontierExternalDagV1(
  externalDagRoot,
  checkpointReport,
  checkpointReport.runtimeCheckpoint,
  {
    ...externalDagOptions,
    reusableContentReferences: {
      stateIdByHash: restored.reusableContentReferences.stateIdByHash,
      receiptIdByHash: restored.reusableContentReferences.receiptIdByHash,
    },
  },
), /reusable_content_references_not_verified/);
assert.deepEqual(
  restored.entries.map((entry) => entry.labelKey).sort(),
  checkpointReport.runtimeCheckpoint.resumableLabelKeys.slice().sort(),
);
const restoredEntry = restored.entries[0];
const resumedReport = evaluateWarmachineStrictPolicyFrontierProbabilityAndMinV3(
  restoredEntry.state,
  selectTwoAttackPolicy,
  {
    ...sharedPolicyOptions,
    initialDepth: restoredEntry.depth,
    initialPolicyCursor: restoredEntry.cursor,
    rootAdversarialContextKey: restoredEntry.adversarialContextKey,
    initialContinuationKey: restoredEntry.continuationKey,
    initialCumulativeProbability: restoredEntry.cumulativeProbability,
    maximumDepth: restoredEntry.depth + 1,
    maximumEvaluatedStates: 1,
    lowProbabilityThreshold: "0",
    includeRuntimeCheckpoint: true,
  },
);
assert.equal(resumedReport.rootLabelKey, restoredEntry.labelKey);
assert.equal(resumedReport.evaluatedStateCount, 1);
assert.equal(resumedReport.stepAudits[0]?.labelKey, restoredEntry.labelKey);
assert.equal(resumedReport.initialDepth, restoredEntry.depth);
assert.equal(resumedReport.initialCumulativeProbability.numerator,
  restoredEntry.cumulativeProbability.numerator);
assert.equal(resumedReport.initialCumulativeProbability.denominator,
  restoredEntry.cumulativeProbability.denominator);
const stitchedReport = stitchWarmachineStrictFrontierReportsV1(
  checkpointReport,
  [resumedReport],
);
assert.equal(stitchedReport.ok, true);
assert.equal(stitchedReport.ancestorReportHash, checkpointReport.reportHash);
assert.deepEqual(stitchedReport.continuationReportHashes, [resumedReport.reportHash]);
assert.equal(stitchedReport.replacedSuffixCount, 1);
assert.equal(stitchedReport.lowerAdversarialPolicyMass.massConserved, true);
assert.equal(stitchedReport.upperAdversarialPolicyMass.massConserved, true);
const stitchedRoot = stitchedReport.labels.find((label) =>
  label.labelKey === restoredEntry.labelKey);
assert.equal(stitchedRoot.status, resumedReport.labels.find((label) =>
  label.labelKey === restoredEntry.labelKey)?.status);
assert.deepEqual(stitchedRoot.incomingEdgeKeys,
  checkpointReport.labels.find((label) => label.labelKey === restoredEntry.labelKey)
    ?.incomingEdgeKeys);
assert.ok(stitchedReport.edges.every((edge) =>
  stitchedReport.labels.some((label) => label.labelKey === edge.parentLabelKey) &&
  stitchedReport.labels.some((label) => label.labelKey === edge.childLabelKey)));
assert.throws(() => stitchWarmachineStrictFrontierReportsV1(checkpointReport, [{
  ...resumedReport,
  labels: resumedReport.labels.map((label) => label.labelKey === resumedReport.rootLabelKey
    ? { ...label, cursor: "wrong-cursor" }
    : label),
}]), /semantic_identity_mismatch/);
const stitchedRuntimeCheckpoint = stitchWarmachineStrictFrontierRuntimeCheckpointsV1(
  stitchedReport,
  [checkpointReport.runtimeCheckpoint, resumedReport.runtimeCheckpoint],
);
assert.equal(stitchedRuntimeCheckpoint.reportHash, stitchedReport.reportHash);
assert.ok(stitchedRuntimeCheckpoint.stateEntryCount >=
  checkpointReport.runtimeCheckpoint.stateEntryCount);
const persistedStitched = persistWarmachineStrictFrontierExternalDagV1(
  externalDagRoot,
  stitchedReport,
  stitchedRuntimeCheckpoint,
  {
    ...externalDagOptions,
    reusableContentReferences: restored.reusableContentReferences,
  },
);
assert.equal(persistedStitched.ok, true);
assert.ok(persistedStitched.newStateObjectCount < persistedStitched.stateCount);
assert.ok(persistedStitched.newVersionedContentObjectCounts.label <
  persistedStitched.labelCount);
assert.ok(persistedStitched.newVersionedContentObjectCounts.edge <
  persistedStitched.edgeCount, JSON.stringify({
    newVersionedContentObjectCounts: persistedStitched.newVersionedContentObjectCounts,
    labelCount: persistedStitched.labelCount,
    edgeCount: persistedStitched.edgeCount,
  }));
assert.equal(persistedStitched.parentCheckpointId, persisted.checkpointId);
assert.equal(persistedStitched.generation, persisted.generation + 1);
const restoredStitched = restoreWarmachineStrictFrontierExternalDagV1(
  externalDagRoot,
  {
    ...externalDagOptions,
    lazyRuntimePayloads: true,
    maximumEagerFrontierStates: 2,
  },
);
assert.equal(restoredStitched.ok, true);
assert.equal(restoredStitched.runtimePayloadMode, "selected_frontier_eager");
assert.equal(restoredStitched.entries.filter((entry) => entry.state).length, 2);
assert.ok(restoredStitched.lazyStateCount > 0);
assert.equal(restoredStitched.checkpointId, persistedStitched.checkpointId);
assert.equal(restoredStitched.report.reportHash, stitchedReport.reportHash);
assert.equal(restoredStitched.runtimeCheckpoint.checkpointHash,
  stitchedRuntimeCheckpoint.checkpointHash);
assert.deepEqual(
  restoredStitched.entries.map((entry) => entry.labelKey).sort(),
  stitchedRuntimeCheckpoint.resumableLabelKeys.slice().sort(),
);
const independentThresholdBatch = runWarmachineStrictFrontierContinuationBatchV1(
  stitchedReport,
  stitchedRuntimeCheckpoint,
  restoredStitched.entries,
  selectTwoAttackPolicy,
  {
    maximumContinuationLabels: 2,
    lowProbabilityThreshold: "0.01",
    classifyState: classifyTwoAttackState,
  },
);
assert.equal(independentThresholdBatch.ok, true);
assert.equal(independentThresholdBatch.thresholdIsolation.mode,
  "pairwise_disjoint_adversarial_contexts");
assert.equal(independentThresholdBatch.thresholdIsolation.selectedAdversarialContextCount, 2);
assert.deepEqual(independentThresholdBatch.thresholdIsolation.repeatedAdversarialContextKeys, []);
const sharedContextKey = "adversarial-context-shared-threshold-negative";
const sharedContextReportHash = "shared-context-threshold-negative-report";
const selectedIndependentEntries = restoredStitched.entries.slice(0, 2);
const selectedIndependentKeys = new Set(selectedIndependentEntries.map((entry) => entry.labelKey));
const sharedContextReport = {
  ...stitchedReport,
  reportHash: sharedContextReportHash,
  labels: stitchedReport.labels.map((label) => selectedIndependentKeys.has(label.labelKey)
    ? { ...label, adversarialContextKey: sharedContextKey }
    : label),
};
const sharedContextRuntimeCheckpoint = {
  ...stitchedRuntimeCheckpoint,
  reportHash: sharedContextReportHash,
};
const sharedContextEntries = selectedIndependentEntries.map((entry) => ({
  ...entry,
  reportHash: sharedContextReportHash,
  adversarialContextKey: sharedContextKey,
}));
assert.throws(() => prepareWarmachineStrictFrontierContinuationBatchV1(
  sharedContextReport,
  sharedContextRuntimeCheckpoint,
  sharedContextEntries,
  {
    maximumContinuationLabels: 2,
    lowProbabilityThreshold: "0.01",
  },
), /nonzero_threshold_requires_batch_wide_layer_merge/);
const partialContinuationBatch = runWarmachineStrictFrontierContinuationBatchV1(
  restoredStitched.report,
  restoredStitched.runtimeCheckpoint,
  restoredStitched.entries.slice().reverse(),
  selectTwoAttackPolicy,
  {
    maximumContinuationLabels: 2,
    continuationDepthIncrement: 1,
    maximumEvaluatedStatesPerContinuation: 1,
    classifyState: classifyTwoAttackState,
  },
);
const faultBatchOptions = {
  maximumContinuationLabels: 2,
  continuationDepthIncrement: 1,
  maximumEvaluatedStatesPerContinuation: 1,
};
const faultPrepared = prepareWarmachineStrictFrontierContinuationBatchV1(
  restoredStitched.report,
  restoredStitched.runtimeCheckpoint,
  restoredStitched.entries.slice().reverse(),
  faultBatchOptions,
);
assert.equal(faultPrepared.selected.length, 2);
const checkpointPointerBeforeFault = fs.readFileSync(
  path.join(externalDagRoot, "checkpoints", "CURRENT"),
  "utf8",
);
await assert.rejects(() => runWarmachineStrictFrontierContinuationBatchParallelV1(
  restoredStitched.report,
  restoredStitched.runtimeCheckpoint,
  restoredStitched.entries.slice().reverse(),
  {
    ...faultBatchOptions,
    maximumWorkers: 2,
    taskTimeoutMs: 120_000,
    livenessProbeIntervalMs: 100,
    supervisorStatusPath: parallelSupervisorStatusPath,
    supervisorBinding: { fixtureKey: "two-attack-worker-fault" },
    workerPolicy: {
      moduleUrl: new URL("./fixtures/two-attack-worker-policy-v1.mjs", import.meta.url).href,
      factoryExportName: "createFaultInjectedTwoAttackWorkerPolicyV1",
      config: {
        attackerPieceKey: "attacker",
        targetPieceKey: "defender-lock",
        firstActionKey: "attacker:melee:defender-lock:execution-blade:v1",
        maximumAttackCount: 2,
        failLabelKey: faultPrepared.selected[1].labelKey,
      },
    },
  },
), /fixture_worker_failure/);
const failedSupervisorStatus = JSON.parse(fs.readFileSync(
  parallelSupervisorStatusPath,
  "utf8",
));
assert.equal(failedSupervisorStatus.state, "failed");
assert.ok(Object.values(failedSupervisorStatus.tasks).some((task) =>
  task.state === "failed"));
assert.equal(fs.readFileSync(
  path.join(externalDagRoot, "checkpoints", "CURRENT"),
  "utf8",
), checkpointPointerBeforeFault);
const restoredAfterFault = restoreWarmachineStrictFrontierExternalDagV1(
  externalDagRoot,
  externalDagOptions,
);
assert.equal(restoredAfterFault.checkpointId, restoredStitched.checkpointId);
assert.equal(restoredAfterFault.report.reportHash, restoredStitched.report.reportHash);
const parallelContinuationBatch = await runWarmachineStrictFrontierContinuationBatchParallelV1(
  restoredStitched.report,
  restoredStitched.runtimeCheckpoint,
  restoredStitched.entries.slice().reverse(),
  {
    maximumContinuationLabels: 2,
    continuationDepthIncrement: 1,
    maximumEvaluatedStatesPerContinuation: 1,
    maximumWorkers: 2,
    taskTimeoutMs: 120_000,
    livenessProbeIntervalMs: 100,
    supervisorStatusPath: parallelSupervisorStatusPath,
    supervisorBinding: { fixtureKey: "two-attack-worker-valid" },
    workerPolicy: {
      moduleUrl: new URL("./fixtures/two-attack-worker-policy-v1.mjs", import.meta.url).href,
      factoryExportName: "createTwoAttackWorkerPolicyV1",
      config: {
        attackerPieceKey: "attacker",
        targetPieceKey: "defender-lock",
        firstActionKey: "attacker:melee:defender-lock:execution-blade:v1",
        maximumAttackCount: 2,
      },
    },
  },
);
assert.equal(partialContinuationBatch.ok, true);
assert.equal(partialContinuationBatch.selectedLabelCount, 2);
assert.equal(partialContinuationBatch.report.replacedSuffixCount, 2);
assert.equal(partialContinuationBatch.report.lowerAdversarialPolicyMass.massConserved, true);
assert.equal(partialContinuationBatch.report.upperAdversarialPolicyMass.massConserved, true);
assert.ok(partialContinuationBatch.remainingResumableLabelKeys.length <
  restoredStitched.entryCount);
assert.equal(parallelContinuationBatch.ok, true);
assert.equal(parallelContinuationBatch.parallelExecution.maximumWorkers, 2);
assert.equal(parallelContinuationBatch.parallelExecution.completedTaskCount, 2);
assert.equal(parallelContinuationBatch.parallelExecution.supervision.state, "completed");
assert.ok(parallelContinuationBatch.parallelExecution.supervision.heartbeatCount > 0);
const completedSupervisorStatus = JSON.parse(fs.readFileSync(
  parallelSupervisorStatusPath,
  "utf8",
));
assert.equal(completedSupervisorStatus.state, "completed");
assert.ok(completedSupervisorStatus.priorAttempts.some((attempt) =>
  attempt.state === "failed"));
assert.ok(Object.values(completedSupervisorStatus.tasks).every((task) =>
  task.state === "completed" && task.livenessProbeCount > 0));
const crashSupervisorStatusPath = path.join(
  externalDagRoot,
  "continuation-supervisor-crash",
  "CURRENT.json",
);
const crashWorker = fork(fileURLToPath(new URL(
  "./fixtures/frontier-supervisor-crash-v1.mjs",
  import.meta.url,
)), [crashSupervisorStatusPath], {
  serialization: "advanced",
  stdio: ["ignore", "ignore", "inherit", "ipc"],
});
await new Promise((resolve, reject) => {
  crashWorker.once("error", reject);
  crashWorker.once("message", (message) => message?.ready ? resolve() : reject(
    new Error("frontier_supervisor_crash_fixture_not_ready"),
  ));
});
crashWorker.kill("SIGKILL");
await new Promise((resolve) => crashWorker.once("exit", resolve));
const recoveredSupervisor = startWarmachineFrontierContinuationSupervisorV1(
  crashSupervisorStatusPath,
  { fixtureKey: "frontier-supervisor-kill-recovery-v1" },
);
const recoveredRunningStatus = recoveredSupervisor.snapshot();
assert.equal(recoveredRunningStatus.attemptNumber, 2);
assert.equal(recoveredRunningStatus.recoveredInterruptedAttempt, true);
assert.ok(recoveredRunningStatus.priorAttempts.some((attempt) =>
  attempt.state === "running"));
recoveredSupervisor.complete({ recovered: true });
const recoveredCompletedStatus = JSON.parse(fs.readFileSync(
  crashSupervisorStatusPath,
  "utf8",
));
assert.equal(recoveredCompletedStatus.state, "completed");
assert.equal(fs.existsSync(`${crashSupervisorStatusPath}.lock`), false);
assert.equal(parallelContinuationBatch.reportHash, partialContinuationBatch.reportHash);
assert.equal(parallelContinuationBatch.runtimeCheckpointHash,
  partialContinuationBatch.runtimeCheckpointHash);
await assert.rejects(() => runWarmachineStrictFrontierContinuationBatchParallelV1(
  restoredStitched.report,
  restoredStitched.runtimeCheckpoint,
  restoredStitched.entries,
  {
    maximumContinuationLabels: 1,
    maximumWorkers: 1,
    taskTimeoutMs: 120_000,
    workerPolicy: {
      moduleUrl: new URL("./fixtures/two-attack-worker-policy-v1.mjs", import.meta.url).href,
      factoryExportName: "missingPolicyFactory",
      config: {},
    },
  },
), /policy_factory_missing/);
const persistedPartialBatch = persistWarmachineStrictFrontierExternalDagV1(
  externalDagRoot,
  partialContinuationBatch.report,
  partialContinuationBatch.runtimeCheckpoint,
  {
    ...externalDagOptions,
    reusableContentReferences: restoredStitched.reusableContentReferences,
  },
);
assert.equal(persistedPartialBatch.ok, true);
assert.equal(persistedPartialBatch.parentCheckpointId, persistedStitched.checkpointId);
const restoredPartialBatch = restoreWarmachineStrictFrontierExternalDagV1(
  externalDagRoot,
  externalDagOptions,
);
assert.equal(restoredPartialBatch.ok, true);
assert.equal(restoredPartialBatch.entryCount,
  partialContinuationBatch.remainingResumableLabelKeys.length);
const completedContinuationBatch = runWarmachineStrictFrontierContinuationBatchV1(
  restoredPartialBatch.report,
  restoredPartialBatch.runtimeCheckpoint,
  restoredPartialBatch.entries,
  selectTwoAttackPolicy,
  {
    maximumContinuationLabels: restoredPartialBatch.entryCount,
    continuationDepthIncrement: 1,
    maximumEvaluatedStatesPerContinuation: 1,
    classifyState: classifyTwoAttackState,
  },
);
assert.equal(completedContinuationBatch.ok, true);
assert.equal(completedContinuationBatch.exactComplete, true);
assert.deepEqual(completedContinuationBatch.probabilityInterval,
  frontierReport.probabilityInterval);
assert.equal(completedContinuationBatch.remainingResumableLabelKeys.length, 0);
const persistedCompletedBatch = persistWarmachineStrictFrontierExternalDagV1(
  externalDagRoot,
  completedContinuationBatch.report,
  completedContinuationBatch.runtimeCheckpoint,
  externalDagOptions,
);
assert.equal(persistedCompletedBatch.ok, true);
assert.equal(persistedCompletedBatch.parentCheckpointId,
  persistedPartialBatch.checkpointId);
const restoredCompletedBatch = restoreWarmachineStrictFrontierExternalDagV1(
  externalDagRoot,
  externalDagOptions,
);
assert.equal(restoredCompletedBatch.ok, true);
assert.equal(restoredCompletedBatch.entryCount, 0);
fs.rmSync(externalDagRoot, { recursive: true, force: true });
assert.throws(
  () => evaluateWarmachineStrictPolicyProbabilityAndMinV2(state, () => ({}), {
    lowProbabilityThreshold: "0.01",
  }),
  /nonzero_threshold_requires_frontier_merge/,
);

let deterministicActionKey = "";
const deterministicReport = evaluateWarmachineStrictPolicyProbabilityAndMinV2(
  state,
  ({ state: currentState, cursor }) => {
    if (Number(cursor) > 0) {
      return { nodeType: "terminal", outcome: "success", reason: "deterministic_step_complete" };
    }
    const scoped = enumerateWarmachineBenchmarkActionsV2(currentState, {
      actorPieceKeys: ["attacker"],
      actionFamilyKeys: ["timing"],
      includeUntargetedActions: true,
    });
    const action = canonicalWarmachineActingSideActionsV1(scoped.enumeration).find((candidate) =>
      candidate.actorPieceKey === "attacker" && !candidate.metadata?.attackResolution) || null;
    deterministicActionKey = action?.actionKey || "";
    return {
      scoped,
      action,
      deterministicAction: true,
      nextPolicyCursor: 1,
    };
  },
  {
    routeKey: "verify-strict-policy-deterministic-transition-v2",
    perspectiveSideKey: "player2",
    maximumDepth: 2,
  },
);
assert.ok(deterministicActionKey);
assert.equal(deterministicReport.ok, true);
assert.equal(deterministicReport.exactComplete, true);
assert.equal(deterministicReport.probabilityInterval.lowerBound.numerator, "1");
assert.equal(deterministicReport.deterministicTransitionAudits.length, 1);
assert.equal(deterministicReport.deterministicTransitionAudits[0].transitionAccepted, true);
assert.ok(deterministicReport.deterministicTransitionAudits[0].receiptHash);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: report.schemaVersion,
  reportHash: report.reportHash,
  probabilityInterval: report.probabilityInterval,
  evaluatedStateCount: report.evaluatedStateCount,
  stateMergeCount: report.stateMergeCount,
  nodeCount: report.nodeCount,
  edgeCount: report.edgeCount,
  chanceAuditCount: report.chanceAudits.length,
  adversarialChanceEquivalenceAuditCount:
    report.adversarialChanceEquivalenceAudits.length,
  mergedChanceClassCount: report.adversarialChanceEquivalenceAudits.reduce(
    (sum, audit) => sum + audit.mergedClassCount,
    0,
  ),
  responseAuditCount: report.responseAudits.length,
  deterministicActionKey,
  deterministicReportHash: deterministicReport.reportHash,
  frontierReportHash: frontierReport.reportHash,
  frontierProbabilityInterval: frontierReport.probabilityInterval,
  thresholdReportHash: thresholdReport.reportHash,
  thresholdProbabilityInterval: thresholdReport.probabilityInterval,
  thresholdLowerPolicyMass: thresholdReport.lowerAdversarialPolicyMass,
  thresholdUpperPolicyMass: thresholdReport.upperAdversarialPolicyMass,
  thresholdPrunedLabelCount: prunedLabels.length,
  checkpointReportHash: checkpointReport.reportHash,
  externalDagPersistenceHash: persisted.persistenceHash,
  externalDagRestoreHash: restored.restoreHash,
  restoredFrontierCount: restored.entryCount,
  resumedReportHash: resumedReport.reportHash,
  resumedRootLabelKey: resumedReport.rootLabelKey,
  resumedActionKey: resumedReport.stepAudits[0]?.action?.actionKey,
  stitchedReportHash: stitchedReport.reportHash,
  stitchedProbabilityInterval: stitchedReport.probabilityInterval,
  stitchedUnresolvedReasons: stitchedReport.unresolvedReasons,
  stitchedRuntimeCheckpointHash: stitchedRuntimeCheckpoint.checkpointHash,
  stitchedExternalDagCheckpointId: persistedStitched.checkpointId,
  stitchedExternalDagGeneration: persistedStitched.generation,
  stitchedRestoredFrontierCount: restoredStitched.entryCount,
  partialContinuationBatchHash: partialContinuationBatch.batchHash,
  partialContinuationBatchSelectedCount: partialContinuationBatch.selectedLabelCount,
  partialContinuationBatchRemainingCount:
    partialContinuationBatch.remainingResumableLabelKeys.length,
  completedContinuationBatchHash: completedContinuationBatch.batchHash,
  completedContinuationBatchReportHash: completedContinuationBatch.reportHash,
  completedContinuationBatchProbabilityInterval:
    completedContinuationBatch.probabilityInterval,
  completedContinuationBatchExternalGeneration: persistedCompletedBatch.generation,
  parallelContinuationBatchHash: parallelContinuationBatch.batchHash,
  parallelExecutionHash: parallelContinuationBatch.parallelExecution.parallelExecutionHash,
}, null, 2));
