import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { WARMACHINE_MOVEMENT_EVENT_AUTOMATON_V1_SCHEMA } from
  "./movement-event-automaton-v1.mjs";
import { WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA } from
  "./predicate-plan-v1.mjs";
import {
  evaluateRulesV1MovementGeometryEndpoint,
  evaluateRulesV1MovementGeometryPath,
} from "../warmachine-host-runtime.mjs";

export const WARMACHINE_QUANTIZED_MOVEMENT_EVENT_WORD_WORKLIST_V1_SCHEMA =
  "warmachine_quantized_movement_event_word_worklist_v1";
export const WARMACHINE_QUANTIZED_MOVEMENT_EVENT_WORD_CHECKPOINT_V1_SCHEMA =
  "warmachine_quantized_movement_event_word_checkpoint_v1";

const ALLOWED_PATH_DEBTS = new Set([
  "movement_cost_path_partition_required",
  "movement_hazard_path_partition_required",
]);
const EPSILON = 0.001;

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

function boundedInteger(value, fallback, minimum = 1) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function pointKey(point = {}) {
  return `${Number(point.xIn).toFixed(2)},${Number(point.yIn).toFixed(2)}`;
}

function pointDistance(left = {}, right = {}) {
  return Math.hypot(
    Number(left.xIn) - Number(right.xIn),
    Number(left.yIn) - Number(right.yIn),
  );
}

function validateInputs(predicatePlan = {}, automaton = {}, options = {}) {
  const issues = [];
  if (predicatePlan.schemaVersion !== WARMACHINE_GEOMETRY_PREDICATE_PLAN_V1_SCHEMA ||
      !receiptValid(predicatePlan, "predicatePlanReceiptHash")) {
    issues.push("quantized_event_word_predicate_plan_invalid");
  }
  if (automaton.schemaVersion !== WARMACHINE_MOVEMENT_EVENT_AUTOMATON_V1_SCHEMA ||
      !receiptValid(automaton, "movementEventAutomatonReceiptHash") ||
      automaton.ok !== true || automaton.finiteAutomatonBoundComplete !== true) {
    issues.push("quantized_event_word_automaton_invalid");
  }
  if (String(automaton.predicatePlanReceiptHash || "") !==
      String(predicatePlan.predicatePlanReceiptHash || "")) {
    issues.push("quantized_event_word_receipt_binding_mismatch");
  }
  const factoredUnitGroupId = String(options.factoredUnitGroupId || "");
  if (String(automaton.factoredUnitGroupId || "") !== factoredUnitGroupId) {
    issues.push("quantized_event_word_automaton_factored_unit_binding_mismatch");
  }
  if (predicatePlan.hostFocusedExecutionReceiptCurrent !== true) {
    issues.push("quantized_event_word_engine_receipt_stale");
  }
  if (Number(predicatePlan.pathCoordinateQuantumIn) !== 0.01 ||
      Number(predicatePlan.minimumPositivePathSegmentDistanceIn) !== 0.01 ||
      !Number.isInteger(Number(predicatePlan.maximumLegalPathSegmentCount)) ||
      Number(predicatePlan.maximumLegalPathSegmentCount) < 0) {
    issues.push("quantized_event_word_host_path_domain_invalid");
  }
  const unitGeometryDebts = (predicatePlan.wildcardDebts || []).filter((debt) =>
    String(debt.reason || "") ===
      "unit_group_geometry_requires_factored_unit_domain");
  const unsupportedDebts = (predicatePlan.wildcardDebts || [])
    .filter((debt) => {
      const reason = String(debt.reason || "unknown");
      if (ALLOWED_PATH_DEBTS.has(reason)) return false;
      return !(reason === "unit_group_geometry_requires_factored_unit_domain" &&
        factoredUnitGroupId &&
        String(debt.unitGroupId || "") === factoredUnitGroupId);
    })
    .map((debt) => String(debt.reason || "unknown"));
  issues.push(...unsupportedDebts.map((reason) =>
    `quantized_event_word_unsupported_path_debt:${reason}`));
  if (factoredUnitGroupId &&
      (unitGeometryDebts.length !== 1 ||
        String(unitGeometryDebts[0]?.unitGroupId || "") !== factoredUnitGroupId)) {
    issues.push("quantized_event_word_factored_unit_debt_binding_invalid");
  }
  if (predicatePlan.continuousChoiceKind !== "player_choice_not_chance" ||
      predicatePlan.chanceMassAssigned !== false ||
      automaton.continuousChoiceKind !== "player_choice_not_chance" ||
      automaton.chanceMassAssigned !== false) {
    issues.push("quantized_event_word_chance_contract_invalid");
  }
  const board = (predicatePlan.predicates || []).find((predicate) =>
    predicate.predicateKey === "endpoint_within_board_after_base_inset");
  const allowance = (predicatePlan.predicates || []).find((predicate) =>
    predicate.predicateKey === "endpoint_within_movement_allowance");
  if (board?.primitive?.primitiveKind !== "axis_aligned_rectangle_inclusion" ||
      allowance?.primitive?.primitiveKind !== "circle_inclusion" ||
      !Number.isFinite(Number(allowance.primitive.radiusIn)) ||
      Number(allowance.primitive.radiusIn) < 0) {
    issues.push("quantized_event_word_canonical_scan_bounds_missing");
  }
  return {
    issues: uniqueSorted(issues),
    boardBounds: board?.primitive?.bounds || null,
    startPoint: allowance?.primitive?.center || predicatePlan.actorPosition || null,
    movementAllowanceIn: Number(allowance?.primitive?.radiusIn || 0),
    factoredUnitGroupId,
  };
}

