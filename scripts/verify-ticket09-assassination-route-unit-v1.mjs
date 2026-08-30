#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  bindWarmachineBenchmarkExplicitMovementPathV2,
  bindWarmachineTwoFrontsOpeningV2,
  executeWarmachineBenchmarkAssassinationRouteV2,
} from "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import {
  buildWarmachineRosterPoolSourceEvidenceV2,
  runWarmachineNestedRosterDeploymentSearchV2,
} from "../src/construction/nested-roster-deployment-v2.mjs";
import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import { buildWarmachineSteamrollerOpeningMapTemplateV1 } from
  "../src/matchup/steamroller-opening-map-template-v1.mjs";
import { buildWarmachineTypedInteractionGraphV2 } from
  "../src/graph/typed-interaction-graph-v2.mjs";
import { certifyWarmachineExecutedTerminalRouteStrictV2 } from
  "../src/reverse/strict-route-witness-v2.mjs";
import { auditWarmachineLegalDeploymentReachabilityV1 } from
  "../src/reverse/deployment-reachability-v1.mjs";
import { certifyWarmachineStrictSettlementHistoryBindingV1 } from
  "../src/reverse/steamroller-history-bound-terminal-hypothesis-v1.mjs";
import { loadWarmachineMatchupTemplateRoomV1 } from
  "./load-matchup-template-room-v1.mjs";
import {
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  buildRulesV1MovementPathProposalPlan,
  normalizeRulesV1State,
  warmachineHost,
} from
  "../src/warmachine-host-runtime.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const evidenceRoot = path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
);

function argumentValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

const routeId = argumentValue("route-id");
const subjectRosterKey = argumentValue("subject-roster-key");
const challengerRosterKey = argumentValue("challenger-roster-key");
const challengerLeaderPieceKey = argumentValue("challenger-leader-piece-key");
assert.ok(routeId, "--route-id is required");
assert.ok(subjectRosterKey, "--subject-roster-key is required");
assert.ok(challengerRosterKey, "--challenger-roster-key is required");
assert.ok(challengerLeaderPieceKey, "--challenger-leader-piece-key is required");

