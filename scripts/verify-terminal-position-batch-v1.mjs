import assert from "node:assert/strict";

import { warmachineHost } from "../src/warmachine-host-runtime.mjs";
import { buildWarmachineTerminalHypothesisDomainV1 } from
  "../src/reverse/terminal-hypothesis-v1.mjs";
import { runWarmachineTerminalPositionBatchV1 } from
  "../src/reverse/terminal-position-batch-v1.mjs";

function piece(pieceKey, sideKey, overrides = {}) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey,
    modelRole: "warrior",
    modelType: "warrior model",
    position: { xIn: 2, yIn: 2 },
    baseSizeIn: 1.18,
    speedIn: 6,
    defense: 12,
    armor: 16,
    damage: { boxesRemaining: 5, maxBoxes: 5 },
    statusTags: [],
    attackProfiles: [],
    activated: true,
    cardSnapshot: { id: `card-${pieceKey}`, pointCostNumber: 0 },
    ...overrides,
  };
}

const stateTemplate = {
  stateKey: "position-batch-round-three-template",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 3,
  strictMode: true,
  enforceStrictExecutor: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    piece("p1-finisher", "player1", {
      modelRole: "warcaster",
      modelType: "warcaster",
      isWarcaster: true,
      controlRangeIn: 12,
      activated: false,
      attackProfiles: [{
        profileKey: "terminal-blade",
        name: "Terminal Blade",
        mode: "melee",
        rangeIn: 2,
        power: 24,
        attackStat: 8,
        attackStatKind: "MAT",
      }],
    }),
    piece("p1-helper", "player1"),
    piece("p2-target", "player2", {
      modelRole: "warcaster",
      modelType: "warcaster",
      isWarcaster: true,
      damage: { boxesRemaining: 1, maxBoxes: 1 },
    }),
  ],
  terrain: [[8, 34], [16, 36], [32, 12], [40, 14]].map(([xIn, yIn], index) => ({
    terrainKey: `pressure-${index}`,
    type: "scenario terrain",
    isScenarioTerrain: true,
    xIn,
    yIn,
    widthIn: 2,
    heightIn: 2,
    ownerSideKey: "",
    sourceFlagKey: `pressure-${index}`,
    sourceFlagPosition: { xIn, yIn },
    scenarioTerrainSetupChoiceRequired: true,
    scenarioTerrainSetupChoiceResolved: true,
    scenarioTerrainFallbackUsed: true,
    scenarioTerrainSelectionCandidateKeys: [],
    scenarioTerrainSetupOrderIndex: index,
    geometryExactWithinScope: true,
    geometryIssues: [],
  })),
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
    objectives: [{
      objectiveKey: "position-batch-away-50",
      baseSizeMm: 50,
      xIn: 24,
      yIn: 40,
    }],
    caches: [],
  },
};

const relativeDomain = buildWarmachineTerminalHypothesisDomainV1({
  scenarioKey: "pressure-point",
  scenarioPacketKey: "steamroller-2026",
  scenarioPacketYear: "2026",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  rosterReceiptHash: "terminal-position-batch-micro-roster-v1",
  specs: [{
    goalType: "assassination",
    roundNumbers: [3],
    winnerSideKeys: ["player1"],
    loserSideKeys: ["player2"],
    endingSideKeys: ["player1"],
    causalActionFamilies: ["strict_melee_chain"],
    actorPieceKeys: ["p1-finisher"],
    targetLeaderPieceKeys: ["p2-target"],
    targetBoxesBeforeFinal: [1],
    resourceEnvelopeKeys: ["no_resource_payment"],
    geometryRelationCells: [{
      relationKind: "position_batch_required",
      exactCoordinatesKnown: false,
      relationChecks: [{
        relationKey: "terminal-profile",
        relationKind: "attack_profile_range",
        sourcePieceKey: "p1-finisher",
        targetPieceKey: "p2-target",
        profileKey: "terminal-blade",
      }],
    }],
    assumptionSources: {
      goalType: "user_constrained",
      roundNumber: "user_constrained",
      winnerSideKey: "user_constrained",
      loserSideKey: "rule_derived",
      endingSideKey: "user_constrained",
      causalActionFamily: "optimistic_proposal",
      actorPieceKey: "optimistic_proposal",
      targetLeaderPieceKey: "user_constrained",
      targetBoxesBeforeFinal: "optimistic_proposal",
      resourceEnvelopeKey: "rule_derived",
      geometryRelationCell: "optimistic_proposal",
    },
  }],
});

