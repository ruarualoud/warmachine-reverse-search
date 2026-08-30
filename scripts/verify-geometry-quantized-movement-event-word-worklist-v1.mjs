import assert from "node:assert/strict";

import { buildWarmachineGeometryPredicatePlanV1 } from
  "../src/geometry/predicate-plan-v1.mjs";
import { buildWarmachineMovementEventAutomatonV1 } from
  "../src/geometry/movement-event-automaton-v1.mjs";
import { buildWarmachineMovementEventWordLanguageV1 } from
  "../src/geometry/movement-event-word-language-v1.mjs";
import { advanceWarmachineQuantizedMovementEventWordWorklistV1 } from
  "../src/geometry/quantized-movement-event-word-worklist-v1.mjs";
import { evaluateRulesV1MovementGeometryPath } from
  "../src/warmachine-host-runtime.mjs";

const inputState = {
  stateKey: "quantized-event-word-worklist",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 1,
  strictMode: true,
  enforceStrictExecutor: true,
  board: { widthIn: 48, heightIn: 48 },
  terrain: [{
    terrainKey: "rough-patch",
    type: "rough_terrain",
    xIn: 12,
    yIn: 10,
    widthIn: 2,
    heightIn: 2,
    roughTerrain: true,
    movementCostMultiplier: 2,
  }],
  pieces: [{
    pieceKey: "mover",
    label: "mover",
    sideKey: "player1",
    position: { xIn: 10, yIn: 10 },
    baseSizeIn: 2,
    speedIn: 0.02,
    boxesRemaining: 5,
  }],
};

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
assert.equal(predicatePlan.ok, true);
assert.equal(predicatePlan.maximumLegalPathSegmentCount, 2);
assert.equal(predicatePlan.eventRegions[0].actorStartOnBoundary, true);

const zeroPath = evaluateRulesV1MovementGeometryPath(inputState, {
  actorPieceKey: "mover",
  actionType: "advance",
  pathPoints: [{ xIn: 10, yIn: 10 }],
});
const automaton = buildWarmachineMovementEventAutomatonV1(
  predicatePlan,
  [zeroPath],
);
assert.equal(automaton.ok, true);

let receipt = advanceWarmachineQuantizedMovementEventWordWorklistV1(
  inputState,
  predicatePlan,
  automaton,
  { endpointScanBudget: 3, pathEdgeBudget: 1 },
);
assert.equal(receipt.ok, true);
assert.equal(receipt.endpointScanComplete, false);
assert.equal(receipt.geometricEventWordLanguageComplete, false);
assert.ok(receipt.pendingEndpointCandidateCount > 0);
assert.match(receipt.resumeCheckpoint.checkpointHash, /^[0-9a-f]{64}$/);

let pageCount = 1;
while (!receipt.geometricEventWordLanguageComplete && pageCount < 1000) {
  receipt = advanceWarmachineQuantizedMovementEventWordWorklistV1(
    inputState,
    predicatePlan,
    automaton,
    {
      checkpoint: receipt.resumeCheckpoint,
      endpointScanBudget: 100,
      pathEdgeBudget: 1000,
    },
  );
  pageCount += 1;
}

assert.equal(receipt.ok, true);
assert.equal(receipt.endpointScanComplete, true);
assert.equal(receipt.pathWorklistComplete, true);
assert.equal(receipt.geometricEventWordLanguageComplete, true);
assert.equal(receipt.allLegalQuantizedPathsCoveredByEventWordDenominator, true);
assert.equal(receipt.pendingEndpointCandidateCount, 0);
assert.equal(receipt.pendingPathStateCount, 0);
assert.equal(receipt.currentPendingEdgeCount, 0);
assert.equal(receipt.quantizedEndpointCandidateCount, 25);
assert.equal(receipt.legalQuantizedEndpointCount, 13);
assert.ok(receipt.eventWordDenominatorCount >= 3);
assert.ok(receipt.eventWords.some((word) =>
  word.crossingLabels.length === 0));
assert.ok(receipt.eventWords.some((word) =>
  word.crossingLabels.map((row) => row.crossingKind).join(",") === "exit"));
assert.ok(receipt.eventWords.some((word) =>
  word.crossingLabels.map((row) => row.crossingKind).join(",") ===
    "exit,enter"));
