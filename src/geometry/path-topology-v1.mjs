import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { WARMACHINE_GEOMETRY_CELL_PARTITION_V1_SCHEMA } from
  "./cell-partition-v1.mjs";
import { WARMACHINE_ENDPOINT_CELL_CONNECTIVITY_V1_SCHEMA } from
  "./cell-connectivity-v1.mjs";
import { WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA } from
  "./predicate-plan-v1.mjs";
import { WARMACHINE_GEOMETRY_STRICT_REPRESENTATIVE_V1_SCHEMA } from
  "./strict-representative-v1.mjs";
import { certifyWarmachineFixedEndpointObstaclePathClassesV1 } from
  "./fixed-endpoint-obstacle-path-classes-v1.mjs";
import { buildWarmachineMovementEventAutomatonV1 } from
  "./movement-event-automaton-v1.mjs";
import { buildWarmachineMovementEventWordLanguageV1 } from
  "./movement-event-word-language-v1.mjs";
import { buildRulesV1ParameterizedMovementDomainContract } from
  "../warmachine-host-runtime.mjs";

export const WARMACHINE_GEOMETRY_PATH_TOPOLOGY_V1_SCHEMA =
  "warmachine_geometry_path_topology_v1";

const OPEN_CONVEX_PATH_THEOREM =
  "convex_free_domain_all_endpoint_fixed_paths_share_one_relative_homotopy_class_v1";
const HOST_OPEN_CONVEX_UNIVERSAL_EXECUTION_THEOREM =
  "host_open_convex_quantized_endpoint_straight_path_universal_strict_execution_v1";

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

function pointInsideRectangle(point = {}, bounds = {}) {
  const xIn = Number(point.xIn);
  const yIn = Number(point.yIn);
  return Number.isFinite(xIn) && Number.isFinite(yIn) &&
    xIn >= Number(bounds.left) && xIn <= Number(bounds.right) &&
    yIn >= Number(bounds.top) && yIn <= Number(bounds.bottom);
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
    issues.push("path_topology_predicate_plan_invalid");
  }
  if (cellPage.schemaVersion !== WARMACHINE_GEOMETRY_CELL_PARTITION_V1_SCHEMA ||
      !receiptValid(cellPage, "cellPartitionPageHash")) {
    issues.push("path_topology_cell_page_invalid");
  }
  if (representatives.schemaVersion !==
      WARMACHINE_GEOMETRY_STRICT_REPRESENTATIVE_V1_SCHEMA ||
      !receiptValid(representatives, "strictRepresentativeReceiptHash")) {
    issues.push("path_topology_representatives_invalid");
  }
  if (connectivity.schemaVersion !== WARMACHINE_ENDPOINT_CELL_CONNECTIVITY_V1_SCHEMA ||
      !receiptValid(connectivity, "endpointConnectivityReceiptHash")) {
    issues.push("path_topology_connectivity_invalid");
  }
  if (cellPage.predicatePlanReceiptHash !== predicatePlan.predicatePlanReceiptHash ||
      representatives.predicatePlanReceiptHash !== predicatePlan.predicatePlanReceiptHash ||
      connectivity.predicatePlanReceiptHash !== predicatePlan.predicatePlanReceiptHash ||
      representatives.cellPartitionPageHash !== cellPage.cellPartitionPageHash ||
      connectivity.cellPartitionPageHash !== cellPage.cellPartitionPageHash ||
      connectivity.strictRepresentativeReceiptHash !==
        representatives.strictRepresentativeReceiptHash) {
    issues.push("path_topology_receipt_binding_mismatch");
  }
  if (predicatePlan.continuousChoiceKind !== "player_choice_not_chance" ||
      cellPage.continuousChoiceKind !== "player_choice_not_chance" ||
      representatives.continuousChoiceKind !== "player_choice_not_chance" ||
      connectivity.continuousChoiceKind !== "player_choice_not_chance" ||
      predicatePlan.chanceMassAssigned !== false ||
      cellPage.chanceMassAssigned !== false ||
      representatives.chanceMassAssigned !== false ||
      connectivity.chanceMassAssigned !== false) {
    issues.push("path_topology_chance_contract_invalid");
  }
  return uniqueSorted(issues);
}

