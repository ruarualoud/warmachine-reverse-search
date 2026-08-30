#!/usr/bin/env node

import assert from "node:assert/strict";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import {
  advanceWarmachineMatchupTerminalCandidateProgressV1,
  auditWarmachineMatchupTerminalCandidateProgressV1,
  auditWarmachineTerminalAttackProfileCoverageV1,
  buildWarmachineMatchupTerminalCandidatePlanV1,
  buildWarmachineMatchupTerminalCandidateProgressV1,
  buildWarmachineTerminalAttackProfileSlotsV1,
  enumerateWarmachineTerminalAttackCandidatesV1,
  executeWarmachineMatchupTerminalCandidateChunkV1,
  warmachineTerminalAttackLosEvidenceV1,
} from "../src/matchup/matchup-terminal-candidate-ledger-v1.mjs";
import { enumerateRulesV1Actions } from "../src/warmachine-host-runtime.mjs";

function profile(overrides = {}) {
  return {
    profileKey: overrides.profileKey || "test-profile",
    name: overrides.name || overrides.profileKey || "Test Profile",
    mode: overrides.mode || "melee",
    rangeIn: overrides.rangeIn ?? 1,
    power: overrides.power ?? 12,
    cost: overrides.cost ?? 0,
    attackStatKind: overrides.mode === "spell" ? "ARC" :
      overrides.mode === "ranged" ? "RAT" : "MAT",
    attackStat: 7,
    hitModel: "attack_stat_vs_def_probability_v0",
    ...overrides,
  };
}

function piece(overrides = {}) {
  return {
    pieceKey: overrides.pieceKey || "piece",
    label: overrides.label || overrides.pieceKey || "Piece",
    sideKey: overrides.sideKey || "player1",
    modelRole: overrides.modelRole || "warrior",
    modelType: overrides.modelType || "unit",
    isWarcaster: overrides.isWarcaster || false,
    position: overrides.position || { xIn: 5, yIn: 5 },
    baseSizeIn: overrides.baseSizeIn ?? 1.18,
    speedIn: overrides.speedIn ?? 6,
    meleeRangeIn: overrides.meleeRangeIn ?? 1,
    defense: overrides.defense ?? 12,
    armor: overrides.armor ?? 16,
    mat: overrides.mat ?? 7,
    rat: overrides.rat ?? 7,
    arc: overrides.arc ?? 7,
    resourceKind: overrides.resourceKind || "focus",
    resourcePoints: overrides.resourcePoints ?? 8,
    resourceMax: overrides.resourceMax ?? 8,
    damage: {
      boxesRemaining: overrides.boxesRemaining ?? 18,
      maxBoxes: overrides.maxBoxes ?? overrides.boxesRemaining ?? 18,
    },
    statusTags: overrides.statusTags || [],
    specialRules: overrides.specialRules || [],
    attackProfiles: overrides.attackProfiles || [],
    ...overrides,
  };
}

function state(pieces, overrides = {}) {
  return {
    stateKey: overrides.stateKey || "candidate-completeness",
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 3,
    strictMode: true,
    enforceStrictExecutor: true,
    ruleAtomRuntimeMode: "authoritative",
    board: { widthIn: 48, heightIn: 48 },
    pieces,
    terrain: overrides.terrain || [],
    commandCards: [],
    scenario: {
      zones: [],
      flags: [],
      actionObjectives: [],
      score: { player1: 0, player2: 0 },
      victoryThreshold: 5,
    },
  };
}

function scopedEnumeration(ruleState, actorPieceKey = "actor",
  targetPieceKey = "target") {
  return enumerateRulesV1Actions(ruleState, {
    actorPieceKeys: [actorPieceKey],
    targetPieceKeys: [targetPieceKey],
    actionFamilyKeys: ["attack_or_effect"],
    includeActorlessActions: false,
    includeUntargetedActions: false,
  });
}

function actionFor(enumeration, actionType, attackProfileKey) {
  return (enumeration.actions || []).find((action) =>
    action.actionType === actionType &&
    action.metadata?.attackProfile?.profileKey === attackProfileKey);
}

function rejectedActionFor(enumeration, actionType, attackProfileKey) {
  return (enumeration.rejectedActions || []).find((action) =>
    action.actionType === actionType &&
    action.metadata?.attackProfile?.profileKey === attackProfileKey);
}

