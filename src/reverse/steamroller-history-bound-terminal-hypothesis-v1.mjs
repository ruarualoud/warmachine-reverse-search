import { enumerateWarmachineBenchmarkActionsV2 } from
  "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { expandWarmachineStrictPolicyStepV1 } from
  "../search/strict-policy-step-v1.mjs";
import { warmachineHost } from "../warmachine-host-runtime.mjs";
import {
  analyzeWarmachineSteamrollerSettlementDifferenceFeasibilityV1,
} from "./steamroller-historical-settlement-audit-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";

export const WARMACHINE_STEAMROLLER_HISTORY_BOUND_TERMINAL_DOMAIN_V1_SCHEMA =
  "warmachine_steamroller_history_bound_terminal_domain_v1";
export const WARMACHINE_STEAMROLLER_HISTORY_BOUND_TERMINAL_PRESET_V1_SCHEMA =
  "warmachine_steamroller_history_bound_terminal_preset_v1";
export const WARMACHINE_STEAMROLLER_HISTORY_BOUND_BRANCH_MATCH_V1_SCHEMA =
  "warmachine_steamroller_history_bound_branch_match_v1";
export const WARMACHINE_STEAMROLLER_STRICT_HISTORY_BINDING_V1_SCHEMA =
  "warmachine_steamroller_strict_history_binding_v1";

const SIDE_KEYS = Object.freeze(["player1", "player2"]);
const TERMINAL_CLASS_KEYS = new Set([
  "unique_leader_assassination",
  "simultaneous_leader_tiebreak",
  "lead_three_after_opponent_turn_scoring",
  "fixed_round_limit_result",
]);

function sideKey(value, fieldName) {
  const side = String(value || "");
  if (!SIDE_KEYS.includes(side)) {
    throw new Error(`history_bound_terminal_side_invalid:${fieldName}:${side}`);
  }
  return side;
}

function oppositeSide(value) {
  return sideKey(value, "opposite_side") === "player1" ? "player2" : "player1";
}

function nonnegativeInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`history_bound_terminal_integer_invalid:${fieldName}:${value}`);
  }
  return number;
}

function positiveInteger(value, fieldName) {
  const number = nonnegativeInteger(value, fieldName);
  if (number < 1) {
    throw new Error(`history_bound_terminal_integer_not_positive:${fieldName}:${value}`);
  }
  return number;
}

function scoreMap(raw = {}, fieldName = "score") {
  return stableGraphValue({
    player1: nonnegativeInteger(raw.player1 ?? 0, `${fieldName}.player1`),
    player2: nonnegativeInteger(raw.player2 ?? 0, `${fieldName}.player2`),
  });
}

function scoreDifference(score = {}) {
  return Number(score.player1 || 0) - Number(score.player2 || 0);
}

function scoreAfter(score = {}, gain = {}) {
  return stableGraphValue({
    player1: Number(score.player1 || 0) + Number(gain.player1 || 0),
    player2: Number(score.player2 || 0) + Number(gain.player2 || 0),
  });
}

function geometryRequirementForSource(source = {}, window = {}) {
  const sourceFamilyKey = String(source.sourceFamilyKey || "");
  const elementType = String(source.elementType || "");
  const scoringSideKey = sideKey(source.scoringSideKey, "source.scoringSideKey");
  const endingSideKey = sideKey(window.endingSideKey, "window.endingSideKey");
  const elementKey = String(source.elementKey || "");
  const explicit = source.geometryRequirement;
  if (explicit && typeof explicit === "object") {
    const relationKind = String(explicit.relationKind || "");
    if (!relationKind) {
      throw new Error("history_bound_terminal_geometry_relation_required");
    }
    return stableGraphValue({
      ...explicit,
      relationKind,
      hostStrictSettlementRequired: true,
    });
  }
  if (elementType === "killbox" || sourceFamilyKey === "kill_box_penalty") {
    if (scoringSideKey !== oppositeSide(endingSideKey)) {
      throw new Error("history_bound_terminal_killbox_awarded_side_invalid");
    }
    if (!elementKey) {
      throw new Error("history_bound_terminal_killbox_leader_required");
    }
    return stableGraphValue({
      relationKind: "ending_side_leader_inside_own_kill_box",
      endingSideKey,
      benefitingSideKey: scoringSideKey,
      leaderPieceKey: elementKey,
      ownTableEdgeKey: String(source.ownTableEdgeKey || "host_state_bound"),
      maximumDistanceIn: Number(source.maximumDistanceIn ?? 12),
      hostStrictSettlementRequired: true,
    });
  }
  if (["objective", "scenario_terrain"].includes(elementType) ||
      ["objective_40", "objective_50", "scenario_terrain_own",
        "scenario_terrain_opponent"].includes(sourceFamilyKey)) {
    if (!elementKey) {
      throw new Error("history_bound_terminal_scenario_element_required");
    }
    return stableGraphValue({
      relationKind: "scoring_side_controls_scenario_element",
      scoringSideKey,
      elementType,
      elementKey,
      controlAndContestEligibilityResolvedBy: "current_rules_v1_host",
      hostStrictSettlementRequired: true,
    });
  }
  const specialRelationByFamily = {
    both_40mm_bonus: "scoring_side_controls_required_40mm_set",
    both_50mm_bonus: "scoring_side_controls_required_50mm_set",
    secure_two_own_bonus: "scoring_side_secures_two_owned_elements",
    secure_three_own_bonus: "scoring_side_secures_three_owned_elements",
    third_progress_token_goal: "objective_progress_state_reaches_third_token",
    zero_countdown_50mm_bonus: "secured_50mm_objective_countdown_is_zero",
    zero_countdown_terrain_bonus: "secured_scenario_terrain_countdown_is_zero",
    payload_delivery: "owned_payload_reaches_delivery_state",
  };
  return stableGraphValue({
    relationKind: specialRelationByFamily[sourceFamilyKey] ||
      "host_settlement_source_relation",
    scoringSideKey,
    sourceFamilyKey: sourceFamilyKey || "ledger_row_derived",
    elementType: elementType || "scenario_rule",
    elementKey: elementKey || "host_state_bound",
    hostStrictSettlementRequired: true,
  });
}

