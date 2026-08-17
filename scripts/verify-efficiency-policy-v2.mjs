import assert from "node:assert/strict";

import {
  buildWarmachineParetoRouteLedgerV2,
  buildWarmachineRouteEfficiencyVectorV2,
  buildWarmachineSearchEfficiencyPolicyV2,
  compareWarmachineRouteEfficiencyV2,
  evaluateWarmachineRouteEfficiencyFloorV2,
} from "../src/search/efficiency-policy-v2.mjs";

const hardDimensions = [
  "terminalProbability",
  "opponentWorstCase",
  "turnDistance",
  "activationDistance",
  "friendlyResourceSpent",
  "requiredFriendlyRosterPoints",
];

function monotonicityEvidence() {
  return Object.fromEntries(hardDimensions.map((key) => [
    key,
    "proven_for_shared_predecessor_extension",
  ]));
}

function route(routeKey, overrides = {}) {
  return {
    routeKey,
    dominanceContextKey: "same-state-same-terminal-suffix",
    searchMode: "long_horizon",
    goalType: "assassination",
    winnerSideKey: "player1",
    strictWitness: true,
    terminalProofStrictCertified: true,
    terminalProbability: 0.65,
    opponentRobustness: { worstCase: 0.5, coverage: 1 },
    temporalCost: { turnDistance: 2, activationDistance: 4 },
    resourceMargin: 2,
    friendlyResourceSpent: 3,
    strategicExchange: {
      deliberateExchange: true,
      exchangeVector: { pointSwing: -4, scoreSwing: -1, resourceSwing: 2 },
    },
    scenarioPressure: 1,
    spatialSlackIn: 0.75,
    routeRedundancy: 2,
    rosterInvestment: { requiredFriendlyPoints: 30, engagedOpponentPoints: 40 },
    unresolvedMass: 0,
    proposalCost: { strictCalls: 4, nodes: 100, wallTimeMs: 50 },
    relevantActionCursorExhausted: true,
    opponentResponseCursorExhausted: true,
    chanceMassComplete: true,
    triggerAndReactionClosureComplete: true,
    extensionMonotonicityEvidenceByDimension: monotonicityEvidence(),
    independentProbabilityMassMustBePreserved: false,
    ...overrides,
  };
}

const currentPolicy = buildWarmachineSearchEfficiencyPolicyV2("current_turn", {
  minimumTerminalProbability: 0.2,
  minimumOpponentWorstCase: 0.1,
});
const longPolicy = buildWarmachineSearchEfficiencyPolicyV2("long_horizon", {
  minimumTerminalProbability: 0.2,
  minimumOpponentWorstCase: 0.1,
  maximumTurnDistance: 4,
});
assert.equal(currentPolicy.proposalUniverse.maximumTurnDistance, 0);
assert.equal(longPolicy.proposalUniverse.maximumTurnDistance, 4);
assert.equal(currentPolicy.expansionPolicy.exactCurrentTurnCoverageTarget, true);
assert.equal(longPolicy.expansionPolicy.iterativeDeepening, true);
assert.deepEqual(
  buildWarmachineSearchEfficiencyPolicyV2("long_horizon", {
    minimumTerminalProbability: 0.2,
    minimumOpponentWorstCase: 0.1,
    maximumTurnDistance: 4,
  }),
  longPolicy,
);

const deliberateExchange = buildWarmachineRouteEfficiencyVectorV2(route("deliberate-exchange"));
assert.deepEqual(deliberateExchange.immediateRegression, {
  material: true,
  scenarioScore: true,
  deliberateExchange: true,
});
const deliberateEvaluation = evaluateWarmachineRouteEfficiencyFloorV2(
  deliberateExchange,
  longPolicy,
);
assert.equal(deliberateEvaluation.expansionEligible, true);
assert.equal(deliberateEvaluation.immediateRegressionCausedExclusion, false);
assert.equal(deliberateEvaluation.exactPromotionReady, true);

const belowFloor = buildWarmachineRouteEfficiencyVectorV2(route("below-floor", {
  terminalProbability: { lowerBound: 0.1, upperBound: 0.19, complete: true },
}));
const belowFloorEvaluation = evaluateWarmachineRouteEfficiencyFloorV2(belowFloor, longPolicy);
assert.equal(belowFloorEvaluation.rulesImpossible, false);
assert.equal(belowFloorEvaluation.expansionEligible, false);
assert.equal(belowFloorEvaluation.proposalOmissionMustBeRecorded, true);
assert.deepEqual(belowFloorEvaluation.proposalExclusions, [
  "terminal_probability_upper_bound_below_proposal_floor",
]);

