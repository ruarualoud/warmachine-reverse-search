import assert from "node:assert/strict";

import {
  buildWarmachineStrictRejectionRefinement as buildLocalRefinement,
  promoteWarmachineCegarExactRejectionProof as promoteLocalProof,
  summarizeWarmachineCegarRefinements as summarizeLocalRefinements,
} from "../src/search/cegar-v1.mjs";
import { loadLegacyReverseSearchModules } from "../src/upstream-project-d.mjs";

const { modules: legacyModules } = await loadLegacyReverseSearchModules({
  moduleKeys: ["cegar"],
});
const legacyCegar = legacyModules.cegar;
const parityCounts = { build: 0, promote: 0, summarize: 0 };

function buildWarmachineStrictRejectionRefinement(...args) {
  const local = buildLocalRefinement(...args);
  const upstream = legacyCegar.buildWarmachineStrictRejectionRefinement(...args);
  assert.deepEqual(local, upstream, `CEGAR refinement parity failed for case ${parityCounts.build + 1}`);
  parityCounts.build += 1;
  return local;
}

function summarizeWarmachineCegarRefinements(...args) {
  const local = summarizeLocalRefinements(...args);
  const upstream = legacyCegar.summarizeWarmachineCegarRefinements(...args);
  assert.deepEqual(local, upstream, `CEGAR summary parity failed for case ${parityCounts.summarize + 1}`);
  parityCounts.summarize += 1;
  return local;
}

const chance = buildWarmachineStrictRejectionRefinement({
  stateFingerprint: "state-a",
  actionKey: "attack-a",
  actionType: "ranged_attack",
  reason: "strict_roll_outcome_required",
  trustedEnumeratedLegalAction: true,
});
assert.equal(chance.disposition, "unresolved_missing_stochastic_or_choice_input");
assert.ok(chance.predicates.some((entry) => entry.predicateKey === "chance_outcome_mass_resolved"));
assert.equal(chance.hardPruneAllowed, false);

const losDrift = buildWarmachineStrictRejectionRefinement({
  stateFingerprint: "state-b",
  actionKey: "attack-b",
  actionType: "charge",
  reason: "line_of_sight_blocked_by_intervening_model",
  trustedEnumeratedLegalAction: true,
});
assert.equal(losDrift.disposition, "enumerator_executor_contract_drift");
assert.ok(losDrift.predicates.some((entry) => entry.predicateKey === "line_of_sight_clear"));
assert.equal(losDrift.hardPruneAllowed, false);

const resource = buildWarmachineStrictRejectionRefinement({
  stateFingerprint: "state-c",
  actionKey: "boost-c",
  actionType: "boosted_melee_attack",
  reason: "focus_resource_payment_exceeds_available_capacity",
  trustedEnumeratedLegalAction: false,
});
assert.equal(resource.disposition, "exact_transition_rejected_needs_independent_replay");
assert.ok(resource.predicates.some((entry) => entry.predicateKey === "resource_ledger_satisfies_payment"));

const summary = summarizeWarmachineCegarRefinements([chance, losDrift, resource]);
assert.equal(summary.refinementCount, 3);
assert.equal(summary.hardPruneCount, 0);
assert.equal(summary.contractDriftCount, 1);
assert.equal(summary.unresolvedCount, 1);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_search_cegar_v1",
  dispositions: [chance.disposition, losDrift.disposition, resource.disposition],
  predicates: summary.countByPredicate,
  hardPruneCount: summary.hardPruneCount,
}, null, 2));

const promoted = promoteLocalProof(chance, {
  exactReplayMatched: true,
  stateMutationBlocked: true,
  replayReason: chance.reason,
});
assert.deepEqual(
  promoted,
  legacyCegar.promoteWarmachineCegarExactRejectionProof(chance, {
    exactReplayMatched: true,
    stateMutationBlocked: true,
    replayReason: chance.reason,
  }),
);
parityCounts.promote += 1;

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_cegar_parity_v1",
  parityCounts,
}, null, 2));
