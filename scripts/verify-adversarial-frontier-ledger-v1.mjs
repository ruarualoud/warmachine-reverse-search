#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  deriveWarmachineAdversarialContextKeyV1,
  mergeWarmachineAdversarialProbabilityFrontierV1,
} from "../src/search/adversarial-frontier-ledger-v1.mjs";

const rootContext = "adversarial-context-root";
assert.equal(deriveWarmachineAdversarialContextKeyV1(rootContext, {
  quantifier: "deterministic_singleton",
}), rootContext);
const declineContext = deriveWarmachineAdversarialContextKeyV1(rootContext, {
  quantifier: "opponent_and_min",
  ownerSideKey: "defender",
  decisionKind: "damage_transfer",
  responseNodeKey: "response-node-one",
  responseKey: "decline",
});
const transferContext = deriveWarmachineAdversarialContextKeyV1(rootContext, {
  quantifier: "opponent_and_min",
  ownerSideKey: "defender",
  decisionKind: "damage_transfer",
  responseNodeKey: "response-node-one",
  responseKey: "transfer:beast",
});
assert.notEqual(declineContext, transferContext);

function entry(incomingEdgeKey, numerator, adversarialContextKey = rootContext, overrides = {}) {
  return {
    depth: 2,
    stateHash: "same-state",
    cursor: "attack-two",
    adversarialContextKey,
    contribution: { numerator, denominator: 1000 },
    incomingEdgeKey,
    evidence: { receiptHash: `receipt-${incomingEdgeKey}` },
    ...overrides,
  };
}

const merged = mergeWarmachineAdversarialProbabilityFrontierV1([
  entry("edge-a", 6),
  entry("edge-b", 6),
  entry("edge-equal-threshold", 10, rootContext, {
    stateHash: "threshold-state",
  }),
], { lowProbabilityThreshold: "0.01" });
assert.equal(merged.ok, true);
assert.equal(merged.massConserved, true);
assert.equal(merged.inputEntryCount, 3);
assert.equal(merged.mergedFrontierCount, 2);
assert.equal(merged.mergedEntryCount, 1);
const combined = merged.frontier.find((row) => row.stateHash === "same-state");
assert.deepEqual(combined.cumulativeProbability, { numerator: "3", denominator: "250" });
assert.equal(combined.status, "expand");
assert.equal(combined.incomingContributionCount, 2);
assert.deepEqual(combined.incoming.map((row) => row.incomingEdgeKey), ["edge-a", "edge-b"]);
assert.equal(merged.frontier.find((row) =>
  row.stateHash === "threshold-state")?.status, "expand");

const separated = mergeWarmachineAdversarialProbabilityFrontierV1([
  entry("edge-decline", 6, declineContext),
  entry("edge-transfer", 6, transferContext),
], { lowProbabilityThreshold: "0.01" });
assert.equal(separated.mergedFrontierCount, 2);
assert.equal(separated.mergedEntryCount, 0);
assert.equal(separated.prunedFrontierCount, 2);
assert.ok(separated.frontier.every((row) => row.status === "pruned_low_probability"));
assert.equal(separated.contextAudits.length, 2);

const differentDepth = mergeWarmachineAdversarialProbabilityFrontierV1([
  entry("edge-depth-two", 6),
  entry("edge-depth-three", 6, rootContext, { depth: 3 }),
], { lowProbabilityThreshold: "0.01" });
assert.equal(differentDepth.mergedFrontierCount, 2);
assert.equal(differentDepth.prunedFrontierCount, 2);

const differentContinuation = mergeWarmachineAdversarialProbabilityFrontierV1([
  entry("edge-continue", 6),
  entry("edge-terminal", 6, rootContext, { continuationKey: "terminal:success" }),
], { lowProbabilityThreshold: "0.01" });
assert.equal(differentContinuation.mergedFrontierCount, 2);
assert.equal(differentContinuation.prunedFrontierCount, 2);

const knownTerminal = mergeWarmachineAdversarialProbabilityFrontierV1([
  entry("edge-known-terminal", 1, rootContext, {
    continuationKey: "terminal:success",
    thresholdEligible: false,
  }),
], { lowProbabilityThreshold: "0.01" });
assert.equal(knownTerminal.prunedFrontierCount, 0);
assert.equal(knownTerminal.bypassedThresholdFrontierCount, 1);
assert.equal(knownTerminal.frontier[0].status, "bypass_threshold");

assert.throws(() => mergeWarmachineAdversarialProbabilityFrontierV1([
  entry("missing-context", 1, ""),
]), /context_key_required/);
assert.throws(() => deriveWarmachineAdversarialContextKeyV1(rootContext, {
  quantifier: "opponent_and_min",
}), /response_identity_required/);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: merged.schemaVersion,
  ledgerHash: merged.ledgerHash,
  sameContextMergedMass: combined.cumulativeProbability,
  sameContextStatus: combined.status,
  separatedContextStatuses: separated.frontier.map((row) => row.status),
  preservedIncomingEdges: combined.incoming.map((row) => row.incomingEdgeKey),
}, null, 2));
