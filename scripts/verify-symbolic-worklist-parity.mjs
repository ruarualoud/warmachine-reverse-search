import assert from "node:assert/strict";

import { regressWarmachineTerminalThroughRuleAtoms } from "../src/reverse/rule-regression-v1.mjs";
import {
  buildWarmachineSymbolicReverseWorklist as buildLocalWorklist,
  evaluateWarmachineSymbolicReverseFrontierMeet as evaluateLocalFrontierMeet,
  evaluateWarmachineSymbolicReverseWorklist as evaluateLocalWorklist,
} from "../src/reverse/symbolic-worklist-v1.mjs";
import { loadLegacyReverseSearchModules } from "../src/upstream-project-d.mjs";
import { warmachineRulesetBaselineV1 } from "../src/contracts/ruleset-baseline-v1.mjs";

const { modules: legacyModules } = await loadLegacyReverseSearchModules();
const legacySymbolic = legacyModules.symbolicWorklist;
const parityCounts = { build: 0, evaluate: 0, frontierMeet: 0 };

function buildWarmachineSymbolicReverseWorklist(...args) {
  const local = buildLocalWorklist(...args);
  const upstream = legacySymbolic.buildWarmachineSymbolicReverseWorklist(...args);
  assert.deepEqual(local, upstream, `symbolic worklist build parity failed for case ${parityCounts.build + 1}`);
  parityCounts.build += 1;
  return local;
}

function evaluateWarmachineSymbolicReverseWorklist(...args) {
  const local = evaluateLocalWorklist(...args);
  const upstream = legacySymbolic.evaluateWarmachineSymbolicReverseWorklist(...args);
  assert.deepEqual(local, upstream, `symbolic worklist evaluation parity failed for case ${parityCounts.evaluate + 1}`);
  parityCounts.evaluate += 1;
  return local;
}

function evaluateWarmachineSymbolicReverseFrontierMeet(...args) {
  const local = evaluateLocalFrontierMeet(...args);
  const upstream = legacySymbolic.evaluateWarmachineSymbolicReverseFrontierMeet(...args);
  assert.deepEqual(local, upstream, `symbolic frontier meet parity failed for case ${parityCounts.frontierMeet + 1}`);
  parityCounts.frontierMeet += 1;
  return local;
}

const KILLING_SPREE = {
  id: "b822fd0d-9ffd-4f39-a4a5-8f2925c817c7",
  ruleKey: "unmapped_killing_spree",
  name: "Killing Spree",
  description: "When this model destroys one or more enemy models with a melee attack during its Combat Action, after that attack is resolved this model can advance up to 1\" and make one additional melee attack.",
};

const SIDE_STEP = {
  id: "007b08cd-04f3-4d82-8df8-1fc41724ed6e",
  ruleKey: "unmapped_side_step",
  name: "Side Step",
  description: "When this model hits an enemy model with an initial melee attack or a melee special attack, it can advance up to 2\" after the attack is resolved.",
};

const CRITICAL_SHRED = {
  id: "267931e8-3db3-4af8-ad75-194bab0668cc",
  ruleKey: "unmapped_critical_shred",
  name: "Critical Shred",
};

const SHADOW_BIND = {
  id: "a2c16f29-08b5-49d2-bc9c-94c30841f12b",
  ruleKey: "unmapped_shadow_bind",
  name: "Shadow Bind",
  description: "The model hit by this weapon suffers Shadow Bind for one round. A model suffering Shadow Bind suffers -3 DEF, cannot advance, and Shadow Bind can be shaken.",
};

const SOUL_POWERED = {
  id: "0d9ec209-ed41-4154-96a9-b9138656e5c0",
  ruleKey: "unmapped_soul_powered",
  name: "Soul-Powered",
  description: "During its Combat Action, this model can spend soul tokens to make additional melee attacks. It can make one additional attack for each token spent.",
};

const SOUL_TAKER_COLLECTOR = {
  id: "43497737-8499-4afa-8538-444cdc978497",
  ruleKey: "unmapped_soul_taker",
  name: "Soul Taker: Collector",
  description: "This model can gain soul tokens. When a living enemy model is destroyed while within 10 inches of this model, this model gains the destroyed model's soul token. This model can have up to three soul tokens at any time. This model can spend soul tokens for the following:",
};

