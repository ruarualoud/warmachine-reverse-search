#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  evaluateWarmachineInitialStateAdversarialValuesV2,
} from "../src/matchup/initial-state-adversarial-value-v2.mjs";

const hostReceiptHash = "focused-host-receipt";

function response(responseKey, {
  success,
  failure,
  pruned = 0,
  unresolved = 0,
  denominator,
  strictReplayComplete = true,
  assumptionClosureComplete = true,
} = {}) {
  return {
    responseKey,
    chanceLedger: {
      successNumerator: success,
      failureNumerator: failure,
      prunedNumerator: pruned,
      unresolvedNumerator: unresolved,
      denominator,
    },
    strictReplayComplete,
    assumptionClosureComplete,
    hostReceiptHash,
    evidence: { strictReceiptHash: `receipt-${responseKey}` },
  };
}

function exactTwoThirdsCandidates() {
  return [
    {
      candidateKey: "policy-opponent-min-half",
      responseSetComplete: true,
      opponentResponses: [
        response("reply-three-quarters", {
          success: 3,
          failure: 1,
          denominator: 4,
        }),
        response("reply-one-half", {
          success: 1,
          failure: 1,
          denominator: 2,
        }),
      ],
    },
    {
      candidateKey: "policy-two-thirds",
      responseSetComplete: true,
      opponentResponses: [response("reply-two-thirds", {
        success: 2,
        failure: 1,
        denominator: 3,
      })],
    },
  ];
}

function initialState(initialStateKey, overrides = {}) {
  return {
    initialStateKey,
    strictOpeningEvidence: {
      certified: true,
      stateHash: overrides.stateHash || "same-strict-opening",
      evidenceHash: "strict-deployment-evidence",
      hostReceiptHash,
    },
    candidateSetComplete: true,
    policyCandidates: exactTwoThirdsCandidates(),
    address: overrides.address || {},
    routeLabels: overrides.routeLabels || [],
    ...overrides,
  };
}

const exactA = initialState("exact-a", {
  address: {
    challengerRosterKey: "fane-roster-a",
    scenarioKey: "two_fronts",
    mapKey: "map-a",
    deploymentSeedKey: "wide",
  },
  routeLabels: [{
    routeKey: "route-a",
    terminalFamilyKey: "assassination",
    reverseEdgeCount: 96,
  }],
});
const exactB = initialState("exact-b", {
  address: {
    challengerRosterKey: "fane-roster-b",
    scenarioKey: "two_fronts",
    mapKey: "map-b",
    deploymentSeedKey: "dense",
  },
  routeLabels: [{
    routeKey: "route-b",
    terminalFamilyKey: "score",
    reverseEdgeCount: 110,
  }],
});
const partialChance = initialState("partial-chance", {
  stateHash: "partial-chance-opening",
  policyCandidates: [{
    candidateKey: "partial-chance-policy",
    responseSetComplete: true,
    opponentResponses: [response("partial-chance-reply", {
      success: 3,
      failure: 1,
      unresolved: 1,
      denominator: 5,
    })],
  }],
});
const incompleteOpponent = initialState("incomplete-opponent", {
  stateHash: "incomplete-opponent-opening",
  policyCandidates: [{
    candidateKey: "incomplete-response-policy",
    responseSetComplete: false,
    opponentResponses: [response("known-four-fifths", {
      success: 4,
      failure: 1,
      denominator: 5,
    })],
  }],
});
const incompleteCandidateSet = initialState("incomplete-candidates", {
  stateHash: "incomplete-candidate-opening",
  candidateSetComplete: false,
  policyCandidates: [{
    candidateKey: "known-three-quarters",
    responseSetComplete: true,
    opponentResponses: [response("known-three-quarters-reply", {
      success: 3,
      failure: 1,
      denominator: 4,
    })],
  }],
});
const missingStrictReplay = initialState("missing-strict-replay", {
  stateHash: "missing-strict-replay-opening",
  policyCandidates: [{
    candidateKey: "untrusted-exact-policy",
    responseSetComplete: true,
    opponentResponses: [response("untrusted-exact-reply", {
      success: 1,
      failure: 0,
      denominator: 1,
      strictReplayComplete: false,
    })],
  }],
});
const invalidChanceMass = initialState("invalid-chance-mass", {
  stateHash: "invalid-chance-mass-opening",
  policyCandidates: [{
    candidateKey: "invalid-chance-mass-policy",
    responseSetComplete: true,
    opponentResponses: [response("invalid-chance-mass-reply", {
      success: 4,
      failure: 2,
      denominator: 5,
    })],
  }],
});

