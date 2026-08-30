import { stableGraphHash, stableGraphValue } from
  "../graph/typed-facts-v2.mjs";

export const WARMACHINE_MATCHUP_TERMINAL_TRANSITION_PROGRESS_V1_SCHEMA =
  "warmachine_matchup_terminal_transition_progress_v1";

const TERMINAL_STATUSES = new Set(["in_progress", "completed", "failed"]);

function rows(value) {
  return Array.isArray(value) ? value : [];
}

function positiveInteger(value, fallback = 1) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function sealedProgressCore(raw = {}) {
  const committedState = stableGraphValue(raw.committedState || raw.initialState || {});
  const committedReceipts = stableGraphValue(rows(raw.committedReceipts));
  const rejectionEvidence = stableGraphValue(rows(raw.rejectionEvidence));
  const status = String(raw.status || "in_progress");
  return stableGraphValue({
    schemaVersion: WARMACHINE_MATCHUP_TERMINAL_TRANSITION_PROGRESS_V1_SCHEMA,
    executionKey: String(raw.executionKey || ""),
    activationGroupKey: String(raw.activationGroupKey || ""),
    executionReceiptHash: String(raw.executionReceiptHash || ""),
    initialStateHash: String(raw.initialStateHash || stableGraphHash(
      raw.initialState || committedState,
    )),
    status,
    disposition: status === "completed"
      ? "transition_sequence_completed"
      : status === "failed" ? "strict_rejected" : "",
    committedState,
    committedStateHash: stableGraphHash(committedState),
    committedReceipts,
    committedReceiptHashes: committedReceipts.map((receipt) =>
      String(receipt.receiptHash || "")),
    committedSelectionAudit: stableGraphValue(rows(
      raw.committedSelectionAudit,
    )),
    rejectionEvidence,
    rejectionEvidenceHashes: rejectionEvidence.map((entry) =>
      String(entry.evidenceHash || "")),
    committedTransitionCount: committedReceipts.length,
    attemptCount: nonNegativeInteger(raw.attemptCount,
      committedReceipts.length + rejectionEvidence.length),
    completed: status === "completed",
    failureReason: status === "failed" ? String(raw.failureReason || "") : "",
    resumeInitialGroup: stableGraphValue(raw.resumeInitialGroup || {}),
  });
}

function sealProgress(raw = {}) {
  const core = sealedProgressCore(raw);
  return { ...core, progressHash: stableGraphHash(core) };
}

export function buildWarmachineMatchupTerminalTransitionProgressV1(raw = {}) {
  const executionKey = String(raw.executionKey || "");
  const activationGroupKey = String(raw.activationGroupKey || "");
  const executionReceiptHash = String(raw.executionReceiptHash || "");
  if (!executionKey || !activationGroupKey || !executionReceiptHash) {
    throw new Error("matchup_terminal_transition_progress_identity_missing");
  }
  const status = String(raw.status || "in_progress");
  if (!TERMINAL_STATUSES.has(status)) {
    throw new Error("matchup_terminal_transition_progress_status_invalid");
  }
  return sealProgress({ ...raw, executionKey, activationGroupKey,
    executionReceiptHash, status });
}

export function auditWarmachineMatchupTerminalTransitionProgressV1(
  progress = {},
) {
  const issues = [];
  const declaredHash = String(progress.progressHash || "");
  const core = sealedProgressCore(progress);
  if (progress.schemaVersion !==
      WARMACHINE_MATCHUP_TERMINAL_TRANSITION_PROGRESS_V1_SCHEMA) {
    issues.push("transition_progress_schema_mismatch");
  }
  if (!declaredHash || stableGraphHash(core) !== declaredHash) {
    issues.push("transition_progress_hash_invalid");
  }
  if (!core.executionKey || !core.activationGroupKey ||
      !core.executionReceiptHash || !core.initialStateHash) {
    issues.push("transition_progress_identity_missing");
  }
  if (!TERMINAL_STATUSES.has(core.status)) {
    issues.push("transition_progress_status_invalid");
  }
  if (core.committedStateHash !== stableGraphHash(core.committedState)) {
    issues.push("transition_progress_state_hash_invalid");
  }
  if (core.committedTransitionCount !== core.committedReceipts.length ||
      stableGraphHash(core.committedReceiptHashes) !== stableGraphHash(
        core.committedReceipts.map((receipt) =>
          String(receipt.receiptHash || "")),
      ) || core.committedReceipts.some((receipt) =>
        receipt.transitionOk !== true || !receipt.receiptHash)) {
    issues.push("transition_progress_committed_receipts_invalid");
  }
  if ((!core.committedReceipts.length &&
       core.committedStateHash !== core.initialStateHash) ||
      (core.committedReceipts.length &&
       String(core.committedReceipts.at(-1)?.stateHashAfter || "") &&
       core.committedReceipts.at(-1).stateHashAfter !==
         core.committedStateHash) ||
      core.committedReceipts.some((receipt, index) => index > 0 &&
        receipt.stateHashBefore &&
        core.committedReceipts[index - 1].stateHashAfter &&
        receipt.stateHashBefore !==
          core.committedReceipts[index - 1].stateHashAfter)) {
    issues.push("transition_progress_receipt_state_chain_invalid");
  }
  if (core.rejectionEvidenceHashes.some((hash) => !hash) ||
      core.rejectionEvidence.some((entry) =>
        entry.receipt && entry.receipt.transitionOk !== false)) {
    issues.push("transition_progress_rejection_evidence_invalid");
  }
  if (core.status === "failed" &&
      (!core.failureReason || !core.rejectionEvidence.length)) {
    issues.push("transition_progress_failure_evidence_missing");
  }
  if (core.status !== "failed" &&
      (core.failureReason || core.rejectionEvidence.length)) {
    issues.push("transition_progress_nonfailure_rejection_leak");
  }
  if (core.attemptCount !== core.committedTransitionCount +
      core.rejectionEvidence.length) {
    issues.push("transition_progress_attempt_count_invalid");
  }
  return stableGraphValue({
    ok: issues.length === 0,
    issues: [...new Set(issues)].sort(),
    progressHash: declaredHash,
    status: core.status,
  });
}

