import assert from "node:assert/strict";

import {
  buildWarmachineRulesV1StateFromLayer3Room,
  enumerateRulesV1Actions,
} from "../src/warmachine-host-runtime.mjs";
import {
  advanceWarmachineOpponentResponseWorklistV2,
  buildWarmachineOpponentResponseDomainV2,
} from "../src/search/opponent-response-domain-v2.mjs";
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
  activationDomainReactionDebtVisible: true,
  chanceMassAssigned: receipt.chanceMassAssigned,
}, null, 2));
