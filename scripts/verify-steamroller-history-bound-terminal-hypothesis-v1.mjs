import assert from "node:assert/strict";

import { enumerateWarmachineBenchmarkActionsV2 } from
  "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import {
  buildWarmachineSteamrollerScoreTerminalAnchorProposalV1,
  buildWarmachineSteamrollerScoreTerminalAnchorProposalsV1,
} from "../src/reverse/steamroller-score-terminal-anchor-proposals-v1.mjs";
import {
  buildWarmachineSteamrollerHistoryBoundTerminalDomainV1,
  certifyWarmachineStrictSettlementHistoryBindingV1,
  matchWarmachineReverseBranchToHistoryBoundTerminalPresetV1,
} from "../src/reverse/steamroller-history-bound-terminal-hypothesis-v1.mjs";
import { expandWarmachineStrictPolicyStepV1 } from
  "../src/search/strict-policy-step-v1.mjs";

function source({
  sideKey,
  points,
  elementType,
  elementKey,
  sourceFamilyKey = "",
  sourceKey = "",
  scoringWindow = "",
  sourceActionType,
  sourceEventType,
  reason,
  geometryRequirement,
}) {
  return {
    scoringSideKey: sideKey,
    points,
    elementType,
    elementKey,
    sourceFamilyKey,
    ...(sourceKey ? { sourceKey } : {}),
    ...(scoringWindow ? { scoringWindow } : {}),
    ...(sourceActionType !== undefined ? { sourceActionType } : {}),
    ...(sourceEventType !== undefined ? { sourceEventType } : {}),
    ...(reason !== undefined ? { reason } : {}),
    ...(geometryRequirement ? { geometryRequirement } : {}),
  };
}

function executeEndTurn(predecessorState, actionPatch = {}, routeKey = "focused") {
  const scoped = enumerateWarmachineBenchmarkActionsV2(predecessorState, {
    includeActorlessActions: true,
    actionFamilyKeys: ["timing"],
  });
  const action = scoped.enumeration.actions.find((candidate) =>
    candidate.actionType === "end_turn");
  assert.ok(action, `${routeKey}: end_turn must be legal`);
  const step = expandWarmachineStrictPolicyStepV1(
    predecessorState,
    () => ({
      scoped,
      action,
      deterministicAction: true,
      nextPolicyCursor: 1,
      actionPatch,
    }),
    { routeKey, perspectiveSideKey: "player1" },
  );
  assert.equal(step.stepType, "deterministic", routeKey);
  assert.equal(step.successor.transitionAccepted, true, routeKey);
  return { action, step };
}

function sourceFamilyForObservedRow(state = {}, row = {}) {
  if (row.elementType === "killbox") return "kill_box_penalty";
  if (row.elementType === "objective") {
    const objective = (state.scenario?.objectives || []).find((entry) =>
      entry.objectiveKey === row.elementKey);
    return Number(objective?.baseSizeMm || 0) === 50
      ? "objective_50"
      : "objective_40";
  }
  if (row.elementType === "scenario_terrain") {
    return "scenario_terrain_own";
  }
  return "ledger_row_derived";
}

function presetSourceForObservedRow(state = {}, row = {}, events = []) {
  const killBoxEvent = row.elementType === "killbox"
    ? events.find((event) => event.eventType === "killbox_penalty" &&
      event.leaderPieceKey === row.elementKey)
    : null;
  return source({
    sideKey: row.sideKey,
    points: row.points,
    elementType: row.elementType,
    elementKey: row.elementKey,
    sourceFamilyKey: sourceFamilyForObservedRow(state, row),
    sourceKey: row.key,
    scoringWindow: row.scoringWindow,
    sourceActionType: row.sourceActionType,
    sourceEventType: row.sourceEventType,
    reason: row.reason,
    geometryRequirement: killBoxEvent ? {
      relationKind: "ending_side_leader_inside_own_kill_box",
      endingSideKey: killBoxEvent.sideKey,
      benefitingSideKey: killBoxEvent.scoringSideKey,
      leaderPieceKey: killBoxEvent.leaderPieceKey,
      ownTableEdgeKey: killBoxEvent.ownTableEdgeKey,
      maximumDistanceIn: killBoxEvent.killBoxDistanceIn,
      baseDistanceIn: killBoxEvent.killBoxBaseDistanceIn,
      extensionIn: killBoxEvent.killBoxExtensionIn,
      observedCompleteBaseDistanceFromOwnEdgeIn:
        killBoxEvent.completeBaseDistanceFromOwnEdgeIn,
    } : null,
  });
}

