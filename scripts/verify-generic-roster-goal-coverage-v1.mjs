#!/usr/bin/env node

import assert from "node:assert/strict";

import { generateWarmachineGenericRosterPoolV1 } from
  "../src/matchup/generic-roster-pool-v1.mjs";
import { buildWarmachineTerminalDemandGroupsV1 } from
  "../src/matchup/terminal-demand-groups-v1.mjs";
import { buildWarmachineSteamrollerTerminalScenarioCorpusV1 } from
  "../src/reverse/steamroller-terminal-scenario-corpus-v1.mjs";
import { selectWarmachineSteamrollerTerminalRepresentativesV1 } from
  "../src/reverse/steamroller-terminal-representative-selector-v1.mjs";
import {
  loadWarmachineCardData,
  loadWarmachineForceBuilder,
} from "../src/warmachine-construction-assets-runtime.mjs";

const data = await loadWarmachineCardData();
const forceBuilder = await loadWarmachineForceBuilder();
const corpus = buildWarmachineSteamrollerTerminalScenarioCorpusV1({
  rosterReceiptHash: "verify-generic-roster-goal-coverage-v1",
});
const representativeSelection = selectWarmachineSteamrollerTerminalRepresentativesV1({
  corpus,
  maximumSkeletonCells: 96,
  maximumRepresentativeSubcells: 50000,
});
const demandGroups = buildWarmachineTerminalDemandGroupsV1({
  corpus,
  representativeSelection,
});
const pool = generateWarmachineGenericRosterPoolV1({
  data,
  forceBuilder,
  armyName: "Fane of Nyrro",
  leaderNames: ["Hysene, the Executioner"],
  pointLimit: 100,
  searchBudget: {
    goalProfiles: demandGroups.constructionMacroProfiles,
    maximumStatesPerCost: 40,
    maximumPerBucket: 1,
    maximumExactAttemptsPerLeader: 40,
    minimumLegalRostersPerGoalPerLeader: 1,
    maximumArchivedRosters: 16,
  },
});

assert.equal(pool.constructionGoalProfiles.length, 13);
assert.equal(pool.constructionGoalCoverageByLeader.length, 1);
assert.equal(pool.constructionGoalCoverageByLeader[0].goalCoverage.length, 13);
assert.equal(pool.constructionGoalCoverageByLeader[0].goalCoverage.every((row) =>
  row.complete), true);
assert.equal(pool.quality.legalGoalQuotaComplete, true);
assert.equal(pool.counts.incompleteLeaderGoalCount, 0);
assert.ok(pool.counts.rejectedCount > 0,
  "the fixture must prove invalid attachment states do not starve later goal profiles");
assert.ok(pool.rosters.length > 0);
assert.equal(pool.rosters.every((roster) =>
  roster.totalPoints === 100 && roster.warnings.length === 0), true);
assert.equal(pool.rosters.some((roster) =>
  roster.constructionGoalProfileCoverageKeys.length > 1), true);

console.log(JSON.stringify({
  ok: true,
  poolHash: pool.poolHash,
  remoteVersion: pool.source.remoteVersion,
  constructionGoalProfileCount: pool.constructionGoalProfiles.length,
  exactLegalityAttemptCount: pool.counts.exactLegalityAttemptCount,
  rejectedCount: pool.counts.rejectedCount,
  archivedRosterCount: pool.counts.archivedRosterCount,
  legalGoalQuotaComplete: pool.quality.legalGoalQuotaComplete,
}, null, 2));
