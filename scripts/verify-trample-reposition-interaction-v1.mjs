#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  applyRulesV1Action,
  buildWarmachineRulesV1ActionWithStrictRngOutcome,
  enumerateRulesV1Actions,
  recognizedWarmachineRuleAtoms,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";
import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";

const REPOSITION_ATOM_KEY = "reposition_activation_end_independent_advances";
const REPOSITION_TRAMPLE_INTERACTION_KEY = "reposition_ordinary_trample_eligibility";

function repositionRule(distanceIn = 3) {
  return {
    ruleKey: "reposition",
    name: `Reposition [${distanceIn}\"]`,
    sourceIds: ["178d5f31-5795-405f-9157-538e0531cda6"],
    sourceTexts: [
      `At the end of this model/unit's activation in which it did not run or fail a charge, this model can advance up to ${distanceIn}\", then its activation ends.`,
    ],
  };
}

function piece(overrides = {}) {
  return {
    pieceKey: overrides.pieceKey,
    label: overrides.label || overrides.pieceKey,
    sideKey: overrides.sideKey || "player1",
    modelRole: "warrior",
    modelType: "model",
    position: overrides.position,
    baseSizeIn: overrides.baseSizeIn ?? 1.18,
    speedIn: overrides.speedIn ?? 6,
    meleeRangeIn: 1,
    mat: 7,
    defense: 12,
    armor: 14,
    meleePower: overrides.meleePower ?? 12,
    powerAttackTypes: overrides.powerAttackTypes || [],
    resourceKind: overrides.resourceKind || "",
    resourcePoints: overrides.resourcePoints ?? 0,
    resourceMax: overrides.resourceMax ?? overrides.resourcePoints ?? 0,
    damage: {
      boxesRemaining: overrides.boxesRemaining ?? 8,
      maxBoxes: overrides.maxBoxes ?? overrides.boxesRemaining ?? 8,
    },
    statusTags: [],
    specialRules: overrides.specialRules || [],
    attackProfiles: [],
    activated: false,
  };
}

function strictState(pieces) {
  return {
    stateKey: "strict-ordinary-trample-then-reposition-v1",
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 1,
    strictMode: true,
    enforceStrictExecutor: true,
    ruleAtomRuntimeMode: "authoritative",
    board: { widthIn: 24, heightIn: 24 },
    pieces,
    terrain: [],
    scenario: {
      zones: [],
      flags: [],
      objectives: [],
      score: { player1: 0, player2: 0 },
      victoryThreshold: 5,
    },
  };
}

function requireAction(state, predicate, label) {
  const enumeration = enumerateRulesV1Actions(state);
  const selected = enumeration.actions.find(predicate);
  assert.ok(selected, `${label}; legal=${enumeration.actions.map((action) => action.actionType).join(",")}`);
  return selected;
}

const repositionAtom = recognizedWarmachineRuleAtoms()
  .find((atom) => atom.atomKey === REPOSITION_ATOM_KEY);
assert.ok(repositionAtom, "Reposition atom must exist in the current Host registry");
const trampleInteraction = repositionAtom.interactions?.find((interaction) =>
  interaction.interactionKey === REPOSITION_TRAMPLE_INTERACTION_KEY);
assert.ok(trampleInteraction, "Reposition interaction graph must bind ordinary trample eligibility");
assert.deepEqual(
  trampleInteraction.relatedRuleKeys,
  ["trample", "power_attack", "activation_end", "reposition"],
);

const trampler = piece({
  pieceKey: "trample-reposition-actor",
  position: { xIn: 5, yIn: 20 },
  baseSizeIn: 2,
  powerAttackTypes: ["trample"],
  resourceKind: "generic_resource",
  specialRules: [repositionRule(3)],
});
const target = piece({
  pieceKey: "trample-reposition-target",
  sideKey: "player2",
  position: { xIn: 8, yIn: 20 },
  boxesRemaining: 1,
});
const initialState = strictState([trampler, target]);
const trample = requireAction(
  initialState,
  (action) => action.actionType === "trample_power_attack" &&
    action.actorPieceKey === trampler.pieceKey &&
    action.targetPieceKey === target.pieceKey,
  "ordinary trample action",
);
const strictTrample = buildWarmachineRulesV1ActionWithStrictRngOutcome(trample, {
  room: { id: "strict-ordinary-trample-then-reposition-v1" },
  sourceContext: { rulesV1State: initialState },
  selectedActionKey: trample.actionKey,
});
const trampleTransition = applyRulesV1Action(initialState, strictTrample);
assert.equal(trampleTransition.ok, true, trampleTransition.reason);
assert.equal(
  Boolean(trampleTransition.nextState.anyTimeActivationWindow?.active),
  false,
  "with no other any-time choices, ordinary trample should proceed directly to Reposition",
);
assert.deepEqual(
  trampleTransition.nextState.repositionWindow?.pendingModelPieceKeys,
  [trampler.pieceKey],
);
assert.equal(
  trampleTransition.nextState.repositionWindow?.sourceActionType,
  "trample_power_attack",
);
assert.equal(
  trampleTransition.nextState.pieces.find((entry) => entry.pieceKey === trampler.pieceKey)?.activated,
  false,
  "the activation remains open until Reposition is moved or declined",
);
assert.ok(trampleTransition.events.some((event) =>
  event.eventType === "reposition_window_opened" &&
  event.sourceActionType === "trample_power_attack"));

const reposition = requireAction(
  trampleTransition.nextState,
  (action) => action.actionType === "reposition_window_advance" &&
    action.actorPieceKey === trampler.pieceKey,
  "Reposition advance after ordinary trample",
);
const positionBeforeReposition = structuredClone(
  trampleTransition.nextState.pieces.find((entry) => entry.pieceKey === trampler.pieceKey)?.position,
);
const repositionTransition = applyRulesV1Action(trampleTransition.nextState, {
  actionKey: reposition.actionKey,
});
assert.equal(repositionTransition.ok, true, repositionTransition.reason);
const positionAfterReposition = repositionTransition.nextState.pieces
  .find((entry) => entry.pieceKey === trampler.pieceKey)?.position;
assert.notDeepEqual(positionAfterReposition, positionBeforeReposition);
assert.equal(repositionTransition.nextState.repositionWindow, null);
assert.equal(
  repositionTransition.nextState.pieces.find((entry) => entry.pieceKey === trampler.pieceKey)?.activated,
  true,
);
assert.ok(repositionTransition.events.some((event) =>
  event.eventType === "post_activation_reposition_move" &&
  event.actorPieceKey === trampler.pieceKey));
assert.ok(repositionTransition.events.some((event) =>
  event.eventType === "activation_complete" &&
  event.actorPieceKey === trampler.pieceKey));

const evidence = {
  schemaVersion: "warmachine_trample_reposition_interaction_evidence_v1",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  atomKey: REPOSITION_ATOM_KEY,
  interactionKey: REPOSITION_TRAMPLE_INTERACTION_KEY,
  trampleActionKey: trample.actionKey,
  repositionActionKey: reposition.actionKey,
  positionBeforeReposition,
  positionAfterReposition,
  targetDestroyedByTrample: Boolean(trampleTransition.nextState.pieces
    .find((entry) => entry.pieceKey === target.pieceKey)?.destroyed),
  activationCompletedAfterReposition: true,
  claimBoundary: "This proves one ordinary strict trample can reach and execute Reposition. Run, failed charge, Frenzy, other displacement sources, and tactical value remain separate contracts.",
};

console.log(JSON.stringify({
  ok: true,
  ...evidence,
  evidenceHash: stableGraphHash(evidence),
}, null, 2));
