import assert from "node:assert/strict";

import { buildWarmachineScoreTerminalHypothesisCellFromMaterializedRootV1 } from
  "../src/reverse/steamroller-score-terminal-materialization-batch-v1.mjs";
import { buildWarmachineSteamrollerScenarioTerrainSelectionEvidenceV1 } from
  "../src/reverse/steamroller-scenario-terrain-selection-evidence-v1.mjs";
import { enumerateRulesV1Actions } from "../src/warmachine-host-runtime.mjs";
import {
  generateWarmachineTerminalEventPredecessorsV1,
  warmachineReverseStateSemanticHashV1,
} from "../src/reverse/terminal-event-predecessor-v1.mjs";

const result = buildWarmachineSteamrollerScenarioTerrainSelectionEvidenceV1();
const { evidence, runtimeRoot } = result;
assert.equal(evidence.strictMaterializedRootCount, 1);
assert.equal(evidence.strictRejectedRootCount, 0);
assert.equal(evidence.roots[0].strictReplayCertified, true);
assert.equal(evidence.roots[0].setupClassKey,
  "at_least_one_nonfirst_candidate_selected");
assert.equal(evidence.setupAudit.ok, true);
assert.equal(evidence.setupAudit.entryCount, 4);
assert.equal(evidence.setupAudit.entries.every((entry) =>
  entry.candidateKeys.length === 2 &&
  entry.terrainKey === entry.candidateKeys[1]), true);
assert.equal(evidence.edgeDistanceProbe.ok, true);
assert.ok(evidence.edgeDistanceProbe.entries[0].selectedCenterDistanceIn > 5);
assert.ok(evidence.edgeDistanceProbe.entries[0].selectedDistanceIn <= 5);

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

const tamperedCandidateState = structuredClone(runtimeRoot.predecessorState);
const tamperedTerrain = tamperedCandidateState.terrain.find((terrain) =>
  terrain.isScenarioTerrain);
tamperedTerrain.scenarioTerrainSelectionCandidateKeys = [tamperedTerrain.terrainKey];
const tamperedCandidateEnumeration = enumerateRulesV1Actions(
  tamperedCandidateState,
  { actionFamilyKeys: ["timing"] },
);
assert.equal(tamperedCandidateEnumeration.actions.some((action) =>
  action.actionType === "end_turn"), false);
assert.ok(tamperedCandidateEnumeration.rejectedActions.some((action) =>
  action.actionType === "end_turn" &&
  action.rejection?.evidence?.issues?.some((issue) =>
    issue.reason === "steamroller_2026_scenario_terrain_candidate_set_mismatch")));

const invalidFallbackState = structuredClone(runtimeRoot.predecessorState);
const invalidFallbackTerrain = invalidFallbackState.terrain.find((terrain) =>
  terrain.isScenarioTerrain);
invalidFallbackTerrain.scenarioTerrainFallbackUsed = true;
const invalidFallbackEnumeration = enumerateRulesV1Actions(
  invalidFallbackState,
  { actionFamilyKeys: ["timing"] },
);
assert.equal(invalidFallbackEnumeration.actions.some((action) =>
  action.actionType === "end_turn"), false);
assert.ok(invalidFallbackEnumeration.rejectedActions.some((action) =>
  action.actionType === "end_turn" &&
  action.rejection?.evidence?.issues?.some((issue) => [
    "steamroller_2026_scenario_terrain_candidate_set_mismatch",
    "steamroller_2026_scenario_terrain_fallback_has_valid_candidate",
  ].includes(issue.reason))));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_steamroller_scenario_terrain_selection_evidence_v1",
  evidenceHash: evidence.evidenceHash,
  hostReceiptHash: evidence.hostReceiptHash,
  setupClassKey: evidence.setupAudit.setupClassKey,
  flagCount: evidence.setupAudit.entryCount,
  candidateCountByFlag: evidence.roots[0].candidateCountByFlag,
  edgeDistanceProbe: {
    centerDistanceIn: evidence.edgeDistanceProbe.entries[0].selectedCenterDistanceIn,
    closestGeometryDistanceIn: evidence.edgeDistanceProbe.entries[0].selectedDistanceIn,
  },
  strictCandidateCount: reverse.strictCandidateCount,
  strictReplayCertified: evidence.roots[0].strictReplayCertified,
  tamperedCandidateRejected: true,
  invalidFallbackRejected: true,
}, null, 2));
