import assert from "node:assert/strict";

import { warmachineHost } from "../src/warmachine-host-runtime.mjs";
import { buildWarmachineTerminalHypothesisDomainV1 } from
  "../src/reverse/terminal-hypothesis-v1.mjs";

const fixedInput = {
  scenarioKey: "two-fronts",
  scenarioPacketKey: "steamroller-2026",
  scenarioPacketYear: "2026",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  rosterReceiptHash: "fixed-cryx-sepsira-six-swarms-vs-fane-nymara-v1",
  specs: [
    {
      goalType: "assassination",
      roundNumbers: [3],
      winnerSideKeys: ["player1"],
      loserSideKeys: ["player2"],
      endingSideKeys: ["player1"],
      causalActionFamilies: ["strict_attack_or_effect_chain"],
      actorPieceKeys: ["player1_raptor_20_1"],
      targetLeaderPieceKeys: ["player2_nymara_the_shadowblade_1_1"],
      targetBoxesBeforeFinal: [1],
      resourceEnvelopeKeys: ["focus_paid_attack_chain"],
      geometryRelationCells: [{
        relationKind: "terminal_attack_reachable",
        actorToTargetRangeBand: "selected_profile_legal_range",
        lineOfSightRelation: "strict_los_required",
        pathRelation: "strict_charge_or_advance_path_required",
      }],
      assumptionSources: {
        goalType: "user_constrained",
        roundNumber: "user_constrained",
        winnerSideKey: "user_constrained",
        loserSideKey: "rule_derived",
        endingSideKey: "user_constrained",
        causalActionFamily: "optimistic_proposal",
        actorPieceKey: "optimistic_proposal",
        targetLeaderPieceKey: "user_constrained",
        targetBoxesBeforeFinal: "optimistic_proposal",
        resourceEnvelopeKey: "optimistic_proposal",
        geometryRelationCell: "optimistic_proposal",
      },
    },
    {
      goalType: "scenario_score",
      roundNumbers: [3],
      winnerSideKeys: ["player1"],
      loserSideKeys: ["player2"],
      endingSideKeys: ["player2"],
      causalActionFamilies: ["steamroller_turn_end_settlement"],
      scoringElementKeys: ["central_zone"],
      scoreBeforeTerminalCells: [{
        relationKey: "player1_leads_by_two",
        scoreBySide: { player1: 2, player2: 0 },
      }],
      terminalScoreGainCells: [{
        relationKey: "player1_scores_one",
        scoreGainBySide: { player1: 1, player2: 0 },
      }],
      geometryRelationCells: [{
        relationKind: "scenario_control_at_settlement",
        scenarioRelation: "winner_controls_and_opponent_does_not_contest",
        lineOfSightRelation: "not_required_for_scoring",
        pathRelation: "prior_movement_strict_path_required",
      }],
      assumptionSources: {
        goalType: "user_constrained",
        roundNumber: "user_constrained",
        winnerSideKey: "user_constrained",
        loserSideKey: "rule_derived",
        endingSideKey: "rule_derived",
        causalActionFamily: "rule_derived",
        scoringElementKey: "optimistic_proposal",
        scoreBeforeTerminalCell: "optimistic_proposal",
        terminalScoreGainCell: "optimistic_proposal",
        geometryRelationCell: "optimistic_proposal",
      },
    },
  ],
};

const domain = buildWarmachineTerminalHypothesisDomainV1(fixedInput);
assert.equal(domain.ok, true);
assert.equal(domain.counts.generatedCellCount, 2);
assert.equal(domain.counts.assassinationCellCount, 1);
assert.equal(domain.counts.scenarioScoreCellCount, 1);
assert.equal(domain.coverageDenominatorComplete, true);
assert.equal(domain.oracleIsolationAudit.passed, true);
assert.deepEqual(domain.cells.map((cell) => cell.roundNumber), [3, 3]);
assert.equal(domain.cells.every((cell) => cell.trainingTruth === false), true);
assert.equal(domain.cells.every((cell) => cell.geometryRelationCell.materializationRequired), true);
const scoreCell = domain.cells.find((cell) => cell.goalType === "scenario_score");
assert.deepEqual(scoreCell.scoreBeforeTerminalCell.scoreBySide, { player1: 2, player2: 0 });
assert.deepEqual(scoreCell.terminalScoreGainCell.scoreGainBySide, { player1: 1, player2: 0 });

const expanded = buildWarmachineTerminalHypothesisDomainV1({
  ...fixedInput,
  specs: [{
    ...fixedInput.specs[0],
    roundNumbers: [2, 3, 4],
    causalActionFamilies: ["strict_melee_chain", "strict_spell_chain"],
  }],
});
assert.equal(expanded.counts.generatedCellCount, 6);
assert.equal(expanded.coverageDenominatorComplete, true);

const bounded = buildWarmachineTerminalHypothesisDomainV1({
  ...fixedInput,
  specs: [{
    ...fixedInput.specs[0],
    roundNumbers: [2, 3, 4],
    causalActionFamilies: ["strict_melee_chain", "strict_spell_chain"],
  }],
}, { maximumCells: 2 });
assert.equal(bounded.counts.generatedCellCount, 2);
assert.equal(bounded.counts.omittedCellCount, 4);
assert.equal(bounded.coverageDenominatorComplete, false);

assert.throws(() => buildWarmachineTerminalHypothesisDomainV1({
  ...fixedInput,
  forwardOracle: { routeSteps: ["hidden"] },
}), /terminal_hypothesis_forward_oracle_input_forbidden/);

