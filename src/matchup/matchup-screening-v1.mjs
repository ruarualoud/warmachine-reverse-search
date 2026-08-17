import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_MATCHUP_SCREENING_V1_SCHEMA =
  "warmachine_matchup_screening_v1";

const DIMENSIONS = Object.freeze([
  "resource_free_removal",
  "resource_optimized_removal",
  "anti_tough_removal",
  "ranged_removal",
  "melee_removal",
  "spray_access",
  "control",
  "mobility",
  "attack_chain",
  "scenario",
  "recursion",
  "defense",
  "model_count",
]);

const DEFAULT_MAP_WEIGHTS = Object.freeze({
  open_lanes: Object.freeze({
    resource_optimized_removal: 0.18,
    anti_tough_removal: 0.14,
    ranged_removal: 0.18,
    spray_access: 0.08,
    control: 0.12,
    mobility: 0.13,
    scenario: 0.08,
    defense: 0.09,
  }),
  mixed_table: Object.freeze({
    resource_free_removal: 0.12,
    resource_optimized_removal: 0.12,
    anti_tough_removal: 0.14,
    ranged_removal: 0.08,
    melee_removal: 0.08,
    spray_access: 0.06,
    control: 0.12,
    mobility: 0.1,
    attack_chain: 0.06,
    scenario: 0.06,
    defense: 0.06,
  }),
  dense_chokepoints: Object.freeze({
    resource_free_removal: 0.12,
    anti_tough_removal: 0.15,
    melee_removal: 0.16,
    spray_access: 0.1,
    control: 0.16,
    mobility: 0.12,
    attack_chain: 0.08,
    scenario: 0.06,
    defense: 0.05,
  }),
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
}

function dimensions(row = {}) {
  const combat = row.combatEnvelope || {};
  const classes = row.rosterFacts?.ruleClassCounts || {};
  return {
    resource_free_removal: numeric(combat.resourceFreeExpectedRemovals),
    resource_optimized_removal: numeric(combat.resourceOptimizedExpectedRemovals),
    anti_tough_removal: numeric(combat.antiToughExpectedRemovals),
    ranged_removal: numeric(combat.rangedResourceFreeExpectedRemovals),
    melee_removal: numeric(combat.meleeResourceFreeExpectedRemovals),
    spray_access: numeric(combat.sprayAttackCount),
    control: numeric(classes.control_or_denial),
    mobility: numeric(classes.mobility_or_position),
    attack_chain: numeric(classes.attack_chain_or_reaction),
    scenario: numeric(classes.scenario),
    recursion: numeric(classes.recursion),
    defense: numeric(classes.defense),
    model_count: numeric(row.rosterFacts?.physicalModelCount),
  };
}

function ranges(rows = []) {
  return Object.fromEntries(DIMENSIONS.map((key) => {
    const values = rows.map((row) => numeric(row.rawDimensions?.[key]));
    return [key, { minimum: Math.min(...values), maximum: Math.max(...values) }];
  }));
}

function normalize(value, range = {}) {
  const span = numeric(range.maximum) - numeric(range.minimum);
  return span > 1e-12 ? (numeric(value) - numeric(range.minimum)) / span : 0.5;
}

function weightedIndex(normalized = {}, weights = {}) {
  const declaredMass = Object.values(weights).reduce((sum, weight) => sum + numeric(weight), 0);
  if (declaredMass <= 0) return 0;
  return Object.entries(weights).reduce((sum, [key, weight]) =>
    sum + numeric(normalized[key]) * numeric(weight), 0) / declaredMass;
}

function dominates(left = {}, right = {}, keys = DIMENSIONS) {
  const noWorse = keys.every((key) => numeric(left[key]) >= numeric(right[key]) - 1e-12);
  const better = keys.some((key) => numeric(left[key]) > numeric(right[key]) + 1e-12);
  return noWorse && better;
}

function paretoKeys(rows = []) {
  return new Set(rows.filter((row, rowIndex) => !rows.some((candidate, candidateIndex) =>
    candidateIndex !== rowIndex && dominates(
      candidate.normalizedDimensions,
      row.normalizedDimensions,
    ))).map((row) => row.rosterKey));
}

function strongestDimensions(row = {}) {
  return Object.entries(row.normalizedDimensions || {})
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4).map(([dimensionKey, normalizedValue]) => ({
      dimensionKey,
      normalizedValue: round(normalizedValue),
      rawValue: row.rawDimensions[dimensionKey],
    }));
}

function leaderGroups(rows = []) {
  return Object.entries(rows.reduce((groups, row) => {
    const key = row.leaderName || "unknown";
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
    return groups;
  }, {})).sort(([left], [right]) => left.localeCompare(right));
}

