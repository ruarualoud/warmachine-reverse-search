import assert from "node:assert/strict";

import {
  applyRulesV1Action,
  buildWarmachineRulesV1StateFromLayer3Room,
  enumerateRulesV1Actions,
} from "../src/warmachine-host-runtime.mjs";
import {
  advanceWarmachineOpponentResponseWorklistV2,
  buildWarmachineOpponentResponseDomainV2,
} from "../src/search/opponent-response-domain-v2.mjs";
import {
  advanceWarmachineCurrentDecisionWindowV1,
  buildWarmachineCurrentDecisionWindowDomainV1,
} from "../src/search/current-decision-window-domain-v1.mjs";
import { exhaustWarmachineCompleteActivationDomainV2 } from
  "../src/search/complete-activation-domain-v2.mjs";

function counterchargeRoom() {
  return {
    id: "search-opponent-response-domain-v2",
    game: {
      width: 48,
      height: 48,
      phase: "activation",
      clockActivePlayer: 1,
      turnNumber: 1,
      strictMode: true,
      strictRun: true,
      enforceStrictExecutor: true,
    },
    tokens: {
      mover: {
        id: "mover",
        pieceKey: "mover",
        label: "Mover",
        sourceListOwner: "player1",
        x: 8,
        y: 8,
        width: 1.18,
        speedIn: 6,
        maxMeleeRange: 1,
        meleePower: 12,
        mat: 6,
        defense: 12,
        armor: 12,
        resource1: 10,
        resource1Max: 10,
      },
      reactor: {
        id: "reactor",
        pieceKey: "reactor",
        label: "Countercharger",
        sourceListOwner: "player2",
        x: 16,
        y: 8,
        width: 1.18,
        speedIn: 6,
        maxMeleeRange: 1,
        meleePower: 14,
        mat: 7,
        defense: 12,
        armor: 12,
        resource1: 10,
        resource1Max: 10,
        specialRules: ["Countercharge"],
      },
    },
    logs: {},
    widgets: {},
    shapes: {},
    deployments: {},
  };
}

function defensiveStrikeRoom() {
  const room = counterchargeRoom();
  room.id = "search-opponent-response-domain-v2-defensive-strike-chance";
  room.tokens.reactor.x = 14;
  room.tokens.reactor.maxMeleeRange = 2;
  room.tokens.reactor.specialRules = ["Defensive Strike"];
  room.tokens.reactor.attackProfiles = [{
    profileKey: "defensive-strike-blade",
    name: "Defensive Strike Blade",
    mode: "melee",
    rangeIn: 2,
    power: 14,
    attackStat: 7,
    attackStatKind: "MAT",
  }];
  return room;
}

function twoCounterchargeRoom() {
  const room = counterchargeRoom();
  room.id = "search-opponent-response-domain-v2-sequential";
  room.tokens.mover.damage = { maxBoxes: 1, boxesRemaining: 1 };
  room.tokens.reactor.mat = 100;
  room.tokens.reactor.meleePower = 100;
  room.tokens.reactor2 = {
    ...structuredClone(room.tokens.reactor),
    id: "reactor2",
    pieceKey: "reactor2",
    label: "Countercharger 2",
    y: 10,
  };
  return room;
}

function twoFreeStrikeRoom() {
  const room = counterchargeRoom();
  room.id = "search-opponent-response-domain-v2-sequential-free-strike";
  room.tokens.mover.damage = { maxBoxes: 1, boxesRemaining: 1 };
  delete room.tokens.reactor.specialRules;
  room.tokens.reactor.x = 8;
  room.tokens.reactor.y = 9.4;
  room.tokens.reactor.mat = 100;
  room.tokens.reactor.meleePower = 100;
  room.tokens.reactor2 = {
    ...structuredClone(room.tokens.reactor),
    id: "reactor2",
    pieceKey: "reactor2",
    label: "Free Striker 2",
    y: 6.6,
  };
  return room;
}

function sameReactorMultipleRuleState() {
  const state = simultaneousPlacementDefensiveStrikeState();
  const mover = structuredClone(state.pieces.find((piece) => piece.pieceKey === "unit-mover"));
  const reactor = structuredClone(state.pieces.find((piece) => piece.pieceKey === "placement-reactor"));
  mover.pieceKey = "multi-rule-mover";
  mover.label = "multi-rule-mover";
  mover.modelType = "solo";
  mover.unitGroupId = "";
  mover.position = { xIn: 5, yIn: 5 };
  mover.damage = { boxesRemaining: 20, maxBoxes: 20 };
  reactor.pieceKey = "multi-rule-reactor";
  reactor.label = "multi-rule-reactor";
  reactor.position = { xIn: 10, yIn: 5 };
  reactor.specialRules = ["Defensive Strike", "Admonition"];
  reactor.attackProfiles = [{
    profileKey: "multi-rule-reactor-blade",
    name: "multi-rule-reactor blade",
    mode: "melee",
    rangeIn: 1,
    power: 0,
    attackStatKind: "MAT",
    attackStat: 100,
  }];
  state.stateKey = "opponent-response-domain-v2-same-reactor-multiple-rules";
  state.pieces = [mover, reactor];
  state.movementPaths = [{
    actorPieceKey: mover.pieceKey,
    actionType: "advance",
    key: "same-reactor-multiple-rules",
    waypoints: [{ xIn: 8.4, yIn: 5 }],
  }];
  return state;
}

