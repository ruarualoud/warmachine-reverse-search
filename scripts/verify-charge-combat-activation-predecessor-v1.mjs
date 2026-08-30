import assert from "node:assert/strict";

import {
  bindWarmachineBenchmarkExplicitMovementPathV2,
  buildWarmachineBenchmarkStrictRollOutcomeV2,
  enumerateWarmachineBenchmarkActionsV2,
  executeWarmachineBenchmarkActivationV2,
} from "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import { generateWarmachineChargeCombatActivationPredecessorsV1 } from
  "../src/reverse/charge-combat-activation-predecessor-v1.mjs";
import { reverseWarmachineActivationSequenceV2 } from
  "../src/reverse/activation-sequence-predecessor-v2.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";
import { normalizeRulesV1State } from "../src/warmachine-host-runtime.mjs";

function piece({
  pieceKey,
  sideKey = "player1",
  position,
  activated = false,
  defense = 12,
  attackProfiles = [],
  unitGroupId = "",
} = {}) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey,
    modelRole: "solo",
    modelType: "warrior model",
    position,
    baseSizeIn: 1.18,
    speedIn: 6,
    defense,
    armor: 14,
    damage: { boxesRemaining: 8, maxBoxes: 8 },
    statusTags: [],
    attackProfiles,
    ...(unitGroupId ? { unitGroupId } : {}),
    resourceKind: "none",
    resourcePoints: 0,
    resource2: 0,
    activated,
  };
}

function meleeProfile() {
  return {
    profileKey: "charge-sword",
    name: "Charge Sword",
    mode: "melee",
    rangeIn: 1,
    power: 12,
    attackStatKind: "MAT",
    attackStat: 5,
    count: 1,
    rof: 1,
    specialRules: [],
  };
}

function stripPath(stateInput, pathKey) {
  const state = structuredClone(normalizeRulesV1State(stateInput));
  state.explicitMovementPaths = (state.explicitMovementPaths || []).filter((entry) =>
    String(entry.pathKey || entry.key || "") !== pathKey);
  for (const model of state.pieces || []) {
    model.explicitMovementPaths = (model.explicitMovementPaths || []).filter((entry) =>
      String(entry.pathKey || entry.key || "") !== pathKey);
  }
  return normalizeRulesV1State(state);
}

function completionAction(actions = []) {
  for (const type of [
    "end_initial_attack_window",
    "end_combat_purchase_window",
    "end_unit_trooper_combat_action",
    "end_any_time_activation_window",
    "pass",
  ]) {
    const action = actions.find((candidate) => candidate.actionType === type);
    if (action) return action;
  }
  return actions.find((action) =>
    /end_|pass|activation_complete/.test(action.actionType)) || null;
}

function differingPaths(left, right, path = "state", output = []) {
  if (Object.is(left, right)) return output;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    output.push({ path, left, right });
    return output;
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) {
    differingPaths(left[key], right[key], `${path}.${key}`, output);
  }
  return output;
}

const predecessor = normalizeRulesV1State({
  stateKey: "charge-combat-predecessor-fixture",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 2,
  strictMode: true,
  enforceStrictExecutor: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    piece({
      pieceKey: "charger",
      position: { xIn: 5, yIn: 5 },
      attackProfiles: [meleeProfile()],
    }),
    piece({
      pieceKey: "target",
      sideKey: "player2",
      position: { xIn: 13, yIn: 5 },
      defense: 18,
    }),
  ],
  terrain: [],
  scenario: {
    zones: [],
    flags: [],
    objectives: [],
    score: { player1: 0, player2: 0 },
  },
});

assert.throws(() => bindWarmachineBenchmarkExplicitMovementPathV2(
  predecessor,
  {
    actorPieceKey: "charger",
    actionType: "charge",
    waypoints: [{ xIn: 10.82, yIn: 5 }],
  },
), /targetPieceKey/);

