import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_TERMINAL_HYPOTHESIS_DOMAIN_V1_SCHEMA =
  "warmachine_terminal_hypothesis_domain_v1";
export const WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA =
  "warmachine_terminal_hypothesis_cell_v1";

const ASSUMPTION_SOURCES = new Set([
  "rule_derived",
  "user_constrained",
  "optimistic_proposal",
  "randomized_proposal",
]);

const FORBIDDEN_ORACLE_KEYS = new Set([
  "forwardOracle",
  "forwardRoute",
  "opening",
  "openingState",
  "routeSteps",
  "strictReceipts",
  "intermediateState",
  "intermediateStates",
]);

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || "").trim()).filter(Boolean))].sort();
}

function finiteIntegers(values = [], minimum = 1, maximum = 7) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(Number)
    .filter((value) => Number.isInteger(value) && value >= minimum && value <= maximum))]
    .sort((left, right) => left - right);
}

function sourceRecord(value, fallback = "optimistic_proposal") {
  const source = String(value || fallback);
  if (!ASSUMPTION_SOURCES.has(source)) {
    throw new Error(`terminal_hypothesis_assumption_source_invalid:${source}`);
  }
  return source;
}

function collectForbiddenOraclePaths(value, path = "input", output = []) {
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_ORACLE_KEYS.has(key)) output.push(childPath);
    collectForbiddenOraclePaths(child, childPath, output);
  }
  return output;
}

function cartesian(dimensions = []) {
  return dimensions.reduce((rows, dimension) => rows.flatMap((row) =>
    dimension.values.map((value) => ({
      values: { ...row.values, [dimension.key]: value },
      sources: { ...row.sources, [dimension.key]: dimension.source },
    }))), [{ values: {}, sources: {} }]);
}

function dimension(key, values, source, required = true) {
  const normalized = key === "roundNumber"
    ? finiteIntegers(values)
    : uniqueStrings(values);
  if (required && !normalized.length) {
    throw new Error(`terminal_hypothesis_dimension_empty:${key}`);
  }
  return {
    key,
    values: normalized,
    source: sourceRecord(source),
  };
}

function structuredDimension(key, values, source, normalize, required = true) {
  const normalized = (Array.isArray(values) ? values : [values])
    .filter((value) => value && typeof value === "object")
    .map(normalize);
  const unique = Array.from(new Map(normalized.map((value) => [
    stableGraphHash(value),
    value,
  ])).values()).sort((left, right) =>
    stableGraphHash(left).localeCompare(stableGraphHash(right)));
  if (required && !unique.length) {
    throw new Error(`terminal_hypothesis_dimension_empty:${key}`);
  }
  return {
    key,
    values: unique,
    source: sourceRecord(source),
  };
}

function normalizeSidePoints(raw = {}, fieldName = "scoreBySide") {
  const source = raw[fieldName] || {};
  const rows = Object.entries(source).map(([sideKey, value]) => [
    String(sideKey || ""),
    Number(value),
  ]).filter(([sideKey, value]) => sideKey && Number.isInteger(value) && value >= 0)
    .sort(([left], [right]) => left.localeCompare(right));
  if (!rows.length || rows.length !== Object.keys(source).length) {
    throw new Error(`terminal_hypothesis_score_map_invalid:${fieldName}`);
  }
  return Object.fromEntries(rows);
}

function normalizeScoreBeforeTerminalCell(raw = {}) {
  const relationKey = String(raw.relationKey || raw.cellKey || "");
  if (!relationKey) throw new Error("terminal_hypothesis_score_before_relation_required");
  return stableGraphValue({
    relationKey,
    scoreBySide: normalizeSidePoints(raw, "scoreBySide"),
  });
}

function normalizeTerminalScoreGainCell(raw = {}) {
  const relationKey = String(raw.relationKey || raw.cellKey || "");
  if (!relationKey) throw new Error("terminal_hypothesis_score_gain_relation_required");
  return stableGraphValue({
    relationKey,
    scoreGainBySide: normalizeSidePoints(raw, "scoreGainBySide"),
  });
}

