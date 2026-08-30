import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildWarmachineExactActionChanceClasses,
  warmachineExactChanceClassActionPatch,
} from "../src/search/chance-outcomes-v1.mjs";
import { expandWarmachineStrictPolicyStepV1 } from
  "../src/search/strict-policy-step-v1.mjs";
import { buildWarmachineUnitCombatActionAttackSlotDomainV1 } from
  "../src/search/unit-combat-action-attack-slot-domain-v1.mjs";
import {
  applyRulesV1Action,
  enumerateRulesV1Actions,
  resolveWarmachineHostPath,
} from "../src/warmachine-host-runtime.mjs";

function findObjectById(value, id) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findObjectById(entry, id);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  if (value.id === id) return value;
  for (const entry of Object.values(value)) {
    const found = findObjectById(entry, id);
    if (found) return found;
  }
  return null;
}

const data = JSON.parse(fs.readFileSync(resolveWarmachineHostPath(
  "android-shell/assets/default/warmachine-lite-data.json",
), "utf8"));
const infantryCard = findObjectById(data, "1d1b3b91-cf7d-4471-9e0d-189cea5ed8f5");
const sluggerModel = infantryCard?.optionSlots?.flatMap((slot) => slot.choices || [])
  .find((choice) => choice.name === "Slugger")?.grantedModels?.[0];
assert.ok(infantryCard && sluggerModel, "current Kithguard Slugger data missing");
assert.equal(sluggerModel.weapons.find((weapon) => weapon.name === "Slugger")?.stats?.rof, "d3");

const state = {
  stateKey: "search-current-kithguard-random-rof",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 3,
  strictMode: true,
  enforceStrictExecutor: true,
  ruleAtomRuntimeMode: "authoritative",
  board: { widthIn: 48, heightIn: 48 },
  terrain: [],
  pieces: [{
    pieceKey: "slugger",
    label: "Kithguard Slugger",
    sideKey: "player1",
    factionKey: "southern-kriels",
    modelRole: "trooper",
    modelType: "trooper",
    unitGroupId: "kithguard-unit",
    cardSnapshot: infantryCard,
    modelId: sluggerModel.id,
    modelName: sluggerModel.name,
    unitModelName: sluggerModel.name,
    position: { xIn: 12, yIn: 10 },
    baseSizeIn: 40 / 25.4,
    boxesRemaining: 5,
    maxBoxes: 5,
    canBoost: false,
    canPurchaseAdditionalAttacks: false,
  }, {
    pieceKey: "enemy-heavy",
    label: "Enemy Heavy",
    sideKey: "player2",
    modelRole: "warjack",
    modelType: "warjack",
    isWarjack: true,
    position: { xIn: 12, yIn: 17 },
    baseSizeIn: 50 / 25.4,
    defense: 13,
    armor: 20,
    boxesRemaining: 80,
    maxBoxes: 80,
  }],
  scenario: {
    zones: [],
    flags: [],
    objectives: [],
    caches: [],
    actionObjectives: [],
    score: { player1: 0, player2: 0 },
    victoryThreshold: 5,
  },
  unitActivationWindow: {
    active: true,
    sideKey: "player1",
    unitGroupId: "kithguard-unit",
    selectedModelPieceKey: "slugger",
    phase: "combat_actions",
    normalMovementUsed: true,
    sourceActionType: "unit_group_aim",
    sourceActionKey: "kithguard:unit-group-aim:v1",
    pendingTrooperPieceKeys: ["slugger"],
    completedTrooperPieceKeys: [],
    forfeitedTrooperPieceKeys: [],
    aim: {
      affectedPieceKeys: ["slugger"],
      aimBonus: 2,
      aimBonusSuppressedWhileEngaged: true,
    },
  },
};

const enumeration = enumerateRulesV1Actions(state, {
  actorPieceKeys: ["slugger"],
  actionFamilyKeys: ["attack_or_effect"],
});
const declaration = enumeration.actions.find((action) =>
  action.actionType === "declare_random_rof_ranged_attacks");
