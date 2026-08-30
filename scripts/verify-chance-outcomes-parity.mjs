import assert from "node:assert/strict";
import fs from "node:fs";

import {
  applyRulesV1Action,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  resolveWarmachineHostPath,
} from "../src/warmachine-host-runtime.mjs";
import {
  buildWarmachineExactActionChanceClasses as buildLocalChanceClasses,
  exactChanceIntervalFromProcessedClasses as exactLocalInterval,
  warmachineExactChanceClassActionPatch,
} from "../src/search/chance-outcomes-v1.mjs";
import { loadLegacyReverseSearchModules } from "../src/upstream-project-d.mjs";

const { modules: legacyModules } = await loadLegacyReverseSearchModules({
  moduleKeys: ["chanceOutcomes"],
});
const legacyChance = legacyModules.chanceOutcomes;
const parityCounts = { classes: 0, intervals: 0 };
const applyCurrentStrictRulesV1Action = applyRulesV1Action;
const enumerateCurrentStrictRulesV1Actions = enumerateRulesV1Actions;
const normalizeCurrentStrictRulesV1State = normalizeRulesV1State;

function buildWarmachineExactActionChanceClasses(...args) {
  const local = buildLocalChanceClasses(...args);
  parityCounts.classes += 1;
  return local;
}

function exactChanceIntervalFromProcessedClasses(...args) {
  const local = exactLocalInterval(...args);
  const upstream = legacyChance.exactChanceIntervalFromProcessedClasses(...args);
  assert.deepEqual(local, upstream, `chance interval parity failed for case ${parityCounts.intervals + 1}`);
  parityCounts.intervals += 1;
  return local;
}

const fixturePack = JSON.parse(fs.readFileSync(resolveWarmachineHostPath("data/function3-fixtures/warmachine-micro-battle-fixtures.json"), "utf8"));
const state = structuredClone(fixturePack.fixtures.find((entry) =>
  entry.fixtureId === "micro_boosted_ranged_spends_focus_and_destroys").state);
const normalizedState = normalizeRulesV1State(state);
const enumeration = enumerateRulesV1Actions(normalizedState, { actorPieceKeys: ["gunmage"] });
const action = enumeration.actions.find((entry) => entry.actionKey === "gunmage:ranged:heavy:v1");
assert.ok(action);

const exact = buildWarmachineExactActionChanceClasses(action, { state: normalizedState });
assert.equal(exact.exactComplete, true);
assert.equal(exact.massNumerator, exact.massDenominator);
assert.equal(exact.attackOutcomeCount, 36);
assert.equal(exact.damageOutcomeCount, 36);
assert.equal(exact.classCount, 12);
assert.equal(exact.classes.filter((entry) => entry.hit === false).length, 1);
const exactMiss = exact.classes.find((entry) => entry.hit === false);
assert.deepEqual(exactMiss.strictRollOutcome.attackDice, [1, 1]);
assert.equal(Object.hasOwn(exactMiss.strictRollOutcome, "damageDice"), false);
assert.equal(Object.hasOwn(exactMiss.strictRollOutcome, "damageColumn"), false);
assert.equal(Object.hasOwn(exactMiss.strictRollOutcome, "toughDie"), false);
let engineExecutedChanceClassCount = 0;
for (const chanceClass of exact.classes) {
  const transition = applyRulesV1Action(normalizedState, {
    actionKey: action.actionKey,
    metadata: { strictRollOutcome: chanceClass.strictRollOutcome },
  });
  assert.equal(transition.ok, true,
    `Engine must execute Search chance class ${chanceClass.classKey}: ${transition.reason || "unknown"}`);
  const outcome = transition.events.find((event) => event.eventType === "strict_roll_outcome_applied")?.outcome;
  assert.ok(outcome, `Engine roll evidence missing for Search chance class ${chanceClass.classKey}`);
  assert.equal(outcome.hit, chanceClass.hit);
  assert.equal(outcome.damage, chanceClass.hit ? chanceClass.resolvedDamage : 0);
  engineExecutedChanceClassCount += 1;
}

const partial = exactChanceIntervalFromProcessedClasses([
  {
    chanceClass: exact.classes[0],
    interval: { lowerBound: 1, upperBound: 1, complete: true, possibleWitness: true, robustWitness: true },
  },
], exact, false);
assert.ok(partial.lowerBound > 0);
assert.equal(partial.upperBound, 1);
assert.ok(partial.unresolvedMass > 0);
assert.equal(partial.complete, false);

const special = buildWarmachineExactActionChanceClasses({
  ...action,
  metadata: {
    ...action.metadata,
    ruleAtomEffects: [{ atomKey: "test", active: true }],
  },
}, { state: normalizedState });
assert.equal(special.exactComplete, false);
assert.ok(special.reasons.includes("rule_atom_effects_present"));

const preChanceResolved = buildWarmachineExactActionChanceClasses({
  ...action,
  metadata: {
    ...action.metadata,
    ruleAtomEffects: [{
      atomKey: "exact-targeting-override",
      hookKey: "targeting_validation",
      effectType: "exact_targeting_override",
      active: true,
      exactWithinScope: true,
      outcomeRequirements: [],
    }],
  },
}, { state: normalizedState });
assert.equal(preChanceResolved.exactComplete, true);
assert.deepEqual(preChanceResolved.preChanceResolvedEffectTypes, ["exact_targeting_override"]);
const preChanceOutcomeRequirement = buildWarmachineExactActionChanceClasses({
  ...action,
  metadata: {
    ...action.metadata,
    ruleAtomEffects: [{
      atomKey: "targeting-override-needing-outcome",
      hookKey: "targeting_validation",
      effectType: "targeting_override_needing_outcome",
      active: true,
      exactWithinScope: true,
      outcomeRequirements: [{ outcomeKey: "external_choice" }],
    }],
  },
}, { state: normalizedState });
assert.equal(preChanceOutcomeRequirement.exactComplete, false);
assert.ok(preChanceOutcomeRequirement.reasons.includes("rule_atom_effects_present"));

