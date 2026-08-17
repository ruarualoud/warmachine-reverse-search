import {
  enumerateWarmachineBenchmarkActionsV2,
  executeScopedWarmachineBenchmarkActionV2,
} from
  "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { normalizeRulesV1State, warmachineHost } from "../warmachine-host-runtime.mjs";
import { expandWarmachineStrictPolicyStepV1 } from
  "../search/strict-policy-step-v1.mjs";
import { buildWarmachineReverseReachabilityCandidateSetV2 } from
  "./reachability-contract-v2.mjs";
import { warmachinePieceInPlayV1 } from "./piece-lifecycle-v1.mjs";
import { restoreWarmachineScenarioSettlementPreimageV1 } from
  "./scenario-settlement-preimage-v1.mjs";
import { WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA } from
  "./terminal-hypothesis-v1.mjs";

export const WARMACHINE_TERMINAL_EVENT_PREDECESSOR_V1_SCHEMA =
  "warmachine_terminal_event_predecessor_v1";

function gcd(left, right) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

function rational(numerator = 0n, denominator = 1n) {
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function add(left, right) {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function probabilityRecord(value) {
  return {
    numerator: String(value.numerator),
    denominator: String(value.denominator),
    decimal: Number(value.numerator) / Number(value.denominator),
  };
}

function semanticProjection(value, key = "") {
  if (Array.isArray(value)) {
    const projected = value.map((entry) => semanticProjection(entry));
    if (key === "terrain") {
      return projected.sort((left, right) =>
        String(left?.terrainKey || "").localeCompare(String(right?.terrainKey || "")));
    }
    return projected;
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([childKey]) => childKey !== "stateKey")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([childKey, child]) => [childKey, semanticProjection(child, childKey || key)]));
}

export function warmachineReverseStateSemanticHashV1(stateInput = {}) {
  return stableGraphHash(semanticProjection(normalizeRulesV1State(stateInput)));
}

function restoreLeaderTarget(targetInput = {}, boxesRemaining = 1) {
  const target = structuredClone(targetInput);
  target.destroyed = false;
  target.destroyedTriggerOccurred = false;
  target.removedFromPlay = false;
  if ("removed_from_play" in target) target.removed_from_play = false;
  target.offTable = false;
  target.notDeployed = false;
  target.disabled = false;
  target.boxed = false;
  target.damageLifecycleStage = "";
  for (const statusTag of [
    "disabled",
    "boxed",
    "destroyed",
    "removed_from_play",
    "off_table",
    "not_deployed",
  ]) {
    removeStatusTag(target, statusTag);
  }
  target.damage = {
    ...(target.damage || {}),
    boxesRemaining,
  };
  if ("boxesRemaining" in target) target.boxesRemaining = boxesRemaining;
  return target;
}

function restoreActorBeforeTerminalAction(actorInput = {}, resourceRefund = 0) {
  const actor = structuredClone(actorInput);
  actor.activated = false;
  actor.activationKey = "";
  if (resourceRefund > 0) {
    const maximum = Math.max(
      Number(actor.resourceMax || 0),
      Number(actor.resource2Max || 0),
      Number(actor.focusMax || 0),
      Number(actor.furyMax || 0),
    );
    setPieceResourcePoints(
      actor,
      Math.min(maximum, Number(actor.resourcePoints || 0) + resourceRefund),
    );
    if (String(actor.resourceKind || "").toLowerCase() === "focus") {
      const spentAfter = Math.max(0, Number(
        actor.focusSpentThisActivation ?? actor.metadata?.focusSpentThisActivation ?? 0,
      ));
      const spentBefore = Math.max(0, spentAfter - resourceRefund);
      if (spentBefore > 0) {
        actor.focusSpentThisActivation = spentBefore;
      } else {
        delete actor.focusSpentThisActivation;
      }
      if (actor.metadata && typeof actor.metadata === "object") {
        actor.metadata = { ...actor.metadata };
        if (spentBefore > 0) {
          actor.metadata.focusSpentThisActivation = spentBefore;
        } else {
          delete actor.metadata.focusSpentThisActivation;
        }
      }
    }
  }
  return actor;
}

function removeStatusTag(piece = {}, tag = "") {
  piece.statusTags = (piece.statusTags || []).filter((value) => value !== tag);
  if (Array.isArray(piece.statusEffects)) {
    piece.statusEffects = piece.statusEffects.filter((value) =>
      String(value?.statusKey || value?.tag || value || "") !== tag);
  }
}

function setPieceResourcePoints(piece = {}, points = 0) {
  const value = Math.max(0, Number(points || 0));
  piece.resourcePoints = value;
  piece.resource2 = value;
  if (String(piece.resourceKind || "") === "focus" || "focus" in piece) piece.focus = value;
  if (String(piece.resourceKind || "") === "fury" || "fury" in piece) piece.fury = value;
}

