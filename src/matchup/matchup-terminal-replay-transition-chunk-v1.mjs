import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_MATCHUP_TERMINAL_REPLAY_TRANSITION_CHUNK_V1_SCHEMA =
  "warmachine_matchup_terminal_replay_transition_chunk_v1";

function asRows(value) {
  return Array.isArray(value) ? value : [];
}

function asPositiveInteger(value, fallback = 1) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sealedProgressCore(input = {}) {
  const state = input.currentState || input.state || {};
  const accumulatedReceipts = input.accumulatedReceipts || [];
  const accumulatedSelectionAudit = input.accumulatedSelectionAudit || [];
  return {
    schemaVersion: WARMACHINE_MATCHUP_TERMINAL_REPLAY_TRANSITION_CHUNK_V1_SCHEMA,
    candidateKey: String(input.candidateKey || ""),
    activationGroupKey: String(input.activationGroupKey || ""),
    initialStateHash: String(input.initialStateHash || ""),
    currentState: stableGraphValue(state),
    currentStateHash: stableGraphHash(state),
    accumulatedReceipts: stableGraphValue(asRows(accumulatedReceipts)),
    accumulatedReceiptHashes: asRows(accumulatedReceipts).map((row) =>
      String(row?.receiptHash || "")),
    accumulatedSelectionAudit: stableGraphValue(asRows(accumulatedSelectionAudit)),
    transitionCount: Number(input.transitionCount || 0),
    completed: input.completed === true,
    failureReason: String(input.failureReason || ""),
    upstreamReceiptHash: String(input.upstreamReceiptHash || ""),
  };
}

export function buildWarmachineMatchupTerminalReplayTransitionProgressV1(input = {}) {
  const core = sealedProgressCore(input);
  return stableGraphValue({ ...core, progressHash: stableGraphHash(core) });
}

export function verifyWarmachineMatchupTerminalReplayTransitionProgressV1(progress = {}, expected = {}) {
  const core = sealedProgressCore(progress);
  const actualHash = stableGraphHash(core);
  const expectedHash = String(progress.progressHash || "");
  const expectedCandidateKey = String(expected.candidateKey || "");
  const expectedActivationGroupKey = String(expected.activationGroupKey || "");
  const expectedInitialStateHash = String(expected.initialStateHash || "");
  return stableGraphValue({
    ok: progress?.schemaVersion === WARMACHINE_MATCHUP_TERMINAL_REPLAY_TRANSITION_CHUNK_V1_SCHEMA &&
      expectedHash === actualHash &&
      (!expectedCandidateKey || core.candidateKey === expectedCandidateKey) &&
      (!expectedActivationGroupKey || core.activationGroupKey === expectedActivationGroupKey) &&
      (!expectedInitialStateHash || core.initialStateHash === expectedInitialStateHash),
    expectedHash,
    actualHash,
    candidateKey: core.candidateKey,
    activationGroupKey: core.activationGroupKey,
    initialStateHash: core.initialStateHash,
    transitionCount: core.transitionCount,
  });
}

export function executeWarmachineMatchupTerminalReplayTransitionChunkV1(input = {}) {
  const runner = input.runActivationTransitionChunk;
  if (typeof runner !== "function") {
    throw new Error("matchup_terminal_replay_transition_runner_required");
  }
  const candidateKey = String(input.candidateKey || "");
  const activationGroupKey = String(input.activationGroupKey || "");
  const existing = input.progress || null;
  const verification = existing
    ? verifyWarmachineMatchupTerminalReplayTransitionProgressV1(existing, {
      candidateKey,
      activationGroupKey,
      initialStateHash: input.initialStateHash,
    })
    : { ok: true };
  if (!verification.ok) {
    return stableGraphValue({
      kind: "invalid_progress",
      reason: "replay_transition_progress_integrity_failed",
      verification,
    });
  }

  const priorReceipts = asRows(existing?.accumulatedReceipts);
  const priorSelectionAudit = asRows(existing?.accumulatedSelectionAudit);
  const state = existing?.currentState || input.initialState || {};
  const result = runner(state, {
    maximumTransitionCount: asPositiveInteger(input.maximumTransitionCount, 1),
    priorTransitionCount: Number(existing?.transitionCount || 0),
    candidateKey,
    activationGroupKey,
  }) || {};
  const currentReceipts = asRows(result.receipts);
  const currentSelectionAudit = asRows(result.selectionAudit);
  const accumulatedReceipts = [...priorReceipts, ...currentReceipts];
  const accumulatedSelectionAudit = [...priorSelectionAudit, ...currentSelectionAudit];
  const currentState = result.state || state;
  const completed = result.completed === true;
  const failureReason = result.ok === false && !completed && !currentReceipts.length
    ? String(result.reason || "strict_transition_chunk_rejected")
    : "";
  const progress = buildWarmachineMatchupTerminalReplayTransitionProgressV1({
    candidateKey,
    activationGroupKey,
    initialStateHash: input.initialStateHash,
    state: currentState,
    accumulatedReceipts,
    accumulatedSelectionAudit,
    transitionCount: accumulatedReceipts.length,
    completed,
    failureReason,
    upstreamReceiptHash: input.upstreamReceiptHash,
  });
  return stableGraphValue({
    kind: completed ? "completed" : failureReason ? "failed" : "in_progress",
    progress,
    transitionChunk: stableGraphValue({
      priorTransitionCount: Number(existing?.transitionCount || 0),
      currentTransitionCount: currentReceipts.length,
      accumulatedTransitionCount: accumulatedReceipts.length,
      maximumTransitionCount: asPositiveInteger(input.maximumTransitionCount, 1),
      completed,
      failureReason,
    }),
    execution: stableGraphValue({
      ...result,
      receipts: accumulatedReceipts,
      selectionAudit: accumulatedSelectionAudit,
      state: currentState,
    }),
  });
}
