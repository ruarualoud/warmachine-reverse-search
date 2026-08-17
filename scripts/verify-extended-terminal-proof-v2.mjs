import assert from "node:assert/strict";

import { buildWarmachineMinimalTerminalProofV2 } from
  "../src/reverse/terminal-proof-v2.mjs";

function leader(pieceKey, sideKey, destroyed = true) {
  return {
    pieceKey,
    sideKey,
    modelRole: "warcaster",
    modelType: "warcaster",
    isWarcaster: true,
    destroyed,
    removedFromPlay: destroyed,
    damageLifecycleStage: destroyed ? "destroyed" : "in_play",
    damage: { boxesRemaining: destroyed ? 0 : 20, maxBoxes: 20 },
    position: { xIn: sideKey === "player1" ? 12 : 36, yIn: 24 },
  };
}

function terminalState({ scenarioName = "Pressure Point", score, turnNumber = 3 } = {}) {
  return {
    stateKey: `extended-terminal-${scenarioName}-${turnNumber}`,
    strictExecutorMode: true,
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber,
    board: { widthIn: 48, heightIn: 48 },
    pieces: [leader("p1-leader", "player1"), leader("p2-leader", "player2")],
    scenario: {
      scenarioName,
      attackerSideKey: "player1",
      defenderSideKey: "player2",
      scoringStartSideKey: "player2",
      scoringStartTurnNumber: 2,
      score,
      objectives: [],
      caches: [],
    },
  };
}

const vpWinnerEvents = [{
  eventType: "simultaneous_leader_destruction",
  winnerSideKey: "player1",
  score: { player1: 3, player2: 1 },
}, {
  eventType: "terminal",
  winnerSideKey: "player1",
  reason: "steamroller_2026_simultaneous_leaders_tiebreak_resolved",
  roundNumber: 3,
  endingSideKey: "player1",
  tiebreakerResult: {},
}];
const vpWinner = buildWarmachineMinimalTerminalProofV2(
  terminalState({ score: { player1: 3, player2: 1 } }),
  {
    terminalClassKey: "simultaneous_leader_tiebreak",
    resultKind: "win",
    winnerSideKey: "player1",
    tiebreakClassKey: "victory_point_advantage",
  },
  { strictEvents: vpWinnerEvents, strictReceiptHash: "strict-vp-winner-receipt" },
);
assert.equal(vpWinner.status, "strict_certified", JSON.stringify(vpWinner.facts));
assert.equal(vpWinner.strictCertified, true);
assert.equal(vpWinner.trainingTruth, true);

const presenceWinnerEvents = [{
  eventType: "simultaneous_leader_destruction",
  winnerSideKey: "player2",
  score: { player1: 2, player2: 2 },
  tiebreakerResult: { ok: true, winnerSideKey: "player2", player1: 10, player2: 20 },
}, {
  eventType: "terminal",
  winnerSideKey: "player2",
  reason: "steamroller_2026_simultaneous_leaders_tiebreak_resolved",
  roundNumber: 3,
  endingSideKey: "player1",
  tiebreakerResult: { ok: true, winnerSideKey: "player2", player1: 10, player2: 20 },
}];
const presenceWinner = buildWarmachineMinimalTerminalProofV2(
  terminalState({ score: { player1: 2, player2: 2 } }),
  {
    goalType: "simultaneous_leader_tiebreak",
    resultKind: "win",
    winnerSideKey: "player2",
    tiebreakClassKey: "victory_points_tied_scenario_presence_advantage",
  },
  { strictEvents: presenceWinnerEvents, strictReceiptHash: "strict-presence-winner-receipt" },
);
assert.equal(presenceWinner.status, "strict_certified", JSON.stringify(presenceWinner.facts));

const tiedEvents = [{
  eventType: "simultaneous_leader_destruction",
  winnerSideKey: "",
  score: { player1: 2, player2: 2 },
  tiebreakerResult: { ok: true, winnerSideKey: "", player1: 10, player2: 10 },
}, {
  eventType: "terminal",
  winnerSideKey: "",
  reason: "steamroller_2026_simultaneous_leaders_tiebreak_tied",
  roundNumber: 3,
  endingSideKey: "player1",
  tiebreakerResult: { ok: true, winnerSideKey: "", player1: 10, player2: 10 },
}];
const tied = buildWarmachineMinimalTerminalProofV2(
  terminalState({ score: { player1: 2, player2: 2 } }),
  {
    goalType: "simultaneous_leader_tiebreak",
    resultKind: "tie",
    tiebreakClassKey: "victory_points_and_scenario_presence_tied",
  },
  { strictEvents: tiedEvents, strictReceiptHash: "strict-tied-host-receipt" },
);
assert.equal(tied.status, "candidate_unresolved_until_strict_terminal_event");
assert.equal(tied.strictCertified, false);
assert.equal(tied.trainingTruth, false);
assert.ok(tied.facts.some((fact) =>
  fact.factKind === "official_source_resolution" && fact.status === "unresolved"));

