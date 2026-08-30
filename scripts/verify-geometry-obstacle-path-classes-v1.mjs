import assert from "node:assert/strict";

import { buildWarmachineGeometryCellPartitionPageV1 } from
  "../src/geometry/cell-partition-v1.mjs";
import { certifyWarmachineEndpointCellConnectivityV1 } from
  "../src/geometry/cell-connectivity-v1.mjs";
import { certifyWarmachineFixedEndpointObstaclePathClassesV1 } from
  "../src/geometry/fixed-endpoint-obstacle-path-classes-v1.mjs";
import { buildWarmachineGeometryPredicatePlanV1 } from
  "../src/geometry/predicate-plan-v1.mjs";
import {
  materializeWarmachineGeometryCellRepresentativesV1,
  materializeWarmachineStrictMovementPathWitnessV1,
} from "../src/geometry/strict-representative-v1.mjs";
import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";

function state({
  speedIn = 12,
  actorPosition = { xIn: 10, yIn: 10 },
  obstaclePosition = { xIn: 14, yIn: 10 },
  terrain = null,
} = {}) {
  return {
    stateKey: "geometry-obstacle-path-classes",
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 1,
    strictMode: true,
    enforceStrictExecutor: true,
    board: { widthIn: 48, heightIn: 48 },
    terrain: terrain || [{
      terrainKey: "wall",
      type: "obstruction",
      ...obstaclePosition,
      widthIn: 2,
      heightIn: 2,
      blocksMovement: true,
    }],
    pieces: [{
      pieceKey: "mover",
      label: "mover",
      sideKey: "player1",
      position: actorPosition,
      baseSizeIn: 2,
      speedIn,
      boxesRemaining: 5,
    }],
  };
}

function domain(
  inputState,
  destination,
  actionType = "advance",
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
  const cellPage = buildWarmachineGeometryCellPartitionPageV1(
    predicatePlan,
    { limit: 16 },
  );
  const representatives = materializeWarmachineGeometryCellRepresentativesV1(
    inputState,
    predicatePlan,
    cellPage,
    {
      candidatePoints: [destination],
      maximumCandidateCount: 256,
      maximumStrictAttemptsPerCell: 8,
    },
  );
  const connectivity = certifyWarmachineEndpointCellConnectivityV1(
    predicatePlan,
    cellPage,
    representatives,
  );
  const certificate = certifyWarmachineFixedEndpointObstaclePathClassesV1(
    inputState,
    predicatePlan,
    cellPage,
    representatives,
    connectivity,
    { destination },
  );
  return {
    predicatePlan,
    cellPage,
    representatives,
    connectivity,
    certificate,
  };
}

function receiptValid(receipt, hashKey) {
  const core = { ...receipt };
  const hash = core[hashKey];
  delete core[hashKey];
  return Boolean(hash) && stableGraphHash(core) === hash;
}

const horizontal = domain(state(), { xIn: 18, yIn: 10 });
assert.equal(horizontal.certificate.ok, true);
assert.equal(horizontal.certificate.fixedEndpointPathClassComplete, true);
assert.equal(horizontal.certificate.pathClassCount, 2);
assert.equal(horizontal.certificate.antipodalAxis, "horizontal");
assert.equal(horizontal.certificate.allowanceExcludesAllOtherWindingClasses, true);
assert.equal(horizontal.certificate.pathClasses.length, 2);
assert.deepEqual(horizontal.certificate.pathClasses.map((row) =>
  row.pathClassKey).sort(), [
  "clockwise_half_turn",
  "counterclockwise_half_turn",
]);
assert.ok(horizontal.certificate.pathClasses.every((row) =>
  row.strictTransitionAccepted === true && row.movementCostIn < 12));
assert.equal(horizontal.certificate.strictRepresentativeCoverageComplete, true);
assert.equal(horizontal.certificate.strictUniversalActionExecutionComplete, false);
assert.equal(horizontal.certificate.transitionStable, false);
assert.equal(horizontal.certificate.chanceMassAssigned, false);
assert.equal(receiptValid(
  horizontal.certificate,
  "fixedEndpointObstaclePathClassesReceiptHash",
), true);

const vertical = domain(state({
  actorPosition: { xIn: 14, yIn: 10 },
  obstaclePosition: { xIn: 14, yIn: 14 },
}), { xIn: 14, yIn: 18 });
assert.equal(vertical.certificate.fixedEndpointPathClassComplete, true);
assert.equal(vertical.certificate.antipodalAxis, "vertical");
assert.equal(vertical.certificate.pathClassCount, 2);

