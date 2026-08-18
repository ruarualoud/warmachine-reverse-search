import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineConstructionHost } from
  "../warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../warmachine-host-runtime.mjs";
import {
  auditWarmachineMatchupTerminalCandidateProgressV1,
} from "./matchup-terminal-candidate-chunk-v1.mjs";

export const WARMACHINE_MATCHUP_TERMINAL_ROOT_BATCH_PLAN_V1_SCHEMA =
  "warmachine_matchup_terminal_root_batch_plan_v1";
export const WARMACHINE_MATCHUP_TERMINAL_ROOT_BATCH_CHECKPOINT_V1_SCHEMA =
  "warmachine_matchup_terminal_root_batch_checkpoint_v1";

export const WARMACHINE_MATCHUP_TERMINAL_ROOT_DISPOSITIONS_V1 = Object.freeze([
  "strict_materialized",
  "strict_rejected",
  "proposal_filtered",
  "input_invalid",
  "rules_unknown",
  "budget_deferred",
]);

const FAMILY_ORDER = Object.freeze({
  assassination: 0,
  scenario_score_threshold: 1,
  simultaneous_leader_tiebreak: 2,
  fixed_round_tiebreak: 3,
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function exactProduct(values = []) {
  return values.reduce((product, value) => product * BigInt(value), 1n);
}

function exactSubtract(left = "0", right = "0") {
  return String(BigInt(left) - BigInt(right));
}

function taskDomainRows(task = {}, key = "") {
  if (key === "map") return task.stateDomain?.mapProfiles || [];
  if (key === "deployment") return task.stateDomain?.deploymentSeeds || [];
  if (key === "initiative") return task.stateDomain?.firstPlayerRows || [];
  return [];
}

function normalizedAxis(rows = [], keyOf, fallback) {
  const values = rows.map(keyOf).map(String).filter(Boolean);
  return values.length ? [...new Set(values)].sort() : [fallback];
}

function taskSideForCanonicalSide(sideKey = "", permutationKey = "identity") {
  const base = sideKey === "player1" ? "subject" :
    sideKey === "player2" ? "challenger" : "";
  if (!base || permutationKey === "identity") return base;
  return base === "subject" ? "challenger" : "subject";
}

function sidePermutationForInitiative(representative = {}, firstPlayerTaskSideKey = "") {
  const canonicalAttackerSideKey = String(
    representative.canonicalTerminal?.attackerSideKey || "",
  );
  const identityAttackerTaskSideKey = taskSideForCanonicalSide(
    canonicalAttackerSideKey,
    "identity",
  );
  if (!identityAttackerTaskSideKey ||
      !["subject", "challenger"].includes(firstPlayerTaskSideKey)) {
    throw new Error("matchup_terminal_batch_initiative_role_binding_invalid");
  }
  return identityAttackerTaskSideKey === firstPlayerTaskSideKey
    ? "identity" : "swap";
}

function groupAxes(
  task = {},
  group = {},
  representativeByKey = new Map(),
  cellByKey = new Map(),
) {
  const representativeRows = (group.representativeKeys || []).map((subcellKey) => {
    const representative = representativeByKey.get(subcellKey);
    const cell = cellByKey.get(String(representative?.cellKey || ""));
    return stableGraphValue({
      subcellKey,
      cellKey: String(representative?.cellKey || ""),
      scenarioKey: String(representative?.scenarioKey || ""),
      roundNumber: numeric(representative?.representativeRoundNumber),
      terminalClassKey: String(representative?.terminalClassKey || ""),
      coordinates: representative?.coordinates || {},
      skeletonObligations: representative?.skeletonObligations || [],
      sourceResolutionStatus: String(representative?.sourceResolutionStatus || ""),
      canonicalTerminal: {
        attackerSideKey: String(cell?.attackerSideKey || ""),
        defenderSideKey: String(cell?.defenderSideKey || ""),
        winnerSideKey: String(cell?.winnerSideKey || ""),
        loserSideKey: String(cell?.loserSideKey || ""),
        endingSideKey: String(cell?.endingSideKey || ""),
        causalActionFamily: String(cell?.causalActionFamily || ""),
        resultKind: String(cell?.resultKind || ""),
      },
    });
  });
  return stableGraphValue({
    representatives: representativeRows,
    subjectRosterKeys: (group.subjectRosterCandidates || [])
      .map((row) => String(row.rosterKey || "")).filter(Boolean),
    challengerRosterKeys: (group.challengerRosterCandidates || [])
      .map((row) => String(row.rosterKey || "")).filter(Boolean),
    mapKeys: normalizedAxis(taskDomainRows(task, "map"),
      (row) => row.mapKey, "map_unspecified"),
    deploymentSeedKeys: normalizedAxis(taskDomainRows(task, "deployment"),
      (row) => row.deploymentSeedKey, "deployment_unspecified"),
    firstPlayerTaskSideKeys: normalizedAxis(taskDomainRows(task, "initiative"),
      (row) => row.taskSideKey, "initiative_unspecified"),
    sidePermutationRelation:
      "derived_from_representative_attacker_and_first_player",
  });
}

function axisCounts(axes = {}) {
  return stableGraphValue({
    representative: axes.representatives?.length || 0,
    subjectRoster: axes.subjectRosterKeys?.length || 0,
    challengerRoster: axes.challengerRosterKeys?.length || 0,
    map: axes.mapKeys?.length || 0,
    deploymentSeed: axes.deploymentSeedKeys?.length || 0,
    firstPlayer: axes.firstPlayerTaskSideKeys?.length || 0,
    sidePermutation: 1,
  });
}

function variantCountForAxes(axes = {}) {
  return exactProduct(Object.values(axisCounts(axes)));
}

function mixedRadixSelection(axes = {}, rawIndex = 0n) {
  let cursor = BigInt(rawIndex);
  const dimensions = [
    ["representative", axes.representatives || []],
    ["subjectRosterKey", axes.subjectRosterKeys || []],
    ["challengerRosterKey", axes.challengerRosterKeys || []],
    ["mapKey", axes.mapKeys || []],
    ["deploymentSeedKey", axes.deploymentSeedKeys || []],
    ["firstPlayerTaskSideKey", axes.firstPlayerTaskSideKeys || []],
  ];
  const selected = {};
  const indexByDimension = {};
  for (const [dimensionKey, rows] of dimensions) {
    if (!rows.length) throw new Error(`matchup_terminal_batch_empty_axis:${dimensionKey}`);
    const radix = BigInt(rows.length);
    const index = Number(cursor % radix);
    cursor /= radix;
    selected[dimensionKey] = rows[index];
    indexByDimension[dimensionKey] = index;
  }
  selected.sidePermutationKey = sidePermutationForInitiative(
    selected.representative,
    selected.firstPlayerTaskSideKey,
  );
  indexByDimension.sidePermutationKey = 0;
  return stableGraphValue({ selected, indexByDimension });
}

function mixedRadixPinnedSelection(axes = {}, pin = {}) {
  const dimensions = [
    ["representative", axes.representatives || [], (row) => row.subcellKey,
      String(pin.representativeSubcellKey || "")],
    ["subjectRosterKey", axes.subjectRosterKeys || [], String,
      String(pin.subjectRosterKey || "")],
    ["challengerRosterKey", axes.challengerRosterKeys || [], String,
      String(pin.challengerRosterKey || "")],
    ["mapKey", axes.mapKeys || [], String, String(pin.mapKey || "")],
    ["deploymentSeedKey", axes.deploymentSeedKeys || [], String,
      String(pin.deploymentSeedKey || "")],
    ["firstPlayerTaskSideKey", axes.firstPlayerTaskSideKeys || [], String,
      String(pin.firstPlayerTaskSideKey || "")],
  ];
  const selected = {};
  const indexByDimension = {};
  let multiplier = 1n;
  let variantIndex = 0n;
  for (const [dimensionKey, rows, keyOf, requestedKey] of dimensions) {
    const index = rows.findIndex((row) => String(keyOf(row)) === requestedKey);
    if (index < 0) {
      throw new Error(`matchup_terminal_batch_pinned_axis_value_invalid:${
        dimensionKey}:${requestedKey}`);
    }
    selected[dimensionKey] = rows[index];
    indexByDimension[dimensionKey] = index;
    variantIndex += BigInt(index) * multiplier;
    multiplier *= BigInt(rows.length);
  }
  selected.sidePermutationKey = sidePermutationForInitiative(
    selected.representative,
    selected.firstPlayerTaskSideKey,
  );
  if (pin.sidePermutationKey &&
      String(pin.sidePermutationKey) !== selected.sidePermutationKey) {
    throw new Error(
      `matchup_terminal_batch_pinned_axis_value_invalid:sidePermutationKey:${
        pin.sidePermutationKey}`,
    );
  }
  indexByDimension.sidePermutationKey = 0;
  return stableGraphValue({
    selected,
    indexByDimension,
    variantIndex: String(variantIndex),
  });
}

function mixedRadixPreferredSelection(axes = {}, preferred = {}) {
  return mixedRadixPinnedSelection(axes, {
    representativeSubcellKey: axes.representatives?.[0]?.subcellKey,
    subjectRosterKey: axes.subjectRosterKeys?.[0],
    challengerRosterKey: axes.challengerRosterKeys?.[0],
    mapKey: axes.mapKeys?.includes(preferred.mapKey)
      ? preferred.mapKey : axes.mapKeys?.[0],
    deploymentSeedKey: axes.deploymentSeedKeys?.includes(preferred.deploymentSeedKey)
      ? preferred.deploymentSeedKey : axes.deploymentSeedKeys?.[0],
    firstPlayerTaskSideKey: axes.firstPlayerTaskSideKeys?.includes(
      preferred.firstPlayerTaskSideKey,
    ) ? preferred.firstPlayerTaskSideKey : axes.firstPlayerTaskSideKeys?.[0],
  });
}

function shardIndexForKey(key = "", shardCount = 1) {
  const hashPrefix = stableGraphHash(String(key)).slice(0, 16);
  return Number(BigInt(`0x${hashPrefix}`) % BigInt(shardCount));
}

function orderedGroups(groups = []) {
  const strata = new Map();
  for (const group of [...groups].sort((left, right) =>
    (FAMILY_ORDER[left.goalFamily] ?? 99) - (FAMILY_ORDER[right.goalFamily] ?? 99) ||
    String(left.constructionMacroProfileKey).localeCompare(
      String(right.constructionMacroProfileKey),
    ) || String(left.groupKey).localeCompare(String(right.groupKey)))) {
    const stratumKey = `${group.goalFamily}:${group.constructionMacroProfileKey}`;
    if (!strata.has(stratumKey)) strata.set(stratumKey, []);
    strata.get(stratumKey).push(group);
  }
  const queues = [...strata.entries()].sort(([left], [right]) =>
    left.localeCompare(right)).map(([stratumKey, rows]) => ({ stratumKey, rows }));
  const ordered = [];
  for (let depth = 0; queues.some((queue) => depth < queue.rows.length); depth += 1) {
    for (const queue of queues) {
      if (queue.rows[depth]) ordered.push(queue.rows[depth]);
    }
  }
  return ordered;
}

function planReceipts(raw = {}) {
  const pool = raw.pool || {};
  const routing = raw.routing || {};
  const evidenceCorpus = raw.evidenceCorpus || {};
  return stableGraphValue({
    taskHash: String(raw.task?.taskHash || ""),
    routingHash: String(routing.routingHash || ""),
    demandGroupSetHash: String(routing.demandGroupSetHash || ""),
    evidenceCorpusHash: String(evidenceCorpus.evidenceCorpus?.evidenceCorpusHash || ""),
    representativeSelectionHash: String(
      evidenceCorpus.representativeSelection?.selectionHash || "",
    ),
    poolSetHash: String(pool.poolSetHash || ""),
    dataVersion: String(pool.source?.remoteVersion || raw.dataVersion || ""),
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash: warmachineConstructionHost.receipt.receiptHash,
    forceBuilderSourceHash: String(pool.source?.forceBuilderSourceHash || ""),
  });
}

function assertSealedArtifact(value = {}, hashField = "", errorCode = "") {
  const core = { ...value };
  const declaredHash = String(core[hashField] || "");
  delete core[hashField];
  if (!declaredHash || stableGraphHash(core) !== declaredHash) {
    throw new Error(errorCode);
  }
}

function assertPlanSourceParity(raw = {}) {
  const task = raw.task || {};
  const pool = raw.pool || {};
  const routing = raw.routing || {};
  const evidenceCorpus = raw.evidenceCorpus || {};
  assertSealedArtifact(task, "taskHash", "matchup_terminal_batch_task_hash_invalid");
  assertSealedArtifact(pool, "poolSetHash", "matchup_terminal_batch_pool_hash_invalid");
  if (task.rulesetReceiptHash !== warmachineHost.receipt.receiptHash) {
    throw new Error("matchup_terminal_batch_task_host_receipt_drift");
  }
  if (pool.source?.constructionHostReceiptHash !==
      warmachineConstructionHost.receipt.receiptHash) {
    throw new Error("matchup_terminal_batch_pool_construction_host_receipt_drift");
  }
  const currentForceBuilderSourceHash = String(
    warmachineConstructionHost.receipt.sourceHashes?.[
      "android-shell/assets/companion/force-builder.js"
    ] || "",
  );
  if (!currentForceBuilderSourceHash ||
      pool.source?.forceBuilderSourceHash !== currentForceBuilderSourceHash) {
    throw new Error("matchup_terminal_batch_force_builder_source_drift");
  }
  assertSealedArtifact(
    evidenceCorpus,
    "cacheHash",
    "matchup_terminal_batch_evidence_cache_hash_invalid",
  );
  if (evidenceCorpus.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
    throw new Error("matchup_terminal_batch_evidence_host_receipt_drift");
  }
  assertSealedArtifact(
    routing,
    "routingHash",
    "matchup_terminal_batch_routing_hash_invalid",
  );
  if (!task.taskHash || task.taskHash !== pool.taskHash ||
      task.taskHash !== routing.taskHash || task.taskHash !== evidenceCorpus.taskHash) {
    throw new Error("matchup_terminal_batch_task_receipt_mismatch");
  }
  const demandGroups = evidenceCorpus.demandGroups || {};
  const evidence = evidenceCorpus.evidenceCorpus || {};
  const representativeSelection = evidenceCorpus.representativeSelection || {};
  const demandGroupSetHash = String(demandGroups.demandGroupSetHash || "");
  const evidenceCorpusHash = String(evidence.evidenceCorpusHash || "");
  const representativeSelectionHash = String(representativeSelection.selectionHash || "");
  if (!demandGroupSetHash || routing.demandGroupSetHash !== demandGroupSetHash ||
      pool.terminalDemand?.demandGroupSetHash !== demandGroupSetHash ||
      evidence.demandGroupSetHash !== demandGroupSetHash) {
    throw new Error("matchup_terminal_batch_demand_group_set_mismatch");
  }
  if (!evidenceCorpusHash ||
      pool.terminalDemand?.evidenceCorpusHash !== evidenceCorpusHash) {
    throw new Error("matchup_terminal_batch_evidence_corpus_mismatch");
  }
  if (!representativeSelectionHash ||
      pool.terminalDemand?.representativeSelectionHash !== representativeSelectionHash ||
      demandGroups.representativeSelectionHash !== representativeSelectionHash ||
      evidence.representativeSelectionHash !== representativeSelectionHash) {
    throw new Error("matchup_terminal_batch_representative_selection_mismatch");
  }
  if (routing.eligibleDemandGroupCount !== (routing.routedGroups || []).length) {
    throw new Error("matchup_terminal_batch_routed_group_count_mismatch");
  }
  const demandGroupByKey = new Map((demandGroups.groups || []).map((group) => [
    String(group.groupKey || ""),
    group,
  ]));
  const subjectRosterKeys = new Set((pool.subjectPool?.rosters || []).map((roster) =>
    String(roster.key || "")));
  const challengerRosterKeys = new Set((pool.challengerPool?.rosters || []).map((roster) =>
    String(roster.key || "")));
  for (const group of routing.routedGroups || []) {
    const sourceGroup = demandGroupByKey.get(String(group.groupKey || ""));
    if (!sourceGroup || stableGraphHash(group.representativeKeys || []) !==
        stableGraphHash(sourceGroup.representativeKeys || [])) {
      throw new Error("matchup_terminal_batch_routed_group_source_mismatch");
    }
    const groupCore = { ...group };
    const routingGroupHash = String(groupCore.routingGroupHash || "");
    delete groupCore.routingGroupHash;
    if (!routingGroupHash || stableGraphHash(groupCore) !== routingGroupHash) {
      throw new Error("matchup_terminal_batch_routing_group_hash_invalid");
    }
    if (!(group.subjectRosterCandidates || []).length ||
        group.subjectRosterCandidates.some((row) =>
          !subjectRosterKeys.has(String(row.sourceListKey || "")))) {
      throw new Error("matchup_terminal_batch_subject_roster_route_invalid");
    }
    if (!(group.challengerRosterCandidates || []).length ||
        group.challengerRosterCandidates.some((row) =>
          !challengerRosterKeys.has(String(row.sourceListKey || "")))) {
      throw new Error("matchup_terminal_batch_challenger_roster_route_invalid");
    }
  }
}

function compactRosterEntry(entry = {}) {
  return stableGraphValue({
    entryId: String(entry.entryId || ""),
    cardId: String(entry.cardId || ""),
    name: String(entry.name || ""),
    cardTypeName: String(entry.cardTypeName || ""),
    physicalModelCount: Math.max(0, numeric(entry.physicalModels)),
  });
}

function executionEnvelopeForSelection(pool = {}, group = {}, selection = {}) {
  const selected = selection.selected || {};
  const representative = selected.representative || {};
  const canonical = representative.canonicalTerminal || {};
  const permutationKey = String(selected.sidePermutationKey || "identity");
  const sideBinding = stableGraphValue(Object.fromEntries([
    "attacker",
    "defender",
    "winner",
    "loser",
    "ending",
  ].map((role) => [
    `${role}TaskSideKey`,
    taskSideForCanonicalSide(canonical[`${role}SideKey`], permutationKey),
  ])));
  const candidateByTaskSide = {
    subject: (group.subjectRosterCandidates || []).find((candidate) =>
      candidate.rosterKey === selected.subjectRosterKey),
    challenger: (group.challengerRosterCandidates || []).find((candidate) =>
      candidate.rosterKey === selected.challengerRosterKey),
  };
  const rosterByTaskSide = {
    subject: (pool.subjectPool?.rosters || []).find((roster) =>
      roster.key === candidateByTaskSide.subject?.sourceListKey),
    challenger: (pool.challengerPool?.rosters || []).find((roster) =>
      roster.key === candidateByTaskSide.challenger?.sourceListKey),
  };
  if (!rosterByTaskSide.subject || !rosterByTaskSide.challenger) {
    throw new Error("matchup_terminal_batch_execution_envelope_roster_missing");
  }
  const actionFamily = String(canonical.causalActionFamily || "");
  const actorTaskSideKey = actionFamily === "active_attack_or_effect"
    ? sideBinding.attackerTaskSideKey
    : sideBinding.endingTaskSideKey;
  const actorEntries = actionFamily === "steamroller_turn_end_settlement"
    ? [stableGraphValue({
      entryId: "host_scenario_settlement",
      cardId: "",
      name: "Steamroller turn-end settlement",
      cardTypeName: "Scenario",
      physicalModelCount: 0,
    })]
    : (rosterByTaskSide[actorTaskSideKey]?.entries || []).map(compactRosterEntry);
  const defenderLeaderEntries = (rosterByTaskSide[sideBinding.defenderTaskSideKey]
    ?.entries || []).filter((entry) => /warcaster|warlock/i.test(
    String(entry.cardTypeName || ""),
  )).map(compactRosterEntry);
  const targetCandidates = group.goalFamily === "assassination"
    ? defenderLeaderEntries
    : group.goalFamily === "simultaneous_leader_tiebreak"
      ? [
        ...(rosterByTaskSide.subject.entries || []),
        ...(rosterByTaskSide.challenger.entries || []),
      ].filter((entry) => /warcaster|warlock/i.test(
        String(entry.cardTypeName || ""),
      )).map(compactRosterEntry)
      : [stableGraphValue({
        targetKind: "host_scenario_elements_and_control_eligible_models",
        identityExpansion: "after_strict_opening",
      })];
  const coordinates = representative.coordinates || {};
  const core = stableGraphValue({
    sidePermutationKey: permutationKey,
    sideBinding,
    actionCategory: actionFamily,
    actorAxis: {
      taskSideKey: actorTaskSideKey,
      candidates: actorEntries,
      candidateCount: actorEntries.length,
      exactModelIdentityExpansion: "after_strict_opening",
      legalActionSelectionAuthority: "rules_v1_host_enumeration",
    },
    targetAxis: {
      candidates: targetCandidates,
      candidateCount: targetCandidates.length,
      exactModelIdentityExpansion: "after_strict_opening",
      targetLegalityAuthority: "rules_v1_host_enumeration",
    },
    resourceAxis: [String(coordinates.resource || "not_applicable")],
    healthAndSystemAxis: [String(coordinates.damage || "not_applicable")],
    lossAndLifecycleAxis: [String(coordinates.lifecycle || "not_applicable")],
    positionAxis: stableGraphValue({
      actionRange: String(coordinates.actionRange || "not_applicable"),
      baseTopology: String(coordinates.baseTopology || "not_applicable"),
      leaderControl: String(coordinates.leaderControl || "not_applicable"),
      lineOfSight: String(coordinates.lineOfSight || "not_applicable"),
    }),
    terrainAxis: [String(coordinates.scenarioTerrainSetup || "not_applicable")],
    scenarioControlAxis: [String(coordinates.scenarioControl || "not_applicable")],
    scoreTransitionAxis: [String(coordinates.scoreTransition || "not_applicable")],
    sourceRosterKeys: {
      subject: rosterByTaskSide.subject.key,
      challenger: rosterByTaskSide.challenger.key,
    },
    finiteCandidatePairCount: String(BigInt(Math.max(1, actorEntries.length)) *
      BigInt(Math.max(1, targetCandidates.length))),
    behaviorEquivalenceAuthority:
      "exact_rosters_representative_side_permutation_and_host_receipts_only",
    rulesAuthority: "project_d_rules_v1_host",
    strategyAuthority: false,
  });
  return { ...core, executionEnvelopeHash: stableGraphHash(core) };
}

function dispositionCounts(rows = []) {
  return Object.fromEntries(WARMACHINE_MATCHUP_TERMINAL_ROOT_DISPOSITIONS_V1.map(
    (disposition) => [disposition, rows.filter((row) =>
      row.result?.disposition === disposition).length],
  ));
}

export function buildWarmachineMatchupTerminalRootBatchPlanV1(raw = {}) {
  const task = raw.task || {};
  const routing = raw.routing || {};
  const evidenceCorpus = raw.evidenceCorpus || {};
  assertPlanSourceParity(raw);
  const representativeRows = evidenceCorpus.representativeSelection
    ?.selectedRepresentatives || [];
  const representativeByKey = new Map(representativeRows.map((row) => [
    String(row.subcellKey || ""),
    row,
  ]));
  const cellByKey = new Map((evidenceCorpus.corpus?.cells || []).map((cell) => [
    String(cell.cellKey || ""),
    cell,
  ]));
  const routedGroups = routing.routedGroups || [];
  const groupPlans = routedGroups.map((group) => {
    const axes = groupAxes(task, group, representativeByKey, cellByKey);
    const counts = axisCounts(axes);
    const missingRepresentativeKeys = axes.representatives.filter((row) =>
      !row.cellKey).map((row) => row.subcellKey);
    const candidateVariantMass = missingRepresentativeKeys.length
      ? "0"
      : String(variantCountForAxes(axes));
    const core = stableGraphValue({
      groupKey: group.groupKey,
      baseRoutingGroupHash: group.routingGroupHash,
      goalFamily: group.goalFamily,
      constructionMacroProfileKey: group.constructionMacroProfileKey,
      representativeCount: group.representativeCount,
      representativeKeys: group.representativeKeys,
      representativeSetHash: stableGraphHash(group.representativeKeys || []),
      scenarioKeys: group.scenarioKeys,
      exactRoundNumbers: group.exactRoundNumbers,
      requirements: group.requirements,
      evaluationStandard: group.evaluationStandard,
      axes,
      axisCounts: counts,
      candidateVariantMass,
      missingRepresentativeKeys,
      finiteExpansionProven: candidateVariantMass !== "0" &&
        Object.values(counts).every((count) => count > 0),
    });
    return { ...core, groupPlanHash: stableGraphHash(core) };
  });
  const maximumTasks = Math.max(0, Math.floor(numeric(
    raw.maximumMaterializationTasks,
    task.searchBudget?.maximumTerminalRootsPerOpening || 0,
  )));
  const shardCount = Math.max(1, Math.floor(numeric(raw.shardCount, 1)));
  const groupPlanByKey = new Map(groupPlans.map((row) => [row.groupKey, row]));
  const selectedTasks = [];
  const selectedTaskKeys = new Set();
  const appendTask = (group, groupPlan, selection, variantIndex, selectionSource) => {
    const representative = selection.selected.representative;
    const identity = stableGraphValue({
      groupKey: group.groupKey,
      groupPlanHash: groupPlan.groupPlanHash,
      variantIndex: String(variantIndex),
      representative,
      subjectRosterKey: selection.selected.subjectRosterKey,
      challengerRosterKey: selection.selected.challengerRosterKey,
      mapKey: selection.selected.mapKey,
      deploymentSeedKey: selection.selected.deploymentSeedKey,
      firstPlayerTaskSideKey: selection.selected.firstPlayerTaskSideKey,
      sidePermutationKey: selection.selected.sidePermutationKey,
    });
    const executionEnvelope = executionEnvelopeForSelection(
      raw.pool,
      group,
      selection,
    );
    const behaviorSignature = stableGraphValue({
      ...identity,
      exactRepresentativeCoordinates: representative.coordinates,
      executionEnvelopeHash: executionEnvelope.executionEnvelopeHash,
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      constructionHostReceiptHash: warmachineConstructionHost.receipt.receiptHash,
    });
    const taskKey = `matchup-terminal-task-${stableGraphHash(identity).slice(0, 32)}`;
    if (selectedTaskKeys.has(taskKey)) {
      throw new Error(`matchup_terminal_batch_duplicate_selected_task:${taskKey}`);
    }
    selectedTaskKeys.add(taskKey);
    selectedTasks.push(stableGraphValue({
      taskKey,
      ...identity,
      mixedRadixIndexByDimension: selection.indexByDimension,
      selectionSource,
      executionEnvelope,
      behaviorSignatureHash: stableGraphHash(behaviorSignature),
      equivalentTaskKeys: [taskKey],
      equivalenceMergeProven: true,
      shardIndex: shardIndexForKey(taskKey, shardCount),
      initialStatus: "queued",
    }));
  };
  const pinnedRows = raw.pinnedMaterializationTasks || [];
  if (pinnedRows.length > maximumTasks) {
    throw new Error("matchup_terminal_batch_pinned_tasks_exceed_budget");
  }
  for (const pin of pinnedRows) {
    const group = routedGroups.find((row) => row.groupKey === pin.groupKey);
    const groupPlan = groupPlanByKey.get(String(pin.groupKey || ""));
    if (!group || !groupPlan?.finiteExpansionProven) {
      throw new Error(`matchup_terminal_batch_pinned_group_invalid:${
        pin.groupKey || "missing"}`);
    }
    const selection = mixedRadixPinnedSelection(groupPlan.axes, pin);
    appendTask(group, groupPlan, selection, selection.variantIndex, "pinned_strict_seed");
  }
  const groupsWithSelectedTasks = new Set(selectedTasks.map((row) => row.groupKey));
  for (const group of orderedGroups(routedGroups)) {
    if (selectedTasks.length >= maximumTasks) break;
    if (groupsWithSelectedTasks.has(group.groupKey)) continue;
    const groupPlan = groupPlanByKey.get(group.groupKey);
    if (!groupPlan?.finiteExpansionProven) continue;
    const selection = mixedRadixPreferredSelection(
      groupPlan.axes,
      raw.preferredAxisValues || {},
    );
    appendTask(
      group,
      groupPlan,
      selection,
      selection.variantIndex,
      "round_robin_group_head",
    );
    groupsWithSelectedTasks.add(group.groupKey);
  }
  const selectedByGroup = new Map();
  for (const taskRow of selectedTasks) {
    if (!selectedByGroup.has(taskRow.groupKey)) selectedByGroup.set(taskRow.groupKey, []);
    selectedByGroup.get(taskRow.groupKey).push(taskRow);
  }
  const groupLedger = groupPlans.map((group) => {
    const selected = selectedByGroup.get(group.groupKey) || [];
    const queuedRepresentativeKeys = [...new Set(selected.map((row) =>
      row.representative.subcellKey))].sort();
    return stableGraphValue({
      groupKey: group.groupKey,
      representativeCount: group.representativeCount,
      queuedRepresentativeKeys,
      queuedRepresentativeCount: queuedRepresentativeKeys.length,
      budgetDeferredRepresentativeCount:
        group.representativeCount - queuedRepresentativeKeys.length,
      representativeMassConserved:
        queuedRepresentativeKeys.length +
          (group.representativeCount - queuedRepresentativeKeys.length) ===
        group.representativeCount,
      candidateVariantMass: group.candidateVariantMass,
      queuedCandidateCount: selected.length,
      budgetDeferredCandidateMass: exactSubtract(
        group.candidateVariantMass,
        String(selected.length),
      ),
      candidateMassConserved: BigInt(group.candidateVariantMass) ===
        BigInt(selected.length) + BigInt(exactSubtract(
          group.candidateVariantMass,
          String(selected.length),
        )),
    });
  });
  const representativeCount = groupLedger.reduce((sum, row) =>
    sum + row.representativeCount, 0);
  const queuedRepresentativeCount = groupLedger.reduce((sum, row) =>
    sum + row.queuedRepresentativeCount, 0);
  const deferredRepresentativeCount = groupLedger.reduce((sum, row) =>
    sum + row.budgetDeferredRepresentativeCount, 0);
  const candidateVariantMass = groupLedger.reduce((sum, row) =>
    sum + BigInt(row.candidateVariantMass), 0n);
  const deferredCandidateMass = groupLedger.reduce((sum, row) =>
    sum + BigInt(row.budgetDeferredCandidateMass), 0n);
  const receipts = planReceipts(raw);
  const familyCounts = Object.fromEntries([...new Set(groupPlans.map((row) =>
    row.goalFamily))].sort().map((family) => [family, groupPlans.filter((row) =>
    row.goalFamily === family).length]));
  const selectedFamilyCounts = Object.fromEntries(Object.keys(familyCounts).map((family) => [
    family,
    selectedTasks.filter((row) => groupPlanByKey.get(row.groupKey)?.goalFamily === family).length,
  ]));
  const macroKeys = [...new Set(groupPlans.map((row) =>
    row.constructionMacroProfileKey))].sort();
  const selectedMacroKeys = [...new Set(selectedTasks.map((row) =>
    groupPlanByKey.get(row.groupKey)?.constructionMacroProfileKey))].sort();
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_MATCHUP_TERMINAL_ROOT_BATCH_PLAN_V1_SCHEMA,
    terminalTaskExecutionContractVersion: String(
      raw.terminalTaskExecutionContractVersion || "unversioned",
    ),
    receipts,
    taskKey: String(task.taskKey || ""),
    groupCount: groupPlans.length,
    representativeCount,
    constructionMacroProfileCount: macroKeys.length,
    constructionMacroProfileKeys: macroKeys,
    familyCounts,
    groupPlans,
    selectionBudget: maximumTasks,
    pinnedTaskCount: pinnedRows.length,
    selectedTaskCount: selectedTasks.length,
    selectedTasks,
    selectedFamilyCounts,
    selectedConstructionMacroProfileKeys: selectedMacroKeys,
    selectedConstructionMacroProfileCount: selectedMacroKeys.length,
    workQueues: Object.fromEntries(Object.keys(familyCounts).map((family) => {
      const familyGroupKeys = new Set(groupPlans.filter((row) =>
        row.goalFamily === family).map((row) => row.groupKey));
      const taskKeys = selectedTasks.filter((row) =>
        familyGroupKeys.has(row.groupKey)).map((row) => row.taskKey);
      return [family, {
        groupCount: familyGroupKeys.size,
        selectedTaskCount: taskKeys.length,
        selectedTaskKeys: taskKeys,
        budgetDeferredGroupCount: [...familyGroupKeys].filter((groupKey) =>
          !groupsWithSelectedTasks.has(groupKey)).length,
      }];
    })),
    shardCount,
    shardTaskCounts: Object.fromEntries(Array.from({ length: shardCount }, (_, index) => [
      String(index),
      selectedTasks.filter((row) => row.shardIndex === index).length,
    ])),
    groupLedger,
    representativeDispositionMass: {
      queued: queuedRepresentativeCount,
      budget_deferred: deferredRepresentativeCount,
    },
    candidateDispositionMass: {
      queued: String(selectedTasks.length),
      budget_deferred: String(deferredCandidateMass),
    },
    candidateVariantMass: String(candidateVariantMass),
    representativeMassConserved:
      representativeCount === queuedRepresentativeCount + deferredRepresentativeCount,
    candidateMassConserved:
      candidateVariantMass === BigInt(selectedTasks.length) + deferredCandidateMass,
    allGroupsRepresented: groupPlans.length === routing.eligibleDemandGroupCount,
    allMacrosRepresentedInPlan: macroKeys.length === routing.constructionMacroProfileCount,
    allMacrosSelectedWithinBudget: selectedMacroKeys.length === macroKeys.length,
    behaviorEquivalenceContract:
      "merge_only_when_exact_task_rosters_representative_map_deployment_initiative_and_receipts_match",
    genericCapabilityPinsCountAsTaskRoots: false,
    deploymentToTerminalReachabilityProven: false,
    gameValueInterval: { lowerBound: 0, upperBound: 1 },
    naturalWinRate: null,
    trainingTruth: false,
    claimBoundary: "The plan factorizes every task-eligible detailed terminal group into finite representative, exact roster, map, deployment and initiative axes. Selected work is scheduling only; all omitted representative and candidate mass remains budget_deferred. Behavior signatures permit merging only for exact execution-equivalent inputs. No queued item is a strict root, reachable route, game value or training label.",
  });
  return { ...core, planHash: stableGraphHash(core) };
}

