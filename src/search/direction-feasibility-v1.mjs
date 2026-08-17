import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_SEARCH_DIRECTION_MEASUREMENT_V1_SCHEMA =
  "warmachine_search_direction_measurement_v1";
export const WARMACHINE_SEARCH_DIRECTION_POLICY_V1_SCHEMA =
  "warmachine_search_direction_policy_v1";
export const WARMACHINE_SEARCH_DIRECTION_DECISION_V1_SCHEMA =
  "warmachine_search_direction_decision_v1";

const DIRECTIONS = Object.freeze(["forward", "reverse"]);

function finiteNonnegative(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function finitePositiveOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function safeRatio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function normalizeDirectionSample(direction, raw = {}) {
  const counts = {
    expandedNodeCount: finiteNonnegative(raw.expandedNodeCount),
    generatedCandidateCount: finiteNonnegative(raw.generatedCandidateCount),
    consistentCandidateCount: finiteNonnegative(raw.consistentCandidateCount),
    uniqueCandidateCount: finiteNonnegative(raw.uniqueCandidateCount),
    unresolvedCandidateCount: finiteNonnegative(
      raw.unresolvedCandidateCount ?? raw.unknownDeferredCandidateCount,
    ),
    strictConnectionWitnessCount: finiteNonnegative(raw.strictConnectionWitnessCount),
    strictTransitionCallCount: finiteNonnegative(raw.strictTransitionCallCount),
    joinCheckCount: finiteNonnegative(raw.joinCheckCount),
    coarseJoinMatchCount: finiteNonnegative(raw.coarseJoinMatchCount),
    strictJoinMatchCount: finiteNonnegative(raw.strictJoinMatchCount),
    constraintVariableCountBefore: finiteNonnegative(raw.constraintVariableCountBefore),
    constraintVariableCountAfter: finiteNonnegative(raw.constraintVariableCountAfter),
  };
  const elapsedMs = finiteNonnegative(raw.elapsedMs);
  const peakBytes = finiteNonnegative(raw.peakBytes);
  const issues = [];
  if (counts.consistentCandidateCount > counts.generatedCandidateCount) {
    issues.push("consistent_candidates_exceed_generated_candidates");
  }
  if (counts.uniqueCandidateCount > counts.consistentCandidateCount) {
    issues.push("unique_candidates_exceed_consistent_candidates");
  }
  if (counts.unresolvedCandidateCount > counts.generatedCandidateCount) {
    issues.push("unresolved_candidates_exceed_generated_candidates");
  }
  if (counts.coarseJoinMatchCount > counts.joinCheckCount) {
    issues.push("coarse_join_matches_exceed_join_checks");
  }
  if (counts.strictJoinMatchCount > counts.coarseJoinMatchCount) {
    issues.push("strict_join_matches_exceed_coarse_join_matches");
  }
  const effectiveUniqueFanout = safeRatio(
    counts.uniqueCandidateCount,
    counts.expandedNodeCount,
  );
  const consistencyRate = safeRatio(
    counts.consistentCandidateCount,
    counts.generatedCandidateCount,
  );
  const mergeRate = counts.consistentCandidateCount > 0
    ? 1 - counts.uniqueCandidateCount / counts.consistentCandidateCount
    : null;
  const unresolvedRate = safeRatio(
    counts.unresolvedCandidateCount,
    counts.generatedCandidateCount,
  );
  const strictWitnessYieldPerSecond = elapsedMs > 0
    ? counts.strictConnectionWitnessCount / (elapsedMs / 1_000)
    : null;
  const strictWitnessCostMs = counts.strictConnectionWitnessCount > 0
    ? elapsedMs / counts.strictConnectionWitnessCount
    : null;
  const strictTransitionCallsPerWitness = counts.strictConnectionWitnessCount > 0
    ? counts.strictTransitionCallCount / counts.strictConnectionWitnessCount
    : null;
  const bytesPerUniqueCandidate = safeRatio(peakBytes, counts.uniqueCandidateCount);
  const strictJoinRate = safeRatio(counts.strictJoinMatchCount, counts.joinCheckCount);
  const joinFalsePositiveRate = counts.coarseJoinMatchCount > 0
    ? 1 - counts.strictJoinMatchCount / counts.coarseJoinMatchCount
    : null;
  const constraintContractionRate = counts.constraintVariableCountBefore > 0
    ? (counts.constraintVariableCountBefore - counts.constraintVariableCountAfter) /
      counts.constraintVariableCountBefore
    : null;
  const core = {
    schemaVersion: "warmachine_search_direction_sample_v1",
    direction,
    methodKey: String(raw.methodKey || direction),
    batchKey: String(raw.batchKey || ""),
    sourceReceiptHash: String(raw.sourceReceiptHash || ""),
    counts,
    elapsedMs,
    peakBytes,
    metrics: {
      effectiveUniqueFanout,
      consistencyRate,
      mergeRate,
      unresolvedRate,
      strictWitnessYieldPerSecond,
      strictWitnessCostMs,
      strictTransitionCallsPerWitness,
      bytesPerUniqueCandidate,
      strictJoinRate,
      joinFalsePositiveRate,
      constraintContractionRate,
    },
    issues: issues.sort(),
    strategyFieldsConsumed: false,
  };
  return { ...core, sampleHash: stableGraphHash(core) };
}

export function buildWarmachineSearchDirectionMeasurementV1(raw = {}) {
  const samplesByDirection = raw.samplesByDirection || {};
  const samples = DIRECTIONS.map((direction) =>
    normalizeDirectionSample(direction, samplesByDirection[direction] || {}));
  const denominator = {
    queryKey: String(raw.queryKey || ""),
    terminalFamily: String(raw.terminalFamily || ""),
    horizonLayer: String(raw.horizonLayer || ""),
    hostReceiptHash: String(raw.hostReceiptHash || ""),
    searchContextKey: String(raw.searchContextKey || ""),
    proposalUniverseHash: String(raw.proposalUniverseHash || ""),
    canonicalStateSchema: String(raw.canonicalStateSchema || ""),
  };
  const missingDenominatorFields = Object.entries(denominator)
    .filter(([, value]) => !value)
    .map(([key]) => key)
    .sort();
  const sampleIssues = samples.flatMap((sample) =>
    sample.issues.map((issue) => `${sample.direction}:${issue}`));
  const core = {
    schemaVersion: WARMACHINE_SEARCH_DIRECTION_MEASUREMENT_V1_SCHEMA,
    denominator,
    samples,
    contractOk: missingDenominatorFields.length === 0 && sampleIssues.length === 0,
    missingDenominatorFields,
    sampleIssues,
    sameDenominatorComparison: true,
    tacticalAnnotationsConsumed: false,
    strategyEvaluationApplied: false,
    reachabilityDispositionChanged: false,
    claimBoundary: "This receipt compares computation directions under one declared denominator. It schedules expansion only; it does not rank tactics, reject reachable candidates, or prove an unexpanded route impossible.",
  };
  return { ...core, measurementHash: stableGraphHash(core) };
}

export function buildWarmachineSearchDirectionPolicyV1(raw = {}) {
  const calibrationReceiptHashes = Array.from(new Set(
    (raw.calibrationReceiptHashes || []).map(String).filter(Boolean),
  )).sort();
  const thresholds = {
    minimumExpandedNodesPerDirection: finitePositiveOrNull(
      raw.minimumExpandedNodesPerDirection,
    ),
    minimumGeneratedCandidatesPerDirection: finitePositiveOrNull(
      raw.minimumGeneratedCandidatesPerDirection,
    ),
    maximumUnresolvedRate: finitePositiveOrNull(raw.maximumUnresolvedRate),
    minimumRelativeCostAdvantage: finitePositiveOrNull(raw.minimumRelativeCostAdvantage),
    maximumJoinFalsePositiveRate: finitePositiveOrNull(raw.maximumJoinFalsePositiveRate),
    nextBatchExpansionCount: finitePositiveOrNull(raw.nextBatchExpansionCount),
    memoryBudgetBytes: finitePositiveOrNull(raw.memoryBudgetBytes),
  };
  const missingThresholds = Object.entries(thresholds)
    .filter(([, value]) => value === null)
    .map(([key]) => key)
    .sort();
  const thresholdRangesOk = (thresholds.maximumUnresolvedRate === null ||
    thresholds.maximumUnresolvedRate <= 1) &&
    (thresholds.maximumJoinFalsePositiveRate === null ||
      thresholds.maximumJoinFalsePositiveRate <= 1) &&
    (thresholds.minimumRelativeCostAdvantage === null ||
      thresholds.minimumRelativeCostAdvantage >= 1);
  const core = {
    schemaVersion: WARMACHINE_SEARCH_DIRECTION_POLICY_V1_SCHEMA,
    policyKey: String(raw.policyKey || ""),
    configuredBy: String(raw.configuredBy || ""),
    thresholdRole: "calibration_prior_not_theory",
    calibrationReceiptHashes,
    thresholds,
    calibrationReady: Boolean(raw.policyKey) && Boolean(raw.configuredBy) &&
      calibrationReceiptHashes.length > 0 && missingThresholds.length === 0 && thresholdRangesOk,
    missingThresholds,
    thresholdRangesOk,
    strategyEvaluationAllowed: false,
    reachabilityMutationAllowed: false,
    budgetOmissionDisposition: "unresolved",
    claimBoundary: "These thresholds are benchmark-calibrated scheduling priors, not mathematical constants, rules truth, tactical utility, or reachability proof.",
  };
  return { ...core, policyHash: stableGraphHash(core) };
}

function projected(sample, nextBatchExpansionCount) {
  const metrics = sample.metrics;
  const elapsedPerExpansionMs = sample.counts.expandedNodeCount > 0
    ? sample.elapsedMs / sample.counts.expandedNodeCount
    : null;
  const projectedUniqueCandidateCount = metrics.effectiveUniqueFanout === null
    ? null
    : metrics.effectiveUniqueFanout * nextBatchExpansionCount;
  return {
    direction: sample.direction,
    projectedExpandedNodeCount: nextBatchExpansionCount,
    projectedUniqueCandidateCount,
    projectedElapsedMs: elapsedPerExpansionMs === null
      ? null
      : elapsedPerExpansionMs * nextBatchExpansionCount,
    projectedBytes: metrics.bytesPerUniqueCandidate === null ||
      projectedUniqueCandidateCount === null
      ? null
      : metrics.bytesPerUniqueCandidate * projectedUniqueCandidateCount,
    strictWitnessCostMs: metrics.strictWitnessCostMs,
    strictTransitionCallsPerWitness: metrics.strictTransitionCallsPerWitness,
    unresolvedRate: metrics.unresolvedRate,
    joinFalsePositiveRate: metrics.joinFalsePositiveRate,
  };
}

function relativeAdvantage(lower, higher) {
  return Number.isFinite(lower) && lower >= 0 && Number.isFinite(higher) && higher >= 0
    ? higher / Math.max(lower, Number.EPSILON)
    : null;
}

export function evaluateWarmachineSearchDirectionGateV1(
  measurementInput = {},
  policyInput = {},
) {
  const measurement = measurementInput.schemaVersion ===
    WARMACHINE_SEARCH_DIRECTION_MEASUREMENT_V1_SCHEMA
    ? measurementInput
    : buildWarmachineSearchDirectionMeasurementV1(measurementInput);
  const policy = policyInput.schemaVersion === WARMACHINE_SEARCH_DIRECTION_POLICY_V1_SCHEMA
    ? policyInput
    : buildWarmachineSearchDirectionPolicyV1(policyInput);
  const reasons = [];
  let decision = "collect_more_measurements";
  if (!measurement.contractOk) reasons.push("measurement_contract_failed");
  if (!policy.calibrationReady) reasons.push("calibrated_direction_policy_missing");
  const sampleByDirection = Object.fromEntries(
    measurement.samples.map((sample) => [sample.direction, sample]),
  );
  const minimumExpanded = policy.thresholds.minimumExpandedNodesPerDirection || Infinity;
  const minimumGenerated = policy.thresholds.minimumGeneratedCandidatesPerDirection || Infinity;
  const insufficientDirections = DIRECTIONS.filter((direction) => {
    const sample = sampleByDirection[direction];
    return sample.counts.expandedNodeCount < minimumExpanded ||
      sample.counts.generatedCandidateCount < minimumGenerated;
  });
  if (insufficientDirections.length > 0) {
    reasons.push(...insufficientDirections.map((direction) =>
      `${direction}_sample_below_declared_minimum`));
  }
  const projections = DIRECTIONS.map((direction) =>
    projected(sampleByDirection[direction], policy.thresholds.nextBatchExpansionCount || 0));
  const projectionByDirection = Object.fromEntries(
    projections.map((projection) => [projection.direction, projection]),
  );
  const ready = measurement.contractOk && policy.calibrationReady &&
    insufficientDirections.length === 0;
  if (ready) {
    const maximumUnresolvedRate = policy.thresholds.maximumUnresolvedRate;
    const memoryBudgetBytes = policy.thresholds.memoryBudgetBytes;
    const eligible = Object.fromEntries(DIRECTIONS.map((direction) => {
      const projection = projectionByDirection[direction];
      const unresolvedOk = projection.unresolvedRate !== null &&
        projection.unresolvedRate <= maximumUnresolvedRate;
      const memoryOk = projection.projectedBytes !== null &&
        projection.projectedBytes <= memoryBudgetBytes;
      return [direction, unresolvedOk && memoryOk];
    }));
    if (!eligible.forward && !eligible.reverse) {
      decision = "freeze_and_defer";
      reasons.push("both_directions_exceed_declared_uncertainty_or_memory_budget");
    } else if (eligible.reverse && !eligible.forward) {
      decision = "expand_reverse";
      reasons.push("only_reverse_within_declared_resource_and_uncertainty_limits");
    } else if (eligible.forward && !eligible.reverse) {
      decision = "expand_forward_connector";
      reasons.push("only_forward_within_declared_resource_and_uncertainty_limits");
    } else {
      const forward = projectionByDirection.forward;
      const reverse = projectionByDirection.reverse;
      const minimumAdvantage = policy.thresholds.minimumRelativeCostAdvantage;
      const forwardWitnesses = sampleByDirection.forward.counts.strictConnectionWitnessCount;
      const reverseWitnesses = sampleByDirection.reverse.counts.strictConnectionWitnessCount;
      if (forwardWitnesses > 0 && reverseWitnesses === 0) {
        decision = "expand_forward_connector";
        reasons.push("forward_only_direction_with_observed_strict_connection_witness");
      } else if (reverseWitnesses > 0 && forwardWitnesses === 0) {
        decision = "expand_reverse";
        reasons.push("reverse_only_direction_with_observed_strict_connection_witness");
      } else {
        const forwardTransitionAdvantage = relativeAdvantage(
          forward.strictTransitionCallsPerWitness,
          reverse.strictTransitionCallsPerWitness,
        );
        const reverseTransitionAdvantage = relativeAdvantage(
          reverse.strictTransitionCallsPerWitness,
          forward.strictTransitionCallsPerWitness,
        );
        const forwardWitnessAdvantage = relativeAdvantage(
          forward.strictWitnessCostMs,
          reverse.strictWitnessCostMs,
        );
        const reverseWitnessAdvantage = relativeAdvantage(
          reverse.strictWitnessCostMs,
          forward.strictWitnessCostMs,
        );
        const forwardTimeAdvantage = relativeAdvantage(
          forward.projectedElapsedMs,
          reverse.projectedElapsedMs,
        );
        const reverseTimeAdvantage = relativeAdvantage(
          reverse.projectedElapsedMs,
          forward.projectedElapsedMs,
        );
        const forwardFanoutAdvantage = relativeAdvantage(
          forward.projectedUniqueCandidateCount,
          reverse.projectedUniqueCandidateCount,
        );
        const reverseFanoutAdvantage = relativeAdvantage(
          reverse.projectedUniqueCandidateCount,
          forward.projectedUniqueCandidateCount,
        );
        if (forwardTransitionAdvantage !== null &&
          forwardTransitionAdvantage >= minimumAdvantage) {
          decision = "expand_forward_connector";
          reasons.push("forward_lower_observed_strict_transition_cost");
        } else if (reverseTransitionAdvantage !== null &&
          reverseTransitionAdvantage >= minimumAdvantage) {
          decision = "expand_reverse";
          reasons.push("reverse_lower_observed_strict_transition_cost");
        } else if (forwardWitnessAdvantage !== null && forwardWitnessAdvantage >= minimumAdvantage) {
          decision = "expand_forward_connector";
          reasons.push("forward_lower_observed_strict_witness_cost");
        } else if (reverseWitnessAdvantage !== null && reverseWitnessAdvantage >= minimumAdvantage) {
          decision = "expand_reverse";
          reasons.push("reverse_lower_observed_strict_witness_cost");
        } else if (forwardTimeAdvantage !== null && forwardTimeAdvantage >= minimumAdvantage) {
          decision = "expand_forward_connector";
          reasons.push("forward_lower_projected_elapsed_cost");
        } else if (reverseTimeAdvantage !== null && reverseTimeAdvantage >= minimumAdvantage) {
          decision = "expand_reverse";
          reasons.push("reverse_lower_projected_elapsed_cost");
        } else if (forwardFanoutAdvantage !== null && forwardFanoutAdvantage >= minimumAdvantage) {
          decision = "expand_forward_connector";
          reasons.push("forward_lower_projected_unique_fanout");
        } else if (reverseFanoutAdvantage !== null && reverseFanoutAdvantage >= minimumAdvantage) {
          decision = "expand_reverse";
          reasons.push("reverse_lower_projected_unique_fanout");
        } else {
          const observedJoinRates = DIRECTIONS.map((direction) =>
            projectionByDirection[direction].joinFalsePositiveRate)
            .filter(Number.isFinite);
          if (observedJoinRates.length > 0 && observedJoinRates.every((rate) =>
            rate <= policy.thresholds.maximumJoinFalsePositiveRate)) {
            decision = "expand_bidirectional";
            reasons.push("directions_near_cost_tie_and_join_precision_within_calibrated_limit");
          } else {
            decision = "alternate_measurement_batches";
            reasons.push("directions_near_cost_tie_without_sufficient_join_precision");
          }
        }
      }
    }
  }
  const core = {
    schemaVersion: WARMACHINE_SEARCH_DIRECTION_DECISION_V1_SCHEMA,
    measurementHash: measurement.measurementHash,
    policyHash: policy.policyHash,
    decision,
    reasons: Array.from(new Set(reasons)).sort(),
    projections: stableGraphValue(projections),
    calibratedSchedulingDecision: ready,
    candidateSelectionChanged: false,
    reachabilityDispositionChanged: false,
    tacticalEvaluationApplied: false,
    deferredWorkRemainsUnresolved: true,
    claimBoundary: "This decision allocates the next bounded expansion batch. It cannot reject a candidate, claim one direction is universally superior, or convert omitted work into unreachable mass.",
  };
  return { ...core, decisionHash: stableGraphHash(core) };
}
