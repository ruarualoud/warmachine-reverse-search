#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import { buildWarmachineSearchRunContractV1 } from
  "../src/contracts/search-run-contract-v1.mjs";
import {
  replayWarmachineMaterializedTerminalActivationV1,
  searchWarmachineMaterializedTerminalRootToDeploymentV1,
} from "../src/reverse/materialized-terminal-root-to-deployment-v1.mjs";
import { auditWarmachineLegalDeploymentReachabilityV1 } from
  "../src/reverse/deployment-reachability-v1.mjs";
import { auditWarmachineSideDeploymentGeometryV1 } from
  "../src/reverse/deployment-reachability-v1.mjs";
import {
  reverseWarmachineActivationSequenceV2,
  WARMACHINE_ACTIVATION_SEQUENCE_SEARCH_SOURCE_RECEIPT_V1,
} from "../src/reverse/activation-sequence-predecessor-v2.mjs";
import { generateWarmachineControlPhasePredecessorsV1 } from
  "../src/reverse/control-phase-predecessor-v1.mjs";
import { generateWarmachineMovementActivationPredecessorsV1 } from
  "../src/reverse/movement-activation-predecessor-v1.mjs";
import { generateWarmachinePreviousTurnEndPredecessorsV1 } from
  "../src/reverse/previous-turn-end-predecessor-v1.mjs";
import { buildWarmachineTerminalHypothesisDomainV1 } from
  "../src/reverse/terminal-hypothesis-v1.mjs";
import { auditWarmachineSteamrollerHistoricalSettlementV1 } from
  "../src/reverse/steamroller-historical-settlement-audit-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";
import {
  auditWarmachineTerminalRootedResumeCheckpointV1,
  buildWarmachineTerminalRootedResumeCheckpointV1,
  buildWarmachineActivationSequenceOptionsV1,
} from "../src/reverse/terminal-rooted-to-deployment-v1.mjs";
import { replayWarmachineTerminalReverseRouteV1 } from
  "../src/reverse/replay-terminal-reverse-route-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const evidenceRoot = path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
);

function argumentValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

const routeId = argumentValue("route-id", "ticket07-score");
const expandedCandidateBudget = process.argv.includes("--expanded-candidate-budget");
const forwardFixturePath = path.join(
  evidenceRoot,
  `${routeId}-forward-route-fixture-v1.json`,
);
const currentTurnCheckpointPath = path.join(
  evidenceRoot,
  `${routeId}-current-turn-reverse-checkpoint-v1.json`,
);
const reverseReportPath = path.join(
  evidenceRoot,
  `${routeId}-root-to-opening-v1.json`,
);
const strictRouteOpeningPath = path.join(
  evidenceRoot,
  `${routeId}-strict-route-opening-v1.json`,
);
const reverseFailurePath = path.join(
  evidenceRoot,
  `${routeId}-root-to-opening-failure-v1.json`,
);
const reverseDeepestFrontierPath = path.join(
  evidenceRoot,
  `${routeId}-root-to-opening-deepest-frontier-v1.json.gz`,
);
const historicalResumeCheckpointPath = path.join(
  evidenceRoot,
  `${routeId}-historical-resume-checkpoint-v1.json.gz`,
);
const historicalMovementProposalsPath = path.join(
  evidenceRoot,
  `${routeId}-history-movement-proposals-v1.json`,
);
const activationResumeCheckpointStorePath = path.join(
  evidenceRoot,
  `${routeId}-activation-resume-checkpoints-v1.json`,
);
const fixture = JSON.parse(fs.readFileSync(forwardFixturePath, "utf8"));
const hysenePieceKey = String(fixture.pieceKeys?.hysene || "");
const sepsiraPieceKey = String(fixture.pieceKeys?.sepsira || "");
const left40GroupKey = String(fixture.groupKeys?.left40 || "");
const right40GroupKey = String(fixture.groupKeys?.right40 || "");
assert.ok(hysenePieceKey && sepsiraPieceKey && left40GroupKey && right40GroupKey,
  "Score route fixture is missing route piece/group identities");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadActivationResumeCheckpoints() {
  if (!fs.existsSync(activationResumeCheckpointStorePath)) return {};
  const store = readJson(activationResumeCheckpointStorePath);
  if (store.schemaVersion !==
      "ticket07_activation_resume_checkpoint_store_v1" ||
      store.hostReceiptHash !== warmachineHost.receipt.receiptHash ||
      store.searchSourceClosureHash !==
        WARMACHINE_ACTIVATION_SEQUENCE_SEARCH_SOURCE_RECEIPT_V1
          .sourceClosureHash) return {};
  return store.checkpoints || {};
}

function persistActivationResumeCheckpoint(publication = {}) {
  if (!publication.resumeKey || !publication.checkpoint) return;
  const checkpoints = loadActivationResumeCheckpoints();
  checkpoints[publication.resumeKey] = publication.checkpoint;
  const store = stableGraphValue({
    schemaVersion: "ticket07_activation_resume_checkpoint_store_v1",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    searchSourceClosureHash:
      WARMACHINE_ACTIVATION_SEQUENCE_SEARCH_SOURCE_RECEIPT_V1
        .sourceClosureHash,
    checkpoints,
  });
  const temporaryPath =
    `${activationResumeCheckpointStorePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(store)}\n`);
  fs.renameSync(temporaryPath, activationResumeCheckpointStorePath);
}

function readGzipJson(filePath) {
  return JSON.parse(gunzipSync(fs.readFileSync(filePath)).toString("utf8"));
}

function writeGzipJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(
    temporaryPath,
    gzipSync(Buffer.from(JSON.stringify(stableGraphValue(value)))),
  );
  fs.renameSync(temporaryPath, filePath);
}

function positionDifference(leftState, rightState) {
  const rightByKey = new Map((rightState?.pieces || []).map((piece) => [
    piece.pieceKey,
    piece,
  ]));
  const differences = (leftState?.pieces || []).map((left) => {
    const right = rightByKey.get(left.pieceKey);
    if (!right) return { pieceKey: left.pieceKey, missing: true };
    const x = Number(left.position?.xIn || 0) - Number(right.position?.xIn || 0);
    const y = Number(left.position?.yIn || 0) - Number(right.position?.yIn || 0);
    return {
      pieceKey: left.pieceKey,
      distanceIn: Math.hypot(x, y),
      observedPosition: left.position || null,
      expectedPosition: right.position || null,
    };
  }).filter((row) => row.missing || row.distanceIn > 1e-6)
    .sort((left, right) =>
      Number(right.distanceIn || 0) - Number(left.distanceIn || 0) ||
      left.pieceKey.localeCompare(right.pieceKey));
  return {
    differingPieceCount: differences.length,
    maximumDistanceIn: differences.length
      ? Math.max(...differences.map((row) => Number(row.distanceIn || 0)))
      : 0,
    largestDifferences: differences.slice(0, 8),
  };
}

function stateSummary(state) {
  return {
    stateHash: warmachineReverseStateSemanticHashV1(state),
    turnNumber: Number(state?.turnNumber || 0),
    activeSideKey: String(state?.activeSideKey || ""),
    phaseKey: String(state?.phaseKey || ""),
    controlPhaseStepKey: String(state?.controlPhaseStepKey || ""),
    score: state?.scenario?.score || {},
    scoringHistoryCount: (state?.scenario?.scoringHistory || []).length,
    activatedPieceCount: (state?.pieces || []).filter((piece) =>
      piece.activated === true).length,
  };
}

function deploymentRectangles(state) {
  return Object.fromEntries((state.deploymentZones || []).map((zone) => [
    zone.zoneKey || zone.deploymentZoneKey,
    {
      id: zone.zoneKey || zone.deploymentZoneKey,
      x: Number(zone.xIn ?? zone.x),
      y: Number(zone.yIn ?? zone.y),
      width: Number(zone.widthIn ?? zone.width),
      height: Number(zone.heightIn ?? zone.height),
    },
  ]));
}

function pieceFullyInsideRectangle(piece, rectangle) {
  const radiusIn = Number(
    piece.baseRadiusIn ??
    Number(piece.baseSizeIn ?? piece.baseDiameterIn ?? 1.18) / 2,
  );
  const xIn = Number(piece.position?.xIn || 0);
  const yIn = Number(piece.position?.yIn || 0);
  return xIn - radiusIn >= rectangle.x - rectangle.width / 2 - 0.001 &&
    xIn + radiusIn <= rectangle.x + rectangle.width / 2 + 0.001 &&
    yIn - radiusIn >= rectangle.y - rectangle.height / 2 - 0.001 &&
    yIn + radiusIn <= rectangle.y + rectangle.height / 2 + 0.001;
}

