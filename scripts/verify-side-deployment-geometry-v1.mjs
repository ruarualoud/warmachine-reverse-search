#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditWarmachineDeclaredMovementDeploymentReachabilityLowerBoundV1,
  auditWarmachineLegalDeploymentReachabilityV1,
  auditWarmachineSideDeploymentGeometryV1,
} from "../src/reverse/deployment-reachability-v1.mjs";
import { reverseWarmachineActivationSequenceV2 } from
  "../src/reverse/activation-sequence-predecessor-v2.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixture = JSON.parse(fs.readFileSync(path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
  "ticket07-score-forward-route-fixture-v1.json",
), "utf8"));
const opening = fixture.injectedOpeningState;
const deployments = Object.fromEntries((opening.deploymentZones || []).map((zone) => [
  zone.zoneKey || zone.deploymentZoneKey,
  {
    id: zone.zoneKey || zone.deploymentZoneKey,
    x: Number(zone.xIn ?? zone.x),
    y: Number(zone.yIn ?? zone.y),
    width: Number(zone.widthIn ?? zone.width),
    height: Number(zone.heightIn ?? zone.height),
  },
]));
const left40GroupKey = "player1_mechanithrall_brutes_24";
const right40GroupKey = "player1_necrosurgeon_initiates_20";
const sepsiraPieceKey = "player1_master_necrosurgeon_sepsira_1_1";
const player1OpeningRunGroups = [
  { groupKey: left40GroupKey, actionType: "run" },
  { groupKey: right40GroupKey, actionType: "run" },
  { groupKey: sepsiraPieceKey, actionType: "run" },
];

const fullOpeningAudit = auditWarmachineLegalDeploymentReachabilityV1(opening, {
  firstPlayerSideKey: "player2",
  deployments,
});
assert.equal(fullOpeningAudit.ok, true, JSON.stringify(fullOpeningAudit, null, 2));
for (const sideKey of ["player1", "player2"]) {
  const audit = auditWarmachineSideDeploymentGeometryV1(opening, {
    sideKey,
    deployments,
  });
  assert.equal(audit.ok, true, JSON.stringify(audit, null, 2));
}

const realPlayer1TurnOneEnd = fixture.stages[1].preEndState;
const realTurnOneLowerBound =
  auditWarmachineDeclaredMovementDeploymentReachabilityLowerBoundV1(
    realPlayer1TurnOneEnd,
    {
      sideKey: "player1",
      deployments,
      movementGroups: player1OpeningRunGroups,
    },
  );
assert.equal(realTurnOneLowerBound.ok, true,
  JSON.stringify(realTurnOneLowerBound, null, 2));

const impossibleTurnOneEnd = structuredClone(realPlayer1TurnOneEnd);
for (const piece of impossibleTurnOneEnd.pieces.filter((row) =>
  row.unitGroupId === right40GroupKey)) {
  piece.position.yIn = 23;
}
const impossibleTurnOneLowerBound =
  auditWarmachineDeclaredMovementDeploymentReachabilityLowerBoundV1(
    impossibleTurnOneEnd,
    {
      sideKey: "player1",
      deployments,
      movementGroups: player1OpeningRunGroups,
    },
  );
assert.equal(impossibleTurnOneLowerBound.ok, false);
assert.equal(impossibleTurnOneLowerBound.violations.some((row) =>
  row.groupKey === right40GroupKey &&
  row.reason === "deployment_distance_exceeds_declared_movement_allowance"), true);

const outside = structuredClone(opening);
const outsidePiece = outside.pieces.find((piece) => piece.sideKey === "player1");
outsidePiece.position.xIn = deployments.p1_deploy.x + deployments.p1_deploy.width;
const outsideAudit = auditWarmachineSideDeploymentGeometryV1(outside, {
  sideKey: "player1",
  deployments,
});
assert.equal(outsideAudit.ok, false);
assert.equal(outsideAudit.deploymentAudit.baseOutliers.some((row) =>
  row.tokenId === outsidePiece.pieceKey), true);

const overlap = structuredClone(opening);
const overlapPieces = overlap.pieces.filter((piece) =>
  piece.sideKey === "player1").slice(0, 2);
overlapPieces[1].position = structuredClone(overlapPieces[0].position);
const overlapAudit = auditWarmachineSideDeploymentGeometryV1(overlap, {
  sideKey: "player1",
  deployments,
});
assert.equal(overlapAudit.ok, false);
assert.equal(overlapAudit.deploymentAudit.overlapPairs.length > 0, true);

const disconnected = structuredClone(opening);
const groups = new Map();
for (const piece of disconnected.pieces.filter((row) =>
  row.sideKey === "player1" && row.unitGroupId)) {
  if (!groups.has(piece.unitGroupId)) groups.set(piece.unitGroupId, []);
  groups.get(piece.unitGroupId).push(piece);
}
const disconnectedGroup = [...groups.values()].find((members) =>
  members.length > 1);
