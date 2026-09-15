import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { guardWarmachineActionWithTaskLocalRuleClosureV1 } from
  "../contracts/task-local-action-rule-guard-v1.mjs";
import { warmachineRuleBehaviorStateHashV1 } from
  "../state/semantic-hash-v1.mjs";
import {
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { buildWarmachineCurrentWindowAdversarialFrontierV1 } from
  "./current-window-adversarial-frontier-v1.mjs";
import {
  buildWarmachineCompleteActivationDomainPlanV2,
  enumerateNextWarmachineCompleteActivationDomainPageV2,
} from "./complete-activation-domain-v2.mjs";

export const WARMACHINE_TASK_LOCAL_BOUNDED_SEARCH_V1_SCHEMA =
  "warmachine_task_local_bounded_adversarial_search_v1";
export const WARMACHINE_TASK_LOCAL_BOUNDED_SEARCH_REPORT_V1_SCHEMA =
  "warmachine_task_local_bounded_adversarial_search_report_v1";

function binaryInterval(lowerBound = 0, upperBound = 1) {
  return stableGraphValue({
    lower: { numerator: String(lowerBound), denominator: "1" },
    upper: { numerator: String(upperBound), denominator: "1" },
    lowerBound,
    upperBound,
    exact: lowerBound === upperBound,
  });
}

function boundedPositiveInteger(value, fallback, reason) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(reason);
  return parsed;
}

function checkpointCore(checkpoint = {}) {
  const core = structuredClone(checkpoint);
  delete core.checkpointHash;
  return stableGraphValue(core);
}

function sealCheckpoint(checkpoint = {}) {
  const core = checkpointCore(checkpoint);
  return { ...core, checkpointHash: stableGraphHash(core) };
}

export function validateWarmachineTaskLocalBoundedSearchCheckpointV1(
  checkpoint = {},
  expected = {},
) {
  if (checkpoint.schemaVersion !== WARMACHINE_TASK_LOCAL_BOUNDED_SEARCH_V1_SCHEMA ||
      stableGraphHash(checkpointCore(checkpoint)) !== checkpoint.checkpointHash) {
    throw new Error("task_local_bounded_search_checkpoint_invalid");
  }
  for (const [field, value] of Object.entries(expected)) {
    if (value !== undefined && checkpoint[field] !== value) {
      throw new Error(`task_local_bounded_search_checkpoint_${field}_mismatch`);
    }
  }
  return checkpoint;
}

function nodeKey(stateId, depth, taskKey) {
  return `node:${stableGraphHash({ stateId, depth, taskKey })}`;
}

function createNode(stateRecord, stateHash, depth, taskKey, maximumDepth) {
  const horizonReached = depth >= maximumDepth;
  return stableGraphValue({
    nodeKey: nodeKey(stateRecord.id, depth, taskKey),
    stateId: stateRecord.id,
    stateHash,
    depth,
    status: horizonReached ? "horizon_unresolved" : "pending",
    decisionOwnerSideKey: "",
    quantifier: "",
    nextActionIndex: 0,
    nextSlotIndex: 0,
    activationDomainPlanHash: "",
    activationDomainSlotCount: null,
    activationDomainPageReceiptHashes: [],
    hostAcceptedActionCount: null,
    hostRejectedActionCount: null,
    pageExhausted: false,
    frontierPageReceiptHashes: [],
    edgeKeys: [],
    domainComplementReasons: horizonReached
      ? ["maximum_decision_depth_reached"]
      : [],
    valueInterval: binaryInterval(0, 1),
  });
}

function enqueue(queue, queued, key, front = false) {
  if (!key || queued.has(key)) return;
  if (front) queue.unshift(key);
  else queue.push(key);
  queued.add(key);
}

function collectDomainComplementReasons(frontier = {}) {
  const reasons = [];
  if (frontier.hostEnumerationScope?.hostActionSpaceNarrowed === true) {
    reasons.push("host_action_space_narrowed");
  }
  if (frontier.edges.some((edge) =>
    edge.actionDomainUnresolvedReasons?.includes(
      "continuous_parameter_domain_unresolved",
    ))) {
    reasons.push("continuous_parameter_domain_unresolved");
  }
  return [...new Set(reasons)].sort();
}

