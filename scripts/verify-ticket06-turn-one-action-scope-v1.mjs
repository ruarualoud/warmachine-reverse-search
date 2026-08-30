#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { enumerateWarmachineBenchmarkActionsV2 } from
  "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixturePath = path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
  "ticket06-short-route-preflight-fixture-v1.json",
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const witness = fixture.witness;
const vordakPieceKey = witness.pieceKeys.vordakPieceKey;

function alive(piece = {}) {
  return piece.destroyed !== true && piece.removedFromPlay !== true &&
    Number(piece.damage?.boxesRemaining ?? 1) > 0;
}

function actor(state, pieceKey) {
  return (state.pieces || []).find((piece) => piece.pieceKey === pieceKey);
}

function centerDistance(left = {}, right = {}) {
  return Math.hypot(
    Number(left.position?.xIn || 0) - Number(right.position?.xIn || 0),
    Number(left.position?.yIn || 0) - Number(right.position?.yIn || 0),
  );
}

function targetActionAudit(state, sideKey, targetPieceKey) {
  const actorPieceKeys = (state.pieces || []).filter((piece) =>
    alive(piece) && piece.sideKey === sideKey && piece.activated !== true)
    .map((piece) => piece.pieceKey).sort();
  const scoped = enumerateWarmachineBenchmarkActionsV2(state, {
    actorPieceKeys,
    targetPieceKeys: [targetPieceKey],
    actionFamilyKeys: ["attack_or_effect", "movement", "resource", "special"],
  });
  const legal = scoped.enumeration.actions.filter((action) =>
    action.targetPieceKey === targetPieceKey);
  const failedCharges = legal.filter((action) =>
    ["failed_charge", "unit_group_failed_charge"].includes(action.actionType));
  const materialActions = legal.filter((action) =>
    !["failed_charge", "unit_group_failed_charge"].includes(action.actionType));
  return stableGraphValue({
    actorCount: actorPieceKeys.length,
    legalTargetActionCount: legal.length,
    failedChargeCount: failedCharges.length,
    materialTargetActionCount: materialActions.length,
    legalTargetActions: legal.map((action) => ({
      actorPieceKey: action.actorPieceKey,
      actionType: action.actionType,
      actionKey: action.actionKey,
      destination: action.destination || null,
      expectedDamage: Number(action.expectedDamage || 0),
    })),
  });
}

const p2ActivationStart = witness.stages.p2TurnOne.control.state;
const vordak = actor(p2ActivationStart, vordakPieceKey);
assert.ok(vordak);
const enemies = p2ActivationStart.pieces.filter((piece) =>
  alive(piece) && piece.sideKey !== vordak.sideKey)
  .sort((left, right) => centerDistance(vordak, left) -
    centerDistance(vordak, right));
assert.ok(enemies.length > 0);
const scopedVordak = enumerateWarmachineBenchmarkActionsV2(
  p2ActivationStart,
  {
    actorPieceKeys: [vordakPieceKey],
    targetPieceKeys: enemies.map((piece) => piece.pieceKey),
    actionFamilyKeys: ["attack_or_effect", "movement"],
  },
);
const vordakChargeActions = scopedVordak.enumeration.actions.filter((action) =>
  action.actorPieceKey === vordakPieceKey &&
    /charge/.test(action.actionType));
const successfulCharges = vordakChargeActions.filter((action) =>
  !["failed_charge", "unit_group_failed_charge"].includes(action.actionType));
const failedCharges = vordakChargeActions.filter((action) =>
  ["failed_charge", "unit_group_failed_charge"].includes(action.actionType));
const runDestination = witness.stages.p2TurnOne.plannedActivations[0].state
  .pieces.find((piece) => piece.pieceKey === vordakPieceKey).position;
const runDistanceIn = centerDistance(vordak, { position: runDestination });
const runAllowanceIn = Number(vordak.speedIn || 0) + 5;
const chargeAllowanceIn = Number(vordak.speedIn || 0) + 3;
const maximumFailedChargeDistanceIn = Math.max(0, ...failedCharges.map((action) =>
  centerDistance(vordak, { position: action.destination })));

assert.equal(runDistanceIn, runAllowanceIn);
assert.equal(successfulCharges.length, 0);
assert.ok(failedCharges.length > 0);
assert.ok(maximumFailedChargeDistanceIn <= chargeAllowanceIn + 0.001);
assert.ok(maximumFailedChargeDistanceIn < runDistanceIn - 0.001);
assert.ok(centerDistance(vordak, enemies[0]) > chargeAllowanceIn + 2);

const p1TurnStartAudit = targetActionAudit(
  witness.stages.p1TurnOne.control.state,
  "player1",
  vordakPieceKey,
);
assert.equal(p1TurnStartAudit.materialTargetActionCount, 0,
  JSON.stringify(p1TurnStartAudit, null, 2));
assert.ok(p1TurnStartAudit.failedChargeCount > 0);

const afterSepsiraRun = witness.stages.p1TurnOne.plannedActivations[0].state;
const afterSepsiraRunAudit = targetActionAudit(
  afterSepsiraRun,
  "player1",
  vordakPieceKey,
);
assert.equal(afterSepsiraRunAudit.materialTargetActionCount, 0,
  JSON.stringify(afterSepsiraRunAudit, null, 2));

const core = stableGraphValue({
  schemaVersion: "warmachine_ticket06_turn_one_action_scope_v1",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  fixtureWitnessHash: fixture.witnessHash,
  vordakPieceKey,
  vordakSpeedIn: Number(vordak.speedIn || 0),
  runDistanceIn,
  runAllowanceIn,
  chargeAllowanceIn,
  nearestEnemyCenterDistanceIn: centerDistance(vordak, enemies[0]),
  successfulChargeCount: successfulCharges.length,
  failedChargeCount: failedCharges.length,
  maximumFailedChargeDistanceIn,
  p1TurnStartAudit,
  afterSepsiraRunAudit,
  routeSelectionSource: "hard_coded_witness_then_independent_current_host_audit",
  responseClosure: false,
  claimBoundary: "This current-Host audit proves that the fixed Ticket 06 turn-one Vordak destination requires the 12-inch run and that neither recorded player1 state exposes an immediate single-activation material action targeting Vordak. It does not exhaust alternate player1 activation sequences that could first apply a buff, debuff, place or other enabling effect. The original witness hard-coded run and completion-only activations; this audit does not close whole-turn or later-turn opponent responses, Chance mass or strategy optimality.",
});

console.log(JSON.stringify({
  ...core,
  reportHash: stableGraphHash(core),
  ok: true,
}, null, 2));
