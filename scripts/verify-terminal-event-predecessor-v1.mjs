import assert from "node:assert/strict";

import {
  enumerateWarmachineBenchmarkActionsV2,
  executeWarmachineBenchmarkControlPhaseV2,
} from
  "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import { replayWarmachineTerminalRouteStrictV2 } from
  "../src/reverse/strict-route-witness-v2.mjs";
import { reverseWarmachinePassActivationSequenceV1 } from
  "../src/reverse/pass-activation-predecessor-v1.mjs";
import { generateWarmachineControlPhasePredecessorsV1 } from
  "../src/reverse/control-phase-predecessor-v1.mjs";
import { generateWarmachinePreviousTurnEndPredecessorsV1 } from
  "../src/reverse/previous-turn-end-predecessor-v1.mjs";
import { generateWarmachineMovementActivationPredecessorsV1 } from
  "../src/reverse/movement-activation-predecessor-v1.mjs";
import { searchWarmachineTerminalRootedOpponentTurnV1 } from
  "../src/reverse/terminal-rooted-worklist-v1.mjs";
import { searchWarmachineTerminalRootedToDeploymentV1 } from
  "../src/reverse/terminal-rooted-to-deployment-v1.mjs";
import {
  generateWarmachineTerminalEventPredecessorsV1,
  warmachineReverseStateSemanticHashV1,
} from "../src/reverse/terminal-event-predecessor-v1.mjs";
import { buildWarmachineTerminalHypothesisDomainV1 } from
  "../src/reverse/terminal-hypothesis-v1.mjs";
import { materializeWarmachineTerminalSpatialCellsV1 } from
  "../src/reverse/terminal-spatial-materializer-v1.mjs";
import { normalizeRulesV1State, warmachineHost } from
  "../src/warmachine-host-runtime.mjs";

function withoutStateKeys(value) {
  if (Array.isArray(value)) return value.map(withoutStateKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "stateKey")
    .map(([key, child]) => [key, withoutStateKeys(child)]));
}

function differingPaths(left, right, path = "", output = []) {
  if (output.length >= 40) return output;
  if (Object.is(left, right)) return output;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      output.push({ path, left, right });
      return output;
    }
    const count = Math.max(left.length, right.length);
    for (let index = 0; index < count; index += 1) {
      differingPaths(left[index], right[index], `${path}[${index}]`, output);
    }
    return output;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      differingPaths(left[key], right[key], path ? `${path}.${key}` : key, output);
    }
    return output;
  }
  output.push({ path, left, right });
  return output;
}

function leader(pieceKey, sideKey, position, boxesRemaining, attackProfiles = []) {
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
    attackProfiles,
    cardSnapshot: { id: `card-${pieceKey}`, pointCostNumber: 0 },
  };
}

function warrior(pieceKey, sideKey, position, activated = false) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey,
    modelRole: "solo",
    modelType: "warrior model",
    position,
    baseSizeIn: 1.18,
    speedIn: 6,
    defense: 12,
    armor: 14,
    damage: { boxesRemaining: 5, maxBoxes: 5 },
    statusTags: [],
    activated,
    cardSnapshot: { id: `card-${pieceKey}`, pointCostNumber: 0 },
  };
}

const terrain = [[8, 34], [16, 36], [32, 12], [40, 14]].map(([xIn, yIn], index) => ({
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
}));

const deployments = {
  p1_deploy: { id: "p1_deploy", x: 8, y: 24, width: 16, height: 36 },
  p2_deploy: { id: "p2_deploy", x: 40, y: 24, width: 16, height: 36 },
};

const terminalToDeploymentOptions = {
  deployments,
  firstPlayerSideKey: "player1",
  movementActionTypes: ["run"],
  maximumReverseTurns: 6,
  maximumRouteLabels: 4_000,
  maximumUniqueStates: 2_000,
  maximumCompletedRoutes: 4,
  stopAfterCompletedRouteCount: 1,
  frontierOrder: "best_first_to_deployment",
  maximumActivationDepth: 6,
  maximumActivationLabels: 256,
  maximumActivationUniqueStates: 128,
  activationFrontierOrder: "best_first_to_deployment",
  stopAfterActivationBoundaryRouteCount: 16,
  maximumDeploymentSlotOrigins: 4,
  maximumDeploymentSlotRings: 1,
  nextSideActivationRestoreModes: ["preserve_reset_state", "all_alive_activated"],
  includeRuntimeDiagnostics: false,
  progressEveryLabels: 25,
  progressDeploymentFailureLimit: 3,
  certifyFullRouteStrictReplay: true,
};

