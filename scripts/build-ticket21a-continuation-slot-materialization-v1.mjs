#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import {
  buildWarmachineContinuationSlotMaterializationLedgerV1,
} from "../src/search/continuation-slot-materialization-ledger-v1.mjs";
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
    throw new Error(`ticket21a_continuation_slot_${name}_invalid`);
  }
  return value;
}

function integerListArgument(name, minimum, maximum) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix));
  if (!raw) return [];
  const values = raw.slice(prefix.length).split(",")
    .filter(Boolean).map(Number);
  if (!values.length || new Set(values).size !== values.length ||
      values.some((value) => !Number.isInteger(value) ||
        value < minimum || value > maximum)) {
    throw new Error(`ticket21a_continuation_slot_${name}_invalid`);
  }
  return values;
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

const classLimit = integerArgument("class-limit", 8, 1, 64);
const pageLimit = integerArgument("page-limit", 6, 1, 128);
const worklistPath = path.join(
  evidenceRoot,
  "ticket21a-nymara-pass-continuation-plan-worklist-v1.json",
);
const worklistReport = readValidatedReport(
  worklistPath,
  "ticket21a_continuation_slot_worklist_report_invalid",
);
const ledgerPath = path.resolve(
  repositoryRoot,
  worklistReport.ledgerPath,
);
const ledgerReport = readValidatedReport(
  ledgerPath,
  "ticket21a_continuation_slot_ledger_report_invalid",
);
if (worklistReport.ledgerReportHash !== ledgerReport.reportHash ||
    worklistReport.worklist.sourceLedgerReceiptHash !==
      ledgerReport.ledger.activationActionFrontierLedgerReceiptHash) {
  throw new Error("ticket21a_continuation_slot_worklist_ledger_drift");
}
const frontierPath = path.resolve(
  repositoryRoot,
  worklistReport.frontierPath,
);
const frontierReport = readValidatedReport(
  frontierPath,
  "ticket21a_continuation_slot_frontier_report_invalid",
);
if (worklistReport.frontierReportHash !== frontierReport.reportHash ||
    worklistReport.worklist.hostReceiptHash !==
      frontierReport.adversarialFrontier.currentHostReceiptHash) {
  throw new Error("ticket21a_continuation_slot_frontier_drift");
}
const pageDirectory = path.join(
  evidenceRoot,
  "ticket21a-continuation-slot-pages-v1",
  worklistReport.reportHash,
);
const slotLedgerOutputPath = path.join(
  evidenceRoot,
  "ticket21a-nymara-pass-continuation-slot-ledger-v1.json",
);
const sourceSlotLedgerReportHashAtExecution = fs.existsSync(slotLedgerOutputPath)
  ? readValidatedReport(
    slotLedgerOutputPath,
    "ticket21a_continuation_slot_prior_ledger_invalid",
  ).reportHash
  : "";
const actionPageDirectory = path.join(
  evidenceRoot,
  "ticket21a-continuation-action-pages-v1",
  worklistReport.reportHash,
);

function readPageEntries() {
  if (!fs.existsSync(pageDirectory)) return [];
  return fs.readdirSync(pageDirectory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const report = readValidatedReport(
        path.join(pageDirectory, name),
        "ticket21a_continuation_slot_page_report_invalid",
      );
      if (report.schemaVersion !==
            "warmachine_ticket21a_continuation_slot_page_evidence_v1" ||
          report.worklistReportHash !== worklistReport.reportHash ||
          report.sourceWorklistReceiptHash !==
            worklistReport.worklist.continuationPlanWorklistReceiptHash ||
          report.hostReceiptHash !== worklistReport.worklist.hostReceiptHash) {
        throw new Error("ticket21a_continuation_slot_page_scope_drift");
      }
      return {
        continuationClassKey: report.continuationClassKey,
        classIndex: report.classIndex,
        page: report.page,
      };
    });
}

