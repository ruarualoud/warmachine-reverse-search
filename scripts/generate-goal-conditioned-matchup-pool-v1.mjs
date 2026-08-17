#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from "../src/graph/typed-facts-v2.mjs";
import { buildSepsiraSixSwarmVsFaneTaskV1 } from
  "../src/matchup/custom-matchup-task-v1.mjs";
import { generateWarmachineGenericRosterPoolV1 } from
  "../src/matchup/generic-roster-pool-v1.mjs";
import { WARMACHINE_GENERIC_ROSTER_POOL_V1_SOURCE_HASH } from
  "../src/matchup/generic-roster-pool-v1.mjs";
import { buildWarmachineTerminalDemandEvidenceCorpusV1 } from
  "../src/matchup/terminal-demand-evidence-corpus-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";
import {
  loadWarmachineCardData,
  loadWarmachineForceBuilder,
} from "../src/warmachine-construction-assets-runtime.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const forceBuilder = await loadWarmachineForceBuilder();

function optionNumber(key, fallback) {
  const prefix = `--${key}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionText(key, fallback) {
  const prefix = `--${key}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || fallback;
}

const outputPath = path.resolve(optionText(
  "output",
  path.join(
    reverseDirectory,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/goal-conditioned-roster-pool.json",
  ),
));
const evidenceCachePath = path.join(path.dirname(outputPath), "terminal-demand-evidence-corpus.json");
const evidenceCacheOnly = process.argv.includes("--evidence-cache-only");
const data = await loadWarmachineCardData();
const task = buildSepsiraSixSwarmVsFaneTaskV1();
let evidenceCacheReused = false;
let terminalDemandEvidence = null;
if (fs.existsSync(evidenceCachePath)) {
  const cached = JSON.parse(fs.readFileSync(evidenceCachePath, "utf8"));
  if (cached.schemaVersion === "warmachine_terminal_demand_evidence_cache_v1" &&
      cached.taskHash === task.taskHash &&
      cached.hostReceiptHash === warmachineHost.receipt.receiptHash &&
      cached.evidenceCorpus?.evidenceCorpusHash &&
      cached.demandGroups?.demandGroupSetHash === cached.evidenceCorpus.demandGroupSetHash) {
    terminalDemandEvidence = cached;
    evidenceCacheReused = true;
  }
}
if (!terminalDemandEvidence) {
  terminalDemandEvidence = buildWarmachineTerminalDemandEvidenceCorpusV1({
    rosterReceiptHash: `custom-matchup:${task.taskHash}`,
  });
}
const { corpus, representativeSelection, demandGroups } = terminalDemandEvidence;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const cacheCore = stableGraphValue({
  schemaVersion: "warmachine_terminal_demand_evidence_cache_v1",
  taskHash: task.taskHash,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  corpus,
  representativeSelection,
  demandGroups,
  evidencePins: terminalDemandEvidence.evidencePins,
  evidenceCorpus: terminalDemandEvidence.evidenceCorpus,
});
const cacheReport = { ...cacheCore, cacheHash: stableGraphHash(cacheCore) };
fs.writeFileSync(evidenceCachePath, `${JSON.stringify(cacheReport, null, 2)}\n`, "utf8");
if (evidenceCacheOnly) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    evidenceCacheOnly: true,
    evidenceCacheReused,
    evidenceCachePath,
    cacheHash: cacheReport.cacheHash,
    selectedRepresentativeCount: demandGroups.selectedRepresentativeCount,
    demandGroupCount: demandGroups.groupCount,
    constructionMacroProfileCount: demandGroups.constructionMacroProfileCount,
  }, null, 2)}\n`);
  process.exit(0);
}
const sharedBudget = {
  goalProfiles: demandGroups.constructionMacroProfiles,
  maximumStatesPerCost: Math.max(40, Math.floor(optionNumber("states-per-cost", 160))),
  maximumPerBucket: Math.max(1, Math.floor(optionNumber("per-bucket", 2))),
  maximumExactAttemptsPerLeader: Math.max(40, Math.floor(optionNumber("attempts-per-leader", 180))),
  minimumLegalRostersPerGoalPerLeader: Math.max(1, Math.floor(optionNumber("legal-per-goal", 4))),
};
const fixedCards = task.sides.subject.requiredCards;
const subjectPool = generateWarmachineGenericRosterPoolV1({
  data,
  forceBuilder,
  armyId: task.sides.subject.armyId,
  armyName: task.sides.subject.armyName,
  leaderIds: task.sides.subject.leaderIds,
  leaderNames: task.sides.subject.leaderNames,
  pointLimit: task.format.pointLimit,
  fixedCards,
  fixedComplete: task.sides.subject.rosterMode === "fixed_complete",
  excludedCardIds: task.sides.subject.excludedCardIds,
  excludedCardNames: task.sides.subject.excludedCardNames,
  excludedCardTypeNames: task.sides.subject.excludedCardTypeNames,
  loadoutConstraints: task.sides.subject.loadoutConstraints,
  searchBudget: {
    ...sharedBudget,
    maximumArchivedRosters: Math.max(13, Math.floor(optionNumber("subject-rosters", 48))),
  },
});
const challengerPool = generateWarmachineGenericRosterPoolV1({
  data,
  forceBuilder,
  armyId: task.sides.challenger.armyId,
  armyName: task.sides.challenger.armyName,
  leaderIds: task.sides.challenger.leaderIds,
  leaderNames: task.sides.challenger.leaderMode === "all_in_army"
    ? []
    : task.sides.challenger.leaderNames,
  pointLimit: task.format.pointLimit,
  fixedCards: task.sides.challenger.requiredCards,
  fixedComplete: task.sides.challenger.rosterMode === "fixed_complete",
  excludedCardIds: task.sides.challenger.excludedCardIds,
  excludedCardNames: task.sides.challenger.excludedCardNames,
  excludedCardTypeNames: task.sides.challenger.excludedCardTypeNames,
  loadoutConstraints: task.sides.challenger.loadoutConstraints,
  searchBudget: {
    ...sharedBudget,
    maximumArchivedRosters: Math.max(52, Math.floor(optionNumber("challenger-rosters", 96))),
  },
});
const core = stableGraphValue({
  schemaVersion: "warmachine_goal_conditioned_matchup_roster_pool_v1",
  source: {
    remoteVersion: String(data.source?.remoteVersion || ""),
    sourceLabel: String(data.source?.sourceLabel || ""),
    constructionHostReceiptHash: warmachineConstructionHost.receipt.receiptHash,
    forceBuilderSourceHash: String(
      warmachineConstructionHost.receipt.sourceHashes[
        "android-shell/assets/companion/force-builder.js"
      ] || "",
    ),
    genericRosterGeneratorSourceHash: WARMACHINE_GENERIC_ROSTER_POOL_V1_SOURCE_HASH,
  },
  taskHash: task.taskHash,
  terminalDemand: {
    corpusHash: corpus.corpusHash,
    representativeSelectionHash: representativeSelection.selectionHash,
    demandGroupSetHash: demandGroups.demandGroupSetHash,
    selectedRepresentativeCount: demandGroups.selectedRepresentativeCount,
    demandGroupCount: demandGroups.groupCount,
    processingBatchCount: demandGroups.batchCount,
    constructionMacroProfileCount: demandGroups.constructionMacroProfileCount,
    constructionMacroProfiles: demandGroups.constructionMacroProfiles,
    evidenceCorpusHash: terminalDemandEvidence.evidenceCorpus.evidenceCorpusHash,
    evidencePinCount: terminalDemandEvidence.evidenceCorpus.evidencePinCount,
  },
  subjectPool,
  challengerPool,
  quality: {
    exactForceBuilderLegality: subjectPool.quality.exactListLegality === true &&
      challengerPool.quality.exactListLegality === true,
    legalGoalQuotaComplete: subjectPool.quality.legalGoalQuotaComplete === true &&
      challengerPool.quality.legalGoalQuotaComplete === true,
    strictTransitionEvaluated: false,
    naturalRosterDistribution: false,
    naturalWinRate: false,
    globalOptimalityProven: false,
    trainingTruth: false,
  },
  claimBoundary: "The finite roster pools are exact current Force Builder legal and terminal-demand-conditioned. They are beam-pruned construction candidates, not exhaustive faction list spaces, natural metagame samples, strict route proofs or win rates.",
});
const report = { ...core, poolSetHash: stableGraphHash(core) };
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  ok: true,
  outputPath,
  poolSetHash: report.poolSetHash,
  evidenceCacheReused,
  evidenceCachePath,
  remoteVersion: report.source.remoteVersion,
  terminalDemand: {
    selectedRepresentativeCount: report.terminalDemand.selectedRepresentativeCount,
    demandGroupCount: report.terminalDemand.demandGroupCount,
    constructionMacroProfileCount: report.terminalDemand.constructionMacroProfileCount,
  },
  subject: {
    rosterCount: subjectPool.counts.archivedRosterCount,
    exactAttemptCount: subjectPool.counts.exactLegalityAttemptCount,
    rejectedCount: subjectPool.counts.rejectedCount,
    incompleteLeaderGoalCount: subjectPool.counts.incompleteLeaderGoalCount,
  },
  challenger: {
    rosterCount: challengerPool.counts.archivedRosterCount,
    exactAttemptCount: challengerPool.counts.exactLegalityAttemptCount,
    rejectedCount: challengerPool.counts.rejectedCount,
    incompleteLeaderGoalCount: challengerPool.counts.incompleteLeaderGoalCount,
  },
}, null, 2)}\n`);
