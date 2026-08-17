import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineSteamrollerTerminalScenarioSubcellKeyV1 } from
  "./steamroller-terminal-scenario-corpus-v1.mjs";

export const WARMACHINE_STEAMROLLER_TERMINAL_REPRESENTATIVE_SELECTOR_V1_SCHEMA =
  "warmachine_steamroller_terminal_representative_selector_v1";

const BASELINE_BY_DIMENSION = Object.freeze({
  lifecycle: "both_rosters_complete",
  damage: "critical_models_undamaged",
  resource: "zero_available",
  actionRange: "strictly_inside",
  leaderControl: "strictly_inside",
  lineOfSight: "clear",
  baseTopology: "legal_separated",
  scenarioControl: "winner_secures_uncontested",
  scenarioTerrainSetup: "all_flags_fallback_no_valid_terrain",
  trenchCacheLifecycle: "both_caches_active",
  wolvesProgressState: "at_least_one_objective_at_two",
  wolvesTokenDecision: "eligible_add_token_declined",
  wolvesObjectiveMove: "move_not_triggered",
  highStakesCountdownState: "one_nonzero_element_reduced",
  highStakesFuseResolution: "secured_50mm_remove_one",
  highStakesBlastClosure: "no_detonation",
  payloadLifecycle: "both_payloads_active",
  payloadMoveDecision: "eligible_move_declined",
  madeToHaulDecision: "not_triggered",
});

function oppositeRelation(left = "", right = "") {
  if (!left || !right) return "not_applicable";
  return left === right ? "same" : "opposed";
}

function skeletonObligations(cell = {}) {
  const roundKind = cell.roundClass?.exactRoundNumber
    ? "exact"
    : cell.roundClass?.equivalenceStatus || "unknown";
  return [...new Set([
    `scenario:${cell.scenarioKey}`,
    `terminal:${cell.terminalClassKey}`,
    `scenario_terminal:${cell.scenarioKey}:${cell.terminalClassKey}`,
    `terminal_cause:${cell.terminalClassKey}:${cell.causalActionFamily || "none"}`,
    `terminal_result:${cell.terminalClassKey}:${cell.resultKind || "none"}`,
    `terminal_round_kind:${cell.terminalClassKey}:${roundKind}`,
    `terminal_round:${cell.terminalClassKey}:${cell.roundClass?.representativeRoundNumber || 0}`,
    `source_status:${cell.sourceResolutionStatus || "unknown"}`,
    `attacker_winner:${oppositeRelation(cell.attackerSideKey, cell.winnerSideKey)}`,
    `ending_winner:${oppositeRelation(cell.endingSideKey, cell.winnerSideKey)}`,
    `attacker_ending:${oppositeRelation(cell.attackerSideKey, cell.endingSideKey)}`,
    ...(cell.tiebreakClassKey
      ? [`terminal_tiebreak:${cell.terminalClassKey}:${cell.tiebreakClassKey}`]
      : []),
  ])].sort();
}

function selectSkeletonCells(cells = [], maximumSkeletonCells = 0) {
  const candidates = cells.map((cell) => ({
    cell,
    obligations: skeletonObligations(cell),
  })).sort((left, right) => left.cell.cellKey.localeCompare(right.cell.cellKey));
  const universe = new Set(candidates.flatMap((row) => row.obligations));
  const uncovered = new Set(universe);
  const selected = [];
  const remaining = [...candidates];
  while (remaining.length && selected.length < maximumSkeletonCells && uncovered.size) {
    remaining.sort((left, right) => {
      const leftGain = left.obligations.filter((key) => uncovered.has(key)).length;
      const rightGain = right.obligations.filter((key) => uncovered.has(key)).length;
      return rightGain - leftGain || left.cell.cellKey.localeCompare(right.cell.cellKey);
    });
    const next = remaining.shift();
    const gain = next.obligations.filter((key) => uncovered.has(key));
    if (!gain.length) break;
    selected.push(next);
    for (const key of gain) uncovered.delete(key);
  }
  return {
    selected,
    obligationCount: universe.size,
    coveredObligationCount: universe.size - uncovered.size,
    uncoveredObligations: [...uncovered].sort(),
  };
}

