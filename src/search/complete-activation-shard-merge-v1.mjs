import { stableGraphHash, stableGraphValue } from
  "../graph/typed-facts-v2.mjs";
import {
  validateWarmachineCompleteActivationExactGraphCheckpointV1,
} from "./complete-activation-exact-graph-v1.mjs";

export const WARMACHINE_COMPLETE_ACTIVATION_SHARD_MERGE_V1_SCHEMA =
  "warmachine_complete_activation_shard_merge_v1";

function checkpointCore(checkpoint = {}) {
  const core = stableGraphValue(structuredClone(checkpoint));
  delete core.checkpointHash;
  return core;
}

function sealCheckpoint(checkpoint = {}) {
  const core = checkpointCore(checkpoint);
  return { ...core, checkpointHash: stableGraphHash(core) };
}

function uniqueInOrder(values = []) {
  return [...new Set(values.map(String).filter(Boolean))];
}

function requirePendingChanceWork(baseCheckpoint, selectedWorkKeys = []) {
  const requested = uniqueInOrder(selectedWorkKeys);
  if (!requested.length) throw new Error("complete_activation_shard_work_empty");
  const queue = new Set(baseCheckpoint.workQueue || []);
  const workByKey = new Map((baseCheckpoint.workItems || []).map((work) => [
    work.workKey,
    work,
  ]));
  for (const workKey of requested) {
    const work = workByKey.get(workKey);
    if (!queue.has(workKey) || work?.status !== "pending" ||
        work?.workKind !== "chance_response") {
      throw new Error(`complete_activation_shard_work_not_pending_chance:${workKey}`);
    }
  }
  return requested;
}

export function buildWarmachineCompleteActivationShardCheckpointV1(
  baseCheckpoint = {},
  selectedWorkKeys = [],
) {
  validateWarmachineCompleteActivationExactGraphCheckpointV1(baseCheckpoint);
  const selected = requirePendingChanceWork(baseCheckpoint, selectedWorkKeys);
  const selectedSet = new Set(selected);
  const checkpoint = checkpointCore(baseCheckpoint);
  checkpoint.workQueue = [
    ...selected,
    ...checkpoint.workQueue.filter((workKey) => !selectedSet.has(workKey)),
  ];
  checkpoint.shardExecution = stableGraphValue({
    schemaVersion: "warmachine_complete_activation_shard_execution_v1",
    baseCheckpointHash: baseCheckpoint.checkpointHash,
    selectedWorkKeys: selected,
    selectedWorkSetHash: stableGraphHash([...selected].sort()),
  });
  return sealCheckpoint(checkpoint);
}

function mergeNode(target, source) {
  for (const field of ["stateId", "stateHash", "depth"]) {
    if (target[field] !== source[field]) {
      throw new Error(`complete_activation_shard_node_conflict:${target.nodeKey}:${field}`);
    }
  }
  target.edgeKeys = uniqueInOrder([...(target.edgeKeys || []), ...(source.edgeKeys || [])]);
  target.actionBranchKeys = uniqueInOrder([
    ...(target.actionBranchKeys || []),
    ...(source.actionBranchKeys || []),
  ]);
  target.witnessActionKeys = uniqueInOrder([
    ...(target.witnessActionKeys || []),
    ...(source.witnessActionKeys || []),
  ]);
}

