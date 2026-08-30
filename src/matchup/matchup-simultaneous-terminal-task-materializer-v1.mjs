import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { buildWarmachineCompositeExecutionReceiptV1 } from
  "../contracts/search-execution-receipt-v1.mjs";
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
  applyRulesV1Action,
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  auditRulesV1SteamrollerScenarioTerrainSetup,
  closestPointDistanceIn,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  scoreScenarioElements,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";

export const WARMACHINE_MATCHUP_SIMULTANEOUS_TERMINAL_TASK_MATERIALIZER_V1_SCHEMA =
  "warmachine_matchup_simultaneous_terminal_task_materializer_v1";

const GOAL_FAMILY = "simultaneous_leader_tiebreak";
const TERMINAL_CLASS = "simultaneous_leader_tiebreak";
const ACTION_CATEGORY = "single_simultaneous_resolution_window";
const CURRENT_EXECUTION_RECEIPT = buildWarmachineCompositeExecutionReceiptV1({
  hostReceipt: warmachineHost.receipt,
  constructionHostReceipt: warmachineConstructionHost.receipt,
  focusedEngineReceipt: warmachineHost.focusedSourceReceipt,
});
const SUPPORTED_TASK_KEYS = new Set([
  "matchup-terminal-task-d5a87e643ed695dd51046193317fb95c",
  "matchup-terminal-task-316a75bb7ece185b5458788391efe0e2",
  "matchup-terminal-task-ad6248b170f3f21ac4c3be49b26b70bb",
  "matchup-terminal-task-5a609d19d9aa221dc9f4be5803217f15",
  "matchup-terminal-task-a2fdf0b760eab169a953414b22e744e7",
  "matchup-terminal-task-6517af440b1179e5ebb03da3b4095d8e",
  "matchup-terminal-task-f69320a22ec69c23abba2876e5a02cbe",
  "matchup-terminal-task-d3eddbffd6f093feebd6b96874a7c54b",
  "matchup-terminal-task-891d34d003b0c212e65c9ceda3a35225",
  "matchup-terminal-task-45a743bb2473cb032c0e33bc1469b994",
  "matchup-terminal-task-f4b010deae4d462a232948edac2e9028",
  "matchup-terminal-task-66e60897f2b884020789e78c29216404",
  "matchup-terminal-task-b864ada1c5480bf44dfd6991ff4d6628",
]);
const TOXIC_SPITTLE_PROFILE_KEY = "e1b2dda1-a26e-482a-94f0-e335a30dfaa3";
const WOLVES_EXPERIMENTAL_WARHEAD_TASK_KEY =
  "matchup-terminal-task-f69320a22ec69c23abba2876e5a02cbe";
const GORMAN_EXPERIMENTAL_WARHEAD_TASK_KEYS = new Set([
  WOLVES_EXPERIMENTAL_WARHEAD_TASK_KEY,
  "matchup-terminal-task-d3eddbffd6f093feebd6b96874a7c54b",
  "matchup-terminal-task-891d34d003b0c212e65c9ceda3a35225",
  "matchup-terminal-task-45a743bb2473cb032c0e33bc1469b994",
  "matchup-terminal-task-f4b010deae4d462a232948edac2e9028",
  "matchup-terminal-task-66e60897f2b884020789e78c29216404",
  "matchup-terminal-task-b864ada1c5480bf44dfd6991ff4d6628",
]);
const GORMAN_CARD_ID = "0fbf5dd3-387b-41e8-8064-dd87d42b8519";
const SEPSIRA_CARD_ID = "c0053f2b-1ee9-493a-80c7-05d7156ae019";
const RAPTOR_CARD_ID = "77790edd-443e-429b-9ff5-010c00dd1cc1";
const EXCARNATE_SOURCE_ID = "4f023171-2883-4306-a19a-06e83a9004ec";
const CHANNELED_EXCARNATE_ACTION_TYPE =
  "boosted_hit_damage_channeled_offensive_spell";
const EXPERIMENTAL_BOMB_LAUNCHER_SOURCE_WEAPON_ID =
  "6ff210f9-b632-407a-83b3-0a6a86b057c7";
const MECHANITHRALL_SWARM_CARD_ID =
  "e1cb65eb-6d1b-419f-a6c1-ba7a7c332e2b";
const LESSER_ELDRITCH_CARD_ID = "341ea5e5-18ec-4663-84c7-dad04a9fc3d7";
const CENTER_OBJECTIVE_KEY = "center-50";
const PRESENCE_OBJECTIVE_KEY = "right-40";
const WOLVES_PLAYER1_OBJECTIVE_KEY = "p1-40";
const WOLVES_PLAYER2_SCENARIO_TERRAIN_KEY = "p2-wolves-terrain";
const GORMAN_MODEL_BLOCKER_KEY =
  "matchup-simultaneous-terminal-gorman-model-blocker";
const GORMAN_TERRAIN_BLOCKER_KEY =
  "matchup-simultaneous-terminal-gorman-los-obstruction";
const SIDE_KEY_BY_TASK_SIDE = Object.freeze({
  subject: "player1",
  challenger: "player2",
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function boxesRemaining(piece = {}) {
  return numeric(piece.damage?.boxesRemaining ?? piece.boxesRemaining, 0);
}

function maximumBoxes(piece = {}) {
  return numeric(piece.damage?.maxBoxes ?? piece.maxBoxes, 0);
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
      throw new Error(`simultaneous_terminal_task_${role}_side_binding_mismatch`);
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
    throw new Error("simultaneous_terminal_task_execution_envelope_hash_invalid");
  }
  const identity = taskIdentity(task);
  if (task.taskKey !==
      `matchup-terminal-task-${stableGraphHash(identity).slice(0, 32)}`) {
    throw new Error("simultaneous_terminal_task_identity_hash_invalid");
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
      "simultaneous_terminal_task_host_or_construction_receipt_drift",
    );
  }
  const terminal = taskTerminal(task);
  if (task.executionEnvelope?.actorAxis?.taskSideKey !==
        terminal.endingTaskSideKey ||
      terminal.causalActionFamily !== ACTION_CATEGORY ||
      terminal.resultKind !== "win") {
    throw new Error("simultaneous_terminal_task_action_role_binding_mismatch");
  }
  return terminal;
}