const assassinationTerminal = {
  terminalHypothesisKey: "ticket-06-vordak-assassination",
  terminalClassKey: "unique_leader_assassination",
  scenarioKey: "pressure_point",
  mapKey: "pressure-point-fixed-map",
  terminalRound: 7,
  endingSideKey: "player2",
  winnerSideKey: "player2",
  loserSideKey: "player1",
};

const fixedSuffixDomain = buildWarmachineSteamrollerHistoryBoundTerminalDomainV1({
  terminalHypothesis: assassinationTerminal,
  scoreBeforeHistoryCells: [{
    scoreBeforeHistoryCellKey: "counterlead-zero-two",
    scoreBySide: { player1: 0, player2: 2 },
  }],
  settlementWindowDomains: [
    {
      windowKey: "round-3-player1-baseline",
      round: 3,
      endingSideKey: "player1",
      alternatives: [{ alternativeKey: "no-score", sources: [] }],
    },
    {
      windowKey: "round-4-player2-pressure-c-choice",
      round: 4,
      endingSideKey: "player2",
      alternatives: [
        { alternativeKey: "pressure-c-absent", sources: [] },
        {
          alternativeKey: "pressure-c-controlled",
          sources: [source({
            sideKey: "player1",
            points: 1,
            elementType: "scenario_terrain",
            elementKey: "pressure-c",
            sourceFamilyKey: "scenario_terrain_opponent",
          })],
        },
      ],
    },
    {
      windowKey: "round-4-player1-pressure-a",
      round: 4,
      endingSideKey: "player1",
      alternatives: [{
        alternativeKey: "pressure-a-controlled",
        sources: [source({
          sideKey: "player1",
          points: 1,
          elementType: "scenario_terrain",
          elementKey: "pressure-a",
          sourceFamilyKey: "scenario_terrain_own",
        })],
      }],
    },
    {
      windowKey: "round-5-player2-killbox-pressure-a",
      round: 5,
      endingSideKey: "player2",
      alternatives: [{
        alternativeKey: "killbox-and-pressure-a",
        sources: [
          source({
            sideKey: "player1",
            points: 2,
            elementType: "killbox",
            elementKey: "player2-leader",
            sourceFamilyKey: "kill_box_penalty",
          }),
          source({
            sideKey: "player1",
            points: 1,
            elementType: "scenario_terrain",
            elementKey: "pressure-a",
            sourceFamilyKey: "scenario_terrain_own",
          }),
        ],
      }],
    },
  ],
});

assert.equal(fixedSuffixDomain.ok, true);
assert.equal(fixedSuffixDomain.counts.totalCandidateMass, "2");
assert.equal(fixedSuffixDomain.counts.generatedPresetCount, "1");
assert.equal(fixedSuffixDomain.counts.mathematicallyExcludedCount, "1");
assert.equal(fixedSuffixDomain.counts.budgetDeferredCount, "0");
assert.equal(fixedSuffixDomain.candidateMassConserved, true);
assert.equal(fixedSuffixDomain.presets[0].settlementWindows[1].alternativeKey,
  "pressure-c-absent");
const rejectedPressureC = fixedSuffixDomain.mathematicallyExcluded.find((row) =>
  row.settlementAlternativeKeys.includes("pressure-c-controlled"));
assert.ok(rejectedPressureC);
assert.equal(rejectedPressureC.reason,
  "fixed_settlement_windows_have_no_nonterminal_initial_score_difference");
const killBoxSource = fixedSuffixDomain.presets[0].settlementWindows.at(-1)
  .sources.find((row) => row.sourceFamilyKey === "kill_box_penalty");
assert.equal(killBoxSource.geometryRequirement.relationKind,
  "ending_side_leader_inside_own_kill_box");