assert.throws(() => buildWarmachineTerminalHypothesisDomainV1({
  ...fixedInput,
  specs: [{
    ...fixedInput.specs[1],
    endingSideKeys: ["player1"],
  }],
}), /terminal_hypothesis_score_must_settle_on_opponent_turn/);

const extendedTerminalDomain = buildWarmachineTerminalHypothesisDomainV1({
  scenarioKey: "pressure-point",
  scenarioPacketKey: "steamroller-2026",
  scenarioPacketYear: "2026",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  rosterReceiptHash: "extended-terminal-types-roster-v1",
  specs: [{
    goalType: "simultaneous_leader_tiebreak",
    roundNumbers: [3],
    endingSideKeys: ["player1"],
    attackerSideKeys: ["player1"],
    defenderSideKeys: ["player2"],
    causalActionFamilies: ["single_simultaneous_resolution_window"],
    terminalOutcomeCells: [{
      relationKey: "vp-winner-player1",
      resultKind: "win",
      winnerSideKey: "player1",
      loserSideKey: "player2",
      tiebreakClassKey: "victory_point_advantage",
    }, {
      relationKey: "full-tie-source-unresolved",
      resultKind: "tie",
      tiebreakClassKey: "victory_points_and_scenario_presence_tied",
      sourceResolutionStatus: "official_second_tiebreak_still_tied_result_unresolved",
    }],
    geometryRelationCells: [{
      relationKind: "simultaneous_terminal_relation",
      lineOfSightRelation: "strict_effect_specific",
      pathRelation: "strict_effect_specific",
    }],
    assumptionSources: {
      goalType: "user_constrained",
      roundNumber: "user_constrained",
      endingSideKey: "user_constrained",
      attackerSideKey: "rule_derived",
      defenderSideKey: "rule_derived",
      causalActionFamily: "optimistic_proposal",
      terminalOutcomeCell: "rule_derived",
      geometryRelationCell: "optimistic_proposal",
    },
  }, {
    goalType: "fixed_round_limit_result",
    roundNumbers: [7],
    endingSideKeys: ["player2"],
    attackerSideKeys: ["player1"],
    defenderSideKeys: ["player2"],
    causalActionFamilies: ["defender_fixed_round_turn_end_settlement"],
    terminalOutcomeCells: [{
      relationKey: "fixed-round-vp-winner-player1",
      resultKind: "win",
      winnerSideKey: "player1",
      loserSideKey: "player2",
      tiebreakClassKey: "victory_point_advantage",
      sourceResolutionStatus:
        "official_fixed_length_to_tiebreak_link_unresolved_host_candidate_only",
    }],
    geometryRelationCells: [{
      relationKind: "fixed_round_scenario_presence_relation",
      lineOfSightRelation: "not_required",
      pathRelation: "prior_history_required",
      scenarioRelation: "scenario_presence_partitioned",
    }],
    assumptionSources: {
      goalType: "user_constrained",
      roundNumber: "rule_derived",
      endingSideKey: "rule_derived",
      attackerSideKey: "rule_derived",
      defenderSideKey: "rule_derived",
      causalActionFamily: "rule_derived",
      terminalOutcomeCell: "rule_derived",
      geometryRelationCell: "optimistic_proposal",
    },
  }],
});
assert.equal(extendedTerminalDomain.ok, true);
assert.equal(extendedTerminalDomain.counts.generatedCellCount, 3);
assert.equal(extendedTerminalDomain.counts.simultaneousLeaderTiebreakCellCount, 2);
assert.equal(extendedTerminalDomain.counts.fixedRoundLimitCellCount, 1);
assert.ok(extendedTerminalDomain.cells.some((cell) =>
  cell.goalType === "simultaneous_leader_tiebreak" && cell.resultKind === "tie" &&
  cell.winnerSideKey === null && cell.loserSideKey === null));
assert.ok(extendedTerminalDomain.cells.some((cell) =>
  cell.goalType === "fixed_round_limit_result" &&
  cell.sourceResolutionStatus ===
    "official_fixed_length_to_tiebreak_link_unresolved_host_candidate_only"));

assert.throws(() => buildWarmachineTerminalHypothesisDomainV1({
  ...extendedTerminalDomain,
  specs: [{
    goalType: "fixed_round_limit_result",
    roundNumbers: [7],
    endingSideKeys: ["player1"],
    attackerSideKeys: ["player1"],
    defenderSideKeys: ["player2"],
    causalActionFamilies: ["defender_fixed_round_turn_end_settlement"],
    terminalOutcomeCells: [{
      relationKey: "invalid-ending-side",
      resultKind: "win",
      winnerSideKey: "player1",
      loserSideKey: "player2",
      tiebreakClassKey: "victory_point_advantage",
    }],
    geometryRelationCells: [{ relationKind: "fixed_round" }],
  }],
}), /terminal_hypothesis_fixed_round_must_end_on_defender/);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_terminal_hypothesis_v1",
  fixedDomainHash: domain.domainHash,
  fixedCellCount: domain.counts.generatedCellCount,
  expandedCellCount: expanded.counts.generatedCellCount,
  boundedOmittedCellCount: bounded.counts.omittedCellCount,
  extendedTerminalCellCount: extendedTerminalDomain.counts.generatedCellCount,
  oracleIsolationPassed: domain.oracleIsolationAudit.passed,
}, null, 2));
