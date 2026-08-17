import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_REVERSE_REACHABILITY_POLICY_V2_SCHEMA =
  "warmachine_reverse_reachability_policy_v2";
export const WARMACHINE_REVERSE_REACHABILITY_CANDIDATE_SET_V2_SCHEMA =
  "warmachine_reverse_reachability_candidate_set_v2";

const FORBIDDEN_REVERSE_DISPOSITIONS = new Set([
  "strategically_bad",
  "tactically_dominated",
  "bad_exchange",
  "low_material_value",
  "low_scenario_pressure",
  "low_utility",
]);

function finiteNonnegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function candidateStructuralIdentity(candidate = {}) {
  return {
    candidateKind: String(candidate.candidateKind || ""),
    successorKind: String(candidate.successorKind || ""),
    predecessorKind: String(candidate.predecessorKind || ""),
    predecessorStateKey: String(candidate.predecessorStateKey || ""),
    successorStateKey: String(candidate.successorStateKey || ""),
    transitionActionKey: String(candidate.transitionActionKey || candidate.actionKey || ""),
    operatorKey: String(candidate.operatorKey || ""),
    obligationKey: String(candidate.obligationKey || ""),
    terminalBranchKey: String(candidate.terminalBranchKey || ""),
    actorPieceKey: String(candidate.actorPieceKey || ""),
    targetPieceKey: String(candidate.targetPieceKey || ""),
    targetElementKey: String(candidate.targetElementKey || ""),
    structuralIdentity: stableGraphValue(
      candidate.structuralIdentity || candidate.reachabilityIdentity ||
      candidate.predecessorObligations || candidate.constraints || {},
    ),
  };
}

function candidateKey(candidate = {}) {
  const explicit = String(
    candidate.candidateKey || candidate.alternativeKey || candidate.routeKey || "",
  );
  return explicit || `reverse-candidate-${stableGraphHash(candidateStructuralIdentity(candidate), 24)}`;
}

function normalizeCandidate(candidate = {}) {
  const key = candidateKey(candidate);
  const requestedDisposition = String(candidate.disposition || "");
  const strictWitness = candidate.strictWitness === true;
  const strictRejected = candidate.strictRejected === true;
  const unresolvedReasons = Array.from(new Set(
    (candidate.unresolvedReasons || []).map(String).filter(Boolean),
  )).sort();
  const disposition = strictWitness
    ? "strict_reachable_witness"
    : strictRejected
      ? "strict_rejected"
      : "unresolved_reachability";
  return {
    candidateKey: key,
    successorKind: String(candidate.successorKind || candidate.predecessorKind || "unspecified"),
    requestedDisposition,
    disposition,
    strictWitness,
    strictRejected,
    unresolvedReasons,
    strictReceiptHash: String(candidate.strictReceiptHash || candidate.receiptHash || ""),
    predecessorStateKey: String(candidate.predecessorStateKey || ""),
    successorStateKey: String(candidate.successorStateKey || ""),
    transitionActionKey: String(candidate.transitionActionKey || ""),
    provenance: stableGraphValue(candidate.provenance || {}),
    annotations: stableGraphValue(candidate.annotations || {}),
  };
}

export function buildWarmachineReverseReachabilityPolicyV2(rawOptions = {}) {
  const core = {
    schemaVersion: WARMACHINE_REVERSE_REACHABILITY_POLICY_V2_SCHEMA,
    queryKey: String(rawOptions.queryKey || ""),
    purpose: "enumerate_or_regress_strict_reachability",
    candidateOrdering: "canonical_candidate_identity_only",
    strategyEvaluationAllowed: false,
    tacticalUtilityMayRejectCandidate: false,
    exchangeRequired: false,
    legalSuccessorKindsArePeers: true,
    exactReachabilityOutcomes: [
      "strict_reachable_witness",
      "strict_rejected",
      "unresolved_reachability",
      "deferred_by_budget",
    ],
    hardRejectionAuthority: [
      "rules_v1_strict_rejection_bound_to_exact_state_and_action",
      "exact_mathematical_reachability_contradiction",
    ],
    budgetContract: "budget_limits_page_size_only_and_every_deferred_candidate_remains_unresolved",
    downstreamBoundary: "strategy_or_adversarial_evaluation_may_consume_certified_candidates_but_may_not_rewrite_reverse_reachability",
    trainingTruth: false,
    claimBoundary: "Reverse search answers which predecessor transitions can reach a declared successor. Holding, blocking, exchanging, withdrawing and attacking are peer successor cases; no tactical value decides reverse inclusion or rejection.",
  };
  return { ...core, policyHash: stableGraphHash(core) };
}

