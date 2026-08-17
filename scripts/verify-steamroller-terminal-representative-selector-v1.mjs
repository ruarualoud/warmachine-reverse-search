import assert from "node:assert/strict";

import { buildWarmachineSteamrollerTerminalScenarioCorpusV1 } from
  "../src/reverse/steamroller-terminal-scenario-corpus-v1.mjs";
import { selectWarmachineSteamrollerTerminalRepresentativesV1 } from
  "../src/reverse/steamroller-terminal-representative-selector-v1.mjs";

const corpus = buildWarmachineSteamrollerTerminalScenarioCorpusV1({
  rosterReceiptHash: "verify-terminal-representative-selector-v1",
});
const fullValueCover = selectWarmachineSteamrollerTerminalRepresentativesV1({
  corpus,
  maximumSkeletonCells: 96,
  maximumRepresentativeSubcells: 50000,
});
const repeated = selectWarmachineSteamrollerTerminalRepresentativesV1({
  corpus,
  maximumSkeletonCells: 96,
  maximumRepresentativeSubcells: 50000,
});

assert.equal(fullValueCover.selectionHash, repeated.selectionHash);
assert.equal(fullValueCover.policy.eagerCartesianEnumerationUsed, false);
assert.equal(fullValueCover.policy.interactionStrength, 1);
assert.equal(fullValueCover.skeletonCoverage.completeWithinDeclaredObligations, true);
assert.equal(fullValueCover.partitionValueCoverage.completeWithinSelectedSkeletons, true);
assert.equal(fullValueCover.denominator.conserved, true);
assert.equal(fullValueCover.denominator.proposedSubcellCount,
  corpus.counts.proposedSubcellCount);
assert.ok(fullValueCover.skeletonCoverage.selectedSkeletonCellCount <= 96);
assert.ok(Number(fullValueCover.denominator.selectedRepresentativeSubcellCount) < 50000);
assert.equal(new Set(fullValueCover.selectedRepresentatives.map((row) =>
  row.subcellKey)).size, fullValueCover.selectedRepresentatives.length);
assert.deepEqual(Object.keys(fullValueCover.scenarioCounts).sort(), [
  "fault_line",
  "high_stakes",
  "payload",
  "pressure_point",
  "trench_warfare",
  "two_fronts",
  "wolves_at_our_heels",
]);
assert.deepEqual(Object.keys(fullValueCover.terminalClassCounts).sort(), [
  "fixed_round_limit_result",
  "lead_three_after_opponent_turn_scoring",
  "simultaneous_leader_tiebreak",
  "unique_leader_assassination",
]);
assert.ok(fullValueCover.representativeDispositionCounts.source_unresolved > 0);
assert.ok(fullValueCover.representativeDispositionCounts.round_equivalence_unresolved > 0);
assert.ok(fullValueCover.representativeDispositionCounts.expected_strict_reject > 0);
assert.ok(fullValueCover.representativeDispositionCounts.strict_materialization_pending > 0);
assert.equal(fullValueCover.selectedRepresentatives
  .filter((row) => row.sourceResolutionStatus !== "officially_confirmed")
  .every((row) => row.expectedNextDisposition === "source_unresolved"), true);

const bounded = selectWarmachineSteamrollerTerminalRepresentativesV1({
  corpus,
  maximumSkeletonCells: 12,
  maximumRepresentativeSubcells: 10,
});
assert.equal(bounded.skeletonCoverage.selectedSkeletonCellCount, 12);
assert.ok(bounded.skeletonCoverage.uncoveredObligationCount > 0);
assert.equal(bounded.denominator.selectedRepresentativeSubcellCount, "10");
assert.ok(bounded.partitionValueCoverage.deferredObligationCount > 0);
assert.equal(BigInt(bounded.denominator.selectedRepresentativeSubcellCount) +
  BigInt(bounded.denominator.unselectedSubcellCount),
BigInt(bounded.denominator.proposedSubcellCount));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_steamroller_terminal_representative_selector_v1",
  corpusHash: corpus.corpusHash,
  selectionHash: fullValueCover.selectionHash,
  skeletonCoverage: fullValueCover.skeletonCoverage,
  partitionValueCoverage: fullValueCover.partitionValueCoverage,
  denominator: fullValueCover.denominator,
  representativeDispositionCounts: fullValueCover.representativeDispositionCounts,
  scenarioCounts: fullValueCover.scenarioCounts,
  terminalClassCounts: fullValueCover.terminalClassCounts,
  boundedCoverage: {
    selectedSkeletonCellCount: bounded.skeletonCoverage.selectedSkeletonCellCount,
    uncoveredObligationCount: bounded.skeletonCoverage.uncoveredObligationCount,
    selectedRepresentativeSubcellCount:
      bounded.denominator.selectedRepresentativeSubcellCount,
    deferredPartitionValueObligationCount:
      bounded.partitionValueCoverage.deferredObligationCount,
  },
}, null, 2));
