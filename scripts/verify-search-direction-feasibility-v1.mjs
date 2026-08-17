#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  buildWarmachineSearchDirectionMeasurementV1,
  buildWarmachineSearchDirectionPolicyV1,
  evaluateWarmachineSearchDirectionGateV1,
} from "../src/search/direction-feasibility-v1.mjs";

const denominator = {
  queryKey: "score-connector-comparison",
  terminalFamily: "scenario_score",
  horizonLayer: "one_local_connector_gap",
  hostReceiptHash: "host-receipt-fixed",
  searchContextKey: "same-state-same-goal-same-horizon",
  proposalUniverseHash: "same-action-proposal-universe",
  canonicalStateSchema: "warmachine_rules_v1_state",
};

function scoreConnectorSamples(annotations = {}) {
  return {
    forward: {
      methodKey: "unguided_strict_forward",
      batchKey: "unguided-forward",
      sourceReceiptHash: "forward-receipt",
      expandedNodeCount: 11,
      generatedCandidateCount: 26,
      consistentCandidateCount: 26,
      uniqueCandidateCount: 15,
      unresolvedCandidateCount: 0,
      strictConnectionWitnessCount: 1,
      strictTransitionCallCount: 26,
      elapsedMs: 3_358,
      peakBytes: 2_600_000,
      annotations: annotations.forward || {},
    },
    reverse: {
      methodKey: "symbolic_reverse_milestone_plus_strict_forward_connector",
      batchKey: "reverse-guided-connector",
      sourceReceiptHash: "reverse-receipt",
      expandedNodeCount: 2,
      generatedCandidateCount: 12,
      consistentCandidateCount: 4,
      uniqueCandidateCount: 4,
      unresolvedCandidateCount: 8,
      strictConnectionWitnessCount: 1,
      strictTransitionCallCount: 4,
      elapsedMs: 537,
      peakBytes: 400_000,
      annotations: annotations.reverse || {},
    },
  };
}

const measurement = buildWarmachineSearchDirectionMeasurementV1({
  ...denominator,
  samplesByDirection: scoreConnectorSamples({
    forward: { strategyScore: 10_000 },
    reverse: { strategyScore: -10_000 },
  }),
});
const inverted = buildWarmachineSearchDirectionMeasurementV1({
  ...denominator,
  samplesByDirection: scoreConnectorSamples({
    forward: { strategyScore: -10_000 },
    reverse: { strategyScore: 10_000 },
  }),
});
assert.equal(measurement.contractOk, true);
assert.equal(measurement.measurementHash, inverted.measurementHash);
assert.equal(measurement.tacticalAnnotationsConsumed, false);

const policy = buildWarmachineSearchDirectionPolicyV1({
  policyKey: "fixed-score-connector-calibration-v1",
  configuredBy: "fixed_same_denominator_benchmark",
  calibrationReceiptHashes: ["score-connector-benchmark-receipt"],
  minimumExpandedNodesPerDirection: 2,
  minimumGeneratedCandidatesPerDirection: 4,
  maximumUnresolvedRate: 0.95,
  minimumRelativeCostAdvantage: 1.25,
  maximumJoinFalsePositiveRate: 0.4,
  nextBatchExpansionCount: 16,
  memoryBudgetBytes: 64_000_000,
});
assert.equal(policy.calibrationReady, true);
assert.equal(policy.thresholdRole, "calibration_prior_not_theory");

const decision = evaluateWarmachineSearchDirectionGateV1(measurement, policy);
assert.equal(decision.decision, "expand_reverse");
assert.ok(decision.reasons.includes("reverse_lower_observed_strict_transition_cost"));
assert.equal(decision.candidateSelectionChanged, false);
assert.equal(decision.reachabilityDispositionChanged, false);
assert.equal(decision.tacticalEvaluationApplied, false);

const missingCalibration = evaluateWarmachineSearchDirectionGateV1(measurement, {});
assert.equal(missingCalibration.decision, "collect_more_measurements");
assert.ok(missingCalibration.reasons.includes("calibrated_direction_policy_missing"));

const reverseUnknown = buildWarmachineSearchDirectionMeasurementV1({
  ...denominator,
  queryKey: "reverse-unknown-risk",
  samplesByDirection: {
    forward: {
      expandedNodeCount: 8,
      generatedCandidateCount: 8,
      consistentCandidateCount: 8,
      uniqueCandidateCount: 4,
      unresolvedCandidateCount: 1,
      strictConnectionWitnessCount: 0,
      elapsedMs: 800,
      peakBytes: 800_000,
    },
    reverse: {
      expandedNodeCount: 8,
      generatedCandidateCount: 10,
      consistentCandidateCount: 10,
      uniqueCandidateCount: 5,
      unresolvedCandidateCount: 9,
      strictConnectionWitnessCount: 1,
      elapsedMs: 400,
      peakBytes: 500_000,
    },
  },
});
const uncertaintyPolicy = buildWarmachineSearchDirectionPolicyV1({
  policyKey: "uncertainty-gate-calibration-v1",
  configuredBy: "fixed_same_denominator_benchmark",
  calibrationReceiptHashes: ["uncertainty-benchmark-receipt"],
  minimumExpandedNodesPerDirection: 4,
  minimumGeneratedCandidatesPerDirection: 4,
  maximumUnresolvedRate: 0.5,
  minimumRelativeCostAdvantage: 1.25,
  maximumJoinFalsePositiveRate: 0.4,
  nextBatchExpansionCount: 16,
  memoryBudgetBytes: 64_000_000,
});
const unknownDecision = evaluateWarmachineSearchDirectionGateV1(
  reverseUnknown,
  uncertaintyPolicy,
);
assert.equal(unknownDecision.decision, "expand_forward_connector");
assert.ok(unknownDecision.reasons.includes(
  "only_forward_within_declared_resource_and_uncertainty_limits",
));

const balanced = buildWarmachineSearchDirectionMeasurementV1({
  ...denominator,
  queryKey: "balanced-bidirectional-join",
  samplesByDirection: Object.fromEntries(["forward", "reverse"].map((direction) => [
    direction,
    {
      expandedNodeCount: 8,
      generatedCandidateCount: 8,
      consistentCandidateCount: 8,
      uniqueCandidateCount: 4,
      unresolvedCandidateCount: 1,
      strictConnectionWitnessCount: 1,
      elapsedMs: 800,
      peakBytes: 800_000,
      joinCheckCount: 10,
      coarseJoinMatchCount: 4,
      strictJoinMatchCount: 3,
    },
  ])),
});
const balancedDecision = evaluateWarmachineSearchDirectionGateV1(balanced, policy);
assert.equal(balancedDecision.decision, "expand_bidirectional");

console.log(JSON.stringify({
  ok: true,
  marker: "same_denominator_direction_gate_without_strategy_evaluation_v20260811",
  measurementHash: measurement.measurementHash,
  annotationInversionPreservedMeasurementHash:
    measurement.measurementHash === inverted.measurementHash,
  calibratedPolicyHash: policy.policyHash,
  scoreConnectorDecision: decision,
  missingCalibrationDecision: missingCalibration.decision,
  unresolvedRiskDecision: unknownDecision.decision,
  balancedJoinDecision: balancedDecision.decision,
}, null, 2));
