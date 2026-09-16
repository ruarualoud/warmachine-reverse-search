import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_REAL_MATCH_ONE_SIDE_CORPUS_V1_SCHEMA =
  "warmachine_real_match_one_side_corpus_v1";

const COMMON_UNKNOWN_GEOMETRY = Object.freeze([
  "exact_piece_coordinates",
  "base_sweep_paths",
  "exact_facing",
  "measured_range_boundaries",
  "complete_line_of_sight_rays",
]);

function rosterEntry(name, count = 1, loadout = "") {
  return { name, count, loadout };
}

function turnSlice(raw) {
  return {
    sliceKey: raw.sliceKey,
    matchKey: raw.matchKey,
    selectedFaction: "Dusk",
    selectedArmy: "Fane of Nyrro",
    selectedLeader: "Hysene, the Executioner",
    selectedSideOnly: true,
    round: raw.round,
    phaseBoundary: "selected_side_turn_start_to_selected_side_turn_end",
    sourceWindowSeconds: {
      start: raw.start,
      end: raw.end,
    },
    scoreObservation: raw.scoreObservation,
    selectedSideStateConstraints: {
      lifecycle: raw.lifecycle || [],
      resourcesAndEffects: raw.resourcesAndEffects || [],
      spatialAndScenarioRelations: raw.spatialAndScenarioRelations || [],
      damageAndSystems: raw.damageAndSystems || [],
    },
    observedPlan: raw.observedPlan,
    observedActionSequence: raw.observedActionSequence,
    observedOutcome: raw.observedOutcome,
    sourceRuleAnomalies: raw.sourceRuleAnomalies || [],
    uncertainty: {
      exactGeometryKnown: false,
      unknownFields: [...COMMON_UNKNOWN_GEOMETRY, ...(raw.additionalUnknowns || [])],
      admissibleRepresentation: "constraint_set_not_point_estimate",
    },
    simulationUse: {
      isOneFactionSeed: true,
      stripRecordedOpponentStateBeforePairing: true,
      requireRuleLegalOpponentState: true,
      requireStrictGeometryMaterialization: true,
      preserveRecordedOpponentAsProvenanceOnly: true,
      directExactReplayReady: false,
      strategyValueReady: false,
      trainingTruth: false,
    },
  };
}

const matches = [{
  matchKey: "hysene-vs-oriax-50-closed-quarters-2026",
  title: "Fane of Nyrro (Hysene) vs. Sea Raiders (Oriax), 50pt",
  source: {
    kind: "public_video",
    videoId: "fCcgFwViCfE",
    url: "https://www.youtube.com/watch?v=fCcgFwViCfE",
    channel: "Advanced Maneuvers Gaming",
    uploadDate: "2026-07-10",
    durationSeconds: 2292,
  },
  format: { points: 50, rulesEra: "Warmachine MKIV, April 2026 recording" },
  scenario: {
    name: "Closed Quarters",
    packet: "Tales from the Frontlines",
    randomCondition: "Muddy Ground",
    currentStrictHostSupport: false,
  },
  recordedOpponent: {
    faction: "Orgoth",
    army: "Sea Raiders",
    leader: "Oriax, the Persuader",
    role: "source_provenance_only",
  },
  selectedRoster: {
    sourceExactness: "exact_list_reconstructed_and_force_builder_checked",
    entries: [
      rosterEntry("Hysene, the Executioner"),
      rosterEntry("Strygon", 1, "Muzzled / Claws / Blind Obedience"),
      rosterEntry("Sybaris"),
      rosterEntry("Vordak", 1, "Lamprey / Feral / Razor Fan"),
      rosterEntry("Strygon Rider", 2),
      rosterEntry("Fane Knights", 1),
    ],
  },
}, {
  matchKey: "hysene-vs-grymkin-100-fault-line-2026",
  title: "Fane of Nyrro (Hysene) vs. Grymkin (The Heretic), 100pt",
  source: {
    kind: "public_video",
    videoId: "mcZBQR7ZSHA",
    url: "https://www.youtube.com/watch?v=mcZBQR7ZSHA",
    channel: "Simon's Gaming Academy",
    uploadDate: "2026-07-09",
    durationSeconds: 2399,
  },
  format: { points: 100, rulesEra: "Steamroller 2026" },
  scenario: {
    name: "Fault Line",
    packet: "Steamroller 2026",
    randomCondition: "",
    currentStrictHostSupport: true,
  },
  recordedOpponent: {
    faction: "Grymkin",
    army: "Grymkin",
    leader: "The Heretic",
    role: "source_provenance_only",
  },
  selectedRoster: {
    sourceExactness: "exact_list_from_video_description",
    entries: [
      rosterEntry("Hysene, the Executioner"),
      rosterEntry("Strygon", 2, "Muzzled / Claws / Blind Obedience"),
      rosterEntry("Sybaris"),
      rosterEntry("Vordak", 2, "Lamprey / Feral / Bladed Armour"),
      rosterEntry("Lanyssa Ryssyl, Nyss Sorceress"),
      rosterEntry("Benkei & Sasha"),
      rosterEntry("Strygon Rider", 2),
      rosterEntry("Fane Knights", 1, "Sythyss Prophet attachment"),
      rosterEntry("Fane Knights", 1),
      rosterEntry("The Last Watch"),
    ],
  },
}];

