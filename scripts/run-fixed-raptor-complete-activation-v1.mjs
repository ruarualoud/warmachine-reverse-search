#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import {
  advanceWarmachineCompleteActivationExactGraphV1,
  buildWarmachineCompleteActivationExactGraphReportV1,
  initializeWarmachineCompleteActivationExactGraphV1,
  validateWarmachineCompleteActivationExactGraphCheckpointV1,
} from "../src/search/complete-activation-exact-graph-v1.mjs";
import { WarmachineExternalDagStore } from
  "../src/storage/external-dag-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function integerArgument(name, fallback, minimum = 1) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix));
  const value = raw ? Number(raw.slice(prefix.length)) : fallback;
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`fixed_raptor_complete_activation_${name}_invalid`);
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

function markdown(report = {}) {
  const rows = report.rootActionRows || [];
  const lines = [
    "# Raptor 单次完整激活精确搜索",
    "",
    `- Host 根合法动作分母：\`${report.rootAcceptedActionDenominator}\``,
    `- 去除对手拥有复合变体后的玩家动作分母：\`${report.rootCanonicalActionDenominator}\``,
    `- 已完成动作分支：\`${report.counts.completedActionBranchCount}\` / \`${report.counts.actionBranchCount}\``,
    `- 待展开动作：\`${report.counts.pendingActionExpansionWorkCount}\``,
    `- 待执行概率/回应工作：\`${report.counts.pendingChanceResponseWorkCount}\``,
    `- 搜索图节点/边：\`${report.counts.nodeCount}\` / \`${report.counts.edgeCount}\``,
    `- 当前 Host 有限激活图闭合：\`${report.currentHostFiniteActivationGraphComplete}\``,
    `- 完整连续规则域闭合：\`${report.fullRulesActivationDomainComplete}\``,
    "",
    "## 根动作",
    "",
    "| 动作 | 类型 | 目标 | 状态 | 工作 | 回应量词 | 未决参数 |",
    "|---|---|---|---|---:|---|---|",
    ...rows.map((row) =>
      `| ${row.actionKey} | ${row.actionType} | ${row.targetPieceKey || "-"} | ${row.status} | ${row.completedWorkCount}/${row.totalWorkCount} | ${row.responseQuantifier || "-"} | ${row.domainUnresolvedReasons.join("、") || "-"} |`),
    "",
    "## 未决",
    "",
    ...(report.unresolvedReasons.length
      ? report.unresolvedReasons.map((reason) => `- ${reason}`)
      : ["- 无"]),
    "",
    "## 结论边界",
    "",
    report.claimBoundary,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

const workUnitBudget = integerArgument("work-units", 1);
const sourceSnapshotPath = path.resolve(
  process.env.WARMACHINE_RAPTOR_ACTION_SOURCE_SNAPSHOT ||
    path.join(
      repositoryRoot,
      ".scratch/current-host-raptor-nymara-action-source-v1.json",
    ),
);
const closurePath = path.join(
  repositoryRoot,
  "config/warmachine-fixed-cryx-nymara-task-rule-closure-v1.json",
);
const sourceSnapshot = JSON.parse(fs.readFileSync(sourceSnapshotPath, "utf8"));
const closure = JSON.parse(fs.readFileSync(closurePath, "utf8"));
if (sourceSnapshot.hostReceiptHash !== warmachineHost.receipt.receiptHash ||
    closure.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
  throw new Error("fixed_raptor_complete_activation_host_receipt_mismatch");
}
if (stableGraphHash(sourceSnapshot.sourceState) !==
    sourceSnapshot.sourceStateHash) {
  throw new Error("fixed_raptor_complete_activation_source_state_hash_mismatch");
}
const sourceCodeHash = contentHash([
  "scripts/run-fixed-raptor-complete-activation-v1.mjs",
  "src/benchmark/fixed-steamroller-benchmark-v2.mjs",
  "src/contracts/task-local-action-rule-guard-v1.mjs",
  "src/graph/typed-facts-v2.mjs",
  "src/search/complete-activation-exact-graph-v1.mjs",
  "src/search/adversarial-chance-equivalence-v1.mjs",
  "src/search/chance-outcomes-v1.mjs",
  "src/search/current-decision-window-domain-v1.mjs",
  "src/search/matchup-search-v1.mjs",
  "src/search/opponent-response-v1.mjs",
  "src/search/post-response-chance-execution-v1.mjs",
  "src/search/strict-policy-step-v1.mjs",
  "src/storage/external-dag-v1.mjs",
  "src/warmachine-host-runtime.mjs",
]);
const sourceHash = stableGraphHash(stableGraphValue({
  schemaVersion: "warmachine_fixed_raptor_complete_activation_source_v1",
  sourceSnapshotHash: sourceSnapshot.sourceHash,
  sourceStateHash: sourceSnapshot.sourceStateHash,
  taskLocalRuleClosureHash: closure.taskLocalRuleClosureHash,
  sourceCodeHash,
}));
const configCore = stableGraphValue({
  schemaVersion: "warmachine_fixed_raptor_complete_activation_config_v1",
  taskKey: closure.taskKey,
  querySideKey: "player1",
  priorityPieceKey: sourceSnapshot.channelerPieceKey,
  exactChanceThreshold: "0",
});
const configHash = stableGraphHash(configCore);
const evidenceRoot = path.resolve(
  process.env.WARMACHINE_RAPTOR_COMPLETE_ACTIVATION_OUTPUT ||
    path.join(
      repositoryRoot,
      ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
      "raptor-complete-activation-v1",
      `${sourceHash.slice(0, 12)}-${configHash.slice(0, 12)}`,
    ),
);
const checkpointPath = path.join(evidenceRoot, "checkpoint.json");
const reportPath = path.join(evidenceRoot, "report.json");
const markdownPath = path.join(evidenceRoot, "report.md");
const store = new WarmachineExternalDagStore(
  path.join(evidenceRoot, "dag-store"),
  {
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    sourceHash,
    configHash,
  },
);
let checkpoint;
if (fs.existsSync(checkpointPath)) {
  checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  validateWarmachineCompleteActivationExactGraphCheckpointV1(checkpoint, {
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    taskLocalRuleClosureHash: closure.taskLocalRuleClosureHash,
    sourceHash,
    configHash,
  });
} else {
  checkpoint = initializeWarmachineCompleteActivationExactGraphV1(
    sourceSnapshot.sourceState,
    closure,
    store,
    {
      taskKey: closure.taskKey,
      querySideKey: "player1",
      priorityPieceKey: sourceSnapshot.channelerPieceKey,
      sourceHash,
      configHash,
    },
  );
}
const startedAtMs = Date.now();
checkpoint = advanceWarmachineCompleteActivationExactGraphV1(
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
const report = buildWarmachineCompleteActivationExactGraphReportV1(checkpoint);
writeAtomically(checkpointPath, `${JSON.stringify(checkpoint)}\n`);
writeAtomically(reportPath, `${JSON.stringify(report, null, 2)}\n`);
writeAtomically(markdownPath, markdown(report));
process.stdout.write(`${JSON.stringify({
  ok: true,
  evidenceRoot,
  checkpointPath,
  checkpointHash: checkpoint.checkpointHash,
  reportPath,
  reportHash: report.reportHash,
  rootAcceptedActionDenominator: report.rootAcceptedActionDenominator,
  rootCanonicalActionDenominator: report.rootCanonicalActionDenominator,
  counts: report.counts,
  unresolvedReasons: report.unresolvedReasons,
  searchFinished: report.searchFinished,
  currentHostFiniteActivationGraphComplete:
    report.currentHostFiniteActivationGraphComplete,
  elapsedMs: Date.now() - startedAtMs,
}, null, 2)}\n`);
