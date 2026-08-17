import assert from "node:assert/strict";

import * as local from "../src/search/goal-conditioned-v1.mjs";
import { loadLegacyReverseSearchModules } from "../src/upstream-project-d.mjs";

const { modules: legacyModules } = await loadLegacyReverseSearchModules();
const legacy = legacyModules.goalConditioned;

function parity(label, localValue, upstreamValue) {
  assert.deepEqual(localValue, upstreamValue, `${label} diverged from the migration source`);
  return localValue;
}

const actor = {
  pieceKey: "actor",
  sideKey: "player1",
  label: "Synthetic Gunfighter",
  modelRole: "warjack",
  isWarjack: true,
  position: { xIn: 8, yIn: 12 },
  baseSizeIn: 1.97,
  speedIn: 6,
  mat: 7,
  rat: 7,
  defense: 12,
  armor: 18,
  boxesRemaining: 24,
  maxBoxes: 24,
  resourceKind: "focus",
  resourcePoints: 3,
  resourceMax: 3,
  attackProfiles: [{
    profileKey: "synthetic-cannon",
    name: "Synthetic Cannon",
    mode: "ranged",
    rangeIn: 12,
    power: 15,
  }],
  statusEffects: [{
    ruleKey: "granted_rule",
    sourceId: "support-a",
    durationKind: "one_round",
    usedCount: 0,
    active: true,
  }],
};
const state = {
  stateKey: "goal-conditioned-parity",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 2,
  strictMode: true,
  enforceStrictExecutor: true,
  board: { widthIn: 48, heightIn: 48 },
  terrain: [],
  pieces: [
    actor,
    {
      pieceKey: "own-leader",
      sideKey: "player1",
      label: "Own Leader",
      modelRole: "warcaster",
      isWarcaster: true,
      position: { xIn: 4, yIn: 12 },
      baseSizeIn: 1.57,
      speedIn: 6,
      defense: 15,
      armor: 16,
      boxesRemaining: 18,
      maxBoxes: 18,
    },
    {
      pieceKey: "enemy-leader",
      sideKey: "player2",
      label: "Enemy Leader",
      modelRole: "warlock",
      isWarlock: true,
      assassinationTarget: true,
      position: { xIn: 18, yIn: 12 },
      baseSizeIn: 1.57,
      speedIn: 6,
      defense: 14,
      armor: 16,
      boxesRemaining: 18,
      maxBoxes: 18,
    },
  ],
  scenario: {
    zones: [{
      zoneKey: "center-zone",
      shape: "circle",
      xIn: 24,
      yIn: 24,
      radiusIn: 6,
      controlPoints: 1,
    }],
    flags: [],
    objectives: [],
    actionObjectives: [],
    score: { player1: 0, player2: 0 },
    scoringHistory: [],
    victoryThreshold: 5,
    scoringStartSideKey: "player2",
    scoringStartTurnNumber: 2,
  },
};
const options = {
  attackerSideKey: "player1",
  horizonFriendlyTurns: 6,
  minimumSingleAttackKillProbability: 0,
  maximumTemplates: 128,
  seed: "goal-conditioned-parity-v1",
};

parity(
  "effective rule closure",
  local.canonicalWarmachineEffectiveRuleClosure(actor),
  legacy.canonicalWarmachineEffectiveRuleClosure(actor),
);
parity(
  "attack probability envelope",
  local.warmachineAttackProbabilityEnvelope(actor, state.pieces[2], actor.attackProfiles[0], {
    boostedAttack: true,
    targetBoxesBeforeFinal: 4,
  }),
  legacy.warmachineAttackProbabilityEnvelope(actor, state.pieces[2], actor.attackProfiles[0], {
    boostedAttack: true,
    targetBoxesBeforeFinal: 4,
  }),
);

const terminalSet = parity(
  "terminal template set",
  local.buildWarmachineTerminalGoalTemplates(state, options),
  legacy.buildWarmachineTerminalGoalTemplates(state, options),
);
assert.ok(terminalSet.templates.some((entry) => entry.goalType === "assassination"));
assert.ok(terminalSet.templates.some((entry) => entry.goalType === "scenario_score"));
const assassination = terminalSet.templates.find((entry) => entry.goalType === "assassination");
const scenario = terminalSet.templates.find((entry) => entry.goalType === "scenario_score");

