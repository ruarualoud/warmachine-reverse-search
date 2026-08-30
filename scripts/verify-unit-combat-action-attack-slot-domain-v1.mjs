import assert from "node:assert/strict";

import {
  buildWarmachineUnitCombatActionAttackSlotDomainV1,
} from "../src/search/unit-combat-action-attack-slot-domain-v1.mjs";

function piece(pieceKey, xIn, yIn, overrides = {}) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey: "player1",
    modelRole: "trooper",
    modelType: "trooper",
    unitGroupId: "combined-unit",
    position: { xIn, yIn },
    baseSizeIn: 1.18,
    speedIn: 6,
    defense: 12,
    armor: 15,
    mat: 6,
    rat: 6,
    boxesRemaining: 1,
    maxBoxes: 1,
    canCombinedMeleeAttack: true,
    canCombinedRangedAttack: true,
    ...overrides,
  };
}

const inputState = {
  stateKey: "search-unit-combat-action-attack-slots",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 2,
  strictMode: true,
  enforceStrictExecutor: true,
  board: { widthIn: 48, heightIn: 48 },
  terrain: [],
  pieces: [
    piece("multi-a", 10, 10, {
      attackProfiles: [{
        mode: "melee",
        profileKey: "blade",
        name: "Blade",
        rangeIn: 1,
        power: 10,
        attackStat: 6,
        count: 2,
      }, {
        mode: "ranged",
        profileKey: "rifle",
        name: "Rifle",
        rangeIn: 10,
        power: 10,
        attackStat: 6,
        count: 2,
        rof: 2,
      }],
    }),
    piece("multi-b", 10, 12, {
      attackProfiles: [{
        mode: "melee",
        profileKey: "spear",
        name: "Spear",
        rangeIn: 2,
        power: 11,
        attackStat: 6,
        count: 1,
      }, {
        mode: "ranged",
        profileKey: "carbine",
        name: "Carbine",
        rangeIn: 8,
        power: 9,
        attackStat: 6,
        count: 1,
        rof: 2,
      }],
    }),
    piece("enemy", 20, 20, {
      sideKey: "player2",
      unitGroupId: "",
      canCombinedMeleeAttack: false,
      canCombinedRangedAttack: false,
      attackProfiles: [],
    }),
  ],
  unitActivationWindow: {
    active: true,
    sideKey: "player1",
    unitGroupId: "combined-unit",
    selectedModelPieceKey: "multi-a",
    phase: "combat_actions",
    normalMovementUsed: true,
    pendingTrooperPieceKeys: ["multi-a", "multi-b"],
    completedTrooperPieceKeys: [],
    forfeitedTrooperPieceKeys: [],
  },
};

const domain = buildWarmachineUnitCombatActionAttackSlotDomainV1(
  inputState,
  { actorPieceKey: "multi-a" },
);
assert.equal(
  domain.schemaVersion,
  "warmachine_unit_combat_action_attack_slot_domain_v1",
);
assert.match(domain.unitCombatActionAttackSlotDomainHash, /^[0-9a-f]{64}$/);
assert.equal(domain.hostAttackSlotPlanReceiptValid, true);
assert.equal(domain.printedInitialAttackSlotCount, 9);
assert.equal(domain.attackSlots.length, 9);
assert.equal(new Set(domain.attackSlots.map((slot) =>
  slot.attackSlotKey)).size, 9);
assert.equal(domain.printedInitialAttackSlotDenominatorComplete, true);
assert.equal(domain.combinedAttackExactSlotConsumptionLedgerPresent, false);
assert.equal(domain.combinedAttackExactSlotConsumptionImplemented, true);
assert.equal(domain.currentCombinedAttackEnumeratesAllPrimarySlots, true);
assert.equal(domain.currentCombinedAttackEnumeratesAllHelperSlots, true);
assert.equal(
  domain.currentCombinedAttackEnumeratesAllNonemptyParticipantSets,
  true,
);
assert.equal(domain.currentCombinedAttackTargetLegalityStrict, true);
assert.equal(domain.currentCombinedMeleeChargeClassStrict, true);
assert.equal(domain.combinedAttackGroupingDomainComplete, false);
assert.equal(domain.opponentResponseDomainComplete, false);
assert.equal(domain.chanceMassComplete, false);
assert.equal(domain.unitCombatActionDomainComplete, false);
assert.equal(domain.chanceMassAssigned, false);
assert.ok(domain.debts.some((debt) =>
  debt.reason === "unit_combined_attack_full_combat_action_partition_unresolved"));

console.log(JSON.stringify({
  ok: true,
  marker: "search_unit_combat_action_attack_slot_domain_v1",
  hostAttackSlotPlanReceiptValid: domain.hostAttackSlotPlanReceiptValid,
  printedInitialAttackSlotCount: domain.printedInitialAttackSlotCount,
  printedInitialAttackSlotDenominatorComplete:
    domain.printedInitialAttackSlotDenominatorComplete,
  combinedAttackExactSlotConsumptionLedgerPresent:
    domain.combinedAttackExactSlotConsumptionLedgerPresent,
  combinedAttackExactSlotConsumptionImplemented:
    domain.combinedAttackExactSlotConsumptionImplemented,
  combinedAttackGroupingDomainComplete:
    domain.combinedAttackGroupingDomainComplete,
  opponentResponseDomainComplete: domain.opponentResponseDomainComplete,
  chanceMassComplete: domain.chanceMassComplete,
}, null, 2));