function collectPartitionComplementReasons(plan = {}, page = {}) {
  return [...new Set([
    ...(plan.actionFamilyScopeMode === "full_phase_global"
      ? []
      : ["partition_full_host_action_key_parity_unproven"]),
    ...page.slotReceipts.flatMap((slot) =>
      slot.continuousDomainDebts.map((debt) => String(debt.reason || ""))),
    ...(page.invalidSlotReceiptCount > 0
      ? ["activation_slot_scope_contract_invalid"]
      : []),
  ].filter(Boolean))].sort();
}

function enumerateNodePartition(state, node) {
  const plan = buildWarmachineCompleteActivationDomainPlanV2(state);
  if (node.activationDomainPlanHash &&
      node.activationDomainPlanHash !== plan.activationDomainPlanHash) {
    throw new Error("task_local_bounded_search_activation_plan_drift");
  }
  const nextSlot = plan.slots[node.nextSlotIndex];
  if (!nextSlot) {
    throw new Error("task_local_bounded_search_activation_slot_missing");
  }
  let pageLimit = 1;
  while (node.nextSlotIndex + pageLimit < plan.slotCount &&
      plan.slots[node.nextSlotIndex + pageLimit].groupIndex ===
        nextSlot.groupIndex) {
    pageLimit += 1;
  }
  const enumerations = new Map();
  const page = enumerateNextWarmachineCompleteActivationDomainPageV2(
    state,
    {
      activationDomainPlanHash: plan.activationDomainPlanHash,
      nextSlotIndex: node.nextSlotIndex,
    },
    {
      pageLimit,
      onRuntimeGroupEnumeration({ groupIndex, enumeration }) {
        enumerations.set(groupIndex, enumeration);
      },
    },
  );
  if (enumerations.size !== 1 || !enumerations.has(nextSlot.groupIndex)) {
    throw new Error("task_local_bounded_search_partition_enumeration_missing");
  }
  return {
    plan,
    page,
    enumeration: enumerations.get(nextSlot.groupIndex),
  };
}

function validatePartitionEnumeration(page = {}, enumeration = {}) {
  const acceptedActionCount = page.slotReceipts.reduce((sum, slot) =>
    sum + Number(slot.acceptedActionCount || 0), 0);
  const rejectedActionCount = page.slotReceipts.reduce((sum, slot) =>
    sum + Number(slot.rejectedActionCount || 0), 0);
  if (page.invalidSlotReceiptCount > 0 ||
      acceptedActionCount !== Number(enumeration.actionCount || 0) ||
      rejectedActionCount !== Number(enumeration.rejectedActionCount || 0)) {
    throw new Error("task_local_bounded_search_partition_denominator_invalid");
  }
  return { acceptedActionCount, rejectedActionCount };
}

function edgeValue(edge, nodeByKey) {
  if (edge.childNodeKey) {
    return nodeByKey.get(edge.childNodeKey)?.valueInterval || binaryInterval(0, 1);
  }
  return edge.valueInterval || binaryInterval(0, 1);
}

function combineNodeValue(node, edges, nodeByKey) {
  if (node.status === "horizon_unresolved") return binaryInterval(0, 1);
  const intervals = edges.map((edge) => edgeValue(edge, nodeByKey));
  const complementOpen = node.status !== "expanded" ||
    node.domainComplementReasons.length > 0 || intervals.length === 0;
  if (complementOpen) intervals.push(binaryInterval(0, 1));
  if (!intervals.length || !["owner_max", "opponent_and_min"].includes(
    node.quantifier,
  )) return binaryInterval(0, 1);
  if (node.quantifier === "owner_max") {
    return binaryInterval(
      Math.max(...intervals.map((interval) => interval.lowerBound)),
      Math.max(...intervals.map((interval) => interval.upperBound)),
    );
  }
  return binaryInterval(
    Math.min(...intervals.map((interval) => interval.lowerBound)),
    Math.min(...intervals.map((interval) => interval.upperBound)),
  );
}

function recomputeValues(checkpoint) {
  const nodeByKey = new Map(checkpoint.nodes.map((node) => [node.nodeKey, node]));
  const edgeByKey = new Map(checkpoint.edges.map((edge) => [edge.edgeKey, edge]));
  const ordered = [...checkpoint.nodes].sort((left, right) =>
    right.depth - left.depth || left.nodeKey.localeCompare(right.nodeKey));
  for (const node of ordered) {
    const edges = node.edgeKeys.map((key) => edgeByKey.get(key)).filter(Boolean);
    for (const edge of edges) edge.currentValueInterval = edgeValue(edge, nodeByKey);
    node.valueInterval = combineNodeValue(node, edges, nodeByKey);
  }
}