function materializedRoot(fixture) {
  const root = {
    taskKey: `${routeId}-strict-route-v1`,
    scenarioKey: "two_fronts",
    roundNumber: 3,
    winnerSideKey: "player1",
    loserSideKey: "player2",
    endingSideKey: "player2",
    actorPieceKey: "",
    targetPieceKey: "",
    actionSequence: [fixture.terminalAction],
  };
  return {
    taskKey: root.taskKey,
    planHash: stableGraphHash({
      fixtureHash: fixture.fixtureHash,
      terminalAction: fixture.terminalAction,
    }),
    report: { disposition: "strict_materialized", root },
    runtime: {
      predecessorState: fixture.terminalPredecessorState,
      terminalState: fixture.terminalState,
    },
  };
}

function terminalCell(materialized) {
  const root = materialized.report.root;
  const predecessorState = materialized.runtime.predecessorState;
  const terminalState = materialized.runtime.terminalState;
  const scoreBeforeTerminal = stableGraphValue(
    predecessorState.scenario?.score || {},
  );
  const terminalScore = stableGraphValue(terminalState.scenario?.score || {});
  const terminalScoreGain = Object.fromEntries([...new Set([
    ...Object.keys(scoreBeforeTerminal),
    ...Object.keys(terminalScore),
  ])].sort().map((sideKey) => [
    sideKey,
    Number(terminalScore[sideKey] || 0) - Number(scoreBeforeTerminal[sideKey] || 0),
  ]));
  const challengerScored = Number(terminalScoreGain.player2 || 0) > 0;
  const piecePositions = Object.fromEntries((terminalState.pieces || []).map((model) => [
    model.pieceKey,
    model.position,
  ]));
  return buildWarmachineTerminalHypothesisDomainV1({
    scenarioKey: root.scenarioKey,
    scenarioPacketKey: "steamroller-2026",
    scenarioPacketYear: "2026",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    rosterReceiptHash: materialized.planHash,
    specs: [{
      goalType: "scenario_score",
      roundNumbers: [3],
      winnerSideKeys: [root.winnerSideKey],
      loserSideKeys: [root.loserSideKey],
      endingSideKeys: [root.endingSideKey],
      causalActionFamilies: ["steamroller_turn_end_settlement"],
      scoringElementKeys: [challengerScored
        ? "two-fronts-left-right-bonus-and-left-50"
        : "two-fronts-left-right-bonus"],
      scoreBeforeTerminalCells: [{
        relationKey: `score-before-terminal-${stableGraphHash(scoreBeforeTerminal, 12)}`,
        scoreBySide: scoreBeforeTerminal,
      }],
      terminalScoreGainCells: [{
        relationKey: `terminal-score-gain-${stableGraphHash(terminalScoreGain, 12)}`,
        scoreGainBySide: terminalScoreGain,
      }],
      geometryRelationCells: [{
        relationKind: "two_fronts_multi_objective_control_at_settlement",
        scenarioRelation: challengerScored
          ? "player1_controls_both_40mm_player2_controls_left_50mm"
          : "player1_controls_both_40mm_player2_scores_no_objective",
        lineOfSightRelation: "not_required_for_scoring",
        pathRelation: "no_movement_in_terminal_step",
        exactCoordinatesKnown: true,
        exactCoordinates: { piecePositions },
      }],
      assumptionSources: {
        goalType: "user_constrained",
        roundNumber: "rule_derived",
        winnerSideKey: "rule_derived",
        loserSideKey: "rule_derived",
        endingSideKey: "rule_derived",
        causalActionFamily: "rule_derived",
        scoringElementKey: "rule_derived",
        scoreBeforeTerminalCell: "rule_derived",
        terminalScoreGainCell: "rule_derived",
        geometryRelationCell: "rule_derived",
      },
    }],
  }).cells[0];
}

function forwardOrder(fixture, stageIndex) {
  return [...fixture.stages[stageIndex].activatedGroupKeys];
}