const hiddenPredecessor = {
  stateKey: "hidden-terminal-predecessor",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 3,
  strictMode: true,
  enforceStrictExecutor: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    {
      ...leader("p1-finisher", "player1", { xIn: 20, yIn: 24 }, 5, [{
        profileKey: "terminal-blade",
        name: "Terminal Blade",
        mode: "melee",
        rangeIn: 2,
        power: 24,
        attackStat: 8,
        attackStatKind: "MAT",
      }]),
      metadata: { upkeepsPaidThisControlPhase: [] },
    },
    {
      ...warrior("p1-helper", "player1", { xIn: 8, yIn: 20 }, true),
      metadata: { upkeepsPaidThisControlPhase: [] },
    },
    {
      ...leader("p2-target", "player2", { xIn: 21.3, yIn: 24 }, 1),
      activated: true,
      metadata: { upkeepsPaidThisControlPhase: [] },
    },
  ],
  terrain,
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
      objectiveKey: "assassination-away-50",
      baseSizeMm: 50,
      xIn: 24,
      yIn: 40,
      geometryExactWithinScope: true,
      geometryIssues: [],
    }],
    caches: [],
  },
};

const hiddenForwardOracle = replayWarmachineTerminalRouteStrictV2(
  hiddenPredecessor,
  [{
    actionType: "melee_attack",
    actorPieceKey: "p1-finisher",
    targetPieceKey: "p2-target",
    actionPatch: { strictRollOutcome: { attackDice: [6, 6], damageDice: [6, 6] } },
  }],
  { goalType: "assassination", winnerSideKey: "player1" },
);
assert.equal(
  hiddenForwardOracle.strictWitness,
  true,
  JSON.stringify(hiddenForwardOracle, null, 2),
);

const hiddenPreparedPredecessor = enumerateWarmachineBenchmarkActionsV2(hiddenPredecessor, {
  actorPieceKeys: ["p1-finisher"],
  targetPieceKeys: ["p2-target"],
  includeUntargetedActions: false,
  actionFamilyKeys: ["attack_or_effect", "special", "resource"],
}).state;

