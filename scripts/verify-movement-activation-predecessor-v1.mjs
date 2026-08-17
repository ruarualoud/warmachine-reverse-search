import assert from "node:assert/strict";

import { generateWarmachineMovementActivationPredecessorsV1 } from
  "../src/reverse/movement-activation-predecessor-v1.mjs";
import { reverseWarmachineActivationSequenceV2 } from
  "../src/reverse/activation-sequence-predecessor-v2.mjs";
import { auditWarmachineLegalDeploymentReachabilityV1 } from
  "../src/reverse/deployment-reachability-v1.mjs";

function piece(pieceKey, sideKey, position, activated = false) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey,
    modelRole: "solo",
    modelType: "warrior model",
    position,
    baseSizeIn: 1.18,
    speedIn: 6,
    defense: 12,
    armor: 14,
    damage: { boxesRemaining: 5, maxBoxes: 5 },
    statusTags: [],
    attackProfiles: [],
    activated,
  };
}

const deployments = {
  p1_deploy: { id: "p1_deploy", x: 8, y: 24, width: 16, height: 36 },
  p2_deploy: { id: "p2_deploy", x: 40, y: 24, width: 16, height: 36 },
};

const cleanSuccessor = {
  stateKey: "movement-successor-clean",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 2,
  strictMode: true,
  enforceStrictExecutor: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    piece("mover", "player1", { xIn: 20, yIn: 24 }, true),
    piece("enemy", "player2", { xIn: 40, yIn: 34 }, false),
  ],
  terrain: [],
  scenario: { zones: [], flags: [], objectives: [], score: { player1: 0, player2: 0 } },
};

const reverse = generateWarmachineMovementActivationPredecessorsV1(cleanSuccessor, {
  sideKey: "player1",
  actorPieceKeys: ["mover"],
  actionTypes: ["advance"],
  deployments,
  rejectedAuditLimit: 16,
});
assert.equal(reverse.ok, true, JSON.stringify(reverse));
assert.equal(reverse.strictCandidateCount, 1);
assert.equal(reverse.strictRejectedCount, 0);
assert.equal(reverse.unresolvedCount, 0);
const candidate = reverse.candidates[0];
const predecessorMover = candidate.predecessorState.pieces.find((row) =>
  row.pieceKey === "mover");
assert.equal(predecessorMover.activated, false);
assert.ok(Math.abs(predecessorMover.position.xIn - 15.41) <= 0.001);
assert.equal(predecessorMover.position.yIn, 24);
assert.equal(candidate.movementProposal.destination.xIn, 20);
assert.equal(candidate.searchContextIsolation.proposalPathStoredOutsideRulesPredecessor, true);
assert.equal(candidate.predecessorState.explicitMovementPaths.length, 0);

const directRunSuccessor = structuredClone(cleanSuccessor);
directRunSuccessor.stateKey = "movement-run-successor-from-deployment";
directRunSuccessor.pieces.find((row) => row.pieceKey === "mover").position = {
  xIn: 26.2,
  yIn: 24,
};
const directRun = generateWarmachineMovementActivationPredecessorsV1(directRunSuccessor, {
  sideKey: "player1",
  actorPieceKeys: ["mover"],
  actionTypes: ["run"],
  deployments,
  rejectedAuditLimit: 16,
});
assert.equal(directRun.ok, true, JSON.stringify(directRun));
assert.equal(directRun.strictCandidateCount, 1);
assert.equal(directRun.strictRejectedCount, 0);
assert.equal(directRun.candidates[0].movementProposal.proposalSource,
  "nearest_strict_deployment_projection_v1");
const directRunMover = directRun.candidates[0].predecessorState.pieces.find((row) =>
  row.pieceKey === "mover");
assert.ok(Math.abs(directRunMover.position.xIn - 15.41) <= 0.001);
assert.equal(directRun.candidates[0].movementProposal.proposalAllowanceIn, 11);
assert.equal(directRun.candidates[0].strictMovementAllowanceIn, 11);