function baselineCoordinates(cell = {}) {
  const scoreLike = [
    "lead_three_after_opponent_turn_scoring",
    "fixed_round_limit_result",
  ].includes(cell.terminalClassKey);
  return Object.fromEntries(Object.entries(cell.partitions || {}).map(([dimensionKey, values]) => {
    let preferred = BASELINE_BY_DIMENSION[dimensionKey];
    if (dimensionKey === "leaderControl" && scoreLike) preferred = "outside_or_not_required";
    if (dimensionKey === "scenarioControl" &&
        cell.terminalClassKey === "fixed_round_limit_result") {
      preferred = "not_applicable";
    }
    return [dimensionKey, values.includes(preferred) ? preferred : values[0]];
  }));
}

function representativeCoordinateRows(cell = {}) {
  const baseline = baselineCoordinates(cell);
  const rows = [{
    reason: "legal_baseline",
    changedDimensionKey: "",
    coordinates: baseline,
  }];
  for (const [dimensionKey, values] of Object.entries(cell.partitions || {}).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    for (const value of values) {
      if (value === baseline[dimensionKey]) continue;
      rows.push({
        reason: "single_dimension_value_coverage",
        changedDimensionKey: dimensionKey,
        coordinates: { ...baseline, [dimensionKey]: value },
      });
    }
  }
  return rows;
}

function partitionValueObligations(cell = {}, coordinates = {}) {
  return Object.entries(coordinates).map(([dimensionKey, value]) =>
    `${cell.cellKey}:${dimensionKey}:${value}`).sort();
}

function expectedNextDisposition(cell = {}, coordinates = {}) {
  if (cell.sourceResolutionStatus !== "officially_confirmed") return "source_unresolved";
  if (cell.roundClass?.exactRoundNumber !== true) return "round_equivalence_unresolved";
  if (Object.values(coordinates).some((value) => String(value).includes("expected_reject"))) {
    return "expected_strict_reject";
  }
  return "strict_materialization_pending";
}

function countBy(rows = [], keyFn = () => "") {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right)));
}

function evidencePinRows(corpus = {}, pins = []) {
  const cellsByKey = new Map((corpus.cells || []).map((cell) => [cell.cellKey, cell]));
  const rows = [];
  const seen = new Set();
  for (const pin of pins) {
    const cell = cellsByKey.get(String(pin.cellKey || ""));
    if (!cell) throw new Error(`terminal_representative_pin_cell_missing:${pin.cellKey || ""}`);
    const coordinates = stableGraphValue(pin.coordinates || pin.partitionCoordinates || {});
    const subcellKey = warmachineSteamrollerTerminalScenarioSubcellKeyV1(cell, coordinates);
    if (pin.subcellKey && String(pin.subcellKey) !== subcellKey) {
      throw new Error(`terminal_representative_pin_subcell_mismatch:${pin.subcellKey}`);
    }
    if (seen.has(subcellKey)) continue;
    seen.add(subcellKey);
    rows.push(stableGraphValue({
      cellKey: cell.cellKey,
      subcellKey,
      scenarioKey: cell.scenarioKey,
      terminalClassKey: cell.terminalClassKey,
      roundClassKey: cell.roundClass?.roundClassKey || "",
      representativeRoundNumber: cell.roundClass?.representativeRoundNumber || 0,
      sourceResolutionStatus: cell.sourceResolutionStatus,
      skeletonObligations: skeletonObligations(cell),
      selectionReason: "strict_evidence_pin",
      changedDimensionKey: "",
      coordinates,
      partitionValueObligations: partitionValueObligations(cell, coordinates),
      expectedNextDisposition: expectedNextDisposition(cell, coordinates),
      pinnedEvidenceDisposition: String(pin.disposition || ""),
      pinnedEvidenceReceiptHash: String(pin.receiptHash || ""),
      pinnedEvidenceReplayReceiptHash: String(pin.replayReceiptHash || ""),
    }));
  }
  return rows.sort((left, right) => left.subcellKey.localeCompare(right.subcellKey));
}

