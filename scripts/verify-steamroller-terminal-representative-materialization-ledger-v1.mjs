import assert from "node:assert/strict";

import { buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-assassination-terminal-anchor-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerAssassinationTerminalRepresentativeRejectEvidenceV1,
} from
  "../src/reverse/steamroller-assassination-terminal-representative-reject-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerSimultaneousLeaderTerminalAnchorEvidenceV1,
} from
  "../src/reverse/steamroller-simultaneous-leader-terminal-anchor-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerStrygonSpraySimultaneousLeaderTerminalEvidenceV1,
} from
  "../src/reverse/steamroller-strygon-spray-simultaneous-leader-terminal-evidence-v1.mjs";
import { buildWarmachineSteamrollerFixedRoundTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-fixed-round-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerTerminalMutableStateEvidenceV1 } from
  "../src/reverse/steamroller-terminal-mutable-state-evidence-v1.mjs";
import { buildWarmachineSteamrollerTerminalLosRelationEvidenceV1 } from
  "../src/reverse/steamroller-terminal-los-relation-evidence-v1.mjs";
import { buildWarmachineSteamrollerScenarioTerrainSelectionEvidenceV1 } from
  "../src/reverse/steamroller-scenario-terrain-selection-evidence-v1.mjs";
import { buildWarmachineSteamrollerScenarioControlRelationEvidenceV1 } from
  "../src/reverse/steamroller-scenario-control-relation-evidence-v1.mjs";
import { buildWarmachineSteamrollerChanneledExcarnateTerminalEvidenceV1 } from
  "../src/reverse/steamroller-channeled-excarnate-terminal-evidence-v1.mjs";
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
const assassinationAnchorCoverage =
  buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
    corpus: anchorCoverage.corpus,
  });
const assassinationMovementCoverage =
  buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
    corpus: anchorCoverage.corpus,
    rosterWitness: assassinationAnchorCoverage.proposal.runtimeWitness,
    actionRange: "outside_direct_action_range_requires_prior_movement",
  });
const assassinationActionBoundaryCoverage =
  buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
    corpus: anchorCoverage.corpus,
    rosterWitness: assassinationAnchorCoverage.proposal.runtimeWitness,
    actionRange: "on_boundary",
  });
const assassinationControlBoundaryCoverage =
  buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
    corpus: anchorCoverage.corpus,
    rosterWitness: assassinationAnchorCoverage.proposal.runtimeWitness,
    leaderControl: "on_boundary",
  });
const assassinationOutsideControlCoverage =
  buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
    corpus: anchorCoverage.corpus,
    rosterWitness: assassinationAnchorCoverage.proposal.runtimeWitness,
    leaderControl: "outside_or_not_required",
  });
const simultaneousLeaderCoverage =
  buildWarmachineSteamrollerSimultaneousLeaderTerminalAnchorEvidenceV1({
    corpus: anchorCoverage.corpus,
    rosterWitness: assassinationAnchorCoverage.proposal.runtimeWitness,
    scenarioProposal: anchorCoverage.proposals.find((proposal) =>
      proposal.hostScenarioKey === "high_stakes"),
  });
const simultaneousLeaderPresenceCoverage =
  buildWarmachineSteamrollerSimultaneousLeaderTerminalAnchorEvidenceV1({
    corpus: anchorCoverage.corpus,
    rosterWitness: assassinationAnchorCoverage.proposal.runtimeWitness,
    scenarioProposal: anchorCoverage.proposals.find((proposal) =>
      proposal.hostScenarioKey === "high_stakes"),
    tiebreakClassKey: "victory_points_tied_scenario_presence_advantage",
  });
const strygonSprayCoverage =
  buildWarmachineSteamrollerStrygonSpraySimultaneousLeaderTerminalEvidenceV1({
    corpus: anchorCoverage.corpus,
    rosterWitness: assassinationAnchorCoverage.proposal.runtimeWitness,
    scenarioProposal: anchorCoverage.proposals.find((proposal) =>
      proposal.hostScenarioKey === "high_stakes"),
  });
const losRelationCoverage = buildWarmachineSteamrollerTerminalLosRelationEvidenceV1({
  corpus: anchorCoverage.corpus,
  rosterWitness: assassinationAnchorCoverage.proposal.runtimeWitness,
  baselineState: strygonSprayCoverage.runtime.authoredState,
});
const fixedRoundCoverage = buildWarmachineSteamrollerFixedRoundTerminalAnchorEvidenceV1({
  corpus: anchorCoverage.corpus,
  rosterWitness: assassinationAnchorCoverage.proposal.runtimeWitness,
  scenarioProposals: anchorCoverage.proposals,
});
const mutableStateCoverage =
  buildWarmachineSteamrollerTerminalMutableStateEvidenceV1({
    fixedRoundRuntimeRow: fixedRoundCoverage.runtime.find((row) =>
      row.scenarioKey === "trench_warfare"),
  });
