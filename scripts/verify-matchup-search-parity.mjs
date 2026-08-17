#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { resolveWarmachineHostPath } from "../src/warmachine-host-runtime.mjs";
import { loadLegacyReverseSearchModules } from "../src/upstream-project-d.mjs";
import {
  WARMACHINE_MATCHUP_SEARCH_SCHEMA,
  buildWarmachineActivationGroups as buildLocalActivationGroups,
  classifyWarmachineSearchAction as classifyLocalAction,
  evaluateWarmachineMatchupState as evaluateLocalState,
  searchWarmachineStrictExpectiminimax as searchLocalExpectiminimax,
  searchWarmachineStrictTurnExchangeBeam as searchLocalTurnExchange,
} from "../src/search/matchup-search-v1.mjs";

const { modules: legacyModules } = await loadLegacyReverseSearchModules({
  moduleKeys: ["matchupSearch", "playableAI"],
});
const legacyMatchup = legacyModules.matchupSearch;
const generateOptionCandidates = legacyModules.playableAI.generateOptionCandidates;
const parityCounts = { evaluate: 0, expectiminimax: 0, turnExchange: 0, activationGroups: 0, classify: 0 };
assert.equal(WARMACHINE_MATCHUP_SEARCH_SCHEMA, legacyMatchup.WARMACHINE_MATCHUP_SEARCH_SCHEMA);

function paritySemanticValue(value) {
  if (Array.isArray(value)) return value.map(paritySemanticValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "elapsedMs")
    .map(([key, entry]) => [key, paritySemanticValue(entry)]));
}

function evaluateWarmachineMatchupState(...args) {
  const local = evaluateLocalState(...args);
  const upstream = legacyMatchup.evaluateWarmachineMatchupState(...args);
  assert.deepEqual(local, upstream, `matchup evaluation parity failed for case ${parityCounts.evaluate + 1}`);
  parityCounts.evaluate += 1;
  return local;
}

function searchWarmachineStrictExpectiminimax(...args) {
  const local = searchLocalExpectiminimax(...args);
  const upstream = legacyMatchup.searchWarmachineStrictExpectiminimax(...args);
  assert.deepEqual(
    paritySemanticValue(local),
    paritySemanticValue(upstream),
    `expectiminimax parity failed for case ${parityCounts.expectiminimax + 1}`,
  );
  parityCounts.expectiminimax += 1;
  return local;
}

function searchWarmachineStrictTurnExchangeBeam(...args) {
  const local = searchLocalTurnExchange(...args);
  const upstream = legacyMatchup.searchWarmachineStrictTurnExchangeBeam(...args);
  assert.deepEqual(
    paritySemanticValue(local),
    paritySemanticValue(upstream),
    `turn-exchange parity failed for case ${parityCounts.turnExchange + 1}`,
  );
  parityCounts.turnExchange += 1;
  return local;
}

const fixturePath = resolveWarmachineHostPath(
  "data/function3-fixtures/warmachine-micro-battle-fixtures.json",
);

const fixturePack = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

function fixtureState(fixtureId) {
  const fixture = fixturePack.fixtures.find((entry) => entry.fixtureId === fixtureId);
  assert.ok(fixture, `missing fixture ${fixtureId}`);
  return structuredClone(fixture.state || fixture.initialState);
}

const results = [];

