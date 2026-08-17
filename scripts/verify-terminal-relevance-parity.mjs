import assert from "node:assert/strict";
import fs from "node:fs";

import { buildWarmachineTerminalRelevanceClosure as buildLocalClosure } from "../src/search/terminal-relevance-closure-v1.mjs";
import { buildWarmachineRulesV1StateFromLayer3Room, resolveWarmachineHostPath } from "../src/warmachine-host-runtime.mjs";
import { loadLegacyReverseSearchModules } from "../src/upstream-project-d.mjs";
import { warmachineRulesetBaselineV1 } from "../src/contracts/ruleset-baseline-v1.mjs";

const { modules: legacyModules } = await loadLegacyReverseSearchModules({
  moduleKeys: ["relevanceClosure"],
});
const legacyRelevance = legacyModules.relevanceClosure;
let parityCaseCount = 0;

function buildWarmachineTerminalRelevanceClosure(...args) {
  const local = buildLocalClosure(...args);
  const upstream = legacyRelevance.buildWarmachineTerminalRelevanceClosure(...args);
  assert.deepEqual(local, upstream, `terminal relevance closure parity failed for case ${parityCaseCount + 1}`);
  parityCaseCount += 1;
  return local;
}


const fixturePack = JSON.parse(fs.readFileSync(resolveWarmachineHostPath("data/function3-fixtures/warmachine-micro-battle-fixtures.json"), "utf8"));
const fixture = structuredClone(fixturePack.fixtures.find((entry) =>
  entry.fixtureId === "micro_boosted_ranged_spends_focus_and_destroys").state);
const template = {
  templateKey: "relevance-ranged-assassination",
  goalType: "assassination",
  attackerSideKey: "player1",
  defenderSideKey: "player2",
  attackerPieceKey: "gunmage",
  targetPieceKey: "heavy",
  attackMode: "ranged",
  attackProfile: { profileKey: "gun", mode: "ranged", rangeIn: 18, power: 13 },
  targetBoxesBeforeFinal: 7,
  boostedDamage: true,
  initialEffectiveRuleClosure: { rules: [] },
};
const branch = {
  terminalBranchKey: "relevance-focus-branch",
  approachKind: "already_in_attack_range",
  resourceDemand: { resourceKind: "focus", paymentModel: "spend_held_resource", total: 1 },
  resourceSource: { sourceKind: "carry_current_resource", controllerPieceKeys: [] },
};
const closure = buildWarmachineTerminalRelevanceClosure(fixture, template, branch);
assert.equal(
  closure.coverage.atomRegistryCount,
  warmachineRulesetBaselineV1.interactionGraph.atomCount,
);
assert.equal(
  closure.coverage.atomInteractionCount,
  warmachineRulesetBaselineV1.interactionGraph.declaredInteractionCount,
);
assert.equal(
  closure.coverage.structuredAtomInteractionCount,
  warmachineRulesetBaselineV1.interactionGraph.declaredInteractionCount -
    warmachineRulesetBaselineV1.interactionGraph.quarantinedInteractionCount,
);
assert.equal(
  closure.coverage.unstructuredAtomInteractions.length,
  warmachineRulesetBaselineV1.interactionGraph.quarantinedInteractionCount,
);
assert.equal(closure.coverage.coreRuleNodeCount, 67);
assert.ok(closure.seeds.includes("ranged_attack"));
assert.ok(closure.seeds.includes("boost_damage_roll"));
assert.ok(closure.seeds.includes("focus"));
assert.ok(closure.selectedAtomKeys.length > 0);
assert.ok(closure.selectedCoreRuleKeys.includes("line_of_sight_targeting"));
assert.equal(closure.orderingOnly, true);
assert.equal(closure.hardPruningEnabled, false);
assert.equal(
  closure.reasonsHardPruningDisabled.includes("unstructured_rule_atom_interactions"),
  warmachineRulesetBaselineV1.interactionGraph.quarantinedInteractionCount > 0,
);
assert.ok(closure.reasonsHardPruningDisabled.includes("relevance_closure_has_not_passed_terminal_reachability_preservation_gate"));