function restoreControllerDestructionSideEffects(state = {}, target = {}, rawOptions = {}) {
  const controlled = (state.pieces || []).filter((piece) =>
    piece.pieceKey !== target.pieceKey && piece.controllerPieceKey === target.pieceKey);
  const targetIsWarlock = target.isWarlock === true ||
    /warlock/i.test(`${target.modelRole || ""} ${target.modelType || ""}`);
  const targetIsWarcaster = target.isWarcaster === true ||
    /warcaster/i.test(`${target.modelRole || ""} ${target.modelType || ""}`);
  const restored = [];
  const resourcePointsByPieceKey = rawOptions.controllerDestructionResourcePointsByPieceKey || {};
  const statusPreimageByPieceKey =
    rawOptions.controllerDestructionStatusPreimageByPieceKey || {};
  for (const piece of controlled) {
    const statusTag = targetIsWarlock && String(piece.resourceKind || "") === "fury"
      ? "wild"
      : targetIsWarcaster && String(piece.resourceKind || "") === "focus"
        ? "inert"
        : "";
    if (!statusTag || !(piece.statusTags || []).includes(statusTag)) continue;
    const statusPreimage = statusPreimageByPieceKey[piece.pieceKey] || null;
    const statusWasPresentBefore = statusPreimage &&
      Object.hasOwn(statusPreimage, statusTag)
      ? statusPreimage[statusTag] === true
      : null;
    if (statusWasPresentBefore !== true) removeStatusTag(piece, statusTag);
    const restoredResourcePoints = Number(resourcePointsByPieceKey[piece.pieceKey] ?? 0);
    setPieceResourcePoints(piece, restoredResourcePoints);
    restored.push({
      pieceKey: piece.pieceKey,
      removedStatusTag: statusTag,
      statusWasPresentBefore,
      restoredResourcePoints,
    });
  }
  const explicitlyBoundResourcePreimage = restored.every((row) =>
    Object.hasOwn(resourcePointsByPieceKey, row.pieceKey));
  const explicitlyBoundStatusPreimage = restored.every((row) =>
    row.statusWasPresentBefore !== null);
  const upkeepPreimage = rawOptions
    .controllerDestructionUpkeepPreimageByControllerPieceKey?.[target.pieceKey] || null;
  const explicitlyBoundUpkeepPreimage = upkeepPreimage?.mode === "none_active";
  if (explicitlyBoundUpkeepPreimage) {
    if ("activeUpkeeps" in target) target.activeUpkeeps = [];
    if ("upkeepSpells" in target) target.upkeepSpells = [];
  }
  return stableGraphValue({
    controllerPieceKey: target.pieceKey || "",
    restored,
    explicitlyBoundResourcePreimage,
    explicitlyBoundStatusPreimage,
    explicitlyBoundUpkeepPreimage,
    upkeepPreimage: upkeepPreimage ? stableGraphValue(upkeepPreimage) : null,
    unresolvedReasons: restored.length ? [
      ...(!explicitlyBoundResourcePreimage
        ? ["terminal_controller_destruction_resource_preimage_deferred"]
        : []),
      ...(!explicitlyBoundStatusPreimage
        ? ["terminal_controller_destruction_preexisting_status_preimage_deferred"]
        : []),
      ...(!explicitlyBoundUpkeepPreimage
        ? ["terminal_controller_destruction_upkeep_preimage_deferred"]
        : []),
    ] : [],
  });
}

function clearTerminalAttackSuccessorWindows(state = {}, actorPieceKey = "") {
  const clearedWindowKeys = [];
  for (const key of [
    "initialAttackWindow",
    "combatPurchaseWindow",
    "repositionWindow",
    "anyTimeActivationWindow",
  ]) {
    const window = state[key];
    if (!window) continue;
    const windowActorPieceKey = String(
      window.actorPieceKey || window.activationActorPieceKey || "",
    );
    if (windowActorPieceKey && windowActorPieceKey !== actorPieceKey) continue;
    clearedWindowKeys.push(key);
    state[key] = null;
  }
  return clearedWindowKeys;
}

function terminalEventMatches(events = [], cell = {}) {
  return events.some((event) => event.eventType === "terminal" &&
    event.winnerSideKey === cell.winnerSideKey &&
    (cell.goalType === "assassination"
      ? event.reason === "steamroller_2026_only_side_with_leader_models_remaining"
      : cell.goalType === "simultaneous_leader_tiebreak"
        ? event.reason === "steamroller_2026_simultaneous_leaders_tiebreak_resolved"
      : cell.goalType === "fixed_round_limit_result"
        ? event.reason === "scenario_round_limit_tiebreak"
        : event.reason === "steamroller_2026_lead_three_after_scoring_on_opponent_turn"));
}

function attackFamilyMatches(action = {}, cell = {}) {
  if (!action.metadata?.attackResolution || action.targetPieceKey !== cell.targetLeaderPieceKey) {
    return false;
  }
  const family = String(cell.causalActionFamily || "");
  const type = String(action.actionType || "");
  if (/melee/.test(family)) return /melee|charge|slam|headbutt|throw|trample/.test(type);
  if (/spell/.test(family)) return /spell/.test(type);
  if (/ranged/.test(family)) return /ranged/.test(type);
  return /attack|spell|charge|slam|headbutt|throw|trample/.test(type);
}