const killingSpreeTough = buildWarmachineExactActionChanceClasses({
  ...action,
  metadata: {
    ...action.metadata,
    ruleAtomEffects: [{
      atomKey: "killing_spree_melee_destroy_advance_additional_melee_sequence",
      effectType: "killing_spree_melee_destroy_advance_additional_melee_available",
      active: true,
    }],
    specialRuleAnalysis: {
      effects: [
        { effectType: "killing_spree_melee_destroy_advance_additional_melee_available", active: true },
        { effectType: "prevent_destroyed_by_tough", active: true },
      ],
      ruleAtomEffects: [],
      ruleAtomDiagnostics: [],
      unresolvedRuleKeys: [],
    },
  },
}, { state: normalizedState });
assert.equal(killingSpreeTough.exactComplete, true);
assert.equal(killingSpreeTough.massNumerator, killingSpreeTough.massDenominator);
assert.deepEqual(killingSpreeTough.deterministicSuccessorEffectTypes, [
  "killing_spree_melee_destroy_advance_additional_melee_available",
  "prevent_destroyed_by_tough",
]);
assert.deepEqual(new Set(killingSpreeTough.classes.filter((entry) => entry.toughRollRequired).map((entry) =>
  entry.strictRollOutcome.toughDie)), new Set([1, 2, 3, 4, 5, 6]));

const simpleWarriorState = {
  pieces: [{ pieceKey: action.targetPieceKey, isWarrior: true, modelRole: "warrior" }],
};
const simpleWarrior = buildWarmachineExactActionChanceClasses(action, { state: simpleWarriorState });
assert.equal(simpleWarrior.exactComplete, true);
assert.deepEqual(simpleWarrior.chanceDimensions.damageLocationValues, [1]);
assert.deepEqual(simpleWarrior.chanceDimensions.toughDieValues, [1]);
assert.equal(simpleWarrior.classCount, 12);
assert.equal(simpleWarrior.massNumerator, simpleWarrior.massDenominator);

const conditionalGridAction = {
  ...action,
  metadata: {
    ...action.metadata,
    attackResolution: {
      ...action.metadata.attackResolution,
      staticDamage: -10,
      damageLayoutOutcomeRequirements: {
        damageLayoutKind: "damage_grid",
        damageLayoutKnown: true,
        damageColumnRequiredWhenDamagePositive: true,
        damageGridSideRequiredWhenDamagePositive: false,
        damageGridSideRollRequiredWhenDamagePositive: false,
        overflowDamageColumnMayBeRequired: false,
      },
    },
  },
};
const conditionalGrid = buildWarmachineExactActionChanceClasses(conditionalGridAction, {
  state: {
    pieces: [{
      pieceKey: action.targetPieceKey,
      modelRole: "warjack",
      damage: { boxesRemaining: 20, gridColumns: Array.from({ length: 6 }, () => []) },
    }],
  },
});
assert.equal(conditionalGrid.exactComplete, true);
assert.equal(conditionalGrid.massNumerator, conditionalGrid.massDenominator);
assert.equal(conditionalGrid.classes.some((entry) =>
  entry.hit && entry.resolvedDamage === 0 && Object.hasOwn(entry.strictRollOutcome, "damageColumn")), false);
assert.equal(conditionalGrid.classes.filter((entry) => entry.hit && entry.resolvedDamage > 0).every((entry) =>
  entry.damageLocationRequired && Number.isInteger(entry.strictRollOutcome.damageColumn)), true);

const sequentialColossalBase = buildWarmachineExactActionChanceClasses({
  ...action,
  metadata: {
    ...action.metadata,
    attackResolution: {
      ...action.metadata.attackResolution,
      damageLayoutOutcomeRequirements: {
        damageLayoutKind: "colossal_damage_grid",
        damageLayoutKnown: true,
        damageColumnRequiredWhenDamagePositive: true,
        damageGridSideRequiredWhenDamagePositive: true,
        damageGridSideRollRequiredWhenDamagePositive: false,
        overflowDamageColumnMayBeRequired: true,
      },
    },
  },
}, {
  state: {
    pieces: [{
      pieceKey: action.targetPieceKey,
      modelRole: "colossal",
      damage: { boxesRemaining: 58 },
    }],
  },
});
assert.equal(sequentialColossalBase.exactComplete, true);
assert.equal(sequentialColossalBase.massNumerator, sequentialColossalBase.massDenominator);
assert.equal(sequentialColossalBase.chanceDimensions.damageLocationDeferredUntilGridChoice, true);
assert.equal(sequentialColossalBase.chanceDimensions.postDamageAttackerChoiceRequired, true);
assert.equal(sequentialColossalBase.classes.filter((entry) => entry.hit && entry.resolvedDamage > 0)
  .every((entry) => entry.postDamageAttackerChoiceRequired === true &&
    !Object.hasOwn(entry.strictRollOutcome, "damageColumn") &&
    !Object.hasOwn(entry.strictRollOutcome, "damageGridSide")), true);
assert.equal(sequentialColossalBase.reasons.includes("controller_damage_grid_side_choice_unresolved"), false);
assert.equal(sequentialColossalBase.reasons.includes("conditional_colossal_overflow_damage_column_not_yet_exact"), false);

const currentCardData = JSON.parse(fs.readFileSync(
  resolveWarmachineHostPath("prototype/data/warmachine-lite-data.json"),
  "utf8",
));
const blockaderCard = currentCardData.cards.find((card) => card.name === "Blockader");
assert.ok(blockaderCard);
const blockaderModel = blockaderCard.models[0];
const colossalProtocolState = normalizeCurrentStrictRulesV1State({
  stateKey: "search-colossal-sequential-protocol",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 3,
  strictMode: true,
  ruleAtomRuntimeMode: "authoritative",
  board: { widthIn: 48, heightIn: 48 },
  scenario: { zones: [], flags: [], score: { player1: 0, player2: 0 }, victoryThreshold: 5 },
  pieces: [{
    pieceKey: "colossal_attacker",
    label: "Colossal Protocol Attacker",
    sideKey: "player1",
    modelRole: "warrior",
    modelType: "warrior",
    position: { xIn: 8, yIn: 8 },
    baseSizeIn: 30 / 25.4,
    speedIn: 6,
    meleeRangeIn: 2,
    defense: 12,
    armor: 16,
    mat: 8,
    damage: { boxesRemaining: 10, maxBoxes: 10 },
    attackProfiles: [{
      profileKey: "colossal-protocol-hammer",
      name: "Colossal Protocol Hammer",
      mode: "melee",
      rangeIn: 2,
      power: 20,
      attackStat: 8,
      attackStatKind: "MAT",
    }],
  }, {
    pieceKey: "overflow_blockader",
    label: "Blockader",
    sideKey: "player2",
    modelRole: "colossal",
    modelType: "colossal_warjack",
    cardTypeName: "Warjack",
    isWarjack: true,
    isColossal: true,
    modelId: blockaderModel.id,
    position: { xIn: 11.5, yIn: 8 },
    cardSnapshot: {
      name: blockaderCard.name,
      cardTypeName: blockaderCard.cardTypeName,
      healthType: blockaderCard.healthType,
      healthValues: structuredClone(blockaderCard.healthValues),
      models: [{
        id: blockaderModel.id,
        name: blockaderModel.name,
        stats: structuredClone(blockaderModel.stats),
        advantages: ["Construct", "z_120mm"],
        abilities: [],
        weapons: [],
      }],
      cardAbilities: [],
    },
  }],
});
const overflowBlockader = colossalProtocolState.pieces.find((piece) =>
  piece.pieceKey === "overflow_blockader");
