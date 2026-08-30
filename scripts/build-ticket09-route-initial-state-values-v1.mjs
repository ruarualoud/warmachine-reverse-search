#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import { evaluateWarmachineInitialStateAdversarialValuesV2 } from
  "../src/matchup/initial-state-adversarial-value-v2.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const evidenceRoot = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) || path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
));
const baseValuePath = path.join(
  evidenceRoot,
  "ticket08-real-initial-state-values-v1.json",
);
const outputPath = path.join(
  evidenceRoot,
  "ticket09-route-initial-state-values-v1.json",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function routeUnitFiles() {
  return fs.readdirSync(evidenceRoot).filter((fileName) =>
    /^ticket09-.+-(?:assassination|score)-route-unit-v1\.json$/.test(fileName))
    .sort();
}

function unresolvedResponse(unit) {
  return {
    responseKey: `${unit.routeId}-known-route-only`,
    chanceLedger: {
      successNumerator: 0,
      failureNumerator: 0,
      prunedNumerator: 0,
      unresolvedNumerator: 1,
      denominator: 1,
    },
    strictReplayComplete: unit.strictRoute.strictReplayComplete === true,
    assumptionClosureComplete:
      unit.strictRoute.assumptionClosureComplete === true,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    evidence: {
      routeUnitFixtureHash: unit.fixtureHash,
      historyBindingHash: unit.strictRoute.historyBindingHash,
      replayHash: unit.strictRoute.fullRouteReplayHash ||
        unit.strictRoute.witnessHash || "",
      claimBoundary: unit.claimBoundary,
    },
  };
}

const base = readJson(baseValuePath);
assert.equal(base.hostReceiptHash, warmachineHost.receipt.receiptHash);
const { reportHash: baseReportHash, ...baseCore } = base;
assert.equal(stableGraphHash(baseCore), baseReportHash);

const units = routeUnitFiles().map((fileName) => {
  const unit = readJson(path.join(evidenceRoot, fileName));
  const { fixtureHash, ...unitCore } = unit;
  assert.equal(stableGraphHash(unitCore), fixtureHash);
  assert.equal(unit.hostReceiptHash, warmachineHost.receipt.receiptHash);
  assert.equal(unit.strictRoute.strictOpeningComplete, true);
  assert.equal(unit.strictRoute.strictReplayComplete, true);
  assert.equal(unit.strictRoute.assumptionClosureComplete, true);
  assert.ok(unit.strictOpeningStateHash);
  assert.ok(unit.strictOpeningEvidenceHash);
  return { fileName, unit };
});
assert.equal(new Set(units.map(({ unit }) => unit.routeKey)).size, units.length);

const routeValues = units.length ? evaluateWarmachineInitialStateAdversarialValuesV2({
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  subjectTaskSideKey: "challenger",
  initialStates: units.map(({ unit }) => ({
    initialStateKey: `ticket09-opening-${stableGraphHash({
      routeId: unit.routeId,
      strictOpeningStateHash: unit.strictOpeningStateHash,
      strictOpeningEvidenceHash: unit.strictOpeningEvidenceHash,
    }, 32)}`,
    strictOpeningEvidence: {
      certified: true,
      stateHash: unit.strictOpeningStateHash,
      evidenceHash: unit.strictOpeningEvidenceHash,
      hostReceiptHash: warmachineHost.receipt.receiptHash,
    },
    candidateSetComplete: false,
    policyCandidates: [{
      candidateKey: unit.routeKey,
      responseSetComplete: false,
      opponentResponses: [unresolvedResponse(unit)],
    }],
    address: unit.openingAddress,
    routeLabels: [{
      routeKey: unit.routeKey,
      terminalFamilyKey: unit.terminalFamilyKey,
      terminalSourceKey: unit.terminalSourceKey,
      routeCostKnown: false,
      reverseEdgeCount: unit.strictRoute.reverseEdgeCount ?? null,
      unresolvedBranchCount: unit.strictRoute.unresolvedBranchCount,
      rejectedBranchCount: unit.strictRoute.rejectedBranchCount,
      routeUnitFixtureHash: unit.fixtureHash,
    }],
  })),
}) : null;

const rows = [
  ...(base.rows || []),
  ...(routeValues?.rows || []),
].sort((left, right) => left.initialStateKey.localeCompare(right.initialStateKey));
assert.equal(new Set(rows.map((row) => row.initialStateKey)).size, rows.length);
assert.equal(rows.every((row) =>
  row.strictGameValueInterval.lower.numerator === "0" &&
  row.strictGameValueInterval.upper.numerator === "1" &&
  row.strictGameValueInterval.upper.denominator === "1"), true);

const valueSetCore = stableGraphValue({
  schemaVersion: "warmachine_ticket09_route_initial_state_value_set_v1",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  baseTicket08ReportHash: base.reportHash,
  baseTicket08ValueSetHash: base.valueSetHash,
  routeValueSetHash: routeValues?.valueSetHash || "",
  routeUnitFixtureHashes: units.map(({ unit }) => unit.fixtureHash),
  rowValueHashes: rows.map((row) => row.valueHash),
});
const valueSetHash = stableGraphHash(valueSetCore);
const reportCore = stableGraphValue({
  ok: true,
  schemaVersion: "verify_ticket09_route_initial_state_values_v1",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  baseTicket08ReportHash: base.reportHash,
  valueSetHash,
  initialStateCount: rows.length,
  baseInitialStateCount: base.rows.length,
  routeUnitInitialStateCount: routeValues?.rows.length || 0,
  exactInitialStateCount: rows.filter((row) =>
    row.strictGameValueInterval.exact === true).length,
  boundedInitialStateCount: rows.filter((row) =>
    row.strictGameValueInterval.exact !== true).length,
  rows,
  aggregation: {
    allowed: false,
    reason: "initial_state_distribution_not_declared",
    declaredDistributionValueInterval: null,
    naturalWinRate: null,
    naturalWinRateClaimed: false,
  },
  naturalWinRateClaimed: false,
  globalOptimalityProven: false,
  claimBoundary: "Each discovered Ticket 09 route receives a separately addressed [0,1] adversarial value interval. A strict route proves reachability for one exact opening only; missing candidates, opponent responses and Chance mass prohibit aggregation or win-rate claims.",
});
const report = { ...reportCore, reportHash: stableGraphHash(reportCore) };
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(report)}\n`);
fs.renameSync(temporaryPath, outputPath);

process.stdout.write(`${JSON.stringify({
  ok: true,
  reportHash: report.reportHash,
  valueSetHash,
  initialStateCount: report.initialStateCount,
  routeUnitInitialStateCount: report.routeUnitInitialStateCount,
  routeIds: units.map(({ unit }) => unit.routeId),
  outputPath,
}, null, 2)}\n`);