function validateParameterizedDomainContract(source = {}, predicatePlan = {}) {
  const receipt = source?.parameterizedDomainContract || source || {};
  const integrityIssues = [];
  if (receipt.schemaVersion !==
      "warmachine_parameterized_movement_domain_contract_v1") {
    integrityIssues.push("host_parameterized_domain_schema_invalid");
  }
  if (!receiptValid(receipt, "parameterizedDomainContractHash")) {
    integrityIssues.push("host_parameterized_domain_hash_invalid");
  }
  if (String(receipt.actorPieceKey || "") !==
      String(predicatePlan.actorPieceKey || "") ||
      String(receipt.actionType || "") !== String(predicatePlan.actionType || "") ||
      String(receipt.predicatePlanHash || "") !==
        String(predicatePlan.hostPredicatePlanHash || "")) {
    integrityIssues.push("host_parameterized_domain_binding_mismatch");
  }
  if (receipt.continuousChoiceKind !== "player_choice_not_chance" ||
      receipt.chanceMassAssigned !== false) {
    integrityIssues.push("host_parameterized_domain_chance_contract_invalid");
  }
  const completionIssues = [
    ...(receipt.ok === true ? [] : ["host_parameterized_domain_not_ok"]),
    ...(receipt.strictUniversalActionExecutionComplete === true
      ? []
      : ["host_parameterized_domain_not_universal"]),
    ...(receipt.theoremKey === HOST_OPEN_CONVEX_UNIVERSAL_EXECUTION_THEOREM
      ? []
      : ["host_parameterized_domain_theorem_missing"]),
  ];
  return {
    receipt,
    integrityIssues: uniqueSorted(integrityIssues),
    completionIssues: uniqueSorted(completionIssues),
  };
}

