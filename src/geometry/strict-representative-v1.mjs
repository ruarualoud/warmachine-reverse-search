import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  applyRulesV1Action,
  buildRulesV1MovementPathProposalPlan,
  evaluateRulesV1MovementGeometryEndpoint,
  evaluateRulesV1MovementGeometryPath,
  materializeRulesV1ParameterizedMovementAction,
} from "../warmachine-host-runtime.mjs";
import { WARMACHINE_GEOMETRY_CELL_PARTITION_V1_SCHEMA } from
  "./cell-partition-v1.mjs";
import { WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA } from
  "./predicate-plan-v1.mjs";
import {
  warmachineReverseStateSemanticHashV1,
  warmachineRuleBehaviorStateHashV1,
} from
  "../state/semantic-hash-v1.mjs";

export const WARMACHINE_GEOMETRY_STRICT_REPRESENTATIVE_V1_SCHEMA =
  "warmachine_geometry_strict_representative_v1";

function finite(value) {
  return Number.isFinite(Number(value));
}

function point(value = {}) {
  return {
    xIn: Math.round(Number(value.xIn ?? value.x) * 100) / 100,
    yIn: Math.round(Number(value.yIn ?? value.y) * 100) / 100,
  };
}

function pointValid(value = {}) {
  return finite(value.xIn ?? value.x) && finite(value.yIn ?? value.y);
}

function rotate(local = {}, center = {}, rotationDegrees = 0) {
  const radians = Number(rotationDegrees || 0) * Math.PI / 180;
  const dx = Number(local.xIn) - Number(center.xIn);
  const dy = Number(local.yIn) - Number(center.yIn);
  return point({
    xIn: Number(center.xIn) + dx * Math.cos(radians) - dy * Math.sin(radians),
    yIn: Number(center.yIn) + dx * Math.sin(radians) + dy * Math.cos(radians),
  });
}

function primitiveCandidatePoints(primitive = {}) {
  const kind = String(primitive.primitiveKind || "");
  if (kind.startsWith("axis_aligned_rectangle_")) {
    const bounds = primitive.bounds || {};
    const center = point({
      xIn: (Number(bounds.left) + Number(bounds.right)) / 2,
      yIn: (Number(bounds.top) + Number(bounds.bottom)) / 2,
    });
    const xs = [Number(bounds.left), center.xIn, Number(bounds.right)];
    const ys = [Number(bounds.top), center.yIn, Number(bounds.bottom)];
    return xs.flatMap((xIn) => ys.map((yIn) => point({ xIn, yIn })));
  }
  if (kind.startsWith("circle_")) {
    const center = point(primitive.center || {});
    const radiusIn = Math.max(0, Number(primitive.radiusIn || 0));
    const radii = [0, radiusIn * 0.5, Math.max(0, radiusIn - 0.02), radiusIn];
    return radii.flatMap((radius) => Array.from({ length: 16 }, (_, index) => {
      const angle = Math.PI * 2 * index / 16;
      return point({
        xIn: center.xIn + Math.cos(angle) * radius,
        yIn: center.yIn + Math.sin(angle) * radius,
      });
    }));
  }
  if (kind === "rounded_rotated_rectangle_exclusion") {
    const center = point(primitive.center || {});
    const halfWidth = Math.max(0, Number(primitive.widthIn || 0) / 2);
    const halfHeight = Math.max(0, Number(primitive.heightIn || 0) / 2);
    const inflation = Math.max(0, Number(primitive.inflationRadiusIn || 0));
    const xs = [-halfWidth - inflation, 0, halfWidth + inflation];
    const ys = [-halfHeight - inflation, 0, halfHeight + inflation];
    return xs.flatMap((dx) => ys.map((dy) => rotate({
      xIn: center.xIn + dx,
      yIn: center.yIn + dy,
    }, center, Number(primitive.rotationDegrees || 0))));
  }
  return [];
}

function boundedCandidateLimit(value) {
  const parsed = Number(value ?? 1024);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 16384) {
    throw new Error("geometry_strict_representative_candidate_limit_invalid");
  }
  return parsed;
}

function boundedAttemptLimit(value) {
  const parsed = Number(value ?? 8);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 64) {
    throw new Error("geometry_strict_representative_attempt_limit_invalid");
  }
  return parsed;
}