const leftGridCells = overflowBlockader.damage.colossalGridColumns.left.flat();
leftGridCells.forEach((cell, index) => { cell.marked = index < leftGridCells.length - 2; });
overflowBlockader.damage.boxesRemaining = 31;
const colossalProtocolAttack = enumerateCurrentStrictRulesV1Actions(colossalProtocolState).actions.find((entry) =>
  entry.actionType === "melee_attack" && entry.targetPieceKey === overflowBlockader.pieceKey);
assert.ok(colossalProtocolAttack);
const colossalBaseChance = buildWarmachineExactActionChanceClasses(colossalProtocolAttack, {
  state: colossalProtocolState,
});
assert.equal(colossalBaseChance.exactComplete, true, colossalBaseChance.reasons.join(","));
const damagingColossalBaseClass = colossalBaseChance.classes.find((entry) =>
  entry.hit && entry.resolvedDamage >= 7);
assert.ok(damagingColossalBaseClass);
const colossalSidePending = applyCurrentStrictRulesV1Action(colossalProtocolState, {
  actionKey: colossalProtocolAttack.actionKey,
  metadata: { strictRollOutcome: damagingColossalBaseClass.strictRollOutcome },
});
assert.equal(colossalSidePending.ok, true, colossalSidePending.reason);
assert.equal(colossalSidePending.reason, "colossal_attack_damage_grid_side_choice_required");
const colossalSideChoices = enumerateCurrentStrictRulesV1Actions(colossalSidePending.nextState);
const colossalLeftChoice = colossalSideChoices.actions.find((entry) =>
  entry.actionType === "colossal_damage_grid_side_left");
const colossalRightChoice = colossalSideChoices.actions.find((entry) =>
  entry.actionType === "colossal_damage_grid_side_right");
assert.ok(colossalLeftChoice && colossalRightChoice);
const colossalLeftColumnChance = buildWarmachineExactActionChanceClasses(colossalLeftChoice, {
  state: colossalSidePending.nextState,
});
const colossalRightColumnChance = buildWarmachineExactActionChanceClasses(colossalRightChoice, {
  state: colossalSidePending.nextState,
});
assert.equal(colossalLeftColumnChance.exactComplete, true);
assert.equal(colossalLeftColumnChance.massNumerator, colossalLeftColumnChance.massDenominator);
assert.equal(colossalLeftColumnChance.classCount, 36,
  "two remaining left-grid boxes force a conditional overflow d6 for every primary column");
assert.equal(colossalLeftColumnChance.classes.every((entry) =>
  entry.overflowRequired === true), true);
assert.equal(colossalRightColumnChance.exactComplete, true);
assert.equal(colossalRightColumnChance.massNumerator, colossalRightColumnChance.massDenominator);
assert.equal(colossalRightColumnChance.classCount, 6,
  "the intact right grid needs only the primary d6 column");
for (const chanceClass of [
  colossalLeftColumnChance.classes[0],
  colossalLeftColumnChance.classes.at(-1),
  colossalRightColumnChance.classes[0],
]) {
  const choice = chanceClass.overflowRequired ? colossalLeftChoice : colossalRightChoice;
  const transition = applyCurrentStrictRulesV1Action(colossalSidePending.nextState, {
    actionKey: choice.actionKey,
    ...warmachineExactChanceClassActionPatch(chanceClass),
  });
  assert.equal(transition.ok, true, transition.reason);
  assert.equal(transition.events.some((event) =>
    event.eventType === "colossal_attack_damage_grid_side_selected"), true);
}

const compositeColossalState = normalizeCurrentStrictRulesV1State({
  ...structuredClone(colossalProtocolState),
  stateKey: "search-composite-colossal-sequential-protocol",
  pieces: colossalProtocolState.pieces.map((piece) => piece.pieceKey === "colossal_attacker"
    ? {
        ...structuredClone(piece),
        activated: false,
        activationComplete: false,
        specialRules: ["Dual Attack"],
        attackProfiles: [
          ...structuredClone(piece.attackProfiles),
          {
            profileKey: "colossal-protocol-cannon",
            name: "Colossal Protocol Cannon",
            mode: "ranged",
            rangeIn: 10,
            power: 19,
            attackStat: 8,
            attackStatKind: "RAT",
          },
        ],
      }
    : {
        ...structuredClone(piece),
        activated: false,
        activationComplete: false,
      }),
});
const compositeBlockader = compositeColossalState.pieces.find((piece) =>
  piece.pieceKey === "overflow_blockader");
const compositeColossalAttack = enumerateCurrentStrictRulesV1Actions(compositeColossalState).actions.find((entry) =>
  entry.actionType === "dual_attack_initials" &&
  entry.targetPieceKey === compositeBlockader.pieceKey &&
  entry.metadata?.dualAttackOrder === "melee_then_ranged");
assert.ok(compositeColossalAttack);
const compositeColossalChance = buildWarmachineExactActionChanceClasses(compositeColossalAttack, {
  state: compositeColossalState,
});
assert.equal(compositeColossalChance.exactComplete, true, JSON.stringify({
  reasons: compositeColossalChance.reasons,
  rangedAnalysis: compositeColossalAttack.metadata.dualAttackRanged?.specialRuleAnalysis,
}, null, 2));
assert.equal(compositeColossalChance.packetCount, 2);
assert.equal(compositeColossalChance.massNumerator, compositeColossalChance.massDenominator);
assert.ok(compositeColossalChance.classCount > 1);
assert.ok(compositeColossalChance.classCount <= compositeColossalChance.maxCompositeChanceClasses);
const compositeBudgetRejected = buildWarmachineExactActionChanceClasses(compositeColossalAttack, {
  state: compositeColossalState,
  maxCompositeChanceClasses: 1,
});
assert.equal(compositeBudgetRejected.exactComplete, false);
assert.equal(compositeBudgetRejected.classCount, 0);
assert.ok(compositeBudgetRejected.projectedClassCount > 1);
assert.ok(compositeBudgetRejected.reasons.includes("composite_attack_chance_class_budget_exceeded"));
assert.equal(compositeColossalChance.classes.every((entry) =>
  entry.strictRollOutcome.componentOutcomes.length === 2), true);
