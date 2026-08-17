#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from "../src/graph/typed-facts-v2.mjs";
import {
  buildSepsiraSixSwarmVsFaneTaskV1,
  normalizeWarmachineCustomMatchupTaskV1,
} from "../src/matchup/custom-matchup-task-v1.mjs";
import {
  buildWarmachineCustomTaskForceBuilderUniverseV1,
  buildWarmachineFixedCompleteSideFromRosterV1,
  resolveWarmachineCustomTaskSideArmiesV1,
} from "../src/matchup/custom-task-force-builder-v1.mjs";
import { generateWarmachineGenericRosterPoolV1 } from
  "../src/matchup/generic-roster-pool-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";
import {
  loadWarmachineCardData,
  loadWarmachineForceBuilder,
} from "../src/warmachine-construction-assets-runtime.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const data = await loadWarmachineCardData();
const forceBuilder = await loadWarmachineForceBuilder();

const compactBudget = {
  rosterConstruction: {
    maximumStatesPerCost: 40,
    maximumPerBucket: 1,
    maximumExactAttemptsPerLeader: 70,
    minimumLegalRostersPerGoalPerLeader: 1,
    maximumArchivedRostersPerSide: 16,
  },
};

const sepsiraTask = buildSepsiraSixSwarmVsFaneTaskV1({
  dataReceipt: { remoteVersion: data.source.remoteVersion },
  searchBudget: compactBudget,
});
assert.equal(sepsiraTask.validation.ok, true);
assert.deepEqual(sepsiraTask.stateDomain.firstPlayerTaskSideKeys, [
  "challenger",
  "subject",
]);
assert.equal(sepsiraTask.horizon.minimumTerminalRound, 2);
assert.equal(sepsiraTask.horizon.maximumTerminalRound, 7);
assert.equal(
  sepsiraTask.searchBudget.rosterConstruction.maximumExactAttemptsPerLeader,
  70,
);

const sepsiraUniverse = buildWarmachineCustomTaskForceBuilderUniverseV1({
  task: sepsiraTask,
  data,
  forceBuilder,
});
assert.equal(sepsiraUniverse.quality.exactForceBuilderLegality, true);
assert.equal(sepsiraUniverse.quality.bothSidesNonempty, true);
assert.equal(sepsiraUniverse.quality.allOmissionClassesAudited, true);
assert.match(sepsiraUniverse.constructionHostReceiptHash, /^[0-9a-f]{64}$/);
assert.match(sepsiraUniverse.dataReceipt.forceBuilderSourceHash, /^[0-9a-f]{64}$/);
assert.match(sepsiraUniverse.dataReceipt.genericRosterGeneratorSourceHash,
  /^[0-9a-f]{64}$/);
assert.match(sepsiraUniverse.dataReceipt.customTaskCompilerSourceHash,
  /^[0-9a-f]{64}$/);
assert.equal(sepsiraUniverse.sidePools.subject.resolution.selectedArmyCount, 1);
assert.equal(sepsiraUniverse.sidePools.challenger.resolution.selectedArmyCount, 1);
assert.deepEqual(
  sepsiraUniverse.rosterUniverse.sides.challenger.leaderCoverage.map((row) =>
    row.leaderName),
  [
    "Ashmael, Keeper of Whispers",
    "Auricant Vorsalys",
    "Hysene, the Executioner",
    "Nymara, The Shadowblade",
  ],
);
for (const roster of sepsiraUniverse.sidePools.subject.lists) {
  const swarms = roster.entries.filter((entry) =>
    entry.cardId === "e1cb65eb-6d1b-419f-a6c1-ba7a7c332e2b");
  const wardens = roster.entries.filter((entry) =>
    entry.cardId === "80708b6e-03d1-4406-80fa-12d9e9967dba");
  assert.equal(swarms.length, 6);
  assert.equal(wardens.length, 6);
  assert.equal(new Set(wardens.map((entry) => entry.attachedTo)).size, 6);
  assert.equal(wardens.every((entry) =>
    entry.attachedToCardId === "e1cb65eb-6d1b-419f-a6c1-ba7a7c332e2b"), true);
}
assert.ok(sepsiraUniverse.sidePools.subject.counts.partialStateBudgetDeferredCount > 0);
assert.ok(sepsiraUniverse.sidePools.challenger.counts.exactCandidateRejectedCount > 0);

