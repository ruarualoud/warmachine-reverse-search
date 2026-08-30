#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import {
  evaluateWarmachineInitialStateAdversarialValuesV2,
} from "../src/matchup/initial-state-adversarial-value-v2.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const evidenceRoot = path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
);
const sourceEvidenceRoot = path.resolve(
  process.env.TICKET08_SOURCE_EVIDENCE_ROOT || evidenceRoot,
);
const fixturePath = path.join(
  repositoryRoot,
  "scripts/fixtures/ticket08-real-initial-state-evidence-v1.json",
);
const ticket06CompactPath = path.join(
  repositoryRoot,
  "scripts/fixtures/ticket06-short-route-evidence-v1.json",
);
const reportPath = path.join(
  evidenceRoot,
  "ticket08-real-initial-state-values-v1.json",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function unresolvedRouteResponse({
  responseKey,
  strictReplayComplete,
  assumptionClosureComplete,
  evidence,
}) {
  return {
    responseKey,
    chanceLedger: {
      successNumerator: 0,
      failureNumerator: 0,
      prunedNumerator: 0,
      unresolvedNumerator: 1,
      denominator: 1,
    },
    strictReplayComplete,
    assumptionClosureComplete,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    evidence,
  };
}

const evidence = readJson(fixturePath);
const ticket06Compact = readJson(ticket06CompactPath);
assert.equal(evidence.schemaVersion,
  "warmachine_ticket08_real_initial_state_evidence_v1");
assert.equal(evidence.hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(ticket06Compact.schemaVersion,
  "warmachine_ticket06_short_route_evidence_v1");
assert.equal(ticket06Compact.hostReceiptHash, evidence.hostReceiptHash);
const { evidenceHash: ticket06CompactHash, ...ticket06CompactCore } =
  ticket06Compact;
assert.equal(stableGraphHash(ticket06CompactCore), ticket06CompactHash);
assert.equal(ticket06CompactHash, evidence.ticket06.strictReplayEvidenceHash);
assert.equal(ticket06Compact.fullRouteStrictReplayCertified, true);
assert.equal(ticket06Compact.strictOpeningStateHash,
  evidence.ticket06.strictOpeningStateHash);
assert.equal(ticket06Compact.strictDeploymentEvidenceHash,
  evidence.ticket06.openingEvidenceHash);

const sourcePaths = {
  ticket06: path.join(sourceEvidenceRoot,
    "ticket06-short-route-preflight-fixture-v1.json"),
  ticket07Fixture: path.join(sourceEvidenceRoot,
    "ticket07-score-forward-route-fixture-v1.json"),
  ticket07Report: path.join(sourceEvidenceRoot,
    "ticket07-score-root-to-opening-v1.json"),
  ticket19: path.join(sourceEvidenceRoot,
    "ticket19-real-route-history-binding-v1.json"),
};
const sourcePresence = Object.values(sourcePaths).map((filePath) =>
  fs.existsSync(filePath));
if (sourcePresence.some(Boolean) && !sourcePresence.every(Boolean)) {
  throw new Error("ticket08_local_source_evidence_set_partial");
}
const sourceParityChecked = sourcePresence.every(Boolean);
if (sourceParityChecked) {
  const ticket06Source = readJson(sourcePaths.ticket06);
  const ticket07FixtureSource = readJson(sourcePaths.ticket07Fixture);
  const ticket07ReportSource = readJson(sourcePaths.ticket07Report);
  const ticket19Source = readJson(sourcePaths.ticket19);
  for (const artifact of [ticket06Source, ticket07ReportSource,
    ticket19Source]) {
    assert.equal(artifact.hostReceiptHash, evidence.hostReceiptHash);
  }
  assert.equal(ticket19Source.ok, true);
  assert.equal(ticket19Source.invalidFourZeroRewrite.rejected, true);
  assert.equal(ticket19Source.reportHash, evidence.ticket19.reportHash);
  assert.equal(ticket19Source.ticket06.bindingHash,
    evidence.ticket19.ticket06BindingHash);
  assert.equal(ticket19Source.ticket07.bindingHash,
    evidence.ticket19.ticket07BindingHash);
  assert.equal(ticket06Source.witnessHash, evidence.ticket06.sourceWitnessHash);
  assert.equal(ticket06Source.injectedOpeningStateHash,
    evidence.ticket06.injectedOpeningStateHash);
  assert.equal(ticket06Source.materializationHash,
    evidence.ticket06.sourceMaterializationHash);
  assert.equal(ticket06Compact.sourceWitnessHash, ticket06Source.witnessHash);
  assert.equal(ticket06Compact.materializationHash,
    ticket06Source.materializationHash);
  assert.equal(ticket07ReportSource.fixtureHash, ticket07FixtureSource.fixtureHash);
  assert.equal(ticket07FixtureSource.fixtureHash,
    evidence.ticket07.sourceFixtureHash);
  assert.equal(ticket07FixtureSource.hostReceiptHash,
    evidence.ticket07.sourceFixtureHostReceiptHash);
  assert.equal(ticket19Source.ticket07.sourceFixtureHostReceiptHash,
    evidence.ticket07.sourceFixtureHostReceiptHash);
  assert.equal(
    ticket19Source.ticket07.currentHostFullRouteStrictReplayCertifiedCount,
    1,
  );
  assert.equal(ticket07ReportSource.reportHash, evidence.ticket07.sourceReportHash);
  assert.equal(ticket07ReportSource.legalDeploymentRouteCount, 1);
  assert.equal(ticket07ReportSource.fullRouteStrictReplayCertifiedCount, 1);
  assert.equal(ticket07ReportSource.oracleIsolationPassed, true);
  assert.equal(ticket07ReportSource.fullRouteStrictReplayHashes[0],
    evidence.ticket07.openingEvidenceHash);
  assert.equal(ticket07ReportSource.semanticOutcomeHash,
    evidence.ticket07.semanticOutcomeHash);
}

const ticket06 = evidence.ticket06;
const ticket07 = evidence.ticket07;

const values = evaluateWarmachineInitialStateAdversarialValuesV2({
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  subjectTaskSideKey: "challenger",
  initialStates: [
    {
      initialStateKey: `ticket06-opening-${ticket06.strictOpeningStateHash}`,
      strictOpeningEvidence: {
        certified: true,
        stateHash: ticket06.strictOpeningStateHash,
        evidenceHash: ticket06.openingEvidenceHash,
        hostReceiptHash: warmachineHost.receipt.receiptHash,
      },
      candidateSetComplete: false,
      policyCandidates: [{
        candidateKey: ticket06.routeKey,
        responseSetComplete: false,
        opponentResponses: [unresolvedRouteResponse({
          responseKey: "ticket06-known-route-only",
          strictReplayComplete: ticket06.strictReplayComplete,
          assumptionClosureComplete: Boolean(evidence.ticket19.ticket06BindingHash),
          evidence: {
            witnessHash: ticket06.sourceWitnessHash,
            strictReplayEvidenceHash: ticket06.strictReplayEvidenceHash,
            fullRouteReplayHash: ticket06.fullRouteReplayHash,
            historyBindingHash: evidence.ticket19.ticket06BindingHash,
            reason: ticket06.strictReplayDisposition,
          },
        })],
      }],
      address: {
        subjectFactionKey: "Cryx",
        challengerFactionKey: "Fane of Nyrro",
        scenarioKey: ticket06.scenarioKey,
        mapKey: ticket06.mapKey,
        firstPlayerSideKey: ticket06.firstPlayerSideKey,
        deploymentSeedKey: ticket06.deploymentSeedKey,
        physicalModelCount: ticket06.physicalModelCount,
      },
      routeLabels: [{
        routeKey: ticket06.routeKey,
        terminalFamilyKey: ticket06.terminalFamilyKey,
        terminalSourceKey: ticket06.terminalSourceKey,
        routeCostKnown: true,
        reverseEdgeCount: ticket06.reverseEdgeCount,
        unresolvedBranchCount: ticket06.unresolvedBranchCount,
        rejectedBranchCount: ticket06.rejectedBranchCount,
        witnessHash: ticket06.sourceWitnessHash,
      }],
    },
    {
      initialStateKey: `ticket07-opening-${ticket07.strictOpeningStateHash}`,
      strictOpeningEvidence: {
        certified: true,
        stateHash: ticket07.strictOpeningStateHash,
        evidenceHash: ticket07.openingEvidenceHash,
        hostReceiptHash: warmachineHost.receipt.receiptHash,
      },
      candidateSetComplete: false,
      policyCandidates: [{
        candidateKey: ticket07.routeKey,
        responseSetComplete: false,
        opponentResponses: [unresolvedRouteResponse({
          responseKey: "ticket07-known-score-route-only",
          strictReplayComplete: ticket07.strictReplayComplete,
          assumptionClosureComplete: Boolean(evidence.ticket19.ticket07BindingHash),
          evidence: {
            strictReplayHash: ticket07.openingEvidenceHash,
            semanticOutcomeHash: ticket07.semanticOutcomeHash,
            historyBindingHash: evidence.ticket19.ticket07BindingHash,
          },
        })],
      }],
      address: {
        subjectFactionKey: "Cryx",
        challengerFactionKey: "Fane of Nyrro",
        scenarioKey: ticket07.scenarioKey,
        mapKey: ticket07.mapKey,
        firstPlayerSideKey: ticket07.firstPlayerSideKey,
        deploymentSeedKey: ticket07.deploymentSeedKey,
        physicalModelCount: ticket07.physicalModelCount,
      },
      routeLabels: [{
        routeKey: ticket07.routeKey,
        terminalFamilyKey: ticket07.terminalFamilyKey,
        terminalSourceKey: ticket07.terminalSourceKey,
        routeCostKnown: true,
        reverseEdgeCount: ticket07.reverseEdgeCount,
        unresolvedBranchCount: ticket07.unresolvedBranchCount,
        rejectedBranchCount: ticket07.rejectedBranchCount,
      }],
    },
  ],
});

assert.equal(values.initialStateCount, 2);
assert.equal(values.exactInitialStateCount, 0);
assert.equal(values.boundedInitialStateCount, 2);
assert.equal(values.rows.every((row) =>
  row.strictGameValueInterval.lower.numerator === "0" &&
  row.strictGameValueInterval.upper.numerator === "1" &&
  row.strictGameValueInterval.upper.denominator === "1"), true);
assert.equal(values.rows.every((row) =>
  row.closure.candidateSetComplete === false &&
  row.closure.probabilityClosureComplete === false &&
  row.closure.opponentResponseClosureComplete === false), true);
assert.equal(values.rows.find((row) => row.initialStateKey.startsWith("ticket06"))
  .closure.strictReplayComplete, true);
assert.equal(values.rows.find((row) => row.initialStateKey.startsWith("ticket07"))
  .closure.strictReplayComplete, true);
assert.equal(values.aggregation.allowed, false);
assert.equal(values.naturalWinRateClaimed, false);

const reportCore = {
  ok: true,
  schemaVersion: "verify_ticket08_real_initial_state_values_v1",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  compactEvidenceHash: stableGraphHash(evidence),
  sourceParityChecked,
  ticket19ReportHash: evidence.ticket19.reportHash,
  valueSetHash: values.valueSetHash,
  initialStateCount: values.initialStateCount,
  exactInitialStateCount: values.exactInitialStateCount,
  boundedInitialStateCount: values.boundedInitialStateCount,
  rows: values.rows.map((row) => ({
    initialStateKey: row.initialStateKey,
    evaluationKey: row.evaluationKey,
    address: row.address,
    routeLabels: row.routeLabels,
    strictOpeningEvidence: row.strictOpeningEvidence,
    strictGameValueInterval: row.strictGameValueInterval,
    closure: row.closure,
    missingClosureKeys: row.missingClosureKeys,
    valueHash: row.valueHash,
  })),
  aggregation: values.aggregation,
  claimBoundary: "Ticket 06/07 are now addressable initial-state evidence cells, but their natural game values remain [0,1] because candidate, opponent and full Chance closure are not complete. The known strict routes are existence evidence, not win-rate samples.",
};
const report = { ...reportCore, reportHash: stableGraphHash(reportCore) };
fs.mkdirSync(evidenceRoot, { recursive: true });
const temporaryPath = `${reportPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`);
fs.renameSync(temporaryPath, reportPath);
console.log(JSON.stringify(report, null, 2));