function selectLeaderShortlist(rows = [], maximumPerLeader = 4) {
  const selected = [];
  const add = (row, reason) => {
    if (!row || selected.some((entry) => entry.rosterKey === row.rosterKey)) return;
    selected.push({ ...row, shortlistReason: reason });
  };
  add([...rows].sort((left, right) => right.robustScreeningIndex - left.robustScreeningIndex ||
    left.rosterKey.localeCompare(right.rosterKey))[0], "three_map_maximin");
  for (const mapKey of Object.keys(DEFAULT_MAP_WEIGHTS)) {
    add([...rows].sort((left, right) =>
      numeric(right.mapScreeningIndexes[mapKey]) - numeric(left.mapScreeningIndexes[mapKey]) ||
      left.rosterKey.localeCompare(right.rosterKey))[0], `map_specialist:${mapKey}`);
  }
  for (const row of [...rows].filter((entry) => entry.paretoEfficient)
    .sort((left, right) => right.robustScreeningIndex - left.robustScreeningIndex ||
      left.rosterKey.localeCompare(right.rosterKey))) {
    add(row, "pareto_efficient");
    if (selected.length >= maximumPerLeader) break;
  }
  return selected.slice(0, maximumPerLeader);
}

export function buildWarmachineMatchupScreeningV1(raw = {}) {
  const evidenceRows = raw.evidenceRows || [];
  if (!evidenceRows.length) throw new Error("matchup_screening_evidence_empty");
  const mapWeights = { ...DEFAULT_MAP_WEIGHTS, ...(raw.mapWeights || {}) };
  const rawRows = evidenceRows.map((evidence) => ({
    rosterKey: evidence.rosterKey,
    leaderName: evidence.leaderName,
    armyName: evidence.armyName,
    evidenceHash: evidence.evidenceHash,
    sourceBound: evidence.quality?.sourceBound === true,
    rawDimensions: dimensions(evidence),
  }));
  const dimensionRanges = ranges(rawRows);
  let rows = rawRows.map((row) => {
    const normalizedDimensions = Object.fromEntries(DIMENSIONS.map((key) => [
      key,
      round(normalize(row.rawDimensions[key], dimensionRanges[key])),
    ]));
    const mapScreeningIndexes = Object.fromEntries(Object.entries(mapWeights)
      .map(([mapKey, weights]) => [
        mapKey,
        round(weightedIndex(normalizedDimensions, weights) * 100, 3),
      ]));
    return {
      ...row,
      normalizedDimensions,
      mapScreeningIndexes,
      robustScreeningIndex: round(Math.min(...Object.values(mapScreeningIndexes)), 3),
      strictGameValueInterval: { lowerBound: 0, upperBound: 1 },
      naturalWinRate: null,
    };
  });
  const frontier = paretoKeys(rows);
  rows = rows.map((row) => ({
    ...row,
    paretoEfficient: frontier.has(row.rosterKey),
    strongestDimensions: strongestDimensions(row),
  })).sort((left, right) => right.robustScreeningIndex - left.robustScreeningIndex ||
    left.rosterKey.localeCompare(right.rosterKey));
  const leaders = leaderGroups(rows).map(([leaderName, leaderRows]) => {
    const shortlist = selectLeaderShortlist(leaderRows, numeric(raw.maximumPerLeader, 4));
    return {
      leaderName,
      rosterCount: leaderRows.length,
      paretoRosterCount: leaderRows.filter((row) => row.paretoEfficient).length,
      robustBestRosterKey: shortlist[0]?.rosterKey || "",
      robustBestScreeningIndex: shortlist[0]?.robustScreeningIndex || 0,
      shortlist,
    };
  });
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_MATCHUP_SCREENING_V1_SCHEMA,
    targetProfile: evidenceRows[0].target,
    mapWeights,
    dimensionRanges,
    rosterCount: rows.length,
    paretoRosterCount: frontier.size,
    rows,
    leaders,
    quality: {
      currentCardTextBound: evidenceRows.every((row) =>
        row.quality?.currentCardTextBound === true),
      exactIndependentDice: evidenceRows.every((row) =>
        row.quality?.exactDiceEnumeration === true),
      strictTransitionEvaluated: false,
      strategyScore: false,
      naturalWinRate: false,
      trainingTruth: false,
    },
    claimBoundary: "Map screening indexes are declared-weight normalized shortlist aids over source-bound rule dimensions. They are not game values, win probabilities or ranker legality decisions. Pareto status is exact only over this finite evidence pool and these declared dimensions.",
  });
  return { ...core, screeningHash: stableGraphHash(core) };
}

export const WARMACHINE_MATCHUP_SCREENING_MAP_WEIGHTS_V1 = DEFAULT_MAP_WEIGHTS;