function validateInputs(predicatePlan = {}, cellPage = {}) {
  const issues = [];
  const { predicatePlanReceiptHash, ...predicateCore } = predicatePlan;
  const { cellPartitionPageHash, ...cellCore } = cellPage;
  if (predicatePlan.schemaVersion !== WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA) {
    issues.push("geometry_predicate_plan_schema_invalid");
  }
  if (!predicatePlanReceiptHash || stableGraphHash(predicateCore) !== predicatePlanReceiptHash) {
    issues.push("geometry_predicate_plan_receipt_hash_mismatch");
  }
  if (cellPage.schemaVersion !== WARMACHINE_GEOMETRY_CELL_PARTITION_V1_SCHEMA) {
    issues.push("geometry_cell_partition_schema_invalid");
  }
  if (!cellPartitionPageHash || stableGraphHash(cellCore) !== cellPartitionPageHash) {
    issues.push("geometry_cell_partition_receipt_hash_mismatch");
  }
  if (cellPage.predicatePlanReceiptHash !== predicatePlanReceiptHash) {
    issues.push("geometry_cell_partition_predicate_plan_binding_mismatch");
  }
  if (predicatePlan.continuousChoiceKind !== "player_choice_not_chance" ||
      predicatePlan.chanceMassAssigned !== false ||
      cellPage.continuousChoiceKind !== "player_choice_not_chance" ||
      cellPage.chanceMassAssigned !== false) {
    issues.push("continuous_choice_chance_contract_invalid");
  }
  return [...new Set(issues)].sort();
}

export function buildWarmachineGeometryWitnessCandidatesV1(
  predicatePlan = {},
  options = {},
) {
  const limit = boundedCandidateLimit(options.maximumCandidateCount);
  const sourceRows = [];
  const append = (candidate, sourceKind, sourceKey = "", pathPoints = null) => {
    if (!pointValid(candidate)) return;
    const normalizedPathPoints = Array.isArray(pathPoints) &&
      pathPoints.length >= 2 && pathPoints.every(pointValid)
      ? pathPoints.map(point)
      : null;
    sourceRows.push({
      point: point(candidate),
      sourceKind,
      sourceKey,
      ...(normalizedPathPoints ? { pathPoints: normalizedPathPoints } : {}),
    });
  };
  for (const candidate of options.candidatePoints || []) {
    append(
      candidate.point || candidate,
      "caller_supplied",
      candidate.sourceKey || "",
      candidate.pathPoints || null,
    );
  }
  append(predicatePlan.ruleBehaviorContext?.actorPosition ||
    predicatePlan.actorPosition, "actor_position");
  for (const predicate of predicatePlan.predicates || []) {
    for (const candidate of primitiveCandidatePoints(predicate.primitive)) {
      append(candidate, "predicate_primitive", predicate.predicateKey);
    }
  }
  for (const eventRegion of predicatePlan.eventRegions || []) {
    for (const candidate of primitiveCandidatePoints(eventRegion.primitive)) {
      append(candidate, "event_region_primitive", eventRegion.eventRegionKey);
    }
  }
  const uniqueByPoint = new Map();
  for (const row of sourceRows) {
    const key = `${row.point.xIn}:${row.point.yIn}:${row.pathPoints
      ? stableGraphHash(row.pathPoints)
      : "endpoint"}`;
    if (!uniqueByPoint.has(key)) uniqueByPoint.set(key, row);
  }
  const seedRows = [...uniqueByPoint.values()];
  const xs = [...new Set(seedRows.map((row) => row.point.xIn))].sort((a, b) => a - b);
  const ys = [...new Set(seedRows.map((row) => row.point.yIn))].sort((a, b) => a - b);
  let crossProductTruncated = false;
  crossProduct: // Bounded probes never justify exhausting memory for a completeness-free set.
  for (const xIn of xs) {
    for (const yIn of ys) {
      const key = `${xIn}:${yIn}:endpoint`;
      if (uniqueByPoint.has(key)) continue;
      if (uniqueByPoint.size >= limit) {
        crossProductTruncated = true;
        break crossProduct;
      }
      uniqueByPoint.set(key, {
        point: { xIn, yIn },
        sourceKind: "critical_coordinate_cross_product",
        sourceKey: "",
      });
    }
  }
  const allRows = [...uniqueByPoint.values()];
  const truncated = allRows.length > limit || crossProductTruncated;
  return stableGraphValue({
    candidateCountBeforeLimit: truncated ? null : allRows.length,
    candidateCountBeforeLimitLowerBound: allRows.length,
    candidateCount: Math.min(limit, allRows.length),
    candidateLimit: limit,
    truncated,
    candidates: allRows.slice(0, limit).map((row, index) => ({
      candidateKey: `geometry-witness-${String(index + 1).padStart(4, "0")}`,
      ...row,
    })),
    completenessClaim: false,
    claimBoundary:
      "These deterministic critical-point candidates are existence-witness probes only. Missing a signature does not prove that signature is empty or unreachable.",
  });
}

