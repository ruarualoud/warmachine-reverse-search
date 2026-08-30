#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bindWarmachineTwoFrontsOpeningV2 } from
  "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import { loadWarmachineMatchupTemplateRoomV1 } from
  "./load-matchup-template-room-v1.mjs";
import { materializeWarmachineMatchupScoreTerminalRootV1 } from
  "../src/matchup/matchup-terminal-root-materializer-v1.mjs";
import { materializeWarmachineRepresentativeOpeningsV1 } from
  "../src/matchup/representative-opening-materializer-v1.mjs";
import {
  buildWarmachineTwoFrontsLeadThreePredecessorSeedV1,
  prepareWarmachineScoreTerminalSeedStateV1 as prepareCommonState,
  setWarmachineNativeResourcesForTerminalSeedV1 as setNativeResources,
} from "../src/matchup/two-fronts-score-terminal-seed-v1.mjs";
import {
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  auditRulesV1SteamrollerScenarioTerrainSetup,
} from "../src/warmachine-host-runtime.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(reverseDirectory,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1"));
const evidenceDirectory = path.join(outputDirectory, "terminal-route-evidence");

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sourcePool(poolKey, section, sourceContentHash, sourceSchemaVersion) {
  return {
    poolKey,
    lists: section.rosters,
    sourceContentHash,
    sourceSchemaVersion,
    exactListLegality: section.quality.exactListLegality,
    forceBuilderContract: section.algorithm.finalLegality,
    remoteVersion: section.source.remoteVersion,
    exhaustiveAllFactionRosters: false,
  };
}

function representativeByKey(corpus = {}, subcellKey = "") {
  const representative = corpus.representativeSelection.selectedRepresentatives
    .find((row) => row.subcellKey === subcellKey);
  assert.ok(representative, `representative missing: ${subcellKey}`);
  return representative;
}

function routingGroupByRepresentative(routing = {}, subcellKey = "") {
  const group = routing.routedGroups.find((row) =>
    row.representativeKeys.includes(subcellKey));
  assert.ok(group, `routing group missing: ${subcellKey}`);
  return group;
}

function pieceMap(state = {}) {
  return new Map((state.pieces || []).map((piece) => [piece.pieceKey, piece]));
}

function positionPiece(byKey, pieceKey, xIn, yIn) {
  const piece = byKey.get(pieceKey);
  assert.ok(piece, `piece missing: ${pieceKey}`);
  piece.position = { xIn, yIn };
}