const sharedStateDomain = {
  scenarioKeys: ["two_fronts"],
  mapProfiles: [{
    mapKey: "mixed-exact",
    label: "混合地形精确验证",
    exactTerrain: [],
  }],
  firstPlayerTaskSideKeys: ["subject", "challenger"],
  deploymentSeeds: [{
    deploymentSeedKey: "balanced",
    archetypesBySide: { subject: "balanced", challenger: "balanced" },
  }],
};
const winterTask = normalizeWarmachineCustomMatchupTaskV1({
  taskKey: "winter-korps-modular-loadout-v1",
  format: { pointLimit: 50, packetName: "Steamroller 2026" },
  sides: {
    subject: {
      factionName: "Khador",
      armyName: "Winter Korps",
      leaderMode: "fixed",
      leaderNames: ["Kapitan Yana Kovoskiy"],
      requiredCards: [
        {
          cardId: "81bd31e1-0cc1-4e70-8544-c587062abd34",
          minimumCount: 1,
          maximumCount: 1,
          battlegroupControllerCardName: "Kapitan Yana Kovoskiy",
          loadouts: [{
            loadoutKey: "accuracy-cannon-flame",
            optionSelections: {
              cardOption1: ["0e00e76e-0a5f-4015-965d-71f3316b24b0"],
              cardOption2: ["f79b96fa-068a-45b6-ab9a-5191ec7ef42a"],
              cardOption3: ["b869adde-3325-4cd2-9d24-16ce08334131"],
            },
          }],
        },
        {
          cardId: "bf9e47f9-55aa-4a5e-a61f-69ad117e44ea",
          minimumCount: 1,
          maximumCount: 1,
          loadouts: [{
            loadoutKey: "mixed-support-team",
            optionSelections: {
              cardOption1: [
                "ae73dee6-49cf-4a0c-9157-44db11cfab0a",
                "dfe2facd-f270-4d75-a69e-270e03511b9f",
              ],
            },
          }],
        },
      ],
      excludedCardNames: ["Great Bear"],
    },
    challenger: {
      factionName: "Dusk",
      armyName: "Fane of Nyrro",
      leaderMode: "fixed",
      leaderNames: ["Hysene, the Executioner"],
    },
  },
  stateDomain: sharedStateDomain,
  horizon: { minimumTerminalRound: 3, maximumTerminalRound: 5 },
  searchBudget: compactBudget,
});
assert.equal(winterTask.validation.ok, true);
assert.equal(winterTask.horizon.minimumTerminalRound, 3);
assert.equal(winterTask.horizon.maximumTerminalRound, 5);
const winterUniverse = buildWarmachineCustomTaskForceBuilderUniverseV1({
  task: winterTask,
  data,
  forceBuilder,
});
assert.equal(winterUniverse.quality.bothSidesNonempty, true);
const winterRoster = winterUniverse.sidePools.subject.lists[0];
const direWolf = winterRoster.entries.find((entry) =>
  entry.cardId === "81bd31e1-0cc1-4e70-8544-c587062abd34");
const infantry = winterRoster.entries.find((entry) =>
  entry.cardId === "bf9e47f9-55aa-4a5e-a61f-69ad117e44ea");
assert.deepEqual(direWolf.optionSelections, {
  cardOption1: ["0e00e76e-0a5f-4015-965d-71f3316b24b0"],
  cardOption2: ["f79b96fa-068a-45b6-ab9a-5191ec7ef42a"],
  cardOption3: ["b869adde-3325-4cd2-9d24-16ce08334131"],
});
assert.equal(direWolf.battlegroupController, "Kapitan Yana Kovoskiy");
assert.deepEqual(infantry.optionSelections.cardOption1, [
  "ae73dee6-49cf-4a0c-9157-44db11cfab0a",
  "dfe2facd-f270-4d75-a69e-270e03511b9f",
]);
assert.equal(winterRoster.entries.some((entry) =>
  entry.name.startsWith("Great Bear")), false);
assert.ok(
  winterUniverse.sidePools.subject.armyPoolAudits[0]
    .enumerationAudit.packageVariants.taskExcludedCardCount > 0,
);

const duskAllArmies = resolveWarmachineCustomTaskSideArmiesV1(data, {
  ...winterTask.sides.challenger,
  factionName: "Dusk",
  armyMode: "all_in_faction",
  armyId: "",
  armyName: "",
  armyIds: [],
  armyNames: [],
  leaderMode: "all_in_army",
  leaderIds: [],
  leaderNames: [],
});
assert.ok(duskAllArmies.selectedArmyCount >= 2);
assert.equal(duskAllArmies.taskUnselectedArmyCount, 0);
assert.ok(duskAllArmies.selectedArmies.every((row) => row.selectedLeaderCount > 0));