function normalizeTerminalOutcomeCell(raw = {}) {
  const relationKey = String(raw.relationKey || raw.cellKey || "");
  if (!relationKey) throw new Error("terminal_hypothesis_outcome_relation_required");
  const resultKind = String(raw.resultKind || "win");
  if (!["win", "tie"].includes(resultKind)) {
    throw new Error(`terminal_hypothesis_outcome_result_kind_invalid:${resultKind}`);
  }
  const winnerSideKey = String(raw.winnerSideKey || "");
  const loserSideKey = String(raw.loserSideKey || "");
  if (resultKind === "win" && (!winnerSideKey || !loserSideKey ||
      winnerSideKey === loserSideKey)) {
    throw new Error("terminal_hypothesis_outcome_winner_loser_invalid");
  }
  if (resultKind === "tie" && (winnerSideKey || loserSideKey)) {
    throw new Error("terminal_hypothesis_tie_must_not_name_winner_or_loser");
  }
  return stableGraphValue({
    relationKey,
    resultKind,
    winnerSideKey: winnerSideKey || null,
    loserSideKey: loserSideKey || null,
    tiebreakClassKey: String(raw.tiebreakClassKey || ""),
    sourceResolutionStatus: String(raw.sourceResolutionStatus || "officially_confirmed"),
  });
}

function normalizeGeometryCell(raw = {}) {
  const relationKind = String(raw.relationKind || "");
  if (!relationKind) throw new Error("terminal_hypothesis_geometry_relation_required");
  const relationChecks = (Array.isArray(raw.relationChecks) ? raw.relationChecks : [])
    .map((check, index) => stableGraphValue({
      relationKey: String(check.relationKey || `relation-${index}`),
      relationKind: String(check.relationKind || ""),
      sourcePieceKey: String(check.sourcePieceKey || check.actorPieceKey || ""),
      targetPieceKey: String(check.targetPieceKey || check.affectedPieceKey || ""),
      profileKey: String(check.profileKey || ""),
      minimumDistanceIn: check.minimumDistanceIn == null
        ? null
        : Number(check.minimumDistanceIn),
      maximumDistanceIn: check.maximumDistanceIn == null
        ? null
        : Number(check.maximumDistanceIn),
    }));
  if (relationChecks.some((check) => !check.relationKind)) {
    throw new Error("terminal_hypothesis_geometry_relation_check_kind_required");
  }
  return stableGraphValue({
    relationKind,
    actorToTargetRangeBand: String(raw.actorToTargetRangeBand || "rule_legal_range"),
    lineOfSightRelation: String(raw.lineOfSightRelation || "strict_los_required"),
    pathRelation: String(raw.pathRelation || "strict_path_required"),
    baseRelation: String(raw.baseRelation || "legal_nonoverlap"),
    scenarioRelation: String(raw.scenarioRelation || "not_applicable"),
    exactCoordinatesKnown: raw.exactCoordinatesKnown === true,
    exactCoordinates: raw.exactCoordinatesKnown === true
      ? stableGraphValue(raw.exactCoordinates || {})
      : null,
    relationChecks,
    materializationRequired: raw.exactCoordinatesKnown !== true,
  });
}

function geometryDimension(spec = {}) {
  const cells = (spec.geometryRelationCells || []).map(normalizeGeometryCell);
  if (!cells.length) throw new Error("terminal_hypothesis_geometry_cells_empty");
  return {
    key: "geometryRelationCell",
    values: cells,
    source: sourceRecord(spec.assumptionSources?.geometryRelationCell),
  };
}

function validateSides(cell = {}) {
  if (cell.resultKind === "tie") {
    if (cell.winnerSideKey || cell.loserSideKey) {
      throw new Error("terminal_hypothesis_tie_has_result_side");
    }
  } else if (!cell.winnerSideKey || !cell.loserSideKey) {
    throw new Error("terminal_hypothesis_winner_loser_required");
  }
  if (cell.resultKind !== "tie" && cell.winnerSideKey === cell.loserSideKey) {
    throw new Error("terminal_hypothesis_winner_loser_same_side");
  }
  if (cell.goalType === "scenario_score" && cell.endingSideKey === cell.winnerSideKey) {
    throw new Error("terminal_hypothesis_score_must_settle_on_opponent_turn");
  }
}