function validateEndpointEvaluation(receipt = {}, predicatePlan = {}) {
  const { endpointEvaluationHash, ...core } = receipt;
  return receipt.schemaVersion ===
      "warmachine_movement_geometry_endpoint_evaluation_v1" &&
    Boolean(endpointEvaluationHash) &&
    stableGraphHash(core) === endpointEvaluationHash &&
    receipt.predicatePlanHash === predicatePlan.hostPredicatePlanHash &&
    receipt.continuousChoiceKind === "player_choice_not_chance" &&
    receipt.chanceMassAssigned === false;
}

function validatePathEvaluation(receipt = {}, predicatePlan = {}, evaluation = {}) {
  const { pathEvaluationHash, ...core } = receipt;
  return receipt.schemaVersion ===
      "warmachine_movement_geometry_path_evaluation_v1" &&
    Boolean(pathEvaluationHash) &&
    stableGraphHash(core) === pathEvaluationHash &&
    receipt.predicatePlanHash === predicatePlan.hostPredicatePlanHash &&
    receipt.endpointEvaluationHash === evaluation.endpointEvaluationHash &&
    receipt.endpointSignatureHash === evaluation.endpointSignatureHash &&
    receipt.continuousChoiceKind === "player_choice_not_chance" &&
    receipt.chanceMassAssigned === false;
}

function evaluationMatchesCell(evaluation = {}, cell = {}) {
  const predicateByKey = new Map((evaluation.predicateEvaluations || [])
    .map((row) => [row.predicateKey, row]));
  const eventByKey = new Map((evaluation.eventRegionEvaluations || [])
    .map((row) => [row.eventRegionKey, row]));
  return evaluation.ok === true && evaluation.endpointPredicateSatisfied === true &&
    (cell.requiredPredicateAssignment || []).every((expected) =>
      predicateByKey.get(expected.predicateKey)?.satisfied === expected.expected) &&
    (cell.eventRegionAssignment || []).every((expected) =>
      eventByKey.get(expected.eventRegionKey)?.inside === expected.expectedInside);
}

const BASIC_ADVANCE_REDUNDANT_AUDIT_EVENT_TYPES = new Set([
  "rough_terrain_move",
  "move",
  "any_time_activation_window_opened",
]);

function ruleBehaviorEventProjection(transition = {}) {
  const actionType = String(transition.action?.actionType || "");
  const events = transition.events || [];
  const basicAdvanceAuditOnly = actionType === "advance" &&
    events.every((event) => BASIC_ADVANCE_REDUNDANT_AUDIT_EVENT_TYPES.has(
      String(event.eventType || ""),
    ));
  return {
    projectionKind: basicAdvanceAuditOnly
      ? "basic_advance_redundant_audit_events_elided_v1"
      : "conservative_exact_events_v1",
    events: basicAdvanceAuditOnly ? [] : stableGraphValue(events),
    elidedEventTypes: basicAdvanceAuditOnly
      ? events.map((event) => String(event.eventType || ""))
      : [],
    exactEventFallbackUsed: !basicAdvanceAuditOnly,
  };
}

function strictTransitionObservation(transition = {}) {
  const orderedEventTypes = (transition.events || []).map((event) =>
    String(event.eventType || ""));
  const behaviorEvents = ruleBehaviorEventProjection(transition);
  const ruleBehaviorCore = stableGraphValue({
    schemaVersion: "warmachine_geometry_rule_behavior_transition_observation_v1",
    successorRuleBehaviorStateHash: warmachineRuleBehaviorStateHashV1(
      transition.nextState || {},
    ),
    eventProjectionKind: behaviorEvents.projectionKind,
    ruleBehaviorEvents: behaviorEvents.events,
    exactEventFallbackUsed: behaviorEvents.exactEventFallbackUsed,
    claimBoundary:
      "Only a plain advance whose complete event list is confined to move, rough-terrain cost audit and any-time-window audit may elide those events. Continuous movement action identities are alpha-normalized while preserving actor and action kind. Every other event list falls back to exact evidence.",
  });
  const core = stableGraphValue({
    schemaVersion: "warmachine_geometry_strict_transition_observation_v1",
    successorSemanticStateHash: warmachineReverseStateSemanticHashV1(
      transition.nextState || {},
    ),
    orderedEventTypes,
    exactEventTraceHash: stableGraphHash(transition.events || []),
    ruleBehaviorObservation: {
      ...ruleBehaviorCore,
      ruleBehaviorTransitionObservationHash: stableGraphHash(ruleBehaviorCore),
    },
    ruleBehaviorTransitionObservationHash: stableGraphHash(ruleBehaviorCore),
    observationScope:
      "complete_successor_semantic_state_plus_ordered_host_event_types",
    completenessClaim: false,
    claimBoundary:
      "Different observation signatures prove that the containing geometry cell is not transition-stable. Equal signatures among finite witnesses do not prove stability or behavioral equivalence.",
  });
  return {
    ...core,
    transitionObservationHash: stableGraphHash(core),
  };
}

