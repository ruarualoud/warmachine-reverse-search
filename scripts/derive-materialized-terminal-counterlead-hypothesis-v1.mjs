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

function settlementProjection(state = {}) {
  return stableGraphValue({
    score: state.scenario?.score || {},
    scoringHistory: state.scenario?.scoringHistory || [],
  });
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

function endingSideFromWindow(window = "") {
  return String(window).match(/^turn_end:(player1|player2)(?::|$)/)?.[1] || "";
}

function addScoringRow(settlement = {}, row = {}, firstPlayerSideKey = "player1") {
  assert.equal((settlement.scoringHistory || []).some((entry) =>
    entry.key === row.key), false, `duplicate scoring row: ${row.key}`);
  const turnOrder = firstPlayerSideKey === "player2"
    ? ["player2", "player1"]
    : ["player1", "player2"];
  const history = [...(settlement.scoringHistory || []), row]
    .map((entry, sourceIndex) => ({ entry, sourceIndex }))
    .sort((left, right) =>
      Number(left.entry.round || 0) - Number(right.entry.round || 0) ||
      turnOrder.indexOf(endingSideFromWindow(left.entry.scoringWindow)) -
        turnOrder.indexOf(endingSideFromWindow(right.entry.scoringWindow)) ||
      Number(left.entry.sequence || 0) - Number(right.entry.sequence || 0) ||
      left.sourceIndex - right.sourceIndex)
    .map(({ entry }, index) => stableGraphValue({
      ...entry,
      sequence: index + 1,
    }));
  const score = {
    ...(settlement.score || {}),
    [row.sideKey]: Number(settlement.score?.[row.sideKey] || 0) +
      Number(row.points || 0),
  };
  return stableGraphValue({ score, scoringHistory: history });
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
const checkpointPath = path.resolve(argumentValue("historical-checkpoint"));
const outputPath = path.resolve(argumentValue("output"));
assert.notEqual(bundlePath, path.resolve(""), "--bundle is required");
assert.notEqual(checkpointPath, path.resolve(""),
  "--historical-checkpoint is required");
assert.notEqual(outputPath, path.resolve(""), "--output is required");

const base = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
assert.equal((checkpoint.frontiers || []).length > 0, true,
  "historical checkpoint requires at least one frontier");
const runtime = structuredClone(base.runtime || {});
const sourceRoot = base.scenarioRefinement?.currentRoot ||
  base.report?.root || {};
const firstPlayerSideKey = String(
  runtime.predecessorState?.firstPlayerSideKey || "player1",
);
const hypothesis = stableGraphValue({
  hypothesisKey: "pressure-point-player2-round3-center-objective-counterlead-v1",
  scenarioKey: "pressure_point",
  round: 3,
  endingSideKey: "player1",
  scoringSideKey: "player2",
  points: 2,
  elementType: "objective",
  elementKey: "center-50",
  scoringWindow: "turn_end:player1",
  assumptionSource: "optimistic_proposal",
  strictHistoryRouteRequired: true,
  trainingTruth: false,
});
assert.equal(runtime.terminalState?.scenario?.scenarioKey, hypothesis.scenarioKey);
assert.equal(firstPlayerSideKey, "player2");
assert.equal(Number(runtime.terminalState?.turnNumber || 0) > hypothesis.round,
  true);

const hypothesisRow = stableGraphValue({
  key: `${hypothesis.round}:${hypothesis.scoringSideKey}:` +
    `${hypothesis.elementType}:${hypothesis.elementKey}:` +
    hypothesis.scoringWindow,
  round: hypothesis.round,
  sideKey: hypothesis.scoringSideKey,
  elementType: hypothesis.elementType,
  elementKey: hypothesis.elementKey,
  scoringWindow: hypothesis.scoringWindow,
  points: hypothesis.points,
  sourceActionType: "end_turn",
  sourceEventType: "steamroller_2026_turn_end_scoring",
  reason: "steamroller_2026_turn_end_scoring",
  sequence: 1,
});

const sourceTerminalAudit =
  auditWarmachineSteamrollerHistoricalSettlementV1(runtime.terminalState);
assert.equal(sourceTerminalAudit.ok, false,
  "counterlead rewrite requires a source route with premature scenario victory");
const terminalBaseSettlement = settlementProjection(runtime.predecessorState);
const terminalRefinedSettlement = addScoringRow(
  terminalBaseSettlement,
  hypothesisRow,
  firstPlayerSideKey,
);
const frontierBaseSettlement = settlementProjection(
  checkpoint.frontiers[0].state,
);
for (const [index, frontier] of checkpoint.frontiers.entries()) {
  assert.deepEqual(settlementProjection(frontier.state), frontierBaseSettlement,
    `historical frontier ${index} settlement differs from the shared base`);
  assert.equal(Number(frontier.state?.turnNumber || 0) > hypothesis.round, true,
    `historical frontier ${index} precedes the counterlead hypothesis`);
}
const frontierRefinedSettlement = addScoringRow(
  frontierBaseSettlement,
  hypothesisRow,
  firstPlayerSideKey,
);

for (const stateKey of [
  "predecessorState",
  "terminalState",
  "replayTerminalState",
]) {
  runtime[stateKey] = withSettlement(
    runtime[stateKey],
    terminalRefinedSettlement,
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
const refinedTerminalAudit =
  auditWarmachineSteamrollerHistoricalSettlementV1(runtime.terminalState);
assert.equal(refinedTerminalAudit.ok, true,
  JSON.stringify(refinedTerminalAudit.prematureScenarioVictories, null, 2));
assert.deepEqual(refinedTerminalAudit.observedScore, {
  player1: 4,
  player2: 2,
});

const primaryReplay = replayWarmachineMaterializedTerminalActivationV1({
  predecessorState: runtime.predecessorState,
  terminalState: runtime.terminalState,
  actionSequence: sourceRoot.actionSequence || [],
  actorPieceKey: sourceRoot.actorPieceKey,
  targetPieceKey: sourceRoot.targetPieceKey,
  routeKey: "counterlead-hypothesis-primary",
});
assert.equal(primaryReplay.ok, true,
  JSON.stringify(primaryReplay.failures, null, 2));
const independentReplay = replayWarmachineMaterializedTerminalActivationV1({
  predecessorState: runtime.predecessorState,
  terminalState: runtime.terminalState,
  actionSequence: sourceRoot.actionSequence || [],
  actorPieceKey: sourceRoot.actorPieceKey,
  targetPieceKey: sourceRoot.targetPieceKey,
  routeKey: "counterlead-hypothesis-independent",
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
currentRoot.currentHostIndependentStepwiseReplayHash =
  independentReplay.replayHash;
currentRoot.strictReplayCertified = true;

const refinementCore = stableGraphValue({
  ...(base.scenarioRefinement || {}),
  schemaVersion: "warmachine_materialized_terminal_counterlead_hypothesis_v1",
  authority: "typed_hypothesis_plus_rules_v1_terminal_replay",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  baseBundlePath: path.relative(process.cwd(), bundlePath),
  baseBundleHash: stableGraphHash(base),
  historicalCheckpointPath: path.relative(process.cwd(), checkpointPath),
  historicalCheckpointHash: stableGraphHash(checkpoint),
  priorScenarioRefinementHash: String(
    base.scenarioRefinement?.refinementHash || "",
  ),
  refinementMode: "historical_counterlead_obligation",
  sourceHistoricalSettlementAudit: sourceTerminalAudit,
  selectedCounterleadHypothesis: hypothesis,
  hypothesisScoringRow: hypothesisRow,
  historicalFrontierSettlementOverlay: {
    baseSettlement: frontierBaseSettlement,
    refinedSettlement: frontierRefinedSettlement,
    scoreDelta: { player1: 0, player2: 2 },
    addedRows: [hypothesisRow],
    exactCurrentHostCounterexample: false,
    unresolvedHistoricalObligation: true,
  },
  terminalSettlementRewrite: {
    baseSettlement: terminalBaseSettlement,
    refinedSettlement: terminalRefinedSettlement,
  },
  refinedHistoricalSettlementAudit: refinedTerminalAudit,
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
  claimBoundary: "The added round-three objective score is a typed reverse-search obligation, not an observed fact. It prevents the persisted four-point Cryx history from ending at 4-0, preserves the old action witnesses for fresh current-Host reissue, and becomes evidence only if earlier reverse layers prove the exact objective settlement and the complete deployment-to-terminal route independently strict-replays.",
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
  sourceScore: sourceTerminalAudit.observedScore,
  refinedScore: refinedTerminalAudit.observedScore,
  historicalFrontierBaseScore: frontierBaseSettlement.score,
  historicalFrontierRefinedScore: frontierRefinedSettlement.score,
  historicalFrontierCount: checkpoint.frontiers.length,
  counterleadHypothesisKey: hypothesis.hypothesisKey,
  unresolvedHistoricalObligation: true,
  prematureScenarioVictoryAbsent: true,
  terminalStrictReplayCertifiedTwice: true,
  predecessorStateHash: runtime.predecessorStateHash,
  terminalStateHash: runtime.terminalStateHash,
  refinementHash: output.scenarioRefinement.refinementHash,
  artifactHash: output.artifactHash,
  outputPath,
}, null, 2)}\n`);
