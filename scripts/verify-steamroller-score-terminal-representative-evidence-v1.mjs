import assert from "node:assert/strict";

import { buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-anchor-evidence-v1.mjs";
import { materializeWarmachineSteamrollerScoreTerminalBatchV1 } from
  "../src/reverse/steamroller-score-terminal-materialization-batch-v1.mjs";
import { buildWarmachineSteamrollerScoreTerminalRepresentativeEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-representative-evidence-v1.mjs";
import { buildWarmachineSteamrollerTerminalRepresentativeMaterializationLedgerV1 } from
  "../src/reverse/steamroller-terminal-representative-materialization-ledger-v1.mjs";
import { selectWarmachineSteamrollerTerminalRepresentativesV1 } from
  "../src/reverse/steamroller-terminal-representative-selector-v1.mjs";

const anchorCoverage = buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1();
const corpus = anchorCoverage.corpus;
const selection = selectWarmachineSteamrollerTerminalRepresentativesV1({
  corpus,
  maximumSkeletonCells: 96,
  maximumRepresentativeSubcells: 50000,
  pinnedRepresentatives: anchorCoverage.evidence.roots,
});
const representativeCoverage =
  buildWarmachineSteamrollerScoreTerminalRepresentativeEvidenceV1({
    corpus,
    representativeSelection: selection,
    anchorEvidence: anchorCoverage,
    anchorProposals: anchorCoverage.proposals,
  });

assert.equal(representativeCoverage.plan.proposedCount,
  anchorCoverage.evidence.strictMaterializedRootCount);
assert.equal(representativeCoverage.evidence.strictMaterializedCount,
  representativeCoverage.plan.proposedCount);
assert.equal(representativeCoverage.evidence.strictRejectedProposalCount, 0);
assert.equal(representativeCoverage.evidence.budgetDeferredProposalCount, 0);
assert.equal(representativeCoverage.evidence.completeWithinPlannedBatch, true);
assert.equal(new Set(representativeCoverage.evidence.roots.map((row) =>
  row.subcellKey)).size, representativeCoverage.evidence.strictMaterializedCount);
assert.deepEqual(
  representativeCoverage.evidence.roots.map((row) => row.subcellKey).sort(),
  anchorCoverage.evidence.roots.map((row) => row.subcellKey).sort(),
);
assert.deepEqual([...new Set(representativeCoverage.evidence.roots.map((row) =>
  row.scenarioKey))].sort(), [
  "fault_line",
  "high_stakes",
  "payload",
  "pressure_point",
  "trench_warfare",
  "two_fronts",
  "wolves_at_our_heels",
]);
assert.equal(representativeCoverage.evidence.roots.every((row) =>
  row.strictReplayCertified && row.receiptHash && row.replayReceiptHash), true);

const cellsByKey = new Map(corpus.cells.map((cell) => [cell.cellKey, cell]));
const materializedCells = representativeCoverage.evidence.roots.map((row) =>
  cellsByKey.get(row.cellKey));
assert.deepEqual([...new Set(materializedCells.map((cell) => cell.winnerSideKey))], [
  "player1",
]);
assert.deepEqual([...new Set(materializedCells.map((cell) =>
  cell.roundClass.representativeRoundNumber))], [3]);
assert.ok(representativeCoverage.plan.unresolvedReasonCounts
  .score_terminal_representative_nonbaseline_partition_pending > 0);
assert.ok(representativeCoverage.plan.unresolvedReasonCounts
  .score_terminal_representative_round_equivalence_unresolved > 0);
assert.ok(representativeCoverage.plan.unresolvedReasonCounts
  .score_terminal_representative_scoring_geometry_pending > 0);

const exactMismatch = structuredClone(representativeCoverage.plan.proposals[0]);
const sourceScenario = corpus.scenarios.find((row) =>
  row.scenarioKey === exactMismatch.hostScenarioKey);
const expectedTransition = sourceScenario.scoreTransitionDomain.transitions.find((row) =>
  row.scoreTransitionKey === exactMismatch.partitionCoordinates.scoreTransition);
const wrongTransition = sourceScenario.scoreTransitionDomain.transitions.find((row) =>
  row.leadBefore === expectedTransition.leadBefore &&
  row.scoringGainClass.netGain === expectedTransition.scoringGainClass.netGain &&
  row.scoreTransitionKey !== expectedTransition.scoreTransitionKey);
assert.ok(wrongTransition);
exactMismatch.partitionCoordinates.scoreTransition = wrongTransition.scoreTransitionKey;
const mismatchBatch = materializeWarmachineSteamrollerScoreTerminalBatchV1({
  corpus,
  proposals: [exactMismatch],
});
assert.equal(mismatchBatch.strictMaterializedRootCount, 0);
assert.equal(mismatchBatch.strictRejectedRootCount, 0);
assert.equal(mismatchBatch.proposalFilteredRootCount, 1);
assert.equal(mismatchBatch.results[0].disposition, "proposal_filtered");
assert.equal(mismatchBatch.results[0].reason, "terminal_batch_score_transition_not_in_corpus");

const ledger = buildWarmachineSteamrollerTerminalRepresentativeMaterializationLedgerV1({
  corpus,
  representativeSelection: selection,
  evidenceSets: [representativeCoverage.evidence],
  maximumProposedTasks: 0,
});
assert.equal(ledger.dispositionCounts.strict_materialized,
  representativeCoverage.evidence.strictMaterializedCount);
assert.equal(ledger.denominator.selectedMassConserved, true);
assert.equal(ledger.denominator.globalAuditMassConserved, true);
assert.equal(ledger.tasks.filter((row) => row.disposition === "strict_materialized")
  .every((row) => row.strictReplayCertified), true);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_steamroller_score_terminal_representative_evidence_v1",
  corpusHash: corpus.corpusHash,
  selectionHash: selection.selectionHash,
  planHash: representativeCoverage.plan.planHash,
  evidenceHash: representativeCoverage.evidence.evidenceHash,
  proposedCount: representativeCoverage.plan.proposedCount,
  strictMaterializedCount: representativeCoverage.evidence.strictMaterializedCount,
  strictRejectedProposalCount:
    representativeCoverage.evidence.strictRejectedProposalCount,
  unresolvedCount: representativeCoverage.plan.unresolvedCount,
  unresolvedReasonCounts: representativeCoverage.plan.unresolvedReasonCounts,
  materializedScenarioCounts: Object.fromEntries([
    ...new Set(representativeCoverage.evidence.roots.map((row) => row.scenarioKey)),
  ].sort().map((scenarioKey) => [scenarioKey, representativeCoverage.evidence.roots
    .filter((row) => row.scenarioKey === scenarioKey).length])),
  ledgerDispositionCounts: ledger.dispositionCounts,
  mismatchDisposition: mismatchBatch.results[0].disposition,
}, null, 2));