function scanBounds(validation = {}) {
  const quantum = 0.01;
  const bounds = validation.boardBounds || {};
  const start = validation.startPoint || {};
  const allowance = validation.movementAllowanceIn;
  const minimumX = Math.max(Number(bounds.left), Number(start.xIn) - allowance);
  const maximumX = Math.min(Number(bounds.right), Number(start.xIn) + allowance);
  const minimumY = Math.max(Number(bounds.top), Number(start.yIn) - allowance);
  const maximumY = Math.min(Number(bounds.bottom), Number(start.yIn) + allowance);
  const minimumXIndex = Math.ceil((minimumX - 1e-9) / quantum);
  const maximumXIndex = Math.floor((maximumX + 1e-9) / quantum);
  const minimumYIndex = Math.ceil((minimumY - 1e-9) / quantum);
  const maximumYIndex = Math.floor((maximumY + 1e-9) / quantum);
  const width = Math.max(0, maximumXIndex - minimumXIndex + 1);
  const height = Math.max(0, maximumYIndex - minimumYIndex + 1);
  return stableGraphValue({
    quantumIn: quantum,
    minimumXIndex,
    maximumXIndex,
    minimumYIndex,
    maximumYIndex,
    width,
    height,
    candidatePointCount: width * height,
  });
}

function pointAtScanOffset(bounds = {}, offset = 0) {
  const xOffset = offset % Number(bounds.width || 1);
  const yOffset = Math.floor(offset / Number(bounds.width || 1));
  return {
    xIn: Number(((Number(bounds.minimumXIndex) + xOffset) / 100).toFixed(2)),
    yIn: Number(((Number(bounds.minimumYIndex) + yOffset) / 100).toFixed(2)),
  };
}

function normalizedCrossingGroups(pathEvaluation = {}) {
  const groups = [];
  for (const crossing of pathEvaluation.orderedBoundaryCrossingTrace || []) {
    const sourceGroupKey = String(crossing.simultaneousCrossingGroupKey || "");
    let group = groups.at(-1);
    if (!group || group.sourceGroupKey !== sourceGroupKey) {
      group = { sourceGroupKey, labels: [] };
      groups.push(group);
    }
    group.labels.push({
      eventRegionKey: String(crossing.eventRegionKey || ""),
      crossingKind: String(crossing.crossingKind || ""),
    });
  }
  return groups.map((group) => ({
    crossingLabels: [...group.labels].sort((left, right) =>
      left.eventRegionKey.localeCompare(right.eventRegionKey) ||
      left.crossingKind.localeCompare(right.crossingKind)),
  }));
}

