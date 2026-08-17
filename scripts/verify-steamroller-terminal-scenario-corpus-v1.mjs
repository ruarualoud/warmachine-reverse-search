import assert from "node:assert/strict";

import {
  auditWarmachineSteamrollerTerminalScenarioCorpusDriftV1,
  buildWarmachineSteamrollerTerminalScenarioCorpusV1,
  WARMACHINE_STEAMROLLER_SCENARIO_STATE_PARTITIONS_V1,
  warmachineSteamrollerTerminalScenarioSubcellKeyV1,
} from "../src/reverse/steamroller-terminal-scenario-corpus-v1.mjs";
import { steamroller2026ScenarioProfiles, warmachineHost } from
  "../src/warmachine-host-runtime.mjs";

const corpus = buildWarmachineSteamrollerTerminalScenarioCorpusV1({
  rosterReceiptHash: "verify-seven-scenario-roster-domain-v1",
});

for (const scenario of corpus.scenarios) {
  const profileCounts = scenario.scoringSourceFamilies.reduce((rows, family) => ({
    ...rows,
    [family.sourceFamilyKey]: family,
  }), {});
  if (profileCounts.opponent_cache) {
    assert.equal(profileCounts.opponent_cache.turnEndSettlementEligible, false);
  }
  for (const transition of scenario.scoreTransitionDomain.transitions) {
    const gain = transition.scoringGainClass;
    assert.equal(typeof gain.representativeWinnerCounts, "object");
    assert.equal(typeof gain.representativeOpponentCounts, "object");
    assert.equal(
      gain.representativeWinnerGain - gain.representativeOpponentGain,
      gain.netGain,
    );
    assert.deepEqual(
      Object.keys(gain.representativeWinnerCounts).sort(),
      [...gain.representativeWinnerSourceFamilyKeys].sort(),
    );
    assert.deepEqual(
      Object.keys(gain.representativeOpponentCounts).sort(),
      [...gain.representativeOpponentSourceFamilyKeys].sort(),
    );
    assert.equal(gain.representativeOpponentCounts.kill_box_penalty || 0, 0);
    assert.equal(gain.representativeWinnerCounts.opponent_cache || 0, 0);
    assert.equal(gain.representativeOpponentCounts.opponent_cache || 0, 0);
    for (const counts of [
      gain.representativeWinnerCounts,
      gain.representativeOpponentCounts,
    ]) {
      if (counts.both_40mm_bonus) assert.ok((counts.objective_40 || 0) >= 2);
      if (counts.both_50mm_bonus) assert.ok((counts.objective_50 || 0) >= 2);
      if (counts.secure_two_own_bonus) {
        assert.ok((counts.objective_40 || 0) + (counts.objective_50 || 0) >= 2);
      }
      if (counts.secure_three_own_bonus) {
        assert.ok((counts.objective_40 || 0) + (counts.objective_50 || 0) >= 3);
      }
      if (counts.third_progress_token_goal) assert.ok((counts.objective_40 || 0) >= 1);
      if (counts.payload_delivery) assert.ok((counts.objective_50 || 0) >= 1);
    }
  }
}

