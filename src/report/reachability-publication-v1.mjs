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

export const WARMACHINE_REACHABILITY_PUBLICATION_V1_SCHEMA =
  "warmachine_reachability_publication_v1";
export const WARMACHINE_REACHABILITY_HUMAN_REPORT_V1_SCHEMA =
  "warmachine_reachability_human_report_v1";
export const WARMACHINE_REACHABILITY_TRAINING_TRAJECTORY_V1_SCHEMA =
  "warmachine_reachability_training_trajectory_v1";

const ASSUMPTION_STATUSES = new Set([
  "proposed",
  "materialized",
  "strict-certified",
  "unresolved",
  "rejected",
]);

function assumptionValue(cell = {}, key = "") {
  if (Object.hasOwn(cell, key)) return stableGraphValue(cell[key]);
  if (key === "goalType") return String(cell.goalType || "");
  if (key === "scenarioKey") return String(cell.scenarioKey || "");
  if (key === "rosterReceiptHash") return String(cell.rosterReceiptHash || "");
  return null;
}

function assumptionLedger(cell = {}, evidenceByKey = {}) {
  return Object.entries(cell.assumptionSources || {}).map(([key, source]) => {
    const evidence = evidenceByKey[key] || {};
    const requestedStatus = String(evidence.status || "proposed");
    const status = ASSUMPTION_STATUSES.has(requestedStatus)
      ? requestedStatus
      : "unresolved";
    const evidenceHashes = [...new Set((evidence.evidenceHashes || [])
      .map(String).filter(Boolean))].sort();
    const contractViolations = [];
    if (["materialized", "strict-certified"].includes(status) && !evidenceHashes.length) {
      contractViolations.push("evidence_hash_required");
    }
    if (["unresolved", "rejected"].includes(status) && !String(evidence.reason || "")) {
      contractViolations.push("reason_required");
    }
    return stableGraphValue({
      assumptionKey: key,
      value: assumptionValue(cell, key),
      source: String(source || ""),
      status,
      evidenceKind: String(evidence.evidenceKind || ""),
      evidenceHashes,
      reason: String(evidence.reason || ""),
      requiredForTraining: evidence.requiredForTraining !== false,
      contractViolations,
    });
  }).sort((left, right) => left.assumptionKey.localeCompare(right.assumptionKey));
}

function dispositionLedger(search = {}, extraRows = []) {
  const rows = [
    ...(search.rejected || []).map((row) => ({ ...row, _fallback: "strict_rejected" })),
    ...(search.unresolved || []).map((row) => ({ ...row, _fallback: "inverse_unresolved" })),
    ...extraRows,
  ].map((row, index) => {
    const disposition = classifyWarmachineReverseDispositionV1(
      row,
      row._fallback || "inverse_unresolved",
    );
    return stableGraphValue({
      evidenceKey: String(row.evidenceKey ||
        `disposition-${stableGraphHash({ index, row }, 24)}`),
      disposition,
      recoveryProtocol: warmachineReverseDispositionProtocolV1(disposition),
      stageKey: String(row.stageKey || ""),
      stateHash: String(row.stateHash || row.predecessorStateHash || ""),
      candidateKey: String(row.candidateKey || ""),
      reason: String(row.reason || row.disposition || ""),
      detail: stableGraphValue(Object.fromEntries(Object.entries(row)
        .filter(([key]) => key !== "_fallback"))),
      eligibleAsNegativeTrainingExample: false,
    });
  }).sort((left, right) => left.evidenceKey.localeCompare(right.evidenceKey));
  const kinds = WARMACHINE_REVERSE_DISPOSITION_KINDS_V1;
  return {
    rows,
    counts: Object.fromEntries(kinds.map((kind) => [
      kind,
      rows.filter((row) => row.disposition === kind).length,
    ])),
  };
}