assert.ok(disconnectedGroup);
disconnectedGroup[0].position = {
  xIn: deployments.p1_deploy.x - deployments.p1_deploy.width / 2 + 1,
  yIn: deployments.p1_deploy.y - deployments.p1_deploy.height / 2 + 1,
};
const disconnectedAudit = auditWarmachineSideDeploymentGeometryV1(disconnected, {
  sideKey: "player1",
  deployments,
});
assert.equal(disconnectedAudit.ok, false);
assert.equal(disconnectedAudit.deploymentAudit.disconnectedUnitGroups.some((row) =>
  row.unitGroupId === disconnectedGroup[0].unitGroupId), true);

const crossSideOverlap = structuredClone(opening);
const ownPiece = crossSideOverlap.pieces.find((piece) =>
  piece.sideKey === "player1");
const opposingPiece = crossSideOverlap.pieces.find((piece) =>
  piece.sideKey === "player2");
ownPiece.position = structuredClone(opposingPiece.position);
const crossSideAudit = auditWarmachineSideDeploymentGeometryV1(
  crossSideOverlap,
  { sideKey: "player1", deployments },
);
assert.equal(crossSideAudit.ok, false);
assert.equal(crossSideAudit.crossSideOverlapPairs.some((row) =>
  row.ownPieceKey === ownPiece.pieceKey &&
  row.opposingPieceKey === opposingPiece.pieceKey), true);

const invalidActivationBoundary = structuredClone(opening);
invalidActivationBoundary.phaseKey = "activation";
for (const piece of invalidActivationBoundary.pieces) {
  if (piece.sideKey === "player1") piece.activated = false;
}
const mismatchedBoundaryDeployments = structuredClone(deployments);
mismatchedBoundaryDeployments.p1_deploy = {
  ...mismatchedBoundaryDeployments.p1_deploy,
  y: 24,
  height: 2,
};
const rejectedBoundary = reverseWarmachineActivationSequenceV2(
  invalidActivationBoundary,
  {
    sideKey: "player1",
    deployments: mismatchedBoundaryDeployments,
    includePass: true,
    includeMovement: false,
    activationBoundaryStateObligations: [{
      obligationKind: "side_legal_deployment_geometry",
      sideKey: "player1",
      source: "side_deployment_geometry_regression",
    }],
  },
);
assert.equal(rejectedBoundary.boundaryRouteCount, 0);
assert.equal(rejectedBoundary.unresolved.some((row) =>
  row.reason === "activation_predecessor_obligation_unsatisfied" &&
  row.obligationViolations?.some((violation) =>
    violation.reason === "side_legal_deployment_geometry_unsatisfied")), true);

const impossibleReachabilityBoundary = structuredClone(realPlayer1TurnOneEnd);
impossibleReachabilityBoundary.phaseKey = "activation";
for (const piece of impossibleReachabilityBoundary.pieces) {
  if (piece.sideKey === "player1") piece.activated = false;
}
const impossibleBoundaryMovementGroups = player1OpeningRunGroups.map((group) =>
  group.groupKey === right40GroupKey
    ? { ...group, maximumMovementIn: 0 }
    : group);
const rejectedReachabilityBoundary = reverseWarmachineActivationSequenceV2(
  impossibleReachabilityBoundary,
  {
    sideKey: "player1",
    deployments,
    includePass: true,
    includeMovement: false,
    activationBoundaryStateObligations: [{
      obligationKind:
        "declared_movement_deployment_reachability_lower_bound",
      sideKey: "player1",
      movementGroups: impossibleBoundaryMovementGroups,
      source: "cross_turn_deployment_reachability_regression",
    }],
  },
);
assert.equal(rejectedReachabilityBoundary.boundaryRouteCount, 0);
assert.equal(rejectedReachabilityBoundary.unresolved.some((row) =>
  row.reason === "activation_predecessor_obligation_unsatisfied" &&
  row.obligationViolations?.some((violation) =>
    violation.reason ===
      "declared_movement_deployment_reachability_lower_bound_unsatisfied" &&
    violation.violations?.some((detail) =>
      detail.groupKey === right40GroupKey))), true);

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion: "warmachine_side_deployment_geometry_verifier_v1",
  openingReportHash: fullOpeningAudit.reportHash,
  failureClasses: [
    "base_outside_deployment_zone",
    "same_side_base_overlap",
    "unit_coherency_disconnected",
    "cross_side_base_overlap",
    "activation_boundary_global_geometry_rejection",
    "declared_movement_deployment_reachability_lower_bound",
    "activation_boundary_cross_turn_reachability_rejection",
  ],
}, null, 2)}\n`);