const outputPath = path.join(evidenceRoot, `${routeId}-route-unit-v1.json`);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileHash(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sourceEvidence(pool, poolPath, section) {
  return buildWarmachineRosterPoolSourceEvidenceV2(section.rosters, {
    sourceContentHash: fileHash(poolPath),
    sourceSchemaVersion: pool.schemaVersion,
    exactListLegality: section.quality.exactListLegality,
    forceBuilderContract: section.algorithm.finalLegality,
    remoteVersion: section.source.remoteVersion,
    exhaustiveAllFactionRosters: false,
  });
}

function settlementTransition(stage = {}, label = "") {
  assert.ok(stage.preEndState, `${label}: preEndState required`);
  assert.ok(stage.state, `${label}: successor state required`);
  return {
    windowKey: `${label}:round-${stage.preEndState.turnNumber}:${
      stage.preEndState.activeSideKey}`,
    round: stage.preEndState.turnNumber,
    endingSideKey: stage.preEndState.activeSideKey,
    predecessorState: stage.preEndState,
    successorState: stage.state,
    actionPatch: {},
  };
}

function liveLeaderName(state, pieceKey) {
  const leader = state.pieces.find((piece) => piece.pieceKey === pieceKey);
  assert.ok(leader, `Missing leader ${pieceKey}`);
  return String(leader.cardSnapshot?.name || leader.cardName || leader.label || "");
}

function deploymentRectangles(state) {
  return Object.fromEntries((state.deploymentZones || []).map((zone) => [
    zone.zoneKey || zone.deploymentZoneKey,
    {
      id: zone.zoneKey || zone.deploymentZoneKey,
      x: Number(zone.xIn ?? zone.x),
      y: Number(zone.yIn ?? zone.y),
      width: Number(zone.widthIn ?? zone.width),
      height: Number(zone.heightIn ?? zone.height),
    },
  ]));
}

function baseRadius(piece = {}) {
  return Number(piece.baseRadiusIn ??
    Number(piece.baseDiameterIn ?? piece.baseSizeIn ?? 1.2) / 2);
}

function legalMovementProposal(state, actorPieceKey, destination, keyBase) {
  const plan = buildRulesV1MovementPathProposalPlan(state, {
    actorPieceKey,
    actionType: "run",
    destination,
    ignoredPieceKeys: [actorPieceKey],
    keyBase,
  });
  return plan.proposals.find((proposal) =>
    proposal.proposalKind === "host_auto_routed" &&
    proposal.precheckPassed === true) ||
    plan.proposals.find((proposal) => proposal.precheckPassed === true) || null;
}

function injectAssassinationDeployment(stateInput, {
  raptorPieceKey,
  sepsiraPieceKey,
  targetLeaderPieceKey,
  deploymentZones,
}) {
  const xCandidates = Array.from({ length: 45 }, (_, index) => index + 2)
    .sort((left, right) => Math.abs(left - 24) - Math.abs(right - 24) ||
      left - right);
  for (const raptorXIn of xCandidates) {
    for (const sepsiraOffset of [-3, 3, -4.5, 4.5, -6, 6, -9, 9, -12, 12]) {
      const sepsiraXIn = raptorXIn + sepsiraOffset;
      if (sepsiraXIn < 2 || sepsiraXIn > 46) continue;
      const state = structuredClone(stateInput);
      if (!(state.deploymentZones || []).length) {
        state.deploymentZones = structuredClone(deploymentZones || []);
      }
      const raptor = state.pieces.find((piece) => piece.pieceKey === raptorPieceKey);
      const sepsira = state.pieces.find((piece) => piece.pieceKey === sepsiraPieceKey);
      const target = state.pieces.find((piece) => piece.pieceKey === targetLeaderPieceKey);
      assert.ok(raptor && sepsira && target);
      const zonesByRaptorDistance = [...state.deploymentZones].sort((left, right) =>
        Math.abs(Number(left.yIn ?? left.y) - Number(raptor.position?.yIn || 0)) -
        Math.abs(Number(right.yIn ?? right.y) - Number(raptor.position?.yIn || 0)));
      const zonesByTargetDistance = [...state.deploymentZones].sort((left, right) =>
        Math.abs(Number(left.yIn ?? left.y) - Number(target.position?.yIn || 0)) -
        Math.abs(Number(right.yIn ?? right.y) - Number(target.position?.yIn || 0)));
      const player1Zone = zonesByRaptorDistance[0];
      const player2Zone = zonesByTargetDistance[0];
      assert.ok(player1Zone && player2Zone && player1Zone !== player2Zone);
      const player1FrontY = Number(player1Zone.yIn ?? player1Zone.y) +
        Number(player1Zone.heightIn ?? player1Zone.height) / 2 -
        Math.max(baseRadius(raptor), baseRadius(sepsira)) - 0.1;
      const player2FrontY = Number(player2Zone.yIn ?? player2Zone.y) -
        Number(player2Zone.heightIn ?? player2Zone.height) / 2 +
        baseRadius(target) + 0.1;
      raptor.position = { xIn: raptorXIn, yIn: player1FrontY };
      sepsira.position = { xIn: sepsiraXIn, yIn: player1FrontY };
      target.position = { xIn: raptorXIn, yIn: player2FrontY };
      const normalized = normalizeRulesV1State(state);
      if (!auditRulesV1StaticPlacement(normalized).ok ||
          !auditRulesV1StaticUnitFormation(normalized).ok) continue;
      const deployment = auditWarmachineLegalDeploymentReachabilityV1(normalized, {
        firstPlayerSideKey: "player1",
        deployments: deploymentRectangles(normalized),
      });
      if (!deployment.ok) continue;
      const raptorDestination = {
        xIn: raptorXIn,
        yIn: Math.min(47 - baseRadius(raptor), player1FrontY + 11.5),
      };
      const raptorProposal = legalMovementProposal(
        normalized,
        raptorPieceKey,
        raptorDestination,
        `${routeId}:opening-raptor`,
      );
      if (!raptorProposal) continue;
      const afterRaptor = structuredClone(normalized);
      afterRaptor.pieces.find((piece) =>
        piece.pieceKey === raptorPieceKey).position = raptorDestination;
      const sepsiraDestination = {
        xIn: sepsiraXIn,
        yIn: Math.min(47 - baseRadius(sepsira), player1FrontY + 10.5),
      };
      const sepsiraProposal = legalMovementProposal(
        normalizeRulesV1State(afterRaptor),
        sepsiraPieceKey,
        sepsiraDestination,
        `${routeId}:opening-sepsira`,
      );
      if (!sepsiraProposal) continue;
      const afterAttackers = structuredClone(afterRaptor);
      afterAttackers.pieces.find((piece) =>
        piece.pieceKey === sepsiraPieceKey).position = sepsiraDestination;
      const targetDestination = {
        xIn: raptorXIn,
        yIn: Math.max(baseRadius(target) + 1, player2FrontY - 11),
      };
      const targetProposal = legalMovementProposal(
        normalizeRulesV1State(afterAttackers),
        targetLeaderPieceKey,
        targetDestination,
        `${routeId}:defender-leader`,
      );
      if (!targetProposal) continue;
      return {
        state: normalized,
        deployment,
        raptorDestination,
        raptorWaypoints: raptorProposal.waypoints,
        sepsiraDestination,
        sepsiraWaypoints: sepsiraProposal.waypoints,
        targetPosition: target.position,
        targetDestination,
        targetWaypoints: targetProposal.waypoints,
      };
    }
  }
  assert.fail("No strict assassination deployment lane for Raptor and Sepsira");
}

const poolPath = path.join(evidenceRoot, "goal-conditioned-roster-pool.json");
const pool = readJson(poolPath);
const subjectRoster = pool.subjectPool.rosters.find((roster) =>
  roster.key === subjectRosterKey);
const challengerRoster = pool.challengerPool.rosters.find((roster) =>
  roster.key === challengerRosterKey);
assert.ok(subjectRoster, `Missing subject roster ${subjectRosterKey}`);
assert.ok(challengerRoster, `Missing challenger roster ${challengerRosterKey}`);
assert.equal(subjectRoster.totalPoints, 100);
assert.equal(challengerRoster.totalPoints, 100);
assert.equal(subjectRoster.entries.filter((entry) =>
  /^Mechanithrall Swarm #\d+$/i.test(String(entry.name || ""))).length, 6);

const { loadedRoomStore, templateRoom } = loadWarmachineMatchupTemplateRoomV1();
const baseTemplateHash = stableGraphHash({
  roomStoreContentHash: loadedRoomStore.contentHash,
  roomId: templateRoom.id,
  shapes: templateRoom.shapes,
  deployments: templateRoom.deployments,
});
const exactMap = buildWarmachineSteamrollerOpeningMapTemplateV1({
  templateRoom,
  baseTemplateHash,
  mapKey: "mixed_table",
  scenarioKey: "two_fronts",
  firstPlayerSideKey: "player1",
  scenarioTerrainSetupClassKey: "all_selected_from_single_candidate",
});
const nested = runWarmachineNestedRosterDeploymentSearchV2({
  templateRoom: exactMap.templateRoom,
  rosterPoolsBySide: {
    player1: [subjectRoster],
    player2: [challengerRoster],
  },
  sourceEvidenceBySide: {
    player1: sourceEvidence(pool, poolPath, pool.subjectPool),
    player2: sourceEvidence(pool, poolPath, pool.challengerPool),
  },
  maximumSelectedRostersBySide: { player1: 1, player2: 1 },
  maximumRosterPairs: 1,
  maximumArchetypesPerSide: 1,
  maximumFormationPairsPerRosterPair: 1,
  formationArchetypeKeysBySide: {
    player1: ["center_break"],
    player2: ["balanced_layered"],
  },
  firstPlayerSideKeys: ["player1"],
  includeStates: true,
  seed: `${routeId}:${pool.poolSetHash}`,
  searchMode: "ticket09_assassination_route_unit_v1",
});
assert.equal(nested.counts.strictLegalOpeningCount, 1,
  JSON.stringify(nested.rejectedDeployments, null, 2));
const opening = nested.openings[0];
assert.equal(opening.strictDeploymentLegal, true);
assert.equal(opening.rosterPointLedger.sides.player1.rosterPoints, 100);
assert.equal(opening.rosterPointLedger.sides.player2.rosterPoints, 100);

const bound = bindWarmachineTwoFrontsOpeningV2(opening.state);
const initialRaptor = bound.state.pieces.find((piece) => piece.sideKey === "player1" &&
  /raptor/i.test(`${piece.label || ""} ${piece.name || ""}`));
const initialSepsira = bound.state.pieces.find((piece) => piece.sideKey === "player1" &&
  (piece.isWarcaster || piece.isWarlock));
const initialChallengerLeader = bound.state.pieces.find((piece) =>
  piece.pieceKey === challengerLeaderPieceKey);
assert.ok(initialRaptor, "Selected Cryx roster must contain a Raptor");
assert.ok(initialSepsira, "Selected Cryx roster must contain Sepsira");
assert.ok(initialChallengerLeader, `Opening is missing ${challengerLeaderPieceKey}`);

const injected = injectAssassinationDeployment(bound.state, {
  raptorPieceKey: initialRaptor.pieceKey,
  sepsiraPieceKey: initialSepsira.pieceKey,
  targetLeaderPieceKey: initialChallengerLeader.pieceKey,
  deploymentZones: Object.values(exactMap.templateRoom.deployments || {}),
});
const raptor = injected.state.pieces.find((piece) =>
  piece.pieceKey === initialRaptor.pieceKey);
const sepsira = injected.state.pieces.find((piece) =>
  piece.pieceKey === initialSepsira.pieceKey);
const challengerLeader = injected.state.pieces.find((piece) =>
  piece.pieceKey === initialChallengerLeader.pieceKey);

let routeOpening = bindWarmachineBenchmarkExplicitMovementPathV2(injected.state, {
  actorPieceKey: raptor.pieceKey,
  actionType: "run",
  pathKey: `${routeId}-raptor-center-break-run-v1`,
  label: "Raptor strict deployment-lane run",
  waypoints: injected.raptorWaypoints,
});
routeOpening = bindWarmachineBenchmarkExplicitMovementPathV2(routeOpening, {
  actorPieceKey: sepsira.pieceKey,
  actionType: "run",
  pathKey: `${routeId}-sepsira-deployment-lane-run-v1`,
  label: "Sepsira strict deployment-lane run",
  waypoints: injected.sepsiraWaypoints,
});
routeOpening = bindWarmachineBenchmarkExplicitMovementPathV2(routeOpening, {
  actorPieceKey: challengerLeader.pieceKey,
  actionType: "run",
  pathKey: `${routeId}-defender-leader-run-v1`,
  label: "Defender Leader strict engagement-lane run",
  waypoints: injected.targetWaypoints,
});
const route = executeWarmachineBenchmarkAssassinationRouteV2(routeOpening, {
  routeKey: `${routeId}-forward-route-v1`,
  raptorPieceKey: raptor.pieceKey,
  attackerLeaderPieceKey: sepsira.pieceKey,
  targetLeaderPieceKey: challengerLeader.pieceKey,
  raptorWaypoint: injected.raptorDestination,
  attackerLeaderWaypoint: injected.sepsiraDestination,
  openingLeaderRun: true,
  requireOpeningRaptorExplicitPath: true,
  requireDefenderLeaderExplicitPath: true,
  exhaustTargetedSpells: true,
});
assert.equal(route.ok, true, JSON.stringify({
  failures: route.failures,
  targetStartingBoxes: route.targetStartingBoxes,
  targetEndingBoxes: route.targetEndingBoxes,
  positionTimeline: route.positionTimeline,
  openingRaptorActions: route.stages?.attackerFirstTurn?.activationReceipts
    ?.find((activation) => activation.activationGroupKey === raptor.pieceKey)
    ?.selectionAudit,
  openingLeaderActions: route.stages?.attackerFirstTurn?.activationReceipts
    ?.find((activation) => activation.activationGroupKey === sepsira.pieceKey)
    ?.selectionAudit,
  casterActions: route.stages?.casterActivation?.selectionAudit,
  raptorActions: route.stages?.raptorActivation?.selectionAudit,
}, null, 2));
const terminalEvent = route.terminalEvents.find((event) =>
  event.winnerSideKey === "player1");
assert.ok(terminalEvent, JSON.stringify(route.terminalEvents, null, 2));

const witness = certifyWarmachineExecutedTerminalRouteStrictV2(
  routeOpening,
  route.state,
  route.receipts,
  {
    goalType: "assassination",
    winnerSideKey: "player1",
    endingSideKey: "player1",
  },
  {
    routeKey: `${routeId}-strict-route-v1`,
    graph: buildWarmachineTypedInteractionGraphV2(),
    searchMode: "long_horizon",
  },
);
assert.equal(witness.routeExecutionValidated, true,
  JSON.stringify(witness.issues, null, 2));
assert.equal(witness.strictWitness, true, JSON.stringify(witness.proof, null, 2));

const settlementTransitions = [
  settlementTransition(route.stages.attackerFirstTurn, `${routeId}-player1-turn1`),
  settlementTransition(route.stages.defenderTurn, `${routeId}-player2-turn1`),
];
const historyBinding = certifyWarmachineStrictSettlementHistoryBindingV1({
  terminalHypothesis: {
    terminalHypothesisKey: `${routeId}-history`,
    terminalClassKey: "unique_leader_assassination",
    scenarioKey: "two_fronts",
    mapKey: "mixed_table",
    terminalRound: 2,
    endingSideKey: "player1",
    winnerSideKey: "player1",
    loserSideKey: "player2",
  },
  settlementTransitions,
});
assert.equal(historyBinding.ok, true, JSON.stringify(historyBinding.failures, null, 2));
assert.equal(historyBinding.strictCertified, true);
assert.deepEqual(historyBinding.preset.finalScore, { player1: 0, player2: 0 });

const routeOpeningState = normalizeRulesV1State(routeOpening);
const core = stableGraphValue({
  schemaVersion: "warmachine_ticket09_strict_route_unit_v1",
  routeId,
  routeKey: `${routeId}-strict-route-v1`,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  poolSetHash: pool.poolSetHash,
  terminalFamilyKey: "assassination",
  terminalSourceKey: "two_fronts_round2_sepsira_raptor_assassination_v1",
  leaderName: liveLeaderName(routeOpeningState, challengerLeaderPieceKey),
  challengerSideKey: "player2",
  winnerSideKey: terminalEvent.winnerSideKey,
  subjectRosterKey,
  challengerRosterKey,
  rosterPointLedger: opening.rosterPointLedger,
  physicalModelCount: opening.modelCount,
  openingKey: opening.openingKey,
  strictOpeningStateHash: injected.deployment.stateHash,
  strictOpeningEvidenceHash: stableGraphHash(injected.deployment),
  openingAddress: {
    subjectFactionKey: "Cryx",
    challengerFactionKey: "Fane of Nyrro",
    scenarioKey: "two_fronts",
    mapKey: "mixed_table",
    firstPlayerSideKey: "player1",
    deploymentSeedKey: "center_break_vs_balanced_layered",
    physicalModelCount: opening.modelCount,
  },
  strictRoute: {
    strictOpeningComplete: true,
    strictReplayComplete: witness.strictWitness === true,
    assumptionClosureComplete: historyBinding.strictCertified === true,
    transitionCount: route.transitionCount,
    receiptHashes: route.receiptHashes,
    routeReceiptHash: route.routeReceiptHash,
    witnessHash: witness.witnessHash,
    historyBindingHash: historyBinding.bindingHash,
    unresolvedBranchCount: 1,
    rejectedBranchCount: 0,
    candidateSetComplete: false,
    opponentResponseSetComplete: false,
    chanceMassComplete: false,
  },
  observed: {
    targetStartingBoxes: route.targetStartingBoxes,
    targetEndingBoxes: route.targetEndingBoxes,
    terminalEvent,
    scoreTrajectory: historyBinding.preset.scoreTrajectory,
    positionTimeline: route.positionTimeline,
  },
  replayMaterial: {
    openingState: routeOpeningState,
    terminalState: normalizeRulesV1State(route.state),
    receipts: route.receipts,
    settlementTransitions,
  },
  claimBoundary: "This unit proves one current-Host cooperative Sepsira/Raptor route from one exact legal deployment to assassination. It does not prove adversarial defense, Chance closure, candidate completeness, strategy value or natural win rate.",
});
const fixture = { ...core, fixtureHash: stableGraphHash(core) };
fs.mkdirSync(evidenceRoot, { recursive: true });
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(fixture)}\n`);
fs.renameSync(temporaryPath, outputPath);

process.stdout.write(`${JSON.stringify({
  ok: true,
  routeId,
  leaderName: fixture.leaderName,
  subjectRosterKey,
  challengerRosterKey,
  physicalModelCount: fixture.physicalModelCount,
  strictOpeningStateHash: fixture.strictOpeningStateHash,
  transitionCount: fixture.strictRoute.transitionCount,
  terminalEvent: fixture.observed.terminalEvent,
  witnessHash: fixture.strictRoute.witnessHash,
  historyBindingHash: fixture.strictRoute.historyBindingHash,
  fixtureHash: fixture.fixtureHash,
  outputPath,
}, null, 2)}\n`);
