#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import { buildSepsiraSixSwarmVsFaneTaskV1 } from
  "../src/matchup/custom-matchup-task-v1.mjs";
import { WARMACHINE_GENERIC_ROSTER_POOL_V1_SOURCE_HASH } from
  "../src/matchup/generic-roster-pool-v1.mjs";
import { compileWarmachineTaskRosterUniverseV1 } from
  "../src/matchup/task-roster-universe-v1.mjs";
import { warmachinePieceInPlayV1 } from "../src/reverse/piece-lifecycle-v1.mjs";
import { replayWarmachineTerminalRouteStrictV2 } from
  "../src/reverse/strict-route-witness-v2.mjs";
import {
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  auditRulesV1SteamrollerScenarioTerrainSetup,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(reverseDirectory,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1"));

function loadJsonWithHash(filePath) {
  const bytes = fs.readFileSync(filePath);
  return {
    value: JSON.parse(bytes),
    contentHash: createHash("sha256").update(bytes).digest("hex"),
  };
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

function reportHashValid(report = {}) {
  const { reportHash, ...core } = report;
  return stableGraphHash(core) === reportHash;
}

function evidenceHashValid(evidence = {}) {
  const { evidenceHash, ...core } = evidence;
  return stableGraphHash(core) === evidenceHash;
}

function resourceValue(piece = {}) {
  return Number(piece.resourcePoints ?? piece.focus ?? piece.fury ?? piece.resource2 ?? 0);
}

function boxesRemaining(piece = {}) {
  return Number(piece.boxesRemaining ?? piece.damage?.boxesRemaining ?? 0);
}

const poolPath = path.join(outputDirectory, "goal-conditioned-roster-pool.json");
const routingPath = path.join(outputDirectory, "terminal-demand-routing.json");
const corpusPath = path.join(outputDirectory, "terminal-demand-evidence-corpus.json");
const routingEvidencePath = path.join(outputDirectory,
  "terminal-demand-routing-task-evidence.json");
const loadedPool = loadJsonWithHash(poolPath);
const pool = loadedPool.value;
const routing = loadJsonWithHash(routingPath).value;
const corpus = loadJsonWithHash(corpusPath).value;
const routingEvidence = loadJsonWithHash(routingEvidencePath).value;
const evidenceGroup = routingEvidence.evidenceGroups?.find((group) =>
  group.strictTerminalRootCount === 1 && routing.routedGroups.some((routingGroup) =>
    routingGroup.groupKey === group.groupKey &&
    routingGroup.goalFamily === "assassination"));
assert.ok(evidenceGroup, "one assassination task-roster terminal-root group is required");
const groupKey = evidenceGroup.groupKey;
const evidenceDirectory = path.join(outputDirectory, "terminal-route-evidence");
const report = loadJsonWithHash(path.join(evidenceDirectory,
  `${groupKey}-report.json`)).value;
const runtime = loadJsonWithHash(path.join(evidenceDirectory,
  `${groupKey}-runtime.json`)).value;

assert.equal(reportHashValid(report), true);
assert.equal(evidenceHashValid(routingEvidence), true);
assert.equal(runtime.reportHash, report.reportHash);
assert.equal(report.routingGroupKey, groupKey);
assert.equal(report.matchupTerminalRootProven, true);
assert.equal(report.taskRosterTerminalRouteProven, true);
assert.equal(report.strictMaterializedRootCount, 1);
assert.equal(report.strictTerminalRootCount, 1);
assert.equal(report.representativeBinding.bindingProven, true);
assert.equal(report.representativeBinding.issueCount, 0);
assert.equal(report.independentReplayEvidence.independentStrictReplayProven, true);
assert.equal(report.independentReplayEvidence.priorStrictReceiptsUsedAsExecutionInput, false);
assert.equal(report.deploymentToTerminalReachabilityProven, false);
assert.deepEqual(report.gameValueInterval, { lowerBound: 0, upperBound: 1 });
assert.equal(report.naturalWinRate, null);
assert.equal(report.trainingTruth, false);

const task = buildSepsiraSixSwarmVsFaneTaskV1();
assert.equal(report.taskHash, task.taskHash);
assert.equal(pool.taskHash, task.taskHash);
assert.equal(pool.source.constructionHostReceiptHash,
  warmachineConstructionHost.receipt.receiptHash);
assert.equal(pool.source.forceBuilderSourceHash,
  warmachineConstructionHost.receipt.sourceHashes[
    "android-shell/assets/companion/force-builder.js"
  ]);
assert.equal(pool.source.genericRosterGeneratorSourceHash,
  WARMACHINE_GENERIC_ROSTER_POOL_V1_SOURCE_HASH);
assert.equal(routing.taskHash, task.taskHash);
assert.equal(routingEvidence.taskHash, task.taskHash);
assert.equal(corpus.hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(pool.terminalDemand.evidenceCorpusHash,
  corpus.evidenceCorpus.evidenceCorpusHash);
const group = routing.routedGroups.find((entry) => entry.groupKey === groupKey);
assert.ok(group);
assert.equal(group.routingGroupHash, evidenceGroup.baseRoutingGroupHash);
assert.equal(group.rulesEngineCapabilityEvidence.matchupRosterRouteProven, false);
assert.equal(evidenceGroup.genericCapabilityPinMatchupRosterRouteProven, false);
assert.equal(evidenceGroup.strictTerminalRootCount, 1);
assert.equal(evidenceGroup.strictReachableRouteCount, 0);
assert.equal(evidenceGroup.strictRejectedRouteCount, 0);
assert.equal(evidenceGroup.unresolvedRouteCount, group.representativeCount);
assert.equal(evidenceGroup.deploymentToTerminalReachabilityProven, false);
assert.deepEqual(evidenceGroup.gameValueInterval, { lowerBound: 0, upperBound: 1 });

const representative = corpus.representativeSelection.selectedRepresentatives.find((entry) =>
  entry.subcellKey === report.representativeBinding.subcellKey);
assert.ok(representative);
assert.equal(group.representativeKeys.includes(representative.subcellKey), true);
assert.equal(representative.cellKey, report.representativeBinding.cellKey);
assert.equal(representative.scenarioKey, "two_fronts");
assert.equal(representative.representativeRoundNumber, 2);
assert.equal(representative.coordinates.actionRange, "strictly_inside");
assert.equal(representative.coordinates.resource, "zero_available");
assert.equal(representative.coordinates.damage, "leader_at_terminal_threshold");
assert.equal(representative.coordinates.scenarioTerrainSetup,
  "all_selected_from_single_candidate");

const poolsByKey = {
  [task.sides.subject.sourcePoolKey]: sourcePool(
    task.sides.subject.sourcePoolKey,
    pool.subjectPool,
    loadedPool.contentHash,
    pool.schemaVersion,
  ),
  [task.sides.challenger.sourcePoolKey]: sourcePool(
    task.sides.challenger.sourcePoolKey,
    pool.challengerPool,
    loadedPool.contentHash,
    pool.schemaVersion,
  ),
};
const universe = compileWarmachineTaskRosterUniverseV1({ task, poolsByKey });
const subjectCompiled = universe.sides.subject.rosters.find((roster) =>
  roster.sourceListKey === report.opening.subjectRosterKey);
const challengerCompiled = universe.sides.challenger.rosters.find((roster) =>
  roster.sourceListKey === report.opening.challengerRosterKey);
assert.ok(subjectCompiled);
assert.ok(challengerCompiled);
assert.equal(group.subjectRosterCandidates.some((candidate) =>
  candidate.rosterKey === subjectCompiled.rosterKey), true);
assert.equal(group.challengerRosterCandidates.some((candidate) =>
  candidate.rosterKey === challengerCompiled.rosterKey), true);
const subjectRoster = pool.subjectPool.rosters.find((roster) =>
  roster.key === report.opening.subjectRosterKey);
const challengerRoster = pool.challengerPool.rosters.find((roster) =>
  roster.key === report.opening.challengerRosterKey);
assert.ok(subjectRoster);
assert.ok(challengerRoster);
assert.equal(subjectRoster.totalPoints, 100);
assert.equal(challengerRoster.totalPoints, 100);
assert.equal(subjectRoster.warnings.length, 0);
assert.equal(challengerRoster.warnings.length, 0);
assert.equal(subjectRoster.entries.filter((entry) =>
  /^Mechanithrall Swarm #\d+$/.test(entry.name)).length, 6);
assert.equal(subjectRoster.entries.filter((entry) =>
  /^Mechanithrall Swarm Warden #\d+$/.test(entry.name)).length, 6);
assert.equal(subjectRoster.physicalModels + challengerRoster.physicalModels,
  report.opening.modelCount);

assert.equal(runtime.roots.length, 1);
const root = runtime.roots[0];
assert.equal(root.upstreamReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(stableGraphHash(root.preTerminalState), root.preTerminalStateHash);
assert.equal(stableGraphHash(root.terminalState), root.terminalStateHash);
assert.equal(root.preTerminalState.pieces.length, report.opening.modelCount);
assert.equal(root.preTerminalState.pieces.filter((piece) =>
  warmachinePieceInPlayV1(piece)).length, report.opening.modelCount);
const placementAudit = auditRulesV1StaticPlacement(root.preTerminalState);
const formationAudit = auditRulesV1StaticUnitFormation(root.preTerminalState);
const scenarioTerrainAudit = auditRulesV1SteamrollerScenarioTerrainSetup(
  root.preTerminalState,
);
assert.equal(placementAudit.ok, true);
assert.equal(formationAudit.ok, true);
assert.equal(scenarioTerrainAudit.ok, true);
assert.equal(scenarioTerrainAudit.setupClassKey,
  representative.coordinates.scenarioTerrainSetup);

const actor = root.preTerminalState.pieces.find((piece) =>
  piece.pieceKey === report.selectedActor.actorPieceKey);
const target = root.preTerminalState.pieces.find((piece) =>
  piece.pieceKey === report.terminalRequest.targetLeaderPieceKey);
assert.ok(actor);
assert.ok(target);
assert.equal(actor.isWarbeast, true);
assert.equal(resourceValue(actor), 0);
assert.equal(boxesRemaining(target), 1);

const acceptedAttempt = report.attempts.find((attempt) =>
  attempt.materialization?.dispositionCounts?.strict_materialized === 1);
const rejectedNoChoiceAttempt = report.attempts.find((attempt) =>
  attempt.declineCount === 0);
assert.ok(acceptedAttempt);
assert.ok(rejectedNoChoiceAttempt);
assert.equal(acceptedAttempt.declineCount, 1);
assert.equal(rejectedNoChoiceAttempt.materialization.dispositionCounts.strict_rejected, 1);
assert.deepEqual(acceptedAttempt.routeSteps.map((step) => step.actionType), [
  "melee_attack",
  "resolve_lifecycle_trigger_decline",
]);
const replay = replayWarmachineTerminalRouteStrictV2(
  root.preTerminalState,
  acceptedAttempt.routeSteps,
  { goalType: "assassination", winnerSideKey: report.terminalRequest.attackerSideKey },
  { routeKey: `verify-custom-matchup-terminal-root:${groupKey}` },
);
assert.equal(replay.strictWitness, true);
assert.equal(replay.rejected, null);
assert.equal(replay.receipts.length, 2);
assert.deepEqual(replay.receipts.map((receipt) => receipt.actionType), [
  "melee_attack",
  "resolve_lifecycle_trigger_decline",
]);
assert.equal(stableGraphHash(replay.finalState), root.terminalStateHash);
assert.equal(replay.receipts.some((receipt) => receipt.events.some((event) =>
  event.eventType === "terminal")), true);
assert.equal(replay.receipts.some((receipt) => receipt.actionType ===
  "resolve_lifecycle_trigger_decline"), true);

console.log(JSON.stringify({
  ok: true,
  taskHash: task.taskHash,
  groupKey,
  representativeSubcellKey: representative.subcellKey,
  representativeCellKey: representative.cellKey,
  sourceRosters: {
    subject: subjectRoster.key,
    challenger: challengerRoster.key,
  },
  totalPoints: {
    subject: subjectRoster.totalPoints,
    challenger: challengerRoster.totalPoints,
  },
  modelCount: report.opening.modelCount,
  actorPieceKey: actor.pieceKey,
  targetPieceKey: target.pieceKey,
  independentReplayWitnessHash: replay.witnessHash,
  terminalStateHash: root.terminalStateHash,
  strictTerminalRootCount: evidenceGroup.strictTerminalRootCount,
  strictReachableRouteCount: evidenceGroup.strictReachableRouteCount,
  unresolvedRouteCount: evidenceGroup.unresolvedRouteCount,
  deploymentToTerminalReachabilityProven: false,
}, null, 2));
