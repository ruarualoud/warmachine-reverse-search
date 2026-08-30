import assert from "node:assert/strict";

import { buildWarmachineGeometryCellPartitionPageV1 } from
  "../src/geometry/cell-partition-v1.mjs";
import { certifyWarmachineEndpointCellConnectivityV1 } from
  "../src/geometry/cell-connectivity-v1.mjs";
import { certifyWarmachineGeometryPathTopologyV1 } from
  "../src/geometry/path-topology-v1.mjs";
import { buildWarmachineGeometryPredicatePlanV1 } from
  "../src/geometry/predicate-plan-v1.mjs";
import { materializeWarmachineGeometryCellRepresentativesV1 } from
  "../src/geometry/strict-representative-v1.mjs";
import { advanceWarmachineQuantizedMovementEventWordWorklistV1 } from
  "../src/geometry/quantized-movement-event-word-worklist-v1.mjs";
import {
  buildRulesV1ParameterizedMovementDomainContract,
  evaluateRulesV1MovementGeometryPath,
} from
  "../src/warmachine-host-runtime.mjs";

function state({ terrain = [], unit = false, speedIn = 10 } = {}) {
  return {
    stateKey: "geometry-path-topology",
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
      speedIn,
      boxesRemaining: 5,
      ...(unit ? { unitGroupId: "unit-a" } : {}),
    }],
  };
}

