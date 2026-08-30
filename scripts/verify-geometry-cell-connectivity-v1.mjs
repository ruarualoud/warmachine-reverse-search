import assert from "node:assert/strict";

import { buildWarmachineGeometryCellPartitionPageV1 } from
  "../src/geometry/cell-partition-v1.mjs";
import { certifyWarmachineEndpointCellConnectivityV1 } from
  "../src/geometry/cell-connectivity-v1.mjs";
import { buildWarmachineGeometryPredicatePlanV1 } from
  "../src/geometry/predicate-plan-v1.mjs";
import { materializeWarmachineGeometryCellRepresentativesV1 } from
  "../src/geometry/strict-representative-v1.mjs";

function state(terrain = []) {
  return {
    stateKey: "geometry-cell-connectivity",
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 1,
    strictMode: true,
    enforceStrictExecutor: true,
    board: { widthIn: 48, heightIn: 48 },
    terrain,
    pieces: [{
      pieceKey: "mover",
      label: "mover",
      sideKey: "player1",
      position: { xIn: 10, yIn: 10 },
      baseSizeIn: 2,
      speedIn: 10,
      boxesRemaining: 5,
    }],
  };
}

function domain(inputState, candidatePoints) {
  const predicatePlan = buildWarmachineGeometryPredicatePlanV1(inputState, {
    actorPieceKey: "mover",
    actionType: "advance",
    strategyContext: {
      initialDistributionReceiptHash: "initial",
      historyReceiptHash: "history",
      observationReceiptHash: "observation",
      reachabilityContextKey: "reachable",
      remainingPly: 2,
    },
  });
  const cellPage = buildWarmachineGeometryCellPartitionPageV1(predicatePlan, { limit: 8 });
  const representatives = materializeWarmachineGeometryCellRepresentativesV1(
    inputState,
    predicatePlan,
    cellPage,
    {
      candidatePoints,
      maximumCandidateCount: 256,
      maximumStrictAttemptsPerCell: 8,
    },
  );
  return {
    predicatePlan,
    cellPage,
    representatives,
    connectivity: certifyWarmachineEndpointCellConnectivityV1(
      predicatePlan,
      cellPage,
      representatives,
    ),
  };
}

const open = domain(state(), [{ xIn: 12, yIn: 10 }]);
assert.equal(open.cellPage.pageCellCount, 1);
assert.equal(open.connectivity.ok, true);
assert.equal(open.connectivity.certifiedCellCount, 1);
assert.equal(open.connectivity.unresolvedCellCount, 0);
assert.equal(open.connectivity.endpointConstraintConnectivityComplete, true);
assert.equal(open.connectivity.endpointConstraintConnectivityPageComplete, true);
assert.equal(open.connectivity.cells[0].endpointConstraintComponentCount, 1);
assert.equal(open.connectivity.connectedComponentPartitionComplete, false);

const rough = domain(state([{
  terrainKey: "rough",
  type: "rough_terrain",
  xIn: 13,
  yIn: 10,
  widthIn: 2,
  heightIn: 2,
  roughTerrain: true,
  movementCostMultiplier: 2,
}]), [{ xIn: 11, yIn: 10 }, { xIn: 13, yIn: 10 }]);
assert.equal(rough.cellPage.pageCellCount, 2);
assert.equal(rough.connectivity.certifiedCellCount, 2);
assert.equal(rough.connectivity.unresolvedCellCount, 0);
assert.equal(rough.connectivity.endpointConstraintConnectivityComplete, true);
const roughOutside = rough.connectivity.cells.find((cell) =>
  cell.connectivityProof?.exclusionConstraintKeys?.includes("terrain-cost:rough"));
assert.ok(roughOutside);
assert.equal(roughOutside.strictInteriorEvidence.every((row) => row.proven), true);

