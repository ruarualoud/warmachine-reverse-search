import assert from "node:assert/strict";
import fs from "node:fs";

import {
  runWarmachineForwardCompletionComparisonV2,
  runWarmachineStrictForwardConnectorV2,
} from "../src/search/forward-completion-experiment-v2.mjs";
import {
  buildWarmachineSearchDirectionMeasurementV1,
  buildWarmachineSearchDirectionPolicyV1,
  evaluateWarmachineSearchDirectionGateV1,
} from "../src/search/direction-feasibility-v1.mjs";

const EVIDENCE_PATH = new URL(
  "../docs/research/forward-completion-experiment-v2-verification.json",
  import.meta.url,
);

function terrain(terrainKey, xIn, yIn, setupOrderIndex) {
  return {
    terrainKey,
    type: "scenario terrain",
    isScenarioTerrain: true,
    xIn,
    yIn,
    widthIn: 2,
    heightIn: 2,
    ownerSideKey: "",
    sourceFlagKey: terrainKey,
    sourceFlagPosition: { xIn, yIn },
    scenarioTerrainSetupChoiceRequired: true,
    scenarioTerrainSetupChoiceResolved: true,
    scenarioTerrainFallbackUsed: true,
    scenarioTerrainSelectionCandidateKeys: [],
    scenarioTerrainSetupOrderIndex: setupOrderIndex,
    geometryExactWithinScope: true,
    geometryIssues: [],
  };
}

function leader(overrides = {}) {
  const pieceKey = overrides.pieceKey || "leader";
  const boxesRemaining = overrides.boxesRemaining ?? 5;
  return {
    pieceKey,
    label: overrides.label || pieceKey,
    sideKey: overrides.sideKey || "player1",
    modelRole: "warcaster",
    modelType: "warcaster",
    isWarcaster: true,
    position: overrides.position || { xIn: 24, yIn: 24 },
    baseSizeIn: 1.18,
    speedIn: overrides.speedIn ?? 6,
    defense: overrides.defense ?? 12,
    armor: overrides.armor ?? 16,
    damage: { boxesRemaining, maxBoxes: overrides.maxBoxes ?? boxesRemaining },
    statusTags: [],
    activated: overrides.activated ?? false,
    attackProfiles: overrides.attackProfiles || [],
    cardSnapshot: { id: `card-${pieceKey}`, pointCostNumber: 0 },
  };
}

function killingProfile() {
  return {
    profileKey: "completion-terminal-blade",
    name: "Completion Terminal Blade",
    mode: "melee",
    rangeIn: 2,
    power: 24,
    attackStat: 8,
    attackStatKind: "MAT",
  };
}

function pressurePointState(overrides = {}) {
  return {
    stateKey: overrides.stateKey || "forward-completion-v2",
    activeSideKey: overrides.activeSideKey || "player2",
    phaseKey: "activation",
    turnNumber: overrides.turnNumber ?? 2,
    strictMode: true,
    enforceStrictExecutor: true,
    board: { widthIn: 48, heightIn: 48 },
    pieces: overrides.pieces || [],
    terrain: [
      terrain("pressure-a", 8, 34, 0),
      terrain("pressure-b", 16, 36, 1),
      terrain("pressure-c", 32, 12, 2),
      terrain("pressure-d", 40, 14, 3),
    ],
    deploymentBackEdgeBySide: { player1: "south", player2: "north" },
    scenario: {
      packetKey: "steamroller-2026",
      packetYear: "2026",
      scenarioName: "Pressure Point",
      attackerSideKey: "player1",
      defenderSideKey: "player2",
      scoringStartSideKey: "player2",
      scoringStartTurnNumber: 2,
      score: { player1: 0, player2: 0 },
      objectives: [{ objectiveKey: "center-50", baseSizeMm: 50, xIn: 24, yIn: 24 }],
      caches: [],
      ...(overrides.scenario || {}),
    },
  };
}

