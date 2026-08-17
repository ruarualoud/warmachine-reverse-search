import assert from "node:assert/strict";

import { buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-anchor-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerSimultaneousLeaderTerminalAnchorEvidenceV1,
} from
  "../src/reverse/steamroller-simultaneous-leader-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1 } from
  "../src/reverse/steamroller-terminal-execution-roster-witness-v1.mjs";

const scoreAnchors = buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1();
const rosterWitness = buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1();
const scenarioProposal = scoreAnchors.proposals.find((proposal) =>
  proposal.hostScenarioKey === "high_stakes");
const result = buildWarmachineSteamrollerSimultaneousLeaderTerminalAnchorEvidenceV1({
  corpus: scoreAnchors.corpus,
  rosterWitness,
  scenarioProposal,
});
const root = result.evidence.roots[0];

assert.equal(result.evidence.strictMaterializedRootCount, 1);
assert.equal(root.disposition, "strict_materialized");
assert.equal(root.strictReplayCertified, true);
assert.equal(root.terminalClassKey, "simultaneous_leader_tiebreak");
assert.equal(root.tiebreakClassKey, "victory_point_advantage");
assert.equal(root.executionRosterModelCount, 103);
assert.equal(root.actionType, "end_turn");
assert.equal(root.terminalStepReverseCertified, true);
assert.equal(root.strictPredecessorCount, 1);
assert.equal(root.reversePredecessorStateHash, root.predecessorStateHash);
assert.deepEqual(root.reverseMatchedProbability, {
  numerator: "1",
  denominator: "3888",
  decimal: 1 / 3888,
});
assert.equal(root.simultaneousEvent.eventType, "simultaneous_leader_destruction");
assert.equal(root.simultaneousEvent.winnerSideKey, "player2");
assert.equal(root.scoreBefore.player2, 5);
assert.equal(root.reachabilityProven, false);
assert.equal(root.trainingTruth, false);
assert.equal(result.runtime.placementAudit.ok, true);
assert.equal(result.runtime.primary.terminalStateHash, result.runtime.replay.terminalStateHash);
assert.ok(result.runtime.primary.transition.events.some((event) =>
  event.eventType === "high_stakes_element_detonated"));
assert.ok(result.runtime.primary.transition.events.some((event) =>
  event.eventType === "terminal" &&
  event.reason === "steamroller_2026_simultaneous_leaders_tiebreak_resolved" &&
  event.winnerSideKey === "player2"));

const scenarioPresence =
  buildWarmachineSteamrollerSimultaneousLeaderTerminalAnchorEvidenceV1({
    corpus: scoreAnchors.corpus,
    rosterWitness,
    scenarioProposal,
    tiebreakClassKey: "victory_points_tied_scenario_presence_advantage",
  });
const scenarioPresenceRoot = scenarioPresence.evidence.roots[0];
assert.equal(scenarioPresenceRoot.tiebreakClassKey,
  "victory_points_tied_scenario_presence_advantage");
assert.equal(scenarioPresenceRoot.scoreAfter.player1, scenarioPresenceRoot.scoreAfter.player2);
assert.equal(scenarioPresenceRoot.simultaneousEvent.winnerSideKey, "player2");
assert.equal(scenarioPresenceRoot.simultaneousEvent.tiebreakerResult?.reason,
  "scenario_presence_tiebreaker_resolved");
assert.equal(scenarioPresenceRoot.simultaneousEvent.tiebreakerResult?.winnerSideKey, "player2");
assert.ok(Number(scenarioPresenceRoot.simultaneousEvent.tiebreakerResult?.score?.player2 || 0) >
  Number(scenarioPresenceRoot.simultaneousEvent.tiebreakerResult?.score?.player1 || 0));
assert.equal(scenarioPresenceRoot.strictReplayCertified, true);
assert.equal(scenarioPresenceRoot.terminalStepReverseCertified, true);
assert.equal(scenarioPresenceRoot.strictPredecessorCount, 1);
assert.equal(scenarioPresenceRoot.reversePredecessorStateHash,
  scenarioPresenceRoot.predecessorStateHash);
assert.deepEqual(scenarioPresenceRoot.reverseMatchedProbability, {
  numerator: "1",
  denominator: "3888",
  decimal: 1 / 3888,
});
assert.equal(scenarioPresenceRoot.reachabilityProven, false);
assert.equal(scenarioPresenceRoot.trainingTruth, false);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_steamroller_simultaneous_leader_terminal_anchor_evidence_v1",
  evidenceHash: result.evidence.evidenceHash,
  root: {
    cellKey: root.cellKey,
    subcellKey: root.subcellKey,
    actionType: root.actionType,
    scoreBefore: root.scoreBefore,
    scoreAfter: root.scoreAfter,
    winnerSideKey: root.simultaneousEvent.winnerSideKey,
    receiptHash: root.receiptHash,
    replayReceiptHash: root.replayReceiptHash,
  },
  scenarioPresenceRoot: {
    cellKey: scenarioPresenceRoot.cellKey,
    subcellKey: scenarioPresenceRoot.subcellKey,
    scoreBefore: scenarioPresenceRoot.scoreBefore,
    scoreAfter: scenarioPresenceRoot.scoreAfter,
    tiebreakClassKey: scenarioPresenceRoot.tiebreakClassKey,
    scenarioPresence: scenarioPresenceRoot.simultaneousEvent.tiebreakerResult,
    receiptHash: scenarioPresenceRoot.receiptHash,
    replayReceiptHash: scenarioPresenceRoot.replayReceiptHash,
  },
}, null, 2));