function normalizeSource(raw = {}, window = {}, index = 0) {
  const scoringSideKey = sideKey(raw.scoringSideKey || raw.sideKey,
    `source[${index}].scoringSideKey`);
  const points = positiveInteger(raw.points, `source[${index}].points`);
  const elementType = String(raw.elementType || "scenario_rule");
  const elementKey = String(raw.elementKey || "");
  const scoringWindow = String(raw.scoringWindow ||
    `turn_end:${window.endingSideKey}`);
  if (scoringWindow !== `turn_end:${window.endingSideKey}` &&
      !scoringWindow.startsWith(`turn_end:${window.endingSideKey}:`)) {
    throw new Error("history_bound_terminal_source_window_mismatch");
  }
  const sourceKey = String(raw.sourceKey || raw.ledgerKey ||
    `${window.round}:${scoringSideKey}:${elementType}:${elementKey}:${scoringWindow}`);
  const source = {
    sourceKey,
    sourceFamilyKey: String(raw.sourceFamilyKey || ""),
    scoringSideKey,
    points,
    elementType,
    elementKey,
    scoringWindow,
    round: window.round,
    sourceActionType: String(raw.sourceActionType ?? "end_turn"),
    sourceEventType: String(raw.sourceEventType ??
      "steamroller_2026_turn_end_scoring"),
    reason: String(raw.reason ?? "steamroller_2026_turn_end_scoring"),
    ownTableEdgeKey: String(raw.ownTableEdgeKey || ""),
    maximumDistanceIn: raw.maximumDistanceIn == null
      ? null
      : Number(raw.maximumDistanceIn),
    geometryRequirement: raw.geometryRequirement || null,
  };
  return stableGraphValue({
    ...source,
    geometryRequirement: geometryRequirementForSource(source, window),
  });
}

function normalizeAlternative(raw = {}, window = {}, index = 0) {
  const sources = (raw.sources || []).map((source, sourceIndex) =>
    normalizeSource(source, window, sourceIndex));
  const sourceKeys = new Set(sources.map((source) => source.sourceKey));
  if (sourceKeys.size !== sources.length) {
    throw new Error(`history_bound_terminal_duplicate_source:${window.windowKey}`);
  }
  const derivedGain = { player1: 0, player2: 0 };
  for (const source of sources) derivedGain[source.scoringSideKey] += source.points;
  const explicitGain = raw.scoreGainBySide == null
    ? derivedGain
    : scoreMap(raw.scoreGainBySide, `${window.windowKey}.scoreGainBySide`);
  if (explicitGain.player1 !== derivedGain.player1 ||
      explicitGain.player2 !== derivedGain.player2) {
    throw new Error(`history_bound_terminal_source_gain_mismatch:${window.windowKey}`);
  }
  const identity = stableGraphValue({
    windowKey: window.windowKey,
    alternativeKey: String(raw.alternativeKey ||
      `settlement-${index + 1}-${stableGraphHash({ sources, derivedGain }, 16)}`),
    scoreGainBySide: derivedGain,
    sources,
  });
  return stableGraphValue({
    ...identity,
    alternativeHash: stableGraphHash(identity),
  });
}

function normalizeWindow(raw = {}, index = 0) {
  const round = positiveInteger(raw.round, `window[${index}].round`);
  const endingSideKey = sideKey(raw.endingSideKey,
    `window[${index}].endingSideKey`);
  const windowKey = String(raw.windowKey || `round-${round}-${endingSideKey}`);
  const base = { windowKey, round, endingSideKey, sequence: index + 1 };
  const alternatives = (raw.settlementAlternatives || raw.alternatives || [])
    .map((alternative, alternativeIndex) =>
      normalizeAlternative(alternative, base, alternativeIndex));
  if (!alternatives.length) {
    throw new Error(`history_bound_terminal_window_alternatives_required:${windowKey}`);
  }
  const unique = new Map(alternatives.map((alternative) => [
    alternative.alternativeHash,
    alternative,
  ]));
  return stableGraphValue({ ...base, alternatives: [...unique.values()] });
}

