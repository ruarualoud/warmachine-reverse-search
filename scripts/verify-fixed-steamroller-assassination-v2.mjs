#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  bindWarmachineBenchmarkExplicitMovementPathV2,
  bindWarmachineTwoFrontsOpeningV2,
  executeWarmachineBenchmarkAssassinationRouteV2,
} from "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import { createWarmachineFixedAssassinationPolicyV1 } from
  "../src/benchmark/fixed-assassination-policy-v1.mjs";
import {
  buildWarmachineRosterPoolSourceEvidenceV2,
  runWarmachineNestedRosterDeploymentSearchV2,
} from "../src/construction/nested-roster-deployment-v2.mjs";
import { buildWarmachineTypedInteractionGraphV2 } from
  "../src/graph/typed-interaction-graph-v2.mjs";
import { certifyWarmachineExecutedTerminalRouteStrictV2 } from
  "../src/reverse/strict-route-witness-v2.mjs";
import { runWarmachineStrictFrontierContinuationBatchV1 } from
  "../src/search/frontier-continuation-batch-v1.mjs";
import { runWarmachineStrictFrontierContinuationBatchParallelV1 } from
  "../src/search/frontier-continuation-parallel-v1.mjs";
import { evaluateWarmachineStrictPolicyFrontierProbabilityAndMinV3 } from
  "../src/search/strict-policy-frontier-probability-and-min-v3.mjs";
import {
  persistWarmachineStrictFrontierExternalDagV1,
  restoreWarmachineStrictFrontierExternalDagV1,
} from "../src/storage/strict-frontier-external-dag-v1.mjs";
import { resolveWarmachineHostPath, warmachineHost } from "../src/warmachine-host-runtime.mjs";