function simultaneousPlacementDefensiveStrikeState() {
  const melee = (pieceKey, power = 10) => ({
    profileKey: `${pieceKey}-blade`,
    name: `${pieceKey} blade`,
    mode: "melee",
    rangeIn: 1,
    power,
    attackStatKind: "MAT",
    attackStat: 100,
  });
  const piece = ({
    pieceKey,
    sideKey = "player1",
    xIn,
    yIn,
    unitGroupId = "",
    specialRules = [],
    power = 10,
  }) => ({
    pieceKey,
    label: pieceKey,
    sideKey,
    modelRole: "warrior",
    modelType: unitGroupId ? "unit" : "solo",
    unitGroupId,
    position: { xIn, yIn },
    baseSizeIn: 1.18,
    speedIn: 6,
    meleeRangeIn: 1,
    mat: 100,
    defense: 12,
    armor: 12,
    damage: { boxesRemaining: 5, maxBoxes: 5 },
    statusTags: [],
    specialRules,
    attackProfiles: [melee(pieceKey, power)],
  });
  return {
    stateKey: "opponent-response-domain-v2-simultaneous-placement",
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 1,
    strictMode: true,
    enforceStrictExecutor: true,
    board: { widthIn: 24, heightIn: 24 },
    pieces: [
      piece({ pieceKey: "unit-mover", xIn: 5, yIn: 5, unitGroupId: "unit" }),
      piece({ pieceKey: "placed-one", xIn: 5, yIn: 7, unitGroupId: "unit" }),
      piece({ pieceKey: "placed-two", xIn: 5, yIn: 9, unitGroupId: "unit" }),
      piece({
        pieceKey: "placement-reactor",
        sideKey: "player2",
        xIn: 12,
        yIn: 8,
        specialRules: ["Defensive Strike"],
        power: 100,
      }),
    ],
    movementPaths: [{
      actorPieceKey: "unit-mover",
      actionType: "advance",
      key: "simultaneous-placement",
      pathsByModel: {
        "unit-mover": { waypoints: [{ xIn: 8.8, yIn: 8 }] },
        "placed-one": { waypoints: [{ xIn: 10.2, yIn: 7.3 }] },
        "placed-two": { waypoints: [{ xIn: 10.2, yIn: 8.7 }] },
      },
    }],
    terrain: [],
    scenario: {
      zones: [],
      flags: [],
      score: { player1: 0, player2: 0 },
      victoryThreshold: 5,
    },
  };
}

function damageTransferPiece(overrides = {}) {
  const boxesRemaining = overrides.boxesRemaining ?? 12;
  return {
    pieceKey: overrides.pieceKey || "piece",
    label: overrides.label || overrides.pieceKey || "Piece",
    sideKey: overrides.sideKey || "player1",
    modelRole: overrides.modelRole || "warrior",
    modelType: overrides.modelType || overrides.modelRole || "warrior",
    position: overrides.position || { xIn: 6, yIn: 6 },
    baseSizeIn: overrides.baseSizeIn ?? 1.18,
    speedIn: 6,
    meleeRangeIn: 1,
    defense: overrides.defense ?? 10,
    armor: overrides.armor ?? 10,
    mat: overrides.mat ?? 8,
    resourceKind: overrides.resourceKind || "none",
    resourcePoints: overrides.resourcePoints ?? 0,
    resourceMax: overrides.resourceMax ?? 0,
    controlRangeIn: overrides.controlRangeIn ?? 12,
    damage: { boxesRemaining, maxBoxes: overrides.maxBoxes ?? boxesRemaining },
    statusTags: [],
    attackProfiles: overrides.attackProfiles || [],
    ...overrides,
  };
}

function damageTransferLifeSpiral() {
  const aspectKeys = ["mind", "body", "spirit"];
  return {
    boxesRemaining: 27,
    maxBoxes: 27,
    systems: { mind: 9, body: 9, spirit: 9 },
    lifeSpiralRows: Array.from({ length: 9 }, (_entry, rowIndex) =>
      Array.from({ length: 3 }, () => ({
        systemKey: aspectKeys[Math.floor(rowIndex / 3)],
        marked: false,
      }))),
  };
}

