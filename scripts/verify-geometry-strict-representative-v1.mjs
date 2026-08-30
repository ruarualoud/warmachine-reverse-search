import assert from "node:assert/strict";

import { buildWarmachineGeometryCellPartitionPageV1 } from
  "../src/geometry/cell-partition-v1.mjs";
import { buildWarmachineGeometryPredicatePlanV1 } from
  "../src/geometry/predicate-plan-v1.mjs";
import {
  buildWarmachineGeometryWitnessCandidatesV1,
  materializeWarmachineGeometryCellRepresentativesV1,
} from "../src/geometry/strict-representative-v1.mjs";

function piece({ pieceKey, xIn, yIn, speedIn = 6 }) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey: "player1",
    position: { xIn, yIn },
    baseSizeIn: 2,
    speedIn,
    boxesRemaining: 5,
  };
}

function state(terrain, speedIn = 6) {
  return {
    stateKey: `geometry-strict-representative:${terrain.terrainKey}`,
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 1,
    strictMode: true,
    enforceStrictExecutor: true,
    board: { widthIn: 48, heightIn: 48 },
    terrain: [terrain],
    pieces: [piece({ pieceKey: "mover", xIn: 10, yIn: 10, speedIn })],
  };
}

function plan(inputState) {
  return buildWarmachineGeometryPredicatePlanV1(inputState, {
    actorPieceKey: "mover",
    actionType: "advance",
    strategyContext: {
      initialDistributionReceiptHash: "initial-distribution",
      historyReceiptHash: "history",
      observationReceiptHash: "observation",
      reachabilityContextKey: "reachability",
      remainingPly: 3,
    },
  });
}

const reachableState = state({
  terrainKey: "reachable-rough",
  type: "rough_terrain",
  xIn: 14,
  yIn: 10,
  widthIn: 2,
  heightIn: 2,
  roughTerrain: true,
  movementCostMultiplier: 2,
});
const reachablePlan = plan(reachableState);
const reachablePage = buildWarmachineGeometryCellPartitionPageV1(
  reachablePlan,
  { limit: 8 },
);
assert.equal(reachablePage.pageCellCount, 2);

const candidateSet = buildWarmachineGeometryWitnessCandidatesV1(
  reachablePlan,
  {
    candidatePoints: [
      { xIn: 11, yIn: 10, sourceKey: "outside-rough" },
      { xIn: 14, yIn: 10, sourceKey: "inside-rough" },
    ],
    maximumCandidateCount: 256,
  },
);
assert.ok(candidateSet.candidateCount >= 2);
assert.equal(candidateSet.completenessClaim, false);

const reachable = materializeWarmachineGeometryCellRepresentativesV1(
  reachableState,
  reachablePlan,
  reachablePage,
  {
    candidatePoints: [
      { xIn: 11, yIn: 10, sourceKey: "outside-rough" },
      { xIn: 14, yIn: 10, sourceKey: "inside-rough" },
    ],
    maximumCandidateCount: 256,
    maximumStrictAttemptsPerCell: 4,
  },
);
assert.equal(reachable.ok, true);
assert.equal(reachable.representedCellCount, 2);
assert.equal(reachable.unresolvedCellCount, 0);
assert.equal(reachable.declaredSignatureStrictWitnessCoverageComplete, true);
assert.equal(reachable.strictRepresentativeCoverageComplete, false);
assert.equal(reachable.transitionStable, false);
assert.equal(reachable.ruleBehaviorQuotientComplete, false);
assert.equal(reachable.chanceMassAssigned, false);
assert.equal(reachable.cells.every((cell) =>
  cell.strictRepresentativeStatus === "strict_existence_witness_found"), true);
assert.equal(reachable.cells.every((cell) =>
  cell.strictWitness?.strictTransitionAccepted === true), true);
assert.equal(reachable.cells.every((cell) =>
  cell.strictWitness?.chanceMassAssigned === false), true);
assert.equal(reachable.cells.every((cell) =>
  cell.strictWitness?.hostParameterizedActionReceipt?.schemaVersion ===
    "warmachine_parameterized_movement_action_v1"), true);

