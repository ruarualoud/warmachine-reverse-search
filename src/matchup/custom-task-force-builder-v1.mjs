import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineHost } from "../warmachine-host-runtime.mjs";
import { warmachineConstructionHost } from
  "../warmachine-construction-host-runtime.mjs";
import {
  buildWarmachineCurrentArmyCatalogV1,
  generateWarmachineGenericRosterPoolV1,
  WARMACHINE_GENERIC_ROSTER_POOL_V1_SOURCE_HASH,
} from "./generic-roster-pool-v1.mjs";
import { compileWarmachineTaskRosterUniverseV1 } from
  "./task-roster-universe-v1.mjs";

export const WARMACHINE_CUSTOM_TASK_FORCE_BUILDER_V1_SCHEMA =
  "warmachine_custom_task_force_builder_v1";

export const WARMACHINE_CUSTOM_TASK_FORCE_BUILDER_V1_SOURCE_HASH = createHash("sha256")
  .update(readFileSync(new URL(import.meta.url)))
  .digest("hex");

const CUSTOM_TASK_SCHEMA_SOURCE_HASH = createHash("sha256")
  .update(readFileSync(new URL("./custom-matchup-task-v1.mjs", import.meta.url)))
  .digest("hex");
const TASK_ROSTER_UNIVERSE_SOURCE_HASH = createHash("sha256")
  .update(readFileSync(new URL("./task-roster-universe-v1.mjs", import.meta.url)))
  .digest("hex");

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function baseEntryName(value = "") {
  return String(value).replace(/\s+#\d+$/i, "").trim();
}

function entryCopyNumber(value = "") {
  const match = String(value).match(/\s+#(\d+)$/i);
  return match ? Math.max(1, Number.parseInt(match[1], 10) || 1) : 1;
}

export function buildWarmachineFixedCompleteSideFromRosterV1(roster = {}, raw = {}) {
  const groups = new Map();
  for (const entry of roster.entries || []) {
    if (/warcaster|warlock/i.test(String(entry.cardTypeName || "")) ||
        entry.autoAddedCompanion === true) continue;
    const relationship = {
      attachmentTargetCardId: String(entry.attachedToCardId || ""),
      attachmentTargetCardName: baseEntryName(entry.attachedTo || ""),
      battlegroupControllerCardId: String(entry.battlegroupControllerCardId || ""),
      battlegroupControllerCardName: baseEntryName(entry.battlegroupController || ""),
    };
    const groupKey = stableGraphHash({
      cardId: entry.cardId,
      relationship,
    });
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        cardId: String(entry.cardId || ""),
        cardName: baseEntryName(entry.name || entry.cardName || ""),
        ...relationship,
        entries: [],
      });
    }
    groups.get(groupKey).entries.push(entry);
  }
  const requiredCards = [...groups.values()].map((group) => ({
    cardId: group.cardId,
    cardName: group.cardName,
    minimumCount: group.entries.length,
    maximumCount: group.entries.length,
    attachmentTargetCardId: group.attachmentTargetCardId,
    attachmentTargetCardName: group.attachmentTargetCardName,
    attachmentTargetCopyNumbers: group.attachmentTargetCardId ||
      group.attachmentTargetCardName
      ? group.entries.map((entry) => entryCopyNumber(entry.attachedTo))
      : [],
    battlegroupControllerCardId: group.battlegroupControllerCardId,
    battlegroupControllerCardName: group.battlegroupControllerCardName,
    battlegroupControllerCopyNumbers: group.battlegroupControllerCardId ||
      group.battlegroupControllerCardName
      ? group.entries.map((entry) => entryCopyNumber(entry.battlegroupController))
      : [],
    loadouts: group.entries.filter((entry) =>
      Object.keys(entry.optionSelections || {}).length).map((entry, index) => ({
      loadoutKey: `copy-${index + 1}`,
      optionSelections: stableGraphValue(entry.optionSelections || {}),
      optionSummary: String(entry.options || ""),
    })),
  })).sort((left, right) => left.cardId.localeCompare(right.cardId) ||
    left.attachmentTargetCardId.localeCompare(right.attachmentTargetCardId) ||
    left.battlegroupControllerCardId.localeCompare(right.battlegroupControllerCardId));
  return stableGraphValue({
    taskSideKey: String(raw.taskSideKey || "subject"),
    factionName: String(roster.faction || roster.factionName || raw.factionName || ""),
    rosterMode: "fixed_complete",
    armyMode: "fixed",
    armyId: String(roster.armyId || raw.armyId || ""),
    armyName: String(roster.army || roster.armyName || raw.armyName || ""),
    leaderMode: "fixed",
    leaderIds: [String(roster.leaderId || "")].filter(Boolean),
    leaderNames: [String(roster.leader || roster.leaderName || "")].filter(Boolean),
    sourcePoolKey: String(raw.sourcePoolKey ||
      `fixed-complete-${raw.taskSideKey || "subject"}-current-pool`),
    requiredCards,
    excludedCardIds: [],
    excludedCardNames: [],
    excludedCardTypeNames: [],
    loadoutConstraints: [],
  });
}