function eventWordForPath(pathEvaluation = {}) {
  const initialInsideRegionKeys = uniqueSorted(
    (pathEvaluation.initialEventRegionAssignments || [])
      .filter((row) => row.inside === true)
      .map((row) => row.eventRegionKey),
  );
  const finalInsideRegionKeys = uniqueSorted(
    (pathEvaluation.finalEventRegionAssignments || [])
      .filter((row) => row.inside === true)
      .map((row) => row.eventRegionKey),
  );
  const crossingGroups = normalizedCrossingGroups(pathEvaluation);
  const identity = stableGraphValue({
    initialInsideRegionKeys,
    crossingGroups,
    finalInsideRegionKeys,
  });
  return stableGraphValue({
    eventWordKey: `declared-event-word:${stableGraphHash(identity)}`,
    ...identity,
    crossingLabels: crossingGroups.flatMap((group) => group.crossingLabels),
    crossingCount: crossingGroups.reduce((sum, group) =>
      sum + group.crossingLabels.length, 0),
  });
}

function pathNodeCore(parentPathNodeHash = "", point = {}, depth = 0) {
  return stableGraphValue({
    parentPathNodeHash: String(parentPathNodeHash || ""),
    point,
    depth: Number(depth),
  });
}

function ensurePathNode(checkpoint = {}, parentPathNodeHash = "", point = {}, depth = 0) {
  const core = pathNodeCore(parentPathNodeHash, point, depth);
  const pathNodeHash = stableGraphHash(core);
  if (!checkpoint.pathNodes.some((node) => node.pathNodeHash === pathNodeHash)) {
    checkpoint.pathNodes.push({ ...core, pathNodeHash });
  }
  return pathNodeHash;
}

function reconstructPathPoints(checkpoint = {}, pathNodeHash = "") {
  const nodesByHash = new Map(checkpoint.pathNodes.map((node) => [
    node.pathNodeHash,
    node,
  ]));
  const reversed = [];
  const seen = new Set();
  let cursor = String(pathNodeHash || "");
  while (cursor) {
    if (seen.has(cursor)) throw new Error("quantized_event_word_path_dag_cycle");
    seen.add(cursor);
    const node = nodesByHash.get(cursor);
    if (!node) throw new Error(`quantized_event_word_path_node_missing:${cursor}`);
    reversed.push(node.point);
    cursor = String(node.parentPathNodeHash || "");
  }
  return reversed.reverse();
}

export function listWarmachineQuantizedMovementPathRepresentativesV1(
  receipt = {},
) {
  if (!receiptValid(
    receipt,
    "quantizedMovementEventWordWorklistReceiptHash",
  ) || receipt.geometricEventWordLanguageComplete !== true ||
      receipt.allLegalQuantizedPathsCoveredByEventWordDenominator !== true ||
      !receiptValid(receipt.resumeCheckpoint || {}, "checkpointHash")) {
    throw new Error("quantized_event_word_representatives_receipt_invalid");
  }
  const checkpoint = receipt.resumeCheckpoint;
  return stableGraphValue((checkpoint.frontierStates || [])
    .map((pathState) => ({
      pathStateHash: String(pathState.pathStateHash || ""),
      pathNodeHash: String(pathState.pathNodeHash || ""),
      currentPoint: pathState.currentPoint,
      segmentCount: Number(pathState.segmentCount || 0),
      rawDistanceIn: Number(pathState.rawDistanceIn || 0),
      movementCostIn: Number(pathState.movementCostIn || 0),
      eventWordKey: String(pathState.eventWordKey || ""),
      roughTerrainKeys: pathState.roughTerrainKeys || [],
      pathEvaluationHash: String(pathState.pathEvaluationHash || ""),
      pathPoints: reconstructPathPoints(checkpoint, pathState.pathNodeHash),
    }))
    .sort((left, right) => left.pathStateHash.localeCompare(right.pathStateHash)));
}

function pathStateForEvaluation(pathEvaluation = {}, pathNodeHash = "") {
  const eventWord = eventWordForPath(pathEvaluation);
  const pathPoints = pathEvaluation.pathPoints || [];
  const core = stableGraphValue({
    pathNodeHash: String(pathNodeHash || ""),
    currentPoint: pathPoints.at(-1) || null,
    segmentCount: Math.max(0, pathPoints.length - 1),
    rawDistanceIn: Number(pathEvaluation.movementCost?.rawDistanceIn || 0),
    movementCostIn: Number(pathEvaluation.movementCost?.costIn || 0),
    roughTerrainKeys: uniqueSorted(
      pathEvaluation.movementCost?.roughTerrainKeys || [],
    ),
    eventWord,
    eventWordKey: eventWord.eventWordKey,
    pathEvaluationHash: String(pathEvaluation.pathEvaluationHash || ""),
  });
  return { ...core, pathStateHash: stableGraphHash(core) };
}

