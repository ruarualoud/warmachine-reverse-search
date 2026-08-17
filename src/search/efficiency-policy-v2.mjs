import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_ROUTE_EFFICIENCY_VECTOR_V2_SCHEMA =
  "warmachine_route_efficiency_vector_v2";
export const WARMACHINE_SEARCH_EFFICIENCY_POLICY_V2_SCHEMA =
  "warmachine_search_efficiency_policy_v2";
export const WARMACHINE_EFFICIENCY_FLOOR_EVALUATION_V2_SCHEMA =
  "warmachine_efficiency_floor_evaluation_v2";
export const WARMACHINE_PARETO_ROUTE_LEDGER_V2_SCHEMA =
  "warmachine_pareto_route_ledger_v2";

const DIMENSION_SPECS = Object.freeze({
  terminalProbability: Object.freeze({ direction: "maximize", range: [0, 1], family: "outcome" }),
  opponentWorstCase: Object.freeze({ direction: "maximize", range: [0, 1], family: "adversarial" }),
  opponentResponseCoverage: Object.freeze({ direction: "maximize", range: [0, 1], family: "adversarial" }),
  turnDistance: Object.freeze({ direction: "minimize", range: [0, null], family: "time" }),
  activationDistance: Object.freeze({ direction: "minimize", range: [0, null], family: "time" }),
  resourceMargin: Object.freeze({ direction: "maximize", range: [null, null], family: "resource" }),
  friendlyResourceSpent: Object.freeze({ direction: "minimize", range: [0, null], family: "resource" }),
  exchangePointSwing: Object.freeze({ direction: "maximize", range: [null, null], family: "exchange" }),
  scenarioScoreSwing: Object.freeze({ direction: "maximize", range: [null, null], family: "scenario" }),
  scenarioPressure: Object.freeze({ direction: "maximize", range: [null, null], family: "scenario" }),
  spatialSlackIn: Object.freeze({ direction: "maximize", range: [null, null], family: "geometry" }),
  routeRedundancy: Object.freeze({ direction: "maximize", range: [0, null], family: "robustness" }),
  requiredFriendlyRosterPoints: Object.freeze({ direction: "minimize", range: [0, null], family: "construction" }),
  engagedOpponentRosterPoints: Object.freeze({ direction: "maximize", range: [0, null], family: "construction" }),
  unresolvedMass: Object.freeze({ direction: "minimize", range: [0, 1], family: "uncertainty" }),
  strictCallCost: Object.freeze({ direction: "minimize", range: [0, null], family: "proposal_cost" }),
  nodeCost: Object.freeze({ direction: "minimize", range: [0, null], family: "proposal_cost" }),
  wallTimeMs: Object.freeze({ direction: "minimize", range: [0, null], family: "proposal_cost" }),
});

const HARD_DOMINANCE_DIMENSIONS = Object.freeze([
  "terminalProbability",
  "opponentWorstCase",
  "turnDistance",
  "activationDistance",
  "friendlyResourceSpent",
  "requiredFriendlyRosterPoints",
]);

