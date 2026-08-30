import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { WARMACHINE_MOVEMENT_EVENT_AUTOMATON_V1_SCHEMA } from
  "./movement-event-automaton-v1.mjs";
import { WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA } from
  "./predicate-plan-v1.mjs";
import { WARMACHINE_QUANTIZED_MOVEMENT_EVENT_WORD_WORKLIST_V1_SCHEMA } from
  "./quantized-movement-event-word-worklist-v1.mjs";

export const WARMACHINE_MOVEMENT_EVENT_WORD_LANGUAGE_V1_SCHEMA =
  "warmachine_movement_event_word_language_v1";

const BOUNDARY_UNREACHABILITY_THEOREM =
  "rectifiable_path_length_lower_bounded_by_endpoint_euclidean_distance_v1";

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

function validateInputs(predicatePlan = {}, automaton = {}) {
  const issues = [];
  const movementAllowanceIn = Number(predicatePlan.movementAllowanceIn);
  if (predicatePlan.schemaVersion !== WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA ||
      !receiptValid(predicatePlan, "predicatePlanReceiptHash")) {
    issues.push("event_word_language_predicate_plan_invalid");
  }
  if (automaton.schemaVersion !== WARMACHINE_MOVEMENT_EVENT_AUTOMATON_V1_SCHEMA ||
      !receiptValid(automaton, "movementEventAutomatonReceiptHash")) {
    issues.push("event_word_language_automaton_invalid");
  }
  if (String(automaton.predicatePlanReceiptHash || "") !==
      String(predicatePlan.predicatePlanReceiptHash || "") ||
      String(automaton.hostPredicatePlanHash || "") !==
        String(predicatePlan.hostPredicatePlanHash || "")) {
    issues.push("event_word_language_receipt_binding_mismatch");
  }
  if (predicatePlan.hostFocusedExecutionReceiptCurrent !== true) {
    issues.push("event_word_language_engine_receipt_stale");
  }
  if (predicatePlan.movementAllowanceIn == null ||
      !Number.isFinite(movementAllowanceIn) || movementAllowanceIn < 0) {
    issues.push("event_word_language_movement_allowance_invalid");
  }
  if (automaton.ok !== true || automaton.finiteAutomatonBoundComplete !== true) {
    issues.push("event_word_language_finite_automaton_invalid");
  }
  if (predicatePlan.continuousChoiceKind !== "player_choice_not_chance" ||
      predicatePlan.chanceMassAssigned !== false ||
      automaton.continuousChoiceKind !== "player_choice_not_chance" ||
      automaton.chanceMassAssigned !== false) {
    issues.push("event_word_language_chance_contract_invalid");
  }
  return uniqueSorted(issues);
}

function boundaryUnreachabilityIssues(predicatePlan = {}) {
  const allowanceIn = Number(predicatePlan.movementAllowanceIn || 0);
  return (predicatePlan.eventRegions || []).flatMap((region) => {
    const key = String(region.eventRegionKey || "unknown");
    const lowerBoundIn = Number(region.startToBoundaryDistanceLowerBoundIn);
    const issues = [];
    if (region.actorStartOnBoundary === true) {
      issues.push(`event_boundary_start_requires_reachable_language_solver:${key}`);
    }
    if (region.boundaryUnreachabilityTheoremKey !==
        BOUNDARY_UNREACHABILITY_THEOREM ||
        !Number.isFinite(lowerBoundIn) || lowerBoundIn < 0) {
      issues.push(`event_boundary_distance_certificate_invalid:${key}`);
    }
    if (region.boundaryUnreachableWithinMovementAllowanceProven !== true ||
        !(lowerBoundIn > allowanceIn + 0.001)) {
      issues.push(`event_boundary_reachable_or_unresolved:${key}`);
    }
    return issues;
  });
}

function emptyWordWitness(automaton = {}, initialInsideRegionKeys = []) {
  return (automaton.pathReplays || []).find((replay) =>
    replay.replayAccepted === true &&
    Number(replay.crossingCount || 0) === 0 &&
    stableGraphHash(uniqueSorted(replay.initialInsideRegionKeys || [])) ===
      stableGraphHash(initialInsideRegionKeys) &&
    stableGraphHash(uniqueSorted(replay.finalInsideRegionKeys || [])) ===
      stableGraphHash(initialInsideRegionKeys)) || null;
}

function validateQuantizedWorklistReceipt(
  receipt = null,
  predicatePlan = {},
  automaton = {},
) {
  if (!receipt) return { supplied: false, complete: false, issues: [] };
  const issues = [];
  if (receipt.schemaVersion !==
        WARMACHINE_QUANTIZED_MOVEMENT_EVENT_WORD_WORKLIST_V1_SCHEMA ||
      !receiptValid(
        receipt,
        "quantizedMovementEventWordWorklistReceiptHash",
      )) {
    issues.push("event_word_language_quantized_worklist_invalid");
  }
  if (String(receipt.predicatePlanReceiptHash || "") !==
        String(predicatePlan.predicatePlanReceiptHash || "") ||
      String(receipt.movementEventAutomatonReceiptHash || "") !==
        String(automaton.movementEventAutomatonReceiptHash || "")) {
    issues.push("event_word_language_quantized_worklist_binding_mismatch");
  }
  if (receipt.continuousChoiceKind !== "player_choice_not_chance" ||
      receipt.chanceMassAssigned !== false) {
    issues.push("event_word_language_quantized_worklist_chance_invalid");
  }
  const complete = issues.length === 0 && receipt.ok === true &&
    receipt.endpointScanComplete === true &&
    receipt.pathWorklistComplete === true &&
    receipt.allLegalQuantizedPathsCoveredByEventWordDenominator === true &&
    receipt.geometricEventWordLanguageComplete === true;
  return { supplied: true, complete, issues: uniqueSorted(issues) };
}