const pathKey = "focused-charge-combat-path";
const prepared = bindWarmachineBenchmarkExplicitMovementPathV2(predecessor, {
  actorPieceKey: "charger",
  targetPieceKey: "target",
  actionType: "charge",
  pathKey,
  waypoints: [{ xIn: 10.82, yIn: 5 }],
});
const preparedEnumeration = enumerateWarmachineBenchmarkActionsV2(prepared, {
  activationGroupKey: "charger",
  actionFamilyKeys: ["attack_or_effect", "movement", "timing"],
  targetPieceKeys: ["target"],
  includeUntargetedActions: true,
});
assert.ok(
  preparedEnumeration.enumeration.actions.some((action) =>
    action.actorPieceKey === "charger" &&
      action.targetPieceKey === "target" &&
      action.actionType === "charge"),
  JSON.stringify({
    legal: preparedEnumeration.enumeration.actions.map((action) => ({
      actionKey: action.actionKey,
      actionType: action.actionType,
      targetPieceKey: action.targetPieceKey,
      destination: action.destination,
      lane: action.metadata?.explicitStraightChargeLaneKey,
    })),
    rejected: (preparedEnumeration.enumeration.rejectedActions || []).map((action) => ({
      actionKey: action.actionKey,
      actionType: action.actionType,
      targetPieceKey: action.targetPieceKey,
      reason: action.rejection?.reason,
      reasons: action.rejection?.reasons,
      checks: action.checks,
    })),
  }, null, 2),
);
let chargeRollOutcome = null;
const forward = executeWarmachineBenchmarkActivationV2(prepared, "charger", {
  routeKey: "focused-charge-combat-forward",
  repeatIntent: true,
  maxSteps: 12,
  enumerationScopeForStep: ({ stepIndex }) => stepIndex === 0
    ? {
      actionFamilyKeys: ["attack_or_effect", "movement", "timing"],
      targetPieceKeys: ["target"],
      includeUntargetedActions: true,
    }
    : {
      actionFamilyKeys: ["attack_or_effect", "resource", "timing"],
      targetPieceKeys: ["target"],
      includeUntargetedActions: true,
    },
  selectAction: ({ scoped, stepIndex }) => {
    if (stepIndex === 0) {
      const action = scoped.enumeration.actions.find((candidate) =>
        candidate.actorPieceKey === "charger" &&
        candidate.targetPieceKey === "target" &&
        candidate.actionType === "charge" &&
        candidate.metadata?.explicitStraightChargeLaneKey === pathKey);
      if (!action) return null;
      chargeRollOutcome = buildWarmachineBenchmarkStrictRollOutcomeV2(action, {
        attackDie: 1,
        damageDie: 1,
        locationDie: 1,
      });
      return {
        actionKey: action.actionKey,
        actionPatch: { strictRollOutcome: chargeRollOutcome },
      };
    }
    const action = completionAction(scoped.enumeration.actions);
    return action ? { actionKey: action.actionKey } : null;
  },
});
assert.equal(forward.ok, true, JSON.stringify({
  reason: forward.reason,
  audit: forward.selectionAudit,
}, null, 2));
assert.equal(forward.completed, true);
assert.ok(forward.receipts.some((receipt) => receipt.actionType === "charge"));
const successor = stripPath(forward.state, pathKey);
const expectedSearchPredecessor = stripPath(preparedEnumeration.state, pathKey);
assert.equal(successor.pieces.find((model) => model.pieceKey === "charger").activated, true);
assert.equal(successor.pieces.find((model) => model.pieceKey === "target")
  .damage.boxesRemaining, 8, "minimum dice should miss the high-DEF target");

const reverse = generateWarmachineChargeCombatActivationPredecessorsV1(
  successor,
  {
    sideKey: "player1",
    actorPieceKeys: ["charger"],
    targetPieceKeys: ["target"],
    includeAutomaticChargeOrigins: false,
    chargePredecessorProposals: [{
      proposalKey: "focused-charge-combat-preimage",
      actorPieceKey: "charger",
      targetPieceKey: "target",
      origin: { xIn: 5, yIn: 5 },
      actionPatchesByStep: {
        0: { strictRollOutcome: chargeRollOutcome },
      },
    }],
    rejectedAuditLimit: 8,
  },
);
assert.equal(reverse.ok, true, JSON.stringify({
  rejected: reverse.rejected,
  unresolved: reverse.unresolved,
}, null, 2));
assert.equal(reverse.strictCandidateCount, 1);
assert.equal(reverse.candidates[0].actionType, "charge");
assert.equal(reverse.candidates[0].strictReplaySteps[0].actionType, "charge");
assert.equal(
  reverse.candidates[0].predecessorStateHash,
  warmachineReverseStateSemanticHashV1(expectedSearchPredecessor),
  JSON.stringify(differingPaths(
    expectedSearchPredecessor,
    reverse.candidates[0].predecessorState,
  ).slice(0, 40), null, 2),
);

const automaticReverse =
  generateWarmachineChargeCombatActivationPredecessorsV1(successor, {
    sideKey: "player1",
    actorPieceKeys: ["charger"],
    targetPieceKeys: ["target"],
    includeAutomaticChargeOrigins: true,
    chargeOriginDistancesIn: [5.82],
  });
