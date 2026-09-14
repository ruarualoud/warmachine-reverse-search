#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import { buildWarmachineCompleteActivationDomainPlanV2 } from
  "../src/search/complete-activation-domain-v2.mjs";
import { buildWarmachineContinuationPlanWorklistV1 } from
  "../src/search/continuation-plan-worklist-v1.mjs";
import { warmachineRuleBehaviorStateHashV1 } from
  "../src/state/semantic-hash-v1.mjs";
import { WarmachineExternalDagStore } from
  "../src/storage/external-dag-v1.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const evidenceRoot = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--evidence-root="))?.slice("--evidence-root=".length) ||
  path.join(
    repositoryRoot,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
  ));

function readValidatedReport(reportPath, invalidReason) {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const core = { ...report };
  delete core.reportHash;
  if (stableGraphHash(core) !== report.reportHash) {
    throw new Error(invalidReason);
  }
  return report;
}

const ledgerPath = path.join(
  evidenceRoot,
  "ticket21a-nymara-pass-activation-action-ledger-v1.json",
);
const outputPath = path.join(
  evidenceRoot,
  "ticket21a-nymara-pass-continuation-plan-worklist-v1.json",
);
const checkpointClassCount = 20;
const ledgerReport = readValidatedReport(
  ledgerPath,
  "ticket21a_continuation_worklist_ledger_report_invalid",
);
const frontierPath = path.resolve(
  repositoryRoot,
  ledgerReport.pagePaths.length
    ? readValidatedReport(
      path.resolve(repositoryRoot, ledgerReport.pagePaths[0]),
      "ticket21a_continuation_worklist_page_report_invalid",
    ).frontierPath
    : "",
);
const frontierReport = readValidatedReport(
  frontierPath,
  "ticket21a_continuation_worklist_frontier_report_invalid",
);
const checkpointDirectory = path.join(
  evidenceRoot,
  "ticket21a-continuation-plan-worklist-checkpoints-v1",
  ledgerReport.reportHash,
);

function writeAtomically(outputFilePath, value) {
  fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
  const temporaryPath = `${outputFilePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value)}\n`);
  fs.renameSync(temporaryPath, outputFilePath);
}

function checkpointPath(startClassIndex, endClassIndexExclusive) {
  return path.join(
    checkpointDirectory,
    `classes-${String(startClassIndex).padStart(4, "0")}-${
      String(endClassIndexExclusive).padStart(4, "0")}.json`,
  );
}

function checkpointReport(planRows, startClassIndex, endClassIndexExclusive) {
  const core = stableGraphValue({
    schemaVersion:
      "warmachine_ticket21a_continuation_plan_worklist_checkpoint_v1",
    ledgerPath: path.relative(repositoryRoot, ledgerPath),
    ledgerReportHash: ledgerReport.reportHash,
    sourceLedgerReceiptHash:
      ledgerReport.ledger.activationActionFrontierLedgerReceiptHash,
    frontierReportHash: frontierReport.reportHash,
    hostReceiptHash: ledgerReport.ledger.hostReceiptHash,
    startClassIndex,
    endClassIndexExclusive,
    planRows,
    claimBoundary:
      "This immutable shard only resumes exact continuation-plan construction for the bound ledger and Host. Every restored plan is rebuilt and hash-checked before later action materialization; the shard is not action, response, Chance or value evidence.",
  });
  return { ...core, reportHash: stableGraphHash(core) };
}

function writeCheckpoint(planRows, startClassIndex, endClassIndexExclusive) {
  const report = checkpointReport(
    planRows,
    startClassIndex,
    endClassIndexExclusive,
  );
  const outputFilePath = checkpointPath(
    startClassIndex,
    endClassIndexExclusive,
  );
  if (fs.existsSync(outputFilePath)) {
    const existing = readValidatedReport(
      outputFilePath,
      "ticket21a_continuation_worklist_checkpoint_invalid",
    );
    if (existing.reportHash !== report.reportHash) {
      throw new Error("ticket21a_continuation_worklist_checkpoint_drift");
    }
    return existing;
  }
  writeAtomically(outputFilePath, report);
  return report;
}

