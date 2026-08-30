import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_MATCHUP_TERMINAL_CANDIDATE_PLAN_V1_SCHEMA =
  "warmachine_matchup_terminal_candidate_plan_v1";
export const WARMACHINE_MATCHUP_TERMINAL_CANDIDATE_PROGRESS_V1_SCHEMA =
  "warmachine_matchup_terminal_candidate_progress_v1";

const SLOT_DISPOSITIONS = new Set([
  "examined_nonterminal",
  "examined_terminal",
  "strict_rejected",
  "proven_excluded",
]);

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function seal(core = {}, hashField = "") {
  const value = stableGraphValue(core);
  return { ...value, [hashField]: stableGraphHash(value) };
}

function assertSealed(value = {}, hashField = "", errorCode = "") {
  const core = { ...value };
  const declaredHash = String(core[hashField] || "");
  delete core[hashField];
  if (!declaredHash || stableGraphHash(core) !== declaredHash) {
    throw new Error(errorCode);
  }
}

function canonicalSlot(raw = {}, slotIndex = 0) {
  const identity = stableGraphValue({
    actorPieceKey: String(raw.actorPieceKey || ""),
    targetPieceKey: String(raw.targetPieceKey || ""),
    geometryCandidateKey: String(raw.geometryCandidateKey || ""),
    actionLineKey: String(raw.actionLineKey || ""),
    attackProfileKey: String(raw.attackProfileKey || ""),
    attackMode: String(raw.attackMode || ""),
    attackSourceKind: String(raw.attackSourceKind || ""),
  });
  if (Object.values(identity).some((value) => !value)) {
    throw new Error("matchup_terminal_candidate_slot_identity_missing");
  }
  return stableGraphValue({
    slotIndex,
    ...identity,
    candidateIdentityHash: stableGraphHash(identity),
  });
}

function canonicalSlotOutcome(raw = {}, slot = {}) {
  const slotIndex = nonNegativeInteger(raw.slotIndex, -1);
  const disposition = String(raw.disposition || "");
  const evidenceHash = String(raw.evidenceHash || "");
  if (slotIndex !== slot.slotIndex ||
      String(raw.candidateIdentityHash || "") !== slot.candidateIdentityHash) {
    throw new Error("matchup_terminal_candidate_outcome_slot_binding_invalid");
  }
  if (!SLOT_DISPOSITIONS.has(disposition) || !evidenceHash) {
    throw new Error("matchup_terminal_candidate_outcome_evidence_missing");
  }
  const exclusionProofHash = String(raw.exclusionProofHash || "");
  const rejectionEvidenceHash = String(raw.rejectionEvidenceHash || "");
  if (disposition === "proven_excluded" && !exclusionProofHash) {
    throw new Error("matchup_terminal_candidate_exclusion_proof_missing");
  }
  if (disposition === "strict_rejected" && !rejectionEvidenceHash) {
    throw new Error("matchup_terminal_candidate_rejection_evidence_missing");
  }
  const terminalCandidateSemanticHash = String(
    raw.terminalCandidateSemanticHash || "",
  );
  if (disposition === "examined_terminal" && !terminalCandidateSemanticHash) {
    throw new Error("matchup_terminal_candidate_terminal_semantic_hash_missing");
  }
  return stableGraphValue({
    slotIndex,
    candidateIdentityHash: slot.candidateIdentityHash,
    disposition,
    reason: String(raw.reason || ""),
    evidenceHash,
    rejectionEvidenceHash,
    exclusionProofHash,
    terminalCandidateSemanticHash,
  });
}

function progressMass(slotOutcomes = [], totalSlotCount = 0) {
  const examinedNonterminalCount = slotOutcomes.filter((outcome) =>
    outcome.disposition === "examined_nonterminal").length;
  const examinedTerminalCount = slotOutcomes.filter((outcome) =>
    outcome.disposition === "examined_terminal").length;
  const strictRejectedCount = slotOutcomes.filter((outcome) =>
    outcome.disposition === "strict_rejected").length;
  const provenExcludedCount = slotOutcomes.filter((outcome) =>
    outcome.disposition === "proven_excluded").length;
  const resolvedSlotCount = slotOutcomes.length;
  return stableGraphValue({
    examinedNonterminalCount,
    examinedTerminalCount,
    strictRejectedCount,
    provenExcludedCount,
    resolvedSlotCount,
    unresolvedSlotCount: totalSlotCount - resolvedSlotCount,
    totalSlotCount,
  });
}

