#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import { replayWarmachineMaterializedTerminalActivationV1 } from
  "../src/reverse/materialized-terminal-root-to-deployment-v1.mjs";
import {
  auditWarmachineSteamrollerHistoricalSettlementV1,
  proposeWarmachineSteamrollerHistoricalSettlementRepairsV1,
} from "../src/reverse/steamroller-historical-settlement-audit-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

function argumentValue(name, fallback = "") {
  return process.argv.find((argument) =>
    argument.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
}

function writeJsonAtomic(targetPath, value) {
  const target = path.resolve(targetPath);
  const directory = path.dirname(target);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx");
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, target);
    const directoryDescriptor = fs.openSync(directory, "r");
    try {
      fs.fsyncSync(directoryDescriptor);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  }
}

function withSettlement(stateInput = {}, settlement = {}) {
  const state = structuredClone(stateInput);
  state.scenario = {
    ...(state.scenario || {}),
    score: structuredClone(settlement.score || {}),
    scoringHistory: structuredClone(settlement.scoringHistory || []),
  };
  return state;
}

function actionSequenceWithReceipts(sequence = [], receipts = []) {
  assert.equal(receipts.length, sequence.length,
    "terminal replay receipt count must match action sequence");
  return sequence.map((action, index) => stableGraphValue({
    ...action,
    receiptHash: String(receipts[index]?.receiptHash || ""),
  }));
}

function receiptForAction(sequence = [], receipts = [], actionKey = "") {
  const index = sequence.findIndex((row) => row.actionKey === actionKey);
  return index >= 0 ? String(receipts[index]?.receiptHash || "") : "";
}

const bundlePath = path.resolve(argumentValue("bundle"));
const outputPath = path.resolve(argumentValue("output"));
const requestedCandidateKey = argumentValue("candidate-key", "");
assert.notEqual(bundlePath, path.resolve(""), "--bundle is required");
assert.notEqual(outputPath, path.resolve(""), "--output is required");

const base = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
const runtime = structuredClone(base.runtime || {});
const sourceAudit = auditWarmachineSteamrollerHistoricalSettlementV1(
  runtime.terminalState,
);
assert.equal(sourceAudit.ok, false,
  "settlement-hypothesis repair requires a premature scenario victory");
const proposals = proposeWarmachineSteamrollerHistoricalSettlementRepairsV1(
  runtime.terminalState,
);
assert.equal(proposals.candidateCount > 0, true,
  "no finite nonterminal settlement hypothesis was generated");
const selected = requestedCandidateKey
  ? proposals.candidates.find((candidate) =>
    candidate.candidateKey === requestedCandidateKey)
  : proposals.candidates[0];
assert.ok(selected, `unknown settlement repair candidate: ${requestedCandidateKey}`);

for (const stateKey of [
  "predecessorState",
  "terminalState",
  "replayTerminalState",
]) {
  runtime[stateKey] = withSettlement(
    runtime[stateKey],
    selected.retainedSettlement,
  );
}
runtime.predecessorStateHash = warmachineReverseStateSemanticHashV1(
  runtime.predecessorState,
);
runtime.terminalStateHash = warmachineReverseStateSemanticHashV1(
  runtime.terminalState,
);
runtime.replayTerminalStateHash = warmachineReverseStateSemanticHashV1(
  runtime.replayTerminalState,
);
const retainedSettlementAudit =
  auditWarmachineSteamrollerHistoricalSettlementV1(runtime.terminalState);
assert.equal(retainedSettlementAudit.ok, true,
  JSON.stringify(retainedSettlementAudit.prematureScenarioVictories));

const sourceRoot = base.scenarioRefinement?.currentRoot || base.report?.root || {};
const primaryReplay = replayWarmachineMaterializedTerminalActivationV1({
  predecessorState: runtime.predecessorState,
  terminalState: runtime.terminalState,
  actionSequence: sourceRoot.actionSequence || [],
  actorPieceKey: sourceRoot.actorPieceKey,
  targetPieceKey: sourceRoot.targetPieceKey,
  routeKey: "valid-settlement-hypothesis-primary",
});
assert.equal(primaryReplay.ok, true, JSON.stringify(primaryReplay.failures, null, 2));
const independentReplay = replayWarmachineMaterializedTerminalActivationV1({
  predecessorState: runtime.predecessorState,
  terminalState: runtime.terminalState,
  actionSequence: sourceRoot.actionSequence || [],
  actorPieceKey: sourceRoot.actorPieceKey,
  targetPieceKey: sourceRoot.targetPieceKey,
  routeKey: "valid-settlement-hypothesis-independent",
});
assert.equal(independentReplay.ok, true,
  JSON.stringify(independentReplay.failures, null, 2));
assert.equal(primaryReplay.observedTerminalStateHash,
  independentReplay.observedTerminalStateHash);

runtime.primaryReceiptHashes = primaryReplay.receipts.map((receipt) =>
  receipt.receiptHash);