function routeLayers(route = {}) {
  return (route.reverseEdges || []).map((edge, reverseIndex) => stableGraphValue({
    reverseIndex,
    layerKey: String(edge.layerKey || ""),
    operatorKey: String(edge.operatorKey || ""),
    predecessorStateHash: String(edge.predecessorStateHash || ""),
    successorStateHash: String(edge.successorStateHash || ""),
    actorPieceKey: String(edge.actorPieceKey || ""),
    targetPieceKey: String(edge.targetPieceKey || ""),
    actionType: String(edge.actionType || ""),
    strictReplayActionTypes: (edge.strictReplaySteps || []).map((step) =>
      String(step.actionType || "")),
    strictReceiptHashes: [
      edge.strictReceiptHash,
      ...(edge.strictStepReceiptHashes || []),
    ].map(String).filter(Boolean),
    resourceAndTimingMutation: edge.mutation || null,
    movementWitness: edge.movementProposal || null,
    localForwardConnector: String(edge.operatorKey || "").includes("forward_completion"),
    strictWitness: edge.strictWitness === true,
  }));
}

function rosterRows(route = {}) {
  return (route.predecessorState?.pieces || []).map((piece) => stableGraphValue({
    pieceKey: String(piece.pieceKey || ""),
    label: String(piece.label || piece.name || piece.pieceKey || ""),
    sideKey: String(piece.sideKey || ""),
    modelType: String(piece.modelType || piece.modelRole || ""),
    cardSourceId: String(piece.cardSnapshot?.id || piece.sourceId || ""),
    pointCost: Number(piece.cardSnapshot?.pointCostNumber ?? piece.pointCost ?? 0),
    deploymentPosition: piece.position || null,
    lifecycle: {
      destroyed: piece.destroyed === true,
      removedFromPlay: piece.removedFromPlay === true,
      offTable: piece.offTable === true,
      boxesRemaining: Number(piece.damage?.boxesRemaining ?? piece.boxesRemaining ?? 0),
      maxBoxes: Number(piece.damage?.maxBoxes ?? piece.maxBoxes ?? 0),
    },
  })).sort((left, right) => left.pieceKey.localeCompare(right.pieceKey));
}

function terminalSummary(cell = {}, terminalState = {}) {
  return stableGraphValue({
    cellKey: String(cell.cellKey || ""),
    goalType: String(cell.goalType || ""),
    scenarioKey: String(cell.scenarioKey || ""),
    roundNumber: Number(cell.roundNumber || 0),
    endingSideKey: String(cell.endingSideKey || ""),
    winnerSideKey: String(cell.winnerSideKey || ""),
    loserSideKey: String(cell.loserSideKey || ""),
    causalActionFamily: String(cell.causalActionFamily || ""),
    actorPieceKey: String(cell.actorPieceKey || ""),
    targetLeaderPieceKey: String(cell.targetLeaderPieceKey || ""),
    scoringElementKey: String(cell.scoringElementKey || ""),
    targetBoxesBeforeFinal: cell.targetBoxesBeforeFinal ?? null,
    resourceEnvelopeKey: String(cell.resourceEnvelopeKey || ""),
    scoreBeforeTerminalCell: cell.scoreBeforeTerminalCell || null,
    terminalScoreGainCell: cell.terminalScoreGainCell || null,
    geometryRelationCell: cell.geometryRelationCell || null,
    terminalStateHash: warmachineReverseStateSemanticHashV1(terminalState),
    terminalScore: terminalState.scenario?.score || {},
    scoringHistory: terminalState.scenario?.scoringHistory || [],
  });
}

function trainingGate({
  route,
  replay,
  search,
  assumptions,
  probabilityClosure,
  opponentResponseClosure,
}) {
  const checks = {
    legalDeploymentReached: route?.legalDeploymentReached === true &&
      route?.deploymentAudit?.legalDeploymentReached === true,
    routeStrictWitness: route?.strictWitness === true,
    independentStrictReplay: replay.fullRouteStrictReplayCertified === true,
    freshEnumerationEveryTransition: replay.freshEnumerationBeforeEveryTransition === true,
    oracleIsolation: search.oracleIsolationAudit?.passed === true &&
      search.oracleIsolationAudit?.openingRead !== true &&
      search.oracleIsolationAudit?.forwardRouteRead !== true &&
      search.oracleIsolationAudit?.intermediateStateRead !== true,
    probabilityClosure: probabilityClosure.complete === true &&
      probabilityClosure.massConserved === true,
    opponentResponseClosure: opponentResponseClosure.complete === true,
    requiredAssumptionsStrictCertified: assumptions
      .filter((row) => row.requiredForTraining)
      .every((row) => row.status === "strict-certified" &&
        row.contractViolations.length === 0),
    routeHasNoUnresolvedReasons: (route?.unresolvedReasons || []).length === 0,
    trainingTraceCaptured: replay.trainingTrace?.captured === true &&
      replay.trainingTrace?.decisionCount > 0,
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed)
    .map(([key]) => key);
  return {
    checks,
    failedChecks,
    eligible: failedChecks.length === 0,
  };
}

