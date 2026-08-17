#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import { buildSepsiraSixSwarmVsFaneTaskV1 } from
  "../src/matchup/custom-matchup-task-v1.mjs";
import { WARMACHINE_GENERIC_ROSTER_POOL_V1_SOURCE_HASH } from
  "../src/matchup/generic-roster-pool-v1.mjs";
import { materializeWarmachineMatchupAssassinationTerminalRootV1 } from
  "../src/matchup/matchup-terminal-root-materializer-v1.mjs";
import { materializeWarmachineRepresentativeOpeningsV1 } from
  "../src/matchup/representative-opening-materializer-v1.mjs";
import { buildWarmachineSteamrollerFallbackOpeningBindersV1 } from
  "../src/matchup/steamroller-opening-binders-v1.mjs";
import { buildWarmachineSteamrollerOpeningMapTemplateV1 } from
  "../src/matchup/steamroller-opening-map-template-v1.mjs";
import { buildWarmachineTerminalDemandRoutingEvidenceV1 } from
  "../src/matchup/terminal-demand-routing-evidence-v1.mjs";
import { compileWarmachineTaskRosterUniverseV1 } from
  "../src/matchup/task-roster-universe-v1.mjs";
import {
  resolveWarmachineHostPath,
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
const requestedGroupKey = String(process.argv.find((argument) =>
  argument.startsWith("--group="))?.slice("--group=".length) || "");
const requestedLeader = String(process.argv.find((argument) =>
  argument.startsWith("--leader="))?.slice("--leader=".length) || "Hysene");
const requestedActorLabelPattern = String(process.argv.find((argument) =>
  argument.startsWith("--actor="))?.slice("--actor=".length) || "Strygon");

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

function selectedRoutingGroup(routing = {}) {
  const groups = routing.routedGroups || [];
  if (requestedGroupKey) {
    const selected = groups.find((group) => group.groupKey === requestedGroupKey);
    if (!selected) throw new Error(`matchup_terminal_routing_group_missing:${requestedGroupKey}`);
    return selected;
  }
  const selected = groups.find((group) =>
    group.goalFamily === "assassination" &&
    group.exactRoundNumbers?.includes(2) &&
    group.scenarioKeys?.includes("two_fronts") &&
    group.rulesEngineCapabilityEvidence?.pinnedEvidenceCount > 0);
  if (!selected) throw new Error("matchup_terminal_default_routing_group_missing");
  return selected;
}

function selectedRepresentative(evidenceCache = {}, group = {}) {
  const groupKeys = new Set(group.representativeKeys || []);
  const selected = (evidenceCache.representativeSelection?.selectedRepresentatives || [])
    .find((representative) =>
      groupKeys.has(representative.subcellKey) &&
      representative.scenarioKey === "two_fronts" &&
      representative.representativeRoundNumber === 2 &&
      representative.terminalClassKey === "unique_leader_assassination" &&
      representative.coordinates?.actionRange === "strictly_inside" &&
      representative.coordinates?.damage === "leader_at_terminal_threshold" &&
      representative.coordinates?.resource === "zero_available");
  if (!selected) {
    throw new Error(`matchup_terminal_exact_representative_missing:${group.groupKey}`);
  }
  return selected;
}

function compiledCandidate(sideUniverse = {}, candidate = {}) {
  const compiled = (sideUniverse.rosters || []).find((roster) =>
    roster.rosterKey === candidate.rosterKey);
  if (!compiled) {
    throw new Error(`matchup_terminal_compiled_roster_missing:${candidate.rosterKey}`);
  }
  return compiled;
}

const poolPath = path.join(outputDirectory, "goal-conditioned-roster-pool.json");
const routingPath = path.join(outputDirectory, "terminal-demand-routing.json");
const evidenceCachePath = path.join(outputDirectory,
  "terminal-demand-evidence-corpus.json");
const loadedPool = loadJsonWithHash(poolPath);
const loadedRouting = loadJsonWithHash(routingPath);
const loadedEvidenceCache = loadJsonWithHash(evidenceCachePath);
const pool = loadedPool.value;
const routing = loadedRouting.value;
const evidenceCache = loadedEvidenceCache.value;
const task = buildSepsiraSixSwarmVsFaneTaskV1();
if (pool.taskHash !== task.taskHash) {
  throw new Error(`matchup_terminal_pool_task_drift:${pool.taskHash}:${task.taskHash}`);
}
if (pool.source?.constructionHostReceiptHash !==
    warmachineConstructionHost.receipt.receiptHash) {
  throw new Error(`matchup_terminal_pool_construction_host_drift:${
    pool.source?.constructionHostReceiptHash || "missing"}:${
    warmachineConstructionHost.receipt.receiptHash}`);
}
if (pool.source?.forceBuilderSourceHash !==
    warmachineConstructionHost.receipt.sourceHashes[
      "android-shell/assets/companion/force-builder.js"
    ]) {
  throw new Error("matchup_terminal_pool_force_builder_drift");
}
if (pool.source?.genericRosterGeneratorSourceHash !==
    WARMACHINE_GENERIC_ROSTER_POOL_V1_SOURCE_HASH) {
  throw new Error("matchup_terminal_pool_roster_generator_drift");
}
if (routing.taskHash !== task.taskHash) {
  throw new Error(`matchup_terminal_routing_task_drift:${routing.taskHash}:${task.taskHash}`);
}
if (evidenceCache.taskHash !== task.taskHash) {
  throw new Error(`matchup_terminal_evidence_task_drift:${
    evidenceCache.taskHash}:${task.taskHash}`);
}
if (evidenceCache.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
  throw new Error(`matchup_terminal_evidence_host_drift:${
    evidenceCache.hostReceiptHash}:${warmachineHost.receipt.receiptHash}`);
}
if (pool.terminalDemand?.evidenceCorpusHash !==
    evidenceCache.evidenceCorpus?.evidenceCorpusHash) {
  throw new Error("matchup_terminal_pool_evidence_corpus_drift");
}
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
const group = selectedRoutingGroup(routing);
const representative = selectedRepresentative(evidenceCache, group);
const subjectCandidate = group.subjectRosterCandidates[0];
const challengerCandidate = group.challengerRosterCandidates.find((candidate) =>
  candidate.leaderName.toLowerCase().startsWith(requestedLeader.toLowerCase()));
if (!subjectCandidate || !challengerCandidate) {
  throw new Error("matchup_terminal_routing_roster_candidate_missing");
}
const subjectCompiled = compiledCandidate(universe.sides.subject, subjectCandidate);
const challengerCompiled = compiledCandidate(universe.sides.challenger, challengerCandidate);
const subjectRoster = pool.subjectPool.rosters.find((roster) =>
  roster.key === subjectCompiled.sourceListKey);
const challengerRoster = pool.challengerPool.rosters.find((roster) =>
  roster.key === challengerCompiled.sourceListKey);
if (!subjectRoster || !challengerRoster) {
  throw new Error("matchup_terminal_source_roster_missing");
}

const roomStorePath = resolveWarmachineHostPath(
  "fixtures/ruleset-baseline/fixed-roster-room.json",
);
const loadedRoomStore = loadJsonWithHash(roomStorePath);
const templateRoom = Object.values(loadedRoomStore.value.roomsById || {})[0];
if (!templateRoom) throw new Error("matchup_terminal_opening_template_room_missing");
const templateHash = stableGraphHash({
  roomStoreContentHash: loadedRoomStore.contentHash,
  roomId: templateRoom.id,
  shapes: templateRoom.shapes,
  deployments: templateRoom.deployments,
});
const exactMapTemplate = buildWarmachineSteamrollerOpeningMapTemplateV1({
  templateRoom,
  baseTemplateHash: templateHash,
  mapKey: "mixed_table",
  scenarioKey: representative.scenarioKey,
  firstPlayerSideKey: "player2",
  scenarioTerrainSetupClassKey:
    representative.coordinates?.scenarioTerrainSetup,
});
const scenarioBinders = buildWarmachineSteamrollerFallbackOpeningBindersV1();
const openings = materializeWarmachineRepresentativeOpeningsV1({
  task,
  poolsByTaskSideKey: {
    subject: poolsByKey[task.sides.subject.sourcePoolKey],
    challenger: poolsByKey[task.sides.challenger.sourcePoolKey],
  },
  rosterPairs: [{
    subjectRosterKey: subjectRoster.key,
    challengerRosterKey: challengerRoster.key,
    pairReason: `terminal-demand:${group.groupKey}`,
  }],
  exactMapTemplatesByKey: {
    mixed_table: exactMapTemplate,
  },
  scenarioBindersByKey: {
    two_fronts: (state, options = {}) => scenarioBinders.two_fronts(state, {
      ...options,
      scenarioTerrainSetupClassKey:
        representative.coordinates?.scenarioTerrainSetup,
    }),
  },
  maximumMaterializedOpenings: 1,
  includeFullStates: true,
});
const opening = openings.openings[0];
if (!opening) {
  throw new Error(`matchup_terminal_opening_not_materialized:${JSON.stringify(
    openings.rejected.slice(0, 2))}`);
}
const result = materializeWarmachineMatchupAssassinationTerminalRootV1({
  task,
  opening,
  routingGroup: group,
  representative,
  attackerTaskSideKey: "challenger",
  roundNumber: 2,
  scenarioKey: "two_fronts",
  actorLabelPattern: requestedActorLabelPattern,
});
const {
  runtimeAcceptedMaterialization,
  runtimeIndependentReplay: _runtimeIndependentReplay,
  ...publicResult
} = result;
const evidenceDirectory = path.join(outputDirectory, "terminal-route-evidence");
fs.mkdirSync(evidenceDirectory, { recursive: true });
fs.writeFileSync(
  path.join(evidenceDirectory, `${group.groupKey}-report.json`),
  `${JSON.stringify(publicResult, null, 2)}\n`,
);
if (runtimeAcceptedMaterialization?.runtimeRoots?.length) {
  fs.writeFileSync(
    path.join(evidenceDirectory, `${group.groupKey}-runtime.json`),
    `${JSON.stringify({
      schemaVersion: "warmachine_matchup_terminal_root_runtime_v1",
      taskHash: task.taskHash,
      groupKey: group.groupKey,
      reportHash: result.reportHash,
      roots: runtimeAcceptedMaterialization.runtimeRoots,
      trainingTruth: false,
    }, null, 2)}\n`,
  );
}
const terminalRootReports = fs.readdirSync(evidenceDirectory)
  .filter((fileName) => fileName.endsWith("-report.json"))
  .map((fileName) => JSON.parse(fs.readFileSync(
    path.join(evidenceDirectory, fileName),
    "utf8",
  )))
  .filter((report) => report.taskHash === task.taskHash &&
    report.matchupTerminalRootProven === true);
const routingEvidence = buildWarmachineTerminalDemandRoutingEvidenceV1({
  routing,
  terminalRootReports,
});
fs.writeFileSync(
  path.join(outputDirectory, "terminal-demand-routing-task-evidence.json"),
  `${JSON.stringify(routingEvidence, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify({
  ok: result.matchupTerminalRootProven,
  reportHash: result.reportHash,
  groupKey: group.groupKey,
  sourceRosters: {
    subject: subjectRoster.key,
    challenger: challengerRoster.key,
  },
  representative: {
    subcellKey: representative.subcellKey,
    cellKey: representative.cellKey,
    scenarioKey: representative.scenarioKey,
    representativeRoundNumber: representative.representativeRoundNumber,
  },
  opening: result.opening,
  selectedActor: result.selectedActor,
  positionDomain: result.positionDomain,
  attemptCount: result.attempts.length,
  attemptDispositions: result.attempts.map((attempt) => ({
    declineCount: attempt.declineCount,
    dispositionCounts: attempt.materialization.dispositionCounts,
    firstRejection: attempt.materialization.rejected[0] || null,
  })),
  strictTerminalRootCount: result.strictTerminalRootCount,
  independentStrictReplayProven:
    result.independentReplayEvidence.independentStrictReplayProven,
  representativeBindingProven: result.representativeBinding.bindingProven,
  routingEvidenceHash: routingEvidence.evidenceHash,
  deploymentToTerminalReachabilityProven: false,
}, null, 2)}\n`);
