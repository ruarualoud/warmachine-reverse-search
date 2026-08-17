import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { replayWarmachineTerminalReverseRouteV1 } from
  "../reverse/replay-terminal-reverse-route-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../reverse/terminal-event-predecessor-v1.mjs";
import { warmachineHost } from "../warmachine-host-runtime.mjs";
import {
  classifyWarmachineReverseDispositionV1,
  WARMACHINE_REVERSE_DISPOSITION_KINDS_V1,
  warmachineReverseDispositionProtocolV1,
} from "./reverse-disposition-v1.mjs";

export const WARMACHINE_SEARCH_CONSOLE_SNAPSHOT_V1_SCHEMA =
  "warmachine_search_console_snapshot_v1";

const ACTION_LABELS = Object.freeze({
  advance: "推进",
  run: "奔跑",
  charge: "冲锋",
  pass: "结束激活",
  melee_attack: "近战攻击",
  ranged_attack: "远程攻击",
  cast_spell: "施法",
  end_turn: "结束回合并结算",
  end_maintenance_phase: "结束维护阶段",
  end_control_replenishment: "完成资源补充",
  end_control_phase: "结束控制阶段",
  decline_reposition: "放弃复仇移动",
  resolve_lifecycle_trigger_use: "使用生命周期触发",
  resolve_lifecycle_trigger_decline: "放弃生命周期触发",
});

const STRUCTURAL_ACTION_TYPES = new Set([
  "pass",
  "end_turn",
  "end_maintenance_phase",
  "end_control_replenishment",
  "end_control_phase",
  "decline_reposition",
  "resolve_lifecycle_trigger_decline",
]);

const MOVEMENT_ACTION_TYPES = new Set([
  "advance",
  "run",
  "charge",
  "place",
  "reposition",
]);

const ATTACK_ACTION_TYPES = new Set([
  "melee_attack",
  "ranged_attack",
  "power_attack",
]);

function actionLabel(actionType = "") {
  return ACTION_LABELS[actionType] || actionType || "状态连接";
}

function summarizePiece(piece = {}) {
  return stableGraphValue({
    pieceKey: String(piece.pieceKey || ""),
    label: String(piece.label || piece.name || piece.pieceKey || ""),
    sideKey: String(piece.sideKey || ""),
    modelRole: String(piece.modelRole || ""),
    modelType: String(piece.modelType || ""),
    cardId: String(piece.cardId || piece.cardSnapshot?.id || ""),
    cardName: String(piece.cardName || piece.cardSnapshot?.name || ""),
    modelId: String(piece.modelId || ""),
    modelName: String(piece.modelName || piece.label || piece.name || ""),
    portraitPath: String(piece.portraitPath || piece.cardSnapshot?.portraitPath || ""),
    position: piece.position || null,
    baseSizeIn: Number(piece.baseSizeIn || 1.18),
    activated: piece.activated === true,
    destroyed: piece.destroyed === true,
    removedFromPlay: piece.removedFromPlay === true,
    resourcePoints: Number(piece.resourcePoints ?? piece.focus ?? piece.fury ?? 0),
    boxesRemaining: Number(piece.damage?.boxesRemaining ?? piece.boxesRemaining ?? 0),
    maxBoxes: Number(piece.damage?.maxBoxes ?? piece.maxBoxes ?? 0),
    isLeader: piece.isWarcaster === true || piece.isWarlock === true,
  });
}

function summarizeState(state = {}, stateHash = "") {
  return stableGraphValue({
    nodeId: `state-${stateHash}`,
    stateHash,
    stateKey: String(state.stateKey || ""),
    turnNumber: Number(state.turnNumber || 0),
    activeSideKey: String(state.activeSideKey || ""),
    phaseKey: String(state.phaseKey || ""),
    board: stableGraphValue(state.board || { widthIn: 48, heightIn: 48 }),
    score: stableGraphValue(state.scenario?.score || {}),
    scoringHistory: stableGraphValue(state.scenario?.scoringHistory || []),
    objectives: stableGraphValue(state.scenario?.objectives || []),
    caches: stableGraphValue(state.scenario?.caches || []),
    terrain: stableGraphValue(state.terrain || []),
    pieces: (state.pieces || []).map(summarizePiece),
  });
}