function dominanceKey(pathState = {}) {
  return stableGraphHash(stableGraphValue({
    currentPoint: pathState.currentPoint,
    eventWordKey: pathState.eventWordKey,
    roughTerrainKeys: pathState.roughTerrainKeys || [],
  }));
}

function dominates(left = {}, right = {}) {
  return Number(left.rawDistanceIn) <= Number(right.rawDistanceIn) + 1e-9 &&
    Number(left.segmentCount) <= Number(right.segmentCount);
}

function addParetoState(checkpoint = {}, candidate = {}) {
  const key = dominanceKey(candidate);
  const existing = checkpoint.frontierStates.filter((state) =>
    dominanceKey(state) === key);
  if (existing.some((state) => dominates(state, candidate))) {
    checkpoint.stats.dominancePrunedCount += 1;
    return false;
  }
  const removedHashes = new Set(existing
    .filter((state) => dominates(candidate, state))
    .map((state) => state.pathStateHash));
  if (removedHashes.size) {
    checkpoint.frontierStates = checkpoint.frontierStates.filter((state) =>
      !removedHashes.has(state.pathStateHash));
    checkpoint.stats.dominanceRemovedCount += removedHashes.size;
  }
  checkpoint.frontierStates.push(candidate);
  checkpoint.queue.push(candidate.pathStateHash);
  return true;
}

function recordEventWord(checkpoint = {}, pathState = {}) {
  const existingIndex = checkpoint.eventWords.findIndex((word) =>
    word.eventWordKey === pathState.eventWordKey);
  const candidate = stableGraphValue({
    ...pathState.eventWord,
    strictExistenceWitnessPathEvaluationHash: pathState.pathEvaluationHash,
    strictExistenceWitnessPathNodeHash: pathState.pathNodeHash,
    witnessRawDistanceIn: pathState.rawDistanceIn,
    witnessSegmentCount: pathState.segmentCount,
  });
  if (existingIndex < 0) {
    checkpoint.eventWords.push(candidate);
    checkpoint.eventWords.sort((left, right) =>
      left.eventWordKey.localeCompare(right.eventWordKey));
    return;
  }
  const existing = checkpoint.eventWords[existingIndex];
  if (Number(candidate.witnessRawDistanceIn) <
        Number(existing.witnessRawDistanceIn) - 1e-9 ||
      (Math.abs(Number(candidate.witnessRawDistanceIn) -
        Number(existing.witnessRawDistanceIn)) <= 1e-9 &&
        Number(candidate.witnessSegmentCount) <
          Number(existing.witnessSegmentCount))) {
    checkpoint.eventWords[existingIndex] = candidate;
  }
}

function checkpointCore(checkpoint = {}) {
  const { checkpointHash, ...core } = checkpoint;
  return stableGraphValue(core);
}

function sealCheckpoint(checkpoint = {}) {
  const core = checkpointCore(checkpoint);
  return { ...core, checkpointHash: stableGraphHash(core) };
}

function checkpointValid(
  checkpoint = {},
  predicatePlan = {},
  automaton = {},
  validation = {},
) {
  return checkpoint.schemaVersion ===
      WARMACHINE_QUANTIZED_MOVEMENT_EVENT_WORD_CHECKPOINT_V1_SCHEMA &&
    receiptValid(checkpoint, "checkpointHash") &&
    String(checkpoint.predicatePlanReceiptHash || "") ===
      String(predicatePlan.predicatePlanReceiptHash || "") &&
    String(checkpoint.movementEventAutomatonReceiptHash || "") ===
      String(automaton.movementEventAutomatonReceiptHash || "") &&
    String(checkpoint.factoredUnitGroupId || "") ===
      String(validation.factoredUnitGroupId || "");
}

