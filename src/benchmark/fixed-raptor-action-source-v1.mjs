import {
  enumerateWarmachineBenchmarkActionsV2,
  executeScopedWarmachineBenchmarkActionV2,
  summarizeWarmachineBenchmarkRejectedActionV2,
} from "./fixed-steamroller-benchmark-v2.mjs";
import { createWarmachineFixedAssassinationPolicyV1 } from
  "./fixed-assassination-policy-v1.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { buildWarmachineActivationGroups } from "../search/matchup-search-v1.mjs";
import { buildWarmachineExactActionChanceClasses } from
  "../search/chance-outcomes-v1.mjs";
import {
  buildWarmachineOpponentResponseSetV1,
  canonicalWarmachineActingSideActionsV1,
  conditionWarmachineOpponentResponseSetForChanceClassV1,
} from "../search/opponent-response-v1.mjs";
import { executeWarmachineExactPostResponseChanceV1 } from
  "../search/post-response-chance-execution-v1.mjs";
import {
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";

export const WARMACHINE_FIXED_RAPTOR_ACTION_SOURCE_V1_SCHEMA =
  "warmachine_fixed_raptor_action_source_v1";

const DEFAULT_PRIMARY_ROLL = Object.freeze({
  attackDice: Object.freeze([1, 1, 3]),
  damageDice: Object.freeze([1, 4, 6]),
});

function required(value, reason) {
  if (!value) throw new Error(reason);
  return value;
}

function sameRoll(left = {}, right = {}) {
  return stableGraphHash(stableGraphValue(left)) === stableGraphHash(stableGraphValue(right));
}

function aliveLeader(state = {}, sideKey = "") {
  return (state.pieces || []).find((piece) =>
    piece.sideKey === sideKey &&
    (piece.isWarcaster || piece.isWarlock) &&
    piece.destroyed !== true &&
    piece.removedFromPlay !== true) || null;
}

function channelerPieceKeyFromActionKey(state = {}, actionKey = "") {
  const text = String(actionKey || "");
  const markers = ["channeled-spell-", "channeled-support-spell-"];
  for (const marker of markers) {
    const markerIndex = text.indexOf(marker);
    if (markerIndex < 0) continue;
    const startIndex = markerIndex + marker.length;
    const endIndex = text.indexOf(":", startIndex);
    if (endIndex < 0) continue;
    const encodedPieceKey = text.slice(startIndex, endIndex);
    const matches = (state.pieces || []).filter((piece) =>
      String(piece.pieceKey || "").trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") === encodedPieceKey);
    if (matches.length === 1) return matches[0].pieceKey;
  }
  return "";
}

function buildCurrentHostRaptorActionSource(sourceStateInput = {}, rawSource = {}) {
  const normalizedState = rawSource.stateAlreadyNormalized === true
    ? sourceStateInput
    : normalizeRulesV1State(sourceStateInput);
  const caster = required(
    normalizedState.pieces?.find((piece) =>
      piece.pieceKey === rawSource.casterPieceKey),
    "fixed_raptor_source_caster_missing",
  );
  const channeler = required(
    normalizedState.pieces?.find((piece) =>
      piece.pieceKey === rawSource.channelerPieceKey),
    "fixed_raptor_source_channeler_missing",
  );
  const target = required(
    normalizedState.pieces?.find((piece) =>
      piece.pieceKey === rawSource.targetPieceKey),
    "fixed_raptor_source_target_missing",
  );
  const activationGroup = required(
    buildWarmachineActivationGroups(normalizedState).find((group) =>
      group.actorPieceKeys.includes(channeler.pieceKey)),
    "fixed_raptor_source_activation_group_missing",
  );
  const scoped = enumerateWarmachineBenchmarkActionsV2(normalizedState, {
    stateAlreadyNormalized: true,
    inputStateHash: stableGraphHash(normalizedState),
    activationGroupKey: activationGroup.groupKey,
    targetPieceKeys: [target.pieceKey],
    includeUntargetedActions: false,
    actionFamilyKeys: ["movement", "attack_or_effect", "timing", "resource"],
  });
  const sourceState = scoped.state;
  const actions = canonicalWarmachineActingSideActionsV1(scoped.enumeration)
    .filter((candidate) => candidate.targetPieceKey === target.pieceKey)
    .map((candidate) => stableGraphValue(candidate))
    .sort((left, right) => left.actionKey.localeCompare(right.actionKey));
  const rejectedActions = (scoped.enumeration.rejectedActions || [])
    .filter((candidate) =>
      candidate.actorPieceKey === channeler.pieceKey &&
      candidate.targetPieceKey === target.pieceKey)
    .map(summarizeWarmachineBenchmarkRejectedActionV2)
    .sort((left, right) => left.actionKey.localeCompare(right.actionKey));
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_FIXED_RAPTOR_ACTION_SOURCE_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    focusedSourceReceiptCurrent:
      warmachineHost.focusedSourceReceipt?.current === true,
    focusedSourceReceiptFailClosedReasons:
      warmachineHost.focusedSourceReceipt?.failClosedReasons || [],
    routeCheckpointReceiptHash: String(
      rawSource.routeCheckpointReceiptHash || "",
    ),
    routeTransitionCount: Number(rawSource.routeTransitionCount || 0),
    casterPieceKey: caster.pieceKey,
    channelerPieceKey: channeler.pieceKey,
    targetPieceKey: target.pieceKey,
    primaryChanceClassKey: String(rawSource.primaryChanceClassKey || ""),
    primaryProbability: stableGraphValue(rawSource.primaryProbability || {}),
    primaryRoll: stableGraphValue(rawSource.primaryRoll || {}),
    responseKey: String(rawSource.responseKey || ""),
    spellActionKey: String(rawSource.spellActionKey || ""),
    endActionKey: String(rawSource.endActionKey || ""),
    sourceStateHash: stableGraphHash(sourceState),
    sourceState,
    legalTargetActionCount: actions.length,
    legalTargetActions: actions,
    rejectedTargetActionCount: rejectedActions.length,
    rejectedTargetActions: rejectedActions,
    receipts: stableGraphValue(rawSource.receipts || []),
    materializationMode: String(
      rawSource.materializationMode || "full_current_host_prefix_replay_v1",
    ),
    ...(rawSource.prefixProvenance
      ? { prefixProvenance: stableGraphValue(rawSource.prefixProvenance) }
      : {}),
    claimBoundary: String(rawSource.claimBoundary ||
      "This snapshot is one receipt-bound Sepsira Chance/decline branch followed by strict activation end. It is a common fixed Raptor decision state, not a probability-weighted prior policy or match value."),
  });
  return { ...core, sourceHash: stableGraphHash(core) };
}

