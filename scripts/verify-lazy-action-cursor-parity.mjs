import assert from "node:assert/strict";
import fs from "node:fs";

import { buildWarmachineRulesV1StateFromLayer3Room, enumerateRulesV1Actions, normalizeRulesV1State, recognizedWarmachineRuleAtomByAtomKey, resolveWarmachineHostPath } from "../src/warmachine-host-runtime.mjs";
import * as localLazy from "../src/search/lazy-action-cursor-v1.mjs";
import { loadLegacyReverseSearchModules } from "../src/upstream-project-d.mjs";

const { modules: legacyModules } = await loadLegacyReverseSearchModules({
  moduleKeys: ["lazyAction"],
});
const legacyLazy = legacyModules.lazyAction;
const parityCounts = { plan: 0, batch: 0, exhaust: 0 };
assert.deepEqual(Object.keys(localLazy).sort(), Object.keys(legacyLazy).sort());

function buildWarmachineLazyActionCursorPlan(...args) {
  const local = localLazy.buildWarmachineLazyActionCursorPlan(...args);
  const upstream = legacyLazy.buildWarmachineLazyActionCursorPlan(...args);
  assert.deepEqual(local, upstream, `lazy plan parity failed for case ${parityCounts.plan + 1}`);
  parityCounts.plan += 1;
  return local;
}

function enumerateNextWarmachineLazyActionBatch(...args) {
  const local = localLazy.enumerateNextWarmachineLazyActionBatch(...args);
  const upstream = legacyLazy.enumerateNextWarmachineLazyActionBatch(...args);
  assert.deepEqual(local, upstream, `lazy batch parity failed for case ${parityCounts.batch + 1}`);
  parityCounts.batch += 1;
  return local;
}

function exhaustWarmachineLazyActionCursor(...args) {
  const local = localLazy.exhaustWarmachineLazyActionCursor(...args);
  const upstream = legacyLazy.exhaustWarmachineLazyActionCursor(...args);
  assert.deepEqual(local, upstream, `lazy exhaust parity failed for case ${parityCounts.exhaust + 1}`);
  parityCounts.exhaust += 1;
  return local;
}

const FIXTURE_PATH = resolveWarmachineHostPath("data/function3-fixtures/warmachine-micro-battle-fixtures.json");
const FIXED_ROOM_PATH = resolveWarmachineHostPath("build/warmachine-ai/sepsira-swarm-vs-fane-v20260805/strict-construction-search-v2/deep/cryx-recursion-screen-fane-ashmael-scenario-blender-balanced-collision-player1-e4937ca7b578/input-room-store.tmp.json");
const fixturePack = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));

const atomLookup = recognizedWarmachineRuleAtomByAtomKey("mutagenesis_enemy_boxed_mandatory_rfp_optional_live_spellcaster_replacement");
assert.equal(atomLookup?.atomKey, "mutagenesis_enemy_boxed_mandatory_rfp_optional_live_spellcaster_replacement");
atomLookup.atomKey = "mutated-verifier-copy";
assert.equal(
  recognizedWarmachineRuleAtomByAtomKey("mutagenesis_enemy_boxed_mandatory_rfp_optional_live_spellcaster_replacement")?.atomKey,
  "mutagenesis_enemy_boxed_mandatory_rfp_optional_live_spellcaster_replacement",
  "indexed atom lookup must retain clone isolation",
);

function fixture(fixtureId) {
  const row = fixturePack.fixtures.find((entry) => entry.fixtureId === fixtureId);
  assert.ok(row, `missing fixture ${fixtureId}`);
  return normalizeRulesV1State(structuredClone(row.state));
}

function actionKeys(rows = []) {
  return Array.from(new Set(rows.map((row) => row.actionKey))).sort();
}

