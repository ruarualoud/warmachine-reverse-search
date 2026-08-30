#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
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

function argumentValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

const routeId = argumentValue("route-id", "ticket07-score");
const fixturePath = path.join(evidenceRoot,
  `${routeId}-forward-route-fixture-v1.json`);
const openingPath = path.join(evidenceRoot,
  `${routeId}-strict-route-opening-v1.json`);
const reverseReportPath = path.join(evidenceRoot,
  `${routeId}-root-to-opening-v1.json`);
const outputPath = path.join(evidenceRoot, `${routeId}-route-unit-v1.json`);

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing evidence ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function settlementTransition(stage = {}, index = 0) {
  assert.ok(stage.preEndState, `stage ${index}: preEndState required`);
  assert.ok(stage.state, `stage ${index}: successor state required`);
  return {
    windowKey: `${routeId}:stage-${index + 1}:round-${
      stage.preEndState.turnNumber}:${stage.preEndState.activeSideKey}`,
    round: stage.preEndState.turnNumber,
    endingSideKey: stage.preEndState.activeSideKey,
    predecessorState: stage.preEndState,
    successorState: stage.state,
    actionPatch: {},
  };
}

function challengerLeaderName(state = {}) {
  const leader = (state.pieces || []).find((piece) => piece.sideKey === "player2" &&
    (piece.isWarcaster === true || piece.isWarlock === true));
  assert.ok(leader, "Score route challenger leader missing");
  return String(leader.cardSnapshot?.name || leader.cardName || leader.label || "");
}

const fixture = readJson(fixturePath);
const opening = readJson(openingPath);
const reverseReport = readJson(reverseReportPath);
assert.equal(fixture.hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(reverseReport.hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(reverseReport.fixtureHash, fixture.fixtureHash);
assert.equal(reverseReport.routeCandidateKeys.length, 1);
assert.equal(reverseReport.fullRouteStrictReplayCertifiedCount, 1);
assert.equal(reverseReport.oracleIsolationPassed, true);
assert.equal(reverseReport.strictOpeningStateHashes.length, 1);
assert.equal(reverseReport.strictOpeningStateHashes[0],
  opening.strictOpeningStateHash);
assert.equal(reverseReport.strictRouteOpeningEvidenceHash,
  opening.openingEvidenceHash);
assert.equal(reverseReport.reverseEdgeCounts.length, 1);
assert.equal(reverseReport.reverseEdgeCounts[0] > 0, true);

const settlementTransitions = fixture.stages.map(settlementTransition);
const historyBinding = certifyWarmachineStrictSettlementHistoryBindingV1({
  terminalHypothesis: {
    terminalHypothesisKey: `${routeId}-history`,
    terminalClassKey: "lead_three_after_opponent_turn_scoring",
    scenarioKey: "two_fronts",
    mapKey: opening.openingAddress.mapKey,
    terminalRound: 3,
    endingSideKey: "player2",
    winnerSideKey: "player1",
    loserSideKey: "player2",
  },
  settlementTransitions,
});
assert.equal(historyBinding.ok, true, JSON.stringify(historyBinding.failures, null, 2));
assert.equal(historyBinding.strictCertified, true);
assert.deepEqual(historyBinding.preset.finalScore,
  fixture.scoreTimeline.at(-1).score);
assert.equal(historyBinding.preset.finalScore.player1, 6);
assert.equal([0, 1].includes(historyBinding.preset.finalScore.player2), true);

assert.equal(opening.subjectRosterKey, fixture.subjectRosterKey);
assert.equal(opening.challengerRosterKey, fixture.challengerRosterKey);
assert.equal(opening.rosterPointLedger.sides.player1.rosterPoints, 100);
assert.equal(opening.rosterPointLedger.sides.player2.rosterPoints, 100);
const terminalEvent = fixture.stages.flatMap((stage) =>
  stage.terminalEvents || []).find((event) => event.eventType === "terminal");
assert.equal(terminalEvent?.winnerSideKey, "player1");

const core = stableGraphValue({
  schemaVersion: "warmachine_ticket09_strict_route_unit_v1",
  routeId,
  routeKey: reverseReport.routeCandidateKeys[0],
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  terminalFamilyKey: "score",
  terminalSourceKey: "two_fronts_round3_lead_three_score_v1",
  leaderName: challengerLeaderName(fixture.injectedOpeningState),
  challengerSideKey: "player2",
  winnerSideKey: terminalEvent.winnerSideKey,
  subjectRosterKey: fixture.subjectRosterKey,
  challengerRosterKey: fixture.challengerRosterKey,
  rosterPointLedger: opening.rosterPointLedger,
  physicalModelCount: opening.physicalModelCount,
  openingKey: opening.openingEvidenceHash,
  strictOpeningStateHash: reverseReport.strictOpeningStateHashes[0],
  strictOpeningEvidenceHash: opening.strictReplayEvidenceHash,
  openingAddress: opening.openingAddress,
  strictRoute: {
    strictOpeningComplete: true,
    strictReplayComplete: true,
    assumptionClosureComplete: historyBinding.strictCertified === true,
    transitionCount: fixture.routeReceiptHashes.length,
    reverseEdgeCount: reverseReport.reverseEdgeCounts[0],
    routeReceiptHashes: fixture.routeReceiptHashes,
    routeWitnessHash: fixture.routeWitnessHash,
    fullRouteReplayHash: reverseReport.fullRouteStrictReplayHashes[0],
    semanticOutcomeHash: reverseReport.semanticOutcomeHash,
    historyBindingHash: historyBinding.bindingHash,
    unresolvedBranchCount: reverseReport.unresolvedCount,
    rejectedBranchCount: reverseReport.rejectedBranchCount,
    candidateSetComplete: false,
    opponentResponseSetComplete: false,
    chanceMassComplete: false,
  },
  observed: {
    scoreTimeline: fixture.scoreTimeline,
    terminalEvent,
  },
  evidenceFiles: {
    forwardFixture: path.basename(fixturePath),
    strictRouteOpening: path.basename(openingPath),
    reverseReport: path.basename(reverseReportPath),
  },
  claimBoundary: "This unit proves one current-Host score route from one exact legal deployment through a strict reverse-to-opening witness and full replay. It does not prove adversarial defense, Chance closure, candidate completeness, strategy value or natural win rate.",
});
const unit = { ...core, fixtureHash: stableGraphHash(core) };
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(unit)}\n`);
fs.renameSync(temporaryPath, outputPath);

process.stdout.write(`${JSON.stringify({
  ok: true,
  routeId,
  routeKey: unit.routeKey,
  leaderName: unit.leaderName,
  subjectRosterKey: unit.subjectRosterKey,
  challengerRosterKey: unit.challengerRosterKey,
  strictOpeningStateHash: unit.strictOpeningStateHash,
  reverseEdgeCount: unit.strictRoute.reverseEdgeCount,
  historyBindingHash: unit.strictRoute.historyBindingHash,
  fixtureHash: unit.fixtureHash,
  outputPath,
}, null, 2)}\n`);