function candidateAssassinationPredecessorStates(successor, cell, rawOptions = {}) {
  const targetIndex = successor.pieces.findIndex((piece) =>
    piece.pieceKey === cell.targetLeaderPieceKey);
  const actorIndex = successor.pieces.findIndex((piece) => piece.pieceKey === cell.actorPieceKey);
  if (targetIndex < 0) throw new Error("terminal_predecessor_target_missing");
  if (actorIndex < 0) throw new Error("terminal_predecessor_actor_missing");
  const resourceRefunds = [...new Set((rawOptions.resourceRefunds || [0])
    .map(Number).filter((value) => Number.isInteger(value) && value >= 0))].sort((a, b) => a - b);
  const boxes = Math.max(1, Number(cell.targetBoxesBeforeFinal || 1));
  return resourceRefunds.map((resourceRefund) => {
    const state = structuredClone(successor);
    const clearedWindowKeys = clearTerminalAttackSuccessorWindows(
      state,
      cell.actorPieceKey,
    );
    state.pieces[targetIndex] = restoreLeaderTarget(state.pieces[targetIndex], boxes);
    const controllerDestructionRestoration = restoreControllerDestructionSideEffects(
      state,
      state.pieces[targetIndex],
      rawOptions,
    );
    state.pieces[actorIndex] = restoreActorBeforeTerminalAction(
      state.pieces[actorIndex],
      resourceRefund,
    );
    state.stateKey = `terminal-predecessor-${stableGraphHash({
      successorStateHash: warmachineReverseStateSemanticHashV1(successor),
      cellKey: cell.cellKey,
      resourceRefund,
      controllerDestructionRestoration,
    }, 24)}`;
    return {
      state: normalizeRulesV1State(state),
      mutation: {
        operatorKey: "assassination_terminal_attack_inverse_v1",
        targetPieceKey: cell.targetLeaderPieceKey,
        restoredBoxes: boxes,
        actorPieceKey: cell.actorPieceKey,
        resourceRefund,
        clearedTerminalAttackSuccessorWindowKeys: clearedWindowKeys,
        controllerDestructionRestoration,
        unresolvedReasons: controllerDestructionRestoration.unresolvedReasons,
      },
    };
  });
}

function alive(piece = {}) {
  return warmachinePieceInPlayV1(piece);
}

function scoreMap(raw = {}) {
  return Object.fromEntries(Object.entries(raw).map(([sideKey, value]) => [
    sideKey,
    Math.max(0, Number(value || 0)),
  ]).sort(([left], [right]) => left.localeCompare(right)));
}

function scoreMapsEqual(left = {}, right = {}) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.every((key) => Number(left[key] || 0) === Number(right[key] || 0));
}

function boundedStateDifferences(expected, observed, path = "state", rows = []) {
  if (rows.length >= 32 || Object.is(expected, observed)) return rows;
  if (Array.isArray(expected) && Array.isArray(observed)) {
    const length = Math.max(expected.length, observed.length);
    for (let index = 0; index < length && rows.length < 32; index += 1) {
      boundedStateDifferences(expected[index], observed[index], `${path}[${index}]`, rows);
    }
    return rows;
  }
  if (expected && observed && typeof expected === "object" && typeof observed === "object") {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(observed)])].sort();
    for (const key of keys) {
      if (key === "stateKey" || rows.length >= 32) continue;
      boundedStateDifferences(expected[key], observed[key], `${path}.${key}`, rows);
    }
    return rows;
  }
  rows.push(stableGraphValue({
    path,
    expected: expected === undefined ? null : expected,
    observed: observed === undefined ? null : observed,
  }));
  return rows;
}

function candidateTurnEndPredecessorStates(successor, cell, rawOptions = {}) {
  const endingSideKey = String(cell.endingSideKey || "");
  const nextSideKey = endingSideKey === "player1" ? "player2" : "player1";
  const scoreBefore = scoreMap(cell.scoreBeforeTerminalCell?.scoreBySide || {});
  const scoreGain = scoreMap(cell.terminalScoreGainCell?.scoreGainBySide || {});
  const expectedFinalScore = scoreMap(Object.fromEntries(
    [...new Set([...Object.keys(scoreBefore), ...Object.keys(scoreGain)])]
      .map((sideKey) => [sideKey,
        Number(scoreBefore[sideKey] || 0) + Number(scoreGain[sideKey] || 0)]),
  ));
  if (!scoreMapsEqual(successor.scenario?.score || {}, expectedFinalScore)) return [];
  if (successor.activeSideKey !== nextSideKey) return [];
  const expectedSuccessorTurn = Number(cell.roundNumber) +
    Number(endingSideKey === "player2");
  if (Number(successor.turnNumber) !== expectedSuccessorTurn) return [];

  const currentSettlementRows = [];
  const priorScoringHistory = [];
  for (const row of successor.scenario?.scoringHistory || []) {
    const currentSettlement = Number(row.round) === Number(cell.roundNumber) &&
      String(row.scoringWindow || "") === `turn_end:${endingSideKey}`;
    if (currentSettlement) currentSettlementRows.push(row);
    else priorScoringHistory.push(row);
  }
  const observedGain = scoreMap(Object.fromEntries(
    [...new Set(currentSettlementRows.map((row) => String(row.sideKey || "")))]
      .filter(Boolean)
      .map((sideKey) => [sideKey, currentSettlementRows
        .filter((row) => row.sideKey === sideKey)
        .reduce((sum, row) => sum + Number(row.points || 0), 0)]),
  ));
  if (!scoreMapsEqual(observedGain, scoreGain)) return [];

  const state = structuredClone(successor);
  state.activeSideKey = endingSideKey;
  state.turnNumber = Number(cell.roundNumber);
  state.phaseKey = "activation";
  state.controlPhaseStepKey = "";
  state.controlPhaseProgressed = false;
  state.controlPhaseEndAmbushWindow = false;
  state.activationForfeitWindow = null;
  state.anyTimeActivationWindow = null;
  state.initialAttackWindow = null;
  state.combatPurchaseWindow = null;
  state.activationPreludeActorPieceKey = "";
  state.activationPreludeKind = "";
  state.soulTakerActivationPreludeActorPieceKey = "";
  state.scenario = {
    ...(state.scenario || {}),
    score: scoreBefore,
    scoringHistory: priorScoringHistory,
  };
  const scenarioSettlementRestoration = restoreWarmachineScenarioSettlementPreimageV1(
    state,
    cell.scenarioSettlementInverseWitness || null,
  );
  for (const piece of state.pieces || []) {
    if (alive(piece)) piece.activated = true;
    if (Object.hasOwn(
      rawOptions.resourcePreimagePointsByPieceKey || {},
      piece.pieceKey,
    )) {
      setPieceResourcePoints(
        piece,
        rawOptions.resourcePreimagePointsByPieceKey[piece.pieceKey],
      );
    }
  }
  const operatorKey = cell.goalType === "fixed_round_limit_result"
    ? "fixed_round_turn_end_inverse_v1"
    : cell.goalType === "simultaneous_leader_tiebreak"
      ? "simultaneous_leader_turn_end_inverse_v1"
      : "scenario_score_turn_end_inverse_v1";
  state.stateKey = `terminal-predecessor-${stableGraphHash({
    successorStateHash: warmachineReverseStateSemanticHashV1(successor),
    cellKey: cell.cellKey,
    operatorKey,
  }, 24)}`;
  return [{
    state: normalizeRulesV1State(state),
    mutation: {
      operatorKey,
      endingSideKey,
      roundNumber: Number(cell.roundNumber),
      scoreBefore,
      scoreGain,
      removedScoringLedgerKeys: currentSettlementRows.map((row) => row.key).sort(),
      nextSideActivationRestoreMode: "all_alive_models_activated",
      resourcePreimagePointsByPieceKey: stableGraphValue(
        rawOptions.resourcePreimagePointsByPieceKey || {},
      ),
      scenarioSettlementRestoration,
      unresolvedReasons: scenarioSettlementRestoration.unresolvedReasons,
    },
  }];
}

