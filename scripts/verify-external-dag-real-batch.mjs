import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

import {
  buildWarmachineExternalDagContentIdentity,
  canonicalWarmachineSearchBytes,
  canonicalWarmachineSearchJson,
} from "../src/storage/content-address-v1.mjs";
import { createWarmachineExternalDagStore } from "../src/storage/external-dag-v1.mjs";
import {
  applyRulesV1Action,
  buildWarmachineRulesV1ActionWithStrictRngOutcome,
  buildWarmachineRulesV1StateFromLayer3Room,
  enumerateRulesV1Actions,
  resolveWarmachineHostPath,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";
import { buildWarmachineLazyActionCursorPlan } from "../src/search/lazy-action-cursor-v1.mjs";

const SEARCH_CONFIG = {
  schemaVersion: "warmachine_external_dag_real_batch_config_v1",
  depth: 3,
  branchingPerState: 2,
  partitionCount: 32,
  sortRunRecordLimit: 8,
  maxDeltaDepth: 16,
  maxDeltaRatio: 0.25,
};

function hashFiles(filePaths) {
  const hash = createHash("sha256");
  for (const filePath of [...filePaths].sort()) {
    hash.update(path.basename(filePath));
    hash.update("\0");
    hash.update(fs.readFileSync(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function identity(kind, payload, hostReceiptHash) {
  return buildWarmachineExternalDagContentIdentity(kind, payload, { hostReceiptHash }).id;
}

function quantile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function distribution(values) {
  return {
    count: values.length,
    min: values.length ? Math.min(...values) : 0,
    p50: quantile(values, 0.5),
    p95: quantile(values, 0.95),
    p99: quantile(values, 0.99),
    max: values.length ? Math.max(...values) : 0,
  };
}

function strictTransition(state, selectedAction, enumeration, depth, branch) {
  const strictAction = {
    ...buildWarmachineRulesV1ActionWithStrictRngOutcome(selectedAction, {
      room: {
        id: "external-dag-real-batch",
        game: {
          round: enumeration.state.turnNumber,
          turnNumber: enumeration.state.turnNumber,
          activeSideKey: enumeration.state.activeSideKey,
        },
      },
      sourceContext: {
        rulesV1State: enumeration.state,
        rulesV1Enumeration: enumeration,
      },
      selectedActionKey: selectedAction.actionKey,
    }),
    __warmachineTrustedRulesV1Enumeration: enumeration,
  };
  const transition = applyRulesV1Action(enumeration.state, strictAction);
  const persistedAction = { ...strictAction };
  delete persistedAction.__warmachineTrustedRulesV1Enumeration;
  const receipt = {
    schemaVersion: "warmachine_external_dag_real_strict_receipt_v1",
    hostReceipt: warmachineHost.receipt,
    depth,
    branch,
    ok: transition.ok,
    rulesVersion: transition.rulesVersion,
    actionKey: selectedAction.actionKey,
    events: transition.events || [],
    quality: transition.quality || null,
  };
  return { transition, persistedAction, receipt };
}

async function main() {
  const roomPath = resolveWarmachineHostPath(
    "build/warmachine-ai/sepsira-swarm-vs-fane-v20260805/strict-construction-search-v2/deep/" +
    "cryx-recursion-screen-fane-ashmael-scenario-blender-balanced-collision-player1-e4937ca7b578/" +
    "input-room-store.tmp.json",
  );
  const roomStore = JSON.parse(fs.readFileSync(roomPath, "utf8"));
  const room = Object.values(roomStore.roomsById || {})[0];
  const initialState = buildWarmachineRulesV1StateFromLayer3Room(room, {
    strictMode: true,
    enforceStrictExecutor: true,
  });
  assert.equal(initialState.pieces.length, 106);

  const hostReceiptHash = warmachineHost.receipt.receiptHash;
  const sourceHash = hashFiles([
    new URL("../src/storage/content-address-v1.mjs", import.meta.url),
    new URL("../src/storage/external-dag-v1.mjs", import.meta.url),
  ].map((url) => url.pathname));
  const configHash = createHash("sha256").update(canonicalWarmachineSearchJson(SEARCH_CONFIG)).digest("hex");
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "warmachine-external-dag-real-"));
  const store = createWarmachineExternalDagStore(rootPath, {
    hostReceiptHash,
    sourceHash,
    configHash,
    partitionCount: SEARCH_CONFIG.partitionCount,
    sortRunRecordLimit: SEARCH_CONFIG.sortRunRecordLimit,
    maxDeltaDepth: SEARCH_CONFIG.maxDeltaDepth,
    maxDeltaRatio: SEARCH_CONFIG.maxDeltaRatio,
  });

  let frontier = [{ state: initialState, stateId: identity("state", initialState, hostReceiptHash) }];
  const layerMetrics = [];
  const routeMaterializedBytes = [];
  let rssPeak = process.memoryUsage().rss;
  let strictRejectedCount = 0;
  let omittedActionCount = 0;

  for (let depth = 0; depth < SEARCH_CONFIG.depth; depth += 1) {
    const writer = store.createCandidateSegment({
      workerId: "real-host",
      batchId: `layer-${depth}`,
      budgets: {
        maxAcceptedRecords: 512,
        maxCandidateBytes: 512 * 1024 * 1024,
        maxWallTimeMs: 5 * 60 * 1_000,
        maxLabelsPerState: 32,
      },
    });
    if (depth === 0) writer.append("state", initialState);
    const nextFrontier = [];
    let layerActionProposals = 0;
    let layerApplied = 0;
    let layerOmitted = 0;

    for (const frontierEntry of frontier) {
      const plan = buildWarmachineLazyActionCursorPlan(frontierEntry.state);
      const groups = plan.groups || [];
      let enumeration = null;
      for (const group of groups) {
        const candidate = enumerateRulesV1Actions(frontierEntry.state, {
          actorPieceKeys: group.actorPieceKeys,
        });
        if (candidate.actions?.length) {
          enumeration = candidate;
          break;
        }
      }
      if (!enumeration) {
        writer.append("unresolved", {
          reason: "real_batch_no_legal_activation_group",
          stateId: frontierEntry.stateId,
          mass: 1,
        });
        continue;
      }
      const selectedActions = enumeration.actions.slice(0, SEARCH_CONFIG.branchingPerState);
      const omittedForState = Math.max(0, enumeration.actions.length - selectedActions.length);
      layerActionProposals += enumeration.actions.length;
      layerOmitted += omittedForState;
      for (let branch = 0; branch < selectedActions.length; branch += 1) {
        const selectedAction = selectedActions[branch];
        const { transition, persistedAction, receipt } = strictTransition(
          frontierEntry.state,
          selectedAction,
          enumeration,
          depth,
          branch,
        );
        if (!transition.ok) {
          strictRejectedCount += 1;
          writer.append("unresolved", {
            reason: "real_batch_strict_transition_rejected",
            stateId: frontierEntry.stateId,
            actionKey: selectedAction.actionKey,
            rejection: transition.rejection || transition.error || null,
            mass: 1 / Math.max(1, selectedActions.length),
          });
          continue;
        }
        layerApplied += 1;
        const nextState = transition.nextState;
        const nextStateId = identity("state", nextState, hostReceiptHash);
        const receiptId = identity("receipt", receipt, hostReceiptHash);
        const edge = {
          schemaVersion: "warmachine_external_dag_real_edge_payload_v1",
          fromStateId: frontierEntry.stateId,
          toStateId: nextStateId,
          action: persistedAction,
          strictReceiptId: receiptId,
        };
        const edgeId = identity("edge", edge, hostReceiptHash);
        const label = {
          schemaVersion: "warmachine_external_dag_real_label_payload_v1",
          searchContextKey: "steamroller-2026:two-fronts:real-small-batch",
          stateId: nextStateId,
          edgeIds: [edgeId],
          terminalProofSuffix: {
            terminalKind: depth % 2 ? "scenario_score" : "assassination",
            proofSuffixId: `real-layer-${depth}-branch-${branch}`,
            victoryRelativeLayer: SEARCH_CONFIG.depth - depth,
            absoluteRound: Number(nextState.turnNumber || 0),
          },
          paretoCost: { actionCount: depth + 1, resourceSpent: 0, exchangePoints: 0 },
          deliberateExchange: [],
          intent: "storage-real-batch-only",
          trainingProvenance: { source: "external-dag-verifier", trainingTruth: false },
        };
        const labelId = identity("label", label, hostReceiptHash);
        const chance = {
          schemaVersion: "warmachine_external_dag_real_chance_payload_v1",
          eventId: `strict-fixed-outcome:${edgeId}`,
          outcomeKey: "materialized-strict-outcome",
          probabilityNumerator: 1,
          probabilityDenominator: 1,
          resolutionStatus: "resolved_fixture_outcome",
          incomingRouteLabelId: labelId,
        };
        writer.append("state", nextState, { parentStateId: frontierEntry.stateId });
        writer.append("receipt", receipt);
        writer.append("edge", edge);
        writer.append("label", label);
        writer.append("chance", chance);
        nextFrontier.push({ state: nextState, stateId: nextStateId });

        const parentBytes = canonicalWarmachineSearchBytes(frontierEntry.state).byteLength;
        const childBytes = canonicalWarmachineSearchBytes(nextState).byteLength;
        routeMaterializedBytes.push(
          parentBytes + childBytes +
          canonicalWarmachineSearchBytes(edge).byteLength +
          canonicalWarmachineSearchBytes(receipt).byteLength +
          canonicalWarmachineSearchBytes(label).byteLength +
          canonicalWarmachineSearchBytes(chance).byteLength,
        );
        rssPeak = Math.max(rssPeak, process.memoryUsage().rss);
      }
      if (omittedForState > 0) {
        writer.append("unresolved", {
          reason: "real_batch_branch_budget_exhausted",
          stateId: frontierEntry.stateId,
          omittedCount: omittedForState,
          mass: 1,
          claimBoundary: "omitted legal actions remain unresolved and are not losses",
        });
      }
    }
    omittedActionCount += layerOmitted;
    const segment = writer.seal();
    const merge = store.mergeInbox();
    const checkpoint = store.commitMerge(merge, {
      frontierRootIds: nextFrontier.map((entry) => entry.stateId),
      inFlightLedger: layerOmitted > 0 ? [{ depth, omittedActionCount: layerOmitted }] : [],
    });
    const summary = store.summarize(checkpoint);
    layerMetrics.push({
      depth,
      frontierIn: frontier.length,
      frontierOut: nextFrontier.length,
      legalActionProposals: layerActionProposals,
      strictTransitionsApplied: layerApplied,
      omittedLegalActions: layerOmitted,
      candidateSegmentBytes: segment.bytes,
      merge: merge.io,
      V: summary.V,
      G: summary.G,
      E: summary.E,
      L: summary.L,
      C: summary.C,
      U: summary.U,
      unresolvedMass: summary.unresolvedMass,
    });
    frontier = nextFrontier;
    if (!frontier.length) break;
  }

  const recovery = store.recover();
  const finalCheckpoint = store.readCurrentCheckpoint();
  const finalMetrics = store.summarize(finalCheckpoint);
  const stateRows = [...store.contentRows(finalCheckpoint)].filter((row) => row.kind === "state");
  const stateMeasurements = stateRows.map((row) => {
    const restored = store.readState(row.id);
    return {
      id: row.id,
      encoding: restored.encoding,
      deltaDepth: restored.deltaDepth,
      canonicalBytes: restored.canonicalLength,
      canonicalGzipBytes: zlib.gzipSync(restored.canonicalBytes, { level: 9 }).byteLength,
      physicalBytes: fs.statSync(store.objectPath("state", row.id)).size,
    };
  });
  const fullStateCount = stateMeasurements.filter((row) => row.encoding === "full").length;
  const deltaStateCount = stateMeasurements.filter((row) => row.encoding === "delta").length;
  const fullJsonTreeBytes = routeMaterializedBytes.reduce((sum, value) => sum + value, 0);
  const boundedWorkingSetBytes = Math.max(1, finalMetrics.io.maxBufferedCanonicalBytes);
  const peakWorkingSetReductionRatio = fullJsonTreeBytes / boundedWorkingSetBytes;
  assert.ok(finalMetrics.V >= 2);
  assert.ok(finalMetrics.G >= finalMetrics.V - 1);
  assert.ok(finalMetrics.E >= 1);
  assert.equal(finalMetrics.E, finalMetrics.L);
  assert.equal(finalMetrics.L, finalMetrics.C);
  assert.ok(finalMetrics.U >= 1);
  assert.ok(deltaStateCount >= 1);
  assert.ok(recovery.checkpoint);
  assert.equal(recovery.frozen, false);
  assert.ok(peakWorkingSetReductionRatio >= 4);
  assert.equal(strictRejectedCount, 0);

  const result = {
    ok: true,
    schemaVersion: "warmachine_external_dag_real_batch_verification_v1",
    hostReceipt: warmachineHost.receipt,
    binding: { hostReceiptHash, sourceHash, configHash },
    fixture: {
      roomPath,
      modelCount: initialState.pieces.length,
      topLevelStateKeyCount: Object.keys(initialState).length,
      requestedDepth: SEARCH_CONFIG.depth,
      branchingPerState: SEARCH_CONFIG.branchingPerState,
    },
    layerMetrics,
    graphMetrics: {
      V: finalMetrics.V,
      G: finalMetrics.G,
      E: finalMetrics.E,
      L: finalMetrics.L,
      C: finalMetrics.C,
      U: finalMetrics.U,
      unresolvedMass: finalMetrics.unresolvedMass,
      convergenceRatioGOverV: Number((finalMetrics.G / Math.max(1, finalMetrics.V)).toFixed(4)),
      omittedActionCount,
      strictRejectedCount,
    },
    capacity: {
      stateCanonicalBytes: distribution(stateMeasurements.map((row) => row.canonicalBytes)),
      stateCanonicalGzipBytes: distribution(stateMeasurements.map((row) => row.canonicalGzipBytes)),
      statePhysicalBytes: distribution(stateMeasurements.map((row) => row.physicalBytes)),
      fullStateCount,
      deltaStateCount,
      deltaDepth: distribution(stateMeasurements.map((row) => row.deltaDepth)),
      objectPhysicalBytes: finalMetrics.objectPhysicalBytes,
      labelsPerState: finalMetrics.labelsPerState,
      liveCanonicalBytes: finalMetrics.liveCanonicalBytes,
      totalPhysicalBytes: finalMetrics.totalPhysicalBytes,
      writeAmplification: finalMetrics.writeAmplification,
      canonicalWriteRatio: finalMetrics.canonicalWriteRatio,
    },
    externalExecution: {
      io: finalMetrics.io,
      recoveryDurationMs: recovery.durationMs,
      fullJsonTreeMaterializedBytes: fullJsonTreeBytes,
      boundedMergeWorkingSetBytes: boundedWorkingSetBytes,
      peakWorkingSetReductionRatio: Number(peakWorkingSetReductionRatio.toFixed(3)),
      processRssPeakBytes: rssPeak,
      immutableSegments: layerMetrics.length,
      checkpointGeneration: finalCheckpoint.generation,
    },
    claimBoundary: "This is a strict Host-backed storage and recovery measurement, not a terminal strategy proof. Omitted legal actions remain unresolved.",
  };

  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex >= 0 && process.argv[outputIndex + 1]) {
    fs.writeFileSync(path.resolve(process.cwd(), process.argv[outputIndex + 1]), `${JSON.stringify(result, null, 2)}\n`);
  }
  if (!process.argv.includes("--keep")) fs.rmSync(rootPath, { recursive: true, force: true });
  console.log(JSON.stringify(result, null, 2));
}

await main();
