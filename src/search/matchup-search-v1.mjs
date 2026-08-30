import { createHash } from "node:crypto";

import {
  applyRulesV1Action,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
} from "../warmachine-host-runtime.mjs";
import {
  buildWarmachineRulesV1ActionWithStrictRngOutcome,
  strictOpponentReactionRequirementsForAction,
} from "../warmachine-host-runtime.mjs";

export const WARMACHINE_MATCHUP_SEARCH_SCHEMA = "warmachine_matchup_search_v1";
export const WARMACHINE_MATCHUP_EVALUATION_SCHEMA = "warmachine_matchup_state_evaluation_v1";

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round((numeric(value, 0) + Number.EPSILON) * scale) / scale;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function traceDetailMode(value) {
  return String(value || "full") === "compact" ? "compact" : "full";
}

function optionFlag(value) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function setBoundedMapEntry(map, key, value, limit, stats = {}) {
  if (!limit || limit <= 0) return;
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > limit) {
    const oldestKey = map.keys().next().value;
    map.delete(oldestKey);
    stats.enumerationCacheEvictions = numeric(stats.enumerationCacheEvictions, 0) + 1;
  }
}

function alive(piece = {}) {
  return piece.destroyed !== true && numeric(piece.damage?.boxesRemaining ?? piece.boxesRemaining, 1) > 0;
}