const ORDERING_ONLY_DIMENSIONS = Object.freeze([
  "opponentResponseCoverage",
  "resourceMargin",
  "exchangePointSwing",
  "scenarioScoreSwing",
  "scenarioPressure",
  "spatialSlackIn",
  "routeRedundancy",
  "engagedOpponentRosterPoints",
  "unresolvedMass",
  "strictCallCost",
  "nodeCost",
  "wallTimeMs",
]);

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, minimum, maximum) {
  if (value === null) return null;
  return Math.max(minimum ?? value, Math.min(maximum ?? value, value));
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function interval(raw, spec, evidenceKind = "unresolved") {
  const source = typeof raw === "number" ? { lowerBound: raw, upperBound: raw, complete: true }
    : raw && typeof raw === "object" ? raw
      : {};
  let lowerBound = finite(firstDefined(source.lowerBound, source.minimum, source.value));
  let upperBound = finite(firstDefined(source.upperBound, source.maximum, source.value));
  lowerBound = clamp(lowerBound, spec.range[0], spec.range[1]);
  upperBound = clamp(upperBound, spec.range[0], spec.range[1]);
  if (lowerBound !== null && upperBound !== null && upperBound < lowerBound) {
    [lowerBound, upperBound] = [upperBound, lowerBound];
  }
  const known = lowerBound !== null && upperBound !== null;
  return {
    direction: spec.direction,
    family: spec.family,
    lowerBound,
    upperBound,
    complete: known && (source.complete === true || Math.abs(upperBound - lowerBound) <= 1e-12),
    evidenceKind: String(source.evidenceKind || evidenceKind),
  };
}

function exactMetricValue(metric = {}) {
  if (metric.complete !== true) return null;
  if (!Number.isFinite(metric.lowerBound) || !Number.isFinite(metric.upperBound)) return null;
  if (Math.abs(metric.upperBound - metric.lowerBound) > 1e-12) return null;
  return metric.lowerBound;
}

function routeContextKey(route = {}, options = {}) {
  const explicit = String(route.dominanceContextKey || options.dominanceContextKey || "");
  if (explicit) return explicit;
  const context = {
    hostReceiptHash: String(route.upstreamReceiptHash || options.upstreamReceiptHash || ""),
    rulesStateId: String(route.rulesStateId || route.stateId || options.rulesStateId || ""),
    terminalProofHash: String(
      route.terminalProofHash || route.proofHash || route.proof?.proofHash ||
      options.terminalProofHash || "",
    ),
    goalType: String(route.goalType || route.proof?.goalType || options.goalType || ""),
    winnerSideKey: String(route.winnerSideKey || route.proof?.winnerSideKey || options.winnerSideKey || ""),
    searchMode: String(route.searchMode || options.searchMode || ""),
  };
  return context.hostReceiptHash && context.rulesStateId && context.terminalProofHash &&
    context.goalType && context.winnerSideKey && context.searchMode
    ? `dominance-context-${stableGraphHash(context)}`
    : "";
}

function metricInputs(route = {}) {
  const probability = firstDefined(
    route.terminalProbability,
    route.probabilityInterval,
    route.evaluation?.rootInterval,
    route.algebra?.evaluation?.rootInterval,
  );
  const opponent = route.opponentRobustness || {};
  const exchange = route.strategicExchange?.exchangeVector || route.exchangeVector || {};
  const proposalCost = route.proposalCost || {};
  const roster = route.rosterInvestment || {};
  const temporal = route.temporalCost || {};
  return {
    terminalProbability: probability,
    opponentWorstCase: firstDefined(opponent.worstCase, route.opponentWorstCase),
    opponentResponseCoverage: firstDefined(opponent.coverage, route.opponentResponseCoverage),
    turnDistance: firstDefined(temporal.turnDistance, route.turnDistance, route.friendlyTurnsBeforeTerminal),
    activationDistance: firstDefined(
      temporal.activationDistance,
      route.activationDistance,
      route.activationsBeforeTerminal,
    ),
    resourceMargin: firstDefined(route.resourceMargin, exchange.resourceSwing),
    friendlyResourceSpent: firstDefined(route.friendlyResourceSpent, route.resourceSpent),
    exchangePointSwing: firstDefined(exchange.pointSwing, route.exchangePointSwing),
    scenarioScoreSwing: firstDefined(exchange.scoreSwing, route.scenarioScoreSwing),
    scenarioPressure: firstDefined(route.scenarioPressure, route.scenarioPressureDelta),
    spatialSlackIn: firstDefined(route.spatialSlackIn, route.minimumSpatialSlackIn),
    routeRedundancy: firstDefined(route.routeRedundancy, route.independentRouteCount),
    requiredFriendlyRosterPoints: firstDefined(
      roster.requiredFriendlyPoints,
      route.requiredFriendlyRosterPoints,
    ),
    engagedOpponentRosterPoints: firstDefined(
      roster.engagedOpponentPoints,
      route.engagedOpponentRosterPoints,
    ),
    unresolvedMass: firstDefined(
      route.unresolvedMass,
      route.evaluation?.unresolvedMass,
      route.algebra?.unresolvedMass,
    ),
    strictCallCost: firstDefined(proposalCost.strictCalls, route.strictCallCost),
    nodeCost: firstDefined(proposalCost.nodes, route.nodeCost),
    wallTimeMs: firstDefined(proposalCost.wallTimeMs, route.wallTimeMs),
  };
}

export function buildWarmachineSearchEfficiencyPolicyV2(mode = "long_horizon", rawOptions = {}) {
  const searchMode = mode === "current_turn" ? "current_turn" : "long_horizon";
  const defaultMaximumTurnDistance = searchMode === "current_turn" ? 0 : 4;
  const core = {
    schemaVersion: WARMACHINE_SEARCH_EFFICIENCY_POLICY_V2_SCHEMA,
    searchMode,
    proposalUniverse: {
      minimumTerminalProbability: Math.max(0, Math.min(1,
        finite(rawOptions.minimumTerminalProbability) ?? 0)),
      minimumOpponentWorstCase: Math.max(0, Math.min(1,
        finite(rawOptions.minimumOpponentWorstCase) ?? 0)),
      maximumTurnDistance: Math.max(0,
        finite(rawOptions.maximumTurnDistance) ?? defaultMaximumTurnDistance),
      maximumRequiredFriendlyRosterPoints: finite(rawOptions.maximumRequiredFriendlyRosterPoints),
      configuredBy: String(rawOptions.configuredBy || "calibration_default"),
      claimBoundary: "These floors define the generated proposal universe. A branch outside them is not proven illegal or strategically impossible and its omitted denominator must be recorded.",
    },
    exactPromotionRequirements: {
      strictForwardWitness: true,
      terminalProofStrictCertified: true,
      rulesRefutationAbsent: true,
      currentTurnRequiresExhaustiveRelevantActions: searchMode === "current_turn",
      currentTurnRequiresExhaustiveOpponentResponses: searchMode === "current_turn",
      currentTurnRequiresCompleteChanceMass: searchMode === "current_turn",
      longHorizonMayReportBestDiscoveredWithUnresolvedMass: searchMode === "long_horizon",
    },
    expansionPolicy: {
      iterativeDeepening: searchMode === "long_horizon",
      exactCurrentTurnCoverageTarget: searchMode === "current_turn",
      allowDeliberateExchange: true,
      allowImmediateMaterialRegression: true,
      allowImmediateScenarioRegression: true,
      budgetExhaustionBecomesUnresolved: true,
    },
    hardStructureRules: [
      "exact_host_rejection_or_strict_terminal_contradiction",
      "exact_capability_or_admissible_optimistic_bound_refutation",
      "declared_temporal_horizon_exceeded",
      "same_context_strict_exact_extension_monotone_pareto_dominance",
    ],
    orderingOnlyRules: [
      "immediate_material_loss",
      "immediate_scenario_score_loss",
      "deliberate_exchange",
      "route_length_within_horizon",
      "formation_or_tactical_prior",
      "llm_or_skill_preference",
      "epsilon_or_scalarized_dominance",
    ],
    hardDominanceDimensions: [...HARD_DOMINANCE_DIMENSIONS],
    orderingOnlyDimensions: [...ORDERING_ONLY_DIMENSIONS],
    dimensionSpecs: stableGraphValue(DIMENSION_SPECS),
    preferenceOrder: [
      "strictWitness",
      "terminalProbability",
      "opponentWorstCase",
      "unresolvedMass",
      "turnDistance",
      "scenarioScoreSwing",
      "exchangePointSwing",
      "spatialSlackIn",
      "routeRedundancy",
      "proposalCost",
    ],
    trainingTruth: false,
    claimBoundary: "The policy preserves a multidimensional route ledger. It never turns a tactical preference, temporary loss, finite budget or subjective efficiency floor into rules truth or a global-optimality proof.",
  };
  return { ...core, policyHash: stableGraphHash(core) };
}

export function buildWarmachineRouteEfficiencyVectorV2(route = {}, rawOptions = {}) {
  const inputs = metricInputs(route);
  const dimensions = Object.fromEntries(Object.entries(DIMENSION_SPECS).map(([key, spec]) => [
    key,
    interval(inputs[key], spec, route.metricEvidenceKinds?.[key] || "route_declaration"),
  ]));
  const pointSwing = exactMetricValue(dimensions.exchangePointSwing);
  const scoreSwing = exactMetricValue(dimensions.scenarioScoreSwing);
  const core = {
    schemaVersion: WARMACHINE_ROUTE_EFFICIENCY_VECTOR_V2_SCHEMA,
    routeKey: String(route.routeKey || route.labelKey || `route-${stableGraphHash(route, 24)}`),
    dominanceContextKey: routeContextKey(route, rawOptions),
    searchMode: String(route.searchMode || rawOptions.searchMode || "long_horizon"),
    goalType: String(route.goalType || route.proof?.goalType || rawOptions.goalType || ""),
    winnerSideKey: String(route.winnerSideKey || route.proof?.winnerSideKey || rawOptions.winnerSideKey || ""),
    strictWitness: route.strictWitness === true,
    terminalProofStrictCertified: route.terminalProofStrictCertified === true ||
      route.proof?.strictCertified === true,
    exactHostRefuted: route.exactHostRefuted === true || route.strictRejectedExact === true,
    exactCapabilityRefuted: route.exactCapabilityRefuted === true,
    admissibleOptimisticBoundRefuted: route.admissibleOptimisticBoundRefuted === true,
    dimensions,
    immediateRegression: {
      material: pointSwing !== null && pointSwing < 0,
      scenarioScore: scoreSwing !== null && scoreSwing < 0,
      deliberateExchange: route.deliberateExchange === true ||
        route.strategicExchange?.deliberateExchange === true,
    },
    completeness: {
      relevantActionCursorExhausted: route.relevantActionCursorExhausted === true,
      opponentResponseCursorExhausted: route.opponentResponseCursorExhausted === true,
      chanceMassComplete: route.chanceMassComplete === true,
      triggerAndReactionClosureComplete: route.triggerAndReactionClosureComplete === true,
    },
    extensionMonotonicityEvidenceByDimension: stableGraphValue(
      route.extensionMonotonicityEvidenceByDimension || {},
    ),
    independentProbabilityMassMustBePreserved:
      route.independentProbabilityMassMustBePreserved !== false,
    provenance: stableGraphValue(route.provenance || {}),
    trainingTruth: false,
  };
  return { ...core, vectorHash: stableGraphHash(core) };
}

function metricUpperBelow(metric, floor) {
  return Number.isFinite(floor) && Number.isFinite(metric?.upperBound) &&
    metric.upperBound < floor - 1e-12;
}

function metricLowerAbove(metric, ceiling) {
  return Number.isFinite(ceiling) && Number.isFinite(metric?.lowerBound) &&
    metric.lowerBound > ceiling + 1e-12;
}

function metricOverlapsFloor(metric, floor, direction = "minimum") {
  if (!Number.isFinite(floor) || !metric) return false;
  if (direction === "maximum") {
    return Number.isFinite(metric.lowerBound) && Number.isFinite(metric.upperBound) &&
      metric.lowerBound <= floor && metric.upperBound > floor;
  }
  return Number.isFinite(metric.lowerBound) && Number.isFinite(metric.upperBound) &&
    metric.lowerBound < floor && metric.upperBound >= floor;
}

export function evaluateWarmachineRouteEfficiencyFloorV2(vectorInput = {}, policyInput = {}) {
  const vector = vectorInput.schemaVersion === WARMACHINE_ROUTE_EFFICIENCY_VECTOR_V2_SCHEMA
    ? vectorInput
    : buildWarmachineRouteEfficiencyVectorV2(vectorInput, policyInput);
  const policy = policyInput.schemaVersion === WARMACHINE_SEARCH_EFFICIENCY_POLICY_V2_SCHEMA
    ? policyInput
    : buildWarmachineSearchEfficiencyPolicyV2(vector.searchMode, policyInput);
  const floor = policy.proposalUniverse;
  const rulesRefutations = [];
  if (vector.exactHostRefuted) rulesRefutations.push("exact_host_refutation");
  if (vector.exactCapabilityRefuted) rulesRefutations.push("exact_capability_refutation");
  if (vector.admissibleOptimisticBoundRefuted) {
    rulesRefutations.push("admissible_optimistic_bound_refutation");
  }
  const proposalExclusions = [];
  if (metricUpperBelow(
    vector.dimensions.terminalProbability,
    floor.minimumTerminalProbability,
  )) proposalExclusions.push("terminal_probability_upper_bound_below_proposal_floor");
  if (metricUpperBelow(
    vector.dimensions.opponentWorstCase,
    floor.minimumOpponentWorstCase,
  )) proposalExclusions.push("opponent_worst_case_upper_bound_below_proposal_floor");
  if (metricLowerAbove(
    vector.dimensions.turnDistance,
    floor.maximumTurnDistance,
  )) proposalExclusions.push("declared_search_horizon_exceeded");
  if (Number.isFinite(floor.maximumRequiredFriendlyRosterPoints) && metricLowerAbove(
    vector.dimensions.requiredFriendlyRosterPoints,
    floor.maximumRequiredFriendlyRosterPoints,
  )) proposalExclusions.push("friendly_roster_investment_above_proposal_ceiling");

  const floorUncertainty = [];
  if (metricOverlapsFloor(
    vector.dimensions.terminalProbability,
    floor.minimumTerminalProbability,
  )) floorUncertainty.push("terminal_probability_crosses_proposal_floor");
  if (metricOverlapsFloor(
    vector.dimensions.opponentWorstCase,
    floor.minimumOpponentWorstCase,
  )) floorUncertainty.push("opponent_worst_case_crosses_proposal_floor");

  const strictRoutePending = [];
  const exactClosurePending = [];
  if (!vector.strictWitness) strictRoutePending.push("strict_forward_witness_missing");
  if (!vector.terminalProofStrictCertified) strictRoutePending.push("strict_terminal_proof_missing");
  if (!vector.completeness.relevantActionCursorExhausted) {
    exactClosurePending.push("relevant_action_cursor_not_exhausted");
  }
  if (!vector.completeness.opponentResponseCursorExhausted) {
    exactClosurePending.push("opponent_response_cursor_not_exhausted");
  }
  if (!vector.completeness.chanceMassComplete) {
    exactClosurePending.push("chance_mass_incomplete");
  }
  if (!vector.completeness.triggerAndReactionClosureComplete) {
    exactClosurePending.push("trigger_or_reaction_closure_incomplete");
  }

  const rulesImpossible = rulesRefutations.length > 0;
  const insideProposalUniverse = !rulesImpossible && proposalExclusions.length === 0;
  const core = {
    schemaVersion: WARMACHINE_EFFICIENCY_FLOOR_EVALUATION_V2_SCHEMA,
    vectorHash: vector.vectorHash,
    policyHash: policy.policyHash,
    rulesRefutations,
    proposalExclusions,
    floorUncertainty,
    strictRoutePending,
    exactClosurePending,
    rulesImpossible,
    insideProposalUniverse,
    expansionEligible: insideProposalUniverse,
    proposalFloorCertified: insideProposalUniverse && floorUncertainty.length === 0,
    strictRouteReportReady: insideProposalUniverse && strictRoutePending.length === 0,
    bestDiscoveredPromotionReady: insideProposalUniverse && strictRoutePending.length === 0 &&
      (policy.searchMode === "long_horizon" || exactClosurePending.length === 0),
    exactPromotionReady: insideProposalUniverse && floorUncertainty.length === 0 &&
      strictRoutePending.length === 0 && exactClosurePending.length === 0,
    proposalOmissionMustBeRecorded: proposalExclusions.length > 0,
    immediateRegressionCausedExclusion: false,
    hardRulesPrunable: rulesImpossible,
    globalOptimalityProven: false,
    claimBoundary: "Proposal exclusions implement a declared search universe, not a rules impossibility claim. Intervals crossing a floor remain candidates, and immediate material or score regression never excludes a route by itself.",
  };
  return { ...core, evaluationHash: stableGraphHash(core) };
}

function exactNoWorse(leftMetric, rightMetric) {
  const left = exactMetricValue(leftMetric);
  const right = exactMetricValue(rightMetric);
  if (left === null || right === null) return null;
  if (leftMetric.direction === "maximize") {
    return { noWorse: left >= right - 1e-12, strictlyBetter: left > right + 1e-12 };
  }
  return { noWorse: left <= right + 1e-12, strictlyBetter: left < right - 1e-12 };
}

function orderingValue(metric = {}) {
  if (Number.isFinite(metric.lowerBound) && Number.isFinite(metric.upperBound)) {
    return (metric.lowerBound + metric.upperBound) / 2;
  }
  if (Number.isFinite(metric.lowerBound)) return metric.lowerBound;
  if (Number.isFinite(metric.upperBound)) return metric.upperBound;
  return null;
}

function preferenceTuple(vector) {
  const value = (key, fallback, invert = false) => {
    const metric = vector.dimensions[key];
    const result = orderingValue(metric);
    if (result === null) return fallback;
    return invert ? -result : result;
  };
  return [
    vector.strictWitness ? 1 : 0,
    value("terminalProbability", -1),
    value("opponentWorstCase", -1),
    value("unresolvedMass", -1, true),
    value("turnDistance", Number.NEGATIVE_INFINITY, true),
    value("scenarioScoreSwing", Number.NEGATIVE_INFINITY),
    value("exchangePointSwing", Number.NEGATIVE_INFINITY),
    value("spatialSlackIn", Number.NEGATIVE_INFINITY),
    value("routeRedundancy", Number.NEGATIVE_INFINITY),
    value("strictCallCost", Number.NEGATIVE_INFINITY, true),
    value("nodeCost", Number.NEGATIVE_INFINITY, true),
  ];
}

function compareTupleDescending(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? Number.NEGATIVE_INFINITY;
    const rightValue = right[index] ?? Number.NEGATIVE_INFINITY;
    if (leftValue !== rightValue) return rightValue - leftValue;
  }
  return 0;
}

