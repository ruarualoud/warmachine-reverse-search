import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_STEAMROLLER_HISTORICAL_SETTLEMENT_AUDIT_V1_SCHEMA =
  "warmachine_steamroller_historical_settlement_audit_v1";
export const WARMACHINE_STEAMROLLER_SETTLEMENT_DIFFERENCE_FEASIBILITY_V1_SCHEMA =
  "warmachine_steamroller_settlement_difference_feasibility_v1";

function oppositeSide(sideKey = "") {
  if (sideKey === "player1") return "player2";
  if (sideKey === "player2") return "player1";
  return "";
}

function endingSideFromWindow(window = "") {
  return String(window).match(/^turn_end:(player1|player2)(?::|$)/)?.[1] || "";
}

export function analyzeWarmachineSteamrollerSettlementDifferenceFeasibilityV1(
  rawInput = {},
) {
  const requiredLead = Math.max(1, Math.floor(Number(
    rawInput.requiredLead || 3,
  )));
  const maximumNonterminalLead = requiredLead - 1;
  const windows = (rawInput.windows || []).map((window, index) =>
    stableGraphValue({
      windowKey: String(window.windowKey || `window-${index + 1}`),
      round: Math.max(1, Math.floor(Number(window.round || 1))),
      endingSideKey: String(window.endingSideKey || ""),
      scoreGainBySide: {
        player1: Math.max(0, Number(window.scoreGainBySide?.player1 || 0)),
        player2: Math.max(0, Number(window.scoreGainBySide?.player2 || 0)),
      },
      sourceLedgerKeys: [...(window.sourceLedgerKeys || [])].map(String).sort(),
    }));
  const issues = [];
  let cumulativeDifferenceDelta = 0;
  let minimumInitialDifference = Number.NEGATIVE_INFINITY;
  let maximumInitialDifference = Number.POSITIVE_INFINITY;
  const constraints = [];
  for (const window of windows) {
    if (!["player1", "player2"].includes(window.endingSideKey)) {
      issues.push({
        windowKey: window.windowKey,
        reason: "settlement_difference_ending_side_invalid",
      });
      continue;
    }
    cumulativeDifferenceDelta +=
      Number(window.scoreGainBySide.player1 || 0) -
      Number(window.scoreGainBySide.player2 || 0);
    if (window.endingSideKey === "player1") {
      const lowerBound = -maximumNonterminalLead -
        cumulativeDifferenceDelta;
      minimumInitialDifference = Math.max(
        minimumInitialDifference,
        lowerBound,
      );
      constraints.push(stableGraphValue({
        windowKey: window.windowKey,
        endingSideKey: window.endingSideKey,
        candidateWinnerSideKey: "player2",
        cumulativeDifferenceDelta,
        relation: "initial_player1_minus_player2_at_least",
        bound: lowerBound,
      }));
    } else {
      const upperBound = maximumNonterminalLead -
        cumulativeDifferenceDelta;
      maximumInitialDifference = Math.min(
        maximumInitialDifference,
        upperBound,
      );
      constraints.push(stableGraphValue({
        windowKey: window.windowKey,
        endingSideKey: window.endingSideKey,
        candidateWinnerSideKey: "player1",
        cumulativeDifferenceDelta,
        relation: "initial_player1_minus_player2_at_most",
        bound: upperBound,
      }));
    }
  }
  const inputValid = issues.length === 0 && windows.length > 0;
  const feasible = inputValid &&
    minimumInitialDifference <= maximumInitialDifference;
  const contradiction = feasible ? null : stableGraphValue({
    minimumInitialDifference: Number.isFinite(minimumInitialDifference)
      ? minimumInitialDifference
      : null,
    maximumInitialDifference: Number.isFinite(maximumInitialDifference)
      ? maximumInitialDifference
      : null,
    lowerBoundConstraintKeys: constraints.filter((constraint) =>
      constraint.relation.endsWith("at_least") &&
      constraint.bound === minimumInitialDifference).map((constraint) =>
      constraint.windowKey),
    upperBoundConstraintKeys: constraints.filter((constraint) =>
      constraint.relation.endsWith("at_most") &&
      constraint.bound === maximumInitialDifference).map((constraint) =>
      constraint.windowKey),
    reason: inputValid
      ? "fixed_settlement_windows_have_no_nonterminal_initial_score_difference"
      : "settlement_difference_input_invalid",
  });
  const core = stableGraphValue({
    schemaVersion:
      WARMACHINE_STEAMROLLER_SETTLEMENT_DIFFERENCE_FEASIBILITY_V1_SCHEMA,
    requiredLead,
    maximumNonterminalLead,
    windows,
    constraints,
    minimumInitialDifference: Number.isFinite(minimumInitialDifference)
      ? minimumInitialDifference
      : null,
    maximumInitialDifference: Number.isFinite(maximumInitialDifference)
      ? maximumInitialDifference
      : null,
    feasible,
    contradiction,
    issues,
    claimBoundary: "This is an exact difference-constraint proof for the supplied fixed scoring-window gains. It quantifies every possible score ledger before the first supplied window, but it does not prove that a feasible difference has a reachable model-position history. An empty interval proves that score-only prefix rewriting cannot preserve all supplied gains without an earlier scenario terminal.",
  });
  return {
    ...core,
    analysisHash: stableGraphHash(core),
    ok: inputValid,
  };
}

