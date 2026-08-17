import { warmachineHost } from "../warmachine-host-runtime.mjs";
import { buildWarmachineTerminalHypothesisDomainV1 } from
  "../reverse/terminal-hypothesis-v1.mjs";
import { generateWarmachineTerminalPositionDomainV1 } from
  "../reverse/terminal-position-domain-v1.mjs";
import { materializeWarmachineTerminalSpatialCellsV1 } from
  "../reverse/terminal-spatial-materializer-v1.mjs";
import { buildWarmachineFixedSteamrollerFixtureV2 } from
  "./fixed-steamroller-fixture-v2.mjs";

export const WARMACHINE_FIXED_TERMINAL_SCORE_POSITION_CORPUS_V1_SCHEMA =
  "warmachine_fixed_terminal_score_position_corpus_v1";

function requiredPiece(pieces, predicate, reason) {
  const piece = pieces.find(predicate);
  if (!piece) throw new Error(reason);
  return piece;
}

function objectiveByKey(state, objectiveKey) {
  const objective = (state.scenario?.objectives || []).find((entry) =>
    entry.objectiveKey === objectiveKey);
  if (!objective) throw new Error(`fixed_terminal_score_objective_missing:${objectiveKey}`);
  return objective;
}

function priorScoringRow(scoringElementKey) {
  return {
    key: `2:player1:objective:${scoringElementKey}:turn_end:player2`,
    round: 2,
    sideKey: "player1",
    elementType: "objective",
    elementKey: scoringElementKey,
    scoringWindow: "turn_end:player2",
    points: 1,
    sourceActionType: "end_turn",
    sourceEventType: "steamroller_2026_turn_end_scoring",
    reason: "steamroller_2026_turn_end_scoring",
    sequence: 1,
  };
}

