import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { verifyWarmachineMatchupTerminalReplayTransitionProgressV1 } from
  "./matchup-terminal-replay-transition-chunk-v1.mjs";

export const WARMACHINE_MATCHUP_TERMINAL_CANDIDATE_CHUNK_PLAN_V1_SCHEMA =
  "warmachine_matchup_terminal_candidate_chunk_plan_v1";
export const WARMACHINE_MATCHUP_TERMINAL_CANDIDATE_PROGRESS_V1_SCHEMA =
  "warmachine_matchup_terminal_candidate_progress_v1";

function numericInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function seal(core = {}, hashField = "") {
  const value = stableGraphValue(core);
  return { ...value, [hashField]: stableGraphHash(value) };
}

function assertSealed(value = {}, hashField = "", errorCode = "") {
  const core = { ...value };
  const hash = String(core[hashField] || "");
  delete core[hashField];
  if (!hash || stableGraphHash(core) !== hash) throw new Error(errorCode);
}

function canonicalSlots(rawSlots = []) {
  const seen = new Set();
  return rawSlots.map((raw, slotIndex) => {
    const slot = stableGraphValue({
      slotIndex,
      actorPieceKey: String(raw.actorPieceKey || ""),
      anchorIndex: numericInteger(raw.anchorIndex),
      angleIndex: numericInteger(raw.angleIndex),
      attackProfileKey: String(raw.attackProfileKey || ""),
      actionRange: String(raw.actionRange || ""),
    });
    if (!slot.actorPieceKey || !slot.attackProfileKey || !slot.actionRange) {
      throw new Error("matchup_terminal_candidate_slot_identity_missing");
    }
    const identityHash = stableGraphHash({
      actorPieceKey: slot.actorPieceKey,
      anchorIndex: slot.anchorIndex,
      angleIndex: slot.angleIndex,
      attackProfileKey: slot.attackProfileKey,
      actionRange: slot.actionRange,
    });
    if (seen.has(identityHash)) {
      throw new Error("matchup_terminal_candidate_slot_duplicate");
    }
    seen.add(identityHash);
    return slot;
  });
}

export function buildWarmachineMatchupTerminalCandidateChunkPlanV1(raw = {}) {
  const slots = canonicalSlots(raw.slots || []);
  if (!slots.length) {
    throw new Error("matchup_terminal_candidate_slot_set_empty");
  }
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_MATCHUP_TERMINAL_CANDIDATE_CHUNK_PLAN_V1_SCHEMA,
    taskKey: String(raw.taskKey || ""),
    behaviorSignatureHash: String(raw.behaviorSignatureHash || ""),
    terminalTaskExecutionContractVersion: String(
      raw.terminalTaskExecutionContractVersion || "",
    ),
    candidateEnumerationVersion: String(raw.candidateEnumerationVersion || ""),
    hostReceiptHash: String(raw.hostReceiptHash || ""),
    constructionHostReceiptHash: String(raw.constructionHostReceiptHash || ""),
    slots,
    totalSlotCount: slots.length,
  });
  if (!core.taskKey || !core.behaviorSignatureHash ||
      !core.terminalTaskExecutionContractVersion ||
      !core.candidateEnumerationVersion || !core.hostReceiptHash ||
      !core.constructionHostReceiptHash) {
    throw new Error("matchup_terminal_candidate_plan_identity_missing");
  }
  const candidateSetHash = stableGraphHash(slots);
  return seal({ ...core, candidateSetHash }, "candidatePlanHash");
}

export function buildWarmachineMatchupTerminalCandidateProgressV1(raw = {}) {
  const plan = raw.candidatePlan || {};
  assertSealed(
    plan,
    "candidatePlanHash",
    "matchup_terminal_candidate_plan_hash_invalid",
  );
  const nextSlotIndex = numericInteger(raw.nextSlotIndex);
  if (nextSlotIndex > plan.totalSlotCount) {
    throw new Error("matchup_terminal_candidate_progress_cursor_out_of_range");
  }
  const completedChunks = (raw.completedChunks || []).map((chunk, chunkIndex) =>
    stableGraphValue({
      chunkIndex,
      slotStart: numericInteger(chunk.slotStart),
      slotEndExclusive: numericInteger(chunk.slotEndExclusive),
      examinedSlotCount: numericInteger(chunk.examinedSlotCount),
      candidateEvidenceHash: String(chunk.candidateEvidenceHash || ""),
      acceptedCandidateSemanticHash: String(chunk.acceptedCandidateSemanticHash || ""),
    }));
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_MATCHUP_TERMINAL_CANDIDATE_PROGRESS_V1_SCHEMA,
    candidatePlanHash: plan.candidatePlanHash,
    taskKey: plan.taskKey,
    behaviorSignatureHash: plan.behaviorSignatureHash,
    terminalTaskExecutionContractVersion:
      plan.terminalTaskExecutionContractVersion,
    candidateEnumerationVersion: plan.candidateEnumerationVersion,
    candidateSetHash: plan.candidateSetHash,
    nextSlotIndex,
    examinedSlotCount: nextSlotIndex,
    remainingSlotCount: plan.totalSlotCount - nextSlotIndex,
    completedChunks,
    chunkCount: completedChunks.length,
    acceptedCandidateSemanticHash: String(raw.acceptedCandidateSemanticHash || ""),
    replayTransitionProgress: stableGraphValue(raw.replayTransitionProgress || null),
    updatedAtMs: numericInteger(raw.updatedAtMs),
  });
  return seal(core, "progressHash");
}

