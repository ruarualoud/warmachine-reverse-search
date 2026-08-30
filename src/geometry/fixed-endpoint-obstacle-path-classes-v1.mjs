import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  evaluateRulesV1MovementGeometryEndpoint,
  normalizeRulesV1State,
} from "../warmachine-host-runtime.mjs";
import { WARMACHINE_GEOMETRY_CELL_PARTITION_V1_SCHEMA } from
  "./cell-partition-v1.mjs";
import { WARMACHINE_ENDPOINT_CELL_CONNECTIVITY_V1_SCHEMA } from
  "./cell-connectivity-v1.mjs";
import { WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA } from
  "./predicate-plan-v1.mjs";
import {
  materializeWarmachineStrictMovementPathWitnessV1,
  WARMACHINE_GEOMETRY_STRICT_REPRESENTATIVE_V1_SCHEMA,
} from "./strict-representative-v1.mjs";

export const WARMACHINE_FIXED_ENDPOINT_OBSTACLE_PATH_CLASSES_V1_SCHEMA =
  "warmachine_fixed_endpoint_obstacle_path_classes_v1";

const THEOREM_KEY =
  "single_interior_rectangle_antipodal_endpoint_bounded_winding_classes_v1";
const EPSILON = 1e-6;

function receiptValid(value = {}, hashKey = "") {
  const hash = String(value[hashKey] || "");
  if (!hash) return false;
  const core = { ...value };
  delete core[hashKey];
  return stableGraphHash(core) === hash;
}

