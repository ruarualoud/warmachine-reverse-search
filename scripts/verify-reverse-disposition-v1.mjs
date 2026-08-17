import assert from "node:assert/strict";

import {
  classifyWarmachineReverseDispositionV1,
  WARMACHINE_REVERSE_DISPOSITION_KINDS_V1,
  warmachineReverseDispositionProtocolV1,
} from "../src/report/reverse-disposition-v1.mjs";

const cases = [
  ["strict_rejected", { reason: "strict_previous_turn_end_rejected" }],
  ["budget_deferred", { reason: "route_label_budget_exhausted" }],
  ["pruned_low_probability", { reason: "pruned_low_probability_threshold" }],
  ["inverse_unresolved", { reason: "control_inverse_unresolved" }],
  ["rules_unknown", { reason: "unknown_rule_source_contract" }],
  ["rules_drift", { reason: "ruleset_dependency_drift" }],
  ["proven_unreachable", { reason: "proven_unreachable_by_contradiction" }],
];
for (const [expected, row] of cases) {
  assert.equal(classifyWarmachineReverseDispositionV1(row), expected);
  const protocol = warmachineReverseDispositionProtocolV1(expected);
  assert.equal(protocol.disposition, expected);
  assert.equal(protocol.countsAsFailure, expected === "proven_unreachable");
  assert.ok(protocol.recoveryAction);
  assert.ok(protocol.invalidatedBy.length > 0);
}
assert.deepEqual(cases.map(([kind]) => kind),
  WARMACHINE_REVERSE_DISPOSITION_KINDS_V1);
assert.equal(classifyWarmachineReverseDispositionV1({
  disposition: "low_probability_unexpanded",
}), "pruned_low_probability");
assert.equal(warmachineReverseDispositionProtocolV1("budget_deferred")
  .resumableFromCheckpoint, true);
assert.equal(warmachineReverseDispositionProtocolV1("strict_rejected")
  .resumableFromCheckpoint, false);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_reverse_disposition_v1",
  dispositionKinds: WARMACHINE_REVERSE_DISPOSITION_KINDS_V1,
}, null, 2));