assert.equal(killBoxSource.geometryRequirement.endingSideKey, "player2");

const prematureFourZeroDomain =
  buildWarmachineSteamrollerHistoryBoundTerminalDomainV1({
    terminalHypothesis: assassinationTerminal,
    scoreBeforeHistoryCells: [{
      scoreBeforeHistoryCellKey: "ticket06-premature-three-zero",
      scoreBySide: { player1: 3, player2: 0 },
    }],
    settlementWindowDomains: [{
      windowKey: "ticket06-player2-end-produces-four-zero",
      round: 4,
      endingSideKey: "player2",
      alternatives: [{
        alternativeKey: "pressure-c-produces-premature-terminal",
        sources: [source({
          sideKey: "player1",
          points: 1,
          elementType: "scenario_terrain",
          elementKey: "pressure-c",
          sourceFamilyKey: "scenario_terrain_opponent",
        })],
      }],
    }],
  });
assert.equal(prematureFourZeroDomain.presets.length, 0);
assert.equal(prematureFourZeroDomain.mathematicallyExcluded.length, 1);
assert.equal(
  prematureFourZeroDomain.mathematicallyExcluded[0].reason,
  "history_bound_terminal_earlier_scenario_victory",
);

const allScenarioAnchors =
  buildWarmachineSteamrollerScoreTerminalAnchorProposalsV1();
assert.equal(allScenarioAnchors.length, 7);
const anchor = allScenarioAnchors.find((row) =>
  row.hostScenarioKey === "pressure_point") ||
  buildWarmachineSteamrollerScoreTerminalAnchorProposalV1("pressure_point");
const predecessorState = structuredClone(anchor.predecessorState);
predecessorState.stateKey = "history-bound-pressure-point-predecessor";
predecessorState.scenario.score = { player1: 0, player2: 0 };
predecessorState.scenario.scoringHistory = [];
const pressurePointExecution = executeEndTurn(
  predecessorState,
  {},
  "history-bound-focused-source",
);
const endTurn = pressurePointExecution.action;
const strictStep = pressurePointExecution.step;
assert.deepEqual(strictStep.successor.state.scenario.score, {
  player1: 2,
  player2: 0,
});

const oneWindowDomain = buildWarmachineSteamrollerHistoryBoundTerminalDomainV1({
  terminalHypothesis: assassinationTerminal,
  scoreBeforeHistoryCells: [{ scoreBySide: { player1: 0, player2: 0 } }],
  settlementWindowDomains: [{
    windowKey: "round-3-player2-center-objective",
    round: 3,
    endingSideKey: "player2",
    alternatives: [{
      alternativeKey: "player1-controls-center",
      sources: [source({
        sideKey: "player1",
        points: 2,
        elementType: "objective",
        elementKey: "center-50",
        sourceFamilyKey: "objective_50",
      })],
    }],
  }],
});
assert.equal(oneWindowDomain.presets.length, 1);
const match = matchWarmachineReverseBranchToHistoryBoundTerminalPresetV1({
  preset: oneWindowDomain.presets[0],
  settlementTransitions: [{
    windowKey: "round-3-player2-center-objective",
    predecessorState,
    successorState: strictStep.successor.state,
    actionKey: endTurn.actionKey,
    actionPatch: {},
  }],
});
assert.equal(match.ok, true, JSON.stringify(match.mismatches, null, 2));
assert.equal(match.branchCanAttachToPreset, true);
assert.equal(match.strictCertifiedWindowCount, 1);
assert.equal(match.geometryObligationsCertifiedByHost, 1);
const observedStrictBinding = certifyWarmachineStrictSettlementHistoryBindingV1({
  terminalHypothesis: assassinationTerminal,
  settlementTransitions: [{
    windowKey: "round-3-player2-center-objective",
    predecessorState,
    successorState: strictStep.successor.state,
    actionKey: endTurn.actionKey,
    actionPatch: {},
  }],
});
assert.equal(observedStrictBinding.ok, true,
  JSON.stringify(observedStrictBinding.failures, null, 2));
assert.equal(observedStrictBinding.strictCertified, true);
assert.equal(observedStrictBinding.preset.finalScore.player1, 2);
assert.equal(observedStrictBinding.preset.finalScore.player2, 0);
assert.equal(observedStrictBinding.branchMatch.strictCertifiedWindowCount, 1);