const domain = buildWarmachineTerminalHypothesisDomainV1({
  scenarioKey: "pressure-point",
  scenarioPacketKey: "steamroller-2026",
  scenarioPacketYear: "2026",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  rosterReceiptHash: "micro-two-leader-roster-v1",
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
      relationKind: "terminal_attack_reachable",
      actorToTargetRangeBand: "melee_range",
      lineOfSightRelation: "melee_los",
      pathRelation: "no_movement_in_terminal_step",
      exactCoordinatesKnown: true,
      exactCoordinates: {
        piecePositions: {
          "p1-finisher": { xIn: 20, yIn: 24 },
          "p1-helper": { xIn: 8, yIn: 20 },
          "p2-target": { xIn: 21.3, yIn: 24 },
        },
      },
      relationChecks: [{
        relationKey: "finisher-in-terminal-melee-range",
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

const assassinationSpatialMaterialization =
  materializeWarmachineTerminalSpatialCellsV1(
    hiddenPredecessor,
    domain.cells,
    {
      terminalAction: {
        actionType: "melee_attack",
        actorPieceKey: "p1-finisher",
        targetPieceKey: "p2-target",
        actionPatch: { strictRollOutcome: { attackDice: [6, 6], damageDice: [6, 6] } },
      },
    },
  );
assert.equal(assassinationSpatialMaterialization.ok, true,
  JSON.stringify(assassinationSpatialMaterialization));
assert.equal(assassinationSpatialMaterialization.strictMaterializedCount, 1);
const assassinationTerminalState =
  assassinationSpatialMaterialization.runtimeRoots[0].terminalState;
assert.equal(
  warmachineReverseStateSemanticHashV1(assassinationTerminalState),
  warmachineReverseStateSemanticHashV1(hiddenForwardOracle.finalState),
);

// Only the terminal state and terminal hypothesis cell cross the reverse-search boundary.
const reverse = generateWarmachineTerminalEventPredecessorsV1(
  assassinationTerminalState,
  domain.cells[0],
);
assert.equal(reverse.ok, true, JSON.stringify(reverse.unresolved));
assert.equal(reverse.oracleIsolationAudit.passed, true);
assert.ok(reverse.strictCandidateCount >= 1);
const hiddenPredecessorHash = warmachineReverseStateSemanticHashV1(hiddenPreparedPredecessor);
assert.ok(reverse.candidates.some((candidate) =>
  candidate.predecessorStateHash === hiddenPredecessorHash), JSON.stringify({
  hiddenPredecessorHash,
  candidateHashes: reverse.candidates.map((candidate) => candidate.predecessorStateHash),
  differences: differingPaths(
    withoutStateKeys(normalizeRulesV1State(hiddenPreparedPredecessor)),
    withoutStateKeys(normalizeRulesV1State(reverse.candidates[0]?.predecessorState || {})),
  ),
}, null, 2));
assert.ok(reverse.candidates.every((candidate) => candidate.strictWitness));
assert.ok(reverse.candidates.every((candidate) =>
  candidate.matchingOutcomes.some((outcome) => outcome.terminalEvents.some((event) =>
    event.eventType === "terminal" && event.winnerSideKey === "player1"))));

const wrongActorCell = {
  ...domain.cells[0],
  actorPieceKey: "p2-target",
  cellKey: `${domain.cells[0].cellKey}-wrong-actor`,
};
const wrongActor = generateWarmachineTerminalEventPredecessorsV1(
  assassinationTerminalState,
  wrongActorCell,
);
assert.equal(wrongActor.ok, false);
assert.equal(wrongActor.strictCandidateCount, 0);

const hiddenAssassinationActivationStart = structuredClone(hiddenPredecessor);
hiddenAssassinationActivationStart.stateKey = "hidden-assassination-activation-start";
hiddenAssassinationActivationStart.pieces.find((piece) =>
  piece.pieceKey === "p1-helper").activated = false;
const hiddenAssassinationActivationPrepared = enumerateWarmachineBenchmarkActionsV2(
  hiddenAssassinationActivationStart,
  {
    actorPieceKeys: ["p1-helper"],
    actionFamilyKeys: ["timing"],
  },
).state;
const hiddenAssassinationActivationHash = warmachineReverseStateSemanticHashV1(
  hiddenAssassinationActivationPrepared,
);
const assassinationActivationReverse = reverseWarmachinePassActivationSequenceV1(
  reverse.candidates[0].predecessorState,
  { sideKey: "player1", maximumDepth: 2 },
);
assert.equal(assassinationActivationReverse.ok, true,
  JSON.stringify(assassinationActivationReverse.unresolved));
assert.equal(assassinationActivationReverse.boundaryCount, 1);
assert.equal(assassinationActivationReverse.unresolvedCount, 0);
assert.ok(assassinationActivationReverse.runtimeBoundaries.some((boundary) =>
  warmachineReverseStateSemanticHashV1(boundary.state) ===
    hiddenAssassinationActivationHash));

const assassinationActivationBoundary =
  assassinationActivationReverse.runtimeBoundaries[0];
const assassinationControlReverse = generateWarmachineControlPhasePredecessorsV1(
  assassinationActivationBoundary.state,
  { resourceEnvelopeKey: "unchanged" },
);
const hiddenAssassinationControlStart = structuredClone(
  hiddenAssassinationActivationPrepared,
);
hiddenAssassinationControlStart.stateKey = "hidden-assassination-control-start";
hiddenAssassinationControlStart.phaseKey = "control";
hiddenAssassinationControlStart.controlPhaseStepKey = "maintenance";
for (const piece of hiddenAssassinationControlStart.pieces) {
  if (piece.sideKey !== "player1") continue;
  delete piece.upkeepsPaidThisControlPhase;
  if (piece.metadata) delete piece.metadata.upkeepsPaidThisControlPhase;
}
const hiddenAssassinationControlPrepared = enumerateWarmachineBenchmarkActionsV2(
  hiddenAssassinationControlStart,
).state;
const hiddenAssassinationControlHash = warmachineReverseStateSemanticHashV1(
  hiddenAssassinationControlPrepared,
);
assert.equal(assassinationControlReverse.ok, true, JSON.stringify({
  rejected: assassinationControlReverse.rejected,
  unresolved: assassinationControlReverse.unresolved,
}));
assert.ok(assassinationControlReverse.candidates.some((candidate) =>
  candidate.predecessorStateHash === hiddenAssassinationControlHash));
const assassinationPreviousTurnReverse =
  generateWarmachinePreviousTurnEndPredecessorsV1(
    assassinationControlReverse.candidates[0].predecessorState,
    {
      nextSideActivationRestoreModes: ["all_alive_activated"],
      includeRuntimeDiagnostics: true,
    },
  );
assert.equal(assassinationPreviousTurnReverse.ok, true, JSON.stringify({
  rejected: assassinationPreviousTurnReverse.rejected,
  unresolved: assassinationPreviousTurnReverse.unresolved,
  differences: differingPaths(
    withoutStateKeys(normalizeRulesV1State(
      assassinationPreviousTurnReverse.runtimeDiagnostics[0]?.expectedSuccessorState || {},
    )),
    withoutStateKeys(normalizeRulesV1State(
      assassinationPreviousTurnReverse.runtimeDiagnostics[0]?.executedSuccessorState || {},
    )),
  ),
}));
assert.equal(assassinationPreviousTurnReverse.strictCandidateCount, 1);
const assassinationP2MovementProbe = generateWarmachineMovementActivationPredecessorsV1(
  assassinationPreviousTurnReverse.candidates[0].predecessorState,
  {
    sideKey: "player2",
    actorPieceKeys: ["p2-target"],
    actionTypes: ["run"],
    deployments,
    rejectedAuditLimit: 32,
  },
);
assert.ok(assassinationP2MovementProbe.strictCandidateCount >= 1, JSON.stringify({
  proposalCount: assassinationP2MovementProbe.proposalCount,
  candidates: assassinationP2MovementProbe.publicCandidates,
  rejected: assassinationP2MovementProbe.rejected,
  unresolved: assassinationP2MovementProbe.unresolved,
}, null, 2));
const assassinationOpponentActivationReverse = reverseWarmachinePassActivationSequenceV1(
  assassinationPreviousTurnReverse.candidates[0].predecessorState,
  { sideKey: "player2", maximumDepth: 2 },
);
assert.equal(assassinationOpponentActivationReverse.ok, true,
  JSON.stringify(assassinationOpponentActivationReverse.unresolved));
assert.equal(assassinationOpponentActivationReverse.boundaryCount, 1);
assert.equal(assassinationOpponentActivationReverse.unresolvedCount, 0);
const assassinationOpponentControlReverse = generateWarmachineControlPhasePredecessorsV1(
  assassinationOpponentActivationReverse.runtimeBoundaries[0].state,
  { resourceEnvelopeKey: "unchanged" },
);
assert.equal(assassinationOpponentControlReverse.ok, true, JSON.stringify({
  rejected: assassinationOpponentControlReverse.rejected,
  unresolved: assassinationOpponentControlReverse.unresolved,
}));
assert.ok(assassinationOpponentControlReverse.strictCandidateCount >= 1);
const assassinationWorklist = searchWarmachineTerminalRootedOpponentTurnV1(
  assassinationTerminalState,
  domain.cells[0],
  { maximumActivationDepth: 3, maximumOpponentActivationDepth: 3 },
);
assert.equal(assassinationWorklist.ok, true,
  JSON.stringify(assassinationWorklist.unresolved));
assert.ok(assassinationWorklist.routeCount >= 1);
assert.equal(assassinationWorklist.unresolvedCount, 0);
assert.equal(assassinationWorklist.routes[0].completeOpponentTurnRecovered, true);
assert.equal(assassinationWorklist.routes[0].legalDeploymentReached, false);
const assassinationPausedSearch = searchWarmachineTerminalRootedToDeploymentV1(
  assassinationTerminalState,
  domain.cells[0],
  {
    ...terminalToDeploymentOptions,
    maximumReverseTurns: 0,
    certifyFullRouteStrictReplay: false,
  },
);
assert.equal(assassinationPausedSearch.legalDeploymentRouteCount, 0);
assert.ok(assassinationPausedSearch.runtimeResumeCheckpoint.frontierCount >= 1);
const assassinationDeploymentSearch = searchWarmachineTerminalRootedToDeploymentV1(
  assassinationTerminalState,
  domain.cells[0],
  {
    ...terminalToDeploymentOptions,
    resumeCheckpoint: assassinationPausedSearch.runtimeResumeCheckpoint,
  },
);
assert.equal(assassinationDeploymentSearch.resumeCheckpoint.requested, true);
assert.equal(assassinationDeploymentSearch.resumeCheckpoint.accepted, true);
const assassinationOpeningFailures = assassinationDeploymentSearch.unresolved.filter((row) =>
  row.reason === "turn_one_control_start_is_not_a_legal_deployment");
const assassinationP2OpeningPositions = [...new Set(assassinationOpeningFailures.map((row) => {
  const target = (row.pieces || []).find((piece) => piece.pieceKey === "p2-target");
  return target ? `${target.position.xIn},${target.position.yIn},${target.activated}` : "missing";
}))].sort();
assert.equal(assassinationDeploymentSearch.ok, true, JSON.stringify({
  finalUnresolved: assassinationOpeningFailures.slice(0, 3),
  openingFailureCount: assassinationOpeningFailures.length,
  openingGeometryPassCount: assassinationOpeningFailures.filter((row) =>
    row.deploymentAudit?.ok === true).length,
  openingNoActivatedPassCount: assassinationOpeningFailures.filter((row) =>
    !(row.failedDeploymentChecks || []).includes("noActivatedModels")).length,
  p2OpeningPositions: assassinationP2OpeningPositions,
  unresolvedReasonCounts: Object.fromEntries([...new Set(
    assassinationDeploymentSearch.unresolved.map((row) => row.reason),
  )].sort().map((reason) => [reason, assassinationDeploymentSearch.unresolved
    .filter((row) => row.reason === reason).length])),
  rejectedCount: assassinationDeploymentSearch.rejected.length,
  routeLabelCount: assassinationDeploymentSearch.routeLabelCount,
  uniqueStateCount: assassinationDeploymentSearch.uniqueStateCount,
  firstRuntimeDifference: assassinationDeploymentSearch.runtimeDiagnostics.find((row) =>
    String(row.stageKey || "").includes("control"))
    ? differingPaths(
      withoutStateKeys(normalizeRulesV1State(
        assassinationDeploymentSearch.runtimeDiagnostics.find((row) =>
          String(row.stageKey || "").includes("control")).expectedSuccessorState || {},
      )),
      withoutStateKeys(normalizeRulesV1State(
        assassinationDeploymentSearch.runtimeDiagnostics.find((row) =>
          String(row.stageKey || "").includes("control")).executedSuccessorState || {},
      )),
    )
    : [],
  firstPreviousTurnDifference: assassinationDeploymentSearch.runtimeDiagnostics.find((row) =>
    row.stageKey === "previous_turn_end")
    ? differingPaths(
      withoutStateKeys(normalizeRulesV1State(
        assassinationDeploymentSearch.runtimeDiagnostics.find((row) =>
          row.stageKey === "previous_turn_end").expectedSuccessorState || {},
      )),
      withoutStateKeys(normalizeRulesV1State(
        assassinationDeploymentSearch.runtimeDiagnostics.find((row) =>
          row.stageKey === "previous_turn_end").executedSuccessorState || {},
      )),
    )
    : [],
}, null, 2));
assert.ok(assassinationDeploymentSearch.legalDeploymentRouteCount >= 1);
assert.ok(assassinationDeploymentSearch.routes.every((route) =>
  route.legalDeploymentReached === true &&
  route.deploymentAudit.legalDeploymentReached === true));
assert.ok(assassinationDeploymentSearch.routes.every((route) =>
  route.fullRouteStrictReplayCertified === true), JSON.stringify(
  assassinationDeploymentSearch.routes.map((route) => route.fullRouteStrictReplay),
  null,
  2,
));
assert.equal(assassinationDeploymentSearch.oracleIsolationAudit.passed, true);

const hiddenScorePredecessor = {
  stateKey: "hidden-score-terminal-predecessor",
  activeSideKey: "player2",
  phaseKey: "activation",
  turnNumber: 3,
  strictMode: true,
  enforceStrictExecutor: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    {
      ...warrior("p1-scorer", "player1", { xIn: 21, yIn: 24 }, true),
      modelRole: "warjack",
      modelType: "warjack",
      isWarjack: true,
      activated: true,
      metadata: { upkeepsPaidThisControlPhase: [] },
    },
    {
      ...leader("p1-score-leader", "player1", { xIn: 24, yIn: 14 }, 5),
      activated: true,
      metadata: { upkeepsPaidThisControlPhase: [] },
    },
    {
      ...leader("p2-ender", "player2", { xIn: 24, yIn: 34 }, 5),
      activated: true,
      metadata: { upkeepsPaidThisControlPhase: [] },
    },
    {
      ...warrior("p2-support", "player2", { xIn: 30, yIn: 34 }, true),
      metadata: { upkeepsPaidThisControlPhase: [] },
    },
  ],
  terrain,
  deploymentBackEdgeBySide: { player1: "south", player2: "north" },
  scenario: {
    packetKey: "steamroller-2026",
    packetYear: "2026",
    scenarioName: "Pressure Point",
    attackerSideKey: "player1",
    defenderSideKey: "player2",
    scoringStartSideKey: "player2",
    scoringStartTurnNumber: 2,
    score: { player1: 2, player2: 0 },
    scoringHistory: [{
      key: "3:player1:objective:center-50:turn_end:player1",
      round: 3,
      sideKey: "player1",
      elementType: "objective",
      elementKey: "center-50",
      scoringWindow: "turn_end:player1",
      points: 2,
      sourceActionType: "end_turn",
      sourceEventType: "steamroller_2026_turn_end_scoring",
      reason: "steamroller_2026_turn_end_scoring",
      sequence: 1,
    }],
    objectives: [{ objectiveKey: "center-50", baseSizeMm: 50, xIn: 24, yIn: 24 }],
    caches: [],
  },
};

const hiddenScoreOracle = replayWarmachineTerminalRouteStrictV2(
  hiddenScorePredecessor,
  [{ actionType: "end_turn" }],
  {
    goalType: "scenario_score",
    winnerSideKey: "player1",
    endingSideKey: "player2",
    scoringSideKey: "player1",
  },
);
assert.equal(hiddenScoreOracle.strictWitness, true, JSON.stringify({
  rejected: hiddenScoreOracle.rejected,
  score: hiddenScoreOracle.finalState.scenario?.score,
  proof: hiddenScoreOracle.proof,
  events: hiddenScoreOracle.receipts.flatMap((receipt) => receipt.events || []),
}, null, 2));
assert.deepEqual(hiddenScoreOracle.finalState.scenario.score, { player1: 4, player2: 0 });
assert.equal(hiddenScoreOracle.finalState.activeSideKey, "player1");
assert.equal(hiddenScoreOracle.finalState.turnNumber, 4);

const scoreDomain = buildWarmachineTerminalHypothesisDomainV1({
  scenarioKey: "pressure-point",
  scenarioPacketKey: "steamroller-2026",
  scenarioPacketYear: "2026",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  rosterReceiptHash: "micro-two-leader-score-roster-v1",
  specs: [{
    goalType: "scenario_score",
    roundNumbers: [3],
    winnerSideKeys: ["player1"],
    loserSideKeys: ["player2"],
    endingSideKeys: ["player2"],
    causalActionFamilies: ["steamroller_turn_end_settlement"],
    scoringElementKeys: ["center-50"],
    scoreBeforeTerminalCells: [{
      relationKey: "player1_leads_by_two",
      scoreBySide: { player1: 2, player2: 0 },
    }],
    terminalScoreGainCells: [{
      relationKey: "player1_scores_pressure_point_center_objective_two",
      scoreGainBySide: { player1: 2, player2: 0 },
    }],
    geometryRelationCells: [{
      relationKind: "scenario_control_at_settlement",
      scenarioRelation: "player1_controls_center_objective_player2_does_not_contest",
      lineOfSightRelation: "not_required_for_scoring",
      pathRelation: "no_movement_in_terminal_step",
      exactCoordinatesKnown: true,
      exactCoordinates: {
        piecePositions: {
          "p1-scorer": { xIn: 21, yIn: 24 },
          "p1-score-leader": { xIn: 24, yIn: 14 },
          "p2-ender": { xIn: 24, yIn: 34 },
          "p2-support": { xIn: 30, yIn: 34 },
        },
      },
    }],
    assumptionSources: {
      goalType: "user_constrained",
      roundNumber: "user_constrained",
      winnerSideKey: "user_constrained",
      loserSideKey: "rule_derived",
      endingSideKey: "rule_derived",
      causalActionFamily: "rule_derived",
      scoringElementKey: "optimistic_proposal",
      scoreBeforeTerminalCell: "optimistic_proposal",
      terminalScoreGainCell: "optimistic_proposal",
      geometryRelationCell: "optimistic_proposal",
    },
  }],
});

const scoreSpatialMaterialization = materializeWarmachineTerminalSpatialCellsV1(
  hiddenScorePredecessor,
  scoreDomain.cells,
  { terminalAction: { actionType: "end_turn" } },
);
assert.equal(scoreSpatialMaterialization.ok, true,
  JSON.stringify(scoreSpatialMaterialization));
assert.equal(scoreSpatialMaterialization.strictMaterializedCount, 1);
const scoreTerminalState = scoreSpatialMaterialization.runtimeRoots[0].terminalState;
assert.equal(
  warmachineReverseStateSemanticHashV1(scoreTerminalState),
  warmachineReverseStateSemanticHashV1(hiddenScoreOracle.finalState),
);

const scoreReverse = generateWarmachineTerminalEventPredecessorsV1(
  scoreTerminalState,
  scoreDomain.cells[0],
);
const hiddenScorePrepared = enumerateWarmachineBenchmarkActionsV2(hiddenScorePredecessor, {
  includeActorlessActions: true,
  actionFamilyKeys: ["timing"],
}).state;
const hiddenScorePredecessorHash = warmachineReverseStateSemanticHashV1(hiddenScorePrepared);
assert.equal(scoreReverse.ok, true, JSON.stringify(scoreReverse.unresolved));
assert.equal(scoreReverse.strictCandidateCount, 1);
assert.equal(scoreReverse.strictRejectedCount, 0);
assert.equal(scoreReverse.unresolvedCount, 0);
assert.ok(scoreReverse.candidates.some((candidate) =>
  candidate.predecessorStateHash === hiddenScorePredecessorHash), JSON.stringify({
  hiddenScorePredecessorHash,
  candidateHashes: scoreReverse.candidates.map((candidate) => candidate.predecessorStateHash),
  differences: differingPaths(
    withoutStateKeys(normalizeRulesV1State(hiddenScorePrepared)),
    withoutStateKeys(normalizeRulesV1State(scoreReverse.candidates[0]?.predecessorState || {})),
  ),
}, null, 2));

const hiddenScoreActivationStart = structuredClone(hiddenScorePredecessor);
hiddenScoreActivationStart.stateKey = "hidden-score-activation-start";
hiddenScoreActivationStart.pieces.find((piece) =>
  piece.pieceKey === "p2-ender").activated = false;
hiddenScoreActivationStart.pieces.find((piece) =>
  piece.pieceKey === "p2-support").activated = false;
const hiddenScoreActivationPrepared = enumerateWarmachineBenchmarkActionsV2(
  hiddenScoreActivationStart,
  {
    actorPieceKeys: ["p2-ender"],
    actionFamilyKeys: ["timing"],
  },
).state;
const scoreActivationReverse = reverseWarmachinePassActivationSequenceV1(
  scoreReverse.candidates[0].predecessorState,
  { sideKey: "player2", maximumDepth: 3 },
);
const hiddenScoreActivationHash = warmachineReverseStateSemanticHashV1(
  hiddenScoreActivationPrepared,
);
assert.equal(scoreActivationReverse.ok, true, JSON.stringify(scoreActivationReverse.unresolved));
assert.equal(scoreActivationReverse.boundaryCount, 1);
assert.equal(scoreActivationReverse.unresolvedCount, 0);
assert.ok(scoreActivationReverse.runtimeBoundaries.some((boundary) =>
  warmachineReverseStateSemanticHashV1(boundary.state) === hiddenScoreActivationHash),
JSON.stringify({
  hiddenScoreActivationHash,
  boundaryHashes: scoreActivationReverse.runtimeBoundaries.map((boundary) =>
    warmachineReverseStateSemanticHashV1(boundary.state)),
  unresolved: scoreActivationReverse.unresolved,
}, null, 2));

const scoreActivationBoundary = scoreActivationReverse.runtimeBoundaries.find((boundary) =>
  warmachineReverseStateSemanticHashV1(boundary.state) === hiddenScoreActivationHash);
const scoreControlReverse = generateWarmachineControlPhasePredecessorsV1(
  scoreActivationBoundary.state,
  { resourceEnvelopeKey: "unchanged" },
);
const hiddenScoreControlStart = structuredClone(hiddenScoreActivationPrepared);
hiddenScoreControlStart.stateKey = "hidden-score-control-start";
hiddenScoreControlStart.phaseKey = "control";
hiddenScoreControlStart.controlPhaseStepKey = "maintenance";
for (const piece of hiddenScoreControlStart.pieces) {
  if (piece.sideKey !== "player2") continue;
  delete piece.upkeepsPaidThisControlPhase;
  if (piece.metadata) delete piece.metadata.upkeepsPaidThisControlPhase;
}
const hiddenScoreControlPrepared = enumerateWarmachineBenchmarkActionsV2(
  hiddenScoreControlStart,
).state;
const hiddenScoreControlHash = warmachineReverseStateSemanticHashV1(hiddenScoreControlPrepared);
const scoreControlProbe = executeWarmachineBenchmarkControlPhaseV2(
  hiddenScoreControlPrepared,
  { routeKey: "hidden-score-control-diagnostic" },
);
assert.equal(scoreControlReverse.ok, true, JSON.stringify({
  rejected: scoreControlReverse.rejected,
  unresolved: scoreControlReverse.unresolved,
  probeOk: scoreControlProbe.ok,
  differences: differingPaths(
    withoutStateKeys(normalizeRulesV1State(scoreActivationBoundary.state)),
    withoutStateKeys(normalizeRulesV1State(scoreControlProbe.state)),
  ),
}));
assert.ok(scoreControlReverse.strictCandidateCount >= 1);
assert.equal(scoreControlReverse.strictRejectedCount, 0);
assert.equal(scoreControlReverse.unresolvedCount, 0);
assert.ok(scoreControlReverse.candidates.some((candidate) =>
  candidate.predecessorStateHash === hiddenScoreControlHash), JSON.stringify({
  hiddenScoreControlHash,
  candidateHashes: scoreControlReverse.candidates.map((candidate) =>
    candidate.predecessorStateHash),
  differences: differingPaths(
    withoutStateKeys(normalizeRulesV1State(hiddenScoreControlPrepared)),
    withoutStateKeys(normalizeRulesV1State(
      scoreControlReverse.candidates[0]?.predecessorState || {},
    )),
  ),
  unresolved: scoreControlReverse.unresolved,
}, null, 2));
const scorePreviousTurnReverse = generateWarmachinePreviousTurnEndPredecessorsV1(
  scoreControlReverse.candidates[0].predecessorState,
  {
    includeRuntimeDiagnostics: true,
    nextSideActivationRestoreModes: ["all_alive_activated"],
  },
);
assert.equal(scorePreviousTurnReverse.ok, true, JSON.stringify({
  rejected: scorePreviousTurnReverse.rejected,
  unresolved: scorePreviousTurnReverse.unresolved,
  differences: differingPaths(
    withoutStateKeys(normalizeRulesV1State(
      scorePreviousTurnReverse.runtimeDiagnostics[0]?.expectedSuccessorState || {},
    )),
    withoutStateKeys(normalizeRulesV1State(
      scorePreviousTurnReverse.runtimeDiagnostics[0]?.executedSuccessorState || {},
    )),
  ),
}));
assert.equal(scorePreviousTurnReverse.strictCandidateCount, 1);
assert.equal(scorePreviousTurnReverse.strictRejectedCount, 0);
assert.equal(scorePreviousTurnReverse.unresolvedCount, 0);
assert.deepEqual(
  scorePreviousTurnReverse.candidates[0].predecessorState.scenario.score,
  { player1: 0, player2: 0 },
);
const scoreOpponentActivationReverse = reverseWarmachinePassActivationSequenceV1(
  scorePreviousTurnReverse.candidates[0].predecessorState,
  { sideKey: "player1", maximumDepth: 3 },
);
assert.equal(scoreOpponentActivationReverse.ok, true,
  JSON.stringify(scoreOpponentActivationReverse.unresolved));
assert.equal(scoreOpponentActivationReverse.boundaryCount, 1);
assert.equal(scoreOpponentActivationReverse.unresolvedCount, 0);
const scoreOpponentControlReverse = generateWarmachineControlPhasePredecessorsV1(
  scoreOpponentActivationReverse.runtimeBoundaries[0].state,
  { resourceEnvelopeKey: "unchanged" },
);
assert.equal(scoreOpponentControlReverse.ok, true, JSON.stringify({
  rejected: scoreOpponentControlReverse.rejected,
  unresolved: scoreOpponentControlReverse.unresolved,
}));
assert.ok(scoreOpponentControlReverse.strictCandidateCount >= 1);
const scoreWorklist = searchWarmachineTerminalRootedOpponentTurnV1(
  scoreTerminalState,
  scoreDomain.cells[0],
  { maximumActivationDepth: 5, maximumOpponentActivationDepth: 5 },
);
assert.equal(scoreWorklist.ok, true, JSON.stringify(scoreWorklist.unresolved));
assert.ok(scoreWorklist.routeCount >= 1);
assert.equal(scoreWorklist.unresolvedCount, 0);
assert.equal(scoreWorklist.routes[0].completeOpponentTurnRecovered, true);
assert.equal(scoreWorklist.routes[0].legalDeploymentReached, false);
const scoreDeploymentSearch = searchWarmachineTerminalRootedToDeploymentV1(
  scoreTerminalState,
  scoreDomain.cells[0],
  terminalToDeploymentOptions,
);
assert.equal(scoreDeploymentSearch.ok, true, JSON.stringify({
  unresolved: scoreDeploymentSearch.unresolved.slice(0, 12),
  rejected: scoreDeploymentSearch.rejected.slice(0, 12),
  routeLabelCount: scoreDeploymentSearch.routeLabelCount,
  uniqueStateCount: scoreDeploymentSearch.uniqueStateCount,
}, null, 2));
assert.ok(scoreDeploymentSearch.legalDeploymentRouteCount >= 1);
assert.ok(scoreDeploymentSearch.routes.every((route) =>
  route.legalDeploymentReached === true &&
  route.deploymentAudit.legalDeploymentReached === true));
assert.ok(scoreDeploymentSearch.routes.every((route) =>
  route.fullRouteStrictReplayCertified === true), JSON.stringify(
  scoreDeploymentSearch.routes.map((route) => route.fullRouteStrictReplay),
  null,
  2,
));
assert.equal(scoreDeploymentSearch.oracleIsolationAudit.passed, true);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_terminal_event_predecessor_v1",
  terminalStateHash: reverse.successorSemanticHash,
  hiddenPredecessorRecovered: true,
  strictCandidateCount: reverse.strictCandidateCount,
  strictRejectedCount: reverse.strictRejectedCount,
  unresolvedCount: reverse.unresolvedCount,
  assassinationActivationBoundaryRecovered: true,
  assassinationActivationReverseDepth:
    assassinationActivationReverse.runtimeBoundaries[0].depth,
  assassinationControlStartRecovered: true,
  assassinationControlTransitionCount:
    assassinationControlReverse.candidates[0].strictTransitionCount,
  assassinationPreviousTurnEndRecovered: true,
  assassinationCompleteOpponentTurnRecovered: true,
  assassinationOpponentActivationReverseDepth:
    assassinationOpponentActivationReverse.runtimeBoundaries[0].depth,
  assassinationWorklistRouteCount: assassinationWorklist.routeCount,
  assassinationLegalDeploymentRouteCount:
    assassinationDeploymentSearch.legalDeploymentRouteCount,
  assassinationTerminalSpatialMaterialized:
    assassinationSpatialMaterialization.strictMaterializedCount === 1,
  assassinationRecursiveRouteLabelCount: assassinationDeploymentSearch.routeLabelCount,
  assassinationPausedCheckpointFrontierCount:
    assassinationPausedSearch.runtimeResumeCheckpoint.frontierCount,
  assassinationResumeCheckpointAccepted:
    assassinationDeploymentSearch.resumeCheckpoint.accepted,
  assassinationFullRouteStrictReplayCertifiedCount:
    assassinationDeploymentSearch.fullRouteStrictReplayCertifiedCount,
  scoreTerminalStateHash: scoreReverse.successorSemanticHash,
  hiddenScorePredecessorRecovered: true,
  scoreStrictCandidateCount: scoreReverse.strictCandidateCount,
  scoreStrictRejectedCount: scoreReverse.strictRejectedCount,
  scoreUnresolvedCount: scoreReverse.unresolvedCount,
  scoreActivationBoundaryRecovered: true,
  scoreActivationReverseDepth: scoreActivationReverse.runtimeBoundaries[0].depth,
  scoreActivationVisitedStateCount: scoreActivationReverse.visitedStateCount,
  scoreControlStartRecovered: true,
  scoreControlTransitionCount: scoreControlReverse.candidates[0].strictTransitionCount,
  scorePreviousTurnEndRecovered: true,
  scoreCompleteOpponentTurnRecovered: true,
  scoreOpponentActivationReverseDepth:
    scoreOpponentActivationReverse.runtimeBoundaries[0].depth,
  scoreWorklistRouteCount: scoreWorklist.routeCount,
  scoreLegalDeploymentRouteCount: scoreDeploymentSearch.legalDeploymentRouteCount,
  scoreTerminalSpatialMaterialized:
    scoreSpatialMaterialization.strictMaterializedCount === 1,
  scoreRecursiveRouteLabelCount: scoreDeploymentSearch.routeLabelCount,
  scoreFullRouteStrictReplayCertifiedCount:
    scoreDeploymentSearch.fullRouteStrictReplayCertifiedCount,
  reportHash: reverse.reportHash,
  scoreReportHash: scoreReverse.reportHash,
  oracleIsolationPassed: reverse.oracleIsolationAudit.passed,
}, null, 2));

export {
  assassinationDeploymentSearch,
  assassinationTerminalState,
  domain as assassinationTerminalDomain,
};
