#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildWarmachineRosterPointLedger } from
  "../src/construction/roster-investment-v1.mjs";
import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import {
  WARMACHINE_MATCHUP_TERMINAL_PARTITION_CAPABILITY_AUDIT_V1_SCHEMA,
  auditWarmachineMatchupTerminalPartitionCapabilityV1,
  warmachineMatchupTerminalPartitionCapabilityAuditRequiredV1,
} from "../src/matchup/matchup-terminal-partition-capability-audit-v1.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(reverseDirectory,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1"));

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertSealed(value = {}, hashField = "auditHash") {
  const core = { ...value };
  const declaredHash = String(core[hashField] || "");
  delete core[hashField];
  assert.ok(declaredHash);
  assert.equal(stableGraphHash(core), declaredHash);
}

function seal(value = {}, hashField = "") {
  return { ...value, [hashField]: stableGraphHash(value) };
}

function fixturePiece(sideKey, suffix) {
  const cardId = `fixture-unit-card-${suffix}`;
  return {
    pieceKey: `${sideKey}_fixture_unit_${suffix}`,
    sideKey,
    cardId,
    cardName: `Fixture Unit ${suffix}`,
    cardTypeName: "Unit",
    cardType: "Unit",
    modelType: "Unit",
    modelRole: "unit model",
    isWarjack: false,
    isWarbeast: false,
    pointCost: 0,
    cardSnapshot: {
      id: cardId,
      name: `Fixture Unit ${suffix}`,
      cardTypeName: "Unit",
      pointCostNumber: 0,
    },
  };
}

function syntheticNegativeArtifacts() {
  const taskKey = "fixture-terminal-task-no-warbeast";
  const taskHash = "fixture-custom-matchup-task-hash";
  const sourceRosterKeys = {
    subject: "fixture-subject-roster",
    challenger: "fixture-challenger-roster",
  };
  const envelopeCore = {
    actionCategory: "fixture_terminal_action",
    actorAxis: {
      taskSideKey: "subject",
      candidateCount: 1,
      candidates: [{
        entryId: "fixture-subject-entry",
        cardId: "fixture-unit-card-subject",
        cardTypeName: "Unit",
        physicalModelCount: 1,
      }],
    },
    healthAndSystemAxis: ["warbeast_aspect_disabled"],
    sourceRosterKeys,
  };
  const terminalTask = {
    taskKey,
    mapKey: "fixture-map",
    deploymentSeedKey: "fixture-deployment",
    firstPlayerTaskSideKey: "subject",
    executionEnvelope: seal(envelopeCore, "executionEnvelopeHash"),
    representative: {
      scenarioKey: "fixture-scenario",
      coordinates: { damage: "warbeast_aspect_disabled" },
    },
  };
  const planCore = {
    schemaVersion: "warmachine_matchup_terminal_root_batch_plan_v1",
    receipts: {
      taskHash,
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      constructionHostReceiptHash:
        warmachineConstructionHost.receipt.receiptHash,
    },
    selectedTasks: [terminalTask],
  };
  const plan = seal(planCore, "planHash");
  const state = {
    strictMode: true,
    pieces: [
      fixturePiece("player1", "subject"),
      fixturePiece("player2", "challenger"),
    ],
  };
  const rosterPointLedger = buildWarmachineRosterPointLedger(state, {
    completeArmyPointsBySide: { player1: 0, player2: 0 },
  });
  const opening = {
    openingKey: "fixture-exact-opening",
    constructionOpeningKey: "fixture-construction-opening",
    disposition: "strict_opening_materialized",
    subjectRosterKey: sourceRosterKeys.subject,
    challengerRosterKey: sourceRosterKeys.challenger,
    scenarioKey: terminalTask.representative.scenarioKey,
    mapKey: terminalTask.mapKey,
    deploymentSeedKey: terminalTask.deploymentSeedKey,
    firstPlayerTaskSideKey: terminalTask.firstPlayerTaskSideKey,
    modelCount: state.pieces.length,
    strictOpeningStateHash: stableGraphHash(state),
    strictDeploymentReceiptHash: "fixture-strict-deployment-receipt",
    scenarioBindingHash: "fixture-scenario-binding",
    rosterPointLedger,
    state,
  };
  const taskLedger = {
    terminalTaskKey: taskKey,
    openingKey: opening.openingKey,
    disposition: "strict_opening_materialized",
    strictOpeningStateHash: opening.strictOpeningStateHash,
    strictDeploymentReceiptHash: opening.strictDeploymentReceiptHash,
    scenarioBindingHash: opening.scenarioBindingHash,
  };
  const reportCore = {
    schemaVersion: "warmachine_matchup_terminal_root_opening_batch_v1",
    taskHash,
    planHash: plan.planHash,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash:
      warmachineConstructionHost.receipt.receiptHash,
    taskLedger: [taskLedger],
  };
  const openingReport = seal(reportCore, "reportHash");
  const runtimeCore = {
    schemaVersion: "warmachine_matchup_terminal_root_opening_batch_runtime_v1",
    taskHash,
    planHash: plan.planHash,
    reportHash: openingReport.reportHash,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash:
      warmachineConstructionHost.receipt.receiptHash,
    openings: [opening],
  };
  return {
    taskKey,
    plan,
    openingReport,
    openingRuntime: seal(runtimeCore, "runtimeHash"),
  };
}

