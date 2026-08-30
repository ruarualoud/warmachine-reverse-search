import {
  buildWarmachineBenchmarkMaximumStrictRollOutcomeV2,
  executeWarmachineBenchmarkActivationV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { buildWarmachineCompositeExecutionReceiptV1 } from
  "../contracts/search-execution-receipt-v1.mjs";
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
  auditWarmachineTerminalAttackProfileCoverageV1,
  auditWarmachineMatchupTerminalCandidateProgressV1,
  buildWarmachineMatchupTerminalCandidatePlanV1,
  buildWarmachineMatchupTerminalCandidateProgressV1,
  buildWarmachineTerminalAttackProfileSlotsV1,
  enumerateWarmachineTerminalAttackCandidatesV1,
  executeWarmachineMatchupTerminalCandidateChunkV1,
} from "./matchup-terminal-candidate-ledger-v1.mjs";
import {
  auditWarmachineMatchupAssassinationTransitionProgressV1,
  buildWarmachineMatchupAssassinationTransitionProgressV1,
} from "./matchup-assassination-transition-progress-v1.mjs";
import {
  buildWarmachineMatchupTerminalTransitionProgressV1,
  executeWarmachineMatchupTerminalTransitionChunkV1,
} from "./matchup-terminal-transition-recovery-v1.mjs";
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
const CURRENT_EXECUTION_RECEIPT = buildWarmachineCompositeExecutionReceiptV1({
  hostReceipt: warmachineHost.receipt,
  constructionHostReceipt: warmachineConstructionHost.receipt,
  focusedEngineReceipt: warmachineHost.focusedSourceReceipt,
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
    executionSemanticReceiptHash: CURRENT_EXECUTION_RECEIPT.executionReceiptHash,
  });
  if (stableGraphHash(behaviorSignature) !== task.behaviorSignatureHash) {
    throw new Error(
      "assassination_terminal_task_host_or_construction_receipt_drift",
    );
  }
  const terminal = taskTerminal(task);
  if (terminal.causalActionFamily !== ACTION_CATEGORY ||
      terminal.resultKind !== "win") {
    throw new Error("assassination_terminal_task_action_role_binding_mismatch");
  }
  return terminal;
}