function damageTransferState() {
  return {
    stateKey: "opponent-response-domain-v2-damage-transfer",
    activeSideKey: "player2",
    phaseKey: "activation",
    turnNumber: 2,
    strictMode: true,
    enforceStrictExecutor: true,
    board: { widthIn: 48, heightIn: 48 },
    pieces: [
      damageTransferPiece({
        pieceKey: "defender-lock",
        modelRole: "warlock",
        modelType: "warlock",
        isWarlock: true,
        isWarrior: true,
        resourceKind: "fury",
        resourcePoints: 1,
        resourceMax: 6,
        battlegroupId: "defender-bg",
        boxesRemaining: 5,
        maxBoxes: 5,
      }),
      damageTransferPiece({
        pieceKey: "defender-beast",
        modelRole: "warbeast",
        modelType: "warbeast",
        position: { xIn: 9, yIn: 6 },
        baseSizeIn: 1.57,
        resourceKind: "fury",
        resourcePoints: 0,
        resourceMax: 4,
        controllerPieceKey: "defender-lock",
        battlegroupId: "defender-bg",
        damage: damageTransferLifeSpiral(),
      }),
      damageTransferPiece({
        pieceKey: "attacker",
        sideKey: "player2",
        modelRole: "warjack",
        modelType: "warjack",
        position: { xIn: 7, yIn: 6 },
        attackProfiles: [{
          profileKey: "execution-blade",
          name: "Execution Blade",
          mode: "melee",
          rangeIn: 1,
          power: 10,
          attackStat: 8,
          attackStatKind: "MAT",
        }],
      }),
    ],
    terrain: [],
    scenario: {
      zones: [],
      flags: [],
      score: { player1: 0, player2: 0 },
      victoryThreshold: 5,
    },
  };
}

const state = buildWarmachineRulesV1StateFromLayer3Room(counterchargeRoom());
const enumeration = enumerateRulesV1Actions(state);
const action = enumeration.actions.find((candidate) =>
  candidate.actorPieceKey === "mover" &&
  candidate.metadata?.reactionResolutionRequirements?.some((row) =>
    row.ruleKey === "countercharge"));
assert.ok(action, "a real strict movement action must expose Countercharge");

const domain = buildWarmachineOpponentResponseDomainV2(action, enumeration);
assert.equal(domain.requirementCount, 1);
assert.equal(domain.opponentQuantifier, "opponent_and");
assert.equal(domain.finiteDeclaredChoiceProductWellFormed, true);
assert.equal(domain.reactionOrderDomainComplete, true);
assert.equal(domain.destinationParameterDomainComplete, false);
assert.equal(domain.reactionChanceOutcomeDomainComplete, false);
assert.ok(BigInt(domain.declaredFiniteChoiceCandidateCount) > 1n);
assert.equal(domain.requirementRows[0].options[0].choice, "decline");
assert.ok(domain.requirementRows[0].options.some((option) =>
  option.choice === "use" && option.destinationOptionId));

const defensiveStrikeState = buildWarmachineRulesV1StateFromLayer3Room(
  defensiveStrikeRoom(),
);
const defensiveStrikeEnumeration = enumerateRulesV1Actions(defensiveStrikeState);
const defensiveStrikeAction = defensiveStrikeEnumeration.actions.find((candidate) =>
  candidate.actorPieceKey === "mover" &&
  candidate.metadata?.reactionResolutionRequirements?.some((row) =>
    row.ruleKey === "defensive_strike"));
assert.ok(defensiveStrikeAction, "a real strict movement action must expose Defensive Strike");
const defensiveStrikeDomain = buildWarmachineOpponentResponseDomainV2(
  defensiveStrikeAction,
  defensiveStrikeEnumeration,
);
assert.equal(defensiveStrikeDomain.requirementCount, 1);
assert.equal(defensiveStrikeDomain.destinationParameterDomainComplete, true);
assert.equal(defensiveStrikeDomain.reactionChanceOutcomeDomainComplete, true,
  "one plain no-destination Defensive Strike must expose exact attack/damage Chance rather than one sampled roll");
const defensiveStrikeUseOptions = defensiveStrikeDomain.requirementRows[0].options.filter((option) =>
  option.choice === "use");
assert.equal(defensiveStrikeUseOptions.length, 1,
  "Chance classes must remain nested below one opponent use choice rather than becoming adversarial choices");
assert.equal(defensiveStrikeUseOptions.every((option) => option.chanceOutcomeExact === true), true);
assert.ok(defensiveStrikeUseOptions[0].chanceModel.classCount > 1);
assert.equal(defensiveStrikeUseOptions[0].chanceModel.massNumerator,
  defensiveStrikeUseOptions[0].chanceModel.massDenominator);