const plan = buildWarmachineMatchupTerminalCandidatePlanV1({
  taskKey: "candidate-completeness-task",
  behaviorSignatureHash: "behavior-signature",
  goalFamilyContractVersion: "assassination-contract-v1",
  candidateEnumerationVersion: "candidate-completeness-v1",
  executionReceiptHash: "execution-receipt",
  slots: ["short", "long", "spell"].map((attackProfileKey, index) => ({
    actorPieceKey: "actor",
    targetPieceKey: "target",
    geometryCandidateKey: `geometry-${index}`,
    actionLineKey: index === 2 ? "direct_spell" : "direct_weapon",
    attackProfileKey,
    attackMode: index === 2 ? "spell" : "melee",
    attackSourceKind: index === 2 ? "spell" : "weapon",
  })),
});
const initial = buildWarmachineMatchupTerminalCandidateProgressV1({
  candidatePlan: plan,
  updatedAtMs: 1,
});
const evaluatedSlotIndexes = [];
const firstChunk = executeWarmachineMatchupTerminalCandidateChunkV1({
  candidatePlan: plan,
  progress: initial,
  maximumSlotCount: 3,
  stopOnFirstTerminal: true,
  updatedAtMs: 2,
  evaluateSlot: (slot) => {
    evaluatedSlotIndexes.push(slot.slotIndex);
    return slot.slotIndex === 1 ? {
      disposition: "examined_terminal",
      reason: "later_slot_is_terminal",
      evidenceHash: stableGraphHash({ slot: slot.slotIndex, terminal: true }),
      terminalCandidateSemanticHash: stableGraphHash({ terminal: slot.slotIndex }),
    } : {
      disposition: "examined_nonterminal",
      reason: "legal_but_not_terminal",
      evidenceHash: stableGraphHash({ slot: slot.slotIndex, terminal: false }),
    };
  },
});
assert.deepEqual(evaluatedSlotIndexes, [0, 1]);
assert.equal(firstChunk.progress.nextSlotIndex, 2);
assert.equal(firstChunk.progress.mass.examinedNonterminalCount, 1);
assert.equal(firstChunk.progress.mass.examinedTerminalCount, 1);
assert.equal(firstChunk.progress.mass.unresolvedSlotCount, 1);
assert.equal(firstChunk.terminalOutcome.slotIndex, 1);
assert.equal(auditWarmachineMatchupTerminalCandidateProgressV1(
  firstChunk.progress,
  plan,
).ok, true);

const pausedInsideFirstSlot = executeWarmachineMatchupTerminalCandidateChunkV1({
  candidatePlan: plan,
  progress: initial,
  maximumSlotCount: 3,
  updatedAtMs: 2,
  evaluateSlot: (slot) => ({
    disposition: "in_progress",
    detail: {
      slotIndex: slot.slotIndex,
      transitionProgressHash: "sealed-transition-progress",
    },
  }),
});
assert.equal(pausedInsideFirstSlot.progress.progressHash, initial.progressHash);
assert.equal(pausedInsideFirstSlot.progress.nextSlotIndex, 0);
assert.equal(pausedInsideFirstSlot.progress.mass.resolvedSlotCount, 0);
assert.equal(pausedInsideFirstSlot.progress.mass.unresolvedSlotCount, 3);
assert.equal(pausedInsideFirstSlot.outcomes.length, 0);
assert.equal(pausedInsideFirstSlot.inProgress.slotIndex, 0);
assert.equal(pausedInsideFirstSlot.inProgress.candidateIdentityHash,
  plan.slots[0].candidateIdentityHash);

const resumed = executeWarmachineMatchupTerminalCandidateChunkV1({
  candidatePlan: plan,
  progress: firstChunk.progress,
  maximumSlotCount: 3,
  updatedAtMs: 3,
  evaluateSlot: (slot) => ({
    disposition: "strict_rejected",
    reason: "strict_host_rejected",
    evidenceHash: stableGraphHash({ slot: slot.slotIndex, rejected: true }),
    rejectionEvidenceHash: stableGraphHash({ rejection: slot.slotIndex }),
  }),
});
assert.equal(resumed.progress.nextSlotIndex, 3);
assert.equal(resumed.progress.exhausted, true);
assert.equal(resumed.progress.mass.strictRejectedCount, 1);
assert.equal(resumed.progress.mass.resolvedSlotCount, 3);
assert.equal(resumed.progress.mass.unresolvedSlotCount, 0);

const onlyOneOutcome = advanceWarmachineMatchupTerminalCandidateProgressV1({
  candidatePlan: plan,
  progress: initial,
  slotOutcomes: [{
    slotIndex: 0,
    candidateIdentityHash: plan.slots[0].candidateIdentityHash,
    disposition: "proven_excluded",
    reason: "range_upper_bound_proof",
    evidenceHash: "exclusion-evidence",
    exclusionProofHash: "range-proof",
  }],
  updatedAtMs: 4,
});
assert.equal(onlyOneOutcome.nextSlotIndex, 1);
assert.equal(onlyOneOutcome.mass.provenExcludedCount, 1);
assert.equal(onlyOneOutcome.mass.unresolvedSlotCount, 2);

