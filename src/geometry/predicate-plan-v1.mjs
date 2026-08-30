import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  buildRulesV1MovementGeometryPredicatePlan,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";

export const WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA =
  "warmachine_geometry_predicate_plan_v1";

const ALLOWED_RELATION_KINDS = new Set([
  "inside_closed_region",
  "outside_open_region",
]);

function finite(value) {
  return Number.isFinite(Number(value));
}

function pointValid(value) {
  return finite(value?.xIn) && finite(value?.yIn);
}

function boundsValid(value) {
  return finite(value?.left) && finite(value?.right) &&
    finite(value?.top) && finite(value?.bottom) &&
    Number(value.left) <= Number(value.right) &&
    Number(value.top) <= Number(value.bottom);
}

function primitiveIssues(primitive = {}, path = "primitive") {
  const kind = String(primitive.primitiveKind || "");
  if ([
    "axis_aligned_rectangle_inclusion",
    "axis_aligned_rectangle_exclusion",
  ].includes(kind)) {
    return boundsValid(primitive.bounds) ? [] : [`${path}_bounds_invalid`];
  }
  if (["circle_inclusion", "circle_exclusion"].includes(kind)) {
    return pointValid(primitive.center) && finite(primitive.radiusIn) &&
      Number(primitive.radiusIn) >= 0
      ? []
      : [`${path}_circle_invalid`];
  }
  if (kind === "rounded_rotated_rectangle_exclusion") {
    return pointValid(primitive.center) && finite(primitive.widthIn) &&
      finite(primitive.heightIn) && Number(primitive.widthIn) > 0 &&
      Number(primitive.heightIn) > 0 && finite(primitive.rotationDegrees) &&
      finite(primitive.inflationRadiusIn) && Number(primitive.inflationRadiusIn) >= 0
      ? []
      : [`${path}_rotated_rectangle_invalid`];
  }
  return [`${path}_kind_unsupported:${kind || "missing"}`];
}

