#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) || path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
));

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(outputDirectory, fileName), "utf8"));
}

function ticket09RouteUnits() {
  return fs.readdirSync(outputDirectory).filter((fileName) =>
    /^ticket09-.+-(?:assassination|score)-route-unit-v1\.json$/.test(fileName))
    .sort().map((fileName) => readJson(fileName));
}

const report = readJson("report-v2.json");
const values = readJson("ticket09-route-initial-state-values-v1.json");
const baseValues = readJson("ticket08-real-initial-state-values-v1.json");
const pool = readJson("goal-conditioned-roster-pool.json");
const { generatedAt: _generatedAt, reportHash, ok: _ok, ...reportCore } = report;
assert.equal(stableGraphHash(reportCore), reportHash);
const { reportHash: valueReportHash, ...valueReportCore } = values;
assert.equal(stableGraphHash(valueReportCore), valueReportHash);
const { reportHash: baseValueReportHash, ...baseValueReportCore } = baseValues;
assert.equal(stableGraphHash(baseValueReportCore), baseValueReportHash);
assert.equal(values.baseTicket08ReportHash, baseValueReportHash);
assert.equal(stableGraphHash((values.rows || []).filter((row) =>
  String(row.initialStateKey || "").startsWith("ticket06-opening-") ||
  String(row.initialStateKey || "").startsWith("ticket07-opening-"))),
stableGraphHash(baseValues.rows || []));
for (const row of (values.rows || []).filter((entry) => entry.schemaVersion)) {
  const { valueHash, ...valueCore } = row;
  assert.equal(stableGraphHash(valueCore), valueHash);
}
const { poolSetHash, ...poolCore } = pool;
assert.equal(stableGraphHash(poolCore), poolSetHash);
assert.equal(report.source.rosterPoolSetHash, poolSetHash);
assert.equal(report.source.initialValueReportHash, values.reportHash);
assert.equal(report.counts.pendingMapOpeningTaskCount, 0);

const valueByRouteKey = new Map(values.rows.flatMap((row) =>
  (row.routeLabels || []).map((label) => [String(label.routeKey || ""), row])));
const baselineRouteKeys = [
  "terminal-deployment-route-c463d65923a86c23bb0cd8a879bd4d92",
  "terminal-deployment-route-55eb14c0a5291d49e0f2e4a8a4a50505",
];
const routeUnits = ticket09RouteUnits();
for (const unit of routeUnits) {
  const { fixtureHash, ...unitCore } = unit;
  assert.equal(stableGraphHash(unitCore), fixtureHash);
  assert.equal(unit.hostReceiptHash, report.hostReceiptHash);
}
const requiredRouteKeys = [
  ...baselineRouteKeys,
  ...routeUnits.map((unit) => unit.routeKey),
];
assert.equal(new Set(requiredRouteKeys).size, requiredRouteKeys.length);
for (const routeKey of requiredRouteKeys) {
  const route = report.routes.find((row) => row.routeKey === routeKey);
  const value = valueByRouteKey.get(routeKey);
  assert.ok(route, `missing real Ticket 09 route ${routeKey}`);
  assert.ok(value, `missing Ticket 08 value cell for ${routeKey}`);
  assert.equal(route.strictRouteExists, true);
  assert.equal(route.routeLabelMatchesValue, true);
  assert.equal(route.strictOpeningIdentityComplete, true);
  assert.equal(route.routeRosterEvidence.exactRosterEvidenceComplete, true);
  assert.equal(route.routeOpeningEvidence.strictOpeningStateHash,
    value.strictOpeningEvidence.stateHash);
  assert.equal(route.routeOpeningEvidence.strictOpeningEvidenceHash,
    value.strictOpeningEvidence.evidenceHash);
  assert.equal(route.routeRosterEvidence.subject.pointTotal, 100);
  assert.equal(route.routeRosterEvidence.challenger.pointTotal, 100);
  assert.equal(route.routeRosterEvidence.combinedModelCountMatches, true);
  if (baselineRouteKeys.includes(routeKey)) {
    assert.equal(route.routeRosterEvidence.challengerMatchesScreeningRepresentative,
      false);
    assert.equal(route.routeRosterEvidence.rosterPairInRepresentativeOpeningSet,
      false);
  }
}

assert.equal(report.counts.strictRouteCount >= requiredRouteKeys.length, true);
const strictRouteCellKeys = new Set(report.routes.filter((route) =>
  route.strictRouteExists === true).map((route) =>
  `${route.leaderName}::${route.terminalFamilyKey}`));
const expectedPendingRouteCount = Math.max(0, 8 - strictRouteCellKeys.size);
assert.equal(report.counts.pendingRouteSearchTaskCount,
  expectedPendingRouteCount);
if (process.argv.includes("--require-complete")) {
  assert.equal(strictRouteCellKeys.size, 8);
  assert.equal(report.counts.pendingRouteSearchTaskCount, 0);
  assert.equal(report.completion.reportComplete, true);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  reportHash,
  rosterPoolSetHash: poolSetHash,
  strictRouteCount: report.counts.strictRouteCount,
  verifiedRouteKeys: requiredRouteKeys,
  pendingRouteSearchTaskCount: report.counts.pendingRouteSearchTaskCount,
  completeRequired: process.argv.includes("--require-complete"),
  claimBoundary: "Every retained route is bound to an exact current finite-pool roster pair and separately addressed current-Host opening value cell. Discovered cooperative routes prove reachability only; they do not prove candidate, response, Chance or natural-win-rate closure.",
}, null, 2)}\n`);