const unreachableState = state({
  terrainKey: "far-rough",
  type: "rough_terrain",
  xIn: 30,
  yIn: 30,
  widthIn: 2,
  heightIn: 2,
  roughTerrain: true,
  movementCostMultiplier: 2,
});
const unreachablePlan = plan(unreachableState);
const unreachablePage = buildWarmachineGeometryCellPartitionPageV1(
  unreachablePlan,
  { limit: 8 },
);
const unresolved = materializeWarmachineGeometryCellRepresentativesV1(
  unreachableState,
  unreachablePlan,
  unreachablePage,
  {
    candidatePoints: [
      { xIn: 11, yIn: 10, sourceKey: "reachable-outside" },
      { xIn: 30, yIn: 30, sourceKey: "unreachable-inside" },
    ],
    maximumCandidateCount: 256,
    maximumStrictAttemptsPerCell: 4,
  },
);
assert.equal(unresolved.ok, true);
assert.equal(unresolved.representedCellCount, 1);
assert.equal(unresolved.unresolvedCellCount, 1);
assert.equal(unresolved.declaredSignatureStrictWitnessCoverageComplete, false);
const unresolvedCell = unresolved.cells.find((cell) =>
  cell.strictRepresentativeStatus === "unresolved_no_strict_witness_found");
assert.ok(unresolvedCell);
assert.equal(unresolvedCell.disposition, "unresolved_not_proven_empty_or_unreachable");
assert.equal(unresolvedCell.emptyCellProven, false);
assert.equal(unresolvedCell.unreachableCellProven, false);
assert.equal(unresolvedCell.chanceMass, null);
assert.ok(unresolved.completionDebts.includes(
  "finite_candidate_failure_does_not_prove_empty_signature",
));
assert.ok(unresolved.completionDebts.includes(
  "declared_signatures_without_strict_witness",
));
assert.equal(unresolved.chanceMassAssigned, false);

const pathState = state({
  terrainKey: "path-rough",
  type: "rough_terrain",
  xIn: 12,
  yIn: 10,
  widthIn: 1,
  heightIn: 1,
  roughTerrain: true,
  movementCostMultiplier: 2,
}, 20);
const pathPlan = plan(pathState);
const pathPage = buildWarmachineGeometryCellPartitionPageV1(pathPlan, { limit: 8 });
const pathRepresentatives = materializeWarmachineGeometryCellRepresentativesV1(
  pathState,
  pathPlan,
  pathPage,
  {
    candidatePoints: [{
      point: { xIn: 14, yIn: 10 },
      sourceKey: "through-rough",
      pathPoints: [
        { xIn: 10, yIn: 10 },
        { xIn: 14, yIn: 10 },
      ],
    }, {
      point: { xIn: 14, yIn: 10 },
      sourceKey: "around-rough",
      pathPoints: [
        { xIn: 10, yIn: 10 },
        { xIn: 10, yIn: 14 },
        { xIn: 14, yIn: 14 },
        { xIn: 14, yIn: 10 },
      ],
    }, {
      point: { xIn: 12, yIn: 10 },
      sourceKey: "inside-rough",
      pathPoints: [
        { xIn: 10, yIn: 10 },
        { xIn: 12, yIn: 10 },
      ],
    }],
    maximumCandidateCount: 256,
    maximumStrictAttemptsPerCell: 8,
    maximumStrictWitnessesPerCell: 8,
  },
);
assert.equal(pathRepresentatives.ok, true);
const outsidePathCell = pathRepresentatives.cells.find((cell) =>
  cell.strictWitnesses.filter((witness) =>
    witness.candidate.point.xIn === 14 && witness.candidate.point.yIn === 10)
    .length >= 2);
assert.ok(outsidePathCell);
const sameEndpointPathWitnesses = outsidePathCell.strictWitnesses.filter((witness) =>
  witness.candidate.point.xIn === 14 && witness.candidate.point.yIn === 10);
