#!/usr/bin/env node

import assert from "node:assert/strict";

import { enumerateWarmachineBenchmarkActionsV2 } from
  "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import {
  buildWarmachineExactActionChanceClasses,
  buildWarmachineExactPostResponseChanceClassesV1,
} from "../src/search/chance-outcomes-v1.mjs";
import { executeWarmachineExactPostResponseChanceV1 } from
  "../src/search/post-response-chance-execution-v1.mjs";
import {
  buildWarmachineOpponentResponseSetV1,
  canonicalWarmachineActingSideActionsV1,
} from "../src/search/opponent-response-v1.mjs";

const action = {
  actionKey: "attacker:melee:warlock:test-weapon:v1",
  actionType: "melee_attack",
};
const primaryChanceClass = {
  classKey: "primary-hit-positive-damage",
  hit: true,
  resolvedDamage: 5,
  strictRollOutcome: {
    attackDice: [4, 4],
    damageDice: [4, 4],
  },
};

function transferResponse(recipientPieceKey) {
  return {
    responseKey: `transfer:${recipientPieceKey}`,
    choice: "transfer",
    recipientPieceKey,
  };
}

function classify(recipient) {
  return buildWarmachineExactPostResponseChanceClassesV1(
    action,
    transferResponse(recipient.pieceKey),
    primaryChanceClass,
    { state: { pieces: [recipient] } },
  );
}

const hitPoints = classify({
  pieceKey: "hit-points",
  modelRole: "warrior",
  damage: { layoutKind: "hit_points", boxesRemaining: 5, maxBoxes: 5 },
});
assert.equal(hitPoints.exactComplete, true);
assert.equal(hitPoints.classCount, 1);
assert.equal(hitPoints.classes[0].chanceKind, "identity");

const lifeSpiralRows = Array.from({ length: 9 }, () =>
  Array.from({ length: 3 }, () => ({ systemKey: "body", marked: false })));
const exactGargantuan = classify({
  pieceKey: "exact-gargantuan",
  modelRole: "gargantuan warbeast",
  isWarbeast: true,
  isGargantuan: true,
  damage: {
    layoutKind: "life_spiral",
    boxesRemaining: 27,
    maxBoxes: 27,
    lifeSpiralRows,
  },
});
assert.equal(exactGargantuan.exactComplete, true,
  "a Gargantuan with exact life-spiral topology uses a d6 branch, not a Colossal grid-side choice");
assert.equal(exactGargantuan.classCount, 6);
assert.deepEqual(exactGargantuan.classes.map((entry) => entry.damageBranch), [1, 2, 3, 4, 5, 6]);

const horrorWeb = classify({
  pieceKey: "horror-web",
  modelRole: "horror",
  damage: {
    layoutKind: "damage_web",
    boxesRemaining: 24,
    maxBoxes: 24,
    damageWebRings: {
      outer: { capacity: 12, marked: 0 },
      middle: { capacity: 8, marked: 0 },
      center: { capacity: 4, marked: 0 },
    },
  },
});
assert.equal(horrorWeb.exactComplete, true);
assert.equal(horrorWeb.classCount, 1,
  "a Horror web records damage outer-to-inner without a random damage-location die");
assert.equal(horrorWeb.classes[0].chanceKind, "identity");

const unresolvedWarbeast = classify({
  pieceKey: "unresolved-warbeast",
  modelRole: "warbeast",
  isWarbeast: true,
  damage: {
    layoutKind: "unresolved_system_layout",
    boxesRemaining: 27,
    maxBoxes: 27,
  },
});
assert.equal(unresolvedWarbeast.exactComplete, false);
assert.deepEqual(unresolvedWarbeast.reasons, ["damage_transfer_recipient_layout_not_exact"]);

const colossalGrid = classify({
  pieceKey: "colossal-grid",
  modelRole: "colossal warjack",
  isWarjack: true,
  isColossal: true,
  damage: {
    layoutKind: "colossal_damage_grid",
    boxesRemaining: 12,
    maxBoxes: 12,
    colossalGridColumns: {
      left: Array.from({ length: 6 }, () => [{ marked: false }]),
      right: Array.from({ length: 6 }, () => [{ marked: false }]),
    },
  },
});
assert.equal(colossalGrid.exactComplete, false);
assert.deepEqual(colossalGrid.reasons,
  ["transferred_damage_colossal_grid_side_choice_not_modeled"]);