export function buildWarmachineObservedTransitionRefinementLedgerV1(
  parentCellKey = "",
  strictWitnesses = [],
) {
  const grouped = new Map();
  for (const witness of strictWitnesses) {
    const signature = String(witness.transitionObservationHash || "");
    if (!signature) continue;
    if (!grouped.has(signature)) grouped.set(signature, []);
    grouped.get(signature).push(witness);
  }
  const observedClasses = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([transitionObservationHash, witnesses], index) => stableGraphValue({
      observedClassKey: `${parentCellKey}:observed-transition:${String(index + 1)
        .padStart(3, "0")}`,
      transitionObservationHash,
      successorSemanticStateHashes: [...new Set(witnesses.map((witness) =>
        String(witness.stateSemanticHashAfter || "")))].sort(),
      orderedEventTypeSequences: [...new Map(witnesses.map((witness) => {
        const sequence = witness.transitionObservation?.orderedEventTypes || [];
        return [stableGraphHash(sequence), sequence];
      })).values()],
      strictWitnessHashes: witnesses.map((witness) =>
        String(witness.strictWitnessHash || "")).sort(),
      exactObservedWitnessCount: witnesses.length,
      membershipScope: "finite_strict_witnesses_only",
      geometricRegionProven: false,
    }));
  const successorSignatureCount = new Set(observedClasses.flatMap((row) =>
    row.successorSemanticStateHashes)).size;
  const eventSequenceCount = new Set(observedClasses.flatMap((row) =>
    row.orderedEventTypeSequences.map((sequence) => stableGraphHash(sequence)))).size;
  const requiredNextPredicateKinds = [
    ...(eventSequenceCount > 1 ? ["ordered_host_event_sequence"] : []),
    ...(successorSignatureCount > 1 ? ["successor_semantic_state_relation"] : []),
  ];
  const core = stableGraphValue({
    schemaVersion: "warmachine_observed_transition_refinement_ledger_v1",
    parentCellKey,
    observedClassCount: observedClasses.length,
    observedClasses,
    observedTransitionVariation: observedClasses.length > 1,
    requiredNextPredicateKinds,
    unresolvedContinuousRemainder: {
      disposition: "unresolved_unobserved_continuous_remainder",
      emptyProven: false,
      unreachableProven: false,
      chanceMass: null,
    },
    refinementComplete: false,
    transitionStabilityProven: false,
    continuousChoiceKind: "player_choice_not_chance",
    chanceMassAssigned: false,
    claimBoundary:
      "Observed classes group only executed strict witnesses. They identify counterexamples and refinement axes, while every unobserved endpoint and path remains in an unresolved continuous remainder.",
  });
  return {
    ...core,
    refinementLedgerHash: stableGraphHash(core),
  };
}