function definitelyBeforeDeclaredTerminal(
  round,
  endingSideKey,
  terminalRound,
  terminalSideKey,
  firstPlayerSideKey,
) {
  if (round < terminalRound) return true;
  if (round > terminalRound || endingSideKey === terminalSideKey) return false;
  const turnOrder = [firstPlayerSideKey, oppositeSide(firstPlayerSideKey)];
  const endingIndex = turnOrder.indexOf(endingSideKey);
  const terminalIndex = turnOrder.indexOf(terminalSideKey);
  return endingIndex >= 0 && terminalIndex >= 0 && endingIndex < terminalIndex;
}

export function auditWarmachineSteamrollerHistoricalSettlementV1(
  stateInput = {},
  rawOptions = {},
) {
  const state = structuredClone(stateInput || {});
  const scenario = state.scenario || {};
  const packetYear = String(scenario.packetYear || "");
  const packetKey = String(scenario.packetKey || "");
  const applies = packetYear === "2026" || packetKey === "steamroller-2026";
  const rows = [...(scenario.scoringHistory || [])]
    .map((row, sourceIndex) => ({ ...row, sourceIndex }))
    .sort((left, right) =>
      Number(left.sequence || 0) - Number(right.sequence || 0) ||
      Number(left.round || 0) - Number(right.round || 0) ||
      left.sourceIndex - right.sourceIndex);
  const terminalRound = Math.max(1, Number(
    rawOptions.declaredTerminalRound ?? state.turnNumber ?? 1,
  ));
  const terminalSideKey = String(
    rawOptions.declaredTerminalEndingSideKey || state.activeSideKey || "",
  );
  const firstPlayerSideKey = String(
    state.firstPlayerSideKey || scenario.attackerSideKey || "player1",
  );
  const requiredLead = Math.max(1, Number(scenario.scenarioVictoryLead || 3));
  const runningScore = { player1: 0, player2: 0 };
  const windowChecks = [];
  const prematureScenarioVictories = [];
  const unsupportedRows = [];
  const grouped = new Map();

  for (const row of rows) {
    const sideKey = String(row.sideKey || "");
    if (sideKey in runningScore) {
      runningScore[sideKey] += Math.max(0, Number(row.points || 0));
    }
    const endingSideKey = endingSideFromWindow(row.scoringWindow);
    if (!endingSideKey) {
      unsupportedRows.push(stableGraphValue({
        key: String(row.key || ""),
        round: Number(row.round || 0),
        scoringWindow: String(row.scoringWindow || ""),
        reason: "historical_scoring_window_not_turn_end",
      }));
      continue;
    }
    const round = Math.max(1, Number(row.round || 1));
    const groupKey = `${round}:${endingSideKey}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        groupKey,
        round,
        endingSideKey,
        rowKeys: [],
        scoreAfter: null,
      });
    }
    const group = grouped.get(groupKey);
    group.rowKeys.push(String(row.key || ""));
    group.scoreAfter = { ...runningScore };
  }

  for (const group of grouped.values()) {
    const scoringSideKey = oppositeSide(group.endingSideKey);
    const scoreAfter = group.scoreAfter || { ...runningScore };
    const lead = Number(scoreAfter[scoringSideKey] || 0) -
      Number(scoreAfter[group.endingSideKey] || 0);
    const beforeDeclaredTerminal = definitelyBeforeDeclaredTerminal(
      group.round,
      group.endingSideKey,
      terminalRound,
      terminalSideKey,
      firstPlayerSideKey,
    );
    const check = stableGraphValue({
      ...group,
      scoringSideKey,
      scoreAfter,
      lead,
      requiredLead,
      beforeDeclaredTerminal,
      won: beforeDeclaredTerminal && lead >= requiredLead,
    });
    windowChecks.push(check);
    if (check.won) prematureScenarioVictories.push(check);
  }

  const ledgerTotals = { player1: 0, player2: 0 };
  for (const row of rows) {
    const sideKey = String(row.sideKey || "");
    if (sideKey in ledgerTotals) {
      ledgerTotals[sideKey] += Math.max(0, Number(row.points || 0));
    }
  }
  const observedScore = {
    player1: Math.max(0, Number(scenario.score?.player1 || 0)),
    player2: Math.max(0, Number(scenario.score?.player2 || 0)),
  };
  const scoreLedgerMatches = observedScore.player1 === ledgerTotals.player1 &&
    observedScore.player2 === ledgerTotals.player2;
  const core = stableGraphValue({
    schemaVersion:
      WARMACHINE_STEAMROLLER_HISTORICAL_SETTLEMENT_AUDIT_V1_SCHEMA,
    applies,
    declaredTerminal: {
      round: terminalRound,
      endingSideKey: terminalSideKey,
      stateActiveSideKey: String(state.activeSideKey || ""),
      source: rawOptions.declaredTerminalEndingSideKey
        ? "explicit_terminal_root_contract"
        : "state_active_side_fallback",
      firstPlayerSideKey,
    },
    requiredLead,
    observedScore,
    ledgerTotals,
    scoreLedgerMatches,
    windowChecks,
    prematureScenarioVictories,
    unsupportedRows,
    prematureScenarioVictoryAbsent:
      prematureScenarioVictories.length === 0,
    exactOverAllScoringTimings: unsupportedRows.length === 0,
    claimBoundary: "This audit rejects a later declared terminal when its persisted historical turn-end ledger already proves an earlier Steamroller scenario victory. Non-turn-end score timing remains explicit audit debt and whole-route strict replay remains the final authority.",
  });
  return {
    ...core,
    auditHash: stableGraphHash(core),
    ok: !applies || prematureScenarioVictories.length === 0,
  };
}

export function proposeWarmachineSteamrollerHistoricalSettlementRepairsV1(
  stateInput = {},
  rawOptions = {},
) {
  const state = structuredClone(stateInput || {});
  const audit = auditWarmachineSteamrollerHistoricalSettlementV1(state);
  const maximumSubsets = Math.max(1, Math.floor(Number(
    rawOptions.maximumSubsets || 4_096,
  )));
  if (audit.ok) {
    return stableGraphValue({
      schemaVersion: "warmachine_steamroller_historical_settlement_repairs_v1",
      sourceAuditHash: audit.auditHash,
      candidateCount: 0,
      candidates: [],
      examinedSubsetCount: 0,
      budgetDeferredSubsetCount: 0,
      reason: "historical_settlement_already_nonterminal",
      trainingTruth: false,
    });
  }
  const rows = [...(state.scenario?.scoringHistory || [])]
    .sort((left, right) =>
      Number(left.sequence || 0) - Number(right.sequence || 0) ||
      String(left.key || "").localeCompare(String(right.key || "")));
  const eligibleKeys = new Set();
  for (const violation of audit.prematureScenarioVictories || []) {
    const latestSequence = Math.max(0, ...rows
      .filter((row) => violation.rowKeys.includes(String(row.key || "")))
      .map((row) => Number(row.sequence || 0)));
    for (const row of rows) {
      if (row.sideKey === violation.scoringSideKey &&
          Number(row.sequence || 0) <= latestSequence) {
        eligibleKeys.add(String(row.key || ""));
      }
    }
  }
  const eligibleRows = rows.filter((row) => eligibleKeys.has(String(row.key || "")));
  const exactSubsetCountKnown = eligibleRows.length <= 52;
  const totalSubsetCount = exactSubsetCountKnown
    ? Math.max(0, (2 ** eligibleRows.length) - 1)
    : null;
  const examinedSubsetCount = Math.min(
    totalSubsetCount ?? maximumSubsets,
    maximumSubsets,
  );
  const candidates = [];
  for (let mask = 1; mask <= examinedSubsetCount; mask += 1) {
    const removedRows = eligibleRows.filter((_row, index) =>
      Math.floor(mask / (2 ** index)) % 2 === 1);
    const removedKeys = new Set(removedRows.map((row) => String(row.key || "")));
    const retainedRows = rows.filter((row) => !removedKeys.has(String(row.key || "")))
      .map((row, index) => stableGraphValue({ ...row, sequence: index + 1 }));
    const candidateState = structuredClone(state);
    candidateState.scenario.scoringHistory = retainedRows;
    candidateState.scenario.score = { player1: 0, player2: 0 };
    for (const row of retainedRows) {
      if (row.sideKey in candidateState.scenario.score) {
        candidateState.scenario.score[row.sideKey] += Math.max(0, Number(row.points || 0));
      }
    }
    const candidateAudit =
      auditWarmachineSteamrollerHistoricalSettlementV1(candidateState);
    if (!candidateAudit.ok) continue;
    const core = stableGraphValue({
      removedLedgerKeys: [...removedKeys].sort(),
      removedPoints: removedRows.reduce((sum, row) =>
        sum + Math.max(0, Number(row.points || 0)), 0),
      retainedSettlement: {
        score: candidateState.scenario.score,
        scoringHistory: retainedRows,
      },
      auditHash: candidateAudit.auditHash,
      hypothesisOnly: true,
      strictHistoryRouteRequired: true,
      trainingTruth: false,
    });
    candidates.push({
      ...core,
      candidateKey: `historical-settlement-repair-${stableGraphHash(core, 24)}`,
    });
  }
  candidates.sort((left, right) =>
    left.removedPoints - right.removedPoints ||
    left.removedLedgerKeys.length - right.removedLedgerKeys.length ||
    left.candidateKey.localeCompare(right.candidateKey));
  return stableGraphValue({
    schemaVersion: "warmachine_steamroller_historical_settlement_repairs_v1",
    sourceAuditHash: audit.auditHash,
    eligibleLedgerKeys: [...eligibleKeys].sort(),
    totalSubsetCount,
    exactSubsetCountKnown,
    examinedSubsetCount,
    budgetDeferredSubsetCount: totalSubsetCount == null
      ? null
      : Math.max(0, totalSubsetCount - examinedSubsetCount),
    candidateCount: candidates.length,
    candidates,
    selectedCandidateKey: String(candidates[0]?.candidateKey || ""),
    selectionOrder: "least_removed_points_then_fewest_rows_then_identity",
    claimBoundary: "Each candidate is only a terminal-history hypothesis. Removing a persisted score row is not evidence that it was avoidable; only a new deployment-to-terminal strict route may certify the retained settlement.",
    trainingTruth: false,
  });
}