const damagingCompositeClass = compositeColossalChance.classes
  .filter((entry) => entry.packetOutcomes.every((packet) => packet.hit && packet.resolvedDamage > 0))
  .sort((left, right) =>
    left.packetOutcomes.reduce((sum, packet) => sum + packet.resolvedDamage, 0) -
    right.packetOutcomes.reduce((sum, packet) => sum + packet.resolvedDamage, 0))[0];
assert.ok(damagingCompositeClass);
assert.equal(damagingCompositeClass.strictRollOutcome.componentOutcomes.every((outcome) =>
  !Object.hasOwn(outcome, "damageGridSide") && !Object.hasOwn(outcome, "damageColumn")), true,
"Search must leave each damaging composite Colossal packet's player choice and later column Chance unresolved");
const compositeFirstSidePending = applyCurrentStrictRulesV1Action(compositeColossalState, {
  actionKey: compositeColossalAttack.actionKey,
  ...warmachineExactChanceClassActionPatch(damagingCompositeClass),
});
assert.equal(compositeFirstSidePending.ok, true, compositeFirstSidePending.reason);
assert.equal(compositeFirstSidePending.reason, "colossal_attack_damage_grid_side_choice_required");
assert.deepEqual(compositeFirstSidePending.nextState.colossalDamageGridSideWindow?.strictOutcomePath,
  ["componentOutcomes", "0"]);
const compositeFirstRightChoice = enumerateCurrentStrictRulesV1Actions(compositeFirstSidePending.nextState).actions.find((entry) =>
  entry.actionType === "colossal_damage_grid_side_right");
assert.ok(compositeFirstRightChoice);
const compositeFirstColumnChance = buildWarmachineExactActionChanceClasses(compositeFirstRightChoice, {
  state: compositeFirstSidePending.nextState,
});
assert.equal(compositeFirstColumnChance.exactComplete, true);
assert.equal(compositeFirstColumnChance.classCount, 6);
const compositeSecondSidePending = applyCurrentStrictRulesV1Action(compositeFirstSidePending.nextState, {
  actionKey: compositeFirstRightChoice.actionKey,
  ...warmachineExactChanceClassActionPatch(compositeFirstColumnChance.classes[0]),
});
assert.equal(compositeSecondSidePending.ok, true, compositeSecondSidePending.reason);
assert.equal(compositeSecondSidePending.reason, "colossal_attack_damage_grid_side_choice_required");
assert.deepEqual(compositeSecondSidePending.nextState.colossalDamageGridSideWindow?.strictOutcomePath,
  ["componentOutcomes", "1"]);
assert.equal(compositeSecondSidePending.nextState.pieces.find((piece) =>
  piece.pieceKey === compositeBlockader.pieceKey).damage.boxesRemaining, 31,
"Search traversal must preserve Engine transactional rollback between composite Colossal choices");
const compositeSecondRightChoice = enumerateCurrentStrictRulesV1Actions(compositeSecondSidePending.nextState).actions.find((entry) =>
  entry.actionType === "colossal_damage_grid_side_right");
assert.ok(compositeSecondRightChoice);
const compositeSecondColumnChance = buildWarmachineExactActionChanceClasses(compositeSecondRightChoice, {
  state: compositeSecondSidePending.nextState,
});
assert.equal(compositeSecondColumnChance.exactComplete, true);
const compositeResolved = applyCurrentStrictRulesV1Action(compositeSecondSidePending.nextState, {
  actionKey: compositeSecondRightChoice.actionKey,
  ...warmachineExactChanceClassActionPatch(compositeSecondColumnChance.classes[0]),
});
assert.equal(compositeResolved.ok, true, compositeResolved.reason);
const compositeDamageTotal = damagingCompositeClass.packetOutcomes
  .reduce((sum, packet) => sum + packet.resolvedDamage, 0);
assert.equal(compositeResolved.nextState.pieces.find((piece) =>
  piece.pieceKey === compositeBlockader.pieceKey).damage.boxesRemaining, 31 - compositeDamageTotal);

const assaultColossalState = normalizeCurrentStrictRulesV1State({
  ...structuredClone(colossalProtocolState),
  stateKey: "search-assault-colossal-sequential-protocol",
  pieces: colossalProtocolState.pieces.map((piece) => piece.pieceKey === "colossal_attacker"
    ? {
        ...structuredClone(piece),
        position: { xIn: 10, yIn: 12 },
        activated: false,
        activationComplete: false,
        assault: true,
        mat: 20,
        rat: 20,
        meleeRangeIn: 1,
        meleePower: 30,
        rangedRangeIn: 6,
        rangedPower: 30,
        attackProfiles: [],
      }
    : {
        ...structuredClone(piece),
        position: { xIn: 15.5, yIn: 12 },
        activated: false,
        activationComplete: false,
      }),
});
const assaultColossalTarget = assaultColossalState.pieces.find((piece) =>
  piece.pieceKey === "overflow_blockader");
const assaultColossalAction = enumerateCurrentStrictRulesV1Actions(assaultColossalState).actions.find((entry) =>
  entry.actionType === "assault_charge" &&
  entry.targetPieceKey === assaultColossalTarget.pieceKey);
assert.ok(assaultColossalAction);
const assaultColossalChance = buildWarmachineExactActionChanceClasses(assaultColossalAction, {
  state: assaultColossalState,
});
assert.equal(assaultColossalChance.exactComplete, true,
  JSON.stringify({
    reasons: assaultColossalChance.reasons,
    rangedEffects: assaultColossalAction.metadata.assaultRangedAttack
      ?.specialRuleAnalysis?.effects?.map((effect) => ({
        effectType: effect.effectType,
        hookKey: effect.hookKey,
        exactWithinScope: effect.exactWithinScope,
        outcomeRequirements: effect.outcomeRequirements,
      })),
    meleeEffects: assaultColossalAction.metadata.assaultChargeMeleeAttack
      ?.specialRuleAnalysis?.effects?.map((effect) => ({
        effectType: effect.effectType,
        hookKey: effect.hookKey,
        exactWithinScope: effect.exactWithinScope,
        outcomeRequirements: effect.outcomeRequirements,
      })),
  }));
assert.equal(assaultColossalChance.packetCount, 2);
assert.equal(assaultColossalChance.massNumerator, assaultColossalChance.massDenominator);
const damagingAssaultClass = assaultColossalChance.classes.find((entry) =>
  entry.packetOutcomes.every((packet) => packet.hit && packet.resolvedDamage > 0));