const synthetic = syntheticNegativeArtifacts();
const syntheticNegative =
  auditWarmachineMatchupTerminalPartitionCapabilityV1(synthetic);
assertSealed(syntheticNegative);
assert.equal(syntheticNegative.schemaVersion,
  WARMACHINE_MATCHUP_TERMINAL_PARTITION_CAPABILITY_AUDIT_V1_SCHEMA);
assert.equal(syntheticNegative.requiredCapability, "warbeast");
assert.equal(syntheticNegative.supported, false);
assert.equal(syntheticNegative.exactCandidateRoutingMismatch, true);
assert.equal(syntheticNegative.proposalDispositionEvidence, "proposal_filtered");
assert.equal(syntheticNegative.matchingCardCount, 0);
assert.equal(syntheticNegative.matchingPieceCount, 0);
assert.equal(syntheticNegative.strictRulesConclusion, false);

assert.throws(() =>
  auditWarmachineMatchupTerminalPartitionCapabilityV1({
    ...synthetic,
    plan: {
      ...synthetic.plan,
      receipts: {
        ...synthetic.plan.receipts,
        hostReceiptHash: "tampered-host-receipt",
      },
    },
  }), /terminal_partition_capability_plan_hash_invalid/);
const driftedPlanCore = {
  ...synthetic.plan,
  receipts: {
    ...synthetic.plan.receipts,
    hostReceiptHash: "drifted-but-resealed-host-receipt",
  },
};
delete driftedPlanCore.planHash;
assert.throws(() =>
  auditWarmachineMatchupTerminalPartitionCapabilityV1({
    ...synthetic,
    plan: seal(driftedPlanCore, "planHash"),
  }), /terminal_partition_capability_plan_host_receipt_drift/);
assert.throws(() =>
  auditWarmachineMatchupTerminalPartitionCapabilityV1({
    ...synthetic,
    openingRuntime: {
      ...synthetic.openingRuntime,
      runtimeHash: "tampered-runtime-hash",
    },
  }), /terminal_partition_capability_opening_runtime_hash_invalid/);
const tamperedAudit = { ...syntheticNegative, supported: true };
assert.notEqual(stableGraphHash(Object.fromEntries(Object.entries(tamperedAudit)
  .filter(([key]) => key !== "auditHash"))), tamperedAudit.auditHash);

