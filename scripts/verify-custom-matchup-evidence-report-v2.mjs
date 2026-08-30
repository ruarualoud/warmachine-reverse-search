import assert from "node:assert/strict";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import { buildWarmachineCustomMatchupEvidenceReportV2 } from
  "../src/report/custom-matchup-evidence-report-v2.mjs";

const hostReceiptHash = "host-receipt-ticket09";
const leaders = ["Ashmael", "Auricant", "Hysene", "Nymara"];
const baseReport = {
  reportHash: "base-report-hash",
  task: { taskHash: "task-hash" },
  source: {
    hostReceiptHash,
    dataContentHash: "data-hash",
    poolContentHash: "pool-hash",
    remoteVersion: "test-version",
  },
  counts: {
    subjectRosterCount: 1,
    challengerRosterCount: 4,
    strictRepresentativeOpeningCount: 4,
  },
  leaderConclusions: leaders.map((leaderName, index) => ({
    leaderName,
    finiteRosterCount: 1,
    paretoRosterCount: 1,
    robustBestRosterKey: `roster-${index}`,
    robustBestScreeningIndex: 10 - index,
  })),
  screening: {
    mapWeights: {
      "map-1": { control: 1 },
      "map-2": { mobility: 1 },
    },
    rows: leaders.map((_, index) => ({
      rosterKey: `roster-${index}`,
      rawDimensions: {
        melee_removal: 10 + index,
        ranged_removal: 2,
        anti_tough_removal: 1,
        resource_optimized_removal: 12,
        control: 4,
        scenario: 3,
        model_count: 40,
        mobility: 7,
        defense: 5,
        resource_free_removal: 9,
        recursion: 1,
      },
    })),
  },
  representativeOpenings: leaders.map((leaderName, index) => ({
    subjectRosterKey: "subject-roster",
    challengerRosterKey: `roster-${index}`,
    scenarioKey: "two_fronts",
    mapKey: "map-1",
    deploymentSeedKey: `deployment-${index}`,
    firstPlayerTaskSideKey: "challenger",
    formationKey: `formation-${index}`,
    strictOpeningStateHash: `opening-state-${index}`,
    strictDeploymentReceiptHash: `deployment-receipt-${index}`,
    exactMapTopologyAuditOk: true,
    exactMapTopologyAuditHash: `topology-audit-${index}`,
    exactMapTopologyRealizationHash: `topology-realization-${index}`,
    exactMapTopologyObserved: {
      laneOpenness: 0.75,
      losBlocking: 0.25,
      movementChokepoints: 0.25,
      roughTerrainLoad: 0.02,
    },
    challengerRoster: {
      rosterKey: `roster-${index}`,
      leaderName,
      armyName: "Fane",
      pointTotal: 100,
      physicalModelCount: 40,
      entries: [{
        entryId: `entry-${index}`,
        cardId: `card-${index}`,
        name: leaderName,
        cardTypeName: "Warlock",
      }],
    },
  })),
};

function exactRoster(key, leader, physicalModels) {
  return {
    key,
    leader,
    army: leader === "Sepsira" ? "Necrofactorium" : "Fane",
    faction: leader === "Sepsira" ? "Cryx" : "Fane of Nyrro",
    totalPoints: 100,
    physicalModels,
    warnings: [],
    entries: [{
      entryId: `${key}-leader`,
      cardId: `${key}-leader-card`,
      name: leader,
      linePoints: 0,
      physicalModels: 1,
      optionSelections: {},
    }, {
      entryId: `${key}-body`,
      cardId: `${key}-body-card`,
      name: `${leader} body`,
      linePoints: 100,
      physicalModels: physicalModels - 1,
      optionSelections: {},
    }],
  };
}

const rosterPoolCore = stableGraphValue({
  schemaVersion: "fixture_roster_pool_v1",
  source: { remoteVersion: "test-version" },
  taskHash: "task-hash",
  subjectPool: {
    pointLimit: 100,
    rosters: [exactRoster("subject-roster", "Sepsira", 20)],
    quality: { exactListLegality: true },
    enumerationAudit: { allReturnedRostersForceBuilderLegal: true },
  },
  challengerPool: {
    pointLimit: 100,
    rosters: leaders.map((leaderName, index) =>
      exactRoster(`roster-${index}`, leaderName, 20)),
    quality: { exactListLegality: true },
    enumerationAudit: { allReturnedRostersForceBuilderLegal: true },
  },
  quality: { exactForceBuilderLegality: true },
});
const rosterPool = {
  ...rosterPoolCore,
  poolSetHash: stableGraphHash(rosterPoolCore),
};