const terminalAction = {
  actionType: "melee_attack",
  actorPieceKey: "p1-finisher",
  targetPieceKey: "p2-target",
  actionPatch: { strictRollOutcome: { attackDice: [6, 6], damageDice: [6, 6] } },
};
const batch = runWarmachineTerminalPositionBatchV1(
  stateTemplate,
  relativeDomain.cells,
  {
    terminalAction,
    maximumSearches: 1,
    positionDomainOptions: {
      profileKey: "terminal-blade",
      targetAnchors: [{
        anchorKey: "round-three-midboard",
        targetPosition: { xIn: 24, yIn: 24 },
      }],
      actionRangeBands: [{
        bandKey: "action-range-inner",
        minimumFraction: 0.2,
        maximumFraction: 0.6,
        placementFraction: 0.5,
      }],
      controlRangeBands: [{
        bandKey: "self-controlled-leader",
        minimumFraction: 0,
        maximumFraction: 1,
        placementFraction: 0,
      }],
      actorAnglesDeg: [0, 90],
      controllerAnglesDeg: [180],
    },
    reverseSearchOptions: {
      maximumReverseTurns: 0,
      maximumRouteLabels: 32,
      maximumUniqueStates: 32,
      maximumActivationDepth: 3,
      maximumActivationLabels: 32,
      maximumActivationUniqueStates: 32,
      stopAfterActivationBoundaryRouteCount: 2,
      includeMovement: false,
      includePass: true,
      nextSideActivationRestoreModes: ["all_alive_activated"],
    },
  },
);

assert.equal(batch.positionConsideredCount, 2);
assert.equal(batch.positionProposedCount, 2);
assert.equal(batch.strictMaterializedCount, 2, JSON.stringify(batch.materialization));
assert.equal(batch.reverseSearchedCount, 1);
assert.equal(batch.reverseSearchDeferredCount, 1);
assert.equal(batch.proposedAccountedCount, 2);
assert.equal(batch.proposedDenominatorComplete, true);
assert.equal(batch.fullGenerationAndSearchDenominatorComplete, false);
assert.equal(batch.dispositionLedger.filter((row) => row.reverseSearched).length, 1);
assert.equal(batch.dispositionLedger.filter((row) =>
  row.disposition === "reverse_search_budget_deferred").length, 1);
assert.equal(batch.oracleIsolationAudit.searchStartsFromStrictMaterializedLaterRoundRoot, true);
assert.equal(batch.oracleIsolationAudit.deploymentUsedOnlyAsReverseEndpointAudit, true);
assert.equal(batch.runtimeSearches.length, 1);
assert.equal(batch.runtimeSearches[0].root.roundNumber, 3);
assert.equal(batch.runtimeSearches[0].search.terminalCellKey,
  batch.runtimeSearches[0].cell.cellKey);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_terminal_position_batch_v1",
  positionProposedCount: batch.positionProposedCount,
  strictMaterializedCount: batch.strictMaterializedCount,
  reverseSearchedCount: batch.reverseSearchedCount,
  reverseSearchDeferredCount: batch.reverseSearchDeferredCount,
  legalDeploymentPositionCount: batch.legalDeploymentPositionCount,
  proposedDenominatorComplete: batch.proposedDenominatorComplete,
  reportHash: batch.reportHash,
}, null, 2));
