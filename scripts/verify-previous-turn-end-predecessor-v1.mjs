import assert from "node:assert/strict";

import { generateWarmachinePreviousTurnEndPredecessorsV1 } from
  "../src/reverse/previous-turn-end-predecessor-v1.mjs";
import {
  recoverWarmachineTerminalReverseRoutePrefixV1,
  reissueWarmachineTerminalReverseRouteV1,
  replayWarmachineTerminalReverseRouteV1,
} from
  "../src/reverse/replay-terminal-reverse-route-v1.mjs";
import {
  analyzeWarmachineSteamrollerSettlementDifferenceFeasibilityV1,
  auditWarmachineSteamrollerHistoricalSettlementV1,
  proposeWarmachineSteamrollerHistoricalSettlementRepairsV1,
} from
  "../src/reverse/steamroller-historical-settlement-audit-v1.mjs";
import { buildWarmachineSteamrollerTerminalScenarioCorpusV1 } from
  "../src/reverse/steamroller-terminal-scenario-corpus-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";
import {
  applyRulesV1Action,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  steamroller2026ScenarioProfiles,
} from "../src/warmachine-host-runtime.mjs";

function piece(pieceKey, sideKey, overrides = {}) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey,
    modelRole: "warrior",
    modelType: "warrior model",
    position: sideKey === "player1" ? { xIn: 10, yIn: 10 } : { xIn: 38, yIn: 38 },
    baseSizeIn: 1.18,
    defense: 12,
    armor: 16,
    damage: { boxesRemaining: 10, maxBoxes: 10 },
    resourceKind: "generic_resource",
    resourcePoints: 0,
    resourceMax: 0,
    statusTags: [],
    specialRules: [],
    activated: sideKey === "player1",
    cardSnapshot: { id: `card-${pieceKey}`, pointCostNumber: 0 },
    ...overrides,
  };
}

const steamrollerProfiles = steamroller2026ScenarioProfiles();
const steamrollerTerminalCorpus =
  buildWarmachineSteamrollerTerminalScenarioCorpusV1();
assert.equal(steamrollerProfiles.length, 7);
assert.equal(steamrollerTerminalCorpus.counts.scenarioCount, 7);
for (const profile of steamrollerProfiles) {
  const profileCells = steamrollerTerminalCorpus.cells.filter((cell) =>
    cell.scenarioKey === profile.scenarioKey);
  const terminalClasses = new Set(profileCells.map((cell) =>
    cell.terminalClassKey));
  assert.equal(terminalClasses.has("unique_leader_assassination"), true);
  assert.equal(terminalClasses.has("simultaneous_leader_tiebreak"), true);
  assert.equal(terminalClasses.has(
    "lead_three_after_opponent_turn_scoring"), true);
  assert.equal(terminalClasses.has("fixed_round_limit_result"),
    Number(profile.fixedRoundLimit || 0) > 0);

  const historicalState = (sideKey, points) => ({
    stateKey: `${profile.scenarioKey}-${sideKey}-historical-score-${points}`,
    activeSideKey: "player2",
    firstPlayerSideKey: "player2",
    turnNumber: 7,
    scenario: {
      packetKey: "steamroller-2026",
      packetYear: "2026",
      scenarioKey: profile.scenarioKey,
      scenarioName: profile.name,
      score: {
        player1: sideKey === "player1" ? points : 0,
        player2: sideKey === "player2" ? points : 0,
      },
      scoringHistory: [{
        key: `${profile.scenarioKey}-${sideKey}-${points}`,
        sequence: 1,
        round: 5,
        sideKey,
        points,
        scoringWindow: "turn_end:player2",
      }],
    },
  });
  const opponentLeadThreeAudit =
    auditWarmachineSteamrollerHistoricalSettlementV1(
      historicalState("player1", 3),
    );
  const opponentLeadTwoAudit =
    auditWarmachineSteamrollerHistoricalSettlementV1(
      historicalState("player1", 2),
    );
  const ownTurnLeadThreeAudit =
    auditWarmachineSteamrollerHistoricalSettlementV1(
      historicalState("player2", 3),
    );
  assert.equal(opponentLeadThreeAudit.ok, false,
    `${profile.name} reverse history must reject opponent-turn lead three`);
  assert.equal(opponentLeadTwoAudit.ok, true,
    `${profile.name} reverse history must retain opponent-turn lead two`);
  assert.equal(ownTurnLeadThreeAudit.ok, true,
    `${profile.name} reverse history must not invent own-turn scenario victory`);
}