assert.ok(damagingAssaultClass);
assert.equal(damagingAssaultClass.strictRollOutcome.componentOutcomes.length, 2);
assert.equal(damagingAssaultClass.strictRollOutcome.componentOutcomes.every((outcome) =>
  !Object.hasOwn(outcome, "damageGridSide") && !Object.hasOwn(outcome, "damageColumn")), true);
const assaultFirstSidePending = applyCurrentStrictRulesV1Action(assaultColossalState, {
  actionKey: assaultColossalAction.actionKey,
  ...warmachineExactChanceClassActionPatch(damagingAssaultClass),
});
assert.equal(assaultFirstSidePending.ok, true, assaultFirstSidePending.reason);
assert.deepEqual(assaultFirstSidePending.nextState.colossalDamageGridSideWindow?.strictOutcomePath,
  ["componentOutcomes", "0"]);
const assaultFirstLeftChoice = enumerateCurrentStrictRulesV1Actions(
  assaultFirstSidePending.nextState,
).actions.find((entry) => entry.actionType === "colossal_damage_grid_side_left");
assert.ok(assaultFirstLeftChoice);
const assaultFirstColumnChance = buildWarmachineExactActionChanceClasses(assaultFirstLeftChoice, {
  state: assaultFirstSidePending.nextState,
});
assert.equal(assaultFirstColumnChance.exactComplete, true);
const assaultSecondSidePending = applyCurrentStrictRulesV1Action(assaultFirstSidePending.nextState, {
  actionKey: assaultFirstLeftChoice.actionKey,
  ...warmachineExactChanceClassActionPatch(assaultFirstColumnChance.classes[0]),
});
assert.equal(assaultSecondSidePending.ok, true, assaultSecondSidePending.reason);
assert.deepEqual(assaultSecondSidePending.nextState.colossalDamageGridSideWindow?.strictOutcomePath,
  ["componentOutcomes", "1"]);
assert.equal(assaultSecondSidePending.nextState.pieces.find((piece) =>
  piece.pieceKey === assaultColossalTarget.pieceKey).damage.boxesRemaining, 31);
const assaultSecondRightChoice = enumerateCurrentStrictRulesV1Actions(
  assaultSecondSidePending.nextState,
).actions.find((entry) => entry.actionType === "colossal_damage_grid_side_right");
assert.ok(assaultSecondRightChoice);
const assaultSecondColumnChance = buildWarmachineExactActionChanceClasses(assaultSecondRightChoice, {
  state: assaultSecondSidePending.nextState,
});
assert.equal(assaultSecondColumnChance.exactComplete, true);
const assaultResolved = applyCurrentStrictRulesV1Action(assaultSecondSidePending.nextState, {
  actionKey: assaultSecondRightChoice.actionKey,
  ...warmachineExactChanceClassActionPatch(assaultSecondColumnChance.classes[0]),
});
assert.equal(assaultResolved.ok, true, assaultResolved.reason);

const cavalryImpactBlockader = structuredClone(overflowBlockader);
cavalryImpactBlockader.pieceKey = "search_cavalry_impact_blockader";
cavalryImpactBlockader.position = { xIn: 14.8, yIn: 39.2 };
cavalryImpactBlockader.activated = false;
cavalryImpactBlockader.activationComplete = false;
const cavalryColossalState = normalizeCurrentStrictRulesV1State({
  ...structuredClone(colossalProtocolState),
  stateKey: "search-cavalry-colossal-composite-protocol",
  pieces: [{
    ...structuredClone(colossalProtocolState.pieces.find((piece) =>
      piece.pieceKey === "colossal_attacker")),
    pieceKey: "search_cavalry_actor",
    position: { xIn: 10, yIn: 36 },
    activated: false,
    activationComplete: false,
    isCavalry: true,
    mat: 20,
    meleeRangeIn: 1,
    meleePower: 18,
    attackProfiles: [],
    metadata: {
      cavalryImpactProfile: {
        profileKey: "search-cavalry-impact",
        name: "Search Cavalry Impact",
        rangeIn: 1,
        power: 30,
        attackStat: 20,
      },
    },
  }, {
    pieceKey: "search_cavalry_primary_target",
    label: "Search Cavalry Primary Target",
    sideKey: "player2",
    modelRole: "warrior",
    modelType: "warrior",
    position: { xIn: 15.5, yIn: 36 },
    baseSizeIn: 30 / 25.4,
    speedIn: 6,
    defense: 10,
    armor: 16,
    damage: { boxesRemaining: 100, maxBoxes: 100 },
    attackProfiles: [],
  }, cavalryImpactBlockader],
});
const cavalryImpactTarget = cavalryColossalState.pieces.find((piece) =>
  piece.pieceKey === cavalryImpactBlockader.pieceKey);
const cavalryPrimaryTarget = cavalryColossalState.pieces.find((piece) =>
  piece.pieceKey === "search_cavalry_primary_target");
const cavalryColossalAction = enumerateCurrentStrictRulesV1Actions(cavalryColossalState).actions.find((entry) =>
  entry.actionType === "cavalry_charge" &&
  entry.targetPieceKey === cavalryPrimaryTarget.pieceKey &&
  entry.metadata?.cavalryImpactAttacks?.some((component) =>
    component.damageRecipientPieceKey === cavalryImpactTarget.pieceKey));
assert.ok(cavalryColossalAction);
const cavalryColossalChance = buildWarmachineExactActionChanceClasses(cavalryColossalAction, {
  state: cavalryColossalState,
});
assert.equal(cavalryColossalChance.exactComplete, true,
  JSON.stringify(cavalryColossalChance.reasons));
assert.equal(cavalryColossalChance.packetCount, 2,
  "Cavalry Chance must contain the impact packet and the later primary charge attack");
assert.equal(cavalryColossalChance.massNumerator, cavalryColossalChance.massDenominator);
const damagingCavalryClass = cavalryColossalChance.classes.find((entry) =>
  entry.packetOutcomes.every((packet) => packet.hit && packet.resolvedDamage > 0));
assert.ok(damagingCavalryClass);
assert.ok(Array.isArray(damagingCavalryClass.strictRollOutcome.attackDice),
  "the primary cavalry attack must remain at the strict outcome root");
assert.equal(damagingCavalryClass.strictRollOutcome.componentOutcomes.length, 1);
assert.equal(damagingCavalryClass.packetOutcomes.some((packet) =>
  packet.outcomeRole === "primary" && packet.targetPieceKey === cavalryPrimaryTarget.pieceKey), true);
const cavalrySidePending = applyCurrentStrictRulesV1Action(cavalryColossalState, {
  actionKey: cavalryColossalAction.actionKey,
  ...warmachineExactChanceClassActionPatch(damagingCavalryClass),
});
assert.equal(cavalrySidePending.ok, true, cavalrySidePending.reason);
assert.deepEqual(cavalrySidePending.nextState.colossalDamageGridSideWindow?.strictOutcomePath,
  ["componentOutcomes", "0"]);