const executionState = {
  stateKey: "post-response-exact-gargantuan-execution",
  activeSideKey: "player2",
  phaseKey: "activation",
  turnNumber: 2,
  strictMode: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    {
      pieceKey: "defender-lock",
      label: "Defender Lock",
      sideKey: "player1",
      modelRole: "warlock",
      modelType: "warlock",
      isWarlock: true,
      isWarrior: true,
      position: { xIn: 12, yIn: 10 },
      baseSizeIn: 1.18,
      speedIn: 6,
      meleeRangeIn: 1,
      defense: 10,
      armor: 10,
      resourceKind: "fury",
      resourcePoints: 1,
      resourceMax: 6,
      controlRangeIn: 12,
      battlegroupId: "defender-bg",
      damage: { layoutKind: "hit_points", boxesRemaining: 5, maxBoxes: 5 },
      statusTags: [],
      attackProfiles: [],
    },
    {
      pieceKey: "exact-gargantuan",
      label: "Exact Gargantuan",
      sideKey: "player1",
      modelRole: "gargantuan warbeast",
      modelType: "gargantuan warbeast",
      isWarbeast: true,
      isGargantuan: true,
      position: { xIn: 18, yIn: 10 },
      baseSizeIn: 4.72,
      speedIn: 5,
      meleeRangeIn: 2,
      defense: 8,
      armor: 19,
      resourceKind: "fury",
      resourcePoints: 0,
      resourceMax: 4,
      controllerPieceKey: "defender-lock",
      battlegroupId: "defender-bg",
      damage: {
        layoutKind: "life_spiral",
        boxesRemaining: 27,
        maxBoxes: 27,
        systems: { mind: 0, body: 27, spirit: 0 },
        lifeSpiralRows,
      },
      statusTags: [],
      attackProfiles: [],
    },
    {
      pieceKey: "attacker",
      label: "Attacker",
      sideKey: "player2",
      modelRole: "warjack",
      modelType: "warjack",
      isWarjack: true,
      position: { xIn: 10, yIn: 10 },
      baseSizeIn: 1.18,
      speedIn: 6,
      meleeRangeIn: 1,
      defense: 10,
      armor: 18,
      mat: 8,
      resourceKind: "focus",
      resourcePoints: 0,
      resourceMax: 3,
      damage: { layoutKind: "hit_points", boxesRemaining: 20, maxBoxes: 20 },
      statusTags: [],
      attackProfiles: [{
        profileKey: "test-weapon",
        name: "Test Weapon",
        mode: "melee",
        rangeIn: 1,
        power: 10,
        attackStat: 8,
        attackStatKind: "MAT",
      }],
    },
  ],
  terrain: [],
  scenario: { zones: [], flags: [], score: { player1: 0, player2: 0 }, victoryThreshold: 5 },
};
const scoped = enumerateWarmachineBenchmarkActionsV2(executionState, {
  actorPieceKeys: ["attacker"],
  targetPieceKeys: ["defender-lock"],
  actionFamilyKeys: ["attack_or_effect"],
  includeUntargetedActions: false,
});
const executionAction = canonicalWarmachineActingSideActionsV1(scoped.enumeration)
  .find((candidate) => candidate.actorPieceKey === "attacker" &&
    candidate.targetPieceKey === "defender-lock" &&
    candidate.metadata?.attackResolution);
assert.ok(executionAction);
const primaryChance = buildWarmachineExactActionChanceClasses(executionAction, {
  state: scoped.state,
});
const positiveHitClass = primaryChance.classes.find((entry) =>
  entry.hit === true && Number(entry.resolvedDamage || 0) > 0);
assert.ok(positiveHitClass);
const transfer = buildWarmachineOpponentResponseSetV1(
  executionAction,
  scoped.enumeration,
).responses.find((entry) => entry.choice === "transfer" &&
  entry.recipientPieceKey === "exact-gargantuan");
assert.ok(transfer?.action);
const exactGargantuanExecution = executeWarmachineExactPostResponseChanceV1(
  scoped,
  executionAction,
  transfer,
  positiveHitClass,
  { routeKey: "verify-post-response-exact-gargantuan" },
);
assert.equal(exactGargantuanExecution.exactComplete, true);
assert.equal(exactGargantuanExecution.outcomes.length, 6);
assert.equal(exactGargantuanExecution.rejectedTransitionCount, 0);
assert.ok(exactGargantuanExecution.outcomes.every((entry) => entry.executed.ok));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "warmachine_post_response_chance_outcomes_verifier_v1",
  exactGargantuanClassCount: exactGargantuan.classCount,
  horrorWebClassCount: horrorWeb.classCount,
  exactGargantuanAcceptedOutcomeCount: exactGargantuanExecution.outcomes.length,
  unresolvedWarbeastReasons: unresolvedWarbeast.reasons,
  colossalReasons: colossalGrid.reasons,
}, null, 2));
