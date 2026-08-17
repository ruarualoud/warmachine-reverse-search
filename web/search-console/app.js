const ui = Object.fromEntries([
  "rulesReceipt", "sessionStatus", "sessionName", "newSessionButton", "seedButton",
  "gameScenarioCount", "gameScenarioList", "scenarioCount", "scenarioList",
  "anchorCount", "anchorList", "reverseTurnsInput",
  "routeLabelsInput", "movementInput", "startButton", "pauseButton", "resumeButton",
  "cancelButton", "terminalTitle", "terminalMeta", "terminalRelation", "winRateMetric", "foundMetric",
  "strictMetric", "deploymentMetric", "processedMetric", "unknownMetric",
  "rejectedMetric", "branchResultCount", "branchSort", "branchSelect", "branchCards",
  "graphEmpty", "graphViewport", "branchGraph", "boardCanvas", "previousStateButton",
  "playStateButton", "nextStateButton", "stateSlider", "statePosition", "boardStepTitle",
  "boardStepDetail", "boardStepRail", "boardSiblingBranches", "boardEvidenceMode",
  "boardIdentityMetric", "boardPortraitMetric", "boardAssetGapMetric", "boardFullButton",
  "boardFocusButton", "timelineList",
  "comparisonRows", "dispositionRows", "selectionKind", "strategyHeadline",
  "strategyConfidence", "strategyConfidenceNote", "strategyOutcome", "strategyRouteScale",
  "strategyProbability", "strategyRiskCount", "strategyStepCount", "strategySteps",
  "strategyReasons", "strategyRisks",
  "inspectorEmpty", "inspectorContent",
  "inspectorBadge", "inspectorHeading", "inspectorSubheading", "inspectorFacts",
  "receiptHash", "stateDiff", "branchClosure", "keyActionList", "assumptionList", "eventCount",
  "liveIndicator", "liveStage", "liveProgressText", "liveProgressBar", "eventLog",
  "seedDialog", "seedEditor", "seedValidationState", "seedIssues", "validateSeedButton",
  "injectSeedButton", "quickSeedView", "exactSeedView", "seedScenarioSelect",
  "seedVictorySelect", "seedAnchorSelect", "seedRoundInput", "seedRandomInput",
  "quickSeedPreview",
].map((id) => [id, document.getElementById(id)]));

const state = {
  catalog: null,
  scenario: null,
  victorySeed: null,
  anchor: null,
  session: null,
  snapshot: null,
  events: [],
  eventSource: null,
  selectedBranchKey: "",
  selectedNodeId: "",
  selectedEdgeId: "",
  boardNodeIndex: 0,
  boardPlaybackTimer: null,
  boardViewMode: "full",
  branchFilter: "strict",
  branchSort: "evidence",
  seedView: "quick",
  validatedInjectedSeed: null,
  progress: {},
};

const portraitImageCache = new Map();

const eventTypes = [
  "session_created", "seed_validation_started", "seed_validated", "seed_rejected",
  "search_started", "search_paused", "search_resumed", "search_cancelled",
  "search_interrupted", "search_progress", "root_materialized", "node_discovered",
  "strict_edge_certified", "strict_edge_rejected", "branch_deferred", "result_published",
  "search_completed", "search_failed",
];

