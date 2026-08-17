import assert from "node:assert/strict";

import { buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-anchor-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerStrygonSpraySimultaneousLeaderTerminalEvidenceV1,
} from
  "../src/reverse/steamroller-strygon-spray-simultaneous-leader-terminal-evidence-v1.mjs";

const scoreAnchors = buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1();
const result = buildWarmachineSteamrollerStrygonSpraySimultaneousLeaderTerminalEvidenceV1({
  corpus: scoreAnchors.corpus,
  scenarioProposal: scoreAnchors.proposals.find((proposal) =>
    proposal.hostScenarioKey === "high_stakes"),
});
const root = result.evidence.roots[0];

assert.equal(result.evidence.strictMaterializedRootCount, 1);
assert.equal(root.disposition, "strict_materialized");
assert.equal(root.strictReplayCertified, true);
assert.equal(root.executionRosterModelCount, 103);
assert.equal(root.actionType, "ranged_attack");
assert.equal(root.attackProfileKey, "e1b2dda1-a26e-482a-94f0-e335a30dfaa3");
assert.equal(root.criticalSlowAtomKey, "critical_slow_living_on_critical_hit_status");
assert.equal(root.simultaneousEvent.winnerSideKey, "player2");
assert.equal(root.reachabilityProven, false);
assert.equal(root.trainingTruth, false);
assert.equal(result.runtime.placementAudit.ok, true);
assert.equal(result.runtime.primary.terminalStateHash, result.runtime.replay.terminalStateHash);
assert.equal(result.runtime.primary.transitions.length, 3);
assert.deepEqual(result.runtime.primary.transitions.slice(0, 2).map((transition) =>
  transition.reason), [
  "pre_roll_resource_boost_decision_required",
  "pre_roll_resource_boost_decision_required",
]);
assert.ok(result.runtime.primary.events.some((event) =>
  event.eventType === "terminal" &&
  event.reason === "steamroller_2026_simultaneous_leaders_tiebreak_resolved" &&
  event.winnerSideKey === "player2"));

console.log(JSON.stringify({
  ok: true,
  schemaVersion:
    "verify_steamroller_strygon_spray_simultaneous_leader_terminal_evidence_v1",
  evidenceHash: result.evidence.evidenceHash,
  root: {
    cellKey: root.cellKey,
    subcellKey: root.subcellKey,
    actionType: root.actionType,
    actorPieceKey: root.actorPieceKey,
    friendlyLeaderPieceKey: root.friendlyLeaderPieceKey,
    enemyLeaderPieceKey: root.enemyLeaderPieceKey,
    scoreBefore: root.scoreBefore,
    scoreAfter: root.scoreAfter,
    winnerSideKey: root.simultaneousEvent.winnerSideKey,
    receiptHash: root.receiptHash,
    replayReceiptHash: root.replayReceiptHash,
  },
}, null, 2));
