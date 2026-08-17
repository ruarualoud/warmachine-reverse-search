import assert from "node:assert/strict";

import {
  buildWarmachineTerminalObligationGraph as buildLocalGraph,
  warmachineTerminalProbabilityBoundIsExact as localBoundIsExact,
} from "../src/search/terminal-obligation-graph-v1.mjs";
import { loadLegacyReverseSearchModules } from "../src/upstream-project-d.mjs";

const { modules: legacyModules } = await loadLegacyReverseSearchModules({
  moduleKeys: ["terminalObligation"],
});
const legacyObligation = legacyModules.terminalObligation;
let graphParityCaseCount = 0;

function buildWarmachineTerminalObligationGraph(...args) {
  const local = buildLocalGraph(...args);
  const upstream = legacyObligation.buildWarmachineTerminalObligationGraph(...args);
  assert.deepEqual(local, upstream, `terminal obligation graph parity failed for case ${graphParityCaseCount + 1}`);
  graphParityCaseCount += 1;
  return local;
}

const state = {
  activeSideKey: "player1",
  turnNumber: 1,
  phaseKey: "activation",
  scenario: {
    victoryThreshold: 5,
    score: { player1: 0, player2: 0 },
  },
  pieces: [
    {
      pieceKey: "attacker",
      sideKey: "player1",
      position: { xIn: 2, yIn: 2 },
      baseSizeIn: 1.18,
      boxesRemaining: 10,
    },
    {
      pieceKey: "leader",
      sideKey: "player2",
      position: { xIn: 30, yIn: 2 },
      baseSizeIn: 1.18,
      boxesRemaining: 18,
    },
  ],
};

const assassination = {
  templateKey: "obligation-assassination",
  goalType: "assassination",
  attackerSideKey: "player1",
  defenderSideKey: "player2",
  attackerPieceKey: "attacker",
  targetPieceKey: "leader",
  targetBoxesBeforeFinal: 4,
  attackMode: "ranged",
  attackProfile: { profileKey: "rifle", mode: "ranged", rangeIn: 10, power: 12 },
  reachability: { minimumFriendlyTurns: 1, finalTurnThreatIn: 16, setupRunIn: 11 },
  probability: {
    singleAttackKillProbability: 0.2,
    boundKind: "screening_estimate_not_rules_authority",
  },
};

const screeningBranch = {
  terminalBranchKey: "screening-branch",
  terminalProbability: 0.2,
  minimumTerminalProbability: 0.8,
  probabilityEvidence: assassination.probability,
  probabilityBoundKind: assassination.probability.boundKind,
  reachability: assassination.reachability,
  resourceDemand: { total: 0, paymentModel: "no_resource_payment" },
  resourceSource: { sourceKind: "no_resource_required", openingFeasible: true },
};
const screeningGraph = buildWarmachineTerminalObligationGraph(state, assassination, screeningBranch, {
  minimumTerminalProbability: 0.8,
  horizonFriendlyTurns: 1,
});
assert.equal(screeningGraph.safelyRefuted, false,
  "a screening estimate below threshold must remain unresolved");
assert.equal(screeningGraph.nodes.find((node) => node.kind === "terminal_probability")?.verdict, "unresolved");
assert.equal(screeningGraph.nodes.find((node) => node.kind === "spatial_reachability")?.safelyRefuted, false,
  "an incomplete open-lane distance envelope must not hard-prune");
assert.equal(screeningGraph.directionalContract.completeForDeclaredNodes, true);
assert.ok(screeningGraph.edges.every((edge) => edge.direction === "effect_to_precondition"));
assert.ok(screeningGraph.edges.some((edge) =>
  edge.effectKind === "attack_resolution" && edge.preconditionKind === "spatial_reachability"));
assert.ok(screeningGraph.edges.some((edge) =>
  edge.effectKind === "attack_resolution" && edge.preconditionKind === "terminal_probability"));

const exactGraph = buildWarmachineTerminalObligationGraph(state, {
  ...assassination,
  probability: { singleAttackKillProbability: 0.2, boundKind: "exact_fixture_probability" },
}, {
  ...screeningBranch,
  terminalBranchKey: "exact-branch",
  probabilityEvidence: { singleAttackKillProbability: 0.2, boundKind: "exact_fixture_probability" },
  probabilityBoundKind: "exact_fixture_probability",
}, { minimumTerminalProbability: 0.8, horizonFriendlyTurns: 1 });
assert.equal(exactGraph.safelyRefuted, true);
assert.deepEqual(exactGraph.hardPruneReasons, ["terminal_probability_upper_bound_below_threshold"]);