const maximumRunStepSuccessor = structuredClone(cleanSuccessor);
maximumRunStepSuccessor.stateKey = "movement-run-successor-maximum-step";
maximumRunStepSuccessor.activeSideKey = "player2";
maximumRunStepSuccessor.pieces = [
  piece("enemy", "player1", { xIn: 8, yIn: 34 }, false),
  piece("runner", "player2", { xIn: 21.3, yIn: 24 }, true),
];
const maximumRunStep = generateWarmachineMovementActivationPredecessorsV1(
  maximumRunStepSuccessor,
  {
    sideKey: "player2",
    actorPieceKeys: ["runner"],
    actionTypes: ["run"],
    deployments,
    rejectedAuditLimit: 16,
  },
);
assert.equal(maximumRunStep.ok, true, JSON.stringify(maximumRunStep));
assert.equal(maximumRunStep.strictCandidateCount, 1);
assert.equal(maximumRunStep.strictRejectedCount, 0);
assert.equal(maximumRunStep.candidates[0].movementProposal.proposalSource,
  "maximum_step_toward_strict_deployment_v1");
const maximumRunStepMover = maximumRunStep.candidates[0].predecessorState.pieces.find((row) =>
  row.pieceKey === "runner");
assert.ok(Math.abs(maximumRunStepMover.position.xIn - 32.3) <= 0.001);
assert.equal(maximumRunStep.candidates[0].movementProposal.proposalAllowanceIn, 11);
assert.equal(maximumRunStep.candidates[0].strictMovementAllowanceIn, 11);

const occupiedDeploymentRunSuccessor = structuredClone(cleanSuccessor);
occupiedDeploymentRunSuccessor.stateKey = "movement-run-successor-occupied-nearest-slot";
occupiedDeploymentRunSuccessor.activeSideKey = "player2";
occupiedDeploymentRunSuccessor.pieces = [
  piece("enemy", "player1", { xIn: 8, yIn: 34 }, false),
  piece("runner", "player2", { xIn: 24, yIn: 34 }, true),
  piece("deployed-support", "player2", { xIn: 32.59, yIn: 34 }, true),
];
const occupiedDeploymentRun = generateWarmachineMovementActivationPredecessorsV1(
  occupiedDeploymentRunSuccessor,
  {
    sideKey: "player2",
    actorPieceKeys: ["runner"],
    actionTypes: ["run"],
    deployments,
    maximumDeploymentSlotOrigins: 4,
    maximumDeploymentSlotRings: 1,
    rejectedAuditLimit: 32,
  },
);
assert.equal(occupiedDeploymentRun.ok, true, JSON.stringify(occupiedDeploymentRun));
assert.ok(occupiedDeploymentRun.strictCandidateCount >= 1);
assert.ok(occupiedDeploymentRun.strictRejectedCount >= 1);
const alternateSlotRun = occupiedDeploymentRun.candidates.find((row) =>
  row.movementProposal.proposalSource === "finite_base_aware_deployment_slot_v1");
assert.ok(alternateSlotRun, JSON.stringify(occupiedDeploymentRun.publicCandidates));
const alternateSlotOrigin = alternateSlotRun.predecessorState.pieces.find((row) =>
  row.pieceKey === "runner").position;
assert.ok(Math.hypot(
  alternateSlotOrigin.xIn - 32.59,
  alternateSlotOrigin.yIn - 34,
) >= 1.23 - 0.001, JSON.stringify({
  alternateSlotOrigin,
  movementProposal: alternateSlotRun.movementProposal,
  candidateOrigins: occupiedDeploymentRun.candidates.map((row) => ({
    origin: row.predecessorState.pieces.find((pieceRow) => pieceRow.pieceKey === "runner")
      ?.position,
    proposal: row.movementProposal,
  })),
}));

const combined = reverseWarmachineActivationSequenceV2(cleanSuccessor, {
  sideKey: "player1",
  deployments,
  movementActionTypes: ["advance"],
  maximumDepth: 1,
  maximumLabels: 16,
});
assert.equal(combined.ok, true, JSON.stringify(combined.unresolved));
assert.equal(combined.boundaryRouteCount, 2);
assert.equal(combined.boundaryStateCount, 2);
assert.equal(combined.unresolvedCount, 0);
assert.ok(combined.runtimeBoundaries.some((row) =>
  row.reverseEdges.some((edge) => edge.operatorKey === "pass_activation_inverse_v1")));