assert.equal(sameEndpointPathWitnesses.length, 2);
assert.equal(
  new Set(sameEndpointPathWitnesses.map((witness) =>
    witness.endpointSignatureHash)).size,
  1,
);
assert.equal(
  new Set(sameEndpointPathWitnesses.map((witness) =>
    witness.pathSignatureHash)).size,
  2,
);
assert.equal(
  new Set(sameEndpointPathWitnesses.map((witness) =>
    witness.orderedEventSignatureHash)).size,
  2,
);
assert.equal(
  new Set(sameEndpointPathWitnesses.map((witness) =>
    witness.transitionObservationHash)).size,
  2,
);
const sameEndpointSuccessorSemanticStateCount = new Set(
  sameEndpointPathWitnesses.map((witness) =>
    witness.transitionObservation.successorSemanticStateHash),
).size;
const sameEndpointOrderedTransitionEventTypeCount = new Set(
  sameEndpointPathWitnesses.map((witness) =>
    JSON.stringify(witness.transitionObservation.orderedEventTypes)),
).size;
const sameEndpointExactTransitionEventTraceCount = new Set(
  sameEndpointPathWitnesses.map((witness) =>
    witness.transitionObservation.exactEventTraceHash),
).size;
const sameEndpointRuleBehaviorTransitionObservationCount = new Set(
  sameEndpointPathWitnesses.map((witness) =>
    witness.ruleBehaviorTransitionObservationHash),
).size;
assert.equal(sameEndpointRuleBehaviorTransitionObservationCount, 1);
assert.equal(sameEndpointPathWitnesses.every((witness) =>
  witness.transitionObservation.ruleBehaviorObservation.exactEventFallbackUsed === false),
true);
assert.equal(outsidePathCell.observedTransitionVariation, true);
assert.equal(outsidePathCell.transitionStabilityCounterexampleFound, true);
assert.ok(outsidePathCell.transitionRefinementLedger.observedClassCount >= 2);
for (const transitionObservationHash of new Set(sameEndpointPathWitnesses.map((witness) =>
  witness.transitionObservationHash))) {
  assert.ok(outsidePathCell.transitionRefinementLedger.observedClasses.some((row) =>
    row.transitionObservationHash === transitionObservationHash));
}
assert.equal(outsidePathCell.transitionRefinementLedger.refinementComplete, false);
assert.equal(
  outsidePathCell.transitionRefinementLedger.unresolvedContinuousRemainder.disposition,
  "unresolved_unobserved_continuous_remainder",
);
assert.equal(
  outsidePathCell.transitionRefinementLedger.unresolvedContinuousRemainder.chanceMass,
  null,
);
assert.ok(outsidePathCell.transitionRefinementLedger.requiredNextPredicateKinds.includes(
  "ordered_host_event_sequence",
));
assert.equal(outsidePathCell.transitionRefinementLedger.chanceMassAssigned, false);
assert.ok(pathRepresentatives.completionDebts.includes(
  "observed_transition_variation_requires_refinement",
));
assert.equal(sameEndpointPathWitnesses.every((witness) =>
  witness.hostPathEvaluation.pathClassComplete === false), true);
assert.equal(pathRepresentatives.pathClassPartitionComplete, false);
assert.equal(pathRepresentatives.chanceMassAssigned, false);

const hazardState = state({
  terrainKey: "path-acid-hazard",
  type: "acid pool",
  xIn: 12,
  yIn: 10,
  widthIn: 1,
  heightIn: 1,
  isHazard: true,
  hazardEffectTypes: ["corrosion"],
}, 20);
const hazardPlan = plan(hazardState);
assert.equal(hazardPlan.pathClassPartitionRequired, true);
const acidHazardEventRegion = hazardPlan.eventRegions.find((eventRegion) =>
  eventRegion.eventRegionKey === "terrain-hazard:path-acid-hazard");
assert.ok(acidHazardEventRegion);
assert.equal(
  acidHazardEventRegion.eventKind,
  "movement_hazard_trigger_region",
);
assert.deepEqual(acidHazardEventRegion.hazardEffectTypes, ["corrosion"]);
assert.ok(hazardPlan.wildcardDebts.some((debt) =>
  debt.reason === "movement_hazard_path_partition_required"));