const scenarioTerrainSelectionCoverage =
  buildWarmachineSteamrollerScenarioTerrainSelectionEvidenceV1({
    corpus: anchorCoverage.corpus,
  });
const scenarioControlRelationCoverage =
  buildWarmachineSteamrollerScenarioControlRelationEvidenceV1({
    corpus: anchorCoverage.corpus,
  });
const channeledExcarnateCoverage =
  buildWarmachineSteamrollerChanneledExcarnateTerminalEvidenceV1({
    corpus: anchorCoverage.corpus,
    resourcePartitionValues: [
      "exact_terminal_payment",
      "controller_transfer_or_channel_available",
    ],
  });
const representativeSelection = selectWarmachineSteamrollerTerminalRepresentativesV1({
  corpus: anchorCoverage.corpus,
  maximumSkeletonCells: 96,
  maximumRepresentativeSubcells: 50000,
  pinnedRepresentatives: [
    ...anchorCoverage.evidence.roots,
    ...assassinationAnchorCoverage.evidence.roots,
    ...assassinationMovementCoverage.evidence.roots,
    ...assassinationActionBoundaryCoverage.evidence.roots,
    ...assassinationControlBoundaryCoverage.evidence.roots,
    ...assassinationOutsideControlCoverage.evidence.roots,
    ...simultaneousLeaderCoverage.evidence.roots,
    ...simultaneousLeaderPresenceCoverage.evidence.roots,
    ...strygonSprayCoverage.evidence.roots,
    ...losRelationCoverage.evidence.roots,
    ...fixedRoundCoverage.evidence.roots,
    ...mutableStateCoverage.evidence.roots,
    ...scenarioTerrainSelectionCoverage.evidence.roots,
    ...scenarioControlRelationCoverage.evidence.roots,
    ...channeledExcarnateCoverage.evidence.roots,
  ],
});

assert.deepEqual(representativeSelection.evidencePinCoverage, {
  requestedPinCount: 41,
  selectedUniquePinCount: 41,
  duplicatePinCount: 0,
  allPinsSelected: true,
});
assert.ok(BigInt(representativeSelection.denominator.selectedRepresentativeSubcellCount) > 0n);
const selectedSubcellKeys = new Set(representativeSelection.selectedRepresentatives.map((row) =>
  row.subcellKey));
assert.equal(anchorCoverage.evidence.roots.every((root) =>
  selectedSubcellKeys.has(root.subcellKey)), true);
assert.equal(assassinationAnchorCoverage.evidence.roots.every((root) =>
  selectedSubcellKeys.has(root.subcellKey)), true);
assert.equal(assassinationMovementCoverage.evidence.roots.every((root) =>
  selectedSubcellKeys.has(root.subcellKey)), true);
assert.equal(assassinationActionBoundaryCoverage.evidence.roots.every((root) =>
  selectedSubcellKeys.has(root.subcellKey)), true);
assert.equal(assassinationControlBoundaryCoverage.evidence.roots.every((root) =>
  selectedSubcellKeys.has(root.subcellKey)), true);
assert.equal(assassinationOutsideControlCoverage.evidence.roots.every((root) =>
  selectedSubcellKeys.has(root.subcellKey)), true);
assert.equal(simultaneousLeaderCoverage.evidence.roots.every((root) =>
  selectedSubcellKeys.has(root.subcellKey)), true);
assert.equal(simultaneousLeaderPresenceCoverage.evidence.roots.every((root) =>
  selectedSubcellKeys.has(root.subcellKey)), true);
assert.equal(strygonSprayCoverage.evidence.roots.every((root) =>
  selectedSubcellKeys.has(root.subcellKey)), true);
assert.equal(losRelationCoverage.evidence.roots.every((root) =>
  selectedSubcellKeys.has(root.subcellKey)), true);
assert.equal(fixedRoundCoverage.evidence.roots.every((root) =>
  selectedSubcellKeys.has(root.subcellKey)), true);
assert.equal(mutableStateCoverage.evidence.roots.every((root) =>
  selectedSubcellKeys.has(root.subcellKey)), true);
assert.equal(scenarioTerrainSelectionCoverage.evidence.roots.every((root) =>
  selectedSubcellKeys.has(root.subcellKey)), true);