assert.ok(declaration, "current Kithguard random-ROF declaration missing from Host");
const chance = buildWarmachineExactActionChanceClasses(declaration, {
  state: enumeration.state,
});
assert.equal(chance.exactComplete, true);
assert.equal(chance.chanceFactorCount, 1);
assert.equal(chance.classCount, 3);
assert.equal(chance.massNumerator, 3);
assert.equal(chance.massDenominator, 3);
assert.deepEqual(chance.classes.map((entry) =>
  entry.strictRandomRofOutcomes[0].value), [1, 2, 3]);

const unresolvedDomain = buildWarmachineUnitCombatActionAttackSlotDomainV1(
  enumeration.state,
  { unitGroupId: "kithguard-unit", sideKey: "player1" },
);
assert.equal(unresolvedDomain.printedInitialAttackSlotDenominatorComplete, false);
assert.equal(unresolvedDomain.randomRofChanceClosureRequired, true);
assert.equal(unresolvedDomain.unresolvedRandomRofRows.length, 1);

const resolvedStates = [];
for (const chanceClass of chance.classes) {
  const actionPatch = warmachineExactChanceClassActionPatch(chanceClass);
  const transition = applyRulesV1Action(enumeration.state, {
    ...declaration,
    ...actionPatch,
    metadata: {
      ...declaration.metadata,
      ...(actionPatch.metadata || {}),
    },
    __warmachineTrustedRulesV1Enumeration: enumeration,
  });
  assert.equal(transition.ok, true, transition.reason || "random-ROF Search edge rejected");
  const expected = chanceClass.strictRandomRofOutcomes[0].value;
  assert.equal(
    transition.nextState.pieces.find((piece) => piece.pieceKey === "slugger")
      ?.randomRofResolutionByWeaponInstanceKey?.[
        chanceClass.strictRandomRofOutcomes[0].weaponInstanceKey
      ]?.value,
    expected,
  );
  resolvedStates.push(transition.nextState);
}
const resolvedDomain = buildWarmachineUnitCombatActionAttackSlotDomainV1(
  resolvedStates[2],
  { unitGroupId: "kithguard-unit", sideKey: "player1" },
);
assert.equal(resolvedDomain.printedInitialAttackSlotDenominatorComplete, true);
assert.equal(resolvedDomain.randomRofChanceClosureRequired, false);

const policyStep = expandWarmachineStrictPolicyStepV1(
  state,
  () => ({
    actionKey: declaration.actionKey,
    enumerationScope: {
      actorPieceKeys: ["slugger"],
      actionFamilyKeys: ["attack_or_effect"],
    },
  }),
  { routeKey: "verify-kithguard-random-rof-search-chance" },
);
assert.equal(policyStep.stepType, "chance", policyStep.reason || "random ROF was not a Chance node");
assert.equal(policyStep.chanceAudit.exactComplete, true);
assert.equal(policyStep.chanceAudit.massNumerator, 3);
assert.equal(policyStep.chanceAudit.massDenominator, 3);
assert.equal(policyStep.strictRejectedResponseCount, 0);

const twoD3PlusOne = buildWarmachineExactActionChanceClasses({
  actionKey: "two-d3-plus-one:declare",
  actionType: "declare_random_rof_ranged_attacks",
  metadata: {
    randomRofRequirements: ["left", "right"].map((weaponInstanceKey) => ({
      weaponInstanceKey,
      denominator: 3,
      outcomes: [2, 3, 4].map((value) => ({ value, numerator: 1, denominator: 3 })),
    })),
    targetSelectionAfterChance: true,
    combinedAttackGroupingAfterChance: true,
  },
});
assert.equal(twoD3PlusOne.exactComplete, true);
assert.equal(twoD3PlusOne.chanceFactorCount, 2);
assert.equal(twoD3PlusOne.classCount, 9);
assert.equal(twoD3PlusOne.massNumerator, 9);
assert.equal(twoD3PlusOne.massDenominator, 9);
assert.ok(twoD3PlusOne.classes.some((entry) =>
  entry.strictRandomRofOutcomes[0].value === 2 &&
  entry.strictRandomRofOutcomes[1].value === 4));

console.log(JSON.stringify({
  ok: true,
  marker: "search_kithguard_random_rof_exact_chance_v1",
  kithguardClassCount: chance.classCount,
  strictPolicyStepType: policyStep.stepType,
  twoWeaponJointClassCount: twoD3PlusOne.classCount,
}, null, 2));