function actionRoleBindingEvidence(task = {}, terminal = {}) {
  const actorTaskSideKey = String(
    task.executionEnvelope?.actorAxis?.taskSideKey || "",
  );
  const compatible = actorTaskSideKey === terminal.winnerTaskSideKey &&
    terminal.endingSideKey === terminal.winnerSideKey;
  return stableGraphValue({
    compatible,
    causalActionFamily: terminal.causalActionFamily,
    actorTaskSideKey,
    winnerTaskSideKey: terminal.winnerTaskSideKey,
    endingTaskSideKey: terminal.endingTaskSideKey,
    actorSideKey: SIDE_KEY_BY_TASK_SIDE[actorTaskSideKey] || "",
    winnerSideKey: terminal.winnerSideKey,
    endingSideKey: terminal.endingSideKey,
    requiredRelation:
      "active_attack_actor_equals_ending_side_equals_assassination_winner",
    authority: "terminal_causal_role_relation",
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

const SCENARIO_RELATION_COORDINATE_KEYS = Object.freeze([
  "trenchCacheLifecycle",
  "wolvesProgressState",
  "wolvesTokenDecision",
  "wolvesObjectiveMove",
  "highStakesCountdownState",
  "highStakesFuseResolution",
  "highStakesBlastClosure",
  "payloadLifecycle",
  "payloadMoveDecision",
  "madeToHaulDecision",
]);

function directMeleeScenarioCoordinatesSupported(representative = {}) {
  const coordinates = representative.coordinates || {};
  const populatedKeys = SCENARIO_RELATION_COORDINATE_KEYS.filter((key) =>
    Boolean(coordinates[key]));
  if (representative.scenarioKey === "trench_warfare") {
    return coordinates.trenchCacheLifecycle === "both_caches_active" &&
      populatedKeys.length === 1;
  }
  return ["fault_line", "pressure_point", "two_fronts"].includes(
    representative.scenarioKey,
  ) && populatedKeys.length === 0;
}

function activeActionRoleIncompatibleTask(task = {}) {
  const representative = task.representative || {};
  const canonical = representative.canonicalTerminal || {};
  const sideBinding = task.executionEnvelope?.sideBinding || {};
  const actorTaskSideKey = String(
    task.executionEnvelope?.actorAxis?.taskSideKey || "",
  );
  const winnerTaskSideKey = String(sideBinding.winnerTaskSideKey || "");
  const endingTaskSideKey = String(sideBinding.endingTaskSideKey || "");
  return representative.terminalClassKey === TERMINAL_CLASS &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    canonical.causalActionFamily === ACTION_CATEGORY &&
    canonical.resultKind === "win" && actorTaskSideKey && winnerTaskSideKey &&
    endingTaskSideKey && (actorTaskSideKey !== winnerTaskSideKey ||
      endingTaskSideKey !== winnerTaskSideKey);
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
    ) && directMeleeScenarioCoordinatesSupported(representative);
}

function movementMaterializableCoordinates(representative = {}) {
  const coordinates = representative.coordinates || {};
  return representative.terminalClassKey === TERMINAL_CLASS &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.causalActionFamily === ACTION_CATEGORY &&
    representative.canonicalTerminal?.resultKind === "win" &&
    representative.scenarioKey === "pressure_point" &&
    coordinates.actionRange ===
      "outside_direct_action_range_requires_prior_movement" &&
    coordinates.baseTopology === "legal_separated" &&
    coordinates.damage === "critical_models_undamaged" &&
    coordinates.leaderControl === "strictly_inside" &&
    coordinates.lifecycle === "both_rosters_complete" &&
    coordinates.lineOfSight === "clear" &&
    coordinates.resource === "zero_available" &&
    coordinates.scenarioTerrainSetup ===
      "all_flags_fallback_no_valid_terrain";
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
  const expectedCode = /advance_then_melee_attack/i.test(action.actionType || "")
    ? "STRICT_ADVANCE_THEN_MELEE_LOS_BASE_TO_BASE_CLEAR_V20260821"
    : "STRICT_MELEE_LOS_BASE_TO_BASE_CLEAR_V20260815";
  const check = checks.find((row) =>
    row.code === expectedCode &&
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
  actionRange = "strictly_inside") {
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
  const baseStateHash = warmachineReverseStateSemanticHashV1(baseState);
  const domain = anchors.flatMap((anchor, anchorIndex) =>
    Array.from({ length: 32 }, (_, angleIndex) => stableGraphValue({
      anchor,
      anchorIndex,
      angleIndex,
      angleRadians: angleIndex * Math.PI / 16,
      candidateKey: `assassination-geometry-${stableGraphHash({
        actorKey,
        targetKey,
        anchor,
        angleIndex,
        baseStateHash,
      }, 24)}`,
    })));
  const exclusions = [];
  const examined = [];
  const exclusion = (descriptor, reason, authority, input, evidence = {}) => {
    const inputProjection = stableGraphValue(input);
    const core = stableGraphValue({
      candidateKey: descriptor.candidateKey,
      anchorIndex: descriptor.anchorIndex,
      angleIndex: descriptor.angleIndex,
      disposition: authority === "rules_v1_host"
        ? "strict_rejected"
        : "proven_excluded",
      reason,
      authority,
      inputProjection,
      inputHash: stableGraphHash(inputProjection),
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      ...evidence,
    });
    exclusions.push(stableGraphValue({
      ...core,
      exclusionHash: stableGraphHash(core),
    }));
  };
  const audit = (witnessDescriptor = null, witnessRelationSignature = null) => {
    const evaluatedCandidateKeys = new Set([
      ...exclusions.map((row) => row.candidateKey),
      ...examined.map((row) => row.candidateKey),
    ]);
    const unenumerated = witnessDescriptor ? domain.filter((descriptor) =>
      !evaluatedCandidateKeys.has(descriptor.candidateKey)).map((descriptor) =>
      stableGraphValue({
        candidateKey: descriptor.candidateKey,
        anchorIndex: descriptor.anchorIndex,
        angleIndex: descriptor.angleIndex,
        disposition: "unenumerated",
        reason: "assassination_geometry_existence_witness_stop",
      })) : [];
    const core = stableGraphValue({
      schemaVersion: "warmachine_matchup_assassination_geometry_search_audit_v1",
      completionMode: "existence",
      geometryDomainKey: "assassination_finite_anchor_angle_domain_v2",
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      baseStateHash,
      candidateCount: domain.length,
      evaluatedCandidateCount: evaluatedCandidateKeys.size,
      excludedCandidateCount: exclusions.length,
      examinedCandidateCount: examined.length,
      witnessFound: Boolean(witnessDescriptor),
      witnessCandidateKey: witnessDescriptor?.candidateKey || "",
      witnessRelationSignature,
      unenumeratedCandidateCount: unenumerated.length,
      enumerationComplete: unenumerated.length === 0,
      probabilityClosureEligible: false,
      unresolvedValueInterval: unenumerated.length ? [0, 1] : [0, 0],
      exclusions,
      examined,
      unenumerated,
      equivalenceContract: {
        proofKind: "complete_current_host_input_identity",
        equivalentCandidateReuseCount: 0,
        sameBaseSizeAloneIsProof: false,
        circularOrReflectionSymmetryAloneIsProof: false,
      },
      claimBoundary: "This is an existence search over 8 anchors and 32 angles. Every evaluated exclusion seals its input and authority. A first strict geometry witness may stop the search, but all remaining candidates stay unenumerated with interval [0,1] and cannot close probability mass or support optimality claims.",
    });
    return stableGraphValue({ ...core, auditHash: stableGraphHash(core) });
  };
  for (const descriptor of domain) {
    const { anchor } = descriptor;
      const state = structuredClone(baseState);
      const actor = state.pieces.find((piece) => piece.pieceKey === actorKey);
      const target = state.pieces.find((piece) => piece.pieceKey === targetKey);
      const controller = state.pieces.find((piece) =>
        piece.pieceKey === sourceController.pieceKey);
      const angle = descriptor.angleRadians;
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
        if (controlRangeIn <= 0) {
          exclusion(
            descriptor,
            "assassination_geometry_controller_range_missing",
            "parsed_static_capability",
            {
              baseStateHash,
              actorPieceKey: actorKey,
              targetPieceKey: targetKey,
              controllerPieceKey: sourceController.pieceKey,
              controlRangeIn,
            },
          );
          continue;
        }
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
      const geometryInput = stableGraphValue({
        baseStateHash,
        actorPieceKey: actorKey,
        targetPieceKey: targetKey,
        controllerPieceKey: sourceController.pieceKey,
        actorPosition: normalizedActor.position,
        targetPosition: normalizedTarget.position,
        controllerPosition: normalizedController.position,
      });
      if (!placementAudit.ok || !formationAudit.ok) {
        const auditEvidence = stableGraphValue({ placementAudit, formationAudit });
        exclusion(
          descriptor,
          "assassination_geometry_host_static_necessary_condition_rejected",
          "rules_v1_host",
          geometryInput,
          {
            auditEvidence,
            auditEvidenceHash: stableGraphHash(auditEvidence),
          },
        );
        continue;
      }
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
      if (!actionRangeMatches ||
          !(actorControllerEdgeDistanceIn <
            numeric(normalizedController.controlRangeIn, 0))) {
        exclusion(
          descriptor,
          "assassination_geometry_static_range_necessary_condition_rejected",
          "parsed_static_capability",
          {
            ...geometryInput,
            actorTargetEdgeDistanceIn,
            shortestMeleeRangeIn,
            actorControllerEdgeDistanceIn,
            controllerControlRangeIn: numeric(normalizedController.controlRangeIn, 0),
          },
        );
        continue;
      }
      const enumeration = enumerateRulesV1Actions(normalized, {
        actorPieceKeys: [actorKey],
        targetPieceKeys: [targetKey],
        actionFamilyKeys: ["attack_or_effect"],
        includeActorlessActions: false,
        includeUntargetedActions: false,
      });
      const terminalAttackCandidates = enumerateWarmachineTerminalAttackCandidatesV1({
        actions: enumeration.actions || [],
        rejectedActions: enumeration.rejectedActions || [],
        actorPieceKey: actorKey,
        targetPieceKey: targetKey,
      });
      const attackProfileCoverage = auditWarmachineTerminalAttackProfileCoverageV1({
        attackProfiles: normalizedActor.attackProfiles || [],
        attackCandidates: terminalAttackCandidates,
      });
      const directMelee = (enumeration.actions || []).filter((action) =>
        action.actionType === (requiresPriorMovement
          ? "advance_then_melee_attack"
          : "melee_attack") &&
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
      if (!directMelee) {
        const enumerationEvidence = stableGraphValue({
          actionCount: (enumeration.actions || []).length,
          rejectedActionCount: (enumeration.rejectedActions || []).length,
          terminalAttackCandidates,
          attackProfileCoverage,
        });
        exclusion(
          descriptor,
          requiresPriorMovement
            ? "assassination_geometry_host_advance_then_melee_action_missing"
            : "assassination_geometry_host_direct_melee_action_missing",
          "rules_v1_host",
          geometryInput,
          {
            enumerationEvidence,
            enumerationEvidenceHash: stableGraphHash(enumerationEvidence),
          },
        );
        continue;
      }
      const directMeleeLosEvidence = strictMeleeLosClearEvidence(directMelee);
      if (!directMeleeLosEvidence) {
        const losEvidence = stableGraphValue({
          actionKey: directMelee.actionKey,
          legality: directMelee.legality || null,
        });
        exclusion(
          descriptor,
          "assassination_geometry_host_melee_los_evidence_missing",
          "rules_v1_host",
          geometryInput,
          { losEvidence, losEvidenceHash: stableGraphHash(losEvidence) },
        );
        continue;
      }
      const relationProjection = stableGraphValue({
        hostReceiptHash: warmachineHost.receipt.receiptHash,
        completeStateHash: warmachineReverseStateSemanticHashV1(enumeration.state),
        geometryInput,
        placementAudit,
        formationAudit,
        directMeleeLosEvidence,
        directMeleeAction: {
          actionType: directMelee.actionType,
          actorPieceKey: directMelee.actorPieceKey,
          targetPieceKey: directMelee.targetPieceKey,
          attackProfile: directMelee.metadata?.attackProfile || null,
          legality: directMelee.legality || null,
        },
      });
      const relationSignature = stableGraphValue({
        proofKind: "complete_current_host_input_and_observed_relation_identity",
        relationProjection,
        signatureHash: stableGraphHash(relationProjection),
      });
      examined.push(stableGraphValue({
        candidateKey: descriptor.candidateKey,
        anchorIndex: descriptor.anchorIndex,
        angleIndex: descriptor.angleIndex,
        disposition: "strict_geometry_witness",
        inputHash: stableGraphHash(geometryInput),
        relationSignatureHash: relationSignature.signatureHash,
      }));
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
        enumeration,
        terminalAttackCandidates,
        attackProfileCoverage,
        geometrySearchAudit: audit(descriptor, relationSignature),
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
          actionRange,
          requiresPriorMovement,
          movementDestination: directMelee.destination || null,
          movementPath: directMelee.movementPath ||
            directMelee.metadata?.movementPath || null,
        }),
      };
  }
  return {
    geometryUnavailable: true,
    geometrySearchAudit: audit(),
  };
}

function activationGroupKeyForPiece(piece = {}) {
  return String(piece.unitGroupId || piece.unitId ||
    piece.metadata?.unitGroupId || piece.metadata?.unitId ||
    piece.pieceKey || "");
}

function executeLethalActivation(state = {}, actor = {}, target = {},
  attackProfile = {}, routeKey = "", onProgress = () => {}, firstAction = null,
  options = {}) {
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
      selectAction: ({ state: stepState, scoped, stepIndex }) => {
        if (stepIndex === 0 && firstAction?.actionKey) {
          const exact = (scoped.enumeration.actions || []).find((candidate) =>
            candidate.actionKey === firstAction.actionKey &&
            candidate.actionType === firstAction.actionType &&
            candidate.actorPieceKey === actor.pieceKey &&
            candidate.targetPieceKey === target.pieceKey &&
            profileKey(candidate.metadata?.attackProfile ||
              candidate.metadata?.spellProfile || {}) === attackProfileKey);
          return {
            actionKey: exact?.actionKey ||
              `missing-terminal-candidate:${firstAction.actionKey}`,
            ...(exact ? {
              actionPatch: {
                strictRollOutcome:
                  buildWarmachineBenchmarkMaximumStrictRollOutcomeV2(exact),
              },
            } : {}),
          };
        }
        const continuationWindowActive = Boolean(
          stepState.initialAttackWindow?.actorPieceKey === actor.pieceKey ||
          stepState.combatPurchaseWindow?.actorPieceKey === actor.pieceKey,
        );
        const action = (scoped.enumeration.actions || []).filter((candidate) =>
          candidate.actorPieceKey === actor.pieceKey &&
          candidate.targetPieceKey === target.pieceKey &&
          /attack|offensive_spell/i.test(String(candidate.actionType || "")) &&
          (continuationWindowActive || profileKey(
            candidate.metadata?.attackProfile ||
              candidate.metadata?.spellProfile || {},
          ) === attackProfileKey))
          .sort((left, right) =>
            Number(/purchased_additional_melee_attack$/.test(
              String(right.actionType || ""),
            )) - Number(/purchased_additional_melee_attack$/.test(
              String(left.actionType || ""),
            )) ||
            numeric(right.expectedDamage, 0) -
              numeric(left.expectedDamage, 0) ||
            String(left.actionKey).localeCompare(String(right.actionKey)))[0];
        return action ? {
          actionKey: action.actionKey,
          actionPatch: {
            strictRollOutcome:
              buildWarmachineBenchmarkMaximumStrictRollOutcomeV2(action),
          },
        } : null;
      },
      maxSteps: Math.max(1, Number(options.maxSteps || 12)),
      stepIndexOffset: Math.max(0, Number(options.stepIndexOffset || 0)),
      resumeInitialGroup: options.resumeInitialGroup || null,
      pauseAfterTransitionBudget:
        options.pauseAfterTransitionBudget === true,
      onProgress: (detail) => onProgress({
        stage: "strict_activation",
        routeKey,
        ...detail,
      }),
    },
  );
}