function resultReceipts(result = {}) {
  const values = [
    ...rows(result.receipts),
    ...(result.receipt ? [result.receipt] : []),
  ];
  const seen = new Set();
  return values.filter((receipt) => {
    const key = String(receipt?.receiptHash || stableGraphHash(receipt || {}));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rejectionEvidence(result = {}, stateHashBefore = "", attemptIndex = 0) {
  const rejectedReceipts = [
    ...rows(result.rejectedReceipts),
    ...resultReceipts(result).filter((receipt) => receipt.transitionOk !== true),
  ];
  const receipt = rejectedReceipts[0] || null;
  const core = stableGraphValue({
    attemptIndex,
    stateHashBefore,
    reason: String(result.reason || "strict_transition_rejected"),
    receipt: receipt ? stableGraphValue(receipt) : null,
    receiptHash: String(receipt?.receiptHash || ""),
  });
  return { ...core, evidenceHash: stableGraphHash(core) };
}

export function executeWarmachineMatchupTerminalTransitionChunkV1(raw = {}) {
  const progress = raw.progress || {};
  const audit = auditWarmachineMatchupTerminalTransitionProgressV1(progress);
  if (!audit.ok) {
    throw new Error(`matchup_terminal_transition_progress_invalid:${
      audit.issues.join(",")}`);
  }
  if (progress.status !== "in_progress") return stableGraphValue(progress);
  if (typeof raw.runTransition !== "function") {
    throw new Error("matchup_terminal_transition_runner_required");
  }
  let current = progress;
  const maximumTransitionCount = positiveInteger(raw.maximumTransitionCount, 1);
  for (let index = 0; index < maximumTransitionCount; index += 1) {
    const stateHashBefore = current.committedStateHash;
    const result = raw.runTransition(structuredClone(current.committedState), {
      committedTransitionCount: current.committedTransitionCount,
      attemptCount: current.attemptCount,
      activationGroupKey: current.activationGroupKey,
      resumeInitialGroup: current.resumeInitialGroup,
    }) || {};
    const receipts = resultReceipts(result);
    if (result.ok !== true) {
      if (receipts.some((receipt) => receipt.transitionOk === true)) {
        throw new Error("matchup_terminal_transition_mixed_failure_chunk_not_atomic");
      }
      const rejected = rejectionEvidence(
        result,
        stateHashBefore,
        current.attemptCount,
      );
      current = sealProgress({
        ...current,
        status: "failed",
        failureReason: rejected.reason,
        rejectionEvidence: [...current.rejectionEvidence, rejected],
        attemptCount: current.attemptCount + 1,
      });
      break;
    }
    const committedReceipts = receipts.filter((receipt) =>
      receipt.transitionOk === true);
    if (!committedReceipts.length ||
        committedReceipts.length !== receipts.length ||
        rows(result.rejectedReceipts).length) {
      throw new Error("matchup_terminal_transition_success_receipt_invalid");
    }
    const nextState = stableGraphValue(
      result.normalizedState || result.state || {},
    );
    const declaredStateHash = String(
      committedReceipts.at(-1)?.stateHashAfter || "",
    );
    if (declaredStateHash && declaredStateHash !== stableGraphHash(nextState)) {
      throw new Error("matchup_terminal_transition_success_state_hash_mismatch");
    }
    const completed = result.completed === true;
    current = sealProgress({
      ...current,
      status: completed ? "completed" : "in_progress",
      committedState: nextState,
      committedReceipts: [
        ...current.committedReceipts,
        ...committedReceipts,
      ],
      committedSelectionAudit: [
        ...current.committedSelectionAudit,
        ...rows(result.selectionAudit),
      ],
      attemptCount: current.attemptCount + committedReceipts.length,
      resumeInitialGroup: result.resumeInitialGroup ||
        current.resumeInitialGroup,
    });
    if (completed) break;
  }
  return stableGraphValue(current);
}