assert.ok(combined.runtimeBoundaries.some((row) =>
  row.reverseEdges.some((edge) => edge.operatorKey === "movement_activation_inverse_v1")));
const deploymentBoundary = combined.runtimeBoundaries.find((row) =>
  row.reverseEdges.some((edge) => edge.operatorKey === "movement_activation_inverse_v1"));
const openingState = structuredClone(deploymentBoundary.state);
openingState.stateKey = "movement-reverse-opening-boundary";
openingState.turnNumber = 1;
openingState.phaseKey = "control";
openingState.controlPhaseStepKey = "maintenance";
const deployment = auditWarmachineLegalDeploymentReachabilityV1(openingState, {
  firstPlayerSideKey: "player1",
  deployments,
});
assert.equal(deployment.ok, true, JSON.stringify(deployment));
assert.equal(deployment.legalDeploymentReached, true);

const boundedWitnessSuccessor = structuredClone(cleanSuccessor);
boundedWitnessSuccessor.stateKey = "movement-bounded-witness-successor";
boundedWitnessSuccessor.pieces.push(
  piece("second-mover", "player1", { xIn: 18, yIn: 28 }, true),
);
const boundedWitness = reverseWarmachineActivationSequenceV2(
  boundedWitnessSuccessor,
  {
    sideKey: "player1",
    deployments,
    movementActionTypes: ["advance"],
    maximumDepth: 2,
    maximumLabels: 16,
    maximumUniqueStates: 16,
    maximumGroupsPerExpansion: 1,
    maximumCandidatesPerExpansion: 1,
  },
);
assert.equal(boundedWitness.ok, true, JSON.stringify(boundedWitness.unresolved));
assert.equal(boundedWitness.boundaryRouteCount, 1);
assert.ok(boundedWitness.unresolved.some((row) =>
  row.reason === "activation_reverse_group_order_budget_deferred"));
assert.ok(boundedWitness.unresolved.some((row) =>
  row.reason === "activation_reverse_candidate_budget_deferred"));

const convergedOrderSuccessor = structuredClone(cleanSuccessor);
convergedOrderSuccessor.stateKey = "activation-order-convergence-successor";
convergedOrderSuccessor.pieces = [
  piece("first", "player1", { xIn: 18, yIn: 22 }, true),
  piece("second", "player1", { xIn: 18, yIn: 28 }, true),
  piece("enemy", "player2", { xIn: 40, yIn: 34 }, false),
];
const convergedOrders = reverseWarmachineActivationSequenceV2(
  convergedOrderSuccessor,
  {
    sideKey: "player1",
    deployments,
    includeMovement: false,
    includePass: true,
    maximumDepth: 2,
    maximumLabels: 16,
    maximumUniqueStates: 16,
  },
);
assert.equal(convergedOrders.boundaryRouteCount, 2);
assert.equal(convergedOrders.boundaryStateCount, 1);
assert.equal(new Set(convergedOrders.boundaries.map((row) => row.labelKey)).size, 2);
assert.equal(new Set(convergedOrders.boundaries.flatMap((row) =>
  row.reverseEdges.map((edge) => edge.actorPieceKey))).size, 2);
assert.notDeepEqual(
  convergedOrders.boundaries[0].reverseEdges.map((edge) => edge.actorPieceKey),
  convergedOrders.boundaries[1].reverseEdges.map((edge) => edge.actorPieceKey),
);

