#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildWarmachineCustomMatchupEvidenceReportV2 } from
  "../src/report/custom-matchup-evidence-report-v2.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) || path.join(
  projectRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
));

function loadJson(fileName) {
  const filePath = path.join(outputDirectory, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`custom_matchup_report_source_missing:${fileName}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function optionalJson(fileName) {
  const filePath = path.join(outputDirectory, fileName);
  return fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, "utf8"))
    : null;
}

function ticket09RouteUnitFiles() {
  return fs.readdirSync(outputDirectory).filter((fileName) =>
    /^ticket09-.+-(?:assassination|score)-route-unit-v1\.json$/.test(fileName))
    .sort();
}

function writeJson(fileName, value) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, fileName),
    `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function live(piece = {}) {
  return piece.destroyed !== true && piece.removedFromPlay !== true;
}

function pieceBoxes(piece = {}) {
  return Number(piece.damage?.boxesRemaining ?? piece.boxesRemaining ?? 0);
}

function summarizeState(state = {}) {
  const sideKeys = [...new Set((state.pieces || []).map((piece) => piece.sideKey)
    .filter(Boolean))].sort();
  const sides = Object.fromEntries(sideKeys.map((sideKey) => {
    const pieces = (state.pieces || []).filter((piece) => piece.sideKey === sideKey);
    return [sideKey, {
      activeModelCount: pieces.filter(live).length,
      destroyedModelCount: pieces.filter((piece) => piece.destroyed === true).length,
      removedFromPlayModelCount: pieces.filter((piece) =>
        piece.removedFromPlay === true).length,
      boxesRemaining: pieces.reduce((total, piece) => total + pieceBoxes(piece), 0),
      resourcePoints: pieces.reduce((total, piece) =>
        total + Number(piece.resourcePoints ?? piece.focus ?? piece.fury ?? 0), 0),
      leaders: pieces.filter((piece) => piece.isWarcaster === true ||
        piece.isWarlock === true).map((piece) => ({
        pieceKey: piece.pieceKey,
        name: piece.cardSnapshot?.name || piece.cardName || piece.label,
        live: live(piece),
        position: piece.position || null,
        boxesRemaining: pieceBoxes(piece),
        resourcePoints: Number(piece.resourcePoints ?? piece.focus ?? piece.fury ?? 0),
      })),
    }];
  }));
  return {
    turnNumber: Number(state.turnNumber || 0),
    activeSideKey: String(state.activeSideKey || ""),
    phaseKey: String(state.phaseKey || ""),
    score: state.scenario?.score || {},
    sides,
  };
}

function numericDelta(before = {}, after = {}) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return Object.fromEntries(keys.map((key) => [
    key,
    Number(after[key] || 0) - Number(before[key] || 0),
  ]));
}

function routeDelta(beforeState, afterState, routeFacts = {}) {
  const before = summarizeState(beforeState);
  const after = summarizeState(afterState);
  const sideKeys = [...new Set([
    ...Object.keys(before.sides),
    ...Object.keys(after.sides),
  ])].sort();
  const sideDelta = Object.fromEntries(sideKeys.map((sideKey) => {
    const left = before.sides[sideKey] || {};
    const right = after.sides[sideKey] || {};
    return [sideKey, {
      activeModelCount: Number(right.activeModelCount || 0) -
        Number(left.activeModelCount || 0),
      destroyedModelCount: Number(right.destroyedModelCount || 0) -
        Number(left.destroyedModelCount || 0),
      removedFromPlayModelCount: Number(right.removedFromPlayModelCount || 0) -
        Number(left.removedFromPlayModelCount || 0),
      boxesRemaining: Number(right.boxesRemaining || 0) -
        Number(left.boxesRemaining || 0),
      resourcePoints: Number(right.resourcePoints || 0) -
        Number(left.resourcePoints || 0),
    }];
  }));
  return {
    before,
    after,
    scoreDelta: numericDelta(before.score, after.score),
    sideDelta,
    routeFacts,
  };
}

function challengerLeaderName(state = {}) {
  const leader = (state.pieces || []).find((piece) => piece.sideKey === "player2" &&
    (piece.isWarcaster === true || piece.isWarlock === true));
  if (!leader) throw new Error("custom_matchup_report_challenger_leader_missing");
  return String(leader.cardSnapshot?.name || leader.cardName || leader.label || "");
}

function valueRowByRouteKey(valueEvidence, routeKey) {
  const matches = (valueEvidence.rows || []).filter((row) =>
    (row.routeLabels || []).some((label) =>
      String(label.routeKey || "") === String(routeKey || "")));
  if (matches.length !== 1) {
    throw new Error(`custom_matchup_report_initial_value_route_ambiguous:${routeKey}`);
  }
  return matches[0];
}

function routeOpeningAddress(evidence = {}) {
  return {
    subjectFactionKey: "Cryx",
    challengerFactionKey: "Fane of Nyrro",
    scenarioKey: String(evidence.scenarioKey || ""),
    mapKey: String(evidence.mapKey || ""),
    firstPlayerSideKey: String(evidence.firstPlayerSideKey || ""),
    deploymentSeedKey: String(evidence.deploymentSeedKey || ""),
    physicalModelCount: Number(evidence.physicalModelCount || 0),
  };
}

function ticket06RosterBinding(outputRoot, evidence = {}) {
  const plansRoot = path.join(outputRoot, "terminal-root-batch-v1/plans");
  if (!fs.existsSync(plansRoot)) {
    throw new Error("custom_matchup_report_ticket06_terminal_batch_missing");
  }
  const matches = [];
  for (const planKey of fs.readdirSync(plansRoot).sort()) {
    const reportPath = path.join(plansRoot, planKey, "opening-batch-report.json");
    if (!fs.existsSync(reportPath)) continue;
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    for (const opening of report.openings || []) {
      if (String(opening.constructionOpeningKey || "") !==
          String(evidence.openingKey || "") ||
          String(opening.strictOpeningStateHash || "") !==
          String(evidence.representativeOpeningStateHash || "") ||
          Number(opening.modelCount || 0) !==
          Number(evidence.physicalModelCount || 0)) {
        continue;
      }
      matches.push({
        subjectRosterKey: String(opening.subjectRosterKey || ""),
        challengerRosterKey: String(opening.challengerRosterKey || ""),
        constructionOpeningKey: String(opening.constructionOpeningKey || ""),
        representativeOpeningStateHash: String(opening.strictOpeningStateHash || ""),
      });
    }
  }
  const uniqueBindings = [...new Map(matches.map((row) => [
    `${row.subjectRosterKey}::${row.challengerRosterKey}`,
    row,
  ])).values()];
  if (uniqueBindings.length !== 1 || !uniqueBindings[0].subjectRosterKey ||
      !uniqueBindings[0].challengerRosterKey) {
    throw new Error("custom_matchup_report_ticket06_roster_binding_ambiguous");
  }
  return uniqueBindings[0];
}

function reportLink(href, label, evidenceClass) {
  return { href, label, evidenceClass };
}

function formatInterval(value = {}) {
  return value.exact
    ? `${value.lowerBound}`
    : `[${value.lowerBound}, ${value.upperBound}]`;
}

function chineseMarkdown(report) {
  const lines = [
    "# Sepsira 六队 Mechanithrall Swarm 对 Fane 证据报告",
    "",
    `- 当前 Host：\`${report.hostReceiptHash}\``,
    `- Fane 领袖：${report.counts.leaderCount}`,
    `- 有限合法军表：Cryx ${report.counts.finiteSubjectRosterCount}；Fane ${report.counts.finiteChallengerRosterCount}`,
    `- 严格代表开局：${report.counts.strictRepresentativeOpeningCount}`,
    `- 已绑定路线：${report.counts.routeEvidenceCount}；其中当前完整 strict 路线 ${report.counts.strictRouteCount}`,
    `- 缺失 strict 路线任务：${report.counts.pendingRouteSearchTaskCount}；缺失地图开局任务：${report.counts.pendingMapOpeningTaskCount}`,
    `- Ticket 09 完成度：${report.counts.leadersCompleteForTicket09}/${report.counts.leaderCount} 名领袖同时具备刺杀与得分路线`,
    "",
    "## 结论边界",
    "",
    "当前没有自然胜率，也没有阵营或全局最优结论。构筑指标只用于安排搜索顺序；一条 strict 路线只证明一个精确开局存在这一条历史，不代表该开局必胜。所有缺失候选、对手回应与骰率质量仍保留在值区间中。",
    "",
    "## 四名领袖",
    "",
  ];
  for (const leader of report.leaderReports) {
    const roster = leader.representativeRoster;
    const routeStatus = leader.routes.length
      ? leader.routes.map((route) => `${route.terminalFamilyKey}：${route.strictRouteExists
        ? `strict ${route.outcomeForChallenger === "win" ? "胜" : "负"}`
        : "证据尚未闭合"}`).join("；")
      : "尚无开局到终局路线";
    lines.push(`### ${leader.leaderName}`, "");
    lines.push(`- 代表军表：\`${roster.rosterKey}\`，${roster.pointTotal} 分，${roster.physicalModelCount} 个模型。`);
    lines.push(`- 严格开局：${leader.strictOpeningCoverage.strictOpeningCount}；地图 ${leader.strictOpeningCoverage.mapKeys.join("、") || "未记录"}；先后手 ${leader.strictOpeningCoverage.firstPlayerTaskSideKeys.join("、") || "未记录"}。`);
    for (const mapEvidence of leader.strictOpeningCoverage.mapTopologyEvidence || []) {
      const observed = mapEvidence.observedTopologyRows?.[0] || {};
      lines.push(`- ${mapEvidence.mapKey} 地形审计：南北直线开放度 ${observed.laneOpenness ?? "?"}；视线阻挡 ${observed.losBlocking ?? "?"}；50mm 通行瓶颈 ${observed.movementChokepoints ?? "?"}；粗糙地形负载 ${observed.roughTerrainLoad ?? "?"}；strict 开局 ${mapEvidence.strictOpeningCount}。`);
    }
    lines.push(`- 路线证据：${routeStatus}。`);
    lines.push(`- 缺失路线：${leader.missingRouteFamilyKeys.join("、") || "无"}。`);
    lines.push(`- 缺失严格地图：${leader.missingMapKeys.join("、") || "无"}。`);
    lines.push(`- 构筑筛选指标：${leader.screeningEvidence.robustScreeningIndex}，只用于排序，不是胜率。`, "");
    lines.push("| 单位/附件 | 类型 | 分数 | 数量 | 配装/绑定 |", "|---|---:|---:|---:|---|");
    for (const entry of roster.entries) {
      lines.push(`| ${entry.name} | ${entry.cardTypeName} | ${entry.linePoints} | ${entry.physicalModels} | ${entry.options || entry.attachedTo || entry.battlegroupController || "-"} |`);
    }
    lines.push("");
    for (const route of leader.routes) {
      lines.push(`#### ${route.terminalFamilyKey} 路线 \`${route.routeKey}\``, "");
      lines.push(`- 方向：Fane ${route.outcomeForChallenger === "win" ? "获胜" : "失败"}；值区间 ${formatInterval(route.strictGameValueInterval)}。`);
      lines.push(`- strict 开局：${route.strictOpeningComplete ? "是" : "否"}；完整重放：${route.strictReplayComplete ? "是" : "否"}；历史绑定：${route.assumptionClosureComplete ? "是" : "否"}。`);
      lines.push(`- 路线军表：Cryx \`${route.routeRosterEvidence.subject.rosterKey}\`（${route.routeRosterEvidence.subject.pointTotal} 分）对 Fane \`${route.routeRosterEvidence.challenger.rosterKey}\`（${route.routeRosterEvidence.challenger.pointTotal} 分）；合法军表与模型账本闭合 ${route.routeRosterEvidence.exactRosterEvidenceComplete ? "是" : "否"}。`);
      lines.push(`- 与本页筛选代表军表相同：${route.routeRosterEvidence.challengerMatchesScreeningRepresentative ? "是" : "否"}；路线开局身份闭合：${route.strictOpeningIdentityComplete ? "是" : "否"}。`);
      lines.push(`- 反向边：${route.reverseEdgeCount ?? "未持久化"}；未解析 ${route.unresolvedBranchCount}；严格拒绝 ${route.rejectedBranchCount}。`);
      const delta = route.observedRouteDelta;
      lines.push(`- 比分变化：${Object.entries(delta.scoreDelta || {}).map(([side, value]) => `${side} ${value >= 0 ? "+" : ""}${value}`).join("；") || "0:0 不变"}。`);
      for (const [sideKey, side] of Object.entries(delta.sideDelta || {})) {
        lines.push(`- ${sideKey}：存活模型 ${side.activeModelCount >= 0 ? "+" : ""}${side.activeModelCount}；剩余生命格 ${side.boxesRemaining >= 0 ? "+" : ""}${side.boxesRemaining}；资源 ${side.resourcePoints >= 0 ? "+" : ""}${side.resourcePoints}。`);
        const beforeLeader = delta.before?.sides?.[sideKey]?.leaders?.[0];
        const afterLeader = delta.after?.sides?.[sideKey]?.leaders?.[0];
        if (beforeLeader?.position && afterLeader?.position) {
          lines.push(`- ${sideKey} Leader 位置：(${beforeLeader.position.xIn}, ${beforeLeader.position.yIn}) → (${afterLeader.position.xIn}, ${afterLeader.position.yIn})；终局存活 ${afterLeader.live ? "是" : "否"}。`);
        }
      }
      lines.push(`- 证据：${route.evidenceRefs.map((ref) => `[${ref.label}](${ref.href})`).join("；") || "无"}。`, "");
    }
  }
  lines.push("## 待搜索队列", "");
  for (const task of report.pendingSearchQueue) {
    lines.push(task.taskKind === "strict_map_opening"
      ? `- ${task.leaderName}：补 ${task.mapKey} 的真实地形与 strict 开局（\`${task.taskKey}\`）。`
      : `- ${task.leaderName}：补 ${task.terminalFamilyKey} 开局到终局 strict 路线（\`${task.taskKey}\`）。`);
  }
  lines.push("", "## 当前判断", "");
  lines.push(report.completion.reportComplete
    ? "四名领袖的刺杀与得分路线证据均已闭合，Ticket 09 可进入完成审计。"
    : `仍有 ${report.completion.missingSearchTaskCount} 个领袖×终局族证据缺口；当前报告可用于查看已发现路线与安排搜索，不能用于宣称完整对抗排名。`, "");
  return `${lines.join("\n")}\n`;
}

const baseReport = loadJson("report.json");
if (baseReport.schemaVersion !== "warmachine_custom_matchup_evidence_report_v1") {
  throw new Error("custom_matchup_report_v1_source_required");
}
const initialValueEvidence = optionalJson(
  "ticket09-route-initial-state-values-v1.json",
) || loadJson("ticket08-real-initial-state-values-v1.json");
const historyEvidence = loadJson("ticket19-real-route-history-binding-v1.json");
const rosterPool = loadJson("goal-conditioned-roster-pool.json");
const ticket06 = loadJson("ticket06-short-route-preflight-fixture-v1.json");
const ticket07 = loadJson("ticket07-score-forward-route-fixture-v1.json");
const ticket07Report = loadJson("ticket07-score-root-to-opening-v1.json");
const ticket07Opening = loadJson("ticket07-score-opening-fixture-v1.json");
const ticket06Compact = JSON.parse(fs.readFileSync(path.join(
  projectRoot,
  "scripts/fixtures/ticket06-short-route-evidence-v1.json",
), "utf8"));
const ticket08Compact = JSON.parse(fs.readFileSync(path.join(
  projectRoot,
  "scripts/fixtures/ticket08-real-initial-state-evidence-v1.json",
), "utf8"));
const ticket06Rosters = ticket06RosterBinding(outputDirectory, ticket06Compact);
const ticket07RouteKey = String(ticket07Report.routeCandidateKeys?.[0] || "");
const ticket07Rosters = {
  subjectRosterKey: String(ticket07Opening.opening?.subjectRosterKey || ""),
  challengerRosterKey: String(ticket07Opening.opening?.challengerRosterKey || ""),
};

const ticket06Value = valueRowByRouteKey(initialValueEvidence,
  ticket06Compact.routeKey);
const ticket07Value = valueRowByRouteKey(initialValueEvidence, ticket07RouteKey);
const ticket06TerminalEvent = ticket06.witness.attack.receipts
  .flatMap((receipt) => receipt.events || [])
  .find((event) => event.eventType === "terminal");
const ticket07TerminalEvent = ticket07.stages.flatMap((stage) =>
  stage.terminalEvents || []).find((event) => event.eventType === "terminal");
if (!ticket06TerminalEvent?.winnerSideKey || !ticket07TerminalEvent?.winnerSideKey) {
  throw new Error("custom_matchup_report_terminal_winner_missing");
}

const baselineRoutes = [{
  routeKey: ticket06Value.routeLabels[0].routeKey,
  leaderName: challengerLeaderName(ticket06.witness.state),
  initialStateKey: ticket06Value.initialStateKey,
  terminalFamilyKey: "assassination",
  terminalSourceKey: ticket06Value.routeLabels[0].terminalSourceKey,
  subjectRosterKey: ticket06Rosters.subjectRosterKey,
  challengerRosterKey: ticket06Rosters.challengerRosterKey,
  strictOpeningStateHash: ticket06Compact.strictOpeningStateHash,
  strictOpeningEvidenceHash: ticket06Compact.strictDeploymentEvidenceHash,
  openingAddress: routeOpeningAddress(ticket08Compact.ticket06),
  challengerSideKey: "player2",
  winnerSideKey: ticket06TerminalEvent.winnerSideKey,
  reverseEdgeCount: ticket06Value.routeLabels[0].reverseEdgeCount,
  routeCostKnown: ticket06Value.routeLabels[0].routeCostKnown,
  strictOpeningComplete: ticket06Value.closure.strictOpeningComplete,
  strictReplayComplete: ticket06Value.closure.strictReplayComplete,
  assumptionClosureComplete: ticket06Value.closure.assumptionClosureComplete,
  rejectedBranchCount: ticket06Value.routeLabels[0].rejectedBranchCount || 0,
  unresolvedBranchCount: ticket06Value.routeLabels[0].unresolvedBranchCount || 0,
  observedRouteDelta: routeDelta(
    ticket06.witness.stages.p2TurnOne.control.state,
    ticket06.witness.state,
    {
      terminalActionTypes: ticket06.witness.attack.selectionAudit.map((row) =>
        row.selectedAction.actionType),
      terminalReason: ticket06TerminalEvent.reason,
    },
  ),
  evidenceRefs: [
    reportLink("ticket06-short-route-preflight-fixture-v1.json",
      "Ticket 06 路线状态", "strict_state_fixture"),
    reportLink("ticket08-real-initial-state-values-v1.json",
      "Ticket 08 初始值", "adversarial_value"),
    reportLink("ticket19-real-route-history-binding-v1.json",
      "Ticket 19 历史绑定", "history_binding"),
  ],
  evidenceHashes: {
    sourceWitnessHash: historyEvidence.ticket06.fixtureHash,
    historyBindingHash: historyEvidence.ticket06.bindingHash,
    rosterBindingHash: ticket06Compact.representativeOpeningStateHash,
  },
}, {
  routeKey: ticket07Value.routeLabels[0].routeKey,
  leaderName: challengerLeaderName(ticket07.injectedOpeningState),
  initialStateKey: ticket07Value.initialStateKey,
  terminalFamilyKey: "score",
  terminalSourceKey: ticket07Value.routeLabels[0].terminalSourceKey,
  subjectRosterKey: ticket07Rosters.subjectRosterKey,
  challengerRosterKey: ticket07Rosters.challengerRosterKey,
  strictOpeningStateHash: ticket08Compact.ticket07.strictOpeningStateHash,
  strictOpeningEvidenceHash: ticket08Compact.ticket07.openingEvidenceHash,
  openingAddress: routeOpeningAddress(ticket08Compact.ticket07),
  challengerSideKey: "player2",
  winnerSideKey: ticket07TerminalEvent.winnerSideKey,
  reverseEdgeCount: ticket07Value.routeLabels[0].reverseEdgeCount,
  routeCostKnown: ticket07Value.routeLabels[0].routeCostKnown,
  strictOpeningComplete: ticket07Value.closure.strictOpeningComplete,
  strictReplayComplete: ticket07Value.closure.strictReplayComplete,
  assumptionClosureComplete: ticket07Value.closure.assumptionClosureComplete,
  rejectedBranchCount: ticket07Value.routeLabels[0].rejectedBranchCount,
  unresolvedBranchCount: ticket07Value.routeLabels[0].unresolvedBranchCount,
  observedRouteDelta: routeDelta(
    ticket07.injectedOpeningState,
    ticket07.terminalState,
    {
      strictReceiptCount: ticket07.routeReceiptHashes.length,
      settlementWindowCount: ticket07.scoreTimeline.length,
      scoreTimeline: ticket07.scoreTimeline,
      terminalReason: ticket07TerminalEvent.reason,
    },
  ),
  evidenceRefs: [
    reportLink("ticket07-score-forward-route-fixture-v1.json",
      "Ticket 07 完整路线", "strict_route_fixture"),
    reportLink("ticket07-score-root-to-opening-v1.json",
      "Ticket 07 反推报告", "reverse_search_report"),
    reportLink("ticket08-real-initial-state-values-v1.json",
      "Ticket 08 初始值", "adversarial_value"),
    reportLink("ticket19-real-route-history-binding-v1.json",
      "Ticket 19 历史绑定", "history_binding"),
  ],
  evidenceHashes: {
    sourceFixtureHash: historyEvidence.ticket07.fixtureHash,
    semanticOutcomeHash: historyEvidence.ticket07.closedRouteSemanticOutcomeHash,
    historyBindingHash: historyEvidence.ticket07.bindingHash,
  },
}];

const ticket09Routes = ticket09RouteUnitFiles().map((fileName) => {
  const unit = loadJson(fileName);
  const value = valueRowByRouteKey(initialValueEvidence, unit.routeKey);
  let beforeState = unit.replayMaterial?.openingState || null;
  let afterState = unit.replayMaterial?.terminalState || null;
  if ((!beforeState || !afterState) && unit.evidenceFiles?.forwardFixture) {
    const forward = loadJson(unit.evidenceFiles.forwardFixture);
    beforeState = forward.injectedOpeningState;
    afterState = forward.terminalState;
  }
  if (!beforeState || !afterState) {
    throw new Error(`custom_matchup_report_route_replay_state_missing:${unit.routeId}`);
  }
  return {
    routeKey: unit.routeKey,
    leaderName: unit.leaderName,
    initialStateKey: value.initialStateKey,
    terminalFamilyKey: unit.terminalFamilyKey,
    terminalSourceKey: unit.terminalSourceKey,
    subjectRosterKey: unit.subjectRosterKey,
    challengerRosterKey: unit.challengerRosterKey,
    strictOpeningStateHash: unit.strictOpeningStateHash,
    strictOpeningEvidenceHash: unit.strictOpeningEvidenceHash,
    openingAddress: unit.openingAddress,
    challengerSideKey: unit.challengerSideKey,
    winnerSideKey: unit.winnerSideKey,
    reverseEdgeCount: unit.strictRoute.reverseEdgeCount ?? null,
    routeCostKnown: false,
    strictOpeningComplete: unit.strictRoute.strictOpeningComplete,
    strictReplayComplete: unit.strictRoute.strictReplayComplete,
    assumptionClosureComplete: unit.strictRoute.assumptionClosureComplete,
    rejectedBranchCount: unit.strictRoute.rejectedBranchCount,
    unresolvedBranchCount: unit.strictRoute.unresolvedBranchCount,
    observedRouteDelta: routeDelta(beforeState, afterState, {
      routeId: unit.routeId,
      transitionCount: unit.strictRoute.transitionCount,
      terminalEvent: unit.observed?.terminalEvent || null,
      scoreTimeline: unit.observed?.scoreTimeline ||
        unit.observed?.scoreTrajectory || [],
    }),
    evidenceRefs: [
      reportLink(fileName, "Ticket 09 路线单元", "strict_route_unit"),
      ...Object.values(unit.evidenceFiles || {}).map((href) =>
        reportLink(href, href, "route_source_evidence")),
    ],
    evidenceHashes: {
      routeUnitFixtureHash: unit.fixtureHash,
      historyBindingHash: unit.strictRoute.historyBindingHash,
      routeWitnessHash: unit.strictRoute.witnessHash ||
        unit.strictRoute.routeWitnessHash || "",
      fullRouteReplayHash: unit.strictRoute.fullRouteReplayHash || "",
    },
  };
});
const routes = [...baselineRoutes, ...ticket09Routes];

const report = buildWarmachineCustomMatchupEvidenceReportV2({
  baseReport,
  initialValueEvidence,
  historyEvidence,
  rosterPool,
  routes,
});
writeJson("report-v2.json", report);
fs.writeFileSync(path.join(outputDirectory, "report-v2.md"),
  chineseMarkdown(report), "utf8");

process.stdout.write(`${JSON.stringify({
  ok: true,
  outputDirectory,
  reportHash: report.reportHash,
  counts: report.counts,
  completion: report.completion,
  pendingSearchQueue: report.pendingSearchQueue,
}, null, 2)}\n`);