assert.equal(corpus.scenarios.length, 7);
assert.equal(corpus.counts.scenarioCount, 7);
assert.equal(new Set(corpus.scenarios.map((row) => row.scenarioKey)).size, 7);
assert.ok(corpus.cells.length > 0);
assert.equal(new Set(corpus.cells.map((cell) => cell.cellKey)).size, corpus.cells.length);
assert.equal(corpus.coverage.denominatorComplete, true);
assert.equal(corpus.coverage.unboundedRawRoundTailExplicit, true);
assert.equal(corpus.coverage.exactRawRoundCoverage, false);
assert.equal(corpus.cells.every((cell) => cell.trainingTruth === false), true);
assert.equal(corpus.cells.every((cell) => cell.strictCertified === false), true);
assert.equal(corpus.counts.strictMaterializedSubcellCount, "0");
assert.equal(corpus.counts.strictRejectedSubcellCount, "0");
assert.equal(
  corpus.counts.proposedSubcellCount,
  corpus.counts.budgetDeferredSubcellCount,
);
assert.deepEqual(
  Object.keys(WARMACHINE_STEAMROLLER_SCENARIO_STATE_PARTITIONS_V1).sort(),
  corpus.scenarios.map((scenario) => scenario.scenarioKey).sort(),
);
assert.deepEqual(
  Object.keys(corpus.scenarios.find((scenario) =>
    scenario.scenarioKey === "two_fronts").scenarioStatePartitions),
  ["scenarioTerrainSetup"],
);
assert.deepEqual(
  Object.keys(corpus.scenarios.find((scenario) =>
    scenario.scenarioKey === "pressure_point").scenarioStatePartitions),
  ["scenarioTerrainSetup"],
);
assert.deepEqual(
  Object.keys(corpus.scenarios.find((scenario) =>
    scenario.scenarioKey === "fault_line").scenarioStatePartitions),
  ["scenarioTerrainSetup"],
);
assert.deepEqual(
  corpus.scenarios.find((scenario) => scenario.scenarioKey === "fault_line")
    .scenarioStatePartitions.scenarioTerrainSetup,
  ["not_applicable"],
);
for (const [scenarioKey, requiredPartitionKeys] of Object.entries({
  trench_warfare: ["scenarioTerrainSetup", "trenchCacheLifecycle"],
  wolves_at_our_heels: [
    "scenarioTerrainSetup",
    "wolvesProgressState",
    "wolvesTokenDecision",
    "wolvesObjectiveMove",
  ],
  high_stakes: [
    "scenarioTerrainSetup",
    "highStakesCountdownState",
    "highStakesFuseResolution",
    "highStakesBlastClosure",
  ],
  payload: [
    "scenarioTerrainSetup",
    "payloadLifecycle",
    "payloadMoveDecision",
    "madeToHaulDecision",
  ],
})) {
  const scenario = corpus.scenarios.find((row) => row.scenarioKey === scenarioKey);
  assert.deepEqual(Object.keys(scenario.scenarioStatePartitions).sort(),
    [...requiredPartitionKeys].sort());
  const scenarioCells = corpus.cells.filter((cell) => cell.scenarioKey === scenarioKey);
  assert.equal(scenarioCells.every((cell) => requiredPartitionKeys.every((key) =>
    cell.partitions[key]?.length > 0)), true);
}

for (const terminalClassKey of corpus.terminalClassKeys) {
  assert.ok(corpus.counts.terminalClassCounts[terminalClassKey] > 0, terminalClassKey);
}

const fixedRoundCells = corpus.cells.filter((cell) =>
  cell.terminalClassKey === "fixed_round_limit_result");
assert.ok(fixedRoundCells.length > 0);
assert.equal(fixedRoundCells.some((cell) => cell.scenarioKey === "two_fronts"), false);
assert.equal(fixedRoundCells.every((cell) =>
  cell.roundClass.representativeRoundNumber === 7 &&
  cell.endingSideKey === cell.defenderSideKey), true);
assert.equal(fixedRoundCells.filter((cell) => cell.resultKind === "win").every((cell) =>
  cell.sourceResolutionStatus === "officially_confirmed"), true);
assert.equal(fixedRoundCells.filter((cell) => cell.resultKind === "tie").every((cell) =>
  cell.sourceResolutionStatus ===
    "official_second_tiebreak_still_tied_result_unresolved"), true);
assert.deepEqual(
  [...new Set(fixedRoundCells.map((cell) => cell.scenarioKey))].sort(),
  [
    "fault_line",
    "high_stakes",
    "payload",
    "pressure_point",
    "trench_warfare",
    "wolves_at_our_heels",
  ],
);

const scoreCells = corpus.cells.filter((cell) =>
  cell.terminalClassKey === "lead_three_after_opponent_turn_scoring");
assert.equal(scoreCells.every((cell) => cell.endingSideKey === cell.loserSideKey), true);
assert.equal(scoreCells.every((cell) => cell.roundClass.representativeRoundNumber >=
  (cell.endingSideKey === cell.defenderSideKey ? 2 : 3)), true);
assert.equal(corpus.scenarios.every((scenario) =>
  scenario.scoreTransitionDomain.transitions.length > 0), true);
assert.equal(corpus.scenarios.every((scenario) =>
  scenario.scoringSourceFamilies.some((family) =>
    family.sourceFamilyKey === "kill_box_penalty" && family.pointValue === 2)), true);
assert.equal(corpus.scenarios.every((scenario) =>
  scenario.scoreTransitionDomain.transitions.every((transition) =>
    transition.leadAfter >= 3 && (
      transition.leadBeforeClass === "already_at_least_three"
        ? transition.exactLeadBefore === false && transition.representativeLeadBefore === 3
        : transition.leadBeforeClass === "exact_below_three" &&
          transition.exactLeadBefore === true && transition.leadBefore < 3
    ))), true);
assert.equal(corpus.scenarios.every((scenario) =>
  scenario.scoreTransitionDomain.transitions.some((transition) =>
    transition.leadBeforeClass === "already_at_least_three")), true);

