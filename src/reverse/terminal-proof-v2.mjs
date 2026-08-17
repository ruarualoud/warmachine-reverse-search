import {
  normalizeRulesV1State,
  steamroller2026ScenarioProfile,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import {
  sortedUnique,
  stableGraphHash,
  stableGraphValue,
} from "../graph/typed-facts-v2.mjs";
import {
  warmachinePieceInPlayV1,
  warmachinePieceLifecycleStageV1,
} from "./piece-lifecycle-v1.mjs";

export const WARMACHINE_MINIMAL_TERMINAL_PROOF_V2_SCHEMA =
  "warmachine_minimal_terminal_proof_v2";
export const WARMACHINE_ROSTER_PROVENANCE_V2_SCHEMA =
  "warmachine_roster_provenance_v2";
export const WARMACHINE_STRATEGIC_EXCHANGE_V2_SCHEMA =
  "warmachine_strategic_exchange_v2";

const SIDE_KEYS = Object.freeze(["player1", "player2"]);

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function alive(piece = {}) {
  return warmachinePieceInPlayV1(piece);
}

function explicitLeader(piece = {}) {
  return piece.isWarcaster === true || piece.isWarlock === true ||
    ["warcaster", "warlock"].includes(String(piece.modelRole || piece.modelType || "").toLowerCase());
}

function lifecycleStage(piece = {}) {
  return warmachinePieceLifecycleStageV1(piece);
}

function opponentSide(sideKey = "") {
  if (sideKey === "player1") return "player2";
  if (sideKey === "player2") return "player1";
  return "";
}

function terminalEvent(events = []) {
  return [...events].reverse().find((event) => event?.eventType === "terminal") || null;
}

function terminalGoalType(specification = {}) {
  const value = String(specification.goalType || specification.terminalClassKey || "");
  if (!value) return "assassination";
  if (["assassination", "unique_leader_assassination"].includes(value)) {
    return "assassination";
  }
  if (["scenario_score", "lead_three_after_opponent_turn_scoring"].includes(value)) {
    return "scenario_score";
  }
  if (value === "simultaneous_leader_tiebreak") return value;
  if (["fixed_round_limit_result", "fixed_round_limit"].includes(value)) {
    return "fixed_round_limit_result";
  }
  throw new Error(`terminal_proof_goal_type_unsupported:${value || "missing"}`);
}

function addFact(facts, factKind, requirement, status, evidence = {}, detail = {}) {
  const core = {
    factKind,
    requirement,
    status,
    evidence: stableGraphValue(evidence),
    sourceAuthority: detail.sourceAuthority || "warmachine_host",
    hardRefutationEligible: detail.hardRefutationEligible === true,
    strictWitnessRequired: detail.strictWitnessRequired !== false,
  };
  facts.push({
    factKey: `terminal-fact-${stableGraphHash({ ...core, index: facts.length }, 24)}`,
    ...core,
  });
}

function piecePointValue(piece = {}) {
  const value = numeric(
    piece.pointCost ?? piece.cardSnapshot?.pointCostNumber ?? piece.metadata?.pointCost,
    Number.NaN,
  );
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function provenanceSourceIds(piece = {}) {
  return sortedUnique([
    piece.cardId,
    piece.cardSnapshot?.id,
    piece.modelId,
    piece.unitModelId,
    piece.replacementGroupKey,
    piece.replacesPieceKey,
    piece.startingBattlegroupId,
  ]);
}

function damageStateProvenance(piece = {}) {
  const systems = stableGraphValue(piece.damage?.systems || {});
  const disabledCapabilities = stableGraphValue(
    piece.disabledCapabilities || piece.damage?.disabledCapabilities || [],
  );
  return stableGraphValue({
    boxesRemaining: numeric(piece.damage?.boxesRemaining ?? piece.boxesRemaining, 1),
    maxBoxes: numeric(piece.damage?.maxBoxes ?? piece.maxBoxes, 1),
    damageLifecycleStage: String(piece.damageLifecycleStage || ""),
    systems,
    systemDamageOrder: piece.damage?.systemDamageOrder || [],
    crippledSystemKeys: Object.entries(systems).filter(([, boxes]) =>
      numeric(boxes, 0) <= 0).map(([systemKey]) => systemKey).sort(),
    warjackSystemState: piece.isWarjack === true ? systems : null,
    warbeastAspectState: piece.isWarbeast === true
      ? Object.fromEntries(["body", "mind", "spirit"].map((aspectKey) => [
        aspectKey,
        numeric(systems[aspectKey], 0),
      ]))
      : null,
    disabledCapabilities,
  });
}

export function buildWarmachineRosterProvenanceV2(inputState = {}) {
  const state = normalizeRulesV1State(inputState);
  const rows = state.pieces.map((piece) => {
    const sourceIds = provenanceSourceIds(piece);
    const provenanceComplete = Boolean(
      piece.pieceKey && piece.sideKey &&
      (piece.cardSnapshot?.id || piece.modelId || piece.unitModelId || piece.cardType),
    );
    return {
      pieceKey: String(piece.pieceKey || ""),
      sideKey: String(piece.sideKey || ""),
      unitGroupId: String(piece.unitGroupId || piece.pieceKey || ""),
      modelRole: String(piece.modelRole || ""),
      modelType: String(piece.modelType || ""),
      leader: explicitLeader(piece),
      lifecycleStage: lifecycleStage(piece),
      aliveAndInPlay: alive(piece),
      pointValue: piecePointValue(piece),
      sourceIds,
      controllerPieceKey: String(piece.controllerPieceKey || ""),
      battlegroupId: String(piece.battlegroupId || piece.startingBattlegroupId || ""),
      replacementGroupKey: String(piece.replacementGroupKey || ""),
      replacesPieceKey: String(piece.replacesPieceKey || ""),
      damageState: damageStateProvenance(piece),
      provenanceComplete,
    };
  }).sort((left, right) => left.pieceKey.localeCompare(right.pieceKey));
  const core = {
    schemaVersion: WARMACHINE_ROSTER_PROVENANCE_V2_SCHEMA,
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    modelCount: rows.length,
    completeModelCount: rows.filter((row) => row.provenanceComplete).length,
    unknownModelCount: rows.filter((row) => !row.provenanceComplete).length,
    leaderPieceKeysBySide: Object.fromEntries(["player1", "player2"].map((sideKey) => [
      sideKey,
      rows.filter((row) => row.sideKey === sideKey && row.leader)
        .map((row) => row.pieceKey).sort(),
    ])),
    lifecycleCounts: Object.fromEntries(Array.from(rows.reduce((map, row) => {
      map.set(row.lifecycleStage, (map.get(row.lifecycleStage) || 0) + 1);
      return map;
    }, new Map())).sort()),
    rows,
    completeForHardPruning: rows.every((row) => row.provenanceComplete),
    claimBoundary: "Every model remains in the complete roster after destruction, boxing, removal, dormancy or replacement. Missing source identity is unresolved provenance and cannot justify pruning.",
  };
  return { ...core, provenanceHash: stableGraphHash(core) };
}

function groupedRosterValue(state = {}, sideKey = "") {
  const groups = new Map();
  for (const piece of state.pieces || []) {
    if (piece.sideKey !== sideKey) continue;
    const groupKey = String(piece.unitGroupId || piece.pieceKey || "");
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(piece);
  }
  return Array.from(groups, ([groupKey, pieces]) => {
    const pointValues = pieces.map(piecePointValue).filter((value) => value !== null);
    return {
      groupKey,
      pieceKeys: pieces.map((piece) => piece.pieceKey).sort(),
      pointValue: pointValues.length ? Math.max(...pointValues) : null,
      anyAlive: pieces.some(alive),
      allOut: pieces.every((piece) => !alive(piece)),
    };
  }).sort((left, right) => left.groupKey.localeCompare(right.groupKey));
}

function resourceTotal(state = {}, sideKey = "") {
  return (state.pieces || []).filter((piece) => piece.sideKey === sideKey)
    .reduce((sum, piece) => sum + numeric(
      piece.resourcePoints ?? piece.focus ?? piece.fury ?? piece.soulTokens ??
      piece.corpseTokens ?? piece.hungerTokens,
      0,
    ), 0);
}

export function buildWarmachineStrategicExchangeV2(
  beforeStateInput = {},
  afterStateInput = {},
  rawOptions = {},
) {
  const beforeState = normalizeRulesV1State(beforeStateInput);
  const afterState = normalizeRulesV1State(afterStateInput);
  const perspectiveSideKey = String(rawOptions.perspectiveSideKey || beforeState.activeSideKey || "player1");
  const otherSideKey = opponentSide(perspectiveSideKey);
  const sideRows = [perspectiveSideKey, otherSideKey].map((sideKey) => {
    const beforeGroups = new Map(groupedRosterValue(beforeState, sideKey)
      .map((row) => [row.groupKey, row]));
    const afterGroups = new Map(groupedRosterValue(afterState, sideKey)
      .map((row) => [row.groupKey, row]));
    const newlyRemoved = [...beforeGroups.values()].filter((row) =>
      row.anyAlive && afterGroups.get(row.groupKey)?.allOut);
    return {
      sideKey,
      newlyRemovedGroupKeys: newlyRemoved.map((row) => row.groupKey).sort(),
      newlyRemovedPieceKeys: newlyRemoved.flatMap((row) => row.pieceKeys).sort(),
      removedPointValue: newlyRemoved.every((row) => row.pointValue !== null)
        ? newlyRemoved.reduce((sum, row) => sum + row.pointValue, 0)
        : null,
      pointAttributionComplete: newlyRemoved.every((row) => row.pointValue !== null),
      scoreDelta: numeric(afterState.scenario?.score?.[sideKey], 0) -
        numeric(beforeState.scenario?.score?.[sideKey], 0),
      resourceDelta: resourceTotal(afterState, sideKey) - resourceTotal(beforeState, sideKey),
    };
  });
  const perspective = sideRows.find((row) => row.sideKey === perspectiveSideKey);
  const opponent = sideRows.find((row) => row.sideKey === otherSideKey);
  const core = {
    schemaVersion: WARMACHINE_STRATEGIC_EXCHANGE_V2_SCHEMA,
    perspectiveSideKey,
    opponentSideKey: otherSideKey,
    sideRows,
    exchangeVector: {
      friendlyRemovedPoints: perspective.removedPointValue,
      opponentRemovedPoints: opponent.removedPointValue,
      pointSwing: perspective.removedPointValue === null || opponent.removedPointValue === null
        ? null
        : opponent.removedPointValue - perspective.removedPointValue,
      scoreSwing: perspective.scoreDelta - opponent.scoreDelta,
      resourceSwing: perspective.resourceDelta - opponent.resourceDelta,
    },
    deliberateExchange: rawOptions.deliberateExchange === true,
    strategicIntent: String(rawOptions.strategicIntent || ""),
    valuationComplete: sideRows.every((row) => row.pointAttributionComplete),
    trainingTruth: false,
    claimBoundary: "The exchange ledger records lifecycle, score and resource deltas. Strategic intent is route provenance, not rules truth; unknown group points remain null rather than guessed.",
  };
  return { ...core, exchangeHash: stableGraphHash(core) };
}

function baseProof(state, goalType, winnerSideKey, events, rawOptions) {
  const terminal = terminalEvent(events);
  const scenarioProfile = steamroller2026ScenarioProfile(state.scenario || {});
  return {
    goalType,
    winnerSideKey,
    loserSideKey: opponentSide(winnerSideKey),
    terminalEvent: terminal ? stableGraphValue(terminal) : null,
    strictEvents: stableGraphValue(events),
    strictReceiptHash: String(rawOptions.strictReceiptHash || ""),
    scenarioProfile,
    absoluteTerminalTime: {
      roundNumber: Math.max(1, Math.floor(numeric(
        terminal?.roundNumber ?? terminal?.turnNumber ?? rawOptions.terminalTurnNumber ??
          state.turnNumber,
        1,
      ))),
      endingSideKey: String(
        terminal?.endingSideKey || rawOptions.endingSideKey || state.activeSideKey || "",
      ),
      scoringSideKey: String(
        terminal?.scoringSideKey || rawOptions.scoringSideKey || "",
      ),
      phaseKey: String(terminal?.phaseKey || rawOptions.terminalPhaseKey || state.phaseKey || ""),
      windowKey: String(rawOptions.windowKey || "post_transition_terminal_settlement"),
    },
    relativeTerminalTime: {
      victoryEvent: 0,
      activation: -1,
      turn: -1,
      previousTurn: -2,
      previousRound: -3,
    },
  };
}

function proofStatus(facts, terminalPresent) {
  if (facts.some((fact) => fact.status === "contradicted" && fact.hardRefutationEligible)) {
    return "invalid_under_bound_state";
  }
  if (terminalPresent && facts.every((fact) => fact.status === "satisfied")) {
    return "strict_certified";
  }
  return "candidate_unresolved_until_strict_terminal_event";
}

export function buildWarmachineMinimalTerminalProofV2(
  inputState = {},
  rawSpecification = {},
  rawOptions = {},
) {
  const state = normalizeRulesV1State(inputState);
  const events = Array.isArray(rawOptions.strictEvents) ? rawOptions.strictEvents : [];
  const terminal = terminalEvent(events);
  const goalType = terminalGoalType(rawSpecification);
  const requestedResultKind = String(rawSpecification.resultKind ||
    (rawSpecification.winnerSideKey ? "win" : ""));
  const inferredResultKind = requestedResultKind ||
    (terminal && !String(terminal.winnerSideKey || "") ? "tie" : "win");
  const requestedWinnerSideKey = String(rawSpecification.winnerSideKey || "");
  const winnerSideKey = inferredResultKind === "tie"
    ? ""
    : String(requestedWinnerSideKey || terminal?.winnerSideKey || state.activeSideKey || "");
  const proof = baseProof(state, goalType, winnerSideKey, events, rawOptions);
  proof.resultKind = inferredResultKind;
  const facts = [];
  const exactProfile = Boolean(proof.scenarioProfile);
  addFact(
    facts,
    "steamroller_profile",
    "the terminal uses an exact Steamroller 2026 scenario profile",
    exactProfile ? "satisfied" : "unresolved",
    {
      scenarioKey: proof.scenarioProfile?.scenarioKey || "",
      profileSchemaVersion: proof.scenarioProfile?.schemaVersion || "",
    },
  );
  const terminalWinnerSideKey = String(terminal?.winnerSideKey || "");
  const terminalWinnerMatches = inferredResultKind === "tie"
    ? Boolean(terminal && !terminalWinnerSideKey)
    : Boolean(terminalWinnerSideKey && terminalWinnerSideKey === winnerSideKey);
  addFact(
    facts,
    "terminal_winner_identity",
    "the Host terminal winner matches the requested reverse-search winner",
    terminalWinnerMatches ? "satisfied" : terminal ? "contradicted" : "unresolved",
    {
      requestedWinnerSideKey,
      proofWinnerSideKey: winnerSideKey,
      terminalWinnerSideKey,
    },
    { hardRefutationEligible: Boolean(terminal) },
  );

  if (goalType === "assassination") {
    const leadersBySide = Object.fromEntries(["player1", "player2"].map((sideKey) => [
      sideKey,
      state.pieces.filter((piece) => piece.sideKey === sideKey && explicitLeader(piece)),
    ]));
    const aliveLeadersBySide = Object.fromEntries(Object.entries(leadersBySide).map(([sideKey, rows]) => [
      sideKey,
      rows.filter(alive),
    ]));
    const rosterComplete = Object.values(leadersBySide).every((rows) => rows.length > 0);
    const winnerHasLeader = aliveLeadersBySide[winnerSideKey]?.length > 0;
    const loserHasNoLeader = aliveLeadersBySide[proof.loserSideKey]?.length === 0;
    const simultaneous = Object.values(aliveLeadersBySide).every((rows) => rows.length === 0);
    const assassinationTerminal = Boolean(terminal && (
      /leader|assassination|simultaneous/i.test(String(terminal.reason || "")) ||
      events.some((event) => event?.eventType === "simultaneous_leader_destruction")
    ));
    addFact(facts, "leader_roster", "both sides have explicit complete Leader identities",
      rosterComplete ? "satisfied" : "unresolved", {
        leaderPieceKeysBySide: Object.fromEntries(Object.entries(leadersBySide).map(([sideKey, rows]) => [
          sideKey,
          rows.map((piece) => piece.pieceKey).sort(),
        ])),
      });
    addFact(facts, "winner_leader_presence", "the winning side owns at least one remaining Leader",
      winnerHasLeader || simultaneous ? "satisfied" : terminal ? "contradicted" : "unresolved", {
        winnerSideKey,
        remainingLeaderPieceKeys: (aliveLeadersBySide[winnerSideKey] || [])
          .map((piece) => piece.pieceKey).sort(),
        simultaneousLeaderDestruction: simultaneous,
      }, { hardRefutationEligible: Boolean(terminal) });
    addFact(facts, "loser_leader_absence", "the losing side owns no remaining Leader",
      loserHasNoLeader ? "satisfied" : terminal ? "contradicted" : "unresolved", {
        loserSideKey: proof.loserSideKey,
        remainingLeaderPieceKeys: (aliveLeadersBySide[proof.loserSideKey] || [])
          .map((piece) => piece.pieceKey).sort(),
      }, { hardRefutationEligible: Boolean(terminal) });
    addFact(facts, "assassination_terminal_event",
      "rules-v1 emits the Steamroller assassination terminal event after lifecycle and final scoring",
      assassinationTerminal ? "satisfied" : "unresolved", {
        terminalReason: String(terminal?.reason || ""),
        finalScoringSuperseded: events.some((event) =>
          event?.eventType === "scenario_terminal_superseded"),
      });
    addFact(facts, "assassination_result_precedence",
      "final VP cannot replace the assassination result",
      assassinationTerminal ? "satisfied" : "unresolved", {
        terminalWinnerSideKey: String(terminal?.winnerSideKey || ""),
        expectedWinnerSideKey: winnerSideKey,
      });
  } else if (goalType === "scenario_score") {
    const score = state.scenario?.score || {};
    const winnerScore = numeric(score[winnerSideKey], 0);
    const loserScore = numeric(score[proof.loserSideKey], 0);
    const lead = winnerScore - loserScore;
    const endingSideKey = proof.absoluteTerminalTime.endingSideKey;
    const opponentTurnSettlement = endingSideKey === proof.loserSideKey;
    const scoringStarted = proof.absoluteTerminalTime.roundNumber >=
      Math.max(2, numeric(state.scenario?.scoringStartTurnNumber, 2));
    const scoreEvents = events.filter((event) => event?.eventType === "scenario_score");
    const scenarioSettlement = events.find((event) =>
      event?.eventType === "steamroller_2026_turn_end_settled");
    const terminalReason = String(terminal?.reason || "");
    const scenarioTerminal = Boolean(terminal && (
      terminalReason === "steamroller_2026_lead_three_after_scoring_on_opponent_turn" ||
      /^scenario_round_limit_(?:tiebreak|score_tied)$/.test(terminalReason)
    ));
    addFact(facts, "scoring_start_window",
      "scenario scoring is no earlier than the end of the Defender's second turn",
      scoringStarted ? "satisfied" : terminal ? "contradicted" : "unresolved", {
        roundNumber: proof.absoluteTerminalTime.roundNumber,
        scoringStartSideKey: String(state.scenario?.scoringStartSideKey || ""),
        scoringStartTurnNumber: numeric(state.scenario?.scoringStartTurnNumber, 2),
      }, { hardRefutationEligible: Boolean(terminal) });
    addFact(facts, "opponent_turn_settlement",
      "the winner is checked after scoring on that player's opponent's turn",
      opponentTurnSettlement ? "satisfied" : terminal ? "contradicted" : "unresolved", {
        endingSideKey,
        winnerSideKey,
        loserSideKey: proof.loserSideKey,
      }, { hardRefutationEligible: Boolean(terminal) });
    addFact(facts, "victory_lead",
      "the winner leads by at least 3 VP after scoring",
      lead >= 3 ? "satisfied" : terminal ? "contradicted" : "unresolved", {
        winnerScore,
        loserScore,
        lead,
        requiredLead: 3,
      }, { hardRefutationEligible: Boolean(terminal) });
    addFact(facts, "scenario_score_transition",
      "the terminal score follows exact scenario element, bonus and controller-decision transitions",
      scenarioTerminal && scenarioSettlement ? "satisfied" : "unresolved", {
        scoreEventCount: scoreEvents.length,
        scoreEvents,
        zeroPointSettlement: scoreEvents.length === 0 && Boolean(scenarioSettlement),
        settlementEvent: scenarioSettlement || null,
        scenarioState: state.scenario?.scenarioState || {},
      });
    addFact(facts, "scenario_terminal_event",
      "rules-v1 emits the Steamroller scenario terminal event",
      scenarioTerminal ? "satisfied" : "unresolved", {
        terminalReason: String(terminal?.reason || ""),
        terminalWinnerSideKey: String(terminal?.winnerSideKey || ""),
      });
  } else if (goalType === "simultaneous_leader_tiebreak") {
    const leadersBySide = Object.fromEntries(SIDE_KEYS.map((sideKey) => [
      sideKey,
      state.pieces.filter((piece) => piece.sideKey === sideKey && explicitLeader(piece)),
    ]));
    const aliveLeadersBySide = Object.fromEntries(Object.entries(leadersBySide)
      .map(([sideKey, rows]) => [sideKey, rows.filter(alive)]));
    const rosterComplete = Object.values(leadersBySide).every((rows) => rows.length > 0);
    const allLeadersAbsent = Object.values(aliveLeadersBySide).every((rows) => rows.length === 0);
    const simultaneousEvent = events.find((event) =>
      event?.eventType === "simultaneous_leader_destruction");
    const terminalReason = String(terminal?.reason || "");
    const terminalMatches = [
      "steamroller_2026_simultaneous_leaders_tiebreak_resolved",
      "steamroller_2026_simultaneous_leaders_tiebreak_tied",
    ].includes(terminalReason);
    const score = state.scenario?.score || {};
    const scoresTied = numeric(score.player1, 0) === numeric(score.player2, 0);
    const tiebreakClassKey = String(rawSpecification.tiebreakClassKey || "");
    const tiebreakerResult = terminal?.tiebreakerResult ||
      simultaneousEvent?.tiebreakerResult || {};
    const tiebreakClassSatisfied = tiebreakClassKey === "victory_point_advantage"
      ? !scoresTied && inferredResultKind === "win"
      : tiebreakClassKey === "victory_points_tied_scenario_presence_advantage"
        ? scoresTied && inferredResultKind === "win" && tiebreakerResult.ok === true &&
          String(tiebreakerResult.winnerSideKey || "") === winnerSideKey
        : tiebreakClassKey === "victory_points_and_scenario_presence_tied"
          ? scoresTied && inferredResultKind === "tie" && !terminalWinnerSideKey
          : false;
    const sourceConfirmed = tiebreakClassKey !==
      "victory_points_and_scenario_presence_tied";
    addFact(facts, "leader_roster", "both sides have explicit complete Leader identities",
      rosterComplete ? "satisfied" : "unresolved", {
        leaderPieceKeysBySide: Object.fromEntries(Object.entries(leadersBySide)
          .map(([sideKey, rows]) => [sideKey, rows.map((piece) => piece.pieceKey).sort()])),
      });
    addFact(facts, "all_leaders_simultaneously_destroyed",
      "all explicit Leader models are absent after one simultaneous destruction resolution",
      allLeadersAbsent && simultaneousEvent ? "satisfied" : terminal ? "contradicted" : "unresolved",
      {
        aliveLeaderPieceKeysBySide: Object.fromEntries(Object.entries(aliveLeadersBySide)
          .map(([sideKey, rows]) => [sideKey, rows.map((piece) => piece.pieceKey).sort()])),
        simultaneousEvent: simultaneousEvent || null,
      }, { hardRefutationEligible: Boolean(terminal) });
    addFact(facts, "simultaneous_tiebreak_class",
      "the terminal result follows the declared VP or Scenario Presence tiebreak class",
      tiebreakClassSatisfied ? "satisfied" : terminal ? "contradicted" : "unresolved",
      { tiebreakClassKey, score, tiebreakerResult, inferredResultKind },
      { hardRefutationEligible: Boolean(terminal) });
    addFact(facts, "simultaneous_terminal_event",
      "rules-v1 emits the simultaneous Leader destruction terminal event",
      terminalMatches && simultaneousEvent ? "satisfied" : "unresolved",
      { terminalReason, simultaneousEvent: simultaneousEvent || null });
    addFact(facts, "official_source_resolution",
      "the official packet explicitly resolves the declared terminal result",
      sourceConfirmed ? "satisfied" : "unresolved",
      {
        sourceResolutionStatus: sourceConfirmed
          ? "officially_confirmed"
          : "official_second_tiebreak_still_tied_result_unresolved",
      });
  } else if (goalType === "fixed_round_limit_result") {
    const profileLimit = Math.max(0, numeric(proof.scenarioProfile?.fixedRoundLimit, 0));
    const roundLimitEvent = events.find((event) => event?.eventType === "scenario_round_limit");
    const terminalReason = String(terminal?.reason || "");
    const fixedRoundReached = profileLimit > 0 &&
      numeric(roundLimitEvent?.completedRound, -1) === profileLimit &&
      proof.absoluteTerminalTime.roundNumber === profileLimit;
    const defenderSideKey = String(state.scenario?.defenderSideKey ||
      state.scenario?.packet?.defenderSideKey || rawSpecification.defenderSideKey || "");
    const endedOnDefender = proof.absoluteTerminalTime.endingSideKey === defenderSideKey;
    const hostTerminalMatches = [
      "scenario_round_limit_tiebreak",
      "scenario_round_limit_score_tied",
    ].includes(terminalReason);
    addFact(facts, "fixed_round_profile",
      "the selected scenario has an explicit fixed game length",
      profileLimit > 0 ? "satisfied" : "contradicted",
      { profileLimit }, { hardRefutationEligible: true });
    addFact(facts, "fixed_round_window",
      "the terminal occurs after the Defender's configured final turn",
      fixedRoundReached && endedOnDefender ? "satisfied" : terminal ? "contradicted" : "unresolved",
      {
        completedRound: roundLimitEvent?.completedRound ?? null,
        terminalRound: proof.absoluteTerminalTime.roundNumber,
        defenderSideKey,
        endingSideKey: proof.absoluteTerminalTime.endingSideKey,
      }, { hardRefutationEligible: Boolean(terminal) });
    addFact(facts, "fixed_round_host_terminal_event",
      "rules-v1 emits the configured fixed-round terminal event",
      roundLimitEvent && hostTerminalMatches ? "satisfied" : "unresolved",
      { roundLimitEvent: roundLimitEvent || null, terminalReason });
    const fixedRoundSourceResolutionStatus = String(
      rawSpecification.sourceResolutionStatus ||
      (proof.resultKind === "tie"
        ? "official_second_tiebreak_still_tied_result_unresolved"
        : "officially_confirmed"),
    );
    const fixedRoundSourceConfirmed = proof.resultKind !== "tie" &&
      fixedRoundSourceResolutionStatus === "officially_confirmed";
    addFact(facts, "official_source_resolution",
      "the official packet explicitly connects fixed game length to the declared tiebreak result",
      fixedRoundSourceConfirmed ? "satisfied" : "unresolved",
      {
        sourceResolutionStatus: fixedRoundSourceResolutionStatus,
        resultKind: proof.resultKind,
        tiebreakClassKey: String(rawSpecification.tiebreakClassKey || ""),
      });
  }

  const terminalPresent = Boolean(terminal);
  const core = {
    schemaVersion: WARMACHINE_MINIMAL_TERMINAL_PROOF_V2_SCHEMA,
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    ...proof,
    facts,
    factCount: facts.length,
    satisfiedFactCount: facts.filter((fact) => fact.status === "satisfied").length,
    unresolvedFactCount: facts.filter((fact) => fact.status === "unresolved").length,
    contradictedFactCount: facts.filter((fact) => fact.status === "contradicted").length,
    strictTerminalEventPresent: terminalPresent,
    status: proofStatus(facts, terminalPresent),
    strictCertified: false,
    trainingTruth: false,
    globalOptimalityProven: false,
    claimBoundary: "This is a minimal terminal certificate. A desired future terminal remains a candidate; only an exact Host profile, complete required identities and a rules-v1 strict terminal event can certify it.",
  };
  core.strictCertified = core.status === "strict_certified";
  core.trainingTruth = core.strictCertified;
  return { ...core, proofHash: stableGraphHash(core) };
}
