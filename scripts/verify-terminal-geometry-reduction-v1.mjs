import assert from "node:assert/strict";

import { buildWarmachineFixedTerminalScorePositionCorpusV1 } from
  "../src/benchmark/fixed-terminal-score-position-corpus-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";
import {
  materializeWarmachineTerminalGeometryReducedV1,
} from "../src/reverse/terminal-geometry-reduction-v1.mjs";
import { buildWarmachineTerminalHypothesisDomainV1 } from
  "../src/reverse/terminal-hypothesis-v1.mjs";

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

function assassinationCell({
  scenarioKey,
  rosterReceiptHash,
  actorPieceKey,
  targetPieceKey,
  profileKey,
  positions,
  causalActionFamily,
}) {
  const domain = buildWarmachineTerminalHypothesisDomainV1({
    scenarioKey,
    scenarioPacketKey: "steamroller-2026",
    scenarioPacketYear: "2026",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    rosterReceiptHash,
    specs: [{
      goalType: "assassination",
      roundNumbers: [3],
      winnerSideKeys: ["player1"],
      loserSideKeys: ["player2"],
      endingSideKeys: ["player1"],
      causalActionFamilies: [causalActionFamily],
      actorPieceKeys: [actorPieceKey],
      targetLeaderPieceKeys: [targetPieceKey],
      targetBoxesBeforeFinal: [1],
      resourceEnvelopeKeys: ["no_resource_payment"],
      geometryRelationCells: [{
        relationKind: "ticket18_exact_terminal_geometry",
        actorToTargetRangeBand: "strict_profile_range",
        lineOfSightRelation: "strict_host_required",
        pathRelation: "no_movement_in_terminal_step",
        baseRelation: "legal_nonoverlap",
        exactCoordinatesKnown: true,
        exactCoordinates: { piecePositions: positions },
        relationChecks: [{
          relationKey: `ticket18-profile-${profileKey}`,
          relationKind: "attack_profile_range",
          sourcePieceKey: actorPieceKey,
          targetPieceKey,
          profileKey,
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
  return domain.cells[0];
}

function alias(cell, suffix) {
  return { ...structuredClone(cell), cellKey: `${cell.cellKey}:${suffix}` };
}

function ledgerByCell(result) {
  return new Map(result.dispositionLedger.map((row) => [row.cellKey, row]));
}

function assertFullFoldedParity(name, full, folded, cells) {
  assert.equal(full.ok, true, `${name}: ${JSON.stringify(full)}`);
  assert.equal(folded.ok, true, `${name}: ${JSON.stringify(folded)}`);
  assert.equal(full.enumerationComplete, true);
  assert.equal(folded.enumerationComplete, true);
  assert.equal(full.probabilityClosureEligible, true);
  assert.equal(folded.probabilityClosureEligible, true);
  const fullByCell = ledgerByCell(full);
  const foldedByCell = ledgerByCell(folded);
  for (const cell of cells) {
    assert.equal(foldedByCell.get(cell.cellKey)?.disposition,
      fullByCell.get(cell.cellKey)?.disposition, `${name}:${cell.cellKey}:disposition`);
    assert.equal(foldedByCell.get(cell.cellKey)?.rulesOutcomeHash,
      fullByCell.get(cell.cellKey)?.rulesOutcomeHash,
      `${name}:${cell.cellKey}:rules-outcome`);
    assert.equal(foldedByCell.get(cell.cellKey)?.terminalSemanticStateHash,
      fullByCell.get(cell.cellKey)?.terminalSemanticStateHash,
      `${name}:${cell.cellKey}:terminal-state`);
  }
  assert.ok(folded.hostCalls.materialization < full.hostCalls.materialization, name);
  assert.ok(folded.measurements.strictReplayReductionRatio < 1, name);
}

const baseScenario = {
  packetKey: "steamroller-2026",
  packetYear: "2026",
  scenarioName: "Pressure Point",
  attackerSideKey: "player1",
  defenderSideKey: "player2",
  scoringStartSideKey: "player2",
  scoringStartTurnNumber: 2,
  score: { player1: 0, player2: 0 },
  objectives: [{
    objectiveKey: "ticket18-pressure-point-50",
    baseSizeMm: 50,
    xIn: 24,
    yIn: 40,
  }],
  caches: [],
};

const pressurePointTerrain = [[8, 34], [16, 36], [32, 12], [40, 14]]
  .map(([xIn, yIn], index) => ({
    terrainKey: `ticket18-pressure-${index}`,
    type: "scenario terrain",
    isScenarioTerrain: true,
    xIn,
    yIn,
    widthIn: 2,
    heightIn: 2,
    ownerSideKey: "",
    sourceFlagKey: `ticket18-pressure-${index}`,
    sourceFlagPosition: { xIn, yIn },
    scenarioTerrainSetupChoiceRequired: true,
    scenarioTerrainSetupChoiceResolved: true,
    scenarioTerrainFallbackUsed: true,
    scenarioTerrainSelectionCandidateKeys: [],
    scenarioTerrainSetupOrderIndex: index,
    geometryExactWithinScope: true,
    geometryIssues: [],
  }));

const meleeTemplate = {
  stateKey: "ticket18-open-melee-template",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 3,
  strictMode: true,
  enforceStrictExecutor: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    model("melee-attacker", "player1", {
      modelRole: "warcaster",
      modelType: "warcaster",
      isWarcaster: true,
      controlRangeIn: 12,
      attackProfiles: [{
        profileKey: "ticket18-blade",
        name: "Ticket 18 Blade",
        mode: "melee",
        rangeIn: 2,
        power: 24,
        attackStat: 8,
        attackStatKind: "MAT",
      }],
    }),
    model("melee-target", "player2", {
      modelRole: "warcaster",
      modelType: "warcaster",
      isWarcaster: true,
      damage: { boxesRemaining: 1, maxBoxes: 1 },
    }),
  ],
  terrain: pressurePointTerrain,
  scenario: baseScenario,
};
const meleeA = assassinationCell({
  scenarioKey: "pressure-point",
  rosterReceiptHash: "ticket18-open-melee-v1",
  actorPieceKey: "melee-attacker",
  targetPieceKey: "melee-target",
  profileKey: "ticket18-blade",
  causalActionFamily: "strict_melee_attack",
  positions: {
    "melee-attacker": { xIn: 20, yIn: 20 },
    "melee-target": { xIn: 21.3, yIn: 20 },
  },
});
const meleeB = assassinationCell({
  scenarioKey: "pressure-point",
  rosterReceiptHash: "ticket18-open-melee-v1",
  actorPieceKey: "melee-attacker",
  targetPieceKey: "melee-target",
  profileKey: "ticket18-blade",
  causalActionFamily: "strict_melee_attack",
  positions: {
    "melee-attacker": { xIn: 28, yIn: 26 },
    "melee-target": { xIn: 28, yIn: 27.3 },
  },
});
const meleeOverlap = alias(meleeA, "host-static-overlap");
meleeOverlap.geometryRelationCell.exactCoordinates.piecePositions["melee-target"] = {
  xIn: 20.2,
  yIn: 20,
};
const meleeCells = [
  meleeA,
  alias(meleeA, "duplicate"),
  meleeB,
  alias(meleeB, "duplicate"),
  meleeOverlap,
];
const meleeOptions = {
  terminalAction: {
    actionType: "melee_attack",
    actorPieceKey: "melee-attacker",
    targetPieceKey: "melee-target",
    actionPatch: { strictRollOutcome: { attackDice: [6, 6], damageDice: [6, 6] } },
  },
  completionMode: "complete_probability",
};
const meleeFull = materializeWarmachineTerminalGeometryReducedV1(
  meleeTemplate,
  meleeCells,
  { ...meleeOptions, foldEquivalentCandidates: false },
);
const meleeFolded = materializeWarmachineTerminalGeometryReducedV1(
  meleeTemplate,
  meleeCells,
  { ...meleeOptions, foldEquivalentCandidates: true },
);
assertFullFoldedParity("open-melee", meleeFull, meleeFolded, meleeCells);
assert.equal(meleeFolded.necessaryConditionExcludedCount, 1);
assert.equal(meleeFolded.necessaryConditionExclusions[0].authority,
  "rules_v1_host");
assert.ok(meleeFolded.necessaryConditionExclusions[0].inputHash);
assert.ok(meleeFolded.necessaryConditionExclusions[0].auditEvidenceHash);
assert.ok(meleeFolded.necessaryConditionExclusions[0].exclusionHash);
assert.equal(meleeFolded.strictWitnessFound, true, JSON.stringify({
  dispositions: meleeFolded.dispositionLedger,
  groups: meleeFolded.groups,
  rejected: meleeFolded.runtimeGroups.map((group) => group.runtimeResult.rejected),
}));

const existence = materializeWarmachineTerminalGeometryReducedV1(
  meleeTemplate,
  meleeCells,
  { ...meleeOptions, completionMode: "existence", foldEquivalentCandidates: true },
);
assert.equal(existence.strictWitnessFound, true, JSON.stringify({
  dispositions: existence.dispositionLedger,
  groups: existence.groups,
}));
assert.ok(existence.unenumeratedCandidateCount > 0, JSON.stringify(existence));
assert.equal(existence.enumerationComplete, false);
assert.equal(existence.probabilityClosureEligible, false);
assert.deepEqual(existence.unresolvedValueInterval, [0, 1]);
assert.equal(existence.unenumerated.every((row) =>
  row.disposition === "unenumerated" && row.enumerated === false), true);

const rangedTemplate = {
  ...structuredClone(meleeTemplate),
  stateKey: "ticket18-obstruction-ranged-template",
  pieces: [
    model("ranged-attacker", "player1", {
      modelRole: "warcaster",
      modelType: "warcaster",
      isWarcaster: true,
      controlRangeIn: 12,
      attackProfiles: [{
        profileKey: "ticket18-rifle",
        name: "Ticket 18 Rifle",
        mode: "ranged",
        rangeIn: 14,
        power: 24,
        attackStat: 8,
        attackStatKind: "RAT",
      }],
    }),
    model("ranged-target", "player2", {
      modelRole: "warcaster",
      modelType: "warcaster",
      isWarcaster: true,
      damage: { boxesRemaining: 1, maxBoxes: 1 },
    }),
  ],
  terrain: [...pressurePointTerrain, {
    terrainKey: "ticket18-central-obstruction",
    type: "obstruction",
    isObstruction: true,
    blocksMovement: true,
    blocksLineOfSight: true,
    xIn: 24,
    yIn: 24,
    widthIn: 2,
    heightIn: 4,
    geometryExactWithinScope: true,
  }],
};
const rangedClear = assassinationCell({
  scenarioKey: "pressure-point",
  rosterReceiptHash: "ticket18-obstruction-ranged-v1",
  actorPieceKey: "ranged-attacker",
  targetPieceKey: "ranged-target",
  profileKey: "ticket18-rifle",
  causalActionFamily: "strict_ranged_attack",
  positions: {
    "ranged-attacker": { xIn: 18, yIn: 18 },
    "ranged-target": { xIn: 30, yIn: 18 },
  },
});
const rangedBlocked = assassinationCell({
  scenarioKey: "pressure-point",
  rosterReceiptHash: "ticket18-obstruction-ranged-v1",
  actorPieceKey: "ranged-attacker",
  targetPieceKey: "ranged-target",
  profileKey: "ticket18-rifle",
  causalActionFamily: "strict_ranged_attack",
  positions: {
    "ranged-attacker": { xIn: 18, yIn: 24 },
    "ranged-target": { xIn: 30, yIn: 24 },
  },
});
const rangedCells = [
  rangedClear,
  alias(rangedClear, "duplicate"),
  rangedBlocked,
  alias(rangedBlocked, "duplicate"),
];
const rangedOptions = {
  terminalAction: {
    actionType: "ranged_attack",
    actorPieceKey: "ranged-attacker",
    targetPieceKey: "ranged-target",
    actionPatch: { strictRollOutcome: { attackDice: [6, 6], damageDice: [6, 6] } },
  },
  completionMode: "complete_probability",
};
const rangedFull = materializeWarmachineTerminalGeometryReducedV1(
  rangedTemplate,
  rangedCells,
  { ...rangedOptions, foldEquivalentCandidates: false },
);
const rangedFolded = materializeWarmachineTerminalGeometryReducedV1(
  rangedTemplate,
  rangedCells,
  { ...rangedOptions, foldEquivalentCandidates: true },
);
assertFullFoldedParity("obstruction-ranged", rangedFull, rangedFolded, rangedCells);
assert.equal(new Set(rangedFolded.dispositionLedger.map((row) => row.disposition)).has(
  "strict_rejected"), true, JSON.stringify(rangedFolded));

const scoreCorpus = buildWarmachineFixedTerminalScorePositionCorpusV1({
  positionAnchorKeys: ["round-three-left-50-outer"],
  materializationAnchorKeys: ["round-three-left-50-outer"],
  maximumProposals: 1,
  maximumMaterializedCells: 1,
  skipMaterialization: true,
});
const scoreCell = scoreCorpus.positionDomain.proposals[0];
const scoreDuplicate = alias(scoreCell, "duplicate");
const scoreCells = [scoreCell, scoreDuplicate];
const scoreSeed = scoreCorpus.priorTurnSettlementSeedByCellKey[scoreCell.cellKey];
const scoreOptions = {
  activationEnvelopeBySide: {
    player1: "all_alive_activated",
    player2: "all_alive_activated",
  },
  preTerminalActivationEnvelopeBySide: {
    player1: "all_alive_activated",
    player2: "all_alive_activated",
  },
  priorTurnSettlementSeedByCellKey: {
    [scoreCell.cellKey]: scoreSeed,
    [scoreDuplicate.cellKey]: scoreSeed,
  },
  terminalAction: { actionType: "end_turn" },
  completionMode: "complete_probability",
};
const scoreFull = materializeWarmachineTerminalGeometryReducedV1(
  scoreCorpus.stateTemplate,
  scoreCells,
  { ...scoreOptions, foldEquivalentCandidates: false },
);
const scoreFolded = materializeWarmachineTerminalGeometryReducedV1(
  scoreCorpus.stateTemplate,
  scoreCells,
  { ...scoreOptions, foldEquivalentCandidates: true },
);
assertFullFoldedParity("steamroller-score", scoreFull, scoreFolded, scoreCells);

const scenarios = [
  ["open_melee", meleeFull, meleeFolded],
  ["obstruction_ranged", rangedFull, rangedFolded],
  ["steamroller_score", scoreFull, scoreFolded],
].map(([scenarioKey, full, folded]) => ({
  scenarioKey,
  inputCandidateCount: folded.inputCandidateCount,
  fullRepresentativeCount: full.evaluatedRepresentativeCount,
  foldedRepresentativeCount: folded.evaluatedRepresentativeCount,
  fullStrictReplayHostCallCount: full.hostCalls.strictReplay,
  foldedStrictReplayHostCallCount: folded.hostCalls.strictReplay,
  fullDurationMs: full.measurements.durationMs,
  foldedDurationMs: folded.measurements.durationMs,
  fullObservedHeapHighWaterBytes: full.measurements.observedHeapHighWaterBytes,
  foldedObservedHeapHighWaterBytes: folded.measurements.observedHeapHighWaterBytes,
  reductionRatio: folded.measurements.strictReplayReductionRatio,
  dispositionSet: [...new Set(folded.dispositionLedger.map((row) =>
    row.disposition))].sort(),
}));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_terminal_geometry_reduction_v1",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  scenarios,
  existenceContract: {
    evaluatedRepresentativeCount: existence.evaluatedRepresentativeCount,
    unenumeratedCandidateCount: existence.unenumeratedCandidateCount,
    unresolvedValueInterval: existence.unresolvedValueInterval,
    probabilityClosureEligible: existence.probabilityClosureEligible,
  },
  equivalenceContract: meleeFolded.equivalenceContract,
}, null, 2));
