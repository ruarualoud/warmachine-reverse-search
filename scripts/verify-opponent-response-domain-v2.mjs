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
  activationDomainReactionDebtVisible: true,
  chanceMassAssigned: receipt.chanceMassAssigned,
}, null, 2));
