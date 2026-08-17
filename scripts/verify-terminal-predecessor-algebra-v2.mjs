import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildWarmachineRulesV1StateFromLayer3Room,
  resolveWarmachineHostPath,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";
import { buildWarmachineTypedInteractionGraphV2 } from "../src/graph/typed-interaction-graph-v2.mjs";
import {
  appendWarmachinePredecessorAlgebraToExternalDagV2,
  buildWarmachineTerminalPredecessorAlgebraV2,
  evaluateWarmachineTerminalPredecessorAlgebraV2,
} from "../src/reverse/predecessor-algebra-v2.mjs";
import { replayWarmachineTerminalRouteStrictV2 } from "../src/reverse/strict-route-witness-v2.mjs";
import {
  buildWarmachineMinimalTerminalProofV2,
  buildWarmachineRosterProvenanceV2,
  buildWarmachineStrategicExchangeV2,
} from "../src/reverse/terminal-proof-v2.mjs";
import { createWarmachineExternalDagStore } from "../src/storage/external-dag-v1.mjs";

const FIXED_ROOM_PATH = resolveWarmachineHostPath(
  "build/warmachine-ai/sepsira-swarm-vs-fane-v20260805/strict-construction-search-v2/deep/" +
  "cryx-recursion-screen-fane-ashmael-scenario-blender-balanced-collision-player1-e4937ca7b578/" +
  "input-room-store.tmp.json",
);

function terrain(terrainKey, xIn, yIn, setupOrderIndex) {
  return {
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
  };
}

function piece(overrides = {}) {
  const pieceKey = overrides.pieceKey || "piece";
  const boxesRemaining = overrides.boxesRemaining ?? 5;
  return {
    pieceKey,
    label: overrides.label || pieceKey,
    sideKey: overrides.sideKey || "player1",
    modelRole: overrides.modelRole || "warrior",
    modelType: overrides.modelType || overrides.modelRole || "warrior",
    position: overrides.position || { xIn: 24, yIn: 24 },
    baseSizeIn: overrides.baseSizeIn ?? 1.18,
    speedIn: overrides.speedIn ?? 6,
    defense: overrides.defense ?? 12,
    armor: overrides.armor ?? 16,
    damage: {
      boxesRemaining,
      maxBoxes: overrides.maxBoxes ?? boxesRemaining,
    },
    statusTags: overrides.statusTags || [],
    attackProfiles: overrides.attackProfiles || [],
    cardSnapshot: {
      id: overrides.cardId || `card-${pieceKey}`,
      pointCostNumber: overrides.pointCost ?? 0,
      ...(overrides.cardSnapshot || {}),
    },
    ...overrides,
  };
}

function leader(overrides = {}) {
  return piece({
    modelRole: "warcaster",
    modelType: "warcaster",
    isWarcaster: true,
    ...overrides,
  });
}

function pressurePointState(overrides = {}) {
  return {
    stateKey: overrides.stateKey || "terminal-proof-v2",
    activeSideKey: overrides.activeSideKey || "player2",
    phaseKey: overrides.phaseKey || "activation",
    turnNumber: overrides.turnNumber ?? 2,
    strictMode: true,
    enforceStrictExecutor: true,
    board: { widthIn: 48, heightIn: 48 },
    pieces: overrides.pieces || [],
    terrain: overrides.terrain || [
      terrain("pressure-a", 8, 34, 0),
      terrain("pressure-b", 16, 36, 1),
      terrain("pressure-c", 32, 12, 2),
      terrain("pressure-d", 40, 14, 3),
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
      ...(overrides.scenario || {}),
    },
  };
}

function killingProfile() {
  return {
    profileKey: "terminal-blade",
    name: "Terminal Blade",
    mode: "melee",
    rangeIn: 2,
    power: 24,
    attackStat: 8,
    attackStatKind: "MAT",
  };
}

