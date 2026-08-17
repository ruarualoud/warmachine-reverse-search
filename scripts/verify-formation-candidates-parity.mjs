#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildWarmachineRulesV1StateFromLayer3Room, evaluateWarmachineFormationEffectiveness } from "../src/warmachine-construction-host-runtime.mjs";
import {
  buildWarmachineFormationAssignmentOverrides as buildLocalAssignmentOverrides,
  generateWarmachineFormationCandidates as generateLocalCandidates,
  rankWarmachineFormationArchetypes as rankLocalArchetypes,
} from "../src/construction/formation-candidates-v1.mjs";
import {
  loadLegacyReverseSearchModules,
  resolveProjectDRoot,
} from "../src/upstream-project-d.mjs";

const { modules: legacyModules } = await loadLegacyReverseSearchModules();
const legacyFormation = legacyModules.formation;
const parityCounts = { rank: 0, assignment: 0, generate: 0 };

function rankWarmachineFormationArchetypes(...args) {
  const local = rankLocalArchetypes(...args);
  const upstream = legacyFormation.rankWarmachineFormationArchetypes(...args);
  assert.deepEqual(local, upstream, `formation rank parity failed for case ${parityCounts.rank + 1}`);
  parityCounts.rank += 1;
  return local;
}

function generateWarmachineFormationCandidates(...args) {
  const local = generateLocalCandidates(...args);
  const upstream = legacyFormation.generateWarmachineFormationCandidates(...args);
  assert.deepEqual(local, upstream, `formation generation parity failed for case ${parityCounts.generate + 1}`);
  parityCounts.generate += 1;
  return local;
}

const ROOT = resolveProjectDRoot();
const BASE_DIR = path.join(ROOT, "build", "warmachine-ai", "sepsira-swarm-vs-fane-v20260805");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const pool = readJson(path.join(BASE_DIR, "strict-construction-pool-v1", "report.json"));
const roomStore = readJson(path.join(BASE_DIR, "local-layer3", "state.json"));
const templateRoom = roomStore.roomsById?.["room_f1823ced-bf71-4392-8669-c6330d237efb"];
assert.ok(templateRoom, "fixed construction template room missing");
const player1List = pool.cryxLists[0];
const player2List = pool.faneLists[0];
const assignmentFixture = [{
  cardName: "Synthetic Unit",
  displayName: "Synthetic Unit",
  modelCount: 3,
  modelRole: "unit",
}];
const assignmentArchetype = rankLocalArchetypes({ pieces: [] }, "player1")[0];
const assignmentLocal = buildLocalAssignmentOverrides(
  assignmentFixture,
  assignmentArchetype,
  "player1",
);
const assignmentUpstream = legacyFormation.buildWarmachineFormationAssignmentOverrides(
  assignmentFixture,
  assignmentArchetype,
  "player1",
);
assert.deepEqual(assignmentLocal, assignmentUpstream, "formation assignment override parity failed");
parityCounts.assignment += 1;
assert.equal(player1List.totalPoints, 100);
assert.equal(player2List.totalPoints, 100);

const referenceState = {
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    {
      pieceKey: "friendly-reference",
      sideKey: "player1",
      position: { xIn: 6, yIn: 24 },
      boxesRemaining: 10,
      attackProfiles: [{ profileKey: "blade", mode: "melee", rangeIn: 1 }],
    },
    {
      pieceKey: "enemy-aoe-reference",
      sideKey: "player2",
      position: { xIn: 42, yIn: 24 },
      boxesRemaining: 10,
      attackProfiles: [{ profileKey: "bombard", mode: "ranged", rangeIn: 14, aoeIn: 4 }],
    },
  ],
};

const ranked = rankWarmachineFormationArchetypes(referenceState, "player1");
assert.ok(
  ranked.findIndex((row) => row.key === "anti_aoe_dispersion") < ranked.findIndex((row) => row.key === "balanced_layered"),
  "enemy AOE structure must raise the AOE-dispersion archetype above the unconditioned balanced baseline",
);

const generated = generateWarmachineFormationCandidates({
  templateRoom,
  player1List,
  player2List,
  referenceState,
  firstPlayerSideKey: "player1",
  maximumArchetypesPerSide: 3,
  maximumPairs: 9,
});
assert.equal(generated.counts.fullPairCount, 9);
assert.equal(generated.counts.attemptedPairCount, 9);
assert.equal(generated.counts.budgetUnresolvedPairCount, 0);
assert.ok(generated.counts.strictLegalCandidateCount > 0);
assert.equal(generated.proposalMassLedger.representedAttemptedMassConserved, true);
assert.equal(generated.proposalMassLedger.budgetUnresolvedProposalMass, 0);
assert.equal(
  generated.counts.strictLegalCandidateCount + generated.counts.strictRejectedCandidateCount,
  generated.counts.attemptedPairCount,
);
assert.ok(generated.candidates.every((candidate) => candidate.deploymentAudit.ok));
assert.ok(generated.candidates.every((candidate) => candidate.deploymentAudit.overlapPairCount === 0));
assert.ok(generated.candidates.every((candidate) => candidate.deploymentAudit.disconnectedUnitGroupCount === 0));
assert.ok(generated.candidates.every((candidate) => candidate.deploymentAudit.attachmentDistanceOutlierCount === 0));
assert.ok(generated.candidates.every((candidate) => candidate.room.game.rulesV1RuntimeState === null));
assert.ok(generated.candidates.every((candidate) => candidate.room.game.preGameRuleChoicesComplete === false));
assert.ok(generated.candidates.every((candidate) => candidate.room.game.controlPhaseProgressed === false));
assert.ok(generated.candidates.every((candidate) => candidate.room.game.reverseFormationCandidateEvidence
  ?.proposalMassLedger?.representedAttemptedMassConserved === true));

