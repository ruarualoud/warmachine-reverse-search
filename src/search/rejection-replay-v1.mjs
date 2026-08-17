import { createHash } from "node:crypto";

import {
  applyRulesV1Action,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
} from "../warmachine-host-runtime.mjs";
import {
  buildWarmachineStrictRejectionRefinement,
  promoteWarmachineCegarExactRejectionProof,
} from "./cegar-v1.mjs";

export const WARMACHINE_SEARCH_REJECTION_REPLAY_SCHEMA = "warmachine_search_rejection_replay_v1";

function stableHash(value, length = 24) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, length);
}

function rejectionReason(action = {}) {
  return String(action.rejection?.reason || action.reason || "strict_enumerator_rejected_action");
}

function eventSignature(events = []) {
  return events.map((event) => ({
    eventType: String(event.eventType || ""),
    reason: String(event.reason || ""),
    actorPieceKey: String(event.actorPieceKey || ""),
    targetPieceKey: String(event.targetPieceKey || ""),
    actionKey: String(event.actionKey || ""),
  }));
}

function replayAttempt(enumeration = {}, rejectedAction = {}) {
  const beforeFingerprint = stableHash(enumeration.state);
  const transition = applyRulesV1Action(enumeration.state, {
    ...rejectedAction,
    __warmachineTrustedRulesV1Enumeration: enumeration,
  });
  return {
    ok: transition.ok === true,
    reason: String(transition.reason || ""),
    eventSignature: eventSignature(transition.events || []),
    beforeFingerprint,
    afterFingerprint: stableHash(transition.nextState || enumeration.state),
    stateMutationBlocked: transition.nextState === enumeration.state ||
      stableHash(transition.nextState || {}) === beforeFingerprint,
  };
}

function unsafeRejectionReason(reason = "") {
  return /pending|outcome_required|required_outcome|roll_outcome|rng|reaction.*required|choice.*required|unknown|unmodeled|unsupported|source_contract|rule_atom/i
    .test(String(reason));
}

export function replayWarmachineExactRejectedAction(inputState = {}, actionKey = "", rawOptions = {}) {
  const normalizedInput = normalizeRulesV1State(inputState);
  const enumerationOptions = rawOptions.enumerationOptions || {};
  const firstEnumeration = enumerateRulesV1Actions(normalizedInput, enumerationOptions);
  const secondEnumeration = enumerateRulesV1Actions(normalizedInput, enumerationOptions);
  const key = String(actionKey || "");
  const firstRejected = (firstEnumeration.rejectedActions || []).find((action) => action.actionKey === key) || null;
  const secondRejected = (secondEnumeration.rejectedActions || []).find((action) => action.actionKey === key) || null;
  const firstLegal = (firstEnumeration.actions || []).some((action) => action.actionKey === key);
  const secondLegal = (secondEnumeration.actions || []).some((action) => action.actionKey === key);
  const firstReason = rejectionReason(firstRejected || {});
  const secondReason = rejectionReason(secondRejected || {});
  const firstReplay = firstRejected ? replayAttempt(firstEnumeration, firstRejected) : null;
  const secondReplay = secondRejected ? replayAttempt(secondEnumeration, secondRejected) : null;
  const sameNormalizedState = stableHash(firstEnumeration.state) === stableHash(secondEnumeration.state);
  const sameRejectedPayload = Boolean(firstRejected && secondRejected &&
    stableHash(firstRejected) === stableHash(secondRejected));
  const sameRejection = Boolean(firstReplay && secondReplay &&
    firstReason === secondReason &&
    firstReplay.ok === false && secondReplay.ok === false &&
    firstReplay.reason === secondReplay.reason &&
    stableHash(firstReplay.eventSignature) === stableHash(secondReplay.eventSignature));
  const mutationBlocked = Boolean(firstReplay?.stateMutationBlocked && secondReplay?.stateMutationBlocked);
  const exactRejectProven = Boolean(
    key && firstRejected && secondRejected && !firstLegal && !secondLegal &&
    sameNormalizedState && sameRejectedPayload && sameRejection && mutationBlocked &&
    !unsafeRejectionReason(firstReason) && !unsafeRejectionReason(firstReplay?.reason),
  );
  const blockers = [
    ...(!key ? ["missing_action_key"] : []),
    ...(!firstRejected || !secondRejected ? ["action_not_rejected_in_two_fresh_enumerations"] : []),
    ...(firstLegal || secondLegal ? ["action_appeared_in_legal_action_space"] : []),
    ...(!sameNormalizedState ? ["fresh_enumeration_state_mismatch"] : []),
    ...(!sameRejectedPayload ? ["rejected_action_payload_mismatch"] : []),
    ...(!sameRejection ? ["strict_rejection_replay_mismatch"] : []),
    ...(!mutationBlocked ? ["rejected_transition_mutated_state"] : []),
    ...(unsafeRejectionReason(firstReason) || unsafeRejectionReason(firstReplay?.reason)
      ? ["rejection_depends_on_unresolved_choice_chance_or_rule_coverage"] : []),
  ];
  const stateFingerprint = stableHash(firstEnumeration.state);
  const baseRefinement = buildWarmachineStrictRejectionRefinement({
    stateFingerprint,
    actionKey: key,
    actionType: firstRejected?.actionType || secondRejected?.actionType || "",
    reason: firstReason,
    eventTypes: firstReplay?.eventSignature?.map((event) => event.eventType) || [],
    trustedEnumeratedLegalAction: false,
  });
  const proof = {
    schemaVersion: WARMACHINE_SEARCH_REJECTION_REPLAY_SCHEMA,
    proofKey: `exact-rejection-replay-${stableHash({
      stateFingerprint,
      actionKey: key,
      enumerationOptions,
      firstReason,
      firstReplay,
      secondReplay,
    })}`,
    stateFingerprint,
    actionKey: key,
    actionType: firstRejected?.actionType || secondRejected?.actionType || "",
    enumerationOptionsFingerprint: stableHash(enumerationOptions),
    actionPayloadFingerprint: firstRejected ? stableHash(firstRejected) : "",
    enumeratorEvidence: {
      firstRejected: Boolean(firstRejected),
      secondRejected: Boolean(secondRejected),
      firstLegal,
      secondLegal,
      rejectionReason: firstReason,
      sameRejectedPayload,
    },
    executorEvidence: { firstReplay, secondReplay, sameRejection, mutationBlocked },
    exactRejectProven,
    hardPruneAllowed: exactRejectProven,
    hardPruneScope: {
      sameStateFingerprintOnly: true,
      sameActionKeyOnly: true,
      sameEnumerationOptionsOnly: true,
      siblingActionsUnaffected: true,
      futureStatesUnaffected: true,
    },
    blockers,
    claimBoundary: exactRejectProven
      ? "Two fresh strict enumerate/apply pipelines agree that this exact action is rejected without state mutation. Only this exact state/action branch may be removed."
      : "The exact rejection did not satisfy duplicate strict replay proof; the branch remains unresolved or absent without a hard-prune claim.",
  };
  return {
    ...proof,
    cegarRefinement: promoteWarmachineCegarExactRejectionProof(baseRefinement, proof),
  };
}