function normalizeTerminalHypothesis(raw = {}) {
  const terminalClassKey = String(raw.terminalClassKey || "");
  if (!TERMINAL_CLASS_KEYS.has(terminalClassKey)) {
    throw new Error(`history_bound_terminal_class_invalid:${terminalClassKey}`);
  }
  const winnerSideKey = raw.winnerSideKey == null
    ? null
    : sideKey(raw.winnerSideKey, "terminal.winnerSideKey");
  const loserSideKey = raw.loserSideKey == null
    ? null
    : sideKey(raw.loserSideKey, "terminal.loserSideKey");
  if ((winnerSideKey || loserSideKey) &&
      (!winnerSideKey || !loserSideKey || winnerSideKey === loserSideKey)) {
    throw new Error("history_bound_terminal_result_sides_invalid");
  }
  return stableGraphValue({
    terminalHypothesisKey: String(raw.terminalHypothesisKey || raw.cellKey ||
      `terminal-${terminalClassKey}`),
    terminalClassKey,
    scenarioKey: String(raw.scenarioKey || ""),
    mapKey: String(raw.mapKey || "map_unspecified"),
    terminalRound: positiveInteger(raw.terminalRound || raw.roundNumber || 1,
      "terminal.terminalRound"),
    endingSideKey: sideKey(raw.endingSideKey, "terminal.endingSideKey"),
    winnerSideKey,
    loserSideKey,
  });
}

function normalizeScoreBeforeCells(rawCells = []) {
  const cells = rawCells.map((raw, index) => {
    const scoreBySide = scoreMap(raw.scoreBySide || raw.score,
      `scoreBeforeHistoryCells[${index}]`);
    const identity = stableGraphValue({
      scoreBeforeHistoryCellKey: String(raw.scoreBeforeHistoryCellKey ||
        raw.cellKey || `score-before-${scoreBySide.player1}-${scoreBySide.player2}`),
      scoreBySide,
    });
    return stableGraphValue({ ...identity, cellHash: stableGraphHash(identity) });
  });
  if (!cells.length) throw new Error("history_bound_terminal_score_before_cells_required");
  return [...new Map(cells.map((cell) => [cell.cellHash, cell])).values()]
    .sort((left, right) => left.cellHash.localeCompare(right.cellHash));
}

function alternativeProducts(windows = []) {
  return windows.reduce((products, window) => products.flatMap((product) =>
    window.alternatives.map((alternative) => [
      ...product,
      stableGraphValue({
        windowKey: window.windowKey,
        round: window.round,
        endingSideKey: window.endingSideKey,
        sequence: window.sequence,
        ...alternative,
      }),
    ])), [[]]);
}

function scenarioTerminalAtWindow(score = {}, endingSideKey = "", requiredLead = 3) {
  const scoringSideKey = oppositeSide(endingSideKey);
  const lead = Number(score[scoringSideKey] || 0) -
    Number(score[endingSideKey] || 0);
  return stableGraphValue({
    scoringSideKey,
    endingSideKey,
    lead,
    requiredLead,
    terminal: lead >= requiredLead,
    winnerSideKey: lead >= requiredLead ? scoringSideKey : null,
  });
}

function trajectoryForCandidate(terminal, scoreCell, windows, requiredLead) {
  const scoreTerminal = terminal.terminalClassKey ===
    "lead_three_after_opponent_turn_scoring";
  const declaredTerminalWindowKey = scoreTerminal
    ? windows.at(-1)?.windowKey || ""
    : "";
  let score = scoreCell.scoreBySide;
  const trajectory = [];
  let exclusion = null;
  for (const window of windows) {
    const scoreBefore = score;
    score = scoreAfter(score, window.scoreGainBySide);
    const terminalCheck = scenarioTerminalAtWindow(
      score,
      window.endingSideKey,
      requiredLead,
    );
    const isDeclaredTerminalWindow = window.windowKey === declaredTerminalWindowKey;
    trajectory.push(stableGraphValue({
      windowKey: window.windowKey,
      round: window.round,
      endingSideKey: window.endingSideKey,
      alternativeKey: window.alternativeKey,
      scoreBefore,
      scoreGainBySide: window.scoreGainBySide,
      scoreAfter: score,
      sourceKeys: window.sources.map((source) => source.sourceKey).sort(),
      terminalCheck,
      isDeclaredTerminalWindow,
    }));
    if (terminalCheck.terminal && !isDeclaredTerminalWindow) {
      exclusion = {
        reason: "history_bound_terminal_earlier_scenario_victory",
        windowKey: window.windowKey,
        winnerSideKey: terminalCheck.winnerSideKey,
      };
      break;
    }
    if (isDeclaredTerminalWindow && (!terminalCheck.terminal ||
        terminalCheck.winnerSideKey !== terminal.winnerSideKey)) {
      exclusion = {
        reason: "history_bound_terminal_declared_score_terminal_not_reached",
        windowKey: window.windowKey,
        observedWinnerSideKey: terminalCheck.winnerSideKey,
      };
      break;
    }
  }
  if (!exclusion && scoreTerminal && !declaredTerminalWindowKey) {
    exclusion = { reason: "history_bound_terminal_score_terminal_window_missing" };
  }
  return { trajectory, finalScore: score, exclusion };
}

function differenceFeasibility(terminal = {}, windows = [], requiredLead = 3) {
  const nonterminalWindows = terminal.terminalClassKey ===
      "lead_three_after_opponent_turn_scoring"
    ? windows.slice(0, -1)
    : windows;
  if (!nonterminalWindows.length) return null;
  return analyzeWarmachineSteamrollerSettlementDifferenceFeasibilityV1({
    requiredLead,
    windows: nonterminalWindows.map((window) => ({
      windowKey: window.windowKey,
      round: window.round,
      endingSideKey: window.endingSideKey,
      scoreGainBySide: window.scoreGainBySide,
      sourceLedgerKeys: window.sources.map((source) => source.sourceKey),
    })),
  });
}

