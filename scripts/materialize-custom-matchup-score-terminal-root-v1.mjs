#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSepsiraSixSwarmVsFaneTaskV1 } from
  "../src/matchup/custom-matchup-task-v1.mjs";
import { WARMACHINE_GENERIC_ROSTER_POOL_V1_SOURCE_HASH } from
  "../src/matchup/generic-roster-pool-v1.mjs";
import { materializeWarmachineMatchupScoreTerminalRootV1 } from
  "../src/matchup/matchup-terminal-root-materializer-v1.mjs";
import { materializeWarmachineRepresentativeOpeningsV1 } from
  "../src/matchup/representative-opening-materializer-v1.mjs";
import { buildWarmachineSteamrollerFallbackOpeningBindersV1 } from
  "../src/matchup/steamroller-opening-binders-v1.mjs";
import { buildWarmachineSteamrollerOpeningMapTemplateV1 } from
  "../src/matchup/steamroller-opening-map-template-v1.mjs";
import { buildWarmachineTerminalDemandRoutingEvidenceV1 } from
  "../src/matchup/terminal-demand-routing-evidence-v1.mjs";
import { buildWarmachineTwoFrontsScoreTransitionPredecessorSeedV1 } from
  "../src/matchup/two-fronts-score-terminal-seed-v1.mjs";
import { resolveWarmachineHostPath, warmachineHost } from
  "../src/warmachine-host-runtime.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(reverseDirectory,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1"));
const requestedRepresentativeKey = String(process.argv.find((argument) =>
  argument.startsWith("--representative="))?.slice("--representative=".length) ||
  "steamroller-terminal-subcell-21f86874a2b08572a20ba2ea52ed6477");
const requestedLeader = String(process.argv.find((argument) =>
  argument.startsWith("--leader="))?.slice("--leader=".length) ||
  "Hysene, the Executioner");

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

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

const poolPath = path.join(outputDirectory, "goal-conditioned-roster-pool.json");
const loadedPool = loadJsonWithHash(poolPath);
const pool = loadedPool.value;
const routing = loadJson(path.join(outputDirectory, "terminal-demand-routing.json"));
const evidenceCache = loadJson(path.join(
  outputDirectory,
  "terminal-demand-evidence-corpus.json",
));
const task = buildSepsiraSixSwarmVsFaneTaskV1();
if (task.rulesetReceiptHash !== warmachineHost.receipt.receiptHash ||
    pool.taskHash !== task.taskHash || routing.taskHash !== task.taskHash ||
    evidenceCache.taskHash !== task.taskHash ||
    evidenceCache.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
  throw new Error("matchup_score_terminal_source_receipt_drift");
}
if (pool.source?.constructionHostReceiptHash !==
      warmachineConstructionHost.receipt.receiptHash ||
    pool.source?.forceBuilderSourceHash !==
      warmachineConstructionHost.receipt.sourceHashes[
        "android-shell/assets/companion/force-builder.js"
      ] ||
    pool.source?.genericRosterGeneratorSourceHash !==
      WARMACHINE_GENERIC_ROSTER_POOL_V1_SOURCE_HASH) {
  throw new Error("matchup_score_terminal_construction_source_drift");
}
if (pool.terminalDemand?.evidenceCorpusHash !==
    evidenceCache.evidenceCorpus?.evidenceCorpusHash) {
  throw new Error("matchup_score_terminal_evidence_corpus_drift");
}
const representative = evidenceCache.representativeSelection.selectedRepresentatives
  .find((row) => row.subcellKey === requestedRepresentativeKey);
if (!representative) {
  throw new Error(`matchup_score_terminal_representative_missing:${
    requestedRepresentativeKey}`);
}
const group = routing.routedGroups.find((row) =>
  row.representativeKeys.includes(representative.subcellKey));
if (!group || group.goalFamily !== "scenario_score_threshold") {
  throw new Error("matchup_score_terminal_routing_group_missing");
}
const scoreScenario = evidenceCache.corpus.scenarios.find((row) =>
  row.scenarioKey === representative.scenarioKey);
const scoreTransition = scoreScenario?.scoreTransitionDomain?.transitions.find((row) =>
  row.scoreTransitionKey === representative.coordinates?.scoreTransition);
if (!scoreTransition) {
  throw new Error("matchup_score_terminal_transition_missing");
}
const subjectCandidate = group.subjectRosterCandidates[0];
const challengerCandidate = group.challengerRosterCandidates.find((candidate) =>
  candidate.leaderName === requestedLeader) || group.challengerRosterCandidates[0];
