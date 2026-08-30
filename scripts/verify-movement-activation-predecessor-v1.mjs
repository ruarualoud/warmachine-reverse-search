import assert from "node:assert/strict";

import { enumerateWarmachineBenchmarkActionsV2 } from
  "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import { generateWarmachineMovementActivationPredecessorsV1 } from
  "../src/reverse/movement-activation-predecessor-v1.mjs";
import { generateWarmachineControlPhasePredecessorsV1 } from
  "../src/reverse/control-phase-predecessor-v1.mjs";
import {
  auditWarmachineActivationSequenceResumeCheckpointV1,
  reverseWarmachineActivationSequenceV2,
} from
  "../src/reverse/activation-sequence-predecessor-v2.mjs";
import { auditWarmachineLegalDeploymentReachabilityV1 } from
  "../src/reverse/deployment-reachability-v1.mjs";
import {
  reissueWarmachineTerminalReverseRouteV1,
  replayWarmachineTerminalReverseRouteV1,
} from "../src/reverse/replay-terminal-reverse-route-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";

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

const transientPathDecoratedSuccessor = structuredClone(cleanSuccessor);
transientPathDecoratedSuccessor.explicitMovementPaths = [{
  pathKey: "test-only-search-path",
  actorPieceKey: "mover",
  actionType: "advance",
  waypoints: [{ xIn: 20, yIn: 24 }],
}];
transientPathDecoratedSuccessor.pieces[0].metadata = {
  explicitMovementPaths: [],
};
assert.equal(
  warmachineReverseStateSemanticHashV1(transientPathDecoratedSuccessor),
  warmachineReverseStateSemanticHashV1(cleanSuccessor),
  "Explicit movement paths are transient execution hints, not rules-state identity",
);

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

const invalidPathRunSuccessor = structuredClone(directRunSuccessor);
invalidPathRunSuccessor.stateKey = "movement-invalid-path-witness-successor";
Object.assign(invalidPathRunSuccessor.pieces.find((row) =>
  row.pieceKey === "mover"), {
  isWarjack: true,
  modelRole: "warjack",
  modelType: "Warjack",
  resourceKind: "focus",
  resourceMax: 3,
  focus: 0,
});
const invalidPathRun = generateWarmachineMovementActivationPredecessorsV1(
  invalidPathRunSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["mover"],
    actionTypes: ["run"],
    deployments,
    originProposals: [{
      proposalKey: "invalid-empty-waypoint-run",
      actorPieceKey: "mover",
      actionType: "run",
      origin: { xIn: 26.2, yIn: 24 },
      waypoints: [],
      proposalPriority: -100,
    }],
    maximumStrictCandidates: 1,
    maximumStrictCandidateAttempts: 4,
    rejectedAuditLimit: 16,
  },
);
assert.ok(invalidPathRun.rejected.some((row) =>
  row.reason === "reverse_movement_path_witness_invalid" &&
  row.proposalKey === "invalid-empty-waypoint-run"));
assert.ok(invalidPathRun.strictCandidateCount >= 1,
  JSON.stringify(invalidPathRun, null, 2));

const alternateDirectRun = generateWarmachineMovementActivationPredecessorsV1(
  directRunSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["mover"],
    actionTypes: ["run"],
    deployments,
    includeDeploymentSlotAlternatives: true,
    maximumDeploymentSlotOrigins: 4,
    maximumDeploymentSlotRings: 1,
    maximumStrictCandidates: 4,
    maximumStrictCandidateAttempts: 16,
  },
);
assert.equal(alternateDirectRun.strictCandidateCount > 1, true,
  JSON.stringify(alternateDirectRun.publicCandidates));
assert.equal(new Set(alternateDirectRun.candidates.map((row) =>
  JSON.stringify(row.movementProposal.origin))).size > 1, true);

const reservedDeploymentRunSuccessor = structuredClone(directRunSuccessor);
reservedDeploymentRunSuccessor.stateKey = "movement-run-successor-future-slot-reservation";
reservedDeploymentRunSuccessor.pieces.push(
  piece("future-deployment-mover", "player1", { xIn: 21.3, yIn: 24 }, true),
);
const reservedDeploymentRun = generateWarmachineMovementActivationPredecessorsV1(
  reservedDeploymentRunSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["mover"],
    actionTypes: ["run"],
    deployments,
    reservedDeploymentPieceKeys: ["future-deployment-mover"],
    maximumDeploymentSlotOrigins: 4,
    maximumStrictCandidates: 2,
    maximumStrictCandidateAttempts: 8,
  },
);
const reservedDeploymentCandidate = reservedDeploymentRun.candidates.find((row) =>
  row.movementProposal.deploymentSlotKey.startsWith(
    "reserved:future-deployment-mover:",
  ));
assert.ok(reservedDeploymentCandidate,
  JSON.stringify(reservedDeploymentRun.publicCandidates, null, 2));
assert.equal(Math.hypot(
  reservedDeploymentCandidate.movementProposal.origin.xIn - 15.41,
  reservedDeploymentCandidate.movementProposal.origin.yIn - 24,
) >= 1.23 - 0.001, true);

const shedFuryRunSuccessor = structuredClone(directRunSuccessor);
shedFuryRunSuccessor.stateKey = "movement-run-successor-after-shed-fury";
const shedFuryWarlock = shedFuryRunSuccessor.pieces.find((row) =>
  row.pieceKey === "mover");
Object.assign(shedFuryWarlock, {
  modelRole: "warlock leader",
  modelType: "Warlock",
  isWarlock: true,
  resourceKind: "fury",
  resourcePoints: 6,
  resource2: 6,
  fury: 6,
  resourceMax: 7,
  resource2Max: 7,
  arc: 7,
  controlRangeIn: 14,
});
const shedFuryRun = generateWarmachineMovementActivationPredecessorsV1(
  shedFuryRunSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["mover"],
    actionTypes: ["run"],
    deployments,
    includeResourceSpendPrefixes: true,
    resourceSpendPrefixActorPieceKeys: ["mover"],
    requireResourceSpendPrefixActorPieceKeys: ["mover"],
    maximumDeploymentSlotOrigins: 1,
    maximumResourcePrefixDepth: 1,
    maximumResourcePrefixLabels: 4,
    maximumResourcePrefixRoutes: 1,
    maximumStrictCandidates: 4,
    maximumStrictCandidateAttempts: 8,
  },
);
const shedFuryRunCandidate = shedFuryRun.candidates.find((row) =>
  row.operatorKey === "resource_prefix_movement_activation_inverse_v1" &&
  row.strictReplaySteps.some((step) => step.actionType === "shed_fury"));
assert.ok(shedFuryRunCandidate, JSON.stringify({
  candidates: shedFuryRun.publicCandidates,
  rejected: shedFuryRun.rejected,
  unresolved: shedFuryRun.unresolved,
}, null, 2));
assert.equal(shedFuryRunCandidate.preActivationResourcePoints, 7);
assert.equal(shedFuryRun.candidates.every((row) =>
  row.operatorKey === "resource_prefix_movement_activation_inverse_v1"), true);
assert.deepEqual(shedFuryRunCandidate.strictReplaySteps.map((step) => step.actionType), [
  "shed_fury",
  "run",
]);

const forcedWarbeastRunSuccessor = structuredClone(directRunSuccessor);
forcedWarbeastRunSuccessor.stateKey = "movement-run-successor-forced-warbeast";
const forcedWarbeast = forcedWarbeastRunSuccessor.pieces.find((row) =>
  row.pieceKey === "mover");
Object.assign(forcedWarbeast, {
  modelRole: "warbeast",
  modelType: "Warbeast",
  isWarbeast: true,
  resourceKind: "fury",
  resourcePoints: 1,
  resource2: 1,
  fury: 1,
  resourceMax: 4,
  resource2Max: 4,
  furyThreshold: 4,
  canForceFury: true,
  canBeLeeched: true,
  battlegroupId: "test-battlegroup",
  battlegroupControllerPieceKey: "test-warlock",
  controllerPieceKey: "test-warlock",
});
forcedWarbeastRunSuccessor.pieces.push({
  ...piece("test-warlock", "player1", { xIn: 20, yIn: 30 }, false),
  modelRole: "warlock leader",
  modelType: "Warlock",
  isWarlock: true,
  resourceKind: "fury",
  resourcePoints: 0,
  resource2: 0,
  fury: 0,
  resourceMax: 6,
  resource2Max: 6,
  controlRangeIn: 12,
  battlegroupId: "test-battlegroup",
});
const forcedWarbeastRun = generateWarmachineMovementActivationPredecessorsV1(
  forcedWarbeastRunSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["mover"],
    actionTypes: ["run"],
    deployments,
    maximumDeploymentSlotOrigins: 1,
    rejectedAuditLimit: 16,
  },
);
assert.equal(forcedWarbeastRun.ok, true, JSON.stringify(forcedWarbeastRun));
const forcedWarbeastRunCandidate = forcedWarbeastRun.candidates.find((row) =>
  row.preActivationResourcePoints === 0 && row.reverseRestoredResourcePoints === -1);