function selectedArmy(side = {}, army = {}) {
  if (side.armyMode === "all_in_faction") return true;
  return side.armyIds.includes(String(army.id || "")) ||
    side.armyNames.includes(String(army.name || "")) ||
    (side.armyId && side.armyId === String(army.id || "")) ||
    (side.armyName && side.armyName === String(army.name || ""));
}

function armyLeaders(data = {}, army = {}) {
  const cardsById = new Map((data.cards || []).map((card) => [card.id, card]));
  return (army.cardIds || []).map((cardId) => cardsById.get(cardId)).filter((card) =>
    /warcaster|warlock/i.test(String(card?.cardTypeName || "")));
}

export function resolveWarmachineCustomTaskSideArmiesV1(data = {}, side = {}) {
  const factionArmies = (data.armies || []).filter((army) =>
    String(army.factionName || "") === String(side.factionName || "") &&
    armyLeaders(data, army).length > 0);
  const selected = factionArmies.filter((army) => selectedArmy(side, army));
  if (side.armyMode === "fixed" && selected.length > 1 && !side.armyId) {
    throw new Error(`custom_task_army_identity_ambiguous:${side.factionName}:${side.armyName}`);
  }
  const selectedRows = selected.map((army) => {
    const leaders = armyLeaders(data, army);
    const selectedLeaders = side.leaderMode === "all_in_army"
      ? leaders
      : leaders.filter((leader) =>
        side.leaderIds.includes(String(leader.id || "")) ||
        side.leaderNames.includes(String(leader.name || "")));
    return {
      army,
      leaders,
      selectedLeaders,
    };
  });
  const core = {
    factionName: side.factionName,
    armyMode: side.armyMode,
    factionArmyCount: factionArmies.length,
    selectedArmyCount: selectedRows.length,
    taskUnselectedArmyCount: Math.max(0, factionArmies.length - selectedRows.length),
    selectedArmies: selectedRows.map((row) => ({
      armyId: row.army.id,
      armyName: row.army.name,
      availableLeaderCount: row.leaders.length,
      selectedLeaderCount: row.selectedLeaders.length,
      taskUnselectedLeaderCount: Math.max(0, row.leaders.length - row.selectedLeaders.length),
      selectedLeaderIds: row.selectedLeaders.map((leader) => leader.id).sort(),
      selectedLeaderNames: row.selectedLeaders.map((leader) => leader.name).sort(),
    })),
  };
  return {
    ...core,
    selectedRows,
    resolutionHash: stableGraphHash(core),
  };
}