export function buildWarmachineSteamrollerHistoryBoundTerminalDomainV1(
  rawInput = {},
  rawOptions = {},
) {
  const terminalHypothesis = normalizeTerminalHypothesis(
    rawInput.terminalHypothesis || {},
  );
  const requiredLead = positiveInteger(rawInput.requiredLead || 3, "requiredLead");
  const scoreBeforeHistoryCells = normalizeScoreBeforeCells(
    rawInput.scoreBeforeHistoryCells || [],
  );
  const settlementWindows = (rawInput.settlementWindowDomains || [])
    .map(normalizeWindow);
  if (!settlementWindows.length) {
    throw new Error("history_bound_terminal_settlement_windows_required");
  }
  const windowKeys = new Set(settlementWindows.map((window) => window.windowKey));
  if (windowKeys.size !== settlementWindows.length) {
    throw new Error("history_bound_terminal_duplicate_window_key");
  }
  const maximumPresets = Math.max(1, Math.floor(Number(
    rawOptions.maximumPresets || rawInput.maximumPresets || 10_000,
  )));
  const products = alternativeProducts(settlementWindows);
  const presets = [];
  const mathematicallyExcluded = [];
  const budgetDeferred = [];
  for (const windows of products) {
    const differenceAnalysis = differenceFeasibility(
      terminalHypothesis,
      windows,
      requiredLead,
    );
    for (const scoreCell of scoreBeforeHistoryCells) {
      const candidateIdentity = stableGraphValue({
        terminalHypothesisKey: terminalHypothesis.terminalHypothesisKey,
        scoreBeforeHistoryCellKey: scoreCell.scoreBeforeHistoryCellKey,
        settlementAlternativeKeys: windows.map((window) => window.alternativeKey),
      });
      const candidateKey = `history-bound-terminal-${stableGraphHash(
        candidateIdentity,
        32,
      )}`;
      if (differenceAnalysis && !differenceAnalysis.feasible) {
        mathematicallyExcluded.push(stableGraphValue({
          candidateKey,
          ...candidateIdentity,
          reason: differenceAnalysis.contradiction?.reason ||
            "history_bound_terminal_difference_infeasible",
          differenceAnalysisHash: differenceAnalysis.analysisHash,
        }));
        continue;
      }
      const trajectory = trajectoryForCandidate(
        terminalHypothesis,
        scoreCell,
        windows,
        requiredLead,
      );
      if (trajectory.exclusion) {
        mathematicallyExcluded.push(stableGraphValue({
          candidateKey,
          ...candidateIdentity,
          ...trajectory.exclusion,
        }));
        continue;
      }
      const identity = stableGraphValue({
        schemaVersion:
          WARMACHINE_STEAMROLLER_HISTORY_BOUND_TERMINAL_PRESET_V1_SCHEMA,
        candidateKey,
        terminalHypothesis,
        requiredLead,
        scoreBeforeHistoryCell: scoreCell,
        settlementWindows: windows,
        scoreTrajectory: trajectory.trajectory,
        finalScore: trajectory.finalScore,
        differenceFeasibility: differenceAnalysis,
        geometryObligationCount: windows.reduce((sum, window) =>
          sum + window.sources.length, 0),
        strictCertified: false,
        branchReachabilityProven: false,
        trainingTruth: false,
      });
      const preset = stableGraphValue({
        ...identity,
        presetHash: stableGraphHash(identity),
      });
      if (presets.length < maximumPresets) presets.push(preset);
      else budgetDeferred.push(stableGraphValue({
        candidateKey,
        ...candidateIdentity,
        reason: "history_bound_terminal_preset_budget_exhausted",
      }));
    }
  }
  presets.sort((left, right) => left.candidateKey.localeCompare(right.candidateKey));
  mathematicallyExcluded.sort((left, right) =>
    left.candidateKey.localeCompare(right.candidateKey));
  budgetDeferred.sort((left, right) =>
    left.candidateKey.localeCompare(right.candidateKey));
  const totalCandidateMass = BigInt(products.length) *
    BigInt(scoreBeforeHistoryCells.length);
  const disposedMass = BigInt(presets.length + mathematicallyExcluded.length +
    budgetDeferred.length);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_STEAMROLLER_HISTORY_BOUND_TERMINAL_DOMAIN_V1_SCHEMA,
    terminalHypothesis,
    hostReceiptHash: String(rawInput.hostReceiptHash ||
      warmachineHost.receipt.receiptHash),
    requiredLead,
    scoreBeforeHistoryCells,
    settlementWindowDomains: settlementWindows,
    presets,
    mathematicallyExcluded,
    budgetDeferred,
    counts: {
      settlementWindowCount: settlementWindows.length,
      scoreBeforeHistoryCellCount: scoreBeforeHistoryCells.length,
      settlementAlternativeProductCount: String(products.length),
      totalCandidateMass: String(totalCandidateMass),
      generatedPresetCount: String(presets.length),
      mathematicallyExcludedCount: String(mathematicallyExcluded.length),
      budgetDeferredCount: String(budgetDeferred.length),
    },
    candidateMassConserved: totalCandidateMass === disposedMass,
    exactOverDeclaredFiniteInput: budgetDeferred.length === 0,
    strictCertifiedPresetCount: 0,
    claimBoundary: "These presets jointly bind exact score prefixes, settlement windows, source rows and geometry obligations. Difference constraints and exact score arithmetic may exclude impossible histories, but only current-Host strict end-turn replay can bind a concrete reverse branch. Unlisted source, position and action histories remain outside this finite input and are not unreachable conclusions.",
  });
  return {
    ...core,
    domainHash: stableGraphHash(core),
    ok: core.candidateMassConserved,
  };
}

