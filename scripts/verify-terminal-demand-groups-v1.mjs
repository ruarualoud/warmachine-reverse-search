#!/usr/bin/env node

import assert from "node:assert/strict";

import { buildWarmachineTerminalDemandGroupsV1 } from
  "../src/matchup/terminal-demand-groups-v1.mjs";
import { buildWarmachineSteamrollerTerminalScenarioCorpusV1 } from
  "../src/reverse/steamroller-terminal-scenario-corpus-v1.mjs";
import { selectWarmachineSteamrollerTerminalRepresentativesV1 } from
  "../src/reverse/steamroller-terminal-representative-selector-v1.mjs";

const corpus = buildWarmachineSteamrollerTerminalScenarioCorpusV1({
  rosterReceiptHash: "verify-terminal-demand-groups-v1",
});
const representativeSelection = selectWarmachineSteamrollerTerminalRepresentativesV1({
  corpus,
  maximumSkeletonCells: 96,
  maximumRepresentativeSubcells: 50000,
});
const groups = buildWarmachineTerminalDemandGroupsV1({ corpus, representativeSelection });
const repeated = buildWarmachineTerminalDemandGroupsV1({ corpus, representativeSelection });

assert.equal(groups.demandGroupSetHash, repeated.demandGroupSetHash);
assert.equal(groups.missingCellKeys.length, 0);
assert.equal(groups.selectedRepresentativeCount,
  representativeSelection.selectedRepresentatives.length);
assert.equal(groups.groupCount, groups.groups.length);
assert.equal(groups.batchCount, groups.batches.length);
assert.equal(groups.constructionMacroProfileCount, groups.constructionMacroProfiles.length);
assert.equal(groups.constructionMacroProfileCount, 13);

const selectedKeys = representativeSelection.selectedRepresentatives.map((row) => row.subcellKey);
const groupedKeys = groups.groups.flatMap((group) => group.representativeKeys);
assert.equal(new Set(groupedKeys).size, selectedKeys.length);
assert.deepEqual([...groupedKeys].sort(), [...selectedKeys].sort());
assert.equal(groups.groups.reduce((sum, group) => sum + group.representativeCount, 0),
  selectedKeys.length);
assert.equal(groups.constructionMacroProfiles.reduce((sum, profile) =>
  sum + profile.representativeCount, 0), selectedKeys.length);

const groupsByKey = new Map(groups.groups.map((group) => [group.groupKey, group]));
for (const profile of groups.constructionMacroProfiles) {
  assert.ok(profile.groupKeys.length > 0);
  assert.equal(profile.naturalProbabilityMass, null);
  assert.ok(Math.abs(Object.values(profile.weights).reduce((sum, weight) =>
    sum + Number(weight), 0) - 1) < 1e-9);
  assert.equal(profile.groupKeys.every((groupKey) =>
    groupsByKey.get(groupKey)?.constructionMacroProfileKey === profile.goalProfileKey), true);
}
for (const group of groups.groups) {
  assert.equal(group.naturalProbabilityMass, null);
  assert.equal(group.evaluationStandard.some((row) =>
    row.metricKey === "strict_reachability_interval"), true);
  assert.equal(group.evaluationStandard.some((row) =>
    row.metricKey === "retained_branch_probability"), true);
}

assert.ok(groups.groups.some((group) =>
  group.signature.goalFamily === "assassination" &&
  group.requirements.capabilityRequirementKeys.includes("threat_extension")));
assert.ok(groups.groups.some((group) =>
  group.requirements.capabilityRequirementKeys.includes("stealth_answer")));
assert.ok(groups.groups.some((group) =>
  group.requirements.capabilityRequirementKeys.includes("screen_clear_or_ignore_models")));
assert.ok(groups.groups.some((group) =>
  group.signature.goalFamily === "scenario_score_threshold" &&
  group.requirements.capabilityRequirementKeys.includes("position_control")));
assert.ok(groups.groups.some((group) =>
  group.requirements.capabilityRequirementKeys.includes("attrition_history_support")));

console.log(JSON.stringify({
  ok: true,
  corpusHash: corpus.corpusHash,
  representativeSelectionHash: representativeSelection.selectionHash,
  selectedRepresentativeCount: selectedKeys.length,
  demandGroupCount: groups.groupCount,
  processingBatchCount: groups.batchCount,
  constructionMacroProfileCount: groups.constructionMacroProfileCount,
  demandGroupSetHash: groups.demandGroupSetHash,
}, null, 2));
