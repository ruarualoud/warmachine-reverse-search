import assert from "node:assert/strict";

import { warmachineHost } from "../src/warmachine-host-runtime.mjs";
import { buildWarmachineTerminalHypothesisDomainV1 } from
  "../src/reverse/terminal-hypothesis-v1.mjs";
import { materializeWarmachineTerminalSpatialCellsV1 } from
  "../src/reverse/terminal-spatial-materializer-v1.mjs";

function model(pieceKey, sideKey, overrides = {}) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey,
    modelRole: "warrior",
    modelType: "warrior model",
    position: { xIn: 1, yIn: 1 },
    baseSizeIn: 1.18,
    speedIn: 6,
    defense: 12,
    armor: 16,
    damage: { boxesRemaining: 5, maxBoxes: 5 },
    statusTags: [],
    attackProfiles: [],
    cardSnapshot: { id: `card-${pieceKey}`, pointCostNumber: 0 },
    ...overrides,
  };
}

const template = {
  stateKey: "round-three-terminal-spatial-template",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 3,
  strictMode: true,
  enforceStrictExecutor: true,
  board: { widthIn: 48, heightIn: 48 },
  deploymentBackEdgeBySide: { player1: "south", player2: "north" },
  pieces: [
    model("p1-leader", "player1", {
      modelRole: "warlock",
      modelType: "warlock",
      isWarlock: true,
      controlRangeIn: 12,
    }),
    model("p1-finisher", "player1", {
      modelRole: "warbeast",
      modelType: "warbeast",
      isWarbeast: true,
      controllerPieceKey: "p1-leader",
      attackProfiles: [{
        profileKey: "terminal-claw",
        name: "Terminal Claw",
        mode: "melee",
        rangeIn: 2,
        power: 24,
        attackStat: 8,
        attackStatKind: "MAT",
      }],
    }),
    model("p2-leader", "player2", {
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
    geometryExactWithinScope: true,
    geometryIssues: [],
    scenarioTerrainSetupChoiceRequired: true,
    scenarioTerrainSetupChoiceResolved: true,
    scenarioTerrainFallbackUsed: true,
    scenarioTerrainSelectionCandidateKeys: [],
    scenarioTerrainSetupOrderIndex: index,
  })),
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
      objectiveKey: "assassination-away-50",
      baseSizeMm: 50,
      xIn: 24,
      yIn: 40,
    }],
    caches: [],
  },
};