export function buildWarmachineReverseReachabilityCandidateSetV2(
  candidates = [],
  rawOptions = {},
) {
  const policy = rawOptions.policy?.schemaVersion ===
    WARMACHINE_REVERSE_REACHABILITY_POLICY_V2_SCHEMA
    ? rawOptions.policy
    : buildWarmachineReverseReachabilityPolicyV2(rawOptions);
  const normalized = candidates.map(normalizeCandidate)
    .sort((left, right) => left.candidateKey.localeCompare(right.candidateKey));
  const duplicateCandidateKeys = [];
  const unique = [];
  const seen = new Set();
  for (const candidate of normalized) {
    if (seen.has(candidate.candidateKey)) {
      duplicateCandidateKeys.push(candidate.candidateKey);
      continue;
    }
    seen.add(candidate.candidateKey);
    unique.push(candidate);
  }
  const maximumCandidates = finiteNonnegativeInteger(
    rawOptions.maximumCandidates,
    unique.length,
  );
  const selected = unique.slice(0, maximumCandidates);
  const deferred = unique.slice(maximumCandidates).map((candidate) => ({
    candidateKey: candidate.candidateKey,
    disposition: "deferred_by_budget",
    unresolvedReasons: ["candidate_page_budget_exhausted"],
    originalDisposition: candidate.disposition,
  }));
  const forbiddenDispositions = unique.filter((candidate) =>
    FORBIDDEN_REVERSE_DISPOSITIONS.has(candidate.requestedDisposition));
  const contradictoryCandidates = unique.filter((candidate) =>
    candidate.strictWitness && candidate.strictRejected);
  const core = {
    schemaVersion: WARMACHINE_REVERSE_REACHABILITY_CANDIDATE_SET_V2_SCHEMA,
    policy,
    successorStateKey: String(rawOptions.successorStateKey || ""),
    selected,
    deferred,
    duplicateCandidateKeys: Array.from(new Set(duplicateCandidateKeys)).sort(),
    counts: {
      inputCandidateCount: candidates.length,
      uniqueCandidateCount: unique.length,
      selectedCandidateCount: selected.length,
      deferredCandidateCount: deferred.length,
      strictReachableWitnessCount: unique.filter((candidate) => candidate.strictWitness).length,
      strictRejectedCount: unique.filter((candidate) => candidate.strictRejected).length,
      unresolvedCandidateCount: unique.filter((candidate) =>
        !candidate.strictWitness && !candidate.strictRejected).length,
    },
    cursorExhausted: deferred.length === 0,
    strategyEvaluationApplied: false,
    candidateRankingApplied: false,
    tacticalPruningApplied: false,
    reachabilityContractOk: forbiddenDispositions.length === 0 &&
      contradictoryCandidates.length === 0,
    contractViolations: [
      ...forbiddenDispositions.map((candidate) =>
        `forbidden_reverse_disposition:${candidate.candidateKey}:${candidate.requestedDisposition}`),
      ...contradictoryCandidates.map((candidate) =>
        `candidate_both_witnessed_and_rejected:${candidate.candidateKey}`),
    ].sort(),
    trainingTruth: false,
    claimBoundary: "This is a canonical reachability page, not a tactical ranking. Budget-deferred candidates remain unresolved and annotations never affect selection order or disposition.",
  };
  return { ...core, candidateSetHash: stableGraphHash(core) };
}
