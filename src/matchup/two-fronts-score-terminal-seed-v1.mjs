import { warmachineSteamroller2026OfficialScenarioLayoutV1 } from
  "../contracts/steamroller-2026-official-scenario-layout-v1.mjs";
import { warmachinePieceInPlayV1 } from "../reverse/piece-lifecycle-v1.mjs";
import {
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
} from "../warmachine-host-runtime.mjs";

export function setWarmachineNativeResourcesForTerminalSeedV1(
  state = {},
  resourceMode = "zero_available",
) {
  for (const piece of state.pieces || []) {
    const maximum = resourceMode === "maximum_native_resource"
      ? Number(piece.resourceMax ?? piece.focusMax ?? piece.furyMax ?? 0)
      : 0;
    if ("resourcePoints" in piece) piece.resourcePoints = maximum;
    if ("focusPoints" in piece) piece.focusPoints = maximum;
    if ("furyPoints" in piece) piece.furyPoints = maximum;
    if ("focus" in piece) piece.focus = maximum;
    if ("fury" in piece) piece.fury = maximum;
    if ("resource2" in piece) {
      piece.resource2 = resourceMode === "maximum_native_resource"
        ? Number(piece.resource2Max || maximum)
        : 0;
    }
  }
}

export function prepareWarmachineScoreTerminalSeedStateV1(sourceState = {}, raw = {}) {
  const state = structuredClone(sourceState);
  state.turnNumber = Number(raw.roundNumber || 3);
  state.activeSideKey = String(raw.endingSideKey || "player2");
  state.phaseKey = "activation";
  state.activePieceKey = "";
  state.activeActivationPieceKey = "";
  state.scenario.score = structuredClone(raw.scoreBefore || { player1: 1, player2: 0 });
  state.scenario.scoringHistory = structuredClone(raw.scoringHistoryBefore || []);
  for (const piece of state.pieces || []) {
    piece.activated = true;
    if (Number(piece.damage?.maxBoxes) > 0) {
      piece.damage.boxesRemaining = Number(piece.damage.maxBoxes);
    }
  }
  setWarmachineNativeResourcesForTerminalSeedV1(
    state,
    raw.resourceMode || "zero_available",
  );
  return state;
}

export function applyWarmachineFallbackScenarioTerrainSeedV1(
  state = {},
  scenarioKey = "two_fronts",
) {
  state.terrain = (state.terrain || []).filter((terrain) =>
    !terrain.isScenarioTerrain && !terrain.scenarioTerrain && !terrain.scenarioElement);
  const terrain = warmachineSteamroller2026OfficialScenarioLayoutV1(scenarioKey)
    .terrain?.[0];
  if (!terrain) throw new Error(`score_terminal_seed_scenario_terrain_missing:${scenarioKey}`);
  state.terrain.push(structuredClone(terrain));
}

export function buildWarmachineTwoFrontsLeadThreePredecessorSeedV1(
  sourceState = {},
  raw = {},
) {
  const winnerSideKey = String(raw.winnerSideKey || "player1");
  const state = prepareWarmachineScoreTerminalSeedStateV1(sourceState, raw);
  applyWarmachineFallbackScenarioTerrainSeedV1(state, "two_fronts");
  const objectiveKey = String(raw.contestedObjectiveKey || "left-50");
  const objective = state.scenario?.objectives?.find((row) =>
    row.objectiveKey === objectiveKey);
  if (!objective) throw new Error(`score_terminal_seed_objective_missing:${objectiveKey}`);
  const scoringPiece = (state.pieces || []).find((piece) =>
    piece.sideKey === winnerSideKey && warmachinePieceInPlayV1(piece) &&
    !piece.unitGroupId && !piece.unitId &&
    piece.isWarcaster !== true && piece.isWarlock !== true);
  if (!scoringPiece) throw new Error("score_terminal_seed_winner_solo_missing");
  const pieceRadius = Number(scoringPiece.baseDiameterIn ||
    scoringPiece.baseSizeIn || 1.6) / 2;
  const centerDistance = Number(objective.baseRadiusIn) + pieceRadius + 0.1;
  const originalPosition = structuredClone(scoringPiece.position);
  let placed = false;
  for (let index = 0; index < 24; index += 1) {
    const angle = index * Math.PI / 12;
    scoringPiece.position = {
      xIn: Number(objective.xIn) + Math.cos(angle) * centerDistance,
      yIn: Number(objective.yIn) + Math.sin(angle) * centerDistance,
    };
    if (auditRulesV1StaticPlacement(state).ok) {
      placed = true;
      break;
    }
  }
  if (!placed) {
    scoringPiece.position = originalPosition;
    throw new Error("score_terminal_seed_legal_contest_placement_missing");
  }
  return {
    state,
    proposedContest: {
      objectiveKey,
      pieceKey: scoringPiece.pieceKey,
      winnerSideKey,
      placement: structuredClone(scoringPiece.position),
      rulesAuthority: false,
      strictPlacementAuditPassed: true,
    },
  };
}

