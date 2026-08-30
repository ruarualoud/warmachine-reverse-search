#!/usr/bin/env node

import assert from "node:assert/strict";

import { bindWarmachineBenchmarkExplicitMovementPathV2 } from
  "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import {
  projectWarmachineBenchmarkGameStateV2,
  warmachineBenchmarkGameStateHashV2,
} from "../src/benchmark/benchmark-game-state-hash-v2.mjs";
import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import { certifyWarmachineExecutedTerminalRouteStrictV2 } from
  "../src/reverse/strict-route-witness-v2.mjs";
import {
  normalizeRulesV1State,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const state = normalizeRulesV1State({
  stateKey: "benchmark-game-state-hash-fixture",
  strictMode: true,
  activeSideKey: "player1",
  turnNumber: 1,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [{
    pieceKey: "runner",
    sideKey: "player1",
    position: { xIn: 4, yIn: 4 },
    baseSizeIn: 1.2,
    speedIn: 6,
    boxesRemaining: 1,
    damage: { boxesRemaining: 1, maxBoxes: 1 },
  }],
});
const bound = bindWarmachineBenchmarkExplicitMovementPathV2(state, {
  actorPieceKey: "runner",
  actionType: "run",
  pathKey: "projection-test-run",
  waypoints: [{ xIn: 4, yIn: 10 }],
});
assert.notEqual(stableGraphHash(bound), stableGraphHash(state));
assert.equal(
  warmachineBenchmarkGameStateHashV2(bound),
  warmachineBenchmarkGameStateHashV2(state),
);
assert.deepEqual(
  projectWarmachineBenchmarkGameStateV2(bound).explicitMovementPaths,
  [],
);
assert.equal(projectWarmachineBenchmarkGameStateV2(bound).stateKey, state.stateKey);

const moved = structuredClone(bound);
moved.pieces[0].position = { xIn: 4, yIn: 5 };
assert.notEqual(
  warmachineBenchmarkGameStateHashV2(moved),
  warmachineBenchmarkGameStateHashV2(state),
);

const receiptCore = {
  schemaVersion: "warmachine_fixed_benchmark_step_receipt_v2",
  upstreamReceiptHash: warmachineHost.receipt.receiptHash,
  stateHashInput: stableGraphHash(bound),
  stateHashBefore: stableGraphHash(bound),
  stateHashAfter: stableGraphHash(bound),
  gameStateHashInput: warmachineBenchmarkGameStateHashV2(bound),
  gameStateHashBefore: warmachineBenchmarkGameStateHashV2(bound),
  gameStateHashAfter: warmachineBenchmarkGameStateHashV2(bound),
  persistedAction: { actionKey: "projection_metadata_only" },
  transitionOk: true,
  events: [],
};
const receipt = { ...receiptCore, receiptHash: stableGraphHash(receiptCore) };
const projectedWitness = certifyWarmachineExecutedTerminalRouteStrictV2(
  state,
  state,
  [receipt],
  { goalType: "scenario_score", winnerSideKey: "player1" },
  { routeKey: "benchmark-game-state-hash-projection-test" },
);
assert.equal(projectedWitness.routeExecutionValidated, true,
  JSON.stringify(projectedWitness.issues));
assert.equal(projectedWitness.stateHashChainMode,
  "benchmark_game_state_projection_v2");
const tamperedWitness = certifyWarmachineExecutedTerminalRouteStrictV2(
  state,
  moved,
  [receipt],
  { goalType: "scenario_score", winnerSideKey: "player1" },
  { routeKey: "benchmark-game-state-hash-tamper-test" },
);
assert.equal(tamperedWitness.routeExecutionValidated, false);
assert.equal(tamperedWitness.issues.some((issue) =>
  issue.reason === "strict_route_final_state_hash_mismatch"), true);

process.stdout.write(`${JSON.stringify({
  ok: true,
  fullStateHashChangedByPathBinding: true,
  gameStateHashStableAcrossPathBinding: true,
  gameStateHashChangedByRealMovement: true,
  projectedReceiptChainValidated: projectedWitness.routeExecutionValidated,
  realStateTamperRejected: !tamperedWitness.routeExecutionValidated,
}, null, 2)}\n`);