const assassinationState = pressurePointState({
  stateKey: "completion-direct-assassination",
  activeSideKey: "player1",
  turnNumber: 1,
  pieces: [
    leader({
      pieceKey: "p1-leader",
      sideKey: "player1",
      position: { xIn: 10, yIn: 10 },
      attackProfiles: [killingProfile()],
    }),
    leader({
      pieceKey: "p2-leader",
      sideKey: "player2",
      position: { xIn: 11.1, yIn: 10 },
      boxesRemaining: 1,
    }),
  ],
});

const directScoreState = pressurePointState({
  stateKey: "completion-direct-score",
  pieces: [
    leader({ pieceKey: "p1-leader", sideKey: "player1", position: { xIn: 10, yIn: 10 }, activated: true }),
    leader({ pieceKey: "p2-leader", sideKey: "player2", position: { xIn: 38, yIn: 38 }, activated: true }),
  ],
  scenario: { score: { player1: 3, player2: 0 } },
});

const withdrawalState = pressurePointState({
  stateKey: "completion-withdrawal-score",
  pieces: [
    leader({ pieceKey: "p1-leader", sideKey: "player1", position: { xIn: 22.8, yIn: 24 }, activated: true }),
    leader({ pieceKey: "p2-leader", sideKey: "player2", position: { xIn: 25.2, yIn: 24 } }),
  ],
  scenario: { score: { player1: 1, player2: 0 } },
});

const scoreSpecification = {
  goalType: "scenario_score",
  winnerSideKey: "player1",
  endingSideKey: "player2",
};
const endTurnSelector = { actionType: "end_turn" };

const scenarios = [
  {
    scenarioKey: "direct-assassination",
    initialState: assassinationState,
    terminalSpecification: { goalType: "assassination", winnerSideKey: "player1" },
    terminalActionSelector: {
      actionType: "melee_attack",
      actorPieceKey: "p1-leader",
      targetPieceKey: "p2-leader",
    },
    reverseRouteProposals: [{
      proposalKey: "direct-terminal-melee",
      steps: [{
        actionSelector: {
          actionType: "melee_attack",
          actorPieceKey: "p1-leader",
          targetPieceKey: "p2-leader",
        },
      }],
    }],
    maximumDepth: 1,
    guidedMaximumActionsPerState: 4,
  },
  {
    scenarioKey: "direct-scenario-score",
    initialState: directScoreState,
    terminalSpecification: scoreSpecification,
    terminalActionSelector: endTurnSelector,
    reverseRouteProposals: [{
      proposalKey: "direct-terminal-end-turn",
      steps: [{ actionSelector: endTurnSelector }],
    }],
    maximumDepth: 1,
  },
  {
    scenarioKey: "withdrawal-before-score",
    initialState: withdrawalState,
    terminalSpecification: scoreSpecification,
    terminalActionSelector: endTurnSelector,
    reverseRouteProposals: [{
      proposalKey: "premature-end-turn",
      steps: [{ actionSelector: endTurnSelector }],
    }],
    milestones: [{
      milestoneKey: "withdraw-p2-contester",
      milestoneKind: "piece_distance_to_point_at_least",
      pieceKey: "p2-leader",
      point: { xIn: 24, yIn: 24 },
      distanceIn: 8,
    }],
    preferredPrefixActionTypes: ["run", "advance", "pass"],
    maximumDepth: 2,
    maximumTransitions: 96,
    unguidedMaximumActionsPerState: 64,
    guidedMaximumActionsPerState: 3,
  },
];

const comparison = runWarmachineForwardCompletionComparisonV2(scenarios);
assert.equal(comparison.counts.scenarioCount, 3);
assert.equal(comparison.counts.pureReverseWitnessCount, 2);
assert.equal(comparison.counts.milestoneConnectorWitnessCount, 3);
assert.equal(comparison.counts.connectorRecoveredGapCount, 1);
assert.equal(comparison.counts.directReversePreferredCount, 2);
assert.equal(comparison.counts.guidedConnectorPreferredCount, 1);
assert.equal(comparison.counts.unresolvedScenarioCount, 0);
assert.equal(comparison.globalOptimalityProven, false);
assert.equal(comparison.chanceMassComplete, false);
assert.equal(comparison.opponentResponseSetComplete, false);
assert.equal(comparison.trainingTruth, false);

