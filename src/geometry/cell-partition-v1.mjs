import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA } from "./predicate-plan-v1.mjs";

export const WARMACHINE_GEOMETRY_CELL_PARTITION_V1_SCHEMA =
  "warmachine_geometry_cell_partition_v1";

function validatePredicatePlan(plan = {}) {
  const { predicatePlanReceiptHash, ...core } = plan;
  const issues = [];
  if (plan.schemaVersion !== WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA) {
    issues.push("geometry_predicate_plan_schema_invalid");
  }
  if (!predicatePlanReceiptHash || stableGraphHash(core) !== predicatePlanReceiptHash) {
    issues.push("geometry_predicate_plan_receipt_hash_mismatch");
  }
  if (plan.ok !== true) issues.push("geometry_predicate_plan_not_ready");
  if (plan.continuousChoiceKind !== "player_choice_not_chance" ||
      plan.chanceMassAssigned !== false) {
    issues.push("continuous_choice_chance_contract_invalid");
  }
  return [...new Set(issues)].sort();
}

function boundedLimit(value) {
  const parsed = Number(value ?? 64);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 256) {
    throw new Error("geometry_cell_partition_limit_invalid");
  }
  return parsed;
}

function cursorValue(value, total) {
  let parsed;
  try {
    parsed = BigInt(value ?? 0);
  } catch {
    throw new Error("geometry_cell_partition_cursor_invalid");
  }
  if (parsed < 0n || parsed > total) {
    throw new Error("geometry_cell_partition_cursor_out_of_range");
  }
  return parsed;
}

function eventAssignment(eventRegions, signatureIndex) {
  return eventRegions.map((eventRegion, index) => ({
    eventRegionKey: String(eventRegion.eventRegionKey || ""),
    eventKind: String(eventRegion.eventKind || ""),
    expectedInside: ((signatureIndex >> BigInt(index)) & 1n) === 1n,
    primitive: stableGraphValue(eventRegion.primitive || {}),
    sourceRuleKeys: [...new Set((eventRegion.sourceRuleKeys || []).map(String))].sort(),
  }));
}

export function buildWarmachineGeometryCellPartitionPageV1(
  predicatePlan = {},
  options = {},
) {
  const validationIssues = validatePredicatePlan(predicatePlan);
  const eventRegions = [...(predicatePlan.eventRegions || [])]
    .sort((left, right) => String(left.eventRegionKey || "")
      .localeCompare(String(right.eventRegionKey || "")) ||
      stableGraphHash(left).localeCompare(stableGraphHash(right)));
  const totalSignatureCount = 1n << BigInt(eventRegions.length);
  const cursor = cursorValue(options.cursor, totalSignatureCount);
  const limit = boundedLimit(options.limit);
  const end = cursor + BigInt(limit) < totalSignatureCount
    ? cursor + BigInt(limit)
    : totalSignatureCount;
  const requiredPredicateAssignment = (predicatePlan.predicates || []).map((predicate) => ({
    predicateKey: String(predicate.predicateKey || ""),
    relationKind: String(predicate.relationKind || ""),
    expected: true,
    predicateIdentityHash: String(predicate.predicateIdentityHash || stableGraphHash(predicate)),
  }));
  const cells = [];
  for (let signatureIndex = cursor; signatureIndex < end; signatureIndex += 1n) {
    const eventRegionAssignment = eventAssignment(eventRegions, signatureIndex);
    const identity = stableGraphValue({
      predicatePlanReceiptHash: predicatePlan.predicatePlanReceiptHash,
      requiredPredicateAssignment,
      eventRegionAssignment: eventRegionAssignment.map((row) => ({
        eventRegionKey: row.eventRegionKey,
        expectedInside: row.expectedInside,
      })),
    });
    cells.push(stableGraphValue({
      cellKey: `geometry-cell-${stableGraphHash(identity, 32)}`,
      signatureIndex: String(signatureIndex),
      requiredPredicateAssignment,
      eventRegionAssignment,
      constraintFormulaKind: "host_predicate_boolean_conjunction_v1",
      predicateConstantByConstruction: true,
      declaredPredicateCoverageMember: true,
      geometricNonemptinessStatus: "unresolved",
      connectedComponentStatus: "unresolved",
      strictRepresentativeStatus: "unresolved",
      transitionSignatureStatus: "unresolved",
      disposition: "unresolved_nonemptiness_path_and_transition",
      chanceMass: null,
    }));
  }
  const nextCursor = end < totalSignatureCount ? String(end) : null;
  const predicateSignaturePartitionComplete = validationIssues.length === 0 &&
    predicatePlan.endpointPredicatePlanExact === true && nextCursor === null;
  const completionDebts = [
    ...validationIssues,
    ...(predicatePlan.endpointPredicatePlanExact === true
      ? []
      : ["endpoint_predicate_plan_not_exact"]),
    ...(nextCursor === null ? [] : ["predicate_signature_cursor_not_exhausted"]),
    "geometric_cell_nonemptiness_not_proven",
    "geometric_connected_components_not_partitioned",
    "strict_representatives_not_executed",
    "path_classes_not_partitioned",
    "transition_stability_not_proven",
  ];
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_GEOMETRY_CELL_PARTITION_V1_SCHEMA,
    ok: validationIssues.length === 0,
    predicatePlanReceiptHash: String(predicatePlan.predicatePlanReceiptHash || ""),
    hostReceiptHash: String(predicatePlan.hostReceiptHash || ""),
    ruleBehaviorContextHash: String(predicatePlan.ruleBehaviorContextHash || ""),
    strategyComparisonContextHash:
      String(predicatePlan.strategyComparisonContextHash || ""),
    cursor: String(cursor),
    nextCursor,
    limit,
    pageCellCount: cells.length,
    requiredPredicateCount: requiredPredicateAssignment.length,
    eventRegionCount: eventRegions.length,
    totalPredicateSignatureCount: String(totalSignatureCount),
    cells,
    completionDebts: [...new Set(completionDebts)].sort(),
    continuousChoiceKind: "player_choice_not_chance",
    chanceMassAssigned: false,
    declaredPredicateSignatureCoverageComplete: nextCursor === null,
    predicateSignaturePartitionComplete,
    geometricNonemptinessComplete: false,
    connectedComponentPartitionComplete: false,
    strictRepresentativeCoverageComplete: false,
    pathClassPartitionComplete: false,
    transitionStable: false,
    finiteGeometryCellPartitionReady: false,
    ruleBehaviorQuotientComplete: false,
    claimBoundary:
      "This page exhaustively enumerates Boolean signatures of the Host-declared endpoint event regions while requiring every legal endpoint predicate. It conserves the declared signature denominator but does not prove a signature is geometrically nonempty or connected, does not partition path homotopy or ordered triggers, and does not certify strict representatives, transition stability, Q_rule or strategy completeness.",
  });
  return {
    ...core,
    cellPartitionPageHash: stableGraphHash(core),
  };
}