const scoreOnlyRewriteWasFeasibleBeforeMandatoryRoundFourScore =
  analyzeWarmachineSteamrollerSettlementDifferenceFeasibilityV1({
    windows: [
      {
        windowKey: "round-3-player1-baseline",
        round: 3,
        endingSideKey: "player1",
        scoreGainBySide: { player1: 0, player2: 0 },
      },
      {
        windowKey: "round-4-player2-no-score",
        round: 4,
        endingSideKey: "player2",
        scoreGainBySide: { player1: 0, player2: 0 },
      },
      {
        windowKey: "round-4-player1-pressure-a",
        round: 4,
        endingSideKey: "player1",
        scoreGainBySide: { player1: 1, player2: 0 },
      },
      {
        windowKey: "round-5-player2-killbox-pressure-a",
        round: 5,
        endingSideKey: "player2",
        scoreGainBySide: { player1: 3, player2: 0 },
      },
    ],
  });
assert.equal(scoreOnlyRewriteWasFeasibleBeforeMandatoryRoundFourScore.ok, true);
assert.equal(scoreOnlyRewriteWasFeasibleBeforeMandatoryRoundFourScore.feasible,
  true);
assert.equal(
  scoreOnlyRewriteWasFeasibleBeforeMandatoryRoundFourScore
    .minimumInitialDifference,
  -2,
);
assert.equal(
  scoreOnlyRewriteWasFeasibleBeforeMandatoryRoundFourScore
    .maximumInitialDifference,
  -2,
);

const scoreOnlyRewriteAfterMandatoryRoundFourScore =
  analyzeWarmachineSteamrollerSettlementDifferenceFeasibilityV1({
    windows: [
      {
        windowKey: "round-3-player1-baseline",
        round: 3,
        endingSideKey: "player1",
        scoreGainBySide: { player1: 0, player2: 0 },
      },
      {
        windowKey: "round-4-player2-pressure-c",
        round: 4,
        endingSideKey: "player2",
        scoreGainBySide: { player1: 1, player2: 0 },
        sourceLedgerKeys: [
          "4:player1:scenario_terrain:pressure-c:turn_end:player2",
        ],
      },
      {
        windowKey: "round-4-player1-pressure-a",
        round: 4,
        endingSideKey: "player1",
        scoreGainBySide: { player1: 1, player2: 0 },
      },
      {
        windowKey: "round-5-player2-killbox-pressure-a",
        round: 5,
        endingSideKey: "player2",
        scoreGainBySide: { player1: 3, player2: 0 },
      },
    ],
  });
assert.equal(scoreOnlyRewriteAfterMandatoryRoundFourScore.ok, true);
assert.equal(scoreOnlyRewriteAfterMandatoryRoundFourScore.feasible, false);
assert.equal(scoreOnlyRewriteAfterMandatoryRoundFourScore.minimumInitialDifference,
  -2);
assert.equal(scoreOnlyRewriteAfterMandatoryRoundFourScore.maximumInitialDifference,
  -3);
assert.equal(scoreOnlyRewriteAfterMandatoryRoundFourScore.contradiction.reason,
  "fixed_settlement_windows_have_no_nonterminal_initial_score_difference");

