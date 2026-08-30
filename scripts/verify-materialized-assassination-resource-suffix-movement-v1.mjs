#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  enumerateWarmachineControllerPowerUpAvoidanceOriginsV1,
  generateWarmachineMovementActivationPredecessorsV1,
} from
  "../src/reverse/movement-activation-predecessor-v1.mjs";
import { generateWarmachineControlPhasePredecessorsV1 } from
  "../src/reverse/control-phase-predecessor-v1.mjs";
import { generateWarmachinePreviousTurnEndPredecessorsV1 } from
  "../src/reverse/previous-turn-end-predecessor-v1.mjs";
import { replayWarmachineTerminalReverseRouteV1 } from
  "../src/reverse/replay-terminal-reverse-route-v1.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultLayer2CheckpointPath = path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/ticket06",
  "historical-layer-2-checkpoint-v11.json",
);
const defaultLayer3DiagnosticPath = path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/ticket06",
  "historical-layer-3-diagnostics-v13-frontier0.json",
);
const actorPieceKey = "player1_master_necrosurgeon_sepsira_1_1";
const poweredWarjackPieceKey = "player1_raptor_24_1";
const freeRunWarjackPieceKey = "player1_malefactor_25_1";
const resourceTargetPieceKeys = [
  "player2_ashmael_keeper_of_whispers_1_1",
  "player2_vordak_21_1",
];