const statusLabels = {
  idle: "未运行", ready: "就绪", running: "搜索中", paused: "已暂停",
  completed: "已完成", cancelled: "已取消", failed: "失败",
  interrupted: "已中断", seed_rejected: "种子拒绝",
};
const dispositionLabels = {
  strict_rejected: "strict 拒绝",
  pruned_low_probability: "低概率裁剪",
  budget_deferred: "预算延迟",
  inverse_unresolved: "逆算缺口",
  rules_unknown: "规则未知",
  rules_drift: "规则版本漂移",
  proven_unreachable: "已证不可达",
};
const goalLabels = {
  assassination: "刺杀胜利",
  scenario_score: "场景得分胜利",
  simultaneous_leader_tiebreak: "Leader 同时移除判定",
  fixed_round_limit_result: "轮次上限判定",
};
const stageLabels = {
  reverse_search_started: "建立反向搜索根",
  initial_frontier_ready: "初始前沿就绪",
  processing_label: "展开候选前沿",
  activation_expansion_started: "枚举激活前驱",
  activation_expansion_ready: "激活前驱已生成",
  activation_boundary_reached: "到达激活边界",
  activation_reverse_complete: "激活层反推完成",
  before_control_enumeration: "枚举控制阶段",
  after_control_enumeration: "校验控制动作",
  search_complete: "有界搜索完成",
  resume_checkpoint_loaded: "从检查点恢复",
  resume_checkpoint_persisted: "保存继续搜索点",
  independent_strict_replay_started: "独立 strict 重放",
  independent_strict_replay_completed: "strict 重放完成",
  resume_frontier_republished: "恢复既有 strict 前沿",
  resume_checkpoint_invalidated: "检查点已失效",
};
const relationLabels = {
  "melee-engaged": "近战接战范围",
  legal_nonoverlap: "底盘合法且不重叠",
  strict_terminal_action_required: "终结动作需 strict LOS 校验",
  reverse_history_unproven: "此前移动路径尚未反推证明",
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function shortHash(value, length = 10) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length)}…` : text || "—";
}

function pieceLabel(pieceKey) {
  if (!pieceKey) return "";
  for (const node of state.snapshot?.graph?.nodes || []) {
    const piece = node.pieces?.find((row) => row.pieceKey === pieceKey);
    if (piece) return piece.label || pieceKey;
  }
  return pieceKey;
}

function portraitUrlForPiece(piece = {}) {
  if (piece.presentationIdentityExact !== true) return "";
  return String(piece.portraitUrl || "");
}

function cachedImageForUrl(url = "") {
  if (!url) return null;
  if (portraitImageCache.has(url)) return portraitImageCache.get(url);
  const image = new Image();
  portraitImageCache.set(url, image);
  image.addEventListener("load", () => renderBoard(), { once: true });
  image.addEventListener("error", () => portraitImageCache.set(url, null), { once: true });
  image.src = url;
  return image;
}

function portraitImageForPiece(piece = {}) {
  return cachedImageForUrl(portraitUrlForPiece(piece));
}

function compareBranchEvidence(left, right) {
  const strict = Number(right.disposition === "strict_certified") -
    Number(left.disposition === "strict_certified");
  if (strict) return strict;
  const deployment = Number(right.completeToDeployment) - Number(left.completeToDeployment);
  if (deployment) return deployment;
  const replay = Number(right.strictReplay?.certified) - Number(left.strictReplay?.certified);
  if (replay) return replay;
  return Number(right.reversedPriorTurnCount || 0) - Number(left.reversedPriorTurnCount || 0) ||
    String(left.branchKey).localeCompare(String(right.branchKey));
}

function branchDispositionLabel(branch = {}) {
  if (branch.disposition === "strict_certified") return "strict 可达";
  if (branch.disposition === "rules_drift") return "规则版本漂移";
  return "重放未通过";
}

function visibleBranches() {
  const branches = [...(state.snapshot?.graph?.branches || [])];
  const filtered = branches.filter((branch) => {
    if (state.branchFilter === "strict") return branch.disposition === "strict_certified";
    if (state.branchFilter === "deployment") return branch.completeToDeployment === true;
    return true;
  });
  filtered.sort((left, right) => {
    if (state.branchSort === "reverse_depth") {
      return Number(right.reversedPriorTurnCount || 0) - Number(left.reversedPriorTurnCount || 0) ||
        compareBranchEvidence(left, right);
    }
    if (state.branchSort === "action_count") {
      return Number(branchEvidence(left).actionCount || 0) -
        Number(branchEvidence(right).actionCount || 0) || compareBranchEvidence(left, right);
    }
    return compareBranchEvidence(left, right);
  });
  return filtered;
}

function selectedBranch() {
  const branches = visibleBranches();
  return branches.find((branch) => branch.branchKey === state.selectedBranchKey) ||
    branches[0] || null;
}

function branchEdges(branch = selectedBranch()) {
  const edgeById = new Map((state.snapshot?.graph?.edges || []).map((edge) => [edge.edgeId, edge]));
  return (branch?.edgeIds || []).map((edgeId) => edgeById.get(edgeId)).filter(Boolean);
}

function branchNodes(branch = selectedBranch()) {
  const nodeById = new Map((state.snapshot?.graph?.nodes || []).map((node) => [node.nodeId, node]));
  const edges = branchEdges(branch);
  if (!edges.length) return [];
  return [nodeById.get(edges[0].predecessorNodeId), ...edges.map((edge) =>
    nodeById.get(edge.successorNodeId))].filter(Boolean);
}

function branchEvidence(branch = selectedBranch()) {
  if (!branch) return {};
  if (branch.evidenceSummary) return branch.evidenceSummary;
  const edges = branchEdges(branch);
  const nodes = branchNodes(branch);
  const first = nodes[0];
  const last = nodes.at(-1);
  const structural = new Set([
    "pass", "end_turn", "end_maintenance_phase", "end_control_replenishment",
    "end_control_phase", "decline_reposition", "resolve_lifecycle_trigger_decline",
  ]);
  const movement = new Set(["advance", "run", "charge", "place", "reposition"]);
  const attacks = new Set(["melee_attack", "ranged_attack", "power_attack"]);
  const mapDelta = (before = {}, after = {}) => Object.fromEntries(
    [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
      .map((key) => [key, Number(after[key] || 0) - Number(before[key] || 0)]),
  );
  const beforePieces = new Map((first?.pieces || []).map((piece) => [piece.pieceKey, piece]));
  const sideKeys = [...new Set([...(first?.pieces || []), ...(last?.pieces || [])]
    .map((piece) => piece.sideKey).filter(Boolean))].sort();
  const boxesLostBySide = Object.fromEntries(sideKeys.map((key) => [key, 0]));
  const resourceDeltaBySide = Object.fromEntries(sideKeys.map((key) => [key, 0]));
  const removedPieceCountBySide = Object.fromEntries(sideKeys.map((key) => [key, 0]));
  for (const piece of last?.pieces || []) {
    const prior = beforePieces.get(piece.pieceKey);
    if (!prior) continue;
    boxesLostBySide[piece.sideKey] += Math.max(0,
      Number(prior.boxesRemaining || 0) - Number(piece.boxesRemaining || 0));
    resourceDeltaBySide[piece.sideKey] += Number(piece.resourcePoints || 0) -
      Number(prior.resourcePoints || 0);
    if ((piece.destroyed || piece.removedFromPlay) &&
        !(prior.destroyed || prior.removedFromPlay)) removedPieceCountBySide[piece.sideKey] += 1;
  }
  return {
    actionCount: edges.length,
    decisiveActionCount: edges.filter((edge) => !structural.has(edge.actionType)).length,
    distinctActorCount: new Set(edges.map((edge) => edge.actorPieceKey).filter(Boolean)).size,
    movementActionCount: edges.filter((edge) => movement.has(edge.actionType)).length,
    attackActionCount: edges.filter((edge) => attacks.has(edge.actionType)).length,
    keyActions: edges.filter((edge) => !structural.has(edge.actionType)).slice(-8),
    scoreDeltaBySide: mapDelta(first?.score, last?.score),
    boxesLostBySide,
    resourceDeltaBySide,
    removedPieceCountBySide,
    strictActionSpaceClosedWithinDeclaredScope: edges.every((edge) =>
      edge.legalActionSpaceCompleteWithinDeclaredScope === true),
    startsAt: first,
    endsAt: last,
    strategyScorePresent: false,
  };
}

function renderScenarioPicker() {
  const scenarios = state.catalog?.scenarios || [];
  if (!scenarios.some((scenario) => scenario.scenarioKey === state.scenario?.scenarioKey)) {
    state.scenario = scenarios[0] || null;
  }
  ui.gameScenarioCount.textContent = String(scenarios.length);
  ui.gameScenarioList.innerHTML = scenarios.map((scenario) => `
    <button type="button" class="game-scenario-option ${scenario.scenarioKey === state.scenario?.scenarioKey ? "active" : ""} ${scenario.runnable ? "runnable" : "coverage-only"}" data-game-scenario="${escapeHtml(scenario.scenarioKey)}">
      <span><b>${escapeHtml(scenario.label)}</b><small>${escapeHtml(scenario.runnable ? `${scenario.packet || ""} · 可运行` : `${scenario.packet || ""} · strict 已证 ${scenario.coverage?.strictMaterializedSubcellCount || 0}`)}</small></span>
      <span>${scenario.runnable ? `${scenario.victorySeeds?.length || 0} 根` : `${scenario.coverage?.selectedRepresentativeSubcellCount || 0} 代表`}</span>
    </button>`).join("");
  ui.gameScenarioList.querySelectorAll("button").forEach((button) =>
    button.addEventListener("click", () => {
      state.scenario = scenarios.find((scenario) =>
        scenario.scenarioKey === button.dataset.gameScenario) || scenarios[0] || null;
      state.victorySeed = state.scenario?.victorySeeds?.[0] || null;
      state.anchor = state.victorySeed?.anchors?.[0] || null;
      renderScenarioPicker();
      renderTerminalContext();
    }));
  const choices = state.scenario?.victorySeeds || [];
  if (!choices.some((choice) => choice.presetKey === state.victorySeed?.presetKey)) {
    state.victorySeed = choices[0] || null;
  }
  if (!(state.victorySeed?.anchors || []).some((anchor) =>
    anchor.anchorKey === state.anchor?.anchorKey)) {
    state.anchor = state.victorySeed?.anchors?.[0] || null;
  }
  ui.scenarioCount.textContent = String(choices.length);
  ui.scenarioList.innerHTML = choices.length ? choices.map((choice) => `
    <button type="button" class="scenario-option ${choice.presetKey === state.victorySeed?.presetKey ? "active" : ""}" data-preset="${escapeHtml(choice.presetKey)}">
      <i></i><span><b>${escapeHtml(choice.label)}</b><small>${escapeHtml(choice.description)}</small></span><span>›</span>
    </button>`).join("") : `<div class="coverage-empty"><strong>尚无可运行终局根</strong><span>${escapeHtml(state.scenario?.coverage?.cellCount || 0)} 个终局单元已建档，等待 strict 物化。</span></div>`;
  ui.scenarioList.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    state.victorySeed = choices.find((choice) => choice.presetKey === button.dataset.preset);
    state.anchor = state.victorySeed?.anchors?.[0] || null;
    renderScenarioPicker();
    renderTerminalContext();
  }));
  const anchors = state.victorySeed?.anchors || [];
  ui.anchorCount.textContent = String(anchors.length);
  ui.anchorList.innerHTML = anchors.length ? anchors.map((anchor) => `
    <button type="button" class="anchor-option ${anchor.anchorKey === state.anchor?.anchorKey ? "active" : ""}" data-anchor="${escapeHtml(anchor.anchorKey)}">
      <i></i><span>${escapeHtml(anchor.label)}</span><code>${escapeHtml(shortHash(anchor.anchorKey, 14))}</code>
    </button>`).join("") : `<div class="coverage-summary">
      <span><b>${escapeHtml(state.scenario?.coverage?.proposedSubcellCount || "0")}</b>审计子单元</span>
      <span><b>${escapeHtml(state.scenario?.coverage?.strictMaterializedSubcellCount || "0")}</b>strict 已物化</span>
      <span><b>${escapeHtml(state.scenario?.coverage?.selectedRepresentativeSubcellCount || 0)}</b>代表单元</span>
      <span><b>${escapeHtml(state.scenario?.coverage?.strictMaterializationPendingRepresentativeCount || 0)}</b>待 strict</span>
      <span><b>${escapeHtml(state.scenario?.coverage?.unresolvedRepresentativeCount || 0)}</b>未决代表</span>
    </div>`;
  ui.anchorList.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    state.anchor = anchors.find((anchor) => anchor.anchorKey === button.dataset.anchor);
    renderScenarioPicker();
    renderTerminalContext();
  }));
}

function currentSeed() {
  if (!state.victorySeed || !state.scenario || !state.anchor) {
    throw new Error("请先选择比赛场景、胜利类型和终局位置根");
  }
  return {
    seedKind: "preset_reference",
    presetKey: state.victorySeed.presetKey,
    scenarioKey: state.scenario.scenarioKey,
    goalType: state.victorySeed.goalType,
    roundNumber: Number(state.victorySeed.roundNumber || 3),
    anchorKey: state.anchor.anchorKey,
    randomSeed: state.victorySeed.randomSeed,
  };
}

function currentConfig() {
  return {
    searchMode: document.querySelector('input[name="searchMode"]:checked')?.value ||
      "long_horizon",
    maximumReverseTurns: Number(ui.reverseTurnsInput.value),
    maximumRouteLabels: Number(ui.routeLabelsInput.value),
    maximumUniqueStates: Number(ui.routeLabelsInput.value),
    includeMovement: ui.movementInput.checked,
  };
}

async function createAndStart(seed = currentSeed()) {
  setActionError("");
  const session = await api("/api/v1/sessions", {
    method: "POST",
    body: JSON.stringify({ seed, config: currentConfig(), autoStart: true }),
  });
  attachSession(session);
}

function attachSession(session) {
  state.session = session;
  const url = new URL(window.location.href);
  url.searchParams.set("session", session.sessionId);
  window.history.replaceState({}, "", url);
  state.snapshot = null;
  state.events = [];
  state.progress = {};
  state.selectedBranchKey = "";
  state.selectedNodeId = "";
  state.selectedEdgeId = "";
  renderAll();
  connectEvents();
  refreshSession();
}

async function refreshSession() {
  if (!state.session) return;
  try {
    state.session = await api(`/api/v1/sessions/${state.session.sessionId}`);
    renderSessionStatus();
    if (state.session.resultAvailable) await loadSnapshot();
  } catch (error) {
    setActionError(error.message);
  }
}

async function loadSnapshot() {
  if (!state.session?.resultAvailable) return;
  const snapshot = await api(`/api/v1/sessions/${state.session.sessionId}/snapshot`);
  if (state.snapshot?.snapshotHash === snapshot.snapshotHash &&
      state.snapshot?.replayPresentationEvidence?.evidenceHash ===
        snapshot.replayPresentationEvidence?.evidenceHash) return;
  state.snapshot = snapshot;
  if (snapshot.replayPresentationEvidence?.hostCompatibility?.compatible === false) {
    state.branchFilter = "all";
    const allFilter = document.querySelector('input[name="branchFilter"][value="all"]');
    if (allFilter) allFilter.checked = true;
  }
  state.selectedBranchKey = snapshot.graph.branches[0]?.branchKey || "";
  state.boardNodeIndex = Math.max(0, branchNodes().length - 1);
  renderAll();
}

function connectEvents() {
  state.eventSource?.close();
  if (!state.session) return;
  const after = state.events.at(-1)?.sequence || 0;
  const source = new EventSource(`/api/v1/sessions/${state.session.sessionId}/events?stream=1&after=${after}`);
  state.eventSource = source;
  ui.liveIndicator.dataset.live = "true";
  ui.liveIndicator.textContent = "实时";
  for (const eventType of eventTypes) {
    source.addEventListener(eventType, (raw) => handleEvent(JSON.parse(raw.data)));
  }
  source.onerror = () => {
    ui.liveIndicator.dataset.live = "false";
    ui.liveIndicator.textContent = "重连中";
  };
  source.onopen = () => {
    ui.liveIndicator.dataset.live = "true";
    ui.liveIndicator.textContent = "实时";
  };
}

function handleEvent(event) {
  if (state.events.some((row) => row.eventId === event.eventId)) return;
  state.events.push(event);
  state.events.sort((left, right) => left.sequence - right.sequence);
  if (event.eventType === "search_progress") state.progress = event.payload || {};
  renderEvents();
  renderMetrics();
  renderLiveActivity();
  if (["search_started", "search_paused", "search_resumed", "search_cancelled",
    "search_completed", "search_failed", "result_published"].includes(event.eventType)) {
    refreshSession();
  }
}

async function sendCommand(commandType) {
  if (!state.session) return;
  try {
    state.session = await api(`/api/v1/sessions/${state.session.sessionId}/commands`, {
      method: "POST",
      body: JSON.stringify({ commandType, config: currentConfig() }),
    });
    renderSessionStatus();
  } catch (error) {
    setActionError(error.message);
  }
}

function setActionError(message) {
  if (!message) return;
  state.events.push({
    eventId: `local-${Date.now()}`,
    sequence: (state.events.at(-1)?.sequence || 0) + 1,
    occurredAt: new Date().toISOString(),
    eventType: "本地错误",
    payload: { error: message },
  });
  renderEvents();
}

function renderSessionStatus() {
  const sessionState = state.session?.state || "idle";
  ui.sessionStatus.dataset.state = sessionState;
  ui.sessionStatus.textContent = statusLabels[sessionState] || sessionState;
  ui.sessionName.textContent = state.session
    ? `${state.session.seed?.goalType || "搜索"} · ${shortHash(state.session.sessionId, 20)}${
      state.session.checkpointAvailable
        ? ` · 检查点 ${state.session.checkpointFrontierCount || 0}`
        : ""}`
    : "尚未创建搜索";
  const running = sessionState === "running";
  const paused = sessionState === "paused";
  ui.startButton.disabled = running || paused || !state.victorySeed || !state.anchor;
  ui.startButton.querySelector("span:last-child").textContent = ["completed", "failed", "cancelled", "interrupted"].includes(sessionState)
    ? state.session?.checkpointAvailable
      ? "从检查点继续"
      : "按当前预算重跑"
    : "开始搜索";
  ui.pauseButton.disabled = !running;
  ui.resumeButton.disabled = !paused;
  ui.cancelButton.disabled = !(running || paused);
  ui.reverseTurnsInput.disabled = running || paused;
  ui.routeLabelsInput.disabled = running || paused;
  ui.movementInput.disabled = running || paused;
  document.querySelectorAll('input[name="searchMode"]').forEach((input) => {
    input.disabled = running || paused;
  });
}

function renderTerminalContext() {
  const terminal = state.snapshot?.terminal;
  const goalType = terminal?.goalType || state.victorySeed?.goalType || "";
  const roundNumber = terminal?.roundNumber || 3;
  const snapshotScenario = (state.catalog?.scenarios || []).find((scenario) =>
    scenario.scenarioKey === terminal?.scenarioKey);
  const scenarioLabel = snapshotScenario?.label || state.scenario?.label ||
    terminal?.scenarioKey || "未选择场景";
  ui.terminalTitle.textContent = terminal
    ? `${scenarioLabel} · ${goalLabels[goalType] || goalType}`
    : state.victorySeed?.label || "选择一个胜利场景";
  const score = terminal?.terminalScore || {};
  const scoreText = Object.keys(score).length
    ? Object.entries(score).map(([side, value]) => `${side} ${value}`).join(" : ")
    : "待物化";
  ui.terminalMeta.innerHTML = [
    `第 ${roundNumber} 轮`,
    terminal?.winnerSideKey ? `胜者 ${terminal.winnerSideKey}` : "胜者待定",
    `终局分数 ${scoreText}`,
  ].map((label) => `<span>${escapeHtml(label)}</span>`).join("");
  const relation = terminal?.relationSummary;
  const selectedScenarioDiffers = Boolean(
    terminal?.scenarioKey && state.scenario?.scenarioKey &&
    terminal.scenarioKey !== state.scenario.scenarioKey,
  );
  const terminalAnchorKey = state.snapshot?.seed?.anchorKey;
  const terminalAnchor = (state.catalog?.scenarios || []).flatMap((scenario) =>
    scenario.victorySeeds || []).flatMap((victory) => victory.anchors || [])
    .find((anchor) => anchor.anchorKey === terminalAnchorKey);
  const hostCompatibility = state.snapshot?.replayPresentationEvidence?.hostCompatibility;
  ui.terminalRelation.dataset.selectionMismatch =
    selectedScenarioDiffers || hostCompatibility?.compatible === false ? "true" : "false";
  ui.terminalRelation.textContent = hostCompatibility?.compatible === false
    ? "此报告来自旧规则回执；分支已降级为规则版本漂移，需在当前 Host 重跑"
    : selectedScenarioDiffers
    ? `当前报告属于 ${scenarioLabel}；左侧 ${state.scenario.label} 仅用于下一次搜索`
    : relation
    ? [terminalAnchor?.label || relation.scenarioRelation,
      relationLabels[relation.actionRangeBand] || relation.actionRangeBand,
      relationLabels[relation.lineOfSightRelation] || relation.lineOfSightRelation]
      .filter(Boolean).join(" · ") || "终局关系已物化"
    : state.anchor?.label || "等待终局物化";
}

function renderMetrics() {
  const coverage = state.snapshot?.searchCoverage || {};
  const counts = state.snapshot?.dispositionCounts || {};
  const probability = winProbabilityEvidence();
  ui.winRateMetric.textContent = probability.label;
  ui.winRateMetric.title = probability.note;
  ui.foundMetric.textContent = String(coverage.foundBranchCount || 0);
  ui.strictMetric.textContent = String(coverage.strictCertifiedBranchCount || 0);
  ui.deploymentMetric.textContent = String(coverage.completeDeploymentRouteCount || 0);
  ui.processedMetric.textContent = String(coverage.processedLabelCount || state.progress.processedLabelCount || 0);
  ui.unknownMetric.textContent = String((counts.budget_deferred || 0) +
    (counts.pruned_low_probability || 0) + (counts.inverse_unresolved || 0) +
    (counts.rules_unknown || 0) + (counts.rules_drift || 0) ||
    state.progress.unresolvedCount || 0);
  ui.rejectedMetric.textContent = String(counts.strict_rejected || state.progress.rejectedBranchCount || 0);
}

function renderBranchPicker() {
  const branches = visibleBranches();
  if (!branches.some((branch) => branch.branchKey === state.selectedBranchKey)) {
    state.selectedBranchKey = branches[0]?.branchKey || "";
  }
  ui.branchSelect.disabled = branches.length === 0;
  ui.branchSelect.innerHTML = branches.length
    ? branches.map((branch, index) => `<option value="${escapeHtml(branch.branchKey)}" ${branch.branchKey === state.selectedBranchKey ? "selected" : ""}>${escapeHtml(`${index + 1} · ${branchDispositionLabel(branch)} · ${formatProbability(branch.probabilityInterval)}`)}</option>`).join("")
    : "<option>无结果</option>";
}

function branchExtentLabel(branch) {
  if (branch.completeToDeployment) return "已反推到合法部署";
  if (branch.reversedPriorTurnCount > 0) return `反推 ${branch.reversedPriorTurnCount} 个完整回合`;
  return "当前回合前驱";
}

function summarizeNumericMap(value = {}, suffix = "") {
  const rows = Object.entries(value).filter(([, amount]) => Number(amount) !== 0);
  return rows.length
    ? rows.map(([side, amount]) => `${side} ${Number(amount) > 0 ? "+" : ""}${amount}${suffix}`).join(" · ")
    : "无变化";
}

function numericProbability(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    if (value.includes("/")) {
      const [numerator, denominator] = value.split("/").map(Number);
      return denominator ? numerator / denominator : null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object") {
    const numerator = Number(value.numerator ?? value.n);
    const denominator = Number(value.denominator ?? value.d);
    return denominator ? numerator / denominator : null;
  }
  return null;
}

function winProbabilityEvidence() {
  const branches = (state.snapshot?.graph?.branches || []).filter((branch) =>
    branch.disposition === "strict_certified");
  if (!branches.length) return { label: "无样本", note: "尚未找到 strict 获胜路径", known: false };
  const intervals = branches.map((branch) => ({
    lower: numericProbability(branch.probabilityInterval?.lower),
    upper: numericProbability(branch.probabilityInterval?.upper),
  })).filter((row) => row.lower !== null && row.upper !== null);
  if (!intervals.length) return { label: "待估", note: "路径概率尚未量化", known: false };
  const lower = Math.max(...intervals.map((row) => row.lower));
  const upper = Math.min(1, intervals.reduce((total, row) => total + row.upper, 0));
  if (lower <= 0 && upper >= 1) {
    return { label: "待估", note: "当前只能给出 0%–100% 的无信息边界", known: false };
  }
  const percent = (value) => `${(value * 100).toFixed(value * 100 % 1 ? 1 : 0)}%`;
  return {
    label: lower === upper ? percent(lower) : `${percent(lower)}–${percent(upper)}`,
    note: "这是已发现路径的概率证据包络，不是自然对局统计胜率",
    known: true,
  };
}

function activateReportView(viewKey) {
  document.querySelector(".result-panel")?.setAttribute("data-active-view", viewKey);
  document.querySelectorAll(".tab-button").forEach((button) =>
    button.classList.toggle("active", button.dataset.view === viewKey));
  document.querySelectorAll(".report-view").forEach((view) =>
    view.classList.toggle("active", view.id === `${viewKey}View`));
  if (viewKey === "board") requestAnimationFrame(renderBoard);
}

function renderStrategyReport() {
  const branch = selectedBranch();
  const summary = branchEvidence(branch);
  const probability = winProbabilityEvidence();
  const unresolvedCount = Object.entries(state.snapshot?.dispositionCounts || {})
    .filter(([key]) => key !== "strict_rejected")
    .reduce((total, [, count]) => total + Number(count || 0), 0);
  const strict = branch?.disposition === "strict_certified" && branch?.strictReplay?.certified;
  const terminal = state.snapshot?.terminal || {};
  ui.strategyHeadline.textContent = !branch
    ? "尚未找到可展示的获胜路径"
    : branch.disposition === "rules_drift"
      ? "该路径曾在旧规则版本重放通过，但当前 Host 已使其失效"
    : strict
      ? `已找到可严格重放的${goalLabels[terminal.goalType] || "获胜"}路径${branch.completeToDeployment ? "，并已反推到合法部署" : "，但尚未反推到部署"}`
      : "当前分支没有通过独立 strict 重放";
  ui.strategyConfidence.textContent = strict ? "规则可达" : "证据不足";
  ui.strategyConfidenceNote.textContent = strict
    ? "证明这条路径可执行，不等于全局最优"
    : "需先闭合规则执行与重放证据";
  const scoreDelta = summarizeNumericMap(summary.scoreDeltaBySide || {});
  const removals = summarizeNumericMap(summary.removedPieceCountBySide || {}, " 个");
  ui.strategyOutcome.textContent = branch
    ? `${terminal.winnerSideKey || "胜方"} 获胜 · 分数 ${scoreDelta} · 移除 ${removals}`
    : "—";
  ui.strategyRouteScale.textContent = branch
    ? `${summary.actionCount || branch.edgeIds.length} 步 / ${summary.decisiveActionCount || 0} 个关键动作`
    : "—";
  ui.strategyProbability.textContent = probability.label;
  ui.strategyRiskCount.textContent = `${unresolvedCount} 项`;
  const edges = branchEdges(branch);
  ui.strategyStepCount.textContent = String(edges.length);
  ui.strategySteps.innerHTML = edges.map((edge, index) => `
    <button type="button" class="strategy-step ${String(edge.actionType || "").startsWith("end_") || edge.actionType === "pass" ? "structural" : ""}" data-strategy-edge="${escapeHtml(edge.edgeId)}">
      <span>${String(index + 1).padStart(2, "0")}</span>
      <strong>${escapeHtml(edge.actionLabel)}</strong>
      <small>${escapeHtml(pieceLabel(edge.actorPieceKey) || "系统结算")}${edge.targetPieceKey ? ` → ${escapeHtml(pieceLabel(edge.targetPieceKey))}` : ""}</small>
    </button>`).join("") || '<div class="empty-state"><span>暂无动作路径。</span></div>';
  ui.strategySteps.querySelectorAll("[data-strategy-edge]").forEach((button) =>
    button.addEventListener("click", () => {
      selectEdge(button.dataset.strategyEdge);
      activateReportView("board");
    }));
  const reasonRows = branch ? [
    ["规则执行", branch.strictReplay?.certified ? "整条路径独立重放通过" : "重放未通过"],
    ["动作空间", summary.strictActionSpaceClosedWithinDeclaredScope ? "声明范围内闭合" : "仍有候选缺口"],
    ["反推范围", branchExtentLabel(branch)],
    ["参与模型", `${summary.distinctActorCount || 0} 个`],
    ["伤害结果", summarizeNumericMap(summary.boxesLostBySide || {}, " 格")],
    ["资源变化", summarizeNumericMap(summary.resourceDeltaBySide || {})],
  ] : [];
  ui.strategyReasons.innerHTML = reasonRows.map(([label, value]) =>
    `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("") ||
    '<span class="muted">等待搜索结果。</span>';
  const risks = [
    branch?.disposition === "rules_drift"
      ? "规则 Host 回执已变化；此分支仅供历史回看，必须在当前 Host 重新搜索与 strict 重放。" : "",
    !branch?.completeToDeployment ? "这条证据只到有界前沿，尚未证明能从合法部署一路到达。" : "",
    !probability.known ? probability.note : `概率说明：${probability.note}。`,
    unresolvedCount ? `本次搜索仍有 ${unresolvedCount} 项预算延迟、逆算缺口或规则未知。` : "",
    (state.snapshot?.strategyScorePresent === false)
      ? "当前没有策略评分；推荐顺序按证据完整性展示，不宣称全局最优。" : "",
  ].filter(Boolean);
  ui.strategyRisks.innerHTML = risks.map((risk) => `<p>${escapeHtml(risk)}</p>`).join("") ||
    "<p>当前声明范围内未发现额外风险。</p>";
}