function domainForCoordinates(piecePositions) {
  return buildWarmachineTerminalHypothesisDomainV1({
    scenarioKey: "pressure-point",
    scenarioPacketKey: "steamroller-2026",
    scenarioPacketYear: "2026",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    rosterReceiptHash: "terminal-spatial-materializer-micro-roster-v1",
    specs: [{
      goalType: "assassination",
      roundNumbers: [3],
      winnerSideKeys: ["player1"],
      loserSideKeys: ["player2"],
      endingSideKeys: ["player1"],
      causalActionFamilies: ["strict_melee_chain"],
      actorPieceKeys: ["p1-finisher"],
      targetLeaderPieceKeys: ["p2-leader"],
      targetBoxesBeforeFinal: [1],
      resourceEnvelopeKeys: ["no_resource_payment"],
      geometryRelationCells: [{
        relationKind: "round_three_terminal_attack_position",
        actorToTargetRangeBand: "terminal_claw_melee_range",
        lineOfSightRelation: "strict_los_required",
        pathRelation: "no_movement_in_terminal_step",
        baseRelation: "legal_nonoverlap",
        exactCoordinatesKnown: true,
        exactCoordinates: { piecePositions },
        relationChecks: [{
          relationKey: "warbeast-in-leader-control",
          relationKind: "leader_control_range",
          sourcePieceKey: "p1-leader",
          targetPieceKey: "p1-finisher",
        }, {
          relationKey: "finisher-in-terminal-melee-range",
          relationKind: "attack_profile_range",
          sourcePieceKey: "p1-finisher",
          targetPieceKey: "p2-leader",
          profileKey: "terminal-claw",
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
}

const exactDomain = domainForCoordinates({
  "p1-leader": { xIn: 16, yIn: 24 },
  "p1-finisher": { xIn: 20, yIn: 24 },
  "p2-leader": { xIn: 21.3, yIn: 24 },
});
const terminalAction = {
  actionType: "melee_attack",
  actorPieceKey: "p1-finisher",
  targetPieceKey: "p2-leader",
  actionPatch: { strictRollOutcome: { attackDice: [6, 6], damageDice: [6, 6] } },
};
const materialized = materializeWarmachineTerminalSpatialCellsV1(
  template,
  exactDomain.cells,
  { terminalAction },
);
assert.equal(materialized.ok, true, JSON.stringify(materialized));
assert.equal(materialized.strictMaterializedCount, 1);
assert.equal(materialized.rejectedCount, 0);
assert.equal(materialized.strictRejectedCount, 0);
assert.equal(materialized.proposalFilteredCount, 0);
assert.equal(materialized.inputInvalidCount, 0);
assert.equal(materialized.deferredCount, 0);
assert.equal(materialized.rulesAuthorityAudit.strictRulesAuthority,
  "project_d_rules_v1_host");
assert.equal(materialized.rulesAuthorityAudit.candidatePreflightCanStrictReject, false);
assert.equal(materialized.runtimeRoots[0].roundNumber, 3);
assert.equal(materialized.runtimeRoots[0].preTerminalState.pieces.find((piece) =>
  piece.pieceKey === "p1-leader").position.xIn, 16);
assert.equal(materialized.runtimeRoots[0].terminalState.turnNumber, 3);
assert.equal(materialized.runtimeRoots[0].strictWitness.strictWitness, true);
assert.equal(materialized.runtimeRoots[0].relationEvidence.every((row) => row.passed), true);
assert.equal(materialized.runtimeRoots[0].trainingTruth, false);

const firstPlayerOneSettlement = materializeWarmachineTerminalSpatialCellsV1(
  { ...structuredClone(template), firstPlayerSideKey: "player1" },
  exactDomain.cells,
  {
    terminalAction,
    priorTurnSettlementSeed: {
      endingSideKey: "player2",
      scoreBefore: { player1: 0, player2: 0 },
      scoringHistoryBefore: [],
    },
  },
);
assert.equal(firstPlayerOneSettlement.strictMaterializedCount, 1,
  JSON.stringify(firstPlayerOneSettlement));
const firstPlayerOneEvidence = firstPlayerOneSettlement.runtimeRoots[0]
  .preTerminalAssumptions.priorTurnSettlement;
assert.equal(firstPlayerOneEvidence.firstPlayerSideKey, "player1");
assert.equal(firstPlayerOneEvidence.completedRound, true);
assert.equal(firstPlayerOneEvidence.endingTurnNumber, 2);
assert.equal(firstPlayerOneEvidence.nextTurnNumber, 3);

const firstPlayerTwoTemplate = structuredClone(template);
firstPlayerTwoTemplate.firstPlayerSideKey = "player2";
firstPlayerTwoTemplate.scenario.attackerSideKey = "player2";
firstPlayerTwoTemplate.scenario.defenderSideKey = "player1";
firstPlayerTwoTemplate.scenario.scoringStartSideKey = "player1";
const firstPlayerTwoSettlement = materializeWarmachineTerminalSpatialCellsV1(
  firstPlayerTwoTemplate,
  exactDomain.cells,
  {
    terminalAction,
    priorTurnSettlementSeed: {
      endingSideKey: "player2",
      scoreBefore: { player1: 0, player2: 0 },
      scoringHistoryBefore: [],
    },
  },
);
assert.equal(firstPlayerTwoSettlement.strictMaterializedCount, 1,
  JSON.stringify(firstPlayerTwoSettlement));
const firstPlayerTwoEvidence = firstPlayerTwoSettlement.runtimeRoots[0]
  .preTerminalAssumptions.priorTurnSettlement;
assert.equal(firstPlayerTwoEvidence.firstPlayerSideKey, "player2");
assert.equal(firstPlayerTwoEvidence.completedRound, false);
assert.equal(firstPlayerTwoEvidence.endingTurnNumber, 3);
assert.equal(firstPlayerTwoEvidence.nextTurnNumber, 3);

const outsideControl = domainForCoordinates({
  "p1-leader": { xIn: 5, yIn: 24 },
  "p1-finisher": { xIn: 30, yIn: 24 },
  "p2-leader": { xIn: 31.3, yIn: 24 },
});
const outsideControlResult = materializeWarmachineTerminalSpatialCellsV1(
  template,
  outsideControl.cells,
  { terminalAction },
);
assert.equal(outsideControlResult.ok, false);
assert.equal(outsideControlResult.rejected[0].reason,
  "terminal_spatial_proposal_relation_rejected");
assert.equal(outsideControlResult.rejected[0].disposition, "proposal_filtered");
assert.equal(outsideControlResult.rejected[0].strictRulesConclusion, false);
assert.equal(outsideControlResult.rejected[0].hostReplayAttempted, true);
assert.equal(outsideControlResult.rejected[0].hostReplayAccepted, true);
assert.equal(outsideControlResult.strictRejectedCount, 0);
assert.equal(outsideControlResult.proposalFilteredCount, 1);
assert.ok(outsideControlResult.rejected[0].issues.some((issue) =>
  issue.reason === "terminal_spatial_relation_not_satisfied"));

const overlap = domainForCoordinates({
  "p1-leader": { xIn: 16, yIn: 24 },
  "p1-finisher": { xIn: 20, yIn: 24 },
  "p2-leader": { xIn: 20.5, yIn: 24 },
});
const overlapResult = materializeWarmachineTerminalSpatialCellsV1(
  template,
  overlap.cells,
  { terminalAction },
);
assert.equal(overlapResult.ok, false);
assert.equal(overlapResult.rejected[0].disposition, "strict_rejected");
assert.equal(overlapResult.rejected[0].authority, "rules_v1_host");
assert.equal(overlapResult.strictRejectedCount, 1);
assert.ok(overlapResult.rejected[0].issues.some((issue) =>
  issue.reason === "terminal_spatial_base_overlap"));

const blockingTerrainTemplate = structuredClone(template);
blockingTerrainTemplate.terrain.push({
  terrainKey: "terminal-position-blocking-obstruction",
  type: "obstruction",
  isObstruction: true,
  blocksMovement: true,
  blocksLineOfSight: true,
  xIn: 16,
  yIn: 24,
  widthIn: 2,
  heightIn: 2,
  exactWithinScope: true,
});
const blockingTerrainResult = materializeWarmachineTerminalSpatialCellsV1(
  blockingTerrainTemplate,
  exactDomain.cells,
  { terminalAction },
);
assert.equal(blockingTerrainResult.ok, false);
assert.equal(blockingTerrainResult.rejected[0].disposition, "strict_rejected");
assert.equal(blockingTerrainResult.rejected[0].authority, "rules_v1_host");
assert.ok(blockingTerrainResult.rejected[0].issues.some((issue) =>
  issue.code === "STATIC_PLACEMENT_BASE_OVERLAPS_BLOCKING_TERRAIN_V1" &&
  issue.pieceKey === "p1-leader"));

const relativeOnly = structuredClone(exactDomain.cells[0]);
relativeOnly.cellKey = `${relativeOnly.cellKey}-relative-only`;
relativeOnly.geometryRelationCell.exactCoordinatesKnown = false;
relativeOnly.geometryRelationCell.exactCoordinates = null;
relativeOnly.geometryRelationCell.materializationRequired = true;
const relativeOnlyResult = materializeWarmachineTerminalSpatialCellsV1(
  template,
  relativeOnly,
  { terminalAction },
);
assert.equal(relativeOnlyResult.ok, false);
assert.equal(relativeOnlyResult.rejected[0].reason,
  "terminal_spatial_exact_coordinate_cell_required");
assert.equal(relativeOnlyResult.rejected[0].disposition, "input_invalid");
assert.equal(relativeOnlyResult.rejected[0].strictRulesConclusion, false);
assert.equal(relativeOnlyResult.inputInvalidCount, 1);

const bounded = materializeWarmachineTerminalSpatialCellsV1(
  template,
  [exactDomain.cells[0], { ...exactDomain.cells[0], cellKey: "second-position-cell" }],
  { terminalAction, maximumCells: 1 },
);
assert.equal(bounded.strictMaterializedCount, 1);
assert.equal(bounded.deferredCount, 1);
assert.equal(bounded.deferred[0].reason,
  "terminal_spatial_materialization_budget_exhausted");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_terminal_spatial_materializer_v1",
  strictMaterializedCount: materialized.strictMaterializedCount,
  roundNumber: materialized.runtimeRoots[0].roundNumber,
  positions: materialized.runtimeRoots[0].exactCoordinates,
  relationEvidence: materialized.runtimeRoots[0].relationEvidence,
  priorTurnSettlementRoleCases: {
    firstPlayerOne: firstPlayerOneEvidence,
    firstPlayerTwo: firstPlayerTwoEvidence,
  },
  outsideControlRejected: true,
  outsideControlDisposition: outsideControlResult.rejected[0].disposition,
  overlapRejected: true,
  overlapDisposition: overlapResult.rejected[0].disposition,
  blockingTerrainRejected: true,
  blockingTerrainDisposition: blockingTerrainResult.rejected[0].disposition,
  relativeOnlyRejected: true,
  relativeOnlyDisposition: relativeOnlyResult.rejected[0].disposition,
  boundedDeferredCount: bounded.deferredCount,
  reportHash: materialized.reportHash,
}, null, 2));