function executeStrictRepresentative(
  inputState,
  predicatePlan,
  candidate,
  evaluation,
  attemptIndex,
  exactSuppliedPathOnly = false,
) {
  const actorPieceKey = String(predicatePlan.actorPieceKey || "");
  const actionType = String(predicatePlan.actionType || "advance");
  const pathPlan = buildRulesV1MovementPathProposalPlan(inputState, {
    actorPieceKey,
    actionType,
    destination: candidate.point,
    targetKey: candidate.candidateKey,
    keyBase: candidate.candidateKey,
  });
  const suppliedPathProposal = Array.isArray(candidate.pathPoints)
    ? [{
      proposalKey: `${candidate.candidateKey}-caller-path-probe`,
      proposalKind: "search_path_probe_requires_host_validation",
      pathPoints: candidate.pathPoints,
      waypoints: candidate.pathPoints.slice(1),
      precheckPassed: null,
      precheckReasons: [],
    }]
    : [];
  const proposals = (exactSuppliedPathOnly
    ? suppliedPathProposal
    : [...suppliedPathProposal, ...(pathPlan.proposals || [])])
    .filter((proposal, index, rows) => rows.findIndex((candidateProposal) =>
      stableGraphHash(candidateProposal.pathPoints || []) ===
        stableGraphHash(proposal.pathPoints || [])) === index);
  const attempts = [];
  for (const [proposalIndex, proposal] of proposals.entries()) {
    if (proposal.precheckPassed !== true &&
        proposal.proposalKind !== "search_path_probe_requires_host_validation") {
      attempts.push({
        proposalIndex,
        proposalKey: String(proposal.proposalKey || ""),
        status: "host_path_precheck_rejected",
        reasons: proposal.precheckReasons || [],
      });
      continue;
    }
    const pathEvaluation = evaluateRulesV1MovementGeometryPath(inputState, {
      actorPieceKey,
      actionType,
      pathPoints: proposal.pathPoints,
    });
    const pathEvaluationReceiptValid = validatePathEvaluation(
      pathEvaluation,
      predicatePlan,
      evaluation,
    );
    if (!pathEvaluationReceiptValid ||
        pathEvaluation.pathStrictPrecheckPassed !== true) {
      attempts.push({
        proposalIndex,
        proposalKey: String(proposal.proposalKey || ""),
        status: pathEvaluationReceiptValid
          ? "host_path_evaluation_precheck_rejected"
          : "host_path_evaluation_receipt_invalid",
        pathEvaluationHash: String(pathEvaluation.pathEvaluationHash || ""),
        pathSignatureHash: String(pathEvaluation.pathSignatureHash || ""),
        blockerKey: String(pathEvaluation.blocker?.blockerPieceKey ||
          pathEvaluation.blocker?.pieceKey ||
          pathEvaluation.blocker?.terrainKey || ""),
      });
      continue;
    }
    const parameterized = materializeRulesV1ParameterizedMovementAction(
      inputState,
      {
        actorPieceKey,
        actionType,
        pathPoints: proposal.pathPoints,
      },
    );
    const parameterizedReceipt = parameterized.parameterizedActionReceipt || {};
    const { parameterizedActionReceiptHash, ...parameterizedCore } =
      parameterizedReceipt;
    const parameterizedReceiptValid =
      parameterizedReceipt.schemaVersion ===
        "warmachine_parameterized_movement_action_v1" &&
      Boolean(parameterizedActionReceiptHash) &&
      stableGraphHash(parameterizedCore) === parameterizedActionReceiptHash &&
      parameterized.pathEvaluation?.pathEvaluationHash ===
        pathEvaluation.pathEvaluationHash;
    const expectedActionKey = String(parameterized.expectedActionKey || "");
    const enumeration = parameterized.enumeration;
    const action = parameterized.action;
    if (!parameterizedReceiptValid || parameterized.ok !== true ||
        !enumeration || !action) {
      attempts.push({
        proposalIndex,
        proposalKey: String(proposal.proposalKey || ""),
        expectedActionKey,
        status: parameterizedReceiptValid
          ? "host_parameterized_action_not_enumerated"
          : "host_parameterized_action_receipt_invalid",
        parameterizedActionReceiptHash:
          String(parameterizedActionReceiptHash || ""),
        rejectedAction: stableGraphValue(parameterized.rejectedAction || null),
        issues: parameterized.issues || [],
      });
      continue;
    }
    const transition = applyRulesV1Action(enumeration.state, {
      ...action,
      __warmachineTrustedRulesV1Enumeration: enumeration,
    });
    const finalActor = transition.nextState?.pieces?.find((piece) =>
      piece.pieceKey === actorPieceKey) || null;
    const finalPositionMatches = Boolean(finalActor) &&
      Math.abs(Number(finalActor.position?.xIn) - Number(candidate.point.xIn)) <= 0.001 &&
      Math.abs(Number(finalActor.position?.yIn) - Number(candidate.point.yIn)) <= 0.001;
    attempts.push({
      proposalIndex,
      proposalKey: String(proposal.proposalKey || ""),
      pathEvaluationHash: pathEvaluation.pathEvaluationHash,
      pathSignatureHash: pathEvaluation.pathSignatureHash,
      expectedActionKey,
      parameterizedActionReceiptHash,
      status: transition.ok === true && finalPositionMatches
        ? "strict_transition_accepted"
        : "strict_transition_rejected_or_destination_mismatch",
      transitionOk: transition.ok === true,
      finalPositionMatches,
      reason: String(transition.reason || ""),
    });
    if (transition.ok !== true || !finalPositionMatches) continue;
    const transitionObservation = strictTransitionObservation(transition);
    const receiptCore = stableGraphValue({
      schemaVersion: "warmachine_geometry_strict_movement_witness_v1",
      candidate,
      endpointEvaluationHash: evaluation.endpointEvaluationHash,
      endpointSignatureHash: evaluation.endpointSignatureHash,
      pathEvaluationHash: pathEvaluation.pathEvaluationHash,
      pathSignatureHash: pathEvaluation.pathSignatureHash,
      pathGeometryHash: pathEvaluation.pathGeometryHash,
      orderedEventSignatureHash: pathEvaluation.orderedEventSignatureHash,
      hostPathEvaluation: pathEvaluation,
      hostParameterizedActionReceipt: parameterizedReceipt,
      hostPathPlan: pathPlan,
      selectedProposalIndex: proposalIndex,
      selectedProposal: proposal,
      actionKey: action.actionKey,
      action: stableGraphValue(action),
      strictTransitionAccepted: true,
      finalPositionMatches: true,
      eventTypes: (transition.events || []).map((event) => event.eventType),
      stateHashBefore: stableGraphHash(enumeration.state),
      stateHashAfter: stableGraphHash(transition.nextState),
      stateSemanticHashBefore: warmachineReverseStateSemanticHashV1(enumeration.state),
      stateSemanticHashAfter: transitionObservation.successorSemanticStateHash,
      transitionObservation,
      transitionObservationHash: transitionObservation.transitionObservationHash,
      ruleBehaviorTransitionObservationHash:
        transitionObservation.ruleBehaviorTransitionObservationHash,
      continuousChoiceKind: "player_choice_not_chance",
      chanceMassAssigned: false,
      claimBoundary:
        "This receipt proves one concrete endpoint and Host-proposed path execute through the current strict rules engine. It does not prove the whole Boolean signature is connected, transition-stable or exhaustively represented.",
    });
    return {
      accepted: true,
      attempts,
      receipt: {
        ...receiptCore,
        strictWitnessHash: stableGraphHash(receiptCore),
      },
    };
  }
  return { accepted: false, attempts, receipt: null };
}