function reverseOptions(fixture) {
  const p2Turn1 = forwardOrder(fixture, 0);
  const p1Turn1 = forwardOrder(fixture, 1);
  const p2Turn2 = forwardOrder(fixture, 2);
  const p1Turn2 = forwardOrder(fixture, 3);
  const p2Turn3 = forwardOrder(fixture, 4);
  const movementProposalBundle = fs.existsSync(historicalMovementProposalsPath)
    ? readJson(historicalMovementProposalsPath)
    : null;
  const currentMovementProposalBundle =
    movementProposalBundle?.hostReceiptHash ===
      warmachineHost.receipt.receiptHash &&
    movementProposalBundle?.fixtureHash === fixture.fixtureHash
      ? movementProposalBundle
      : null;
  const normalizeHistoricalMovementProposals = (proposals = []) =>
    proposals.map((proposal) => {
        assert.equal(
          ["", "run"].includes(String(proposal.actionType || "")),
          true,
          `Ticket 07 historical movement seed has incompatible action type: ${
            proposal.proposalKey || "unknown"}`,
        );
        return { ...proposal, actionType: "run" };
      });
  const historicalMovementProposalsByTurnAndSide =
    currentMovementProposalBundle?.proposalsByTurnAndSide
      ? Object.fromEntries(Object.entries(
        currentMovementProposalBundle.proposalsByTurnAndSide,
      ).map(([turnSideKey, proposals]) => [
        turnSideKey,
        normalizeHistoricalMovementProposals(proposals),
      ]))
      : {
        "2:player1": normalizeHistoricalMovementProposals(
          currentMovementProposalBundle?.proposals || [],
        ),
      };
  const hyseneOrigin = fixture.stages[3].state.pieces.find((piece) =>
    piece.pieceKey === hysenePieceKey)?.position;
  const hysenePlannedActivation = fixture.stages[4].plannedActivations.find(
    (activation) => activation.activationGroupKey === hysenePieceKey,
  );
  const hyseneWaypoints = hysenePlannedActivation?.movementEvidence
    ?.pathsByModel?.find((pathRow) =>
      pathRow.pieceKey === hysenePieceKey)?.waypoints;
  assert.ok(hyseneOrigin && hyseneWaypoints?.length,
    "Ticket 07 Hysene history movement witness is incomplete");
  const currentTurnHyseneProposal = {
    proposalKey: "ticket07-current-turn-hysene-history-seed-v1",
    actorPieceKey: hysenePieceKey,
    actionType: "run",
    origin: hyseneOrigin,
    waypoints: hyseneWaypoints,
    proposalSource: "ticket07_declared_history_movement_witness_v1",
    proposalPriority: -100,
  };
  return {
    deployments: deploymentRectangles(fixture.injectedOpeningState),
    firstPlayerSideKey: "player2",
    maximumReverseTurns: 5,
    maximumRouteLabels: expandedCandidateBudget ? 64 : 16,
    maximumUniqueStates: expandedCandidateBudget ? 64 : 16,
    maximumCompletedRoutes: 1,
    stopAfterCompletedRouteCount: 1,
    frontierOrder: "best_first_to_deployment",
    includePass: true,
    includeMovement: true,
    movementActionTypes: ["run"],
    maximumActivationDepth: 64,
    maximumActivationLabels: expandedCandidateBudget ? 384 : 192,
    maximumActivationUniqueStates: expandedCandidateBudget ? 384 : 192,
    activationFrontierOrder: "best_first_to_deployment",
    stopAfterActivationBoundaryRouteCount: expandedCandidateBudget ? 4 : 1,
    maximumActivationGroupsPerExpansion: 1,
    maximumActivationCandidatesPerExpansion: expandedCandidateBudget ? 2 : 1,
    maximumActivationCandidatesPerGroupKeyByTurnAndSide: {
      "2:player1": {
        [left40GroupKey]: 1,
        [right40GroupKey]: 1,
        [sepsiraPieceKey]: 1,
      },
      "2:player2": {
        [hysenePieceKey]: 4,
      },
    },
    movementOriginProposalsByTurnAndSide: {
      ...historicalMovementProposalsByTurnAndSide,
      "3:player2": [currentTurnHyseneProposal],
    },
    maximumActivationPassActorsPerExpansion: 1,
    maximumMovementStrictCandidatesPerExpansion: expandedCandidateBudget ? 2 : 1,
    maximumMovementStrictCandidateAttempts: expandedCandidateBudget ? 96 : 48,
    maximumUnitMovementAnchorsPerGroup: expandedCandidateBudget ? 2 : 1,
    maximumDeploymentSlotOrigins: expandedCandidateBudget ? 24 : 16,
    maximumDeploymentSlotRings: 3,
    includeDeploymentSlotAlternatives: true,
    includeUnitDeploymentFormationAlternatives: true,
    unitDeploymentFormationTurnNumbers: [1],
    maximumUnitDeploymentFormationCandidates: 16,
    unitDeploymentFormationGridStepIn: 0.25,
    unitDeploymentFormationRotationCount: 12,
    requireTurnOneSideDeploymentBoundary: true,
    activationBoundaryStateObligationsByTurnAndSide: {
      "2:player1": [{
        obligationKind:
          "declared_movement_deployment_reachability_lower_bound",
        sideKey: "player1",
        movementGroups: [
          { groupKey: left40GroupKey, actionType: "run" },
          { groupKey: right40GroupKey, actionType: "run" },
          { groupKey: sepsiraPieceKey, actionType: "run" },
        ],
        source: "ticket07_declared_player1_turn1_run_witness",
      }],
      "2:player2": [{
        obligationKind:
          "declared_movement_deployment_reachability_lower_bound",
        sideKey: "player2",
        movementGroups: [
          { groupKey: hysenePieceKey, actionType: "run" },
        ],
        source: "ticket07_declared_player2_turn1_run_witness",
      }],
    },
    resourceEnvelopeModesByTurnAndSide: {
      "1:player2": ["unchanged"],
      "1:player1": ["unchanged"],
      "2:player2": ["unchanged"],
      "2:player1": ["unchanged"],
      "3:player2": ["unchanged"],
    },
    controlResidueModes: ["absent"],
    activationGroupOrderKeysByTurnAndSide: {
      "1:player2": p2Turn1.slice().reverse(),
      "1:player1": p1Turn1.slice().reverse(),
      "2:player2": p2Turn2.slice().reverse(),
      "2:player1": p1Turn2.slice().reverse(),
      "3:player2": p2Turn3.slice().reverse(),
    },
    movementActivationGroupKeysByTurnAndSide: {
      "1:player2": [hysenePieceKey],
      "1:player1": [left40GroupKey, right40GroupKey, sepsiraPieceKey],
      "2:player2": [hysenePieceKey],
      "2:player1": [left40GroupKey, right40GroupKey, sepsiraPieceKey],
      "3:player2": [hysenePieceKey],
    },
    nextSideActivationRestoreModes: ["all_alive_activated"],
    nextSideActivationRestoreModesByTurnAndSide: {
      "1:player1": ["preserve_reset_state"],
    },
    currentTurnIncludeMovement: true,
    currentTurnMaximumActivationDepth: 32,
    currentTurnMaximumActivationLabels: 64,
    currentTurnMaximumActivationUniqueStates: 64,
    currentTurnMaximumActivationGroupsPerExpansion: 1,
    currentTurnMaximumActivationCandidatesPerExpansion: 4,
    currentTurnMaximumActivationCandidatesPerGroupKey: {
      [hysenePieceKey]: 8,
    },
    currentTurnActivationFrontierOrder: "breadth_first_by_activation_depth",
    currentTurnMaximumActivationPassActorsPerExpansion: 1,
    currentTurnStopAfterActivationBoundaryRouteCount: 4,
    currentTurnMaximumHistoricalBoundaryCandidateCount: 1,
    currentTurnRequireHistoricalBoundaryPreflight: true,
    certifyFullRouteStrictReplay: true,
    progressEveryLabels: 1,
    progressDeploymentFailureLimit: 1,
    includeRuntimeDiagnostics: true,
    activationResumeCheckpoints: loadActivationResumeCheckpoints(),
    onActivationCheckpoint: (publication) => {
      if (!["activation_label_expanded", "activation_boundary_reached",
        "activation_boundary_witness_budget_reached",
        "activation_inverse_dead_end"].includes(
        String(publication?.stage || ""))) return;
      persistActivationResumeCheckpoint(publication);
    },
    onProgress: (event) => {
      if (!["initial_frontier_ready", "processing_label",
        "turn_one_deployment_audit_failed", "witness_budget_reached",
        "search_complete"].includes(String(event?.stage || ""))) return;
      process.stderr.write(`${JSON.stringify({
        scope: "ticket07_historical_reverse",
        stage: event.stage,
        processedLabelCount: event.processedLabelCount,
        expandedLabelCount: event.expandedLabelCount,
        queuedLabelCount: event.queuedLabelCount,
        completedRouteCount: event.completedRouteCount,
        rejectedBranchCount: event.rejectedBranchCount,
        unresolvedCount: event.unresolvedCount,
        current: event.current || null,
        failedDeploymentChecks: event.failedDeploymentChecks || [],
      })}\n`);
    },
    onActivationProgress: (event) => {
      if (!["activation_expansion_started", "activation_expansion_ready",
        "activation_boundary_reached", "activation_reverse_complete"]
        .includes(String(event?.stage || ""))) return;
      process.stderr.write(`${JSON.stringify({
        scope: "ticket07_historical_activation_reverse",
        stage: event.stage,
        sideKey: event.sideKey,
        expandedLabelCount: event.expandedLabelCount,
        boundaryRouteCount: event.boundaryRouteCount,
        queuedLabelCount: event.queuedLabelCount,
        selectedGroups: event.selectedGroups || [],
        selectedCandidates: event.selectedCandidates || [],
        strictCandidateCount: event.strictCandidateCount ?? null,
        candidateCount: event.candidateCount ?? null,
      })}\n`);
    },
    onCurrentTurnActivationProgress: (event) => {
      if (!event?.stage || !/started|accepted|boundary|complete|budget/.test(
        String(event.stage))) return;
      process.stderr.write(`${JSON.stringify({
        scope: "ticket07_current_turn_activation_preflight",
        ...event,
      })}\n`);
    },
  };
}

function checkpointContract(fixture, cell, options) {
  return stableGraphHash({
    schemaVersion: "ticket07_score_current_turn_checkpoint_contract_v1",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    fixtureHash: fixture.fixtureHash,
    terminalCellKey: cell.cellKey,
    activationOrder: options.activationGroupOrderKeysByTurnAndSide["3:player2"],
    movementGroups: options.movementActivationGroupKeysByTurnAndSide["3:player2"],
    movementOriginProposalsByTurnAndSide:
      options.movementOriginProposalsByTurnAndSide,
    unitDeploymentFormation: {
      enabled: options.includeUnitDeploymentFormationAlternatives,
      turnNumbers: options.unitDeploymentFormationTurnNumbers,
      maximumCandidates: options.maximumUnitDeploymentFormationCandidates,
      gridStepIn: options.unitDeploymentFormationGridStepIn,
      rotationCount: options.unitDeploymentFormationRotationCount,
    },
    requireTurnOneSideDeploymentBoundary:
      options.requireTurnOneSideDeploymentBoundary,
    maximumActivationCandidatesPerGroupKeyByTurnAndSide:
      options.maximumActivationCandidatesPerGroupKeyByTurnAndSide,
    activationBoundaryStateObligationsByTurnAndSide:
      options.activationBoundaryStateObligationsByTurnAndSide,
    currentTurnMaximumActivationDepth:
      options.currentTurnMaximumActivationDepth,
    currentTurnMaximumActivationCandidatesPerExpansion:
      options.currentTurnMaximumActivationCandidatesPerExpansion,
    currentTurnActivationFrontierOrder:
      options.currentTurnActivationFrontierOrder,
    currentTurnStopAfterActivationBoundaryRouteCount:
      options.currentTurnStopAfterActivationBoundaryRouteCount,
    currentTurnMaximumHistoricalBoundaryCandidateCount:
      options.currentTurnMaximumHistoricalBoundaryCandidateCount,
    currentTurnRequireHistoricalBoundaryPreflight:
      options.currentTurnRequireHistoricalBoundaryPreflight,
  });
}

function selectDeclaredHistoricalFrontier(
  checkpoint,
  expectedStateHash,
  { fixture, cell, options },
) {
  const frontiers = checkpoint?.frontiers || [];
  const selected = frontiers.find((frontier) =>
    frontier.stateHash === expectedStateHash);
  assert.ok(selected, JSON.stringify({
    message: "Current-turn reverse did not recover the declared historical boundary",
    expectedStateHash,
    frontierStateHashes: frontiers.map((frontier) => frontier.stateHash),
  }, null, 2));
  const deferredAlternatives = frontiers.filter((frontier) =>
    frontier.labelKey !== selected.labelKey).map((frontier) => stableGraphValue({
      reason: "declared_history_alternative_deferred",
      labelKey: frontier.labelKey,
      stateHash: frontier.stateHash,
      expectedStateHash,
    }));
  return buildWarmachineTerminalRootedResumeCheckpointV1({
    terminalStateHash:
      warmachineReverseStateSemanticHashV1(fixture.terminalState),
    terminalCell: cell,
    deployments: options.deployments,
    rawOptions: options,
    deferredFrontiers: [selected],
    searchProgress: {
      ...(checkpoint.searchProgress || {}),
      unresolved: [
        ...(checkpoint.searchProgress?.unresolved || []),
        ...deferredAlternatives,
      ],
    },
  });
}