function cellFromProduct(spec, product, domain) {
  const values = product.values;
  const goalType = String(spec.goalType || "");
  const terminalOutcomeCell = values.terminalOutcomeCell || null;
  const resultKind = String(terminalOutcomeCell?.resultKind || "win");
  const common = {
    schemaVersion: WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA,
    goalType,
    scenarioKey: domain.scenarioKey,
    scenarioPacketKey: domain.scenarioPacketKey,
    scenarioPacketYear: domain.scenarioPacketYear,
    hostReceiptHash: domain.hostReceiptHash,
    rosterReceiptHash: domain.rosterReceiptHash,
    roundNumber: values.roundNumber,
    resultKind,
    winnerSideKey: terminalOutcomeCell
      ? terminalOutcomeCell.winnerSideKey
      : values.winnerSideKey,
    loserSideKey: terminalOutcomeCell
      ? terminalOutcomeCell.loserSideKey
      : values.loserSideKey,
    endingSideKey: values.endingSideKey,
    attackerSideKey: values.attackerSideKey || null,
    defenderSideKey: values.defenderSideKey || null,
    causalActionFamily: values.causalActionFamily,
    geometryRelationCell: values.geometryRelationCell,
    assumptionSources: stableGraphValue({
      ...product.sources,
      goalType: sourceRecord(spec.assumptionSources?.goalType, "user_constrained"),
      scenarioKey: sourceRecord(spec.assumptionSources?.scenarioKey, "rule_derived"),
      rosterReceiptHash: sourceRecord(
        spec.assumptionSources?.rosterReceiptHash,
        "user_constrained",
      ),
    }),
    trainingTruth: false,
    strictCertified: false,
    reachabilityProven: false,
  };
  let detail;
  if (goalType === "assassination") detail = {
    actorPieceKey: values.actorPieceKey,
    targetLeaderPieceKey: values.targetLeaderPieceKey,
    targetBoxesBeforeFinal: Number(values.targetBoxesBeforeFinal),
    resourceEnvelopeKey: values.resourceEnvelopeKey,
    terminalRequirement: "winner_is_only_side_with_leader_models_remaining",
  };
  else if (goalType === "scenario_score") detail = {
    scoringElementKey: values.scoringElementKey,
    scoreBeforeTerminalKey: values.scoreBeforeTerminalCell.relationKey,
    scoreBeforeTerminalCell: values.scoreBeforeTerminalCell,
    terminalScoreGainKey: values.terminalScoreGainCell.relationKey,
    terminalScoreGainCell: values.terminalScoreGainCell,
    terminalRequirement: "lead_at_least_three_after_scoring_on_opponent_turn",
  };
  else if (goalType === "simultaneous_leader_tiebreak") detail = {
    terminalOutcomeKey: terminalOutcomeCell.relationKey,
    terminalOutcomeCell,
    tiebreakClassKey: terminalOutcomeCell.tiebreakClassKey,
    sourceResolutionStatus: terminalOutcomeCell.sourceResolutionStatus,
    terminalRequirement:
      "all_leader_models_simultaneously_destroyed_then_vp_and_scenario_presence_tiebreak",
  };
  else if (goalType === "fixed_round_limit_result") detail = {
    terminalOutcomeKey: terminalOutcomeCell.relationKey,
    terminalOutcomeCell,
    tiebreakClassKey: terminalOutcomeCell.tiebreakClassKey,
    sourceResolutionStatus: terminalOutcomeCell.sourceResolutionStatus,
    terminalRequirement:
      "host_candidate_fixed_game_length_then_vp_and_scenario_presence_tiebreak",
  };
  else throw new Error(`terminal_hypothesis_goal_type_unsupported:${goalType}`);
  const identity = stableGraphValue({ ...common, ...detail });
  validateSides(identity);
  if (identity.attackerSideKey && identity.attackerSideKey === identity.defenderSideKey) {
    throw new Error("terminal_hypothesis_attacker_defender_same_side");
  }
  if (goalType === "fixed_round_limit_result" &&
      identity.endingSideKey !== identity.defenderSideKey) {
    throw new Error("terminal_hypothesis_fixed_round_must_end_on_defender");
  }
  return {
    ...identity,
    cellKey: `terminal-hypothesis-${stableGraphHash(identity, 32)}`,
  };
}

function dimensionsForSpec(spec = {}) {
  const sources = spec.assumptionSources || {};
  const temporalAndGeometry = [
    dimension("roundNumber", spec.roundNumbers, sources.roundNumber),
    dimension("endingSideKey", spec.endingSideKeys, sources.endingSideKey),
    dimension("causalActionFamily", spec.causalActionFamilies, sources.causalActionFamily),
    geometryDimension(spec),
  ];
  if (["simultaneous_leader_tiebreak", "fixed_round_limit_result"].includes(
    spec.goalType,
  )) {
    return [
      ...temporalAndGeometry,
      dimension("attackerSideKey", spec.attackerSideKeys, sources.attackerSideKey),
      dimension("defenderSideKey", spec.defenderSideKeys, sources.defenderSideKey),
      structuredDimension(
        "terminalOutcomeCell",
        spec.terminalOutcomeCells,
        sources.terminalOutcomeCell,
        normalizeTerminalOutcomeCell,
      ),
    ];
  }
  const common = [
    ...temporalAndGeometry,
    dimension("winnerSideKey", spec.winnerSideKeys, sources.winnerSideKey),
    dimension("loserSideKey", spec.loserSideKeys, sources.loserSideKey),
  ];
  if (spec.goalType === "assassination") {
    return [
      ...common,
      dimension("actorPieceKey", spec.actorPieceKeys, sources.actorPieceKey),
      dimension(
        "targetLeaderPieceKey",
        spec.targetLeaderPieceKeys,
        sources.targetLeaderPieceKey,
      ),
      dimension(
        "targetBoxesBeforeFinal",
        finiteIntegers(spec.targetBoxesBeforeFinal, 1, 999).map(String),
        sources.targetBoxesBeforeFinal,
      ),
      dimension(
        "resourceEnvelopeKey",
        spec.resourceEnvelopeKeys || ["strict_payment_required"],
        sources.resourceEnvelopeKey,
      ),
    ];
  }
  if (spec.goalType === "scenario_score") {
    return [
      ...common,
      dimension("scoringElementKey", spec.scoringElementKeys, sources.scoringElementKey),
      structuredDimension(
        "scoreBeforeTerminalCell",
        spec.scoreBeforeTerminalCells,
        sources.scoreBeforeTerminalCell || sources.scoreBeforeTerminalKey,
        normalizeScoreBeforeTerminalCell,
      ),
      structuredDimension(
        "terminalScoreGainCell",
        spec.terminalScoreGainCells,
        sources.terminalScoreGainCell || sources.terminalScoreGainKey,
        normalizeTerminalScoreGainCell,
      ),
    ];
  }
  throw new Error(`terminal_hypothesis_goal_type_unsupported:${spec.goalType}`);
}

