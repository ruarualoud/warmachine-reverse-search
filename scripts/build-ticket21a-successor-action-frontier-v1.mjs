#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import { buildWarmachineActivationActionFrontierV1 } from
  "../src/search/activation-action-frontier-v1.mjs";
import {
  buildWarmachineCompleteActivationDomainPlanV2,
  enumerateNextWarmachineCompleteActivationDomainPageV2,
} from "../src/search/complete-activation-domain-v2.mjs";
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
const ticket22Path = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--ticket22="))?.slice("--ticket22=".length) ||
  path.join(
    evidenceRoot,
    "ticket22-nymara-local-strategy-refinement-v1.json",
  ));

function argumentValue(prefix, fallback = "") {
  return process.argv.find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length) || fallback;
}

function readValidatedReport(reportPath, invalidReason) {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const core = { ...report };
  delete core.reportHash;
  if (stableGraphHash(core) !== report.reportHash) {
    throw new Error(invalidReason);
  }
  return report;
}

function validateFrontierReceipt(frontier = {}) {
  const receiptHash = String(
    frontier.activationActionFrontierReceiptHash || "",
  );
  const core = { ...frontier };
  delete core.activationActionFrontierReceiptHash;
  delete core.ok;
  if (!receiptHash || stableGraphHash(core) !== receiptHash) {
    throw new Error("ticket21a_action_frontier_receipt_invalid");
  }
}

function discoverContiguousPages(sourceActionKey, sourcePlanHash) {
  const prefix = "ticket21a-nymara-successor-action-frontier-";
  const candidates = fs.readdirSync(evidenceRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) &&
      entry.name.endsWith("-v1.json"))
    .map((entry) => path.join(evidenceRoot, entry.name));
  const pages = [];
  for (const candidatePath of candidates) {
    const report = readValidatedReport(
      candidatePath,
      "ticket21a_action_frontier_prior_report_hash_invalid",
    );
    if (report.schemaVersion !==
        "warmachine_ticket21a_successor_action_frontier_evidence_v1" ||
        report.sourceActionKey !== sourceActionKey ||
        report.sourcePlanHash !== sourcePlanHash) {
      continue;
    }
    validateFrontierReceipt(report.frontier);
    if (report.ticket22ReportHash !== ticket22.reportHash ||
        report.frontierReportHash !== frontierReport.reportHash ||
        report.successorPlanReportHash !== successorPlanReport.reportHash) {
      throw new Error("ticket21a_action_frontier_prior_source_drift");
    }
    pages.push({ candidatePath, report });
  }
  pages.sort((left, right) =>
    Number(left.report.frontier.page.startActionIndex || 0) -
    Number(right.report.frontier.page.startActionIndex || 0));
  let nextActionIndex = 0;
  let acceptedActionDenominator = null;
  const reportHashes = [];
  for (const page of pages) {
    const frontier = page.report.frontier;
    if (Number(frontier.page.startActionIndex) !== nextActionIndex) {
      throw new Error("ticket21a_action_frontier_prior_page_gap_or_overlap");
    }
    if (acceptedActionDenominator === null) {
      acceptedActionDenominator = Number(frontier.acceptedActionDenominator);
    } else if (Number(frontier.acceptedActionDenominator) !==
        acceptedActionDenominator) {
      throw new Error("ticket21a_action_frontier_prior_denominator_drift");
    }
    nextActionIndex = Number(frontier.page.endActionIndexExclusive);
    reportHashes.push(page.report.reportHash);
  }
  return { nextActionIndex, acceptedActionDenominator, reportHashes };
}

const ticket22 = readValidatedReport(
  ticket22Path,
  "ticket21a_action_frontier_ticket22_hash_invalid",
);
const frontierPath = path.resolve(
  repositoryRoot,
  ticket22.frontierEvidencePath,
);
const successorPlanPath = path.resolve(
  repositoryRoot,
  ticket22.successorPlanPath,
);
const frontierReport = readValidatedReport(
  frontierPath,
  "ticket21a_action_frontier_frontier_hash_invalid",
);
const successorPlanReport = readValidatedReport(
  successorPlanPath,
  "ticket21a_action_frontier_successor_plan_hash_invalid",
);
if (ticket22.frontierEvidenceReportHash !== frontierReport.reportHash ||
    ticket22.successorPlanReportHash !== successorPlanReport.reportHash ||
    successorPlanReport.sourceReportHash !== frontierReport.reportHash) {
  throw new Error("ticket21a_action_frontier_source_binding_mismatch");
}

const defaultSourceActionKey = ticket22.refinement.strategyClassCandidates
  .find((candidate) =>
    candidate.disposition === "retained_adversarial_counterexample")
  ?.actionKey || "";
const sourceActionKey = argumentValue(
  "--source-action-key=",
  defaultSourceActionKey,
);
const sourcePlan = successorPlanReport.successorPlans.find((plan) =>
  plan.sourceActionKey === sourceActionKey);