function refreshCheckpointDerivedFields(checkpoint, nodeByKey) {
  recomputeValues(checkpoint);
  const root = nodeByKey.get(checkpoint.rootNodeKey);
  checkpoint.counts.fullyExpandedNodeCount = checkpoint.nodes.filter((node) =>
    node.status === "expanded").length;
  checkpoint.counts.horizonNodeCount = checkpoint.nodes.filter((node) =>
    node.status === "horizon_unresolved").length;
  checkpoint.searchFinished = checkpoint.queue.length === 0;
  checkpoint.rootValueInterval = root?.valueInterval || binaryInterval(0, 1);
  checkpoint.exactValueComplete = checkpoint.searchFinished &&
    checkpoint.rootValueInterval.exact &&
    checkpoint.counts.strictTransitionFailureCount === 0;
}

function terminalValue(edge, querySideKey) {
  if (!edge.terminalEventsTrusted || !edge.terminalEvents.length) return null;
  return edge.terminalEvents.some((event) =>
    event.winnerSideKey === querySideKey)
    ? binaryInterval(1, 1)
    : binaryInterval(0, 0);
}

export function initializeWarmachineTaskLocalBoundedSearchV1(
  initialState = {},
  taskLocalRuleClosure = {},
  store,
  rawOptions = {},
) {
  if (!store || typeof store.putState !== "function") {
    throw new Error("task_local_bounded_search_store_required");
  }
  if (taskLocalRuleClosure.readiness?.boundedSearchLaunchReady !== true ||
      taskLocalRuleClosure.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
    throw new Error("task_local_bounded_search_rule_closure_not_current");
  }
  guardWarmachineActionWithTaskLocalRuleClosureV1({}, taskLocalRuleClosure);
  const taskKey = String(rawOptions.taskKey || taskLocalRuleClosure.taskKey || "");
  const querySideKey = String(rawOptions.querySideKey || "");
  if (!taskKey || taskKey !== taskLocalRuleClosure.taskKey || !querySideKey) {
    throw new Error("task_local_bounded_search_task_contract_invalid");
  }
  const maximumDecisionDepth = boundedPositiveInteger(
    rawOptions.maximumDecisionDepth,
    4,
    "task_local_bounded_search_maximum_depth_invalid",
  );
  const actionPageLimit = boundedPositiveInteger(
    rawOptions.actionPageLimit,
    8,
    "task_local_bounded_search_action_page_limit_invalid",
  );
  const state = normalizeRulesV1State(initialState);
  const rootStateRecord = store.putState(state);
  const rootNode = createNode(
    rootStateRecord,
    warmachineRuleBehaviorStateHashV1(state),
    0,
    taskKey,
    maximumDecisionDepth,
  );
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_TASK_LOCAL_BOUNDED_SEARCH_V1_SCHEMA,
    taskKey,
    querySideKey,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    taskLocalRuleClosureHash: taskLocalRuleClosure.taskLocalRuleClosureHash,
    sourceHash: String(rawOptions.sourceHash || ""),
    configHash: String(rawOptions.configHash || ""),
    maximumDecisionDepth,
    actionPageLimit,
    rootNodeKey: rootNode.nodeKey,
    nodes: [rootNode],
    edges: [],
    queue: [rootNode.nodeKey],
    counts: {
      completedWorkUnitCount: 0,
      fullyExpandedNodeCount: 0,
      horizonNodeCount: 0,
      strictTransitionFailureCount: 0,
    },
    searchFinished: false,
    exactValueComplete: false,
    rootValueInterval: binaryInterval(0, 1),
  });
  return sealCheckpoint(core);
}