const focused = evaluateWarmachineInitialStateAdversarialValuesV2({
  hostReceiptHash,
  subjectTaskSideKey: "challenger",
  initialStates: [
    exactA,
    exactB,
    partialChance,
    incompleteOpponent,
    incompleteCandidateSet,
    missingStrictReplay,
    invalidChanceMass,
  ],
});

const byKey = new Map(focused.rows.map((row) => [row.initialStateKey, row]));
assert.equal(byKey.get("exact-a").strictGameValueInterval.lower.numerator, "2");
assert.equal(byKey.get("exact-a").strictGameValueInterval.lower.denominator, "3");
assert.equal(byKey.get("exact-a").strictGameValueInterval.exact, true);
assert.equal(byKey.get("exact-a").evaluationKey, byKey.get("exact-b").evaluationKey);
assert.equal(byKey.get("exact-a").sharedEvaluationAddressCount, 2);
assert.notDeepEqual(byKey.get("exact-a").address, byKey.get("exact-b").address);
assert.notDeepEqual(byKey.get("exact-a").routeLabels, byKey.get("exact-b").routeLabels);
assert.equal(focused.uniqueRulesComputationCount, 6);
assert.equal(focused.sharedRulesComputationCount, 1);

assert.equal(byKey.get("partial-chance").strictGameValueInterval.lower.numerator, "3");
assert.equal(byKey.get("partial-chance").strictGameValueInterval.lower.denominator, "5");
assert.equal(byKey.get("partial-chance").strictGameValueInterval.upper.numerator, "4");
assert.equal(byKey.get("partial-chance").strictGameValueInterval.upper.denominator, "5");
assert.equal(byKey.get("partial-chance").strictGameValueInterval.exact, false);
assert.equal(byKey.get("partial-chance").closure.probabilityClosureComplete, false);

assert.equal(byKey.get("incomplete-opponent").strictGameValueInterval.lower.numerator, "0");
assert.equal(byKey.get("incomplete-opponent").strictGameValueInterval.upper.numerator, "4");
assert.equal(byKey.get("incomplete-opponent").strictGameValueInterval.upper.denominator, "5");
assert.equal(byKey.get("incomplete-opponent").closure.opponentResponseClosureComplete,
  false);

assert.equal(byKey.get("incomplete-candidates").strictGameValueInterval.lower.numerator,
  "3");
assert.equal(byKey.get("incomplete-candidates").strictGameValueInterval.lower.denominator,
  "4");
assert.equal(byKey.get("incomplete-candidates").strictGameValueInterval.upper.numerator,
  "1");
assert.equal(byKey.get("incomplete-candidates").closure.candidateSetComplete, false);

assert.equal(byKey.get("missing-strict-replay").conditionalPolicyInterval.lower.numerator,
  "0");
assert.equal(byKey.get("missing-strict-replay").strictGameValueInterval.lower.numerator,
  "0");
assert.equal(byKey.get("missing-strict-replay").strictGameValueInterval.upper.numerator,
  "1");
assert.equal(byKey.get("missing-strict-replay").closure.strictReplayComplete, false);
assert.equal(byKey.get("invalid-chance-mass").strictGameValueInterval.lower.numerator,
  "0");
