import assert from "node:assert/strict";

import { buildWarmachineFixedTerminalPositionCorpusV1 } from
  "../src/benchmark/fixed-terminal-position-corpus-v1.mjs";
import { searchWarmachineTerminalRootedToDeploymentV1 } from
  "../src/reverse/terminal-rooted-to-deployment-v1.mjs";

const corpus = buildWarmachineFixedTerminalPositionCorpusV1({
  maximumProposals: 1,
  maximumMaterializedCells: 1,
});
assert.equal(corpus.positionDomain.proposedCount, 1);
assert.equal(corpus.materialized.strictMaterializedCount, 1);
assert.equal(corpus.terminalResourceAssumptions.length, 6);
const root = corpus.materialized.runtimeRoots[0];
const cell = corpus.positionDomain.proposals.find((entry) =>
  entry.cellKey === root.cellKey);
assert.ok(cell);
const defeatedLeader = root.preTerminalState.pieces.find((piece) =>
  piece.pieceKey === cell.targetLeaderPieceKey);
const defeatedBattlegroup = root.preTerminalState.pieces.filter((piece) =>
  piece.controllerPieceKey === defeatedLeader.pieceKey && piece.isWarbeast === true);

const search = searchWarmachineTerminalRootedToDeploymentV1(
  root.terminalState,
  cell,
  {
    deployments: corpus.fixture.opening.room.deployments,
    firstPlayerSideKey: "player1",
    terminalEventOptions: {
      terminalActionTypes: ["melee_attack"],
      maximumTerminalActions: 1,
      controllerDestructionResourcePointsByPieceKey: Object.fromEntries(
        defeatedBattlegroup.map((piece) => [piece.pieceKey, Number(piece.resourcePoints || 0)]),
      ),
      controllerDestructionStatusPreimageByPieceKey: Object.fromEntries(
        defeatedBattlegroup.map((piece) => [piece.pieceKey, {
          wild: (piece.statusTags || []).includes("wild"),
        }]),
      ),
      controllerDestructionUpkeepPreimageByControllerPieceKey: {
        [defeatedLeader.pieceKey]: { mode: "none_active" },
      },
    },
    maximumReverseTurns: 0,
    maximumRouteLabels: 8,
    maximumUniqueStates: 8,
    maximumCompletedRoutes: 1,
    maximumActivationDepth: 0,
    maximumActivationLabels: 8,
    maximumActivationUniqueStates: 8,
    stopAfterActivationBoundaryRouteCount: 1,
    includeMovement: false,
    includePass: true,
    resourceEnvelopeKey: "search_focus_predecessor",
    resourceEnvelopeModes: ["reverse_focus_control_baseline"],
    controlResidueModes: ["absent"],
    maximumControlSteps: 16,
  },
);

assert.equal(search.initialFrontierCount, 1, JSON.stringify(search.unresolved));
assert.equal(search.terminalEventPredecessorCount, 1);
assert.equal(search.terminalEventPredecessors[0].matchedProbabilityExact, false);
assert.deepEqual(search.terminalEventPredecessors[0].matchedProbabilityInterval, {
  lower: 0,
  upper: 1,
});
assert.deepEqual(search.terminalEventPredecessors[0].continuationActionTypePaths, [
  ["resolve_lifecycle_trigger_use"],
  ["resolve_lifecycle_trigger_decline"],
]);
assert.deepEqual(search.terminalEventPredecessors[0].mutation
  .controllerDestructionRestoration.restored.map((row) => row.pieceKey), [
  "player2_strygon_8_1",
  "player2_strygon_9_1",
  "player2_strygon_10_1",
  "player2_strygon_11_1",
  "player2_vordak_19_1",
  "player2_vordak_20_1",
]);
assert.equal(search.terminalEventPredecessors[0].mutation
  .controllerDestructionRestoration.restored.every((row) =>
    row.removedStatusTag === "wild"), true);
assert.equal(search.unresolved.some((row) =>
  row.reason.startsWith("terminal_controller_destruction_")), false);
assert.equal(search.routeLabelCount, 1);
assert.equal(search.uniqueStateCount, 1);
assert.equal(search.processedLabelCount, 1);
assert.equal(search.expandedLabelCount, 0);
assert.equal(search.legalDeploymentRouteCount, 0);
assert.equal(search.initialFrontier[0].turnNumber, 3);
assert.equal(search.initialFrontier[0].phaseKey, "control");
assert.deepEqual(search.initialFrontier[0].reverseOperatorKeys, [
  "assassination_terminal_attack_inverse_v1",
  "control_phase_start_inverse_v1",
]);
assert.deepEqual(search.initialFrontier[0].strictReplayStepActionTypes, [
  "melee_attack",
  "resolve_lifecycle_trigger_use",
  "end_maintenance_phase",
  "end_control_replenishment",
  "end_control_phase",
]);
assert.ok(search.initialFrontier[0].strictReceiptHashes.length >= 5);
assert.ok(search.unresolved.some((row) =>
  row.reason === "terminal_action_chance_mass_not_closed"));
assert.ok(search.unresolved.some((row) =>
  row.reason === "terminal_predecessor_action_type_scope_deferred"));
assert.ok(search.unresolved.some((row) =>
  row.reason === "terminal_to_deployment_reverse_turn_budget_exhausted"));
assert.equal(search.oracleIsolationAudit.openingRead, false);
assert.equal(corpus.positionDomain.oracleIsolationAudit.sourceStatePositionsRead, false);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_fixed_terminal_reverse_frontier_v1",
  modelCount: corpus.fixture.opening.modelCount,
  positionRootCount: corpus.positionDomain.proposedCount,
  strictMaterializedCount: corpus.materialized.strictMaterializedCount,
  terminalResourceAssumptionCount: corpus.terminalResourceAssumptions.length,
  initialFrontierCount: search.initialFrontierCount,
  initialFrontier: search.initialFrontier,
  unresolvedReasonCounts: Object.fromEntries([...new Set(search.unresolved.map((row) =>
    row.reason))].sort().map((reason) => [reason, search.unresolved.filter((row) =>
    row.reason === reason).length])),
  legalDeploymentRouteCount: search.legalDeploymentRouteCount,
  reportHash: search.reportHash,
}, null, 2));
