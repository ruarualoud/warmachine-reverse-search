import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA } from
  "./terminal-hypothesis-v1.mjs";
import { warmachinePieceInPlayV1 } from "./piece-lifecycle-v1.mjs";

export const WARMACHINE_TERMINAL_POSITION_DOMAIN_V1_SCHEMA =
  "warmachine_terminal_position_domain_v1";

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, precision = 4) {
  const scale = 10 ** precision;
  return Math.round(numeric(value) * scale) / scale;
}

function point(value = {}) {
  return {
    xIn: round(value.xIn ?? value.x),
    yIn: round(value.yIn ?? value.y),
  };
}

function baseRadius(piece = {}) {
  return Math.max(0, numeric(piece.baseRadiusIn,
    numeric(piece.baseSizeIn ?? piece.baseDiameterIn, 1.18) / 2));
}

function alive(piece = {}) {
  return warmachinePieceInPlayV1(piece);
}

function leaderLike(piece = {}) {
  return piece.isWarcaster === true || piece.isWarlock === true ||
    /warcaster|warlock|leader/i.test(`${piece.modelRole || ""} ${piece.modelType || ""}`);
}

function profileFor(piece = {}, profileKey = "") {
  return [
    ...(piece.attackProfiles || []),
    ...(piece.weaponProfiles || []),
    ...(piece.spellProfiles || []),
  ].find((profile) =>
    String(profile.profileKey || profile.weaponKey || profile.spellKey || "") === profileKey) ||
    null;
}