function lethalExecutionKey(taskKey = "", actionLineIdentityHash = "",
  phase = "") {
  return `matchup-assassination:${taskKey}:${
    actionLineIdentityHash.slice(0, 16)}:${phase}`;
}

function buildLethalTransitionProgress(task = {}, predecessor = {}, actor = {},
  actionLineIdentityHash = "", phase = "") {
  return buildWarmachineMatchupTerminalTransitionProgressV1({
    executionKey: lethalExecutionKey(
      task.taskKey,
      actionLineIdentityHash,
      phase,
    ),
    activationGroupKey: activationGroupKeyForPiece(actor),
    executionReceiptHash: CURRENT_EXECUTION_RECEIPT.executionReceiptHash,
    initialState: predecessor,
  });
}

function advanceLethalTransitionProgress(progress = {}, task = {}, actor = {},
  target = {}, attackProfile = {}, sourceAction = {},
  actionLineIdentityHash = "", phase = "", transitionBudget = 1,
  onProgress = () => {}) {
  return executeWarmachineMatchupTerminalTransitionChunkV1({
    progress,
    maximumTransitionCount: Math.max(1, Number(transitionBudget || 1)),
    runTransition: (state, resume) => executeLethalActivation(
      state,
      actor,
      target,
      attackProfile,
      lethalExecutionKey(task.taskKey, actionLineIdentityHash, phase),
      onProgress,
      sourceAction,
      {
        maxSteps: 1,
        stepIndexOffset: resume.committedTransitionCount,
        resumeInitialGroup: resume.resumeInitialGroup,
        pauseAfterTransitionBudget: true,
      },
    ),
  });
}

