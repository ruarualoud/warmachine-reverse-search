#!/usr/bin/env node

import assert from "node:assert/strict";

import { buildSepsiraSixSwarmVsFaneTaskV1 } from
  "../src/matchup/custom-matchup-task-v1.mjs";
import { buildWarmachineTerminalDemandGroupsV1 } from
  "../src/matchup/terminal-demand-groups-v1.mjs";
import { buildWarmachineTerminalDemandRosterRoutingV1 } from
  "../src/matchup/terminal-demand-roster-routing-v1.mjs";
import { buildWarmachineSteamrollerTerminalScenarioCorpusV1 } from
  "../src/reverse/steamroller-terminal-scenario-corpus-v1.mjs";
import { selectWarmachineSteamrollerTerminalRepresentativesV1 } from
  "../src/reverse/steamroller-terminal-representative-selector-v1.mjs";

const task = buildSepsiraSixSwarmVsFaneTaskV1();
const corpus = buildWarmachineSteamrollerTerminalScenarioCorpusV1({
  rosterReceiptHash: `verify-routing:${task.taskHash}`,
});
const selection = selectWarmachineSteamrollerTerminalRepresentativesV1({
  corpus,
  maximumSkeletonCells: 96,
  maximumRepresentativeSubcells: 50000,
});
const demandGroups = buildWarmachineTerminalDemandGroupsV1({
  corpus,
  representativeSelection: selection,
});
const scoreRows = Object.fromEntries(demandGroups.constructionMacroProfiles.map(
  (profile, index) => [profile.goalProfileKey, 100 - index],
));
const roster = (key, leader) => ({
  key,
  leader,
  warnings: [],
  constructionGoalScores: scoreRows,
});
const subjectRosters = [roster("cryx-a", "Master Necrosurgeon Sepsira")];
const challengerRosters = [
  roster("fane-a", "Ashmael, Keeper of Whispers"),
  roster("fane-v", "Auricant Vorsalys"),
  roster("fane-h", "Hysene, the Executioner"),
  roster("fane-n", "Nymara, The Shadowblade"),
];
const routing = buildWarmachineTerminalDemandRosterRoutingV1({
  task,
  demandGroups,
  subjectRosters,
  challengerRosters,
});
const repeated = buildWarmachineTerminalDemandRosterRoutingV1({
  task,
  demandGroups,
  subjectRosters,
  challengerRosters,
});

assert.equal(routing.routingHash, repeated.routingHash);
assert.equal(routing.eligibleDemandGroupCount + routing.deferredDemandGroupCount,
  demandGroups.groupCount);
assert.ok(routing.deferredDemandGroupCount > 0,
  "terminal groups outside the task round horizon must remain explicitly deferred");
assert.equal(routing.constructionMacroProfileCount, 13);
assert.equal(routing.processingQueues.reduce((sum, queue) => sum + queue.groupCount, 0),
  routing.eligibleDemandGroupCount);
assert.equal(routing.routedGroups.every((group) =>
  group.subjectRosterCandidates.length === 1 &&
  group.challengerRosterCandidates.length === 4), true);
assert.equal(routing.routedGroups.every((group) =>
  group.gameValueInterval.lowerBound === 0 && group.gameValueInterval.upperBound === 1), true);
assert.equal(routing.routedGroups.every((group) =>
  group.exactRoundNumbers.every((round) => round >= 2 && round <= 7)), true);
assert.equal(routing.strategyScoreUsedForReachability, false);
assert.equal(routing.representativeFrequencyUsedAsProbability, false);
assert.equal(routing.naturalWinRateClaimed, false);

console.log(JSON.stringify({
  ok: true,
  routingHash: routing.routingHash,
  eligibleDemandGroupCount: routing.eligibleDemandGroupCount,
  constructionMacroProfileCount: routing.constructionMacroProfileCount,
  firstQueuedGroupKey: routing.routedGroups[0]?.groupKey,
}, null, 2));