const defensiveStrikeReceipt = advanceWarmachineOpponentResponseWorklistV2(
  defensiveStrikeState,
  defensiveStrikeAction.actionKey,
  { candidateBudget: 10000 },
);
assert.equal(defensiveStrikeReceipt.declaredFiniteChoiceProductComplete, true);
assert.equal(defensiveStrikeReceipt.reactionChanceOutcomeDomainComplete, true);
assert.equal(defensiveStrikeReceipt.opponentResponseDomainComplete, true);
assert.equal(defensiveStrikeReceipt.strictRejectedCount, "0");
assert.equal(defensiveStrikeReceipt.pendingSpecialResolutionCount, "0");
assert.equal(defensiveStrikeReceipt.strictAcceptedCount,
  defensiveStrikeReceipt.declaredFiniteChoiceCandidateCount);
assert.equal(defensiveStrikeReceipt.completionDebts.includes(
  "opponent_reaction_chance_distribution_pending"), false);
const defensiveStrikeUseSample = defensiveStrikeReceipt.acceptedSamples.find((sample) =>
  sample.selectedOptions.some((option) => option.choice === "use"));
assert.ok(defensiveStrikeUseSample);
assert.equal(defensiveStrikeUseSample.successorChanceDistribution.reduce((sum, branch) =>
  sum + branch.numerator, 0),
defensiveStrikeUseSample.successorChanceDistribution[0].denominator);
assert.equal(defensiveStrikeUseSample.successorChanceDistribution.every((branch) =>
  branch.strictRejectedReason === ""), true);

const activationDomain = exhaustWarmachineCompleteActivationDomainV2(state, {
  pageLimit: 12,
});
const activationReactionDebts = activationDomain.continuousDomainDebts.filter(
  (debt) => debt.reason ===
    "opponent_response_use_decline_parameter_and_chance_domain_unresolved",
);
assert.ok(activationReactionDebts.length > 0);
assert.ok(activationReactionDebts.some((debt) =>
  debt.actionKeys.includes(action.actionKey)));
assert.ok(activationReactionDebts.every((debt) =>
  debt.opponentQuantifier === "opponent_and"));

let receipt = null;
let checkpoint = null;
let pageCount = 0;
do {
  receipt = advanceWarmachineOpponentResponseWorklistV2(
    state,
    action.actionKey,
    { candidateBudget: 4, checkpoint },
  );
  checkpoint = receipt.resumeCheckpoint;
  pageCount += 1;
  assert.ok(pageCount < 100);
} while (!receipt.declaredFiniteChoiceProductComplete);

assert.equal(receipt.ok, true);
assert.equal(receipt.accountingConserved, true);
assert.equal(receipt.pendingCandidateCount, "0");
assert.equal(
  BigInt(receipt.strictAcceptedCount) +
    BigInt(receipt.strictRejectedCount) +
    BigInt(receipt.pendingSpecialResolutionCount),
  BigInt(receipt.declaredFiniteChoiceCandidateCount),
);
assert.ok(BigInt(receipt.strictAcceptedCount) > 0n);
assert.equal(receipt.opponentResponseDomainComplete, false);
assert.ok(receipt.completionDebts.includes(
  "opponent_reaction_continuous_destination_domain_pending",
));
assert.ok(receipt.completionDebts.includes(
  "opponent_reaction_chance_distribution_pending",
));
assert.equal(receipt.chanceMassAssigned, false);
assert.ok(receipt.acceptedSamples.some((sample) =>
  sample.selectedOptions.some((option) => option.choice === "decline")));
assert.ok(receipt.acceptedSamples.some((sample) =>
  sample.transitionEventTypes.includes("reaction_countercharge_move")));

const tamperedCheckpoint = structuredClone(receipt.resumeCheckpoint);
tamperedCheckpoint.nextCandidateOffset = "0";
assert.throws(() => advanceWarmachineOpponentResponseWorklistV2(
  state,
  action.actionKey,
  { candidateBudget: 1, checkpoint: tamperedCheckpoint },
), /opponent_response_checkpoint_invalid/);

const quietAction = enumeration.actions.find((candidate) =>
  candidate.actorPieceKey === "mover" &&
  !(candidate.metadata?.reactionResolutionRequirements || []).length &&
  !(candidate.metadata?.freeStrikeResolutionRequirements || []).length);
assert.ok(quietAction);
const quietReceipt = advanceWarmachineOpponentResponseWorklistV2(
  state,
  quietAction.actionKey,
  { candidateBudget: 1 },
);
assert.equal(quietReceipt.requirementCount, 0);
assert.equal(quietReceipt.declaredFiniteChoiceCandidateCount, "1");
assert.equal(quietReceipt.opponentResponseDomainComplete, true);

const sequentialState = buildWarmachineRulesV1StateFromLayer3Room(
  twoCounterchargeRoom(),
);
const sequentialEnumeration = enumerateRulesV1Actions(sequentialState);
const sequentialAction = sequentialEnumeration.actions.find((candidate) =>
  candidate.actorPieceKey === "mover" &&
  candidate.metadata?.reactionResolutionRequirements?.length === 2);
