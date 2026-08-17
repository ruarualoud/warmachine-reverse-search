import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_TERMINAL_DEMAND_GROUPS_V1_SCHEMA =
  "warmachine_terminal_demand_groups_v1";

const COMMON_PARTITIONS = new Set([
  "actionRange",
  "baseTopology",
  "damage",
  "leaderControl",
  "lifecycle",
  "lineOfSight",
  "resource",
  "scenarioControl",
  "scenarioTerrainSetup",
  "scoreTransition",
]);

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function goalFamily(terminalClassKey = "") {
  if (terminalClassKey === "unique_leader_assassination") return "assassination";
  if (terminalClassKey === "simultaneous_leader_tiebreak") return "simultaneous_leader_tiebreak";
  if (terminalClassKey === "lead_three_after_opponent_turn_scoring") return "scenario_score_threshold";
  if (terminalClassKey === "fixed_round_limit_result") return "fixed_round_tiebreak";
  return "unknown";
}

function roundBand(roundClass = {}) {
  if (roundClass.exactRoundNumber !== true) return "symbolic_later_round";
  const round = numeric(roundClass.representativeRoundNumber);
  if (round <= 3) return "early_round_2_3";
  if (round <= 5) return "middle_round_4_5";
  return "late_round_6_plus";
}

function scenarioMechanicClass(value = "") {
  const text = String(value);
  if (/expected_reject/i.test(text)) return "expected_strict_reject";
  if (/not_triggered|not_applicable|declined|no_|all_progress_zero|both_.+active/i.test(text)) {
    return "inactive_or_baseline";
  }
  if (/legal|eligible|selected|removed|delivered|detonated|nonzero|third_token|at_two/i.test(text)) {
    return "active_transition";
  }
  return "distinct_state";
}

function transitionLookup(corpus = {}) {
  const lookup = new Map();
  for (const scenario of corpus.scenarios || []) {
    for (const transition of scenario.scoreTransitionDomain?.transitions || []) {
      lookup.set(`${scenario.scenarioKey}:${transition.scoreTransitionKey}`, transition);
    }
  }
  return lookup;
}

function scoreDemandClass(scenarioKey = "", transitionKey = "", lookup = new Map()) {
  const transition = lookup.get(`${scenarioKey}:${transitionKey}`);
  if (!transition) return null;
  const netGain = numeric(transition.scoringGainClass?.netGain);
  const netGainBand = netGain <= 2 ? "gain_0_2" : netGain <= 4 ? "gain_3_4" : "gain_5_plus";
  return {
    leadBeforeClass: String(transition.leadBeforeClass || "unknown"),
    netGainBand,
    primarySourceFamilyKey: String(
      transition.scoringGainClass?.primarySourceFamilyKey || "unknown",
    ),
    sourceFamilyKeys: (transition.scoringGainClass?.sourceFamilyKeys || []).map(String).sort(),
  };
}

function demandSignature(cell = {}, representative = {}, scoreLookup = new Map()) {
  const coordinates = representative.coordinates || representative.partitionCoordinates || {};
  const specialMechanics = Object.entries(coordinates)
    .filter(([key]) => !COMMON_PARTITIONS.has(key))
    .map(([dimensionKey, value]) => ({
      dimensionKey,
      mechanicClass: scenarioMechanicClass(value),
    })).sort((left, right) => left.dimensionKey.localeCompare(right.dimensionKey) ||
      left.mechanicClass.localeCompare(right.mechanicClass));
  return stableGraphValue({
    goalFamily: goalFamily(cell.terminalClassKey),
    terminalClassKey: cell.terminalClassKey,
    causalActionFamily: cell.causalActionFamily,
    roundBand: roundBand(cell.roundClass),
    attackerWins: cell.attackerSideKey === cell.winnerSideKey,
    endingSideWins: cell.endingSideKey === cell.winnerSideKey,
    actionRange: String(coordinates.actionRange || "not_applicable"),
    lineOfSight: String(coordinates.lineOfSight || "not_applicable"),
    baseTopology: String(coordinates.baseTopology || "not_applicable"),
    damage: String(coordinates.damage || "not_applicable"),
    resource: String(coordinates.resource || "not_applicable"),
    lifecycle: String(coordinates.lifecycle || "not_applicable"),
    leaderControl: String(coordinates.leaderControl || "not_applicable"),
    scenarioControl: String(coordinates.scenarioControl || "not_applicable"),
    scoreDemand: scoreDemandClass(
      cell.scenarioKey,
      String(coordinates.scoreTransition || ""),
      scoreLookup,
    ),
    specialMechanics,
  });
}

