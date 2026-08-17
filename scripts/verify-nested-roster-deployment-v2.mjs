import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  buildWarmachineFiniteRosterProposalLedgerV2,
  buildWarmachineModelHistoryCoverageV2,
  buildWarmachineRosterPoolSourceEvidenceV2,
  buildWarmachineStrictHistorySegmentReceiptV2,
  runWarmachineNestedRosterDeploymentSearchV2,
} from "../src/construction/nested-roster-deployment-v2.mjs";
import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import {
  applyRulesV1Action,
  buildWarmachineRulesV1ActionWithStrictRngOutcome,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  resolveWarmachineHostPath,
} from "../src/warmachine-host-runtime.mjs";

const BASE_DIR = resolveWarmachineHostPath(
  "build/warmachine-ai/sepsira-swarm-vs-fane-v20260805",
);
const POOL_PATH = path.join(BASE_DIR, "strict-construction-pool-v1", "report.json");
const ROOM_STORE_PATH = path.join(BASE_DIR, "local-layer3", "state.json");
const EVIDENCE_PATH = new URL(
  "../docs/research/nested-roster-deployment-v2-verification.json",
  import.meta.url,
);

const poolBytes = fs.readFileSync(POOL_PATH);
const pool = JSON.parse(poolBytes);
const poolContentHash = createHash("sha256").update(poolBytes).digest("hex");
const sourceMetadata = {
  sourceContentHash: poolContentHash,
  sourceSchemaVersion: pool.schemaVersion,
  exactListLegality: pool.quality.exactListLegality,
  forceBuilderContract: pool.algorithm.finalLegality,
  remoteVersion: pool.source.remoteVersion,
  exhaustiveAllFactionRosters: pool.algorithm.exhaustiveAllLists,
};
const cryxSourceEvidence = buildWarmachineRosterPoolSourceEvidenceV2(
  pool.cryxLists,
  sourceMetadata,
);
const faneSourceEvidence = buildWarmachineRosterPoolSourceEvidenceV2(
  pool.faneLists,
  sourceMetadata,
);
assert.equal(cryxSourceEvidence.exactListLegality, true);
assert.equal(cryxSourceEvidence.sourceRosterIdentityCount, pool.cryxLists.length);
assert.equal(faneSourceEvidence.sourceRosterIdentityCount, pool.faneLists.length);

const roomStore = JSON.parse(fs.readFileSync(ROOM_STORE_PATH, "utf8"));
const templateRoom = roomStore.roomsById?.["room_f1823ced-bf71-4392-8669-c6330d237efb"];
assert.ok(templateRoom);

const duplicate = structuredClone(pool.cryxLists[0]);
duplicate.key = "duplicate-source-alias";
const invalid = structuredClone(pool.cryxLists[1]);
invalid.key = "invalid-point-total";
invalid.totalPoints = 99;
const dedupeLedger = buildWarmachineFiniteRosterProposalLedgerV2(
  [pool.cryxLists[0], pool.cryxLists[1], duplicate, invalid],
  "player1",
  {
    maximumSelectedUniqueRosters: 1,
    seed: "dedupe-fixture-v2",
    sourceEvidence: cryxSourceEvidence,
  },
);
assert.deepEqual(dedupeLedger.counts, {
  sourceProposalCount: 4,
  sourceExactLegalProposalCount: 3,
  sourceInvalidProposalCount: 1,
  uniqueExactLegalRosterCount: 2,
  duplicateLegalAliasCount: 1,
  terminalProposalExcludedUniqueCount: 0,
  selectedUniqueRosterCount: 1,
  budgetUnresolvedUniqueRosterCount: 1,
});
assert.equal(dedupeLedger.massLedger.sourceInvalidMass, 0.25);
assert.equal(dedupeLedger.massLedger.massConserved, true);
assert.equal(
  dedupeLedger.selected[0].sourceAliasCount + dedupeLedger.budgetUnresolved[0].sourceAliasCount,
  3,
);

const gormanCardId = "0fbf5dd3-387b-41e8-8064-dd87d42b8519";
const withGorman = pool.cryxLists.find((list) =>
  list.entries.some((entry) => entry.cardId === gormanCardId));
const withoutGorman = pool.cryxLists.find((list) =>
  !list.entries.some((entry) => entry.cardId === gormanCardId));
