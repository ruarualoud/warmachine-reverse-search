import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineHost } from "../warmachine-host-runtime.mjs";

export const WARMACHINE_CUSTOM_MATCHUP_TASK_V1_SCHEMA =
  "warmachine_custom_matchup_task_v1";

const DEFAULT_SCENARIOS = Object.freeze([
  "trench_warfare",
  "two_fronts",
  "wolves_at_our_heels",
  "pressure_point",
  "high_stakes",
  "fault_line",
  "payload",
]);

const DEFAULT_MAP_PROFILES = Object.freeze([
  Object.freeze({
    mapKey: "open_lanes",
    label: "开阔火力线",
    sourceKind: "declared_topology_profile",
    terrainTopology: Object.freeze({
      laneOpenness: "high",
      losBlocking: "low",
      movementChokepoints: "low",
      roughTerrainLoad: "low",
    }),
  }),
  Object.freeze({
    mapKey: "mixed_table",
    label: "混合地形",
    sourceKind: "declared_topology_profile",
    terrainTopology: Object.freeze({
      laneOpenness: "medium",
      losBlocking: "medium",
      movementChokepoints: "medium",
      roughTerrainLoad: "medium",
    }),
  }),
  Object.freeze({
    mapKey: "dense_chokepoints",
    label: "密集阻挡",
    sourceKind: "declared_topology_profile",
    terrainTopology: Object.freeze({
      laneOpenness: "low",
      losBlocking: "high",
      movementChokepoints: "high",
      roughTerrainLoad: "high",
    }),
  }),
]);

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sortedUnique(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function normalizeOptionSelections(raw = {}) {
  return Object.fromEntries(Object.entries(raw || {})
    .map(([slotKey, choices]) => [
      String(slotKey),
      (Array.isArray(choices) ? choices : [choices]).map(String).filter(Boolean),
    ])
    .filter(([slotKey]) => Boolean(slotKey))
    .sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeLoadout(raw = {}, index = 0) {
  return {
    loadoutKey: String(raw.loadoutKey || `loadout-${index + 1}`),
    optionSelections: normalizeOptionSelections(raw.optionSelections || {}),
    optionSummary: String(raw.optionSummary || ""),
  };
}

function normalizeCardConstraint(raw = {}) {
  const minimumCount = Math.max(0, Math.floor(numeric(raw.minimumCount, 0)));
  const maximumCount = raw.maximumCount == null
    ? null
    : Math.max(minimumCount, Math.floor(numeric(raw.maximumCount, minimumCount)));
  return {
    cardId: String(raw.cardId || ""),
    cardName: String(raw.cardName || ""),
    minimumCount,
    maximumCount,
    optionSelections: normalizeOptionSelections(raw.optionSelections || {}),
    optionSummary: String(raw.optionSummary || ""),
    loadouts: (raw.loadouts || []).map(normalizeLoadout),
    attachmentTargetCardId: String(raw.attachmentTargetCardId || ""),
    attachmentTargetCardName: String(raw.attachmentTargetCardName || ""),
    attachmentTargetCopyNumbers: (raw.attachmentTargetCopyNumbers || [])
      .map((value) => Math.max(1, Math.floor(numeric(value, 1)))),
    battlegroupControllerCardId: String(raw.battlegroupControllerCardId || ""),
    battlegroupControllerCardName: String(raw.battlegroupControllerCardName || ""),
    battlegroupControllerCopyNumbers: (raw.battlegroupControllerCopyNumbers || [])
      .map((value) => Math.max(1, Math.floor(numeric(value, 1)))),
  };
}

function normalizeLoadoutConstraint(raw = {}) {
  return {
    cardId: String(raw.cardId || ""),
    cardName: String(raw.cardName || ""),
    allowedLoadouts: (raw.allowedLoadouts || raw.loadouts || []).map(normalizeLoadout),
    allowedChoiceIdsBySlot: normalizeOptionSelections(raw.allowedChoiceIdsBySlot || {}),
    excludedChoiceIdsBySlot: normalizeOptionSelections(raw.excludedChoiceIdsBySlot || {}),
  };
}

function normalizeSide(raw = {}, fallbackSideKey = "subject") {
  const armyNames = sortedUnique([
    ...(raw.armyNames || []),
    raw.armyName || "",
  ]);
  const armyIds = sortedUnique([
    ...(raw.armyIds || []),
    raw.armyId || "",
  ]);
  return {
    taskSideKey: String(raw.taskSideKey || fallbackSideKey),
    factionName: String(raw.factionName || ""),
    rosterMode: String(raw.rosterMode || "generated"),
    armyMode: String(raw.armyMode || "fixed"),
    armyId: String(raw.armyId || armyIds[0] || ""),
    armyName: String(raw.armyName || armyNames[0] || ""),
    armyIds,
    armyNames,
    leaderMode: String(raw.leaderMode || "fixed"),
    leaderIds: sortedUnique(raw.leaderIds || []),
    leaderNames: sortedUnique(raw.leaderNames || []),
    sourcePoolKey: String(raw.sourcePoolKey ||
      `custom-task-${fallbackSideKey}-generated-current-pool`),
    requiredCards: (raw.requiredCards || []).map(normalizeCardConstraint)
      .sort((left, right) =>
        left.cardId.localeCompare(right.cardId) || left.cardName.localeCompare(right.cardName)),
    excludedCardIds: sortedUnique(raw.excludedCardIds || []),
    excludedCardNames: sortedUnique(raw.excludedCardNames || []),
    excludedCardTypeNames: sortedUnique(raw.excludedCardTypeNames || []),
    loadoutConstraints: (raw.loadoutConstraints || []).map(normalizeLoadoutConstraint)
      .sort((left, right) =>
        left.cardId.localeCompare(right.cardId) || left.cardName.localeCompare(right.cardName)),
  };
}

function normalizeMapProfile(raw = {}, index = 0) {
  return {
    mapKey: String(raw.mapKey || `map-${index + 1}`),
    label: String(raw.label || raw.mapKey || `地图 ${index + 1}`),
    sourceKind: String(raw.sourceKind || "user_declared"),
    terrainTopology: stableGraphValue(raw.terrainTopology || {}),
    exactTerrain: Array.isArray(raw.exactTerrain)
      ? stableGraphValue(raw.exactTerrain)
      : null,
    weight: Number.isFinite(Number(raw.weight)) ? numeric(raw.weight) : null,
  };
}

function normalizeDeploymentSeed(raw = {}, index = 0) {
  return {
    deploymentSeedKey: String(raw.deploymentSeedKey || `deployment-${index + 1}`),
    label: String(raw.label || raw.deploymentSeedKey || `部署 ${index + 1}`),
    archetypesBySide: stableGraphValue(raw.archetypesBySide || {}),
    exactOpeningStateHash: String(raw.exactOpeningStateHash || ""),
    strictDeploymentReceiptHash: String(raw.strictDeploymentReceiptHash || ""),
    weight: Number.isFinite(Number(raw.weight)) ? numeric(raw.weight) : null,
  };
}

function normalizedWeightsComplete(rows = []) {
  if (!rows.length || rows.some((row) => !Number.isFinite(Number(row.weight)))) return false;
  const sum = rows.reduce((total, row) => total + numeric(row.weight), 0);
  return Math.abs(sum - 1) <= 1e-9;
}

function taskIssues(task = {}) {
  const issues = [];
  if (!task.taskKey) issues.push("task_key_missing");
  if (!Number.isFinite(Number(task.format?.pointLimit)) || task.format.pointLimit <= 0) {
    issues.push("point_limit_invalid");
  }
  for (const sideKey of ["subject", "challenger"]) {
    const side = task.sides?.[sideKey] || {};
    if (!side.factionName) issues.push(`${sideKey}_faction_missing`);
    if (!["fixed", "selected", "all_in_faction"].includes(side.armyMode)) {
      issues.push(`${sideKey}_army_mode_invalid`);
    }
    if (side.armyMode === "fixed" && !side.armyName && !side.armyId) {
      issues.push(`${sideKey}_army_missing`);
    }
    if (side.armyMode === "selected" && !side.armyNames.length && !side.armyIds.length) {
      issues.push(`${sideKey}_army_selection_empty`);
    }
    if (!["generated", "fixed_complete"].includes(side.rosterMode)) {
      issues.push(`${sideKey}_roster_mode_invalid`);
    }
    if (!side.sourcePoolKey) issues.push(`${sideKey}_source_pool_missing`);
    if (!["fixed", "all_in_army", "selected"].includes(side.leaderMode)) {
      issues.push(`${sideKey}_leader_mode_invalid`);
    }
    if (["fixed", "selected"].includes(side.leaderMode) &&
        !side.leaderNames.length && !side.leaderIds.length) {
      issues.push(`${sideKey}_leader_names_missing`);
    }
    if (side.leaderMode === "fixed" &&
        (side.leaderNames.length > 1 || side.leaderIds.length > 1)) {
      issues.push(`${sideKey}_fixed_leader_not_exact`);
    }
    if (side.rosterMode === "fixed_complete" &&
        (side.leaderMode !== "fixed" ||
          (!side.leaderNames.length && !side.leaderIds.length) ||
          side.leaderNames.length > 1 || side.leaderIds.length > 1)) {
      issues.push(`${sideKey}_fixed_complete_leader_not_exact`);
    }
    if (side.rosterMode === "fixed_complete" && !side.requiredCards.length) {
      issues.push(`${sideKey}_fixed_complete_roster_empty`);
    }
    for (const constraint of side.requiredCards || []) {
      if (!constraint.cardId && !constraint.cardName) {
        issues.push(`${sideKey}_required_card_identity_missing`);
      }
      if (side.rosterMode === "fixed_complete" &&
          (constraint.maximumCount == null ||
            constraint.minimumCount !== constraint.maximumCount)) {
        issues.push(`${sideKey}_fixed_complete_card_count_not_exact`);
      }
      for (const loadout of constraint.loadouts || []) {
        if (!Object.keys(loadout.optionSelections || {}).length) {
          issues.push(`${sideKey}_required_card_loadout_empty`);
        }
      }
      if (constraint.attachmentTargetCopyNumbers.length &&
          constraint.attachmentTargetCopyNumbers.length !== constraint.minimumCount) {
        issues.push(`${sideKey}_attachment_target_copy_count_mismatch`);
      }
      if (constraint.battlegroupControllerCopyNumbers.length &&
          constraint.battlegroupControllerCopyNumbers.length !== constraint.minimumCount) {
        issues.push(`${sideKey}_battlegroup_controller_copy_count_mismatch`);
      }
    }
    for (const constraint of side.loadoutConstraints || []) {
      if (!constraint.cardId && !constraint.cardName) {
        issues.push(`${sideKey}_loadout_card_identity_missing`);
      }
    }
  }
  if (task.sides?.subject?.sourcePoolKey === task.sides?.challenger?.sourcePoolKey) {
    issues.push("side_source_pool_keys_not_unique");
  }
  if (!task.stateDomain?.scenarioKeys?.length) issues.push("scenario_domain_empty");
  if (!task.stateDomain?.mapProfiles?.length) issues.push("map_domain_empty");
  if (!task.stateDomain?.firstPlayerTaskSideKeys?.length) {
    issues.push("first_player_domain_empty");
  }
  if (!task.stateDomain?.deploymentSeeds?.length) issues.push("deployment_domain_empty");
  if (!task.terminalGoalTypes?.length) issues.push("terminal_goal_domain_empty");
  if (task.horizon?.minimumTerminalRound > task.horizon?.maximumTerminalRound) {
    issues.push("terminal_round_range_invalid");
  }
  if (task.aggregation?.mode === "weighted_distribution") {
    if (!normalizedWeightsComplete(task.stateDomain.mapProfiles)) {
      issues.push("weighted_map_distribution_incomplete");
    }
    if (!normalizedWeightsComplete(task.stateDomain.deploymentSeeds)) {
      issues.push("weighted_deployment_distribution_incomplete");
    }
    if (!normalizedWeightsComplete(task.stateDomain.firstPlayerRows)) {
      issues.push("weighted_first_player_distribution_incomplete");
    }
  }
  return sortedUnique(issues);
}

export function normalizeWarmachineCustomMatchupTaskV1(raw = {}) {
  const firstPlayerTaskSideKeys = sortedUnique(
    raw.stateDomain?.firstPlayerTaskSideKeys || ["subject", "challenger"],
  ).filter((sideKey) => ["subject", "challenger"].includes(sideKey));
  const firstPlayerWeights = raw.stateDomain?.firstPlayerWeights || {};
  const firstPlayerRows = firstPlayerTaskSideKeys.map((taskSideKey) => ({
    taskSideKey,
    weight: Number.isFinite(Number(firstPlayerWeights[taskSideKey]))
      ? numeric(firstPlayerWeights[taskSideKey])
      : null,
  }));
  const core = {
    schemaVersion: WARMACHINE_CUSTOM_MATCHUP_TASK_V1_SCHEMA,
    taskKey: String(raw.taskKey || ""),
    label: String(raw.label || raw.taskKey || "Warmachine 自定义对抗任务"),
    rulesetReceiptHash: String(raw.rulesetReceiptHash || warmachineHost.receipt.receiptHash),
    dataReceipt: stableGraphValue(raw.dataReceipt || {}),
    format: {
      pointLimit: Math.max(1, Math.floor(numeric(raw.format?.pointLimit, 100))),
      packetName: String(raw.format?.packetName || "Steamroller 2026"),
      commandCardMode: String(raw.format?.commandCardMode || "source_pool"),
    },
    sides: {
      subject: normalizeSide(raw.sides?.subject, "subject"),
      challenger: normalizeSide(raw.sides?.challenger, "challenger"),
    },
    stateDomain: {
      scenarioKeys: sortedUnique(raw.stateDomain?.scenarioKeys || DEFAULT_SCENARIOS),
      mapProfiles: (raw.stateDomain?.mapProfiles || DEFAULT_MAP_PROFILES)
        .map(normalizeMapProfile)
        .sort((left, right) => left.mapKey.localeCompare(right.mapKey)),
      firstPlayerTaskSideKeys,
      firstPlayerRows,
      deploymentSeeds: (raw.stateDomain?.deploymentSeeds || [
        { deploymentSeedKey: "balanced", label: "均衡展开" },
        { deploymentSeedKey: "wide", label: "宽正面展开" },
        { deploymentSeedKey: "refused_flank", label: "拒止侧翼" },
      ]).map(normalizeDeploymentSeed)
        .sort((left, right) => left.deploymentSeedKey.localeCompare(right.deploymentSeedKey)),
    },
    terminalGoalTypes: sortedUnique(raw.terminalGoalTypes || [
      "assassination",
      "scenario_score",
    ]),
    horizon: {
      minimumTerminalRound: Math.max(1, Math.floor(numeric(
        raw.horizon?.minimumTerminalRound,
        2,
      ))),
      maximumTerminalRound: Math.max(1, Math.floor(numeric(
        raw.horizon?.maximumTerminalRound,
        7,
      ))),
    },
    aggregation: {
      mode: String(raw.aggregation?.mode || "separate_cells_and_robust_bounds"),
      subjectTaskSideKey: String(raw.aggregation?.subjectTaskSideKey || "challenger"),
    },
    searchBudget: {
      maximumRosterPairs: Math.max(1, Math.floor(numeric(
        raw.searchBudget?.maximumRosterPairs,
        256,
      ))),
      maximumMaterializedOpenings: Math.max(1, Math.floor(numeric(
        raw.searchBudget?.maximumMaterializedOpenings,
        64,
      ))),
      maximumTerminalRootsPerOpening: Math.max(1, Math.floor(numeric(
        raw.searchBudget?.maximumTerminalRootsPerOpening,
        8,
      ))),
      minimumRetainedBranchProbability: Math.max(0, Math.min(1, numeric(
        raw.searchBudget?.minimumRetainedBranchProbability,
        0.01,
      ))),
      rosterConstruction: {
        maximumStatesPerCost: Math.max(16, Math.floor(numeric(
          raw.searchBudget?.rosterConstruction?.maximumStatesPerCost,
          160,
        ))),
        maximumPerBucket: Math.max(1, Math.floor(numeric(
          raw.searchBudget?.rosterConstruction?.maximumPerBucket,
          2,
        ))),
        maximumExactAttemptsPerLeader: Math.max(1, Math.floor(numeric(
          raw.searchBudget?.rosterConstruction?.maximumExactAttemptsPerLeader,
          180,
        ))),
        minimumLegalRostersPerGoalPerLeader: Math.max(1, Math.floor(numeric(
          raw.searchBudget?.rosterConstruction?.minimumLegalRostersPerGoalPerLeader,
          4,
        ))),
        maximumArchivedRostersPerSide: Math.max(1, Math.floor(numeric(
          raw.searchBudget?.rosterConstruction?.maximumArchivedRostersPerSide,
          96,
        ))),
      },
      rosterConstructionBySide: stableGraphValue(
        raw.searchBudget?.rosterConstructionBySide || {},
      ),
    },
  };
  const issues = taskIssues(core);
  const normalized = {
    ...core,
    validation: {
      ok: issues.length === 0,
      issues,
      naturalWinRateAggregationAllowed:
        core.aggregation.mode === "weighted_distribution" && issues.length === 0,
    },
    claimBoundary: "The task declares a finite roster, scenario, map, initiative and deployment proposal universe. Missing weights forbid a natural aggregate win-rate claim. Rules legality and route certification remain owned by the current rules-v1 Host.",
  };
  return { ...normalized, taskHash: stableGraphHash(normalized) };
}

export function buildSepsiraSixSwarmVsFaneTaskV1(rawOverrides = {}) {
  const base = {
    taskKey: "sepsira-six-swarms-vs-fane-v1",
    label: "Sepsira 六队 Mechanithrall Swarm 对 Fane of Nyrro",
    format: { pointLimit: 100, packetName: "Steamroller 2026" },
    sides: {
      subject: {
        factionName: "Cryx",
        armyName: "Necrofactorium",
        leaderMode: "fixed",
        leaderNames: ["Master Necrosurgeon Sepsira"],
        sourcePoolKey: "sepsira-six-swarms-current-finite-pool",
        requiredCards: [
          { cardName: "Mechanithrall Swarm", minimumCount: 6, maximumCount: 6 },
          {
            cardName: "Mechanithrall Swarm Warden",
            minimumCount: 6,
            maximumCount: 6,
            attachmentTargetCardName: "Mechanithrall Swarm",
          },
        ],
      },
      challenger: {
        factionName: "Dusk",
        armyName: "Fane of Nyrro",
        leaderMode: "all_in_army",
        sourcePoolKey: "fane-of-nyrro-current-finite-pool",
      },
    },
  };
  return normalizeWarmachineCustomMatchupTaskV1({
    ...base,
    ...stableGraphValue(rawOverrides),
    format: { ...base.format, ...(rawOverrides.format || {}) },
    sides: {
      subject: { ...base.sides.subject, ...(rawOverrides.sides?.subject || {}) },
      challenger: { ...base.sides.challenger, ...(rawOverrides.sides?.challenger || {}) },
    },
  });
}

export function validateWarmachineCustomMatchupTaskV1(raw = {}) {
  const task = normalizeWarmachineCustomMatchupTaskV1(raw);
  return {
    ok: task.validation.ok,
    issues: task.validation.issues,
    task,
  };
}