const assassination = comparison.rows.find((row) => row.scenarioKey === "direct-assassination");
assert.equal(assassination.pureReverse.strictWitness, true);
assert.equal(assassination.pureReverse.witness.proof.goalType, "assassination");
assert.equal(assassination.decision.preferredMode, "pure_reverse_atomic");

const directScore = comparison.rows.find((row) => row.scenarioKey === "direct-scenario-score");
assert.equal(directScore.pureReverse.strictWitness, true);
assert.equal(directScore.pureReverse.witness.proof.goalType, "scenario_score");
assert.equal(directScore.decision.preferredMode, "pure_reverse_atomic");

const withdrawal = comparison.rows.find((row) => row.scenarioKey === "withdrawal-before-score");
assert.equal(withdrawal.pureReverse.strictWitness, false);
assert.equal(withdrawal.pureReverse.metrics.unavailableRequestedActionCount, 1);
assert.equal(withdrawal.milestoneConnector.strictWitness, true);
assert.deepEqual(
  withdrawal.milestoneConnector.witness.steps.map((step) => step.actionType),
  ["run", "end_turn"],
);
assert.ok(withdrawal.milestoneConnector.witness.steps[1].events.some((event) =>
  event.eventType === "terminal" && event.winnerSideKey === "player1"));
assert.equal(withdrawal.decision.preferredMode, "reverse_milestone_forward_connector");
assert.equal(withdrawal.decision.guidedUsesFewerTransitions, true);
assert.ok(withdrawal.milestoneConnector.metrics.omittedActionCount > 0);
assert.ok(withdrawal.milestoneConnector.metrics.omittedBranchFraction > 0);

const observedProcessMaxRssBytes = process.resourceUsage().maxRSS * 1_024;
const directionMeasurement = buildWarmachineSearchDirectionMeasurementV1({
  queryKey: "withdrawal-before-score-direction-calibration",
  terminalFamily: "scenario_score",
  horizonLayer: "one_local_connector_gap",
  hostReceiptHash: comparison.upstreamReceiptHash,
  searchContextKey: withdrawal.scenarioKey,
  proposalUniverseHash: comparison.comparisonHash,
  canonicalStateSchema: "warmachine_rules_v1_state",
  samplesByDirection: {
    forward: {
      methodKey: "unguided_strict_forward",
      batchKey: withdrawal.unguidedForward.resultHash,
      sourceReceiptHash: comparison.comparisonHash,
      expandedNodeCount: withdrawal.unguidedForward.metrics.expandedStateCount,
      generatedCandidateCount: withdrawal.unguidedForward.metrics.legalActionCountObserved,
      consistentCandidateCount: withdrawal.unguidedForward.metrics.routeCandidateCount,
      uniqueCandidateCount: withdrawal.unguidedForward.metrics.uniqueStateCount,
      unresolvedCandidateCount: withdrawal.unguidedForward.metrics.omittedActionCount +
        withdrawal.unguidedForward.metrics.budgetUnresolvedCount,
      strictConnectionWitnessCount: withdrawal.unguidedForward.metrics.strictWitnessCount,
      strictTransitionCallCount: withdrawal.unguidedForward.metrics.transitionCalls,
      elapsedMs: withdrawal.unguidedForward.metrics.elapsedMs,
      peakBytes: observedProcessMaxRssBytes,
    },
    reverse: {
      methodKey: "symbolic_reverse_milestone_plus_strict_forward_connector",
      batchKey: withdrawal.milestoneConnector.resultHash,
      sourceReceiptHash: comparison.comparisonHash,
      expandedNodeCount: withdrawal.milestoneConnector.metrics.expandedStateCount,
      generatedCandidateCount: withdrawal.milestoneConnector.metrics.legalActionCountObserved,
      consistentCandidateCount: withdrawal.milestoneConnector.metrics.routeCandidateCount,
      uniqueCandidateCount: withdrawal.milestoneConnector.metrics.uniqueStateCount,
      unresolvedCandidateCount: withdrawal.milestoneConnector.metrics.omittedActionCount +
        withdrawal.milestoneConnector.metrics.budgetUnresolvedCount,
      strictConnectionWitnessCount: withdrawal.milestoneConnector.metrics.strictWitnessCount,
      strictTransitionCallCount: withdrawal.milestoneConnector.metrics.transitionCalls,
      elapsedMs: withdrawal.milestoneConnector.metrics.elapsedMs,
      peakBytes: observedProcessMaxRssBytes,
    },
  },
});
const directionPolicy = buildWarmachineSearchDirectionPolicyV1({
  policyKey: "withdrawal-before-score-calibration-v1",
  configuredBy: "fixed_same_denominator_benchmark",
  calibrationReceiptHashes: [comparison.comparisonHash],
  minimumExpandedNodesPerDirection: 2,
  minimumGeneratedCandidatesPerDirection: 4,
  maximumUnresolvedRate: 0.95,
  minimumRelativeCostAdvantage: 1.25,
  maximumJoinFalsePositiveRate: 0.4,
  nextBatchExpansionCount: 2,
  memoryBudgetBytes: observedProcessMaxRssBytes * 4,
});
const directionDecision = evaluateWarmachineSearchDirectionGateV1(
  directionMeasurement,
  directionPolicy,
);
assert.equal(directionMeasurement.contractOk, true);
assert.equal(directionDecision.decision, "expand_reverse");
assert.ok(directionDecision.reasons.includes(
  "reverse_lower_observed_strict_transition_cost",
));
assert.equal(directionDecision.reachabilityDispositionChanged, false);

