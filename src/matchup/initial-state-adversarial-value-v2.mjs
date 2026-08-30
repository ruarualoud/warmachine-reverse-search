import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_INITIAL_STATE_ADVERSARIAL_VALUE_V2_SCHEMA =
  "warmachine_initial_state_adversarial_value_v2";

function absolute(value) {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(left, right) {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function rational(numerator = 0n, denominator = 1n) {
  let top = typeof numerator === "bigint" ? numerator : BigInt(numerator);
  let bottom = typeof denominator === "bigint" ? denominator : BigInt(denominator);
  if (bottom === 0n) throw new Error("initial_value_probability_denominator_zero");
  if (bottom < 0n) {
    top = -top;
    bottom = -bottom;
  }
  const divisor = greatestCommonDivisor(top, bottom);
  return { numerator: top / divisor, denominator: bottom / divisor };
}

function add(left, right) {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiply(left, right) {
  return rational(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function compare(left, right) {
  const delta = left.numerator * right.denominator -
    right.numerator * left.denominator;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

function decimalString(value, places = 12) {
  const sign = value.numerator < 0n ? "-" : "";
  const top = absolute(value.numerator);
  const whole = top / value.denominator;
  let remainder = top % value.denominator;
  if (remainder === 0n) return `${sign}${whole}`;
  let decimals = "";
  for (let index = 0; index < places && remainder !== 0n; index += 1) {
    remainder *= 10n;
    decimals += String(remainder / value.denominator);
    remainder %= value.denominator;
  }
  return `${sign}${whole}.${decimals}`;
}

function probabilityRecord(value) {
  const normalized = rational(value.numerator, value.denominator);
  return {
    numerator: String(normalized.numerator),
    denominator: String(normalized.denominator),
    decimal: decimalString(normalized),
  };
}

function intervalRecord(lower, upper, exactEligible = true) {
  const exact = exactEligible && compare(lower, upper) === 0;
  return {
    lower: probabilityRecord(lower),
    upper: probabilityRecord(upper),
    lowerBound: Number(lower.numerator) / Number(lower.denominator),
    upperBound: Number(upper.numerator) / Number(upper.denominator),
    exact,
  };
}

const ZERO = rational(0n, 1n);
const ONE = rational(1n, 1n);

function minimum(values = [], fallback = ZERO) {
  return values.reduce((selected, value) =>
    compare(value, selected) < 0 ? value : selected, values[0] || fallback);
}

function maximum(values = [], fallback = ZERO) {
  return values.reduce((selected, value) =>
    compare(value, selected) > 0 ? value : selected, values[0] || fallback);
}

function nonnegativeBigInt(value, fieldName) {
  let parsed;
  try {
    parsed = BigInt(value ?? 0);
  } catch {
    throw new Error(`initial_value_probability_integer_invalid:${fieldName}`);
  }
  if (parsed < 0n) {
    throw new Error(`initial_value_probability_integer_negative:${fieldName}`);
  }
  return parsed;
}

function chanceMassLedger(raw = {}, fieldName = "chanceLedger") {
  const denominator = nonnegativeBigInt(raw.denominator, `${fieldName}.denominator`);
  if (denominator === 0n) {
    throw new Error(`initial_value_probability_denominator_zero:${fieldName}`);
  }
  const success = nonnegativeBigInt(raw.successNumerator,
    `${fieldName}.successNumerator`);
  const failure = nonnegativeBigInt(raw.failureNumerator,
    `${fieldName}.failureNumerator`);
  const pruned = nonnegativeBigInt(raw.prunedNumerator,
    `${fieldName}.prunedNumerator`);
  const unresolved = nonnegativeBigInt(raw.unresolvedNumerator,
    `${fieldName}.unresolvedNumerator`);
  const total = success + failure + pruned + unresolved;
  const massConserved = total === denominator;
  const lower = massConserved ? rational(success, denominator) : ZERO;
  const upper = massConserved
    ? rational(success + pruned + unresolved, denominator)
    : ONE;
  const core = stableGraphValue({
    success: probabilityRecord(rational(success, denominator)),
    failure: probabilityRecord(rational(failure, denominator)),
    prunedLowProbability: probabilityRecord(rational(pruned, denominator)),
    unresolved: probabilityRecord(rational(unresolved, denominator)),
    total: probabilityRecord(rational(total, denominator)),
    massConserved,
    probabilityClosureComplete: massConserved && pruned === 0n && unresolved === 0n,
    interval: intervalRecord(lower, upper),
  });
  return { core, lower, upper };
}

function responseEvaluation(raw = {}, context = {}) {
  const responseKey = String(raw.responseKey || "");
  if (!responseKey) throw new Error("initial_value_opponent_response_key_required");
  const chance = chanceMassLedger(
    raw.chanceLedger || {},
    `response.${responseKey}.chanceLedger`,
  );
  const strictReplayComplete = raw.strictReplayComplete === true;
  const assumptionClosureComplete = raw.assumptionClosureComplete === true;
  const hostReceiptMatches = Boolean(
    context.hostReceiptHash &&
    String(raw.hostReceiptHash || "") === context.hostReceiptHash,
  );
  const strictEvidenceUsable = strictReplayComplete &&
    assumptionClosureComplete && hostReceiptMatches;
  const lower = strictEvidenceUsable ? chance.lower : ZERO;
  const upper = strictEvidenceUsable ? chance.upper : ONE;
  const core = stableGraphValue({
    responseKey,
    chanceLedger: chance.core,
    strictReplayComplete,
    assumptionClosureComplete,
    hostReceiptMatches,
    strictEvidenceUsable,
    evidenceInterval: chance.core.interval,
    strictValueInterval: intervalRecord(lower, upper),
    evidence: stableGraphValue(raw.evidence || {}),
  });
  return { core: { ...core, responseHash: stableGraphHash(core) }, lower, upper };
}

function candidateEvaluation(raw = {}, context = {}) {
  const candidateKey = String(raw.candidateKey || "");
  if (!candidateKey) throw new Error("initial_value_policy_candidate_key_required");
  const responses = (raw.opponentResponses || []).map((response) =>
    responseEvaluation(response, context)).sort((left, right) =>
    left.core.responseKey.localeCompare(right.core.responseKey));
  const responseSetComplete = raw.responseSetComplete === true && responses.length > 0;
  const lower = responseSetComplete
    ? minimum(responses.map((response) => response.lower), ZERO)
    : ZERO;
  const upper = responses.length
    ? minimum(responses.map((response) => response.upper), ONE)
    : ONE;
  const closure = stableGraphValue({
    responseSetComplete,
    chanceMassConserved: responses.length > 0 && responses.every((response) =>
      response.core.chanceLedger.massConserved),
    probabilityClosureComplete: responses.length > 0 && responses.every((response) =>
      response.core.chanceLedger.probabilityClosureComplete),
    strictReplayComplete: responses.length > 0 && responses.every((response) =>
      response.core.strictReplayComplete && response.core.hostReceiptMatches),
    assumptionClosureComplete: responses.length > 0 && responses.every((response) =>
      response.core.assumptionClosureComplete),
  });
  const core = stableGraphValue({
    candidateKey,
    opponentQuantifier: "opponent_and_min",
    opponentResponseCount: responses.length,
    responses: responses.map((response) => response.core),
    closure,
    strictValueInterval: intervalRecord(lower, upper,
      Object.values(closure).every(Boolean)),
  });
  return { core: { ...core, candidateHash: stableGraphHash(core) }, lower, upper };
}

function openingEvidence(raw = {}, hostReceiptHash = "") {
  const evidence = raw.strictOpeningEvidence || {};
  const stateHash = String(evidence.stateHash || raw.strictOpeningStateHash || "");
  const evidenceHash = String(evidence.evidenceHash ||
    raw.strictDeploymentReceiptHash || "");
  const evidenceHostReceiptHash = String(evidence.hostReceiptHash || "");
  return stableGraphValue({
    certified: evidence.certified === true && Boolean(stateHash) &&
      Boolean(evidenceHash) && evidenceHostReceiptHash === hostReceiptHash,
    stateHash,
    evidenceHash,
    hostReceiptHash: evidenceHostReceiptHash,
    currentHostReceiptMatches: Boolean(hostReceiptHash) &&
      evidenceHostReceiptHash === hostReceiptHash,
  });
}

function evaluateComputation(raw = {}, hostReceiptHash = "") {
  const candidateSetComplete = raw.candidateSetComplete === true;
  const candidates = (raw.policyCandidates || []).map((candidate) =>
    candidateEvaluation(candidate, { hostReceiptHash })).sort((left, right) =>
    left.core.candidateKey.localeCompare(right.core.candidateKey));
  const conditionalLower = maximum(candidates.map((candidate) => candidate.lower), ZERO);
  const conditionalUpper = candidateSetComplete && candidates.length
    ? maximum(candidates.map((candidate) => candidate.upper), ONE)
    : ONE;
  const opening = openingEvidence(raw, hostReceiptHash);
  const closure = stableGraphValue({
    strictOpeningComplete: opening.certified,
    candidateSetComplete: candidateSetComplete && candidates.length > 0,
    chanceMassConserved: candidates.length > 0 && candidates.every((candidate) =>
      candidate.core.closure.chanceMassConserved),
    probabilityClosureComplete: candidates.length > 0 && candidates.every((candidate) =>
      candidate.core.closure.probabilityClosureComplete),
    opponentResponseClosureComplete: candidates.length > 0 && candidates.every((candidate) =>
      candidate.core.closure.responseSetComplete),
    strictReplayComplete: candidates.length > 0 && candidates.every((candidate) =>
      candidate.core.closure.strictReplayComplete),
    assumptionClosureComplete: candidates.length > 0 && candidates.every((candidate) =>
      candidate.core.closure.assumptionClosureComplete),
  });
  const allRequiredClosureComplete = Object.values(closure).every(Boolean);
  const lower = opening.certified ? conditionalLower : ZERO;
  const upper = opening.certified ? conditionalUpper : ONE;
  const missingClosureKeys = Object.entries(closure)
    .filter(([, value]) => !value).map(([key]) => key);
  const core = stableGraphValue({
    strictOpeningEvidence: opening,
    subjectQuantifier: "subject_or_max",
    policyCandidateCount: candidates.length,
    policyCandidates: candidates.map((candidate) => candidate.core),
    closure: { ...closure, allRequiredClosureComplete },
    missingClosureKeys,
    conditionalPolicyInterval: intervalRecord(conditionalLower, conditionalUpper,
      candidateSetComplete),
    strictGameValueInterval: intervalRecord(lower, upper,
      allRequiredClosureComplete),
    valueStatus: allRequiredClosureComplete && compare(lower, upper) === 0
      ? "strict_exact"
      : "strict_bounded",
  });
  return { core, lower, upper };
}

function distributionAggregation(raw = null, rows = [], internalsByKey = new Map()) {
  if (!raw) return stableGraphValue({
    allowed: false,
    reason: "initial_state_distribution_not_declared",
    declaredDistributionValueInterval: null,
    naturalWinRate: null,
    naturalWinRateClaimed: false,
  });
  const weights = raw.weights || [];
  const weightByKey = new Map();
  let total = ZERO;
  for (const row of weights) {
    const key = String(row.initialStateKey || "");
    if (!key || weightByKey.has(key)) {
      throw new Error(`initial_value_distribution_weight_key_invalid:${key}`);
    }
    const weight = rational(
      nonnegativeBigInt(row.numerator, `${key}.weightNumerator`),
      nonnegativeBigInt(row.denominator, `${key}.weightDenominator`),
    );
    if (compare(weight, ONE) > 0) {
      throw new Error(`initial_value_distribution_weight_above_one:${key}`);
    }
    weightByKey.set(key, weight);
    total = add(total, weight);
  }
  const rowKeys = rows.map((row) => row.initialStateKey).sort();
  const weightKeys = [...weightByKey.keys()].sort();
  if (stableGraphHash(rowKeys) !== stableGraphHash(weightKeys)) {
    throw new Error("initial_value_distribution_cell_coverage_mismatch");
  }
  if (compare(total, ONE) !== 0) {
    throw new Error("initial_value_distribution_mass_not_one");
  }
  let lower = ZERO;
  let upper = ZERO;
  for (const row of rows) {
    const internal = internalsByKey.get(row.initialStateKey);
    const weight = weightByKey.get(row.initialStateKey);
    lower = add(lower, multiply(weight, internal.lower));
    upper = add(upper, multiply(weight, internal.upper));
  }
  const exact = compare(lower, upper) === 0 && rows.every((row) =>
    row.strictGameValueInterval.exact);
  const externallyProvenNaturalDistributionCandidate =
    raw.provenNaturalDistribution === true &&
    Boolean(String(raw.sourceEvidenceHash || "")) &&
    Boolean(String(raw.verificationReceiptHash || ""));
  return stableGraphValue({
    allowed: true,
    distributionKey: String(raw.distributionKey || "declared-initial-state-distribution"),
    sourceKind: String(raw.sourceKind || "user_declared"),
    sourceEvidenceHash: String(raw.sourceEvidenceHash || ""),
    verificationReceiptHash: String(raw.verificationReceiptHash || ""),
    weightMass: probabilityRecord(total),
    declaredDistributionValueInterval: intervalRecord(lower, upper, exact),
    externallyProvenNaturalDistributionCandidate,
    naturalWinRate: null,
    naturalWinRateClaimed: false,
    claimBoundary: "This is a value under the declared distribution, not a natural win-rate claim. A separate verifier must validate any natural-distribution receipt before another layer may promote that claim.",
  });
}

export function evaluateWarmachineInitialStateAdversarialValuesV2(raw = {}) {
  const hostReceiptHash = String(raw.hostReceiptHash || "");
  if (!hostReceiptHash) throw new Error("initial_value_host_receipt_hash_required");
  const inputs = raw.initialStates || [];
  if (!inputs.length) throw new Error("initial_value_initial_states_required");
  const initialStateKeys = inputs.map((row) => String(row.initialStateKey || ""));
  if (initialStateKeys.some((key) => !key) ||
      new Set(initialStateKeys).size !== initialStateKeys.length) {
    throw new Error("initial_value_initial_state_key_invalid");
  }
  const cache = new Map();
  const internalsByKey = new Map();
  const prepared = inputs.map((input) => {
    const opening = openingEvidence(input, hostReceiptHash);
    const computationIdentity = stableGraphValue({
      hostReceiptHash,
      strictOpeningStateHash: opening.stateHash || input.initialStateKey,
      strictOpeningEvidence: opening,
      candidateSetComplete: input.candidateSetComplete === true,
      policyCandidates: input.policyCandidates || [],
    });
    const evaluationKey = `initial-evaluation-${stableGraphHash(
      computationIdentity,
      32,
    )}`;
    if (!cache.has(evaluationKey)) {
      cache.set(evaluationKey, evaluateComputation(input, hostReceiptHash));
    }
    const evaluated = cache.get(evaluationKey);
    internalsByKey.set(input.initialStateKey, {
      lower: evaluated.lower,
      upper: evaluated.upper,
    });
    return { input, evaluationKey, evaluated };
  });
  const sharedCountByKey = new Map();
  for (const row of prepared) {
    sharedCountByKey.set(row.evaluationKey,
      (sharedCountByKey.get(row.evaluationKey) || 0) + 1);
  }
  const rows = prepared.map(({ input, evaluationKey, evaluated }) => {
    const core = stableGraphValue({
      schemaVersion: WARMACHINE_INITIAL_STATE_ADVERSARIAL_VALUE_V2_SCHEMA,
      initialStateKey: input.initialStateKey,
      evaluationKey,
      sharedEvaluationAddressCount: sharedCountByKey.get(evaluationKey),
      address: stableGraphValue(input.address || {}),
      routeLabels: (input.routeLabels || []).map((row) => stableGraphValue(row))
        .sort((left, right) => String(left.routeKey || "")
          .localeCompare(String(right.routeKey || ""))),
      ...evaluated.core,
    });
    return { ...core, valueHash: stableGraphHash(core) };
  }).sort((left, right) => left.initialStateKey.localeCompare(right.initialStateKey));
  const aggregation = distributionAggregation(
    raw.declaredInitialStateDistribution || null,
    rows,
    internalsByKey,
  );
  const core = stableGraphValue({
    schemaVersion: "warmachine_initial_state_adversarial_value_set_v2",
    hostReceiptHash,
    subjectTaskSideKey: String(raw.subjectTaskSideKey || "challenger"),
    initialStateCount: rows.length,
    uniqueRulesComputationCount: cache.size,
    sharedRulesComputationCount: rows.length - cache.size,
    exactInitialStateCount: rows.filter((row) =>
      row.strictGameValueInterval.exact).length,
    boundedInitialStateCount: rows.filter((row) =>
      !row.strictGameValueInterval.exact).length,
    rows,
    aggregation,
    naturalWinRateClaimed: aggregation.naturalWinRateClaimed === true,
    globalOptimalityProven: false,
    claimBoundary: "Initial-state values use exact Chance disposition ledgers, opponent AND/min and subject OR/max. Missing candidate, response, probability, assumption, strict-replay or opening closure remains in the interval. Equivalent strict states may share one computation while every roster, map, deployment, route, cost and terminal-source label remains separate. Candidate frequency and construction score never become probability.",
  });
  return { ...core, valueSetHash: stableGraphHash(core), ok: true };
}