function ensureCurrentTurnReissueCandidateScopeDebt(
  checkpoint,
  checkpointWrapper,
  { fixture, cell, options },
) {
  const reason =
    "current_turn_checkpoint_reissue_candidate_scope_not_reexpanded";
  const unresolved = checkpoint.searchProgress?.unresolved || [];
  if (!checkpointWrapper?.currentRouteReissueReplayHash ||
      unresolved.some((row) => row.reason === reason)) return checkpoint;

  return buildWarmachineTerminalRootedResumeCheckpointV1({
    terminalStateHash:
      warmachineReverseStateSemanticHashV1(fixture.terminalState),
    terminalCell: cell,
    deployments: options.deployments,
    rawOptions: options,
    deferredFrontiers: checkpoint.frontiers,
    searchProgress: {
      ...(checkpoint.searchProgress || {}),
      unresolved: [
        ...unresolved,
        stableGraphValue({
          reason,
          sourceCheckpointHash: String(
            checkpointWrapper.historicalResumeCheckpoint?.checkpointHash || "",
          ),
          sourceUnresolvedCount: (
            checkpointWrapper.historicalResumeCheckpoint
              ?.searchProgress?.unresolved || []
          ).length,
          sourceRejectedCount: (
            checkpointWrapper.historicalResumeCheckpoint
              ?.searchProgress?.rejected || []
          ).length,
          detail: "The selected current-turn route was freshly strict-replayed under the current source, but alternate current-turn candidates were not re-expanded and remain unresolved.",
        }),
      ],
    },
  });
}

const materialized = materializedRoot(fixture);
const cell = terminalCell(materialized);
const options = reverseOptions(fixture);
const historicalSettlementAudit =
  auditWarmachineSteamrollerHistoricalSettlementV1(fixture.terminalState, {
    declaredTerminalRound: 3,
    declaredTerminalEndingSideKey: "player2",
  });
assert.equal(historicalSettlementAudit.ok, true,
  JSON.stringify(historicalSettlementAudit, null, 2));
const terminalReplay = replayWarmachineMaterializedTerminalActivationV1({
  predecessorState: fixture.terminalPredecessorState,
  terminalState: fixture.terminalState,
  actionSequence: materialized.report.root.actionSequence,
  routeKey: `${routeId}-terminal-replay-v1`,
});
assert.equal(terminalReplay.ok, true, JSON.stringify(terminalReplay.failures, null, 2));
assert.deepEqual(terminalReplay.finalState.scenario.score,
  fixture.terminalState.scenario.score);

if (process.argv.includes("--preflight-terminal")) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    schemaVersion: "ticket07_score_terminal_preflight_v1",
    terminalCellKey: cell.cellKey,
    historicalSettlementAuditHash: historicalSettlementAudit.auditHash,
    terminalReplayHash: terminalReplay.replayHash,
    terminalEvents: terminalReplay.terminalEvents,
  }, null, 2)}\n`);
  process.exit(0);
}

if (process.argv.includes("--preflight-turn-one-deployment")) {
  const generated = generateWarmachineMovementActivationPredecessorsV1(
    fixture.stages[1].plannedActivations[1].state,
    {
      sideKey: "player1",
      actorPieceKeys: [`${right40GroupKey}_1`],
      actionTypes: ["run"],
      deployments: options.deployments,
      includeDeploymentSlotAlternatives: true,
      includeUnitDeploymentFormationAlternatives: true,
      maximumDeploymentSlotOrigins: options.maximumDeploymentSlotOrigins,
      maximumDeploymentSlotRings: options.maximumDeploymentSlotRings,
      maximumUnitDeploymentFormationCandidates:
        options.maximumUnitDeploymentFormationCandidates,
      unitDeploymentFormationGridStepIn:
        options.unitDeploymentFormationGridStepIn,
      unitDeploymentFormationRotationCount:
        options.unitDeploymentFormationRotationCount,
      maximumUnitMovementAnchorsPerGroup: 1,
      maximumStrictCandidates: 1,
      maximumStrictCandidateAttempts: 4,
    },
  );
  assert.equal(generated.strictCandidateCount, 1, JSON.stringify({
    rejected: generated.rejected,
    unresolved: generated.unresolved,
  }, null, 2));
  const candidate = generated.candidates[0];
  const members = candidate.predecessorState.pieces.filter((piece) =>
    piece.unitGroupId === right40GroupKey);
  assert.equal(
    candidate.movementProposal.relationKind,
    "unit_group_deployment_reformation",
  );
  assert.equal(members.length, 3);
  assert.equal(members.every((piece) =>
    pieceFullyInsideRectangle(piece, options.deployments.p1_deploy)), true);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    schemaVersion: "ticket07_turn_one_deployment_preflight_v1",
    candidateKey: candidate.candidateKey,
    relationKind: candidate.movementProposal.relationKind,
    proposalSource: candidate.movementProposal.proposalSource,
    strictTransitionCount: candidate.strictTransitionCount,
    modelCount: members.length,
    originsByPieceKey: candidate.movementProposal.originsByPieceKey,
  }, null, 2)}\n`);
  process.exit(0);
}

if (process.argv.includes("--preflight-first-round-boundaries")) {
  const p1ActivationEnd = fixture.stages[1].preEndState;
  const p1Activation = reverseWarmachineActivationSequenceV2(
    p1ActivationEnd,
    buildWarmachineActivationSequenceOptionsV1(
      p1ActivationEnd,
      "player1",
      "ticket07_preflight_player1_turn1",
      options,
    ),
  );
  assert.equal(p1Activation.boundaryRouteCount > 0, true, JSON.stringify({
    stage: "player1_turn1_activation_boundary",
    unresolvedReasons: [...new Set((p1Activation.unresolved || []).map((row) =>
      String(row.reason || "")))],
    rejectedReasons: [...new Set((p1Activation.rejected || []).map((row) =>
      String(row.reason || "")))],
  }, null, 2));
  const p1Boundary = p1Activation.runtimeBoundaries[0];
  const p1Deployment = auditWarmachineSideDeploymentGeometryV1(
    p1Boundary.state,
    { sideKey: "player1", deployments: options.deployments },
  );
  assert.equal(p1Deployment.ok, true, JSON.stringify(p1Deployment, null, 2));

  const p1Control = generateWarmachineControlPhasePredecessorsV1(
    p1Boundary.state,
    {
      controlResidueModes: options.controlResidueModes,
      resourceEnvelopeModes:
        options.resourceEnvelopeModesByTurnAndSide["1:player1"],
      includeRuntimeDiagnostics: true,
    },
  );
  assert.equal(p1Control.strictCandidateCount > 0, true, JSON.stringify({
    rejected: p1Control.rejected,
    unresolved: p1Control.unresolved,
  }, null, 2));
  const p2End = generateWarmachinePreviousTurnEndPredecessorsV1(
    p1Control.candidates[0].predecessorState,
    {
      nextSideActivationRestoreModes:
        options.nextSideActivationRestoreModesByTurnAndSide["1:player1"],
      includeRuntimeDiagnostics: true,
    },
  );
  const p2EndCandidate = p2End.candidates.find((candidate) =>
    candidate.endingTurnNumber === 1 &&
    candidate.endingSideKey === "player2");
  assert.ok(p2EndCandidate, JSON.stringify({
    rejected: p2End.rejected,
    unresolved: p2End.unresolved,
  }, null, 2));

  const p2ActivationEnd = p2EndCandidate.predecessorState;
  const p2Activation = reverseWarmachineActivationSequenceV2(
    p2ActivationEnd,
    buildWarmachineActivationSequenceOptionsV1(
      p2ActivationEnd,
      "player2",
      "ticket07_preflight_player2_turn1",
      options,
    ),
  );
  assert.equal(p2Activation.boundaryRouteCount > 0, true, JSON.stringify({
    stage: "player2_turn1_activation_boundary",
    unresolvedReasons: [...new Set((p2Activation.unresolved || []).map((row) =>
      String(row.reason || "")))],
    rejectedReasons: [...new Set((p2Activation.rejected || []).map((row) =>
      String(row.reason || "")))],
  }, null, 2));
  const p2Boundary = p2Activation.runtimeBoundaries[0];
  const p2Deployment = auditWarmachineSideDeploymentGeometryV1(
    p2Boundary.state,
    { sideKey: "player2", deployments: options.deployments },
  );
  assert.equal(p2Deployment.ok, true, JSON.stringify(p2Deployment, null, 2));

  const p2Control = generateWarmachineControlPhasePredecessorsV1(
    p2Boundary.state,
    {
      controlResidueModes: options.controlResidueModes,
      resourceEnvelopeModes:
        options.resourceEnvelopeModesByTurnAndSide["1:player2"],
      includeRuntimeDiagnostics: true,
    },
  );
  assert.equal(p2Control.strictCandidateCount > 0, true, JSON.stringify({
    rejected: p2Control.rejected,
    unresolved: p2Control.unresolved,
  }, null, 2));
  const opening = p2Control.candidates[0].predecessorState;
  const openingAudit = auditWarmachineLegalDeploymentReachabilityV1(opening, {
    firstPlayerSideKey: options.firstPlayerSideKey,
    deployments: options.deployments,
  });
  assert.equal(openingAudit.ok, true, JSON.stringify(openingAudit, null, 2));
  process.stdout.write(`${JSON.stringify({
    ok: true,
    schemaVersion: "ticket07_first_round_boundary_preflight_v1",
    player1Boundary: {
      stateHash: p1Boundary.stateHash,
      depth: p1Boundary.depth,
      deploymentAuditHash: p1Deployment.auditHash,
    },
    player2Boundary: {
      stateHash: p2Boundary.stateHash,
      depth: p2Boundary.depth,
      deploymentAuditHash: p2Deployment.auditHash,
    },
    openingStateHash: openingAudit.stateHash,
    openingReportHash: openingAudit.reportHash,
  }, null, 2)}\n`);
  process.exit(0);
}