assert.ok(sequentialAction, "one move must trigger both Countercharge models");
const sequentialDomain = buildWarmachineCurrentDecisionWindowDomainV1(
  sequentialState,
);
const sequentialSourceRow = sequentialDomain.optionRows.find((row) =>
  row.actionKey === sequentialAction.actionKey);
assert.equal(
  sequentialSourceRow.immediateResponseDomain.sequentialResponsePrefixStateAvailable,
  true,
);
assert.equal(
  sequentialSourceRow.immediateResponseDomain.dynamicEligibilityReevaluationComplete,
  true,
);
assert.ok(!sequentialSourceRow.unresolvedReasons.includes(
  "multiple_response_host_prefix_state_unavailable",
));

const opened = advanceWarmachineCurrentDecisionWindowV1(
  sequentialState,
  sequentialAction.actionKey,
);
assert.equal(opened.transitionAccepted, true);
assert.equal(opened.nextDecisionOwnerSideKey, "player2");
assert.ok(opened.nextStrictContinuationWindowFlags.includes(
  "strictEnemyEnterReactionWindowOnly",
));
assert.equal(opened.nextDecisionWindowDomain.acceptedOptionCount > 2, true);
const firstDecline = opened.nextDecisionWindowDomain.optionRows.find((row) =>
  row.disposition === "host_accepted" &&
  row.actionEvidence?.actorPieceKey === "reactor" &&
  row.actionEvidence?.actionType === "resolve_enemy_enter_reaction_window" &&
  /decline/.test(row.actionKey));
assert.ok(firstDecline);
const afterDecline = advanceWarmachineCurrentDecisionWindowV1(
  opened.successorState,
  firstDecline.actionKey,
);
assert.equal(afterDecline.transitionAccepted, true);
assert.equal(afterDecline.nextDecisionOwnerSideKey, "player2");
assert.ok(afterDecline.nextStrictContinuationWindowFlags.includes(
  "strictEnemyEnterReactionWindowOnly",
));
const remainingReactionActors = new Set(
  afterDecline.nextDecisionWindowDomain.optionRows
    .filter((row) => row.disposition === "host_accepted")
    .map((row) => row.actionEvidence?.actorPieceKey),
);
assert.deepEqual([...remainingReactionActors], ["reactor2"]);
const secondDecline = afterDecline.nextDecisionWindowDomain.optionRows.find((row) =>
  row.disposition === "host_accepted" && /decline/.test(row.actionKey));
assert.ok(secondDecline);
const afterBothDecline = advanceWarmachineCurrentDecisionWindowV1(
  afterDecline.successorState,
  secondDecline.actionKey,
);
assert.equal(afterBothDecline.transitionAccepted, true);
assert.ok(!afterBothDecline.nextStrictContinuationWindowFlags.includes(
  "strictEnemyEnterReactionWindowOnly",
));

const firstUse = opened.nextDecisionWindowDomain.optionRows.find((row) =>
  row.disposition === "host_accepted" &&
  /:use:/.test(row.actionKey));
assert.ok(firstUse);
const afterLethalReaction = advanceWarmachineCurrentDecisionWindowV1(
  opened.successorState,
  firstUse.actionKey,
);
assert.equal(afterLethalReaction.transitionAccepted, true);
assert.equal(
  afterLethalReaction.successorState.pieces.find((piece) =>
    piece.pieceKey === "mover")?.destroyed,
  true,
);
assert.ok(!afterLethalReaction.nextStrictContinuationWindowFlags.includes(
  "strictEnemyEnterReactionWindowOnly",
));

const staleWindowState = structuredClone(opened.successorState);
staleWindowState.enemyEnterReactionWindow.currentRequirements = [];
const staleWindowEnumeration = enumerateRulesV1Actions(staleWindowState);
assert.equal(staleWindowEnumeration.actionCount, 0);
assert.equal(staleWindowEnumeration.rejectedActionCount, 1);
assert.equal(staleWindowEnumeration.strictEnemyEnterReactionWindowOnly, true);
assert.ok(staleWindowEnumeration.rejectedActions[0].legality.checks.some(
  (check) => check.code ===
    "STRICT_ENEMY_ENTER_REACTION_WINDOW_INVALID_V20260915",
));
const staleWindowTransition = applyRulesV1Action(
  staleWindowState,
  sequentialAction,
);
assert.equal(staleWindowTransition.ok, false);
assert.equal(
  staleWindowTransition.reason,
  "strict_enemy_enter_reaction_window_invalid",
);
assert.equal(staleWindowTransition.nextState, staleWindowTransition.state);

