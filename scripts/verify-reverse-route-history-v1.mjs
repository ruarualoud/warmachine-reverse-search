import assert from "node:assert/strict";

import { buildWarmachineReverseRouteHistoryEvidenceV1 } from
  "../src/reverse/terminal-rooted-to-deployment-v1.mjs";

const sharedState = {
  scenario: {
    score: { player1: 2, player2: 1 },
  },
};
const firstHistory = buildWarmachineReverseRouteHistoryEvidenceV1([
  {
    candidateKey: "first-attack",
    operatorKey: "attack_inverse",
    resourceEnvelopeMode: "focus_attack_baseline",
    controlResidueMode: "empty_previous_control",
    matchedProbability: { numerator: "7", denominator: "12" },
    adversarialContextKey: "defender-transfer-declined",
    mutation: { scoreBeforeTurnEnd: { player1: 1, player2: 1 } },
    provenance: {
      terminalCellKey: "assassination-cell-a",
      upstreamReceiptHash: "receipt-a",
    },
  },
  {
    candidateKey: "second-attack",
    operatorKey: "attack_inverse",
    matchedProbability: { numerator: "3", denominator: "5" },
    provenance: {
      terminalCellKey: "assassination-cell-a",
      upstreamReceiptHash: "receipt-b",
    },
  },
], sharedState);
const secondHistory = buildWarmachineReverseRouteHistoryEvidenceV1([
  {
    candidateKey: "alternate-attack",
    operatorKey: "attack_inverse",
    resourceEnvelopeMode: "fury_attack_baseline",
    matchedProbabilityInterval: {
      lower: { numerator: "0", denominator: "1" },
      upper: { numerator: "1", denominator: "1" },
    },
    adversarialContextKey: "defender-transfer-used",
    provenance: {
      terminalCellKey: "assassination-cell-b",
      upstreamReceiptHash: "receipt-c",
    },
  },
], sharedState);

assert.deepEqual(firstHistory.cumulativeProbability, {
  numerator: "21",
  denominator: "60",
  decimal: 0.35,
});
assert.equal(firstHistory.cumulativeProbabilityExact, true);
assert.deepEqual(firstHistory.resourceEnvelopeModes, ["focus_attack_baseline"]);
assert.deepEqual(firstHistory.controlResidueModes, ["empty_previous_control"]);
assert.deepEqual(firstHistory.scoreHistory, [
  { player1: 1, player2: 1 },
  { player1: 2, player2: 1 },
]);
assert.deepEqual(firstHistory.adversarialContextKeys, [
  "defender-transfer-declined",
]);
assert.equal(firstHistory.provenanceLabels.length, 2);
assert.equal(secondHistory.cumulativeProbability, null);
assert.equal(secondHistory.cumulativeProbabilityExact, false);
assert.equal(secondHistory.unresolvedProbabilityIntervals.length, 1);
assert.notDeepEqual(firstHistory, secondHistory);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_reverse_route_history_v1",
  exactCumulativeProbability: firstHistory.cumulativeProbability,
  alternateHistoryProbabilityExact: secondHistory.cumulativeProbabilityExact,
  preservedScoreHistoryCount: firstHistory.scoreHistory.length,
  preservedProvenanceLabelCount: firstHistory.provenanceLabels.length,
}, null, 2));