function validateEvidenceCorpus(evidenceCorpus = {}, representative = {}) {
  const cacheCore = { ...evidenceCorpus };
  const cacheHash = String(cacheCore.cacheHash || "");
  delete cacheCore.cacheHash;
  if (!cacheHash || stableGraphHash(cacheCore) !== cacheHash) {
    throw new Error("simultaneous_terminal_task_evidence_cache_hash_invalid");
  }
  if (evidenceCorpus.hostReceiptHash !== warmachineHost.receipt.receiptHash ||
      evidenceCorpus.corpus?.hostReceiptHash !==
        warmachineHost.receipt.receiptHash) {
    throw new Error("simultaneous_terminal_task_evidence_host_receipt_drift");
  }
  if (evidenceCorpus.evidenceCorpus?.corpusHash !==
      evidenceCorpus.corpus?.corpusHash ||
      evidenceCorpus.evidenceCorpus?.representativeSelectionHash !==
        evidenceCorpus.representativeSelection?.selectionHash) {
    throw new Error(
      "simultaneous_terminal_task_evidence_internal_binding_mismatch",
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
      "simultaneous_terminal_task_representative_selection_mismatch",
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
    throw new Error("simultaneous_terminal_task_corpus_cell_mismatch");
  }
  for (const [partitionKey, value] of Object.entries(
    representative.coordinates || {},
  )) {
    if (!cell.partitions?.[partitionKey]?.includes(value)) {
      throw new Error(
        `simultaneous_terminal_task_partition_outside_cell:${partitionKey}:${value}`,
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
    throw new Error("simultaneous_terminal_task_opening_binding_mismatch");
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
    throw new Error(
      "simultaneous_terminal_task_plan_or_routing_binding_mismatch",
    );
  }
}

function exactSupportedCoordinates(representative = {}) {
  const coordinates = representative.coordinates || {};
  return representative.terminalClassKey === TERMINAL_CLASS &&
    representative.scenarioKey === "high_stakes" &&
    Number(representative.roundNumber) === 7 &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.causalActionFamily === ACTION_CATEGORY &&
    representative.canonicalTerminal?.resultKind === "win" &&
    coordinates.actionRange === "strictly_inside" &&
    coordinates.baseTopology === "legal_separated" &&
    coordinates.damage === "critical_models_undamaged" &&
    coordinates.highStakesBlastClosure === "no_detonation" &&
    coordinates.highStakesCountdownState === "one_nonzero_element_reduced" &&
    coordinates.highStakesFuseResolution === "secured_50mm_remove_one" &&
    coordinates.leaderControl === "strictly_inside" &&
    coordinates.lifecycle === "both_rosters_complete" &&
    coordinates.lineOfSight === "clear" &&
    coordinates.resource === "one_additional_purchase_available" &&
    coordinates.scenarioTerrainSetup ===
      "all_flags_fallback_no_valid_terrain";
}

function pressurePointSprayFilterCoordinates(representative = {}) {
  const coordinates = representative.coordinates || {};
  const supportedCombination = [
    "both_rosters_complete|clear|strictly_inside",
    "both_rosters_complete|model_blocked|strictly_inside",
    "loser_prior_losses|clear|strictly_inside",
    "both_rosters_complete|terrain_blocked|strictly_inside",
    "both_rosters_complete|clear|on_boundary",
  ].includes([
    coordinates.lifecycle,
    coordinates.lineOfSight,
    coordinates.actionRange,
  ].join("|"));
  return representative.terminalClassKey === TERMINAL_CLASS &&
    representative.scenarioKey === "pressure_point" &&
    Number(representative.roundNumber) === 6 &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.causalActionFamily === ACTION_CATEGORY &&
    representative.canonicalTerminal?.resultKind === "win" &&
    coordinates.baseTopology === "legal_separated" &&
    coordinates.damage === "critical_models_undamaged" &&
    coordinates.leaderControl === "strictly_inside" &&
    [
      "zero_available",
      "controller_transfer_or_channel_available",
    ].includes(coordinates.resource) &&
    coordinates.scenarioTerrainSetup ===
      "all_flags_fallback_no_valid_terrain" &&
    supportedCombination;
}

function wolvesExperimentalWarheadCoordinates(representative = {}) {
  const coordinates = representative.coordinates || {};
  return representative.terminalClassKey === TERMINAL_CLASS &&
    representative.scenarioKey === "wolves_at_our_heels" &&
    Number(representative.roundNumber) === 4 &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.causalActionFamily === ACTION_CATEGORY &&
    representative.canonicalTerminal?.resultKind === "win" &&
    coordinates.actionRange === "strictly_inside" &&
    coordinates.baseTopology === "legal_separated" &&
    coordinates.damage === "leader_at_terminal_threshold" &&
    coordinates.leaderControl === "strictly_inside" &&
    coordinates.lifecycle === "both_rosters_complete" &&
    coordinates.lineOfSight === "clear" &&
    coordinates.resource === "zero_available" &&
    coordinates.scenarioTerrainSetup ===
      "all_flags_fallback_no_valid_terrain" &&
    coordinates.wolvesObjectiveMove === "move_not_triggered" &&
    coordinates.wolvesProgressState ===
      "at_least_one_objective_at_two" &&
    coordinates.wolvesTokenDecision === "eligible_add_token_declined";
}

function gormanExperimentalWarheadFilterCoordinates(representative = {}) {
  const coordinates = representative.coordinates || {};
  const common = representative.terminalClassKey === TERMINAL_CLASS &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.causalActionFamily === ACTION_CATEGORY &&
    representative.canonicalTerminal?.resultKind === "win" &&
    coordinates.actionRange === "strictly_inside" &&
    coordinates.baseTopology === "legal_separated" &&
    coordinates.damage === "critical_models_undamaged" &&
    coordinates.leaderControl === "strictly_inside" &&
    coordinates.scenarioTerrainSetup ===
      "all_flags_fallback_no_valid_terrain";
  if (!common) return false;
  if (representative.scenarioKey === "wolves_at_our_heels") {
    return Number(representative.roundNumber) === 4 &&
      coordinates.lifecycle === "both_rosters_complete" &&
      coordinates.lineOfSight === "terrain_blocked" &&
      coordinates.resource === "zero_available" &&
      coordinates.wolvesObjectiveMove === "move_not_triggered" &&
      coordinates.wolvesProgressState ===
        "at_least_one_objective_at_two" &&
      coordinates.wolvesTokenDecision === "eligible_add_token_declined";
  }
  if (representative.scenarioKey === "two_fronts") {
    return Number(representative.roundNumber) === 5 &&
      coordinates.lineOfSight === "clear" && [
        "both_rosters_complete|one_additional_purchase_available",
        "removed_from_play_history|zero_available",
        "both_rosters_complete|controller_transfer_or_channel_available",
      ].includes(`${coordinates.lifecycle}|${coordinates.resource}`);
  }
  return representative.scenarioKey === "trench_warfare" &&
    Number(representative.roundNumber) === 3 &&
    coordinates.lifecycle === "both_rosters_complete" &&
    coordinates.resource === "zero_available" &&
    coordinates.trenchCacheLifecycle === "both_caches_active" && [
      "model_blocked",
      "stealth_blocks_beyond_five",
    ].includes(coordinates.lineOfSight);
}

function mappedHostRepresentative(task = {}, terminal = {}, cell = {},
  evidenceCorpus = {}) {
  const representative = task.representative || {};
  const hostCell = (evidenceCorpus.corpus?.cells || []).find((candidate) =>
    candidate.scenarioKey === representative.scenarioKey &&
    candidate.terminalClassKey === TERMINAL_CLASS &&
    candidate.causalActionFamily === ACTION_CATEGORY &&
    candidate.resultKind === terminal.resultKind &&
    candidate.attackerSideKey === terminal.attackerSideKey &&
    candidate.defenderSideKey === terminal.defenderSideKey &&
    candidate.endingSideKey === terminal.endingSideKey &&
    candidate.winnerSideKey === terminal.winnerSideKey &&
    candidate.loserSideKey === terminal.loserSideKey &&
    candidate.tiebreakClassKey === cell.tiebreakClassKey &&
    candidate.roundClass?.exactRoundNumber === true &&
    Number(candidate.roundClass?.representativeRoundNumber) ===
      Number(representative.roundNumber));
  if (!hostCell) return null;
  return stableGraphValue({
    ...representative,
    cellKey: hostCell.cellKey,
    subcellKey: warmachineSteamrollerTerminalScenarioSubcellKeyV1(
      hostCell,
      representative.coordinates,
    ),
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

function representativeMappingAudit(task = {}, terminal = {}, sourceCell = {},
  hostRepresentative = {}) {
  const representative = task.representative || {};
  const core = stableGraphValue({
    taskRepresentativeCellKey: representative.cellKey,
    taskRepresentativeSubcellKey: representative.subcellKey,
    hostRepresentativeCellKey: hostRepresentative.cellKey,
    hostRepresentativeSubcellKey: hostRepresentative.subcellKey,
    sidePermutationKey: task.sidePermutationKey,
    roleMapping: terminal,
    tiebreakClassKey: sourceCell.tiebreakClassKey,
    taskPartitionCoordinatesHash: stableGraphHash(
      representative.coordinates || {},
    ),
    hostPartitionCoordinatesHash: stableGraphHash(
      hostRepresentative.coordinates || {},
    ),
    exactPartitionMappingProven:
      stableGraphHash(representative.coordinates || {}) ===
        stableGraphHash(hostRepresentative.coordinates || {}) &&
      Boolean(hostRepresentative.cellKey) &&
      Boolean(hostRepresentative.subcellKey),
  });
  return stableGraphValue({ ...core, mappingAuditHash: stableGraphHash(core) });
}

function sealedReport(task = {}, opening = {}, disposition = {}, detail = {}) {
  const core = stableGraphValue({
    schemaVersion:
      WARMACHINE_MATCHUP_SIMULTANEOUS_TERMINAL_TASK_MATERIALIZER_V1_SCHEMA,
    terminalRootKind: "simultaneous_leader_tiebreak",
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
      "This task-specific artifact proves a current-Host strict execution and independent replay for the complete production roster, then filters only the exact representative because its full-health partition cannot reach simultaneous Leader removal through the witnessed POW 10 spray. It is not a Host rejection, family-level unreachability, deployment route, strategy result, win rate or training truth.",
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

function strictRejected(task, opening, reason, evidence = {}) {
  return {
    report: sealedReport(task, opening, {
      disposition: "strict_rejected",
      authority: "rules_v1_host",
      reason,
      strictRulesConclusion: true,
      claimBoundary: "The current rules-v1 Host rejected this exact task-bound action candidate. This is an exact Host rejection for one complete-roster state, not a family-level unreachability or strategy conclusion.",
    }, { hostRejectionEvidence: stableGraphValue(evidence) }),
    runtime: null,
  };
}

function proposalFiltered(task, opening, reason, evidence = {}, runtime = null) {
  return {
    report: sealedReport(task, opening, {
      disposition: "proposal_filtered",
      authority: "search_relation",
      reason,
      claimBoundary: evidence.claimBoundary || "",
    }, {
      strictActionReplayCertified:
        evidence.strictActionReplayCertified === true,
      completeRealRosterState: evidence.completeRealRosterState === true,
      modelCount: Number(evidence.modelCount || 0),
      partitionAudit: evidence.partitionAudit || null,
      representativeMappingAudit:
        evidence.representativeMappingAudit || null,
      candidateFilterEvidence: stableGraphValue(evidence),
    }),
    runtime,
  };
}

function strictMaterialized(task, opening, root = {}, runtime = null) {
  return {
    report: sealedReport(task, opening, {
      disposition: "strict_materialized",
      authority: "rules_v1_host",
      reason:
        "simultaneous_terminal_wolves_experimental_warhead_strictly_materialized",
      strictRulesConclusion: true,
      claimBoundary: "This task-specific artifact proves one exact complete-roster Wolves at Our Heels simultaneous Leader-removal transition under the current rules-v1 Host and an independent replay. It preserves explicit Shield Guard decline and Wolves token decisions, ties final VP, and resolves the declared winner through exact scenario presence. It does not prove a route from deployment, opponent-response closure, natural probability, strategy value, win rate, exhaustive family coverage or training truth.",
    }, {
      strictActionReplayCertified: true,
      completeRealRosterState: root.completeRealRosterState === true,
      modelCount: Number(root.modelCount || 0),
      partitionAudit: root.partitionAudit || null,
      representativeMappingAudit:
        root.representativeMappingAudit || null,
      root: stableGraphValue(root),
    }),
    runtime,
  };
}

function zeroNativeResources(piece = {}) {
  piece.resourcePoints = 0;
  for (const field of [
    "resource2", "focus", "focusPoints", "fury", "furyPoints",
  ]) {
    if (field in piece) piece[field] = 0;
  }
}

function setOneFocus(piece = {}) {
  piece.resourcePoints = 1;
  for (const field of ["resource2", "focus", "focusPoints"]) {
    if (field in piece) piece[field] = 1;
  }
}

function markPriorLoss(piece = {}) {
  piece.damage = { ...(piece.damage || {}), boxesRemaining: 0 };
  if ("boxesRemaining" in piece) piece.boxesRemaining = 0;
  piece.destroyed = true;
  piece.destroyedTriggerOccurred = true;
  piece.removedFromPlay = false;
  piece.offTable = true;
  piece.notDeployed = true;
  piece.disabled = false;
  piece.boxed = false;
  piece.damageLifecycleStage = "destroyed";
  piece.activated = false;
  piece.activationKey = "";
  piece.statusTags = [...new Set([
    ...(piece.statusTags || []),
    "destroyed",
    "off_table",
    "not_deployed",
  ])].sort();
}

function markRemovedFromPlayHistory(piece = {}) {
  markPriorLoss(piece);
  piece.removedFromPlay = true;
  piece.damageLifecycleStage = "removed_from_play";
  piece.statusTags = [...new Set([
    ...(piece.statusTags || []),
    "removed_from_play",
  ])].sort();
}

function toxicSpittleProfile(piece = {}) {
  return [...(piece.attackProfiles || []), ...(piece.weaponProfiles || [])]
    .find((profile) => String(profile.profileKey || "") ===
      TOXIC_SPITTLE_PROFILE_KEY) || null;
}

function strictLosClearEvidence(action = {}) {
  const check = (action.legality?.checks || []).find((row) =>
    String(row.code || "").startsWith("STRICT_RANGED_LOS_") &&
    row.hasClearLine === true && Number(row.blockedLineCount || 0) === 0);
  return check ? stableGraphValue({
    actionKey: action.actionKey,
    code: check.code,
    marker: check.marker,
    geometryModel: check.geometryModel,
    sampleLineCount: Number(check.sampleLineCount || 0),
    clearLineCount: Number(check.clearLineCount || 0),
    blockedLineCount: Number(check.blockedLineCount || 0),
    hasClearLine: true,
    blockerKeys: check.blockerKeys || [],
  }) : null;
}

function sprayModelLosOverrideEvidence(action = {}) {
  const effect = (action.metadata?.specialRuleAnalysis?.effects || []).find((row) =>
    row.effectType === "spray_ignore_intervening_model_los" &&
    row.evidence?.ignoresInterveningModels === true &&
    row.evidence?.ignoredBlockerPieceKey);
  return effect ? stableGraphValue({
    actionKey: action.actionKey,
    actionType: action.actionType,
    actorPieceKey: action.actorPieceKey,
    targetPieceKey: action.targetPieceKey,
    attackProfileKey: action.metadata?.attackProfile?.profileKey || "",
    ruleKey: effect.ruleKey,
    effectType: effect.effectType,
    marker: effect.evidence.marker,
    ignoredBlockerPieceKey: effect.evidence.ignoredBlockerPieceKey,
    ignoresInterveningModels: true,
    ignoresTerrainLineOfSight: effect.evidence.ignoresTerrainLineOfSight === true,
    modelBlockerKeys: effect.evidence.losGeometry?.modelBlockerKeys || [],
    blockerEvaluations: effect.evidence.losGeometry?.blockerEvaluations || [],
    losGeometry: effect.evidence.losGeometry || null,
  }) : null;
}

function terrainLosRejectionEvidence(rejected = {}) {
  const effect = (rejected.metadata?.specialRuleAnalysis?.effects || []).find((row) =>
    row.status === "blocked" && row.effectType === "line_of_sight_blocked" &&
    row.evidence?.terrainKey);
  return effect ? stableGraphValue({
    actionKey: rejected.actionKey,
    actionType: rejected.actionType,
    actorPieceKey: rejected.actorPieceKey,
    targetPieceKey: rejected.targetPieceKey,
    attackProfileKey: rejected.metadata?.attackProfile?.profileKey || "",
    ruleKey: effect.ruleKey,
    effectType: effect.effectType,
    marker: effect.evidence.marker,
    terrainKey: effect.evidence.terrainKey,
    terrainType: effect.evidence.terrainType,
    losGeometry: effect.evidence.losGeometry || null,
  }) : null;
}

function modelLosRejectionEvidence(rejected = {}) {
  const effect = (rejected.metadata?.specialRuleAnalysis?.effects || []).find(
    (row) => row.status === "blocked" &&
      row.effectType === "line_of_sight_blocked" &&
      (row.evidence?.losGeometry?.modelBlockerKeys || []).length > 0,
  );
  const rejectionEvidence = rejected.rejection?.evidence || {};
  const losGeometry = effect?.evidence?.losGeometry ||
    rejectionEvidence.losGeometry || null;
  const modelBlockerKeys = losGeometry?.modelBlockerKeys ||
    rejectionEvidence.modelBlockerKeys ||
    [rejectionEvidence.blockerPieceKey].filter(Boolean);
  if (!effect && !modelBlockerKeys.length) return null;
  return stableGraphValue({
    actionKey: rejected.actionKey,
    actionType: rejected.actionType,
    actorPieceKey: rejected.actorPieceKey,
    targetPieceKey: rejected.targetPieceKey,
    attackProfileKey: rejected.metadata?.attackProfile?.profileKey || "",
    ruleKey: effect?.ruleKey || rejectionEvidence.ruleKey || "",
    effectType: effect?.effectType || "line_of_sight_blocked",
    marker: effect?.evidence?.marker || rejectionEvidence.marker || "",
    blockerPieceKey: rejectionEvidence.blockerPieceKey ||
      modelBlockerKeys[0] || "",
    modelBlockerKeys,
    blockerEvaluations: losGeometry?.blockerEvaluations || [],
    losGeometry,
  });
}

function placePresenceUnit(state = {}, sideKey = "") {
  const objective = (state.scenario?.objectives || []).find((row) =>
    row.objectiveKey === PRESENCE_OBJECTIVE_KEY);
  const groups = new Map();
  for (const piece of state.pieces || []) {
    if (piece.sideKey !== sideKey || !piece.unitGroupId) continue;
    const members = groups.get(piece.unitGroupId) || [];
    members.push(piece);
    groups.set(piece.unitGroupId, members);
  }
  const selected = [...groups.entries()].filter(([, members]) =>
    members.length >= 3).sort(([left], [right]) =>
    Number(!/the_last_watch/i.test(left)) -
      Number(!/the_last_watch/i.test(right)) || left.localeCompare(right))[0];
  if (!objective || !selected) return null;
  const [unitGroupId, members] = selected;
  const radiusIn = 1.7;
  const sorted = [...members].sort((left, right) =>
    String(left.pieceKey).localeCompare(String(right.pieceKey)));
  for (const [index, member] of sorted.entries()) {
    const angle = (Math.PI * 2 * index) / sorted.length;
    member.position = {
      xIn: Number(objective.xIn) + Math.cos(angle) * radiusIn,
      yIn: Number(objective.yIn) + Math.sin(angle) * radiusIn,
    };
  }
  return stableGraphValue({
    objectiveKey: objective.objectiveKey,
    unitGroupId,
    pieceKeys: sorted.map((piece) => piece.pieceKey),
  });
}

function scenarioFuseElements(state = {}) {
  return [
    ...(state.scenario?.objectives || []),
    ...(state.terrain || []).filter((terrain) =>
      terrain.isScenarioTerrain === true ||
      terrain.scenarioTerrain === true ||
      terrain.scenarioElement === true),
  ];
}

function authorSprayState(opening = {}, representative = {}, terminal = {}, task = {}) {
  const coordinates = representative.coordinates || {};
  let state = structuredClone(opening.state);
  state.turnNumber = Number(representative.roundNumber);
  state.activeSideKey = terminal.endingSideKey;
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
  state.scenario.score = representative.scenarioKey === "high_stakes"
    ? { player1: 0, player2: 0 }
    : {
      player1: terminal.winnerSideKey === "player1" ? 1 : 0,
      player2: terminal.winnerSideKey === "player2" ? 1 : 0,
    };
  state.scenario.scoringHistory = [];
  if (representative.scenarioKey === "high_stakes") {
    for (const objective of state.scenario.objectives || []) {
      objective.countdownTokens = objective.objectiveKey === CENTER_OBJECTIVE_KEY
        ? 4 : 5;
      objective.countdownDetonated = false;
    }
    for (const terrain of state.terrain || []) {
      if (terrain.isScenarioTerrain === true ||
          terrain.scenarioTerrain === true ||
          terrain.scenarioElement === true) {
        terrain.countdownTokens = 5;
        terrain.countdownDetonated = false;
      }
    }
  }
  for (const piece of state.pieces || []) {
    piece.activated = true;
    piece.activationKey = "";
    zeroNativeResources(piece);
  }
  const allowedActorCardIds = new Set((
    task.executionEnvelope?.actorAxis?.candidates || []
  ).map((row) => String(row.cardId || "")).filter(Boolean));
  const actor = (state.pieces || []).filter((piece) =>
    piece.sideKey === terminal.endingSideKey &&
    /strygon/i.test(`${piece.pieceKey} ${piece.cardName || ""}`) &&
    (!allowedActorCardIds.size || allowedActorCardIds.has(pieceCardId(piece))))
    .sort((left, right) => String(left.pieceKey).localeCompare(
      String(right.pieceKey),
    ))[0];
  const friendlyLeader = (state.pieces || []).find((piece) =>
    piece.sideKey === terminal.endingSideKey && leaderLike(piece));
  const enemyLeader = (state.pieces || []).find((piece) =>
    piece.sideKey !== terminal.endingSideKey && leaderLike(piece));
  const focusCarrier = coordinates.resource ===
      "one_additional_purchase_available"
    ? (state.pieces || []).filter((piece) =>
      piece.isWarjack === true && resourceMaximum(piece) >= 1)
      .sort((left, right) => String(left.pieceKey).localeCompare(
        String(right.pieceKey),
      ))[0]
    : null;
  const presenceUnit = representative.scenarioKey === "high_stakes"
    ? placePresenceUnit(state, terminal.winnerSideKey)
    : null;
  if (!actor || !friendlyLeader || !enemyLeader ||
      (coordinates.resource === "one_additional_purchase_available" &&
        !focusCarrier) ||
      (representative.scenarioKey === "high_stakes" && !presenceUnit)) {
    return { reason: "simultaneous_terminal_exact_carrier_missing" };
  }
  const attackProfile = toxicSpittleProfile(actor);
  if (!attackProfile) {
    return { reason: "simultaneous_terminal_toxic_spittle_profile_missing" };
  }
  const priorLossPieceKeys = [];
  if (coordinates.lifecycle === "loser_prior_losses") {
    const priorLoss = (state.pieces || []).filter((piece) =>
      piece.sideKey === terminal.loserSideKey && !leaderLike(piece) &&
      piece.pieceKey !== actor.pieceKey && warmachinePieceInPlayV1(piece))
      .sort((left, right) =>
        Number(Boolean(left.unitGroupId || left.unitId)) -
          Number(Boolean(right.unitGroupId || right.unitId)) ||
        String(left.pieceKey).localeCompare(String(right.pieceKey)))[0];
    if (!priorLoss) {
      return { reason: "simultaneous_terminal_loser_prior_loss_piece_missing" };
    }
    markPriorLoss(priorLoss);
    priorLossPieceKeys.push(priorLoss.pieceKey);
  }
  actor.activated = false;
  actor.position = { xIn: 20, yIn: 22 };
  const actorRadius = numeric(
    actor.baseRadiusIn,
    numeric(actor.baseDiameterIn || actor.baseSizeIn, 1.2) / 2,
  );
  const targetRadius = numeric(
    enemyLeader.baseRadiusIn,
    numeric(enemyLeader.baseDiameterIn || enemyLeader.baseSizeIn, 1.2) / 2,
  );
  const targetCenterX = coordinates.actionRange === "on_boundary"
    ? actor.position.xIn + actorRadius + targetRadius +
      numeric(attackProfile.rangeIn, 0)
    : 28;
  enemyLeader.position = { xIn: targetCenterX, yIn: 22 };
  const friendlyLeaderLineFraction = coordinates.lineOfSight === "model_blocked"
    ? 0.45 : 0.7;
  friendlyLeader.position = {
    xIn: actor.position.xIn +
      (targetCenterX - actor.position.xIn) * friendlyLeaderLineFraction,
    yIn: 22,
  };
  let authoredModelBlocker = null;
  if (coordinates.lineOfSight === "model_blocked") {
    authoredModelBlocker = (state.pieces || []).filter((piece) =>
      !leaderLike(piece) && piece.pieceKey !== actor.pieceKey &&
      warmachinePieceInPlayV1(piece) &&
      !(piece.unitGroupId || piece.unitId))
      .sort((left, right) =>
        numeric(right.baseRadiusIn,
          numeric(right.baseDiameterIn || right.baseSizeIn, 1.2) / 2) -
        numeric(left.baseRadiusIn,
          numeric(left.baseDiameterIn || left.baseSizeIn, 1.2) / 2) ||
        String(left.pieceKey).localeCompare(String(right.pieceKey)))[0];
    if (!authoredModelBlocker) {
      return { reason: "simultaneous_terminal_model_blocker_missing" };
    }
    const blockerRadius = numeric(
      authoredModelBlocker.baseRadiusIn,
      numeric(
        authoredModelBlocker.baseDiameterIn || authoredModelBlocker.baseSizeIn,
        1.2,
      ) / 2,
    );
    authoredModelBlocker.position = {
      xIn: targetCenterX - targetRadius - blockerRadius - 0.05,
      yIn: 22,
    };
  }
  const authoredTerrainBlockerKey =
    "matchup-simultaneous-terminal-los-obstruction";
  if (coordinates.lineOfSight === "terrain_blocked") {
    state.terrain = [...(state.terrain || []), {
      terrainKey: authoredTerrainBlockerKey,
      type: "obstruction",
      xIn: actor.position.xIn + (targetCenterX - actor.position.xIn) * 0.35,
      yIn: 22,
      widthIn: 1,
      heightIn: 4,
      rotationDegrees: 0,
      blocksLineOfSight: true,
      blocksMovement: false,
      exactWithinScope: true,
      strictGeometryRelevant: true,
      geometryExactWithinScope: true,
    }];
  }
  if (focusCarrier) setOneFocus(focusCarrier);
  state = normalizeRulesV1State(state);
  const normalizedActor = state.pieces.find((piece) =>
    piece.pieceKey === actor.pieceKey);
  const normalizedFriendlyLeader = state.pieces.find((piece) =>
    piece.pieceKey === friendlyLeader.pieceKey);
  const normalizedEnemyLeader = state.pieces.find((piece) =>
    piece.pieceKey === enemyLeader.pieceKey);
  const normalizedFocusCarrier = focusCarrier
    ? state.pieces.find((piece) => piece.pieceKey === focusCarrier.pieceKey)
    : null;
  const normalizedModelBlocker = authoredModelBlocker
    ? state.pieces.find((piece) =>
      piece.pieceKey === authoredModelBlocker.pieceKey)
    : null;
  const enumeration = enumerateRulesV1Actions(state, {
    actorPieceKeys: [normalizedActor.pieceKey],
    targetPieceKeys: [normalizedEnemyLeader.pieceKey],
    actionFamilyKeys: ["attack_or_effect"],
    includeActorlessActions: false,
    includeUntargetedActions: false,
  });
  const action = (enumeration.actions || []).find((candidate) =>
    candidate.actionType === "ranged_attack" &&
    candidate.actorPieceKey === normalizedActor.pieceKey &&
    candidate.targetPieceKey === normalizedEnemyLeader.pieceKey &&
    candidate.metadata?.attackProfile?.profileKey ===
      TOXIC_SPITTLE_PROFILE_KEY);
  const hostRejection = (enumeration.rejectedActions || []).find((candidate) =>
    candidate.actionType === "ranged_attack" &&
    candidate.actorPieceKey === normalizedActor.pieceKey &&
    candidate.targetPieceKey === normalizedEnemyLeader.pieceKey &&
    candidate.metadata?.attackProfile?.profileKey ===
      TOXIC_SPITTLE_PROFILE_KEY) || null;
  const placementAudit = auditRulesV1StaticPlacement(state);
  const formationAudit = auditRulesV1StaticUnitFormation(state);
  const terrainAudit = auditRulesV1SteamrollerScenarioTerrainSetup(state);
  const controlReport = scoreScenarioElements(state);
  const centerControl = (controlReport.objectiveControl || []).find((row) =>
    String(row.elementKey || row.objectiveKey || "") ===
      CENTER_OBJECTIVE_KEY);
  const presenceControl = (controlReport.objectiveControl || []).find((row) =>
    String(row.elementKey || row.objectiveKey || "") ===
      PRESENCE_OBJECTIVE_KEY);
  const losEvidence = coordinates.lineOfSight === "model_blocked"
    ? sprayModelLosOverrideEvidence(action || {})
    : coordinates.lineOfSight === "terrain_blocked"
      ? terrainLosRejectionEvidence(hostRejection || {})
      : strictLosClearEvidence(action || {});
  const controllerPiece = state.pieces.find((piece) =>
    piece.pieceKey === normalizedActor.controllerPieceKey);
  const controllerRouteEvidence = stableGraphValue({
    routeKind: "warbeast_controller_force_route",
    actorPieceKey: normalizedActor.pieceKey,
    actorIsWarbeast: normalizedActor.isWarbeast === true,
    actorResource: resourceValue(normalizedActor),
    actorResourceMaximum: resourceMaximum(normalizedActor),
    actorHasForceCapacity:
      resourceValue(normalizedActor) < resourceMaximum(normalizedActor),
    controllerPieceKey: String(normalizedActor.controllerPieceKey || ""),
    expectedControllerPieceKey: normalizedFriendlyLeader.pieceKey,
    controllerIsFriendlyLeader:
      normalizedActor.controllerPieceKey === normalizedFriendlyLeader.pieceKey,
    actorBattlegroupId: String(normalizedActor.battlegroupId || ""),
    controllerBattlegroupId: String(controllerPiece?.battlegroupId || ""),
    battlegroupIdentityBound: Boolean(normalizedActor.battlegroupId) &&
      String(normalizedActor.battlegroupId).includes(
        normalizedFriendlyLeader.pieceKey,
      ) && controllerPiece?.pieceKey === normalizedFriendlyLeader.pieceKey,
    controllerDistanceIn: closestPointDistanceIn(
      normalizedActor,
      normalizedFriendlyLeader,
    ),
    controllerControlRangeIn: numeric(
      normalizedFriendlyLeader.controlRangeIn,
      0,
    ),
    controllerInControlRange: closestPointDistanceIn(
      normalizedActor,
      normalizedFriendlyLeader,
    ) < numeric(normalizedFriendlyLeader.controlRangeIn, 0),
  });
  return {
    executionKind: "strygon_spray_filter",
    state: enumeration.state,
    actor: normalizedActor,
    friendlyLeader: normalizedFriendlyLeader,
    enemyLeader: normalizedEnemyLeader,
    focusCarrier: normalizedFocusCarrier,
    priorLossPieceKeys,
    authoredModelBlocker: normalizedModelBlocker,
    authoredTerrainBlockerKey: coordinates.lineOfSight === "terrain_blocked"
      ? authoredTerrainBlockerKey
      : "",
    presenceUnit,
    enumeration,
    action,
    hostRejection,
    placementAudit,
    formationAudit,
    terrainAudit,
    centerControl,
    presenceControl,
    controlReportHash: stableGraphHash(controlReport),
    losEvidence,
    controllerRouteEvidence,
    geometry: stableGraphValue({
      actorPosition: normalizedActor.position,
      friendlyLeaderPosition: normalizedFriendlyLeader.position,
      enemyLeaderPosition: normalizedEnemyLeader.position,
      actorTargetEdgeDistanceIn: closestPointDistanceIn(
        normalizedActor,
        normalizedEnemyLeader,
      ),
      actorControllerEdgeDistanceIn: closestPointDistanceIn(
        normalizedActor,
        normalizedFriendlyLeader,
      ),
      attackRangeIn: numeric(attackProfile.rangeIn, 0),
      controllerControlRangeIn: numeric(
        normalizedFriendlyLeader.controlRangeIn,
        0,
      ),
    }),
  };
}

function setLeaderTerminalThreshold(piece = {}) {
  piece.damage = { ...(piece.damage || {}), boxesRemaining: 1 };
  if ("boxesRemaining" in piece) piece.boxesRemaining = 1;
}

function placeUnitRing(state = {}, unitGroupId = "", center = {}, radiusIn = 1.3) {
  const members = (state.pieces || []).filter((piece) =>
    piece.unitGroupId === unitGroupId).sort((left, right) =>
    String(left.pieceKey).localeCompare(String(right.pieceKey)));
  if (!members.length) return null;
  for (const [index, member] of members.entries()) {
    const angle = (Math.PI * 2 * index) / members.length;
    member.position = {
      xIn: numeric(center.xIn) + Math.cos(angle) * radiusIn,
      yIn: numeric(center.yIn) + Math.sin(angle) * radiusIn,
    };
  }
  return stableGraphValue({
    unitGroupId,
    pieceKeys: members.map((piece) => piece.pieceKey),
    center: { xIn: numeric(center.xIn), yIn: numeric(center.yIn) },
    radiusIn,
  });
}

function pieceHasRuleKey(piece = {}, ruleKey = "") {
  const expected = String(ruleKey || "").toLowerCase();
  return (piece.specialRules || []).some((rule) => {
    if (typeof rule === "string") return rule.toLowerCase() === expected;
    return [rule.ruleKey, rule.name].some((value) =>
      String(value || "").toLowerCase() === expected);
  });
}

function authorGormanExperimentalWarheadState(opening = {}, representative = {},
  terminal = {}, task = {}) {
  const coordinates = representative.coordinates || {};
  const strictTerminalRoot = task.taskKey ===
    WOLVES_EXPERIMENTAL_WARHEAD_TASK_KEY;
  let state = structuredClone(opening.state);
  state.turnNumber = Number(representative.roundNumber);
  state.activeSideKey = terminal.endingSideKey;
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
  state.scenario.score = representative.scenarioKey === "two_fronts"
    ? {
      player1: terminal.winnerSideKey === "player1" ? 1 : 0,
      player2: terminal.winnerSideKey === "player2" ? 1 : 0,
    }
    : { player1: 0, player2: 0 };
  state.scenario.scoringHistory = [];
  if (representative.scenarioKey === "wolves_at_our_heels") {
    state.scenario.scenarioState = {
      ...(state.scenario.scenarioState || {}),
      wolvesProgressGoalChecked: false,
    };
  }
  for (const piece of state.pieces || []) {
    piece.activated = true;
    piece.activationKey = "";
    zeroNativeResources(piece);
  }

  const allowedActorCardIds = new Set((
    task.executionEnvelope?.actorAxis?.candidates || []
  ).map((row) => String(row.cardId || "")).filter(Boolean));
  const actor = (state.pieces || []).find((piece) =>
    piece.sideKey === terminal.endingSideKey &&
    pieceCardId(piece) === GORMAN_CARD_ID &&
    (!allowedActorCardIds.size || allowedActorCardIds.has(pieceCardId(piece))));
  const friendlyLeader = (state.pieces || []).find((piece) =>
    piece.sideKey === terminal.endingSideKey && leaderLike(piece) &&
    pieceCardId(piece) === SEPSIRA_CARD_ID);
  const enemyLeader = (state.pieces || []).find((piece) =>
    piece.sideKey !== terminal.endingSideKey && leaderLike(piece));
  const needsScenarioPresence = [
    "wolves_at_our_heels",
    "trench_warfare",
  ].includes(representative.scenarioKey);
  const winnerObjective = needsScenarioPresence
    ? (state.scenario?.objectives || []).find((objective) =>
      Number(objective.baseSizeMm) === 40 &&
      objective.ownerSideKey === terminal.winnerSideKey &&
      (representative.scenarioKey !== "wolves_at_our_heels" ||
        objective.objectiveKey === WOLVES_PLAYER1_OBJECTIVE_KEY))
    : null;
  const loserScenarioTerrain = needsScenarioPresence
    ? (state.terrain || []).find((terrain) =>
      (terrain.ownerSideKey || terrain.sourceSideKey) ===
        terminal.loserSideKey &&
      (terrain.isScenarioTerrain === true ||
        terrain.scenarioTerrain === true ||
        terrain.scenarioElement === true) &&
      (representative.scenarioKey !== "wolves_at_our_heels" ||
        terrain.terrainKey === WOLVES_PLAYER2_SCENARIO_TERRAIN_KEY))
    : null;
  const presenceGroupId = [...new Set((state.pieces || []).filter((piece) =>
    piece.sideKey === terminal.winnerSideKey && piece.unitGroupId &&
    pieceCardId(piece) === MECHANITHRALL_SWARM_CARD_ID).map((piece) =>
    piece.unitGroupId))].sort()[0];
  const loserPresenceSolo = needsScenarioPresence
    ? (state.pieces || []).filter((piece) =>
      piece.sideKey === terminal.loserSideKey &&
      pieceCardId(piece) === LESSER_ELDRITCH_CARD_ID &&
      !piece.unitGroupId).sort((left, right) =>
      String(left.pieceKey).localeCompare(String(right.pieceKey)))[0]
    : null;
  if (!actor || !friendlyLeader || !enemyLeader ||
      (needsScenarioPresence && (!winnerObjective || !loserScenarioTerrain ||
        !presenceGroupId || !loserPresenceSolo))) {
    return { reason: "simultaneous_terminal_gorman_exact_carrier_missing" };
  }
  const sourceProfile = [...(actor.attackProfiles || []),
    ...(actor.weaponProfiles || [])].find((profile) =>
    String(profile.sourceWeaponId || profile.profileKey || "") ===
      EXPERIMENTAL_BOMB_LAUNCHER_SOURCE_WEAPON_ID);
  if (!sourceProfile) {
    return {
      reason:
        "simultaneous_terminal_wolves_experimental_bomb_launcher_missing",
    };
  }

  if (representative.scenarioKey === "wolves_at_our_heels") {
    for (const objective of state.scenario?.objectives || []) {
      if (Number(objective.baseSizeMm) === 40) {
        objective.progressTokens =
          objective.objectiveKey === winnerObjective.objectiveKey ? 2 : 0;
        objective.progressGoalScored = false;
      }
    }
  }
  const presenceUnit = needsScenarioPresence
    ? placeUnitRing(state, presenceGroupId, winnerObjective)
    : null;
  const priorLossPieceKeys = [];
  if (coordinates.lifecycle === "removed_from_play_history") {
    const priorRfp = (state.pieces || []).filter((piece) =>
      piece.sideKey === terminal.loserSideKey && !leaderLike(piece) &&
      warmachinePieceInPlayV1(piece) &&
      piece.pieceKey !== loserPresenceSolo?.pieceKey)
      .sort((left, right) =>
        Number(Boolean(left.unitGroupId || left.unitId)) -
          Number(Boolean(right.unitGroupId || right.unitId)) ||
        String(left.pieceKey).localeCompare(String(right.pieceKey)))[0];
    if (!priorRfp) {
      return { reason: "simultaneous_terminal_rfp_history_piece_missing" };
    }
    markRemovedFromPlayHistory(priorRfp);
    priorLossPieceKeys.push(priorRfp.pieceKey);
  }
  const focusCarrier = coordinates.resource ===
      "one_additional_purchase_available"
    ? (state.pieces || []).filter((piece) =>
      piece.sideKey === terminal.endingSideKey && piece.isWarjack === true &&
      resourceMaximum(piece) >= 1).sort((left, right) =>
      String(left.pieceKey).localeCompare(String(right.pieceKey)))[0]
    : null;
  const channeler = coordinates.resource ===
      "controller_transfer_or_channel_available"
    ? (state.pieces || []).filter((piece) =>
      piece.sideKey === terminal.endingSideKey &&
      pieceCardId(piece) === RAPTOR_CARD_ID &&
      warmachinePieceInPlayV1(piece)).sort((left, right) =>
      String(left.pieceKey).localeCompare(String(right.pieceKey)))[0]
    : null;
  if ((coordinates.resource === "one_additional_purchase_available" &&
        !focusCarrier) ||
      (coordinates.resource === "controller_transfer_or_channel_available" &&
        !channeler)) {
    return { reason: "simultaneous_terminal_exact_resource_carrier_missing" };
  }
  actor.activated = false;
  actor.position = {
    xIn: coordinates.lineOfSight === "stealth_blocks_beyond_five"
      ? 20.4 : 22.4,
    yIn: 8,
  };
  enemyLeader.position = { xIn: 28, yIn: 8 };
  friendlyLeader.position = { xIn: 28, yIn: 9.65 };
  if (strictTerminalRoot) {
    setLeaderTerminalThreshold(friendlyLeader);
    setLeaderTerminalThreshold(enemyLeader);
  }
  if (loserPresenceSolo) {
    loserPresenceSolo.position = {
      xIn: numeric(loserScenarioTerrain.xIn) + 2,
      yIn: numeric(loserScenarioTerrain.yIn),
    };
  }
  let authoredModelBlocker = null;
  if (coordinates.lineOfSight === "model_blocked") {
    authoredModelBlocker = (state.pieces || []).filter((piece) =>
      !leaderLike(piece) && !piece.unitGroupId &&
      piece.pieceKey !== actor.pieceKey &&
      piece.pieceKey !== channeler?.pieceKey &&
      piece.pieceKey !== loserPresenceSolo?.pieceKey &&
      warmachinePieceInPlayV1(piece)).sort((left, right) =>
      numeric(right.baseRadiusIn,
        numeric(right.baseDiameterIn || right.baseSizeIn, 1.2) / 2) -
      numeric(left.baseRadiusIn,
        numeric(left.baseDiameterIn || left.baseSizeIn, 1.2) / 2) ||
      String(left.pieceKey).localeCompare(String(right.pieceKey)))[0];
    if (!authoredModelBlocker) {
      return { reason: "simultaneous_terminal_model_blocker_missing" };
    }
    authoredModelBlocker.position = { xIn: 25.2, yIn: 8 };
    authoredModelBlocker.metadata = {
      ...(authoredModelBlocker.metadata || {}),
      authoredRelationKey: GORMAN_MODEL_BLOCKER_KEY,
    };
  }
  if (coordinates.lineOfSight === "terrain_blocked") {
    state.terrain = [...(state.terrain || []), {
      terrainKey: GORMAN_TERRAIN_BLOCKER_KEY,
      type: "obstruction",
      xIn: 24.3,
      yIn: 8,
      widthIn: 1,
      heightIn: 4,
      rotationDegrees: 0,
      blocksLineOfSight: true,
      blocksMovement: false,
      exactWithinScope: true,
      strictGeometryRelevant: true,
      geometryExactWithinScope: true,
    }];
  }
  if (focusCarrier) setOneFocus(focusCarrier);
  if (channeler) {
    friendlyLeader.activated = false;
    friendlyLeader.resourcePoints = 5;
    for (const field of ["resource2", "focus", "focusPoints"]) {
      if (field in friendlyLeader) friendlyLeader[field] = 5;
    }
    channeler.position = { xIn: 25, yIn: 13.5 };
  }

  state = normalizeRulesV1State(state);
  const normalizedActor = state.pieces.find((piece) =>
    piece.pieceKey === actor.pieceKey);
  const normalizedFriendlyLeader = state.pieces.find((piece) =>
    piece.pieceKey === friendlyLeader.pieceKey);
  const normalizedEnemyLeader = state.pieces.find((piece) =>
    piece.pieceKey === enemyLeader.pieceKey);
  const normalizedLoserPresenceSolo = state.pieces.find((piece) =>
    piece.pieceKey === loserPresenceSolo?.pieceKey) || null;
  const normalizedFocusCarrier = state.pieces.find((piece) =>
    piece.pieceKey === focusCarrier?.pieceKey) || null;
  const normalizedChanneler = state.pieces.find((piece) =>
    piece.pieceKey === channeler?.pieceKey) || null;
  const normalizedModelBlocker = state.pieces.find((piece) =>
    piece.pieceKey === authoredModelBlocker?.pieceKey) || null;
  const enumeration = enumerateRulesV1Actions(state, {
    actorPieceKeys: [normalizedActor.pieceKey],
    targetPieceKeys: [normalizedEnemyLeader.pieceKey],
    actionFamilyKeys: ["attack_or_effect"],
    includeActorlessActions: false,
    includeUntargetedActions: false,
  });
  const action = (enumeration.actions || []).find((candidate) =>
    candidate.actionType === "ranged_attack" &&
    candidate.actorPieceKey === normalizedActor.pieceKey &&
    candidate.targetPieceKey === normalizedEnemyLeader.pieceKey &&
    candidate.metadata?.attackProfile?.sourceWeaponId ===
      EXPERIMENTAL_BOMB_LAUNCHER_SOURCE_WEAPON_ID &&
    candidate.metadata?.attackProfile?.attackTypeChoice ===
      "experimental_warhead");
  const hostRejection = (enumeration.rejectedActions || []).find((candidate) =>
    candidate.actionType === "ranged_attack" &&
    candidate.actorPieceKey === normalizedActor.pieceKey &&
    candidate.targetPieceKey === normalizedEnemyLeader.pieceKey &&
    candidate.metadata?.attackProfile?.sourceWeaponId ===
      EXPERIMENTAL_BOMB_LAUNCHER_SOURCE_WEAPON_ID &&
    candidate.metadata?.attackProfile?.attackTypeChoice ===
      "experimental_warhead") || null;
  const placementAudit = auditRulesV1StaticPlacement(state);
  const formationAudit = auditRulesV1StaticUnitFormation(state);
  const terrainAudit = auditRulesV1SteamrollerScenarioTerrainSetup(state);
  const controlReport = scoreScenarioElements(state);
  const winnerObjectiveControl = (controlReport.objectiveControl || [])
    .find((row) => String(row.elementKey || row.objectiveKey || "") ===
      winnerObjective?.objectiveKey) || null;
  const loserTerrainControl = (controlReport.scenarioTerrainControl || [])
    .find((row) => String(row.elementKey || row.terrainKey || "") ===
      loserScenarioTerrain?.terrainKey) || null;
  const losEvidence = coordinates.lineOfSight === "terrain_blocked"
    ? terrainLosRejectionEvidence(hostRejection || {})
    : coordinates.lineOfSight === "model_blocked"
      ? modelLosRejectionEvidence(hostRejection || {})
      : strictLosClearEvidence(action || {});
  const aoeSecondaryTargetKeys = (action?.metadata?.aoeBlastTargets || [])
    .map((row) => String(row.pieceKey || "")).filter(Boolean);
  const shieldGuardEffect = (action?.metadata?.specialRuleAnalysis?.effects || [])
    .find((effect) => effect.ruleKey === "shield_guard" &&
      effect.effectType === "choice_required_on_direct_hit");
  const attackRangeIn = numeric(
    action?.metadata?.attackProfile?.rangeIn,
    sourceProfile.rangeIn,
  );
  const actorTargetEdgeDistanceIn = closestPointDistanceIn(
    normalizedActor,
    normalizedEnemyLeader,
  );
  const actorControllerEdgeDistanceIn = closestPointDistanceIn(
    normalizedActor,
    normalizedFriendlyLeader,
  );
  const attackResolution = action?.metadata?.attackResolution || {};
  const attackDistribution = attackResolution.attackRollDistribution || {};
  const targetInMeleeModifier = (attackResolution.modifiers || []).find((row) =>
    row.effectType === "target_in_melee_defense_bonus") || null;
  let controllerRouteEvidence = null;
  if (normalizedChanneler) {
    const channelEnumeration = enumerateRulesV1Actions(state, {
      actorPieceKeys: [normalizedFriendlyLeader.pieceKey],
      targetPieceKeys: [normalizedEnemyLeader.pieceKey],
      actionFamilyKeys: ["attack_or_effect"],
      includeActorlessActions: false,
      includeUntargetedActions: false,
    });
    const channeledAction = (channelEnumeration.actions || []).find((candidate) =>
      candidate.actionType === CHANNELED_EXCARNATE_ACTION_TYPE &&
      candidate.actorPieceKey === normalizedFriendlyLeader.pieceKey &&
      candidate.targetPieceKey === normalizedEnemyLeader.pieceKey &&
      candidate.actionKey.includes(EXCARNATE_SOURCE_ID) &&
      String(candidate.metadata?.channelerPieceKey ||
        candidate.metadata?.attackResolution?.channelerPieceKey || "") ===
          normalizedChanneler.pieceKey) || null;
    const channelRejects = (channelEnumeration.rejectedActions || []).filter(
      (candidate) => candidate.actorPieceKey ===
          normalizedFriendlyLeader.pieceKey &&
        candidate.targetPieceKey === normalizedEnemyLeader.pieceKey &&
        candidate.actionKey.includes(EXCARNATE_SOURCE_ID),
    );
    controllerRouteEvidence = stableGraphValue({
      routeKind: "sepsira_raptor_channeled_excarnate",
      legalRoute: Boolean(channeledAction),
      spellcasterPieceKey: normalizedFriendlyLeader.pieceKey,
      spellcasterCardId: pieceCardId(normalizedFriendlyLeader),
      spellcasterFocus: resourceValue(normalizedFriendlyLeader),
      channelerPieceKey: normalizedChanneler.pieceKey,
      channelerCardId: pieceCardId(normalizedChanneler),
      targetPieceKey: normalizedEnemyLeader.pieceKey,
      actionKey: channeledAction?.actionKey || "",
      actionType: channeledAction?.actionType || "",
      spellSourceId: EXCARNATE_SOURCE_ID,
      spellcasterChannelerEdgeDistanceIn: closestPointDistanceIn(
        normalizedFriendlyLeader,
        normalizedChanneler,
      ),
      spellcasterControlRangeIn: numeric(
        normalizedFriendlyLeader.controlRangeIn,
        0,
      ),
      channelerTargetEdgeDistanceIn: closestPointDistanceIn(
        normalizedChanneler,
        normalizedEnemyLeader,
      ),
      rejectedRouteCount: channelRejects.length,
      rejectedRouteReasons: channelRejects.map((candidate) =>
        candidate.rejection?.reason || "").filter(Boolean).sort(),
    });
  }
  return {
    executionKind: strictTerminalRoot
      ? "wolves_experimental_warhead"
      : "gorman_experimental_warhead_filter",
    terminal,
    state: enumeration.state,
    actor: normalizedActor,
    friendlyLeader: normalizedFriendlyLeader,
    enemyLeader: normalizedEnemyLeader,
    focusCarrier: normalizedFocusCarrier,
    channeler: normalizedChanneler,
    priorLossPieceKeys,
    authoredModelBlocker: normalizedModelBlocker,
    authoredTerrainBlockerKey:
      coordinates.lineOfSight === "terrain_blocked"
        ? GORMAN_TERRAIN_BLOCKER_KEY
        : "",
    presenceUnit,
    loserPresenceSolo: normalizedLoserPresenceSolo,
    winnerObjective,
    loserScenarioTerrain,
    enumeration,
    action,
    hostRejection,
    placementAudit,
    formationAudit,
    terrainAudit,
    centerControl: null,
    presenceControl: winnerObjectiveControl,
    winnerObjectiveControl,
    loserTerrainControl,
    controlReportHash: stableGraphHash(controlReport),
    losEvidence,
    controllerRouteEvidence,
    aoeSecondaryTargetKeys,
    shieldGuardEffect: shieldGuardEffect || null,
    steamroller2026Decision: representative.scenarioKey ===
        "wolves_at_our_heels"
      ? stableGraphValue({
        wolves: {
          addTokenByObjectiveKey: {
            [winnerObjective.objectiveKey]: false,
          },
        },
      })
      : stableGraphValue({}),
    stealthInteractionEvidence: stableGraphValue({
      targetPieceKey: normalizedEnemyLeader.pieceKey,
      targetHasStealth: pieceHasRuleKey(normalizedEnemyLeader, "stealth"),
      actorTargetEdgeDistanceIn,
      stealthAutomaticMissDistanceIn: 5,
      withinStealthAutomaticMissDistance:
        actorTargetEdgeDistanceIn <= 5 + 1e-6,
      automaticMiss:
        action?.metadata?.attackResolution?.automaticMiss === true,
      automaticMissReason:
        action?.metadata?.attackResolution?.automaticMissReason || "",
    }),
    attackProbabilityEvidence: stableGraphValue({
      targetNumber: Number(attackResolution.targetNumber || 0),
      hitProbability: Number(attackResolution.hitProbability || 0),
      hitOutcomes: Number(attackDistribution.hitOutcomes || 0),
      totalOutcomes: Number(attackDistribution.totalOutcomes || 0),
      automaticHitOutcomes:
        Number(attackDistribution.automaticHitOutcomes || 0),
      automaticMissOutcomes:
        Number(attackDistribution.automaticMissOutcomes || 0),
      targetInMelee: Boolean(targetInMeleeModifier),
      targetInMeleeDefenseBonus:
        Number(targetInMeleeModifier?.defenseDelta || 0),
      targetInMeleeEvidence:
        targetInMeleeModifier?.targetInMeleeEvidence || null,
      suppliedAllSixesHits: true,
    }),
    geometry: stableGraphValue({
      actorPosition: normalizedActor.position,
      friendlyLeaderPosition: normalizedFriendlyLeader.position,
      enemyLeaderPosition: normalizedEnemyLeader.position,
      actorTargetEdgeDistanceIn,
      leadersEdgeDistanceIn: closestPointDistanceIn(
        normalizedFriendlyLeader,
        normalizedEnemyLeader,
      ),
      actorControllerEdgeDistanceIn,
      attackRangeIn,
      controllerControlRangeIn: numeric(
        normalizedFriendlyLeader.controlRangeIn,
        0,
      ),
    }),
    trenchCacheRows: (state.scenario?.caches || []).map((cache) =>
      stableGraphValue({
        cacheKey: String(cache.cacheKey || cache.elementKey || ""),
        ownerSideKey: String(cache.ownerSideKey || ""),
        active: cache.active === true,
      })).sort((left, right) => left.cacheKey.localeCompare(right.cacheKey)),
  };
}

function authorState(opening = {}, representative = {}, terminal = {}, task = {}) {
  return GORMAN_EXPERIMENTAL_WARHEAD_TASK_KEYS.has(task.taskKey)
    ? authorGormanExperimentalWarheadState(
      opening,
      representative,
      terminal,
      task,
    )
    : authorSprayState(opening, representative, terminal, task);
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

function sprayExactPartitionAudit(authored = {}, opening = {}, representative = {},
  terminal = {}) {
  const state = authored.state || {};
  const coordinates = representative.coordinates || {};
  const inPlay = (state.pieces || []).filter(warmachinePieceInPlayV1);
  const outOfPlay = (state.pieces || []).filter((piece) =>
    !warmachinePieceInPlayV1(piece));
  const damageRows = inPlay.filter((piece) => maximumBoxes(piece) > 0)
    .map((piece) => ({
      pieceKey: piece.pieceKey,
      boxesRemaining: boxesRemaining(piece),
      maximumBoxes: maximumBoxes(piece),
    }));
  const resourceRows = (state.pieces || []).filter((piece) =>
    resourceMaximum(piece) > 0).map((piece) => ({
    pieceKey: piece.pieceKey,
    isWarjack: piece.isWarjack === true,
    resource: resourceValue(piece),
    maximum: resourceMaximum(piece),
  }));
  const nonzeroResources = resourceRows.filter((row) => row.resource > 0);
  const fuseRows = scenarioFuseElements(state).map((element) => ({
    elementKey: String(element.elementKey || element.objectiveKey ||
      element.terrainKey || ""),
    baseSizeMm: Number(element.baseSizeMm || 0),
    countdownTokens: Number(element.countdownTokens || 0),
    countdownDetonated: element.countdownDetonated === true,
  })).sort((left, right) => left.elementKey.localeCompare(right.elementKey));
  const reduced = fuseRows.filter((row) =>
    row.countdownTokens > 0 && row.countdownTokens < 5);
  const otherSideKey = terminal.endingSideKey === "player1"
    ? "player2" : "player1";
  const lifecyclePartitionPassed = coordinates.lifecycle ===
      "both_rosters_complete"
    ? inPlay.length === state.pieces.length &&
      authored.priorLossPieceKeys.length === 0
    : coordinates.lifecycle === "loser_prior_losses" &&
      authored.priorLossPieceKeys.length > 0 &&
      outOfPlay.length === authored.priorLossPieceKeys.length &&
      outOfPlay.every((piece) =>
        piece.sideKey === terminal.loserSideKey &&
        authored.priorLossPieceKeys.includes(piece.pieceKey));
  const resourcePartitionPassed = coordinates.resource === "zero_available"
    ? nonzeroResources.length === 0
    : coordinates.resource === "one_additional_purchase_available" &&
      nonzeroResources.length === 1 &&
      nonzeroResources[0].resource === 1 &&
      nonzeroResources[0].isWarjack === true ||
      coordinates.resource === "controller_transfer_or_channel_available" &&
      nonzeroResources.length === 0 &&
      authored.controllerRouteEvidence?.actorIsWarbeast === true &&
      authored.controllerRouteEvidence?.actorHasForceCapacity === true &&
      authored.controllerRouteEvidence?.controllerIsFriendlyLeader === true &&
      authored.controllerRouteEvidence?.battlegroupIdentityBound === true &&
      authored.controllerRouteEvidence?.controllerInControlRange === true;
  const rangePartitionPassed = coordinates.actionRange === "strictly_inside"
    ? authored.geometry.actorTargetEdgeDistanceIn > 0 &&
      authored.geometry.actorTargetEdgeDistanceIn < authored.geometry.attackRangeIn
    : coordinates.actionRange === "on_boundary" &&
      Math.abs(authored.geometry.actorTargetEdgeDistanceIn -
        authored.geometry.attackRangeIn) <= 1e-6;
  const lineOfSightPartitionPassed = coordinates.lineOfSight === "clear"
    ? authored.losEvidence?.hasClearLine === true &&
      authored.losEvidence?.blockedLineCount === 0
    : coordinates.lineOfSight === "model_blocked"
      ? authored.losEvidence?.ignoresInterveningModels === true &&
        authored.losEvidence?.modelBlockerKeys?.includes(
          authored.authoredModelBlocker?.pieceKey,
        ) && authored.losEvidence?.blockerEvaluations?.some((row) =>
          row.key === authored.authoredModelBlocker?.pieceKey &&
          row.blockedLineCount === row.evaluatedLineCount &&
          row.evaluatedLineCount > 0)
      : coordinates.lineOfSight === "terrain_blocked" &&
        authored.losEvidence?.terrainKey === authored.authoredTerrainBlockerKey &&
        authored.hostRejection?.rejection?.reason === "line_of_sight_blocked";
  const scenarioTerminalPartitionPassed =
    representative.scenarioKey === "high_stakes"
      ? coordinates.highStakesCountdownState ===
          "one_nonzero_element_reduced" && reduced.length === 1 &&
        reduced[0]?.elementKey === CENTER_OBJECTIVE_KEY &&
        reduced[0]?.countdownTokens === 4 &&
        fuseRows.every((row) => row.countdownTokens === 4 ||
          row.countdownTokens === 5) &&
        coordinates.highStakesFuseResolution ===
          "secured_50mm_remove_one" &&
        authored.centerControl?.baseSizeMm === 50 &&
        stableGraphHash(authored.centerControl?.securingSides || []) ===
          stableGraphHash([terminal.endingSideKey]) &&
        coordinates.highStakesBlastClosure === "no_detonation" &&
        fuseRows.every((row) => row.countdownTokens > 1 &&
          row.countdownDetonated === false) &&
        stableGraphHash(authored.presenceControl?.securingSides || []) ===
          stableGraphHash([terminal.winnerSideKey]) &&
        authored.presenceUnit?.pieceKeys?.length >= 3 &&
        Number(state.scenario?.score?.player1 || 0) ===
          Number(state.scenario?.score?.player2 || 0)
      : representative.scenarioKey === "pressure_point" &&
        Number(state.scenario?.score?.[terminal.winnerSideKey] || 0) >
          Number(state.scenario?.score?.[terminal.loserSideKey] || 0);
  const checks = [
    ["full_task_roster_preserved",
      stableGraphHash(rosterIdentityLedger(opening.state)),
      stableGraphHash(rosterIdentityLedger(state))],
    ["model_count_preserved", Number(opening.modelCount), state.pieces.length],
    ["lifecycle_partition", true, lifecyclePartitionPassed],
    ["critical_models_undamaged", true,
      coordinates.damage === "critical_models_undamaged" &&
      damageRows.every((row) => row.boxesRemaining === row.maximumBoxes)],
    ["resource_partition", true, resourcePartitionPassed],
    ["base_topology_partition", true,
      coordinates.baseTopology === "legal_separated" &&
      authored.placementAudit?.ok === true &&
      authored.formationAudit?.ok === true],
    ["action_range_partition", true, rangePartitionPassed],
    ["leader_control_partition", true,
      coordinates.leaderControl === "strictly_inside" &&
      authored.geometry.actorControllerEdgeDistanceIn <
        authored.geometry.controllerControlRangeIn],
    ["line_of_sight_partition", true, lineOfSightPartitionPassed],
    ["scenario_terrain_partition", coordinates.scenarioTerrainSetup,
      authored.terrainAudit?.setupClassKey],
    ["scenario_terrain_host_audit", true,
      authored.terrainAudit?.ok === true],
    ["scenario_terminal_partition", true, scenarioTerminalPartitionPassed],
    ["actor_role", terminal.endingSideKey, authored.actor.sideKey],
    ["friendly_leader_role", terminal.endingSideKey,
      authored.friendlyLeader.sideKey],
    ["enemy_leader_role", otherSideKey,
      authored.enemyLeader.sideKey],
  ].map(([checkKey, expected, observed]) => stableGraphValue({
    checkKey,
    expected,
    observed,
    passed: stableGraphHash(expected) === stableGraphHash(observed),
  }));
  return stableGraphValue({
    ok: checks.every((check) => check.passed),
    checks,
    modelCount: state.pieces.length,
    inPlayModelCount: inPlay.length,
    outOfPlayModelCount: outOfPlay.length,
    priorLossPieceKeys: authored.priorLossPieceKeys,
    lineOfSightEvidence: authored.losEvidence,
    authoredModelBlockerPieceKey:
      authored.authoredModelBlocker?.pieceKey || "",
    authoredTerrainBlockerKey: authored.authoredTerrainBlockerKey,
    controllerRouteEvidence: authored.controllerRouteEvidence,
    damageRows,
    resourceRows,
    nonzeroResources,
    fuseRows,
    reducedFuseRows: reduced,
    centerControl: authored.centerControl,
    presenceControl: authored.presenceControl,
    presenceUnit: authored.presenceUnit,
    placementAuditHash: stableGraphHash(authored.placementAudit || {}),
    formationAuditHash: stableGraphHash(authored.formationAudit || {}),
    terrainAuditHash: stableGraphHash(authored.terrainAudit || {}),
  });
}

function wolvesExperimentalWarheadPartitionAudit(authored = {}, opening = {},
  representative = {}, terminal = {}) {
  const state = authored.state || {};
  const coordinates = representative.coordinates || {};
  const inPlay = (state.pieces || []).filter(warmachinePieceInPlayV1);
  const damageRows = inPlay.filter((piece) => maximumBoxes(piece) > 0)
    .map((piece) => ({
      pieceKey: piece.pieceKey,
      leader: leaderLike(piece),
      boxesRemaining: boxesRemaining(piece),
      maximumBoxes: maximumBoxes(piece),
    }));
  const resourceRows = (state.pieces || []).filter((piece) =>
    resourceMaximum(piece) > 0).map((piece) => ({
    pieceKey: piece.pieceKey,
    resource: resourceValue(piece),
    maximum: resourceMaximum(piece),
  }));
  const objectivePositionsPreserved = (state.scenario?.objectives || [])
    .every((objective) => {
      const source = (opening.state?.scenario?.objectives || []).find((row) =>
        row.objectiveKey === objective.objectiveKey);
      return source && Math.abs(numeric(source.xIn) - numeric(objective.xIn)) <=
          1e-6 && Math.abs(numeric(source.yIn) - numeric(objective.yIn)) <= 1e-6;
    });
  const progressRows = (state.scenario?.objectives || []).filter((objective) =>
    Number(objective.baseSizeMm) === 40).map((objective) => ({
    objectiveKey: objective.objectiveKey,
    progressTokens: Number(objective.progressTokens || 0),
    progressGoalScored: objective.progressGoalScored === true,
  })).sort((left, right) => left.objectiveKey.localeCompare(
    right.objectiveKey,
  ));
  const leadersAtThreshold = damageRows.filter((row) => row.leader)
    .length === 2 && damageRows.filter((row) => row.leader)
    .every((row) => row.boxesRemaining === 1);
  const nonLeadersUndamaged = damageRows.filter((row) => !row.leader)
    .every((row) => row.boxesRemaining === row.maximumBoxes);
  const checks = [
    ["full_task_roster_preserved",
      stableGraphHash(rosterIdentityLedger(opening.state)),
      stableGraphHash(rosterIdentityLedger(state))],
    ["model_count_preserved", Number(opening.modelCount), state.pieces.length],
    ["lifecycle_partition", true,
      coordinates.lifecycle === "both_rosters_complete" &&
      inPlay.length === state.pieces.length],
    ["leader_terminal_threshold_partition", true,
      coordinates.damage === "leader_at_terminal_threshold" &&
      leadersAtThreshold && nonLeadersUndamaged],
    ["resource_partition", true,
      coordinates.resource === "zero_available" &&
      resourceRows.every((row) => row.resource === 0)],
    ["base_topology_partition", true,
      coordinates.baseTopology === "legal_separated" &&
      authored.placementAudit?.ok === true &&
      authored.formationAudit?.ok === true],
    ["action_range_partition", true,
      coordinates.actionRange === "strictly_inside" &&
      authored.geometry.actorTargetEdgeDistanceIn > 0 &&
      authored.geometry.actorTargetEdgeDistanceIn <
        authored.geometry.attackRangeIn],
    ["leader_control_partition", true,
      coordinates.leaderControl === "strictly_inside" &&
      authored.geometry.actorControllerEdgeDistanceIn <
        authored.geometry.controllerControlRangeIn],
    ["line_of_sight_partition", true,
      coordinates.lineOfSight === "clear" &&
      authored.losEvidence?.hasClearLine === true &&
      authored.losEvidence?.blockedLineCount === 0],
    ["stealth_interaction_partition", true,
      authored.stealthInteractionEvidence?.targetHasStealth === true &&
      authored.stealthInteractionEvidence
        ?.withinStealthAutomaticMissDistance === true &&
      authored.stealthInteractionEvidence?.automaticMiss === false],
    ["all_sixes_probability_partition", true,
      authored.attackProbabilityEvidence?.targetNumber > 12 &&
      authored.attackProbabilityEvidence?.hitOutcomes === 1 &&
      authored.attackProbabilityEvidence?.totalOutcomes === 36 &&
      authored.attackProbabilityEvidence?.automaticHitOutcomes === 1 &&
      authored.attackProbabilityEvidence?.targetInMelee === true &&
      authored.attackProbabilityEvidence?.targetInMeleeDefenseBonus === 4],
    ["scenario_terrain_partition", coordinates.scenarioTerrainSetup,
      authored.terrainAudit?.setupClassKey],
    ["scenario_terrain_host_audit", true,
      authored.terrainAudit?.ok === true],
    ["wolves_progress_partition", true,
      coordinates.wolvesProgressState ===
        "at_least_one_objective_at_two" &&
      progressRows.some((row) => row.progressTokens === 2 &&
        row.progressGoalScored === false)],
    ["wolves_declined_token_partition", false,
      authored.steamroller2026Decision?.wolves?.addTokenByObjectiveKey?.[
        authored.winnerObjective?.objectiveKey]],
    ["wolves_objective_move_partition", true,
      coordinates.wolvesObjectiveMove === "move_not_triggered" &&
      objectivePositionsPreserved],
    ["winner_owned_40mm_secured", terminal.winnerSideKey,
      authored.winnerObjectiveControl?.securingSides?.length === 1
        ? authored.winnerObjectiveControl.securingSides[0]
        : ""],
    ["loser_scenario_terrain_secured", terminal.loserSideKey,
      authored.loserTerrainControl?.securingSides?.length === 1
        ? authored.loserTerrainControl.securingSides[0]
        : ""],
    ["predecessor_score_tied", true,
      Number(state.scenario?.score?.player1 || 0) ===
        Number(state.scenario?.score?.player2 || 0)],
    ["experimental_warhead_action_selected", true,
      authored.action?.metadata?.attackProfile?.attackTypeChoice ===
        "experimental_warhead" &&
      authored.action?.metadata?.attackProfile?.sourceWeaponId ===
        EXPERIMENTAL_BOMB_LAUNCHER_SOURCE_WEAPON_ID],
    ["friendly_leader_in_aoe", true,
      authored.aoeSecondaryTargetKeys?.length === 1 &&
      authored.aoeSecondaryTargetKeys[0] ===
        authored.friendlyLeader?.pieceKey],
    ["shield_guard_response_exposed", true,
      Boolean(authored.shieldGuardEffect)],
    ["actor_role", terminal.endingSideKey, authored.actor?.sideKey],
    ["friendly_leader_role", terminal.endingSideKey,
      authored.friendlyLeader?.sideKey],
    ["enemy_leader_role", terminal.loserSideKey,
      authored.enemyLeader?.sideKey],
  ].map(([checkKey, expected, observed]) => stableGraphValue({
    checkKey,
    expected,
    observed,
    passed: stableGraphHash(expected) === stableGraphHash(observed),
  }));
  return stableGraphValue({
    ok: checks.every((check) => check.passed),
    checks,
    modelCount: state.pieces.length,
    inPlayModelCount: inPlay.length,
    outOfPlayModelCount: state.pieces.length - inPlay.length,
    priorLossPieceKeys: [],
    damageRows,
    resourceRows,
    progressRows,
    objectivePositionsPreserved,
    lineOfSightEvidence: authored.losEvidence,
    stealthInteractionEvidence: authored.stealthInteractionEvidence,
    attackProbabilityEvidence: authored.attackProbabilityEvidence,
    winnerObjectiveControl: authored.winnerObjectiveControl,
    loserTerrainControl: authored.loserTerrainControl,
    presenceUnit: authored.presenceUnit,
    loserPresenceSoloPieceKey: authored.loserPresenceSolo?.pieceKey || "",
    aoeSecondaryTargetKeys: authored.aoeSecondaryTargetKeys,
    steamroller2026Decision: authored.steamroller2026Decision,
    placementAuditHash: stableGraphHash(authored.placementAudit || {}),
    formationAuditHash: stableGraphHash(authored.formationAudit || {}),
    terrainAuditHash: stableGraphHash(authored.terrainAudit || {}),
  });
}

function gormanExperimentalWarheadFilterPartitionAudit(authored = {},
  opening = {}, representative = {}, terminal = {}) {
  const state = authored.state || {};
  const coordinates = representative.coordinates || {};
  const inPlay = (state.pieces || []).filter(warmachinePieceInPlayV1);
  const outOfPlay = (state.pieces || []).filter((piece) =>
    !warmachinePieceInPlayV1(piece));
  const damageRows = inPlay.filter((piece) => maximumBoxes(piece) > 0)
    .map((piece) => stableGraphValue({
      pieceKey: piece.pieceKey,
      leader: leaderLike(piece),
      boxesRemaining: boxesRemaining(piece),
      maximumBoxes: maximumBoxes(piece),
    }));
  const resourceRows = (state.pieces || []).filter((piece) =>
    resourceMaximum(piece) > 0).map((piece) => stableGraphValue({
    pieceKey: piece.pieceKey,
    cardId: pieceCardId(piece),
    isWarjack: piece.isWarjack === true,
    resource: resourceValue(piece),
    maximum: resourceMaximum(piece),
  }));
  const nonzeroResources = resourceRows.filter((row) => row.resource > 0);
  const selectedAttack = authored.action || authored.hostRejection || {};
  const lifecyclePartitionPassed = coordinates.lifecycle ===
      "both_rosters_complete"
    ? inPlay.length === state.pieces.length &&
      authored.priorLossPieceKeys.length === 0
    : coordinates.lifecycle === "removed_from_play_history" &&
      authored.priorLossPieceKeys.length === 1 &&
      outOfPlay.length === 1 && outOfPlay.every((piece) =>
        authored.priorLossPieceKeys.includes(piece.pieceKey) &&
        piece.removedFromPlay === true &&
        piece.damageLifecycleStage === "removed_from_play");
  const resourcePartitionPassed = coordinates.resource === "zero_available"
    ? nonzeroResources.length === 0
    : coordinates.resource === "one_additional_purchase_available"
      ? nonzeroResources.length === 1 &&
        nonzeroResources[0].pieceKey === authored.focusCarrier?.pieceKey &&
        nonzeroResources[0].resource === 1 &&
        nonzeroResources[0].isWarjack === true
      : coordinates.resource === "controller_transfer_or_channel_available" &&
        nonzeroResources.length === 1 &&
        nonzeroResources[0].pieceKey === authored.friendlyLeader?.pieceKey &&
        nonzeroResources[0].resource === 5 &&
        authored.controllerRouteEvidence?.legalRoute === true &&
        authored.controllerRouteEvidence?.actionType ===
          CHANNELED_EXCARNATE_ACTION_TYPE &&
        authored.controllerRouteEvidence?.spellSourceId ===
          EXCARNATE_SOURCE_ID &&
        authored.controllerRouteEvidence?.channelerPieceKey ===
          authored.channeler?.pieceKey;
  const lineOfSightPartitionPassed = coordinates.lineOfSight === "clear"
    ? Boolean(authored.action) && authored.losEvidence?.hasClearLine === true &&
      authored.losEvidence?.blockedLineCount === 0
    : coordinates.lineOfSight === "model_blocked"
      ? !authored.action &&
        authored.hostRejection?.rejection?.reason === "line_of_sight_blocked" &&
        authored.losEvidence?.modelBlockerKeys?.includes(
          authored.authoredModelBlocker?.pieceKey)
      : coordinates.lineOfSight === "terrain_blocked"
        ? !authored.action &&
          authored.hostRejection?.rejection?.reason ===
            "line_of_sight_blocked" &&
          authored.losEvidence?.terrainKey === authored.authoredTerrainBlockerKey
        : coordinates.lineOfSight === "stealth_blocks_beyond_five" &&
          Boolean(authored.action) &&
          authored.losEvidence?.hasClearLine === true &&
          authored.stealthInteractionEvidence?.targetHasStealth === true &&
          authored.stealthInteractionEvidence
            ?.withinStealthAutomaticMissDistance === false &&
          authored.stealthInteractionEvidence?.automaticMiss === true;
  const presencePartitionPassed = [
    "wolves_at_our_heels",
    "trench_warfare",
  ].includes(representative.scenarioKey)
    ? authored.presenceUnit?.pieceKeys?.length >= 3 &&
      authored.winnerObjectiveControl?.securingSides?.length === 1 &&
      authored.winnerObjectiveControl.securingSides[0] ===
        terminal.winnerSideKey &&
      authored.loserTerrainControl?.securingSides?.length === 1 &&
      authored.loserTerrainControl.securingSides[0] === terminal.loserSideKey
    : true;
  const progressRows = (state.scenario?.objectives || []).filter((objective) =>
    Number(objective.baseSizeMm) === 40).map((objective) =>
    stableGraphValue({
      objectiveKey: objective.objectiveKey,
      progressTokens: Number(objective.progressTokens || 0),
      progressGoalScored: objective.progressGoalScored === true,
    })).sort((left, right) => left.objectiveKey.localeCompare(
      right.objectiveKey,
    ));
  const scenarioPartitionPassed = representative.scenarioKey ===
      "two_fronts"
    ? Number(state.scenario?.score?.[terminal.winnerSideKey] || 0) >
      Number(state.scenario?.score?.[terminal.loserSideKey] || 0)
    : representative.scenarioKey === "trench_warfare"
      ? Number(state.scenario?.score?.player1 || 0) ===
          Number(state.scenario?.score?.player2 || 0) &&
        coordinates.trenchCacheLifecycle === "both_caches_active" &&
        authored.trenchCacheRows.length === 2 &&
        authored.trenchCacheRows.every((row) => row.active === true) &&
        presencePartitionPassed
      : representative.scenarioKey === "wolves_at_our_heels" &&
        Number(state.scenario?.score?.player1 || 0) ===
          Number(state.scenario?.score?.player2 || 0) &&
        coordinates.wolvesProgressState ===
          "at_least_one_objective_at_two" &&
        progressRows.some((row) => row.progressTokens === 2 &&
          row.progressGoalScored === false) &&
        authored.steamroller2026Decision?.wolves?.addTokenByObjectiveKey?.[
          authored.winnerObjective?.objectiveKey] === false &&
        presencePartitionPassed;
  const checks = [
    ["full_task_roster_preserved",
      stableGraphHash(rosterIdentityLedger(opening.state)),
      stableGraphHash(rosterIdentityLedger(state))],
    ["model_count_preserved", Number(opening.modelCount), state.pieces.length],
    ["lifecycle_partition", true, lifecyclePartitionPassed],
    ["critical_models_undamaged", true,
      coordinates.damage === "critical_models_undamaged" &&
      damageRows.every((row) => row.boxesRemaining === row.maximumBoxes)],
    ["resource_partition", true, resourcePartitionPassed],
    ["base_topology_partition", true,
      coordinates.baseTopology === "legal_separated" &&
      authored.placementAudit?.ok === true &&
      authored.formationAudit?.ok === true],
    ["action_range_partition", true,
      coordinates.actionRange === "strictly_inside" &&
      authored.geometry.actorTargetEdgeDistanceIn > 0 &&
      authored.geometry.actorTargetEdgeDistanceIn <
        authored.geometry.attackRangeIn],
    ["leader_control_partition", true,
      coordinates.leaderControl === "strictly_inside" &&
      authored.geometry.actorControllerEdgeDistanceIn <
        authored.geometry.controllerControlRangeIn],
    ["line_of_sight_partition", true, lineOfSightPartitionPassed],
    ["scenario_terrain_partition", coordinates.scenarioTerrainSetup,
      authored.terrainAudit?.setupClassKey],
    ["scenario_terrain_host_audit", true, authored.terrainAudit?.ok === true],
    ["scenario_terminal_partition", true, scenarioPartitionPassed],
    ["experimental_warhead_candidate_bound", true,
      selectedAttack.metadata?.attackProfile?.sourceWeaponId ===
        EXPERIMENTAL_BOMB_LAUNCHER_SOURCE_WEAPON_ID &&
      selectedAttack.metadata?.attackProfile?.attackTypeChoice ===
        "experimental_warhead"],
    ["actor_role", terminal.endingSideKey, authored.actor?.sideKey],
    ["friendly_leader_role", terminal.endingSideKey,
      authored.friendlyLeader?.sideKey],
    ["enemy_leader_role", terminal.loserSideKey,
      authored.enemyLeader?.sideKey],
  ].map(([checkKey, expected, observed]) => stableGraphValue({
    checkKey,
    expected,
    observed,
    passed: stableGraphHash(expected) === stableGraphHash(observed),
  }));
  return stableGraphValue({
    ok: checks.every((check) => check.passed),
    checks,
    modelCount: state.pieces.length,
    inPlayModelCount: inPlay.length,
    outOfPlayModelCount: outOfPlay.length,
    priorLossPieceKeys: authored.priorLossPieceKeys,
    damageRows,
    resourceRows,
    nonzeroResources,
    lineOfSightEvidence: authored.losEvidence,
    stealthInteractionEvidence: authored.stealthInteractionEvidence,
    controllerRouteEvidence: authored.controllerRouteEvidence,
    progressRows,
    trenchCacheRows: authored.trenchCacheRows,
    winnerObjectiveControl: authored.winnerObjectiveControl,
    loserTerrainControl: authored.loserTerrainControl,
    placementAuditHash: stableGraphHash(authored.placementAudit || {}),
    formationAuditHash: stableGraphHash(authored.formationAudit || {}),
    terrainAuditHash: stableGraphHash(authored.terrainAudit || {}),
  });
}

function exactPartitionAudit(authored = {}, opening = {}, representative = {},
  terminal = {}) {
  return authored.executionKind === "wolves_experimental_warhead"
    ? wolvesExperimentalWarheadPartitionAudit(
      authored,
      opening,
      representative,
      terminal,
    )
    : authored.executionKind === "gorman_experimental_warhead_filter"
      ? gormanExperimentalWarheadFilterPartitionAudit(
        authored,
        opening,
        representative,
        terminal,
      )
    : sprayExactPartitionAudit(authored, opening, representative, terminal);
}

function executeSprayCandidate(authored = {}) {
  const enumeration = enumerateRulesV1Actions(authored.state, {
    actorPieceKeys: [authored.actor.pieceKey],
    targetPieceKeys: [authored.enemyLeader.pieceKey],
    actionFamilyKeys: ["attack_or_effect"],
    includeActorlessActions: false,
    includeUntargetedActions: false,
  });
  const action = (enumeration.actions || []).find((candidate) =>
    candidate.actionType === "ranged_attack" &&
    candidate.actorPieceKey === authored.actor.pieceKey &&
    candidate.targetPieceKey === authored.enemyLeader.pieceKey &&
    candidate.metadata?.attackProfile?.profileKey ===
      TOXIC_SPITTLE_PROFILE_KEY);
  if (!action) throw new Error("simultaneous_terminal_toxic_spittle_missing");
  const spraySecondaryTargetKeys = (
    action.metadata?.spraySecondaryTargets || []
  ).map((row) => String(row.pieceKey || "")).filter(Boolean);
  if (!spraySecondaryTargetKeys.includes(authored.friendlyLeader.pieceKey)) {
    throw new Error("simultaneous_terminal_friendly_leader_outside_spray");
  }
  const inputAction = {
    actionKey: action.actionKey,
    strictRollOutcome: {
      attackDice: [6, 6],
      damageDice: [6, 6],
      sprayAttackDamageByTarget: Object.fromEntries(
        spraySecondaryTargetKeys.map((pieceKey) => [pieceKey, {
          attackDice: [6, 6],
          damageDice: [6, 6],
        }]),
      ),
    },
  };
  if (authored.state.scenario?.scenarioKey === "high_stakes") {
    inputAction.steamroller2026Decision = {
      highStakes: {
        fuseRoll: 1,
        fuseTargetKey: CENTER_OBJECTIVE_KEY,
      },
    };
  }
  const transitions = [];
  let transition = applyRulesV1Action(enumeration.state, {
    ...inputAction,
    __warmachineTrustedRulesV1Enumeration: enumeration,
  });
  transitions.push(transition);
  let boostDecisionCount = 0;
  while (transition.ok === true &&
      transition.reason === "pre_roll_resource_boost_decision_required") {
    if (boostDecisionCount >= 8) {
      throw new Error("simultaneous_terminal_boost_window_loop_exceeded");
    }
    const window = transition.nextState?.preRollTokenBoostWindow || {};
    if (window.actorPieceKey !== authored.actor.pieceKey ||
        !spraySecondaryTargetKeys.includes(window.targetPieceKey) ||
        !["attack_roll", "damage_roll"].includes(window.phase) ||
        window.paymentKind !== "resource") {
      throw new Error("simultaneous_terminal_boost_window_mismatch");
    }
    transition = applyRulesV1Action(transition.nextState, {
      actionKey: `${authored.actor.pieceKey}:pre-roll-resource-boost:${
        window.rollIndex || 1}:decline:v1`,
    });
    transitions.push(transition);
    boostDecisionCount += 1;
  }
  if (transition.ok !== true) {
    throw new Error(`simultaneous_terminal_execution_failed:${
      transition.reason || "unknown"}`);
  }
  const events = transitions.flatMap((entry) => entry.events || []);
  const predecessorStateHash = warmachineReverseStateSemanticHashV1(
    authored.state,
  );
  const terminalStateHash = warmachineReverseStateSemanticHashV1(
    transition.nextState || {},
  );
  const receiptCore = stableGraphValue({
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    predecessorStateHash,
    inputAction,
    actionKeys: transitions.map((entry) => entry.action?.actionKey || ""),
    events,
    terminalStateHash,
    boostDecisionCount,
    spraySecondaryTargetKeys,
  });
  return {
    action,
    inputAction,
    transitions,
    transition,
    events,
    predecessorStateHash,
    terminalStateHash,
    boostDecisionCount,
    spraySecondaryTargetKeys,
    receiptHash: stableGraphHash(receiptCore),
  };
}

function executeWolvesExperimentalWarheadCandidate(authored = {}) {
  const enumeration = enumerateRulesV1Actions(authored.state, {
    actorPieceKeys: [authored.actor.pieceKey],
    targetPieceKeys: [authored.enemyLeader.pieceKey],
    actionFamilyKeys: ["attack_or_effect"],
    includeActorlessActions: false,
    includeUntargetedActions: false,
  });
  const action = (enumeration.actions || []).find((candidate) =>
    candidate.actionType === "ranged_attack" &&
    candidate.actorPieceKey === authored.actor.pieceKey &&
    candidate.targetPieceKey === authored.enemyLeader.pieceKey &&
    candidate.metadata?.attackProfile?.sourceWeaponId ===
      EXPERIMENTAL_BOMB_LAUNCHER_SOURCE_WEAPON_ID &&
    candidate.metadata?.attackProfile?.attackTypeChoice ===
      "experimental_warhead");
  if (!action) {
    throw new Error("simultaneous_terminal_experimental_warhead_missing");
  }
  const aoeSecondaryTargetKeys = (action.metadata?.aoeBlastTargets || [])
    .map((row) => String(row.pieceKey || "")).filter(Boolean).sort();
  if (stableGraphHash(aoeSecondaryTargetKeys) !== stableGraphHash([
    authored.friendlyLeader.pieceKey,
  ])) {
    throw new Error(
      "simultaneous_terminal_experimental_warhead_aoe_partition_drift",
    );
  }
  const inputAction = {
    actionKey: action.actionKey,
    strictRollOutcome: {
      attackDice: [6, 6],
      damageDice: [6, 6],
      aoeBlastDamageByTarget: {
        [authored.friendlyLeader.pieceKey]: { damageDice: [6, 6] },
      },
    },
    steamroller2026Decision: authored.steamroller2026Decision,
  };
  const transitions = [];
  const defensiveDecisions = [];
  let transition = applyRulesV1Action(enumeration.state, {
    ...inputAction,
    __warmachineTrustedRulesV1Enumeration: enumeration,
  });
  transitions.push(transition);
  let decisionCount = 0;
  while (transition.ok === true &&
      transition.nextState?.directHitTargetSwitchWindow?.active === true) {
    if (decisionCount >= 16) {
      throw new Error(
        "simultaneous_terminal_direct_hit_target_switch_loop_exceeded",
      );
    }
    const decisionEnumeration = enumerateRulesV1Actions(transition.nextState);
    const decline = (decisionEnumeration.actions || []).filter((candidate) =>
      candidate.metadata?.targetSwitchDecision === "decline" ||
      candidate.metadata?.protectiveRageChoice === "decline")
      .sort((left, right) => String(left.actionKey).localeCompare(
        String(right.actionKey),
      ))[0];
    if (!decline) {
      throw new Error(
        "simultaneous_terminal_direct_hit_target_switch_decline_missing",
      );
    }
    defensiveDecisions.push(stableGraphValue({
      actionKey: decline.actionKey,
      actionType: decline.actionType,
      actorPieceKey: decline.actorPieceKey,
      targetPieceKey: decline.targetPieceKey,
      targetSwitchDecision:
        decline.metadata?.targetSwitchDecision || "",
      protectiveRageChoice:
        decline.metadata?.protectiveRageChoice || "",
      targetSwitchTriggerKey:
        decline.metadata?.targetSwitchTriggerKey || "",
    }));
    transition = applyRulesV1Action(decisionEnumeration.state, {
      actionKey: decline.actionKey,
      __warmachineTrustedRulesV1Enumeration: decisionEnumeration,
    });
    transitions.push(transition);
    decisionCount += 1;
  }
  if (transition.ok !== true) {
    throw new Error(`simultaneous_terminal_execution_failed:${
      transition.reason || "unknown"}`);
  }
  const events = transitions.flatMap((entry) => entry.events || []);
  const predecessorStateHash = warmachineReverseStateSemanticHashV1(
    authored.state,
  );
  const terminalStateHash = warmachineReverseStateSemanticHashV1(
    transition.nextState || {},
  );
  const receiptCore = stableGraphValue({
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    predecessorStateHash,
    inputAction,
    actionKeys: transitions.map((entry) => entry.action?.actionKey || ""),
    defensiveDecisions,
    events,
    terminalStateHash,
    aoeSecondaryTargetKeys,
  });
  return {
    action,
    inputAction,
    transitions,
    transition,
    events,
    predecessorStateHash,
    terminalStateHash,
    defensiveDecisions,
    aoeSecondaryTargetKeys,
    receiptHash: stableGraphHash(receiptCore),
  };
}

function executeCandidate(authored = {}) {
  return [
    "wolves_experimental_warhead",
    "gorman_experimental_warhead_filter",
  ].includes(authored.executionKind)
    ? executeWolvesExperimentalWarheadCandidate(authored)
    : executeSprayCandidate(authored);
}

function sprayExecutionAudit(authored = {}, primary = {}, replay = {}) {
  const beforeFriendly = boxesRemaining(authored.friendlyLeader);
  const beforeEnemy = boxesRemaining(authored.enemyLeader);
  const primaryFriendly = primary.transition.nextState?.pieces?.find((piece) =>
    piece.pieceKey === authored.friendlyLeader.pieceKey);
  const primaryEnemy = primary.transition.nextState?.pieces?.find((piece) =>
    piece.pieceKey === authored.enemyLeader.pieceKey);
  const replayFriendly = replay.transition.nextState?.pieces?.find((piece) =>
    piece.pieceKey === authored.friendlyLeader.pieceKey);
  const replayEnemy = replay.transition.nextState?.pieces?.find((piece) =>
    piece.pieceKey === authored.enemyLeader.pieceKey);
  const directDamage = primary.events.find((event) =>
    event.eventType === "damage_applied" &&
    event.targetPieceKey === authored.enemyLeader.pieceKey);
  const secondaryDamage = primary.events.find((event) =>
    event.eventType === "spray_secondary_damage" &&
    event.targetPieceKey === authored.friendlyLeader.pieceKey);
  const terminalEvents = primary.events.filter((event) =>
    event.eventType === "terminal");
  const simultaneousEvents = primary.events.filter((event) =>
    event.eventType === "simultaneous_leader_destruction");
  const strictActionReplayCertified = primary.transition.ok === true &&
    replay.transition.ok === true &&
    primary.receiptHash === replay.receiptHash &&
    primary.terminalStateHash === replay.terminalStateHash &&
    stableGraphHash(primary.events) === stableGraphHash(replay.events) &&
    Boolean(directDamage) && Boolean(secondaryDamage) &&
    primary.events.some((event) =>
      event.eventType === "spray_simultaneous_damage_batch_resolved") &&
    boxesRemaining(primaryFriendly) === boxesRemaining(replayFriendly) &&
    boxesRemaining(primaryEnemy) === boxesRemaining(replayEnemy);
  return stableGraphValue({
    strictActionReplayCertified,
    suppliedMaximumDice: true,
    actorPieceKey: authored.actor.pieceKey,
    attackProfileKey: TOXIC_SPITTLE_PROFILE_KEY,
    spraySecondaryTargetKeys: (
      primary.action?.metadata?.spraySecondaryTargets || []
    ).map((row) => row.pieceKey),
    eventTypes: primary.events.map((event) => event.eventType),
    friendlyLeaderPieceKey: authored.friendlyLeader.pieceKey,
    enemyLeaderPieceKey: authored.enemyLeader.pieceKey,
    friendlyLeaderStartingBoxes: beforeFriendly,
    enemyLeaderStartingBoxes: beforeEnemy,
    friendlyLeaderMaximumBoxes: maximumBoxes(authored.friendlyLeader),
    enemyLeaderMaximumBoxes: maximumBoxes(authored.enemyLeader),
    friendlyLeaderDamage: Number(secondaryDamage?.damage || 0),
    enemyLeaderDamage: Number(directDamage?.damage || 0),
    friendlyLeaderEndingBoxes: boxesRemaining(primaryFriendly),
    enemyLeaderEndingBoxes: boxesRemaining(primaryEnemy),
    friendlyLeaderSurvived: warmachinePieceInPlayV1(primaryFriendly),
    enemyLeaderSurvived: warmachinePieceInPlayV1(primaryEnemy),
    terminalEventCount: terminalEvents.length,
    simultaneousLeaderDestructionEventCount: simultaneousEvents.length,
    requestedTerminalSatisfied: terminalEvents.length > 0 &&
      simultaneousEvents.length > 0,
    receiptHash: primary.receiptHash,
    replayReceiptHash: replay.receiptHash,
    terminalStateHash: primary.terminalStateHash,
    replayTerminalStateHash: replay.terminalStateHash,
    eventHash: stableGraphHash(primary.events),
    replayEventHash: stableGraphHash(replay.events),
  });
}

function wolvesExperimentalWarheadExecutionAudit(authored = {}, primary = {},
  replay = {}) {
  const finalState = primary.transition.nextState || {};
  const replayState = replay.transition.nextState || {};
  const finalFriendly = finalState.pieces?.find((piece) =>
    piece.pieceKey === authored.friendlyLeader.pieceKey);
  const finalEnemy = finalState.pieces?.find((piece) =>
    piece.pieceKey === authored.enemyLeader.pieceKey);
  const replayFriendly = replayState.pieces?.find((piece) =>
    piece.pieceKey === authored.friendlyLeader.pieceKey);
  const replayEnemy = replayState.pieces?.find((piece) =>
    piece.pieceKey === authored.enemyLeader.pieceKey);
  const directDamage = primary.events.find((event) =>
    event.eventType === "damage_applied" &&
    event.targetPieceKey === authored.enemyLeader.pieceKey);
  const secondaryDamage = primary.events.find((event) =>
    event.eventType === "aoe_blast_damage" &&
    event.targetPieceKey === authored.friendlyLeader.pieceKey);
  const rollEvent = primary.events.find((event) =>
    event.eventType === "strict_roll_outcome_applied");
  const settlement = [...primary.events].reverse().find((event) =>
    event.eventType === "steamroller_2026_turn_end_settled");
  const simultaneous = primary.events.find((event) =>
    event.eventType === "simultaneous_leader_destruction");
  const terminal = [...primary.events].reverse().find((event) =>
    event.eventType === "terminal");
  const directDeclines = primary.events.filter((event) =>
    event.eventType === "direct_hit_target_switch_declined");
  const shieldGuardDeclines = primary.events.filter((event) =>
    event.eventType === "shield_guard_declined");
  const fireApplied = primary.events.some((event) =>
    event.statusAdded === "continuous_fire" ||
    /continuous_fire_applied/.test(String(event.eventType || "")));
  const corrosionApplied = primary.events.some((event) =>
    event.statusAdded === "continuous_corrosion" ||
    /continuous_corrosion_applied/.test(String(event.eventType || "")));
  const scoreBefore = settlement?.scoreBefore || {};
  const scoreAfter = settlement?.scoreAfter || {};
  const tiebreakerResult = simultaneous?.tiebreakerResult || {};
  const wolvesAdditions = settlement?.postScoring?.additions || [];
  const strictActionReplayCertified = primary.transition.ok === true &&
    replay.transition.ok === true &&
    primary.receiptHash === replay.receiptHash &&
    primary.terminalStateHash === replay.terminalStateHash &&
    stableGraphHash(primary.events) === stableGraphHash(replay.events) &&
    stableGraphHash(primary.defensiveDecisions) ===
      stableGraphHash(replay.defensiveDecisions) &&
    Boolean(directDamage) && Boolean(secondaryDamage) &&
    boxesRemaining(finalFriendly) === 0 &&
    boxesRemaining(finalEnemy) === 0 &&
    boxesRemaining(finalFriendly) === boxesRemaining(replayFriendly) &&
    boxesRemaining(finalEnemy) === boxesRemaining(replayEnemy) &&
    warmachinePieceInPlayV1(finalFriendly) === false &&
    warmachinePieceInPlayV1(finalEnemy) === false &&
    directDeclines.length > 0 && shieldGuardDeclines.length > 0 &&
    rollEvent?.outcome?.hit === true &&
    stableGraphHash(rollEvent?.outcome?.attackDice || []) ===
      stableGraphHash([6, 6]) &&
    stableGraphHash(scoreBefore) === stableGraphHash({
      player1: 0,
      player2: 0,
    }) && stableGraphHash(scoreAfter) === stableGraphHash({
      player1: 1,
      player2: 1,
    }) && wolvesAdditions.length === 0 &&
    simultaneous?.winnerSideKey === authored.terminal?.winnerSideKey &&
    stableGraphHash(tiebreakerResult.score || {}) === stableGraphHash({
      player1: 6,
      player2: 3,
    }) && terminal?.winnerSideKey === authored.terminal?.winnerSideKey &&
    fireApplied && corrosionApplied;
  return stableGraphValue({
    strictActionReplayCertified,
    suppliedMaximumDice: true,
    actorPieceKey: authored.actor.pieceKey,
    attackProfileKey: primary.action?.metadata?.attackProfile?.profileKey || "",
    attackTypeChoice:
      primary.action?.metadata?.attackProfile?.attackTypeChoice || "",
    sourceWeaponId:
      primary.action?.metadata?.attackProfile?.sourceWeaponId || "",
    attackProbabilityEvidence: authored.attackProbabilityEvidence,
    aoeSecondaryTargetKeys: primary.aoeSecondaryTargetKeys,
    eventTypes: primary.events.map((event) => event.eventType),
    friendlyLeaderPieceKey: authored.friendlyLeader.pieceKey,
    enemyLeaderPieceKey: authored.enemyLeader.pieceKey,
    friendlyLeaderStartingBoxes: boxesRemaining(authored.friendlyLeader),
    enemyLeaderStartingBoxes: boxesRemaining(authored.enemyLeader),
    friendlyLeaderDamage: Number(secondaryDamage?.damage || 0),
    enemyLeaderDamage: Number(directDamage?.damage || 0),
    friendlyLeaderEndingBoxes: boxesRemaining(finalFriendly),
    enemyLeaderEndingBoxes: boxesRemaining(finalEnemy),
    friendlyLeaderSurvived: warmachinePieceInPlayV1(finalFriendly),
    enemyLeaderSurvived: warmachinePieceInPlayV1(finalEnemy),
    directHitTargetSwitchDeclineCount: directDeclines.length,
    shieldGuardDeclineCount: shieldGuardDeclines.length,
    defensiveDecisions: primary.defensiveDecisions,
    continuousFireApplied: fireApplied,
    continuousCorrosionApplied: corrosionApplied,
    scoreBefore,
    scoreAfter,
    scoringRows: settlement?.scored || [],
    wolvesAdditions,
    tiebreakerResult,
    simultaneousLeaderDestructionEvent: simultaneous || null,
    terminalEvent: terminal || null,
    requestedTerminalSatisfied: strictActionReplayCertified,
    receiptHash: primary.receiptHash,
    replayReceiptHash: replay.receiptHash,
    predecessorStateHash: primary.predecessorStateHash,
    terminalStateHash: primary.terminalStateHash,
    replayTerminalStateHash: replay.terminalStateHash,
    eventHash: stableGraphHash(primary.events),
    replayEventHash: stableGraphHash(replay.events),
  });
}

function gormanExperimentalWarheadFilterExecutionAudit(authored = {},
  primary = {}, replay = {}) {
  const finalState = primary.transition.nextState || {};
  const replayState = replay.transition.nextState || {};
  const finalFriendly = finalState.pieces?.find((piece) =>
    piece.pieceKey === authored.friendlyLeader.pieceKey);
  const finalEnemy = finalState.pieces?.find((piece) =>
    piece.pieceKey === authored.enemyLeader.pieceKey);
  const replayFriendly = replayState.pieces?.find((piece) =>
    piece.pieceKey === authored.friendlyLeader.pieceKey);
  const replayEnemy = replayState.pieces?.find((piece) =>
    piece.pieceKey === authored.enemyLeader.pieceKey);
  const directDamage = primary.events.find((event) =>
    event.eventType === "damage_applied" &&
    event.targetPieceKey === authored.enemyLeader.pieceKey);
  const secondaryDamage = primary.events.find((event) =>
    event.eventType === "aoe_blast_damage" &&
    event.targetPieceKey === authored.friendlyLeader.pieceKey);
  const automaticMiss = primary.events.some((event) => [
    "attack_automatically_missed",
    "strict_automatic_miss_outcome_applied",
  ].includes(event.eventType));
  const terminalEvents = primary.events.filter((event) =>
    event.eventType === "terminal");
  const simultaneousEvents = primary.events.filter((event) =>
    event.eventType === "simultaneous_leader_destruction");
  const stealthExpected = authored.stealthInteractionEvidence
    ?.automaticMiss === true;
  const damageResolutionPassed = stealthExpected
    ? automaticMiss && !directDamage && !secondaryDamage &&
      boxesRemaining(finalFriendly) === boxesRemaining(authored.friendlyLeader) &&
      boxesRemaining(finalEnemy) === boxesRemaining(authored.enemyLeader)
    : Boolean(directDamage) && Boolean(secondaryDamage);
  const strictActionReplayCertified = primary.transition.ok === true &&
    replay.transition.ok === true &&
    primary.receiptHash === replay.receiptHash &&
    primary.terminalStateHash === replay.terminalStateHash &&
    stableGraphHash(primary.events) === stableGraphHash(replay.events) &&
    stableGraphHash(primary.defensiveDecisions) ===
      stableGraphHash(replay.defensiveDecisions) &&
    damageResolutionPassed &&
    boxesRemaining(finalFriendly) === boxesRemaining(replayFriendly) &&
    boxesRemaining(finalEnemy) === boxesRemaining(replayEnemy) &&
    warmachinePieceInPlayV1(finalFriendly) === true &&
    warmachinePieceInPlayV1(finalEnemy) === true &&
    terminalEvents.length === 0 && simultaneousEvents.length === 0;
  return stableGraphValue({
    strictActionReplayCertified,
    suppliedMaximumDice: true,
    actorPieceKey: authored.actor.pieceKey,
    attackProfileKey: primary.action?.metadata?.attackProfile?.profileKey || "",
    attackTypeChoice:
      primary.action?.metadata?.attackProfile?.attackTypeChoice || "",
    sourceWeaponId:
      primary.action?.metadata?.attackProfile?.sourceWeaponId || "",
    aoeSecondaryTargetKeys: primary.aoeSecondaryTargetKeys,
    eventTypes: primary.events.map((event) => event.eventType),
    friendlyLeaderPieceKey: authored.friendlyLeader.pieceKey,
    enemyLeaderPieceKey: authored.enemyLeader.pieceKey,
    friendlyLeaderStartingBoxes: boxesRemaining(authored.friendlyLeader),
    enemyLeaderStartingBoxes: boxesRemaining(authored.enemyLeader),
    friendlyLeaderMaximumBoxes: maximumBoxes(authored.friendlyLeader),
    enemyLeaderMaximumBoxes: maximumBoxes(authored.enemyLeader),
    friendlyLeaderDamage: Number(secondaryDamage?.damage || 0),
    enemyLeaderDamage: Number(directDamage?.damage || 0),
    friendlyLeaderEndingBoxes: boxesRemaining(finalFriendly),
    enemyLeaderEndingBoxes: boxesRemaining(finalEnemy),
    friendlyLeaderSurvived: warmachinePieceInPlayV1(finalFriendly),
    enemyLeaderSurvived: warmachinePieceInPlayV1(finalEnemy),
    automaticMissExpected: stealthExpected,
    automaticMissObserved: automaticMiss,
    directHitTargetSwitchDeclineCount: primary.events.filter((event) =>
      event.eventType === "direct_hit_target_switch_declined").length,
    shieldGuardDeclineCount: primary.events.filter((event) =>
      event.eventType === "shield_guard_declined").length,
    terminalEventCount: terminalEvents.length,
    simultaneousLeaderDestructionEventCount: simultaneousEvents.length,
    requestedTerminalSatisfied: false,
    receiptHash: primary.receiptHash,
    replayReceiptHash: replay.receiptHash,
    predecessorStateHash: primary.predecessorStateHash,
    terminalStateHash: primary.terminalStateHash,
    replayTerminalStateHash: replay.terminalStateHash,
    eventHash: stableGraphHash(primary.events),
    replayEventHash: stableGraphHash(replay.events),
  });
}

function executionAudit(authored = {}, primary = {}, replay = {}) {
  return authored.executionKind === "wolves_experimental_warhead"
    ? wolvesExperimentalWarheadExecutionAudit(authored, primary, replay)
    : authored.executionKind === "gorman_experimental_warhead_filter"
      ? gormanExperimentalWarheadFilterExecutionAudit(
        authored,
        primary,
        replay,
      )
    : sprayExecutionAudit(authored, primary, replay);
}

export function materializeWarmachineMatchupSimultaneousTerminalTaskV1({
  terminalTask = {},
  groupPlan = {},
  opening = {},
  plan = {},
  evidenceCorpus = {},
} = {}) {
  let terminal;
  let validated;
  try {
    if (!warmachineMatchupSimultaneousTerminalTaskSupportedV1(terminalTask)) {
      throw new Error("simultaneous_terminal_task_exact_supported_task_required");
    }
    terminal = validateTaskReceipts(terminalTask);
    validateOpening(terminalTask, opening, terminal);
    validatePlanAndGroup(terminalTask, groupPlan, plan);
    validated = validateEvidenceCorpus(
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
  const hostRepresentative = mappedHostRepresentative(
    terminalTask,
    terminal,
    validated.cell,
    evidenceCorpus,
  );
  if (!hostRepresentative) {
    return inputInvalid(
      terminalTask,
      opening,
      "simultaneous_terminal_task_host_role_representative_missing",
    );
  }
  const mappingAudit = representativeMappingAudit(
    terminalTask,
    terminal,
    validated.cell,
    hostRepresentative,
  );
  if (!mappingAudit.exactPartitionMappingProven) {
    return inputInvalid(
      terminalTask,
      opening,
      "simultaneous_terminal_task_partition_mapping_failed",
      { mappingAudit },
    );
  }
  const authored = authorState(
    opening,
    terminalTask.representative,
    terminal,
    terminalTask,
  );
  if (!authored.state) {
    return proposalFiltered(
      terminalTask,
      opening,
      authored.reason || "simultaneous_terminal_exact_state_missing",
      {
        completeRealRosterState: false,
        modelCount: 0,
        representativeMappingAudit: mappingAudit,
      },
    );
  }
  const partitionAudit = exactPartitionAudit(
    authored,
    opening,
    terminalTask.representative,
    terminal,
  );
  if (!partitionAudit.ok) {
    return proposalFiltered(
      terminalTask,
      opening,
      "simultaneous_terminal_exact_partition_audit_failed",
      {
        completeRealRosterState: true,
        modelCount: authored.state.pieces.length,
        partitionAudit,
        representativeMappingAudit: mappingAudit,
      },
      { authoredState: authored.state },
    );
  }
  if (!authored.action) {
    if (authored.hostRejection) {
      return strictRejected(
        terminalTask,
        opening,
        String(authored.hostRejection.rejection?.reason ||
          "simultaneous_terminal_action_host_rejected"),
        {
          taskKey: terminalTask.taskKey,
          actionType: authored.hostRejection.actionType,
          actorPieceKey: authored.actor.pieceKey,
          targetPieceKey: authored.enemyLeader.pieceKey,
          attackProfileKey:
            authored.hostRejection.metadata?.attackProfile?.profileKey ||
            authored.hostRejection.metadata?.attackProfile?.sourceWeaponId ||
            TOXIC_SPITTLE_PROFILE_KEY,
          rejection: authored.hostRejection.rejection || {},
          partitionAudit,
          lineOfSightEvidence: authored.losEvidence,
          representativeMappingAudit: mappingAudit,
        },
      );
    }
    return proposalFiltered(
      terminalTask,
      opening,
      "simultaneous_terminal_legal_action_missing_without_host_reject",
      {
        completeRealRosterState: true,
        modelCount: authored.state.pieces.length,
        representativeMappingAudit: mappingAudit,
      },
    );
  }
  let primary;
  let replay;
  try {
    primary = executeCandidate(authored);
    replay = executeCandidate({
      ...authored,
      state: structuredClone(authored.state),
    });
  } catch (error) {
    return inputInvalid(
      terminalTask,
      opening,
      String(error?.message || error),
      { partitionAudit, representativeMappingAudit: mappingAudit },
    );
  }
  const strictExecution = executionAudit(authored, primary, replay);
  if (!strictExecution.strictActionReplayCertified) {
    return inputInvalid(
      terminalTask,
      opening,
      "simultaneous_terminal_strict_action_replay_mismatch",
      { strictExecution, partitionAudit, representativeMappingAudit: mappingAudit },
    );
  }
  if (authored.executionKind === "wolves_experimental_warhead") {
    if (!strictExecution.requestedTerminalSatisfied) {
      return proposalFiltered(
        terminalTask,
        opening,
        "simultaneous_terminal_wolves_experimental_warhead_not_terminal",
        {
          strictActionReplayCertified: true,
          completeRealRosterState: true,
          modelCount: authored.state.pieces.length,
          partitionAudit,
          representativeMappingAudit: mappingAudit,
          strictExecution,
          candidateOnlyFiltered: true,
          hostRejectedAction: false,
          requestedTerminalSatisfied: false,
        },
        {
          authoredState: authored.state,
          primary,
          replay,
          strictExecution,
        },
      );
    }
    const terminalState = primary.transition.nextState || {};
    const finalWinnerObjective = (terminalState.scenario?.objectives || [])
      .find((objective) =>
        objective.objectiveKey === authored.winnerObjective.objectiveKey);
    const root = stableGraphValue({
      taskKey: terminalTask.taskKey,
      taskRepresentativeSubcellKey:
        terminalTask.representative.subcellKey,
      hostRepresentativeSubcellKey: hostRepresentative.subcellKey,
      scenarioKey: terminalTask.representative.scenarioKey,
      roundNumber: Number(terminalTask.representative.roundNumber),
      terminalClassKey: terminalTask.representative.terminalClassKey,
      terminalCauseKey:
        terminalTask.representative.canonicalTerminal?.causalActionFamily,
      winnerSideKey: terminal.winnerSideKey,
      loserSideKey: terminal.loserSideKey,
      endingSideKey: terminal.endingSideKey,
      actorPieceKey: authored.actor.pieceKey,
      actorCardId: pieceCardId(authored.actor),
      actorLabel: String(authored.actor.label || authored.actor.name || ""),
      friendlyLeaderPieceKey: authored.friendlyLeader.pieceKey,
      friendlyLeaderCardId: pieceCardId(authored.friendlyLeader),
      enemyLeaderPieceKey: authored.enemyLeader.pieceKey,
      enemyLeaderCardId: pieceCardId(authored.enemyLeader),
      actionKey: primary.action.actionKey,
      actionType: primary.action.actionType,
      attackProfileKey:
        primary.action.metadata?.attackProfile?.profileKey || "",
      sourceWeaponId:
        primary.action.metadata?.attackProfile?.sourceWeaponId || "",
      attackTypeChoice:
        primary.action.metadata?.attackProfile?.attackTypeChoice || "",
      attackProbabilityEvidence: authored.attackProbabilityEvidence,
      partitionCoordinates: terminalTask.representative.coordinates,
      partitionAudit,
      representativeMappingAudit: mappingAudit,
      completeRealRosterState: true,
      modelCount: authored.state.pieces.length,
      inPlayModelCount: partitionAudit.inPlayModelCount,
      priorLossPieceKeys: [],
      geometry: authored.geometry,
      lineOfSightEvidence: authored.losEvidence,
      stealthInteractionEvidence: authored.stealthInteractionEvidence,
      aoeSecondaryTargetKeys: primary.aoeSecondaryTargetKeys,
      defensiveDecisions: primary.defensiveDecisions,
      wolvesDecision: authored.steamroller2026Decision.wolves,
      objectiveProgressTokensBefore:
        Number(authored.winnerObjective.progressTokens || 0),
      objectiveProgressTokensAfter:
        Number(finalWinnerObjective?.progressTokens || 0),
      scoreBefore: strictExecution.scoreBefore,
      scoreAfter: strictExecution.scoreAfter,
      scoringRows: strictExecution.scoringRows,
      wolvesAdditions: strictExecution.wolvesAdditions,
      tiebreakerResult: strictExecution.tiebreakerResult,
      strictExecution,
      receiptHash: strictExecution.receiptHash,
      replayReceiptHash: strictExecution.replayReceiptHash,
      predecessorStateHash: strictExecution.predecessorStateHash,
      terminalStateHash: strictExecution.terminalStateHash,
      replayTerminalStateHash: strictExecution.replayTerminalStateHash,
      strictReplayCertified: true,
    });
    return strictMaterialized(terminalTask, opening, root, {
      authoredState: authored.state,
      placementAudit: authored.placementAudit,
      formationAudit: authored.formationAudit,
      terrainAudit: authored.terrainAudit,
      winnerObjectiveControl: authored.winnerObjectiveControl,
      loserTerrainControl: authored.loserTerrainControl,
      primary,
      replay,
      strictExecution,
    });
  }
  const evidence = stableGraphValue({
    strictActionReplayCertified: true,
    completeRealRosterState: true,
    modelCount: authored.state.pieces.length,
    taskKey: terminalTask.taskKey,
    taskRepresentativeSubcellKey: terminalTask.representative.subcellKey,
    hostRepresentativeSubcellKey: hostRepresentative.subcellKey,
    sourceResolutionStatus:
      terminalTask.representative.sourceResolutionStatus,
    requestedTerminalClassKey: TERMINAL_CLASS,
    requestedDamagePartition:
      terminalTask.representative.coordinates.damage,
    requestedTiebreakClassKey: validated.cell.tiebreakClassKey,
    partitionAudit,
    representativeMappingAudit: mappingAudit,
    strictExecution,
    fullHealthMaximumRollStillLeavesBothLeadersInPlay:
      strictExecution.friendlyLeaderSurvived === true &&
      strictExecution.enemyLeaderSurvived === true,
    requestedTerminalSatisfied: strictExecution.requestedTerminalSatisfied,
    hostRejectedAction: false,
    candidateOnlyFiltered: true,
    claimBoundary: authored.executionKind ===
        "gorman_experimental_warhead_filter"
      ? "This task-specific artifact proves one exact complete-roster Gorman Experimental Warhead action and independent replay, then filters only that candidate because the full-health or Stealth partition does not remove both Leaders. It is not a Host rejection, family-level unreachability, deployment route, strategy result, win rate or training truth."
      : "This task-specific artifact proves one exact complete-roster Strygon Toxic Spittle action and independent replay, then filters only that candidate because its full-health partition does not remove both Leaders. It is not a Host rejection, family-level unreachability, deployment route, strategy result, win rate or training truth.",
  });
  return proposalFiltered(
    terminalTask,
    opening,
    authored.executionKind === "gorman_experimental_warhead_filter"
      ? authored.stealthInteractionEvidence?.automaticMiss === true
        ? "simultaneous_terminal_gorman_stealth_automatic_miss_not_terminal"
        : "simultaneous_terminal_full_health_gorman_warhead_not_lethal"
      : "simultaneous_terminal_full_health_spray_not_lethal",
    evidence,
    {
      authoredState: authored.state,
      placementAudit: authored.placementAudit,
      formationAudit: authored.formationAudit,
      terrainAudit: authored.terrainAudit,
      centerControl: authored.centerControl,
      presenceControl: authored.presenceControl,
      priorLossPieceKeys: authored.priorLossPieceKeys,
      authoredModelBlocker: authored.authoredModelBlocker,
      channeler: authored.channeler,
      lineOfSightEvidence: authored.losEvidence,
      geometry: authored.geometry,
      controllerRouteEvidence: authored.controllerRouteEvidence,
      primary,
      replay,
      strictExecution,
    },
  );
}

export function warmachineMatchupSimultaneousTerminalTaskSupportedV1(
  terminalTask = {},
) {
  return SUPPORTED_TASK_KEYS.has(terminalTask.taskKey) &&
    terminalTask.executionEnvelope?.actionCategory === ACTION_CATEGORY &&
    (exactSupportedCoordinates(terminalTask.representative) ||
      pressurePointSprayFilterCoordinates(terminalTask.representative) ||
      wolvesExperimentalWarheadCoordinates(terminalTask.representative) ||
      gormanExperimentalWarheadFilterCoordinates(
        terminalTask.representative,
      ));
}

export function buildWarmachineMatchupSimultaneousTerminalTaskAdapterV1() {
  return Object.freeze({
    supports: ({ terminalTask } = {}) =>
      warmachineMatchupSimultaneousTerminalTaskSupportedV1(terminalTask),
    materialize: materializeWarmachineMatchupSimultaneousTerminalTaskV1,
  });
}