export function buildWarmachineMatchupTerminalCandidatePlanV1(raw = {}) {
  const seen = new Set();
  const slots = (raw.slots || []).map((slot, slotIndex) => {
    const canonical = canonicalSlot(slot, slotIndex);
    if (seen.has(canonical.candidateIdentityHash)) {
      throw new Error("matchup_terminal_candidate_slot_duplicate");
    }
    seen.add(canonical.candidateIdentityHash);
    return canonical;
  });
  if (!slots.length) {
    throw new Error("matchup_terminal_candidate_slot_set_empty");
  }
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_MATCHUP_TERMINAL_CANDIDATE_PLAN_V1_SCHEMA,
    taskKey: String(raw.taskKey || ""),
    behaviorSignatureHash: String(raw.behaviorSignatureHash || ""),
    goalFamilyContractVersion: String(raw.goalFamilyContractVersion || ""),
    candidateEnumerationVersion: String(raw.candidateEnumerationVersion || ""),
    executionReceiptHash: String(raw.executionReceiptHash || ""),
    slots,
    totalSlotCount: slots.length,
    candidateSetHash: stableGraphHash(slots),
  });
  if (!core.taskKey || !core.behaviorSignatureHash ||
      !core.goalFamilyContractVersion || !core.candidateEnumerationVersion ||
      !core.executionReceiptHash) {
    throw new Error("matchup_terminal_candidate_plan_identity_missing");
  }
  return seal(core, "candidatePlanHash");
}