function sourceProjection(row = {}) {
  return stableGraphValue({
    sourceKey: String(row.sourceKey || row.key || ""),
    scoringSideKey: String(row.scoringSideKey || row.sideKey || ""),
    points: Number(row.points || 0),
    elementType: String(row.elementType || ""),
    elementKey: String(row.elementKey || ""),
    scoringWindow: String(row.scoringWindow || ""),
    round: Number(row.round || 0),
    sourceActionType: String(row.sourceActionType || ""),
    sourceEventType: String(row.sourceEventType || ""),
    reason: String(row.reason || ""),
  });
}

function addedScoringRows(predecessor = {}, successor = {}) {
  const beforeByKey = new Map((predecessor.scenario?.scoringHistory || [])
    .map((row) => [String(row.key || ""), stableGraphHash(row)]));
  const retainedPrefixMismatch = [];
  for (const row of predecessor.scenario?.scoringHistory || []) {
    const match = (successor.scenario?.scoringHistory || []).find((candidate) =>
      String(candidate.key || "") === String(row.key || ""));
    if (!match || stableGraphHash(match) !== stableGraphHash(row)) {
      retainedPrefixMismatch.push(String(row.key || ""));
    }
  }
  return {
    rows: (successor.scenario?.scoringHistory || []).filter((row) =>
      !beforeByKey.has(String(row.key || ""))),
    retainedPrefixMismatch,
  };
}

function replaySettlementTransition(transition = {}, window = {}) {
  const predecessor = transition.predecessorState || {};
  const expectedSuccessor = transition.successorState || {};
  const scoped = enumerateWarmachineBenchmarkActionsV2(predecessor, {
    includeActorlessActions: true,
    actionFamilyKeys: ["timing"],
  });
  const action = (scoped.enumeration.actions || []).find((candidate) =>
    candidate.actionType === "end_turn" &&
    (!transition.actionKey || candidate.actionKey === transition.actionKey));
  if (!action) return {
    ok: false,
    reason: "history_bound_terminal_end_turn_not_legal",
    rejectedEndTurns: (scoped.enumeration.rejectedActions || [])
      .filter((candidate) => candidate.actionType === "end_turn")
      .map((candidate) => stableGraphValue(candidate)),
  };
  const step = expandWarmachineStrictPolicyStepV1(
    predecessor,
    () => ({
      scoped,
      action,
      deterministicAction: true,
      nextPolicyCursor: 1,
      actionPatch: stableGraphValue(transition.actionPatch || {}),
    }),
    {
      routeKey: `history-bound-terminal-match:${window.windowKey}`,
      perspectiveSideKey: oppositeSide(window.endingSideKey),
    },
  );
  if (step.stepType !== "deterministic" ||
      step.successor?.transitionAccepted !== true || !step.successor?.state) {
    return {
      ok: false,
      reason: step.reason || "history_bound_terminal_end_turn_strict_rejected",
      stepType: step.stepType,
    };
  }
  const observedSuccessor = step.successor.state;
  const observedHash = warmachineReverseStateSemanticHashV1(observedSuccessor);
  const expectedHash = warmachineReverseStateSemanticHashV1(expectedSuccessor);
  if (observedHash !== expectedHash) return {
    ok: false,
    reason: "history_bound_terminal_successor_state_mismatch",
    observedSuccessorStateHash: observedHash,
    expectedSuccessorStateHash: expectedHash,
  };
  return {
    ok: true,
    predecessor,
    successor: observedSuccessor,
    actionKey: action.actionKey,
    strictReceiptHash: String(step.successor.receiptHash || ""),
    runtimeReceipt: step.successor.runtimeReceipt || null,
    events: stableGraphValue(step.successor.runtimeReceipt?.events || []),
    terminalEvents: stableGraphValue(step.successor.terminalEvents || []),
  };
}

function sourceEvidenceEvent(events = [], source = {}) {
  if (source.elementType === "killbox" ||
      source.sourceFamilyKey === "kill_box_penalty") {
    return events.find((event) => event.eventType === "killbox_penalty" &&
      event.leaderPieceKey === source.elementKey &&
      event.scoringSideKey === source.scoringSideKey &&
      Number(event.points || 0) === Number(source.points || 0)) || null;
  }
  return events.find((event) => event.eventType === "scenario_score" &&
    event.scoringLedgerKey === source.sourceKey &&
    event.sideKey === source.scoringSideKey &&
    Number(event.points || 0) === Number(source.points || 0)) || null;
}