export function compareWarmachineRouteEfficiencyV2(leftInput = {}, rightInput = {}, policyInput = {}) {
  const policy = policyInput.schemaVersion === WARMACHINE_SEARCH_EFFICIENCY_POLICY_V2_SCHEMA
    ? policyInput
    : buildWarmachineSearchEfficiencyPolicyV2(
      leftInput.searchMode || rightInput.searchMode || "long_horizon",
      policyInput,
    );
  const left = leftInput.schemaVersion === WARMACHINE_ROUTE_EFFICIENCY_VECTOR_V2_SCHEMA
    ? leftInput
    : buildWarmachineRouteEfficiencyVectorV2(leftInput, { searchMode: policy.searchMode });
  const right = rightInput.schemaVersion === WARMACHINE_ROUTE_EFFICIENCY_VECTOR_V2_SCHEMA
    ? rightInput
    : buildWarmachineRouteEfficiencyVectorV2(rightInput, { searchMode: policy.searchMode });
  const sameContext = Boolean(
    left.dominanceContextKey && left.dominanceContextKey === right.dominanceContextKey,
  );
  const dimensionRows = policy.hardDominanceDimensions.map((dimensionKey) => {
    const comparison = exactNoWorse(left.dimensions[dimensionKey], right.dimensions[dimensionKey]);
    const leftEvidence = left.extensionMonotonicityEvidenceByDimension[dimensionKey];
    const rightEvidence = right.extensionMonotonicityEvidenceByDimension[dimensionKey];
    return {
      dimensionKey,
      comparison,
      extensionMonotonicityProven: leftEvidence === "proven_for_shared_predecessor_extension" &&
        rightEvidence === "proven_for_shared_predecessor_extension",
    };
  });
  const everyComparable = dimensionRows.every((row) => row.comparison !== null);
  const everyNoWorse = everyComparable && dimensionRows.every((row) => row.comparison.noWorse);
  const anyStrictlyBetter = dimensionRows.some((row) => row.comparison?.strictlyBetter === true);
  const extensionMonotonicityProven = dimensionRows.every((row) =>
    row.extensionMonotonicityProven);
  const probabilityLedgerMayDiscardRight =
    right.independentProbabilityMassMustBePreserved === false;
  const hardDominates = sameContext && left.strictWitness && right.strictWitness &&
    left.terminalProofStrictCertified && right.terminalProofStrictCertified &&
    everyNoWorse && anyStrictlyBetter && extensionMonotonicityProven &&
    probabilityLedgerMayDiscardRight;
  const leftTuple = preferenceTuple(left);
  const rightTuple = preferenceTuple(right);
  const preferenceComparison = compareTupleDescending(leftTuple, rightTuple);
  return {
    leftVectorHash: left.vectorHash,
    rightVectorHash: right.vectorHash,
    policyHash: policy.policyHash,
    sameContext,
    dimensionRows,
    everyComparable,
    everyNoWorse,
    anyStrictlyBetter,
    extensionMonotonicityProven,
    probabilityLedgerMayDiscardRight,
    hardDominates,
    orderingPreference: preferenceComparison < 0 ? "left" : preferenceComparison > 0 ? "right" : "tie",
    leftPreferenceTuple: leftTuple.map((value) => Number.isFinite(value) ? value : null),
    rightPreferenceTuple: rightTuple.map((value) => Number.isFinite(value) ? value : null),
    hardPruningEnabledForPair: hardDominates,
    claimBoundary: "Preference ordering is not dominance. Hard label suppression requires the same context, strict terminal witnesses, exact dimensions, extension-monotonicity evidence and permission to remove the dominated route's independent probability contribution.",
  };
}