const unitPassSuccessor = structuredClone(cleanSuccessor);
unitPassSuccessor.stateKey = "unit-pass-successor";
unitPassSuccessor.pieces = [
  {
    ...piece("unit-a", "player1", { xIn: 18, yIn: 22 }, true),
    modelRole: "trooper",
    unitGroupId: "unit-pass-group",
  },
  {
    ...piece("unit-b", "player1", { xIn: 19.3, yIn: 22 }, true),
    modelRole: "trooper",
    unitGroupId: "unit-pass-group",
  },
  {
    ...piece("unit-c", "player1", { xIn: 20.6, yIn: 22 }, true),
    modelRole: "trooper",
    unitGroupId: "unit-pass-group",
  },
  piece("unit-pass-enemy", "player2", { xIn: 40, yIn: 34 }, false),
];
const unitPassReverse = reverseWarmachineActivationSequenceV2(unitPassSuccessor, {
  sideKey: "player1",
  deployments,
  includeMovement: false,
  includePass: true,
  maximumDepth: 1,
  maximumLabels: 16,
  maximumUniqueStates: 16,
  stopAfterBoundaryRouteCount: 8,
});
assert.equal(unitPassReverse.ok, true, JSON.stringify(unitPassReverse.unresolved));
assert.equal(unitPassReverse.boundaryRouteCount, 3);
assert.equal(unitPassReverse.boundaries.every((boundary) => boundary.reverseDepth === 1), true);
for (const boundary of unitPassReverse.runtimeBoundaries) {
  assert.equal(boundary.state.pieces.filter((row) =>
    row.unitGroupId === "unit-pass-group").every((row) => row.activated === false), true);
  assert.deepEqual(boundary.reverseEdges[0].activationGroupPieceKeys,
    ["unit-a", "unit-b", "unit-c"]);
  assert.equal(boundary.reverseEdges[0].activationGroupId, "unit-pass-group");
}
const boundedUnitPassReverse = reverseWarmachineActivationSequenceV2(unitPassSuccessor, {
  sideKey: "player1",
  deployments,
  includeMovement: false,
  includePass: true,
  maximumDepth: 1,
  maximumLabels: 8,
  maximumUniqueStates: 8,
  maximumPassActorsPerExpansion: 1,
});
assert.equal(boundedUnitPassReverse.boundaryRouteCount, 1);
assert.equal(boundedUnitPassReverse.unresolved.filter((row) =>
  row.reason === "pass_activation_actor_budget_deferred").length, 2);

const blockedSuccessor = structuredClone(cleanSuccessor);
blockedSuccessor.stateKey = "movement-successor-blocked";
blockedSuccessor.pieces.push(piece("friendly-blocker", "player1", { xIn: 17.5, yIn: 24 }));
const blocked = generateWarmachineMovementActivationPredecessorsV1(blockedSuccessor, {
  sideKey: "player1",
  actorPieceKeys: ["mover"],
  actionTypes: ["advance"],
  deployments,
  rejectedAuditLimit: 32,
});
assert.equal(blocked.ok, false);
assert.equal(blocked.strictCandidateCount, 0);
assert.ok(blocked.strictRejectedCount >= 1);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_movement_activation_predecessor_v1",
  strictCandidateCount: reverse.strictCandidateCount,
  predecessorOrigin: predecessorMover.position,
  destination: candidate.movementProposal.destination,
  strictTransitionCount: candidate.strictTransitionCount,
  combinedBoundaryRouteCount: combined.boundaryRouteCount,
  combinedBoundaryStateCount: combined.boundaryStateCount,
  convergedActivationOrderRouteCount: convergedOrders.boundaryRouteCount,
  convergedActivationOrderStateCount: convergedOrders.boundaryStateCount,
  legalDeploymentReached: deployment.legalDeploymentReached,
  boundedWitnessBoundaryRouteCount: boundedWitness.boundaryRouteCount,
  boundedWitnessDeferredBranchCount: boundedWitness.unresolved.filter((row) =>
    /budget_deferred/.test(row.reason)).length,
  directRunOrigin: directRunMover.position,
  maximumRunStepOrigin: maximumRunStepMover.position,
  runAllowanceIn: maximumRunStep.candidates[0].strictMovementAllowanceIn,
  occupiedDeploymentAlternateSlotOrigin: alternateSlotOrigin,
  occupiedDeploymentStrictCandidateCount: occupiedDeploymentRun.strictCandidateCount,
  occupiedDeploymentRejectedCount: occupiedDeploymentRun.strictRejectedCount,
  blockedStrictCandidateCount: blocked.strictCandidateCount,
  blockedRejectedCount: blocked.strictRejectedCount,
  reportHash: reverse.reportHash,
}, null, 2));
