export {
  WARMACHINE_HOST_CONTRACT_SCHEMA,
  buildWarmachineHostDependencyReceipt,
  discoverWarmachineHostDependencyPaths,
  loadWarmachineConstructionHost,
  loadLegacyReverseSearchModules,
  loadWarmachineHost,
  resolveProjectDRoot,
  resolveWarmachineEngineRoot,
} from "./upstream-project-d.mjs";

export * from "./contracts/ruleset-baseline-v1.mjs";
export * from "./contracts/ruleset-snapshot-v1.mjs";
export * from "./contracts/ruleset-change-impact-v1.mjs";
export * from "./contracts/search-run-contract-v1.mjs";
export * from "./reverse/terminal-rooted-resume-parallel-v1.mjs";

export {
  WARMACHINE_REVERSE_SPATIAL_QUOTIENT_SCHEMA,
  buildWarmachineCertifiedSpatialAutomorphisms,
  buildWarmachineKillingSpreeRelationCell,
  buildWarmachineUnitPermutationQuotient,
  quotientWarmachineReverseAlternatives,
} from "./reverse/spatial-quotient-v1.mjs";

export {
  WARMACHINE_REVERSE_PRIMITIVE_CONTRACT_SCHEMA,
  buildWarmachineReverseHookOperator,
  buildWarmachineReversePrimitiveContractRegistry,
  buildWarmachineTerminalReverseOperatorScope,
  warmachineActivationSequenceSupportsTerminalRegression,
  warmachineBridgeSecondaryDamageSupportsTerminalRegression,
  warmachineDestroyActionWindowSupportsTerminalRegression,
  warmachineExplosionSupportsTerminalRegression,
  warmachineStatusOnHitSupportsTerminalRegression,
} from "./reverse/primitive-contracts-v1.mjs";

export {
  WARMACHINE_REVERSE_RULE_REGRESSION_SCHEMA,
  regressWarmachineTerminalThroughRuleAtoms,
} from "./reverse/rule-regression-v1.mjs";

export {
  WARMACHINE_REVERSE_REACHABILITY_POLICY_V2_SCHEMA,
  WARMACHINE_REVERSE_REACHABILITY_CANDIDATE_SET_V2_SCHEMA,
  buildWarmachineReverseReachabilityPolicyV2,
  buildWarmachineReverseReachabilityCandidateSetV2,
} from "./reverse/reachability-contract-v2.mjs";

export {
  WARMACHINE_GOAL_CONDITIONED_SEARCH_SCHEMA,
  WARMACHINE_TERMINAL_GOAL_TEMPLATE_SCHEMA,
  buildWarmachineGoalTacticalSignature,
  buildWarmachineReverseReachabilityLayers,
  buildWarmachineScenarioTerminalPredecessorScene,
  buildWarmachineTerminalGoalTemplates,
  buildWarmachineTerminalPredecessorScene,
  canonicalWarmachineEffectiveRuleClosure,
  compareWarmachineGoalProgress,
  createWarmachineGoalConditionedSearchHooks,
  paretoPruneWarmachineGoalTemplates,
  validateWarmachineTerminalGoalTemplateStrict,
  warmachineAttackProbabilityEnvelope,
} from "./search/goal-conditioned-v1.mjs";

export {
  WARMACHINE_SYMBOLIC_REVERSE_WORKLIST_SCHEMA,
  buildWarmachineSymbolicReverseWorklist,
  evaluateWarmachineSymbolicReverseFrontierMeet,
  evaluateWarmachineSymbolicReverseWorklist,
} from "./reverse/symbolic-worklist-v1.mjs";

export {
  WARMACHINE_FORMATION_CANDIDATE_GENERATOR_SCHEMA,
  buildWarmachineFormationAssignmentOverrides,
  generateWarmachineFormationCandidates,
  rankWarmachineFormationArchetypes,
} from "./construction/formation-candidates-v1.mjs";

export {
  WARMACHINE_SEARCH_ACTION_FOOTPRINT_SCHEMA,
  WARMACHINE_SEARCH_ACTION_INDEPENDENCE_SCHEMA,
  WARMACHINE_SEARCH_DEPENDENCY_SCHEMA,
  buildWarmachineSearchActionFootprint,
  evaluateWarmachineSearchActionIndependence,
} from "./search/action-dependency-v1.mjs";

export {
  WARMACHINE_TERMINAL_OBLIGATION_GRAPH_SCHEMA,
  buildWarmachineTerminalObligationGraph,
  warmachineTerminalProbabilityBoundIsExact,
} from "./search/terminal-obligation-graph-v1.mjs";

export {
  WARMACHINE_SEARCH_CEGAR_SCHEMA,
  buildWarmachineStrictRejectionRefinement,
  promoteWarmachineCegarExactRejectionProof,
  summarizeWarmachineCegarRefinements,
} from "./search/cegar-v1.mjs";