const crossesFloor = buildWarmachineRouteEfficiencyVectorV2(route("crosses-floor", {
  terminalProbability: { lowerBound: 0.1, upperBound: 0.3, complete: false },
}));
const crossesFloorEvaluation = evaluateWarmachineRouteEfficiencyFloorV2(crossesFloor, longPolicy);
assert.equal(crossesFloorEvaluation.expansionEligible, true);
assert.deepEqual(crossesFloorEvaluation.floorUncertainty, [
  "terminal_probability_crosses_proposal_floor",
]);
assert.equal(crossesFloorEvaluation.proposalFloorCertified, false);

const exactHostReject = buildWarmachineRouteEfficiencyVectorV2(route("host-reject", {
  exactHostRefuted: true,
}));
const exactHostRejectEvaluation = evaluateWarmachineRouteEfficiencyFloorV2(
  exactHostReject,
  longPolicy,
);
assert.equal(exactHostRejectEvaluation.rulesImpossible, true);
assert.equal(exactHostRejectEvaluation.hardRulesPrunable, true);

const nextTurnRoute = buildWarmachineRouteEfficiencyVectorV2(route("next-turn", {
  searchMode: "current_turn",
  temporalCost: { turnDistance: 1, activationDistance: 2 },
}));
const currentHorizon = evaluateWarmachineRouteEfficiencyFloorV2(nextTurnRoute, currentPolicy);
const longHorizon = evaluateWarmachineRouteEfficiencyFloorV2(nextTurnRoute, longPolicy);
assert.deepEqual(currentHorizon.proposalExclusions, ["declared_search_horizon_exceeded"]);
assert.equal(longHorizon.expansionEligible, true);

const incompleteCurrent = buildWarmachineRouteEfficiencyVectorV2(route("incomplete-current", {
  searchMode: "current_turn",
  temporalCost: { turnDistance: 0, activationDistance: 2 },
  opponentResponseCursorExhausted: false,
  chanceMassComplete: false,
}));
const incompleteCurrentEvaluation = evaluateWarmachineRouteEfficiencyFloorV2(
  incompleteCurrent,
  currentPolicy,
);
assert.equal(incompleteCurrentEvaluation.strictRouteReportReady, true);
assert.equal(incompleteCurrentEvaluation.bestDiscoveredPromotionReady, false);
assert.equal(incompleteCurrentEvaluation.exactPromotionReady, false);
assert.ok(incompleteCurrentEvaluation.exactClosurePending.includes(
  "opponent_response_cursor_not_exhausted",
));
assert.ok(incompleteCurrentEvaluation.exactClosurePending.includes("chance_mass_incomplete"));

const incompleteLong = buildWarmachineRouteEfficiencyVectorV2(route("incomplete-long", {
  opponentResponseCursorExhausted: false,
  chanceMassComplete: false,
}));
const incompleteLongEvaluation = evaluateWarmachineRouteEfficiencyFloorV2(
  incompleteLong,
  longPolicy,
);
assert.equal(incompleteLongEvaluation.strictRouteReportReady, true);
assert.equal(incompleteLongEvaluation.bestDiscoveredPromotionReady, true);
assert.equal(incompleteLongEvaluation.exactPromotionReady, false);

const stronger = buildWarmachineRouteEfficiencyVectorV2(route("stronger", {
  terminalProbability: 0.75,
  temporalCost: { turnDistance: 1, activationDistance: 3 },
  friendlyResourceSpent: 2,
  rosterInvestment: { requiredFriendlyPoints: 24, engagedOpponentPoints: 40 },
  proposalCost: { strictCalls: 3, nodes: 80, wallTimeMs: 60 },
}));
const weaker = buildWarmachineRouteEfficiencyVectorV2(route("weaker", {
  terminalProbability: 0.65,
  temporalCost: { turnDistance: 2, activationDistance: 4 },
  friendlyResourceSpent: 3,
  rosterInvestment: { requiredFriendlyPoints: 30, engagedOpponentPoints: 40 },
  proposalCost: { strictCalls: 4, nodes: 100, wallTimeMs: 40 },
}));
const dominance = compareWarmachineRouteEfficiencyV2(stronger, weaker, longPolicy);
assert.equal(dominance.sameContext, true);
assert.equal(dominance.everyComparable, true);
assert.equal(dominance.everyNoWorse, true);
assert.equal(dominance.extensionMonotonicityProven, true);
assert.equal(dominance.hardDominates, true);
assert.equal(dominance.orderingPreference, "left");

const noMonotonicity = buildWarmachineRouteEfficiencyVectorV2(route("no-monotonicity", {
  terminalProbability: 0.65,
  temporalCost: { turnDistance: 2, activationDistance: 4 },
  friendlyResourceSpent: 3,
  rosterInvestment: { requiredFriendlyPoints: 30, engagedOpponentPoints: 40 },
  proposalCost: { strictCalls: 4, nodes: 100, wallTimeMs: 40 },
  extensionMonotonicityEvidenceByDimension: {},
}));
assert.equal(
  compareWarmachineRouteEfficiencyV2(stronger, noMonotonicity, longPolicy).hardDominates,
  false,
);