const parityFixtureIds = [
  "micro_single_advance_moves_model",
  "micro_unit_placement_advance_lateral_coherency",
  "micro_unit_scattered_non_selected_members_are_placed_after_selected_trooper_moves",
  "micro_end_turn_resets_next_side_activations",
  "micro_boosted_ranged_spends_focus_and_destroys",
  "micro_control_phase_allocates_focus_to_warjack",
];
const parityRows = [];
for (const fixtureId of parityFixtureIds) {
  const state = fixture(fixtureId);
  const full = enumerateRulesV1Actions(state);
  const lazy = exhaustWarmachineLazyActionCursor(state, { groupBatchSize: 1 });
  assert.deepEqual(actionKeys(lazy.actions), actionKeys(full.actions),
    `${fixtureId} lazy action cursor must exhaust to the full legal action-key set`);
  assert.deepEqual(actionKeys(lazy.rejectedActions), actionKeys(full.rejectedActions || []),
    `${fixtureId} lazy action cursor must exhaust to the full rejected action-key set`);
  parityRows.push({
    fixtureId,
    phaseKey: state.phaseKey,
    groupCount: lazy.plan.groupCount,
    batchCount: lazy.batches.length,
    actionCount: lazy.actionCount,
    rejectedActionCount: lazy.rejectedActionCount,
  });
}

const multiGroupState = fixture("micro_unit_blocked_center_has_alternate_advance");
const firstBatch = enumerateNextWarmachineLazyActionBatch(multiGroupState, {}, { groupBatchSize: 1 });
assert.equal(firstBatch.selectedGroups.length, 1);
assert.equal(firstBatch.exhausted, false);
assert.ok(firstBatch.remainingGroupCount > 0);
assert.match(firstBatch.claimBoundary, /unresolved/);
assert.ok(firstBatch.plan.groups.some((group) => group.pieceCount > 1),
  "a unit activation group must not be split into independent model cursors");

const endTurnState = fixture("micro_end_turn_resets_next_side_activations");
const endTurnBatch = enumerateNextWarmachineLazyActionBatch(endTurnState);
assert.ok(endTurnBatch.enumeration.actions.some((action) => action.actionType === "end_turn"),
  "the first scoped batch must retain actorless phase actions");
assert.ok(endTurnBatch.plan.mode === "activation_group_batches" ||
  endTurnBatch.enumeration.actorlessActionsIncludedInScope === true);

assert.ok(fs.existsSync(FIXED_ROOM_PATH));
const store = JSON.parse(fs.readFileSync(FIXED_ROOM_PATH, "utf8"));
const room = Object.values(store.roomsById || {})[0];
const fixedState = buildWarmachineRulesV1StateFromLayer3Room(room, { strictMode: true, enforceStrictExecutor: true });
const fixedPlan = buildWarmachineLazyActionCursorPlan(fixedState);
assert.equal(fixedState.pieces.length, 106);
assert.ok(fixedPlan.groupCount > 1 && fixedPlan.groupCount < 53,
  "the 106-model opening should expose activation groups rather than one cursor per model");
for (const group of fixedPlan.groups) {
  const unitGroupIds = new Set(fixedState.pieces
    .filter((piece) => group.actorPieceKeys.includes(piece.pieceKey))
    .map((piece) => piece.unitGroupId || piece.unitId || piece.metadata?.unitGroupId || piece.metadata?.unitId || piece.pieceKey));
  assert.equal(unitGroupIds.size, 1, `cursor group ${group.groupKey} must preserve one activation group`);
}

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_lazy_action_cursor_v1",
  parityRows,
  actorlessPhaseActionVerified: true,
  unitActivationAtomicityVerified: true,
  fixedOpening: {
    modelCount: fixedState.pieces.length,
    activeModelCount: fixedState.pieces.filter((piece) => piece.sideKey === fixedState.activeSideKey).length,
    activationGroupCount: fixedPlan.groupCount,
    groupSizes: fixedPlan.groups.map((group) => group.pieceCount).sort((left, right) => right - left),
  },
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_lazy_action_cursor_parity_v1",
  exportedCapabilityCount: Object.keys(localLazy).length,
  parityCounts,
}, null, 2));