assert.ok(withGorman && withoutGorman);
const orderingBottleneck = {
  bottleneckKey: "gorman-provider-ordering",
  requiredAnyCardIds: [gormanCardId],
  orderingLockEligible: true,
  hardBranchLockEligible: false,
};
const orderingLedger = buildWarmachineFiniteRosterProposalLedgerV2(
  [withoutGorman, withGorman],
  "player1",
  {
    maximumSelectedUniqueRosters: 1,
    seed: "capability-ordering-v2",
    sourceEvidence: cryxSourceEvidence,
    capabilityBottlenecks: [orderingBottleneck],
  },
);
assert.equal(orderingLedger.selected[0].list.key, withGorman.key);
assert.equal(orderingLedger.terminalProposalExcluded.length, 0);
assert.equal(orderingLedger.hardPruningEnabled, false);

const exactBottleneck = {
  ...orderingBottleneck,
  hardBranchLockEligible: true,
  sourceClassificationClosed: true,
  alternativeProviderSetExhausted: true,
  optimisticCapabilityBoundExact: true,
  strictTracePreservationProven: true,
  wildcardSourceIds: [],
};
const exactBottleneckLedger = buildWarmachineFiniteRosterProposalLedgerV2(
  [withoutGorman, withGorman],
  "player1",
  {
    maximumSelectedUniqueRosters: 2,
    seed: "capability-exact-v2",
    sourceEvidence: cryxSourceEvidence,
    capabilityBottlenecks: [exactBottleneck],
  },
);
assert.equal(exactBottleneckLedger.selected.length, 1);
assert.equal(exactBottleneckLedger.selected[0].list.key, withGorman.key);
assert.equal(exactBottleneckLedger.terminalProposalExcluded.length, 1);
assert.equal(exactBottleneckLedger.massLedger.terminalProposalExcludedMass, 0.5);
assert.equal(exactBottleneckLedger.massLedger.massConserved, true);
assert.equal(exactBottleneckLedger.hardPruningEnabled, true);

const nestedInput = {
  templateRoom,
  rosterPoolsBySide: {
    player1: pool.cryxLists.slice(0, 5),
    player2: pool.faneLists.slice(0, 5),
  },
  sourceEvidenceBySide: {
    player1: cryxSourceEvidence,
    player2: faneSourceEvidence,
  },
  maximumSelectedRostersBySide: { player1: 3, player2: 3 },
  maximumRosterPairs: 2,
  maximumArchetypesPerSide: 2,
  maximumFormationPairsPerRosterPair: 4,
  firstPlayerSideKeys: ["player1", "player2"],
  includeRooms: false,
  seed: "real-nested-five-by-five-v2",
};
const nested = runWarmachineNestedRosterDeploymentSearchV2(nestedInput);
assert.equal(nested.counts.selectedRosterPairCount, 9);
assert.equal(nested.counts.attemptedRosterPairCount, 2);
assert.equal(nested.counts.deferredSelectedRosterPairCount, 7);
assert.equal(nested.counts.attemptedRosterPairFirstPlayerCount, 4);
assert.equal(nested.counts.strictLegalOpeningCount, 16);
assert.equal(nested.counts.strictRejectedOpeningCount, 0);
assert.equal(nested.counts.formationBudgetUnresolvedCount, 0);
assert.equal(nested.massLedger.rosterBudgetUnresolvedMass, 0.92);
assert.equal(nested.massLedger.strictLegalOpeningMass, 0.08);
assert.equal(nested.massLedger.massConserved, true);
assert.ok(nested.openings.every((opening) => opening.strictDeploymentLegal));
assert.ok(nested.openings.every((opening) => opening.deploymentAudit.overlapPairCount === 0));
assert.ok(nested.openings.every((opening) =>
  opening.deploymentAudit.disconnectedUnitGroupCount === 0));
assert.ok(nested.openings.every((opening) =>
  opening.deploymentAudit.attachmentDistanceOutlierCount === 0));
assert.equal(nested.globalOptimalityProven, false);
assert.equal(nested.trainingTruth, false);
const nestedRerun = runWarmachineNestedRosterDeploymentSearchV2(nestedInput);
assert.equal(nestedRerun.searchHash, nested.searchHash);