function candidatePredecessorStates(successor, cell, rawOptions = {}) {
  return cell.goalType === "assassination"
    ? candidateAssassinationPredecessorStates(successor, cell, rawOptions)
    : candidateTurnEndPredecessorStates(successor, cell, rawOptions);
}

function scopedTerminalActions(proposal, cell, rawOptions = {}) {
  if (["scenario_score", "fixed_round_limit_result", "simultaneous_leader_tiebreak"]
    .includes(cell.goalType)) {
    const scoped = enumerateWarmachineBenchmarkActionsV2(proposal.state, {
      includeActorlessActions: true,
      actionFamilyKeys: ["timing"],
    });
    return {
      scoped,
      actions: (scoped.enumeration.actions || []).filter((action) =>
        action.actionType === "end_turn"),
      deterministicAction: true,
    };
  }
  const scoped = enumerateWarmachineBenchmarkActionsV2(proposal.state, {
    actorPieceKeys: [cell.actorPieceKey],
    targetPieceKeys: [cell.targetLeaderPieceKey],
    includeUntargetedActions: false,
    actionFamilyKeys: ["attack_or_effect", "special", "resource"],
  });
  const familyActions = (scoped.enumeration.actions || []).filter((action) =>
    attackFamilyMatches(action, cell));
  const requestedActionTypes = new Set((rawOptions.terminalActionTypes || [])
    .map(String).filter(Boolean));
  const typeScopedActions = requestedActionTypes.size
    ? familyActions.filter((action) => requestedActionTypes.has(action.actionType))
    : familyActions;
  const requestedActionKeys = new Set((rawOptions.terminalActionKeys || [])
    .map(String).filter(Boolean));
  const identityScopedActions = requestedActionKeys.size
    ? typeScopedActions.filter((action) => requestedActionKeys.has(action.actionKey))
    : typeScopedActions;
  const maximumActions = Math.max(0, Math.floor(Number(
    rawOptions.maximumTerminalActions ?? 0,
  )));
  return {
    scoped,
    actions: maximumActions > 0
      ? identityScopedActions.slice(0, maximumActions)
      : identityScopedActions,
    deferredActions: familyActions.filter((action) =>
      !identityScopedActions.includes(action) ||
      (maximumActions > 0 && identityScopedActions.indexOf(action) >= maximumActions)),
    deterministicAction: false,
  };
}

function lifecycleContinuationActions(state) {
  const scoped = enumerateWarmachineBenchmarkActionsV2(state, {
    includeActorlessActions: true,
  });
  return {
    scoped,
    actions: (scoped.enumeration.actions || []).filter((action) =>
      action.metadata?.lifecycleTriggerChoiceDecision === true ||
      action.metadata?.lifecycleTriggerOrderDecision === true),
  };
}

function strictReplayStepFromReceipt(action = {}, receipt = {}, actionPatch = {}) {
  return stableGraphValue({
    actionKey: String(action.actionKey || receipt.actionKey || ""),
    actionType: String(action.actionType || receipt.actionType || ""),
    actionPatch: stableGraphValue(actionPatch),
    receiptHash: String(receipt.receiptHash || ""),
  });
}

