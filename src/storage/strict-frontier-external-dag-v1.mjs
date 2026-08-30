import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { buildWarmachineExternalDagContentIdentity } from "./content-address-v1.mjs";
import { createWarmachineExternalDagStore } from "./external-dag-v1.mjs";

export const WARMACHINE_STRICT_FRONTIER_EXTERNAL_DAG_V1_SCHEMA =
  "warmachine_strict_frontier_external_dag_v1";

const VERIFIED_REUSABLE_CONTENT_REFERENCES = new WeakSet();

function storeOptions(rawOptions = {}) {
  return {
    hostReceiptHash: String(rawOptions.hostReceiptHash || ""),
    sourceHash: String(rawOptions.sourceHash || ""),
    configHash: String(rawOptions.configHash || ""),
    partitionCount: Number(rawOptions.partitionCount || 8),
    sortRunRecordLimit: Number(rawOptions.sortRunRecordLimit || 256),
    maxDeltaDepth: Number(rawOptions.maxDeltaDepth ?? 8),
    maxDeltaRatio: Number(rawOptions.maxDeltaRatio ?? 0.8),
    ...(rawOptions.create === false ? { create: false } : {}),
  };
}

function identity(kind, payload, hostReceiptHash) {
  return buildWarmachineExternalDagContentIdentity(kind, payload, { hostReceiptHash }).id;
}

function receiptHashesForEdge(edge = {}) {
  return [...new Set([
    edge.receiptHash,
    edge.representativeReceiptHash,
    ...(edge.equivalentExecutionEvidence || []).map((row) => row.receiptHash),
  ].filter(Boolean))].sort();
}

function resumableLabel(label = {}) {
  return label.status === "unresolved" && [
    "maximum_evaluated_states_reached",
    "maximum_policy_depth_reached",
  ].includes(label.reason);
}

function recoveryHealthy(recovery = {}) {
  return recovery.frozen !== true &&
    (recovery.dependencyFailures || []).length === 0 &&
    (recovery.invalidSubmissions || []).length === 0;
}

function canonicalFrontierEntryOrder(left, right) {
  return Number(left.depth) - Number(right.depth) ||
    String(left.adversarialContextKey).localeCompare(String(right.adversarialContextKey)) ||
    String(left.stateHash).localeCompare(String(right.stateHash)) ||
    String(left.cursor).localeCompare(String(right.cursor)) ||
    String(left.continuationKey).localeCompare(String(right.continuationKey)) ||
    String(left.labelKey).localeCompare(String(right.labelKey));
}