const cavalryRightChoice = enumerateCurrentStrictRulesV1Actions(cavalrySidePending.nextState).actions.find((entry) =>
  entry.actionType === "colossal_damage_grid_side_right");
assert.ok(cavalryRightChoice);
const cavalryColumnChance = buildWarmachineExactActionChanceClasses(cavalryRightChoice, {
  state: cavalrySidePending.nextState,
});
assert.equal(cavalryColumnChance.exactComplete, true);
const cavalryResolved = applyCurrentStrictRulesV1Action(cavalrySidePending.nextState, {
  actionKey: cavalryRightChoice.actionKey,
  ...warmachineExactChanceClassActionPatch(cavalryColumnChance.classes[0]),
});
assert.equal(cavalryResolved.ok, true, cavalryResolved.reason);
assert.ok(cavalryResolved.nextState.pieces.find((piece) =>
  piece.pieceKey === cavalryImpactTarget.pieceKey).damage.boxesRemaining < 31);
assert.ok(cavalryResolved.nextState.pieces.find((piece) =>
  piece.pieceKey === cavalryPrimaryTarget.pieceKey).damage.boxesRemaining < 100);

function secondaryPacketProtocolState({ stateKey, profile, yIn }) {
  const sourceAttacker = colossalProtocolState.pieces.find((piece) =>
    piece.pieceKey === "colossal_attacker");
  const sourceBlockader = colossalProtocolState.pieces.find((piece) =>
    piece.pieceKey === "overflow_blockader");
  return normalizeCurrentStrictRulesV1State({
    ...structuredClone(colossalProtocolState),
    stateKey,
    pieces: [{
      ...structuredClone(sourceAttacker),
      pieceKey: `${stateKey}_attacker`,
      position: { xIn: 5, yIn },
      rat: 20,
      activated: false,
      activationComplete: false,
      specialRules: [],
      attackProfiles: [profile],
    }, {
      pieceKey: `${stateKey}_primary`,
      label: "Secondary Packet Primary",
      sideKey: "player2",
      modelRole: "warrior",
      modelType: "warrior",
      isWarrior: true,
      position: { xIn: 14, yIn },
      baseSizeIn: 30 / 25.4,
      speedIn: 6,
      defense: 10,
      armor: 100,
      damage: { boxesRemaining: 1, maxBoxes: 1 },
      boxesRemaining: 1,
      maxBoxes: 1,
      attackProfiles: [],
      specialRules: [],
    }, {
      ...structuredClone(sourceBlockader),
      pieceKey: `${stateKey}_blockader`,
      position: profile.isSpray === true
        ? { xIn: 9.5, yIn: yIn + 0.2 }
        : { xIn: 17.2, yIn },
      activated: false,
      activationComplete: false,
    }],
  });
}

const sprayPacketState = secondaryPacketProtocolState({
  stateKey: "search-colossal-spray-packet",
  yIn: 20,
  profile: {
    profileKey: "search-colossal-spray",
    name: "Search Colossal Spray",
    mode: "ranged",
    rangeIn: 12,
    power: 30,
    isSpray: true,
    sprayWidthIn: 2,
    attackStat: 20,
    attackStatKind: "RAT",
  },
});
const sprayPacketBlockader = sprayPacketState.pieces.find((piece) =>
  piece.pieceKey === "search-colossal-spray-packet_blockader");
const sprayPacketAction = enumerateCurrentStrictRulesV1Actions(sprayPacketState).actions.find((entry) =>
  entry.actionType === "ranged_attack" &&
  entry.targetPieceKey === "search-colossal-spray-packet_primary" &&
  entry.metadata?.spraySecondaryTargets?.some((target) => target.pieceKey === sprayPacketBlockader.pieceKey));
assert.ok(sprayPacketAction);
const sprayPacketChance = buildWarmachineExactActionChanceClasses(sprayPacketAction, {
  state: sprayPacketState,
});
assert.equal(sprayPacketChance.exactComplete, true, JSON.stringify({
  reasons: sprayPacketChance.reasons,
  primaryEffects: sprayPacketAction.metadata?.specialRuleAnalysis?.effects?.map((effect) => ({
    effectType: effect.effectType,
    exactWithinScope: effect.exactWithinScope,
    hookKey: effect.hookKey,
    outcomeRequirements: effect.outcomeRequirements,
    requiresExpertReview: effect.requiresExpertReview,
  })),
  secondaryTargets: sprayPacketAction.metadata?.spraySecondaryTargets?.map((target) => ({
    pieceKey: target.pieceKey,
    damageDiceCount: target.damageDiceCount,
    attackResolution: target.attackResolution,
  })),
}, null, 2));
assert.equal(sprayPacketChance.packetCount, 2);
assert.equal(sprayPacketChance.massNumerator, sprayPacketChance.massDenominator);
const sprayPacketBudgetRejected = buildWarmachineExactActionChanceClasses(sprayPacketAction, {
  state: sprayPacketState,
  maxSecondaryPacketChanceClasses: 1,
});
assert.equal(sprayPacketBudgetRejected.exactComplete, false);
assert.equal(sprayPacketBudgetRejected.classCount, 0);
assert.ok(sprayPacketBudgetRejected.projectedClassCount > 1);
assert.ok(sprayPacketBudgetRejected.reasons.includes(
  "secondary_attack_packet_chance_class_budget_exceeded",
));
const damagingSprayPacketClass = sprayPacketChance.classes.find((entry) =>
  entry.packetOutcomes[0].hit === true &&
  entry.packetOutcomes[1].hit === true &&
  entry.packetOutcomes[1].resolvedDamage > 0);
assert.ok(damagingSprayPacketClass);
assert.equal(damagingSprayPacketClass.strictRollOutcome
  .sprayAttackDamageByTarget[sprayPacketBlockader.pieceKey].damageGridSide, undefined);
assert.equal(damagingSprayPacketClass.strictRollOutcome
  .sprayAttackDamageByTarget[sprayPacketBlockader.pieceKey].damageColumn, undefined);
const sprayPacketSidePending = applyCurrentStrictRulesV1Action(sprayPacketState, {
  actionKey: sprayPacketAction.actionKey,
  ...warmachineExactChanceClassActionPatch(damagingSprayPacketClass),
});
assert.equal(sprayPacketSidePending.ok, true, sprayPacketSidePending.reason);
assert.deepEqual(sprayPacketSidePending.nextState.colossalDamageGridSideWindow?.strictOutcomePath,
  ["sprayAttackDamageByTarget", sprayPacketBlockader.pieceKey]);