export function auditWarmachineMatchupTerminalCandidateProgressV1(
  progress = {},
  candidatePlan = {},
) {
  const issues = [];
  try {
    assertSealed(
      candidatePlan,
      "candidatePlanHash",
      "matchup_terminal_candidate_plan_hash_invalid",
    );
    assertSealed(
      progress,
      "progressHash",
      "matchup_terminal_candidate_progress_hash_invalid",
    );
  } catch (error) {
    issues.push(String(error?.message || error));
  }
  if (progress.candidatePlanHash !== candidatePlan.candidatePlanHash ||
      progress.taskKey !== candidatePlan.taskKey ||
      progress.behaviorSignatureHash !== candidatePlan.behaviorSignatureHash ||
      progress.terminalTaskExecutionContractVersion !==
        candidatePlan.terminalTaskExecutionContractVersion ||
      progress.candidateEnumerationVersion !==
        candidatePlan.candidateEnumerationVersion ||
      progress.candidateSetHash !== candidatePlan.candidateSetHash) {
    issues.push("matchup_terminal_candidate_progress_plan_binding_invalid");
  }
  if (numericInteger(progress.nextSlotIndex, -1) > candidatePlan.totalSlotCount ||
      numericInteger(progress.examinedSlotCount, -1) !==
        numericInteger(progress.nextSlotIndex, -1) ||
      numericInteger(progress.remainingSlotCount, -1) +
        numericInteger(progress.examinedSlotCount, -1) !==
        candidatePlan.totalSlotCount) {
    issues.push("matchup_terminal_candidate_progress_mass_invalid");
  }
  let expectedStart = 0;
  for (const chunk of progress.completedChunks || []) {
    if (chunk.slotStart !== expectedStart ||
        chunk.slotEndExclusive <= chunk.slotStart ||
        chunk.slotEndExclusive > candidatePlan.totalSlotCount ||
        chunk.examinedSlotCount !== chunk.slotEndExclusive - chunk.slotStart ||
        !chunk.candidateEvidenceHash) {
      issues.push("matchup_terminal_candidate_progress_chunk_invalid");
      break;
    }
    expectedStart = chunk.slotEndExclusive;
  }
  if (expectedStart !== numericInteger(progress.nextSlotIndex, -1)) {
    issues.push("matchup_terminal_candidate_progress_cursor_gap");
  }
  const replayEnvelope = progress.replayTransitionProgress || null;
  if (replayEnvelope !== null) {
    const phase = String(replayEnvelope.phase || "");
    const primary = replayEnvelope.primary || null;
    const replay = replayEnvelope.replay || null;
    if (!["primary", "replay"].includes(phase) || !primary) {
      issues.push("matchup_terminal_candidate_replay_transition_envelope_invalid");
    } else {
      const primaryAudit = verifyWarmachineMatchupTerminalReplayTransitionProgressV1(
        primary,
        { candidateKey: String(replayEnvelope.primaryCandidateKey || "") },
      );
      if (!primaryAudit.ok) {
        issues.push("matchup_terminal_candidate_primary_transition_progress_invalid");
      }
      if (replay && !verifyWarmachineMatchupTerminalReplayTransitionProgressV1(
        replay,
        { candidateKey: String(replayEnvelope.replayCandidateKey || "") },
      ).ok) {
        issues.push("matchup_terminal_candidate_replay_transition_progress_invalid");
      }
    }
  }
  return stableGraphValue({
    ok: issues.length === 0,
    issues: [...new Set(issues)].sort(),
    candidatePlanHash: String(candidatePlan.candidatePlanHash || ""),
    progressHash: String(progress.progressHash || ""),
  });
}

export function advanceWarmachineMatchupTerminalCandidateProgressV1(raw = {}) {
  const candidatePlan = raw.candidatePlan || {};
  const progress = raw.progress || buildWarmachineMatchupTerminalCandidateProgressV1({
    candidatePlan,
    updatedAtMs: raw.updatedAtMs,
  });
  const audit = auditWarmachineMatchupTerminalCandidateProgressV1(
    progress,
    candidatePlan,
  );
  if (!audit.ok) {
    throw new Error(`matchup_terminal_candidate_progress_invalid:${audit.issues.join(",")}`);
  }
  const slotStart = progress.nextSlotIndex;
  const requestedSlotCount = Math.max(1, numericInteger(raw.maximumSlotCount, 1));
  const slotEndExclusive = Math.min(
    candidatePlan.totalSlotCount,
    slotStart + requestedSlotCount,
  );
  const candidateEvidenceHash = String(raw.candidateEvidenceHash || "");
  if (!candidateEvidenceHash || slotEndExclusive <= slotStart) {
    throw new Error("matchup_terminal_candidate_progress_chunk_input_invalid");
  }
  const completedChunks = [...(progress.completedChunks || []), stableGraphValue({
    chunkIndex: (progress.completedChunks || []).length,
    slotStart,
    slotEndExclusive,
    examinedSlotCount: slotEndExclusive - slotStart,
    candidateEvidenceHash,
    acceptedCandidateSemanticHash: String(raw.acceptedCandidateSemanticHash || ""),
  })];
  return buildWarmachineMatchupTerminalCandidateProgressV1({
    candidatePlan,
    nextSlotIndex: slotEndExclusive,
    completedChunks,
    acceptedCandidateSemanticHash: String(raw.acceptedCandidateSemanticHash || "") ||
      String(progress.acceptedCandidateSemanticHash || ""),
    replayTransitionProgress: raw.replayTransitionProgress || null,
    updatedAtMs: raw.updatedAtMs,
  });
}