const scenarioClosure = buildWarmachineTerminalRelevanceClosure(fixture, {
  templateKey: "relevance-scenario",
  goalType: "scenario_score",
  attackerSideKey: "player1",
  defenderSideKey: "player2",
  attackerPieceKey: "gunmage",
  scenarioElement: { elementType: "zone", elementKey: "center" },
  initialEffectiveRuleClosure: { rules: [] },
}, {
  terminalBranchKey: "relevance-scenario-branch",
  approachKind: "scenario_presence",
  resourceDemand: { total: 0 },
  resourceSource: { sourceKind: "no_resource_required" },
});
assert.ok(scenarioClosure.seeds.includes("scenario_score"));
assert.ok(scenarioClosure.seeds.includes("contesting"));
assert.equal(scenarioClosure.hardPruningEnabled, false);

const fixedRoomPath = resolveWarmachineHostPath("build/warmachine-ai/sepsira-swarm-vs-fane-v20260805/strict-construction-search-v2/deep/cryx-recursion-screen-fane-ashmael-scenario-blender-balanced-collision-player1-e4937ca7b578/input-room-store.tmp.json");
const fixedStore = JSON.parse(fs.readFileSync(fixedRoomPath, "utf8"));
const fixedRoom = Object.values(fixedStore.roomsById)[0];
const fixedState = buildWarmachineRulesV1StateFromLayer3Room(fixedRoom, { strictMode: true, enforceStrictExecutor: true });
const fixedClosure = buildWarmachineTerminalRelevanceClosure(fixedState, {
  ...template,
  attackerPieceKey: "player1_malfessor_14_1",
  targetPieceKey: "player2_ashmael_keeper_of_whispers_1_1",
}, branch);
assert.equal(fixedClosure.rosterRuleScope.scopeMode, "exact_roster_source_id_candidates");
assert.equal(
  fixedClosure.rosterRuleScope.candidateAtomCount,
  warmachineRulesetBaselineV1.fixedRosterProjection.exactMappedAtomCount,
);
assert.ok(fixedClosure.selectedAtomKeys.length <= fixedClosure.rosterRuleScope.candidateAtomCount);
assert.ok(fixedClosure.rosterRuleScope.unmappedSourceEntryCount > 0,
  "unmapped live card sources must remain explicit wildcard gaps");
assert.ok(fixedClosure.actorPriorityPieceKeys.length > 0);
assert.ok(fixedClosure.actorPriorityRows.every((row) => Number.isFinite(row.minimumClosureDepth)));
assert.deepEqual(fixedClosure.actorPriorityPieceKeys, fixedClosure.actorPriorityRows.map((row) => row.pieceKey));
assert.ok(fixedClosure.wildcardActorPieceKeys.length > 0);
assert.equal(fixedClosure.hardPruningEnabled, false);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_terminal_relevance_closure_v1",
  assassination: {
    seedCount: closure.seeds.length,
    reachedRuleKeyCount: closure.reachedRuleKeys.length,
    selectedAtomCount: closure.selectedAtomKeys.length,
    selectedCoreRuleCount: closure.selectedCoreRuleKeys.length,
    iterations: closure.iterations,
  },
  scenario: {
    seedCount: scenarioClosure.seeds.length,
    reachedRuleKeyCount: scenarioClosure.reachedRuleKeys.length,
    selectedAtomCount: scenarioClosure.selectedAtomKeys.length,
    selectedCoreRuleCount: scenarioClosure.selectedCoreRuleKeys.length,
  },
  fixedRoster: {
    sourceEntryCount: fixedClosure.rosterRuleScope.sourceEntryCount,
    candidateAtomCount: fixedClosure.rosterRuleScope.candidateAtomCount,
    selectedAtomCount: fixedClosure.selectedAtomKeys.length,
    unmappedSourceEntryCount: fixedClosure.rosterRuleScope.unmappedSourceEntryCount,
    priorityActorCount: fixedClosure.actorPriorityPieceKeys.length,
    wildcardActorCount: fixedClosure.wildcardActorPieceKeys.length,
  },
  hardPruningEnabled: false,
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_terminal_relevance_parity_v1",
  parityCaseCount,
}, null, 2));
