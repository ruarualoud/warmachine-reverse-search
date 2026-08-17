import assert from "node:assert/strict";
import fs from "node:fs";

import {
  applyRulesV1Action,
  buildWarmachineRulesV1ActionWithStrictRngOutcome,
  buildWarmachineRulesV1StateFromLayer3Room,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  resolveWarmachineHostPath,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";
import {
  buildWarmachineCapabilityBottleneckV2,
  buildWarmachineRosterSourceProjectionV2,
  buildWarmachineTerminalQueryProjectionV2,
  orderWarmachineActionsByTerminalQueryV2,
} from "../src/graph/capability-query-v2.mjs";
import { buildWarmachineTypedInteractionGraphV2 } from "../src/graph/typed-interaction-graph-v2.mjs";
import { typedFactsForOperator } from "../src/graph/typed-facts-v2.mjs";
import { buildWarmachineLazyActionCursorPlan } from "../src/search/lazy-action-cursor-v1.mjs";
import { warmachineRulesetBaselineV1 } from "../src/contracts/ruleset-baseline-v1.mjs";

const FIXED_ROOM_PATH = resolveWarmachineHostPath(
  "fixtures/ruleset-baseline/fixed-roster-room.json",
);
const MICRO_FIXTURE_PATH = resolveWarmachineHostPath(
  "data/function3-fixtures/warmachine-micro-battle-fixtures.json",
);

function assertOrderingPreserves(actions, query, label) {
  const ordering = orderWarmachineActionsByTerminalQueryV2(actions, query);
  assert.equal(ordering.preservedExactly, true, `${label}: terminal ordering lost an action`);
  assert.equal(ordering.hardFilteringPerformed, false, `${label}: ordering performed hard filtering`);
  assert.equal(ordering.outputActionCount, actions.length, `${label}: action count changed`);
  assert.deepEqual(
    ordering.orderedActions.map((action) => action.actionKey).sort(),
    actions.map((action) => action.actionKey).sort(),
    `${label}: action identity set changed`,
  );
  return ordering;
}

function reachableRuleAtoms(graph, startAtomId) {
  const outgoing = new Map();
  for (const edge of graph.edges) {
    if (edge.semanticTopologyAuthority === false || edge.reverseTraversalPolicy === "none") continue;
    if (!outgoing.has(edge.fromNodeId)) outgoing.set(edge.fromNodeId, []);
    outgoing.get(edge.fromNodeId).push(edge.toNodeId);
  }
  const seen = new Set([startAtomId]);
  const queue = [startAtomId];
  while (queue.length) {
    const current = queue.shift();
    for (const next of outgoing.get(current) || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return [...seen].filter((nodeId) => nodeId.startsWith("rule_atom:")).sort();
}

function strictTransition(state, action, enumeration, branchKey) {
  const strictAction = {
    ...buildWarmachineRulesV1ActionWithStrictRngOutcome(action, {
      room: {
        id: "typed-interaction-graph-v2-verifier",
        game: {
          round: enumeration.state.turnNumber,
          turnNumber: enumeration.state.turnNumber,
          activeSideKey: enumeration.state.activeSideKey,
        },
      },
      sourceContext: {
        rulesV1State: enumeration.state,
        rulesV1Enumeration: enumeration,
      },
      selectedActionKey: action.actionKey,
      branchKey,
    }),
    __warmachineTrustedRulesV1Enumeration: enumeration,
  };
  return applyRulesV1Action(enumeration.state, strictAction);
}

const graph = buildWarmachineTypedInteractionGraphV2();
assert.equal(graph.validation.structuralOk, true);
assert.equal(graph.hardPruningEnabled, false);
assert.equal(
  graph.reasonsHardPruningDisabled.some((reason) => reason.includes("quarantined_without_related_rule_keys")),
  graph.counts.quarantinedInteractionCount > 0,
  "hard-pruning diagnostics must reflect the current quarantine count",
);
assert.equal(graph.counts.atomCount, warmachineRulesetBaselineV1.interactionGraph.atomCount);
assert.equal(
  graph.counts.hookOperatorCount,
  warmachineRulesetBaselineV1.interactionGraph.hookOperatorCount,
);
assert.equal(
  graph.counts.primitiveCount,
  warmachineRulesetBaselineV1.interactionGraph.primitiveCount,
);
assert.equal(
  graph.counts.declaredInteractionCount,
  warmachineRulesetBaselineV1.interactionGraph.declaredInteractionCount,
);
assert.equal(
  graph.counts.quarantinedInteractionCount,
  warmachineRulesetBaselineV1.interactionGraph.quarantinedInteractionCount,
);
assert.equal(graph.counts.coreRuleNodeCount, 67);
assert.equal(graph.counts.attachedRuleCount, 67);
assert.equal(graph.counts.orphanRuleCount, 0);
assert.equal(graph.counts.evidenceInteractionCount, 186);
assert.equal(graph.counts.scenarioProfileCount, 7);
assert.equal(graph.validation.falseAtomBridgeCount, 0);
assert.equal(graph.validation.diagnosticTraversalLeakCount, 0);
assert.equal(graph.validation.operatorWithoutCapabilityCount, 0);
assert.ok(Object.hasOwn(
  graph.upstreamSourceHashes,
  "scripts/warmachine-steamroller-2026-v1.mjs",
));

for (const stageKey of [
  "disabled",
  "boxed",
  "destroyed",
  "exploded",
  "removed_from_play",
  "rfp",
  "replaced",
]) {
  assert.ok(graph.nodes.some((node) =>
    node.nodeId === `lifecycle_stage:${stageKey}`), `missing lifecycle stage ${stageKey}`);
}
for (const operationKey of [
  "possession",
  "allocation",
  "forcing",
  "spending",
  "leeching",
  "reaving",
  "transfer",
  "capacity",
]) {
  assert.ok(graph.nodes.some((node) =>
    node.nodeId === `resource_operation:${operationKey}`), `missing resource operation ${operationKey}`);
}

const hookGroups = Object.values(graph.indexes.operatorRows).reduce((map, operator) => {
  if (!map.has(operator.hookKey)) map.set(operator.hookKey, []);
  map.get(operator.hookKey).push(operator.atomNodeId);
  return map;
}, new Map());
const sharedHookAtoms = [...hookGroups.values()]
  .map((atomIds) => [...new Set(atomIds)].sort())
  .find((atomIds) => atomIds.length > 2);
assert.ok(sharedHookAtoms, "expected at least one shared hook adversarial pair");
assert.deepEqual(
  reachableRuleAtoms(graph, sharedHookAtoms[0]),
  [sharedHookAtoms[0]],
  "sharing a hook/capability/fact must not create an atom-to-atom semantic path",
);
assert.ok(graph.nodes.some((node) => node.nodeKind === "declared_concept"),
  "declared concepts should remain available for audit");
assert.equal(graph.edges.some((edge) =>
  edge.fromNodeId.startsWith("declared_concept:") &&
  edge.semanticTopologyAuthority !== false), false,
"shared declared strings must not provide semantic outgoing traversal");

const unknownFact = typedFactsForOperator({
  operatorFamily: "action_generation",
  hookKey: "action_contribution",
  parameters: { futureUnclassifiedField: { opaqueMode: "new_data_value" } },
});
assert.ok(unknownFact.some((fact) => fact.nodeKind === "operator_constraint"),
  "new opaque structured data must be retained as a quarantined operator constraint");

const store = JSON.parse(fs.readFileSync(FIXED_ROOM_PATH, "utf8"));
const room = Object.values(store.roomsById || {})[0];
const fixedState = buildWarmachineRulesV1StateFromLayer3Room(room, {
  strictMode: true,
  enforceStrictExecutor: true,
});
assert.equal(fixedState.pieces.length, 106);
const roster = buildWarmachineRosterSourceProjectionV2(fixedState, graph);
assert.deepEqual(roster.counts, warmachineRulesetBaselineV1.fixedRosterProjection);
assert.equal(roster.sourceClassificationDenominatorClosed, false);
assert.equal(roster.hardPruningEnabled, false);

const assassinationQuery = buildWarmachineTerminalQueryProjectionV2(fixedState, {
  templateKey: "fixed-106-assassination",
  goalType: "assassination",
}, graph);
const scenarioQuery = buildWarmachineTerminalQueryProjectionV2(fixedState, {
  templateKey: "fixed-106-scenario",
  goalType: "scenario_score",
}, graph);
assert.equal(assassinationQuery.counts.obligationCount, 7);
assert.equal(scenarioQuery.counts.obligationCount, 6);
assert.equal(assassinationQuery.hardPruningEnabled, false);
assert.equal(scenarioQuery.hardPruningEnabled, false);
assert.ok(assassinationQuery.relevantOperatorIds.length > 0);
assert.ok(scenarioQuery.obligations.some((row) =>
  row.obligationKey === "scenario:scoring_timing" && row.exactProviderComplete));
assert.ok(scenarioQuery.relevantCoreFactKeys.length > 0);
assert.ok(scenarioQuery.relevantPieceKeys.length > 0);

const realActionRows = [];
let traceState = fixedState;
for (let depth = 0; depth < 1; depth += 1) {
  const query = buildWarmachineTerminalQueryProjectionV2(traceState, {
    templateKey: `held-out-real-${depth}`,
    goalType: depth % 2 === 0 ? "assassination" : "scenario_score",
  }, graph);
  const plan = buildWarmachineLazyActionCursorPlan(traceState);
  let enumeration = null;
  for (const group of plan.groups || []) {
    const candidate = enumerateRulesV1Actions(traceState, { actorPieceKeys: group.actorPieceKeys });
    if (candidate.actions?.length) {
      enumeration = candidate;
      break;
    }
  }
  assert.ok(enumeration, `depth ${depth} has no legal action group`);
  const ordering = assertOrderingPreserves(
    enumeration.actions,
    query,
    `real-${depth}`,
  );
  const action = ordering.orderedActions[0];
  const transition = strictTransition(
    traceState,
    action,
    enumeration,
    `real-${depth}`,
  );
  assert.equal(transition.ok, true, `held-out strict action ${action.actionKey} rejected`);
  realActionRows.push({
    depth,
    actionKey: action.actionKey,
    actorPieceKey: action.actorPieceKey || "",
    eventCount: (transition.events || []).length,
  });
  traceState = transition.nextState;
}
assert.equal(realActionRows.length, 1);

const microPack = JSON.parse(fs.readFileSync(MICRO_FIXTURE_PATH, "utf8"));
const microFixtureIds = [
  "micro_single_advance_moves_model",
  "micro_boosted_ranged_spends_focus_and_destroys",
  "micro_control_phase_allocates_focus_to_warjack",
  "micro_control_phase_warbeast_frenzy_charge_after_failed_threshold",
  "micro_spray_ignores_stealth_beyond_five",
  "micro_steamroller_packet_flag_scores_control",
];
const microRows = [];
for (const fixtureId of microFixtureIds) {
  const fixture = microPack.fixtures.find((row) => row.fixtureId === fixtureId);
  assert.ok(fixture, `missing micro fixture ${fixtureId}`);
  const state = normalizeRulesV1State(structuredClone(fixture.state));
  const enumeration = enumerateRulesV1Actions(state);
  const query = buildWarmachineTerminalQueryProjectionV2(state, {
    templateKey: fixtureId,
    goalType: fixtureId.includes("score") ? "scenario_score" : "assassination",
  }, graph);
  assertOrderingPreserves(enumeration.actions || [], query, fixtureId);
  microRows.push({
    fixtureId,
    actionCount: (enumeration.actions || []).length,
    rejectedActionCount: (enumeration.rejectedActions || []).length,
  });
}

const bottleneck = buildWarmachineCapabilityBottleneckV2(assassinationQuery);
assert.equal(bottleneck.hardPruningEnabled, false);
assert.ok(bottleneck.counts.wildcardBlockedLockCount > 0);
const syntheticBottleneck = buildWarmachineCapabilityBottleneckV2({
  projectionHash: "synthetic",
  obligations: [{
    obligationKey: "synthetic:damage",
    capabilityRequirements: [{
      capabilityKey: "damage:numeric",
      exactOperatorProviders: [{
        atomNodeId: "rule_atom:only",
        pieceKeys: ["piece:only"],
      }],
      coreProviders: [],
      wildcardPieceKeys: [],
    }],
  }],
});
assert.equal(syntheticBottleneck.rows[0].bottleneckKind, "unique_model_candidate");
assert.equal(syntheticBottleneck.rows[0].orderingLockEligible, true);
assert.equal(syntheticBottleneck.rows[0].hardBranchLockEligible, false);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_typed_interaction_graph_v2",
  upstreamReceiptHash: warmachineHost.receipt.receiptHash,
  graphHash: graph.graphHash,
  counts: graph.counts,
  validation: graph.validation,
  rosterCounts: roster.counts,
  assassinationQueryCounts: assassinationQuery.counts,
  scenarioQueryCounts: scenarioQuery.counts,
  bottleneckCounts: bottleneck.counts,
  falseBridgeAdversary: {
    sharedHookAtomCount: sharedHookAtoms.length,
    reachableRuleAtomsFromFirst: reachableRuleAtoms(graph, sharedHookAtoms[0]),
  },
  heldOutStrictTrace: {
    transitionCount: realActionRows.length,
    rows: realActionRows,
  },
  microOrderingPreservation: microRows,
  hardPruningEnabled: false,
}, null, 2));
