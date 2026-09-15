import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  stitchWarmachineStrictFrontierReportsV1,
  stitchWarmachineStrictFrontierRuntimeCheckpointsV1,
} from "./frontier-report-stitch-v1.mjs";
import { evaluateWarmachineStrictPolicyFrontierProbabilityAndMinV3 } from
  "./strict-policy-frontier-probability-and-min-v3.mjs";

export const WARMACHINE_FRONTIER_CONTINUATION_BATCH_V1_SCHEMA =
  "warmachine_frontier_continuation_batch_v1";

function semanticIdentity(value = {}) {
  return {
    labelKey: String(value.labelKey || ""),
    depth: Number(value.depth),
    stateHash: String(value.stateHash || ""),
    cursor: String(value.cursor ?? ""),
    adversarialContextKey: String(value.adversarialContextKey || ""),
    continuationKey: String(value.continuationKey || ""),
  };
}

function sameProbability(left = {}, right = {}) {
  return BigInt(left.numerator ?? 0) * BigInt(right.denominator ?? 1) ===
    BigInt(right.numerator ?? 0) * BigInt(left.denominator ?? 1);
}

function canonicalEntryOrder(left, right) {
  return Number(left.depth) - Number(right.depth) ||
    String(left.adversarialContextKey).localeCompare(String(right.adversarialContextKey)) ||
    String(left.stateHash).localeCompare(String(right.stateHash)) ||
    String(left.cursor).localeCompare(String(right.cursor)) ||
    String(left.continuationKey).localeCompare(String(right.continuationKey)) ||
    String(left.labelKey).localeCompare(String(right.labelKey));
}

function compareProbabilityDescending(left = {}, right = {}) {
  const leftNumerator = BigInt(left.numerator ?? 0);
  const leftDenominator = BigInt(left.denominator ?? 1);
  const rightNumerator = BigInt(right.numerator ?? 0);
  const rightDenominator = BigInt(right.denominator ?? 1);
  const compared = leftNumerator * rightDenominator - rightNumerator * leftDenominator;
  return compared > 0n ? -1 : compared < 0n ? 1 : 0;
}

function rootResponseSchedulingContext(ancestorReport = {}) {
  const labels = new Map((ancestorReport.labels || []).map((label) =>
    [label.labelKey, label]));
  const edges = new Map((ancestorReport.edges || []).map((edge) =>
    [edge.edgeKey, edge]));
  const root = labels.get(ancestorReport.rootLabelKey);
  const byAdversarialContext = new Map();
  for (const group of root?.expansion?.groups || []) {
    for (const response of group.responses || []) {
      for (const branch of response.branches || []) {
        const edge = edges.get(branch.edgeKey);
        const child = labels.get(edge?.childLabelKey);
        const contextKey = String(child?.adversarialContextKey || "");
        if (!contextKey) continue;
        byAdversarialContext.set(contextKey, {
          groupKey: String(group.groupKey || ""),
          groupProbability: group.conditionalProbability || { numerator: "0", denominator: "1" },
          responseKey: String(response.responseKey || ""),
          selectedUpperResponse:
            String(response.responseKey || "") === String(group.selectedUpperResponseKey || ""),
        });
      }
    }
  }
  return byAdversarialContext;
}

function scheduledEntryOrder(mode, schedulingContext) {
  if (mode !== "root_upper_response_depth_first_v1") return canonicalEntryOrder;
  return (left, right) => {
    const leftContext = schedulingContext.get(String(left.adversarialContextKey || ""));
    const rightContext = schedulingContext.get(String(right.adversarialContextKey || ""));
    const leftSelected = leftContext?.selectedUpperResponse === true ? 0 : 1;
    const rightSelected = rightContext?.selectedUpperResponse === true ? 0 : 1;
    return leftSelected - rightSelected ||
      Number(right.depth) - Number(left.depth) ||
      compareProbabilityDescending(
        leftContext?.groupProbability,
        rightContext?.groupProbability,
      ) ||
      String(leftContext?.groupKey || "").localeCompare(String(rightContext?.groupKey || "")) ||
      compareProbabilityDescending(left.cumulativeProbability, right.cumulativeProbability) ||
      canonicalEntryOrder(left, right);
  };
}