const GHOST_SHOT = {
  id: "067e215d-d449-4c5c-8891-90b338e7e63d",
  ruleKey: "unmapped_ghost_shot",
  name: "Ghost Shot",
  description: "This weapon ignores LOS, concealment, and cover for attacks with this weapon.",
};

const DUAL_SHOT = {
  id: "55580bd1-f29b-4080-8cc9-d8479e838d2e",
  ruleKey: "unmapped_dual_shot",
  name: "Dual Shot",
  description: "If this model uses its Normal Movement to aim, it can make one additional ranged attack this activation.",
};

const INSTABILITY_EQUATION = {
  id: "f2192fca-de05-4574-a26e-367e3b4aa085",
  ruleKey: "unmapped_instability_equation",
  name: "Instability Equation",
  description: "Target friendly warjack stands up and is no longer stationary. If the warjack was suffering Disruption, it is no longer disrupted. The warjack gains up to 3 focus points and gains Unstable for one turn. (At the end of an activation in which a model with Unstable spent more than 1 focus point, roll a d6. If the roll is equal to or less than the number of focus points spent, the model with Unstable explodes and other models within 3\" of it suffer an unboostable POW 14 blast damage roll. Remove the model with Unstable from play.)",
};

function piece(overrides = {}) {
  return {
    pieceKey: overrides.pieceKey,
    label: overrides.pieceKey,
    sideKey: overrides.sideKey || "player1",
    modelRole: overrides.modelRole || "warrior",
    position: overrides.position || { xIn: 5, yIn: 5 },
    meleeRangeIn: overrides.meleeRangeIn ?? 1,
    damage: { boxesRemaining: overrides.boxesRemaining ?? 1, maxBoxes: overrides.boxesRemaining ?? 1 },
    specialRules: overrides.specialRules || [],
    advantages: overrides.advantages || [],
    ...overrides,
  };
}

const actor = piece({
  pieceKey: "actor",
  position: { xIn: 5, yIn: 5 },
  specialRules: [KILLING_SPREE],
  boxesRemaining: 8,
  resourcePoints: 1,
  resourceMax: 1,
});
const leader = piece({
  pieceKey: "leader",
  sideKey: "player2",
  modelRole: "warlock",
  position: { xIn: 7.5, yIn: 5 },
  boxesRemaining: 2,
});
const toughBridge = piece({
  pieceKey: "tough-bridge",
  sideKey: "player2",
  position: { xIn: 5, yIn: 6 },
  advantages: ["Tough"],
});
const plainBridge = piece({
  pieceKey: "plain-bridge",
  sideKey: "player2",
  position: { xIn: 6, yIn: 5 },
});
const state = { pieces: [actor, leader, toughBridge, plainBridge] };
const assassinationTemplate = {
  templateKey: "symbolic-killing-spree-terminal",
  goalType: "assassination",
  attackerSideKey: "player1",
  defenderSideKey: "player2",
  attackerPieceKey: "actor",
  targetPieceKey: "leader",
  targetBoxesBeforeFinal: 2,
  attackMode: "melee",
  attackProfile: { profileKey: "claw", mode: "melee", rangeIn: 1 },
  probability: { singleAttackKillProbability: 0.5, boundKind: "screening_estimate_not_rules_authority" },
  reachability: { minimumFriendlyTurns: 3, terminalRangeIn: 1, finalTurnThreatIn: 8, setupRunIn: 12 },
  initialEffectiveRuleClosure: { closureKey: "closure-with-killing-spree" },
};
assassinationTemplate.reverseRuleRegression = regressWarmachineTerminalThroughRuleAtoms(state, assassinationTemplate, {
  maximumBridgeCandidates: 8,
});
const resourceBranch = {
  terminalBranchKey: "symbolic-resource-branch",
  resourceDemand: {
    resourceKind: "focus",
    total: 1,
    paymentModel: "spend_held_resource",
  },
  resourceSource: {
    sourceKind: "carry_current_resource",
    openingFeasible: true,
    strictSourceActionRequired: false,
  },
  terminalProbability: 0.5,
  probabilityBoundKind: "screening_estimate_not_rules_authority",
};
const full = buildWarmachineSymbolicReverseWorklist(state, assassinationTemplate, resourceBranch, {
  horizonFriendlyTurns: 3,
  maximumNodes: 64,
});
assert.equal(full.counts.terminalAlternativeCount, 3);
assert.equal(full.counts.selectedTerminalAlternativeCount, 3);
assert.equal(full.counts.symbolicPredecessorStateCount, 9);
assert.equal(full.counts.frontierCount, 3);
assert.equal(full.counts.remainingRuleAlternativeCount, 0);
assert.equal(full.counts.nodeBudgetUnresolvedExpansionCount, 0);
assert.equal(full.finiteContract.worklistCompleteForDeclaredOperators, true);
assert.equal(full.finiteContract.inverseRulesV1StateGenerated, false);
assert.equal(
  full.terminalReverseOperatorScope.registryCoverage.counts.hookOperatorCount,
  warmachineRulesetBaselineV1.reverseRegistry.hookOperatorCount,
);
assert.equal(
  full.terminalReverseOperatorScope.registryCoverage.counts.primitiveCount,
  warmachineRulesetBaselineV1.reverseRegistry.primitiveCount,
);
assert.equal(full.terminalReverseOperatorScope.registryCoverage.fullTypedObligationCoverage, true);
assert.equal(full.terminalReverseOperatorScope.registryCoverage.fullStrictExecutablePredecessorCoverage, false);
assert.equal(full.terminalReverseOperatorScope.counts.explicitSymbolicOperatorCount, 1);
assert.equal(new Set(full.nodes.map((node) => node.nodeKey)).size, full.nodes.length);
const frontierMeet = evaluateWarmachineSymbolicReverseFrontierMeet(
  state,
  assassinationTemplate,
  full,
  { resourceBranch },
);
assert.equal(frontierMeet.openingCompatible, true);
assert.ok(frontierMeet.matches.some((entry) =>
  entry.friendlyTurnsBeforeTerminal === 0 &&
  entry.predecessorKind === "killing_spree_destroy_advance_additional_melee" &&
  entry.bridgeCompatible === true));