const isolatedObstacle = domain(state([{
  terrainKey: "isolated-wall",
  type: "obstacle",
  xIn: 13,
  yIn: 10,
  widthIn: 1,
  heightIn: 2,
  blocksMovement: true,
}]), [{ xIn: 11, yIn: 10 }]);
assert.equal(isolatedObstacle.connectivity.certifiedCellCount, 1);
assert.equal(isolatedObstacle.connectivity.endpointConstraintConnectivityComplete, true);
assert.equal(isolatedObstacle.connectivity.cells[0].strictInteriorEvidence.every((row) =>
  row.proven), true);

const overlappingObstacle = domain(state([
  {
    terrainKey: "overlap-left",
    type: "obstacle",
    xIn: 13,
    yIn: 10,
    widthIn: 2,
    heightIn: 2,
    blocksMovement: true,
  },
  {
    terrainKey: "overlap-right",
    type: "obstacle",
    xIn: 14,
    yIn: 10,
    widthIn: 2,
    heightIn: 2,
    blocksMovement: true,
  },
]), [{ xIn: 11, yIn: 10 }]);
assert.equal(overlappingObstacle.connectivity.certifiedCellCount, 1);
assert.equal(
  overlappingObstacle.connectivity.cells[0]
    .exclusionTopologyEvidence.contractibleSeparatedClusterFamilyProven,
  true,
);
assert.equal(
  overlappingObstacle.connectivity.cells[0]
    .exclusionTopologyEvidence.clusters[0].memberCount,
  2,
);

const touchingObstacle = domain(state([
  {
    terrainKey: "touch-left",
    type: "obstacle",
    xIn: 13,
    yIn: 10,
    widthIn: 2,
    heightIn: 2,
    blocksMovement: true,
  },
  {
    terrainKey: "touch-right",
    type: "obstacle",
    xIn: 17,
    yIn: 10,
    widthIn: 2,
    heightIn: 2,
    blocksMovement: true,
  },
]), [{ xIn: 11, yIn: 10 }]);
assert.equal(touchingObstacle.connectivity.certifiedCellCount, 0);
assert.ok(touchingObstacle.connectivity.cells[0].unsupportedReasons.some((reason) =>
  reason.startsWith("exclusion_pair_relation_unresolved:")));

const filledCyclicOverlapObstacle = domain(state([
  {
    terrainKey: "cycle-horizontal",
    type: "obstacle",
    xIn: 14,
    yIn: 10,
    widthIn: 4,
    heightIn: 2,
    blocksMovement: true,
  },
  {
    terrainKey: "cycle-left",
    type: "obstacle",
    xIn: 13,
    yIn: 10,
    widthIn: 2,
    heightIn: 4,
    blocksMovement: true,
  },
  {
    terrainKey: "cycle-right",
    type: "obstacle",
    xIn: 15,
    yIn: 10,
    widthIn: 2,
    heightIn: 4,
    blocksMovement: true,
  },
]), [{ xIn: 11, yIn: 10 }]);
assert.equal(filledCyclicOverlapObstacle.connectivity.certifiedCellCount, 1);
const filledCycleTopology = filledCyclicOverlapObstacle.connectivity.cells[0]
  .exclusionTopologyEvidence.clusters[0];
assert.equal(filledCycleTopology.treeProven, false);
assert.equal(filledCycleTopology.graphCycleRank, 1);
assert.equal(filledCycleTopology.provenTriangleBoundaryRank, 1);
assert.equal(filledCycleTopology.firstBettiNumberUpperBound, 0);
assert.equal(filledCycleTopology.firstHomologyZeroProven, true);