const hazardPage = buildWarmachineGeometryCellPartitionPageV1(hazardPlan, { limit: 8 });
const hazardRepresentatives = materializeWarmachineGeometryCellRepresentativesV1(
  hazardState,
  hazardPlan,
  hazardPage,
  {
    candidatePoints: [{
      point: { xIn: 14, yIn: 10 },
      sourceKey: "through-acid",
      pathPoints: [
        { xIn: 10, yIn: 10 },
        { xIn: 14, yIn: 10 },
      ],
    }, {
      point: { xIn: 14, yIn: 10 },
      sourceKey: "around-acid",
      pathPoints: [
        { xIn: 10, yIn: 10 },
        { xIn: 10, yIn: 14 },
        { xIn: 14, yIn: 14 },
        { xIn: 14, yIn: 10 },
      ],
    }],
    maximumCandidateCount: 256,
    maximumStrictAttemptsPerCell: 8,
    maximumStrictWitnessesPerCell: 8,
  },
);
const sameEndpointHazardWitnesses = hazardRepresentatives.cells
  .flatMap((cell) => cell.strictWitnesses)
  .filter((witness) => witness.candidate.point.xIn === 14 &&
    witness.candidate.point.yIn === 10);
assert.equal(sameEndpointHazardWitnesses.length, 2);
const sameEndpointHazardRuleBehaviorObservationCount = new Set(
  sameEndpointHazardWitnesses.map((witness) =>
    witness.ruleBehaviorTransitionObservationHash),
).size;
assert.equal(sameEndpointHazardRuleBehaviorObservationCount, 2);
assert.equal(sameEndpointHazardWitnesses.some((witness) =>
  witness.transitionObservation.ruleBehaviorObservation.exactEventFallbackUsed === true),
true);
assert.equal(sameEndpointHazardWitnesses.some((witness) =>
  witness.eventTypes.includes("continuous_effect_applied")), true);

const oppositeOrderHazardState = {
  ...state({
    terrainKey: "ordered-fire-pool",
    type: "fire pit",
    xIn: 11,
    yIn: 13,
    widthIn: 0.5,
    heightIn: 0.5,
    isHazard: true,
    hazardEffectTypes: ["fire"],
  }, 20),
  stateKey: "geometry-strict-representative:opposite-hazard-order",
  terrain: [{
    terrainKey: "ordered-fire-pool",
    type: "fire pit",
    xIn: 11,
    yIn: 13,
    widthIn: 0.5,
    heightIn: 0.5,
    isHazard: true,
    hazardEffectTypes: ["fire"],
  }, {
    terrainKey: "ordered-acid-pool",
    type: "acid pool",
    xIn: 15,
    yIn: 13,
    widthIn: 0.5,
    heightIn: 0.5,
    isHazard: true,
    hazardEffectTypes: ["corrosion"],
  }],
};
const oppositeOrderHazardPlan = plan(oppositeOrderHazardState);
const oppositeOrderHazardPage = buildWarmachineGeometryCellPartitionPageV1(
  oppositeOrderHazardPlan,
  { limit: 8 },
);
const oppositeOrderHazardRepresentatives =
  materializeWarmachineGeometryCellRepresentativesV1(
    oppositeOrderHazardState,
    oppositeOrderHazardPlan,
    oppositeOrderHazardPage,
    {
      candidatePoints: [{
        point: { xIn: 16, yIn: 10 },
        sourceKey: "fire-then-acid",
        pathPoints: [
          { xIn: 10, yIn: 10 },
          { xIn: 11, yIn: 13 },
          { xIn: 15, yIn: 13 },
          { xIn: 16, yIn: 10 },
        ],
      }, {
        point: { xIn: 16, yIn: 10 },
        sourceKey: "acid-then-fire",
        pathPoints: [
          { xIn: 10, yIn: 10 },
          { xIn: 15, yIn: 13 },
          { xIn: 11, yIn: 13 },
          { xIn: 16, yIn: 10 },
        ],
      }],
      maximumCandidateCount: 256,
      maximumStrictAttemptsPerCell: 8,
      maximumStrictWitnessesPerCell: 8,
    },
  );
