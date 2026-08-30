import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { buildWarmachineCompositeExecutionReceiptV1 } from
  "../contracts/search-execution-receipt-v1.mjs";
import { warmachinePieceInPlayV1 } from "../reverse/piece-lifecycle-v1.mjs";
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
import { setWarmachineNativeResourcesForTerminalSeedV1 } from
  "./two-fronts-score-terminal-seed-v1.mjs";

export const WARMACHINE_MATCHUP_FIXED_ROUND_TERMINAL_TASK_MATERIALIZER_V1_SCHEMA =
  "warmachine_matchup_fixed_round_terminal_task_materializer_v1";

const FIXED_TERMINAL_CLASS = "fixed_round_limit_result";
const FIXED_ACTION_CATEGORY = "defender_fixed_round_turn_end_settlement";
const SIDE_KEY_BY_TASK_SIDE = Object.freeze({
  subject: "player1",
  challenger: "player2",
});
const CURRENT_EXECUTION_RECEIPT = buildWarmachineCompositeExecutionReceiptV1({
  hostReceipt: warmachineHost.receipt,
  constructionHostReceipt: warmachineConstructionHost.receipt,
  focusedEngineReceipt: warmachineHost.focusedSourceReceipt,
});

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
    if (!canonicalSideKey && ["winner", "loser"].includes(role)) {
      if (taskSideKey) {
        throw new Error(`fixed_round_task_${role}_side_binding_unexpected`);
      }
      terminal[`${role}SideKey`] = "";
      continue;
    }
    if (!expectedTaskSideKey || taskSideKey !== expectedTaskSideKey ||
        !SIDE_KEY_BY_TASK_SIDE[taskSideKey]) {
      throw new Error(`fixed_round_task_${role}_side_binding_mismatch`);
    }
    terminal[`${role}SideKey`] = SIDE_KEY_BY_TASK_SIDE[taskSideKey];
  }
  return stableGraphValue(terminal);
}

function isLeader(piece = {}) {
  return piece.isWarcaster === true || piece.isWarlock === true ||
    piece.isLeader === true ||
    /warcaster|warlock|leader/i.test(
      `${piece.modelRole || ""} ${piece.modelType || ""}`,
    );
}

function baseRadiusIn(piece = {}) {
  return Number(piece.baseSizeIn || piece.baseDiameterIn || 1.18) / 2;
}

function sealedReport(terminalTask = {}, opening = {}, disposition = {}, detail = {}) {
  const core = stableGraphValue({
    schemaVersion:
      WARMACHINE_MATCHUP_FIXED_ROUND_TERMINAL_TASK_MATERIALIZER_V1_SCHEMA,
    terminalRootKind: "fixed_round_limit_result",
    terminalTaskKey: String(terminalTask.taskKey || ""),
    taskKey: String(terminalTask.taskKey || ""),
    groupKey: String(terminalTask.groupKey || ""),
    cellKey: String(terminalTask.representative?.cellKey || ""),
    subcellKey: String(terminalTask.representative?.subcellKey || ""),
    representativeSubcellKey: String(
      terminalTask.representative?.subcellKey || "",
    ),
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
    matchupTerminalRootProven: disposition.disposition === "strict_materialized" &&
      detail.root?.strictReplayCertified === true,
    genericCapabilityPinsCountAsTaskRoute: false,
    historicalReachabilityProven: false,
    deploymentToTerminalReachabilityProven: false,
    trainingTruth: false,
    ...detail,
    claimBoundary: disposition.claimBoundary ||
      "This task-specific artifact proves only the reported current-Host disposition for one authored round-seven predecessor using the exact real-roster opening. It does not prove a route from deployment, strategy value, win rate, exhaustive coverage or training truth.",
  });
  return stableGraphValue({ ...core, reportHash: stableGraphHash(core) });
}

function inputInvalid(terminalTask, opening, reason, evidence = {}) {
  return {
    report: sealedReport(terminalTask, opening, {
      disposition: "input_invalid",
      authority: "input_contract",
      reason,
    }, { inputValidationEvidence: stableGraphValue(evidence) }),
    runtime: null,
  };
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

function validateEvidenceCorpus(evidenceCorpus = {}, representative = {}) {
  const cacheCore = { ...evidenceCorpus };
  const cacheHash = String(cacheCore.cacheHash || "");
  delete cacheCore.cacheHash;
  if (!cacheHash || stableGraphHash(cacheCore) !== cacheHash) {
    throw new Error("fixed_round_task_evidence_cache_hash_invalid");
  }
  if (evidenceCorpus.hostReceiptHash !== warmachineHost.receipt.receiptHash ||
      evidenceCorpus.corpus?.hostReceiptHash !==
        warmachineHost.receipt.receiptHash) {
    throw new Error("fixed_round_task_evidence_host_receipt_drift");
  }
  if (evidenceCorpus.evidenceCorpus?.corpusHash !==
      evidenceCorpus.corpus?.corpusHash ||
      evidenceCorpus.evidenceCorpus?.representativeSelectionHash !==
        evidenceCorpus.representativeSelection?.selectionHash) {
    throw new Error("fixed_round_task_evidence_internal_binding_mismatch");
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
    throw new Error("fixed_round_task_representative_selection_mismatch");
  }
  const cell = (evidenceCorpus.corpus?.cells || []).find((row) =>
    row.cellKey === representative.cellKey);
  const canonical = representative.canonicalTerminal || {};
  if (!cell || cell.dependencyReceipt?.hostReceiptHash !==
      warmachineHost.receipt.receiptHash ||
      cell.terminalClassKey !== FIXED_TERMINAL_CLASS ||
      cell.causalActionFamily !== FIXED_ACTION_CATEGORY ||
      cell.scenarioKey !== representative.scenarioKey ||
      Number(cell.roundClass?.representativeRoundNumber) !==
        Number(representative.roundNumber) ||
      cell.sourceResolutionStatus !== representative.sourceResolutionStatus ||
      cell.resultKind !== canonical.resultKind ||
      String(cell.winnerSideKey || "") !== String(canonical.winnerSideKey || "") ||
      String(cell.loserSideKey || "") !== String(canonical.loserSideKey || "") ||
      cell.endingSideKey !== canonical.endingSideKey ||
      cell.attackerSideKey !== canonical.attackerSideKey ||
      cell.defenderSideKey !== canonical.defenderSideKey) {
    throw new Error("fixed_round_task_corpus_cell_mismatch");
  }
  for (const [partitionKey, value] of Object.entries(
    representative.coordinates || {},
  )) {
    if (!cell.partitions?.[partitionKey]?.includes(value)) {
      throw new Error(
        `fixed_round_task_partition_outside_cell:${partitionKey}:${value}`,
      );
    }
  }
  return { cell, selected };
}

function validateTaskReceipts(task = {}) {
  const envelope = task.executionEnvelope || {};
  const envelopeCore = { ...envelope };
  const envelopeHash = String(envelopeCore.executionEnvelopeHash || "");
  delete envelopeCore.executionEnvelopeHash;
  if (!envelopeHash || stableGraphHash(envelopeCore) !== envelopeHash) {
    throw new Error("fixed_round_task_execution_envelope_hash_invalid");
  }
  const identity = taskIdentity(task);
  if (task.taskKey !==
      `matchup-terminal-task-${stableGraphHash(identity).slice(0, 32)}`) {
    throw new Error("fixed_round_task_identity_hash_invalid");
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
    throw new Error("fixed_round_task_host_or_construction_receipt_drift");
  }
  taskTerminal(task);
}

function validateOpening(task = {}, opening = {}) {
  const representative = task.representative || {};
  const envelope = task.executionEnvelope || {};
  const terminal = taskTerminal(task);
  const expectedFirstSideKey = task.firstPlayerTaskSideKey === "challenger"
    ? "player2" : "player1";
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
    throw new Error("fixed_round_task_opening_binding_mismatch");
  }
  if (!(opening.state.pieces || []).some((piece) => piece.sideKey === "player1") ||
      !(opening.state.pieces || []).some((piece) => piece.sideKey === "player2")) {
    throw new Error("fixed_round_task_opening_two_rosters_required");
  }
}

function validateInputs(terminalTask = {}, opening = {}, evidenceCorpus = {}) {
  if (terminalTask.representative?.terminalClassKey !== FIXED_TERMINAL_CLASS ||
      terminalTask.executionEnvelope?.actionCategory !== FIXED_ACTION_CATEGORY) {
    throw new Error("fixed_round_terminal_task_kind_required");
  }
  validateTaskReceipts(terminalTask);
  validateOpening(terminalTask, opening);
  return validateEvidenceCorpus(evidenceCorpus, terminalTask.representative);
}

function prepareBaseState(opening = {}, representative = {}, terminal = {}) {
  const state = structuredClone(opening.state);
  state.strictMode = true;
  state.enforceStrictExecutor = true;
  state.activeSideKey = terminal.endingSideKey;
  state.phaseKey = "activation";
  state.turnNumber = Number(representative.roundNumber);
  state.outcome = null;
  state.terminal = null;
  state.activePieceKey = "";
  state.activeActivationPieceKey = "";
  state.scenario.score = { player1: 0, player2: 0 };
  state.scenario.scoringHistory = [];
  for (const field of WARMACHINE_RULES_V1_RUNTIME_WINDOW_FIELDS) {
    state[field] = null;
  }
  for (const piece of state.pieces || []) {
    piece.activated = true;
    piece.activationKey = "";
  }
  state.metadata = {
    ...(state.metadata || {}),
    strictMode: true,
    enforceStrictExecutor: true,
    authoredMatchupFixedRoundTerminalTask: true,
  };
  state.stateKey = `matchup-fixed-round-predecessor:${
    representative.subcellKey}`;
  return state;
}

