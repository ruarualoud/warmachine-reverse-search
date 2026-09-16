#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from "../src/graph/typed-facts-v2.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.resolve(
  process.env.WARMACHINE_RAPTOR_ACTION_SOURCE_SNAPSHOT ||
    path.join(projectRoot, ".scratch/current-host-raptor-nymara-action-source-v1.json"),
);
const reportDirectory = path.resolve(
  process.env.WARMACHINE_RAPTOR_ACTION_REPORT_OUTPUT ||
    path.join(projectRoot, "build/reports"),
);
const outputBaseName = String(
  process.env.WARMACHINE_RAPTOR_ACTION_COMPARISON_BASENAME ||
    "fixed-raptor-nymara-action-comparison-v1",
);

function actionSlug(action = {}) {
  return `${String(action.actionType || "action")}-${stableGraphHash(
    action.actionKey,
  ).slice(0, 12)}`.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function compareProbabilityDescending(left = {}, right = {}) {
  const leftNumerator = BigInt(left.numerator ?? 0);
  const leftDenominator = BigInt(left.denominator ?? 1);
  const rightNumerator = BigInt(right.numerator ?? 0);
  const rightDenominator = BigInt(right.denominator ?? 1);
  const difference = leftNumerator * rightDenominator - rightNumerator * leftDenominator;
  return difference > 0n ? -1 : difference < 0n ? 1 : 0;
}

function verifyReportHash(report = {}) {
  const { reportHash, ...core } = report;
  assert.equal(stableGraphHash(stableGraphValue(core)), reportHash,
    `fixed action report hash differs:${report.selectedAction?.actionKey || "unknown"}`);
}

assert.ok(fs.existsSync(sourcePath), `fixed Raptor source snapshot missing:${sourcePath}`);
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
assert.equal(source.schemaVersion, "warmachine_fixed_raptor_action_source_v1");
assert.equal(source.hostReceiptHash, warmachineHost.receipt.receiptHash,
  "fixed Raptor source and current Host receipt differ");

const rows = (source.legalTargetActions || []).map((action) => {
  const slug = actionSlug(action);
  const reportPath = path.join(
    reportDirectory,
    `fixed-raptor-nymara-${slug}-action-horizon-v4.json`,
  );
  assert.ok(fs.existsSync(reportPath), `fixed Raptor action report missing:${reportPath}`);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  verifyReportHash(report);
  assert.equal(report.source.hostReceiptHash, source.hostReceiptHash);
  assert.equal(report.source.sourceSnapshotHash, source.sourceHash);
  assert.equal(report.selectedAction.actionKey, action.actionKey);
  assert.equal(report.actionHorizonValue.exact, true,
    `fixed Raptor action value remains open:${action.actionKey}`);
  assert.equal(report.counts.strictRejectedEdgeCount, 0,
    `fixed Raptor action search contains a strict rejected edge:${action.actionKey}`);
  return {
    actionKey: action.actionKey,
    actionType: action.actionType,
    actorPieceKey: action.actorPieceKey,
    targetPieceKey: action.targetPieceKey,
    resourceKind: action.resourceKind || "",
    resourceCost: Number(action.resourceCost || 0),
    expectedDamage: action.expectedDamage ?? null,
    immediateAssassinationProbability: report.actionHorizonValue.lowerBound,
    fixedPolicyContinuationInterval: report.postActionContinuationInterval,
    chanceClassCount: report.counts.chanceClassCount,
    responseKeyCount: report.counts.responseKeyCount,
    successorLabelCount: report.counts.successorLabelCount,
    remainingChanceResponseWorkLabelCount:
      report.counts.remainingChanceResponseWorkLabelCount,
    unavailableResponseEdgeCount: report.counts.unavailableResponseEdgeCount,
    reportHash: report.reportHash,
    reportPath: path.relative(projectRoot, reportPath),
  };
}).sort((left, right) =>
  compareProbabilityDescending(
    left.immediateAssassinationProbability,
    right.immediateAssassinationProbability,
  ) || Number(right.expectedDamage || 0) - Number(left.expectedDamage || 0) ||
  left.actionKey.localeCompare(right.actionKey));

assert.equal(rows.length, Number(source.legalTargetActionCount || 0),
  "fixed Raptor legal action report coverage differs");
const core = {
  schemaVersion: "warmachine_fixed_raptor_action_comparison_v1",
  hostReceiptHash: source.hostReceiptHash,
  sourceHash: source.sourceHash,
  sourceStateHash: source.sourceStateHash,
  routeCheckpointReceiptHash: source.routeCheckpointReceiptHash,
  routeTransitionCount: source.routeTransitionCount,
  actorPieceKey: source.channelerPieceKey,
  targetPieceKey: source.targetPieceKey,
  targetBoxesRemaining: Number(source.sourceState?.pieces?.find((piece) =>
    piece.pieceKey === source.targetPieceKey)?.damage?.boxesRemaining || 0),
  legalTargetActionCount: rows.length,
  rankedActions: rows,
  rejectedTargetActionCount: Number(source.rejectedTargetActionCount || 0),
  rejectedTargetActions: stableGraphValue(source.rejectedTargetActions || []),
  claimBoundary: "This comparison exhausts the fixed source state's currently declared Raptor actions targeting Nymara and ranks only immediate leader destruction. It does not rank complete activations or match outcomes.",
};
const report = { ...core, reportHash: stableGraphHash(stableGraphValue(core)) };
const markdown = `${[
  "# Raptor 对 Nymara 固定局面动作比较",
  "",
  `- 报告哈希：\`${report.reportHash}\``,
  `- Host 回执：\`${report.hostReceiptHash}\``,
  `- 固定状态：\`${report.sourceStateHash}\``,
  `- 目标生命：${report.targetBoxesRemaining}`,
  `- 合法目标动作：${report.legalTargetActionCount}`,
  `- 被严格规则拒绝的目标动作：${report.rejectedTargetActionCount}`,
  "",
  "## 合法动作排名",
  "",
  ...report.rankedActions.map((row, index) =>
    `${index + 1}. \`${row.actionType}\`：立即刺杀概率 ${row.immediateAssassinationProbability.decimal}，固定后续策略区间 [${row.fixedPolicyContinuationInterval.lowerBound.decimal}, ${row.fixedPolicyContinuationInterval.upperBound.decimal}]，期望伤害 ${row.expectedDamage ?? "未提供"}，资源 ${row.resourceCost} ${row.resourceKind || "无"}，尚未执行的 Chance/响应工作 ${row.remainingChanceResponseWorkLabelCount}。`),
  "",
  "## 严格拒绝记录",
  "",
  ...(report.rejectedTargetActions.length
    ? report.rejectedTargetActions.map((row) =>
      `- \`${row.actionType}\` / \`${row.actionKey}\`：${row.reason || "未提供主拒绝原因"}${row.reasons?.length ? `；${row.reasons.join("；")}` : ""}`)
    : ["- 无。"]),
  "",
  "## 结论边界",
  "",
  "本报告完整比较该固定状态下、当前规则器声明的 Raptor 对 Nymara 目标动作，但只评价单个动作能否立即完成刺杀。完整激活、回合与整局价值必须由后续搜索继续计算。",
  "",
].join("\n")}\n`;

fs.mkdirSync(reportDirectory, { recursive: true });
const jsonPath = path.join(reportDirectory, `${outputBaseName}.json`);
const markdownPath = path.join(reportDirectory, `${outputBaseName}.md`);
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(markdownPath, markdown, "utf8");
process.stdout.write(`${JSON.stringify({
  ok: true,
  reportHash: report.reportHash,
  legalTargetActionCount: report.legalTargetActionCount,
  rejectedTargetActionCount: report.rejectedTargetActionCount,
  rankedActions: report.rankedActions.map((row) => ({
    actionKey: row.actionKey,
    actionType: row.actionType,
    immediateAssassinationProbability: row.immediateAssassinationProbability,
    expectedDamage: row.expectedDamage,
  })),
  jsonPath,
  markdownPath,
}, null, 2)}\n`);