const positionMismatchPredecessor = structuredClone(predecessorState);
positionMismatchPredecessor.stateKey = "history-bound-position-mismatch";
positionMismatchPredecessor.pieces.find((piece) =>
  piece.sideKey === "player1").position = { xIn: 4, yIn: 4 };
const positionMismatch = matchWarmachineReverseBranchToHistoryBoundTerminalPresetV1({
  preset: oneWindowDomain.presets[0],
  settlementTransitions: [{
    windowKey: "round-3-player2-center-objective",
    predecessorState: positionMismatchPredecessor,
    successorState: strictStep.successor.state,
    actionPatch: {},
  }],
});
assert.equal(positionMismatch.ok, false);
assert.equal(positionMismatch.branchCanAttachToPreset, false);
assert.ok(positionMismatch.mismatches.some((row) =>
  row.reason === "history_bound_terminal_successor_state_mismatch"));

const scenarioCoverage = [];
for (const scenarioAnchor of allScenarioAnchors) {
  const scenarioKey = scenarioAnchor.hostScenarioKey;
  const state = structuredClone(scenarioAnchor.predecessorState);
  state.stateKey = `history-bound-seven-scenario-${scenarioKey}`;
  state.scenario.score = { player1: 0, player2: 0 };
  state.scenario.scoringHistory = [];
  const execution = executeEndTurn(
    state,
    scenarioAnchor.actionPatch || {},
    `history-bound-seven-scenario:${scenarioKey}`,
  );
  const successor = execution.step.successor.state;
  const rows = successor.scenario.scoringHistory || [];
  assert.equal(rows.length > 0, true, `${scenarioKey}: scoring rows required`);
  const domain = buildWarmachineSteamrollerHistoryBoundTerminalDomainV1({
    terminalHypothesis: {
      ...assassinationTerminal,
      terminalHypothesisKey: `seven-scenario-assassination:${scenarioKey}`,
      scenarioKey,
      mapKey: `${scenarioKey}-official-map`,
    },
    scoreBeforeHistoryCells: [{ scoreBySide: { player1: 0, player2: 0 } }],
    settlementWindowDomains: [{
      windowKey: `${scenarioKey}-round-3-player2-settlement`,
      round: 3,
      endingSideKey: "player2",
      alternatives: [{
        alternativeKey: `${scenarioKey}-observed-source-set`,
        sources: rows.map((row) => presetSourceForObservedRow(
          state,
          row,
          execution.step.successor.runtimeReceipt?.events || [],
        )),
      }],
    }],
  });
  assert.equal(domain.presets.length, 1, scenarioKey);
  const strictMatch = matchWarmachineReverseBranchToHistoryBoundTerminalPresetV1({
    preset: domain.presets[0],
    settlementTransitions: [{
      windowKey: `${scenarioKey}-round-3-player2-settlement`,
      predecessorState: state,
      successorState: successor,
      actionKey: execution.action.actionKey,
      actionPatch: scenarioAnchor.actionPatch || {},
    }],
  });
  assert.equal(strictMatch.ok, true,
    `${scenarioKey}: ${JSON.stringify(strictMatch.mismatches)}`);

  const movedState = structuredClone(state);
  movedState.stateKey = `history-bound-seven-scenario-moved:${scenarioKey}`;
  movedState.pieces.find((piece) => piece.sideKey === "player1").position = {
    xIn: 4,
    yIn: 4,
  };
  const movedMismatch =
    matchWarmachineReverseBranchToHistoryBoundTerminalPresetV1({
      preset: domain.presets[0],
      settlementTransitions: [{
        windowKey: `${scenarioKey}-round-3-player2-settlement`,
        predecessorState: movedState,
        successorState: successor,
        actionPatch: scenarioAnchor.actionPatch || {},
      }],
    });
  assert.equal(movedMismatch.ok, false, `${scenarioKey}: moved branch must fail`);
  scenarioCoverage.push({
    scenarioKey,
    sourceKeys: rows.map((row) => row.key),
    strictMatchHash: strictMatch.matchHash,
    movedMismatchReasons: movedMismatch.mismatches.map((row) => row.reason),
  });
}
assert.equal(new Set(scenarioCoverage.map((row) => row.scenarioKey)).size, 7);