function exactPartitionAudit(
  state = {},
  representative = {},
  opening = {},
  terminal = {},
) {
  const coordinates = representative.coordinates || {};
  const lifecycleRows = (state.pieces || []).map((piece) => ({
    pieceKey: piece.pieceKey,
    inPlay: warmachinePieceInPlayV1(piece),
  }));
  const damageRows = (state.pieces || []).flatMap((piece) => {
    const maximum = Number(piece.damage?.maxBoxes ?? piece.maxBoxes);
    if (!Number.isFinite(maximum) || maximum <= 0) return [];
    return [{
      pieceKey: piece.pieceKey,
      boxesRemaining: Number(
        piece.damage?.boxesRemaining ?? piece.boxesRemaining ?? maximum,
      ),
      maxBoxes: maximum,
      inPlay: warmachinePieceInPlayV1(piece),
    }];
  });
  const resourceRows = (state.pieces || []).flatMap((piece) => {
    const maximum = Number(
      piece.resourceMax ?? piece.focusMax ?? piece.furyMax ?? 0,
    );
    if (!Number.isFinite(maximum) || maximum <= 0) return [];
    return [{
      pieceKey: piece.pieceKey,
      resourcePoints: Number(piece.resourcePoints || 0),
      resourceMax: maximum,
    }];
  });
  const terrainAudit = auditRulesV1SteamrollerScenarioTerrainSetup(state);
  const outOfPlayPieces = (state.pieces || []).filter((piece) =>
    !warmachinePieceInPlayV1(piece));
  const reserveHistoryPieces = outOfPlayPieces.filter((piece) =>
    piece.canAmbush === true && piece.offTable === true &&
    piece.notDeployed === true && piece.destroyed !== true &&
    piece.removedFromPlay !== true && Boolean(piece.unitGroupId));
  const reserveGroupKeys = [...new Set(reserveHistoryPieces.map((piece) =>
    String(piece.unitGroupId || "")).filter(Boolean))].sort();
  const reserveGroupRows = reserveGroupKeys.map((unitGroupId) => {
    const group = (state.pieces || []).filter((piece) =>
      String(piece.unitGroupId || "") === unitGroupId);
    const eligibleMembers = group.filter((piece) =>
      piece.canAmbush === true && piece.canDeployFromReserve === true);
    return stableGraphValue({
      unitGroupId,
      eligiblePieceKeys: eligibleMembers.map((piece) =>
        piece.pieceKey).sort(),
      inPlayNonAmbushPieceKeys: group.filter((piece) =>
        piece.canAmbush !== true && warmachinePieceInPlayV1(piece)).map(
          (piece) => piece.pieceKey,
        ).sort(),
      allEligibleMembersInReserve: eligibleMembers.length > 0 &&
        eligibleMembers.every((piece) => reserveHistoryPieces.some(
          (candidate) => candidate.pieceKey === piece.pieceKey,
        )),
    });
  });
  const reserveHistoryPassed = reserveGroupKeys.some((unitGroupId) => {
    const row = reserveGroupRows.find((candidate) =>
      candidate.unitGroupId === unitGroupId);
    return row?.allEligibleMembersInReserve === true;
  }) && outOfPlayPieces.every((piece) =>
    reserveHistoryPieces.some((candidate) =>
      candidate.pieceKey === piece.pieceKey));
  const checks = {
    lifecycle: coordinates.lifecycle === "both_rosters_complete"
      ? lifecycleRows.length === state.pieces.length &&
        lifecycleRows.every((row) => row.inPlay)
      : coordinates.lifecycle === "winner_prior_losses"
        ? lifecycleRows.some((row) => !row.inPlay &&
          state.pieces?.find((piece) => piece.pieceKey === row.pieceKey)
            ?.sideKey === terminal.winnerSideKey) &&
          lifecycleRows.filter((row) => !row.inPlay).every((row) => {
            const piece = state.pieces?.find((candidate) =>
              candidate.pieceKey === row.pieceKey);
            return piece?.sideKey === terminal.winnerSideKey &&
              piece.destroyed === true && !isLeader(piece);
          }) &&
          (state.pieces || []).filter(isLeader).every((piece) =>
            warmachinePieceInPlayV1(piece))
        : coordinates.lifecycle ===
            "reserve_replacement_or_dormant_history"
          ? reserveHistoryPassed &&
            (state.pieces || []).filter(isLeader).every((piece) =>
              warmachinePieceInPlayV1(piece))
        : false,
    damage: coordinates.damage === "critical_models_undamaged" &&
      damageRows.filter((row) => row.inPlay).every((row) =>
        row.boxesRemaining === row.maxBoxes),
    resource: coordinates.resource === "zero_available"
      ? resourceRows.every((row) => row.resourcePoints === 0)
      : coordinates.resource === "maximum_native_resource"
        ? resourceRows.length > 0 && resourceRows.every((row) =>
          row.resourcePoints === row.resourceMax)
        : coordinates.resource === "one_additional_purchase_available"
          ? resourceRows.filter((row) => row.resourcePoints > 0).length === 1 &&
            resourceRows.some((row) => row.resourcePoints === 1 &&
              state.pieces?.find((piece) => piece.pieceKey === row.pieceKey)
                ?.isWarjack === true)
        : false,
    scenarioTerrainSetup: terrainAudit.ok === true &&
      terrainAudit.setupClassKey ===
        opening.scenarioTerrainSetupClassKey,
  };
  if (coordinates.payloadLifecycle) {
    const payloads = (state.scenario?.objectives || []).filter((objective) =>
      Number(objective.baseSizeMm) === 50);
    checks.payloadLifecycle =
      coordinates.payloadLifecycle === "both_payloads_active" &&
      payloads.length === 2 && payloads.every((objective) =>
        objective.active !== false && objective.removedFromPlay !== true &&
        objective.delivered !== true);
  }
  if (coordinates.trenchCacheLifecycle) {
    const caches = state.scenario?.caches || [];
    checks.trenchCacheLifecycle =
      coordinates.trenchCacheLifecycle === "both_caches_active" &&
      caches.length === 2 && caches.every((cache) => cache.active !== false);
  }
  let highStakesCountdownEvidence = null;
  if (coordinates.highStakesCountdownState) {
    const elements = [
      ...(state.scenario?.objectives || []).filter((objective) =>
        Number(objective.baseSizeMm) === 50),
      ...(state.terrain || []).filter((terrain) =>
        terrain.isScenarioTerrain || terrain.scenarioTerrain ||
        terrain.scenarioElement),
    ].filter((element) => Number.isFinite(Number(element.countdownTokens)));
    const rows = elements.map((element) => ({
      elementKey: String(element.objectiveKey || element.terrainKey || ""),
      countdownTokens: Number(element.countdownTokens),
    })).sort((left, right) => left.elementKey.localeCompare(right.elementKey));
    checks.highStakesCountdownState =
      coordinates.highStakesCountdownState ===
        "one_nonzero_element_reduced" &&
      rows.length === 3 &&
      rows.filter((row) => row.countdownTokens > 0 &&
        row.countdownTokens < 5).length === 1 &&
      rows.filter((row) => row.countdownTokens === 5).length === 2;
    highStakesCountdownEvidence = stableGraphValue({ rows });
  }
  let scenarioControlEvidence = null;
  if (coordinates.scenarioControl) {
    const report = scoreScenarioElements(state);
    const controlRows = [
      ...(report.objectiveControl || []),
      ...(report.scenarioTerrainControl || []),
      ...(report.zoneControl || []),
      ...(report.flagControl || []),
    ];
    if (coordinates.scenarioControl === "not_applicable") {
      checks.scenarioControl = true;
    } else if (coordinates.scenarioControl === "contested") {
      const contestedRow = controlRows.find((row) =>
        (row.contestingSides || []).includes("player1") &&
        (row.contestingSides || []).includes("player2") &&
        !(row.securingSides || []).length &&
        !String(row.controllingSideKey || ""));
      checks.scenarioControl = Boolean(contestedRow);
      scenarioControlEvidence = stableGraphValue({
        requestedMode: coordinates.scenarioControl,
        contestedRow: contestedRow || null,
        controlReportHash: stableGraphHash(report),
      });
    } else {
      checks.scenarioControl = false;
      scenarioControlEvidence = stableGraphValue({
        requestedMode: coordinates.scenarioControl,
        reason: "fixed_round_scenario_control_partition_not_implemented",
        controlReportHash: stableGraphHash(report),
      });
    }
  }
  return stableGraphValue({
    checks,
    passed: Object.values(checks).every(Boolean),
    lifecycleRows,
    damageRows,
    resourceRows,
    reserveHistoryEvidence: stableGraphValue({
      reserveGroupKeys,
      reserveGroupRows,
      reservePieceKeys: reserveHistoryPieces.map((piece) =>
        piece.pieceKey).sort(),
      outOfPlayPieceKeys: outOfPlayPieces.map((piece) =>
        piece.pieceKey).sort(),
    }),
    highStakesCountdownEvidence,
    scenarioControlEvidence,
    scenarioTerrainSetupAuditHash: stableGraphHash(terrainAudit),
  });
}

function partitionCapabilityAuditForTask(
  terminalTask = {},
  opening = {},
  context = {},
) {
  const audit = context.partitionCapabilityAuditsByTaskKey?.[
    terminalTask.taskKey
  ];
  if (!audit) return null;
  const core = { ...audit };
  const declaredHash = String(core.auditHash || "");
  delete core.auditHash;
  if (!declaredHash || stableGraphHash(core) !== declaredHash ||
      audit.schemaVersion !==
        "warmachine_matchup_terminal_partition_capability_audit_v1" ||
      audit.taskKey !== terminalTask.taskKey ||
      audit.openingKey !== opening.openingKey ||
      audit.strictOpeningStateHash !== opening.strictOpeningStateHash ||
      audit.hostReceiptHash !== warmachineHost.receipt.receiptHash ||
      audit.constructionHostReceiptHash !==
        warmachineConstructionHost.receipt.receiptHash) {
    throw new Error("fixed_round_task_partition_capability_audit_invalid");
  }
  return audit;
}

function supportsPayloadPresenceRoot(representative = {}, cell = {}) {
  const expected = {
    baseTopology: "legal_separated",
    damage: "critical_models_undamaged",
    leaderControl: "on_boundary",
    lifecycle: "both_rosters_complete",
    madeToHaulDecision: "not_triggered",
    payloadLifecycle: "both_payloads_active",
    payloadMoveDecision: "eligible_move_declined",
    resource: "zero_available",
    scenarioControl: "not_applicable",
    scenarioTerrainSetup: "all_flags_fallback_no_valid_terrain",
  };
  return representative.scenarioKey === "payload" &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.resultKind === "win" &&
    cell.tiebreakClassKey ===
      "victory_points_tied_scenario_presence_advantage" &&
    stableGraphHash(representative.coordinates || {}) === stableGraphHash(expected);
}

function supportsPressurePointVictoryPointRoot(representative = {}, cell = {}) {
  const expected = {
    baseTopology: "legal_separated",
    damage: "critical_models_undamaged",
    leaderControl: "outside_or_not_required",
    lifecycle: "both_rosters_complete",
    resource: "one_additional_purchase_available",
    scenarioControl: "not_applicable",
    scenarioTerrainSetup: "all_flags_fallback_no_valid_terrain",
  };
  return representative.scenarioKey === "pressure_point" &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.resultKind === "win" &&
    cell.tiebreakClassKey === "victory_point_advantage" &&
    stableGraphHash(representative.coordinates || {}) === stableGraphHash(expected);
}