export {
  WARMACHINE_LOW_POINT_DOMINANCE_SCHEMA,
  WARMACHINE_ROSTER_POINT_LEDGER_SCHEMA,
  assessWarmachineLowPointDominance,
  buildWarmachineRosterPointLedger,
} from "./construction/roster-investment-v1.mjs";

export * from "./search/chance-outcomes-v1.mjs";
export * from "./search/adversarial-chance-equivalence-v1.mjs";
export * from "./search/opponent-response-v1.mjs";
export * from "./search/opponent-response-domain-v2.mjs";
export * from "./search/strict-action-probability-and-min-v2.mjs";
export * from "./search/strict-policy-probability-and-min-v2.mjs";
export * from "./search/lazy-action-cursor-v1.mjs";
export * from "./search/complete-activation-domain-v2.mjs";
export * from "./search/unit-combat-action-attack-slot-domain-v1.mjs";
export * from "./search/terminal-relevance-closure-v1.mjs";
export * from "./search/rejection-replay-v1.mjs";
export * from "./search/matchup-search-v1.mjs";
export * from "./storage/content-address-v1.mjs";
export * from "./storage/external-dag-v1.mjs";
export * from "./graph/typed-facts-v2.mjs";
export * from "./graph/typed-interaction-graph-v2.mjs";
export * from "./graph/capability-query-v2.mjs";
export * from "./reverse/terminal-proof-v2.mjs";
export * from "./reverse/piece-lifecycle-v1.mjs";
export * from "./reverse/reverse-state-invariants-v1.mjs";
export * from "./reverse/predecessor-algebra-v2.mjs";
export * from "./reverse/strict-route-witness-v2.mjs";
export * from "./reverse/terminal-hypothesis-v1.mjs";
export * from "./reverse/steamroller-history-bound-terminal-hypothesis-v1.mjs";
export * from "./reverse/terminal-event-predecessor-v1.mjs";
export * from "./reverse/pass-activation-predecessor-v1.mjs";
export * from "./reverse/control-phase-predecessor-v1.mjs";
export * from "./reverse/previous-turn-end-predecessor-v1.mjs";
export * from "./reverse/terminal-rooted-worklist-v1.mjs";
export * from "./reverse/movement-activation-predecessor-v1.mjs";
export * from "./reverse/charge-combat-activation-predecessor-v1.mjs";
export * from "./reverse/activation-sequence-predecessor-v2.mjs";
export * from "./reverse/deployment-reachability-v1.mjs";
export * from "./reverse/terminal-rooted-to-deployment-v1.mjs";
export * from "./report/reverse-disposition-v1.mjs";
export * from "./benchmark/fixed-steamroller-benchmark-v2.mjs";
export * from "./search/efficiency-policy-v2.mjs";
export * from "./search/forward-completion-experiment-v2.mjs";
export * from "./search/direction-feasibility-v1.mjs";
export * from "./search/goal-conditioned-strategy-quotient-v1.mjs";
export * from "./geometry/predicate-plan-v1.mjs";
export * from "./geometry/cell-partition-v1.mjs";
export * from "./geometry/cell-connectivity-v1.mjs";
export * from "./geometry/path-topology-v1.mjs";
export * from "./geometry/strict-representative-v1.mjs";
export * from "./geometry/movement-event-automaton-v1.mjs";
export * from "./geometry/movement-event-word-language-v1.mjs";
export * from "./geometry/quantized-movement-event-word-worklist-v1.mjs";
export * from "./geometry/strict-unit-movement-witness-v1.mjs";
export * from "./geometry/selected-unit-mover-joint-placement-worklist-v1.mjs";
export * from "./geometry/unit-action-type-joint-domain-v1.mjs";
export * from "./construction/nested-roster-deployment-v2.mjs";
export * from "./validation/cross-scenario-roster-validation-v1.mjs";
export * from "./validation/project-completion-gates-v1.mjs";
export * from "./validation/host-rule-gap-feedback-v1.mjs";
export * from "./matchup/custom-matchup-task-v1.mjs";
export * from "./matchup/initial-state-domain-v1.mjs";
export * from "./matchup/initial-state-value-v1.mjs";
export * from "./matchup/initial-state-adversarial-value-v2.mjs";
export * from "./report/custom-matchup-evidence-report-v2.mjs";
export * from "./matchup/task-roster-universe-v1.mjs";
export * from "./matchup/generic-roster-pool-v1.mjs";
export * from "./matchup/custom-task-force-builder-v1.mjs";
export * from "./matchup/roster-rule-evidence-v1.mjs";
export * from "./matchup/matchup-screening-v1.mjs";
export * from "./matchup/representative-opening-materializer-v1.mjs";
export * from "./matchup/declared-map-topology-realization-v1.mjs";
export * from "./matchup/terminal-demand-groups-v1.mjs";
export * from "./matchup/terminal-demand-evidence-corpus-v1.mjs";
export * from "./matchup/terminal-demand-roster-routing-v1.mjs";
export * from "./matchup/terminal-demand-routing-evidence-v1.mjs";
export * from "./matchup/matchup-terminal-root-materializer-v1.mjs";
