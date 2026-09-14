#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import {
  buildWarmachineCompleteActivationDomainPlanV2,
  enumerateNextWarmachineCompleteActivationDomainPageV2,
} from
  "../src/search/complete-activation-domain-v2.mjs";
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
const sourcePath = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--source="))?.slice("--source=".length) ||
  path.join(
    evidenceRoot,
    "ticket21a-nymara-current-window-frontier-v1.json",
  ));
const outputPath = path.join(
  evidenceRoot,
  "ticket21a-nymara-successor-activation-plans-v1.json",
);

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const sourceCore = { ...source };
delete sourceCore.reportHash;
if (stableGraphHash(sourceCore) !== source.reportHash) {
  throw new Error("ticket21a_successor_plan_source_hash_invalid");
}
const frontier = source.adversarialFrontier;
const store = new WarmachineExternalDagStore(
  path.resolve(repositoryRoot, source.frontierStorePath),
  {
    hostReceiptHash: frontier.currentHostReceiptHash,
    sourceHash: source.counterexampleReceiptHash,
    configHash: source.frontierConfigHash,
    create: false,
  },
);
const startedAtMs = Date.now();
const successorPlans = [];
for (const [edgeIndex, edge] of frontier.edges.entries()) {
  const stateRecord = store.readState(edge.successorStoredState.stateId);
  const plan = buildWarmachineCompleteActivationDomainPlanV2(
    stateRecord.value,
    { priorityActorPieceKeys: [edge.actorPieceKey].filter(Boolean) },
  );
  const firstGroupPage = enumerateNextWarmachineCompleteActivationDomainPageV2(
    stateRecord.value,
    {},
    {
      priorityActorPieceKeys: [edge.actorPieceKey].filter(Boolean),
      pageLimit: Math.min(6, Math.max(1, plan.slotCount)),
    },
  );
  if (firstGroupPage.activationDomainPlanHash !==
      plan.activationDomainPlanHash) {
    throw new Error("ticket21a_successor_plan_hash_drift");
  }
  successorPlans.push(stableGraphValue({
    edgeIndex,
    sourceActionKey: edge.actionKey,
    sourceActionType: edge.actionType,
    successorStateId: edge.successorStoredState.stateId,
    successorStateHash: edge.successorStateHash,
    phaseKey: plan.phaseKey,
    activeSideKey: plan.activeSideKey,
    activationDomainPlanHash: plan.activationDomainPlanHash,
    activationGroupCount: plan.activationGroupCount,
    actionFamilyCount: plan.actionFamilyCount,
    slotCount: plan.slotCount,
    firstSlots: plan.slots.slice(0, 12).map((slot) => ({
      slotIndex: slot.slotIndex,
      slotKey: slot.slotKey,
      groupKey: slot.groupKey,
      actorPieceKeys: slot.actorPieceKeys,
      familyKey: slot.familyKey,
      includeActorlessActions: slot.includeActorlessActions,
    })),
    resumeCursor: {
      activationDomainPlanHash: plan.activationDomainPlanHash,
      nextSlotIndex: 0,
      exhausted: plan.slotCount === 0,
    },
    firstGroupPage: {
      pageReceiptHash: firstGroupPage.pageReceiptHash,
      pageStartSlotIndex: firstGroupPage.pageStartSlotIndex,
      pageEndSlotIndexExclusive:
        firstGroupPage.pageEndSlotIndexExclusive,
      pageSlotCount: firstGroupPage.pageSlotCount,
      validSlotReceiptCount: firstGroupPage.validSlotReceiptCount,
      invalidSlotReceiptCount: firstGroupPage.invalidSlotReceiptCount,
      acceptedActionCount: firstGroupPage.slotReceipts.reduce((sum, slot) =>
        sum + Number(slot.acceptedActionCount || 0), 0),
      rejectedActionCount: firstGroupPage.slotReceipts.reduce((sum, slot) =>
        sum + Number(slot.rejectedActionCount || 0), 0),
      slots: firstGroupPage.slotReceipts.map((slot) => ({
        slotKey: slot.slotKey,
        familyKey: slot.familyKey,
        actorPieceKeys: slot.actorPieceKeys,
        acceptedActionCount: slot.acceptedActionCount,
        acceptedActionKeys: slot.acceptedActionKeys,
        rejectedActionCount: slot.rejectedActionCount,
        rejectedActionIdentities: slot.rejectedActionIdentities,
        continuousDomainDebts: slot.continuousDomainDebts,
        scopeValid: slot.scopeValid,
      })),
      cursor: firstGroupPage.cursor,
      exhausted: firstGroupPage.exhausted,
      remainingSlotCount: firstGroupPage.remainingSlotCount,
      discreteSlotDenominatorComplete:
        firstGroupPage.discreteSlotDenominatorComplete,
    },
    discreteSlotPlanComplete: plan.discreteSlotPlanComplete,
    continuousDomainPlanComplete: plan.continuousDomainPlanComplete,
  }));
  process.stderr.write(`${JSON.stringify({
    elapsedSeconds: Math.round((Date.now() - startedAtMs) / 1000),
    stage: "successor_activation_plan_complete",
    edgeIndex,
    edgeCount: frontier.edges.length,
    sourceActionKey: edge.actionKey,
    activationGroupCount: plan.activationGroupCount,
    slotCount: plan.slotCount,
    firstGroupAcceptedActionCount:
      firstGroupPage.slotReceipts.reduce((sum, slot) =>
        sum + Number(slot.acceptedActionCount || 0), 0),
    firstGroupRejectedActionCount:
      firstGroupPage.slotReceipts.reduce((sum, slot) =>
        sum + Number(slot.rejectedActionCount || 0), 0),
  })}\n`);
}
const core = stableGraphValue({
  schemaVersion:
    "warmachine_ticket21a_successor_activation_plans_evidence_v1",
  sourcePath: path.relative(repositoryRoot, sourcePath),
  sourceReportHash: source.reportHash,
  currentHostReceiptHash: frontier.currentHostReceiptHash,
  querySideKey: frontier.querySideKey,
  sourceDecisionOwnerSideKey: frontier.decisionOwnerSideKey,
  sourceQuantifier: frontier.quantifier,
  successorPlanCount: successorPlans.length,
  successorPlans,
  allSuccessorsRecoverable: successorPlans.every((plan) =>
    plan.successorStateId && plan.activationDomainPlanHash),
  allDiscreteSlotPlansComplete: successorPlans.every((plan) =>
    plan.discreteSlotPlanComplete === true),
  allContinuousDomainsComplete: successorPlans.every((plan) =>
    plan.continuousDomainPlanComplete === true),
  fullOpponentTurnComplete: false,
  chanceDomainComplete: false,
  strategyValuePublicationAllowed: false,
  elapsedMs: Date.now() - startedAtMs,
  claimBoundary:
    "Each persisted one-ply successor is restored and converted into the existing complete-activation actor-group by action-family slot plan with a fresh cursor. Plans account for a finite discrete schedule only; no slot action, continuous parameter, Chance outcome or full opponent turn is claimed complete here.",
});
const report = { ...core, reportHash: stableGraphHash(core) };
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(report)}\n`);
fs.renameSync(temporaryPath, outputPath);
process.stdout.write(`${JSON.stringify({
  ok: core.allSuccessorsRecoverable && core.allDiscreteSlotPlansComplete,
  outputPath,
  reportHash: report.reportHash,
  successorPlanCount: core.successorPlanCount,
  planSummary: successorPlans.map((plan) => ({
    sourceActionKey: plan.sourceActionKey,
    phaseKey: plan.phaseKey,
    activationGroupCount: plan.activationGroupCount,
    slotCount: plan.slotCount,
    firstActorPieceKeys: plan.firstSlots[0]?.actorPieceKeys || [],
    firstGroupAcceptedActionCount:
      plan.firstGroupPage.acceptedActionCount,
    firstGroupRejectedActionCount:
      plan.firstGroupPage.rejectedActionCount,
    nextSlotIndex: plan.firstGroupPage.cursor.nextSlotIndex,
  })),
  fullOpponentTurnComplete: core.fullOpponentTurnComplete,
}, null, 2)}\n`);
