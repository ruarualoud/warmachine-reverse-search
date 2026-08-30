import assert from "node:assert/strict";

import {
  auditWarmachineReverseStateBoundaryV1,
} from "../src/reverse/reverse-state-invariants-v1.mjs";
import { generateWarmachineMovementActivationPredecessorsV1 } from
  "../src/reverse/movement-activation-predecessor-v1.mjs";
import { replayWarmachineTerminalReverseRouteV1 } from
  "../src/reverse/replay-terminal-reverse-route-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";
import {
  generateWarmachinePassActivationPredecessorsV1,
  reverseWarmachinePassActivationSequenceV1,
} from
  "../src/reverse/pass-activation-predecessor-v1.mjs";
import { generateWarmachineControlPhasePredecessorsV1 } from
  "../src/reverse/control-phase-predecessor-v1.mjs";
import { generateWarmachinePreviousTurnEndPredecessorsV1 } from
  "../src/reverse/previous-turn-end-predecessor-v1.mjs";
import { reverseWarmachineActivationSequenceV2 } from
  "../src/reverse/activation-sequence-predecessor-v2.mjs";
import { replayWarmachineMaterializedTerminalActivationV1 } from
  "../src/reverse/materialized-terminal-root-to-deployment-v1.mjs";
import { replayWarmachineTerminalRouteStrictV2 } from
  "../src/reverse/strict-route-witness-v2.mjs";
import { searchWarmachineTerminalRootedOpponentTurnV1 } from
  "../src/reverse/terminal-rooted-worklist-v1.mjs";
import { generateWarmachineUnitDeploymentFormationPredecessorsV1 } from
  "../src/reverse/unit-deployment-formation-predecessor-v1.mjs";

function piece(pieceKey, position, raw = {}) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey: "player1",
    modelRole: raw.unitGroupId ? "trooper" : "solo",
    modelType: "warrior model",
    position,
    baseSizeIn: 1.18,
    speedIn: 6,
    damage: { boxesRemaining: 5, maxBoxes: 5 },
    statusTags: [],
    attackProfiles: [],
    activated: false,
    ...raw,
  };
}

function state(pieces = []) {
  return {
    stateKey: "reverse-state-invariant-fixture",
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 2,
    strictMode: true,
    enforceStrictExecutor: true,
    board: { widthIn: 48, heightIn: 48 },
    pieces,
    terrain: [{
      terrainKey: "south_wall",
      type: "obstacle",
      xIn: 24,
      yIn: 36,
      widthIn: 10,
      heightIn: 2,
      blocksMovement: true,
      blocksLos: true,
    }],
    scenario: {
      zones: [],
      flags: [],
      objectives: [],
      score: { player1: 0, player2: 0 },
      scoringHistory: [],
    },
  };
}

const legal = auditWarmachineReverseStateBoundaryV1(state([
  piece("legal-a", { xIn: 10, yIn: 10 }, { unitGroupId: "legal-unit" }),
  piece("legal-b", { xIn: 11.3, yIn: 10 }, { unitGroupId: "legal-unit" }),
]));
assert.equal(legal.ok, true, JSON.stringify(legal));
assert.equal(legal.hostStaticPlacementAudit.ok, true);
assert.equal(legal.hostStaticUnitFormationAudit.ok, true);

const terrainOverlap = auditWarmachineReverseStateBoundaryV1(state([
  piece("terrain-overlap", { xIn: 19.2, yIn: 36 }),
]));
assert.equal(terrainOverlap.ok, false);
assert.equal(terrainOverlap.issues.some((issue) =>
  issue.code === "STATIC_PLACEMENT_BASE_OVERLAPS_BLOCKING_TERRAIN_V1"), true);

