import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  steamroller2026ScenarioProfiles,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";

export const WARMACHINE_STEAMROLLER_TERMINAL_SCENARIO_CORPUS_V1_SCHEMA =
  "warmachine_steamroller_terminal_scenario_corpus_v1";
export const WARMACHINE_STEAMROLLER_TERMINAL_SCENARIO_CELL_V1_SCHEMA =
  "warmachine_steamroller_terminal_scenario_cell_v1";

export const WARMACHINE_STEAMROLLER_TERMINAL_CLASS_KEYS_V1 = Object.freeze([
  "unique_leader_assassination",
  "simultaneous_leader_tiebreak",
  "lead_three_after_opponent_turn_scoring",
  "fixed_round_limit_result",
]);

export const WARMACHINE_STEAMROLLER_SCENARIO_STATE_PARTITIONS_V1 = Object.freeze({
  trench_warfare: Object.freeze({
    scenarioTerrainSetup: Object.freeze([
      "all_flags_fallback_no_valid_terrain",
      "mixed_fallback_and_selected",
      "all_selected_from_single_candidate",
      "all_selected_first_available_candidate",
      "at_least_one_nonfirst_candidate_selected",
    ]),
    trenchCacheLifecycle: Object.freeze([
      "both_caches_active",
      "player1_owned_cache_removed",
      "player2_owned_cache_removed",
      "both_caches_removed",
    ]),
  }),
  two_fronts: Object.freeze({
    scenarioTerrainSetup: Object.freeze([
      "all_flags_fallback_no_valid_terrain",
      "mixed_fallback_and_selected",
      "all_selected_from_single_candidate",
      "all_selected_first_available_candidate",
      "at_least_one_nonfirst_candidate_selected",
    ]),
  }),
  wolves_at_our_heels: Object.freeze({
    scenarioTerrainSetup: Object.freeze([
      "all_flags_fallback_no_valid_terrain",
      "mixed_fallback_and_selected",
      "all_selected_from_single_candidate",
      "all_selected_first_available_candidate",
      "at_least_one_nonfirst_candidate_selected",
    ]),
    wolvesProgressState: Object.freeze([
      "all_progress_zero",
      "nonterminal_progress_below_two",
      "at_least_one_objective_at_two",
      "one_side_third_token_goal_checked",
      "simultaneous_third_token_goal_checked",
    ]),
    wolvesTokenDecision: Object.freeze([
      "no_owned_40mm_objective_secured",
      "eligible_add_token_declined",
      "eligible_add_token_used",
    ]),
    wolvesObjectiveMove: Object.freeze([
      "move_not_triggered",
      "opponent_move_declined",
      "legal_move_toward_linked_50mm",
      "illegal_path_or_placement_expected_reject",
    ]),
  }),
  pressure_point: Object.freeze({
    scenarioTerrainSetup: Object.freeze([
      "all_flags_fallback_no_valid_terrain",
      "mixed_fallback_and_selected",
      "all_selected_from_single_candidate",
      "all_selected_first_available_candidate",
      "at_least_one_nonfirst_candidate_selected",
    ]),
  }),
  high_stakes: Object.freeze({
    scenarioTerrainSetup: Object.freeze([
      "all_flags_fallback_no_valid_terrain",
      "mixed_fallback_and_selected",
      "all_selected_from_single_candidate",
      "all_selected_first_available_candidate",
      "at_least_one_nonfirst_candidate_selected",
    ]),
    highStakesCountdownState: Object.freeze([
      "all_elements_at_five",
      "one_nonzero_element_reduced",
      "multiple_nonzero_elements_reduced",
      "exactly_one_element_detonated",
      "multiple_elements_detonated",
    ]),
    highStakesFuseResolution: Object.freeze([
      "random_target_without_50mm_secured",
      "secured_50mm_remove_one",
      "secured_50mm_remove_two",
      "secured_50mm_remove_three",
      "no_eligible_target",
    ]),
    highStakesBlastClosure: Object.freeze([
      "no_detonation",
      "detonation_with_no_live_models_affected",
      "exact_damage_roll_for_every_affected_model",
      "missing_damage_roll_expected_reject",
    ]),
  }),
  fault_line: Object.freeze({
    scenarioTerrainSetup: Object.freeze(["not_applicable"]),
  }),
  payload: Object.freeze({
    scenarioTerrainSetup: Object.freeze([
      "all_flags_fallback_no_valid_terrain",
      "mixed_fallback_and_selected",
      "all_selected_from_single_candidate",
      "all_selected_first_available_candidate",
      "at_least_one_nonfirst_candidate_selected",
    ]),
    payloadLifecycle: Object.freeze([
      "both_payloads_active",
      "one_payload_delivered_and_removed",
      "both_payloads_delivered_and_removed",
    ]),
    payloadMoveDecision: Object.freeze([
      "no_owned_50mm_objective_secured",
      "eligible_move_declined",
      "legal_move_without_delivery",
      "legal_move_with_delivery",
      "illegal_path_or_distance_expected_reject",
    ]),
    madeToHaulDecision: Object.freeze([
      "not_triggered",
      "eligible_haul_declined",
      "eligible_cohort_with_clear_path",
      "ineligible_or_blocked_expected_reject",
    ]),
  }),
});