function branchFromFrontier(frontier, terminalState, index, kind) {
  const candidateKey = String(frontier.candidateKey || frontier.labelKey ||
    `${kind}-${index}`);
  const route = {
    candidateKey,
    predecessorState: frontier.state,
    predecessorStateHash: frontier.stateHash,
    reverseEdges: frontier.reverseEdges || [],
  };
  const replay = replayWarmachineTerminalReverseRouteV1(route, terminalState, {
    routeKey: `search-console:${candidateKey}`,
    maximumControlSteps: 128,
    captureTrainingTrace: true,
  });
  return { candidateKey, frontier, replay, kind };
}

function terminalProbability(search = {}) {
  const intervals = (search.terminalEventPredecessors || []).map((row) =>
    row.matchedProbabilityInterval || (row.matchedProbability
      ? { lower: row.matchedProbability, upper: row.matchedProbability }
      : null)).filter(Boolean);
  return intervals[0] || { lower: 0, upper: 1 };
}

function numericMapDelta(before = {}, after = {}) {
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
    .sort();
  return Object.fromEntries(keys.map((key) => [
    key,
    Number(after?.[key] || 0) - Number(before?.[key] || 0),
  ]));
}

function aggregatePieceDelta(before = {}, after = {}) {
  const beforePieces = new Map((before.pieces || []).map((piece) => [piece.pieceKey, piece]));
  const sideKeys = [...new Set([
    ...(before.pieces || []).map((piece) => piece.sideKey),
    ...(after.pieces || []).map((piece) => piece.sideKey),
  ])].filter(Boolean).sort();
  const boxesLostBySide = Object.fromEntries(sideKeys.map((sideKey) => [sideKey, 0]));
  const resourceDeltaBySide = Object.fromEntries(sideKeys.map((sideKey) => [sideKey, 0]));
  const removedPieceCountBySide = Object.fromEntries(sideKeys.map((sideKey) => [sideKey, 0]));
  for (const piece of after.pieces || []) {
    const prior = beforePieces.get(piece.pieceKey);
    if (!prior || !piece.sideKey) continue;
    boxesLostBySide[piece.sideKey] += Math.max(0,
      Number(prior.boxesRemaining || 0) - Number(piece.boxesRemaining || 0));
    resourceDeltaBySide[piece.sideKey] +=
      Number(piece.resourcePoints || 0) - Number(prior.resourcePoints || 0);
    if ((piece.destroyed || piece.removedFromPlay) &&
        !(prior.destroyed || prior.removedFromPlay)) {
      removedPieceCountBySide[piece.sideKey] += 1;
    }
  }
  return { boxesLostBySide, resourceDeltaBySide, removedPieceCountBySide };
}

