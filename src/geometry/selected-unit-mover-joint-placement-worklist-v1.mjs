import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  materializeRulesV1ParameterizedUnitMovementAction,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { warmachineRuleBehaviorStateHashV1 } from
  "../state/semantic-hash-v1.mjs";
import {
  listWarmachineQuantizedMovementPathRepresentativesV1,
  WARMACHINE_QUANTIZED_MOVEMENT_EVENT_WORD_WORKLIST_V1_SCHEMA,
} from "./quantized-movement-event-word-worklist-v1.mjs";
import { materializeWarmachineStrictUnitMovementWitnessV1 } from
  "./strict-unit-movement-witness-v1.mjs";

export const WARMACHINE_SELECTED_UNIT_MOVER_JOINT_PLACEMENT_WORKLIST_V1_SCHEMA =
  "warmachine_selected_unit_mover_joint_placement_worklist_v1";
export const WARMACHINE_SELECTED_UNIT_MOVER_JOINT_PLACEMENT_CHECKPOINT_V1_SCHEMA =
  "warmachine_selected_unit_mover_joint_placement_checkpoint_v1";

function receiptValid(value = {}, hashKey = "") {
  const hash = String(value[hashKey] || "");
  if (!hash) return false;
  const core = { ...value };
  delete core[hashKey];
  return stableGraphHash(core) === hash;
}

function boundedInteger(value, fallback, maximum = 10000) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum
    ? parsed
    : fallback;
}