const SIDE_KEYS = Object.freeze(["player1", "player2"]);
const PROFILE_REGISTRY_SOURCE = "scripts/warmachine-steamroller-2026-v1.mjs";
const RULES_ENGINE_SOURCE = "scripts/warmachine-rules-v1.mjs";
const OFFICIAL_SOURCE_REFERENCE = Object.freeze({
  publicationKey: "steamroller-2026",
  relativePath:
    "warmachine_tool_v6_advanced/warmachine_data/publications/other/steamroller_2026.txt",
  authority: "Steamforged Games",
  packetYear: 2026,
});

const FACTORIZED_PARTITIONS = Object.freeze({
  lifecycle: Object.freeze([
    "both_rosters_complete",
    "winner_prior_losses",
    "loser_prior_losses",
    "both_sides_prior_losses",
    "removed_from_play_history",
    "reserve_replacement_or_dormant_history",
  ]),
  damage: Object.freeze([
    "critical_models_undamaged",
    "critical_models_partially_damaged",
    "leader_at_terminal_threshold",
    "warjack_system_disabled",
    "warbeast_aspect_disabled",
  ]),
  resource: Object.freeze([
    "zero_available",
    "exact_terminal_payment",
    "one_additional_purchase_available",
    "maximum_native_resource",
    "controller_transfer_or_channel_available",
  ]),
  actionRange: Object.freeze([
    "strictly_inside",
    "on_boundary",
    "outside_direct_action_range_requires_prior_movement",
  ]),
  leaderControl: Object.freeze([
    "strictly_inside",
    "on_boundary",
    "outside_or_not_required",
  ]),
  lineOfSight: Object.freeze([
    "clear",
    "terrain_blocked",
    "model_blocked",
    "stealth_blocks_beyond_five",
    "true_sight_or_ignore_stealth_override",
    "non_targeting_not_required",
  ]),
  baseTopology: Object.freeze([
    "legal_separated",
    "legal_contact",
    "illegal_overlap_expected_reject",
    "outside_table_expected_reject",
  ]),
  scenarioControl: Object.freeze([
    "winner_secures_uncontested",
    "contested",
    "controller_ineligible",
    "not_applicable",
  ]),
});

function oppositeSide(sideKey = "") {
  if (sideKey === "player1") return "player2";
  if (sideKey === "player2") return "player1";
  return "";
}

function sortedUnique(values = []) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null)
    .map(String).filter(Boolean))].sort();
}

function bigintProduct(values = []) {
  return values.reduce((product, value) => product * BigInt(value), 1n);
}

function bigintSum(values = []) {
  return values.reduce((sum, value) => sum + BigInt(value), 0n);
}

function dependencyReceiptForProfile(profile = {}, rawOptions = {}) {
  const sourceHashes = rawOptions.hostSourceHashes || warmachineHost.receipt.sourceHashes || {};
  return stableGraphValue({
    hostReceiptHash: String(rawOptions.hostReceiptHash || warmachineHost.receipt.receiptHash),
    rulesEngineHash: String(sourceHashes[RULES_ENGINE_SOURCE] || ""),
    scenarioRegistryHash: String(sourceHashes[PROFILE_REGISTRY_SOURCE] || ""),
    scenarioSemanticHash: stableGraphHash(profile),
  });
}