const fixed = runWarmachineNestedRosterDeploymentSearchV2({
  templateRoom,
  rosterPoolsBySide: {
    player1: [pool.cryxLists[0]],
    player2: [pool.faneLists[0]],
  },
  sourceEvidenceBySide: {
    player1: cryxSourceEvidence,
    player2: faneSourceEvidence,
  },
  maximumSelectedRostersBySide: { player1: 1, player2: 1 },
  maximumRosterPairs: 1,
  maximumArchetypesPerSide: 1,
  maximumFormationPairsPerRosterPair: 1,
  firstPlayerSideKeys: ["player1"],
  includeStates: true,
  seed: "fixed-one-opening-v2",
  searchMode: "fixed_roster_to_deployment",
});
assert.equal(fixed.counts.strictLegalOpeningCount, 1);
assert.equal(fixed.massLedger.strictLegalOpeningMass, 1);
assert.equal(fixed.massLedger.massConserved, true);
const fixedOpening = fixed.openings[0];
assert.equal(
  fixedOpening.modelCount,
  pool.cryxLists[0].physicalModels + pool.faneLists[0].physicalModels,
);
assert.equal(fixedOpening.rosterProvenance.completeForHardPruning, true);
assert.equal(fixedOpening.rosterProvenance.unknownModelCount, 0);
assert.equal(fixedOpening.rosterPointLedger.pointAccountingComplete, true);
assert.equal(fixedOpening.rosterPointLedger.sides.player1.rosterPoints, 100);
assert.equal(fixedOpening.rosterPointLedger.sides.player2.rosterPoints, 100);

const openingLeaders = fixedOpening.state.pieces.filter((piece) =>
  piece.isWarcaster || piece.isWarlock).map((piece) => piece.pieceKey);
const openingHistory = buildWarmachineModelHistoryCoverageV2(
  [{ checkpointKey: "legal-deployment", state: fixedOpening.state }],
  {
    directlyRelevantPieceKeys: openingLeaders,
    activationUpperBoundBySide: { player1: 4, player2: 4 },
  },
);
assert.equal(openingHistory.counts.modelCount, fixedOpening.modelCount);
assert.equal(openingHistory.counts.directlyRelevantModelCount, openingLeaders.length);
assert.equal(openingHistory.counts.strictCompleteHistoryModelCount, 0);
assert.equal(openingHistory.counts.expandedUnresolvedHistoryModelCount, openingLeaders.length);
assert.equal(
  openingHistory.counts.deferredEnvelopeModelCount,
  fixedOpening.modelCount - openingLeaders.length,
);
assert.equal(openingHistory.rosterIdentityPreserved, true);
assert.equal(openingHistory.requiredHistoryCoverageComplete, false);
assert.equal(openingHistory.allModelHistoriesStrictComplete, false);
assert.equal(openingHistory.openingProvenance.completeForHardPruning, true);
assert.ok(openingHistory.deferredEquivalenceGroups.some((group) => group.multiplicity > 1));
assert.equal(openingHistory.rows.filter((row) => row.reachableEnvelope)
  .every((row) => row.reachableEnvelope.hardReachabilityRefuted === false), true);

function leader(pieceKey, sideKey, position, overrides = {}) {
  const boxesRemaining = overrides.boxesRemaining ?? 5;
  return {
    pieceKey,
    label: pieceKey,
    sideKey,
    modelRole: "warcaster",
    modelType: "warcaster",
    isWarcaster: true,
    position,
    baseSizeIn: 1.18,
    speedIn: 6,
    defense: 12,
    armor: 16,
    damage: { boxesRemaining, maxBoxes: boxesRemaining },
    statusTags: [],
    attackProfiles: overrides.attackProfiles || [],
    cardSnapshot: { id: `card-${pieceKey}`, pointCostNumber: 0 },
  };
}

const killingProfile = {
  profileKey: "history-terminal-blade",
  name: "History Terminal Blade",
  mode: "melee",
  rangeIn: 2,
  power: 24,
  attackStat: 8,
  attackStatKind: "MAT",
};
const scenarioTerrain = (terrainKey, xIn, yIn, setupOrderIndex) => ({
  terrainKey,
  type: "scenario terrain",
  isScenarioTerrain: true,
  xIn,
  yIn,
  widthIn: 2,
  heightIn: 2,
  ownerSideKey: "",
  sourceFlagKey: terrainKey,
  sourceFlagPosition: { xIn, yIn },
  scenarioTerrainSetupChoiceRequired: true,
  scenarioTerrainSetupChoiceResolved: true,
  scenarioTerrainFallbackUsed: true,
  scenarioTerrainSelectionCandidateKeys: [],
  scenarioTerrainSetupOrderIndex: setupOrderIndex,
  geometryExactWithinScope: true,
  geometryIssues: [],
});
const attackState = normalizeRulesV1State({
  stateKey: "history-strict-route-start",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 1,
  strictMode: true,
  enforceStrictExecutor: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    leader("p1-leader", "player1", { xIn: 10, yIn: 10 }, { attackProfiles: [killingProfile] }),
    leader("p2-leader", "player2", { xIn: 11.1, yIn: 10 }, { boxesRemaining: 1 }),
  ],
  terrain: [
    scenarioTerrain("pressure-a", 8, 34, 0),
    scenarioTerrain("pressure-b", 16, 36, 1),
    scenarioTerrain("pressure-c", 32, 12, 2),
    scenarioTerrain("pressure-d", 40, 14, 3),
  ],
  deploymentBackEdgeBySide: { player1: "south", player2: "north" },
  scenario: {
    packetKey: "steamroller-2026",
    packetYear: "2026",
    scenarioName: "Pressure Point",
    attackerSideKey: "player1",
    defenderSideKey: "player2",
    scoringStartSideKey: "player2",
    scoringStartTurnNumber: 2,
    score: { player1: 0, player2: 0 },
    objectives: [{ objectiveKey: "center-50", baseSizeMm: 50, xIn: 24, yIn: 24 }],
    caches: [],
  },
});
const attackEnumeration = enumerateRulesV1Actions(attackState);
const attack = attackEnumeration.actions.find((action) =>
  action.actionType === "melee_attack" &&
  action.actorPieceKey === "p1-leader" &&
  action.targetPieceKey === "p2-leader");