const baseDirectory = resolveWarmachineHostPath(
  "build/warmachine-ai/sepsira-swarm-vs-fane-v20260805",
);
const poolPath = path.join(baseDirectory, "strict-construction-pool-v1", "report.json");
const roomStorePath = path.join(baseDirectory, "local-layer3", "state.json");
const poolBytes = fs.readFileSync(poolPath);
const pool = JSON.parse(poolBytes);
const sourceMetadata = {
  sourceContentHash: createHash("sha256").update(poolBytes).digest("hex"),
  sourceSchemaVersion: pool.schemaVersion,
  exactListLegality: pool.quality.exactListLegality,
  forceBuilderContract: pool.algorithm.finalLegality,
  remoteVersion: pool.source.remoteVersion,
  exhaustiveAllFactionRosters: pool.algorithm.exhaustiveAllLists,
};
const roomStore = JSON.parse(fs.readFileSync(roomStorePath, "utf8"));
const templateRoom = roomStore.roomsById?.["room_f1823ced-bf71-4392-8669-c6330d237efb"];
assert.ok(templateRoom);
const cryxList = pool.cryxLists.find((list) =>
  /sepsira/i.test(String(list.leader || "")) &&
  list.entries.filter((entry) =>
    /mechanithrall swarm\s+#\d+$/i.test(String(entry.name || ""))).length === 6);
const faneList = pool.faneLists[0];
assert.ok(cryxList && faneList);
const attackerFormationArchetypeKey = String(
  process.env.WARMACHINE_ASSASSINATION_ATTACKER_FORMATION || "center_break",
);
const formationArchetypeKeysBySide = {
  player1: [attackerFormationArchetypeKey],
  player2: ["balanced_layered"],
};

const cacheBindingHash = createHash("sha256").update(JSON.stringify({
  sourceContentHash: sourceMetadata.sourceContentHash,
  templateRoom,
  cryxList,
  faneList,
  formationArchetypeKeysBySide,
  seed: "fixed-steamroller-benchmark-v2",
})).digest("hex");
const cachePath = path.resolve(
  `.scratch/fixed-steamroller-assassination-opening-${attackerFormationArchetypeKey}-v2.json`,
);
let opening = null;
if (process.env.WARMACHINE_FIXED_OPENING_CACHE === "1" && fs.existsSync(cachePath)) {
  const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  if (cached.cacheBindingHash === cacheBindingHash) opening = cached.opening;
}
if (!opening) {
  const nested = runWarmachineNestedRosterDeploymentSearchV2({
    templateRoom,
    rosterPoolsBySide: { player1: [cryxList], player2: [faneList] },
    sourceEvidenceBySide: {
      player1: buildWarmachineRosterPoolSourceEvidenceV2(pool.cryxLists, sourceMetadata),
      player2: buildWarmachineRosterPoolSourceEvidenceV2(pool.faneLists, sourceMetadata),
    },
    maximumSelectedRostersBySide: { player1: 1, player2: 1 },
    maximumRosterPairs: 1,
    maximumArchetypesPerSide: 1,
    maximumFormationPairsPerRosterPair: 1,
    formationArchetypeKeysBySide,
    firstPlayerSideKeys: ["player1"],
    includeStates: true,
    seed: "fixed-steamroller-benchmark-v2",
    searchMode: "fixed_roster_to_deployment",
  });
  assert.equal(nested.counts.strictLegalOpeningCount, 1);
  opening = nested.openings[0];
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, `${JSON.stringify({
    cacheSchemaVersion: "fixed_steamroller_assassination_opening_cache_v2",
    cacheBindingHash,
    opening,
  })}\n`, "utf8");
}
assert.equal(opening.strictDeploymentLegal, true);
assert.equal(opening.rosterPointLedger.sides.player1.rosterPoints, 100);
assert.equal(opening.rosterPointLedger.sides.player2.rosterPoints, 100);

const bound = bindWarmachineTwoFrontsOpeningV2(opening.state);
const raptors = bound.state.pieces.filter((piece) =>
  piece.sideKey === "player1" && /raptor/i.test(`${piece.label || ""} ${piece.name || ""}`));
const raptor = attackerFormationArchetypeKey === "center_break"
  ? raptors[0]
  : raptors.sort((left, right) => Math.abs(Number(left.position?.yIn || 0) - 24) -
    Math.abs(Number(right.position?.yIn || 0) - 24) || left.pieceKey.localeCompare(right.pieceKey))[0];
const sepsira = bound.state.pieces.find((piece) =>
  piece.sideKey === "player1" && (piece.isWarcaster || piece.isWarlock));
const nymara = bound.state.pieces.find((piece) =>
  piece.sideKey === "player2" && (piece.isWarcaster || piece.isWarlock));
assert.ok(raptor && sepsira && nymara);
const routeOpening = bindWarmachineBenchmarkExplicitMovementPathV2(bound.state, {
  actorPieceKey: raptor.pieceKey,
  actionType: "run",
  pathKey: "raptor-north-of-center-obstruction-run-v2",
  label: "Raptor north-side run around the center obstruction",
  waypoints: attackerFormationArchetypeKey === "center_break"
    ? [{ xIn: 21, yIn: 28.3 }, { xIn: 26.35, yIn: 29.25 }]
    : [{ xIn: 15.3, yIn: 29.8 }, { xIn: 20.25, yIn: 31.2 }],
});

const centerBreak = attackerFormationArchetypeKey === "center_break";
const probabilityProbe = process.env.WARMACHINE_ASSASSINATION_PROBE === "probability";
const assassinationRouteOptions = {
  routeKey: "fixed-two-fronts-assassination-route-v2",
  raptorPieceKey: raptor.pieceKey,
  attackerLeaderPieceKey: sepsira.pieceKey,
  targetLeaderPieceKey: nymara.pieceKey,
  raptorWaypoint: centerBreak ? { xIn: 26.35, yIn: 29.25 } : { xIn: 20.25, yIn: 31.2 },
  attackerLeaderWaypoint: { xIn: 14, yIn: 24 },
  clearanceActivationGroupKeys: centerBreak
    ? []
    : ["player1_necrosurgeon_initiates_19", "player1_necrosurgeon_initiates_16"],
  clearanceWaypointByGroupKey: centerBreak ? {} : {
    player1_necrosurgeon_initiates_19: { xIn: 13.12, yIn: 20.53 },
    player1_necrosurgeon_initiates_16: { xIn: 13.12, yIn: 37.47 },
  },
  stopBeforeFirstStochasticAction: probabilityProbe,
};
const probabilityCheckpointCachePath = path.resolve(
  `.scratch/fixed-steamroller-assassination-probability-checkpoint-${attackerFormationArchetypeKey}-v2.json`,
);
const probabilityCheckpointCacheBindingHash = createHash("sha256").update(JSON.stringify({
  cacheBindingHash,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  routeOpening,
  assassinationRouteOptions,
})).digest("hex");
let route = null;
if (probabilityProbe && process.env.WARMACHINE_FIXED_OPENING_CACHE === "1" &&
    fs.existsSync(probabilityCheckpointCachePath)) {
  const cached = JSON.parse(fs.readFileSync(probabilityCheckpointCachePath, "utf8"));
  if (cached.cacheBindingHash === probabilityCheckpointCacheBindingHash) {
    route = { ...cached.route, ok: cached.route?.ok ?? true };
  }
}
if (!route) {
  route = executeWarmachineBenchmarkAssassinationRouteV2(routeOpening, assassinationRouteOptions);
  if (probabilityProbe && route.ok) {
    fs.writeFileSync(probabilityCheckpointCachePath, `${JSON.stringify({
      cacheSchemaVersion: "fixed_steamroller_assassination_probability_checkpoint_cache_v2",
      cacheBindingHash: probabilityCheckpointCacheBindingHash,
      route: {
        ok: true,
        schemaVersion: route.schemaVersion,
        routeKey: route.routeKey,
        checkpointReceiptHash: route.checkpointReceiptHash,
        transitionCount: route.transitionCount,
        nextAction: route.nextAction,
        failures: route.failures,
        state: route.state,
        receipts: route.receipts,
      },
    })}\n`, "utf8");
  }
}
if (!route.ok) {
  fs.writeFileSync(path.resolve(".scratch/fixed-assassination-after-first-turn-v2.json"),
    `${JSON.stringify({
      cacheBindingHash,
      state: route.stages?.attackerFirstTurn?.state || null,
      activationReceipts: route.stages?.attackerFirstTurn?.activationReceipts || [],
    })}\n`, "utf8");
  fs.writeFileSync(path.resolve(".scratch/fixed-assassination-route-failure-v2.json"),
    `${JSON.stringify({
      cacheBindingHash,
      failures: route.failures,
      state: route.state,
      raptorActivation: route.stages?.raptorActivation || null,
      casterActivation: route.stages?.casterActivation || null,
    })}\n`, "utf8");
  console.error(JSON.stringify({
    failures: route.failures,
    transitionCount: route.transitionCount,
    terminalEvents: route.terminalEvents,
    positionTimeline: route.positionTimeline,
    firstTurnMovementActivations: route.stages?.attackerFirstTurn?.activationReceipts
      ?.filter((activation) => [
        "player1_necrosurgeon_initiates_19",
        raptor.pieceKey,
        sepsira.pieceKey,
      ].includes(activation.activationGroupKey))
      .map((activation) => ({
        activationGroupKey: activation.activationGroupKey,
        reason: activation.reason,
        selectionAudit: activation.selectionAudit?.map((row) => ({
          stepIndex: row.stepIndex,
          selectedAction: row.selectedAction,
          rejectedActions: (row.rejectedActions || []).slice(0, 8),
        })),
      })) || [],
    casterActivation: route.stages?.casterActivation?.selectionAudit || [],
  }, null, 2));
}
if (probabilityProbe) {
  assert.equal(route.ok, true, JSON.stringify(route.failures));
  assert.equal(route.schemaVersion,
    "warmachine_fixed_benchmark_assassination_chance_checkpoint_v2");
  assert.ok(route.nextAction?.actionKey);
  const probabilityMaximumDepth = Math.max(1, Number(
    process.env.WARMACHINE_ASSASSINATION_PROBABILITY_DEPTH || 1,
  ));
  const probabilityMaximumStates = Math.max(1, Number(
    process.env.WARMACHINE_ASSASSINATION_PROBABILITY_MAX_STATES || 24,
  ));
  const probabilityThreshold = String(
    process.env.WARMACHINE_ASSASSINATION_PROBABILITY_THRESHOLD || "0",
  );
  const fixedAssassinationPolicy = createWarmachineFixedAssassinationPolicyV1({
    targetPieceKey: nymara.pieceKey,
    casterPieceKey: sepsira.pieceKey,
    channelerPieceKey: raptor.pieceKey,
    firstActionKey: route.nextAction.actionKey,
  });
  const fixedAssassinationPolicySelector = fixedAssassinationPolicy.selectPolicyAction;
  const externalDagRoot = String(
    process.env.WARMACHINE_ASSASSINATION_EXTERNAL_DAG_ROOT || "",
  );
  const continuationBatchSize = Math.max(0, Number(
    process.env.WARMACHINE_ASSASSINATION_CONTINUATION_BATCH_SIZE || 0,
  ));
  const continuationWorkerCount = Math.max(1, Number(
    process.env.WARMACHINE_ASSASSINATION_CONTINUATION_WORKERS || 1,
  ));
  const externalDagOptions = externalDagRoot ? {
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    sourceHash: probabilityCheckpointCacheBindingHash,
    configHash: createHash("sha256").update(JSON.stringify({
      policyVersion: "fixed-sepsira-assassination-frontier-policy-v1",
      attackerFormationArchetypeKey,
      targetPieceKey: nymara.pieceKey,
      lowProbabilityThreshold: probabilityThreshold,
    })).digest("hex"),
    partitionCount: 16,
    sortRunRecordLimit: 512,
    workerId: "fixed-sepsira-assassination",
  } : null;
  const externalDagRestoreOptions = externalDagRoot ? {
    ...externalDagOptions,
    lazyRuntimePayloads: true,
    maximumEagerFrontierStates: Math.max(1, continuationBatchSize),
  } : null;
  let probability = null;
  let externalDagPersistence = null;
  let externalDagRestore = null;
  let externalDagContinuationBatch = null;
  const currentCheckpointPath = externalDagRoot
    ? path.join(externalDagRoot, "checkpoints", "CURRENT")
    : "";
  if (currentCheckpointPath && fs.existsSync(currentCheckpointPath)) {
    externalDagRestore = restoreWarmachineStrictFrontierExternalDagV1(
      externalDagRoot,
      externalDagRestoreOptions,
    );
    assert.equal(externalDagRestore.ok, true);
    probability = externalDagRestore.report;
  } else {
    probability = evaluateWarmachineStrictPolicyFrontierProbabilityAndMinV3(
      route.state,
      fixedAssassinationPolicySelector,
      {
        routeKey: "fixed-two-fronts-assassination-probability-and-min-v2",
        perspectiveSideKey: "player1",
        maximumDepth: probabilityMaximumDepth,
        maximumEvaluatedStates: probabilityMaximumStates,
        lowProbabilityThreshold: probabilityThreshold,
        includeRuntimeCheckpoint: Boolean(externalDagRoot),
      },
    );
    if (externalDagRoot) {
      externalDagPersistence = persistWarmachineStrictFrontierExternalDagV1(
        externalDagRoot,
        probability,
        probability.runtimeCheckpoint,
        {
          ...externalDagOptions,
          batchId: `fixed-${probability.reportHash.slice(0, 20)}`,
        },
      );
      assert.equal(externalDagPersistence.ok, true);
      externalDagRestore = restoreWarmachineStrictFrontierExternalDagV1(
        externalDagRoot,
        externalDagRestoreOptions,
      );
      assert.equal(externalDagRestore.ok, true);
      probability = externalDagRestore.report;
    }
  }
  if (continuationBatchSize > 0 && externalDagRestore?.entries.length) {
    const continuationOptions = {
        maximumContinuationLabels: continuationBatchSize,
        continuationDepthIncrement: 1,
        maximumEvaluatedStatesPerContinuation: 1,
        lowProbabilityThreshold: probabilityThreshold,
      };
    externalDagContinuationBatch = continuationWorkerCount > 1
      ? await runWarmachineStrictFrontierContinuationBatchParallelV1(
        externalDagRestore.report,
        externalDagRestore.runtimeCheckpoint,
        externalDagRestore.entries,
        {
          ...continuationOptions,
          maximumWorkers: continuationWorkerCount,
          taskTimeoutMs: 15 * 60 * 1_000,
          livenessProbeIntervalMs: 5_000,
          supervisorStatusPath: path.join(
            externalDagRoot,
            "continuation-supervisor",
            "CURRENT.json",
          ),
          supervisorBinding: {
            hostReceiptHash: externalDagOptions.hostReceiptHash,
            sourceHash: externalDagOptions.sourceHash,
            configHash: externalDagOptions.configHash,
          },
          workerPolicy: {
            moduleUrl: new URL(
              "../src/benchmark/fixed-assassination-policy-v1.mjs",
              import.meta.url,
            ).href,
            factoryExportName: "createWarmachineFixedAssassinationPolicyV1",
            config: fixedAssassinationPolicy.config,
          },
        },
      )
      : runWarmachineStrictFrontierContinuationBatchV1(
        externalDagRestore.report,
        externalDagRestore.runtimeCheckpoint,
        externalDagRestore.entries,
        fixedAssassinationPolicySelector,
        {
          ...continuationOptions,
          classifyState: fixedAssassinationPolicy.classifyState,
        },
      );
    assert.equal(externalDagContinuationBatch.ok, true);
    externalDagPersistence = persistWarmachineStrictFrontierExternalDagV1(
      externalDagRoot,
      externalDagContinuationBatch.report,
      externalDagContinuationBatch.runtimeCheckpoint,
      {
        ...externalDagOptions,
        reusableContentReferences: externalDagRestore.reusableContentReferences,
        batchId: `fixed-${externalDagContinuationBatch.reportHash.slice(0, 20)}`,
      },
    );
    assert.equal(externalDagPersistence.ok, true);
    externalDagRestore = restoreWarmachineStrictFrontierExternalDagV1(
      externalDagRoot,
      externalDagRestoreOptions,
    );
    assert.equal(externalDagRestore.ok, true);
    probability = externalDagRestore.report;
  }
  assert.equal(probability.strictRejectedResponseEdgeCount, 0);
  assert.equal(probability.strictRejectedDeterministicEdgeCount, 0);
  if (externalDagContinuationBatch) {
    assert.deepEqual(
      probability.unresolvedReasons.filter((reason) => ![
        "maximum_evaluated_states_reached",
        "maximum_policy_depth_reached",
      ].includes(reason)),
      [],
      "fixed continuation batches must fail instead of publishing semantic unresolved actions",
    );
  }
  if (!externalDagContinuationBatch && probabilityMaximumDepth === 1 &&
      probabilityThreshold === "0") {
    assert.deepEqual(probability.unresolvedReasons, ["maximum_policy_depth_reached"]);
  }
  const chanceAudits = probability.stepAudits.filter((audit) => audit.stepType === "chance")
    .map((audit) => audit.chanceAudit);
  assert.equal(chanceAudits[0]?.actionKey, route.nextAction.actionKey);
  assert.deepEqual(chanceAudits[0]?.provablyInactiveSuccessorEffectTypes, [
    "excarnate_box_living_enemy_warrior_rfp_add_grunt_boxed_rfp_return_grunt",
  ]);
  let externalDagResume = null;
  if (externalDagRoot && continuationBatchSize === 0) {
    const resumeEntry = externalDagRestore.entries[0] || null;
    if (resumeEntry) {
      externalDagResume = evaluateWarmachineStrictPolicyFrontierProbabilityAndMinV3(
        resumeEntry.state,
        fixedAssassinationPolicySelector,
        {
          routeKey: "fixed-two-fronts-assassination-resumed-frontier-v3",
          perspectiveSideKey: "player1",
          initialDepth: resumeEntry.depth,
          initialPolicyCursor: resumeEntry.cursor,
          rootAdversarialContextKey: resumeEntry.adversarialContextKey,
          initialContinuationKey: resumeEntry.continuationKey,
          initialCumulativeProbability: resumeEntry.cumulativeProbability,
          maximumDepth: resumeEntry.depth + 1,
          maximumEvaluatedStates: 1,
          lowProbabilityThreshold: probabilityThreshold,
        },
      );
      assert.equal(externalDagResume.rootLabelKey, resumeEntry.labelKey);
      assert.equal(externalDagResume.evaluatedStateCount, 1);
    }
  }
  const compactOutput = process.env.WARMACHINE_ASSASSINATION_COMPACT_OUTPUT === "1";
  const parallelExecution = externalDagContinuationBatch?.parallelExecution || null;
  const compactParallelExecution = parallelExecution ? (() => {
    const taskAudits = parallelExecution.taskAudits || [];
    const executionTimes = taskAudits.map((audit) =>
      Number(audit.executionAndReturnMs || 0));
    const startupTimes = taskAudits.map((audit) =>
      Number(audit.queueAndStartupMs || 0));
    return {
      schemaVersion: parallelExecution.schemaVersion,
      parallelExecutionHash: parallelExecution.parallelExecutionHash,
      maximumWorkers: parallelExecution.maximumWorkers,
      taskCount: parallelExecution.taskCount,
      completedTaskCount: parallelExecution.completedTaskCount,
      workerPolicy: parallelExecution.workerPolicy,
      supervision: parallelExecution.supervision,
      timing: {
        maximumExecutionAndReturnMs: Math.max(0, ...executionTimes),
        minimumExecutionAndReturnMs: executionTimes.length
          ? Math.min(...executionTimes)
          : 0,
        maximumQueueAndStartupMs: Math.max(0, ...startupTimes),
        totalLivenessProbeCount: taskAudits.reduce((sum, audit) =>
          sum + Number(audit.livenessProbeCount || 0), 0),
      },
      fullTaskAuditCount: taskAudits.length,
    };
  })() : null;
  console.log(JSON.stringify({
    ok: true,
    schemaVersion: "verify_fixed_steamroller_assassination_probability_checkpoint_v2",
    checkpointReceiptHash: route.checkpointReceiptHash,
    checkpointTransitionCount: route.transitionCount,
    nextAction: route.nextAction,
    probabilityReportHash: probability.reportHash,
    probabilitySettings: {
      maximumDepth: probabilityMaximumDepth,
      maximumEvaluatedStates: probabilityMaximumStates,
      lowProbabilityThreshold: probabilityThreshold,
    },
    exactComplete: probability.exactComplete,
    probabilityInterval: probability.probabilityInterval,
    chanceMassComplete: probability.chanceMassComplete,
    opponentResponseSetComplete: probability.opponentResponseSetComplete,
    evaluatedStateCount: probability.evaluatedStateCount,
    stateMergeCount: probability.stateMergeCount,
    deterministicTransitionCount: probability.stepAudits.filter((audit) =>
      audit.stepType === "deterministic").length,
    strictRejectedResponseEdgeCount: probability.strictRejectedResponseEdgeCount,
    strictRejectedDeterministicEdgeCount: probability.strictRejectedDeterministicEdgeCount,
    unresolvedReasons: probability.unresolvedReasons,
    chanceAudits: compactOutput ? chanceAudits.slice(-4) : chanceAudits,
    stepActionAudits: (compactOutput ? probability.stepAudits.slice(-12) : probability.stepAudits)
      .map((audit) => ({
      labelKey: audit.labelKey,
      stepType: audit.stepType,
      action: audit.action,
      reason: audit.reason,
      responseSet: audit.responseSet,
    })),
    frontierAudits: compactOutput ? {
      count: probability.frontierAudits.length,
      tail: probability.frontierAudits.slice(-4),
    } : probability.frontierAudits,
    lowerAdversarialPolicyMass: probability.lowerAdversarialPolicyMass,
    upperAdversarialPolicyMass: probability.upperAdversarialPolicyMass,
    externalDagPersistence: externalDagPersistence ? {
      persistenceHash: externalDagPersistence.persistenceHash,
      checkpointId: externalDagPersistence.checkpointId,
      resumableLabelCount: externalDagPersistence.resumableLabelCount,
      resumableStateCount: externalDagPersistence.resumableStateCount,
      externalDagCounts: externalDagPersistence.externalDagCounts,
    } : null,
    externalDagRestore: externalDagRestore ? {
      restoreHash: externalDagRestore.restoreHash,
      checkpointId: externalDagRestore.checkpointId,
      generation: externalDagRestore.generation,
      entryCount: externalDagRestore.entryCount,
    } : null,
    externalDagContinuationBatch: externalDagContinuationBatch ? {
      batchHash: externalDagContinuationBatch.batchHash,
      selectedLabelCount: externalDagContinuationBatch.selectedLabelCount,
      remainingResumableLabelCount:
        externalDagContinuationBatch.remainingResumableLabelKeys.length,
      selectedDepthDistribution:
        externalDagContinuationBatch.selectedDepthDistribution,
      remainingDepthDistribution:
        externalDagContinuationBatch.remainingDepthDistribution,
      reportHash: externalDagContinuationBatch.reportHash,
      probabilityInterval: externalDagContinuationBatch.probabilityInterval,
      parallelExecution: compactOutput ? compactParallelExecution : parallelExecution,
    } : null,
    externalDagResume: externalDagResume ? {
      reportHash: externalDagResume.reportHash,
      rootLabelKey: externalDagResume.rootLabelKey,
      action: externalDagResume.stepAudits[0]?.action || null,
    } : null,
    selectedActionAudit: fixedAssassinationPolicy.firstActionAudit(),
    claimBoundary: probability.claimBoundary,
  }, null, 2));
  process.exit(0);
}
assert.equal(route.ok, true, JSON.stringify(route.failures));
assert.equal(route.terminalEvents.length, 1);
assert.equal(route.terminalEvents[0].winnerSideKey, "player1");
assert.equal(route.terminalEvents[0].reason, "steamroller_2026_only_side_with_leader_models_remaining");
assert.equal(route.opponentDefensePolicy, "decline_damage_transfer_existential_witness_v2");
assert.equal(route.adversarialOpponentDefenseProven, false);
assert.equal(route.stages.casterActivation.selectionAudit.some((row) =>
  row.selectedAction?.actionKey.includes(":transfer-damage-")), false);
assert.equal(route.stages.raptorActivation.selectionAudit.some((row) =>
  row.selectedAction?.actionKey.includes(":transfer-damage-")), false);

const witness = certifyWarmachineExecutedTerminalRouteStrictV2(
  routeOpening,
  route.state,
  route.receipts,
  {
    goalType: "assassination",
    winnerSideKey: "player1",
    endingSideKey: "player1",
  },
  {
    routeKey: route.routeKey,
    graph: buildWarmachineTypedInteractionGraphV2(),
    searchMode: "long_horizon",
  },
);
assert.equal(witness.routeExecutionValidated, true, JSON.stringify(witness.issues));
assert.equal(witness.strictWitness, true, JSON.stringify(witness.proof));
assert.equal(witness.proof.status, "strict_certified");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_fixed_steamroller_assassination_v2",
  openingKey: opening.openingKey,
  attackerFormationArchetypeKey,
  modelCount: bound.modelCount,
  transitionCount: route.transitionCount,
  targetStartingBoxes: route.targetStartingBoxes,
  targetEndingBoxes: route.targetEndingBoxes,
  terminalEvent: route.terminalEvents[0],
  routeReceiptHash: route.routeReceiptHash,
  witnessHash: witness.witnessHash,
  proofStatus: witness.proof.status,
  chanceMassComplete: witness.chanceMassComplete,
  opponentResponseSetComplete: witness.opponentResponseSetComplete,
  stages: {
    attackerFirstTurnActions: route.stages.attackerFirstTurn?.activationReceipts
      ?.flatMap((entry) => entry.selectionAudit.map((row) => row.selectedAction)) || [],
    defenderLeaderActions: route.stages.defenderTurn?.activationReceipts
      ?.find((entry) => entry.activationGroupKey === nymara.pieceKey)?.selectionAudit
      ?.map((row) => row.selectedAction) || [],
    casterActions: route.stages.casterActivation?.selectionAudit
      ?.map((row) => row.selectedAction) || [],
    raptorActions: route.stages.raptorActivation?.selectionAudit
      ?.map((row) => row.selectedAction) || [],
  },
  claimBoundary: witness.claimBoundary,
}, null, 2));
