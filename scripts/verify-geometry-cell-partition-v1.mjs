import assert from "node:assert/strict";

import {
  buildWarmachineGeometryCellPartitionPageV1,
} from "../src/geometry/cell-partition-v1.mjs";
import {
  buildWarmachineGeometryPredicatePlanV1,
} from "../src/geometry/predicate-plan-v1.mjs";

function piece(pieceKey, xIn, yIn, extra = {}) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey: "player1",
    position: { xIn, yIn },
    baseSizeIn: 2,
    speedIn: 6,
    boxesRemaining: 5,
    ...extra,
  };
}

function state(extra = {}) {
  return {
    stateKey: "cell-partition-fixture",
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 2,
    strictMode: true,
    enforceStrictExecutor: true,
    board: { widthIn: 48, heightIn: 48 },
    terrain: [],
    pieces: [piece("mover", 10, 10)],
    ...extra,
  };
}

const strategyContext = {
  initialDistributionReceiptHash: "initial",
  historyReceiptHash: "history",
  observationReceiptHash: "observation",
  reachabilityContextKey: "opening-a",
  remainingPly: 4,
};

const openPlan = buildWarmachineGeometryPredicatePlanV1(state(), {
  actorPieceKey: "mover",
  actionType: "advance",
  strategyContext,
});
const openPartition = buildWarmachineGeometryCellPartitionPageV1(openPlan);
assert.equal(openPartition.ok, true);
assert.equal(openPartition.requiredPredicateCount, 2);
assert.equal(openPartition.eventRegionCount, 0);
assert.equal(openPartition.totalPredicateSignatureCount, "1");
assert.equal(openPartition.pageCellCount, 1);
assert.equal(openPartition.nextCursor, null);
assert.equal(openPartition.declaredPredicateSignatureCoverageComplete, true);
assert.equal(openPartition.predicateSignaturePartitionComplete, true);
assert.equal(openPartition.cells[0].requiredPredicateAssignment.every((row) =>
  row.expected === true), true);
assert.equal(openPartition.cells[0].chanceMass, null);
assert.equal(openPartition.finiteGeometryCellPartitionReady, false);
assert.equal(openPartition.ruleBehaviorQuotientComplete, false);

const eventPlan = buildWarmachineGeometryPredicatePlanV1(state({
  terrain: [{
    terrainKey: "rough-a",
    type: "rough_terrain",
    xIn: 15,
    yIn: 15,
    widthIn: 4,
    heightIn: 4,
    roughTerrain: true,
    movementCostMultiplier: 2,
  }, {
    terrainKey: "rough-b",
    type: "rough_terrain",
    xIn: 20,
    yIn: 20,
    widthIn: 4,
    heightIn: 4,
    roughTerrain: true,
    movementCostMultiplier: 2,
  }],
}), {
  actorPieceKey: "mover",
  actionType: "run",
  strategyContext,
});
const firstPage = buildWarmachineGeometryCellPartitionPageV1(eventPlan, {
  cursor: 0,
  limit: 2,
});
assert.equal(firstPage.totalPredicateSignatureCount, "4");
assert.equal(firstPage.pageCellCount, 2);
assert.equal(firstPage.nextCursor, "2");
assert.equal(firstPage.declaredPredicateSignatureCoverageComplete, false);
assert.equal(firstPage.predicateSignaturePartitionComplete, false);
const secondPage = buildWarmachineGeometryCellPartitionPageV1(eventPlan, {
  cursor: firstPage.nextCursor,
  limit: 2,
});
assert.equal(secondPage.nextCursor, null);
assert.equal(secondPage.predicateSignaturePartitionComplete, true);
assert.deepEqual(
  [...firstPage.cells, ...secondPage.cells].map((cell) =>
    cell.eventRegionAssignment.map((row) => row.expectedInside)),
  [[false, false], [true, false], [false, true], [true, true]],
);
assert.equal(new Set([...firstPage.cells, ...secondPage.cells]
  .map((cell) => cell.cellKey)).size, 4);

const unitPlan = buildWarmachineGeometryPredicatePlanV1(state({
  pieces: [
    piece("mover", 10, 10, { unitGroupId: "unit" }),
    piece("sibling", 10, 13, { unitGroupId: "unit" }),
  ],
}), {
  actorPieceKey: "mover",
  actionType: "advance",
  strategyContext,
});
const unitPartition = buildWarmachineGeometryCellPartitionPageV1(unitPlan);
assert.equal(unitPartition.predicateSignaturePartitionComplete, false);
assert.ok(unitPartition.completionDebts.includes("endpoint_predicate_plan_not_exact"));

const tamperedPlan = structuredClone(openPlan);
tamperedPlan.predicates[0].relationKind = "invented_relation";
const tamperedPartition = buildWarmachineGeometryCellPartitionPageV1(tamperedPlan);
assert.equal(tamperedPartition.ok, false);
assert.ok(tamperedPartition.completionDebts.includes(
  "geometry_predicate_plan_receipt_hash_mismatch",
));

console.log(JSON.stringify({
  ok: true,
  marker: "complete_declared_predicate_signature_cursor_without_geometry_overclaim_v1",
  openSignatureCount: openPartition.totalPredicateSignatureCount,
  eventSignatureCount: firstPage.totalPredicateSignatureCount,
  paginatedSignatureCount: firstPage.pageCellCount + secondPage.pageCellCount,
  chanceMassAssigned: firstPage.chanceMassAssigned,
  geometricNonemptinessComplete: secondPage.geometricNonemptinessComplete,
  pathClassPartitionComplete: secondPage.pathClassPartitionComplete,
  transitionStable: secondPage.transitionStable,
  tamperedPredicatePlanRejected: tamperedPartition.ok === false,
}, null, 2));
