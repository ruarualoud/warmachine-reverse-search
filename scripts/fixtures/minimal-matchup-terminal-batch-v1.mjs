import { stableGraphHash, stableGraphValue } from
  "../../src/graph/typed-facts-v2.mjs";
import { warmachineConstructionHost } from
  "../../src/warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../../src/warmachine-host-runtime.mjs";

function seal(value = {}, hashField = "") {
  const core = stableGraphValue(value);
  return { ...core, [hashField]: stableGraphHash(core) };
}

function roster(key, sideName) {
  return stableGraphValue({
    key,
    entries: [
      {
        entryId: `${key}-leader-entry`,
        cardId: `${key}-leader-card`,
        name: `${sideName} Leader`,
        cardTypeName: "Warlock",
        physicalModels: 1,
      },
      {
        entryId: `${key}-unit-entry`,
        cardId: `${key}-unit-card`,
        name: `${sideName} Unit`,
        cardTypeName: "Unit",
        physicalModels: 3,
      },
    ],
  });
}
export function buildMinimalWarmachineMatchupTerminalBatchFixtureV1() {
  const taskCore = stableGraphValue({
    schemaVersion: "warmachine_custom_matchup_task_v1",
    taskKey: "minimal-current-terminal-batch",
    rulesetReceiptHash: warmachineHost.receipt.receiptHash,
    searchBudget: { maximumTerminalRootsPerOpening: 2 },
    stateDomain: {
      mapProfiles: [{ mapKey: "minimal-map" }],
      deploymentSeeds: [{ deploymentSeedKey: "minimal-deployment" }],
      firstPlayerRows: [
        { taskSideKey: "subject" },
        { taskSideKey: "challenger" },
      ],
    },
  });
  const task = { ...taskCore, taskHash: stableGraphHash(taskCore) };
  const representative = stableGraphValue({
    subcellKey: "minimal-assassination-subcell",
    cellKey: "minimal-assassination-cell",
    scenarioKey: "two_fronts",
    representativeRoundNumber: 3,
    terminalClassKey: "assassination",
    coordinates: {
      actionRange: "in_range",
      baseTopology: "open_lane",
      leaderControl: "inside_control",
      lineOfSight: "clear",
      resource: "sufficient",
      damage: "leader_destroyed",
      lifecycle: "destroyed",
      scenarioTerrainSetup: "host_validated",
      scenarioControl: "not_applicable",
      scoreTransition: "not_applicable",
    },
    skeletonObligations: ["leader_destroyed_by_active_attack"],
    sourceResolutionStatus: "resolved",
  });
  const cell = stableGraphValue({
    cellKey: representative.cellKey,
    attackerSideKey: "player1",
    defenderSideKey: "player2",
    winnerSideKey: "player1",
    loserSideKey: "player2",
    endingSideKey: "player1",
    causalActionFamily: "active_attack_or_effect",
    resultKind: "assassination",
  });
  const representativeSelectionCore = stableGraphValue({
    selectedRepresentatives: [representative],
  });
  const representativeSelection = {
    ...representativeSelectionCore,
    selectionHash: stableGraphHash(representativeSelectionCore),
  };
  const demandGroupSetHash = stableGraphHash({
    taskHash: task.taskHash,
    groupKeys: ["minimal-assassination-group"],
  });
  const evidenceCorpusCore = stableGraphValue({
    demandGroupSetHash,
    representativeSelectionHash: representativeSelection.selectionHash,
    cellKeys: [cell.cellKey],
  });
  const evidenceCorpusReceipt = {
    ...evidenceCorpusCore,
    evidenceCorpusHash: stableGraphHash(evidenceCorpusCore),
  };
  const demandGroups = stableGraphValue({
    demandGroupSetHash,
    representativeSelectionHash: representativeSelection.selectionHash,
    groups: [{
      groupKey: "minimal-assassination-group",
      representativeKeys: [representative.subcellKey],
    }],
  });
  const subjectRoster = roster("minimal-subject-roster", "Subject");
  const challengerRoster = roster("minimal-challenger-roster", "Challenger");
  const groupCore = stableGraphValue({
    groupKey: "minimal-assassination-group",
    goalFamily: "assassination",
    constructionMacroProfileKey: "minimal-assassination-macro",
    representativeCount: 1,
    representativeKeys: [representative.subcellKey],
    scenarioKeys: [representative.scenarioKey],
    exactRoundNumbers: [representative.representativeRoundNumber],
    requirements: ["leader_destroyed"],
    evaluationStandard: "strict_host_replay",
    subjectRosterCandidates: [{
      rosterKey: "subject-route-roster",
      sourceListKey: subjectRoster.key,
    }],
    challengerRosterCandidates: [{
      rosterKey: "challenger-route-roster",
      sourceListKey: challengerRoster.key,
    }],
  });
  const routedGroup = {
    ...groupCore,
    routingGroupHash: stableGraphHash(groupCore),
  };
  const routing = seal({
    taskHash: task.taskHash,
    demandGroupSetHash,
    eligibleDemandGroupCount: 1,
    constructionMacroProfileCount: 1,
    routedGroups: [routedGroup],
  }, "routingHash");
  const pool = seal({
    taskHash: task.taskHash,
    source: {
      remoteVersion: "minimal-current",
      constructionHostReceiptHash:
        warmachineConstructionHost.receipt.receiptHash,
      forceBuilderSourceHash: warmachineConstructionHost.receipt.sourceHashes[
        "android-shell/assets/companion/force-builder.js"
      ],
    },
    terminalDemand: {
      demandGroupSetHash,
      evidenceCorpusHash: evidenceCorpusReceipt.evidenceCorpusHash,
      representativeSelectionHash: representativeSelection.selectionHash,
    },
    subjectPool: { rosters: [subjectRoster] },
    challengerPool: { rosters: [challengerRoster] },
  }, "poolSetHash");
  const evidenceCorpus = seal({
    taskHash: task.taskHash,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    demandGroups,
    evidenceCorpus: evidenceCorpusReceipt,
    representativeSelection,
    corpus: { cells: [cell] },
  }, "cacheHash");
  return stableGraphValue({
    task,
    pool,
    routing,
    evidenceCorpus,
    pinnedMaterializationTasks: [{
      groupKey: routedGroup.groupKey,
      representativeSubcellKey: representative.subcellKey,
      subjectRosterKey: routedGroup.subjectRosterCandidates[0].rosterKey,
      challengerRosterKey: routedGroup.challengerRosterCandidates[0].rosterKey,
      mapKey: task.stateDomain.mapProfiles[0].mapKey,
      deploymentSeedKey: task.stateDomain.deploymentSeeds[0].deploymentSeedKey,
      firstPlayerTaskSideKey: "subject",
      sidePermutationKey: "identity",
    }],
  });
}