assert.ok(attack);
const strictAction = {
  ...buildWarmachineRulesV1ActionWithStrictRngOutcome(attack, {
    room: {
      id: "history-strict-route",
      game: { round: 1, turnNumber: 1, activeSideKey: "player1" },
    },
    sourceContext: {
      rulesV1State: attackState,
      rulesV1Enumeration: attackEnumeration,
    },
    selectedActionKey: attack.actionKey,
    branchKey: "history-terminal-hit",
  }),
  strictRollOutcome: { attackDice: [6, 6], damageDice: [6, 6] },
  __warmachineTrustedRulesV1Enumeration: attackEnumeration,
};
const transition = applyRulesV1Action(attackState, strictAction);
assert.equal(
  transition.ok,
  true,
  JSON.stringify(transition.rejection || transition.error || transition.events || null),
);
const segmentReceipt = buildWarmachineStrictHistorySegmentReceiptV2(
  attackState,
  attack,
  transition,
);
assert.equal(segmentReceipt.strictCertified, true);
const strictHistory = buildWarmachineModelHistoryCoverageV2(
  [
    { checkpointKey: "before-terminal-attack", state: attackState },
    { checkpointKey: "after-terminal-attack", state: transition.nextState },
  ],
  {
    directlyRelevantPieceKeys: ["p1-leader", "p2-leader"],
    strictSegmentReceipts: [segmentReceipt],
    historyScopeComplete: true,
    scopeStartKind: "bound_route_start",
    scopeEndKind: "strict_terminal",
  },
);
assert.equal(strictHistory.counts.modelCount, 2);
assert.equal(strictHistory.counts.strictCompleteHistoryModelCount, 2);
assert.equal(strictHistory.requiredHistoryCoverageComplete, true);
assert.equal(strictHistory.allModelHistoriesStrictComplete, true);
assert.equal(strictHistory.segmentRows[0].strictCertified, true);
assert.equal(strictHistory.segmentRows[0].authorityMatches, true);
assert.equal(strictHistory.segmentRows[0].receiptHashMatches, true);
assert.equal(strictHistory.rosterIdentityPreserved, true);
assert.ok(["destroyed", "removed_from_play"].includes(
  strictHistory.rows.find((row) => row.pieceKey === "p2-leader").finalLifecycleStage,
));

const corruptedReceipt = { ...segmentReceipt, strictReceiptHash: "corrupt" };
const unresolvedHistory = buildWarmachineModelHistoryCoverageV2(
  [attackState, transition.nextState],
  {
    directlyRelevantPieceKeys: ["p1-leader", "p2-leader"],
    strictSegmentReceipts: [corruptedReceipt],
    historyScopeComplete: true,
    scopeStartKind: "bound_route_start",
    scopeEndKind: "strict_terminal",
  },
);
assert.equal(unresolvedHistory.counts.strictCompleteHistoryModelCount, 0);
assert.equal(unresolvedHistory.counts.expandedUnresolvedHistoryModelCount, 2);
assert.equal(unresolvedHistory.segmentRows[0].unresolvedReason, "strict_receipt_digest_mismatch");