const disconnectedUnit = auditWarmachineReverseStateBoundaryV1(state([
  piece("unit-a", { xIn: 10, yIn: 10 }, { unitGroupId: "broken-unit" }),
  piece("unit-b", { xIn: 30, yIn: 30 }, { unitGroupId: "broken-unit" }),
]));
assert.equal(disconnectedUnit.ok, true);
assert.equal(disconnectedUnit.hostStaticPlacementAudit.ok, true);
assert.equal(disconnectedUnit.hostStaticUnitFormationAudit.skipped, true);
const disconnectedDeploymentFormation =
  auditWarmachineReverseStateBoundaryV1(state([
    piece("unit-a", { xIn: 10, yIn: 10 }, { unitGroupId: "broken-unit" }),
    piece("unit-b", { xIn: 30, yIn: 30 }, { unitGroupId: "broken-unit" }),
  ]), {
    boundaryKind: "test_deployment_formation",
    requireStaticUnitFormation: true,
  });
assert.equal(disconnectedDeploymentFormation.ok, false);
assert.equal(
  disconnectedDeploymentFormation.hostStaticUnitFormationAudit.ok,
  false,
);

const duplicatePieceKey = auditWarmachineReverseStateBoundaryV1(state([
  piece("duplicate", { xIn: 8, yIn: 8 }),
  piece("duplicate", { xIn: 12, yIn: 8 }),
]));
assert.equal(duplicatePieceKey.ok, false);
assert.equal(duplicatePieceKey.issues.some((issue) =>
  issue.code === "REVERSE_STATE_DUPLICATE_PIECE_KEY_V1"), true);

const negativeResource = auditWarmachineReverseStateBoundaryV1(state([
  piece("negative-focus", { xIn: 8, yIn: 8 }, {
    resourceKind: "focus",
    resourcePoints: -1,
    resource2: -1,
    focus: -1,
  }),
]));
assert.equal(negativeResource.ok, false);
assert.equal(negativeResource.issues.some((issue) =>
  issue.code === "REVERSE_STATE_NEGATIVE_RESOURCE_V1"), true);

const impossibleScoringHistoryState = state([
  piece("score-audit", { xIn: 8, yIn: 8 }),
]);
impossibleScoringHistoryState.scenario.scoringHistory = [{
  key: "impossible-score-row",
  sideKey: "player1",
  points: 1,
  round: 2,
  scoringWindow: "turn_end:player1",
}];
const impossibleScoringHistory = auditWarmachineReverseStateBoundaryV1(
  impossibleScoringHistoryState,
);
assert.equal(impossibleScoringHistory.ok, false);
assert.equal(impossibleScoringHistory.issues.some((issue) =>
  issue.code === "REVERSE_STATE_SCORING_HISTORY_EXCEEDS_SCORE_V1"), true);

let deliberatelyRejectedFormationCount = 0;
const postValidationCappedFormations =
  generateWarmachineUnitDeploymentFormationPredecessorsV1({
    members: [
      piece("formation-a", { xIn: 20, yIn: 20 }, {
        unitGroupId: "formation-unit",
      }),
      piece("formation-b", { xIn: 21.3, yIn: 20 }, {
        unitGroupId: "formation-unit",
      }),
      piece("formation-c", { xIn: 22.6, yIn: 20 }, {
        unitGroupId: "formation-unit",
      }),
    ],
    deploymentZone: { x: 8, y: 24, width: 16, height: 36 },
    actionType: "run",
    maximumCandidates: 2,
    validateCandidate: () => {
      if (deliberatelyRejectedFormationCount < 20) {
        deliberatelyRejectedFormationCount += 1;
        return {
          ok: false,
          auditHash: `deliberate-reject-${deliberatelyRejectedFormationCount}`,
          issueCodes: ["DELIBERATE_PRE_CAP_VALIDATION_REJECT_V1"],
        };
      }
      return { ok: true, auditHash: "deliberate-accept", issueCodes: [] };
    },
  });
assert.equal(postValidationCappedFormations.candidateCount, 2,
  JSON.stringify(postValidationCappedFormations));
assert.equal(postValidationCappedFormations.candidateValidationRejectedCount,
  20);
