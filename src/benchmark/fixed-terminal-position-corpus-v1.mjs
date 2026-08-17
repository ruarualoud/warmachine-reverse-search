import { buildWarmachineTerminalHypothesisDomainV1 } from
  "../reverse/terminal-hypothesis-v1.mjs";
import { generateWarmachineTerminalPositionDomainV1 } from
  "../reverse/terminal-position-domain-v1.mjs";
import { materializeWarmachineTerminalSpatialCellsV1 } from
  "../reverse/terminal-spatial-materializer-v1.mjs";
import { warmachineHost } from "../warmachine-host-runtime.mjs";
import { buildWarmachineFixedSteamrollerFixtureV2 } from
  "./fixed-steamroller-fixture-v2.mjs";

export const WARMACHINE_FIXED_TERMINAL_POSITION_CORPUS_V1_SCHEMA =
  "warmachine_fixed_terminal_position_corpus_v1";

function requiredPiece(pieces, predicate, reason) {
  const piece = pieces.find(predicate);
  if (!piece) throw new Error(reason);
  return piece;
}

export function buildWarmachineFixedTerminalPositionCorpusV1(rawOptions = {}) {
  const fixture = buildWarmachineFixedSteamrollerFixtureV2({
    seed: String(rawOptions.seed || "fixed-terminal-position-domain-v1"),
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
      resourcePoints: 1,
      source: "rule_derived_power_up_at_control_phase",
      activationStatus: "not_yet_activated",
    });
  }
  const attackerLeader = requiredPiece(stateTemplate.pieces, (piece) =>
    piece.sideKey === "player1" && (piece.isWarcaster || piece.isWarlock),
  "fixed_terminal_position_attacker_leader_missing");
  const targetLeader = requiredPiece(stateTemplate.pieces, (piece) =>
    piece.sideKey === "player2" && (piece.isWarcaster || piece.isWarlock),
  "fixed_terminal_position_target_leader_missing");
  const actor = requiredPiece(stateTemplate.pieces, (piece) =>
    piece.sideKey === "player1" && /raptor/i.test(`${piece.label || ""} ${piece.name || ""}`),
  "fixed_terminal_position_raptor_missing");
  const attackProfile = (actor.attackProfiles || []).find((profile) =>
    profile.mode === "melee" && Number(profile.rangeIn || 0) > 0);
  if (!attackProfile) throw new Error("fixed_terminal_position_attack_profile_missing");

  const relativeDomain = buildWarmachineTerminalHypothesisDomainV1({
    scenarioKey: "two-fronts",
    scenarioPacketKey: "steamroller-2026",
    scenarioPacketYear: "2026",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    rosterReceiptHash: fixture.fixtureHash,
    specs: [{
      goalType: "assassination",
      roundNumbers: [3],
      winnerSideKeys: ["player1"],
      loserSideKeys: ["player2"],
      endingSideKeys: ["player1"],
      causalActionFamilies: ["strict_melee_chain"],
      actorPieceKeys: [actor.pieceKey],
      targetLeaderPieceKeys: [targetLeader.pieceKey],
      targetBoxesBeforeFinal: [1],
      resourceEnvelopeKeys: ["focus_purchase_envelope"],
      geometryRelationCells: [{
        relationKind: "later_round_position_domain_required",
        actorToTargetRangeBand: "partitioned_by_generator",
        lineOfSightRelation: "strict_terminal_action_required",
        pathRelation: "reverse_history_unproven",
        baseRelation: "legal_nonoverlap",
        exactCoordinatesKnown: false,
        relationChecks: [{
          relationKey: "fixed-raptor-profile-contract",
          relationKind: "attack_profile_range",
          sourcePieceKey: actor.pieceKey,
          targetPieceKey: targetLeader.pieceKey,
          profileKey: attackProfile.profileKey,
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
        resourceEnvelopeKey: "optimistic_proposal",
        geometryRelationCell: "optimistic_proposal",
      },
    }],
  });

  const allTargetAnchors = rawOptions.targetAnchors || [
    ["round-three-west-lower-objective-flank", 18, 21],
    ["round-three-west-upper-objective-flank", 18, 27],
    ["round-three-east-lower-objective-flank", 30, 21],
    ["round-three-east-upper-objective-flank", 30, 30],
  ].map(([anchorKey, xIn, yIn]) => ({
    anchorKey,
    source: "scenario_relative_position_seed",
    targetPosition: { xIn, yIn },
  }));
  const requestedPositionAnchorKeys = new Set(rawOptions.positionAnchorKeys || []);
  const targetAnchors = requestedPositionAnchorKeys.size
    ? allTargetAnchors.filter((anchor) => requestedPositionAnchorKeys.has(anchor.anchorKey))
    : allTargetAnchors;
  const positionDomain = generateWarmachineTerminalPositionDomainV1(
    stateTemplate,
    relativeDomain.cells,
    {
      profileKey: attackProfile.profileKey,
      controllerPieceKeyByActor: { [actor.pieceKey]: attackerLeader.pieceKey },
      targetAnchors,
      actorAnglesDeg: rawOptions.actorAnglesDeg || [180],
      controllerAnglesDeg: rawOptions.controllerAnglesDeg || [90],
      actionRangeBands: rawOptions.actionRangeBands || [{
        bandKey: "melee-engaged",
        minimumFraction: 0.2,
        maximumFraction: 0.6,
        placementFraction: 0.5,
      }],
      controlRangeBands: rawOptions.controlRangeBands || [{
        bandKey: "leader-control-inner",
        minimumFraction: 0.25,
        maximumFraction: 0.6,
        placementFraction: 0.45,
      }],
      remainingPlacementModes: ["coherent_engagement_layers"],
      laterRoundPositionArea: rawOptions.laterRoundPositionArea || {
        minimumXIn: 3,
        maximumXIn: 45,
        minimumYIn: 8,
        maximumYIn: 40,
      },
      maximumProposals: rawOptions.maximumProposals ?? targetAnchors.length,
    },
  );

  const terminalRouteSteps = rawOptions.terminalRouteSteps || [{
    actionType: "melee_attack",
    actorPieceKey: actor.pieceKey,
    targetPieceKey: targetLeader.pieceKey,
    enumerationOptions: {
      actorPieceKeys: [actor.pieceKey],
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
  }, {
    actionType: "resolve_lifecycle_trigger_decline",
  }];
  const materializationAnchorKeys = rawOptions.materializationAnchorKeys || [
    "round-three-west-lower-objective-flank",
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
  const materialized = materializeWarmachineTerminalSpatialCellsV1(
    stateTemplate,
    materializationCells,
    {
      maximumCells: rawOptions.maximumMaterializedCells ?? 1,
      activationEnvelopeBySide: rawOptions.activationEnvelopeBySide || {
        player1: "all_alive_unactivated",
        player2: "all_alive_activated",
      },
      priorTurnSettlementSeed: rawOptions.priorTurnSettlementSeed || {
        endingSideKey: "player2",
        endingTurnNumber: 2,
        scoreBefore: { player1: 0, player2: 0 },
        scoringHistoryBefore: [],
      },
      onStrictReplayProgress: rawOptions.onStrictReplayProgress,
      terminalRouteSteps,
    },
  );

  return {
    schemaVersion: WARMACHINE_FIXED_TERMINAL_POSITION_CORPUS_V1_SCHEMA,
    fixture,
    stateTemplate,
    attackerLeader,
    targetLeader,
    actor,
    attackProfile,
    relativeDomain,
    positionDomain,
    materialized,
    terminalRouteSteps,
    terminalResourceAssumptions,
    materializationAnchorKeys,
  };
}
