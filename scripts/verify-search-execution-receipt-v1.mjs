#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildWarmachineCompositeExecutionReceiptV1,
  buildWarmachineSearchSourceReceiptV1,
  discoverWarmachineSearchExecutionSourcePathsV1,
} from "../src/contracts/search-execution-receipt-v1.mjs";

const temporaryRoot = fs.mkdtempSync(path.join(
  os.tmpdir(),
  "warmachine-search-execution-receipt-",
));

function write(relativePath, value) {
  const absolutePath = path.join(temporaryRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, value);
}

const hostReceipt = {
  schemaVersion: "engine-core-v1",
  gitRevision: "engine-revision-a",
  trackedWorktreeDirty: false,
  trackedDirtyPathCount: 0,
  sourceHashes: { "scripts/rules.mjs": "a".repeat(64) },
  receiptHash: "b".repeat(64),
  projectDRoot: "/path/must/not/affect/identity",
};
const constructionHostReceipt = {
  ...hostReceipt,
  schemaVersion: "engine-construction-v1",
  receiptHash: "c".repeat(64),
};
const focusedEngineReceipt = {
  schemaVersion: "warmachine_focused_engine_receipt_binding_v1",
  reviewedReceipt: {
    schemaVersion: "warmachine_reviewed_focused_engine_receipt_v1",
    sourceReceiptHash: "d".repeat(64),
    manifestHash: "e".repeat(64),
    aggregateHash: "f".repeat(64),
    executionSourceReceiptHash: "1".repeat(64),
    sourceFileCount: 10,
    verifierCount: 8,
    passedVerifierCount: 8,
    failedVerifierCount: 0,
    shardCount: 2,
    gatePassed: true,
  },
  observedExecutionSourceReceiptHash: "1".repeat(64),
  current: true,
  failClosedReasons: [],
  ruleSemanticsAuthority: {
    schemaVersion: "warmachine_rule_semantics_authority_v1",
    authorityReceiptHash: "2".repeat(64),
    sourceAuthority: { current: true },
    verdict: {
      globalStrictReady: true,
      strictExecutorReady: true,
      strictSearchReady: true,
      trainingTruthAllowed: true,
    },
    quarantine: { active: false },
    failClosedReasons: [],
  },
};