assert.equal(automaticReverse.ok, true, JSON.stringify({
  rejected: automaticReverse.rejected,
  unresolved: automaticReverse.unresolved,
}, null, 2));
assert.equal(automaticReverse.strictCandidateCount, 1);
assert.deepEqual(automaticReverse.candidates[0].movementProposal.origin, {
  xIn: 5,
  yIn: 5,
});

const activationSequence = reverseWarmachineActivationSequenceV2(successor, {
  sideKey: "player1",
  maximumDepth: 1,
  maximumLabels: 4,
  maximumUniqueStates: 4,
  stopAfterBoundaryRouteCount: 1,
  includePass: false,
  includeMovement: false,
  includeChargeCombat: true,
  chargeCombatActorPieceKeys: ["charger"],
  includeAutomaticChargeOrigins: false,
  chargeTargetPieceKeys: ["target"],
  chargePredecessorProposals: [{
    proposalKey: "focused-charge-combat-preimage",
    actorPieceKey: "charger",
    targetPieceKey: "target",
    origin: { xIn: 5, yIn: 5 },
    actionPatchesByStep: {
      0: { strictRollOutcome: chargeRollOutcome },
    },
  }],
});
assert.equal(activationSequence.ok, true, JSON.stringify({
  rejected: activationSequence.rejected,
  unresolved: activationSequence.unresolved,
}, null, 2));
assert.equal(activationSequence.boundaryRouteCount, 1);
assert.equal(
  activationSequence.boundaries[0].reverseEdges[0].operatorKey,
  "charge_combat_activation_inverse_v1",
);
const scopedOutActivationSequence = reverseWarmachineActivationSequenceV2(successor, {
  sideKey: "player1",
  maximumDepth: 1,
  maximumLabels: 4,
  maximumUniqueStates: 4,
  includePass: false,
  includeMovement: false,
  includeChargeCombat: true,
  chargeCombatActorPieceKeys: ["different-actor"],
  chargeTargetPieceKeys: ["target"],
});
assert.equal(scopedOutActivationSequence.ok, false);
assert.ok(scopedOutActivationSequence.unresolved.some((row) =>
  row.reason === "charge_combat_actor_scope_not_enabled" &&
  row.detail?.actorPieceKey === "charger"));

const unitPredecessor = normalizeRulesV1State({
  ...predecessor,
  stateKey: "unit-charge-combat-predecessor-fixture",
  pieces: [
    piece({
      pieceKey: "unit-charger",
      position: { xIn: 5, yIn: 15 },
      attackProfiles: [meleeProfile()],
      unitGroupId: "charge-unit",
    }),
    piece({
      pieceKey: "unit-grunt",
      position: { xIn: 5, yIn: 17 },
      attackProfiles: [meleeProfile()],
      unitGroupId: "charge-unit",
    }),
    piece({
      pieceKey: "unit-target",
      sideKey: "player2",
      position: { xIn: 14, yIn: 15 },
      defense: 18,
    }),
  ],
});
const unitPathKey = "focused-unit-charge-combat-path";
const preparedUnit = bindWarmachineBenchmarkExplicitMovementPathV2(
  unitPredecessor,
  {
    actorPieceKey: "unit-charger",
    targetPieceKey: "unit-target",
    actionType: "charge",
    pathKey: unitPathKey,
    waypoints: [{ xIn: 11.82, yIn: 15 }],
  },
);
const preparedUnitEnumeration = enumerateWarmachineBenchmarkActionsV2(
  preparedUnit,
  {
    activationGroupKey: "charge-unit",
    actionFamilyKeys: ["attack_or_effect", "movement", "timing"],
    targetPieceKeys: ["unit-target"],
    includeUntargetedActions: true,
  },
);
const unitActionPatchesByStep = {};
const unitForward = executeWarmachineBenchmarkActivationV2(
  preparedUnit,
  "charge-unit",
  {
    routeKey: "focused-unit-charge-combat-forward",
    repeatIntent: true,
    maxSteps: 24,
    enumerationScopeForStep: ({ stepIndex }) => stepIndex === 0
      ? {
        actionFamilyKeys: ["attack_or_effect", "movement", "timing"],
        targetPieceKeys: ["unit-target"],
        includeUntargetedActions: true,
      }
      : {
        actionFamilyKeys: ["attack_or_effect", "resource", "timing"],
        targetPieceKeys: ["unit-target"],
        includeUntargetedActions: true,
      },
    selectAction: ({ scoped, stepIndex }) => {
      if (stepIndex === 0) {
        const action = scoped.enumeration.actions.find((candidate) =>
          candidate.actorPieceKey === "unit-charger" &&
          candidate.targetPieceKey === "unit-target" &&
          candidate.actionType === "unit_group_charge" &&
          candidate.metadata?.explicitStraightChargeLaneKey === unitPathKey);
        return action ? { actionKey: action.actionKey } : null;
      }
      const chargeAttack = scoped.enumeration.actions.find((action) =>
        action.targetPieceKey === "unit-target" &&
        action.actionType === "unit_charge_melee_attack");
      if (chargeAttack) {
        const actionPatch = {
          strictRollOutcome: buildWarmachineBenchmarkStrictRollOutcomeV2(
            chargeAttack,
            { attackDie: 1, damageDie: 1, locationDie: 1 },
          ),
        };
        unitActionPatchesByStep[stepIndex] = actionPatch;
        return { actionKey: chargeAttack.actionKey, actionPatch };
      }
      const action = completionAction(scoped.enumeration.actions);
      return action ? { actionKey: action.actionKey } : null;
    },
  },
);
assert.equal(unitForward.ok, true, JSON.stringify({
  reason: unitForward.reason,
  audit: unitForward.selectionAudit,
}, null, 2));
assert.equal(unitForward.completed, true);
assert.ok(unitForward.receipts.some((receipt) =>
  receipt.actionType === "unit_group_charge"));
