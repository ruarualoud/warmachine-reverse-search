import assert from "node:assert/strict";

import { buildWarmachineMovementEventAutomatonV1 } from
  "../src/geometry/movement-event-automaton-v1.mjs";
import { buildWarmachineGeometryPredicatePlanV1 } from
  "../src/geometry/predicate-plan-v1.mjs";
import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import { evaluateRulesV1MovementGeometryPath } from
  "../src/warmachine-host-runtime.mjs";

function state({ terrain = null } = {}) {
  return {
    stateKey: "geometry-movement-event-automaton",
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 1,
    strictMode: true,
    enforceStrictExecutor: true,
    board: { widthIn: 48, heightIn: 48 },
    terrain: terrain || [{
      terrainKey: "repeat-acid-pool",
      type: "acid pool",
      xIn: 14,
      yIn: 10,
      widthIn: 1,
      heightIn: 1,
      isHazard: true,
      hazardEffectTypes: ["corrosion"],
    }],
    pieces: [{
      pieceKey: "mover",
      label: "mover",
      sideKey: "player1",
      position: { xIn: 10, yIn: 10 },
      baseSizeIn: 2,
      speedIn: 20,
      boxesRemaining: 5,
    }],
  };
}

function plan(inputState) {
  return buildWarmachineGeometryPredicatePlanV1(inputState, {
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
}

function evaluate(inputState, pathPoints) {
  return evaluateRulesV1MovementGeometryPath(inputState, {
    actorPieceKey: "mover",
    actionType: "advance",
    pathPoints,
  });
}

function rehashPathEvaluation(pathEvaluation) {
  const core = { ...pathEvaluation };
  delete core.pathEvaluationHash;
  return {
    ...core,
    pathEvaluationHash: stableGraphHash(core),
  };
}

const repeatedState = state();
const repeatedPlan = plan(repeatedState);
const repeatedPath = evaluate(repeatedState, [
  { xIn: 10, yIn: 10 },
  { xIn: 14, yIn: 10 },
  { xIn: 10, yIn: 10 },
  { xIn: 18, yIn: 10 },
]);
const aroundPath = evaluate(repeatedState, [
  { xIn: 10, yIn: 10 },
  { xIn: 10, yIn: 16 },
  { xIn: 18, yIn: 16 },
]);
const repeated = buildWarmachineMovementEventAutomatonV1(
  repeatedPlan,
  [repeatedPath, aroundPath],
);
assert.equal(repeated.ok, true);
assert.equal(repeated.finiteAutomatonBoundComplete, true);
assert.equal(repeated.observedPathTraceReplayComplete, true);
assert.equal(repeated.eventRegionCount, 1);
assert.equal(repeated.maximumLegalPathSegmentCount, 2000);
assert.equal(repeated.maximumBoundaryCrossingCount, 4000);
assert.equal(repeated.maximumFiniteStateUpperBound, "8002");
assert.equal(repeated.pathReplays[0].crossingCount, 4);
assert.equal(repeated.pathReplays[0].transitionCount, 4);
assert.deepEqual(repeated.pathReplays[0].initialInsideRegionKeys, []);
assert.deepEqual(repeated.pathReplays[0].finalInsideRegionKeys, []);
assert.equal(repeated.pathReplays[1].crossingCount, 0);
assert.equal(repeated.geometricEventWordLanguageComplete, false);
assert.equal(repeated.rulesEffectResolutionComplete, false);
assert.equal(repeated.transitionStable, false);
assert.equal(repeated.chanceMassAssigned, false);

const boundaryPath = evaluate(repeatedState, [
  { xIn: 10, yIn: 10 },
  { xIn: 12.5, yIn: 10 },
]);
const boundary = buildWarmachineMovementEventAutomatonV1(
  repeatedPlan,
  [boundaryPath],
);
assert.equal(boundary.ok, true);
assert.equal(boundary.pathReplays[0].crossingCount, 1);
assert.deepEqual(boundary.pathReplays[0].transitions[0].crossingLabels, [{
  eventRegionKey: "terrain-hazard:repeat-acid-pool",
  crossingKind: "enter",
}]);
assert.deepEqual(boundary.pathReplays[0].finalInsideRegionKeys, [
  "terrain-hazard:repeat-acid-pool",
]);

const tangentState = state({ terrain: [{
  terrainKey: "tangent-rough",
  type: "rough_terrain",
  xIn: 14,
  yIn: 12,
  widthIn: 2,
  heightIn: 2,
  roughTerrain: true,
  movementCostMultiplier: 2,
}] });
tangentState.pieces[0].position = { xIn: 10, yIn: 12 };
const tangentPlan = plan(tangentState);
const tangentPath = evaluate(tangentState, [
  { xIn: 10, yIn: 12 },
  { xIn: 14, yIn: 8 },
]);
const tangent = buildWarmachineMovementEventAutomatonV1(
  tangentPlan,
  [tangentPath],
);
assert.equal(tangent.ok, true);
assert.equal(tangent.pathReplays[0].crossingCount, 2);
assert.deepEqual(tangent.pathReplays[0].transitions.map((transition) =>
  transition.crossingLabels.map((row) => row.crossingKind)), [
  ["enter"],
  ["exit"],
]);
assert.notEqual(
  tangent.pathReplays[0].transitions[0].simultaneousCrossingGroupKey,
  tangent.pathReplays[0].transitions[1].simultaneousCrossingGroupKey,
);

const forgedPath = structuredClone(repeatedPath);
forgedPath.orderedBoundaryCrossingTrace[0].crossingKind = "exit";
const forged = buildWarmachineMovementEventAutomatonV1(
  repeatedPlan,
  [rehashPathEvaluation(forgedPath)],
);
assert.equal(forged.ok, false);
assert.ok(forged.validationIssues.includes(
  "path_0:exit_requires_inside:terrain-hazard:repeat-acid-pool",
));

const simultaneousState = state({ terrain: [{
  terrainKey: "fire-pool",
  type: "fire pit",
  xIn: 14,
  yIn: 10,
  widthIn: 1,
  heightIn: 1,
  isHazard: true,
  hazardEffectTypes: ["fire"],
}, {
  terrainKey: "acid-pool",
  type: "acid pool",
  xIn: 14,
  yIn: 10,
  widthIn: 1,
  heightIn: 1,
  isHazard: true,
  hazardEffectTypes: ["corrosion"],
}] });
const simultaneousPlan = plan(simultaneousState);
const simultaneousPath = evaluate(simultaneousState, [
  { xIn: 10, yIn: 10 },
  { xIn: 18, yIn: 10 },
]);
const simultaneous = buildWarmachineMovementEventAutomatonV1(
  simultaneousPlan,
  [simultaneousPath],
);
assert.equal(simultaneous.ok, true);
assert.equal(simultaneous.observedPathTraceReplayComplete, true);
assert.equal(simultaneous.eventRegionCount, 2);
assert.equal(simultaneous.pathReplays[0].crossingCount, 4);
assert.equal(simultaneous.pathReplays[0].transitionCount, 2);
assert.equal(simultaneous.simultaneousRuleOrderDebtCount, 0);
assert.equal(
  simultaneous.observedDeclaredEventRegionEffectResolutionComplete,
  true,
);
assert.equal(simultaneous.pathReplays[0].transitions[0]
  .membershipTransitionOrderIndependent, true);
assert.equal(simultaneous.pathReplays[0].transitions[0]
  .rulesEffectOrderProven, false);
assert.equal(simultaneous.pathReplays[0].transitions[0]
  .rulesEffectSuccessorConfluenceProven, true);
assert.equal(simultaneous.pathReplays[0].transitions[0]
  .declaredEventRegionEffectResolutionProven, true);
assert.equal(simultaneous.completionDebts.includes(
  "simultaneous_event_rule_order_unresolved",
), false);

const forgedConfluencePath = structuredClone(simultaneousPath);
forgedConfluencePath.simultaneousEventEffectResolutions[0]
  .successorConfluenceProven = false;
const forgedConfluence = buildWarmachineMovementEventAutomatonV1(
  simultaneousPlan,
  [rehashPathEvaluation(forgedConfluencePath)],
);
assert.equal(forgedConfluence.ok, false);
assert.ok(forgedConfluence.validationIssues.includes(
  "path_0:movement_event_effect_resolution_receipt_invalid",
));

const tamperedPlan = structuredClone(repeatedPlan);
tamperedPlan.maximumDeclaredEventRegionBoundaryCrossingCount += 1;
const tampered = buildWarmachineMovementEventAutomatonV1(
  tamperedPlan,
  [repeatedPath],
);
assert.equal(tampered.ok, false);
assert.ok(tampered.validationIssues.includes(
  "movement_event_automaton_predicate_plan_invalid",
));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_movement_event_automaton_v1",
  eventRegionCount: repeated.eventRegionCount,
  maximumLegalPathSegmentCount: repeated.maximumLegalPathSegmentCount,
  maximumBoundaryCrossingCount: repeated.maximumBoundaryCrossingCount,
  maximumFiniteStateUpperBound: repeated.maximumFiniteStateUpperBound,
  repeatedEnterExitCrossingCount: repeated.pathReplays[0].crossingCount,
  aroundCrossingCount: repeated.pathReplays[1].crossingCount,
  closedBoundaryEndpointAccepted: true,
  tangentEnterExitOrderAccepted: true,
  forgedTraceRejected: true,
  simultaneousMembershipReplayAccepted: true,
  simultaneousPureStatusSuccessorConfluenceAccepted: true,
  forgedConfluenceRejected: true,
  geometricEventWordLanguageComplete:
    repeated.geometricEventWordLanguageComplete,
  transitionStable: repeated.transitionStable,
  chanceMassAssigned: repeated.chanceMassAssigned,
}, null, 2));
