import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  enumerateWarmachineBenchmarkActionsV2,
  executeScopedWarmachineBenchmarkActionV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import {
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  auditRulesV1SteamrollerScenarioTerrainSetup,
  scoreScenarioElements,
  steamroller2026ScenarioKey,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";
import { warmachinePieceInPlayV1 } from "./piece-lifecycle-v1.mjs";
import { WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA } from
  "./terminal-hypothesis-v1.mjs";
import { warmachineSteamrollerTerminalScenarioSubcellKeyV1 } from
  "./steamroller-terminal-scenario-corpus-v1.mjs";

export const WARMACHINE_STEAMROLLER_SCORE_TERMINAL_MATERIALIZATION_BATCH_V1_SCHEMA =
  "warmachine_steamroller_score_terminal_materialization_batch_v1";

const MATERIALIZATION_DISPOSITIONS = Object.freeze({
  INPUT_INVALID: "input_invalid",
  PROPOSAL_FILTERED: "proposal_filtered",
  STRICT_REJECTED: "strict_rejected",
  BUDGET_DEFERRED: "budget_deferred",
});

function materializationDisposition(disposition, authority, raw = {}) {
  return stableGraphValue({
    ...raw,
    disposition,
    authority,
    strictRulesConclusion: disposition === MATERIALIZATION_DISPOSITIONS.STRICT_REJECTED,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
  });
}

function staticAuditReceiptHash(operation = "rules_v1_static_placement_audit", audit = {}) {
  return stableGraphHash({
    operation,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    audit,
  });
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function oppositeSide(sideKey = "") {
  return sideKey === "player1" ? "player2" : sideKey === "player2" ? "player1" : "";
}

function scenarioScore(state = {}, sideKey = "") {
  return numeric(state.scenario?.score?.[sideKey], 0);
}

function incrementCount(counts = {}, sourceFamilyKey = "", amount = 1) {
  if (!sourceFamilyKey || amount <= 0) return;
  counts[sourceFamilyKey] = (counts[sourceFamilyKey] || 0) + amount;
}

function scoreSourceCountsForSettlement(
  corpus = {},
  state = {},
  settlement = {},
  sideKey = "",
  events = [],
) {
  const scenarioKey = steamroller2026ScenarioKey(state.scenario || {});
  const scenario = (corpus.scenarios || []).find((row) => row.scenarioKey === scenarioKey);
  const pointByFamily = new Map((scenario?.scoringSourceFamilies || []).map((family) => [
    family.sourceFamilyKey,
    Number(family.pointValue || 0),
  ]));
  const counts = {};
  for (const event of events.filter((row) =>
    row.eventType === "scenario_score" && row.sideKey === sideKey)) {
    if (event.elementType === "killbox") {
      incrementCount(counts, "kill_box_penalty");
      continue;
    }
    if (event.elementType === "objective") {
      const objective = (state.scenario?.objectives || []).find((item) =>
        item.objectiveKey === event.objectivePieceKey || item.objectiveKey === event.elementKey);
      const baseSizeMm = Math.round(numeric(objective?.baseSizeMm, 0));
      if ([40, 50].includes(baseSizeMm)) {
        const familyKey = `objective_${baseSizeMm}`;
        incrementCount(counts, familyKey);
        const basePoints = pointByFamily.get(familyKey) || 0;
        if (scenarioKey === "high_stakes" && baseSizeMm === 50 &&
            numeric(event.points, 0) > basePoints) {
          incrementCount(counts, "zero_countdown_50mm_bonus");
        }
      }
      continue;
    }
    if (event.elementType === "scenario_terrain") {
      const terrain = (state.terrain || []).find((item) =>
        item.terrainKey === event.scenarioTerrainKey || item.terrainKey === event.elementKey);
      const ownerSideKey = String(terrain?.ownerSideKey || terrain?.sourceSideKey || "");
      const familyKey = ownerSideKey === sideKey
        ? "scenario_terrain_own"
        : "scenario_terrain_opponent";
      incrementCount(counts, familyKey);
      const basePoints = pointByFamily.get(familyKey) || 0;
      if (scenarioKey === "high_stakes" && numeric(event.points, 0) > basePoints) {
        incrementCount(counts, "zero_countdown_terrain_bonus");
      }
      continue;
    }
    if (event.elementType === "objective_progress") {
      incrementCount(counts, "third_progress_token_goal");
      continue;
    }
    if (event.elementType === "payload_delivery") {
      incrementCount(counts, "payload_delivery");
      continue;
    }
  }
  const familyByBonusKey = {
    both_40mm: "both_40mm_bonus",
    both_50mm: "both_50mm_bonus",
    two_own_objectives: "secure_two_own_bonus",
    three_own_objectives: "secure_three_own_bonus",
  };
  for (const bonus of settlement.combinationBonuses || []) {
    if (bonus.sideKey === sideKey) incrementCount(counts, familyByBonusKey[bonus.bonusKey]);
  }
  return stableGraphValue(counts);
}

function resourcePoints(piece = {}) {
  return numeric(
    piece.focusPoints ?? piece.furyPoints ?? piece.resourcePoints ??
      piece.focus ?? piece.fury ?? 0,
    0,
  );
}

function leaderLike(piece = {}) {
  return Boolean(piece.isWarcaster || piece.isWarlock || piece.isLeader ||
    ["warcaster", "warlock", "leader"].includes(String(piece.modelRole || "").toLowerCase()));
}

function activeScenarioElements(predecessor = {}) {
  return [
    ...(predecessor.scenario?.objectives || []),
    ...(predecessor.scenario?.caches || []),
    ...(predecessor.terrain || []).filter((terrain) =>
      terrain.isScenarioTerrain || terrain.scenarioTerrain || terrain.scenarioElement),
  ].filter((element) => element.active !== false);
}

function auditDeclaredPartitions(predecessor = {}, settlement = {}, proposal = {}) {
  const coordinates = proposal.partitionCoordinates || {};
  const issues = [];
  const evidence = [];
  const record = (partitionKey, passed, observed = {}) => {
    evidence.push(stableGraphValue({
      partitionKey,
      declaredValue: coordinates[partitionKey] || "",
      passed,
      observed,
    }));
    if (!passed) issues.push({
      reason: "terminal_batch_declared_partition_mismatch",
      partitionKey,
      declaredValue: coordinates[partitionKey] || "",
      observed: stableGraphValue(observed),
    });
  };
  if (coordinates.lifecycle === "both_rosters_complete") {
    const observedPieceKeys = (predecessor.pieces || []).map((piece) => piece.pieceKey).sort();
    const declaredPieceKeys = [...(proposal.completeRosterPieceKeys || [])].map(String).sort();
    record("lifecycle", proposal.rosterDomainComplete === true &&
      JSON.stringify(observedPieceKeys) === JSON.stringify(declaredPieceKeys), {
      rosterDomainComplete: proposal.rosterDomainComplete === true,
      observedPieceKeys,
      declaredPieceKeys,
    });
  } else if (coordinates.lifecycle === "reserve_replacement_or_dormant_history") {
    const observedPieceKeys = (predecessor.pieces || []).map((piece) => piece.pieceKey).sort();
    const declaredPieceKeys = [...(proposal.completeRosterPieceKeys || [])].map(String).sort();
    const outOfPlayPieces = (predecessor.pieces || []).filter((piece) =>
      !warmachinePieceInPlayV1(piece));
    const reservePieces = outOfPlayPieces.filter((piece) =>
      piece.canAmbush === true && piece.canDeployFromReserve === true &&
      piece.offTable === true && piece.notDeployed === true &&
      piece.destroyed !== true && piece.removedFromPlay !== true &&
      Boolean(piece.unitGroupId));
    const reserveGroupRows = [...new Set(reservePieces.map((piece) =>
      String(piece.unitGroupId || "")).filter(Boolean))].sort().map(
      (unitGroupId) => {
        const group = (predecessor.pieces || []).filter((piece) =>
          String(piece.unitGroupId || "") === unitGroupId);
        const eligible = group.filter((piece) =>
          piece.canAmbush === true && piece.canDeployFromReserve === true);
        return stableGraphValue({
          unitGroupId,
          eligiblePieceKeys: eligible.map((piece) => piece.pieceKey).sort(),
          inPlayNonAmbushPieceKeys: group.filter((piece) =>
            piece.canAmbush !== true && warmachinePieceInPlayV1(piece)).map(
            (piece) => piece.pieceKey).sort(),
          allEligibleMembersInReserve: eligible.length > 0 &&
            eligible.every((piece) => reservePieces.some((candidate) =>
              candidate.pieceKey === piece.pieceKey)),
        });
      },
    );
    record("lifecycle", proposal.rosterDomainComplete === true &&
      JSON.stringify(observedPieceKeys) === JSON.stringify(declaredPieceKeys) &&
      reserveGroupRows.some((row) => row.allEligibleMembersInReserve) &&
      outOfPlayPieces.length === reservePieces.length &&
      (predecessor.pieces || []).filter(leaderLike).every((piece) =>
        warmachinePieceInPlayV1(piece)), {
      rosterDomainComplete: proposal.rosterDomainComplete === true,
      observedPieceKeys,
      declaredPieceKeys,
      reservePieceKeys: reservePieces.map((piece) => piece.pieceKey).sort(),
      reserveGroupRows,
      outOfPlayPieceKeys: outOfPlayPieces.map((piece) => piece.pieceKey).sort(),
    });
  } else {
    record("lifecycle", false, { reason: "unsupported_materialized_lifecycle_claim" });
  }
  if (coordinates.damage === "critical_models_undamaged") {
    const leaders = (predecessor.pieces || []).filter(leaderLike);
    record("damage", leaders.length > 0 && leaders.every((piece) =>
      numeric(piece.damage?.boxesRemaining, 0) === numeric(piece.damage?.maxBoxes, 0)), {
      leaderDamage: leaders.map((piece) => ({
        pieceKey: piece.pieceKey,
        boxesRemaining: numeric(piece.damage?.boxesRemaining, 0),
        maxBoxes: numeric(piece.damage?.maxBoxes, 0),
      })),
    });
  } else {
    record("damage", false, { reason: "unsupported_materialized_damage_claim" });
  }
  if (coordinates.resource === "zero_available") {
    const nonzero = (predecessor.pieces || []).filter((piece) => resourcePoints(piece) !== 0)
      .map((piece) => ({ pieceKey: piece.pieceKey, resourcePoints: resourcePoints(piece) }));
    record("resource", nonzero.length === 0, { nonzero });
  } else if (coordinates.resource === "maximum_native_resource") {
    const resourceBearingPieces = (predecessor.pieces || []).filter((piece) =>
      numeric(piece.resourceMax ?? piece.focusMax ?? piece.furyMax ??
        piece.focus ?? piece.fury, 0) > 0);
    const resourceLedger = resourceBearingPieces.map((piece) => ({
      pieceKey: piece.pieceKey,
      resourcePoints: resourcePoints(piece),
      resourceMax: numeric(piece.resourceMax ?? piece.focusMax ?? piece.furyMax ??
        piece.focus ?? piece.fury, 0),
    }));
    record("resource", resourceLedger.length > 0 && resourceLedger.every((row) =>
      row.resourcePoints === row.resourceMax), { resourceLedger });
  } else if (coordinates.resource === "one_additional_purchase_available") {
    const resourceLedger = (predecessor.pieces || []).flatMap((piece) => {
      const resourceMax = numeric(piece.resourceMax ?? piece.focusMax ??
        piece.furyMax ?? piece.focus ?? piece.fury, 0);
      return resourceMax > 0 ? [{
        pieceKey: piece.pieceKey,
        isWarjack: piece.isWarjack === true,
        resourcePoints: resourcePoints(piece),
        resourceMax,
      }] : [];
    });
    const nonzero = resourceLedger.filter((row) => row.resourcePoints > 0);
    record("resource", nonzero.length === 1 &&
      nonzero[0].isWarjack === true && nonzero[0].resourcePoints === 1 &&
      resourceLedger.every((row) => row.resourcePoints >= 0 &&
        row.resourcePoints <= row.resourceMax), { resourceLedger, nonzero });
  } else {
    record("resource", false, { reason: "unsupported_materialized_resource_claim" });
  }
  record("leaderControl", coordinates.leaderControl === "outside_or_not_required", {
    terminalActionFamily: "steamroller_turn_end_settlement",
    leaderControlRequired: false,
  });
  if (coordinates.baseTopology === "legal_separated") {
    const placement = auditRulesV1StaticPlacement(predecessor);
    record("baseTopology", placement.ok === true, {
      issueCount: placement.issueCount,
      issues: placement.issues,
    });
  } else {
    record("baseTopology", false, { reason: "unsupported_materialized_topology_claim" });
  }
  const winnerSideKey = String(proposal.winnerSideKey || oppositeSide(predecessor.activeSideKey));
  const scoredWinnerRows = (settlement.scored || []).filter((row) =>
    row.scoringSideKey === winnerSideKey);
  const controlReport = scoreScenarioElements(predecessor);
  const witness = proposal.scenarioControlWitness || {};
  const controlRows = [
    ...(controlReport.objectiveControl || []),
    ...(controlReport.scenarioTerrainControl || []),
    ...(controlReport.zoneControl || []),
    ...(controlReport.flagControl || []),
  ];
  const witnessRow = controlRows.find((row) =>
    String(row.elementKey || row.objectiveKey || row.terrainKey || row.zoneKey || row.flagKey || "") ===
      String(witness.elementKey || ""));
  const expectedSideKey = String(witness.sideKey || winnerSideKey);
  const expectedOpponentSideKey = oppositeSide(expectedSideKey);
  let scenarioControlPassed = false;
  if (coordinates.scenarioControl === "winner_secures_uncontested") {
    scenarioControlPassed = scoredWinnerRows.length > 0;
  } else if (coordinates.scenarioControl === "contested") {
    scenarioControlPassed = Boolean(witnessRow) &&
      (witnessRow.contestingSides || []).includes(expectedSideKey) &&
      (witnessRow.contestingSides || []).includes(expectedOpponentSideKey) &&
      !(witnessRow.securingSides || []).length &&
      !String(witnessRow.controllingSideKey || "");
  } else if (coordinates.scenarioControl === "controller_ineligible") {
    scenarioControlPassed = Boolean(witnessRow) &&
      (witnessRow.ineligibleModelsInRange || []).some((row) =>
        row.pieceKey === witness.pieceKey && row.reason === witness.reason) &&
      !(witnessRow.contestingSides || []).includes(expectedSideKey) &&
      !(witnessRow.securingSides || []).includes(expectedSideKey);
  }
  record("scenarioControl", scenarioControlPassed, {
    scoredWinnerRows,
    witness: stableGraphValue(witness),
    witnessRow: stableGraphValue(witnessRow || null),
    controlReportHash: stableGraphHash(controlReport),
  });

  const scenarioKey = steamroller2026ScenarioKey(predecessor.scenario || {});
  const scenarioTerrainSetupAudit =
    auditRulesV1SteamrollerScenarioTerrainSetup(predecessor);
  record("scenarioTerrainSetup",
    scenarioTerrainSetupAudit.ok === true &&
      coordinates.scenarioTerrainSetup === scenarioTerrainSetupAudit.setupClassKey, {
      auditHash: stableGraphHash(scenarioTerrainSetupAudit),
      issueCount: scenarioTerrainSetupAudit.issueCount,
      issues: scenarioTerrainSetupAudit.issues,
      observedScenarioTerrainSetup: scenarioTerrainSetupAudit.setupClassKey,
    });
  if (scenarioKey === "trench_warfare") {
    const activeCaches = (predecessor.scenario?.caches || []).filter((cache) =>
      cache.active !== false).map((cache) => cache.cacheKey).sort();
    record("trenchCacheLifecycle", coordinates.trenchCacheLifecycle ===
      "both_caches_active" && activeCaches.length === 2, { activeCaches });
  }
  if (scenarioKey === "wolves_at_our_heels") {
    const progress = (predecessor.scenario?.objectives || []).filter((objective) =>
      numeric(objective.baseSizeMm, 0) === 40).map((objective) => ({
      objectiveKey: objective.objectiveKey,
      progressTokens: numeric(objective.progressTokens, 0),
    }));
    const additions = settlement.postScoring?.additions || [];
    record("wolvesProgressState", coordinates.wolvesProgressState ===
      "at_least_one_objective_at_two" && progress.some((row) => row.progressTokens === 2),
    { progress });
    const winnerSideKey = String(proposal.winnerSideKey || "");
    const securedOwned40Keys = scoredWinnerRows.filter((row) => {
      const objective = (predecessor.scenario?.objectives || []).find((entry) =>
        entry.objectiveKey === row.elementKey);
      return Number(objective?.baseSizeMm) === 40 &&
        objective?.ownerSideKey === winnerSideKey;
    }).map((row) => row.elementKey).sort();
    const wolvesDecision = proposal.actionPatch?.steamroller2026Decision?.wolves || {};
    const eligibleDeclined = securedOwned40Keys.length > 0 && securedOwned40Keys.every((key) =>
      wolvesDecision.addTokenByObjectiveKey?.[key] === false);
    record("wolvesTokenDecision", coordinates.wolvesTokenDecision ===
      "eligible_add_token_declined" && eligibleDeclined && additions.length === 0, {
      additions,
      securedOwned40Keys,
      addTokenByObjectiveKey: wolvesDecision.addTokenByObjectiveKey || {},
    });
    record("wolvesObjectiveMove", coordinates.wolvesObjectiveMove ===
      "move_not_triggered" && additions.length === 0, { additions });
  }
  if (scenarioKey === "high_stakes") {
    const countdowns = activeScenarioElements(predecessor)
      .filter((element) => Number.isFinite(Number(element.countdownTokens)))
      .map((element) => numeric(element.countdownTokens, 0));
    const highStakesDecision = proposal.actionPatch?.steamroller2026Decision?.highStakes ||
      proposal.actionPatch?.metadata?.steamroller2026Decision?.highStakes || {};
    const oneReduced = countdowns.length === 3 &&
      countdowns.filter((value) => value > 0 && value < 5).length === 1 &&
      countdowns.filter((value) => value === 5).length === 2;
    record("highStakesCountdownState", coordinates.highStakesCountdownState ===
      "one_nonzero_element_reduced" && oneReduced, { countdowns });
    record("highStakesFuseResolution", coordinates.highStakesFuseResolution ===
      "secured_50mm_remove_one" && Number(highStakesDecision.fuseRoll) === 1 &&
      Boolean(highStakesDecision.fuseTargetKey) && settlement.preScoring?.removed === 1, {
      highStakesDecision,
      preScoring: settlement.preScoring,
    });
    record("highStakesBlastClosure", coordinates.highStakesBlastClosure ===
      "no_detonation" && settlement.preScoring?.detonated === false, {
      preScoring: settlement.preScoring,
    });
  }
  if (scenarioKey === "payload") {
    const payloads = (predecessor.scenario?.objectives || []).filter((objective) =>
      numeric(objective.baseSizeMm, 0) === 50);
    const payloadDecision = proposal.actionPatch?.steamroller2026Decision?.payload ||
      proposal.actionPatch?.metadata?.steamroller2026Decision?.payload || {};
    const declined = Object.values(payloadDecision.moveByObjectiveKey || {})
      .some((decision) => decision?.decline === true);
    record("payloadLifecycle", coordinates.payloadLifecycle === "both_payloads_active" &&
      payloads.length === 2 && payloads.every((objective) => objective.active !== false), {
      payloadKeys: payloads.map((objective) => objective.objectiveKey),
    });
    record("payloadMoveDecision", coordinates.payloadMoveDecision ===
      "eligible_move_declined" && declined && (settlement.postScoring || []).length === 0, {
      payloadDecision,
      postScoring: settlement.postScoring,
    });
    record("madeToHaulDecision", coordinates.madeToHaulDecision === "not_triggered" &&
      declined && (settlement.postScoring || []).length === 0, {
      postScoring: settlement.postScoring,
    });
  }
  return stableGraphValue({ ok: issues.length === 0, issues, evidence });
}

function scoreCellForProposal(corpus = {}, proposal = {}, predecessor = {}) {
  const scenarioKey = steamroller2026ScenarioKey(predecessor.scenario || {});
  const endingSideKey = String(predecessor.activeSideKey || "");
  const winnerSideKey = String(proposal.winnerSideKey || oppositeSide(endingSideKey));
  return (corpus.cells || []).find((cell) =>
    cell.scenarioKey === scenarioKey &&
    cell.terminalClassKey === "lead_three_after_opponent_turn_scoring" &&
    cell.resultKind === "win" &&
    cell.attackerSideKey === predecessor.scenario?.attackerSideKey &&
    cell.defenderSideKey === predecessor.scenario?.defenderSideKey &&
    cell.endingSideKey === endingSideKey &&
    cell.winnerSideKey === winnerSideKey &&
    cell.loserSideKey === endingSideKey &&
    cell.roundClass?.exactRoundNumber === true &&
    Number(cell.roundClass?.representativeRoundNumber) === Number(predecessor.turnNumber)) || null;
}

function sameCounts(left = {}, right = {}) {
  return stableGraphHash(left) === stableGraphHash(right);
}

function findScoreTransition(corpus = {}, cell = {}, evidence = {}, requestedKey = "") {
  const scenario = (corpus.scenarios || []).find((row) =>
    row.scenarioKey === cell.scenarioKey);
  const matches = (scenario?.scoreTransitionDomain?.transitions || []).filter((transition) => {
    const preLeadMatches = transition.leadBeforeClass === "already_at_least_three"
      ? evidence.leadBefore >= 3
      : Number(transition.leadBefore) === evidence.leadBefore;
    const postLeadMatches = transition.leadBeforeClass === "already_at_least_three"
      ? evidence.leadAfter === evidence.leadBefore + evidence.netGain
      : Number(transition.leadAfter) === evidence.leadAfter;
    return preLeadMatches && postLeadMatches &&
      Number(transition.scoringGainClass?.netGain) === evidence.netGain &&
      sameCounts(
        transition.scoringGainClass?.representativeWinnerCounts,
        evidence.winnerSourceCounts,
      ) &&
      sameCounts(
        transition.scoringGainClass?.representativeOpponentCounts,
        evidence.opponentSourceCounts,
      );
  });
  if (!requestedKey) return matches[0] || null;
  return matches.find((transition) => transition.scoreTransitionKey === requestedKey) || null;
}

function materializeOne(corpus = {}, proposal = {}) {
  if (!corpus.rosterReceiptHash ||
      String(proposal.rosterReceiptHash || "") !== String(corpus.rosterReceiptHash)) {
    return materializationDisposition(MATERIALIZATION_DISPOSITIONS.INPUT_INVALID,
      "input_contract", {
      reason: "terminal_batch_roster_receipt_mismatch",
      proposalKey: String(proposal.proposalKey || ""),
      expectedRosterReceiptHash: String(corpus.rosterReceiptHash || ""),
      observedRosterReceiptHash: String(proposal.rosterReceiptHash || ""),
      });
  }
  const authoredPredecessor = structuredClone(proposal.predecessorState || {});
  if (proposal.predecessorHistoryRequired === true) {
    const history = proposal.predecessorHistoryEvidence || {};
    const observedHistoryHash = warmachineReverseStateSemanticHashV1(authoredPredecessor);
    if (history.strictCertified !== true || history.prefixTerminalEventCount !== 0 ||
        Number(history.strictTransitionCount) <= 0 ||
        String(history.predecessorStateSemanticHash || "") !== observedHistoryHash ||
        stableGraphHash(history.endingScore || {}) !==
          stableGraphHash(authoredPredecessor.scenario?.score || {}) ||
        stableGraphHash(history.scoringHistory || []) !==
          stableGraphHash(authoredPredecessor.scenario?.scoringHistory || [])) {
      return materializationDisposition(MATERIALIZATION_DISPOSITIONS.INPUT_INVALID,
        "history_evidence_contract", {
        reason: "terminal_batch_predecessor_history_not_strict_certified",
        proposalKey: String(proposal.proposalKey || ""),
        });
    }
  }
  const scenarioKey = steamroller2026ScenarioKey(authoredPredecessor.scenario || {});
  if (!scenarioKey || scenarioKey !== String(proposal.hostScenarioKey || scenarioKey)) {
    return materializationDisposition(MATERIALIZATION_DISPOSITIONS.INPUT_INVALID,
      "input_contract", { reason: "terminal_batch_scenario_profile_mismatch" });
  }
  const cell = scoreCellForProposal(corpus, proposal, authoredPredecessor);
  if (!cell) {
    return materializationDisposition(MATERIALIZATION_DISPOSITIONS.INPUT_INVALID,
      "corpus_identity_contract", { reason: "terminal_batch_score_cell_missing" });
  }
  const staticPlacementAudit = auditRulesV1StaticPlacement(authoredPredecessor);
  if (!staticPlacementAudit.ok) {
    return materializationDisposition(MATERIALIZATION_DISPOSITIONS.STRICT_REJECTED,
      "rules_v1_host", {
        proposalKey: String(proposal.proposalKey || ""),
        reason: "terminal_batch_static_placement_rejected",
        scenarioKey,
        cellKey: cell.cellKey,
        subcellKey: String(proposal.representativeSubcellKey || ""),
        receiptHash: staticAuditReceiptHash(
          "rules_v1_static_placement_audit",
          staticPlacementAudit,
        ),
        staticPlacementAudit,
      });
  }
  const staticUnitFormationAudit = auditRulesV1StaticUnitFormation(authoredPredecessor);
  if (!staticUnitFormationAudit.ok) {
    return materializationDisposition(MATERIALIZATION_DISPOSITIONS.STRICT_REJECTED,
      "rules_v1_host", {
        proposalKey: String(proposal.proposalKey || ""),
        reason: "terminal_batch_static_unit_formation_rejected",
        scenarioKey,
        cellKey: cell.cellKey,
        subcellKey: String(proposal.representativeSubcellKey || ""),
        receiptHash: staticAuditReceiptHash(
          "rules_v1_static_unit_formation_audit",
          staticUnitFormationAudit,
        ),
        staticUnitFormationAudit,
      });
  }
  const scoped = enumerateWarmachineBenchmarkActionsV2(authoredPredecessor, {
    includeActorlessActions: true,
    actionFamilyKeys: ["timing"],
  });
  const predecessor = scoped.state;
  const action = (scoped.enumeration.actions || []).find((candidate) =>
    candidate.actionType === "end_turn");
  if (!action) {
    const rejectedEndTurnActions = (scoped.enumeration.rejectedActions || [])
      .filter((candidate) => candidate.actionType === "end_turn")
      .map(stableGraphValue);
    return materializationDisposition(MATERIALIZATION_DISPOSITIONS.STRICT_REJECTED,
      "rules_v1_host", {
      reason: "terminal_batch_end_turn_action_missing",
      cellKey: cell.cellKey,
      receiptHash: stableGraphHash({
        operation: "rules_v1_end_turn_enumeration",
        hostReceiptHash: warmachineHost.receipt.receiptHash,
        inputStateHash: scoped.inputStateHash,
        rejectedEndTurnActions,
      }),
      rejectedEndTurnActions,
      });
  }
  const executionOptions = {
    routeKey: `steamroller-terminal-batch:${proposal.proposalKey || cell.cellKey}`,
    actionPatch: proposal.actionPatch || {},
  };
  const executed = executeScopedWarmachineBenchmarkActionV2(
    scoped,
    action,
    { actionKey: action.actionKey },
    executionOptions,
  );
  if (!executed.ok) {
    return materializationDisposition(MATERIALIZATION_DISPOSITIONS.STRICT_REJECTED,
      "rules_v1_host", {
      reason: executed.reason || "terminal_batch_end_turn_strict_rejected",
      cellKey: cell.cellKey,
      receiptHash: executed.receipt?.receiptHash || "",
      });
  }
  const events = executed.transition?.events || [];
  const settlement = events.find((event) =>
    event.eventType === "steamroller_2026_turn_end_settled");
  const terminal = events.find((event) => event.eventType === "terminal");
  const winnerSideKey = String(proposal.winnerSideKey || oppositeSide(predecessor.activeSideKey));
  if (!settlement || terminal?.winnerSideKey !== winnerSideKey ||
      terminal?.reason !== "steamroller_2026_lead_three_after_scoring_on_opponent_turn") {
    const observedSuccessor = executed.normalizedState || executed.state || {};
    return materializationDisposition(MATERIALIZATION_DISPOSITIONS.PROPOSAL_FILTERED,
      "terminal_goal_contract", {
      reason: "terminal_batch_matching_terminal_event_missing",
      cellKey: cell.cellKey,
      observedTerminal: stableGraphValue(terminal || null),
      observedSettlement: stableGraphValue(settlement || null),
      observedScoreBefore: stableGraphValue(predecessor.scenario?.score || {}),
      observedScoreAfter: stableGraphValue(observedSuccessor.scenario?.score || {}),
      observedScoringEvents: stableGraphValue(events.filter((event) =>
        String(event.eventType || "").includes("score") ||
        String(event.eventType || "").includes("scoring"))),
      receiptHash: executed.receipt?.receiptHash || "",
      hostReplayAttempted: true,
      hostReplayAccepted: true,
      });
  }
  const loserSideKey = oppositeSide(winnerSideKey);
  const leadBefore = scenarioScore(predecessor, winnerSideKey) -
    scenarioScore(predecessor, loserSideKey);
  const successor = executed.normalizedState || executed.state;
  const leadAfter = scenarioScore(successor, winnerSideKey) -
    scenarioScore(successor, loserSideKey);
  const evidence = {
    leadBefore,
    leadAfter,
    netGain: leadAfter - leadBefore,
    winnerSourceCounts: scoreSourceCountsForSettlement(
      corpus,
      predecessor,
      settlement,
      winnerSideKey,
      events,
    ),
    opponentSourceCounts: scoreSourceCountsForSettlement(
      corpus,
      predecessor,
      settlement,
      loserSideKey,
      events,
    ),
  };
  const requestedScoreTransitionKey = String(
    proposal.partitionCoordinates?.scoreTransition || "",
  );
  const scoreTransition = findScoreTransition(
    corpus,
    cell,
    evidence,
    requestedScoreTransitionKey,
  );
  if (!scoreTransition) {
    return materializationDisposition(MATERIALIZATION_DISPOSITIONS.PROPOSAL_FILTERED,
      "terminal_goal_contract", {
      reason: "terminal_batch_score_transition_not_in_corpus",
      cellKey: cell.cellKey,
      evidence: stableGraphValue(evidence),
      receiptHash: executed.receipt?.receiptHash || "",
      hostReplayAttempted: true,
      hostReplayAccepted: true,
      });
  }
  const partitionAudit = auditDeclaredPartitions(predecessor, settlement, proposal);
  if (!partitionAudit.ok) {
    return materializationDisposition(MATERIALIZATION_DISPOSITIONS.PROPOSAL_FILTERED,
      "representative_partition_contract", {
      reason: "terminal_batch_declared_partitions_not_proven",
      cellKey: cell.cellKey,
      partitionAudit,
      receiptHash: executed.receipt?.receiptHash || "",
      hostReplayAttempted: true,
      hostReplayAccepted: true,
      });
  }
  let subcellKey = "";
  try {
    subcellKey = warmachineSteamrollerTerminalScenarioSubcellKeyV1(cell, {
      ...(proposal.partitionCoordinates || {}),
      scoreTransition: scoreTransition.scoreTransitionKey,
    });
  } catch (error) {
    return materializationDisposition(MATERIALIZATION_DISPOSITIONS.INPUT_INVALID,
      "corpus_identity_contract", {
      reason: String(error?.message || error),
      cellKey: cell.cellKey,
      });
  }
  const replayScoped = enumerateWarmachineBenchmarkActionsV2(predecessor, {
    includeActorlessActions: true,
    actionFamilyKeys: ["timing"],
  });
  const replayAction = (replayScoped.enumeration.actions || []).find((candidate) =>
    candidate.actionKey === action.actionKey);
  const replayed = replayAction
    ? executeScopedWarmachineBenchmarkActionV2(
      replayScoped,
      replayAction,
      { actionKey: replayAction.actionKey },
      executionOptions,
    )
    : null;
  const terminalStateHash = warmachineReverseStateSemanticHashV1(successor);
  const replayStateHash = replayed?.ok
    ? warmachineReverseStateSemanticHashV1(replayed.normalizedState || replayed.state)
    : "";
  if (!replayed?.ok || replayStateHash !== terminalStateHash) {
    return materializationDisposition(MATERIALIZATION_DISPOSITIONS.INPUT_INVALID,
      "independent_replay_contract", {
      reason: "terminal_batch_independent_replay_mismatch",
      cellKey: cell.cellKey,
      subcellKey,
      terminalStateHash,
      replayStateHash,
      receiptHash: replayed?.receipt?.receiptHash || "",
      });
  }
  const publicResult = stableGraphValue({
    disposition: "strict_materialized",
    authority: "rules_v1_host",
    strictRulesConclusion: false,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    proposalKey: String(proposal.proposalKey || ""),
    scenarioKey,
    cellKey: cell.cellKey,
    subcellKey,
    terminalClassKey: cell.terminalClassKey,
    predecessorStateHash: warmachineReverseStateSemanticHashV1(predecessor),
    authoredPredecessorStateHash: stableGraphHash(authoredPredecessor),
    normalizedActionInputStateHash: scoped.inputStateHash,
    strictEnumerationPreparedStateHash: scoped.enumerationStateHash,
    terminalStateHash,
    actionKey: action.actionKey,
    receiptHash: executed.receipt?.receiptHash || "",
    replayReceiptHash: replayed.receipt?.receiptHash || "",
    staticPlacementAudit: stableGraphValue(staticPlacementAudit),
    staticUnitFormationAudit: stableGraphValue(staticUnitFormationAudit),
    scoreBefore: stableGraphValue(predecessor.scenario?.score || {}),
    scoreAfter: stableGraphValue(successor.scenario?.score || {}),
    settlementEvidence: stableGraphValue({
      scored: settlement.scored || [],
      combinationBonuses: settlement.combinationBonuses || [],
      preScoring: settlement.preScoring || null,
      postScoring: settlement.postScoring || null,
      victory: settlement.victory || null,
      eventTypes: events.map((event) => event.eventType),
      scoreEvents: events.filter((event) => [
        "scenario_score",
        "scenario_score_duplicate_ignored",
        "steamroller_2026_turn_end_settled",
        "steamroller_2026_scenario_victory_check",
      ].includes(event.eventType)),
      scenarioMutationEvents: events.filter((event) => [
        "high_stakes_countdown_removed",
        "high_stakes_magical_blast_damage",
        "high_stakes_element_detonated",
        "wolves_objective_progressed",
        "wolves_third_token_goal_checked",
        "payload_objective_moved",
      ].includes(event.eventType)),
    }),
    scoreTransitionKey: scoreTransition.scoreTransitionKey,
    primarySourceFamilyKey: scoreTransition.scoringGainClass?.primarySourceFamilyKey || "",
    winnerSourceCounts: evidence.winnerSourceCounts,
    opponentSourceCounts: evidence.opponentSourceCounts,
    pieceIdentitySource: stableGraphValue(proposal.pieceIdentitySource || {}),
    partitionCoordinates: stableGraphValue({
      ...(proposal.partitionCoordinates || {}),
      scoreTransition: scoreTransition.scoreTransitionKey,
    }),
    partitionAudit,
    predecessorHistoryEvidence: stableGraphValue(proposal.predecessorHistoryEvidence || {}),
    leadBefore,
    leadAfter,
    strictReplayCertified: true,
    reachabilityProven: false,
    trainingTruth: false,
  });
  return {
    publicResult,
    runtimeRoot: {
      ...publicResult,
      corpusCell: cell,
      predecessorState: structuredClone(predecessor),
      terminalState: structuredClone(successor),
      terminalActionPatch: stableGraphValue(proposal.actionPatch || {}),
    },
  };
}

export function buildWarmachineScoreTerminalHypothesisCellFromMaterializedRootV1(
  runtimeRoot = {},
) {
  if (runtimeRoot.disposition !== "strict_materialized" ||
      !runtimeRoot.predecessorState || !runtimeRoot.terminalState) {
    throw new Error("score_terminal_materialized_runtime_root_required");
  }
  const scoreBefore = runtimeRoot.predecessorState.scenario?.score || {};
  const scoreAfter = runtimeRoot.terminalState.scenario?.score || {};
  const sideKeys = [...new Set([...Object.keys(scoreBefore), ...Object.keys(scoreAfter)])].sort();
  const scoreGainBySide = Object.fromEntries(sideKeys.map((sideKey) => [
    sideKey,
    numeric(scoreAfter[sideKey], 0) - numeric(scoreBefore[sideKey], 0),
  ]));
  const core = {
    schemaVersion: WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA,
    cellKey: runtimeRoot.subcellKey,
    sourceCorpusCellKey: runtimeRoot.cellKey,
    goalType: "scenario_score",
    scenarioKey: runtimeRoot.scenarioKey,
    roundNumber: Number(runtimeRoot.predecessorState.turnNumber),
    winnerSideKey: runtimeRoot.corpusCell.winnerSideKey,
    loserSideKey: runtimeRoot.corpusCell.loserSideKey,
    endingSideKey: runtimeRoot.corpusCell.endingSideKey,
    attackerSideKey: runtimeRoot.corpusCell.attackerSideKey,
    defenderSideKey: runtimeRoot.corpusCell.defenderSideKey,
    scoreBeforeTerminalCell: { scoreBySide: stableGraphValue(scoreBefore) },
    terminalScoreGainCell: { scoreGainBySide: stableGraphValue(scoreGainBySide) },
    terminalActionPatch: stableGraphValue(runtimeRoot.terminalActionPatch || {}),
    scenarioSettlementInverseWitness: stableGraphValue({
      sourceReceiptHash: runtimeRoot.receiptHash,
      settlementEvidence: runtimeRoot.settlementEvidence,
      scenarioMutationEvents:
        runtimeRoot.settlementEvidence?.scenarioMutationEvents || [],
      exactWithinMaterializedRoot: true,
      postSettlementActivationResetApplied: true,
    }),
    predecessorHistoryEvidence: stableGraphValue(
      runtimeRoot.predecessorHistoryEvidence || {},
    ),
    provenance: {
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      sourceCorpusHash: runtimeRoot.corpusCell.dependencyReceipt?.hostReceiptHash || "",
      sourceMaterializedSubcellKey: runtimeRoot.subcellKey,
      forwardOpeningRead: false,
      intermediateRouteRead: false,
    },
    trainingTruth: false,
  };
  return stableGraphValue({
    ...core,
    hypothesisBridgeHash: stableGraphHash(core),
  });
}

export function materializeWarmachineSteamrollerScoreTerminalBatchV1({
  corpus = {},
  proposals = [],
  maximumProposals = proposals.length,
} = {}) {
  if (corpus.coverage?.denominatorComplete !== true) {
    throw new Error("terminal_batch_corpus_denominator_incomplete");
  }
  const budget = Math.max(0, Math.floor(Number(maximumProposals) || 0));
  const results = [];
  const runtimeRoots = [];
  for (let index = 0; index < proposals.length; index += 1) {
    if (index >= budget) {
      results.push(materializationDisposition(MATERIALIZATION_DISPOSITIONS.BUDGET_DEFERRED,
        "search_budget", {
        proposalKey: String(proposals[index]?.proposalKey || ""),
        reason: "terminal_batch_materialization_budget_exhausted",
        }));
      continue;
    }
    const materialized = materializeOne(corpus, proposals[index]);
    if (materialized?.runtimeRoot) runtimeRoots.push(materialized.runtimeRoot);
    results.push(materialized?.publicResult || materialized);
  }
  const materialized = results.filter((row) => row.disposition === "strict_materialized");
  const strictRejected = results.filter((row) =>
    row.disposition === MATERIALIZATION_DISPOSITIONS.STRICT_REJECTED);
  const proposalFiltered = results.filter((row) =>
    row.disposition === MATERIALIZATION_DISPOSITIONS.PROPOSAL_FILTERED);
  const inputInvalid = results.filter((row) =>
    row.disposition === MATERIALIZATION_DISPOSITIONS.INPUT_INVALID);
  const budgetDeferred = results.filter((row) =>
    row.disposition === MATERIALIZATION_DISPOSITIONS.BUDGET_DEFERRED);
  const uniqueSubcellsByCell = new Map();
  for (const row of materialized) {
    if (!uniqueSubcellsByCell.has(row.cellKey)) uniqueSubcellsByCell.set(row.cellKey, new Set());
    uniqueSubcellsByCell.get(row.cellKey).add(row.subcellKey);
  }
  const dispositionsByCellKey = {};
  for (const [cellKey, subcellKeys] of uniqueSubcellsByCell.entries()) {
    const cell = (corpus.cells || []).find((row) => row.cellKey === cellKey);
    const count = BigInt(subcellKeys.size);
    dispositionsByCellKey[cellKey] = {
      strictMaterializedSubcellCount: String(count),
      strictRejectedSubcellCount: "0",
      budgetDeferredSubcellCount: String(BigInt(cell.subcellDenominator) - count),
    };
  }
  const core = {
    schemaVersion: WARMACHINE_STEAMROLLER_SCORE_TERMINAL_MATERIALIZATION_BATCH_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    corpusHash: corpus.corpusHash,
    proposedRootCount: proposals.length,
    strictMaterializedRootCount: materialized.length,
    strictRejectedRootCount: strictRejected.length,
    proposalFilteredRootCount: proposalFiltered.length,
    inputInvalidRootCount: inputInvalid.length,
    budgetDeferredRootCount: budgetDeferred.length,
    dispositionCounts: stableGraphValue({
      strict_materialized: materialized.length,
      strict_rejected: strictRejected.length,
      proposal_filtered: proposalFiltered.length,
      input_invalid: inputInvalid.length,
      budget_deferred: budgetDeferred.length,
    }),
    uniqueStrictMaterializedSubcellCount: [...uniqueSubcellsByCell.values()]
      .reduce((total, rows) => total + rows.size, 0),
    dispositionsByCellKey,
    results,
    rulesAuthorityAudit: stableGraphValue({
      strictRulesAuthority: "project_d_rules_v1_host",
      inputContractCanStrictReject: false,
      historyEvidenceContractCanStrictReject: false,
      terminalGoalContractCanStrictReject: false,
      representativePartitionContractCanStrictReject: false,
      terminalActionRequiresHostExecution: true,
    }),
    claimBoundary: "Each accepted row proves one exact score-terminal materialization and an independent strict replay; history-required proposals additionally bind their strict predecessor-history receipt. Only a rules-v1 Host static audit, legal-action enumeration or strict transition failure is strict_rejected. Input/history defects and Host-legal states that miss the declared terminal or representative partition remain separately visible. This does not prove a legal roster, a reverse route to deployment, opponent robustness, strategy quality, corpus completeness or training truth.",
  };
  const report = stableGraphValue({
    ...core,
    batchHash: stableGraphHash(core),
  });
  return { ...report, runtimeRoots };
}