const antiAoe = generated.candidates.find((candidate) => candidate.archetypes.player1.key === "anti_aoe_dispersion");
const balanced = generated.candidates.find((candidate) => candidate.archetypes.player1.key === "balanced_layered");
assert.ok(antiAoe, "AOE-conditioned exact deployment candidate missing");
assert.ok(balanced, "balanced exact deployment candidate missing");
const antiGroups = antiAoe.room.game.deploymentPlanSummary.sidePlans.player1.packedDeploymentGeometry.groups;
const balancedGroups = balanced.room.game.deploymentPlanSummary.sidePlans.player1.packedDeploymentGeometry.groups;
assert.ok(antiGroups.some((group) => group.requestedEdgeGapIn === 1.8));
assert.ok(balancedGroups.every((group) => group.requestedEdgeGapIn === 0.18));
assert.ok(antiGroups.every((group) => group.edgeGapIn <= group.requestedEdgeGapIn + 0.001));

const antiState = buildWarmachineRulesV1StateFromLayer3Room(antiAoe.room, { sideKey: "player1", strictMode: true });
const balancedState = buildWarmachineRulesV1StateFromLayer3Room(balanced.room, { sideKey: "player1", strictMode: true });
assert.equal(antiState.pieces.length, player1List.physicalModels + player2List.physicalModels);
assert.equal(antiState.pieces.filter((piece) => piece.sideKey === "player1").length, player1List.physicalModels);
assert.equal(antiState.pieces.filter((piece) => piece.sideKey === "player2").length, player2List.physicalModels);
assert.equal(
  antiState.pieces.filter((piece) => String(piece.label || "").startsWith("The Last Watch ")).length,
  3,
  "multi-health three-model units must not collapse to their two shared stat profiles",
);
assert.equal(antiState.strictMode, true);
assert.equal(antiState.preGameRuleChoicesComplete, false);
assert.equal(antiState.controlPhaseProgressed, false);
assert.equal(antiState.pendingRuleChoiceWindows.length, 0);
const antiEffectiveness = evaluateWarmachineFormationEffectiveness(antiState, "player1");
const balancedEffectiveness = evaluateWarmachineFormationEffectiveness(balancedState, "player1");
assert.notEqual(antiEffectiveness.topology.topologyClassKey, balancedEffectiveness.topology.topologyClassKey);
const fullBreadth = generateWarmachineFormationCandidates({
  templateRoom,
  player1List,
  player2List,
  referenceState: antiState,
  firstPlayerSideKey: "player1",
  maximumArchetypesPerSide: 11,
  maximumPairs: 121,
  includeRooms: false,
});
assert.equal(fullBreadth.counts.fullPairCount, 121);
assert.equal(fullBreadth.counts.attemptedPairCount, 121);
assert.equal(fullBreadth.counts.strictLegalCandidateCount, 121);
assert.equal(fullBreadth.counts.strictRejectedCandidateCount, 0);
assert.equal(fullBreadth.counts.budgetUnresolvedPairCount, 0);
assert.equal(fullBreadth.proposalMassLedger.representedAttemptedMassConserved, true);
assert.equal(fullBreadth.proposalMassLedger.strictLegalProposalMass, 1);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_formation_candidate_generator_v1",
  rulesConditioning: {
    firstArchetype: ranked[0].key,
    antiAoePriority: ranked.find((row) => row.key === "anti_aoe_dispersion").priority,
    balancedPriority: ranked.find((row) => row.key === "balanced_layered").priority,
  },
  counts: generated.counts,
  proposalMassLedger: generated.proposalMassLedger,
  antiAoeGeometry: {
    descriptorKey: antiEffectiveness.descriptorKey,
    defense: antiEffectiveness.bounds.defense,
    requestedEdgeGaps: antiGroups.map((group) => group.requestedEdgeGapIn),
    realizedEdgeGaps: antiGroups.map((group) => group.edgeGapIn),
    spacingReductionCount: antiGroups.filter((group) => group.spacingReduced).length,
  },
  balancedGeometry: {
    descriptorKey: balancedEffectiveness.descriptorKey,
    defense: balancedEffectiveness.bounds.defense,
  },
  fullBreadth: {
    counts: fullBreadth.counts,
    proposalMassLedger: fullBreadth.proposalMassLedger,
    exhaustiveOverAllLegalDeployments: fullBreadth.finiteContract.exhaustiveOverAllLegalDeployments,
  },
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_formation_candidates_parity_v1",
  parityCounts,
}, null, 2));