const successor = normalizeRulesV1State({
  stateKey: "previous-turn-end-focus-pass-successor",
  activeSideKey: "player2",
  firstPlayerSideKey: "player2",
  phaseKey: "control",
  controlPhaseStepKey: "maintenance",
  turnNumber: 2,
  strictMode: true,
  enforceStrictExecutor: true,
  ruleAtomRuntimeMode: "authoritative",
  preGameRuleChoicesComplete: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    piece("p1-solo", "player1"),
    piece("p2-caster", "player2", {
      modelRole: "warcaster",
      modelType: "warcaster",
      isWarcaster: true,
      resourceKind: "focus",
      resourcePoints: 7,
      resourceMax: 7,
      arc: 7,
      canAllocateFocus: true,
    }),
    piece("p2-jack", "player2", {
      position: { xIn: 36, yIn: 38 },
      modelRole: "warjack",
      modelType: "warjack",
      isWarjack: true,
      resourceKind: "focus",
      resourceMax: 3,
      controllerPieceKey: "p2-caster",
    }),
  ],
  terrain: [],
  scenario: {
    zones: [],
    flags: [],
    objectives: [],
    score: { player1: 0, player2: 0 },
    scoringHistory: [],
  },
});
const reverse = generateWarmachinePreviousTurnEndPredecessorsV1(successor, {
  nextSideActivationRestoreModes: ["all_alive_activated"],
  maintenanceResourcePreimageModes: ["focus_battlegroup_control_pass_baseline"],
  recordMaintenanceResourcePreimageCoverageDebt: true,
  includeRuntimeDiagnostics: true,
});
assert.equal(reverse.strictCandidateCount, 1, JSON.stringify({
  rejected: reverse.rejected,
  unresolved: reverse.unresolved,
  diagnostics: reverse.runtimeDiagnostics,
}, null, 2));
assert.equal(reverse.strictRejectedCount, 0);
const candidate = reverse.candidates[0];
assert.equal(candidate.mutation.maintenanceResourcePreimage.mode,
  "focus_battlegroup_control_pass_baseline");
assert.deepEqual(candidate.mutation.maintenanceResourcePreimage.pointsByPieceKey, {
  "p2-caster": 7,
  "p2-jack": 1,
});
assert.equal(candidate.predecessorState.pieces.find((entry) =>
  entry.pieceKey === "p2-caster").resourcePoints, 7);
assert.equal(candidate.predecessorState.pieces.find((entry) =>
  entry.pieceKey === "p2-jack").resourcePoints, 1);
assert.equal(candidate.mutation.firstPlayerSideKey, "player2");
assert.equal(candidate.mutation.completedRound, true);
assert.equal(candidate.mutation.endingTurnNumber, 1);
assert.equal(candidate.predecessorState.turnNumber, 1);
assert.ok(reverse.unresolved.some((row) =>
  row.reason === "previous_turn_end_maintenance_resource_preimage_universe_deferred"));

const firstRoundSecondPlayerControlStart = normalizeRulesV1State({
  ...structuredClone(successor),
  stateKey: "previous-turn-end-first-round-second-player-control-start",
  activeSideKey: "player1",
  firstPlayerSideKey: "player2",
  turnNumber: 1,
  pieces: structuredClone(successor.pieces).map((entry) => ({
    ...entry,
    activated: entry.sideKey === "player2",
  })),
});
const firstRoundSecondPlayerReverse =
  generateWarmachinePreviousTurnEndPredecessorsV1(
    firstRoundSecondPlayerControlStart,
    {
      nextSideActivationRestoreModes: ["preserve_reset_state"],
      maintenanceResourcePreimageModes: ["preserve_cleanup_result"],
    },
  );
assert.equal(firstRoundSecondPlayerReverse.strictCandidateCount, 1,
  JSON.stringify(firstRoundSecondPlayerReverse.rejected));
const firstRoundSecondPlayerCandidate =
  firstRoundSecondPlayerReverse.candidates[0];
assert.equal(
  firstRoundSecondPlayerCandidate.mutation.activationRestoreMode,
  "preserve_reset_state",
);
assert.equal(firstRoundSecondPlayerCandidate.predecessorState.pieces
  .filter((entry) => entry.sideKey === "player1")
  .every((entry) => entry.activated === false), true);
assert.equal(firstRoundSecondPlayerCandidate.predecessorState.pieces
  .filter((entry) => entry.sideKey === "player2")
  .every((entry) => entry.activated === true), true);

