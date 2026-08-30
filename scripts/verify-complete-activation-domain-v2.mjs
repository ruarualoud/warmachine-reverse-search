import assert from "node:assert/strict";
import fs from "node:fs";

import {
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  resolveWarmachineHostPath,
} from "../src/warmachine-host-runtime.mjs";
import {
  buildWarmachineCompleteActivationDomainPlanV2,
  classifyWarmachineCompleteActivationActionFamilyV2,
  enumerateNextWarmachineCompleteActivationDomainPageV2,
  exhaustWarmachineCompleteActivationDomainV2,
} from "../src/search/complete-activation-domain-v2.mjs";

const pack = JSON.parse(fs.readFileSync(resolveWarmachineHostPath(
  "data/function3-fixtures/warmachine-micro-battle-fixtures.json",
), "utf8"));

function fixture(fixtureId) {
  const row = pack.fixtures.find((entry) => entry.fixtureId === fixtureId);
  assert.ok(row, `missing fixture ${fixtureId}`);
  return normalizeRulesV1State(structuredClone(row.state));
}

function keys(rows = []) {
  return [...new Set(rows.map((row) => String(row.actionKey || "")))].sort();
}

const fixtureIds = [
  "micro_single_advance_moves_model",
  "micro_unit_blocked_center_has_alternate_advance",
  "micro_end_turn_resets_next_side_activations",
  "micro_boosted_ranged_spends_focus_and_destroys",
  "micro_control_phase_allocates_focus_to_warjack",
  "micro_combined_melee_participants_activate",
  "micro_combined_ranged_participants_activate",
];

const rows = [];
for (const fixtureId of fixtureIds) {
  const state = fixture(fixtureId);
  const full = enumerateRulesV1Actions(state);
  const plan = buildWarmachineCompleteActivationDomainPlanV2(state);
  const result = exhaustWarmachineCompleteActivationDomainV2(state, {
    pageLimit: 3,
  });
  assert.equal(plan.actionFamilyCount, state.phaseKey === "control" ? 1 : 6);
  assert.equal(plan.slotCount, plan.activationGroupCount * plan.actionFamilyCount);
  assert.equal(result.discreteSlotDenominatorComplete, true);
  assert.equal(result.actorFamilySlotDenominatorComplete, true);
  assert.equal(result.acceptedActionKeyParity, true);
  assert.equal(result.rejectedActionIdentityParity, true);
  assert.equal(result.actionAssignmentUnique, true);
  assert.deepEqual(result.duplicateAcceptedActionKeys, []);
  assert.deepEqual(result.duplicateRejectedActionIdentities, []);
  assert.deepEqual(result.acceptedActionKeys, keys(full.actions));
  assert.equal(result.slotReceiptCount, plan.slotCount);
  assert.equal(result.continuousDomainComplete, false);
  assert.equal(result.activationDomainComplete, false);
  assert.equal(result.chanceMassAssigned, false);
  assert.ok(result.continuousDomainDebts.every((debt) => debt.chanceMass === null));
  if (fixtureId.includes("combined_")) {
    const combinedDebt = result.continuousDomainDebts.find((debt) =>
      debt.reason === "unit_combined_attack_full_combat_action_partition_unresolved");
    assert.ok(combinedDebt, "combined attacks must retain the whole-Combat-Action partition debt");
    assert.ok(combinedDebt.actionKeys.length > 0);
    assert.ok(combinedDebt.hostAttackSlotPlans.length > 0);
    assert.ok(combinedDebt.hostAttackSlotPlans.every((plan) =>
      plan.printedInitialAttackSlotCount > 0 &&
      plan.printedInitialAttackSlotDenominatorComplete === true &&
      plan.combinedAttackExactSlotConsumptionLedgerPresent === false &&
      plan.combinedAttackExactSlotConsumptionImplemented === true &&
      plan.currentCombinedAttackEnumeratesAllPrimarySlots === true &&
      plan.currentCombinedAttackEnumeratesAllHelperSlots === true &&
      plan.currentCombinedAttackEnumeratesAllNonemptyParticipantSets === true &&
      plan.currentCombinedAttackTargetLegalityStrict === true &&
      plan.currentCombinedMeleeChargeClassStrict === true &&
      plan.combinedAttackGroupingDomainComplete === false));
    assert.ok(combinedDebt.requiredAxes.includes(
      "ordered_mixed_individual_and_combined_initial_attacks",
    ));
    assert.ok(combinedDebt.requiredAxes.includes("ordered_multiple_combined_attacks"));
    assert.ok(combinedDebt.requiredAxes.includes("opponent_reactions"));
  }
  if (state.phaseKey !== "control") {
    for (const familyKey of plan.actionFamilyKeys) {
      const scoped = enumerateRulesV1Actions(state, { actionFamilyKeys: [familyKey] });
      const expectedAccepted = full.actions.filter((action) =>
        classifyWarmachineCompleteActivationActionFamilyV2(action) === familyKey);
      const expectedRejected = (full.rejectedActions || []).filter((action) =>
        classifyWarmachineCompleteActivationActionFamilyV2(action) === familyKey);
      assert.deepEqual(keys(scoped.actions).filter((key) => keys(full.actions).includes(key)),
        keys(expectedAccepted));
      assert.deepEqual(keys(scoped.rejectedActions || []).filter((key) =>
        keys(full.rejectedActions || []).includes(key)), keys(expectedRejected));
    }
  }
  rows.push({
    fixtureId,
    phaseKey: state.phaseKey,
    groupCount: plan.activationGroupCount,
    familyCount: plan.actionFamilyCount,
    slotCount: plan.slotCount,
    acceptedActionCount: result.acceptedActionCount,
    rejectedActionCount: result.rejectedActionCount,
    continuousDomainDebtCount: result.continuousDomainDebtCount,
  });
}

