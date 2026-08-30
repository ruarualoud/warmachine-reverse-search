#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateWarmachineMovementActivationPredecessorsV1 } from
  "../src/reverse/movement-activation-predecessor-v1.mjs";
import { replayWarmachineTerminalReverseRouteV1 } from
  "../src/reverse/replay-terminal-reverse-route-v1.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultDiagnosticPath = path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/ticket06",
  "cumulative-score-layer-5-diagnostics-v21.json",
);
const actorPieceKey = "player1_master_necrosurgeon_sepsira_1_1";
const targetPieceKey = "player2_vordak_21_1";

function argumentValue(name, fallback = "") {
  return process.argv.find((argument) =>
    argument.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
}

const diagnosticPath = path.resolve(argumentValue("diagnostic", defaultDiagnosticPath));
const diagnostic = JSON.parse(fs.readFileSync(diagnosticPath, "utf8"));
const successor = structuredClone(
  diagnostic.searchRuntimeDiagnostics?.[0]?.expectedSuccessorState || {},
);
const actor = successor.pieces?.find((piece) => piece.pieceKey === actorPieceKey);
assert.ok(actor, "materialized Sepsira actor is required");
assert.equal(actor.focus, 0);
actor.activated = true;

const result = generateWarmachineMovementActivationPredecessorsV1(successor, {
  sideKey: "player1",
  actorPieceKeys: [actorPieceKey],
  actionTypes: ["advance"],
  includeResourceSpendPrefixes: true,
  resourcePrefixTargetPieceKeys: [targetPieceKey],
  maximumResourcePrefixTargets: 1,
  maximumResourcePrefixDepth: 4,
  maximumResourcePrefixLabels: 16,
  maximumResourcePrefixRoutes: 1,
  maximumStrictCandidates: 1,
  maximumStrictCandidateAttempts: 6,
  rejectedAuditLimit: 2,
  prioritizeResourceContinuityFallbacks: true,
});
const candidate = result.candidates.find((row) =>
  row.operatorKey === "resource_prefix_movement_activation_inverse_v1" &&
  row.movementProposal?.relationKind === "resource_prefix_spell_range_origin");
assert.ok(candidate, JSON.stringify(result.unresolved, null, 2));
assert.equal(candidate.reverseRestoredResourcePoints, 7);
assert.equal(candidate.movementProposal.resourcePrefixTargetPieceKey, targetPieceKey);
assert.equal(candidate.movementProposal.resourcePrefixSpellRangeIn, 10);
assert.deepEqual(candidate.strictReplaySteps.map((step) => step.actionType), [
  "offensive_spell",
  "offensive_spell",
  "offensive_spell",
  "advance",
  "end_any_time_activation_window",
]);
assert.equal(candidate.strictReplaySteps.slice(0, 3).every((step) =>
  step.targetPieceKey === targetPieceKey), true);

const replay = replayWarmachineTerminalReverseRouteV1({
  candidateKey: candidate.candidateKey,
  predecessorState: candidate.predecessorState,
  reverseEdges: [candidate],
}, successor, {
  routeKey: "verify-materialized-sepsira-resource-prefix-range-origin-v1",
});
assert.equal(replay.fullRouteStrictReplayCertified, true,
  JSON.stringify(replay.failures, null, 2));

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion: "verify_materialized_sepsira_resource_prefix_range_origin_v1",
  operatorKey: candidate.operatorKey,
  origin: candidate.movementProposal.origin,
  destination: candidate.movementProposal.destination,
  spellTargetPieceKey: targetPieceKey,
  spellRangeIn: candidate.movementProposal.resourcePrefixSpellRangeIn,
  restoredFocus: candidate.reverseRestoredResourcePoints,
  strictReplayActionTypes: candidate.strictReplaySteps.map((step) => step.actionType),
  strictTransitionCount: candidate.strictTransitionCount,
  fullRouteStrictReplayCertified: replay.fullRouteStrictReplayCertified,
  reportHash: result.reportHash,
}, null, 2)}\n`);