function certifyOpenConvexCell(
  predicatePlan = {},
  cell = {},
  representativeCell = {},
  connectivityCell = {},
  parameterizedDomain = {},
) {
  const reasons = [];
  const predicateByKey = new Map((predicatePlan.predicates || []).map((row) =>
    [String(row.predicateKey || ""), row]));
  const board = predicateByKey.get("endpoint_within_board_after_base_inset") || null;
  const allowance = predicateByKey.get("endpoint_within_movement_allowance") || null;
  const startPoint = allowance?.primitive?.center || null;
  if (!["advance", "run"].includes(predicatePlan.actionType)) {
    reasons.push("open_convex_path_theorem_normal_movement_only");
  }
  if (predicatePlan.endpointPredicatePlanExact !== true) {
    reasons.push("endpoint_predicate_plan_not_exact");
  }
  if (predicatePlan.pathClassPartitionRequired !== false) {
    reasons.push("host_requires_path_class_partition");
  }
  if ((predicatePlan.configurationObstacles || []).length !== 0) {
    reasons.push("configuration_obstacles_present");
  }
  if ((predicatePlan.eventRegions || []).length !== 0) {
    reasons.push("path_event_regions_present");
  }
  if ((predicatePlan.wildcardDebts || []).length !== 0) {
    reasons.push("host_path_wildcard_debts_present");
  }
  if ((predicatePlan.predicates || []).length !== 2 ||
      board?.primitive?.primitiveKind !== "axis_aligned_rectangle_inclusion" ||
      board?.primitive?.geometryModel !== "host_board_inset_by_actor_base_v1" ||
      allowance?.primitive?.primitiveKind !== "circle_inclusion" ||
      allowance?.primitive?.geometryModel !==
        "host_rule_atom_adjusted_movement_allowance_v1") {
    reasons.push("canonical_board_and_allowance_convex_domain_not_exact");
  }
  if (!pointInsideRectangle(startPoint, board?.primitive?.bounds || {})) {
    reasons.push("movement_start_not_proven_inside_board_domain");
  }
  if ((cell.requiredPredicateAssignment || []).some((row) => row.expected !== true) ||
      (cell.eventRegionAssignment || []).length !== 0) {
    reasons.push("cell_not_canonical_open_convex_signature");
  }
  if (connectivityCell.endpointConstraintConnectivityCertified !== true ||
      connectivityCell.connectivityProof?.theoremKey !==
        "nonempty_finite_intersection_of_convex_sets_is_connected_v1") {
    reasons.push("convex_endpoint_connectivity_certificate_missing");
  }
  if (representativeCell.strictWitness?.strictTransitionAccepted !== true ||
      representativeCell.strictWitness?.hostPathEvaluation?.pathStrictPrecheckPassed !== true) {
    reasons.push("strict_nonempty_path_witness_missing");
  }
  const uniqueReasons = uniqueSorted(reasons);
  const certified = uniqueReasons.length === 0;
  const universalExecutionUnsupportedReasons = uniqueSorted([
    ...(parameterizedDomain.integrityIssues || []),
    ...(parameterizedDomain.completionIssues || []),
    ...(certified ? [] : ["path_topology_not_certified"]),
  ]);
  const strictUniversalActionExecutionProven =
    universalExecutionUnsupportedReasons.length === 0;
  const proof = certified ? stableGraphValue({
    theoremKey: OPEN_CONVEX_PATH_THEOREM,
    assumptions: [
      "the_endpoint_domain_is_the_intersection_of_the_host_board_inset_and_movement_allowance_disk",
      "the_movement_start_is_inside_that_convex_domain",
      "the_host_declares_no_configuration_obstacle_path_event_or_wildcard_path_debt",
      "every_legal_path_and_the_straight_segment_stay_in_the_same_convex_free_domain",
    ],
    consequence:
      "for_each_fixed_endpoint_every_legal_path_is_relative_endpoint_homotopic_to_the_straight_segment",
    canonicalPathFamily: "start_to_endpoint_straight_segment",
    endpointConstraintConnectivityProofHash:
      String(connectivityCell.connectivityProofHash || ""),
    strictNonemptyWitnessHash:
      String(representativeCell.strictWitness?.strictWitnessHash || ""),
    pathClassCountPerFixedEndpoint: 1,
    proofScope: "continuous_path_topology_only",
  }) : null;
  return stableGraphValue({
    cellKey: String(cell.cellKey || ""),
    disposition: certified
      ? "certified_open_convex_single_relative_homotopy_class"
      : "unresolved_path_topology",
    pathTopologyCertified: certified,
    pathClassCountPerFixedEndpoint: certified ? 1 : null,
    canonicalStraightSegmentFamilyComplete: certified,
    orderedPathEventAlphabetEmpty: certified,
    topologyProof: proof,
    topologyProofHash: proof ? stableGraphHash(proof) : "",
    unsupportedReasons: uniqueReasons,
    hostParameterizedDomainContractHash: String(
      parameterizedDomain.receipt?.parameterizedDomainContractHash || "",
    ),
    hostParameterizedDomainTheoremKey: String(
      parameterizedDomain.receipt?.theoremKey || "",
    ),
    strictUniversalActionExecutionProven,
    universalExecutionUnsupportedReasons,
    transitionStable: false,
    chanceMass: null,
  });
}

