import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_OPPONENT_RESPONSE_SET_V1_SCHEMA =
  "warmachine_opponent_response_set_v1";

function actions(enumeration = {}) {
  return Array.isArray(enumeration.actions) ? enumeration.actions : [];
}

export function isWarmachineOpponentOwnedCompoundVariantV1(action = {}) {
  return action.metadata?.damageTransfer === true &&
    Boolean(action.metadata?.damageTransferDecisionGroupKey);
}

export function canonicalWarmachineActingSideActionsV1(enumeration = {}) {
  return actions(enumeration).filter((action) =>
    !isWarmachineOpponentOwnedCompoundVariantV1(action));
}

export function buildWarmachineOpponentResponseSetV1(action = {}, enumeration = {}) {
  const metadata = action.metadata || {};
  const decisionOptions = Array.isArray(metadata.damageTransferDecisionOptions)
    ? metadata.damageTransferDecisionOptions
    : [];
  if (
    metadata.damageTransferDecisionAvailable !== true ||
    metadata.damageTransferDecisionChoice !== "decline" ||
    !decisionOptions.length
  ) {
    const core = {
      schemaVersion: WARMACHINE_OPPONENT_RESPONSE_SET_V1_SCHEMA,
      actionKey: String(action.actionKey || ""),
      decisionKind: "none",
      decisionGroupKey: "",
      ownerSideKey: "",
      ownerPieceKey: "",
      responseSetComplete: true,
      responses: [{
        responseKey: "no_opponent_response",
        actionKey: String(action.actionKey || ""),
        action,
        choice: "none",
      }],
    };
    return { ...core, responseSetHash: stableGraphHash(stableGraphValue(core)) };
  }

  const actionByKey = new Map(actions(enumeration).map((candidate) =>
    [candidate.actionKey, candidate]));
  const responses = decisionOptions.map((option) => {
    const responseAction = actionByKey.get(option.actionKey) || null;
    return {
      responseKey: String(option.choiceKey || option.actionKey || ""),
      actionKey: String(option.actionKey || ""),
      action: responseAction,
      choice: option.damageTransfer === true ? "transfer" : "decline",
      recipientPieceKey: String(option.recipientPieceKey || ""),
      available: Boolean(responseAction),
    };
  });
  const core = {
    schemaVersion: WARMACHINE_OPPONENT_RESPONSE_SET_V1_SCHEMA,
    actionKey: String(action.actionKey || ""),
    decisionKind: "damage_transfer",
    decisionGroupKey: String(metadata.damageTransferDecisionGroupKey || ""),
    decisionTiming: String(metadata.damageTransferDecisionTiming || ""),
    ownerSideKey: String(metadata.damageTransferDecisionSideKey || ""),
    ownerPieceKey: String(metadata.damageTransferDecisionOwnerPieceKey || ""),
    responseSetComplete: responses.length === decisionOptions.length &&
      responses.every((response) => response.available),
    responses,
  };
  return {
    ...core,
    responseSetHash: stableGraphHash(stableGraphValue({
      ...core,
      responses: responses.map(({ action: _action, ...response }) => response),
    })),
  };
}
