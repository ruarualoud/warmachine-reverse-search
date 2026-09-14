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

function integerArgument(name, fallback, minimum, maximum) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix));
  const value = raw ? Number(raw.slice(prefix.length)) : fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`ticket21a_continuation_action_${name}_invalid`);
  }
  return value;
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

function writeAtomically(outputPath, value) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value)}\n`);
  fs.renameSync(temporaryPath, outputPath);
}

const taskLimit = integerArgument("task-limit", 8, 1, 64);
const actionLimit = integerArgument("action-limit", 128, 1, 128);
const slotLedgerPath = path.join(
  evidenceRoot,
  "ticket21a-nymara-pass-continuation-slot-ledger-v1.json",
);
const slotLedgerReport = readValidatedReport(
  slotLedgerPath,
  "ticket21a_continuation_action_slot_ledger_invalid",
);
const worklistPath = path.resolve(
  repositoryRoot,
  slotLedgerReport.worklistPath,
);
const worklistReport = readValidatedReport(
  worklistPath,
  "ticket21a_continuation_action_worklist_invalid",
);
if (slotLedgerReport.worklistReportHash !== worklistReport.reportHash ||
    slotLedgerReport.ledger.sourceWorklistReceiptHash !==
      worklistReport.worklist.continuationPlanWorklistReceiptHash) {
  throw new Error("ticket21a_continuation_action_worklist_drift");
}
const frontierPath = path.resolve(
  repositoryRoot,
  worklistReport.frontierPath,
);
const frontierReport = readValidatedReport(
  frontierPath,
  "ticket21a_continuation_action_frontier_invalid",
);
if (worklistReport.frontierReportHash !== frontierReport.reportHash) {
  throw new Error("ticket21a_continuation_action_frontier_drift");
}
const sourcePageDirectory = path.resolve(
  repositoryRoot,
  slotLedgerReport.pageDirectory,
);
const actionPageDirectory = path.join(
  evidenceRoot,
  "ticket21a-continuation-action-pages-v1",
  worklistReport.reportHash,
);

function sourcePageReports() {
  if (!fs.existsSync(sourcePageDirectory)) return [];
  return fs.readdirSync(sourcePageDirectory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readValidatedReport(
      path.join(sourcePageDirectory, name),
      "ticket21a_continuation_action_source_page_invalid",
    ))
    .sort((left, right) =>
      left.classIndex - right.classIndex ||
      left.page.pageStartSlotIndex - right.page.pageStartSlotIndex);
}

function actionPageReports() {
  if (!fs.existsSync(actionPageDirectory)) return [];
  return fs.readdirSync(actionPageDirectory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readValidatedReport(
      path.join(actionPageDirectory, name),
      "ticket21a_continuation_action_page_invalid",
    ));
}

function acceptedActionCount(sourcePageReport) {
  return sourcePageReport.page.slotReceipts.reduce((sum, slot) =>
    sum + Number(slot.acceptedActionCount || 0), 0);
}

function completedActionCount(sourcePageReport, reports) {
  const matching = reports.filter((report) =>
    report.sourceSlotPageReportHash === sourcePageReport.reportHash)
    .sort((left, right) =>
      left.frontier.page.startActionIndex -
        right.frontier.page.startActionIndex);
  let nextActionIndex = 0;
  for (const report of matching) {
    if (report.worklistReportHash !== worklistReport.reportHash ||
        report.classIndex !== sourcePageReport.classIndex ||
        report.frontier.activationPageReceiptHash !==
          sourcePageReport.page.pageReceiptHash ||
        report.frontier.page.startActionIndex !== nextActionIndex) {
      throw new Error("ticket21a_continuation_action_page_scope_drift");
    }
    nextActionIndex = report.frontier.page.endActionIndexExclusive;
  }
  if (nextActionIndex > acceptedActionCount(sourcePageReport)) {
    throw new Error("ticket21a_continuation_action_page_overflow");
  }
  return { matching, nextActionIndex };
}

const sources = sourcePageReports();
let priorActionReports = actionPageReports();
const pendingTasks = sources.map((sourcePageReport) => ({
  sourcePageReport,
  ...completedActionCount(sourcePageReport, priorActionReports),
  acceptedActionCount: acceptedActionCount(sourcePageReport),
})).filter((task) => task.nextActionIndex < task.acceptedActionCount)
  .sort((left, right) =>
    left.matching.length - right.matching.length ||
    left.sourcePageReport.classIndex - right.sourcePageReport.classIndex ||
    left.sourcePageReport.page.pageStartSlotIndex -
      right.sourcePageReport.page.pageStartSlotIndex)
  .slice(0, taskLimit);
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
for (const [taskIndex, task] of pendingTasks.entries()) {
  const source = task.sourcePageReport;
  const sourcePlan = worklistReport.worklist.planRows[source.classIndex];
  if (!sourcePlan ||
      source.continuationClassKey !== sourcePlan.continuationClassKey ||
      source.activationDomainPlanHash !== sourcePlan.activationDomainPlanHash) {
    throw new Error("ticket21a_continuation_action_source_plan_mismatch");
  }
  const stateRecord = store.readState(sourcePlan.representativeStateId);
  if (warmachineRuleBehaviorStateHashV1(stateRecord.value) !==
      sourcePlan.successorStateHash) {
    throw new Error("ticket21a_continuation_action_state_hash_mismatch");
  }
  const plan = buildWarmachineCompleteActivationDomainPlanV2(
    stateRecord.value,
  );
  if (plan.activationDomainPlanHash !== sourcePlan.activationDomainPlanHash) {
    throw new Error("ticket21a_continuation_action_plan_hash_mismatch");
  }
  const trustedEnumerationsByGroupIndex = new Map();
  const activationPage = enumerateNextWarmachineCompleteActivationDomainPageV2(
    stateRecord.value,
    {
      activationDomainPlanHash: plan.activationDomainPlanHash,
      nextSlotIndex: source.page.pageStartSlotIndex,
    },
    {
      pageLimit: source.page.pageSlotCount,
      onRuntimeGroupEnumeration: ({ groupIndex, enumeration }) => {
        trustedEnumerationsByGroupIndex.set(groupIndex, enumeration);
      },
    },
  );
  if (activationPage.pageReceiptHash !== source.page.pageReceiptHash) {
    throw new Error("ticket21a_continuation_action_activation_page_drift");
  }
  const frontier = buildWarmachineActivationActionFrontierV1(
    stateRecord.value,
    activationPage,
    {
      querySideKey: worklistReport.worklist.querySideKey,
      taskKey: "ticket21a-nymara-continuation-action-execution-v1",
      sourceStateId: sourcePlan.representativeStateId,
      expectedStateHash: plan.stateHash,
      cursor: {
        activationDomainPlanHash: plan.activationDomainPlanHash,
        pageReceiptHash: activationPage.pageReceiptHash,
        nextActionIndex: task.nextActionIndex,
      },
      limit: Math.min(
        actionLimit,
        task.acceptedActionCount - task.nextActionIndex,
      ),
      trustedEnumerationsByGroupIndex,
      persistState: (state) => store.putState(state, {
        parentStateId: sourcePlan.representativeStateId,
      }),
    },
  );
  const reportCore = stableGraphValue({
    schemaVersion:
      "warmachine_ticket21a_continuation_action_execution_page_v1",
    worklistPath: path.relative(repositoryRoot, worklistPath),
    worklistReportHash: worklistReport.reportHash,
    slotLedgerPath: path.relative(repositoryRoot, slotLedgerPath),
    slotLedgerReportHash: slotLedgerReport.reportHash,
    sourceSlotPageReportHash: source.reportHash,
    classIndex: source.classIndex,
    continuationClassKey: source.continuationClassKey,
    elapsedMs: Date.now() - startedAtMs,
    frontier,
    claimBoundary:
      "This immutable page strict-applies accepted actions from one bound materialized slot page. Every edge starts from the same parent; later action pages, slots, responses, Chance and adaptive continuations remain separate debts.",
  });
  const report = { ...reportCore, reportHash: stableGraphHash(reportCore) };
  const outputPath = path.join(
    actionPageDirectory,
    `class-${String(source.classIndex).padStart(4, "0")}-slots-${
      String(source.page.pageStartSlotIndex).padStart(4, "0")}-actions-${
      String(frontier.page.startActionIndex).padStart(4, "0")}-${
      String(frontier.page.endActionIndexExclusive).padStart(4, "0")}.json`,
  );
  if (fs.existsSync(outputPath)) {
    const existing = readValidatedReport(
      outputPath,
      "ticket21a_continuation_action_existing_page_invalid",
    );
    if (existing.reportHash !== report.reportHash) {
      throw new Error("ticket21a_continuation_action_existing_page_drift");
    }
  } else {
    writeAtomically(outputPath, report);
  }
  priorActionReports.push(report);
  process.stderr.write(`${JSON.stringify({
    stage: "continuation_action_page_executed",
    completedTaskCount: taskIndex + 1,
    selectedTaskCount: pendingTasks.length,
    globalClassIndex: source.classIndex,
    executedActionCount: frontier.page.edgeCount,
    remainingActionCount: frontier.page.remainingActionCount,
    elapsedSeconds: Math.round((Date.now() - startedAtMs) / 1000),
  })}\n`);
}

priorActionReports = actionPageReports();
const sourceRows = sources.map((source) => {
  const progress = completedActionCount(source, priorActionReports);
  const denominator = acceptedActionCount(source);
  const matchingFrontiers = progress.matching.map((report) => report.frontier);
  return stableGraphValue({
    sourceSlotPageReportHash: source.reportHash,
    classIndex: source.classIndex,
    continuationClassKey: source.continuationClassKey,
    slotStartIndex: source.page.pageStartSlotIndex,
    slotEndIndexExclusive: source.page.pageEndSlotIndexExclusive,
    acceptedActionDenominator: denominator,
    executedActionCount: progress.nextActionIndex,
    transitionFailureCount: matchingFrontiers.reduce((sum, frontier) =>
      sum + Number(frontier.transitionFailureCount || 0), 0),
    persistedSuccessorCount: matchingFrontiers.reduce((sum, frontier) =>
      sum + frontier.edges.filter((edge) =>
        Boolean(edge.successorStoredState?.stateId)).length, 0),
    remainingActionCount: denominator - progress.nextActionIndex,
    exhausted: progress.nextActionIndex === denominator,
    actionFrontierReceiptHashes: matchingFrontiers.map((frontier) =>
      frontier.activationActionFrontierReceiptHash),
  });
});
const aggregateCore = stableGraphValue({
  schemaVersion:
    "warmachine_ticket21a_continuation_action_execution_ledger_v1",
  worklistReportHash: worklistReport.reportHash,
  slotLedgerReportHash: slotLedgerReport.reportHash,
  sourceSlotMaterializationLedgerReceiptHash:
    slotLedgerReport.ledger
      .continuationSlotMaterializationLedgerReceiptHash,
  hostReceiptHash: worklistReport.worklist.hostReceiptHash,
  querySideKey: worklistReport.worklist.querySideKey,
  sourceSlotPageCount: sourceRows.length,
  materializedAcceptedActionDenominator: sourceRows.reduce((sum, row) =>
    sum + row.acceptedActionDenominator, 0),
  executedActionCount: sourceRows.reduce((sum, row) =>
    sum + row.executedActionCount, 0),
  remainingActionCount: sourceRows.reduce((sum, row) =>
    sum + row.remainingActionCount, 0),
  transitionFailureCount: sourceRows.reduce((sum, row) =>
    sum + row.transitionFailureCount, 0),
  persistedSuccessorCount: sourceRows.reduce((sum, row) =>
    sum + row.persistedSuccessorCount, 0),
  exhaustedSourcePageCount: sourceRows.filter((row) => row.exhausted).length,
  sourceRows,
  actionDenominatorConserved: sourceRows.every((row) =>
    row.executedActionCount + row.remainingActionCount ===
      row.acceptedActionDenominator),
  allMaterializedActionsExecuted: sourceRows.every((row) => row.exhausted),
  acceptedActionCountsAreProbabilities: false,
  completeOpponentTurn: false,
  chanceDomainComplete: false,
  responseDomainComplete: false,
  effectiveStrategyQuotientComplete: false,
  strategyValuePublicationAllowed: false,
  unresolvedReasons: [
    ...(sourceRows.some((row) => !row.exhausted)
      ? ["materialized_slot_actions_unexecuted"]
      : []),
    "continuation_slots_unmaterialized",
    "strict_successor_continuations_unexpanded",
    "response_and_chance_domains_unexpanded",
  ],
  claimBoundary:
    "This ledger conserves strict action execution only for currently materialized slot pages. It does not close unmaterialized slots, continuous parameters, deeper adaptive continuations, responses, Chance, a full opponent turn or strategy value.",
});
const actionExecutionLedger = {
  ...aggregateCore,
  continuationActionExecutionLedgerReceiptHash:
    stableGraphHash(aggregateCore),
};
const outputPath = path.join(
  evidenceRoot,
  "ticket21a-nymara-pass-continuation-action-ledger-v1.json",
);
const outputCore = stableGraphValue({
  schemaVersion:
    "warmachine_ticket21a_continuation_action_execution_evidence_v1",
  worklistPath: path.relative(repositoryRoot, worklistPath),
  worklistReportHash: worklistReport.reportHash,
  slotLedgerPath: path.relative(repositoryRoot, slotLedgerPath),
  slotLedgerReportHash: slotLedgerReport.reportHash,
  actionPageDirectory: path.relative(repositoryRoot, actionPageDirectory),
  selectedTaskCount: pendingTasks.length,
  actionLimit,
  elapsedMs: Date.now() - startedAtMs,
  actionExecutionLedger,
  claimBoundary:
    "This mutable aggregate points to immutable strict action pages and reports exact progress against the current materialized-slot action denominator.",
});
const outputReport = {
  ...outputCore,
  reportHash: stableGraphHash(outputCore),
};
writeAtomically(outputPath, outputReport);
process.stdout.write(`${JSON.stringify({
  ok: actionExecutionLedger.actionDenominatorConserved &&
    actionExecutionLedger.transitionFailureCount === 0,
  outputPath,
  reportHash: outputReport.reportHash,
  continuationActionExecutionLedgerReceiptHash:
    actionExecutionLedger.continuationActionExecutionLedgerReceiptHash,
  sourceSlotPageCount: actionExecutionLedger.sourceSlotPageCount,
  materializedAcceptedActionDenominator:
    actionExecutionLedger.materializedAcceptedActionDenominator,
  executedActionCount: actionExecutionLedger.executedActionCount,
  remainingActionCount: actionExecutionLedger.remainingActionCount,
  transitionFailureCount: actionExecutionLedger.transitionFailureCount,
  persistedSuccessorCount: actionExecutionLedger.persistedSuccessorCount,
  elapsedMs: outputCore.elapsedMs,
}, null, 2)}\n`);