function uniqueSorted(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function quantizedPoint(value = {}) {
  return {
    xIn: Math.round(Number(value.xIn) * 100) / 100,
    yIn: Math.round(Number(value.yIn) * 100) / 100,
  };
}

function close(left, right, tolerance = 0.001) {
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function wrapSignedAngle(radians) {
  let result = Number(radians);
  while (result <= -Math.PI) result += Math.PI * 2;
  while (result > Math.PI) result -= Math.PI * 2;
  return result;
}

function angularLiftDelta(pathPoints = [], center = {}) {
  let result = 0;
  for (let index = 0; index < pathPoints.length - 1; index += 1) {
    const from = pathPoints[index];
    const to = pathPoints[index + 1];
    const fromAngle = Math.atan2(
      Number(from.yIn) - Number(center.yIn),
      Number(from.xIn) - Number(center.xIn),
    );
    const toAngle = Math.atan2(
      Number(to.yIn) - Number(center.yIn),
      Number(to.xIn) - Number(center.xIn),
    );
    result += wrapSignedAngle(toAngle - fromAngle);
  }
  return result;
}

function endpointMatchesCell(evaluation = {}, cell = {}) {
  const predicates = new Map((evaluation.predicateEvaluations || []).map((row) =>
    [String(row.predicateKey || ""), row]));
  const events = new Map((evaluation.eventRegionEvaluations || []).map((row) =>
    [String(row.eventRegionKey || ""), row]));
  return evaluation.ok === true && evaluation.endpointPredicateSatisfied === true &&
    (cell.requiredPredicateAssignment || []).every((row) =>
      predicates.get(String(row.predicateKey || ""))?.satisfied === row.expected) &&
    (cell.eventRegionAssignment || []).every((row) =>
      events.get(String(row.eventRegionKey || ""))?.inside === row.expectedInside);
}

function validateInputs(
  predicatePlan = {},
  cellPage = {},
  representatives = {},
  connectivity = {},
) {
  const issues = [];
  if (predicatePlan.schemaVersion !== WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA ||
      !receiptValid(predicatePlan, "predicatePlanReceiptHash")) {
    issues.push("obstacle_path_predicate_plan_invalid");
  }
  if (cellPage.schemaVersion !== WARMACHINE_GEOMETRY_CELL_PARTITION_V1_SCHEMA ||
      !receiptValid(cellPage, "cellPartitionPageHash")) {
    issues.push("obstacle_path_cell_page_invalid");
  }
  if (representatives.schemaVersion !==
      WARMACHINE_GEOMETRY_STRICT_REPRESENTATIVE_V1_SCHEMA ||
      !receiptValid(representatives, "strictRepresentativeReceiptHash")) {
    issues.push("obstacle_path_representatives_invalid");
  }
  if (connectivity.schemaVersion !==
      WARMACHINE_ENDPOINT_CELL_CONNECTIVITY_V1_SCHEMA ||
      !receiptValid(connectivity, "endpointConnectivityReceiptHash")) {
    issues.push("obstacle_path_connectivity_invalid");
  }
  if (cellPage.predicatePlanReceiptHash !== predicatePlan.predicatePlanReceiptHash ||
      representatives.predicatePlanReceiptHash !==
        predicatePlan.predicatePlanReceiptHash ||
      connectivity.predicatePlanReceiptHash !==
        predicatePlan.predicatePlanReceiptHash ||
      representatives.cellPartitionPageHash !== cellPage.cellPartitionPageHash ||
      connectivity.cellPartitionPageHash !== cellPage.cellPartitionPageHash ||
      connectivity.strictRepresentativeReceiptHash !==
        representatives.strictRepresentativeReceiptHash) {
    issues.push("obstacle_path_receipt_binding_mismatch");
  }
  if (predicatePlan.continuousChoiceKind !== "player_choice_not_chance" ||
      cellPage.continuousChoiceKind !== "player_choice_not_chance" ||
      representatives.continuousChoiceKind !== "player_choice_not_chance" ||
      connectivity.continuousChoiceKind !== "player_choice_not_chance" ||
      predicatePlan.chanceMassAssigned !== false ||
      cellPage.chanceMassAssigned !== false ||
      representatives.chanceMassAssigned !== false ||
      connectivity.chanceMassAssigned !== false) {
    issues.push("obstacle_path_chance_contract_invalid");
  }
  return uniqueSorted(issues);
}

function antipodalAxis(start = {}, destination = {}, bounds = {}) {
  const center = {
    xIn: (Number(bounds.left) + Number(bounds.right)) / 2,
    yIn: (Number(bounds.top) + Number(bounds.bottom)) / 2,
  };
  const horizontal = close(start.yIn, center.yIn) &&
    close(destination.yIn, center.yIn) && (
      (Number(start.xIn) < Number(bounds.left) - EPSILON &&
       Number(destination.xIn) > Number(bounds.right) + EPSILON) ||
      (Number(start.xIn) > Number(bounds.right) + EPSILON &&
       Number(destination.xIn) < Number(bounds.left) - EPSILON)
    );
  const vertical = close(start.xIn, center.xIn) &&
    close(destination.xIn, center.xIn) && (
      (Number(start.yIn) < Number(bounds.top) - EPSILON &&
       Number(destination.yIn) > Number(bounds.bottom) + EPSILON) ||
      (Number(start.yIn) > Number(bounds.bottom) + EPSILON &&
       Number(destination.yIn) < Number(bounds.top) - EPSILON)
    );
  return {
    center,
    axis: horizontal ? "horizontal" : vertical ? "vertical" : "",
  };
}

function canonicalDetours(start, destination, bounds, axis, clearanceIn) {
  const clearance = Math.max(0.01, Math.round(clearanceIn * 100) / 100);
  if (axis === "horizontal") {
    const startOnLeft = Number(start.xIn) < Number(bounds.left);
    const firstX = startOnLeft
      ? Number(bounds.left) - clearance
      : Number(bounds.right) + clearance;
    const secondX = startOnLeft
      ? Number(bounds.right) + clearance
      : Number(bounds.left) - clearance;
    return [
      [
        quantizedPoint(start),
        quantizedPoint({ xIn: firstX, yIn: Number(bounds.top) - clearance }),
        quantizedPoint({ xIn: secondX, yIn: Number(bounds.top) - clearance }),
        quantizedPoint(destination),
      ],
      [
        quantizedPoint(start),
        quantizedPoint({ xIn: firstX, yIn: Number(bounds.bottom) + clearance }),
        quantizedPoint({ xIn: secondX, yIn: Number(bounds.bottom) + clearance }),
        quantizedPoint(destination),
      ],
    ];
  }
  const startAbove = Number(start.yIn) < Number(bounds.top);
  const firstY = startAbove
    ? Number(bounds.top) - clearance
    : Number(bounds.bottom) + clearance;
  const secondY = startAbove
    ? Number(bounds.bottom) + clearance
    : Number(bounds.top) - clearance;
  return [
    [
      quantizedPoint(start),
      quantizedPoint({ xIn: Number(bounds.left) - clearance, yIn: firstY }),
      quantizedPoint({ xIn: Number(bounds.left) - clearance, yIn: secondY }),
      quantizedPoint(destination),
    ],
    [
      quantizedPoint(start),
      quantizedPoint({ xIn: Number(bounds.right) + clearance, yIn: firstY }),
      quantizedPoint({ xIn: Number(bounds.right) + clearance, yIn: secondY }),
      quantizedPoint(destination),
    ],
  ];
}

export function certifyWarmachineFixedEndpointObstaclePathClassesV1(
  inputState = {},
  predicatePlan = {},
  cellPage = {},
  representatives = {},
  connectivity = {},
  options = {},
) {
  const validationIssues = validateInputs(
    predicatePlan,
    cellPage,
    representatives,
    connectivity,
  );
  const state = normalizeRulesV1State(inputState);
  const actor = (state.pieces || []).find((piece) =>
    piece.pieceKey === predicatePlan.actorPieceKey &&
    piece.removedFromPlay !== true && piece.destroyed !== true &&
    Number(piece.damage?.boxesRemaining || 0) > 0) || null;
  const destination = finite(options.destination?.xIn) &&
    finite(options.destination?.yIn)
    ? quantizedPoint(options.destination)
    : null;
  const endpointEvaluation = actor && destination
    ? evaluateRulesV1MovementGeometryEndpoint(state, {
      actorPieceKey: actor.pieceKey,
      actionType: predicatePlan.actionType,
      destination,
    })
    : null;
  const predicateByKey = new Map((predicatePlan.predicates || []).map((row) =>
    [String(row.predicateKey || ""), row]));
  const board = predicateByKey.get("endpoint_within_board_after_base_inset") || null;
  const allowance = predicateByKey.get("endpoint_within_movement_allowance") || null;
  const obstaclePredicates = (predicatePlan.predicates || []).filter((row) =>
    String(row.predicateKey || "").startsWith("endpoint_outside:"));
  const obstaclePredicate = obstaclePredicates[0] || null;
  const obstacle = (predicatePlan.configurationObstacles || [])[0] || null;
  const bounds = obstacle?.primitive?.bounds || null;
  const cellsMatchingEndpoint = endpointEvaluation
    ? (cellPage.cells || []).filter((cell) =>
      endpointMatchesCell(endpointEvaluation, cell))
    : [];
  const cell = cellsMatchingEndpoint[0] || null;
  const connectivityCell = (connectivity.cells || []).find((row) =>
    row.cellKey === cell?.cellKey) || null;
  const start = actor?.position ? quantizedPoint(actor.position) : null;
  const axisEvidence = start && destination && bounds
    ? antipodalAxis(start, destination, bounds)
    : { center: null, axis: "" };
  const widthIn = bounds
    ? Number(bounds.right) - Number(bounds.left)
    : 0;
  const heightIn = bounds
    ? Number(bounds.bottom) - Number(bounds.top)
    : 0;
  const obstacleInradiusIn = Math.min(widthIn, heightIn) / 2;
  const movementAllowanceIn = Number(allowance?.primitive?.radiusIn || 0);
  const additionalWindingClassLowerBoundIn = obstacleInradiusIn * Math.PI * 3;
  const domainReasons = [
    ...(!actor ? ["obstacle_path_actor_missing"] : []),
    ...(!destination ? ["obstacle_path_destination_invalid"] : []),
    ...(!["advance", "run"].includes(String(predicatePlan.actionType || ""))
      ? ["obstacle_path_normal_movement_only"]
      : []),
    ...(predicatePlan.endpointPredicatePlanExact === true
      ? []
      : ["obstacle_path_endpoint_plan_not_exact"]),
    ...((predicatePlan.eventRegions || []).length === 0
      ? []
      : ["obstacle_path_event_regions_present"]),
    ...((predicatePlan.wildcardDebts || []).length === 0
      ? []
      : ["obstacle_path_wildcard_debts_present"]),
    ...((predicatePlan.predicates || []).length === 3 &&
        board?.primitive?.primitiveKind === "axis_aligned_rectangle_inclusion" &&
        allowance?.primitive?.primitiveKind === "circle_inclusion" &&
        obstaclePredicates.length === 1 &&
        obstaclePredicate?.primitive?.primitiveKind ===
          "axis_aligned_rectangle_exclusion"
      ? []
      : ["obstacle_path_canonical_predicate_family_mismatch"]),
    ...((predicatePlan.configurationObstacles || []).length === 1 &&
        bounds &&
        stableGraphHash(obstacle?.primitive || {}) ===
          stableGraphHash(obstaclePredicate?.primitive || {})
      ? []
      : ["obstacle_path_single_rectangle_binding_missing"]),
    ...(String(allowance?.primitive?.geometryModel || "") ===
        "host_rule_atom_adjusted_movement_allowance_v1" &&
        close(start?.xIn, allowance?.primitive?.center?.xIn) &&
        close(start?.yIn, allowance?.primitive?.center?.yIn)
      ? []
      : ["obstacle_path_allowance_not_actor_centered"]),
    ...(cellPage.nextCursor === null &&
        String(cellPage.cursor || "0") === "0" &&
        cellPage.predicateSignaturePartitionComplete === true &&
        (cellPage.cells || []).length === 1
      ? []
      : ["obstacle_path_signature_denominator_not_single_complete_cell"]),
    ...(cellsMatchingEndpoint.length === 1 &&
        endpointEvaluation?.endpointPredicateSatisfied === true
      ? []
      : ["obstacle_path_endpoint_cell_binding_missing"]),
    ...(connectivity.endpointConstraintConnectivityComplete === true &&
        connectivityCell?.endpointConstraintConnectivityCertified === true &&
        connectivityCell?.connectivityProof?.theoremKey ===
          "convex_domain_minus_strictly_interior_convex_union_with_zero_first_nerve_homology_is_path_connected_v1" &&
        (connectivityCell?.strictInteriorEvidence || []).length === 2 &&
        (connectivityCell?.strictInteriorEvidence || []).every((row) =>
          row.proven === true)
      ? []
      : ["obstacle_path_strict_interior_connectivity_proof_missing"]),
    ...(axisEvidence.axis ? [] : ["obstacle_path_endpoints_not_antipodal"]),
    ...(obstacleInradiusIn > EPSILON
      ? []
      : ["obstacle_path_inradius_not_positive"]),
    ...(movementAllowanceIn + 0.001 < additionalWindingClassLowerBoundIn
      ? []
      : ["obstacle_path_additional_winding_classes_not_excluded"]),
  ];
  const preconditionsSatisfied = validationIssues.length === 0 &&
    domainReasons.length === 0;
  const detours = preconditionsSatisfied
    ? canonicalDetours(
      start,
      destination,
      bounds,
      axisEvidence.axis,
      Number(options.clearanceIn ?? 0.01),
    )
    : [];
  const witnessReceipts = detours.map((pathPoints, index) =>
    materializeWarmachineStrictMovementPathWitnessV1(
      state,
      predicatePlan,
      {
        candidateKey: `obstacle-path-class-${index + 1}`,
        sourceKey: THEOREM_KEY,
        pathPoints,
      },
    ));
  const pathClasses = witnessReceipts.map((receipt, index) => {
    const pathPoints = receipt.candidate?.pathPoints || detours[index] || [];
    const liftDeltaRadians = angularLiftDelta(pathPoints, axisEvidence.center || {});
    return stableGraphValue({
      pathClassKey: liftDeltaRadians > 0
        ? "counterclockwise_half_turn"
        : "clockwise_half_turn",
      angularLiftDeltaRadians: liftDeltaRadians,
      angularLiftMultipleOfPi: liftDeltaRadians / Math.PI,
      canonicalPathPoints: pathPoints,
      strictPathWitnessReceiptHash: String(
        receipt.strictPathWitnessReceiptHash || "",
      ),
      strictWitnessHash: String(receipt.strictWitnessHash || ""),
      strictTransitionAccepted: receipt.ok === true,
      movementCostIn: Number(
        receipt.strictWitness?.hostPathEvaluation?.movementCost?.costIn || 0,
      ),
    });
  });
  const pathClassKeys = uniqueSorted(pathClasses.map((row) => row.pathClassKey));
  const witnessReasons = [
    ...(witnessReceipts.length === 2 && witnessReceipts.every((row) => row.ok === true)
      ? []
      : ["obstacle_path_canonical_strict_witness_missing"]),
    ...(pathClassKeys.length === 2 &&
        pathClasses.every((row) => close(
          Math.abs(row.angularLiftDeltaRadians),
          Math.PI,
          1e-8,
        ))
      ? []
      : ["obstacle_path_half_turn_class_identity_invalid"]),
  ];
  const unsupportedReasons = uniqueSorted([...domainReasons, ...witnessReasons]);
  const fixedEndpointPathClassComplete = validationIssues.length === 0 &&
    unsupportedReasons.length === 0;
  const topologyProof = fixedEndpointPathClassComplete
    ? stableGraphValue({
      theoremKey: THEOREM_KEY,
      assumptions: [
        "the_outer_working_domain_is_convex",
        "one_axis_aligned_rectangle_is_strictly_inside_the_outer_domain",
        "start_and_fixed_endpoint_are_antipodal_about_the_obstacle_center",
        "legal_path_length_is_bounded_by_the_host_movement_allowance",
        "the_obstacle_contains_the_closed_centered_disk_of_its_inradius",
      ],
      pathClassIndex:
        "angular_lift_delta_equals_odd_integer_multiple_of_pi",
      lengthLowerBound:
        "path_length_is_at_least_obstacle_inradius_times_absolute_angular_lift_delta",
      exclusion:
        "allowance_below_three_pi_times_inradius_excludes_every_class_except_plus_or_minus_pi",
      strictExistence:
        "one_quantized_clockwise_and_one_quantized_counterclockwise_path_strictly_execute",
      exactPathClassCount: 2,
      obstacleInradiusIn,
      movementAllowanceIn,
      additionalWindingClassLowerBoundIn,
      endpointConnectivityProofHash: String(
        connectivityCell?.connectivityProofHash || "",
      ),
      strictPathWitnessHashes: pathClasses.map((row) =>
        row.strictWitnessHash).sort(),
      proofScope: "one_fixed_antipodal_endpoint_only",
    })
    : null;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_FIXED_ENDPOINT_OBSTACLE_PATH_CLASSES_V1_SCHEMA,
    ok: validationIssues.length === 0,
    predicatePlanReceiptHash: String(predicatePlan.predicatePlanReceiptHash || ""),
    cellPartitionPageHash: String(cellPage.cellPartitionPageHash || ""),
    strictRepresentativeReceiptHash: String(
      representatives.strictRepresentativeReceiptHash || "",
    ),
    endpointConnectivityReceiptHash: String(
      connectivity.endpointConnectivityReceiptHash || "",
    ),
    actorPieceKey: String(predicatePlan.actorPieceKey || ""),
    actionType: String(predicatePlan.actionType || ""),
    fixedEndpoint: destination,
    endpointCellKey: String(cell?.cellKey || ""),
    obstacleKey: String(obstacle?.obstacleKey || ""),
    obstacleCenter: axisEvidence.center,
    obstacleInradiusIn,
    movementAllowanceIn,
    additionalWindingClassLowerBoundIn,
    allowanceExcludesAllOtherWindingClasses:
      movementAllowanceIn + 0.001 < additionalWindingClassLowerBoundIn,
    antipodalAxis: axisEvidence.axis,
    pathClasses,
    pathClassCount: fixedEndpointPathClassComplete ? 2 : null,
    fixedEndpointPathClassComplete,
    strictRepresentativeCoverageComplete: fixedEndpointPathClassComplete,
    strictUniversalActionExecutionComplete: false,
    topologyProof,
    topologyProofHash: topologyProof ? stableGraphHash(topologyProof) : "",
    validationIssues,
    unsupportedReasons,
    transitionStable: false,
    ruleBehaviorQuotientComplete: false,
    continuousChoiceKind: "player_choice_not_chance",
    chanceMassAssigned: false,
    completionDebts: uniqueSorted([
      ...validationIssues,
      ...unsupportedReasons,
      "all_endpoint_obstacle_path_partition_not_proven",
      "path_class_transition_stability_not_proven",
    ]),
    claimBoundary:
      "This certificate closes the complete relative-homotopy denominator only for one supplied antipodal endpoint around one strictly interior axis-aligned rectangular obstacle under the proved movement-length bound. It does not close all endpoints, events, reactions, Unit geometry, universal execution inside each class, transition stability or Q_rule.",
  });
  return {
    ...core,
    fixedEndpointObstaclePathClassesReceiptHash: stableGraphHash(core),
  };
}