export function materializeWarmachineFixedRaptorActionSourceV1(route = {}, rawOptions = {}) {
  const routeState = required(route.state, "fixed_raptor_source_route_state_missing");
  const nextAction = required(route.nextAction, "fixed_raptor_source_route_action_missing");
  const casterPieceKey = String(rawOptions.casterPieceKey || nextAction.actorPieceKey || "");
  const channelerPieceKey = String(
    rawOptions.channelerPieceKey ||
      nextAction.channelerPieceKey ||
      nextAction.metadata?.channelerPieceKey ||
      channelerPieceKeyFromActionKey(routeState, nextAction.actionKey) ||
      "",
  );
  const caster = required(
    routeState.pieces?.find((piece) => piece.pieceKey === casterPieceKey),
    "fixed_raptor_source_caster_missing",
  );
  const channeler = required(
    routeState.pieces?.find((piece) => piece.pieceKey === channelerPieceKey),
    "fixed_raptor_source_channeler_missing",
  );
  const target = required(
    routeState.pieces?.find((piece) =>
      piece.pieceKey === rawOptions.targetPieceKey) ||
      aliveLeader(routeState, rawOptions.targetSideKey || "player2"),
    "fixed_raptor_source_target_missing",
  );
  const policy = createWarmachineFixedAssassinationPolicyV1({
    targetPieceKey: target.pieceKey,
    casterPieceKey: caster.pieceKey,
    channelerPieceKey: channeler.pieceKey,
    firstActionKey: nextAction.actionKey,
  });
  const decision = policy.selectPolicyAction({
    state: routeState,
    cursor: 0,
    stateAlreadyNormalized: true,
    stateHash: stableGraphHash(routeState),
  });
  const action = required(decision.action, "fixed_raptor_source_spell_action_unavailable");
  const chance = buildWarmachineExactActionChanceClasses(action, {
    state: decision.scoped.state,
  });
  if (chance.exactComplete !== true) {
    throw new Error(`fixed_raptor_source_primary_chance_incomplete:${(chance.reasons || []).join(",")}`);
  }
  const primaryRoll = stableGraphValue(rawOptions.primaryRoll || DEFAULT_PRIMARY_ROLL);
  const chanceClass = required(
    (chance.classes || []).find((candidate) =>
      sameRoll(candidate.strictRollOutcome, primaryRoll)),
    "fixed_raptor_source_primary_roll_class_missing",
  );
  const baseResponseSet = buildWarmachineOpponentResponseSetV1(
    action,
    decision.scoped.enumeration,
  );
  const responseSet = conditionWarmachineOpponentResponseSetForChanceClassV1(
    baseResponseSet,
    chanceClass,
  );
  const response = required(
    (responseSet.responses || []).find((candidate) => candidate.responseKey === "decline"),
    "fixed_raptor_source_decline_response_missing",
  );
  const spellExecution = executeWarmachineExactPostResponseChanceV1(
    decision.scoped,
    action,
    response,
    chanceClass,
    { routeKey: "fixed-raptor-action-source-spell-v1" },
  );
  if (spellExecution.exactComplete !== true || spellExecution.outcomes?.length !== 1) {
    throw new Error("fixed_raptor_source_spell_post_response_chance_not_single_exact");
  }
  const spellOutcome = spellExecution.outcomes[0];
  if (spellOutcome.executed?.ok !== true) {
    throw new Error(`fixed_raptor_source_spell_rejected:${spellOutcome.executed?.reason || "unknown"}`);
  }
  const afterSpell = spellOutcome.executed.normalizedState;
  const endDecision = policy.selectPolicyAction({
    state: afterSpell,
    cursor: 1,
    stateAlreadyNormalized: true,
    stateHash: stableGraphHash(afterSpell),
  });
  const endAction = required(endDecision.action, "fixed_raptor_source_end_action_missing");
  if (endAction.actionType !== "end_any_time_activation_window") {
    throw new Error(`fixed_raptor_source_unexpected_second_action:${endAction.actionType}`);
  }
  const endExecution = executeScopedWarmachineBenchmarkActionV2(
    endDecision.scoped,
    endAction,
    { actionKey: endAction.actionKey },
    { routeKey: "fixed-raptor-action-source-end-caster-activation-v1" },
  );
  if (endExecution.ok !== true) {
    throw new Error(`fixed_raptor_source_end_action_rejected:${endExecution.reason}`);
  }
  return buildCurrentHostRaptorActionSource(endExecution.normalizedState, {
    stateAlreadyNormalized: true,
    routeCheckpointReceiptHash: String(route.checkpointReceiptHash || ""),
    routeTransitionCount: Number(route.transitionCount || route.receipts?.length || 0),
    casterPieceKey: caster.pieceKey,
    channelerPieceKey: channeler.pieceKey,
    targetPieceKey: target.pieceKey,
    primaryChanceClassKey: chanceClass.classKey,
    primaryProbability: {
      numerator: String(chanceClass.numerator),
      denominator: String(chanceClass.denominator),
    },
    primaryRoll,
    responseKey: response.responseKey,
    spellActionKey: action.actionKey,
    endActionKey: endAction.actionKey,
    receipts: [
      stableGraphValue(spellOutcome.executed.receipt),
      stableGraphValue(endExecution.receipt),
    ],
  });
}

