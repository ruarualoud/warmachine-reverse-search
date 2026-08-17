#!/usr/bin/env node

import assert from "node:assert/strict";

import { buildWarmachineTerminalDemandEvidenceCorpusV1 } from
  "../src/matchup/terminal-demand-evidence-corpus-v1.mjs";

const result = buildWarmachineTerminalDemandEvidenceCorpusV1({
  rosterReceiptHash: "verify-terminal-demand-evidence-corpus-v1",
});
const scorePins = result.evidencePins.filter((pin) =>
  pin.schemaVersion.includes("score_terminal"));
const assassinationPins = result.evidencePins.filter((pin) =>
  pin.schemaVersion.includes("assassination_terminal"));

assert.equal(result.evidenceCorpus.evidencePinCount, 12);
assert.equal(result.evidenceCorpus.excludedIncompleteEvidenceRootCount, 0);
assert.equal(result.evidenceCorpus.strictReplayCertifiedEvidencePinCount, 12);
assert.equal(scorePins.length, 7);
assert.equal(assassinationPins.length, 5);
assert.equal(result.evidencePins.every((pin) =>
  pin.rulesEngineCapabilityOnly === true && pin.matchupRosterRouteProven === false), true);
assert.equal(result.demandGroups.constructionMacroProfileCount, 13);
assert.equal(result.demandGroups.groups.filter((group) =>
  group.scenarioKeys.includes("two_fronts") &&
  group.exactRoundNumbers.includes(2) &&
  group.signature.goalFamily === "assassination").length, 5);

console.log(JSON.stringify({
  ok: true,
  evidenceCorpusHash: result.evidenceCorpus.evidenceCorpusHash,
  corpusHash: result.evidenceCorpus.corpusHash,
  representativeSelectionHash: result.evidenceCorpus.representativeSelectionHash,
  demandGroupSetHash: result.evidenceCorpus.demandGroupSetHash,
  selectedRepresentativeCount: result.evidenceCorpus.selectedRepresentativeCount,
  demandGroupCount: result.demandGroups.groupCount,
  constructionMacroProfileCount: result.demandGroups.constructionMacroProfileCount,
  scorePinCount: scorePins.length,
  assassinationPinCount: assassinationPins.length,
}, null, 2));