const multiRuleState = sameReactorMultipleRuleState();
const multiRuleEnumeration = enumerateRulesV1Actions(multiRuleState);
const multiRuleAction = multiRuleEnumeration.actions.find((candidate) =>
  candidate.actionKey ===
    "multi-rule-mover:advance-path:same-reactor-multiple-rules:v1");
assert.ok(multiRuleAction);
assert.deepEqual(
  multiRuleAction.metadata.reactionResolutionRequirements.map((requirement) =>
    requirement.ruleKey).sort(),
  ["admonition", "defensive_strike"],
);
const multiRuleOpened = advanceWarmachineCurrentDecisionWindowV1(
  multiRuleState,
  multiRuleAction.actionKey,
);
assert.equal(multiRuleOpened.transitionAccepted, true);
const defensiveStrikeUse = multiRuleOpened.nextDecisionWindowDomain.optionRows.find((row) =>
  row.disposition === "host_accepted" &&
  /defensive-strike/.test(row.actionKey) &&
  /:use:/.test(row.actionKey));
assert.ok(defensiveStrikeUse);
const afterDefensiveStrikeUse = advanceWarmachineCurrentDecisionWindowV1(
  multiRuleOpened.successorState,
  defensiveStrikeUse.actionKey,
);
assert.equal(afterDefensiveStrikeUse.transitionAccepted, true);
assert.ok(afterDefensiveStrikeUse.nextDecisionWindowDomain.optionRows
  .filter((row) => row.disposition === "host_accepted")
  .every((row) => /admonition/.test(row.actionKey)));
const admonitionDecline = afterDefensiveStrikeUse.nextDecisionWindowDomain.optionRows.find((row) =>
  row.disposition === "host_accepted" && /decline/.test(row.actionKey));
assert.ok(admonitionDecline);
const afterMultiRuleResolution = advanceWarmachineCurrentDecisionWindowV1(
  afterDefensiveStrikeUse.successorState,
  admonitionDecline.actionKey,
);
assert.equal(afterMultiRuleResolution.transitionAccepted, true);
assert.ok(!afterMultiRuleResolution.nextStrictContinuationWindowFlags.includes(
  "strictEnemyEnterReactionWindowOnly",
));
assert.ok(afterMultiRuleResolution.successorState.pieces.find((piece) =>
  piece.pieceKey === "multi-rule-reactor")?.ruleAtomState?.oncePerTurnUseKeys?.some((key) =>
  key.startsWith("defensive_strike_enemy_enters_melee_basic_melee_once_turn:")));

const placementState = simultaneousPlacementDefensiveStrikeState();
const placementEnumeration = enumerateRulesV1Actions(placementState);
const placementAction = placementEnumeration.actions.find((candidate) =>
  candidate.actionKey ===
    "unit-mover:advance-unit-path:simultaneous-placement:v1");
assert.ok(placementAction);
assert.equal(
  placementAction.metadata.sequentialEnemyEnterReactionWindowSupported,
  true,
);
assert.equal(
  placementAction.metadata.simultaneousPlacementEnemyEnterReactionWindowSupported,
  true,
);
assert.deepEqual(
  placementAction.metadata.reactionResolutionRequirements.map((requirement) =>
    requirement.targetPieceKey).sort(),
  ["placed-one", "placed-two"],
);
const placementResponseDomain = buildWarmachineOpponentResponseDomainV2(
  placementAction,
  placementEnumeration,
);
assert.equal(placementResponseDomain.finiteDeclaredChoiceProductWellFormed, false);
assert.ok(placementResponseDomain.validationIssues.some((issue) =>
  issue.startsWith("opponent_response_choice_projection_collision:")));
const placementOpened = advanceWarmachineCurrentDecisionWindowV1(
  placementState,
  placementAction.actionKey,
);
assert.equal(placementOpened.transitionAccepted, true);
assert.equal(placementOpened.nextDecisionOwnerSideKey, "player2");
assert.ok(placementOpened.nextStrictContinuationWindowFlags.includes(
  "strictEnemyEnterReactionWindowOnly",
));
assert.deepEqual(
  [...new Set(placementOpened.nextDecisionWindowDomain.optionRows
    .filter((row) => row.disposition === "host_accepted")
    .map((row) => row.actionEvidence?.targetPieceKey))].sort(),
  ["placed-one", "placed-two"],
);
const firstPlacementDecline =
  placementOpened.nextDecisionWindowDomain.optionRows.find((row) =>
    row.disposition === "host_accepted" &&
    row.actionEvidence?.targetPieceKey === "placed-one" &&
    /decline/.test(row.actionKey));
