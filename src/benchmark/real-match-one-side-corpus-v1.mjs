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
  const selectedSide = raw.selectedSide || matches.find((match) =>
    match.matchKey === raw.matchKey)?.selectedSide;
  if (!selectedSide) throw new Error(`missing_selected_side:${raw.matchKey}`);
  return {
    sliceKey: raw.sliceKey,
    matchKey: raw.matchKey,
    selectedFaction: selectedSide.faction,
    selectedArmy: selectedSide.army,
    selectedLeader: selectedSide.leader,
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
    videoGeometryEvidence: raw.videoGeometryEvidence || {
      status: "requires_frame_binding",
      frames: [],
      constraints: [],
      claimBoundary: "Spatial narration is not position evidence until it is bound to reviewed video frames.",
    },
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
  matchKey: "sepsira-vs-bohdan-100-wolves-at-our-heels-2026",
  title: "Cryx Necrofactorium (Sepsira) vs. Khador Old Umbrey (Bohdan), 100pt",
  source: {
    kind: "public_video",
    videoId: "HHUnwtN_m8M",
    url: "https://www.youtube.com/watch?v=HHUnwtN_m8M",
    channel: "Dual Attack - A Warmachine Channel",
    uploadDate: "2026-09-06",
    durationSeconds: 6864,
  },
  usableTurnCount: 3,
  selectedSide: {
    faction: "Cryx",
    army: "Necrofactorium",
    leader: "Master Necrosurgeon Sepsira",
  },
  format: { points: 100, rulesEra: "Steamroller 2026" },
  scenario: {
    name: "Wolves at Our Heels",
    packet: "Steamroller 2026",
    randomCondition: "",
    currentStrictHostSupport: true,
  },
  recordedOpponent: {
    faction: "Khador",
    army: "Old Umbrey",
    leader: "Bohdan Lesnoi",
    role: "source_provenance_only",
  },
  selectedRoster: {
    sourceExactness: "exact_list_from_video_description",
    targetMatchupDifference: "source_has_five_Swarm_Warden_pairs_not_the_target_six",
    entries: [
      rosterEntry("Master Necrosurgeon Sepsira"),
      rosterEntry("Hellraker", 1, "Heavy Venom Blaster / Void Plate Right / Void Plate Left"),
      rosterEntry("Raptor", 1, "Deathripper / Arc Node"),
      rosterEntry("Akulon Thaemestra"),
      rosterEntry("Silexus Xiphus"),
      rosterEntry("Skarlock Lieutenant", 2),
      rosterEntry("Mechanithrall Swarm", 5),
      rosterEntry("Mechanithrall Swarm Warden", 5),
      rosterEntry("Necrosurgeon Initiates", 2),
      rosterEntry("The Furies"),
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
  usableTurnCount: 4,
  selectedSide: {
    faction: "Dusk",
    army: "Fane of Nyrro",
    leader: "Hysene, the Executioner",
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

function cryxVideoFrame(timestampSeconds, sha256, role) {
  return {
    sourceVideoId: "HHUnwtN_m8M",
    timestampSeconds,
    sha256,
    role,
    extraction: "yt-dlp_720p_then_ffmpeg_single_frame_q2",
  };
}

function nyrroVideoFrame(timestampSeconds, sha256, role) {
  return {
    sourceVideoId: "mcZBQR7ZSHA",
    timestampSeconds,
    sha256,
    role,
    extraction: "yt-dlp_720p_then_ffmpeg_single_frame_q2",
  };
}

const turnSlices = [
  turnSlice({
    sliceKey: "bohdan-match-cryx-turn-1",
    matchKey: "sepsira-vs-bohdan-100-wolves-at-our-heels-2026",
    round: 1,
    start: 631,
    end: 1049,
    scoreObservation: { before: "0:0", after: "0:0", confidence: "high" },
    lifecycle: ["five_Swarm_Warden_pairs_visible", "Raptor_added_after_recorded_deployment_omission"],
    resourcesAndEffects: ["Power Up and Empower resolved", "Sepsira reached 7 Focus", "Death's Dominion cast", "Tenacity applied", "Sepsira ended camping 4"],
    spatialAndScenarioRelations: ["Cryx starts massed along the left deployment edge", "Khador has already advanced from the right", "Cryx advances into left-center as layered Swarm screens", "one narrated Swarm run stops at 9 inches rather than using full distance"],
    observedPlan: "Advance multiple screening layers while remaining outside narrated 11-inch and 13-inch enemy threat bands.",
    observedActionSequence: ["resolve control resources", "apply support effects", "run or advance Swarm layers", "cast Death's Dominion and Tenacity", "complete remaining runs"],
    observedOutcome: "Cryx forms a broad left-center screen without initiating combat.",
    sourceRuleAnomalies: ["source_player_added_Raptor_after_initial_deployment_omission"],
    videoGeometryEvidence: {
      status: "reviewed_constraint_evidence",
      coordinateConvention: "Cryx deployment edge is table left; Khador deployment edge is table right.",
      frames: [
        cryxVideoFrame(295, "eb0fd845b2c3e5ecdb1a330c6332f570fd56cd6aa81d630873e625d6f6370c91", "deployment_reference"),
        cryxVideoFrame(635, "101eb0615514f9b18f7493a6c82ffb7460f1a3d3acf0a2775ba755c69d18f0bc", "turn_start"),
        cryxVideoFrame(1045, "d65ca771bcb0ad2076c6d1d4af4a08a52193c59cf818a04ed310b6ce2093a6c4", "turn_end"),
      ],
      constraints: ["deployment frame exposes both full deployment fronts and terrain topology", "turn-start frame fixes the post-Khador-T1 board before Cryx movement", "turn-end frame shows Cryx spread from its left deployment band into multiple left-center layers", "exact model identities inside dense Swarm groups remain unresolved"],
      occlusions: ["hands and measuring sticks briefly obscure individual bases", "dense unit groups prevent reliable per-model coordinates"],
      claimBoundary: "Frames support regions, ordering and terrain relations only; strict materialization must choose legal exact coordinates and paths.",
    },
    additionalUnknowns: ["identity_of_each_model_inside_dense_Swarm_groups", "exact_9_inch_run_path", "individual_base_coordinates"],
  }),
  turnSlice({
    sliceKey: "bohdan-match-cryx-turn-2",
    matchKey: "sepsira-vs-bohdan-100-wolves-at-our-heels-2026",
    round: 2,
    start: 2122,
    end: 3384,
    scoreObservation: { before: "0:0", after: "2:0", confidence: "high" },
    lifecycle: ["knocked_down_models_stand", "three_Vengeance_moves_resolve", "several_enemy_models_destroyed"],
    resourcesAndEffects: ["Desperate Mission and Tenacity expire", "Power Up and Empower resolve", "Sepsira feat used", "Grave Touch and boosted Breath Stealer channeled through Raptor", "Raptor converts souls into additional attacks"],
    spatialAndScenarioRelations: ["Cryx and Khador fronts are intermingled around the central terrain line at turn start", "one Swarm runs to contest", "Hellraker occupies a lane intended to deny a 50mm placement", "Raptor and several Swarms attack through central and upper-left lanes"],
    observedPlan: "Score several elements while removing the forward Khador pieces and physically blocking a large-base placement lane.",
    observedActionSequence: ["stand and Vengeance", "run a contesting Swarm", "position and spray with Hellraker", "feat and channel spells", "Raptor charge and soul-funded attacks", "Swarm charges and Combo Strikes"],
    observedOutcome: "Cryx removes multiple forward models, retains central layers and reports a 2:0 score.",
    sourceRuleAnomalies: ["source_players_correct_attack_counts_and_activation_order_during_resolution"],
    videoGeometryEvidence: {
      status: "reviewed_constraint_evidence",
      coordinateConvention: "Cryx deployment edge is table left; Khador deployment edge is table right.",
      frames: [
        cryxVideoFrame(2125, "ae09230fea6f91e27fc8130c8ff644beec4d504ced50e8e2396f3a84e4e92773", "turn_start"),
        cryxVideoFrame(2820, "67496f69a64326d9465ccdd95b8b00afeb1fdef7802f1fe0c16e08aaa04a1a6a", "midturn_after_forward_commitments"),
        cryxVideoFrame(3375, "da095f40488271c24789518fb67a2f65da69ba4dbbdd25a27d7a5788ff7f2c2e", "turn_end_before_score_overlay_update"),
      ],
      constraints: ["turn-start frame fixes the post-Khador-T2 contact line", "midturn frame shows Cryx pieces occupying the left-center and central scenario band", "turn-end frame shows removals and surviving Cryx layers after the attack sequence", "the large central model and dense melee groups require identity confirmation from action narration"],
      occlusions: ["models overlap in the center", "hands obscure some intermediate placements"],
      claimBoundary: "The evidence constrains contact topology and occupied regions, not exact charge paths or base-to-base distances.",
    },
    additionalUnknowns: ["exact_Vengeance_start_positions", "exact_charge_paths", "per_attack_target_identity_in_dense_melees"],
  }),
  turnSlice({
    sliceKey: "bohdan-match-cryx-turn-3",
    matchKey: "sepsira-vs-bohdan-100-wolves-at-our-heels-2026",
    round: 3,
    start: 5275,
    end: 6420,
    scoreObservation: { before: "3:1", after: "5:1", confidence: "high" },
    lifecycle: ["models_stand_and_Vengeance_resolves", "one_recurred_model_cannot_attack", "additional_enemy_models_destroyed"],
    resourcesAndEffects: ["Sepsira pays upkeep and reaches 6 Focus", "Power Up and Empower resolve", "Grave Touch supports attacks", "Sepsira applies Tenacity and ends camping 6"],
    spatialAndScenarioRelations: ["surviving fronts begin intermingled in left-center", "Swarm charges branch into separate beast and bear targets", "Sepsira runs to a narrated position outside the 13-inch killbox boundary", "Cryx ends with distinct central and lower scenario clusters"],
    observedPlan: "Continue the favorable attrition while preserving Sepsira and converting the surviving Cryx layers into scenario control.",
    observedActionSequence: ["stand and Vengeance", "maintenance and recurrence", "Hellraker attacks", "multiple Swarm charges", "apply Grave Touch and defensive effects", "Sepsira runs", "score scenario"],
    observedOutcome: "Cryx reaches a video-overlay score of 5:1 while retaining several separated scenario groups.",
    sourceRuleAnomalies: ["source_players_correct_target_damage_allocation_and_attack_counts_during_resolution"],
    videoGeometryEvidence: {
      status: "reviewed_constraint_evidence",
      coordinateConvention: "Cryx deployment edge is table left; Khador deployment edge is table right.",
      frames: [
        cryxVideoFrame(5280, "2cbde7bc261893e721ae6d28036e141a26ae1b25f0e0a4af6c129630a6d51ffa", "turn_start_with_3_to_1_overlay"),
        cryxVideoFrame(5950, "07e5cfba5997f15fc523de85b576c0c0086ac169d83597cdc37a33a6e514a52c", "midturn_attrition_state"),
        cryxVideoFrame(6395, "fd74bf30c66d5d42415f739cf8deba8a109477199c3d71d153a4145cddff7079", "turn_end_board_before_score_update"),
        cryxVideoFrame(6420, "68739f67bdd4d6442c0bbe2d180474c622bd931492cb54727724c1665e0e085f", "postturn_5_to_1_score_receipt"),
      ],
      constraints: ["turn-start frame binds the 3:1 score and surviving contact topology", "midturn frame shows the central attrition cluster and rear scenario groups", "turn-end frames show two separated Cryx occupancy clusters and the 5:1 score update", "the camera does not justify exact inches between individual models"],
      occlusions: ["hands obscure a small number of end-of-turn bases", "dense central bases remain partially overlapping in projection"],
      claimBoundary: "Frames prove broad state transition and score-linked occupancy; exact legal coordinates remain a strict-search variable.",
    },
    additionalUnknowns: ["identity_of_each_recurred_model", "exact_killbox_boundary_measurement", "exact_remaining_damage_by_model"],
  }),
  turnSlice({
    sliceKey: "grymkin-match-nyrro-turn-1",
    matchKey: "hysene-vs-grymkin-100-fault-line-2026",
    round: 1,
    start: 220,
    end: 470,
    scoreObservation: { before: "0:0", after: "0:0", confidence: "high" },
    lifecycle: ["full_selected_roster_observed_in_play"],
    spatialAndScenarioRelations: ["Nyrro deploys from the table right and Grymkin from the table left", "one Fane Knights unit assigned to the source bottom objectives", "Sybaris and one Fane Knights unit assigned to the Bloody Parliament flank", "Lanyssa group and The Last Watch assigned to the opposite flank", "remaining battlegroup assigned to center"],
    observedPlan: "Exploit the opponent's Prey assignment, split scenario duties across both flanks, and reserve Hysene plus the battlegroup to trade into enemy heavies.",
    observedActionSequence: ["run prey-marked Fane Knights toward center", "send the other Fane Knights unit to objectives", "establish left, right and center task groups"],
    observedOutcome: "The source presents a deliberate three-lane opening formation rather than a single central advance.",
    videoGeometryEvidence: {
      status: "reviewed_constraint_evidence",
      coordinateConvention: "Nyrro deployment edge is table right; Grymkin deployment edge is table left.",
      frames: [
        nyrroVideoFrame(150, "8f1c0c74b445d39cf5e347bd9673e3b2da0b440bbf08e7d600a2e8beb9c795d3", "deployment_reference"),
        nyrroVideoFrame(220, "a887fc20b7de746f9159666b2609e64f39784b365425b02520cdb831e0b87231", "turn_start_after_Grymkin_T1"),
        nyrroVideoFrame(470, "3232c4403096ad04c05131112176c9c78a3ecc11b72234a73815ec511f4c01ef", "turn_end"),
      ],
      constraints: ["deployment frame exposes both armies and terrain topology", "turn-start frame fixes Grymkin's completed first-turn advance while Nyrro remains on the right", "turn-end frame shows Nyrro split between upper-right, center-right and lower-right task groups", "the former 386-second endpoint omitted visible Nyrro movement and is superseded"],
      occlusions: ["some bases overlap in the right deployment cluster", "hands and measuring tools obscure intermediate paths"],
      claimBoundary: "Frames constrain opening lanes and group regions; strict materialization must still choose legal per-model coordinates and paths.",
    },
    additionalUnknowns: ["exact_deployment_coordinates", "exact_run_endpoints", "complete_activation_order"],
  }),
  turnSlice({
    sliceKey: "grymkin-match-nyrro-turn-2",
    matchKey: "hysene-vs-grymkin-100-fault-line-2026",
    round: 2,
    start: 580,
    end: 820,
    scoreObservation: { before: "0:0", after: "4:1", confidence: "high" },
    lifecycle: ["one contesting Dread Rot destroyed and eaten by a Strygon", "selected_side_losses_not_narrated_before_turn"],
    resourcesAndEffects: ["attacking Strygon ends described exchange on 3 Fury and gains 1 Hunger", "attached Sythyss Prophet grants Ashen Veil to Fane Knights"],
    spatialAndScenarioRelations: ["Benkei contests the upper 40mm element", "three Fane Knights within 3 inches of selected-side 50mm element", "Sybaris behind a building and outside one Cage Rager threat", "Sybaris retains a future central drag route"],
    observedPlan: "Remove the minimum contesting model, take a large scenario lead, and keep Sybaris protected while threatening a later drag.",
    observedActionSequence: ["Strygon attacks contesting Dread Rot twice", "assign Benkei to contest", "place Fane Knights for scenario", "advance Sybaris behind building"],
    observedOutcome: "Nyrro reaches a narrated 4:1 lead; the player later identifies Benkei placement as inferior to using Sasha.",
    sourceRuleAnomalies: ["source_player_identifies_Benkei_as_the_wrong_scenario_piece"],
    videoGeometryEvidence: {
      status: "reviewed_constraint_evidence",
      coordinateConvention: "Nyrro deployment edge is table right; Grymkin deployment edge is table left.",
      frames: [
        nyrroVideoFrame(580, "14f474c547642410c2244cd4178e29a0a2fab5ad56587e130609119a29249112", "turn_start"),
        nyrroVideoFrame(700, "2b74bb1937875f744e8497774d55c1684b195b40f9e7ac0a13c8199c83e11166", "midturn_after_first_scenario_commitment"),
        nyrroVideoFrame(810, "622a22c46c41379525ea16b314dfd4c088c6149eba7ddc15b5ba77446cccf758", "turn_end_before_Grymkin_T3_title"),
      ],
      constraints: ["turn-start frame fixes the Grymkin battlegroup mass in center-left and Nyrro's three surviving task groups", "midturn frame shows the selected-side commitment into the central and right scenario bands", "turn-end frame preserves the board associated with the narrated 4:1 score before the next opponent turn", "Sybaris remains tied to the upper-right building lane rather than an unconstrained open-board position"],
      occlusions: ["the active player's arms obscure individual right-flank bases", "dense central models prevent exact base separation recovery"],
      claimBoundary: "The frames support scenario-band occupancy and protected-lane relations, not exact three-inch or threat-range measurements.",
    },
    additionalUnknowns: ["which_Strygon_copy_attacked", "exact_Ashen_Veil_coverage", "exact_Sybaris_LOS_polygon"],
  }),
  turnSlice({
    sliceKey: "grymkin-match-nyrro-turn-3",
    matchKey: "hysene-vs-grymkin-100-fault-line-2026",
    round: 3,
    start: 1290,
    end: 1710,
    scoreObservation: { before: "4:6", after: "4:6", confidence: "high" },
    lifecycle: ["Benkei already destroyed", "at_least_two_Fane_Knight_models_destroyed", "one forward Nyrro flying model destroyed", "Sasha destroys Isiah", "one Dread Rot destroyed by The Last Watch", "Hysene and battlegroup destroy at least one Cage Rager"],
    resourcesAndEffects: ["Bitter Reprisal or Vengeance movement resolves for The Last Watch", "Storm Rager remains on one Strygon Rider", "Hysene feat used", "enemy corpse negates one spell", "Murderous Impulse used after qualifying kills", "Careful Reconnaissance moves Hysene back 3 inches", "Sythyss Prophet revives one Fane Knight"],
    spatialAndScenarioRelations: ["The Last Watch charges to contest the rear 40mm element", "Lanyssa remains outside the narrated enemy leader threat or LOS", "Sasha repositions away after the kill", "revived Fane Knight provides a Shadow Shift destination within 4 inches of Hysene"],
    observedPlan: "Remove at least two enemy heavies, contest both threatened scenario lanes, and preserve Hysene escape destinations after the central commitment.",
    observedActionSequence: ["reactive movement", "The Last Watch charge", "Sasha kill and reposition", "Strygon attacks", "Hysene charge and feat", "Sybaris Feast attacks", "Strygon Rider and Vordak attacks", "revive defensive anchor"],
    observedOutcome: "One Cage Rager is finished, another survives heavily damaged; the source player later judges Skin and Moans as the better priority, and the video score remains 4:6.",
    sourceRuleAnomalies: ["source_player_identifies_target_priority_error"],
    videoGeometryEvidence: {
      status: "reviewed_constraint_evidence",
      coordinateConvention: "Nyrro deployment edge is table right; Grymkin deployment edge is table left; score strings are selected-side first.",
      frames: [
        nyrroVideoFrame(1290, "1415b54d2d47bce1af08eed60dcebfbb86d1cfe31ffe17f6806f2108cce9cd23", "turn_start_with_Grymkin_6_Nyrro_4_overlay"),
        nyrroVideoFrame(1500, "0f5bd633f6921ccd212d44098cadbefbd07050d7cfd207770e61afbdb552cb84", "midturn_central_commitment"),
        nyrroVideoFrame(1700, "c7139592916d604b352f0d8d1d7b29e0c272d2a3af4f003590e9d3b3a57ab419", "turn_end_with_unchanged_score"),
      ],
      constraints: ["turn-start title and overlay prove the selected-side score is 4 against Grymkin's 6, superseding the old 4:1 record", "the engagement is concentrated around the central forest/objective line with additional upper and lower contest lanes", "midturn and end frames show the selected-side commitment and surviving escape/support spacing", "the score remains 4:6 before the Grymkin Turn 4 title"],
      occlusions: ["the central combat is densely packed", "individual model identity sometimes requires narration rather than appearance alone"],
      claimBoundary: "Frames bind score, contact topology and broad lanes; they do not prove exact melee reach, charge distance or Shadow Shift coordinates.",
    },
    additionalUnknowns: ["identity_of_destroyed_forward_flying_model", "exact_damage_remaining_on_each_heavy", "exact_Hunger_ledger"],
  }),
  turnSlice({
    sliceKey: "grymkin-match-nyrro-turn-4",
    matchKey: "hysene-vs-grymkin-100-fault-line-2026",
    round: 4,
    start: 2030,
    end: 2150,
    scoreObservation: { before: "6:6", after: "6:6", confidence: "high" },
    lifecycle: ["one Strygon Rider already destroyed", "Hysene begins on 4 remaining damage boxes", "Sythyss Prophet begins on 1 remaining damage box", "Sybaris frenzies", "one Cage Rager destroyed during the turn"],
    resourcesAndEffects: ["Hysene has no transfer target at the prior damage event", "Hysene previously Shadow Shifted to a Strygon", "Hysene casts Storm Rager on herself", "Hysene ends described activation camping 1"],
    damageAndSystems: ["recorded Grymkin Cage Rager had its mind system disabled before an illegal trample", "central Cage Rager begins this turn on approximately 4 boxes"],
    spatialAndScenarioRelations: ["Cage Rager engages Hysene at turn start", "Fane Knight and Sythyss Prophet can charge the damaged Cage Rager", "clearing that Cage Rager opens a possible route toward The Heretic"],
    observedPlan: "Free Hysene from the engaging Cage Rager, then choose between the exposed assassination route and a safer heavy removal.",
    observedActionSequence: ["resolve Sybaris frenzy", "charge damaged Cage Rager with support models", "Strygon Rider disengages and kills it", "cast Storm Rager on Hysene", "Hysene charges and removes another Cage Rager"],
    observedOutcome: "The player declines a plausible leader assassination; the recorded game later ends on the opponent's death clock at a reported 6:6.",
    sourceRuleAnomalies: ["recorded_opponent_trampled_with_disabled_mind_system", "recorded_prior_engaged_run_called_legal_by_players", "source_player_identifies_wrong_Shadow_Shift_destination", "source_player_identifies_declined_assassination"],
    videoGeometryEvidence: {
      status: "reviewed_constraint_evidence",
      coordinateConvention: "Nyrro deployment edge is table right; Grymkin deployment edge is table left; score strings are selected-side first.",
      frames: [
        nyrroVideoFrame(2030, "835139b206c4925d94cea2cdfc9aa7775139f2b9ab05161ee17825f2bf9feeb4", "turn_start_with_6_to_6_overlay"),
        nyrroVideoFrame(2090, "780390ba3e7f4b60fcd55379c9703b3dacade9278e5e1c21f3bbdc2ac06a4085", "midturn_clearing_sequence"),
        nyrroVideoFrame(2140, "9680af4891d0473975de49abde350e3603014e22b943d44d147b5f119f5c0afd", "turn_end_before_Grymkin_T5_title"),
      ],
      constraints: ["turn-start frame proves the 6:6 score and sparse late-game board", "Hysene and the damaged Cage Rager are in the central contact cluster at turn start", "midturn and end frames show the lane-clearing sequence and the surviving central/right-side pieces", "the selected turn ends before the Grymkin Turn 5 title with the score unchanged"],
      occlusions: ["measuring tools and hands obscure portions of the final central route", "damage values cannot be read from model appearance"],
      claimBoundary: "Frames constrain the late-game contact and potential route region; strict replay must reconstruct only rule-legal paths after excluding recorded illegal actions.",
    },
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
    const match = matchesByKey.get(matchKey);
    const rounds = slices.filter((slice) => slice.matchKey === matchKey)
      .map((slice) => slice.round);
    if (rounds.length !== match.usableTurnCount ||
        new Set(rounds).size !== match.usableTurnCount) {
      issues.push(`unexpected_selected_turn_count:${matchKey}`);
    }
  }
  const selectedFactions = new Set(slices.map((slice) => slice.selectedFaction));
  for (const requiredFaction of ["Cryx", "Dusk"]) {
    if (!selectedFactions.has(requiredFaction)) {
      issues.push(`missing_required_selected_faction:${requiredFaction}`);
    }
  }
  return issues;
}

export function buildWarmachineRealMatchOneSideCorpusV1() {
  const matchesByKey = new Map(matches.map((match) => [match.matchKey, match]));
  const issues = validateCorpus(matchesByKey, turnSlices);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_REAL_MATCH_ONE_SIDE_CORPUS_V1_SCHEMA,
    corpusKey: "cryx-and-nyrro-public-match-selected-side-turn-slices-v1",
    selectedFactions: ["Cryx", "Dusk"],
    selectedArmies: ["Necrofactorium", "Fane of Nyrro"],
    observationContract: {
      extractionUnit: "one_selected_side_complete_turn",
      selectedFactionStateIndependentOfRecordedOpponent: true,
      recordedOpponentRetainedAsProvenanceOnly: true,
      unknownGeometryRepresentation: "constraint_sets",
      positionEvidencePolicy: "video_frames_required_for_spatial_claims",
      exactCoordinatePolicy: "never_infer_exact_coordinates_from_video_without_measurement_support",
      opponentPairing: "separate_rule_legal_materialization_stage",
      strictReplayPolicy: "reject_or_reconstruct_recorded_illegal_actions",
    },
    supplementalNegativeControl: {
      source: "Hysene vs. Oriax, 50pt",
      use: "rule-anomaly audit only; excluded from the primary dual-faction corpus",
      auditDocument: "docs/research/real-match-nyrro-system-audit-20260914.md",
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
      videoReviewedGeometrySliceCount: turnSlices.filter((slice) =>
        slice.videoGeometryEvidence.status === "reviewed_constraint_evidence").length,
      frameReceiptCount: turnSlices.reduce((total, slice) =>
        total + slice.videoGeometryEvidence.frames.length, 0),
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
    claimBoundary: "This corpus records seven selected-side turn observations: four Fane of Nyrro turns and three Cryx Necrofactorium turns. Every slice binds reviewed video-frame receipts, but exact coordinates remain unknown. The corpus is not an exact replay, opponent model, win-rate sample or optimal-strategy claim.",
  });
  return {
    ...core,
    corpusHash: stableGraphHash(core),
  };
}