function pieceRadiusIn(piece = {}) {
  return Number(piece.baseDiameterIn || piece.baseSizeIn || 1.2) / 2;
}

function directObjectiveCandidates(state = {}, sideKey = "") {
  return (state.pieces || []).filter((piece) => {
    const text = `${piece.modelRole || ""} ${piece.modelType || ""} ${
      piece.cardType || ""}`;
    return piece.sideKey === sideKey && warmachinePieceInPlayV1(piece) &&
      !piece.unitGroupId && !piece.unitId && (
        piece.isWarcaster === true || piece.isWarlock === true ||
        piece.isWarbeast === true || piece.isWarjack === true ||
        piece.isBattleEngine === true ||
        /warbeast|warjack|battle[\s_-]*engine|cohort/i.test(text)
      );
  });
}

function unitGroupCandidates(state = {}, sideKey = "") {
  const groups = new Map();
  for (const piece of state.pieces || []) {
    if (piece.sideKey !== sideKey || !warmachinePieceInPlayV1(piece) ||
        !piece.unitGroupId) continue;
    const members = groups.get(piece.unitGroupId) || [];
    members.push(piece);
    groups.set(piece.unitGroupId, members);
  }
  return [...groups.entries()]
    .map(([unitGroupId, members]) => ({
      unitGroupId,
      members: members.sort((left, right) =>
        left.pieceKey.localeCompare(right.pieceKey)),
    }))
    .sort((left, right) => left.unitGroupId.localeCompare(right.unitGroupId));
}

function placePieceNearScenarioElement(state = {}, piece = {}, element = {}, seed = 0) {
  const elementRadius = Number(element.baseRadiusIn ||
    element.baseDiameterIn / 2 || element.baseSizeIn / 2 ||
    Number(element.baseSizeMm || 0) / 50.8);
  const centerDistance = elementRadius + pieceRadiusIn(piece) + 0.1;
  const originalPosition = structuredClone(piece.position);
  for (let index = 0; index < 48; index += 1) {
    const angle = (seed + index) * Math.PI / 24;
    piece.position = {
      xIn: Number(element.xIn) + Math.cos(angle) * centerDistance,
      yIn: Number(element.yIn) + Math.sin(angle) * centerDistance,
    };
    if (auditRulesV1StaticPlacement(state).ok) return true;
  }
  piece.position = originalPosition;
  return false;
}

function placeUnitNearScenarioElement(state = {}, members = [], element = {}, seed = 0) {
  if (!members.length) return false;
  const originalPositions = members.map((piece) => structuredClone(piece.position));
  const elementRadius = Number(element.baseRadiusIn ||
    element.baseDiameterIn / 2 || element.baseSizeIn / 2 ||
    Number(element.baseSizeMm || 0) / 50.8);
  const maximumPieceRadius = Math.max(...members.map(pieceRadiusIn));
  const ringRadius = elementRadius + maximumPieceRadius + 0.15;
  for (let rotation = 0; rotation < 48; rotation += 1) {
    const offset = (seed + rotation) * Math.PI / 24;
    for (let index = 0; index < members.length; index += 1) {
      const angle = offset + index * Math.PI * 2 / members.length;
      members[index].position = {
        xIn: Number(element.xIn) + Math.cos(angle) * ringRadius,
        yIn: Number(element.yIn) + Math.sin(angle) * ringRadius,
      };
    }
    if (auditRulesV1StaticPlacement(state).ok &&
        auditRulesV1StaticUnitFormation(state).ok) return true;
  }
  members.forEach((piece, index) => {
    piece.position = originalPositions[index];
  });
  return false;
}