function capabilityRequirements(signature = {}) {
  const requirements = new Set();
  const strictOnly = new Set();
  if (["assassination", "simultaneous_leader_tiebreak"].includes(signature.goalFamily)) {
    requirements.add("leader_removal");
    requirements.add("damage_delivery");
  }
  if (["scenario_score_threshold", "fixed_round_tiebreak"].includes(signature.goalFamily)) {
    requirements.add("scenario_presence");
    requirements.add("position_control");
  }
  if (signature.actionRange === "outside_direct_action_range_requires_prior_movement") {
    requirements.add("threat_extension");
    strictOnly.add("legal_movement_path_and_activation_order");
  }
  if (signature.lineOfSight === "terrain_blocked") {
    requirements.add("terrain_or_los_bypass");
    strictOnly.add("exact_terrain_los_route");
  }
  if (signature.lineOfSight === "model_blocked") {
    requirements.add("screen_clear_or_ignore_models");
    strictOnly.add("intervening_model_order_and_base_clearance");
  }
  if (signature.lineOfSight === "stealth_blocks_beyond_five") {
    requirements.add("stealth_answer");
    strictOnly.add("targeting_distance_and_stealth_interaction");
  }
  if (signature.lineOfSight === "true_sight_or_ignore_stealth_override") {
    requirements.add("stealth_bypass");
  }
  if (signature.baseTopology === "legal_contact") {
    requirements.add("contact_geometry");
    strictOnly.add("base_contact_without_overlap");
  }
  if (/prior_losses|removed_from_play|reserve_replacement/.test(signature.lifecycle)) {
    requirements.add("attrition_history_support");
    strictOnly.add("history_reachable_roster_state");
  }
  if (/system_disabled|aspect_disabled/.test(signature.damage)) {
    requirements.add("damaged_cohort_continuity");
    strictOnly.add("disabled_system_or_aspect_action_legality");
  }
  if (signature.resource === "zero_available") requirements.add("resource_independent_route");
  if (signature.resource === "exact_terminal_payment") requirements.add("exact_resource_budget");
  if (signature.resource === "one_additional_purchase_available") {
    requirements.add("resource_purchase_efficiency");
  }
  if (signature.resource === "maximum_native_resource") requirements.add("resource_ceiling_conversion");
  if (signature.resource === "controller_transfer_or_channel_available") {
    requirements.add("controller_or_channel_route");
  }
  if (signature.scenarioControl === "contested") requirements.add("contest_removal_or_displacement");
  if (signature.scenarioControl === "controller_ineligible") {
    requirements.add("scenario_eligibility_restoration_or_alternative");
  }
  for (const mechanic of signature.specialMechanics || []) {
    requirements.add(`scenario_mechanic:${mechanic.dimensionKey}:${mechanic.mechanicClass}`);
    strictOnly.add(`strict_scenario_transition:${mechanic.dimensionKey}`);
  }
  return {
    capabilityRequirementKeys: [...requirements].sort(),
    strictOnlyRequirementKeys: [...strictOnly].sort(),
  };
}

function addWeight(weights, key, amount) {
  weights[key] = numeric(weights[key]) + amount;
}

function constructionProfile(signature = {}, requirements = {}) {
  const weights = {};
  if (["assassination", "simultaneous_leader_tiebreak"].includes(signature.goalFamily)) {
    addWeight(weights, "threatReach", 0.18);
    addWeight(weights, "highPower", 0.18);
    addWeight(weights, "attackPotential", 0.14);
    addWeight(weights, "control", 0.1);
    addWeight(weights, "resourceCapacity", 0.1);
  } else {
    addWeight(weights, "models", 0.18);
    addWeight(weights, "units", 0.12);
    addWeight(weights, "scenario", 0.18);
    addWeight(weights, "control", 0.14);
    addWeight(weights, "mobility", 0.12);
  }
  const keys = new Set(requirements.capabilityRequirementKeys || []);
  if (keys.has("threat_extension")) {
    addWeight(weights, "threatReach", 0.16);
    addWeight(weights, "mobility", 0.1);
  }
  if (keys.has("screen_clear_or_ignore_models")) {
    addWeight(weights, "spray", 0.12);
    addWeight(weights, "screenBypass", 0.12);
    addWeight(weights, "attackPotential", 0.08);
  }
  if (keys.has("terrain_or_los_bypass")) addWeight(weights, "pathing", 0.16);
  if (keys.has("stealth_answer") || keys.has("stealth_bypass")) {
    addWeight(weights, "stealthBypass", 0.18);
  }
  if (keys.has("attrition_history_support")) {
    addWeight(weights, "recursion", 0.12);
    addWeight(weights, "defense", 0.08);
  }
  if (keys.has("resource_independent_route")) addWeight(weights, "attackPotential", 0.12);
  if (keys.has("resource_purchase_efficiency") || keys.has("resource_ceiling_conversion")) {
    addWeight(weights, "resourceCapacity", 0.12);
  }
  if (keys.has("contest_removal_or_displacement")) {
    addWeight(weights, "control", 0.14);
    addWeight(weights, "attackPotential", 0.08);
  }
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const normalizedWeights = Object.fromEntries(Object.entries(weights).map(([key, value]) => [
    key,
    total > 0 ? value / total : 0,
  ]));
  return {
    goalProfileKey: `terminal-demand-${stableGraphHash({ signature, normalizedWeights }).slice(0, 16)}`,
    label: `${signature.goalFamily}:${signature.roundBand}`,
    weights: normalizedWeights,
  };
}