export function rematerializeWarmachineFixedRaptorActionSourceV1(
  parentSource = {},
) {
  if (parentSource.schemaVersion !== WARMACHINE_FIXED_RAPTOR_ACTION_SOURCE_V1_SCHEMA) {
    throw new Error("fixed_raptor_parent_source_schema_invalid");
  }
  const { sourceHash, ...parentCore } = parentSource;
  if (!sourceHash || stableGraphHash(stableGraphValue(parentCore)) !== sourceHash) {
    throw new Error("fixed_raptor_parent_source_hash_invalid");
  }
  if (stableGraphHash(parentSource.sourceState) !== parentSource.sourceStateHash) {
    throw new Error("fixed_raptor_parent_state_hash_invalid");
  }
  return buildCurrentHostRaptorActionSource(parentSource.sourceState, {
    casterPieceKey: parentSource.casterPieceKey,
    channelerPieceKey: parentSource.channelerPieceKey,
    targetPieceKey: parentSource.targetPieceKey,
    routeCheckpointReceiptHash: parentSource.routeCheckpointReceiptHash,
    routeTransitionCount: parentSource.routeTransitionCount,
    primaryChanceClassKey: parentSource.primaryChanceClassKey,
    primaryProbability: parentSource.primaryProbability,
    primaryRoll: parentSource.primaryRoll,
    responseKey: parentSource.responseKey,
    spellActionKey: parentSource.spellActionKey,
    endActionKey: parentSource.endActionKey,
    receipts: [],
    materializationMode: "current_host_state_rematerialization_v1",
    prefixProvenance: {
      parentSourceHash: sourceHash,
      parentHostReceiptHash: String(parentSource.hostReceiptHash || ""),
      parentSourceStateHash: parentSource.sourceStateHash,
      parentReceiptHashes: (parentSource.receipts || [])
        .map((receipt) => String(receipt.receiptHash || ""))
        .filter(Boolean)
        .sort(),
      currentHostPrefixReplayPerformed: false,
    },
    claimBoundary: "This source re-normalizes one content-addressed post-prefix state and re-enumerates the selected Raptor activation group under the current Host. Its earlier Sepsira spell/end prefix remains provenance from the parent Host and is not claimed as a fresh current-Host replay. It is a fixed activation input, not a match value.",
  });
}
