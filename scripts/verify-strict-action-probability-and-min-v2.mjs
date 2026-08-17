#!/usr/bin/env node

import assert from "node:assert/strict";

import { evaluateWarmachineStrictActionProbabilityAndMinV2 } from
  "../src/search/strict-action-probability-and-min-v2.mjs";

function piece(overrides = {}) {
  const boxesRemaining = overrides.boxesRemaining ?? 12;
  return {
    pieceKey: overrides.pieceKey || "piece",
    label: overrides.label || overrides.pieceKey || "Piece",
    sideKey: overrides.sideKey || "player1",
    modelRole: overrides.modelRole || "warrior",
    modelType: overrides.modelType || overrides.modelRole || "warrior",
    position: overrides.position || { xIn: 6, yIn: 6 },
    baseSizeIn: overrides.baseSizeIn ?? 1.18,
    speedIn: 6,
    meleeRangeIn: 1,
    defense: overrides.defense ?? 10,
    armor: overrides.armor ?? 10,
    mat: overrides.mat ?? 8,
    resourceKind: overrides.resourceKind || "none",
    resourcePoints: overrides.resourcePoints ?? 0,
    resourceMax: overrides.resourceMax ?? 0,
    controlRangeIn: overrides.controlRangeIn ?? 12,
    damage: { boxesRemaining, maxBoxes: overrides.maxBoxes ?? boxesRemaining },
    statusTags: [],
    attackProfiles: overrides.attackProfiles || [],
    ...overrides,
  };
}

const state = {
  stateKey: "strict-action-and-min-damage-transfer-v2",
  activeSideKey: "player2",
  phaseKey: "activation",
  turnNumber: 2,
  strictMode: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    piece({
      pieceKey: "defender-lock",
      modelRole: "warlock",
      modelType: "warlock",
      isWarlock: true,
      isWarrior: true,
      resourceKind: "fury",
      resourcePoints: 1,
      resourceMax: 6,
      battlegroupId: "defender-bg",
      boxesRemaining: 5,
      maxBoxes: 5,
    }),
    piece({
      pieceKey: "defender-beast",
      modelRole: "warbeast",
      modelType: "warbeast",
      position: { xIn: 9, yIn: 6 },
      baseSizeIn: 1.57,
      resourceKind: "fury",
      resourcePoints: 0,
      resourceMax: 4,
      controllerPieceKey: "defender-lock",
      battlegroupId: "defender-bg",
      boxesRemaining: 100,
      maxBoxes: 100,
    }),
    piece({
      pieceKey: "attacker",
      sideKey: "player2",
      modelRole: "warjack",
      modelType: "warjack",
      position: { xIn: 7, yIn: 6 },
      attackProfiles: [{
        profileKey: "execution-blade",
        name: "Execution Blade",
        mode: "melee",
        rangeIn: 1,
        power: 10,
        attackStat: 8,
        attackStatKind: "MAT",
      }],
    }),
  ],
  terrain: [],
  scenario: { zones: [], flags: [], score: { player1: 0, player2: 0 }, victoryThreshold: 5 },
};

const report = evaluateWarmachineStrictActionProbabilityAndMinV2(state, {
  routeKey: "verify-strict-action-and-min-damage-transfer-v2",
  perspectiveSideKey: "player2",
  enumerationScope: {
    actorPieceKeys: ["attacker"],
    targetPieceKeys: ["defender-lock"],
    actionFamilyKeys: ["attack_or_effect"],
    includeUntargetedActions: false,
  },
  actionKey: "attacker:melee:defender-lock:execution-blade:v1",
  classifyResult: ({ state: resultState }) => {
    const target = resultState.pieces.find((candidate) =>
      candidate.pieceKey === "defender-lock");
    return !target || target.destroyed === true || Number(target.damage?.boxesRemaining || 0) <= 0
      ? { outcome: "success", reason: "warlock_destroyed" }
      : { outcome: "failure", reason: "warlock_survived" };
  },
});

assert.equal(report.ok, true);
assert.equal(report.chanceMassComplete, true);
assert.equal(report.opponentResponseSetComplete, true);
assert.equal(report.opponentDecisionKind, "damage_transfer");
assert.equal(report.opponentDecisionOwnerSideKey, "player1");
assert.equal(report.opponentResponseCount, 2);
assert.equal(report.quantifierContract.opponentResponses, "opponent_and_min");
assert.equal(report.probabilityInterval.exact, true);
assert.equal(report.probabilityInterval.lowerBound, 0);
assert.equal(report.probabilityInterval.upperBound, 0);
assert.ok(report.chanceNodes.some((node) =>
  node.responses.some((response) => response.responseKey === "decline" &&
    response.interval.outcome === "success")));
assert.ok(report.chanceNodes.every((node) => node.interval.selectedResponseKey !== "decline" ||
  node.responses.find((response) => response.responseKey === "decline")?.interval.outcome !== "success"));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: report.schemaVersion,
  reportHash: report.reportHash,
  chanceClassCount: report.chanceClassCount,
  opponentResponseCount: report.opponentResponseCount,
  quantifierContract: report.quantifierContract,
  probabilityInterval: report.probabilityInterval,
}, null, 2));
