#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  buildWarmachineSearchRunContractV1,
  normalizeWarmachineSearchRunOptionsV1,
} from "../src/contracts/search-run-contract-v1.mjs";

const identity = {
  hostReceiptHash: "host-v1",
  searchSourceClosureHash: "search-v1",
  fixtureHash: "fixture-v1",
  terminalCellKey: "terminal-cell-v1",
};
const baseOptions = {
  maximumRouteLabels: 16,
  maximumActivationCandidatesPerExpansion: 1,
  movementActionTypes: ["advance", "run"],
  nested: { alpha: 1, beta: 2 },
};
const base = buildWarmachineSearchRunContractV1({
  ...identity,
  options: baseOptions,
});
const reorderedWithRuntimeState = buildWarmachineSearchRunContractV1({
  ...identity,
  options: {
    nested: { beta: 2, alpha: 1 },
    movementActionTypes: ["advance", "run"],
    maximumActivationCandidatesPerExpansion: 1,
    maximumRouteLabels: 16,
    historicalResumeCheckpoint: { checkpointHash: "runtime-only" },
    activationResumeCheckpoints: { one: { checkpointHash: "runtime-only" } },
    onProgress() {},
  },
});
assert.equal(
  reorderedWithRuntimeState.searchRunContractHash,
  base.searchRunContractHash,
  "Runtime callbacks/checkpoints and object insertion order must not change the run contract",
);

const expanded = buildWarmachineSearchRunContractV1({
  ...identity,
  options: {
    ...baseOptions,
    maximumRouteLabels: 64,
    maximumActivationCandidatesPerExpansion: 2,
  },
});
assert.notEqual(
  expanded.searchRunContractHash,
  base.searchRunContractHash,
  "A search budget change must create a distinct run contract",
);

const differentFixture = buildWarmachineSearchRunContractV1({
  ...identity,
  fixtureHash: "fixture-v2",
  options: baseOptions,
});
assert.notEqual(differentFixture.searchRunContractHash, base.searchRunContractHash);
assert.deepEqual(normalizeWarmachineSearchRunOptionsV1({
  keep: true,
  resumeCheckpoint: { ignored: true },
  nested: { keep: 1, ignored: () => 2 },
}), {
  keep: true,
  nested: { keep: 1 },
});

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_search_run_contract_v1",
  baseSearchRunContractHash: base.searchRunContractHash,
  expandedSearchRunContractHash: expanded.searchRunContractHash,
}, null, 2)}\n`);