assert.ok(forcedWarbeastRunCandidate,
  JSON.stringify(forcedWarbeastRun.publicCandidates, null, 2));
assert.equal(forcedWarbeastRunCandidate.predecessorState.pieces.find((row) =>
  row.pieceKey === "mover").fury, 0);
assert.equal(forcedWarbeastRun.movementResourcePreimageCount >= 5, true);
assert.equal(forcedWarbeastRunCandidate.resourcePreimagePriority, 0);

const forcedWarjackRunSuccessor = structuredClone(directRunSuccessor);
forcedWarjackRunSuccessor.stateKey = "movement-run-successor-forced-warjack";
const forcedWarjack = forcedWarjackRunSuccessor.pieces.find((row) =>
  row.pieceKey === "mover");
Object.assign(forcedWarjack, {
  modelRole: "warjack",
  modelType: "Warjack",
  isWarjack: true,
  resourceKind: "focus",
  resourcePoints: 0,
  resource2: 0,
  focus: 0,
  resourceMax: 3,
  resource2Max: 3,
  battlegroupId: "test-battlegroup",
  battlegroupControllerPieceKey: "test-warcaster",
  controllerPieceKey: "test-warcaster",
});
const forcedWarjackRun = generateWarmachineMovementActivationPredecessorsV1(
  forcedWarjackRunSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["mover"],
    actionTypes: ["run"],
    deployments,
    maximumDeploymentSlotOrigins: 1,
    maximumStrictCandidates: 1,
    maximumStrictCandidateAttempts: 1,
  },
);
assert.equal(forcedWarjackRun.ok, true, JSON.stringify(forcedWarjackRun));
assert.equal(forcedWarjackRun.strictCandidateAttemptCount, 1);
assert.equal(forcedWarjackRun.candidates[0].preActivationResourcePoints, 1);
assert.equal(forcedWarjackRun.candidates[0].resourcePreimagePriority, 0);

const zeroDistanceWarjackRunSuccessor = structuredClone(forcedWarjackRunSuccessor);
zeroDistanceWarjackRunSuccessor.stateKey =
  "movement-run-successor-zero-distance-warjack";
zeroDistanceWarjackRunSuccessor.pieces.find((row) =>
  row.pieceKey === "mover").position = { xIn: 20, yIn: 24 };
const zeroDistanceWarjackRun = generateWarmachineMovementActivationPredecessorsV1(
  zeroDistanceWarjackRunSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["mover"],
    actionTypes: ["run"],
    deployments: {},
    maximumStrictCandidates: 1,
    maximumStrictCandidateAttempts: 1,
    rejectedAuditLimit: 16,
  },
);
assert.equal(zeroDistanceWarjackRun.ok, true,
  JSON.stringify(zeroDistanceWarjackRun));
assert.equal(zeroDistanceWarjackRun.strictCandidateCount, 1,
  JSON.stringify(zeroDistanceWarjackRun));
assert.equal(zeroDistanceWarjackRun.candidates[0].preActivationResourcePoints, 1);
assert.equal(zeroDistanceWarjackRun.candidates[0].reverseRestoredResourcePoints, 1);
assert.equal(zeroDistanceWarjackRun.candidates[0].movementProposal.proposalSource,
  "zero_distance_resource_spend_v1");
assert.deepEqual(zeroDistanceWarjackRun.candidates[0].movementProposal.origin,
  zeroDistanceWarjackRun.candidates[0].movementProposal.destination);

const powerUpSpendPreferredSuccessor = structuredClone(
  zeroDistanceWarjackRunSuccessor,
);
powerUpSpendPreferredSuccessor.stateKey =
  "activation-power-up-spend-preferred-successor";
powerUpSpendPreferredSuccessor.pieces.push({
  ...piece("test-warcaster", "player1", { xIn: 8, yIn: 24 }, false),
  modelRole: "warcaster",
  modelType: "Warcaster",
  isWarcaster: true,
  resourceKind: "focus",
  resourcePoints: 0,
  resource2: 0,
  focus: 0,
  resourceMax: 7,
  resource2Max: 7,
  controlRangeIn: 14,
  battlegroupId: "test-battlegroup",
});
const powerUpSpendPreferred = reverseWarmachineActivationSequenceV2(
  powerUpSpendPreferredSuccessor,
  {
    sideKey: "player1",
    deployments: {},
    movementActionTypes: ["run"],
    maximumDepth: 1,
    maximumLabels: 4,
    maximumUniqueStates: 4,
    maximumGroupsPerExpansion: 1,
    maximumCandidatesPerExpansion: 1,
    maximumMovementStrictCandidateAttempts: 4,
    prioritizeControlResourceDependencies: true,
  },
);
assert.equal(powerUpSpendPreferred.boundaryRouteCount, 1,
  JSON.stringify(powerUpSpendPreferred.unresolved, null, 2));
assert.equal(powerUpSpendPreferred.runtimeBoundaries[0].reverseEdges[0].operatorKey,
  "movement_activation_inverse_v1");
assert.equal(powerUpSpendPreferred.runtimeBoundaries[0].reverseEdges[0]
  .reverseRestoredResourcePoints, 1);

const freeRunPowerUpAvoidanceSuccessor = structuredClone(
  powerUpSpendPreferredSuccessor,
);
freeRunPowerUpAvoidanceSuccessor.stateKey =
  "activation-free-run-power-up-avoidance-successor";
Object.assign(freeRunPowerUpAvoidanceSuccessor.pieces.find((row) =>
  row.pieceKey === "mover"), {
  position: { xIn: 20, yIn: 24 },
  runWithoutSpendingFocus: true,
});
Object.assign(freeRunPowerUpAvoidanceSuccessor.pieces.find((row) =>
  row.pieceKey === "test-warcaster"), {
  focus: 6,
  resourcePoints: 6,
  resource2: 6,
});
for (const row of freeRunPowerUpAvoidanceSuccessor.pieces) {
  row.metadata = {
    ...(row.metadata || {}),
    upkeepsPaidThisControlPhase: [],
  };
}
const freeRunPowerUpAvoidance = generateWarmachineMovementActivationPredecessorsV1(
  freeRunPowerUpAvoidanceSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["mover"],
    actionTypes: ["run"],
    deployments: {},
    maximumStrictCandidates: 1,
    maximumStrictCandidateAttempts: 16,
    rejectedAuditLimit: 16,
  },
);
assert.equal(freeRunPowerUpAvoidance.strictCandidateCount, 1,
  JSON.stringify(freeRunPowerUpAvoidance, null, 2));
const freeRunPowerUpAvoidanceCandidate = freeRunPowerUpAvoidance.candidates[0];
assert.equal(freeRunPowerUpAvoidanceCandidate.preActivationResourcePoints, 0);
assert.equal(freeRunPowerUpAvoidanceCandidate.movementProposal.proposalSource,
  "controller_power_up_avoidance_angular_cells_v1");
const avoidedPowerUpControl = generateWarmachineControlPhasePredecessorsV1(
  freeRunPowerUpAvoidanceCandidate.predecessorState,
  {
    resourceEnvelopeModes: ["reverse_focus_control_baseline"],
    controlResidueModes: ["absent"],
  },
);
assert.equal(avoidedPowerUpControl.strictCandidateCount, 1,
  JSON.stringify(avoidedPowerUpControl.unresolved, null, 2));

const freeRunOutsideDestinationSuccessor = structuredClone(
  freeRunPowerUpAvoidanceSuccessor,
);
freeRunOutsideDestinationSuccessor.stateKey =
  "activation-free-run-power-up-avoidance-outside-destination-successor";