function domain(
  inputState,
  candidatePoints = [{ xIn: 12, yIn: 10 }],
  actionType = "advance",
  topologyOptions = {},
) {
  const predicatePlan = buildWarmachineGeometryPredicatePlanV1(inputState, {
    actorPieceKey: "mover",
    actionType,
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
  const connectivity = certifyWarmachineEndpointCellConnectivityV1(
    predicatePlan,
    cellPage,
    representatives,
  );
  const topology = certifyWarmachineGeometryPathTopologyV1(
    predicatePlan,
    cellPage,
    representatives,
    connectivity,
    inputState,
    topologyOptions,
  );
  return { predicatePlan, cellPage, representatives, connectivity, topology };
}

const open = domain(state());
assert.equal(open.topology.ok, true);
assert.equal(open.topology.certifiedCellCount, 1);
assert.equal(open.topology.unresolvedCellCount, 0);
assert.equal(open.topology.pathTopologyComplete, true);
assert.equal(open.topology.geometricPathClassPartitionComplete, true);
assert.equal(open.topology.cells[0].pathClassCountPerFixedEndpoint, 1);
assert.equal(open.topology.cells[0].canonicalStraightSegmentFamilyComplete, true);
assert.equal(open.topology.strictUniversalActionExecutionComplete, true);
assert.equal(open.topology.strictReachableEndpointSetComplete, true);
assert.equal(open.topology.cells[0].strictUniversalActionExecutionProven, true);
assert.equal(open.topology.transitionStable, false);

const openRun = domain(state(), [{ xIn: 20, yIn: 10 }], "run");
assert.equal(openRun.topology.pathTopologyComplete, true);
assert.equal(openRun.topology.strictUniversalActionExecutionComplete, true);
assert.equal(openRun.topology.cells[0].strictUniversalActionExecutionProven, true);

const roughState = state({ terrain: [{
  terrainKey: "rough",
  type: "rough_terrain",
  xIn: 13,
  yIn: 10,
  widthIn: 2,
  heightIn: 2,
  roughTerrain: true,
  movementCostMultiplier: 2,
}] });
const roughPathEvaluation = evaluateRulesV1MovementGeometryPath(roughState, {
  actorPieceKey: "mover",
  actionType: "advance",
  pathPoints: [
    { xIn: 10, yIn: 10 },
    { xIn: 13, yIn: 10 },
  ],
});
const rough = domain(
  roughState,
  [{ xIn: 11, yIn: 10 }, { xIn: 13, yIn: 10 }],
  "advance",
  { movementEventPathEvaluations: [roughPathEvaluation] },
);
assert.equal(rough.topology.certifiedCellCount, 0);
assert.ok(rough.topology.cells.every((cell) =>
  cell.unsupportedReasons.includes("host_requires_path_class_partition") &&
  cell.unsupportedReasons.includes("path_event_regions_present")));
assert.equal(rough.topology.movementEventRegionCount, 1);
assert.equal(rough.topology.movementEventFiniteAutomatonBoundComplete, true);
assert.equal(rough.topology.movementEventObservedPathTraceReplayComplete, true);
assert.equal(
  rough.topology
    .movementEventObservedDeclaredEventRegionEffectResolutionComplete,
  true,
);
assert.equal(rough.topology.movementEventGeometricWordLanguageComplete, false);
assert.equal(rough.topology.movementEventRulesEffectResolutionComplete, false);
assert.equal(rough.topology.movementEventAutomaton.pathReplays[0].crossingCount, 1);

const unreachableHazardState = state({ speedIn: 6, terrain: [{
  terrainKey: "far-acid-pool",
  type: "acid pool",
  xIn: 30,
  yIn: 10,
  widthIn: 2,
  heightIn: 2,
  isHazard: true,
  hazardEffectTypes: ["corrosion"],
}] });
const unreachableHazardPathEvaluation = evaluateRulesV1MovementGeometryPath(
  unreachableHazardState,
  {
    actorPieceKey: "mover",
    actionType: "advance",
    pathPoints: [{ xIn: 10, yIn: 10 }, { xIn: 12, yIn: 10 }],
  },
);
const unreachableHazard = domain(
  unreachableHazardState,
  [{ xIn: 12, yIn: 10 }],
  "advance",
  { movementEventPathEvaluations: [unreachableHazardPathEvaluation] },
);
assert.equal(
  unreachableHazard.topology.movementEventGeometricWordLanguageComplete,
  true,
);
assert.equal(
  unreachableHazard.topology.movementEventWordDenominatorCount,
  1,
);
assert.equal(
  unreachableHazard.topology.movementEventWordLanguage
    .allLegalPathsCoveredByEventWordDenominator,
  true,
);
assert.equal(unreachableHazard.topology.movementEventRulesEffectResolutionComplete, false);
assert.equal(unreachableHazard.topology.transitionStable, false);
assert.equal(unreachableHazard.topology.completionDebts.includes(
  "geometric_event_word_language_not_proven",
), false);

const reachableBoundaryState = state({ speedIn: 0.02, terrain: [{
  terrainKey: "boundary-rough",
  type: "rough_terrain",
  xIn: 12,
  yIn: 10,
  widthIn: 2,
  heightIn: 2,
  roughTerrain: true,
  movementCostMultiplier: 2,
}] });
const reachableBoundaryZeroPath = evaluateRulesV1MovementGeometryPath(
  reachableBoundaryState,
  {
    actorPieceKey: "mover",
    actionType: "advance",
    pathPoints: [{ xIn: 10, yIn: 10 }],
  },
);
const reachableBoundaryPreliminary = domain(
  reachableBoundaryState,
  [{ xIn: 10, yIn: 10 }, { xIn: 9.99, yIn: 10 }],
  "advance",
  { movementEventPathEvaluations: [reachableBoundaryZeroPath] },
);
let reachableBoundaryWorklist =
  advanceWarmachineQuantizedMovementEventWordWorklistV1(
    reachableBoundaryState,
    reachableBoundaryPreliminary.predicatePlan,
    reachableBoundaryPreliminary.topology.movementEventAutomaton,
    { endpointScanBudget: 100, pathEdgeBudget: 1000 },
  );
while (!reachableBoundaryWorklist.geometricEventWordLanguageComplete) {
  reachableBoundaryWorklist =
    advanceWarmachineQuantizedMovementEventWordWorklistV1(
      reachableBoundaryState,
      reachableBoundaryPreliminary.predicatePlan,
      reachableBoundaryPreliminary.topology.movementEventAutomaton,
      {
        checkpoint: reachableBoundaryWorklist.resumeCheckpoint,
        endpointScanBudget: 100,
        pathEdgeBudget: 1000,
      },
    );
}
const reachableBoundaryTopology = certifyWarmachineGeometryPathTopologyV1(
  reachableBoundaryPreliminary.predicatePlan,
  reachableBoundaryPreliminary.cellPage,
  reachableBoundaryPreliminary.representatives,
  reachableBoundaryPreliminary.connectivity,
  reachableBoundaryState,
  {
    movementEventPathEvaluations: [reachableBoundaryZeroPath],
    quantizedMovementEventWordWorklistReceipt: reachableBoundaryWorklist,
  },
);
assert.equal(
  reachableBoundaryTopology.movementEventGeometricWordLanguageComplete,
  true,
);
assert.equal(reachableBoundaryTopology.movementEventWordDenominatorCount, 3);
assert.equal(
  reachableBoundaryTopology.quantizedMovementEventWordWorklistReceiptHash,
  reachableBoundaryWorklist.quantizedMovementEventWordWorklistReceiptHash,
);

const obstacle = domain(state({ terrain: [{
  terrainKey: "wall",
    type: "obstruction",
  xIn: 13,
  yIn: 10,
  widthIn: 1,
  heightIn: 2,
  blocksMovement: true,
}] }), [{ xIn: 11, yIn: 10 }]);
assert.equal(obstacle.topology.certifiedCellCount, 0);
assert.ok(obstacle.topology.cells.every((cell) =>
  cell.unsupportedReasons.includes("configuration_obstacles_present")));

const boundedObstacle = domain(state({ speedIn: 12, terrain: [{
  terrainKey: "wall",
    type: "obstruction",
  xIn: 14,
  yIn: 10,
  widthIn: 2,
  heightIn: 2,
  blocksMovement: true,
}] }), [{ xIn: 18, yIn: 10 }], "advance", {
  fixedEndpointObstaclePathRequests: [{
    destination: { xIn: 18, yIn: 10 },
  }],
});
assert.equal(boundedObstacle.topology.pathTopologyComplete, false);
assert.equal(boundedObstacle.topology.fixedEndpointObstaclePathRequestCount, 1);
assert.equal(boundedObstacle.topology.fixedEndpointObstaclePathCompleteCount, 1);
assert.equal(boundedObstacle.topology.fixedEndpointObstaclePathRequestsComplete, true);
assert.equal(
  boundedObstacle.topology.fixedEndpointObstaclePathCertificates[0]
    .fixedEndpointPathClassComplete,
  true,
);
assert.equal(
  boundedObstacle.topology.fixedEndpointObstaclePathCertificates[0].pathClassCount,
  2,
);

const unit = domain(state({ unit: true }));
assert.equal(unit.topology.certifiedCellCount, 0);
assert.ok(unit.topology.cells.every((cell) =>
  cell.unsupportedReasons.includes("host_path_wildcard_debts_present")));

const tamperedConnectivity = structuredClone(open.connectivity);
tamperedConnectivity.cells[0].cellKey = "tampered";
const tampered = certifyWarmachineGeometryPathTopologyV1(
  open.predicatePlan,
  open.cellPage,
  open.representatives,
  tamperedConnectivity,
  state(),
);
assert.equal(tampered.ok, false);
assert.ok(tampered.validationIssues.includes("path_topology_connectivity_invalid"));

const hostDomain = buildRulesV1ParameterizedMovementDomainContract(state(), {
  actorPieceKey: "mover",
  actionType: "advance",
});
const tamperedHostDomain = structuredClone(hostDomain.parameterizedDomainContract);
tamperedHostDomain.actorPieceKey = "other-model";
const tamperedHost = certifyWarmachineGeometryPathTopologyV1(
  open.predicatePlan,
  open.cellPage,
  open.representatives,
  open.connectivity,
  state(),
  { hostParameterizedDomainContract: tamperedHostDomain },
);
assert.equal(tamperedHost.ok, false);
assert.ok(tamperedHost.validationIssues.includes(
  "host_parameterized_domain_hash_invalid",
));
assert.ok(tamperedHost.validationIssues.includes(
  "host_parameterized_domain_binding_mismatch",
));
assert.equal(tamperedHost.strictUniversalActionExecutionComplete, false);

assert.equal(open.topology.chanceMassAssigned, false);
assert.equal(rough.topology.chanceMassAssigned, false);
assert.equal(obstacle.topology.chanceMassAssigned, false);
assert.equal(unit.topology.chanceMassAssigned, false);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_geometry_path_topology_v1",
  openCertifiedCellCount: open.topology.certifiedCellCount,
  openPathClassCountPerFixedEndpoint:
    open.topology.cells[0].pathClassCountPerFixedEndpoint,
  roughCertifiedCellCount: rough.topology.certifiedCellCount,
  roughEventAutomatonFiniteBoundComplete:
    rough.topology.movementEventFiniteAutomatonBoundComplete,
  roughObservedPathCrossingCount:
    rough.topology.movementEventAutomaton.pathReplays[0].crossingCount,
  roughObservedDeclaredEventRegionEffectResolutionComplete:
    rough.topology
      .movementEventObservedDeclaredEventRegionEffectResolutionComplete,
  roughGeometricEventWordLanguageComplete:
    rough.topology.movementEventGeometricWordLanguageComplete,
  unreachableBoundaryGeometricEventWordLanguageComplete:
    unreachableHazard.topology.movementEventGeometricWordLanguageComplete,
  unreachableBoundaryEventWordDenominatorCount:
    unreachableHazard.topology.movementEventWordDenominatorCount,
  reachableBoundaryQuantizedEventWordDenominatorCount:
    reachableBoundaryTopology.movementEventWordDenominatorCount,
  obstacleCertifiedCellCount: obstacle.topology.certifiedCellCount,
  boundedObstacleFixedEndpointPathClassCount:
    boundedObstacle.topology.fixedEndpointObstaclePathCertificates[0]
      .pathClassCount,
  unitCertifiedCellCount: unit.topology.certifiedCellCount,
  strictUniversalActionExecutionComplete:
    open.topology.strictUniversalActionExecutionComplete,
  openRunStrictUniversalActionExecutionComplete:
    openRun.topology.strictUniversalActionExecutionComplete,
  transitionStable: open.topology.transitionStable,
  tamperedReceiptRejected: true,
  tamperedHostDomainRejected: true,
  chanceMassAssigned: false,
}, null, 2));