const firstPlayerOneSuccessor = normalizeRulesV1State({
  ...structuredClone(successor),
  stateKey: "previous-turn-end-first-player-one-successor",
  firstPlayerSideKey: "player1",
  scenario: {
    ...structuredClone(successor.scenario),
    attackerSideKey: "player1",
    defenderSideKey: "player2",
  },
});
const firstPlayerOneReverse = generateWarmachinePreviousTurnEndPredecessorsV1(
  firstPlayerOneSuccessor,
  {
    nextSideActivationRestoreModes: ["all_alive_activated"],
    maintenanceResourcePreimageModes: [
      "focus_battlegroup_control_pass_baseline",
    ],
  },
);
assert.equal(firstPlayerOneReverse.strictCandidateCount, 1,
  JSON.stringify(firstPlayerOneReverse.rejected));
const firstPlayerOneCandidate = firstPlayerOneReverse.candidates[0];
assert.equal(firstPlayerOneCandidate.mutation.firstPlayerSideKey, "player1");
assert.equal(firstPlayerOneCandidate.mutation.completedRound, false);
assert.equal(firstPlayerOneCandidate.mutation.endingTurnNumber, 2);
assert.equal(firstPlayerOneCandidate.predecessorState.turnNumber, 2);

function scenarioTerrain(terrainKey, xIn, yIn) {
  return {
    terrainKey,
    type: "scenario terrain",
    isScenarioTerrain: true,
    scenarioTerrain: true,
    scenarioElement: true,
    xIn,
    yIn,
    widthIn: 2,
    heightIn: 2,
    sourceFlagKey: `${terrainKey}-flag`,
    scenarioTerrainSetupChoiceRequired: true,
    scenarioTerrainSetupChoiceResolved: true,
    scenarioTerrainFallbackUsed: true,
    scenarioTerrainSelectionCandidateKeys: [],
  };
}

const terminalBeforeSuccessorPredecessor = normalizeRulesV1State({
  stateKey: "previous-turn-end-must-not-cross-terminal-predecessor",
  activeSideKey: "player2",
  firstPlayerSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 2,
  strictMode: true,
  enforceStrictExecutor: true,
  ruleAtomRuntimeMode: "authoritative",
  preGameRuleChoicesComplete: true,
  board: { widthIn: 48, heightIn: 48 },
  deploymentBackEdgeBySide: { player1: "south", player2: "north" },
  pieces: [
    piece("p1-leader", "player1", {
      modelRole: "warcaster",
      modelType: "warcaster",
      isWarcaster: true,
      position: { xIn: 24, yIn: 24 },
    }),
    piece("p1-solo", "player1", {
      modelRole: "solo",
      modelType: "solo",
      position: { xIn: 8, yIn: 34 },
    }),
    piece("p2-leader", "player2", {
      modelRole: "warcaster",
      modelType: "warcaster",
      isWarcaster: true,
      position: { xIn: 40, yIn: 24 },
    }),
  ].map((entry) => ({ ...entry, activated: true })),
  terrain: [
    scenarioTerrain("pressure-a", 8, 34),
    scenarioTerrain("pressure-b", 16, 36),
    scenarioTerrain("pressure-c", 32, 12),
    scenarioTerrain("pressure-d", 40, 14),
  ],
  scenario: {
    packetKey: "steamroller-2026",
    packetYear: "2026",
    scenarioKey: "pressure_point",
    scenarioName: "Pressure Point",
    attackerSideKey: "player1",
    defenderSideKey: "player2",
    scoringStartSideKey: "player2",
    scoringStartTurnNumber: 2,
    score: { player1: 0, player2: 0 },
    scoringHistory: [],
    objectives: [{
      objectiveKey: "center-50",
      baseSizeMm: 50,
      xIn: 24,
      yIn: 24,
      active: true,
    }],
    caches: [],
  },
});
const terminalEnumeration = enumerateRulesV1Actions(
  terminalBeforeSuccessorPredecessor,
);
const terminalEndTurn = terminalEnumeration.actions.find((action) =>
  action.actionType === "end_turn");
