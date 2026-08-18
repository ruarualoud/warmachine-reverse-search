import assert from "node:assert/strict";
import {
  executeWarmachineMatchupTerminalReplayTransitionChunkV1,
  verifyWarmachineMatchupTerminalReplayTransitionProgressV1,
} from "../src/matchup/matchup-terminal-replay-transition-chunk-v1.mjs";

const initialState = { stateKey: "transition-chunk-start", counter: 0 };
const runner = (state, options) => {
  const next = { ...state, counter: Number(state.counter || 0) + 1 };
  const receipt = {
    receiptHash: `receipt-${next.counter}`,
    actionKey: `action-${next.counter}`,
    stateHashAfter: `state-${next.counter}`,
  };
  return {
    ok: true,
    completed: next.counter >= 3,
    state: next,
    receipts: [receipt],
    selectionAudit: [{ stepIndex: options.priorTransitionCount, actionKey: receipt.actionKey }],
  };
};

const first = executeWarmachineMatchupTerminalReplayTransitionChunkV1({
  candidateKey: "candidate-a",
  activationGroupKey: "group-a",
  initialStateHash: "initial-hash",
  initialState,
  maximumTransitionCount: 1,
  upstreamReceiptHash: "host-hash",
  runActivationTransitionChunk: runner,
});
assert.equal(first.kind, "in_progress");
assert.equal(first.progress.transitionCount, 1);
assert.equal(first.progress.currentState.counter, 1);
assert.equal(verifyWarmachineMatchupTerminalReplayTransitionProgressV1(first.progress, {
  candidateKey: "candidate-a",
  activationGroupKey: "group-a",
  initialStateHash: "initial-hash",
}).ok, true);

const second = executeWarmachineMatchupTerminalReplayTransitionChunkV1({
  candidateKey: "candidate-a",
  activationGroupKey: "group-a",
  initialStateHash: "initial-hash",
  progress: first.progress,
  maximumTransitionCount: 1,
  upstreamReceiptHash: "host-hash",
  runActivationTransitionChunk: runner,
});
assert.equal(second.kind, "in_progress");
assert.equal(second.progress.transitionCount, 2);
assert.equal(second.progress.currentState.counter, 2);
assert.deepEqual(second.progress.accumulatedReceiptHashes, ["receipt-1", "receipt-2"]);

const completed = executeWarmachineMatchupTerminalReplayTransitionChunkV1({
  candidateKey: "candidate-a",
  activationGroupKey: "group-a",
  initialStateHash: "initial-hash",
  progress: second.progress,
  maximumTransitionCount: 1,
  upstreamReceiptHash: "host-hash",
  runActivationTransitionChunk: runner,
});
assert.equal(completed.kind, "completed");
assert.equal(completed.progress.completed, true);
assert.equal(completed.progress.transitionCount, 3);

const tampered = structuredClone(second.progress);
tampered.currentState.counter = 99;
const rejected = executeWarmachineMatchupTerminalReplayTransitionChunkV1({
  candidateKey: "candidate-a",
  activationGroupKey: "group-a",
  initialStateHash: "initial-hash",
  progress: tampered,
  runActivationTransitionChunk: runner,
});
assert.equal(rejected.kind, "invalid_progress");

console.log(JSON.stringify({
  ok: true,
  firstProgressHash: first.progress.progressHash,
  secondProgressHash: second.progress.progressHash,
  completedProgressHash: completed.progress.progressHash,
  transitionCounts: [first.progress.transitionCount, second.progress.transitionCount, completed.progress.transitionCount],
}, null, 2));