function uniqueSorted(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function decimalCount(value) {
  const text = String(value ?? "");
  if (!/^(0|[1-9]\d*)$/.test(text)) {
    throw new Error("unit_joint_decimal_count_invalid");
  }
  return BigInt(text);
}

function boardPointDomain(board = {}) {
  const widthIndex = Math.max(0, Math.floor(Number(board.widthIn || 0) * 100 + 1e-9));
  const heightIndex = Math.max(0, Math.floor(Number(board.heightIn || 0) * 100 + 1e-9));
  const xCount = widthIndex + 1;
  const yCount = heightIndex + 1;
  return stableGraphValue({
    quantumIn: 0.01,
    minimumXIndex: 0,
    maximumXIndex: widthIndex,
    minimumYIndex: 0,
    maximumYIndex: heightIndex,
    xCount,
    yCount,
    pointCount: xCount * yCount,
  });
}

function pointAtIndex(domain = {}, index = 0n) {
  const xCount = BigInt(domain.xCount);
  const xIndex = index % xCount;
  const yIndex = index / xCount;
  return {
    xIn: Number(xIndex) / 100,
    yIn: Number(yIndex) / 100,
  };
}

function placementRowsAtOffset(
  placementMemberPieceKeys = [],
  pointDomain = {},
  tupleOffset = 0n,
) {
  const pointCount = BigInt(pointDomain.pointCount);
  let remainder = tupleOffset;
  return placementMemberPieceKeys.map((pieceKey) => {
    const pointIndex = remainder % pointCount;
    remainder /= pointCount;
    return {
      pieceKey,
      destination: pointAtIndex(pointDomain, pointIndex),
    };
  });
}

function checkpointCore(checkpoint = {}) {
  const { checkpointHash, ...core } = checkpoint;
  return stableGraphValue(core);
}

function sealCheckpoint(checkpoint = {}) {
  const core = checkpointCore(checkpoint);
  return { ...core, checkpointHash: stableGraphHash(core) };
}

function initialCheckpoint(domain = {}) {
  const ledgerSeed = stableGraphHash(stableGraphValue({
    domainHash: domain.domainHash,
    purpose: "strict_unit_joint_parameter_decision_ledger_v1",
  }));
  return sealCheckpoint({
    schemaVersion:
      WARMACHINE_SELECTED_UNIT_MOVER_JOINT_PLACEMENT_CHECKPOINT_V1_SCHEMA,
    domainHash: domain.domainHash,
    nextCandidateOffset: "0",
    strictDecisionLedgerHash: ledgerSeed,
    acceptedWitnesses: [],
    rejectedWitnesses: [],
    stats: {
      candidateCountExamined: "0",
      strictAcceptedCount: "0",
      strictRejectedCount: "0",
      storedAcceptedWitnessCount: 0,
      storedRejectedWitnessCount: 0,
    },
  });
}

function checkpointValid(checkpoint = {}, domain = {}) {
  return checkpoint.schemaVersion ===
      WARMACHINE_SELECTED_UNIT_MOVER_JOINT_PLACEMENT_CHECKPOINT_V1_SCHEMA &&
    receiptValid(checkpoint, "checkpointHash") &&
    String(checkpoint.domainHash || "") === String(domain.domainHash || "") &&
    /^\d+$/.test(String(checkpoint.nextCandidateOffset || "")) &&
    /^\d+$/.test(String(checkpoint.stats?.candidateCountExamined ?? "")) &&
    /^\d+$/.test(String(checkpoint.stats?.strictAcceptedCount ?? "")) &&
    /^\d+$/.test(String(checkpoint.stats?.strictRejectedCount ?? ""));
}

function discoverUnitDomain(inputState = {}, pathRepresentative = {}, options = {}) {
  const actorPieceKey = String(options.actorPieceKey || "");
  const actionType = String(options.actionType || "advance") === "run"
    ? "run"
    : "advance";
  const discovery = materializeRulesV1ParameterizedUnitMovementAction(
    inputState,
    {
      actorPieceKey,
      actionType,
      selectedModelPathPoints: pathRepresentative.pathPoints || [],
      placementDestinationsByModel: [],
    },
  );
  const receipt = discovery.parameterizedUnitActionReceipt || {};
  return {
    receipt,
    receiptValid: receipt.schemaVersion ===
        "warmachine_parameterized_unit_movement_action_v1" &&
      receiptValid(receipt, "parameterizedUnitActionReceiptHash"),
    unitGroupId: String(receipt.unitGroupId || ""),
    liveUnitMemberPieceKeys: uniqueSorted(
      receipt.liveUnitMemberPieceKeys || [],
    ),
  };
}

function buildDomain(inputState = {}, selectedPathReceipt = {}, options = {}) {
  const issues = [];
  const actorPieceKey = String(options.actorPieceKey || "");
  const actionType = String(options.actionType || "advance") === "run"
    ? "run"
    : "advance";
  const selectedPathReceiptHash = String(
    selectedPathReceipt.quantizedMovementEventWordWorklistReceiptHash || "",
  );
  const selectedPathReceiptValid = selectedPathReceipt.schemaVersion ===
      WARMACHINE_QUANTIZED_MOVEMENT_EVENT_WORD_WORKLIST_V1_SCHEMA &&
    receiptValid(
      selectedPathReceipt,
      "quantizedMovementEventWordWorklistReceiptHash",
    ) &&
    selectedPathReceipt.geometricEventWordLanguageComplete === true &&
    selectedPathReceipt.allLegalQuantizedPathsCoveredByEventWordDenominator ===
      true &&
    selectedPathReceipt.selectedModelPathOnly === true;
  if (!selectedPathReceiptValid) {
    issues.push("unit_joint_selected_path_domain_invalid_or_incomplete");
  }
  if (String(selectedPathReceipt.actorPieceKey || "") !== actorPieceKey ||
      String(selectedPathReceipt.actionType || "") !== actionType) {
    issues.push("unit_joint_selected_path_actor_action_binding_mismatch");
  }
  let pathRepresentatives = [];
  if (selectedPathReceiptValid) {
    try {
      pathRepresentatives =
        listWarmachineQuantizedMovementPathRepresentativesV1(
          selectedPathReceipt,
        );
    } catch {
      issues.push("unit_joint_selected_path_representatives_invalid");
    }
  }
  if (!pathRepresentatives.length) {
    issues.push("unit_joint_selected_path_representatives_empty");
  }
  const discovery = discoverUnitDomain(
    inputState,
    pathRepresentatives[0] || {},
    { actorPieceKey, actionType },
  );
  if (!discovery.receiptValid || !discovery.unitGroupId ||
      !discovery.liveUnitMemberPieceKeys.includes(actorPieceKey)) {
    issues.push("unit_joint_host_member_denominator_invalid");
  }
  if (String(selectedPathReceipt.factoredUnitGroupId || "") !==
      discovery.unitGroupId) {
    issues.push("unit_joint_factored_unit_group_binding_mismatch");
  }
  const normalizedState = normalizeRulesV1State(inputState);
  const pointDomain = boardPointDomain(normalizedState.board || {});
  if (pointDomain.pointCount < 1) {
    issues.push("unit_joint_board_point_domain_empty");
  }
  const placementMemberPieceKeys = discovery.liveUnitMemberPieceKeys
    .filter((pieceKey) => pieceKey !== actorPieceKey);
  const placementTupleCount = BigInt(pointDomain.pointCount) **
    BigInt(placementMemberPieceKeys.length);
  const candidateCount = BigInt(pathRepresentatives.length) *
    placementTupleCount;
  const hostFocusedEngineSourceReceiptHash = String(
    warmachineHost.focusedSourceReceipt?.reviewedReceipt?.sourceReceiptHash || "",
  );
  if (!/^[0-9a-f]{64}$/.test(hostFocusedEngineSourceReceiptHash) ||
      warmachineHost.focusedSourceReceipt?.current !== true) {
    issues.push("unit_joint_host_focused_engine_receipt_stale");
  }
  const core = stableGraphValue({
    inputRuleBehaviorStateHash: warmachineRuleBehaviorStateHashV1(inputState),
    selectedPathReceiptHash,
    hostFocusedEngineSourceReceiptHash,
    actorPieceKey,
    actionType,
    unitGroupId: discovery.unitGroupId,
    liveUnitMemberPieceKeys: discovery.liveUnitMemberPieceKeys,
    placementMemberPieceKeys,
    pathRepresentativeHashes: pathRepresentatives.map((row) =>
      row.pathStateHash),
    pointDomain,
    placementTupleCount: placementTupleCount.toString(),
    candidateCount: candidateCount.toString(),
  });
  return {
    ...core,
    domainHash: stableGraphHash(core),
    pathRepresentatives,
    candidateCount,
    placementTupleCount,
    issues: uniqueSorted(issues),
  };
}

function appendDecision(checkpoint = {}, decision = {}) {
  checkpoint.strictDecisionLedgerHash = stableGraphHash(stableGraphValue({
    previousStrictDecisionLedgerHash: checkpoint.strictDecisionLedgerHash,
    decision,
  }));
}

export function advanceWarmachineSelectedUnitMoverJointPlacementWorklistV1(
  inputState = {},
  selectedPathReceipt = {},
  options = {},
) {
  const domain = buildDomain(inputState, selectedPathReceipt, options);
  const checkpointIssue = options.checkpoint &&
      !checkpointValid(options.checkpoint, domain)
    ? "unit_joint_checkpoint_invalid"
    : "";
  const issues = uniqueSorted([...domain.issues, checkpointIssue]);
  let checkpoint = options.checkpoint
    ? structuredClone(options.checkpoint)
    : initialCheckpoint(domain);
  delete checkpoint.checkpointHash;
  const candidateBudget = boundedInteger(options.candidateBudget, 100);
  const maximumStoredAcceptedWitnessCount = boundedInteger(
    options.maximumStoredAcceptedWitnessCount,
    64,
    1000,
  );
  const maximumStoredRejectedWitnessCount = boundedInteger(
    options.maximumStoredRejectedWitnessCount,
    64,
    1000,
  );
  let cursor = BigInt(checkpoint.nextCandidateOffset || "0");
  let consumed = 0;
  while (!issues.length && cursor < domain.candidateCount &&
      consumed < candidateBudget) {
    const pathIndex = Number(cursor / domain.placementTupleCount);
    const tupleOffset = cursor % domain.placementTupleCount;
    const pathRepresentative = domain.pathRepresentatives[pathIndex];
    const placementDestinationsByModel = placementRowsAtOffset(
      domain.placementMemberPieceKeys,
      domain.pointDomain,
      tupleOffset,
    );
    const witness = materializeWarmachineStrictUnitMovementWitnessV1(
      inputState,
      {
        actorPieceKey: domain.actorPieceKey,
        actionType: domain.actionType,
        selectedModelPathPoints: pathRepresentative.pathPoints,
        placementDestinationsByModel,
      },
    );
    const hostReceipt = witness.hostParameterizedUnitActionReceipt || {};
    if (!receiptValid(hostReceipt, "parameterizedUnitActionReceiptHash")) {
      issues.push("unit_joint_host_parameter_receipt_invalid");
      break;
    }
    const decision = stableGraphValue({
      candidateOffset: cursor.toString(),
      pathStateHash: pathRepresentative.pathStateHash,
      placementDestinationsByModel,
      status: witness.ok === true ? "strict_accepted" : "strict_rejected",
      hostParameterizedUnitActionReceiptHash:
        witness.hostParameterizedUnitActionReceiptHash,
      selectedActionKey: witness.selectedActionKey,
      rejectedActionKey: witness.rejectedActionKey,
      rejectedReason: witness.rejectedReason,
      successorRuleBehaviorStateHash:
        witness.successorRuleBehaviorStateHash,
      witnessReceiptHash: witness.strictUnitMovementWitnessReceiptHash,
    });
    appendDecision(checkpoint, decision);
    checkpoint.stats.candidateCountExamined = (
      decimalCount(checkpoint.stats.candidateCountExamined) + 1n
    ).toString();
    if (witness.ok === true) {
      checkpoint.stats.strictAcceptedCount = (
        decimalCount(checkpoint.stats.strictAcceptedCount) + 1n
      ).toString();
      if (checkpoint.acceptedWitnesses.length <
          maximumStoredAcceptedWitnessCount) {
        checkpoint.acceptedWitnesses.push(decision);
      }
    } else {
      checkpoint.stats.strictRejectedCount = (
        decimalCount(checkpoint.stats.strictRejectedCount) + 1n
      ).toString();
      if (checkpoint.rejectedWitnesses.length <
          maximumStoredRejectedWitnessCount) {
        checkpoint.rejectedWitnesses.push(decision);
      }
    }
    cursor += 1n;
    consumed += 1;
  }
  checkpoint.nextCandidateOffset = cursor.toString();
  checkpoint.stats.storedAcceptedWitnessCount =
    checkpoint.acceptedWitnesses.length;
  checkpoint.stats.storedRejectedWitnessCount =
    checkpoint.rejectedWitnesses.length;
  checkpoint = sealCheckpoint(checkpoint);
  const complete = issues.length === 0 && cursor === domain.candidateCount;
  const pendingCandidateCount = domain.candidateCount - cursor;
  const examinedCount = decimalCount(
    checkpoint.stats.candidateCountExamined,
  );
  const acceptedCount = decimalCount(checkpoint.stats.strictAcceptedCount);
  const rejectedCount = decimalCount(checkpoint.stats.strictRejectedCount);
  const accountingConserved = examinedCount === cursor &&
    acceptedCount + rejectedCount === examinedCount;
  const core = stableGraphValue({
    schemaVersion:
      WARMACHINE_SELECTED_UNIT_MOVER_JOINT_PLACEMENT_WORKLIST_V1_SCHEMA,
    ok: issues.length === 0 && accountingConserved,
    domainHash: domain.domainHash,
    inputRuleBehaviorStateHash: domain.inputRuleBehaviorStateHash,
    selectedPathReceiptHash: domain.selectedPathReceiptHash,
    hostFocusedEngineSourceReceiptHash:
      domain.hostFocusedEngineSourceReceiptHash,
    actorPieceKey: domain.actorPieceKey,
    actionType: domain.actionType,
    unitGroupId: domain.unitGroupId,
    liveUnitMemberPieceKeys: domain.liveUnitMemberPieceKeys,
    placementMemberPieceKeys: domain.placementMemberPieceKeys,
    selectedPathRepresentativeCount: domain.pathRepresentatives.length,
    boardPointCandidateCountPerPlacedModel:
      domain.pointDomain.pointCount,
    placementTupleCandidateCount: domain.placementTupleCount.toString(),
    jointCandidateCount: domain.candidateCount.toString(),
    examinedCandidateCount: checkpoint.nextCandidateOffset,
    pendingCandidateCount: pendingCandidateCount.toString(),
    strictAcceptedCount: checkpoint.stats.strictAcceptedCount,
    strictRejectedCount: checkpoint.stats.strictRejectedCount,
    strictDecisionLedgerHash: checkpoint.strictDecisionLedgerHash,
    acceptedWitnesses: checkpoint.acceptedWitnesses,
    rejectedWitnesses: checkpoint.rejectedWitnesses,
    acceptedWitnessStorageTruncated:
      acceptedCount > BigInt(checkpoint.acceptedWitnesses.length),
    rejectedWitnessStorageTruncated:
      rejectedCount > BigInt(checkpoint.rejectedWitnesses.length),
    accountingConserved,
    selectedMoverPathDomainComplete:
      selectedPathReceipt.geometricEventWordLanguageComplete === true,
    selectedMoverJointPlacementDomainComplete: complete,
    allSelectedMoverChoicesComplete: false,
    completeUnitMovementDomain: false,
    validationIssues: issues,
    completionDebts: uniqueSorted([
      ...issues,
      ...(!complete ? ["unit_joint_candidate_ledger_pending"] : []),
      "other_live_unit_members_as_selected_mover_not_aggregated",
      "unit_reactions_and_successor_equivalence_not_closed",
    ]),
    continuousChoiceKind: "player_choice_not_chance",
    chanceMassAssigned: false,
    resumeCheckpoint: checkpoint,
    claimBoundary:
      "For one selected live Unit model and one advance/run family, this resumable worklist combines every retained representative from the complete selected-model quantized path worklist with every cent-inch point on the normalized board for every other Host-declared live unit member. The board product is a deliberate legal-placement superset; every tuple is accepted or rejected only by the Host parameterized Unit action and strict transition. A rolling decision commitment conserves examined rows without retaining an unbounded raw-action list. Completion closes this selected-mover joint parameter denominator only; other selected movers, reactions and successor equivalence remain separate debts.",
  });
  return {
    ...core,
    selectedUnitMoverJointPlacementWorklistReceiptHash: stableGraphHash(core),
  };
}