function strictAssassinationRoute(graph, extraEnemyPieces = []) {
  const initialState = pressurePointState({
    stateKey: "strict-assassination-route-v2",
    activeSideKey: "player1",
    turnNumber: 1,
    pieces: [
      leader({
        pieceKey: "p1-leader",
        sideKey: "player1",
        position: { xIn: 10, yIn: 10 },
        attackProfiles: [killingProfile()],
      }),
      leader({
        pieceKey: "p2-leader",
        sideKey: "player2",
        position: { xIn: 11.1, yIn: 10 },
        boxesRemaining: 1,
      }),
      ...extraEnemyPieces,
    ],
  });
  return {
    initialState,
    witness: replayWarmachineTerminalRouteStrictV2(
      initialState,
      [{
        actionType: "melee_attack",
        actorPieceKey: "p1-leader",
        targetPieceKey: "p2-leader",
        actionPatch: { strictRollOutcome: { attackDice: [6, 6], damageDice: [6, 6] } },
      }],
      { goalType: "assassination", winnerSideKey: "player1" },
      { graph, searchMode: "long_horizon" },
    ),
  };
}

function completeEvidence(algebra, overrides = {}) {
  return {
    completeRouteStrictWitness: true,
    evidenceByNodeKey: Object.fromEntries(algebra.nodes.map((node) => [node.nodeKey, {
      interval: { lowerBound: 1, upperBound: 1, complete: true },
      cursorExhausted: true,
      outcomes: node.algebraKind === "CHANCE"
        ? [{ mass: 1, interval: { lowerBound: 1, upperBound: 1, complete: true } }]
        : undefined,
      responseIntervals: [
        { lowerBound: 1, upperBound: 1, complete: true },
      ],
      ...(overrides[node.nodeKey] || {}),
    }])),
  };
}

const graph = buildWarmachineTypedInteractionGraphV2();
assert.equal(graph.validation.structuralOk, true);

const assassination = strictAssassinationRoute(graph);
assert.equal(assassination.witness.rejected, null);
assert.equal(assassination.witness.strictWitness, true);
assert.equal(assassination.witness.proof.status, "strict_certified");
assert.equal(assassination.witness.proof.goalType, "assassination");
assert.equal(assassination.witness.proof.absoluteTerminalTime.roundNumber, 1);
assert.equal(assassination.witness.proof.facts.every((fact) => fact.status === "satisfied"), true);
assert.ok(assassination.witness.receipts[0].events.some((event) =>
  event.eventType === "terminal" && event.winnerSideKey === "player1"));
assert.equal(assassination.witness.strategyRobustnessProven, false);

const scoringInitial = pressurePointState({
  stateKey: "strict-scenario-route-v2",
  activeSideKey: "player2",
  turnNumber: 2,
  pieces: [
    leader({ pieceKey: "p1-leader", sideKey: "player1", position: { xIn: 10, yIn: 10 }, activated: true }),
    leader({ pieceKey: "p2-leader", sideKey: "player2", position: { xIn: 38, yIn: 38 }, activated: true }),
  ],
  scenario: { score: { player1: 3, player2: 0 } },
});
const scoring = replayWarmachineTerminalRouteStrictV2(
  scoringInitial,
  [{ actionType: "end_turn" }],
  {
    goalType: "scenario_score",
    winnerSideKey: "player1",
    endingSideKey: "player2",
  },
  { graph, searchMode: "long_horizon" },
);
assert.equal(scoring.rejected, null);
assert.equal(scoring.strictWitness, true);
assert.equal(scoring.proof.status, "strict_certified");
assert.equal(scoring.proof.absoluteTerminalTime.roundNumber, 2);
assert.equal(scoring.proof.absoluteTerminalTime.endingSideKey, "player2");
const scoreTransitionFact = scoring.proof.facts.find((fact) =>
  fact.factKind === "scenario_score_transition");
assert.equal(scoreTransitionFact?.status, "satisfied");
assert.ok(scoreTransitionFact.evidence.zeroPointSettlement ||
  scoreTransitionFact.evidence.scoreEventCount > 0);

