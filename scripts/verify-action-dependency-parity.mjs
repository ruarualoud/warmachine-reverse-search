#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildWarmachineSearchActionFootprint as buildLocalFootprint,
  evaluateWarmachineSearchActionIndependence as evaluateLocalIndependence,
  WARMACHINE_SEARCH_ACTION_FOOTPRINT_SCHEMA,
  WARMACHINE_SEARCH_ACTION_INDEPENDENCE_SCHEMA,
  WARMACHINE_SEARCH_DEPENDENCY_SCHEMA,
} from "../src/search/action-dependency-v1.mjs";
import {
  enumerateRulesV1Actions,
  resolveWarmachineHostPath,
  strictOpponentReactionRequirementsForAction,
} from "../src/warmachine-host-runtime.mjs";
import { loadLegacyReverseSearchModules } from "../src/upstream-project-d.mjs";

const { modules: legacyModules } = await loadLegacyReverseSearchModules({
  moduleKeys: ["searchDependency"],
});
const legacyDependency = legacyModules.searchDependency;
const parityCounts = { footprint: 0, independence: 0 };

assert.equal(WARMACHINE_SEARCH_DEPENDENCY_SCHEMA, legacyDependency.WARMACHINE_SEARCH_DEPENDENCY_SCHEMA);
assert.equal(WARMACHINE_SEARCH_ACTION_FOOTPRINT_SCHEMA, legacyDependency.WARMACHINE_SEARCH_ACTION_FOOTPRINT_SCHEMA);
assert.equal(WARMACHINE_SEARCH_ACTION_INDEPENDENCE_SCHEMA, legacyDependency.WARMACHINE_SEARCH_ACTION_INDEPENDENCE_SCHEMA);

function buildWarmachineSearchActionFootprint(...args) {
  const local = buildLocalFootprint(...args);
  const upstream = legacyDependency.buildWarmachineSearchActionFootprint(...args);
  assert.deepEqual(local, upstream, `action footprint parity failed for case ${parityCounts.footprint + 1}`);
  parityCounts.footprint += 1;
  return local;
}

function evaluateWarmachineSearchActionIndependence(...args) {
  const local = evaluateLocalIndependence(...args);
  const upstream = legacyDependency.evaluateWarmachineSearchActionIndependence(...args);
  assert.deepEqual(local, upstream, `action independence parity failed for case ${parityCounts.independence + 1}`);
  parityCounts.independence += 1;
  return local;
}

const FIXTURE_PATH = resolveWarmachineHostPath("data/function3-fixtures/warmachine-micro-battle-fixtures.json");
const fixturePack = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));

function fixture(fixtureId) {
  const found = fixturePack.fixtures.find((entry) => entry.fixtureId === fixtureId);
  assert.ok(found, `missing fixture ${fixtureId}`);
  return found;
}

function enumeratedAction(fixtureId, predicate) {
  const selectedFixture = fixture(fixtureId);
  const enumeration = enumerateRulesV1Actions(selectedFixture.state);
  const selected = enumeration.actions.find(predicate);
  assert.ok(selected, `missing enumerated action for ${fixtureId}`);
  return { state: selectedFixture.state, action: selected, enumeration };
}

const unitCase = enumeratedAction(
  "micro_unit_placement_advance_lateral_coherency",
  (action) => action.actionType === "pass",
);
const unitMove = unitCase.enumeration.actions.find((action) => action.actionType === "run");
assert.ok(unitMove, "unit fixture must enumerate a run action");
const unitPassFootprint = buildWarmachineSearchActionFootprint(unitCase.state, unitCase.action);
const unitMoveFootprint = buildWarmachineSearchActionFootprint(unitCase.state, unitMove);
assert.equal(unitPassFootprint.activationGroupKey, "unit:unit-a");
assert.equal(unitMoveFootprint.activationGroupKey, "unit:unit-a");
assert.deepEqual(unitPassFootprint.unitPieceKeys, ["grunt", "leader"]);
const sameGroup = evaluateWarmachineSearchActionIndependence(unitPassFootprint, unitMoveFootprint);
assert.equal(sameGroup.independent, false);
assert.ok(sameGroup.reasons.includes("same_activation_group"));

const advanceCase = enumeratedAction(
  "micro_single_advance_moves_model",
  (action) => action.actionKey === "runner:advance:center:v1",
);
const advanceFootprint = buildWarmachineSearchActionFootprint(advanceCase.state, advanceCase.action);
const unknownFootprint = buildWarmachineSearchActionFootprint(advanceCase.state, {
  ...advanceCase.action,
  actionKey: "runner:future-unknown:v1",
  actionType: "future_unknown_action",
});
assert.equal(unknownFootprint.wildcard, true);
assert.equal(unknownFootprint.conservativeComplete, false);
assert.ok(unknownFootprint.reads.includes("*"));
assert.ok(unknownFootprint.completenessReasons.includes("unknown_action_type:future_unknown_action"));
const unknownPair = evaluateWarmachineSearchActionIndependence(unknownFootprint, advanceFootprint);
assert.equal(unknownPair.independent, false);
assert.ok(unknownPair.reasons.includes("left_footprint_incomplete"));
assert.ok(unknownPair.reasons.includes("left_wildcard"));

