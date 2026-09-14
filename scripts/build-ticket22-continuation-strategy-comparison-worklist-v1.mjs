#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import {
  buildWarmachineContinuationStrategyComparisonWorklistV1,
} from "../src/search/continuation-strategy-comparison-worklist-v1.mjs";

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

function readReport(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const core = { ...report };
  delete core.reportHash;
  if (!report.reportHash || stableGraphHash(core) !== report.reportHash) {
    throw new Error("ticket22_strategy_comparison_source_report_invalid");
  }
  return report;
}

function writeAtomically(outputPath, value) {
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value)}\n`);
  fs.renameSync(temporaryPath, outputPath);
}

const basePath = path.join(
  evidenceRoot,
  "ticket22-nymara-local-strategy-refinement-v1.json",
);
const continuationPath = path.join(
  evidenceRoot,
  "ticket22-nymara-continuation-refinement-v1.json",
);
const planWorklistPath = path.join(
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
const baseRefinementReport = readReport(basePath);
const continuationRefinementReport = readReport(continuationPath);
const planWorklistReport = readReport(planWorklistPath);
const slotLedgerReport = readReport(slotLedgerPath);
const actionLedgerReport = readReport(actionLedgerPath);
const actionPageDirectory = path.resolve(
  repositoryRoot,
  actionLedgerReport.actionPageDirectory,
);
const actionPageReports = fs.readdirSync(actionPageDirectory)
  .filter((name) => name.endsWith(".json"))
  .map((name) => readReport(path.join(actionPageDirectory, name)));
const worklist =
  buildWarmachineContinuationStrategyComparisonWorklistV1({
    baseRefinementReport,
    continuationRefinementReport,
    planWorklistReport,
    slotLedgerReport,
    actionLedgerReport,
    actionPageReports,
  });
const outputPath = path.join(
  evidenceRoot,
  "ticket22-nymara-continuation-strategy-comparison-worklist-v1.json",
);
const core = stableGraphValue({
  schemaVersion:
    "warmachine_ticket22_continuation_strategy_comparison_evidence_v1",
  basePath: path.relative(repositoryRoot, basePath),
  baseReportHash: baseRefinementReport.reportHash,
  continuationPath: path.relative(repositoryRoot, continuationPath),
  continuationReportHash: continuationRefinementReport.reportHash,
  planWorklistPath: path.relative(repositoryRoot, planWorklistPath),
  planWorklistReportHash: planWorklistReport.reportHash,
  slotLedgerPath: path.relative(repositoryRoot, slotLedgerPath),
  slotLedgerReportHash: slotLedgerReport.reportHash,
  actionLedgerPath: path.relative(repositoryRoot, actionLedgerPath),
  actionLedgerReportHash: actionLedgerReport.reportHash,
  actionPageDirectory: path.relative(repositoryRoot, actionPageDirectory),
  actionPageReportCount: actionPageReports.length,
  worklist,
  claimBoundary:
    "This mutable evidence report binds one immutable comparison-worklist receipt to its source reports and action-page directory. It schedules proof challenges only and does not certify equivalence, dominance, pruning or strategy value.",
});
const report = { ...core, reportHash: stableGraphHash(core) };
writeAtomically(outputPath, report);
process.stdout.write(`${JSON.stringify({
  ok: worklist.ok,
  outputPath,
  reportHash: report.reportHash,
  comparisonWorklistReceiptHash:
    worklist.continuationStrategyComparisonWorklistReceiptHash,
  classCount: worklist.classCount,
  exactObservedTransitionClassCount:
    worklist.exactObservedTransitionClassCount,
  candidateGroupCount: worklist.candidateGroupCount,
  candidateGroupSizes: worklist.candidateGroupRows.map((row) =>
    row.memberCount).sort((left, right) => right - left),
  allPairwiseCandidateCount: worklist.allPairwiseCandidateCount,
  initialComparisonTaskCount: worklist.initialComparisonTaskCount,
  hardMergeCount: worklist.hardMergeCount,
  remainingSlotCount: worklist.remainingSlotCount,
  effectiveStrategyQuotientComplete:
    worklist.effectiveStrategyQuotientComplete,
}, null, 2)}\n`);