function deploymentBackEdge(state = {}, sideKey = "") {
  return String(state.deploymentBackEdgeBySide?.[sideKey] ||
    state.scenario?.deploymentBackEdgeBySide?.[sideKey] ||
    (state.deploymentZones || []).find((zone) =>
      zone.sideKey === sideKey)?.backEdge ||
    (state.scenario?.deploymentZones || []).find((zone) =>
      zone.sideKey === sideKey)?.backEdge || "").toLowerCase();
}

function moveLeaderOutsideKillBox(state = {}, sideKey = "") {
  const leader = (state.pieces || []).find((piece) =>
    piece.sideKey === sideKey && warmachinePieceInPlayV1(piece) &&
    (piece.isWarcaster === true || piece.isWarlock === true));
  if (!leader) throw new Error(`score_terminal_seed_leader_missing:${sideKey}`);
  const backEdge = deploymentBackEdge(state, sideKey);
  if (!backEdge) throw new Error(`score_terminal_seed_back_edge_missing:${sideKey}`);
  const width = Number(state.board?.widthIn || 48);
  const height = Number(state.board?.heightIn || 48);
  const originalPosition = structuredClone(leader.position);
  const laneCandidates = [0.5, 0.4, 0.6, 0.3, 0.7].map((ratio) => width * ratio);
  const depthCandidates = backEdge === "north"
    ? [height - 16, height - 18, height - 20]
    : backEdge === "south"
      ? [16, 18, 20]
      : backEdge === "east"
        ? [width - 16, width - 18, width - 20]
        : [16, 18, 20];
  for (const depth of depthCandidates) {
    for (const lane of laneCandidates) {
      leader.position = ["north", "south"].includes(backEdge)
        ? { xIn: lane, yIn: depth }
        : { xIn: depth, yIn: lane };
      if (auditRulesV1StaticPlacement(state).ok) return leader;
    }
  }
  leader.position = originalPosition;
  throw new Error(`score_terminal_seed_killbox_exit_missing:${sideKey}`);
}

function requiredObjectiveAssignments(state = {}, sideKey = "", sourceCounts = {}) {
  const assignments = [];
  for (const baseSizeMm of [40, 50]) {
    const count = Number(sourceCounts[`objective_${baseSizeMm}`] || 0);
    const objectives = (state.scenario?.objectives || []).filter((objective) =>
      Number(objective.baseSizeMm || 0) === baseSizeMm && objective.active !== false);
    if (count > objectives.length) {
      throw new Error(`score_terminal_seed_objective_capacity_exceeded:${
        sideKey}:${baseSizeMm}:${count}:${objectives.length}`);
    }
    assignments.push(...objectives.slice(0, count).map((objective) => ({
      sideKey,
      objective,
    })));
  }
  return assignments;
}

function unsupportedScoreSourceKeys(sourceCounts = {}) {
  const supported = new Set([
    "objective_40",
    "objective_50",
    "both_40mm_bonus",
    "both_50mm_bonus",
    "kill_box_penalty",
  ]);
  return Object.entries(sourceCounts)
    .filter(([key, count]) => Number(count || 0) > 0 && !supported.has(key))
    .map(([key]) => key);
}