try {
  write("src/entry.mjs", "import { value } from './dependency.mjs';\nexport { value };\n");
  write("src/dependency.mjs", "export const value = 1;\n");
  write("src/unrelated.mjs", "export const unrelated = true;\n");
  const options = {
    repositoryRoot: temporaryRoot,
    entryRelativePaths: ["src/entry.mjs"],
  };
  assert.deepEqual(discoverWarmachineSearchExecutionSourcePathsV1(
    temporaryRoot,
    options.entryRelativePaths,
  ), ["src/dependency.mjs", "src/entry.mjs"]);

  const baseline = buildWarmachineSearchSourceReceiptV1(options);
  const repeated = buildWarmachineSearchSourceReceiptV1(options);
  assert.equal(repeated.sourceReceiptHash, baseline.sourceReceiptHash);
  assert.equal(baseline.sourceFileCount, 2);

  write("src/unrelated.mjs", "export const unrelated = false;\n");
  const unrelatedDrift = buildWarmachineSearchSourceReceiptV1(options);
  assert.equal(unrelatedDrift.sourceReceiptHash, baseline.sourceReceiptHash);

  write("src/dependency.mjs", "export const value = 2;\n");
  const dependencyDrift = buildWarmachineSearchSourceReceiptV1(options);
  assert.notEqual(dependencyDrift.sourceReceiptHash, baseline.sourceReceiptHash);

  const composite = buildWarmachineCompositeExecutionReceiptV1({
    ...options,
    hostReceipt,
    constructionHostReceipt,
    focusedEngineReceipt,
  });
  const engineDrift = buildWarmachineCompositeExecutionReceiptV1({
    ...options,
    hostReceipt: {
      ...hostReceipt,
      sourceHashes: { "scripts/rules.mjs": "d".repeat(64) },
      receiptHash: "e".repeat(64),
    },
    constructionHostReceipt,
    focusedEngineReceipt,
  });
  assert.notEqual(engineDrift.executionReceiptHash, composite.executionReceiptHash);
  const focusedEngineDrift = buildWarmachineCompositeExecutionReceiptV1({
    ...options,
    hostReceipt,
    constructionHostReceipt,
    focusedEngineReceipt: {
      ...focusedEngineReceipt,
      observedExecutionSourceReceiptHash: "2".repeat(64),
      current: false,
      failClosedReasons: ["focused_engine_execution_source_receipt_mismatch"],
    },
  });
  assert.notEqual(
    focusedEngineDrift.executionReceiptHash,
    composite.executionReceiptHash,
  );
  assert.equal(composite.current, true);
  assert.equal(focusedEngineDrift.current, false);
  const ruleSemanticsAuthorityDrift = buildWarmachineCompositeExecutionReceiptV1({
    ...options,
    hostReceipt,
    constructionHostReceipt,
    focusedEngineReceipt: {
      ...focusedEngineReceipt,
      ruleSemanticsAuthority: {
        ...focusedEngineReceipt.ruleSemanticsAuthority,
        authorityReceiptHash: "3".repeat(64),
        verdict: {
          ...focusedEngineReceipt.ruleSemanticsAuthority.verdict,
          globalStrictReady: false,
          strictExecutorReady: false,
        },
        quarantine: { active: true },
        failClosedReasons: ["semantic_artifact_not_ready:timingDag"],
      },
    },
  });
  assert.notEqual(
    ruleSemanticsAuthorityDrift.executionReceiptHash,
    composite.executionReceiptHash,
  );
  assert.equal(ruleSemanticsAuthorityDrift.current, false);
  assert.equal("projectDRoot" in composite.engine, false);

  const current = buildWarmachineSearchSourceReceiptV1();
  const currentPaths = new Set(current.sourceRecords.map((entry) => entry.relativePath));
  assert.equal(currentPaths.has(
    "src/matchup/matchup-assassination-terminal-task-materializer-v1.mjs"), true);
  assert.equal(currentPaths.has(
    "src/matchup/matchup-terminal-root-batch-v1.mjs"), true);
  assert.equal(currentPaths.has(
    "src/matchup/matchup-terminal-task-execution-batch-v1.mjs"), true);
  assert.equal(currentPaths.has(
    "src/matchup/matchup-terminal-root-batch-checkpoint-store-v1.mjs"), true);
  assert.equal(currentPaths.has(
    "scripts/execute-custom-matchup-terminal-root-batch-v1.mjs"), true);
  assert.equal(currentPaths.has(
    "src/reverse/terminal-rooted-to-deployment-v1.mjs"), true);
  assert.equal(currentPaths.has(
    "src/search/complete-activation-domain-v2.mjs"), true);
  assert.equal(currentPaths.has(
    "src/geometry/cell-connectivity-v1.mjs"), true);
  assert.equal(currentPaths.has(
    "src/geometry/movement-event-word-language-v1.mjs"), true);
  assert.equal(currentPaths.has(
    "src/geometry/path-topology-v1.mjs"), true);
  assert.equal(currentPaths.has(
    "src/geometry/strict-representative-v1.mjs"), true);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    transitiveSearchClosure: true,
    unrelatedSourceDoesNotInvalidate: true,
    executionDependencyDriftInvalidates: true,
    engineDependencyDriftInvalidates: true,
    focusedEngineReceiptDriftInvalidates: true,
    ruleSemanticsAuthorityDriftInvalidates: true,
    pathIndependent: true,
    currentMaterializerPlannerRecoveryClosure: current.sourceFileCount,
  }, null, 2)}\n`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
