#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from "../src/graph/typed-facts-v2.mjs";
import { buildWarmachineInitialStateDomainV1 } from
  "../src/matchup/initial-state-domain-v1.mjs";
import { solveWarmachineInitialStateValuesV1 } from
  "../src/matchup/initial-state-value-v1.mjs";
import { buildWarmachineMatchupScreeningV1 } from
  "../src/matchup/matchup-screening-v1.mjs";
import { buildSepsiraSixSwarmVsFaneTaskV1 } from
  "../src/matchup/custom-matchup-task-v1.mjs";
import { materializeWarmachineRepresentativeOpeningsV1 } from
  "../src/matchup/representative-opening-materializer-v1.mjs";
import { buildWarmachineSteamrollerFallbackOpeningBindersV1 } from
  "../src/matchup/steamroller-opening-binders-v1.mjs";
import { buildWarmachineSteamrollerOpeningMapTemplateV1 } from
  "../src/matchup/steamroller-opening-map-template-v1.mjs";
import { buildWarmachineRosterEvidenceSetV1 } from
  "../src/matchup/roster-rule-evidence-v1.mjs";
import { buildWarmachineTerminalDemandRosterRoutingV1 } from
  "../src/matchup/terminal-demand-roster-routing-v1.mjs";
import { compileWarmachineTaskRosterUniverseV1 } from
  "../src/matchup/task-roster-universe-v1.mjs";