const contractHash = checkpointContract(fixture, cell, options);
const searchRunContract = buildWarmachineSearchRunContractV1({
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  searchSourceClosureHash:
    WARMACHINE_ACTIVATION_SEQUENCE_SEARCH_SOURCE_RECEIPT_V1.sourceClosureHash,
  fixtureHash: fixture.fixtureHash,
  terminalCellKey: cell.cellKey,
  options,
});
const searchRunContractHash = searchRunContract.searchRunContractHash;
let currentTurnCheckpoint = null;
let currentMovementEvidence = null;
let cachedCurrentTurnCheckpointWrapper = null;
if (fs.existsSync(currentTurnCheckpointPath)) {
  const cached = readJson(currentTurnCheckpointPath);
  cachedCurrentTurnCheckpointWrapper = cached;
  const cachedCheckpointAudit = cached.historicalResumeCheckpoint
    ? auditWarmachineTerminalRootedResumeCheckpointV1(
      cached.historicalResumeCheckpoint,
      {
        terminalStateHash:
          warmachineReverseStateSemanticHashV1(fixture.terminalState),
        terminalCell: cell,
        deployments: options.deployments,
        rawOptions: options,
      },
    )
    : { ok: false };
  if (cached.contractHash === contractHash && cachedCheckpointAudit.ok) {
    currentTurnCheckpoint = selectDeclaredHistoricalFrontier(
      cached.historicalResumeCheckpoint,
      warmachineReverseStateSemanticHashV1(fixture.stages[3].state),
      { fixture, cell, options },
    );
    currentTurnCheckpoint = ensureCurrentTurnReissueCandidateScopeDebt(
      currentTurnCheckpoint,
      cached,
      { fixture, cell, options },
    );
    currentMovementEvidence = cached.currentMovementEvidence;
    if (currentTurnCheckpoint.checkpointHash !==
        cached.historicalResumeCheckpoint.checkpointHash) {
      const upgradedWrapper = stableGraphValue({
        ...cached,
        historicalResumeCheckpoint: currentTurnCheckpoint,
      });
      const temporaryPath = `${currentTurnCheckpointPath}.tmp-${process.pid}`;
      fs.writeFileSync(temporaryPath, `${JSON.stringify(upgradedWrapper)}\n`);
      fs.renameSync(temporaryPath, currentTurnCheckpointPath);
      cachedCurrentTurnCheckpointWrapper = upgradedWrapper;
    }
  }
}
if (currentTurnCheckpoint &&
    process.argv.includes("--reissue-current-turn-checkpoint")) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    schemaVersion: "ticket07_score_current_turn_checkpoint_already_current_v1",
    contractHash,
    currentMovementStrictCandidateCount:
      currentMovementEvidence?.strictCandidateCount || 0,
    checkpointHash: currentTurnCheckpoint.checkpointHash,
  }, null, 2)}\n`);
  process.exit(0);
}
if (!currentTurnCheckpoint &&
    process.argv.includes("--reissue-current-turn-checkpoint")) {
  assert.ok(
    cachedCurrentTurnCheckpointWrapper?.historicalResumeCheckpoint?.frontiers
      ?.length,
    "Ticket 07 has no prior current-turn frontier to reissue",
  );
  const expectedCurrentBoundaryStateHash =
    warmachineReverseStateSemanticHashV1(fixture.stages[3].state);
  const priorFrontier =
    cachedCurrentTurnCheckpointWrapper.historicalResumeCheckpoint.frontiers.find(
      (frontier) => frontier.stateHash === expectedCurrentBoundaryStateHash,
    );
  assert.ok(priorFrontier,
    "Ticket 07 prior current-turn frontiers no longer contain the declared history");
  const terminalStage = fixture.stages[4];
  const currentMovement = generateWarmachineMovementActivationPredecessorsV1(
    terminalStage.plannedActivations[0].state,
    {
      sideKey: "player2",
      actorPieceKeys: [hysenePieceKey],
      actionTypes: ["run"],
      deployments: options.deployments,
      includeDeploymentSlotAlternatives: true,
      maximumDeploymentSlotOrigins: options.maximumDeploymentSlotOrigins,
      maximumDeploymentSlotRings: options.maximumDeploymentSlotRings,
      originProposals:
        options.movementOriginProposalsByTurnAndSide["3:player2"],
      maximumStrictCandidates: 1,
      maximumStrictCandidateAttempts: 4,
    },
  );
  assert.equal(currentMovement.strictCandidateCount > 0, true, JSON.stringify({
    rejected: currentMovement.rejected,
    unresolved: currentMovement.unresolved,
  }, null, 2));
  assert.equal(currentMovement.candidates[0].actionType, "run");
  currentMovementEvidence = {
    strictCandidateCount: currentMovement.strictCandidateCount,
    candidateKeys: currentMovement.publicCandidates.map((row) => row.candidateKey),
    predecessorStateHash: currentMovement.candidates[0].predecessorStateHash,
    expectedCurrentBoundaryStateHash,
  };
  const routeReplay = replayWarmachineTerminalReverseRouteV1(
    {
      candidateKey: "ticket07-current-turn-checkpoint-reissue-v1",
      predecessorState: priorFrontier.state,
      reverseEdges: priorFrontier.reverseEdges,
    },
    fixture.terminalState,
    { routeKey: "ticket07-current-turn-checkpoint-reissue-v1" },
  );
  assert.equal(routeReplay.ok, true, JSON.stringify(routeReplay.failures, null, 2));
  currentTurnCheckpoint = buildWarmachineTerminalRootedResumeCheckpointV1({
    terminalStateHash:
      warmachineReverseStateSemanticHashV1(fixture.terminalState),
    terminalCell: cell,
    deployments: options.deployments,
    rawOptions: options,
    deferredFrontiers: [priorFrontier],
    searchProgress: {
      unresolved: [stableGraphValue({
        reason: "current_turn_checkpoint_reissue_candidate_scope_not_reexpanded",
        sourceCheckpointHash: String(
          cachedCurrentTurnCheckpointWrapper.historicalResumeCheckpoint
            .checkpointHash || "",
        ),
        sourceUnresolvedCount: (
          cachedCurrentTurnCheckpointWrapper.historicalResumeCheckpoint
            .searchProgress?.unresolved || []
        ).length,
        sourceRejectedCount: (
          cachedCurrentTurnCheckpointWrapper.historicalResumeCheckpoint
            .searchProgress?.rejected || []
        ).length,
        detail: "The selected current-turn route was freshly strict-replayed under the current source, but alternate current-turn candidates were not re-expanded and remain unresolved.",
      })],
    },
  });
  const checkpointFixture = stableGraphValue({
    schemaVersion: "ticket07_score_current_turn_reverse_checkpoint_v1",
    contractHash,
    currentMovementEvidence,
    terminalReplayHash: terminalReplay.replayHash,
    currentRouteReissueReplayHash: routeReplay.replayHash,
    historicalResumeCheckpoint: currentTurnCheckpoint,
  });
  const temporaryPath = `${currentTurnCheckpointPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(checkpointFixture)}\n`);
  fs.renameSync(temporaryPath, currentTurnCheckpointPath);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    schemaVersion: "ticket07_score_current_turn_checkpoint_reissue_v1",
    contractHash,
    currentMovementStrictCandidateCount:
      currentMovementEvidence.strictCandidateCount,
    currentRouteReissueReplayHash: routeReplay.replayHash,
    replayedEdgeCount: routeReplay.replayedEdgeCount,
    freshStrictTransitionCount: routeReplay.freshStrictTransitionCount,
    checkpointHash: currentTurnCheckpoint.checkpointHash,
  }, null, 2)}\n`);
  process.exit(0);
}
if (!currentTurnCheckpoint) {
  const terminalStage = fixture.stages[4];
  const currentMovement = generateWarmachineMovementActivationPredecessorsV1(
    terminalStage.plannedActivations[0].state,
    {
      sideKey: "player2",
      actorPieceKeys: [hysenePieceKey],
      actionTypes: ["run"],
      deployments: options.deployments,
      includeDeploymentSlotAlternatives: true,
      maximumDeploymentSlotOrigins: options.maximumDeploymentSlotOrigins,
      maximumDeploymentSlotRings: options.maximumDeploymentSlotRings,
      originProposals:
        options.movementOriginProposalsByTurnAndSide["3:player2"],
      maximumStrictCandidates: 1,
      maximumStrictCandidateAttempts: 4,
      onProgress: (event) => {
        if (!event?.stage || !/started|accepted|complete|budget/.test(
          String(event.stage))) return;
        process.stderr.write(`${JSON.stringify({
          scope: "ticket07_hysene_movement_preflight",
          ...event,
        })}\n`);
      },
    },
  );
  assert.equal(currentMovement.strictCandidateCount > 0, true, JSON.stringify({
    rejected: currentMovement.rejected,
    unresolved: currentMovement.unresolved,
  }, null, 2));
  const expectedCurrentBoundaryStateHash =
    warmachineReverseStateSemanticHashV1(fixture.stages[3].state);
  currentMovementEvidence = {
    strictCandidateCount: currentMovement.strictCandidateCount,
    candidateKeys: currentMovement.publicCandidates.map((row) => row.candidateKey),
    predecessorStateHash: currentMovement.candidates[0].predecessorStateHash,
    expectedCurrentBoundaryStateHash,
  };
  const paused = searchWarmachineMaterializedTerminalRootToDeploymentV1({
    materialized,
    terminalCell: cell,
    rawOptions: { ...options, maximumReverseTurns: 0 },
  });
  assert.equal(paused.terminalReplay.strictReplayCertified, true);
  assert.equal(paused.currentTurnActivation.boundaryRouteCount > 0, true,
    JSON.stringify(paused.currentTurnActivation, null, 2));
  assert.equal(paused.control.strictCandidateCount > 0, true,
    JSON.stringify(paused.control, null, 2));
  const unselectedCurrentTurnCheckpoint = paused.search.runtimeResumeCheckpoint;
  assert.ok(unselectedCurrentTurnCheckpoint?.checkpointHash,
    JSON.stringify(paused.search, null, 2));
  currentTurnCheckpoint = selectDeclaredHistoricalFrontier(
    unselectedCurrentTurnCheckpoint,
    expectedCurrentBoundaryStateHash,
    { fixture, cell, options },
  );
  assert.equal(
    currentTurnCheckpoint.frontiers[0].stateHash,
    expectedCurrentBoundaryStateHash,
    "Ticket 07 combined current-turn reverse diverged from the declared historical boundary",
  );
  const checkpointFixture = stableGraphValue({
    schemaVersion: "ticket07_score_current_turn_reverse_checkpoint_v1",
    contractHash,
    currentMovementEvidence,
    terminalReplayHash: paused.terminalReplay.replayHash,
    historicalResumeCheckpoint: currentTurnCheckpoint,
  });
  fs.writeFileSync(currentTurnCheckpointPath,
    `${JSON.stringify(checkpointFixture)}\n`);
}