function executionFromTransitionProgress(progress = {}) {
  return stableGraphValue({
    ok: progress.status === "completed",
    completed: progress.status === "completed",
    state: progress.committedState,
    receipts: progress.committedReceipts,
    rejectedReceipts: (progress.rejectionEvidence || []).flatMap((entry) =>
      entry.receipt ? [entry.receipt] : []),
    selectionAudit: progress.committedSelectionAudit,
    reason: progress.failureReason || "",
    activationReceiptHash: stableGraphHash({
      executionKey: progress.executionKey,
      progressHash: progress.progressHash,
    }),
  });
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
  const scenarioChecks = [];
  if (representative.scenarioKey === "trench_warfare") {
    const activeCacheKeys = (state.scenario?.caches || []).filter((cache) =>
      cache.active !== false).map((cache) => String(cache.cacheKey || "")).sort();
    scenarioChecks.push([
      "trench_cache_lifecycle_partition",
      true,
      coordinates.trenchCacheLifecycle === "both_caches_active" &&
        activeCacheKeys.length === 2,
    ]);
  }
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
          priorLossPieceKeys.length === 0 && outOfPlayPieces.length === 0 &&
          priorLossSides.length === 0 &&
          (state.pieces || []).every(warmachinePieceInPlayV1)],
    ["critical_models_undamaged", true,
      coordinates.damage === "critical_models_undamaged" &&
      damagedInPlay.length === 0],
    ["native_resource_predecessor", true,
      coordinates.resource === "zero_available"
        ? resourceRows.every((row) => row.resource === 0)
        : coordinates.resource === "maximum_native_resource" &&
          resourceRows.length > 0 && resourceRows.every((row) =>
            row.resource === row.maximum)],
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
            "outside_direct_action_range_requires_prior_movement" &&
          authored.geometry.actorTargetEdgeDistanceIn >
            authored.geometry.actorMeleeRangeIn &&
          authored.firstAction?.actionType === "advance_then_melee_attack"],
    ["leader_control_partition", true,
      coordinates.leaderControl === "strictly_inside" &&
      authored.geometry.actorControllerEdgeDistanceIn <
        authored.geometry.controllerControlRangeIn],
    ["line_of_sight_partition", true,
      coordinates.lineOfSight === "clear" &&
      authored.losEvidence?.actionKey === authored.firstAction?.actionKey &&
      authored.losEvidence?.actionType === authored.firstAction?.actionType &&
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
    ...scenarioChecks,
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

function assassinationCandidateSourceRows(actors = [], target = {}) {
  const slots = buildWarmachineTerminalAttackProfileSlotsV1({
    actors,
    targetPieceKey: target.pieceKey,
    geometryDomainKey: "assassination_finite_anchor_angle_domain_v2",
  });
  const actorByKey = new Map(actors.map((actor) => [actor.pieceKey, actor]));
  return slots.map((slot) => {
    const actor = actorByKey.get(slot.actorPieceKey);
    const profile = attackProfiles(actor).find((candidate) =>
      profileKey(candidate) === slot.attackProfileKey);
    if (!actor || !profile) {
      throw new Error("assassination_terminal_candidate_profile_source_missing");
    }
    return { actor, profile, slot };
  });
}

function sourceActionForCandidate(authored = {}, candidate = {}) {
  const actionRows = candidate.disposition === "strict_rejected"
    ? authored.enumeration.rejectedActions || []
    : authored.enumeration.actions || [];
  return actionRows.find((action) =>
    action.actionKey === candidate.actionKey &&
    action.actionType === candidate.actionType &&
    profileKey(action.metadata?.attackProfile ||
      action.metadata?.spellProfile || {}) === candidate.attackProfileKey) || null;
}

function materializeFallback(task = {}, opening = {}, terminal = {},
  hostRepresentative = {}, mappingAudit = {}, materializerContext = {}) {
  const onProgress = typeof materializerContext.onProgress === "function"
    ? materializerContext.onProgress
    : () => {};
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
  const actorAttempts = [];
  const availableActors = candidates.filter(warmachinePieceInPlayV1);
  const candidateSources = assassinationCandidateSourceRows(
    availableActors,
    target,
  );
  if (!candidateSources.length) {
    return proposalFiltered(
      task,
      opening,
      "assassination_terminal_no_host_attack_candidates",
      {
        actorCandidateCount: candidates.length,
        actorAttempts,
        targetPieceKey: target.pieceKey,
      },
    );
  }
  const candidatePlan = buildWarmachineMatchupTerminalCandidatePlanV1({
    taskKey: task.taskKey,
    behaviorSignatureHash: task.behaviorSignatureHash,
    goalFamilyContractVersion: "assassination_active_attack_or_effect_v2",
    candidateEnumerationVersion:
      "rules_v1_lazy_profile_slots_all_host_action_lines_v2",
    executionReceiptHash: CURRENT_EXECUTION_RECEIPT.executionReceiptHash,
    slots: candidateSources.map((source) => source.slot),
  });
  const suppliedMaterializerProgress =
    materializerContext.materializerProgress || null;
  const suppliedCandidateProgress = suppliedMaterializerProgress
    ?.candidateProgress || materializerContext.candidateProgress || null;
  const initialCandidateProgress = suppliedCandidateProgress ||
    buildWarmachineMatchupTerminalCandidateProgressV1({
      candidatePlan,
      updatedAtMs: Number(materializerContext.updatedAtMs || 0),
    });
  const suppliedProgressAudit =
    auditWarmachineMatchupTerminalCandidateProgressV1(
      initialCandidateProgress,
      candidatePlan,
    );
  if (!suppliedProgressAudit.ok) {
    return {
      report: sealedReport(task, opening, {
        disposition: "input_invalid",
        authority: "candidate_progress_contract",
        reason: "assassination_terminal_candidate_progress_invalid",
      }, {
        candidatePlanHash: candidatePlan.candidatePlanHash,
        candidateProgressAudit: suppliedProgressAudit,
      }),
      runtime: { candidatePlan, candidateProgress: initialCandidateProgress },
    };
  }
  if (suppliedMaterializerProgress) {
    const transitionProgressAudit =
      auditWarmachineMatchupAssassinationTransitionProgressV1(
        suppliedMaterializerProgress,
      );
    if (!transitionProgressAudit.ok ||
        suppliedMaterializerProgress.taskKey !== task.taskKey ||
        suppliedMaterializerProgress.behaviorSignatureHash !==
          task.behaviorSignatureHash ||
        suppliedMaterializerProgress.executionReceiptHash !==
          CURRENT_EXECUTION_RECEIPT.executionReceiptHash ||
        suppliedMaterializerProgress.candidatePlan.candidatePlanHash !==
          candidatePlan.candidatePlanHash ||
        suppliedMaterializerProgress.candidateProgress.progressHash !==
          initialCandidateProgress.progressHash) {
      return {
        report: sealedReport(task, opening, {
          disposition: "input_invalid",
          authority: "transition_progress_contract",
          reason: "assassination_terminal_transition_progress_invalid",
        }, { transitionProgressAudit }),
        runtime: { candidatePlan, candidateProgress: initialCandidateProgress },
      };
    }
  }
  let accepted = null;
  const authoredByActor = new Map();
  const candidateChunk = executeWarmachineMatchupTerminalCandidateChunkV1({
    candidatePlan,
    progress: initialCandidateProgress,
    maximumSlotCount: Math.max(1, Number(
      materializerContext.candidateChunkSize || 1,
    )),
    stopOnFirstTerminal: true,
    updatedAtMs: Number(materializerContext.updatedAtMs || 0),
    evaluateSlot: (slot, slotContext = {}) => {
      const source = candidateSources[slot.slotIndex];
      const { actor } = source;
      if (!authoredByActor.has(actor.pieceKey)) {
        onProgress({ stage: "actor_geometry_start", actorPieceKey: actor.pieceKey });
        const authored = authoredGeometryForActor(
          baseState,
          actor.pieceKey,
          target.pieceKey,
          representative.coordinates?.actionRange,
        );
        if (!authored || authored.geometryUnavailable) {
          authoredByActor.set(actor.pieceKey, authored || null);
        } else {
          const predecessor = authored.state;
          const partitionAudit = exactPartitionAudit(
            predecessor,
            opening,
            representative,
            terminal,
            authored,
            priorLossPieceKeys,
          );
          authoredByActor.set(actor.pieceKey, {
            authored,
            predecessor,
            partitionAudit,
          });
        }
      }
      const authoredEntry = authoredByActor.get(actor.pieceKey);
      if (!authoredEntry || authoredEntry.geometryUnavailable) {
        const exclusionEvidence = stableGraphValue({
          actorPieceKey: actor.pieceKey,
          targetPieceKey: target.pieceKey,
          geometryCandidateKey: slot.geometryCandidateKey,
          anchorCount: 8,
          angleCountPerAnchor: 32,
          baseStateHash: warmachineReverseStateSemanticHashV1(baseState),
          geometrySearchAudit: authoredEntry?.geometrySearchAudit || null,
          reason: "finite_geometry_domain_has_no_legal_direct_melee_anchor",
        });
        actorAttempts.push(stableGraphValue({
          actorPieceKey: actor.pieceKey,
          attackProfileKey: slot.attackProfileKey,
          disposition: "proven_excluded",
          reason: exclusionEvidence.reason,
        }));
        return {
          disposition: "proven_excluded",
          reason: exclusionEvidence.reason,
          evidenceHash: stableGraphHash(exclusionEvidence),
          exclusionProofHash: stableGraphHash(exclusionEvidence),
        };
      }
      const { authored, predecessor, partitionAudit } = authoredEntry;
      if (!partitionAudit.ok) {
        const failedChecks = partitionAudit.checks.filter((check) => !check.passed);
        const exclusionEvidence = stableGraphValue({
          actorPieceKey: actor.pieceKey,
          attackProfileKey: slot.attackProfileKey,
          geometryCandidateKey: slot.geometryCandidateKey,
          failedChecks,
          partitionAuditHash: stableGraphHash(partitionAudit),
        });
        return {
          disposition: "proven_excluded",
          reason: "exact_partition_audit_failed",
          evidenceHash: stableGraphHash(exclusionEvidence),
          exclusionProofHash: stableGraphHash(exclusionEvidence),
        };
      }
      const requiresPriorMovement = representative.coordinates?.actionRange ===
        "outside_direct_action_range_requires_prior_movement";
      const profileCandidates = (authored.terminalAttackCandidates || [])
        .filter((candidate) =>
          candidate.attackProfileKey === slot.attackProfileKey &&
          (requiresPriorMovement
            ? /^advance_then_/i.test(candidate.actionType)
            : !/^advance_then_/i.test(candidate.actionType)))
        .sort((left, right) =>
          Number(right.actionKey === authored.firstAction.actionKey) -
            Number(left.actionKey === authored.firstAction.actionKey) ||
          left.candidateIdentityHash.localeCompare(right.candidateIdentityHash));
      const profileActions = profileCandidates.map((candidate) => ({
        candidate,
        sourceAction: sourceActionForCandidate(authored, candidate),
      }));
      if (profileActions.some((row) => !row.sourceAction)) {
        throw new Error("assassination_terminal_candidate_source_action_missing");
      }
      if (!profileActions.length) {
        const exclusionEvidence = stableGraphValue({
          actorPieceKey: actor.pieceKey,
          attackProfileKey: slot.attackProfileKey,
          enumerationStateHash: warmachineReverseStateSemanticHashV1(
            authored.enumeration.state,
          ),
          attackProfileCoverage: authored.attackProfileCoverage,
          actionCount: (authored.enumeration.actions || []).length,
          rejectedActionCount: (authored.enumeration.rejectedActions || []).length,
        });
        return {
          disposition: "proven_excluded",
          reason: "profile_has_no_host_action_in_exact_geometry",
          evidenceHash: stableGraphHash(exclusionEvidence),
          exclusionProofHash: stableGraphHash(exclusionEvidence),
        };
      }
      const legalProfileActions = profileActions.filter(({ candidate }) =>
        candidate.disposition !== "strict_rejected");
      if (!legalProfileActions.length) {
        const rejectionEvidence = stableGraphValue(profileActions.map((row) => ({
          actionKey: row.sourceAction.actionKey,
          actionType: row.sourceAction.actionType,
          legality: row.sourceAction.legality || null,
          rejection: row.sourceAction.rejection || null,
        })));
        return {
          disposition: "strict_rejected",
          reason: "all_profile_action_lines_strict_rejected",
          evidenceHash: stableGraphHash(rejectionEvidence),
          rejectionEvidenceHash: stableGraphHash(rejectionEvidence),
        };
      }
      const pendingOutcomes = slotContext.pendingOutcomes || [];
      const candidateProgressAtSlot = pendingOutcomes.length
        ? advanceWarmachineMatchupTerminalCandidateProgressV1({
          candidatePlan,
          progress: slotContext.progress,
          slotOutcomes: pendingOutcomes,
          updatedAtMs: Number(materializerContext.updatedAtMs || 0),
        })
        : slotContext.progress;
      let transitionProgress = suppliedMaterializerProgress &&
        suppliedMaterializerProgress.activeSlotIndex === slot.slotIndex &&
        suppliedMaterializerProgress.phase !== "candidate"
        ? suppliedMaterializerProgress
        : null;
      if (transitionProgress &&
          transitionProgress.candidateProgress.progressHash !==
            candidateProgressAtSlot.progressHash) {
        throw new Error(
          "assassination_terminal_transition_candidate_cursor_mismatch",
        );
      }
      let completedActionLines = transitionProgress?.completedActionLines || [];
      let actionLineIndex = transitionProgress?.actionLineIndex || 0;
      let transitionBudget = Math.max(1, Math.floor(Number(
        materializerContext.transitionChunkSize || 24,
      )));
      const pauseForProgress = (primaryProgress, replayProgress, phase,
        actionLineIdentityHash) => ({
        disposition: "in_progress",
        detail: {
          materializerProgress:
            buildWarmachineMatchupAssassinationTransitionProgressV1({
              taskKey: task.taskKey,
              behaviorSignatureHash: task.behaviorSignatureHash,
              executionReceiptHash:
                CURRENT_EXECUTION_RECEIPT.executionReceiptHash,
              candidatePlan,
              candidateProgress: candidateProgressAtSlot,
              activeSlotIndex: slot.slotIndex,
              activeCandidateIdentityHash: slot.candidateIdentityHash,
              completedActionLines,
              actionLineIndex,
              actionLineIdentityHash,
              phase,
              primaryProgress,
              replayProgress,
            }),
        },
      });
      while (actionLineIndex < legalProfileActions.length) {
        const { candidate, sourceAction } =
          legalProfileActions[actionLineIndex];
        const actionLineIdentityHash = candidate.candidateIdentityHash;
        if (transitionProgress &&
            (transitionProgress.actionLineIndex !== actionLineIndex ||
             transitionProgress.actionLineIdentityHash !==
               actionLineIdentityHash)) {
          throw new Error(
            "assassination_terminal_transition_action_line_mismatch",
          );
        }
        const candidateProfile = sourceAction.metadata?.attackProfile ||
          sourceAction.metadata?.spellProfile || {};
        let primaryProgress = transitionProgress?.primaryProgress ||
          buildLethalTransitionProgress(
            task,
            predecessor,
            authored.actor,
            actionLineIdentityHash,
            "primary",
          );
        let replayProgress = transitionProgress?.replayProgress || null;
        let phase = transitionProgress?.phase || "primary";
        if (phase === "primary" && transitionBudget > 0) {
          onProgress({
            stage: "primary_execution_start",
            actorPieceKey: actor.pieceKey,
            candidateIdentityHash: actionLineIdentityHash,
          });
          const attemptCountBefore = primaryProgress.attemptCount;
          primaryProgress = advanceLethalTransitionProgress(
            primaryProgress,
            task,
            authored.actor,
            authored.target,
            candidateProfile,
            sourceAction,
            actionLineIdentityHash,
            "primary",
            transitionBudget,
            onProgress,
          );
          transitionBudget -= primaryProgress.attemptCount - attemptCountBefore;
          if (primaryProgress.status === "in_progress") {
            return pauseForProgress(
              primaryProgress,
              null,
              "primary",
              actionLineIdentityHash,
            );
          }
          if (primaryProgress.status === "completed") {
            onProgress({ stage: "primary_execution_complete", ok: true });
            replayProgress = buildLethalTransitionProgress(
              task,
              structuredClone(predecessor),
              authored.actor,
              actionLineIdentityHash,
              "replay",
            );
            phase = "replay";
          }
        }
        let lineOutcome = null;
        if (primaryProgress.status === "failed") {
          lineOutcome = stableGraphValue({
            actionLineIndex,
            actionLineIdentityHash,
            disposition: "strict_rejected",
            reason: primaryProgress.failureReason,
            evidenceHash: stableGraphHash(primaryProgress),
            rejectionEvidenceHashes: primaryProgress.rejectionEvidenceHashes,
          });
        } else {
          if (!replayProgress) {
            replayProgress = buildLethalTransitionProgress(
              task,
              structuredClone(predecessor),
              authored.actor,
              actionLineIdentityHash,
              "replay",
            );
          }
          if (transitionBudget <= 0) {
            return pauseForProgress(
              primaryProgress,
              replayProgress,
              "replay",
              actionLineIdentityHash,
            );
          }
          const replayAttemptCountBefore = replayProgress.attemptCount;
          replayProgress = advanceLethalTransitionProgress(
            replayProgress,
            task,
            authored.actor,
            authored.target,
            candidateProfile,
            sourceAction,
            actionLineIdentityHash,
            "replay",
            transitionBudget,
            onProgress,
          );
          transitionBudget -=
            replayProgress.attemptCount - replayAttemptCountBefore;
          if (replayProgress.status === "in_progress") {
            return pauseForProgress(
              primaryProgress,
              replayProgress,
              "replay",
              actionLineIdentityHash,
            );
          }
          if (replayProgress.status === "failed") {
            lineOutcome = stableGraphValue({
              actionLineIndex,
              actionLineIdentityHash,
              disposition: "strict_rejected",
              reason: replayProgress.failureReason,
              evidenceHash: stableGraphHash({
                primaryProgress,
                replayProgress,
              }),
              rejectionEvidenceHashes:
                replayProgress.rejectionEvidenceHashes,
            });
          } else {
            onProgress({ stage: "replay_execution_complete", ok: true });
            const primary = executionFromTransitionProgress(primaryProgress);
            const replay = executionFromTransitionProgress(replayProgress);
            const executionAudit = terminalExecutionAudit(
              predecessor,
              { ...authored, attackProfile: candidateProfile,
                firstAction: sourceAction },
              primary,
              replay,
              terminal,
            );
            const disposition = executionAudit.strictReplayCertified
              ? "examined_terminal"
              : "examined_nonterminal";
            actorAttempts.push(stableGraphValue({
              actorPieceKey: actor.pieceKey,
              actionKey: sourceAction.actionKey,
              actionType: sourceAction.actionType,
              attackProfileKey: profileKey(candidateProfile),
              candidateIdentityHash: actionLineIdentityHash,
              profileSlotIdentityHash: slot.candidateIdentityHash,
              disposition,
              reason: executionAudit.strictReplayCertified
                ? "full_health_lethal_route_replayed"
                : "full_health_lethal_route_not_proven",
              targetStartingBoxes: executionAudit.targetStartingBoxes,
              totalAppliedDamage: executionAudit.totalAppliedDamage,
              actionSequenceHash: executionAudit.actionSequenceHash,
              ...(executionAudit.strictReplayCertified
                ? {} : { executionAudit }),
            }));
            if (executionAudit.strictReplayCertified) {
              accepted = {
                authored: { ...authored, attackProfile: candidateProfile,
                  firstAction: sourceAction },
                predecessor,
                partitionAudit,
                primary,
                replay,
                executionAudit,
              };
              return {
                disposition: "examined_terminal",
                reason: "strict_terminal_replay_certified",
                evidenceHash: stableGraphHash(executionAudit),
                terminalCandidateSemanticHash:
                  executionAudit.primaryTerminalStateHash,
              };
            }
            lineOutcome = stableGraphValue({
              actionLineIndex,
              actionLineIdentityHash,
              disposition: "examined_nonterminal",
              reason: "full_health_lethal_route_not_proven",
              evidenceHash: stableGraphHash(executionAudit),
              executionAudit,
            });
          }
        }
        completedActionLines = [...completedActionLines, lineOutcome];
        if (lineOutcome.disposition !== "examined_nonterminal") {
          actorAttempts.push(stableGraphValue({
            actorPieceKey: actor.pieceKey,
            actionKey: sourceAction.actionKey,
            actionType: sourceAction.actionType,
            attackProfileKey: profileKey(candidateProfile),
            candidateIdentityHash: actionLineIdentityHash,
            profileSlotIdentityHash: slot.candidateIdentityHash,
            disposition: lineOutcome.disposition,
            reason: lineOutcome.reason,
          }));
        }
        actionLineIndex += 1;
        transitionProgress = null;
        if (actionLineIndex < legalProfileActions.length &&
            transitionBudget <= 0) {
          const next = legalProfileActions[actionLineIndex];
          const nextPrimary = buildLethalTransitionProgress(
            task,
            predecessor,
            authored.actor,
            next.candidate.candidateIdentityHash,
            "primary",
          );
          return pauseForProgress(
            nextPrimary,
            null,
            "primary",
            next.candidate.candidateIdentityHash,
          );
        }
      }
      const allRejected = completedActionLines.length > 0 &&
        completedActionLines.every((line) =>
          line.disposition === "strict_rejected");
      const evidenceHash = stableGraphHash({
        profileSlotIdentityHash: slot.candidateIdentityHash,
        legalActionLineCount: legalProfileActions.length,
        strictRejectedActionLineCount:
          profileActions.length - legalProfileActions.length +
          completedActionLines.filter((line) =>
            line.disposition === "strict_rejected").length,
        completedActionLines,
      });
      return allRejected ? {
        disposition: "strict_rejected",
        reason: "all_legal_profile_action_lines_strict_rejected",
        evidenceHash,
        rejectionEvidenceHash: evidenceHash,
      } : {
        disposition: "examined_nonterminal",
        reason: "all_legal_profile_action_lines_examined_nonterminal",
        evidenceHash,
      };
    },
  });
  const candidateProgress = candidateChunk.progress;
  if (candidateChunk.inProgress) {
    const materializerProgress =
      candidateChunk.inProgress.detail?.materializerProgress || null;
    const transitionProgressAudit =
      auditWarmachineMatchupAssassinationTransitionProgressV1(
        materializerProgress || {},
      );
    if (!transitionProgressAudit.ok) {
      throw new Error(
        `assassination_terminal_transition_progress_output_invalid:${
          transitionProgressAudit.issues.join(",")}`,
      );
    }
    return {
      report: sealedReport(task, opening, {
        disposition: "budget_deferred",
        authority: "transition_execution_budget",
        reason: "assassination_terminal_transition_chunk_incomplete",
      }, {
        candidatePlanHash: candidatePlan.candidatePlanHash,
        candidateProgressHash: candidateProgress.progressHash,
        candidateMass: candidateProgress.mass,
        activeSlotIndex: materializerProgress.activeSlotIndex,
        actionLineIndex: materializerProgress.actionLineIndex,
        phase: materializerProgress.phase,
        transitionProgressHash: materializerProgress.progressHash,
      }),
      materializerProgress,
      runtime: { candidatePlan, candidateProgress, materializerProgress },
    };
  }
  if (!accepted) {
    if (candidateProgress.mass.unresolvedSlotCount > 0) {
      const nextSlot = candidatePlan.slots[candidateProgress.nextSlotIndex];
      if (!nextSlot) {
        throw new Error("assassination_terminal_candidate_cursor_slot_missing");
      }
      const materializerProgress =
        buildWarmachineMatchupAssassinationTransitionProgressV1({
          taskKey: task.taskKey,
          behaviorSignatureHash: task.behaviorSignatureHash,
          executionReceiptHash: CURRENT_EXECUTION_RECEIPT.executionReceiptHash,
          candidatePlan,
          candidateProgress,
          activeSlotIndex: nextSlot.slotIndex,
          activeCandidateIdentityHash: nextSlot.candidateIdentityHash,
          completedActionLines: [],
          actionLineIndex: 0,
          actionLineIdentityHash: "candidate_cursor_pending_action_line",
          phase: "candidate",
          primaryProgress: {},
          replayProgress: null,
        });
      return {
        report: sealedReport(task, opening, {
          disposition: "budget_deferred",
          authority: "candidate_execution_budget",
          reason: "assassination_terminal_candidate_chunk_incomplete",
        }, {
          actorCandidateCount: candidates.length,
          actorAttempts,
          targetPieceKey: target.pieceKey,
          candidatePlanHash: candidatePlan.candidatePlanHash,
          candidateProgressHash: candidateProgress.progressHash,
          candidateMass: candidateProgress.mass,
        }),
        materializerProgress,
        runtime: { candidatePlan, candidateProgress, materializerProgress },
      };
    }
    return proposalFiltered(
      task,
      opening,
      "assassination_terminal_no_full_health_lethal_actor",
      {
        actorCandidateCount: candidates.length,
        actorAttempts,
        targetPieceKey: target.pieceKey,
        candidatePlanHash: candidatePlan.candidatePlanHash,
        candidateProgressHash: candidateProgress.progressHash,
        candidateMass: candidateProgress.mass,
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
    geometrySearchAudit: authored.geometrySearchAudit,
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
    candidatePlanHash: candidatePlan.candidatePlanHash,
    candidateProgressHash: candidateProgress.progressHash,
    candidateMass: candidateProgress.mass,
    candidateSetHash: candidatePlan.candidateSetHash,
    terminalCandidateSemanticHashes:
      candidateProgress.terminalCandidateSemanticHashes,
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
      predecessorState: structuredClone(predecessor),
      terminalState: structuredClone(primary.state),
      replayTerminalState: structuredClone(replay.state),
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
      candidatePlan,
      candidateProgress,
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
  const actionRoleEvidence = actionRoleBindingEvidence(
    terminalTask,
    terminal,
  );
  if (!actionRoleEvidence.compatible) {
    return proposalFiltered(
      terminalTask,
      opening,
      "assassination_terminal_active_action_role_relation_incompatible",
      {
        actionRoleBindingEvidence: actionRoleEvidence,
        representativeEvidence: {
          selectedRepresentativeSubcellKey:
            validatedEvidence.selected.subcellKey,
          selectedRepresentativeCellKey: validatedEvidence.selected.cellKey,
          evidenceCorpusCacheHash: evidenceCorpus.cacheHash,
        },
      },
    );
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
    context,
  );
}

export function warmachineMatchupAssassinationTerminalTaskSupportedV1(
  terminalTask = {},
) {
  return terminalTask.representative?.terminalClassKey === TERMINAL_CLASS &&
    terminalTask.executionEnvelope?.actionCategory === ACTION_CATEGORY &&
    (activeActionRoleIncompatibleTask(terminalTask) ||
      preferredIncompatibleCoordinates(terminalTask.representative) ||
      fallbackMaterializableCoordinates(terminalTask.representative) ||
      movementMaterializableCoordinates(terminalTask.representative));
}

export function buildWarmachineMatchupAssassinationTerminalTaskAdapterV1() {
  return Object.freeze({
    supports: ({ terminalTask } = {}) =>
      warmachineMatchupAssassinationTerminalTaskSupportedV1(terminalTask),
    materialize: materializeWarmachineMatchupAssassinationTerminalTaskV1,
  });
}