function argumentValue(name, fallback = "") {
  return process.argv.find((argument) =>
    argument.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
}

const checkpointPath = path.resolve(argumentValue(
  "layer2-checkpoint",
  defaultLayer2CheckpointPath,
));
const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
const layer3DiagnosticPath = path.resolve(argumentValue(
  "layer3-diagnostic",
  defaultLayer3DiagnosticPath,
));
const previousTurnEnd = generateWarmachinePreviousTurnEndPredecessorsV1(
  checkpoint.frontiers[0].state,
  { nextSideActivationRestoreModes: ["all_alive_activated"] },
);
assert.equal(previousTurnEnd.strictCandidateCount, 1,
  JSON.stringify(previousTurnEnd.unresolved, null, 2));
const activationEnd = previousTurnEnd.candidates[0].predecessorState;
const actor = activationEnd.pieces.find((piece) =>
  piece.pieceKey === actorPieceKey);
assert.ok(actor);
assert.equal(actor.focus, 0);
assert.deepEqual(actor.position, { xIn: 12.32, yIn: 20.24 });

const origin = {
  xIn: 12.176632417512486,
  yIn: 24.737715613096462,
};
const result = generateWarmachineMovementActivationPredecessorsV1(
  activationEnd,
  {
    sideKey: "player1",
    actorPieceKeys: [actorPieceKey],
    actionTypes: ["advance"],
    deployments: {},
    originProposals: [{
      actorPieceKey,
      actionType: "advance",
      origin,
      waypoints: [actor.position],
      proposalSource: "ticket06_real_post_movement_resource_suffix_v1",
    }],
    includePostMovementResourceSpendSuffixes: true,
    resourcePrefixTargetPieceKeys: resourceTargetPieceKeys,
    maximumResourceSuffixTargets: resourceTargetPieceKeys.length,
    maximumResourceSuffixDepth: 4,
    maximumResourceSuffixLabels: 16,
    maximumResourceSuffixRoutes: 1,
    maximumStrictCandidates: 1,
    maximumStrictCandidateAttempts: 4,
    rejectedAuditLimit: 4,
  },
);
const candidate = result.candidates.find((row) =>
  row.operatorKey === "movement_resource_suffix_activation_inverse_v1");
assert.ok(candidate, JSON.stringify(result.unresolved, null, 2));
assert.equal(candidate.preActivationResourcePoints, 7);
assert.equal(candidate.reverseRestoredResourcePoints, 7);
assert.equal(candidate.resourceSpendOrder, "movement_then_resource_suffix");
assert.deepEqual(candidate.resourcePrefixActionKeys, []);
assert.equal(candidate.resourceSuffixActionKeys.length, 3);
assert.deepEqual(candidate.strictReplaySteps.map((step) => step.actionType), [
  "advance",
  "offensive_spell",
  "offensive_spell",
  "offensive_spell",
  "end_any_time_activation_window",
]);
assert.equal(candidate.strictReplaySteps.slice(1, 4).every((step) =>
  step.targetPieceKey === "player2_vordak_21_1"), true);
assert.equal(candidate.strictReplaySteps.slice(1, 4).every((step) =>
  step.actionPatch?.strictRollOutcome?.attackDice?.every((die) => die === 1)), true);
const replay = replayWarmachineTerminalReverseRouteV1({
  candidateKey: candidate.candidateKey,
  predecessorState: candidate.predecessorState,
  reverseEdges: [candidate],
}, activationEnd, {
  routeKey: "ticket06-resource-suffix-full-route-replay",
});
assert.equal(replay.fullRouteStrictReplayCertified, true,
  JSON.stringify(replay.failures, null, 2));

const deployments = Object.fromEntries((activationEnd.deploymentZones || []).map((zone) => [
  zone.sideKey === "player1" ? "p1_deploy" : "p2_deploy",
  {
    id: zone.id,
    x: zone.xIn,
    y: zone.yIn,
    width: zone.widthIn,
    height: zone.heightIn,
  },
]));
const powerUpSpend = generateWarmachineMovementActivationPredecessorsV1(
  activationEnd,
  {
    sideKey: "player1",
    actorPieceKeys: [poweredWarjackPieceKey],
    actionTypes: ["run"],
    deployments,
    prioritizeResourceContinuityFallbacks: true,
    maximumDeploymentSlotOrigins: 8,
    maximumDeploymentSlotRings: 2,
    maximumStrictCandidates: 1,
    maximumStrictCandidateAttempts: 4,
  },
);
assert.equal(powerUpSpend.strictCandidateCount, 1,
  JSON.stringify(powerUpSpend.rejected, null, 2));
const powerUpSpendCandidate = powerUpSpend.candidates[0];
assert.equal(powerUpSpendCandidate.preActivationResourcePoints, 1);
assert.equal(powerUpSpendCandidate.reverseRestoredResourcePoints, 1);
assert.equal(powerUpSpendCandidate.movementProposal.relationKind,
  "same_position_run_resource_preimage");
assert.deepEqual(powerUpSpendCandidate.movementProposal.origin,
  powerUpSpendCandidate.movementProposal.destination);

const layer3Diagnostic = JSON.parse(fs.readFileSync(layer3DiagnosticPath, "utf8"));
const controlBoundary = structuredClone(
  layer3Diagnostic.searchRuntimeDiagnostics[0].expectedSuccessorState,
);
const freeRunSuccessorActor = controlBoundary.pieces.find((piece) =>
  piece.pieceKey === freeRunWarjackPieceKey);
const activationEndFreeRunActor = activationEnd.pieces.find((piece) =>
  piece.pieceKey === freeRunWarjackPieceKey);
assert.ok(freeRunSuccessorActor);
assert.ok(activationEndFreeRunActor);
freeRunSuccessorActor.position = structuredClone(activationEndFreeRunActor.position);
freeRunSuccessorActor.activated = true;
const avoidanceDomain =
  enumerateWarmachineControllerPowerUpAvoidanceOriginsV1(
    controlBoundary,
    freeRunWarjackPieceKey,
  );
const legalAvoidanceOrigins = avoidanceDomain.rows.filter((row) =>
  row.originPlacementIssues.length === 0);
assert.equal(legalAvoidanceOrigins.length > 0, true);
const freeRunAvoidance = generateWarmachineMovementActivationPredecessorsV1(
  controlBoundary,
  {
    sideKey: "player1",
    actorPieceKeys: [freeRunWarjackPieceKey],
    actionTypes: ["run"],
    deployments: {},
    prioritizeResourceContinuityFallbacks: true,
    maximumStrictCandidates: 2,
    maximumStrictCandidateAttempts: 12,
    rejectedAuditLimit: 2,
  },
);
const freeRunAvoidanceCandidate = freeRunAvoidance.candidates.find((row) =>
  row.movementProposal.relationKind ===
    "controller_control_range_power_up_avoidance_origin");
assert.ok(freeRunAvoidanceCandidate,
  JSON.stringify(freeRunAvoidance.rejected, null, 2));
assert.equal(freeRunAvoidanceCandidate.preActivationResourcePoints, 0);
assert.equal(freeRunAvoidanceCandidate.reverseRestoredResourcePoints, 0);
const controlPredecessor = generateWarmachineControlPhasePredecessorsV1(
  freeRunAvoidanceCandidate.predecessorState,
  {
    controlResidueModes: ["absent"],
    resourceEnvelopeModes: ["reverse_focus_control_baseline"],
  },
);
assert.equal(controlPredecessor.strictCandidateCount, 1,
  JSON.stringify(controlPredecessor.unresolved, null, 2));
const localResourceContinuityReplay = replayWarmachineTerminalReverseRouteV1({
  candidateKey: "ticket06-free-run-power-up-avoidance",
  predecessorState: controlPredecessor.candidates[0].predecessorState,
  reverseEdges: [
    freeRunAvoidanceCandidate,
    controlPredecessor.candidates[0],
  ],
}, controlBoundary, {
  routeKey: "ticket06-free-run-power-up-avoidance-replay",
});
assert.equal(localResourceContinuityReplay.fullRouteStrictReplayCertified, true,
  JSON.stringify(localResourceContinuityReplay.failures, null, 2));

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion:
    "verify_materialized_assassination_resource_suffix_movement_v1",
  strictCandidateCount: result.strictCandidateCount,
  resourceSuffixRouteCount: result.resourceSuffixRouteCount,
  preActivationFocus: candidate.preActivationResourcePoints,
  restoredFocus: candidate.reverseRestoredResourcePoints,
  resourceSpendOrder: candidate.resourceSpendOrder,
  actionTypes: candidate.strictReplaySteps.map((step) => step.actionType),
  spellTargets: candidate.strictReplaySteps.filter((step) =>
    step.actionType === "offensive_spell").map((step) => step.targetPieceKey),
  origin: candidate.movementProposal.origin,
  destination: candidate.movementProposal.destination,
  strictTransitionCount: candidate.strictTransitionCount,
  fullRouteStrictReplayCertified: replay.fullRouteStrictReplayCertified,
  poweredWarjackPieceKey,
  powerUpSpendPreActivationFocus:
    powerUpSpendCandidate.preActivationResourcePoints,
  powerUpSpendRelationKind:
    powerUpSpendCandidate.movementProposal.relationKind,
  freeRunWarjackPieceKey,
  powerUpAvoidanceAngularCellCount: avoidanceDomain.rows.length,
  legalPowerUpAvoidanceOriginCount: legalAvoidanceOrigins.length,
  selectedPowerUpAvoidanceOrigin:
    freeRunAvoidanceCandidate.movementProposal.origin,
  freeRunControlStrictCandidateCount:
    controlPredecessor.strictCandidateCount,
  localResourceContinuityStrictReplayCertified:
    localResourceContinuityReplay.fullRouteStrictReplayCertified,
  reportHash: result.reportHash,
}, null, 2)}\n`);
