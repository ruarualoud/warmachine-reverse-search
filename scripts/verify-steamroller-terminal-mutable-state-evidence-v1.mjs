import assert from "node:assert/strict";

import { buildWarmachineSteamrollerFixedRoundTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-fixed-round-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-anchor-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerTerminalMutableStateEvidenceV1,
  WARMACHINE_STEAMROLLER_TERMINAL_MUTABLE_STATE_VARIANT_KEYS_V1,
} from "../src/reverse/steamroller-terminal-mutable-state-evidence-v1.mjs";

const scoreAnchors = buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1();
const fixed = buildWarmachineSteamrollerFixedRoundTerminalAnchorEvidenceV1({
  corpus: scoreAnchors.corpus,
  scenarioProposals: scoreAnchors.proposals,
  scenarioKeys: ["trench_warfare"],
});
const result = buildWarmachineSteamrollerTerminalMutableStateEvidenceV1({
  fixedRoundRuntimeRow: fixed.runtime[0],
});

assert.equal(
  result.evidence.strictMaterializedRootCount,
  WARMACHINE_STEAMROLLER_TERMINAL_MUTABLE_STATE_VARIANT_KEYS_V1.length,
);
assert.equal(result.evidence.strictRejectedRootCount, 0);
assert.equal(result.evidence.coverage.exactTerminalInverseCount,
  result.evidence.strictMaterializedRootCount);
assert.equal(result.evidence.roots.every((root) =>
  root.strictReplayCertified && root.exactTerminalInverseCertified), true);
assert.equal(result.evidence.roots.every((root) =>
  root.executionRosterModelCount === 103), true);

const byVariant = new Map(result.evidence.roots.map((root) => [root.variantKey, root]));
const rfp = byVariant.get("removed-from-play-history").mutableStateAudit.affected[0];
assert.equal(rfp.removedFromPlay, true);
assert.equal(rfp.destroyed, true);
assert.equal(rfp.offTable, true);
const reserve = byVariant.get("ambush-reserve-history").mutableStateAudit;
assert.equal(reserve.affected.length, 5);
assert.equal(reserve.affected.every((row) =>
  row.canAmbush && row.offTable && row.notDeployed && !row.destroyed), true);
const warjack = byVariant.get("warjack-cortex-disabled").mutableStateAudit.affected[0];
assert.equal(warjack.systems.cortex, 0);
assert.equal(warjack.resourcePoints, 0);
const warbeast = byVariant.get("warbeast-body-disabled").mutableStateAudit.affected[0];
assert.equal(warbeast.systems.body, 0);
assert.equal(warbeast.systems.mind, 5);
assert.equal(warbeast.systems.spirit, 10);
assert.equal(byVariant.get("warbeast-body-disabled").mutableStateAudit
  .mutationEvidence.historicalDamageBranchClaimed, false);
const oneFocus = byVariant.get("one-additional-purchase-resource")
  .mutableStateAudit.resources.filter((row) => row.resourcePoints > 0);
assert.deepEqual(oneFocus, [{
  pieceKey: "player1_raptor_20_1",
  resourceMax: 3,
  resourcePoints: 1,
}]);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_steamroller_terminal_mutable_state_evidence_v1",
  hostReceiptHash: result.evidence.hostReceiptHash,
  evidenceHash: result.evidence.evidenceHash,
  strictMaterializedRootCount: result.evidence.strictMaterializedRootCount,
  coverage: result.evidence.coverage,
}, null, 2));
