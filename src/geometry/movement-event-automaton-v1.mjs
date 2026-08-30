import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA } from
  "./predicate-plan-v1.mjs";

export const WARMACHINE_MOVEMENT_EVENT_AUTOMATON_V1_SCHEMA =
  "warmachine_movement_event_automaton_v1";

const AUTOMATON_THEOREM =
  "cent_inch_quantized_positive_cost_convex_region_crossing_finite_bound_v1";
const ALLOWED_EVENT_PATH_DEBTS = new Set([
  "movement_cost_path_partition_required",
  "movement_hazard_path_partition_required",
]);

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

function validatePredicatePlan(predicatePlan = {}, options = {}) {
  const issues = [];
  if (predicatePlan.schemaVersion !== WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA ||
      !receiptValid(predicatePlan, "predicatePlanReceiptHash")) {
    issues.push("movement_event_automaton_predicate_plan_invalid");
  }
  if (predicatePlan.hostFocusedExecutionReceiptCurrent !== true) {
    issues.push("movement_event_automaton_engine_receipt_stale");
  }
  if (predicatePlan.continuousChoiceKind !== "player_choice_not_chance" ||
      predicatePlan.chanceMassAssigned !== false) {
    issues.push("movement_event_automaton_chance_contract_invalid");
  }
  const eventRegionCount = (predicatePlan.eventRegions || []).length;
  const maximumSegments = Number(predicatePlan.maximumLegalPathSegmentCount);
  const maximumCrossings = Number(
    predicatePlan.maximumDeclaredEventRegionBoundaryCrossingCount,
  );
  const expectedCrossings = maximumSegments * eventRegionCount * 2;
  if (predicatePlan.declaredEventRegionAutomatonBoundTheoremKey !==
        AUTOMATON_THEOREM ||
      predicatePlan.declaredEventRegionAutomatonFiniteBoundExactWithinScope !== true ||
      Number(predicatePlan.pathCoordinateQuantumIn) !== 0.01 ||
      Number(predicatePlan.minimumPositivePathSegmentDistanceIn) !== 0.01 ||
      !Number.isInteger(maximumSegments) || maximumSegments < 0 ||
      !Number.isInteger(maximumCrossings) || maximumCrossings !== expectedCrossings) {
    issues.push("movement_event_automaton_host_finite_bound_invalid");
  } else {
    const expectedStateUpperBound = (
      BigInt(maximumCrossings + 1) * (1n << BigInt(eventRegionCount))
    ).toString();
    if (String(
      predicatePlan.maximumDeclaredEventRegionAutomatonStateUpperBound || "",
    ) !== expectedStateUpperBound) {
      issues.push("movement_event_automaton_host_state_bound_invalid");
    }
  }
  if ((predicatePlan.eventRegions || []).some((region) =>
    region.exactWithinScope !== true ||
    region.orderedBoundaryCrossingExactWithinScope !== true ||
    region.membershipBoundaryKind !== "closed" ||
    !Number.isFinite(Number(region.membershipToleranceIn)) ||
    Number(region.membershipToleranceIn) < 0)) {
    issues.push("movement_event_automaton_event_region_not_exact");
  }
  const factoredUnitGroupId = String(options.factoredUnitGroupId || "");
  const unitGeometryDebts = (predicatePlan.wildcardDebts || []).filter((debt) =>
    String(debt.reason || "") ===
      "unit_group_geometry_requires_factored_unit_domain");
  const unsupportedWildcardDebts = (predicatePlan.wildcardDebts || [])
    .filter((debt) => {
      const reason = String(debt.reason || "");
      if (ALLOWED_EVENT_PATH_DEBTS.has(reason)) return false;
      return !(reason === "unit_group_geometry_requires_factored_unit_domain" &&
        factoredUnitGroupId &&
        String(debt.unitGroupId || "") === factoredUnitGroupId);
    })
    .map((debt) => String(debt.reason || "unknown"));
  if (unsupportedWildcardDebts.length) {
    issues.push(...unsupportedWildcardDebts.map((reason) =>
      `movement_event_automaton_unsupported_wildcard:${reason}`));
  }
  if (factoredUnitGroupId &&
      (unitGeometryDebts.length !== 1 ||
        String(unitGeometryDebts[0]?.unitGroupId || "") !== factoredUnitGroupId)) {
    issues.push("movement_event_automaton_factored_unit_debt_binding_invalid");
  }
  return uniqueSorted(issues);
}

