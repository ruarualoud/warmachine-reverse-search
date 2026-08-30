import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { searchWarmachineTerminalRootedToDeploymentV1 } from
  "../src/reverse/terminal-rooted-to-deployment-v1.mjs";
import { generateWarmachineTerminalEventPredecessorsV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";
import { buildWarmachineTerminalHypothesisDomainV1 } from
  "../src/reverse/terminal-hypothesis-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/terminal-route-evidence",
);
const reportPath = path.join(
  evidenceDirectory,
  "terminal-demand-group-02df97f2cb22c2ef90d94f61-report.json",
);
const runtimePath = path.join(
  evidenceDirectory,
  "terminal-demand-group-02df97f2cb22c2ef90d94f61-runtime.json",
);

function parseArguments(argv = []) {
  const options = { mode: "terminal", maximumReverseTurns: 1 };
  for (const argument of argv) {
    if (argument.startsWith("--mode=")) options.mode = argument.slice("--mode=".length);
    if (argument.startsWith("--maximum-reverse-turns=")) {
      options.maximumReverseTurns = Number(argument.slice(
        "--maximum-reverse-turns=".length,
      ));
    }
  }
  if (!["terminal", "deployment"].includes(options.mode)) {
    throw new Error(`unsupported_mode:${options.mode}`);
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function deploymentMap(state = {}) {
  return Object.fromEntries((state.deploymentZones || []).map((zone) => [
    zone.sideKey === "player1" ? "p1_deploy" : "p2_deploy",
    {
      id: String(zone.id || zone.zoneKey || ""),
      x: Number(zone.xIn ?? zone.x),
      y: Number(zone.yIn ?? zone.y),
      width: Number(zone.widthIn ?? zone.width),
      height: Number(zone.heightIn ?? zone.height),
    },
  ]));
}

function activationGroupKeys(state = {}, sideKey = "") {
  return [...new Set((state.pieces || [])
    .filter((piece) => piece.sideKey === sideKey)
    .map((piece) => String(
      piece.unitGroupId || piece.unitId || piece.metadata?.unitGroupId ||
      piece.metadata?.unitId || piece.pieceKey,
    )))].sort();
}

function terminalEventOptions(terminalState = {}, cell = {}, report = {}) {
  const targetPieceKey = String(cell.targetLeaderPieceKey || "");
  const target = (terminalState.pieces || []).find((piece) =>
    piece.pieceKey === targetPieceKey) || {};
  const targetIsWarlock = target.isWarlock === true ||
    /warlock/i.test(`${target.modelRole || ""} ${target.modelType || ""}`);
  const statusKey = targetIsWarlock ? "wild" : "inert";
  const controlled = (terminalState.pieces || []).filter((piece) =>
    piece.controllerPieceKey === targetPieceKey &&
    (piece.statusTags || []).includes(statusKey));
  const profileKey = String(report.selectedActor?.profileKey || "");
  const terminalActionKey = [
    cell.actorPieceKey,
    "melee",
    cell.targetLeaderPieceKey,
    profileKey,
    "v1",
  ].join(":");
  return {
    terminalActionTypes: ["melee_attack"],
    terminalActionKeys: [terminalActionKey],
    maximumTerminalActions: 1,
    maximumTerminalContinuationDepth: 2,
    maximumTerminalContinuationLabels: 8,
    controllerDestructionResourcePointsByPieceKey: Object.fromEntries(
      controlled.map((piece) => [piece.pieceKey, 0]),
    ),
    controllerDestructionStatusPreimageByPieceKey: Object.fromEntries(
      controlled.map((piece) => [piece.pieceKey, { [statusKey]: false }]),
    ),
    controllerDestructionUpkeepPreimageByControllerPieceKey: {
      [targetPieceKey]: { mode: "none_active" },
    },
  };
}

function terminalCell(report = {}, root = {}) {
  const request = report.terminalRequest || {};
  const actorPieceKey = String(root.preTerminalAssumptions?.actorPieceKey ||
    report.selectedActor?.actorPieceKey || "");
  const targetLeaderPieceKey = String(request.targetLeaderPieceKey || "");
  const controllerPieceKey = String(report.selectedActor?.controllerPieceKey || "");
  const domain = buildWarmachineTerminalHypothesisDomainV1({
    scenarioKey: String(request.scenarioKey || "two_fronts"),
    scenarioPacketKey: "steamroller-2026",
    scenarioPacketYear: "2026",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    rosterReceiptHash: String(report.opening?.initialStateKey || report.reportHash || ""),
    specs: [{
      goalType: "assassination",
      roundNumbers: [Number(request.roundNumber || root.roundNumber || 2)],
      winnerSideKeys: [String(request.attackerSideKey || "player2")],
      loserSideKeys: [String(request.defenderSideKey || "player1")],
      endingSideKeys: [String(request.attackerSideKey || "player2")],
      causalActionFamilies: ["strict_melee_chain"],
      actorPieceKeys: [actorPieceKey],
      targetLeaderPieceKeys: [targetLeaderPieceKey],
      targetBoxesBeforeFinal: [Number(request.targetBoxesBeforeFinal || 1)],
      resourceEnvelopeKeys: [String(request.resourceEnvelopeKey || "zero_available")],
      geometryRelationCells: [{
        relationKind: "terminal_attack_reachable",
        actorToTargetRangeBand: "melee_range",
        lineOfSightRelation: "melee_los",
        pathRelation: "no_movement_in_terminal_step",
        baseRelation: "legal_nonoverlap",
        exactCoordinatesKnown: true,
        exactCoordinates: { piecePositions: root.exactCoordinates || {} },
        relationChecks: (root.relationEvidence || []).map((relation, index) => ({
          relationKey: String(relation.relationKey || `terminal-relation-${index}`),
          relationKind: String(relation.relationKind || ""),
          sourcePieceKey: String(relation.sourcePieceKey || ""),
          targetPieceKey: String(relation.targetPieceKey || ""),
          profileKey: String(relation.profileKey || ""),
          minimumDistanceIn: relation.minimumDistanceIn,
          maximumDistanceIn: relation.maximumDistanceIn,
        })),
      }],
      assumptionSources: {
        goalType: "user_constrained",
        roundNumber: "user_constrained",
        winnerSideKey: "user_constrained",
        loserSideKey: "rule_derived",
        endingSideKey: "user_constrained",
        causalActionFamily: "optimistic_proposal",
        actorPieceKey: "optimistic_proposal",
        targetLeaderPieceKey: "user_constrained",
        targetBoxesBeforeFinal: "optimistic_proposal",
        resourceEnvelopeKey: "rule_derived",
        geometryRelationCell: "optimistic_proposal",
      },
    }],
  });
  return {
    ...domain.cells[0],
    controllerPieceKey,
    predecessorHistoryEvidence: {
      turnEndSettlementWitnesses: root.preTerminalAssumptions?.priorTurnSettlement
        ? [root.preTerminalAssumptions.priorTurnSettlement]
        : [],
    },
  };
}

const options = parseArguments(process.argv.slice(2));
const report = readJson(reportPath);
const persistedRuntime = readJson(runtimePath);
const persistedRoot = persistedRuntime.roots?.[0];
assert.ok(persistedRoot?.terminalState, "persisted assassination terminal state missing");
assert.equal(persistedRoot.goalType, "assassination");

const cell = terminalCell(report, persistedRoot);
const terminalOptions = terminalEventOptions(
  persistedRoot.terminalState,
  cell,
  report,
);
const terminalReverse = generateWarmachineTerminalEventPredecessorsV1(
  persistedRoot.terminalState,
  cell,
  terminalOptions,
);
assert.equal(terminalReverse.oracleIsolationAudit.passed, true);
assert.ok(terminalReverse.strictCandidateCount >= 1, JSON.stringify({
  unresolved: terminalReverse.unresolved.slice(0, 12),
  rejected: terminalReverse.rejected.slice(0, 12),
}, null, 2));

if (options.mode === "terminal") {
  console.log(JSON.stringify({
    ok: true,
    schemaVersion: "verify_matchup_assassination_root_to_opening_v1",
    mode: options.mode,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    persistedUpstreamReceiptHash: persistedRoot.upstreamReceiptHash,
    persistedEvidenceUsedAsExecutionInput: false,
    terminalCellKey: cell.cellKey,
    terminalStateHash: terminalReverse.successorSemanticHash,
    strictTerminalPredecessorCount: terminalReverse.strictCandidateCount,
    strictRejectedCount: terminalReverse.strictRejectedCount,
    unresolvedCount: terminalReverse.unresolvedCount,
    oracleIsolationPassed: terminalReverse.oracleIsolationAudit.passed,
    controllerDestructionPreimageMode:
      "zero_resource_not_preexisting_status_no_active_upkeep",
  }, null, 2));
  process.exit(0);
}

const state = persistedRoot.preTerminalState;
const deployments = deploymentMap(state);
const firstPlayerSideKey = String(state.firstPlayerSideKey || "player2");
const groupKeysBySide = {
  player1: activationGroupKeys(state, "player1"),
  player2: activationGroupKeys(state, "player2"),
};
const search = searchWarmachineTerminalRootedToDeploymentV1(
  persistedRoot.terminalState,
  cell,
  {
    deployments,
    firstPlayerSideKey,
    movementActionTypes: ["run"],
    maximumReverseTurns: options.maximumReverseTurns,
    maximumRouteLabels: 256,
    maximumUniqueStates: 256,
    maximumCompletedRoutes: 1,
    stopAfterCompletedRouteCount: 1,
    frontierOrder: "best_first_to_deployment",
    maximumActivationDepth: 48,
    maximumActivationLabels: 128,
    maximumActivationUniqueStates: 128,
    activationFrontierOrder: "best_first_to_deployment",
    stopAfterActivationBoundaryRouteCount: 1,
    maximumActivationGroupsPerExpansion: 1,
    maximumActivationCandidatesPerExpansion: 1,
    maximumDeploymentSlotOrigins: 8,
    maximumDeploymentSlotRings: 2,
    activationGroupOrderKeysBySide: groupKeysBySide,
    nextSideActivationRestoreModes: ["all_alive_activated"],
    includeRuntimeDiagnostics: false,
    certifyFullRouteStrictReplay: true,
    progressEveryLabels: 10,
    terminalEventOptions: terminalOptions,
  },
);

assert.equal(search.oracleIsolationAudit.passed, true);
console.log(JSON.stringify({
  ok: search.legalDeploymentRouteCount > 0 &&
    search.fullRouteStrictReplayCertifiedCount > 0,
  schemaVersion: "verify_matchup_assassination_root_to_opening_v1",
  mode: options.mode,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  persistedUpstreamReceiptHash: persistedRoot.upstreamReceiptHash,
  persistedEvidenceUsedAsExecutionInput: false,
  terminalCellKey: cell.cellKey,
  terminalStateHash: search.terminalStateHash,
  modelCount: (state.pieces || []).length,
  firstPlayerSideKey,
  activationGroupCounts: Object.fromEntries(Object.entries(groupKeysBySide)
    .map(([sideKey, keys]) => [sideKey, keys.length])),
  maximumReverseTurns: options.maximumReverseTurns,
  legalDeploymentRouteCount: search.legalDeploymentRouteCount,
  fullRouteStrictReplayCertifiedCount: search.fullRouteStrictReplayCertifiedCount,
  routeLabelCount: search.routeLabelCount,
  uniqueStateCount: search.uniqueStateCount,
  processedLabelCount: search.processedLabelCount,
  reachedPriorTurnFrontierCount: search.reachedPriorTurnFrontierCount,
  rejectedBranchCount: search.rejectedBranchCount,
  unresolvedCount: search.unresolvedCount,
  unresolvedReasonCounts: Object.fromEntries([...new Set(search.unresolved.map((row) =>
    row.reason))].sort().map((reason) => [reason, search.unresolved.filter((row) =>
    row.reason === reason).length])),
  resumeCheckpointHash: search.runtimeResumeCheckpoint.checkpointHash,
  resumeCheckpointFrontierCount: search.runtimeResumeCheckpoint.frontierCount,
  oracleIsolationPassed: search.oracleIsolationAudit.passed,
  reportHash: search.reportHash,
}, null, 2));