const ownTurnLead = replayWarmachineTerminalRouteStrictV2(
  pressurePointState({
    stateKey: "own-turn-lead-is-not-terminal-v2",
    activeSideKey: "player2",
    turnNumber: 2,
    pieces: [
      leader({ pieceKey: "p1-leader", sideKey: "player1", position: { xIn: 10, yIn: 10 }, activated: true }),
      leader({ pieceKey: "p2-leader", sideKey: "player2", position: { xIn: 38, yIn: 38 }, activated: true }),
    ],
    scenario: { score: { player1: 0, player2: 3 } },
  }),
  [{ actionType: "end_turn" }],
  { goalType: "scenario_score", winnerSideKey: "player2", endingSideKey: "player2" },
  { graph },
);
assert.equal(ownTurnLead.strictWitness, false);
assert.equal(ownTurnLead.proof.strictTerminalEventPresent, false);

const multipleLeaders = strictAssassinationRoute(graph, [
  leader({
    pieceKey: "p2-leader-backup",
    sideKey: "player2",
    position: { xIn: 35, yIn: 35 },
  }),
]);
assert.equal(multipleLeaders.witness.strictWitness, false);
assert.equal(multipleLeaders.witness.proof.strictTerminalEventPresent, false);
assert.equal(multipleLeaders.witness.proof.facts.find((fact) =>
  fact.factKind === "loser_leader_absence")?.status, "unresolved");

const finalVpCannotOverride = strictAssassinationRoute(graph, [
  piece({
    pieceKey: "p2-heavy",
    sideKey: "player2",
    modelRole: "warjack",
    modelType: "warjack",
    isWarjack: true,
    position: { xIn: 24, yIn: 24 },
  }),
]);
finalVpCannotOverride.initialState.scenario.score = { player1: 0, player2: 2 };
const precedenceReplay = replayWarmachineTerminalRouteStrictV2(
  finalVpCannotOverride.initialState,
  [{
    actionType: "melee_attack",
    actorPieceKey: "p1-leader",
    targetPieceKey: "p2-leader",
    actionPatch: { strictRollOutcome: { attackDice: [6, 6], damageDice: [6, 6] } },
  }],
  { goalType: "assassination", winnerSideKey: "player1" },
  { graph },
);
assert.equal(precedenceReplay.strictWitness, true);
assert.equal(precedenceReplay.finalState.scenario.score.player2, 4);
assert.ok(precedenceReplay.receipts[0].events.some((event) =>
  event.eventType === "scenario_terminal_superseded"));
const assassinationIsNotScore = buildWarmachineMinimalTerminalProofV2(
  precedenceReplay.finalState,
  { goalType: "scenario_score", winnerSideKey: "player1" },
  { strictEvents: precedenceReplay.receipts.flatMap((receipt) => receipt.events) },
);
assert.equal(assassinationIsNotScore.strictCertified, false);
assert.equal(assassinationIsNotScore.facts.find((fact) =>
  fact.factKind === "scenario_terminal_event")?.status, "unresolved");
const wrongWinner = buildWarmachineMinimalTerminalProofV2(
  precedenceReplay.finalState,
  { goalType: "assassination", winnerSideKey: "player2" },
  { strictEvents: precedenceReplay.receipts.flatMap((receipt) => receipt.events) },
);
assert.equal(wrongWinner.status, "invalid_under_bound_state");
assert.equal(wrongWinner.facts.find((fact) =>
  fact.factKind === "terminal_winner_identity")?.status, "contradicted");

const fixedStore = JSON.parse(fs.readFileSync(FIXED_ROOM_PATH, "utf8"));
const fixedRoom = Object.values(fixedStore.roomsById || {})[0];
const fixedState = buildWarmachineRulesV1StateFromLayer3Room(fixedRoom, {
  strictMode: true,
  enforceStrictExecutor: true,
});
assert.equal(fixedState.pieces.length, 106);
const enemyLeader = fixedState.pieces.find((row) =>
  row.sideKey === "player2" && (row.isWarcaster || row.isWarlock));
assert.ok(enemyLeader);

const modeLayerCounts = {
  victory_event: 1,
  activation: 2,
  current_turn: 3,
  previous_turn: 4,
  long_horizon: 5,
};
const modeAlgebras = {};
for (const [searchMode, temporalLayerCount] of Object.entries(modeLayerCounts)) {
  const algebra = buildWarmachineTerminalPredecessorAlgebraV2(
    fixedState,
    {
      templateKey: `fixed-106-${searchMode}`,
      goalType: "assassination",
      winnerSideKey: "player1",
      targetPieceKey: enemyLeader.pieceKey,
    },
    { graph, searchMode },
  );
  modeAlgebras[searchMode] = algebra;
  assert.equal(algebra.counts.temporalLayerCount, temporalLayerCount);
  assert.equal(algebra.counts.danglingEdgeCount, 0);
  assert.equal(algebra.structuralOk, true);
  assert.equal(algebra.exactInverseRulesStateGenerated, false);
  assert.equal(algebra.hardPruningEnabled, false);
}