export function certifyWarmachineGeometryPathTopologyV1(
  predicatePlan = {},
  cellPage = {},
  representatives = {},
  connectivity = {},
  inputState = {},
  options = {},
) {
  const baseValidationIssues = validateInputs(
    predicatePlan,
    cellPage,
    representatives,
    connectivity,
  );
  const hostParameterizedDomainSource =
    options.hostParameterizedDomainContract ||
    buildRulesV1ParameterizedMovementDomainContract(inputState, {
      actorPieceKey: predicatePlan.actorPieceKey,
      actionType: predicatePlan.actionType,
    });
  const parameterizedDomain = validateParameterizedDomainContract(
    hostParameterizedDomainSource,
    predicatePlan,
  );
  const fixedEndpointObstaclePathCertificates =
    (options.fixedEndpointObstaclePathRequests || []).map((request) =>
      certifyWarmachineFixedEndpointObstaclePathClassesV1(
        inputState,
        predicatePlan,
        cellPage,
        representatives,
        connectivity,
        request,
      ));
  const fixedEndpointCertificateIssues =
    fixedEndpointObstaclePathCertificates.flatMap((certificate, index) =>
      certificate.ok === true
        ? []
        : [`fixed_endpoint_obstacle_path_certificate_${index}_invalid`]);
  const movementEventAutomaton = (predicatePlan.eventRegions || []).length > 0 ||
      (options.movementEventPathEvaluations || []).length > 0
    ? buildWarmachineMovementEventAutomatonV1(
      predicatePlan,
      options.movementEventPathEvaluations || [],
    )
    : null;
  const movementEventAutomatonIssues = movementEventAutomaton?.ok === false
    ? ["movement_event_automaton_invalid"]
    : [];
  const movementEventWordLanguage = movementEventAutomaton
    ? buildWarmachineMovementEventWordLanguageV1(
      predicatePlan,
      movementEventAutomaton,
      {
        quantizedWorklistReceipt:
          options.quantizedMovementEventWordWorklistReceipt || null,
      },
    )
    : null;
  const movementEventWordLanguageIssues =
    movementEventWordLanguage?.ok === false
      ? ["movement_event_word_language_invalid"]
      : [];
  const validationIssues = uniqueSorted([
    ...baseValidationIssues,
    ...parameterizedDomain.integrityIssues,
    ...fixedEndpointCertificateIssues,
    ...movementEventAutomatonIssues,
    ...movementEventWordLanguageIssues,
  ]);
  const representativeByCell = new Map((representatives.cells || []).map((row) =>
    [String(row.cellKey || ""), row]));
  const connectivityByCell = new Map((connectivity.cells || []).map((row) =>
    [String(row.cellKey || ""), row]));
  const cells = (cellPage.cells || []).map((cell) => certifyOpenConvexCell(
    predicatePlan,
    cell,
    representativeByCell.get(String(cell.cellKey || "")) || {},
    connectivityByCell.get(String(cell.cellKey || "")) || {},
    parameterizedDomain,
  ));
  const certifiedCellCount = cells.filter((row) => row.pathTopologyCertified).length;
  const unresolvedCellCount = cells.length - certifiedCellCount;
  const fullSignatureDenominatorPresent = String(cellPage.cursor || "0") === "0" &&
    cellPage.nextCursor === null &&
    cellPage.predicateSignaturePartitionComplete === true &&
    connectivity.endpointConstraintConnectivityComplete === true;
  const pathTopologyPageComplete = validationIssues.length === 0 &&
    cells.length > 0 && unresolvedCellCount === 0;
  const pathTopologyComplete = pathTopologyPageComplete &&
    fullSignatureDenominatorPresent;
  const strictUniversalActionExecutionComplete = pathTopologyComplete &&
    cells.length > 0 &&
    cells.every((cell) => cell.strictUniversalActionExecutionProven === true);
  const fixedEndpointObstaclePathRequestCount =
    fixedEndpointObstaclePathCertificates.length;
  const fixedEndpointObstaclePathCompleteCount =
    fixedEndpointObstaclePathCertificates.filter((certificate) =>
      certificate.fixedEndpointPathClassComplete === true).length;
  const fixedEndpointObstaclePathRequestsComplete =
    fixedEndpointObstaclePathRequestCount > 0 &&
    fixedEndpointObstaclePathCompleteCount ===
      fixedEndpointObstaclePathRequestCount;
  const movementEventWordLanguageComplete =
    movementEventWordLanguage?.geometricEventWordLanguageComplete === true;
  const movementEventAutomatonCompletionDebts =
    (movementEventAutomaton?.completionDebts || []).filter((debt) =>
      !(movementEventWordLanguageComplete &&
        debt === "geometric_event_word_language_not_proven"));
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_GEOMETRY_PATH_TOPOLOGY_V1_SCHEMA,
    ok: validationIssues.length === 0,
    predicatePlanReceiptHash: String(predicatePlan.predicatePlanReceiptHash || ""),
    cellPartitionPageHash: String(cellPage.cellPartitionPageHash || ""),
    strictRepresentativeReceiptHash:
      String(representatives.strictRepresentativeReceiptHash || ""),
    endpointConnectivityReceiptHash:
      String(connectivity.endpointConnectivityReceiptHash || ""),
    hostParameterizedDomainContractHash: String(
      parameterizedDomain.receipt?.parameterizedDomainContractHash || "",
    ),
    pageCellCount: cells.length,
    certifiedCellCount,
    unresolvedCellCount,
    cells,
    validationIssues,
    pathTopologyPageComplete,
    pathTopologyComplete,
    geometricPathClassPartitionComplete: pathTopologyComplete,
    strictReachableEndpointSetComplete: strictUniversalActionExecutionComplete,
    strictReachableEndpointDomainKind:
      "host_cent_inch_quantized_endpoint_domain",
    strictUniversalActionExecutionComplete,
    fixedEndpointObstaclePathRequestCount,
    fixedEndpointObstaclePathCompleteCount,
    fixedEndpointObstaclePathRequestsComplete,
    fixedEndpointObstaclePathCertificates,
    movementEventAutomatonReceiptHash: String(
      movementEventAutomaton?.movementEventAutomatonReceiptHash || "",
    ),
    movementEventRegionCount: Number(
      movementEventAutomaton?.eventRegionCount || 0,
    ),
    movementEventFiniteAutomatonBoundComplete:
      movementEventAutomaton?.finiteAutomatonBoundComplete === true,
    movementEventObservedPathTraceReplayComplete:
      movementEventAutomaton?.observedPathTraceReplayComplete === true,
    movementEventObservedDeclaredEventRegionEffectResolutionComplete:
      movementEventAutomaton
        ?.observedDeclaredEventRegionEffectResolutionComplete === true,
    movementEventWordLanguageReceiptHash: String(
      movementEventWordLanguage?.movementEventWordLanguageReceiptHash || "",
    ),
    quantizedMovementEventWordWorklistReceiptHash: String(
      options.quantizedMovementEventWordWorklistReceipt
        ?.quantizedMovementEventWordWorklistReceiptHash || "",
    ),
    movementEventWordDenominatorCount: Number(
      movementEventWordLanguage?.eventWordDenominatorCount || 0,
    ),
    movementEventGeometricWordLanguageComplete:
      movementEventWordLanguageComplete,
    movementEventRulesEffectResolutionComplete:
      movementEventWordLanguage?.rulesEffectResolutionComplete === true,
    movementEventAutomaton,
    movementEventWordLanguage,
    transitionStable: false,
    ruleBehaviorQuotientComplete: false,
    continuousChoiceKind: "player_choice_not_chance",
    chanceMassAssigned: false,
    completionDebts: uniqueSorted([
      ...validationIssues,
      ...(unresolvedCellCount ? ["general_path_topology_unresolved"] : []),
      ...(fullSignatureDenominatorPresent
        ? []
        : ["path_topology_signature_denominator_not_exhausted"]),
      ...parameterizedDomain.completionIssues,
      ...(strictUniversalActionExecutionComplete
        ? []
        : ["strict_universal_action_execution_not_proven"]),
      ...(fixedEndpointObstaclePathRequestCount === 0 ||
          fixedEndpointObstaclePathRequestsComplete
        ? []
        : ["requested_fixed_endpoint_obstacle_path_classes_unresolved"]),
      ...((predicatePlan.eventRegions || []).length === 0
        ? []
        : [
          ...(movementEventAutomaton
            ? movementEventAutomatonCompletionDebts
            : ["movement_event_automaton_missing"]),
          ...(movementEventWordLanguage?.completionDebts || [
            "movement_event_word_language_missing",
          ]),
        ]),
      "transition_stability_not_proven",
    ]),
    claimBoundary:
      "This certificate closes relative-endpoint path topology and Host strict action execution for every cent-inch-quantized endpoint in the exact open convex normal-movement domain. Requested narrow single-obstacle fixed endpoints may additionally carry complete bounded-winding class certificates without upgrading the all-endpoint obstacle domain. Event-region plans carry a finite source-bound membership automaton and exact supplied-trace replay. Their event-word language closes either through an unreachable-boundary epsilon proof or a bound exhausted quantized endpoint/path worklist. Supplied pure fire/corrosion groups may carry semantic-successor confluence without inventing a rules order. Reaction/external-hook closure, transition stability, unresolved general obstacle domains, and Q_rule remain explicit debt.",
  });
  return {
    ...core,
    pathTopologyReceiptHash: stableGraphHash(core),
  };
}