function openingAddress(index = 0) {
  return {
    subjectFactionKey: "Cryx",
    challengerFactionKey: "Fane of Nyrro",
    scenarioKey: "two_fronts",
    mapKey: "map-1",
    firstPlayerSideKey: "player2",
    deploymentSeedKey: `route-deployment-${index}`,
    physicalModelCount: 40,
  };
}

function valueRow(initialStateKey, strictReplayComplete, {
  routeKey,
  terminalFamilyKey,
  terminalSourceKey,
  index,
}) {
  return {
    initialStateKey,
    strictOpeningEvidence: {
      certified: true,
      stateHash: `strict-opening-state-${index}`,
      evidenceHash: `strict-opening-evidence-${index}`,
      hostReceiptHash,
      currentHostReceiptMatches: true,
    },
    address: openingAddress(index),
    routeLabels: [{ routeKey, terminalFamilyKey, terminalSourceKey }],
    strictGameValueInterval: {
      lowerBound: 0,
      upperBound: 1,
      exact: false,
    },
    closure: {
      strictOpeningComplete: true,
      strictReplayComplete,
      assumptionClosureComplete: true,
    },
    missingClosureKeys: [
      "candidateSetComplete",
      "opponentResponseClosureComplete",
      "probabilityClosureComplete",
      ...(strictReplayComplete ? [] : ["strictReplayComplete"]),
    ],
  };
}

const initialValueEvidence = {
  hostReceiptHash,
  reportHash: "value-report-hash",
  valueSetHash: "value-set-hash",
  rows: [
    valueRow("opening-ashmael-assassination", true, {
      routeKey: "ashmael-assassination",
      terminalFamilyKey: "assassination",
      terminalSourceKey: "leader-removal",
      index: 0,
    }),
    valueRow("opening-hysene-score", false, {
      routeKey: "hysene-score",
      terminalFamilyKey: "score",
      terminalSourceKey: "scenario-settlement",
      index: 2,
    }),
    valueRow("same-model-count-unused-cell", false, {
      routeKey: "unused-route",
      terminalFamilyKey: "score",
      terminalSourceKey: "unused-settlement",
      index: 3,
    }),
  ],
  aggregation: {
    allowed: false,
    naturalWinRateClaimed: false,
  },
  naturalWinRateClaimed: false,
};

const historyEvidence = {
  hostReceiptHash,
  reportHash: "history-report-hash",
  invalidFourZeroRewrite: {
    rejected: true,
    failureReasons: ["history_bound_terminal_successor_state_mismatch"],
  },
};

const routes = [{
  routeKey: "ashmael-assassination",
  leaderName: "Ashmael",
  initialStateKey: "opening-ashmael-assassination",
  terminalFamilyKey: "assassination",
  terminalSourceKey: "leader-removal",
  subjectRosterKey: "subject-roster",
  challengerRosterKey: "roster-0",
  strictOpeningStateHash: "strict-opening-state-0",
  strictOpeningEvidenceHash: "strict-opening-evidence-0",
  openingAddress: openingAddress(0),
  challengerSideKey: "player2",
  winnerSideKey: "player2",
  reverseEdgeCount: 20,
  strictOpeningComplete: true,
  strictReplayComplete: true,
  assumptionClosureComplete: true,
  observedRouteDelta: { score: { player1: 0, player2: 0 } },
}, {
  routeKey: "hysene-score",
  leaderName: "Hysene",
  initialStateKey: "opening-hysene-score",
  terminalFamilyKey: "score",
  terminalSourceKey: "scenario-settlement",
  subjectRosterKey: "subject-roster",
  challengerRosterKey: "roster-2",
  strictOpeningStateHash: "strict-opening-state-2",
  strictOpeningEvidenceHash: "strict-opening-evidence-2",
  openingAddress: openingAddress(2),
  challengerSideKey: "player2",
  winnerSideKey: "player1",
  reverseEdgeCount: 96,
  strictOpeningComplete: true,
  strictReplayComplete: false,
  assumptionClosureComplete: true,
}];

const report = buildWarmachineCustomMatchupEvidenceReportV2({
  generatedAt: "2026-08-24T00:00:00.000Z",
  baseReport,
  initialValueEvidence,
  historyEvidence,
  rosterPool,
  routes,
});
const repeatedReport = buildWarmachineCustomMatchupEvidenceReportV2({
  generatedAt: "2026-08-25T00:00:00.000Z",
  baseReport: { ...baseReport, generatedAt: "different", reportHash: "different" },
  initialValueEvidence,
  historyEvidence,
  rosterPool,
  routes,
});