export function buildWarmachineMatchupTerminalCandidateProgressV1(raw = {}) {
  const candidatePlan = raw.candidatePlan || {};
  assertSealed(
    candidatePlan,
    "candidatePlanHash",
    "matchup_terminal_candidate_plan_hash_invalid",
  );
  const slotOutcomes = (raw.slotOutcomes || []).map((outcome, index) => {
    if (index >= candidatePlan.totalSlotCount) {
      throw new Error("matchup_terminal_candidate_progress_cursor_out_of_range");
    }
    return canonicalSlotOutcome(outcome, candidatePlan.slots[index]);
  });
  const completedChunks = (raw.completedChunks || []).map((chunk, chunkIndex) =>
    stableGraphValue({
      chunkIndex,
      slotStart: nonNegativeInteger(chunk.slotStart),
      slotEndExclusive: nonNegativeInteger(chunk.slotEndExclusive),
      outcomeCount: nonNegativeInteger(chunk.outcomeCount),
      outcomeSetHash: String(chunk.outcomeSetHash || ""),
    }));
  const mass = progressMass(slotOutcomes, candidatePlan.totalSlotCount);
  return seal(stableGraphValue({
    schemaVersion: WARMACHINE_MATCHUP_TERMINAL_CANDIDATE_PROGRESS_V1_SCHEMA,
    candidatePlanHash: candidatePlan.candidatePlanHash,
    taskKey: candidatePlan.taskKey,
    behaviorSignatureHash: candidatePlan.behaviorSignatureHash,
    goalFamilyContractVersion: candidatePlan.goalFamilyContractVersion,
    candidateEnumerationVersion: candidatePlan.candidateEnumerationVersion,
    executionReceiptHash: candidatePlan.executionReceiptHash,
    candidateSetHash: candidatePlan.candidateSetHash,
    nextSlotIndex: slotOutcomes.length,
    slotOutcomes,
    slotOutcomeSetHash: stableGraphHash(slotOutcomes),
    completedChunks,
    chunkCount: completedChunks.length,
    mass,
    terminalCandidateSemanticHashes: slotOutcomes.filter((outcome) =>
      outcome.disposition === "examined_terminal").map((outcome) =>
      outcome.terminalCandidateSemanticHash),
    exhausted: slotOutcomes.length === candidatePlan.totalSlotCount,
    updatedAtMs: nonNegativeInteger(raw.updatedAtMs),
  }), "progressHash");
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
  for (const field of [
    "candidatePlanHash",
    "taskKey",
    "behaviorSignatureHash",
    "goalFamilyContractVersion",
    "candidateEnumerationVersion",
    "executionReceiptHash",
    "candidateSetHash",
  ]) {
    if (progress[field] !== candidatePlan[field]) {
      issues.push("matchup_terminal_candidate_progress_plan_binding_invalid");
      break;
    }
  }
  const outcomes = progress.slotOutcomes || [];
  try {
    outcomes.forEach((outcome, index) =>
      canonicalSlotOutcome(outcome, candidatePlan.slots?.[index] || {}));
  } catch (error) {
    issues.push(String(error?.message || error));
  }
  const expectedMass = progressMass(outcomes, candidatePlan.totalSlotCount || 0);
  if (stableGraphHash(expectedMass) !== stableGraphHash(progress.mass || {}) ||
      progress.nextSlotIndex !== outcomes.length ||
      progress.slotOutcomeSetHash !== stableGraphHash(outcomes) ||
      expectedMass.resolvedSlotCount + expectedMass.unresolvedSlotCount !==
        candidatePlan.totalSlotCount) {
    issues.push("matchup_terminal_candidate_progress_mass_invalid");
  }
  let expectedStart = 0;
  for (const chunk of progress.completedChunks || []) {
    const chunkOutcomes = outcomes.slice(chunk.slotStart, chunk.slotEndExclusive);
    if (chunk.slotStart !== expectedStart ||
        chunk.slotEndExclusive <= chunk.slotStart ||
        chunk.slotEndExclusive > outcomes.length ||
        chunk.outcomeCount !== chunkOutcomes.length ||
        chunk.outcomeSetHash !== stableGraphHash(chunkOutcomes)) {
      issues.push("matchup_terminal_candidate_progress_chunk_invalid");
      break;
    }
    expectedStart = chunk.slotEndExclusive;
  }
  if (expectedStart !== outcomes.length) {
    issues.push("matchup_terminal_candidate_progress_cursor_gap");
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
  const rawOutcomes = raw.slotOutcomes || [];
  if (!rawOutcomes.length) {
    throw new Error("matchup_terminal_candidate_progress_chunk_empty");
  }
  const slotStart = progress.nextSlotIndex;
  if (slotStart + rawOutcomes.length > candidatePlan.totalSlotCount) {
    throw new Error("matchup_terminal_candidate_progress_cursor_out_of_range");
  }
  const canonicalOutcomes = rawOutcomes.map((outcome, offset) =>
    canonicalSlotOutcome(outcome, candidatePlan.slots[slotStart + offset]));
  const slotOutcomes = [...progress.slotOutcomes, ...canonicalOutcomes];
  const slotEndExclusive = slotOutcomes.length;
  const completedChunks = [...progress.completedChunks, stableGraphValue({
    chunkIndex: progress.completedChunks.length,
    slotStart,
    slotEndExclusive,
    outcomeCount: canonicalOutcomes.length,
    outcomeSetHash: stableGraphHash(canonicalOutcomes),
  })];
  return buildWarmachineMatchupTerminalCandidateProgressV1({
    candidatePlan,
    slotOutcomes,
    completedChunks,
    updatedAtMs: raw.updatedAtMs,
  });
}

export function executeWarmachineMatchupTerminalCandidateChunkV1(raw = {}) {
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
  if (typeof raw.evaluateSlot !== "function") {
    throw new Error("matchup_terminal_candidate_evaluator_missing");
  }
  const maximumSlotCount = Math.max(1, nonNegativeInteger(
    raw.maximumSlotCount,
    1,
  ));
  const slotEndExclusive = Math.min(
    candidatePlan.totalSlotCount,
    progress.nextSlotIndex + maximumSlotCount,
  );
  const outcomes = [];
  for (let slotIndex = progress.nextSlotIndex;
    slotIndex < slotEndExclusive;
    slotIndex += 1) {
    const slot = candidatePlan.slots[slotIndex];
    const evaluated = raw.evaluateSlot(slot, {
      progress,
      pendingOutcomes: stableGraphValue(outcomes),
    });
    if (evaluated?.disposition === "in_progress") {
      const nextProgress = outcomes.length
        ? advanceWarmachineMatchupTerminalCandidateProgressV1({
          candidatePlan,
          progress,
          slotOutcomes: outcomes,
          updatedAtMs: raw.updatedAtMs,
        })
        : progress;
      return stableGraphValue({
        progress: nextProgress,
        outcomes,
        terminalOutcome: null,
        inProgress: {
          slotIndex,
          candidateIdentityHash: slot.candidateIdentityHash,
          detail: stableGraphValue(evaluated.detail || {}),
        },
      });
    }
    const outcome = canonicalSlotOutcome({
      ...evaluated,
      slotIndex,
      candidateIdentityHash: slot.candidateIdentityHash,
    }, slot);
    outcomes.push(outcome);
    if (outcome.disposition === "examined_terminal" &&
        raw.stopOnFirstTerminal === true) {
      break;
    }
  }
  if (!outcomes.length) {
    return stableGraphValue({
      progress,
      outcomes,
      terminalOutcome: null,
      inProgress: null,
    });
  }
  const nextProgress = advanceWarmachineMatchupTerminalCandidateProgressV1({
    candidatePlan,
    progress,
    slotOutcomes: outcomes,
    updatedAtMs: raw.updatedAtMs,
  });
  return stableGraphValue({
    progress: nextProgress,
    outcomes,
    terminalOutcome: outcomes.find((outcome) =>
      outcome.disposition === "examined_terminal") || null,
    inProgress: null,
  });
}

function attackSourceKind(action = {}) {
  const metadata = action.metadata || {};
  const profile = metadata.attackProfile || metadata.spellProfile || {};
  if (metadata.grantedByRuleAtomKey || metadata.ruleAtomKey ||
      metadata.grantedByRuleKey || metadata.ruleGrantedAttack === true) {
    return "rule_granted";
  }
  if (String(profile.mode || "").toLowerCase() === "spell" ||
      /spell/i.test(String(action.actionType || ""))) {
    return "spell";
  }
  return "weapon";
}

function attackProfileSourceKind(profile = {}) {
  if (profile.grantedByRuleAtomKey || profile.ruleAtomKey ||
      profile.grantedByRuleKey || profile.ruleGrantedAttack === true) {
    return "rule_granted";
  }
  return String(profile.mode || "").toLowerCase() === "spell"
    ? "spell" : "weapon";
}

export function buildWarmachineTerminalAttackProfileSlotsV1(raw = {}) {
  const targetPieceKey = String(raw.targetPieceKey || "");
  const geometryDomainKey = String(raw.geometryDomainKey || "");
  if (!targetPieceKey || !geometryDomainKey) {
    throw new Error("matchup_terminal_attack_profile_slot_domain_missing");
  }
  const modeOrder = { melee: 0, ranged: 1, spell: 2 };
  const rows = [];
  for (const actor of raw.actors || []) {
    const actorPieceKey = String(actor.pieceKey || "");
    if (!actorPieceKey) {
      throw new Error("matchup_terminal_attack_profile_slot_actor_missing");
    }
    const byProfileKey = new Map();
    for (const profile of [
      ...(actor.attackProfiles || []),
      ...(actor.weaponProfiles || []),
    ]) {
      const attackProfileKey = String(profile.profileKey || profile.weaponKey ||
        profile.spellKey || "");
      const attackMode = String(profile.mode || "").toLowerCase();
      if (!attackProfileKey || !Object.hasOwn(modeOrder, attackMode)) continue;
      if (!byProfileKey.has(attackProfileKey)) {
        byProfileKey.set(attackProfileKey, profile);
      }
    }
    const profiles = [...byProfileKey.values()].sort((left, right) =>
      modeOrder[String(left.mode || "").toLowerCase()] -
        modeOrder[String(right.mode || "").toLowerCase()] ||
      Number(right.count || 1) - Number(left.count || 1) ||
      Number(right.power ?? right.pow ?? right.pPlusS ?? 0) -
        Number(left.power ?? left.pow ?? left.pPlusS ?? 0) ||
      String(left.profileKey || left.weaponKey || left.spellKey || "")
        .localeCompare(String(
          right.profileKey || right.weaponKey || right.spellKey || "",
        )));
    for (const profile of profiles) {
      const attackProfileKey = String(profile.profileKey || profile.weaponKey ||
        profile.spellKey || "");
      rows.push(stableGraphValue({
        actorPieceKey,
        targetPieceKey,
        geometryCandidateKey: `${geometryDomainKey}:${actorPieceKey}`,
        actionLineKey: "rules_v1_all_action_lines_for_profile_v1",
        attackProfileKey,
        attackMode: String(profile.mode || "").toLowerCase(),
        attackSourceKind: attackProfileSourceKind(profile),
      }));
    }
  }
  return rows;
}

function attackProfile(action = {}) {
  return action.metadata?.attackProfile || action.metadata?.spellProfile || {};
}

export function enumerateWarmachineTerminalAttackCandidatesV1(raw = {}) {
  const rows = [
    ...(raw.actions || []).map((action) => ({ action, disposition: "legal" })),
    ...(raw.rejectedActions || []).map((action) => ({
      action,
      disposition: "strict_rejected",
    })),
  ];
  const allowedActionTypes = new Set(raw.allowedActionTypes || []);
  const byIdentity = new Map();
  for (const { action, disposition } of rows) {
    const profile = attackProfile(action);
    const profileKey = String(profile.profileKey || profile.weaponKey ||
      profile.spellKey || "");
    if (!profileKey ||
        (raw.actorPieceKey && action.actorPieceKey !== raw.actorPieceKey) ||
        (raw.targetPieceKey && action.targetPieceKey !== raw.targetPieceKey) ||
        (allowedActionTypes.size && !allowedActionTypes.has(action.actionType))) {
      continue;
    }
    const identity = stableGraphValue({
      actionKey: String(action.actionKey || ""),
      actionType: String(action.actionType || ""),
      actorPieceKey: String(action.actorPieceKey || ""),
      targetPieceKey: String(action.targetPieceKey || ""),
      attackProfileKey: profileKey,
      attackMode: String(profile.mode || ""),
      attackSourceKind: attackSourceKind(action),
      destination: stableGraphValue(action.destination || null),
      groupDestinations: stableGraphValue(action.groupDestinations || null),
      effectProfileKey: String(action.metadata?.effectProfileKey || ""),
      attackSequenceKey: String(action.metadata?.attackSequenceKey || ""),
    });
    const candidateIdentityHash = stableGraphHash(identity);
    if (byIdentity.has(candidateIdentityHash)) continue;
    byIdentity.set(candidateIdentityHash, stableGraphValue({
      ...identity,
      attackProfileName: String(profile.name || ""),
      disposition,
      legalityEvidenceHash: stableGraphHash({
        legality: action.legality || null,
        rejection: action.rejection || null,
      }),
      candidateIdentityHash,
    }));
  }
  return [...byIdentity.values()].sort((left, right) =>
    left.candidateIdentityHash.localeCompare(right.candidateIdentityHash));
}

export function auditWarmachineTerminalAttackProfileCoverageV1(raw = {}) {
  const expectedProfiles = (raw.attackProfiles || []).filter((profile) =>
    ["melee", "ranged", "spell"].includes(
      String(profile.mode || "").toLowerCase(),
    )).map((profile) => String(
      profile.profileKey || profile.weaponKey || profile.spellKey || "",
    )).filter(Boolean);
  const observedProfileKeys = [...new Set((raw.attackCandidates || []).map(
    (candidate) => candidate.attackProfileKey,
  ).filter(Boolean))].sort();
  const excludedByProfileKey = new Map((raw.profileExclusions || []).map(
    (exclusion) => [String(exclusion.attackProfileKey || ""), exclusion],
  ));
  const missingProfileKeys = [...new Set(expectedProfiles)].filter((profileKey) =>
    !observedProfileKeys.includes(profileKey) &&
    !String(excludedByProfileKey.get(profileKey)?.exclusionProofHash || ""));
  return stableGraphValue({
    ok: missingProfileKeys.length === 0,
    expectedProfileKeys: [...new Set(expectedProfiles)].sort(),
    observedProfileKeys,
    provenExcludedProfileKeys: [...excludedByProfileKey.entries()].filter(
      ([, exclusion]) => Boolean(exclusion.exclusionProofHash),
    ).map(([profileKey]) => profileKey).sort(),
    missingProfileKeys: missingProfileKeys.sort(),
  });
}

export function warmachineTerminalAttackLosEvidenceV1(action = {}) {
  const profile = attackProfile(action);
  const checks = (action.legality?.checks || []).filter((check) =>
    /(?:LOS|LINE_OF_SIGHT)/i.test(String(check.code || "")));
  const blocked = checks.some((check) =>
    ["blocked", "failed"].includes(String(check.status || "")) ||
    check.hasClearLine === false || Number(check.blockedLineCount || 0) > 0);
  const clear = checks.some((check) =>
    check.hasClearLine === true ||
    (String(check.status || "") === "passed" &&
      !/BLOCKED|REJECTED/i.test(String(check.code || ""))));
  return stableGraphValue({
    actionKey: String(action.actionKey || ""),
    actionType: String(action.actionType || ""),
    actorPieceKey: String(action.actorPieceKey || ""),
    targetPieceKey: String(action.targetPieceKey || ""),
    attackProfileKey: String(profile.profileKey || profile.weaponKey ||
      profile.spellKey || ""),
    legalityStatus: String(action.legality?.status || ""),
    checkCount: checks.length,
    checks,
    hasClearLine: clear && !blocked,
    lineOfSightBlocked: blocked,
    evidenceHash: stableGraphHash(checks),
  });
}