function sideConstructionBudget(task = {}, taskSideKey = "subject", raw = {}) {
  const common = task.searchBudget?.rosterConstruction || {};
  const taskOverride = task.searchBudget?.rosterConstructionBySide?.[taskSideKey] || {};
  const callerOverride = raw.searchBudgetBySide?.[taskSideKey] || {};
  return {
    maximumStatesPerCost: Math.max(16, Math.floor(numeric(
      callerOverride.maximumStatesPerCost ?? taskOverride.maximumStatesPerCost ??
        common.maximumStatesPerCost,
      160,
    ))),
    maximumPerBucket: Math.max(1, Math.floor(numeric(
      callerOverride.maximumPerBucket ?? taskOverride.maximumPerBucket ??
        common.maximumPerBucket,
      2,
    ))),
    maximumExactAttemptsPerLeader: Math.max(1, Math.floor(numeric(
      callerOverride.maximumExactAttemptsPerLeader ??
        taskOverride.maximumExactAttemptsPerLeader ??
        common.maximumExactAttemptsPerLeader,
      180,
    ))),
    minimumLegalRostersPerGoalPerLeader: Math.max(1, Math.floor(numeric(
      callerOverride.minimumLegalRostersPerGoalPerLeader ??
        taskOverride.minimumLegalRostersPerGoalPerLeader ??
        common.minimumLegalRostersPerGoalPerLeader,
      4,
    ))),
    maximumArchivedRosters: Math.max(1, Math.floor(numeric(
      callerOverride.maximumArchivedRosters ??
        callerOverride.maximumArchivedRostersPerSide ??
        taskOverride.maximumArchivedRosters ??
        taskOverride.maximumArchivedRostersPerSide ??
        common.maximumArchivedRostersPerSide,
      96,
    ))),
    goalProfiles: raw.goalProfiles || undefined,
  };
}

function roundRobinArmyRosters(armyPools = [], maximumRows = 1) {
  const rows = [];
  const seen = new Set();
  for (let cursor = 0; rows.length < maximumRows; cursor += 1) {
    let progressed = false;
    for (const pool of armyPools) {
      const roster = pool.rosters[cursor];
      if (!roster) continue;
      progressed = true;
      if (seen.has(roster.exportText)) continue;
      seen.add(roster.exportText);
      rows.push(roster);
      if (rows.length >= maximumRows) break;
    }
    if (!progressed) break;
  }
  return rows;
}

function sumPoolCount(armyPools = [], key = "") {
  return armyPools.reduce((sum, pool) => sum + numeric(pool.counts?.[key]), 0);
}

