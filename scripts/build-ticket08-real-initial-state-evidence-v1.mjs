#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const defaultEvidenceRoot = path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
);
const sourceEvidenceRoot = path.resolve(
  process.env.TICKET08_SOURCE_EVIDENCE_ROOT || defaultEvidenceRoot,
);
const outputPath = path.resolve(
  process.env.TICKET08_COMPACT_EVIDENCE_PATH || path.join(
    repositoryRoot,
    "scripts/fixtures/ticket08-real-initial-state-evidence-v1.json",
  ),
);
const ticket06CompactPath = path.join(
  repositoryRoot,
  "scripts/fixtures/ticket06-short-route-evidence-v1.json",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function requireCurrentHost(artifact, label) {
  assert.equal(
    artifact.hostReceiptHash,
    warmachineHost.receipt.receiptHash,
    `${label}_host_receipt_mismatch`,
  );
}

function officialMapKeyFromState(state) {
  const sourceMemberPaths = (state?.scenario?.deploymentZones || [])
    .map((zone) => String(zone.sourceMemberPath || ""))
    .filter(Boolean);
  const mapNumbers = [...new Set(sourceMemberPaths.map((sourcePath) => {
    const match = sourcePath.match(/Map(\d+)\.png$/i);
    return match ? Number(match[1]) : 0;
  }).filter((value) => value > 0))];
  assert.equal(mapNumbers.length, 1,
    "ticket06_official_map_identity_not_unique");
  const scenarioKey = String(state?.scenario?.scenarioKey || "")
    .replaceAll("_", "-");
  assert.ok(scenarioKey, "ticket06_scenario_key_missing");
  return `${scenarioKey}-official-map-${mapNumbers[0]}`;
}

const sourcePaths = {
  ticket06: path.join(sourceEvidenceRoot,
    "ticket06-short-route-preflight-fixture-v1.json"),
  ticket07Fixture: path.join(sourceEvidenceRoot,
    "ticket07-score-forward-route-fixture-v1.json"),
  ticket07Report: path.join(sourceEvidenceRoot,
    "ticket07-score-root-to-opening-v1.json"),
  ticket07Opening: path.join(sourceEvidenceRoot,
    "ticket07-score-strict-route-opening-v1.json"),
  ticket19: path.join(sourceEvidenceRoot,
    "ticket19-real-route-history-binding-v1.json"),
};
for (const [label, filePath] of Object.entries(sourcePaths)) {
  assert.equal(fs.existsSync(filePath), true,
    `${label}_source_evidence_missing:${filePath}`);
}

const ticket06Source = readJson(sourcePaths.ticket06);
const ticket06Compact = readJson(ticket06CompactPath);
const ticket07Fixture = readJson(sourcePaths.ticket07Fixture);
const ticket07Report = readJson(sourcePaths.ticket07Report);
const ticket07Opening = readJson(sourcePaths.ticket07Opening);
const ticket19 = readJson(sourcePaths.ticket19);
for (const [label, artifact] of Object.entries({
  ticket06Source,
  ticket06Compact,
  ticket07Report,
  ticket07Opening,
  ticket19,
})) {
  requireCurrentHost(artifact, label);
}

assert.equal(ticket06Compact.schemaVersion,
  "warmachine_ticket06_short_route_evidence_v1");
const { evidenceHash: ticket06CompactHash, ...ticket06CompactCore } =
  ticket06Compact;
assert.equal(stableGraphHash(ticket06CompactCore), ticket06CompactHash,
  "ticket06_compact_evidence_hash_mismatch");
assert.equal(ticket06Compact.fullRouteStrictReplayCertified, true);
assert.equal(ticket06Compact.sourceWitnessHash, ticket06Source.witnessHash);
assert.equal(ticket06Compact.materializationHash,
  ticket06Source.materializationHash);
assert.equal(ticket06Compact.injectedOpeningStateHash,
  ticket06Source.injectedOpeningStateHash);

assert.equal(ticket07Report.fixtureHash, ticket07Fixture.fixtureHash,
  "ticket07_fixture_report_mismatch");
assert.equal(ticket07Report.legalDeploymentRouteCount, 1);
assert.equal(ticket07Report.fullRouteStrictReplayCertifiedCount, 1);
assert.equal(ticket07Report.oracleIsolationPassed, true);
assert.equal(ticket07Report.routeCandidateKeys.length, 1);
assert.equal(ticket07Report.strictOpeningStateHashes.length, 1);
assert.equal(ticket07Report.reverseEdgeCounts.length, 1);
assert.equal(ticket07Report.fullRouteStrictReplayHashes.length, 1);
assert.equal(ticket07Opening.routeKey, ticket07Report.routeCandidateKeys[0]);
assert.equal(ticket07Opening.strictOpeningStateHash,
  ticket07Report.strictOpeningStateHashes[0]);
assert.equal(ticket07Opening.strictReplayEvidenceHash,
  ticket07Report.fullRouteStrictReplayHashes[0]);
assert.equal(ticket07Opening.openingEvidenceHash,
  ticket07Report.strictRouteOpeningEvidenceHash);
assert.equal(ticket07Opening.sourceOpeningStateHash,
  ticket07Fixture.injectedOpeningStateHash);

assert.equal(ticket19.ok, true);
assert.equal(ticket19.invalidFourZeroRewrite.rejected, true);
assert.equal(ticket19.ticket06.fixtureHash, ticket06Source.witnessHash);
assert.equal(ticket19.ticket07.fixtureHash, ticket07Fixture.fixtureHash);
assert.equal(ticket19.ticket07.sourceFixtureHostReceiptHash,
  ticket07Fixture.hostReceiptHash);
assert.equal(ticket19.ticket07.currentHostFullRouteStrictReplayCertifiedCount,
  1);
assert.equal(ticket19.ticket07.closedRouteSemanticOutcomeHash,
  ticket07Report.semanticOutcomeHash);

const ticket06State = ticket06Source.witness?.state;
const ticket07Address = ticket07Opening.openingAddress;
assert.ok(ticket07Address, "ticket07_opening_address_missing");
const evidence = {
  schemaVersion: "warmachine_ticket08_real_initial_state_evidence_v1",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  ticket19: {
    reportHash: ticket19.reportHash,
    ticket06BindingHash: ticket19.ticket06.bindingHash,
    ticket07BindingHash: ticket19.ticket07.bindingHash,
  },
  ticket06: {
    sourceWitnessHash: ticket06Compact.sourceWitnessHash,
    sourceMaterializationHash: ticket06Compact.materializationHash,
    injectedOpeningStateHash: ticket06Compact.injectedOpeningStateHash,
    strictOpeningStateHash: ticket06Compact.strictOpeningStateHash,
    openingEvidenceHash: ticket06Compact.strictDeploymentEvidenceHash,
    scenarioKey: ticket06Compact.scenarioKey,
    mapKey: officialMapKeyFromState(ticket06State),
    firstPlayerSideKey: ticket06Compact.firstPlayerSideKey,
    deploymentSeedKey: ticket06Compact.deploymentSeedKey,
    physicalModelCount: ticket06Compact.physicalModelCount,
    routeKey: ticket06Compact.routeKey,
    terminalFamilyKey: ticket06Compact.terminalFamilyKey,
    terminalSourceKey: ticket06Compact.terminalSourceKey,
    routeCostKnown: true,
    reverseEdgeCount: ticket06Compact.reverseEdgeCount,
    unresolvedBranchCount: ticket06Compact.unresolvedCount,
    rejectedBranchCount: ticket06Compact.rejectedBranchCount,
    strictReplayComplete: true,
    strictReplayDisposition: "compact_full_route_replay_certified",
    strictReplayEvidenceHash: ticket06Compact.evidenceHash,
    fullRouteReplayHash: ticket06Compact.fullRouteReplayHash,
  },
  ticket07: {
    sourceFixtureHash: ticket07Fixture.fixtureHash,
    sourceFixtureHostReceiptHash: ticket07Fixture.hostReceiptHash,
    sourceReportHash: ticket07Report.reportHash,
    strictOpeningStateHash: ticket07Opening.strictOpeningStateHash,
    openingEvidenceHash: ticket07Opening.strictReplayEvidenceHash,
    scenarioKey: ticket07Address.scenarioKey,
    mapKey: ticket07Address.mapKey,
    firstPlayerSideKey: ticket07Address.firstPlayerSideKey,
    deploymentSeedKey: ticket07Address.deploymentSeedKey,
    physicalModelCount: ticket07Opening.physicalModelCount,
    routeKey: ticket07Opening.routeKey,
    terminalFamilyKey: "score",
    terminalSourceKey: ticket07Report.terminalCellKey,
    semanticOutcomeHash: ticket07Report.semanticOutcomeHash,
    reverseEdgeCount: ticket07Report.reverseEdgeCounts[0],
    unresolvedBranchCount: ticket07Report.unresolvedCount,
    rejectedBranchCount: ticket07Report.rejectedBranchCount,
    strictReplayComplete: true,
  },
  claimBoundary: "This compact fixture binds current Ticket 06/07 strict opening-to-terminal replay receipts and route labels to Ticket 19 history evidence. Neither route has complete candidate, opponent-response or Chance closure.",
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`);
fs.renameSync(temporaryPath, outputPath);
process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion: "build_ticket08_real_initial_state_evidence_v1",
  hostReceiptHash: evidence.hostReceiptHash,
  outputPath,
  compactEvidenceHash: stableGraphHash(evidence),
  ticket06RouteKey: evidence.ticket06.routeKey,
  ticket07RouteKey: evidence.ticket07.routeKey,
}, null, 2)}\n`);