function finitePositiveRangesFromText(textInput = "") {
  const text = String(textInput || "");
  const values = [];
  for (const match of text.matchAll(/(?:within|rng)\s*(\d+(?:\.\d+)?)\s*(?:\"|inches?|inch)?/gi)) {
    const value = numeric(match[1], NaN);
    if (Number.isFinite(value) && value > 0) values.push(round(value));
  }
  return [...new Set(values)].sort((left, right) => left - right);
}

function leaderSpatialInfluenceProfiles(piece = {}) {
  const controlRangeIn = numeric(piece.controlRangeIn ?? piece.controlRange, NaN);
  const rows = [];
  if (Number.isFinite(controlRangeIn) && controlRangeIn > 0) {
    rows.push({
      influenceKey: "leader-control-range",
      sourceKind: "leader_stat",
      sourceName: "CTRL",
      maximumDistanceIn: round(controlRangeIn),
      applicability: "rule_defined_control_range",
    });
  }
  const sources = [
    ...(piece.cardSnapshot?.spells || []).map((entry) => ({
      sourceKind: "spell",
      sourceName: entry.name,
      range: entry.rng,
      text: entry.description,
    })),
    ...(piece.cardSnapshot?.models || []).flatMap((model) =>
      (model.abilities || []).map((entry) => ({
        sourceKind: "ability",
        sourceName: entry.name,
        text: entry.description,
      }))),
    ...(piece.specialRules || []).map((entry) => ({
      sourceKind: entry.ruleSourceKind || "special_rule",
      sourceName: entry.name,
      text: entry.description,
    })),
    ...((piece.featText || piece.featDescription)
      ? [{
          sourceKind: "feat",
          sourceName: piece.featName || "feat",
          text: piece.featText || piece.featDescription,
        }]
      : []),
  ];
  for (const source of sources) {
    const rangeText = String(source.range || "").trim();
    const explicitRanges = finitePositiveRangesFromText(
      `${rangeText ? `RNG ${rangeText}. ` : ""}${source.text || ""}`,
    );
    const usesControlRange = /\bctrl\b|control range/i.test(
      `${rangeText} ${source.text || ""}`,
    );
    for (const maximumDistanceIn of explicitRanges) {
      rows.push({
        influenceKey: `leader-${source.sourceKind}-${stableGraphHash({
          sourceName: source.sourceName,
          maximumDistanceIn,
        }, 16)}`,
        sourceKind: source.sourceKind,
        sourceName: String(source.sourceName || ""),
        maximumDistanceIn,
        applicability: "candidate_partition_only_requires_rule_specific_validation",
      });
    }
    if (usesControlRange && Number.isFinite(controlRangeIn) && controlRangeIn > 0) {
      rows.push({
        influenceKey: `leader-${source.sourceKind}-${stableGraphHash({
          sourceName: source.sourceName,
          controlRangeIn,
        }, 16)}`,
        sourceKind: source.sourceKind,
        sourceName: String(source.sourceName || ""),
        maximumDistanceIn: round(controlRangeIn),
        applicability: "candidate_partition_only_requires_rule_specific_validation",
      });
    }
  }
  const byIdentity = new Map();
  for (const row of rows) {
    const identity = stableGraphHash(row);
    if (!byIdentity.has(identity)) byIdentity.set(identity, stableGraphValue(row));
  }
  return [...byIdentity.values()].sort((left, right) =>
    left.maximumDistanceIn - right.maximumDistanceIn ||
    left.influenceKey.localeCompare(right.influenceKey));
}

function normalizeBands(input, defaults) {
  return (Array.isArray(input) && input.length ? input : defaults).map((band, index) => {
    const minimumFraction = Math.max(0, numeric(band.minimumFraction, 0));
    const maximumFraction = Math.min(1, Math.max(
      minimumFraction,
      numeric(band.maximumFraction, 1),
    ));
    const placementFraction = Math.min(maximumFraction, Math.max(
      minimumFraction,
      numeric(band.placementFraction, (minimumFraction + maximumFraction) / 2),
    ));
    return stableGraphValue({
      bandKey: String(band.bandKey || `band-${index}`),
      minimumFraction,
      maximumFraction,
      placementFraction,
    });
  });
}

function defaultAnchors(state = {}) {
  const width = numeric(state.board?.widthIn, 48);
  const height = numeric(state.board?.heightIn, 48);
  return [0.35, 0.5, 0.65].map((xFraction) => ({
    anchorKey: `middle-lane-${Math.round(xFraction * 100)}`,
    source: "rule_derived_board_partition",
    targetPosition: {
      xIn: round(width * xFraction),
      yIn: round(height * 0.5),
    },
  }));
}

function normalizedAnchors(state, rawOptions) {
  const source = Array.isArray(rawOptions.targetAnchors) && rawOptions.targetAnchors.length
    ? rawOptions.targetAnchors
    : defaultAnchors(state);
  return source.map((anchor, index) => stableGraphValue({
    anchorKey: String(anchor.anchorKey || `terminal-anchor-${index}`),
    source: String(anchor.source || "user_constrained"),
    scenarioElementKey: String(anchor.scenarioElementKey || ""),
    actorAngleDeg: Number.isFinite(Number(anchor.actorAngleDeg))
      ? Number(anchor.actorAngleDeg)
      : null,
    controllerAngleDeg: Number.isFinite(Number(anchor.controllerAngleDeg))
      ? Number(anchor.controllerAngleDeg)
      : null,
    targetPosition: point(anchor.targetPosition || anchor.position),
  }));
}

function withinBoard(state, piece, position) {
  const radius = baseRadius(piece);
  const width = numeric(state.board?.widthIn, 48);
  const height = numeric(state.board?.heightIn, 48);
  return position.xIn - radius >= -0.001 && position.xIn + radius <= width + 0.001 &&
    position.yIn - radius >= -0.001 && position.yIn + radius <= height + 0.001;
}

function overlaps(piece, position, placed, tolerance = 0.001) {
  return placed.some((row) => Math.hypot(
    position.xIn - row.position.xIn,
    position.yIn - row.position.yIn,
  ) + tolerance < baseRadius(piece) + baseRadius(row.piece));
}

function corridorDistance(position, start, end) {
  const dx = end.xIn - start.xIn;
  const dy = end.yIn - start.yIn;
  const denominator = dx * dx + dy * dy;
  const scalar = denominator > 0
    ? Math.max(0, Math.min(1,
      ((position.xIn - start.xIn) * dx + (position.yIn - start.yIn) * dy) /
        denominator))
    : 0;
  return Math.hypot(
    position.xIn - (start.xIn + dx * scalar),
    position.yIn - (start.yIn + dy * scalar),
  );
}

function unitGroupKey(piece = {}) {
  const unitGroupId = String(piece.unitGroupId || piece.metadata?.unitGroupId || "");
  return unitGroupId ? `${piece.sideKey || ""}:${unitGroupId}` : "";
}

function controllerPieceKey(piece = {}) {
  return String(
    piece.battlegroupControllerPieceKey || piece.controllerPieceKey ||
    piece.metadata?.battlegroupControllerPieceKey || piece.metadata?.controllerPieceKey || "",
  );
}

function edgeDistance(leftPiece, leftPosition, rightPiece, rightPosition) {
  return Math.max(0, Math.hypot(
    leftPosition.xIn - rightPosition.xIn,
    leftPosition.yIn - rightPosition.yIn,
  ) - baseRadius(leftPiece) - baseRadius(rightPiece));
}

function scenarioObjectiveRadiusIn(objective = {}) {
  return Math.max(0, numeric(
    objective.baseRadiusIn,
    numeric(objective.baseSizeMm, 0) / 25.4 / 2,
  ));
}

function overlapsScenarioObjective(state, piece, position, tolerance = 0.001) {
  return (state.scenario?.objectives || []).some((objective) => {
    if (objective.active === false) return false;
    const radius = scenarioObjectiveRadiusIn(objective);
    if (radius <= 0) return false;
    const objectivePosition = point(objective.position || objective);
    return Math.hypot(
      position.xIn - objectivePosition.xIn,
      position.yIn - objectivePosition.yIn,
    ) + tolerance < baseRadius(piece) + radius;
  });
}

function staticPlacementCandidateUsable(state, piece, position, cache) {
  const cacheKey = stableGraphHash({
    pieceKey: piece.pieceKey,
    baseRadiusIn: baseRadius(piece),
    position,
    occupyingBuildingKey: piece.occupyingBuildingKey ||
      piece.buildingKey || piece.metadata?.occupyingBuildingKey || "",
  });
  if (cache?.has(cacheKey)) return cache.get(cacheKey);
  const audit = auditRulesV1StaticPlacement({
    ...state,
    stateKey: `${state.stateKey || "terminal-position"}:static-probe:${cacheKey.slice(0, 16)}`,
    pieces: [{ ...piece, position }],
  });
  const usable = audit.ok === true;
  cache?.set(cacheKey, usable);
  return usable;
}

function blocksReservedUnitSightCorridor(piece, position, corridors = []) {
  return corridors.some((corridor) => {
    if (corridor.endpointPieceKeys.includes(piece.pieceKey)) return false;
    return corridorDistance(position, corridor.start, corridor.end) <
      baseRadius(piece) + 0.02;
  });
}

function scenarioPresenceReservationViolation(piece, position, reservations = []) {
  return reservations.find((reservation) => {
    if ((reservation.exceptPieceKeys || []).includes(piece.pieceKey)) return false;
    const reservationPosition = point(reservation.position || reservation);
    const minimumCenterDistanceIn = baseRadius(piece) +
      Math.max(0, numeric(reservation.baseRadiusIn, 0)) +
      Math.max(0, numeric(reservation.presenceRangeIn, 0)) +
      Math.max(0, numeric(reservation.clearanceIn, 0.02));
    return Math.hypot(
      position.xIn - reservationPosition.xIn,
      position.yIn - reservationPosition.yIn,
    ) < minimumCenterDistanceIn;
  }) || null;
}

function placedPieceBlocksMemberToAnchorLos(
  memberPiece,
  memberPosition,
  anchorPiece,
  anchorPosition,
  placed,
) {
  return placed.some((row) => {
    if ([memberPiece.pieceKey, anchorPiece.pieceKey].includes(row.piece.pieceKey)) return false;
    return corridorDistance(row.position, memberPosition, anchorPosition) <
      baseRadius(row.piece) + 0.02;
  });
}

function laterRoundPositionArea(state, rawOptions = {}) {
  const width = numeric(state.board?.widthIn, 48);
  const height = numeric(state.board?.heightIn, 48);
  const marginXIn = Math.max(1.5, numeric(rawOptions.laterRoundMarginXIn, 2));
  const marginYIn = Math.max(1.5, numeric(
    rawOptions.laterRoundMarginYIn,
    Math.min(8, height * 0.18),
  ));
  const requested = rawOptions.laterRoundPositionArea || {};
  return stableGraphValue({
    minimumXIn: Math.max(marginXIn, numeric(requested.minimumXIn, marginXIn)),
    maximumXIn: Math.min(width - marginXIn,
      numeric(requested.maximumXIn, width - marginXIn)),
    minimumYIn: Math.max(marginYIn, numeric(requested.minimumYIn, marginYIn)),
    maximumYIn: Math.min(height - marginYIn,
      numeric(requested.maximumYIn, height - marginYIn)),
  });
}

function withinPositionArea(piece, position, area) {
  const radius = baseRadius(piece);
  return position.xIn - radius >= area.minimumXIn - 0.001 &&
    position.xIn + radius <= area.maximumXIn + 0.001 &&
    position.yIn - radius >= area.minimumYIn - 0.001 &&
    position.yIn + radius <= area.maximumYIn + 0.001;
}

function sideBackEdge(state, sideKey) {
  const explicit = String(state.deploymentBackEdgeBySide?.[sideKey] || "").toLowerCase();
  if (["south", "north", "west", "east"].includes(explicit)) return explicit;
  return sideKey === "player2" ? "north" : "south";
}

function completeBaseDistanceFromOwnEdge(state, piece, position) {
  const width = numeric(state.board?.widthIn, 48);
  const height = numeric(state.board?.heightIn, 48);
  const radius = baseRadius(piece);
  const edgeKey = sideBackEdge(state, piece.sideKey);
  if (edgeKey === "south") return position.yIn - radius;
  if (edgeKey === "north") return height - position.yIn - radius;
  if (edgeKey === "west") return position.xIn - radius;
  if (edgeKey === "east") return width - position.xIn - radius;
  return Number.NEGATIVE_INFINITY;
}

function satisfiesRequiredKillBoxPosition(state, piece, position, rawOptions = {}) {
  const requiredSideKeys = new Set(rawOptions.requiredKillBoxSideKeys || []);
  if (!leaderLike(piece) || !requiredSideKeys.has(piece.sideKey)) return true;
  const distanceIn = Math.max(0, numeric(
    state.scenario?.killBoxDistanceIn ?? state.scenario?.killboxDistanceIn,
    12,
  ));
  return completeBaseDistanceFromOwnEdge(state, piece, position) > distanceIn + 0.001;
}

function sideLayerTarget(state, sideKey, targetPosition, roleKey) {
  const width = numeric(state.board?.widthIn, 48);
  const height = numeric(state.board?.heightIn, 48);
  const backEdge = sideBackEdge(state, sideKey);
  const depthByRole = {
    unit: 3.5,
    cohort: 5.5,
    leader: 8,
    support: 7,
  };
  const depth = depthByRole[roleKey] || depthByRole.support;
  if (backEdge === "south") return { xIn: targetPosition.xIn, yIn: targetPosition.yIn - depth };
  if (backEdge === "north") return { xIn: targetPosition.xIn, yIn: targetPosition.yIn + depth };
  if (backEdge === "west") return { xIn: targetPosition.xIn - depth, yIn: targetPosition.yIn };
  if (backEdge === "east") return { xIn: targetPosition.xIn + depth, yIn: targetPosition.yIn };
  return { xIn: width / 2, yIn: height / 2 };
}

function remainingPositionCandidates(
  state,
  modeKey,
  area,
  piece,
  targetPosition,
  roleKey,
  rawOptions = {},
) {
  const cacheKey = stableGraphHash({
    modeKey,
    area,
    sideKey: piece.sideKey,
    targetPosition,
    roleKey,
  });
  const cache = rawOptions.remainingPositionCandidateCache;
  if (cache?.has(cacheKey)) return cache.get(cacheKey);
  const width = numeric(state.board?.widthIn, 48);
  const height = numeric(state.board?.heightIn, 48);
  const rows = [];
  const spacing = 1.25;
  for (let yIn = area.minimumYIn; yIn <= area.maximumYIn; yIn += spacing) {
    for (let xIn = area.minimumXIn; xIn <= area.maximumXIn; xIn += spacing) {
      rows.push({ xIn: round(xIn), yIn: round(yIn) });
    }
  }
  const center = { xIn: width / 2, yIn: height / 2 };
  const layerTarget = sideLayerTarget(state, piece.sideKey, targetPosition, roleKey);
  const ordered = rows.sort((left, right) => {
    const flankMode = modeKey === "coherent_contest_width" || modeKey === "opposed_flanks";
    const leftFlank = flankMode ? Math.abs(left.xIn - targetPosition.xIn) : 0;
    const rightFlank = flankMode ? Math.abs(right.xIn - targetPosition.xIn) : 0;
    return (flankMode ? rightFlank - leftFlank : 0) ||
      Math.hypot(left.xIn - layerTarget.xIn, left.yIn - layerTarget.yIn) -
        Math.hypot(right.xIn - layerTarget.xIn, right.yIn - layerTarget.yIn) ||
      Math.hypot(left.xIn - center.xIn, left.yIn - center.yIn) -
        Math.hypot(right.xIn - center.xIn, right.yIn - center.yIn) ||
      left.yIn - right.yIn || left.xIn - right.xIn;
  });
  cache?.set(cacheKey, ordered);
  return ordered;
}

function candidateUsable(
  state,
  piece,
  position,
  placed,
  actorPosition,
  targetPosition,
  area,
  rawOptions = {},
) {
  if (!withinBoard(state, piece, position) || !withinPositionArea(piece, position, area)) return false;
  if (!satisfiesRequiredKillBoxPosition(state, piece, position, rawOptions)) return false;
  if (overlaps(piece, position, placed) || overlapsScenarioObjective(state, piece, position)) return false;
  if (scenarioPresenceReservationViolation(
    piece,
    position,
    rawOptions.scenarioPresenceReservations,
  )) return false;
  if (!staticPlacementCandidateUsable(
    state,
    piece,
    position,
    rawOptions.staticPlacementCache,
  )) return false;
  if (blocksReservedUnitSightCorridor(
    piece,
    position,
    rawOptions.unitSightCorridors,
  )) return false;
  if (rawOptions.keepTerminalCorridorClear === false) return true;
  const corridorClearance = Math.max(baseRadius(piece) + 0.2, 1);
  return corridorDistance(position, actorPosition, targetPosition) > corridorClearance;
}

function radialFormationCandidates(anchorPiece, anchorPosition, piece, modeKey, sideAngleDeg) {
  const minimumCenterDistance = baseRadius(anchorPiece) + baseRadius(piece) + 0.04;
  const maximumCenterDistance = baseRadius(anchorPiece) + baseRadius(piece) + 1.85;
  const distances = [minimumCenterDistance];
  for (let distance = minimumCenterDistance + 0.45;
    distance <= maximumCenterDistance + 0.001;
    distance += 0.45) distances.push(distance);
  const angleStep = modeKey === "coherent_contest_width" ? 22.5 : 30;
  const rows = [];
  for (const distance of distances) {
    for (let offset = 0; offset < 360; offset += angleStep) {
      const angleDeg = sideAngleDeg + offset;
      const radians = angleDeg * Math.PI / 180;
      rows.push({
        xIn: round(anchorPosition.xIn + Math.cos(radians) * distance),
        yIn: round(anchorPosition.yIn + Math.sin(radians) * distance),
        angleDeg: round(angleDeg),
        centerDistanceIn: round(distance),
      });
    }
  }
  return rows;
}

function placeUnitGroup(
  state,
  membersInput,
  placedInput,
  actorPosition,
  targetPosition,
  modeKey,
  area,
  rawOptions = {},
) {
  const placed = [...placedInput];
  const alreadyPlaced = membersInput.filter((piece) => placed.some((row) =>
    row.piece.pieceKey === piece.pieceKey));
  const unplaced = membersInput.filter((piece) => !alreadyPlaced.some((member) =>
    member.pieceKey === piece.pieceKey));
  const anchorPiece = [...alreadyPlaced, ...membersInput]
    .sort((left, right) => baseRadius(right) - baseRadius(left) ||
      left.pieceKey.localeCompare(right.pieceKey))[0];
  rawOptions.unitAnchorPieceKeyByGroup[unitGroupKey(anchorPiece)] = anchorPiece.pieceKey;
  const fixedAnchor = placed.find((row) => row.piece.pieceKey === anchorPiece.pieceKey) || null;
  const anchorCandidates = fixedAnchor
    ? [fixedAnchor.position]
    : remainingPositionCandidates(
      state,
      modeKey,
      area,
      anchorPiece,
      targetPosition,
      "unit",
      rawOptions,
    );
  const sideAngleDeg = sideBackEdge(state, anchorPiece.sideKey) === "north" ? 180 : 0;
  for (const anchorPosition of anchorCandidates) {
    const trialPlaced = [...placed];
    if (!fixedAnchor) {
      if (!candidateUsable(
        state,
        anchorPiece,
        anchorPosition,
        trialPlaced,
        actorPosition,
        targetPosition,
        area,
        rawOptions,
      )) continue;
      trialPlaced.push({ piece: anchorPiece, position: anchorPosition });
    }
    const anchorRow = trialPlaced.find((row) => row.piece.pieceKey === anchorPiece.pieceKey);
    if (!anchorRow) continue;
    const fixedPeersValid = alreadyPlaced.every((member) => {
      if (member.pieceKey === anchorPiece.pieceKey) return true;
      const row = trialPlaced.find((entry) => entry.piece.pieceKey === member.pieceKey);
      return row && edgeDistance(anchorPiece, anchorRow.position, member, row.position) <= 2.001;
    });
    if (!fixedPeersValid) continue;
    let failedPieceKey = "";
    const orderedUnplaced = unplaced
      .filter((piece) => piece.pieceKey !== anchorPiece.pieceKey)
      .sort((left, right) => baseRadius(right) - baseRadius(left) ||
        left.pieceKey.localeCompare(right.pieceKey));
    for (const piece of orderedUnplaced) {
      const position = radialFormationCandidates(
        anchorPiece,
        anchorRow.position,
        piece,
        modeKey,
        sideAngleDeg,
      ).find((candidate) => candidateUsable(
        state,
        piece,
        candidate,
        trialPlaced,
        actorPosition,
        targetPosition,
        area,
        rawOptions,
      ) && edgeDistance(anchorPiece, anchorRow.position, piece, candidate) <= 2.001 &&
        !placedPieceBlocksMemberToAnchorLos(
          piece,
          candidate,
          anchorPiece,
          anchorRow.position,
          trialPlaced,
        ));
      if (!position) {
        failedPieceKey = piece.pieceKey;
        break;
      }
      trialPlaced.push({ piece, position: point(position) });
    }
    if (failedPieceKey) continue;
    const rows = membersInput.map((piece) => trialPlaced.find((row) =>
      row.piece.pieceKey === piece.pieceKey)).filter(Boolean);
    if (rows.length !== membersInput.length) continue;
    const maximumEdgeDistanceToAnchorIn = Math.max(0, ...rows.map((row) =>
      edgeDistance(anchorPiece, anchorRow.position, row.piece, row.position)));
    for (const row of rows) {
      if (row.piece.pieceKey === anchorPiece.pieceKey) continue;
      rawOptions.unitSightCorridors.push({
        unitGroupKey: unitGroupKey(anchorPiece),
        endpointPieceKeys: [anchorPiece.pieceKey, row.piece.pieceKey],
        start: anchorRow.position,
        end: row.position,
      });
    }
    return {
      ok: true,
      placed: trialPlaced,
      audit: stableGraphValue({
        unitGroupKey: unitGroupKey(anchorPiece),
        anchorPieceKey: anchorPiece.pieceKey,
        memberPieceKeys: membersInput.map((piece) => piece.pieceKey).sort(),
        memberCount: membersInput.length,
        maximumEdgeDistanceToAnchorIn: round(maximumEdgeDistanceToAnchorIn),
        everyMemberWithinTwoInchesOfAnchor: maximumEdgeDistanceToAnchorIn <= 2.001,
        lineOfSightBetweenMembersProven: false,
        relationStatus: "position_seed_only_history_and_los_unproven",
      }),
    };
  }
  return {
    ok: false,
    reason: "terminal_position_unit_formation_packing_failed",
    pieceKey: anchorPiece?.pieceKey || "",
    unitGroupKey: unitGroupKey(anchorPiece),
  };
}

function pieceRoleForPlacement(piece = {}) {
  if (leaderLike(piece)) return "leader";
  if (controllerPieceKey(piece)) return "cohort";
  return "support";
}

function placeSinglePiece(
  state,
  piece,
  placed,
  actorPosition,
  targetPosition,
  modeKey,
  area,
  rawOptions = {},
) {
  const controllerKey = controllerPieceKey(piece);
  const controllerRow = controllerKey
    ? placed.find((row) => row.piece.pieceKey === controllerKey) || null
    : null;
  const controllerRangeIn = numeric(
    controllerRow?.piece.controlRangeIn ?? controllerRow?.piece.controlRange,
    NaN,
  );
  const candidates = remainingPositionCandidates(
    state,
    modeKey,
    area,
    piece,
    targetPosition,
    pieceRoleForPlacement(piece),
    rawOptions,
  );
  const position = candidates.find((candidate) => {
    if (!candidateUsable(
      state,
      piece,
      candidate,
      placed,
      actorPosition,
      targetPosition,
      area,
      rawOptions,
    )) return false;
    if (!controllerRow || !Number.isFinite(controllerRangeIn) || controllerRangeIn <= 0) return true;
    return edgeDistance(
      controllerRow.piece,
      controllerRow.position,
      piece,
      candidate,
    ) <= controllerRangeIn * 0.9 + 0.001;
  });
  if (!position) return {
    ok: false,
    reason: controllerRow
      ? "terminal_position_control_aware_piece_packing_failed"
      : "terminal_position_remaining_piece_packing_failed",
    pieceKey: piece.pieceKey,
  };
  return {
    ok: true,
    position,
    controlAudit: controllerRow && Number.isFinite(controllerRangeIn) && controllerRangeIn > 0
      ? stableGraphValue({
        pieceKey: piece.pieceKey,
        controllerPieceKey: controllerRow.piece.pieceKey,
        edgeDistanceIn: round(edgeDistance(
          controllerRow.piece,
          controllerRow.position,
          piece,
          position,
        )),
        conservativeControlRangeIn: round(controllerRangeIn),
        insideConservativeControlRange: true,
        extendedControlRangeNotRequired: true,
      })
      : null,
  };
}

function placeRemainingPieces(
  state,
  placedInput,
  actorPosition,
  targetPosition,
  modeKey,
  rawOptions = {},
) {
  const placed = [...placedInput];
  const area = laterRoundPositionArea(state, rawOptions);
  const placementOptions = {
    ...rawOptions,
    staticPlacementCache: new Map(),
    remainingPositionCandidateCache: new Map(),
    unitAnchorPieceKeyByGroup: {},
    unitSightCorridors: [],
  };
  const fixedOutsideArea = placed.find((row) => !withinPositionArea(row.piece, row.position, area));
  if (rawOptions.enforceLaterRoundAreaForKeyPieces !== false && fixedOutsideArea) {
    return {
      ok: false,
      reason: "terminal_position_key_piece_outside_later_round_area",
      pieceKey: fixedOutsideArea.piece.pieceKey,
      laterRoundPositionArea: area,
    };
  }
  const fixedObjectiveOverlap = placed.find((row) =>
    overlapsScenarioObjective(state, row.piece, row.position));
  if (fixedObjectiveOverlap) {
    return {
      ok: false,
      reason: "terminal_position_key_piece_overlaps_scenario_objective",
      pieceKey: fixedObjectiveOverlap.piece.pieceKey,
      laterRoundPositionArea: area,
    };
  }
  const fixedTerrainOverlap = placed.find((row) => !staticPlacementCandidateUsable(
    state,
    row.piece,
    row.position,
    placementOptions.staticPlacementCache,
  ));
  if (fixedTerrainOverlap) {
    return {
      ok: false,
      reason: "terminal_position_key_piece_static_placement_rejected",
      pieceKey: fixedTerrainOverlap.piece.pieceKey,
      laterRoundPositionArea: area,
    };
  }
  const fixedKillBoxViolation = placed.find((row) =>
    !satisfiesRequiredKillBoxPosition(state, row.piece, row.position, rawOptions));
  if (fixedKillBoxViolation) {
    return {
      ok: false,
      reason: "terminal_position_key_leader_inside_killbox",
      pieceKey: fixedKillBoxViolation.piece.pieceKey,
      laterRoundPositionArea: area,
    };
  }
  const fixedPresenceViolation = placed.map((row) => ({
    row,
    reservation: scenarioPresenceReservationViolation(
      row.piece,
      row.position,
      rawOptions.scenarioPresenceReservations,
    ),
  })).find((entry) => entry.reservation);
  if (fixedPresenceViolation) {
    return {
      ok: false,
      reason: "terminal_position_key_piece_violates_scenario_presence_partition",
      pieceKey: fixedPresenceViolation.row.piece.pieceKey,
      scenarioElementKey: fixedPresenceViolation.reservation.elementKey || "",
      laterRoundPositionArea: area,
    };
  }
  const allLive = (state.pieces || []).filter((piece) => alive(piece));
  const groups = new Map();
  for (const piece of allLive) {
    const key = unitGroupKey(piece);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(piece);
  }
  const controlRelationAudit = [];
  if (rawOptions.placeControlGroupsBeforeUnits === true) {
    const groupedPieceKeys = new Set([...groups.values()].flat().map((piece) =>
      piece.pieceKey));
    const controlPriorityPieces = allLive.filter((piece) =>
      !groupedPieceKeys.has(piece.pieceKey) &&
      !placed.some((row) => row.piece.pieceKey === piece.pieceKey) &&
      (leaderLike(piece) || Boolean(controllerPieceKey(piece))))
      .sort((left, right) => Number(leaderLike(right)) - Number(leaderLike(left)) ||
        baseRadius(right) - baseRadius(left) || left.pieceKey.localeCompare(right.pieceKey));
    for (const piece of controlPriorityPieces) {
      const result = placeSinglePiece(
        state,
        piece,
        placed,
        actorPosition,
        targetPosition,
        modeKey,
        area,
        placementOptions,
      );
      if (!result.ok) return { ...result, laterRoundPositionArea: area };
      placed.push({ piece, position: result.position });
      if (result.controlAudit) controlRelationAudit.push(result.controlAudit);
    }
  }
  const unitFormationAudit = [];
  const orderedGroups = [...groups.values()].sort((left, right) => {
    const leftFixed = left.some((piece) => placed.some((row) =>
      row.piece.pieceKey === piece.pieceKey));
    const rightFixed = right.some((piece) => placed.some((row) =>
      row.piece.pieceKey === piece.pieceKey));
    return Number(rightFixed) - Number(leftFixed) || right.length - left.length ||
      unitGroupKey(left[0]).localeCompare(unitGroupKey(right[0]));
  });
  for (const members of orderedGroups) {
    const result = placeUnitGroup(
      state,
      members,
      placed,
      actorPosition,
      targetPosition,
      modeKey,
      area,
      placementOptions,
    );
    if (!result.ok) return { ...result, laterRoundPositionArea: area };
    placed.splice(0, placed.length, ...result.placed);
    unitFormationAudit.push(result.audit);
  }
  const remaining = allLive.filter((piece) => !placed.some((row) =>
    row.piece.pieceKey === piece.pieceKey)).sort((left, right) =>
    Number(leaderLike(right)) - Number(leaderLike(left)) ||
    Number(Boolean(controllerPieceKey(right))) - Number(Boolean(controllerPieceKey(left))) ||
    baseRadius(right) - baseRadius(left) || left.pieceKey.localeCompare(right.pieceKey));
  for (const piece of remaining) {
    const result = placeSinglePiece(
      state,
      piece,
      placed,
      actorPosition,
      targetPosition,
      modeKey,
      area,
      placementOptions,
    );
    if (!result.ok) return { ...result, laterRoundPositionArea: area };
    placed.push({ piece, position: result.position });
    if (result.controlAudit) controlRelationAudit.push(result.controlAudit);
  }
  const positions = Object.fromEntries(placed.map((row) => [row.piece.pieceKey, row.position]));
  const generatedState = {
    ...state,
    stateKey: `${state.stateKey || "terminal-position"}:formation-audit`,
    pieces: state.pieces.map((piece) => positions[piece.pieceKey]
      ? { ...piece, position: positions[piece.pieceKey] }
      : piece),
  };
  const anchorPieceKeyByUnitGroupKey = Object.fromEntries(unitFormationAudit.map((audit) => [
    audit.unitGroupKey,
    audit.anchorPieceKey,
  ]));
  const unitFormationRulesAudit = auditRulesV1StaticUnitFormation(generatedState, {
    anchorPieceKeyByUnitGroupKey,
  });
  if (!unitFormationRulesAudit.ok) {
    return {
      ok: false,
      reason: "terminal_position_unit_formation_rules_audit_rejected",
      pieceKey: unitFormationRulesAudit.issues[0]?.pieceKey || "",
      unitGroupKey: unitFormationRulesAudit.issues[0]
        ? `${unitFormationRulesAudit.issues[0].sideKey}:${unitFormationRulesAudit.issues[0].unitGroupId}`
        : "",
      unitFormationRulesAudit,
      laterRoundPositionArea: area,
    };
  }
  return {
    ok: true,
    positions: stableGraphValue(positions),
    placementEvidence: stableGraphValue({
      laterRoundPositionArea: area,
      everyLivePieceAssigned: Object.keys(positions).length === allLive.length,
      unitFormationAudit,
      unitFormationRulesAudit,
      controlRelationAudit,
      controlGroupsPlacedBeforeUnits: rawOptions.placeControlGroupsBeforeUnits === true,
      requiredKillBoxSideKeys: rawOptions.requiredKillBoxSideKeys || [],
      scenarioObjectivesAvoided: true,
      terminalCorridorReserved: rawOptions.keepTerminalCorridorClear !== false,
      deploymentCoordinatesRead: false,
      strictHistoryReachabilityProven: false,
    }),
  };
}

function assassinationContext(state, cell, rawOptions) {
  const actor = (state.pieces || []).find((piece) =>
    piece.pieceKey === cell.actorPieceKey) || null;
  const target = (state.pieces || []).find((piece) =>
    piece.pieceKey === cell.targetLeaderPieceKey) || null;
  if (!actor || !target) return { ok: false, reason: "terminal_position_actor_or_target_missing" };
  const profileKey = String(rawOptions.profileKeyByCellKey?.[cell.cellKey] ||
    rawOptions.profileKey || cell.geometryRelationCell?.relationChecks?.find((check) =>
      check.relationKind === "attack_profile_range")?.profileKey || "");
  const profile = profileFor(actor, profileKey);
  const actionRangeIn = numeric(profile?.rangeIn ?? profile?.range, NaN);
  if (!profile || !Number.isFinite(actionRangeIn) || actionRangeIn <= 0) {
    return { ok: false, reason: "terminal_position_attack_profile_range_missing", profileKey };
  }
  const requestedControllerKey = String(
    rawOptions.controllerPieceKeyByActor?.[actor.pieceKey] || actor.controllerPieceKey || "",
  );
  const controller = (state.pieces || []).find((piece) =>
    piece.pieceKey === requestedControllerKey) ||
    (state.pieces || []).find((piece) => piece.sideKey === actor.sideKey && leaderLike(piece)) ||
    null;
  if (!controller) return { ok: false, reason: "terminal_position_controller_missing" };
  const controlRangeIn = numeric(controller.controlRangeIn ?? controller.controlRange, NaN);
  if (!Number.isFinite(controlRangeIn) || controlRangeIn <= 0) {
    return { ok: false, reason: "terminal_position_controller_range_missing" };
  }
  return {
    ok: true,
    actor,
    target,
    profile,
    profileKey,
    actionRangeIn,
    controller,
    controlRangeIn,
    leaderSpatialInfluenceProfiles: leaderSpatialInfluenceProfiles(controller),
  };
}

function scoreContext(state, cell, rawOptions) {
  const objective = (state.scenario?.objectives || []).find((entry) =>
    String(entry.objectiveKey || entry.elementKey || "") === cell.scoringElementKey) || null;
  if (!objective || objective.active === false) {
    return { ok: false, reason: "terminal_position_scoring_objective_missing" };
  }
  const requestedScorerKey = String(
    rawOptions.scoringPieceKeyByCellKey?.[cell.cellKey] ||
    rawOptions.scoringPieceKeyByElementKey?.[cell.scoringElementKey] ||
    rawOptions.scoringPieceKey || "",
  );
  const scorer = (state.pieces || []).find((piece) =>
    piece.pieceKey === requestedScorerKey && piece.sideKey === cell.winnerSideKey) || null;
  if (!scorer) return { ok: false, reason: "terminal_position_scoring_piece_missing" };
  const requestedControllerKey = String(
    rawOptions.controllerPieceKeyByActor?.[scorer.pieceKey] ||
    controllerPieceKey(scorer) || "",
  );
  const controller = (state.pieces || []).find((piece) =>
    piece.pieceKey === requestedControllerKey) ||
    (state.pieces || []).find((piece) =>
      piece.sideKey === scorer.sideKey && leaderLike(piece)) || null;
  if (!controller) return { ok: false, reason: "terminal_position_controller_missing" };
  const controlRangeIn = numeric(controller.controlRangeIn ?? controller.controlRange, NaN);
  if (!Number.isFinite(controlRangeIn) || controlRangeIn <= 0) {
    return { ok: false, reason: "terminal_position_controller_range_missing" };
  }
  const scoringRangeIn = numeric(objective.contestingRangeIn, NaN);
  if (!Number.isFinite(scoringRangeIn) || scoringRangeIn <= 0) {
    return { ok: false, reason: "terminal_position_scoring_range_missing" };
  }
  const objectivePiece = {
    pieceKey: `scenario-objective:${cell.scoringElementKey}`,
    baseRadiusIn: scenarioObjectiveRadiusIn(objective),
  };
  const objectivePosition = point(objective.position || objective);
  const scenarioPresenceReservations = [
    ...(state.scenario?.objectives || []).filter((entry) => entry.active !== false)
      .map((entry) => ({
        elementKey: String(entry.objectiveKey || entry.elementKey || ""),
        elementType: "objective",
        position: point(entry.position || entry),
        baseRadiusIn: scenarioObjectiveRadiusIn(entry),
        presenceRangeIn: numeric(entry.contestingRangeIn, 3),
        exceptPieceKeys: String(entry.objectiveKey || entry.elementKey || "") ===
          cell.scoringElementKey ? [scorer.pieceKey] : [],
      })),
    ...(rawOptions.additionalScenarioPresenceReservations || []),
  ];
  return {
    ok: true,
    actor: scorer,
    scorer,
    target: objectivePiece,
    objective,
    objectivePosition,
    actionRangeIn: scoringRangeIn,
    scoringRangeIn,
    controller,
    controlRangeIn,
    scenarioPresenceReservations,
    leaderSpatialInfluenceProfiles: leaderSpatialInfluenceProfiles(controller),
  };
}

function positionAtEdgeDistance(sourcePiece, targetPiece, targetPosition, edgeDistanceIn, angleDeg) {
  const centerDistance = baseRadius(sourcePiece) + baseRadius(targetPiece) + edgeDistanceIn;
  const radians = numeric(angleDeg) * Math.PI / 180;
  return {
    xIn: round(targetPosition.xIn + Math.cos(radians) * centerDistance),
    yIn: round(targetPosition.yIn + Math.sin(radians) * centerDistance),
  };
}

function proposalCell(baseCell, context, proposal) {
  const actionMinimumDistanceIn = context.actionRangeIn * proposal.actionBand.minimumFraction;
  const actionMaximumDistanceIn = context.actionRangeIn * proposal.actionBand.maximumFraction;
  const controlMinimumDistanceIn = context.controlRangeIn * proposal.controlBand.minimumFraction;
  const controlMaximumDistanceIn = context.controlRangeIn * proposal.controlBand.maximumFraction;
  const geometryRelationCell = stableGraphValue({
    temporalPositionKind: "later_round_pre_terminal_root",
    deploymentEndpointRole: "downstream_multi_turn_acceptance_only",
    relationKind: "generated_later_round_terminal_position",
    actorToTargetRangeBand: proposal.actionBand.bandKey,
    lineOfSightRelation: "strict_terminal_action_required",
    pathRelation: "reverse_history_unproven",
    baseRelation: "legal_nonoverlap",
    scenarioRelation: proposal.anchor.anchorKey,
    exactCoordinatesKnown: true,
    exactCoordinates: { piecePositions: proposal.positions },
    relationChecks: [{
      relationKey: `generated-action-range:${proposal.actionBand.bandKey}`,
      relationKind: "attack_profile_range",
      sourcePieceKey: context.actor.pieceKey,
      targetPieceKey: context.target.pieceKey,
      profileKey: context.profileKey,
      minimumDistanceIn: round(actionMinimumDistanceIn),
      maximumDistanceIn: round(actionMaximumDistanceIn),
    }, {
      relationKey: `generated-leader-control:${proposal.controlBand.bandKey}`,
      relationKind: "leader_control_range",
      sourcePieceKey: context.controller.pieceKey,
      targetPieceKey: context.actor.pieceKey,
      profileKey: "",
      minimumDistanceIn: round(controlMinimumDistanceIn),
      maximumDistanceIn: round(controlMaximumDistanceIn),
    }],
    materializationRequired: false,
    generationEvidence: stableGraphValue({
      anchor: proposal.anchor,
      actionBand: proposal.actionBand,
      controlBand: proposal.controlBand,
      actorAngleDeg: proposal.actorAngleDeg,
      controllerAngleDeg: proposal.controllerAngleDeg,
      remainingPlacementMode: proposal.remainingPlacementMode,
      remainingPlacementEvidence: proposal.placementEvidence,
      leaderSpatialInfluenceProfiles: context.leaderSpatialInfluenceProfiles,
      sourceStatePositionsRead: false,
    }),
  });
  const identity = stableGraphValue({
    ...baseCell,
    geometryRelationCell,
    assumptionSources: {
      ...(baseCell.assumptionSources || {}),
      geometryRelationCell: "optimistic_proposal",
    },
    parentTerminalCellKey: baseCell.cellKey,
    strictCertified: false,
    reachabilityProven: false,
    trainingTruth: false,
  });
  delete identity.cellKey;
  return {
    ...identity,
    schemaVersion: WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA,
    cellKey: `terminal-position-cell-${stableGraphHash(identity, 32)}`,
  };
}

function scoreProposalCell(baseCell, context, proposal) {
  const scoringMinimumDistanceIn = context.scoringRangeIn *
    proposal.actionBand.minimumFraction;
  const scoringMaximumDistanceIn = context.scoringRangeIn *
    proposal.actionBand.maximumFraction;
  const controlMinimumDistanceIn = context.controlRangeIn *
    proposal.controlBand.minimumFraction;
  const controlMaximumDistanceIn = context.controlRangeIn *
    proposal.controlBand.maximumFraction;
  const geometryRelationCell = stableGraphValue({
    temporalPositionKind: "later_round_pre_terminal_root",
    deploymentEndpointRole: "downstream_multi_turn_acceptance_only",
    relationKind: "generated_later_round_scenario_score_position",
    actorToTargetRangeBand: proposal.actionBand.bandKey,
    lineOfSightRelation: "not_required_for_turn_end_scoring",
    pathRelation: "reverse_history_unproven",
    baseRelation: "legal_nonoverlap",
    scenarioRelation: `winner_controls_${baseCell.scoringElementKey}_opponent_does_not_contest`,
    exactCoordinatesKnown: true,
    exactCoordinates: { piecePositions: proposal.positions },
    relationChecks: [{
      relationKey: `generated-score-presence:${proposal.actionBand.bandKey}`,
      relationKind: "scenario_objective_control_range",
      sourcePieceKey: context.scorer.pieceKey,
      targetPieceKey: baseCell.scoringElementKey,
      profileKey: "",
      minimumDistanceIn: round(scoringMinimumDistanceIn),
      maximumDistanceIn: round(scoringMaximumDistanceIn),
    }, {
      relationKey: `generated-leader-control:${proposal.controlBand.bandKey}`,
      relationKind: "leader_control_range",
      sourcePieceKey: context.controller.pieceKey,
      targetPieceKey: context.scorer.pieceKey,
      profileKey: "",
      minimumDistanceIn: round(controlMinimumDistanceIn),
      maximumDistanceIn: round(controlMaximumDistanceIn),
    }],
    materializationRequired: false,
    generationEvidence: stableGraphValue({
      anchor: proposal.anchor,
      scoringElementKey: baseCell.scoringElementKey,
      scoringPieceKey: context.scorer.pieceKey,
      scoringBand: proposal.actionBand,
      controlBand: proposal.controlBand,
      scorerAngleDeg: proposal.actorAngleDeg,
      controllerAngleDeg: proposal.controllerAngleDeg,
      remainingPlacementMode: proposal.remainingPlacementMode,
      remainingPlacementEvidence: proposal.placementEvidence,
      scenarioPresenceReservations: context.scenarioPresenceReservations,
      leaderSpatialInfluenceProfiles: context.leaderSpatialInfluenceProfiles,
      sourceStatePositionsRead: false,
    }),
  });
  const identity = stableGraphValue({
    ...baseCell,
    scoringPieceKey: context.scorer.pieceKey,
    geometryRelationCell,
    assumptionSources: {
      ...(baseCell.assumptionSources || {}),
      scoringPieceKey: "optimistic_proposal",
      geometryRelationCell: "optimistic_proposal",
    },
    parentTerminalCellKey: baseCell.cellKey,
    strictCertified: false,
    reachabilityProven: false,
    trainingTruth: false,
  });
  delete identity.cellKey;
  return {
    ...identity,
    schemaVersion: WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA,
    cellKey: `terminal-position-cell-${stableGraphHash(identity, 32)}`,
  };
}

export function generateWarmachineTerminalPositionDomainV1(
  stateTemplateInput = {},
  terminalCellsInput = [],
  rawOptions = {},
) {
  const state = normalizeRulesV1State(stateTemplateInput);
  const cells = (Array.isArray(terminalCellsInput)
    ? terminalCellsInput
    : [terminalCellsInput]).filter(Boolean);
  const anchors = normalizedAnchors(state, rawOptions);
  const actionBands = normalizeBands(rawOptions.actionRangeBands, [{
    bandKey: "action-range-inner",
    minimumFraction: 0.2,
    maximumFraction: 0.6,
    placementFraction: 0.5,
  }, {
    bandKey: "action-range-boundary",
    minimumFraction: 0.9,
    maximumFraction: 1,
    placementFraction: 0.96,
  }]);
  const controlBands = normalizeBands(rawOptions.controlRangeBands, [{
    bandKey: "control-inner",
    minimumFraction: 0,
    maximumFraction: 0.6,
    placementFraction: 0.45,
  }, {
    bandKey: "control-boundary",
    minimumFraction: 0.9,
    maximumFraction: 1,
    placementFraction: 0.96,
  }]);
  const actorAnglesDeg = (rawOptions.actorAnglesDeg || [0, 90, 180, 270]).map(Number);
  const controllerAnglesDeg = (rawOptions.controllerAnglesDeg || [180]).map(Number);
  const remainingPlacementModes = rawOptions.remainingPlacementModes || ["clear_terminal_corridor"];
  const maximumProposals = Math.max(1, Math.floor(numeric(rawOptions.maximumProposals, 256)));
  const proposals = [];
  const rejected = [];
  const deferred = [];
  let consideredCount = 0;
  const leaderSpatialInfluenceProfilesByParentCell = {};
  for (const cell of cells) {
    if (cell.schemaVersion !== WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA) {
      rejected.push({ cellKey: String(cell.cellKey || ""), reason: "terminal_position_cell_schema_invalid" });
      continue;
    }
    if (!["assassination", "scenario_score"].includes(cell.goalType)) {
      rejected.push({ cellKey: cell.cellKey, reason: "terminal_position_goal_type_not_yet_supported" });
      continue;
    }
    const context = cell.goalType === "assassination"
      ? assassinationContext(state, cell, rawOptions)
      : scoreContext(state, cell, rawOptions);
    if (!context.ok) {
      rejected.push({ cellKey: cell.cellKey, reason: context.reason, profileKey: context.profileKey || "" });
      continue;
    }
    leaderSpatialInfluenceProfilesByParentCell[cell.cellKey] =
      context.leaderSpatialInfluenceProfiles;
    const explicitScoreAnchors = anchors.filter((anchor) =>
      anchor.scenarioElementKey === cell.scoringElementKey);
    const cellAnchors = cell.goalType === "scenario_score"
      ? explicitScoreAnchors.length ? explicitScoreAnchors : [{
          anchorKey: `scenario-objective-${cell.scoringElementKey}`,
          source: "rule_derived_scenario_element_anchor",
          scenarioElementKey: cell.scoringElementKey,
          targetPosition: context.objectivePosition,
        }]
      : anchors;
    for (const anchor of cellAnchors) {
      for (const actionBand of actionBands) {
        for (const controlBand of controlBands) {
          const anchorActorAnglesDeg = Number.isFinite(anchor.actorAngleDeg)
            ? [anchor.actorAngleDeg]
            : actorAnglesDeg;
          const anchorControllerAnglesDeg = Number.isFinite(anchor.controllerAngleDeg)
            ? [anchor.controllerAngleDeg]
            : controllerAnglesDeg;
          for (const actorAngleDeg of anchorActorAnglesDeg) {
            for (const controllerAngleDeg of anchorControllerAnglesDeg) {
              for (const remainingPlacementMode of remainingPlacementModes) {
                consideredCount += 1;
                const dispositionKey = stableGraphHash({
                  parentCellKey: cell.cellKey,
                  anchor,
                  actionBand,
                  controlBand,
                  actorAngleDeg,
                  controllerAngleDeg,
                  remainingPlacementMode,
                }, 24);
                if (proposals.length >= maximumProposals) {
                  deferred.push({
                    parentCellKey: cell.cellKey,
                    dispositionKey,
                    reason: "terminal_position_proposal_budget_exhausted",
                  });
                  continue;
                }
                const targetPosition = cell.goalType === "scenario_score"
                  ? context.objectivePosition
                  : anchor.targetPosition;
                const actorPosition = positionAtEdgeDistance(
                  context.actor,
                  context.target,
                  targetPosition,
                  context.actionRangeIn * actionBand.placementFraction,
                  actorAngleDeg,
                );
                const controllerPosition = context.controller.pieceKey === context.actor.pieceKey
                  ? actorPosition
                  : positionAtEdgeDistance(
                    context.controller,
                    context.actor,
                    actorPosition,
                    context.controlRangeIn * controlBand.placementFraction,
                    controllerAngleDeg,
                  );
                const placed = [
                  ...(cell.goalType === "assassination"
                    ? [{ piece: context.target, position: targetPosition }]
                    : []),
                  { piece: context.actor, position: actorPosition },
                  ...(context.controller.pieceKey === context.actor.pieceKey
                    ? []
                    : [{ piece: context.controller, position: controllerPosition }]),
                ];
                const invalidPiece = placed.find((row) =>
                  !withinBoard(state, row.piece, row.position));
                if (invalidPiece || placed.some((row, index) =>
                  overlaps(row.piece, row.position, placed.slice(0, index)))) {
                  rejected.push({
                    parentCellKey: cell.cellKey,
                    dispositionKey,
                    reason: invalidPiece
                      ? "terminal_position_key_piece_outside_table"
                      : "terminal_position_key_piece_overlap",
                    pieceKey: invalidPiece?.piece.pieceKey || "",
                  });
                  continue;
                }
                const packed = placeRemainingPieces(
                  state,
                  placed,
                  actorPosition,
                  targetPosition,
                  remainingPlacementMode,
                  cell.goalType === "scenario_score" ? {
                    ...rawOptions,
                    keepTerminalCorridorClear: false,
                    requiredKillBoxSideKeys: [cell.endingSideKey],
                    scenarioPresenceReservations: context.scenarioPresenceReservations,
                  } : rawOptions,
                );
                if (!packed.ok) {
                  rejected.push({
                    parentCellKey: cell.cellKey,
                    dispositionKey,
                    anchorKey: anchor.anchorKey,
                    reason: packed.reason,
                    pieceKey: packed.pieceKey,
                    unitGroupKey: packed.unitGroupKey || "",
                    unitFormationRulesAudit: packed.unitFormationRulesAudit || null,
                  });
                  continue;
                }
                const proposal = {
                  anchor,
                  actionBand,
                  controlBand,
                  actorAngleDeg,
                  controllerAngleDeg,
                  remainingPlacementMode,
                  positions: packed.positions,
                  placementEvidence: packed.placementEvidence,
                };
                proposals.push(cell.goalType === "scenario_score"
                  ? scoreProposalCell(cell, context, proposal)
                  : proposalCell(cell, context, proposal));
              }
            }
          }
        }
      }
    }
  }
  proposals.sort((left, right) => left.cellKey.localeCompare(right.cellKey));
  rejected.sort((left, right) => stableGraphHash(left).localeCompare(stableGraphHash(right)));
  deferred.sort((left, right) => left.dispositionKey.localeCompare(right.dispositionKey));
  const core = {
    schemaVersion: WARMACHINE_TERMINAL_POSITION_DOMAIN_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    parentCellCount: cells.length,
    consideredCount,
    proposedCount: proposals.length,
    rejectedCount: rejected.length,
    deferredCount: deferred.length,
    coverageDenominatorComplete: deferred.length === 0,
    generationDomain: stableGraphValue({
      temporalPositionKind: "later_round_pre_terminal_root",
      deploymentEndpointRole: "downstream_multi_turn_acceptance_only",
      anchors,
      actionBands,
      controlBands,
      actorAnglesDeg,
      controllerAnglesDeg,
      remainingPlacementModes,
      laterRoundPositionArea: laterRoundPositionArea(state, rawOptions),
      leaderSpatialInfluenceProfilesByParentCell,
      maximumProposals,
    }),
    proposals: stableGraphValue(proposals),
    rejected: stableGraphValue(rejected),
    deferred: stableGraphValue(deferred),
    oracleIsolationAudit: {
      sourceStatePositionsRead: false,
      openingRead: false,
      forwardRouteRead: false,
      intermediateStateRead: false,
      passed: true,
    },
    trainingTruth: false,
    claimBoundary: "This finite domain proposes explicit later-round terminal coordinates from board anchors and rule-range partitions. It never treats deployment coordinates as terminal geometry, and it does not prove LOS, terrain legality, terminal execution or reachability. Every proposal must be strict-materialized and then reverse-searched independently; rejected and budget-deferred cells remain coverage debt.",
  };
  return {
    ...core,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: proposals.length > 0,
  };
}