function buildFilteredPredecessor(sourceState = {}) {
  const state = prepareCommonState(sourceState, {
    scoreBefore: { player1: 0, player2: 5 },
  });
  setNativeResources(state, "zero_available");
  state.scenario.attackerSideKey = "player2";
  state.scenario.defenderSideKey = "player1";
  state.scenario.scoringStartSideKey = "player1";
  const byKey = pieceMap(state);
  const objectives = Object.fromEntries(state.scenario.objectives.map((row) => [
    row.objectiveKey,
    row,
  ]));
  positionPiece(byKey, "player2_hysene_the_executioner_1_1", 4.25, 4.25);
  positionPiece(byKey, "player1_malefactor_22_1",
    objectives["left-50"].xIn + 2.2, objectives["left-50"].yIn);
  positionPiece(byKey, "player1_malefactor_23_1",
    objectives["right-50"].xIn + 2.2, objectives["right-50"].yIn);
  const unitOffsets = [[0, 0], [0, 1.3], [0, -1.3], [-1.3, 0],
    [-1.3, 1.3], [-1.3, -1.3]];
  for (const [groupKey, objectiveKey, wardenKey] of [
    ["player1_mechanithrall_swarm_2", "left-40",
      "player1_mechanithrall_swarm_warden_8_1"],
    ["player1_mechanithrall_swarm_3", "right-40",
      "player1_mechanithrall_swarm_warden_9_1"],
  ]) {
    const objective = objectives[objectiveKey];
    const pieceKeys = [
      ...state.pieces.filter((piece) => piece.unitGroupId === groupKey &&
        !piece.pieceKey.includes("warden")).map((piece) => piece.pieceKey),
      wardenKey,
    ];
    pieceKeys.forEach((pieceKey, index) => positionPiece(
      byKey,
      pieceKey,
      objective.xIn - 2.2 + unitOffsets[index][0],
      objective.yIn + unitOffsets[index][1],
    ));
  }
  positionPiece(byKey, "player1_gorman_di_wulfe_revolutionary_agent_14_1", 27.5, 24);
  const groupOffsets = [[0, 0], [1.3, 0], [0, 1.3], [1.3, 1.3]];
  for (const [groupKey, xIn] of [
    ["player2_fane_stalkers_14", 31.5],
    ["player2_fane_stalkers_15", 35.5],
    ["player2_blood_sirens_16", 39.5],
    ["player2_blood_sirens_17", 43.5],
  ]) {
    state.pieces.filter((piece) => piece.unitGroupId === groupKey)
      .forEach((piece, index) => positionPiece(
        byKey,
        piece.pieceKey,
        xIn + groupOffsets[index][0],
        39 + groupOffsets[index][1],
      ));
  }
  const lastWatch = state.pieces.filter((piece) =>
    piece.unitGroupId === "player2_the_last_watch_18");
  [[31.5, 44], [32.8, 44], [31.5, 45.3]].forEach(([xIn, yIn], index) =>
    positionPiece(byKey, lastWatch[index].pieceKey, xIn, yIn));
  positionPiece(byKey, "player2_lesser_eldritch_7_1", 35.5, 44);
  positionPiece(byKey, "player2_strygon_13_1", 38.5, 44);
  positionPiece(byKey, "player2_cylena_raefyll_9_1", 41.5, 44);
  positionPiece(byKey, "player2_vordak_19_1", 44.5, 44);
  return state;
}

const assassinationRuntime = loadJson(path.join(evidenceDirectory,
  "terminal-demand-group-02df97f2cb22c2ef90d94f61-runtime.json"));
const assassinationReport = loadJson(path.join(evidenceDirectory,
  "terminal-demand-group-02df97f2cb22c2ef90d94f61-report.json"));
const corpus = loadJson(path.join(outputDirectory, "terminal-demand-evidence-corpus.json"));
const routing = loadJson(path.join(outputDirectory, "terminal-demand-routing.json"));
const poolPath = path.join(outputDirectory, "goal-conditioned-roster-pool.json");
const poolBytes = fs.readFileSync(poolPath);
const pool = JSON.parse(poolBytes);
const poolContentHash = createHash("sha256").update(poolBytes).digest("hex");
const task = loadJson(path.join(outputDirectory, "report.json")).task;
const sourceState = assassinationRuntime.roots[0].preTerminalState;
const opening = {
  ...assassinationReport.opening,
  state: structuredClone(sourceState),
};
const taskIdentity = { taskHash: task.taskHash };

const acceptedRepresentative = representativeByKey(corpus,
  "steamroller-terminal-subcell-21f86874a2b08572a20ba2ea52ed6477");
const acceptedGroup = routingGroupByRepresentative(
  routing,
  acceptedRepresentative.subcellKey,
);
const subjectCandidate = acceptedGroup.subjectRosterCandidates[0];
const challengerCandidate = acceptedGroup.challengerRosterCandidates.find((candidate) =>
  candidate.leaderName === "Hysene, the Executioner") ||
  acceptedGroup.challengerRosterCandidates[0];
assert.ok(subjectCandidate);
assert.ok(challengerCandidate);
const { loadedRoomStore, templateRoom } =
  loadWarmachineMatchupTemplateRoomV1();