export function materializeWarmachineStrictMovementPathWitnessV1(
  inputState = {},
  predicatePlan = {},
  options = {},
) {
  const { predicatePlanReceiptHash, ...predicateCore } = predicatePlan;
  const candidateKey = String(options.candidateKey ||
    "fixed-endpoint-path-witness");
  const pathPoints = Array.isArray(options.pathPoints) &&
    options.pathPoints.length >= 2 && options.pathPoints.every(pointValid)
    ? options.pathPoints.map(point)
    : [];
  const destination = pathPoints.at(-1) || null;
  const validationIssues = [
    ...(predicatePlan.schemaVersion !==
      WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA
      ? ["strict_path_witness_predicate_plan_schema_invalid"]
      : []),
    ...(!predicatePlanReceiptHash ||
      stableGraphHash(predicateCore) !== predicatePlanReceiptHash
      ? ["strict_path_witness_predicate_plan_hash_invalid"]
      : []),
    ...(predicatePlan.continuousChoiceKind !== "player_choice_not_chance" ||
      predicatePlan.chanceMassAssigned !== false
      ? ["strict_path_witness_chance_contract_invalid"]
      : []),
    ...(pathPoints.length < 2
      ? ["strict_path_witness_path_points_invalid"]
      : []),
  ];
  const endpointEvaluation = destination
    ? evaluateRulesV1MovementGeometryEndpoint(inputState, {
      actorPieceKey: predicatePlan.actorPieceKey,
      actionType: predicatePlan.actionType,
      destination,
    })
    : null;
  if (endpointEvaluation &&
      (!validateEndpointEvaluation(endpointEvaluation, predicatePlan) ||
       endpointEvaluation.endpointPredicateSatisfied !== true)) {
    validationIssues.push("strict_path_witness_endpoint_evaluation_invalid");
  }
  const candidate = stableGraphValue({
    candidateKey,
    point: destination || {},
    sourceKind: "proof_carrying_fixed_endpoint_path",
    sourceKey: String(options.sourceKey || ""),
    pathPoints,
  });
  const executed = validationIssues.length || !endpointEvaluation
    ? { accepted: false, attempts: [], receipt: null }
    : executeStrictRepresentative(
      inputState,
      predicatePlan,
      candidate,
      endpointEvaluation,
      0,
      true,
    );
  const issues = [...new Set([
    ...validationIssues,
    ...(executed.accepted
      ? []
      : ["strict_path_witness_not_executed"]),
  ])].sort();
  const core = stableGraphValue({
    schemaVersion: "warmachine_strict_movement_path_witness_receipt_v1",
    ok: issues.length === 0,
    predicatePlanReceiptHash: String(predicatePlanReceiptHash || ""),
    candidate,
    endpointEvaluationHash: String(
      endpointEvaluation?.endpointEvaluationHash || "",
    ),
    strictWitness: executed.receipt,
    strictWitnessHash: String(executed.receipt?.strictWitnessHash || ""),
    attempts: executed.attempts,
    issues,
    continuousChoiceKind: "player_choice_not_chance",
    chanceMassAssigned: false,
    claimBoundary:
      "This receipt proves one supplied quantized movement path executes through the current Engine. It does not prove a complete endpoint set, path-class denominator, transition stability or strategy value.",
  });
  return {
    ...core,
    strictPathWitnessReceiptHash: stableGraphHash(core),
  };
}

