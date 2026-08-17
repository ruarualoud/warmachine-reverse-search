#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import { auditWarmachineHostRuleGapFeedbackV1 } from
  "../src/validation/host-rule-gap-feedback-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const OLD_HOST_RECEIPT =
  "80ce324eb55d360e09f7c0a4e66c9e9c4b491fe358112adaeb5503a7bb8dd14e";
const TICKET_02_HOST_RECEIPT =
  "9dcce05e8e67430078b64f0a3dc1d6682e4e72f802f5c881f954eca1b50eb886";
const RAMPANT_FURY_SOURCE_ID = "3b732042-b688-4033-8341-ec7dd7312ef4";
const RAMPANT_FURY_TEXT =
  "Once per turn, after this model frenzies, it immediately frenzies again as part of the same activation.";
const FEAST_TWO_SOURCE_ID = "78d5efb4-3cfc-414d-b839-37dd8c52f0fc";
const FEAST_TWO_TEXT =
  "Once per turn during this model's activation, when it boxes an enemy model with a melee attack, it can remove the enemy model from play. If it does, this model's battlegroup controller gains two hunger points.";

function rule(id, ruleKey, name, description) {
  return { id, sourceIds: [id], sourceTexts: [description], ruleKey, name, description };
}

function piece(overrides = {}) {
  const boxes = overrides.boxesRemaining ?? 20;
  return {
    pieceKey: overrides.pieceKey || "piece",
    label: overrides.label || overrides.pieceKey || "Piece",
    sideKey: overrides.sideKey || "player1",
    modelRole: overrides.modelRole || "warrior",
    modelType: overrides.modelType || overrides.modelRole || "warrior",
    traits: overrides.traits || ["living"],
    position: overrides.position || { xIn: 5, yIn: 12 },
    baseSizeIn: overrides.baseSizeIn ?? 1.57,
    speedIn: overrides.speedIn ?? 7,
    meleeRangeIn: overrides.meleeRangeIn ?? 1,
    defense: overrides.defense ?? 12,
    armor: overrides.armor ?? 18,
    mat: overrides.mat ?? 7,
    damage: { boxesRemaining: boxes, maxBoxes: overrides.maxBoxes ?? boxes },
    statusTags: overrides.statusTags || [],
    specialRules: overrides.specialRules || [],
    attackProfiles: overrides.attackProfiles || [],
    ...overrides,
  };
}

const rampantFuryRule = rule(
  RAMPANT_FURY_SOURCE_ID,
  "unmapped_rampant_fury",
  "Rampant Fury",
  RAMPANT_FURY_TEXT,
);
const feastTwoRule = rule(
  FEAST_TWO_SOURCE_ID,
  "feast",
  "Feast [2]",
  FEAST_TWO_TEXT,
);
const staleRampantFuryRule = rule(
  RAMPANT_FURY_SOURCE_ID,
  "unmapped_rampant_fury",
  "Rampant Fury",
  "Once per turn, after this model frenzies, it can make one additional melee attack.",
);
const state = {
  stateKey: "rule-gap-feedback-rampant-fury-vordak",
  strictMode: true,
  ruleAtomRuntimeMode: "authoritative",
  activeSideKey: "player1",
  phaseKey: "control",
  turnNumber: 2,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    piece({
      pieceKey: "vordak",
      label: "Vordak",
      modelRole: "warbeast",
      modelType: "warbeast",
      resourceKind: "fury",
      resourcePoints: 3,
      resourceMax: 5,
      furyThreshold: 2,
      canBeLeeched: true,
      canForceFury: true,
      battlegroupId: "vordak-bg",
      battlegroupControllerPieceKey: "warlock",
      controllerPieceKey: "warlock",
      statusTags: ["force_frenzy"],
      specialRules: [rampantFuryRule, feastTwoRule],
      attackProfiles: [{
        profileKey: "vordak-razor-maw",
        name: "Razor Maw",
        mode: "melee",
        rangeIn: 1,
        power: 18,
        attackStat: 7,
        attackStatKind: "MAT",
        specialRules: [],
      }],
    }),
    piece({
      pieceKey: "enemy",
      label: "One-box Enemy",
      sideKey: "player2",
      position: { xIn: 10, yIn: 12 },
      armor: 10,
      boxesRemaining: 1,
      maxBoxes: 1,
    }),
  ],
  terrain: [],
  commandCards: [],
  scenario: {
    zones: [],
    flags: [],
    actionObjectives: [],
    score: { player1: 0, player2: 0 },
    victoryThreshold: 5,
  },
};