const sprayPacketRightChoice = enumerateCurrentStrictRulesV1Actions(sprayPacketSidePending.nextState).actions.find((entry) =>
  entry.actionType === "colossal_damage_grid_side_right");
assert.ok(sprayPacketRightChoice);
const sprayPacketColumnChance = buildWarmachineExactActionChanceClasses(sprayPacketRightChoice, {
  state: sprayPacketSidePending.nextState,
});
assert.equal(sprayPacketColumnChance.exactComplete, true);
const sprayPacketResolved = applyCurrentStrictRulesV1Action(sprayPacketSidePending.nextState, {
  actionKey: sprayPacketRightChoice.actionKey,
  ...warmachineExactChanceClassActionPatch(sprayPacketColumnChance.classes[0]),
});
assert.equal(sprayPacketResolved.ok, true, sprayPacketResolved.reason);

const aoePacketState = secondaryPacketProtocolState({
  stateKey: "search-colossal-aoe-packet",
  yIn: 32,
  profile: {
    profileKey: "search-colossal-aoe",
    name: "Search Colossal AOE",
    mode: "ranged",
    rangeIn: 12,
    power: 8,
    blastPower: 12,
    aoeIn: 4,
    attackStat: 20,
    attackStatKind: "RAT",
  },
});
const aoePacketBlockader = aoePacketState.pieces.find((piece) =>
  piece.pieceKey === "search-colossal-aoe-packet_blockader");
const aoePacketAction = enumerateCurrentStrictRulesV1Actions(aoePacketState).actions.find((entry) =>
  entry.actionType === "ranged_attack" &&
  entry.targetPieceKey === "search-colossal-aoe-packet_primary" &&
  entry.metadata?.aoeBlastTargets?.some((target) => target.pieceKey === aoePacketBlockader.pieceKey));
assert.ok(aoePacketAction);
assert.equal(aoePacketAction.metadata.aoeMissTargetBlast?.pieceKey,
  "search-colossal-aoe-packet_primary",
"Engine must expose the miss-target blast packet instead of making Search reconstruct it");
const aoePacketChance = buildWarmachineExactActionChanceClasses(aoePacketAction, {
  state: aoePacketState,
});
assert.equal(aoePacketChance.exactComplete, true, aoePacketChance.reasons.join(","));
assert.equal(aoePacketChance.packetCount, 3,
  "the exact common support contains primary, direct-hit secondary, and miss-target blast packets");
assert.equal(aoePacketChance.massNumerator, aoePacketChance.massDenominator);
assert.equal(aoePacketChance.unusedConditionalPacketDiceIncludedInMass, true);
const damagingAoePacketClass = aoePacketChance.classes.find((entry) =>
  entry.packetOutcomes[0].hit === true &&
  entry.packetOutcomes.some((packet) =>
    packet.targetPieceKey === aoePacketBlockader.pieceKey && packet.resolvedDamage > 0));
assert.ok(damagingAoePacketClass);
assert.equal(damagingAoePacketClass.strictRollOutcome
  .aoeBlastDamageByTarget[aoePacketBlockader.pieceKey].damageGridSide, undefined);
assert.equal(damagingAoePacketClass.strictRollOutcome
  .aoeBlastDamageByTarget[aoePacketBlockader.pieceKey].damageColumn, undefined);
const aoePacketSidePending = applyCurrentStrictRulesV1Action(aoePacketState, {
  actionKey: aoePacketAction.actionKey,
  ...warmachineExactChanceClassActionPatch(damagingAoePacketClass),
});
assert.equal(aoePacketSidePending.ok, true, aoePacketSidePending.reason);
assert.deepEqual(aoePacketSidePending.nextState.colossalDamageGridSideWindow?.strictOutcomePath,
  ["aoeBlastDamageByTarget", aoePacketBlockader.pieceKey]);
const aoePacketRightChoice = enumerateCurrentStrictRulesV1Actions(aoePacketSidePending.nextState).actions.find((entry) =>
  entry.actionType === "colossal_damage_grid_side_right");
assert.ok(aoePacketRightChoice);
const aoePacketColumnChance = buildWarmachineExactActionChanceClasses(aoePacketRightChoice, {
  state: aoePacketSidePending.nextState,
});
assert.equal(aoePacketColumnChance.exactComplete, true);
const aoePacketResolved = applyCurrentStrictRulesV1Action(aoePacketSidePending.nextState, {
  actionKey: aoePacketRightChoice.actionKey,
  ...warmachineExactChanceClassActionPatch(aoePacketColumnChance.classes[0]),
});
assert.equal(aoePacketResolved.ok, true, aoePacketResolved.reason);

const boxedEffect = {
  atomKey: "excarnate_box_living_enemy_warrior_rfp_add_grunt",
  hookKey: "model_boxed",
  effectType: "excarnate_box_living_enemy_warrior_rfp_add_grunt_boxed_rfp_return_grunt",
  active: true,
  conditionMatched: true,
};
const boundedBoxedAction = {
  ...action,
  metadata: {
    ...action.metadata,
    attackResolution: {
      ...action.metadata.attackResolution,
      damageRollDistribution: { outcomes: [{ damage: 11 }] },
      criticalDamageRollDistribution: { outcomes: [{ damage: 11 }] },
    },
    ruleAtomEffects: [boxedEffect],
    specialRuleAnalysis: {
      effects: [
        { effectType: boxedEffect.effectType },
        { effectType: "source_backed_profile_rule_atom_contract" },
      ],
      ruleAtomEffects: [],
      ruleAtomDiagnostics: [],
      unresolvedRuleKeys: [],
    },
  },
};
const boxedTargetState = {
  pieces: [{
    pieceKey: action.targetPieceKey,
    isWarrior: true,
    modelRole: "warrior",
    damage: { boxesRemaining: 24, maxBoxes: 24 },
  }],
};
const boxedEffectUnreachable = buildWarmachineExactActionChanceClasses(
  boundedBoxedAction,
  { state: boxedTargetState },
);
assert.equal(boxedEffectUnreachable.exactComplete, true);
assert.deepEqual(boxedEffectUnreachable.provablyInactiveSuccessorEffectTypes, [
  boxedEffect.effectType,
]);
const boxedEffectReachable = buildWarmachineExactActionChanceClasses(
  boundedBoxedAction,
  {
    state: {
      pieces: [{
        ...boxedTargetState.pieces[0],
        damage: { boxesRemaining: 10, maxBoxes: 24 },
      }],
    },
  },
);
assert.equal(boxedEffectReachable.exactComplete, false);
assert.ok(boxedEffectReachable.reasons.includes("rule_atom_effects_present"));