function supportsPressurePointWinnerPriorLossVictoryPointRoot(
  representative = {},
  cell = {},
) {
  const expected = {
    baseTopology: "legal_separated",
    damage: "critical_models_undamaged",
    leaderControl: "outside_or_not_required",
    lifecycle: "winner_prior_losses",
    resource: "zero_available",
    scenarioControl: "not_applicable",
    scenarioTerrainSetup: "all_flags_fallback_no_valid_terrain",
  };
  return representative.scenarioKey === "pressure_point" &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.resultKind === "win" &&
    cell.tiebreakClassKey === "victory_point_advantage" &&
    stableGraphHash(representative.coordinates || {}) === stableGraphHash(expected);
}

function supportsTerminalPaymentIncompatibilityFilter(representative = {}) {
  return representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.causalActionFamily ===
      FIXED_ACTION_CATEGORY &&
    representative.coordinates?.resource === "exact_terminal_payment";
}

function supportsControllerRouteIncompatibilityFilter(representative = {}) {
  return representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.causalActionFamily ===
      FIXED_ACTION_CATEGORY &&
    representative.coordinates?.resource ===
      "controller_transfer_or_channel_available";
}

function supportsHighStakesReserveScenarioPresenceRoot(
  representative = {},
  cell = {},
) {
  const expected = {
    baseTopology: "legal_separated",
    damage: "critical_models_undamaged",
    highStakesBlastClosure: "no_detonation",
    highStakesCountdownState: "one_nonzero_element_reduced",
    highStakesFuseResolution: "secured_50mm_remove_one",
    leaderControl: "outside_or_not_required",
    lifecycle: "reserve_replacement_or_dormant_history",
    resource: "zero_available",
    scenarioControl: "not_applicable",
    scenarioTerrainSetup: "all_flags_fallback_no_valid_terrain",
  };
  return representative.scenarioKey === "high_stakes" &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.resultKind === "win" &&
    cell.tiebreakClassKey ===
      "victory_points_tied_scenario_presence_advantage" &&
    stableGraphHash(representative.coordinates || {}) === stableGraphHash(expected);
}

function supportsFaultLineScenarioPresenceRoot(representative = {}, cell = {}) {
  const expected = {
    baseTopology: "legal_separated",
    damage: "critical_models_undamaged",
    leaderControl: "outside_or_not_required",
    lifecycle: "both_rosters_complete",
    resource: "maximum_native_resource",
    scenarioControl: "not_applicable",
    scenarioTerrainSetup: "not_applicable",
  };
  return representative.scenarioKey === "fault_line" &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.resultKind === "win" &&
    cell.tiebreakClassKey ===
      "victory_points_tied_scenario_presence_advantage" &&
    stableGraphHash(representative.coordinates || {}) === stableGraphHash(expected);
}

function supportsFaultLineContestedScenarioPresenceRoot(
  representative = {},
  cell = {},
) {
  const expected = {
    baseTopology: "legal_separated",
    damage: "critical_models_undamaged",
    leaderControl: "outside_or_not_required",
    lifecycle: "both_rosters_complete",
    resource: "zero_available",
    scenarioControl: "contested",
    scenarioTerrainSetup: "not_applicable",
  };
  return representative.scenarioKey === "fault_line" &&
    representative.sourceResolutionStatus === "officially_confirmed" &&
    representative.canonicalTerminal?.resultKind === "win" &&
    cell.tiebreakClassKey ===
      "victory_points_tied_scenario_presence_advantage" &&
    stableGraphHash(representative.coordinates || {}) === stableGraphHash(expected);
}

function setPieceNativeResource(piece = {}, amount = 0) {
  const value = Number(amount || 0);
  if ("resourcePoints" in piece) piece.resourcePoints = value;
  if ("focusPoints" in piece) piece.focusPoints = value;
  if ("furyPoints" in piece) piece.furyPoints = value;
  if ("focus" in piece) piece.focus = value;
  if ("fury" in piece) piece.fury = value;
  if ("resource2" in piece) piece.resource2 = value;
}

function authorOneAdditionalPurchaseResource(state = {}) {
  setWarmachineNativeResourcesForTerminalSeedV1(state, "zero_available");
  const warjack = (state.pieces || []).find((piece) =>
    piece.isWarjack === true && warmachinePieceInPlayV1(piece) &&
    Number(piece.resourceMax ?? piece.focusMax ?? 0) >= 1);
  if (!warjack) return null;
  setPieceNativeResource(warjack, 1);
  return warjack.pieceKey;
}

function markPriorLoss(piece = {}) {
  piece.damage = { ...(piece.damage || {}), boxesRemaining: 0 };
  if ("boxesRemaining" in piece) piece.boxesRemaining = 0;
  piece.destroyed = true;
  piece.destroyedTriggerOccurred = true;
  piece.damageLifecycleStage = "destroyed";
  piece.removedFromPlay = false;
  piece.activated = false;
  piece.activationKey = "";
  piece.offTable = true;
  piece.notDeployed = true;
  piece.statusTags = [...new Set([
    ...(piece.statusTags || []),
    "destroyed",
    "off_table",
    "not_deployed",
  ])].sort();
}

function authorWinnerPriorLoss(state = {}, terminal = {}) {
  const candidate = (state.pieces || []).filter((piece) =>
    piece.sideKey === terminal.winnerSideKey && !isLeader(piece) &&
    warmachinePieceInPlayV1(piece)).sort((left, right) =>
    String(left.pieceKey || "").localeCompare(String(right.pieceKey || "")))[0];
  if (!candidate) return "";
  markPriorLoss(candidate);
  return candidate.pieceKey;
}

function authorAmbushReserveHistory(state = {}) {
  const groups = new Map();
  for (const piece of state.pieces || []) {
    if (!piece.unitGroupId || piece.canAmbush !== true ||
        !warmachinePieceInPlayV1(piece)) continue;
    const rows = groups.get(piece.unitGroupId) || [];
    rows.push(piece);
    groups.set(piece.unitGroupId, rows);
  }
  for (const [unitGroupId, members] of [...groups.entries()].sort(([left], [right]) =>
    String(left).localeCompare(String(right)))) {
    const eligibleMembers = members.filter((piece) =>
      piece.canDeployFromReserve === true);
    if (!eligibleMembers.length || eligibleMembers.length !== members.length) {
      continue;
    }
    const inPlayNonAmbushMembers = (state.pieces || []).filter((piece) =>
      String(piece.unitGroupId || "") === String(unitGroupId) &&
      piece.canAmbush !== true && warmachinePieceInPlayV1(piece));
    for (const piece of eligibleMembers) {
      piece.offTable = true;
      piece.notDeployed = true;
      piece.activated = false;
      piece.activationKey = "";
      piece.statusTags = [...new Set([
        ...(piece.statusTags || []),
        "off_table",
        "not_deployed",
      ])].sort();
    }
    return stableGraphValue({
      unitGroupId: String(unitGroupId),
      pieceKeys: eligibleMembers.map((piece) => piece.pieceKey).sort(),
      inPlayNonAmbushPieceKeys: inPlayNonAmbushMembers.map((piece) =>
        piece.pieceKey).sort(),
      sourceCapability: "canAmbush",
    });
  }
  return null;
}

function authorLeaderScenarioPresenceGeometry(state = {}, terminal = {}) {
  const leader = (state.pieces || []).find((piece) =>
    piece.sideKey === terminal.winnerSideKey && isLeader(piece) &&
    warmachinePieceInPlayV1(piece));
  const objective = (state.scenario?.objectives || []).find((row) =>
    row.active !== false && Number(row.baseSizeMm) === 50 &&
    row.ownerSideKey === terminal.winnerSideKey);
  if (!leader || !objective) return null;
  const objectiveRadiusIn = Number(
    objective.baseRadiusIn || Number(objective.baseSizeMm) / 25.4 / 2,
  );
  const centerDistanceIn = objectiveRadiusIn + baseRadiusIn(leader) + 0.2;
  for (let angleIndex = 0; angleIndex < 32; angleIndex += 1) {
    const authored = structuredClone(state);
    const authoredLeader = authored.pieces.find((piece) =>
      piece.pieceKey === leader.pieceKey);
    const angle = angleIndex * Math.PI / 16;
    authoredLeader.position = {
      xIn: Number(objective.xIn) + Math.cos(angle) * centerDistanceIn,
      yIn: Number(objective.yIn) + Math.sin(angle) * centerDistanceIn,
    };
    const normalized = normalizeRulesV1State(authored);
    const placementAudit = auditRulesV1StaticPlacement(normalized);
    if (!placementAudit.ok) continue;
    const formationAudit = auditRulesV1StaticUnitFormation(normalized);
    if (!formationAudit.ok) continue;
    const control = scoreScenarioElements(normalized);
    const objectiveControl = (control.objectiveControl || []).find((row) =>
      row.objectiveKey === objective.objectiveKey);
    if (!objectiveControl?.securingSides?.includes(
      terminal.winnerSideKey,
    )) continue;
    return {
      state: normalized,
      placementAudit,
      formationAudit,
      geometryEvidence: stableGraphValue({
        leaderPieceKey: leader.pieceKey,
        objectiveKey: objective.objectiveKey,
        objectiveOwnerSideKey: objective.ownerSideKey,
        objectiveBaseSizeMm: Number(objective.baseSizeMm),
        leaderPosition: authoredLeader.position,
        objectivePosition: {
          xIn: Number(objective.xIn),
          yIn: Number(objective.yIn),
        },
        centerDistanceIn,
        objectiveControl,
      }),
    };
  }
  return null;
}

function scenarioContestingSolo(piece = {}) {
  return warmachinePieceInPlayV1(piece) && !isLeader(piece) &&
    !piece.unitGroupId && !piece.unitId &&
    piece.isWarjack !== true && piece.isWarbeast !== true &&
    piece.isBattleEngine !== true &&
    !/warjack|warbeast|battle[\s_-]*engine|cohort/i.test(
      `${piece.modelRole || ""} ${piece.modelType || ""}`,
    );
}