const algebra = modeAlgebras.long_horizon;
for (const algebraKind of [
  "AND",
  "OR",
  "ADVERSARIAL_AND",
  "CHANCE",
  "TRIGGER_AND_OR",
  "ADVERSARIAL_REACTION",
  "STRICT_WITNESS",
  "UNRESOLVED",
]) {
  assert.ok(algebra.nodes.some((node) => node.algebraKind === algebraKind),
    `missing ${algebraKind} node`);
}
for (const layerKey of ["victory_event", "activation", "turn", "previous_turn", "previous_round"]) {
  assert.ok(algebra.nodes.some((node) =>
    node.nodeKind === "temporal_predecessor_layer" && node.layerKey === layerKey));
}
for (const reason of [
  "complete_inverse_transition_not_available",
  "opponent_response_cursor_not_exhausted",
  "chance_mass_not_expanded",
  "trigger_order_not_materialized",
  "reaction_window_cursor_not_exhausted",
  "complete_route_strict_witness_missing",
]) {
  assert.ok(algebra.unresolved.some((row) => row.reason === reason), `missing unresolved ${reason}`);
}
assert.deepEqual(
  buildWarmachineTerminalPredecessorAlgebraV2(
    fixedState,
    algebra.proof,
    { graph, searchMode: "long_horizon", proof: algebra.proof },
  ).counts,
  algebra.counts,
);

const noEvidence = evaluateWarmachineTerminalPredecessorAlgebraV2(algebra);
assert.deepEqual(noEvidence.rootInterval, {
  lowerBound: 0,
  upperBound: 1,
  complete: false,
  status: "unresolved",
  hardPrunable: false,
});

const exactEvidence = evaluateWarmachineTerminalPredecessorAlgebraV2(
  algebra,
  completeEvidence(algebra),
);
assert.equal(exactEvidence.rootInterval.lowerBound, 1);
assert.equal(exactEvidence.rootInterval.upperBound, 1);
assert.equal(exactEvidence.rootInterval.complete, true);
assert.equal(exactEvidence.fullyCertified, true);
assert.equal(exactEvidence.hardPruningEnabled, false);

const chanceNode = algebra.nodes.find((node) => node.algebraKind === "CHANCE");
const partialChanceEvidence = completeEvidence(algebra, {
  [chanceNode.nodeKey]: {
    interval: { lowerBound: 1, upperBound: 1, complete: true },
    cursorExhausted: false,
    outcomes: [{
      mass: 0.5,
      interval: { lowerBound: 1, upperBound: 1, complete: true },
    }],
  },
});
const partialChance = evaluateWarmachineTerminalPredecessorAlgebraV2(
  algebra,
  partialChanceEvidence,
);
assert.equal(partialChance.rootInterval.complete, false);
assert.ok(partialChance.rootInterval.lowerBound < 1);
assert.equal(partialChance.rootInterval.upperBound, 1);
assert.equal(partialChance.fullyCertified, false);

const adversarialNode = algebra.nodes.find((node) => node.algebraKind === "ADVERSARIAL_AND");
const partialAdversaryEvidence = completeEvidence(algebra, {
  [adversarialNode.nodeKey]: {
    interval: { lowerBound: 1, upperBound: 1, complete: true },
    cursorExhausted: false,
    responseIntervals: [{ lowerBound: 1, upperBound: 1, complete: true }],
  },
});
const partialAdversary = evaluateWarmachineTerminalPredecessorAlgebraV2(
  algebra,
  partialAdversaryEvidence,
);
assert.equal(partialAdversary.rootInterval.complete, false);
assert.equal(partialAdversary.rootInterval.lowerBound, 0);
assert.equal(partialAdversary.fullyCertified, false);