const killBoxState = structuredClone(anchor.predecessorState);
killBoxState.stateKey = "history-bound-killbox-inside";
killBoxState.scenario.score = { player1: 0, player2: 0 };
killBoxState.scenario.scoringHistory = [];
killBoxState.pieces.find((piece) => piece.sideKey === "player2").position = {
  xIn: 44,
  yIn: 44,
};
const killBoxExecution = executeEndTurn(
  killBoxState,
  {},
  "history-bound-killbox-inside",
);
const killBoxSuccessor = killBoxExecution.step.successor.state;
const killBoxRows = killBoxSuccessor.scenario.scoringHistory || [];
assert.deepEqual(killBoxSuccessor.scenario.score, { player1: 4, player2: 0 });
assert.equal(killBoxRows.some((row) => row.elementType === "killbox"), true);
assert.equal(killBoxExecution.step.successor.terminalEvents.length, 1);
const scoreTerminalDomain =
  buildWarmachineSteamrollerHistoryBoundTerminalDomainV1({
    terminalHypothesis: {
      terminalHypothesisKey: "pressure-point-killbox-score-terminal",
      terminalClassKey: "lead_three_after_opponent_turn_scoring",
      scenarioKey: "pressure_point",
      mapKey: "pressure-point-official-map",
      terminalRound: 3,
      endingSideKey: "player2",
      winnerSideKey: "player1",
      loserSideKey: "player2",
    },
    scoreBeforeHistoryCells: [{ scoreBySide: { player1: 0, player2: 0 } }],
    settlementWindowDomains: [{
      windowKey: "pressure-point-round-3-killbox-terminal",
      round: 3,
      endingSideKey: "player2",
      alternatives: [{
        alternativeKey: "objective-plus-killbox",
        sources: killBoxRows.map((row) => presetSourceForObservedRow(
          killBoxState,
          row,
          killBoxExecution.step.successor.runtimeReceipt?.events || [],
        )),
      }],
    }],
  });
assert.equal(scoreTerminalDomain.presets.length, 1);
const killBoxPresetSource = scoreTerminalDomain.presets[0].settlementWindows[0]
  .sources.find((row) => row.elementType === "killbox");
assert.equal(killBoxPresetSource.scoringWindow, "turn_end:player2:killbox");
assert.equal(killBoxPresetSource.geometryRequirement.ownTableEdgeKey, "north");
assert.equal(killBoxPresetSource.geometryRequirement.maximumDistanceIn, 12);
assert.equal(
  killBoxPresetSource.geometryRequirement.observedCompleteBaseDistanceFromOwnEdgeIn,
  4.8,
);
const killBoxMatch = matchWarmachineReverseBranchToHistoryBoundTerminalPresetV1({
  preset: scoreTerminalDomain.presets[0],
  settlementTransitions: [{
    windowKey: "pressure-point-round-3-killbox-terminal",
    predecessorState: killBoxState,
    successorState: killBoxSuccessor,
    actionKey: killBoxExecution.action.actionKey,
    actionPatch: {},
  }],
});
assert.equal(killBoxMatch.ok, true, JSON.stringify(killBoxMatch.mismatches));
const certifiedKillBoxEvent = killBoxMatch.strictSettlementWitnesses[0]
  .sourceEvidenceEvents.find((row) =>
    row.event.eventType === "killbox_penalty").event;
assert.equal(certifiedKillBoxEvent.ownTableEdgeKey, "north");
assert.equal(certifiedKillBoxEvent.completeBaseDistanceFromOwnEdgeIn, 4.8);

const outsideKillBoxState = structuredClone(killBoxState);
outsideKillBoxState.stateKey = "history-bound-killbox-outside";
outsideKillBoxState.pieces.find((piece) => piece.sideKey === "player2").position = {
  xIn: 44,
  yIn: 30,
};
const outsideKillBoxExecution = executeEndTurn(
  outsideKillBoxState,
  {},
  "history-bound-killbox-outside",
);
assert.equal(outsideKillBoxExecution.step.successor.state.scenario.scoringHistory
  .some((row) => row.elementType === "killbox"), false);