function validatePathEvaluation(pathEvaluation = {}, predicatePlan = {}) {
  const issues = [];
  if (pathEvaluation.schemaVersion !==
        "warmachine_movement_geometry_path_evaluation_v1" ||
      !receiptValid(pathEvaluation, "pathEvaluationHash")) {
    issues.push("movement_event_path_evaluation_invalid");
  }
  if (String(pathEvaluation.predicatePlanHash || "") !==
      String(predicatePlan.hostPredicatePlanHash || "")) {
    issues.push("movement_event_path_predicate_binding_mismatch");
  }
  if (pathEvaluation.pathStrictPrecheckPassed !== true) {
    issues.push("movement_event_path_strict_precheck_failed");
  }
  if (pathEvaluation.boundaryCrossingTraceExact !== true ||
      (pathEvaluation.boundaryCrossingAmbiguities || []).length !== 0) {
    issues.push("movement_event_path_boundary_trace_not_exact");
  }
  if (pathEvaluation.continuousChoiceKind !== "player_choice_not_chance" ||
      pathEvaluation.chanceMassAssigned !== false) {
    issues.push("movement_event_path_chance_contract_invalid");
  }
  const regionKeys = uniqueSorted((predicatePlan.eventRegions || []).map((region) =>
    region.eventRegionKey));
  const initialKeys = uniqueSorted(
    (pathEvaluation.initialEventRegionAssignments || []).map((row) =>
      row.eventRegionKey),
  );
  const finalKeys = uniqueSorted(
    (pathEvaluation.finalEventRegionAssignments || []).map((row) =>
      row.eventRegionKey),
  );
  if (stableGraphHash(initialKeys) !== stableGraphHash(regionKeys) ||
      stableGraphHash(finalKeys) !== stableGraphHash(regionKeys)) {
    issues.push("movement_event_path_membership_denominator_mismatch");
  }
  if ([
    ...(pathEvaluation.initialEventRegionAssignments || []),
    ...(pathEvaluation.finalEventRegionAssignments || []),
  ].some((row) =>
    row.membershipBoundaryKind !== "closed" ||
    !Number.isFinite(Number(row.membershipToleranceIn)) ||
    Number(row.membershipToleranceIn) < 0 ||
    (row.onBoundary === true && row.inside !== true))) {
    issues.push("movement_event_path_endpoint_membership_contract_invalid");
  }
  if ((pathEvaluation.orderedBoundaryCrossingTrace || []).length >
      Number(predicatePlan.maximumDeclaredEventRegionBoundaryCrossingCount || 0)) {
    issues.push("movement_event_path_crossing_bound_exceeded");
  }
  const effectResolutions = pathEvaluation.simultaneousEventEffectResolutions || [];
  const resolutionByGroupKey = new Map();
  for (const resolution of effectResolutions) {
    const groupKey = String(resolution.simultaneousCrossingGroupKey || "");
    if (!groupKey || resolutionByGroupKey.has(groupKey) ||
        !receiptValid(resolution, "eventEffectResolutionHash")) {
      issues.push("movement_event_effect_resolution_receipt_invalid");
      continue;
    }
    resolutionByGroupKey.set(groupKey, resolution);
  }
  const crossingGroupKeys = uniqueSorted(
    (pathEvaluation.orderedBoundaryCrossingTrace || []).map((crossing) =>
      crossing.simultaneousCrossingGroupKey),
  );
  if (stableGraphHash([...resolutionByGroupKey.keys()].sort()) !==
      stableGraphHash(crossingGroupKeys)) {
    issues.push("movement_event_effect_resolution_denominator_mismatch");
  }
  for (const crossing of pathEvaluation.orderedBoundaryCrossingTrace || []) {
    const resolution = resolutionByGroupKey.get(String(
      crossing.simultaneousCrossingGroupKey || "",
    ));
    if (!resolution ||
        String(crossing.eventEffectResolutionHash || "") !==
          String(resolution.eventEffectResolutionHash || "") ||
        crossing.successorConfluenceProven !==
          resolution.successorConfluenceProven ||
        crossing.declaredEventRegionEffectResolutionProven !==
          resolution.declaredEventRegionEffectResolutionProven) {
      issues.push("movement_event_effect_resolution_crossing_binding_invalid");
    }
  }
  const observedResolutionComplete = effectResolutions.every((resolution) =>
    resolution.declaredEventRegionEffectResolutionProven === true);
  if (pathEvaluation.observedDeclaredEventRegionEffectResolutionComplete !==
      observedResolutionComplete ||
      pathEvaluation.reactionsAndExternalHooksProven !== false) {
    issues.push("movement_event_effect_resolution_scope_invalid");
  }
  return uniqueSorted(issues);
}