function checkpointCore(checkpoint = {}) {
  const { checkpointHash: _checkpointHash, ...core } = checkpoint;
  return stableGraphValue(core);
}

function checkpointCounts(tasks = []) {
  const hasCandidateProgress = tasks.some((row) =>
    row.searchProgress !== null && row.searchProgress !== undefined);
  const counts = {
    queued: tasks.filter((row) => row.status === "queued").length,
    leased: tasks.filter((row) => row.status === "leased").length,
    completed: tasks.filter((row) => row.status === "completed").length,
    dispositions: dispositionCounts(tasks),
  };
  if (hasCandidateProgress) {
    counts.inProgress = tasks.filter((row) => row.status !== "completed" &&
      row.searchProgress !== null && row.searchProgress !== undefined).length;
  }
  return stableGraphValue(counts);
}

function auditTaskCandidateProgress(task = {}, plan = {}) {
  const searchProgress = task.searchProgress || {};
  const candidatePlan = searchProgress.candidatePlan || {};
  const progress = searchProgress.progress || {};
  const audit = auditWarmachineMatchupTerminalCandidateProgressV1(
    progress,
    candidatePlan,
  );
  const issues = [...(audit.issues || [])];
  if (candidatePlan.taskKey !== task.taskKey ||
      candidatePlan.behaviorSignatureHash !== task.behaviorSignatureHash ||
      candidatePlan.terminalTaskExecutionContractVersion !==
        plan.terminalTaskExecutionContractVersion ||
      candidatePlan.hostReceiptHash !== warmachineHost.receipt.receiptHash ||
      candidatePlan.constructionHostReceiptHash !==
        warmachineConstructionHost.receipt.receiptHash) {
    issues.push("batch_checkpoint_candidate_progress_task_binding_invalid");
  }
  return stableGraphValue({
    ok: issues.length === 0,
    issues: [...new Set(issues)].sort(),
    candidatePlanHash: String(candidatePlan.candidatePlanHash || ""),
    progressHash: String(progress.progressHash || ""),
  });
}