assert.equal(byKey.get("invalid-chance-mass").strictGameValueInterval.upper.numerator,
  "1");
assert.equal(byKey.get("invalid-chance-mass").closure.chanceMassConserved, false);
assert.equal(focused.aggregation.allowed, false);
assert.equal(focused.naturalWinRateClaimed, false);

const exactOneThird = initialState("exact-one-third", {
  stateHash: "exact-one-third-opening",
  policyCandidates: [{
    candidateKey: "one-third-policy",
    responseSetComplete: true,
    opponentResponses: [response("one-third-reply", {
      success: 1,
      failure: 2,
      denominator: 3,
    })],
  }],
});
const declaredDistribution =
  evaluateWarmachineInitialStateAdversarialValuesV2({
    hostReceiptHash,
    subjectTaskSideKey: "challenger",
    initialStates: [exactA, exactOneThird],
    declaredInitialStateDistribution: {
      distributionKey: "user-two-cell-distribution",
      sourceKind: "user_declared",
      weights: [
        { initialStateKey: "exact-a", numerator: 1, denominator: 4 },
        { initialStateKey: "exact-one-third", numerator: 3, denominator: 4 },
      ],
    },
  });
assert.equal(declaredDistribution.aggregation.allowed, true);
assert.equal(declaredDistribution.aggregation.declaredDistributionValueInterval
  .lower.numerator, "5");
assert.equal(declaredDistribution.aggregation.declaredDistributionValueInterval
  .lower.denominator, "12");
assert.equal(declaredDistribution.aggregation.declaredDistributionValueInterval.exact,
  true);
assert.equal(declaredDistribution.aggregation.naturalWinRate, null);
assert.equal(declaredDistribution.naturalWinRateClaimed, false);

const externallyProvenDistributionCandidate =
  evaluateWarmachineInitialStateAdversarialValuesV2({
    hostReceiptHash,
    initialStates: [exactA, exactOneThird],
    declaredInitialStateDistribution: {
      distributionKey: "proven-natural-two-cell-distribution",
      sourceKind: "proven_initial_state_distribution",
      provenNaturalDistribution: true,
      sourceEvidenceHash: "distribution-source-evidence",
      verificationReceiptHash: "external-distribution-verification-receipt",
      weights: [
        { initialStateKey: "exact-a", numerator: 1, denominator: 4 },
        { initialStateKey: "exact-one-third", numerator: 3, denominator: 4 },
      ],
    },
  });
assert.equal(externallyProvenDistributionCandidate.aggregation
  .externallyProvenNaturalDistributionCandidate, true);
assert.equal(externallyProvenDistributionCandidate.aggregation.naturalWinRate, null);
assert.equal(externallyProvenDistributionCandidate.naturalWinRateClaimed, false);

assert.throws(() => evaluateWarmachineInitialStateAdversarialValuesV2({
  hostReceiptHash,
  initialStates: [exactA, exactOneThird],
  declaredInitialStateDistribution: {
    weights: [
      { initialStateKey: "exact-a", numerator: 1, denominator: 2 },
      { initialStateKey: "exact-one-third", numerator: 1, denominator: 3 },
    ],
  },
}), /initial_value_distribution_mass_not_one/);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: focused.schemaVersion,
  initialStateCount: focused.initialStateCount,
  uniqueRulesComputationCount: focused.uniqueRulesComputationCount,
  sharedRulesComputationCount: focused.sharedRulesComputationCount,
  exactInitialStateCount: focused.exactInitialStateCount,
  boundedInitialStateCount: focused.boundedInitialStateCount,
  declaredDistributionValue:
    declaredDistribution.aggregation.declaredDistributionValueInterval,
  externalNaturalDistributionPromotionPending:
    externallyProvenDistributionCandidate.aggregation
      .externallyProvenNaturalDistributionCandidate,
  valueSetHash: focused.valueSetHash,
}, null, 2));
