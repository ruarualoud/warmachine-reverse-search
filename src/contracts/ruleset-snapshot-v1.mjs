import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { buildWarmachineTypedInteractionGraphV2 } from "../graph/typed-interaction-graph-v2.mjs";
import { buildWarmachineRosterSourceProjectionV2 } from
  "../graph/capability-query-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { buildWarmachineReversePrimitiveContractRegistry } from
  "../reverse/primitive-contracts-v1.mjs";
import {
  resolveWarmachineHostPath,
  buildWarmachineRulesV1StateFromLayer3Room,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { warmachineRulesetBaselineV1 } from "./ruleset-baseline-v1.mjs";

export const WARMACHINE_RULESET_SNAPSHOT_V1_SCHEMA =
  "warmachine_ruleset_snapshot_v1";

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readJsonWithHash(relativePath) {
  const absolutePath = resolveWarmachineHostPath(relativePath);
  const bytes = readFileSync(absolutePath);
  return {
    relativePath,
    absolutePath,
    contentHash: sha256Bytes(bytes),
    value: JSON.parse(bytes),
  };
}

function compareExpected(expected, observed, prefix = "") {
  const differences = [];
  if (Array.isArray(expected)) {
    if (JSON.stringify(expected) !== JSON.stringify(observed)) {
      differences.push({ path: prefix, expected, observed });
    }
    return differences;
  }
  if (expected && typeof expected === "object") {
    for (const [key, expectedValue] of Object.entries(expected)) {
      const path = prefix ? `${prefix}.${key}` : key;
      differences.push(...compareExpected(expectedValue, observed?.[key], path));
    }
    return differences;
  }
  if (expected !== observed) differences.push({ path: prefix, expected, observed });
  return differences;
}

export function compareWarmachineRulesetBaselineV1(
  observed = {},
  expected = warmachineRulesetBaselineV1,
) {
  const expectedObservedShape = {
    host: expected.host,
    reverseRegistry: expected.reverseRegistry,
    interactionGraph: expected.interactionGraph,
    fixedRosterProjection: expected.fixedRosterProjection,
    cardData: expected.cardData,
    constructionPool: expected.constructionPool,
  };
  const differences = compareExpected(expectedObservedShape, observed);
  const core = {
    schemaVersion: "warmachine_ruleset_baseline_comparison_v1",
    baselineKey: String(expected.baselineKey || ""),
    compatible: differences.length === 0,
    differenceCount: differences.length,
    differences: stableGraphValue(differences),
    reviewRequired: differences.length > 0 && expected.reviewRequiredOnMismatch !== false,
    checkpointResumeAllowed: differences.length === 0,
    priorCalibrationUsable: differences.length === 0,
    priorTrainingMaterialCurrent: differences.length === 0,
  };
  return { ...core, comparisonHash: stableGraphHash(core) };
}

export function buildWarmachineRulesetSnapshotV1(rawOptions = {}) {
  const baseline = rawOptions.baseline || warmachineRulesetBaselineV1;
  const registry = buildWarmachineReversePrimitiveContractRegistry();
  const graph = buildWarmachineTypedInteractionGraphV2();
  const primary = readJsonWithHash(baseline.cardData.primaryRelativePath);
  const mirror = readJsonWithHash(baseline.cardData.mirrorRelativePath);
  const constructionPool = readJsonWithHash(baseline.constructionPool.relativePath);
  const fixedRosterRoom = readJsonWithHash(baseline.fixtures.fixedRosterRoomRelativePath);
  const fixedRosterRoomValue = Object.values(fixedRosterRoom.value.roomsById || {})[0];
  const fixedRosterState = buildWarmachineRulesV1StateFromLayer3Room(fixedRosterRoomValue, {
    strictMode: true,
    enforceStrictExecutor: true,
  });
  const fixedRosterProjection = buildWarmachineRosterSourceProjectionV2(
    fixedRosterState,
    graph,
  );
  const cardRemoteVersion = String(
    primary.value.source?.remoteVersion || primary.value.remoteVersion || "",
  );
  const observed = {
    host: {
      sourceHashes: warmachineHost.receipt.sourceHashes,
      atomCount: registry.counts.atomCount,
      hookOperatorCount: registry.counts.hookOperatorCount,
      steamroller2026ScenarioCount: warmachineHost.steamroller
        .steamroller2026ScenarioProfiles().length,
    },
    reverseRegistry: registry.counts,
    interactionGraph: Object.fromEntries(
      Object.keys(baseline.interactionGraph).map((key) => [key, graph.counts[key]]),
    ),
    fixedRosterProjection: stableGraphValue(rawOptions.fixedRosterProjection ||
      fixedRosterProjection.counts),
    cardData: {
      primaryRelativePath: primary.relativePath,
      mirrorRelativePath: mirror.relativePath,
      contentHash: primary.contentHash,
      remoteVersion: cardRemoteVersion,
      cardCount: Number(primary.value.stats?.cardCount || 0),
      armyCount: Number(primary.value.stats?.armyCount || 0),
      factionCount: Number(primary.value.stats?.factionCount || 0),
    },
    constructionPool: {
      relativePath: constructionPool.relativePath,
      contentHash: constructionPool.contentHash,
      schemaVersion: String(constructionPool.value.schemaVersion || ""),
      remoteVersion: String(constructionPool.value.source?.remoteVersion || ""),
      exactListLegality: constructionPool.value.quality?.exactListLegality === true,
    },
  };
  const comparison = compareWarmachineRulesetBaselineV1(observed, baseline);
  const semanticCore = {
    baselineKey: baseline.baselineKey,
    observed,
    mirrorContentHash: mirror.contentHash,
    cardDataMirrorsMatch: mirror.contentHash === primary.contentHash,
    reverseRegistryHash: stableGraphHash(registry),
    semanticGraphHash: stableGraphHash({
      schemaVersion: graph.schemaVersion,
      counts: graph.counts,
      nodes: graph.nodes,
      edges: graph.edges,
      indexes: graph.indexes,
    }),
  };
  const core = {
    schemaVersion: WARMACHINE_RULESET_SNAPSHOT_V1_SCHEMA,
    baselineKey: baseline.baselineKey,
    authorityReceiptHash: warmachineHost.receipt.receiptHash,
    authorityGitRevision: warmachineHost.receipt.gitRevision,
    authorityTrackedWorktreeDirty: warmachineHost.receipt.trackedWorktreeDirty,
    observed,
    cardDataMirror: {
      primaryContentHash: primary.contentHash,
      mirrorContentHash: mirror.contentHash,
      matches: mirror.contentHash === primary.contentHash,
    },
    reverseRegistryHash: semanticCore.reverseRegistryHash,
    semanticGraphHash: semanticCore.semanticGraphHash,
    semanticRulesetHash: stableGraphHash(semanticCore),
    baselineComparison: comparison,
    current: comparison.compatible && mirror.contentHash === primary.contentHash &&
      graph.validation.structuralOk,
    checkpointResumeAllowed: comparison.checkpointResumeAllowed &&
      mirror.contentHash === primary.contentHash && graph.validation.structuralOk,
    priorCalibrationUsable: comparison.priorCalibrationUsable &&
      mirror.contentHash === primary.contentHash && graph.validation.structuralOk,
    priorTrainingMaterialCurrent: comparison.priorTrainingMaterialCurrent &&
      mirror.contentHash === primary.contentHash && graph.validation.structuralOk,
    failClosedReasons: [
      ...comparison.differences.map((difference) => `baseline_drift:${difference.path}`),
      ...(mirror.contentHash === primary.contentHash ? [] : ["card_data_mirror_hash_mismatch"]),
      ...(graph.validation.structuralOk ? [] : ["interaction_graph_structural_validation_failed"]),
    ].sort(),
    claimBoundary: "This composite snapshot binds strict rules sources, card data, atom and reverse registries, the semantic interaction graph and the construction pool. Any mismatch invalidates checkpoint resume, prior direction calibration and current training-material claims until reviewed and re-signed.",
  };
  return { ...core, snapshotHash: stableGraphHash(core) };
}