function renderBranchCards() {
  const branches = visibleBranches();
  ui.branchResultCount.textContent = String(branches.length);
  ui.branchCards.innerHTML = branches.map((branch, index) => {
    const summary = branchEvidence(branch);
    const keyAction = summary.keyActions?.at(-1);
    return `<button type="button" class="branch-card ${branch.branchKey === state.selectedBranchKey ? "active" : ""}" data-branch-key="${escapeHtml(branch.branchKey)}">
      <span class="branch-card-head"><b>分支 ${index + 1}</b><i class="branch-status ${branch.disposition === "strict_certified" ? "certified" : "failed"}">${branch.disposition === "rules_drift" ? "规则漂移" : branch.disposition === "strict_certified" ? "strict" : "失败"}</i></span>
      <strong>${escapeHtml(branchExtentLabel(branch))}</strong>
      <span class="branch-card-facts"><i>${summary.actionCount || branch.edgeIds.length} 步</i><i>${summary.decisiveActionCount || 0} 个关键动作</i><i>${escapeHtml(formatProbability(branch.probabilityInterval))}</i></span>
      <small>${escapeHtml(keyAction ? `${keyAction.actionLabel} · ${pieceLabel(keyAction.actorPieceKey)}` : "仅阶段或结束动作")}</small>
    </button>`;
  }).join("") || `<div class="candidate-empty">${state.snapshot ? "当前筛选下没有候选" : "搜索结果发布后显示所有候选"}</div>`;
  ui.branchCards.querySelectorAll("[data-branch-key]").forEach((button) =>
    button.addEventListener("click", () => selectBranch(button.dataset.branchKey)));
}