assert.ok(firstPlacementDecline);
const placementAfterDecline = advanceWarmachineCurrentDecisionWindowV1(
  placementOpened.successorState,
  firstPlacementDecline.actionKey,
);
assert.equal(placementAfterDecline.transitionAccepted, true);
assert.deepEqual(
  [...new Set(placementAfterDecline.nextDecisionWindowDomain.optionRows
    .filter((row) => row.disposition === "host_accepted")
    .map((row) => row.actionEvidence?.targetPieceKey))],
  ["placed-two"],
);
const secondPlacementUse =
  placementAfterDecline.nextDecisionWindowDomain.optionRows.find((row) =>
    row.disposition === "host_accepted" &&
    row.actionEvidence?.targetPieceKey === "placed-two" &&
    /:use:/.test(row.actionKey));
assert.ok(secondPlacementUse);
const placementAfterUse = advanceWarmachineCurrentDecisionWindowV1(
  placementAfterDecline.successorState,
  secondPlacementUse.actionKey,
);
assert.equal(placementAfterUse.transitionAccepted, true);
assert.equal(
  placementAfterUse.successorState.pieces.find((piece) =>
    piece.pieceKey === "placed-one")?.damage.boxesRemaining,
  5,
);
assert.equal(
  placementAfterUse.successorState.pieces.find((piece) =>
    piece.pieceKey === "placed-two")?.destroyed,
  true,
);
assert.ok(!placementAfterUse.nextStrictContinuationWindowFlags.includes(
  "strictEnemyEnterReactionWindowOnly",
));

const sequentialFreeStrikeState = buildWarmachineRulesV1StateFromLayer3Room(
  twoFreeStrikeRoom(),
);
sequentialFreeStrikeState.disengagementRuleMode = "legacy_free_strike";
const sequentialFreeStrikeEnumeration = enumerateRulesV1Actions(
  sequentialFreeStrikeState,
);
const sequentialFreeStrikeAction = sequentialFreeStrikeEnumeration.actions.find(
  (candidate) => candidate.actorPieceKey === "mover" &&
    candidate.metadata?.freeStrikeResolutionRequirements?.length === 2,
);
assert.ok(
  sequentialFreeStrikeAction,
  "one legacy disengagement must expose both Free Strike models",
);
assert.equal(
  sequentialFreeStrikeAction.metadata.sequentialFreeStrikeWindowSupported,
  true,
);
const sequentialFreeStrikeOpened = advanceWarmachineCurrentDecisionWindowV1(
  sequentialFreeStrikeState,
  sequentialFreeStrikeAction.actionKey,
);
assert.equal(sequentialFreeStrikeOpened.transitionAccepted, true);
assert.equal(sequentialFreeStrikeOpened.nextDecisionOwnerSideKey, "player2");
assert.ok(sequentialFreeStrikeOpened.nextStrictContinuationWindowFlags.includes(
  "strictFreeStrikeWindowOnly",
));
const firstFreeStrikeDecline =
  sequentialFreeStrikeOpened.nextDecisionWindowDomain.optionRows.find((row) =>
    row.disposition === "host_accepted" &&
    row.actionEvidence?.actorPieceKey === "reactor" &&
    row.actionEvidence?.actionType === "resolve_free_strike_window" &&
    /decline/.test(row.actionKey));
assert.ok(firstFreeStrikeDecline);
const afterFirstFreeStrikeDecline = advanceWarmachineCurrentDecisionWindowV1(
  sequentialFreeStrikeOpened.successorState,
  firstFreeStrikeDecline.actionKey,
);
assert.equal(afterFirstFreeStrikeDecline.transitionAccepted, true);
assert.ok(afterFirstFreeStrikeDecline.nextStrictContinuationWindowFlags.includes(
  "strictFreeStrikeWindowOnly",
));
assert.deepEqual(
  [...new Set(afterFirstFreeStrikeDecline.nextDecisionWindowDomain.optionRows
    .filter((row) => row.disposition === "host_accepted")
    .map((row) => row.actionEvidence?.actorPieceKey))],
  ["reactor2"],
);
const firstFreeStrikeUse =
  sequentialFreeStrikeOpened.nextDecisionWindowDomain.optionRows.find((row) =>
    row.disposition === "host_accepted" && /:use:/.test(row.actionKey));
assert.ok(firstFreeStrikeUse);
const afterLethalFreeStrike = advanceWarmachineCurrentDecisionWindowV1(
  sequentialFreeStrikeOpened.successorState,
  firstFreeStrikeUse.actionKey,
);
assert.equal(afterLethalFreeStrike.transitionAccepted, true);
assert.equal(
  afterLethalFreeStrike.successorState.pieces.find((piece) =>
    piece.pieceKey === "mover")?.destroyed,
  true,
);
assert.ok(!afterLethalFreeStrike.nextStrictContinuationWindowFlags.includes(
  "strictFreeStrikeWindowOnly",
));

const transferState = damageTransferState();
const transferEnumeration = enumerateRulesV1Actions(transferState);
const transferSourceAction = transferEnumeration.actions.find((candidate) =>
  candidate.actorPieceKey === "attacker" &&
  candidate.targetPieceKey === "defender-lock" &&
  candidate.metadata?.damageTransferDecisionChoice === "decline");