const preserveMass = buildWarmachineRouteEfficiencyVectorV2(route("preserve-mass", {
  terminalProbability: 0.65,
  temporalCost: { turnDistance: 2, activationDistance: 4 },
  friendlyResourceSpent: 3,
  rosterInvestment: { requiredFriendlyPoints: 30, engagedOpponentPoints: 40 },
  proposalCost: { strictCalls: 4, nodes: 100, wallTimeMs: 40 },
  independentProbabilityMassMustBePreserved: true,
}));
assert.equal(
  compareWarmachineRouteEfficiencyV2(stronger, preserveMass, longPolicy).hardDominates,
  false,
);

const unknownDimension = buildWarmachineRouteEfficiencyVectorV2(route("unknown-resource-cost", {
  terminalProbability: 0.65,
  temporalCost: { turnDistance: 2, activationDistance: 4 },
  friendlyResourceSpent: undefined,
  rosterInvestment: { requiredFriendlyPoints: 30, engagedOpponentPoints: 40 },
  proposalCost: { strictCalls: 4, wallTimeMs: 40 },
}));
const unknownComparison = compareWarmachineRouteEfficiencyV2(
  stronger,
  unknownDimension,
  longPolicy,
);
assert.equal(unknownComparison.everyComparable, false);
assert.equal(unknownComparison.hardDominates, false);

const otherContext = buildWarmachineRouteEfficiencyVectorV2(route("other-context", {
  dominanceContextKey: "different-terminal-suffix",
}));
assert.equal(
  compareWarmachineRouteEfficiencyV2(stronger, otherContext, longPolicy).hardDominates,
  false,
);

const ledger = buildWarmachineParetoRouteLedgerV2([
  route("stronger", {
    terminalProbability: 0.75,
    temporalCost: { turnDistance: 1, activationDistance: 3 },
    friendlyResourceSpent: 2,
    rosterInvestment: { requiredFriendlyPoints: 24, engagedOpponentPoints: 40 },
    proposalCost: { strictCalls: 3, nodes: 80, wallTimeMs: 60 },
  }),
  route("weaker", {
    terminalProbability: 0.65,
    temporalCost: { turnDistance: 2, activationDistance: 4 },
    friendlyResourceSpent: 3,
    rosterInvestment: { requiredFriendlyPoints: 30, engagedOpponentPoints: 40 },
    proposalCost: { strictCalls: 4, nodes: 100, wallTimeMs: 40 },
  }),
  route("below-floor", {
    terminalProbability: { lowerBound: 0.1, upperBound: 0.19, complete: true },
  }),
], longPolicy);
assert.equal(ledger.counts.inputRouteCount, 3);
assert.equal(ledger.counts.retainedRouteCount, 1);
assert.equal(ledger.retained[0].routeKey, "stronger");
assert.equal(ledger.counts.archivedExactDominatedRouteCount, 1);
assert.equal(ledger.archived[0].routeKey, "weaker");
assert.equal(ledger.archived[0].provenanceRetained, true);
assert.equal(ledger.counts.subjectiveProposalExclusionCount, 1);
assert.equal(ledger.omittedProposalMassMustBePersisted, true);
assert.equal(ledger.counts.immediateRegressionRetainedCount, 1);
assert.equal(Object.hasOwn(ledger.retained[0], "score"), false);
const vectorLedger = buildWarmachineParetoRouteLedgerV2([stronger, weaker], longPolicy);
assert.equal(vectorLedger.counts.retainedRouteCount, 1);
assert.equal(vectorLedger.retained[0].routeKey, "stronger");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_efficiency_policy_v2",
  policyHashes: {
    currentTurn: currentPolicy.policyHash,
    longHorizon: longPolicy.policyHash,
  },
  modeDifference: {
    nextTurnCurrentExpansionEligible: currentHorizon.expansionEligible,
    nextTurnLongExpansionEligible: longHorizon.expansionEligible,
    incompleteCurrentPromotionReady: incompleteCurrentEvaluation.bestDiscoveredPromotionReady,
    incompleteLongBestDiscoveredReady: incompleteLongEvaluation.bestDiscoveredPromotionReady,
  },
  floorCases: {
    belowFloor: belowFloorEvaluation.proposalExclusions,
    crossesFloor: crossesFloorEvaluation.floorUncertainty,
    hostRejectHardRulesPrunable: exactHostRejectEvaluation.hardRulesPrunable,
  },
  deliberateExchangeRetained: deliberateEvaluation.expansionEligible,
  exactDominance: {
    hardDominates: dominance.hardDominates,
    lowerRequiredFriendlyRosterPointsPreferred: true,
    missingMonotonicityBlocks: true,
    independentMassBlocks: true,
    unknownDimensionBlocks: true,
    differentContextBlocks: true,
  },
  ledgerCounts: ledger.counts,
  omittedProposalMassMustBePersisted: ledger.omittedProposalMassMustBePersisted,
  globalOptimalityProven: false,
}, null, 2));