const turnSlices = [
  turnSlice({
    sliceKey: "oriax-match-nyrro-turn-1",
    matchKey: "hysene-vs-oriax-50-closed-quarters-2026",
    round: 1,
    start: 160,
    end: 312,
    scoreObservation: { before: "0:0", after: "0:0", confidence: "high" },
    lifecycle: ["full_selected_roster_observed_in_play"],
    resourcesAndEffects: ["Storm Rager placed on a forward Strygon Rider", "Dash cast before later warrior activations"],
    spatialAndScenarioRelations: ["Muzzled Strygon retained as a Shield Guard and Shadow Shift anchor", "Fane Knights retained as additional Shadow Shift anchors"],
    observedPlan: "Use early Dash to accelerate warriors while presenting a controlled forward lure and retaining Hysene escape anchors.",
    observedActionSequence: ["Hysene activates early", "cast Storm Rager", "cast Dash", "warriors and battlegroup advance or run"],
    observedOutcome: "Orgoth later declines the offered engagement and measures outside the immediate Nyrro threat.",
    additionalUnknowns: ["which_models_ran_full_distance", "exact_vordak_shooting_alternatives"],
  }),
  turnSlice({
    sliceKey: "oriax-match-nyrro-turn-2",
    matchKey: "hysene-vs-oriax-50-closed-quarters-2026",
    round: 2,
    start: 549,
    end: 906,
    scoreObservation: { before: "0:0", after: "not_yet_scored_on_selected_turn", confidence: "high" },
    lifecycle: ["video_player_removes_illegal_extra_Sythyss_Prophet_attachment"],
    resourcesAndEffects: ["Storm Rager upkeep maintained", "Hysene reported retaining 2 Fury"],
    spatialAndScenarioRelations: ["Hysene enters central 40/50mm area", "at_least_one_Shadow_Shift_anchor_retained", "Vordak outside described charge threat but potentially inside shooting threat"],
    observedPlan: "Accept bounded central risk to induce an Orgoth commitment while preserving transfers, Shield Guard and Shadow Shift exits.",
    observedActionSequence: ["maintain Storm Rager", "remove illegal attachment", "advance Hysene and support formation"],
    observedOutcome: "Orgoth forms a defensive anti-assassination position; the later opponent turn ends at a narrated 1:1.",
    sourceRuleAnomalies: ["illegal_roster_attachment_was_present_then_corrected"],
    additionalUnknowns: ["exact_shield_guard_three_inch_coverage", "exact_transfer_target_health"],
  }),
  turnSlice({
    sliceKey: "oriax-match-nyrro-turn-3",
    matchKey: "hysene-vs-oriax-50-closed-quarters-2026",
    round: 3,
    start: 1215,
    end: 1759,
    scoreObservation: { before: "1:1", after: "video_not_exactly_recoverable", confidence: "medium" },
    lifecycle: ["Sybaris destroys one solo", "warbeast melee kills generate Feast Hunger"],
    resourcesAndEffects: ["Hysene feat used", "free Gallows generated", "Gallows hit roll boosted", "Brutal Strike declined to preserve resource and safety budget"],
    spatialAndScenarioRelations: ["Snatch and Drag used to alter an enemy position", "central attack lane opened before Hysene spell attempt"],
    observedPlan: "Clear lanes, generate Hunger, then use feat-enabled Gallows to expose an assassination path without exhausting the Shadow Shift budget.",
    observedActionSequence: ["Sybaris kill and Snatch and Drag", "Vordak charge", "warbeast clearing attacks", "Hysene feat", "boosted Gallows attempt"],
    observedOutcome: "The pull attempt does not create the required assassination result; safety resources are retained.",
    additionalUnknowns: ["exact_hunger_totals_by_piece", "exact_enemy_post_drag_coordinates"],
  }),
  turnSlice({
    sliceKey: "oriax-match-nyrro-turn-4",
    matchKey: "hysene-vs-oriax-50-closed-quarters-2026",
    round: 4,
    start: 2155,
    end: 2282,
    scoreObservation: { before: "video_not_exactly_recoverable", after: "assassination_terminal", confidence: "high_for_terminal_only" },
    lifecycle: ["Oriax destroyed by Hysene melee attacks"],
    resourcesAndEffects: ["Storm Rager placed on Hysene", "extra attacks bought with Fury", "invalid unconditional Hunger purchase proposal reversed"],
    spatialAndScenarioRelations: ["Hysene has a legal charge lane to Oriax after preceding attempts"],
    observedPlan: "Convert the now-open lane into a direct leader assassination.",
    observedActionSequence: ["attempt Critical Freeze", "cast Storm Rager on Hysene", "charge Oriax", "buy additional melee attacks with Fury"],
    observedOutcome: "Leader destruction ends the game immediately.",
    sourceRuleAnomalies: ["player_initially_proposed_unconditional_Murderous_Impulse_attacks_then_corrected_to_Fury"],
    additionalUnknowns: ["exact_precharge_fury_and_hunger_ledger", "exact_charge_path"],
  }),
  turnSlice({
    sliceKey: "grymkin-match-nyrro-turn-1",
    matchKey: "hysene-vs-grymkin-100-fault-line-2026",
    round: 1,
    start: 220,
    end: 386,
    scoreObservation: { before: "0:0", after: "0:0", confidence: "high" },
    lifecycle: ["full_selected_roster_observed_in_play"],
    spatialAndScenarioRelations: ["one Fane Knights unit assigned to the source bottom objectives", "Sybaris and one Fane Knights unit assigned to the Bloody Parliament flank", "Lanyssa group and The Last Watch assigned to the opposite flank", "remaining battlegroup assigned to center"],
    observedPlan: "Exploit the opponent's Prey assignment, split scenario duties across both flanks, and reserve Hysene plus the battlegroup to trade into enemy heavies.",
    observedActionSequence: ["run prey-marked Fane Knights toward center", "send the other Fane Knights unit to objectives", "establish left, right and center task groups"],
    observedOutcome: "The source presents a deliberate three-lane opening formation rather than a single central advance.",
    additionalUnknowns: ["exact_deployment_coordinates", "exact_run_endpoints", "complete_activation_order"],
  }),
  turnSlice({
    sliceKey: "grymkin-match-nyrro-turn-2",
    matchKey: "hysene-vs-grymkin-100-fault-line-2026",
    round: 2,
    start: 586,
    end: 827,
    scoreObservation: { before: "0:0", after: "4:1", confidence: "high" },
    lifecycle: ["one contesting Dread Rot destroyed and eaten by a Strygon", "selected_side_losses_not_narrated_before_turn"],
    resourcesAndEffects: ["attacking Strygon ends described exchange on 3 Fury and gains 1 Hunger", "attached Sythyss Prophet grants Ashen Veil to Fane Knights"],
    spatialAndScenarioRelations: ["Benkei contests the upper 40mm element", "three Fane Knights within 3 inches of selected-side 50mm element", "Sybaris behind a building and outside one Cage Rager threat", "Sybaris retains a future central drag route"],
    observedPlan: "Remove the minimum contesting model, take a large scenario lead, and keep Sybaris protected while threatening a later drag.",
    observedActionSequence: ["Strygon attacks contesting Dread Rot twice", "assign Benkei to contest", "place Fane Knights for scenario", "advance Sybaris behind building"],
    observedOutcome: "Nyrro reaches a narrated 4:1 lead; the player later identifies Benkei placement as inferior to using Sasha.",
    sourceRuleAnomalies: ["source_player_identifies_Benkei_as_the_wrong_scenario_piece"],
    additionalUnknowns: ["which_Strygon_copy_attacked", "exact_Ashen_Veil_coverage", "exact_Sybaris_LOS_polygon"],
  }),
  turnSlice({
    sliceKey: "grymkin-match-nyrro-turn-3",
    matchKey: "hysene-vs-grymkin-100-fault-line-2026",
    round: 3,
    start: 1287,
    end: 1710,
    scoreObservation: { before: "4:1", after: "source_describes_contested_multi_objective_position", confidence: "medium" },
    lifecycle: ["Benkei already destroyed", "at_least_two_Fane_Knight_models_destroyed", "one forward Nyrro flying model destroyed", "Sasha destroys Isiah", "one Dread Rot destroyed by The Last Watch", "Hysene and battlegroup destroy at least one Cage Rager"],
    resourcesAndEffects: ["Bitter Reprisal or Vengeance movement resolves for The Last Watch", "Storm Rager remains on one Strygon Rider", "Hysene feat used", "enemy corpse negates one spell", "Murderous Impulse used after qualifying kills", "Careful Reconnaissance moves Hysene back 3 inches", "Sythyss Prophet revives one Fane Knight"],
    spatialAndScenarioRelations: ["The Last Watch charges to contest the rear 40mm element", "Lanyssa remains outside the narrated enemy leader threat or LOS", "Sasha repositions away after the kill", "revived Fane Knight provides a Shadow Shift destination within 4 inches of Hysene"],
    observedPlan: "Remove at least two enemy heavies, contest both threatened scenario lanes, and preserve Hysene escape destinations after the central commitment.",
    observedActionSequence: ["reactive movement", "The Last Watch charge", "Sasha kill and reposition", "Strygon attacks", "Hysene charge and feat", "Sybaris Feast attacks", "Strygon Rider and Vordak attacks", "revive defensive anchor"],
    observedOutcome: "One Cage Rager is finished, another survives heavily damaged; the source player later judges Skin and Moans as the better priority.",
    sourceRuleAnomalies: ["source_player_identifies_target_priority_error"],
    additionalUnknowns: ["identity_of_destroyed_forward_flying_model", "exact_damage_remaining_on_each_heavy", "exact_Hunger_ledger"],
  }),
  turnSlice({
    sliceKey: "grymkin-match-nyrro-turn-4",
    matchKey: "hysene-vs-grymkin-100-fault-line-2026",
    round: 4,
    start: 2030,
    end: 2152,
    scoreObservation: { before: "not_exactly_recoverable", after: "later_reported_6:6_before_death_clock_end", confidence: "medium" },
    lifecycle: ["one Strygon Rider already destroyed", "Hysene begins on 4 remaining damage boxes", "Sythyss Prophet begins on 1 remaining damage box", "Sybaris frenzies", "one Cage Rager destroyed during the turn"],
    resourcesAndEffects: ["Hysene has no transfer target at the prior damage event", "Hysene previously Shadow Shifted to a Strygon", "Hysene casts Storm Rager on herself", "Hysene ends described activation camping 1"],
    damageAndSystems: ["recorded Grymkin Cage Rager had its mind system disabled before an illegal trample", "central Cage Rager begins this turn on approximately 4 boxes"],
    spatialAndScenarioRelations: ["Cage Rager engages Hysene at turn start", "Fane Knight and Sythyss Prophet can charge the damaged Cage Rager", "clearing that Cage Rager opens a possible route toward The Heretic"],
    observedPlan: "Free Hysene from the engaging Cage Rager, then choose between the exposed assassination route and a safer heavy removal.",
    observedActionSequence: ["resolve Sybaris frenzy", "charge damaged Cage Rager with support models", "Strygon Rider disengages and kills it", "cast Storm Rager on Hysene", "Hysene charges and removes another Cage Rager"],
    observedOutcome: "The player declines a plausible leader assassination; the recorded game later ends on the opponent's death clock at a reported 6:6.",
    sourceRuleAnomalies: ["recorded_opponent_trampled_with_disabled_mind_system", "recorded_prior_engaged_run_called_legal_by_players", "source_player_identifies_wrong_Shadow_Shift_destination", "source_player_identifies_declined_assassination"],
    additionalUnknowns: ["legal_reconstruction_after_recorded_illegal_actions", "exact_assassination_lane", "exact_remaining_transfer_capacity"],
  }),
];