assert.ok(unitForward.receipts.some((receipt) =>
  receipt.actionType === "unit_charge_melee_attack"));
const unitSuccessor = stripPath(unitForward.state, unitPathKey);
const unitExpectedPredecessor = stripPath(
  preparedUnitEnumeration.state,
  unitPathKey,
);
const unitReverse = generateWarmachineChargeCombatActivationPredecessorsV1(
  unitSuccessor,
  {
    sideKey: "player1",
    actorPieceKeys: ["unit-charger", "unit-grunt"],
    targetPieceKeys: ["unit-target"],
    includeAutomaticChargeOrigins: false,
    chargePredecessorProposals: [{
      proposalKey: "focused-unit-charge-combat-preimage",
      actorPieceKey: "unit-charger",
      targetPieceKey: "unit-target",
      origin: { xIn: 5, yIn: 15 },
      originsByPieceKey: {
        "unit-charger": { xIn: 5, yIn: 15 },
        "unit-grunt": { xIn: 5, yIn: 17 },
      },
      actionPatchesByStep: unitActionPatchesByStep,
    }],
  },
);
assert.equal(unitReverse.ok, true, JSON.stringify({
  rejected: unitReverse.rejected,
  unresolved: unitReverse.unresolved,
}, null, 2));
assert.equal(unitReverse.strictCandidateCount, 1);
assert.equal(unitReverse.candidates[0].actionType, "unit_group_charge");
assert.equal(
  unitReverse.candidates[0].predecessorStateHash,
  warmachineReverseStateSemanticHashV1(unitExpectedPredecessor),
  JSON.stringify(differingPaths(
    unitExpectedPredecessor,
    unitReverse.candidates[0].predecessorState,
  ).slice(0, 40), null, 2),
);