const pagedState = fixture("micro_unit_blocked_center_has_alternate_advance");
const firstPage = enumerateNextWarmachineCompleteActivationDomainPageV2(
  pagedState,
  {},
  { pageLimit: 1 },
);
assert.equal(firstPage.pageSlotCount, 1);
assert.equal(firstPage.exhausted, false);
assert.ok(firstPage.remainingSlotCount > 0);
assert.equal(firstPage.discreteSlotDenominatorComplete, false);
assert.equal(firstPage.activationDomainComplete, false);
assert.throws(() => enumerateNextWarmachineCompleteActivationDomainPageV2(
  pagedState,
  {
    ...firstPage.cursor,
    activationDomainPlanHash: "tampered-plan-hash",
  },
  { pageLimit: 1 },
), /cursor_plan_hash_mismatch/);

const oneShotPaged = exhaustWarmachineCompleteActivationDomainV2(
  pagedState,
  { pageLimit: 1 },
);
const resumedPaged = exhaustWarmachineCompleteActivationDomainV2(
  pagedState,
  { pageLimit: 1, completedPages: [firstPage] },
);
assert.equal(
  resumedPaged.completeActivationDomainReceiptHash,
  oneShotPaged.completeActivationDomainReceiptHash,
);
const tamperedCompletedPage = structuredClone(firstPage);
tamperedCompletedPage.slotReceipts[0].acceptedActionCount += 1;
assert.throws(() => exhaustWarmachineCompleteActivationDomainV2(
  pagedState,
  { pageLimit: 1, completedPages: [tamperedCompletedPage] },
), /resume_page_receipt_invalid|resume_slot_receipt_invalid/);

const endTurn = exhaustWarmachineCompleteActivationDomainV2(
  fixture("micro_end_turn_resets_next_side_activations"),
  { pageLimit: 2 },
);
assert.ok(endTurn.acceptedActionKeys.some((actionKey) => actionKey.includes(":end:")));
assert.equal(endTurn.slotReceipts.filter((slot) =>
  slot.acceptedActionKeys.some((actionKey) => actionKey.includes(":end:"))).length, 1);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_complete_activation_domain_v2",
  rows,
  partialPageRemainingSlotCount: firstPage.remainingSlotCount,
  tamperedCursorRejected: true,
  completedPageResumeEquivalent: true,
  tamperedCompletedPageRejected: true,
  actorlessActionAssignedOnce: true,
  strictDiscreteShellComplete: true,
  continuousDomainComplete: false,
  activationDomainComplete: false,
  chanceMassAssigned: false,
}, null, 2));
