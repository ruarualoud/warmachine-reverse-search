import assert from "node:assert/strict";

import { buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-assassination-terminal-anchor-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerAssassinationTerminalRepresentativeRejectEvidenceV1,
} from
  "../src/reverse/steamroller-assassination-terminal-representative-reject-evidence-v1.mjs";
import { buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-anchor-evidence-v1.mjs";
import { selectWarmachineSteamrollerTerminalRepresentativesV1 } from
  "../src/reverse/steamroller-terminal-representative-selector-v1.mjs";

const scoreAnchors = buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1();
const assassinationAnchor = buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
  corpus: scoreAnchors.corpus,
});
const assassinationMovement = buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
  corpus: scoreAnchors.corpus,
  rosterWitness: assassinationAnchor.proposal.runtimeWitness,
  actionRange: "outside_direct_action_range_requires_prior_movement",
});
const representativeSelection = selectWarmachineSteamrollerTerminalRepresentativesV1({
  corpus: scoreAnchors.corpus,
  maximumSkeletonCells: 96,
  maximumRepresentativeSubcells: 50000,
  pinnedRepresentatives: [
    ...scoreAnchors.evidence.roots,
    ...assassinationAnchor.evidence.roots,
    ...assassinationMovement.evidence.roots,
  ],
});
const evidence =
  buildWarmachineSteamrollerAssassinationTerminalRepresentativeRejectEvidenceV1({
    corpus: scoreAnchors.corpus,
    representativeSelection,
    rosterWitness: assassinationAnchor.proposal.runtimeWitness,
  });

assert.equal(evidence.completeWithinSelectedScope, true);
assert.equal(evidence.selectedRepresentativeCount, 2);
assert.equal(evidence.strictRejectedCount, 2);
assert.deepEqual([...new Set(evidence.roots.map((root) => root.topology))].sort(), [
  "illegal_overlap_expected_reject",
  "outside_table_expected_reject",
]);
assert.equal(evidence.roots.every((root) =>
  root.disposition === "strict_rejected" &&
  root.authority === "rules_v1_host" &&
  root.receiptHash &&
  root.strictReplayCertified === false &&
  root.trainingTruth === false), true);
assert.equal(evidence.roots.every((root) =>
  root.staticPlacementIssueCodes.length > 0), true);

console.log(JSON.stringify({
  ok: true,
  schemaVersion:
    "verify_steamroller_assassination_terminal_representative_reject_evidence_v1",
  corpusHash: evidence.corpusHash,
  selectionHash: evidence.selectionHash,
  evidenceHash: evidence.evidenceHash,
  selectedRepresentativeCount: evidence.selectedRepresentativeCount,
  strictRejectedCount: evidence.strictRejectedCount,
  roots: evidence.roots.map((root) => ({
    cellKey: root.cellKey,
    subcellKey: root.subcellKey,
    topology: root.topology,
    receiptHash: root.receiptHash,
    staticPlacementIssueCodes: root.staticPlacementIssueCodes,
  })),
  claimBoundary: evidence.claimBoundary,
}, null, 2));