if (process.argv.includes("--preflight-current-turn")) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    schemaVersion: "ticket07_score_current_turn_preflight_v1",
    contractHash,
    currentMovementStrictCandidateCount:
      currentMovementEvidence.strictCandidateCount,
    checkpointHash: currentTurnCheckpoint.checkpointHash,
  }, null, 2)}\n`);
  process.exit(0);
}

if (process.argv.includes("--preflight-history")) {
  const movementCases = [
    {
      label: "player2_turn1_hysene",
      stageIndex: 0,
      plannedActivationIndex: 0,
      turnSideKey: "1:player2",
      sideKey: "player2",
      groupKey: hysenePieceKey,
      actorPieceKey: hysenePieceKey,
      successorState: fixture.stages[0].plannedActivations[0].state,
    },
    {
      label: "player2_turn2_hysene",
      stageIndex: 2,
      plannedActivationIndex: 0,
      turnSideKey: "2:player2",
      sideKey: "player2",
      groupKey: hysenePieceKey,
      actorPieceKey: hysenePieceKey,
      successorState: fixture.stages[2].plannedActivations[0].state,
    },
    {
      label: "player1_turn2_brutes_left40",
      stageIndex: 3,
      plannedActivationIndex: 0,
      turnSideKey: "2:player1",
      sideKey: "player1",
      groupKey: left40GroupKey,
      actorPieceKey: `${left40GroupKey}_1`,
      successorState: fixture.stages[3].plannedActivations[0].state,
    },
    {
      label: "player1_turn2_initiates_right40",
      stageIndex: 3,
      plannedActivationIndex: 1,
      turnSideKey: "2:player1",
      sideKey: "player1",
      groupKey: right40GroupKey,
      actorPieceKey: `${right40GroupKey}_1`,
      successorState: fixture.stages[3].plannedActivations[1].state,
    },
    {
      label: "player1_turn2_sepsira",
      stageIndex: 3,
      plannedActivationIndex: 2,
      turnSideKey: "2:player1",
      sideKey: "player1",
      groupKey: sepsiraPieceKey,
      actorPieceKey: sepsiraPieceKey,
      successorState: fixture.stages[3].plannedActivations[2].state,
    },
  ];
  function declaredMovementProposal(testCase) {
    const stage = fixture.stages[testCase.stageIndex];
    const planned = stage.plannedActivations[testCase.plannedActivationIndex];
    const predecessorState = testCase.plannedActivationIndex === 0
      ? (testCase.stageIndex === 0
        ? fixture.injectedOpeningState
        : fixture.stages[testCase.stageIndex - 1].state)
      : stage.plannedActivations[testCase.plannedActivationIndex - 1].state;
    const groupPieceKeys = planned.state.pieces.filter((piece) =>
      piece.pieceKey === testCase.groupKey ||
      piece.unitGroupId === testCase.groupKey).map((piece) => piece.pieceKey);
    assert.equal(groupPieceKeys.includes(testCase.actorPieceKey), true);
    const predecessorByKey = new Map(predecessorState.pieces.map((piece) => [
      piece.pieceKey,
      piece,
    ]));
    const successorByKey = new Map(planned.state.pieces.map((piece) => [
      piece.pieceKey,
      piece,
    ]));
    const pathsByModel = planned.movementEvidence?.pathsByModel || [];
    const actorPath = pathsByModel.find((row) =>
      row.pieceKey === testCase.actorPieceKey);
    return {
      proposalKey: `ticket07-declared-history-${testCase.label}`,
      actorPieceKey: testCase.actorPieceKey,
      actionType: "run",
      origin: predecessorByKey.get(testCase.actorPieceKey)?.position,
      originsByPieceKey: Object.fromEntries(groupPieceKeys.map((pieceKey) => [
        pieceKey,
        predecessorByKey.get(pieceKey)?.position,
      ])),
      destinationsByPieceKey: Object.fromEntries(groupPieceKeys.map((pieceKey) => [
        pieceKey,
        successorByKey.get(pieceKey)?.position,
      ])),
      waypoints: actorPath?.waypoints || [
        successorByKey.get(testCase.actorPieceKey)?.position,
      ],
      pathsByModel,
      proposalSource: "ticket07_declared_forward_history_v1",
      proposalPriority: -100,
      relationKind: "declared_forward_history_transition",
    };
  }
  const movementEvidence = movementCases.map((testCase) => {
    process.stderr.write(`${JSON.stringify({
      scope: "ticket07_history_movement_preflight",
      stage: "case_started",
      label: testCase.label,
    })}\n`);
    const declaredProposal = declaredMovementProposal(testCase);
    const generated = generateWarmachineMovementActivationPredecessorsV1(
      testCase.successorState,
      {
        sideKey: testCase.sideKey,
        actorPieceKeys: [testCase.actorPieceKey],
        actionTypes: ["run"],
        originProposals: [declaredProposal],
        deployments: options.deployments,
        includeDeploymentSlotAlternatives: true,
        maximumDeploymentSlotOrigins: options.maximumDeploymentSlotOrigins,
        maximumDeploymentSlotRings: options.maximumDeploymentSlotRings,
        maximumUnitMovementAnchorsPerGroup: 1,
        maximumStrictCandidates: 1,
        maximumStrictCandidateAttempts: 4,
      },
    );
    assert.equal(generated.strictCandidateCount > 0, true, JSON.stringify({
      label: testCase.label,
      rejected: generated.rejected,
      unresolved: generated.unresolved,
    }, null, 2));
    assert.equal(generated.candidates[0].movementProposal.proposalKey
      .startsWith(`${declaredProposal.proposalKey}:`), true, JSON.stringify({
      label: testCase.label,
      declaredProposal,
      selected: generated.publicCandidates,
      rejected: generated.rejected,
      unresolved: generated.unresolved,
    }, null, 2));
    assert.equal(
      generated.publicCandidates[0].movementProposal.actionType,
      "run",
      `${testCase.label} must preserve the strict run action type in public evidence`,
    );
    process.stderr.write(`${JSON.stringify({
      scope: "ticket07_history_movement_preflight",
      stage: "case_passed",
      label: testCase.label,
      strictCandidateCount: generated.strictCandidateCount,
    })}\n`);
    return {
      label: testCase.label,
      turnSideKey: testCase.turnSideKey,
      groupKey: testCase.groupKey,
      actorPieceKey: testCase.actorPieceKey,
      strictCandidateCount: generated.strictCandidateCount,
      candidateKey: generated.publicCandidates[0].candidateKey,
      movementProposal: generated.publicCandidates[0].movementProposal,
    };
  });
  const controlStart = currentTurnCheckpoint.frontiers[0].state;
  const previousEnd = generateWarmachinePreviousTurnEndPredecessorsV1(
    controlStart,
    {
      nextSideActivationRestoreModes: ["all_alive_activated"],
      includeRuntimeDiagnostics: true,
    },
  );
  const previousEndCandidate = previousEnd.candidates.find((candidate) =>
    candidate.endingTurnNumber === 2 &&
    candidate.endingSideKey === "player1");
  assert.ok(previousEndCandidate, JSON.stringify({
    rejected: previousEnd.rejected,
    unresolved: previousEnd.unresolved,
  }, null, 2));
  assert.deepEqual(previousEndCandidate.predecessorState.scenario.score, {
    player1: 0,
    player2: 0,
  });
  const proposalsByTurnAndSide = Object.fromEntries(
    [...new Set(movementEvidence.map((row) => row.turnSideKey))]
      .sort()
      .map((turnSideKey) => [
        turnSideKey,
        movementEvidence.filter((row) => row.turnSideKey === turnSideKey)
          .map((row, index) => ({
            ...row.movementProposal,
            actorPieceKey: row.actorPieceKey,
            proposalKey:
              `ticket07-history-${turnSideKey.replace(":", "-")}-seed-${
                index + 1}:${row.candidateKey}`,
            proposalSource:
              "ticket07_isolated_host_strict_movement_preflight_v1",
            proposalPriority: -100,
          })),
      ]),
  );
  const proposalBundleCore = {
    schemaVersion: "ticket07_history_movement_proposals_v2",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    fixtureHash: fixture.fixtureHash,
    proposalsByTurnAndSide,
    sourceCandidateKeys: movementEvidence.map((row) => row.candidateKey),
    claimBoundary: "These turn-and-side-scoped proposals are ordering seeds from isolated current-Host strict movement predecessor proofs. The combined activation sequence must execute each proposal again and match the complete successor; omitted proposals remain unresolved.",
  };
  const proposalBundle = {
    ...proposalBundleCore,
    proposalBundleHash: stableGraphHash(proposalBundleCore),
  };
  const proposalBundleTemporaryPath =
    `${historicalMovementProposalsPath}.tmp-${process.pid}`;
  fs.writeFileSync(proposalBundleTemporaryPath,
    `${JSON.stringify(proposalBundle, null, 2)}\n`);
  fs.renameSync(proposalBundleTemporaryPath, historicalMovementProposalsPath);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    schemaVersion: "ticket07_score_history_preflight_v1",
    movementEvidence,
    previousTurnSettlementCandidateKey: previousEndCandidate.candidateKey,
    previousTurnPredecessorScore:
      previousEndCandidate.predecessorState.scenario.score,
    proposalBundleHash: proposalBundle.proposalBundleHash,
  }, null, 2)}\n`);
  process.exit(0);
}

