#!/usr/bin/env node

import assert from "node:assert/strict";

import { buildWarmachineProbabilityDagV1 } from "../src/search/probability-dag-v1.mjs";

const report = buildWarmachineProbabilityDagV1(
  { stateKey: "root", payload: { stage: "attack_roll" } },
  ({ stateKey }) => {
    if (stateKey === "root") {
      return {
        nodeType: "chance",
        chanceEventKey: "attack-one",
        outcomes: [
          { outcomeKey: "route-a", numerator: 1, denominator: 2, stateKey: "merged-hit", payload: { boxes: 4 } },
          { outcomeKey: "route-b", numerator: 1, denominator: 4, stateKey: "merged-hit", payload: { boxes: 4 } },
          { outcomeKey: "rare", numerator: 1, denominator: 100, stateKey: "rare-state", payload: { boxes: 3 } },
          { outcomeKey: "miss", numerator: 6, denominator: 25, stateKey: "miss", outcome: "failure" },
        ],
      };
    }
    if (stateKey === "merged-hit") {
      return {
        nodeType: "chance",
        chanceEventKey: "damage-roll",
        outcomes: [
          { outcomeKey: "destroyed", numerator: 2, denominator: 3, stateKey: "destroyed", outcome: "success" },
          { outcomeKey: "survived", numerator: 1, denominator: 3, stateKey: "survived", outcome: "failure" },
        ],
      };
    }
    throw new Error(`unexpected expanded state ${stateKey}`);
  },
  {
    lowProbabilityThreshold: "0.02",
    maximumUncertainMassForDecision: "0.01",
    maximumDepth: 4,
    maximumExpandedNodes: 16,
  },
);

assert.equal(report.ok, true);
assert.equal(report.finalMass.massConserved, true);
assert.deepEqual(report.finalMass.success, { numerator: "1", denominator: "2", decimal: "0.5" });
assert.deepEqual(report.finalMass.failure, { numerator: "49", denominator: "100", decimal: "0.49" });
assert.deepEqual(report.finalMass.prunedLowProbability, {
  numerator: "1",
  denominator: "100",
  decimal: "0.01",
});
assert.deepEqual(report.finalMass.unresolved, { numerator: "0", denominator: "1", decimal: "0" });
assert.deepEqual(report.finalMass.successProbabilityInterval, {
  lowerBound: { numerator: "1", denominator: "2", decimal: "0.5" },
  upperBound: { numerator: "51", denominator: "100", decimal: "0.51" },
  exact: false,
});
assert.deepEqual(report.finalMass.uncertain, { numerator: "1", denominator: "100", decimal: "0.01" });
assert.equal(report.finalMass.decisionReady, true);
assert.equal(report.nodes.find((node) => node.stateKey === "merged-hit")?.cumulativeProbability.decimal, "0.75");
assert.equal(report.edges.filter((edge) => edge.childNodeKey ===
  report.nodes.find((node) => node.stateKey === "merged-hit")?.nodeKey).length, 2);
assert.equal(report.nodes.find((node) => node.stateKey === "rare-state")?.status, "pruned_low_probability");

const unresolvedReport = buildWarmachineProbabilityDagV1(
  { stateKey: "unsupported-special-rule" },
  () => ({ nodeType: "unresolved", reason: "special_rule_probability_not_closed" }),
  { lowProbabilityThreshold: "0.001" },
);
assert.equal(unresolvedReport.ok, true);
assert.deepEqual(unresolvedReport.finalMass.unresolved, {
  numerator: "1",
  denominator: "1",
  decimal: "1",
});
assert.deepEqual(unresolvedReport.finalMass.successProbabilityInterval, {
  lowerBound: { numerator: "0", denominator: "1", decimal: "0" },
  upperBound: { numerator: "1", denominator: "1", decimal: "1" },
  exact: false,
});
assert.equal(unresolvedReport.finalMass.decisionReady, false);

assert.throws(() => buildWarmachineProbabilityDagV1(
  { stateKey: "bad-mass" },
  () => ({
    nodeType: "chance",
    outcomes: [{ outcomeKey: "only", numerator: 1, denominator: 2, outcome: "success" }],
  }),
), /chance_outcome_mass_not_conserved/);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: report.schemaVersion,
  probabilityDagHash: report.probabilityDagHash,
  nodeCount: report.nodeCount,
  edgeCount: report.edgeCount,
  finalMass: report.finalMass,
  mergedHitMass: report.nodes.find((node) => node.stateKey === "merged-hit")?.cumulativeProbability,
  rareBranchStatus: report.nodes.find((node) => node.stateKey === "rare-state")?.status,
  unresolvedMass: unresolvedReport.finalMass.unresolved,
}, null, 2));