const sourceEdge = frontierReport.adversarialFrontier.edges.find((edge) =>
  edge.actionKey === sourceActionKey);
if (!sourcePlan || !sourceEdge ||
    sourcePlan.successorStateId !== sourceEdge.successorStoredState?.stateId) {
  throw new Error("ticket21a_action_frontier_source_action_missing");
}
const priorPages = discoverContiguousPages(
  sourceActionKey,
  sourcePlan.activationDomainPlanHash,
);

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
const stateRecord = store.readState(sourcePlan.successorStateId);
const planOptions = {
  priorityActorPieceKeys: [sourceEdge.actorPieceKey].filter(Boolean),
};
const activationPlan = buildWarmachineCompleteActivationDomainPlanV2(
  stateRecord.value,
  planOptions,
);
if (activationPlan.activationDomainPlanHash !==
    sourcePlan.activationDomainPlanHash) {
  throw new Error("ticket21a_action_frontier_activation_plan_drift");
}
const trustedEnumerationsByGroupIndex = new Map();
const activationPage = enumerateNextWarmachineCompleteActivationDomainPageV2(
  stateRecord.value,
  {},
  {
    ...planOptions,
    pageLimit: Math.min(6, Math.max(1, activationPlan.slotCount)),
    onRuntimeGroupEnumeration: ({ groupIndex, enumeration }) => {
      trustedEnumerationsByGroupIndex.set(groupIndex, enumeration);
    },
  },
);
if (activationPage.pageReceiptHash !==
    sourcePlan.firstGroupPage.pageReceiptHash) {
  throw new Error("ticket21a_action_frontier_activation_page_drift");
}

const limit = Number(argumentValue("--limit=", "8"));
const explicitNextActionIndexArgument = process.argv.find((argument) =>
  argument.startsWith("--next-action-index="));
const nextActionIndex = explicitNextActionIndexArgument
  ? Number(explicitNextActionIndexArgument.slice(
    "--next-action-index=".length,
  ))
  : priorPages.nextActionIndex;
if (nextActionIndex !== priorPages.nextActionIndex) {
  throw new Error("ticket21a_action_frontier_resume_cursor_mismatch");
}
const startedAtMs = Date.now();
const frontier = buildWarmachineActivationActionFrontierV1(
  stateRecord.value,
  activationPage,
  {
    querySideKey: successorPlanReport.querySideKey,
    taskKey: "ticket21a-nymara-successor-action-frontier-v1",
    sourceStateId: sourcePlan.successorStateId,
    expectedStateHash: activationPlan.stateHash,
    cursor: {
      activationDomainPlanHash: activationPlan.activationDomainPlanHash,
      pageReceiptHash: activationPage.pageReceiptHash,
      nextActionIndex,
    },
    limit,
    trustedEnumerationsByGroupIndex,
    persistState: (state) => store.putState(state),
    onProgress: (progress) => process.stderr.write(`${JSON.stringify({
      elapsedSeconds: Math.round((Date.now() - startedAtMs) / 1000),
      sourceActionKey,
      ...progress,
    })}\n`),
  },
);
const outputPath = path.resolve(argumentValue(
  "--output=",
  path.join(
    evidenceRoot,
    `ticket21a-nymara-successor-action-frontier-${stableGraphHash({
      sourceActionKey,
    }).slice(0, 12)}-${String(nextActionIndex).padStart(4, "0")}-v1.json`,
  ),
));
const core = stableGraphValue({
  schemaVersion:
    "warmachine_ticket21a_successor_action_frontier_evidence_v1",
  ticket22Path: path.relative(repositoryRoot, ticket22Path),
  ticket22ReportHash: ticket22.reportHash,
  frontierPath: path.relative(repositoryRoot, frontierPath),
  frontierReportHash: frontierReport.reportHash,
  successorPlanPath: path.relative(repositoryRoot, successorPlanPath),
  successorPlanReportHash: successorPlanReport.reportHash,
  sourceActionKey,
  sourcePlanHash: sourcePlan.activationDomainPlanHash,
  priorPageReportHashes: priorPages.reportHashes,
  resumeStartActionIndex: nextActionIndex,
  elapsedMs: Date.now() - startedAtMs,
  frontier,
  claimBoundary:
    "This artifact expands one stable action page from one persisted successor. It does not close the remaining actions, slots, responses, Chance, adaptive policy or complete opponent turn.",
});
const report = { ...core, reportHash: stableGraphHash(core) };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(report)}\n`);
fs.renameSync(temporaryPath, outputPath);
process.stdout.write(`${JSON.stringify({
  ok: frontier.ok,
  outputPath,
  reportHash: report.reportHash,
  sourceActionKey,
  quantifier: frontier.quantifier,
  acceptedActionDenominator: frontier.acceptedActionDenominator,
  page: frontier.page,
  transitionFailureCount: frontier.transitionFailureCount,
  successorStatesPersisted: frontier.successorStatesPersisted,
  elapsedMs: core.elapsedMs,
}, null, 2)}\n`);
