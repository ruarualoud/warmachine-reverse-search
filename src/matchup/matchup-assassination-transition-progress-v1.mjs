import { stableGraphHash, stableGraphValue } from
  "../graph/typed-facts-v2.mjs";
import {
  auditWarmachineMatchupTerminalCandidateProgressV1,
} from "./matchup-terminal-candidate-ledger-v1.mjs";
import {
  auditWarmachineMatchupTerminalTransitionProgressV1,
} from "./matchup-terminal-transition-recovery-v1.mjs";

export const WARMACHINE_MATCHUP_ASSASSINATION_TRANSITION_PROGRESS_V1_SCHEMA =
  "warmachine_matchup_assassination_transition_progress_v1";

function coreFor(raw = {}) {
  return stableGraphValue({
    schemaVersion:
      WARMACHINE_MATCHUP_ASSASSINATION_TRANSITION_PROGRESS_V1_SCHEMA,
    taskKey: String(raw.taskKey || ""),
    behaviorSignatureHash: String(raw.behaviorSignatureHash || ""),
    executionReceiptHash: String(raw.executionReceiptHash || ""),
    candidatePlan: stableGraphValue(raw.candidatePlan || {}),
    candidateProgress: stableGraphValue(raw.candidateProgress || {}),
    activeSlotIndex: Number(raw.activeSlotIndex),
    activeCandidateIdentityHash: String(
      raw.activeCandidateIdentityHash || "",
    ),
    completedActionLines: stableGraphValue(raw.completedActionLines || []),
    actionLineIndex: Number(raw.actionLineIndex),
    actionLineIdentityHash: String(raw.actionLineIdentityHash || ""),
    phase: String(raw.phase || ""),
    primaryProgress: stableGraphValue(raw.primaryProgress || {}),
    replayProgress: raw.replayProgress
      ? stableGraphValue(raw.replayProgress)
      : null,
  });
}

export function buildWarmachineMatchupAssassinationTransitionProgressV1(
  raw = {},
) {
  const core = coreFor(raw);
  const audit = auditWarmachineMatchupAssassinationTransitionProgressV1({
    ...core,
    progressHash: stableGraphHash(core),
  });
  if (!audit.ok) {
    throw new Error(`assassination_transition_progress_invalid:${
      audit.issues.join(",")}`);
  }
  return { ...core, progressHash: stableGraphHash(core) };
}

export function auditWarmachineMatchupAssassinationTransitionProgressV1(
  progress = {},
) {
  const issues = [];
  const core = coreFor(progress);
  if (progress.schemaVersion !==
      WARMACHINE_MATCHUP_ASSASSINATION_TRANSITION_PROGRESS_V1_SCHEMA) {
    issues.push("assassination_transition_progress_schema_mismatch");
  }
  if (!progress.progressHash || stableGraphHash(core) !== progress.progressHash) {
    issues.push("assassination_transition_progress_hash_invalid");
  }
  if (!core.taskKey || !core.behaviorSignatureHash ||
      !core.executionReceiptHash || !core.actionLineIdentityHash ||
      !["candidate", "primary", "replay"].includes(core.phase) ||
      !Number.isInteger(core.activeSlotIndex) || core.activeSlotIndex < 0 ||
      !Number.isInteger(core.actionLineIndex) || core.actionLineIndex < 0) {
    issues.push("assassination_transition_progress_identity_invalid");
  }
  const candidateAudit = auditWarmachineMatchupTerminalCandidateProgressV1(
    core.candidateProgress,
    core.candidatePlan,
  );
  if (!candidateAudit.ok ||
      core.candidatePlan.taskKey !== core.taskKey ||
      core.candidatePlan.behaviorSignatureHash !== core.behaviorSignatureHash ||
      core.candidatePlan.executionReceiptHash !== core.executionReceiptHash ||
      core.candidateProgress.nextSlotIndex !== core.activeSlotIndex ||
      core.candidatePlan.slots?.[core.activeSlotIndex]?.candidateIdentityHash !==
        core.activeCandidateIdentityHash) {
    issues.push("assassination_transition_candidate_binding_invalid");
  }
  if (core.completedActionLines.some((line, lineIndex) =>
    Number(line.actionLineIndex) !== lineIndex ||
    !line.actionLineIdentityHash ||
    !["examined_nonterminal", "strict_rejected"].includes(
      line.disposition,
    ) || !line.evidenceHash) ||
      core.completedActionLines.length !== core.actionLineIndex) {
    issues.push("assassination_transition_completed_action_lines_invalid");
  }
  if (core.phase === "candidate" &&
      (core.actionLineIndex !== 0 || core.completedActionLines.length !== 0 ||
       Object.keys(core.primaryProgress || {}).length !== 0 ||
       core.replayProgress !== null)) {
    issues.push("assassination_transition_candidate_phase_invalid");
  }
  if (["primary", "replay"].includes(core.phase)) {
    const primaryAudit = auditWarmachineMatchupTerminalTransitionProgressV1(
      core.primaryProgress,
    );
    if (!primaryAudit.ok) {
      issues.push("assassination_transition_primary_progress_invalid");
    }
    if (core.phase === "primary" &&
        (core.primaryProgress.status !== "in_progress" || core.replayProgress)) {
      issues.push("assassination_transition_primary_phase_invalid");
    }
  }
  if (core.phase === "replay") {
    const replayAudit = auditWarmachineMatchupTerminalTransitionProgressV1(
      core.replayProgress || {},
    );
    if (core.primaryProgress.status !== "completed" || !replayAudit.ok ||
        core.replayProgress.status !== "in_progress") {
      issues.push("assassination_transition_replay_phase_invalid");
    }
  }
  return stableGraphValue({
    ok: issues.length === 0,
    issues: [...new Set(issues)].sort(),
    progressHash: String(progress.progressHash || ""),
  });
}