function membershipKeys(membership = new Map()) {
  return [...membership.entries()]
    .filter(([, inside]) => inside === true)
    .map(([key]) => key)
    .sort();
}

function replayPathTrace(pathEvaluation = {}, pathIndex = 0) {
  const issues = [];
  const membership = new Map(
    (pathEvaluation.initialEventRegionAssignments || []).map((row) => [
      String(row.eventRegionKey || ""),
      row.inside === true,
    ]),
  );
  const groups = [];
  for (const crossing of pathEvaluation.orderedBoundaryCrossingTrace || []) {
    const groupKey = String(crossing.simultaneousCrossingGroupKey || "");
    let group = groups.at(-1);
    if (!group || group.groupKey !== groupKey) {
      group = { groupKey, crossings: [] };
      groups.push(group);
    }
    group.crossings.push(crossing);
  }
  const transitions = [];
  let simultaneousRuleOrderDebtCount = 0;
  for (const [groupIndex, group] of groups.entries()) {
    const beforeInsideRegionKeys = membershipKeys(membership);
    const seenKeys = new Set();
    for (const crossing of group.crossings) {
      const eventRegionKey = String(crossing.eventRegionKey || "");
      const crossingKind = String(crossing.crossingKind || "");
      if (!membership.has(eventRegionKey)) {
        issues.push(`crossing_unknown_event_region:${eventRegionKey}`);
        continue;
      }
      if (seenKeys.has(eventRegionKey)) {
        issues.push(`simultaneous_duplicate_event_region:${eventRegionKey}`);
        continue;
      }
      seenKeys.add(eventRegionKey);
      if (crossingKind === "enter" && membership.get(eventRegionKey) === true) {
        issues.push(`enter_requires_outside:${eventRegionKey}`);
      } else if (crossingKind === "exit" &&
          membership.get(eventRegionKey) !== true) {
        issues.push(`exit_requires_inside:${eventRegionKey}`);
      } else if (!["enter", "exit"].includes(crossingKind)) {
        issues.push(`crossing_kind_invalid:${crossingKind || "missing"}`);
      }
    }
    const groupResolutionHashes = uniqueSorted(group.crossings.map((crossing) =>
      crossing.eventEffectResolutionHash));
    const declaredEventRegionEffectResolutionProven =
      groupResolutionHashes.length === 1 && group.crossings.every((crossing) =>
        crossing.declaredEventRegionEffectResolutionProven === true);
    const successorConfluenceProven = group.crossings.every((crossing) =>
      crossing.successorConfluenceProven === true);
    if (group.crossings.length > 1 &&
        !declaredEventRegionEffectResolutionProven) {
      simultaneousRuleOrderDebtCount += 1;
    }
    if (!issues.length) {
      for (const crossing of group.crossings) {
        membership.set(
          String(crossing.eventRegionKey || ""),
          crossing.crossingKind === "enter",
        );
      }
    }
    transitions.push(stableGraphValue({
      transitionIndex: groupIndex,
      simultaneousCrossingGroupKey: group.groupKey,
      beforeInsideRegionKeys,
      crossingLabels: group.crossings.map((crossing) => ({
        eventRegionKey: String(crossing.eventRegionKey || ""),
        crossingKind: String(crossing.crossingKind || ""),
      })),
      afterInsideRegionKeys: membershipKeys(membership),
      membershipTransitionOrderIndependent:
        new Set(group.crossings.map((crossing) =>
          String(crossing.eventRegionKey || ""))).size ===
          group.crossings.length,
      rulesEffectOrderProven: group.crossings.length === 1,
      rulesEffectSuccessorConfluenceProven: successorConfluenceProven,
      declaredEventRegionEffectResolutionProven,
      eventEffectResolutionHash: groupResolutionHashes.length === 1
        ? groupResolutionHashes[0]
        : "",
    }));
  }
  const expectedFinal = uniqueSorted(
    (pathEvaluation.finalEventRegionAssignments || [])
      .filter((row) => row.inside === true)
      .map((row) => row.eventRegionKey),
  );
  const observedFinal = membershipKeys(membership);
  if (stableGraphHash(expectedFinal) !== stableGraphHash(observedFinal)) {
    issues.push("movement_event_path_final_membership_mismatch");
  }
  const core = stableGraphValue({
    schemaVersion: "warmachine_movement_event_automaton_path_replay_v1",
    pathIndex,
    pathEvaluationHash: String(pathEvaluation.pathEvaluationHash || ""),
    initialInsideRegionKeys: uniqueSorted(
      (pathEvaluation.initialEventRegionAssignments || [])
        .filter((row) => row.inside === true)
        .map((row) => row.eventRegionKey),
    ),
    finalInsideRegionKeys: observedFinal,
    crossingCount: (pathEvaluation.orderedBoundaryCrossingTrace || []).length,
    transitionCount: transitions.length,
    transitions,
    simultaneousRuleOrderDebtCount,
    observedDeclaredEventRegionEffectResolutionComplete:
      transitions.every((transition) =>
        transition.declaredEventRegionEffectResolutionProven === true),
    replayAccepted: issues.length === 0,
    issues: uniqueSorted(issues),
    chanceMass: null,
  });
  return {
    ...core,
    pathReplayHash: stableGraphHash(core),
  };
}