function vectorSort(left, right) {
  const tupleOrder = compareTupleDescending(preferenceTuple(left), preferenceTuple(right));
  return tupleOrder || left.routeKey.localeCompare(right.routeKey);
}

export function buildWarmachineParetoRouteLedgerV2(routes = [], policyInput = {}) {
  const policy = policyInput.schemaVersion === WARMACHINE_SEARCH_EFFICIENCY_POLICY_V2_SCHEMA
    ? policyInput
    : buildWarmachineSearchEfficiencyPolicyV2(
      policyInput.searchMode || routes[0]?.searchMode || "long_horizon",
      policyInput,
    );
  const vectors = routes.map((route) =>
    route.schemaVersion === WARMACHINE_ROUTE_EFFICIENCY_VECTOR_V2_SCHEMA
      ? route
      : buildWarmachineRouteEfficiencyVectorV2(route, { searchMode: policy.searchMode }))
    .sort((left, right) => left.routeKey.localeCompare(right.routeKey));
  const floorRows = vectors.map((vector) => ({
    vector,
    evaluation: evaluateWarmachineRouteEfficiencyFloorV2(vector, policy),
  }));
  const outOfProposalUniverse = floorRows.filter((row) => !row.evaluation.expansionEligible)
    .map((row) => ({
      routeKey: row.vector.routeKey,
      vectorHash: row.vector.vectorHash,
      rulesImpossible: row.evaluation.rulesImpossible,
      rulesRefutations: row.evaluation.rulesRefutations,
      proposalExclusions: row.evaluation.proposalExclusions,
      omittedMass: row.vector.dimensions.terminalProbability,
    }));
  const eligible = floorRows.filter((row) => row.evaluation.expansionEligible)
    .map((row) => row.vector);
  const archived = [];
  const retained = [];
  const comparisons = [];
  for (const candidate of eligible) {
    let candidateArchived = false;
    for (let index = retained.length - 1; index >= 0; index -= 1) {
      const existing = retained[index];
      const existingOverCandidate = compareWarmachineRouteEfficiencyV2(existing, candidate, policy);
      const candidateOverExisting = compareWarmachineRouteEfficiencyV2(candidate, existing, policy);
      comparisons.push({
        leftRouteKey: existing.routeKey,
        rightRouteKey: candidate.routeKey,
        leftHardDominates: existingOverCandidate.hardDominates,
        rightHardDominates: candidateOverExisting.hardDominates,
        orderingPreference: existingOverCandidate.orderingPreference,
      });
      if (existingOverCandidate.hardDominates) {
        archived.push({
          routeKey: candidate.routeKey,
          vectorHash: candidate.vectorHash,
          dominatedByRouteKey: existing.routeKey,
          disposition: "cold_archive_exact_dominated_label",
          provenanceRetained: true,
        });
        candidateArchived = true;
        break;
      }
      if (candidateOverExisting.hardDominates) {
        archived.push({
          routeKey: existing.routeKey,
          vectorHash: existing.vectorHash,
          dominatedByRouteKey: candidate.routeKey,
          disposition: "cold_archive_exact_dominated_label",
          provenanceRetained: true,
        });
        retained.splice(index, 1);
      }
    }
    if (!candidateArchived) retained.push(candidate);
  }
  retained.sort(vectorSort);
  const core = {
    schemaVersion: WARMACHINE_PARETO_ROUTE_LEDGER_V2_SCHEMA,
    policy,
    inputRouteCount: routes.length,
    retained,
    archived,
    outOfProposalUniverse,
    comparisons,
    counts: {
      inputRouteCount: routes.length,
      retainedRouteCount: retained.length,
      archivedExactDominatedRouteCount: archived.length,
      outOfProposalUniverseRouteCount: outOfProposalUniverse.length,
      rulesImpossibleRouteCount: outOfProposalUniverse.filter((row) => row.rulesImpossible).length,
      subjectiveProposalExclusionCount: outOfProposalUniverse.filter((row) =>
        !row.rulesImpossible).length,
      immediateRegressionRetainedCount: retained.filter((row) =>
        row.immediateRegression.material || row.immediateRegression.scenarioScore).length,
    },
    omittedProposalMassMustBePersisted: outOfProposalUniverse.some((row) =>
      !row.rulesImpossible),
    hardRulesPruningEnabledOnlyForExactRefutations: true,
    hardParetoSuppressionRequiresPairProof: true,
    globalOptimalityProven: false,
    trainingTruth: false,
    claimBoundary: "The ledger ranks every retained vector without scalarizing it into rules truth. Exact dominated labels are cold archived with provenance; subjective floors and finite budgets retain an omitted-route ledger and never support a completeness claim.",
  };
  return { ...core, ledgerHash: stableGraphHash(core) };
}