function writeAllCheckpoints(planRows) {
  const reports = [];
  for (let startClassIndex = 0;
    startClassIndex < planRows.length;
    startClassIndex += checkpointClassCount) {
    const endClassIndexExclusive = Math.min(
      planRows.length,
      startClassIndex + checkpointClassCount,
    );
    reports.push(writeCheckpoint(
      planRows.slice(startClassIndex, endClassIndexExclusive),
      startClassIndex,
      endClassIndexExclusive,
    ));
  }
  return reports;
}

function validateCheckpointRow(row, continuationClass, rowIndex) {
  if (!continuationClass ||
      row.continuationClassKey !== continuationClass.classKey ||
      row.sourceClassReceiptHash !== continuationClass.classReceiptHash ||
      row.representativeStateId !== continuationClass.representativeStateId ||
      row.successorStateHash !== continuationClass.successorStateHash ||
      row.stateRecoverable !== true ||
      !row.activationDomainPlanHash) {
    throw new Error(
      `ticket21a_continuation_worklist_checkpoint_row_invalid:${rowIndex}`,
    );
  }
}

function loadCheckpointPlanRows() {
  if (!fs.existsSync(checkpointDirectory)) return [];
  const reports = fs.readdirSync(checkpointDirectory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readValidatedReport(
      path.join(checkpointDirectory, name),
      "ticket21a_continuation_worklist_checkpoint_invalid",
    ))
    .sort((left, right) => left.startClassIndex - right.startClassIndex);
  const planRows = [];
  for (const report of reports) {
    if (report.schemaVersion !==
          "warmachine_ticket21a_continuation_plan_worklist_checkpoint_v1" ||
        report.ledgerReportHash !== ledgerReport.reportHash ||
        report.sourceLedgerReceiptHash !==
          ledgerReport.ledger.activationActionFrontierLedgerReceiptHash ||
        report.frontierReportHash !== frontierReport.reportHash ||
        report.hostReceiptHash !== ledgerReport.ledger.hostReceiptHash ||
        report.startClassIndex !== planRows.length ||
        report.endClassIndexExclusive !==
          report.startClassIndex + report.planRows.length) {
      throw new Error("ticket21a_continuation_worklist_checkpoint_scope_drift");
    }
    for (const [offset, row] of report.planRows.entries()) {
      const rowIndex = report.startClassIndex + offset;
      validateCheckpointRow(
        row,
        ledgerReport.ledger.continuationClasses[rowIndex],
        rowIndex,
      );
      planRows.push(row);
    }
  }
  return planRows;
}