function sourceFamilyForObservedSettlementRow(state = {}, row = {}) {
  const elementType = String(row.elementType || "");
  const elementKey = String(row.elementKey || "");
  if (elementType === "killbox") return "kill_box_penalty";
  if (elementType === "objective") {
    const objective = (state.scenario?.objectives || []).find((entry) =>
      String(entry.objectiveKey || entry.elementKey || "") === elementKey);
    const baseSizeMm = Math.round(Number(objective?.baseSizeMm || 0));
    return [40, 50].includes(baseSizeMm)
      ? `objective_${baseSizeMm}`
      : "ledger_row_derived";
  }
  if (elementType === "scenario_terrain") {
    const terrain = (state.terrain || []).find((entry) =>
      String(entry.terrainKey || entry.elementKey || "") === elementKey);
    const ownerSideKey = String(
      terrain?.ownerSideKey || terrain?.sourceSideKey || "",
    );
    return ownerSideKey && ownerSideKey === String(row.sideKey || "")
      ? "scenario_terrain_own"
      : "scenario_terrain_opponent";
  }
  const familyByElementKey = {
    "both-40mm": "both_40mm_bonus",
    "both-50mm": "both_50mm_bonus",
    "two-own-objectives": "secure_two_own_bonus",
    "three-own-objectives": "secure_three_own_bonus",
  };
  if (familyByElementKey[elementKey]) return familyByElementKey[elementKey];
  if (elementType === "objective_progress") return "third_progress_token_goal";
  if (elementType === "payload_delivery") return "payload_delivery";
  return "ledger_row_derived";
}

function sourceFromObservedSettlementRow(state = {}, row = {}, events = []) {
  const elementType = String(row.elementType || "");
  const elementKey = String(row.elementKey || "");
  const killBoxEvent = elementType === "killbox"
    ? events.find((event) => event.eventType === "killbox_penalty" &&
      String(event.leaderPieceKey || "") === elementKey &&
      String(event.scoringSideKey || "") === String(row.sideKey || ""))
    : null;
  const geometryRequirement = killBoxEvent
    ? {
      relationKind: "ending_side_leader_inside_own_kill_box",
      endingSideKey: String(killBoxEvent.sideKey || ""),
      benefitingSideKey: String(killBoxEvent.scoringSideKey || ""),
      leaderPieceKey: String(killBoxEvent.leaderPieceKey || ""),
      ownTableEdgeKey: String(killBoxEvent.ownTableEdgeKey || ""),
      maximumDistanceIn: Number(killBoxEvent.killBoxDistanceIn || 0),
      baseDistanceIn: Number(killBoxEvent.killBoxBaseDistanceIn || 0),
      extensionIn: Number(killBoxEvent.killBoxExtensionIn || 0),
      observedCompleteBaseDistanceFromOwnEdgeIn: Number(
        killBoxEvent.completeBaseDistanceFromOwnEdgeIn || 0,
      ),
    }
    : null;
  return stableGraphValue({
    sourceKey: String(row.key || ""),
    sourceFamilyKey: sourceFamilyForObservedSettlementRow(state, row),
    scoringSideKey: String(row.sideKey || ""),
    points: Number(row.points || 0),
    elementType,
    elementKey,
    scoringWindow: String(row.scoringWindow || ""),
    sourceActionType: String(row.sourceActionType || "end_turn"),
    sourceEventType: String(
      row.sourceEventType || "steamroller_2026_turn_end_scoring",
    ),
    reason: String(row.reason || "steamroller_2026_turn_end_scoring"),
    ...(geometryRequirement ? { geometryRequirement } : {}),
  });
}

function scoreAndHistoryProjection(state = {}) {
  return stableGraphValue({
    score: scoreMap(state.scenario?.score || {}, "strictHistory.score"),
    scoringHistory: state.scenario?.scoringHistory || [],
  });
}

