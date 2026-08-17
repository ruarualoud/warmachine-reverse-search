import assert from "node:assert/strict";

import { generateWarmachinePreviousTurnEndPredecessorsV1 } from
  "../src/reverse/previous-turn-end-predecessor-v1.mjs";
import { normalizeRulesV1State } from "../src/warmachine-host-runtime.mjs";

function piece(pieceKey, sideKey, overrides = {}) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey,
    modelRole: "warrior",
    modelType: "warrior model",
    position: sideKey === "player1" ? { xIn: 10, yIn: 10 } : { xIn: 38, yIn: 38 },
    baseSizeIn: 1.18,
    defense: 12,
    armor: 16,
    damage: { boxesRemaining: 10, maxBoxes: 10 },
    resourceKind: "generic_resource",
    resourcePoints: 0,
    resourceMax: 0,
    statusTags: [],
    specialRules: [],
    activated: sideKey === "player1",
    cardSnapshot: { id: `card-${pieceKey}`, pointCostNumber: 0 },
    ...overrides,
  };
}

const successor = normalizeRulesV1State({
  stateKey: "previous-turn-end-focus-pass-successor",
  activeSideKey: "player2",
  firstPlayerSideKey: "player2",
  phaseKey: "control",
  controlPhaseStepKey: "maintenance",
  turnNumber: 2,
  strictMode: true,
  enforceStrictExecutor: true,
  ruleAtomRuntimeMode: "authoritative",
  preGameRuleChoicesComplete: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    piece("p1-solo", "player1"),
    piece("p2-caster", "player2", {
      modelRole: "warcaster",
      modelType: "warcaster",
      isWarcaster: true,
      resourceKind: "focus",
      resourcePoints: 7,
      resourceMax: 7,
      arc: 7,
      canAllocateFocus: true,
    }),
    piece("p2-jack", "player2", {
      modelRole: "warjack",
      modelType: "warjack",
      isWarjack: true,
      resourceKind: "focus",
      resourceMax: 3,
      controllerPieceKey: "p2-caster",
    }),
  ],
  terrain: [],
  scenario: {
    zones: [],
    flags: [],
    objectives: [],
    score: { player1: 0, player2: 0 },
    scoringHistory: [],
  },
});
const reverse = generateWarmachinePreviousTurnEndPredecessorsV1(successor, {
  nextSideActivationRestoreModes: ["all_alive_activated"],
  maintenanceResourcePreimageModes: ["focus_battlegroup_control_pass_baseline"],
  recordMaintenanceResourcePreimageCoverageDebt: true,
  includeRuntimeDiagnostics: true,
});
assert.equal(reverse.strictCandidateCount, 1, JSON.stringify({
  rejected: reverse.rejected,
  unresolved: reverse.unresolved,
  diagnostics: reverse.runtimeDiagnostics,
}, null, 2));
assert.equal(reverse.strictRejectedCount, 0);
const candidate = reverse.candidates[0];
assert.equal(candidate.mutation.maintenanceResourcePreimage.mode,
  "focus_battlegroup_control_pass_baseline");
assert.deepEqual(candidate.mutation.maintenanceResourcePreimage.pointsByPieceKey, {
  "p2-caster": 7,
  "p2-jack": 1,
});
assert.equal(candidate.predecessorState.pieces.find((entry) =>
  entry.pieceKey === "p2-caster").resourcePoints, 7);
assert.equal(candidate.predecessorState.pieces.find((entry) =>
  entry.pieceKey === "p2-jack").resourcePoints, 1);
assert.equal(candidate.mutation.firstPlayerSideKey, "player2");
assert.equal(candidate.mutation.completedRound, true);
assert.equal(candidate.mutation.endingTurnNumber, 1);
assert.equal(candidate.predecessorState.turnNumber, 1);
assert.ok(reverse.unresolved.some((row) =>
  row.reason === "previous_turn_end_maintenance_resource_preimage_universe_deferred"));

const firstPlayerOneSuccessor = normalizeRulesV1State({
  ...structuredClone(successor),
  stateKey: "previous-turn-end-first-player-one-successor",
  firstPlayerSideKey: "player1",
  scenario: {
    ...structuredClone(successor.scenario),
    attackerSideKey: "player1",
    defenderSideKey: "player2",
  },
});
const firstPlayerOneReverse = generateWarmachinePreviousTurnEndPredecessorsV1(
  firstPlayerOneSuccessor,
  {
    nextSideActivationRestoreModes: ["all_alive_activated"],
    maintenanceResourcePreimageModes: [
      "focus_battlegroup_control_pass_baseline",
    ],
  },
);
assert.equal(firstPlayerOneReverse.strictCandidateCount, 1,
  JSON.stringify(firstPlayerOneReverse.rejected));
const firstPlayerOneCandidate = firstPlayerOneReverse.candidates[0];
assert.equal(firstPlayerOneCandidate.mutation.firstPlayerSideKey, "player1");
assert.equal(firstPlayerOneCandidate.mutation.completedRound, false);
assert.equal(firstPlayerOneCandidate.mutation.endingTurnNumber, 2);
assert.equal(firstPlayerOneCandidate.predecessorState.turnNumber, 2);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_previous_turn_end_predecessor_v1",
  strictCandidateCount: reverse.strictCandidateCount,
  resourcePreimage: candidate.mutation.maintenanceResourcePreimage,
  strictReceiptHash: candidate.strictReceiptHash,
  roleCases: {
    firstPlayerTwo: {
      completedRound: candidate.mutation.completedRound,
      endingTurnNumber: candidate.mutation.endingTurnNumber,
    },
    firstPlayerOne: {
      completedRound: firstPlayerOneCandidate.mutation.completedRound,
      endingTurnNumber: firstPlayerOneCandidate.mutation.endingTurnNumber,
    },
  },
  reportHash: reverse.reportHash,
}, null, 2));
