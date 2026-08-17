import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { buildWarmachineTerminalHypothesisDomainV1 } from
  "../reverse/terminal-hypothesis-v1.mjs";
import { generateWarmachineTerminalPositionDomainV1 } from
  "../reverse/terminal-position-domain-v1.mjs";
import { materializeWarmachineTerminalSpatialCellsV1 } from
  "../reverse/terminal-spatial-materializer-v1.mjs";
import { warmachinePieceInPlayV1 } from "../reverse/piece-lifecycle-v1.mjs";
import { replayWarmachineTerminalRouteStrictV2 } from
  "../reverse/strict-route-witness-v2.mjs";
import { materializeWarmachineSteamrollerScoreTerminalBatchV1 } from
  "../reverse/steamroller-score-terminal-materialization-batch-v1.mjs";
import { buildWarmachineSteamrollerTerminalScenarioCorpusV1 } from
  "../reverse/steamroller-terminal-scenario-corpus-v1.mjs";
import {
  auditRulesV1SteamrollerScenarioTerrainSetup,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";

export const WARMACHINE_MATCHUP_TERMINAL_ROOT_MATERIALIZER_V1_SCHEMA =
  "warmachine_matchup_terminal_root_materializer_v1";

const DEFAULT_SIDE_KEY_BY_TASK_SIDE = Object.freeze({
  subject: "player1",
  challenger: "player2",
});

const SCORE_GOAL_FAMILY = "scenario_score_threshold";

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function leaderLike(piece = {}) {
  return piece.isWarcaster === true || piece.isWarlock === true ||
    /warcaster|warlock|leader/i.test(`${piece.modelRole || ""} ${piece.modelType || ""}`);
}

function pieceLabel(piece = {}) {
  return String(piece.label || piece.name || piece.pieceKey || "");
}

function resourceValue(piece = {}) {
  return Math.max(0, numeric(
    piece.resourcePoints ?? piece.focus ?? piece.fury ?? piece.resource2,
    0,
  ));
}

function profileKey(profile = {}) {
  return String(profile.profileKey || profile.weaponKey || profile.spellKey || "");
}

function meleeProfiles(piece = {}) {
  const byKey = new Map();
  for (const profile of [
    ...(piece.attackProfiles || []),
    ...(piece.weaponProfiles || []),
  ]) {
    const key = profileKey(profile);
    const mode = String(profile.mode || "").toLowerCase();
    const rangeIn = numeric(profile.rangeIn ?? profile.range, NaN);
    if (!key || mode !== "melee" || !Number.isFinite(rangeIn) || rangeIn <= 0) continue;
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
  return (state.pieces || []).find((piece) => piece.pieceKey === requestedKey) ||
    (state.pieces || []).find((piece) =>
      piece.sideKey === actor.sideKey && leaderLike(piece)) || null;
}

function actorCandidates(state = {}, sideKey = "", rawOptions = {}) {
  const requestedActorPieceKey = String(rawOptions.actorPieceKey || "");
  const requestedProfileKey = String(rawOptions.profileKey || "");
  const requestedActorLabelPattern = String(rawOptions.actorLabelPattern || "");
  const candidates = [];
  for (const piece of state.pieces || []) {
    if (piece.sideKey !== sideKey || !warmachinePieceInPlayV1(piece)) continue;
    if (requestedActorPieceKey && piece.pieceKey !== requestedActorPieceKey) continue;
    if (requestedActorLabelPattern && !pieceLabel(piece).toLowerCase().includes(
      requestedActorLabelPattern.toLowerCase(),
    )) continue;
    const controller = controllerForActor(state, piece);
    for (const profile of meleeProfiles(piece)) {
      if (requestedProfileKey && profileKey(profile) !== requestedProfileKey) continue;
      const row = {
        actorPieceKey: piece.pieceKey,
        actorLabel: pieceLabel(piece),
        actorCardId: String(piece.cardId || piece.metadata?.cardId || ""),
        controllerPieceKey: String(controller?.pieceKey || ""),
        controllerLabel: pieceLabel(controller || {}),
        profileKey: profileKey(profile),
        profileName: String(profile.name || ""),
        rangeIn: numeric(profile.rangeIn ?? profile.range),
        power: numeric(profile.power ?? profile.pow ?? profile.pPlusS ?? profile.pS),
        attackStat: numeric(piece.mat ?? piece.attackStat),
        resourceBeforeTerminalSetup: resourceValue(piece),
        isWarbeast: piece.isWarbeast === true,
        isWarjack: piece.isWarjack === true,
        isLeader: leaderLike(piece),
        isUnitMember: Boolean(piece.unitGroupId || piece.unitId),
      };
      candidates.push({
        ...row,
        feasibilityScore: (row.resourceBeforeTerminalSetup === 0 ? 1_000 : 0) +
          (row.isUnitMember ? 0 : 100) + row.power * 10 + row.attackStat + row.rangeIn,
      });
    }
  }
  return candidates.sort((left, right) =>
    right.feasibilityScore - left.feasibilityScore ||
    left.actorPieceKey.localeCompare(right.actorPieceKey) ||
    left.profileKey.localeCompare(right.profileKey));
}

function publicMaterialization(materialization = {}) {
  return stableGraphValue({
    schemaVersion: materialization.schemaVersion,
    inputCellCount: materialization.inputCellCount,
    dispositionCounts: materialization.dispositionCounts,
    roots: materialization.roots,
    rejected: materialization.rejected,
    deferred: materialization.deferred,
    reportHash: materialization.reportHash,
    ok: materialization.ok === true,
  });
}

function terminalRoute(actor, targetLeader, declineCount = 1) {
  const attack = {
    actionType: "melee_attack",
    actorPieceKey: actor.actorPieceKey,
    targetPieceKey: targetLeader.pieceKey,
    enumerationOptions: {
      actorPieceKeys: [actor.actorPieceKey],
      targetPieceKeys: [targetLeader.pieceKey],
      actionFamilyKeys: ["attack_or_effect"],
      includeActorlessActions: false,
      includeUntargetedActions: false,
    },
    actionPatch: {
      strictRollOutcome: {
        attackDice: [6, 6],
        damageDice: [6, 6],
      },
    },
  };
  return [
    attack,
    ...Array.from({ length: declineCount }, () => ({
      actionType: "resolve_lifecycle_trigger_decline",
    })),
  ];
}

function boxesRemaining(piece = {}) {
  return numeric(piece.boxesRemaining ?? piece.damage?.boxesRemaining, 0);
}

function taskRosterIdentityLedger(state = {}) {
  return (state.pieces || []).map((piece) => stableGraphValue({
    pieceKey: String(piece.pieceKey || ""),
    sideKey: String(piece.sideKey || ""),
    cardId: String(piece.cardId || piece.cardSnapshot?.id || ""),
    modelId: String(piece.modelId || ""),
    unitGroupId: String(piece.unitGroupId || piece.unitId || ""),
  })).sort((left, right) => left.pieceKey.localeCompare(right.pieceKey));
}

function routedSourceRosterKeys(routingGroup = {}, taskSideKey = "subject") {
  const field = taskSideKey === "challenger"
    ? "challengerRosterCandidates"
    : "subjectRosterCandidates";
  return new Set((routingGroup[field] || []).map((candidate) =>
    String(candidate.sourceListKey || "")).filter(Boolean));
}

function publicScoreBatch(batch = {}) {
  const { runtimeRoots: _runtimeRoots, ...report } = batch;
  return stableGraphValue(report);
}

function scoreRepresentativeBindingAudit({
  representative,
  routingGroup,
  opening,
  predecessorState,
  result,
  winnerSideKey,
  endingSideKey,
} = {}) {
  const openingRosterLedger = taskRosterIdentityLedger(opening.state || {});
  const predecessorRosterLedger = taskRosterIdentityLedger(predecessorState || {});
  const terrainAudit = auditRulesV1SteamrollerScenarioTerrainSetup(predecessorState || {});
  const checks = [
    ["representative_present", true, Boolean(representative)],
    ["representative_in_routing_group", true,
      routingGroup.representativeKeys?.includes(representative?.subcellKey)],
    ["representative_cell_in_routing_group", true,
      routingGroup.cellKeys?.includes(representative?.cellKey)],
    ["goal_family", SCORE_GOAL_FAMILY, routingGroup.goalFamily],
    ["subject_roster_routed", true,
      routedSourceRosterKeys(routingGroup, "subject").has(
        String(opening.subjectRosterKey || ""),
      )],
    ["challenger_roster_routed", true,
      routedSourceRosterKeys(routingGroup, "challenger").has(
        String(opening.challengerRosterKey || ""),
      )],
    ["terminal_class", "lead_three_after_opponent_turn_scoring",
      representative?.terminalClassKey],
    ["scenario_key", representative?.scenarioKey,
      predecessorState?.scenario?.scenarioKey],
    ["round_number", representative?.representativeRoundNumber,
      predecessorState?.turnNumber],
    ["winner_side", winnerSideKey, result?.partitionAudit?.evidence
      ?.find((row) => row.partitionKey === "scenarioControl")?.observed
      ?.scoredWinnerRows?.[0]?.scoringSideKey || winnerSideKey],
    ["ending_side", endingSideKey, predecessorState?.activeSideKey],
    ["representative_subcell", representative?.subcellKey, result?.subcellKey],
    ["representative_cell", representative?.cellKey, result?.cellKey],
    ["partition_coordinates", representative?.coordinates,
      result?.partitionCoordinates],
    ["scenario_terrain_partition", representative?.coordinates?.scenarioTerrainSetup,
      terrainAudit?.setupClassKey],
    ["scenario_terrain_host_audit", true, terrainAudit?.ok === true],
    ["static_placement_host_audit", true,
      result?.staticPlacementAudit?.ok === true],
    ["static_unit_formation_host_audit", true,
      result?.staticUnitFormationAudit?.ok === true],
    ["complete_roster_model_count", numeric(opening.modelCount),
      predecessorRosterLedger.length],
    ["complete_roster_identity", openingRosterLedger, predecessorRosterLedger],
    ["independent_strict_replay", true, result?.strictReplayCertified === true],
  ].map(([checkKey, expected, observed]) => {
    const normalizedExpected = expected === undefined ? null : expected;
    const normalizedObserved = observed === undefined ? null : observed;
    return stableGraphValue({
      checkKey,
      expected: normalizedExpected,
      observed: normalizedObserved,
      passed: stableGraphHash(normalizedExpected) === stableGraphHash(normalizedObserved),
    });
  });
  const core = stableGraphValue({
    groupKey: String(routingGroup.groupKey || ""),
    subcellKey: String(representative?.subcellKey || ""),
    cellKey: String(representative?.cellKey || ""),
    checks,
    issueCount: checks.filter((check) => !check.passed).length,
    bindingProven: checks.every((check) => check.passed),
    rulesAuthority: "project_d_rules_v1_host",
    strategyAuthority: false,
  });
  return { ...core, bindingHash: stableGraphHash(core) };
}

function representativeBindingAudit({
  representative,
  routingGroup,
  scenarioKey,
  roundNumber,
  resourceEnvelopeKey,
  actor,
  targetLeader,
  opening,
  acceptedRoot,
  independentReplay,
} = {}) {
  const coordinates = representative?.coordinates || {};
  const preTerminalState = acceptedRoot?.preTerminalState || {};
  const preActor = (preTerminalState.pieces || []).find((piece) =>
    piece.pieceKey === actor?.actorPieceKey);
  const preTarget = (preTerminalState.pieces || []).find((piece) =>
    piece.pieceKey === targetLeader?.pieceKey);
  const scenarioTerrainAudit = acceptedRoot
    ? auditRulesV1SteamrollerScenarioTerrainSetup(preTerminalState)
    : null;
  const attackRangeEvidence = (acceptedRoot?.relationEvidence || []).find((entry) =>
    entry.relationKind === "attack_profile_range" &&
    entry.sourcePieceKey === actor?.actorPieceKey &&
    entry.targetPieceKey === targetLeader?.pieceKey);
  const controlEvidence = (acceptedRoot?.relationEvidence || []).find((entry) =>
    entry.relationKind === "leader_control_range" &&
    entry.targetPieceKey === actor?.actorPieceKey);
  const inPlayCount = (preTerminalState.pieces || []).filter((piece) =>
    warmachinePieceInPlayV1(piece)).length;
  const finalStateHash = independentReplay
    ? stableGraphHash(independentReplay.finalState)
    : "";
  const auditValueHash = (value) => stableGraphHash(value === undefined
    ? { presence: "undefined" }
    : { presence: "defined", value });
  const checks = [
    ["representative_present", true, Boolean(representative)],
    ["representative_in_routing_group", true,
      routingGroup.representativeKeys?.includes(representative?.subcellKey)],
    ["representative_cell_in_routing_group", true,
      routingGroup.cellKeys?.includes(representative?.cellKey)],
    ["subject_roster_routed", true,
      routedSourceRosterKeys(routingGroup, "subject").has(
        String(opening.subjectRosterKey || ""),
      )],
    ["challenger_roster_routed", true,
      routedSourceRosterKeys(routingGroup, "challenger").has(
        String(opening.challengerRosterKey || ""),
      )],
    ["scenario_key", scenarioKey, representative?.scenarioKey],
    ["round_number", roundNumber, representative?.representativeRoundNumber],
    ["terminal_class", "unique_leader_assassination",
      representative?.terminalClassKey],
    ["action_range_partition", "strictly_inside", coordinates.actionRange],
    ["base_topology_partition", "legal_separated", coordinates.baseTopology],
    ["damage_partition", "leader_at_terminal_threshold", coordinates.damage],
    ["leader_control_partition", "strictly_inside", coordinates.leaderControl],
    ["lifecycle_partition", "both_rosters_complete", coordinates.lifecycle],
    ["line_of_sight_partition", "clear", coordinates.lineOfSight],
    ["resource_partition", resourceEnvelopeKey, coordinates.resource],
    ["scenario_terrain_partition", coordinates.scenarioTerrainSetup,
      scenarioTerrainAudit?.setupClassKey],
    ["scenario_terrain_host_audit", true, scenarioTerrainAudit?.ok === true],
    ["static_placement_host_audit", true,
      acceptedRoot?.staticPlacementAudit?.ok === true],
    ["static_unit_formation_host_audit", true,
      acceptedRoot?.staticUnitFormationAudit?.ok === true],
    ["complete_roster_model_count", numeric(opening.modelCount), inPlayCount],
    ["actor_resource_before_terminal", 0, resourceValue(preActor || {})],
    ["target_boxes_before_terminal", 1, boxesRemaining(preTarget || {})],
    ["strict_action_range_relation", true, attackRangeEvidence?.passed === true],
    ["strict_leader_control_relation", true, controlEvidence?.passed === true],
    ["independent_strict_replay", true, independentReplay?.strictWitness === true],
    ["independent_terminal_state_hash", acceptedRoot?.terminalStateHash || "",
      finalStateHash],
  ].map(([checkKey, expected, observed]) => stableGraphValue({
    checkKey,
    expected,
    observed,
    passed: auditValueHash(expected) === auditValueHash(observed),
  }));
  const core = stableGraphValue({
    groupKey: String(routingGroup.groupKey || ""),
    subcellKey: String(representative?.subcellKey || ""),
    cellKey: String(representative?.cellKey || ""),
    scenarioKey: String(representative?.scenarioKey || ""),
    representativeRoundNumber: numeric(representative?.representativeRoundNumber),
    coordinates,
    checks,
    issueCount: checks.filter((check) => !check.passed).length,
    bindingProven: checks.every((check) => check.passed),
    rulesAuthority: "project_d_rules_v1_host",
    strategyAuthority: false,
  });
  return { ...core, bindingHash: stableGraphHash(core) };
}

export function materializeWarmachineMatchupAssassinationTerminalRootV1(raw = {}) {
  const task = raw.task || {};
  const opening = raw.opening || {};
  const routingGroup = raw.routingGroup || {};
  const representative = raw.representative || null;
  const state = opening.state;
  if (!state || !Array.isArray(state.pieces)) {
    throw new Error("matchup_terminal_root_full_opening_state_required");
  }
  if (routingGroup.goalFamily !== "assassination") {
    throw new Error("matchup_terminal_root_assassination_group_required");
  }
  if (!representative || !routingGroup.representativeKeys?.includes(
    representative.subcellKey,
  )) {
    throw new Error("matchup_terminal_root_exact_representative_required");
  }
  const sideKeyByTaskSide = {
    ...DEFAULT_SIDE_KEY_BY_TASK_SIDE,
    ...(raw.sideKeyByTaskSide || {}),
  };
  const attackerTaskSideKey = String(raw.attackerTaskSideKey || "challenger");
  const defenderTaskSideKey = attackerTaskSideKey === "subject" ? "challenger" : "subject";
  const attackerSideKey = sideKeyByTaskSide[attackerTaskSideKey];
  const defenderSideKey = sideKeyByTaskSide[defenderTaskSideKey];
  const targetLeader = (state.pieces || []).find((piece) =>
    piece.sideKey === defenderSideKey && leaderLike(piece) && warmachinePieceInPlayV1(piece));
  if (!targetLeader) throw new Error("matchup_terminal_root_target_leader_missing");
  const candidates = actorCandidates(state, attackerSideKey, raw);
  const actor = candidates[0];
  if (!actor) throw new Error("matchup_terminal_root_melee_actor_missing");
  const roundNumber = numeric(raw.roundNumber,
    (routingGroup.exactRoundNumbers || [])[0] || task.horizon?.minimumTerminalRound || 2);
  const scenarioKey = String(raw.scenarioKey ||
    (routingGroup.scenarioKeys || []).find((key) => key === "two_fronts") ||
    routingGroup.scenarioKeys?.[0] || opening.scenarioKey || "two_fronts");
  const resourceEnvelopeKey = actor.resourceBeforeTerminalSetup === 0
    ? "zero_available"
    : "resource_available_not_required";
  const relativeDomain = buildWarmachineTerminalHypothesisDomainV1({
    scenarioKey: scenarioKey.replaceAll("_", "-"),
    scenarioPacketKey: "steamroller-2026",
    scenarioPacketYear: "2026",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    rosterReceiptHash: opening.strictDeploymentReceiptHash,
    specs: [{
      goalType: "assassination",
      roundNumbers: [roundNumber],
      winnerSideKeys: [attackerSideKey],
      loserSideKeys: [defenderSideKey],
      endingSideKeys: [attackerSideKey],
      causalActionFamilies: ["strict_melee_attack"],
      actorPieceKeys: [actor.actorPieceKey],
      targetLeaderPieceKeys: [targetLeader.pieceKey],
      targetBoxesBeforeFinal: [numeric(raw.targetBoxesBeforeFinal, 1)],
      resourceEnvelopeKeys: [resourceEnvelopeKey],
      geometryRelationCells: [{
        relationKind: "later_round_position_domain_required",
        actorToTargetRangeBand: "strictly_inside",
        lineOfSightRelation: "strict_terminal_action_required",
        pathRelation: "reverse_history_unproven",
        baseRelation: "legal_nonoverlap",
        exactCoordinatesKnown: false,
        relationChecks: [{
          relationKey: `matchup-profile:${actor.profileKey}`,
          relationKind: "attack_profile_range",
          sourcePieceKey: actor.actorPieceKey,
          targetPieceKey: targetLeader.pieceKey,
          profileKey: actor.profileKey,
        }],
      }],
      assumptionSources: {
        goalType: "user_constrained",
        roundNumber: "user_constrained",
        winnerSideKey: "user_constrained",
        loserSideKey: "rule_derived",
        endingSideKey: "user_constrained",
        causalActionFamily: "optimistic_proposal",
        actorPieceKey: "optimistic_proposal",
        targetLeaderPieceKey: "user_constrained",
        targetBoxesBeforeFinal: "optimistic_proposal",
        resourceEnvelopeKey: "user_constrained",
        geometryRelationCell: "optimistic_proposal",
      },
    }],
  });
  const targetAnchor = stableGraphValue(raw.targetAnchor || {
    anchorKey: `${scenarioKey}-round-${roundNumber}-west-flank`,
    source: "scenario_relative_position_seed",
    targetPosition: { xIn: 18, yIn: 21 },
  });
  const positionDomain = generateWarmachineTerminalPositionDomainV1(
    state,
    relativeDomain.cells,
    {
      profileKey: actor.profileKey,
      controllerPieceKeyByActor: {
        [actor.actorPieceKey]: actor.controllerPieceKey,
      },
      targetAnchors: [targetAnchor],
      actorAnglesDeg: raw.actorAnglesDeg || [180],
      controllerAnglesDeg: raw.controllerAnglesDeg || [90],
      actionRangeBands: raw.actionRangeBands || [{
        bandKey: "strictly-inside",
        minimumFraction: 0.2,
        maximumFraction: 0.6,
        placementFraction: 0.5,
      }],
      controlRangeBands: raw.controlRangeBands || [{
        bandKey: "strictly-inside",
        minimumFraction: 0.2,
        maximumFraction: 0.6,
        placementFraction: 0.45,
      }],
      remainingPlacementModes: raw.remainingPlacementModes || [
        "coherent_engagement_layers",
      ],
      laterRoundPositionArea: raw.laterRoundPositionArea || {
        minimumXIn: 2,
        maximumXIn: 46,
        minimumYIn: 3,
        maximumYIn: 45,
      },
      placeControlGroupsBeforeUnits: true,
      maximumProposals: numeric(raw.maximumPositionProposals, 1),
    },
  );
  const attempts = [];
  let accepted = null;
  for (const declineCount of raw.lifecycleDeclineCounts || [0, 1, 2, 3]) {
    if (!positionDomain.proposals.length || accepted) break;
    const routeSteps = terminalRoute(actor, targetLeader, declineCount);
    const materialization = materializeWarmachineTerminalSpatialCellsV1(
      state,
      positionDomain.proposals,
      {
        maximumCells: 1,
        activationEnvelopeBySide: {
          [defenderSideKey]: "all_alive_activated",
          [attackerSideKey]: "all_alive_unactivated",
        },
        priorTurnSettlementSeed: {
          endingSideKey: defenderSideKey,
          scoreBefore: { player1: 0, player2: 0 },
          scoringHistoryBefore: [],
        },
        terminalRouteSteps: routeSteps,
      },
    );
    const attempt = {
      declineCount,
      routeSteps,
      materialization: publicMaterialization(materialization),
    };
    attempts.push(attempt);
    if (materialization.ok) accepted = { materialization, attempt };
  }
  const acceptedRoot = accepted?.materialization.runtimeRoots?.[0] || null;
  const independentReplay = acceptedRoot
    ? replayWarmachineTerminalRouteStrictV2(
      acceptedRoot.preTerminalState,
      accepted.attempt.routeSteps,
      { goalType: "assassination", winnerSideKey: attackerSideKey },
      {
        routeKey: `matchup-terminal-independent:${routingGroup.groupKey}:${
          representative.subcellKey}`,
      },
    )
    : null;
  const independentReplayCore = stableGraphValue({
    strictWitness: independentReplay?.strictWitness === true,
    witnessHash: String(independentReplay?.witnessHash || ""),
    terminalReceiptHash: String(independentReplay?.terminalReceiptHash || ""),
    receiptHashes: (independentReplay?.receipts || []).map((receipt) =>
      receipt.receiptHash),
    initialStateHash: acceptedRoot ? stableGraphHash(acceptedRoot.preTerminalState) : "",
    finalStateHash: independentReplay ? stableGraphHash(independentReplay.finalState) : "",
    expectedFinalStateHash: String(acceptedRoot?.terminalStateHash || ""),
    finalStateHashMatches: Boolean(acceptedRoot && independentReplay) &&
      stableGraphHash(independentReplay.finalState) === acceptedRoot.terminalStateHash,
    rejected: stableGraphValue(independentReplay?.rejected || null),
    priorStrictReceiptsUsedAsExecutionInput: false,
  });
  const independentReplayEvidence = {
    ...independentReplayCore,
    independentReplayHash: stableGraphHash(independentReplayCore),
    independentStrictReplayProven: independentReplayCore.strictWitness &&
      independentReplayCore.finalStateHashMatches,
  };
  const representativeBinding = representativeBindingAudit({
    representative,
    routingGroup,
    scenarioKey,
    roundNumber,
    resourceEnvelopeKey,
    actor,
    targetLeader,
    opening,
    acceptedRoot,
    independentReplay,
  });
  const matchupTerminalRootProven = Boolean(acceptedRoot) &&
    independentReplayEvidence.independentStrictReplayProven &&
    representativeBinding.bindingProven;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_MATCHUP_TERMINAL_ROOT_MATERIALIZER_V1_SCHEMA,
    taskHash: task.taskHash,
    routingGroupKey: routingGroup.groupKey,
    constructionMacroProfileKey: routingGroup.constructionMacroProfileKey,
    representativeKeys: routingGroup.representativeKeys,
    rulesEngineCapabilityPinCount:
      routingGroup.rulesEngineCapabilityEvidence?.pinnedEvidenceCount || 0,
    rulesEngineCapabilityOnly: true,
    opening: {
      initialStateKey: opening.initialStateKey,
      strictOpeningStateHash: opening.strictOpeningStateHash,
      strictDeploymentReceiptHash: opening.strictDeploymentReceiptHash,
      subjectRosterKey: opening.subjectRosterKey,
      challengerRosterKey: opening.challengerRosterKey,
      scenarioKey: opening.scenarioKey,
      mapKey: opening.mapKey,
      deploymentSeedKey: opening.deploymentSeedKey,
      firstPlayerTaskSideKey: opening.firstPlayerTaskSideKey,
      modelCount: opening.modelCount,
    },
    terminalRequest: {
      scenarioKey,
      roundNumber,
      attackerTaskSideKey,
      attackerSideKey,
      defenderTaskSideKey,
      defenderSideKey,
      targetLeaderPieceKey: targetLeader.pieceKey,
      targetLeaderLabel: pieceLabel(targetLeader),
      targetBoxesBeforeFinal: numeric(raw.targetBoxesBeforeFinal, 1),
      resourceEnvelopeKey,
      targetAnchor,
    },
    selectedActor: actor,
    actorCandidateCount: candidates.length,
    actorCandidates: candidates.slice(0, numeric(raw.maximumReportedActorCandidates, 16)),
    actorSelectionAuthority: "terminal_root_feasibility_order_only_not_strategy_rank",
    relativeDomain: {
      domainHash: relativeDomain.domainHash,
      cellCount: relativeDomain.cellCount,
      cellKeys: relativeDomain.cells.map((cell) => cell.cellKey),
    },
    representativeBinding,
    positionDomain: {
      reportHash: positionDomain.reportHash,
      consideredCount: positionDomain.consideredCount,
      proposedCount: positionDomain.proposedCount,
      rejectedCount: positionDomain.rejectedCount,
      deferredCount: positionDomain.deferredCount,
      rejected: positionDomain.rejected,
      deferred: positionDomain.deferred,
    },
    attempts,
    strictMaterializedRootCount: accepted?.materialization.roots.length || 0,
    strictTerminalRootCount: matchupTerminalRootProven ? 1 : 0,
    strictTerminalRootKeys: matchupTerminalRootProven
      ? [acceptedRoot.rootKey]
      : [],
    independentReplayEvidence,
    matchupTerminalRootProven,
    taskRosterTerminalRouteProven: matchupTerminalRootProven,
    deploymentToTerminalReachabilityProven: false,
    gameValueInterval: { lowerBound: 0, upperBound: 1 },
    naturalWinRate: null,
    globalOptimalityProven: false,
    trainingTruth: false,
    claimBoundary: "An accepted root proves one exact task-roster terminal transition from an authored later-round state. The complete opening roster, current Host, strict geometry and strict terminal route are bound, but history from legal deployment, opponent closure, Chance mass and game value remain unresolved.",
  });
  return {
    ...core,
    reportHash: stableGraphHash(core),
    runtimeAcceptedMaterialization: accepted?.materialization || null,
    runtimeIndependentReplay: independentReplay || null,
  };
}