export function summarizeWarmachineSearchConsoleBranchEvidenceV1(rawInput = {}) {
  const branchEdgeIds = rawInput.branchEdgeIds || [];
  const nodes = new Map((rawInput.nodes || []).map((node) => [node.nodeId, node]));
  const edges = new Map((rawInput.edges || []).map((edge) => [edge.edgeId, edge]));
  const probabilityInterval = rawInput.probabilityInterval || { lower: 0, upper: 1 };
  const routeEdges = branchEdgeIds.map((edgeId) => edges.get(edgeId)).filter(Boolean);
  const firstState = routeEdges.length
    ? nodes.get(routeEdges[0].predecessorNodeId)
    : null;
  const lastState = routeEdges.length
    ? nodes.get(routeEdges.at(-1).successorNodeId)
    : null;
  const actionHistogram = {};
  for (const edge of routeEdges) {
    actionHistogram[edge.actionType] = Number(actionHistogram[edge.actionType] || 0) + 1;
  }
  const keyActions = routeEdges.filter((edge) => !STRUCTURAL_ACTION_TYPES.has(edge.actionType))
    .map((edge) => ({
      edgeId: edge.edgeId,
      actionType: edge.actionType,
      actionLabel: edge.actionLabel,
      actorPieceKey: edge.actorPieceKey,
      targetPieceKey: edge.targetPieceKey,
    })).slice(-8);
  const pieceDelta = firstState && lastState
    ? aggregatePieceDelta(firstState, lastState)
    : { boxesLostBySide: {}, resourceDeltaBySide: {}, removedPieceCountBySide: {} };
  return stableGraphValue({
    actionCount: routeEdges.length,
    decisiveActionCount: routeEdges.filter((edge) =>
      !STRUCTURAL_ACTION_TYPES.has(edge.actionType)).length,
    structuralActionCount: routeEdges.filter((edge) =>
      STRUCTURAL_ACTION_TYPES.has(edge.actionType)).length,
    distinctActorCount: new Set(routeEdges.map((edge) => edge.actorPieceKey)
      .filter(Boolean)).size,
    movementActionCount: routeEdges.filter((edge) =>
      MOVEMENT_ACTION_TYPES.has(edge.actionType)).length,
    attackActionCount: routeEdges.filter((edge) =>
      ATTACK_ACTION_TYPES.has(edge.actionType)).length,
    spellActionCount: Number(actionHistogram.cast_spell || 0),
    actionHistogram,
    keyActions,
    startsAt: firstState ? {
      turnNumber: firstState.turnNumber,
      activeSideKey: firstState.activeSideKey,
      phaseKey: firstState.phaseKey,
      stateHash: firstState.stateHash,
    } : null,
    endsAt: lastState ? {
      turnNumber: lastState.turnNumber,
      activeSideKey: lastState.activeSideKey,
      phaseKey: lastState.phaseKey,
      stateHash: lastState.stateHash,
    } : null,
    scoreDeltaBySide: firstState && lastState
      ? numericMapDelta(firstState.score, lastState.score)
      : {},
    ...pieceDelta,
    strictActionSpaceClosedWithinDeclaredScope: routeEdges.every((edge) =>
      edge.legalActionSpaceCompleteWithinDeclaredScope === true),
    strictReceiptCount: routeEdges.filter((edge) => edge.strictReceiptHash).length,
    viewOrderingOnly: true,
    strategyScorePresent: false,
    probabilityInterval,
  });
}