function validateHostPlan(hostPlan = {}) {
  const { predicatePlanHash, ...hostCore } = hostPlan;
  const issues = [];
  if (hostPlan.schemaVersion !== "warmachine_movement_geometry_predicate_plan_v1") {
    issues.push("host_predicate_plan_schema_invalid");
  }
  if (!predicatePlanHash || stableGraphHash(hostCore) !== predicatePlanHash) {
    issues.push("host_predicate_plan_hash_mismatch");
  }
  for (const [index, predicate] of (hostPlan.predicates || []).entries()) {
    if (!predicate.predicateKey) issues.push(`predicate_${index}_key_missing`);
    if (!ALLOWED_RELATION_KINDS.has(predicate.relationKind)) {
      issues.push(`predicate_${index}_relation_unsupported:${predicate.relationKind || "missing"}`);
    }
    if (!Array.isArray(predicate.sourceRuleKeys) || !predicate.sourceRuleKeys.length) {
      issues.push(`predicate_${index}_source_rules_missing`);
    }
    issues.push(...primitiveIssues(predicate.primitive, `predicate_${index}_primitive`));
  }
  for (const [index, obstacle] of (hostPlan.configurationObstacles || []).entries()) {
    if (!obstacle.obstacleKey) issues.push(`obstacle_${index}_key_missing`);
    issues.push(...primitiveIssues(obstacle.primitive, `obstacle_${index}_primitive`));
  }
  for (const [index, eventRegion] of (hostPlan.eventRegions || []).entries()) {
    if (!eventRegion.eventRegionKey) issues.push(`event_region_${index}_key_missing`);
    issues.push(...primitiveIssues(eventRegion.primitive, `event_region_${index}_primitive`));
    if (eventRegion.membershipBoundaryKind !== "closed" ||
        !finite(eventRegion.membershipToleranceIn) ||
        Number(eventRegion.membershipToleranceIn) < 0) {
      issues.push(`event_region_${index}_membership_contract_invalid`);
    }
    const signedDistanceIn = Number(eventRegion.actorStartSignedDistanceIn);
    const boundaryLowerBoundIn = Number(
      eventRegion.startToBoundaryDistanceLowerBoundIn,
    );
    if (eventRegion.actorStartSignedDistanceIn == null ||
        eventRegion.startToBoundaryDistanceLowerBoundIn == null ||
        !Number.isFinite(signedDistanceIn) ||
        !Number.isFinite(boundaryLowerBoundIn) || boundaryLowerBoundIn < 0 ||
        typeof eventRegion.actorStartInside !== "boolean" ||
        typeof eventRegion.actorStartOnBoundary !== "boolean" ||
        typeof eventRegion.boundaryUnreachableWithinMovementAllowanceProven !==
          "boolean" ||
        eventRegion.boundaryUnreachabilityTheoremKey !==
          "rectifiable_path_length_lower_bounded_by_endpoint_euclidean_distance_v1") {
      issues.push(`event_region_${index}_boundary_distance_certificate_invalid`);
    }
    if (eventRegion.boundaryUnreachableWithinMovementAllowanceProven === true &&
        !(boundaryLowerBoundIn > Number(hostPlan.movementAllowanceIn) + 0.001)) {
      issues.push(`event_region_${index}_boundary_unreachability_claim_invalid`);
    }
  }
  const quantum = Number(hostPlan.pathCoordinateQuantumIn);
  const minimumSegment = Number(hostPlan.minimumPositivePathSegmentDistanceIn);
  const maximumSegments = Number(hostPlan.maximumLegalPathSegmentCount);
  const maximumCrossings = Number(
    hostPlan.maximumDeclaredEventRegionBoundaryCrossingCount,
  );
  const expectedCrossings = maximumSegments *
    (hostPlan.eventRegions || []).length * 2;
  if (!Number.isFinite(quantum) || quantum <= 0 ||
      !Number.isFinite(minimumSegment) || minimumSegment < quantum ||
      !Number.isInteger(maximumSegments) || maximumSegments < 0 ||
      !Number.isInteger(maximumCrossings) || maximumCrossings < 0 ||
      maximumCrossings !== expectedCrossings ||
      !/^\d+$/.test(String(
        hostPlan.maximumDeclaredEventRegionAutomatonStateUpperBound || "",
      )) ||
      hostPlan.declaredEventRegionAutomatonBoundTheoremKey !==
        "cent_inch_quantized_positive_cost_convex_region_crossing_finite_bound_v1" ||
      hostPlan.declaredEventRegionAutomatonFiniteBoundExactWithinScope !== true) {
    issues.push("host_declared_event_region_automaton_bound_invalid");
  } else {
    const expectedStateUpperBound = (
      BigInt(maximumCrossings + 1) *
        (1n << BigInt((hostPlan.eventRegions || []).length))
    ).toString();
    if (String(hostPlan.maximumDeclaredEventRegionAutomatonStateUpperBound) !==
        expectedStateUpperBound) {
      issues.push("host_declared_event_region_automaton_state_bound_invalid");
    }
  }
  return {
    issues: [...new Set(issues)].sort(),
    hostCore,
    hashMatches: Boolean(predicatePlanHash) && stableGraphHash(hostCore) === predicatePlanHash,
  };
}

function strategyContext(raw = {}) {
  const context = stableGraphValue({
    initialDistributionReceiptHash: String(raw.initialDistributionReceiptHash || ""),
    historyReceiptHash: String(raw.historyReceiptHash || ""),
    observationReceiptHash: String(raw.observationReceiptHash || ""),
    reachabilityContextKey: String(raw.reachabilityContextKey || ""),
    remainingPly: Number.isInteger(Number(raw.remainingPly)) && Number(raw.remainingPly) >= 0
      ? Number(raw.remainingPly)
      : null,
  });
  const missingKeys = Object.entries(context)
    .filter(([, value]) => value === "" || value === null)
    .map(([key]) => key)
    .sort();
  return {
    context,
    missingKeys,
    bound: missingKeys.length === 0,
    contextHash: missingKeys.length === 0 ? stableGraphHash(context) : "",
  };
}