function selectBranch(branchKey, sharedNodeId = "") {
  stopBoardPlayback();
  state.selectedBranchKey = branchKey;
  state.selectedNodeId = "";
  state.selectedEdgeId = "";
  const sharedIndex = sharedNodeId
    ? branchNodes().findIndex((node) => node.nodeId === sharedNodeId)
    : -1;
  state.boardNodeIndex = sharedIndex >= 0 ? sharedIndex : 0;
  renderBranchPicker();
  renderBranchCards();
  renderStrategyReport();
  renderGraph();
  renderBoard();
  renderTimeline();
  renderComparison();
  renderInspector();
}

function renderGraph() {
  const branches = visibleBranches();
  ui.graphEmpty.hidden = branches.length > 0;
  ui.graphViewport.hidden = branches.length === 0;
  if (!branches.length) {
    ui.branchGraph.innerHTML = "";
    return;
  }
  const allEdges = new Map(state.snapshot.graph.edges.map((edge) => [edge.edgeId, edge]));
  const allNodes = new Map(state.snapshot.graph.nodes.map((node) => [node.nodeId, node]));
  const coordinates = new Map();
  let maximumLength = 1;
  branches.forEach((branch, branchIndex) => {
    const edges = branch.edgeIds.map((id) => allEdges.get(id)).filter(Boolean);
    maximumLength = Math.max(maximumLength, edges.length + 1);
    const ids = edges.length ? [edges[0].predecessorNodeId, ...edges.map((edge) => edge.successorNodeId)] : [];
    ids.forEach((nodeId, index) => {
      if (!coordinates.has(nodeId)) coordinates.set(nodeId, { x: 75 + index * 192, y: 62 + branchIndex * 112 });
    });
  });
  const width = Math.max(ui.graphViewport.clientWidth || 700, 150 + (maximumLength - 1) * 192);
  const height = Math.max(ui.graphViewport.clientHeight || 420, 125 + (branches.length - 1) * 112);
  ui.branchGraph.setAttribute("viewBox", `0 0 ${width} ${height}`);
  ui.branchGraph.setAttribute("width", String(width));
  ui.branchGraph.setAttribute("height", String(height));
  const edgeMarkup = [];
  for (const branch of branches) {
    for (const edgeId of branch.edgeIds) {
      const edge = allEdges.get(edgeId);
      const from = coordinates.get(edge.predecessorNodeId);
      const to = coordinates.get(edge.successorNodeId);
      if (!edge || !from || !to) continue;
      const path = `M ${from.x + 57} ${from.y} C ${from.x + 88} ${from.y}, ${to.x - 88} ${to.y}, ${to.x - 57} ${to.y}`;
      edgeMarkup.push(`<path class="graph-edge ${branch.disposition === "strict_certified" ? "certified" : "rejected"} ${edgeId === state.selectedEdgeId ? "selected" : ""}" d="${path}"/>`);
      edgeMarkup.push(`<path class="graph-edge-hit" data-edge-id="${escapeHtml(edgeId)}" d="${path}"/>`);
      edgeMarkup.push(`<text class="edge-label" x="${(from.x + to.x) / 2}" y="${from.y - 9}" text-anchor="middle">${escapeHtml(edge.actionLabel)}</text>`);
    }
  }
  const nodeMarkup = [...coordinates.entries()].map(([nodeId, point]) => {
    const node = allNodes.get(nodeId);
    if (!node) return "";
    const selected = nodeId === state.selectedNodeId ? "selected" : "";
    return `<g class="state-node certified ${selected}" data-node-id="${escapeHtml(nodeId)}" transform="translate(${point.x - 57} ${point.y - 26})">
      <rect width="114" height="52"></rect>
      <text class="node-title" x="8" y="18">第 ${node.turnNumber} 轮 · ${escapeHtml(node.phaseKey)}</text>
      <text class="node-detail" x="8" y="34">${escapeHtml(node.activeSideKey)} · ${escapeHtml(shortHash(node.stateHash, 9))}</text>
      <text class="node-detail" x="8" y="46">${escapeHtml(Object.entries(node.score || {}).map(([k, v]) => `${k}:${v}`).join("  "))}</text>
    </g>`;
  });
  ui.branchGraph.innerHTML = `${edgeMarkup.join("")}${nodeMarkup.join("")}`;
  ui.branchGraph.querySelectorAll("[data-node-id]").forEach((element) => element.addEventListener("click", () => selectNode(element.dataset.nodeId)));
  ui.branchGraph.querySelectorAll("[data-edge-id]").forEach((element) => element.addEventListener("click", () => selectEdge(element.dataset.edgeId)));
}

function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  state.selectedEdgeId = "";
  const index = branchNodes().findIndex((node) => node.nodeId === nodeId);
  if (index >= 0) state.boardNodeIndex = index;
  renderGraph();
  renderBoard();
  renderInspector();
}

function selectEdge(edgeId) {
  state.selectedEdgeId = edgeId;
  state.selectedNodeId = "";
  const edge = state.snapshot.graph.edges.find((row) => row.edgeId === edgeId);
  const index = branchNodes().findIndex((node) => node.nodeId === edge?.predecessorNodeId);
  if (index >= 0) state.boardNodeIndex = index;
  renderGraph();
  renderTimeline();
  renderBoard();
  renderInspector();
}

function renderBoardStepNavigation(nodes = [], edges = [], node = null) {
  ui.boardStepRail.innerHTML = nodes.map((row, index) => {
    const edge = index > 0 ? edges[index - 1] : null;
    return `<button type="button" class="board-step-chip ${index === state.boardNodeIndex ? "active" : ""}" data-board-step="${index}" title="${escapeHtml(edge ? `${edge.actionLabel} · ${pieceLabel(edge.actorPieceKey) || "系统"}` : "路径起点")}">
      <b>${index}</b><span>${escapeHtml(edge?.actionLabel || "起点")}</span>
    </button>`;
  }).join("") || '<span class="muted">暂无路径步骤</span>';
  ui.boardStepRail.querySelectorAll("[data-board-step]").forEach((button) =>
    button.addEventListener("click", () => {
      stopBoardPlayback();
      state.boardNodeIndex = Number(button.dataset.boardStep);
      renderBoard();
    }));
  const siblingRows = visibleBranches().map((branch, branchIndex) => {
    const siblingNodes = branchNodes(branch);
    const nodeIndex = node
      ? siblingNodes.findIndex((candidate) => candidate.nodeId === node.nodeId)
      : -1;
    if (nodeIndex < 0) return null;
    const nextEdge = branchEdges(branch)[nodeIndex] || null;
    return { branch, branchIndex, nextEdge };
  }).filter(Boolean);
  ui.boardSiblingBranches.innerHTML = siblingRows.map(({ branch, branchIndex, nextEdge }) => `
    <button type="button" class="board-sibling-button ${branch.branchKey === state.selectedBranchKey ? "active" : ""}" data-sibling-branch="${escapeHtml(branch.branchKey)}" data-shared-node="${escapeHtml(node?.nodeId || "")}">
      <b>分支 ${branchIndex + 1}</b><span>${escapeHtml(nextEdge ? `${nextEdge.actionLabel} · ${pieceLabel(nextEdge.actorPieceKey) || "系统"}` : "路径终点")}</span>
    </button>`).join("") || '<span class="muted">此状态没有其它已发现后续</span>';
  ui.boardSiblingBranches.querySelectorAll("[data-sibling-branch]").forEach((button) =>
    button.addEventListener("click", () =>
      selectBranch(button.dataset.siblingBranch, button.dataset.sharedNode)));
}

