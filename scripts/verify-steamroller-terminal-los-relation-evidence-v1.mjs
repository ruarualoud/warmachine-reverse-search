import assert from "node:assert/strict";

import { buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerStrygonSpraySimultaneousLeaderTerminalEvidenceV1 } from
  "../src/reverse/steamroller-strygon-spray-simultaneous-leader-terminal-evidence-v1.mjs";
import { buildWarmachineSteamrollerTerminalLosRelationEvidenceV1 } from
  "../src/reverse/steamroller-terminal-los-relation-evidence-v1.mjs";

const scoreAnchors = buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1();
const strygon = buildWarmachineSteamrollerStrygonSpraySimultaneousLeaderTerminalEvidenceV1({
  corpus: scoreAnchors.corpus,
  scenarioProposal: scoreAnchors.proposals.find((proposal) =>
    proposal.hostScenarioKey === "high_stakes"),
});
const result = buildWarmachineSteamrollerTerminalLosRelationEvidenceV1({
  corpus: scoreAnchors.corpus,
  rosterWitness: {
    witness: strygon.evidence.executionRosterWitness,
  },
  baselineState: strygon.runtime.authoredState,
});

assert.equal(result.evidence.executionRosterWitness.complete, true);
assert.equal(result.evidence.executionRosterWitness.modelCount, 103);
assert.equal(result.evidence.strictMaterializedRootCount, 1);
assert.equal(result.evidence.strictRejectedRootCount, 2);
assert.equal(result.evidence.proposalFilteredRootCount, 1);
assert.equal(result.evidence.inputInvalidRootCount, 0);
assert.equal(result.evidence.roots.length, 4);
const byLos = new Map(result.evidence.roots.map((root) => [
  root.partitionCoordinates.lineOfSight,
  root,
]));
for (const value of ["terrain_blocked", "model_blocked"]) {
  const root = byLos.get(value);
  assert.equal(root.disposition, "strict_rejected");
  assert.equal(root.rejectionReason, "line_of_sight_blocked");
  assert.equal(root.strictReplayCertified, true);
  assert.ok(root.receiptHash);
  assert.ok(root.replayReceiptHash);
}
const stealth = byLos.get("stealth_blocks_beyond_five");
assert.equal(stealth.disposition, "proposal_filtered");
assert.equal(stealth.strictReplayCertified, true);
assert.ok(stealth.geometry.actorTargetEdgeDistanceIn > 5);
assert.match(stealth.automaticMissMarker, /stealth_automatic_miss/);
const override = byLos.get("true_sight_or_ignore_stealth_override");
assert.equal(override.disposition, "strict_materialized");
assert.equal(override.strictReplayCertified, true);
assert.ok(override.geometry.actorTargetEdgeDistanceIn > 5);
assert.ok(override.ignoreStealthEffects.length > 0);
assert.equal(override.terminalEvent.winnerSideKey, "player2");
assert.equal(result.evidence.roots.every((root) => root.trainingTruth === false), true);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_steamroller_terminal_los_relation_evidence_v1",
  corpusHash: result.evidence.corpusHash,
  evidenceHash: result.evidence.evidenceHash,
  counts: {
    strictMaterialized: result.evidence.strictMaterializedRootCount,
    strictRejected: result.evidence.strictRejectedRootCount,
    proposalFiltered: result.evidence.proposalFilteredRootCount,
    inputInvalid: result.evidence.inputInvalidRootCount,
  },
  roots: result.evidence.roots.map((root) => ({
    lineOfSight: root.partitionCoordinates.lineOfSight,
    disposition: root.disposition,
    actionType: root.actionType || "",
    rejectionReason: root.rejectionReason || "",
    actorTargetEdgeDistanceIn: root.geometry.actorTargetEdgeDistanceIn,
    receiptHash: root.receiptHash,
    replayReceiptHash: root.replayReceiptHash,
  })),
  claimBoundary: result.evidence.claimBoundary,
}, null, 2));