const routedOpenings = materializeWarmachineRepresentativeOpeningsV1({
  task,
  poolsByTaskSideKey: {
    subject: sourcePool(task.sides.subject.sourcePoolKey, pool.subjectPool,
      poolContentHash, pool.schemaVersion),
    challenger: sourcePool(task.sides.challenger.sourcePoolKey, pool.challengerPool,
      poolContentHash, pool.schemaVersion),
  },
  rosterPairs: [{
    subjectRosterKey: subjectCandidate.sourceListKey,
    challengerRosterKey: challengerCandidate.sourceListKey,
    pairReason: `score-terminal-demand:${acceptedGroup.groupKey}`,
  }],
  exactMapTemplatesByKey: {
    mixed_table: {
      templateRoom,
      templateHash: createHash("sha256").update(JSON.stringify({
        roomStoreContentHash: loadedRoomStore.contentHash,
        roomId: templateRoom.id,
        shapes: templateRoom.shapes,
        deployments: templateRoom.deployments,
      })).digest("hex"),
    },
  },
  scenarioBindersByKey: {
    two_fronts: bindWarmachineTwoFrontsOpeningV2,
  },
  scenarioKeys: ["two_fronts"],
  mapKeys: ["mixed_table"],
  firstPlayerTaskSideKeys: ["challenger"],
  deploymentSeedKeys: ["balanced"],
  maximumMaterializedOpenings: 1,
  includeFullStates: true,
});
assert.equal(routedOpenings.strictOpeningCount, 1);
const acceptedOpening = routedOpenings.openings[0];
const acceptedPredecessor = buildWarmachineTwoFrontsLeadThreePredecessorSeedV1(
  acceptedOpening.state,
).state;
assert.equal(auditRulesV1StaticPlacement(acceptedPredecessor).ok, true);
const acceptedFormationAudit = auditRulesV1StaticUnitFormation(acceptedPredecessor);
assert.equal(acceptedFormationAudit.ok, true, JSON.stringify(acceptedFormationAudit));
assert.equal(acceptedFormationAudit.formations.every((formation) =>
  formation.anchorSource === "existential_movement_anchor" &&
  formation.existentialAnchorProven === true &&
  formation.historicalMovementAnchorProven === false), true);
const alternateAnchorFormation = acceptedFormationAudit.formations.find((formation) => {
  const firstPieceKey = acceptedPredecessor.pieces.filter((piece) =>
    piece.sideKey === formation.sideKey &&
    piece.unitGroupId === formation.unitGroupId).map((piece) =>
    piece.pieceKey).sort()[0];
  return firstPieceKey && firstPieceKey !== formation.anchorPieceKey;
});
assert.ok(alternateAnchorFormation,
  "at least one unit must require an existential non-first movement anchor");
const wrongDeclaredAnchorPieceKey = acceptedPredecessor.pieces.filter((piece) =>
  piece.sideKey === alternateAnchorFormation.sideKey &&
  piece.unitGroupId === alternateAnchorFormation.unitGroupId).map((piece) =>
  piece.pieceKey).sort()[0];
const wrongDeclaredAnchorAudit = auditRulesV1StaticUnitFormation(
  acceptedPredecessor,
  { anchorPieceKeyByUnitGroupKey: {
    [alternateAnchorFormation.groupKey]: wrongDeclaredAnchorPieceKey,
  } },
);
assert.equal(wrongDeclaredAnchorAudit.ok, false);
assert.equal(wrongDeclaredAnchorAudit.issues.some((issue) =>
  issue.code === "STATIC_UNIT_FORMATION_COHERENCY_BROKEN_V1" &&
  issue.unitGroupId === alternateAnchorFormation.unitGroupId), true);
assert.equal(auditRulesV1SteamrollerScenarioTerrainSetup(acceptedPredecessor)
  .setupClassKey, "all_flags_fallback_no_valid_terrain");