function initialCheckpoint(predicatePlan = {}, automaton = {}, validation = {}) {
  const bounds = scanBounds(validation);
  return sealCheckpoint({
    schemaVersion: WARMACHINE_QUANTIZED_MOVEMENT_EVENT_WORD_CHECKPOINT_V1_SCHEMA,
    predicatePlanReceiptHash: String(predicatePlan.predicatePlanReceiptHash || ""),
    movementEventAutomatonReceiptHash: String(
      automaton.movementEventAutomatonReceiptHash || "",
    ),
    factoredUnitGroupId: String(validation.factoredUnitGroupId || ""),
    phase: "scan_quantized_endpoint_domain",
    scanBounds: bounds,
    scanOffset: 0,
    endpointPoints: [],
    pathNodes: [],
    frontierStates: [],
    queue: [],
    activeExpansion: null,
    eventWords: [],
    stats: {
      endpointCandidatesScanned: 0,
      legalEndpointCount: 0,
      pathEdgesExamined: 0,
      strictPathEdgesAccepted: 0,
      optimisticDistancePrunedCount: 0,
      strictPathRejectedCount: 0,
      dominancePrunedCount: 0,
      dominanceRemovedCount: 0,
      expandedPathStateCount: 0,
    },
  });
}

function initializePathWorklist(
  checkpoint = {},
  inputState = {},
  predicatePlan = {},
) {
  const start = predicatePlan.actorPosition || checkpoint.scanBounds?.startPoint;
  const pathEvaluation = evaluateRulesV1MovementGeometryPath(inputState, {
    actorPieceKey: predicatePlan.actorPieceKey,
    actionType: predicatePlan.actionType,
    pathPoints: [start],
  });
  if (pathEvaluation.pathStrictPrecheckPassed !== true ||
      pathEvaluation.boundaryCrossingTraceExact !== true) {
    return "quantized_event_word_zero_path_not_strict";
  }
  const rootPathNodeHash = ensurePathNode(
    checkpoint,
    "",
    pathEvaluation.pathPoints[0],
    0,
  );
  const root = pathStateForEvaluation(pathEvaluation, rootPathNodeHash);
  checkpoint.frontierStates = [root];
  checkpoint.queue = [root.pathStateHash];
  checkpoint.phase = "expand_quantized_path_worklist";
  recordEventWord(checkpoint, root);
  return "";
}

function scanEndpointPage(
  checkpoint = {},
  inputState = {},
  predicatePlan = {},
  budget = 1,
) {
  const total = Number(checkpoint.scanBounds.candidatePointCount || 0);
  let consumed = 0;
  while (checkpoint.scanOffset < total && consumed < budget) {
    const point = pointAtScanOffset(checkpoint.scanBounds, checkpoint.scanOffset);
    checkpoint.scanOffset += 1;
    consumed += 1;
    checkpoint.stats.endpointCandidatesScanned += 1;
    const endpoint = evaluateRulesV1MovementGeometryEndpoint(inputState, {
      actorPieceKey: predicatePlan.actorPieceKey,
      actionType: predicatePlan.actionType,
      destination: point,
    });
    if (endpoint.ok === true && endpoint.endpointPredicateSatisfied === true) {
      checkpoint.endpointPoints.push(point);
      checkpoint.stats.legalEndpointCount += 1;
    }
  }
  checkpoint.endpointPoints.sort((left, right) =>
    Number(left.yIn) - Number(right.yIn) ||
    Number(left.xIn) - Number(right.xIn));
  return checkpoint.scanOffset >= total;
}

function stateStillPareto(checkpoint = {}, pathStateHash = "") {
  return checkpoint.frontierStates.some((state) =>
    state.pathStateHash === pathStateHash);
}

function expandPathEdge(
  checkpoint = {},
  inputState = {},
  predicatePlan = {},
  pathState = {},
  destination = {},
) {
  checkpoint.stats.pathEdgesExamined += 1;
  if (pointKey(pathState.currentPoint) === pointKey(destination)) return;
  const optimisticRawDistance = Number(pathState.rawDistanceIn) +
    pointDistance(pathState.currentPoint, destination);
  if (optimisticRawDistance > Number(predicatePlan.movementAllowanceIn) + EPSILON) {
    checkpoint.stats.optimisticDistancePrunedCount += 1;
    return;
  }
  const parentPathPoints = reconstructPathPoints(
    checkpoint,
    pathState.pathNodeHash,
  );
  const pathPoints = [...parentPathPoints, destination];
  const pathEvaluation = evaluateRulesV1MovementGeometryPath(inputState, {
    actorPieceKey: predicatePlan.actorPieceKey,
    actionType: predicatePlan.actionType,
    pathPoints,
  });
  if (pathEvaluation.pathStrictPrecheckPassed !== true ||
      pathEvaluation.boundaryCrossingTraceExact !== true) {
    checkpoint.stats.strictPathRejectedCount += 1;
    return;
  }
  const pathNodeHash = ensurePathNode(
    checkpoint,
    pathState.pathNodeHash,
    destination,
    pathPoints.length - 1,
  );
  const candidate = pathStateForEvaluation(pathEvaluation, pathNodeHash);
  if (candidate.segmentCount > Number(predicatePlan.maximumLegalPathSegmentCount)) {
    checkpoint.stats.strictPathRejectedCount += 1;
    return;
  }
  checkpoint.stats.strictPathEdgesAccepted += 1;
  recordEventWord(checkpoint, candidate);
  addParetoState(checkpoint, candidate);
}