freeRunOutsideDestinationSuccessor.pieces.find((row) =>
  row.pieceKey === "mover").position = { xIn: 26, yIn: 24 };
const freeRunOutsideDestination =
  generateWarmachineMovementActivationPredecessorsV1(
    freeRunOutsideDestinationSuccessor,
    {
      sideKey: "player1",
      actorPieceKeys: ["mover"],
      actionTypes: ["run"],
      deployments: {},
      maximumStrictCandidates: 1,
      maximumStrictCandidateAttempts: 16,
      rejectedAuditLimit: 16,
    },
  );
assert.equal(freeRunOutsideDestination.strictCandidateCount, 1,
  JSON.stringify(freeRunOutsideDestination, null, 2));
const freeRunOutsideDestinationCandidate =
  freeRunOutsideDestination.candidates[0];
assert.equal(freeRunOutsideDestinationCandidate.preActivationResourcePoints, 0);
assert.equal(freeRunOutsideDestinationCandidate.movementProposal.proposalSource,
  "controller_power_up_avoidance_angular_cells_v1");
const avoidedPowerUpOutsideDestinationControl =
  generateWarmachineControlPhasePredecessorsV1(
    freeRunOutsideDestinationCandidate.predecessorState,
    {
      resourceEnvelopeModes: ["reverse_focus_control_baseline"],
      controlResidueModes: ["absent"],
    },
  );
assert.equal(avoidedPowerUpOutsideDestinationControl.strictCandidateCount, 1,
  JSON.stringify(avoidedPowerUpOutsideDestinationControl.unresolved, null, 2));

const controllerAnchoredRunSuccessor = structuredClone(forcedWarjackRunSuccessor);
controllerAnchoredRunSuccessor.stateKey =
  "movement-run-successor-controller-resource-anchor";
controllerAnchoredRunSuccessor.pieces.find((row) =>
  row.pieceKey === "mover").position = { xIn: 30, yIn: 24 };
controllerAnchoredRunSuccessor.pieces.push({
  ...piece("test-warcaster", "player1", { xIn: 8, yIn: 24 }, false),
  modelRole: "warcaster",
  modelType: "Warcaster",
  isWarcaster: true,
  resourceKind: "focus",
  resourcePoints: 0,
  resource2: 0,
  focus: 0,
  resourceMax: 7,
  resource2Max: 7,
  controlRangeIn: 14,
  battlegroupId: "test-battlegroup",
});
const controllerAnchoredRun = generateWarmachineMovementActivationPredecessorsV1(
  controllerAnchoredRunSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["mover"],
    actionTypes: ["run"],
    deployments: {},
    maximumStrictCandidates: 1,
    maximumStrictCandidateAttempts: 16,
    rejectedAuditLimit: 16,
  },
);
assert.equal(controllerAnchoredRun.strictCandidateCount, 1,
  JSON.stringify(controllerAnchoredRun));
const controllerAnchoredCandidate = controllerAnchoredRun.candidates[0];
assert.equal(controllerAnchoredCandidate.preActivationResourcePoints, 1);
assert.equal(controllerAnchoredCandidate.movementProposal.proposalSource,
  "controller_control_range_resource_origin_v1");
const controllerOrigin = controllerAnchoredCandidate.movementProposal.origin;
assert.equal(Math.hypot(controllerOrigin.xIn - 8, controllerOrigin.yIn - 24) -
  1.18 <= 14.001, true);
assert.equal(controllerAnchoredRun.unresolved.some((row) =>
  row.reason === "controller_control_range_origin_continuum_deferred"), true);

const dependencyOrderedSuccessor = structuredClone(controllerAnchoredRunSuccessor);
dependencyOrderedSuccessor.stateKey =
  "activation-control-resource-dependency-order-successor";
dependencyOrderedSuccessor.pieces.find((row) =>
  row.pieceKey === "test-warcaster").activated = true;
dependencyOrderedSuccessor.pieces.push(
  piece("ordinary-blocker-group", "player1", { xIn: 44, yIn: 40 }, true),
);
const selectedDependencyGroups = [];
reverseWarmachineActivationSequenceV2(dependencyOrderedSuccessor, {
  sideKey: "player1",
  deployments,
  movementActionTypes: ["run"],
  maximumDepth: 2,
  maximumLabels: 8,
  maximumUniqueStates: 8,
  maximumGroupsPerExpansion: 1,
  maximumCandidatesPerExpansion: 1,
  maximumMovementStrictCandidateAttempts: 16,
  groupOrderKeys: ["ordinary-blocker-group", "mover", "test-warcaster"],
  prioritizeControlResourceDependencies: true,
  onProgress: (event) => {
    if (event.stage !== "activation_expansion_started") return;
    selectedDependencyGroups.push(event.selectedGroups?.[0]?.groupKey || "");
  },
});
assert.deepEqual(selectedDependencyGroups.slice(0, 2), [
  "test-warcaster",
  "mover",
]);

const blockerCornerAnchoredRunSuccessor = structuredClone(
  controllerAnchoredRunSuccessor,
);
blockerCornerAnchoredRunSuccessor.stateKey =
  "movement-run-successor-controller-blocker-corner-anchor";
blockerCornerAnchoredRunSuccessor.pieces.find((row) =>
  row.pieceKey === "mover").speedIn = 8;
blockerCornerAnchoredRunSuccessor.terrain = [{
  terrainKey: "controller-anchor-wall",
  type: "Blocking Wall",
  xIn: 23.5,
  yIn: 24,
  widthIn: 2,
  heightIn: 10,
  blocksMovement: true,
  blocksLineOfSight: true,
}];
const blockerCornerAnchoredRun = generateWarmachineMovementActivationPredecessorsV1(
  blockerCornerAnchoredRunSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["mover"],
    actionTypes: ["run"],
    deployments: {},
    maximumStrictCandidates: 1,
    maximumStrictCandidateAttempts: 24,
    rejectedAuditLimit: 16,
  },
);
assert.equal(blockerCornerAnchoredRun.strictCandidateCount, 1,
  JSON.stringify(blockerCornerAnchoredRun));
const blockerCornerCandidate = blockerCornerAnchoredRun.candidates[0];
assert.equal(blockerCornerCandidate.movementProposal.deploymentSlotKey.startsWith(
  "controller-control-range-blocker:controller-anchor-wall:"), true);
assert.equal(blockerCornerCandidate.movementProposal.proposalSource,
  "controller_control_range_blocker_corner_route_v1");
assert.equal(blockerCornerCandidate.movementProposal.waypoints.length > 1, true);

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
assert.equal(maximumRunStep.strictCandidateCount, 4);
assert.equal(maximumRunStep.strictRejectedCount, 0);
assert.equal(maximumRunStep.candidates.every((row) =>
  row.movementProposal.proposalSource === "finite_step_toward_strict_deployment_v1"), true);
const maximumRunStepCandidate = maximumRunStep.candidates.find((row) => {
  const runner = row.predecessorState.pieces.find((pieceRow) =>
    pieceRow.pieceKey === "runner");
  return Math.abs(runner.position.xIn - 32.3) <= 0.001;
});
assert.ok(maximumRunStepCandidate, JSON.stringify(maximumRunStep.publicCandidates));
const maximumRunStepMover = maximumRunStepCandidate.predecessorState.pieces.find((row) =>
  row.pieceKey === "runner");
assert.ok(Math.abs(maximumRunStepMover.position.xIn - 32.3) <= 0.001);
assert.equal(maximumRunStepCandidate.movementProposal.proposalAllowanceIn, 11);
assert.equal(maximumRunStepCandidate.strictMovementAllowanceIn, 11);

const boundedMaximumRunStep = generateWarmachineMovementActivationPredecessorsV1(
  maximumRunStepSuccessor,
  {
    sideKey: "player2",
    actorPieceKeys: ["runner"],
    actionTypes: ["run"],
    deployments,
    maximumDeploymentSlotOrigins: 8,
    maximumDeploymentSlotRings: 2,
    maximumStrictCandidates: 1,
  },
);
assert.equal(boundedMaximumRunStep.ok, true,
  JSON.stringify(boundedMaximumRunStep));