const fixedRoundEvents = [{
  eventType: "scenario_round_limit",
  completedRound: 7,
  winnerSideKey: "player1",
  score: { player1: 4, player2: 2 },
}, {
  eventType: "terminal",
  winnerSideKey: "player1",
  reason: "scenario_round_limit_tiebreak",
  roundNumber: 7,
  endingSideKey: "player2",
}];
const fixedRound = buildWarmachineMinimalTerminalProofV2(
  terminalState({
    scenarioName: "Trench Warfare",
    score: { player1: 4, player2: 2 },
    turnNumber: 7,
  }),
  {
    goalType: "fixed_round_limit_result",
    resultKind: "win",
    winnerSideKey: "player1",
    defenderSideKey: "player2",
    tiebreakClassKey: "victory_point_advantage",
    sourceResolutionStatus: "officially_confirmed",
  },
  { strictEvents: fixedRoundEvents, strictReceiptHash: "strict-round-limit-host-receipt" },
);
assert.equal(fixedRound.status, "strict_certified", JSON.stringify(fixedRound.facts));
assert.equal(fixedRound.strictCertified, true);
assert.ok(fixedRound.facts.some((fact) =>
  fact.factKind === "fixed_round_host_terminal_event" && fact.status === "satisfied"));
assert.ok(fixedRound.facts.some((fact) =>
  fact.factKind === "official_source_resolution" && fact.status === "satisfied"));

const fixedRoundSourceUnresolved = buildWarmachineMinimalTerminalProofV2(
  terminalState({
    scenarioName: "Trench Warfare",
    score: { player1: 2, player2: 2 },
    turnNumber: 7,
  }),
  {
    goalType: "fixed_round_limit_result",
    resultKind: "tie",
    defenderSideKey: "player2",
    tiebreakClassKey: "victory_points_and_scenario_presence_tied",
    sourceResolutionStatus: "official_second_tiebreak_still_tied_result_unresolved",
  },
  {
    strictEvents: fixedRoundEvents.map((event) => ({
      ...event,
      winnerSideKey: "",
      score: { player1: 2, player2: 2 },
      reason: event.eventType === "terminal"
        ? "scenario_round_limit_score_tied"
        : event.reason,
    })),
    strictReceiptHash: "strict-round-limit-source-unresolved-receipt",
  },
);
assert.equal(fixedRoundSourceUnresolved.strictCertified, false);
assert.ok(fixedRoundSourceUnresolved.facts.some((fact) =>
  fact.factKind === "official_source_resolution" && fact.status === "unresolved"));

const noFixedRound = buildWarmachineMinimalTerminalProofV2(
  terminalState({
    scenarioName: "Two Fronts",
    score: { player1: 4, player2: 2 },
    turnNumber: 7,
  }),
  {
    goalType: "fixed_round_limit_result",
    resultKind: "win",
    winnerSideKey: "player1",
    defenderSideKey: "player2",
  },
  { strictEvents: fixedRoundEvents, strictReceiptHash: "invalid-two-fronts-limit-receipt" },
);
assert.equal(noFixedRound.status, "invalid_under_bound_state");
assert.equal(noFixedRound.strictCertified, false);

assert.throws(() => buildWarmachineMinimalTerminalProofV2(
  terminalState({ score: { player1: 0, player2: 0 } }),
  { goalType: "invented_terminal" },
), /terminal_proof_goal_type_unsupported/);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_extended_terminal_proof_v2",
  simultaneousVpWinnerStatus: vpWinner.status,
  simultaneousPresenceWinnerStatus: presenceWinner.status,
  simultaneousFullTieStatus: tied.status,
  fixedRoundHostStatus: fixedRound.status,
  twoFrontsFixedRoundStatus: noFixedRound.status,
  proofHashes: {
    vpWinner: vpWinner.proofHash,
    presenceWinner: presenceWinner.proofHash,
    tied: tied.proofHash,
    fixedRound: fixedRound.proofHash,
  },
}, null, 2));