function buildSidePool(raw = {}, taskSideKey = "subject", sourceContentHash = "") {
  const { task, data, forceBuilder } = raw;
  const side = task.sides[taskSideKey];
  const resolution = resolveWarmachineCustomTaskSideArmiesV1(data, side);
  const budget = sideConstructionBudget(task, taskSideKey, raw);
  const generationRejected = [];
  const armyPools = [];
  for (const row of resolution.selectedRows) {
    if (!row.selectedLeaders.length) {
      generationRejected.push({
        armyId: row.army.id,
        armyName: row.army.name,
        reason: "task_selected_leader_not_in_army",
      });
      continue;
    }
    try {
      armyPools.push(generateWarmachineGenericRosterPoolV1({
        data,
        forceBuilder,
        armyId: row.army.id,
        leaderIds: row.selectedLeaders.map((leader) => leader.id),
        leaderNames: row.selectedLeaders.map((leader) => leader.name),
        pointLimit: task.format.pointLimit,
        fixedCards: side.requiredCards,
        fixedComplete: side.rosterMode === "fixed_complete",
        excludedCardIds: side.excludedCardIds,
        excludedCardNames: side.excludedCardNames,
        excludedCardTypeNames: side.excludedCardTypeNames,
        loadoutConstraints: side.loadoutConstraints,
        searchBudget: budget,
      }));
    } catch (error) {
      generationRejected.push({
        armyId: row.army.id,
        armyName: row.army.name,
        reason: String(error?.message || error).slice(0, 320),
      });
    }
  }
  const allGenerated = armyPools.flatMap((pool) => pool.rosters);
  const uniqueGeneratedCount = new Set(allGenerated.map((roster) => roster.exportText)).size;
  const lists = roundRobinArmyRosters(armyPools, budget.maximumArchivedRosters);
  const poolKey = side.sourcePoolKey;
  const core = stableGraphValue({
    schemaVersion: "warmachine_custom_task_side_roster_pool_v1",
    poolKey,
    taskSideKey,
    taskHash: task.taskHash,
    rosterMode: side.rosterMode,
    searchScope: side.rosterMode === "fixed_complete"
      ? "deployment_and_routes_only"
      : "roster_deployment_and_routes",
    sourceContentHash,
    sourceSchemaVersion: String(data.schemaVersion || "warmachine_lite_data"),
    exactListLegality: true,
    forceBuilderContract: "WarmachineForceBuilder exact costs, FA, attachments, battlegroups and option selections",
    remoteVersion: String(data.source?.remoteVersion || ""),
    exhaustiveAllFactionRosters: false,
    resolution: {
      factionName: resolution.factionName,
      armyMode: resolution.armyMode,
      factionArmyCount: resolution.factionArmyCount,
      selectedArmyCount: resolution.selectedArmyCount,
      taskUnselectedArmyCount: resolution.taskUnselectedArmyCount,
      selectedArmies: resolution.selectedArmies,
      resolutionHash: resolution.resolutionHash,
    },
    budget,
    counts: {
      generatedArmyPoolCount: armyPools.length,
      armyGenerationRejectedCount: generationRejected.length,
      exactLegalityAttemptCount: sumPoolCount(armyPools, "exactLegalityAttemptCount"),
      exactCandidateRejectedCount: sumPoolCount(armyPools, "rejectedCount"),
      partialStateBudgetDeferredCount:
        sumPoolCount(armyPools, "budgetPrunedPartialStateCount"),
      exactStateBudgetDeferredCount:
        sumPoolCount(armyPools, "exactStateBudgetDeferredCount"),
      generatedRosterCount: allGenerated.length,
      uniqueGeneratedRosterCount: uniqueGeneratedCount,
      crossArmyDuplicateRosterCount: Math.max(0, allGenerated.length - uniqueGeneratedCount),
      selectedRosterCount: lists.length,
      sideArchiveBudgetDeferredCount: Math.max(0, uniqueGeneratedCount - lists.length),
      alternativeBattlegroupAssignmentDeferredCount:
        sumPoolCount(armyPools, "deferredAlternativeBattlegroupAssignmentCount"),
    },
    generationRejected,
    armyPoolAudits: armyPools.map((pool) => ({
      army: pool.army,
      poolHash: pool.poolHash,
      counts: pool.counts,
      rejectionCounts: pool.rejectionCounts,
      enumerationAudit: pool.enumerationAudit,
      constructionGoalCoverageByLeader: pool.constructionGoalCoverageByLeader,
    })),
    lists,
    quality: {
      taskArmyResolutionComplete: resolution.selectedArmyCount > 0,
      allSelectedArmiesGenerated: generationRejected.length === 0,
      exactForceBuilderLegality: lists.every((roster) =>
        roster.totalPoints === task.format.pointLimit && roster.warnings.length === 0),
      finitePool: true,
      omissionClassesAudited: true,
      naturalRosterDistribution: false,
      trainingTruth: false,
    },
    claimBoundary: "This is a finite current-data Force Builder proposal pool. Task exclusions, exact rejects, duplicates, archive omissions and budget-deferred states are separate audit classes; no omitted roster is proved illegal or inferior.",
  });
  return { ...core, poolHash: stableGraphHash(core) };
}