const runnerPass = advanceCase.enumeration.actions.find((action) => action.actionType === "pass");
assert.ok(runnerPass, "advance fixture must enumerate pass");
const runnerPassFootprint = buildWarmachineSearchActionFootprint(advanceCase.state, runnerPass);
const obviousConflict = evaluateWarmachineSearchActionIndependence(runnerPassFootprint, advanceFootprint);
assert.equal(obviousConflict.independent, false);
assert.ok(obviousConflict.reasons.includes("dependency_key_conflict"));
assert.ok(obviousConflict.conflicts.some((entry) => entry.key === "piece:runner:state"));

const reactionCase = enumeratedAction(
  "micro_disengage_advance_warns_free_strike",
  (action) => action.actionType === "advance" && action.metadata?.freeStrikeResolutionRequirements?.length > 0,
);
const reactionFootprint = buildWarmachineSearchActionFootprint(reactionCase.state, reactionCase.action);
assert.equal(reactionFootprint.reaction.required, true);
assert.ok(reactionFootprint.reaction.pieceKeys.includes("engager"));

const advanceSpellReactionCase = enumeratedAction(
  "micro_engaged_offensive_spell_warns",
  (action) => action.actionType === "advance_then_offensive_spell" && action.metadata?.disengagementCombatActionForfeit === true,
);
assert.equal(advanceSpellReactionCase.action.metadata?.freeStrikeRisk, false);
assert.deepEqual(advanceSpellReactionCase.action.metadata?.freeStrikeResolutionRequirements, []);
assert.equal(strictOpponentReactionRequirementsForAction(advanceSpellReactionCase.action)
  .some((requirement) => requirement.kind === "free_strike"), false);
const advanceSpellReactionFootprint = buildWarmachineSearchActionFootprint(
  advanceSpellReactionCase.state,
  advanceSpellReactionCase.action,
);
assert.equal(advanceSpellReactionFootprint.reaction.required, false);
assert.equal(advanceSpellReactionFootprint.conservativeComplete, true);

const attackCase = enumeratedAction(
  "micro_melee_destroys_adjacent_target",
  (action) => action.actionKey === "attacker:melee:target:v1",
);
const attackFootprint = buildWarmachineSearchActionFootprint(attackCase.state, attackCase.action);
assert.ok(attackFootprint.categories.includes("attack"));
assert.equal(attackFootprint.chance.required, true);
assert.ok(attackFootprint.writes.includes("piece:target:health"));

const spellCase = enumeratedAction(
  "micro_spell_profile_from_card_snapshot",
  (action) => action.actionKey === "caster:spell:target:bleed:v1",
);
const spellFootprint = buildWarmachineSearchActionFootprint(spellCase.state, spellCase.action);
assert.ok(spellFootprint.categories.includes("spell"));
assert.equal(spellFootprint.conservativeComplete, true);
assert.equal(spellFootprint.chance.required, true);

const animusCase = enumeratedAction(
  "micro_warbeast_casts_animus_with_resource",
  (action) => action.actionType === "cast_animus",
);
const animusFootprint = buildWarmachineSearchActionFootprint(animusCase.state, animusCase.action);
assert.ok(animusFootprint.categories.includes("spell"));
assert.equal(animusFootprint.conservativeComplete, true);
const undeclaredAnimusEffectFootprint = buildWarmachineSearchActionFootprint(animusCase.state, {
  ...animusCase.action,
  actionKey: `${animusCase.action.actionKey}:undeclared-effect`,
  metadata: {
    ...(animusCase.action.metadata || {}),
    spellExecutableEffects: [{ effectType: "speed_bonus", amount: 2 }],
  },
});
assert.equal(undeclaredAnimusEffectFootprint.conservativeComplete, false);
assert.ok(undeclaredAnimusEffectFootprint.completenessReasons.includes("spell_effect_requires_declared_search_footprint"));

const resourceCase = enumeratedAction(
  "micro_control_phase_allocates_focus_to_warjack",
  (action) => action.actionKey === "caster:allocate-focus:jack:v1",
);
const resourceFootprint = buildWarmachineSearchActionFootprint(resourceCase.state, resourceCase.action);
assert.ok(resourceFootprint.categories.includes("resource"));
assert.ok(resourceFootprint.writes.includes("piece:caster:resource"));
assert.ok(resourceFootprint.writes.includes("piece:jack:resource"));