const sequentialRerollStateInput = structuredClone(normalizedState);
sequentialRerollStateInput.strictMode = true;
sequentialRerollStateInput.metadata = {
  ...(sequentialRerollStateInput.metadata || {}),
  strictMode: true,
  exactWarmachineLegality: true,
};
const sequentialRerollActor = sequentialRerollStateInput.pieces.find((piece) =>
  piece.pieceKey === action.actorPieceKey);
sequentialRerollActor.activated = false;
sequentialRerollActor.attackProfiles = [{
  ...structuredClone(action.metadata.attackProfile),
  profileKey: "search-sequential-reroll-profile",
  attackRerollEffects: [{
    sourceKey: "search_test_reroll",
    ruleKey: "search_test_reroll",
    condition: "any",
    maximumRerollsPerRoll: 1,
    exactWithinScope: true,
  }],
  damageRerollEffects: [],
}];
const sequentialRerollState = normalizeCurrentStrictRulesV1State(sequentialRerollStateInput);
const sequentialRerollAction = enumerateCurrentStrictRulesV1Actions(sequentialRerollState, {
  actorPieceKeys: [action.actorPieceKey],
}).actions.find((entry) =>
  entry.actionType === action.actionType &&
  entry.targetPieceKey === action.targetPieceKey &&
  entry.metadata?.attackProfile?.profileKey === "search-sequential-reroll-profile");
assert.ok(sequentialRerollAction);
const sequentialBaseChance = buildWarmachineExactActionChanceClasses(sequentialRerollAction, {
  state: sequentialRerollState,
});
assert.equal(sequentialBaseChance.exactComplete, true,
  "an available reroll must remain a later player decision rather than invalidating the initial Chance support");
const observedReroll = applyCurrentStrictRulesV1Action(sequentialRerollState, {
  actionKey: sequentialRerollAction.actionKey,
  metadata: {
    strictRollOutcome: { attackDice: [1, 1], damageDice: [1, 1] },
  },
});
assert.equal(observedReroll.ok, true);
assert.equal(observedReroll.reason, "reroll_post_roll_decision_required");
const rerollDecisionEnumeration = enumerateCurrentStrictRulesV1Actions(observedReroll.nextState);
const searchRerollUse = rerollDecisionEnumeration.actions.find((entry) =>
  entry.actionType === "reroll_use_roll");
const searchRerollDecline = rerollDecisionEnumeration.actions.find((entry) =>
  entry.actionType === "reroll_decline_roll");
assert.ok(searchRerollUse);
assert.ok(searchRerollDecline);
const exactRerollChance = buildWarmachineExactActionChanceClasses(searchRerollUse, {
  state: observedReroll.nextState,
});
assert.equal(exactRerollChance.exactComplete, true);
assert.equal(exactRerollChance.massNumerator, 36);
assert.equal(exactRerollChance.massDenominator, 36);
assert.equal(exactRerollChance.classCount, 21);
const rerolledMissClass = exactRerollChance.classes.find((entry) =>
  JSON.stringify(entry.rerollDice) === JSON.stringify([1, 1]));
assert.ok(rerolledMissClass);
const rerolledMissTransition = applyCurrentStrictRulesV1Action(observedReroll.nextState, {
  actionKey: searchRerollUse.actionKey,
  ...warmachineExactChanceClassActionPatch(rerolledMissClass),
});
assert.equal(rerolledMissTransition.ok, true);
assert.equal(rerolledMissTransition.nextState.rerollWindow, null);
assert.ok(rerolledMissTransition.events.some((event) =>
  event.eventType === "strict_roll_outcome_applied" &&
  event.outcome?.attackRerollUsed === true &&
  event.outcome?.hit === false));
const exactRerollDecline = buildWarmachineExactActionChanceClasses(searchRerollDecline, {
  state: observedReroll.nextState,
});
assert.equal(exactRerollDecline.exactComplete, true);
assert.equal(exactRerollDecline.classCount, 1);
assert.equal(exactRerollDecline.chanceKind, "deterministic_reroll_decline");
assert.ok(boxedEffectReachable.reasons.includes("special_rule_effects_present"));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_search_chance_outcomes_v1",
  exactClassCount: exact.classCount,
  exactMass: [exact.massNumerator, exact.massDenominator],
  partialBounds: [partial.lowerBound, partial.upperBound],
  unsupportedSpecialReasons: special.reasons,
  preChanceResolvedEffectTypes: preChanceResolved.preChanceResolvedEffectTypes,
  preChanceOutcomeRequirementReasons: preChanceOutcomeRequirement.reasons,
  killingSpreeToughExactMass: [killingSpreeTough.massNumerator, killingSpreeTough.massDenominator],
  stateBoundSimpleWarriorClassCount: simpleWarrior.classCount,
  conditionalGridClassCount: conditionalGrid.classCount,
  sequentialColossalBaseChanceMass: [
    sequentialColossalBase.massNumerator,
    sequentialColossalBase.massDenominator,
  ],
  compositeColossalChanceMass: [
    compositeColossalChance.massNumerator,
    compositeColossalChance.massDenominator,
  ],
  compositeColossalChanceClassCount: compositeColossalChance.classCount,
  assaultColossalChanceMass: [
    assaultColossalChance.massNumerator,
    assaultColossalChance.massDenominator,
  ],
  cavalryColossalChanceMass: [
    cavalryColossalChance.massNumerator,
    cavalryColossalChance.massDenominator,
  ],
  cavalryCompositeIncludesPrimaryAttack: damagingCavalryClass.packetOutcomes.some((packet) =>
    packet.outcomeRole === "primary"),
  sprayPacketChanceMass: [sprayPacketChance.massNumerator, sprayPacketChance.massDenominator],
  aoePacketChanceMass: [aoePacketChance.massNumerator, aoePacketChance.massDenominator],
  engineExecutedChanceClassCount,
  boxedEffectUnreachableExact: boxedEffectUnreachable.exactComplete,
  boxedEffectReachableReasons: boxedEffectReachable.reasons,
  sequentialRerollInitialChanceMass: [
    sequentialBaseChance.massNumerator,
    sequentialBaseChance.massDenominator,
  ],
  sequentialRerollReplacementChanceMass: [
    exactRerollChance.massNumerator,
    exactRerollChance.massDenominator,
  ],
  rerollPlayerChoiceSeparatedFromChance: true,
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_chance_outcomes_parity_v1",
  parityCounts,
  legacyClassParityQuarantined: true,
}, null, 2));
