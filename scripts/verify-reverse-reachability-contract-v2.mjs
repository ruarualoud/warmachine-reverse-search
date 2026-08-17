#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildWarmachineReverseReachabilityCandidateSetV2,
  buildWarmachineReverseReachabilityPolicyV2,
} from "../src/reverse/reachability-contract-v2.mjs";

const policy = buildWarmachineReverseReachabilityPolicyV2({
  queryKey: "same-successor-predecessor-query",
});
assert.equal(policy.strategyEvaluationAllowed, false);
assert.equal(policy.exchangeRequired, false);
assert.equal(policy.candidateOrdering, "canonical_candidate_identity_only");

function candidates(annotationByKey = {}) {
  return [
    {
      candidateKey: "hold-lane",
      successorKind: "hold_or_block",
      strictWitness: true,
      strictReceiptHash: "receipt-hold",
      annotations: annotationByKey["hold-lane"] || {},
    },
    {
      candidateKey: "exchange-target",
      successorKind: "attack_or_exchange",
      strictWitness: true,
      strictReceiptHash: "receipt-exchange",
      annotations: annotationByKey["exchange-target"] || {},
    },
    {
      candidateKey: "withdraw-from-lane",
      successorKind: "withdrawal",
      unresolvedReasons: ["strict_route_not_materialized"],
      annotations: annotationByKey["withdraw-from-lane"] || {},
    },
  ];
}

const first = buildWarmachineReverseReachabilityCandidateSetV2(candidates({
  "hold-lane": { strategyScore: -100, materialSwing: 0 },
  "exchange-target": { strategyScore: 500, materialSwing: 12 },
  "withdraw-from-lane": { strategyScore: 10 },
}), { policy });
const inverted = buildWarmachineReverseReachabilityCandidateSetV2(candidates({
  "hold-lane": { strategyScore: 10_000, materialSwing: 99 },
  "exchange-target": { strategyScore: -10_000, materialSwing: -99 },
  "withdraw-from-lane": { strategyScore: 0 },
}), { policy });

const selectedKeys = (result) => result.selected.map((candidate) => candidate.candidateKey);
assert.deepEqual(selectedKeys(first), ["exchange-target", "hold-lane", "withdraw-from-lane"]);
assert.deepEqual(selectedKeys(inverted), selectedKeys(first));
assert.deepEqual(
  first.selected.map((candidate) => candidate.disposition),
  ["strict_reachable_witness", "strict_reachable_witness", "unresolved_reachability"],
);
assert.equal(first.strategyEvaluationApplied, false);
assert.equal(first.candidateRankingApplied, false);
assert.equal(first.tacticalPruningApplied, false);
assert.equal(first.reachabilityContractOk, true);
assert.equal(first.cursorExhausted, true);

const paged = buildWarmachineReverseReachabilityCandidateSetV2(candidates(), {
  policy,
  maximumCandidates: 2,
});
assert.deepEqual(selectedKeys(paged), ["exchange-target", "hold-lane"]);
assert.deepEqual(paged.deferred, [{
  candidateKey: "withdraw-from-lane",
  disposition: "deferred_by_budget",
  unresolvedReasons: ["candidate_page_budget_exhausted"],
  originalDisposition: "unresolved_reachability",
}]);
assert.equal(paged.cursorExhausted, false);
assert.equal(paged.counts.deferredCandidateCount, 1);

const changedAnnotations = buildWarmachineReverseReachabilityCandidateSetV2(candidates({
  "hold-lane": { tacticalLabel: "best" },
  "exchange-target": { tacticalLabel: "worst" },
}), { policy, maximumCandidates: 2 });
assert.deepEqual(selectedKeys(changedAnnotations), selectedKeys(paged));

const implicitFirst = buildWarmachineReverseReachabilityCandidateSetV2([{
  successorKind: "hold_or_block",
  predecessorStateKey: "state-before",
  successorStateKey: "state-after",
  transitionActionKey: "activation-complete",
  annotations: { strategyScore: -1_000, tacticalLabel: "bad" },
  provenance: { analyst: "first" },
}]);
const implicitInverted = buildWarmachineReverseReachabilityCandidateSetV2([{
  successorKind: "hold_or_block",
  predecessorStateKey: "state-before",
  successorStateKey: "state-after",
  transitionActionKey: "activation-complete",
  annotations: { strategyScore: 1_000, tacticalLabel: "best" },
  provenance: { analyst: "second" },
}]);
assert.equal(
  implicitFirst.selected[0].candidateKey,
  implicitInverted.selected[0].candidateKey,
  "fallback identity must exclude annotations and provenance",
);

const forbiddenDisposition = buildWarmachineReverseReachabilityCandidateSetV2([{
  successorKind: "withdrawal",
  predecessorStateKey: "state-before-withdrawal",
  successorStateKey: "state-after-withdrawal",
  transitionActionKey: "advance-away",
  disposition: "strategically_bad",
}]);
assert.equal(forbiddenDisposition.reachabilityContractOk, false);
assert.deepEqual(forbiddenDisposition.contractViolations, [
  `forbidden_reverse_disposition:${forbiddenDisposition.selected[0].candidateKey}:strategically_bad`,
]);
assert.equal(forbiddenDisposition.selected[0].disposition, "unresolved_reachability");
assert.equal(forbiddenDisposition.selected[0].requestedDisposition, "strategically_bad");

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reverseSourceFiles = fs.readdirSync(path.join(repositoryRoot, "src", "reverse"))
  .filter((fileName) => fileName.endsWith(".mjs"));
const forbiddenStrategyImports = [];
for (const fileName of reverseSourceFiles) {
  const source = fs.readFileSync(path.join(repositoryRoot, "src", "reverse", fileName), "utf8");
  if (/from\s+["']\.\.\/search\/(?:goal-conditioned|efficiency-policy|matchup-search|forward-completion)/.test(source)) {
    forbiddenStrategyImports.push(fileName);
  }
}
assert.deepEqual(forbiddenStrategyImports, []);

console.log(JSON.stringify({
  ok: true,
  marker: "reverse_reachability_without_strategy_evaluation_v20260811",
  policyHash: policy.policyHash,
  peerSuccessorKinds: first.selected.map((candidate) => candidate.successorKind),
  canonicalOrderStableUnderInvertedStrategyAnnotations:
    JSON.stringify(selectedKeys(first)) === JSON.stringify(selectedKeys(inverted)),
  budgetDeferredAsUnresolved: paged.deferred,
  implicitCandidateIdentityStableUnderAnnotations:
    implicitFirst.selected[0].candidateKey === implicitInverted.selected[0].candidateKey,
  forbiddenStrategyDispositionFailsClosed: !forbiddenDisposition.reachabilityContractOk,
  reverseCoreStrategyImportCount: forbiddenStrategyImports.length,
  claimBoundary: first.claimBoundary,
}, null, 2));
