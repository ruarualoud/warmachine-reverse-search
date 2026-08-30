import assert from "node:assert/strict";

import { buildWarmachineGeometryPredicatePlanV1 } from
  "../src/geometry/predicate-plan-v1.mjs";
import { buildWarmachineMovementEventAutomatonV1 } from
  "../src/geometry/movement-event-automaton-v1.mjs";
import { advanceWarmachineQuantizedMovementEventWordWorklistV1 } from
  "../src/geometry/quantized-movement-event-word-worklist-v1.mjs";
import {
  advanceWarmachineSelectedUnitMoverJointPlacementWorklistV1,
  WARMACHINE_SELECTED_UNIT_MOVER_JOINT_PLACEMENT_WORKLIST_V1_SCHEMA,
} from
  "../src/geometry/selected-unit-mover-joint-placement-worklist-v1.mjs";
import { evaluateRulesV1MovementGeometryPath } from
  "../src/warmachine-host-runtime.mjs";
import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import { buildWarmachineUnitActionTypeJointDomainV1 } from
  "../src/geometry/unit-action-type-joint-domain-v1.mjs";

function piece(pieceKey, xIn, yIn) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey: "player1",
    position: { xIn, yIn },
    baseSizeIn: 0.001,
    speedIn: 0.0001,
    boxesRemaining: 5,
    unitGroupId: "unit-a",
  };
}

const inputState = {
  stateKey: "selected-unit-mover-joint-placement-worklist",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 1,
  strictMode: true,
  enforceStrictExecutor: true,
  board: { widthIn: 0.03, heightIn: 0.03 },
  terrain: [],
  pieces: [
    piece("unit-a-1", 0.01, 0.01),
    piece("unit-a-2", 0.02, 0.02),
  ],
};

const predicatePlan = buildWarmachineGeometryPredicatePlanV1(inputState, {
  actorPieceKey: "unit-a-1",
  actionType: "advance",
  strategyContext: {
    initialDistributionReceiptHash: "initial",
    historyReceiptHash: "history",
    observationReceiptHash: "observation",
    reachabilityContextKey: "reachable",
    remainingPly: 2,
  },
});
const zeroPath = evaluateRulesV1MovementGeometryPath(inputState, {
  actorPieceKey: "unit-a-1",
  actionType: "advance",
  pathPoints: [{ xIn: 0.01, yIn: 0.01 }],
});
const automaton = buildWarmachineMovementEventAutomatonV1(
  predicatePlan,
  [zeroPath],
  { factoredUnitGroupId: "unit-a" },
);
let pathReceipt = advanceWarmachineQuantizedMovementEventWordWorklistV1(
  inputState,
  predicatePlan,
  automaton,
  {
    factoredUnitGroupId: "unit-a",
    endpointScanBudget: 100,
    pathEdgeBudget: 100,
  },
);
while (!pathReceipt.geometricEventWordLanguageComplete) {
  pathReceipt = advanceWarmachineQuantizedMovementEventWordWorklistV1(
    inputState,
    predicatePlan,
    automaton,
    {
      factoredUnitGroupId: "unit-a",
      checkpoint: pathReceipt.resumeCheckpoint,
      endpointScanBudget: 100,
      pathEdgeBudget: 100,
    },
  );
}
assert.equal(pathReceipt.geometricEventWordLanguageComplete, true);
assert.equal(pathReceipt.paretoPathStateCount, 1);

let receipt = advanceWarmachineSelectedUnitMoverJointPlacementWorklistV1(
  inputState,
  pathReceipt,
  {
    actorPieceKey: "unit-a-1",
    actionType: "advance",
    candidateBudget: 3,
  },
);
assert.equal(receipt.schemaVersion,
  WARMACHINE_SELECTED_UNIT_MOVER_JOINT_PLACEMENT_WORKLIST_V1_SCHEMA);
assert.equal(receipt.ok, true);
assert.equal(receipt.selectedMoverJointPlacementDomainComplete, false);
assert.equal(receipt.jointCandidateCount, "16");
assert.equal(receipt.examinedCandidateCount, "3");
assert.equal(receipt.pendingCandidateCount, "13");

let pageCount = 1;
while (!receipt.selectedMoverJointPlacementDomainComplete && pageCount < 20) {
  receipt = advanceWarmachineSelectedUnitMoverJointPlacementWorklistV1(
    inputState,
    pathReceipt,
    {
      actorPieceKey: "unit-a-1",
      actionType: "advance",
      checkpoint: receipt.resumeCheckpoint,
      candidateBudget: 5,
    },
  );
  pageCount += 1;
}
assert.equal(receipt.ok, true);
assert.equal(receipt.selectedMoverPathDomainComplete, true);
assert.equal(receipt.selectedMoverJointPlacementDomainComplete, true);
assert.equal(receipt.allSelectedMoverChoicesComplete, false);
assert.equal(receipt.completeUnitMovementDomain, false);
assert.equal(receipt.examinedCandidateCount, receipt.jointCandidateCount);
assert.equal(receipt.pendingCandidateCount, "0");
assert.equal(receipt.accountingConserved, true);
assert.equal(
  BigInt(receipt.strictAcceptedCount) + BigInt(receipt.strictRejectedCount),
  16n,
);
assert.ok(BigInt(receipt.strictAcceptedCount) > 0n);
assert.ok(BigInt(receipt.strictRejectedCount) > 0n);
assert.ok(receipt.acceptedWitnesses.every((row) =>
  /^[0-9a-f]{64}$/.test(row.successorRuleBehaviorStateHash)));