export function buildWarmachineMovementEventAutomatonV1(
  predicatePlan = {},
  pathEvaluations = [],
  options = {},
) {
  const validationIssues = validatePredicatePlan(predicatePlan, options);
  const factoredUnitGroupId = String(options.factoredUnitGroupId || "");
  const pathValidationIssues = pathEvaluations.flatMap((pathEvaluation, index) =>
    validatePathEvaluation(pathEvaluation, predicatePlan).map((issue) =>
      `path_${index}:${issue}`));
  const pathReplays = pathEvaluations.map((pathEvaluation, index) =>
    replayPathTrace(pathEvaluation, index));
  const pathReplayIssues = pathReplays.flatMap((replay) =>
    replay.issues.map((issue) => `path_${replay.pathIndex}:${issue}`));
  const allIssues = uniqueSorted([
    ...validationIssues,
    ...pathValidationIssues,
    ...pathReplayIssues,
  ]);
  const eventRegionKeys = uniqueSorted((predicatePlan.eventRegions || []).map((row) =>
    row.eventRegionKey));
  const finiteAutomatonBoundComplete = validationIssues.length === 0;
  const observedPathTraceReplayComplete = pathEvaluations.length > 0 &&
    pathValidationIssues.length === 0 && pathReplayIssues.length === 0;
  const simultaneousRuleOrderDebtCount = pathReplays.reduce((sum, replay) =>
    sum + Number(replay.simultaneousRuleOrderDebtCount || 0), 0);
  const observedDeclaredEventRegionEffectResolutionComplete =
    pathReplays.length > 0 && pathReplays.every((replay) =>
      replay.observedDeclaredEventRegionEffectResolutionComplete === true);
  const symbolicTransitionRules = eventRegionKeys.flatMap((eventRegionKey) => [{
    eventRegionKey,
    crossingKind: "enter",
    precondition: "event_region_is_outside",
    effect: "event_region_becomes_inside",
  }, {
    eventRegionKey,
    crossingKind: "exit",
    precondition: "event_region_is_inside",
    effect: "event_region_becomes_outside",
  }]);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_MOVEMENT_EVENT_AUTOMATON_V1_SCHEMA,
    ok: allIssues.length === 0,
    predicatePlanReceiptHash: String(predicatePlan.predicatePlanReceiptHash || ""),
    hostPredicatePlanHash: String(predicatePlan.hostPredicatePlanHash || ""),
    factoredUnitGroupId,
    selectedModelPathOnly: Boolean(factoredUnitGroupId),
    theoremKey: String(
      predicatePlan.declaredEventRegionAutomatonBoundTheoremKey || "",
    ),
    eventRegionKeys,
    eventRegionCount: eventRegionKeys.length,
    pathCoordinateQuantumIn: Number(predicatePlan.pathCoordinateQuantumIn || 0),
    minimumPositivePathSegmentDistanceIn: Number(
      predicatePlan.minimumPositivePathSegmentDistanceIn || 0,
    ),
    maximumLegalPathSegmentCount: Number(
      predicatePlan.maximumLegalPathSegmentCount || 0,
    ),
    maximumBoundaryCrossingCount: Number(
      predicatePlan.maximumDeclaredEventRegionBoundaryCrossingCount || 0,
    ),
    maximumFiniteStateUpperBound: String(
      predicatePlan.maximumDeclaredEventRegionAutomatonStateUpperBound || "",
    ),
    symbolicState:
      "event_region_membership_bitset_times_consumed_boundary_crossing_budget",
    symbolicTransitionRules,
    finiteAutomatonBoundComplete,
    observedPathCount: pathEvaluations.length,
    observedPathTraceReplayComplete,
    pathReplays,
    simultaneousRuleOrderDebtCount,
    observedDeclaredEventRegionEffectResolutionComplete,
    geometricEventWordLanguageComplete: false,
    rulesEffectResolutionComplete: false,
    transitionStable: false,
    ruleBehaviorQuotientComplete: false,
    validationIssues: allIssues,
    completionDebts: uniqueSorted([
      ...allIssues,
      "geometric_event_word_language_not_proven",
      ...(simultaneousRuleOrderDebtCount
        ? ["simultaneous_event_rule_order_unresolved"]
        : []),
      "event_effect_transition_stability_not_proven",
    ]),
    continuousChoiceKind: "player_choice_not_chance",
    chanceMassAssigned: false,
    claimBoundary:
      "This receipt proves that the declared Engine event-region membership/crossing automaton has a finite source-bound upper state count and replays supplied exact Engine traces. For supplied traces it accepts either a source order or a Host-signed semantic-successor confluence proof, without inventing an order. A bound factored Unit group closes only the selected trooper path automaton while leaving joint simultaneous placements incomplete. It intentionally over-approximates geometrically realizable event words, excludes reaction/external-hook closure, assigns no Chance mass and does not prove transition stability or Q_rule.",
  });
  return {
    ...core,
    movementEventAutomatonReceiptHash: stableGraphHash(core),
  };
}
