#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildWarmachineFixedActionHorizonReportV1 } from
  "../src/report/fixed-action-horizon-report-v1.mjs";
import { restoreWarmachineStrictFrontierExternalDagV1 } from
  "../src/storage/strict-frontier-external-dag-v1.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const externalDagRoot = path.resolve(
  process.env.WARMACHINE_ASSASSINATION_EXTERNAL_DAG_ROOT ||
    path.join(projectRoot, ".scratch/current-host-sepsira-nymara-assassination-v2"),
);
const routeCachePath = path.resolve(
  process.env.WARMACHINE_ASSASSINATION_ROUTE_CACHE ||
    path.join(projectRoot,
      ".scratch/fixed-steamroller-assassination-probability-checkpoint-center_break-v2.json"),
);
const outputDirectory = path.resolve(
  process.env.WARMACHINE_ASSASSINATION_REPORT_OUTPUT ||
    path.join(projectRoot, "build/reports"),
);

const store = JSON.parse(fs.readFileSync(path.join(externalDagRoot, "STORE.json"), "utf8"));
const restored = restoreWarmachineStrictFrontierExternalDagV1(externalDagRoot, {
  ...store,
  lazyRuntimePayloads: true,
  maximumEagerFrontierStates: 0,
});
if (!restored.ok) throw new Error("fixed_action_horizon_checkpoint_restore_failed");
const cached = JSON.parse(fs.readFileSync(routeCachePath, "utf8"));
const route = cached.route || {};
const report = buildWarmachineFixedActionHorizonReportV1({
  probabilityReport: restored.report,
  route,
  casterPieceKey: "player1_master_necrosurgeon_sepsira_1_1",
  targetPieceKey: "player2_nymara_the_shadowblade_1_1",
  source: {
    hostReceiptHash: store.hostReceiptHash,
    sourceHash: store.sourceHash,
    configHash: store.configHash,
    checkpointId: restored.checkpointId,
    probabilityReportHash: restored.reportHash,
    runtimeCheckpointHash: restored.runtimeCheckpointHash,
  },
});

fs.mkdirSync(outputDirectory, { recursive: true });
const jsonPath = path.join(outputDirectory, "fixed-sepsira-nymara-action-horizon-v1.json");
const markdownPath = path.join(outputDirectory, "fixed-sepsira-nymara-action-horizon-v1.md");
const { markdown, ...jsonReport } = report;
fs.writeFileSync(jsonPath, `${JSON.stringify(jsonReport, null, 2)}\n`, "utf8");
fs.writeFileSync(markdownPath, markdown, "utf8");
process.stdout.write(`${JSON.stringify({
  ok: true,
  reportHash: report.reportHash,
  jsonPath,
  markdownPath,
  actionHorizonValue: report.actionHorizonValue,
  postActionContinuationInterval: report.postActionContinuationInterval,
  counts: report.counts,
}, null, 2)}\n`);