export function advanceWarmachineTaskLocalBoundedSearchV1(
  priorCheckpoint = {},
  taskLocalRuleClosure = {},
  store,
  rawOptions = {},
) {
  validateWarmachineTaskLocalBoundedSearchCheckpointV1(priorCheckpoint, {
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    taskLocalRuleClosureHash: taskLocalRuleClosure.taskLocalRuleClosureHash,
    taskKey: taskLocalRuleClosure.taskKey,
  });
  guardWarmachineActionWithTaskLocalRuleClosureV1({}, taskLocalRuleClosure);
  const workUnitBudget = boundedPositiveInteger(
    rawOptions.workUnitBudget,
    1,
    "task_local_bounded_search_work_unit_budget_invalid",
  );
  const checkpoint = checkpointCore(priorCheckpoint);
  const nodeByKey = new Map(checkpoint.nodes.map((node) => [node.nodeKey, node]));
  const edgeKeys = new Set(checkpoint.edges.map((edge) => edge.edgeKey));
  const stateDepthNodeKeys = new Map(checkpoint.nodes.map((node) => [
    `${node.stateId}:${node.depth}`,
    node.nodeKey,
  ]));
  const queued = new Set(checkpoint.queue);
  let completed = 0;
  let derivedFieldsCurrent = false;
  while (checkpoint.queue.length && completed < workUnitBudget) {
    const currentNodeKey = checkpoint.queue.shift();
    queued.delete(currentNodeKey);
    const node = nodeByKey.get(currentNodeKey);
    if (!node || node.status === "expanded" ||
        node.status === "horizon_unresolved") continue;
    const stateRecord = store.readState(node.stateId);
    if (warmachineRuleBehaviorStateHashV1(stateRecord.value) !== node.stateHash) {
      throw new Error("task_local_bounded_search_state_hash_mismatch");
    }
    const { plan, page, enumeration } = enumerateNodePartition(
      stateRecord.value,
      node,
    );
    const partitionCounts = validatePartitionEnumeration(page, enumeration);
    if (node.activationDomainPageReceiptHashes.includes(page.pageReceiptHash)) {
      throw new Error("task_local_bounded_search_duplicate_activation_page");
    }
    node.activationDomainPlanHash = plan.activationDomainPlanHash;
    node.activationDomainSlotCount = plan.slotCount;
    node.activationDomainPageReceiptHashes.push(page.pageReceiptHash);
    node.nextSlotIndex = page.cursor.nextSlotIndex;
    node.nextActionIndex = 0;
    node.pageExhausted = page.exhausted;
    node.hostAcceptedActionCount = Number(node.hostAcceptedActionCount || 0) +
      partitionCounts.acceptedActionCount;
    node.hostRejectedActionCount = Number(node.hostRejectedActionCount || 0) +
      partitionCounts.rejectedActionCount;
    node.domainComplementReasons = [...new Set([
      ...node.domainComplementReasons,
      ...collectPartitionComplementReasons(plan, page),
    ])].sort();
    const childNodeKeys = [];
    let partitionEdgeCount = 0;
    let partitionTransitionFailureCount = 0;
    let nextActionIndex = 0;
    let actionPageExhausted = false;
    while (!actionPageExhausted) {
      const frontier = buildWarmachineCurrentWindowAdversarialFrontierV1(
        enumeration.state,
        enumeration,
        {
          enumeratedInputStateReference: enumeration.state,
          taskKey: checkpoint.taskKey,
          querySideKey: checkpoint.querySideKey,
          taskLocalRuleClosure,
          startIndex: nextActionIndex,
          limit: checkpoint.actionPageLimit,
          materializeSuccessorWindow: false,
          successorEnumerationScopeKind: "full_host_window",
          persistState(state, context = {}) {
            return store.putState(state, {
              parentStateId: context.parentStateId || node.stateId,
            });
          },
          onProgress: rawOptions.onProgress,
        },
      );
      if (node.frontierPageReceiptHashes.includes(
        frontier.adversarialFrontierReceiptHash,
      )) {
        throw new Error("task_local_bounded_search_duplicate_frontier_page");
      }
      if ((node.decisionOwnerSideKey &&
          node.decisionOwnerSideKey !== frontier.decisionOwnerSideKey) ||
          (node.quantifier && node.quantifier !== frontier.quantifier)) {
        throw new Error("task_local_bounded_search_partition_owner_drift");
      }
      node.decisionOwnerSideKey = frontier.decisionOwnerSideKey;
      node.quantifier = frontier.quantifier;
      node.frontierPageReceiptHashes.push(
        frontier.adversarialFrontierReceiptHash,
      );
      node.domainComplementReasons = [...new Set([
        ...node.domainComplementReasons,
        ...collectDomainComplementReasons(frontier),
      ])].sort();
      for (const frontierEdge of frontier.edges) {
        const key = `edge:${stableGraphHash({
          parentNodeKey: node.nodeKey,
          frontierEdgeReceiptHash: frontierEdge.edgeReceiptHash,
        })}`;
        if (edgeKeys.has(key)) {
          throw new Error("task_local_bounded_search_duplicate_edge");
        }
        let childNodeKey = "";
        const resolvedTerminalValue = terminalValue(
          frontierEdge,
          checkpoint.querySideKey,
        );
        if (frontierEdge.transitionAccepted &&
            frontierEdge.branchTransitionComplete &&
            !resolvedTerminalValue &&
            frontierEdge.successorStoredState?.stateId) {
          const childDepth = node.depth + 1;
          const stateDepthKey =
            `${frontierEdge.successorStoredState.stateId}:${childDepth}`;
          childNodeKey = stateDepthNodeKeys.get(stateDepthKey) || "";
          if (!childNodeKey) {
            const child = createNode(
              { id: frontierEdge.successorStoredState.stateId },
              frontierEdge.successorStateHash,
              childDepth,
              checkpoint.taskKey,
              checkpoint.maximumDecisionDepth,
            );
            childNodeKey = child.nodeKey;
            checkpoint.nodes.push(child);
            nodeByKey.set(child.nodeKey, child);
            stateDepthNodeKeys.set(stateDepthKey, child.nodeKey);
            if (child.status === "pending") childNodeKeys.push(child.nodeKey);
          }
        }
        const edge = stableGraphValue({
          edgeKey: key,
          parentNodeKey: node.nodeKey,
          childNodeKey,
          depth: node.depth,
          actionKey: frontierEdge.actionKey,
          actionType: frontierEdge.actionType,
          actorPieceKey: frontierEdge.actorPieceKey,
          targetPieceKey: frontierEdge.targetPieceKey,
          edgeReceiptHash: frontierEdge.edgeReceiptHash,
          hostTransitionAccepted: frontierEdge.hostTransitionAccepted,
          transitionAccepted: frontierEdge.transitionAccepted,
          transitionReason: frontierEdge.transitionReason,
          branchTransitionComplete: frontierEdge.branchTransitionComplete,
          dependencyGuardRejected: frontierEdge.dependencyGuardRejected,
          taskLocalRuleGuard: frontierEdge.taskLocalRuleGuard,
          actionFootprint: frontierEdge.actionFootprint,
          actionDomainUnresolvedReasons:
            frontierEdge.actionDomainUnresolvedReasons,
          terminalEvents: frontierEdge.terminalEvents,
          terminalEventsTrusted: frontierEdge.terminalEventsTrusted,
          valueInterval: resolvedTerminalValue || binaryInterval(0, 1),
          currentValueInterval: resolvedTerminalValue || binaryInterval(0, 1),
        });
        checkpoint.edges.push(edge);
        edgeKeys.add(key);
        node.edgeKeys.push(key);
        partitionEdgeCount += 1;
      }
      partitionTransitionFailureCount += frontier.transitionFailureCount;
      nextActionIndex = frontier.page.endIndexExclusive;
      actionPageExhausted = frontier.page.pageExhausted;
    }
    if (partitionTransitionFailureCount > 0) {
      checkpoint.counts.strictTransitionFailureCount +=
        partitionTransitionFailureCount;
    }
    node.status = page.exhausted ? "expanded" : "partial";
    if (node.status === "partial") {
      enqueue(checkpoint.queue, queued, node.nodeKey, true);
    }
    for (const childNodeKey of childNodeKeys) {
      enqueue(checkpoint.queue, queued, childNodeKey);
    }
    completed += 1;
    checkpoint.counts.completedWorkUnitCount += 1;
    derivedFieldsCurrent = false;
    const progress = {
      nodeKey: node.nodeKey,
      depth: node.depth,
      status: node.status,
      activationGroupIndex: page.slotReceipts[0]?.groupIndex ?? null,
      completedSlotCount: page.pageSlotCount,
      nextSlotIndex: node.nextSlotIndex,
      totalSlotCount: node.activationDomainSlotCount,
      acceptedActionCount: partitionCounts.acceptedActionCount,
      pageEdgeCount: partitionEdgeCount,
      remainingSlotCount: page.remainingSlotCount,
      queueLength: checkpoint.queue.length,
    };
    rawOptions.onWorkUnitComplete?.(progress);
    if (typeof rawOptions.onCheckpoint === "function") {
      refreshCheckpointDerivedFields(checkpoint, nodeByKey);
      derivedFieldsCurrent = true;
      rawOptions.onCheckpoint(sealCheckpoint(checkpoint), progress);
    }
  }
  if (!derivedFieldsCurrent) refreshCheckpointDerivedFields(checkpoint, nodeByKey);
  return sealCheckpoint(checkpoint);
}

