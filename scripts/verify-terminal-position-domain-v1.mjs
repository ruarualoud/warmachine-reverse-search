import assert from "node:assert/strict";

import {
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";
import { buildWarmachineTerminalHypothesisDomainV1 } from
  "../src/reverse/terminal-hypothesis-v1.mjs";
import { generateWarmachineTerminalPositionDomainV1 } from
  "../src/reverse/terminal-position-domain-v1.mjs";
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

const stateTemplate = {
  stateKey: "round-three-position-domain-template",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 3,
  strictMode: true,
  enforceStrictExecutor: true,
  board: { widthIn: 48, heightIn: 48 },
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
    scenarioTerrainSetupChoiceRequired: true,
    scenarioTerrainSetupChoiceResolved: true,
    scenarioTerrainFallbackUsed: true,
    scenarioTerrainSelectionCandidateKeys: [],
    scenarioTerrainSetupOrderIndex: index,
    geometryExactWithinScope: true,
    geometryIssues: [],
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
      objectiveKey: "position-domain-away-50",
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
  rosterReceiptHash: "terminal-position-domain-micro-roster-v1",
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
      relationKind: "later_round_position_domain_required",
      actorToTargetRangeBand: "partitioned_by_generator",
      lineOfSightRelation: "strict_terminal_action_required",
      pathRelation: "reverse_history_unproven",
      baseRelation: "legal_nonoverlap",
      exactCoordinatesKnown: false,
      relationChecks: [{
        relationKey: "finisher-profile-contract",
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

const positionDomain = generateWarmachineTerminalPositionDomainV1(
  stateTemplate,
  relativeDomain.cells,
  {
    profileKey: "terminal-claw",
    targetAnchors: [{
      anchorKey: "round-three-midboard",
      source: "user_constrained",
      targetPosition: { xIn: 24, yIn: 24 },
    }],
    actorAnglesDeg: [0, 90],
    controllerAnglesDeg: [180],
  },
);
assert.equal(positionDomain.ok, true, JSON.stringify(positionDomain));
assert.equal(positionDomain.consideredCount, 8);
assert.equal(positionDomain.proposedCount, 8);
assert.equal(positionDomain.rejectedCount, 0);
assert.equal(positionDomain.deferredCount, 0);
assert.equal(positionDomain.coverageDenominatorComplete, true);
assert.equal(positionDomain.oracleIsolationAudit.sourceStatePositionsRead, false);
assert.deepEqual(new Set(positionDomain.proposals.map((cell) =>
  cell.geometryRelationCell.actorToTargetRangeBand)), new Set([
  "action-range-inner",
  "action-range-boundary",
]));
assert.equal(positionDomain.proposals.every((cell) => {
  const positions = cell.geometryRelationCell.exactCoordinates.piecePositions;
  return Object.keys(positions).length === 3 &&
    positions["p2-leader"].xIn === 24 && positions["p2-leader"].yIn === 24 &&
    Object.values(positions).every((position) => position.xIn !== 1 || position.yIn !== 1);
}), true);

const terminalAction = {
  actionType: "melee_attack",
  actorPieceKey: "p1-finisher",
  targetPieceKey: "p2-leader",
  actionPatch: { strictRollOutcome: { attackDice: [6, 6], damageDice: [6, 6] } },
};
const materialized = materializeWarmachineTerminalSpatialCellsV1(
  stateTemplate,
  positionDomain.proposals,
  { terminalAction },
);
assert.equal(materialized.strictMaterializedCount, 8, JSON.stringify(materialized));
assert.equal(materialized.rejectedCount, 0, JSON.stringify(materialized));
assert.equal(materialized.runtimeRoots.every((root) => root.roundNumber === 3), true);
assert.equal(materialized.runtimeRoots.every((root) =>
  root.relationEvidence.length === 2 &&
  root.relationEvidence.every((evidence) => evidence.passed)), true);
assert.equal(materialized.runtimeRoots.some((root) => root.relationEvidence.some((evidence) =>
  evidence.relationKey === "generated-leader-control:control-boundary" &&
  evidence.minimumDistanceIn === 10.8 && evidence.maximumDistanceIn === 12)), true);

const formationStateTemplate = structuredClone(stateTemplate);
formationStateTemplate.stateKey = "round-three-unit-aware-position-domain-template";
formationStateTemplate.pieces.push(
  ...["a", "b", "c", "d", "e", "f"].map((suffix) =>
    model(`p1-screen-${suffix}`, "player1", {
      unitGroupId: "p1-screen-unit",
      modelRole: "unit",
      modelType: "trooper unit model",
    })),
  model("p1-support-beast", "player1", {
    modelRole: "warbeast",
    modelType: "warbeast",
    isWarbeast: true,
    controllerPieceKey: "p1-leader",
    baseSizeIn: 1.97,
  }),
  ...["a", "b", "c", "d"].map((suffix) =>
    model(`p2-screen-${suffix}`, "player2", {
      unitGroupId: "p2-screen-unit",
      modelRole: "unit",
      modelType: "trooper unit model",
    })),
);
const formationDomain = generateWarmachineTerminalPositionDomainV1(
  formationStateTemplate,
  relativeDomain.cells,
  {
    profileKey: "terminal-claw",
    targetAnchors: [{
      anchorKey: "round-three-unit-aware-midboard",
      source: "user_constrained",
      targetPosition: { xIn: 24, yIn: 24 },
    }],
    actorAnglesDeg: [0],
    controllerAnglesDeg: [180],
    actionRangeBands: [{
      bandKey: "action-range-inner",
      minimumFraction: 0.2,
      maximumFraction: 0.6,
      placementFraction: 0.5,
    }],
    controlRangeBands: [{
      bandKey: "control-inner",
      minimumFraction: 0,
      maximumFraction: 0.6,
      placementFraction: 0.45,
    }],
    remainingPlacementModes: ["coherent_engagement_layers"],
    maximumProposals: 1,
  },
);
assert.equal(formationDomain.proposedCount, 1, JSON.stringify(formationDomain));
const formationCell = formationDomain.proposals[0];
const formationEvidence = formationCell.geometryRelationCell.generationEvidence
  .remainingPlacementEvidence;
assert.equal(formationEvidence.everyLivePieceAssigned, true);
assert.equal(formationEvidence.deploymentCoordinatesRead, false);
assert.equal(formationEvidence.strictHistoryReachabilityProven, false);
assert.equal(formationEvidence.unitFormationAudit.length, 2);
assert.equal(formationEvidence.unitFormationAudit.every((audit) =>
  audit.everyMemberWithinTwoInchesOfAnchor === true &&
      audit.lineOfSightBetweenMembersProven === false), true);
assert.equal(formationEvidence.unitFormationRulesAudit.ok, true);
assert.equal(formationEvidence.unitFormationRulesAudit.formations.every((formation) =>
  formation.memberAudits.every((audit) =>
    audit.distancePassed === true && audit.lineOfSightPassed === true)), true);
assert.equal(formationEvidence.controlRelationAudit.some((audit) =>
  audit.pieceKey === "p1-support-beast" &&
  audit.controllerPieceKey === "p1-leader" &&
  audit.insideConservativeControlRange === true), true);
const formationState = structuredClone(formationStateTemplate);
for (const piece of formationState.pieces) {
  piece.position = formationCell.geometryRelationCell.exactCoordinates
    .piecePositions[piece.pieceKey];
}
const formationPlacementAudit = auditRulesV1StaticPlacement(formationState);
assert.equal(formationPlacementAudit.ok, true, JSON.stringify(formationPlacementAudit));
const anchorPieceKeyByUnitGroupKey = Object.fromEntries(
  formationEvidence.unitFormationAudit.map((audit) => [
    audit.unitGroupKey,
    audit.anchorPieceKey,
  ]),
);
const formationRulesAudit = auditRulesV1StaticUnitFormation(formationState, {
  anchorPieceKeyByUnitGroupKey,
});
assert.equal(formationRulesAudit.ok, true, JSON.stringify(formationRulesAudit));
const brokenFormationState = structuredClone(formationState);
brokenFormationState.pieces.find((piece) => piece.pieceKey === "p1-screen-f").position = {
  xIn: 42,
  yIn: 38,
};
const brokenFormationAudit = auditRulesV1StaticUnitFormation(brokenFormationState, {
  anchorPieceKeyByUnitGroupKey,
});
assert.equal(brokenFormationAudit.ok, false);
assert.equal(brokenFormationAudit.issues.some((issue) =>
  issue.code === "STATIC_UNIT_FORMATION_COHERENCY_BROKEN_V1" &&
  issue.pieceKey === "p1-screen-f"), true);

const bounded = generateWarmachineTerminalPositionDomainV1(
  stateTemplate,
  relativeDomain.cells,
  {
    profileKey: "terminal-claw",
    targetAnchors: [{
      anchorKey: "round-three-midboard",
      targetPosition: { xIn: 24, yIn: 24 },
    }],
    actorAnglesDeg: [0, 90],
    controllerAnglesDeg: [180],
    maximumProposals: 2,
  },
);
assert.equal(bounded.consideredCount, 8);
assert.equal(bounded.proposedCount, 2);
assert.equal(bounded.deferredCount, 6);
assert.equal(bounded.coverageDenominatorComplete, false);
assert.equal(bounded.deferred.every((row) =>
  row.reason === "terminal_position_proposal_budget_exhausted"), true);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_terminal_position_domain_v1",
  parentCellCount: positionDomain.parentCellCount,
  consideredCount: positionDomain.consideredCount,
  proposedCount: positionDomain.proposedCount,
  strictMaterializedCount: materialized.strictMaterializedCount,
  actionBands: positionDomain.generationDomain.actionBands.map((band) => band.bandKey),
  controlBands: positionDomain.generationDomain.controlBands.map((band) => band.bandKey),
  unitAwareModelCount: formationStateTemplate.pieces.length,
  unitFormationCount: formationEvidence.unitFormationAudit.length,
  controlAwarePieceCount: formationEvidence.controlRelationAudit.length,
  boundedDeferredCount: bounded.deferredCount,
  reportHash: positionDomain.reportHash,
}, null, 2));