assert.ok(!frontierMeet.matches.some((entry) =>
  entry.friendlyTurnsBeforeTerminal === 0 && entry.predecessorKind === "direct_terminal_attack"));
assert.equal(frontierMeet.strictPredecessorPathProven, false);
const rootEdges = full.edges.filter((edge) => edge.fromNodeKey === full.rootNodeKey);
assert.equal(rootEdges.length, 3);
assert.ok(rootEdges.every((edge) => edge.quantifier === "one_of"));
assert.ok(full.edges.filter((edge) => edge.relation === "requires_earlier_friendly_turn_state")
  .every((edge) => edge.quantifier === "all_required"));
const toughNode = full.nodes.find((node) =>
  node.friendlyTurnsBeforeTerminal === 0 &&
  node.constraints?.lifecycle?.bridgeTargetPieceKey === "tough-bridge");
assert.ok(toughNode);
assert.equal(toughNode.constraints.lifecycle.requiredFinalStage, "destroyed");
assert.equal(toughNode.constraints.lifecycle.toughBranchRequirement, "tough_fails_or_is_denied");
assert.equal(toughNode.constraints.lifecycle.removedFromPlayWithoutDestroyedIsInsufficient, true);
assert.equal(toughNode.constraints.ruleClosure.closureKey, "closure-with-killing-spree");
assert.equal(toughNode.constraints.chance.exactForHardPruning, false);
assert.equal(full.symbolicEvaluation.rootInterval.lowerBound, 0);
assert.equal(full.symbolicEvaluation.rootInterval.upperBound, 1);
assert.equal(full.symbolicEvaluation.rootInterval.status, "unresolved");
assert.ok(full.nodes.filter((node) => node.friendlyTurnsBeforeTerminal > 0)
  .every((node) => node.constraints.lifecycle == null && node.constraints.scenario == null &&
    node.constraints.chance.kind === "no_new_chance_at_reach_regression"));

const plainAlternativeKey = assassinationTemplate.reverseRuleRegression.alternatives.find((entry) =>
  entry.bridgeTargetPieceKey === "plain-bridge").alternativeKey;
const evidenceByNodeKey = Object.fromEntries(full.nodes
  .filter((node) => node.nodeKind === "symbolic_predecessor_state")
  .map((node) => {
    const isPlainRoute = node.alternativeKey === plainAlternativeKey;
    const isPlainTerminalLayer = isPlainRoute && node.friendlyTurnsBeforeTerminal === 0;
    return [node.nodeKey, {
      deterministicInterval: {
        lowerBound: isPlainRoute ? 1 : 0,
        upperBound: isPlainRoute ? 1 : 0,
        complete: true,
      },
      opponentResponseIntervals: [{ lowerBound: 1, upperBound: 1, complete: true }],
      opponentResponseCursorExhausted: true,
      ...(isPlainTerminalLayer ? {
        chanceOutcomes: [
          { massNumerator: 1, massDenominator: 2, interval: { lowerBound: 1, upperBound: 1, complete: true } },
          { massNumerator: 1, massDenominator: 2, interval: { lowerBound: 0, upperBound: 0, complete: true } },
        ],
        chanceCursorExhausted: true,
      } : {}),
    }];
  }));
