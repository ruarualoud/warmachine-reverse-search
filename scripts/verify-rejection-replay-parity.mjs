import assert from "node:assert/strict";

import { enumerateRulesV1Actions } from "../src/warmachine-host-runtime.mjs";
import { replayWarmachineExactRejectedAction as replayLocal } from "../src/search/rejection-replay-v1.mjs";
import { loadLegacyReverseSearchModules } from "../src/upstream-project-d.mjs";

const { modules: legacyModules } = await loadLegacyReverseSearchModules({
  moduleKeys: ["rejectionReplay"],
});
const legacyReplay = legacyModules.rejectionReplay;
let parityCaseCount = 0;

function replayWarmachineExactRejectedAction(...args) {
  const local = replayLocal(...args);
  const upstream = legacyReplay.replayWarmachineExactRejectedAction(...args);
  assert.deepEqual(local, upstream, `rejection replay parity failed for case ${parityCaseCount + 1}`);
  parityCaseCount += 1;
  return local;
}

function piece(overrides = {}) {
  return {
    pieceKey: overrides.pieceKey || "piece",
    label: overrides.label || overrides.pieceKey || "Piece",
    sideKey: overrides.sideKey || "player1",
    modelRole: "solo",
    modelType: "solo",
    position: overrides.position || { xIn: 5, yIn: 5 },
    baseSizeIn: 1.18,
    speedIn: 6,
    meleeRangeIn: 1,
    meleePower: 12,
    defense: 12,
    armor: 16,
    mat: 7,
    rat: 6,
    resourceKind: "focus",
    resourcePoints: overrides.sideKey === "player2" ? 0 : 3,
    resourceMax: overrides.sideKey === "player2" ? 0 : 3,
    damage: { boxesRemaining: 20, maxBoxes: 20 },
    attackProfiles: [
      { profileKey: "gun", name: "Gun", mode: "ranged", rangeIn: 12, power: 10, attackStat: 6 },
    ],
    ...overrides,
  };
}

const state = {
  stateKey: "search-exact-rejection-replay",
  strictMode: true,
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 1,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    piece({ pieceKey: "actor", position: { xIn: 5, yIn: 5 } }),
    piece({ pieceKey: "engager", sideKey: "player2", position: { xIn: 6.1, yIn: 5 } }),
  ],
  terrain: [],
  scenario: { zones: [], flags: [], score: { player1: 0, player2: 0 }, victoryThreshold: 5 },
};

const enumeration = enumerateRulesV1Actions(state);
const rejected = enumeration.rejectedActions.find((action) =>
  action.actionType === "advance_then_ranged_attack" &&
  action.rejection?.reason === "disengagement_forfeits_combat_action");
assert.ok(rejected, "the fixture must expose a replayable rejected move-plus-Combat-Action candidate");

const proof = replayWarmachineExactRejectedAction(state, rejected.actionKey);
assert.equal(proof.exactRejectProven, true);
assert.equal(proof.hardPruneAllowed, true);
assert.equal(proof.blockers.length, 0);
assert.equal(proof.executorEvidence.firstReplay.ok, false);
assert.equal(proof.executorEvidence.secondReplay.ok, false);
assert.equal(proof.executorEvidence.mutationBlocked, true);
assert.equal(proof.cegarRefinement.hardPruneAllowed, true);
assert.equal(proof.cegarRefinement.disposition, "exact_strict_rejection_replay_proven");
assert.equal(proof.cegarRefinement.hardPruneScope.siblingActionsUnaffected, true);

const legalAdvance = enumeration.actions.find((action) => action.actionType === "advance");
assert.ok(legalAdvance);
const legalProof = replayWarmachineExactRejectedAction(state, legalAdvance.actionKey);
assert.equal(legalProof.hardPruneAllowed, false, "a legal action must never receive a rejection proof");
assert.ok(legalProof.blockers.includes("action_not_rejected_in_two_fresh_enumerations"));
assert.ok(legalProof.blockers.includes("action_appeared_in_legal_action_space"));

const missingProof = replayWarmachineExactRejectedAction(state, "missing-action-key");
assert.equal(missingProof.hardPruneAllowed, false);
assert.ok(missingProof.blockers.includes("action_not_rejected_in_two_fresh_enumerations"));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_search_rejection_replay_v1",
  exactRejectedActionKey: proof.actionKey,
  exactRejectProven: proof.exactRejectProven,
  hardPruneScope: proof.hardPruneScope,
  legalActionHardPruned: legalProof.hardPruneAllowed,
  missingActionHardPruned: missingProof.hardPruneAllowed,
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_rejection_replay_parity_v1",
  parityCaseCount,
}, null, 2));