import { resolveWarmachineHostPath, warmachineHost } from
  "../src/warmachine-host-runtime.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const dataPath = resolveWarmachineHostPath(
  "android-shell/assets/default/warmachine-lite-data.json",
);
const baseDirectory = resolveWarmachineHostPath(
  "build/warmachine-ai/sepsira-swarm-vs-fane-v20260805",
);
const poolPath = path.join(baseDirectory, "strict-construction-pool-v1/report.json");
const roomStorePath = path.join(baseDirectory, "local-layer3/state.json");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(reverseDirectory, ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1"));

function loadJsonWithHash(filePath) {
  const bytes = fs.readFileSync(filePath);
  return {
    value: JSON.parse(bytes),
    contentHash: createHash("sha256").update(bytes).digest("hex"),
  };
}

function writeJson(fileName, value) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

function sourcePool(poolKey, poolSection, loadedPool) {
  return {
    poolKey,
    lists: poolSection.rosters,
    sourceContentHash: loadedPool.contentHash,
    sourceSchemaVersion: loadedPool.value.schemaVersion,
    exactListLegality: poolSection.quality.exactListLegality,
    forceBuilderContract: poolSection.algorithm.finalLegality,
    remoteVersion: poolSection.source.remoteVersion,
    exhaustiveAllFactionRosters: false,
  };
}

function maximumBy(rows = [], selector) {
  return [...rows].sort((left, right) => selector(right) - selector(left) ||
    String(left.key).localeCompare(String(right.key)))[0];
}

function selectSubjectRepresentatives(cryxLists = []) {
  const recursion = maximumBy(cryxLists, (list) =>
    Number(list.features?.recursion || 0) * 100 + Number(list.features?.models || 0));
  const controlMobility = maximumBy(cryxLists, (list) =>
    Number(list.features?.control || 0) * 100 + Number(list.features?.mobility || 0) * 10 +
    Number(list.features?.ranged || 0));
  const rangedThreat = maximumBy(cryxLists, (list) =>
    Number(list.features?.threatReach || 0) * 10 + Number(list.features?.ranged || 0) * 5 +
    Number(list.features?.highPower || 0));
  const swarmExchange = maximumBy(cryxLists, (list) =>
    Number(list.features?.spray || 0) * 100 + Number(list.features?.attackPotential || 0) * 10 +
    Number(list.features?.antiTough || 0));
  return [...new Map([
    [recursion?.key, { roster: recursion, reason: "cryx_recursion_and_body_count_extreme" }],
    [controlMobility?.key, { roster: controlMobility, reason: "cryx_control_mobility_extreme" }],
    [rangedThreat?.key, { roster: rangedThreat, reason: "cryx_ranged_threat_extreme" }],
    [swarmExchange?.key, { roster: swarmExchange, reason: "cryx_swarm_exchange_extreme" }],
  ].filter(([key]) => key)).values()];
}

function rosterSummary(roster = {}) {
  return {
    rosterKey: roster.key,
    leaderName: roster.leader,
    armyName: roster.army,
    pointTotal: roster.totalPoints,
    physicalModelCount: roster.physicalModels,
    featureBucket: roster.featureBucket,
    entries: roster.entries,
    exportText: roster.exportText,
  };
}

function compactScreeningRow(row = {}) {
  return {
    rosterKey: row.rosterKey,
    leaderName: row.leaderName,
    armyName: row.armyName,
    evidenceHash: row.evidenceHash,
    rawDimensions: row.rawDimensions,
    normalizedDimensions: row.normalizedDimensions,
    mapScreeningIndexes: row.mapScreeningIndexes,
    robustScreeningIndex: row.robustScreeningIndex,
    paretoEfficient: row.paretoEfficient,
    strongestDimensions: row.strongestDimensions,
    strictGameValueInterval: row.strictGameValueInterval,
    naturalWinRate: null,
  };
}

function chineseReport(report = {}) {
  const lines = [
    "# Sepsira 六队 Mechanithrall Swarm 对 Fane 构筑分析",
    "",
    `- 数据版本：${report.source.remoteVersion}`,
    `- 规则执行回执：${report.source.hostReceiptHash}`,
    `- 固定核心：${report.task.sides.subject.requiredCards.map((row) =>
      `${row.cardName} x${row.minimumCount}`).join("；")}`,
    `- 有限合法军表池：Cryx ${report.counts.subjectRosterCount}；Fane ${report.counts.challengerRosterCount}`,
    `- 声明初始状态地址：${report.counts.declaredInitialStateCount}`,
    `- 已严格物化代表开局：${report.counts.strictRepresentativeOpeningCount}`,
    "",
    "## 当前可下的结论",
    "",
    "当前报告可以比较军表的规则能力、独立骰率、地图适配和严格部署；尚不能把筛选指数称作自然胜率，也不能证明全局最优。严格博弈值在路径没有闭合前保持 [0,1]。",
    "",
    "## 各领袖候选",
    "",
  ];
  for (const leader of report.leaderConclusions) {
    lines.push(`### ${leader.leaderName}`, "");
    lines.push(`- 当前三地图最坏项筛选代表：${leader.robustBestRosterKey}`);
    lines.push(`- 筛选指数：${leader.robustBestScreeningIndex}（不是胜率）`);
    lines.push(`- 主要证据：${leader.strongestDimensions.map((row) =>
      `${row.dimensionKey}=${row.rawValue}`).join("；")}`);
    lines.push(`- 严格初始状态：${leader.strictOpeningCount} 个；博弈值区间仍为 [0,1]。`, "");
  }
  lines.push(
    "## 关键规则解释",
    "",
    "- Mechanithrall Grunt 是 Undead。只对 Living 生效的 Anatomical Precision 不计为本题 Tough 绕过。",
    "- Grievous Wounds、Decapitation 和明确的 boxed-to-RFP 时序分别单列；条件连杀没有在缺少位置关系时伪造为确定击杀。",
    "- Spray 与 AOE 分开。Warden 的 Corpulent Flesh 针对它被 AOE 直接命中后的 blast 结算，不等同于全单位无条件免疫 AOE。",
    "- 战兽 Fury 的命中增幅、伤害增幅和额外攻击用有限资源动态规划比较，但没有假定所有模型都能同时接触目标。",
    "",
    "## 下一证据层",
    "",
    "将代表开局接到刺杀与 Steamroller 得分终局的反向前沿，并以 rules-v1 Host 正向重放闭合路径。未闭合质量继续保留在上界，不以筛选指数代替。",
    "",
  );
  return `${lines.join("\n")}\n`;
}

const loadedData = loadJsonWithHash(dataPath);
const generatedPoolPath = path.join(outputDirectory, "goal-conditioned-roster-pool.json");
const loadedPool = loadJsonWithHash(generatedPoolPath);
const terminalDemandCachePath = path.join(
  outputDirectory,
  "terminal-demand-evidence-corpus.json",
);
const terminalDemandEvidence = loadJsonWithHash(terminalDemandCachePath).value;
const loadedRoomStore = loadJsonWithHash(roomStorePath);
const data = loadedData.value;
const pool = loadedPool.value;
const task = buildSepsiraSixSwarmVsFaneTaskV1();
const terminalDemandGroups = terminalDemandEvidence.demandGroups;
if (terminalDemandEvidence.taskHash !== task.taskHash ||
    terminalDemandEvidence.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
  throw new Error("terminal_demand_evidence_cache_contract_mismatch");
}
if (terminalDemandGroups.demandGroupSetHash !== pool.terminalDemand.demandGroupSetHash) {
  throw new Error("goal_conditioned_pool_terminal_demand_hash_mismatch");
}
const poolsByKey = {
  "sepsira-six-swarms-current-finite-pool": sourcePool(
    "sepsira-six-swarms-current-finite-pool",
    pool.subjectPool,
    loadedPool,
  ),
  "fane-of-nyrro-current-finite-pool": sourcePool(
    "fane-of-nyrro-current-finite-pool",
    pool.challengerPool,
    loadedPool,
  ),
};
const universe = compileWarmachineTaskRosterUniverseV1({ task, poolsByKey });
const terminalDemandRouting = buildWarmachineTerminalDemandRosterRoutingV1({
  task,
  demandGroups: terminalDemandGroups,
  subjectRosters: universe.sides.subject.rosters,
  challengerRosters: universe.sides.challenger.rosters,
  evidencePins: terminalDemandEvidence.evidencePins,
});
const initialDomain = buildWarmachineInitialStateDomainV1({
  task,
  subjectRosters: universe.sides.subject.rosters,
  challengerRosters: universe.sides.challenger.rosters,
});
const challengerEvidence = buildWarmachineRosterEvidenceSetV1({
  data,
  rosters: pool.challengerPool.rosters,
});
const screening = buildWarmachineMatchupScreeningV1({
  evidenceRows: challengerEvidence.rows,
  maximumPerLeader: 4,
});
const subjectRepresentatives = selectSubjectRepresentatives(pool.subjectPool.rosters);
const challengerRepresentatives = screening.leaders.map((leader) => ({
  roster: pool.challengerPool.rosters.find((list) => list.key === leader.robustBestRosterKey),
  leader,
}));
const rosterPairs = subjectRepresentatives.flatMap((subject) =>
  challengerRepresentatives.map((challenger) => ({
    subjectRosterKey: subject.roster.key,
    challengerRosterKey: challenger.roster.key,
    pairReason: `${subject.reason}:versus:${challenger.leader.leaderName}`,
  })));
const templateRoom = loadedRoomStore.value.roomsById?.[
  "room_f1823ced-bf71-4392-8669-c6330d237efb"
];
if (!templateRoom) throw new Error("representative_opening_template_room_missing");
const mapTemplateHash = stableGraphHash({
  roomStoreContentHash: loadedRoomStore.contentHash,
  roomId: templateRoom.id,
  shapes: templateRoom.shapes,
  deployments: templateRoom.deployments,
});
const exactTwoFrontsMapTemplate =
  buildWarmachineSteamrollerOpeningMapTemplateV1({
    templateRoom,
    baseTemplateHash: mapTemplateHash,
    mapKey: "mixed_table",
    scenarioKey: "two_fronts",
    firstPlayerSideKey: "player1",
    scenarioTerrainSetupClassKey: "all_selected_from_single_candidate",
  });
const scenarioBinders = buildWarmachineSteamrollerFallbackOpeningBindersV1();
const materialization = materializeWarmachineRepresentativeOpeningsV1({
  task,
  poolsByTaskSideKey: {
    subject: poolsByKey[task.sides.subject.sourcePoolKey],
    challenger: poolsByKey[task.sides.challenger.sourcePoolKey],
  },
  rosterPairs,
  exactMapTemplatesByKey: {
    mixed_table: exactTwoFrontsMapTemplate,
  },
  resolveExactMapTemplate: (row = {}) =>
    buildWarmachineSteamrollerOpeningMapTemplateV1({
      templateRoom,
      baseTemplateHash: mapTemplateHash,
      mapKey: row.mapKey,
      scenarioKey: row.scenarioKey,
      firstPlayerSideKey: row.firstPlayerTaskSideKey === "challenger"
        ? "player2" : "player1",
      scenarioTerrainSetupClassKey: "all_selected_from_single_candidate",
    }),
  scenarioBindersByKey: {
    two_fronts: (state, options = {}) => scenarioBinders.two_fronts(state, {
      ...options,
      scenarioTerrainSetupClassKey: "all_selected_from_single_candidate",
    }),
  },
  maximumMaterializedOpenings: 96,
  includeFullStates: false,
});
const unresolvedNodes = materialization.openings.map((opening) => ({
  nodeId: `root:${opening.initialStateKey}`,
  nodeKind: "unresolved",
  interval: { lowerBound: 0, upperBound: 1 },
}));
const initialValues = solveWarmachineInitialStateValuesV1({
  subjectTaskSideKey: "challenger",
  nodes: unresolvedNodes,
  edges: [],
  initialStates: materialization.openings.map((opening) => ({
    initialStateKey: opening.initialStateKey,
    rootNodeId: `root:${opening.initialStateKey}`,
    strictOpeningStateHash: opening.strictOpeningStateHash,
    strictDeploymentReceiptHash: opening.strictDeploymentReceiptHash,
  })),
});
const openingsByLeader = new Map();
for (const opening of materialization.openings) {
  const roster = pool.challengerPool.rosters.find((list) =>
    list.key === opening.challengerRosterKey);
  openingsByLeader.set(roster?.leader, (openingsByLeader.get(roster?.leader) || 0) + 1);
}
const leaderConclusions = screening.leaders.map((leader) => {
  const best = screening.rows.find((row) => row.rosterKey === leader.robustBestRosterKey);
  return {
    leaderName: leader.leaderName,
    finiteRosterCount: leader.rosterCount,
    paretoRosterCount: leader.paretoRosterCount,
    robustBestRosterKey: leader.robustBestRosterKey,
    robustBestScreeningIndex: leader.robustBestScreeningIndex,
    mapScreeningIndexes: best.mapScreeningIndexes,
    strongestDimensions: best.strongestDimensions,
    strictOpeningCount: openingsByLeader.get(leader.leaderName) || 0,
    strictGameValueInterval: { lowerBound: 0, upperBound: 1 },
    naturalWinRate: null,
    conclusionStatus: "shortlist_supported_terminal_route_pending",
  };
});
const rosterByKey = new Map([
  ...pool.subjectPool.rosters,
  ...pool.challengerPool.rosters,
].map((roster) =>
  [roster.key, roster]));
const compactOpenings = materialization.openings.map((opening) => ({
  ...opening,
  subjectRoster: rosterSummary(rosterByKey.get(opening.subjectRosterKey)),
  challengerRoster: rosterSummary(rosterByKey.get(opening.challengerRosterKey)),
}));
const reportCore = stableGraphValue({
  schemaVersion: "warmachine_custom_matchup_evidence_report_v1",
  generatedAt: new Date().toISOString(),
  source: {
    remoteVersion: data.source?.remoteVersion || "",
    dataContentHash: loadedData.contentHash,
    poolContentHash: loadedPool.contentHash,
    roomStoreContentHash: loadedRoomStore.contentHash,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
  },
  task,
  universe: {
    universeHash: universe.universeHash,
    exactListLegality: universe.exactListLegality,
    exhaustiveAllLegalRosters: universe.exhaustiveAllLegalRosters,
    rosterPairCount: universe.rosterPairCount,
  },
  initialDomain: {
    domainHash: initialDomain.domainHash,
    cellCount: initialDomain.cellCount,
    naturalWinRateAggregationAllowed: initialDomain.naturalWinRateAggregationAllowed,
  },
  terminalDemand: {
    ...pool.terminalDemand,
    routingHash: terminalDemandRouting.routingHash,
    eligibleDemandGroupCount: terminalDemandRouting.eligibleDemandGroupCount,
    deferredDemandGroupCount: terminalDemandRouting.deferredDemandGroupCount,
    queuedStrictEvaluationGroupCount: terminalDemandRouting.counts.queuedGroupCount,
    strictEvaluatedGroupCount: terminalDemandRouting.counts.strictEvaluatedGroupCount,
  },
  counts: {
    subjectRosterCount: universe.sides.subject.rosters.length,
    challengerRosterCount: universe.sides.challenger.rosters.length,
    rosterPairCount: universe.rosterPairCount,
    declaredInitialStateCount: initialDomain.cellCount,
    screenedChallengerRosterCount: screening.rosterCount,
    subjectRepresentativeCount: subjectRepresentatives.length,
    challengerRepresentativeCount: challengerRepresentatives.length,
    representativeRosterPairCount: rosterPairs.length,
    strictRepresentativeOpeningCount: materialization.strictOpeningCount,
    strictRejectedOpeningCount: materialization.strictRejectedCount,
    proposalOnlyOrDeferredOpeningCount: materialization.unresolvedCount,
    strictInitialValueCount: initialValues.strictOpeningValueCount,
    exactGameValueCount: initialValues.exactValueCount,
  },
  subjectRepresentatives: subjectRepresentatives.map((row) => ({
    reason: row.reason,
    roster: rosterSummary(row.roster),
  })),
  leaderConclusions,
  screening: {
    screeningHash: screening.screeningHash,
    mapWeights: screening.mapWeights,
    dimensionRanges: screening.dimensionRanges,
    rows: screening.rows.map(compactScreeningRow),
    claimBoundary: screening.claimBoundary,
  },
  representativeOpenings: compactOpenings,
  rejectedOpenings: materialization.rejected,
  unresolvedOpeningLedger: materialization.unresolved,
  initialValues,
  conclusion: {
    strongestCurrentClaim: "source_bound_rules_and_exact_dice_shortlist_plus_strict_openings",
    strictTerminalRoutesComplete: false,
    naturalWinRateClaimed: false,
    globalOptimalityProven: false,
    nextRequiredEvidence: [
      "reverse_terminal_frontier_per_goal",
      "strict_forward_route_closure",
      "opponent_choice_and_chance_mass_expansion",
      "exact_map_templates_for_remaining_map_profiles",
      "natural_distribution_weights_or_separate_cell_reporting",
    ],
  },
  quality: {
    exactFiniteRosterLegality: true,
    currentCardTextBound: true,
    exactIndependentDice: true,
    strictRepresentativeDeployment: materialization.strictOpeningCount > 0,
    strictGameValue: false,
    naturalWinRate: false,
    trainingTruth: false,
  },
  claimBoundary: "This report supports auditable finite-pool shortlist and exact representative-opening claims. It does not turn declared screening weights into strategy truth or win rate, and every unclosed strict path remains unresolved probability mass.",
});
const report = { ...reportCore, reportHash: stableGraphHash(reportCore) };
writeJson("report.json", report);
writeJson("rule-evidence.json", challengerEvidence);
writeJson("opening-materialization.json", materialization);
writeJson("terminal-demand-routing.json", terminalDemandRouting);
fs.writeFileSync(path.join(outputDirectory, "report.md"), chineseReport(report), "utf8");
process.stdout.write(`${JSON.stringify({
  ok: true,
  outputDirectory,
  reportHash: report.reportHash,
  counts: report.counts,
  leaderConclusions,
}, null, 2)}\n`);