export function buildWarmachineFixedTerminalScorePositionCorpusV1(rawOptions = {}) {
  const fixture = buildWarmachineFixedSteamrollerFixtureV2({
    seed: String(rawOptions.seed || "fixed-terminal-score-position-domain-v1"),
  });
  const stateTemplate = structuredClone(fixture.stateTemplate);
  const terminalResourceAssumptions = [];
  for (const piece of stateTemplate.pieces || []) {
    if (piece.sideKey !== "player1" || piece.isWarjack !== true) continue;
    piece.resourcePoints = 1;
    piece.resource2 = 1;
    if ("focus" in piece) piece.focus = 1;
    terminalResourceAssumptions.push({
      pieceKey: piece.pieceKey,
      resourceKind: "focus",
      resourcePointsBeforeTerminalTurnEnd: 1,
      resourcePointsAfterTerminalTurnEnd: 0,
      source: "rule_derived_power_up_at_player1_round_three_control_phase",
      activationStatus: "player2_end_turn_begins_player1_maintenance_and_clears_focus",
    });
  }
  const scorer = requiredPiece(stateTemplate.pieces, (piece) =>
    piece.sideKey === "player1" && piece.isWarjack === true &&
    /raptor/i.test(`${piece.label || ""} ${piece.name || ""}`),
  "fixed_terminal_score_raptor_missing");
  const scorerLeader = requiredPiece(stateTemplate.pieces, (piece) =>
    piece.sideKey === "player1" && (piece.isWarcaster || piece.isWarlock),
  "fixed_terminal_score_leader_missing");
  const requestedPositionAnchorKeys = new Set(rawOptions.positionAnchorKeys || []);
  const requestedScoringElementKeys = [...requestedPositionAnchorKeys]
    .map((anchorKey) => anchorKey.includes("left-50")
      ? "left-50"
      : anchorKey.includes("right-50") ? "right-50" : "")
    .filter(Boolean);
  const scoringElementKeys = rawOptions.scoringElementKeys ||
    (requestedScoringElementKeys.length
      ? [...new Set(requestedScoringElementKeys)]
      : ["left-50", "right-50"]);
  const relativeDomain = buildWarmachineTerminalHypothesisDomainV1({
    scenarioKey: "two-fronts",
    scenarioPacketKey: "steamroller-2026",
    scenarioPacketYear: "2026",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    rosterReceiptHash: fixture.fixtureHash,
    specs: [{
      goalType: "scenario_score",
      roundNumbers: [3],
      winnerSideKeys: ["player1"],
      loserSideKeys: ["player2"],
      endingSideKeys: ["player2"],
      causalActionFamilies: ["steamroller_turn_end_settlement"],
      scoringElementKeys,
      scoreBeforeTerminalCells: [{
        relationKey: "player1_leads_two_before_opponent_turn_settlement",
        scoreBySide: { player1: 2, player2: 0 },
      }],
      terminalScoreGainCells: [{
        relationKey: "player1_secures_one_two_fronts_objective",
        scoreGainBySide: { player1: 1, player2: 0 },
      }],
      geometryRelationCells: [{
        relationKind: "later_round_score_position_domain_required",
        actorToTargetRangeBand: "partitioned_by_generator",
        lineOfSightRelation: "not_required_for_turn_end_scoring",
        pathRelation: "reverse_history_unproven",
        baseRelation: "legal_nonoverlap",
        scenarioRelation: "one_declared_50mm_objective_only",
        exactCoordinatesKnown: false,
      }],
      assumptionSources: {
        goalType: "user_constrained",
        roundNumber: "user_constrained",
        winnerSideKey: "user_constrained",
        loserSideKey: "rule_derived",
        endingSideKey: "rule_derived",
        causalActionFamily: "rule_derived",
        scoringElementKey: "optimistic_proposal",
        scoreBeforeTerminalCell: "optimistic_proposal",
        terminalScoreGainCell: "optimistic_proposal",
        geometryRelationCell: "optimistic_proposal",
      },
    }],
  });

  const defaultAnchorSpecs = [
    ["round-three-left-50-outer", "left-50", 180, 90],
    ["round-three-left-50-lower", "left-50", 270, 0],
    ["round-three-right-50-outer", "right-50", 180, 270],
    ["round-three-right-50-lower", "right-50", 270, 180],
  ];
  const allTargetAnchors = rawOptions.targetAnchors || defaultAnchorSpecs.map(([
    anchorKey,
    scenarioElementKey,
    actorAngleDeg,
    controllerAngleDeg,
  ]) => {
    const objective = objectiveByKey(stateTemplate, scenarioElementKey);
    return {
      anchorKey,
      source: "scenario_relative_score_position_seed",
      scenarioElementKey,
      actorAngleDeg,
      controllerAngleDeg,
      targetPosition: { xIn: objective.xIn, yIn: objective.yIn },
    };
  });
  const targetAnchors = requestedPositionAnchorKeys.size
    ? allTargetAnchors.filter((anchor) => requestedPositionAnchorKeys.has(anchor.anchorKey))
    : allTargetAnchors;
  const scenarioTerrain = (stateTemplate.terrain || []).find((terrain) =>
    terrain.isScenarioTerrain || terrain.scenarioTerrain || terrain.scenarioElement);
  const additionalScenarioPresenceReservations = scenarioTerrain ? [{
    elementKey: scenarioTerrain.terrainKey,
    elementType: "scenario_terrain",
    position: {
      xIn: scenarioTerrain.xIn ?? scenarioTerrain.position?.xIn,
      yIn: scenarioTerrain.yIn ?? scenarioTerrain.position?.yIn,
    },
    baseRadiusIn: Math.max(
      Number(scenarioTerrain.widthIn || 0),
      Number(scenarioTerrain.heightIn || 0),
      Number(scenarioTerrain.radiusIn || 0) * 2,
    ) / 2 + 0.25,
    presenceRangeIn: scenarioTerrain.scenarioTerrainWithinImpossible
      ? Number(scenarioTerrain.scenarioTerrainControlRangeIn || 3)
      : 0,
    exceptPieceKeys: [],
  }] : [];
  const positionDomain = generateWarmachineTerminalPositionDomainV1(
    stateTemplate,
    relativeDomain.cells,
    {
      scoringPieceKey: scorer.pieceKey,
      controllerPieceKeyByActor: { [scorer.pieceKey]: scorerLeader.pieceKey },
      targetAnchors,
      actionRangeBands: rawOptions.scoringRangeBands || [{
        bandKey: "objective-control-outer",
        minimumFraction: 0.78,
        maximumFraction: 0.98,
        placementFraction: 0.9,
      }],
      controlRangeBands: rawOptions.controlRangeBands || [{
        bandKey: "leader-control-inner",
        minimumFraction: 0.25,
        maximumFraction: 0.6,
        placementFraction: 0.45,
      }],
      remainingPlacementModes: ["coherent_contest_width"],
      placeControlGroupsBeforeUnits: true,
      additionalScenarioPresenceReservations,
      laterRoundPositionArea: rawOptions.laterRoundPositionArea || {
        minimumXIn: 3,
        maximumXIn: 45,
        minimumYIn: 8,
        maximumYIn: 40,
      },
      maximumProposals: rawOptions.maximumProposals ?? targetAnchors.length,
    },
  );

  const materializationAnchorKeys = rawOptions.materializationAnchorKeys || [
    "round-three-left-50-outer",
  ];
  const materializationAnchorPriority = new Map(materializationAnchorKeys.map(
    (anchorKey, index) => [anchorKey, index],
  ));
  const materializationCells = [...positionDomain.proposals].sort((left, right) => {
    const leftAnchorKey = left.geometryRelationCell?.generationEvidence?.anchor?.anchorKey || "";
    const rightAnchorKey = right.geometryRelationCell?.generationEvidence?.anchor?.anchorKey || "";
    const leftPriority = materializationAnchorPriority.get(leftAnchorKey) ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = materializationAnchorPriority.get(rightAnchorKey) ?? Number.MAX_SAFE_INTEGER;
    return leftPriority - rightPriority || left.cellKey.localeCompare(right.cellKey);
  });
  const priorTurnSettlementSeedByCellKey = Object.fromEntries(materializationCells.map((cell) => [
    cell.cellKey,
    {
      endingSideKey: "player1",
      endingTurnNumber: 3,
      scoreBefore: { player1: 1, player2: 0 },
      scoringHistoryBefore: [priorScoringRow(cell.scoringElementKey)],
    },
  ]));
  const materialized = materializeWarmachineTerminalSpatialCellsV1(
    stateTemplate,
    materializationCells,
    {
      maximumCells: rawOptions.maximumMaterializedCells ?? 1,
      activationEnvelopeBySide: {
        player1: "all_alive_activated",
        player2: "all_alive_activated",
      },
      preTerminalActivationEnvelopeBySide: {
        player1: "all_alive_activated",
        player2: "all_alive_activated",
      },
      priorTurnSettlementSeedByCellKey,
      terminalAction: { actionType: "end_turn" },
      onStrictReplayProgress: rawOptions.onStrictReplayProgress,
    },
  );

  return {
    schemaVersion: WARMACHINE_FIXED_TERMINAL_SCORE_POSITION_CORPUS_V1_SCHEMA,
    fixture,
    stateTemplate,
    scorer,
    scorerLeader,
    relativeDomain,
    positionDomain,
    materialized,
    materializationAnchorKeys,
    priorTurnSettlementSeedByCellKey,
    terminalResourceAssumptions,
  };
}