function roleText(piece = {}) {
  return [
    piece.role,
    piece.cardType,
    piece.cardTypeName,
    piece.modelType,
    piece.type,
    piece.label,
    piece.name,
    ...(piece.keywords || []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function leaderLike(piece = {}) {
  return piece.isLeader === true || /warcaster|warlock|leader|commander/.test(roleText(piece));
}

function maxBoxes(piece = {}) {
  return Math.max(1, numeric(
    piece.damage?.maxBoxes ?? piece.maxBoxes ?? piece.damage?.boxesRemaining ?? piece.boxesRemaining,
    1,
  ));
}

function boxesRemaining(piece = {}) {
  return Math.max(0, numeric(piece.damage?.boxesRemaining ?? piece.boxesRemaining, alive(piece) ? maxBoxes(piece) : 0));
}

function fallbackPieceStrategicValue(piece = {}) {
  const explicit = numeric(
    piece.strategicValue ?? piece.pointValue ?? piece.pointsPerModel ?? piece.modelPointValue,
    0,
  );
  if (explicit > 0) return explicit;
  const durability = Math.min(30, maxBoxes(piece) * 1.35);
  const offense = Math.max(
    numeric(piece.meleePower, 0),
    numeric(piece.rangedPower, 0),
    numeric(piece.magicPower, 0),
  ) * 0.6;
  const mobility = numeric(piece.speedIn, 6) * 0.35;
  const resource = numeric(piece.resourceCapacity ?? piece.focus ?? piece.fury, 0) * 1.2;
  return round(5 + durability + offense + mobility + resource + (leaderLike(piece) ? 180 : 0));
}

function pointShareByPiece(state = {}) {
  const selectedOptionPoints = (piece = {}) => {
    const card = piece.cardSnapshot || {};
    return (card.selectedOptionChoices || []).reduce((sum, selection) => {
      const slot = (card.optionSlots || []).find((entry) =>
        String(entry.name || entry.slotName || "") === String(selection.slotName || selection.name || ""));
      const choice = (slot?.choices || []).find((entry) =>
        String(entry.id || "") === String(selection.choiceId || selection.id || "") ||
        String(entry.name || "") === String(selection.choiceName || selection.value || ""));
      return sum + numeric(choice?.pointCostNumber ?? choice?.pointCost, 0);
    }, 0);
  };
  const groups = new Map();
  for (const piece of state.pieces || []) {
    const cardId = String(piece.cardSnapshot?.id || piece.cardId || piece.cardName || piece.label || piece.pieceKey);
    const instanceKey = String(piece.unitGroupId || piece.unitId || piece.cardInstanceId || piece.entryId || piece.pieceKey);
    const key = `${instanceKey}|${cardId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        pieces: [],
        points: numeric(
          piece.cardSnapshot?.pointCostNumber ?? piece.pointCostNumber ?? piece.cardPoints,
          Number.NaN,
        ) + selectedOptionPoints(piece),
      });
    }
    groups.get(key).pieces.push(piece);
  }
  const shares = new Map();
  for (const group of groups.values()) {
    if (!Number.isFinite(group.points)) continue;
    const perModel = group.pieces.length ? group.points / group.pieces.length : 0;
    for (const piece of group.pieces) shares.set(piece.pieceKey, perModel);
  }
  return shares;
}

function pieceStrategicValue(piece = {}, pointShares = new Map()) {
  if (pointShares.has(piece.pieceKey)) {
    const listPointValue = numeric(pointShares.get(piece.pieceKey), 0) * 10;
    return round(listPointValue + (leaderLike(piece) ? 25 : 0));
  }
  return fallbackPieceStrategicValue(piece);
}

function centerDistance(left = {}, right = {}) {
  return Math.hypot(
    numeric(left.position?.xIn, 0) - numeric(right.position?.xIn, 0),
    numeric(left.position?.yIn, 0) - numeric(right.position?.yIn, 0),
  );
}

function baseEdgeDistance(left = {}, right = {}) {
  return Math.max(0, centerDistance(left, right) - numeric(left.baseSizeIn, 1.18) / 2 - numeric(right.baseSizeIn, 1.18) / 2);
}

function scenarioElements(state = {}) {
  return [
    ...(state.scenario?.zones || []).map((entry) => ({
      ...entry,
      elementKey: entry.zoneKey,
      radiusIn: numeric(entry.radiusIn, 0),
      controlPoints: numeric(entry.controlPoints, 1),
    })),
    ...(state.scenario?.flags || []).map((entry) => ({
      ...entry,
      elementKey: entry.flagKey,
      radiusIn: numeric(entry.radiusIn, 0.5),
      controlPoints: numeric(entry.controlPoints, 1),
    })),
    ...(state.scenario?.objectives || []).map((entry) => ({
      ...entry,
      elementKey: entry.objectiveKey,
      radiusIn: numeric(entry.radiusIn, 0.5),
      controlPoints: numeric(entry.controlPoints, 1),
    })),
  ];
}

function pieceInsideScenarioElement(piece = {}, element = {}) {
  if (!piece.position || !Number.isFinite(Number(element.xIn)) || !Number.isFinite(Number(element.yIn))) return false;
  const distance = Math.hypot(piece.position.xIn - element.xIn, piece.position.yIn - element.yIn);
  return distance <= numeric(element.radiusIn, 0) + numeric(piece.baseSizeIn, 1.18) / 2 + 0.001;
}

function sideMaterial(state, sideKey, pointShares) {
  return state.pieces
    .filter((piece) => piece.sideKey === sideKey)
    .reduce((sum, piece) => {
      if (!alive(piece)) return sum;
      return sum + pieceStrategicValue(piece, pointShares) * (0.35 + 0.65 * boxesRemaining(piece) / maxBoxes(piece));
    }, 0);
}

function sideScenarioPresence(state, sideKey) {
  const living = state.pieces.filter((piece) => piece.sideKey === sideKey && alive(piece));
  return scenarioElements(state).reduce((sum, element) => {
    const occupiers = living.filter((piece) => pieceInsideScenarioElement(piece, element));
    if (!occupiers.length) return sum;
    return sum + numeric(element.controlPoints, 1) * 10 + Math.min(8, occupiers.length * 1.5);
  }, 0);
}

function sideForwardPressure(state, sideKey) {
  const enemies = state.pieces.filter((piece) => piece.sideKey !== sideKey && alive(piece));
  if (!enemies.length) return 0;
  return state.pieces
    .filter((piece) => piece.sideKey === sideKey && alive(piece))
    .map((piece) => {
      const nearest = Math.min(...enemies.map((enemy) => baseEdgeDistance(piece, enemy)));
      const meleeThreat = numeric(piece.speedIn, 6) + 3 + numeric(piece.meleeRangeIn, 1);
      const rangedThreat = numeric(piece.speedIn, 6) + numeric(piece.rangedRangeIn, 0);
      const threat = Math.max(meleeThreat, rangedThreat);
      return nearest <= threat + 0.001 ? Math.min(8, Math.max(0, threat - nearest + 1)) : 0;
    })
    .sort((left, right) => right - left)
    .slice(0, 12)
    .reduce((sum, value) => sum + value, 0);
}

function sideResources(state, sideKey) {
  return state.pieces
    .filter((piece) => piece.sideKey === sideKey && alive(piece))
    .reduce((sum, piece) => sum + numeric(
      piece.resourcePoints ?? piece.focusPoints ?? piece.furyPoints ?? piece.hungerPoints,
      0,
    ), 0);
}

function sideConditionValue(state, sideKey) {
  const negativeStatusWeights = {
    knocked_down: -14,
    stationary: -12,
    blind: -9,
    shadow_bind: -8,
    shadowbind: -8,
    disrupted: -7,
    grievous_wounds: -6,
    grievous: -6,
    slow: -5,
    continuous_fire: -3,
    continuous_corrosion: -3,
    fire: -2,
    corrosion: -2,
  };
  const effectValue = (effect = {}) => {
    const text = JSON.stringify(effect).toLowerCase();
    const amount = numeric(
      effect.amount ?? effect.value ?? effect.modifier ?? effect.delta ?? effect.statModifier,
      0,
    );
    const magnitude = Math.max(1, Math.abs(amount));
    const statWeight = /arm|armor|def|defense/.test(text)
      ? 3
      : /mat|rat|aat|attack|damage|pow|power/.test(text)
        ? 2.5
        : /spd|speed|movement|range/.test(text)
          ? 2
          : 1.25;
    if (amount !== 0) return Math.sign(amount) * magnitude * statWeight;
    if (/cannot|penalty|suffer|reduce|lose|forfeit|knocked|stationary|blind|disrupt/.test(text)) return -2.5;
    if (/gain|bonus|ignore|pathfinder|stealth|reposition|resistance|rise|rapid healing/.test(text)) return 2.5;
    return 0.75;
  };
  return state.pieces
    .filter((piece) => piece.sideKey === sideKey && alive(piece))
    .reduce((sum, piece) => {
      const tags = new Set((piece.statusTags || []).map((tag) => String(tag).toLowerCase().replaceAll(" ", "_")));
      const statusPenalty = Array.from(tags).reduce((value, tag) => value + numeric(negativeStatusWeights[tag], 0), 0);
      const supportValue = (piece.activeSupportEffects || [])
        .filter((effect) => effect.active !== false)
        .reduce((value, support) => value +
          (support.effects || []).reduce((effectSum, effect) => effectSum + effectValue(effect), 0) +
          (support.ruleAtomStatusEffects || []).reduce((effectSum, effect) => effectSum + effectValue(effect), 0), 0);
      const statusEffectValue = (piece.statusEffects || [])
        .filter((effect) => effect.active !== false)
        .reduce((value, effect) => value + effectValue(effect), 0);
      const upkeepValue = (piece.activeUpkeeps || []).length * 1.5;
      return sum + statusPenalty + supportValue + statusEffectValue + upkeepValue;
    }, 0);
}

function sideFuryLiability(state, sideKey) {
  return state.pieces
    .filter((piece) => piece.sideKey === sideKey && alive(piece) && piece.canForceFury)
    .reduce((sum, piece) => {
      const fury = numeric(piece.resourcePoints ?? piece.furyPoints ?? piece.fury, 0);
      const threshold = Math.max(1, numeric(piece.furyThreshold, 4));
      return sum + Math.max(0, fury - threshold + 1) * 3 + Math.max(0, fury / threshold) * 0.8;
    }, 0);
}

function sideLeaderSafety(state, sideKey) {
  const leaders = state.pieces.filter((piece) => piece.sideKey === sideKey && alive(piece) && leaderLike(piece));
  const enemies = state.pieces.filter((piece) => piece.sideKey !== sideKey && alive(piece));
  const friendlies = state.pieces.filter((piece) => piece.sideKey === sideKey && alive(piece));
  return leaders.reduce((sum, leader) => {
    const healthValue = 18 * boxesRemaining(leader) / maxBoxes(leader);
    const screens = friendlies.filter((piece) => piece.pieceKey !== leader.pieceKey && baseEdgeDistance(piece, leader) <= 3).length;
    const threatRows = enemies.map((enemy) => {
      const distance = baseEdgeDistance(enemy, leader);
      const meleeThreat = numeric(enemy.speedIn, 6) + 3 + numeric(enemy.meleeRangeIn, 1);
      const rangedThreat = numeric(enemy.speedIn, 6) + numeric(enemy.rangedRangeIn, 0);
      return { distance, threat: Math.max(meleeThreat, rangedThreat) };
    });
    const immediateThreats = threatRows.filter((row) => row.distance <= row.threat + 0.001);
    const nearestMargin = threatRows.length
      ? Math.min(...threatRows.map((row) => row.distance - row.threat))
      : 12;
    return sum + healthValue + Math.min(8, screens * 1.5) + Math.max(-10, Math.min(10, nearestMargin)) - immediateThreats.length * 16;
  }, 0);
}

function destroyedLeaderSide(state = {}) {
  const destroyed = state.pieces.find((piece) => leaderLike(piece) && !alive(piece));
  return destroyed?.sideKey || "";
}

export function evaluateWarmachineMatchupState(inputState, options = {}) {
  const state = normalizeRulesV1State(inputState);
  const perspectiveSideKey = String(options.perspectiveSideKey || state.activeSideKey || "player1");
  const opponentSideKey = perspectiveSideKey === "player2" ? "player1" : "player2";
  const explicitWinnerSideKey = String(options.terminalWinnerSideKey || "");
  const lostLeaderSideKey = destroyedLeaderSide(state);
  const winnerSideKey = explicitWinnerSideKey || (lostLeaderSideKey
    ? (lostLeaderSideKey === "player1" ? "player2" : "player1")
    : "");
  const terminalValue = winnerSideKey
    ? (winnerSideKey === perspectiveSideKey ? 1_000_000 : -1_000_000)
    : 0;
  const pointShares = pointShareByPiece(state);
  const materialOwn = round(sideMaterial(state, perspectiveSideKey, pointShares));
  const materialOpponent = round(sideMaterial(state, opponentSideKey, pointShares));
  const material = round(materialOwn - materialOpponent);
  const scenarioScore = round(
    (numeric(state.scenario?.score?.[perspectiveSideKey], 0) - numeric(state.scenario?.score?.[opponentSideKey], 0)) * 65,
  );
  const scenarioPresence = round(sideScenarioPresence(state, perspectiveSideKey) - sideScenarioPresence(state, opponentSideKey));
  const forwardPressure = round(sideForwardPressure(state, perspectiveSideKey) - sideForwardPressure(state, opponentSideKey));
  const resources = round((sideResources(state, perspectiveSideKey) - sideResources(state, opponentSideKey)) * 0.5);
  const conditions = round(sideConditionValue(state, perspectiveSideKey) - sideConditionValue(state, opponentSideKey));
  const furyLiability = round(sideFuryLiability(state, perspectiveSideKey) - sideFuryLiability(state, opponentSideKey));
  const leaderSafety = round(sideLeaderSafety(state, perspectiveSideKey) - sideLeaderSafety(state, opponentSideKey));
  const score = round(
    terminalValue + material + scenarioScore + scenarioPresence + forwardPressure + resources + conditions + leaderSafety - furyLiability,
  );
  return {
    schemaVersion: WARMACHINE_MATCHUP_EVALUATION_SCHEMA,
    perspectiveSideKey,
    opponentSideKey,
    score,
    terminal: Boolean(winnerSideKey),
    winnerSideKey,
    breakdown: {
      terminalValue,
      material,
      materialOwn,
      materialOpponent,
      scenarioScore,
      scenarioPresence,
      forwardPressure,
      resources,
      conditions,
      leaderSafety,
      furyLiabilityPenalty: round(-furyLiability),
    },
    note: "This is a state utility function. Rules legality and state mutation come only from rules-v1 strict transitions.",
  };
}

function stateFingerprint(state = {}) {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex").slice(0, 24);
}

function runtimeWindowActive(state = {}) {
  return [
    state.unitActivationWindow,
    state.anyTimeActivationWindow,
    state.initialAttackWindow,
    state.combatPurchaseWindow,
    state.activationForfeitWindow,
    state.vengeanceWindow,
  ].some((window) => window?.active || window?.phase);
}

function runtimeWindowActorPieceKeys(state = {}) {
  const keys = new Set();
  const add = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) add(item);
      return;
    }
    const pieceKey = String(value || "");
    if (pieceKey) keys.add(pieceKey);
  };
  const unit = state.unitActivationWindow || {};
  add(unit.currentTrooperPieceKey);
  add(unit.selectedModelPieceKey);
  add(unit.pendingTrooperPieceKeys);
  add(unit.charge?.pendingTrooperPieceKeys);
  add(unit.assault?.pendingTrooperPieceKeys);
  add(unit.aim?.pendingTrooperPieceKeys);
  const windows = [
    state.anyTimeActivationWindow,
    state.initialAttackWindow,
    state.combatPurchaseWindow,
    state.activationForfeitWindow,
    state.vengeanceWindow,
  ].filter(Boolean);
  for (const window of windows) {
    add(window.actorPieceKey);
    add(window.activationActorPieceKey);
    add(window.selectedModelPieceKey);
    add(window.currentPieceKey);
    add(window.pendingActorPieceKeys);
    add(window.pendingPieceKeys);
    add(window.eligiblePieceKeys);
  }
  const activePieceKeys = new Set(state.pieces
    .filter((piece) => piece.sideKey === state.activeSideKey && alive(piece))
    .map((piece) => piece.pieceKey));
  return Array.from(keys).filter((pieceKey) => activePieceKeys.has(pieceKey)).sort();
}

export function buildWarmachineActivationGroups(inputState) {
  const state = normalizeRulesV1State(inputState);
  const groups = new Map();
  for (const piece of state.pieces) {
    if (piece.sideKey !== state.activeSideKey || !alive(piece) || piece.activated === true) continue;
    const groupKey = String(
      piece.unitGroupId || piece.unitId || piece.metadata?.unitGroupId || piece.metadata?.unitId || piece.pieceKey,
    );
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(piece);
  }
  const enemies = state.pieces.filter((piece) => piece.sideKey !== state.activeSideKey && alive(piece));
  const elements = scenarioElements(state);
  return Array.from(groups, ([groupKey, pieces]) => {
    const nearestEnemy = enemies.length
      ? Math.min(...pieces.flatMap((piece) => enemies.map((enemy) => baseEdgeDistance(piece, enemy))))
      : 99;
    const nearestScenario = elements.length
      ? Math.min(...pieces.flatMap((piece) => elements.map((element) => Math.hypot(
        numeric(piece.position?.xIn, 0) - numeric(element.xIn, 0),
        numeric(piece.position?.yIn, 0) - numeric(element.yIn, 0),
      ))))
      : 99;
    const priority = round(
      Math.max(0, 24 - nearestEnemy) +
      Math.max(0, 18 - nearestScenario) * 0.6 +
      pieces.reduce((sum, piece) => sum + (leaderLike(piece) ? 6 : 0) + numeric(piece.resourcePoints, 0), 0),
    );
    const groupRoleText = pieces.map((piece) => roleText(piece)).join(" ");
    const groupFamily = pieces.some((piece) => leaderLike(piece))
      ? "leader"
      : /warjack|warbeast|monstrosity|colossal|gargantuan/.test(groupRoleText)
        ? "battlegroup"
        : pieces.length > 1 || /unit|trooper|attachment/.test(groupRoleText)
          ? "unit"
          : /solo|support|attachment/.test(groupRoleText)
            ? "support"
            : "other";
    return {
      groupKey,
      groupFamily,
      actorPieceKeys: pieces.map((piece) => piece.pieceKey).sort(),
      pieceCount: pieces.length,
      nearestEnemyIn: round(nearestEnemy),
      nearestScenarioIn: round(nearestScenario),
      priority,
    };
  }).sort((left, right) => right.priority - left.priority || left.groupKey.localeCompare(right.groupKey));
}

function searchActivationGroupScore(group = {}, state = {}, options = {}) {
  if (typeof options.activationGroupScore === "function") {
    const score = numeric(options.activationGroupScore(group, state), Number.NaN);
    if (Number.isFinite(score)) return score;
  }
  return numeric(group.priority, 0);
}

function selectSearchActivationGroups(groups = [], limit = 0, mode = "score", state = {}, options = {}) {
  const ordered = groups.slice().sort((left, right) =>
    searchActivationGroupScore(right, state, options) - searchActivationGroupScore(left, state, options) ||
    left.groupKey.localeCompare(right.groupKey));
  if (!limit || groups.length <= limit) return ordered;
  if (mode !== "diverse") return ordered.slice(0, limit);
  const selected = [];
  const remaining = ordered;
  const seenFamilies = new Set();
  while (selected.length < limit && remaining.length) {
    remaining.sort((left, right) => {
      const leftNovel = seenFamilies.has(left.groupFamily) ? 0 : 1;
      const rightNovel = seenFamilies.has(right.groupFamily) ? 0 : 1;
      return rightNovel - leftNovel ||
        searchActivationGroupScore(right, state, options) - searchActivationGroupScore(left, state, options) ||
        left.groupKey.localeCompare(right.groupKey);
    });
    const next = remaining.shift();
    selected.push(next);
    seenFamilies.add(next.groupFamily);
  }
  return selected;
}

function unitLeaderLikeSearchMember(member = {}) {
  const text = `${member.pieceKey || ""} ${member.label || ""} ${member.name || ""} ${member.modelRole || ""} ${member.roleKey || ""}`.toLowerCase();
  return Boolean(
    member.isUnitLeader ||
      member.unitLeader ||
      member.leaderInUnit ||
      member.metadata?.isUnitLeader ||
      /\bunit[_\s-]?leader\b/.test(text) ||
      /\bleader\b/.test(text),
  );
}

function searchActivationGroupActorPieceKeys(state = {}, group = {}, options = {}, context = null) {
  const fullScope = Array.isArray(group.actorPieceKeys) ? group.actorPieceKeys : [];
  if (!optionFlag(options.representativeUnitGroupScope) || group.groupFamily !== "unit" || fullScope.length <= 1) {
    return fullScope;
  }
  const scopeKeys = new Set(fullScope);
  const pieces = (state.pieces || [])
    .filter((piece) => scopeKeys.has(piece.pieceKey) && piece.sideKey === state.activeSideKey && alive(piece))
    .sort((left, right) => left.pieceKey.localeCompare(right.pieceKey));
  if (pieces.length <= 1) return fullScope;
  const representative = pieces.find(unitLeaderLikeSearchMember) || pieces[0];
  if (!representative?.pieceKey) return fullScope;
  if (context?.stats) {
    context.stats.representativeUnitGroupScopesUsed += 1;
    context.stats.representativeUnitGroupActorKeysSuppressed += Math.max(0, fullScope.length - 1);
  }
  return [representative.pieceKey];
}

function actionOrderingScore(action = {}) {
  const type = String(action.actionType || "");
  const base = {
    score_zone: 100,
    score_flag: 100,
    use_feat: 72,
    offensive_spell: 68,
    boosted_offensive_spell: 70,
    charge: 64,
    boosted_charge: 66,
    combined_melee_attack: 65,
    combined_ranged_attack: 64,
    melee_attack: 58,
    ranged_attack: 57,
    advance_then_melee_attack: 60,
    advance_then_ranged_attack: 59,
    end_turn: -30,
    pass: -40,
  }[type] ?? (type.startsWith("end_") ? -10 : type.includes("attack") ? 55 : type.includes("run") ? 18 : 12);
  return round(base + numeric(action.expectedDamage, 0) * 2 + numeric(action.metadata?.killProbability, 0) * 20);
}

function searchActionOrderingScore(action = {}, state = {}, options = {}) {
  if (typeof options.actionScore === "function") {
    const score = numeric(options.actionScore(action, state), Number.NaN);
    if (Number.isFinite(score)) return score;
  }
  return actionOrderingScore(action);
}

function evaluateSearchState(state = {}, options = {}, terminalWinnerSideKey = "") {
  if (typeof options.stateEvaluator === "function") {
    const evaluation = options.stateEvaluator(state, {
      perspectiveSideKey: options.perspectiveSideKey,
      terminalWinnerSideKey,
      defaultEvaluation: evaluateWarmachineMatchupState(state, {
        perspectiveSideKey: options.perspectiveSideKey,
        terminalWinnerSideKey,
      }),
    });
    if (!Number.isFinite(numeric(evaluation?.score, Number.NaN))) {
      throw new Error("Custom Warmachine search stateEvaluator must return an object with a finite score.");
    }
    return evaluation;
  }
  return evaluateWarmachineMatchupState(state, {
    perspectiveSideKey: options.perspectiveSideKey,
    terminalWinnerSideKey,
  });
}

export function classifyWarmachineSearchAction(action = {}) {
  const type = String(action.actionType || "").toLowerCase();
  const key = String(action.actionKey || "").toLowerCase();
  const text = `${type} ${key}`;
  if (/score_zone|score_flag|scenario|objective/.test(text)) return "scenario";
  if (/feat/.test(text)) return "feat";
  if (/spell|upkeep|animus|animi|channel/.test(text)) return "spell";
  if (/allocate|focus|fury|force|boost|power_up|resource/.test(text)) return "resource";
  if (/charge/.test(text)) return "charge";
  if (/\brun\b/.test(text)) return "run";
  if (/aim/.test(text)) return "aim";
  if (/advance|reposition|place|movement|move/.test(text)) return "advance";
  if (/attack|strike|slam|throw|trample|head_butt|head-butt/.test(text)) return "attack";
  if (/pass|forfeit|end_|complete|decline|skip/.test(text)) return "completion";
  if (/special_action|support|repair|heal|shake|stand_up/.test(text)) return "support";
  return "other";
}

function countBy(values = []) {
  const counts = {};
  for (const value of values) counts[value] = numeric(counts[value], 0) + 1;
  return counts;
}

function incrementCounts(target = {}, values = []) {
  for (const value of values) target[value] = numeric(target[value], 0) + 1;
}

function diverseSearchEntries(entries = [], limit = 0, state = {}, options = {}) {
  if (!limit || entries.length <= limit) return entries.slice();
  const selected = [];
  const remaining = entries.slice();
  const seenScopes = new Set();
  const seenFamilies = new Set();
  const seenPairs = new Set();
  const seenVariants = new Set();
  const selectionVariant = (entry) => {
    if (entry.action?.actionType === "force_fury") {
      return `${entry.scopeKey}|resource|rile_amount_${Math.max(1, Math.floor(numeric(entry.action.metadata?.resourceAmount, 1)))}`;
    }
    return "";
  };
  while (selected.length < limit && remaining.length) {
    remaining.sort((left, right) => {
      const leftFamily = classifyWarmachineSearchAction(left.action);
      const rightFamily = classifyWarmachineSearchAction(right.action);
      const leftPair = `${left.scopeKey}|${leftFamily}`;
      const rightPair = `${right.scopeKey}|${rightFamily}`;
      const leftVariant = selectionVariant(left);
      const rightVariant = selectionVariant(right);
      const leftNovelty = (seenScopes.has(left.scopeKey) ? 0 : 100_000) +
        (seenFamilies.has(leftFamily) ? 0 : 10_000) +
        (leftVariant && !seenVariants.has(leftVariant) ? 2_000 : 0) +
        (seenPairs.has(leftPair) ? 0 : 1_000);
      const rightNovelty = (seenScopes.has(right.scopeKey) ? 0 : 100_000) +
        (seenFamilies.has(rightFamily) ? 0 : 10_000) +
        (rightVariant && !seenVariants.has(rightVariant) ? 2_000 : 0) +
        (seenPairs.has(rightPair) ? 0 : 1_000);
      return rightNovelty - leftNovelty ||
        searchActionOrderingScore(right.action, state, options) - searchActionOrderingScore(left.action, state, options) ||
        left.action.actionKey.localeCompare(right.action.actionKey);
    });
    const next = remaining.shift();
    const family = classifyWarmachineSearchAction(next.action);
    selected.push(next);
    seenScopes.add(next.scopeKey);
    seenFamilies.add(family);
    seenPairs.add(`${next.scopeKey}|${family}`);
    const variant = selectionVariant(next);
    if (variant) seenVariants.add(variant);
  }
  return selected;
}

function commutativeUnitEndContinuation(entries = [], state = {}) {
  const window = state.unitActivationWindow;
  if (!window || window.phase !== "combat_actions" || entries.length < 1) return null;
  if (!entries.every((entry) => entry.action?.actionType === "end_unit_trooper_combat_action")) return null;
  const pendingPieceKeys = Array.from(new Set((window.pendingTrooperPieceKeys || []).map(String).filter(Boolean))).sort();
  const actorPieceKeys = Array.from(new Set(entries.map((entry) => String(entry.action?.actorPieceKey || "")).filter(Boolean))).sort();
  if (pendingPieceKeys.length !== entries.length || actorPieceKeys.length !== entries.length) return null;
  if (pendingPieceKeys.some((pieceKey, index) => pieceKey !== actorPieceKeys[index])) return null;
  const ordered = entries.slice().sort((left, right) => left.action.actionKey.localeCompare(right.action.actionKey));
  return {
    selected: ordered[0],
    alternativeCount: ordered.length - 1,
    pendingPieceKeys,
    reason: "all_pending_troopers_have_only_commutative_end_combat_action",
  };
}

function actionSummary(action = {}) {
  return {
    actionKey: action.actionKey || "",
    actionType: action.actionType || "",
    actorPieceKey: action.actorPieceKey || "",
    targetPieceKey: action.targetPieceKey || "",
    destination: action.destination ? cloneJson(action.destination) : null,
  };
}

function searchActionBudgetCost(action = {}, options = {}) {
  if (!options.freeBookkeepingActionBudget) return 1;
  const type = String(action.actionType || "");
  if (type === "end_unit_trooper_combat_action") return 0;
  return 1;
}

function compactStepFromTransition({
  branch,
  entry,
  outcome,
  transition,
  childState,
  activationBoundaryReached,
  completedActivationCount,
  actionBudgetCost,
  actionBudgetSpent,
  primitiveActionCount,
}) {
  const eventTypes = (transition.events || []).map((event) => event.eventType);
  return {
    sideKey: branch.state.activeSideKey,
    phaseKey: branch.state.phaseKey,
    stateFingerprintBefore: stateFingerprint(branch.state),
    ...actionSummary(entry.action),
    reactionVariant: outcome.variantKey,
    reactionRequirementCount: outcome.requirements.length,
    chanceMeanValue: outcome.meanValue,
    chanceDownsideValue: outcome.downsideValue,
    riskAdjustedValue: outcome.riskAdjustedValue,
    stateEvaluationScore: outcome.representative.evaluation?.score ?? null,
    stateEvaluationBreakdown: cloneJson(outcome.representative.evaluation?.breakdown || {}),
    terminalWinnerSideKey: outcome.representative.terminalWinnerSideKey || "",
    stateFingerprintAfter: stateFingerprint(childState),
    eventTypes,
    eventCount: eventTypes.length,
    activationBoundaryReached,
    completedActivationCount,
    actionBudgetCost,
    actionBudgetSpent,
    primitiveActionCount,
  };
}

function fullStepFromTransition(input) {
  const step = compactStepFromTransition(input);
  return {
    ...step,
    executedAction: input.transition.executedAction,
    reactionRequirements: cloneJson(input.outcome.requirements),
    stateEvaluation: cloneJson(input.outcome.representative.evaluation),
    events: cloneJson(input.transition.events || []),
  };
}

function searchStepFromTransition(input, options = {}) {
  return options.traceDetail === "compact" ? compactStepFromTransition(input) : fullStepFromTransition(input);
}

function strictState(inputState = {}) {
  return normalizeRulesV1State({
    ...cloneJson(inputState),
    strictMode: true,
    enforceStrictExecutor: true,
    metadata: {
      ...(inputState.metadata || {}),
      strictMode: true,
      enforceStrictExecutor: true,
    },
  });
}

function enumerateSearchActions(state, options, context, traversal = {}) {
  const fingerprint = stateFingerprint(state);
  const isRootAction = traversal.isRootAction === true;
  const activeRuntimeWindow = state.phaseKey === "activation" && runtimeWindowActive(state);
  const runtimeActorPieceKeys = activeRuntimeWindow ? runtimeWindowActorPieceKeys(state) : [];
  const useGroupScope = state.phaseKey === "activation" && !activeRuntimeWindow && numeric(options.activationGroupLimit, 0) > 0;
  const availableGroups = useGroupScope ? buildWarmachineActivationGroups(state) : [];
  const requestedRootGroup = isRootAction && options.rootActivationGroupKey
    ? availableGroups.find((group) => group.groupKey === options.rootActivationGroupKey)
    : null;
  if (isRootAction && options.rootActivationGroupKey && !requestedRootGroup) return [];
  const groups = requestedRootGroup
    ? [requestedRootGroup]
    : selectSearchActivationGroups(
      availableGroups,
      Math.max(1, Math.floor(options.activationGroupLimit)),
      options.activationGroupSelectionMode,
      state,
      options,
    );
  const scopes = runtimeActorPieceKeys.length
    ? [runtimeActorPieceKeys]
    : groups.length
      ? groups.map((group) => searchActivationGroupActorPieceKeys(state, group, options, context))
      : [null];
  const entries = [];
  for (const actorPieceKeys of scopes) {
    const scopeKey = actorPieceKeys?.join(",") || "all";
    const cacheKey = `${fingerprint}|${scopeKey}`;
    const cacheLimit = Math.max(0, Math.floor(numeric(options.enumerationCacheLimit, 0)));
    let enumeration = cacheLimit > 0 ? context.enumerationCache.get(cacheKey) : null;
    if (enumeration) {
      context.stats.enumerationCacheHits += 1;
      setBoundedMapEntry(context.enumerationCache, cacheKey, enumeration, cacheLimit, context.stats);
    } else {
      enumeration = enumerateRulesV1Actions(state, actorPieceKeys ? { actorPieceKeys } : {});
      setBoundedMapEntry(context.enumerationCache, cacheKey, enumeration, cacheLimit, context.stats);
      context.stats.enumerationCalls += 1;
      context.stats.legalActionsObserved += enumeration.actions.length;
      context.stats.rejectedActionsObserved += (enumeration.rejectedActions || []).length;
    }
    for (const action of enumeration.actions) entries.push({ action, enumeration, scopeKey });
  }
  const deduped = Array.from(new Map(entries.map((entry) => [entry.action.actionKey, entry])).values());
  const rootFiltered = isRootAction && options.rootActionKey
    ? deduped.filter((entry) => entry.action.actionKey === options.rootActionKey)
    : deduped;
  const filtered = typeof options.actionFilter === "function"
    ? rootFiltered.filter((entry) => options.actionFilter(entry.action, state))
    : rootFiltered;
  filtered.sort((left, right) =>
    searchActionOrderingScore(right.action, state, options) - searchActionOrderingScore(left.action, state, options) ||
    left.action.actionKey.localeCompare(right.action.actionKey));
  const actionLimit = Math.max(0, Math.floor(numeric(options.actionLimit, 0)));
  const commutativeContinuation = rootFiltered.length === deduped.length && filtered.length === deduped.length
    ? commutativeUnitEndContinuation(deduped, state)
    : null;
  const selected = commutativeContinuation
    ? [commutativeContinuation.selected]
    : actionLimit && filtered.length > actionLimit
      ? options.actionSelectionMode === "diverse"
        ? diverseSearchEntries(filtered, actionLimit, state, options)
        : filtered.slice(0, actionLimit)
      : filtered;
  const observedFamilies = filtered.map((entry) => classifyWarmachineSearchAction(entry.action));
  const selectedFamilies = selected.map((entry) => classifyWarmachineSearchAction(entry.action));
  const prunedCount = Math.max(0, filtered.length - selected.length);
  if (commutativeContinuation) {
    context.stats.commutativeContinuationCollapses += 1;
    context.stats.commutativeContinuationAlternativesCollapsed += commutativeContinuation.alternativeCount;
  } else {
    context.stats.actionsPrunedByLimit += prunedCount;
  }
  incrementCounts(context.stats.actionFamilyObservedCounts, observedFamilies);
  incrementCounts(context.stats.actionFamilySelectedCounts, selectedFamilies);
  incrementCounts(context.stats.activationGroupFamilyObservedCounts, availableGroups.map((group) => group.groupFamily));
  incrementCounts(context.stats.activationGroupFamilySelectedCounts, groups.map((group) => group.groupFamily));
  if (context.pruningAudit.length < options.pruningAuditLimit) {
    const selectedKeys = new Set(selected.map((entry) => entry.action.actionKey));
    context.pruningAudit.push({
      stateFingerprint: fingerprint,
      rootAction: isRootAction,
      activeRuntimeWindow,
      availableActivationGroupKeys: availableGroups.map((group) => group.groupKey),
      selectedActivationGroupKeys: groups.map((group) => group.groupKey),
      observedActionCount: filtered.length,
      selectedActionCount: selected.length,
      prunedActionCount: prunedCount,
      selectionReason: commutativeContinuation?.reason || (actionLimit && filtered.length > actionLimit ? "bounded_action_selection" : "all_actions_selected"),
      commutativeContinuationAlternativesCollapsed: commutativeContinuation?.alternativeCount || 0,
      commutativeContinuationPendingPieceKeys: cloneJson(commutativeContinuation?.pendingPieceKeys || []),
      observedActionFamilies: Object.keys(countBy(observedFamilies)).sort(),
      selectedActionFamilies: Object.keys(countBy(selectedFamilies)).sort(),
      prunedActionFamilyCounts: countBy(filtered
        .filter((entry) => !selectedKeys.has(entry.action.actionKey))
        .map((entry) => classifyWarmachineSearchAction(entry.action))),
      selectedActions: selected.map((entry) => ({
        ...actionSummary(entry.action),
        scopeKey: entry.scopeKey,
        actionFamily: classifyWarmachineSearchAction(entry.action),
        selectionVariant: entry.action.actionType === "force_fury"
          ? `rile_amount_${Math.max(1, Math.floor(numeric(entry.action.metadata?.resourceAmount, 1)))}`
          : "",
        orderingScore: searchActionOrderingScore(entry.action, state, options),
      })),
    });
  }
  return selected;
}

function declineAllReactionChoices(requirements = []) {
  const choices = {
    freeStrikeOutcomesByEnemy: {},
    reactionOutcomesByReactor: {},
  };
  for (const requirement of requirements) {
    if (requirement.kind === "free_strike") {
      choices.freeStrikeOutcomesByEnemy[requirement.choiceKey] = { decline: true };
    } else {
      choices.reactionOutcomesByReactor[requirement.choiceKey] = { decline: true };
    }
  }
  return choices;
}

function reactionVariants(action, enumeration) {
  const requirements = strictOpponentReactionRequirementsForAction(
    action,
    { rulesV1State: enumeration.state, rulesV1Enumeration: enumeration },
    enumeration.state.activeSideKey,
  );
  if (!requirements.length) return [{ variantKey: "none", requirements, policy: "", choices: null }];
  return [
    { variantKey: "take_all", requirements, policy: "", choices: null },
    {
      variantKey: "decline_all",
      requirements,
      policy: "bot_confirmed",
      choices: declineAllReactionChoices(requirements),
    },
  ];
}

function strictTransition(entry, options, context, sampleIndex, reactionVariant) {
  const { action, enumeration } = entry;
  const sourceContext = {
    rulesV1State: enumeration.state,
    rulesV1Enumeration: enumeration,
  };
  const seedState = stateFingerprint(enumeration.state);
  const strictAction = {
    ...buildWarmachineRulesV1ActionWithStrictRngOutcome(action, {
      room: {
        id: `matchup-search-${options.searchSeed}-${seedState}-${action.actionKey}-${reactionVariant.variantKey}-${sampleIndex}`,
        game: {
          round: enumeration.state.turnNumber,
          turnNumber: enumeration.state.turnNumber,
          activeSideKey: enumeration.state.activeSideKey,
        },
      },
      sourceContext,
      selectedActionKey: action.actionKey,
      reactionResolutionPolicy: reactionVariant.policy,
      humanReactionChoices: reactionVariant.choices,
    }),
    __warmachineTrustedRulesV1Enumeration: enumeration,
  };
  context.stats.strictTransitionAttempts += 1;
  const transition = applyRulesV1Action(enumeration.state, strictAction);
  if (transition.ok) {
    context.stats.strictTransitionsAccepted += 1;
  } else {
    context.stats.strictTransitionsRejected += 1;
    if (context.strictRejectionAudit.length < options.strictRejectionAuditLimit) {
      context.strictRejectionAudit.push({
        stateFingerprint: seedState,
        ...actionSummary(action),
        sampleIndex,
        reactionVariant: reactionVariant.variantKey,
        reason: transition.reason || "strict_transition_rejected",
        eventTypes: (transition.events || []).map((event) => event.eventType),
        events: cloneJson(transition.events || []),
      });
    }
  }
  const executedAction = { ...strictAction };
  delete executedAction.__warmachineTrustedRulesV1Enumeration;
  return {
    ...transition,
    executedAction: cloneJson(executedAction),
  };
}

function enumerateBookkeepingContinuationEntries(state, options, context) {
  if (!options.freeBookkeepingActionBudget) return null;
  if (state.phaseKey !== "activation" || !runtimeWindowActive(state)) return null;
  const actorPieceKeys = runtimeWindowActorPieceKeys(state);
  if (!actorPieceKeys.length) return null;
  const enumeration = enumerateRulesV1Actions(state, { actorPieceKeys });
  context.stats.enumerationCalls += 1;
  context.stats.legalActionsObserved += enumeration.actions.length;
  context.stats.rejectedActionsObserved += (enumeration.rejectedActions || []).length;
  const entries = enumeration.actions.map((action) => ({
    action,
    enumeration,
    scopeKey: actorPieceKeys.join(","),
  }));
  const continuation = commutativeUnitEndContinuation(entries, state);
  return continuation ? { continuation, entries } : null;
}

function drainBookkeepingContinuations(branch, options, context) {
  let current = { ...branch };
  let drainedCount = 0;
  while (!current.turnComplete &&
    !current.activationHorizonReached &&
    !current.actionBudgetReached &&
    drainedCount < options.bookkeepingDrainLimitPerAction &&
    numeric(current.primitiveActionCount, 0) < options.maxPrimitiveActionsPerTurn) {
    const nextContinuation = enumerateBookkeepingContinuationEntries(current.state, options, context);
    if (!nextContinuation) break;
    const entry = nextContinuation.continuation.selected;
    if (typeof options.onProgress === "function" && (drainedCount === 0 || drainedCount % 4 === 0)) {
      options.onProgress({
        turnSideKey: current.state.activeSideKey,
        layer: context.stats.beamLayers,
        frontierCount: null,
        completedCount: null,
        generatedCount: null,
        bookkeepingDrainActive: true,
        bookkeepingDrainCount: drainedCount,
        strictTransitionAttempts: context.stats.strictTransitionAttempts,
        strictTransitionsRejected: context.stats.strictTransitionsRejected,
        enumerationCalls: context.stats.enumerationCalls,
      });
    }
    const transition = strictTransition(entry, options, context, drainedCount, {
      variantKey: "bookkeeping",
      requirements: [],
      policy: "",
      choices: null,
    });
    if (!transition.ok) break;
    const childState = transition.nextState;
    const activationBoundaryReached = transitionCompletesActivation(transition.events || []);
    const completedActivationCount = numeric(current.completedActivationCount, 0) + (activationBoundaryReached ? 1 : 0);
    const activationHorizonReached = options.activationHorizon > 0 && completedActivationCount >= options.activationHorizon;
    const actionBudgetCost = searchActionBudgetCost(entry.action, options);
    const actionBudgetSpent = numeric(current.actionBudgetSpent, 0) + actionBudgetCost;
    const primitiveActionCount = numeric(current.primitiveActionCount, 0) + 1;
    const actionBudgetReached = actionBudgetSpent >= options.maxActionsPerTurn;
    if (actionBudgetCost === 0) context.stats.freeBookkeepingActionsSelected += 1;
    context.stats.bookkeepingContinuationDrains += 1;
    context.stats.maxActionBudgetSpent = Math.max(context.stats.maxActionBudgetSpent, actionBudgetSpent);
    context.stats.maxPrimitiveActionCount = Math.max(context.stats.maxPrimitiveActionCount, primitiveActionCount);
    const evaluation = evaluateSearchState(childState, options);
    const step = searchStepFromTransition({
      branch: current,
      entry,
      outcome: {
        variantKey: "bookkeeping",
        requirements: [],
        meanValue: evaluation.score,
        downsideValue: evaluation.score,
        riskAdjustedValue: evaluation.score,
        representative: {
          evaluation,
          terminalWinnerSideKey: "",
        },
      },
      transition,
      childState,
      activationBoundaryReached,
      completedActivationCount,
      actionBudgetCost,
      actionBudgetSpent,
      primitiveActionCount,
    }, options);
    drainedCount += 1;
    current = {
      ...current,
      state: childState,
      utility: evaluation.score,
      principalVariation: [...(current.principalVariation || []), step],
      turnComplete: childState.activeSideKey !== current.state.activeSideKey,
      activationHorizonReached,
      completedActivationCount,
      actionBudgetSpent,
      primitiveActionCount,
      actionBudgetReached,
      stopReason: "",
    };
  }
  if (!current.turnComplete &&
    !current.activationHorizonReached &&
    !current.actionBudgetReached &&
    drainedCount >= options.bookkeepingDrainLimitPerAction) {
    context.stats.bookkeepingDrainLimitStops += 1;
  }
  if (!current.turnComplete &&
    !current.activationHorizonReached &&
    !current.actionBudgetReached &&
    numeric(current.primitiveActionCount, 0) >= options.maxPrimitiveActionsPerTurn) {
    current = { ...current, primitiveActionBudgetReached: true };
  }
  return current;
}

function average(values = []) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function searchWarmachineStrictExpectiminimax(inputState, rawOptions = {}) {
  const options = {
    perspectiveSideKey: rawOptions.perspectiveSideKey || inputState.activeSideKey || "player1",
    maxDepth: Math.max(1, Math.floor(numeric(rawOptions.maxDepth, 4))),
    maxNodes: Math.max(1, Math.floor(numeric(rawOptions.maxNodes, 20_000))),
    chanceSamples: Math.max(1, Math.floor(numeric(rawOptions.chanceSamples, 1))),
    actionLimit: Math.max(0, Math.floor(numeric(rawOptions.actionLimit, 0))),
    activationGroupLimit: Math.max(0, Math.floor(numeric(rawOptions.activationGroupLimit, 0))),
    actionSelectionMode: String(rawOptions.actionSelectionMode || "score"),
    activationGroupSelectionMode: String(rawOptions.activationGroupSelectionMode || "score"),
    pruningAuditLimit: Math.max(0, Math.floor(numeric(rawOptions.pruningAuditLimit, 100))),
    strictRejectionAuditLimit: Math.max(0, Math.floor(numeric(rawOptions.strictRejectionAuditLimit, 32))),
    enumerationCacheLimit: Math.max(0, Math.floor(numeric(rawOptions.enumerationCacheLimit, 128))),
    traceDetail: traceDetailMode(rawOptions.traceDetail),
    representativeUnitGroupScope: optionFlag(rawOptions.representativeUnitGroupScope),
    actionFilter: rawOptions.actionFilter,
    actionScore: rawOptions.actionScore,
    activationGroupScore: rawOptions.activationGroupScore,
    stateEvaluator: rawOptions.stateEvaluator,
    actionScoreLabel: String(rawOptions.actionScoreLabel || "default_action_ordering"),
    activationGroupScoreLabel: String(rawOptions.activationGroupScoreLabel || "default_activation_group_priority"),
    stateEvaluatorLabel: String(rawOptions.stateEvaluatorLabel || "default_matchup_state_evaluation"),
    searchSeed: String(rawOptions.searchSeed || "warmachine-matchup-search-v1"),
  };
  const state = strictState(inputState);
  const stats = {
    expandedNodes: 0,
    leafEvaluations: 0,
    enumerationCalls: 0,
    enumerationCacheHits: 0,
    enumerationCacheEvictions: 0,
    transpositionHits: 0,
    legalActionsObserved: 0,
    rejectedActionsObserved: 0,
    actionsPrunedByLimit: 0,
    commutativeContinuationCollapses: 0,
    commutativeContinuationAlternativesCollapsed: 0,
    representativeUnitGroupScopesUsed: 0,
    representativeUnitGroupActorKeysSuppressed: 0,
    alphaBetaPrunes: 0,
    strictTransitionAttempts: 0,
    strictTransitionsAccepted: 0,
    strictTransitionsRejected: 0,
    chanceSamplesEvaluated: 0,
    budgetCutoffs: 0,
    actionFamilyObservedCounts: {},
    actionFamilySelectedCounts: {},
    activationGroupFamilyObservedCounts: {},
    activationGroupFamilySelectedCounts: {},
  };
  const context = {
    stats,
    enumerationCache: new Map(),
    transposition: new Map(),
    pruningAudit: [],
    strictRejectionAudit: [],
  };

  const evaluateLeaf = (nodeState, terminalWinnerSideKey = "") => {
    stats.leafEvaluations += 1;
    return evaluateSearchState(nodeState, options, terminalWinnerSideKey);
  };

  const visit = (nodeState, depth, alpha, beta, terminalWinnerSideKey = "") => {
    stats.expandedNodes += 1;
    const lostLeaderSideKey = destroyedLeaderSide(nodeState);
    const resolvedWinnerSideKey = terminalWinnerSideKey || (lostLeaderSideKey
      ? (lostLeaderSideKey === "player1" ? "player2" : "player1")
      : "");
    if (resolvedWinnerSideKey || depth <= 0 || stats.expandedNodes >= options.maxNodes) {
      if (!resolvedWinnerSideKey && depth > 0 && stats.expandedNodes >= options.maxNodes) stats.budgetCutoffs += 1;
      const evaluation = evaluateLeaf(nodeState, resolvedWinnerSideKey);
      return { value: evaluation.score, evaluation, principalVariation: [], complete: depth <= 0 || Boolean(resolvedWinnerSideKey) };
    }
    const fingerprint = stateFingerprint(nodeState);
    const transpositionKey = `${fingerprint}|${depth}|${terminalWinnerSideKey}`;
    const cached = context.transposition.get(transpositionKey);
    if (cached) {
      stats.transpositionHits += 1;
      return cached;
    }
    const entries = enumerateSearchActions(nodeState, options, context, {
      isRootAction: depth === options.maxDepth,
    });
    if (!entries.length) {
      const evaluation = evaluateLeaf(nodeState, terminalWinnerSideKey);
      return { value: evaluation.score, evaluation, principalVariation: [], complete: true };
    }
    const maximizing = nodeState.activeSideKey === options.perspectiveSideKey;
    let best = null;
    let pruned = false;
    const rankedActions = [];
    for (const entry of entries) {
      const variants = reactionVariants(entry.action, entry.enumeration);
      const variantResults = [];
      for (const variant of variants) {
        const sampleResults = [];
        for (let sampleIndex = 0; sampleIndex < options.chanceSamples; sampleIndex += 1) {
          stats.chanceSamplesEvaluated += 1;
          const transition = strictTransition(entry, options, context, sampleIndex, variant);
          if (!transition.ok) continue;
          const terminal = (transition.events || []).find((event) => event.eventType === "terminal") || null;
          const child = visit(
            transition.nextState,
            depth - 1,
            alpha,
            beta,
            terminal?.winnerSideKey || "",
          );
          sampleResults.push({
            value: child.value,
            child,
            eventTypes: (transition.events || []).map((event) => event.eventType),
          });
        }
        if (!sampleResults.length) continue;
        variantResults.push({
          variantKey: variant.variantKey,
          requirementCount: variant.requirements.length,
          ownerSideKey: variant.requirements[0]?.ownerSideKey || "",
          value: round(average(sampleResults.map((sample) => sample.value))),
          representative: sampleResults.sort((left, right) => Math.abs(left.value - average(sampleResults.map((sample) => sample.value))) - Math.abs(right.value - average(sampleResults.map((sample) => sample.value))))[0],
        });
      }
      if (!variantResults.length) continue;
      const reactionOwnerSideKey = variantResults[0].ownerSideKey;
      const selectedVariant = variantResults.sort((left, right) => {
        if (reactionOwnerSideKey === options.perspectiveSideKey) return right.value - left.value;
        if (reactionOwnerSideKey) return left.value - right.value;
        return 0;
      })[0];
      const result = {
        value: selectedVariant.value,
        action: actionSummary(entry.action),
        reactionVariant: selectedVariant.variantKey,
        reactionRequirementCount: selectedVariant.requirementCount,
        eventTypes: selectedVariant.representative.eventTypes,
        principalVariation: [
          {
            sideKey: nodeState.activeSideKey,
            phaseKey: nodeState.phaseKey,
            ...actionSummary(entry.action),
            reactionVariant: selectedVariant.variantKey,
            eventTypes: selectedVariant.representative.eventTypes,
            expectedValue: selectedVariant.value,
          },
          ...selectedVariant.representative.child.principalVariation,
        ],
        evaluation: selectedVariant.representative.child.evaluation,
        complete: variantResults.every((variant) => variant.representative.child.complete),
      };
      rankedActions.push(result);
      if (!best || (maximizing ? result.value > best.value : result.value < best.value)) best = result;
      if (maximizing) alpha = Math.max(alpha, best.value);
      else beta = Math.min(beta, best.value);
      if (beta <= alpha) {
        stats.alphaBetaPrunes += entries.length - rankedActions.length;
        pruned = true;
        break;
      }
    }
    if (!best) {
      const evaluation = evaluateLeaf(nodeState, terminalWinnerSideKey);
      return { value: evaluation.score, evaluation, principalVariation: [], complete: false };
    }
    const nodeResult = {
      value: best.value,
      evaluation: best.evaluation,
      principalVariation: best.principalVariation,
      complete: best.complete,
      rankedActions: rankedActions
        .sort((left, right) => maximizing ? right.value - left.value : left.value - right.value)
        .map((entry) => ({
          ...entry.action,
          value: entry.value,
          reactionVariant: entry.reactionVariant,
          reactionRequirementCount: entry.reactionRequirementCount,
        })),
    };
    if (nodeResult.complete) context.transposition.set(transpositionKey, nodeResult);
    return nodeResult;
  };

  const startedAt = Date.now();
  const baseline = evaluateSearchState(state, options);
  const root = visit(state, options.maxDepth, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
  const boundedBy = [];
  if (options.maxDepth > 0) boundedBy.push("primitive_action_depth");
  if (options.maxNodes > 0) boundedBy.push("node_budget");
  if (options.chanceSamples > 0) boundedBy.push("finite_strict_rng_samples");
  if (options.actionLimit > 0) boundedBy.push("per_node_action_limit");
  if (options.activationGroupLimit > 0) boundedBy.push("activation_group_limit");
  if (typeof options.actionFilter === "function") boundedBy.push("caller_action_filter");
  return {
    schemaVersion: WARMACHINE_MATCHUP_SEARCH_SCHEMA,
    algorithm: "strict_expectiminimax_alpha_beta_v1",
    searchPerformed: true,
    perspectiveSideKey: options.perspectiveSideKey,
    rootStateFingerprint: stateFingerprint(state),
    baselineEvaluation: baseline,
    expectedStateAdvantage: root.value,
    expectedAdvantageDelta: round(root.value - baseline.score),
    principalVariation: root.principalVariation,
    rankedRootActions: root.rankedActions || [],
    stats,
    limits: {
      maxDepth: options.maxDepth,
      maxNodes: options.maxNodes,
      chanceSamples: options.chanceSamples,
      actionLimit: options.actionLimit,
      activationGroupLimit: options.activationGroupLimit,
      actionSelectionMode: options.actionSelectionMode,
      activationGroupSelectionMode: options.activationGroupSelectionMode,
      enumerationCacheLimit: options.enumerationCacheLimit,
      traceDetail: options.traceDetail,
      strictRejectionAuditLimit: options.strictRejectionAuditLimit,
      representativeUnitGroupScope: options.representativeUnitGroupScope,
      actionScoreLabel: options.actionScoreLabel,
      activationGroupScoreLabel: options.activationGroupScoreLabel,
      stateEvaluatorLabel: options.stateEvaluatorLabel,
      boundedBy,
    },
    pruningAudit: cloneJson(context.pruningAudit),
    strictRejectionAudit: cloneJson(context.strictRejectionAudit),
    strictExecution: {
      legalSource: "enumerateRulesV1Actions",
      transitionAuthority: "applyRulesV1Action",
      rngMaterializer: "buildWarmachineRulesV1ActionWithStrictRngOutcome",
      opponentReactionSource: "strictOpponentReactionRequirementsForAction",
      acceptedTransitions: stats.strictTransitionsAccepted,
      rejectedTransitions: stats.strictTransitionsRejected,
    },
    boundedTreeComplete: root.complete && stats.budgetCutoffs === 0,
    globalOptimalityProven: false,
    globalOptimalityReason: "Warmachine dice are represented by finite deterministic samples and the search has a finite primitive-action horizon; only the reported bounded tree is evaluated.",
    reactionCoverage: "take-all and decline-all opponent reaction branches; mixed optional reactions and alternate reaction destinations remain a later expansion",
    elapsedMs: Date.now() - startedAt,
  };
}

function beamStats() {
  return {
    expandedNodes: 0,
    leafEvaluations: 0,
    enumerationCalls: 0,
    enumerationCacheHits: 0,
    enumerationCacheEvictions: 0,
    transpositionHits: 0,
    legalActionsObserved: 0,
    rejectedActionsObserved: 0,
    actionsPrunedByLimit: 0,
    alphaBetaPrunes: 0,
    strictTransitionAttempts: 0,
    strictTransitionsAccepted: 0,
    strictTransitionsRejected: 0,
    chanceSamplesEvaluated: 0,
    budgetCutoffs: 0,
    actionBudgetCutoffs: 0,
    primitiveActionBudgetCutoffs: 0,
    freeBookkeepingActionsSelected: 0,
    bookkeepingContinuationDrains: 0,
    bookkeepingDrainLimitStops: 0,
    maxActionBudgetSpent: 0,
    maxPrimitiveActionCount: 0,
    beamLayers: 0,
    beamBranchesGenerated: 0,
    beamBranchesPruned: 0,
    maxBeamFrontier: 0,
    commutativeContinuationCollapses: 0,
    commutativeContinuationAlternativesCollapsed: 0,
    representativeUnitGroupScopesUsed: 0,
    representativeUnitGroupActorKeysSuppressed: 0,
    incompleteActivationLeaves: 0,
    activationBoundaryLeaves: 0,
    actionFamilyObservedCounts: {},
    actionFamilySelectedCounts: {},
    activationGroupFamilyObservedCounts: {},
    activationGroupFamilySelectedCounts: {},
  };
}

function transitionCompletesActivation(events = []) {
  return events.some((event) => event.eventType === "activation_complete" || event.eventType === "unit_group_activation_complete");
}

function beamActionOutcome(entry, options, context) {
  const variants = reactionVariants(entry.action, entry.enumeration);
  const variantResults = [];
  for (const variant of variants) {
    const samples = [];
    for (let sampleIndex = 0; sampleIndex < options.chanceSamples; sampleIndex += 1) {
      if (context.stats.strictTransitionAttempts >= options.maxTransitionAttempts) {
        context.stats.budgetCutoffs += 1;
        break;
      }
      context.stats.chanceSamplesEvaluated += 1;
      const transition = strictTransition(entry, options, context, sampleIndex, variant);
      if (!transition.ok) continue;
      const terminal = (transition.events || []).find((event) => event.eventType === "terminal") || null;
      const evaluation = evaluateSearchState(
        transition.nextState,
        options,
        terminal?.winnerSideKey || "",
      );
      context.stats.leafEvaluations += 1;
      samples.push({
        transition,
        evaluation,
        value: evaluation.score,
        terminalWinnerSideKey: terminal?.winnerSideKey || "",
      });
    }
    if (!samples.length) continue;
    const mean = average(samples.map((sample) => sample.value));
    const downside = Math.min(...samples.map((sample) => sample.value));
    const riskAdjusted = mean * (1 - options.downsideWeight) + downside * options.downsideWeight;
    const representative = samples
      .sort((left, right) => Math.abs(left.value - riskAdjusted) - Math.abs(right.value - riskAdjusted))[0];
    variantResults.push({
      variantKey: variant.variantKey,
      requirements: variant.requirements,
      ownerSideKey: variant.requirements[0]?.ownerSideKey || "",
      meanValue: round(mean),
      downsideValue: round(downside),
      riskAdjustedValue: round(riskAdjusted),
      representative,
    });
  }
  if (!variantResults.length) return null;
  const reactionOwnerSideKey = variantResults[0].ownerSideKey;
  variantResults.sort((left, right) => {
    if (reactionOwnerSideKey === options.perspectiveSideKey) return right.riskAdjustedValue - left.riskAdjustedValue;
    if (reactionOwnerSideKey) return left.riskAdjustedValue - right.riskAdjustedValue;
    return 0;
  });
  return variantResults[0];
}

function beamBranchSummary(branch = {}, options = {}) {
  const pv = branch.principalVariation || [];
  const limit = Math.max(0, Math.floor(numeric(options.branchSummaryStepLimit, options.traceDetail === "compact" ? 6 : pv.length)));
  const summary = {
    branchId: branch.branchId,
    utility: branch.utility,
    terminalWinnerSideKey: branch.terminalWinnerSideKey || "",
    turnComplete: branch.turnComplete === true,
    activationHorizonReached: branch.activationHorizonReached === true,
    completedActivationCount: numeric(branch.completedActivationCount, 0),
    stopReason: branch.stopReason || "",
    stateFingerprint: stateFingerprint(branch.state),
    principalVariationLength: pv.length,
  };
  if (options.traceDetail === "compact") {
    summary.principalVariationHead = cloneJson(pv.slice(0, limit));
    summary.principalVariationTail = cloneJson(pv.slice(Math.max(limit, pv.length - limit)));
  } else {
    summary.principalVariation = cloneJson(pv);
  }
  return summary;
}

function visualStateSnapshot(state = {}) {
  return {
    stateFingerprint: stateFingerprint(state),
    activeSideKey: state.activeSideKey,
    phaseKey: state.phaseKey,
    turnNumber: state.turnNumber,
    board: cloneJson(state.board || {}),
    terrain: cloneJson(state.terrain || []),
    scenario: cloneJson(state.scenario || {}),
    pieces: (state.pieces || []).map((piece) => ({
      pieceKey: piece.pieceKey,
      label: piece.label,
      sideKey: piece.sideKey,
      position: cloneJson(piece.position || {}),
      baseSizeIn: piece.baseSizeIn,
      boxesRemaining: piece.boxesRemaining,
      maxBoxes: piece.maxBoxes,
      destroyed: piece.destroyed === true,
      removedFromPlay: piece.removedFromPlay === true,
      activated: piece.activated === true,
      resourceKind: piece.resourceKind || "",
      resourcePoints: piece.resourcePoints,
      furyPoints: piece.furyPoints,
      focusPoints: piece.focusPoints,
      unitGroupId: piece.unitGroupId || "",
      rosterEntryId: piece.rosterEntryId || "",
    })),
  };
}

function expandStrictTurnBeam(initialBranches, turnSideKey, options, context) {
  const maximizing = turnSideKey === options.perspectiveSideKey;
  let frontier = initialBranches.map((branch) => ({
    ...branch,
    turnComplete: false,
    activationHorizonReached: false,
    completedActivationCount: numeric(branch.completedActivationCount, 0),
    actionBudgetSpent: 0,
    primitiveActionCount: 0,
  }));
  const completed = [];
  for (let layer = 0; layer < options.maxPrimitiveActionsPerTurn && frontier.length; layer += 1) {
    context.stats.beamLayers += 1;
    context.stats.maxBeamFrontier = Math.max(context.stats.maxBeamFrontier, frontier.length);
    const generated = [];
    for (const branch of frontier) {
      if (branch.terminalWinnerSideKey || branch.state.activeSideKey !== turnSideKey) {
        completed.push({ ...branch, turnComplete: true, stopReason: branch.terminalWinnerSideKey ? "terminal" : "active_side_changed" });
        continue;
      }
      if (numeric(branch.actionBudgetSpent, 0) >= options.maxActionsPerTurn) {
        completed.push({ ...branch, turnComplete: false, stopReason: "action_budget_reached" });
        if (options.activationHorizon > 0 && runtimeWindowActive(branch.state)) context.stats.incompleteActivationLeaves += 1;
        context.stats.actionBudgetCutoffs += 1;
        context.stats.budgetCutoffs += 1;
        continue;
      }
      if (context.stats.strictTransitionAttempts >= options.maxTransitionAttempts) {
        completed.push({ ...branch, turnComplete: false, stopReason: "transition_budget_reached" });
        if (options.activationHorizon > 0 && runtimeWindowActive(branch.state)) context.stats.incompleteActivationLeaves += 1;
        context.stats.budgetCutoffs += 1;
        continue;
      }
      context.stats.expandedNodes += 1;
      const entries = enumerateSearchActions(branch.state, options, context, {
        isRootAction: (branch.principalVariation || []).length === 0,
      });
      if (!entries.length) {
        completed.push({ ...branch, turnComplete: false, stopReason: "no_legal_actions" });
        if (options.activationHorizon > 0 && runtimeWindowActive(branch.state)) context.stats.incompleteActivationLeaves += 1;
        continue;
      }
      for (const entry of entries) {
        const outcome = beamActionOutcome(entry, options, context);
        if (!outcome) continue;
        const transition = outcome.representative.transition;
        const childState = transition.nextState;
        const activationBoundaryReached = transitionCompletesActivation(transition.events || []);
        const completedActivationCount = numeric(branch.completedActivationCount, 0) + (activationBoundaryReached ? 1 : 0);
        const activationHorizonReached = options.activationHorizon > 0 && completedActivationCount >= options.activationHorizon;
        const actionBudgetCost = searchActionBudgetCost(entry.action, options);
        const actionBudgetSpent = numeric(branch.actionBudgetSpent, 0) + actionBudgetCost;
        const primitiveActionCount = numeric(branch.primitiveActionCount, 0) + 1;
        const actionBudgetReached = actionBudgetSpent >= options.maxActionsPerTurn;
        if (actionBudgetCost === 0) context.stats.freeBookkeepingActionsSelected += 1;
        context.stats.maxActionBudgetSpent = Math.max(context.stats.maxActionBudgetSpent, actionBudgetSpent);
        context.stats.maxPrimitiveActionCount = Math.max(context.stats.maxPrimitiveActionCount, primitiveActionCount);
        const step = searchStepFromTransition({
          branch,
          entry,
          outcome,
          transition,
          childState,
          activationBoundaryReached,
          completedActivationCount,
          actionBudgetCost,
          actionBudgetSpent,
          primitiveActionCount,
        }, options);
        const nextBranch = {
          branchId: `${branch.branchId}.${layer + 1}.${generated.length + 1}`,
          rootBranchId: branch.rootBranchId || branch.branchId,
          state: childState,
          utility: outcome.riskAdjustedValue,
          terminalWinnerSideKey: outcome.representative.terminalWinnerSideKey,
          principalVariation: [...(branch.principalVariation || []), step],
          turnComplete: childState.activeSideKey !== turnSideKey || Boolean(outcome.representative.terminalWinnerSideKey),
          activationHorizonReached,
          completedActivationCount,
          actionBudgetSpent,
          primitiveActionCount,
          actionBudgetReached,
          stopReason: "",
        };
        generated.push(drainBookkeepingContinuations(nextBranch, options, context));
      }
    }
    context.stats.beamBranchesGenerated += generated.length;
    const stopped = generated.filter((branch) =>
      branch.turnComplete || branch.activationHorizonReached || branch.actionBudgetReached || branch.primitiveActionBudgetReached);
    completed.push(...stopped.map((branch) => ({
      ...branch,
      stopReason: branch.terminalWinnerSideKey
        ? "terminal"
        : branch.turnComplete
          ? "active_side_changed"
          : branch.activationHorizonReached
            ? "activation_horizon_reached"
            : branch.actionBudgetReached
              ? "action_budget_reached"
              : "max_primitive_actions_per_turn_reached",
    })));
    context.stats.activationBoundaryLeaves += stopped.filter((branch) => branch.activationHorizonReached).length;
    const actionBudgetCutoffCount = stopped.filter((branch) => branch.actionBudgetReached && !branch.turnComplete && !branch.activationHorizonReached).length;
    context.stats.actionBudgetCutoffs += actionBudgetCutoffCount;
    context.stats.budgetCutoffs += actionBudgetCutoffCount;
    context.stats.primitiveActionBudgetCutoffs += stopped.filter((branch) => branch.primitiveActionBudgetReached).length;
    context.stats.budgetCutoffs += stopped.filter((branch) => branch.primitiveActionBudgetReached).length;
    const continuing = generated.filter((branch) =>
      !branch.turnComplete && !branch.activationHorizonReached && !branch.actionBudgetReached && !branch.primitiveActionBudgetReached);
    const deduped = Array.from(continuing.reduce((map, branch) => {
      const key = stateFingerprint(branch.state);
      const current = map.get(key);
      if (!current || (maximizing ? branch.utility > current.utility : branch.utility < current.utility)) map.set(key, branch);
      return map;
    }, new Map()).values());
    deduped.sort((left, right) => maximizing ? right.utility - left.utility : left.utility - right.utility);
    context.stats.beamBranchesPruned += Math.max(0, deduped.length - options.beamWidth);
    frontier = deduped.slice(0, options.beamWidth);
    if (typeof options.onProgress === "function") {
      options.onProgress({
        turnSideKey,
        layer: layer + 1,
        frontierCount: frontier.length,
        completedCount: completed.length,
        generatedCount: generated.length,
        strictTransitionAttempts: context.stats.strictTransitionAttempts,
        strictTransitionsRejected: context.stats.strictTransitionsRejected,
        enumerationCalls: context.stats.enumerationCalls,
      });
    }
  }
  if (frontier.length) {
    if (options.activationHorizon > 0) {
      context.stats.incompleteActivationLeaves += frontier.filter((branch) => runtimeWindowActive(branch.state)).length;
    }
    context.stats.primitiveActionBudgetCutoffs += frontier.length;
    context.stats.budgetCutoffs += frontier.length;
    completed.push(...frontier.map((branch) => ({
      ...branch,
      turnComplete: false,
      stopReason: "max_primitive_actions_per_turn_reached",
    })));
  }
  completed.sort((left, right) => maximizing ? right.utility - left.utility : left.utility - right.utility);
  return completed;
}

export function searchWarmachineStrictTurnExchangeBeam(inputState, rawOptions = {}) {
  const state = strictState(inputState);
  const options = {
    perspectiveSideKey: String(rawOptions.perspectiveSideKey || state.activeSideKey || "player1"),
    beamWidth: Math.max(1, Math.floor(numeric(rawOptions.beamWidth, 3))),
    maxRootBranchesForReply: Math.max(1, Math.floor(numeric(rawOptions.maxRootBranchesForReply, rawOptions.beamWidth || 3))),
    maxActionsPerTurn: Math.max(1, Math.floor(numeric(rawOptions.maxActionsPerTurn, 48))),
    maxPrimitiveActionsPerTurn: Math.max(1, Math.floor(numeric(
      rawOptions.maxPrimitiveActionsPerTurn,
      numeric(rawOptions.maxActionsPerTurn, 48),
    ))),
    maxTransitionAttempts: Math.max(1, Math.floor(numeric(rawOptions.maxTransitionAttempts, 5_000))),
    chanceSamples: Math.max(1, Math.floor(numeric(rawOptions.chanceSamples, 1))),
    downsideWeight: Math.max(0, Math.min(1, numeric(rawOptions.downsideWeight, 0.2))),
    actionLimit: Math.max(0, Math.floor(numeric(rawOptions.actionLimit, 4))),
    activationGroupLimit: Math.max(0, Math.floor(numeric(rawOptions.activationGroupLimit, 2))),
    actionSelectionMode: String(rawOptions.actionSelectionMode || "score"),
    activationGroupSelectionMode: String(rawOptions.activationGroupSelectionMode || "score"),
    activationHorizon: Math.max(0, Math.floor(numeric(rawOptions.activationHorizon, 0))),
    pruningAuditLimit: Math.max(0, Math.floor(numeric(rawOptions.pruningAuditLimit, 100))),
    strictRejectionAuditLimit: Math.max(0, Math.floor(numeric(rawOptions.strictRejectionAuditLimit, 32))),
    rootActivationGroupKey: String(rawOptions.rootActivationGroupKey || ""),
    rootActionKey: String(rawOptions.rootActionKey || ""),
    traceDetail: traceDetailMode(rawOptions.traceDetail),
    enumerationCacheLimit: Math.max(0, Math.floor(numeric(rawOptions.enumerationCacheLimit, 128))),
    branchSummaryStepLimit: Math.max(0, Math.floor(numeric(rawOptions.branchSummaryStepLimit, 6))),
    freeBookkeepingActionBudget: optionFlag(rawOptions.freeBookkeepingActionBudget),
    bookkeepingDrainLimitPerAction: Math.max(1, Math.floor(numeric(rawOptions.bookkeepingDrainLimitPerAction, 8))),
    representativeUnitGroupScope: optionFlag(rawOptions.representativeUnitGroupScope),
    actionFilter: rawOptions.actionFilter,
    actionScore: rawOptions.actionScore,
    activationGroupScore: rawOptions.activationGroupScore,
    stateEvaluator: rawOptions.stateEvaluator,
    actionScoreLabel: String(rawOptions.actionScoreLabel || "default_action_ordering"),
    activationGroupScoreLabel: String(rawOptions.activationGroupScoreLabel || "default_activation_group_priority"),
    stateEvaluatorLabel: String(rawOptions.stateEvaluatorLabel || "default_matchup_state_evaluation"),
    includeFinalState: optionFlag(rawOptions.includeFinalState),
    searchSeed: String(rawOptions.searchSeed || "warmachine-turn-exchange-beam-v1"),
    onProgress: rawOptions.onProgress,
  };
  const stats = beamStats();
  const context = {
    stats,
    enumerationCache: new Map(),
    transposition: new Map(),
    pruningAudit: [],
    strictRejectionAudit: [],
  };
  const startedAt = Date.now();
  const baseline = evaluateSearchState(state, options);
  const rootTurnSideKey = state.activeSideKey;
  const rootBranches = expandStrictTurnBeam([{
    branchId: "root",
    rootBranchId: "root",
    state,
    utility: baseline.score,
    terminalWinnerSideKey: "",
    principalVariation: [],
    completedActivationCount: 0,
  }], rootTurnSideKey, options, context);
  const activationMode = options.activationHorizon > 0;
  const completeRootBranches = rootBranches
    .filter((branch) => activationMode ? branch.activationHorizonReached : branch.turnComplete)
    .slice(0, options.maxRootBranchesForReply);
  const replyResults = [];
  for (const rootBranch of activationMode ? [] : completeRootBranches) {
    if (rootBranch.terminalWinnerSideKey) {
      replyResults.push({ rootBranch, worstReply: rootBranch, replyBranches: [rootBranch] });
      continue;
    }
    const replySideKey = rootBranch.state.activeSideKey;
    const replyBranches = expandStrictTurnBeam([{
      ...rootBranch,
      branchId: `${rootBranch.branchId}.reply`,
      principalVariation: rootBranch.principalVariation,
      turnComplete: false,
    }], replySideKey, options, context);
    const completeReplies = replyBranches.filter((branch) => branch.turnComplete);
    const candidates = completeReplies.length ? completeReplies : replyBranches;
    candidates.sort((left, right) =>
      replySideKey === options.perspectiveSideKey ? right.utility - left.utility : left.utility - right.utility);
    replyResults.push({ rootBranch, worstReply: candidates[0], replyBranches: candidates });
  }
  const rootMaximizing = rootTurnSideKey === options.perspectiveSideKey;
  replyResults.sort((left, right) => rootMaximizing
    ? right.worstReply.utility - left.worstReply.utility
    : left.worstReply.utility - right.worstReply.utility);
  const selected = replyResults[0] || null;
  const selectedActivation = activationMode ? completeRootBranches[0] || null : null;
  const fallback = rootBranches[0] || null;
  const finalBranch = selectedActivation || selected?.worstReply || fallback;
  const expectedStateAdvantage = numeric(finalBranch?.utility, baseline.score);
  return {
    schemaVersion: WARMACHINE_MATCHUP_SEARCH_SCHEMA,
    algorithm: activationMode ? "strict_activation_boundary_beam_v1" : "strict_two_turn_adversarial_beam_v1",
    searchPerformed: true,
    perspectiveSideKey: options.perspectiveSideKey,
    rootTurnSideKey,
    rootStateFingerprint: stateFingerprint(state),
    initialStateSnapshot: visualStateSnapshot(state),
    baselineEvaluation: baseline,
    expectedStateAdvantage,
    expectedAdvantageDelta: round(expectedStateAdvantage - baseline.score),
    principalVariation: cloneJson(finalBranch?.principalVariation || []),
    finalStateSnapshot: finalBranch?.state ? visualStateSnapshot(finalBranch.state) : null,
    finalState: options.includeFinalState && finalBranch?.state ? cloneJson(finalBranch.state) : undefined,
    rootTurnBranches: rootBranches.slice(0, options.beamWidth).map((branch) => beamBranchSummary(branch, options)),
    adversarialReplyByRootBranch: replyResults.map((result) => ({
      rootBranch: beamBranchSummary(result.rootBranch, options),
      worstReply: beamBranchSummary(result.worstReply, options),
      replyBranchCount: result.replyBranches.length,
    })),
    stats,
    pruningAudit: cloneJson(context.pruningAudit),
    strictRejectionAudit: cloneJson(context.strictRejectionAudit),
    limits: {
      beamWidth: options.beamWidth,
      maxRootBranchesForReply: options.maxRootBranchesForReply,
      maxActionsPerTurn: options.maxActionsPerTurn,
      maxPrimitiveActionsPerTurn: options.maxPrimitiveActionsPerTurn,
      maxTransitionAttempts: options.maxTransitionAttempts,
      chanceSamples: options.chanceSamples,
      downsideWeight: options.downsideWeight,
      actionLimit: options.actionLimit,
      activationGroupLimit: options.activationGroupLimit,
      actionSelectionMode: options.actionSelectionMode,
      activationGroupSelectionMode: options.activationGroupSelectionMode,
      activationHorizon: options.activationHorizon,
      rootActivationGroupKey: options.rootActivationGroupKey,
      rootActionKey: options.rootActionKey,
      traceDetail: options.traceDetail,
      enumerationCacheLimit: options.enumerationCacheLimit,
      branchSummaryStepLimit: options.branchSummaryStepLimit,
      strictRejectionAuditLimit: options.strictRejectionAuditLimit,
      freeBookkeepingActionBudget: options.freeBookkeepingActionBudget,
      bookkeepingDrainLimitPerAction: options.bookkeepingDrainLimitPerAction,
      representativeUnitGroupScope: options.representativeUnitGroupScope,
      actionScoreLabel: options.actionScoreLabel,
      activationGroupScoreLabel: options.activationGroupScoreLabel,
      stateEvaluatorLabel: options.stateEvaluatorLabel,
      includeFinalState: options.includeFinalState,
    },
    strictExecution: {
      legalSource: "enumerateRulesV1Actions",
      transitionAuthority: "applyRulesV1Action",
      rngMaterializer: "buildWarmachineRulesV1ActionWithStrictRngOutcome",
      opponentReactionSource: "strictOpponentReactionRequirementsForAction",
      acceptedTransitions: stats.strictTransitionsAccepted,
      rejectedTransitions: stats.strictTransitionsRejected,
    },
    rootActivationCompleted: Boolean(selectedActivation?.activationHorizonReached),
    completedActivationCount: numeric(finalBranch?.completedActivationCount, 0),
    incompleteActivationLeafCount: stats.incompleteActivationLeaves,
    rootTurnCompleted: Boolean(finalBranch?.turnComplete && !activationMode),
    opponentReplyCompleted: Boolean(selected?.worstReply?.turnComplete),
    boundedTreeComplete: stats.budgetCutoffs === 0 && stats.incompleteActivationLeaves === 0 && (activationMode
      ? Boolean(selectedActivation?.activationHorizonReached)
      : Boolean(selected?.worstReply?.turnComplete)),
    globalOptimalityProven: false,
    globalOptimalityReason: activationMode
      ? "The search stops at a completed activation boundary and uses finite activation-group, action-family, beam, transition, and RNG budgets; it is a screening result, not a turn or global proof."
      : "Beam width, activation-group widening, action limits, finite strict RNG samples, and a two-turn horizon make this an auditable bounded approximation, not a global proof.",
    chanceModel: "Each action is evaluated over finite strict RNG samples; the representative state nearest the risk-adjusted sample utility continues through the beam.",
    elapsedMs: Date.now() - startedAt,
  };
}
