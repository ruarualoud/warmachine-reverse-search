import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  enumerateWarmachineBenchmarkActionsV2,
  executeWarmachineBenchmarkControlPhaseV2,
  executeScopedWarmachineBenchmarkActionV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import {
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { replayWarmachineTerminalRouteStrictV2 } from "./strict-route-witness-v2.mjs";
import { warmachinePieceInPlayV1 } from "./piece-lifecycle-v1.mjs";
import { WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA } from
  "./terminal-hypothesis-v1.mjs";

export const WARMACHINE_TERMINAL_SPATIAL_MATERIALIZER_V1_SCHEMA =
  "warmachine_terminal_spatial_materializer_v1";

const MATERIALIZATION_DISPOSITIONS = Object.freeze({
  INPUT_INVALID: "input_invalid",
  PROPOSAL_FILTERED: "proposal_filtered",
  STRICT_REJECTED: "strict_rejected",
  BUDGET_DEFERRED: "budget_deferred",
});

function materializationDispositionEntry(row = {}, disposition = "", authority = "") {
  return stableGraphValue({
    ...row,
    disposition,
    authority,
    strictRulesConclusion: disposition === MATERIALIZATION_DISPOSITIONS.STRICT_REJECTED,
  });
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function point(value = {}) {
  return {
    xIn: numeric(value.xIn ?? value.x),
    yIn: numeric(value.yIn ?? value.y),
  };
}

function baseRadius(piece = {}) {
  return Math.max(0, numeric(piece.baseRadiusIn,
    numeric(piece.baseSizeIn ?? piece.baseDiameterIn, 1.18) / 2));
}

function alive(piece = {}) {
  return warmachinePieceInPlayV1(piece);
}

function edgeDistance(left = {}, right = {}) {
  return Math.max(0, Math.hypot(
    point(left.position || left).xIn - point(right.position || right).xIn,
    point(left.position || left).yIn - point(right.position || right).yIn,
  ) - baseRadius(left) - baseRadius(right));
}

function scoreMap(raw = {}) {
  return Object.fromEntries(Object.entries(raw || {}).map(([sideKey, value]) => [
    String(sideKey),
    Math.max(0, numeric(value, 0)),
  ]).sort(([left], [right]) => left.localeCompare(right)));
}

function scoreMapsEqual(left = {}, right = {}) {
  const keys = [...new Set([...Object.keys(left || {}), ...Object.keys(right || {})])];
  return keys.every((sideKey) =>
    numeric(left?.[sideKey], 0) === numeric(right?.[sideKey], 0));
}

function positionMap(cell = {}) {
  const exact = cell.geometryRelationCell?.exactCoordinates || {};
  const source = exact.piecePositions || exact.pieces || {};
  return Object.fromEntries(Object.entries(source).map(([pieceKey, position]) => [
    String(pieceKey),
    point(position),
  ]));
}

function applyActivationEnvelope(state = {}, rawOptions = {}) {
  const requested = rawOptions.activationEnvelopeBySide || {};
  const applied = {};
  for (const [sideKey, mode] of Object.entries(requested).sort(([left], [right]) =>
    left.localeCompare(right))) {
    if (!["preserve", "all_alive_activated", "all_alive_unactivated"].includes(mode)) {
      applied[sideKey] = { mode, applied: false, reason: "unsupported_activation_envelope" };
      continue;
    }
    let affectedCount = 0;
    if (mode !== "preserve") {
      for (const piece of state.pieces || []) {
        if (piece.sideKey !== sideKey || !alive(piece)) continue;
        piece.activated = mode === "all_alive_activated";
        affectedCount += 1;
      }
    }
    applied[sideKey] = { mode, applied: true, affectedCount };
  }
  return stableGraphValue(applied);
}

function oppositeSide(sideKey = "") {
  return sideKey === "player1" ? "player2" : sideKey === "player2" ? "player1" : "";
}

function materializePriorTurnSettlement(stateInput = {}, cell = {}, rawOptions = {}) {
  const seed = rawOptions.priorTurnSettlementSeedByCellKey?.[cell.cellKey] ||
    rawOptions.priorTurnSettlementSeed;
  if (!seed) return { state: stateInput, evidence: null, issues: [] };
  const nextSideKey = String(cell.endingSideKey || stateInput.activeSideKey || "");
  const endingSideKey = String(seed.endingSideKey || oppositeSide(nextSideKey));
  const firstPlayerSideKey = String(
    stateInput.firstPlayerSideKey ||
    stateInput.scenario?.attackerSideKey ||
    "player1",
  );
  const completedRound = endingSideKey !== firstPlayerSideKey &&
    nextSideKey === firstPlayerSideKey;
  const endingTurnNumber = Number(seed.endingTurnNumber ??
    (Number(cell.roundNumber || 1) - Number(completedRound)));
  const predecessor = structuredClone(stateInput);
  predecessor.activeSideKey = endingSideKey;
  predecessor.turnNumber = endingTurnNumber;
  predecessor.phaseKey = "activation";
  predecessor.controlPhaseStepKey = "";
  predecessor.controlPhaseProgressed = false;
  predecessor.controlPhaseEndAmbushWindow = false;
  predecessor.activationForfeitWindow = null;
  predecessor.anyTimeActivationWindow = null;
  predecessor.initialAttackWindow = null;
  predecessor.combatPurchaseWindow = null;
  predecessor.scenario = {
    ...(predecessor.scenario || {}),
    score: stableGraphValue(seed.scoreBefore || predecessor.scenario?.score || {}),
    scoringHistory: stableGraphValue(seed.scoringHistoryBefore || []),
  };
  for (const piece of predecessor.pieces || []) {
    if (!alive(piece)) continue;
    if ([endingSideKey, nextSideKey].includes(piece.sideKey)) piece.activated = true;
  }
  const normalizedPredecessor = normalizeRulesV1State(predecessor);
  const scoped = enumerateWarmachineBenchmarkActionsV2(normalizedPredecessor, {
    includeActorlessActions: true,
    actionFamilyKeys: ["timing"],
  });
  const action = (scoped.enumeration.actions || []).find((candidate) =>
    candidate.actionType === "end_turn");
  if (!action) {
    return {
      state: stateInput,
      evidence: null,
      issues: [{
        reason: "terminal_spatial_prior_turn_end_action_missing",
        endingSideKey,
        endingTurnNumber,
        rejectedEndTurnActions: (scoped.enumeration.rejectedActions || [])
          .filter((candidate) => candidate.actionType === "end_turn")
          .map(stableGraphValue),
      }],
    };
  }
  const executed = executeScopedWarmachineBenchmarkActionV2(
    scoped,
    action,
    { actionKey: action.actionKey },
    {
      routeKey: `terminal-spatial-prior-turn-settlement:${cell.cellKey}`,
      actionPatch: seed.actionPatch || {},
    },
  );
  if (!executed.ok) {
    return {
      state: stateInput,
      evidence: null,
      issues: [{
        reason: "terminal_spatial_prior_turn_end_strict_rejected",
        endingSideKey,
        endingTurnNumber,
        rejectionReason: executed.reason || "",
        receiptHash: executed.receipt?.receiptHash || "",
      }],
    };
  }
  const state = normalizeRulesV1State(executed.normalizedState || executed.state);
  if (state.activeSideKey !== nextSideKey || Number(state.turnNumber) !== Number(cell.roundNumber) ||
      state.phaseKey !== "control") {
    return {
      state: stateInput,
      evidence: null,
      issues: [{
        reason: "terminal_spatial_prior_turn_end_successor_timing_mismatch",
        expected: { activeSideKey: nextSideKey, turnNumber: cell.roundNumber, phaseKey: "control" },
        observed: {
          activeSideKey: state.activeSideKey,
          turnNumber: state.turnNumber,
          phaseKey: state.phaseKey,
        },
      }],
    };
  }
  return {
    state,
    issues: [],
    evidence: stableGraphValue({
      source: "strict_prior_turn_end_materialization",
      firstPlayerSideKey,
      completedRound,
      endingSideKey,
      endingTurnNumber,
      nextSideKey,
      nextTurnNumber: Number(state.turnNumber),
      scoreBefore: seed.scoreBefore || {},
      scoreAfter: state.scenario?.score || {},
      scoringRowsAdded: (state.scenario?.scoringHistory || []).slice(
        (seed.scoringHistoryBefore || []).length,
      ),
      actionKey: action.actionKey,
      receiptHash: executed.receipt?.receiptHash || "",
      exactWithinScope: true,
      openingRead: false,
      intermediateRouteRead: false,
    }),
  };
}

function materializeCurrentTurnControlPhase(stateInput = {}, cell = {}, rawOptions = {}) {
  if (stateInput.phaseKey !== "control") {
    return { state: stateInput, evidence: null, issues: [] };
  }
  const executed = executeWarmachineBenchmarkControlPhaseV2(stateInput, {
    routeKey: `terminal-spatial-current-control:${cell.cellKey}`,
    maximumSteps: Math.max(1, Number(rawOptions.maximumCurrentControlSteps || 64)),
    selectAction: ({ scoped }) => (scoped.enumeration.actions || [])
      .filter((action) => [
        "end_maintenance_phase",
        "end_control_replenishment",
        "end_control_phase",
        "advance_to_activation",
      ].includes(action.actionType))
      .sort((left, right) => left.actionKey.localeCompare(right.actionKey))[0] || null,
    onProgress: rawOptions.onStrictReplayProgress,
  });
  if (!executed.ok || executed.state?.phaseKey !== "activation") {
    return {
      state: stateInput,
      evidence: null,
      issues: [{
        reason: "terminal_spatial_current_control_strict_rejected",
        activeSideKey: stateInput.activeSideKey,
        turnNumber: stateInput.turnNumber,
        observedPhaseKey: executed.state?.phaseKey || "",
        failures: stableGraphValue(executed.failures || []),
        stepReceiptHashes: stableGraphValue(executed.stepReceiptHashes || []),
      }],
    };
  }
  return {
    state: normalizeRulesV1State(executed.state),
    issues: [],
    evidence: stableGraphValue({
      source: "strict_current_turn_control_materialization",
      activeSideKey: stateInput.activeSideKey,
      turnNumber: Number(stateInput.turnNumber),
      actionTypes: (executed.receipts || []).map((receipt) => receipt.actionType),
      receiptHashes: executed.stepReceiptHashes || [],
      controlReceiptHash: executed.controlReceiptHash || "",
      transitionCount: executed.transitionCount,
      exactWithinScope: true,
      openingRead: false,
      intermediateRouteRead: false,
    }),
  };
}

function materializeCoordinates(stateTemplateInput = {}, cell = {}, rawOptions = {}) {
  let state = structuredClone(normalizeRulesV1State(stateTemplateInput));
  const positions = positionMap(cell);
  const issues = [];
  const livePieces = (state.pieces || []).filter(alive);
  const knownPieceKeys = new Set((state.pieces || []).map((piece) => piece.pieceKey));
  for (const pieceKey of Object.keys(positions)) {
    if (!knownPieceKeys.has(pieceKey)) {
      issues.push({
        reason: "terminal_spatial_unknown_piece",
        pieceKey,
        authority: "input_contract",
      });
    }
  }
  for (const piece of livePieces) {
    if (!positions[piece.pieceKey]) {
      issues.push({
        reason: "terminal_spatial_live_piece_position_missing",
        pieceKey: piece.pieceKey,
        authority: "input_contract",
      });
      continue;
    }
    piece.position = positions[piece.pieceKey];
  }
  const boardWidth = numeric(state.board?.widthIn, 48);
  const boardHeight = numeric(state.board?.heightIn, 48);
  for (const piece of livePieces) {
    if (!positions[piece.pieceKey]) continue;
    const radius = baseRadius(piece);
    const location = point(piece.position);
    if (location.xIn - radius < -0.001 || location.xIn + radius > boardWidth + 0.001 ||
        location.yIn - radius < -0.001 || location.yIn + radius > boardHeight + 0.001) {
      issues.push({
        reason: "terminal_spatial_base_outside_table",
        pieceKey: piece.pieceKey,
        position: location,
        authority: "candidate_preflight",
      });
    }
  }
  for (let leftIndex = 0; leftIndex < livePieces.length; leftIndex += 1) {
    const left = livePieces[leftIndex];
    if (!positions[left.pieceKey]) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < livePieces.length; rightIndex += 1) {
      const right = livePieces[rightIndex];
      if (!positions[right.pieceKey]) continue;
      const centerDistanceIn = Math.hypot(
        point(left.position).xIn - point(right.position).xIn,
        point(left.position).yIn - point(right.position).yIn,
      );
      const minimumCenterDistanceIn = baseRadius(left) + baseRadius(right);
      if (centerDistanceIn + 0.001 >= minimumCenterDistanceIn) continue;
      issues.push({
        reason: "terminal_spatial_base_overlap",
        leftPieceKey: left.pieceKey,
        rightPieceKey: right.pieceKey,
        centerDistanceIn,
        minimumCenterDistanceIn,
        authority: "candidate_preflight",
      });
    }
  }
  state.turnNumber = cell.roundNumber;
  state.activeSideKey = cell.endingSideKey;
  const activationEnvelope = applyActivationEnvelope(state, rawOptions);
  const priorTurnSettlement = materializePriorTurnSettlement(state, cell, rawOptions);
  state = priorTurnSettlement.state;
  issues.push(...priorTurnSettlement.issues.map((issue) => ({
    ...issue,
    authority: "rules_v1_host",
  })));
  const currentTurnControl = priorTurnSettlement.evidence
    ? materializeCurrentTurnControlPhase(state, cell, rawOptions)
    : { state, evidence: null, issues: [] };
  state = currentTurnControl.state;
  issues.push(...currentTurnControl.issues.map((issue) => ({
    ...issue,
    authority: "rules_v1_host",
  })));
  const preTerminalActivationEnvelope = applyActivationEnvelope(state, {
    activationEnvelopeBySide: rawOptions.preTerminalActivationEnvelopeBySide || {},
  });
  if (cell.goalType === "assassination") {
    if (!currentTurnControl.evidence) {
      state.phaseKey = String(cell.preTerminalPhaseKey || "activation");
    }
    state.controlPhaseStepKey = "";
    state.controlPhaseProgressed = false;
    const actor = state.pieces.find((piece) => piece.pieceKey === cell.actorPieceKey);
    if (actor) actor.activated = false;
    const targetLeader = state.pieces.find((piece) =>
      piece.pieceKey === cell.targetLeaderPieceKey);
    const targetBoxesBeforeFinal = numeric(cell.targetBoxesBeforeFinal, NaN);
    if (targetLeader && Number.isFinite(targetBoxesBeforeFinal) && targetBoxesBeforeFinal > 0) {
      targetLeader.boxesRemaining = targetBoxesBeforeFinal;
      targetLeader.damage = {
        ...(targetLeader.damage || {}),
        boxesRemaining: targetBoxesBeforeFinal,
      };
      targetLeader.destroyed = false;
      targetLeader.removedFromPlay = false;
    }
  }
  state.stateKey = `terminal-spatial-pre-event-${stableGraphHash({
    cellKey: cell.cellKey,
    positions,
    phaseKey: state.phaseKey,
    targetBoxesBeforeFinal: cell.targetBoxesBeforeFinal,
    activationEnvelope,
    priorTurnSettlement: priorTurnSettlement.evidence,
    currentTurnControl: currentTurnControl.evidence,
    preTerminalActivationEnvelope,
  }, 24)}`;
  return {
    state: normalizeRulesV1State(state),
    positions,
    issues,
    preTerminalAssumptions: stableGraphValue({
      roundNumber: cell.roundNumber,
      activeSideKey: cell.endingSideKey,
      phaseKey: state.phaseKey,
      actorPieceKey: cell.actorPieceKey || "",
      targetLeaderPieceKey: cell.targetLeaderPieceKey || "",
      targetBoxesBeforeFinal: cell.targetBoxesBeforeFinal ?? null,
      activationEnvelope,
      priorTurnSettlement: priorTurnSettlement.evidence,
      currentTurnControl: currentTurnControl.evidence,
      preTerminalActivationEnvelope,
      source: "terminal_hypothesis_cell",
      reverseHistoryReachabilityProven: false,
    }),
  };
}

function profileFor(piece = {}, profileKey = "") {
  const profiles = [
    ...(piece.attackProfiles || []),
    ...(piece.weaponProfiles || []),
    ...(piece.spellProfiles || []),
  ];
  return profiles.find((profile) =>
    String(profile.profileKey || profile.weaponKey || profile.spellKey || "") === profileKey) ||
    null;
}

function evaluateRelationChecks(state = {}, cell = {}) {
  const evidence = [];
  const issues = [];
  for (const check of cell.geometryRelationCell?.relationChecks || []) {
    const source = (state.pieces || []).find((piece) =>
      piece.pieceKey === check.sourcePieceKey) || null;
    const target = check.relationKind === "scenario_objective_control_range"
      ? (state.scenario?.objectives || []).find((objective) =>
          String(objective.objectiveKey || objective.elementKey || "") ===
            check.targetPieceKey) || null
      : (state.pieces || []).find((piece) =>
          piece.pieceKey === check.targetPieceKey) || null;
    if (!source || !target) {
      issues.push({
        reason: "terminal_spatial_relation_piece_missing",
        relationKey: check.relationKey,
        authority: "candidate_preflight",
      });
      continue;
    }
    const observedDistanceIn = edgeDistance(source, target);
    const declaredMinimumDistanceIn = check.minimumDistanceIn == null
      ? 0
      : numeric(check.minimumDistanceIn, NaN);
    const declaredMaximumDistanceIn = check.maximumDistanceIn == null
      ? Number.POSITIVE_INFINITY
      : numeric(check.maximumDistanceIn, NaN);
    let ruleMaximumDistanceIn = Number.POSITIVE_INFINITY;
    if (check.relationKind === "leader_control_range") {
      ruleMaximumDistanceIn = numeric(source.controlRangeIn ?? source.controlRange, NaN);
    } else if (check.relationKind === "scenario_objective_control_range") {
      ruleMaximumDistanceIn = numeric(target.contestingRangeIn, NaN);
    } else if (check.relationKind === "attack_profile_range") {
      const profile = profileFor(source, check.profileKey);
      if (!profile) {
        issues.push({
          reason: "terminal_spatial_relation_profile_missing",
          relationKey: check.relationKey,
          profileKey: check.profileKey,
          authority: "candidate_preflight",
        });
        continue;
      }
      ruleMaximumDistanceIn = numeric(profile.rangeIn ?? profile.range, NaN);
    } else if (check.relationKind !== "maximum_edge_distance") {
      issues.push({
        reason: "terminal_spatial_relation_kind_unsupported",
        relationKey: check.relationKey,
        relationKind: check.relationKind,
        authority: "candidate_preflight",
      });
      continue;
    }
    const minimumDistanceIn = declaredMinimumDistanceIn;
    const maximumDistanceIn = Math.min(declaredMaximumDistanceIn, ruleMaximumDistanceIn);
    const passed = Number.isFinite(minimumDistanceIn) &&
      Number.isFinite(maximumDistanceIn) &&
      observedDistanceIn + 0.001 >= minimumDistanceIn &&
      observedDistanceIn <= maximumDistanceIn + 0.001;
    evidence.push(stableGraphValue({
      ...check,
      authority: "candidate_preflight",
      observedDistanceIn,
      minimumDistanceIn,
      maximumDistanceIn,
      ruleMaximumDistanceIn,
      passed,
    }));
    if (!passed) {
      issues.push({
        reason: "terminal_spatial_relation_not_satisfied",
        relationKey: check.relationKey,
        observedDistanceIn,
        minimumDistanceIn,
        maximumDistanceIn,
        ruleMaximumDistanceIn,
        authority: "candidate_preflight",
      });
    }
  }
  return { evidence, issues };
}

function evaluateScoreTransition(preTerminalState = {}, terminalState = {}, cell = {}) {
  if (cell.goalType !== "scenario_score") return { evidence: null, issues: [] };
  const expectedBefore = scoreMap(cell.scoreBeforeTerminalCell?.scoreBySide || {});
  const expectedGain = scoreMap(cell.terminalScoreGainCell?.scoreGainBySide || {});
  const observedBefore = scoreMap(preTerminalState.scenario?.score || {});
  const observedAfter = scoreMap(terminalState.scenario?.score || {});
  const sideKeys = [...new Set([
    ...Object.keys(expectedBefore),
    ...Object.keys(expectedGain),
    ...Object.keys(observedBefore),
    ...Object.keys(observedAfter),
  ])].sort();
  const observedGain = Object.fromEntries(sideKeys.map((sideKey) => [
    sideKey,
    numeric(observedAfter[sideKey], 0) - numeric(observedBefore[sideKey], 0),
  ]));
  const priorLedgerKeys = new Set((preTerminalState.scenario?.scoringHistory || [])
    .map((row) => String(row.key || "")));
  const settlementRows = (terminalState.scenario?.scoringHistory || []).filter((row) =>
    !priorLedgerKeys.has(String(row.key || "")));
  const scoringElementObserved = settlementRows.some((row) =>
    String(row.elementKey || "") === String(cell.scoringElementKey || ""));
  const issues = [];
  if (!scoreMapsEqual(observedBefore, expectedBefore)) {
    issues.push({
      reason: "terminal_spatial_score_before_mismatch",
      expectedBefore,
      observedBefore,
    });
  }
  if (!scoreMapsEqual(observedGain, expectedGain)) {
    issues.push({
      reason: "terminal_spatial_score_gain_mismatch",
      expectedGain,
      observedGain,
    });
  }
  if (!scoringElementObserved) {
    issues.push({
      reason: "terminal_spatial_declared_scoring_element_not_observed",
      scoringElementKey: cell.scoringElementKey || "",
      observedElementKeys: settlementRows.map((row) => row.elementKey).sort(),
    });
  }
  return {
    evidence: stableGraphValue({
      expectedBefore,
      observedBefore,
      expectedGain,
      observedGain,
      observedAfter,
      scoringElementKey: cell.scoringElementKey || "",
      settlementRows,
      exactWithinScope: issues.length === 0,
    }),
    issues,
  };
}

function terminalSpecification(cell = {}) {
  return cell.goalType === "assassination" ? {
    goalType: "assassination",
    winnerSideKey: cell.winnerSideKey,
  } : {
    goalType: "scenario_score",
    winnerSideKey: cell.winnerSideKey,
    endingSideKey: cell.endingSideKey,
    scoringSideKey: cell.winnerSideKey,
  };
}

export function materializeWarmachineTerminalSpatialCellsV1(
  stateTemplateInput = {},
  terminalCellsInput = [],
  rawOptions = {},
) {
  const cells = (Array.isArray(terminalCellsInput)
    ? terminalCellsInput
    : [terminalCellsInput]).filter(Boolean);
  const maximumCells = Math.max(1, Math.floor(numeric(rawOptions.maximumCells, 10_000)));
  const roots = [];
  const rejected = [];
  const strictRejected = [];
  const proposalFiltered = [];
  const inputInvalid = [];
  const deferred = [];
  const recordDisposition = (row, disposition, authority) => {
    const entry = materializationDispositionEntry(row, disposition, authority);
    rejected.push(entry);
    if (disposition === MATERIALIZATION_DISPOSITIONS.STRICT_REJECTED) {
      strictRejected.push(entry);
    } else if (disposition === MATERIALIZATION_DISPOSITIONS.PROPOSAL_FILTERED) {
      proposalFiltered.push(entry);
    } else if (disposition === MATERIALIZATION_DISPOSITIONS.INPUT_INVALID) {
      inputInvalid.push(entry);
    }
  };
  for (const [index, cell] of cells.entries()) {
    if (index >= maximumCells) {
      deferred.push(materializationDispositionEntry({
        cellKey: String(cell.cellKey || ""),
        reason: "terminal_spatial_materialization_budget_exhausted",
      }, MATERIALIZATION_DISPOSITIONS.BUDGET_DEFERRED, "search_budget"));
      continue;
    }
    if (cell.schemaVersion !== WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA ||
        cell.geometryRelationCell?.exactCoordinatesKnown !== true) {
      recordDisposition({
        cellKey: String(cell.cellKey || ""),
        reason: "terminal_spatial_exact_coordinate_cell_required",
      }, MATERIALIZATION_DISPOSITIONS.INPUT_INVALID, "input_contract");
      continue;
    }
    const coordinateResult = materializeCoordinates(stateTemplateInput, cell, rawOptions);
    const relationResult = evaluateRelationChecks(coordinateResult.state, cell);
    const staticPlacementAudit = auditRulesV1StaticPlacement(coordinateResult.state);
    const anchorPieceKeyByUnitGroupKey = Object.fromEntries(
      (cell.geometryRelationCell?.generationEvidence?.remainingPlacementEvidence
        ?.unitFormationAudit || []).map((audit) => [
        audit.unitGroupKey,
        audit.anchorPieceKey,
      ]),
    );
    const staticUnitFormationAudit = auditRulesV1StaticUnitFormation(
      coordinateResult.state,
      { anchorPieceKeyByUnitGroupKey },
    );
    const issues = [
      ...coordinateResult.issues,
      ...relationResult.issues,
      ...staticPlacementAudit.issues.map((issue) => ({
        reason: "terminal_spatial_static_placement_rejected",
        authority: "rules_v1_host",
        ...issue,
      })),
      ...staticUnitFormationAudit.issues.map((issue) => ({
        reason: "terminal_spatial_static_unit_formation_rejected",
        authority: "rules_v1_host",
        ...issue,
      })),
    ];
    const inputIssues = issues.filter((issue) => issue.authority === "input_contract");
    const hostAuditIssues = issues.filter((issue) => issue.authority === "rules_v1_host");
    const proposalIssues = issues.filter((issue) => issue.authority === "candidate_preflight");
    if (inputIssues.length || hostAuditIssues.length) {
      const disposition = inputIssues.length
        ? MATERIALIZATION_DISPOSITIONS.INPUT_INVALID
        : MATERIALIZATION_DISPOSITIONS.STRICT_REJECTED;
      const authority = inputIssues.length ? "input_contract" : "rules_v1_host";
      recordDisposition({
        cellKey: cell.cellKey,
        reason: "terminal_spatial_geometry_rejected",
        issues: stableGraphValue(issues),
        hostReplayAttempted: false,
        hostReplayAccepted: false,
      }, disposition, authority);
      continue;
    }
    const terminalRouteSteps = rawOptions.terminalRouteStepsByCellKey?.[cell.cellKey] ||
      rawOptions.terminalRouteSteps || null;
    const terminalAction = rawOptions.terminalActionByCellKey?.[cell.cellKey] ||
      rawOptions.terminalAction || null;
    const routeSteps = Array.isArray(terminalRouteSteps) && terminalRouteSteps.length
      ? terminalRouteSteps
      : terminalAction ? [terminalAction] : [];
    if (!routeSteps.length) {
      recordDisposition({
        cellKey: cell.cellKey,
        reason: "terminal_spatial_terminal_action_route_required",
      }, MATERIALIZATION_DISPOSITIONS.INPUT_INVALID, "input_contract");
      continue;
    }
    const witness = replayWarmachineTerminalRouteStrictV2(
      coordinateResult.state,
      routeSteps,
      terminalSpecification(cell),
      {
        routeKey: `terminal-spatial-materialization:${cell.cellKey}`,
        onProgress: rawOptions.onStrictReplayProgress,
      },
    );
    if (!witness.strictWitness) {
      recordDisposition({
        cellKey: cell.cellKey,
        reason: "terminal_spatial_strict_terminal_transition_rejected",
        strictRejection: stableGraphValue(witness.rejected),
        terminalProof: stableGraphValue(witness.proof),
        candidatePreflightIssues: stableGraphValue(proposalIssues),
        hostReplayAttempted: true,
        hostReplayAccepted: false,
      }, MATERIALIZATION_DISPOSITIONS.STRICT_REJECTED, "rules_v1_host");
      continue;
    }
    if (proposalIssues.length) {
      recordDisposition({
        cellKey: cell.cellKey,
        reason: "terminal_spatial_proposal_relation_rejected",
        issues: stableGraphValue(proposalIssues),
        terminalReceiptHash: witness.terminalReceiptHash,
        hostReplayAttempted: true,
        hostReplayAccepted: true,
      }, MATERIALIZATION_DISPOSITIONS.PROPOSAL_FILTERED, "candidate_preflight");
      continue;
    }
    const scoreTransition = evaluateScoreTransition(
      coordinateResult.state,
      witness.finalState,
      cell,
    );
    if (scoreTransition.issues.length) {
      recordDisposition({
        cellKey: cell.cellKey,
        reason: "terminal_spatial_score_transition_rejected",
        issues: stableGraphValue(scoreTransition.issues),
        scoreEvidence: scoreTransition.evidence,
        terminalReceiptHash: witness.terminalReceiptHash,
        hostReplayAttempted: true,
        hostReplayAccepted: true,
      }, MATERIALIZATION_DISPOSITIONS.PROPOSAL_FILTERED, "terminal_goal_contract");
      continue;
    }
    const core = {
      cellKey: cell.cellKey,
      goalType: cell.goalType,
      roundNumber: cell.roundNumber,
      preTerminalStateHash: stableGraphHash(coordinateResult.state),
      terminalStateHash: stableGraphHash(witness.finalState),
      exactCoordinates: stableGraphValue(coordinateResult.positions),
      relationEvidence: stableGraphValue(relationResult.evidence),
      scoreTransitionEvidence: scoreTransition.evidence,
      staticPlacementAudit: stableGraphValue(staticPlacementAudit),
      staticUnitFormationAudit: stableGraphValue(staticUnitFormationAudit),
      preTerminalAssumptions: coordinateResult.preTerminalAssumptions,
      strictReceiptHashes: witness.receipts.map((receipt) => receipt.receiptHash),
      strictTerminalRouteStepCount: routeSteps.length,
      terminalReceiptHash: witness.terminalReceiptHash,
      status: "strict_materialized",
      strictMaterialized: true,
      reachabilityProven: false,
      trainingTruth: false,
      upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    };
    roots.push({
      ...core,
      rootKey: `terminal-spatial-root-${stableGraphHash(core, 32)}`,
      preTerminalState: coordinateResult.state,
      terminalState: witness.finalState,
      strictWitness: witness,
    });
  }
  const publicRoots = roots.map(({
    preTerminalState: _preTerminalState,
    terminalState: _terminalState,
    strictWitness: _strictWitness,
    ...root
  }) => root);
  const core = {
    schemaVersion: WARMACHINE_TERMINAL_SPATIAL_MATERIALIZER_V1_SCHEMA,
    inputCellCount: cells.length,
    strictMaterializedCount: roots.length,
    rejectedCount: rejected.length,
    strictRejectedCount: strictRejected.length,
    proposalFilteredCount: proposalFiltered.length,
    inputInvalidCount: inputInvalid.length,
    deferredCount: deferred.length,
    dispositionCounts: stableGraphValue({
      strict_materialized: roots.length,
      strict_rejected: strictRejected.length,
      proposal_filtered: proposalFiltered.length,
      input_invalid: inputInvalid.length,
      budget_deferred: deferred.length,
    }),
    roots: stableGraphValue(publicRoots),
    rejected: stableGraphValue(rejected),
    strictRejected: stableGraphValue(strictRejected),
    proposalFiltered: stableGraphValue(proposalFiltered),
    inputInvalid: stableGraphValue(inputInvalid),
    deferred: stableGraphValue(deferred),
    trainingTruth: false,
    rulesAuthorityAudit: stableGraphValue({
      strictRulesAuthority: "project_d_rules_v1_host",
      candidatePreflightCanStrictReject: false,
      interactionGraphCanStrictReject: false,
      inputContractCanStrictReject: false,
      terminalActionRequiresHostReplay: true,
    }),
    claimBoundary: "Each accepted root is one explicit later-round spatial hypothesis whose placement, formation and terminal route reached the Project D rules-v1 Host. Only Host audit or strict replay failures are strict_rejected. Input defects and local relation/proposal checks remain separately visible and have no rules authority. Target damage and phase values are explicit terminal-hypothesis assumptions, not inferred history. This is not an opening or deployment state and does not prove reverse reachability to legal deployment.",
  };
  return {
    ...core,
    runtimeRoots: roots,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: roots.length > 0,
  };
}