function sealCheckpoint(raw = {}) {
  const tasks = stableGraphValue(raw.tasks || []);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_MATCHUP_TERMINAL_ROOT_BATCH_CHECKPOINT_V1_SCHEMA,
    planHash: raw.planHash,
    receipts: raw.receipts,
    revision: numeric(raw.revision),
    updatedAtMs: numeric(raw.updatedAtMs),
    tasks,
    counts: checkpointCounts(tasks),
    staleLeaseTakeoverCount: numeric(raw.staleLeaseTakeoverCount),
    trainingTruth: false,
  });
  return { ...core, checkpointHash: stableGraphHash(core) };
}

export function buildWarmachineMatchupTerminalRootBatchCheckpointV1(
  plan = {},
  raw = {},
) {
  if (plan.schemaVersion !== WARMACHINE_MATCHUP_TERMINAL_ROOT_BATCH_PLAN_V1_SCHEMA) {
    throw new Error("matchup_terminal_batch_plan_schema_invalid");
  }
  const { planHash, ...planCore } = plan;
  if (!planHash || stableGraphHash(planCore) !== planHash) {
    throw new Error("matchup_terminal_batch_plan_hash_invalid");
  }
  return sealCheckpoint({
    planHash,
    receipts: plan.receipts,
    revision: 0,
    updatedAtMs: numeric(raw.nowMs),
    staleLeaseTakeoverCount: 0,
    tasks: plan.selectedTasks.map((task) => ({
      taskKey: task.taskKey,
      shardIndex: task.shardIndex,
      behaviorSignatureHash: task.behaviorSignatureHash,
      groupKey: task.groupKey,
      representativeSubcellKey: task.representative.subcellKey,
      status: "queued",
      lease: null,
      result: null,
      searchProgress: null,
      takeoverCount: 0,
    })),
  });
}

