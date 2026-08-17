#!/usr/bin/env node

import assert from "node:assert/strict";

import { groupWarmachineAdversarialChanceClassesV1 } from
  "../src/search/adversarial-chance-equivalence-v1.mjs";

function chanceRow(classKey, numerator, transferStateHash, overrides = {}) {
  return {
    chanceClass: {
      classKey,
      numerator,
      denominator: 6,
      strictRollOutcome: { attackDice: [Number(classKey.slice(-1)) || 1] },
    },
    responses: [
      {
        responseKey: "decline",
        actionKey: "attack:decline",
        choice: "decline",
        transitionAccepted: true,
        resultStateHash: "state-decline",
        outcome: "continue",
        receiptHash: `receipt-${classKey}-decline`,
        terminalEvents: [],
      },
      {
        responseKey: "transfer:beast",
        actionKey: "attack:transfer:beast",
        choice: "transfer",
        recipientPieceKey: "beast",
        transitionAccepted: true,
        resultStateHash: transferStateHash,
        outcome: "continue",
        receiptHash: `receipt-${classKey}-transfer`,
        terminalEvents: [],
      },
    ],
    ...overrides,
  };
}

const report = groupWarmachineAdversarialChanceClassesV1([
  chanceRow("class-1", 1, "state-transfer-a"),
  chanceRow("class-2", 2, "state-transfer-a"),
  chanceRow("class-3", 3, "state-transfer-b"),
], {
  ownerSideKey: "defender",
  decisionKind: "damage_transfer",
  responseSetComplete: true,
});

assert.equal(report.ok, true);
assert.equal(report.massConserved, true);
assert.equal(report.inputClassCount, 3);
assert.equal(report.equivalenceGroupCount, 2);
assert.equal(report.mergedClassCount, 1);
assert.equal(report.inputMassNumerator, "6");
assert.equal(report.groupedMassNumerator, "6");
const merged = report.groups.find((group) => group.classCount === 2);
assert.ok(merged);
assert.equal(merged.numerator, "3");
assert.deepEqual(merged.chanceClassKeys, ["class-1", "class-2"]);
assert.equal(merged.classEvidence.length, 2);
assert.notEqual(
  merged.classEvidence[0].responseEvidence[0].receiptHash,
  merged.classEvidence[1].responseEvidence[0].receiptHash,
);
const unmerged = report.groups.find((group) => group.classCount === 1);
assert.equal(unmerged.numerator, "3");

const terminalDifference = groupWarmachineAdversarialChanceClassesV1([
  chanceRow("class-1", 1, "state-transfer-a"),
  chanceRow("class-2", 5, "state-transfer-a", {
    responses: [
      {
        responseKey: "decline",
        actionKey: "attack:decline",
        choice: "decline",
        transitionAccepted: true,
        resultStateHash: "state-decline",
        outcome: "success",
        outcomeReason: "leader_destroyed",
        receiptHash: "terminal-difference",
        terminalEvents: [{ eventType: "terminal", winnerSideKey: "attacker" }],
      },
      chanceRow("nested", 1, "state-transfer-a").responses[1],
    ],
  }),
], {
  ownerSideKey: "defender",
  decisionKind: "damage_transfer",
  responseSetComplete: true,
});
assert.equal(terminalDifference.equivalenceGroupCount, 2);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: report.schemaVersion,
  equivalenceHash: report.equivalenceHash,
  inputClassCount: report.inputClassCount,
  equivalenceGroupCount: report.equivalenceGroupCount,
  mergedClassCount: report.mergedClassCount,
  mass: [report.groupedMassNumerator, report.denominator],
  terminalDifferenceGroupCount: terminalDifference.equivalenceGroupCount,
}, null, 2));
