import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_PROJECT_COMPLETION_GATES_V1_SCHEMA =
  "warmachine_project_completion_gates_v1";

export const WARMACHINE_PROJECT_COMPLETION_GATE_GROUPS_V1 = Object.freeze([
  Object.freeze({
    gateKey: "host_rules_and_update_invalidation",
    description: "Current rules-v1 authority, ruleset snapshot, and dependency drift invalidation",
    verifiers: Object.freeze([
      "verify-upstream-warmachine-contract.mjs",
      "verify-ruleset-snapshot-v1.mjs",
      "verify-ruleset-change-impact-v1.mjs",
      "verify-terminal-state-host-rule-authority-v1.mjs",
    ]),
  }),
  Object.freeze({
    gateKey: "exact_micro_probability_and_adversary",
    description: "Finite micro cases, chance mass, adversarial choices, and exact strict policy steps",
    verifiers: Object.freeze([
      "verify-spatial-quotient-parity.mjs",
      "verify-primitive-contracts-parity.mjs",
      "verify-rule-regression-parity.mjs",
      "verify-reverse-reachability-contract-v2.mjs",
      "verify-goal-conditioned-parity.mjs",
      "verify-chance-outcomes-parity.mjs",
      "verify-trample-reposition-interaction-v1.mjs",
      "verify-adversarial-chance-equivalence-v1.mjs",
      "verify-adversarial-frontier-ledger-v1.mjs",
      "verify-probability-dag-v1.mjs",
      "verify-strict-action-probability-and-min-v2.mjs",
      "verify-strict-policy-probability-v1.mjs",
      "verify-strict-policy-step-v1.mjs",
      "verify-matchup-search-parity.mjs",
    ]),
  }),
  Object.freeze({
    gateKey: "interaction_inverse_and_search_contracts",
    description: "Typed interaction closure, predecessor algebra, conservative pruning, and direction choice",
    verifiers: Object.freeze([
      "verify-symbolic-worklist-parity.mjs",
      "verify-action-dependency-parity.mjs",
      "verify-terminal-obligation-parity.mjs",
      "verify-cegar-parity.mjs",
      "verify-terminal-relevance-parity.mjs",
      "verify-rejection-replay-parity.mjs",
      "verify-typed-interaction-graph-v2.mjs",
      "verify-terminal-predecessor-algebra-v2.mjs",
      "verify-efficiency-policy-v2.mjs",
      "verify-forward-completion-experiment-v2.mjs",
      "verify-search-direction-feasibility-v1.mjs",
      "verify-piece-lifecycle-v1.mjs",
      "verify-reverse-route-history-v1.mjs",
      "verify-reverse-disposition-v1.mjs",
    ]),
  }),
  Object.freeze({
    gateKey: "steamroller_terminal_corpus_and_interactions",
    description: "Latest Steamroller terminal classes, parameterized corpus, representative evidence, and rule interactions",
    verifiers: Object.freeze([
      "verify-terminal-hypothesis-v1.mjs",
      "verify-steamroller-terminal-scenario-corpus-v1.mjs",
      "verify-steamroller-terminal-representative-selector-v1.mjs",
      "verify-steamroller-terminal-representative-materialization-ledger-v1.mjs",
      "verify-steamroller-score-terminal-materialization-batch-v1.mjs",
      "verify-steamroller-assassination-terminal-anchor-evidence-v1.mjs",
      "verify-steamroller-assassination-terminal-representative-reject-evidence-v1.mjs",
      "verify-steamroller-simultaneous-leader-terminal-anchor-evidence-v1.mjs",
      "verify-steamroller-strygon-spray-simultaneous-leader-terminal-evidence-v1.mjs",
      "verify-steamroller-fixed-round-terminal-anchor-evidence-v1.mjs",
      "verify-steamroller-terminal-mutable-state-evidence-v1.mjs",
      "verify-steamroller-terminal-los-relation-evidence-v1.mjs",
      "verify-steamroller-fixed-round-reverse-reachability-v1.mjs",
      "verify-steamroller-score-terminal-representative-evidence-v1.mjs",
      "verify-steamroller-scenario-terrain-selection-evidence-v1.mjs",
      "verify-steamroller-scenario-control-relation-evidence-v1.mjs",
      "verify-steamroller-channeled-excarnate-terminal-evidence-v1.mjs",
      "verify-steamroller-score-terminal-representative-reject-evidence-v1.mjs",
    ]),
  }),
  Object.freeze({
    gateKey: "spatial_multi_turn_and_deployment_reachability",
    description: "Exact positions, activation order, whole turns, recursive history, and deployment endpoints",
    verifiers: Object.freeze([
      "verify-extended-terminal-proof-v2.mjs",
      "verify-terminal-position-domain-v1.mjs",
      "verify-fixed-terminal-position-domain-v1.mjs",
      "verify-fixed-terminal-score-position-domain-v1.mjs",
      "verify-fixed-terminal-reverse-frontier-v1.mjs",
      "verify-fixed-terminal-prior-turn-frontier-v1.mjs",
      "verify-fixed-terminal-score-prior-turn-frontier-v1.mjs",
      "verify-terminal-position-batch-v1.mjs",
      "verify-terminal-spatial-materializer-v1.mjs",
      "verify-terminal-event-predecessor-v1.mjs",
      "verify-movement-activation-order-v2.mjs",
      "verify-movement-activation-predecessor-v1.mjs",
      "verify-control-phase-predecessor-v1.mjs",
      "verify-previous-turn-end-predecessor-v1.mjs",
      "verify-lazy-action-cursor-parity.mjs",
    ]),
  }),
  Object.freeze({
    gateKey: "roster_benchmark_and_cross_domain",
    description: "Legal roster proposals, complete deployment, fixed benchmark routes, and cross-domain validation",
    verifiers: Object.freeze([
      "verify-formation-candidates-parity.mjs",
      "verify-roster-investment-parity.mjs",
      "verify-fixed-benchmark-strict-roll-materialization-v2.mjs",
      "verify-fixed-steamroller-assassination-v2.mjs",
      "verify-fixed-steamroller-benchmark-v2.mjs",
      "verify-nested-roster-deployment-v2.mjs",
      "verify-cross-scenario-roster-validation-v1.mjs",
    ]),
  }),
  Object.freeze({
    gateKey: "storage_parallel_recovery",
    description: "External DAG equivalence, bounded real batch, parallel continuation, and checkpoint recovery",
    verifiers: Object.freeze([
      "verify-external-dag-storage.mjs",
      "verify-external-dag-real-batch.mjs",
      "verify-strict-policy-probability-and-min-v2.mjs",
      "verify-terminal-resume-checkpoint-v1.mjs",
    ]),
  }),
  Object.freeze({
    gateKey: "report_training_and_human_evidence",
    description: "Interactive report, exact current media, publication contract, and fail-closed training export",
    verifiers: Object.freeze([
      "verify-search-console-v1.mjs",
      "verify-search-console-current-media-v1.mjs",
      "verify-reachability-publication-v1.mjs",
    ]),
  }),
]);