export function auditWarmachineMatchupTerminalRootBatchCheckpointV1(
  checkpoint = {},
  plan = {},
) {
  const issues = [];
  const allowedStatuses = new Set(["queued", "leased", "completed"]);
  const allowedDispositions = new Set(
    WARMACHINE_MATCHUP_TERMINAL_ROOT_DISPOSITIONS_V1,
  );
  const { planHash, ...planCore } = plan;
  if (!planHash || stableGraphHash(planCore) !== planHash) {
    issues.push("batch_plan_hash_invalid");
  }
  if (checkpoint.schemaVersion !==
      WARMACHINE_MATCHUP_TERMINAL_ROOT_BATCH_CHECKPOINT_V1_SCHEMA) {
    issues.push("batch_checkpoint_schema_mismatch");
  }
  if (stableGraphHash(checkpointCore(checkpoint)) !== checkpoint.checkpointHash) {
    issues.push("batch_checkpoint_hash_invalid");
  }
  if (checkpoint.planHash !== planHash) issues.push("batch_checkpoint_plan_mismatch");
  if (stableGraphHash(checkpoint.receipts || {}) !== stableGraphHash(plan.receipts || {})) {
    issues.push("batch_checkpoint_receipts_mismatch");
  }
  if (checkpoint.receipts?.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
    issues.push("batch_checkpoint_host_receipt_drift");
  }
  if (checkpoint.receipts?.constructionHostReceiptHash !==
      warmachineConstructionHost.receipt.receiptHash) {
    issues.push("batch_checkpoint_construction_host_receipt_drift");
  }
  const planTasks = new Map((plan.selectedTasks || []).map((row) => [row.taskKey, row]));
  const checkpointKeys = new Set();
  for (const task of checkpoint.tasks || []) {
    if (checkpointKeys.has(task.taskKey)) issues.push("batch_checkpoint_duplicate_task");
    checkpointKeys.add(task.taskKey);
    const planned = planTasks.get(task.taskKey);
    if (!planned) {
      issues.push("batch_checkpoint_unknown_task");
      continue;
    }
    if (task.shardIndex !== planned.shardIndex ||
        task.behaviorSignatureHash !== planned.behaviorSignatureHash) {
      issues.push("batch_checkpoint_task_identity_mismatch");
    }
    if (task.searchProgress !== null && task.searchProgress !== undefined) {
      const progressAudit = auditTaskCandidateProgress(task, plan);
      if (!progressAudit.ok) {
        issues.push(...progressAudit.issues);
      }
    }
    if (!allowedStatuses.has(task.status)) {
      issues.push("batch_checkpoint_task_status_invalid");
      continue;
    }
    if (task.status === "queued" && (task.lease !== null || task.result !== null)) {
      issues.push("batch_checkpoint_queued_task_state_invalid");
    }
    if (task.status === "leased") {
      if (!task.lease?.workerId || !task.lease?.leaseKey ||
          numeric(task.lease?.expiresAtMs) <= numeric(task.lease?.acquiredAtMs) ||
          task.result !== null) {
        issues.push("batch_checkpoint_leased_task_state_invalid");
      }
    }
    if (task.status === "completed") {
      const result = task.result || {};
      const { resultHash, ...resultCore } = result;
      if (task.lease !== null || !resultHash ||
          stableGraphHash(resultCore) !== resultHash ||
          result.taskKey !== task.taskKey ||
          result.representativeSubcellKey !== task.representativeSubcellKey ||
          !allowedDispositions.has(result.disposition) ||
          result.disposition === "budget_deferred" ||
          result.hostReceiptHash !== warmachineHost.receipt.receiptHash ||
          result.constructionHostReceiptHash !==
            warmachineConstructionHost.receipt.receiptHash) {
        issues.push("batch_checkpoint_completed_task_result_invalid");
      }
    }
  }
  if (checkpointKeys.size !== planTasks.size) issues.push("batch_checkpoint_task_count_mismatch");
  if (stableGraphHash(checkpoint.counts || {}) !==
      stableGraphHash(checkpointCounts(checkpoint.tasks || []))) {
    issues.push("batch_checkpoint_counts_invalid");
  }
  return stableGraphValue({
    ok: issues.length === 0,
    issues: [...new Set(issues)].sort(),
    checkpointHash: String(checkpoint.checkpointHash || ""),
    planHash: String(planHash || ""),
  });
}