export function buildWarmachineGeometryPredicatePlanV1(inputState = {}, options = {}) {
  const state = normalizeRulesV1State(inputState);
  const hostPlan = options.hostPlan || buildRulesV1MovementGeometryPredicatePlan(state, {
    actorPieceKey: options.actorPieceKey,
    actionType: options.actionType,
  });
  const validation = validateHostPlan(hostPlan);
  const strategy = strategyContext(options.strategyContext);
  const hostFocusedExecutionReceiptCurrent =
    warmachineHost.focusedSourceReceipt?.current === true;
  const ruleBehaviorContext = stableGraphValue({
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    focusedExecutionSourceReceiptHash:
      warmachineHost.focusedSourceReceipt?.observedExecutionSourceReceiptHash || "",
    stateHash: stableGraphHash(state),
    stateKey: String(state.stateKey || ""),
    activeSideKey: String(state.activeSideKey || ""),
    phaseKey: String(state.phaseKey || ""),
    turnNumber: Number(state.turnNumber || 0),
    actorPieceKey: String(options.actorPieceKey || ""),
    actionType: String(options.actionType || "advance"),
  });
  const completionDebts = [
    ...(!hostPlan.ok ? ["host_predicate_plan_not_ok"] : []),
    ...validation.issues,
    ...(!hostFocusedExecutionReceiptCurrent ? ["engine_focused_execution_receipt_stale"] : []),
    ...(hostPlan.wildcardDebts || []).map((debt) =>
      `host_wildcard:${String(debt.reason || "unknown")}`),
    ...strategy.missingKeys.map((key) => `strategy_context_unbound:${key}`),
    "finite_geometry_cell_partition_not_built",
    "path_class_partition_not_proven",
    "transition_stability_not_proven",
  ];
  const normalizedPredicates = (hostPlan.predicates || []).map((predicate) =>
    stableGraphValue({
      ...predicate,
      predicateIdentityHash: stableGraphHash(predicate),
    }));
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA,
    ok: hostPlan.ok === true && validation.issues.length === 0,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    hostFocusedExecutionReceiptCurrent,
    hostPredicatePlanHash: String(hostPlan.predicatePlanHash || ""),
    hostPredicatePlanHashMatches: validation.hashMatches,
    ruleBehaviorContext,
    ruleBehaviorContextHash: stableGraphHash(ruleBehaviorContext),
    strategyComparisonContext: strategy.context,
    strategyComparisonContextBound: strategy.bound,
    strategyComparisonContextHash: strategy.contextHash,
    actorPieceKey: String(hostPlan.actorPieceKey || options.actorPieceKey || ""),
    actorPosition: stableGraphValue(hostPlan.actorPosition || null),
    actionType: String(hostPlan.actionType || options.actionType || "advance"),
    predicates: normalizedPredicates,
    configurationObstacles: stableGraphValue(hostPlan.configurationObstacles || []),
    eventRegions: stableGraphValue(hostPlan.eventRegions || []),
    wildcardDebts: stableGraphValue(hostPlan.wildcardDebts || []),
    pathCoordinateQuantumIn: Number(hostPlan.pathCoordinateQuantumIn || 0),
    minimumPositivePathSegmentDistanceIn:
      Number(hostPlan.minimumPositivePathSegmentDistanceIn || 0),
    maximumLegalPathSegmentCount:
      Number(hostPlan.maximumLegalPathSegmentCount || 0),
    movementAllowanceIn: Number(hostPlan.movementAllowanceIn || 0),
    maximumDeclaredEventRegionBoundaryCrossingCount:
      Number(hostPlan.maximumDeclaredEventRegionBoundaryCrossingCount || 0),
    maximumDeclaredEventRegionAutomatonStateUpperBound: String(
      hostPlan.maximumDeclaredEventRegionAutomatonStateUpperBound || "",
    ),
    declaredEventRegionAutomatonBoundTheoremKey: String(
      hostPlan.declaredEventRegionAutomatonBoundTheoremKey || "",
    ),
    declaredEventRegionAutomatonFiniteBoundExactWithinScope:
      hostPlan.declaredEventRegionAutomatonFiniteBoundExactWithinScope === true,
    completionDebts: [...new Set(completionDebts)].sort(),
    endpointPredicatePlanExact: hostPlan.endpointPredicatePlanExact === true,
    pathClassPartitionRequired: hostPlan.pathClassPartitionRequired === true,
    continuousChoiceKind: String(hostPlan.continuousChoiceKind || ""),
    chanceMassAssigned: hostPlan.chanceMassAssigned === true,
    finiteGeometryCellPartitionReady: false,
    pathClassPartitionComplete: false,
    transitionStable: false,
    ruleBehaviorQuotientComplete: false,
    strategyQuotientAuthority: false,
    claimBoundary:
      "This Search receipt verifies and binds the Engine movement predicate plan without reimplementing geometry. It is an initial event-surface declaration, not a finite cell partition, complete path domain, transition-stability proof, Q_rule completion receipt, Q_goal strategy certificate, legal action or Chance distribution.",
  });
  return {
    ...core,
    predicatePlanReceiptHash: stableGraphHash(core),
  };
}