const exactEvaluation = evaluateWarmachineSymbolicReverseWorklist(full, {
  evidenceByNodeKey,
  strictForwardAuthorityUsed: true,
});
assert.deepEqual(exactEvaluation.rootInterval, {
  lowerBound: 0.5,
  upperBound: 0.5,
  complete: true,
  status: "exact_probability_bound",
});
assert.equal(exactEvaluation.quantifierContract.opponentResponses, "min_over_exhausted_responses");
const plainTerminalNode = full.nodes.find((node) =>
  node.alternativeKey === plainAlternativeKey && node.friendlyTurnsBeforeTerminal === 0);
const adversarialEvidence = structuredClone(evidenceByNodeKey);
adversarialEvidence[plainTerminalNode.nodeKey].opponentResponseIntervals = [
  { lowerBound: 1, upperBound: 1, complete: true },
  { lowerBound: 0, upperBound: 0, complete: true },
];
const adversarialEvaluation = evaluateWarmachineSymbolicReverseWorklist(full, {
  evidenceByNodeKey: adversarialEvidence,
  strictForwardAuthorityUsed: true,
});
assert.equal(adversarialEvaluation.rootInterval.lowerBound, 0);
assert.equal(adversarialEvaluation.rootInterval.upperBound, 0);
assert.equal(adversarialEvaluation.rootInterval.status, "disproven");

const budgeted = buildWarmachineSymbolicReverseWorklist(state, assassinationTemplate, resourceBranch, {
  horizonFriendlyTurns: 3,
  maximumNodes: 4,
});
assert.ok(budgeted.counts.nodeBudgetUnresolvedExpansionCount > 0);
assert.equal(budgeted.finiteContract.worklistCompleteForDeclaredOperators, false);

const sideStepActor = piece({
  pieceKey: "side-step-actor",
  position: { xIn: 5, yIn: 5 },
  specialRules: [SIDE_STEP],
  attackProfiles: [{ profileKey: "side-step-blade", mode: "melee", rangeIn: 1 }],
  boxesRemaining: 8,
});
const sideStepLeader = piece({
  pieceKey: "side-step-leader",
  sideKey: "player2",
  modelRole: "warlock",
  position: { xIn: 7.5, yIn: 5 },
  boxesRemaining: 2,
});
const sideStepBridge = piece({
  pieceKey: "side-step-bridge",
  sideKey: "player2",
  position: { xIn: 6, yIn: 5 },
  boxesRemaining: 4,
});
const sideStepState = { pieces: [sideStepActor, sideStepLeader, sideStepBridge] };
const sideStepTemplate = {
  ...assassinationTemplate,
  templateKey: "symbolic-side-step-terminal",
  attackerPieceKey: sideStepActor.pieceKey,
  targetPieceKey: sideStepLeader.pieceKey,
  reachability: { minimumFriendlyTurns: 1, terminalRangeIn: 1, finalTurnThreatIn: 1, setupRunIn: 1 },
  initialEffectiveRuleClosure: { closureKey: "closure-with-side-step" },
};
sideStepTemplate.reverseRuleRegression = regressWarmachineTerminalThroughRuleAtoms(
  sideStepState,
  sideStepTemplate,
  { maximumBridgeCandidates: 8 },
);
const sideStepWorklist = buildWarmachineSymbolicReverseWorklist(sideStepState, sideStepTemplate, null, {
  horizonFriendlyTurns: 1,
  maximumNodes: 16,
});
const sideStepMeet = evaluateWarmachineSymbolicReverseFrontierMeet(
  sideStepState,
  sideStepTemplate,
  sideStepWorklist,
);
const sideStepMatch = sideStepMeet.matches.find((entry) =>
  entry.predecessorKind === "hit_then_optional_actor_movement_before_terminal_attack" &&
  entry.bridgeTargetPieceKey === sideStepBridge.pieceKey);