function record(name, fn) {
  try {
    const details = fn();
    results.push({ name, ok: true, details });
  } catch (error) {
    results.push({
      name,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

record("unit placement risk evaluates every model destination", () => {
  const state = fixtureState("micro_unit_placement_advance_lateral_coherency");
  Object.assign(state.pieces.find((piece) => piece.pieceKey === "leader"), {
    label: "Unit Trooper A",
    role: "trooper",
  });
  Object.assign(state.pieces.find((piece) => piece.pieceKey === "enemy"), {
    position: { xIn: 25, yIn: 13 },
    speedIn: 6,
    meleeRangeIn: 1,
    meleePower: 20,
    armor: 16,
    boxesRemaining: 8,
    maxBoxes: 8,
  });
  const actionKey = "leader:advance:center:placement:lateral-coherency:v1";
  const options = generateOptionCandidates(state, { skipFeatureTransitionPreview: true });
  const candidates = options.filter((option) => option.firstPrimitiveAction.actionKey === actionKey);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((candidate) => candidate.family !== "threat_safe_reposition"));
  const candidate = candidates[0];
  assert.ok(candidate.estimatedStateDelta.counterplayThreatAfter > 0);
  assert.ok(candidate.estimatedStateDelta.counterplayThreatPenalty > 2);
  assert.equal(candidate.estimatedStateDelta.threatSubjectCount, 2);
  assert.ok(candidate.estimatedStateDelta.threatenedPlacementPieceKeys.includes("grunt"));
  assert.ok(candidate.estimatedStateDelta.replyThreatRowsAfter.some((row) =>
    row.enemyPieceKey === "enemy" && row.targetPieceKey === "grunt" && row.modes.includes("basic_charge")));
  return {
    family: candidate.family,
    counterplayThreatBefore: candidate.estimatedStateDelta.counterplayThreatBefore,
    counterplayThreatAfter: candidate.estimatedStateDelta.counterplayThreatAfter,
    counterplayThreatPenalty: candidate.estimatedStateDelta.counterplayThreatPenalty,
    threatenedPlacementPieceKeys: candidate.estimatedStateDelta.threatenedPlacementPieceKeys,
  };
});

record("state utility rewards a multi-model buff more than hoarding its resource cost", () => {
  const state = {
    stateKey: "support-effect-utility",
    activeSideKey: "player1",
    pieces: [
      { pieceKey: "caster", sideKey: "player1", label: "Caster", position: { xIn: 10, yIn: 10 }, resourcePoints: 2, boxesRemaining: 10, maxBoxes: 10 },
      { pieceKey: "ally-a", sideKey: "player1", label: "Ally A", position: { xIn: 12, yIn: 10 }, boxesRemaining: 5, maxBoxes: 5 },
      { pieceKey: "ally-b", sideKey: "player1", label: "Ally B", position: { xIn: 14, yIn: 10 }, boxesRemaining: 5, maxBoxes: 5 },
      { pieceKey: "enemy-a", sideKey: "player2", label: "Enemy A", position: { xIn: 36, yIn: 36 }, boxesRemaining: 10, maxBoxes: 10 },
      { pieceKey: "enemy-b", sideKey: "player2", label: "Enemy B", position: { xIn: 38, yIn: 36 }, boxesRemaining: 5, maxBoxes: 5 },
      { pieceKey: "enemy-c", sideKey: "player2", label: "Enemy C", position: { xIn: 40, yIn: 36 }, boxesRemaining: 5, maxBoxes: 5 },
    ],
  };
  const before = evaluateWarmachineMatchupState(state, { perspectiveSideKey: "player1" });
  const afterState = structuredClone(state);
  afterState.pieces.find((piece) => piece.pieceKey === "caster").resourcePoints = 0;
  for (const piece of afterState.pieces.filter((entry) => entry.sideKey === "player1")) {
    piece.activeSupportEffects = [{
      active: true,
      spellName: "Defensive Formation",
      effects: [{ effectType: "stat_modifier", stat: "ARM", amount: 2 }],
    }];
  }
  const after = evaluateWarmachineMatchupState(afterState, { perspectiveSideKey: "player1" });
  assert.ok(after.score > before.score);
  assert.ok(after.breakdown.conditions > before.breakdown.conditions);
  return {
    before: before.score,
    after: after.score,
    resourceDelta: after.breakdown.resources - before.breakdown.resources,
    conditionDelta: after.breakdown.conditions - before.breakdown.conditions,
  };
});

record("broad search preserves action families and scores only at a completed activation boundary", () => {
  const state = fixtureState("micro_unit_placement_advance_lateral_coherency");
  const search = searchWarmachineStrictTurnExchangeBeam(state, {
    perspectiveSideKey: state.activeSideKey,
    beamWidth: 4,
    maxRootBranchesForReply: 4,
    maxActionsPerTurn: 8,
    maxTransitionAttempts: 500,
    chanceSamples: 1,
    actionLimit: 5,
    activationGroupLimit: 1,
    actionSelectionMode: "diverse",
    activationHorizon: 1,
    searchSeed: "strict-search-complete-activation-boundary",
  });
  const rootAudit = search.pruningAudit?.[0];
  assert.equal(search.algorithm, "strict_activation_boundary_beam_v1");
  assert.equal(search.rootActivationCompleted, true);
  assert.equal(search.rootTurnCompleted, false);
  assert.equal(search.opponentReplyCompleted, false);
  assert.ok(search.principalVariation.length >= 1);
  assert.ok(search.principalVariation.at(-1).eventTypes.includes("activation_complete"));
  assert.equal(search.principalVariation.at(-1).activationBoundaryReached, true);
  assert.equal(search.incompleteActivationLeafCount, 0);
  assert.ok(rootAudit);
  assert.ok(rootAudit.selectedActionFamilies.includes("run"));
  assert.ok(rootAudit.selectedActionFamilies.includes("advance"));
  assert.ok(rootAudit.selectedActionFamilies.includes("aim"));
  assert.ok(rootAudit.selectedActionFamilies.includes("completion"));
  assert.ok(rootAudit.prunedActionCount > 0);
  return {
    selectedActionFamilies: rootAudit.selectedActionFamilies,
    principalVariationLength: search.principalVariation.length,
    finalStopReason: search.rootTurnBranches[0]?.stopReason,
    strictTransitions: search.strictExecution.acceptedTransitions,
  };
});

record("forced aim continuation cannot be evaluated before the unit finishes its activation", () => {
  const state = fixtureState("micro_unit_placement_advance_lateral_coherency");
  const unitLeader = state.pieces.find((piece) => piece.pieceKey === "leader");
  for (let index = 2; index <= 3; index += 1) {
    state.pieces.splice(state.pieces.length - 1, 0, {
      ...structuredClone(unitLeader),
      pieceKey: `grunt-${index}`,
      position: { xIn: 10 + (index % 3) * 1.2, yIn: 10 + Math.floor(index / 3) * 1.2 },
      boxesRemaining: 1,
    });
  }
  const search = searchWarmachineStrictTurnExchangeBeam(state, {
    perspectiveSideKey: state.activeSideKey,
    beamWidth: 2,
    maxRootBranchesForReply: 2,
    maxActionsPerTurn: 12,
    maxTransitionAttempts: 500,
    chanceSamples: 1,
    actionLimit: 5,
    activationGroupLimit: 1,
    actionSelectionMode: "diverse",
    activationHorizon: 1,
    rootActionKey: "leader:unit-group-aim:v1",
    searchSeed: "strict-search-forced-aim-complete-activation",
  });
  assert.equal(search.principalVariation[0].actionKey, "leader:unit-group-aim:v1");
  assert.ok(search.principalVariation.length > 1);
  assert.equal(search.rootActivationCompleted, true);
  assert.equal(search.principalVariation.at(-1).activationBoundaryReached, true);
  assert.ok(search.principalVariation.at(-1).eventTypes.includes("activation_complete"));
  assert.ok(search.stats.commutativeContinuationCollapses > 0);
  assert.ok(search.stats.commutativeContinuationAlternativesCollapsed > 0);
  assert.equal(search.incompleteActivationLeafCount, 0);
  return {
    principalVariation: search.principalVariation.map((step) => step.actionType),
    expectedStateAdvantage: search.expectedStateAdvantage,
    commutativeContinuationCollapses: search.stats.commutativeContinuationCollapses,
    commutativeContinuationAlternativesCollapsed: search.stats.commutativeContinuationAlternativesCollapsed,
  };
});

record("mandatory random straight movement completes through the bot-seat RNG harness", () => {
  const selfPropelledText = "This model cannot forfeit its Normal Movement. When this model makes its Normal Movement, instead of moving it normally you must choose the direction it is moving. It then advances its SPD +d6 in a straight line. On a roll of 6, instead of moving this model explodes with the same effect as Explosive Decomposition and is removed from play.";
  const state = {
    stateKey: "strict-search-mandatory-random-movement",
    strictMode: true,
    ruleAtomRuntimeMode: "authoritative",
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 1,
    board: { widthIn: 48, heightIn: 48 },
    terrain: [],
    scenario: { zones: [], flags: [], score: { player1: 0, player2: 0 }, victoryThreshold: 5 },
    pieces: [{
      pieceKey: "self-propelled-search-model",
      label: "Self-Propelled Search Model",
      sideKey: "player1",
      modelRole: "warrior",
      modelType: "solo",
      traits: ["living", "warrior"],
      position: { xIn: 24, yIn: 24 },
      baseSizeIn: 1.18,
      speedIn: 6,
      meleeRangeIn: 1,
      defense: 10,
      armor: 12,
      mat: 7,
      damage: { boxesRemaining: 10, maxBoxes: 10 },
      boxesRemaining: 10,
      maxBoxes: 10,
      statusTags: [],
      specialRules: [{
        id: "d7348c40-ed1e-45cc-816d-bad75fd074f6",
        sourceId: "d7348c40-ed1e-45cc-816d-bad75fd074f6",
        sourceIds: ["d7348c40-ed1e-45cc-816d-bad75fd074f6"],
        sourceTexts: [selfPropelledText],
        ruleKey: "unmapped_self_propelled",
        name: "Self-Propelled",
        description: selfPropelledText,
      }],
      attackProfiles: [],
    }],
  };
  const rootActionKey = "self-propelled-search-model:mandatory-random-straight-normal-movement:direction-000:v1";
  const search = searchWarmachineStrictTurnExchangeBeam(state, {
    perspectiveSideKey: "player1",
    beamWidth: 2,
    maxRootBranchesForReply: 2,
    maxActionsPerTurn: 8,
    maxPrimitiveActionsPerTurn: 32,
    maxTransitionAttempts: 200,
    chanceSamples: 1,
    actionLimit: 10,
    activationGroupLimit: 1,
    activationHorizon: 1,
    rootActivationGroupKey: "self-propelled-search-model",
    rootActionKey,
    freeBookkeepingActionBudget: true,
    searchSeed: "strict-search-mandatory-random-movement",
  });
  assert.equal(search.principalVariation[0]?.actionKey, rootActionKey);
  assert.equal(search.rootActivationCompleted, true);
  assert.equal(search.strictExecution.rejectedTransitions, 0);
  assert.deepEqual(search.strictRejectionAudit, []);
  assert.ok(search.principalVariation[0]?.eventTypes.some((eventType) =>
    eventType === "mandatory_random_straight_normal_movement_resolved" ||
    eventType === "mandatory_random_straight_movement_replaced_by_explosion"));
  return {
    principalVariation: search.principalVariation.map((step) => step.actionType),
    strictTransitions: search.strictExecution.acceptedTransitions,
  };
});

record("strict expectiminimax rejects a greedy scenario trap after opponent reply", () => {
  const state = {
    stateKey: "strict-search-scenario-trap",
    strictMode: true,
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 1,
    board: { widthIn: 48, heightIn: 48 },
    scenario: {
      scoringStartTurnNumber: 99,
      zones: [{ zoneKey: "trap-zone", xIn: 21, yIn: 24, radiusIn: 1, controlPoints: 2 }],
    },
    pieces: [
      {
        pieceKey: "runner",
        label: "Scenario Runner",
        sideKey: "player1",
        position: { xIn: 10, yIn: 24 },
        baseSizeIn: 1.18,
        speedIn: 6,
        defense: 10,
        armor: 12,
        boxesRemaining: 5,
        maxBoxes: 5,
      },
      {
        pieceKey: "hunter",
        label: "Enemy Hunter",
        sideKey: "player2",
        position: { xIn: 23, yIn: 24 },
        baseSizeIn: 1.18,
        speedIn: 6,
        meleeRangeIn: 1,
        mat: 20,
        meleePower: 20,
        defense: 12,
        armor: 18,
        boxesRemaining: 10,
        maxBoxes: 10,
      },
    ],
  };
  const actionFilter = (action, nodeState) => {
    if (String(action.actionType).startsWith("end_") || action.actionType === "end_turn") return true;
    if (nodeState.phaseKey !== "activation") return true;
    if (nodeState.activeSideKey === "player1") {
      return action.actionType === "pass" ||
        (action.actionType === "run" && action.actionKey.includes(":run:center:"));
    }
    return ["pass", "melee_attack", "advance_then_melee_attack", "charge"].includes(action.actionType);
  };
  const shared = {
    perspectiveSideKey: "player1",
    maxNodes: 5_000,
    chanceSamples: 1,
    actionFilter,
    searchSeed: "strict-search-scenario-trap",
  };
  const shallow = searchWarmachineStrictExpectiminimax(state, { ...shared, maxDepth: 1 });
  const replyAware = searchWarmachineStrictExpectiminimax(state, { ...shared, maxDepth: 7 });
  const turnExchange = searchWarmachineStrictTurnExchangeBeam(state, {
    ...shared,
    beamWidth: 2,
    maxRootBranchesForReply: 2,
    maxActionsPerTurn: 10,
    maxTransitionAttempts: 500,
    actionLimit: 0,
    activationGroupLimit: 0,
  });
  const forcedRiskyTurnExchange = searchWarmachineStrictTurnExchangeBeam(state, {
    ...shared,
    beamWidth: 1,
    maxRootBranchesForReply: 1,
    maxActionsPerTurn: 10,
    maxTransitionAttempts: 500,
    actionLimit: 0,
    activationGroupLimit: 1,
    rootActivationGroupKey: "runner",
    rootActionKey: "runner:run:center:v1",
  });
  assert.equal(shallow.schemaVersion, WARMACHINE_MATCHUP_SEARCH_SCHEMA);
  assert.equal(shallow.principalVariation[0].actionKey, "runner:run:center:v1");
  assert.equal(replyAware.principalVariation[0].actionKey, "runner:pass:v1");
  const risky = replyAware.rankedRootActions.find((action) => action.actionKey === "runner:run:center:v1");
  assert.ok(risky);
  assert.ok(risky.value < replyAware.expectedStateAdvantage);
  assert.equal(replyAware.strictExecution.rejectedTransitions, 0);
  assert.equal(replyAware.boundedTreeComplete, true);
  assert.equal(replyAware.globalOptimalityProven, false);
  assert.equal(turnExchange.algorithm, "strict_two_turn_adversarial_beam_v1");
  assert.equal(turnExchange.principalVariation[0].actionKey, "runner:pass:v1");
  assert.ok(turnExchange.principalVariation.some((step) => step.sideKey === "player2"));
  assert.equal(turnExchange.strictExecution.rejectedTransitions, 0);
  assert.equal(turnExchange.boundedTreeComplete, true);
  assert.equal(forcedRiskyTurnExchange.principalVariation[0].actionKey, "runner:run:center:v1");
  assert.equal(forcedRiskyTurnExchange.principalVariation[0].executedAction.actionKey, "runner:run:center:v1");
  assert.ok(forcedRiskyTurnExchange.principalVariation[0].events.some((event) => event.eventType === "move"));
  assert.notEqual(
    forcedRiskyTurnExchange.principalVariation[0].stateFingerprintBefore,
    forcedRiskyTurnExchange.principalVariation[0].stateFingerprintAfter,
  );
  assert.equal(forcedRiskyTurnExchange.initialStateSnapshot.pieces.length, 2);
  assert.equal(forcedRiskyTurnExchange.finalStateSnapshot.stateFingerprint,
    forcedRiskyTurnExchange.principalVariation.at(-1).stateFingerprintAfter);
  assert.ok(forcedRiskyTurnExchange.expectedStateAdvantage < turnExchange.expectedStateAdvantage);
  assert.equal(forcedRiskyTurnExchange.strictExecution.rejectedTransitions, 0);
  return {
    shallowChoice: shallow.principalVariation[0].actionKey,
    replyAwareChoice: replyAware.principalVariation[0].actionKey,
    shallowValue: shallow.expectedStateAdvantage,
    replyAwareValue: replyAware.expectedStateAdvantage,
    riskyReplyValue: risky.value,
    strictTransitions: replyAware.strictExecution.acceptedTransitions,
    turnExchangeChoice: turnExchange.principalVariation[0].actionKey,
    turnExchangeStrictTransitions: turnExchange.strictExecution.acceptedTransitions,
    forcedRiskyTurnExchangeValue: forcedRiskyTurnExchange.expectedStateAdvantage,
  };
});

const report = {
  schemaVersion: "warmachine_matchup_search_verifier_report_v1",
  generatedAt: new Date().toISOString(),
  ok: results.every((result) => result.ok),
  results,
};

const outputPath = path.join(
  process.cwd(),
  "build",
  "warmachine-ai",
  "sepsira-swarm-vs-fane-v20260805",
  "strict-matchup-search-v1-verifier.json",
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

const helperState = fixtureState("micro_unit_placement_advance_lateral_coherency");
assert.deepEqual(
  buildLocalActivationGroups(helperState),
  legacyMatchup.buildWarmachineActivationGroups(helperState),
);
parityCounts.activationGroups += 1;
const helperAction = { actionType: "ranged_attack", actorPieceKey: "actor", targetPieceKey: "target" };
assert.deepEqual(classifyLocalAction(helperAction), legacyMatchup.classifyWarmachineSearchAction(helperAction));
parityCounts.classify += 1;

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_matchup_search_parity_v1",
  parityCounts,
}, null, 2));
