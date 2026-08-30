#!/usr/bin/env node

import assert from "node:assert/strict";

import { enumerateWarmachineBenchmarkActionsV2 } from
  "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import { canonicalWarmachineActingSideActionsV1 } from
  "../src/search/opponent-response-v1.mjs";
import { expandWarmachineStrictPolicyStepV1 } from
  "../src/search/strict-policy-step-v1.mjs";

function piece(overrides = {}) {
  const boxesRemaining = overrides.boxesRemaining ?? 12;
  return {
    pieceKey: overrides.pieceKey || "piece",
    label: overrides.pieceKey || "Piece",
    sideKey: overrides.sideKey || "player1",
    modelRole: overrides.modelRole || "warrior",
    modelType: overrides.modelType || overrides.modelRole || "warrior",
    position: overrides.position || { xIn: 6, yIn: 6 },
    baseSizeIn: overrides.baseSizeIn ?? 1.18,
    speedIn: 6,
    meleeRangeIn: 1,
    defense: overrides.defense ?? 10,
    armor: overrides.armor ?? 10,
    mat: overrides.mat ?? 8,
    resourceKind: overrides.resourceKind || "none",
    resourcePoints: overrides.resourcePoints ?? 0,
    resourceMax: overrides.resourceMax ?? 0,
    controlRangeIn: overrides.controlRangeIn ?? 12,
    damage: { boxesRemaining, maxBoxes: overrides.maxBoxes ?? boxesRemaining },
    statusTags: [],
    attackProfiles: overrides.attackProfiles || [],
    ...overrides,
  };
}

function lifeSpiralDamage() {
  const aspectKeys = ["mind", "body", "spirit"];
  const lifeSpiralRows = Array.from({ length: 9 }, (_entry, rowIndex) =>
    Array.from({ length: 3 }, () => ({
      systemKey: aspectKeys[Math.floor(rowIndex / 3)],
      marked: false,
    })));
  return {
    boxesRemaining: 27,
    maxBoxes: 27,
    systems: { mind: 9, body: 9, spirit: 9 },
    lifeSpiralRows,
  };
}

const state = {
  stateKey: "strict-policy-step-v1",
  activeSideKey: "player2",
  phaseKey: "activation",
  turnNumber: 2,
  strictMode: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    piece({
      pieceKey: "defender-lock",
      modelRole: "warlock",
      modelType: "warlock",
      isWarlock: true,
      isWarrior: true,
      resourceKind: "fury",
      resourcePoints: 1,
      resourceMax: 6,
      battlegroupId: "defender-bg",
      boxesRemaining: 5,
      maxBoxes: 5,
    }),
    piece({
      pieceKey: "defender-beast",
      modelRole: "warbeast",
      modelType: "warbeast",
      position: { xIn: 9, yIn: 6 },
      baseSizeIn: 1.57,
      resourceKind: "fury",
      resourcePoints: 0,
      resourceMax: 4,
      controllerPieceKey: "defender-lock",
      battlegroupId: "defender-bg",
      damage: lifeSpiralDamage(),
    }),
    piece({
      pieceKey: "attacker",
      sideKey: "player2",
      modelRole: "warjack",
      modelType: "warjack",
      isWarjack: true,
      position: { xIn: 7, yIn: 6 },
      resourceKind: "focus",
      resourcePoints: 1,
      resourceMax: 3,
      attackProfiles: [{
        profileKey: "execution-blade",
        name: "Execution Blade",
        mode: "melee",
        rangeIn: 1,
        power: 20,
        attackStat: 8,
        attackStatKind: "MAT",
      }],
    }),
  ],
  terrain: [],
  scenario: { zones: [], flags: [], score: { player1: 0, player2: 0 }, victoryThreshold: 5 },
};

const attackStep = expandWarmachineStrictPolicyStepV1(state, ({ state: currentState }) => {
  const scoped = enumerateWarmachineBenchmarkActionsV2(currentState, {
    actorPieceKeys: ["attacker"],
    targetPieceKeys: ["defender-lock"],
    actionFamilyKeys: ["attack_or_effect", "resource", "timing"],
    includeUntargetedActions: false,
  });
  const action = canonicalWarmachineActingSideActionsV1(scoped.enumeration).find((candidate) =>
    candidate.actionKey === "attacker:melee:defender-lock:execution-blade:v1");
  return { scoped, action, nextPolicyCursor: 1 };
}, { perspectiveSideKey: "player2" });

assert.equal(attackStep.stepType, "chance");
assert.equal(attackStep.chanceAudit.exactComplete, true);
assert.equal(attackStep.chanceAudit.equivalenceMassConserved, true);
assert.equal(attackStep.responseSet.ownerSideKey, "player1");
assert.equal(attackStep.responseSet.decisionKind, "damage_transfer");
assert.equal(attackStep.strictRejectedResponseCount, 0);
assert.ok(attackStep.groups.length > 0);
assert.ok(attackStep.groups.every((group) => group.responses.every((response) =>
  response.transitionAccepted &&
  response.postResponseChanceExactComplete === true &&
  response.postResponseOutcomes.length > 0 &&
  response.postResponseOutcomes.every((outcome) => outcome.receiptHash) &&
  response.equivalentExecutionEvidence.every((evidence) =>
    evidence.postResponseOutcomeEvidence.length > 0 &&
    evidence.postResponseOutcomeEvidence.every((outcome) => outcome.receiptHash)))));
assert.ok(attackStep.groups.some((group) => group.responses.some((response) =>
  response.choice === "transfer" &&
  response.postResponseOutcomes.length === 6)));

const deterministicStep = expandWarmachineStrictPolicyStepV1(state, ({ state: currentState }) => {
  const scoped = enumerateWarmachineBenchmarkActionsV2(currentState, {
    actorPieceKeys: ["attacker"],
    actionFamilyKeys: ["timing"],
    includeUntargetedActions: true,
  });
  const action = canonicalWarmachineActingSideActionsV1(scoped.enumeration).find((candidate) =>
    candidate.actorPieceKey === "attacker" && !candidate.metadata?.attackResolution);
  return { scoped, action, deterministicAction: true, nextPolicyCursor: 1 };
});
assert.equal(deterministicStep.stepType, "deterministic");
assert.equal(deterministicStep.successor.transitionAccepted, true);
assert.ok(deterministicStep.successor.receiptHash);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: attackStep.schemaVersion,
  chanceClassCount: attackStep.chanceAudit.classCount,
  equivalenceGroupCount: attackStep.chanceAudit.equivalenceGroupCount,
  mergedClassCount: attackStep.chanceAudit.mergedClassCount,
  responseCount: attackStep.responseSet.responseCount,
  deterministicActionKey: deterministicStep.action.actionKey,
}, null, 2));