const tampered = { ...resumed.progress, nextSlotIndex: 2 };
assert.equal(auditWarmachineMatchupTerminalCandidateProgressV1(
  tampered,
  plan,
).ok, false);

const shortBlade = profile({ profileKey: "short-blade", rangeIn: 1 });
const longBlade = profile({ profileKey: "long-blade", rangeIn: 2 });
const rifle = profile({
  profileKey: "long-rifle",
  mode: "ranged",
  rangeIn: 12,
});
const spell = profile({
  profileKey: "attack-spell",
  mode: "spell",
  rangeIn: 10,
  cost: 1,
});
const attackProfiles = [shortBlade, longBlade, rifle, spell];
const ruleGrantedProfile = profile({
  profileKey: "rule-granted-strike",
  mode: "melee",
  grantedByRuleAtomKey: "rule-granted-follow-up",
});
const declarativeProfileSlots = buildWarmachineTerminalAttackProfileSlotsV1({
  actors: [piece({
    pieceKey: "actor",
    attackProfiles: [...attackProfiles, ruleGrantedProfile],
  })],
  targetPieceKey: "target",
  geometryDomainKey: "finite-anchor-domain-v1",
});
assert.equal(declarativeProfileSlots.length, 5);
assert.deepEqual(declarativeProfileSlots.map((row) =>
  row.attackProfileKey).sort(), [
  "attack-spell",
  "long-blade",
  "long-rifle",
  "rule-granted-strike",
  "short-blade",
]);
assert.equal(declarativeProfileSlots.find((row) =>
  row.attackProfileKey === "rule-granted-strike")?.attackSourceKind,
"rule_granted");
const directState = state([
  piece({
    pieceKey: "actor",
    modelRole: "warcaster",
    modelType: "warcaster",
    isWarcaster: true,
    position: { xIn: 5, yIn: 5 },
    attackProfiles,
  }),
  piece({
    pieceKey: "target",
    sideKey: "player2",
    position: { xIn: 6.7, yIn: 5 },
  }),
]);
const directEnumeration = scopedEnumeration(directState);
const directCandidates = enumerateWarmachineTerminalAttackCandidatesV1({
  actions: directEnumeration.actions,
  rejectedActions: directEnumeration.rejectedActions,
  actorPieceKey: "actor",
  targetPieceKey: "target",
  allowedActionTypes: ["melee_attack", "ranged_attack", "offensive_spell"],
});
const directCoverage = auditWarmachineTerminalAttackProfileCoverageV1({
  attackProfiles,
  attackCandidates: directCandidates,
});
assert.equal(directCoverage.ok, true);
assert.deepEqual(directCoverage.expectedProfileKeys, [
  "attack-spell",
  "long-blade",
  "long-rifle",
  "short-blade",
]);
assert.ok(actionFor(directEnumeration, "melee_attack", "short-blade"));
assert.ok(actionFor(directEnumeration, "melee_attack", "long-blade"));
assert.ok(actionFor(directEnumeration, "ranged_attack", "long-rifle"));
assert.ok(actionFor(directEnumeration, "offensive_spell", "attack-spell"));

const moveState = structuredClone(directState);
moveState.stateKey = "candidate-completeness-move";
moveState.pieces.find((entry) => entry.pieceKey === "target").position = {
  xIn: 11,
  yIn: 5,
};
const moveEnumeration = scopedEnumeration(moveState);
const movedShort = actionFor(
  moveEnumeration,
  "advance_then_melee_attack",
  "short-blade",
);
const movedLong = actionFor(
  moveEnumeration,
  "advance_then_melee_attack",
  "long-blade",
);
assert.ok(movedShort);
assert.ok(movedLong);
const moveLosEvidence = warmachineTerminalAttackLosEvidenceV1(movedLong);
assert.equal(moveLosEvidence.actionType, "advance_then_melee_attack");
assert.equal(moveLosEvidence.attackProfileKey, "long-blade");
assert.equal(moveLosEvidence.hasClearLine, true);

