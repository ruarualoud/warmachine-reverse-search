import assert from "node:assert/strict";

import { buildWarmachineSteamrollerScenarioControlRelationEvidenceV1 } from
  "../src/reverse/steamroller-scenario-control-relation-evidence-v1.mjs";
import { buildWarmachineScoreTerminalHypothesisCellFromMaterializedRootV1 } from
  "../src/reverse/steamroller-score-terminal-materialization-batch-v1.mjs";
import {
  generateWarmachineTerminalEventPredecessorsV1,
  warmachineReverseStateSemanticHashV1,
} from "../src/reverse/terminal-event-predecessor-v1.mjs";

const { evidence, runtimeRoots } =
  buildWarmachineSteamrollerScenarioControlRelationEvidenceV1();
assert.equal(evidence.strictMaterializedRootCount, 2);
assert.equal(evidence.strictRejectedRootCount, 0);
assert.deepEqual(evidence.roots.map((root) =>
  root.partitionCoordinates.scenarioControl).sort(), [
  "contested",
  "controller_ineligible",
]);
assert.equal(evidence.roots.every((root) =>
  root.strictReplayCertified &&
  root.scoreBefore.player1 === 2 &&
  root.scoreAfter.player1 === 3 &&
  root.winnerSourceCounts.scenario_terrain_opponent === 1), true);

const contested = evidence.roots.find((root) =>
  root.partitionCoordinates.scenarioControl === "contested");
assert.deepEqual(contested.scenarioControlWitnessRow.contestingSides,
  ["player1", "player2"]);
assert.deepEqual(contested.scenarioControlWitnessRow.securingSides, []);
assert.equal(contested.scenarioControlWitnessRow.controllingSideKey || "", "");

const ineligible = evidence.roots.find((root) =>
  root.partitionCoordinates.scenarioControl === "controller_ineligible");
assert.deepEqual(ineligible.scenarioControlWitnessRow.contestingSides, []);
assert.deepEqual(ineligible.scenarioControlWitnessRow.securingSides, []);
const [excluded] = ineligible.scenarioControlWitnessRow.ineligibleModelsInRange;
assert.equal(excluded.pieceKey, "pressure_point:player2-building-solo");
assert.equal(excluded.reason, "standard_building_excluded");
assert.equal(excluded.buildingExclusion.marker,
  "strict_standard_building_scenario_presence_v20260627");

const reverseCounts = [];
for (const runtimeRoot of runtimeRoots) {
  const hypothesis =
    buildWarmachineScoreTerminalHypothesisCellFromMaterializedRootV1(runtimeRoot);
  const reverse = generateWarmachineTerminalEventPredecessorsV1(
    runtimeRoot.terminalState,
    hypothesis,
  );
  assert.equal(reverse.strictCandidateCount, 1);
  assert.equal(reverse.strictRejectedCount, 0);
  assert.equal(reverse.unresolvedCount, 0);
  assert.equal(
    reverse.candidates[0].predecessorStateHash,
    warmachineReverseStateSemanticHashV1(runtimeRoot.predecessorState),
  );
  reverseCounts.push(reverse.strictCandidateCount);
}

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_steamroller_scenario_control_relation_evidence_v1",
  evidenceHash: evidence.evidenceHash,
  hostReceiptHash: evidence.hostReceiptHash,
  scenarioControlClasses: evidence.roots.map((root) =>
    root.partitionCoordinates.scenarioControl).sort(),
  strictMaterializedRootCount: evidence.strictMaterializedRootCount,
  strictPredecessorCounts: reverseCounts,
  contestedSides: contested.scenarioControlWitnessRow.contestingSides,
  ineligibleReason: excluded.reason,
  ineligibleMarker: excluded.buildingExclusion.marker,
}, null, 2));