export function materializeWarmachineMatchupScoreTerminalRootV1(raw = {}) {
  const task = raw.task || {};
  const opening = raw.opening || {};
  const routingGroup = raw.routingGroup || {};
  const representative = raw.representative || null;
  const predecessorState = structuredClone(raw.predecessorState || {});
  if (!opening.state || !Array.isArray(opening.state.pieces)) {
    throw new Error("matchup_score_terminal_full_opening_state_required");
  }
  if (!Array.isArray(predecessorState.pieces)) {
    throw new Error("matchup_score_terminal_predecessor_state_required");
  }
  if (routingGroup.goalFamily !== SCORE_GOAL_FAMILY) {
    throw new Error("matchup_score_terminal_score_group_required");
  }
  if (!representative || !routingGroup.representativeKeys?.includes(
    representative.subcellKey,
  )) {
    throw new Error("matchup_score_terminal_exact_representative_required");
  }
  const sideKeyByTaskSide = {
    ...DEFAULT_SIDE_KEY_BY_TASK_SIDE,
    ...(raw.sideKeyByTaskSide || {}),
  };
  const winnerTaskSideKey = String(raw.winnerTaskSideKey || "subject");
  const endingTaskSideKey = String(raw.endingTaskSideKey ||
    (winnerTaskSideKey === "subject" ? "challenger" : "subject"));
  const winnerSideKey = String(sideKeyByTaskSide[winnerTaskSideKey] || "");
  const endingSideKey = String(sideKeyByTaskSide[endingTaskSideKey] || "");
  if (!winnerSideKey || !endingSideKey || winnerSideKey === endingSideKey) {
    throw new Error("matchup_score_terminal_side_binding_invalid");
  }
  const rosterReceiptHash = String(opening.strictDeploymentReceiptHash || "");
  if (!rosterReceiptHash) {
    throw new Error("matchup_score_terminal_roster_receipt_required");
  }
  const corpus = buildWarmachineSteamrollerTerminalScenarioCorpusV1({
    rosterReceiptHash,
  });
  const proposal = stableGraphValue({
    proposalKey: String(raw.proposalKey ||
      `matchup-score-terminal:${routingGroup.groupKey}:${representative.subcellKey}`),
    rosterReceiptHash,
    predecessorState,
    predecessorHistoryRequired: raw.predecessorHistoryRequired === true,
    predecessorHistoryEvidence: stableGraphValue(raw.predecessorHistoryEvidence || {}),
    hostScenarioKey: String(raw.scenarioKey || representative.scenarioKey ||
      predecessorState.scenario?.scenarioKey || ""),
    winnerSideKey,
    representativeSubcellKey: representative.subcellKey,
    partitionCoordinates: representative.coordinates,
    completeRosterPieceKeys: taskRosterIdentityLedger(opening.state)
      .map((piece) => piece.pieceKey),
    rosterDomainComplete: true,
    scenarioControlWitness: stableGraphValue(raw.scenarioControlWitness || {}),
    pieceIdentitySource: stableGraphValue({
      sourceKind: "custom_matchup_strict_legal_rosters_v1",
      taskHash: String(task.taskHash || ""),
      strictDeploymentReceiptHash: rosterReceiptHash,
      subjectRosterKey: String(opening.subjectRosterKey || ""),
      challengerRosterKey: String(opening.challengerRosterKey || ""),
      openingRosterIdentityHash: stableGraphHash(taskRosterIdentityLedger(opening.state)),
    }),
    actionPatch: stableGraphValue(raw.actionPatch || {}),
  });
  const batch = materializeWarmachineSteamrollerScoreTerminalBatchV1({
    corpus,
    proposals: [proposal],
    maximumProposals: 1,
  });
  const result = batch.results[0] || null;
  const runtimeRoot = batch.runtimeRoots[0] || null;
  const representativeBinding = scoreRepresentativeBindingAudit({
    representative,
    routingGroup,
    opening,
    predecessorState,
    result,
    winnerSideKey,
    endingSideKey,
  });
  const matchupTerminalRootProven = result?.disposition === "strict_materialized" &&
    result.strictReplayCertified === true && representativeBinding.bindingProven;
  const disposition = result?.disposition === "strict_materialized" &&
      !representativeBinding.bindingProven
    ? "proposal_filtered"
    : String(result?.disposition || "input_invalid");
  const dispositionReason = result?.disposition === "strict_materialized" &&
      !representativeBinding.bindingProven
    ? "matchup_score_terminal_representative_binding_failed"
    : String(result?.reason || "");
  const independentReplayEvidence = stableGraphValue({
    strictWitness: result?.strictReplayCertified === true,
    sourceReceiptHash: String(result?.receiptHash || ""),
    replayReceiptHash: String(result?.replayReceiptHash || ""),
    predecessorStateHash: String(result?.predecessorStateHash || ""),
    terminalStateHash: String(result?.terminalStateHash || ""),
    priorStrictReceiptsUsedAsExecutionInput: false,
    independentStrictReplayProven: result?.strictReplayCertified === true,
  });
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_MATCHUP_TERMINAL_ROOT_MATERIALIZER_V1_SCHEMA,
    terminalRootKind: "scenario_score",
    taskHash: task.taskHash,
    routingGroupKey: routingGroup.groupKey,
    constructionMacroProfileKey: routingGroup.constructionMacroProfileKey,
    representativeKeys: routingGroup.representativeKeys,
    rulesEngineCapabilityPinCount:
      routingGroup.rulesEngineCapabilityEvidence?.pinnedEvidenceCount || 0,
    genericCapabilityPinsCountAsTaskRoute: false,
    opening: {
      initialStateKey: opening.initialStateKey,
      strictOpeningStateHash: opening.strictOpeningStateHash,
      strictDeploymentReceiptHash: opening.strictDeploymentReceiptHash,
      subjectRosterKey: opening.subjectRosterKey,
      challengerRosterKey: opening.challengerRosterKey,
      scenarioKey: opening.scenarioKey,
      mapKey: opening.mapKey,
      deploymentSeedKey: opening.deploymentSeedKey,
      firstPlayerTaskSideKey: opening.firstPlayerTaskSideKey,
      modelCount: opening.modelCount,
    },
    terminalRequest: {
      scenarioKey: proposal.hostScenarioKey,
      roundNumber: representative.representativeRoundNumber,
      winnerTaskSideKey,
      winnerSideKey,
      endingTaskSideKey,
      endingSideKey,
      scoringElementKey: String(raw.scenarioControlWitness?.elementKey || ""),
      scoreTransitionKey: String(representative.coordinates?.scoreTransition || ""),
      authoredLaterRoundState: true,
      predecessorHistoryRequired: proposal.predecessorHistoryRequired,
    },
    proposal: {
      proposalKey: proposal.proposalKey,
      rosterReceiptHash,
      predecessorStateHash: stableGraphHash(predecessorState),
      completeRosterPieceCount: proposal.completeRosterPieceKeys.length,
      partitionCoordinates: proposal.partitionCoordinates,
      scenarioControlWitness: proposal.scenarioControlWitness,
    },
    representativeBinding,
    batch: publicScoreBatch(batch),
    disposition,
    dispositionReason,
    hostStrictMaterializedRootCount: batch.strictMaterializedRootCount,
    strictMaterializedRootCount: matchupTerminalRootProven ? 1 : 0,
    strictTerminalRootCount: matchupTerminalRootProven ? 1 : 0,
    strictTerminalRootKeys: matchupTerminalRootProven
      ? [String(runtimeRoot?.subcellKey || representative.subcellKey)]
      : [],
    independentReplayEvidence,
    matchupTerminalRootProven,
    taskRosterTerminalRouteProven: matchupTerminalRootProven,
    deploymentToTerminalReachabilityProven: false,
    gameValueInterval: { lowerBound: 0, upperBound: 1 },
    naturalWinRate: null,
    globalOptimalityProven: false,
    trainingTruth: false,
    claimBoundary: "An accepted score root proves one exact complete task-roster later-round state, Host-owned scenario settlement, representative partition and independent strict replay. An authored predecessor has no deployment-history authority unless separately certified. Filtered, invalid, unknown and budget-deferred candidates remain distinct from losses and unreachable states.",
  });
  return {
    ...core,
    reportHash: stableGraphHash(core),
    runtimeRoot,
  };
}