const scoreCase = enumeratedAction(
  "micro_steamroller_packet_flag_scores_control",
  (action) => action.actionKey === "scenario:score-flag:flag1:player1:v1",
);
const scoreFootprint = buildWarmachineSearchActionFootprint(scoreCase.state, scoreCase.action);
assert.ok(scoreFootprint.categories.includes("scenario_score"));
assert.ok(scoreFootprint.reads.includes("global:scenario-elements"));
assert.ok(scoreFootprint.writes.includes("global:scenario-score"));

const metadataFootprint = buildWarmachineSearchActionFootprint({
  activeSideKey: "player1",
  pieces: [
    { pieceKey: "alpha", sideKey: "player1" },
    { pieceKey: "beta", sideKey: "player1" },
  ],
}, {
  actionKey: "alpha:metadata-contract:v1",
  actionType: "pass",
  actorPieceKey: "alpha",
  metadata: {
    affectedPieceKeys: ["beta"],
    unitPieceKeys: ["alpha"],
  },
});
assert.deepEqual(metadataFootprint.affectedPieceKeys, ["beta"]);
assert.deepEqual(metadataFootprint.unitPieceKeys, ["alpha"]);
assert.ok(metadataFootprint.writes.includes("piece:beta:state"));

const unknownAtomFootprint = buildWarmachineSearchActionFootprint({
  activeSideKey: "player1",
  pieces: [{ pieceKey: "alpha", sideKey: "player1" }],
}, {
  actionKey: "alpha:unknown-atom:v1",
  actionType: "pass",
  actorPieceKey: "alpha",
  metadata: {
    ruleAtomEffects: [{
      atomKey: "future_atom",
      hookKey: "activation_end",
      primitive: { primitiveType: "future_primitive" },
    }],
  },
});
assert.equal(unknownAtomFootprint.wildcard, true);
assert.equal(unknownAtomFootprint.conservativeComplete, false);
assert.ok(unknownAtomFootprint.completenessReasons.some((reason) => reason.startsWith("unknown_atom_impact:future_atom:")));

const independentState = {
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 1,
  pieces: [
    { pieceKey: "alpha", sideKey: "player1", activated: false },
    { pieceKey: "beta", sideKey: "player1", activated: false },
  ],
};
const alphaPass = buildWarmachineSearchActionFootprint(independentState, {
  actionKey: "alpha:pass:v1",
  actionType: "pass",
  actorPieceKey: "alpha",
  metadata: {},
});
const betaPass = buildWarmachineSearchActionFootprint(independentState, {
  actionKey: "beta:pass:v1",
  actionType: "pass",
  actorPieceKey: "beta",
  metadata: {},
});
assert.equal(alphaPass.conservativeComplete, true);
assert.equal(betaPass.conservativeComplete, true);
assert.equal(alphaPass.controlOwnerSideKey, "player1");
assert.equal(alphaPass.chance.required, false);
assert.equal(betaPass.reaction.required, false);
const positive = evaluateWarmachineSearchActionIndependence(alphaPass, betaPass);
assert.equal(positive.independent, true);
assert.deepEqual(positive.reasons, []);
assert.deepEqual(positive.conflicts, []);

assert.equal(unitPassFootprint.schemaVersion, WARMACHINE_SEARCH_ACTION_FOOTPRINT_SCHEMA);
assert.equal(positive.schemaVersion, WARMACHINE_SEARCH_ACTION_INDEPENDENCE_SCHEMA);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: WARMACHINE_SEARCH_DEPENDENCY_SCHEMA,
  fixtureActionChecks: {
    sameActivationGroupRejected: !sameGroup.independent,
    unknownActionRejected: !unknownPair.independent,
    conflictingActionRejected: !obviousConflict.independent,
    reactionDetected: reactionFootprint.reaction.required,
    currentAdvanceSpellDisengagementForfeitDetected:
      advanceSpellReactionCase.action.metadata?.disengagementCombatActionForfeit === true,
    currentAdvanceSpellDoesNotInventFreeStrike: !advanceSpellReactionFootprint.reaction.required,
    attackChanceDetected: attackFootprint.chance.required,
    plainOffensiveSpellComplete: spellFootprint.conservativeComplete,
    exactNoEffectAnimusComplete: animusFootprint.conservativeComplete,
    supportAnimusEffectIncompleteWithoutDeclaredFootprint: !undeclaredAnimusEffectFootprint.conservativeComplete,
    resourceWritesDetected: resourceFootprint.writes.filter((key) => key.endsWith(":resource")),
    scenarioScoreDetected: scoreFootprint.writes.includes("global:scenario-score"),
  },
  syntheticChecks: {
    affectedAndUnitMetadataDetected: true,
    unknownAtomRejected: !unknownAtomFootprint.conservativeComplete,
    independentDifferentPiecePasses: positive.independent,
  },
  hardPruningEnabled: false,
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_action_dependency_parity_v1",
  parityCounts,
}, null, 2));