function expandWorklistPage(
  checkpoint = {},
  inputState = {},
  predicatePlan = {},
  budget = 1,
) {
  let consumed = 0;
  while (consumed < budget) {
    if (!checkpoint.activeExpansion) {
      let pathStateHash = "";
      while (checkpoint.queue.length && !pathStateHash) {
        const candidateHash = checkpoint.queue.shift();
        if (stateStillPareto(checkpoint, candidateHash)) pathStateHash = candidateHash;
      }
      if (!pathStateHash) {
        checkpoint.phase = "complete";
        return true;
      }
      const pathState = checkpoint.frontierStates.find((state) =>
        state.pathStateHash === pathStateHash);
      if (Number(pathState.segmentCount) >=
          Number(predicatePlan.maximumLegalPathSegmentCount)) {
        checkpoint.stats.expandedPathStateCount += 1;
        continue;
      }
      checkpoint.activeExpansion = {
        pathStateHash,
        nextEndpointIndex: 0,
      };
    }
    const active = checkpoint.activeExpansion;
    const pathState = checkpoint.frontierStates.find((state) =>
      state.pathStateHash === active.pathStateHash);
    if (!pathState) {
      checkpoint.activeExpansion = null;
      continue;
    }
    if (active.nextEndpointIndex >= checkpoint.endpointPoints.length) {
      checkpoint.stats.expandedPathStateCount += 1;
      checkpoint.activeExpansion = null;
      continue;
    }
    const destination = checkpoint.endpointPoints[active.nextEndpointIndex];
    active.nextEndpointIndex += 1;
    consumed += 1;
    expandPathEdge(
      checkpoint,
      inputState,
      predicatePlan,
      pathState,
      destination,
    );
  }
  return false;
}

