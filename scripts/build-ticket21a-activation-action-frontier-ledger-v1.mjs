#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import { buildWarmachineActivationActionFrontierLedgerV1 } from
  "../src/search/activation-action-frontier-ledger-v1.mjs";

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
const ticket22Path = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--ticket22="))?.slice("--ticket22=".length) ||
  path.join(
    evidenceRoot,
    "ticket22-nymara-local-strategy-refinement-v1.json",
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

const ticket22 = readValidatedReport(
  ticket22Path,
  "ticket21a_action_ledger_ticket22_hash_invalid",
);
const sourceActionKey = process.argv.find((argument) =>
  argument.startsWith("--source-action-key="))?.slice(
  "--source-action-key=".length,
) || ticket22.refinement.strategyClassCandidates.find((candidate) =>
  candidate.disposition === "retained_adversarial_counterexample")
  ?.actionKey || "";
const pageReports = fs.readdirSync(evidenceRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() &&
    entry.name.startsWith(
      "ticket21a-nymara-successor-action-frontier-",
    ) && entry.name.endsWith("-v1.json"))
  .map((entry) => path.join(evidenceRoot, entry.name))
  .map((reportPath) => ({
    reportPath,
    report: readValidatedReport(
      reportPath,
      "ticket21a_action_ledger_page_report_hash_invalid",
    ),
  }))
  .filter(({ report }) => report.sourceActionKey === sourceActionKey)
  .sort((left, right) =>
    Number(left.report.frontier.page.startActionIndex || 0) -
    Number(right.report.frontier.page.startActionIndex || 0));
if (!pageReports.length) {
  throw new Error("ticket21a_action_ledger_pages_missing");
}
for (const { report } of pageReports) {
  if (report.ticket22ReportHash !== ticket22.reportHash ||
      report.frontierReportHash !== ticket22.frontierEvidenceReportHash ||
      report.successorPlanReportHash !==
        ticket22.successorPlanReportHash) {
    throw new Error("ticket21a_action_ledger_page_source_mismatch");
  }
}
const ledger = buildWarmachineActivationActionFrontierLedgerV1(
  pageReports.map(({ report }) => report.frontier),
  { continuationContextKey: ticket22.refinement.bucket.bucketHash },
);
const outputPath = path.join(
  evidenceRoot,
  "ticket21a-nymara-pass-activation-action-ledger-v1.json",
);
const core = stableGraphValue({
  schemaVersion:
    "warmachine_ticket21a_activation_action_frontier_ledger_evidence_v1",
  ticket22Path: path.relative(repositoryRoot, ticket22Path),
  ticket22ReportHash: ticket22.reportHash,
  sourceActionKey,
  pagePaths: pageReports.map(({ reportPath }) =>
    path.relative(repositoryRoot, reportPath)),
  pageReportHashes: pageReports.map(({ report }) => report.reportHash),
  ledger,
  claimBoundary:
    "This evidence aggregates one contiguous first-group action denominator and its same-context rule-behavior continuation classes. It is not a complete opponent turn or strategy quotient.",
});
const report = { ...core, reportHash: stableGraphHash(core) };
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(report)}\n`);
fs.renameSync(temporaryPath, outputPath);
process.stdout.write(`${JSON.stringify({
  ok: ledger.ok,
  outputPath,
  reportHash: report.reportHash,
  acceptedActionDenominator: ledger.acceptedActionDenominator,
  executedActionCount: ledger.executedActionCount,
  unresolvedActionCount: ledger.unresolvedActionCount,
  continuationClassCount: ledger.continuationClassCount,
  sharedContinuationEdgeCount: ledger.sharedContinuationEdgeCount,
  rulesContinuationMemoizationAllowed:
    ledger.rulesContinuationMemoizationAllowed,
  strategyClassEquivalenceCertified:
    ledger.strategyClassEquivalenceCertified,
}, null, 2)}\n`);