export function selectWarmachineSteamrollerTerminalRepresentativesV1({
  corpus = {},
  maximumSkeletonCells = 64,
  maximumRepresentativeSubcells = 4096,
  pinnedRepresentatives = [],
} = {}) {
  if (corpus.coverage?.denominatorComplete !== true) {
    throw new Error("terminal_representative_selector_corpus_denominator_incomplete");
  }
  const skeletonBudget = Math.max(0, Math.floor(Number(maximumSkeletonCells) || 0));
  const subcellBudget = Math.max(0, Math.floor(Number(maximumRepresentativeSubcells) || 0));
  const pinnedRows = evidencePinRows(corpus, pinnedRepresentatives);
  if (pinnedRows.length > subcellBudget) {
    throw new Error("terminal_representative_pin_count_exceeds_subcell_budget");
  }
  const skeletonSelection = selectSkeletonCells(corpus.cells || [], skeletonBudget);
  const proposedRows = skeletonSelection.selected.flatMap(({ cell, obligations }) =>
    representativeCoordinateRows(cell).map((row) => {
      const subcellKey = warmachineSteamrollerTerminalScenarioSubcellKeyV1(
        cell,
        row.coordinates,
      );
      return stableGraphValue({
        cellKey: cell.cellKey,
        subcellKey,
        scenarioKey: cell.scenarioKey,
        terminalClassKey: cell.terminalClassKey,
        roundClassKey: cell.roundClass?.roundClassKey || "",
        representativeRoundNumber: cell.roundClass?.representativeRoundNumber || 0,
        sourceResolutionStatus: cell.sourceResolutionStatus,
        skeletonObligations: obligations,
        selectionReason: row.reason,
        changedDimensionKey: row.changedDimensionKey,
        coordinates: row.coordinates,
        partitionValueObligations: partitionValueObligations(cell, row.coordinates),
        expectedNextDisposition: expectedNextDisposition(cell, row.coordinates),
      });
    }));
  proposedRows.sort((left, right) => {
    const leftBaseline = left.selectionReason === "legal_baseline" ? 0 : 1;
    const rightBaseline = right.selectionReason === "legal_baseline" ? 0 : 1;
    return leftBaseline - rightBaseline ||
      left.scenarioKey.localeCompare(right.scenarioKey) ||
      left.terminalClassKey.localeCompare(right.terminalClassKey) ||
      left.cellKey.localeCompare(right.cellKey) ||
      left.changedDimensionKey.localeCompare(right.changedDimensionKey) ||
      left.subcellKey.localeCompare(right.subcellKey);
  });
  const pinnedKeys = new Set(pinnedRows.map((row) => row.subcellKey));
  const selectedCoverageRows = proposedRows.filter((row) => !pinnedKeys.has(row.subcellKey))
    .slice(0, subcellBudget - pinnedRows.length);
  const selectedRepresentatives = [...pinnedRows, ...selectedCoverageRows].sort((left, right) => {
    const leftPinned = left.selectionReason === "strict_evidence_pin" ? 0 : 1;
    const rightPinned = right.selectionReason === "strict_evidence_pin" ? 0 : 1;
    return leftPinned - rightPinned || left.subcellKey.localeCompare(right.subcellKey);
  });
  const allPartitionObligations = new Set(proposedRows.flatMap((row) =>
    row.partitionValueObligations));
  const coveredPartitionObligations = new Set([
    ...selectedCoverageRows,
    ...pinnedRows,
  ].flatMap((row) => row.partitionValueObligations)
    .filter((obligation) => allPartitionObligations.has(obligation)));
  const proposedAuditMass = BigInt(corpus.counts?.proposedSubcellCount || 0);
  const selectedAuditMass = BigInt(selectedRepresentatives.length);
  if (selectedAuditMass > proposedAuditMass) {
    throw new Error("terminal_representative_selector_selected_mass_exceeds_corpus");
  }
  const core = {
    schemaVersion: WARMACHINE_STEAMROLLER_TERMINAL_REPRESENTATIVE_SELECTOR_V1_SCHEMA,
    corpusHash: corpus.corpusHash,
    hostReceiptHash: corpus.hostReceiptHash,
    policy: {
      skeletonSelection: "deterministic_greedy_obligation_cover",
      subcellSelection: "legal_baseline_plus_single_dimension_variation",
      interactionStrength: 1,
      strategyScoreUsed: false,
      eagerCartesianEnumerationUsed: false,
      strictEvidencePinsAlterCoverageObligations: false,
    },
    budgets: {
      maximumSkeletonCells: skeletonBudget,
      maximumRepresentativeSubcells: subcellBudget,
    },
    skeletonCoverage: {
      proposedSkeletonCellCount: (corpus.cells || []).length,
      selectedSkeletonCellCount: skeletonSelection.selected.length,
      deferredSkeletonCellCount:
        (corpus.cells || []).length - skeletonSelection.selected.length,
      obligationCount: skeletonSelection.obligationCount,
      coveredObligationCount: skeletonSelection.coveredObligationCount,
      uncoveredObligationCount: skeletonSelection.uncoveredObligations.length,
      uncoveredObligations: skeletonSelection.uncoveredObligations,
      completeWithinDeclaredObligations: skeletonSelection.uncoveredObligations.length === 0,
    },
    partitionValueCoverage: {
      obligationCount: allPartitionObligations.size,
      coveredObligationCount: coveredPartitionObligations.size,
      deferredObligationCount: allPartitionObligations.size - coveredPartitionObligations.size,
      completeWithinSelectedSkeletons:
        coveredPartitionObligations.size === allPartitionObligations.size,
    },
    evidencePinCoverage: {
      requestedPinCount: pinnedRepresentatives.length,
      selectedUniquePinCount: pinnedRows.length,
      duplicatePinCount: pinnedRepresentatives.length - pinnedRows.length,
      allPinsSelected: pinnedRows.every((row) =>
        selectedRepresentatives.some((candidate) => candidate.subcellKey === row.subcellKey)),
    },
    denominator: {
      proposedSubcellCount: String(proposedAuditMass),
      selectedRepresentativeSubcellCount: String(selectedAuditMass),
      unselectedSubcellCount: String(proposedAuditMass - selectedAuditMass),
      conserved: proposedAuditMass ===
        selectedAuditMass + (proposedAuditMass - selectedAuditMass),
    },
    selectedSkeletonCells: skeletonSelection.selected.map(({ cell, obligations }) =>
      stableGraphValue({
        cellKey: cell.cellKey,
        scenarioKey: cell.scenarioKey,
        terminalClassKey: cell.terminalClassKey,
        roundClassKey: cell.roundClass?.roundClassKey || "",
        sourceResolutionStatus: cell.sourceResolutionStatus,
        obligations,
      })),
    selectedRepresentatives,
    representativeDispositionCounts: countBy(
      selectedRepresentatives,
      (row) => row.expectedNextDisposition,
    ),
    scenarioCounts: countBy(selectedRepresentatives, (row) => row.scenarioKey),
    terminalClassCounts: countBy(selectedRepresentatives, (row) => row.terminalClassKey),
    claimBoundary: "Representative selection covers declared skeleton and single-dimension obligations without enumerating the Cartesian corpus. Selection is neither reachability, strict certification nor strategy value. Cross-dimension interactions remain unresolved until a higher-strength covering batch is explicitly requested and strict-materialized.",
  };
  return stableGraphValue({
    ...core,
    selectionHash: stableGraphHash(core),
  });
}
