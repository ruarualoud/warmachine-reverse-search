import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import {
  buildWarmachineExternalDagContentIdentity,
  canonicalWarmachineSearchJson,
} from "../src/storage/content-address-v1.mjs";
import { createWarmachineExternalDagStore } from "../src/storage/external-dag-v1.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const HOST_RECEIPT_HASH = "1".repeat(64);
const SOURCE_HASH = "2".repeat(64);
const CONFIG_HASH = "3".repeat(64);
const STORE_OPTIONS = {
  hostReceiptHash: HOST_RECEIPT_HASH,
  sourceHash: SOURCE_HASH,
  configHash: CONFIG_HASH,
  partitionCount: 8,
  maxDeltaDepth: 2,
  maxDeltaRatio: 2,
  sortRunRecordLimit: 2,
};

function openStore(rootPath) {
  return createWarmachineExternalDagStore(rootPath, STORE_OPTIONS);
}

function identity(kind, payload) {
  return buildWarmachineExternalDagContentIdentity(kind, payload, {
    hostReceiptHash: HOST_RECEIPT_HASH,
  }).id;
}

function record(kind, payload, options = {}) {
  return { kind, payload, options };
}

function appendRecords(store, workerId, batchId, records, options = {}) {
  const writer = store.createCandidateSegment({ workerId, batchId, ...options });
  const appendResults = records.map((entry) => writer.append(entry.kind, entry.payload, entry.options));
  return { appendResults, segment: writer.seal() };
}

function semanticRows(store, checkpoint) {
  return [...store.contentRows(checkpoint)]
    .map((row) => ({
      kind: row.kind,
      id: row.id,
      canonicalDigest: row.canonicalDigest,
      value: store.readContent(row.id).value,
    }))
    .sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0) reject(new Error(`child_failed:${code}:${stderr || stdout}`));
      else resolve(stdout);
    });
  });
}

