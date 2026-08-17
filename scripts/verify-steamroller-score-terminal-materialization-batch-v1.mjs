import assert from "node:assert/strict";

import {
  enumerateWarmachineBenchmarkActionsV2,
  executeScopedWarmachineBenchmarkActionV2,
} from "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import {
  WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_LAYOUTS_V1,
  WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_SOURCE_V1,
} from "../src/contracts/steamroller-2026-official-scenario-layout-v1.mjs";
import { buildWarmachineSteamrollerTerminalScenarioCorpusV1 } from
  "../src/reverse/steamroller-terminal-scenario-corpus-v1.mjs";
import {
  buildWarmachineScoreTerminalHypothesisCellFromMaterializedRootV1,
  materializeWarmachineSteamrollerScoreTerminalBatchV1,
} from
  "../src/reverse/steamroller-score-terminal-materialization-batch-v1.mjs";
import {
  buildWarmachineSteamrollerScoreTerminalAnchorProposalV1,
  buildWarmachineSteamrollerScoreTerminalAnchorProposalsV1,
  WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_ROSTER_RECEIPT_V1,
  WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_SCENARIO_KEYS_V1,
} from "../src/reverse/steamroller-score-terminal-anchor-proposals-v1.mjs";
import {
  generateWarmachineTerminalEventPredecessorsV1,
  warmachineReverseStateSemanticHashV1,
} from "../src/reverse/terminal-event-predecessor-v1.mjs";
import { searchWarmachineTerminalRootedToDeploymentV1 } from
  "../src/reverse/terminal-rooted-to-deployment-v1.mjs";
import { replayWarmachineTerminalReverseRouteV1 } from
  "../src/reverse/replay-terminal-reverse-route-v1.mjs";
import { normalizeRulesV1State } from "../src/warmachine-host-runtime.mjs";

function stateDifferences(left, right, path = "state", rows = []) {
  if (rows.length >= 40) return rows;
  if (Object.is(left, right)) return rows;
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      stateDifferences(left[index], right[index], `${path}[${index}]`, rows);
    }
    return rows;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
      if (key === "stateKey") continue;
      stateDifferences(left[key], right[key], `${path}.${key}`, rows);
    }
    return rows;
  }
  rows.push({ path, expected: left, observed: right });
  return rows;
}

const scenarioKeys = WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_SCENARIO_KEYS_V1;
const expectedWinnerSourceCounts = {
  trench_warfare: { objective_40: 1 },
  two_fronts: { objective_50: 1 },
  wolves_at_our_heels: { objective_40: 1 },
  pressure_point: { objective_50: 1 },
  high_stakes: { objective_50: 1 },
  fault_line: { objective_40: 1 },
  payload: { objective_50: 1 },
};
const expectedScoreBefore = {
  trench_warfare: { player1: 2, player2: 0 },
  two_fronts: { player1: 2, player2: 0 },
  wolves_at_our_heels: { player1: 2, player2: 0 },
  pressure_point: { player1: 4, player2: 0 },
  high_stakes: { player1: 2, player2: 0 },
  fault_line: { player1: 2, player2: 0 },
  payload: { player1: 2, player2: 0 },
};
const expectedScoreAfter = {
  ...expectedScoreBefore,
  trench_warfare: { player1: 3, player2: 0 },
  two_fronts: { player1: 3, player2: 0 },
  wolves_at_our_heels: { player1: 3, player2: 0 },
  pressure_point: { player1: 6, player2: 0 },
  high_stakes: { player1: 3, player2: 0 },
  fault_line: { player1: 3, player2: 0 },
  payload: { player1: 3, player2: 0 },
};
const expectedAnchorCardIds = [
  "c0053f2b-1ee9-493a-80c7-05d7156ae019",
  "7eef3759-c676-4e67-bcec-f2d671362f52",
];
const expectedAnchorRosterKeys = [
  "cryx_generated_001_um-ch-mm-rl-xh-dh-al",
  "fane_nymara-the-shadowblade_generated_001_uh-ch-mh-rh-xh-dh-am",
];
assert.deepEqual(
  Object.keys(WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_LAYOUTS_V1).sort(),
  [...scenarioKeys].sort(),
);
assert.equal(WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_SOURCE_V1
  .measurementConvention, "diagram_distances_are_table_edge_to_base_edge");