function humanMarkdown(report = {}) {
  const lines = [
    `# Warmachine 反向可达性报告`,
    "",
    `- 候选：\`${report.routeCandidateKey || "无"}\``,
    `- 终局：${report.terminal.goalType}，第 ${report.terminal.roundNumber} 轮，胜者 ${report.terminal.winnerSideKey}`,
    `- 合法部署：${report.deployment?.legalDeploymentReached === true ? "是" : "否"}`,
    `- 独立 strict 重放：${report.strictReplay.fullRouteStrictReplayCertified === true ? "通过" : "未通过"}`,
    `- 训练候选：${report.trainingGate.eligible ? "允许导出" : "禁止导出"}`,
    "",
    "## 终局假设",
    "",
    "| 假设 | 来源 | 状态 |",
    "| --- | --- | --- |",
    ...report.assumptionLedger.map((row) =>
      `| ${row.assumptionKey} | ${row.source} | ${row.status} |`),
    "",
    "## 反推层",
    "",
    ...report.routeLayers.map((row) =>
      `- ${row.reverseIndex + 1}. ${row.layerKey} / ${row.operatorKey} / ${row.strictReplayActionTypes.join(" -> ") || "无动作"}`),
    "",
    "## 未闭合与拒绝",
    "",
    ...Object.entries(report.dispositionLedger.counts).map(([key, value]) =>
      `- ${key}: ${value}`),
  ];
  return lines.join("\n");
}

function machineTrajectory({
  route,
  replay,
  terminal,
  assumptions,
  gate,
  disposition,
  probabilityClosure,
  opponentResponseClosure,
}) {
  if (!gate.eligible) {
    return {
      schemaVersion: WARMACHINE_REACHABILITY_TRAINING_TRAJECTORY_V1_SCHEMA,
      candidateCount: 0,
      candidates: [],
      deniedReasons: gate.failedChecks,
      excludedEvidence: disposition.rows,
      negativeExamples: [],
      strategyPolicyTargetsPresent: false,
      strategyValueTargetsPresent: false,
      naturalWinRateClaimPresent: false,
      globalOptimalityClaimPresent: false,
      trainingTruth: false,
    };
  }
  const stateTable = Object.fromEntries((replay.runtimeTrainingStateEntries || [])
    .map((entry) => [entry.stateHash, stableGraphValue(entry.state)])
    .sort(([left], [right]) => left.localeCompare(right)));
  const candidate = stableGraphValue({
    trajectoryKey: `reachability-trajectory-${stableGraphHash({
      routeCandidateKey: route.candidateKey,
      replayHash: replay.replayHash,
      terminalCellKey: terminal.cellKey,
    }, 32)}`,
    routeCandidateKey: route.candidateKey,
    terminal,
    assumptions,
    openingStateHash: route.predecessorStateHash,
    terminalStateHash: terminal.terminalStateHash,
    states: stateTable,
    decisions: replay.trainingTrace.decisions,
    strictReceiptHashes: replay.freshReceiptHashes,
    probabilityClosure: stableGraphValue(probabilityClosure),
    opponentResponseClosure: stableGraphValue(opponentResponseClosure),
    historyProvenance: {
      reverseEdgeCandidateKeys: (route.reverseEdges || []).map((edge) => edge.candidateKey),
      reverseOperatorKeys: (route.reverseEdges || []).map((edge) => edge.operatorKey),
      oracleOpeningRead: false,
      oracleRouteRead: false,
      oracleIntermediateStateRead: false,
    },
    reachabilityLabel: "strict_reachable",
    policyTarget: null,
    valueTarget: null,
    naturalWinRate: null,
    globalOptimality: null,
    trainingTruth: true,
  });
  return {
    schemaVersion: WARMACHINE_REACHABILITY_TRAINING_TRAJECTORY_V1_SCHEMA,
    candidateCount: 1,
    candidates: [candidate],
    deniedReasons: [],
    excludedEvidence: disposition.rows,
    negativeExamples: [],
    strategyPolicyTargetsPresent: false,
    strategyValueTargetsPresent: false,
    naturalWinRateClaimPresent: false,
    globalOptimalityClaimPresent: false,
    trainingTruth: true,
  };
}