function evaluationStandard() {
  return [
    { metricKey: "strict_reachability_interval", direction: "maximize_lower_bound" },
    { metricKey: "minimum_turn_and_activation_count", direction: "minimize" },
    { metricKey: "retained_branch_probability", direction: "maximize" },
    { metricKey: "resource_margin_after_terminal_action", direction: "maximize" },
    { metricKey: "friendly_points_sacrificed", direction: "minimize" },
    { metricKey: "one_response_robust_value_interval", direction: "maximize_lower_bound" },
    { metricKey: "strict_opening_coverage", direction: "maximize" },
    { metricKey: "rules_interaction_coverage", direction: "maximize" },
  ];
}

function constructionMacroProfileKey(profile = {}) {
  return `terminal-construction-macro-${stableGraphHash({
    weights: profile.weights || {},
  }).slice(0, 20)}`;
}

export function buildWarmachineTerminalDemandGroupsV1(raw = {}) {
  const corpus = raw.corpus || {};
  const representativeSelection = raw.representativeSelection || {};
  if (representativeSelection.corpusHash !== corpus.corpusHash) {
    throw new Error("terminal_demand_group_corpus_mismatch");
  }
  const cellsByKey = new Map((corpus.cells || []).map((cell) => [cell.cellKey, cell]));
  const scoreLookup = transitionLookup(corpus);
  const grouped = new Map();
  const missingCells = [];
  for (const representative of representativeSelection.selectedRepresentatives || []) {
    const cell = cellsByKey.get(representative.cellKey);
    if (!cell) {
      missingCells.push(representative.cellKey);
      continue;
    }
    const signature = demandSignature(cell, representative, scoreLookup);
    const groupKey = `terminal-demand-group-${stableGraphHash(signature).slice(0, 24)}`;
    if (!grouped.has(groupKey)) grouped.set(groupKey, {
      groupKey,
      signature,
      representativeKeys: [],
      cellKeys: new Set(),
      scenarioKeys: new Set(),
      exactRoundNumbers: new Set(),
      expectedDispositionCounts: {},
      sourceResolutionStatuses: new Set(),
    });
    const group = grouped.get(groupKey);
    group.representativeKeys.push(representative.subcellKey);
    group.cellKeys.add(cell.cellKey);
    group.scenarioKeys.add(cell.scenarioKey);
    if (cell.roundClass?.exactRoundNumber) {
      group.exactRoundNumbers.add(cell.roundClass.representativeRoundNumber);
    }
    const disposition = String(representative.expectedNextDisposition || "unknown");
    group.expectedDispositionCounts[disposition] =
      numeric(group.expectedDispositionCounts[disposition]) + 1;
    group.sourceResolutionStatuses.add(cell.sourceResolutionStatus);
  }
  const groups = [...grouped.values()].map((group) => {
    const requirements = capabilityRequirements(group.signature);
    const profile = constructionProfile(group.signature, requirements);
    const core = {
      groupKey: group.groupKey,
      signature: group.signature,
      representativeCount: group.representativeKeys.length,
      representativeKeys: group.representativeKeys.sort(),
      cellCount: group.cellKeys.size,
      cellKeys: [...group.cellKeys].sort(),
      scenarioKeys: [...group.scenarioKeys].sort(),
      exactRoundNumbers: [...group.exactRoundNumbers].sort((left, right) => left - right),
      expectedDispositionCounts: group.expectedDispositionCounts,
      sourceResolutionStatuses: [...group.sourceResolutionStatuses].sort(),
      requirements,
      constructionProfile: profile,
      constructionMacroProfileKey: constructionMacroProfileKey(profile),
      evaluationStandard: evaluationStandard(),
      strictEvidenceComplete: false,
      naturalProbabilityMass: null,
    };
    return { ...stableGraphValue(core), groupHash: stableGraphHash(core) };
  }).sort((left, right) =>
    right.representativeCount - left.representativeCount || left.groupKey.localeCompare(right.groupKey));
  const macroMap = new Map();
  for (const group of groups) {
    const macroKey = group.constructionMacroProfileKey;
    if (!macroMap.has(macroKey)) macroMap.set(macroKey, {
      goalProfileKey: macroKey,
      label: `Terminal demand macro ${macroMap.size + 1}`,
      weights: group.constructionProfile.weights,
      groupKeys: [],
      representativeCount: 0,
      goalFamilies: new Set(),
      roundBands: new Set(),
      scenarioKeys: new Set(),
      capabilityRequirementKeys: new Set(),
      strictOnlyRequirementKeys: new Set(),
    });
    const macro = macroMap.get(macroKey);
    macro.groupKeys.push(group.groupKey);
    macro.representativeCount += group.representativeCount;
    macro.goalFamilies.add(group.signature.goalFamily);
    macro.roundBands.add(group.signature.roundBand);
    for (const scenarioKey of group.scenarioKeys) macro.scenarioKeys.add(scenarioKey);
    for (const requirementKey of group.requirements.capabilityRequirementKeys) {
      macro.capabilityRequirementKeys.add(requirementKey);
    }
    for (const requirementKey of group.requirements.strictOnlyRequirementKeys) {
      macro.strictOnlyRequirementKeys.add(requirementKey);
    }
  }
  const constructionMacroProfiles = [...macroMap.values()].map((macro) => stableGraphValue({
    goalProfileKey: macro.goalProfileKey,
    label: macro.label,
    weights: macro.weights,
    groupCount: macro.groupKeys.length,
    groupKeys: macro.groupKeys.sort(),
    representativeCount: macro.representativeCount,
    goalFamilies: [...macro.goalFamilies].sort(),
    roundBands: [...macro.roundBands].sort(),
    scenarioKeys: [...macro.scenarioKeys].sort(),
    capabilityRequirementKeys: [...macro.capabilityRequirementKeys].sort(),
    strictOnlyRequirementKeys: [...macro.strictOnlyRequirementKeys].sort(),
    evaluationStandard: evaluationStandard(),
    naturalProbabilityMass: null,
  })).sort((left, right) =>
    right.representativeCount - left.representativeCount ||
    left.goalProfileKey.localeCompare(right.goalProfileKey));
  const batchMap = new Map();
  for (const group of groups) {
    const batchIdentity = {
      goalFamily: group.signature.goalFamily,
      roundBand: group.signature.roundBand,
      capabilityRequirementKeys: group.requirements.capabilityRequirementKeys,
    };
    const batchKey = `terminal-demand-batch-${stableGraphHash(batchIdentity).slice(0, 20)}`;
    if (!batchMap.has(batchKey)) batchMap.set(batchKey, {
      batchKey,
      batchIdentity,
      groupKeys: [],
      representativeCount: 0,
    });
    const batch = batchMap.get(batchKey);
    batch.groupKeys.push(group.groupKey);
    batch.representativeCount += group.representativeCount;
  }
  const batches = [...batchMap.values()].map((batch) => ({
    ...batch,
    groupKeys: batch.groupKeys.sort(),
  })).sort((left, right) =>
    right.representativeCount - left.representativeCount || left.batchKey.localeCompare(right.batchKey));
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_TERMINAL_DEMAND_GROUPS_V1_SCHEMA,
    corpusHash: corpus.corpusHash,
    representativeSelectionHash: representativeSelection.selectionHash,
    proposedSubcellCount: corpus.counts?.proposedSubcellCount,
    selectedRepresentativeCount:
      representativeSelection.selectedRepresentatives?.length || 0,
    groupCount: groups.length,
    batchCount: batches.length,
    constructionMacroProfileCount: constructionMacroProfiles.length,
    groups,
    batches,
    constructionMacroProfiles,
    missingCellKeys: [...new Set(missingCells)].sort(),
    naturalDistributionClaimed: false,
    globalOptimalityProven: false,
    claimBoundary: "Demand groups canonically merge representative terminal subcells by rule-relevant topology and capability requirements. Construction macro profiles merge only identical roster-feature weight vectors; detailed groups remain separate strict evaluation obligations. Group frequency is representative coverage count, not natural game probability. Every group requires strict root materialization, reverse expansion and independent forward replay before it supports a strategy result.",
  });
  return { ...core, demandGroupSetHash: stableGraphHash(core) };
}
