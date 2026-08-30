#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import { certifyWarmachineStrictSettlementHistoryBindingV1 } from
  "../src/reverse/steamroller-history-bound-terminal-hypothesis-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const evidenceRoot = path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
);
const reportPath = path.join(
  evidenceRoot,
  "ticket19-real-route-history-binding-v1.json",
);

function readJson(relativePath) {
  const filePath = path.join(evidenceRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`ticket19_required_real_route_fixture_missing:${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function settlementTransition(stage = {}, label = "") {
  assert.ok(stage.preEndState, `${label}: preEndState required`);
  assert.ok(stage.state, `${label}: successor state required`);
  return {
    windowKey: `${label}:round-${stage.preEndState.turnNumber}:${
      stage.preEndState.activeSideKey}`,
    round: stage.preEndState.turnNumber,
    endingSideKey: stage.preEndState.activeSideKey,
    predecessorState: stage.preEndState,
    successorState: stage.state,
    actionPatch: {},
  };
}

const ticket06Fixture = readJson("ticket06-short-route-preflight-fixture-v1.json");
assert.equal(ticket06Fixture.hostReceiptHash, warmachineHost.receipt.receiptHash);
const ticket06Stages = ticket06Fixture.witness.stages;
const ticket06Binding = certifyWarmachineStrictSettlementHistoryBindingV1({
  terminalHypothesis: {
    terminalHypothesisKey: "ticket06-current-short-assassination-history",
    terminalClassKey: "unique_leader_assassination",
    scenarioKey: "two_fronts",
    mapKey: "two-fronts-official-map-2",
    terminalRound: 2,
    endingSideKey: "player2",
    winnerSideKey: "player2",
    loserSideKey: "player1",
  },
  settlementTransitions: [
    settlementTransition(ticket06Stages.p2TurnOne, "ticket06-player2-turn1"),
    settlementTransition(ticket06Stages.p1TurnOne, "ticket06-player1-turn1"),
  ],
});
assert.equal(ticket06Binding.ok, true,
  JSON.stringify(ticket06Binding.failures, null, 2));
assert.equal(ticket06Binding.strictCertified, true);
assert.equal(ticket06Binding.branchMatch.strictCertifiedWindowCount, 2);
assert.deepEqual(ticket06Binding.preset.finalScore, {
  player1: 0,
  player2: 0,
});
assert.equal(ticket06Binding.preset.scoreTrajectory.every((row) =>
  row.terminalCheck.terminal === false), true);

const ticket07Fixture = readJson("ticket07-score-forward-route-fixture-v1.json");
const ticket07Report = readJson("ticket07-score-root-to-opening-v1.json");
assert.equal(ticket07Report.hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(ticket07Report.fixtureHash, ticket07Fixture.fixtureHash);
assert.equal(ticket07Report.fullRouteStrictReplayCertifiedCount, 1);
assert.equal(ticket07Report.legalDeploymentRouteCount, 1);
const ticket07Transitions = ticket07Fixture.stages.map((stage, index) =>
  settlementTransition(stage, `ticket07-stage-${index + 1}`));
const ticket07Binding = certifyWarmachineStrictSettlementHistoryBindingV1({
  terminalHypothesis: {
    terminalHypothesisKey: "ticket07-current-score-route-history",
    terminalClassKey: "lead_three_after_opponent_turn_scoring",
    scenarioKey: "two_fronts",
    mapKey: "two-fronts-official-map-2",
    terminalRound: 3,
    endingSideKey: "player2",
    winnerSideKey: "player1",
    loserSideKey: "player2",
  },
  settlementTransitions: ticket07Transitions,
});
assert.equal(ticket07Binding.ok, true,
  JSON.stringify(ticket07Binding.failures, null, 2));
assert.equal(ticket07Binding.strictCertified, true);
assert.equal(ticket07Binding.branchMatch.strictCertifiedWindowCount, 5);
assert.deepEqual(ticket07Binding.preset.finalScore, {
  player1: 6,
  player2: 1,
});
assert.deepEqual(ticket07Binding.preset.scoreTrajectory.map((row) =>
  row.scoreAfter), ticket07Fixture.scoreTimeline.map((row) => row.score));
assert.equal(ticket07Binding.preset.scoreTrajectory.slice(0, -1).every((row) =>
  row.terminalCheck.terminal === false), true);
assert.equal(ticket07Binding.preset.scoreTrajectory.at(-1)
  .terminalCheck.terminal, true);
assert.equal(ticket07Binding.preset.settlementWindows.flatMap((window) =>
  window.sources).length, 7);

const mismatchedTransitions = structuredClone(ticket07Transitions);
mismatchedTransitions.at(-1).successorState.scenario.score = {
  player1: 4,
  player2: 0,
};
const mismatchedBinding = certifyWarmachineStrictSettlementHistoryBindingV1({
  terminalHypothesis: {
    terminalHypothesisKey: "ticket07-invalid-four-zero-rewrite",
    terminalClassKey: "lead_three_after_opponent_turn_scoring",
    scenarioKey: "two_fronts",
    mapKey: "two-fronts-official-map-2",
    terminalRound: 3,
    endingSideKey: "player2",
    winnerSideKey: "player1",
    loserSideKey: "player2",
  },
  settlementTransitions: mismatchedTransitions,
});
assert.equal(mismatchedBinding.ok, false);
assert.equal(mismatchedBinding.reason, "strict_history_binding_preflight_failed");
assert.equal(mismatchedBinding.failures.some((failure) =>
  failure.reason === "history_bound_terminal_successor_state_mismatch"), true);

const report = {
  ok: true,
  schemaVersion: "verify_ticket19_real_route_history_binding_v1",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  ticket06: {
    fixtureHash: ticket06Fixture.witnessHash,
    settlementWindowCount: 2,
    finalScore: ticket06Binding.preset.finalScore,
    presetHash: ticket06Binding.preset.presetHash,
    matchHash: ticket06Binding.branchMatch.matchHash,
    bindingHash: ticket06Binding.bindingHash,
  },
  ticket07: {
    fixtureHash: ticket07Fixture.fixtureHash,
    sourceFixtureHostReceiptHash: ticket07Fixture.hostReceiptHash,
    currentHostFullRouteStrictReplayCertifiedCount:
      ticket07Report.fullRouteStrictReplayCertifiedCount,
    closedRouteSemanticOutcomeHash: ticket07Report.semanticOutcomeHash,
    settlementWindowCount: 5,
    scoringSourceCount: 7,
    finalScore: ticket07Binding.preset.finalScore,
    presetHash: ticket07Binding.preset.presetHash,
    matchHash: ticket07Binding.branchMatch.matchHash,
    bindingHash: ticket07Binding.bindingHash,
  },
  invalidFourZeroRewrite: {
    rejected: true,
    failureReasons: mismatchedBinding.failures.map((failure) => failure.reason),
  },
};
const sealedReport = {
  ...report,
  reportHash: stableGraphHash(report),
};
const temporaryReportPath = `${reportPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryReportPath, `${JSON.stringify(sealedReport, null, 2)}\n`);
fs.renameSync(temporaryReportPath, reportPath);
console.log(JSON.stringify(sealedReport, null, 2));