const hollowCyclicOverlapObstacle = domain(state([
  {
    terrainKey: "hollow-a",
    type: "obstacle",
    templateShape: "circle",
    xIn: 12.2,
    yIn: 8.961,
    radiusIn: 1,
    blocksMovement: true,
  },
  {
    terrainKey: "hollow-b",
    type: "obstacle",
    templateShape: "circle",
    xIn: 15.8,
    yIn: 8.961,
    radiusIn: 1,
    blocksMovement: true,
  },
  {
    terrainKey: "hollow-c",
    type: "obstacle",
    templateShape: "circle",
    xIn: 14,
    yIn: 12.078,
    radiusIn: 1,
    blocksMovement: true,
  },
]), [{ xIn: 10, yIn: 14 }]);
assert.equal(hollowCyclicOverlapObstacle.connectivity.certifiedCellCount, 1);
const hollowCycleTopology = hollowCyclicOverlapObstacle.connectivity.cells[0]
  .exclusionTopologyEvidence.clusters[0];
assert.equal(hollowCycleTopology.graphCycleRank, 1);
assert.equal(hollowCycleTopology.provenTriangleBoundaryRank, 0);
assert.equal(hollowCycleTopology.firstBettiNumberUpperBound, 1);
assert.equal(hollowCycleTopology.firstHomologyExact, true);
assert.equal(hollowCycleTopology.firstBettiNumber, 1);
assert.equal(hollowCycleTopology.firstHomologyZeroProven, false);
assert.equal(
  hollowCyclicOverlapObstacle.connectivity.cells[0]
    .endpointConstraintComponentCountCertified,
  true,
);
assert.equal(
  hollowCyclicOverlapObstacle.connectivity.cells[0]
    .endpointConstraintComponentCount,
  2,
);
assert.equal(
  hollowCyclicOverlapObstacle.connectivity.cells[0]
    .endpointConstraintConnectivityCertified,
  false,
);
assert.equal(
  hollowCyclicOverlapObstacle.connectivity.cells[0]
    .endpointConstraintComponentMaterializationComplete,
  true,
);
assert.equal(
  hollowCyclicOverlapObstacle.connectivity.cells[0]
    .endpointConstraintComponents.length,
  2,
);
assert.equal(
  hollowCyclicOverlapObstacle.connectivity.cells[0]
    .endpointConstraintComponents[1].sourceReachabilityDisposition,
  "proven_unreachable_from_outer_source_without_crossing_forbidden_cycle",
);
assert.equal(
  hollowCyclicOverlapObstacle.connectivity.connectedComponentPartitionComplete,
  false,
);
assert.equal(
  hollowCyclicOverlapObstacle.connectivity.endpointConstraintConnectivityComplete,
  false,
);
assert.equal(
  hollowCyclicOverlapObstacle.connectivity.endpointConstraintComponentCountComplete,
  true,
);
assert.equal(hollowCyclicOverlapObstacle.connectivity.connectedCellCount, 0);
assert.equal(
  hollowCyclicOverlapObstacle.connectivity
    .endpointConstraintConnectedComponentPartitionComplete,
  true,
);

const spanningObstacle = domain(state([{
  terrainKey: "spanning-wall",
  type: "obstacle",
  xIn: 15,
  yIn: 10,
  widthIn: 1,
  heightIn: 24,
  blocksMovement: true,
}]), [{ xIn: 11, yIn: 10 }]);
assert.equal(spanningObstacle.connectivity.certifiedCellCount, 0);
assert.ok(spanningObstacle.connectivity.cells.every((cell) =>
  cell.unsupportedReasons.some((reason) =>
    reason.startsWith("exclusion_not_proven_strictly_interior:"))));