const completeMovementGraph = buildWarmachineTerminalObligationGraph(state, assassination, {
  ...screeningBranch,
  terminalBranchKey: "complete-movement-branch",
}, {
  minimumTerminalProbability: 0,
  horizonFriendlyTurns: 1,
  movementUpperBoundComplete: true,
});
assert.equal(completeMovementGraph.safelyRefuted, true);
assert.ok(completeMovementGraph.hardPruneReasons.includes("spatial_reachability_upper_bound_refutation"));

const impossibleNamedSource = buildWarmachineTerminalObligationGraph(state, assassination, {
  ...screeningBranch,
  terminalBranchKey: "impossible-named-source",
  resourceDemand: { resourceKind: "focus", total: 2, paymentModel: "spend_held_resource" },
  resourceSource: { sourceKind: "carry_current_resource", openingFeasible: false },
}, { minimumTerminalProbability: 0 });
assert.ok(impossibleNamedSource.hardPruneReasons.includes("declared_resource_source_infeasible"));
assert.match(impossibleNamedSource.nodes.find((node) => node.kind === "resource_payment")?.claimBoundary || "", /other rule-granted resource sources/);

const scenarioGraph = buildWarmachineTerminalObligationGraph(state, {
  templateKey: "obligation-scenario",
  goalType: "scenario_score",
  attackerSideKey: "player1",
  defenderSideKey: "player2",
  attackerPieceKey: "attacker",
  scenarioElement: { elementType: "zone", elementKey: "center", xIn: 24, yIn: 24, radiusIn: 6 },
  scoreBeforeTerminal: 4,
  terminalScoreGain: 1,
  victoryThreshold: 5,
  scoringStartSideKey: "player2",
  scoringStartTurnNumber: 2,
  probability: { conditionalTerminalScoreProbability: 1, boundKind: "conditional_not_opponent_adjusted" },
  reachability: { minimumFriendlyTurns: 3, finalTurnThreatIn: 8, setupRunIn: 11 },
}, {
  terminalBranchKey: "scenario-branch",
  terminalProbability: 1,
  probabilityEvidence: { conditionalTerminalScoreProbability: 1, boundKind: "conditional_not_opponent_adjusted" },
  probabilityBoundKind: "conditional_not_opponent_adjusted",
  reachability: { minimumFriendlyTurns: 3, finalTurnThreatIn: 8, setupRunIn: 11 },
  resourceDemand: { total: 0, paymentModel: "no_resource_payment" },
  resourceSource: { sourceKind: "no_resource_required", openingFeasible: true },
}, { minimumTerminalProbability: 0.9, horizonFriendlyTurns: 3 });
assert.equal(scenarioGraph.safelyRefuted, false);
assert.ok(scenarioGraph.nodes.some((node) => node.kind === "scenario_score_transition"));
assert.ok(scenarioGraph.nodes.some((node) => node.kind === "scenario_control"));
assert.ok(scenarioGraph.nodes.some((node) => node.kind === "opponent_interference"));
assert.ok(scenarioGraph.edges.some((edge) =>
  edge.effectKind === "scenario_control" && edge.preconditionKind === "spatial_reachability"));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_terminal_obligation_graph_v1",
  screeningEstimateHardPruned: screeningGraph.safelyRefuted,
  exactProbabilityHardPruned: exactGraph.safelyRefuted,
  completeMovementBoundHardPruned: completeMovementGraph.safelyRefuted,
  namedResourceSourceHardPruned: impossibleNamedSource.safelyRefuted,
  directionalContractComplete: screeningGraph.directionalContract.completeForDeclaredNodes,
  scenarioObligationKinds: scenarioGraph.nodes.map((node) => node.kind),
}, null, 2));

for (const boundKind of ["exact_rules_pmf", "strict_exhaustive_probability_upper_bound", "heuristic"]) {
  assert.equal(
    localBoundIsExact(boundKind),
    legacyObligation.warmachineTerminalProbabilityBoundIsExact(boundKind),
  );
}

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_terminal_obligation_parity_v1",
  graphParityCaseCount,
  exactBoundHelperParityCaseCount: 3,
}, null, 2));
