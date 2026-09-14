#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import { buildWarmachineKnownRouteContinuationRefinementV1 } from
  "../src/search/known-route-continuation-refinement-v1.mjs";

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

const ticket22Path = path.join(
  evidenceRoot,
  "ticket22-nymara-local-strategy-refinement-v1.json",
);
const ledgerPath = path.join(
  evidenceRoot,
  "ticket21a-nymara-pass-activation-action-ledger-v1.json",
);
const worklistPath = path.join(
  evidenceRoot,
  "ticket21a-nymara-pass-continuation-plan-worklist-v1.json",
);
const slotLedgerPath = path.join(
  evidenceRoot,
  "ticket21a-nymara-pass-continuation-slot-ledger-v1.json",
);
const actionLedgerPath = path.join(
  evidenceRoot,
  "ticket21a-nymara-pass-continuation-action-ledger-v1.json",
);
const ticket22 = readValidatedReport(
  ticket22Path,
  "ticket22_continuation_base_report_invalid",
);
const ledgerReport = readValidatedReport(
  ledgerPath,
  "ticket22_continuation_ledger_report_invalid",
);
const worklistReport = readValidatedReport(
  worklistPath,
  "ticket22_continuation_worklist_report_invalid",
);
const slotLedgerReport = readValidatedReport(
  slotLedgerPath,
  "ticket22_continuation_slot_ledger_report_invalid",
);
const actionLedgerReport = readValidatedReport(
  actionLedgerPath,
  "ticket22_continuation_action_ledger_report_invalid",
);
if (ledgerReport.ticket22ReportHash !== ticket22.reportHash) {
  throw new Error("ticket22_continuation_ledger_base_mismatch");
}
if (worklistReport.ledgerReportHash !== ledgerReport.reportHash) {
  throw new Error("ticket22_continuation_worklist_ledger_mismatch");
}
if (slotLedgerReport.worklistReportHash !== worklistReport.reportHash ||
    slotLedgerReport.ledger.sourceWorklistReceiptHash !==
      worklistReport.worklist.continuationPlanWorklistReceiptHash) {
  throw new Error("ticket22_continuation_slot_ledger_worklist_mismatch");
}
if (actionLedgerReport.worklistReportHash !== worklistReport.reportHash ||
    actionLedgerReport.slotLedgerReportHash !== slotLedgerReport.reportHash ||
    actionLedgerReport.actionExecutionLedger
      .sourceSlotMaterializationLedgerReceiptHash !==
        slotLedgerReport.ledger
          .continuationSlotMaterializationLedgerReceiptHash) {
  throw new Error("ticket22_continuation_action_ledger_slot_mismatch");
}
const successorPlanPath = path.resolve(
  repositoryRoot,
  ticket22.successorPlanPath,
);
const successorPlanReport = readValidatedReport(
  successorPlanPath,
  "ticket22_continuation_successor_plan_report_invalid",
);
if (successorPlanReport.reportHash !== ticket22.successorPlanReportHash) {
  throw new Error("ticket22_continuation_successor_plan_binding_mismatch");
}
const sourcePlan = successorPlanReport.successorPlans.find((plan) =>
  plan.sourceActionKey === ledgerReport.sourceActionKey);
if (!sourcePlan) {
  throw new Error("ticket22_continuation_source_plan_missing");
}
const refinement = buildWarmachineKnownRouteContinuationRefinementV1(
  ticket22.refinement,
  [{
    sourceActionKey: ledgerReport.sourceActionKey,
    materializedAcceptedActionCount:
      sourcePlan.firstGroupPage.acceptedActionCount,
    ledger: ledgerReport.ledger,
  }],
  [{
    sourceActionKey: ledgerReport.sourceActionKey,
    worklist: worklistReport.worklist,
  }],
  [{
    sourceActionKey: ledgerReport.sourceActionKey,
    ledger: slotLedgerReport.ledger,
  }],
  [{
    sourceActionKey: ledgerReport.sourceActionKey,
    ledger: actionLedgerReport.actionExecutionLedger,
  }],
);
const outputPath = path.join(
  evidenceRoot,
  "ticket22-nymara-continuation-refinement-v1.json",
);
const core = stableGraphValue({
  schemaVersion:
    "warmachine_ticket22_continuation_refinement_evidence_v1",
  ticket22Path: path.relative(repositoryRoot, ticket22Path),
  ticket22ReportHash: ticket22.reportHash,
  ledgerPath: path.relative(repositoryRoot, ledgerPath),
  ledgerReportHash: ledgerReport.reportHash,
  worklistPath: path.relative(repositoryRoot, worklistPath),
  worklistReportHash: worklistReport.reportHash,
  slotLedgerPath: path.relative(repositoryRoot, slotLedgerPath),
  slotLedgerReportHash: slotLedgerReport.reportHash,
  actionLedgerPath: path.relative(repositoryRoot, actionLedgerPath),
  actionLedgerReportHash: actionLedgerReport.reportHash,
  successorPlanReportHash: successorPlanReport.reportHash,
  refinement,
  claimBoundary:
    "This artifact extends one local Ticket 22 receipt with strict continuation accounting. The base receipt remains immutable; whole-game strategy value and publication stay open.",
});
const report = { ...core, reportHash: stableGraphHash(core) };
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(report)}\n`);
fs.renameSync(temporaryPath, outputPath);
process.stdout.write(`${JSON.stringify({
  ok: refinement.ok,
  outputPath,
  reportHash: report.reportHash,
  continuationRefinementReceiptHash:
    refinement.continuationRefinementReceiptHash,
  continuationAccounting: refinement.continuationAccounting,
  nextLevelPlanAccounting: refinement.nextLevelPlanAccounting,
  nextLevelSlotMaterializationAccounting:
    refinement.nextLevelSlotMaterializationAccounting,
  nextLevelActionExecutionAccounting:
    refinement.nextLevelActionExecutionAccounting,
  wholeGameValue: refinement.wholeGameValue,
  effectiveStrategyQuotientComplete:
    refinement.effectiveStrategyQuotientComplete,
}, null, 2)}\n`);