function authorContestedLeaderScenarioPresenceGeometry(
  state = {},
  terminal = {},
) {
  const winnerLeader = (state.pieces || []).find((piece) =>
    piece.sideKey === terminal.winnerSideKey && isLeader(piece) &&
    warmachinePieceInPlayV1(piece));
  const presenceObjective = (state.scenario?.objectives || []).find((row) =>
    row.active !== false && Number(row.baseSizeMm) === 50 &&
    row.ownerSideKey === terminal.winnerSideKey);
  const contestedObjectives = (state.scenario?.objectives || []).filter((row) =>
    row.active !== false && Number(row.baseSizeMm) === 40);
  const winnerSoloCandidates = (state.pieces || []).filter((piece) =>
    piece.sideKey === terminal.winnerSideKey && scenarioContestingSolo(piece));
  const loserSoloCandidates = (state.pieces || []).filter((piece) =>
    piece.sideKey === terminal.loserSideKey && scenarioContestingSolo(piece));
  if (!winnerLeader || !presenceObjective || !contestedObjectives.length ||
      !winnerSoloCandidates.length || !loserSoloCandidates.length) return null;

  const presenceRadius = Number(
    presenceObjective.baseRadiusIn ||
    Number(presenceObjective.baseSizeMm) / 25.4 / 2,
  );
  for (const contestedObjective of contestedObjectives) {
    const contestedRadius = Number(
      contestedObjective.baseRadiusIn ||
      Number(contestedObjective.baseSizeMm) / 25.4 / 2,
    );
    for (const winnerSolo of winnerSoloCandidates) {
      for (const loserSolo of loserSoloCandidates) {
        for (let angleIndex = 0; angleIndex < 32; angleIndex += 1) {
          const authored = structuredClone(state);
          const authoredLeader = authored.pieces.find((piece) =>
            piece.pieceKey === winnerLeader.pieceKey);
          const authoredWinnerSolo = authored.pieces.find((piece) =>
            piece.pieceKey === winnerSolo.pieceKey);
          const authoredLoserSolo = authored.pieces.find((piece) =>
            piece.pieceKey === loserSolo.pieceKey);
          const leaderAngle = angleIndex * Math.PI / 16;
          const contestAngle = (angleIndex * 7 % 32) * Math.PI / 16;
          authoredLeader.position = {
            xIn: Number(presenceObjective.xIn) + Math.cos(leaderAngle) *
              (presenceRadius + baseRadiusIn(winnerLeader) + 0.2),
            yIn: Number(presenceObjective.yIn) + Math.sin(leaderAngle) *
              (presenceRadius + baseRadiusIn(winnerLeader) + 0.2),
          };
          authoredWinnerSolo.position = {
            xIn: Number(contestedObjective.xIn) + Math.cos(contestAngle) *
              (contestedRadius + baseRadiusIn(winnerSolo) + 0.2),
            yIn: Number(contestedObjective.yIn) + Math.sin(contestAngle) *
              (contestedRadius + baseRadiusIn(winnerSolo) + 0.2),
          };
          authoredLoserSolo.position = {
            xIn: Number(contestedObjective.xIn) - Math.cos(contestAngle) *
              (contestedRadius + baseRadiusIn(loserSolo) + 0.2),
            yIn: Number(contestedObjective.yIn) - Math.sin(contestAngle) *
              (contestedRadius + baseRadiusIn(loserSolo) + 0.2),
          };
          const normalized = normalizeRulesV1State(authored);
          const placementAudit = auditRulesV1StaticPlacement(normalized);
          if (!placementAudit.ok) continue;
          const formationAudit = auditRulesV1StaticUnitFormation(normalized);
          if (!formationAudit.ok) continue;
          const control = scoreScenarioElements(normalized);
          const contestedRow = (control.objectiveControl || []).find((row) =>
            row.objectiveKey === contestedObjective.objectiveKey &&
            (row.contestingSides || []).includes("player1") &&
            (row.contestingSides || []).includes("player2") &&
            !(row.securingSides || []).length);
          if (!contestedRow) continue;
          return {
            state: normalized,
            placementAudit,
            formationAudit,
            geometryEvidence: stableGraphValue({
              leaderPieceKey: winnerLeader.pieceKey,
              objectiveKey: presenceObjective.objectiveKey,
              contestedObjectiveKey: contestedObjective.objectiveKey,
              winnerContestingPieceKey: winnerSolo.pieceKey,
              loserContestingPieceKey: loserSolo.pieceKey,
              leaderPosition: authoredLeader.position,
              winnerContestingPosition: authoredWinnerSolo.position,
              loserContestingPosition: authoredLoserSolo.position,
              contestedRow,
            }),
          };
        }
      }
    }
  }
  return null;
}

function authorHighStakesReservePresenceGeometry(state = {}, terminal = {}) {
  const reserveHistory = authorAmbushReserveHistory(state);
  const leader = (state.pieces || []).find((piece) =>
    piece.sideKey === terminal.winnerSideKey && isLeader(piece) &&
    warmachinePieceInPlayV1(piece));
  const objective = (state.scenario?.objectives || []).find((row) =>
    row.active !== false && Number(row.baseSizeMm) === 50);
  const countdownElements = [
    ...(state.scenario?.objectives || []).filter((row) =>
      Number(row.baseSizeMm) === 50),
    ...(state.terrain || []).filter((terrain) =>
      terrain.isScenarioTerrain || terrain.scenarioTerrain ||
      terrain.scenarioElement),
  ].sort((left, right) => String(
    left.objectiveKey || left.terrainKey || "",
  ).localeCompare(String(right.objectiveKey || right.terrainKey || "")));
  if (!reserveHistory || !leader || !objective ||
      countdownElements.length !== 3) return null;
  for (const element of countdownElements) {
    element.countdownTokens = 5;
    element.countdownDetonated = false;
  }
  const fuseTarget = countdownElements.find((element) =>
    Boolean(element.terrainKey)) || countdownElements[0];
  fuseTarget.countdownTokens = 4;
  const objectiveRadiusIn = Number(
    objective.baseRadiusIn || Number(objective.baseSizeMm) / 25.4 / 2,
  );
  const centerDistanceIn = objectiveRadiusIn + baseRadiusIn(leader) + 0.2;
  for (let angleIndex = 0; angleIndex < 32; angleIndex += 1) {
    const authored = structuredClone(state);
    const authoredLeader = authored.pieces.find((piece) =>
      piece.pieceKey === leader.pieceKey);
    const angle = angleIndex * Math.PI / 16;
    authoredLeader.position = {
      xIn: Number(objective.xIn) + Math.cos(angle) * centerDistanceIn,
      yIn: Number(objective.yIn) + Math.sin(angle) * centerDistanceIn,
    };
    const normalized = normalizeRulesV1State(authored);
    const placementAudit = auditRulesV1StaticPlacement(normalized);
    if (!placementAudit.ok) continue;
    const formationAudit = auditRulesV1StaticUnitFormation(normalized);
    if (!formationAudit.ok) continue;
    const control = scoreScenarioElements(normalized);
    const objectiveControl = (control.objectiveControl || []).find((row) =>
      row.objectiveKey === objective.objectiveKey);
    if (!objectiveControl?.securingSides?.includes(
      terminal.winnerSideKey,
    )) continue;
    return {
      state: normalized,
      placementAudit,
      formationAudit,
      actionPatch: stableGraphValue({
        steamroller2026Decision: {
          highStakes: {
            fuseRoll: 1,
            fuseTargetKey: String(
              fuseTarget.objectiveKey || fuseTarget.terrainKey || "",
            ),
          },
        },
      }),
      geometryEvidence: stableGraphValue({
        leaderPieceKey: leader.pieceKey,
        objectiveKey: objective.objectiveKey,
        fuseTargetKey: String(
          fuseTarget.objectiveKey || fuseTarget.terrainKey || "",
        ),
        leaderPosition: authoredLeader.position,
        reserveHistory,
        objectiveControl,
      }),
    };
  }
  return null;
}

function supportsOutsideTableReject(representative = {}) {
  const coordinates = representative.coordinates || {};
  return coordinates.baseTopology === "outside_table_expected_reject" &&
    coordinates.lifecycle === "both_rosters_complete" &&
    coordinates.damage === "critical_models_undamaged" &&
    coordinates.resource === "zero_available" &&
    coordinates.leaderControl === "outside_or_not_required" &&
    coordinates.scenarioControl === "not_applicable";
}

function payloadGeometryCandidates(state = {}, representative = {}, terminal = {}) {
  const winnerSideKey = terminal.winnerSideKey;
  const endingSideKey = terminal.endingSideKey;
  const objective = (state.scenario?.objectives || []).find((row) =>
    row.active !== false && Number(row.baseSizeMm) === 50 &&
    row.ownerSideKey === winnerSideKey);
  const winnerLeader = (state.pieces || []).find((piece) =>
    piece.sideKey === winnerSideKey && isLeader(piece) &&
    warmachinePieceInPlayV1(piece));
  const controller = (state.pieces || []).find((piece) =>
    piece.sideKey === endingSideKey && isLeader(piece) &&
    Number(piece.controlRangeIn || 0) > 0 && warmachinePieceInPlayV1(piece));
  const cohort = controller && (state.pieces || []).find((piece) =>
    piece.sideKey === endingSideKey && warmachinePieceInPlayV1(piece) &&
    String(piece.controllerPieceKey || piece.controllerKey || "") ===
      String(controller.pieceKey || ""));
  if (!objective || !winnerLeader || !controller || !cohort) return [];
  const objectiveOffset = Number(objective.baseRadiusIn ||
    Number(objective.baseSizeMm) / 25.4 / 2) + baseRadiusIn(winnerLeader) + 0.2;
  const boardWidth = Number(state.board?.widthIn || state.board?.width || 48);
  const boardHeight = Number(state.board?.heightIn || state.board?.height || 48);
  const anchors = [
    { xIn: 3, yIn: 12 },
    { xIn: boardWidth - 3, yIn: 12 },
    { xIn: 3, yIn: boardHeight - 12 },
    { xIn: boardWidth - 3, yIn: boardHeight - 12 },
    { xIn: boardWidth / 2, yIn: 12 },
    { xIn: boardWidth / 2, yIn: boardHeight - 12 },
  ];
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  const rows = [];
  for (let angleIndex = 0; angleIndex < 16; angleIndex += 1) {
    const angle = angleIndex * Math.PI / 8;
    const winnerPosition = {
      xIn: Number(objective.xIn) + Math.cos(angle) * objectiveOffset,
      yIn: Number(objective.yIn) + Math.sin(angle) * objectiveOffset,
    };
    for (const anchor of anchors) {
      for (const direction of directions) {
        const centerDistance = Number(controller.controlRangeIn) +
          baseRadiusIn(controller) + baseRadiusIn(cohort);
        rows.push({
          objective,
          winnerLeader,
          controller,
          cohort,
          winnerPosition,
          controllerPosition: anchor,
          cohortPosition: {
            xIn: anchor.xIn + direction.x * centerDistance,
            yIn: anchor.yIn + direction.y * centerDistance,
          },
        });
      }
    }
  }
  return rows;
}

