import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { normalizeRulesV1State } from "../warmachine-host-runtime.mjs";
import { enumerateWarmachineBenchmarkActionsV2 } from
  "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { generateWarmachineMovementActivationPredecessorsV1 } from
  "./movement-activation-predecessor-v1.mjs";
import { generateWarmachinePassActivationPredecessorsV1 } from
  "./pass-activation-predecessor-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";
import { warmachinePieceInPlayV1 } from "./piece-lifecycle-v1.mjs";

export const WARMACHINE_ACTIVATION_SEQUENCE_PREDECESSOR_V2_SCHEMA =
  "warmachine_activation_sequence_predecessor_v2";

function alive(piece = {}) {
  return warmachinePieceInPlayV1(piece);
}

function boundaryReached(state, sideKey) {
  return !(state.pieces || []).some((piece) =>
    alive(piece) && piece.sideKey === sideKey && piece.activated === true);
}

function inverseActivationGroups(state, sideKey) {
  const groups = new Map();
  for (const piece of state.pieces || []) {
    if (!alive(piece) || piece.sideKey !== sideKey || piece.activated !== true) continue;
    const groupKey = String(
      piece.unitGroupId || piece.unitId || piece.metadata?.unitGroupId ||
      piece.metadata?.unitId || piece.pieceKey,
    );
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(piece.pieceKey);
  }
  return [...groups.entries()].map(([groupKey, actorPieceKeys]) => ({
    groupKey,
    actorPieceKeys: actorPieceKeys.sort(),
  })).sort((left, right) => left.groupKey.localeCompare(right.groupKey));
}

