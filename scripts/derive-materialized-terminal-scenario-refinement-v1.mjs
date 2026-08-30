#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import { replayWarmachineMaterializedTerminalActivationV1 } from
  "../src/reverse/materialized-terminal-root-to-deployment-v1.mjs";
import { auditWarmachineSteamrollerHistoricalSettlementV1 } from
  "../src/reverse/steamroller-historical-settlement-audit-v1.mjs";
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

function scenarioSettlementProjection(state = {}) {
  return stableGraphValue({
    score: state.scenario?.score || {},
    scoringHistory: state.scenario?.scoringHistory || [],
  });
}

function withScenarioSettlement(stateInput = {}, settlement = {}) {
  const state = structuredClone(stateInput);
  state.scenario = {
    ...(state.scenario || {}),
    score: structuredClone(settlement.score || {}),
    scoringHistory: structuredClone(settlement.scoringHistory || []),
  };
  return state;
}

function scoreDelta(expected = {}, executed = {}) {
  const sideKeys = [...new Set([
    ...Object.keys(expected.score || {}),
    ...Object.keys(executed.score || {}),
  ])].sort();
  return Object.fromEntries(sideKeys.map((sideKey) => [
    sideKey,
    Number(executed.score?.[sideKey] || 0) -
      Number(expected.score?.[sideKey] || 0),
  ]));
}

function cumulativeSettlement(base = {}, expected = {}, executed = {}) {
  const expectedRows = expected.scoringHistory || [];
  const executedRows = executed.scoringHistory || [];
  const expectedByKey = new Map(expectedRows.map((row) => [row.key, row]));
  const executedByKey = new Map(executedRows.map((row) => [row.key, row]));
  const removedKeys = [...expectedByKey.keys()].filter((key) =>
    !executedByKey.has(key));
  assert.deepEqual(removedKeys, [],
    "cumulative refinement may not remove historical scoring rows");
  for (const [key, row] of expectedByKey) {
    assert.equal(stableGraphHash(row), stableGraphHash(executedByKey.get(key)),
      `cumulative refinement may not mutate existing scoring row ${key}`);
  }
  const addedRows = executedRows.filter((row) => !expectedByKey.has(row.key));
  assert.equal(addedRows.length > 0, true,
    "cumulative refinement requires at least one strict scoring row");
  const baseKeys = new Set((base.scoringHistory || []).map((row) => row.key));
  assert.equal(addedRows.every((row) => !baseKeys.has(row.key)), true,
    "cumulative refinement may not duplicate an existing terminal ledger row");
  const delta = scoreDelta(expected, executed);
  assert.equal(Object.values(delta).every((value) =>
    Number.isInteger(value) && value >= 0), true,
  "cumulative refinement only accepts nonnegative exact score additions");
  const history = [...addedRows, ...(base.scoringHistory || [])]
    .map((row, sourceIndex) => ({ row, sourceIndex }))
    .sort((left, right) =>
      Number(left.row.round || 0) - Number(right.row.round || 0) ||
      Number(left.row.sequence || 0) - Number(right.row.sequence || 0) ||
      left.sourceIndex - right.sourceIndex)
    .map(({ row }, index) => stableGraphValue({ ...row, sequence: index + 1 }));
  const sideKeys = [...new Set([
    ...Object.keys(base.score || {}),
    ...Object.keys(delta),
  ])].sort();
  return {
    settlement: stableGraphValue({
      score: Object.fromEntries(sideKeys.map((sideKey) => [
        sideKey,
        Number(base.score?.[sideKey] || 0) + Number(delta[sideKey] || 0),
      ])),
      scoringHistory: history,
    }),
    addedRows: stableGraphValue(addedRows),
    scoreDelta: stableGraphValue(delta),
  };
}

