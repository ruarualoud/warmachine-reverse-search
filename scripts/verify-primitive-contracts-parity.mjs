import assert from "node:assert/strict";

import {
  buildWarmachineReverseHookOperator,
  buildWarmachineReversePrimitiveContractRegistry,
  buildWarmachineTerminalReverseOperatorScope,
  warmachineActivationSequenceSupportsTerminalRegression,
  warmachineBridgeSecondaryDamageSupportsTerminalRegression,
  warmachineDestroyActionWindowSupportsTerminalRegression,
  warmachineExplosionSupportsTerminalRegression,
  warmachineStatusOnHitSupportsTerminalRegression,
} from "../src/reverse/primitive-contracts-v1.mjs";
import { loadLegacyReverseSearchModules, loadWarmachineHost } from "../src/upstream-project-d.mjs";
import { warmachineRulesetBaselineV1 } from "../src/contracts/ruleset-baseline-v1.mjs";

const { modules: legacyModules } = await loadLegacyReverseSearchModules();
const legacy = legacyModules.primitiveContracts;
const host = await loadWarmachineHost();

const registry = buildWarmachineReversePrimitiveContractRegistry();
const legacyRegistry = legacy.buildWarmachineReversePrimitiveContractRegistry();
assert.deepEqual(registry, legacyRegistry, "full primitive registry diverged from the migration source");

const helperFixtures = [
  {
    name: "status on hit",
    local: warmachineStatusOnHitSupportsTerminalRegression,
    upstream: legacy.warmachineStatusOnHitSupportsTerminalRegression,
    rows: [
      { parameters: { statusProperties: { defenseDelta: -2 } } },
      { parameters: { statusTag: "stationary" } },
      { parameters: { statusProperties: { defenseDelta: 2 } } },
    ],
  },
  {
    name: "activation sequence",
    local: warmachineActivationSequenceSupportsTerminalRegression,
    upstream: legacy.warmachineActivationSequenceSupportsTerminalRegression,
    rows: [
      { parameters: { attacksPerEligibleModel: 1, maximumGrantedAttacks: 4 } },
      { parameters: { attacksPerEligibleModel: 1, sequenceKind: "assault" } },
      { parameters: { attacksPerEligibleModel: 0, maximumGrantedAttacks: 4 } },
    ],
  },
  {
    name: "destroy action window",
    local: warmachineDestroyActionWindowSupportsTerminalRegression,
    upstream: legacy.warmachineDestroyActionWindowSupportsTerminalRegression,
    rows: [
      { parameters: { grantedActionKind: "melee_attack" } },
      { parameters: { grantedActionKind: "move" } },
    ],
  },
  {
    name: "explosion",
    local: warmachineExplosionSupportsTerminalRegression,
    upstream: legacy.warmachineExplosionSupportsTerminalRegression,
    rows: [
      { parameters: { triggerKinds: ["destroyed"], targetRangeIn: 2, damagePower: 10, damageDiceCount: 2, targetAllegiance: "all_other_models" } },
      { parameters: { triggerKinds: [], targetRangeIn: 2, damagePower: 10, damageDiceCount: 2, targetAllegiance: "all_other_models" } },
    ],
  },
  {
    name: "bridge secondary damage",
    local: warmachineBridgeSecondaryDamageSupportsTerminalRegression,
    upstream: legacy.warmachineBridgeSecondaryDamageSupportsTerminalRegression,
    rows: [
      { parameters: { targetRangeIn: 4, damagePower: 10, damageDiceCount: 2, targetSelection: "nearest" } },
      { parameters: { targetRangeIn: 4, damagePower: 10, damageDiceCount: 2 } },
    ],
  },
];

let helperParityCaseCount = 0;
for (const fixture of helperFixtures) {
  for (const row of fixture.rows) {
    assert.equal(fixture.local(row), fixture.upstream(row), `${fixture.name} helper parity failed`);
    helperParityCaseCount += 1;
  }
}

const sampleAtom = host.atoms.recognizedWarmachineRuleAtoms()
  .find((atom) => (atom.hooks || []).length > 0);
assert.ok(sampleAtom);
const sampleHook = sampleAtom.hooks[0];
assert.deepEqual(
  buildWarmachineReverseHookOperator(sampleAtom, sampleHook),
  legacy.buildWarmachineReverseHookOperator(sampleAtom, sampleHook),
  "hook operator construction diverged from the migration source",
);

const killingSpree = {
  id: "b822fd0d-9ffd-4f39-a4a5-8f2925c817c7",
  ruleKey: "unmapped_killing_spree",
  name: "Killing Spree",
  description: "When this model destroys one or more enemy models with a melee attack during its Combat Action, after that attack is resolved this model can advance up to 1 inch and make one additional melee attack.",
};
const state = {
  pieces: [{
    pieceKey: "actor",
    sideKey: "player1",
    specialRules: [killingSpree],
    damage: { boxesRemaining: 8, maxBoxes: 8 },
  }, {
    pieceKey: "leader",
    sideKey: "player2",
    modelRole: "warlock",
    damage: { boxesRemaining: 18, maxBoxes: 18 },
  }],
};
const template = {
  templateKey: "reverse-primitive-contract-scope",
  goalType: "assassination",
  attackerPieceKey: "actor",
  targetPieceKey: "leader",
};
const scope = buildWarmachineTerminalReverseOperatorScope(state, template);
assert.deepEqual(
  scope,
  legacy.buildWarmachineTerminalReverseOperatorScope(state, template),
  "terminal operator scope diverged from the migration source",
);

assert.deepEqual(registry.counts, warmachineRulesetBaselineV1.reverseRegistry);
assert.equal(registry.fullTypedObligationCoverage, true);
assert.equal(registry.fullStrictExecutablePredecessorCoverage, false);
assert.equal(scope.operators.find((operator) =>
  operator.atomKey === "killing_spree_melee_destroy_advance_additional_melee_sequence")?.maturity,
"explicit_symbolic_operator");
const destructiveTorpor = registry.operators.find((operator) =>
  operator.atomKey === "destructive_torpor_frenzy_preserves_normal_activation");
assert.equal(destructiveTorpor?.hookKey, "action_contribution");
assert.equal(destructiveTorpor?.primitiveKey, "activation_sequence_contribution");
assert.equal(destructiveTorpor?.maturity, "typed_obligation_only");
assert.equal(destructiveTorpor?.strictForwardWitnessRequired, true);
assert.equal(destructiveTorpor?.hardPruningEnabled, false);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_primitive_contracts_parity_v1",
  fullRegistryParity: true,
  hookOperatorParity: true,
  terminalScopeParity: true,
  helperParityCaseCount,
  counts: registry.counts,
}, null, 2));