const oppositeOrderHazardWitnesses = oppositeOrderHazardRepresentatives.cells
  .flatMap((cell) => cell.strictWitnesses)
  .filter((witness) => witness.candidate.point.xIn === 16 &&
    witness.candidate.point.yIn === 10);
assert.equal(oppositeOrderHazardWitnesses.length, 2);
const hostHazardOrder = (witness) => witness.hostPathEvaluation.orderedEventTrace
  .filter((row) => row.traceKind === "movement_hazard_entry")
  .flatMap((row) => row.eventRegionKeys)
  .join(">");
assert.deepEqual(oppositeOrderHazardWitnesses.map(hostHazardOrder).sort(), [
  "terrain-hazard:ordered-acid-pool>terrain-hazard:ordered-fire-pool",
  "terrain-hazard:ordered-fire-pool>terrain-hazard:ordered-acid-pool",
]);
assert.equal(new Set(oppositeOrderHazardWitnesses.map((witness) =>
  witness.ruleBehaviorTransitionObservationHash)).size, 2);
const strictHazardEffectOrder = (witness) => witness.transitionObservation
  .ruleBehaviorObservation.ruleBehaviorEvents
  .filter((event) => event.eventType === "continuous_effect_applied")
  .map((event) => String(event.continuousEffectType || ""))
  .join(">");
assert.deepEqual(oppositeOrderHazardWitnesses.map(strictHazardEffectOrder).sort(), [
  "corrosion>fire",
  "fire>corrosion",
]);

console.log(JSON.stringify({
  ok: true,
  marker: "host_classified_strict_geometry_representative_v1",
  reachableSignatureCount: reachablePage.pageCellCount,
  reachableStrictWitnessCount: reachable.representedCellCount,
  hostParameterizedActionReceiptBound: true,
  farSignatureCount: unreachablePage.pageCellCount,
  farStrictWitnessCount: unresolved.representedCellCount,
  farUnresolvedSignatureCount: unresolved.unresolvedCellCount,
  sameEndpointStrictPathSignatureCount: sameEndpointPathWitnesses.length,
  sameEndpointOrderedEventSignatureCount: new Set(
    sameEndpointPathWitnesses.map((witness) =>
      witness.orderedEventSignatureHash),
  ).size,
  sameEndpointTransitionObservationCount: new Set(
    sameEndpointPathWitnesses.map((witness) =>
      witness.transitionObservationHash),
  ).size,
  sameEndpointSuccessorSemanticStateCount,
  sameEndpointOrderedTransitionEventTypeCount,
  sameEndpointOrderedTransitionEventTypes:
    sameEndpointPathWitnesses.map((witness) =>
      witness.transitionObservation.orderedEventTypes),
  sameEndpointExactTransitionEventTraceCount,
  sameEndpointRuleBehaviorTransitionObservationCount,
  sameEndpointHazardRuleBehaviorObservationCount,
  oppositeOrderedHazardPathClassCount:
    oppositeOrderHazardWitnesses.length,
  oppositeOrderedHazardRuleBehaviorObservationCount:
    new Set(oppositeOrderHazardWitnesses.map((witness) =>
      witness.ruleBehaviorTransitionObservationHash)).size,
  strictHazardEffectOrderMatchesHostPathReceipt: true,
  hazardPathEventSurfaceDeclared:
    hazardPlan.pathClassPartitionRequired === true,
  transitionCounterexampleCellCount:
    pathRepresentatives.transitionCounterexampleCellCount,
  observedRefinementClassCount:
    outsidePathCell.transitionRefinementLedger.observedClassCount,
  unresolvedTransitionRefinementRemainderCount:
    pathRepresentatives.unresolvedTransitionRefinementRemainderCount,
  pathClassPartitionComplete: pathRepresentatives.pathClassPartitionComplete,
  finiteCandidateMissProvesEmpty: false,
  chanceMassAssigned: unresolved.chanceMassAssigned,
}, null, 2));