export function buildWarmachineProjectCompletionGateReportV1({
  hostReceiptHash = "",
  discoveredVerifierNames = [],
  verifierResults = [],
} = {}) {
  if (!hostReceiptHash) throw new Error("completion_gate_host_receipt_required");
  const declaredVerifierNames = WARMACHINE_PROJECT_COMPLETION_GATE_GROUPS_V1
    .flatMap((group) => group.verifiers);
  if (new Set(declaredVerifierNames).size !== declaredVerifierNames.length) {
    throw new Error("completion_gate_duplicate_verifier_declaration");
  }
  const discovered = [...new Set(discoveredVerifierNames.map(String))].sort();
  const declared = [...declaredVerifierNames].sort();
  if (stableGraphHash(discovered) !== stableGraphHash(declared)) {
    throw new Error("completion_gate_verifier_inventory_mismatch");
  }
  const resultByName = new Map(verifierResults.map((result) => [result.verifierName, result]));
  const gateRows = WARMACHINE_PROJECT_COMPLETION_GATE_GROUPS_V1.map((group) => {
    const results = group.verifiers.map((verifierName) => {
      const result = resultByName.get(verifierName);
      if (!result) throw new Error(`completion_gate_result_missing:${verifierName}`);
      return stableGraphValue(result);
    });
    return stableGraphValue({
      gateKey: group.gateKey,
      description: group.description,
      verifierCount: results.length,
      passedVerifierCount: results.filter((result) => result.passed === true).length,
      durationMs: results.reduce((sum, result) => sum + Number(result.durationMs || 0), 0),
      passed: results.every((result) => result.passed === true),
      results,
    });
  });
  const allPassed = gateRows.every((gate) => gate.passed);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_PROJECT_COMPLETION_GATES_V1_SCHEMA,
    hostReceiptHash,
    verifierInventoryHash: stableGraphHash(declared),
    gateCount: gateRows.length,
    verifierCount: declared.length,
    passedGateCount: gateRows.filter((gate) => gate.passed).length,
    passedVerifierCount: verifierResults.filter((result) => result.passed === true).length,
    gateRows,
    readiness: {
      projectReadyForBoundedResearchUse: allPassed,
      strictForwardHostRemainsRulesAuthority: allPassed,
      reverseSearchMayAffectRules: false,
      unresolvedAndDeferredMassPreserved: allPassed,
      trainingExportFailClosed: allPassed,
      completeContinuousStateSpaceExhausted: false,
      naturalWinRateProven: false,
      globalOptimalityProven: false,
      raceOrFactionOptimalityProven: false,
    },
    dispositionSemantics: {
      strict_materialized: "One exact current-Host route or state is certified within its declared scope.",
      strict_rejected: "Only the exact authored state/action rejected by the current Host is ruled out.",
      proposal_filtered: "The Host accepted execution but the authored proposal predicate was not met.",
      budget_deferred: "The task was not executed in the declared budget and remains unresolved.",
      inverse_unresolved: "No complete inverse operator was materialized; this is not unreachable evidence.",
      rules_unknown: "The current rules contract cannot decide the branch and must fail closed.",
      rules_drift: "A dependency receipt changed and prior evidence cannot be reused.",
      proven_unreachable: "Reserved for a closed declared finite domain with exact proof.",
    },
    claimBoundary: "Passing this gate means the current version is usable for bounded, recoverable, auditable Warmachine reverse-search research under the current rules-v1 Host. It does not exhaust the continuous game state space, prove undiscovered routes unreachable, rank strategy, estimate natural win rates, or establish global roster, faction, or race optimality.",
    trainingTruth: false,
  });
  return stableGraphValue({ ...core, reportHash: stableGraphHash(core) });
}