export function buildWarmachineTaskLocalBoundedSearchReportV1(
  checkpoint = {},
) {
  validateWarmachineTaskLocalBoundedSearchCheckpointV1(checkpoint);
  const nodeByKey = new Map(checkpoint.nodes.map((node) => [node.nodeKey, node]));
  const root = nodeByKey.get(checkpoint.rootNodeKey);
  const rootEdges = checkpoint.edges.filter((edge) =>
    edge.parentNodeKey === checkpoint.rootNodeKey).sort((left, right) =>
    right.currentValueInterval.lowerBound - left.currentValueInterval.lowerBound ||
    right.currentValueInterval.upperBound - left.currentValueInterval.upperBound ||
    left.actionKey.localeCompare(right.actionKey));
  const unresolvedCounts = {
    ruleDependencyEdgeCount: checkpoint.edges.filter((edge) =>
      edge.dependencyGuardRejected).length,
    chanceEdgeCount: checkpoint.edges.filter((edge) =>
      edge.actionFootprint?.chance?.required === true).length,
    immediateResponseEdgeCount: checkpoint.edges.filter((edge) =>
      edge.actionDomainUnresolvedReasons?.includes(
        "opponent_response_domain_unresolved",
      )).length,
    footprintEdgeCount: checkpoint.edges.filter((edge) =>
      edge.actionFootprint?.conservativeComplete !== true).length,
    continuousNodeCount: checkpoint.nodes.filter((node) =>
      node.domainComplementReasons.includes(
        "continuous_parameter_domain_unresolved",
      )).length,
    partialNodeCount: checkpoint.nodes.filter((node) =>
      ["pending", "partial"].includes(node.status)).length,
    horizonNodeCount: checkpoint.counts.horizonNodeCount,
  };
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_TASK_LOCAL_BOUNDED_SEARCH_REPORT_V1_SCHEMA,
    taskKey: checkpoint.taskKey,
    querySideKey: checkpoint.querySideKey,
    hostReceiptHash: checkpoint.hostReceiptHash,
    taskLocalRuleClosureHash: checkpoint.taskLocalRuleClosureHash,
    sourceHash: checkpoint.sourceHash,
    configHash: checkpoint.configHash,
    checkpointHash: checkpoint.checkpointHash,
    maximumDecisionDepth: checkpoint.maximumDecisionDepth,
    actionPageLimit: checkpoint.actionPageLimit,
    rootValueInterval: checkpoint.rootValueInterval,
    searchFinished: checkpoint.searchFinished,
    exactValueComplete: checkpoint.exactValueComplete,
    validConservativeInterval:
      checkpoint.counts.strictTransitionFailureCount === 0,
    counts: {
      ...checkpoint.counts,
      nodeCount: checkpoint.nodes.length,
      edgeCount: checkpoint.edges.length,
      queuedNodeCount: checkpoint.queue.length,
      rootAcceptedActionCount: root?.hostAcceptedActionCount,
      rootExploredActionCount: root?.edgeKeys.length || 0,
      rootCompletedSlotCount: root?.nextSlotIndex || 0,
      rootActivationDomainSlotCount: root?.activationDomainSlotCount,
    },
    unresolvedCounts,
    rootActionRows: rootEdges.map((edge) => ({
      actionKey: edge.actionKey,
      actionType: edge.actionType,
      actorPieceKey: edge.actorPieceKey,
      targetPieceKey: edge.targetPieceKey,
      valueInterval: edge.currentValueInterval,
      childNodeKey: edge.childNodeKey,
      branchTransitionComplete: edge.branchTransitionComplete,
      terminalEventsTrusted: edge.terminalEventsTrusted,
      unresolvedReasons: [...new Set([
        ...edge.actionDomainUnresolvedReasons,
        ...(edge.dependencyGuardRejected
          ? ["task_local_rule_dependency_unresolved"]
          : []),
        ...(edge.actionFootprint?.chance?.required
          ? ["chance_domain_unexpanded"]
          : []),
        ...(edge.actionFootprint?.conservativeComplete !== true
          ? ["action_footprint_unresolved"]
          : []),
      ])].sort(),
    })),
    claimBoundary:
      "This is a receipt-bound, checkpointed partial-game interval search over current Host decision windows. Max/min values include every materialized action and preserve unexpanded pages, continuous parameters, Chance, responses, rule debt and the depth horizon as [0,1]. It can rank separated reliable intervals but cannot claim a whole-game exact value or global optimum while those debts remain.",
  });
  return { ...core, reportHash: stableGraphHash(core) };
}
