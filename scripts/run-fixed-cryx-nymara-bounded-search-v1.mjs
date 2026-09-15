#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildWarmachineFixedSteamrollerFixtureV2 } from
  "../src/benchmark/fixed-steamroller-fixture-v2.mjs";
import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import {
  advanceWarmachineTaskLocalBoundedSearchV1,
  buildWarmachineTaskLocalBoundedSearchReportV1,
  initializeWarmachineTaskLocalBoundedSearchV1,
  validateWarmachineTaskLocalBoundedSearchCheckpointV1,
} from "../src/search/task-local-bounded-adversarial-search-v1.mjs";
import { WarmachineExternalDagStore } from
  "../src/storage/external-dag-v1.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function integerArgument(name, fallback, minimum = 1) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix));
  const value = raw ? Number(raw.slice(prefix.length)) : fallback;
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`fixed_task_bounded_search_${name}_invalid`);
  }
  return value;
}

function contentHash(relativePaths) {
  const hash = createHash("sha256");
  for (const relativePath of [...relativePaths].sort()) {
    hash.update(relativePath);
    hash.update(fs.readFileSync(path.join(repositoryRoot, relativePath)));
  }
  return hash.digest("hex");
}

function writeAtomically(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, value);
  fs.renameSync(temporaryPath, filePath);
}

function markdown(report) {
  const lines = [
    "# Cryx 对 Nymara 固定任务有界搜索",
    "",
    `- 当前根值区间：\`${report.rootValueInterval.lowerBound}\` 到 \`${report.rootValueInterval.upperBound}\``,
    `- 搜索是否完成：\`${report.searchFinished}\``,
    `- 精确值是否闭合：\`${report.exactValueComplete}\``,
    `- 已展开节点：\`${report.counts.fullyExpandedNodeCount}\` / \`${report.counts.nodeCount}\``,
    `- 已记录边：\`${report.counts.edgeCount}\`；待处理节点：\`${report.counts.queuedNodeCount}\``,
    `- 根动作域槽位：\`${report.counts.rootCompletedSlotCount}\` / \`${report.counts.rootActivationDomainSlotCount ?? "待枚举"}\``,
    `- 规则未决边：\`${report.unresolvedCounts.ruleDependencyEdgeCount}\`；随机未决边：\`${report.unresolvedCounts.chanceEdgeCount}\`；连续域节点：\`${report.unresolvedCounts.continuousNodeCount}\``,
    "",
    "## 开局动作",
    "",
    "| 动作 | 类型 | 可靠区间 | 状态 |",
    "|---|---|---:|---|",
    ...report.rootActionRows.slice(0, 40).map((row) =>
      `| ${row.actionKey} | ${row.actionType} | ${row.valueInterval.lowerBound}–${row.valueInterval.upperBound} | ${row.unresolvedReasons.join("、") || "已接到后继"} |`),
    "",
    "## 结论边界",
    "",
    report.claimBoundary,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

const closurePath = path.join(
  repositoryRoot,
  "config/warmachine-fixed-cryx-nymara-task-rule-closure-v1.json",
);
const closure = JSON.parse(fs.readFileSync(closurePath, "utf8"));
const workUnitBudget = integerArgument("work-units", 1);
const maximumDecisionDepth = integerArgument("max-depth", 4);
const actionPageLimit = integerArgument("page-limit", 8);
const sourceHash = contentHash([
  "src/search/task-local-bounded-adversarial-search-v1.mjs",
  "src/search/complete-activation-domain-v2.mjs",
  "src/search/current-window-adversarial-frontier-v1.mjs",
  "src/search/current-decision-window-domain-v1.mjs",
  "src/contracts/task-local-action-rule-guard-v1.mjs",
]);
const configCore = stableGraphValue({
  schemaVersion: "warmachine_fixed_cryx_nymara_bounded_search_config_v1",
  taskKey: closure.taskKey,
  querySideKey: "player1",
  taskLocalRuleClosureHash: closure.taskLocalRuleClosureHash,
  maximumDecisionDepth,
  actionPageLimit,
});
const configHash = stableGraphHash(configCore);
const evidenceRoot = path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
  "task-local-bounded-search-v1",
  `${closure.taskLocalRuleClosureHash.slice(0, 12)}-${
    configHash.slice(0, 12)}-${sourceHash.slice(0, 12)}`,
);
const storeRoot = path.join(evidenceRoot, "dag-store");
const checkpointPath = path.join(evidenceRoot, "checkpoint.json");
const reportPath = path.join(evidenceRoot, "report.json");
const markdownPath = path.join(evidenceRoot, "report.md");
const store = new WarmachineExternalDagStore(storeRoot, {
  hostReceiptHash: closure.hostReceiptHash,
  sourceHash,
  configHash,
});
let checkpoint;
if (fs.existsSync(checkpointPath)) {
  checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  validateWarmachineTaskLocalBoundedSearchCheckpointV1(checkpoint, {
    hostReceiptHash: closure.hostReceiptHash,
    taskLocalRuleClosureHash: closure.taskLocalRuleClosureHash,
    sourceHash,
    configHash,
  });
} else {
  const fixture = buildWarmachineFixedSteamrollerFixtureV2();
  if (fixture.fixtureHash !== closure.fixtureHash ||
      fixture.opening.stateHash !== closure.openingStateHash) {
    throw new Error("fixed_task_bounded_search_opening_closure_mismatch");
  }
  checkpoint = initializeWarmachineTaskLocalBoundedSearchV1(
    fixture.stateTemplate,
    closure,
    store,
    {
      taskKey: closure.taskKey,
      querySideKey: "player1",
      maximumDecisionDepth,
      actionPageLimit,
      sourceHash,
      configHash,
    },
  );
}
const startedAtMs = Date.now();
checkpoint = advanceWarmachineTaskLocalBoundedSearchV1(
  checkpoint,
  closure,
  store,
  {
    workUnitBudget,
    onWorkUnitComplete(progress) {
      process.stderr.write(`${JSON.stringify({
        elapsedSeconds: Math.round((Date.now() - startedAtMs) / 1000),
        ...progress,
      })}\n`);
    },
    onCheckpoint(nextCheckpoint) {
      writeAtomically(checkpointPath, `${JSON.stringify(nextCheckpoint)}\n`);
    },
  },
);
const report = buildWarmachineTaskLocalBoundedSearchReportV1(checkpoint);
writeAtomically(checkpointPath, `${JSON.stringify(checkpoint)}\n`);
writeAtomically(reportPath, `${JSON.stringify(report, null, 2)}\n`);
writeAtomically(markdownPath, markdown(report));
process.stdout.write(`${JSON.stringify({
  ok: report.validConservativeInterval,
  evidenceRoot,
  checkpointPath,
  checkpointHash: checkpoint.checkpointHash,
  reportPath,
  reportHash: report.reportHash,
  rootValueInterval: report.rootValueInterval,
  searchFinished: report.searchFinished,
  exactValueComplete: report.exactValueComplete,
  counts: report.counts,
  unresolvedCounts: report.unresolvedCounts,
  elapsedMs: Date.now() - startedAtMs,
}, null, 2)}\n`);