const feedback = auditWarmachineHostRuleGapFeedbackV1({
  gapKey: "sepsira-fane-vordak-rampant-fury-20260814",
  previous: {
    hostReceiptHash: OLD_HOST_RECEIPT,
    disposition: "rules_unknown",
    reason: "strict_unmapped_rule_source",
    ruleKey: "unmapped_rampant_fury",
    atomKey: "rampant_fury_same_activation_second_frenzy",
    rejectedAction: {
      actorPieceKey: "vordak",
      actionType: "melee_attack",
      ruleKey: "unmapped_rampant_fury",
      implementationStatus: "recognized_unmodeled",
    },
  },
  sourceRule: rampantFuryRule,
  state,
  actionSelector: {
    actorPieceKey: "vordak",
    targetPieceKey: "enemy",
    actionType: "frenzy_charge",
  },
  actionPatch: {
    metadata: {
      strictRollOutcome: {
        attackDice: [6, 6, 6],
        damageDice: [6, 6, 6],
        locationDice: [3],
      },
    },
  },
  affectedArtifacts: [
    {
      artifactKey: "ticket02-task-terminal-root",
      artifactKind: "strict_terminal_root",
      hostReceiptHash: TICKET_02_HOST_RECEIPT,
    },
    {
      artifactKey: "ticket02-terminal-demand-evidence-corpus",
      artifactKind: "demand_evidence",
      hostReceiptHash: TICKET_02_HOST_RECEIPT,
    },
    {
      artifactKey: "ticket02-terminal-demand-routing-task-evidence",
      artifactKind: "routing_evidence",
      hostReceiptHash: TICKET_02_HOST_RECEIPT,
    },
    {
      artifactKey: "current-host-stale-rule-source-evidence",
      artifactKind: "rule_source_dependent_evidence",
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      ruleSourceFingerprint: stableGraphHash(staleRampantFuryRule),
    },
  ],
});

const staleState = structuredClone(state);
staleState.stateKey = "rule-gap-feedback-rampant-fury-source-drift";
staleState.pieces.find((candidate) => candidate.pieceKey === "vordak").specialRules = [
  staleRampantFuryRule,
  feastTwoRule,
];
const unresolvedFeedback = auditWarmachineHostRuleGapFeedbackV1({
  gapKey: "sepsira-fane-vordak-rampant-fury-source-drift",
  previous: {
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    disposition: "rules_unknown",
    reason: "rule_atom_source_contract_mismatch",
    ruleKey: "unmapped_rampant_fury",
    atomKey: "rampant_fury_same_activation_second_frenzy",
  },
  sourceRule: staleRampantFuryRule,
  state: staleState,
  actionSelector: {
    actorPieceKey: "vordak",
    targetPieceKey: "enemy",
    actionType: "frenzy_charge",
  },
});

assert.equal(feedback.current.hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.notEqual(feedback.current.hostReceiptHash, OLD_HOST_RECEIPT);
assert.notEqual(feedback.current.hostReceiptHash, TICKET_02_HOST_RECEIPT);
assert.equal(feedback.hostReceiptChanged, true);
assert.equal(feedback.previous.disposition, "rules_unknown");
assert.equal(feedback.current.disposition, "strict_transition_accepted");
assert.equal(feedback.dispositionChanged, true);
assert.equal(feedback.resolutionProven, true);
assert.equal(feedback.current.sourceContractMatched, true);
assert.equal(feedback.current.legalPayloadStable, true);
assert.equal(feedback.current.transitionStable, true);
assert.equal(feedback.current.firstTransition.lifecycleStage, "boxed");
assert.equal(feedback.current.firstTransition.eventTypes.includes(
  "lifecycle_trigger_choice_window_opened"), true);
assert.equal(feedback.current.firstTransition.eventTypes.includes(
  "rampant_fury_second_frenzy_window_opened"), false);
assert.equal(feedback.interactionClosure.atomKeys.includes(
  "rampant_fury_same_activation_second_frenzy"), true);
assert.equal(feedback.interactionClosure.atomKeys.includes(
  "feast_two_melee_box_optional_rfp_controller_hunger"), true);
assert.equal(feedback.interactionClosure.relatedRuleKeys.includes("attack_lifecycle"), true);
assert.equal(feedback.interactionClosure.relatedRuleKeys.includes("boxed"), true);
assert.equal(feedback.invalidatedArtifactCount, 4);
assert.equal(feedback.affectedArtifacts.every((artifact) =>
  artifact.invalidated && artifact.requiredAction === "rebuild_and_independently_replay"), true);
assert.deepEqual(feedback.affectedArtifacts.find((artifact) =>
  artifact.artifactKey === "current-host-stale-rule-source-evidence")
  ?.invalidationReasons, ["rule_source_changed"]);
assert.equal(feedback.rebuildRequired, true);
assert.equal(feedback.hardPruneAllowed, false);
assert.equal(feedback.trainingTruth, false);
assert.equal(["rules_unknown", "strict_rejected"].includes(
  unresolvedFeedback.current.disposition), true);
assert.equal(unresolvedFeedback.current.sourceContractMatched, false);
assert.equal(unresolvedFeedback.resolutionProven, false);
assert.equal(unresolvedFeedback.hardPruneAllowed, false);
assert.equal(unresolvedFeedback.trainingTruth, false);
const { feedbackHash, ...feedbackCore } = feedback;
assert.equal(feedbackHash, stableGraphHash(feedbackCore));

const outputDirectory = path.resolve(
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/host-rule-gap-feedback",
);
const outputPath = path.join(outputDirectory, "rampant-fury-v20260814.json");
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(feedback, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  outputPath,
  feedbackHash,
  previousHostReceiptHash: OLD_HOST_RECEIPT,
  currentHostReceiptHash: feedback.current.hostReceiptHash,
  previousDisposition: feedback.previous.disposition,
  currentDisposition: feedback.current.disposition,
  unresolvedSourceDriftDisposition: unresolvedFeedback.current.disposition,
  interactionAtomCount: feedback.interactionClosure.atomKeys.length,
  interactionRuleCount: feedback.interactionClosure.relatedRuleKeys.length,
  invalidatedArtifactCount: feedback.invalidatedArtifactCount,
  rebuildRequired: feedback.rebuildRequired,
}, null, 2));
