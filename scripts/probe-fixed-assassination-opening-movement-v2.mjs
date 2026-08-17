#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  bindWarmachineBenchmarkExplicitMovementPathV2,
  bindWarmachineTwoFrontsOpeningV2,
  buildWarmachineBenchmarkMovementScopeV2,
  executeWarmachineBenchmarkActivationV2,
  executeWarmachineBenchmarkControlPhaseV2,
} from "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import { buildWarmachineActivationGroups } from "../src/search/matchup-search-v1.mjs";

const attackerFormationArchetypeKey = String(
  process.env.WARMACHINE_ASSASSINATION_ATTACKER_FORMATION || "wide_screen",
);
const cachePath = path.resolve(
  `.scratch/fixed-steamroller-assassination-opening-${attackerFormationArchetypeKey}-v2.json`,
);
assert.equal(fs.existsSync(cachePath), true, "Run verify:fixed-assassination once to create the opening cache");
const openingCache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
const opening = openingCache.opening;
assert.equal(opening?.strictDeploymentLegal, true);

const rawPlan = process.env.WARMACHINE_ASSASSINATION_MOVEMENT_PLAN_JSON
  ? JSON.parse(process.env.WARMACHINE_ASSASSINATION_MOVEMENT_PLAN_JSON)
  : {};
const raptorPieceKey = String(rawPlan.raptorPieceKey || "player1_raptor_22_1");
const clearancePlans = Array.isArray(rawPlan.clearancePlans)
  ? rawPlan.clearancePlans
  : [
    {
      activationGroupKey: "player1_necrosurgeon_initiates_19",
      waypoint: { xIn: 13.12, yIn: 20.53 },
    },
    {
      activationGroupKey: "player1_necrosurgeon_initiates_16",
      waypoint: { xIn: 13.12, yIn: 37.47 },
    },
  ];
const raptorPath = Array.isArray(rawPlan.raptorPath) && rawPlan.raptorPath.length
  ? rawPlan.raptorPath
  : [
    { xIn: 15.3, yIn: 29.8 },
    { xIn: 20.25, yIn: 31.2 },
  ];
const raptorWaypoint = raptorPath[raptorPath.length - 1];

let state = bindWarmachineTwoFrontsOpeningV2(opening.state).state;
state = bindWarmachineBenchmarkExplicitMovementPathV2(state, {
  actorPieceKey: raptorPieceKey,
  actionType: "run",
  pathKey: "fixed-assassination-movement-probe-v2",
  label: "Fixed assassination movement probe",
  waypoints: raptorPath,
});

const control = executeWarmachineBenchmarkControlPhaseV2(state, {
  routeKey: "fixed-assassination-movement-probe:control",
  selectAction: ({ state: controlState, scoped }) => {
    const raptor = controlState.pieces.find((piece) => piece.pieceKey === raptorPieceKey);
    const allocation = scoped.enumeration.actions.find((action) =>
      action.actionType === "allocate_resource" && action.targetPieceKey === raptorPieceKey);
    if (allocation && Number(raptor?.resourcePoints || 0) < 1) return allocation;
    return scoped.enumeration.actions.find((action) => action.actionType === "end_control_phase") || null;
  },
});
assert.equal(control.ok, true, JSON.stringify(control.failures));
state = control.state;

const activationAudits = [];
function executeMovementActivation(activationGroupKey, waypoint, options = {}) {
  const group = buildWarmachineActivationGroups(state)
    .find((candidate) => candidate.groupKey === activationGroupKey);
  assert.ok(group, `Missing activation group ${activationGroupKey}`);
  const startingPositionByPieceKey = new Map(group.actorPieceKeys.map((pieceKey) => {
    const piece = state.pieces.find((candidate) => candidate.pieceKey === pieceKey);
    return [pieceKey, JSON.stringify(piece?.position || null)];
  }));
  const intent = {
    preferMovement: true,
    waypoint,
    avoidFeat: true,
  };
  const activation = executeWarmachineBenchmarkActivationV2(state, activationGroupKey, {
    routeKey: `fixed-assassination-movement-probe:${activationGroupKey}`,
    enumerationScope: buildWarmachineBenchmarkMovementScopeV2(
      state,
      group.actorPieceKeys,
      waypoint,
      { maximumTargetsPerActionType: 20 },
    ),
    intent,
    maxSteps: options.maxSteps || 16,
    rejectedAuditLimit: Math.max(0, Number(rawPlan.rejectedAuditLimit ?? 12)),
  });
  const movedPieceKeys = activation.state.pieces
    .filter((piece) => startingPositionByPieceKey.has(piece.pieceKey))
    .filter((piece) => JSON.stringify(piece.position || null) !==
      startingPositionByPieceKey.get(piece.pieceKey))
    .map((piece) => piece.pieceKey)
    .sort();
  const movementSelected = activation.selectionAudit.some((row) =>
    /advance|run|charge|move|reposition/.test(String(row.selectedAction?.actionType || "")) &&
    !/forfeit/.test(String(row.selectedAction?.actionType || "")));
  const planSatisfied = activation.ok && movementSelected && movedPieceKeys.length > 0;
  activationAudits.push({
    activationGroupKey,
    waypoint,
    ok: activation.ok,
    planSatisfied,
    movedPieceKeys,
    reason: activation.reason,
    transitionCount: activation.transitionCount,
    selectionAudit: activation.selectionAudit.map((row) => ({
      stepIndex: row.stepIndex,
      selectedAction: row.selectedAction,
      legalActionCount: row.legalActionCount,
      rejectedActionCount: row.rejectedActionCount,
      rejectedActions: row.stepIndex === 0 ? row.rejectedActions : undefined,
    })),
  });
  if (activation.ok) state = activation.state;
  return { ...activation, planSatisfied, movedPieceKeys };
}

for (const plan of clearancePlans) {
  const activation = executeMovementActivation(plan.activationGroupKey, plan.waypoint);
  if (!activation.planSatisfied) break;
}
if (activationAudits.every((audit) => audit.planSatisfied)) {
  executeMovementActivation(raptorPieceKey, raptorWaypoint, { maxSteps: 8 });
}

const relevantPieceKeys = new Set([
  raptorPieceKey,
  ...clearancePlans.map((plan) => plan.activationGroupKey),
]);
const pieces = state.pieces
  .filter((piece) => relevantPieceKeys.has(piece.pieceKey) ||
    relevantPieceKeys.has(piece.unitGroupId))
  .map((piece) => ({
    pieceKey: piece.pieceKey,
    unitGroupId: piece.unitGroupId || "",
    position: piece.position,
    resourcePoints: Number(piece.resourcePoints || 0),
  }));

console.log(JSON.stringify({
  ok: activationAudits.every((audit) => audit.planSatisfied),
  schemaVersion: "warmachine_fixed_assassination_opening_movement_probe_v2",
  openingKey: opening.openingKey,
  cacheBindingHash: openingCache.cacheBindingHash,
  raptorPieceKey,
  raptorPath,
  clearancePlans,
  pieces,
  activationAudits,
}, null, 2));