const accepted = materializeWarmachineMatchupScoreTerminalRootV1({
  task: taskIdentity,
  opening: acceptedOpening,
  routingGroup: acceptedGroup,
  representative: acceptedRepresentative,
  predecessorState: acceptedPredecessor,
  winnerTaskSideKey: "subject",
  endingTaskSideKey: "challenger",
  scenarioControlWitness: { elementKey: "left-50", sideKey: "player1" },
});
assert.equal(accepted.disposition, "strict_materialized", JSON.stringify({
  disposition: accepted.disposition,
  dispositionReason: accepted.dispositionReason,
  hostDisposition: accepted.batch?.results?.[0]?.disposition,
  hostReason: accepted.batch?.results?.[0]?.reason,
  failedBindingChecks: accepted.representativeBinding?.checks?.filter((check) =>
    !check.passed),
  hostResult: accepted.batch?.results?.[0],
  scenario: {
    turnNumber: acceptedPredecessor.turnNumber,
    activeSideKey: acceptedPredecessor.activeSideKey,
    attackerSideKey: acceptedPredecessor.scenario?.attackerSideKey,
    defenderSideKey: acceptedPredecessor.scenario?.defenderSideKey,
    scoringStartSideKey: acceptedPredecessor.scenario?.scoringStartSideKey,
    score: acceptedPredecessor.scenario?.score,
  },
}));
assert.equal(accepted.matchupTerminalRootProven, true);
assert.equal(accepted.taskRosterTerminalRouteProven, true);
assert.equal(accepted.strictTerminalRootCount, 1);
assert.equal(accepted.representativeBinding.bindingProven, true);
assert.equal(accepted.representativeBinding.issueCount, 0);
assert.equal(accepted.independentReplayEvidence.independentStrictReplayProven, true);
assert.deepEqual(accepted.runtimeRoot.scoreBefore, { player1: 1, player2: 0 });
assert.deepEqual(accepted.runtimeRoot.scoreAfter, { player1: 4, player2: 1 });
assert.deepEqual(accepted.runtimeRoot.winnerSourceCounts, {
  both_40mm_bonus: 1,
  objective_40: 2,
});
assert.deepEqual(accepted.runtimeRoot.opponentSourceCounts, { objective_50: 1 });
assert.equal(accepted.runtimeRoot.subcellKey, acceptedRepresentative.subcellKey);
assert.equal(accepted.runtimeRoot.predecessorState.pieces.length,
  acceptedOpening.modelCount);
assert.equal(accepted.representativeBinding.checks.find((check) =>
  check.checkKey === "subject_roster_routed").passed, true);
assert.equal(accepted.representativeBinding.checks.find((check) =>
  check.checkKey === "challenger_roster_routed").passed, true);

const mismatchedRoutingGroup = structuredClone(acceptedGroup);
mismatchedRoutingGroup.subjectRosterCandidates =
  mismatchedRoutingGroup.subjectRosterCandidates.filter((candidate) =>
    candidate.sourceListKey !== acceptedOpening.subjectRosterKey);
const routingMismatch = materializeWarmachineMatchupScoreTerminalRootV1({
  task: taskIdentity,
  opening: acceptedOpening,
  routingGroup: mismatchedRoutingGroup,
  representative: acceptedRepresentative,
  predecessorState: acceptedPredecessor,
  winnerTaskSideKey: "subject",
  endingTaskSideKey: "challenger",
  scenarioControlWitness: { elementKey: "left-50", sideKey: "player1" },
});
assert.equal(routingMismatch.hostStrictMaterializedRootCount, 1);
assert.equal(routingMismatch.strictMaterializedRootCount, 0);
assert.equal(routingMismatch.disposition, "proposal_filtered");
assert.equal(routingMismatch.dispositionReason,
  "matchup_score_terminal_representative_binding_failed");
assert.equal(routingMismatch.representativeBinding.bindingProven, false);