if (process.argv.includes("--preflight-turn-two-deployment-viability")) {
  const viability = searchWarmachineMaterializedTerminalRootToDeploymentV1({
    materialized,
    terminalCell: cell,
    rawOptions: {
      ...options,
      maximumReverseTurns: 1,
      historicalResumeCheckpoint: currentTurnCheckpoint,
    },
  });
  const frontier = (viability.search.runtimeReachedPriorTurnFrontiers || [])
    .find((row) => Number(row.reversedPriorTurnCount || 0) === 1);
  assert.ok(frontier, JSON.stringify({
    stage: "player1_turn2_deployment_viability",
    processedLabelCount: viability.search.processedLabelCount,
    expandedLabelCount: viability.search.expandedLabelCount,
    rejectedBranchCount: viability.rejectedBranchCount,
    unresolvedCount: viability.unresolvedCount,
    unresolvedReasons: [...new Set((viability.search.unresolved || []).map((row) =>
      String(row.reason || "")))].sort(),
  }, null, 2));
  process.stdout.write(`${JSON.stringify({
    ok: true,
    schemaVersion: "ticket07_turn_two_deployment_viability_preflight_v1",
    stateHash: frontier.stateHash,
    reversedPriorTurnCount: frontier.reversedPriorTurnCount,
    processedLabelCount: viability.search.processedLabelCount,
    expandedLabelCount: viability.search.expandedLabelCount,
    rejectedBranchCount: viability.rejectedBranchCount,
    unresolvedCount: viability.unresolvedCount,
  }, null, 2)}\n`);
  process.exit(0);
}

const historicalSearchOptions = {
  ...options,
  onSearchCheckpoint: (publication) => {
    writeGzipJsonAtomic(historicalResumeCheckpointPath, {
      schemaVersion: "ticket07_score_historical_resume_checkpoint_file_v1",
      contractHash,
      fixtureHash: fixture.fixtureHash,
      currentTurnCheckpointHash: currentTurnCheckpoint.checkpointHash,
      stage: publication.stage,
      processedLabelCount: publication.processedLabelCount,
      expandedLabelCount: publication.expandedLabelCount,
      checkpoint: publication.checkpoint,
    });
    process.stderr.write(`${JSON.stringify({
      scope: "ticket07_historical_checkpoint",
      stage: publication.stage,
      checkpointHash: publication.checkpoint.checkpointHash,
      frontierCount: publication.checkpoint.frontierCount,
      processedLabelCount: publication.processedLabelCount,
      expandedLabelCount: publication.expandedLabelCount,
    })}\n`);
  },
};
let historicalResumeCheckpoint = currentTurnCheckpoint;
if (fs.existsSync(historicalResumeCheckpointPath)) {
  const cached = readGzipJson(historicalResumeCheckpointPath);
  if (cached.contractHash === contractHash &&
      cached.fixtureHash === fixture.fixtureHash &&
      cached.currentTurnCheckpointHash ===
        currentTurnCheckpoint.checkpointHash) {
    const audit = auditWarmachineTerminalRootedResumeCheckpointV1(
      cached.checkpoint,
      {
        terminalStateHash:
          warmachineReverseStateSemanticHashV1(fixture.terminalState),
        terminalCell: cell,
        deployments: options.deployments,
        rawOptions: historicalSearchOptions,
      },
    );
    if (audit.ok) historicalResumeCheckpoint = cached.checkpoint;
  }
}
const result = searchWarmachineMaterializedTerminalRootToDeploymentV1({
  materialized,
  terminalCell: cell,
  rawOptions: {
    ...historicalSearchOptions,
    historicalResumeCheckpoint,
  },
});
const expectedBoundaryByReverseTurn = new Map([
  [1, fixture.stages[2].state],
  [2, fixture.stages[1].state],
  [3, fixture.stages[0].state],
  [4, fixture.injectedOpeningState],
]);
const frontierAudits = (result.search.runtimeReachedPriorTurnFrontiers || [])
  .map((frontier) => {
    const expected = expectedBoundaryByReverseTurn.get(
      Number(frontier.reversedPriorTurnCount || 0),
    );
    const deploymentAudit = auditWarmachineLegalDeploymentReachabilityV1(
      frontier.state,
      {
        firstPlayerSideKey: options.firstPlayerSideKey,
        deployments: options.deployments,
      },
    );
    return stableGraphValue({
      labelKey: frontier.labelKey,
      reversedPriorTurnCount: frontier.reversedPriorTurnCount,
      state: stateSummary(frontier.state),
      expectedStateHash: expected
        ? warmachineReverseStateSemanticHashV1(expected)
        : "",
      exactExpectedState: expected
        ? warmachineReverseStateSemanticHashV1(frontier.state) ===
          warmachineReverseStateSemanticHashV1(expected)
        : false,
      positionDifference: expected
        ? positionDifference(frontier.state, expected)
        : null,
      deploymentAudit: {
        ok: deploymentAudit.ok,
        failedChecks: deploymentAudit.failedChecks,
        lifecycleIssues: deploymentAudit.lifecycleIssues,
        activatedPieceKeys: deploymentAudit.activatedPieceKeys,
        deploymentGeometry: deploymentAudit.deploymentAudit || null,
      },
    });
  });
