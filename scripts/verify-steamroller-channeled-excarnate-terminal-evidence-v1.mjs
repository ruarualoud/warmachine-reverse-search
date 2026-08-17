import assert from "node:assert/strict";

import { buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerChanneledExcarnateTerminalEvidenceV1 } from
  "../src/reverse/steamroller-channeled-excarnate-terminal-evidence-v1.mjs";
import {
  generateWarmachineTerminalEventPredecessorsV1,
  warmachineReverseStateSemanticHashV1,
} from "../src/reverse/terminal-event-predecessor-v1.mjs";

function differingPaths(left, right, path = "state", output = []) {
  if (output.length >= 32 || Object.is(left, right)) return output;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    output.push({ path, left, right });
    return output;
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) {
    differingPaths(left[key], right[key], `${path}.${key}`, output);
    if (output.length >= 32) break;
  }
  return output;
}

const anchors = buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1();
const result = buildWarmachineSteamrollerChanneledExcarnateTerminalEvidenceV1({
  corpus: anchors.corpus,
  resourcePartitionValues: [
    "exact_terminal_payment",
    "controller_transfer_or_channel_available",
  ],
});
const root = result.evidence.roots.find((candidate) =>
  candidate.partitionCoordinates.resource === "exact_terminal_payment");

assert.equal(result.evidence.strictMaterializedRootCount, 2);
assert.equal(result.evidence.strictRejectedRootCount, 0);
assert.equal(root.disposition, "strict_materialized");
assert.equal(root.executionRosterModelCount, 103);
assert.equal(root.actionType, "boosted_hit_damage_channeled_offensive_spell");
assert.equal(root.spellName, "Excarnate");
assert.equal(root.channelerPieceKey, "player1_raptor_22_1");
assert.deepEqual(root.resourceEvidence, {
  after: 0,
  before: 5,
  controllerChannelRelationshipAvailable: true,
  controllerChannelRelationshipUsed: true,
  exactTerminalPayment: true,
  kind: "focus",
  partitionValue: "exact_terminal_payment",
  spent: 5,
});
assert.ok(root.geometry.actorChannelerEdgeDistanceIn < root.geometry.actorControlRangeIn);
assert.ok(root.geometry.channelerTargetEdgeDistanceIn < root.geometry.spellRangeIn);
assert.equal(root.lifecycleEvidence.targetBoxesBefore, 11);
assert.equal(root.lifecycleEvidence.targetRemovedFromPlay, true);
assert.equal(root.lifecycleEvidence.destroyedEventSuppressed, true);
assert.equal(root.lifecycleEvidence.returnGruntDeclined, true);
assert.equal(root.lifecycleEvidence.resourceCollectionPrevented, true);
assert.equal(root.lifecycleEvidence.battlegroupWildPieceKeys.length, 6);
assert.equal(root.deploymentCoordinatesRead, false);
assert.equal(root.strictReplayCertified, true);
assert.equal(root.historicalReachabilityProven, false);
assert.equal(root.reachabilityProven, false);
assert.equal(root.trainingTruth, false);
assert.equal(result.runtime.placementAudit.ok, true);
assert.equal(result.runtime.formationAudit.ok, true);

const resourcePartitionCoverage = result;
assert.equal(resourcePartitionCoverage.evidence.strictMaterializedRootCount, 2);
assert.equal(new Set(resourcePartitionCoverage.evidence.roots.map((candidate) =>
  candidate.subcellKey)).size, 2);
assert.deepEqual(resourcePartitionCoverage.evidence.roots.map((candidate) =>
  candidate.partitionCoordinates.resource).sort(), [
  "controller_transfer_or_channel_available",
  "exact_terminal_payment",
]);
assert.equal(resourcePartitionCoverage.evidence.roots.every((candidate) =>
  candidate.resourceEvidence.controllerChannelRelationshipAvailable === true &&
  candidate.resourceEvidence.controllerChannelRelationshipUsed === true), true);

const reverseCommon = {
  resourceRefunds: [5],
  terminalActionTypes: ["boosted_hit_damage_channeled_offensive_spell"],
  terminalActionKeys: [root.actionKey],
  maximumTerminalActions: 1,
  terminalActionPatch: {
    strictRuleAtomReturnGruntOutcome: {
      atomKey: "excarnate_box_living_enemy_warrior_rfp_add_grunt",
      decline: true,
    },
  },
  terminalStrictRollOutcomes: [{
    attackDice: [6, 6, 6],
    damageDice: [6, 6, 6],
  }],
};
const unboundReverse = generateWarmachineTerminalEventPredecessorsV1(
  result.runtime.terminalState,
  result.runtime.reverseCell,
  reverseCommon,
);
assert.equal(unboundReverse.strictCandidateCount, 0);
assert.deepEqual(new Set(unboundReverse.unresolved.map((row) => row.reason)), new Set([
  "terminal_controller_destruction_resource_preimage_deferred",
  "terminal_controller_destruction_preexisting_status_preimage_deferred",
  "terminal_controller_destruction_upkeep_preimage_deferred",
]));

const boundReverse = generateWarmachineTerminalEventPredecessorsV1(
  result.runtime.terminalState,
  result.runtime.reverseCell,
  {
    ...reverseCommon,
    controllerDestructionResourcePointsByPieceKey:
      result.runtime.controllerDestructionResourcePointsByPieceKey,
    controllerDestructionStatusPreimageByPieceKey:
      result.runtime.controllerDestructionStatusPreimageByPieceKey,
    controllerDestructionUpkeepPreimageByControllerPieceKey:
      result.runtime.controllerDestructionUpkeepPreimageByControllerPieceKey,
  },
);
assert.equal(boundReverse.strictCandidateCount, 1, JSON.stringify({
  rejected: boundReverse.rejected,
  unresolved: boundReverse.unresolved,
}));
assert.equal(boundReverse.strictRejectedCount, 0);
assert.equal(boundReverse.candidates[0].predecessorStateHash,
  warmachineReverseStateSemanticHashV1(result.runtime.preTerminalState),
  JSON.stringify(differingPaths(
    boundReverse.candidates[0].predecessorState,
    result.runtime.preTerminalState,
  )));
assert.equal(boundReverse.candidates[0].strictWitness, true);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_steamroller_channeled_excarnate_terminal_evidence_v1",
  evidenceHash: result.evidence.evidenceHash,
  hostReceiptHash: result.evidence.hostReceiptHash,
  unboundUnresolvedReasons: [...new Set(unboundReverse.unresolved.map((row) =>
    row.reason))].sort(),
  strictPredecessorCount: boundReverse.strictCandidateCount,
  root,
}, null, 2));
