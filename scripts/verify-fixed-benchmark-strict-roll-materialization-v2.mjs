#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  buildWarmachineBenchmarkMaximumStrictRollOutcomeV2,
  buildWarmachineBenchmarkStrictRollOutcomeV2,
  chooseWarmachineBenchmarkActionV2,
  warmachineBenchmarkStrictContinuationWindowOnlyV2,
} from
  "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";

const charge = buildWarmachineBenchmarkMaximumStrictRollOutcomeV2({
  metadata: {
    attackResolution: {
      attackDiceCount: 2,
      damageDiceCount: 3,
    },
  },
});
assert.deepEqual(charge.attackDice, [6, 6]);
assert.deepEqual(charge.damageDice, [6, 6, 6]);
assert.deepEqual(charge.locationDice, [6]);

const controlledCharge = buildWarmachineBenchmarkStrictRollOutcomeV2({
  metadata: {
    attackResolution: {
      attackDiceCount: 2,
      damageDiceCount: 3,
    },
  },
}, {
  attackDie: 4,
  damageDie: 2,
  locationDie: 3,
});
assert.deepEqual(controlledCharge.attackDice, [4, 4]);
assert.deepEqual(controlledCharge.damageDice, [2, 2, 2]);
assert.deepEqual(controlledCharge.locationDice, [3]);

const statusSpell = buildWarmachineBenchmarkMaximumStrictRollOutcomeV2({
  metadata: {
    attackResolution: {
      attackDiceCount: 3,
      damageRollNotRequired: true,
    },
  },
});
assert.deepEqual(statusSpell.attackDice, [6, 6, 6]);
assert.equal(Object.hasOwn(statusSpell, "damageDice"), false);

const lifecycleActions = [
  { actionKey: "raptor:life-drinker:use", actionType: "resolve_lifecycle_trigger_use", targetPieceKey: "strygon" },
  { actionKey: "raptor:life-drinker:decline", actionType: "resolve_lifecycle_trigger_decline", targetPieceKey: "strygon" },
];
assert.equal(warmachineBenchmarkStrictContinuationWindowOnlyV2({
  strictLifecycleTriggerChoiceWindowOnly: true,
}), true);
assert.ok(chooseWarmachineBenchmarkActionV2(lifecycleActions, {}, {
  targetPieceKey: "nymara",
  requireTargetMatch: false,
}));
assert.equal(chooseWarmachineBenchmarkActionV2([
  { actionKey: "raptor:end-purchase", actionType: "end_combat_purchase_window", targetPieceKey: "" },
], {}, {
  targetPieceKey: "nymara",
  requireTargetMatch: true,
})?.actionType, "end_combat_purchase_window");
assert.equal(warmachineBenchmarkStrictContinuationWindowOnlyV2({
  mandatoryBeforeOptionalMarker: "strict_rule_atom_choice_before_optional",
}), true);
assert.equal(warmachineBenchmarkStrictContinuationWindowOnlyV2({ actionCount: 2 }), false);

console.log(JSON.stringify({
  ok: true,
  verifier: "verify-fixed-benchmark-strict-roll-materialization-v2",
  scenarios: [
    "charge_uses_exact_attack_and_damage_dice_counts",
    "controlled_roll_values_preserve_exact_action_dice_counts",
    "status_spell_omits_damage_dice",
    "strict_continuation_window_overrides_tactical_target_filter",
    "combat_window_can_end_when_requested_target_attack_is_unavailable",
  ],
}, null, 2));