export function advanceWarmachineQuantizedMovementEventWordWorklistV1(
  inputState = {},
  predicatePlan = {},
  automaton = {},
  options = {},
) {
  const validation = validateInputs(predicatePlan, automaton, options);
  const checkpointIssue = options.checkpoint &&
      !checkpointValid(options.checkpoint, predicatePlan, automaton, validation)
    ? "quantized_event_word_checkpoint_invalid"
    : "";
  const issues = uniqueSorted([
    ...validation.issues,
    checkpointIssue,
  ]);
  let checkpoint = options.checkpoint
    ? structuredClone(options.checkpoint)
    : initialCheckpoint(predicatePlan, automaton, validation);
  delete checkpoint.checkpointHash;
  const endpointScanBudget = boundedInteger(options.endpointScanBudget, 1000);
  const pathEdgeBudget = boundedInteger(options.pathEdgeBudget, 1000);
  if (!issues.length && checkpoint.phase === "scan_quantized_endpoint_domain") {
    const scanComplete = scanEndpointPage(
      checkpoint,
      inputState,
      predicatePlan,
      endpointScanBudget,
    );
    if (scanComplete) {
      const initializationIssue = initializePathWorklist(
        checkpoint,
        inputState,
        predicatePlan,
      );
      if (initializationIssue) issues.push(initializationIssue);
    }
  }
  if (!issues.length && checkpoint.phase === "expand_quantized_path_worklist") {
    expandWorklistPage(
      checkpoint,
      inputState,
      predicatePlan,
      pathEdgeBudget,
    );
  }
  checkpoint = sealCheckpoint(checkpoint);
  const endpointScanComplete = checkpoint.scanOffset >=
    Number(checkpoint.scanBounds.candidatePointCount || 0);
  const pathWorklistComplete = checkpoint.phase === "complete";
  const complete = issues.length === 0 && endpointScanComplete &&
    pathWorklistComplete;
  const pendingEndpointCandidateCount = Math.max(
    0,
    Number(checkpoint.scanBounds.candidatePointCount || 0) -
      Number(checkpoint.scanOffset || 0),
  );
  const pendingPathStateCount = checkpoint.queue.length +
    (checkpoint.activeExpansion ? 1 : 0);
  const currentPendingEdgeCount = checkpoint.activeExpansion
    ? Math.max(0, checkpoint.endpointPoints.length -
      Number(checkpoint.activeExpansion.nextEndpointIndex || 0))
    : 0;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_QUANTIZED_MOVEMENT_EVENT_WORD_WORKLIST_V1_SCHEMA,
    ok: issues.length === 0,
    actorPieceKey: String(predicatePlan.actorPieceKey || ""),
    actionType: String(predicatePlan.actionType || ""),
    predicatePlanReceiptHash: String(predicatePlan.predicatePlanReceiptHash || ""),
    movementEventAutomatonReceiptHash: String(
      automaton.movementEventAutomatonReceiptHash || "",
    ),
    factoredUnitGroupId: validation.factoredUnitGroupId,
    selectedModelPathOnly: Boolean(validation.factoredUnitGroupId),
    jointParameterDomainComplete: false,
    checkpointHash: checkpoint.checkpointHash,
    phase: checkpoint.phase,
    endpointScanComplete,
    pathWorklistComplete,
    quantizedEndpointCandidateCount:
      Number(checkpoint.scanBounds.candidatePointCount || 0),
    legalQuantizedEndpointCount: checkpoint.endpointPoints.length,
    pendingEndpointCandidateCount,
    pendingPathStateCount,
    currentPendingEdgeCount,
    paretoPathStateCount: checkpoint.frontierStates.length,
    contentAddressedPathNodeCount: checkpoint.pathNodes.length,
    eventWords: checkpoint.eventWords,
    eventWordDenominatorCount: checkpoint.eventWords.length,
    stats: checkpoint.stats,
    exactFiniteEndpointDenominatorDeclared: validation.issues.length === 0,
    everyRetainedPathStateExpandsEveryLegalQuantizedEndpoint:
      complete,
    dominanceTheoremKey:
      "same_point_event_word_rough_set_lower_distance_and_segment_count_dominates_v1",
    dominanceScope:
      "static_geometry_and_declared_movement_cost_or_hazard_event_regions_only",
    pathStorageModel:
      "content_addressed_parent_point_prefix_dag_v1",
    allLegalQuantizedPathsCoveredByEventWordDenominator: complete,
    geometricEventWordLanguageComplete: complete,
    validationIssues: uniqueSorted(issues),
    completionDebts: uniqueSorted([
      ...issues,
      ...(!endpointScanComplete ? ["quantized_endpoint_scan_pending"] : []),
      ...(endpointScanComplete && !pathWorklistComplete
        ? ["quantized_path_worklist_pending"]
        : []),
      "event_reactions_and_external_hooks_not_closed",
      "event_effect_transition_stability_not_proven",
    ]),
    continuousChoiceKind: "player_choice_not_chance",
    chanceMassAssigned: false,
    resumeCheckpoint: checkpoint,
    claimBoundary:
      "This resumable worklist scans every cent-inch endpoint allowed by the source-bound Host predicate plan and, for each nondominated path prefix, asks the Host to evaluate a segment to every legal endpoint. Path prefixes use a content-addressed parent-plus-point DAG instead of copying full paths. Same-point states are pruned only when event word and encountered rough-region set match and another state uses no more raw distance or segments. When both ledgers are exhausted, the resulting finite event-word denominator covers every legal quantized waypoint path in this static geometric scope. A bound factored Unit group closes only the selected trooper path debt; simultaneous placement tuples remain a separate incomplete domain. Until all applicable ledgers are exhausted, no Unit or Q_rule completeness claim is made. Reactions, external hooks and effect transition stability remain outside this receipt.",
  });
  return {
    ...core,
    quantizedMovementEventWordWorklistReceiptHash: stableGraphHash(core),
  };
}