const run = domain(state({ speedIn: 7 }), { xIn: 18, yIn: 10 }, "run");
assert.equal(run.certificate.fixedEndpointPathClassComplete, true);
assert.equal(run.certificate.movementAllowanceIn, 12);
assert.equal(run.certificate.pathClasses.length, 2);

const directBlocked = materializeWarmachineStrictMovementPathWitnessV1(
  state(),
  horizontal.predicatePlan,
  {
    candidateKey: "blocked-direct-path",
    pathPoints: [{ xIn: 10, yIn: 10 }, { xIn: 18, yIn: 10 }],
  },
);
assert.equal(directBlocked.ok, false);
assert.ok(directBlocked.issues.includes("strict_path_witness_not_executed"));

const tooMuchAllowance = domain(state({ speedIn: 20 }), { xIn: 18, yIn: 10 });
assert.equal(tooMuchAllowance.certificate.ok, true);
assert.equal(tooMuchAllowance.certificate.fixedEndpointPathClassComplete, false);
assert.ok(tooMuchAllowance.certificate.unsupportedReasons.includes(
  "obstacle_path_additional_winding_classes_not_excluded",
));

const notAntipodal = domain(state(), { xIn: 18, yIn: 11 });
assert.equal(notAntipodal.certificate.ok, true);
assert.equal(notAntipodal.certificate.fixedEndpointPathClassComplete, false);
assert.ok(notAntipodal.certificate.unsupportedReasons.includes(
  "obstacle_path_endpoints_not_antipodal",
));

const roughAndObstacle = domain(state({ terrain: [{
  terrainKey: "wall",
  type: "obstruction",
  xIn: 14,
  yIn: 10,
  widthIn: 2,
  heightIn: 2,
  blocksMovement: true,
}, {
  terrainKey: "rough",
  type: "rough_terrain",
  xIn: 10,
  yIn: 14,
  widthIn: 2,
  heightIn: 2,
  roughTerrain: true,
  movementCostMultiplier: 2,
}] }), { xIn: 18, yIn: 10 });
assert.equal(roughAndObstacle.certificate.fixedEndpointPathClassComplete, false);
assert.ok(roughAndObstacle.certificate.unsupportedReasons.includes(
  "obstacle_path_event_regions_present",
));

const twoObstacles = domain(state({ terrain: [{
  terrainKey: "wall-a",
  type: "obstacle",
  xIn: 14,
  yIn: 10,
  widthIn: 2,
  heightIn: 2,
  blocksMovement: true,
}, {
  terrainKey: "wall-b",
  type: "obstacle",
  xIn: 14,
  yIn: 16,
  widthIn: 2,
  heightIn: 2,
  blocksMovement: true,
}] }), { xIn: 18, yIn: 10 });
assert.equal(twoObstacles.certificate.fixedEndpointPathClassComplete, false);
assert.ok(twoObstacles.certificate.unsupportedReasons.includes(
  "obstacle_path_canonical_predicate_family_mismatch",
));

const tamperedConnectivity = structuredClone(horizontal.connectivity);
tamperedConnectivity.cells[0].cellKey = "tampered";
const tampered = certifyWarmachineFixedEndpointObstaclePathClassesV1(
  state(),
  horizontal.predicatePlan,
  horizontal.cellPage,
  horizontal.representatives,
  tamperedConnectivity,
  { destination: { xIn: 18, yIn: 10 } },
);
assert.equal(tampered.ok, false);
assert.ok(tampered.validationIssues.includes("obstacle_path_connectivity_invalid"));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_geometry_obstacle_path_classes_v1",
  horizontalPathClassCount: horizontal.certificate.pathClassCount,
  verticalPathClassCount: vertical.certificate.pathClassCount,
  runPathClassCount: run.certificate.pathClassCount,
  additionalWindingLowerBoundIn:
    horizontal.certificate.additionalWindingClassLowerBoundIn,
  strictWitnessCount: horizontal.certificate.pathClasses.length,
  directBlockedRejected: true,
  longAllowanceFailClosed: true,
  nonAntipodalFailClosed: true,
  eventSurfaceFailClosed: true,
  multipleObstacleFailClosed: true,
  tamperedReceiptRejected: true,
  transitionStable: false,
  chanceMassAssigned: false,
}, null, 2));