const failedChargePredecessor = normalizeRulesV1State({
  ...predecessor,
  stateKey: "failed-charge-predecessor-fixture",
  pieces: [
    piece({
      pieceKey: "failed-charger",
      position: { xIn: 5, yIn: 25 },
      attackProfiles: [meleeProfile()],
    }),
    piece({
      pieceKey: "distant-target",
      sideKey: "player2",
      position: { xIn: 25, yIn: 25 },
      defense: 18,
    }),
  ],
});
const failedChargePathKey = "focused-failed-charge-path";
const preparedFailedCharge = bindWarmachineBenchmarkExplicitMovementPathV2(
  failedChargePredecessor,
  {
    actorPieceKey: "failed-charger",
    targetPieceKey: "distant-target",
    actionType: "charge",
    pathKey: failedChargePathKey,
    waypoints: [{ xIn: 14, yIn: 25 }],
  },
);
const preparedFailedEnumeration = enumerateWarmachineBenchmarkActionsV2(
  preparedFailedCharge,
  {
    activationGroupKey: "failed-charger",
    actionFamilyKeys: ["attack_or_effect", "movement", "timing"],
    targetPieceKeys: ["distant-target"],
    includeUntargetedActions: true,
  },
);
const failedChargeForward = executeWarmachineBenchmarkActivationV2(
  preparedFailedCharge,
  "failed-charger",
  {
    routeKey: "focused-failed-charge-forward",
    repeatIntent: true,
    maxSteps: 4,
    enumerationScopeForStep: () => ({
      actionFamilyKeys: ["attack_or_effect", "movement", "timing"],
      targetPieceKeys: ["distant-target"],
      includeUntargetedActions: true,
    }),
    selectAction: ({ scoped, stepIndex }) => {
      if (stepIndex > 0) return null;
      const action = scoped.enumeration.actions.find((candidate) =>
        candidate.actorPieceKey === "failed-charger" &&
        candidate.targetPieceKey === "distant-target" &&
        candidate.actionType === "failed_charge" &&
        candidate.metadata?.explicitStraightChargeLaneKey ===
          failedChargePathKey);
      return action ? { actionKey: action.actionKey } : null;
    },
  },
);
assert.equal(failedChargeForward.ok, true, JSON.stringify({
  reason: failedChargeForward.reason,
  audit: failedChargeForward.selectionAudit,
}, null, 2));
assert.equal(failedChargeForward.completed, true);
assert.deepEqual(
  failedChargeForward.receipts.map((receipt) => receipt.actionType),
  ["failed_charge"],
);
const failedChargeSuccessor = stripPath(
  failedChargeForward.state,
  failedChargePathKey,
);
const failedChargeExpectedPredecessor = stripPath(
  preparedFailedEnumeration.state,
  failedChargePathKey,
);
const failedChargeReverse =
  generateWarmachineChargeCombatActivationPredecessorsV1(
    failedChargeSuccessor,
    {
      sideKey: "player1",
      actorPieceKeys: ["failed-charger"],
      targetPieceKeys: ["distant-target"],
      includeAutomaticChargeOrigins: false,
      chargePredecessorProposals: [{
        proposalKey: "focused-failed-charge-preimage",
        actorPieceKey: "failed-charger",
        targetPieceKey: "distant-target",
        origin: { xIn: 5, yIn: 25 },
      }],
    },
  );
assert.equal(failedChargeReverse.ok, true, JSON.stringify({
  rejected: failedChargeReverse.rejected,
  unresolved: failedChargeReverse.unresolved,
}, null, 2));
assert.equal(failedChargeReverse.strictCandidateCount, 1);
assert.equal(failedChargeReverse.candidates[0].actionType, "failed_charge");
assert.equal(
  failedChargeReverse.candidates[0].operatorKey,
  "failed_charge_activation_inverse_v1",
);
assert.equal(
  failedChargeReverse.candidates[0].predecessorStateHash,
  warmachineReverseStateSemanticHashV1(failedChargeExpectedPredecessor),
);

const impossible = generateWarmachineChargeCombatActivationPredecessorsV1(
  successor,
  {
    sideKey: "player1",
    actorPieceKeys: ["charger"],
    targetPieceKeys: ["target"],
    includeAutomaticChargeOrigins: false,
    chargePredecessorProposals: [{
      proposalKey: "too-far-charge-combat-preimage",
      actorPieceKey: "charger",
      targetPieceKey: "target",
      origin: { xIn: 1, yIn: 5 },
      actionPatchesByStep: {
        0: { strictRollOutcome: chargeRollOutcome },
      },
    }],
  },
);
assert.equal(impossible.strictCandidateCount, 0);
assert.equal(impossible.ok, false);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: reverse.schemaVersion,
  predecessorStateHash: reverse.candidates[0].predecessorStateHash,
  successorStateHash: reverse.successorStateHash,
  strictReplayActionTypes:
    reverse.candidates[0].strictReplaySteps.map((step) => step.actionType),
  strictReceiptHash: reverse.candidates[0].strictReceiptHash,
  activationSequenceBoundaryRouteCount: activationSequence.boundaryRouteCount,
  automaticStrictCandidateCount: automaticReverse.strictCandidateCount,
  unitStrictReplayActionTypes:
    unitReverse.candidates[0].strictReplaySteps.map((step) => step.actionType),
  failedChargeStrictReplayActionTypes:
    failedChargeReverse.candidates[0].strictReplaySteps.map((step) =>
      step.actionType),
  impossibleRejectedCount: impossible.strictRejectedCount,
  impossibleUnresolvedCount: impossible.unresolvedCount,
}, null, 2));