assert.equal(scenarioControlRelationCoverage.evidence.roots.every((root) =>
  selectedSubcellKeys.has(root.subcellKey)), true);
assert.equal(channeledExcarnateCoverage.evidence.roots.every((root) =>
  selectedSubcellKeys.has(root.subcellKey)), true);
const rejectEvidence =
  buildWarmachineSteamrollerScoreTerminalRepresentativeRejectEvidenceV1({
    corpus: anchorCoverage.corpus,
    representativeSelection,
    anchorEvidence: anchorCoverage.evidence,
    anchorProposals: anchorCoverage.proposals,
  });
const assassinationRejectEvidence =
  buildWarmachineSteamrollerAssassinationTerminalRepresentativeRejectEvidenceV1({
    corpus: anchorCoverage.corpus,
    representativeSelection,
    rosterWitness: assassinationAnchorCoverage.proposal.runtimeWitness,
  });

const ledger = buildWarmachineSteamrollerTerminalRepresentativeMaterializationLedgerV1({
  corpus: anchorCoverage.corpus,
  representativeSelection,
  evidenceSets: [
    anchorCoverage.evidence,
    assassinationAnchorCoverage.evidence,
    assassinationMovementCoverage.evidence,
    assassinationActionBoundaryCoverage.evidence,
    assassinationControlBoundaryCoverage.evidence,
    assassinationOutsideControlCoverage.evidence,
    simultaneousLeaderCoverage.evidence,
    simultaneousLeaderPresenceCoverage.evidence,
    strygonSprayCoverage.evidence,
    losRelationCoverage.evidence,
    fixedRoundCoverage.evidence,
    mutableStateCoverage.evidence,
    scenarioTerrainSelectionCoverage.evidence,
    scenarioControlRelationCoverage.evidence,
    channeledExcarnateCoverage.evidence,
    rejectEvidence.evidence,
    assassinationRejectEvidence,
  ],
  maximumProposedTasks: 8,
});
assert.equal(ledger.denominator.selectedMassConserved, true);
assert.equal(ledger.denominator.globalAuditMassConserved, true);
assert.equal(ledger.denominator.corpusSubcellCount,
  anchorCoverage.corpus.counts.proposedSubcellCount);
assert.equal(ledger.denominator.selectedRepresentativeSubcellCount,
  representativeSelection.denominator.selectedRepresentativeSubcellCount);
assert.equal(BigInt(ledger.denominator.unselectedSubcellCount),
  BigInt(ledger.denominator.corpusSubcellCount) -
    BigInt(ledger.denominator.selectedRepresentativeSubcellCount));
assert.equal(ledger.dispositionCounts.strict_materialized,
  anchorCoverage.evidence.strictMaterializedRootCount +
    assassinationAnchorCoverage.evidence.strictMaterializedRootCount +
    assassinationMovementCoverage.evidence.strictMaterializedRootCount +
    assassinationActionBoundaryCoverage.evidence.strictMaterializedRootCount +
    assassinationControlBoundaryCoverage.evidence.strictMaterializedRootCount +
    assassinationOutsideControlCoverage.evidence.strictMaterializedRootCount +
    simultaneousLeaderCoverage.evidence.strictMaterializedRootCount +
    simultaneousLeaderPresenceCoverage.evidence.strictMaterializedRootCount +
    strygonSprayCoverage.evidence.strictMaterializedRootCount +
    losRelationCoverage.evidence.strictMaterializedRootCount +
    fixedRoundCoverage.evidence.strictMaterializedRootCount +
    mutableStateCoverage.evidence.strictMaterializedRootCount +
    scenarioTerrainSelectionCoverage.evidence.strictMaterializedRootCount +
    scenarioControlRelationCoverage.evidence.strictMaterializedRootCount +
    channeledExcarnateCoverage.evidence.strictMaterializedRootCount);
assert.equal(ledger.dispositionCounts.strict_rejected,
  rejectEvidence.evidence.strictRejectedCount + assassinationRejectEvidence.strictRejectedCount +
    losRelationCoverage.evidence.strictRejectedRootCount);
assert.equal(ledger.dispositionCounts.proposal_filtered,
  losRelationCoverage.evidence.proposalFilteredRootCount);
assert.equal(ledger.dispositionCounts.proposed, 8);
assert.equal(ledger.dispositionCounts.round_equivalence_unresolved,
  representativeSelection.representativeDispositionCounts.round_equivalence_unresolved);
assert.equal(ledger.dispositionCounts.source_unresolved,
  representativeSelection.representativeDispositionCounts.source_unresolved);
