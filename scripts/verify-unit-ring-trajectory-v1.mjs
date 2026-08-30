#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  auditLinearUnitFormationTrajectoryV1,
  rankUnitRingTrajectoryAssignmentsV1,
} from "../src/matchup/unit-ring-trajectory-v1.mjs";

const members = [
  { pieceKey: "brute_1", baseSizeIn: 1.2, position: { xIn: 17.32, yIn: 38.14 } },
  { pieceKey: "brute_2", baseSizeIn: 1.2, position: { xIn: 18.68, yIn: 38.14 } },
  { pieceKey: "brute_3", baseSizeIn: 1.2, position: { xIn: 17.32, yIn: 39.5 } },
];
const slots = [
  { xIn: 14.32, yIn: 28.22 },
  { xIn: 12.02, yIn: 29.54 },
  { xIn: 12.02, yIn: 26.88 },
];
const naiveDestinations = Object.fromEntries(members.map((model, index) => [
  model.pieceKey,
  slots[index],
]));
const naiveAudit = auditLinearUnitFormationTrajectoryV1({
  members,
  destinationsByPieceKey: naiveDestinations,
  movementAllowanceByPieceKey: Object.fromEntries(members.map((model) => [
    model.pieceKey,
    20,
  ])),
});
assert.equal(naiveAudit.ok, false);
assert.equal(naiveAudit.issues.some((issue) =>
  issue.reason === "unit_trajectory_internal_base_overlap"), true);

const ranked = rankUnitRingTrajectoryAssignmentsV1({
  members,
  slots,
  movementAllowanceByPieceKey: Object.fromEntries(members.map((model) => [
    model.pieceKey,
    20,
  ])),
});
assert.equal(ranked.length, 6);
assert.equal(ranked[0].trajectoryAudit.ok, true, JSON.stringify(ranked, null, 2));
assert.equal(ranked[0].maximumMovementDistanceIn <= 20, true);

const allowanceAudit = auditLinearUnitFormationTrajectoryV1({
  members,
  destinationsByPieceKey: ranked[0].destinationsByPieceKey,
  movementAllowanceByPieceKey: Object.fromEntries(members.map((model) => [
    model.pieceKey,
    1,
  ])),
});
assert.equal(allowanceAudit.ok, false);
assert.equal(allowanceAudit.issues.some((issue) =>
  issue.reason === "unit_trajectory_movement_allowance_exceeded"), true);

process.stdout.write(`${JSON.stringify({
  ok: true,
  naiveOverlapIssueCount: naiveAudit.issues.length,
  assignmentCount: ranked.length,
  selectedAssignmentKey: ranked[0].assignmentKey,
  selectedMaximumMovementDistanceIn: ranked[0].maximumMovementDistanceIn,
}, null, 2)}\n`);