export function acquireWarmachineMatchupTerminalRootBatchLeaseV1(
  checkpoint = {},
  plan = {},
  raw = {},
) {
  const audit = auditWarmachineMatchupTerminalRootBatchCheckpointV1(checkpoint, plan);
  if (!audit.ok) throw new Error(`matchup_terminal_batch_checkpoint_invalid:${
    audit.issues.join(",")}`);
  const workerId = String(raw.workerId || "");
  if (!workerId) throw new Error("matchup_terminal_batch_worker_id_required");
  const nowMs = numeric(raw.nowMs);
  const leaseDurationMs = Math.max(1, Math.floor(numeric(raw.leaseDurationMs, 60_000)));
  const maximumTasks = Math.max(1, Math.floor(numeric(raw.maximumTasks, 1)));
  const allowedShards = new Set((raw.shardIndexes ||
    Array.from({ length: plan.shardCount }, (_, index) => index)).map(Number));
  const requestedTaskKeys = raw.taskKeys === undefined
    ? null
    : new Set((raw.taskKeys || []).map(String));
  const plannedTaskKeys = new Set((plan.selectedTasks || []).map((task) =>
    String(task.taskKey || "")));
  if (requestedTaskKeys && ([...requestedTaskKeys].some((taskKey) =>
    !taskKey || !plannedTaskKeys.has(taskKey)))) {
    throw new Error("matchup_terminal_batch_requested_task_keys_invalid");
  }
  let takeoverCount = 0;
  const tasks = structuredClone(checkpoint.tasks || []).map((task) => {
    if (task.status === "leased" && numeric(task.lease?.expiresAtMs) <= nowMs) {
      takeoverCount += 1;
      return {
        ...task,
        status: "queued",
        lease: null,
        takeoverCount: numeric(task.takeoverCount) + 1,
      };
    }
    return task;
  });
  const acquiredTaskKeys = [];
  for (const task of tasks) {
    if (acquiredTaskKeys.length >= maximumTasks) break;
    if (task.status !== "queued" || !allowedShards.has(task.shardIndex)) continue;
    if (requestedTaskKeys && !requestedTaskKeys.has(task.taskKey)) continue;
    task.status = "leased";
    task.lease = {
      workerId,
      acquiredAtMs: nowMs,
      expiresAtMs: nowMs + leaseDurationMs,
      leaseKey: `matchup-terminal-lease-${stableGraphHash({
        taskKey: task.taskKey,
        workerId,
        nowMs,
        checkpointHash: checkpoint.checkpointHash,
      }).slice(0, 24)}`,
    };
    acquiredTaskKeys.push(task.taskKey);
  }
  return {
    checkpoint: sealCheckpoint({
      ...checkpoint,
      revision: numeric(checkpoint.revision) + 1,
      updatedAtMs: nowMs,
      staleLeaseTakeoverCount:
        numeric(checkpoint.staleLeaseTakeoverCount) + takeoverCount,
      tasks,
    }),
    acquiredTaskKeys,
    staleLeaseTakeoverCount: takeoverCount,
  };
}

