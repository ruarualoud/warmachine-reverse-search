#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  bindWarmachineBenchmarkExplicitMovementPathV2,
  executeWarmachineBenchmarkActivationV2,
} from "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import {
  buildRulesV1MovementPathProposalPlan,
  normalizeRulesV1State,
} from "../src/warmachine-host-runtime.mjs";
import { generateWarmachineMovementActivationPredecessorsV1 } from
  "../src/reverse/movement-activation-predecessor-v1.mjs";
import { generateWarmachineControlPhasePredecessorsV1 } from
  "../src/reverse/control-phase-predecessor-v1.mjs";
import { replayWarmachineTerminalReverseRouteV1 } from
  "../src/reverse/replay-terminal-reverse-route-v1.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultDiagnosticPath = path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/ticket06",
  "historical-control-diagnostics-v1.json",
);
const actorPieceKey = "player1_master_necrosurgeon_sepsira_1_1";
const resourceTargetPieceKeys = [
  "player2_ashmael_keeper_of_whispers_1_1",
  "player2_vordak_21_1",
];

function argumentValue(name, fallback = "") {
  return process.argv.find((argument) =>
    argument.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
}

function stripMovementPath(stateInput = {}, pathKey = "") {
  const state = structuredClone(stateInput);
  state.explicitMovementPaths = (state.explicitMovementPaths || []).filter((entry) =>
    String(entry.pathKey || entry.key || "") !== pathKey);
  for (const piece of state.pieces || []) {
    piece.explicitMovementPaths = (piece.explicitMovementPaths || []).filter((entry) =>
      String(entry.pathKey || entry.key || "") !== pathKey);
    if (piece.metadata?.explicitMovementPaths) {
      piece.metadata.explicitMovementPaths = piece.metadata.explicitMovementPaths.filter((entry) =>
        String(entry.pathKey || entry.key || "") !== pathKey);
    }
  }
  return normalizeRulesV1State(state);
}

const diagnosticPath = path.resolve(argumentValue("diagnostic", defaultDiagnosticPath));
const diagnostic = JSON.parse(fs.readFileSync(diagnosticPath, "utf8"));
const boundary = normalizeRulesV1State(
  diagnostic.searchRuntimeDiagnostics?.[0]?.expectedSuccessorState || {},
);
const actor = boundary.pieces.find((piece) => piece.pieceKey === actorPieceKey);
assert.ok(actor);
assert.equal(actor.focus, 0);
assert.equal(actor.resourceMax, 7);

const destination = { xIn: 12, yIn: 12 };
const pathPlan = buildRulesV1MovementPathProposalPlan(boundary, {
  actorPieceKey,
  actionType: "run",
  destination,
  ignoredPieceKeys: [actorPieceKey],
  keyBase: "ticket06-resource-prefix",
});
const pathProposal = pathPlan.proposals.find((proposal) =>
  proposal.proposalKind === "host_auto_routed") ||
  pathPlan.proposals.find((proposal) => proposal.precheckOk === true);
assert.ok(pathProposal);

const targetPathKey = "ticket06-resource-prefix-target";
const preparedTarget = bindWarmachineBenchmarkExplicitMovementPathV2(boundary, {
  actorPieceKey,
  actionType: "run",
  pathKey: targetPathKey,
  waypoints: pathProposal.waypoints,
  proposalSource: "ticket06_resource_prefix_target_v1",
});
const targetRun = executeWarmachineBenchmarkActivationV2(
  preparedTarget,
  actorPieceKey,
  {
    routeKey: "ticket06-resource-prefix-target",
    enumerationScopeForStep: ({ stepIndex }) => stepIndex === 0
      ? {
        actionFamilyKeys: ["movement", "timing"],
        movementPathKindKeys: ["explicit_path"],
      }
      : {},
    selectAction: ({ scoped, stepIndex }) => stepIndex === 0
      ? scoped.enumeration.actions.find((action) =>
        action.actionKey === `${actorPieceKey}:run-path:${targetPathKey}:v1`) || null
      : null,
  },
);
assert.equal(targetRun.ok, true, targetRun.reason);
assert.equal(targetRun.completed, true);
const successor = stripMovementPath(targetRun.state, targetPathKey);

const result = generateWarmachineMovementActivationPredecessorsV1(successor, {
  sideKey: "player1",
  actorPieceKeys: [actorPieceKey],
  actionTypes: ["run"],
  originProposals: [{
    actorPieceKey,
    actionType: "run",
    origin: actor.position,
    waypoints: pathProposal.waypoints,
    proposalKey: "ticket06-sepsira-resource-prefix-real",
    proposalSource: "ticket06_real_control_boundary_v1",
  }],
  includeResourceSpendPrefixes: true,
  resourcePrefixTargetPieceKeys: resourceTargetPieceKeys,
  maximumResourcePrefixTargets: resourceTargetPieceKeys.length,
  maximumResourcePrefixDepth: 4,
  maximumResourcePrefixLabels: 16,
  maximumResourcePrefixRoutes: 1,
  maximumStrictCandidates: 1,
  maximumStrictCandidateAttempts: 4,
  rejectedAuditLimit: 4,
});
const candidate = result.candidates.find((row) =>
  row.operatorKey === "resource_prefix_movement_activation_inverse_v1");
assert.ok(candidate, JSON.stringify(result.unresolved, null, 2));
const predecessorActor = candidate.predecessorState.pieces.find((piece) =>
  piece.pieceKey === actorPieceKey);
assert.equal(predecessorActor.focus, 7);
assert.equal(candidate.reverseRestoredResourcePoints, 7);
assert.deepEqual(candidate.strictReplaySteps.map((step) => step.actionType), [
  "offensive_spell",
  "offensive_spell",
  "offensive_spell",
  "run",
]);
assert.equal(candidate.strictReplaySteps.every((step) =>
  step.actionType !== "offensive_spell" ||
  step.actionPatch?.strictRollOutcome?.attackDice?.every((die) => die === 1)), true);
const replay = replayWarmachineTerminalReverseRouteV1({
  candidateKey: candidate.candidateKey,
  predecessorState: candidate.predecessorState,
  reverseEdges: [candidate],
}, successor, {
  routeKey: "ticket06-resource-prefix-full-route-replay",
});
assert.equal(replay.fullRouteStrictReplayCertified, true,
  JSON.stringify(replay.failures, null, 2));
const control = generateWarmachineControlPhasePredecessorsV1(
  candidate.predecessorState,
  {
    controlResidueModes: ["empty_previous_control"],
    resourceEnvelopeModes: ["unchanged"],
  },
);
assert.equal(control.strictCandidateCount, 1, JSON.stringify(control.unresolved, null, 2));
assert.equal(control.candidates[0].strictReplaySteps.some((step) =>
  step.actionType === "end_control_replenishment"), true);


process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion:
    "verify_materialized_assassination_resource_prefix_movement_v1",
  strictCandidateCount: result.strictCandidateCount,
  resourcePrefixRouteCount: result.resourcePrefixRouteCount,
  preActivationFocus: predecessorActor.focus,
  restoredFocus: candidate.reverseRestoredResourcePoints,
  actionTypes: candidate.strictReplaySteps.map((step) => step.actionType),
  spellTargets: candidate.strictReplaySteps.filter((step) =>
    step.actionType === "offensive_spell").map((step) => step.targetPieceKey),
  runWaypoints: candidate.movementProposal.waypoints,
  strictTransitionCount: candidate.strictTransitionCount,
  fullRouteStrictReplayCertified: replay.fullRouteStrictReplayCertified,
  controlStrictCandidateCount: control.strictCandidateCount,
  controlStrictTransitionCount: control.candidates[0].strictTransitionCount,
  reportHash: result.reportHash,
}, null, 2)}\n`);