const batchRoot = path.join(outputDirectory, "terminal-root-batch-v1");
const current = loadJson(path.join(batchRoot, "CURRENT.json"));
assertSealed(current, "currentHash");
assert.equal(current.hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(current.constructionHostReceiptHash,
  warmachineConstructionHost.receipt.receiptHash);
const planDirectory = path.join(batchRoot, current.relativePlanDirectory);
const production = {
  plan: loadJson(path.join(planDirectory, "plan.json")),
  openingReport: loadJson(path.join(
    planDirectory,
    "opening-batch-report.json",
  )),
  openingRuntime: loadJson(path.join(
    planDirectory,
    "opening-batch-runtime.json",
  )),
};
const productionMismatchTask = production.plan.selectedTasks.find((task) =>
  task.representative?.coordinates?.damage === "warjack_system_disabled");
const productionPositiveTask = production.plan.selectedTasks.find((task) =>
  task.representative?.coordinates?.damage === "warbeast_aspect_disabled");
const productionPayloadMismatchTask = production.plan.selectedTasks.find((task) =>
  task.representative?.scenarioKey === "payload" &&
  task.representative?.coordinates?.leaderControl === "on_boundary");
assert.ok(productionMismatchTask);
assert.ok(productionPositiveTask);
assert.ok(productionPayloadMismatchTask);
assert.equal(warmachineMatchupTerminalPartitionCapabilityAuditRequiredV1(
  productionPayloadMismatchTask), true);

const positive = auditWarmachineMatchupTerminalPartitionCapabilityV1({
  ...production,
  taskKey: productionPositiveTask.taskKey,
});
assertSealed(positive);
assert.equal(positive.requiredCapability, "warbeast");
assert.equal(positive.supported, true);
assert.equal(positive.exactCandidateRoutingMismatch, false);
assert.equal(positive.proposalDispositionEvidence, "not_applicable");
assert.ok(positive.matchingCardCount > 0);
assert.ok(positive.matchingPieceCount > 0);
assert.equal(positive.matchingCardIdentities.every((row) =>
  row.cardTypeName === "Warbeast"), true);
assert.equal(positive.matchingPieceIdentities.every((row) =>
  row.structuredCapabilityFlag === "isWarbeast" &&
  row.structuredCapabilityFlagValue === true), true);

const productionMismatch =
  auditWarmachineMatchupTerminalPartitionCapabilityV1({
    ...production,
    taskKey: productionMismatchTask.taskKey,
  });
assertSealed(productionMismatch);
assert.equal(productionMismatch.taskKey, productionMismatchTask.taskKey);
assert.equal(productionMismatch.requiredPartitionValue,
  "warjack_system_disabled");
assert.equal(productionMismatch.requiredCapability, "warjack");
assert.equal(productionMismatch.supported, false);
assert.equal(productionMismatch.exactCandidateRoutingMismatch, true);
assert.equal(productionMismatch.proposalDispositionEvidence,
  "proposal_filtered");
assert.equal(productionMismatch.matchingCardCount, 0);
assert.equal(productionMismatch.matchingPieceCount, 0);
assert.equal(productionMismatch.exactRosterInventory.sideKeys.length, 2);
assert.equal(productionMismatch.exactRosterInventory.physicalModelCount, 113);
assert.equal(productionMismatch.strictRulesConclusion, false);
assert.equal(productionMismatch.hostExecutionPerformed, false);

const productionPayloadMismatch =
  auditWarmachineMatchupTerminalPartitionCapabilityV1({
    ...production,
    taskKey: productionPayloadMismatchTask.taskKey,
  });
assertSealed(productionPayloadMismatch);
assert.equal(productionPayloadMismatch.requiredPartitionAxis, "leaderControl");
assert.equal(productionPayloadMismatch.requiredPartitionValue, "on_boundary");
assert.equal(productionPayloadMismatch.requiredCapability,
  "ending_side_controller_with_controlled_cohort");
assert.equal(productionPayloadMismatch.requirementKind,
  "ending_side_controlled_cohort");
assert.equal(productionPayloadMismatch.supported, false);
assert.equal(productionPayloadMismatch.exactCandidateRoutingMismatch, true);
assert.equal(productionPayloadMismatch.relationCount, 0);
assert.equal(productionPayloadMismatch.proposalDispositionEvidence,
  "proposal_filtered");

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion:
    WARMACHINE_MATCHUP_TERMINAL_PARTITION_CAPABILITY_AUDIT_V1_SCHEMA,
  syntheticNegative: {
    taskKey: syntheticNegative.taskKey,
    auditHash: syntheticNegative.auditHash,
    requiredCapability: syntheticNegative.requiredCapability,
    supported: syntheticNegative.supported,
  },
  productionPositive: {
    taskKey: positive.taskKey,
    openingKey: positive.openingKey,
    auditHash: positive.auditHash,
    requiredCapability: positive.requiredCapability,
    matchingCardCount: positive.matchingCardCount,
    matchingPieceCount: positive.matchingPieceCount,
    supported: positive.supported,
  },
  productionWarjackMismatch: {
    taskKey: productionMismatch.taskKey,
    openingKey: productionMismatch.openingKey,
    auditHash: productionMismatch.auditHash,
    requiredCapability: productionMismatch.requiredCapability,
    matchingCardCount: productionMismatch.matchingCardCount,
    matchingPieceCount: productionMismatch.matchingPieceCount,
    physicalModelCount:
      productionMismatch.exactRosterInventory.physicalModelCount,
    exactCandidateRoutingMismatch:
      productionMismatch.exactCandidateRoutingMismatch,
    proposalDispositionEvidence:
      productionMismatch.proposalDispositionEvidence,
  },
  productionPayloadControlledCohortMismatch: {
    taskKey: productionPayloadMismatch.taskKey,
    openingKey: productionPayloadMismatch.openingKey,
    auditHash: productionPayloadMismatch.auditHash,
    requiredCapability: productionPayloadMismatch.requiredCapability,
    relationCount: productionPayloadMismatch.relationCount,
    exactCandidateRoutingMismatch:
      productionPayloadMismatch.exactCandidateRoutingMismatch,
    proposalDispositionEvidence:
      productionPayloadMismatch.proposalDispositionEvidence,
  },
  tamperCases: 4,
}, null, 2)}\n`);