assert.ok(sideStepMatch);
assert.equal(sideStepMatch.maximumTerminalDistanceIn, 3);
assert.equal(sideStepMatch.predecessorTargetStateCompatible, true);
assert.ok(sideStepMatch.unresolvedReasons.includes("predecessor_target_state"));
assert.ok(sideStepMatch.unresolvedReasons.includes("action_sequence"));
assert.ok(!sideStepMeet.matches.some((entry) => entry.predecessorKind === "direct_terminal_attack"));

const shredActor = piece({
  pieceKey: "shred-actor",
  position: { xIn: 5, yIn: 5 },
  specialRules: [CRITICAL_SHRED],
  attackProfiles: [{ profileKey: "shred-claw", mode: "melee", rangeIn: 1 }],
  boxesRemaining: 8,
});
const healthyLeader = piece({
  pieceKey: "healthy-leader",
  sideKey: "player2",
  modelRole: "warlock",
  position: { xIn: 6, yIn: 5 },
  boxesRemaining: 18,
});
const shredState = { pieces: [shredActor, healthyLeader] };
const shredTemplate = {
  ...assassinationTemplate,
  templateKey: "symbolic-critical-shred-terminal",
  attackerPieceKey: shredActor.pieceKey,
  targetPieceKey: healthyLeader.pieceKey,
  targetBoxesBeforeFinal: 2,
  reachability: { minimumFriendlyTurns: 1, terminalRangeIn: 1, finalTurnThreatIn: 1, setupRunIn: 1 },
  initialEffectiveRuleClosure: { closureKey: "closure-with-critical-shred" },
};
shredTemplate.reverseRuleRegression = regressWarmachineTerminalThroughRuleAtoms(shredState, shredTemplate);
const shredWorklist = buildWarmachineSymbolicReverseWorklist(shredState, shredTemplate, null, {
  horizonFriendlyTurns: 1,
  maximumNodes: 8,
});
const shredMeet = evaluateWarmachineSymbolicReverseFrontierMeet(shredState, shredTemplate, shredWorklist);
const shredMatch = shredMeet.matches.find((entry) =>
  entry.predecessorKind === "critical_hit_same_target_additional_terminal_attack");
assert.ok(shredMatch);
assert.equal(shredMatch.targetHealthCompatible, true);
assert.ok(shredMatch.unresolvedReasons.includes("terminal_target_prior_damage"));
assert.ok(!shredMeet.matches.some((entry) => entry.predecessorKind === "direct_terminal_attack"));

const shadowBindActor = piece({
  pieceKey: "shadow-bind-actor",
  position: { xIn: 5, yIn: 5 },
  specialRules: [SHADOW_BIND],
  attackProfiles: [{ profileKey: "shadow-bind-blade", mode: "melee", rangeIn: 1 }],
  boxesRemaining: 8,
});
const shadowBindState = { pieces: [shadowBindActor, healthyLeader] };
const shadowBindTemplate = {
  ...shredTemplate,
  templateKey: "symbolic-shadow-bind-terminal",
  attackerPieceKey: shadowBindActor.pieceKey,
  initialEffectiveRuleClosure: { closureKey: "closure-with-shadow-bind" },
};
shadowBindTemplate.reverseRuleRegression = regressWarmachineTerminalThroughRuleAtoms(
  shadowBindState,
  shadowBindTemplate,
);
const shadowBindWorklist = buildWarmachineSymbolicReverseWorklist(
  shadowBindState,
  shadowBindTemplate,
  null,
  { horizonFriendlyTurns: 1, maximumNodes: 8 },
);
const shadowBindMeet = evaluateWarmachineSymbolicReverseFrontierMeet(
  shadowBindState,
  shadowBindTemplate,
  shadowBindWorklist,
);
const shadowBindMatch = shadowBindMeet.matches.find((entry) =>
  entry.predecessorKind === "hit_apply_terminal_status_before_terminal_attack");
assert.ok(shadowBindMatch);
assert.equal(shadowBindMatch.terminalStatusEffectCompatible, true);
assert.ok(shadowBindMatch.unresolvedReasons.includes("terminal_status_duration_and_interactions"));
assert.ok(shadowBindMatch.unresolvedReasons.includes("terminal_target_prior_damage"));
assert.ok(!shadowBindMeet.matches.some((entry) => entry.predecessorKind === "direct_terminal_attack"));