if (!result.ok) {
  const deepestRuntimeFrontier = [
    ...(result.search.runtimeReachedPriorTurnFrontiers || []),
  ].sort((left, right) =>
    Number(right.reversedPriorTurnCount || 0) -
      Number(left.reversedPriorTurnCount || 0) ||
    String(left.labelKey || "").localeCompare(String(right.labelKey || "")))[0] ||
    null;
  if (deepestRuntimeFrontier) {
    const deepestDeploymentAudit =
      auditWarmachineLegalDeploymentReachabilityV1(
        deepestRuntimeFrontier.state,
        {
          firstPlayerSideKey: options.firstPlayerSideKey,
          deployments: options.deployments,
        },
      );
    const deepestEvidence = stableGraphValue({
      schemaVersion: "ticket07_score_root_to_opening_deepest_frontier_v1",
      fixtureHash: fixture.fixtureHash,
      labelKey: deepestRuntimeFrontier.labelKey,
      reversedPriorTurnCount: deepestRuntimeFrontier.reversedPriorTurnCount,
      state: deepestRuntimeFrontier.state,
      reverseEdges: deepestRuntimeFrontier.reverseEdges,
      deploymentAudit: deepestDeploymentAudit,
    });
    fs.writeFileSync(
      reverseDeepestFrontierPath,
      gzipSync(Buffer.from(JSON.stringify(deepestEvidence))),
    );
  }
  const failure = stableGraphValue({
    schemaVersion: "ticket07_score_root_to_opening_failure_v1",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    fixtureHash: fixture.fixtureHash,
    terminalCellKey: cell.cellKey,
    currentTurnCheckpointHash: currentTurnCheckpoint.checkpointHash,
    resumeCheckpointAccepted: result.search.resumeCheckpoint?.accepted === true,
    routeLabelCount: result.search.routeLabelCount,
    reachedPriorTurnFrontierCount:
      result.search.reachedPriorTurnFrontierCount,
    processedLabelCount: result.search.processedLabelCount,
    expandedLabelCount: result.search.expandedLabelCount,
    legalDeploymentRouteCount: result.legalDeploymentRouteCount,
    unresolvedCount: result.unresolvedCount,
    rejectedBranchCount: result.rejectedBranchCount,
    unresolvedReasons: [...new Set((result.search.unresolved || []).map((row) =>
      String(row.reason || "")))].sort(),
    rejectedReasons: [...new Set((result.search.rejected || []).map((row) =>
      String(row.reason || "")))].sort(),
    deepestFrontierPath: deepestRuntimeFrontier
      ? reverseDeepestFrontierPath
      : "",
    frontierAudits,
  });
  fs.writeFileSync(reverseFailurePath, `${JSON.stringify(failure)}\n`);
  process.stderr.write(`${JSON.stringify({
    ok: false,
    failurePath: reverseFailurePath,
    routeLabelCount: failure.routeLabelCount,
    reachedPriorTurnFrontierCount: failure.reachedPriorTurnFrontierCount,
    deepestFrontier: frontierAudits.at(-1) || null,
  }, null, 2)}\n`);
}
assert.equal(result.ok, true, `ticket07_score_root_to_opening_failed:${reverseFailurePath}`);
assert.equal(result.legalDeploymentRouteCount > 0, true);
assert.equal(result.fullRouteStrictReplayCertifiedCount > 0, true);
assert.equal(result.oracleIsolationPassed, true);
const routeCandidateKeys = result.search.routes.map((route) =>
  String(route.candidateKey || ""));
const strictOpeningStateHashes = result.search.routes.map((route) =>
  String(route.predecessorStateHash || ""));
const reverseEdgeCounts = result.search.routes.map((route) =>
  (route.reverseEdges || []).length);
const fullRouteStrictReplayHashes = result.search.routes.map((route) =>
  String(route.fullRouteStrictReplay?.replayHash || ""));
assert.equal(routeCandidateKeys.every(Boolean), true);
assert.equal(strictOpeningStateHashes.every(Boolean), true);
assert.equal(reverseEdgeCounts.every((count) => count > 0), true);
assert.equal(fullRouteStrictReplayHashes.every(Boolean), true);
const selectedRoute = result.search.routes[0];
const sourceOpeningFixture = readJson(path.join(
  evidenceRoot,
  `${routeId}-opening-fixture-v1.json`,
));
const sourceOpening = sourceOpeningFixture.opening;
const strictRouteOpeningCore = stableGraphValue({
  schemaVersion: "warmachine_ticket09_strict_route_opening_v1",
  routeId,
  routeKey: selectedRoute.candidateKey,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  subjectRosterKey: fixture.subjectRosterKey,
  challengerRosterKey: fixture.challengerRosterKey,
  rosterPointLedger: sourceOpening.rosterPointLedger,
  physicalModelCount: selectedRoute.predecessorState.pieces.length,
  sourceOpeningKey: sourceOpening.openingKey,
  sourceOpeningStateHash: fixture.injectedOpeningStateHash,
  strictOpeningStateHash: selectedRoute.predecessorStateHash,
  strictDeploymentEvidenceHash: stableGraphHash(selectedRoute.deploymentAudit),
  strictReplayEvidenceHash: selectedRoute.fullRouteStrictReplay.replayHash,
  openingAddress: {
    subjectFactionKey: "Cryx",
    challengerFactionKey: "Fane of Nyrro",
    scenarioKey: sourceOpening.scenarioKey,
    mapKey: sourceOpening.mapKey,
    firstPlayerSideKey: "player2",
    deploymentSeedKey: `${routeId}_reverse_discovered`,
    physicalModelCount: selectedRoute.predecessorState.pieces.length,
  },
  deploymentAudit: selectedRoute.deploymentAudit,
  openingState: selectedRoute.predecessorState,
});
const strictRouteOpening = {
  ...strictRouteOpeningCore,
  openingEvidenceHash: stableGraphHash(strictRouteOpeningCore),
};
const strictRouteOpeningTemporaryPath =
  `${strictRouteOpeningPath}.tmp-${process.pid}`;
fs.writeFileSync(strictRouteOpeningTemporaryPath,
  `${JSON.stringify(strictRouteOpening)}\n`);
fs.renameSync(strictRouteOpeningTemporaryPath, strictRouteOpeningPath);
const semanticOutcomeCore = stableGraphValue({
  routeId,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  searchRunContractHash,
  fixtureHash: fixture.fixtureHash,
  terminalCellKey: cell.cellKey,
  terminalReplayHash: result.terminalReplay.replayHash,
  legalDeploymentRouteCount: result.legalDeploymentRouteCount,
  fullRouteStrictReplayCertifiedCount:
    result.fullRouteStrictReplayCertifiedCount,
  unresolvedCount: result.unresolvedCount,
  unresolvedLedgerHash: stableGraphHash(result.search.unresolved || []),
  rejectedBranchCount: result.rejectedBranchCount,
  rejectedLedgerHash: stableGraphHash(result.search.rejected || []),
  oracleIsolationPassed: result.oracleIsolationPassed,
  routeCandidateKeys,
  strictOpeningStateHashes,
  strictRouteOpeningEvidenceHash: strictRouteOpening.openingEvidenceHash,
  reverseEdgeCounts,
  fullRouteStrictReplayHashes,
});
const semanticOutcomeHash = stableGraphHash(semanticOutcomeCore);
const previousReport = fs.existsSync(reverseReportPath)
  ? readJson(reverseReportPath)
  : null;
const previousComparableSearchRunObserved =
  previousReport?.searchRunContractHash === searchRunContractHash;
if (previousComparableSearchRunObserved &&
    previousReport?.semanticOutcomeHash &&
    previousReport.fixtureHash === fixture.fixtureHash &&
    previousReport.hostReceiptHash === warmachineHost.receipt.receiptHash) {
  assert.equal(semanticOutcomeHash, previousReport.semanticOutcomeHash,
    "ticket07_resume_semantic_outcome_mismatch");
}
const reportCore = stableGraphValue({
  schemaVersion: "ticket07_score_root_to_opening_report_v3",
  ...semanticOutcomeCore,
  semanticOutcomeHash,
  currentTurnCheckpointHash: currentTurnCheckpoint.checkpointHash,
  searchExecutionReportHash: result.reportHash,
  previousComparableSearchRunObserved,
  previousEquivalentSemanticOutcomeObserved:
    previousComparableSearchRunObserved &&
    previousReport?.semanticOutcomeHash === semanticOutcomeHash,
});
const report = stableGraphValue({
  ...reportCore,
  reportHash: stableGraphHash(reportCore),
});
fs.writeFileSync(reverseReportPath, `${JSON.stringify(report)}\n`);
process.stdout.write(`${JSON.stringify({
  ok: true,
  routeId,
  ...report,
  reverseReportPath,
}, null, 2)}\n`);