assert.equal(postValidationCappedFormations.testedAssignmentCount > 20, true);

const movementSuccessor = state([
  piece("mover", { xIn: 12, yIn: 10 }, { activated: true }),
  piece("unrelated", { xIn: 40, yIn: 40 }),
]);
movementSuccessor.stateKey = "reverse-state-invariant-movement-successor";
const legalMovement = generateWarmachineMovementActivationPredecessorsV1(
  movementSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["mover"],
    actionTypes: ["advance"],
    originProposals: [{
      actorPieceKey: "mover",
      actionType: "advance",
      origin: { xIn: 8, yIn: 10 },
      waypoints: [{ xIn: 12, yIn: 10 }],
      proposalKey: "invariant-gate-movement",
    }],
    maximumStrictCandidates: 1,
  },
);
assert.equal(legalMovement.ok, true, JSON.stringify(legalMovement));
const legalMovementCandidate = legalMovement.candidates[0];
assert.ok(legalMovementCandidate);

const invalidSuccessor = structuredClone(movementSuccessor);
invalidSuccessor.pieces.find((row) => row.pieceKey === "unrelated").position = {
  xIn: 19.2,
  yIn: 36,
};
const invalidMovement = generateWarmachineMovementActivationPredecessorsV1(
  invalidSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["mover"],
    actionTypes: ["advance"],
    originProposals: [{
      actorPieceKey: "mover",
      actionType: "advance",
      origin: { xIn: 8, yIn: 10 },
      waypoints: [{ xIn: 12, yIn: 10 }],
      proposalKey: "invalid-unrelated-piece-movement",
    }],
    maximumStrictCandidates: 1,
  },
);
assert.equal(invalidMovement.strictCandidateCount, 0,
  JSON.stringify(invalidMovement.publicCandidates));
assert.equal(invalidMovement.rejected.some((row) =>
  row.reason === "reverse_predecessor_state_invariant_rejected"), true,
JSON.stringify(invalidMovement.rejected));

const invalidOpening = structuredClone(legalMovementCandidate.predecessorState);
invalidOpening.pieces.find((row) => row.pieceKey === "unrelated").position = {
  xIn: 19.2,
  yIn: 36,
};
const invalidReplayEdge = {
  ...legalMovementCandidate,
  predecessorStateHash: warmachineReverseStateSemanticHashV1(invalidOpening),
  successorStateHash: warmachineReverseStateSemanticHashV1(invalidSuccessor),
};
const invalidReplay = replayWarmachineTerminalReverseRouteV1({
  candidateKey: "invalid-intermediate-state-route",
  predecessorState: invalidOpening,
  reverseEdges: [invalidReplayEdge],
}, invalidSuccessor, {
  routeKey: "verify-invalid-intermediate-state-route",
});
assert.equal(invalidReplay.ok, false, JSON.stringify(invalidReplay));
assert.equal(invalidReplay.failures.some((failure) =>
  failure.reason === "full_route_replay_predecessor_state_invariant_rejected"), true,
JSON.stringify(invalidReplay.failures));

const invalidPass = generateWarmachinePassActivationPredecessorsV1(
  invalidSuccessor,
  { sideKey: "player1", actorPieceKeys: ["mover"] },
);
assert.equal(invalidPass.strictCandidateCount, 0);
assert.equal(invalidPass.rejected.some((row) =>
  row.reason === "reverse_predecessor_state_invariant_rejected"), true);

const invalidControl = generateWarmachineControlPhasePredecessorsV1(
  invalidSuccessor,
  { resourceEnvelopeModes: ["unchanged"] },
);
assert.equal(invalidControl.strictCandidateCount, 0);
assert.equal(invalidControl.rejected.some((row) =>
  row.reason === "reverse_predecessor_state_invariant_rejected"), true);

