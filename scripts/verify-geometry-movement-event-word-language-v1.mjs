import assert from "node:assert/strict";

import { buildWarmachineGeometryPredicatePlanV1 } from
  "../src/geometry/predicate-plan-v1.mjs";
import { buildWarmachineMovementEventAutomatonV1 } from
  "../src/geometry/movement-event-automaton-v1.mjs";
import { buildWarmachineMovementEventWordLanguageV1 } from
  "../src/geometry/movement-event-word-language-v1.mjs";
import { evaluateRulesV1MovementGeometryPath } from
  "../src/warmachine-host-runtime.mjs";

function state(hazardXIn) {
  return {
    stateKey: `event-word-language-${hazardXIn}`,
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 1,
    strictMode: true,
    enforceStrictExecutor: true,
    board: { widthIn: 48, heightIn: 48 },
    terrain: [{
      terrainKey: "acid-pool",
      type: "acid pool",
      xIn: hazardXIn,
      yIn: 10,
      widthIn: 2,
      heightIn: 2,
      isHazard: true,
      hazardEffectTypes: ["corrosion"],
    }],
    pieces: [{
      pieceKey: "mover",
      label: "mover",
      sideKey: "player1",
      position: { xIn: 10, yIn: 10 },
      baseSizeIn: 2,
      speedIn: 6,
      boxesRemaining: 5,
    }],
  };
}

function strategyContext() {
  return {
    initialDistributionReceiptHash: "initial",
    historyReceiptHash: "history",
    observationReceiptHash: "observation",
    reachabilityContextKey: "reachable",
    remainingPly: 2,
  };
}

function bundle(inputState, destination) {
  const predicatePlan = buildWarmachineGeometryPredicatePlanV1(inputState, {
    actorPieceKey: "mover",
    actionType: "advance",
    strategyContext: strategyContext(),
  });
  const pathEvaluation = evaluateRulesV1MovementGeometryPath(inputState, {
    actorPieceKey: "mover",
    actionType: "advance",
    pathPoints: [
      { xIn: 10, yIn: 10 },
      destination,
    ],
  });
  const automaton = buildWarmachineMovementEventAutomatonV1(
    predicatePlan,
    [pathEvaluation],
  );
  return { predicatePlan, automaton };
}

const unreachable = bundle(state(30), { xIn: 12, yIn: 10 });
const language = buildWarmachineMovementEventWordLanguageV1(
  unreachable.predicatePlan,
  unreachable.automaton,
);
assert.equal(language.ok, true);
assert.equal(language.geometricEventWordLanguageComplete, true);
assert.equal(language.boundaryUnreachableScopeComplete, true);
assert.equal(language.eventWordDenominatorCount, 1);
assert.equal(language.eventWords[0].crossingCount, 0);
assert.deepEqual(language.eventWords[0].crossingLabels, []);
assert.deepEqual(language.eventWords[0].initialInsideRegionKeys, []);
assert.deepEqual(language.eventWords[0].finalInsideRegionKeys, []);
assert.equal(language.allLegalPathsCoveredByEventWordDenominator, true);
assert.equal(language.rulesEffectResolutionComplete, false);
assert.equal(language.transitionStable, false);
assert.equal(language.chanceMassAssigned, false);

const reachable = bundle(state(14), { xIn: 11, yIn: 10 });
const unresolved = buildWarmachineMovementEventWordLanguageV1(
  reachable.predicatePlan,
  reachable.automaton,
);
assert.equal(unresolved.ok, true);
assert.equal(unresolved.geometricEventWordLanguageComplete, false);
assert.equal(unresolved.boundaryUnreachableScopeComplete, false);
assert.equal(unresolved.eventWordDenominatorCount, 0);
assert.ok(unresolved.completionDebts.includes(
  "reachable_event_boundary_language_not_materialized",
));

const boundaryStartState = state(12);
boundaryStartState.terrain = [{
  terrainKey: "rough-patch",
  type: "rough_terrain",
  xIn: 12,
  yIn: 10,
  widthIn: 2,
  heightIn: 2,
  roughTerrain: true,
  movementCostMultiplier: 2,
}];
const boundaryStart = bundle(boundaryStartState, { xIn: 9.5, yIn: 10 });
assert.equal(boundaryStart.predicatePlan.eventRegions[0].actorStartInside, true);
assert.equal(boundaryStart.predicatePlan.eventRegions[0].actorStartOnBoundary, true);
const boundaryStartLanguage = buildWarmachineMovementEventWordLanguageV1(
  boundaryStart.predicatePlan,
  boundaryStart.automaton,
);
assert.equal(boundaryStartLanguage.ok, true);
assert.equal(boundaryStartLanguage.geometricEventWordLanguageComplete, false);
assert.ok(boundaryStartLanguage.boundaryUnreachabilityIssues.includes(
  "event_boundary_start_requires_reachable_language_solver:terrain-cost:rough-patch",
));
assert.equal(boundaryStartLanguage.boundaryUnreachabilityIssues.some((issue) =>
  issue.includes("ambiguous")), false);

const noWitness = buildWarmachineMovementEventWordLanguageV1(
  unreachable.predicatePlan,
  buildWarmachineMovementEventAutomatonV1(unreachable.predicatePlan, []),
);
assert.equal(noWitness.geometricEventWordLanguageComplete, false);
assert.ok(noWitness.completionDebts.includes(
  "empty_event_word_strict_witness_missing",
));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_movement_event_word_language_v1",
  unreachableEventRegionCount: language.eventRegionCount,
  eventWordDenominatorCount: language.eventWordDenominatorCount,
  allLegalPathsCoveredByEventWordDenominator:
    language.allLegalPathsCoveredByEventWordDenominator,
  reachableBoundaryRejectedFromCompleteScope: true,
  closedBoundaryStartExactButReachableSolverRequired: true,
  witnessRequired: true,
  geometricEventWordLanguageComplete:
    language.geometricEventWordLanguageComplete,
  rulesEffectResolutionComplete: language.rulesEffectResolutionComplete,
  transitionStable: language.transitionStable,
  chanceMassAssigned: language.chanceMassAssigned,
}, null, 2));
