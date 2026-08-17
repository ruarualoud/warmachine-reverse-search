import assert from "node:assert/strict";

import { buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-anchor-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerScoreTerminalRepresentativeRejectEvidenceV1,
} from
  "../src/reverse/steamroller-score-terminal-representative-reject-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerTerminalRepresentativeMaterializationLedgerV1,
  completedWarmachineSteamrollerTerminalRepresentativeOutcomesV1,
} from "../src/reverse/steamroller-terminal-representative-materialization-ledger-v1.mjs";
import { selectWarmachineSteamrollerTerminalRepresentativesV1 } from
  "../src/reverse/steamroller-terminal-representative-selector-v1.mjs";

const anchorCoverage = buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1();
const representativeSelection = selectWarmachineSteamrollerTerminalRepresentativesV1({
  corpus: anchorCoverage.corpus,
  maximumSkeletonCells: 96,
  maximumRepresentativeSubcells: 50_000,
  pinnedRepresentatives: anchorCoverage.evidence.roots,
});
const rejectEvidence =
  buildWarmachineSteamrollerScoreTerminalRepresentativeRejectEvidenceV1({
    corpus: anchorCoverage.corpus,
    representativeSelection,
    anchorEvidence: anchorCoverage.evidence,
    anchorProposals: anchorCoverage.proposals,
  });

const expectedSupported = representativeSelection.selectedRepresentatives.filter((row) =>
  row.terminalClassKey === "lead_three_after_opponent_turn_scoring" &&
  row.expectedNextDisposition === "expected_strict_reject" &&
  [
    "illegal_overlap_expected_reject",
    "outside_table_expected_reject",
  ].includes(row.coordinates?.baseTopology));
const expectedScenarioKeys = [...new Set(anchorCoverage.evidence.roots.map((root) =>
  root.scenarioKey))].sort();
assert.equal(expectedScenarioKeys.length, 7);
assert.equal(expectedSupported.length, expectedScenarioKeys.length * 2);
assert.equal(rejectEvidence.plan.proposedCount, expectedSupported.length);
assert.equal(rejectEvidence.plan.unresolvedCount, 0);
assert.equal(rejectEvidence.evidence.strictRejectedCount, expectedSupported.length);
assert.equal(rejectEvidence.evidence.proposalFilteredCount, 0);
assert.equal(rejectEvidence.evidence.inputInvalidCount, 0);
assert.equal(rejectEvidence.evidence.budgetDeferredCount, 0);
assert.equal(rejectEvidence.evidence.completeWithinPlannedBatch, true);
assert.equal(new Set(rejectEvidence.evidence.roots.map((row) => row.subcellKey)).size,
  expectedSupported.length);
assert.equal(rejectEvidence.evidence.roots.every((row) =>
  row.authority === "rules_v1_host" && row.strictRulesConclusion === true &&
  row.reason === "terminal_batch_static_placement_rejected" && row.receiptHash), true);

const outsideRows = rejectEvidence.evidence.roots.filter((row) =>
  row.coordinates.baseTopology === "outside_table_expected_reject");
const overlapRows = rejectEvidence.evidence.roots.filter((row) =>
  row.coordinates.baseTopology === "illegal_overlap_expected_reject");
assert.equal(outsideRows.length, expectedScenarioKeys.length);
assert.equal(overlapRows.length, expectedScenarioKeys.length);
assert.deepEqual(Object.fromEntries([...new Set(rejectEvidence.evidence.roots.map((row) =>
  row.scenarioKey))].sort().map((scenarioKey) => [
  scenarioKey,
  rejectEvidence.evidence.roots.filter((row) => row.scenarioKey === scenarioKey).length,
])), Object.fromEntries(expectedScenarioKeys.map((scenarioKey) => [scenarioKey, 2])));
assert.equal(outsideRows.every((row) => row.staticPlacementAudit.issues.some((issue) =>
  issue.code === "PIECE_BASE_OUT_OF_BOUNDS_V1")), true);
assert.equal(overlapRows.every((row) => row.staticPlacementAudit.issues.some((issue) =>
  issue.code === "STATIC_PLACEMENT_BASE_OVERLAPS_BLOCKING_TERRAIN_V1")), true);
assert.equal(rejectEvidence.evidence.roots.every((row) =>
  row.stateVariantEvidence.searchSideRuleConclusion === false &&
  row.stateVariantEvidence.historicalReachabilityProven === false), true);

const ledger = buildWarmachineSteamrollerTerminalRepresentativeMaterializationLedgerV1({
  corpus: anchorCoverage.corpus,
  representativeSelection,
  evidenceSets: [anchorCoverage.evidence, rejectEvidence.evidence],
  maximumProposedTasks: 0,
});
assert.equal(ledger.dispositionCounts.strict_materialized,
  anchorCoverage.evidence.strictMaterializedRootCount);
assert.equal(ledger.dispositionCounts.strict_rejected, expectedSupported.length);
assert.equal(ledger.denominator.selectedMassConserved, true);
assert.equal(ledger.denominator.globalAuditMassConserved, true);
const totalExpectedReject = representativeSelection.selectedRepresentatives.filter((row) =>
  row.expectedNextDisposition === "expected_strict_reject").length;
assert.equal(ledger.remainingExpectedNextDispositionCounts.expected_strict_reject,
  totalExpectedReject - expectedSupported.length);

const resumed = buildWarmachineSteamrollerTerminalRepresentativeMaterializationLedgerV1({
  corpus: anchorCoverage.corpus,
  representativeSelection,
  priorOutcomes: completedWarmachineSteamrollerTerminalRepresentativeOutcomesV1(ledger),
  maximumProposedTasks: 0,
});
assert.equal(resumed.completedOutcomeHash, ledger.completedOutcomeHash);
assert.equal(resumed.dispositionCounts.strict_rejected, expectedSupported.length);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_steamroller_score_terminal_representative_reject_evidence_v1",
  corpusHash: anchorCoverage.corpus.corpusHash,
  selectionHash: representativeSelection.selectionHash,
  planHash: rejectEvidence.plan.planHash,
  evidenceHash: rejectEvidence.evidence.evidenceHash,
  proposedCount: rejectEvidence.plan.proposedCount,
  strictRejectedCount: rejectEvidence.evidence.strictRejectedCount,
  scenarioCounts: Object.fromEntries([...new Set(rejectEvidence.evidence.roots.map((row) =>
    row.scenarioKey))].sort().map((scenarioKey) => [
    scenarioKey,
    rejectEvidence.evidence.roots.filter((row) => row.scenarioKey === scenarioKey).length,
  ])),
  topologyCounts: {
    outside_table_expected_reject: outsideRows.length,
    illegal_overlap_expected_reject: overlapRows.length,
  },
  ledgerDispositionCounts: ledger.dispositionCounts,
  remainingExpectedNextDispositionCounts: ledger.remainingExpectedNextDispositionCounts,
}, null, 2));