function fixedRound(profile = {}) {
  const value = Number(profile.fixedRoundLimit || 0);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function exactRoundClass(roundNumber) {
  return stableGraphValue({
    roundClassKey: `exact_round_${roundNumber}`,
    representativeRoundNumber: roundNumber,
    exactRoundNumber: true,
    rawRoundDomain: [roundNumber],
    equivalenceStatus: "exact",
  });
}

function unboundedTailRoundClass(startRoundNumber) {
  return stableGraphValue({
    roundClassKey: `unbounded_round_tail_${startRoundNumber}_plus`,
    representativeRoundNumber: startRoundNumber,
    exactRoundNumber: false,
    rawRoundDomain: [`${startRoundNumber}+`],
    equivalenceStatus: "symbolic_unbounded_tail_unproven",
  });
}

function roundClasses(profile, terminalClassKey, timing = {}) {
  const limit = fixedRound(profile);
  if (terminalClassKey === "fixed_round_limit_result") {
    return limit ? [exactRoundClass(limit)] : [];
  }
  let minimumRound = 1;
  if (terminalClassKey === "lead_three_after_opponent_turn_scoring") {
    minimumRound = timing.endingSideKey === timing.defenderSideKey ? 2 : 3;
  }
  const exactUpperBound = limit || 7;
  const rows = [];
  for (let roundNumber = minimumRound; roundNumber <= exactUpperBound; roundNumber += 1) {
    rows.push(exactRoundClass(roundNumber));
  }
  if (!limit) rows.push(unboundedTailRoundClass(Math.max(minimumRound, exactUpperBound + 1)));
  return rows;
}

function scoringSourceFamilies(profile = {}) {
  const rows = [];
  const counts = profile.elementCounts || {};
  const objectivePoints = profile.objectivePoints || {};
  const terrainPoints = profile.scenarioTerrainPoints || {};
  function add(sourceFamilyKey, pointValue, maximumCount, detail = {}) {
    const points = Number(pointValue || 0);
    const count = Math.max(0, Number(maximumCount || 0));
    if (points <= 0 || count <= 0) return;
    rows.push(stableGraphValue({
      sourceFamilyKey,
      pointValue: points,
      maximumCount: count,
      turnEndSettlementEligible: detail.turnEndSettlementEligible !== false,
      ...detail,
    }));
  }
  add("objective_40", objectivePoints[40], counts.objectives40);
  add("objective_50", objectivePoints[50], counts.objectives50);
  const terrainCount = Math.max(0, Number(counts.scenarioTerrain || 0));
  add("scenario_terrain_own", terrainPoints.own, Math.ceil(terrainCount / 2));
  add("scenario_terrain_opponent", terrainPoints.opponent, Math.floor(terrainCount / 2));
  add("opponent_cache", profile.cachePoints, Math.ceil(Number(counts.caches || 0) / 2), {
    scoreTiming: "objective_destroyed_step",
    turnEndSettlementEligible: false,
  });
  add("kill_box_penalty", 2, 1, {
    sourceActionFamily: "ending_side_leader_inside_own_kill_box_at_turn_end",
  });
  const specialRules = new Set(profile.specialRuleKeys || []);
  if (specialRules.has("both_40mm_bonus")) add("both_40mm_bonus", 1, 1);
  if (specialRules.has("both_50mm_bonus")) add("both_50mm_bonus", 1, 1);
  if (specialRules.has("objective_progress_race")) add("third_progress_token_goal", 3, 1);
  if (specialRules.has("zero_countdown_bonus")) {
    add("zero_countdown_50mm_bonus", 1, Math.max(1, Number(counts.objectives50 || 0)));
    add("zero_countdown_terrain_bonus", 1, Math.max(1, terrainCount));
  }
  if (specialRules.has("secure_two_own_bonus")) add("secure_two_own_bonus", 1, 1);
  if (specialRules.has("secure_three_own_bonus")) add("secure_three_own_bonus", 1, 1);
  if (specialRules.has("payload_delivery")) add("payload_delivery", 3, 1);
  return rows.sort((left, right) => left.sourceFamilyKey.localeCompare(right.sourceFamilyKey));
}

function scoringBundles(sourceFamilies = []) {
  let rows = [{ counts: {}, total: 0, sourceFamilyKeys: [] }];
  for (const family of sourceFamilies.filter((row) =>
    row.turnEndSettlementEligible !== false)) {
    const next = [];
    for (const row of rows) {
      for (let count = 0; count <= family.maximumCount; count += 1) {
        next.push({
          counts: count > 0
            ? { ...row.counts, [family.sourceFamilyKey]: count }
            : { ...row.counts },
          total: row.total + count * family.pointValue,
          sourceFamilyKeys: count > 0
            ? [...row.sourceFamilyKeys, family.sourceFamilyKey]
            : [...row.sourceFamilyKeys],
        });
      }
    }
    rows = next;
  }
  return rows.map((row) => stableGraphValue({
    ...row,
    bundleKey: `score-bundle-${stableGraphHash(row, 20)}`,
  })).sort((left, right) => left.total - right.total ||
    left.bundleKey.localeCompare(right.bundleKey));
}

function scoreCount(bundle = {}, sourceFamilyKey = "") {
  return Math.max(0, Number(bundle.counts?.[sourceFamilyKey] || 0));
}

function scoringBundleIsInternallyFeasible(profile = {}, bundle = {}) {
  const objective40 = scoreCount(bundle, "objective_40");
  const objective50 = scoreCount(bundle, "objective_50");
  const terrainOwn = scoreCount(bundle, "scenario_terrain_own");
  const terrainOpponent = scoreCount(bundle, "scenario_terrain_opponent");
  const counts = profile.elementCounts || {};
  if (objective40 > Number(counts.objectives40 || 0) ||
      objective50 > Number(counts.objectives50 || 0) ||
      terrainOwn + terrainOpponent > Number(counts.scenarioTerrain || 0)) return false;
  if (scoreCount(bundle, "both_40mm_bonus") > 0 && objective40 < 2) return false;
  if (scoreCount(bundle, "both_50mm_bonus") > 0 && objective50 < 2) return false;
  const objectiveCount = objective40 + objective50;
  if (scoreCount(bundle, "secure_two_own_bonus") > 0 && objectiveCount < 2) return false;
  if (scoreCount(bundle, "secure_three_own_bonus") > 0 && objectiveCount < 3) return false;
  if (scoreCount(bundle, "third_progress_token_goal") > 0 && objective40 < 1) return false;
  if (scoreCount(bundle, "payload_delivery") > 0 && objective50 < 1) return false;
  if (scoreCount(bundle, "zero_countdown_50mm_bonus") > objective50) return false;
  if (scoreCount(bundle, "zero_countdown_terrain_bonus") >
      terrainOwn + terrainOpponent) return false;
  return true;
}

function scoringBundlePairIsFeasible(profile = {}, winnerBundle = {}, opponentBundle = {}) {
  if (!scoringBundleIsInternallyFeasible(profile, winnerBundle) ||
      !scoringBundleIsInternallyFeasible(profile, opponentBundle)) return false;
  const counts = profile.elementCounts || {};
  const totalFor = (sourceFamilyKey) => scoreCount(winnerBundle, sourceFamilyKey) +
    scoreCount(opponentBundle, sourceFamilyKey);
  if (totalFor("objective_40") > Number(counts.objectives40 || 0) ||
      totalFor("objective_50") > Number(counts.objectives50 || 0)) return false;
  const terrainTotal = totalFor("scenario_terrain_own") +
    totalFor("scenario_terrain_opponent");
  if (terrainTotal > Number(counts.scenarioTerrain || 0)) return false;
  // The candidate winner is the opponent of the ending side. Only that side can
  // receive the ending side's Kill Box penalty in this terminal family.
  if (scoreCount(opponentBundle, "kill_box_penalty") > 0) return false;
  // Wolves awards no three-token bonus when both sides reach three together.
  if (totalFor("third_progress_token_goal") > 1) return false;
  return true;
}

function netScoringGainClasses(profile = {}) {
  const families = scoringSourceFamilies(profile);
  const bundles = scoringBundles(families).filter((bundle) =>
    scoringBundleIsInternallyFeasible(profile, bundle));
  const rows = [];
  for (const winnerBundle of bundles) {
    if (winnerBundle.total <= 0) continue;
    for (const opponentBundle of bundles) {
      if (!scoringBundlePairIsFeasible(profile, winnerBundle, opponentBundle)) continue;
      const netGain = winnerBundle.total - opponentBundle.total;
      if (netGain <= 0) continue;
      const primarySourceFamilyKey = [...winnerBundle.sourceFamilyKeys].sort()[0] || "";
      const identity = {
        netGain,
        winnerCounts: winnerBundle.counts,
        opponentCounts: opponentBundle.counts,
      };
      rows.push(stableGraphValue({
        gainClassKey: `net-score-gain-${stableGraphHash(identity, 24)}`,
        netGain,
        primarySourceFamilyKey,
        sourceFamilyKeys: winnerBundle.sourceFamilyKeys,
        memberCount: 1,
        memberBundleHash: stableGraphHash(identity),
        representativeWinnerGain: winnerBundle.total,
        representativeOpponentGain: opponentBundle.total,
        representativeWinnerBundleKey: winnerBundle.bundleKey,
        representativeOpponentBundleKey: opponentBundle.bundleKey,
        representativeWinnerCounts: winnerBundle.counts,
        representativeOpponentCounts: opponentBundle.counts,
        representativeWinnerSourceFamilyKeys: winnerBundle.sourceFamilyKeys,
        representativeOpponentSourceFamilyKeys: opponentBundle.sourceFamilyKeys,
        exactBundlePair: true,
        abstractFeasibility: "necessary_source_capacity_constraints_only",
      }));
    }
  }
  return rows.sort((left, right) => left.netGain - right.netGain ||
    left.gainClassKey.localeCompare(right.gainClassKey));
}

function terminalPartitions(terminalClassKey, additionalPartitions = {}) {
  const keys = terminalClassKey === "lead_three_after_opponent_turn_scoring" ||
      terminalClassKey === "fixed_round_limit_result"
    ? ["lifecycle", "damage", "resource", "leaderControl", "baseTopology", "scenarioControl"]
    : ["lifecycle", "damage", "resource", "actionRange", "leaderControl", "lineOfSight", "baseTopology"];
  return stableGraphValue({
    ...Object.fromEntries(keys.map((key) => [key, FACTORIZED_PARTITIONS[key]])),
    ...additionalPartitions,
  });
}

function scenarioStatePartitions(scenarioKey = "") {
  const partitions = WARMACHINE_STEAMROLLER_SCENARIO_STATE_PARTITIONS_V1[scenarioKey];
  if (!partitions) throw new Error(`terminal_scenario_state_partitions_missing:${scenarioKey}`);
  return partitions;
}

function cellWithIdentity(rawCell, dependencyReceipt) {
  const { additionalPartitions = {}, ...cellCore } = rawCell;
  const partitions = terminalPartitions(cellCore.terminalClassKey, {
    ...scenarioStatePartitions(cellCore.scenarioKey),
    ...additionalPartitions,
  });
  const subcellDenominator = bigintProduct(Object.values(partitions).map((values) => values.length));
  const identity = stableGraphValue({
    schemaVersion: WARMACHINE_STEAMROLLER_TERMINAL_SCENARIO_CELL_V1_SCHEMA,
    ...cellCore,
    partitions,
  });
  const cellKey = `steamroller-terminal-cell-${stableGraphHash(identity, 32)}`;
  return stableGraphValue({
    ...identity,
    cellKey,
    dependencyReceipt,
    certificationScopeHash: stableGraphHash({ identity, dependencyReceipt }),
    subcellDenominator: String(subcellDenominator),
    disposition: "budget_deferred",
    strictMaterializedSubcellCount: "0",
    strictRejectedSubcellCount: "0",
    budgetDeferredSubcellCount: String(subcellDenominator),
    strictCertified: false,
    trainingTruth: false,
    reachabilityProven: false,
  });
}

function buildAssassinationCells(profile, dependencyReceipt) {
  const cells = [];
  for (const attackerSideKey of SIDE_KEYS) {
    const defenderSideKey = oppositeSide(attackerSideKey);
    for (const winnerSideKey of SIDE_KEYS) {
      const loserSideKey = oppositeSide(winnerSideKey);
      for (const cause of [
        { causalActionFamily: "active_attack_or_effect", endingSideKey: winnerSideKey },
        { causalActionFamily: "opponent_turn_reactive_or_continuous_effect", endingSideKey: loserSideKey },
      ]) {
        for (const roundClass of roundClasses(profile, "unique_leader_assassination", {
          attackerSideKey,
          defenderSideKey,
          endingSideKey: cause.endingSideKey,
        })) {
          cells.push(cellWithIdentity({
            scenarioKey: profile.scenarioKey,
            terminalClassKey: "unique_leader_assassination",
            resultKind: "win",
            attackerSideKey,
            defenderSideKey,
            winnerSideKey,
            loserSideKey,
            endingSideKey: cause.endingSideKey,
            causalActionFamily: cause.causalActionFamily,
            roundClass,
            sourceResolutionStatus: "officially_confirmed",
            terminalRequirement:
              "winner_is_only_side_with_any_leader_model_remaining_in_play",
          }, dependencyReceipt));
        }
      }
    }
  }
  return cells;
}

function tiebreakOutcomeClasses() {
  return [
    ...SIDE_KEYS.map((winnerSideKey) => ({
      resultKind: "win",
      winnerSideKey,
      loserSideKey: oppositeSide(winnerSideKey),
      tiebreakClassKey: "victory_point_advantage",
      sourceResolutionStatus: "officially_confirmed",
    })),
    ...SIDE_KEYS.map((winnerSideKey) => ({
      resultKind: "win",
      winnerSideKey,
      loserSideKey: oppositeSide(winnerSideKey),
      tiebreakClassKey: "victory_points_tied_scenario_presence_advantage",
      sourceResolutionStatus: "officially_confirmed",
    })),
    {
      resultKind: "tie",
      winnerSideKey: null,
      loserSideKey: null,
      tiebreakClassKey: "victory_points_and_scenario_presence_tied",
      sourceResolutionStatus: "official_second_tiebreak_still_tied_result_unresolved",
    },
  ];
}

function buildSimultaneousLeaderCells(profile, dependencyReceipt) {
  const cells = [];
  for (const attackerSideKey of SIDE_KEYS) {
    const defenderSideKey = oppositeSide(attackerSideKey);
    for (const endingSideKey of SIDE_KEYS) {
      for (const outcome of tiebreakOutcomeClasses()) {
        for (const roundClass of roundClasses(profile, "simultaneous_leader_tiebreak", {
          attackerSideKey,
          defenderSideKey,
          endingSideKey,
        })) {
          cells.push(cellWithIdentity({
            scenarioKey: profile.scenarioKey,
            terminalClassKey: "simultaneous_leader_tiebreak",
            ...outcome,
            attackerSideKey,
            defenderSideKey,
            endingSideKey,
            causalActionFamily: "single_simultaneous_resolution_window",
            roundClass,
            terminalRequirement:
              "all_leader_models_simultaneously_destroyed_then_vp_and_scenario_presence_tiebreak",
          }, dependencyReceipt));
        }
      }
    }
  }
  return cells;
}

function scoreTransitionDomain(profile = {}) {
  const gainClasses = netScoringGainClasses(profile);
  const rows = [];
  for (const gainClass of gainClasses) {
    const minimumPreLead = 3 - gainClass.netGain;
    for (let preLead = minimumPreLead; preLead <= 2; preLead += 1) {
      rows.push(stableGraphValue({
        scoreTransitionKey: `score-transition-${stableGraphHash({
          gainClassKey: gainClass.gainClassKey,
          leadBeforeClass: "exact_below_three",
          preLead,
        }, 24)}`,
        scoringGainClass: gainClass,
        leadBeforeClass: "exact_below_three",
        exactLeadBefore: true,
        leadBefore: preLead,
        leadAfter: preLead + gainClass.netGain,
      }));
    }
    rows.push(stableGraphValue({
      scoreTransitionKey: `score-transition-${stableGraphHash({
        gainClassKey: gainClass.gainClassKey,
        leadBeforeClass: "already_at_least_three",
      }, 24)}`,
      scoringGainClass: gainClass,
      leadBeforeClass: "already_at_least_three",
      exactLeadBefore: false,
      representativeLeadBefore: 3,
      leadBefore: 3,
      leadAfter: 3 + gainClass.netGain,
    }));
  }
  rows.sort((left, right) => left.leadAfter - right.leadAfter ||
    left.scoreTransitionKey.localeCompare(right.scoreTransitionKey));
  return stableGraphValue({
    scoreTransitionDomainKey: `score-transition-domain-${stableGraphHash(rows, 24)}`,
    transitions: rows,
  });
}

function buildScenarioScoreCells(profile, dependencyReceipt, transitionDomain) {
  const cells = [];
  const scoreTransitionKeys = transitionDomain.transitions.map((row) => row.scoreTransitionKey);
  for (const attackerSideKey of SIDE_KEYS) {
    const defenderSideKey = oppositeSide(attackerSideKey);
    for (const winnerSideKey of SIDE_KEYS) {
      const loserSideKey = oppositeSide(winnerSideKey);
      const endingSideKey = loserSideKey;
      for (const roundClass of roundClasses(profile, "lead_three_after_opponent_turn_scoring", {
        attackerSideKey,
        defenderSideKey,
        endingSideKey,
      })) {
        cells.push(cellWithIdentity({
          scenarioKey: profile.scenarioKey,
          terminalClassKey: "lead_three_after_opponent_turn_scoring",
          resultKind: "win",
          attackerSideKey,
          defenderSideKey,
          winnerSideKey,
          loserSideKey,
          endingSideKey,
          causalActionFamily: "steamroller_turn_end_settlement",
          roundClass,
          sourceResolutionStatus: "officially_confirmed",
          scoreTransitionDomainKey: transitionDomain.scoreTransitionDomainKey,
          additionalPartitions: { scoreTransition: scoreTransitionKeys },
          terminalRequirement:
            "lead_at_least_three_after_scoring_on_opponents_turn",
        }, dependencyReceipt));
      }
    }
  }
  return cells;
}

function buildFixedRoundCells(profile, dependencyReceipt) {
  const cells = [];
  const roundClass = roundClasses(profile, "fixed_round_limit_result")[0];
  if (!roundClass) return cells;
  for (const attackerSideKey of SIDE_KEYS) {
    const defenderSideKey = oppositeSide(attackerSideKey);
    for (const outcome of tiebreakOutcomeClasses()) {
      cells.push(cellWithIdentity({
        scenarioKey: profile.scenarioKey,
        terminalClassKey: "fixed_round_limit_result",
        ...outcome,
        attackerSideKey,
        defenderSideKey,
        endingSideKey: defenderSideKey,
        causalActionFamily: "defender_fixed_round_turn_end_settlement",
        roundClass,
        sourceResolutionStatus: outcome.sourceResolutionStatus,
        terminalRequirement: outcome.resultKind === "tie"
          ? "fixed_game_length_then_vp_and_scenario_presence_equality_source_unresolved"
          : "fixed_game_length_then_official_vp_and_scenario_presence_tiebreak",
      }, dependencyReceipt));
    }
  }
  return cells;
}

function applyDisposition(cell, disposition = {}) {
  const denominator = BigInt(cell.subcellDenominator);
  const materialized = BigInt(disposition.strictMaterializedSubcellCount || 0);
  const rejected = BigInt(disposition.strictRejectedSubcellCount || 0);
  const deferred = BigInt(disposition.budgetDeferredSubcellCount ??
    denominator - materialized - rejected);
  if (materialized < 0n || rejected < 0n || deferred < 0n ||
      materialized + rejected + deferred !== denominator) {
    throw new Error(`terminal_scenario_corpus_disposition_not_conserved:${cell.cellKey}`);
  }
  return stableGraphValue({
    ...cell,
    disposition: deferred > 0n
      ? "budget_deferred"
      : materialized > 0n
        ? "strict_materialized"
        : "strict_rejected",
    strictMaterializedSubcellCount: String(materialized),
    strictRejectedSubcellCount: String(rejected),
    budgetDeferredSubcellCount: String(deferred),
    strictCertified: materialized > 0n && deferred === 0n && rejected === 0n,
    trainingTruth: false,
    reachabilityProven: false,
  });
}

export function buildWarmachineSteamrollerTerminalScenarioCorpusV1(rawOptions = {}) {
  const profiles = [...(rawOptions.scenarioProfiles || steamroller2026ScenarioProfiles())]
    .map(stableGraphValue)
    .sort((left, right) => Number(left.scenarioNumber) - Number(right.scenarioNumber));
  if (profiles.length !== 7 || new Set(profiles.map((profile) => profile.scenarioKey)).size !== 7) {
    throw new Error(`terminal_scenario_corpus_requires_seven_unique_profiles:${profiles.length}`);
  }
  const rosterReceiptHash = String(rawOptions.rosterReceiptHash || "unbound_roster_domain");
  const dispositionsByCellKey = rawOptions.dispositionsByCellKey || {};
  const cells = [];
  const scenarioRows = [];
  for (const profile of profiles) {
    const dependencyReceipt = dependencyReceiptForProfile(profile, rawOptions);
    const transitionDomain = scoreTransitionDomain(profile);
    const scenarioCells = [
      ...buildAssassinationCells(profile, dependencyReceipt),
      ...buildSimultaneousLeaderCells(profile, dependencyReceipt),
      ...buildScenarioScoreCells(profile, dependencyReceipt, transitionDomain),
      ...buildFixedRoundCells(profile, dependencyReceipt),
    ].map((cell) => applyDisposition(cell, dispositionsByCellKey[cell.cellKey]));
    cells.push(...scenarioCells);
    scenarioRows.push(stableGraphValue({
      scenarioKey: profile.scenarioKey,
      scenarioNumber: profile.scenarioNumber,
      name: profile.name,
      fixedRoundLimit: fixedRound(profile),
      scenarioSemanticHash: dependencyReceipt.scenarioSemanticHash,
      scoringSourceFamilies: scoringSourceFamilies(profile),
      scenarioStatePartitions: scenarioStatePartitions(profile.scenarioKey),
      scoreTransitionDomain: transitionDomain,
      cellCount: scenarioCells.length,
      subcellDenominator: String(bigintSum(scenarioCells.map((cell) =>
        cell.subcellDenominator))),
    }));
  }
  cells.sort((left, right) => left.cellKey.localeCompare(right.cellKey));
  const proposed = bigintSum(cells.map((cell) => cell.subcellDenominator));
  const materialized = bigintSum(cells.map((cell) => cell.strictMaterializedSubcellCount));
  const rejected = bigintSum(cells.map((cell) => cell.strictRejectedSubcellCount));
  const deferred = bigintSum(cells.map((cell) => cell.budgetDeferredSubcellCount));
  const relevantSourceHashes = stableGraphValue({
    [RULES_ENGINE_SOURCE]: String(
      (rawOptions.hostSourceHashes || warmachineHost.receipt.sourceHashes || {})[
        RULES_ENGINE_SOURCE
      ] || "",
    ),
    [PROFILE_REGISTRY_SOURCE]: String(
      (rawOptions.hostSourceHashes || warmachineHost.receipt.sourceHashes || {})[
        PROFILE_REGISTRY_SOURCE
      ] || "",
    ),
  });
  const core = {
    schemaVersion: WARMACHINE_STEAMROLLER_TERMINAL_SCENARIO_CORPUS_V1_SCHEMA,
    packetKey: "steamroller-2026",
    packetYear: 2026,
    rosterReceiptHash,
    hostReceiptHash: String(rawOptions.hostReceiptHash || warmachineHost.receipt.receiptHash),
    relevantSourceHashes,
    officialSourceReference: OFFICIAL_SOURCE_REFERENCE,
    terminalClassKeys: WARMACHINE_STEAMROLLER_TERMINAL_CLASS_KEYS_V1,
    factorizedPartitionDomains: FACTORIZED_PARTITIONS,
    scenarios: scenarioRows,
    cells,
    counts: {
      scenarioCount: scenarioRows.length,
      cellCount: cells.length,
      terminalClassCounts: Object.fromEntries(WARMACHINE_STEAMROLLER_TERMINAL_CLASS_KEYS_V1
        .map((key) => [key, cells.filter((cell) => cell.terminalClassKey === key).length])),
      symbolicUnboundedTailCellCount: cells.filter((cell) =>
        cell.roundClass.equivalenceStatus === "symbolic_unbounded_tail_unproven").length,
      sourceUnresolvedCellCount: cells.filter((cell) =>
        cell.sourceResolutionStatus !== "officially_confirmed").length,
      proposedSubcellCount: String(proposed),
      strictMaterializedSubcellCount: String(materialized),
      strictRejectedSubcellCount: String(rejected),
      budgetDeferredSubcellCount: String(deferred),
    },
    coverage: {
      denominatorComplete: proposed === materialized + rejected + deferred,
      exactRawRoundCoverage: cells.every((cell) => cell.roundClass.exactRoundNumber),
      unboundedRawRoundTailExplicit: cells.some((cell) =>
        cell.roundClass.equivalenceStatus === "symbolic_unbounded_tail_unproven"),
      allUnmaterializedDebtExplicit: deferred === proposed - materialized - rejected,
    },
    claimBoundary: "This finite corpus enumerates terminal-equivalence families and a deterministic lazy subcell denominator. A family or subcell is not reachable, strict-certified, strategically good, or training truth until exact geometry materialization, reverse search and independent rules-v1 strict replay succeed. Two Fronts' unbounded later rounds remain one explicit unresolved symbolic tail rather than a false exact-equivalence claim. The official packet defines fixed game length plus VP and Scenario Presence tiebreakers, so decisive fixed-round outcomes are source-confirmed; equality after Scenario Presence remains source-unresolved.",
  };
  return stableGraphValue({
    ...core,
    corpusHash: stableGraphHash(core),
  });
}

export function warmachineSteamrollerTerminalScenarioSubcellKeyV1(
  cell = {},
  rawCoordinates = {},
) {
  const coordinates = {};
  for (const [dimensionKey, values] of Object.entries(cell.partitions || {})) {
    const value = String(rawCoordinates[dimensionKey] || "");
    if (!values.includes(value)) {
      throw new Error(`terminal_scenario_subcell_coordinate_invalid:${dimensionKey}:${value}`);
    }
    coordinates[dimensionKey] = value;
  }
  const unexpected = Object.keys(rawCoordinates).filter((key) => !(key in (cell.partitions || {})));
  if (unexpected.length) {
    throw new Error(`terminal_scenario_subcell_coordinate_unknown:${unexpected.sort().join(",")}`);
  }
  return `steamroller-terminal-subcell-${stableGraphHash({
    cellKey: cell.cellKey,
    coordinates: stableGraphValue(coordinates),
  }, 32)}`;
}

export function auditWarmachineSteamrollerTerminalScenarioCorpusDriftV1(
  corpus = {},
  rawOptions = {},
) {
  const profiles = rawOptions.scenarioProfiles || steamroller2026ScenarioProfiles();
  const profilesByKey = new Map(profiles.map((profile) => [profile.scenarioKey, profile]));
  const sourceHashes = rawOptions.hostSourceHashes || warmachineHost.receipt.sourceHashes || {};
  const rulesEngineHash = String(sourceHashes[RULES_ENGINE_SOURCE] || "");
  const scenarioRegistryHash = String(sourceHashes[PROFILE_REGISTRY_SOURCE] || "");
  const staleCells = [];
  for (const cell of corpus.cells || []) {
    const reasons = [];
    const profile = profilesByKey.get(cell.scenarioKey);
    if (!profile) reasons.push("scenario_profile_removed");
    else if (stableGraphHash(profile) !== cell.dependencyReceipt?.scenarioSemanticHash) {
      reasons.push("scenario_semantics_changed");
    }
    if (rulesEngineHash !== cell.dependencyReceipt?.rulesEngineHash) {
      reasons.push("rules_engine_changed");
    }
    if (scenarioRegistryHash !== cell.dependencyReceipt?.scenarioRegistryHash) {
      reasons.push("scenario_registry_changed");
    }
    if (reasons.length) staleCells.push(stableGraphValue({
      cellKey: cell.cellKey,
      scenarioKey: cell.scenarioKey,
      reasons: sortedUnique(reasons),
    }));
  }
  return stableGraphValue({
    schemaVersion: "warmachine_steamroller_terminal_scenario_corpus_drift_audit_v1",
    corpusHash: String(corpus.corpusHash || ""),
    checkedCellCount: (corpus.cells || []).length,
    staleCellCount: staleCells.length,
    currentCellCount: (corpus.cells || []).length - staleCells.length,
    staleScenarioKeys: sortedUnique(staleCells.map((row) => row.scenarioKey)),
    staleCells,
    resumeAllowed: staleCells.length === 0,
    priorProofsCurrent: staleCells.length === 0,
  });
}
