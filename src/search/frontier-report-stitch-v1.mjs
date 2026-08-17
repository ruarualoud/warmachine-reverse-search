import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_FRONTIER_REPORT_STITCH_V1_SCHEMA =
  "warmachine_frontier_report_stitch_v1";

function absolute(value) {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(left, right) {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function rational(numerator = 0n, denominator = 1n) {
  let top = typeof numerator === "bigint" ? numerator : BigInt(numerator);
  let bottom = typeof denominator === "bigint" ? denominator : BigInt(denominator);
  if (bottom === 0n) throw new Error("stitched_probability_denominator_zero");
  if (bottom < 0n) {
    top = -top;
    bottom = -bottom;
  }
  const divisor = greatestCommonDivisor(top, bottom);
  return { numerator: top / divisor, denominator: bottom / divisor };
}

function add(left, right) {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiply(left, right) {
  return rational(left.numerator * right.numerator, left.denominator * right.denominator);
}

function compare(left, right) {
  const delta = left.numerator * right.denominator - right.numerator * left.denominator;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

function decimalString(value, places = 12) {
  const normalized = rational(value.numerator, value.denominator);
  const top = absolute(normalized.numerator);
  const sign = normalized.numerator < 0n ? "-" : "";
  const whole = top / normalized.denominator;
  let remainder = top % normalized.denominator;
  if (remainder === 0n) return `${sign}${whole}`;
  let decimals = "";
  for (let index = 0; index < places && remainder !== 0n; index += 1) {
    remainder *= 10n;
    decimals += String(remainder / normalized.denominator);
    remainder %= normalized.denominator;
  }
  return `${sign}${whole}.${decimals}`;
}

function probabilityRecord(value) {
  const normalized = rational(value.numerator, value.denominator);
  return {
    numerator: String(normalized.numerator),
    denominator: String(normalized.denominator),
    decimal: decimalString(normalized),
  };
}

function intervalRecord(interval) {
  return {
    lowerBound: probabilityRecord(interval.lower),
    upperBound: probabilityRecord(interval.upper),
    exact: interval.exact === true && compare(interval.lower, interval.upper) === 0,
  };
}

function exactInterval(status) {
  if (status === "success") return { lower: rational(1n), upper: rational(1n), exact: true };
  if (status === "failure") return { lower: rational(0n), upper: rational(0n), exact: true };
  return { lower: rational(0n), upper: rational(1n), exact: false };
}

function emptyMassVector() {
  return {
    success: rational(0n),
    failure: rational(0n),
    prunedLowProbability: rational(0n),
    unresolved: rational(0n),
  };
}

function terminalMassVector(status) {
  const result = emptyMassVector();
  if (status === "success") result.success = rational(1n);
  else if (status === "failure") result.failure = rational(1n);
  else if (status === "pruned_low_probability") result.prunedLowProbability = rational(1n);
  else result.unresolved = rational(1n);
  return result;
}

function addMassVectors(left, right) {
  const result = emptyMassVector();
  for (const key of Object.keys(result)) result[key] = add(left[key], right[key]);
  return result;
}

function scaleMassVector(vector, factor) {
  const result = emptyMassVector();
  for (const key of Object.keys(result)) result[key] = multiply(vector[key], factor);
  return result;
}

function massVectorRecord(vector) {
  const total = Object.values(vector).reduce(add, rational(0n));
  return {
    success: probabilityRecord(vector.success),
    failure: probabilityRecord(vector.failure),
    prunedLowProbability: probabilityRecord(vector.prunedLowProbability),
    unresolved: probabilityRecord(vector.unresolved),
    total: probabilityRecord(total),
    massConserved: compare(total, rational(1n)) === 0,
  };
}

function sameProbability(left = {}, right = {}) {
  return compare(rational(left.numerator, left.denominator),
    rational(right.numerator, right.denominator)) === 0;
}

function mergeIncomingContributions(left = [], right = []) {
  const byEdge = new Map();
  for (const contribution of [...left, ...right]) {
    const edgeKey = String(contribution.incomingEdgeKey || "");
    const existing = byEdge.get(edgeKey);
    if (existing && stableGraphHash(existing) !== stableGraphHash(contribution)) {
      throw new Error(`continuation_incoming_contribution_mismatch:${edgeKey}`);
    }
    byEdge.set(edgeKey, stableGraphValue(contribution));
  }
  return Array.from(byEdge.values()).sort((a, b) =>
    String(a.incomingEdgeKey).localeCompare(String(b.incomingEdgeKey)));
}

function sumIncomingContributions(contributions = []) {
  return probabilityRecord(contributions.reduce((sum, row) => add(sum, rational(
    row.contribution?.numerator ?? 0,
    row.contribution?.denominator ?? 1,
  )), rational(0n)));
}

function budgetDeferred(label = {}) {
  return label.status === "unresolved" && [
    "maximum_evaluated_states_reached",
    "maximum_policy_depth_reached",
  ].includes(label.reason);
}

function mergeConvergedContinuationLabel(existing, incoming) {
  const contributions = mergeIncomingContributions(
    existing.incomingProbabilityContributions,
    incoming.incomingProbabilityContributions,
  );
  const incomingEdgeKeys = [...new Set([
    ...(existing.incomingEdgeKeys || []),
    ...(incoming.incomingEdgeKeys || []),
  ])].sort();
  if (incomingEdgeKeys.length !== contributions.length ||
      incomingEdgeKeys.some((edgeKey, index) =>
        edgeKey !== contributions[index].incomingEdgeKey)) {
    throw new Error(`continuation_converged_incoming_edge_mismatch:${existing.labelKey}`);
  }
  let semantic = existing;
  if (budgetDeferred(existing) && !budgetDeferred(incoming)) semantic = incoming;
  else if (!budgetDeferred(existing) && budgetDeferred(incoming)) semantic = existing;
  else if (existing.status !== incoming.status || existing.reason !== incoming.reason ||
      stableGraphHash(existing.expansion || null) !== stableGraphHash(incoming.expansion || null)) {
    throw new Error(`continuation_converged_disposition_mismatch:${existing.labelKey}`);
  }
  return stableGraphValue({
    ...semantic,
    incomingEdgeKeys,
    incomingProbabilityContributions: contributions,
    cumulativeProbability: sumIncomingContributions(contributions),
  });
}

function semanticLabelIdentity(label = {}) {
  return {
    labelKey: label.labelKey,
    depth: label.depth,
    stateHash: label.stateHash,
    cursor: label.cursor,
    adversarialContextKey: label.adversarialContextKey,
    continuationKey: label.continuationKey,
  };
}

function assertContinuationRoot(ancestor, continuation) {
  if (!ancestor) throw new Error("continuation_root_missing_from_ancestor_report");
  if (!continuation) throw new Error("continuation_report_root_label_missing");
  if (stableGraphHash(semanticLabelIdentity(ancestor)) !==
      stableGraphHash(semanticLabelIdentity(continuation))) {
    throw new Error(`continuation_root_semantic_identity_mismatch:${continuation.labelKey}`);
  }
  if (!sameProbability(ancestor.cumulativeProbability, continuation.cumulativeProbability)) {
    throw new Error(`continuation_root_probability_mismatch:${continuation.labelKey}`);
  }
  if (ancestor.status !== "unresolved" || ![
    "maximum_evaluated_states_reached",
    "maximum_policy_depth_reached",
  ].includes(ancestor.reason)) {
    throw new Error(`continuation_root_not_budget_deferred:${continuation.labelKey}`);
  }
}

function chooseResponse(rows, quantifier, bound) {
  const direction = quantifier === "owner_max" ? -1 : 1;
  return rows.slice().sort((left, right) => {
    const comparison = compare(left.result.interval[bound], right.result.interval[bound]);
    return direction * comparison || left.responseKey.localeCompare(right.responseKey);
  })[0];
}

function solveStitchedGraph(rootLabelKey, labels, edges) {
  const solved = new Map();
  const active = new Set();
  const solve = (labelKey) => {
    if (solved.has(labelKey)) return solved.get(labelKey);
    if (active.has(labelKey)) throw new Error(`stitched_frontier_cycle:${labelKey}`);
    const label = labels.get(labelKey);
    if (!label) throw new Error(`stitched_label_missing:${labelKey}`);
    active.add(labelKey);
    let result;
    if (["success", "failure"].includes(label.status)) {
      result = {
        interval: exactInterval(label.status),
        lowerMass: terminalMassVector(label.status),
        upperMass: terminalMassVector(label.status),
      };
    } else if (label.status === "pruned_low_probability") {
      result = {
        interval: exactInterval("unresolved"),
        lowerMass: terminalMassVector("pruned_low_probability"),
        upperMass: terminalMassVector("pruned_low_probability"),
      };
    } else if (label.status !== "expanded" || !label.expansion) {
      result = {
        interval: exactInterval("unresolved"),
        lowerMass: terminalMassVector("unresolved"),
        upperMass: terminalMassVector("unresolved"),
      };
    } else if (label.expansion.expansionType === "deterministic") {
      const edge = edges.get(label.expansion.edgeKey);
      if (!edge?.childLabelKey) throw new Error(`stitched_deterministic_edge_missing:${label.labelKey}`);
      result = solve(edge.childLabelKey);
    } else {
      let lower = rational(0n);
      let upper = rational(0n);
      let lowerMass = emptyMassVector();
      let upperMass = emptyMassVector();
      let exact = label.expansion.responseSetComplete === true;
      for (const group of label.expansion.groups || []) {
        const conditional = rational(
          group.conditionalProbability.numerator,
          group.conditionalProbability.denominator,
        );
        const responseRows = (group.responses || []).map((response) => {
          const edge = edges.get(response.edgeKey);
          if (!edge?.childLabelKey) throw new Error(`stitched_response_edge_missing:${response.edgeKey}`);
          return {
            responseKey: response.responseKey,
            result: solve(edge.childLabelKey),
          };
        });
        let selectedLower;
        let selectedUpper;
        if (!label.expansion.responseSetComplete || !responseRows.length) {
          const unresolved = {
            responseKey: "incomplete_response_set",
            result: {
              interval: exactInterval("unresolved"),
              lowerMass: terminalMassVector("unresolved"),
              upperMass: terminalMassVector("unresolved"),
            },
          };
          selectedLower = unresolved;
          selectedUpper = unresolved;
          exact = false;
        } else {
          selectedLower = chooseResponse(responseRows, label.expansion.quantifier, "lower");
          selectedUpper = chooseResponse(responseRows, label.expansion.quantifier, "upper");
          if (!selectedLower.result.interval.exact || !selectedUpper.result.interval.exact ||
              selectedLower.responseKey !== selectedUpper.responseKey) exact = false;
        }
        group.selectedLowerResponseKey = selectedLower.responseKey;
        group.selectedUpperResponseKey = selectedUpper.responseKey;
        lower = add(lower, multiply(conditional, selectedLower.result.interval.lower));
        upper = add(upper, multiply(conditional, selectedUpper.result.interval.upper));
        lowerMass = addMassVectors(lowerMass,
          scaleMassVector(selectedLower.result.lowerMass, conditional));
        upperMass = addMassVectors(upperMass,
          scaleMassVector(selectedUpper.result.upperMass, conditional));
      }
      result = {
        interval: { lower, upper, exact: exact && compare(lower, upper) === 0 },
        lowerMass,
        upperMass,
      };
    }
    active.delete(labelKey);
    solved.set(labelKey, result);
    label.interval = intervalRecord(result.interval);
    return result;
  };
  return solve(rootLabelKey);
}

export function stitchWarmachineStrictFrontierReportsV1(
  ancestorReport = {},
  continuationReports = [],
) {
  if (!ancestorReport.reportHash || !ancestorReport.rootLabelKey) {
    throw new Error("ancestor_frontier_report_required");
  }
  const continuations = Array.isArray(continuationReports)
    ? continuationReports.filter(Boolean)
    : [];
  if (!continuations.length) throw new Error("continuation_frontier_reports_required");
  const labels = new Map((ancestorReport.labels || []).map((label) =>
    [label.labelKey, stableGraphValue(label)]));
  const edges = new Map((ancestorReport.edges || []).map((edge) =>
    [edge.edgeKey, stableGraphValue(edge)]));
  const stitchedRoots = [];

  for (const continuationReport of continuations) {
    const continuationRoot = (continuationReport.labels || []).find((label) =>
      label.labelKey === continuationReport.rootLabelKey);
    const ancestorRoot = labels.get(continuationReport.rootLabelKey);
    assertContinuationRoot(ancestorRoot, continuationRoot);
    const replacement = stableGraphValue({
      ...continuationRoot,
      incomingEdgeKeys: ancestorRoot.incomingEdgeKeys,
      incomingProbabilityContributions: ancestorRoot.incomingProbabilityContributions,
      cumulativeProbability: ancestorRoot.cumulativeProbability,
    });
    labels.set(replacement.labelKey, replacement);
    stitchedRoots.push(replacement.labelKey);

    for (const continuationLabel of continuationReport.labels || []) {
      if (continuationLabel.labelKey === replacement.labelKey) continue;
      const incoming = labels.get(continuationLabel.labelKey);
      if (incoming && stableGraphHash(semanticLabelIdentity(incoming)) !==
          stableGraphHash(semanticLabelIdentity(continuationLabel))) {
        throw new Error(`continuation_descendant_semantic_identity_mismatch:${continuationLabel.labelKey}`);
      }
      if (incoming && stableGraphHash(incoming.expansion || null) !==
          stableGraphHash(continuationLabel.expansion || null)) {
        if (!budgetDeferred(incoming) && !budgetDeferred(continuationLabel)) {
          throw new Error(`continuation_descendant_expansion_mismatch:${continuationLabel.labelKey}`);
        }
      }
      labels.set(
        continuationLabel.labelKey,
        incoming
          ? mergeConvergedContinuationLabel(incoming, continuationLabel)
          : stableGraphValue(continuationLabel),
      );
    }
    for (const continuationEdge of continuationReport.edges || []) {
      const incoming = edges.get(continuationEdge.edgeKey);
      if (incoming && stableGraphHash(incoming) !== stableGraphHash(continuationEdge)) {
        throw new Error(`continuation_edge_identity_mismatch:${continuationEdge.edgeKey}`);
      }
      edges.set(continuationEdge.edgeKey, stableGraphValue(continuationEdge));
    }
  }

  const root = solveStitchedGraph(ancestorReport.rootLabelKey, labels, edges);
  const lowerPolicyMass = massVectorRecord(root.lowerMass);
  const upperPolicyMass = massVectorRecord(root.upperMass);
  const publicLabels = Array.from(labels.values()).sort((left, right) =>
    left.depth - right.depth || left.labelKey.localeCompare(right.labelKey));
  const publicEdges = Array.from(edges.values()).sort((left, right) =>
    left.edgeKey.localeCompare(right.edgeKey));
  const unresolvedReasons = [...new Set(publicLabels.filter((label) => label.status === "unresolved")
    .map((label) => label.reason).filter(Boolean))].sort();
  const chanceMassComplete = ancestorReport.chanceMassComplete === true && continuations.every((report) =>
    report.chanceMassComplete === true);
  const opponentResponseSetComplete = ancestorReport.opponentResponseSetComplete === true &&
    continuations.every((report) => report.opponentResponseSetComplete === true);
  const core = {
    schemaVersion: WARMACHINE_FRONTIER_REPORT_STITCH_V1_SCHEMA,
    routeKey: ancestorReport.routeKey,
    perspectiveSideKey: ancestorReport.perspectiveSideKey,
    rootStateHash: ancestorReport.rootStateHash,
    rootLabelKey: ancestorReport.rootLabelKey,
    lowProbabilityThreshold: String(ancestorReport.lowProbabilityThreshold || "0"),
    ancestorReportHash: ancestorReport.reportHash,
    continuationReportHashes: continuations.map((report) => report.reportHash).sort(),
    stitchedRootLabelKeys: stitchedRoots.sort(),
    replacedSuffixCount: stitchedRoots.length,
    probabilityInterval: intervalRecord(root.interval),
    lowerAdversarialPolicyMass: lowerPolicyMass,
    upperAdversarialPolicyMass: upperPolicyMass,
    chanceMassComplete,
    opponentResponseSetComplete,
    exactComplete: root.interval.exact && chanceMassComplete && opponentResponseSetComplete,
    strictRejectedResponseEdgeCount: Number(ancestorReport.strictRejectedResponseEdgeCount || 0) +
      continuations.reduce((sum, report) =>
        sum + Number(report.strictRejectedResponseEdgeCount || 0), 0),
    strictRejectedDeterministicEdgeCount:
      Number(ancestorReport.strictRejectedDeterministicEdgeCount || 0) +
      continuations.reduce((sum, report) =>
        sum + Number(report.strictRejectedDeterministicEdgeCount || 0), 0),
    unresolvedReasons,
    labelCount: publicLabels.length,
    edgeCount: publicEdges.length,
    labels: publicLabels,
    edges: publicEdges,
    frontierAudits: stableGraphValue([
      ...(ancestorReport.frontierAudits || []),
      ...continuations.flatMap((report) => report.frontierAudits || []),
    ]),
    stepAudits: stableGraphValue([
      ...(ancestorReport.stepAudits || []),
      ...continuations.flatMap((report) => report.stepAudits || []),
    ]),
    claimBoundary: "A continuation replaces only an exactly matching budget-deferred semantic label. Ancestor reports remain immutable; the stitched report preserves ancestor incoming contributions, exact-merges converged same-context descendant mass, appends strict continuation evidence and recomputes Chance plus owner AND/min values from leaves to root. Unstitched suffixes remain unresolved and no strategy optimum is claimed.",
  };
  return {
    ...core,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: lowerPolicyMass.massConserved && upperPolicyMass.massConserved &&
      core.strictRejectedResponseEdgeCount === 0 &&
      core.strictRejectedDeterministicEdgeCount === 0,
  };
}

export function stitchWarmachineStrictFrontierRuntimeCheckpointsV1(
  stitchedReport = {},
  runtimeCheckpoints = [],
) {
  if (!stitchedReport.reportHash) throw new Error("stitched_frontier_report_required");
  const checkpoints = Array.isArray(runtimeCheckpoints) ? runtimeCheckpoints.filter(Boolean) : [];
  if (!checkpoints.length) throw new Error("frontier_runtime_checkpoints_required");
  const reportLabelByKey = new Map((stitchedReport.labels || []).map((label) =>
    [label.labelKey, label]));
  const stateEntryByLabel = new Map();
  const receiptByHash = new Map();
  for (const checkpoint of checkpoints) {
    for (const entry of checkpoint.stateEntries || []) {
      const existing = stateEntryByLabel.get(entry.labelKey);
      if (existing && existing.stateHash !== entry.stateHash) {
        throw new Error(`stitched_runtime_state_mismatch:${entry.labelKey}`);
      }
      stateEntryByLabel.set(entry.labelKey, entry);
    }
    for (const row of checkpoint.receipts || []) {
      if (!receiptByHash.has(row.receiptHash)) receiptByHash.set(row.receiptHash, row.receipt);
    }
  }
  const stateEntries = Array.from(stateEntryByLabel.values()).filter((entry) =>
    reportLabelByKey.has(entry.labelKey)).map((entry) => {
    const label = reportLabelByKey.get(entry.labelKey);
    return {
      ...entry,
      depth: label.depth,
      stateHash: label.stateHash,
      cursor: label.cursor,
      adversarialContextKey: label.adversarialContextKey,
      continuationKey: label.continuationKey,
      cumulativeProbability: label.cumulativeProbability,
      incomingEdgeKeys: label.incomingEdgeKeys,
      status: label.status,
      reason: label.reason,
    };
  }).sort((left, right) => left.depth - right.depth ||
    left.labelKey.localeCompare(right.labelKey));
  const missingStateLabelKeys = (stitchedReport.labels || []).filter((label) =>
    !stateEntryByLabel.has(label.labelKey) && label.stateHash && !label.stateHash.startsWith("synthetic:"))
    .map((label) => label.labelKey);
  if (missingStateLabelKeys.length) {
    throw new Error(`stitched_runtime_states_missing:${missingStateLabelKeys.slice(0, 8).join(",")}`);
  }
  const receipts = Array.from(receiptByHash.entries()).map(([receiptHash, receipt]) => ({
    receiptHash,
    receipt,
  })).sort((left, right) => left.receiptHash.localeCompare(right.receiptHash));
  const resumableLabelKeys = stateEntries.filter((entry) => entry.status === "unresolved" &&
    ["maximum_evaluated_states_reached", "maximum_policy_depth_reached"]
      .includes(entry.reason)).map((entry) => entry.labelKey);
  const core = {
    schemaVersion: "warmachine_strict_policy_frontier_runtime_checkpoint_v1",
    reportHash: stitchedReport.reportHash,
    routeKey: stitchedReport.routeKey,
    parentRuntimeCheckpointHashes: checkpoints.map((checkpoint) => checkpoint.checkpointHash).sort(),
    stateEntryCount: stateEntries.length,
    receiptCount: receipts.length,
    resumableLabelKeys,
    stateEntries,
    receipts,
  };
  return {
    ...core,
    checkpointHash: stableGraphHash(stableGraphValue({
      ...core,
      stateEntries: stateEntries.map(({ state, ...entry }) => ({
        ...entry,
        stateHash: entry.stateHash,
      })),
      receipts: receipts.map(({ receiptHash }) => receiptHash),
    })),
  };
}
