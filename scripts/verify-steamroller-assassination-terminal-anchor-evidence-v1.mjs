import assert from "node:assert/strict";

import { buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-assassination-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-anchor-evidence-v1.mjs";

const scoreAnchors = buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1();
const result = buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
  corpus: scoreAnchors.corpus,
});
const movementAssisted = buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
  corpus: scoreAnchors.corpus,
  rosterWitness: result.proposal.runtimeWitness,
  actionRange: "outside_direct_action_range_requires_prior_movement",
});
const actionBoundary = buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
  corpus: scoreAnchors.corpus,
  rosterWitness: result.proposal.runtimeWitness,
  actionRange: "on_boundary",
});
const controlBoundary = buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
  corpus: scoreAnchors.corpus,
  rosterWitness: result.proposal.runtimeWitness,
  leaderControl: "on_boundary",
});
const outsideControl = buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
  corpus: scoreAnchors.corpus,
  rosterWitness: result.proposal.runtimeWitness,
  leaderControl: "outside_or_not_required",
});
const evidence = result.evidence;
const root = evidence.roots[0];

assert.equal(evidence.strictMaterializedRootCount, 1);
assert.equal(evidence.strictRejectedRootCount, 0);
assert.equal(evidence.executionRosterWitness.complete, true);
assert.equal(evidence.executionRosterWitness.sides.every((side) =>
  side.rosterPoints === 100), true);
assert.ok(evidence.executionRosterWitness.modelCount > 2);
assert.equal(root.disposition, "strict_materialized");
assert.equal(root.scenarioKey, "two_fronts");
assert.equal(root.terminalClassKey, "unique_leader_assassination");
assert.equal(root.partitionCoordinates.damage, "leader_at_terminal_threshold");
assert.equal(root.partitionCoordinates.resource, "zero_available");
assert.equal(root.partitionCoordinates.actionRange, "strictly_inside");
assert.equal(root.partitionCoordinates.lineOfSight, "clear");
assert.equal(root.partitionCoordinates.baseTopology, "legal_separated");
assert.equal(root.strictReplayCertified, true);
assert.ok(root.receiptHash);
assert.ok(root.replayReceiptHash);
assert.ok(root.actionKey);
assert.match(root.actionType, /attack/);
assert.match(root.terminalSettlementActionType, /lifecycle/);
assert.ok(root.actionSequenceHash);
assert.ok(root.actionSequence.length > 0);
assert.equal(root.historicalReachabilityProven, false);
assert.equal(root.trainingTruth, false);
assert.equal(root.geometry.actionRangeBand, "strictly_inside");
assert.equal(root.geometry.leaderControlBand, "strictly_inside");
const movementRoot = movementAssisted.evidence.roots[0];
assert.equal(movementRoot.partitionCoordinates.actionRange,
  "outside_direct_action_range_requires_prior_movement");
assert.equal(movementRoot.actionType, "advance_then_melee_attack");
assert.ok(movementRoot.geometry.actorTargetEdgeDistanceIn > 1);
assert.equal(movementRoot.geometry.actionRangeBand, "outside");
assert.equal(movementRoot.strictReplayCertified, true);
const actionBoundaryRoot = actionBoundary.evidence.roots[0];
assert.equal(actionBoundaryRoot.partitionCoordinates.actionRange, "on_boundary");
assert.equal(actionBoundaryRoot.actionType, "melee_attack");
assert.equal(actionBoundaryRoot.geometry.actionRangeBand, "on_boundary");
assert.equal(actionBoundaryRoot.geometry.actorTargetEdgeDistanceIn,
  actionBoundaryRoot.geometry.actorMeleeRangeIn);
const controlBoundaryRoot = controlBoundary.evidence.roots[0];
assert.equal(controlBoundaryRoot.partitionCoordinates.leaderControl, "on_boundary");
assert.equal(controlBoundaryRoot.geometry.leaderControlBand, "on_boundary");
assert.equal(controlBoundaryRoot.geometry.actorControllerEdgeDistanceIn,
  controlBoundaryRoot.geometry.controllerControlRangeIn);
assert.equal(controlBoundaryRoot.actionType, "melee_attack");
const outsideControlRoot = outsideControl.evidence.roots[0];
assert.equal(outsideControlRoot.partitionCoordinates.leaderControl,
  "outside_or_not_required");
assert.equal(outsideControlRoot.geometry.leaderControlBand, "outside");
assert.ok(outsideControlRoot.geometry.actorControllerEdgeDistanceIn >
  outsideControlRoot.geometry.controllerControlRangeIn);
assert.equal(outsideControlRoot.actionType, "melee_attack");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_steamroller_assassination_terminal_anchor_evidence_v1",
  corpusHash: evidence.corpusHash,
  evidenceHash: evidence.evidenceHash,
  executionRosterWitnessHash: evidence.executionRosterWitness.witnessHash,
  modelCount: evidence.executionRosterWitness.modelCount,
  rosterSides: evidence.executionRosterWitness.sides,
  root: {
    cellKey: root.cellKey,
    subcellKey: root.subcellKey,
    receiptHash: root.receiptHash,
    replayReceiptHash: root.replayReceiptHash,
    actionKey: root.actionKey,
    actionType: root.actionType,
    terminalSettlementActionKey: root.terminalSettlementActionKey,
    terminalSettlementActionType: root.terminalSettlementActionType,
    actionSequence: root.actionSequence,
    geometry: root.geometry,
    partitionCoordinates: root.partitionCoordinates,
  },
  movementAssistedRoot: {
    cellKey: movementRoot.cellKey,
    subcellKey: movementRoot.subcellKey,
    receiptHash: movementRoot.receiptHash,
    replayReceiptHash: movementRoot.replayReceiptHash,
    actionKey: movementRoot.actionKey,
    actionType: movementRoot.actionType,
    actionSequence: movementRoot.actionSequence,
    geometry: movementRoot.geometry,
    partitionCoordinates: movementRoot.partitionCoordinates,
  },
  relationRoots: [actionBoundaryRoot, controlBoundaryRoot, outsideControlRoot].map((row) => ({
    subcellKey: row.subcellKey,
    actionType: row.actionType,
    geometry: row.geometry,
    partitionCoordinates: row.partitionCoordinates,
  })),
  claimBoundary: evidence.claimBoundary,
}, null, 2));