function boardCanvasPoint(value = {}, viewport = {}, scale = 1) {
  return {
    x: (Number(value.xIn || 0) - Number(viewport.xIn || 0)) * scale,
    y: (Number(viewport.yIn || 0) + Number(viewport.heightIn || 0) -
      Number(value.yIn || 0)) * scale,
  };
}

function drawBoardArrow(context, from, to, scale, viewport, color = "#176b7a") {
  if (!from || !to) return;
  const start = boardCanvasPoint(from, viewport, scale);
  const end = boardCanvasPoint(to, viewport, scale);
  const startX = start.x;
  const startY = start.y;
  const endX = end.x;
  const endY = end.y;
  if (Math.hypot(endX - startX, endY - startY) < 1) return;
  const angle = Math.atan2(endY - startY, endX - startX);
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 2.5;
  context.setLineDash([6, 4]);
  context.beginPath(); context.moveTo(startX, startY); context.lineTo(endX, endY); context.stroke();
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(endX, endY);
  context.lineTo(endX - 9 * Math.cos(angle - Math.PI / 6), endY - 9 * Math.sin(angle - Math.PI / 6));
  context.lineTo(endX - 9 * Math.cos(angle + Math.PI / 6), endY - 9 * Math.sin(angle + Math.PI / 6));
  context.closePath(); context.fill();
  context.restore();
}

function terrainPaint(terrain = {}) {
  if (terrain.isScenarioTerrain) return { fill: "rgba(205, 154, 50, .28)", stroke: "#9b6508" };
  if (terrain.isForest) return { fill: "rgba(61, 121, 75, .25)", stroke: "#356f46" };
  if (terrain.isObstruction || terrain.isBuilding) {
    return { fill: "rgba(73, 77, 82, .34)", stroke: "#34393e" };
  }
  if (terrain.isObstacle) return { fill: "rgba(125, 112, 92, .32)", stroke: "#71624d" };
  if (terrain.isShallowWater) return { fill: "rgba(61, 142, 177, .22)", stroke: "#337f9e" };
  if (terrain.isTrench) return { fill: "rgba(126, 88, 51, .26)", stroke: "#795130" };
  if (terrain.isHazard || terrain.hazardTerrain) {
    return { fill: "rgba(177, 61, 41, .22)", stroke: "#a23827" };
  }
  return { fill: "rgba(94, 112, 106, .18)", stroke: "#586b65" };
}

function drawTerrainElement(context, terrain, scale, viewport) {
  const center = boardCanvasPoint({
    xIn: terrain.xIn ?? terrain.position?.xIn ?? 0,
    yIn: terrain.yIn ?? terrain.position?.yIn ?? 0,
  }, viewport, scale);
  const x = center.x;
  const y = center.y;
  const widthIn = Number(terrain.widthIn || 0);
  const heightIn = Number(terrain.heightIn || 0);
  const radiusIn = Number(terrain.radiusIn || 0);
  const width = Math.max(1, (widthIn || radiusIn * 2 || 2) * scale);
  const height = Math.max(1, (heightIn || radiusIn * 2 || 2) * scale);
  const paint = terrainPaint(terrain);
  context.save();
  context.translate(x, y);
  context.rotate(-Number(terrain.rotationDegrees || 0) * Math.PI / 180);
  context.fillStyle = paint.fill;
  context.strokeStyle = paint.stroke;
  context.lineWidth = terrain.blocksMovement || terrain.blocksLineOfSight ? 2 : 1.25;
  if (radiusIn && String(terrain.shape || terrain.templateShape || "").toLowerCase() === "circle") {
    context.beginPath(); context.arc(0, 0, radiusIn * scale, 0, Math.PI * 2);
    context.fill(); context.stroke();
  } else {
    context.fillRect(-width / 2, -height / 2, width, height);
    context.strokeRect(-width / 2, -height / 2, width, height);
  }
  context.restore();
  const label = String(terrain.label || terrain.ruleName || terrain.type || "地形");
  context.save();
  context.font = "600 9px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const labelWidth = Math.min(width + 20, context.measureText(label).width + 8);
  context.fillStyle = "rgba(255,255,255,.86)";
  context.fillRect(x - labelWidth / 2, y - 7, labelWidth, 14);
  context.fillStyle = "#293237";
  context.fillText(label, x, y, Math.max(12, labelWidth - 6));
  context.restore();
}

function drawScenarioElement(context, element, scale, viewport, kind = "目标") {
  const center = boardCanvasPoint({
    xIn: element.xIn ?? element.position?.xIn ?? 0,
    yIn: element.yIn ?? element.position?.yIn ?? 0,
  }, viewport, scale);
  const x = center.x;
  const y = center.y;
  const baseRadiusIn = Number(element.baseRadiusIn ||
    (element.baseSizeIn ? element.baseSizeIn / 2 : (element.baseSizeMm || 50) / 50.8));
  const controlRangeIn = Number(element.contestingRangeIn || element.controlRangeIn || 0);
  if (controlRangeIn > 0) {
    context.save();
    context.beginPath(); context.arc(x, y, controlRangeIn * scale, 0, Math.PI * 2);
    context.strokeStyle = "rgba(42, 97, 153, .46)";
    context.lineWidth = 1;
    context.setLineDash([4, 4]); context.stroke(); context.restore();
  }
  context.beginPath(); context.arc(x, y, Math.max(2, baseRadiusIn * scale), 0, Math.PI * 2);
  context.fillStyle = kind === "补给" ? "rgba(129, 79, 145, .28)" : "rgba(50,106,160,.22)";
  context.fill();
  context.strokeStyle = kind === "补给" ? "#774783" : "#2d6398";
  context.lineWidth = 1.75; context.stroke();
  context.fillStyle = "#21303a";
  context.font = "700 8px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(kind, x, y);
}

function updateBoardPresentationEvidence(node) {
  const evidence = state.snapshot?.replayPresentationEvidence || {};
  const board = evidence.board || {};
  const identity = evidence.pieceIdentity || {};
  ui.boardEvidenceMode.textContent = board.renderMode ===
    "official_scenario_diagram_plus_rules_state_geometry"
    ? (board.geometryExactWithinDeclaredScope
      ? "官方场景图 + strict 状态 · exact"
      : "官方场景图 + strict 状态 · 有缺口")
    : board.renderMode === "rules_state_geometry"
      ? (board.geometryExactWithinDeclaredScope ? "规则状态几何 · exact" : "规则状态几何 · 有缺口")
      : "无地图证据";
  ui.boardIdentityMetric.textContent =
    `${identity.exactIdentityMatchedPieceCount || 0} / ${identity.projectedPieceCount || 0}`;
  ui.boardPortraitMetric.textContent =
    `${identity.exactPortraitPieceCount || 0} / ${identity.projectedPieceCount || 0}`;
  ui.boardAssetGapMetric.textContent = String(identity.missingExactPortraitPieceCount || 0);
  ui.boardEvidenceMode.title = board.backgroundAssetBound
    ? `已按场景键绑定 Steamroller 2026 官方初始布置图；当前元素和棋子由 strict 状态坐标叠加。来源：${board.backgroundImageSourceMemberPath || "官方媒体包"}`
    : `当前搜索根没有地图贴图绑定；按 ${node?.terrain?.length || 0} 个地形与 ${node?.objectives?.length || 0} 个目标的规则坐标绘制`;
}

function boardViewport(node, activeEdge) {
  const widthIn = Number(node?.board?.widthIn || 48);
  const heightIn = Number(node?.board?.heightIn || 48);
  if (state.boardViewMode !== "focus" || !activeEdge) {
    return { xIn: 0, yIn: 0, widthIn, heightIn };
  }
  const pieces = new Map((node.pieces || []).map((piece) => [piece.pieceKey, piece]));
  const points = [activeEdge.actorPieceKey, activeEdge.targetPieceKey]
    .map((pieceKey) => pieces.get(pieceKey)?.position).filter(Boolean);
  if (!points.length) return { xIn: 0, yIn: 0, widthIn, heightIn };
  const minX = Math.min(...points.map((point) => Number(point.xIn || 0)));
  const maxX = Math.max(...points.map((point) => Number(point.xIn || 0)));
  const minY = Math.min(...points.map((point) => Number(point.yIn || 0)));
  const maxY = Math.max(...points.map((point) => Number(point.yIn || 0)));
  const size = Math.min(Math.max(16, maxX - minX + 8, maxY - minY + 8), widthIn, heightIn);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return {
    xIn: Math.max(0, Math.min(widthIn - size, centerX - size / 2)),
    yIn: Math.max(0, Math.min(heightIn - size, centerY - size / 2)),
    widthIn: size,
    heightIn: size,
  };
}