const exchangeBefore = pressurePointState({
  stateKey: "exchange-before",
  activeSideKey: "player1",
  pieces: [
    leader({ pieceKey: "p1-leader", sideKey: "player1", position: { xIn: 10, yIn: 10 } }),
    piece({
      pieceKey: "p2-unit-a",
      sideKey: "player2",
      unitGroupId: "p2-unit",
      position: { xIn: 20, yIn: 20 },
      pointCost: 8,
    }),
    piece({
      pieceKey: "p2-unit-b",
      sideKey: "player2",
      unitGroupId: "p2-unit",
      position: { xIn: 21.2, yIn: 20 },
      pointCost: 8,
    }),
  ],
});
const exchangeAfter = structuredClone(exchangeBefore);
exchangeAfter.stateKey = "exchange-after";
exchangeAfter.pieces.filter((row) => row.unitGroupId === "p2-unit").forEach((row) => {
  row.destroyed = true;
  row.damage.boxesRemaining = 0;
});
const exchange = buildWarmachineStrategicExchangeV2(exchangeBefore, exchangeAfter, {
  perspectiveSideKey: "player1",
  deliberateExchange: true,
  strategicIntent: "remove scorer before the next settlement",
});
assert.equal(exchange.exchangeVector.opponentRemovedPoints, 8);
assert.equal(exchange.exchangeVector.pointSwing, 8);
assert.equal(exchange.deliberateExchange, true);
assert.equal(exchange.trainingTruth, false);

const provenance = buildWarmachineRosterProvenanceV2(exchangeAfter);
assert.equal(provenance.modelCount, 3);
assert.equal(provenance.rows.filter((row) => row.lifecycleStage === "destroyed").length, 2);
assert.equal(provenance.completeForHardPruning, true);

const dagRoot = fs.mkdtempSync(path.join(os.tmpdir(), "warmachine-predecessor-v2-"));
try {
  const store = createWarmachineExternalDagStore(dagRoot, {
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    sourceHash: "2".repeat(64),
    configHash: "3".repeat(64),
    partitionCount: 8,
    sortRunRecordLimit: 16,
  });
  const writer = store.createCandidateSegment({ workerId: "focused", batchId: "algebra-v2" });
  const persisted = appendWarmachinePredecessorAlgebraToExternalDagV2(
    writer,
    assassination.witness.finalState,
    assassination.witness.algebra,
    { routeKey: assassination.witness.routeKey, intent: "strict assassination witness" },
  );
  assert.equal(persisted.stateResult.accepted, true);
  assert.equal(persisted.labelResult.accepted, true);
  assert.equal(
    persisted.acceptedUnresolvedCount,
    assassination.witness.algebra.unresolved.length,
  );
  writer.seal();
  const checkpoint = store.mergeAndCheckpoint({
    checkpoint: { frontierRootIds: [persisted.stateId] },
  });
  assert.equal(checkpoint.counts.state, 1);
  assert.equal(checkpoint.counts.label, 1);
  assert.equal(checkpoint.counts.unresolved, persisted.acceptedUnresolvedCount);
} finally {
  fs.rmSync(dagRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_terminal_predecessor_algebra_v2",
  upstreamReceiptHash: warmachineHost.receipt.receiptHash,
  graphHash: graph.graphHash,
  strictWitnesses: {
    assassination: assassination.witness.witnessHash,
    scenarioScore: scoring.witnessHash,
    finalVpCannotOverride: precedenceReplay.witnessHash,
  },
  negativeWitnesses: {
    ownTurnLead: ownTurnLead.proof.status,
    multipleEnemyLeaders: multipleLeaders.witness.proof.status,
  },
  fixedRosterPieceCount: fixedState.pieces.length,
  modeLayerCounts,
  algebraCounts: algebra.counts,
  unresolvedReasons: [...new Set(algebra.unresolved.map((row) => row.reason))].sort(),
  probabilityIntervals: {
    noEvidence: noEvidence.rootInterval,
    exactSyntheticClosure: exactEvidence.rootInterval,
    partialChance: partialChance.rootInterval,
    partialAdversary: partialAdversary.rootInterval,
  },
  hardPruningEnabled: false,
}, null, 2));
