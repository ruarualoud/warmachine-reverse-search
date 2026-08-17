import assert from "node:assert/strict";

import { buildWarmachineSteamrollerFixedRoundTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-fixed-round-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1 } from
  "../src/reverse/steamroller-terminal-execution-roster-witness-v1.mjs";

const scoreAnchors = buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1();
const rosterWitness = buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1();
const result = buildWarmachineSteamrollerFixedRoundTerminalAnchorEvidenceV1({
  corpus: scoreAnchors.corpus,
  rosterWitness,
  scenarioProposals: scoreAnchors.proposals,
});

assert.equal(result.evidence.strictMaterializedRootCount, 6);
assert.equal(result.evidence.strictRejectedRootCount, 0);
assert.equal(result.evidence.roots.length, 6);
assert.deepEqual(result.evidence.roots.map((root) => root.scenarioKey).sort(), [
  "fault_line",
  "high_stakes",
  "payload",
  "pressure_point",
  "trench_warfare",
  "wolves_at_our_heels",
]);
for (const root of result.evidence.roots) {
  assert.equal(root.disposition, "strict_materialized");
  assert.equal(root.terminalClassKey, "fixed_round_limit_result");
  assert.equal(root.tiebreakClassKey, "victory_point_advantage");
  assert.equal(root.representativeRoundNumber, 7);
  assert.equal(root.endingSideKey, "player2");
  assert.equal(root.winnerSideKey, "player1");
  assert.equal(root.executionRosterModelCount, 103);
  assert.equal(root.actionType, "end_turn");
  assert.equal(root.sourceResolutionStatus, "officially_confirmed");
  assert.equal(root.partitionCoordinates.resource, "maximum_native_resource");
  assert.equal(root.resourcePartitionAudit.passed, true);
  assert.equal(root.resourcePartitionAudit.resourceLedger.every((row) =>
    row.resourcePoints === row.resourceMax), true);
  assert.equal(root.strictReplayCertified, true);
  assert.equal(root.reachabilityProven, false);
  assert.equal(root.trainingTruth, false);
  assert.equal(root.scoreAfter.player1 > root.scoreAfter.player2, true);
  assert.equal(root.roundLimitEvent.eventType, "scenario_round_limit");
  assert.equal(root.roundLimitEvent.completedRound, 7);
  assert.equal(root.terminalEvent.reason, "scenario_round_limit_tiebreak");
  assert.equal(root.receiptHash, root.replayReceiptHash);
}
assert.equal(result.runtime.every((row) => row.placementAudit.ok), true);
assert.equal(result.runtime.every((row) =>
  row.primary.terminalStateHash === row.replay.terminalStateHash), true);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_steamroller_fixed_round_terminal_anchor_evidence_v1",
  evidenceHash: result.evidence.evidenceHash,
  roots: result.evidence.roots.map((root) => ({
    scenarioKey: root.scenarioKey,
    cellKey: root.cellKey,
    subcellKey: root.subcellKey,
    scoreBefore: root.scoreBefore,
    scoreAfter: root.scoreAfter,
    winnerSideKey: root.winnerSideKey,
    receiptHash: root.receiptHash,
  })),
}, null, 2));