const filteredRepresentative = representativeByKey(corpus,
  "steamroller-terminal-subcell-390e3d862ae66f085404debdae8e0821");
const filteredGroup = routingGroupByRepresentative(
  routing,
  filteredRepresentative.subcellKey,
);
const filteredPredecessor = buildFilteredPredecessor(sourceState);
assert.equal(auditRulesV1StaticPlacement(filteredPredecessor).ok, true);
assert.equal(auditRulesV1StaticUnitFormation(filteredPredecessor).ok, true);
const filtered = materializeWarmachineMatchupScoreTerminalRootV1({
  task: taskIdentity,
  opening,
  routingGroup: filteredGroup,
  representative: filteredRepresentative,
  predecessorState: filteredPredecessor,
  winnerTaskSideKey: "subject",
  endingTaskSideKey: "challenger",
  scenarioControlWitness: { elementKey: "left-40", sideKey: "player1" },
});
assert.equal(filtered.disposition, "proposal_filtered");
assert.equal(filtered.dispositionReason, "terminal_batch_score_transition_not_in_corpus");
assert.equal(filtered.strictTerminalRootCount, 0);
assert.equal(filtered.matchupTerminalRootProven, false);
assert.equal(filtered.batch.results[0].evidence.netGain, 8,
  JSON.stringify(filtered.batch.results[0].evidence));
assert.deepEqual(filtered.batch.results[0].evidence.winnerSourceCounts, {
  both_40mm_bonus: 1,
  both_50mm_bonus: 1,
  kill_box_penalty: 1,
  objective_40: 2,
  objective_50: 2,
});

const brokenFormation = structuredClone(acceptedPredecessor);
brokenFormation.pieces.find((piece) =>
  piece.pieceKey === "player1_mechanithrall_swarm_2_5").position = { xIn: 46, yIn: 46 };
assert.equal(auditRulesV1StaticPlacement(brokenFormation).ok, true);
assert.equal(auditRulesV1StaticUnitFormation(brokenFormation).ok, false);
const rejected = materializeWarmachineMatchupScoreTerminalRootV1({
  task: taskIdentity,
  opening: acceptedOpening,
  routingGroup: acceptedGroup,
  representative: acceptedRepresentative,
  predecessorState: brokenFormation,
  winnerTaskSideKey: "subject",
  endingTaskSideKey: "challenger",
  scenarioControlWitness: { elementKey: "left-50", sideKey: "player1" },
});
assert.equal(rejected.disposition, "strict_rejected");
assert.equal(rejected.dispositionReason,
  "terminal_batch_static_unit_formation_rejected");
assert.equal(rejected.strictTerminalRootCount, 0);
assert.equal(rejected.matchupTerminalRootProven, false);

console.log(JSON.stringify({
  ok: true,
  accepted: {
    groupKey: acceptedGroup.groupKey,
    subcellKey: acceptedRepresentative.subcellKey,
    scoreBefore: accepted.runtimeRoot.scoreBefore,
    scoreAfter: accepted.runtimeRoot.scoreAfter,
    winnerSourceCounts: accepted.runtimeRoot.winnerSourceCounts,
    modelCount: accepted.runtimeRoot.predecessorState.pieces.length,
    subjectRosterKey: acceptedOpening.subjectRosterKey,
    challengerRosterKey: acceptedOpening.challengerRosterKey,
    reportHash: accepted.reportHash,
  },
  routingMismatch: {
    disposition: routingMismatch.disposition,
    reason: routingMismatch.dispositionReason,
  },
  filtered: {
    groupKey: filteredGroup.groupKey,
    subcellKey: filteredRepresentative.subcellKey,
    reason: filtered.dispositionReason,
    observedNetGain: filtered.batch.results[0].evidence.netGain,
    observedSourceCounts: filtered.batch.results[0].evidence.winnerSourceCounts,
  },
  strictRejected: {
    reason: rejected.dispositionReason,
  },
}, null, 2));