export function buildWarmachineCustomTaskForceBuilderUniverseV1(raw = {}) {
  const task = raw.task || {};
  const data = raw.data || {};
  const forceBuilder = raw.forceBuilder;
  if (task.validation?.ok !== true) {
    throw new Error(`custom_matchup_task_invalid:${(task.validation?.issues || []).join(",")}`);
  }
  if (!forceBuilder) throw new Error("warmachine_force_builder_required");
  if (task.rulesetReceiptHash !== warmachineHost.receipt.receiptHash) {
    throw new Error(`custom_task_host_receipt_drift:${task.rulesetReceiptHash}:${
      warmachineHost.receipt.receiptHash}`);
  }
  if (task.dataReceipt?.remoteVersion &&
      String(task.dataReceipt.remoteVersion) !== String(data.source?.remoteVersion || "")) {
    throw new Error(`custom_task_data_version_drift:${task.dataReceipt.remoteVersion}:${
      data.source?.remoteVersion || ""}`);
  }
  const dataContentHash = stableGraphHash(data);
  const forceBuilderSourceHash = String(
    warmachineConstructionHost.receipt.sourceHashes[
      "android-shell/assets/companion/force-builder.js"
    ] || "",
  );
  if (!/^[0-9a-f]{64}$/.test(forceBuilderSourceHash)) {
    throw new Error("custom_task_force_builder_source_receipt_missing");
  }
  const sourceContentHash = stableGraphHash({
    dataContentHash,
    constructionHostReceiptHash: warmachineConstructionHost.receipt.receiptHash,
    forceBuilderSourceHash,
    genericRosterGeneratorSourceHash: WARMACHINE_GENERIC_ROSTER_POOL_V1_SOURCE_HASH,
    customTaskCompilerSourceHash: WARMACHINE_CUSTOM_TASK_FORCE_BUILDER_V1_SOURCE_HASH,
    customTaskSchemaSourceHash: CUSTOM_TASK_SCHEMA_SOURCE_HASH,
    taskRosterUniverseSourceHash: TASK_ROSTER_UNIVERSE_SOURCE_HASH,
  });
  const sidePools = {
    subject: buildSidePool({ ...raw, task, data, forceBuilder }, "subject", sourceContentHash),
    challenger: buildSidePool(
      { ...raw, task, data, forceBuilder },
      "challenger",
      sourceContentHash,
    ),
  };
  const poolsByKey = {
    [sidePools.subject.poolKey]: sidePools.subject,
    [sidePools.challenger.poolKey]: sidePools.challenger,
  };
  if (Object.keys(poolsByKey).length !== 2) {
    throw new Error("custom_task_side_pool_keys_not_unique");
  }
  const rosterUniverse = compileWarmachineTaskRosterUniverseV1({ task, poolsByKey });
  const armyCatalog = buildWarmachineCurrentArmyCatalogV1(data);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_CUSTOM_TASK_FORCE_BUILDER_V1_SCHEMA,
    taskKey: task.taskKey,
    taskHash: task.taskHash,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash: warmachineConstructionHost.receipt.receiptHash,
    dataReceipt: {
      remoteVersion: String(data.source?.remoteVersion || ""),
      dataContentHash,
      forceBuilderSourceHash,
      genericRosterGeneratorSourceHash: WARMACHINE_GENERIC_ROSTER_POOL_V1_SOURCE_HASH,
      customTaskCompilerSourceHash: WARMACHINE_CUSTOM_TASK_FORCE_BUILDER_V1_SOURCE_HASH,
      customTaskSchemaSourceHash: CUSTOM_TASK_SCHEMA_SOURCE_HASH,
      taskRosterUniverseSourceHash: TASK_ROSTER_UNIVERSE_SOURCE_HASH,
      combinedSourceContentHash: sourceContentHash,
      armyCatalogHash: armyCatalog.catalogHash,
    },
    sidePools,
    rosterUniverse,
    quality: {
      taskValid: true,
      exactForceBuilderLegality: rosterUniverse.exactListLegality === true &&
        Object.values(sidePools).every((pool) =>
          pool.quality.exactForceBuilderLegality === true),
      bothSidesNonempty: Object.values(sidePools).every((pool) => pool.lists.length > 0),
      allOmissionClassesAudited: Object.values(sidePools).every((pool) =>
        pool.quality.omissionClassesAudited === true),
      fixedCompleteSidesSkipRosterSearch: Object.values(sidePools)
        .filter((pool) => pool.rosterMode === "fixed_complete")
        .every((pool) => pool.searchScope === "deployment_and_routes_only"),
      strictTransitionEvaluated: false,
      naturalWinRate: false,
      globalOptimalityProven: false,
      trainingTruth: false,
    },
    claimBoundary: "The universe proves exact Force Builder legality only for returned finite rosters. It does not prove exhaustive faction construction, natural roster frequency, deployment reachability, route reachability, win rate or optimality.",
  });
  return { ...core, universeBuildHash: stableGraphHash(core) };
}
