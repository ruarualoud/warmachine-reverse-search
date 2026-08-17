import assert from "node:assert/strict";

import { regressWarmachineTerminalThroughRuleAtoms as regressLocal } from "../src/reverse/rule-regression-v1.mjs";
import { loadLegacyReverseSearchModules } from "../src/upstream-project-d.mjs";

const { modules: legacyModules } = await loadLegacyReverseSearchModules();
let parityCaseCount = 0;

function regressWarmachineTerminalThroughRuleAtoms(...args) {
  const local = regressLocal(...args);
  const upstream = legacyModules.ruleRegression.regressWarmachineTerminalThroughRuleAtoms(...args);
  assert.deepEqual(local, upstream, `rule-regression parity failed for case ${parityCaseCount + 1}`);
  parityCaseCount += 1;
  return local;
}

const KILLING_SPREE = {
  id: "b822fd0d-9ffd-4f39-a4a5-8f2925c817c7",
  ruleKey: "unmapped_killing_spree",
  name: "Killing Spree",
  description: "When this model destroys one or more enemy models with a melee attack during its Combat Action, after that attack is resolved this model can advance up to 1\" and make one additional melee attack.",
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

const SNAP_FIRE = {
  id: "8f6fca67-9785-4ad3-ad6d-51d931a2be06",
  ruleKey: "unmapped_snap_fire",
  name: "Snap Fire",
  description: "When this model destroys one or more enemy models with a ranged attack with this weapon during its Combat Action, immediately after that attack is resolved this model can make one basic ranged attack with this weapon. Attacks gained from Snap Fire cannot generate additional attacks from Snap Fire.",
};

const CRITICAL_SHRED = {
  id: "267931e8-3db3-4af8-ad75-194bab0668cc",
  ruleKey: "critical_shred",
  name: "Critical Shred",
};

const RICOCHET = {
  id: "32d07dde-9664-47d8-a442-6c13cbcfb688",
  ruleKey: "ricochet",
  name: "Ricochet",
};

const OVERTAKE = {
  id: "1cd5209d-c563-48bb-84c9-3cdd827fca95",
  ruleKey: "unmapped_overtake",
  name: "Overtake",
  description: "When this model destroys one or more enemy models with a basic melee attack during its Combat Action, after the attack is resolved it can immediately advance up to 1\".",
};

const SIDE_STEP = {
  id: "007b08cd-04f3-4d82-8df8-1fc41724ed6e",
  ruleKey: "unmapped_side_step",
  name: "Side Step",
  description: "When this model hits an enemy model with an initial melee attack or a melee special attack, it can advance up to 2\" after the attack is resolved.",
};

const BEAT_BACK = {
  id: "00bf99c9-94e8-4fa0-ab50-4b622fba6921",
  ruleKey: "unmapped_beat_back",
  name: "Beat Back",
  description: "Immediately after a basic attack with this weapon is resolved during this model's Combat Action, the enemy model hit can be pushed 1\" directly away from the attacking model. After the enemy model is pushed, the attacking model can advance up to 1\" directly toward it.",
};

const SHADOW_BIND = {
  id: "a2c16f29-08b5-49d2-bc9c-94c30841f12b",
  ruleKey: "unmapped_shadow_bind",
  name: "Shadow Bind",
  description: "The model hit by this weapon suffers Shadow Bind for one round. A model suffering Shadow Bind suffers -3 DEF, cannot advance, and Shadow Bind can be shaken.",
};

const DUAL_SHOT = {
  id: "55580bd1-f29b-4080-8cc9-d8479e838d2e",
  ruleKey: "unmapped_dual_shot",
  name: "Dual Shot",
  description: "If this model uses its Normal Movement to aim, it can make one additional ranged attack this activation.",
};

const CLEAVE = {
  id: "95e7b779-42ae-4240-8117-ee09a4ffca7f",
  ruleKey: "unmapped_cleave",
  name: "Cleave",
  description: "When this model destroys one or more enemy models with a basic melee attack during its Combat Action, immediately after the attack is resolved it can make one additional melee attack. This model can make only one additional attack from Cleave each activation.",
};

const INSTABILITY_EQUATION = {
  id: "f2192fca-de05-4574-a26e-367e3b4aa085",
  ruleKey: "unmapped_instability_equation",
  name: "Instability Equation",
  description: "Target friendly warjack stands up and is no longer stationary. If the warjack was suffering Disruption, it is no longer disrupted. The warjack gains up to 3 focus points and gains Unstable for one turn. (At the end of an activation in which a model with Unstable spent more than 1 focus point, roll a d6. If the roll is equal to or less than the number of focus points spent, the model with Unstable explodes and other models within 3\" of it suffer an unboostable POW 14 blast damage roll. Remove the model with Unstable from play.)",
};

const FLYS_KISS = {
  id: "b2ff04ae-e87a-4886-a3db-63cc8b39795a",
  ruleKey: "unmapped_flys_kiss",
  name: "Fly's Kiss",
  description: "Fly's Kiss is a RNG 8 arcane attack. If this attack boxes an enemy model, models within 2 inches of the boxed model suffer an unboostable POW 10 corrosion blast damage roll, then the boxed model is removed from play.",
};

const ELECTRO_LEAP = {
  id: "1aaa64cc-a5bf-4616-a72f-89554b0b11bb",
  ruleKey: "unmapped_electro_leap",
  name: "Electro Leap",
  description: "When a model is directly hit with a basic attack made with this weapon, the nearest model within 3 inches, ignoring the attacking model and hit model, can suffer an unboostable POW 10 electrical damage roll. This damage is not considered to have been caused by an attack and is resolved simultaneously with the damage resulting from the attack.",
};

function piece(overrides = {}) {
  return {
    pieceKey: overrides.pieceKey,
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
  specialRules: [KILLING_SPREE],
  boxesRemaining: 8,
  attackProfiles: [
    { profileKey: "long-spear", mode: "melee", rangeIn: 2 },
    { profileKey: "claw", mode: "melee", rangeIn: 1 },
  ],
});
const leader = piece({ pieceKey: "leader", sideKey: "player2", modelRole: "warlock", boxesRemaining: 18 });
const toughBridge = piece({ pieceKey: "mechanithrall", sideKey: "player2", advantages: ["Undead", "Tough"] });
const plainBridge = piece({ pieceKey: "plain-bridge", sideKey: "player2" });
const state = { pieces: [actor, leader, toughBridge, plainBridge] };
const template = {
  templateKey: "killing-spree-terminal",
  goalType: "assassination",
  attackerPieceKey: "actor",
  targetPieceKey: "leader",
  attackMode: "melee",
  attackProfile: { profileKey: "claw", mode: "melee", rangeIn: 1 },
};

const full = regressWarmachineTerminalThroughRuleAtoms(state, template, { maximumBridgeCandidates: 8 });
assert.equal(full.alternativeCount, 3);
assert.equal(full.ruleDerivedAlternativeCount, 2);
assert.equal(full.cursorExhausted, true);
assert.equal(full.alternatives[0].predecessorKind, "direct_terminal_attack");
const toughRoute = full.alternatives.find((entry) => entry.bridgeTargetPieceKey === "mechanithrall");
assert.ok(toughRoute);
assert.equal(toughRoute.damageLifecycleObligation.targetHasTough, true);
assert.equal(toughRoute.damageLifecycleObligation.toughBranchRequirement, "tough_fails_or_is_denied");
assert.equal(toughRoute.previousActorPositionConstraint.bridgeTargetMaximumEdgeDistanceIn, 2);
assert.equal(toughRoute.previousActorPositionConstraint.terminalTargetMaximumEdgeDistanceBeforeAdvanceIn, 2);
assert.equal(toughRoute.previousActorPositionConstraint.terminalTargetMaximumEdgeDistanceAfterAdvanceIn, 1);
assert.equal(toughRoute.recursivePredecessorAvailable, true);

const paged = regressWarmachineTerminalThroughRuleAtoms(state, template, { maximumBridgeCandidates: 1 });
assert.equal(paged.ruleDerivedAlternativeCount, 1);
assert.equal(paged.remainingCandidateCount, 1);
assert.equal(paged.cursorExhausted, false);

const noRule = regressWarmachineTerminalThroughRuleAtoms({ pieces: [{ ...actor, specialRules: [] }, leader, toughBridge] }, template);
assert.equal(noRule.alternativeCount, 1);
assert.equal(noRule.ruleDerivedAlternativeCount, 0);

const soulActor = piece({
  pieceKey: "soul-actor",
  specialRules: [SOUL_POWERED],
  soulTokens: 2,
  boxesRemaining: 8,
});
const soulTemplate = {
  ...template,
  templateKey: "soul-powered-terminal",
  attackerPieceKey: soulActor.pieceKey,
};
const soulPowered = regressWarmachineTerminalThroughRuleAtoms({ pieces: [soulActor, leader] }, soulTemplate);
assert.equal(soulPowered.alternativeCount, 2);
const soulRoute = soulPowered.alternatives.find((entry) =>
  entry.predecessorKind === "token_funded_additional_terminal_attack");
assert.ok(soulRoute);
assert.deepEqual(soulRoute.resourceObligation.tokenKinds, ["soul"]);
assert.equal(soulRoute.resourceObligation.tokenCostPerAttack, 1);
assert.equal(soulRoute.actionSequenceObligation.requiresCompletedInitialAttackSequence, true);
assert.equal(soulRoute.actionSequenceObligation.attackKind, "melee");
assert.equal(soulPowered.operatorAudit.some((entry) =>
  entry.primitiveKey === "combat_action_token_additional_attack"), true);

const soulCollectorActor = piece({
  pieceKey: "soul-collector-actor",
  specialRules: [SOUL_POWERED, SOUL_TAKER_COLLECTOR],
  soulTokens: 0,
  boxesRemaining: 8,
  attackProfiles: [{ profileKey: "collector-claw", mode: "melee", rangeIn: 1 }],
});
const soulSource = piece({
  pieceKey: "living-soul-source",
  sideKey: "player2",
  traits: ["living"],
  generatesSoul: true,
  boxesRemaining: 4,
});
const soulAcquisition = regressWarmachineTerminalThroughRuleAtoms(
  { pieces: [soulCollectorActor, leader, soulSource] },
  { ...template, templateKey: "soul-acquisition-terminal", attackerPieceKey: soulCollectorActor.pieceKey },
);
const soulAcquisitionRoute = soulAcquisition.alternatives.find((entry) =>
  entry.predecessorKind === "destroy_soul_source_claim_token_then_fund_terminal_attack");
assert.ok(soulAcquisitionRoute);
assert.equal(soulAcquisitionRoute.bridgeTargetPieceKey, soulSource.pieceKey);
assert.equal(soulAcquisitionRoute.resourceAcquisitionObligation.collectionRangeIn, 10);
assert.equal(soulAcquisitionRoute.resourceAcquisitionObligation.maximumTokenCount, 3);
assert.equal(soulAcquisitionRoute.resourceAcquisitionObligation.nearestEligibleCollectorMustBeActor, true);
assert.equal(soulAcquisitionRoute.damageLifecycleObligation.requiredFinalStage, "destroyed");
assert.equal(soulAcquisitionRoute.additionalAttackResourceCanBeAcquired, true);

const rangedTemplate = {
  ...template,
  templateKey: "generated-ranged-terminal",
  attackMode: "ranged",
  attackProfile: { profileKey: "gun", mode: "ranged", rangeIn: 10 },
};
const rangedBridge = piece({ pieceKey: "ranged-bridge", sideKey: "player2", boxesRemaining: 1 });
const snapActor = piece({ pieceKey: "snap-actor", specialRules: [SNAP_FIRE], boxesRemaining: 8 });
const snap = regressWarmachineTerminalThroughRuleAtoms(
  { pieces: [snapActor, leader, rangedBridge] },
  { ...rangedTemplate, attackerPieceKey: snapActor.pieceKey },
);
const snapRoute = snap.alternatives.find((entry) =>
  entry.predecessorKind === "destroy_generated_same_weapon_terminal_attack");
assert.ok(snapRoute);
assert.equal(snapRoute.bridgeTargetPieceKey, rangedBridge.pieceKey);
assert.equal(snapRoute.damageLifecycleObligation.requiredFinalStage, "destroyed");
assert.equal(snapRoute.actionSequenceObligation.sameWeaponRequired, true);
assert.equal(snapRoute.actionSequenceObligation.recursiveTriggerAllowed, false);

const shredActor = piece({ pieceKey: "shred-actor", specialRules: [CRITICAL_SHRED], boxesRemaining: 8 });
const shred = regressWarmachineTerminalThroughRuleAtoms(
  { pieces: [shredActor, leader] },
  { ...template, templateKey: "critical-shred-terminal", attackerPieceKey: shredActor.pieceKey },
);
const shredRoute = shred.alternatives.find((entry) =>
  entry.predecessorKind === "critical_hit_same_target_additional_terminal_attack");
assert.ok(shredRoute);
assert.equal(shredRoute.predecessorTargetPieceKey, leader.pieceKey);
assert.equal(shredRoute.predecessorChanceObligation.requiredOutcome, "critical_hit");

const ricochetActor = piece({ pieceKey: "ricochet-actor", specialRules: [RICOCHET], boxesRemaining: 8 });
const ricochet = regressWarmachineTerminalThroughRuleAtoms(
  { pieces: [ricochetActor, leader, rangedBridge] },
  { ...rangedTemplate, templateKey: "ricochet-terminal", attackerPieceKey: ricochetActor.pieceKey },
);
const ricochetRoute = ricochet.alternatives.find((entry) =>
  entry.predecessorKind === "hit_generated_ricochet_terminal_attack");
assert.ok(ricochetRoute);
assert.equal(ricochetRoute.bridgeTargetPieceKey, rangedBridge.pieceKey);
assert.equal(ricochetRoute.previousActorPositionConstraint.bridgeToTerminalMaximumEdgeDistanceIn, 4);
assert.equal(ricochetRoute.previousActorPositionConstraint.ignoreActorToTerminalRange, true);

const movementBridge = piece({ pieceKey: "movement-bridge", sideKey: "player2", boxesRemaining: 4 });
const overtakeActor = piece({
  pieceKey: "overtake-actor",
  specialRules: [OVERTAKE],
  boxesRemaining: 8,
  attackProfiles: [
    { profileKey: "overtake-spear", mode: "melee", rangeIn: 2 },
    { profileKey: "overtake-claw", mode: "melee", rangeIn: 1 },
  ],
});
const overtake = regressWarmachineTerminalThroughRuleAtoms(
  { pieces: [overtakeActor, leader, movementBridge] },
  { ...template, templateKey: "overtake-terminal", attackerPieceKey: overtakeActor.pieceKey },
);
const overtakeRoute = overtake.alternatives.find((entry) =>
  entry.predecessorKind === "destroy_then_optional_actor_movement_before_terminal_attack");
assert.ok(overtakeRoute);
assert.equal(overtakeRoute.bridgeTargetPieceKey, movementBridge.pieceKey);
assert.equal(overtakeRoute.previousActorPositionConstraint.bridgeTargetMaximumEdgeDistanceIn, 2);
assert.equal(overtakeRoute.previousActorPositionConstraint.terminalTargetMaximumEdgeDistanceBeforeAdvanceIn, 2);
assert.equal(overtakeRoute.actionSequenceObligation.subsequentAttackEntitlementRequired, true);

const sideStepActor = piece({
  pieceKey: "side-step-actor",
  specialRules: [SIDE_STEP],
  boxesRemaining: 8,
  attackProfiles: [{ profileKey: "side-step-blade", mode: "melee", rangeIn: 1 }],
});
const sideStep = regressWarmachineTerminalThroughRuleAtoms(
  { pieces: [sideStepActor, leader, movementBridge] },
  { ...template, templateKey: "side-step-terminal", attackerPieceKey: sideStepActor.pieceKey },
);
const sideStepRoute = sideStep.alternatives.find((entry) =>
  entry.predecessorKind === "hit_then_optional_actor_movement_before_terminal_attack" &&
  entry.bridgeTargetPieceKey === movementBridge.pieceKey);
assert.ok(sideStepRoute);
assert.equal(sideStepRoute.previousActorPositionConstraint.maximumAdvanceIn, 2);
assert.equal(sideStepRoute.predecessorTargetStateObligation.targetMustSurvivePriorAttack, true);
assert.equal(sideStepRoute.predecessorChanceObligation.requiredOutcome, "prior_attack_hits_enemy");

const beatBackActor = piece({
  pieceKey: "beat-back-actor",
  specialRules: [BEAT_BACK],
  boxesRemaining: 8,
  attackProfiles: [{ profileKey: "beat-back-blade", mode: "melee", rangeIn: 1 }],
});
const beatBack = regressWarmachineTerminalThroughRuleAtoms(
  { pieces: [beatBackActor, leader, movementBridge] },
  { ...template, templateKey: "beat-back-terminal", attackerPieceKey: beatBackActor.pieceKey },
);
const beatBackRoute = beatBack.alternatives.find((entry) =>
  entry.predecessorKind === "basic_hit_push_follow_before_terminal_attack" &&
  entry.bridgeTargetPieceKey === movementBridge.pieceKey);
assert.ok(beatBackRoute);
assert.equal(beatBackRoute.previousActorPositionConstraint.bridgeTargetMaximumEdgeDistanceIn, null);
assert.equal(beatBackRoute.previousActorPositionConstraint.exactDirectionalLandingRequired, true);
assert.equal(beatBackRoute.predecessorTargetStateObligation.actualPushRequiredBeforeFollow, true);

const shadowBindActor = piece({
  pieceKey: "shadow-bind-actor",
  specialRules: [SHADOW_BIND],
  boxesRemaining: 8,
  attackProfiles: [{ profileKey: "shadow-bind-blade", mode: "melee", rangeIn: 1 }],
});
const shadowBind = regressWarmachineTerminalThroughRuleAtoms(
  { pieces: [shadowBindActor, leader] },
  { ...template, templateKey: "shadow-bind-terminal", attackerPieceKey: shadowBindActor.pieceKey },
);
const shadowBindRoute = shadowBind.alternatives.find((entry) =>
  entry.predecessorKind === "hit_apply_terminal_status_before_terminal_attack");
assert.ok(shadowBindRoute);
assert.equal(shadowBindRoute.predecessorTargetPieceKey, leader.pieceKey);
assert.equal(shadowBindRoute.terminalTargetMayHavePriorDamage, true);
assert.deepEqual(shadowBindRoute.terminalStatusEffectObligation.statusTags, ["shadow_bind"]);
assert.equal(shadowBindRoute.terminalStatusEffectObligation.statusProperties.defenseDelta, -3);
assert.equal(shadowBindRoute.terminalStatusEffectObligation.durationKind, "one_round");

const dualShotActor = piece({
  pieceKey: "dual-shot-actor",
  specialRules: [DUAL_SHOT],
  boxesRemaining: 8,
  attackProfiles: [{ profileKey: "dual-shot-gun", mode: "ranged", rangeIn: 10 }],
});
const dualShot = regressWarmachineTerminalThroughRuleAtoms(
  { pieces: [dualShotActor, leader] },
  { ...rangedTemplate, templateKey: "dual-shot-terminal", attackerPieceKey: dualShotActor.pieceKey },
);
const dualShotRoute = dualShot.alternatives.find((entry) =>
  entry.predecessorKind === "activation_sequence_granted_terminal_attack");
assert.ok(dualShotRoute);
assert.equal(dualShotRoute.activationSequenceObligation.sequenceKind,
  "dual_shot_aim_additional_basic_ranged_attack");
assert.equal(dualShotRoute.activationSequenceObligation.normalMovementOption, "aim");
assert.equal(dualShotRoute.actionSequenceObligation.grantedAttackKind, "ranged");
assert.equal(dualShotRoute.terminalTargetMayHavePriorDamage, true);

const cleaveActor = piece({
  pieceKey: "cleave-actor",
  specialRules: [CLEAVE],
  boxesRemaining: 8,
  attackProfiles: [
    { profileKey: "cleave-spear", mode: "melee", rangeIn: 2 },
    { profileKey: "cleave-claw", mode: "melee", rangeIn: 1 },
  ],
});
const cleaveBridge = piece({ pieceKey: "cleave-bridge", sideKey: "player2", boxesRemaining: 4 });
const cleave = regressWarmachineTerminalThroughRuleAtoms(
  { pieces: [cleaveActor, leader, cleaveBridge] },
  { ...template, templateKey: "cleave-terminal", attackerPieceKey: cleaveActor.pieceKey },
);
const cleaveRoute = cleave.alternatives.find((entry) =>
  entry.predecessorKind === "destroy_then_granted_additional_melee_terminal_attack");
assert.ok(cleaveRoute);
assert.equal(cleaveRoute.bridgeTargetPieceKey, cleaveBridge.pieceKey);
assert.equal(cleaveRoute.previousActorPositionConstraint.bridgeTargetMaximumEdgeDistanceIn, 2);
assert.equal(cleaveRoute.actionSequenceObligation.predecessorBasicAttackRequired, true);
assert.equal(cleaveRoute.actionSequenceObligation.grantedAttackMandatory, false);
assert.equal(cleaveRoute.actionSequenceObligation.usageLimitKind, "once_per_activation");

const unstableActor = piece({
  pieceKey: "unstable-actor",
  specialRules: [INSTABILITY_EQUATION],
  boxesRemaining: 8,
});
const explosion = regressWarmachineTerminalThroughRuleAtoms(
  { pieces: [unstableActor, leader] },
  { ...template, templateKey: "instability-explosion-terminal", attackerPieceKey: unstableActor.pieceKey },
);
const explosionRoute = explosion.alternatives.find((entry) =>
  entry.predecessorKind === "trigger_explosion_secondary_damage_terminal");
assert.ok(explosionRoute);
assert.deepEqual(explosionRoute.explosionTriggerObligation.triggerKinds,
  ["instability_equation_focus_spent_activation_end"]);
assert.equal(explosionRoute.previousActorPositionConstraint.terminalTargetMaximumEdgeDistanceBeforeAdvanceIn, 3);
assert.equal(explosionRoute.terminalSecondaryDamageObligation.damagePower, 14);
assert.equal(explosionRoute.terminalSecondaryDamageObligation.damageDiceCount, 2);
assert.deepEqual(explosionRoute.terminalSecondaryDamageObligation.damageTypes, ["blast"]);
assert.equal(explosionRoute.terminalSecondaryDamageObligation.unboostable, true);
assert.equal(explosionRoute.terminalSecondaryDamageObligation.damageCausedByAttack, false);
assert.equal(explosionRoute.sourceLifecycleObligation.removeFromPlayAfterDamage, true);
assert.equal(explosionRoute.sourceLifecycleObligation.preventsDisabledBoxedDestroyed, true);
assert.equal(explosionRoute.predecessorChanceObligation.exactChanceMassRequired, true);

const flysKissActor = piece({
  pieceKey: "flys-kiss-actor",
  specialRules: [FLYS_KISS],
  boxesRemaining: 8,
  attackProfiles: [{ profileKey: "flys-kiss", mode: "ranged", rangeIn: 8 }],
});
const flysKissBridge = piece({ pieceKey: "flys-kiss-bridge", sideKey: "player2", boxesRemaining: 3 });
const flysKiss = regressWarmachineTerminalThroughRuleAtoms(
  { pieces: [flysKissActor, leader, flysKissBridge] },
  {
    ...rangedTemplate,
    templateKey: "flys-kiss-secondary-terminal",
    attackerPieceKey: flysKissActor.pieceKey,
    attackProfile: { profileKey: "flys-kiss", mode: "ranged", rangeIn: 8 },
  },
);
const flysKissRoute = flysKiss.alternatives.find((entry) =>
  entry.predecessorKind === "box_bridge_then_secondary_damage_terminal");
assert.ok(flysKissRoute);
assert.equal(flysKissRoute.bridgeTargetPieceKey, flysKissBridge.pieceKey);
assert.equal(flysKissRoute.previousActorPositionConstraint.bridgeTargetMaximumEdgeDistanceIn, 8);
assert.equal(flysKissRoute.previousActorPositionConstraint.bridgeToTerminalMaximumEdgeDistanceIn, 2);
assert.equal(flysKissRoute.predecessorTargetStateObligation.requiredStage, "boxed");
assert.equal(flysKissRoute.damageLifecycleObligation.requiredFinalStage, "boxed");
assert.equal(flysKissRoute.terminalSecondaryDamageObligation.damagePower, 10);
assert.equal(flysKissRoute.terminalSecondaryDamageObligation.damageCausedByAttack, false);
assert.equal(flysKissRoute.sourceLifecycleObligation.sourcePieceKey, flysKissBridge.pieceKey);
assert.equal(flysKissRoute.sourceLifecycleObligation.removeFromPlayAfterDamage, true);

const electroActor = piece({
  pieceKey: "electro-actor",
  specialRules: [ELECTRO_LEAP],
  boxesRemaining: 8,
  attackProfiles: [{ profileKey: "electro-gun", mode: "ranged", rangeIn: 10 }],
});
const electroBridge = piece({ pieceKey: "electro-bridge", sideKey: "player2", boxesRemaining: 4 });
const electro = regressWarmachineTerminalThroughRuleAtoms(
  { pieces: [electroActor, leader, electroBridge] },
  {
    ...rangedTemplate,
    templateKey: "electro-leap-secondary-terminal",
    attackerPieceKey: electroActor.pieceKey,
    attackProfile: { profileKey: "electro-gun", mode: "ranged", rangeIn: 10 },
  },
);
const electroRoute = electro.alternatives.find((entry) =>
  entry.predecessorKind === "hit_bridge_then_secondary_damage_terminal");
assert.ok(electroRoute);
assert.equal(electroRoute.bridgeTargetPieceKey, electroBridge.pieceKey);
assert.equal(electroRoute.predecessorTargetStateObligation.requiredStage, "direct_hit");
assert.equal(electroRoute.predecessorTargetStateObligation.basicAttackRequired, true);
assert.equal(electroRoute.terminalSecondaryDamageObligation.controllerChoosesTies, true);
assert.equal(electroRoute.terminalSecondaryDamageObligation.simultaneousWithPrimaryDamage, true);
assert.equal(electroRoute.actionSequenceObligation.priorAttackMustBeBasic, true);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_reverse_rule_regression_v1",
  alternativeKinds: full.alternatives.map((entry) => entry.predecessorKind),
  toughBridgeRequirement: toughRoute.damageLifecycleObligation.toughBranchRequirement,
  previousPositionConstraint: toughRoute.previousActorPositionConstraint,
  pagedRemainingCandidateCount: paged.remainingCandidateCount,
  soulPoweredAlternative: {
    predecessorKind: soulRoute.predecessorKind,
    resourceObligation: soulRoute.resourceObligation,
    actionSequenceObligation: soulRoute.actionSequenceObligation,
  },
  soulAcquisitionAlternative: {
    predecessorKind: soulAcquisitionRoute.predecessorKind,
    resourceAcquisitionObligation: soulAcquisitionRoute.resourceAcquisitionObligation,
  },
  generatedAttackAlternatives: {
    snapFire: snapRoute.predecessorKind,
    criticalShred: shredRoute.predecessorKind,
    ricochet: ricochetRoute.predecessorKind,
  },
  movementBridgeAlternatives: {
    overtake: overtakeRoute.predecessorKind,
    sideStep: sideStepRoute.predecessorKind,
    beatBack: beatBackRoute.predecessorKind,
  },
  statusOnHitAlternative: {
    predecessorKind: shadowBindRoute.predecessorKind,
    status: shadowBindRoute.terminalStatusEffectObligation,
  },
  activationSequenceAlternative: {
    predecessorKind: dualShotRoute.predecessorKind,
    sequence: dualShotRoute.activationSequenceObligation,
  },
  destroyGrantedMeleeAlternative: {
    predecessorKind: cleaveRoute.predecessorKind,
    actionSequence: cleaveRoute.actionSequenceObligation,
  },
  explosionSecondaryDamageAlternative: {
    predecessorKind: explosionRoute.predecessorKind,
    trigger: explosionRoute.explosionTriggerObligation,
    damage: explosionRoute.terminalSecondaryDamageObligation,
    sourceLifecycle: explosionRoute.sourceLifecycleObligation,
  },
  bridgeSecondaryDamageAlternatives: {
    boxed: flysKissRoute.predecessorKind,
    directHit: electroRoute.predecessorKind,
  },
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_rule_regression_parity_v1",
  parityCaseCount,
}, null, 2));