runtime.replayReceiptHashes = independentReplay.receipts.map((receipt) =>
  receipt.receiptHash);
runtime.primaryReceiptCount = runtime.primaryReceiptHashes.length;
runtime.replayReceiptCount = runtime.replayReceiptHashes.length;

const currentRoot = structuredClone(sourceRoot);
currentRoot.predecessorStateHash = runtime.predecessorStateHash;
currentRoot.terminalStateHash = runtime.terminalStateHash;
currentRoot.replayTerminalStateHash = runtime.replayTerminalStateHash;
currentRoot.terminalCandidateSemanticHashes = [runtime.terminalStateHash];
currentRoot.actionSequence = actionSequenceWithReceipts(
  sourceRoot.actionSequence || [],
  primaryReplay.receipts,
);
for (const [field, actionKey] of [
  ["fatalActionReceiptHash", sourceRoot.fatalActionKey],
  ["fatalDamageCommitReceiptHash", sourceRoot.fatalDamageCommitActionKey],
]) {
  currentRoot[field] = receiptForAction(
    sourceRoot.actionSequence,
    primaryReplay.receipts,
    actionKey,
  );
}
for (const [field, actionKey] of [
  ["replayFatalActionReceiptHash", sourceRoot.fatalActionKey],
  ["replayFatalDamageCommitReceiptHash", sourceRoot.fatalDamageCommitActionKey],
]) {
  currentRoot[field] = receiptForAction(
    sourceRoot.actionSequence,
    independentReplay.receipts,
    actionKey,
  );
}
currentRoot.receiptHash = String(primaryReplay.receipts.at(-1)?.receiptHash || "");
currentRoot.replayReceiptHash = String(
  independentReplay.receipts.at(-1)?.receiptHash || "",
);
currentRoot.currentHostStepwiseReplayHash = primaryReplay.replayHash;
currentRoot.currentHostIndependentStepwiseReplayHash = independentReplay.replayHash;
currentRoot.strictReplayCertified = true;

const refinementCore = stableGraphValue({
  ...(base.scenarioRefinement || {}),
  schemaVersion: "warmachine_materialized_terminal_valid_settlement_hypothesis_v1",
  authority: "finite_hypothesis_plus_rules_v1_terminal_replay",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  baseBundlePath: path.relative(process.cwd(), bundlePath),
  baseBundleHash: stableGraphHash(base),
  priorScenarioRefinementHash: String(
    base.scenarioRefinement?.refinementHash || "",
  ),
  refinementMode: "premature_scenario_victory_settlement_hypothesis",
  sourceHistoricalSettlementAudit: sourceAudit,
  settlementRepairProposalSet: proposals,
  selectedSettlementRepair: selected,
  retainedHistoricalSettlementAudit: retainedSettlementAudit,
  currentRoot,
  currentRuntimeStateHashes: {
    predecessorStateHash: runtime.predecessorStateHash,
    terminalStateHash: runtime.terminalStateHash,
    replayTerminalStateHash: runtime.replayTerminalStateHash,
  },
  currentHostReplay: {
    primaryReplayHash: primaryReplay.replayHash,
    independentReplayHash: independentReplay.replayHash,
    primaryReceiptHashes: runtime.primaryReceiptHashes,
    independentReceiptHashes: runtime.replayReceiptHashes,
    strictReplayCertifiedTwice: true,
    priorReceiptHashesConsultedForExecution: false,
  },
  currentScenarioCandidateLedgerReissued: false,
  trainingTruth: false,
  claimBoundary: "The selected score-row removal is a finite search hypothesis chosen only to avoid an already-proven premature terminal. It becomes evidence only if reverse search reaches a legal deployment and the entire route independently strict-replays with the retained ledger.",
});
const reportCore = stableGraphValue({
  ...(base.report || {}),
  root: currentRoot,
});
delete reportCore.reportHash;
const outputCore = {
  ...structuredClone(base),
  schemaVersion: refinementCore.schemaVersion,
  runtime,
  report: {
    ...reportCore,
    reportHash: stableGraphHash(reportCore),
  },
  scenarioRefinement: {
    ...refinementCore,
    refinementHash: stableGraphHash(refinementCore),
  },
};
delete outputCore.artifactHash;
const output = stableGraphValue({
  ...outputCore,
  artifactHash: stableGraphHash(stableGraphValue(outputCore)),
});
writeJsonAtomic(outputPath, output);

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion: output.schemaVersion,
  sourceScore: sourceAudit.observedScore,
  selectedCandidateKey: selected.candidateKey,
  removedLedgerKeys: selected.removedLedgerKeys,
  retainedScore: selected.retainedSettlement.score,
  alternateCandidateCount: proposals.candidateCount - 1,
  terminalStrictReplayCertifiedTwice: true,
  predecessorStateHash: runtime.predecessorStateHash,
  terminalStateHash: runtime.terminalStateHash,
  refinementHash: output.scenarioRefinement.refinementHash,
  artifactHash: output.artifactHash,
  outputPath,
}, null, 2)}\n`);