function authorPayloadPresenceGeometry(state = {}, representative = {}, terminal = {}) {
  for (const candidate of payloadGeometryCandidates(
    state,
    representative,
    terminal,
  )) {
    const authored = structuredClone(state);
    const winnerLeader = authored.pieces.find((piece) =>
      piece.pieceKey === candidate.winnerLeader.pieceKey);
    const controller = authored.pieces.find((piece) =>
      piece.pieceKey === candidate.controller.pieceKey);
    const cohort = authored.pieces.find((piece) =>
      piece.pieceKey === candidate.cohort.pieceKey);
    winnerLeader.position = structuredClone(candidate.winnerPosition);
    controller.position = structuredClone(candidate.controllerPosition);
    cohort.position = structuredClone(candidate.cohortPosition);
    const normalized = normalizeRulesV1State(authored);
    const placementAudit = auditRulesV1StaticPlacement(normalized);
    if (!placementAudit.ok) continue;
    const formationAudit = auditRulesV1StaticUnitFormation(normalized);
    if (!formationAudit.ok) continue;
    const normalizedController = normalized.pieces.find((piece) =>
      piece.pieceKey === controller.pieceKey);
    const normalizedCohort = normalized.pieces.find((piece) =>
      piece.pieceKey === cohort.pieceKey);
    const observedControlDistanceIn = closestPointDistanceIn(
      normalizedController,
      normalizedCohort,
    );
    if (Math.abs(observedControlDistanceIn -
        Number(normalizedController.controlRangeIn)) > 0.000001) continue;
    const control = scoreScenarioElements(normalized);
    const objectiveControl = (control.objectiveControl || []).find((row) =>
      row.objectiveKey === candidate.objective.objectiveKey);
    if (!objectiveControl?.securingSides?.includes(
      terminal.winnerSideKey,
    )) continue;
    return {
      state: normalized,
      placementAudit,
      formationAudit,
      geometryEvidence: stableGraphValue({
        winnerLeaderPieceKey: winnerLeader.pieceKey,
        securedObjectiveKey: candidate.objective.objectiveKey,
        controllerPieceKey: controller.pieceKey,
        controlledCohortPieceKey: cohort.pieceKey,
        requestedControlRangeIn: Number(normalizedController.controlRangeIn),
        observedControlEdgeDistanceIn: observedControlDistanceIn,
        leaderControlPartition: "on_boundary",
        objectiveControl,
      }),
    };
  }
  return null;
}

function payloadDeclinePatch(state = {}) {
  const report = scoreScenarioElements(state);
  const moveByObjectiveKey = {};
  for (const row of report.objectiveControl || []) {
    const objective = (state.scenario?.objectives || []).find((entry) =>
      entry.objectiveKey === row.objectiveKey);
    if (objective?.active !== false && Number(objective?.baseSizeMm) === 50 &&
        row.securingSides?.includes(objective.ownerSideKey)) {
      moveByObjectiveKey[objective.objectiveKey] = { decline: true };
    }
  }
  return stableGraphValue({
    steamroller2026Decision: { payload: { moveByObjectiveKey } },
  });
}

function executeEndTurn(state = {}, actionPatch = {}) {
  const enumeration = enumerateRulesV1Actions(state, {
    actionFamilyKeys: ["timing"],
  });
  const action = (enumeration.actions || []).find((candidate) =>
    candidate.actionType === "end_turn");
  if (!action) {
    return { ok: false, reason: "fixed_round_task_end_turn_not_enumerated", enumeration };
  }
  const inputAction = {
    actionKey: action.actionKey,
    ...actionPatch,
    __warmachineTrustedRulesV1Enumeration: enumeration,
  };
  const transition = applyRulesV1Action(state, inputAction);
  const predecessorStateHash = warmachineReverseStateSemanticHashV1(
    enumeration.state || state,
  );
  const terminalStateHash = warmachineReverseStateSemanticHashV1(
    transition.nextState || {},
  );
  const receiptCore = stableGraphValue({
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash:
      warmachineConstructionHost.receipt.receiptHash,
    predecessorStateHash,
    actionKey: action.actionKey,
    actionPatch,
    events: transition.events || [],
    terminalStateHash,
  });
  return {
    ok: transition.ok === true,
    reason: String(transition.reason || transition.rejection?.reason || ""),
    action,
    actionPatch,
    enumeration,
    transition,
    predecessorStateHash,
    terminalStateHash,
    receiptHash: stableGraphHash(receiptCore),
  };
}

function publicExecution(execution = {}) {
  return stableGraphValue({
    ok: execution.ok === true,
    reason: execution.reason || "",
    actionKey: execution.action?.actionKey || "",
    actionType: execution.action?.actionType || "",
    actionPatch: execution.actionPatch || {},
    predecessorStateHash: execution.predecessorStateHash || "",
    terminalStateHash: execution.terminalStateHash || "",
    receiptHash: execution.receiptHash || "",
    events: execution.transition?.events || [],
    nextState: execution.transition?.nextState || null,
  });
}

function materializeOutsideTableReject(task, opening) {
  const representative = task.representative;
  const requested = taskTerminal(task);
  let state = prepareBaseState(opening, representative, requested);
  setWarmachineNativeResourcesForTerminalSeedV1(state, "zero_available");
  const partitionAudit = exactPartitionAudit(
    state,
    representative,
    opening,
    requested,
  );
  if (!partitionAudit.passed) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_outside_table_partition_authoring_failed",
      }, { partitionAudit }),
      runtime: null,
    };
  }
  const affected = state.pieces.find((piece) =>
    piece.sideKey === requested.loserSideKey &&
    isLeader(piece) && warmachinePieceInPlayV1(piece));
  if (!affected) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_outside_table_leader_missing",
      }, { partitionAudit }),
      runtime: null,
    };
  }
  affected.position = {
    xIn: -baseRadiusIn(affected) - 0.25,
    yIn: Number(affected.position?.yIn || 24),
  };
  state = normalizeRulesV1State(state);
  const placementAudit = auditRulesV1StaticPlacement(state);
  if (placementAudit.ok) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_outside_table_proposal_unexpectedly_legal",
      }, { partitionAudit }),
      runtime: { state, placementAudit },
    };
  }
  const predecessorStateHash = warmachineReverseStateSemanticHashV1(state);
  const receiptHash = stableGraphHash({
    operation: "rules_v1_static_placement_audit",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash:
      warmachineConstructionHost.receipt.receiptHash,
    predecessorStateHash,
    audit: placementAudit,
  });
  const issueCodes = (placementAudit.issues || []).map((issue) =>
    String(issue.code || issue.reason || "")).filter(Boolean).sort();
  const root = stableGraphValue({
    disposition: "strict_rejected",
    authority: "rules_v1_host",
    taskKey: task.taskKey,
    cellKey: representative.cellKey,
    subcellKey: representative.subcellKey,
    scenarioKey: representative.scenarioKey,
    roundNumber: representative.roundNumber,
    endingSideKey: requested.endingSideKey,
    partitionCoordinates: representative.coordinates,
    affectedPieceKey: affected.pieceKey,
    topology: "outside_table_expected_reject",
    predecessorStateHash,
    staticPlacementAuditHash: stableGraphHash(placementAudit),
    staticPlacementIssueCodes: issueCodes,
    receiptHash,
    strictReplayCertified: false,
  });
  return {
    report: sealedReport(task, opening, {
      disposition: "strict_rejected",
      authority: "rules_v1_host",
      reason: "fixed_round_terminal_static_placement_rejected",
      strictRulesConclusion: true,
    }, { partitionAudit, root }),
    runtime: { state, placementAudit },
  };
}

function materializeTerminalPaymentIncompatibilityFilter(task, opening) {
  const representative = task.representative || {};
  const requested = taskTerminal(task);
  const incompatibilityEvidence = stableGraphValue({
    requestedResourcePartition:
      representative.coordinates?.resource || "",
    requestedCausalActionFamily:
      representative.canonicalTerminal?.causalActionFamily || "",
    exactTerminalActionType: "end_turn",
    exactTerminalActionSpendsNativeResource: false,
    exactTerminalPaymentWitnessPossible: false,
    relationAuthority: "terminal_candidate_contract",
    hostRulesConclusion: false,
  });
  return {
    report: sealedReport(task, opening, {
      disposition: "proposal_filtered",
      authority: "search_relation",
      reason: "fixed_round_terminal_payment_partition_incompatible",
      claimBoundary: "This exact candidate requires the terminal action itself to spend its exact native-resource payment, while the fixed-round terminal action is the resource-free end_turn settlement. The candidate is filtered before Host execution; this is not a rules rejection, family-level unreachability claim or statement about other preceding actions.",
    }, {
      requestedTerminal: requested,
      incompatibilityEvidence,
    }),
    runtime: null,
  };
}

function materializeControllerRouteIncompatibilityFilter(task, opening) {
  const representative = task.representative || {};
  const requested = taskTerminal(task);
  const incompatibilityEvidence = stableGraphValue({
    requestedResourcePartition:
      representative.coordinates?.resource || "",
    requestedCausalActionFamily:
      representative.canonicalTerminal?.causalActionFamily || "",
    exactTerminalActionType: "end_turn",
    exactTerminalActionUsesControllerTransfer: false,
    exactTerminalActionUsesSpellChannel: false,
    controllerOrChannelRouteWitnessPossible: false,
    relationAuthority: "terminal_candidate_contract",
    hostRulesConclusion: false,
  });
  return {
    report: sealedReport(task, opening, {
      disposition: "proposal_filtered",
      authority: "search_relation",
      reason: "fixed_round_controller_or_channel_route_partition_incompatible",
      claimBoundary: "This exact candidate requires the terminal route to use a controller transfer or spell-channel relationship, while its only terminal action is end_turn. A structurally available controller/cohort pair cannot substitute for use in this task-specific route. This filters only this candidate and makes no claim about prior actions or family-level reachability.",
    }, {
      requestedTerminal: requested,
      incompatibilityEvidence,
    }),
    runtime: null,
  };
}