assert.equal(report.ok, true);
assert.equal(report.schemaVersion, "warmachine_custom_matchup_evidence_report_v2");
assert.equal(report.counts.leaderCount, 4);
assert.equal(report.counts.routeEvidenceCount, 2);
assert.equal(report.counts.strictRouteCount, 1);
assert.equal(report.counts.favorableStrictRouteCount, 1);
assert.equal(report.counts.unfavorableStrictRouteCount, 0);
assert.equal(report.counts.pendingRouteSearchTaskCount, 7);
assert.equal(report.counts.pendingMapOpeningTaskCount, 4);
assert.equal(report.counts.pendingSearchTaskCount, 11);
assert.equal(report.completion.reportComplete, false);
assert.equal(report.naturalWinRateClaimed, false);
assert.equal(report.globalOptimalityProven, false);
assert.equal(repeatedReport.reportHash, report.reportHash);

const ashmael = report.leaderReports.find((row) => row.leaderName === "Ashmael");
assert.equal(ashmael.routeFamilyCoverage.assassination.completeForTicket09, true);
assert.equal(ashmael.routeFamilyCoverage.score.completeForTicket09, false);
assert.deepEqual(ashmael.missingRouteFamilyKeys, ["score"]);
assert.deepEqual(ashmael.missingMapKeys, ["map-2"]);
assert.equal(ashmael.routes[0].outcomeForChallenger, "win");
assert.equal(ashmael.routes[0].strictGameValueInterval.exact, false);
assert.equal(ashmael.routes[0].strictOpeningIdentityComplete, true);
assert.equal(ashmael.routes[0].routeRosterEvidence.exactRosterEvidenceComplete, true);
assert.equal(ashmael.routes[0].routeRosterEvidence.subject.pointAccountingComplete, true);
assert.equal(ashmael.routes[0].routeRosterEvidence.challengerMatchesScreeningRepresentative,
  true);
assert.equal(ashmael.screeningEvidence.comparisonAxes.strictRouteValue, false);

const hysene = report.leaderReports.find((row) => row.leaderName === "Hysene");
assert.equal(hysene.routes[0].outcomeForChallenger, "loss");
assert.equal(hysene.routes[0].strictRouteExists, false);
assert.deepEqual(hysene.missingRouteFamilyKeys, ["assassination", "score"]);

assert.throws(() => buildWarmachineCustomMatchupEvidenceReportV2({
  baseReport,
  initialValueEvidence: { ...initialValueEvidence, hostReceiptHash: "wrong" },
  historyEvidence,
  rosterPool,
  routes,
}), /custom_matchup_report_host_receipt_mismatch/);

assert.throws(() => buildWarmachineCustomMatchupEvidenceReportV2({
  baseReport,
  initialValueEvidence: { ...initialValueEvidence, naturalWinRateClaimed: true },
  historyEvidence,
  rosterPool,
  routes,
}), /custom_matchup_report_unverified_natural_win_rate/);

const openingTamperReport = buildWarmachineCustomMatchupEvidenceReportV2({
  baseReport,
  initialValueEvidence,
  historyEvidence,
  rosterPool,
  routes: routes.map((route, index) => index === 0
    ? { ...route, strictOpeningStateHash: "tampered-opening-state" }
    : route),
});
assert.equal(openingTamperReport.routes.find((row) =>
  row.routeKey === "ashmael-assassination").strictRouteExists, false);

const rosterTamperReport = buildWarmachineCustomMatchupEvidenceReportV2({
  baseReport,
  initialValueEvidence,
  historyEvidence,
  rosterPool,
  routes: routes.map((route, index) => index === 0
    ? { ...route, challengerRosterKey: "unknown-roster" }
    : route),
});
assert.equal(rosterTamperReport.routes.find((row) =>
  row.routeKey === "ashmael-assassination")
  .routeRosterEvidence.exactRosterEvidenceComplete, false);
assert.equal(rosterTamperReport.routes.find((row) =>
  row.routeKey === "ashmael-assassination").strictRouteExists, false);

assert.throws(() => buildWarmachineCustomMatchupEvidenceReportV2({
  baseReport,
  initialValueEvidence,
  historyEvidence,
  rosterPool: { ...rosterPool, poolSetHash: "tampered" },
  routes,
}), /custom_matchup_report_roster_pool_hash_invalid/);

process.stdout.write(`${JSON.stringify({
  ok: true,
  reportHash: report.reportHash,
  counts: report.counts,
  pendingSearchTaskCount: report.pendingSearchQueue.length,
}, null, 2)}\n`);
