import {
  buildWarmachineBenchmarkMaximumStrictRollOutcomeV2,
  executeWarmachineBenchmarkActivationV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachinePieceInPlayV1 } from "../reverse/piece-lifecycle-v1.mjs";
import {
  warmachineSteamrollerTerminalScenarioSubcellKeyV1,
} from "../reverse/steamroller-terminal-scenario-corpus-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../reverse/terminal-event-predecessor-v1.mjs";
import {
  WARMACHINE_RULES_V1_RUNTIME_WINDOW_FIELDS,
  warmachineConstructionHost,
} from "../warmachine-construction-host-runtime.mjs";
import {
  setWarmachineNativeResourcesForTerminalSeedV1,
} from "./two-fronts-score-terminal-seed-v1.mjs";
import {
  advanceWarmachineMatchupTerminalCandidateProgressV1,
  buildWarmachineMatchupTerminalCandidateChunkPlanV1,
  buildWarmachineMatchupTerminalCandidateProgressV1,
} from "./matchup-terminal-candidate-chunk-v1.mjs";
import {
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  auditRulesV1SteamrollerScenarioTerrainSetup,
  closestPointDistanceIn,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  steamroller2026ScenarioProfiles,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";

export const WARMACHINE_MATCHUP_ASSASSINATION_TERMINAL_TASK_MATERIALIZER_V1_SCHEMA =
  "warmachine_matchup_assassination_terminal_task_materializer_v1";

const GOAL_FAMILY = "assassination";
const TERMINAL_CLASS = "unique_leader_assassination";
const ACTION_CATEGORY = "active_attack_or_effect";
const SIDE_KEY_BY_TASK_SIDE = Object.freeze({
  subject: "player1",
  challenger: "player2",
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function taskSideForCanonicalSide(sideKey = "", permutationKey = "identity") {
  const base = sideKey === "player1" ? "subject" :
    sideKey === "player2" ? "challenger" : "";
  if (!base || permutationKey === "identity") return base;
  return base === "subject" ? "challenger" : "subject";
}

function taskTerminal(task = {}) {
  const canonical = task.representative?.canonicalTerminal || {};
  const sideBinding = task.executionEnvelope?.sideBinding || {};
  const terminal = {
    causalActionFamily: String(canonical.causalActionFamily || ""),
    resultKind: String(canonical.resultKind || ""),
  };
  for (const role of ["attacker", "defender", "ending", "winner", "loser"]) {
    const canonicalSideKey = String(canonical[`${role}SideKey`] || "");
    const taskSideKey = String(sideBinding[`${role}TaskSideKey`] || "");
    const expectedTaskSideKey = taskSideForCanonicalSide(
      canonicalSideKey,
      task.sidePermutationKey,
    );
    if (!expectedTaskSideKey || taskSideKey !== expectedTaskSideKey ||
        !SIDE_KEY_BY_TASK_SIDE[taskSideKey]) {
      throw new Error(`assassination_terminal_task_${role}_side_binding_mismatch`);
    }
    terminal[`${role}SideKey`] = SIDE_KEY_BY_TASK_SIDE[taskSideKey];
    terminal[`${role}TaskSideKey`] = taskSideKey;
  }
  return stableGraphValue(terminal);
}

function taskIdentity(task = {}) {
  return stableGraphValue({
    groupKey: task.groupKey,
    groupPlanHash: task.groupPlanHash,
    variantIndex: String(task.variantIndex || ""),
    representative: task.representative,
    subjectRosterKey: task.subjectRosterKey,
    challengerRosterKey: task.challengerRosterKey,
    mapKey: task.mapKey,
    deploymentSeedKey: task.deploymentSeedKey,
    firstPlayerTaskSideKey: task.firstPlayerTaskSideKey,
    sidePermutationKey: task.sidePermutationKey,
  });
}

function validateTaskReceipts(task = {}) {
  const envelope = task.executionEnvelope || {};
  const envelopeCore = { ...envelope };
  const envelopeHash = String(envelopeCore.executionEnvelopeHash || "");
  delete envelopeCore.executionEnvelopeHash;
  if (!envelopeHash || stableGraphHash(envelopeCore) !== envelopeHash) {
    throw new Error("assassination_terminal_task_execution_envelope_hash_invalid");
  }
  const identity = taskIdentity(task);
  if (task.taskKey !==
      `matchup-terminal-task-${stableGraphHash(identity).slice(0, 32)}`) {
    throw new Error("assassination_terminal_task_identity_hash_invalid");
  }
  const behaviorSignature = stableGraphValue({
    ...identity,
    exactRepresentativeCoordinates: task.representative?.coordinates,
    executionEnvelopeHash: envelopeHash,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash:
      warmachineConstructionHost.receipt.receiptHash,
  });
  if (stableGraphHash(behaviorSignature) !== task.behaviorSignatureHash) {
    throw new Error(
      "assassination_terminal_task_host_or_construction_receipt_drift",
    );
  }
  const terminal = taskTerminal(task);
  const actorTaskSideKey = String(
    task.executionEnvelope?.actorAxis?.taskSideKey || "",
  );
  if (terminal.endingSideKey !== terminal.winnerSideKey ||
      terminal.causalActionFamily !== ACTION_CATEGORY ||
      terminal.resultKind !== "win") {
    throw new Error("assassination_terminal_task_terminal_contract_invalid");
  }
  return stableGraphValue({
    ...terminal,
    actorTaskSideKey,
    actorMatchesWinner: actorTaskSideKey === terminal.winnerTaskSideKey,
  });
}

function validateEvidenceCorpus(evidenceCorpus = {}, representative = {}) {
  const cacheCore = { ...evidenceCorpus };
  const cacheHash = String(cacheCore.cacheHash || "");
  delete cacheCore.cacheHash;
  if (!cacheHash || stableGraphHash(cacheCore) !== cacheHash) {
    throw new Error("assassination_terminal_task_evidence_cache_hash_invalid");
  }
  if (evidenceCorpus.hostReceiptHash !== warmachineHost.receipt.receiptHash ||
      evidenceCorpus.corpus?.hostReceiptHash !==
        warmachineHost.receipt.receiptHash) {
    throw new Error("assassination_terminal_task_evidence_host_receipt_drift");
  }
  if (evidenceCorpus.evidenceCorpus?.corpusHash !==
      evidenceCorpus.corpus?.corpusHash ||
      evidenceCorpus.evidenceCorpus?.representativeSelectionHash !==
        evidenceCorpus.representativeSelection?.selectionHash) {
    throw new Error(
      "assassination_terminal_task_evidence_internal_binding_mismatch",
    );
  }
  const selected = (evidenceCorpus.representativeSelection
    ?.selectedRepresentatives || []).find((row) =>
    row.subcellKey === representative.subcellKey);
  if (!selected || selected.cellKey !== representative.cellKey ||
      selected.terminalClassKey !== representative.terminalClassKey ||
      selected.scenarioKey !== representative.scenarioKey ||
      Number(selected.representativeRoundNumber) !==
        Number(representative.roundNumber) ||
      stableGraphHash(selected.coordinates || {}) !==
        stableGraphHash(representative.coordinates || {}) ||
      stableGraphHash(selected.skeletonObligations || []) !==
        stableGraphHash(representative.skeletonObligations || [])) {
    throw new Error(
      "assassination_terminal_task_representative_selection_mismatch",
    );
  }
  const cell = (evidenceCorpus.corpus?.cells || []).find((row) =>
    row.cellKey === representative.cellKey);
  const canonical = representative.canonicalTerminal || {};
  if (!cell || cell.dependencyReceipt?.hostReceiptHash !==
      warmachineHost.receipt.receiptHash ||
      cell.terminalClassKey !== TERMINAL_CLASS ||
      cell.scenarioKey !== representative.scenarioKey ||
      cell.causalActionFamily !== ACTION_CATEGORY ||
      Number(cell.roundClass?.representativeRoundNumber) !==
        Number(representative.roundNumber) ||
      cell.sourceResolutionStatus !== representative.sourceResolutionStatus ||
      cell.resultKind !== canonical.resultKind ||
      cell.attackerSideKey !== canonical.attackerSideKey ||
      cell.defenderSideKey !== canonical.defenderSideKey ||
      cell.endingSideKey !== canonical.endingSideKey ||
      cell.winnerSideKey !== canonical.winnerSideKey ||
      cell.loserSideKey !== canonical.loserSideKey) {
    throw new Error("assassination_terminal_task_corpus_cell_mismatch");
  }
  for (const [partitionKey, value] of Object.entries(
    representative.coordinates || {},
  )) {
    if (!cell.partitions?.[partitionKey]?.includes(value)) {
      throw new Error(
        `assassination_terminal_task_partition_outside_cell:${partitionKey}:${value}`,
      );
    }
  }
  return { cell, selected };
}

function validateOpening(task = {}, opening = {}, terminal = {}) {
  const representative = task.representative || {};
  const envelope = task.executionEnvelope || {};
  const expectedFirstSideKey = SIDE_KEY_BY_TASK_SIDE[
    task.firstPlayerTaskSideKey
  ];
  if (opening.disposition !== "strict_opening_materialized" ||
      !opening.state || !Array.isArray(opening.state.pieces) ||
      !opening.strictDeploymentReceiptHash || !opening.scenarioBindingHash ||
      !opening.exactMapTemplateHash ||
      opening.subjectRosterKey !== envelope.sourceRosterKeys?.subject ||
      opening.challengerRosterKey !== envelope.sourceRosterKeys?.challenger ||
      opening.scenarioKey !== representative.scenarioKey ||
      opening.mapKey !== task.mapKey ||
      opening.deploymentSeedKey !== task.deploymentSeedKey ||
      opening.firstPlayerTaskSideKey !== task.firstPlayerTaskSideKey ||
      opening.scenarioTerrainSetupClassKey !==
        representative.coordinates?.scenarioTerrainSetup ||
      opening.state.scenario?.scenarioKey !== representative.scenarioKey ||
      opening.state.firstPlayerSideKey !== expectedFirstSideKey ||
      opening.state.firstPlayerSideKey !== terminal.attackerSideKey ||
      opening.state.scenario?.attackerSideKey !== terminal.attackerSideKey ||
      opening.state.scenario?.defenderSideKey !== terminal.defenderSideKey ||
      opening.state.deploymentComplete !== true ||
      opening.state.strictMode !== true ||
      Number(opening.modelCount) !== opening.state.pieces.length ||
      stableGraphHash(opening.state) !== opening.strictOpeningStateHash) {
    throw new Error("assassination_terminal_task_opening_binding_mismatch");
  }
  if (!(opening.state.pieces || []).some((piece) => piece.sideKey === "player1") ||
      !(opening.state.pieces || []).some((piece) => piece.sideKey === "player2")) {
    throw new Error("assassination_terminal_task_opening_two_rosters_required");
  }
}

function validatePlanAndGroup(task = {}, groupPlan = {}, plan = {}) {
  const planned = (plan.selectedTasks || []).find((row) =>
    row.taskKey === task.taskKey);
  if (!planned || stableGraphHash(planned) !== stableGraphHash(task) ||
      groupPlan.groupKey !== task.groupKey ||
      groupPlan.groupPlanHash !== task.groupPlanHash ||
      groupPlan.goalFamily !== GOAL_FAMILY ||
      !groupPlan.representativeKeys?.includes(task.representative?.subcellKey) ||
      !groupPlan.axes?.subjectRosterKeys?.includes(task.subjectRosterKey) ||
      !groupPlan.axes?.challengerRosterKeys?.includes(task.challengerRosterKey)) {
    throw new Error("assassination_terminal_task_plan_or_routing_binding_mismatch");
  }
}

function resourceModeForCoordinates(coordinates = {}) {
  return ["zero_available", "maximum_native_resource"].includes(
    coordinates.resource,
  ) ? coordinates.resource : "";
}

function commonSupportedCoordinates(representative = {}) {
  const coordinates = representative.coordinates || {};
  return representative.terminalClassKey === TERMINAL_CLASS &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.causalActionFamily === ACTION_CATEGORY &&
    representative.canonicalTerminal?.resultKind === "win" &&
    coordinates.actionRange === "strictly_inside" &&
    coordinates.baseTopology === "legal_separated" &&
    coordinates.damage === "critical_models_undamaged" &&
    coordinates.leaderControl === "strictly_inside" &&
    coordinates.lineOfSight === "clear";
}

function preferredIncompatibleCoordinates(representative = {}) {
  const coordinates = representative.coordinates || {};
  return commonSupportedCoordinates(representative) &&
    representative.scenarioKey === "payload" &&
    Number(representative.roundNumber) === 5 &&
    coordinates.lifecycle === "both_rosters_complete" &&
    coordinates.payloadLifecycle === "both_payloads_active" &&
    coordinates.payloadMoveDecision === "eligible_move_declined" &&
    coordinates.madeToHaulDecision === "eligible_cohort_with_clear_path" &&
    coordinates.scenarioTerrainSetup ===
      "all_flags_fallback_no_valid_terrain";
}

function fallbackMaterializableCoordinates(representative = {}) {
  const coordinates = representative.coordinates || {};
  return commonSupportedCoordinates(representative) &&
    Boolean(resourceModeForCoordinates(coordinates)) &&
    ["both_sides_prior_losses", "both_rosters_complete"].includes(
      coordinates.lifecycle,
    );
}

function movementPredecessorMaterializableCoordinates(representative = {}) {
  const coordinates = representative.coordinates || {};
  return representative.terminalClassKey === TERMINAL_CLASS &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.causalActionFamily === ACTION_CATEGORY &&
    representative.canonicalTerminal?.resultKind === "win" &&
    coordinates.actionRange ===
      "outside_direct_action_range_requires_prior_movement" &&
    coordinates.baseTopology === "legal_separated" &&
    coordinates.damage === "critical_models_undamaged" &&
    coordinates.leaderControl === "strictly_inside" &&
    coordinates.lineOfSight === "clear" &&
    coordinates.resource === "zero_available" &&
    coordinates.lifecycle === "both_rosters_complete" &&
    !coordinates.trenchCacheLifecycle &&
    !coordinates.payloadLifecycle &&
    !coordinates.highStakesCountdownState;
}

function movementCandidateChunkForTask(task = {}, candidates = [], plan = {},
  rawCandidateProgress = null) {
  const representative = task.representative || {};
  const actionRange = String(representative.coordinates?.actionRange || "");
  const slots = candidates.flatMap((candidate) => Array.from(
    { length: 8 * 32 },
    (_ignored, slotIndex) => stableGraphValue({
      actorPieceKey: candidate.pieceKey,
      anchorIndex: Math.floor(slotIndex / 32),
      angleIndex: slotIndex % 32,
      attackProfileKey: "strict_advance_then_melee",
      actionRange,
    }),
  ));
  const candidatePlan = rawCandidateProgress?.candidatePlan ||
    buildWarmachineMatchupTerminalCandidateChunkPlanV1({
      taskKey: task.taskKey,
      behaviorSignatureHash: task.behaviorSignatureHash,
      terminalTaskExecutionContractVersion:
        plan.terminalTaskExecutionContractVersion,
      candidateEnumerationVersion:
        "assassination_advance_then_melee_geometry_slots_v1",
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      constructionHostReceiptHash: warmachineConstructionHost.receipt.receiptHash,
      slots,
    });
  const progress = rawCandidateProgress?.progress ||
    buildWarmachineMatchupTerminalCandidateProgressV1({
      candidatePlan,
      updatedAtMs: Date.now(),
    });
  const slot = candidatePlan.slots?.[progress.nextSlotIndex] || null;
  return stableGraphValue({ candidatePlan, progress, slot });
}

function directLineOfSightBlockedCoordinates(representative = {}) {
  const coordinates = representative.coordinates || {};
  const canonical = representative.canonicalTerminal || {};
  return representative.terminalClassKey === TERMINAL_CLASS &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    canonical.causalActionFamily === ACTION_CATEGORY &&
    canonical.resultKind === "win" &&
    coordinates.actionRange === "strictly_inside" &&
    coordinates.baseTopology === "legal_separated" &&
    coordinates.damage === "critical_models_undamaged" &&
    coordinates.leaderControl === "strictly_inside" &&
    coordinates.resource === "zero_available" &&
    coordinates.lifecycle === "both_rosters_complete" &&
    ["model_blocked", "terrain_blocked", "stealth_blocks_beyond_five"].includes(
      coordinates.lineOfSight,
    ) &&
    ["pressure_point", "fault_line", "two_fronts", "trench_warfare"].includes(
      representative.scenarioKey,
    );
}

function directLineOfSightBlockedEvidence(representative = {}, mappingAudit = {}) {
  const coordinates = representative.coordinates || {};
  return stableGraphValue({
    scenarioKey: representative.scenarioKey,
    roundNumber: Number(representative.roundNumber),
    lineOfSight: coordinates.lineOfSight,
    requiredDirectActionEvidence: {
      actionType: "melee_attack",
      hasClearLine: true,
      blockedLineCount: 0,
      legalityCode: "STRICT_MELEE_LOS_BASE_TO_BASE_CLEAR_V20260815",
    },
    directActionCandidateNotMaterialized: true,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    representativeMappingAudit: mappingAudit,
  });
}

function mappedHostRepresentative(task = {}, terminal = {}, evidenceCorpus = {}) {
  const representative = task.representative || {};
  const hostCell = (evidenceCorpus.corpus?.cells || []).find((cell) =>
    cell.scenarioKey === representative.scenarioKey &&
    cell.terminalClassKey === TERMINAL_CLASS &&
    cell.causalActionFamily === ACTION_CATEGORY &&
    cell.resultKind === terminal.resultKind &&
    cell.attackerSideKey === terminal.attackerSideKey &&
    cell.defenderSideKey === terminal.defenderSideKey &&
    cell.endingSideKey === terminal.endingSideKey &&
    cell.winnerSideKey === terminal.winnerSideKey &&
    cell.loserSideKey === terminal.loserSideKey &&
    cell.roundClass?.exactRoundNumber === true &&
    Number(cell.roundClass?.representativeRoundNumber) ===
      Number(representative.roundNumber));
  if (!hostCell) return null;
  const subcellKey = warmachineSteamrollerTerminalScenarioSubcellKeyV1(
    hostCell,
    representative.coordinates,
  );
  return stableGraphValue({
    ...representative,
    cellKey: hostCell.cellKey,
    subcellKey,
    representativeRoundNumber: Number(representative.roundNumber),
    canonicalTerminal: {
      attackerSideKey: terminal.attackerSideKey,
      causalActionFamily: terminal.causalActionFamily,
      defenderSideKey: terminal.defenderSideKey,
      endingSideKey: terminal.endingSideKey,
      loserSideKey: terminal.loserSideKey,
      resultKind: terminal.resultKind,
      winnerSideKey: terminal.winnerSideKey,
    },
  });
}

function representativeMappingAudit(task = {}, terminal = {},
  hostRepresentative = {}, sourceCell = {}) {
  const representative = task.representative || {};
  const core = stableGraphValue({
    taskRepresentativeCellKey: String(representative.cellKey || ""),
    taskRepresentativeSubcellKey: String(representative.subcellKey || ""),
    hostRepresentativeCellKey: String(hostRepresentative.cellKey || ""),
    hostRepresentativeSubcellKey: String(hostRepresentative.subcellKey || ""),
    sidePermutationKey: String(task.sidePermutationKey || ""),
    roleMapping: terminal,
    taskPartitionCoordinatesHash: stableGraphHash(
      representative.coordinates || {},
    ),
    hostPartitionCoordinatesHash: stableGraphHash(
      hostRepresentative.coordinates || {},
    ),
    sourceTaskCellHash: stableGraphHash(sourceCell),
    exactPartitionMappingProven:
      stableGraphHash(representative.coordinates || {}) ===
        stableGraphHash(hostRepresentative.coordinates || {}) &&
      Boolean(hostRepresentative.cellKey) &&
      Boolean(hostRepresentative.subcellKey),
  });
  return { ...core, mappingAuditHash: stableGraphHash(core) };
}

function sealedReport(task = {}, opening = {}, disposition = {}, detail = {}) {
  const core = stableGraphValue({
    schemaVersion:
      WARMACHINE_MATCHUP_ASSASSINATION_TERMINAL_TASK_MATERIALIZER_V1_SCHEMA,
    terminalRootKind: "assassination",
    terminalTaskKey: String(task.taskKey || ""),
    taskKey: String(task.taskKey || ""),
    groupKey: String(task.groupKey || ""),
    cellKey: String(task.representative?.cellKey || ""),
    representativeSubcellKey: String(task.representative?.subcellKey || ""),
    openingKey: String(opening.openingKey || ""),
    constructionOpeningKey: String(opening.constructionOpeningKey || ""),
    strictOpeningStateHash: String(opening.strictOpeningStateHash || ""),
    strictDeploymentReceiptHash: String(
      opening.strictDeploymentReceiptHash || "",
    ),
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash:
      warmachineConstructionHost.receipt.receiptHash,
    disposition: disposition.disposition,
    authority: disposition.authority,
    reason: disposition.reason,
    strictRulesConclusion: disposition.strictRulesConclusion === true,
    strictReplayCertified: detail.root?.strictReplayCertified === true,
    matchupTerminalRootProven:
      disposition.disposition === "strict_materialized" &&
      detail.root?.strictReplayCertified === true,
    genericCapabilityPinsCountAsTaskRoute: false,
    historicalReachabilityProven: false,
    deploymentToTerminalReachabilityProven: false,
    trainingTruth: false,
    ...detail,
    claimBoundary: disposition.claimBoundary ||
      "This artifact proves only one exact complete-roster later-round assassination transition under the current rules-v1 Host and its independent replay. It does not prove a route from deployment, opponent-response closure, natural probability, strategy value, win rate, exhaustive family coverage or training truth.",
  });
  return stableGraphValue({ ...core, reportHash: stableGraphHash(core) });
}

function inputInvalid(task, opening, reason, evidence = {}) {
  return {
    report: sealedReport(task, opening, {
      disposition: "input_invalid",
      authority: "input_contract",
      reason,
    }, { inputValidationEvidence: stableGraphValue(evidence) }),
    runtime: null,
  };
}

function proposalFiltered(task, opening, reason, evidence = {}) {
  return {
    report: sealedReport(task, opening, {
      disposition: "proposal_filtered",
      authority: "search_relation",
      reason,
      claimBoundary: "This exact task candidate contains a relation that the current Host contract cannot jointly realize, or its complete task roster exposes no legal lethal actor. The filter is task-local and is not a Host rejection or a family-level unreachability claim.",
    }, { candidateFilterEvidence: stableGraphValue(evidence) }),
    runtime: null,
  };
}

function leaderLike(piece = {}) {
  return piece.isWarcaster === true || piece.isWarlock === true ||
    piece.isLeader === true || /warcaster|warlock|leader/i.test(
      `${piece.modelRole || ""} ${piece.modelType || ""}`,
    );
}

function pieceCardId(piece = {}) {
  return String(piece.cardId || piece.cardSnapshot?.id ||
    piece.metadata?.cardId || "");
}

function profileKey(profile = {}) {
  return String(profile.profileKey || profile.weaponKey || profile.spellKey || "");
}

function pieceRadiusIn(piece = {}) {
  return numeric(
    piece.baseRadiusIn,
    numeric(piece.baseDiameterIn || piece.baseSizeIn, 1.2) / 2,
  );
}

function resourceValue(piece = {}) {
  return Math.max(0, numeric(
    piece.resourcePoints ?? piece.focusPoints ?? piece.furyPoints ??
    piece.focus ?? piece.fury ?? piece.resource2,
    0,
  ));
}

function resourceMaximum(piece = {}) {
  return Math.max(0, numeric(
    piece.resourceMax ?? piece.focusMax ?? piece.furyMax ?? piece.resource2Max,
    0,
  ));
}

function attackProfiles(piece = {}, mode = "") {
  const byKey = new Map();
  for (const profile of [
    ...(piece.attackProfiles || []),
    ...(piece.weaponProfiles || []),
  ]) {
    const key = profileKey(profile);
    if (!key || (mode && String(profile.mode || "").toLowerCase() !== mode)) {
      continue;
    }
    if (!byKey.has(key)) byKey.set(key, profile);
  }
  return [...byKey.values()];
}

function controllerForActor(state = {}, actor = {}) {
  const requestedKey = String(
    actor.battlegroupControllerPieceKey || actor.controllerPieceKey ||
    actor.metadata?.battlegroupControllerPieceKey ||
    actor.metadata?.controllerPieceKey || "",
  );
  return (state.pieces || []).find((piece) =>
    piece.pieceKey === requestedKey && warmachinePieceInPlayV1(piece)) ||
    (state.pieces || []).find((piece) =>
      piece.sideKey === actor.sideKey && leaderLike(piece) &&
      warmachinePieceInPlayV1(piece)) || null;
}

function actorCandidateScore(piece = {}) {
  const melee = attackProfiles(piece, "melee");
  const weightedPower = melee.reduce((sum, profile) => sum +
    numeric(profile.power ?? profile.pow ?? profile.pPlusS) *
      Math.max(1, numeric(profile.count, 1)), 0);
  return weightedPower * 100 +
    (attackProfiles(piece, "ranged").length ? 1_000 : 0) +
    (piece.isWarbeast || piece.isWarjack ? 500 : 0) +
    resourceMaximum(piece);
}

function actorCandidates(state = {}, task = {}, terminal = {}) {
  const allowedCardIds = new Set((task.executionEnvelope?.actorAxis?.candidates || [])
    .map((candidate) => String(candidate.cardId || "")).filter(Boolean));
  return (state.pieces || []).filter((piece) =>
    piece.sideKey === terminal.winnerSideKey &&
    warmachinePieceInPlayV1(piece) &&
    (!allowedCardIds.size || allowedCardIds.has(pieceCardId(piece))) &&
    attackProfiles(piece, "melee").length > 0)
    .sort((left, right) =>
      actorCandidateScore(right) - actorCandidateScore(left) ||
      String(left.pieceKey).localeCompare(String(right.pieceKey)));
}

function targetCandidates(state = {}, task = {}, terminal = {}) {
  const allowedCardIds = new Set((task.executionEnvelope?.targetAxis?.candidates || [])
    .map((candidate) => String(candidate.cardId || "")).filter(Boolean));
  return (state.pieces || []).filter((piece) =>
    piece.sideKey === terminal.loserSideKey && leaderLike(piece) &&
    warmachinePieceInPlayV1(piece) &&
    (!allowedCardIds.size || allowedCardIds.has(pieceCardId(piece))))
    .sort((left, right) => String(left.pieceKey).localeCompare(
      String(right.pieceKey),
    ));
}

function markPriorLoss(piece = {}) {
  piece.damage = { ...(piece.damage || {}), boxesRemaining: 0 };
  if ("boxesRemaining" in piece) piece.boxesRemaining = 0;
  piece.destroyed = true;
  piece.destroyedTriggerOccurred = true;
  piece.disabled = false;
  piece.boxed = false;
  piece.damageLifecycleStage = "destroyed";
  piece.removedFromPlay = false;
  piece.offTable = true;
  piece.notDeployed = true;
  piece.activated = false;
  piece.activationKey = "";
  piece.statusTags = [...new Set([
    ...(piece.statusTags || []),
    "destroyed",
    "off_table",
    "not_deployed",
  ])].sort();
}

function priorLossCandidates(state = {}, sideKey = "", protectedKeys = new Set()) {
  return (state.pieces || []).filter((piece) =>
    piece.sideKey === sideKey && !leaderLike(piece) &&
    warmachinePieceInPlayV1(piece) && !protectedKeys.has(piece.pieceKey))
    .sort((left, right) =>
      Number(Boolean(left.unitGroupId || left.unitId)) -
        Number(Boolean(right.unitGroupId || right.unitId)) ||
      Number(Boolean(left.isWarbeast || left.isWarjack)) -
        Number(Boolean(right.isWarbeast || right.isWarjack)) ||
      String(left.pieceKey).localeCompare(String(right.pieceKey)));
}

function authorPriorLosses(state = {}, protectedKeys = new Set()) {
  const priorLossPieceKeys = [];
  for (const sideKey of ["player1", "player2"]) {
    const candidate = priorLossCandidates(state, sideKey, protectedKeys)[0];
    if (!candidate) return null;
    markPriorLoss(candidate);
    priorLossPieceKeys.push(candidate.pieceKey);
  }
  return priorLossPieceKeys.sort();
}

function prepareBaseState(opening = {}, representative = {}, terminal = {}) {
  const state = structuredClone(opening.state);
  state.turnNumber = Number(representative.roundNumber);
  state.activeSideKey = terminal.winnerSideKey;
  state.phaseKey = "activation";
  state.activePieceKey = "";
  state.activeActivationPieceKey = "";
  state.outcome = null;
  state.terminal = null;
  state.strictMode = true;
  state.enforceStrictExecutor = true;
  state.metadata = {
    ...(state.metadata || {}),
    strictMode: true,
    enforceStrictExecutor: true,
    terminalTaskMaterializer: true,
  };
  for (const field of WARMACHINE_RULES_V1_RUNTIME_WINDOW_FIELDS) {
    state[field] = null;
  }
  const resourceMode = resourceModeForCoordinates(
    representative.coordinates || {},
  );
  if (!resourceMode) {
    throw new Error("assassination_terminal_resource_partition_not_materializable");
  }
  for (const piece of state.pieces || []) piece.activated = true;
  setWarmachineNativeResourcesForTerminalSeedV1(state, resourceMode);
  return state;
}

function strictMeleeLosClearEvidence(action = {}) {
  const checks = action.legality?.checks || [];
  const check = checks.find((row) =>
    row.code === "STRICT_MELEE_LOS_BASE_TO_BASE_CLEAR_V20260815" &&
    row.actionType === action.actionType &&
    row.actorPieceKey === action.actorPieceKey &&
    row.targetPieceKey === action.targetPieceKey &&
    row.attackProfileKey === profileKey(action.metadata?.attackProfile || {}) &&
    row.hasClearLine === true && Number(row.blockedLineCount || 0) === 0);
  if (!check) return null;
  return stableGraphValue({
    actionKey: action.actionKey,
    actionType: action.actionType,
    actorPieceKey: action.actorPieceKey,
    targetPieceKey: action.targetPieceKey,
    attackProfileKey: profileKey(action.metadata?.attackProfile || {}),
    legalityStatus: action.legality?.status,
    code: check.code,
    marker: check.marker,
    geometryModel: check.geometryModel,
    sampleLineCount: Number(check.sampleLineCount || 0),
    clearLineCount: Number(check.clearLineCount || 0),
    blockedLineCount: Number(check.blockedLineCount || 0),
    hasClearLine: check.hasClearLine === true,
    blockerKeys: check.blockerKeys || [],
  });
}

function authoredGeometryForActor(baseState = {}, actorKey = "", targetKey = "",
  actionRange = "strictly_inside", onProgress = () => {}, rawWindow = {}) {
  const sourceActor = (baseState.pieces || []).find((piece) =>
    piece.pieceKey === actorKey);
  const sourceTarget = (baseState.pieces || []).find((piece) =>
    piece.pieceKey === targetKey);
  if (!sourceActor || !sourceTarget) return null;
  const sourceController = controllerForActor(baseState, sourceActor);
  if (!sourceController) return null;
  const meleeRanges = attackProfiles(sourceActor, "melee")
    .map((profile) => numeric(profile.rangeIn ?? profile.range, 0))
    .filter((rangeIn) => rangeIn > 0);
  if (!meleeRanges.length) return null;
  const shortestMeleeRangeIn = Math.min(...meleeRanges);
  const requiresPriorMovement = actionRange ===
    "outside_direct_action_range_requires_prior_movement";
  const edgeGapIn = requiresPriorMovement
    ? shortestMeleeRangeIn + 0.25
    : Math.min(0.4, shortestMeleeRangeIn * 0.4);
  const anchors = [
    { xIn: 12, yIn: 12 }, { xIn: 18, yIn: 12 },
    { xIn: 24, yIn: 12 }, { xIn: 30, yIn: 12 },
    { xIn: 18, yIn: 18 }, { xIn: 24, yIn: 18 },
    { xIn: 30, yIn: 18 }, { xIn: 24, yIn: 24 },
  ];
  const totalGeometrySlotCount = anchors.length * 32;
  const slotStartIndex = Math.min(
    totalGeometrySlotCount,
    Math.max(0, Math.floor(numeric(rawWindow.slotStartIndex, 0))),
  );
  const maximumSlotCount = Math.max(1, Math.floor(numeric(
    rawWindow.maximumSlotCount,
    totalGeometrySlotCount,
  )));
  const slotEndExclusive = Math.min(
    totalGeometrySlotCount,
    slotStartIndex + maximumSlotCount,
  );
  for (let currentGeometrySlotIndex = slotStartIndex;
    currentGeometrySlotIndex < slotEndExclusive;
    currentGeometrySlotIndex += 1) {
    const anchorIndex = Math.floor(currentGeometrySlotIndex / 32);
    const angleIndex = currentGeometrySlotIndex % 32;
    const anchor = anchors[anchorIndex];
    onProgress({
      stage: "geometry_slot_start",
      actorPieceKey: actorKey,
      geometrySlotIndex: currentGeometrySlotIndex,
      anchorIndex,
      angleIndex,
      slotStartIndex,
      slotEndExclusive,
      totalGeometrySlotCount,
    });
    const state = structuredClone(baseState);
      const actor = state.pieces.find((piece) => piece.pieceKey === actorKey);
      const target = state.pieces.find((piece) => piece.pieceKey === targetKey);
      const controller = state.pieces.find((piece) =>
        piece.pieceKey === sourceController.pieceKey);
      const angle = angleIndex * Math.PI / 16;
      const actorCenterDistance = pieceRadiusIn(actor) +
        pieceRadiusIn(target) + edgeGapIn;
      target.position = structuredClone(anchor);
      actor.position = {
        xIn: anchor.xIn + Math.cos(angle) * actorCenterDistance,
        yIn: anchor.yIn + Math.sin(angle) * actorCenterDistance,
      };
      actor.activated = false;
      if (controller.pieceKey !== actor.pieceKey) {
        const controlRangeIn = numeric(controller.controlRangeIn, 0);
        if (controlRangeIn <= 0) continue;
        const controllerCenterDistance = Math.min(4, controlRangeIn * 0.4);
        const controllerAngle = angle + Math.PI / 2;
        controller.position = {
          xIn: target.position.xIn +
            Math.cos(controllerAngle) * controllerCenterDistance,
          yIn: target.position.yIn +
            Math.sin(controllerAngle) * controllerCenterDistance,
        };
      }
      const normalized = normalizeRulesV1State(state);
      const normalizedActor = normalized.pieces.find((piece) =>
        piece.pieceKey === actorKey);
      const normalizedTarget = normalized.pieces.find((piece) =>
        piece.pieceKey === targetKey);
      const normalizedController = normalized.pieces.find((piece) =>
        piece.pieceKey === controller.pieceKey);
      const placementAudit = auditRulesV1StaticPlacement(normalized);
      const formationAudit = auditRulesV1StaticUnitFormation(normalized);
      if (!placementAudit.ok || !formationAudit.ok) continue;
      const actorTargetEdgeDistanceIn = closestPointDistanceIn(
        normalizedActor,
        normalizedTarget,
      );
      const actorControllerEdgeDistanceIn = normalizedController.pieceKey ===
          normalizedActor.pieceKey
        ? 0
        : closestPointDistanceIn(normalizedActor, normalizedController);
      const actionRangeMatches = requiresPriorMovement
        ? actorTargetEdgeDistanceIn > shortestMeleeRangeIn
        : actorTargetEdgeDistanceIn > 0 &&
          actorTargetEdgeDistanceIn < shortestMeleeRangeIn;
      if (!actionRangeMatches || !(actorControllerEdgeDistanceIn <
            numeric(normalizedController.controlRangeIn, 0))) continue;
      const enumeration = enumerateRulesV1Actions(normalized, {
        actorPieceKeys: [actorKey],
        targetPieceKeys: [targetKey],
        actionFamilyKeys: ["attack_or_effect"],
        includeActorlessActions: false,
        includeUntargetedActions: false,
      });
      const directMelee = (enumeration.actions || []).filter((action) =>
        (requiresPriorMovement
          ? action.actionType === "advance_then_melee_attack"
          : action.actionType === "melee_attack") &&
        action.actorPieceKey === actorKey &&
        action.targetPieceKey === targetKey &&
        String(action.metadata?.attackProfile?.mode || "").toLowerCase() ===
          "melee")
        .sort((left, right) =>
          numeric(right.metadata?.attackProfile?.count, 1) -
            numeric(left.metadata?.attackProfile?.count, 1) ||
          numeric(right.metadata?.attackProfile?.power, 0) -
            numeric(left.metadata?.attackProfile?.power, 0) ||
          String(left.actionKey).localeCompare(String(right.actionKey)))[0];
      if (!directMelee) continue;
      const directMeleeLosEvidence = strictMeleeLosClearEvidence(directMelee);
      if (!directMeleeLosEvidence) continue;
      return {
        state: enumeration.state,
        actor: normalizedActor,
        target: normalizedTarget,
        controller: normalizedController,
        attackProfile: directMelee.metadata.attackProfile,
        firstAction: directMelee,
        placementAudit,
        formationAudit,
        losEvidence: directMeleeLosEvidence,
        geometry: stableGraphValue({
          actorPosition: normalizedActor.position,
          targetPosition: normalizedTarget.position,
          controllerPosition: normalizedController.position,
          actorTargetEdgeDistanceIn,
          actorMeleeRangeIn: numeric(
            directMelee.metadata?.attackProfile?.rangeIn,
            shortestMeleeRangeIn,
          ),
          actorControllerEdgeDistanceIn,
          controllerControlRangeIn: numeric(
            normalizedController.controlRangeIn,
            0,
          ),
          geometrySlotIndex: currentGeometrySlotIndex,
          anchorIndex,
          angleIndex,
        }),
      };
  }
  return null;
}

function activationGroupKeyForPiece(piece = {}) {
  return String(piece.unitGroupId || piece.unitId ||
    piece.metadata?.unitGroupId || piece.metadata?.unitId ||
    piece.pieceKey || "");
}

function executeLethalActivation(state = {}, actor = {}, target = {},
  attackProfile = {}, routeKey = "", onProgress = () => {},
  actionRange = "strictly_inside") {
  const attackProfileKey = profileKey(attackProfile);
  return executeWarmachineBenchmarkActivationV2(
    state,
    activationGroupKeyForPiece(actor),
    {
      routeKey,
      repeatIntent: true,
      enumerationScopeForStep: () => ({
        actorPieceKeys: [actor.pieceKey],
        targetPieceKeys: [target.pieceKey],
        includeActorlessActions: true,
        includeUntargetedActions: true,
        actionFamilyKeys: ["attack_or_effect", "timing", "resource"],
      }),
      intent: {
        preferAttack: true,
        targetPieceKey: target.pieceKey,
        requireTargetMatch: true,
        avoidFeat: true,
      },
      selectAction: ({ scoped }) => {
        const action = (scoped.enumeration.actions || []).filter((candidate) =>
          candidate.actorPieceKey === actor.pieceKey &&
          candidate.targetPieceKey === target.pieceKey &&
          (actionRange === "outside_direct_action_range_requires_prior_movement"
            ? candidate.actionType === "advance_then_melee_attack"
            : ["melee_attack", "purchased_additional_melee_attack"].includes(
              candidate.actionType,
            )) &&
          profileKey(candidate.metadata?.attackProfile || {}) ===
            attackProfileKey)
          .sort((left, right) =>
            Number(left.actionType === "purchased_additional_melee_attack") -
              Number(right.actionType ===
                "purchased_additional_melee_attack") ||
            String(left.actionKey).localeCompare(String(right.actionKey)))[0];
        return action ? {
          actionKey: action.actionKey,
          actionPatch: {
            strictRollOutcome:
              buildWarmachineBenchmarkMaximumStrictRollOutcomeV2(action),
          },
        } : null;
      },
      maxSteps: 12,
      onProgress: (detail) => onProgress({
        stage: "strict_activation",
        routeKey,
        ...detail,
      }),
    },
  );
}

function receiptEvents(execution = {}) {
  return (execution.receipts || []).flatMap((receipt) => receipt.events || []);
}

function actionSequence(execution = {}) {
  return (execution.receipts || []).map((receipt) => stableGraphValue({
    actionKey: String(receipt.actionKey || ""),
    actionType: String(receipt.actionType || ""),
    actorPieceKey: String(receipt.actorPieceKey || ""),
    targetPieceKey: String(receipt.targetPieceKey || ""),
    receiptHash: String(receipt.receiptHash || ""),
  }));
}

function targetBoxes(piece = {}) {
  return numeric(piece.damage?.boxesRemaining ?? piece.boxesRemaining, 0);
}

function targetMaximumBoxes(piece = {}) {
  return numeric(piece.damage?.maxBoxes ?? piece.maxBoxes, 0);
}

function fatalDamageResolution(execution = {}, targetPieceKey = "") {
  const receipts = execution.receipts || [];
  const commitIndex = receipts.findIndex((receipt) =>
    (receipt.events || []).some((event) =>
      event.eventType === "damage_applied" &&
      event.targetPieceKey === targetPieceKey &&
      Number(event.boxesRemainingAfter) === 0));
  if (commitIndex < 0) return null;
  const commitReceipt = receipts[commitIndex];
  const persistedAction = commitReceipt.persistedAction || {};
  const sourceEvent = (commitReceipt.events || []).find((event) =>
    event.sourceActionKey || event.sourceActionType) || {};
  const sourceActionKey = String(
    persistedAction.metadata?.sourceActionKey ||
    sourceEvent.sourceActionKey ||
    (/attack/i.test(String(commitReceipt.actionType || ""))
      ? commitReceipt.actionKey
      : ""),
  );
  const sourceActionType = String(
    persistedAction.metadata?.sourceActionType ||
    sourceEvent.sourceActionType ||
    (/attack/i.test(String(commitReceipt.actionType || ""))
      ? commitReceipt.actionType
      : ""),
  );
  const sourceIndex = receipts.findIndex((receipt, index) =>
    index <= commitIndex && receipt.actionKey === sourceActionKey);
  const sourceReceipt = sourceIndex >= 0 ? receipts[sourceIndex] : null;
  if (!sourceReceipt || sourceIndex > commitIndex ||
      (sourceActionType && sourceReceipt.actionType !== sourceActionType)) {
    return null;
  }
  return {
    commitIndex,
    commitReceipt,
    sourceIndex,
    sourceReceipt,
    sourceActionKey,
    sourceActionType,
  };
}

function terminalExecutionAudit(predecessor = {}, geometry = {}, primary = {},
  replay = {}, terminal = {}) {
  const primaryEvents = receiptEvents(primary);
  const replayEvents = receiptEvents(replay);
  const primaryTerminal = primaryEvents.find((event) =>
    event.eventType === "terminal" &&
    event.winnerSideKey === terminal.winnerSideKey);
  const replayTerminal = replayEvents.find((event) =>
    event.eventType === "terminal" &&
    event.winnerSideKey === terminal.winnerSideKey);
  const targetBefore = predecessor.pieces.find((piece) =>
    piece.pieceKey === geometry.target.pieceKey);
  const targetAfter = primary.state?.pieces?.find((piece) =>
    piece.pieceKey === geometry.target.pieceKey);
  const targetAfterReplay = replay.state?.pieces?.find((piece) =>
    piece.pieceKey === geometry.target.pieceKey);
  const damageTimeline = primaryEvents.filter((event) =>
    event.eventType === "damage_applied" &&
    event.targetPieceKey === geometry.target.pieceKey).map((event) =>
    stableGraphValue({
      damage: Number(event.damage || 0),
      rawStrictDamage: Number(event.rawStrictDamage || 0),
      boxesRemainingAfter: Number(event.boxesRemainingAfter || 0),
      targetDestroyedAfterDamage: event.targetDestroyedAfterDamage === true,
    }));
  const lifecycleSequence = primaryEvents.filter((event) =>
    ["disabled", "boxed", "destroyed"].includes(event.eventType) &&
    event.targetPieceKey === geometry.target.pieceKey).map((event) =>
    event.eventType);
  const continuousEffects = primaryEvents.filter((event) =>
    event.eventType === "continuous_effect_applied" &&
    event.targetPieceKey === geometry.target.pieceKey).map((event) =>
    stableGraphValue({
      continuousEffectType: event.continuousEffectType,
      atomKey: event.atomKey,
      sourceActionType: event.sourceActionType,
    }));
  const forcedResources = primaryEvents.filter((event) =>
    event.eventType === "fury_forced" || event.eventType === "focus_spent")
    .map((event) => stableGraphValue({
      eventType: event.eventType,
      amount: Number(event.amount || 0),
      reason: String(event.reason || ""),
      remaining: Number(event.remaining || 0),
      resourceKind: String(event.resourceKind || ""),
    }));
  const primarySequence = actionSequence(primary);
  const replaySequence = actionSequence(replay);
  const primarySemanticHash = warmachineReverseStateSemanticHashV1(
    primary.state || {},
  );
  const replaySemanticHash = warmachineReverseStateSemanticHashV1(
    replay.state || {},
  );
  const targetStartingBoxes = targetBoxes(targetBefore);
  const targetMaxBoxes = targetMaximumBoxes(targetBefore);
  const totalAppliedDamage = damageTimeline.reduce((sum, row) =>
    sum + row.damage, 0);
  const primaryFatalDamage = fatalDamageResolution(
    primary,
    geometry.target.pieceKey,
  );
  const replayFatalDamage = fatalDamageResolution(
    replay,
    geometry.target.pieceKey,
  );
  const fatalActionLineOfSightEvidence = strictMeleeLosClearEvidence(
    primaryFatalDamage?.sourceReceipt?.persistedAction || {},
  );
  const replayFatalActionLineOfSightEvidence = strictMeleeLosClearEvidence(
    replayFatalDamage?.sourceReceipt?.persistedAction || {},
  );
  const strictReplayCertified = primary.ok === true && replay.ok === true &&
    Boolean(primaryTerminal) && Boolean(replayTerminal) &&
    Boolean(primaryFatalDamage) && Boolean(replayFatalDamage) &&
    Boolean(fatalActionLineOfSightEvidence) &&
    stableGraphHash(fatalActionLineOfSightEvidence) ===
      stableGraphHash(replayFatalActionLineOfSightEvidence) &&
    primarySemanticHash === replaySemanticHash &&
    stableGraphHash(primarySequence.map(({ receiptHash: _hash, ...row }) => row)) ===
      stableGraphHash(replaySequence.map(({ receiptHash: _hash, ...row }) => row)) &&
    targetStartingBoxes === targetMaxBoxes && targetMaxBoxes > 0 &&
    totalAppliedDamage >= targetStartingBoxes &&
    targetBoxes(targetAfter) === 0 && targetAfter?.destroyed === true &&
    targetBoxes(targetAfterReplay) === 0 &&
    stableGraphHash(lifecycleSequence) ===
      stableGraphHash(["disabled", "boxed", "destroyed"]);
  const primaryTerminalReceipt = (primary.receipts || []).find((receipt) =>
    (receipt.events || []).some((event) => event.eventType === "terminal"));
  const replayTerminalReceipt = (replay.receipts || []).find((receipt) =>
    (receipt.events || []).some((event) => event.eventType === "terminal"));
  return stableGraphValue({
    strictReplayCertified,
    targetStartingBoxes,
    targetMaxBoxes,
    targetEndingBoxes: targetBoxes(targetAfter),
    totalAppliedDamage,
    damageTimeline,
    lifecycleSequence,
    continuousEffects,
    forcedResources,
    fatalActionKey: String(primaryFatalDamage?.sourceReceipt?.actionKey || ""),
    fatalActionType: String(primaryFatalDamage?.sourceReceipt?.actionType || ""),
    fatalActionReceiptHash: String(
      primaryFatalDamage?.sourceReceipt?.receiptHash || "",
    ),
    replayFatalActionReceiptHash: String(
      replayFatalDamage?.sourceReceipt?.receiptHash || "",
    ),
    fatalDamageCommitActionKey: String(
      primaryFatalDamage?.commitReceipt?.actionKey || "",
    ),
    fatalDamageCommitActionType: String(
      primaryFatalDamage?.commitReceipt?.actionType || "",
    ),
    fatalDamageCommitReceiptHash: String(
      primaryFatalDamage?.commitReceipt?.receiptHash || "",
    ),
    replayFatalDamageCommitReceiptHash: String(
      replayFatalDamage?.commitReceipt?.receiptHash || "",
    ),
    fatalActionLineOfSightEvidence,
    replayFatalActionLineOfSightEvidence,
    targetDestroyed: targetAfter?.destroyed === true,
    targetRemovedFromPlay: targetAfter?.removedFromPlay === true,
    terminalEvent: primaryTerminal || null,
    replayTerminalEvent: replayTerminal || null,
    actionSequence: primarySequence,
    replayActionSequence: replaySequence,
    actionSequenceHash: stableGraphHash(
      primarySequence.map(({ receiptHash: _hash, ...row }) => row),
    ),
    primaryTerminalStateHash: primarySemanticHash,
    replayTerminalStateHash: replaySemanticHash,
    primaryActivationReceiptHash: String(primary.activationReceiptHash || ""),
    replayActivationReceiptHash: String(replay.activationReceiptHash || ""),
    receiptHash: String(primaryTerminalReceipt?.receiptHash || ""),
    replayReceiptHash: String(replayTerminalReceipt?.receiptHash || ""),
  });
}

function rosterIdentityLedger(state = {}) {
  return (state.pieces || []).map((piece) => stableGraphValue({
    pieceKey: String(piece.pieceKey || ""),
    sideKey: String(piece.sideKey || ""),
    cardId: pieceCardId(piece),
    modelId: String(piece.modelId || ""),
    unitGroupId: String(piece.unitGroupId || piece.unitId || ""),
  })).sort((left, right) => left.pieceKey.localeCompare(right.pieceKey));
}

function exactPartitionAudit(state = {}, opening = {}, representative = {},
  terminal = {}, authored = {}, priorLossPieceKeys = []) {
  const coordinates = representative.coordinates || {};
  const inPlayPieces = (state.pieces || []).filter(warmachinePieceInPlayV1);
  const outOfPlayPieces = (state.pieces || []).filter((piece) =>
    !warmachinePieceInPlayV1(piece));
  const damagedInPlay = inPlayPieces.filter((piece) => {
    const maximum = targetMaximumBoxes(piece);
    return maximum > 0 && targetBoxes(piece) !== maximum;
  });
  const resourceRows = (state.pieces || []).filter((piece) =>
    resourceMaximum(piece) > 0).map((piece) => ({
    pieceKey: piece.pieceKey,
    resource: resourceValue(piece),
    maximum: resourceMaximum(piece),
  }));
  const placementAudit = auditRulesV1StaticPlacement(state);
  const formationAudit = auditRulesV1StaticUnitFormation(state);
  const terrainAudit = auditRulesV1SteamrollerScenarioTerrainSetup(state);
  const priorLossSides = [...new Set(outOfPlayPieces.filter((piece) =>
    piece.destroyed === true && !leaderLike(piece)).map((piece) =>
    piece.sideKey))].sort();
  const checks = [
    ["full_task_roster_preserved", stableGraphHash(rosterIdentityLedger(opening.state)),
      stableGraphHash(rosterIdentityLedger(state))],
    ["model_count_preserved", Number(opening.modelCount), state.pieces.length],
    ["lifecycle_partition", true,
      coordinates.lifecycle === "both_sides_prior_losses"
        ? stableGraphHash(priorLossSides) ===
            stableGraphHash(["player1", "player2"]) &&
          outOfPlayPieces.length === priorLossPieceKeys.length &&
          outOfPlayPieces.every((piece) =>
            piece.destroyed === true && !leaderLike(piece)) &&
          (state.pieces || []).filter(leaderLike).every(warmachinePieceInPlayV1)
        : coordinates.lifecycle === "both_rosters_complete" &&
          priorLossPieceKeys.length === 0 &&
          outOfPlayPieces.length === 0 &&
          priorLossSides.length === 0 &&
          (state.pieces || []).every(warmachinePieceInPlayV1)],
    ["critical_models_undamaged", true,
      coordinates.damage === "critical_models_undamaged" &&
      damagedInPlay.length === 0],
    ["native_resource_predecessor", true,
      coordinates.resource === "zero_available"
        ? resourceRows.every((row) => row.resource === 0)
        : coordinates.resource === "maximum_native_resource"
          ? resourceRows.every((row) => row.resource === row.maximum)
          : false],
    ["base_topology_partition", true,
      coordinates.baseTopology === "legal_separated" && placementAudit.ok === true &&
      formationAudit.ok === true],
    ["action_range_partition", true,
      coordinates.actionRange === "strictly_inside"
        ? authored.geometry.actorTargetEdgeDistanceIn > 0 &&
          authored.geometry.actorTargetEdgeDistanceIn <
            authored.geometry.actorMeleeRangeIn &&
          authored.firstAction?.actionType === "melee_attack"
        : coordinates.actionRange ===
            "outside_direct_action_range_requires_prior_movement"
          ? authored.geometry.actorTargetEdgeDistanceIn >
              authored.geometry.actorMeleeRangeIn &&
            authored.firstAction?.actionType === "advance_then_melee_attack"
          : false],
    ["leader_control_partition", true,
      coordinates.leaderControl === "strictly_inside" &&
      authored.geometry.actorControllerEdgeDistanceIn <
        authored.geometry.controllerControlRangeIn],
    ["line_of_sight_partition", true,
      coordinates.lineOfSight === "clear" &&
      authored.losEvidence?.actionKey === authored.firstAction?.actionKey &&
      authored.losEvidence?.actionType === "melee_attack" &&
      authored.losEvidence?.actorPieceKey === authored.actor.pieceKey &&
      authored.losEvidence?.targetPieceKey === authored.target.pieceKey &&
      authored.losEvidence?.attackProfileKey ===
        profileKey(authored.attackProfile) &&
      authored.losEvidence?.hasClearLine === true &&
      authored.losEvidence?.blockedLineCount === 0],
    ["scenario_terrain_partition", coordinates.scenarioTerrainSetup,
      terrainAudit.setupClassKey],
    ["scenario_terrain_host_audit", true, terrainAudit.ok === true],
    ["winner_role", terminal.winnerSideKey, authored.actor.sideKey],
    ["loser_leader_role", terminal.loserSideKey, authored.target.sideKey],
  ].map(([checkKey, expected, observed]) => stableGraphValue({
    checkKey,
    expected,
    observed,
    passed: stableGraphHash({ value: expected }) ===
      stableGraphHash({ value: observed }),
  }));
  return stableGraphValue({
    ok: checks.every((check) => check.passed),
    checks,
    modelCount: state.pieces.length,
    inPlayModelCount: inPlayPieces.length,
    outOfPlayModelCount: outOfPlayPieces.length,
    priorLossPieceKeys: [...priorLossPieceKeys].sort(),
    priorLossSides,
    damagedInPlayPieceKeys: damagedInPlay.map((piece) => piece.pieceKey).sort(),
    resourceRows,
    placementAuditHash: stableGraphHash(placementAudit),
    formationAuditHash: stableGraphHash(formationAudit),
    terrainAuditHash: stableGraphHash(terrainAudit),
    terrainSetupClassKey: terrainAudit.setupClassKey,
  });
}

function payloadDecisionIncompatibilityEvidence(representative = {},
  mappingAudit = {}) {
  const profile = steamroller2026ScenarioProfiles.payload || {};
  const coordinates = representative.coordinates || {};
  return stableGraphValue({
    requestedPayloadMoveDecision: coordinates.payloadMoveDecision,
    requestedMadeToHaulDecision: coordinates.madeToHaulDecision,
    hostScenarioKey: String(profile.scenarioKey || "payload"),
    hostScenarioProfileHash: stableGraphHash(profile),
    hostSpecialRuleKeys: profile.specialRuleKeys || [],
    payloadMoveDeclined: coordinates.payloadMoveDecision ===
      "eligible_move_declined",
    madeToHaulTriggerRequiresPayloadMovement: true,
    payloadMovementOccursAfterDecline: false,
    madeToHaulDecisionWindowOccursAfterDecline: false,
    jointRelationExecutable: false,
    relationAuthority: "rules_v1_host_payload_turn_end_decision_contract",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    representativeMappingAudit: mappingAudit,
  });
}

function materializeFallback(task = {}, opening = {}, terminal = {},
  hostRepresentative = {}, mappingAudit = {}, onProgress = () => {}, plan = {},
  rawCandidateProgress = null) {
  const representative = task.representative || {};
  const baseState = prepareBaseState(opening, representative, terminal);
  const target = targetCandidates(baseState, task, terminal)[0];
  const candidates = actorCandidates(baseState, task, terminal);
  if (!target || !candidates.length) {
    return proposalFiltered(
      task,
      opening,
      "assassination_terminal_exact_actor_or_target_missing",
      {
        targetCandidateCount: target ? 1 : 0,
        actorCandidateCount: candidates.length,
        mappedHostRepresentative: hostRepresentative,
      },
    );
  }
  const protectedKeys = new Set([
    target.pieceKey,
    candidates[0].pieceKey,
    ...(baseState.pieces || []).filter(leaderLike).map((piece) => piece.pieceKey),
  ]);
  const requiresPriorLosses = representative.coordinates?.lifecycle ===
    "both_sides_prior_losses";
  const priorLossPieceKeys = requiresPriorLosses
    ? authorPriorLosses(baseState, protectedKeys)
    : [];
  if (requiresPriorLosses && !priorLossPieceKeys) {
    return proposalFiltered(
      task,
      opening,
      "assassination_terminal_prior_loss_relation_missing",
      { actorCandidateCount: candidates.length },
    );
  }
  const movementChunk = movementPredecessorMaterializableCoordinates(
    representative,
  )
    ? movementCandidateChunkForTask(task, candidates, plan, rawCandidateProgress)
    : null;
  if (movementChunk && !movementChunk.slot) {
    return proposalFiltered(
      task,
      opening,
      "assassination_terminal_movement_candidate_slots_exhausted",
      {
        candidatePlanHash: movementChunk.candidatePlan.candidatePlanHash,
        progressHash: movementChunk.progress.progressHash,
        totalSlotCount: movementChunk.candidatePlan.totalSlotCount,
      },
    );
  }
  const attemptedCandidates = movementChunk
    ? candidates.filter((candidate) => candidate.pieceKey ===
      movementChunk.slot.actorPieceKey)
    : candidates;
  const actorAttempts = [];
  let accepted = null;
  let strictExecutionAttempted = false;
  for (const actor of attemptedCandidates) {
    onProgress({ stage: "actor_geometry_start", actorPieceKey: actor.pieceKey });
    const authored = authoredGeometryForActor(
      baseState,
      actor.pieceKey,
      target.pieceKey,
      representative.coordinates?.actionRange,
      onProgress,
      movementChunk
        ? {
          slotStartIndex: movementChunk.slot.anchorIndex * 32 +
            movementChunk.slot.angleIndex,
          maximumSlotCount: 1,
        }
        : {},
    );
    if (!authored) {
      onProgress({ stage: "actor_geometry_filtered", actorPieceKey: actor.pieceKey });
      actorAttempts.push(stableGraphValue({
        actorPieceKey: actor.pieceKey,
        disposition: "proposal_filtered",
        reason: "strict_geometry_or_legal_direct_attack_missing",
      }));
      continue;
    }
    const predecessor = authored.state;
    const partitionAudit = exactPartitionAudit(
      predecessor,
      opening,
      representative,
      terminal,
      authored,
      priorLossPieceKeys,
    );
    if (!partitionAudit.ok) {
      onProgress({
        stage: "actor_partition_filtered",
        actorPieceKey: actor.pieceKey,
        failedCheckKeys: partitionAudit.checks.filter((check) =>
          !check.passed).map((check) => check.checkKey),
      });
      actorAttempts.push(stableGraphValue({
        actorPieceKey: actor.pieceKey,
        disposition: "proposal_filtered",
        reason: "exact_partition_audit_failed",
        failedChecks: partitionAudit.checks.filter((check) => !check.passed),
      }));
      continue;
    }
    if (strictExecutionAttempted) break;
    strictExecutionAttempted = true;
    onProgress({ stage: "primary_execution_start", actorPieceKey: actor.pieceKey });
    const primary = executeLethalActivation(
      predecessor,
      authored.actor,
      authored.target,
      authored.attackProfile,
      `matchup-assassination:${task.taskKey}:primary`,
      onProgress,
      representative.coordinates?.actionRange,
    );
    onProgress({ stage: "primary_execution_complete", ok: primary.ok === true });
    onProgress({ stage: "replay_execution_start", actorPieceKey: actor.pieceKey });
    const replay = executeLethalActivation(
      structuredClone(predecessor),
      authored.actor,
      authored.target,
      authored.attackProfile,
      `matchup-assassination:${task.taskKey}:replay`,
      onProgress,
      representative.coordinates?.actionRange,
    );
    onProgress({ stage: "replay_execution_complete", ok: replay.ok === true });
    const executionAudit = terminalExecutionAudit(
      predecessor,
      authored,
      primary,
      replay,
      terminal,
    );
    actorAttempts.push(stableGraphValue({
      actorPieceKey: actor.pieceKey,
      attackProfileKey: profileKey(authored.attackProfile),
      disposition: executionAudit.strictReplayCertified
        ? "strict_materialized"
        : "proposal_filtered",
      reason: executionAudit.strictReplayCertified
        ? "full_health_lethal_route_replayed"
        : "full_health_lethal_route_not_proven",
      targetStartingBoxes: executionAudit.targetStartingBoxes,
      totalAppliedDamage: executionAudit.totalAppliedDamage,
      actionSequenceHash: executionAudit.actionSequenceHash,
      ...(executionAudit.strictReplayCertified ? {} : { executionAudit }),
    }));
    if (executionAudit.strictReplayCertified) {
      accepted = {
        authored,
        predecessor,
        partitionAudit,
        primary,
        replay,
        executionAudit,
      };
      break;
    }
    break;
  }
  if (!accepted && movementChunk &&
      movementChunk.progress.nextSlotIndex <
        movementChunk.candidatePlan.totalSlotCount) {
    const nextProgress = advanceWarmachineMatchupTerminalCandidateProgressV1({
      candidatePlan: movementChunk.candidatePlan,
      progress: movementChunk.progress,
      maximumSlotCount: 1,
      candidateEvidenceHash: stableGraphHash({
        taskKey: task.taskKey,
        candidatePlanHash: movementChunk.candidatePlan.candidatePlanHash,
        slot: movementChunk.slot,
        actorAttempts,
      }),
      updatedAtMs: Date.now(),
    });
    return {
      candidateProgress: {
        candidatePlan: movementChunk.candidatePlan,
        progress: nextProgress,
      },
    };
  }
  if (!accepted) {
    return proposalFiltered(
      task,
      opening,
      "assassination_terminal_no_full_health_lethal_actor",
      {
        actorCandidateCount: candidates.length,
        actorAttempts,
        targetPieceKey: target.pieceKey,
      },
    );
  }
  const { authored, predecessor, partitionAudit, primary, replay,
    executionAudit } = accepted;
  const root = stableGraphValue({
    taskKey: task.taskKey,
    taskRepresentativeSubcellKey: representative.subcellKey,
    hostRepresentativeSubcellKey: hostRepresentative.subcellKey,
    scenarioKey: representative.scenarioKey,
    roundNumber: Number(representative.roundNumber),
    terminalClassKey: representative.terminalClassKey,
    terminalCauseKey: representative.canonicalTerminal?.causalActionFamily,
    winnerSideKey: terminal.winnerSideKey,
    loserSideKey: terminal.loserSideKey,
    endingSideKey: terminal.endingSideKey,
    actorPieceKey: authored.actor.pieceKey,
    actorCardId: pieceCardId(authored.actor),
    actorLabel: String(authored.actor.label || authored.actor.name || ""),
    controllerPieceKey: authored.controller.pieceKey,
    targetPieceKey: authored.target.pieceKey,
    targetCardId: pieceCardId(authored.target),
    targetLabel: String(authored.target.label || authored.target.name || ""),
    attackProfileKey: profileKey(authored.attackProfile),
    attackProfileName: String(authored.attackProfile.name || ""),
    partitionCoordinates: representative.coordinates,
    partitionAudit,
    representativeMappingAudit: mappingAudit,
    completeRealRosterState: true,
    modelCount: predecessor.pieces.length,
    inPlayModelCount: partitionAudit.inPlayModelCount,
    priorLossPieceKeys,
    geometry: authored.geometry,
    movementPredecessorEvidence: representative.coordinates?.actionRange ===
        "outside_direct_action_range_requires_prior_movement"
      ? stableGraphValue({
        required: true,
        initialActionType: authored.firstAction?.actionType || "",
        initialActorTargetEdgeDistanceIn:
          authored.geometry.actorTargetEdgeDistanceIn,
        meleeRangeIn: authored.geometry.actorMeleeRangeIn,
        initialStateOutsideDirectRange:
          authored.geometry.actorTargetEdgeDistanceIn >
          authored.geometry.actorMeleeRangeIn,
      })
      : null,
    candidateLineOfSightEvidence: authored.losEvidence,
    lineOfSightEvidence: executionAudit.fatalActionLineOfSightEvidence,
    fatalActionKey: executionAudit.fatalActionKey,
    fatalActionType: executionAudit.fatalActionType,
    fatalActionReceiptHash: executionAudit.fatalActionReceiptHash,
    replayFatalActionReceiptHash:
      executionAudit.replayFatalActionReceiptHash,
    fatalDamageCommitActionKey: executionAudit.fatalDamageCommitActionKey,
    fatalDamageCommitActionType: executionAudit.fatalDamageCommitActionType,
    fatalDamageCommitReceiptHash:
      executionAudit.fatalDamageCommitReceiptHash,
    replayFatalDamageCommitReceiptHash:
      executionAudit.replayFatalDamageCommitReceiptHash,
    actorCandidateCount: candidates.length,
    actorAttempts,
    actionSequence: executionAudit.actionSequence,
    actionSequenceHash: executionAudit.actionSequenceHash,
    damageTimeline: executionAudit.damageTimeline,
    totalAppliedDamage: executionAudit.totalAppliedDamage,
    targetStartingBoxes: executionAudit.targetStartingBoxes,
    targetMaxBoxes: executionAudit.targetMaxBoxes,
    targetEndingBoxes: executionAudit.targetEndingBoxes,
    lifecycleSequence: executionAudit.lifecycleSequence,
    continuousEffects: executionAudit.continuousEffects,
    forcedResources: executionAudit.forcedResources,
    targetDestroyed: executionAudit.targetDestroyed,
    targetRemovedFromPlay: executionAudit.targetRemovedFromPlay,
    terminalEvent: executionAudit.terminalEvent,
    receiptHash: executionAudit.receiptHash,
    replayReceiptHash: executionAudit.replayReceiptHash,
    primaryActivationReceiptHash:
      executionAudit.primaryActivationReceiptHash,
    replayActivationReceiptHash:
      executionAudit.replayActivationReceiptHash,
    predecessorStateHash: warmachineReverseStateSemanticHashV1(predecessor),
    terminalStateHash: executionAudit.primaryTerminalStateHash,
    replayTerminalStateHash: executionAudit.replayTerminalStateHash,
    strictReplayCertified: true,
  });
  return {
    report: sealedReport(task, opening, {
      disposition: "strict_materialized",
      authority: "rules_v1_host",
      reason: "assassination_terminal_full_health_route_strictly_materialized",
      strictRulesConclusion: true,
    }, { root }),
    runtime: {
      predecessorStateHash: root.predecessorStateHash,
      terminalStateHash: root.terminalStateHash,
      replayTerminalStateHash: root.replayTerminalStateHash,
      primaryReceiptHashes: (primary.receipts || []).map((receipt) =>
        receipt.receiptHash),
      replayReceiptHashes: (replay.receipts || []).map((receipt) =>
        receipt.receiptHash),
      primaryReceiptCount: (primary.receipts || []).length,
      replayReceiptCount: (replay.receipts || []).length,
      placementAuditHash: stableGraphHash(authored.placementAudit),
      formationAuditHash: stableGraphHash(authored.formationAudit),
      placementAuditPassed: authored.placementAudit.ok === true,
      formationAuditPassed: authored.formationAudit.ok === true,
    },
  };
}

export function materializeWarmachineMatchupAssassinationTerminalTaskV1({
  terminalTask = {},
  groupPlan = {},
  opening = {},
  plan = {},
  evidenceCorpus = {},
  context = {},
} = {}) {
  let terminal;
  let validatedEvidence;
  try {
    if (terminalTask.representative?.terminalClassKey !== TERMINAL_CLASS ||
        terminalTask.executionEnvelope?.actionCategory !== ACTION_CATEGORY) {
      throw new Error("assassination_terminal_task_kind_required");
    }
    terminal = validateTaskReceipts(terminalTask);
    validateOpening(terminalTask, opening, terminal);
    validatePlanAndGroup(terminalTask, groupPlan, plan);
    validatedEvidence = validateEvidenceCorpus(
      evidenceCorpus,
      terminalTask.representative,
    );
  } catch (error) {
    return inputInvalid(
      terminalTask,
      opening,
      String(error?.message || error),
    );
  }
  if (terminal.actorMatchesWinner !== true) {
    return proposalFiltered(
      terminalTask,
      opening,
      "assassination_terminal_actor_side_not_terminal_winner",
      {
        actorTaskSideKey: terminal.actorTaskSideKey,
        winnerTaskSideKey: terminal.winnerTaskSideKey,
        roleMapping: terminal,
      },
    );
  }
  if (!warmachineMatchupAssassinationTerminalTaskSupportedV1(terminalTask)) {
    return {
      report: sealedReport(terminalTask, opening, {
        disposition: "budget_deferred",
        authority: "execution_coverage",
        reason: "assassination_terminal_partition_materializer_not_implemented",
      }, {
        partitionCoordinates: terminalTask.representative?.coordinates || {},
      }),
      runtime: null,
    };
  }
  const hostRepresentative = mappedHostRepresentative(
    terminalTask,
    terminal,
    evidenceCorpus,
  );
  if (!hostRepresentative) {
    return inputInvalid(
      terminalTask,
      opening,
      "assassination_terminal_side_permuted_host_cell_missing",
    );
  }
  const mappingAudit = representativeMappingAudit(
    terminalTask,
    terminal,
    hostRepresentative,
    validatedEvidence.cell,
  );
  if (!mappingAudit.exactPartitionMappingProven) {
    return proposalFiltered(
      terminalTask,
      opening,
      "assassination_terminal_side_permuted_partition_mapping_failed",
      mappingAudit,
    );
  }
  if (directLineOfSightBlockedCoordinates(terminalTask.representative)) {
    return proposalFiltered(
      terminalTask,
      opening,
      "assassination_terminal_direct_action_line_of_sight_not_clear",
      directLineOfSightBlockedEvidence(terminalTask.representative, mappingAudit),
    );
  }
  if (preferredIncompatibleCoordinates(terminalTask.representative)) {
    return proposalFiltered(
      terminalTask,
      opening,
      "assassination_terminal_payload_decline_made_to_haul_incompatible",
      payloadDecisionIncompatibilityEvidence(
        terminalTask.representative,
        mappingAudit,
      ),
    );
  }
  return materializeFallback(
    terminalTask,
    opening,
    terminal,
    hostRepresentative,
    mappingAudit,
    typeof context.onProgress === "function" ? context.onProgress : () => {},
    plan,
    context.candidateProgress || null,
  );
}

export function warmachineMatchupAssassinationTerminalTaskSupportedV1(
  terminalTask = {},
) {
  return terminalTask.representative?.terminalClassKey === TERMINAL_CLASS &&
    terminalTask.executionEnvelope?.actionCategory === ACTION_CATEGORY &&
    (directLineOfSightBlockedCoordinates(terminalTask.representative) ||
      preferredIncompatibleCoordinates(terminalTask.representative) ||
      fallbackMaterializableCoordinates(terminalTask.representative) ||
      movementPredecessorMaterializableCoordinates(terminalTask.representative));
}

export function buildWarmachineMatchupAssassinationTerminalTaskAdapterV1() {
  return Object.freeze({
    supports: ({ terminalTask } = {}) =>
      warmachineMatchupAssassinationTerminalTaskSupportedV1(terminalTask),
    materialize: materializeWarmachineMatchupAssassinationTerminalTaskV1,
  });
}