parity(
  "Pareto pruning",
  local.paretoPruneWarmachineGoalTemplates(terminalSet.templates, 8),
  legacy.paretoPruneWarmachineGoalTemplates(terminalSet.templates, 8),
);
parity(
  "reverse reachability layers",
  local.buildWarmachineReverseReachabilityLayers(assassination, { horizonFriendlyTurns: 6 }),
  legacy.buildWarmachineReverseReachabilityLayers(assassination, { horizonFriendlyTurns: 6 }),
);
parity(
  "assassination predecessor scene",
  local.buildWarmachineTerminalPredecessorScene(state, assassination, { abstractionLevel: "full_roster" }),
  legacy.buildWarmachineTerminalPredecessorScene(state, assassination, { abstractionLevel: "full_roster" }),
);
parity(
  "scenario predecessor scene",
  local.buildWarmachineScenarioTerminalPredecessorScene(state, scenario, { abstractionLevel: "full_roster" }),
  legacy.buildWarmachineScenarioTerminalPredecessorScene(state, scenario, { abstractionLevel: "full_roster" }),
);
parity(
  "strict assassination terminal validation",
  local.validateWarmachineTerminalGoalTemplateStrict(state, assassination, {
    abstractionLevels: ["full_roster"],
    chanceSamples: 2,
    maximumPrefixDepth: 1,
    maximumPrefixStates: 4,
  }),
  legacy.validateWarmachineTerminalGoalTemplateStrict(state, assassination, {
    abstractionLevels: ["full_roster"],
    chanceSamples: 2,
    maximumPrefixDepth: 1,
    maximumPrefixStates: 4,
  }),
);
parity(
  "strict scenario terminal validation",
  local.validateWarmachineTerminalGoalTemplateStrict(state, scenario, { abstractionLevels: ["full_roster"] }),
  legacy.validateWarmachineTerminalGoalTemplateStrict(state, scenario, { abstractionLevels: ["full_roster"] }),
);

const localHooks = local.createWarmachineGoalConditionedSearchHooks(assassination);
const legacyHooks = legacy.createWarmachineGoalConditionedSearchHooks(assassination);
parity("goal hook metadata", {
  perspectiveSideKey: localHooks.perspectiveSideKey,
  stateEvaluatorLabel: localHooks.stateEvaluatorLabel,
  actionScoreLabel: localHooks.actionScoreLabel,
}, {
  perspectiveSideKey: legacyHooks.perspectiveSideKey,
  stateEvaluatorLabel: legacyHooks.stateEvaluatorLabel,
  actionScoreLabel: legacyHooks.actionScoreLabel,
});
parity("goal hook metrics", localHooks.metrics(state), legacyHooks.metrics(state));
parity(
  "goal hook state evaluator",
  localHooks.stateEvaluator(state, { defaultEvaluation: { score: 12 } }),
  legacyHooks.stateEvaluator(state, { defaultEvaluation: { score: 12 } }),
);
const sampleAction = {
  actionType: "attack",
  actorPieceKey: "actor",
  targetPieceKey: "enemy-leader",
  expectedDamage: 3,
};
assert.equal(localHooks.actionScore(sampleAction, state), legacyHooks.actionScore(sampleAction, state));

parity(
  "goal tactical signature",
  local.buildWarmachineGoalTacticalSignature(state, assassination),
  legacy.buildWarmachineGoalTacticalSignature(state, assassination),
);
const afterState = {
  ...state,
  pieces: state.pieces.map((piece) => piece.pieceKey === "actor"
    ? { ...piece, position: { xIn: 12, yIn: 12 } }
    : piece),
};
parity(
  "goal progress comparison",
  local.compareWarmachineGoalProgress(state, afterState, assassination),
  legacy.compareWarmachineGoalProgress(state, afterState, assassination),
);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_goal_conditioned_parity_v1",
  exportedCapabilityCount: 11,
  generatedTemplateCount: terminalSet.generatedCount,
  retainedTemplateCount: terminalSet.retainedCount,
  goalTypes: Array.from(new Set(terminalSet.templates.map((entry) => entry.goalType))).sort(),
}, null, 2));