assert.equal(Object.values(ledger.dispositionCounts).reduce((sum, count) =>
  sum + count, 0), Number(ledger.denominator.selectedRepresentativeSubcellCount));
assert.equal(Object.values(ledger.remainingExpectedNextDispositionCounts)
  .reduce((sum, count) => sum + count, 0),
ledger.dispositionCounts.budget_deferred + ledger.dispositionCounts.proposed);
assert.equal(ledger.tasks.filter((task) => task.disposition === "strict_materialized")
  .every((task) => task.strictReplayCertified && task.receiptHash && task.replayReceiptHash), true);
assert.equal(ledger.tasks.filter((task) =>
  ["strict_materialized", "proposal_filtered"].includes(task.disposition))
  .every((task) => task.strictReplayCertified && task.receiptHash && task.replayReceiptHash), true);
assert.equal(ledger.tasks.filter((task) => task.disposition === "proposed")
  .every((task) => task.expectedNextDisposition === "expected_strict_reject"), true);
assert.equal(new Set(ledger.tasks.map((task) => task.taskKey)).size, ledger.tasks.length);
const finalPartitionValues = (dimensionKey) => [...new Set(ledger.tasks
  .filter((task) => FINAL(task.disposition) && task.coordinates?.[dimensionKey])
  .map((task) => task.coordinates[dimensionKey]))].sort();
assert.deepEqual(finalPartitionValues("actionRange"), [
  "on_boundary",
  "outside_direct_action_range_requires_prior_movement",
  "strictly_inside",
]);
assert.deepEqual(finalPartitionValues("leaderControl"), [
  "on_boundary",
  "outside_or_not_required",
  "strictly_inside",
]);
assert.deepEqual(finalPartitionValues("lineOfSight"), [
  "clear",
  "model_blocked",
  "non_targeting_not_required",
  "stealth_blocks_beyond_five",
  "terrain_blocked",
  "true_sight_or_ignore_stealth_override",
]);

const resumed = buildWarmachineSteamrollerTerminalRepresentativeMaterializationLedgerV1({
  corpus: anchorCoverage.corpus,
  representativeSelection,
  priorOutcomes: completedWarmachineSteamrollerTerminalRepresentativeOutcomesV1(ledger),
  maximumProposedTasks: 8,
});
assert.equal(resumed.completedOutcomeHash, ledger.completedOutcomeHash);
assert.deepEqual(resumed.dispositionCounts, ledger.dispositionCounts);
assert.deepEqual(resumed.tasks.filter((task) => FINAL(task.disposition)).map(finalProjection),
  ledger.tasks.filter((task) => FINAL(task.disposition)).map(finalProjection));

const zeroBudget = buildWarmachineSteamrollerTerminalRepresentativeMaterializationLedgerV1({
  corpus: anchorCoverage.corpus,
  representativeSelection,
  evidenceSets: [
    anchorCoverage.evidence,
    assassinationAnchorCoverage.evidence,
    assassinationMovementCoverage.evidence,
    assassinationActionBoundaryCoverage.evidence,
    assassinationControlBoundaryCoverage.evidence,
    assassinationOutsideControlCoverage.evidence,
    simultaneousLeaderCoverage.evidence,
    simultaneousLeaderPresenceCoverage.evidence,
    strygonSprayCoverage.evidence,
    losRelationCoverage.evidence,
    fixedRoundCoverage.evidence,
    mutableStateCoverage.evidence,
    scenarioTerrainSelectionCoverage.evidence,
    scenarioControlRelationCoverage.evidence,
    channeledExcarnateCoverage.evidence,
    rejectEvidence.evidence,
    assassinationRejectEvidence,
  ],
  maximumProposedTasks: 0,
});
assert.equal(zeroBudget.dispositionCounts.proposed || 0, 0);
assert.equal(zeroBudget.dispositionCounts.budget_deferred,
  ledger.dispositionCounts.budget_deferred + ledger.dispositionCounts.proposed);
assert.equal(zeroBudget.dispositionCounts.strict_materialized,
  anchorCoverage.evidence.strictMaterializedRootCount +
    assassinationAnchorCoverage.evidence.strictMaterializedRootCount +
    assassinationMovementCoverage.evidence.strictMaterializedRootCount +
    assassinationActionBoundaryCoverage.evidence.strictMaterializedRootCount +
    assassinationControlBoundaryCoverage.evidence.strictMaterializedRootCount +
    assassinationOutsideControlCoverage.evidence.strictMaterializedRootCount +
    simultaneousLeaderCoverage.evidence.strictMaterializedRootCount +
    simultaneousLeaderPresenceCoverage.evidence.strictMaterializedRootCount +
    strygonSprayCoverage.evidence.strictMaterializedRootCount +
    losRelationCoverage.evidence.strictMaterializedRootCount +
    fixedRoundCoverage.evidence.strictMaterializedRootCount +
    mutableStateCoverage.evidence.strictMaterializedRootCount +
    scenarioTerrainSelectionCoverage.evidence.strictMaterializedRootCount +
    scenarioControlRelationCoverage.evidence.strictMaterializedRootCount +
    channeledExcarnateCoverage.evidence.strictMaterializedRootCount);
