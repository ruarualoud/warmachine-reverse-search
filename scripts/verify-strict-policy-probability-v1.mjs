#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

import { enumerateWarmachineBenchmarkActionsV2 } from
  "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import { evaluateWarmachineStrictPolicyProbabilityV1 } from
  "../src/search/strict-policy-probability-v1.mjs";
import { resolveWarmachineHostPath } from "../src/warmachine-host-runtime.mjs";

const fixtures = JSON.parse(fs.readFileSync(resolveWarmachineHostPath(
  "data/function3-fixtures/warmachine-micro-battle-fixtures.json",
), "utf8"));
const fixture = fixtures.fixtures.find((entry) => entry.fixtureId === "micro_ranged_attack_destroys_target");
assert.ok(fixture);

const report = evaluateWarmachineStrictPolicyProbabilityV1(
  fixture.state,
  ({ state, depth }) => {
    assert.equal(depth, 0);
    const scoped = enumerateWarmachineBenchmarkActionsV2(state, {
      actorPieceKeys: ["gunner"],
      targetPieceKeys: ["target"],
      includeUntargetedActions: false,
      actionFamilyKeys: ["attack_or_effect"],
    });
    return { scoped, actionKey: fixture.action.actionKey };
  },
  {
    routeKey: "micro-ranged-strict-probability-v1",
    lowProbabilityThreshold: "0.000001",
    maximumDepth: 1,
    classifyResult: ({ state }) => {
      const target = state.pieces.find((piece) => piece.pieceKey === "target");
      const boxesRemaining = Number(target?.boxesRemaining ?? target?.damage?.boxesRemaining ?? 0);
      return !target || target.destroyed === true || boxesRemaining <= 0
        ? { outcome: "success", reason: "target_destroyed" }
        : { outcome: "failure", reason: "target_survived" };
    },
  },
);

assert.equal(report.ok, true);
assert.equal(report.strictRejectedChanceEdgeCount, 0);
assert.equal(report.chanceAudits.length, 1);
assert.equal(report.chanceAudits[0].exactComplete, true);
assert.equal(report.finalMass.massConserved, true);
assert.equal(report.finalMass.successProbabilityInterval.exact, true);
assert.equal(report.finalMass.successProbabilityInterval.lowerBound.numerator,
  report.finalMass.successProbabilityInterval.upperBound.numerator);
assert.ok(Number(report.finalMass.success.decimal) > 0);
assert.ok(Number(report.finalMass.success.decimal) < 1);
assert.equal(report.dag.edges.every((edge) => edge.evidence?.transitionAccepted === true), true);
assert.equal(report.dag.edges.every((edge) => edge.evidence?.receiptHash), true);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: report.schemaVersion,
  strictPolicyProbabilityHash: report.strictPolicyProbabilityHash,
  chanceAudits: report.chanceAudits,
  nodeCount: report.dag.nodeCount,
  edgeCount: report.dag.edgeCount,
  finalMass: report.finalMass,
  strictRejectedChanceEdgeCount: report.strictRejectedChanceEdgeCount,
}, null, 2));