export function recordWarmachineMatchupTerminalRootBatchCandidateProgressV1(
  checkpoint = {},
  plan = {},
  raw = {},
) {
  const audit = auditWarmachineMatchupTerminalRootBatchCheckpointV1(checkpoint, plan);
  if (!audit.ok) throw new Error(`matchup_terminal_batch_checkpoint_invalid:${
    audit.issues.join(",")}`);
  const workerId = String(raw.workerId || "");
  if (!workerId) throw new Error("matchup_terminal_batch_worker_id_required");
  const updates = raw.progressUpdates || [];
  const updateByTaskKey = new Map(updates.map((update) => [
    String(update.taskKey || ""),
    update,
  ]));
  if (updateByTaskKey.size !== updates.length || updateByTaskKey.has("")) {
    throw new Error("matchup_terminal_batch_candidate_progress_keys_invalid");
  }
  const nowMs = numeric(raw.nowMs);
  const tasks = structuredClone(checkpoint.tasks || []);
  for (const task of tasks) {
    const update = updateByTaskKey.get(task.taskKey);
    if (!update) continue;
    if (task.status !== "leased" || task.lease?.workerId !== workerId ||
        numeric(task.lease?.expiresAtMs) <= nowMs) {
      throw new Error(`matchup_terminal_batch_candidate_progress_lease_mismatch:${
        task.taskKey}`);
    }
    const candidatePlan = update.candidatePlan || {};
    const progress = update.progress || {};
    const progressAudit = auditWarmachineMatchupTerminalCandidateProgressV1(
      progress,
      candidatePlan,
    );
    if (!progressAudit.ok || candidatePlan.taskKey !== task.taskKey ||
        candidatePlan.behaviorSignatureHash !== task.behaviorSignatureHash ||
        candidatePlan.terminalTaskExecutionContractVersion !==
          plan.terminalTaskExecutionContractVersion ||
        candidatePlan.hostReceiptHash !== warmachineHost.receipt.receiptHash ||
        candidatePlan.constructionHostReceiptHash !==
          warmachineConstructionHost.receipt.receiptHash) {
      throw new Error(`matchup_terminal_batch_candidate_progress_invalid:${
        task.taskKey}:${progressAudit.issues.join(",")}`);
    }
    task.status = "queued";
    task.lease = null;
    task.result = null;
    task.searchProgress = stableGraphValue({
      candidatePlan,
      progress,
      updatedByWorkerId: workerId,
      updatedAtMs: nowMs,
    });
  }
  for (const taskKey of updateByTaskKey.keys()) {
    if (!tasks.some((task) => task.taskKey === taskKey)) {
      throw new Error(`matchup_terminal_batch_candidate_progress_unknown_task:${taskKey}`);
    }
  }
  return sealCheckpoint({
    ...checkpoint,
    revision: numeric(checkpoint.revision) + 1,
    updatedAtMs: nowMs,
    tasks,
  });
}