const soulCollectorActor = piece({
  pieceKey: "soul-collector-actor",
  position: { xIn: 5, yIn: 5 },
  specialRules: [SOUL_POWERED, SOUL_TAKER_COLLECTOR],
  soulTokens: 0,
  attackProfiles: [{ profileKey: "collector-claw", mode: "melee", rangeIn: 1 }],
  boxesRemaining: 8,
});
const livingSoulSource = piece({
  pieceKey: "living-soul-source",
  sideKey: "player2",
  position: { xIn: 6, yIn: 6 },
  traits: ["living"],
  generatesSoul: true,
  boxesRemaining: 4,
});
const soulState = { pieces: [soulCollectorActor, healthyLeader, livingSoulSource] };
const soulTemplate = {
  ...shredTemplate,
  templateKey: "symbolic-soul-acquisition-terminal",
  attackerPieceKey: soulCollectorActor.pieceKey,
  initialEffectiveRuleClosure: { closureKey: "closure-with-soul-powered-collector" },
};
soulTemplate.reverseRuleRegression = regressWarmachineTerminalThroughRuleAtoms(soulState, soulTemplate);
const soulWorklist = buildWarmachineSymbolicReverseWorklist(soulState, soulTemplate, null, {
  horizonFriendlyTurns: 1,
  maximumNodes: 16,
});
const soulMeet = evaluateWarmachineSymbolicReverseFrontierMeet(soulState, soulTemplate, soulWorklist);
const soulAcquisitionMatch = soulMeet.matches.find((entry) =>
  entry.predecessorKind === "destroy_soul_source_claim_token_then_fund_terminal_attack");
assert.ok(soulAcquisitionMatch);
assert.equal(soulAcquisitionMatch.resourceAcquisitionCompatible, true);
assert.equal(soulAcquisitionMatch.additionalAttackResourceCompatible, true);
assert.ok(soulAcquisitionMatch.unresolvedReasons.includes("resource_acquisition_collection_and_ordering"));
assert.ok(soulAcquisitionMatch.unresolvedReasons.includes("intermediate_collection_range"));
assert.ok(!soulMeet.matches.some((entry) => entry.predecessorKind === "token_funded_additional_terminal_attack"));

const ghostShotActor = piece({
  pieceKey: "ghost-shot-actor",
  position: { xIn: 5, yIn: 5 },
  specialRules: [GHOST_SHOT],
  attackProfiles: [{ profileKey: "ghost-shot-gun", mode: "ranged", rangeIn: 10 }],
  boxesRemaining: 8,
});
const ghostShotLeader = piece({
  pieceKey: "ghost-shot-leader",
  sideKey: "player2",
  modelRole: "warlock",
  position: { xIn: 14, yIn: 5 },
  boxesRemaining: 2,
});
const ghostShotState = { pieces: [ghostShotActor, ghostShotLeader] };
const ghostShotTemplate = {
  ...assassinationTemplate,
  templateKey: "symbolic-ghost-shot-terminal",
  attackerPieceKey: ghostShotActor.pieceKey,
  targetPieceKey: ghostShotLeader.pieceKey,
  attackMode: "ranged",
  attackProfile: { profileKey: "ghost-shot-gun", mode: "ranged", rangeIn: 10 },
  reachability: { minimumFriendlyTurns: 1, terminalRangeIn: 10, finalTurnThreatIn: 10, setupRunIn: 1 },
  initialEffectiveRuleClosure: { closureKey: "closure-with-ghost-shot" },
};
ghostShotTemplate.reverseRuleRegression = regressWarmachineTerminalThroughRuleAtoms(
  ghostShotState,
  ghostShotTemplate,
);
const ghostShotWorklist = buildWarmachineSymbolicReverseWorklist(
  ghostShotState,
  ghostShotTemplate,
  null,
  { horizonFriendlyTurns: 1, maximumNodes: 8 },
);
const ghostShotNode = ghostShotWorklist.nodes.find((node) =>
  node.nodeKind === "symbolic_predecessor_state" && node.friendlyTurnsBeforeTerminal === 0);
assert.ok(ghostShotNode);
const ghostShotOperator = ghostShotNode.constraints.terminalRuleOperators.operators.find((operator) =>
  operator.atomKey === "ghost_shot_ignore_los_cover_concealment");