assert.equal(boundedMaximumRunStep.strictCandidateCount, 1);
assert.equal(boundedMaximumRunStep.strictCandidateBudgetCutoffReached, true);
assert.equal(boundedMaximumRunStep.unresolved.some((row) =>
  row.reason === "movement_strict_candidate_budget_deferred"), true);

const attemptBoundedMaximumRunStep =
  generateWarmachineMovementActivationPredecessorsV1(
    maximumRunStepSuccessor,
    {
      sideKey: "player2",
      actorPieceKeys: ["runner"],
      actionTypes: ["run"],
      deployments,
      maximumDeploymentSlotOrigins: 8,
      maximumDeploymentSlotRings: 2,
      maximumStrictCandidateAttempts: 1,
    },
  );
assert.equal(attemptBoundedMaximumRunStep.strictCandidateAttemptCount, 1);
assert.equal(
  attemptBoundedMaximumRunStep.strictCandidateAttemptBudgetCutoffReached,
  true,
);
assert.equal(attemptBoundedMaximumRunStep.unresolved.some((row) =>
  row.reason === "movement_strict_candidate_attempt_budget_deferred"), true);

const detourDeployments = {
  p1_deploy: { id: "p1_deploy", x: 24, y: 42.5, width: 48, height: 11 },
  p2_deploy: { id: "p2_deploy", x: 24, y: 3, width: 48, height: 6 },
};
const blockedStraightRunSuccessor = {
  ...structuredClone(cleanSuccessor),
  stateKey: "movement-run-successor-host-detour",
  pieces: [piece("detour-runner", "player1", { xIn: 12, yIn: 12 }, true)],
  terrain: [{
    terrainKey: "scenario-flag",
    type: "scenario terrain",
    xIn: 12.59,
    yIn: 16.41,
    widthIn: 1.18,
    heightIn: 1.18,
    blocksMovement: true,
  }],
};
const blockedStraightRun = generateWarmachineMovementActivationPredecessorsV1(
  blockedStraightRunSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["detour-runner"],
    actionTypes: ["run"],
    deployments: detourDeployments,
    maximumDeploymentSlotOrigins: 1,
    rejectedAuditLimit: 32,
  },
);
assert.equal(blockedStraightRun.ok, true, JSON.stringify(blockedStraightRun));
assert.ok(blockedStraightRun.strictRejectedCount >= 1);
const detourCandidate = blockedStraightRun.candidates.find((row) =>
  row.movementProposal.proposalSource === "host_auto_routed_reverse_path_v1");
assert.ok(detourCandidate, JSON.stringify(blockedStraightRun.publicCandidates, null, 2));
assert.ok(detourCandidate.movementProposal.waypoints.length >= 2);
const detourReplay = replayWarmachineTerminalReverseRouteV1({
  candidateKey: detourCandidate.candidateKey,
  predecessorState: detourCandidate.predecessorState,
  reverseEdges: [detourCandidate],
}, enumerateWarmachineBenchmarkActionsV2(blockedStraightRunSuccessor).state, {
  routeKey: "verify-host-auto-routed-reverse-movement",
});
assert.equal(detourReplay.fullRouteStrictReplayCertified, true, JSON.stringify(detourReplay));

const equivalentPathSuccessor = {
  ...structuredClone(cleanSuccessor),
  stateKey: "movement-successor-equivalent-path-budget",
  pieces: [
    {
      ...piece("equivalent-path-runner", "player1", { xIn: 12, yIn: 12 }, true),
      speedIn: 8,
    },
  ],
};
const equivalentPathBudget =
  generateWarmachineMovementActivationPredecessorsV1(
    equivalentPathSuccessor,
    {
      sideKey: "player1",
      actorPieceKeys: ["equivalent-path-runner"],
      actionTypes: ["advance"],
      originProposals: [
        {
          proposalKey: "equivalent-direct",
          actorPieceKey: "equivalent-path-runner",
          actionType: "advance",
          origin: { xIn: 6, yIn: 12 },
          waypoints: [{ xIn: 12, yIn: 12 }],
        },
        {
          proposalKey: "equivalent-detour",
          actorPieceKey: "equivalent-path-runner",
          actionType: "advance",
          origin: { xIn: 6, yIn: 12 },
          waypoints: [
            { xIn: 9, yIn: 13 },
            { xIn: 12, yIn: 12 },
          ],
        },
      ],
      maximumStrictCandidates: 2,
      maximumStrictCandidateAttempts: 4,
      dedupeEquivalentPathWitnessesForReachabilityBudget: true,
    },
  );
assert.equal(equivalentPathBudget.strictCandidateCount, 1,
  JSON.stringify(equivalentPathBudget.publicCandidates, null, 2));
assert.ok(equivalentPathBudget.equivalentPathWitnessDeferredCount >= 1);
assert.equal(equivalentPathBudget.unresolved.some((row) =>
  row.reason === "movement_equivalent_path_witness_not_reexecuted"), true);

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

const occupiedDeploymentRunBudgetOne = generateWarmachineMovementActivationPredecessorsV1(
  occupiedDeploymentRunSuccessor,
  {
    sideKey: "player2",
    actorPieceKeys: ["runner"],
    actionTypes: ["run"],
    deployments,
    maximumDeploymentSlotOrigins: 1,
    maximumDeploymentSlotRings: 1,
    rejectedAuditLimit: 32,
  },
);
assert.ok(occupiedDeploymentRunBudgetOne.strictCandidateCount +
  occupiedDeploymentRunBudgetOne.strictRejectedCount >= 1,
JSON.stringify(occupiedDeploymentRunBudgetOne));
assert.equal(occupiedDeploymentRunBudgetOne.candidates.every((row) =>
  row.movementProposal.proposalSource === "finite_base_aware_deployment_slot_v1"), true);
assert.equal(occupiedDeploymentRunBudgetOne.candidates.every((row) => {
  const origin = row.predecessorState.pieces.find((pieceRow) =>
    pieceRow.pieceKey === "runner")?.position;
  return Math.hypot(origin.xIn - 32.59, origin.yIn - 34) >= 1.23 - 0.001;
}), true);
assert.equal(occupiedDeploymentRunBudgetOne.rejected.every((row) =>
  row.proposalKey.includes(":around:")), true);
assert.ok(occupiedDeploymentRunBudgetOne.unresolved.some((row) =>
  row.reason === "deployment_slot_origin_budget_exhausted" &&
  row.slotKey === "nearest" && row.originPlacementIssues.length > 0));

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

const declaredMovementWitnessSuccessor = structuredClone(cleanSuccessor);
declaredMovementWitnessSuccessor.stateKey =
  "declared-movement-witness-successor";
declaredMovementWitnessSuccessor.pieces.find((row) =>
  row.pieceKey === "mover").position = { xIn: 10, yIn: 24 };
const declaredMovementWitness = reverseWarmachineActivationSequenceV2(
  declaredMovementWitnessSuccessor,
  {
    sideKey: "player1",
    deployments,
    movementActionTypes: ["run"],
    movementGroupKeys: ["mover"],
    groupOrderKeys: ["mover"],
    originProposals: [{
      proposalKey: "declared-run-witness",
      actorPieceKey: "mover",
      actionType: "run",
      origin: { xIn: 16.5, yIn: 24 },
      waypoints: [{ xIn: 10, yIn: 24 }],
      proposalPriority: -100,
    }],
    maximumDepth: 1,
    maximumLabels: 4,
    maximumUniqueStates: 4,
    maximumGroupsPerExpansion: 1,
    maximumCandidatesPerExpansion: 1,
    maximumMovementStrictCandidatesPerExpansion: 1,
    maximumMovementStrictCandidateAttempts: 4,
  },
);
assert.equal(declaredMovementWitness.boundaryRouteCount, 1,
  JSON.stringify(declaredMovementWitness.unresolved, null, 2));
assert.equal(
  declaredMovementWitness.runtimeBoundaries[0].reverseEdges[0].operatorKey,
  "movement_activation_inverse_v1",
);
assert.equal(
  declaredMovementWitness.runtimeBoundaries[0].reverseEdges[0].actionType,
  "run",
);
assert.ok(declaredMovementWitness.unresolved.some((row) =>
  row.reason === "activation_reverse_candidate_budget_deferred" &&
  row.detail?.operatorKey === "pass_activation_inverse_v1"));