assert.equal(receipt.chanceMassAssigned, false);
const {
  selectedUnitMoverJointPlacementWorklistReceiptHash,
  ...receiptCore
} = receipt;
assert.equal(
  stableGraphHash(receiptCore),
  selectedUnitMoverJointPlacementWorklistReceiptHash,
);

const tamperedCheckpoint = structuredClone(receipt.resumeCheckpoint);
tamperedCheckpoint.nextCandidateOffset = "0";
const tampered = advanceWarmachineSelectedUnitMoverJointPlacementWorklistV1(
  inputState,
  pathReceipt,
  {
    actorPieceKey: "unit-a-1",
    actionType: "advance",
    checkpoint: tamperedCheckpoint,
  },
);
assert.equal(tampered.ok, false);
assert.ok(tampered.validationIssues.includes("unit_joint_checkpoint_invalid"));

const secondPredicatePlan = buildWarmachineGeometryPredicatePlanV1(
  inputState,
  {
    actorPieceKey: "unit-a-2",
    actionType: "advance",
    strategyContext: {
      initialDistributionReceiptHash: "initial",
      historyReceiptHash: "history",
      observationReceiptHash: "observation",
      reachabilityContextKey: "reachable",
      remainingPly: 2,
    },
  },
);
const secondZeroPath = evaluateRulesV1MovementGeometryPath(inputState, {
  actorPieceKey: "unit-a-2",
  actionType: "advance",
  pathPoints: [{ xIn: 0.02, yIn: 0.02 }],
});
const secondAutomaton = buildWarmachineMovementEventAutomatonV1(
  secondPredicatePlan,
  [secondZeroPath],
  { factoredUnitGroupId: "unit-a" },
);
let secondPathReceipt =
  advanceWarmachineQuantizedMovementEventWordWorklistV1(
    inputState,
    secondPredicatePlan,
    secondAutomaton,
    {
      factoredUnitGroupId: "unit-a",
      endpointScanBudget: 100,
      pathEdgeBudget: 100,
    },
  );
while (!secondPathReceipt.geometricEventWordLanguageComplete) {
  secondPathReceipt = advanceWarmachineQuantizedMovementEventWordWorklistV1(
    inputState,
    secondPredicatePlan,
    secondAutomaton,
    {
      factoredUnitGroupId: "unit-a",
      checkpoint: secondPathReceipt.resumeCheckpoint,
      endpointScanBudget: 100,
      pathEdgeBudget: 100,
    },
  );
}
let secondReceipt =
  advanceWarmachineSelectedUnitMoverJointPlacementWorklistV1(
    inputState,
    secondPathReceipt,
    {
      actorPieceKey: "unit-a-2",
      actionType: "advance",
      candidateBudget: 100,
    },
  );
while (!secondReceipt.selectedMoverJointPlacementDomainComplete) {
  secondReceipt = advanceWarmachineSelectedUnitMoverJointPlacementWorklistV1(
    inputState,
    secondPathReceipt,
    {
      actorPieceKey: "unit-a-2",
      actionType: "advance",
      checkpoint: secondReceipt.resumeCheckpoint,
      candidateBudget: 100,
    },
  );
}
const incompleteAggregate = buildWarmachineUnitActionTypeJointDomainV1(
  [receipt],
  { actionType: "advance" },
);
assert.equal(incompleteAggregate.ok, false);
assert.ok(incompleteAggregate.validationIssues.includes(
  "unit_action_type_selected_mover_denominator_incomplete",
));
const aggregate = buildWarmachineUnitActionTypeJointDomainV1(
  [receipt, secondReceipt],
  { actionType: "advance" },
);
assert.equal(aggregate.ok, true);
assert.equal(aggregate.allSelectedMoverChoicesComplete, true);
assert.equal(aggregate.unitActionTypeJointParameterDomainComplete, true);
assert.equal(aggregate.completeUnitMovementDomain, false);
assert.equal(aggregate.selectedMoverReceiptCount, 2);
assert.equal(
  BigInt(aggregate.strictAcceptedCount) +
    BigInt(aggregate.strictRejectedCount),
  BigInt(aggregate.jointCandidateCount),
);
assert.equal(aggregate.chanceMassAssigned, false);

console.log(JSON.stringify({
  ok: true,
  marker: "selected_unit_mover_joint_placement_worklist_v1",
  pageCount,
  selectedPathRepresentativeCount: receipt.selectedPathRepresentativeCount,
  jointCandidateCount: receipt.jointCandidateCount,
  strictAcceptedCount: receipt.strictAcceptedCount,
  strictRejectedCount: receipt.strictRejectedCount,
  accountingConserved: receipt.accountingConserved,
  selectedMoverJointPlacementDomainComplete:
    receipt.selectedMoverJointPlacementDomainComplete,
  allSelectedMoverChoicesComplete: receipt.allSelectedMoverChoicesComplete,
  aggregateAdvanceSelectedMoverCount: aggregate.selectedMoverReceiptCount,
  aggregateAdvanceAllSelectedMoversComplete:
    aggregate.allSelectedMoverChoicesComplete,
  aggregateCompleteUnitMovementDomain:
    aggregate.completeUnitMovementDomain,
  chanceMassAssigned: receipt.chanceMassAssigned,
}, null, 2));