function numeric(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function baseRadius(piece = {}) {
  return Math.max(0, numeric(piece.baseSizeIn ?? piece.baseDiameterIn, 1.18) / 2);
}

function deploymentZone(rawOptions = {}, sideKey = "") {
  const deployments = rawOptions.deployments || {};
  return sideKey === "player1"
    ? deployments.p1_deploy || deployments.player1 || null
    : deployments.p2_deploy || deployments.player2 || null;
}

export function warmachineDeploymentGeometryDebtV1(state = {}, rawOptions = {}) {
  const pieces = (state.pieces || []).filter(alive);
  let outsideDistance = 0;
  let overlapDepth = 0;
  for (const piece of pieces) {
    const zone = deploymentZone(rawOptions, piece.sideKey);
    if (!zone) continue;
    const radius = baseRadius(piece);
    const xMin = numeric(zone.x) - numeric(zone.width) / 2 + radius;
    const xMax = numeric(zone.x) + numeric(zone.width) / 2 - radius;
    const yMin = numeric(zone.y) - numeric(zone.height) / 2 + radius;
    const yMax = numeric(zone.y) + numeric(zone.height) / 2 - radius;
    const x = numeric(piece.position?.xIn);
    const y = numeric(piece.position?.yIn);
    outsideDistance += Math.max(0, xMin - x, x - xMax) +
      Math.max(0, yMin - y, y - yMax);
  }
  for (let leftIndex = 0; leftIndex < pieces.length; leftIndex += 1) {
    const left = pieces[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < pieces.length; rightIndex += 1) {
      const right = pieces[rightIndex];
      const separation = Math.hypot(
        numeric(left.position?.xIn) - numeric(right.position?.xIn),
        numeric(left.position?.yIn) - numeric(right.position?.yIn),
      );
      overlapDepth += Math.max(0, baseRadius(left) + baseRadius(right) - separation);
    }
  }
  return Math.round((outsideDistance + overlapDepth * 100) * 1_000_000) / 1_000_000;
}

function activationGroupGeometryDebt(state, group, rawOptions = {}) {
  const pieceKeys = new Set(group.actorPieceKeys || []);
  return warmachineDeploymentGeometryDebtV1({
    ...state,
    pieces: (state.pieces || []).filter((piece) => pieceKeys.has(piece.pieceKey)),
  }, rawOptions);
}

function edge(candidate = {}) {
  return {
    candidateKey: candidate.candidateKey,
    operatorKey: candidate.operatorKey,
    actorPieceKey: candidate.actorPieceKey,
    activationGroupPieceKeys: candidate.activationGroupPieceKeys || [candidate.actorPieceKey],
    activationGroupId: candidate.activationGroupId || "",
    actionType: candidate.actionType || "pass",
    predecessorStateHash: candidate.predecessorStateHash,
    successorStateHash: candidate.successorStateHash,
    transitionActionKey: candidate.transitionActionKey,
    strictReceiptHash: candidate.strictReceiptHash,
    strictStepReceiptHashes: candidate.strictStepReceiptHashes || [],
    strictReplaySteps: candidate.strictReplaySteps || [],
    movementProposal: candidate.movementProposal || null,
    mutation: candidate.mutation || null,
    resourceEnvelopeMode: String(candidate.resourceEnvelopeMode || ""),
    matchedProbability: candidate.matchedProbability || null,
    matchedProbabilityInterval: candidate.matchedProbabilityInterval || null,
    matchedProbabilityExact: candidate.matchedProbabilityExact === true,
    adversarialContextKey: String(candidate.adversarialContextKey || ""),
    provenance: candidate.provenance || null,
  };
}

function labelKey(stateHash, reverseEdges = []) {
  return `activation-reverse-label-${stableGraphHash({
    stateHash,
    edgeKeys: reverseEdges.map((row) => row.candidateKey),
  }, 32)}`;
}

export function reverseWarmachineActivationSequenceV2(
  successorStateInput = {},
  rawOptions = {},
) {
  const inputRoot = normalizeRulesV1State(successorStateInput);
  const sideKey = String(rawOptions.sideKey || inputRoot.activeSideKey || "");
  const rootEnumerationSkippedAtBoundary = boundaryReached(inputRoot, sideKey);
  const root = rootEnumerationSkippedAtBoundary
    ? inputRoot
    : enumerateWarmachineBenchmarkActionsV2(inputRoot).state;
  const maximumDepth = Math.max(0, Number(rawOptions.maximumDepth ?? root.pieces.length));
  const maximumLabels = Math.max(1, Number(rawOptions.maximumLabels ?? 10_000));
  const maximumUniqueStates = Math.max(1, Number(rawOptions.maximumUniqueStates ?? 10_000));
  const stopAfterBoundaryRouteCount = Math.max(
    0,
    Number(rawOptions.stopAfterBoundaryRouteCount ?? 0),
  );
  const maximumGroupsPerExpansion = Math.max(
    0,
    Math.floor(numeric(rawOptions.maximumGroupsPerExpansion, 0)),
  );
  const maximumCandidatesPerExpansion = Math.max(
    0,
    Math.floor(numeric(rawOptions.maximumCandidatesPerExpansion, 0)),
  );
  const groupOrderIndex = new Map((rawOptions.groupOrderKeys || [])
    .map(String).map((groupKey, index) => [groupKey, index]));
  const frontierOrder = rawOptions.frontierOrder === "best_first_to_deployment"
    ? "best_first_to_deployment"
    : "breadth_first_by_activation_depth";
  const rootStateHash = warmachineReverseStateSemanticHashV1(root);
  const queue = [{
    labelKey: labelKey(rootStateHash, []),
    state: root,
    stateHash: rootStateHash,
    depth: 0,
    reverseEdges: [],
  }];
  const labelKeys = new Set(queue.map((row) => row.labelKey));
  const uniqueStateHashes = new Set([rootStateHash]);
  const boundaryLabels = [];
  const unresolved = [];
  const rejected = [];
  const expansionCache = new Map();
  const expansionLedgeredStateHashes = new Set();
  let expandedLabelCount = 0;
  let generatedEdgeCount = 0;
  const emitProgress = (stage, detail = {}) => rawOptions.onProgress?.({
    schemaVersion: "warmachine_activation_sequence_predecessor_progress_v1",
    stage,
    sideKey,
    rootStateHash,
    routeLabelCount: labelKeys.size,
    uniqueStateCount: uniqueStateHashes.size,
    expandedLabelCount,
    generatedEdgeCount,
    boundaryRouteCount: boundaryLabels.length,
    queuedLabelCount: queue.length,
    ...detail,
  });
  const takeNextLabel = () => {
    if (frontierOrder !== "best_first_to_deployment") return queue.shift() || null;
    let bestIndex = 0;
    for (let index = 1; index < queue.length; index += 1) {
      const candidate = queue[index];
      const currentBest = queue[bestIndex];
      const candidateDebt = warmachineDeploymentGeometryDebtV1(candidate.state, rawOptions);
      const bestDebt = warmachineDeploymentGeometryDebtV1(currentBest.state, rawOptions);
      const candidateBeforeBest = candidate.depth > currentBest.depth ||
        (candidate.depth === currentBest.depth &&
          (candidateDebt < bestDebt ||
            (candidateDebt === bestDebt && candidate.labelKey < currentBest.labelKey)));
      if (candidateBeforeBest) bestIndex = index;
    }
    return queue.splice(bestIndex, 1)[0] || null;
  };
  while (queue.length) {
    const current = takeNextLabel();
    if (!current) break;
    if (boundaryReached(current.state, sideKey)) {
      boundaryLabels.push(current);
      emitProgress("activation_boundary_reached", {
        labelKey: current.labelKey,
        stateHash: current.stateHash,
        depth: current.depth,
      });
      if (stopAfterBoundaryRouteCount > 0 &&
          boundaryLabels.length >= stopAfterBoundaryRouteCount) {
        unresolved.push(...queue.splice(0).map((row) => ({
          labelKey: row.labelKey,
          stateHash: row.stateHash,
          depth: row.depth,
          reason: "activation_reverse_boundary_witness_budget_deferred",
        })));
        break;
      }
      continue;
    }
    if (current.depth >= maximumDepth) {
      unresolved.push({
        labelKey: current.labelKey,
        stateHash: current.stateHash,
        depth: current.depth,
        reason: "activation_reverse_depth_budget_exhausted",
      });
      continue;
    }
    let expansion = expansionCache.get(current.stateHash);
    if (!expansion) {
      const inverseGroups = inverseActivationGroups(current.state, sideKey);
      const orderedGroups = inverseGroups.slice().sort((left, right) => {
        const leftOrder = groupOrderIndex.has(left.groupKey)
          ? groupOrderIndex.get(left.groupKey)
          : Number.POSITIVE_INFINITY;
        const rightOrder = groupOrderIndex.has(right.groupKey)
          ? groupOrderIndex.get(right.groupKey)
          : Number.POSITIVE_INFINITY;
        return leftOrder - rightOrder ||
          activationGroupGeometryDebt(current.state, right, rawOptions) -
            activationGroupGeometryDebt(current.state, left, rawOptions) ||
          left.groupKey.localeCompare(right.groupKey);
      });
      const selectedGroups = maximumGroupsPerExpansion > 0
        ? orderedGroups.slice(0, maximumGroupsPerExpansion)
        : orderedGroups;
      const omittedGroups = maximumGroupsPerExpansion > 0
        ? orderedGroups.slice(maximumGroupsPerExpansion)
        : [];
      const scopedActorPieceKeys = selectedGroups.flatMap((group) =>
        group.actorPieceKeys);
      emitProgress("activation_expansion_started", {
        labelKey: current.labelKey,
        stateHash: current.stateHash,
        depth: current.depth,
        availableGroupCount: orderedGroups.length,
        selectedGroups: stableGraphValue(selectedGroups),
        omittedGroupCount: omittedGroups.length,
      });
      const pass = rawOptions.includePass === false
        ? { candidates: [], rejected: [], unresolved: [] }
        : generateWarmachinePassActivationPredecessorsV1(current.state, {
          sideKey,
          actorPieceKeys: scopedActorPieceKeys,
          maximumActorCandidates: rawOptions.maximumPassActorsPerExpansion,
          queryKey: `${rawOptions.queryKey || "activation-v2"}:pass:${current.stateHash}`,
        });
      const movement = rawOptions.includeMovement === false
        ? { candidates: [], rejected: [], unresolved: [] }
        : generateWarmachineMovementActivationPredecessorsV1(current.state, {
          sideKey,
          actorPieceKeys: scopedActorPieceKeys,
          deployments: rawOptions.deployments,
          actionTypes: rawOptions.movementActionTypes,
          originProposals: rawOptions.originProposals,
          deploymentSlotGapIn: rawOptions.deploymentSlotGapIn,
          maximumDeploymentSlotOrigins: rawOptions.maximumDeploymentSlotOrigins,
          maximumDeploymentSlotRings: rawOptions.maximumDeploymentSlotRings,
          rejectedAuditLimit: rawOptions.rejectedAuditLimit,
          queryKey: `${rawOptions.queryKey || "activation-v2"}:movement:${current.stateHash}`,
        });
      const orderedCandidates = [...pass.candidates, ...movement.candidates].sort((left, right) =>
          warmachineDeploymentGeometryDebtV1(left.predecessorState, rawOptions) -
            warmachineDeploymentGeometryDebtV1(right.predecessorState, rawOptions) ||
          left.candidateKey.localeCompare(right.candidateKey));
      const candidates = maximumCandidatesPerExpansion > 0
        ? orderedCandidates.slice(0, maximumCandidatesPerExpansion)
        : orderedCandidates;
      const omittedCandidates = maximumCandidatesPerExpansion > 0
        ? orderedCandidates.slice(maximumCandidatesPerExpansion)
        : [];
      expansion = {
        candidates,
        rejected: [...(pass.rejected || []), ...(movement.rejected || [])],
        unresolved: [
          ...(pass.unresolved || []),
          ...(movement.unresolved || []),
          ...omittedGroups.map((group) => ({
            reason: "activation_reverse_group_order_budget_deferred",
            groupKey: group.groupKey,
            actorPieceKeys: group.actorPieceKeys,
          })),
          ...omittedCandidates.map((candidate) => ({
            reason: "activation_reverse_candidate_budget_deferred",
            candidateKey: candidate.candidateKey,
            actorPieceKey: candidate.actorPieceKey,
            operatorKey: candidate.operatorKey,
            predecessorStateHash: candidate.predecessorStateHash,
          })),
        ],
      };
      emitProgress("activation_expansion_ready", {
        labelKey: current.labelKey,
        stateHash: current.stateHash,
        depth: current.depth,
        selectedGroups: stableGraphValue(selectedGroups),
        candidateCount: candidates.length,
        rejectedCount: expansion.rejected.length,
        unresolvedCount: expansion.unresolved.length,
        unresolvedReasons: [...new Set(expansion.unresolved.map((row) =>
          row.reason || "activation_inverse_branch_unresolved"))].sort(),
      });
      expansionCache.set(current.stateHash, expansion);
    }
    if (!expansionLedgeredStateHashes.has(current.stateHash)) {
      expansionLedgeredStateHashes.add(current.stateHash);
      rejected.push(...expansion.rejected.map((row) => stableGraphValue({
        stateHash: current.stateHash,
        depth: current.depth,
        detail: row,
      })));
      unresolved.push(...expansion.unresolved.map((row) => stableGraphValue({
        labelKey: current.labelKey,
        stateHash: current.stateHash,
        depth: current.depth,
        reason: row.reason || "activation_inverse_branch_unresolved",
        detail: row,
      })));
    }
    expandedLabelCount += 1;
    if (!expansion.candidates.length) {
      unresolved.push({
        labelKey: current.labelKey,
        stateHash: current.stateHash,
        depth: current.depth,
        reason: "activation_inverse_family_not_available",
        rejected: stableGraphValue(expansion.rejected),
        unresolved: stableGraphValue(expansion.unresolved),
      });
      continue;
    }
    for (const candidate of expansion.candidates) {
      generatedEdgeCount += 1;
      const reverseEdges = [...current.reverseEdges, edge(candidate)];
      const nextLabelKey = labelKey(candidate.predecessorStateHash, reverseEdges);
      if (labelKeys.has(nextLabelKey)) continue;
      if (labelKeys.size >= maximumLabels) {
        unresolved.push({
          labelKey: nextLabelKey,
          stateHash: candidate.predecessorStateHash,
          depth: current.depth + 1,
          reason: "activation_reverse_label_budget_exhausted",
        });
        continue;
      }
      if (!uniqueStateHashes.has(candidate.predecessorStateHash) &&
          uniqueStateHashes.size >= maximumUniqueStates) {
        unresolved.push({
          labelKey: nextLabelKey,
          stateHash: candidate.predecessorStateHash,
          depth: current.depth + 1,
          reason: "activation_reverse_unique_state_budget_exhausted",
        });
        continue;
      }
      labelKeys.add(nextLabelKey);
      uniqueStateHashes.add(candidate.predecessorStateHash);
      queue.push({
        labelKey: nextLabelKey,
        state: candidate.predecessorState,
        stateHash: candidate.predecessorStateHash,
        depth: current.depth + 1,
        reverseEdges,
      });
    }
  }
  emitProgress("activation_reverse_complete");
  for (const boundary of boundaryLabels) {
    boundary.deploymentGeometryDebt = warmachineDeploymentGeometryDebtV1(
      boundary.state,
      rawOptions,
    );
  }
  boundaryLabels.sort((left, right) =>
    right.deploymentGeometryDebt - left.deploymentGeometryDebt ||
    left.labelKey.localeCompare(right.labelKey));
  const core = {
    schemaVersion: WARMACHINE_ACTIVATION_SEQUENCE_PREDECESSOR_V2_SCHEMA,
    sideKey,
    rootStateHash,
    rootEnumerationSkippedAtBoundary,
    uniqueStateCount: uniqueStateHashes.size,
    routeLabelCount: labelKeys.size,
    expandedLabelCount,
    generatedEdgeCount,
    boundaryStateCount: new Set(boundaryLabels.map((row) => row.stateHash)).size,
    boundaryRouteCount: boundaryLabels.length,
    strictRejectedCount: rejected.length,
    unresolvedCount: unresolved.length,
    boundaries: boundaryLabels.map((row) => ({
      labelKey: row.labelKey,
      stateKey: String(row.state.stateKey || ""),
      stateHash: row.stateHash,
      reverseDepth: row.depth,
      deploymentGeometryDebt: row.deploymentGeometryDebt,
      reverseEdges: stableGraphValue(row.reverseEdges),
    })),
    unresolved: stableGraphValue(unresolved),
    rejected: stableGraphValue(rejected),
    budgets: {
      maximumDepth,
      maximumLabels,
      maximumUniqueStates,
      stopAfterBoundaryRouteCount,
      frontierOrder,
      maximumGroupsPerExpansion,
      maximumCandidatesPerExpansion,
      maximumPassActorsPerExpansion: Math.max(0, Math.floor(numeric(
        rawOptions.maximumPassActorsPerExpansion,
        0,
      ))),
      groupOrderKeys: [...groupOrderIndex.keys()],
    },
    claimBoundary: "Pass and movement are peer inverse activation families. Distinct activation orders remain distinct route labels even when their clean rules states converge; expansion results may be memoized by exact state only. Every budget omission and unsupported attack/spell/resource/trigger activation remains unresolved.",
  };
  return {
    ...core,
    runtimeBoundaries: boundaryLabels,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: boundaryLabels.length > 0,
  };
}