const explicitPriorityWitness = reverseWarmachineActivationSequenceV2(
  directRunSuccessor,
  {
    sideKey: "player1",
    deployments,
    movementActionTypes: ["run"],
    movementGroupKeys: ["mover"],
    groupOrderKeys: ["mover"],
    originProposals: [{
      proposalKey: "explicit-run-priority-witness",
      actorPieceKey: "mover",
      actionType: "run",
      origin: { xIn: 18, yIn: 24 },
      waypoints: [{ xIn: 26.2, yIn: 24 }],
      proposalPriority: -100,
    }],
    maximumDepth: 1,
    maximumLabels: 4,
    maximumUniqueStates: 4,
    maximumGroupsPerExpansion: 1,
    maximumCandidatesPerExpansion: 1,
    maximumMovementStrictCandidatesPerExpansion: 2,
    maximumMovementStrictCandidateAttempts: 4,
  },
);
assert.equal(explicitPriorityWitness.boundaryRouteCount, 1,
  JSON.stringify(explicitPriorityWitness.unresolved, null, 2));
assert.equal(
  explicitPriorityWitness.runtimeBoundaries[0].reverseEdges[0]
    .movementProposal.proposalKey.startsWith("explicit-run-priority-witness:"),
  true,
);
assert.deepEqual(
  explicitPriorityWitness.runtimeBoundaries[0].reverseEdges[0]
    .movementProposal.origin,
  { xIn: 18, yIn: 24 },
);

const breadthFirstBoundaryOrderWitness = reverseWarmachineActivationSequenceV2(
  directRunSuccessor,
  {
    sideKey: "player1",
    deployments,
    movementActionTypes: ["run"],
    movementGroupKeys: ["mover"],
    groupOrderKeys: ["mover"],
    originProposals: [
      {
        proposalKey: "preferred-history-origin",
        actorPieceKey: "mover",
        actionType: "run",
        origin: { xIn: 15.41, yIn: 24 },
        waypoints: [{ xIn: 26.2, yIn: 24 }],
        proposalPriority: -100,
      },
      {
        proposalKey: "alternate-higher-deployment-debt-origin",
        actorPieceKey: "mover",
        actionType: "run",
        origin: { xIn: 18, yIn: 24 },
        waypoints: [{ xIn: 26.2, yIn: 24 }],
        proposalPriority: 0,
      },
    ],
    frontierOrder: "breadth_first_by_activation_depth",
    maximumDepth: 1,
    maximumLabels: 4,
    maximumUniqueStates: 4,
    maximumGroupsPerExpansion: 1,
    maximumCandidatesPerExpansion: 2,
    maximumMovementStrictCandidatesPerExpansion: 2,
    maximumMovementStrictCandidateAttempts: 4,
    stopAfterBoundaryRouteCount: 2,
  },
);
assert.equal(breadthFirstBoundaryOrderWitness.boundaryRouteCount, 2,
  JSON.stringify(breadthFirstBoundaryOrderWitness.unresolved, null, 2));
assert.equal(
  breadthFirstBoundaryOrderWitness.runtimeBoundaries[0].reverseEdges[0]
    .movementProposal.proposalKey.startsWith("preferred-history-origin:"),
  true,
);
assert.deepEqual(
  breadthFirstBoundaryOrderWitness.runtimeBoundaries[0].reverseEdges[0]
    .movementProposal.origin,
  { xIn: 15.41, yIn: 24 },
);

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

const boundedWitnessOptions = {
  sideKey: "player1",
  deployments,
  movementActionTypes: ["advance"],
  maximumDepth: 2,
  maximumLabels: 16,
  maximumUniqueStates: 16,
  maximumGroupsPerExpansion: 1,
  maximumCandidatesPerExpansion: 1,
};
let interruptedActivationCheckpoint = null;
assert.throws(() => reverseWarmachineActivationSequenceV2(
  boundedWitnessSuccessor,
  {
    ...boundedWitnessOptions,
    onCheckpoint: (event) => {
      if (event.stage !== "activation_label_expanded") return;
      interruptedActivationCheckpoint = event.checkpoint;
      throw new Error("focused_activation_checkpoint_interrupt");
    },
  },
), /focused_activation_checkpoint_interrupt/);
assert.ok(interruptedActivationCheckpoint);
assert.ok(interruptedActivationCheckpoint.searchSourceClosureHash);
assert.equal(interruptedActivationCheckpoint.expandedLabelCount, 1);
assert.equal(interruptedActivationCheckpoint.queue.length > 0, true);
const interruptedActivationAudit =
  auditWarmachineActivationSequenceResumeCheckpointV1(
    interruptedActivationCheckpoint,
    {
      rootStateHash: interruptedActivationCheckpoint.rootStateHash,
      sideKey: "player1",
      rawOptions: boundedWitnessOptions,
    },
  );
assert.equal(interruptedActivationAudit.ok, true,
  JSON.stringify(interruptedActivationAudit));
const activationSourceDriftAudit =
  auditWarmachineActivationSequenceResumeCheckpointV1(
    {
      ...interruptedActivationCheckpoint,
      searchSourceClosureHash: "stale-activation-source",
    },
    {
      rootStateHash: interruptedActivationCheckpoint.rootStateHash,
      sideKey: "player1",
      rawOptions: boundedWitnessOptions,
    },
  );
assert.equal(activationSourceDriftAudit.ok, false);
assert.ok(activationSourceDriftAudit.issues.includes(
  "activation_resume_checkpoint_source_drift",
));
const resumedBoundedWitness = reverseWarmachineActivationSequenceV2(
  boundedWitnessSuccessor,
  {
    ...boundedWitnessOptions,
    resumeCheckpoint: interruptedActivationCheckpoint,
  },
);
assert.equal(resumedBoundedWitness.resumeCheckpointAccepted, true);
assert.equal(resumedBoundedWitness.reportHash, boundedWitness.reportHash);
assert.deepEqual(resumedBoundedWitness.boundaries, boundedWitness.boundaries);
const tamperedActivationCheckpoint = structuredClone(
  interruptedActivationCheckpoint,
);
tamperedActivationCheckpoint.checkpointHash = "tampered";
assert.throws(() => reverseWarmachineActivationSequenceV2(
  boundedWitnessSuccessor,
  {
    ...boundedWitnessOptions,
    resumeCheckpoint: tamperedActivationCheckpoint,
  },
), /activation_resume_checkpoint_rejected/);

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

const unitMovementSuccessor = structuredClone(unitPassSuccessor);
unitMovementSuccessor.stateKey = "unit-movement-successor";
unitMovementSuccessor.pieces = unitMovementSuccessor.pieces.map((row) => {
  if (row.unitGroupId !== "unit-pass-group") return row;
  return {
    ...row,
    position: {
      xIn: row.position.xIn + 2,
      yIn: row.position.yIn,
    },
  };
});
const unitMovementReverse = generateWarmachineMovementActivationPredecessorsV1(
  unitMovementSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["unit-a", "unit-b", "unit-c"],
    actionTypes: ["advance"],
    deployments,
    rejectedAuditLimit: 16,
  },
);
assert.equal(unitMovementReverse.ok, true, JSON.stringify(unitMovementReverse));
assert.ok(unitMovementReverse.strictCandidateCount >= 3);
assert.equal(new Set(unitMovementReverse.candidates.map((row) =>
  row.actorPieceKey)).size, 1,
"Only the model whose advance path does not cross another trooper's old base can be the selected unit mover");
assert.equal(unitMovementReverse.strictRejectedCount, 2,
  JSON.stringify(unitMovementReverse.rejected, null, 2));
assert.deepEqual(
  [...new Set(unitMovementReverse.rejected.map((row) => row.actorPieceKey))]
    .sort(),
  ["unit-a", "unit-b"],
  "The two anchors whose selected-model paths cross old sibling bases remain auditable strict rejects",
);
assert.equal(unitMovementReverse.unresolvedCount, 0);
const unitMovementCandidate = unitMovementReverse.candidates.find((row) =>
  row.actorPieceKey === "unit-c");