export function persistWarmachineStrictFrontierExternalDagV1(
  rootPath,
  report = {},
  runtimeCheckpoint = {},
  rawOptions = {},
) {
  if (!report.reportHash || runtimeCheckpoint.reportHash !== report.reportHash) {
    throw new Error("strict_frontier_runtime_report_binding_mismatch");
  }
  const options = storeOptions(rawOptions);
  const store = createWarmachineExternalDagStore(rootPath, options);
  store.assertWritable();
  const hostReceiptHash = options.hostReceiptHash;
  const reusableContentReferences = rawOptions.reusableContentReferences || null;
  if (reusableContentReferences &&
      !VERIFIED_REUSABLE_CONTENT_REFERENCES.has(reusableContentReferences)) {
    throw new Error("strict_frontier_reusable_content_references_not_verified");
  }
  const writer = store.createCandidateSegment({
    workerId: String(rawOptions.workerId || "strict-frontier"),
    batchId: String(rawOptions.batchId || `frontier-${report.reportHash.slice(0, 16)}`),
    budgets: {
      maxAcceptedRecords: Number(rawOptions.maxAcceptedRecords || 1_000_000),
      maxCandidateBytes: Number(rawOptions.maxCandidateBytes || 2 * 1024 * 1024 * 1024),
      maxWallTimeMs: Number(rawOptions.maxWallTimeMs || 30 * 60 * 1_000),
      maxLabelsPerState: Number(rawOptions.maxLabelsPerState || 100_000),
    },
  });
  const reusableStateIdByHash = new Map(Object.entries(
    reusableContentReferences?.stateIdByHash || {},
  ));
  const reusableReceiptIdByHash = new Map(Object.entries(
    reusableContentReferences?.receiptIdByHash || {},
  ));
  const reusableIdsByKind = new Map(["label", "edge", "chance", "unresolved"].map((kind) => [
    kind,
    new Set(reusableContentReferences?.contentIdsByKind?.[kind] || []),
  ]));
  const newContentObjectCountByKind = new Map();
  const persistVersionedContent = (kind, payload) => {
    const expectedId = identity(kind, payload, hostReceiptHash);
    if (reusableIdsByKind.get(kind)?.has(expectedId)) return expectedId;
    const persisted = writer.append(kind, payload);
    if (persisted.id !== expectedId) {
      throw new Error(`strict_frontier_content_identity_mismatch:${kind}:${expectedId}`);
    }
    newContentObjectCountByKind.set(kind,
      (newContentObjectCountByKind.get(kind) || 0) + 1);
    return persisted.id;
  };
  const stateIdByLabel = new Map();
  const newStateById = new Map();
  for (const entry of runtimeCheckpoint.stateEntries || []) {
    const reusableStateId = reusableStateIdByHash.get(entry.stateHash) || "";
    if (!reusableStateId && !entry.state) {
      throw new Error(`strict_frontier_unmaterialized_new_state:${entry.labelKey}`);
    }
    const stateId = reusableStateId || identity("state", entry.state, hostReceiptHash);
    stateIdByLabel.set(entry.labelKey, stateId);
    if (!reusableStateId && !newStateById.has(stateId)) newStateById.set(stateId, entry);
  }
  const parentLabelByChild = new Map();
  for (const edge of report.edges || []) {
    if (edge.childLabelKey && !parentLabelByChild.has(edge.childLabelKey)) {
      parentLabelByChild.set(edge.childLabelKey, edge.parentLabelKey);
    }
  }
  for (const [stateId, entry] of newStateById) {
    const parentLabelKey = parentLabelByChild.get(entry.labelKey) || "";
    const persisted = writer.append("state", entry.state, {
      parentStateId: stateIdByLabel.get(parentLabelKey) || "",
    });
    if (persisted.id !== stateId) {
      throw new Error(`strict_frontier_state_identity_mismatch:${entry.labelKey}`);
    }
  }

  const receiptIdByHash = new Map();
  for (const row of runtimeCheckpoint.receipts || []) {
    const reusableReceiptId = reusableReceiptIdByHash.get(row.receiptHash) || "";
    if (reusableReceiptId) {
      receiptIdByHash.set(row.receiptHash, reusableReceiptId);
    } else {
      if (!row.receipt || String(row.receipt.receiptHash || "") !== row.receiptHash) {
        throw new Error(`strict_frontier_receipt_hash_mismatch:${row.receiptHash}`);
      }
      const persisted = writer.append("receipt", row.receipt);
      receiptIdByHash.set(row.receiptHash, persisted.id);
    }
  }

  const labelIdByKey = new Map();
  for (const label of report.labels || []) {
    const stateId = stateIdByLabel.get(label.labelKey) || `unbound:${label.stateHash}`;
    const payload = {
      schemaVersion: "warmachine_strict_frontier_route_label_payload_v3",
      searchContextKey: `${report.routeKey}:${label.adversarialContextKey}`,
      labelKey: label.labelKey,
      stateId,
      stateHash: label.stateHash,
      depth: label.depth,
      cursor: label.cursor,
      adversarialContextKey: label.adversarialContextKey,
      continuationKey: label.continuationKey,
      trainingProvenance: { source: "strict-frontier-v3", trainingTruth: false },
      claimBoundary: "This object is the immutable semantic route-label identity. Mutable incoming mass, solve status, interval and expansion evidence live in the content-addressed report snapshot and checkpoint ledger.",
    };
    labelIdByKey.set(label.labelKey, persistVersionedContent("label", payload));
  }

  const edgeIdByKey = new Map();
  for (const edge of report.edges || []) {
    const strictReceiptIds = receiptHashesForEdge(edge).map((hash) =>
      receiptIdByHash.get(hash)).filter(Boolean);
    const payload = {
      schemaVersion: "warmachine_strict_frontier_edge_payload_v2",
      edgeKey: edge.edgeKey,
      edgeType: edge.edgeType,
      fromLabelId: labelIdByKey.get(edge.parentLabelKey) || "",
      toLabelId: labelIdByKey.get(edge.childLabelKey) || "",
      fromStateId: stateIdByLabel.get(edge.parentLabelKey) || "",
      toStateId: stateIdByLabel.get(edge.childLabelKey) || "",
      actionKey: edge.actionKey,
      responseKey: edge.responseKey || "",
      quantifier: edge.quantifier || "deterministic_singleton",
      conditionalProbability: edge.conditionalProbability,
      strictReceiptIds,
      transitionAccepted: edge.transitionAccepted === true,
    };
    edgeIdByKey.set(edge.edgeKey, persistVersionedContent("edge", payload));
  }

  let chanceContributionCount = 0;
  const chanceIds = new Set();
  const edgeByKey = new Map((report.edges || []).map((edge) => [edge.edgeKey, edge]));
  for (const label of report.labels || []) {
    if (label.expansion?.expansionType !== "chance") continue;
    for (const group of label.expansion.groups || []) {
      for (const response of group.responses || []) {
        for (const branch of response.branches || []) {
          const edge = edgeByKey.get(branch.edgeKey);
          if (!edge) {
            throw new Error(`strict_frontier_chance_edge_missing:${branch.edgeKey}`);
          }
          for (const classEvidence of group.classEvidence || []) {
            const responseEvidence = (classEvidence.responseEvidence || []).find((candidate) =>
              candidate.responseKey === response.responseKey);
            const postResponseEvidence = (responseEvidence?.postResponseOutcomes || []).find((candidate) =>
              candidate.classKey === branch.postResponseChanceClassKey);
            const chanceId = persistVersionedContent("chance", {
              schemaVersion: "warmachine_strict_frontier_chance_payload_v3",
              eventId: `${label.labelKey}:${label.expansion.actionKey}`,
              adversarialChanceGroupKey: group.groupKey,
              chanceClassKey: classEvidence.chanceClassKey,
              responseKey: response.responseKey,
              postResponseChanceClassKey: branch.postResponseChanceClassKey,
              primaryProbabilityNumerator: classEvidence.numerator,
              primaryProbabilityDenominator: classEvidence.denominator,
              postResponseProbabilityNumerator: branch.conditionalProbability?.numerator || "1",
              postResponseProbabilityDenominator: branch.conditionalProbability?.denominator || "1",
              incomingRouteLabelId: labelIdByKey.get(label.labelKey) || "",
              outgoingEdgeId: edgeIdByKey.get(branch.edgeKey) || "",
              strictReceiptId: receiptIdByHash.get(postResponseEvidence?.receiptHash || "") || "",
              strictRollOutcome: classEvidence.strictRollOutcome,
              massSemantics: "primary_chance_then_owned_response_then_conditional_post_response_chance",
            });
            chanceIds.add(chanceId);
            chanceContributionCount += 1;
          }
        }
      }
    }
  }

  const resumable = (report.labels || []).filter(resumableLabel).map((label) => ({
    schemaVersion: "warmachine_strict_frontier_in_flight_label_v1",
    reportHash: report.reportHash,
    labelId: labelIdByKey.get(label.labelKey) || "",
    labelKey: label.labelKey,
    stateId: stateIdByLabel.get(label.labelKey) || "",
    stateHash: label.stateHash,
    depth: label.depth,
    cursor: label.cursor,
    adversarialContextKey: label.adversarialContextKey,
    continuationKey: label.continuationKey,
    cumulativeProbability: label.cumulativeProbability,
    incomingProbabilityContributions: label.incomingProbabilityContributions,
    reason: label.reason,
  })).filter((entry) => entry.stateId);
  const unresolvedIds = new Set();
  for (const label of report.labels || []) {
    if (!["unresolved", "pruned_low_probability"].includes(label.status)) continue;
    unresolvedIds.add(persistVersionedContent("unresolved", {
      schemaVersion: "warmachine_strict_frontier_unresolved_payload_v2",
      labelId: labelIdByKey.get(label.labelKey) || "",
      stateId: stateIdByLabel.get(label.labelKey) || "",
      reason: label.reason,
      exactProbability: label.cumulativeProbability,
      mass: Number(label.cumulativeProbability?.decimal || 0),
      claimBoundary: "Budget and probability-threshold omissions remain unresolved route labels, not losses.",
    }));
  }

  const reportSnapshotPayload = {
    schemaVersion: "warmachine_strict_frontier_report_snapshot_v2",
    reportHash: report.reportHash,
    report: stableGraphValue(report),
    runtimeCheckpointManifest: stableGraphValue({
      ...runtimeCheckpoint,
      stateEntries: (runtimeCheckpoint.stateEntries || []).map(({ state: _state, ...entry }) => ({
        ...entry,
        stateId: stateIdByLabel.get(entry.labelKey) || "",
      })),
      receipts: (runtimeCheckpoint.receipts || []).map(({ receiptHash }) => ({
        receiptHash,
        receiptId: receiptIdByHash.get(receiptHash) || "",
      })),
    }),
    contentReferenceManifest: {
      schemaVersion: "warmachine_strict_frontier_content_reference_manifest_v1",
      contentIdsByKind: {
        label: Array.from(labelIdByKey.values()).sort(),
        edge: Array.from(edgeIdByKey.values()).sort(),
        chance: Array.from(chanceIds).sort(),
        unresolved: Array.from(unresolvedIds).sort(),
      },
    },
  };
  const reportSnapshot = writer.append("label", reportSnapshotPayload);
  if (!reportSnapshot.accepted) {
    throw new Error(`strict_frontier_report_snapshot_not_persisted:${reportSnapshot.unresolvedReason}`);
  }

  const segment = writer.seal();
  const merge = store.mergeInbox();
  const checkpoint = store.commitMerge(merge, {
    frontierRootIds: resumable.map((entry) => entry.stateId),
    inFlightLedger: [{
      schemaVersion: "warmachine_strict_frontier_checkpoint_root_v1",
      reportHash: report.reportHash,
      runtimeCheckpointHash: runtimeCheckpoint.checkpointHash,
      reportSnapshotId: reportSnapshot.id,
    }, ...resumable],
  });
  const recovery = store.recover();
  const resumableStateCount = new Set(resumable.map((entry) => entry.stateId)).size;
  const core = {
    schemaVersion: WARMACHINE_STRICT_FRONTIER_EXTERNAL_DAG_V1_SCHEMA,
    reportHash: report.reportHash,
    runtimeCheckpointHash: runtimeCheckpoint.checkpointHash,
    storeRootPath: store.rootPath,
    segmentId: segment.segmentId,
    checkpointId: checkpoint.checkpointId,
    parentCheckpointId: checkpoint.parentCheckpointId || "",
    generation: checkpoint.generation,
    stateCount: runtimeCheckpoint.stateEntries?.length || 0,
    newStateObjectCount: newStateById.size,
    labelCount: report.labels?.length || 0,
    edgeCount: report.edges?.length || 0,
    receiptCount: runtimeCheckpoint.receipts?.length || 0,
    newReceiptObjectCount: Array.from(receiptIdByHash.keys()).filter((receiptHash) =>
      !reusableReceiptIdByHash.has(receiptHash)).length,
    newVersionedContentObjectCounts: Object.fromEntries(
      ["label", "edge", "chance", "unresolved"].map((kind) => [
        kind,
        newContentObjectCountByKind.get(kind) || 0,
      ]),
    ),
    chanceContributionCount,
    reportSnapshotId: reportSnapshot.id,
    resumableLabelCount: resumable.length,
    resumableStateCount,
    frontierRootCount: checkpoint.frontierRootIds.length,
    recoveryOk: recoveryHealthy(recovery),
    externalDagCounts: {
      V: Number(checkpoint.counts?.state || 0),
      G: Number(checkpoint.stateProposalCount || 0),
      E: Number(checkpoint.counts?.edge || 0),
      L: Number(checkpoint.counts?.label || 0),
      C: Number(checkpoint.counts?.chance || 0),
      U: Number(checkpoint.counts?.unresolved || 0),
    },
    claimBoundary: "This adapter persists a completed V3 or stitched batch as immutable report metadata, canonical states, route labels, edges, original Chance contributions and full strict receipts. Recovery reconstructs the report/runtime pair plus every budget-deferred frontier identity; later generations retain their parent checkpoint rather than mutating prior evidence.",
  };
  return {
    ...core,
    persistenceHash: stableGraphHash(stableGraphValue(core)),
    ok: core.recoveryOk && core.resumableStateCount === core.frontierRootCount,
  };
}