function depthDistribution(entries = []) {
  const counts = new Map();
  for (const entry of entries) {
    const depth = Number(entry.depth);
    counts.set(depth, (counts.get(depth) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((left, right) => left[0] - right[0])
    .map(([depth, count]) => ({ depth, count }));
}

function thresholdIsolationAudit(entries = [], threshold = "0") {
  const contextCounts = new Map();
  for (const entry of entries) {
    const contextKey = String(entry.adversarialContextKey || "");
    contextCounts.set(contextKey, (contextCounts.get(contextKey) || 0) + 1);
  }
  const repeatedContextKeys = Array.from(contextCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([contextKey]) => contextKey)
    .sort();
  const mode = threshold === "0"
    ? "threshold_disabled"
    : entries.length <= 1
      ? "single_root"
      : repeatedContextKeys.length
        ? "batch_wide_layer_merge_required"
        : "pairwise_disjoint_adversarial_contexts";
  return {
    mode,
    selectedRootCount: entries.length,
    selectedAdversarialContextCount: contextCounts.size,
    repeatedAdversarialContextKeys: repeatedContextKeys,
    thresholdSafeWithoutCrossRootMerge: threshold === "0" ||
      entries.length <= 1 || repeatedContextKeys.length === 0,
  };
}

function assertBatchEntryMetadata(entry, ancestorReport, ancestorLabel) {
  if (!ancestorLabel) throw new Error(`continuation_batch_label_missing:${entry.labelKey}`);
  if (ancestorLabel.status !== "unresolved" || ![
    "maximum_evaluated_states_reached",
    "maximum_policy_depth_reached",
  ].includes(ancestorLabel.reason)) {
    throw new Error(`continuation_batch_label_not_budget_deferred:${entry.labelKey}`);
  }
  if (entry.reportHash && entry.reportHash !== ancestorReport.reportHash) {
    throw new Error(`continuation_batch_report_binding_mismatch:${entry.labelKey}`);
  }
  if (stableGraphHash(semanticIdentity(entry)) !==
      stableGraphHash(semanticIdentity(ancestorLabel))) {
    throw new Error(`continuation_batch_semantic_identity_mismatch:${entry.labelKey}`);
  }
  if (!sameProbability(entry.cumulativeProbability, ancestorLabel.cumulativeProbability)) {
    throw new Error(`continuation_batch_probability_mismatch:${entry.labelKey}`);
  }
}

function memoizedStateHash(state, stateHashByObject) {
  if (!state || typeof state !== "object") return stableGraphHash(state);
  if (!stateHashByObject.has(state)) stateHashByObject.set(state, stableGraphHash(state));
  return stateHashByObject.get(state);
}

function assertBatchEntryState(entry, runtimeEntry, stateHashByObject) {
  if (!entry.state || memoizedStateHash(entry.state, stateHashByObject) !== entry.stateHash) {
    throw new Error(`continuation_batch_state_hash_mismatch:${entry.labelKey}`);
  }
  if (!runtimeEntry || memoizedStateHash(runtimeEntry.state, stateHashByObject) !== entry.stateHash) {
    throw new Error(`continuation_batch_runtime_state_missing:${entry.labelKey}`);
  }
}

export function planWarmachineStrictFrontierContinuationBatchV1(
  ancestorReport = {},
  restoredEntries = [],
  rawOptions = {},
) {
  if (!ancestorReport.reportHash) throw new Error("continuation_batch_ancestor_report_required");
  const ancestorLabelByKey = new Map((ancestorReport.labels || []).map((label) =>
    [label.labelKey, label]));
  const uniqueEntries = new Map();
  for (const entry of Array.isArray(restoredEntries) ? restoredEntries : []) {
    if (uniqueEntries.has(entry.labelKey)) {
      throw new Error(`continuation_batch_duplicate_label:${entry.labelKey}`);
    }
    assertBatchEntryMetadata(entry, ancestorReport, ancestorLabelByKey.get(entry.labelKey));
    uniqueEntries.set(entry.labelKey, entry);
  }
  const schedulingMode = String(rawOptions.schedulingMode || "canonical_v1");
  if (!["canonical_v1", "root_upper_response_depth_first_v1"]
    .includes(schedulingMode)) {
    throw new Error(`continuation_batch_scheduling_mode_unknown:${schedulingMode}`);
  }
  const schedulingContext = rootResponseSchedulingContext(ancestorReport);
  const ordered = Array.from(uniqueEntries.values()).sort(
    scheduledEntryOrder(schedulingMode, schedulingContext),
  );
  const maximumContinuationLabels = Math.max(0, Number(
    rawOptions.maximumContinuationLabels ?? ordered.length,
  ));
  return {
    ordered,
    selected: ordered.slice(0, maximumContinuationLabels),
    schedulingMode,
    schedulingContextCount: schedulingContext.size,
  };
}

export function prepareWarmachineStrictFrontierContinuationBatchV1(
  ancestorReport = {},
  ancestorRuntimeCheckpoint = {},
  restoredEntries = [],
  rawOptions = {},
) {
  if (!ancestorReport.reportHash ||
      ancestorRuntimeCheckpoint.reportHash !== ancestorReport.reportHash) {
    throw new Error("continuation_batch_ancestor_binding_mismatch");
  }
  const runtimeEntryByKey = new Map((ancestorRuntimeCheckpoint.stateEntries || []).map((entry) =>
    [entry.labelKey, entry]));
  const planned = planWarmachineStrictFrontierContinuationBatchV1(
    ancestorReport,
    restoredEntries,
    rawOptions,
  );
  const { ordered, selected, schedulingMode, schedulingContextCount } = planned;
  const stateHashByObject = new WeakMap();
  for (const entry of selected) {
    assertBatchEntryState(entry, runtimeEntryByKey.get(entry.labelKey), stateHashByObject);
  }
  const continuationDepthIncrement = Math.max(1, Number(
    rawOptions.continuationDepthIncrement ?? 1,
  ));
  const maximumEvaluatedStatesPerContinuation = Math.max(1, Number(
    rawOptions.maximumEvaluatedStatesPerContinuation ?? 1,
  ));
  const threshold = String(
    rawOptions.lowProbabilityThreshold ?? ancestorReport.lowProbabilityThreshold ?? "0",
  );
  const thresholdIsolation = thresholdIsolationAudit(selected, threshold);
  if (!thresholdIsolation.thresholdSafeWithoutCrossRootMerge) {
    throw new Error("continuation_batch_nonzero_threshold_requires_batch_wide_layer_merge");
  }
  return {
    ancestorReport,
    ancestorRuntimeCheckpoint,
    ordered,
    selected,
    continuationDepthIncrement,
    maximumEvaluatedStatesPerContinuation,
    threshold,
    thresholdIsolation,
    schedulingMode,
    schedulingContextCount,
  };
}

export function evaluateWarmachineStrictFrontierContinuationEntryV1(
  entry = {},
  selectPolicyAction,
  rawOptions = {},
) {
  if (typeof selectPolicyAction !== "function") {
    throw new Error("continuation_batch_policy_selector_required");
  }
  const continuation = evaluateWarmachineStrictPolicyFrontierProbabilityAndMinV3(
    entry.state,
    selectPolicyAction,
    {
      routeKey: rawOptions.routeKey,
      perspectiveSideKey: rawOptions.perspectiveSideKey,
      initialDepth: entry.depth,
      initialPolicyCursor: entry.cursor,
      rootAdversarialContextKey: entry.adversarialContextKey,
      initialContinuationKey: entry.continuationKey,
      initialCumulativeProbability: entry.cumulativeProbability,
      inputStateAlreadyNormalized: true,
      maximumDepth: Number(entry.depth) + Math.max(1, Number(
        rawOptions.continuationDepthIncrement ?? 1,
      )),
      maximumEvaluatedStates: Math.max(1, Number(
        rawOptions.maximumEvaluatedStatesPerContinuation ?? 1,
      )),
      lowProbabilityThreshold: String(rawOptions.lowProbabilityThreshold ?? "0"),
      includeRuntimeCheckpoint: true,
      ...(typeof rawOptions.onProgress === "function"
        ? { onProgress: rawOptions.onProgress }
        : {}),
      ...(typeof rawOptions.classifyState === "function"
        ? { classifyState: rawOptions.classifyState }
        : {}),
      ...(typeof rawOptions.classifyResult === "function"
        ? { classifyResult: rawOptions.classifyResult }
        : {}),
    },
  );
  if (continuation.rootLabelKey !== entry.labelKey) {
    throw new Error(`continuation_batch_root_identity_mismatch:${entry.labelKey}`);
  }
  return continuation;
}

export function finalizeWarmachineStrictFrontierContinuationBatchV1(
  prepared = {},
  continuationReports = [],
) {
  const {
    ancestorReport,
    ancestorRuntimeCheckpoint,
    ordered = [],
    selected = [],
    continuationDepthIncrement,
    maximumEvaluatedStatesPerContinuation,
    threshold,
    thresholdIsolation,
    schedulingMode,
    schedulingContextCount,
  } = prepared;
  if (!selected.length) {
    const core = {
      schemaVersion: WARMACHINE_FRONTIER_CONTINUATION_BATCH_V1_SCHEMA,
      ancestorReportHash: ancestorReport.reportHash,
      selectedLabelKeys: [],
      selectedLabelCount: 0,
      suppliedLabelCount: ordered.length,
      suppliedDepthDistribution: depthDistribution(ordered),
      remainingResumableLabelKeys:
        ancestorRuntimeCheckpoint.resumableLabelKeys?.slice().sort() || [],
      continuationReportHashes: [],
      schedulingMode,
      schedulingContextCount,
      reportHash: ancestorReport.reportHash,
      runtimeCheckpointHash: ancestorRuntimeCheckpoint.checkpointHash,
      noWork: true,
    };
    return {
      ...core,
      batchHash: stableGraphHash(stableGraphValue(core)),
      report: ancestorReport,
      runtimeCheckpoint: ancestorRuntimeCheckpoint,
      continuationReports: [],
      ok: true,
    };
  }
  if (!Array.isArray(continuationReports) || continuationReports.length !== selected.length) {
    throw new Error("continuation_batch_report_count_mismatch");
  }
  const reportByRoot = new Map(continuationReports.map((report) =>
    [report.rootLabelKey, report]));
  if (reportByRoot.size !== selected.length || selected.some((entry) =>
    !reportByRoot.has(entry.labelKey))) {
    throw new Error("continuation_batch_report_root_set_mismatch");
  }
  const orderedContinuationReports = selected.map((entry) => reportByRoot.get(entry.labelKey));
  const report = stitchWarmachineStrictFrontierReportsV1(
    ancestorReport,
    orderedContinuationReports,
  );
  const runtimeCheckpoint = stitchWarmachineStrictFrontierRuntimeCheckpointsV1(
    report,
    [ancestorRuntimeCheckpoint, ...orderedContinuationReports.map((row) => row.runtimeCheckpoint)],
  );
  const core = {
    schemaVersion: WARMACHINE_FRONTIER_CONTINUATION_BATCH_V1_SCHEMA,
    ancestorReportHash: ancestorReport.reportHash,
    ancestorRuntimeCheckpointHash: ancestorRuntimeCheckpoint.checkpointHash,
    selectedLabelKeys: selected.map((entry) => entry.labelKey),
    selectedLabelCount: selected.length,
    suppliedLabelCount: ordered.length,
    suppliedDepthDistribution: depthDistribution(ordered),
    selectedDepthDistribution: depthDistribution(selected),
    unselectedSuppliedLabelKeys: ordered.slice(selected.length).map((entry) => entry.labelKey),
    continuationDepthIncrement,
    maximumEvaluatedStatesPerContinuation,
    lowProbabilityThreshold: threshold,
    thresholdIsolation,
    schedulingMode,
    schedulingContextCount,
    continuationReportHashes: orderedContinuationReports.map((row) => row.reportHash).sort(),
    reportHash: report.reportHash,
    runtimeCheckpointHash: runtimeCheckpoint.checkpointHash,
    remainingResumableLabelKeys: runtimeCheckpoint.resumableLabelKeys.slice().sort(),
    remainingDepthDistribution: depthDistribution(runtimeCheckpoint.stateEntries.filter((entry) =>
      runtimeCheckpoint.resumableLabelKeys.includes(entry.labelKey))),
    strictRejectedResponseEdgeCount: report.strictRejectedResponseEdgeCount,
    strictRejectedDeterministicEdgeCount: report.strictRejectedDeterministicEdgeCount,
    probabilityInterval: report.probabilityInterval,
    exactComplete: report.exactComplete,
    claimBoundary: "This scheduler advances only an explicitly bounded subset of restored budget-deferred labels. Canonical mode preserves the historical canonical key order. Root-upper-response mode prioritizes the root's currently selected upper-bound response, then higher root Chance mass and deeper descendants; it changes work order only and never drops a label or proves dominance. The scheduler restores exact depth, cursor, adversarial context, continuation suffix and cumulative Chance mass, then immutable-stitches strict continuations. A nonzero threshold may run independently across multiple roots only when their adversarial contexts are pairwise disjoint; repeated contexts still require a batch-wide same-layer merge. Unselected and newly deferred labels remain resumable; scheduling order is not a strategy score or optimality claim.",
  };
  return {
    ...core,
    batchHash: stableGraphHash(stableGraphValue(core)),
    report,
    runtimeCheckpoint,
    continuationReports: orderedContinuationReports,
    ok: report.ok === true,
  };
}

export function runWarmachineStrictFrontierContinuationBatchV1(
  ancestorReport = {},
  ancestorRuntimeCheckpoint = {},
  restoredEntries = [],
  selectPolicyAction,
  rawOptions = {},
) {
  const prepared = prepareWarmachineStrictFrontierContinuationBatchV1(
    ancestorReport,
    ancestorRuntimeCheckpoint,
    restoredEntries,
    rawOptions,
  );
  const continuationReports = prepared.selected.map((entry) =>
    evaluateWarmachineStrictFrontierContinuationEntryV1(entry, selectPolicyAction, {
      routeKey: ancestorReport.routeKey,
      perspectiveSideKey: ancestorReport.perspectiveSideKey,
      continuationDepthIncrement: prepared.continuationDepthIncrement,
      maximumEvaluatedStatesPerContinuation: prepared.maximumEvaluatedStatesPerContinuation,
      lowProbabilityThreshold: prepared.threshold,
      ...(typeof rawOptions.onProgress === "function"
        ? {
            onProgress: (detail) => rawOptions.onProgress({
              labelKey: entry.labelKey,
              ...detail,
            }),
          }
        : {}),
      ...(typeof rawOptions.classifyState === "function"
        ? { classifyState: rawOptions.classifyState }
        : {}),
      ...(typeof rawOptions.classifyResult === "function"
        ? { classifyResult: rawOptions.classifyResult }
        : {}),
    }));
  return finalizeWarmachineStrictFrontierContinuationBatchV1(
    prepared,
    continuationReports,
  );
}