const budgetLimited = runWarmachineStrictForwardConnectorV2(
  withdrawalState,
  scoreSpecification,
  {
    experimentKey: "withdrawal-budget-stop",
    strategy: "milestone_guided",
    terminalActionSelector: endTurnSelector,
    milestones: scenarios[2].milestones,
    preferredPrefixActionTypes: scenarios[2].preferredPrefixActionTypes,
    maximumDepth: 2,
    maximumExpandedStates: 8,
    maximumTransitions: 1,
    maximumActionsPerState: 1,
  },
);
assert.equal(budgetLimited.strictWitness, false);
assert.equal(budgetLimited.stopReason, "transition_budget_exhausted");
assert.ok(budgetLimited.metrics.budgetUnresolvedCount > 0);
assert.ok(budgetLimited.metrics.omittedActionCount > 0);
assert.equal(budgetLimited.globalOptimalityProven, false);

const rerun = runWarmachineForwardCompletionComparisonV2(scenarios);
assert.equal(rerun.comparisonHash, comparison.comparisonHash);
for (let index = 0; index < comparison.rows.length; index += 1) {
  assert.equal(rerun.rows[index].pureReverse.resultHash, comparison.rows[index].pureReverse.resultHash);
  assert.equal(rerun.rows[index].unguidedForward.resultHash, comparison.rows[index].unguidedForward.resultHash);
  assert.equal(
    rerun.rows[index].milestoneConnector.resultHash,
    comparison.rows[index].milestoneConnector.resultHash,
  );
}

const evidence = {
  schemaVersion: "warmachine_forward_completion_experiment_v2_verification",
  generatedAt: new Date().toISOString(),
  comparison,
  budgetLimited,
  directionCalibration: {
    measurement: directionMeasurement,
    policy: directionPolicy,
    decision: directionDecision,
  },
};
fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  upstreamReceiptHash: comparison.upstreamReceiptHash,
  counts: comparison.counts,
  withdrawalMetrics: {
    pureReverse: withdrawal.pureReverse.metrics,
    unguidedForward: withdrawal.unguidedForward.metrics,
    milestoneConnector: withdrawal.milestoneConnector.metrics,
  },
  budgetStop: {
    stopReason: budgetLimited.stopReason,
    budgetUnresolvedCount: budgetLimited.metrics.budgetUnresolvedCount,
  },
  comparisonHash: comparison.comparisonHash,
  directionCalibration: {
    measurementHash: directionMeasurement.measurementHash,
    policyHash: directionPolicy.policyHash,
    decision: directionDecision.decision,
    reasons: directionDecision.reasons,
  },
}, null, 2));