export function restoreWarmachineStrictFrontierExternalDagV1(rootPath, rawOptions = {}) {
  const store = createWarmachineExternalDagStore(rootPath, {
    ...storeOptions(rawOptions),
    create: false,
  });
  const recovery = store.recover();
  if (!recoveryHealthy(recovery)) throw new Error("strict_frontier_external_dag_recovery_failed");
  const checkpoint = store.readCurrentCheckpoint();
  const checkpointRoot = (checkpoint?.inFlightLedger || []).find((entry) =>
    entry.schemaVersion === "warmachine_strict_frontier_checkpoint_root_v1") || null;
  const orderedInFlightEntries = (checkpoint?.inFlightLedger || []).filter((entry) =>
    entry.schemaVersion === "warmachine_strict_frontier_in_flight_label_v1")
    .slice().sort(canonicalFrontierEntryOrder);
  const lazyRuntimePayloads = rawOptions.lazyRuntimePayloads === true;
  const maximumEagerFrontierStates = lazyRuntimePayloads
    ? Math.max(0, Math.floor(Number(rawOptions.maximumEagerFrontierStates ?? 0)))
    : Number.POSITIVE_INFINITY;
  const eagerLabelKeys = new Set(orderedInFlightEntries
    .slice(0, maximumEagerFrontierStates).map((entry) => entry.labelKey));
  const restoredStateById = new Map();
  const restoredStateHashById = new Map();
  const restoreState = (stateId) => {
    if (!restoredStateById.has(stateId)) {
      restoredStateById.set(stateId, store.readState(stateId).value);
    }
    return restoredStateById.get(stateId);
  };
  const assertStateHash = (stateId, expectedStateHash, labelKey) => {
    const state = restoreState(stateId);
    if (!restoredStateHashById.has(stateId)) {
      restoredStateHashById.set(stateId, stableGraphHash(state));
    }
    if (restoredStateHashById.get(stateId) !== expectedStateHash) {
      throw new Error(`strict_frontier_restored_state_hash_mismatch:${labelKey}`);
    }
    return state;
  };
  let restoredReport = null;
  let restoredRuntimeCheckpoint = null;
  const stateIdByHash = new Map();
  const receiptIdByHash = new Map();
  const contentIdsByKind = {
    label: [],
    edge: [],
    chance: [],
    unresolved: [],
  };
  if (checkpointRoot?.reportSnapshotId) {
    const snapshot = store.readContent(checkpointRoot.reportSnapshotId).value;
    if (![
      "warmachine_strict_frontier_report_snapshot_v1",
      "warmachine_strict_frontier_report_snapshot_v2",
    ].includes(snapshot.schemaVersion) ||
        snapshot.reportHash !== checkpointRoot.reportHash ||
        snapshot.report?.reportHash !== snapshot.reportHash ||
        snapshot.runtimeCheckpointManifest?.checkpointHash !==
          checkpointRoot.runtimeCheckpointHash ||
        snapshot.runtimeCheckpointManifest?.reportHash !== snapshot.reportHash) {
      throw new Error("strict_frontier_report_snapshot_binding_mismatch");
    }
    let indexedContentIds = null;
    const ensureIndexedContentIds = () => {
      if (!indexedContentIds) {
        indexedContentIds = new Set(Array.from(store.contentRows(checkpoint), (row) => row.id));
      }
      return indexedContentIds;
    };
    const stateEntries = (snapshot.runtimeCheckpointManifest.stateEntries || []).map((entry) => {
      if (lazyRuntimePayloads && !ensureIndexedContentIds().has(entry.stateId)) {
        throw new Error(`strict_frontier_lazy_state_reference_missing:${entry.labelKey}`);
      }
      const existingStateId = stateIdByHash.get(entry.stateHash);
      if (existingStateId && existingStateId !== entry.stateId) {
        throw new Error(`strict_frontier_state_reference_conflict:${entry.stateHash}`);
      }
      stateIdByHash.set(entry.stateHash, entry.stateId);
      const { stateId: _stateId, ...metadata } = entry;
      if (lazyRuntimePayloads && !eagerLabelKeys.has(entry.labelKey)) return metadata;
      return { ...metadata, state: assertStateHash(entry.stateId, entry.stateHash, entry.labelKey) };
    });
    const receipts = (snapshot.runtimeCheckpointManifest.receipts || []).map((entry) => {
      receiptIdByHash.set(entry.receiptHash, entry.receiptId);
      if (lazyRuntimePayloads) {
        if (!ensureIndexedContentIds().has(entry.receiptId)) {
          throw new Error(`strict_frontier_lazy_receipt_reference_missing:${entry.receiptHash}`);
        }
        return { receiptHash: entry.receiptHash, receipt: null };
      }
      const receipt = store.readContent(entry.receiptId).value;
      if (String(receipt.receiptHash || "") !== entry.receiptHash) {
        throw new Error(`strict_frontier_snapshot_receipt_hash_mismatch:${entry.receiptHash}`);
      }
      return { receiptHash: entry.receiptHash, receipt };
    });
    restoredReport = snapshot.report;
    restoredRuntimeCheckpoint = {
      ...snapshot.runtimeCheckpointManifest,
      stateEntries,
      receipts,
    };
    if (snapshot.schemaVersion === "warmachine_strict_frontier_report_snapshot_v2") {
      const manifest = snapshot.contentReferenceManifest;
      if (manifest?.schemaVersion !==
          "warmachine_strict_frontier_content_reference_manifest_v1") {
        throw new Error("strict_frontier_content_reference_manifest_missing");
      }
      const indexedIds = ensureIndexedContentIds();
      for (const kind of Object.keys(contentIdsByKind)) {
        const ids = manifest.contentIdsByKind?.[kind];
        if (!Array.isArray(ids) || new Set(ids).size !== ids.length ||
            ids.some((id) => !String(id).startsWith(`${kind}:`) ||
              !indexedIds.has(id))) {
          throw new Error(`strict_frontier_content_reference_manifest_invalid:${kind}`);
        }
        contentIdsByKind[kind] = ids.slice().sort();
      }
    }
  }
  const entries = orderedInFlightEntries.map((entry) => {
    if (lazyRuntimePayloads && !eagerLabelKeys.has(entry.labelKey)) return { ...entry };
    return {
      ...entry,
      state: assertStateHash(entry.stateId, entry.stateHash, entry.labelKey),
    };
  });
  const core = {
    schemaVersion: "warmachine_strict_frontier_external_dag_restore_v1",
    checkpointId: checkpoint?.checkpointId || "",
    generation: checkpoint?.generation || 0,
    frontierRootIds: checkpoint?.frontierRootIds || [],
    entryCount: entries.length,
    reportHash: restoredReport?.reportHash || "",
    runtimeCheckpointHash: restoredRuntimeCheckpoint?.checkpointHash || "",
    reportSnapshotId: checkpointRoot?.reportSnapshotId || "",
    runtimePayloadMode: lazyRuntimePayloads ? "selected_frontier_eager" : "all_eager",
    eagerStateCount: restoredStateById.size,
    lazyStateCount: Math.max(0, stateIdByHash.size - restoredStateById.size),
    recoveryOk: recoveryHealthy(recovery),
  };
  const allEntriesBoundToFrontierRoots = entries.every((entry) =>
    core.frontierRootIds.includes(entry.stateId));
  const reusableContentReferences = {
    stateIdByHash: Object.fromEntries(Array.from(stateIdByHash.entries()).sort()),
    receiptIdByHash: Object.fromEntries(Array.from(receiptIdByHash.entries()).sort()),
    contentIdsByKind,
  };
  VERIFIED_REUSABLE_CONTENT_REFERENCES.add(reusableContentReferences);
  return {
    ...core,
    entries,
    report: restoredReport,
    runtimeCheckpoint: restoredRuntimeCheckpoint,
    reusableContentReferences,
    restoreHash: stableGraphHash(stableGraphValue({
      ...core,
      entries: entries.map(({ state, ...entry }) => ({
        ...entry,
        stateHash: entry.stateHash,
        stateLoaded: Boolean(state),
      })),
    })),
    ok: core.recoveryOk && allEntriesBoundToFrontierRoots &&
      Boolean(restoredReport) && Boolean(restoredRuntimeCheckpoint),
  };
}