const weaponAttachmentFixedCards = [
  {
    cardId: "3496140b-253c-4f0c-a501-12541a248f64",
    minimumCount: 1,
    maximumCount: 1,
  },
  {
    cardId: "f6b45768-373b-4e2e-9633-72a3e5095a27",
    minimumCount: 3,
    maximumCount: 3,
    attachmentTargetCardId: "3496140b-253c-4f0c-a501-12541a248f64",
    attachmentTargetCopyNumbers: [1, 1, 1],
  },
];
const weaponAttachmentPool = generateWarmachineGenericRosterPoolV1({
  data,
  forceBuilder,
  armyName: "Storm of the North",
  leaderNames: ["Grim Angus"],
  pointLimit: 8,
  fixedCards: weaponAttachmentFixedCards,
  fixedComplete: true,
  searchBudget: {
    maximumStatesPerCost: 16,
    maximumExactAttemptsPerLeader: 4,
    minimumLegalRostersPerGoalPerLeader: 1,
    maximumArchivedRosters: 2,
  },
});
assert.equal(weaponAttachmentPool.rosters.length, 1);
const weaponAttachmentRoster = weaponAttachmentPool.rosters[0];
assert.equal(weaponAttachmentRoster.physicalModels, 6);
assert.equal(weaponAttachmentRoster.entries.find((entry) =>
  entry.cardId === "3496140b-253c-4f0c-a501-12541a248f64").physicalModels, 2);
assert.equal(weaponAttachmentRoster.entries.filter((entry) =>
  entry.cardId === "f6b45768-373b-4e2e-9633-72a3e5095a27").length, 3);
const fourthWeaponAttachmentPool = generateWarmachineGenericRosterPoolV1({
  data,
  forceBuilder,
  armyName: "Storm of the North",
  leaderNames: ["Grim Angus"],
  pointLimit: 9,
  fixedCards: [
    weaponAttachmentFixedCards[0],
    {
      ...weaponAttachmentFixedCards[1],
      minimumCount: 4,
      maximumCount: 4,
      attachmentTargetCopyNumbers: [1, 1, 1, 1],
    },
  ],
  fixedComplete: true,
  searchBudget: {
    maximumStatesPerCost: 16,
    maximumExactAttemptsPerLeader: 4,
    minimumLegalRostersPerGoalPerLeader: 1,
    maximumArchivedRosters: 2,
  },
});
assert.equal(fourthWeaponAttachmentPool.rosters.length, 0);
assert.ok(fourthWeaponAttachmentPool.rejectionCounts.some((row) =>
  row.reason.includes("不能挂接")));

function semanticRosterHash(roster = {}) {
  return stableGraphHash((roster.entries || []).map((entry) => ({
    cardId: entry.cardId,
    linePoints: entry.linePoints,
    optionSelections: entry.optionSelections || {},
    attachedToCardId: entry.attachedToCardId || "",
    battlegroupControllerCardId: entry.battlegroupControllerCardId || "",
    autoAddedCompanion: entry.autoAddedCompanion === true,
  })).sort((left, right) => stableGraphHash(left).localeCompare(stableGraphHash(right))));
}

const sourceFixedRosters = {
  subject: winterUniverse.sidePools.subject.lists[0],
  challenger: winterUniverse.sidePools.challenger.lists[0],
};
const fixedTask = normalizeWarmachineCustomMatchupTaskV1({
  taskKey: "fixed-complete-semantic-replay-v1",
  format: { pointLimit: 50, packetName: "Steamroller 2026" },
  sides: {
    subject: buildWarmachineFixedCompleteSideFromRosterV1(
      sourceFixedRosters.subject,
      { taskSideKey: "subject", sourcePoolKey: "fixed-complete-subject" },
    ),
    challenger: buildWarmachineFixedCompleteSideFromRosterV1(
      sourceFixedRosters.challenger,
      { taskSideKey: "challenger", sourcePoolKey: "fixed-complete-challenger" },
    ),
  },
  stateDomain: sharedStateDomain,
  searchBudget: compactBudget,
});
assert.equal(fixedTask.validation.ok, true);
const fixedUniverse = buildWarmachineCustomTaskForceBuilderUniverseV1({
  task: fixedTask,
  data,
  forceBuilder,
});
for (const taskSideKey of ["subject", "challenger"]) {
  const pool = fixedUniverse.sidePools[taskSideKey];
  assert.equal(pool.lists.length, 1, JSON.stringify({
    taskSideKey,
    generationRejected: pool.generationRejected,
    armyPoolAudits: pool.armyPoolAudits,
  }));
  assert.equal(pool.searchScope, "deployment_and_routes_only");
  assert.equal(pool.counts.exactLegalityAttemptCount, 1);
  assert.equal(pool.counts.exactStateBudgetDeferredCount, 0);
  assert.equal(pool.counts.partialStateBudgetDeferredCount, 0);
  assert.equal(
    semanticRosterHash(pool.lists[0]),
    semanticRosterHash(sourceFixedRosters[taskSideKey]),
  );
}

