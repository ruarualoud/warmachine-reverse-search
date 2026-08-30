import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { WARMACHINE_SELECTED_UNIT_MOVER_JOINT_PLACEMENT_WORKLIST_V1_SCHEMA } from
  "./selected-unit-mover-joint-placement-worklist-v1.mjs";

export const WARMACHINE_UNIT_ACTION_TYPE_JOINT_DOMAIN_V1_SCHEMA =
  "warmachine_unit_action_type_joint_domain_v1";

function receiptValid(value = {}, hashKey = "") {
  const hash = String(value[hashKey] || "");
  if (!hash) return false;
  const core = { ...value };
  delete core[hashKey];
  return stableGraphHash(core) === hash;
}

function uniqueSorted(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function sameStrings(left = [], right = []) {
  return JSON.stringify(uniqueSorted(left)) ===
    JSON.stringify(uniqueSorted(right));
}

export function buildWarmachineUnitActionTypeJointDomainV1(
  selectedMoverReceipts = [],
  options = {},
) {
  const actionType = String(options.actionType || "advance") === "run"
    ? "run"
    : "advance";
  const receipts = Array.isArray(selectedMoverReceipts)
    ? selectedMoverReceipts
    : [];
  const issues = [];
  const validReceipts = receipts.filter((receipt, index) => {
    const valid = receipt.schemaVersion ===
        WARMACHINE_SELECTED_UNIT_MOVER_JOINT_PLACEMENT_WORKLIST_V1_SCHEMA &&
      receiptValid(
        receipt,
        "selectedUnitMoverJointPlacementWorklistReceiptHash",
      ) &&
      receipt.ok === true &&
      receipt.accountingConserved === true &&
      receipt.selectedMoverPathDomainComplete === true &&
      receipt.selectedMoverJointPlacementDomainComplete === true &&
      receipt.actionType === actionType;
    if (!valid) issues.push(`unit_action_type_selected_mover_receipt_invalid:${index}`);
    return valid;
  });
  const reference = validReceipts[0] || null;
  const expectedActorPieceKeys = uniqueSorted(
    reference?.liveUnitMemberPieceKeys || [],
  );
  const suppliedActorPieceKeys = validReceipts.map((receipt) =>
    String(receipt.actorPieceKey || ""));
  const duplicateActorPieceKeys = uniqueSorted(suppliedActorPieceKeys.filter(
    (pieceKey, index) => suppliedActorPieceKeys.indexOf(pieceKey) !== index,
  ));
  if (!reference || !expectedActorPieceKeys.length) {
    issues.push("unit_action_type_member_denominator_missing");
  }
  if (duplicateActorPieceKeys.length) {
    issues.push("unit_action_type_duplicate_selected_mover_receipt");
  }
  if (!sameStrings(expectedActorPieceKeys, suppliedActorPieceKeys)) {
    issues.push("unit_action_type_selected_mover_denominator_incomplete");
  }
  for (const [index, receipt] of validReceipts.entries()) {
    if (receipt.inputRuleBehaviorStateHash !==
        reference.inputRuleBehaviorStateHash ||
      receipt.unitGroupId !== reference.unitGroupId ||
      receipt.hostFocusedEngineSourceReceiptHash !==
        reference.hostFocusedEngineSourceReceiptHash ||
      !sameStrings(
        receipt.liveUnitMemberPieceKeys,
        expectedActorPieceKeys,
      )) {
      issues.push(`unit_action_type_cross_receipt_binding_mismatch:${index}`);
    }
  }
  const jointCandidateCount = validReceipts.reduce((sum, receipt) =>
    sum + BigInt(receipt.jointCandidateCount || "0"), 0n);
  const strictAcceptedCount = validReceipts.reduce((sum, receipt) =>
    sum + BigInt(receipt.strictAcceptedCount || 0), 0n);
  const strictRejectedCount = validReceipts.reduce((sum, receipt) =>
    sum + BigInt(receipt.strictRejectedCount || 0), 0n);
  const accountingConserved = strictAcceptedCount + strictRejectedCount ===
    jointCandidateCount;
  if (!accountingConserved) {
    issues.push("unit_action_type_aggregate_accounting_not_conserved");
  }
  const allSelectedMoverChoicesComplete = issues.length === 0;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_UNIT_ACTION_TYPE_JOINT_DOMAIN_V1_SCHEMA,
    ok: allSelectedMoverChoicesComplete,
    inputRuleBehaviorStateHash: String(
      reference?.inputRuleBehaviorStateHash || "",
    ),
    hostFocusedEngineSourceReceiptHash: String(
      reference?.hostFocusedEngineSourceReceiptHash || "",
    ),
    unitGroupId: String(reference?.unitGroupId || ""),
    actionType,
    expectedSelectedMoverPieceKeys: expectedActorPieceKeys,
    suppliedSelectedMoverPieceKeys: uniqueSorted(suppliedActorPieceKeys),
    selectedMoverReceiptHashes: validReceipts.map((receipt) =>
      receipt.selectedUnitMoverJointPlacementWorklistReceiptHash).sort(),
    selectedMoverReceiptCount: validReceipts.length,
    jointCandidateCount: jointCandidateCount.toString(),
    strictAcceptedCount: strictAcceptedCount.toString(),
    strictRejectedCount: strictRejectedCount.toString(),
    accountingConserved,
    allSelectedMoverChoicesComplete,
    unitActionTypeJointParameterDomainComplete:
      allSelectedMoverChoicesComplete,
    completeUnitMovementDomain: false,
    validationIssues: uniqueSorted(issues),
    completionDebts: [
      ...uniqueSorted(issues),
      "other_unit_normal_movement_action_types_not_aggregated",
      "unit_reactions_and_successor_equivalence_not_closed",
    ],
    continuousChoiceKind: "player_choice_not_chance",
    chanceMassAssigned: false,
    claimBoundary:
      "This aggregate closes one Unit advance or run joint-parameter family only when exactly one complete selected-mover path-plus-placement receipt exists for every Host-declared live unit member under the same state, unit and focused Engine source. It conserves accepted and rejected tuple counts. Charge, failed charge, special movement, reactions and successor equivalence remain outside this receipt, so complete Unit movement and Q_rule remain false.",
  });
  return {
    ...core,
    unitActionTypeJointDomainReceiptHash: stableGraphHash(core),
  };
}