export function buildWarmachineTwoFrontsScoreTransitionPredecessorSeedV1(
  sourceState = {},
  raw = {},
) {
  const transition = raw.scoreTransition || {};
  const gain = transition.scoringGainClass || {};
  const winnerSideKey = String(raw.winnerSideKey || "player1");
  const endingSideKey = String(raw.endingSideKey || "player2");
  const opponentSideKey = endingSideKey;
  const winnerCounts = gain.representativeWinnerCounts || {};
  const opponentCounts = gain.representativeOpponentCounts || {};
  const unsupported = [
    ...unsupportedScoreSourceKeys(winnerCounts),
    ...unsupportedScoreSourceKeys(opponentCounts),
  ];
  if (unsupported.length) {
    throw new Error(`score_terminal_seed_unsupported_source:${[
      ...new Set(unsupported),
    ].sort().join(",")}`);
  }
  const state = prepareWarmachineScoreTerminalSeedStateV1(sourceState, raw);
  applyWarmachineFallbackScenarioTerrainSeedV1(state, "two_fronts");
  if (Number(winnerCounts.kill_box_penalty || 0) === 0) {
    moveLeaderOutsideKillBox(state, endingSideKey);
  }
  if (Number(opponentCounts.kill_box_penalty || 0) > 0) {
    throw new Error("score_terminal_seed_opponent_killbox_source_invalid");
  }
  const winnerAssignments = requiredObjectiveAssignments(
    state,
    winnerSideKey,
    winnerCounts,
  );
  const opponentAssignments = requiredObjectiveAssignments(
    state,
    opponentSideKey,
    opponentCounts,
  );
  const winnerKeys = new Set(winnerAssignments.map((row) => row.objective.objectiveKey));
  if (opponentAssignments.some((row) => winnerKeys.has(row.objective.objectiveKey))) {
    throw new Error("score_terminal_seed_objective_assignment_conflict");
  }
  const assignments = [...winnerAssignments, ...opponentAssignments];
  const directPiecesBySide = new Map([
    [winnerSideKey, directObjectiveCandidates(state, winnerSideKey)],
    [opponentSideKey, directObjectiveCandidates(state, opponentSideKey)],
  ]);
  const unitGroupsBySide = new Map([
    [winnerSideKey, unitGroupCandidates(state, winnerSideKey)],
    [opponentSideKey, unitGroupCandidates(state, opponentSideKey)],
  ]);
  const placements = [];
  for (let index = 0; index < assignments.length; index += 1) {
    const assignment = assignments[index];
    if (Number(assignment.objective.baseSizeMm) === 40) {
      const group = (unitGroupsBySide.get(assignment.sideKey) || []).shift();
      if (!group) {
        throw new Error(`score_terminal_seed_scoring_unit_missing:${assignment.sideKey}`);
      }
      if (!placeUnitNearScenarioElement(
        state,
        group.members,
        assignment.objective,
        index * 7,
      )) {
        throw new Error(`score_terminal_seed_legal_unit_placement_missing:${
          assignment.objective.objectiveKey}:${group.unitGroupId}`);
      }
      placements.push({
        sideKey: assignment.sideKey,
        objectiveKey: assignment.objective.objectiveKey,
        unitGroupId: group.unitGroupId,
        pieceKeys: group.members.map((piece) => piece.pieceKey),
        placements: group.members.map((piece) => structuredClone(piece.position)),
      });
      continue;
    }
    const piece = (directPiecesBySide.get(assignment.sideKey) || []).shift();
    if (!piece) {
      throw new Error(`score_terminal_seed_direct_scorer_missing:${assignment.sideKey}`);
    }
    if (!placePieceNearScenarioElement(state, piece, assignment.objective, index * 7)) {
      throw new Error(`score_terminal_seed_legal_objective_placement_missing:${
        assignment.objective.objectiveKey}:${piece.pieceKey}`);
    }
    placements.push({
      sideKey: assignment.sideKey,
      objectiveKey: assignment.objective.objectiveKey,
      pieceKey: piece.pieceKey,
      placement: structuredClone(piece.position),
    });
  }
  return {
    state,
    proposedContest: {
      scoreTransitionKey: String(transition.scoreTransitionKey || ""),
      winnerSideKey,
      endingSideKey,
      winnerSourceCounts: structuredClone(winnerCounts),
      opponentSourceCounts: structuredClone(opponentCounts),
      placements,
      rulesAuthority: false,
      strictPlacementAuditPassed: auditRulesV1StaticPlacement(state).ok &&
        auditRulesV1StaticUnitFormation(state).ok,
    },
  };
}