let pageEntries = readPageEntries();
let currentLedger = buildWarmachineContinuationSlotMaterializationLedgerV1(
  worklistReport.worklist,
  pageEntries,
);
const explicitClassIndices = integerListArgument(
  "class-indices",
  0,
  currentLedger.classRows.length - 1,
);
const selectedClassRows = explicitClassIndices.length
  ? explicitClassIndices.map((classIndex) => {
    const row = currentLedger.classRows[classIndex];
    if (!row || row.exhausted) {
      throw new Error(
        `ticket21a_continuation_slot_explicit_class_unavailable:${classIndex}`,
      );
    }
    return row;
  })
  : currentLedger.classRows
    .filter((row) => !row.exhausted)
    .sort((left, right) =>
      left.pageCount - right.pageCount || left.classIndex - right.classIndex)
    .slice(0, classLimit);
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
for (const [batchIndex, classRow] of selectedClassRows.entries()) {
  const sourcePlan = worklistReport.worklist.planRows[classRow.classIndex];
  const stateRecord = store.readState(classRow.representativeStateId);
  const stateHash = warmachineRuleBehaviorStateHashV1(stateRecord.value);
  if (stateHash !== sourcePlan.successorStateHash) {
    throw new Error("ticket21a_continuation_slot_state_hash_mismatch");
  }
  const rebuiltPlan = buildWarmachineCompleteActivationDomainPlanV2(
    stateRecord.value,
  );
  if (rebuiltPlan.activationDomainPlanHash !==
      sourcePlan.activationDomainPlanHash) {
    throw new Error("ticket21a_continuation_slot_plan_hash_mismatch");
  }
  const trustedEnumerationsByGroupIndex = new Map();
  const page = enumerateNextWarmachineCompleteActivationDomainPageV2(
    stateRecord.value,
    classRow.nextCursor,
    {
      pageLimit,
      onRuntimeGroupEnumeration: ({ groupIndex, enumeration }) => {
        trustedEnumerationsByGroupIndex.set(groupIndex, enumeration);
      },
    },
  );
  const reportCore = stableGraphValue({
    schemaVersion:
      "warmachine_ticket21a_continuation_slot_page_evidence_v1",
    worklistPath: path.relative(repositoryRoot, worklistPath),
    worklistReportHash: worklistReport.reportHash,
    sourceWorklistReceiptHash:
      worklistReport.worklist.continuationPlanWorklistReceiptHash,
    hostReceiptHash: worklistReport.worklist.hostReceiptHash,
    continuationClassKey: classRow.continuationClassKey,
    classIndex: classRow.classIndex,
    representativeStateId: classRow.representativeStateId,
    successorStateHash: sourcePlan.successorStateHash,
    activationDomainPlanHash: sourcePlan.activationDomainPlanHash,
    page,
    claimBoundary:
      "This immutable evidence materializes one Host action-family slot page for one bound continuation class. It does not execute accepted actions or claim later-slot, continuous, response, Chance, turn or value completeness.",
  });
  const report = { ...reportCore, reportHash: stableGraphHash(reportCore) };
  const outputPath = path.join(
    pageDirectory,
    `class-${String(classRow.classIndex).padStart(4, "0")}-slots-${
      String(page.pageStartSlotIndex).padStart(4, "0")}-${
      String(page.pageEndSlotIndexExclusive).padStart(4, "0")}.json`,
  );
  if (fs.existsSync(outputPath)) {
    const existing = readValidatedReport(
      outputPath,
      "ticket21a_continuation_slot_existing_page_invalid",
    );
    if (existing.reportHash !== report.reportHash) {
      throw new Error("ticket21a_continuation_slot_existing_page_drift");
    }
  } else {
    writeAtomically(outputPath, report);
  }
  const pageAcceptedActionCount = page.slotReceipts.reduce((sum, slot) =>
    sum + Number(slot.acceptedActionCount || 0), 0);
  if (pageAcceptedActionCount > 0 && pageAcceptedActionCount <= 128) {
    const actionFrontier = buildWarmachineActivationActionFrontierV1(
      stateRecord.value,
      page,
      {
        querySideKey: worklistReport.worklist.querySideKey,
        taskKey: "ticket21a-nymara-continuation-action-execution-v1",
        sourceStateId: classRow.representativeStateId,
        expectedStateHash: rebuiltPlan.stateHash,
        cursor: {
          activationDomainPlanHash: rebuiltPlan.activationDomainPlanHash,
          pageReceiptHash: page.pageReceiptHash,
          nextActionIndex: 0,
        },
        limit: pageAcceptedActionCount,
        trustedEnumerationsByGroupIndex,
        persistState: (state) => store.putState(state, {
          parentStateId: classRow.representativeStateId,
        }),
      },
    );
    const actionCore = stableGraphValue({
      schemaVersion:
        "warmachine_ticket21a_continuation_action_execution_page_v1",
      worklistPath: path.relative(repositoryRoot, worklistPath),
      worklistReportHash: worklistReport.reportHash,
      slotLedgerPath: path.relative(repositoryRoot, slotLedgerOutputPath),
      slotLedgerReportHash: sourceSlotLedgerReportHashAtExecution,
      sourceSlotPageReportHash: report.reportHash,
      classIndex: classRow.classIndex,
      continuationClassKey: classRow.continuationClassKey,
      elapsedMs: Date.now() - startedAtMs,
      frontier: actionFrontier,
      claimBoundary:
        "This immutable page reuses the exact in-memory Host enumeration that produced its bound slot page, then strict-applies every accepted action from the same parent. Later slots, responses, Chance and adaptive continuations remain separate debts.",
    });
    const actionReport = {
      ...actionCore,
      reportHash: stableGraphHash(actionCore),
    };
    const actionOutputPath = path.join(
      actionPageDirectory,
      `class-${String(classRow.classIndex).padStart(4, "0")}-slots-${
        String(page.pageStartSlotIndex).padStart(4, "0")}-actions-0000-${
        String(pageAcceptedActionCount).padStart(4, "0")}.json`,
    );
    if (fs.existsSync(actionOutputPath)) {
      const existing = readValidatedReport(
        actionOutputPath,
        "ticket21a_continuation_slot_existing_action_page_invalid",
      );
      if (existing.frontier.activationActionFrontierReceiptHash !==
          actionFrontier.activationActionFrontierReceiptHash ||
          existing.sourceSlotPageReportHash !== report.reportHash) {
        throw new Error(
          "ticket21a_continuation_slot_existing_action_page_drift",
        );
      }
    } else {
      writeAtomically(actionOutputPath, actionReport);
    }
  }
  pageEntries.push({
    continuationClassKey: classRow.continuationClassKey,
    classIndex: classRow.classIndex,
    page,
  });
  process.stderr.write(`${JSON.stringify({
    stage: "continuation_slot_page_materialized",
    completedClassCount: batchIndex + 1,
    selectedClassCount: selectedClassRows.length,
    globalClassIndex: classRow.classIndex,
    pageStartSlotIndex: page.pageStartSlotIndex,
    pageEndSlotIndexExclusive: page.pageEndSlotIndexExclusive,
    acceptedActionCount: pageAcceptedActionCount,
    acceptedActionsStrictExecuted:
      pageAcceptedActionCount > 0 && pageAcceptedActionCount <= 128,
    elapsedSeconds: Math.round((Date.now() - startedAtMs) / 1000),
  })}\n`);
}
pageEntries = readPageEntries();
currentLedger = buildWarmachineContinuationSlotMaterializationLedgerV1(
  worklistReport.worklist,
  pageEntries,
);
const core = stableGraphValue({
  schemaVersion:
    "warmachine_ticket21a_continuation_slot_materialization_evidence_v1",
  worklistPath: path.relative(repositoryRoot, worklistPath),
  worklistReportHash: worklistReport.reportHash,
  pageDirectory: path.relative(repositoryRoot, pageDirectory),
  selectedClassCount: selectedClassRows.length,
  pageLimit,
  elapsedMs: Date.now() - startedAtMs,
  ledger: currentLedger,
  claimBoundary:
    "This mutable aggregate points to immutable per-class slot pages and reports exact current materialization progress. It does not convert candidate counts into probabilities or execute accepted actions.",
});
const report = { ...core, reportHash: stableGraphHash(core) };
writeAtomically(slotLedgerOutputPath, report);
process.stdout.write(`${JSON.stringify({
  ok: currentLedger.ok,
  outputPath: slotLedgerOutputPath,
  reportHash: report.reportHash,
  continuationSlotMaterializationLedgerReceiptHash:
    currentLedger.continuationSlotMaterializationLedgerReceiptHash,
  continuationClassCount: currentLedger.continuationClassCount,
  materializedClassCount: currentLedger.materializedClassCount,
  exhaustedClassCount: currentLedger.exhaustedClassCount,
  totalSlotCount: currentLedger.totalSlotCount,
  materializedSlotCount: currentLedger.materializedSlotCount,
  remainingSlotCount: currentLedger.remainingSlotCount,
  acceptedActionCount: currentLedger.acceptedActionCount,
  rejectedActionCount: currentLedger.rejectedActionCount,
  elapsedMs: core.elapsedMs,
}, null, 2)}\n`);