export function matchWarmachineReverseBranchToHistoryBoundTerminalPresetV1(
  rawInput = {},
) {
  const preset = rawInput.preset || {};
  if (preset.schemaVersion !==
      WARMACHINE_STEAMROLLER_HISTORY_BOUND_TERMINAL_PRESET_V1_SCHEMA) {
    throw new Error("history_bound_terminal_preset_schema_invalid");
  }
  const transitions = rawInput.settlementTransitions || [];
  const transitionsByWindow = new Map();
  for (const transition of transitions) {
    const key = String(transition.windowKey || "");
    if (!key || transitionsByWindow.has(key)) {
      throw new Error(`history_bound_terminal_transition_key_invalid:${key}`);
    }
    transitionsByWindow.set(key, transition);
  }
  const mismatches = [];
  const strictSettlementWitnesses = [];
  for (const [index, window] of preset.settlementWindows.entries()) {
    const trajectory = preset.scoreTrajectory[index];
    const transition = transitionsByWindow.get(window.windowKey);
    if (!transition) {
      mismatches.push({
        windowKey: window.windowKey,
        reason: "history_bound_terminal_settlement_transition_missing",
      });
      continue;
    }
    const replay = replaySettlementTransition(transition, window);
    if (!replay.ok) {
      mismatches.push({ windowKey: window.windowKey, ...replay });
      continue;
    }
    const beforeScore = scoreMap(replay.predecessor.scenario?.score || {},
      `${window.windowKey}.predecessorScore`);
    const afterScore = scoreMap(replay.successor.scenario?.score || {},
      `${window.windowKey}.successorScore`);
    if (stableGraphHash(beforeScore) !== stableGraphHash(trajectory.scoreBefore) ||
        stableGraphHash(afterScore) !== stableGraphHash(trajectory.scoreAfter)) {
      mismatches.push({
        windowKey: window.windowKey,
        reason: "history_bound_terminal_score_trajectory_mismatch",
        expectedScoreBefore: trajectory.scoreBefore,
        observedScoreBefore: beforeScore,
        expectedScoreAfter: trajectory.scoreAfter,
        observedScoreAfter: afterScore,
      });
      continue;
    }
    const added = addedScoringRows(replay.predecessor, replay.successor);
    const expectedSources = window.sources.map(sourceProjection)
      .sort((left, right) => stableGraphHash(left).localeCompare(stableGraphHash(right)));
    const observedSources = added.rows.map(sourceProjection)
      .sort((left, right) => stableGraphHash(left).localeCompare(stableGraphHash(right)));
    if (added.retainedPrefixMismatch.length ||
        stableGraphHash(expectedSources) !== stableGraphHash(observedSources)) {
      mismatches.push({
        windowKey: window.windowKey,
        reason: "history_bound_terminal_scoring_source_mismatch",
        expectedSources,
        observedSources,
        retainedPrefixMismatch: added.retainedPrefixMismatch,
      });
      continue;
    }
    if (replay.runtimeReceipt?.upstreamReceiptHash !==
        warmachineHost.receipt.receiptHash) {
      mismatches.push({
        windowKey: window.windowKey,
        reason: "history_bound_terminal_host_receipt_mismatch",
        expectedHostReceiptHash: warmachineHost.receipt.receiptHash,
        observedHostReceiptHash: String(
          replay.runtimeReceipt?.upstreamReceiptHash || "",
        ),
      });
      continue;
    }
    const sourceEvidenceEvents = window.sources.map((source) => ({
      sourceKey: source.sourceKey,
      event: sourceEvidenceEvent(replay.events, source),
    }));
    const missingSourceEvidenceKeys = sourceEvidenceEvents
      .filter((row) => !row.event).map((row) => row.sourceKey);
    if (missingSourceEvidenceKeys.length) {
      mismatches.push({
        windowKey: window.windowKey,
        reason: "history_bound_terminal_source_evidence_event_missing",
        missingSourceEvidenceKeys,
        observedEventTypes: replay.events.map((event) => event.eventType),
      });
      continue;
    }
    const terminalExpected = trajectory.terminalCheck.terminal === true;
    const terminalObserved = replay.terminalEvents.length > 0;
    if (terminalExpected !== terminalObserved) {
      mismatches.push({
        windowKey: window.windowKey,
        reason: "history_bound_terminal_event_mismatch",
        terminalExpected,
        terminalObserved,
        terminalEvents: replay.terminalEvents,
      });
      continue;
    }
    strictSettlementWitnesses.push(stableGraphValue({
      windowKey: window.windowKey,
      round: window.round,
      endingSideKey: window.endingSideKey,
      predecessorStateHash: warmachineReverseStateSemanticHashV1(
        replay.predecessor,
      ),
      successorStateHash: warmachineReverseStateSemanticHashV1(replay.successor),
      actionKey: replay.actionKey,
      strictReceiptHash: replay.strictReceiptHash,
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      certifiedSourceKeys: window.sources.map((source) => source.sourceKey).sort(),
      sourceEvidenceEvents: sourceEvidenceEvents.map((row) =>
        stableGraphValue({ sourceKey: row.sourceKey, event: row.event })),
      certifiedGeometryObligationCount: window.sources.length,
      terminalEvents: replay.terminalEvents,
    }));
  }
  const allWindowsCertified = mismatches.length === 0 &&
    strictSettlementWitnesses.length === preset.settlementWindows.length;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_STEAMROLLER_HISTORY_BOUND_BRANCH_MATCH_V1_SCHEMA,
    presetHash: String(preset.presetHash || ""),
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    settlementWindowCount: preset.settlementWindows.length,
    strictCertifiedWindowCount: strictSettlementWitnesses.length,
    strictSettlementWitnesses,
    mismatches,
    allWindowsCertified,
    branchCanAttachToPreset: allWindowsCertified,
    geometryObligationsCertifiedByHost: allWindowsCertified
      ? Number(preset.geometryObligationCount || 0)
      : 0,
    reachabilityBeyondSuppliedSettlementsProven: false,
    trainingTruth: false,
    claimBoundary: "A branch attaches only when current-Host strict end-turn replay reproduces the exact successor, score trajectory and complete added scoring-row set for every declared window. This certifies the supplied settlement windows, not omitted actions between them or deployment-to-terminal reachability.",
  });
  return {
    ...core,
    matchHash: stableGraphHash(core),
    ok: allWindowsCertified,
  };
}