export function buildWarmachineMovementEventWordLanguageV1(
  predicatePlan = {},
  automaton = {},
  options = {},
) {
  const quantizedWorklistReceipt = options.quantizedWorklistReceipt || null;
  const quantizedWorklist = validateQuantizedWorklistReceipt(
    quantizedWorklistReceipt,
    predicatePlan,
    automaton,
  );
  const validationIssues = uniqueSorted([
    ...validateInputs(predicatePlan, automaton),
    ...quantizedWorklist.issues,
  ]);
  const eventRegionKeys = uniqueSorted((predicatePlan.eventRegions || []).map((row) =>
    row.eventRegionKey));
  const initialInsideRegionKeys = uniqueSorted(
    (predicatePlan.eventRegions || [])
      .filter((row) => row.actorStartInside === true)
      .map((row) => row.eventRegionKey),
  );
  const unreachabilityIssues = boundaryUnreachabilityIssues(predicatePlan);
  const allBoundariesUnreachable = unreachabilityIssues.length === 0;
  const witness = allBoundariesUnreachable
    ? emptyWordWitness(automaton, initialInsideRegionKeys)
    : null;
  const boundaryUnreachableScopeComplete = validationIssues.length === 0 &&
    allBoundariesUnreachable && Boolean(witness);
  const quantizedReachableScopeComplete = validationIssues.length === 0 &&
    quantizedWorklist.complete;
  const eventWords = boundaryUnreachableScopeComplete
    ? [stableGraphValue({
      eventWordKey: "declared-event-word:epsilon",
      initialInsideRegionKeys,
      crossingLabels: [],
      crossingCount: 0,
      finalInsideRegionKeys: initialInsideRegionKeys,
      strictExistenceWitnessPathReplayHash: String(witness.pathReplayHash || ""),
      exhaustiveByTheorem:
        "every_boundary_requires_more_geometric_path_length_than_the_total_movement_allowance_v1",
    })]
    : quantizedReachableScopeComplete
      ? stableGraphValue(quantizedWorklistReceipt.eventWords || [])
      : [];
  const geometricEventWordLanguageComplete = boundaryUnreachableScopeComplete ||
    quantizedReachableScopeComplete;
  const completionDebts = uniqueSorted([
    ...validationIssues,
    ...(!allBoundariesUnreachable && !quantizedReachableScopeComplete
      ? ["reachable_event_boundary_language_not_materialized"]
      : []),
    ...(allBoundariesUnreachable && !witness
      ? ["empty_event_word_strict_witness_missing"]
      : []),
    "event_reactions_and_external_hooks_not_closed",
    "event_effect_transition_stability_not_proven",
  ]);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_MOVEMENT_EVENT_WORD_LANGUAGE_V1_SCHEMA,
    ok: validationIssues.length === 0,
    predicatePlanReceiptHash: String(predicatePlan.predicatePlanReceiptHash || ""),
    movementEventAutomatonReceiptHash: String(
      automaton.movementEventAutomatonReceiptHash || "",
    ),
    theoremKey: boundaryUnreachableScopeComplete
      ? "unreachable_event_boundaries_imply_single_empty_event_word_language_v1"
      : quantizedReachableScopeComplete
        ? "exhausted_cent_inch_endpoint_and_pareto_path_worklist_event_language_v1"
        : "event_word_language_incomplete_v1",
    boundaryUnreachabilityTheoremKey: BOUNDARY_UNREACHABILITY_THEOREM,
    eventRegionKeys,
    eventRegionCount: eventRegionKeys.length,
    movementAllowanceIn: Number(predicatePlan.movementAllowanceIn || 0),
    initialInsideRegionKeys,
    boundaryUnreachabilityIssues: uniqueSorted(unreachabilityIssues),
    boundaryUnreachableScopeComplete,
    quantizedReachableScopeComplete,
    quantizedMovementEventWordWorklistReceiptHash: String(
      quantizedWorklistReceipt
        ?.quantizedMovementEventWordWorklistReceiptHash || "",
    ),
    eventWords,
    eventWordDenominatorCount: eventWords.length,
    allLegalPathsCoveredByEventWordDenominator:
      geometricEventWordLanguageComplete,
    strictExistenceWitnessPresent: boundaryUnreachableScopeComplete
      ? Boolean(witness)
      : quantizedReachableScopeComplete && eventWords.every((word) =>
        Boolean(word.strictExistenceWitnessPathEvaluationHash)),
    geometricEventWordLanguageComplete,
    declaredEventEffectResolutionCompleteWithinLanguage:
      geometricEventWordLanguageComplete,
    reactionsAndExternalHooksProven: false,
    rulesEffectResolutionComplete: false,
    transitionStable: false,
    ruleBehaviorQuotientComplete: false,
    validationIssues,
    completionDebts,
    continuousChoiceKind: "player_choice_not_chance",
    chanceMassAssigned: false,
    claimBoundary:
      "This receipt completes the geometric event-word language either by proving every declared boundary unreachable and witnessing the sole epsilon word, or by binding an exhausted cent-inch endpoint and Pareto path worklist whose Host-checked edge ledger covers every legal quantized waypoint path in scope. A closed-boundary start has exact inside membership. Without one of those proofs, reachable boundaries remain unresolved. Reactions, external hooks, effect transition stability and Q_rule remain outside this receipt.",
  });
  return {
    ...core,
    movementEventWordLanguageReceiptHash: stableGraphHash(core),
  };
}