assert.ok(unitMovementCandidate, JSON.stringify(unitMovementReverse.publicCandidates));
assert.equal(unitMovementCandidate.movementProposal.actionType, "advance");
const seededUnitMovementReverse =
  generateWarmachineMovementActivationPredecessorsV1(
    unitMovementSuccessor,
    {
      sideKey: "player1",
      actorPieceKeys: ["unit-a", "unit-b", "unit-c"],
      actionTypes: ["advance"],
      deployments,
      originProposals: [
        {
          ...unitMovementCandidate.movementProposal,
          actorPieceKey: "foreign-unit-actor",
          proposalKey: "foreign-unit-seed",
          proposalPriority: -200,
        },
        {
          ...unitMovementCandidate.movementProposal,
          actorPieceKey: "unit-c",
          proposalKey: "bound-unit-seed",
          proposalSource: "focused_bound_unit_seed",
          proposalPriority: -100,
        },
      ],
      maximumUnitMovementAnchorsPerGroup: 3,
      maximumStrictCandidates: 1,
      maximumStrictCandidateAttempts: 1,
    },
  );
assert.equal(seededUnitMovementReverse.strictCandidateCount, 1,
  JSON.stringify(seededUnitMovementReverse, null, 2));
assert.equal(
  seededUnitMovementReverse.candidates[0].predecessorStateHash,
  unitMovementCandidate.predecessorStateHash,
);
assert.equal(
  seededUnitMovementReverse.candidates[0].movementProposal.proposalKey
    .startsWith("bound-unit-seed:"),
  true,
);
assert.equal(seededUnitMovementReverse.publicCandidates.some((row) =>
  row.movementProposal.proposalKey === "foreign-unit-seed"), false);

const explicitAnchorSuccessor = structuredClone(unitMovementSuccessor);
explicitAnchorSuccessor.stateKey = "unit-movement-explicit-anchor-successor";
explicitAnchorSuccessor.pieces = explicitAnchorSuccessor.pieces.map((row) => {
  if (row.pieceKey === "unit-a") {
    return { ...row, position: { xIn: 20, yIn: 22 } };
  }
  if (row.pieceKey === "unit-b") {
    return { ...row, position: { xIn: 20, yIn: 24 } };
  }
  if (row.pieceKey === "unit-c") {
    return { ...row, position: { xIn: 20, yIn: 26 } };
  }
  return row;
});
const explicitAnchorSeedSource =
  generateWarmachineMovementActivationPredecessorsV1(
    explicitAnchorSuccessor,
    {
      sideKey: "player1",
      actorPieceKeys: ["unit-b"],
      actionTypes: ["advance"],
      deployments,
      maximumStrictCandidates: 1,
      maximumStrictCandidateAttempts: 8,
    },
  );
assert.equal(explicitAnchorSeedSource.strictCandidateCount, 1,
  JSON.stringify(explicitAnchorSeedSource, null, 2));
const explicitAnchorSeed = explicitAnchorSeedSource.candidates[0].movementProposal;
const explicitAnchorBudgetOne =
  generateWarmachineMovementActivationPredecessorsV1(
    explicitAnchorSuccessor,
    {
      sideKey: "player1",
      actorPieceKeys: ["unit-a", "unit-b", "unit-c"],
      actionTypes: ["advance"],
      deployments,
      originProposals: [{
        ...explicitAnchorSeed,
        actorPieceKey: "unit-b",
        proposalKey: "explicit-unit-b-anchor-seed",
        proposalPriority: -100,
      }],
      maximumUnitMovementAnchorsPerGroup: 1,
      maximumStrictCandidates: 1,
      maximumStrictCandidateAttempts: 8,
    },
  );
assert.equal(explicitAnchorBudgetOne.strictCandidateCount, 1,
  JSON.stringify(explicitAnchorBudgetOne, null, 2));
assert.equal(explicitAnchorBudgetOne.candidates[0].actorPieceKey, "unit-b");
assert.equal(
  explicitAnchorBudgetOne.candidates[0].movementProposal.proposalKey
    .startsWith("explicit-unit-b-anchor-seed:"),
  true,
);
assert.ok(explicitAnchorBudgetOne.unresolved.some((row) =>
  row.reason === "unit_movement_anchor_budget_deferred" &&
  row.actorPieceKey === "unit-a"));
assert.deepEqual(unitMovementCandidate.activationGroupPieceKeys,
  ["unit-a", "unit-b", "unit-c"]);
assert.equal(unitMovementCandidate.activationGroupId, "unit-pass-group");
assert.equal(unitMovementCandidate.predecessorState.pieces.filter((row) =>
  row.unitGroupId === "unit-pass-group").every((row) => row.activated === false), true);
assert.equal(unitMovementCandidate.movementProposal.pathsByModel.length, 3);
assert.equal(unitMovementCandidate.movementProposal.pathsByModel.every((row) =>
  row.waypoints.length === 1), true);
const unitMovementReplay = replayWarmachineTerminalReverseRouteV1({
  candidateKey: unitMovementCandidate.candidateKey,
  predecessorState: unitMovementCandidate.predecessorState,
  reverseEdges: [unitMovementCandidate],
}, enumerateWarmachineBenchmarkActionsV2(unitMovementSuccessor).state, {
  routeKey: "verify-unit-movement-predecessor",
});
assert.equal(unitMovementReplay.ok, true, JSON.stringify(unitMovementReplay));
assert.equal(unitMovementReplay.fullRouteStrictReplayCertified, true);

const siblingDetourSuccessor = structuredClone(unitPassSuccessor);
siblingDetourSuccessor.stateKey = "unit-movement-sibling-detour-successor";
siblingDetourSuccessor.pieces = [
  {
    ...piece("detour-unit-a", "player1", { xIn: 7.25, yIn: 31.79 }, true),
    modelRole: "trooper",
    unitGroupId: "detour-unit",
  },
  {
    ...piece("detour-unit-b", "player1", { xIn: 9.56, yIn: 30.46 }, true),
    modelRole: "trooper",
    unitGroupId: "detour-unit",
  },
  {
    ...piece("detour-unit-c", "player1", { xIn: 9.56, yIn: 33.12 }, true),
    modelRole: "trooper",
    unitGroupId: "detour-unit",
  },
  piece("detour-unit-enemy", "player2", { xIn: 40, yIn: 34 }, false),
];
const siblingDetour = generateWarmachineMovementActivationPredecessorsV1(
  siblingDetourSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["detour-unit-a"],
    actionTypes: ["run"],
    deployments,
    originProposals: [{
      proposalKey: "detour-around-sibling-seed",
      actorPieceKey: "detour-unit-a",
      actionType: "run",
      origin: { xIn: 4.1, yIn: 37.6 },
      originsByPieceKey: {
        "detour-unit-a": { xIn: 4.1, yIn: 37.6 },
        "detour-unit-b": { xIn: 5.35, yIn: 37.6 },
        "detour-unit-c": { xIn: 4.1, yIn: 38.85 },
      },
      destinationsByPieceKey: {
        "detour-unit-a": { xIn: 7.25, yIn: 31.79 },
        "detour-unit-b": { xIn: 9.56, yIn: 30.46 },
        "detour-unit-c": { xIn: 9.56, yIn: 33.12 },
      },
      proposalSource: "focused_unit_sibling_detour",
      proposalPriority: -100,
      relationKind: "unit_group_deployment_reformation",
    }],
    maximumUnitMovementAnchorsPerGroup: 1,
    maximumStrictCandidates: 1,
    maximumStrictCandidateAttempts: 8,
    rejectedAuditLimit: 16,
  },
);
assert.equal(siblingDetour.strictCandidateCount, 1,
  JSON.stringify(siblingDetour, null, 2));
const siblingDetourCandidate = siblingDetour.candidates[0];
const siblingDetourActorPath = siblingDetourCandidate.movementProposal
  .pathsByModel.find((row) => row.pieceKey === "detour-unit-a");
assert.equal(siblingDetourCandidate.movementProposal.proposalSource,
  "host_per_model_auto_routed_reverse_path_v1");
assert.equal(siblingDetourActorPath.waypoints.length > 1, true);
const siblingDetourReplay = replayWarmachineTerminalReverseRouteV1({
  candidateKey: siblingDetourCandidate.candidateKey,
  predecessorState: siblingDetourCandidate.predecessorState,
  reverseEdges: [siblingDetourCandidate],
}, enumerateWarmachineBenchmarkActionsV2(siblingDetourSuccessor).state, {
  routeKey: "verify-unit-movement-sibling-detour",
});
assert.equal(siblingDetourReplay.ok, true, JSON.stringify(siblingDetourReplay));