assert.ok(ghostShotOperator);
assert.equal(ghostShotOperator.maturity, "terminal_constraint_operator");
assert.equal(ghostShotOperator.parameters.ignoreLineOfSight, true);
assert.equal(ghostShotNode.constraints.terminalRuleOperators.noOperatorIsAssumedActiveFromSourcePresenceAlone, true);
const ghostShotMeet = evaluateWarmachineSymbolicReverseFrontierMeet(
  ghostShotState,
  ghostShotTemplate,
  ghostShotWorklist,
);
assert.ok(ghostShotMeet.bestMatch?.unresolvedReasons.includes("terminal_constraint_operator_context"));

const dualShotActor = piece({
  pieceKey: "dual-shot-actor",
  position: { xIn: 5, yIn: 5 },
  specialRules: [DUAL_SHOT],
  attackProfiles: [{ profileKey: "dual-shot-gun", mode: "ranged", rangeIn: 10 }],
  boxesRemaining: 8,
});
const dualShotState = { pieces: [dualShotActor, healthyLeader] };
const dualShotTemplate = {
  ...shredTemplate,
  templateKey: "symbolic-dual-shot-terminal",
  attackerPieceKey: dualShotActor.pieceKey,
  attackMode: "ranged",
  attackProfile: { profileKey: "dual-shot-gun", mode: "ranged", rangeIn: 10 },
  reachability: { minimumFriendlyTurns: 1, terminalRangeIn: 10, finalTurnThreatIn: 10, setupRunIn: 1 },
  initialEffectiveRuleClosure: { closureKey: "closure-with-dual-shot" },
};
dualShotTemplate.reverseRuleRegression = regressWarmachineTerminalThroughRuleAtoms(
  dualShotState,
  dualShotTemplate,
);
const dualShotWorklist = buildWarmachineSymbolicReverseWorklist(
  dualShotState,
  dualShotTemplate,
  null,
  { horizonFriendlyTurns: 1, maximumNodes: 8 },
);
const dualShotMeet = evaluateWarmachineSymbolicReverseFrontierMeet(
  dualShotState,
  dualShotTemplate,
  dualShotWorklist,
);
const dualShotMatch = dualShotMeet.matches.find((entry) =>
  entry.predecessorKind === "activation_sequence_granted_terminal_attack");
assert.ok(dualShotMatch);
assert.equal(dualShotMatch.activationSequenceCompatible, true);
assert.ok(dualShotMatch.unresolvedReasons.includes("activation_sequence_trigger_timing_and_target"));
assert.ok(dualShotMatch.unresolvedReasons.includes("terminal_target_prior_damage"));
assert.ok(!dualShotMeet.matches.some((entry) => entry.predecessorKind === "direct_terminal_attack"));

const unstableActor = piece({
  pieceKey: "unstable-actor",
  position: { xIn: 5, yIn: 5 },
  specialRules: [INSTABILITY_EQUATION],
  boxesRemaining: 8,
});
const explosionLeader = piece({
  pieceKey: "explosion-leader",
  sideKey: "player2",
  modelRole: "warlock",
  position: { xIn: 8.5, yIn: 5 },
  boxesRemaining: 2,
});
const explosionState = { pieces: [unstableActor, explosionLeader] };
const explosionTemplate = {
  ...assassinationTemplate,
  templateKey: "symbolic-instability-explosion-terminal",
  attackerPieceKey: unstableActor.pieceKey,
  targetPieceKey: explosionLeader.pieceKey,
  attackMode: "melee",
  attackProfile: { profileKey: "ordinary-melee", mode: "melee", rangeIn: 1 },
  reachability: { minimumFriendlyTurns: 1, terminalRangeIn: 1, finalTurnThreatIn: 1, setupRunIn: 1 },
  initialEffectiveRuleClosure: { closureKey: "closure-with-instability-equation" },
};
explosionTemplate.reverseRuleRegression = regressWarmachineTerminalThroughRuleAtoms(
  explosionState,
  explosionTemplate,
);
const explosionWorklist = buildWarmachineSymbolicReverseWorklist(
  explosionState,
  explosionTemplate,
  null,
  { horizonFriendlyTurns: 1, maximumNodes: 8 },
);
const explosionMeet = evaluateWarmachineSymbolicReverseFrontierMeet(
  explosionState,
  explosionTemplate,
  explosionWorklist,
);
const explosionMatch = explosionMeet.matches.find((entry) =>
  entry.predecessorKind === "trigger_explosion_secondary_damage_terminal");