if (fs.existsSync(outputPath)) {
  const existingReport = readValidatedReport(
    outputPath,
    "ticket21a_continuation_worklist_existing_report_invalid",
  );
  const rebuiltWorklist = buildWarmachineContinuationPlanWorklistV1(
    ledgerReport.ledger,
    existingReport.worklist?.planRows,
  );
  if (existingReport.ledgerReportHash !== ledgerReport.reportHash ||
      existingReport.frontierReportHash !== frontierReport.reportHash ||
      rebuiltWorklist.continuationPlanWorklistReceiptHash !==
        existingReport.worklist?.continuationPlanWorklistReceiptHash) {
    throw new Error("ticket21a_continuation_worklist_existing_report_drift");
  }
  const checkpoints = writeAllCheckpoints(existingReport.worklist.planRows);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    resumedFromCompleteReport: true,
    outputPath,
    reportHash: existingReport.reportHash,
    continuationClassCount: existingReport.worklist.continuationClassCount,
    planRowCount: existingReport.worklist.planRowCount,
    totalSlotCount: existingReport.worklist.totalSlotCount,
    planShapeCount: existingReport.worklist.planShapeCount,
    checkpointCount: checkpoints.length,
  }, null, 2)}\n`);
  process.exit(0);
}

const store = new WarmachineExternalDagStore(
  path.resolve(repositoryRoot, frontierReport.frontierStorePath),
  {
    hostReceiptHash:
      frontierReport.adversarialFrontier.currentHostReceiptHash,
    sourceHash: frontierReport.counterexampleReceiptHash,
    configHash: frontierReport.frontierConfigHash,
    create: false,
  },
);
const startedAtMs = Date.now();
const planRows = loadCheckpointPlanRows();
let checkpointStartClassIndex = planRows.length;
for (let index = planRows.length;
  index < ledgerReport.ledger.continuationClasses.length;
  index += 1) {
  const continuationClass = ledgerReport.ledger.continuationClasses[index];
  const stateRecord = store.readState(
    continuationClass.representativeStateId,
  );
  const successorStateHash = warmachineRuleBehaviorStateHashV1(
    stateRecord.value,
  );
  if (successorStateHash !== continuationClass.successorStateHash) {
    throw new Error(
      "ticket21a_continuation_worklist_state_hash_mismatch",
    );
  }
  const plan = buildWarmachineCompleteActivationDomainPlanV2(
    stateRecord.value,
  );
  const planShapeCore = stableGraphValue({
    phaseKey: plan.phaseKey,
    activeSideKey: plan.activeSideKey,
    mode: plan.lazyPlan.mode,
    groups: plan.lazyPlan.groups,
    actionFamilyKeys: plan.actionFamilyKeys,
  });
  planRows.push(stableGraphValue({
    continuationClassKey: continuationClass.classKey,
    sourceClassReceiptHash: continuationClass.classReceiptHash,
    representativeStateId: continuationClass.representativeStateId,
    successorStateHash,
    memberCount: continuationClass.memberCount,
    sourceActionType: continuationClass.actionType,
    sourceActivationCompleted:
      continuationClass.eventTypes.includes("activation_complete"),
    stateRecoverable: true,
    activationDomainPlanHash: plan.activationDomainPlanHash,
    planShapeHash: stableGraphHash(planShapeCore),
    phaseKey: plan.phaseKey,
    activeSideKey: plan.activeSideKey,
    planMode: plan.lazyPlan.mode,
    activationGroupCount: plan.activationGroupCount,
    actionFamilyCount: plan.actionFamilyCount,
    slotCount: plan.slotCount,
    discreteSlotPlanComplete: plan.discreteSlotPlanComplete,
    continuousDomainPlanComplete: plan.continuousDomainPlanComplete,
    resumeCursor: {
      activationDomainPlanHash: plan.activationDomainPlanHash,
      nextSlotIndex: 0,
      exhausted: plan.slotCount === 0,
    },
  }));
  if (planRows.length - checkpointStartClassIndex >= checkpointClassCount ||
      index + 1 === ledgerReport.ledger.continuationClasses.length) {
    writeCheckpoint(
      planRows.slice(checkpointStartClassIndex, index + 1),
      checkpointStartClassIndex,
      index + 1,
    );
    checkpointStartClassIndex = index + 1;
  }
  if ((index + 1) % 20 === 0 ||
      index + 1 === ledgerReport.ledger.continuationClasses.length) {
    process.stderr.write(`${JSON.stringify({
      stage: "continuation_plan_created",
      completedClassCount: index + 1,
      totalClassCount: ledgerReport.ledger.continuationClasses.length,
      elapsedSeconds: Math.round((Date.now() - startedAtMs) / 1000),
    })}\n`);
  }
}
const worklist = buildWarmachineContinuationPlanWorklistV1(
  ledgerReport.ledger,
  planRows,
);
const core = stableGraphValue({
  schemaVersion:
    "warmachine_ticket21a_continuation_plan_worklist_evidence_v1",
  ledgerPath: path.relative(repositoryRoot, ledgerPath),
  ledgerReportHash: ledgerReport.reportHash,
  frontierPath: path.relative(repositoryRoot, frontierPath),
  frontierReportHash: frontierReport.reportHash,
  elapsedMs: Date.now() - startedAtMs,
  worklist,
  claimBoundary:
    "This evidence prepares resumable discrete plan cursors for every retained continuation class. It performs no action expansion or strategy pruning.",
});
const report = { ...core, reportHash: stableGraphHash(core) };
writeAtomically(outputPath, report);
process.stdout.write(`${JSON.stringify({
  ok: worklist.ok,
  outputPath,
  reportHash: report.reportHash,
  continuationClassCount: worklist.continuationClassCount,
  planRowCount: worklist.planRowCount,
  totalSlotCount: worklist.totalSlotCount,
  planShapeCount: worklist.planShapeCount,
  checkpointCount: writeAllCheckpoints(planRows).length,
  elapsedMs: core.elapsedMs,
}, null, 2)}\n`);
