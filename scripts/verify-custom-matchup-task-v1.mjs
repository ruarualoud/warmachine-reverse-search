#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSepsiraSixSwarmVsFaneTaskV1,
  normalizeWarmachineCustomMatchupTaskV1,
} from "../src/matchup/custom-matchup-task-v1.mjs";
import {
  buildWarmachineInitialStateDomainV1,
  pageWarmachineInitialStateDomainV1,
} from "../src/matchup/initial-state-domain-v1.mjs";
import {
  solveWarmachineInitialStateValuesV1,
} from "../src/matchup/initial-state-value-v1.mjs";
import {
  compileWarmachineTaskRosterUniverseV1,
} from "../src/matchup/task-roster-universe-v1.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const task = buildSepsiraSixSwarmVsFaneTaskV1();
assert.equal(task.validation.ok, true);
assert.equal(task.format.pointLimit, 100);
assert.equal(task.sides.subject.requiredCards.find((row) =>
  row.cardName === "Mechanithrall Swarm")?.minimumCount, 6);
assert.equal(task.stateDomain.mapProfiles.length, 3);
assert.equal(task.validation.naturalWinRateAggregationAllowed, false);

const poolPath = path.join(
  repositoryRoot,
  "build/warmachine-ai/sepsira-swarm-vs-fane-v20260805/strict-construction-pool-v1/report.json",
);
const poolBytes = await readFile(poolPath);
const poolReport = JSON.parse(poolBytes.toString("utf8"));
const commonPoolEvidence = {
  sourceContentHash: createHash("sha256").update(poolBytes).digest("hex"),
  sourceSchemaVersion: poolReport.schemaVersion,
  exactListLegality: poolReport.quality.exactListLegality === true,
  forceBuilderContract: "WarmachineForceBuilder exact legality from bound construction report",
  remoteVersion: poolReport.source.remoteVersion,
  exhaustiveAllFactionRosters: poolReport.algorithm.exhaustiveAllLists === true,
};
const rosterUniverse = compileWarmachineTaskRosterUniverseV1({
  task,
  poolsByKey: {
    "sepsira-six-swarms-current-finite-pool": {
      ...commonPoolEvidence,
      poolKey: "sepsira-six-swarms-current-finite-pool",
      lists: poolReport.cryxLists,
    },
    "fane-of-nyrro-current-finite-pool": {
      ...commonPoolEvidence,
      poolKey: "fane-of-nyrro-current-finite-pool",
      lists: poolReport.faneLists,
    },
  },
});
assert.equal(rosterUniverse.sides.subject.rosters.length, 96);
assert.equal(rosterUniverse.sides.challenger.rosters.length, 96);
assert.equal(rosterUniverse.rosterPairCount, "9216");
assert.equal(rosterUniverse.sides.subject.taskConstraintRejectedCount, 0);
assert.equal(rosterUniverse.sides.challenger.leaderCoverage.length, 4);
assert.equal(rosterUniverse.exactListLegality, true);
assert.equal(rosterUniverse.exhaustiveAllLegalRosters, false);

const invalidWeighted = normalizeWarmachineCustomMatchupTaskV1({
  ...task,
  aggregation: { mode: "weighted_distribution" },
});
assert.equal(invalidWeighted.validation.ok, false);
assert.ok(invalidWeighted.validation.issues.includes("weighted_map_distribution_incomplete"));

const domain = buildWarmachineInitialStateDomainV1({
  task,
  subjectRosters: rosterUniverse.sides.subject.rosters,
  challengerRosters: rosterUniverse.sides.challenger.rosters,
});
assert.equal(domain.cellCount, String(96 * 96 * 7 * 3 * 2 * 3));
const page = pageWarmachineInitialStateDomainV1(domain, { offset: 100, limit: 3 });
assert.equal(page.returnedCount, 3);
assert.equal(page.cells[0].cellIndex, "100");
assert.notEqual(page.cells[0].initialStateKey, page.cells[1].initialStateKey);
assert.equal(page.cells.every((cell) => cell.materializationStatus === "proposal_only"), true);

const values = solveWarmachineInitialStateValuesV1({
  subjectTaskSideKey: "challenger",
  initialStates: [
    { initialStateKey: "opening-a", rootNodeId: "our-choice" },
    { initialStateKey: "opening-b", rootNodeId: "partial-chance", policyEstimate: 0.63, policyEstimateLabel: "bounded_policy_v1" },
  ],
  nodes: [
    { nodeId: "our-choice", nodeKind: "choice", controllerTaskSideKey: "challenger" },
    { nodeId: "opponent-choice", nodeKind: "choice", controllerTaskSideKey: "subject" },
    { nodeId: "partial-chance", nodeKind: "chance" },
    { nodeId: "win", nodeKind: "terminal", winnerTaskSideKey: "challenger" },
    { nodeId: "loss", nodeKind: "terminal", winnerTaskSideKey: "subject" },
    { nodeId: "unknown", nodeKind: "unresolved" },
  ],
  edges: [
    { edgeId: "a", fromNodeId: "our-choice", toNodeId: "opponent-choice" },
    { edgeId: "b", fromNodeId: "our-choice", toNodeId: "partial-chance" },
    { edgeId: "c", fromNodeId: "opponent-choice", toNodeId: "win" },
    { edgeId: "d", fromNodeId: "opponent-choice", toNodeId: "loss" },
    { edgeId: "e", fromNodeId: "partial-chance", toNodeId: "win", probabilityNumerator: 3, probabilityDenominator: 5 },
    { edgeId: "f", fromNodeId: "partial-chance", toNodeId: "unknown", probabilityNumerator: 1, probabilityDenominator: 5 },
  ],
});
const openingA = values.rows.find((row) => row.initialStateKey === "opening-a");
const openingB = values.rows.find((row) => row.initialStateKey === "opening-b");
assert.equal(openingA.lowerBound, 0.6);
assert.equal(openingA.upperBound, 1);
assert.equal(openingB.lowerBound, 0.6);
assert.equal(openingB.upperBound, 1);
assert.equal(openingB.policyEstimate, 0.63);
assert.equal(openingB.policyEstimateIsNaturalWinRate, false);

process.stdout.write(`${JSON.stringify({
  ok: true,
  taskHash: task.taskHash,
  rosterUniverseHash: rosterUniverse.universeHash,
  domainCellCount: domain.cellCount,
  valueSetHash: values.valueSetHash,
}, null, 2)}\n`);