function materializePayloadPresenceRoot(task, opening, cell) {
  const representative = task.representative;
  const requested = taskTerminal(task);
  let baseState = prepareBaseState(opening, representative, requested);
  setWarmachineNativeResourcesForTerminalSeedV1(baseState, "zero_available");
  const authored = authorPayloadPresenceGeometry(
    baseState,
    representative,
    requested,
  );
  if (!authored) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_payload_exact_geometry_missing",
      }),
      runtime: null,
    };
  }
  baseState = authored.state;
  const partitionAudit = exactPartitionAudit(
    baseState,
    representative,
    opening,
    requested,
  );
  if (!partitionAudit.passed) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_payload_partition_authoring_failed",
      }, { partitionAudit, geometryEvidence: authored.geometryEvidence }),
      runtime: null,
    };
  }
  const actionPatch = payloadDeclinePatch(baseState);
  const declinedPayloadKeys = Object.keys(
    actionPatch.steamroller2026Decision?.payload?.moveByObjectiveKey || {},
  ).sort();
  if (!declinedPayloadKeys.length) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_payload_decline_target_missing",
      }, { partitionAudit, geometryEvidence: authored.geometryEvidence }),
      runtime: null,
    };
  }

  baseState.scenario.score = { player1: 0, player2: 0 };
  const calibration = executeEndTurn(baseState, actionPatch);
  if (!calibration.ok) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_payload_calibration_transition_failed",
      }, {
        partitionAudit,
        geometryEvidence: authored.geometryEvidence,
        calibration: publicExecution(calibration),
      }),
      runtime: null,
    };
  }
  const calibratedScore = calibration.transition.nextState?.scenario?.score || {};
  const player1Gain = Number(calibratedScore.player1 || 0);
  const player2Gain = Number(calibratedScore.player2 || 0);
  const scoreBefore = {
    player1: Math.max(0, player2Gain - player1Gain),
    player2: Math.max(0, player1Gain - player2Gain),
  };
  const predecessor = structuredClone(baseState);
  predecessor.scenario.score = scoreBefore;
  predecessor.stateKey = `matchup-fixed-round-strict-predecessor:${
    representative.subcellKey}`;
  const primary = executeEndTurn(predecessor, actionPatch);
  const replay = executeEndTurn(predecessor, actionPatch);
  const roundLimitEvent = (primary.transition?.events || []).find((event) =>
    event.eventType === "scenario_round_limit");
  const terminalEvent = (primary.transition?.events || []).find((event) =>
    event.eventType === "terminal" &&
    event.reason === "scenario_round_limit_tiebreak");
  const replayRoundLimit = (replay.transition?.events || []).find((event) =>
    event.eventType === "scenario_round_limit");
  const scoreAfter = primary.transition?.nextState?.scenario?.score || {};
  const presence = roundLimitEvent?.tiebreakerResult?.scenarioPresence || {};
  const payloadMoveEvents = (primary.transition?.events || []).filter((event) =>
    event.eventType === "payload_objective_moved");
  const strictMatch = primary.ok && replay.ok &&
    primary.predecessorStateHash === replay.predecessorStateHash &&
    primary.terminalStateHash === replay.terminalStateHash &&
    primary.receiptHash === replay.receiptHash &&
    Number(roundLimitEvent?.completedRound) === Number(representative.roundNumber) &&
    roundLimitEvent?.winnerSideKey === requested.winnerSideKey &&
    replayRoundLimit?.winnerSideKey === requested.winnerSideKey &&
    terminalEvent?.winnerSideKey === requested.winnerSideKey &&
    Number(scoreAfter.player1 || 0) === Number(scoreAfter.player2 || 0) &&
    presence.winnerSideKey === requested.winnerSideKey &&
    Number(presence.score?.[requested.winnerSideKey] || 0) >
      Number(presence.score?.[requested.loserSideKey] || 0) &&
    payloadMoveEvents.length === 0;
  if (!strictMatch) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_payload_terminal_relation_not_matched",
      }, {
        partitionAudit,
        geometryEvidence: authored.geometryEvidence,
        requestedTerminal: requested,
        primary: publicExecution(primary),
        replay: publicExecution(replay),
      }),
      runtime: { predecessor, primary, replay },
    };
  }
  const root = stableGraphValue({
    disposition: "strict_materialized",
    authority: "rules_v1_host",
    taskKey: task.taskKey,
    cellKey: representative.cellKey,
    subcellKey: representative.subcellKey,
    scenarioKey: representative.scenarioKey,
    roundNumber: representative.roundNumber,
    endingSideKey: requested.endingSideKey,
    winnerSideKey: requested.winnerSideKey,
    loserSideKey: requested.loserSideKey,
    resultKind: requested.resultKind,
    tiebreakClassKey: cell.tiebreakClassKey,
    partitionCoordinates: representative.coordinates,
    modelCount: predecessor.pieces.length,
    completeRealRosterState: predecessor.pieces.length === opening.modelCount,
    actionKey: primary.action.actionKey,
    actionType: primary.action.actionType,
    scoreBefore,
    scoreAfter,
    scenarioPresenceScore: presence.score,
    scenarioPresenceContributors: presence.contributors || [],
    declinedPayloadKeys,
    payloadMoveEventCount: payloadMoveEvents.length,
    geometryEvidence: authored.geometryEvidence,
    partitionAudit,
    staticPlacementAuditHash: stableGraphHash(authored.placementAudit),
    staticUnitFormationAuditHash: stableGraphHash(authored.formationAudit),
    predecessorStateHash: primary.predecessorStateHash,
    terminalStateHash: primary.terminalStateHash,
    receiptHash: primary.receiptHash,
    replayReceiptHash: replay.receiptHash,
    strictReplayCertified: true,
  });
  return {
    report: sealedReport(task, opening, {
      disposition: "strict_materialized",
      authority: "rules_v1_host",
      reason: "fixed_round_terminal_task_strictly_materialized",
      strictRulesConclusion: true,
    }, { root }),
    runtime: {
      predecessor,
      placementAudit: authored.placementAudit,
      formationAudit: authored.formationAudit,
      calibration: publicExecution(calibration),
      primary: publicExecution(primary),
      replay: publicExecution(replay),
    },
  };
}

function materializePressurePointVictoryPointRoot(task, opening, cell) {
  const representative = task.representative;
  const requested = taskTerminal(task);
  let baseState = prepareBaseState(opening, representative, requested);
  const coordinates = representative.coordinates || {};
  const resourcePieceKey = coordinates.resource ===
    "one_additional_purchase_available"
    ? authorOneAdditionalPurchaseResource(baseState)
    : (setWarmachineNativeResourcesForTerminalSeedV1(
      baseState,
      coordinates.resource,
    ), "");
  const priorLossPieceKey = coordinates.lifecycle === "winner_prior_losses"
    ? authorWinnerPriorLoss(baseState, requested) : "";
  if (coordinates.resource === "one_additional_purchase_available" &&
      !resourcePieceKey) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_pressure_point_purchase_resource_missing",
      }),
      runtime: null,
    };
  }
  if (coordinates.lifecycle === "winner_prior_losses" &&
      !priorLossPieceKey) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_pressure_point_prior_loss_carrier_missing",
      }),
      runtime: null,
    };
  }
  baseState = normalizeRulesV1State(baseState);
  const partitionAudit = exactPartitionAudit(
    baseState,
    representative,
    opening,
    requested,
  );
  const placementAudit = auditRulesV1StaticPlacement(baseState);
  const formationAudit = auditRulesV1StaticUnitFormation(baseState);
  if (!partitionAudit.passed || !placementAudit.ok || !formationAudit.ok) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_pressure_point_partition_or_geometry_failed",
      }, {
        partitionAudit,
        placementAuditHash: stableGraphHash(placementAudit),
        formationAuditHash: stableGraphHash(formationAudit),
      }),
      runtime: { baseState, placementAudit, formationAudit },
    };
  }
  const actionPatch = {};
  baseState.scenario.score = { player1: 0, player2: 0 };
  const calibration = executeEndTurn(baseState, actionPatch);
  if (!calibration.ok) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_pressure_point_calibration_transition_failed",
      }, {
        partitionAudit,
        calibration: publicExecution(calibration),
      }),
      runtime: null,
    };
  }
  const calibratedScore = calibration.transition.nextState?.scenario?.score || {};
  const winnerGain = Number(calibratedScore[requested.winnerSideKey] || 0);
  const loserGain = Number(calibratedScore[requested.loserSideKey] || 0);
  const targetLoserScore = Math.max(loserGain, winnerGain - 1, 0);
  const scoreBefore = {
    player1: 0,
    player2: 0,
    [requested.winnerSideKey]: targetLoserScore + 1 - winnerGain,
    [requested.loserSideKey]: targetLoserScore - loserGain,
  };
  const predecessor = structuredClone(baseState);
  predecessor.scenario.score = scoreBefore;
  predecessor.stateKey = `matchup-fixed-round-strict-predecessor:${
    representative.subcellKey}`;
  const primary = executeEndTurn(predecessor, actionPatch);
  const replay = executeEndTurn(predecessor, actionPatch);
  const roundLimitEvent = (primary.transition?.events || []).find((event) =>
    event.eventType === "scenario_round_limit");
  const terminalEvent = (primary.transition?.events || []).find((event) =>
    event.eventType === "terminal" &&
    event.reason === "scenario_round_limit_tiebreak");
  const replayRoundLimitEvent = (replay.transition?.events || []).find((event) =>
    event.eventType === "scenario_round_limit");
  const scoreAfter = primary.transition?.nextState?.scenario?.score || {};
  const strictMatch = primary.ok && replay.ok &&
    primary.predecessorStateHash === replay.predecessorStateHash &&
    primary.terminalStateHash === replay.terminalStateHash &&
    primary.receiptHash === replay.receiptHash &&
    Number(roundLimitEvent?.completedRound) === Number(representative.roundNumber) &&
    roundLimitEvent?.winnerSideKey === requested.winnerSideKey &&
    replayRoundLimitEvent?.winnerSideKey === requested.winnerSideKey &&
    terminalEvent?.winnerSideKey === requested.winnerSideKey &&
    Number(scoreAfter[requested.winnerSideKey] || 0) ===
      Number(scoreAfter[requested.loserSideKey] || 0) + 1;
  if (!strictMatch) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_pressure_point_terminal_relation_not_matched",
      }, {
        partitionAudit,
        requestedTerminal: requested,
        primary: publicExecution(primary),
        replay: publicExecution(replay),
      }),
      runtime: { predecessor, primary, replay },
    };
  }
  const root = stableGraphValue({
    disposition: "strict_materialized",
    authority: "rules_v1_host",
    taskKey: task.taskKey,
    cellKey: representative.cellKey,
    subcellKey: representative.subcellKey,
    scenarioKey: representative.scenarioKey,
    roundNumber: representative.roundNumber,
    endingSideKey: requested.endingSideKey,
    winnerSideKey: requested.winnerSideKey,
    loserSideKey: requested.loserSideKey,
    resultKind: requested.resultKind,
    tiebreakClassKey: cell.tiebreakClassKey,
    partitionCoordinates: representative.coordinates,
    modelCount: predecessor.pieces.length,
    completeRealRosterState: predecessor.pieces.length === opening.modelCount,
    actionKey: primary.action.actionKey,
    actionType: primary.action.actionType,
    scoreBefore,
    scoreAfter,
    scoreGain: {
      player1: Number(calibratedScore.player1 || 0),
      player2: Number(calibratedScore.player2 || 0),
    },
    resourcePieceKey,
    priorLossPieceKey,
    partitionAudit,
    staticPlacementAuditHash: stableGraphHash(placementAudit),
    staticUnitFormationAuditHash: stableGraphHash(formationAudit),
    predecessorStateHash: primary.predecessorStateHash,
    terminalStateHash: primary.terminalStateHash,
    receiptHash: primary.receiptHash,
    replayReceiptHash: replay.receiptHash,
    strictReplayCertified: true,
  });
  return {
    report: sealedReport(task, opening, {
      disposition: "strict_materialized",
      authority: "rules_v1_host",
      reason: "fixed_round_pressure_point_vp_terminal_strictly_materialized",
      strictRulesConclusion: true,
    }, { root }),
    runtime: {
      predecessor,
      placementAudit,
      formationAudit,
      calibration: publicExecution(calibration),
      primary: publicExecution(primary),
      replay: publicExecution(replay),
    },
  };
}