assert.ok(transferSourceAction);
assert.equal(
  transferSourceAction.metadata.sequentialDamageTransferWindowSupported,
  true,
);
const transferWindowOpened = advanceWarmachineCurrentDecisionWindowV1(
  transferState,
  transferSourceAction.actionKey,
  {
    actionPatch: {
      metadata: {
        strictRollOutcome: {
          attackDice: [6, 6],
          damageDice: [6, 6],
        },
      },
    },
  },
);
assert.equal(transferWindowOpened.transitionAccepted, true);
assert.equal(transferWindowOpened.nextDecisionOwnerSideKey, "player1");
assert.ok(transferWindowOpened.nextStrictContinuationWindowFlags.includes(
  "strictDamageTransferWindowOnly",
));
assert.ok(transferWindowOpened.transitionEvents.some((event) =>
  event.eventType === "strict_damage_transfer_window_opened" &&
  event.rawDamage === 12));
assert.ok(!transferWindowOpened.transitionEvents.some((event) =>
  event.eventType === "damage_applied"));
const declineTransfer = transferWindowOpened.nextDecisionWindowDomain.optionRows.find(
  (row) => row.disposition === "host_accepted" &&
    row.actionEvidence?.actionType === "resolve_damage_transfer_window" &&
    /decline/.test(row.actionKey),
);
const useTransfer = transferWindowOpened.nextDecisionWindowDomain.optionRows.find(
  (row) => row.disposition === "host_accepted" &&
    row.actionEvidence?.actionType === "resolve_damage_transfer_window" &&
    /transfer/.test(row.actionKey) && !/decline/.test(row.actionKey),
);
assert.ok(declineTransfer);
assert.ok(useTransfer);
const afterTransferDeclined = advanceWarmachineCurrentDecisionWindowV1(
  transferWindowOpened.successorState,
  declineTransfer.actionKey,
);
assert.equal(afterTransferDeclined.transitionAccepted, true);
assert.equal(
  afterTransferDeclined.successorState.pieces.find((piece) =>
    piece.pieceKey === "defender-lock")?.destroyed,
  true,
);
const afterTransferUsed = advanceWarmachineCurrentDecisionWindowV1(
  transferWindowOpened.successorState,
  useTransfer.actionKey,
);
assert.equal(afterTransferUsed.transitionAccepted, true);
const transferOwnerAfter = afterTransferUsed.successorState.pieces.find((piece) =>
  piece.pieceKey === "defender-lock");
const transferRecipientAfter = afterTransferUsed.successorState.pieces.find((piece) =>
  piece.pieceKey === "defender-beast");
assert.equal(transferOwnerAfter.destroyed, false);
assert.equal(transferOwnerAfter.damage.boxesRemaining, 5);
assert.equal(transferOwnerAfter.resourcePoints, 0);
assert.equal(transferRecipientAfter.damage.boxesRemaining, 15);
assert.ok(afterTransferUsed.transitionEvents.some((event) =>
  event.eventType === "damage_transferred" &&
  event.recipientPieceKey === "defender-beast"));

console.log(JSON.stringify({
  ok: true,
  marker: "opponent_response_domain_v2",
  actionKey: action.actionKey,
  requirementCount: domain.requirementCount,
  declaredFiniteChoiceCandidateCount:
    domain.declaredFiniteChoiceCandidateCount,
  strictAcceptedCount: receipt.strictAcceptedCount,
  strictRejectedCount: receipt.strictRejectedCount,
  pageCount,
  destinationParameterDomainComplete:
    receipt.destinationParameterDomainComplete,
  reactionChanceOutcomeDomainComplete:
    receipt.reactionChanceOutcomeDomainComplete,
  opponentResponseDomainComplete: receipt.opponentResponseDomainComplete,
  quietActionResponseDomainComplete:
    quietReceipt.opponentResponseDomainComplete,
  sequentialReactionWindowOpened: true,
  sequentialDeclineReenumeratedRemainingReactor: true,
  lethalFirstReactionRemovedSecondWindow: true,
  staleReactionWindowFailsClosed: true,
  simultaneousPlacementTargetsRemainDistinct: true,
  simultaneousPlacementDeclinePreservesOtherTarget: true,
  sequentialFreeStrikeWindowOpened: true,
  sequentialFreeStrikeDeclineReenumeratedRemainingEnemy: true,
  lethalFirstFreeStrikeRemovedSecondWindow: true,
  damageTransferWindowOpenedAfterDamageDetermined: true,
  damageTransferDeclineAndUseStrictApplied: true,
  activationDomainReactionDebtVisible: true,
  chanceMassAssigned: receipt.chanceMassAssigned,
}, null, 2));