assert.ok(receipt.stats.pathEdgesExamined > 0);
assert.ok(receipt.stats.dominancePrunedCount > 0);
assert.equal(receipt.pathStorageModel,
  "content_addressed_parent_point_prefix_dag_v1");
assert.ok(receipt.contentAddressedPathNodeCount > 0);
assert.equal(receipt.chanceMassAssigned, false);

const language = buildWarmachineMovementEventWordLanguageV1(
  predicatePlan,
  automaton,
  { quantizedWorklistReceipt: receipt },
);
assert.equal(language.ok, true);
assert.equal(language.boundaryUnreachableScopeComplete, false);
assert.equal(language.quantizedReachableScopeComplete, true);
assert.equal(language.geometricEventWordLanguageComplete, true);
assert.equal(language.eventWordDenominatorCount, receipt.eventWordDenominatorCount);
assert.equal(language.allLegalPathsCoveredByEventWordDenominator, true);

const obstacleState = {
  ...structuredClone(inputState),
  stateKey: "quantized-event-word-static-obstacle",
  terrain: [],
  pieces: [{
    ...structuredClone(inputState.pieces[0]),
    baseSizeIn: 0.01,
    speedIn: 0.03,
  }, {
    pieceKey: "friendly-blocker",
    label: "friendly blocker",
    sideKey: "player1",
    position: { xIn: 10.02, yIn: 10 },
    baseSizeIn: 0.01,
    speedIn: 0,
    boxesRemaining: 5,
  }],
};
const obstaclePlan = buildWarmachineGeometryPredicatePlanV1(obstacleState, {
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
assert.equal(obstaclePlan.configurationObstacles.length, 1);
assert.deepEqual(obstaclePlan.wildcardDebts, []);
const obstacleZeroPath = evaluateRulesV1MovementGeometryPath(obstacleState, {
  actorPieceKey: "mover",
  actionType: "advance",
  pathPoints: [{ xIn: 10, yIn: 10 }],
});
const obstacleAutomaton = buildWarmachineMovementEventAutomatonV1(
  obstaclePlan,
  [obstacleZeroPath],
);
let obstacleReceipt = advanceWarmachineQuantizedMovementEventWordWorklistV1(
  obstacleState,
  obstaclePlan,
  obstacleAutomaton,
  { endpointScanBudget: 100, pathEdgeBudget: 5000 },
);
let obstaclePageCount = 1;
while (!obstacleReceipt.geometricEventWordLanguageComplete &&
    obstaclePageCount < 1000) {
  obstacleReceipt = advanceWarmachineQuantizedMovementEventWordWorklistV1(
    obstacleState,
    obstaclePlan,
    obstacleAutomaton,
    {
      checkpoint: obstacleReceipt.resumeCheckpoint,
      endpointScanBudget: 100,
      pathEdgeBudget: 5000,
    },
  );
  obstaclePageCount += 1;
}
assert.equal(obstacleReceipt.geometricEventWordLanguageComplete, true);
assert.equal(obstacleReceipt.quantizedEndpointCandidateCount, 49);
assert.ok(obstacleReceipt.legalQuantizedEndpointCount < 49);
assert.ok(obstacleReceipt.stats.strictPathRejectedCount > 0);
assert.equal(obstacleReceipt.eventWordDenominatorCount, 1);

const unitState = {
  ...structuredClone(inputState),
  stateKey: "quantized-event-word-selected-unit-model-path",
  terrain: [],
  pieces: [{
    ...structuredClone(inputState.pieces[0]),
    baseSizeIn: 0.01,
    speedIn: 0.01,
    unitGroupId: "unit-a",
  }, {
    pieceKey: "unit-a-2",
    label: "unit-a-2",
    sideKey: "player1",
    position: { xIn: 10.03, yIn: 10 },
    baseSizeIn: 0.01,
    speedIn: 0.01,
    boxesRemaining: 5,
    unitGroupId: "unit-a",
  }],
};
const unitPlan = buildWarmachineGeometryPredicatePlanV1(unitState, {
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
assert.deepEqual(unitPlan.wildcardDebts, [{
  reason: "unit_group_geometry_requires_factored_unit_domain",
  unitGroupId: "unit-a",
}]);
const unitZeroPath = evaluateRulesV1MovementGeometryPath(unitState, {
  actorPieceKey: "mover",
  actionType: "advance",
  pathPoints: [{ xIn: 10, yIn: 10 }],
});
const unitAutomaton = buildWarmachineMovementEventAutomatonV1(
  unitPlan,
  [unitZeroPath],
  { factoredUnitGroupId: "unit-a" },
);
assert.equal(unitAutomaton.ok, true);
assert.equal(unitAutomaton.factoredUnitGroupId, "unit-a");
const unitUnfactored = advanceWarmachineQuantizedMovementEventWordWorklistV1(
  unitState,
  unitPlan,
  unitAutomaton,
  { endpointScanBudget: 100, pathEdgeBudget: 100 },
);
assert.equal(unitUnfactored.ok, false);
assert.ok(unitUnfactored.validationIssues.includes(
  "quantized_event_word_unsupported_path_debt:unit_group_geometry_requires_factored_unit_domain",
));
let unitReceipt = advanceWarmachineQuantizedMovementEventWordWorklistV1(
  unitState,
  unitPlan,
  unitAutomaton,
  {
    factoredUnitGroupId: "unit-a",
    endpointScanBudget: 100,
    pathEdgeBudget: 100,
  },
);
let unitPageCount = 1;
while (!unitReceipt.geometricEventWordLanguageComplete &&
    unitPageCount < 100) {
  unitReceipt = advanceWarmachineQuantizedMovementEventWordWorklistV1(
    unitState,
    unitPlan,
    unitAutomaton,
    {
      factoredUnitGroupId: "unit-a",
      checkpoint: unitReceipt.resumeCheckpoint,
      endpointScanBudget: 100,
      pathEdgeBudget: 100,
    },
  );
  unitPageCount += 1;
}
assert.equal(unitReceipt.ok, true);
assert.equal(unitReceipt.geometricEventWordLanguageComplete, true);
assert.equal(unitReceipt.factoredUnitGroupId, "unit-a");
assert.equal(unitReceipt.selectedModelPathOnly, true);
assert.equal(unitReceipt.jointParameterDomainComplete, false);
const unitWrongResume = advanceWarmachineQuantizedMovementEventWordWorklistV1(
  unitState,
  unitPlan,
  unitAutomaton,
  {
    checkpoint: unitReceipt.resumeCheckpoint,
    endpointScanBudget: 100,
    pathEdgeBudget: 100,
  },
);
assert.equal(unitWrongResume.ok, false);
assert.ok(unitWrongResume.validationIssues.includes(
  "quantized_event_word_checkpoint_invalid",
));

const tamperedCheckpoint = structuredClone(receipt.resumeCheckpoint);
tamperedCheckpoint.scanOffset = 0;
const rejected = advanceWarmachineQuantizedMovementEventWordWorklistV1(
  inputState,
  predicatePlan,
  automaton,
  { checkpoint: tamperedCheckpoint },
);
assert.equal(rejected.ok, false);
assert.ok(rejected.validationIssues.includes(
  "quantized_event_word_checkpoint_invalid",
));

console.log(JSON.stringify({
  ok: true,
  schemaVersion:
    "verify_warmachine_quantized_movement_event_word_worklist_v1",
  pageCount,
  quantizedEndpointCandidateCount: receipt.quantizedEndpointCandidateCount,
  legalQuantizedEndpointCount: receipt.legalQuantizedEndpointCount,
  paretoPathStateCount: receipt.paretoPathStateCount,
  contentAddressedPathNodeCount: receipt.contentAddressedPathNodeCount,
  eventWordDenominatorCount: receipt.eventWordDenominatorCount,
  pathEdgesExamined: receipt.stats.pathEdgesExamined,
  dominancePrunedCount: receipt.stats.dominancePrunedCount,
  allLegalQuantizedPathsCoveredByEventWordDenominator:
    receipt.allLegalQuantizedPathsCoveredByEventWordDenominator,
  integratedEventWordLanguageComplete:
    language.geometricEventWordLanguageComplete,
  staticObstaclePageCount: obstaclePageCount,
  staticObstacleStrictPathRejectedCount:
    obstacleReceipt.stats.strictPathRejectedCount,
  factoredUnitSelectedPathPageCount: unitPageCount,
  factoredUnitSelectedPathComplete:
    unitReceipt.geometricEventWordLanguageComplete,
  factoredUnitJointPlacementStillSeparate:
    unitReceipt.selectedModelPathOnly,
  chanceMassAssigned: receipt.chanceMassAssigned,
}, null, 2));