const stealthState = state([
  piece({
    pieceKey: "actor",
    position: { xIn: 5, yIn: 20 },
    attackProfiles: [rifle],
  }),
  piece({
    pieceKey: "target",
    sideKey: "player2",
    position: { xIn: 17, yIn: 20 },
    specialRules: [{ ruleKey: "stealth", name: "Stealth" }],
  }),
]);
const stealthEnumeration = scopedEnumeration(stealthState);
const stealthAttack = actionFor(stealthEnumeration, "ranged_attack", "long-rifle");
assert.ok(stealthAttack);
assert.equal(stealthAttack.metadata?.attackResolution?.automaticMiss, true);
assert.equal(stealthAttack.metadata?.attackResolution?.hitProbability, 0);

const trueSightState = structuredClone(stealthState);
trueSightState.stateKey = "candidate-completeness-true-sight";
trueSightState.pieces.find((entry) => entry.pieceKey === "actor").specialRules = [
  "True Sight",
];
const trueSightAttack = actionFor(
  scopedEnumeration(trueSightState),
  "ranged_attack",
  "long-rifle",
);
assert.ok(trueSightAttack);
assert.equal(trueSightAttack.metadata?.attackResolution?.automaticMiss, false);

const modelBlockedState = state([
  piece({
    pieceKey: "actor",
    position: { xIn: 5, yIn: 30 },
    attackProfiles: [rifle],
  }),
  piece({
    pieceKey: "blocker",
    sideKey: "player2",
    position: { xIn: 11, yIn: 30 },
    baseSizeIn: 5,
  }),
  piece({
    pieceKey: "target",
    sideKey: "player2",
    position: { xIn: 17, yIn: 30 },
  }),
]);
const modelBlockedEnumeration = scopedEnumeration(modelBlockedState);
assert.equal(actionFor(
  modelBlockedEnumeration,
  "ranged_attack",
  "long-rifle",
), undefined);
const modelBlocked = rejectedActionFor(
  modelBlockedEnumeration,
  "ranged_attack",
  "long-rifle",
);
assert.ok(modelBlocked);
assert.equal(warmachineTerminalAttackLosEvidenceV1(modelBlocked)
  .lineOfSightBlocked, true);

const terrainBlockedState = state([
  piece({
    pieceKey: "actor",
    position: { xIn: 5, yIn: 40 },
    attackProfiles: [rifle],
  }),
  piece({
    pieceKey: "target",
    sideKey: "player2",
    position: { xIn: 17, yIn: 40 },
  }),
], {
  terrain: [{
    terrainKey: "solid-obstruction",
    type: "obstruction",
    xIn: 11,
    yIn: 40,
    widthIn: 4,
    heightIn: 4,
    blocksLineOfSight: true,
    blocksMovement: false,
    exactWithinScope: true,
  }],
});
const terrainBlockedEnumeration = scopedEnumeration(terrainBlockedState);
const terrainBlocked = rejectedActionFor(
  terrainBlockedEnumeration,
  "ranged_attack",
  "long-rifle",
);
assert.ok(terrainBlocked);
assert.equal(terrainBlocked.rejection?.reason, "line_of_sight_blocked");
assert.equal(warmachineTerminalAttackLosEvidenceV1(terrainBlocked)
  .lineOfSightBlocked, true);

const ruleGrantedAction = structuredClone(
  actionFor(directEnumeration, "ranged_attack", "long-rifle"),
);
ruleGrantedAction.actionKey = `${ruleGrantedAction.actionKey}:rule-granted`;
ruleGrantedAction.metadata.grantedByRuleAtomKey = "rule-granted-follow-up";
const ruleGrantedCandidates = enumerateWarmachineTerminalAttackCandidatesV1({
  actions: [ruleGrantedAction],
});
assert.equal(ruleGrantedCandidates.length, 1);
assert.equal(ruleGrantedCandidates[0].attackSourceKind, "rule_granted");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_matchup_terminal_candidate_completeness_v1",
  candidatePlanHash: plan.candidatePlanHash,
  finalProgressHash: resumed.progress.progressHash,
  candidateMass: resumed.progress.mass,
  directProfileKeys: directCoverage.observedProfileKeys,
  movedMeleeProfileKeys: [
    movedShort.metadata.attackProfile.profileKey,
    movedLong.metadata.attackProfile.profileKey,
  ].sort(),
  stealthAutomaticMissObserved: true,
  trueSightOverrideObserved: true,
  modelBlockingRejected: true,
  terrainBlockingRejected: true,
  ruleGrantedCandidateObserved: true,
  claimBoundary: "This focused verifier proves candidate cursor mass conservation and Engine action/profile/LOS evidence preservation for the declared fixtures. It does not prove terminal optimality, complete board geometry, strategy value, or win rate.",
}, null, 2));