assert.throws(() => buildWarmachineCustomTaskForceBuilderUniverseV1({
  task: { ...winterTask, rulesetReceiptHash: "stale-host-receipt" },
  data,
  forceBuilder,
}), /custom_task_host_receipt_drift/);
assert.throws(() => buildWarmachineCustomTaskForceBuilderUniverseV1({
  task: {
    ...winterTask,
    dataReceipt: { remoteVersion: "stale-data-version" },
  },
  data,
  forceBuilder,
}), /custom_task_data_version_drift/);

const evidenceCore = stableGraphValue({
  schemaVersion: "warmachine_custom_task_force_builder_verification_v1",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  constructionHostReceiptHash: sepsiraUniverse.constructionHostReceiptHash,
  forceBuilderSourceHash: sepsiraUniverse.dataReceipt.forceBuilderSourceHash,
  genericRosterGeneratorSourceHash:
    sepsiraUniverse.dataReceipt.genericRosterGeneratorSourceHash,
  customTaskCompilerSourceHash:
    sepsiraUniverse.dataReceipt.customTaskCompilerSourceHash,
  dataRemoteVersion: data.source.remoteVersion,
  sepsira: {
    taskHash: sepsiraTask.taskHash,
    universeBuildHash: sepsiraUniverse.universeBuildHash,
    subjectRosterCount: sepsiraUniverse.sidePools.subject.lists.length,
    challengerRosterCount: sepsiraUniverse.sidePools.challenger.lists.length,
    challengerLeaderCount:
      sepsiraUniverse.rosterUniverse.sides.challenger.leaderCoverage.length,
    subjectCounts: sepsiraUniverse.sidePools.subject.counts,
    challengerCounts: sepsiraUniverse.sidePools.challenger.counts,
  },
  alternateModularArmy: {
    taskHash: winterTask.taskHash,
    universeBuildHash: winterUniverse.universeBuildHash,
    subjectRosterCount: winterUniverse.sidePools.subject.lists.length,
    challengerRosterCount: winterUniverse.sidePools.challenger.lists.length,
    direWolfOptionSelections: direWolf.optionSelections,
    infantryOptionSelections: infantry.optionSelections,
    excludedGreatBearObserved: false,
  },
  allInFactionResolution: {
    selectedArmyCount: duskAllArmies.selectedArmyCount,
    taskUnselectedArmyCount: duskAllArmies.taskUnselectedArmyCount,
  },
  weaponAttachmentCapacity: {
    threeAccepted: true,
    fourthRejected: true,
    physicalModelCountAfterReplacement: weaponAttachmentRoster.physicalModels,
  },
  fixedCompleteReplay: {
    taskHash: fixedTask.taskHash,
    universeBuildHash: fixedUniverse.universeBuildHash,
    subjectRosterCount: fixedUniverse.sidePools.subject.lists.length,
    challengerRosterCount: fixedUniverse.sidePools.challenger.lists.length,
    rosterSearchSkipped: true,
  },
  negativeGates: {
    staleHostRejected: true,
    staleDataRejected: true,
  },
  quality: {
    exactForceBuilderLegality: true,
    omissionClassesAudited: true,
    strictTransitionEvaluated: false,
    naturalWinRate: false,
    trainingTruth: false,
  },
});
const evidence = { ...evidenceCore, evidenceHash: stableGraphHash(evidenceCore) };
const outputPath = path.join(
  reverseDirectory,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/force-builder/custom-task-force-builder-v1.json",
);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

process.stdout.write(`${JSON.stringify({
  ok: true,
  outputPath,
  evidenceHash: evidence.evidenceHash,
  remoteVersion: evidence.dataRemoteVersion,
  hostReceiptHash: evidence.hostReceiptHash,
  constructionHostReceiptHash: evidence.constructionHostReceiptHash,
  forceBuilderSourceHash: evidence.forceBuilderSourceHash,
  sepsiraSubjectRosterCount: evidence.sepsira.subjectRosterCount,
  faneRosterCount: evidence.sepsira.challengerRosterCount,
  faneLeaderCount: evidence.sepsira.challengerLeaderCount,
  alternateModularRosterCount: evidence.alternateModularArmy.subjectRosterCount,
  allInFactionArmyCount: evidence.allInFactionResolution.selectedArmyCount,
  fixedCompleteRosterCount: evidence.fixedCompleteReplay.subjectRosterCount,
}, null, 2)}\n`);