function materializeFaultLineScenarioPresenceRoot(task, opening, cell) {
  const representative = task.representative;
  const requested = taskTerminal(task);
  let baseState = prepareBaseState(opening, representative, requested);
  const coordinates = representative.coordinates || {};
  setWarmachineNativeResourcesForTerminalSeedV1(baseState, coordinates.resource);
  const authored = coordinates.scenarioControl === "contested"
    ? authorContestedLeaderScenarioPresenceGeometry(baseState, requested)
    : authorLeaderScenarioPresenceGeometry(baseState, requested);
  if (!authored) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_fault_line_presence_geometry_missing",
      }),
      runtime: null,
    };
  }
  baseState = authored.state;
  const partitionAudit = exactPartitionAudit(
    baseState,
    representative,
    opening,
    requested,
  );
  if (!partitionAudit.passed) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_fault_line_presence_partition_failed",
      }, {
        partitionAudit,
        geometryEvidence: authored.geometryEvidence,
      }),
      runtime: null,
    };
  }

  const actionPatch = {};
  baseState.scenario.score = { player1: 0, player2: 0 };
  const calibration = executeEndTurn(baseState, actionPatch);
  if (!calibration.ok) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_fault_line_presence_calibration_failed",
      }, {
        partitionAudit,
        geometryEvidence: authored.geometryEvidence,
        calibration: publicExecution(calibration),
      }),
      runtime: null,
    };
  }
  const scoreGain = calibration.transition.nextState?.scenario?.score || {};
  const equalFinalScore = Math.max(
    Number(scoreGain.player1 || 0),
    Number(scoreGain.player2 || 0),
  );
  const scoreBefore = {
    player1: equalFinalScore - Number(scoreGain.player1 || 0),
    player2: equalFinalScore - Number(scoreGain.player2 || 0),
  };
  const predecessor = structuredClone(baseState);
  predecessor.scenario.score = scoreBefore;
  predecessor.stateKey = `matchup-fixed-round-strict-predecessor:${
    representative.subcellKey}`;
  const primary = executeEndTurn(predecessor, actionPatch);
  const replay = executeEndTurn(predecessor, actionPatch);
  const roundLimitEvent = (primary.transition?.events || []).find((event) =>
    event.eventType === "scenario_round_limit");
  const replayRoundLimitEvent = (replay.transition?.events || []).find((event) =>
    event.eventType === "scenario_round_limit");
  const terminalEvent = (primary.transition?.events || []).find((event) =>
    event.eventType === "terminal" &&
    event.reason === "scenario_round_limit_tiebreak");
  const scoreAfter = primary.transition?.nextState?.scenario?.score || {};
  const presence = roundLimitEvent?.tiebreakerResult?.scenarioPresence || {};
  const strictMatch = primary.ok && replay.ok &&
    primary.predecessorStateHash === replay.predecessorStateHash &&
    primary.terminalStateHash === replay.terminalStateHash &&
    primary.receiptHash === replay.receiptHash &&
    Number(roundLimitEvent?.completedRound) === Number(representative.roundNumber) &&
    roundLimitEvent?.winnerSideKey === requested.winnerSideKey &&
    replayRoundLimitEvent?.winnerSideKey === requested.winnerSideKey &&
    terminalEvent?.winnerSideKey === requested.winnerSideKey &&
    Number(scoreAfter.player1 || 0) === Number(scoreAfter.player2 || 0) &&
    presence.winnerSideKey === requested.winnerSideKey &&
    Number(presence.score?.[requested.winnerSideKey] || 0) >
      Number(presence.score?.[requested.loserSideKey] || 0) &&
    (presence.contributors || []).some((row) =>
      row.pieceKey === authored.geometryEvidence.leaderPieceKey &&
      row.elementKey === authored.geometryEvidence.objectiveKey);
  if (!strictMatch) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_fault_line_presence_relation_not_matched",
      }, {
        partitionAudit,
        geometryEvidence: authored.geometryEvidence,
        requestedTerminal: requested,
        primary: publicExecution(primary),
        replay: publicExecution(replay),
      }),
      runtime: { predecessor, primary, replay },
    };
  }
  const root = stableGraphValue({
    disposition: "strict_materialized",
    authority: "rules_v1_host",
    taskKey: task.taskKey,
    cellKey: representative.cellKey,
    subcellKey: representative.subcellKey,
    scenarioKey: representative.scenarioKey,
    roundNumber: representative.roundNumber,
    endingSideKey: requested.endingSideKey,
    winnerSideKey: requested.winnerSideKey,
    loserSideKey: requested.loserSideKey,
    resultKind: requested.resultKind,
    tiebreakClassKey: cell.tiebreakClassKey,
    partitionCoordinates: representative.coordinates,
    modelCount: predecessor.pieces.length,
    completeRealRosterState: predecessor.pieces.length === opening.modelCount,
    actionKey: primary.action.actionKey,
    actionType: primary.action.actionType,
    scoreBefore,
    scoreAfter,
    scoreGain: {
      player1: Number(scoreGain.player1 || 0),
      player2: Number(scoreGain.player2 || 0),
    },
    scenarioPresenceScore: presence.score,
    scenarioPresenceContributors: presence.contributors || [],
    geometryEvidence: authored.geometryEvidence,
    partitionAudit,
    staticPlacementAuditHash: stableGraphHash(authored.placementAudit),
    staticUnitFormationAuditHash: stableGraphHash(authored.formationAudit),
    predecessorStateHash: primary.predecessorStateHash,
    terminalStateHash: primary.terminalStateHash,
    receiptHash: primary.receiptHash,
    replayReceiptHash: replay.receiptHash,
    strictReplayCertified: true,
  });
  return {
    report: sealedReport(task, opening, {
      disposition: "strict_materialized",
      authority: "rules_v1_host",
      reason: "fixed_round_fault_line_presence_terminal_strictly_materialized",
      strictRulesConclusion: true,
    }, { root }),
    runtime: {
      predecessor,
      placementAudit: authored.placementAudit,
      formationAudit: authored.formationAudit,
      calibration: publicExecution(calibration),
      primary: publicExecution(primary),
      replay: publicExecution(replay),
    },
  };
}