const simultaneousCells = corpus.cells.filter((cell) =>
  cell.terminalClassKey === "simultaneous_leader_tiebreak");
assert.ok(simultaneousCells.some((cell) => cell.resultKind === "tie"));
assert.equal(simultaneousCells.filter((cell) => cell.resultKind === "tie").every((cell) =>
  cell.sourceResolutionStatus ===
    "official_second_tiebreak_still_tied_result_unresolved"), true);
assert.ok(simultaneousCells.some((cell) =>
  cell.tiebreakClassKey === "victory_point_advantage"));
assert.ok(simultaneousCells.some((cell) =>
  cell.tiebreakClassKey === "victory_points_tied_scenario_presence_advantage"));

const tailCells = corpus.cells.filter((cell) =>
  cell.roundClass.equivalenceStatus === "symbolic_unbounded_tail_unproven");
assert.ok(tailCells.length > 0);
assert.deepEqual([...new Set(tailCells.map((cell) => cell.scenarioKey))], ["two_fronts"]);

const firstCell = corpus.cells[0];
const coordinates = Object.fromEntries(Object.entries(firstCell.partitions)
  .map(([key, values]) => [key, values[0]]));
const subcellKey = warmachineSteamrollerTerminalScenarioSubcellKeyV1(
  firstCell,
  coordinates,
);
assert.equal(subcellKey, warmachineSteamrollerTerminalScenarioSubcellKeyV1(
  firstCell,
  { ...coordinates },
));
const firstPartitionKey = Object.keys(firstCell.partitions)[0];
assert.throws(() => warmachineSteamrollerTerminalScenarioSubcellKeyV1(firstCell, {
  ...coordinates,
  [firstPartitionKey]: "invented_relation",
}), /terminal_scenario_subcell_coordinate_invalid/);

const stableCorpus = buildWarmachineSteamrollerTerminalScenarioCorpusV1({
  rosterReceiptHash: "verify-seven-scenario-roster-domain-v1",
  scenarioProfiles: [...steamroller2026ScenarioProfiles()].reverse(),
});
assert.equal(stableCorpus.corpusHash, corpus.corpusHash);

const currentDrift = auditWarmachineSteamrollerTerminalScenarioCorpusDriftV1(corpus);
assert.equal(currentDrift.resumeAllowed, true);
assert.equal(currentDrift.staleCellCount, 0);

const changedProfiles = steamroller2026ScenarioProfiles().map((profile) =>
  profile.scenarioKey === "trench_warfare"
    ? { ...profile, cachePoints: profile.cachePoints + 1 }
    : profile);
const scenarioDrift = auditWarmachineSteamrollerTerminalScenarioCorpusDriftV1(corpus, {
  scenarioProfiles: changedProfiles,
});
assert.equal(scenarioDrift.resumeAllowed, false);
assert.deepEqual(scenarioDrift.staleScenarioKeys, ["trench_warfare"]);
assert.equal(scenarioDrift.staleCellCount, corpus.cells.filter((cell) =>
  cell.scenarioKey === "trench_warfare").length);

const rulesDrift = auditWarmachineSteamrollerTerminalScenarioCorpusDriftV1(corpus, {
  hostSourceHashes: {
    ...warmachineHost.receipt.sourceHashes,
    "scripts/warmachine-rules-v1.mjs": "changed-rules-engine-hash",
  },
});
assert.equal(rulesDrift.staleCellCount, corpus.cells.length);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_steamroller_terminal_scenario_corpus_v1",
  corpusHash: corpus.corpusHash,
  scenarioCount: corpus.counts.scenarioCount,
  cellCount: corpus.counts.cellCount,
  terminalClassCounts: corpus.counts.terminalClassCounts,
  symbolicUnboundedTailCellCount: corpus.counts.symbolicUnboundedTailCellCount,
  sourceUnresolvedCellCount: corpus.counts.sourceUnresolvedCellCount,
  proposedSubcellCount: corpus.counts.proposedSubcellCount,
  strictMaterializedSubcellCount: corpus.counts.strictMaterializedSubcellCount,
  strictRejectedSubcellCount: corpus.counts.strictRejectedSubcellCount,
  budgetDeferredSubcellCount: corpus.counts.budgetDeferredSubcellCount,
  fixedRoundScenarioCount: new Set(fixedRoundCells.map((cell) => cell.scenarioKey)).size,
  subcellKey,
  driftCases: {
    current: currentDrift.staleCellCount,
    oneScenario: scenarioDrift.staleCellCount,
    rulesEngine: rulesDrift.staleCellCount,
  },
}, null, 2));