if (!subjectCandidate || !challengerCandidate) {
  throw new Error("matchup_score_terminal_routed_roster_missing");
}
const poolsByTaskSideKey = {
  subject: sourcePool(
    task.sides.subject.sourcePoolKey,
    pool.subjectPool,
    loadedPool.contentHash,
    pool.schemaVersion,
  ),
  challenger: sourcePool(
    task.sides.challenger.sourcePoolKey,
    pool.challengerPool,
    loadedPool.contentHash,
    pool.schemaVersion,
  ),
};
const roomStore = loadJson(resolveWarmachineHostPath(
  "fixtures/ruleset-baseline/fixed-roster-room.json",
));
const templateRoom = Object.values(roomStore.roomsById || {})[0];
if (!templateRoom) throw new Error("matchup_score_terminal_map_template_missing");
const baseTemplateHash = createHash("sha256").update(JSON.stringify({
  shapes: templateRoom.shapes,
  deployments: templateRoom.deployments,
})).digest("hex");
const exactMapTemplate = buildWarmachineSteamrollerOpeningMapTemplateV1({
  templateRoom,
  baseTemplateHash,
  mapKey: "mixed_table",
  scenarioKey: representative.scenarioKey,
  firstPlayerSideKey: "player2",
  scenarioTerrainSetupClassKey:
    representative.coordinates?.scenarioTerrainSetup,
});
const scenarioBinders = buildWarmachineSteamrollerFallbackOpeningBindersV1();
const openings = materializeWarmachineRepresentativeOpeningsV1({
  task,
  poolsByTaskSideKey,
  rosterPairs: [{
    subjectRosterKey: subjectCandidate.sourceListKey,
    challengerRosterKey: challengerCandidate.sourceListKey,
    pairReason: `score-terminal-demand:${group.groupKey}`,
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
  scenarioKeys: ["two_fronts"],
  mapKeys: ["mixed_table"],
  firstPlayerTaskSideKeys: ["challenger"],
  deploymentSeedKeys: ["balanced"],
  maximumMaterializedOpenings: 1,
  includeFullStates: true,
});
const opening = openings.openings[0];
if (!opening) {
  throw new Error(`matchup_score_terminal_opening_rejected:${JSON.stringify(
    openings.rejected.slice(0, 2))}`);
}
const predecessorSeed = buildWarmachineTwoFrontsScoreTransitionPredecessorSeedV1(
  opening.state,
  {
    roundNumber: representative.representativeRoundNumber,
    endingSideKey: "player2",
    winnerSideKey: "player1",
    scoreBefore: { player1: 1, player2: 0 },
    scoreTransition,
  },
);
const winnerScoringPlacement = predecessorSeed.proposedContest.placements.find((row) =>
  row.sideKey === "player1");
const result = materializeWarmachineMatchupScoreTerminalRootV1({
  task,
  opening,
  routingGroup: group,
  representative,
  predecessorState: predecessorSeed.state,
  winnerTaskSideKey: "subject",
  endingTaskSideKey: "challenger",
  scenarioControlWitness: {
    elementKey: winnerScoringPlacement?.objectiveKey || "",
    sideKey: "player1",
  },
});
if (!result.matchupTerminalRootProven) {
  const firstBatchResult = result.batch?.results?.[0] || null;
  throw new Error(`matchup_score_terminal_not_proven:${JSON.stringify({
    disposition: result.disposition,
    reason: result.dispositionReason,
    evidence: firstBatchResult?.evidence || null,
    observedScoreBefore: firstBatchResult?.observedScoreBefore || null,
    observedScoreAfter: firstBatchResult?.observedScoreAfter || null,
    observedTerminal: firstBatchResult?.observedTerminal || null,
    observedScoringEvents: firstBatchResult?.observedScoringEvents || [],
    proposedContest: predecessorSeed.proposedContest,
    receiptHash: firstBatchResult?.receiptHash || "",
  })}`);
}
const { runtimeRoot, ...publicResult } = result;
const evidenceDirectory = path.join(outputDirectory, "terminal-route-evidence");
fs.mkdirSync(evidenceDirectory, { recursive: true });
const reportPath = path.join(evidenceDirectory, `score-${group.groupKey}-report.json`);
const runtimePath = path.join(evidenceDirectory, `score-${group.groupKey}-runtime.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(publicResult, null, 2)}\n`, "utf8");
fs.writeFileSync(runtimePath, `${JSON.stringify({
  schemaVersion: "warmachine_matchup_score_terminal_root_runtime_v1",
  taskHash: task.taskHash,
  groupKey: group.groupKey,
  reportHash: result.reportHash,
  proposedContest: predecessorSeed.proposedContest,
  root: runtimeRoot,
  trainingTruth: false,
}, null, 2)}\n`, "utf8");
const terminalRootReports = fs.readdirSync(evidenceDirectory)
  .filter((fileName) => fileName.endsWith("-report.json"))
  .map((fileName) => loadJson(path.join(evidenceDirectory, fileName)))
  .filter((report) => report.taskHash === task.taskHash &&
    report.matchupTerminalRootProven === true);
const routingEvidence = buildWarmachineTerminalDemandRoutingEvidenceV1({
  routing,
  terminalRootReports,
});
fs.writeFileSync(
  path.join(outputDirectory, "terminal-demand-routing-task-evidence.json"),
  `${JSON.stringify(routingEvidence, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify({
  ok: true,
  reportPath,
  runtimePath,
  reportHash: result.reportHash,
  groupKey: group.groupKey,
  representativeSubcellKey: representative.subcellKey,
  sourceRosters: {
    subject: opening.subjectRosterKey,
    challenger: opening.challengerRosterKey,
  },
  modelCount: opening.modelCount,
  scoreBefore: runtimeRoot.scoreBefore,
  scoreAfter: runtimeRoot.scoreAfter,
  winnerSourceCounts: runtimeRoot.winnerSourceCounts,
  opponentSourceCounts: runtimeRoot.opponentSourceCounts,
  routingEvidenceHash: routingEvidence.evidenceHash,
  deploymentToTerminalReachabilityProven: false,
}, null, 2)}\n`);