function actionSequenceWithReceipts(sequence = [], receipts = []) {
  assert.equal(receipts.length, sequence.length,
    "fresh terminal replay receipt count must match action sequence");
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
const diagnosticsPath = path.resolve(argumentValue("diagnostics"));
const outputPath = path.resolve(argumentValue("output"));
assert.notEqual(bundlePath, path.resolve(""), "--bundle is required");
assert.notEqual(diagnosticsPath, path.resolve(""), "--diagnostics is required");
assert.notEqual(outputPath, path.resolve(""), "--output is required");

const base = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
const diagnostics = JSON.parse(fs.readFileSync(diagnosticsPath, "utf8"));
const rejected = (diagnostics.searchRejected || []).filter((row) =>
  row.stageKey === "previous_turn_end" &&
  row.reason === "strict_previous_turn_end_successor_does_not_match");
assert.equal(rejected.length > 0, true,
  "a strict previous-turn end mismatch is required");
for (const row of rejected) {
  assert.equal((row.semanticDifferences || []).length > 0, true,
    "strict mismatch must contain semantic differences");
  assert.equal((row.semanticDifferences || []).every((difference) =>
    /^scenario\.(score|scoringHistory)(\.|$)/.test(String(difference.path || ""))), true,
  "scenario refinement may only repair score and scoring-history differences");
}

const diagnosticPairs = (diagnostics.searchRuntimeDiagnostics || [])
  .filter((row) => row.stageKey === "previous_turn_end" &&
    row.expectedSuccessorState && row.executedSuccessorState)
  .map((row) => ({
    actionKey: String(row.actionKey || ""),
    expectedStateHash: warmachineReverseStateSemanticHashV1(
      row.expectedSuccessorState,
    ),
    executedStateHash: warmachineReverseStateSemanticHashV1(
      row.executedSuccessorState,
    ),
    expectedSettlement: scenarioSettlementProjection(row.expectedSuccessorState),
    executedSettlement: scenarioSettlementProjection(row.executedSuccessorState),
    executedTerminalFields: stableGraphValue({
      gameOver: row.executedSuccessorState.gameOver ?? null,
      terminal: row.executedSuccessorState.terminal ?? null,
      terminalReason: row.executedSuccessorState.terminalReason ?? "",
      winnerSideKey: row.executedSuccessorState.winnerSideKey ?? "",
    }),
  }));
assert.equal(diagnosticPairs.length > 0, true,
  "runtime diagnostics with exact successor states are required");
const pairHashes = [...new Set(diagnosticPairs.map((row) => stableGraphHash({
  expectedSettlement: row.expectedSettlement,
  executedSettlement: row.executedSettlement,
})))]
assert.equal(pairHashes.length, 1,
  "scenario refinement requires one unambiguous settlement difference");

const source = diagnosticPairs[0];
assert.equal(stableGraphHash(source.expectedSettlement) !==
  stableGraphHash(source.executedSettlement), true,
"scenario refinement must change the settlement projection");
assert.equal(Boolean(source.executedTerminalFields.gameOver), false,
  "mandatory intermediate settlement may not already end the game");
assert.equal(Boolean(source.executedTerminalFields.terminal), false,
  "mandatory intermediate settlement may not already be terminal");
assert.equal(Boolean(source.executedTerminalFields.winnerSideKey), false,
  "mandatory intermediate settlement may not already declare a winner");

const runtime = structuredClone(base.runtime || {});
const baseRuntimeSettlement = scenarioSettlementProjection(
  runtime.predecessorState,
);
for (const stateKey of ["terminalState", "replayTerminalState"]) {
  assert.equal(stableGraphHash(scenarioSettlementProjection(runtime[stateKey])),
    stableGraphHash(baseRuntimeSettlement),
  `base runtime terminal states must share one scenario settlement: ${stateKey}`);
}
const directReplacement = stableGraphHash(baseRuntimeSettlement) ===
  stableGraphHash(source.expectedSettlement);
const cumulative = directReplacement
  ? {
    settlement: source.executedSettlement,
    addedRows: source.executedSettlement.scoringHistory.filter((row) =>
      !(source.expectedSettlement.scoringHistory || []).some((expectedRow) =>
        expectedRow.key === row.key)),
    scoreDelta: scoreDelta(source.expectedSettlement, source.executedSettlement),
  }
  : cumulativeSettlement(
    baseRuntimeSettlement,
    source.expectedSettlement,
    source.executedSettlement,
  );
for (const stateKey of [
  "predecessorState",
  "terminalState",
  "replayTerminalState",
]) {
  runtime[stateKey] = withScenarioSettlement(
    runtime[stateKey],
    cumulative.settlement,
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
const historicalSettlementAudit =
  auditWarmachineSteamrollerHistoricalSettlementV1(runtime.terminalState);
assert.equal(historicalSettlementAudit.ok, true,
  `scenario refinement would preserve an earlier scenario victory: ${
    JSON.stringify(historicalSettlementAudit.prematureScenarioVictories)}`);

const baseRoot = base.scenarioRefinement?.currentRoot || base.report?.root || {};
const primaryReplay = replayWarmachineMaterializedTerminalActivationV1({
  predecessorState: runtime.predecessorState,
  terminalState: runtime.terminalState,
  actionSequence: baseRoot.actionSequence || [],
  actorPieceKey: baseRoot.actorPieceKey,
  targetPieceKey: baseRoot.targetPieceKey,
  routeKey: "scenario-refinement-primary-current-host",
});
assert.equal(primaryReplay.ok, true, JSON.stringify(primaryReplay.failures, null, 2));
const independentReplay = replayWarmachineMaterializedTerminalActivationV1({
  predecessorState: runtime.predecessorState,
  terminalState: runtime.terminalState,
  actionSequence: baseRoot.actionSequence || [],
  actorPieceKey: baseRoot.actorPieceKey,
  targetPieceKey: baseRoot.targetPieceKey,
  routeKey: "scenario-refinement-independent-current-host",
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

const currentRoot = structuredClone(baseRoot);
currentRoot.predecessorStateHash = runtime.predecessorStateHash;
currentRoot.terminalStateHash = runtime.terminalStateHash;
currentRoot.replayTerminalStateHash = runtime.replayTerminalStateHash;
currentRoot.terminalCandidateSemanticHashes = [runtime.terminalStateHash];
currentRoot.actionSequence = actionSequenceWithReceipts(
  baseRoot.actionSequence || [],
  primaryReplay.receipts,
);
currentRoot.fatalActionReceiptHash = receiptForAction(
  baseRoot.actionSequence,
  primaryReplay.receipts,
  baseRoot.fatalActionKey,
);
currentRoot.replayFatalActionReceiptHash = receiptForAction(
  baseRoot.actionSequence,
  independentReplay.receipts,
  baseRoot.fatalActionKey,
);
currentRoot.fatalDamageCommitReceiptHash = receiptForAction(
  baseRoot.actionSequence,
  primaryReplay.receipts,
  baseRoot.fatalDamageCommitActionKey,
);
currentRoot.replayFatalDamageCommitReceiptHash = receiptForAction(
  baseRoot.actionSequence,
  independentReplay.receipts,
  baseRoot.fatalDamageCommitActionKey,
);
currentRoot.receiptHash = String(primaryReplay.receipts.at(-1)?.receiptHash || "");
currentRoot.replayReceiptHash = String(
  independentReplay.receipts.at(-1)?.receiptHash || "",
);
delete currentRoot.primaryActivationReceiptHash;
delete currentRoot.replayActivationReceiptHash;
currentRoot.currentHostStepwiseReplayHash = primaryReplay.replayHash;
currentRoot.currentHostIndependentStepwiseReplayHash = independentReplay.replayHash;
currentRoot.strictReplayCertified = true;

const refinementCore = stableGraphValue({
  schemaVersion: "warmachine_materialized_terminal_scenario_refinement_v1",
  authority: "rules_v1_current_host_strict_execution",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  baseBundlePath: path.relative(process.cwd(), bundlePath),
  baseBundleHash: stableGraphHash(base),
  baseReportHash: String(base.report?.reportHash || ""),
  sourceDiagnosticsPath: path.relative(process.cwd(), diagnosticsPath),
  sourceDiagnosticsHash: stableGraphHash(diagnostics),
  rejectedHypothesis: {
    settlement: baseRuntimeSettlement,
    rejectionCount: rejected.length,
    rejectionHashes: rejected.map((row) => stableGraphHash(row)),
  },
  refinedHypothesis: {
    settlement: cumulative.settlement,
    sourceActionKey: source.actionKey,
    sourceExpectedStateHash: source.expectedStateHash,
    sourceExecutedStateHash: source.executedStateHash,
    intermediateSettlementWasNonterminal: true,
  },
  historicalFrontierSettlementOverlay: {
    sourceExpectedStateHash: source.expectedStateHash,
    sourceExecutedStateHash: source.executedStateHash,
    baseSettlement: source.expectedSettlement,
    refinedSettlement: source.executedSettlement,
    scoreDelta: cumulative.scoreDelta,
    addedRows: cumulative.addedRows,
    exactCurrentHostCounterexample: true,
  },
  refinementMode: directReplacement
    ? "direct_settlement_replacement"
    : "cumulative_historical_settlement_delta",
  priorScenarioRefinementHash: String(
    base.scenarioRefinement?.refinementHash || "",
  ),
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
  historicalSettlementAudit,
  baseCandidateLedgerRetainedAsProvenanceOnly: true,
  currentScenarioCandidateLedgerReissued: false,
  trainingTruth: false,
  claimBoundary: "This variant changes only score and scoring history using one strict current-Host previous-turn counterexample. When the counterexample belongs to an earlier historical turn, its exact score delta and rows are accumulated into the later terminal ledger, while the corresponding historical frontier receives only the executed earlier-turn settlement. The unchanged terminal action sequence is replayed twice. Other route labels, deployment reachability, strategy value and training truth remain unproven.",
});
const outputCore = {
  ...structuredClone(base),
  schemaVersion: refinementCore.schemaVersion,
  runtime,
  scenarioRefinement: {
    ...refinementCore,
    refinementHash: stableGraphHash(refinementCore),
  },
};
const output = stableGraphValue({
  ...outputCore,
  artifactHash: stableGraphHash(stableGraphValue(outputCore)),
});
writeJsonAtomic(outputPath, output);

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion: output.schemaVersion,
  refinementMode: output.scenarioRefinement.refinementMode,
  baseScore: baseRuntimeSettlement.score,
  refinedScore: cumulative.settlement.score,
  historicalFrontierBaseScore: source.expectedSettlement.score,
  historicalFrontierRefinedScore: source.executedSettlement.score,
  appendedScoringRowCount:
    cumulative.addedRows.length,
  terminalStrictReplayCertifiedTwice: true,
  predecessorStateHash: runtime.predecessorStateHash,
  terminalStateHash: runtime.terminalStateHash,
  refinementHash: output.scenarioRefinement.refinementHash,
  artifactHash: output.artifactHash,
  outputPath,
}, null, 2)}\n`);