export function recordWarmachineMatchupTerminalRootBatchResultsV1(
  checkpoint = {},
  plan = {},
  raw = {},
) {
  const audit = auditWarmachineMatchupTerminalRootBatchCheckpointV1(checkpoint, plan);
  if (!audit.ok) throw new Error(`matchup_terminal_batch_checkpoint_invalid:${
    audit.issues.join(",")}`);
  const workerId = String(raw.workerId || "");
  if (!workerId) throw new Error("matchup_terminal_batch_worker_id_required");
  const resultRows = raw.results || [];
  const resultByTaskKey = new Map(resultRows.map((result) => [
    String(result.taskKey || ""),
    result,
  ]));
  if (resultByTaskKey.size !== resultRows.length || resultByTaskKey.has("")) {
    throw new Error("matchup_terminal_batch_result_keys_invalid");
  }
  const allowed = new Set(WARMACHINE_MATCHUP_TERMINAL_ROOT_DISPOSITIONS_V1);
  const tasks = structuredClone(checkpoint.tasks || []);
  const nowMs = numeric(raw.nowMs);
  for (const task of tasks) {
    const result = resultByTaskKey.get(task.taskKey);
    if (!result) continue;
    if (task.status !== "leased" || task.lease?.workerId !== workerId) {
      throw new Error(`matchup_terminal_batch_result_lease_mismatch:${task.taskKey}`);
    }
    if (numeric(task.lease?.expiresAtMs) <= nowMs) {
      throw new Error(`matchup_terminal_batch_result_lease_expired:${task.taskKey}`);
    }
    if (!allowed.has(result.disposition) || result.disposition === "budget_deferred") {
      throw new Error(`matchup_terminal_batch_result_disposition_invalid:${
        result.disposition}`);
    }
    if (String(result.hostReceiptHash || "") !== warmachineHost.receipt.receiptHash) {
      throw new Error(`matchup_terminal_batch_result_host_receipt_drift:${task.taskKey}`);
    }
    if (String(result.constructionHostReceiptHash || "") !==
        warmachineConstructionHost.receipt.receiptHash) {
      throw new Error(
        `matchup_terminal_batch_result_construction_host_receipt_drift:${task.taskKey}`,
      );
    }
    const publicResult = stableGraphValue({
      taskKey: task.taskKey,
      disposition: result.disposition,
      reason: String(result.reason || ""),
      authority: String(result.authority || ""),
      reportHash: String(result.reportHash || ""),
      hostReceiptHash: result.hostReceiptHash,
      constructionHostReceiptHash: result.constructionHostReceiptHash,
      representativeSubcellKey: task.representativeSubcellKey,
      completedByWorkerId: workerId,
      completedAtMs: nowMs,
    });
    task.status = "completed";
    task.result = { ...publicResult, resultHash: stableGraphHash(publicResult) };
    task.lease = null;
  }
  for (const taskKey of resultByTaskKey.keys()) {
    if (!tasks.some((task) => task.taskKey === taskKey)) {
      throw new Error(`matchup_terminal_batch_result_unknown_task:${taskKey}`);
    }
  }
  return sealCheckpoint({
    ...checkpoint,
    revision: numeric(checkpoint.revision) + 1,
    updatedAtMs: nowMs,
    tasks,
  });
}