const paginatedTerrain = [{
  terrainKey: "rough-page",
  type: "rough_terrain",
  xIn: 13,
  yIn: 10,
  widthIn: 2,
  heightIn: 2,
  roughTerrain: true,
  movementCostMultiplier: 2,
}];
const paginatedPlan = buildWarmachineGeometryPredicatePlanV1(state(paginatedTerrain), {
  actorPieceKey: "mover",
  actionType: "advance",
  strategyContext: {
    initialDistributionReceiptHash: "initial",
    historyReceiptHash: "history",
    observationReceiptHash: "observation",
    reachabilityContextKey: "reachable",
    remainingPly: 2,
  },
});
const paginatedPage = buildWarmachineGeometryCellPartitionPageV1(paginatedPlan, {
  limit: 1,
});
assert.equal(paginatedPage.pageCellCount, 1);
assert.equal(paginatedPage.nextCursor, "1");
const paginatedRepresentatives = materializeWarmachineGeometryCellRepresentativesV1(
  state(paginatedTerrain),
  paginatedPlan,
  paginatedPage,
  {
    candidatePoints: [{ xIn: 11, yIn: 10 }],
    maximumCandidateCount: 256,
    maximumStrictAttemptsPerCell: 8,
  },
);
const paginatedConnectivity = certifyWarmachineEndpointCellConnectivityV1(
  paginatedPlan,
  paginatedPage,
  paginatedRepresentatives,
);
assert.equal(paginatedConnectivity.endpointConstraintConnectivityPageComplete, true);
assert.equal(paginatedConnectivity.endpointConstraintConnectivityComplete, false);
assert.ok(paginatedConnectivity.completionDebts.includes(
  "endpoint_constraint_connectivity_denominator_not_exhausted",
));

const tamperedPage = structuredClone(open.cellPage);
tamperedPage.cells[0].signatureIndex = "tampered";
const tampered = certifyWarmachineEndpointCellConnectivityV1(
  open.predicatePlan,
  tamperedPage,
  open.representatives,
);
assert.equal(tampered.ok, false);
assert.ok(tampered.validationIssues.includes("endpoint_connectivity_cell_page_invalid"));

assert.equal(open.connectivity.chanceMassAssigned, false);
assert.equal(rough.connectivity.chanceMassAssigned, false);
assert.equal(isolatedObstacle.connectivity.chanceMassAssigned, false);
assert.equal(overlappingObstacle.connectivity.chanceMassAssigned, false);
assert.equal(touchingObstacle.connectivity.chanceMassAssigned, false);
assert.equal(filledCyclicOverlapObstacle.connectivity.chanceMassAssigned, false);
assert.equal(hollowCyclicOverlapObstacle.connectivity.chanceMassAssigned, false);
assert.equal(spanningObstacle.connectivity.chanceMassAssigned, false);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_geometry_cell_connectivity_v1",
  openCertifiedCellCount: open.connectivity.certifiedCellCount,
  roughCertifiedCellCount: rough.connectivity.certifiedCellCount,
  roughUnresolvedCellCount: rough.connectivity.unresolvedCellCount,
  isolatedObstacleCertifiedCellCount:
    isolatedObstacle.connectivity.certifiedCellCount,
  overlappingObstacleCertifiedCellCount:
    overlappingObstacle.connectivity.certifiedCellCount,
  touchingObstacleCertifiedCellCount:
    touchingObstacle.connectivity.certifiedCellCount,
  filledCyclicOverlapObstacleCertifiedCellCount:
    filledCyclicOverlapObstacle.connectivity.certifiedCellCount,
  hollowCyclicOverlapObstacleCertifiedCellCount:
    hollowCyclicOverlapObstacle.connectivity.certifiedCellCount,
  hollowCyclicOverlapObstacleComponentCount:
    hollowCyclicOverlapObstacle.connectivity.cells[0]
      .endpointConstraintComponentCount,
  hollowCyclicOverlapObstacleComponentsMaterialized:
    hollowCyclicOverlapObstacle.connectivity
      .endpointConstraintConnectedComponentPartitionComplete,
  boundedHoleProvenUnreachableFromOuterSource: true,
  spanningObstacleCertifiedCellCount:
    spanningObstacle.connectivity.certifiedCellCount,
  convexIntersectionTheoremApplied: true,
  isolatedConvexExclusionTheoremApplied: true,
  strictWitnessProvesNonemptyOnly: true,
  tamperedReceiptRejected: true,
  partialPageCannotClaimCompleteDenominator: true,
  connectedComponentPartitionComplete: false,
  chanceMassAssigned: false,
}, null, 2));