const outsideKillBoxMismatch =
  matchWarmachineReverseBranchToHistoryBoundTerminalPresetV1({
    preset: scoreTerminalDomain.presets[0],
    settlementTransitions: [{
      windowKey: "pressure-point-round-3-killbox-terminal",
      predecessorState: outsideKillBoxState,
      successorState: outsideKillBoxExecution.step.successor.state,
      actionPatch: {},
    }],
  });
assert.equal(outsideKillBoxMismatch.ok, false);

const preKillBoxTimingState = structuredClone(killBoxState);
preKillBoxTimingState.stateKey = "history-bound-killbox-before-start";
preKillBoxTimingState.turnNumber = 1;
const preKillBoxTimingExecution = executeEndTurn(
  preKillBoxTimingState,
  {},
  "history-bound-killbox-before-start",
);
assert.equal(preKillBoxTimingExecution.step.successor.state.scenario.scoringHistory
  .some((row) => row.elementType === "killbox"), false);

const wolvesAnchor = allScenarioAnchors.find((row) =>
  row.hostScenarioKey === "wolves_at_our_heels");
const wolvesExtendedState = structuredClone(wolvesAnchor.predecessorState);
wolvesExtendedState.stateKey = "history-bound-wolves-extended-killbox";
wolvesExtendedState.turnNumber = 4;
wolvesExtendedState.scenario.score = { player1: 0, player2: 0 };
wolvesExtendedState.scenario.scoringHistory = [];
wolvesExtendedState.pieces.find((piece) => piece.sideKey === "player2").position = {
  xIn: 44,
  yIn: 33,
};
const wolvesExtendedExecution = executeEndTurn(
  wolvesExtendedState,
  wolvesAnchor.actionPatch || {},
  "history-bound-wolves-extended-killbox",
);
const wolvesKillBoxEvent = wolvesExtendedExecution.step.successor.runtimeReceipt.events
  .find((event) => event.eventType === "killbox_penalty");
assert.ok(wolvesKillBoxEvent);
assert.equal(wolvesKillBoxEvent.killBoxBaseDistanceIn, 12);
assert.equal(wolvesKillBoxEvent.killBoxExtensionIn, 4);
assert.equal(wolvesKillBoxEvent.killBoxDistanceIn, 16);
assert.equal(wolvesKillBoxEvent.completeBaseDistanceFromOwnEdgeIn, 15.8);

const normalDistanceState = structuredClone(anchor.predecessorState);
normalDistanceState.stateKey = "history-bound-normal-killbox-distance";
normalDistanceState.turnNumber = 4;
normalDistanceState.scenario.score = { player1: 0, player2: 0 };
normalDistanceState.scenario.scoringHistory = [];
normalDistanceState.pieces.find((piece) => piece.sideKey === "player2").position = {
  xIn: 44,
  yIn: 33,
};
const normalDistanceExecution = executeEndTurn(
  normalDistanceState,
  {},
  "history-bound-normal-killbox-distance",
);
assert.equal(normalDistanceExecution.step.successor.runtimeReceipt.events
  .some((event) => event.eventType === "killbox_penalty"), false);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: fixedSuffixDomain.schemaVersion,
  fixedSuffixDisposition: fixedSuffixDomain.counts,
  acceptedPresetHash: oneWindowDomain.presets[0].presetHash,
  strictMatchHash: match.matchHash,
  positionMismatchReasons: positionMismatch.mismatches.map((row) => row.reason),
  scenarioCoverage,
  killBoxCoverage: {
    strictMatchHash: killBoxMatch.matchHash,
    pressurePointDistanceIn: certifiedKillBoxEvent.killBoxDistanceIn,
    beforeStartPenaltyAbsent: true,
    wolvesRoundFourDistanceIn: wolvesKillBoxEvent.killBoxDistanceIn,
    wolvesRoundFourExtensionIn: wolvesKillBoxEvent.killBoxExtensionIn,
    samePositionNormalScenarioPenaltyAbsent: true,
  },
}, null, 2));
