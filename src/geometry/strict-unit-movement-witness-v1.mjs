import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  applyRulesV1Action,
  materializeRulesV1ParameterizedUnitMovementAction,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { warmachineRuleBehaviorStateHashV1 } from
  "../state/semantic-hash-v1.mjs";

export const WARMACHINE_STRICT_UNIT_MOVEMENT_WITNESS_V1_SCHEMA =
  "warmachine_strict_unit_movement_witness_v1";

function receiptValid(value = {}, hashKey = "") {
  const hash = String(value[hashKey] || "");
  if (!hash) return false;
  const core = { ...value };
  delete core[hashKey];
  return stableGraphHash(core) === hash;
}

function point(value = {}) {
  return {
    xIn: Math.round(Number(value.xIn) * 100) / 100,
    yIn: Math.round(Number(value.yIn) * 100) / 100,
  };
}

function pointMatches(left = {}, right = {}) {
  return Number.isFinite(Number(left.xIn)) &&
    Number.isFinite(Number(left.yIn)) &&
    Math.abs(Number(left.xIn) - Number(right.xIn)) <= 0.001 &&
    Math.abs(Number(left.yIn) - Number(right.yIn)) <= 0.001;
}

function expectedFinalPositions(options = {}) {
  const selectedPath = Array.isArray(options.selectedModelPathPoints)
    ? options.selectedModelPathPoints
    : Array.isArray(options.pathPoints)
      ? options.pathPoints
      : [];
  const selectedDestination = selectedPath.at(-1);
  return [
    ...(selectedDestination ? [{
      pieceKey: String(options.actorPieceKey || ""),
      position: point(selectedDestination),
      movementMode: "advance",
    }] : []),
    ...(options.placementDestinationsByModel || []).map((row) => ({
      pieceKey: String(row.pieceKey || row.modelPieceKey || ""),
      position: point(row.destination || row.to || {}),
      movementMode: "place",
    })),
  ].sort((left, right) => left.pieceKey.localeCompare(right.pieceKey));
}

export function materializeWarmachineStrictUnitMovementWitnessV1(
  inputState = {},
  options = {},
) {
  const host = materializeRulesV1ParameterizedUnitMovementAction(
    inputState,
    options,
  );
  const hostReceipt = host.parameterizedUnitActionReceipt || {};
  const hostReceiptValid = hostReceipt.schemaVersion ===
      "warmachine_parameterized_unit_movement_action_v1" &&
    receiptValid(hostReceipt, "parameterizedUnitActionReceiptHash");
  const expectedPositions = expectedFinalPositions(options);
  const transition = hostReceiptValid && host.ok === true &&
      host.enumeration && host.action
    ? applyRulesV1Action(host.enumeration.state, {
      ...host.action,
      __warmachineTrustedRulesV1Enumeration: host.enumeration,
    })
    : null;
  const actualPositions = expectedPositions.map((expected) => {
    const piece = transition?.nextState?.pieces?.find((candidate) =>
      candidate.pieceKey === expected.pieceKey) || null;
    return {
      ...expected,
      actualPosition: piece?.position ? point(piece.position) : null,
      matched: Boolean(piece) && pointMatches(piece.position, expected.position),
    };
  });
  const everyFinalPositionMatched = expectedPositions.length > 0 &&
    actualPositions.every((row) => row.matched);
  const strictTransitionAccepted = transition?.ok === true &&
    everyFinalPositionMatched;
  const issues = [...new Set([
    ...(!hostReceiptValid ? ["strict_unit_host_receipt_invalid"] : []),
    ...(hostReceiptValid && host.ok !== true
      ? ["strict_unit_host_action_not_legal"]
      : []),
    ...(host.ok === true && !transition
      ? ["strict_unit_transition_missing"]
      : []),
    ...(transition && transition.ok !== true
      ? ["strict_unit_transition_rejected"]
      : []),
    ...(transition?.ok === true && !everyFinalPositionMatched
      ? ["strict_unit_final_position_mismatch"]
      : []),
  ])].sort();
  const eventRows = stableGraphValue((transition?.events || []).map((event) => ({
    eventType: String(event.eventType || ""),
    pieceKey: String(event.pieceKey || event.targetPieceKey || ""),
    unitNormalMovementPlacement:
      event.unitNormalMovementPlacement === true,
    movementPathSegmentCount:
      Number(event.movementPathSegmentCount || 0),
  })));
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_STRICT_UNIT_MOVEMENT_WITNESS_V1_SCHEMA,
    ok: issues.length === 0 && strictTransitionAccepted,
    actorPieceKey: String(options.actorPieceKey || ""),
    actionType: String(options.actionType || "advance") === "run"
      ? "run"
      : "advance",
    hostFocusedEngineSourceReceiptHash: String(
      warmachineHost.focusedSourceReceipt?.reviewedReceipt
        ?.sourceReceiptHash || "",
    ),
    hostFocusedEngineReceiptCurrent:
      warmachineHost.focusedSourceReceipt?.current === true,
    hostParameterizedUnitActionReceipt: hostReceipt,
    hostParameterizedUnitActionReceiptHash: String(
      hostReceipt.parameterizedUnitActionReceiptHash || "",
    ),
    expectedActionKey: String(host.expectedActionKey || ""),
    selectedActionKey: String(host.action?.actionKey || ""),
    rejectedActionKey: String(host.rejectedAction?.actionKey || ""),
    rejectedReason: String(host.rejectedReason || ""),
    expectedFinalPositions: expectedPositions,
    actualFinalPositions: actualPositions,
    everyFinalPositionMatched,
    strictTransitionAccepted,
    successorRuleBehaviorStateHash: transition?.nextState
      ? warmachineRuleBehaviorStateHashV1(transition.nextState)
      : "",
    transitionEvents: eventRows,
    transitionEventHash: stableGraphHash(eventRows),
    issues,
    suppliedJointParameterStrictlyExecuted: strictTransitionAccepted,
    jointParameterDomainComplete: false,
    transitionStable: false,
    continuousChoiceKind: "player_choice_not_chance",
    chanceMassAssigned: false,
    claimBoundary:
      "This Search receipt independently validates one Host-signed parameterized Unit advance/run action, executes it through the strict Host and checks every selected-move and simultaneous-placement final position. It is one existence or rejection witness only; it does not enumerate every selected trooper, path, joint landing tuple, reaction or successor-equivalence class.",
  });
  return {
    ...core,
    strictUnitMovementWitnessReceiptHash: stableGraphHash(core),
  };
}