const invalidControlStart = structuredClone(invalidSuccessor);
invalidControlStart.phaseKey = "control";
invalidControlStart.controlPhaseStepKey = "maintenance";
invalidControlStart.turnNumber = 2;
const invalidPreviousTurn = generateWarmachinePreviousTurnEndPredecessorsV1(
  invalidControlStart,
  {
    nextSideActivationRestoreModes: ["all_alive_activated"],
    maintenanceResourcePreimageModes: ["preserve_cleanup_result"],
  },
);
assert.equal(invalidPreviousTurn.strictCandidateCount, 0);
assert.equal(invalidPreviousTurn.rejected.some((row) =>
  row.reason === "reverse_predecessor_state_invariant_rejected"), true);

const invalidBoundary = structuredClone(invalidSuccessor);
invalidBoundary.pieces.forEach((row) => { row.activated = false; });
const invalidPassSequence = reverseWarmachinePassActivationSequenceV1(
  invalidBoundary,
  { sideKey: "player1" },
);
assert.equal(invalidPassSequence.boundaryCount, 0);
assert.equal(invalidPassSequence.unresolved.some((row) =>
  row.reason === "reverse_predecessor_state_invariant_rejected"), true);
const invalidTerminalWorklist = searchWarmachineTerminalRootedOpponentTurnV1(
  invalidBoundary,
  {
    cellKey: "invalid-terminal-worklist-cell",
    goalType: "assassination",
    endingSideKey: "player1",
  },
);
assert.equal(invalidTerminalWorklist.routeCount, 0);
assert.equal(invalidTerminalWorklist.unresolved.some((row) =>
  row.reason === "reverse_predecessor_state_invariant_rejected"), true);
const invalidActivationSequence = reverseWarmachineActivationSequenceV2(
  invalidBoundary,
  {
    sideKey: "player1",
    includeMovement: false,
    includePass: true,
    maximumDepth: 1,
    maximumLabels: 4,
  },
);
assert.equal(invalidActivationSequence.boundaryRouteCount, 0);
assert.equal(invalidActivationSequence.rejected.some((row) =>
  row.reason === "reverse_predecessor_state_invariant_rejected"), true);

const invalidMaterializedReplay =
  replayWarmachineMaterializedTerminalActivationV1({
    predecessorState: invalidSuccessor,
    terminalState: invalidSuccessor,
    actionSequence: [],
  });
assert.equal(invalidMaterializedReplay.ok, false);
assert.equal(invalidMaterializedReplay.failures.some((row) =>
  row.reason === "materialized_terminal_predecessor_state_invariant_rejected"),
true);

const invalidStrictRoute = replayWarmachineTerminalRouteStrictV2(
  invalidSuccessor,
  [],
  { goalType: "assassination" },
);
assert.equal(invalidStrictRoute.strictWitness, false);
assert.equal(invalidStrictRoute.rejected?.reason,
  "strict_route_initial_state_invariant_rejected");

console.log(JSON.stringify({
  schemaVersion: "verify_reverse_state_invariants_v1",
  legalAuditHash: legal.auditHash,
  terrainOverlapIssueCount: terrainOverlap.issueCount,
  disconnectedStableStateIssueCount: disconnectedUnit.issueCount,
  disconnectedDeploymentFormationIssueCount:
    disconnectedDeploymentFormation.issueCount,
  duplicatePieceKeyIssueCount: duplicatePieceKey.issueCount,
  negativeResourceIssueCount: negativeResource.issueCount,
  impossibleScoringHistoryIssueCount: impossibleScoringHistory.issueCount,
  preCapFormationValidationRejectedCount:
    postValidationCappedFormations.candidateValidationRejectedCount,
  invalidMovementRejectedCount: invalidMovement.strictRejectedCount,
  invalidReplayFailureCount: invalidReplay.failures.length,
  inverseOperatorInvalidStateRejectCount: [
    invalidPass,
    invalidControl,
    invalidPreviousTurn,
    invalidPassSequence,
    invalidTerminalWorklist,
    invalidActivationSequence,
    invalidMaterializedReplay,
    invalidStrictRoute,
  ].length,
}, null, 2));