export function materializeWarmachineGeometryCellRepresentativesV1(
  inputState = {},
  predicatePlan = {},
  cellPage = {},
  options = {},
) {
  const validationIssues = validateInputs(predicatePlan, cellPage);
  const candidateSet = buildWarmachineGeometryWitnessCandidatesV1(
    predicatePlan,
    options,
  );
  const attemptLimit = boundedAttemptLimit(options.maximumStrictAttemptsPerCell);
  const witnessLimit = boundedAttemptLimit(options.maximumStrictWitnessesPerCell);
  const evaluations = candidateSet.candidates.map((candidate) => {
    const endpointEvaluation = evaluateRulesV1MovementGeometryEndpoint(
      inputState,
      {
        actorPieceKey: predicatePlan.actorPieceKey,
        actionType: predicatePlan.actionType,
        destination: candidate.point,
      },
    );
    return {
      candidate,
      endpointEvaluation,
      receiptValid: validateEndpointEvaluation(endpointEvaluation, predicatePlan),
    };
  });
  const cells = [];
  for (const cell of cellPage.cells || []) {
    const matching = evaluations.filter((row) =>
      row.receiptValid && evaluationMatchesCell(row.endpointEvaluation, cell));
    const strictAttempts = [];
    const strictWitnesses = [];
    const observedPathSignatures = new Set();
    for (const [attemptIndex, row] of matching.slice(0, attemptLimit).entries()) {
      const executed = executeStrictRepresentative(
        inputState,
        predicatePlan,
        row.candidate,
        row.endpointEvaluation,
        attemptIndex,
      );
      strictAttempts.push(...executed.attempts.map((attempt) => ({
        candidateKey: row.candidate.candidateKey,
        ...attempt,
      })));
      if (executed.accepted &&
          !observedPathSignatures.has(executed.receipt.pathSignatureHash)) {
        observedPathSignatures.add(executed.receipt.pathSignatureHash);
        strictWitnesses.push(executed.receipt);
        if (strictWitnesses.length >= witnessLimit) break;
      }
    }
    const strictWitness = strictWitnesses[0] || null;
    const observedTransitionSignatures = [...new Set(strictWitnesses.map((witness) =>
      witness.transitionObservationHash))].sort();
    const observedTransitionVariation = observedTransitionSignatures.length > 1;
    const transitionRefinementLedger =
      buildWarmachineObservedTransitionRefinementLedgerV1(
        cell.cellKey,
        strictWitnesses,
      );
    cells.push(stableGraphValue({
      cellKey: cell.cellKey,
      signatureIndex: cell.signatureIndex,
      matchingCandidateCount: matching.length,
      strictCandidateAttemptCount: Math.min(matching.length, attemptLimit),
      strictRepresentativeStatus: strictWitness
        ? "strict_existence_witness_found"
        : "unresolved_no_strict_witness_found",
      disposition: strictWitness
        ? observedTransitionVariation
          ? "represented_with_observed_transition_variation_requires_refinement"
          : "represented_but_cell_and_transition_stability_unresolved"
        : "unresolved_not_proven_empty_or_unreachable",
      strictWitness,
      strictWitnesses,
      observedStrictPathSignatureCount: strictWitnesses.length,
      observedTransitionSignatureCount: observedTransitionSignatures.length,
      observedTransitionSignatures,
      observedTransitionVariation,
      transitionRefinementLedger,
      transitionRefinementLedgerHash:
        transitionRefinementLedger.refinementLedgerHash,
      pathClassCoverageComplete: false,
      transitionStabilityCounterexampleFound: observedTransitionVariation,
      strictAttempts,
      chanceMass: null,
      emptyCellProven: false,
      unreachableCellProven: false,
    }));
  }
  const representedCellCount = cells.filter((cell) =>
    cell.strictRepresentativeStatus === "strict_existence_witness_found").length;
  const unresolvedCellCount = cells.length - representedCellCount;
  const observedStrictPathSignatureCount = cells.reduce((sum, cell) =>
    sum + Number(cell.observedStrictPathSignatureCount || 0), 0);
  const observedTransitionSignatureCount = cells.reduce((sum, cell) =>
    sum + Number(cell.observedTransitionSignatureCount || 0), 0);
  const transitionCounterexampleCellCount = cells.filter((cell) =>
    cell.transitionStabilityCounterexampleFound === true).length;
  const unresolvedTransitionRefinementRemainderCount = cells.filter((cell) =>
    cell.transitionRefinementLedger?.unresolvedContinuousRemainder?.disposition ===
      "unresolved_unobserved_continuous_remainder").length;
  const invalidEvaluationReceiptCount = evaluations.filter((row) =>
    !row.receiptValid).length;
  const completionDebts = [
    ...validationIssues,
    ...(candidateSet.truncated ? ["existence_witness_candidate_set_truncated"] : []),
    ...(invalidEvaluationReceiptCount
      ? ["host_endpoint_evaluation_receipt_invalid"]
      : []),
    ...(unresolvedCellCount ? ["declared_signatures_without_strict_witness"] : []),
    ...(transitionCounterexampleCellCount
      ? ["observed_transition_variation_requires_refinement"]
      : []),
    "finite_candidate_failure_does_not_prove_empty_signature",
    "connected_components_not_partitioned",
    "path_classes_not_partitioned",
    "transition_stability_not_proven",
  ];
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_GEOMETRY_STRICT_REPRESENTATIVE_V1_SCHEMA,
    ok: validationIssues.length === 0 && invalidEvaluationReceiptCount === 0,
    predicatePlanReceiptHash: String(predicatePlan.predicatePlanReceiptHash || ""),
    cellPartitionPageHash: String(cellPage.cellPartitionPageHash || ""),
    hostReceiptHash: String(predicatePlan.hostReceiptHash || ""),
    ruleBehaviorContextHash: String(predicatePlan.ruleBehaviorContextHash || ""),
    strategyComparisonContextHash:
      String(predicatePlan.strategyComparisonContextHash || ""),
    candidateSet,
    evaluatedCandidateCount: evaluations.length,
    validEndpointEvaluationReceiptCount:
      evaluations.length - invalidEvaluationReceiptCount,
    invalidEndpointEvaluationReceiptCount: invalidEvaluationReceiptCount,
    pageCellCount: cells.length,
    representedCellCount,
    unresolvedCellCount,
    observedStrictPathSignatureCount,
    observedTransitionSignatureCount,
    transitionCounterexampleCellCount,
    unresolvedTransitionRefinementRemainderCount,
    cells,
    completionDebts: [...new Set(completionDebts)].sort(),
    declaredSignatureStrictWitnessCoverageComplete:
      cells.length > 0 && unresolvedCellCount === 0,
    strictRepresentativeCoverageComplete: false,
    geometricNonemptinessComplete: false,
    connectedComponentPartitionComplete: false,
    pathClassPartitionComplete: false,
    transitionStable: false,
    ruleBehaviorQuotientComplete: false,
    continuousChoiceKind: "player_choice_not_chance",
    chanceMassAssigned: false,
    claimBoundary:
      "Strict witnesses establish existence for represented endpoint signatures only. A bounded candidate miss remains unresolved, all continuous choices carry no Chance mass, and no cell, path-class, transition-stability, Q_rule or strategy completeness claim is made.",
  });
  return {
    ...core,
    strictRepresentativeReceiptHash: stableGraphHash(core),
  };
}