function validateCorpus(matchesByKey, slices) {
  const issues = [];
  const sliceKeys = new Set();
  for (const slice of slices) {
    if (sliceKeys.has(slice.sliceKey)) issues.push(`duplicate_slice_key:${slice.sliceKey}`);
    sliceKeys.add(slice.sliceKey);
    if (!matchesByKey.has(slice.matchKey)) issues.push(`unknown_match:${slice.sliceKey}`);
    if (!(slice.sourceWindowSeconds.end > slice.sourceWindowSeconds.start)) {
      issues.push(`invalid_source_window:${slice.sliceKey}`);
    }
    if (slice.selectedSideOnly !== true ||
        slice.simulationUse.stripRecordedOpponentStateBeforePairing !== true) {
      issues.push(`not_one_side_only:${slice.sliceKey}`);
    }
    if (slice.uncertainty.exactGeometryKnown !== false ||
        slice.uncertainty.admissibleRepresentation !== "constraint_set_not_point_estimate") {
      issues.push(`geometry_uncertainty_not_preserved:${slice.sliceKey}`);
    }
    if (slice.simulationUse.trainingTruth !== false ||
        slice.simulationUse.strategyValueReady !== false) {
      issues.push(`premature_truth_promotion:${slice.sliceKey}`);
    }
  }
  for (const matchKey of matchesByKey.keys()) {
    const rounds = slices.filter((slice) => slice.matchKey === matchKey)
      .map((slice) => slice.round);
    if (rounds.length !== 4 || new Set(rounds).size !== 4) {
      issues.push(`expected_four_distinct_selected_turns:${matchKey}`);
    }
  }
  return issues;
}