export function certifyWarmachineStrictSettlementHistoryBindingV1(
  rawInput = {},
) {
  const transitions = rawInput.settlementTransitions || [];
  if (!Array.isArray(transitions) || !transitions.length) {
    throw new Error("strict_history_binding_settlement_transitions_required");
  }
  const failures = [];
  const settlementWindowDomains = [];
  const strictPreflightWitnesses = [];
  let previousSuccessorProjection = null;
  for (const [index, transition] of transitions.entries()) {
    const predecessor = transition.predecessorState || {};
    const expectedSuccessor = transition.successorState || {};
    const round = positiveInteger(
      transition.round || predecessor.turnNumber,
      `strictHistory.transition[${index}].round`,
    );
    const endingSideKey = sideKey(
      transition.endingSideKey || predecessor.activeSideKey,
      `strictHistory.transition[${index}].endingSideKey`,
    );
    const windowKey = String(transition.windowKey ||
      `strict-history-round-${round}-${endingSideKey}-${index + 1}`);
    if (Number(predecessor.turnNumber || 0) !== round ||
        String(predecessor.activeSideKey || "") !== endingSideKey) {
      failures.push(stableGraphValue({
        windowKey,
        reason: "strict_history_binding_window_state_identity_mismatch",
        declaredRound: round,
        observedRound: Number(predecessor.turnNumber || 0),
        declaredEndingSideKey: endingSideKey,
        observedEndingSideKey: String(predecessor.activeSideKey || ""),
      }));
      continue;
    }
    const predecessorProjection = scoreAndHistoryProjection(predecessor);
    if (previousSuccessorProjection && stableGraphHash(predecessorProjection) !==
        stableGraphHash(previousSuccessorProjection)) {
      failures.push(stableGraphValue({
        windowKey,
        reason: "strict_history_binding_intervening_score_history_drift",
        previousSuccessorProjection,
        currentPredecessorProjection: predecessorProjection,
      }));
      continue;
    }
    const replay = replaySettlementTransition(transition, {
      windowKey,
      round,
      endingSideKey,
    });
    if (!replay.ok) {
      failures.push(stableGraphValue({ windowKey, ...replay }));
      continue;
    }
    const added = addedScoringRows(replay.predecessor, replay.successor);
    if (added.retainedPrefixMismatch.length) {
      failures.push(stableGraphValue({
        windowKey,
        reason: "strict_history_binding_retained_score_prefix_mismatch",
        retainedPrefixMismatch: added.retainedPrefixMismatch,
      }));
      continue;
    }
    const sources = added.rows.map((row) =>
      sourceFromObservedSettlementRow(replay.predecessor, row, replay.events));
    settlementWindowDomains.push(stableGraphValue({
      windowKey,
      round,
      endingSideKey,
      alternatives: [{
        alternativeKey: `strict-observed-${stableGraphHash({
          windowKey,
          sources,
        }, 20)}`,
        sources,
      }],
    }));
    strictPreflightWitnesses.push(stableGraphValue({
      windowKey,
      round,
      endingSideKey,
      predecessorStateHash: warmachineReverseStateSemanticHashV1(
        replay.predecessor,
      ),
      successorStateHash: warmachineReverseStateSemanticHashV1(
        replay.successor,
      ),
      strictReceiptHash: replay.strictReceiptHash,
      sourceKeys: sources.map((source) => source.sourceKey).sort(),
      scoreBefore: scoreMap(replay.predecessor.scenario?.score || {},
        `${windowKey}.scoreBefore`),
      scoreAfter: scoreMap(replay.successor.scenario?.score || {},
        `${windowKey}.scoreAfter`),
      terminalEvents: replay.terminalEvents,
    }));
    previousSuccessorProjection = scoreAndHistoryProjection(replay.successor);
  }
  const report = (fields = {}) => {
    const core = stableGraphValue({
      schemaVersion: WARMACHINE_STEAMROLLER_STRICT_HISTORY_BINDING_V1_SCHEMA,
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      declaredSettlementWindowCount: transitions.length,
      strictPreflightWindowCount: strictPreflightWitnesses.length,
      strictPreflightWitnesses,
      failures,
      ...fields,
      reachabilityBeyondSuppliedSettlementsProven: false,
      trainingTruth: false,
      claimBoundary: "This adapter derives one finite history-bound preset only from supplied current-Host strict end-turn transitions, then independently replays and matches every score row. It rejects score/history drift between windows. It does not infer omitted position histories, branch probability, deployment reachability or strategy value.",
    });
    return { ...core, bindingHash: stableGraphHash(core) };
  };
  if (failures.length || settlementWindowDomains.length !== transitions.length) {
    return report({
      ok: false,
      strictCertified: false,
      reason: "strict_history_binding_preflight_failed",
      domain: null,
      preset: null,
      branchMatch: null,
    });
  }
  const firstPredecessor = transitions[0].predecessorState || {};
  const domain = buildWarmachineSteamrollerHistoryBoundTerminalDomainV1({
    terminalHypothesis: rawInput.terminalHypothesis || {},
    requiredLead: rawInput.requiredLead || 3,
    scoreBeforeHistoryCells: [{
      scoreBeforeHistoryCellKey: String(rawInput.scoreBeforeHistoryCellKey ||
        "strict-observed-opening-score"),
      scoreBySide: scoreMap(firstPredecessor.scenario?.score || {},
        "strictHistory.initialScore"),
    }],
    settlementWindowDomains,
  }, { maximumPresets: 1 });
  if (domain.presets.length !== 1) {
    return report({
      ok: false,
      strictCertified: false,
      reason: "strict_history_binding_observed_history_mathematically_excluded",
      domain,
      preset: null,
      branchMatch: null,
    });
  }
  const preset = domain.presets[0];
  const branchMatch =
    matchWarmachineReverseBranchToHistoryBoundTerminalPresetV1({
      preset,
      settlementTransitions: transitions.map((transition, index) => ({
        ...transition,
        windowKey: settlementWindowDomains[index].windowKey,
      })),
    });
  return report({
    ok: branchMatch.ok === true,
    strictCertified: branchMatch.ok === true,
    reason: branchMatch.ok
      ? "strict_history_binding_certified"
      : "strict_history_binding_branch_match_failed",
    domain,
    preset,
    branchMatch,
  });
}
