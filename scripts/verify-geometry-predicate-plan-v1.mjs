import assert from "node:assert/strict";

import {
  buildWarmachineGeometryPredicatePlanV1,
} from "../src/geometry/predicate-plan-v1.mjs";
import {
  buildRulesV1MovementGeometryPredicatePlan,
} from "../src/warmachine-host-runtime.mjs";

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
    stateKey: "search-predicate-plan",
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

const completeStrategyContext = {
  initialDistributionReceiptHash: "initial-distribution-receipt",
  historyReceiptHash: "history-receipt-a",
  observationReceiptHash: "public-observation-receipt",
  reachabilityContextKey: "reachable-from-declared-opening-a",
  remainingPly: 4,
};

const open = buildWarmachineGeometryPredicatePlanV1(state(), {
  actorPieceKey: "mover",
  actionType: "advance",
  strategyContext: completeStrategyContext,
});
assert.equal(open.ok, true);
assert.equal(open.hostPredicatePlanHashMatches, true);
assert.equal(open.strategyComparisonContextBound, true);
assert.ok(open.strategyComparisonContextHash);
assert.deepEqual(open.actorPosition, { xIn: 10, yIn: 10 });
assert.equal(open.predicates.length, 2);
assert.equal(open.endpointPredicatePlanExact, true);
assert.equal(open.continuousChoiceKind, "player_choice_not_chance");
assert.equal(open.chanceMassAssigned, false);
assert.equal(open.ruleBehaviorQuotientComplete, false);
assert.equal(open.strategyQuotientAuthority, false);
assert.ok(open.completionDebts.includes("finite_geometry_cell_partition_not_built"));

const differentHistory = buildWarmachineGeometryPredicatePlanV1(state(), {
  actorPieceKey: "mover",
  actionType: "advance",
  strategyContext: {
    ...completeStrategyContext,
    historyReceiptHash: "history-receipt-b",
  },
});
assert.notEqual(
  differentHistory.strategyComparisonContextHash,
  open.strategyComparisonContextHash,
);
assert.equal(differentHistory.ruleBehaviorContextHash, open.ruleBehaviorContextHash);

const obstacleState = state({
  terrain: [{
    terrainKey: "rotated-wall",
    type: "obstruction",
    xIn: 20,
    yIn: 20,
    widthIn: 6,
    heightIn: 2,
    rotationDegrees: 30,
    blocksMovement: true,
  }, {
    terrainKey: "rough",
    type: "rough_terrain",
    xIn: 15,
    yIn: 15,
    widthIn: 4,
    heightIn: 4,
    roughTerrain: true,
    movementCostMultiplier: 2,
  }],
  pieces: [
    piece("mover", 10, 10),
    piece("enemy", 14, 10, { sideKey: "player2" }),
  ],
});
const obstacle = buildWarmachineGeometryPredicatePlanV1(obstacleState, {
  actorPieceKey: "mover",
  actionType: "run",
  strategyContext: completeStrategyContext,
});
assert.equal(obstacle.ok, true);
assert.equal(obstacle.configurationObstacles.length, 2);
assert.equal(obstacle.eventRegions.length, 1);
assert.ok(obstacle.wildcardDebts.some((row) =>
  row.reason === "enemy_model_movement_reaction_partition_required"));
assert.ok(obstacle.wildcardDebts.some((row) =>
  row.reason === "movement_cost_path_partition_required"));

const unit = buildWarmachineGeometryPredicatePlanV1(state({
  pieces: [
    piece("mover", 10, 10, { unitGroupId: "unit-a" }),
    piece("sibling", 10, 13, { unitGroupId: "unit-a" }),
  ],
}), {
  actorPieceKey: "mover",
  actionType: "advance",
});
assert.equal(unit.strategyComparisonContextBound, false);
assert.equal(unit.endpointPredicatePlanExact, false);
assert.ok(unit.completionDebts.some((reason) =>
  reason === "host_wildcard:unit_group_geometry_requires_factored_unit_domain"));

const hostPlan = buildRulesV1MovementGeometryPredicatePlan(state(), {
  actorPieceKey: "mover",
  actionType: "advance",
});
const tamperedPlan = structuredClone(hostPlan);
tamperedPlan.predicates[1].primitive.radiusIn = 99;
const tampered = buildWarmachineGeometryPredicatePlanV1(state(), {
  actorPieceKey: "mover",
  actionType: "advance",
  hostPlan: tamperedPlan,
  strategyContext: completeStrategyContext,
});
assert.equal(tampered.ok, false);
assert.equal(tampered.hostPredicatePlanHashMatches, false);
assert.ok(tampered.completionDebts.includes("host_predicate_plan_hash_mismatch"));

console.log(JSON.stringify({
  ok: true,
  marker: "search_consumes_source_bound_engine_predicate_plan_v1",
  predicatePlanReceiptHash: open.predicatePlanReceiptHash,
  hostPredicatePlanHash: open.hostPredicatePlanHash,
  strategyHistoryContextSeparated: true,
  rotatedObstaclePreserved: obstacle.configurationObstacles.some((row) =>
    row.primitive.primitiveKind === "rounded_rotated_rectangle_exclusion"),
  hostWildcardDebtCount: obstacle.wildcardDebts.length,
  tamperedHostPlanRejected: tampered.ok === false,
  ruleBehaviorQuotientComplete: open.ruleBehaviorQuotientComplete,
}, null, 2));