const archivedDirectSiblingEdge = structuredClone(siblingDetourCandidate);
archivedDirectSiblingEdge.movementProposal.waypoints = [
  archivedDirectSiblingEdge.movementProposal
    .destinationsByPieceKey[archivedDirectSiblingEdge.actorPieceKey],
];
archivedDirectSiblingEdge.movementProposal.pathsByModel =
  archivedDirectSiblingEdge.movementProposal.pathsByModel.map((row) =>
    row.pieceKey === archivedDirectSiblingEdge.actorPieceKey
      ? {
        ...row,
        waypoints: archivedDirectSiblingEdge.movementProposal.waypoints,
      }
      : row);
archivedDirectSiblingEdge.movementProposal.proposalSource =
  "archived_direct_path_witness";
delete archivedDirectSiblingEdge.movementProposal.hostPathProposal;
const archivedDirectReplay = replayWarmachineTerminalReverseRouteV1({
  candidateKey: "archived-direct-sibling-route",
  predecessorState: archivedDirectSiblingEdge.predecessorState,
  reverseEdges: [archivedDirectSiblingEdge],
}, enumerateWarmachineBenchmarkActionsV2(siblingDetourSuccessor).state, {
  routeKey: "verify-archived-direct-sibling-replay-rejected",
});
assert.equal(archivedDirectReplay.ok, false);
const repairedSiblingReissue = reissueWarmachineTerminalReverseRouteV1({
  candidateKey: "archived-direct-sibling-route",
  predecessorState: archivedDirectSiblingEdge.predecessorState,
  reverseEdges: [archivedDirectSiblingEdge],
}, enumerateWarmachineBenchmarkActionsV2(siblingDetourSuccessor).state, {
  routeKey: "verify-archived-direct-sibling-reissue",
  repairBlockedMovementPathWitness: true,
  requireSourceSuccessorStateHash: true,
});
assert.equal(repairedSiblingReissue.ok, true,
  JSON.stringify(repairedSiblingReissue.failures, null, 2));
assert.equal(repairedSiblingReissue.steps[0].movementPathWitnessRepaired, true);
assert.equal(repairedSiblingReissue.steps[0].sourceSuccessorMatched, true);
assert.equal(repairedSiblingReissue.reissuedRoute.reverseEdges[0]
  .movementProposal.witnessRepair.kind,
"blocked_movement_path_current_host_reproposal");
const repairedSiblingIndependentReplay =
  replayWarmachineTerminalReverseRouteV1(
    repairedSiblingReissue.reissuedRoute,
    enumerateWarmachineBenchmarkActionsV2(siblingDetourSuccessor).state,
    { routeKey: "verify-repaired-sibling-independent-replay" },
  );
assert.equal(repairedSiblingIndependentReplay.ok, true,
  JSON.stringify(repairedSiblingIndependentReplay.failures, null, 2));
const mismatchedSourceEdge = structuredClone(archivedDirectSiblingEdge);
mismatchedSourceEdge.successorStateHash = "not-the-real-successor-hash";
const mismatchedSourceReissue = reissueWarmachineTerminalReverseRouteV1({
  candidateKey: "archived-direct-sibling-source-mismatch",
  predecessorState: mismatchedSourceEdge.predecessorState,
  reverseEdges: [mismatchedSourceEdge],
}, enumerateWarmachineBenchmarkActionsV2(siblingDetourSuccessor).state, {
  routeKey: "verify-archived-direct-source-mismatch",
  repairBlockedMovementPathWitness: true,
  requireSourceSuccessorStateHash: true,
});
assert.equal(mismatchedSourceReissue.ok, false);
assert.equal(mismatchedSourceReissue.failures[0].reason,
  "current_host_route_reissue_source_successor_state_mismatch");

const alternateAnchorSuccessor = structuredClone(unitPassSuccessor);
alternateAnchorSuccessor.stateKey = "unit-movement-alternate-anchor-successor";
alternateAnchorSuccessor.pieces = [
  {
    ...piece("anchor-unit-a", "player1", { xIn: 7.25, yIn: 20.79 }, true),
    modelRole: "trooper",
    unitGroupId: "anchor-unit",
  },
  {
    ...piece("anchor-unit-b", "player1", { xIn: 9.56, yIn: 19.46 }, true),
    modelRole: "trooper",
    unitGroupId: "anchor-unit",
  },
  {
    ...piece("anchor-unit-c", "player1", { xIn: 9.56, yIn: 22.12 }, true),
    modelRole: "trooper",
    unitGroupId: "anchor-unit",
  },
  piece("anchor-unit-enemy", "player2", { xIn: 40, yIn: 34 }, false),
];
const alternateAnchorReverse = generateWarmachineMovementActivationPredecessorsV1(
  alternateAnchorSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["anchor-unit-a"],
    actionTypes: ["run"],
    deployments,
    originProposals: [{
      proposalKey: "alternate-anchor-source-seed",
      actorPieceKey: "anchor-unit-a",
      actionType: "run",
      origin: { xIn: 7.25, yIn: 31.79 },
      originsByPieceKey: {
        "anchor-unit-a": { xIn: 7.25, yIn: 31.79 },
        "anchor-unit-b": { xIn: 9.56, yIn: 30.46 },
        "anchor-unit-c": { xIn: 9.56, yIn: 33.12 },
      },
      destinationsByPieceKey: {
        "anchor-unit-a": { xIn: 7.25, yIn: 20.79 },
        "anchor-unit-b": { xIn: 9.56, yIn: 19.46 },
        "anchor-unit-c": { xIn: 9.56, yIn: 22.12 },
      },
      proposalSource: "focused_unit_alternate_anchor",
      proposalPriority: -100,
      relationKind: "unit_group_translation:earlier_turn_progress_toward_deployment",
    }],
    maximumUnitMovementAnchorsPerGroup: 1,
    maximumStrictCandidates: 1,
    maximumStrictCandidateAttempts: 8,
  },
);
assert.equal(alternateAnchorReverse.strictCandidateCount, 1,
  JSON.stringify(alternateAnchorReverse, null, 2));
const archivedBlockedAnchorEdge = structuredClone(
  alternateAnchorReverse.candidates[0],
);
const blockedAnchorPieceKey = "anchor-unit-c";
const blockedAnchorActionKey = archivedBlockedAnchorEdge.strictReplaySteps[0]
  .actionKey.replace(/^[^:]+:/, `${blockedAnchorPieceKey}:`);
archivedBlockedAnchorEdge.actorPieceKey = blockedAnchorPieceKey;
archivedBlockedAnchorEdge.transitionActionKey = blockedAnchorActionKey;
archivedBlockedAnchorEdge.strictReplaySteps[0].actorPieceKey =
  blockedAnchorPieceKey;
archivedBlockedAnchorEdge.strictReplaySteps[0].actionKey =
  blockedAnchorActionKey;
archivedBlockedAnchorEdge.movementProposal.actorPieceKey =
  blockedAnchorPieceKey;
archivedBlockedAnchorEdge.movementProposal.waypoints = [{ xIn: 9.56, yIn: 22.12 }];
archivedBlockedAnchorEdge.movementProposal.pathsByModel =
  archivedBlockedAnchorEdge.movementProposal.pathsByModel.map((row) =>
    row.pieceKey === blockedAnchorPieceKey
      ? { ...row, waypoints: archivedBlockedAnchorEdge.movementProposal.waypoints }
      : row);
archivedBlockedAnchorEdge.movementProposal.proposalSource =
  "archived_blocked_unit_anchor";
delete archivedBlockedAnchorEdge.movementProposal.hostPathProposal;
const archivedBlockedAnchorReplay = replayWarmachineTerminalReverseRouteV1({
  candidateKey: "archived-blocked-unit-anchor-route",
  predecessorState: archivedBlockedAnchorEdge.predecessorState,
  reverseEdges: [archivedBlockedAnchorEdge],
}, enumerateWarmachineBenchmarkActionsV2(alternateAnchorSuccessor).state, {
  routeKey: "verify-archived-blocked-unit-anchor-rejected",
});
assert.equal(archivedBlockedAnchorReplay.ok, false);
const alternateAnchorReissue = reissueWarmachineTerminalReverseRouteV1({
  candidateKey: "archived-blocked-unit-anchor-route",
  predecessorState: archivedBlockedAnchorEdge.predecessorState,
  reverseEdges: [archivedBlockedAnchorEdge],
}, enumerateWarmachineBenchmarkActionsV2(alternateAnchorSuccessor).state, {
  routeKey: "verify-archived-blocked-unit-anchor-reissue",
  repairBlockedMovementPathWitness: true,
  repairBlockedUnitMovementAnchorWitness: true,
  requireSourceSuccessorStateHash: true,
});
assert.equal(alternateAnchorReissue.ok, true,
  JSON.stringify(alternateAnchorReissue.failures, null, 2));