function matchingTerminalContinuations(
  initialState,
  initialTerminalEvents,
  successorSemanticHash,
  cell,
  rawOptions = {},
) {
  const maximumDepth = Math.max(0, Math.floor(Number(
    rawOptions.maximumTerminalContinuationDepth ?? 4,
  )));
  const maximumLabels = Math.max(1, Math.floor(Number(
    rawOptions.maximumTerminalContinuationLabels ?? 64,
  )));
  const queue = [{
    state: initialState,
    terminalEvents: initialTerminalEvents || [],
    strictReplaySteps: [],
    strictReceiptHashes: [],
    depth: 0,
  }];
  const visited = new Set();
  const matching = [];
  let processedLabelCount = 0;
  let budgetDeferredCount = 0;
  let unsupportedActionCount = 0;
  while (queue.length && processedLabelCount < maximumLabels) {
    const current = queue.shift();
    processedLabelCount += 1;
    const stateHash = warmachineReverseStateSemanticHashV1(current.state);
    const visitKey = stableGraphHash({
      stateHash,
      depth: current.depth,
      actionKeys: current.strictReplaySteps.map((step) => step.actionKey),
    });
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);
    if (stateHash === successorSemanticHash &&
        terminalEventMatches(current.terminalEvents, cell)) {
      matching.push(current);
      continue;
    }
    if (current.depth >= maximumDepth) {
      budgetDeferredCount += 1;
      continue;
    }
    const { scoped, actions } = lifecycleContinuationActions(current.state);
    for (const action of actions) {
      const step = expandWarmachineStrictPolicyStepV1(
        current.state,
        () => ({
          scoped,
          action,
          deterministicAction: true,
          nextPolicyCursor: current.depth + 1,
        }),
        {
          routeKey: `terminal-continuation:${cell.cellKey}:${action.actionKey}`,
          perspectiveSideKey: cell.winnerSideKey,
          depth: current.depth,
        },
      );
      if (step.stepType !== "deterministic" ||
          step.successor?.transitionAccepted !== true || !step.successor.state) {
        unsupportedActionCount += 1;
        continue;
      }
      const receipt = step.successor.runtimeReceipt || {};
      queue.push({
        state: step.successor.state,
        terminalEvents: [
          ...(current.terminalEvents || []),
          ...(step.successor.terminalEvents || []),
        ],
        strictReplaySteps: [
          ...current.strictReplaySteps,
          strictReplayStepFromReceipt(action, receipt),
        ],
        strictReceiptHashes: [
          ...current.strictReceiptHashes,
          String(step.successor.receiptHash || ""),
        ].filter(Boolean),
        depth: current.depth + 1,
      });
    }
  }
  if (queue.length) budgetDeferredCount += queue.length;
  return {
    matching,
    processedLabelCount,
    budgetDeferredCount,
    unsupportedActionCount,
  };
}

function canonicalTerminalStrictRollOutcomes(action = {}, rawOptions = {}) {
  const supplied = rawOptions.terminalStrictRollOutcomesByActionKey?.[action.actionKey] ||
    rawOptions.terminalStrictRollOutcomes;
  if (Array.isArray(supplied) && supplied.length) return supplied.map(stableGraphValue);
  const resolution = action.metadata?.attackResolution || {};
  const attackDiceCount = Math.max(1, Math.floor(Number(
    resolution.attackDiceCount ?? resolution.diceCount ?? 2,
  )));
  const damageDiceCount = Math.max(1, Math.floor(Number(
    resolution.damageDiceCount ?? 2,
  )));
  return [{
    attackDice: Array.from({ length: attackDiceCount }, () => 6),
    damageDice: Array.from({ length: damageDiceCount }, () => 6),
  }];
}

function strictTerminalWitnessOutcomes(
  scoped,
  action,
  successorSemanticHash,
  cell,
  rawOptions = {},
) {
  const matchingOutcomes = [];
  const rejected = [];
  const terminalActionPatch = stableGraphValue({
    ...(cell.terminalActionPatch || {}),
    ...(rawOptions.terminalActionPatch || {}),
  });
  for (const [proposalIndex, strictRollOutcome] of
    canonicalTerminalStrictRollOutcomes(action, rawOptions).entries()) {
    const executed = executeScopedWarmachineBenchmarkActionV2(
      scoped,
      action,
      { actionKey: action.actionKey },
      {
        routeKey: `terminal-witness:${cell.cellKey}:${action.actionKey}:${proposalIndex}`,
        actionPatch: { ...terminalActionPatch, strictRollOutcome },
      },
    );
    if (!executed.ok) {
      rejected.push({
        actionKey: action.actionKey,
        proposalIndex,
        reason: String(executed.reason || "terminal_strict_roll_witness_rejected"),
        receiptHash: String(executed.receipt?.receiptHash || ""),
      });
      continue;
    }
    const continuations = matchingTerminalContinuations(
      executed.normalizedState || executed.state,
      (executed.transition.events || []).filter((event) => event.eventType === "terminal"),
      successorSemanticHash,
      cell,
      rawOptions,
    );
    for (const continuation of continuations.matching) {
      matchingOutcomes.push(stableGraphValue({
        groupKey: `strict-witness-${proposalIndex}`,
        chanceClassKeys: [],
        responseKey: "strict_witness",
        receiptHash: String(executed.receipt?.receiptHash || ""),
        continuationReceiptHashes: continuation.strictReceiptHashes,
        continuationReplaySteps: continuation.strictReplaySteps,
        continuationDepth: continuation.depth,
        replayExecutions: [{
          chanceClassKey: `strict-witness-${proposalIndex}`,
          responseKey: "strict_witness",
          actionKey: action.actionKey,
          strictRollOutcome,
          receiptHash: String(executed.receipt?.receiptHash || ""),
        }],
        probability: null,
        probabilityStatus: "unresolved_strict_existence_witness",
        terminalEvents: continuation.terminalEvents,
      }));
    }
  }
  return { matchingOutcomes, rejected };
}