function materializeHighStakesReserveScenarioPresenceRoot(
  task,
  opening,
  cell,
) {
  const representative = task.representative;
  const requested = taskTerminal(task);
  let baseState = prepareBaseState(opening, representative, requested);
  setWarmachineNativeResourcesForTerminalSeedV1(baseState, "zero_available");
  const authored = authorHighStakesReservePresenceGeometry(
    baseState,
    requested,
  );
  if (!authored) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_high_stakes_reserve_geometry_missing",
      }),
      runtime: null,
    };
  }
  baseState = authored.state;
  const partitionAudit = exactPartitionAudit(
    baseState,
    representative,
    opening,
    requested,
  );
  if (!partitionAudit.passed) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_high_stakes_reserve_partition_failed",
      }, {
        partitionAudit,
        geometryEvidence: authored.geometryEvidence,
      }),
      runtime: null,
    };
  }

  baseState.scenario.score = { player1: 0, player2: 0 };
  const calibration = executeEndTurn(baseState, authored.actionPatch);
  if (!calibration.ok) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_high_stakes_calibration_failed",
      }, {
        partitionAudit,
        geometryEvidence: authored.geometryEvidence,
        calibration: publicExecution(calibration),
      }),
      runtime: null,
    };
  }
  const scoreGain = calibration.transition.nextState?.scenario?.score || {};
  const equalFinalScore = Math.max(
    Number(scoreGain.player1 || 0),
    Number(scoreGain.player2 || 0),
  );
  const scoreBefore = {
    player1: equalFinalScore - Number(scoreGain.player1 || 0),
    player2: equalFinalScore - Number(scoreGain.player2 || 0),
  };
  const predecessor = structuredClone(baseState);
  predecessor.scenario.score = scoreBefore;
  predecessor.stateKey = `matchup-fixed-round-strict-predecessor:${
    representative.subcellKey}`;
  const primary = executeEndTurn(predecessor, authored.actionPatch);
  const replay = executeEndTurn(predecessor, authored.actionPatch);
  const events = primary.transition?.events || [];
  const roundLimitEvent = events.find((event) =>
    event.eventType === "scenario_round_limit");
  const replayRoundLimitEvent = (replay.transition?.events || []).find((event) =>
    event.eventType === "scenario_round_limit");
  const terminalEvent = events.find((event) =>
    event.eventType === "terminal" &&
    event.reason === "scenario_round_limit_tiebreak");
  const fuseEvent = events.find((event) =>
    event.eventType === "high_stakes_countdown_removed");
  const detonationEvents = events.filter((event) =>
    event.eventType === "high_stakes_element_detonated" ||
    event.eventType === "high_stakes_magical_blast_damage");
  const scoreAfter = primary.transition?.nextState?.scenario?.score || {};
  const presence = roundLimitEvent?.tiebreakerResult?.scenarioPresence || {};
  const executionPartitionAudit = stableGraphValue({
    checks: {
      highStakesFuseResolution:
        fuseEvent?.targetKey === authored.geometryEvidence.fuseTargetKey &&
        Number(fuseEvent?.fuseRoll) === 1 &&
        Number(fuseEvent?.countdownBefore) === 4 &&
        Number(fuseEvent?.countdownAfter) === 3 &&
        Number(fuseEvent?.removed) === 1 &&
        (fuseEvent?.secured50BySideKeys || []).includes(
          requested.winnerSideKey,
        ),
      highStakesBlastClosure: detonationEvents.length === 0,
    },
    fuseEvent: fuseEvent || null,
    detonationEventCount: detonationEvents.length,
  });
  const strictMatch = primary.ok && replay.ok &&
    primary.predecessorStateHash === replay.predecessorStateHash &&
    primary.terminalStateHash === replay.terminalStateHash &&
    primary.receiptHash === replay.receiptHash &&
    Number(roundLimitEvent?.completedRound) === Number(representative.roundNumber) &&
    roundLimitEvent?.winnerSideKey === requested.winnerSideKey &&
    replayRoundLimitEvent?.winnerSideKey === requested.winnerSideKey &&
    terminalEvent?.winnerSideKey === requested.winnerSideKey &&
    Number(scoreAfter.player1 || 0) === Number(scoreAfter.player2 || 0) &&
    presence.winnerSideKey === requested.winnerSideKey &&
    Number(presence.score?.[requested.winnerSideKey] || 0) >
      Number(presence.score?.[requested.loserSideKey] || 0) &&
    Object.values(executionPartitionAudit.checks).every(Boolean);
  if (!strictMatch) {
    return {
      report: sealedReport(task, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_high_stakes_terminal_relation_not_matched",
      }, {
        partitionAudit,
        executionPartitionAudit,
        geometryEvidence: authored.geometryEvidence,
        requestedTerminal: requested,
        primary: publicExecution(primary),
        replay: publicExecution(replay),
      }),
      runtime: { predecessor, primary, replay },
    };
  }
  const root = stableGraphValue({
    disposition: "strict_materialized",
    authority: "rules_v1_host",
    taskKey: task.taskKey,
    cellKey: representative.cellKey,
    subcellKey: representative.subcellKey,
    scenarioKey: representative.scenarioKey,
    roundNumber: representative.roundNumber,
    endingSideKey: requested.endingSideKey,
    winnerSideKey: requested.winnerSideKey,
    loserSideKey: requested.loserSideKey,
    resultKind: requested.resultKind,
    tiebreakClassKey: cell.tiebreakClassKey,
    partitionCoordinates: representative.coordinates,
    modelCount: predecessor.pieces.length,
    completeRealRosterIdentity: predecessor.pieces.length === opening.modelCount,
    actionKey: primary.action.actionKey,
    actionType: primary.action.actionType,
    actionPatch: authored.actionPatch,
    scoreBefore,
    scoreAfter,
    scoreGain: {
      player1: Number(scoreGain.player1 || 0),
      player2: Number(scoreGain.player2 || 0),
    },
    scenarioPresenceScore: presence.score,
    scenarioPresenceContributors: presence.contributors || [],
    geometryEvidence: authored.geometryEvidence,
    partitionAudit,
    executionPartitionAudit,
    staticPlacementAuditHash: stableGraphHash(authored.placementAudit),
    staticUnitFormationAuditHash: stableGraphHash(authored.formationAudit),
    predecessorStateHash: primary.predecessorStateHash,
    terminalStateHash: primary.terminalStateHash,
    receiptHash: primary.receiptHash,
    replayReceiptHash: replay.receiptHash,
    strictReplayCertified: true,
  });
  return {
    report: sealedReport(task, opening, {
      disposition: "strict_materialized",
      authority: "rules_v1_host",
      reason: "fixed_round_high_stakes_reserve_terminal_strictly_materialized",
      strictRulesConclusion: true,
    }, { root }),
    runtime: {
      predecessor,
      placementAudit: authored.placementAudit,
      formationAudit: authored.formationAudit,
      calibration: publicExecution(calibration),
      primary: publicExecution(primary),
      replay: publicExecution(replay),
    },
  };
}

export function materializeWarmachineMatchupFixedRoundTerminalTaskV1({
  terminalTask = {},
  opening = {},
  evidenceCorpus = {},
  context = {},
} = {}) {
  let validated;
  try {
    validated = validateInputs(terminalTask, opening, evidenceCorpus);
  } catch (error) {
    return inputInvalid(terminalTask, opening,
      String(error?.message || error));
  }
  const representative = terminalTask.representative;
  if (representative.sourceResolutionStatus !== "officially_confirmed") {
    return {
      report: sealedReport(terminalTask, opening, {
        disposition: "rules_unknown",
        authority: "rules_source",
        reason: "fixed_round_terminal_source_result_unresolved",
        claimBoundary: "The official VP and Scenario Presence tiebreakers remain equal for this requested representative, and the source does not define a further winner. No current-Host terminal winner is claimed.",
      }, {
        requestedResultKind:
          representative.canonicalTerminal?.resultKind || "",
        sourceResolutionStatus: representative.sourceResolutionStatus,
        tiebreakClassKey: validated.cell.tiebreakClassKey,
        partitionCoordinates: representative.coordinates,
      }),
      runtime: null,
    };
  }
  const partitionCapabilityAudit = partitionCapabilityAuditForTask(
    terminalTask,
    opening,
    context,
  );
  if (partitionCapabilityAudit?.exactCandidateRoutingMismatch === true) {
    return {
      report: sealedReport(terminalTask, opening, {
        disposition: "proposal_filtered",
        authority: "search_relation",
        reason: "fixed_round_exact_roster_cannot_carry_partition",
        claimBoundary: "The complete exact task-bound rosters contain no structured model identity capable of carrying the requested terminal state partition. This filters only this exact roster/representative candidate; it is not a Host rejection or a family-level unreachability claim.",
      }, { partitionCapabilityAudit }),
      runtime: null,
    };
  }
  if (supportsTerminalPaymentIncompatibilityFilter(representative)) {
    return materializeTerminalPaymentIncompatibilityFilter(
      terminalTask,
      opening,
    );
  }
  if (supportsControllerRouteIncompatibilityFilter(representative)) {
    return materializeControllerRouteIncompatibilityFilter(
      terminalTask,
      opening,
    );
  }
  if (supportsOutsideTableReject(representative)) {
    return materializeOutsideTableReject(terminalTask, opening);
  }
  if (supportsPressurePointVictoryPointRoot(representative, validated.cell)) {
    return materializePressurePointVictoryPointRoot(
      terminalTask,
      opening,
      validated.cell,
    );
  }
  if (supportsPressurePointWinnerPriorLossVictoryPointRoot(
    representative,
    validated.cell,
  )) {
    return materializePressurePointVictoryPointRoot(
      terminalTask,
      opening,
      validated.cell,
    );
  }
  if (supportsFaultLineScenarioPresenceRoot(representative, validated.cell)) {
    return materializeFaultLineScenarioPresenceRoot(
      terminalTask,
      opening,
      validated.cell,
    );
  }
  if (supportsFaultLineContestedScenarioPresenceRoot(
    representative,
    validated.cell,
  )) {
    return materializeFaultLineScenarioPresenceRoot(
      terminalTask,
      opening,
      validated.cell,
    );
  }
  if (supportsHighStakesReserveScenarioPresenceRoot(
    representative,
    validated.cell,
  )) {
    return materializeHighStakesReserveScenarioPresenceRoot(
      terminalTask,
      opening,
      validated.cell,
    );
  }
  if (supportsPayloadPresenceRoot(representative, validated.cell)) {
    return materializePayloadPresenceRoot(
      terminalTask,
      opening,
      validated.cell,
    );
  }
  return {
    report: sealedReport(terminalTask, opening, {
      disposition: "budget_deferred",
      authority: "execution_coverage",
      reason: "fixed_round_terminal_partition_materializer_not_implemented",
    }, {
      sourceResolutionStatus: representative.sourceResolutionStatus,
      tiebreakClassKey: validated.cell.tiebreakClassKey,
      partitionCoordinates: representative.coordinates,
    }),
    runtime: null,
  };
}

export function warmachineMatchupFixedRoundTerminalTaskSupportedV1(
  terminalTask = {},
  context = {},
) {
  const representative = terminalTask.representative || {};
  if (representative.terminalClassKey !== FIXED_TERMINAL_CLASS ||
      terminalTask.executionEnvelope?.actionCategory !== FIXED_ACTION_CATEGORY) {
    return false;
  }
  if (representative.sourceResolutionStatus !== "officially_confirmed") return true;
  if (context.partitionCapabilityAuditsByTaskKey?.[terminalTask.taskKey]) {
    return true;
  }
  if (supportsTerminalPaymentIncompatibilityFilter(representative)) return true;
  if (supportsControllerRouteIncompatibilityFilter(representative)) return true;
  if (supportsOutsideTableReject(representative)) return true;
  if (supportsPressurePointVictoryPointRoot(representative, {
    tiebreakClassKey: "victory_point_advantage",
  })) return true;
  if (supportsPressurePointWinnerPriorLossVictoryPointRoot(representative, {
    tiebreakClassKey: "victory_point_advantage",
  })) return true;
  if (supportsFaultLineScenarioPresenceRoot(representative, {
    tiebreakClassKey:
      "victory_points_tied_scenario_presence_advantage",
  })) return true;
  if (supportsFaultLineContestedScenarioPresenceRoot(representative, {
    tiebreakClassKey:
      "victory_points_tied_scenario_presence_advantage",
  })) return true;
  if (supportsHighStakesReserveScenarioPresenceRoot(representative, {
    tiebreakClassKey:
      "victory_points_tied_scenario_presence_advantage",
  })) return true;
  return supportsPayloadPresenceRoot(representative, {
    tiebreakClassKey: "victory_points_tied_scenario_presence_advantage",
  });
}

export function buildWarmachineMatchupFixedRoundTerminalTaskAdapterV1() {
  return Object.freeze({
    supports: ({ terminalTask, context } = {}) =>
      warmachineMatchupFixedRoundTerminalTaskSupportedV1(
        terminalTask,
        context,
      ),
    materialize: materializeWarmachineMatchupFixedRoundTerminalTaskV1,
  });
}