function renderBoard() {
  const nodes = branchNodes();
  state.boardNodeIndex = Math.max(0, Math.min(state.boardNodeIndex, Math.max(0, nodes.length - 1)));
  const node = nodes[state.boardNodeIndex];
  ui.stateSlider.max = String(Math.max(0, nodes.length - 1));
  ui.stateSlider.value = String(state.boardNodeIndex);
  ui.statePosition.textContent = nodes.length ? `${state.boardNodeIndex + 1} / ${nodes.length}` : "0 / 0";
  const edges = branchEdges();
  const enteringEdge = state.boardNodeIndex > 0 ? edges[state.boardNodeIndex - 1] : null;
  const selectedEdgeCandidate = state.snapshot?.graph?.edges?.find((edge) =>
    edge.edgeId === state.selectedEdgeId);
  const selectedEdge = selectedEdgeCandidate && [
    selectedEdgeCandidate.predecessorNodeId,
    selectedEdgeCandidate.successorNodeId,
  ].includes(node?.nodeId) ? selectedEdgeCandidate : null;
  const activeEdge = selectedEdge || enteringEdge;
  renderBoardStepNavigation(nodes, edges, node);
  updateBoardPresentationEvidence(node);
  ui.boardStepTitle.textContent = node
    ? `第 ${node.turnNumber} 轮 · ${node.activeSideKey} · ${node.phaseKey}`
    : "尚未选择状态";
  ui.boardStepDetail.textContent = enteringEdge
    ? `${enteringEdge.actionLabel} · ${pieceLabel(enteringEdge.actorPieceKey) || "系统结算"}${enteringEdge.targetPieceKey ? ` → ${pieceLabel(enteringEdge.targetPieceKey)}` : ""}`
    : nodes.length ? "该分支的最早已恢复状态" : "选择分支后可逐步回放。";
  ui.previousStateButton.disabled = state.boardNodeIndex <= 0;
  ui.nextStateButton.disabled = !nodes.length || state.boardNodeIndex >= nodes.length - 1;
  ui.playStateButton.disabled = nodes.length < 2;
  ui.playStateButton.textContent = state.boardPlaybackTimer ? "Ⅱ" : "▶";
  ui.boardFullButton.classList.toggle("active", state.boardViewMode === "full");
  ui.boardFocusButton.classList.toggle("active", state.boardViewMode === "focus");
  ui.boardFocusButton.disabled = !activeEdge;
  const canvas = ui.boardCanvas;
  const context = canvas.getContext("2d");
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const cssSize = Math.max(320, Math.min(canvas.parentElement.clientWidth - 20, canvas.parentElement.clientHeight - 20));
  canvas.style.width = `${cssSize}px`;
  canvas.style.height = `${cssSize}px`;
  canvas.width = Math.round(cssSize * ratio);
  canvas.height = Math.round(cssSize * ratio);
  context.scale(ratio, ratio);
  context.clearRect(0, 0, cssSize, cssSize);
  context.fillStyle = "#edf0ea";
  context.fillRect(0, 0, cssSize, cssSize);
  if (!node) return;
  const widthIn = Number(node.board?.widthIn || 48);
  const heightIn = Number(node.board?.heightIn || 48);
  const viewport = boardViewport(node, activeEdge);
  const scale = Math.min(cssSize / viewport.widthIn, cssSize / viewport.heightIn);
  context.save();
  const boardEvidence = state.snapshot?.replayPresentationEvidence?.board || {};
  const background = boardEvidence.backgroundAssetBound
    ? cachedImageForUrl(boardEvidence.backgroundImageUrl)
    : null;
  const source = boardEvidence.backgroundImageSourceRectPx;
  const backgroundReady = background?.complete && background.naturalWidth && source;
  if (backgroundReady) {
    const sourceX = Number(source.x || 0) + viewport.xIn / widthIn * Number(source.width || 0);
    const sourceY = Number(source.y || 0) +
      (heightIn - viewport.yIn - viewport.heightIn) / heightIn * Number(source.height || 0);
    const sourceWidth = viewport.widthIn / widthIn * Number(source.width || 0);
    const sourceHeight = viewport.heightIn / heightIn * Number(source.height || 0);
    context.drawImage(background, sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, viewport.widthIn * scale, viewport.heightIn * scale);
  } else {
    context.strokeStyle = "#d7dfdd";
    context.lineWidth = 1;
    for (let inch = 0; inch <= Math.max(widthIn, heightIn); inch += 4) {
      const verticalX = (inch - viewport.xIn) * scale;
      const horizontalY = (viewport.yIn + viewport.heightIn - inch) * scale;
      context.beginPath(); context.moveTo(verticalX, 0); context.lineTo(verticalX, cssSize); context.stroke();
      context.beginPath(); context.moveTo(0, horizontalY); context.lineTo(cssSize, horizontalY); context.stroke();
    }
  }
  for (const terrain of node.terrain || []) drawTerrainElement(context, terrain, scale, viewport);
  for (const objective of node.objectives || []) drawScenarioElement(context, objective, scale, viewport, "目标");
  for (const cache of node.caches || []) drawScenarioElement(context, cache, scale, viewport, "补给");
  const emphasized = new Set([activeEdge?.actorPieceKey, activeEdge?.targetPieceKey].filter(Boolean));
  const previousNode = state.boardNodeIndex > 0 ? nodes[state.boardNodeIndex - 1] : null;
  if (enteringEdge && previousNode) {
    const priorPieces = new Map((previousNode.pieces || []).map((piece) => [piece.pieceKey, piece]));
    const actorBefore = priorPieces.get(enteringEdge.actorPieceKey);
    const actorAfter = (node.pieces || []).find((piece) =>
      piece.pieceKey === enteringEdge.actorPieceKey);
    if (actorBefore?.position && actorAfter?.position &&
        JSON.stringify(actorBefore.position) !== JSON.stringify(actorAfter.position)) {
      drawBoardArrow(context, actorBefore.position, actorAfter.position, scale, viewport);
    } else if (actorAfter?.position && enteringEdge.targetPieceKey) {
      const target = (node.pieces || []).find((piece) =>
        piece.pieceKey === enteringEdge.targetPieceKey) ||
        priorPieces.get(enteringEdge.targetPieceKey);
      drawBoardArrow(context, actorAfter.position, target?.position, scale, viewport, "#a62f2c");
    }
  }
  const labelBoxes = [];
  for (const piece of node.pieces || []) {
    if (!piece.position || piece.destroyed || piece.removedFromPlay) continue;
    const center = boardCanvasPoint(piece.position, viewport, scale);
    const x = center.x;
    const y = center.y;
    const radius = Math.max(2.1, Number(piece.baseSizeIn || 1.18) * scale / 2);
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = piece.sideKey === "player1" ? "#087f77" : "#bd3d3a";
    context.globalAlpha = piece.activated ? .58 : .9;
    context.fill(); context.globalAlpha = 1;
    const portrait = portraitImageForPiece(piece);
    if (portrait?.complete && portrait.naturalWidth) {
      const sourceSize = Math.min(portrait.naturalWidth, portrait.naturalHeight);
      const sourceX = (portrait.naturalWidth - sourceSize) / 2;
      const sourceY = (portrait.naturalHeight - sourceSize) / 2;
      context.save();
      context.beginPath(); context.arc(x, y, Math.max(1, radius - 1), 0, Math.PI * 2);
      context.clip();
      context.globalAlpha = piece.activated ? .58 : .96;
      context.drawImage(
        portrait,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        x - radius,
        y - radius,
        radius * 2,
        radius * 2,
      );
      context.restore();
    } else {
      const fallback = String(piece.cardName || piece.label || "?")
        .split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
      context.fillStyle = "rgba(255,255,255,.9)";
      context.font = `700 ${Math.max(7, Math.min(11, radius * .8))}px sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(fallback || "?", x, y);
    }
    context.strokeStyle = emphasized.has(piece.pieceKey) ? "#f2b705" : piece.isLeader ? "#11191c" : "rgba(255,255,255,.82)";
    context.lineWidth = emphasized.has(piece.pieceKey) ? 3 : piece.isLeader ? 2 : 1;
    context.stroke();
    if (piece.isLeader || emphasized.has(piece.pieceKey)) {
      context.fillStyle = "#152126";
      context.font = "10px sans-serif";
      const label = piece.label.slice(0, 18);
      const labelWidth = context.measureText(label).width + 6;
      const labelHeight = 13;
      const candidates = [
        { x: x + radius + 3, y: y - radius - labelHeight },
        { x: x + radius + 3, y: y + radius + 2 },
        { x: x - radius - labelWidth - 3, y: y - radius - labelHeight },
        { x: x - radius - labelWidth - 3, y: y + radius + 2 },
      ];
      const placement = candidates.find((candidate) =>
        candidate.x >= 1 && candidate.y >= 1 &&
        candidate.x + labelWidth <= cssSize - 1 &&
        candidate.y + labelHeight <= cssSize - 1 &&
        labelBoxes.every((box) => candidate.x + labelWidth < box.x ||
          candidate.x > box.x + box.width || candidate.y + labelHeight < box.y ||
          candidate.y > box.y + box.height)) || candidates[0];
      labelBoxes.push({ ...placement, width: labelWidth, height: labelHeight });
      context.fillStyle = "rgba(255,255,255,.9)";
      context.fillRect(placement.x, placement.y, labelWidth, labelHeight);
      context.fillStyle = "#152126";
      context.fillText(label, placement.x + 3, placement.y + 10);
    }
  }
  context.restore();
}

function stopBoardPlayback() {
  if (state.boardPlaybackTimer) window.clearInterval(state.boardPlaybackTimer);
  state.boardPlaybackTimer = null;
  if (ui.playStateButton) ui.playStateButton.textContent = "▶";
}

function toggleBoardPlayback() {
  if (state.boardPlaybackTimer) {
    stopBoardPlayback();
    renderBoard();
    return;
  }
  const nodes = branchNodes();
  if (nodes.length < 2) return;
  if (state.boardNodeIndex >= nodes.length - 1) state.boardNodeIndex = 0;
  state.boardPlaybackTimer = window.setInterval(() => {
    state.boardNodeIndex += 1;
    renderBoard();
    if (state.boardNodeIndex >= nodes.length - 1) stopBoardPlayback();
  }, 900);
  renderBoard();
}

function renderTimeline() {
  const edges = branchEdges();
  ui.timelineList.innerHTML = edges.map((edge, index) => `
    <div class="timeline-row ${edge.edgeId === state.selectedEdgeId ? "selected" : ""}" data-edge-id="${escapeHtml(edge.edgeId)}">
      <span class="timeline-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="timeline-action">${escapeHtml(edge.actionLabel)}</span>
      <span class="timeline-actor" title="${escapeHtml(edge.actorPieceKey || "")}">${escapeHtml(pieceLabel(edge.actorPieceKey) || "系统结算")}</span>
      <span class="timeline-target" title="${escapeHtml(edge.targetPieceKey || "")}">${escapeHtml(pieceLabel(edge.targetPieceKey) || "—")}</span>
      <span class="strict-mark">✓ strict</span>
    </div>`).join("") || '<div class="empty-state"><span>暂无动作记录</span></div>';
  ui.timelineList.querySelectorAll("[data-edge-id]").forEach((row) => row.addEventListener("click", () => selectEdge(row.dataset.edgeId)));
}

function renderComparison() {
  const branches = visibleBranches();
  ui.comparisonRows.innerHTML = branches.map((branch, index) => {
    const summary = branchEvidence(branch);
    const resultParts = [
      `分数 ${summarizeNumericMap(summary.scoreDeltaBySide)}`,
      `损伤 ${summarizeNumericMap(summary.boxesLostBySide, " 格")}`,
      `移除 ${summarizeNumericMap(summary.removedPieceCountBySide, " 个")}`,
    ];
    return `<tr class="comparison-row ${branch.branchKey === state.selectedBranchKey ? "selected" : ""}" data-branch-key="${escapeHtml(branch.branchKey)}">
      <td><strong>分支 ${index + 1}</strong><code>${escapeHtml(shortHash(branch.branchKey, 14))}</code></td>
      <td><span class="disposition-tag ${branch.disposition === "strict_certified" ? "strict-certified" : branch.disposition}">${escapeHtml(branchDispositionLabel(branch))}</span><small>${branch.strictReplay?.historicalCertified ? "旧 Host 独立重放曾通过" : summary.strictActionSpaceClosedWithinDeclaredScope ? "声明动作空间闭合" : "动作空间仍有缺口"}</small></td>
      <td><strong>${escapeHtml(branchExtentLabel(branch))}</strong><small>${summary.startsAt ? `第 ${summary.startsAt.turnNumber} 轮 ${summary.startsAt.phaseKey}` : "起点未知"}</small></td>
      <td><strong>${summary.actionCount || branch.edgeIds.length} 步</strong><small>${summary.decisiveActionCount || 0} 关键 · ${summary.movementActionCount || 0} 移动 · ${summary.attackActionCount || 0} 攻击</small></td>
      <td>${resultParts.map((row) => `<small>${escapeHtml(row)}</small>`).join("")}</td>
      <td><strong>${escapeHtml(formatProbability(branch.probabilityInterval))}</strong><small>${branch.completeToDeployment ? "完整部署端点" : "有界前沿"}</small></td>
    </tr>`;
  }).join("") || '<tr><td colspan="6" class="muted">当前筛选下没有可比较分支。</td></tr>';
  ui.comparisonRows.querySelectorAll("[data-branch-key]").forEach((row) =>
    row.addEventListener("click", () => selectBranch(row.dataset.branchKey)));
}

function renderDispositions() {
  const rows = state.snapshot?.dispositions || [];
  ui.dispositionRows.innerHTML = rows.map((row) => `
    <tr><td><span class="disposition-tag ${escapeHtml(row.disposition)}">${escapeHtml(dispositionLabels[row.disposition] || row.disposition)}</span></td>
    <td>${escapeHtml(row.stageKey || "—")}</td><td>${escapeHtml(row.reason || "—")}</td><td><code>${escapeHtml(shortHash(row.stateHash, 16))}</code></td></tr>`).join("") ||
    '<tr><td colspan="4" class="muted">当前搜索没有拒绝或未闭合记录。</td></tr>';
}

function stateDifference(edge) {
  const nodeById = new Map((state.snapshot?.graph?.nodes || []).map((node) => [node.nodeId, node]));
  const before = nodeById.get(edge.predecessorNodeId);
  const after = nodeById.get(edge.successorNodeId);
  if (!before || !after) return [];
  const rows = [];
  const scoreBefore = JSON.stringify(before.score || {});
  const scoreAfter = JSON.stringify(after.score || {});
  if (scoreBefore !== scoreAfter) rows.push([scoreBefore, "分数", scoreAfter]);
  const beforePieces = new Map(before.pieces.map((piece) => [piece.pieceKey, piece]));
  for (const afterPiece of after.pieces) {
    const beforePiece = beforePieces.get(afterPiece.pieceKey);
    if (!beforePiece) continue;
    if (JSON.stringify(beforePiece.position) !== JSON.stringify(afterPiece.position)) {
      rows.push([formatPosition(beforePiece.position), afterPiece.label, formatPosition(afterPiece.position)]);
    }
    if (beforePiece.boxesRemaining !== afterPiece.boxesRemaining) {
      rows.push([beforePiece.boxesRemaining, `${afterPiece.label} 生命`, afterPiece.boxesRemaining]);
    }
    if (beforePiece.resourcePoints !== afterPiece.resourcePoints) {
      rows.push([beforePiece.resourcePoints, `${afterPiece.label} 资源`, afterPiece.resourcePoints]);
    }
  }
  return rows.slice(0, 12);
}

function formatPosition(position) {
  if (!position) return "场外";
  return `${Number(position.xIn).toFixed(1)}, ${Number(position.yIn).toFixed(1)}`;
}

function renderInspector() {
  const node = state.snapshot?.graph?.nodes?.find((row) => row.nodeId === state.selectedNodeId);
  const edge = state.snapshot?.graph?.edges?.find((row) => row.edgeId === state.selectedEdgeId);
  const branch = selectedBranch();
  ui.inspectorEmpty.hidden = Boolean(node || edge || branch);
  ui.inspectorContent.hidden = !(node || edge || branch);
  if (!node && !edge && !branch) return;
  if (edge) {
    ui.selectionKind.textContent = "动作边";
    ui.inspectorHeading.textContent = edge.actionLabel;
    ui.inspectorSubheading.textContent = `${edge.layerKey || "规则动作"} · ${edge.operatorKey || "strict transition"}`;
    ui.inspectorFacts.innerHTML = factsHtml([
      ["行动模型", pieceLabel(edge.actorPieceKey) || "系统结算"],
      ["目标", pieceLabel(edge.targetPieceKey) || "无"],
      ["合法候选数", edge.legalActionCount],
      ["动作空间", edge.legalActionSpaceCompleteWithinDeclaredScope ? "声明范围内完整" : "未闭合"],
      ["执行", edge.strictTransitionAccepted ? "rules-v1 接受" : "拒绝"],
    ]);
    ui.receiptHash.textContent = edge.strictReceiptHash || "无 strict receipt";
    const differences = stateDifference(edge);
    ui.stateDiff.innerHTML = differences.map(([before, label, after]) => `<div class="diff-row"><span>${escapeHtml(before)}</span><span>${escapeHtml(label)}</span><strong>${escapeHtml(after)}</strong></div>`).join("") || '<span class="muted">语义状态无可见差异。</span>';
  } else if (node) {
    ui.selectionKind.textContent = "状态节点";
    ui.inspectorHeading.textContent = `第 ${node.turnNumber} 轮 · ${node.phaseKey}`;
    ui.inspectorSubheading.textContent = shortHash(node.stateHash, 22);
    ui.inspectorFacts.innerHTML = factsHtml([
      ["行动方", node.activeSideKey], ["分数", JSON.stringify(node.score)],
      ["在场模型", node.pieces.filter((piece) => !piece.destroyed && !piece.removedFromPlay).length],
      ["已激活", node.pieces.filter((piece) => piece.activated).length],
      ["计分记录", node.scoringHistory.length],
    ]);
    ui.receiptHash.textContent = "状态由相邻 strict receipt 链绑定";
    ui.stateDiff.innerHTML = '<span class="muted">选择相邻动作查看状态变化。</span>';
  } else {
    const summary = branchEvidence(branch);
    ui.selectionKind.textContent = "分支概览";
    ui.inspectorHeading.textContent = branchExtentLabel(branch);
    ui.inspectorSubheading.textContent = shortHash(branch.branchKey, 24);
    ui.inspectorFacts.innerHTML = factsHtml([
      ["证据状态", branchDispositionLabel(branch)],
      ["动作总数", summary.actionCount || branch.edgeIds.length],
      ["关键动作", summary.decisiveActionCount || 0],
      ["行动模型", summary.distinctActorCount || 0],
      ["分数变化", summarizeNumericMap(summary.scoreDeltaBySide)],
      ["损伤变化", summarizeNumericMap(summary.boxesLostBySide, " 格")],
      ["资源净变", summarizeNumericMap(summary.resourceDeltaBySide)],
    ]);
    ui.receiptHash.textContent = branch.strictReplay?.replayHash || "无独立重放回执";
    ui.stateDiff.innerHTML = '<span class="muted">选择动作边查看逐项状态变化。</span>';
  }
  ui.branchClosure.innerHTML = `
    <div><span>独立重放</span><strong>${branch?.strictReplay?.certified ? "通过" : "未通过"}</strong></div>
    <div><span>到达部署</span><strong>${branch?.completeToDeployment ? "是" : "尚未"}</strong></div>
    <div><span>反推回合</span><strong>${branch?.reversedPriorTurnCount ?? 0}</strong></div>
    <div><span>概率区间</span><strong>${escapeHtml(formatProbability(branch?.probabilityInterval))}</strong></div>`;
  const keyActions = branchEvidence(branch).keyActions || [];
  ui.keyActionList.innerHTML = keyActions.map((action) => `
    <button type="button" data-edge-id="${escapeHtml(action.edgeId)}"><strong>${escapeHtml(action.actionLabel)}</strong><span>${escapeHtml(pieceLabel(action.actorPieceKey) || "系统")}${action.targetPieceKey ? ` → ${escapeHtml(pieceLabel(action.targetPieceKey))}` : ""}</span></button>`).join("") || '<span class="muted">该分支没有非结构性动作。</span>';
  ui.keyActionList.querySelectorAll("[data-edge-id]").forEach((button) =>
    button.addEventListener("click", () => selectEdge(button.dataset.edgeId)));
  const assumptions = state.snapshot?.terminal?.assumptionLedger || [];
  ui.assumptionList.innerHTML = assumptions.map((assumption) => `
    <div><code>${escapeHtml(assumption.fieldKey)}</code><span>${escapeHtml(assumption.sourceKind)}</span><i>${escapeHtml(assumption.evidenceState)}</i></div>`).join("") || '<span class="muted">旧报告未包含逐项假设来源。</span>';
}

function factsHtml(rows) {
  return rows.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
}

function formatProbability(interval) {
  if (!interval) return "未闭合";
  const formatMass = (value) => {
    if (value && typeof value === "object") {
      if (value.numerator !== undefined && value.denominator !== undefined) {
        return `${value.numerator}/${value.denominator}`;
      }
      if (value.n !== undefined && value.d !== undefined) return `${value.n}/${value.d}`;
      return JSON.stringify(value);
    }
    return String(value);
  };
  return `${formatMass(interval.lower)} – ${formatMass(interval.upper)}`;
}

function renderEvents() {
  ui.eventCount.textContent = String(state.events.length);
  ui.eventLog.innerHTML = state.events.slice(-300).map((event) => {
    const payload = event.payload || {};
    const detail = payload.error || payload.errorMessage || payload.stage || payload.source || payload.seedKey || payload.reason || payload.snapshotHash || "";
    return `<div class="event-row"><time>${escapeHtml(new Date(event.occurredAt).toLocaleTimeString("zh-CN", { hour12: false }))}</time><span class="event-type">${escapeHtml(event.eventType)}</span><span class="event-source">${escapeHtml(payload.source || event.state || "")}</span><span class="event-detail" title="${escapeHtml(detail)}">${escapeHtml(detail)}</span></div>`;
  }).join("") || '<div class="event-row"><span></span><span class="event-type">等待搜索</span><span></span><span class="event-detail">—</span></div>';
  ui.eventLog.scrollTop = ui.eventLog.scrollHeight;
}

function renderLiveActivity() {
  const progress = state.progress || {};
  const stage = String(progress.stage || "");
  ui.liveStage.textContent = stageLabels[stage] || (state.session?.state === "running"
    ? "搜索正在运行"
    : state.session?.state === "completed" ? "本次有界搜索已完成" : "等待搜索");
  const processed = Number(progress.processedLabelCount || progress.expandedLabelCount || 0);
  const total = Math.max(processed, Number(progress.routeLabelCount || 0));
  const current = progress.current;
  const parts = [
    total ? `${processed} / ${total} 标签` : "尚无前沿计数",
    current?.turnNumber ? `第 ${current.turnNumber} 轮` : "",
    current?.activeSideKey || progress.sideKey || "",
    Number.isFinite(progress.depth) ? `深度 ${progress.depth}` : "",
  ].filter(Boolean);
  ui.liveProgressText.textContent = parts.join(" · ");
  const ratio = total > 0 ? Math.min(1, processed / total) : 0;
  ui.liveProgressBar.style.width = `${Math.max(0, ratio * 100)}%`;
  ui.liveProgressBar.dataset.active = state.session?.state === "running" ? "true" : "false";
}

function renderAll() {
  renderScenarioPicker();
  renderSessionStatus();
  renderTerminalContext();
  renderMetrics();
  renderBranchPicker();
  renderBranchCards();
  renderStrategyReport();
  renderGraph();
  renderBoard();
  renderTimeline();
  renderComparison();
  renderDispositions();
  renderInspector();
  renderEvents();
  renderLiveActivity();
}

function openSeedDialog() {
  state.validatedInjectedSeed = null;
  state.seedView = "quick";
  ui.injectSeedButton.disabled = true;
  ui.seedValidationState.textContent = "未校验";
  ui.seedIssues.className = "seed-issues";
  ui.seedIssues.textContent = "";
  const seed = currentSeed();
  ui.seedEditor.value = JSON.stringify(seed, null, 2);
  populateQuickSeedForm(seed);
  renderSeedMode();
  ui.seedDialog.showModal();
}

function populateQuickSeedForm(seed = currentSeed()) {
  const scenarios = state.catalog?.scenarios || [];
  ui.seedScenarioSelect.innerHTML = scenarios.map((scenario) =>
    `<option value="${escapeHtml(scenario.scenarioKey)}">${escapeHtml(scenario.label)}</option>`).join("");
  ui.seedScenarioSelect.value = seed.scenarioKey || scenarios[0]?.scenarioKey || "";
  updateQuickSeedChoices(seed.presetKey, seed.anchorKey);
  ui.seedRoundInput.value = String(seed.roundNumber || 3);
  ui.seedRandomInput.value = seed.randomSeed || "user-terminal-seed-v1";
  renderQuickSeedPreview();
}

function updateQuickSeedChoices(preferredVictory = "", preferredAnchor = "") {
  const scenario = (state.catalog?.scenarios || []).find((row) =>
    row.scenarioKey === ui.seedScenarioSelect.value) || state.catalog?.scenarios?.[0];
  const victories = scenario?.victorySeeds || [];
  ui.seedVictorySelect.innerHTML = victories.map((victory) =>
    `<option value="${escapeHtml(victory.presetKey)}">${escapeHtml(victory.label)}</option>`).join("");
  ui.seedVictorySelect.value = victories.some((row) => row.presetKey === preferredVictory)
    ? preferredVictory : victories[0]?.presetKey || "";
  const victory = victories.find((row) => row.presetKey === ui.seedVictorySelect.value);
  const anchors = victory?.anchors || [];
  ui.seedAnchorSelect.innerHTML = anchors.map((anchor) =>
    `<option value="${escapeHtml(anchor.anchorKey)}">${escapeHtml(anchor.label)}</option>`).join("");
  ui.seedAnchorSelect.value = anchors.some((row) => row.anchorKey === preferredAnchor)
    ? preferredAnchor : anchors[0]?.anchorKey || "";
  if (victory?.roundNumber) ui.seedRoundInput.value = String(victory.roundNumber);
  renderQuickSeedPreview();
}

function quickSeed() {
  const scenario = (state.catalog?.scenarios || []).find((row) =>
    row.scenarioKey === ui.seedScenarioSelect.value);
  const victory = scenario?.victorySeeds?.find((row) =>
    row.presetKey === ui.seedVictorySelect.value);
  return {
    seedKind: "preset_reference",
    presetKey: victory?.presetKey || "",
    scenarioKey: scenario?.scenarioKey || "",
    goalType: victory?.goalType || "",
    roundNumber: Number(ui.seedRoundInput.value || 3),
    anchorKey: ui.seedAnchorSelect.value,
    randomSeed: ui.seedRandomInput.value.trim() || victory?.randomSeed || "user-terminal-seed-v1",
  };
}

function renderQuickSeedPreview() {
  if (!ui.quickSeedPreview) return;
  ui.quickSeedPreview.textContent = JSON.stringify(quickSeed(), null, 2);
}

function renderSeedMode() {
  document.querySelectorAll(".seed-mode-button").forEach((button) =>
    button.classList.toggle("active", button.dataset.seedView === state.seedView));
  ui.quickSeedView.classList.toggle("active", state.seedView === "quick");
  ui.exactSeedView.classList.toggle("active", state.seedView === "exact");
  state.validatedInjectedSeed = null;
  ui.injectSeedButton.disabled = true;
  ui.seedValidationState.textContent = "未校验";
  ui.seedIssues.textContent = "";
}

async function validateEditorSeed() {
  try {
    const seed = state.seedView === "quick" ? quickSeed() : JSON.parse(ui.seedEditor.value);
    const validation = await api("/api/v1/seeds/validate", {
      method: "POST", body: JSON.stringify({ seed }),
    });
    state.validatedInjectedSeed = validation.ok ? validation.seed : null;
    ui.seedValidationState.textContent = validation.ok ? "校验通过" : "校验失败";
    ui.seedIssues.className = `seed-issues ${validation.ok ? "ok" : ""}`;
    ui.seedIssues.textContent = validation.ok
      ? `${validation.seed.seedKind} · trainingTruth=false`
      : validation.issues.join("\n");
    ui.injectSeedButton.disabled = !validation.ok;
  } catch (error) {
    state.validatedInjectedSeed = null;
    ui.seedValidationState.textContent = "JSON 无效";
    ui.seedIssues.className = "seed-issues";
    ui.seedIssues.textContent = error.message;
    ui.injectSeedButton.disabled = true;
  }
}

document.querySelectorAll(".tab-button").forEach((button) =>
  button.addEventListener("click", () => activateReportView(button.dataset.view)));
ui.startButton.addEventListener("click", () => {
  if (state.session && ["completed", "failed", "cancelled", "interrupted"].includes(state.session.state)) sendCommand("start");
  else {
    try { createAndStart().catch((error) => setActionError(error.message)); }
    catch (error) { setActionError(error.message); }
  }
});
ui.pauseButton.addEventListener("click", () => sendCommand("pause"));
ui.resumeButton.addEventListener("click", () => sendCommand("resume"));
ui.cancelButton.addEventListener("click", () => sendCommand("cancel"));
ui.newSessionButton.addEventListener("click", () => {
  stopBoardPlayback();
  state.eventSource?.close();
  state.session = null; state.snapshot = null; state.events = []; state.progress = {};
  const url = new URL(window.location.href);
  url.searchParams.delete("session");
  window.history.replaceState({}, "", url);
  renderAll();
});
ui.seedButton.addEventListener("click", openSeedDialog);
ui.validateSeedButton.addEventListener("click", validateEditorSeed);
ui.injectSeedButton.addEventListener("click", async () => {
  if (!state.validatedInjectedSeed) return;
  ui.seedDialog.close();
  try { await createAndStart(state.validatedInjectedSeed); } catch (error) { setActionError(error.message); }
});
ui.stateSlider.addEventListener("input", () => { state.boardNodeIndex = Number(ui.stateSlider.value); renderBoard(); });
ui.previousStateButton.addEventListener("click", () => { stopBoardPlayback(); state.boardNodeIndex -= 1; renderBoard(); });
ui.playStateButton.addEventListener("click", toggleBoardPlayback);
ui.nextStateButton.addEventListener("click", () => { stopBoardPlayback(); state.boardNodeIndex += 1; renderBoard(); });
ui.boardFullButton.addEventListener("click", () => { state.boardViewMode = "full"; renderBoard(); });
ui.boardFocusButton.addEventListener("click", () => { state.boardViewMode = "focus"; renderBoard(); });
ui.branchSelect.addEventListener("change", () => selectBranch(ui.branchSelect.value));
document.querySelectorAll('input[name="branchFilter"]').forEach((input) =>
  input.addEventListener("change", () => {
    state.branchFilter = input.value;
    selectBranch(visibleBranches()[0]?.branchKey || "");
  }));
ui.branchSort.addEventListener("change", () => {
  state.branchSort = ui.branchSort.value;
  renderBranchPicker(); renderBranchCards(); renderGraph(); renderComparison();
});
document.querySelectorAll(".seed-mode-button").forEach((button) =>
  button.addEventListener("click", () => {
    state.seedView = button.dataset.seedView;
    renderSeedMode();
  }));
ui.seedScenarioSelect.addEventListener("change", () => updateQuickSeedChoices());
ui.seedVictorySelect.addEventListener("change", () => updateQuickSeedChoices(ui.seedVictorySelect.value));
ui.seedAnchorSelect.addEventListener("change", renderQuickSeedPreview);
ui.seedRoundInput.addEventListener("input", renderQuickSeedPreview);
ui.seedRandomInput.addEventListener("input", renderQuickSeedPreview);
window.addEventListener("resize", () => { renderGraph(); renderBoard(); });

async function boot() {
  try {
    state.catalog = await api("/api/v1/catalog");
    ui.rulesReceipt.textContent = `rules-v1 · ${shortHash(state.catalog.hostReceiptHash, 12)}`;
    ui.reverseTurnsInput.value = state.catalog.defaultConfig.maximumReverseTurns;
    ui.routeLabelsInput.value = state.catalog.defaultConfig.maximumRouteLabels;
    ui.movementInput.checked = state.catalog.defaultConfig.includeMovement;
    const defaultMode = document.querySelector(
      `input[name="searchMode"][value="${state.catalog.defaultConfig.searchMode || "long_horizon"}"]`,
    );
    if (defaultMode) defaultMode.checked = true;
    const listing = await api("/api/v1/sessions");
    const requestedSessionId = new URL(window.location.href).searchParams.get("session") || "";
    const requested = listing.sessions.find((session) =>
      session.sessionId === requestedSessionId);
    const latest = requested ||
      listing.sessions.find((session) => session.resultAvailable) || listing.sessions[0];
    if (latest) attachSession(latest);
    else renderAll();
  } catch (error) {
    setActionError(error.message);
    renderAll();
  }
}

boot();