assert.ok(explosionMatch);
assert.equal(explosionMatch.terminalSecondaryDamageCompatible, true);
assert.equal(explosionMatch.sourceLifecycleCompatible, true);
assert.ok(explosionMatch.unresolvedReasons.includes("explosion_trigger_action_timing"));
assert.ok(explosionMatch.unresolvedReasons.includes("secondary_damage_batch_ordering_and_terminal"));
assert.ok(explosionMatch.unresolvedReasons.includes("post_batch_source_lifecycle"));
assert.ok(explosionMatch.unresolvedReasons.includes("predecessor_chance_mass"));
assert.ok(!explosionMeet.matches.some((entry) => entry.predecessorKind === "direct_terminal_attack"));

const scenarioTemplate = {
  templateKey: "symbolic-scenario-terminal",
  goalType: "scenario_score",
  attackerSideKey: "player1",
  defenderSideKey: "player2",
  attackerPieceKey: "actor",
  scenarioElement: { elementType: "flag", elementKey: "flag1", xIn: 24, yIn: 24, radiusIn: 4 },
  scoreBeforeTerminal: 4,
  terminalScoreGain: 1,
  victoryThreshold: 5,
  scoringStartSideKey: "player2",
  scoringStartTurnNumber: 2,
  probability: { conditionalTerminalScoreProbability: 1, boundKind: "conditional_not_opponent_adjusted" },
  reachability: { minimumFriendlyTurns: 2, terminalRangeIn: 0, finalTurnThreatIn: 11, setupRunIn: 11 },
  initialEffectiveRuleClosure: { closureKey: "scenario-scorer-closure" },
};
const scenario = buildWarmachineSymbolicReverseWorklist(state, scenarioTemplate, null, {
  horizonFriendlyTurns: 2,
  maximumNodes: 16,
});
assert.equal(scenario.counts.terminalAlternativeCount, 1);
assert.equal(scenario.counts.symbolicPredecessorStateCount, 2);
const scenarioTerminalPredecessor = scenario.nodes.find((node) => node.friendlyTurnsBeforeTerminal === 0);
assert.equal(scenarioTerminalPredecessor.predecessorKind, "scenario_control_then_score");
assert.equal(scenarioTerminalPredecessor.constraints.scenario.requiredScoreBeforeTerminal, 4);
assert.equal(scenarioTerminalPredecessor.constraints.scenario.victoryThreshold, 5);
assert.equal(scenarioTerminalPredecessor.constraints.scenario.scoringStartTurnNumber, 2);
assert.equal(scenario.quantifierContract.opponentResponses, "and_or_min_in_strict_forward_search");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_symbolic_reverse_worklist_v1",
  killingSpree: full.counts,
  budgeted: budgeted.counts,
  scenario: scenario.counts,
  symbolicIntervals: {
    unresolved: full.symbolicEvaluation.rootInterval,
    exactChance: exactEvaluation.rootInterval,
    adversarialMin: adversarialEvaluation.rootInterval,
  },
  symbolicFrontierMeet: {
    compatibleNodeCount: frontierMeet.compatibleNodeCount,
    compatibleAlternativeCount: frontierMeet.compatibleAlternativeCount,
    bestMatch: frontierMeet.bestMatch,
  },
  movementFrontierMeet: {
    compatibleNodeCount: sideStepMeet.compatibleNodeCount,
    sideStepMatch,
  },
  sameTargetHealthRegression: {
    compatibleNodeCount: shredMeet.compatibleNodeCount,
    shredMatch,
  },
  statusFrontierMeet: {
    compatibleNodeCount: shadowBindMeet.compatibleNodeCount,
    shadowBindMatch,
  },
  resourceAcquisitionFrontierMeet: {
    compatibleNodeCount: soulMeet.compatibleNodeCount,
    soulAcquisitionMatch,
  },
  terminalConstraintOperator: {
    operatorKey: ghostShotOperator.operatorKey,
    maturity: ghostShotOperator.maturity,
    unresolvedReasons: ghostShotMeet.bestMatch?.unresolvedReasons || [],
  },
  activationSequenceFrontierMeet: {
    compatibleNodeCount: dualShotMeet.compatibleNodeCount,
    dualShotMatch,
  },
  explosionFrontierMeet: {
    compatibleNodeCount: explosionMeet.compatibleNodeCount,
    explosionMatch,
  },
  claimBoundary: full.claimBoundary,
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_symbolic_worklist_parity_v1",
  parityCounts,
}, null, 2));