assert.notEqual(alternateAnchorReissue.reissuedRoute.reverseEdges[0]
  .actorPieceKey, blockedAnchorPieceKey);
assert.equal(alternateAnchorReissue.steps[0].sourceSuccessorMatched, true);
assert.equal(alternateAnchorReissue.reissuedRoute.reverseEdges[0]
  .movementProposal.witnessRepair.kind,
"blocked_unit_movement_anchor_current_host_reproposal");
const alternateAnchorIndependentReplay = replayWarmachineTerminalReverseRouteV1(
  alternateAnchorReissue.reissuedRoute,
  enumerateWarmachineBenchmarkActionsV2(alternateAnchorSuccessor).state,
  { routeKey: "verify-alternate-unit-anchor-independent-replay" },
);
assert.equal(alternateAnchorIndependentReplay.ok, true,
  JSON.stringify(alternateAnchorIndependentReplay.failures, null, 2));

const unitRunReverse = generateWarmachineMovementActivationPredecessorsV1(
  unitMovementSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["unit-a", "unit-b", "unit-c"],
    actionTypes: ["run"],
    deployments,
    rejectedAuditLimit: 16,
  },
);
assert.equal(unitRunReverse.ok, true, JSON.stringify(unitRunReverse));
assert.ok(unitRunReverse.strictCandidateCount >= 1,
  JSON.stringify(unitRunReverse.publicCandidates, null, 2));
assert.equal(new Set(unitRunReverse.candidates.map((row) =>
  row.actorPieceKey)).size, 3,
"Run allowance admits detours for the two anchors whose direct paths cross sibling bases");
assert.equal(unitRunReverse.strictRejectedCount, 2,
  JSON.stringify(unitRunReverse.rejected, null, 2));
assert.deepEqual(
  [...new Set(unitRunReverse.rejected.map((row) => row.actorPieceKey))]
    .sort(),
  ["unit-a", "unit-b"],
);
assert.equal(unitRunReverse.unresolvedCount, 0);
assert.equal(unitRunReverse.candidates.every((row) =>
  row.transitionActionKey.includes(":run-unit-path:")), true);
assert.equal(unitRunReverse.candidates.every((row) =>
  row.strictMovementAllowanceIn === 11), true);
assert.equal(unitRunReverse.publicCandidates.every((row) =>
  row.movementProposal.actionType === "run"), true);

const blockedUnitMovementSuccessor = structuredClone(unitMovementSuccessor);
blockedUnitMovementSuccessor.stateKey = "unit-movement-successor-blocked-origin";
blockedUnitMovementSuccessor.pieces.push(
  piece("unit-origin-blocker", "player2", { xIn: 15.41, yIn: 22 }, false),
);
const blockedUnitMovement = generateWarmachineMovementActivationPredecessorsV1(
  blockedUnitMovementSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["unit-a", "unit-b", "unit-c"],
    actionTypes: ["advance"],
    deployments,
    maximumUnitMovementAnchorsPerGroup: 1,
    maximumDeploymentSlotOrigins: 1,
    rejectedAuditLimit: 16,
  },
);
assert.ok(blockedUnitMovement.strictCandidateCount >= 1);
assert.ok(blockedUnitMovement.strictRejectedCount >= 1);
assert.ok(blockedUnitMovement.rejected.some((row) =>
  row.reason === "reverse_movement_predecessor_origin_geometry_rejected"));
assert.equal(blockedUnitMovement.unresolved.filter((row) =>
  row.reason === "unit_movement_anchor_budget_deferred").length, 2);

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

const attemptBoundedBlocked = generateWarmachineMovementActivationPredecessorsV1(
  blockedSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["mover"],
    actionTypes: ["advance"],
    deployments,
    maximumStrictCandidateAttempts: 1,
  },
);
assert.equal(attemptBoundedBlocked.strictCandidateAttemptCount, 1);
assert.equal(attemptBoundedBlocked.strictCandidateCount, 0);

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
  breadthFirstPreferredBoundaryOrigin:
    breadthFirstBoundaryOrderWitness.runtimeBoundaries[0].reverseEdges[0]
      .movementProposal.origin,
  boundedWitnessDeferredBranchCount: boundedWitness.unresolved.filter((row) =>
    /budget_deferred/.test(row.reason)).length,
  directRunOrigin: directRunMover.position,
  invalidPathWitnessRejected: invalidPathRun.rejected.some((row) =>
    row.reason === "reverse_movement_path_witness_invalid"),
  alternateDeploymentSlotCandidateCount:
    alternateDirectRun.strictCandidateCount,
  shedFuryRunStrictActionTypes: shedFuryRunCandidate.strictReplaySteps.map((step) =>
    step.actionType),
  maximumRunStepOrigin: maximumRunStepMover.position,
  runAllowanceIn: maximumRunStepCandidate.strictMovementAllowanceIn,
  forcedWarbeastRunPredecessorFury:
    forcedWarbeastRunCandidate.preActivationResourcePoints,
  forcedWarbeastRunSuccessorFury: forcedWarbeast.fury,
  forcedWarjackRunPredecessorFocus:
    forcedWarjackRun.candidates[0].preActivationResourcePoints,
  forcedWarjackRunSuccessorFocus: forcedWarjack.focus,
  boundedMovementStrictCandidateCount:
    boundedMaximumRunStep.strictCandidateCount,
  boundedMovementBudgetCutoffReached:
    boundedMaximumRunStep.strictCandidateBudgetCutoffReached,
  hostDetourStrictCandidateCount: blockedStraightRun.strictCandidateCount,
  hostDetourWaypointCount: detourCandidate.movementProposal.waypoints.length,
  hostDetourIndependentReplay: detourReplay.fullRouteStrictReplayCertified,
  equivalentPathStrictCandidateCount:
    equivalentPathBudget.strictCandidateCount,
  equivalentPathWitnessDeferredCount:
    equivalentPathBudget.equivalentPathWitnessDeferredCount,
  occupiedDeploymentAlternateSlotOrigin: alternateSlotOrigin,
  occupiedDeploymentStrictCandidateCount: occupiedDeploymentRun.strictCandidateCount,
  occupiedDeploymentRejectedCount: occupiedDeploymentRun.strictRejectedCount,
  unitMovementStrictCandidateCount: unitMovementReverse.strictCandidateCount,
  unitMovementActivationGroupPieceCount:
    unitMovementCandidate.activationGroupPieceKeys.length,
  unitMovementIndependentReplay: unitMovementReplay.fullRouteStrictReplayCertified,
  archivedDirectSiblingReplayRejected: archivedDirectReplay.ok === false,
  archivedSiblingPathReissueCertified: repairedSiblingReissue.ok,
  archivedSiblingPathIndependentReplay:
    repairedSiblingIndependentReplay.ok,
  archivedSiblingSourceMismatchRejected:
    mismatchedSourceReissue.ok === false,
  archivedBlockedUnitAnchorReplayRejected:
    archivedBlockedAnchorReplay.ok === false,
  alternateUnitAnchorReissueCertified: alternateAnchorReissue.ok,
  alternateUnitAnchorIndependentReplay:
    alternateAnchorIndependentReplay.ok,
  unitRunStrictCandidateCount: unitRunReverse.strictCandidateCount,
  unitRunAllowanceIn: unitRunReverse.candidates[0].strictMovementAllowanceIn,
  blockedUnitMovementRejectedCount: blockedUnitMovement.strictRejectedCount,
  blockedStrictCandidateCount: blocked.strictCandidateCount,
  blockedRejectedCount: blocked.strictRejectedCount,
  attemptBoundedBlockedAttemptCount:
    attemptBoundedBlocked.strictCandidateAttemptCount,
  attemptBoundedMovementBudgetCutoffReached:
    attemptBoundedMaximumRunStep.strictCandidateAttemptBudgetCutoffReached,
  reportHash: reverse.reportHash,
}, null, 2));