export function refreshWarmachineMatchupTerminalRootBatchPinnedResultsV1(
  checkpoint = {},
  plan = {},
  raw = {},
) {
  const audit = auditWarmachineMatchupTerminalRootBatchCheckpointV1(checkpoint, plan);
  if (!audit.ok) throw new Error(`matchup_terminal_batch_checkpoint_invalid:${
    audit.issues.join(",")}`);
  const rows = raw.results || [];
  const resultByTaskKey = new Map(rows.map((result) => [
    String(result.taskKey || ""),
    result,
  ]));
  if (resultByTaskKey.size !== rows.length || resultByTaskKey.has("")) {
    throw new Error("matchup_terminal_batch_pinned_refresh_keys_invalid");
  }
  const planTaskByKey = new Map((plan.selectedTasks || []).map((task) => [
    task.taskKey,
    task,
  ]));
  const tasks = structuredClone(checkpoint.tasks || []);
  let refreshedTaskCount = 0;
  for (const [taskKey, result] of resultByTaskKey.entries()) {
    const planned = planTaskByKey.get(taskKey);
    const task = tasks.find((row) => row.taskKey === taskKey);
    if (!planned || planned.selectionSource !== "pinned_strict_seed") {
      throw new Error(`matchup_terminal_batch_pinned_refresh_task_invalid:${taskKey}`);
    }
    if (!task || task.status !== "completed" || task.lease !== null) {
      throw new Error(`matchup_terminal_batch_pinned_refresh_task_incomplete:${taskKey}`);
    }
    if (result.disposition !== "strict_materialized" ||
        String(result.hostReceiptHash || "") !== warmachineHost.receipt.receiptHash ||
        String(result.constructionHostReceiptHash || "") !==
          warmachineConstructionHost.receipt.receiptHash ||
        !String(result.reportHash || "")) {
      throw new Error(`matchup_terminal_batch_pinned_refresh_result_invalid:${taskKey}`);
    }
    if (task.result?.reportHash === result.reportHash) continue;
    const publicResult = stableGraphValue({
      taskKey,
      disposition: "strict_materialized",
      reason: String(result.reason || "refreshed_task_roster_terminal_root"),
      authority: String(result.authority || "rules_v1_host"),
      reportHash: String(result.reportHash),
      hostReceiptHash: result.hostReceiptHash,
      constructionHostReceiptHash: result.constructionHostReceiptHash,
      representativeSubcellKey: task.representativeSubcellKey,
      completedByWorkerId: String(raw.workerId || "strict-seed-reconcile"),
      completedAtMs: numeric(raw.nowMs),
    });
    task.result = { ...publicResult, resultHash: stableGraphHash(publicResult) };
    refreshedTaskCount += 1;
  }
  if (refreshedTaskCount === 0) {
    return { checkpoint, refreshedTaskCount };
  }
  return {
    checkpoint: sealCheckpoint({
      ...checkpoint,
      revision: numeric(checkpoint.revision) + 1,
      updatedAtMs: numeric(raw.nowMs),
      tasks,
    }),
    refreshedTaskCount,
  };
}

export function summarizeWarmachineMatchupTerminalRootBatchV1(
  checkpoint = {},
  plan = {},
) {
  const audit = auditWarmachineMatchupTerminalRootBatchCheckpointV1(checkpoint, plan);
  const completed = (checkpoint.tasks || []).filter((task) => task.status === "completed");
  const incomplete = (checkpoint.tasks || []).filter((task) => task.status !== "completed");
  const completedRepresentativeKeys = [...new Set(completed.map((task) =>
    task.representativeSubcellKey))];
  const incompleteRepresentativeKeys = [...new Set(incomplete.map((task) =>
    task.representativeSubcellKey).filter((key) =>
    !completedRepresentativeKeys.includes(key)))];
  const resultCounts = dispositionCounts(completed);
  const strictTaskKeys = completed.filter((task) =>
    task.result?.disposition === "strict_materialized").map((task) => task.taskKey);
  const core = stableGraphValue({
    schemaVersion: "warmachine_matchup_terminal_root_batch_summary_v1",
    planHash: plan.planHash,
    checkpointHash: checkpoint.checkpointHash,
    checkpointAudit: audit,
    selectedTaskCount: plan.selectedTaskCount,
    completedTaskCount: completed.length,
    incompleteTaskCount: incomplete.length,
    resultDispositionCounts: resultCounts,
    strictTaskKeys,
    taskSpecificStrictRootCount: strictTaskKeys.length,
    genericCapabilityPinsCountAsTaskRoots: false,
    representativeDispositionMass: {
      completed: completedRepresentativeKeys.length,
      selectedIncomplete: incompleteRepresentativeKeys.length,
      budgetDeferred: plan.representativeDispositionMass?.budget_deferred || 0,
    },
    candidateDispositionMass: {
      completed: String(completed.length),
      selectedIncomplete: String(incomplete.length),
      budgetDeferred: plan.candidateDispositionMass?.budget_deferred || "0",
    },
    allSelectedTasksComplete: incomplete.length === 0,
    deploymentToTerminalReachabilityProven: false,
    gameValueInterval: { lowerBound: 0, upperBound: 1 },
    naturalWinRate: null,
    trainingTruth: false,
  });
  return { ...core, summaryHash: stableGraphHash(core) };
}
