import { warmachineSteamroller2026OfficialScenarioLayoutV1 } from
  "../contracts/steamroller-2026-official-scenario-layout-v1.mjs";
import {
  bindWarmachineScenarioTerrainSetupChoicesV1,
  enumerateWarmachineBenchmarkActionsV2,
  executeScopedWarmachineBenchmarkActionV2,
  executeWarmachineBenchmarkControlPhaseV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { buildWarmachineFixedSteamrollerFixtureV2 } from
  "../benchmark/fixed-steamroller-fixture-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";

export const WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_SCENARIO_KEYS_V1 =
  Object.freeze([
    "trench_warfare",
    "two_fronts",
    "wolves_at_our_heels",
    "pressure_point",
    "high_stakes",
    "fault_line",
    "payload",
  ]);

export const WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_ROSTER_RECEIPT_V1 =
  "score-terminal-anchor-two-leader-micro-roster-domain-v1";

const SEPSIRA_CARD_ID = "c0053f2b-1ee9-493a-80c7-05d7156ae019";
const NYMARA_CARD_ID = "7eef3759-c676-4e67-bcec-f2d671362f52";

let cachedLeaderSource;

function realAnchorLeaderSource() {
  if (cachedLeaderSource) return structuredClone(cachedLeaderSource);
  const fixture = buildWarmachineFixedSteamrollerFixtureV2({
    seed: "score-terminal-anchor-real-leaders-v1",
  });
  const byCardId = new Map((fixture.stateTemplate.pieces || []).map((piece) => [
    String(piece.cardId || piece.cardSnapshot?.id || ""),
    piece,
  ]));
  const player1Leader = byCardId.get(SEPSIRA_CARD_ID);
  const player2Leader = byCardId.get(NYMARA_CARD_ID);
  const solos = (fixture.stateTemplate.pieces || [])
    .filter((piece) => String(piece.modelRole || "").toLowerCase() === "solo")
    .sort((left, right) => left.pieceKey.localeCompare(right.pieceKey));
  const player1Solo = solos.find((piece) => piece.sideKey === "player1");
  const player2Solo = solos.find((piece) => piece.sideKey === "player2");
  if (!player1Leader || !player2Leader || !player1Solo || !player2Solo) {
    throw new Error("score_terminal_anchor_real_leader_source_missing");
  }
  cachedLeaderSource = stableGraphValue({
    sourceFixtureHash: fixture.fixtureHash,
    sourceOpeningStateHash: fixture.opening.stateHash,
    sourceRemoteVersion: String(fixture.source?.remoteVersion || ""),
    sourceRosters: fixture.rosters,
    player1Leader: scoreTerminalLeaderProjection(player1Leader),
    player2Leader: scoreTerminalLeaderProjection(player2Leader),
    player1Solo: scoreTerminalLeaderProjection(player1Solo),
    player2Solo: scoreTerminalLeaderProjection(player2Solo),
  });
  return structuredClone(cachedLeaderSource);
}

function scoreTerminalLeaderProjection(sourcePiece = {}) {
  const sourceCard = sourcePiece.cardSnapshot || {};
  const sourceModel = (sourceCard.models || []).find((model) =>
    String(model.id || "") === String(sourcePiece.modelId || "")) || {};
  const fullSourcePieceHash = stableGraphHash(sourcePiece);
  const fullCardSnapshotHash = stableGraphHash(sourceCard);
  return stableGraphValue({
    pieceKey: sourcePiece.pieceKey,
    label: sourcePiece.label,
    cardId: sourcePiece.cardId,
    cardName: sourcePiece.cardName || sourceCard.name,
    modelId: sourcePiece.modelId,
    modelName: sourcePiece.modelName || sourceModel.name || sourcePiece.label,
    sideKey: sourcePiece.sideKey,
    factionId: sourcePiece.factionId,
    factionKey: sourcePiece.factionKey,
    factionName: sourcePiece.factionName,
    armyFaction: sourcePiece.armyFaction,
    modelRole: sourcePiece.modelRole,
    modelType: sourcePiece.modelType,
    cardType: sourcePiece.cardType,
    cardTypeName: sourcePiece.cardTypeName,
    traits: sourcePiece.traits || [],
    keywords: sourcePiece.keywords || [],
    isWarcaster: sourcePiece.isWarcaster === true,
    isWarlock: sourcePiece.isWarlock === true,
    isWarrior: sourcePiece.isWarrior === true,
    isWarcasterExplicitIdentity: sourcePiece.isWarcasterExplicitIdentity === true,
    isWarlockExplicitIdentity: sourcePiece.isWarlockExplicitIdentity === true,
    position: sourcePiece.position,
    baseSizeIn: sourcePiece.baseSizeIn,
    facingDeg: sourcePiece.facingDeg,
    hasFacing: sourcePiece.hasFacing,
    speedIn: sourcePiece.speedIn,
    defense: sourcePiece.defense,
    armor: sourcePiece.armor,
    baseArmor: sourcePiece.baseArmor,
    mat: sourcePiece.mat,
    rat: sourcePiece.rat,
    aat: sourcePiece.aat,
    arc: sourcePiece.arc,
    controlRangeIn: sourcePiece.controlRangeIn,
    resourceKind: sourcePiece.resourceKind,
    resourcePoints: sourcePiece.resourcePoints,
    resourceMax: sourcePiece.resourceMax,
    focus: sourcePiece.focus,
    fury: sourcePiece.fury,
    damage: sourcePiece.damage,
    statusTags: sourcePiece.statusTags || [],
    attackProfiles: [],
    specialRules: [],
    upkeepsPaidThisControlPhase: [],
    activated: true,
    portraitPath: sourcePiece.portraitPath || sourceCard.portraitPath || "",
    cardSnapshot: {
      id: sourceCard.id,
      name: sourceCard.name,
      portraitPath: sourceCard.portraitPath || "",
      cardTypeName: sourceCard.cardTypeName,
      factionId: sourceCard.factionId,
      factionName: sourceCard.factionName,
      armyIds: sourceCard.armyIds || [],
      models: [{
        id: sourceModel.id,
        name: sourceModel.name,
        baseSize: sourceModel.baseSize,
        stats: sourceModel.stats || {},
        advantages: sourceModel.advantages || [],
        abilities: [],
        weapons: [],
      }],
      cardAbilities: [],
      spells: [],
    },
    metadata: {
      scoreTerminalExecutionProjection:
        "identity_stats_health_resource_and_turn_end_only_v1",
      fullSourcePieceHash,
      fullCardSnapshotHash,
      omittedActionFamilies: ["attack", "feat", "spell", "special_action"],
      upkeepsPaidThisControlPhase: [],
    },
  });
}

function bindRealAnchorLeader(sourcePiece = {}, {
  pieceKey = "",
  sideKey = "",
  position = {},
} = {}) {
  return stableGraphValue({
    ...structuredClone(sourcePiece),
    pieceKey,
    sideKey,
    currentControllerSideKey: sideKey,
    position,
    activated: true,
    activationKey: "",
    upkeepsPaidThisControlPhase: [],
    metadata: {
      ...(sourcePiece.metadata || {}),
      upkeepsPaidThisControlPhase: [],
      scoreTerminalAnchorSource: "strict_legal_100_point_fixed_roster_v2",
    },
  });
}

const SCORE_TARGET_BY_SCENARIO = Object.freeze({
  trench_warfare: "p1-40",
  two_fronts: "left-50",
  wolves_at_our_heels: "p1-40",
  pressure_point: "center-50",
  high_stakes: "center-50",
  fault_line: "p1-40-a",
  payload: "p1-payload",
});

function representativeScoringPosition(layout = {}, scenarioKey = "", baseSizeIn = 1.18) {
  const targetKey = SCORE_TARGET_BY_SCENARIO[scenarioKey];
  const target = (layout.objectives || []).find((entry) => entry.objectiveKey === targetKey);
  if (!target) throw new Error(`score_terminal_anchor_target_missing:${scenarioKey}:${targetKey}`);
  const targetRadiusIn = Number(target.baseSizeMm || 0) / 25.4 / 2;
  const leaderRadiusIn = Number(baseSizeIn) / 2;
  return {
    xIn: Number((Number(target.xIn) - targetRadiusIn - leaderRadiusIn - 0.1).toFixed(6)),
    yIn: Number(target.yIn),
  };
}

function representativeScenarioTerrainScoringPosition(
  layout = {},
  terrainKey = "",
  baseSizeIn = 1.18,
) {
  const terrain = (layout.terrain || []).find((entry) => entry.terrainKey === terrainKey);
  if (!terrain) throw new Error(`score_terminal_anchor_terrain_missing:${terrainKey}`);
  const terrainRadiusIn = Number(terrain.radiusIn || 0);
  const modelRadiusIn = Number(baseSizeIn) / 2;
  return {
    xIn: Number((Number(terrain.xIn) - terrainRadiusIn - modelRadiusIn - 0.1).toFixed(6)),
    yIn: Number(terrain.yIn),
  };
}

function objectiveRelationPosition(objective = {}, baseSizeIn = 1.18, side = "west") {
  const objectiveRadiusIn = Number(objective.baseSizeMm || 0) / 25.4 / 2;
  const modelRadiusIn = Number(baseSizeIn) / 2;
  const offset = objectiveRadiusIn + modelRadiusIn + 0.1;
  return {
    xIn: Number((Number(objective.xIn) + (side === "east" ? offset : -offset)).toFixed(6)),
    yIn: Number(objective.yIn),
  };
}

function scenarioFixture(scenarioKey = "", scorerBaseSizeIn = 1.18) {
  const layout = warmachineSteamroller2026OfficialScenarioLayoutV1(scenarioKey);
  if (!layout) throw new Error(`unknown_score_terminal_anchor_scenario:${scenarioKey}`);
  const fixture = {
    scenarioName: layout.scenarioName,
    scoringPosition: representativeScoringPosition(layout, scenarioKey, scorerBaseSizeIn),
    objectives: layout.objectives,
    terrain: layout.terrain,
    caches: layout.caches,
    partitions: {
      scenarioTerrainSetup: layout.terrain.length
        ? "all_flags_fallback_no_valid_terrain"
        : "not_applicable",
    },
  };
  if (scenarioKey === "trench_warfare") {
    fixture.partitions.trenchCacheLifecycle = "both_caches_active";
  }
  if (scenarioKey === "wolves_at_our_heels") {
    for (const objective of fixture.objectives) {
      if (objective.objectiveKey === "p1-40") objective.progressTokens = 2;
      if (objective.objectiveKey === "p2-40") objective.progressTokens = 0;
    }
    fixture.actionPatch = {
      steamroller2026Decision: {
        wolves: { addTokenByObjectiveKey: { "p1-40": false } },
      },
    };
    fixture.partitions = {
      ...fixture.partitions,
      wolvesProgressState: "at_least_one_objective_at_two",
      wolvesTokenDecision: "eligible_add_token_declined",
      wolvesObjectiveMove: "move_not_triggered",
    };
  }
  if (scenarioKey === "high_stakes") {
    for (const objective of fixture.objectives) {
      if (objective.baseSizeMm === 50) objective.countdownTokens = 5;
    }
    for (const terrain of fixture.terrain) terrain.countdownTokens = 5;
    fixture.actionPatch = {
      steamroller2026Decision: {
        highStakes: { fuseRoll: 1, fuseTargetKey: "red-fuse" },
      },
    };
    fixture.partitions = {
      ...fixture.partitions,
      highStakesCountdownState: "one_nonzero_element_reduced",
      highStakesFuseResolution: "secured_50mm_remove_one",
      highStakesBlastClosure: "no_detonation",
    };
  }
  if (scenarioKey === "payload") {
    fixture.actionPatch = {
      steamroller2026Decision: {
        payload: { moveByObjectiveKey: { "p1-payload": { decline: true } } },
      },
    };
    fixture.partitions = {
      ...fixture.partitions,
      payloadLifecycle: "both_payloads_active",
      payloadMoveDecision: "eligible_move_declined",
      madeToHaulDecision: "not_triggered",
    };
  }
  return fixture;
}

function executeHistoryAction(state, actionType, actorPieceKey, actionPatch, routeKey) {
  const predecessorStateSemanticHash = warmachineReverseStateSemanticHashV1(state);
  const actionPatchValue = stableGraphValue(actionPatch || {});
  const scoped = enumerateWarmachineBenchmarkActionsV2(state, {
    includeActorlessActions: true,
  });
  const action = (scoped.enumeration.actions || []).find((candidate) =>
    candidate.actionType === actionType &&
    (!actorPieceKey || candidate.actorPieceKey === actorPieceKey));
  if (!action) {
    const rejected = (scoped.enumeration.rejectedActions || [])
      .filter((candidate) => candidate.actionType === actionType &&
        (!actorPieceKey || candidate.actorPieceKey === actorPieceKey))
      .map((candidate) => ({
        actionKey: candidate.actionKey,
        reason: candidate.rejection?.reason || "",
        evidence: candidate.rejection?.evidence || null,
      }));
    throw new Error(
      `score_terminal_anchor_history_action_missing:${actionType}:${actorPieceKey}:${JSON.stringify(rejected)}`,
    );
  }
  const executed = executeScopedWarmachineBenchmarkActionV2(
    scoped,
    action,
    { actionKey: action.actionKey },
    { routeKey, actionPatch: actionPatchValue },
  );
  if (!executed.ok) throw new Error(
    `score_terminal_anchor_history_action_rejected:${actionType}:${executed.reason}`,
  );
  return {
    state: executed.normalizedState || executed.state,
    receipts: [executed.receipt],
    events: executed.transition?.events || [],
    stepEvidence: {
      actionType,
      actorPieceKey: actorPieceKey || "",
      endingSideKey: String(state.activeSideKey || ""),
      endingTurnNumber: Number(state.turnNumber || 0),
      predecessorStateSemanticHash,
      successorStateSemanticHash: warmachineReverseStateSemanticHashV1(
        executed.normalizedState || executed.state,
      ),
      sourceReceiptHash: executed.receipt?.receiptHash || "",
      actionPatch: actionPatchValue,
      events: stableGraphValue(executed.transition?.events || []),
    },
  };
}

function executeHistoryControl(state, routeKey) {
  const executed = executeWarmachineBenchmarkControlPhaseV2(state, { routeKey });
  if (!executed.ok) throw new Error(
    `score_terminal_anchor_history_control_rejected:${JSON.stringify(executed.failures)}`,
  );
  return { state: executed.state, receipts: executed.receipts, events: [] };
}

function buildStrictScoringHistory(initialState, scenarioKey, actionPatch) {
  const startState = structuredClone(initialState);
  startState.scenario.score = { player1: 0, player2: 0 };
  startState.scenario.scoringHistory = [];
  let state = startState;
  const receipts = [];
  const events = [];
  const turnEndSettlementWitnesses = [];
  const apply = (result) => {
    state = result.state;
    receipts.push(...result.receipts);
    events.push(...result.events);
    if (result.stepEvidence?.actionType === "end_turn") {
      const scenarioMutationEvents = (result.stepEvidence.events || []).filter((event) => [
        "high_stakes_countdown_removed",
        "high_stakes_magical_blast_damage",
        "high_stakes_element_detonated",
        "wolves_objective_progressed",
        "wolves_third_token_goal_checked",
        "payload_objective_moved",
      ].includes(event.eventType));
      turnEndSettlementWitnesses.push(stableGraphValue({
        witnessKind: "strict_historical_turn_end_settlement_v1",
        endingSideKey: result.stepEvidence.endingSideKey,
        endingTurnNumber: result.stepEvidence.endingTurnNumber,
        predecessorStateSemanticHash: result.stepEvidence.predecessorStateSemanticHash,
        successorStateSemanticHash: result.stepEvidence.successorStateSemanticHash,
        sourceReceiptHash: result.stepEvidence.sourceReceiptHash,
        actionPatch: result.stepEvidence.actionPatch,
        scenarioMutationEvents,
        exactWithinMaterializedRoot: true,
      }));
    }
  };
  const passEveryActiveSidePiece = (roundLabel) => {
    const pieceKeys = (state.pieces || [])
      .filter((piece) => piece.sideKey === state.activeSideKey && piece.activated !== true)
      .map((piece) => piece.pieceKey)
      .sort();
    for (const pieceKey of pieceKeys) {
      apply(executeHistoryAction(
        state,
        "pass",
        pieceKey,
        {},
        `score-terminal-anchor-history:${scenarioKey}:${roundLabel}-pass:${pieceKey}`,
      ));
    }
  };
  apply(executeHistoryAction(
    state,
    "end_turn",
    "",
    actionPatch,
    `score-terminal-anchor-history:${scenarioKey}:player2-round2-end`,
  ));
  apply(executeHistoryControl(
    state,
    `score-terminal-anchor-history:${scenarioKey}:player1-round3-control`,
  ));
  passEveryActiveSidePiece("player1-round3");
  apply(executeHistoryAction(
    state,
    "end_turn",
    "",
    actionPatch,
    `score-terminal-anchor-history:${scenarioKey}:player1-round3-end`,
  ));
  apply(executeHistoryControl(
    state,
    `score-terminal-anchor-history:${scenarioKey}:player2-round3-control`,
  ));
  passEveryActiveSidePiece("player2-round3");
  const terminalEvents = events.filter((event) => event.eventType === "terminal");
  if (state.turnNumber !== 3 || state.activeSideKey !== "player2" ||
      state.phaseKey !== "activation" || terminalEvents.length > 0 ||
      state.scenario?.scoringHistory?.length !== 2) {
    throw new Error(`score_terminal_anchor_history_contract_failed:${scenarioKey}`);
  }
  state.stateKey = `score-terminal-anchor-predecessor:${scenarioKey}`;
  const evidenceCore = {
    historyKind: "strict_round2_defender_through_round3_defender_activation_v1",
    scenarioKey,
    startingRoundNumber: 2,
    endingRoundNumber: 3,
    startingScore: stableGraphValue(startState.scenario.score),
    endingScore: stableGraphValue(state.scenario.score),
    scoringHistory: stableGraphValue(state.scenario.scoringHistory),
    startingStateSemanticHash: warmachineReverseStateSemanticHashV1(startState),
    predecessorStateSemanticHash: warmachineReverseStateSemanticHashV1(state),
    strictTransitionCount: receipts.length,
    strictReceiptHashes: receipts.map((receipt) => receipt.receiptHash),
    actionTypes: receipts.map((receipt) => receipt.actionType),
    turnEndSettlementWitnesses,
    prefixTerminalEventCount: terminalEvents.length,
    strictCertified: true,
  };
  return {
    predecessorState: state,
    evidence: stableGraphValue({
      ...evidenceCore,
      historyEvidenceHash: stableGraphHash(evidenceCore),
    }),
  };
}

export function buildWarmachineSteamrollerScoreTerminalAnchorProposalV1(
  scenarioKey = "",
  rawOptions = {},
) {
  const leaderSource = realAnchorLeaderSource();
  const fixture = scenarioFixture(
    scenarioKey,
    Number(leaderSource.player1Leader.baseSizeIn || 1.18),
  );
  const scenarioControlMode = String(rawOptions.scenarioControlMode || "");
  if (scenarioControlMode && scenarioKey !== "pressure_point") {
    throw new Error(`unsupported_score_terminal_scenario_control_mode:${scenarioKey}`);
  }
  const relationObjective = fixture.objectives.find((objective) =>
    objective.objectiveKey === "center-50");
  if (scenarioControlMode) {
    fixture.scoringPosition = representativeScenarioTerrainScoringPosition(
      warmachineSteamroller2026OfficialScenarioLayoutV1(scenarioKey),
      "pressure-a",
      Number(leaderSource.player1Leader.baseSizeIn || 1.18),
    );
  }
  const pieces = [
    bindRealAnchorLeader(leaderSource.player1Leader, {
      pieceKey: `${scenarioKey}:player1-leader`,
      sideKey: "player1",
      position: fixture.scoringPosition,
    }),
    bindRealAnchorLeader(leaderSource.player2Leader, {
      pieceKey: `${scenarioKey}:player2-leader`,
      sideKey: "player2",
      position: { xIn: 44, yIn: 24 },
    }),
  ];
  let scenarioControlWitness = null;
  if (scenarioControlMode === "contested") {
    pieces.push(
      bindRealAnchorLeader(leaderSource.player1Solo, {
        pieceKey: `${scenarioKey}:player1-contesting-solo`,
        sideKey: "player1",
        position: objectiveRelationPosition(
          relationObjective,
          leaderSource.player1Solo.baseSizeIn,
          "west",
        ),
      }),
      bindRealAnchorLeader(leaderSource.player2Solo, {
        pieceKey: `${scenarioKey}:player2-contesting-solo`,
        sideKey: "player2",
        position: objectiveRelationPosition(
          relationObjective,
          leaderSource.player2Solo.baseSizeIn,
          "east",
        ),
      }),
    );
    scenarioControlWitness = {
      elementKey: "center-50",
      sideKey: "player1",
      opponentPieceKey: `${scenarioKey}:player2-contesting-solo`,
    };
    fixture.partitions.scenarioControl = "contested";
  } else if (scenarioControlMode === "controller_ineligible") {
    const buildingCenter = {
      xIn: Number(relationObjective.xIn),
      yIn: Number((Number(relationObjective.yIn) - 4.5).toFixed(6)),
    };
    const buildingPiece = bindRealAnchorLeader(leaderSource.player2Solo, {
      pieceKey: `${scenarioKey}:player2-building-solo`,
      sideKey: "player2",
      position: buildingCenter,
    });
    buildingPiece.occupyingBuildingKey = "pressure-point-control-witness-building";
    buildingPiece.buildingFloor = "1";
    pieces.push(buildingPiece);
    fixture.ordinaryTerrain = [{
      terrainKey: "pressure-point-control-witness-building",
      type: "building",
      isBuilding: true,
      xIn: buildingCenter.xIn,
      yIn: buildingCenter.yIn,
      widthIn: 4,
      heightIn: 4,
      terrainSpecificBehavior: "standard_building",
      exactWithinScope: true,
      geometryExactWithinScope: true,
      geometryIssues: [],
    }];
    scenarioControlWitness = {
      elementKey: "center-50",
      sideKey: "player2",
      pieceKey: buildingPiece.pieceKey,
      reason: "standard_building_excluded",
    };
    fixture.partitions.scenarioControl = "controller_ineligible";
  } else if (scenarioControlMode) {
    throw new Error(`unknown_score_terminal_scenario_control_mode:${scenarioControlMode}`);
  }
  let authoredPredecessorState = {
    stateKey: `score-terminal-anchor-history-start:${scenarioKey}`,
    strictMode: true,
    enforceStrictExecutor: true,
    activeSideKey: "player2",
    phaseKey: "activation",
    turnNumber: 2,
    board: { widthIn: 48, heightIn: 48 },
    pieces,
    terrain: [...fixture.terrain, ...(fixture.ordinaryTerrain || [])],
    deploymentBackEdgeBySide: { player1: "south", player2: "north" },
    scenario: {
      packetKey: "steamroller-2026",
      packetYear: "2026",
      scenarioName: fixture.scenarioName,
      scenarioKey,
      steamrollerExactProfile: true,
      attackerSideKey: "player1",
      defenderSideKey: "player2",
      scoringStartSideKey: "player2",
      scoringStartTurnNumber: 2,
      scenarioVictoryLead: 3,
      score: { player1: 0, player2: 0 },
      scoringHistory: [],
      objectives: fixture.objectives,
      caches: fixture.caches || [],
      scenarioState: {},
    },
  };
  if (Array.isArray(rawOptions.ordinaryTerrain)) {
    authoredPredecessorState.terrain = [
      ...authoredPredecessorState.terrain,
      ...structuredClone(rawOptions.ordinaryTerrain),
    ];
  }
  let scenarioTerrainSetupAudit = null;
  if (Array.isArray(rawOptions.scenarioTerrainChoices) &&
      rawOptions.scenarioTerrainChoices.length) {
    const bound = bindWarmachineScenarioTerrainSetupChoicesV1(
      authoredPredecessorState,
      rawOptions.scenarioTerrainChoices,
    );
    authoredPredecessorState = bound.state;
    scenarioTerrainSetupAudit = bound.audit;
    fixture.partitions.scenarioTerrainSetup = bound.audit.setupClassKey;
  }
  const history = buildStrictScoringHistory(
    authoredPredecessorState,
    scenarioKey,
    fixture.actionPatch || {},
  );
  return {
    proposalKey: String(rawOptions.proposalKey || `score-terminal-anchor:${scenarioKey}`),
    rosterReceiptHash: WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_ROSTER_RECEIPT_V1,
    pieceIdentitySource: {
      sourceKind: "strict_legal_100_point_fixed_roster_v2",
      sourceFixtureHash: leaderSource.sourceFixtureHash,
      sourceOpeningStateHash: leaderSource.sourceOpeningStateHash,
      sourceRemoteVersion: leaderSource.sourceRemoteVersion,
      sourceRosters: leaderSource.sourceRosters,
      cardIds: pieces.map((piece) => piece.cardId),
      executionProjectionKind:
        "identity_stats_health_resource_and_turn_end_only_v1",
      fullSourcePieceHashes: pieces.map((piece) =>
        piece.metadata?.fullSourcePieceHash || ""),
      fullCardSnapshotHashes: pieces.map((piece) =>
        piece.metadata?.fullCardSnapshotHash || ""),
    },
    hostScenarioKey: scenarioKey,
    winnerSideKey: "player1",
    rosterDomainComplete: true,
    completeRosterPieceKeys: pieces.map((row) => row.pieceKey),
    predecessorState: history.predecessorState,
    scenarioTerrainSetupAudit,
    predecessorHistoryRequired: true,
    predecessorHistoryEvidence: history.evidence,
    actionPatch: fixture.actionPatch || {},
    scenarioControlWitness,
    partitionCoordinates: {
      lifecycle: "both_rosters_complete",
      damage: "critical_models_undamaged",
      resource: "maximum_native_resource",
      leaderControl: "outside_or_not_required",
      baseTopology: "legal_separated",
      scenarioControl: "winner_secures_uncontested",
      ...fixture.partitions,
    },
  };
}

export function buildWarmachineSteamrollerScoreTerminalAnchorProposalsV1() {
  return WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_SCENARIO_KEYS_V1.map(
    buildWarmachineSteamrollerScoreTerminalAnchorProposalV1,
  );
}