for (const layout of Object.values(
  WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_LAYOUTS_V1,
)) {
  assert.equal(layout.geometryExactWithinBranch, true, layout.scenarioKey);
  assert.equal(layout.deploymentGeometryExactWithinScope, true, layout.scenarioKey);
  assert.deepEqual(layout.deploymentBackEdgeBySide,
    { player1: "south", player2: "north" }, layout.scenarioKey);
  assert.deepEqual(
    Object.fromEntries(Object.entries(layout.deployments).map(([key, zone]) => [
      key,
      { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
    ])),
    {
      p1_deploy: { x: 24, y: 3, width: 48, height: 6 },
      p2_deploy: { x: 24, y: 42.5, width: 48, height: 11 },
    },
    layout.scenarioKey,
  );
  assert.equal(layout.scenarioElementPlacementBranch,
    "no_valid_terrain_within_5in_flags_are_30mm_obstructions", layout.scenarioKey);
  for (const element of [
    ...(layout.objectives || []),
    ...(layout.terrain || []),
    ...(layout.caches || []),
  ]) {
    const measurement = element.edgeMeasurement;
    const radiusIn = Number(measurement.baseSizeMm) / 25.4 / 2;
    const expectedX = measurement.xEdge === "west"
      ? measurement.xDistanceIn + radiusIn
      : 48 - measurement.xDistanceIn - radiusIn;
    const expectedY = measurement.yEdge === "south"
      ? measurement.yDistanceIn + radiusIn
      : 48 - measurement.yDistanceIn - radiusIn;
    assert.ok(Math.abs(element.xIn - expectedX) <= 0.000001,
      `${layout.scenarioKey}:${element.objectiveKey || element.terrainKey || element.cacheKey}:x`);
    assert.ok(Math.abs(element.yIn - expectedY) <= 0.000001,
      `${layout.scenarioKey}:${element.objectiveKey || element.terrainKey || element.cacheKey}:y`);
    assert.equal(element.geometryExactWithinScope, true);
    assert.deepEqual(element.geometryIssues, []);
  }
}
const corpus = buildWarmachineSteamrollerTerminalScenarioCorpusV1({
  rosterReceiptHash: WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_ROSTER_RECEIPT_V1,
});
const batch = materializeWarmachineSteamrollerScoreTerminalBatchV1({
  corpus,
  proposals: buildWarmachineSteamrollerScoreTerminalAnchorProposalsV1(),
});

assert.equal(batch.proposedRootCount, 7);
assert.equal(batch.strictMaterializedRootCount, 7);
assert.equal(batch.strictRejectedRootCount, 0);
assert.equal(batch.budgetDeferredRootCount, 0);
assert.equal(batch.uniqueStrictMaterializedSubcellCount, 7);
assert.deepEqual(batch.results.map((row) => row.scenarioKey).sort(), [...scenarioKeys].sort());
assert.equal(batch.results.every((row) =>
  row.strictReplayCertified && !row.reachabilityProven && !row.trainingTruth), true);
assert.equal(batch.results.every((row) =>
  !row.settlementEvidence.eventTypes.includes("killbox_penalty")), true);
assert.equal(new Set(batch.results.map((row) => row.subcellKey)).size, 7);
assert.equal(Object.values(batch.dispositionsByCellKey).every((row) =>
  row.strictMaterializedSubcellCount === "1"), true);
assert.equal(batch.runtimeRoots.length, 7);
assert.equal(batch.runtimeRoots.every((root) => root.predecessorState.pieces.every((piece) =>
  Array.isArray(piece.upkeepsPaidThisControlPhase) &&
  Array.isArray(piece.metadata?.upkeepsPaidThisControlPhase))), true);
assert.equal(batch.runtimeRoots.every((root) =>
  JSON.stringify(root.predecessorState.pieces.map((piece) => piece.cardId)) ===
    JSON.stringify(expectedAnchorCardIds)), true);
assert.equal(batch.runtimeRoots.every((root) =>
  root.predecessorState.pieces.every((piece) =>
    piece.modelId && piece.cardSnapshot?.id === piece.cardId)), true);
assert.equal(batch.runtimeRoots.every((root) =>
  root.predecessorState.pieces.every((piece) =>
    piece.metadata?.scoreTerminalExecutionProjection ===
      "identity_stats_health_resource_and_turn_end_only_v1" &&
    /^[a-f0-9]{64}$/.test(piece.metadata?.fullSourcePieceHash || "") &&
    /^[a-f0-9]{64}$/.test(piece.metadata?.fullCardSnapshotHash || ""))), true);
for (const result of batch.results) {
  assert.equal(result.pieceIdentitySource.sourceKind,
    "strict_legal_100_point_fixed_roster_v2", result.scenarioKey);
  assert.equal(result.pieceIdentitySource.sourceRemoteVersion, "40041",
    result.scenarioKey);
  assert.deepEqual(result.pieceIdentitySource.cardIds, expectedAnchorCardIds,
    result.scenarioKey);
  assert.deepEqual(Object.values(result.pieceIdentitySource.sourceRosters)
    .map((roster) => roster.listKey), expectedAnchorRosterKeys, result.scenarioKey);
  assert.equal(result.pieceIdentitySource.executionProjectionKind,
    "identity_stats_health_resource_and_turn_end_only_v1", result.scenarioKey);
  assert.equal(result.pieceIdentitySource.fullSourcePieceHashes.every((hash) =>
    /^[a-f0-9]{64}$/.test(hash)), true, result.scenarioKey);
  assert.equal(result.pieceIdentitySource.fullCardSnapshotHashes.every((hash) =>
    /^[a-f0-9]{64}$/.test(hash)), true, result.scenarioKey);
  assert.deepEqual(result.winnerSourceCounts,
    expectedWinnerSourceCounts[result.scenarioKey], result.scenarioKey);
  assert.deepEqual(result.opponentSourceCounts, {}, result.scenarioKey);
  assert.deepEqual(result.scoreBefore, expectedScoreBefore[result.scenarioKey],
    `${result.scenarioKey}:score-before`);
  assert.deepEqual(result.scoreAfter, expectedScoreAfter[result.scenarioKey],
    `${result.scenarioKey}:score-after`);
  assert.equal(result.predecessorHistoryEvidence.strictCertified, true,
    `${result.scenarioKey}:strict-history`);
  assert.equal(result.predecessorHistoryEvidence.strictTransitionCount, 10,
    `${result.scenarioKey}:history-transition-count`);
  assert.equal(result.predecessorHistoryEvidence.prefixTerminalEventCount, 0,
    `${result.scenarioKey}:history-terminal-count`);
  assert.equal(result.predecessorHistoryEvidence.scoringHistory.length, 2,
    `${result.scenarioKey}:history-score-window-count`);
}
assert.deepEqual(
  batch.results.find((row) => row.scenarioKey === "high_stakes")
    .partitionAudit.evidence.find((row) => row.partitionKey === "highStakesCountdownState")
    .observed.countdowns.sort((left, right) => left - right),
  [3, 5, 5],
);

const setupChoiceState = batch.runtimeRoots.find((row) =>
  row.scenarioKey === "two_fronts").predecessorState;
const unresolvedSetupChoiceState = structuredClone(setupChoiceState);
unresolvedSetupChoiceState.terrain.find((terrain) => terrain.isScenarioTerrain)
  .scenarioTerrainSetupChoiceResolved = false;
assert.notEqual(
  warmachineReverseStateSemanticHashV1(setupChoiceState),
  warmachineReverseStateSemanticHashV1(unresolvedSetupChoiceState),
  "Scenario Terrain setup-choice state must remain part of reverse-search identity",
);

const reverseRows = batch.runtimeRoots.map((runtimeRoot) => {
  const hypothesisCell =
    buildWarmachineScoreTerminalHypothesisCellFromMaterializedRootV1(runtimeRoot);
  const reverse = generateWarmachineTerminalEventPredecessorsV1(
    runtimeRoot.terminalState,
    hypothesisCell,
  );
  assert.equal(reverse.strictCandidateCount, 1, runtimeRoot.scenarioKey);
  assert.equal(reverse.strictRejectedCount, 0, runtimeRoot.scenarioKey);
  assert.equal(reverse.unresolvedCount, 0, runtimeRoot.scenarioKey);
  const expectedPredecessorHash =
    warmachineReverseStateSemanticHashV1(runtimeRoot.predecessorState);
  if (reverse.candidates[0].predecessorStateHash !== expectedPredecessorHash) {
    throw new Error(`reverse_predecessor_state_mismatch:${runtimeRoot.scenarioKey}:${JSON.stringify(
      stateDifferences(
        normalizeRulesV1State(runtimeRoot.predecessorState),
        normalizeRulesV1State(reverse.candidates[0].predecessorState),
      ),
    )}`);
  }
  return {
    scenarioKey: runtimeRoot.scenarioKey,
    hypothesisBridgeHash: hypothesisCell.hypothesisBridgeHash,
    strictCandidateCount: reverse.strictCandidateCount,
    predecessorStateHash: reverse.candidates[0].predecessorStateHash,
    scenarioSettlementRestoration:
      reverse.candidates[0].mutation.scenarioSettlementRestoration,
    reportHash: reverse.reportHash,
  };
});

function priorTurnSearchOptions(runtimeRoot) {
  return {
    deployments: WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_LAYOUTS_V1[
      runtimeRoot.scenarioKey
    ].deployments,
    firstPlayerSideKey: "player1",
    terminalEventOptions: {
      terminalActionTypes: ["end_turn"],
      maximumTerminalActions: 1,
      resourcePreimagePointsByPieceKey: {},
    },
    maximumReverseTurns: 1,
    maximumRouteLabels: 8,
    maximumUniqueStates: 8,
    maximumCompletedRoutes: 2,
    stopAfterCompletedRouteCount: 1,
    maximumActivationDepth: 64,
    maximumActivationLabels: 16,
    maximumActivationUniqueStates: 16,
    maximumActivationGroupsPerExpansion: 1,
    maximumActivationCandidatesPerExpansion: 1,
    maximumActivationPassActorsPerExpansion: 1,
    stopAfterActivationBoundaryRouteCount: 1,
    activationGroupOrderKeys: [`${runtimeRoot.scenarioKey}:player2-leader`],
    activationGroupOrderKeysBySide: {
      player1: [`${runtimeRoot.scenarioKey}:player1-leader`],
      player2: [`${runtimeRoot.scenarioKey}:player2-leader`],
    },
    includeMovement: false,
    includePass: true,
    movementActionTypes: [],
    resourceEnvelopeKey: "search_control_predecessor",
    resourceEnvelopeModes: ["reverse_focus_control_pass_baseline"],
    controlResidueModes: ["empty_previous_control"],
    nextSideActivationRestoreModes: ["all_alive_activated"],
    previousTurnEndMaintenanceResourcePreimageModes: [
      "focus_battlegroup_control_pass_baseline",
    ],
    recordMaintenanceResourcePreimageCoverageDebt: true,
    maximumControlSteps: 128,
    maximumDeploymentSlotOrigins: 4,
    maximumDeploymentSlotRings: 1,
    certifyFullRouteStrictReplay: true,
  };
}

const priorTurnSearchRows = batch.runtimeRoots.map((runtimeRoot) => {
  const hypothesis =
    buildWarmachineScoreTerminalHypothesisCellFromMaterializedRootV1(runtimeRoot);
  const search = searchWarmachineTerminalRootedToDeploymentV1(
    runtimeRoot.terminalState,
    hypothesis,
    priorTurnSearchOptions(runtimeRoot),
  );
  assert.equal(search.routeLabelCount, 2, runtimeRoot.scenarioKey);
  assert.equal(search.uniqueStateCount, 2, runtimeRoot.scenarioKey);
  assert.equal(search.runtimeReachedPriorTurnFrontiers.length, 1, runtimeRoot.scenarioKey);
  const frontier = search.runtimeReachedPriorTurnFrontiers[0];
  const replay = replayWarmachineTerminalReverseRouteV1({
    candidateKey: frontier.candidateKey,
    predecessorState: frontier.state,
    predecessorStateHash: frontier.stateHash,
    reverseEdges: frontier.reverseEdges,
  }, runtimeRoot.terminalState, {
    routeKey: `verify-score-terminal-public-replay:${runtimeRoot.scenarioKey}`,
    maximumControlSteps: 128,
    captureTrainingTrace: true,
  });
  assert.equal(replay.fullRouteStrictReplayCertified, true, runtimeRoot.scenarioKey);
  if (runtimeRoot.scenarioKey === "payload") {
    const payloadTurnEnds = replay.trainingTrace.decisions.filter((decision) =>
      decision.selectedAction?.actionType === "end_turn");
    assert.equal(payloadTurnEnds.length, 2);
    assert.equal(payloadTurnEnds.every((decision) =>
      decision.actionPatch?.steamroller2026Decision?.payload
        ?.moveByObjectiveKey?.["p1-payload"]?.decline === true), true);
  }
  assert.equal(search.unresolved.some((row) =>
    row.reason === "control_inverse_unresolved"), false, runtimeRoot.scenarioKey);
  assert.equal(search.unresolved.some((row) =>
    row.reason === "terminal_to_deployment_reverse_turn_budget_exhausted"), true,
  runtimeRoot.scenarioKey);
  return {
    scenarioKey: runtimeRoot.scenarioKey,
    routeLabelCount: search.routeLabelCount,
    uniqueStateCount: search.uniqueStateCount,
    reachedPriorTurnFrontierCount: search.runtimeReachedPriorTurnFrontiers.length,
    publicReplayCertified: replay.fullRouteStrictReplayCertified,
  };
});

const tampered = buildWarmachineSteamrollerScoreTerminalAnchorProposalV1("high_stakes");
tampered.partitionCoordinates.highStakesCountdownState = "exactly_one_element_detonated";
const negative = materializeWarmachineSteamrollerScoreTerminalBatchV1({
  corpus,
  proposals: [tampered],
});
assert.equal(negative.strictMaterializedRootCount, 0);
assert.equal(negative.strictRejectedRootCount, 0);
assert.equal(negative.proposalFilteredRootCount, 1);
assert.equal(negative.results[0].disposition, "proposal_filtered");
assert.equal(negative.results[0].strictRulesConclusion, false);
assert.equal(negative.results[0].reason, "terminal_batch_declared_partitions_not_proven");

const tamperedHistory = buildWarmachineSteamrollerScoreTerminalAnchorProposalV1("payload");
tamperedHistory.predecessorState.scenario.score.player1 += 1;
const tamperedHistoryBatch = materializeWarmachineSteamrollerScoreTerminalBatchV1({
  corpus,
  proposals: [tamperedHistory],
});
assert.equal(tamperedHistoryBatch.strictMaterializedRootCount, 0);
assert.equal(tamperedHistoryBatch.strictRejectedRootCount, 0);
assert.equal(tamperedHistoryBatch.inputInvalidRootCount, 1);
assert.equal(tamperedHistoryBatch.results[0].disposition, "input_invalid");
assert.equal(tamperedHistoryBatch.results[0].reason,
  "terminal_batch_predecessor_history_not_strict_certified");

const wrongRoster = buildWarmachineSteamrollerScoreTerminalAnchorProposalV1("two_fronts");
wrongRoster.rosterReceiptHash = "different-roster-domain";
const wrongRosterBatch = materializeWarmachineSteamrollerScoreTerminalBatchV1({
  corpus,
  proposals: [wrongRoster],
});
assert.equal(wrongRosterBatch.strictMaterializedRootCount, 0);
assert.equal(wrongRosterBatch.strictRejectedRootCount, 0);
assert.equal(wrongRosterBatch.inputInvalidRootCount, 1);
assert.equal(wrongRosterBatch.results[0].disposition, "input_invalid");
assert.equal(wrongRosterBatch.results[0].reason, "terminal_batch_roster_receipt_mismatch");

const wrongScoreSource = buildWarmachineSteamrollerScoreTerminalAnchorProposalV1("two_fronts");
const twoFrontsCell = corpus.cells.find((cell) =>
  cell.scenarioKey === "two_fronts" &&
  cell.terminalClassKey === "lead_three_after_opponent_turn_scoring" &&
  cell.endingSideKey === "player2" &&
  Number(cell.roundClass?.representativeRoundNumber) === 3);
const actualTwoFronts = batch.results.find((row) => row.scenarioKey === "two_fronts");
const wrongTransition = corpus.scenarios.find((scenario) =>
  scenario.scenarioKey === "two_fronts").scoreTransitionDomain.transitions.find((transition) =>
  Number(transition.leadBefore) === actualTwoFronts.leadBefore &&
  Number(transition.leadAfter) === actualTwoFronts.leadAfter &&
  transition.scoreTransitionKey !== actualTwoFronts.scoreTransitionKey &&
  transition.scoringGainClass?.representativeWinnerCounts?.objective_40 === 1 &&
  Object.keys(transition.scoringGainClass?.representativeOpponentCounts || {}).length === 0);
assert.ok(twoFrontsCell);
assert.ok(wrongTransition);
wrongScoreSource.partitionCoordinates.scoreTransition = wrongTransition.scoreTransitionKey;
const wrongScoreSourceBatch = materializeWarmachineSteamrollerScoreTerminalBatchV1({
  corpus,
  proposals: [wrongScoreSource],
});
assert.equal(wrongScoreSourceBatch.strictMaterializedRootCount, 0);
assert.equal(wrongScoreSourceBatch.strictRejectedRootCount, 0);
assert.equal(wrongScoreSourceBatch.proposalFilteredRootCount, 1);
assert.equal(wrongScoreSourceBatch.results[0].disposition, "proposal_filtered");
assert.equal(wrongScoreSourceBatch.results[0].reason,
  "terminal_batch_score_transition_not_in_corpus");

const detonatingProposal = buildWarmachineSteamrollerScoreTerminalAnchorProposalV1("high_stakes");
const redFuse = detonatingProposal.predecessorState.terrain.find((terrain) =>
  terrain.terrainKey === "red-fuse");
redFuse.countdownTokens = 1;
const detonationScoped = enumerateWarmachineBenchmarkActionsV2(
  detonatingProposal.predecessorState,
  { includeActorlessActions: true, actionFamilyKeys: ["timing"] },
);
const detonationAction = detonationScoped.enumeration.actions.find((action) =>
  action.actionType === "end_turn");
assert.ok(detonationAction);
const detonationExecution = executeScopedWarmachineBenchmarkActionV2(
  detonationScoped,
  detonationAction,
  { actionKey: detonationAction.actionKey },
  {
    routeKey: "verify-score-terminal:high-stakes-detonation",
    actionPatch: detonatingProposal.actionPatch,
  },
);
assert.equal(detonationExecution.ok, true);
const detonationEvents = detonationExecution.transition.events || [];
assert.ok(detonationEvents.some((event) =>
  event.eventType === "high_stakes_element_detonated"));
const detonationSettlement = detonationEvents.find((event) =>
  event.eventType === "steamroller_2026_turn_end_settled");
assert.ok(detonationSettlement);
const highStakesRoot = batch.runtimeRoots.find((row) => row.scenarioKey === "high_stakes");
const detonationRoot = {
  ...highStakesRoot,
  subcellKey: "verify-high-stakes-detonation-inverse-gap",
  predecessorState: structuredClone(detonationScoped.state),
  terminalState: structuredClone(
    detonationExecution.normalizedState || detonationExecution.state,
  ),
  terminalActionPatch: structuredClone(detonatingProposal.actionPatch),
  receiptHash: detonationExecution.receipt.receiptHash,
  settlementEvidence: {
    scored: detonationSettlement.scored || [],
    combinationBonuses: detonationSettlement.combinationBonuses || [],
    preScoring: detonationSettlement.preScoring || null,
    postScoring: detonationSettlement.postScoring || null,
    victory: detonationSettlement.victory || null,
    scenarioMutationEvents: detonationEvents.filter((event) => [
      "high_stakes_countdown_removed",
      "high_stakes_magical_blast_damage",
      "high_stakes_element_detonated",
    ].includes(event.eventType)),
  },
};
const detonationHypothesis =
  buildWarmachineScoreTerminalHypothesisCellFromMaterializedRootV1(detonationRoot);
const detonationReverse = generateWarmachineTerminalEventPredecessorsV1(
  detonationRoot.terminalState,
  detonationHypothesis,
);
assert.equal(detonationReverse.strictCandidateCount, 1);
assert.equal(detonationReverse.strictRejectedCount, 0);
assert.equal(detonationReverse.unresolvedCount, 0);
assert.deepEqual(detonationReverse.candidates[0].matchedProbability, {
  numerator: "1",
  denominator: "3",
  decimal: 1 / 3,
});
assert.equal(detonationReverse.candidates[0].predecessorStateHash,
  warmachineReverseStateSemanticHashV1(detonationScoped.state));
assert.deepEqual(
  detonationReverse.candidates[0].mutation.scenarioSettlementRestoration.restored
    .map((row) => row.eventType),
  ["high_stakes_countdown_removed", "high_stakes_element_detonated"],
);

function executeHighStakesBlast(targetSpecsInput, extraPieceSpecs = []) {
  const targetSpecs = typeof targetSpecsInput === "number"
    ? [{
        pieceKey: "high-stakes:blast-target",
        boxesRemaining: targetSpecsInput,
        position: { xIn: 42, yIn: 20.590551 },
      }]
    : targetSpecsInput;
  assert.ok(Array.isArray(targetSpecs) && targetSpecs.length > 0);
  const proposal = buildWarmachineSteamrollerScoreTerminalAnchorProposalV1("high_stakes");
  proposal.predecessorState.terrain.find((terrain) =>
    terrain.terrainKey === "red-fuse").countdownTokens = 1;
  const resolvedTargetSpecs = targetSpecs.map((spec) => {
    const existing = spec.useExistingLeaderSideKey
      ? proposal.predecessorState.pieces.find((piece) =>
          piece.sideKey === spec.useExistingLeaderSideKey &&
          (piece.isWarcaster === true || piece.isWarlock === true))
      : null;
    assert.ok(!spec.useExistingLeaderSideKey || existing,
      `missing existing leader for ${spec.useExistingLeaderSideKey || ""}`);
    return { ...spec, pieceKey: existing?.pieceKey || spec.pieceKey, existing };
  });
  for (const spec of extraPieceSpecs) {
    const controller = spec.controllerSideLeader
      ? proposal.predecessorState.pieces.find((piece) =>
          piece.sideKey === spec.controllerSideLeader &&
          (piece.isWarcaster === true || piece.isWarlock === true))
      : null;
    assert.ok(!spec.controllerSideLeader || controller,
      `missing extra-piece controller for ${spec.controllerSideLeader || ""}`);
    proposal.predecessorState.pieces.push({
      ...spec,
      controllerPieceKey: controller?.pieceKey || spec.controllerPieceKey || "",
    });
  }
  for (const [index, spec] of resolvedTargetSpecs.entries()) {
    const targetPatch = {
      pieceKey: spec.pieceKey,
      label: spec.label || spec.existing?.label || `High Stakes Blast Target ${index + 1}`,
      sideKey: spec.sideKey || spec.existing?.sideKey || "player2",
      pieceType: spec.pieceType || spec.existing?.pieceType || "warrior",
      modelRole: spec.modelRole || spec.existing?.modelRole || "warrior",
      modelType: spec.modelType || spec.existing?.modelType || "warrior model",
      position: spec.position,
      baseSizeIn: spec.baseSizeIn ?? spec.existing?.baseSizeIn ?? 1.18,
      armor: spec.armor ?? spec.existing?.armor ?? 12,
      damage: {
        boxes: spec.boxesRemaining,
        boxesRemaining: spec.boxesRemaining,
        maxBoxes: spec.boxesRemaining,
      },
      destroyed: false,
      removedFromPlay: false,
      offTable: false,
      notDeployed: false,
      activated: true,
      canScoreOrContest: spec.canScoreOrContest ?? false,
      specialRules: spec.specialRules || spec.existing?.specialRules || [],
      ...spec.piecePatch,
    };
    if (spec.existing) Object.assign(spec.existing, targetPatch);
    else proposal.predecessorState.pieces.push(targetPatch);
  }
  proposal.actionPatch.steamroller2026Decision.highStakes
    .blastDamageDiceByPieceKey = Object.fromEntries(resolvedTargetSpecs.map((spec) => [
      spec.pieceKey,
      spec.damageDice || [1, 1],
    ]));
  const scoped = enumerateWarmachineBenchmarkActionsV2(
    proposal.predecessorState,
    { includeActorlessActions: true, actionFamilyKeys: ["timing"] },
  );
  const action = scoped.enumeration.actions.find((candidate) =>
    candidate.actionType === "end_turn");
  assert.ok(action);
  const execution = executeScopedWarmachineBenchmarkActionV2(
    scoped,
    action,
    { actionKey: action.actionKey },
    {
      routeKey: `verify-score-terminal:high-stakes-blast:${resolvedTargetSpecs
        .map((spec) => `${spec.pieceKey}:${spec.boxesRemaining}`).join(",")}`,
      actionPatch: proposal.actionPatch,
    },
  );
  assert.equal(execution.ok, true);
  const events = execution.transition.events || [];
  const settlement = events.find((event) =>
    event.eventType === "steamroller_2026_turn_end_settled");
  assert.ok(settlement);
  const root = {
    ...highStakesRoot,
    subcellKey: `verify-high-stakes-blast-${resolvedTargetSpecs
      .map((spec) => `${spec.pieceKey}:${spec.boxesRemaining}`).join(",")}`,
    predecessorState: structuredClone(scoped.state),
    terminalState: structuredClone(execution.normalizedState || execution.state),
    terminalActionPatch: structuredClone(proposal.actionPatch),
    receiptHash: execution.receipt.receiptHash,
    settlementEvidence: {
      scored: settlement.scored || [],
      combinationBonuses: settlement.combinationBonuses || [],
      preScoring: settlement.preScoring || null,
      postScoring: settlement.postScoring || null,
      victory: settlement.victory || null,
      scenarioMutationEvents: events.filter((event) => [
        "high_stakes_countdown_removed",
        "high_stakes_magical_blast_damage",
        "high_stakes_element_detonated",
      ].includes(event.eventType)),
    },
  };
  return { scoped, events, root };
}

const nonlethalBlast = executeHighStakesBlast(10);
const nonlethalDamageEvent = nonlethalBlast.events.find((event) =>
  event.eventType === "high_stakes_magical_blast_damage");
assert.equal(nonlethalDamageEvent.damage, 4);
assert.equal(nonlethalDamageEvent.boxesRemainingBefore, 10);
assert.equal(nonlethalDamageEvent.boxesRemainingAfter, 6);
assert.equal(nonlethalDamageEvent.inverseMutationScope, "damage_only_exact_v1");
const nonlethalHypothesis =
  buildWarmachineScoreTerminalHypothesisCellFromMaterializedRootV1(nonlethalBlast.root);
const nonlethalReverse = generateWarmachineTerminalEventPredecessorsV1(
  nonlethalBlast.root.terminalState,
  nonlethalHypothesis,
);
assert.equal(nonlethalReverse.strictCandidateCount, 1);
assert.equal(nonlethalReverse.unresolvedCount, 0);
assert.deepEqual(nonlethalReverse.candidates[0].matchedProbability, {
  numerator: "1",
  denominator: "108",
  decimal: 1 / 108,
});
assert.equal(nonlethalReverse.candidates[0].predecessorStateHash,
  warmachineReverseStateSemanticHashV1(nonlethalBlast.scoped.state));
assert.deepEqual(
  nonlethalReverse.candidates[0].mutation.scenarioSettlementRestoration.restored
    .map((row) => row.eventType),
  [
    "high_stakes_countdown_removed",
    "high_stakes_magical_blast_damage",
    "high_stakes_element_detonated",
  ],
);

const tamperedNonlethalRoot = structuredClone(nonlethalBlast.root);
tamperedNonlethalRoot.settlementEvidence.scenarioMutationEvents.find((event) =>
  event.eventType === "high_stakes_magical_blast_damage")
  .damageStateAfter.boxesRemaining = 5;
const tamperedNonlethalHypothesis =
  buildWarmachineScoreTerminalHypothesisCellFromMaterializedRootV1(tamperedNonlethalRoot);
const tamperedNonlethalReverse = generateWarmachineTerminalEventPredecessorsV1(
  tamperedNonlethalRoot.terminalState,
  tamperedNonlethalHypothesis,
);
assert.equal(tamperedNonlethalReverse.strictCandidateCount, 0);
assert.ok(tamperedNonlethalReverse.unresolved.some((row) =>
  row.reason === "high_stakes_blast_damage_inverse_state_mismatch"));

const lethalBlast = executeHighStakesBlast(1);
const lethalDamageEvent = lethalBlast.events.find((event) =>
  event.eventType === "high_stakes_magical_blast_damage");
assert.equal(lethalDamageEvent.inverseMutationScope,
  "target_state_exact_v1");
assert.ok(lethalBlast.events.some((event) => event.eventType === "disabled"));
assert.ok(lethalBlast.events.some((event) => event.eventType === "boxed"));
assert.ok(lethalBlast.events.some((event) => event.eventType === "destroyed"));
const lethalHypothesis =
  buildWarmachineScoreTerminalHypothesisCellFromMaterializedRootV1(lethalBlast.root);
const lethalReverse = generateWarmachineTerminalEventPredecessorsV1(
  lethalBlast.root.terminalState,
  lethalHypothesis,
);
assert.equal(lethalReverse.strictCandidateCount, 1);
assert.equal(lethalReverse.unresolvedCount, 0);
assert.deepEqual(lethalReverse.candidates[0].matchedProbability, {
  numerator: "1",
  denominator: "108",
  decimal: 1 / 108,
});
assert.equal(lethalReverse.candidates[0].predecessorStateHash,
  warmachineReverseStateSemanticHashV1(lethalBlast.scoped.state));

const multiTargetBlast = executeHighStakesBlast([{
  pieceKey: "high-stakes:blast-target-a",
  boxesRemaining: 10,
  position: { xIn: 42, yIn: 20.590551 },
}, {
  pieceKey: "high-stakes:blast-target-b",
  boxesRemaining: 10,
  position: { xIn: 42, yIn: 22 },
}]);
const multiTargetDamageEvents = multiTargetBlast.events.filter((event) =>
  event.eventType === "high_stakes_magical_blast_damage");
assert.equal(multiTargetDamageEvents.length, 2);
assert.equal(multiTargetDamageEvents.every((event) =>
  event.inverseMutationScope === "damage_only_exact_v1"), true);
const multiTargetHypothesis =
  buildWarmachineScoreTerminalHypothesisCellFromMaterializedRootV1(multiTargetBlast.root);
const multiTargetReverse = generateWarmachineTerminalEventPredecessorsV1(
  multiTargetBlast.root.terminalState,
  multiTargetHypothesis,
);
assert.equal(multiTargetReverse.strictCandidateCount, 1, JSON.stringify({
  rejected: multiTargetReverse.rejected,
  unresolved: multiTargetReverse.unresolved,
}));
assert.equal(multiTargetReverse.unresolvedCount, 0);
assert.deepEqual(multiTargetReverse.candidates[0].matchedProbability, {
  numerator: "1",
  denominator: "3888",
  decimal: 1 / 3888,
});
assert.equal(multiTargetReverse.candidates[0].predecessorStateHash,
  warmachineReverseStateSemanticHashV1(multiTargetBlast.scoped.state));

const leaderSideEffectBlast = executeHighStakesBlast([{
  useExistingLeaderSideKey: "player2",
  boxesRemaining: 1,
  position: { xIn: 42, yIn: 20.590551 },
  damageDice: [6, 6],
}], [{
  pieceKey: "high-stakes:leader-side-effect-beast",
  label: "High Stakes Leader Side Effect Beast",
  sideKey: "player2",
  controllerSideLeader: "player2",
  modelRole: "warbeast",
  modelType: "warbeast",
  isWarbeast: true,
  position: { xIn: 8, yIn: 8 },
  baseSizeIn: 1.97,
  armor: 18,
  damage: { boxes: 20, boxesRemaining: 20, maxBoxes: 20 },
  resourceKind: "fury",
  resourcePoints: 2,
  resource2: 2,
  fury: 2,
  resourceMax: 4,
  statusTags: [],
  specialRules: [],
  activated: true,
  canScoreOrContest: false,
}]);
const leaderSideEffectDamageEvent = leaderSideEffectBlast.events.find((event) =>
  event.eventType === "high_stakes_magical_blast_damage");
assert.ok(leaderSideEffectDamageEvent);
assert.equal(leaderSideEffectDamageEvent.externalStateUnchanged, false);
assert.equal(leaderSideEffectDamageEvent.inverseMutationScope,
  "target_and_external_state_exact_v1");
assert.equal(leaderSideEffectDamageEvent.externalStatePreimage.changedPieces.length, 1);
const leaderSideEffectHypothesis =
  buildWarmachineScoreTerminalHypothesisCellFromMaterializedRootV1(
    leaderSideEffectBlast.root,
  );
const leaderSideEffectReverse = generateWarmachineTerminalEventPredecessorsV1(
  leaderSideEffectBlast.root.terminalState,
  leaderSideEffectHypothesis,
);
assert.equal(leaderSideEffectReverse.strictCandidateCount, 1, JSON.stringify({
  rejected: leaderSideEffectReverse.rejected,
  unresolved: leaderSideEffectReverse.unresolved,
}));
assert.equal(leaderSideEffectReverse.unresolvedCount, 0);
assert.deepEqual(leaderSideEffectReverse.candidates[0].matchedProbability, {
  numerator: "1",
  denominator: "108",
  decimal: 1 / 108,
});
assert.equal(leaderSideEffectReverse.candidates[0].predecessorStateHash,
  warmachineReverseStateSemanticHashV1(leaderSideEffectBlast.scoped.state));

const tamperedLeaderSideEffectRoot = structuredClone(leaderSideEffectBlast.root);
tamperedLeaderSideEffectRoot.settlementEvidence.scenarioMutationEvents.find((event) =>
  event.eventType === "high_stakes_magical_blast_damage")
  .externalStatePreimage.changedPieces[0].after.resourcePoints = 1;
const tamperedLeaderSideEffectHypothesis =
  buildWarmachineScoreTerminalHypothesisCellFromMaterializedRootV1(
    tamperedLeaderSideEffectRoot,
  );
const tamperedLeaderSideEffectReverse = generateWarmachineTerminalEventPredecessorsV1(
  tamperedLeaderSideEffectRoot.terminalState,
  tamperedLeaderSideEffectHypothesis,
);
assert.equal(tamperedLeaderSideEffectReverse.strictCandidateCount, 0);
assert.ok(tamperedLeaderSideEffectReverse.unresolved.some((row) =>
  row.reason === "high_stakes_external_preimage_state_mismatch"));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_steamroller_score_terminal_materialization_batch_v1",
  corpusHash: corpus.corpusHash,
  batchHash: batch.batchHash,
  officialGeometry: {
    scenarioCount: Object.keys(
      WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_LAYOUTS_V1,
    ).length,
    placementBranch: "no_valid_terrain_within_5in_flags_are_30mm_obstructions",
    measurementConvention: WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_SOURCE_V1
      .measurementConvention,
    deploymentConvention: WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_SOURCE_V1
      .deploymentConvention,
  },
  proposedRootCount: batch.proposedRootCount,
  strictMaterializedRootCount: batch.strictMaterializedRootCount,
  strictRejectedRootCount: batch.strictRejectedRootCount,
  budgetDeferredRootCount: batch.budgetDeferredRootCount,
  results: batch.results.map((row) => ({
    scenarioKey: row.scenarioKey,
    scoreBefore: row.scoreBefore,
    scoreAfter: row.scoreAfter,
    scored: row.settlementEvidence.scored,
    combinationBonuses: row.settlementEvidence.combinationBonuses,
    eventTypes: row.settlementEvidence.eventTypes,
    scoreEvents: row.settlementEvidence.scoreEvents,
    primarySourceFamilyKey: row.primarySourceFamilyKey,
    leadBefore: row.leadBefore,
    leadAfter: row.leadAfter,
    receiptHash: row.receiptHash,
    replayReceiptHash: row.replayReceiptHash,
    subcellKey: row.subcellKey,
  })),
  tamperedPartitionDisposition: negative.results[0].disposition,
  rosterMismatchDisposition: wrongRosterBatch.results[0].disposition,
  wrongScoreSourceDisposition: wrongScoreSourceBatch.results[0].disposition,
  priorTurnSearchRows,
  highStakesDetonationInverse: {
    strictCandidateCount: detonationReverse.strictCandidateCount,
    strictRejectedCount: detonationReverse.strictRejectedCount,
    unresolvedCount: detonationReverse.unresolvedCount,
    unresolvedReasons: [...new Set(detonationReverse.unresolved.map((row) => row.reason))],
    damageTargetCount: 0,
  },
  highStakesBlastDamageInverse: {
    nonlethal: {
      damage: nonlethalDamageEvent.damage,
      boxesRemainingBefore: nonlethalDamageEvent.boxesRemainingBefore,
      boxesRemainingAfter: nonlethalDamageEvent.boxesRemainingAfter,
      inverseMutationScope: nonlethalDamageEvent.inverseMutationScope,
      strictCandidateCount: nonlethalReverse.strictCandidateCount,
      unresolvedCount: nonlethalReverse.unresolvedCount,
      matchedProbability: nonlethalReverse.candidates[0].matchedProbability,
    },
    tamperedWitness: {
      strictCandidateCount: tamperedNonlethalReverse.strictCandidateCount,
      unresolvedReasons: [...new Set(tamperedNonlethalReverse.unresolved
        .map((row) => row.reason))],
    },
    lethalLifecycle: {
      inverseMutationScope: lethalDamageEvent.inverseMutationScope,
      strictCandidateCount: lethalReverse.strictCandidateCount,
      unresolvedCount: lethalReverse.unresolvedCount,
      matchedProbability: lethalReverse.candidates[0].matchedProbability,
      unresolvedReasons: [...new Set(lethalReverse.unresolved.map((row) => row.reason))],
    },
    multiTarget: {
      damageTargetCount: multiTargetDamageEvents.length,
      strictCandidateCount: multiTargetReverse.strictCandidateCount,
      unresolvedCount: multiTargetReverse.unresolvedCount,
      matchedProbability: multiTargetReverse.candidates[0].matchedProbability,
    },
    externalLifecycleSideEffect: {
      inverseMutationScope: leaderSideEffectDamageEvent.inverseMutationScope,
      strictCandidateCount: leaderSideEffectReverse.strictCandidateCount,
      unresolvedCount: leaderSideEffectReverse.unresolvedCount,
      matchedProbability: leaderSideEffectReverse.candidates[0].matchedProbability,
      unresolvedReasons: [...new Set(leaderSideEffectReverse.unresolved
        .map((row) => row.reason))],
      tamperedStrictCandidateCount: tamperedLeaderSideEffectReverse.strictCandidateCount,
      tamperedUnresolvedReasons: [...new Set(tamperedLeaderSideEffectReverse.unresolved
        .map((row) => row.reason))],
    },
  },
  reverseRows,
}, null, 2));