assert.ok(terminalEndTurn, JSON.stringify(terminalEnumeration.rejectedActions));
const terminalTransition = applyRulesV1Action(
  terminalBeforeSuccessorPredecessor,
  terminalEndTurn,
);
assert.equal(terminalTransition.ok, true, terminalTransition.reason);
assert.ok(terminalTransition.events.some((event) =>
  event.eventType === "terminal" && event.winnerSideKey === "player1"));
assert.deepEqual(terminalTransition.nextState.scenario.score, {
  player1: 3,
  player2: 0,
});
const prematureSettlementAudit =
  auditWarmachineSteamrollerHistoricalSettlementV1(
    terminalTransition.nextState,
  );
assert.equal(prematureSettlementAudit.ok, false);
assert.equal(prematureSettlementAudit.prematureScenarioVictories.length, 1);
assert.equal(
  prematureSettlementAudit.prematureScenarioVictories[0].endingSideKey,
  "player2",
);
assert.equal(prematureSettlementAudit.prematureScenarioVictories[0].lead, 3);
const settlementRepairs =
  proposeWarmachineSteamrollerHistoricalSettlementRepairsV1(
    terminalTransition.nextState,
  );
assert.equal(settlementRepairs.candidateCount, 3);
assert.equal(settlementRepairs.candidates[0].removedPoints, 1);
assert.equal(settlementRepairs.candidates[0].removedLedgerKeys.length, 1);
const nonterminalSettlementState = structuredClone(terminalTransition.nextState);
nonterminalSettlementState.scenario.scoringHistory =
  nonterminalSettlementState.scenario.scoringHistory.filter((row) =>
    row.elementType !== "objective");
nonterminalSettlementState.scenario.score.player1 = 1;
const nonterminalSettlementAudit =
  auditWarmachineSteamrollerHistoricalSettlementV1(nonterminalSettlementState);
assert.equal(nonterminalSettlementAudit.ok, true);
const terminalBeforeSuccessorReverse =
  generateWarmachinePreviousTurnEndPredecessorsV1(
    terminalTransition.nextState,
    {
      nextSideActivationRestoreModes: ["all_alive_activated"],
      maintenanceResourcePreimageModes: ["preserve_cleanup_result"],
    },
  );
assert.equal(terminalBeforeSuccessorReverse.strictCandidateCount, 0,
  "an end-turn that already ended the game cannot lead to a continuing control state");
assert.ok(terminalBeforeSuccessorReverse.rejected.some((row) =>
  row.reason === "previous_turn_end_emitted_unexpected_terminal"));
const terminalPredecessorStateHash = warmachineReverseStateSemanticHashV1(
  terminalBeforeSuccessorPredecessor,
);
const terminalSuccessorStateHash = warmachineReverseStateSemanticHashV1(
  terminalTransition.nextState,
);
const prematureTerminalReplay = replayWarmachineTerminalReverseRouteV1({
  candidateKey: "premature-terminal-route",
  predecessorState: terminalBeforeSuccessorPredecessor,
  predecessorStateHash: terminalPredecessorStateHash,
  reverseEdges: [{
    candidateKey: "premature-terminal-edge",
    operatorKey: "previous_turn_end_inverse_v1",
    layerKey: "previous_turn",
    predecessorStateHash: terminalPredecessorStateHash,
    successorStateHash: terminalSuccessorStateHash,
    transitionActionKey: terminalEndTurn.actionKey,
    strictReplaySteps: [{
      actionKey: terminalEndTurn.actionKey,
      actionType: "end_turn",
      actionPatch: {},
    }],
  }],
}, terminalTransition.nextState);
assert.equal(prematureTerminalReplay.ok, false,
  "whole-route replay must reject a terminal emitted by a historical edge");
assert.ok(prematureTerminalReplay.failures.some((row) =>
  row.reason === "full_route_replay_unexpected_early_terminal"));