export function projectWarmachineSearchConsoleSnapshotV1(rawInput = {}) {
  const search = rawInput.search || {};
  const terminalState = rawInput.terminalState || {};
  const terminalCell = rawInput.terminalCell || {};
  const runtimeFrontiers = search.runtimeReachedPriorTurnFrontiers || [];
  const routeFrontiers = (search.routes || []).map((route) => ({
    ...route,
    state: route.predecessorState,
    stateHash: route.predecessorStateHash,
  }));
  const branchInputs = [
    ...routeFrontiers.map((row) => ({ row, kind: "legal_deployment_route" })),
    ...runtimeFrontiers.map((row) => ({ row, kind: "prior_turn_frontier" })),
  ];
  const runtimeBranches = branchInputs.map(({ row, kind }, index) =>
    branchFromFrontier(row, terminalState, index, kind));
  const states = new Map();
  const edges = new Map();
  const branches = [];
  for (const [branchIndex, runtime] of runtimeBranches.entries()) {
    for (const entry of runtime.replay.runtimeTrainingStateEntries || []) {
      if (!states.has(entry.stateHash)) {
        states.set(entry.stateHash, summarizeState(entry.state, entry.stateHash));
      }
    }
    const branchEdgeIds = [];
    for (const decision of runtime.replay.trainingTrace?.decisions || []) {
      const edgeCore = stableGraphValue({
        branchKey: runtime.candidateKey,
        predecessorNodeId: `state-${decision.predecessorStateHash}`,
        successorNodeId: `state-${decision.successorStateHash}`,
        actionType: decision.selectedAction?.actionType || "",
        actionLabel: actionLabel(decision.selectedAction?.actionType),
        actorPieceKey: decision.selectedAction?.actorPieceKey || "",
        targetPieceKey: decision.selectedAction?.targetPieceKey || "",
        legalActionCount: decision.legalActions?.length || 0,
        legalActionSpaceCompleteWithinDeclaredScope:
          decision.legalActionSpaceCompleteWithinDeclaredScope === true,
        strictTransitionAccepted: decision.strictTransitionAccepted === true,
        strictReceiptHash: decision.strictReceiptHash || "",
        layerKey: decision.layerKey || "",
        operatorKey: decision.operatorKey || "",
        actionPatch: decision.actionPatch || {},
        witnessPayload: decision.witnessPayload || {},
        terminalEvents: decision.terminalEvents || [],
      });
      const edgeId = `edge-${stableGraphHash(edgeCore, 32)}`;
      if (!edges.has(edgeId)) edges.set(edgeId, { edgeId, ...edgeCore });
      branchEdgeIds.push(edgeId);
    }
    branches.push(stableGraphValue({
      branchKey: runtime.candidateKey,
      label: `可达分支 ${branchIndex + 1}`,
      kind: runtime.kind,
      disposition: runtime.replay.fullRouteStrictReplayCertified
        ? "strict_certified"
        : "strict_replay_failed",
      completeToDeployment: runtime.kind === "legal_deployment_route",
      reversedPriorTurnCount: Number(runtime.frontier.reversedPriorTurnCount || 0),
      probabilityInterval: terminalProbability(search),
      edgeIds: branchEdgeIds,
      nodeIds: branchEdgeIds.flatMap((edgeId) => {
        const edge = edges.get(edgeId);
        return edge ? [edge.predecessorNodeId, edge.successorNodeId] : [];
      }).filter((nodeId, position, rows) => rows.indexOf(nodeId) === position),
      strictReplay: {
        certified: runtime.replay.fullRouteStrictReplayCertified,
        replayedEdgeCount: runtime.replay.replayedEdgeCount,
        decisionCount: runtime.replay.trainingTrace?.decisionCount || 0,
        failures: runtime.replay.failures,
        replayHash: runtime.replay.replayHash,
      },
      evidenceSummary: summarizeWarmachineSearchConsoleBranchEvidenceV1({
        branchEdgeIds,
        nodes: [...states.values()],
        edges: [...edges.values()],
        probabilityInterval: terminalProbability(search),
      }),
      routeLayers: (runtime.frontier.reverseEdges || []).map((edge) => ({
        layerKey: edge.layerKey,
        operatorKey: edge.operatorKey,
        actionTypes: (edge.strictReplaySteps || []).map((step) => step.actionType),
      })),
    }));
  }
  const rejected = (search.rejected || []).map((row, index) => {
    const disposition = classifyWarmachineReverseDispositionV1(row, "strict_rejected");
    return stableGraphValue({
      ...row,
      dispositionId: `rejected-${stableGraphHash({ row, index }, 24)}`,
      disposition,
      recoveryProtocol: warmachineReverseDispositionProtocolV1(disposition),
    });
  });
  const unresolved = (search.unresolved || []).map((row, index) => {
    const disposition = classifyWarmachineReverseDispositionV1(row);
    return stableGraphValue({
      ...row,
      dispositionId: `unresolved-${stableGraphHash({ row, index }, 24)}`,
      disposition,
      recoveryProtocol: warmachineReverseDispositionProtocolV1(disposition),
    });
  });
  const dispositions = [...rejected, ...unresolved];
  const dispositionKinds = WARMACHINE_REVERSE_DISPOSITION_KINDS_V1;
  const terminalSemanticHash = warmachineReverseStateSemanticHashV1(terminalState);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_SEARCH_CONSOLE_SNAPSHOT_V1_SCHEMA,
    sessionId: String(rawInput.sessionId || ""),
    generatedAt: new Date().toISOString(),
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    seed: rawInput.seed || {},
    terminal: {
      nodeSemanticHash: terminalSemanticHash,
      cellKey: String(terminalCell.cellKey || ""),
      scenarioKey: String(terminalCell.scenarioKey || ""),
      goalType: String(terminalCell.goalType || ""),
      roundNumber: Number(terminalCell.roundNumber || 0),
      winnerSideKey: String(terminalCell.winnerSideKey || ""),
      endingSideKey: String(terminalCell.endingSideKey || ""),
      causalActionFamily: String(terminalCell.causalActionFamily || ""),
      terminalScore: terminalState.scenario?.score || {},
      actorPieceKey: String(terminalCell.actorPieceKey || ""),
      targetLeaderPieceKey: String(terminalCell.targetLeaderPieceKey || ""),
      relationSummary: stableGraphValue({
        scenarioRelation: String(terminalCell.geometryRelationCell?.scenarioRelation || ""),
        actionRangeBand: String(
          terminalCell.geometryRelationCell?.actorToTargetRangeBand || "",
        ),
        lineOfSightRelation: String(
          terminalCell.geometryRelationCell?.lineOfSightRelation || "",
        ),
        baseRelation: String(terminalCell.geometryRelationCell?.baseRelation || ""),
        pathRelation: String(terminalCell.geometryRelationCell?.pathRelation || ""),
      }),
      assumptionLedger: Object.entries(terminalCell.assumptionSources || {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([fieldKey, sourceKind]) => stableGraphValue({
          fieldKey,
          sourceKind,
          evidenceState: terminalCell.strictCertified === true
            ? "strict_certified"
            : "materialized",
        })),
    },
    graph: {
      nodes: [...states.values()],
      edges: [...edges.values()],
      branches,
    },
    dispositions,
    dispositionCounts: Object.fromEntries(dispositionKinds.map((kind) => [
      kind,
      dispositions.filter((row) => row.disposition === kind).length,
    ])),
    searchCoverage: {
      routeLabelCount: Number(search.routeLabelCount || 0),
      processedLabelCount: Number(search.processedLabelCount || 0),
      expandedLabelCount: Number(search.expandedLabelCount || 0),
      uniqueStateCount: Number(search.uniqueStateCount || 0),
      foundBranchCount: branches.length,
      strictCertifiedBranchCount: branches.filter((row) =>
        row.disposition === "strict_certified").length,
      completeDeploymentRouteCount: Number(search.legalDeploymentRouteCount || 0),
      unresolvedCount: Number(search.unresolvedCount || 0),
      rejectedBranchCount: Number(search.rejectedBranchCount || 0),
      witnessStopDeferredLabelCount: Number(search.witnessStopDeferredLabelCount || 0),
      resumeCheckpoint: stableGraphValue(search.resumeCheckpoint || {
        requested: false,
        accepted: false,
        deferredFrontierCount: 0,
      }),
      exhaustiveOverContinuousPaths:
        search.movementProposalUniverse?.exhaustiveOverContinuousPaths === true,
    },
    trainingTruth: false,
    strategyScorePresent: false,
    claimBoundary: "The console displays every discovered strict-replayed branch and every retained rejection, unresolved or budget-deferred row in this bounded run. A green branch is a reachability witness, not a strategy ranking, natural win-rate estimate or global-optimality proof.",
  });
  return {
    ...core,
    snapshotHash: stableGraphHash(core),
    ok: branches.some((row) => row.disposition === "strict_certified"),
  };
}