function spawnCandidateWorker(rootPath, fixturePath) {
  return spawn(process.execPath, [SCRIPT_PATH, "--candidate-worker", rootPath, fixturePath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function runPartialWorker(rootPath) {
  const child = spawn(process.execPath, [SCRIPT_PATH, "--partial-worker", rootPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("partial_worker_ready_timeout")), 5_000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("PARTIAL_READY")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("error", reject);
  });
  child.kill("SIGKILL");
  await new Promise((resolve) => child.once("exit", resolve));
}

async function runMainKillWorker(rootPath) {
  const child = spawn(process.execPath, [SCRIPT_PATH, "--main-kill-worker", rootPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("main_kill_worker_ready_timeout")), 10_000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("OUTBOX_READY")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("error", reject);
  });
  child.kill("SIGKILL");
  await new Promise((resolve) => child.once("exit", resolve));
}

function buildFixture() {
  const state0 = {
    activeSideKey: "player1",
    turnNumber: 4,
    pieces: Array.from({ length: 24 }, (_, index) => ({
      pieceKey: `piece-${index}`,
      sideKey: index < 12 ? "player1" : "player2",
      position: { xIn: index, yIn: index % 5 },
      boxesRemaining: 5,
    })),
    scenario: { score: { player1: 2, player2: 1 } },
  };
  const state1 = structuredClone(state0);
  state1.pieces[18].boxesRemaining = 0;
  const state2 = structuredClone(state1);
  state2.scenario.score.player1 = 3;
  const state0Id = identity("state", state0);
  const state1Id = identity("state", state1);
  const state2Id = identity("state", state2);
  const receipt0 = {
    strict: true,
    actionKey: "attack:piece-1:piece-18",
    hostReceiptHash: HOST_RECEIPT_HASH,
    events: [{ type: "damage", amount: 5 }],
  };
  const receipt1 = {
    strict: true,
    actionKey: "end-turn:player1",
    hostReceiptHash: HOST_RECEIPT_HASH,
    events: [{ type: "steamroller_score", amount: 1 }],
  };
  const receipt0Id = identity("receipt", receipt0);
  const receipt1Id = identity("receipt", receipt1);
  const edge0 = {
    fromStateId: state0Id,
    toStateId: state1Id,
    action: { actionKey: receipt0.actionKey },
    strictReceiptId: receipt0Id,
  };
  const edge1 = {
    fromStateId: state1Id,
    toStateId: state2Id,
    action: { actionKey: receipt1.actionKey },
    strictReceiptId: receipt1Id,
  };
  const edge0Id = identity("edge", edge0);
  const edge1Id = identity("edge", edge1);
  const labels = [
    {
      searchContextKey: "two-fronts:assassination",
      stateId: state1Id,
      edgeIds: [edge0Id],
      proofSuffixId: "assassination-a",
      paretoCost: { actions: 1, resource: 2 },
      deliberateExchange: [],
      intent: "remove-last-leader",
      provenance: "micro-exhaustive",
    },
    {
      searchContextKey: "two-fronts:score",
      stateId: state1Id,
      edgeIds: [edge0Id],
      proofSuffixId: "score-a",
      paretoCost: { actions: 1, resource: 1 },
      deliberateExchange: ["screen-for-score"],
      intent: "retain-three-point-lead",
      provenance: "micro-exhaustive",
    },
    {
      searchContextKey: "two-fronts:score",
      stateId: state1Id,
      edgeIds: [edge0Id],
      proofSuffixId: "score-b",
      paretoCost: { actions: 2, resource: 1 },
      deliberateExchange: ["piece-18"],
      intent: "alternative-score-suffix-on-converged-state",
      provenance: "micro-exhaustive",
    },
    {
      searchContextKey: "two-fronts:assassination",
      stateId: state2Id,
      edgeIds: [edge0Id, edge1Id],
      proofSuffixId: "assassination-b",
      paretoCost: { actions: 2, resource: 3 },
      deliberateExchange: [],
      intent: "preserve-terminal-option",
      provenance: "micro-exhaustive",
    },
  ];
  const chances = labels.map((label, index) => ({
    eventId: `event-${index}`,
    outcomeKey: index % 2 ? "success" : "failure",
    probabilityNumerator: index % 2 ? 2 : 1,
    probabilityDenominator: 3,
    resolutionStatus: index === 3 ? "unresolved" : "resolved",
    incomingRouteLabelId: identity("label", label),
  }));
  const baseRecords = [
    record("state", state0),
    record("state", state1, { parentStateId: state0Id }),
    record("receipt", receipt0),
    record("edge", edge0),
    record("label", labels[0]),
    record("label", labels[1]),
    record("chance", chances[0]),
    record("chance", chances[1]),
  ];
  const reopenRecords = [
    record("state", state1, { parentStateId: state0Id }),
    record("state", state2, { parentStateId: state1Id }),
    record("receipt", receipt1),
    record("edge", edge1),
    record("label", labels[2]),
    record("label", labels[3]),
    record("chance", chances[2]),
    record("chance", chances[3]),
  ];
  return {
    states: [state0, state1, state2],
    edges: [edge0, edge1],
    labels,
    chances,
    receipts: [receipt0, receipt1],
    baseRecords,
    reopenRecords,
    stateIds: [state0Id, state1Id, state2Id],
  };
}

async function childMain(mode, rootPath, fixturePath = "") {
  const store = openStore(rootPath);
  if (mode === "--candidate-worker") {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    appendRecords(store, fixture.workerId, fixture.batchId, fixture.records);
    process.stdout.write("DONE\n");
    return;
  }
  if (mode === "--partial-worker") {
    const writer = store.createCandidateSegment({ workerId: "killed-worker", batchId: "partial" });
    writer.append("state", { partial: true, values: Array.from({ length: 1_000 }, (_, index) => index) });
    process.stdout.write("PARTIAL_READY\n");
    await new Promise(() => {});
  }
  if (mode === "--main-kill-worker") {
    store.mergeInbox({
      onStage(stage) {
        if (stage !== "outbox_published") return;
        process.stdout.write("OUTBOX_READY\n");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      },
    });
  }
}

async function main() {
  const fixture = buildFixture();
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "warmachine-external-dag-micro-"));
  const fixturePath = path.join(rootPath, "worker-fixture.json");
  fs.writeFileSync(fixturePath, JSON.stringify({
    workerId: "duplicate-worker",
    batchId: "base",
    records: fixture.baseRecords,
  }));
  const store = openStore(rootPath);

  const duplicateWorkers = [
    spawnCandidateWorker(rootPath, fixturePath),
    spawnCandidateWorker(rootPath, fixturePath),
  ];
  await Promise.all(duplicateWorkers.map(waitForChild));
  const firstRecovery = store.recover();
  assert.equal(firstRecovery.pendingSubmissions.length, 1);
  const checkpoint1 = store.mergeAndCheckpoint({ checkpoint: { frontierRootIds: [fixture.stateIds[1]] } });
  assert.deepEqual(checkpoint1.counts, {
    state: 2,
    edge: 1,
    label: 2,
    chance: 2,
    receipt: 1,
    unresolved: 0,
  });
  assert.equal(checkpoint1.stateProposalCount, 2);
  assert.equal(store.readState(fixture.stateIds[1]).encoding, "delta");
  store.pinCheckpoint(checkpoint1.checkpointId, "micro-first-root");

  appendRecords(store, "worker-z", "reopen-z", [...fixture.reopenRecords].reverse());
  const reopenMerge = store.mergeInbox();
  assert.ok(reopenMerge.reopenedStateIds.includes(fixture.stateIds[1]));
  const checkpoint2 = store.commitMerge(reopenMerge, { frontierRootIds: [fixture.stateIds[2]] });
  assert.equal(checkpoint2.counts.state, 3);
  assert.equal(checkpoint2.counts.edge, 2);
  assert.equal(checkpoint2.counts.label, 4);
  assert.equal(checkpoint2.counts.chance, 4);
  assert.equal(checkpoint2.counts.receipt, 2);

  const expectedByKind = {
    state: fixture.states,
    edge: fixture.edges,
    label: fixture.labels,
    chance: fixture.chances,
    receipt: fixture.receipts,
    unresolved: [],
  };
  const expectedSemanticRows = Object.entries(expectedByKind).flatMap(([kind, values]) =>
    values.map((value) => ({ kind, id: identity(kind, value), value })))
    .sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
  const actualSemanticRows = semanticRows(store, checkpoint2).map(({ kind, id, value }) => ({ kind, id, value }));
  assert.equal(canonicalWarmachineSearchJson(actualSemanticRows), canonicalWarmachineSearchJson(expectedSemanticRows));

  const fullJsonTree = fixture.labels.map((label, index) => ({
    states: label.stateId === fixture.stateIds[1] ? fixture.states.slice(0, 2) : fixture.states,
    edges: label.edgeIds.map((edgeId) => fixture.edges.find((edge) => identity("edge", edge) === edgeId)),
    label,
    chance: fixture.chances[index],
  }));
  const fullJsonTreeBytes = Buffer.byteLength(JSON.stringify(fullJsonTree));
  const externalSummary = store.summarize(checkpoint2);
  const boundedWorkingSetBytes = Math.max(1, externalSummary.io.maxBufferedCanonicalBytes);
  const peakWorkingSetReductionRatio = fullJsonTreeBytes / boundedWorkingSetBytes;
  assert.equal(externalSummary.V, 3);
  assert.equal(externalSummary.G, 4);
  assert.equal(externalSummary.E, 2);
  assert.equal(externalSummary.L, 4);
  assert.equal(externalSummary.C, 4);
  assert.ok(peakWorkingSetReductionRatio >= 5);

  const orderRoot = fs.mkdtempSync(path.join(os.tmpdir(), "warmachine-external-dag-order-"));
  const orderStore = openStore(orderRoot);
  appendRecords(orderStore, "order", "child-before-parent", [
    ...fixture.baseRecords,
    ...fixture.reopenRecords,
  ].reverse());
  const orderCheckpoint = orderStore.mergeAndCheckpoint();
  assert.equal(
    canonicalWarmachineSearchJson(semanticRows(orderStore, orderCheckpoint).map(({ kind, id, value }) => ({ kind, id, value }))),
    canonicalWarmachineSearchJson(expectedSemanticRows),
  );

  const budgetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "warmachine-external-dag-budget-"));
  const budgetStore = openStore(budgetRoot);
  const budgetWriter = budgetStore.createCandidateSegment({
    workerId: "budget",
    batchId: "bounded",
    budgets: { maxAcceptedRecords: 1 },
  });
  assert.equal(budgetWriter.append("state", fixture.states[0]).accepted, true);
  assert.equal(budgetWriter.append("edge", fixture.edges[0], { mass: 0.25, searchContextKey: "budget-test" }).accepted, false);
  budgetWriter.seal();
  const budgetCheckpoint = budgetStore.mergeAndCheckpoint();
  const budgetSummary = budgetStore.summarize(budgetCheckpoint);
  assert.equal(budgetSummary.U, 1);
  assert.equal(budgetSummary.unresolvedMass, 0.25);

  const budgetRoots = [];
  const budgetReasonEvidence = { record: "record_budget_exhausted" };
  for (const budgetCase of [
    { name: "ram", budgets: { maxHotMemoryBytes: 1 }, reason: "ram_budget_exhausted" },
    { name: "disk", budgets: { maxDiskBytes: 1 }, reason: "disk_budget_exhausted" },
    { name: "time", budgets: { maxWallTimeMs: 0 }, reason: "time_budget_exhausted" },
  ]) {
    const caseRoot = fs.mkdtempSync(path.join(os.tmpdir(), `warmachine-external-dag-budget-${budgetCase.name}-`));
    budgetRoots.push(caseRoot);
    const caseStore = openStore(caseRoot);
    const caseWriter = caseStore.createCandidateSegment({
      workerId: "budget",
      batchId: budgetCase.name,
      budgets: budgetCase.budgets,
    });
    const rejected = caseWriter.append("state", fixture.states[0], { mass: 0.125 });
    assert.equal(rejected.unresolvedReason, budgetCase.reason);
    caseWriter.seal();
    const caseSummary = caseStore.summarize(caseStore.mergeAndCheckpoint());
    assert.equal(caseSummary.U, 1);
    assert.equal(caseSummary.unresolvedMass, 0.125);
    budgetReasonEvidence[budgetCase.name] = rejected.unresolvedReason;
  }

  const labelBudgetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "warmachine-external-dag-budget-label-"));
  budgetRoots.push(labelBudgetRoot);
  const labelBudgetStore = openStore(labelBudgetRoot);
  const labelBudgetWriter = labelBudgetStore.createCandidateSegment({
    workerId: "budget",
    batchId: "label",
    budgets: { maxLabelsPerState: 1 },
  });
  assert.equal(labelBudgetWriter.append("label", fixture.labels[0]).accepted, true);
  const labelRejected = labelBudgetWriter.append("label", {
    ...fixture.labels[0],
    proofSuffixId: "label-budget-second",
  }, { mass: 0.5 });
  assert.equal(labelRejected.unresolvedReason, "label_budget_exhausted");
  labelBudgetWriter.seal();
  const labelBudgetSummary = labelBudgetStore.summarize(labelBudgetStore.mergeAndCheckpoint());
  assert.equal(labelBudgetSummary.L, 1);
  assert.equal(labelBudgetSummary.U, 1);
  assert.equal(labelBudgetSummary.unresolvedMass, 0.5);
  budgetReasonEvidence.label = labelRejected.unresolvedReason;

  await runPartialWorker(rootPath);
  const partialWorkerRecovery = store.recover();
  assert.ok(partialWorkerRecovery.ignoredPartialFileCount >= 1);
  assert.equal(partialWorkerRecovery.frozen, false);

  appendRecords(store, "failure", "partial-merge", [record("label", {
    ...fixture.labels[0],
    proofSuffixId: "partial-merge-label",
  })]);
  assert.throws(() => store.mergeInbox({ failAt: "after_first_partition" }), /failure_injection:after_first_partition/);
  assert.equal(store.readCurrentCheckpoint().checkpointId, checkpoint2.checkpointId);
  const partialMergeRecovery = store.recover();
  assert.ok(partialMergeRecovery.pendingSubmissions.length >= 1);
  const afterPartialMerge = store.mergeAndCheckpoint();

  appendRecords(store, "failure", "main-kill", [record("label", {
    ...fixture.labels[0],
    proofSuffixId: "main-kill-label",
  })]);
  await runMainKillWorker(rootPath);
  const mainKillRecovery = store.recover();
  assert.equal(mainKillRecovery.staleLockRecovered, true);
  assert.ok(mainKillRecovery.uncommittedMerges.length >= 1);
  const afterMainKill = store.commitMerge(mainKillRecovery.uncommittedMerges[0]);

  appendRecords(store, "failure", "checkpoint-manifest", [record("label", {
    ...fixture.labels[0],
    proofSuffixId: "checkpoint-manifest-label",
  })]);
  const checkpointManifestMerge = store.mergeInbox();
  assert.throws(
    () => store.commitMerge(checkpointManifestMerge, { failAt: "after_checkpoint_manifest" }),
    /failure_injection:after_checkpoint_manifest/,
  );
  assert.equal(store.readCurrentCheckpoint().checkpointId, afterMainKill.checkpointId);
  const afterManifestFailure = store.commitMerge(checkpointManifestMerge);

  appendRecords(store, "failure", "checkpoint-pointer", [record("label", {
    ...fixture.labels[0],
    proofSuffixId: "checkpoint-pointer-label",
  })]);
  const checkpointPointerMerge = store.mergeInbox();
  assert.throws(
    () => store.commitMerge(checkpointPointerMerge, { failAt: "after_checkpoint_pointer" }),
    /failure_injection:after_checkpoint_pointer/,
  );
  const pointerRecovery = store.recover();
  assert.equal(pointerRecovery.checkpoint.mergeId, checkpointPointerMerge.mergeId);
  assert.equal(store.commitMerge(checkpointPointerMerge).checkpointId, pointerRecovery.checkpoint.checkpointId);

  const collisionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "warmachine-external-dag-collision-"));
  const collisionStore = openStore(collisionRoot);
  const originalEdge = collisionStore.putContent("edge", { collision: "original" });
  assert.throws(
    () => collisionStore.putContent("edge", { collision: "different" }, { forcedId: originalEdge.id }),
    /content_address_collision/,
  );

  const deltaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "warmachine-external-dag-delta-"));
  const deltaStore = openStore(deltaRoot);
  const deltaBase = deltaStore.putState(fixture.states[0]);
  const deltaOne = deltaStore.putState(fixture.states[1], { parentStateId: deltaBase.id });
  const deltaTwo = deltaStore.putState(fixture.states[2], { parentStateId: deltaOne.id });
  const stateAfterDepthLimit = structuredClone(fixture.states[2]);
  stateAfterDepthLimit.scenario.score.player2 = 2;
  const deltaThree = deltaStore.putState(stateAfterDepthLimit, { parentStateId: deltaTwo.id });
  assert.equal(deltaOne.encoding, "delta");
  assert.equal(deltaTwo.encoding, "delta");
  assert.equal(deltaThree.encoding, "full");
  assert.equal(deltaStore.readState(deltaThree.id).value.scenario.score.player2, 2);

  const corruptSegmentRoot = fs.mkdtempSync(path.join(os.tmpdir(), "warmachine-external-dag-corrupt-segment-"));
  const corruptSegmentStore = openStore(corruptSegmentRoot);
  const corruptWriter = corruptSegmentStore.createCandidateSegment({ workerId: "corrupt", batchId: "published" });
  corruptWriter.append("state", fixture.states[0]);
  const corruptSegment = corruptWriter.seal();
  const corruptSegmentPath = corruptSegmentStore.candidateSegmentPath(corruptSegment.segmentId);
  fs.truncateSync(corruptSegmentPath, Math.floor(fs.statSync(corruptSegmentPath).size / 2));
  const corruptRecovery = corruptSegmentStore.recover();
  assert.equal(corruptRecovery.frozen, true);
  assert.ok(corruptRecovery.invalidSubmissions.length >= 1);

  const driftedStore = createWarmachineExternalDagStore(rootPath, {
    ...STORE_OPTIONS,
    hostReceiptHash: "9".repeat(64),
  });
  assert.equal(driftedStore.frozen, true);
  assert.equal(driftedStore.readCurrentCheckpoint().checkpointId, pointerRecovery.checkpoint.checkpointId);
  assert.throws(() => driftedStore.createCandidateSegment(), /external_dag_store_frozen/);

  const pinnedStaleIndexIds = Object.values(checkpoint1.indexByPartition)
    .filter((indexId) => !Object.values(pointerRecovery.checkpoint.indexByPartition).includes(indexId));
  assert.ok(pinnedStaleIndexIds.length > 0);
  const pinnedIndexFiles = walkIndexFiles(rootPath)
    .filter((filePath) => pinnedStaleIndexIds.some((id) => filePath.includes(id.split(":")[1])));
  assert.equal(pinnedIndexFiles.length, pinnedStaleIndexIds.length);

  const orphan = store.putState({ orphan: "gc-failure", payload: Array.from({ length: 50 }, (_, index) => index) });
  const deferredGc = store.collectGarbage();
  assert.ok(deferredGc.deferredCount > 0);
  assert.throws(
    () => store.collectGarbage({ retentionGenerations: 0, failAt: "after_first_quarantine" }),
    /failure_injection:after_first_quarantine/,
  );
  const gcRollback = store.recover();
  assert.ok(gcRollback.gcRecovery.restoredCount >= 1);
  assert.equal(store.readState(orphan.id).value.orphan, "gc-failure");
  const successfulGc = store.collectGarbage({ retentionGenerations: 0 });
  assert.ok(successfulGc.removedCount >= 1);
  assert.throws(() => store.readState(orphan.id), /ENOENT/);
  assert.ok(pinnedIndexFiles.every((filePath) => fs.existsSync(filePath)));

  const committedOrphan = store.putState({ orphan: "gc-committed" });
  assert.throws(
    () => store.collectGarbage({ retentionGenerations: 0, failAt: "after_gc_commit" }),
    /failure_injection:after_gc_commit/,
  );
  const gcCommitRecovery = store.recover();
  assert.ok(gcCommitRecovery.gcRecovery.completedCount >= 1);
  assert.throws(() => store.readState(committedOrphan.id), /ENOENT/);

  const finalCheckpoint = store.readCurrentCheckpoint();
  const finalSummary = store.summarize(finalCheckpoint);
  const result = {
    ok: true,
    schemaVersion: "warmachine_external_dag_micro_verification_v1",
    semanticEquivalence: {
      fullJsonTreeRouteCount: fullJsonTree.length,
      fullJsonTreeBytes,
      uniqueStateCount: externalSummary.V,
      uniqueEdgeCount: externalSummary.E,
      routeLabelCount: externalSummary.L,
      chanceContributionCount: externalSummary.C,
      externalPhysicalBytes: externalSummary.totalPhysicalBytes,
      boundedWorkingSetBytes,
      peakWorkingSetReductionRatio: Number(peakWorkingSetReductionRatio.toFixed(3)),
      canonicalSetsEqual: true,
    },
    exactMerge: {
      concurrentDuplicateWorkerCount: 2,
      duplicateSubmissionCollapsed: true,
      outOfOrderSemanticDigestEqual: true,
      reopenedStateIds: reopenMerge.reopenedStateIds,
    },
    failureInjection: {
      partialWorkerSegmentIgnored: true,
      corruptedPublishedSegmentFrozen: true,
      partialMergeDidNotPublish: true,
      uncommittedMainMergeRecovered: true,
      checkpointManifestWithoutPointerIgnored: true,
      checkpointPointerCommitRecovered: true,
      contentCollisionFailedClosed: true,
      receiptDriftReadOnlyFrozen: true,
      gcRollbackRestored: true,
      gcCommittedRecoveryCompleted: true,
      pinnedRootPreserved: true,
    },
    budget: {
      stoppedGeneration: true,
      U: budgetSummary.U,
      unresolvedMass: budgetSummary.unresolvedMass,
      reasons: budgetReasonEvidence,
    },
    stateEncoding: {
      boundedDeltaReconstructed: true,
      maxDeltaDepth: STORE_OPTIONS.maxDeltaDepth,
      depthLimitRebasedToFull: true,
    },
    finalMetrics: finalSummary,
    checkpointIds: [
      checkpoint1.checkpointId,
      checkpoint2.checkpointId,
      afterPartialMerge.checkpointId,
      afterManifestFailure.checkpointId,
      finalCheckpoint.checkpointId,
    ],
  };

  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex >= 0 && process.argv[outputIndex + 1]) {
    fs.writeFileSync(path.resolve(process.cwd(), process.argv[outputIndex + 1]), `${JSON.stringify(result, null, 2)}\n`);
  }
  for (const cleanupPath of [
    rootPath,
    orderRoot,
    budgetRoot,
    collisionRoot,
    deltaRoot,
    corruptSegmentRoot,
    ...budgetRoots,
  ]) {
    fs.rmSync(cleanupPath, { recursive: true, force: true });
  }
  console.log(JSON.stringify(result, null, 2));
}

function walkIndexFiles(rootPath) {
  const indexRoot = path.join(rootPath, "segments", "indexes");
  if (!fs.existsSync(indexRoot)) return [];
  return fs.readdirSync(indexRoot, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const directoryPath = path.join(indexRoot, entry.name);
    return fs.readdirSync(directoryPath).map((name) => path.join(directoryPath, name));
  });
}

const mode = process.argv[2];
if (["--candidate-worker", "--partial-worker", "--main-kill-worker"].includes(mode)) {
  await childMain(mode, process.argv[3], process.argv[4]);
} else {
  await main();
}