const envelopeStart = structuredClone(attackState);
envelopeStart.stateKey = "deferred-envelope-start";
envelopeStart.pieces.push({
  pieceKey: "deferred-runner",
  label: "Deferred Runner",
  sideKey: "player1",
  modelRole: "warrior",
  modelType: "warrior",
  position: { xIn: 2, yIn: 2 },
  baseSizeIn: 1.18,
  speedIn: 6,
  defense: 12,
  armor: 14,
  damage: { boxesRemaining: 5, maxBoxes: 5 },
  cardSnapshot: { id: "card-deferred-runner", pointCostNumber: 2 },
});
const envelopeEnd = structuredClone(envelopeStart);
envelopeEnd.stateKey = "deferred-envelope-end";
envelopeEnd.pieces.find((piece) => piece.pieceKey === "deferred-runner").position = {
  xIn: 30,
  yIn: 2,
};
const openEnvelope = buildWarmachineModelHistoryCoverageV2(
  [envelopeStart, envelopeEnd],
  { activationUpperBoundBySide: { player1: 1, player2: 1 } },
);
const openRunner = openEnvelope.rows.find((row) => row.pieceKey === "deferred-runner");
assert.equal(openRunner.reachableEnvelope.requiredEndpointDisplacementIn, 28);
assert.equal(openRunner.reachableEnvelope.totalMovementUpperBoundIn, null);
assert.equal(openRunner.reachableEnvelope.hardReachabilityRefuted, false);
assert.equal(openRunner.reachableEnvelope.orderingOnly, true);
const closedEnvelope = buildWarmachineModelHistoryCoverageV2(
  [envelopeStart, envelopeEnd],
  {
    activationUpperBoundBySide: { player1: 1, player2: 1 },
    movementClosureCompleteByPieceKey: { "deferred-runner": true },
  },
);
const closedRunner = closedEnvelope.rows.find((row) => row.pieceKey === "deferred-runner");
assert.equal(closedRunner.reachableEnvelope.totalMovementUpperBoundIn, 12);
assert.equal(closedRunner.reachableEnvelope.hardReachabilityRefuted, true);
assert.equal(closedEnvelope.counts.hardReachabilityRefutedModelCount, 1);

const evidence = {
  schemaVersion: "warmachine_nested_roster_deployment_v2_verification",
  generatedAt: new Date().toISOString(),
  upstreamPool: {
    schemaVersion: pool.schemaVersion,
    contentHash: poolContentHash,
    remoteVersion: pool.source.remoteVersion,
    cryxSourceProposalCount: pool.cryxLists.length,
    faneSourceProposalCount: pool.faneLists.length,
    exactListLegality: pool.quality.exactListLegality,
    exhaustiveAllLists: pool.algorithm.exhaustiveAllLists,
  },
  dedupe: {
    ledgerHash: dedupeLedger.ledgerHash,
    counts: dedupeLedger.counts,
    massLedger: dedupeLedger.massLedger,
  },
  capability: {
    orderingSelectedListKey: orderingLedger.selected[0].list.key,
    exactExcludedListKey: exactBottleneckLedger.terminalProposalExcluded[0].list.key,
    exactMassLedger: exactBottleneckLedger.massLedger,
  },
  nested: {
    searchHash: nested.searchHash,
    counts: nested.counts,
    massLedger: nested.massLedger,
    sampleOpeningKeys: nested.openings.slice(0, 4).map((opening) => opening.openingKey),
  },
  fixedOpening: {
    searchHash: fixed.searchHash,
    openingKey: fixedOpening.openingKey,
    modelCount: fixedOpening.modelCount,
    rosterPointLedgerKey: fixedOpening.rosterPointLedger.ledgerKey,
    provenanceHash: fixedOpening.rosterProvenance.provenanceHash,
  },
  histories: {
    openingHistoryCoverageHash: openingHistory.historyCoverageHash,
    openingCounts: openingHistory.counts,
    strictHistoryCoverageHash: strictHistory.historyCoverageHash,
    strictCounts: strictHistory.counts,
    strictSegmentReceiptHash: segmentReceipt.strictReceiptHash,
    corruptReceiptRejected: unresolvedHistory.segmentRows[0].unresolvedReason,
    openEnvelopeHardRefuted: openRunner.reachableEnvelope.hardReachabilityRefuted,
    closedEnvelopeHardRefuted: closedRunner.reachableEnvelope.hardReachabilityRefuted,
  },
};
fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  upstreamPoolContentHash: poolContentHash,
  dedupeCounts: dedupeLedger.counts,
  capabilityOrderingSelected: orderingLedger.selected[0].list.key,
  nestedCounts: nested.counts,
  nestedMassLedger: nested.massLedger,
  fixedOpening: {
    modelCount: fixedOpening.modelCount,
    pointAccountingComplete: fixedOpening.rosterPointLedger.pointAccountingComplete,
    provenanceComplete: fixedOpening.rosterProvenance.completeForHardPruning,
  },
  historyCounts: openingHistory.counts,
  strictHistoryCounts: strictHistory.counts,
  nestedSearchHash: nested.searchHash,
  strictHistoryHash: strictHistory.historyCoverageHash,
}, null, 2));