export function publishWarmachineReverseReachabilityV1(rawInput = {}) {
  const terminalCell = rawInput.terminalCell || {};
  const terminalState = rawInput.terminalState || {};
  const search = rawInput.searchReport || {};
  const routes = [...(search.routes || [])].sort((left, right) =>
    String(left.candidateKey || "").localeCompare(String(right.candidateKey || "")));
  const requestedRouteKey = String(rawInput.routeCandidateKey || "");
  const route = requestedRouteKey
    ? routes.find((candidate) => candidate.candidateKey === requestedRouteKey) || null
    : routes[0] || null;
  if (!route) throw new Error("reachability_publication_route_required");
  const replay = replayWarmachineTerminalReverseRouteV1(route, terminalState, {
    routeKey: `reachability-publication:${route.candidateKey}`,
    maximumControlSteps: rawInput.maximumControlSteps,
    captureTrainingTrace: true,
  });
  const assumptions = assumptionLedger(
    terminalCell,
    rawInput.assumptionEvidenceByKey || {},
  );
  const disposition = dispositionLedger(
    search,
    rawInput.additionalDispositionRows || [],
  );
  const probabilityClosure = stableGraphValue(rawInput.probabilityClosure || {});
  const opponentResponseClosure = stableGraphValue(rawInput.opponentResponseClosure || {});
  const gate = trainingGate({
    route,
    replay,
    search,
    assumptions,
    probabilityClosure,
    opponentResponseClosure,
  });
  const terminal = terminalSummary(terminalCell, terminalState);
  const reportCore = {
    schemaVersion: WARMACHINE_REACHABILITY_HUMAN_REPORT_V1_SCHEMA,
    routeCandidateKey: String(route.candidateKey || ""),
    terminal,
    assumptionLedger: assumptions,
    roster: rosterRows(route),
    deployment: stableGraphValue(route.deploymentAudit || {}),
    routeLayers: routeLayers(route),
    probabilityClosure,
    opponentResponseClosure,
    strictReplay: stableGraphValue(Object.fromEntries(Object.entries(replay)
      .filter(([key]) => !["finalState", "runtimeTrainingStateEntries"].includes(key)))),
    dispositionLedger: disposition,
    rulesAuthority: {
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      terminalHostReceiptHash: String(terminalCell.hostReceiptHash || ""),
      routeReceiptHashes: replay.freshReceiptHashes,
    },
    trainingGate: gate,
    oracleIsolationAudit: search.oracleIsolationAudit || {},
    claimBoundary: "The report publishes one discovered strict reachability route and every retained exclusion/debt class. It is not a strategy ranking, natural win-rate estimate, proof that omitted routes are unreachable, or global optimum claim.",
  };
  const humanReport = {
    ...reportCore,
    markdown: humanMarkdown(reportCore),
    reportHash: stableGraphHash(stableGraphValue(reportCore)),
  };
  const trainingTrajectory = machineTrajectory({
    route,
    replay,
    terminal,
    assumptions,
    gate,
    disposition,
    probabilityClosure,
    opponentResponseClosure,
  });
  const core = {
    schemaVersion: WARMACHINE_REACHABILITY_PUBLICATION_V1_SCHEMA,
    routeCandidateKey: route.candidateKey,
    humanReportHash: humanReport.reportHash,
    trainingCandidateCount: trainingTrajectory.candidateCount,
    trainingGate: gate,
    trainingTruth: trainingTrajectory.trainingTruth,
    policyOrValuePromotionAllowed: false,
  };
  return {
    ...core,
    humanReport,
    trainingTrajectory,
    publicationHash: stableGraphHash(stableGraphValue({
      core,
      humanReport,
      trainingTrajectory,
    })),
    ok: replay.fullRouteStrictReplayCertified === true,
  };
}