assert.equal(zeroBudget.dispositionCounts.strict_rejected,
  ledger.dispositionCounts.strict_rejected);
assert.equal(zeroBudget.dispositionCounts.proposal_filtered,
  ledger.dispositionCounts.proposal_filtered);
assert.equal(zeroBudget.denominator.selectedMassConserved, true);

const inputInvalidRepresentative = representativeSelection.selectedRepresentatives.find(
  (representative) =>
    representative.selectionReason !== "strict_evidence_pin" &&
    representative.expectedNextDisposition === "strict_materialization_pending",
);
assert.ok(inputInvalidRepresentative);
const inputInvalidProtocolLedger =
  buildWarmachineSteamrollerTerminalRepresentativeMaterializationLedgerV1({
    corpus: anchorCoverage.corpus,
    representativeSelection,
    evidenceSets: [{
      schemaVersion: "terminal_representative_input_invalid_protocol_fixture_v1",
      hostReceiptHash: anchorCoverage.corpus.hostReceiptHash,
      roots: [{
        disposition: "input_invalid",
        cellKey: inputInvalidRepresentative.cellKey,
        subcellKey: inputInvalidRepresentative.subcellKey,
        reason: "fixture_hypothesis_contract_invalid",
        receiptHash: "fixture-input-validation-receipt",
        replayReceiptHash: "",
        strictReplayCertified: false,
      }],
    }],
    maximumProposedTasks: 0,
  });
const inputInvalidTask = inputInvalidProtocolLedger.tasks.find((task) =>
  task.subcellKey === inputInvalidRepresentative.subcellKey);
assert.equal(inputInvalidTask.disposition, "input_invalid");
assert.equal(inputInvalidTask.strictReplayCertified, false);
const recoveredInputInvalidProtocolLedger =
  buildWarmachineSteamrollerTerminalRepresentativeMaterializationLedgerV1({
    corpus: anchorCoverage.corpus,
    representativeSelection,
    priorOutcomes: completedWarmachineSteamrollerTerminalRepresentativeOutcomesV1(
      inputInvalidProtocolLedger,
    ),
    maximumProposedTasks: 0,
  });
assert.equal(recoveredInputInvalidProtocolLedger.tasks.find((task) =>
  task.subcellKey === inputInvalidRepresentative.subcellKey)?.disposition, "input_invalid");

assert.throws(() => buildWarmachineSteamrollerTerminalRepresentativeMaterializationLedgerV1({
  corpus: anchorCoverage.corpus,
  representativeSelection,
  evidenceSets: [{
    ...anchorCoverage.evidence,
    hostReceiptHash: "stale-host-receipt",
  }, assassinationAnchorCoverage.evidence, assassinationMovementCoverage.evidence,
  assassinationActionBoundaryCoverage.evidence,
  assassinationControlBoundaryCoverage.evidence,
  assassinationOutsideControlCoverage.evidence,
  losRelationCoverage.evidence,
  rejectEvidence.evidence, assassinationRejectEvidence],
}), /terminal_representative_evidence_host_mismatch/);

function FINAL(disposition = "") {
  return [
    "strict_materialized",
    "strict_rejected",
    "proposal_filtered",
    "input_invalid",
  ].includes(disposition);
}

function finalProjection(task = {}) {
  return {
    taskKey: task.taskKey,
    disposition: task.disposition,
    receiptHash: task.receiptHash,
    replayReceiptHash: task.replayReceiptHash,
    sourceKind: task.sourceKind,
  };
}

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_steamroller_terminal_representative_materialization_ledger_v1",
  corpusHash: anchorCoverage.corpus.corpusHash,
  selectionHash: representativeSelection.selectionHash,
  ledgerHash: ledger.ledgerHash,
  completedOutcomeHash: ledger.completedOutcomeHash,
  evidencePinCoverage: representativeSelection.evidencePinCoverage,
  dispositionCounts: ledger.dispositionCounts,
  remainingExpectedNextDispositionCounts: ledger.remainingExpectedNextDispositionCounts,
  denominator: ledger.denominator,
  recovery: resumed.recovery,
}, null, 2));