const prematureTerminalRoute = {
  candidateKey: "premature-terminal-route",
  predecessorState: terminalBeforeSuccessorPredecessor,
  predecessorStateHash: terminalPredecessorStateHash,
  reverseEdges: [{
    candidateKey: "premature-terminal-edge",
    operatorKey: "previous_turn_end_inverse_v1",
    layerKey: "previous_turn",
    predecessorStateHash: terminalPredecessorStateHash,
    successorStateHash: terminalSuccessorStateHash,
    transitionActionKey: terminalEndTurn.actionKey,
    strictReplaySteps: [{
      actionKey: terminalEndTurn.actionKey,
      actionType: "end_turn",
      actionPatch: {},
    }],
  }],
};
const prematureTerminalReissue = reissueWarmachineTerminalReverseRouteV1(
  prematureTerminalRoute,
  terminalTransition.nextState,
);
assert.equal(prematureTerminalReissue.ok, false);
assert.ok(prematureTerminalReissue.failures.some((row) =>
  row.reason === "current_host_route_reissue_unexpected_early_terminal"));
const prematureTerminalPrefixRecovery =
  recoverWarmachineTerminalReverseRoutePrefixV1(
    prematureTerminalRoute,
    0,
  );
assert.equal(prematureTerminalPrefixRecovery.ok, false);
assert.ok(prematureTerminalPrefixRecovery.failures.some((row) =>
  row.reason === "reverse_route_prefix_unexpected_early_terminal"));

const declaredTerminalReplay = replayWarmachineTerminalReverseRouteV1({
  candidateKey: "declared-score-terminal-route",
  predecessorState: terminalBeforeSuccessorPredecessor,
  predecessorStateHash: terminalPredecessorStateHash,
  reverseEdges: [{
    candidateKey: "declared-score-terminal-edge",
    operatorKey: "scenario_score_turn_end_inverse_v1",
    layerKey: "victory_event",
    predecessorStateHash: terminalPredecessorStateHash,
    successorStateHash: terminalSuccessorStateHash,
    transitionActionKey: terminalEndTurn.actionKey,
    strictReplaySteps: [{
      actionKey: terminalEndTurn.actionKey,
      actionType: "end_turn",
      actionPatch: {},
    }],
  }],
}, terminalTransition.nextState);
assert.equal(declaredTerminalReplay.ok, true,
  JSON.stringify(declaredTerminalReplay.failures, null, 2));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_previous_turn_end_predecessor_v1",
  strictCandidateCount: reverse.strictCandidateCount,
  resourcePreimage: candidate.mutation.maintenanceResourcePreimage,
  strictReceiptHash: candidate.strictReceiptHash,
  roleCases: {
    firstPlayerTwo: {
      completedRound: candidate.mutation.completedRound,
      endingTurnNumber: candidate.mutation.endingTurnNumber,
    },
    firstPlayerOne: {
      completedRound: firstPlayerOneCandidate.mutation.completedRound,
      endingTurnNumber: firstPlayerOneCandidate.mutation.endingTurnNumber,
    },
    firstRoundSecondPlayer: {
      activationRestoreMode:
        firstRoundSecondPlayerCandidate.mutation.activationRestoreMode,
      nextSideActivatedPieceCount:
        firstRoundSecondPlayerCandidate.predecessorState.pieces.filter((entry) =>
          entry.sideKey === "player1" && entry.activated === true).length,
    },
  },
  unexpectedTerminalRejected:
    terminalBeforeSuccessorReverse.strictRejectedCount,
  prematureSettlementAuditRejected: !prematureSettlementAudit.ok,
  settlementRepairCandidateCount: settlementRepairs.candidateCount,
  nonterminalSettlementAuditAccepted: nonterminalSettlementAudit.ok,
  prematureTerminalReplayRejected: !prematureTerminalReplay.ok,
  prematureTerminalReissueRejected: !prematureTerminalReissue.ok,
  prematureTerminalPrefixRecoveryRejected:
    !prematureTerminalPrefixRecovery.ok,
  declaredTerminalReplayCertified: declaredTerminalReplay.ok,
  reportHash: reverse.reportHash,
}, null, 2));