export function buildWarmachineRealMatchOneSideCorpusV1() {
  const matchesByKey = new Map(matches.map((match) => [match.matchKey, match]));
  const issues = validateCorpus(matchesByKey, turnSlices);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_REAL_MATCH_ONE_SIDE_CORPUS_V1_SCHEMA,
    corpusKey: "two-public-matches-selected-faction-turn-slices-v1",
    selectedFaction: "Dusk",
    selectedArmy: "Fane of Nyrro",
    observationContract: {
      extractionUnit: "one_selected_faction_complete_turn",
      selectedFactionStateIndependentOfRecordedOpponent: true,
      recordedOpponentRetainedAsProvenanceOnly: true,
      unknownGeometryRepresentation: "constraint_sets",
      opponentPairing: "separate_rule_legal_materialization_stage",
      strictReplayPolicy: "reject_or_reconstruct_recorded_illegal_actions",
    },
    matches,
    turnSlices,
    counts: {
      matchCount: matches.length,
      turnSliceCount: turnSlices.length,
      turnSlicesByMatch: Object.fromEntries(matches.map((match) => [
        match.matchKey,
        turnSlices.filter((slice) => slice.matchKey === match.matchKey).length,
      ])),
      sourceRuleAnomalyCount: turnSlices.reduce((total, slice) =>
        total + slice.sourceRuleAnomalies.length, 0),
      exactGeometrySliceCount: turnSlices.filter((slice) =>
        slice.uncertainty.exactGeometryKnown).length,
    },
    quality: {
      readyForOneSideConstraintMaterialization: issues.length === 0,
      readyForDirectExactReplay: false,
      readyForStrategyValue: false,
      readyForTrainingTruth: false,
      issues,
      blockers: [
        "strict_geometry_instances_not_yet_materialized",
        "rule_legal_opponent_states_not_yet_paired",
        "complete_turn_adversarial_search_not_yet_closed",
      ],
    },
    claimBoundary: "This corpus records eight one-faction turn observations from two public matches. It is a source for strict state-set materialization, not an exact replay, opponent model, win-rate sample or optimal-strategy claim.",
  });
  return {
    ...core,
    corpusHash: stableGraphHash(core),
  };
}
