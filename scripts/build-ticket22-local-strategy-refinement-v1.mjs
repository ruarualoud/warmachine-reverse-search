#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import { buildWarmachineKnownRouteStrategyRefinementV1 } from
  "../src/search/known-route-strategy-refinement-v1.mjs";

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
const sourcePath = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--source="))?.slice("--source=".length) ||
  path.join(
    evidenceRoot,
    "ticket21a-nymara-known-route-counterexample-v1.json",
  ));
const outputPath = path.join(
  evidenceRoot,
  "ticket22-nymara-local-strategy-refinement-v1.json",
);
const successorPlanPath = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--successor-plans="))?.slice(
  "--successor-plans=".length,
) || path.join(
  evidenceRoot,
  "ticket21a-nymara-successor-activation-plans-v1.json",
));

function readValidatedReport(reportPath, invalidReason) {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const reportCore = { ...report };
  delete reportCore.reportHash;
  if (stableGraphHash(reportCore) !== report.reportHash) {
    throw new Error(invalidReason);
  }
  return report;
}

const source = readValidatedReport(
  sourcePath,
  "ticket22_source_report_hash_invalid",
);
const frontierEvidencePath = path.resolve(
  repositoryRoot,
  String(source.adversarialFrontierEvidence?.outputPath || ""),
);
const frontierEvidence = readValidatedReport(
  frontierEvidencePath,
  "ticket22_frontier_report_hash_invalid",
);
if (frontierEvidence.reportHash !==
      source.adversarialFrontierEvidence?.reportHash ||
    frontierEvidence.counterexampleReceiptHash !==
      source.counterexample.counterexampleReceiptHash ||
    frontierEvidence.localValueReceiptHash !==
      source.localValue.localValueReceiptHash ||
    frontierEvidence.adversarialFrontier
      ?.adversarialFrontierReceiptHash !==
      source.adversarialFrontierEvidence
        ?.adversarialFrontierReceiptHash) {
  throw new Error("ticket22_frontier_source_binding_mismatch");
}
const successorActivationPlans = readValidatedReport(
  successorPlanPath,
  "ticket22_successor_plan_report_hash_invalid",
);
if (successorActivationPlans.sourceReportHash !==
    frontierEvidence.reportHash) {
  throw new Error("ticket22_successor_plan_frontier_binding_mismatch");
}
const refinement = buildWarmachineKnownRouteStrategyRefinementV1(
  source.counterexample,
  source.localValue,
  {
    adversarialFrontier: frontierEvidence.adversarialFrontier,
    adversarialFrontierReportHash: frontierEvidence.reportHash,
    successorActivationPlans,
  },
);
const core = stableGraphValue({
  schemaVersion: "warmachine_ticket22_local_strategy_refinement_evidence_v1",
  sourcePath: path.relative(repositoryRoot, sourcePath),
  sourceReportHash: source.reportHash,
  frontierEvidencePath:
    path.relative(repositoryRoot, frontierEvidencePath),
  frontierEvidenceReportHash: frontierEvidence.reportHash,
  successorPlanPath:
    path.relative(repositoryRoot, successorPlanPath),
  successorPlanReportHash: successorActivationPlans.reportHash,
  refinement,
  claimBoundary:
    "This artifact closes the bound current Host window at one ply and schedules the persisted successor activation domains. Only the same fixed script may stop numeric expansion; it is not a complete opponent turn, strategy quotient or whole-game value certificate.",
});
const report = { ...core, reportHash: stableGraphHash(core) };
fs.mkdirSync(evidenceRoot, { recursive: true });
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(report)}\n`);
fs.renameSync(temporaryPath, outputPath);
process.stdout.write(`${JSON.stringify({
  ok: refinement.ok,
  outputPath,
  reportHash: report.reportHash,
  strategyRefinementReceiptHash:
    refinement.strategyRefinementReceiptHash,
  hostDecisionWindowAccounting: refinement.hostDecisionWindowAccounting,
  fixedRouteScriptRefinement: refinement.fixedRouteScriptRefinement,
  wholeGameValue: refinement.wholeGameValue,
  evidenceClosure: refinement.evidenceClosure,
  successorContinuationScheduling:
    refinement.successorContinuationScheduling,
  forwardComplementChallengeCount:
    refinement.forwardComplementChallengeCount,
  effectiveStrategyQuotientComplete:
    refinement.effectiveStrategyQuotientComplete,
}, null, 2)}\n`);