export function generateWarmachineTerminalEventPredecessorsV1(
  successorStateInput = {},
  terminalCell = {},
  rawOptions = {},
) {
  if (terminalCell.schemaVersion !== WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA) {
    throw new Error("terminal_predecessor_hypothesis_cell_required");
  }
  if (!["assassination", "scenario_score", "fixed_round_limit_result",
    "simultaneous_leader_tiebreak"].includes(terminalCell.goalType)) {
    throw new Error(`terminal_predecessor_goal_type_not_implemented:${terminalCell.goalType}`);
  }
  const successor = normalizeRulesV1State(successorStateInput);
  const successorSemanticHash = warmachineReverseStateSemanticHashV1(successor);
  const proposals = candidatePredecessorStates(successor, terminalCell, rawOptions);
  const candidates = [];
  const rejected = [];
  const unresolved = [];
  for (const proposal of proposals) {
    const proposalUnresolvedReasons = proposal.mutation?.unresolvedReasons || [];
    unresolved.push(...proposalUnresolvedReasons.map((reason) => ({
      predecessorStateHash: warmachineReverseStateSemanticHashV1(proposal.state),
      reason,
      mutation: proposal.mutation,
    })));
    if (proposalUnresolvedReasons.length) continue;
    const { scoped, actions, deferredActions = [], deterministicAction } = scopedTerminalActions(
      proposal,
      terminalCell,
      rawOptions,
    );
    const preparedProposalState = scoped.state || proposal.state;
    unresolved.push(...deferredActions.map((action) => ({
      predecessorStateHash: warmachineReverseStateSemanticHashV1(proposal.state),
      actionKey: action.actionKey,
      actionType: action.actionType,
      reason: (rawOptions.terminalActionTypes || []).length &&
        !(rawOptions.terminalActionTypes || []).includes(action.actionType)
        ? "terminal_predecessor_action_type_scope_deferred"
        : (rawOptions.terminalActionKeys || []).length &&
            !(rawOptions.terminalActionKeys || []).includes(action.actionKey)
          ? "terminal_predecessor_action_identity_scope_deferred"
        : "terminal_predecessor_action_budget_deferred",
      mutation: proposal.mutation,
    })));
    if (!actions.length) {
      unresolved.push({
        predecessorStateHash: warmachineReverseStateSemanticHashV1(proposal.state),
        reason: "terminal_predecessor_no_matching_strict_action",
        mutation: proposal.mutation,
        legalTargetActionTypes: [...new Set((scoped.enumeration.actions || [])
          .filter((action) => action.actorPieceKey === terminalCell.actorPieceKey &&
            action.targetPieceKey === terminalCell.targetLeaderPieceKey)
          .map((action) => action.actionType))].sort(),
        rejectedTargetActions: (scoped.enumeration.rejectedActions || [])
          .filter((action) => action.actorPieceKey === terminalCell.actorPieceKey &&
            action.targetPieceKey === terminalCell.targetLeaderPieceKey)
          .slice(0, 16)
          .map((action) => stableGraphValue({
            actionKey: action.actionKey || "",
            actionType: action.actionType || "",
            reason: action.rejection?.reason || action.reason || "",
          })),
      });
      continue;
    }
    for (const action of actions) {
      const terminalActionPatch = stableGraphValue({
        ...(terminalCell.terminalActionPatch || {}),
        ...(rawOptions.terminalActionPatch || {}),
      });
      const step = expandWarmachineStrictPolicyStepV1(
        proposal.state,
        () => ({
          scoped,
          action,
          deterministicAction,
          actionPatch: terminalActionPatch,
          nextPolicyCursor: 1,
        }),
        {
          routeKey: `terminal-predecessor:${terminalCell.cellKey}:${action.actionKey}`,
          perspectiveSideKey: terminalCell.winnerSideKey,
        },
      );
      if (!["chance", "deterministic"].includes(step.stepType)) {
        const strictWitness = deterministicAction ? { matchingOutcomes: [], rejected: [] } :
          strictTerminalWitnessOutcomes(
            scoped,
            action,
            successorSemanticHash,
            terminalCell,
            rawOptions,
          );
        if (strictWitness.matchingOutcomes.length) {
          const predecessorStateHash = warmachineReverseStateSemanticHashV1(
            preparedProposalState,
          );
          const firstOutcome = strictWitness.matchingOutcomes[0];
          const firstExecution = firstOutcome.replayExecutions?.[0] || null;
          const strictReplaySteps = [
            ...(firstExecution ? [{
            actionKey: firstExecution.actionKey,
            actionType: action.actionType,
              actionPatch: {
                ...terminalActionPatch,
                strictRollOutcome: firstExecution.strictRollOutcome,
              },
              receiptHash: firstExecution.receiptHash,
            }] : []),
            ...(firstOutcome.continuationReplaySteps || []),
          ].map(stableGraphValue);
          const strictStepReceiptHashes = [...new Set([
            ...strictWitness.matchingOutcomes.map((outcome) =>
              String(outcome.receiptHash || "")),
            ...strictWitness.matchingOutcomes.flatMap((outcome) =>
              outcome.continuationReceiptHashes || []),
          ].filter(Boolean))];
          const core = {
            candidateKind: "concrete_terminal_event_predecessor",
            successorKind: `${terminalCell.goalType}_terminal`,
            predecessorKind: "state_immediately_before_terminal_attack",
            operatorKey: proposal.mutation.operatorKey,
            predecessorStateKey: String(preparedProposalState.stateKey || ""),
            predecessorStateHash,
            successorStateKey: String(successor.stateKey || ""),
            successorStateHash: successorSemanticHash,
            transitionActionKey: action.actionKey,
            actorPieceKey: String(terminalCell.actorPieceKey || ""),
            targetPieceKey: String(terminalCell.targetLeaderPieceKey || ""),
            mutation: stableGraphValue(proposal.mutation),
            matchedProbability: null,
            matchedProbabilityInterval: { lower: 0, upper: 1 },
            matchedProbabilityExact: false,
            probabilityUnresolvedReasons: [step.reason || `terminal_predecessor_step_${step.stepType}`],
            matchingOutcomes: stableGraphValue(strictWitness.matchingOutcomes),
            strictReplaySteps,
            strictStepReceiptHashes,
            strictWitness: true,
            strictRejected: false,
            unresolvedReasons: ["terminal_action_chance_mass_not_closed"],
            provenance: {
              terminalCellKey: terminalCell.cellKey,
              upstreamReceiptHash: warmachineHost.receipt.receiptHash,
              oracleOpeningRead: false,
              oracleRouteRead: false,
              oracleIntermediateStateRead: false,
              strictRollProposalSource: "canonical_maximum_dice_existence_witness",
              predecessorStateForm: "strict_enumeration_prepared_state",
            },
          };
          candidates.push({
            ...core,
            candidateKey: `terminal-predecessor-${stableGraphHash(core, 32)}`,
            predecessorState: preparedProposalState,
          });
          continue;
        }
        unresolved.push({
          predecessorStateHash: warmachineReverseStateSemanticHashV1(proposal.state),
          actionKey: action.actionKey,
          reason: step.reason || `terminal_predecessor_step_${step.stepType}`,
          mutation: proposal.mutation,
          strictWitnessRejected: strictWitness.rejected,
        });
        continue;
      }
      let matchedMass = rational(0n);
      const matchingOutcomes = [];
      if (step.stepType === "chance") {
        for (const group of step.groups || []) {
          const groupMass = rational(BigInt(group.numerator), BigInt(group.denominator));
          let groupMatched = false;
          for (const response of group.responses || []) {
            if (response.transitionAccepted !== true || !response.state) continue;
            const continuations = matchingTerminalContinuations(
              response.state,
              response.terminalEvents,
              successorSemanticHash,
              terminalCell,
              rawOptions,
            );
            if (!continuations.matching.length) continue;
            groupMatched = true;
            for (const continuation of continuations.matching) {
              const replayExecutions = (group.classEvidence || []).map((classEvidence) => {
                const responseEvidence = (response.equivalentExecutionEvidence || []).find(
                  (entry) => entry.chanceClassKey === classEvidence.chanceClassKey,
                ) || null;
                return stableGraphValue({
                  chanceClassKey: classEvidence.chanceClassKey,
                  responseKey: response.responseKey,
                  actionKey: String(responseEvidence?.actionKey || response.actionKey || ""),
                  strictRollOutcome: classEvidence.strictRollOutcome || null,
                  receiptHash: String(responseEvidence?.receiptHash || response.receiptHash || ""),
                });
              });
              matchingOutcomes.push({
                groupKey: group.groupKey,
                chanceClassKeys: group.chanceClassKeys,
                responseKey: response.responseKey,
                receiptHash: response.receiptHash,
                continuationReceiptHashes: continuation.strictReceiptHashes,
                continuationReplaySteps: continuation.strictReplaySteps,
                continuationDepth: continuation.depth,
                replayExecutions,
                probability: probabilityRecord(groupMass),
                terminalEvents: continuation.terminalEvents,
              });
            }
          }
          if (groupMatched) matchedMass = add(matchedMass, groupMass);
        }
      } else {
        const response = step.successor || {};
          const stateMatches = response.transitionAccepted === true && response.state &&
            warmachineReverseStateSemanticHashV1(response.state) === successorSemanticHash;
        const eventMatches = terminalEventMatches(response.terminalEvents, terminalCell);
        if (stateMatches && eventMatches) {
          const scenarioChanceProbability =
            proposal.mutation?.scenarioSettlementRestoration?.chanceProbability;
          const unitMass = scenarioChanceProbability
            ? rational(
              BigInt(scenarioChanceProbability.numerator),
              BigInt(scenarioChanceProbability.denominator),
            )
            : rational(1n);
          matchedMass = unitMass;
          matchingOutcomes.push({
            groupKey: "deterministic",
            chanceClassKeys: [],
            responseKey: "deterministic",
            receiptHash: response.receiptHash,
            replayExecutions: [stableGraphValue({
              chanceClassKey: "deterministic",
              responseKey: "deterministic",
              actionKey: String(response.runtimeReceipt?.actionKey || action.actionKey || ""),
              strictRollOutcome:
                response.runtimeReceipt?.persistedAction?.strictRollOutcome || null,
              receiptHash: response.receiptHash,
            })],
            probability: probabilityRecord(unitMass),
            terminalEvents: response.terminalEvents,
          });
        }
      }
      if (!matchingOutcomes.length) {
        const deterministicResponse = step.stepType === "deterministic"
          ? step.successor || {}
          : null;
        rejected.push({
          predecessorStateHash: warmachineReverseStateSemanticHashV1(proposal.state),
          actionKey: action.actionKey,
          reason: "strict_successors_do_not_match_terminal_state",
          mutation: proposal.mutation,
          transitionAccepted: deterministicResponse?.transitionAccepted === true,
          responseReason: String(deterministicResponse?.reason || ""),
          terminalEventMatches: deterministicResponse
            ? terminalEventMatches(deterministicResponse.terminalEvents, terminalCell)
            : false,
          stateMismatchDiagnostics: deterministicResponse?.state
            ? boundedStateDifferences(
              semanticProjection(normalizeRulesV1State(successor)),
              semanticProjection(normalizeRulesV1State(deterministicResponse.state)),
            )
            : [],
        });
        continue;
      }
      const predecessorStateHash = warmachineReverseStateSemanticHashV1(
        preparedProposalState,
      );
      const firstReplayExecution = matchingOutcomes.flatMap((outcome) =>
        outcome.replayExecutions || [])[0] || null;
      const firstContinuation = matchingOutcomes.find((outcome) =>
        (outcome.continuationReplaySteps || []).length) || null;
      const strictReplaySteps = [
        ...(firstReplayExecution ? [stableGraphValue({
          actionKey: firstReplayExecution.actionKey,
          actionType: action.actionType,
          actionPatch: firstReplayExecution.strictRollOutcome
            ? { ...terminalActionPatch, strictRollOutcome: firstReplayExecution.strictRollOutcome }
            : terminalActionPatch,
          receiptHash: firstReplayExecution.receiptHash,
        })] : []),
        ...(firstContinuation?.continuationReplaySteps || []),
      ];
      const strictStepReceiptHashes = [...new Set([
        ...matchingOutcomes.map((outcome) => String(outcome.receiptHash || "")),
        ...matchingOutcomes.flatMap((outcome) => outcome.continuationReceiptHashes || []),
      ].filter(Boolean))];
      const core = {
        candidateKind: "concrete_terminal_event_predecessor",
        successorKind: `${terminalCell.goalType}_terminal`,
        predecessorKind: terminalCell.goalType === "assassination"
          ? "state_immediately_before_terminal_attack"
          : "state_immediately_before_terminal_score_settlement",
        operatorKey: proposal.mutation.operatorKey,
        predecessorStateKey: String(preparedProposalState.stateKey || ""),
        predecessorStateHash,
        successorStateKey: String(successor.stateKey || ""),
        successorStateHash: successorSemanticHash,
        transitionActionKey: action.actionKey,
        actorPieceKey: String(terminalCell.actorPieceKey || ""),
        targetPieceKey: String(terminalCell.targetLeaderPieceKey || ""),
        mutation: stableGraphValue(proposal.mutation),
        matchedProbability: probabilityRecord(matchedMass),
        matchingOutcomes: stableGraphValue(matchingOutcomes),
        strictReplaySteps: stableGraphValue(strictReplaySteps),
        strictStepReceiptHashes,
        strictWitness: true,
        strictRejected: false,
        strictReceiptHash: matchingOutcomes[0].receiptHash,
        unresolvedReasons: [],
        provenance: {
          terminalCellKey: terminalCell.cellKey,
          upstreamReceiptHash: warmachineHost.receipt.receiptHash,
          oracleOpeningRead: false,
          oracleRouteRead: false,
          oracleIntermediateStateRead: false,
          resourcePreimageSource: Object.keys(
            proposal.mutation.resourcePreimagePointsByPieceKey || {},
          ).length
            ? "explicit_bounded_terminal_turn_end_resource_envelope"
            : "preserve_terminal_successor_resource_points",
          predecessorStateForm: "strict_enumeration_prepared_state",
        },
      };
      candidates.push({
        ...core,
        candidateKey: `terminal-predecessor-${stableGraphHash(core, 32)}`,
        predecessorState: preparedProposalState,
      });
    }
  }
  const publicCandidates = candidates.map(({ predecessorState: _state, ...candidate }) => candidate);
  const candidateSet = buildWarmachineReverseReachabilityCandidateSetV2(publicCandidates, {
    queryKey: terminalCell.cellKey,
    successorStateKey: String(successor.stateKey || ""),
    maximumCandidates: rawOptions.maximumCandidates ?? publicCandidates.length,
  });
  const core = {
    schemaVersion: WARMACHINE_TERMINAL_EVENT_PREDECESSOR_V1_SCHEMA,
    terminalCellKey: terminalCell.cellKey,
    successorStateKey: String(successor.stateKey || ""),
    successorSemanticHash,
    proposalCount: proposals.length,
    strictCandidateCount: candidates.length,
    strictRejectedCount: rejected.length,
    unresolvedCount: unresolved.length,
    publicCandidates: stableGraphValue(publicCandidates),
    rejected: stableGraphValue(rejected),
    unresolved: stableGraphValue(unresolved),
    candidateSet,
    oracleIsolationAudit: {
      inputKinds: ["terminal_state", "terminal_hypothesis_cell"],
      openingRead: false,
      forwardRouteRead: false,
      intermediateStateRead: false,
      passed: true,
    },
    claimBoundary: "This operator generates only the state immediately before an assassination-causing attack, scenario-winning end-turn settlement, simultaneous-Leader tiebreak settlement, or fixed-round end-turn result. A strict candidate means an exact Chance/owned-response outcome or deterministic settlement forward-applies to the supplied terminal state and emits the requested terminal event. It does not yet reverse the rest of the activation or any earlier turn.",
  };
  return {
    ...core,
    candidates,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: candidateSet.reachabilityContractOk && candidates.length > 0,
  };
}