export function buildWarmachineTerminalHypothesisDomainV1(rawInput = {}, rawOptions = {}) {
  const forbiddenOraclePaths = collectForbiddenOraclePaths(rawInput);
  if (forbiddenOraclePaths.length) {
    throw new Error(`terminal_hypothesis_forward_oracle_input_forbidden:${
      forbiddenOraclePaths.slice(0, 8).join(",")}`);
  }
  const domain = {
    scenarioKey: String(rawInput.scenarioKey || ""),
    scenarioPacketKey: String(rawInput.scenarioPacketKey || "steamroller-2026"),
    scenarioPacketYear: String(rawInput.scenarioPacketYear || "2026"),
    hostReceiptHash: String(rawInput.hostReceiptHash || ""),
    rosterReceiptHash: String(rawInput.rosterReceiptHash || ""),
  };
  for (const [key, value] of Object.entries(domain)) {
    if (!value) throw new Error(`terminal_hypothesis_domain_field_required:${key}`);
  }
  const specs = Array.isArray(rawInput.specs) ? rawInput.specs : [];
  if (!specs.length) throw new Error("terminal_hypothesis_specs_required");
  const maximumCells = Math.max(1, Number(rawOptions.maximumCells || 10_000));
  const cells = [];
  const omitted = [];
  for (const [specIndex, spec] of specs.entries()) {
    const products = cartesian(dimensionsForSpec(spec));
    for (const product of products) {
      const cell = cellFromProduct(spec, product, domain);
      if (cells.length < maximumCells) cells.push(cell);
      else omitted.push({
        cellKey: cell.cellKey,
        specIndex,
        reason: "terminal_hypothesis_cell_budget_exhausted",
      });
    }
  }
  cells.sort((left, right) => left.cellKey.localeCompare(right.cellKey));
  omitted.sort((left, right) => left.cellKey.localeCompare(right.cellKey));
  const core = {
    schemaVersion: WARMACHINE_TERMINAL_HYPOTHESIS_DOMAIN_V1_SCHEMA,
    ...domain,
    cells,
    omitted,
    counts: {
      specCount: specs.length,
      generatedCellCount: cells.length,
      omittedCellCount: omitted.length,
      assassinationCellCount: cells.filter((cell) =>
        cell.goalType === "assassination").length,
      scenarioScoreCellCount: cells.filter((cell) =>
        cell.goalType === "scenario_score").length,
      simultaneousLeaderTiebreakCellCount: cells.filter((cell) =>
        cell.goalType === "simultaneous_leader_tiebreak").length,
      fixedRoundLimitCellCount: cells.filter((cell) =>
        cell.goalType === "fixed_round_limit_result").length,
    },
    coverageDenominatorComplete: omitted.length === 0,
    oracleIsolationAudit: {
      forbiddenOraclePaths,
      searchInputIncludesOpening: false,
      searchInputIncludesForwardRoute: false,
      searchInputIncludesIntermediateStates: false,
      passed: forbiddenOraclePaths.length === 0,
    },
    claimBoundary: "These finite cells are terminal hypotheses, not reachable states or strategy conclusions. Assumptions remain typed and non-truth until geometry materialization, concrete predecessor generation and rules-v1 strict forward certification succeed. Omitted cells retain explicit coverage debt.",
  };
  return {
    ...core,
    domainHash: stableGraphHash(stableGraphValue(core)),
    ok: core.oracleIsolationAudit.passed && cells.length > 0,
  };
}