function refreshMergedCheckpoint(checkpoint, completedWorkUnitCount) {
  const workByBranch = new Map();
  for (const work of checkpoint.workItems || []) {
    if (!workByBranch.has(work.actionBranchKey)) workByBranch.set(work.actionBranchKey, []);
    workByBranch.get(work.actionBranchKey).push(work);
  }
  const edgeKeysByBranch = new Map();
  for (const edge of checkpoint.edges || []) {
    if (!edgeKeysByBranch.has(edge.actionBranchKey)) {
      edgeKeysByBranch.set(edge.actionBranchKey, []);
    }
    edgeKeysByBranch.get(edge.actionBranchKey).push(edge.edgeKey);
  }
  for (const branch of checkpoint.actionBranches || []) {
    branch.edgeKeys = uniqueInOrder(edgeKeysByBranch.get(branch.actionBranchKey) || []);
    const chanceWorks = (workByBranch.get(branch.actionBranchKey) || [])
      .filter((work) => work.workKind === "chance_response");
    if (!chanceWorks.length) continue;
    branch.completedWorkCount = chanceWorks.filter((work) =>
      work.status !== "pending").length;
    if (branch.status === "unresolved" ||
        chanceWorks.some((work) => work.status === "unresolved")) {
      branch.status = "unresolved";
    } else if (branch.completedWorkCount >= branch.totalWorkCount) {
      branch.status = "complete";
    } else {
      branch.status = "waiting_chance_response_work";
    }
  }
  const branchByKey = new Map((checkpoint.actionBranches || []).map((branch) => [
    branch.actionBranchKey,
    branch,
  ]));
  for (const node of checkpoint.nodes || []) {
    if (node.status === "activation_boundary" || node.status === "pending") continue;
    const branches = (node.actionBranchKeys || []).map((key) => branchByKey.get(key))
      .filter(Boolean);
    node.status = branches.length && branches.every((branch) =>
      ["complete", "unresolved"].includes(branch.status))
      ? "expanded"
      : "waiting_chance_response_work";
  }
  const nodeByKey = new Map((checkpoint.nodes || []).map((node) => [node.nodeKey, node]));
  checkpoint.nodeQueue = uniqueInOrder(checkpoint.nodeQueue || [])
    .filter((nodeKey) => nodeByKey.get(nodeKey)?.status === "pending");
  checkpoint.workQueue = (checkpoint.workQueue || []).filter((workKey) =>
    (checkpoint.workItems || []).find((work) => work.workKey === workKey)?.status ===
      "pending");
  const counts = checkpoint.counts || {};
  counts.completedWorkUnitCount = completedWorkUnitCount;
  counts.nodeCount = checkpoint.nodes.length;
  counts.edgeCount = checkpoint.edges.length;
  counts.actionBranchCount = checkpoint.actionBranches.length;
  counts.completedActionBranchCount = checkpoint.actionBranches.filter((branch) =>
    branch.status === "complete").length;
  counts.unresolvedActionBranchCount = checkpoint.actionBranches.filter((branch) =>
    branch.status === "unresolved").length;
  counts.totalActionExpansionWorkCount = checkpoint.workItems.filter((work) =>
    work.workKind === "action").length;
  counts.completedActionExpansionWorkCount = checkpoint.workItems.filter((work) =>
    work.workKind === "action" && work.status !== "pending").length;
  counts.pendingActionExpansionWorkCount = checkpoint.workItems.filter((work) =>
    work.workKind === "action" && work.status === "pending").length;
  counts.totalChanceResponseWorkCount = checkpoint.workItems.filter((work) =>
    work.workKind === "chance_response").length;
  counts.completedChanceResponseWorkCount = checkpoint.workItems.filter((work) =>
    work.workKind === "chance_response" && work.status !== "pending").length;
  counts.pendingChanceResponseWorkCount = checkpoint.workItems.filter((work) =>
    work.workKind === "chance_response" && work.status === "pending").length;
  counts.unavailableChanceResponseWorkCount = checkpoint.workItems.filter((work) =>
    work.workKind === "chance_response" && work.status === "unavailable").length;
  counts.exactChanceOutcomeEdgeCount = checkpoint.edges.filter((edge) =>
    edge.stepType === "chance").length;
  counts.expandedNodeCount = checkpoint.nodes.filter((node) =>
    node.status === "expanded").length;
  counts.activationBoundaryNodeCount = checkpoint.nodes.filter((node) =>
    node.status === "activation_boundary").length;
  counts.pendingNodeCount = checkpoint.nodeQueue.length;
  counts.unresolvedRowCount = checkpoint.unresolvedRows.length;
  checkpoint.counts = counts;
  checkpoint.searchFinished = checkpoint.nodeQueue.length === 0 &&
    checkpoint.workQueue.length === 0;
  checkpoint.currentHostFiniteActivationGraphComplete = checkpoint.searchFinished &&
    checkpoint.unresolvedRows.length === 0 &&
    checkpoint.nodes.every((node) =>
      ["expanded", "activation_boundary"].includes(node.status));
}

export function mergeWarmachineCompleteActivationShardCheckpointsV1(
  baseCheckpoint = {},
  shardResults = [],
  rawAudit = {},
) {
  validateWarmachineCompleteActivationExactGraphCheckpointV1(baseCheckpoint);
  if (!shardResults.length) throw new Error("complete_activation_shard_results_empty");
  const expected = {
    hostReceiptHash: baseCheckpoint.hostReceiptHash,
    taskLocalRuleClosureHash: baseCheckpoint.taskLocalRuleClosureHash,
    taskKey: baseCheckpoint.taskKey,
    sourceHash: baseCheckpoint.sourceHash,
    configHash: baseCheckpoint.configHash,
  };
  const completedKeys = new Set();
  const baseQueue = new Set(baseCheckpoint.workQueue || []);
  const merged = checkpointCore(baseCheckpoint);
  const workByKey = new Map(merged.workItems.map((work) => [work.workKey, work]));
  const nodeByKey = new Map(merged.nodes.map((node) => [node.nodeKey, node]));
  const branchByKey = new Map(merged.actionBranches.map((branch) => [
    branch.actionBranchKey,
    branch,
  ]));
  const edgeByKey = new Map(merged.edges.map((edge) => [edge.edgeKey, edge]));
  const unresolvedByIdentity = new Map(merged.unresolvedRows.map((row) => [
    row.identity,
    row,
  ]));
  let strictTransitionFailureCount = Number(baseCheckpoint.counts?.strictTransitionFailureCount || 0);
  for (const result of shardResults) {
    const shard = result.checkpoint || result;
    validateWarmachineCompleteActivationExactGraphCheckpointV1(shard, expected);
    if (shard.shardExecution?.baseCheckpointHash !== baseCheckpoint.checkpointHash) {
      throw new Error("complete_activation_shard_base_checkpoint_mismatch");
    }
    const selected = requirePendingChanceWork(
      baseCheckpoint,
      result.selectedWorkKeys || shard.shardExecution.selectedWorkKeys,
    );
    const shardWorkByKey = new Map(shard.workItems.map((work) => [work.workKey, work]));
    for (const workKey of selected) {
      if (completedKeys.has(workKey)) {
        throw new Error(`complete_activation_shard_overlap:${workKey}`);
      }
      const completed = shardWorkByKey.get(workKey);
      if (!completed || completed.status === "pending" ||
          (shard.workQueue || []).includes(workKey)) {
        throw new Error(`complete_activation_shard_work_not_completed:${workKey}`);
      }
      completedKeys.add(workKey);
      workByKey.set(workKey, completed);
    }
    const expectedRemaining = [...baseQueue].filter((key) => !selected.includes(key));
    const shardRemaining = new Set(shard.workQueue || []);
    if (expectedRemaining.some((key) => !shardRemaining.has(key))) {
      throw new Error("complete_activation_shard_consumed_unassigned_work");
    }
    for (const node of shard.nodes || []) {
      const existing = nodeByKey.get(node.nodeKey);
      if (existing) mergeNode(existing, node);
      else {
        const copy = structuredClone(node);
        merged.nodes.push(copy);
        nodeByKey.set(copy.nodeKey, copy);
      }
    }
    for (const branch of shard.actionBranches || []) {
      const existing = branchByKey.get(branch.actionBranchKey);
      if (!existing) throw new Error("complete_activation_shard_branch_not_in_base");
      existing.edgeKeys = uniqueInOrder([
        ...(existing.edgeKeys || []),
        ...(branch.edgeKeys || []),
      ]);
    }
    for (const edge of shard.edges || []) {
      const existing = edgeByKey.get(edge.edgeKey);
      if (existing && stableGraphHash(existing) !== stableGraphHash(edge)) {
        throw new Error(`complete_activation_shard_edge_conflict:${edge.edgeKey}`);
      }
      if (!existing) {
        const copy = structuredClone(edge);
        merged.edges.push(copy);
        edgeByKey.set(copy.edgeKey, copy);
      }
    }
    for (const [stateId, nodeKey] of Object.entries(shard.stateIdToNodeKey || {})) {
      if (merged.stateIdToNodeKey[stateId] &&
          merged.stateIdToNodeKey[stateId] !== nodeKey) {
        throw new Error(`complete_activation_shard_state_node_conflict:${stateId}`);
      }
      merged.stateIdToNodeKey[stateId] = nodeKey;
    }
    merged.nodeQueue = uniqueInOrder([
      ...(merged.nodeQueue || []),
      ...(shard.nodeQueue || []),
    ]);
    for (const row of shard.unresolvedRows || []) {
      unresolvedByIdentity.set(row.identity, row);
    }
    strictTransitionFailureCount += Math.max(0,
      Number(shard.counts?.strictTransitionFailureCount || 0) -
        Number(baseCheckpoint.counts?.strictTransitionFailureCount || 0));
  }
  merged.workItems = [...workByKey.values()];
  merged.workQueue = merged.workQueue.filter((workKey) => !completedKeys.has(workKey));
  merged.unresolvedRows = [...unresolvedByIdentity.values()];
  const audit = stableGraphValue({
    schemaVersion: WARMACHINE_COMPLETE_ACTIVATION_SHARD_MERGE_V1_SCHEMA,
    baseCheckpointHash: baseCheckpoint.checkpointHash,
    completedWorkKeys: [...completedKeys].sort(),
    completedWorkSetHash: stableGraphHash([...completedKeys].sort()),
    ...rawAudit,
  });
  audit.auditHash = stableGraphHash(audit);
  merged.shardMergeAudits = [
    ...(merged.shardMergeAudits || []),
    audit,
  ];
  delete merged.shardExecution;
  refreshMergedCheckpoint(
    merged,
    Number(baseCheckpoint.counts?.completedWorkUnitCount || 0) + completedKeys.size,
  );
  merged.counts.strictTransitionFailureCount = strictTransitionFailureCount;
  return sealCheckpoint(merged);
}
