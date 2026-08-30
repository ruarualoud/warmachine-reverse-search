import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { buildWarmachineSearchSourceReceiptV1 } from
  "../contracts/search-execution-receipt-v1.mjs";
import { normalizeRulesV1State } from "../warmachine-host-runtime.mjs";
import { enumerateWarmachineBenchmarkActionsV2 } from
  "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { generateWarmachineMovementActivationPredecessorsV1 } from
  "./movement-activation-predecessor-v1.mjs";
import { generateWarmachineChargeCombatActivationPredecessorsV1 } from
  "./charge-combat-activation-predecessor-v1.mjs";
import { generateWarmachinePassActivationPredecessorsV1 } from
  "./pass-activation-predecessor-v1.mjs";
import {
  auditWarmachineReverseStateBoundaryV1,
  summarizeWarmachineReverseStateBoundaryAuditV1,
} from "./reverse-state-invariants-v1.mjs";
import {
  auditWarmachineDeclaredMovementDeploymentReachabilityLowerBoundV1,
  auditWarmachineSideDeploymentGeometryV1,
} from
  "./deployment-reachability-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";
import { warmachinePieceInPlayV1 } from "./piece-lifecycle-v1.mjs";

export const WARMACHINE_ACTIVATION_SEQUENCE_PREDECESSOR_V2_SCHEMA =
  "warmachine_activation_sequence_predecessor_v2";
export const WARMACHINE_ACTIVATION_SEQUENCE_RESUME_CHECKPOINT_V1_SCHEMA =
  "warmachine_activation_sequence_resume_checkpoint_v1";

export const WARMACHINE_ACTIVATION_SEQUENCE_SEARCH_SOURCE_RECEIPT_V1 =
  buildWarmachineSearchSourceReceiptV1({
    entryRelativePaths: ["src/reverse/activation-sequence-predecessor-v2.mjs"],
  });

const ACTIVATION_RESUME_OPTION_EXCLUSIONS = new Set([
  "onCheckpoint",
  "onProgress",
  "resumeCheckpoint",
  "resumeCheckpoints",
]);

function activationResumeOptions(rawOptions = {}) {
  return stableGraphValue(Object.fromEntries(Object.entries(rawOptions).filter(([
    key,
    value,
  ]) => !ACTIVATION_RESUME_OPTION_EXCLUSIONS.has(key) &&
    typeof value !== "function")));
}

function activationResumeContractHash(rootStateHash, sideKey, rawOptions = {}) {
  return stableGraphHash(stableGraphValue({
    schemaVersion: WARMACHINE_ACTIVATION_SEQUENCE_RESUME_CHECKPOINT_V1_SCHEMA,
    searchSourceClosureHash:
      WARMACHINE_ACTIVATION_SEQUENCE_SEARCH_SOURCE_RECEIPT_V1.sourceClosureHash,
    rootStateHash,
    sideKey,
    options: activationResumeOptions(rawOptions),
  }));
}

function activationCheckpointLabel(row = {}) {
  return stableGraphValue({
    labelKey: String(row.labelKey || ""),
    state: row.state,
    stateHash: String(row.stateHash || ""),
    depth: Number(row.depth || 0),
    reverseEdges: row.reverseEdges || [],
  });
}

export function buildWarmachineActivationSequenceResumeCheckpointV1({
  rootStateHash = "",
  sideKey = "",
  rawOptions = {},
  queue = [],
  boundaryLabels = [],
  labelKeys = [],
  uniqueStateHashes = [],
  expansionLedgeredStateHashes = [],
  unresolved = [],
  rejected = [],
  expandedLabelCount = 0,
  generatedEdgeCount = 0,
} = {}) {
  const resumeContractHash = activationResumeContractHash(
    rootStateHash,
    sideKey,
    rawOptions,
  );
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_ACTIVATION_SEQUENCE_RESUME_CHECKPOINT_V1_SCHEMA,
    searchSourceClosureHash:
      WARMACHINE_ACTIVATION_SEQUENCE_SEARCH_SOURCE_RECEIPT_V1.sourceClosureHash,
    rootStateHash: String(rootStateHash || ""),
    sideKey: String(sideKey || ""),
    resumeContractHash,
    resumeKey: `activation-sequence-resume-${stableGraphHash({
      rootStateHash,
      sideKey,
      resumeContractHash,
    }, 32)}`,
    queue: queue.map(activationCheckpointLabel),
    boundaryLabels: boundaryLabels.map(activationCheckpointLabel),
    labelKeys: [...labelKeys].map(String).sort(),
    uniqueStateHashes: [...uniqueStateHashes].map(String).sort(),
    expansionLedgeredStateHashes:
      [...expansionLedgeredStateHashes].map(String).sort(),
    unresolved,
    rejected,
    expandedLabelCount: Number(expandedLabelCount || 0),
    generatedEdgeCount: Number(generatedEdgeCount || 0),
  });
  return {
    ...core,
    checkpointHash: stableGraphHash(core),
  };
}

export function auditWarmachineActivationSequenceResumeCheckpointV1(
  checkpoint = {},
  {
    rootStateHash = "",
    sideKey = "",
    rawOptions = {},
  } = {},
) {
  const issues = [];
  const expectedContractHash = activationResumeContractHash(
    rootStateHash,
    sideKey,
    rawOptions,
  );
  if (checkpoint.schemaVersion !==
      WARMACHINE_ACTIVATION_SEQUENCE_RESUME_CHECKPOINT_V1_SCHEMA) {
    issues.push("activation_resume_checkpoint_schema_mismatch");
  }
  if (checkpoint.rootStateHash !== rootStateHash) {
    issues.push("activation_resume_checkpoint_root_state_mismatch");
  }
  if (checkpoint.searchSourceClosureHash !==
      WARMACHINE_ACTIVATION_SEQUENCE_SEARCH_SOURCE_RECEIPT_V1.sourceClosureHash) {
    issues.push("activation_resume_checkpoint_source_drift");
  }
  if (checkpoint.sideKey !== sideKey) {
    issues.push("activation_resume_checkpoint_side_mismatch");
  }
  if (checkpoint.resumeContractHash !== expectedContractHash) {
    issues.push("activation_resume_checkpoint_contract_mismatch");
  }
  const { checkpointHash: _checkpointHash, ...checkpointCore } = checkpoint;
  if (stableGraphHash(stableGraphValue(checkpointCore)) !==
      checkpoint.checkpointHash) {
    issues.push("activation_resume_checkpoint_hash_mismatch");
  }
  const checkpointLabelKeys = new Set(checkpoint.labelKeys || []);
  const checkpointStateHashes = new Set(checkpoint.uniqueStateHashes || []);
  const rows = [
    ...(Array.isArray(checkpoint.queue) ? checkpoint.queue : []),
    ...(Array.isArray(checkpoint.boundaryLabels)
      ? checkpoint.boundaryLabels
      : []),
  ];
  for (const row of rows) {
    const actualStateHash = warmachineReverseStateSemanticHashV1(row.state);
    if (actualStateHash !== row.stateHash) {
      issues.push("activation_resume_checkpoint_state_hash_mismatch");
    }
    if (labelKey(row.stateHash, row.reverseEdges || []) !== row.labelKey) {
      issues.push("activation_resume_checkpoint_label_binding_mismatch");
    }
    if (!checkpointLabelKeys.has(row.labelKey)) {
      issues.push("activation_resume_checkpoint_label_set_incomplete");
    }
    if (!checkpointStateHashes.has(row.stateHash)) {
      issues.push("activation_resume_checkpoint_state_set_incomplete");
    }
  }
  for (const stateHash of checkpoint.expansionLedgeredStateHashes || []) {
    if (!checkpointStateHashes.has(stateHash)) {
      issues.push("activation_resume_checkpoint_ledger_state_unknown");
    }
  }
  return stableGraphValue({
    ok: issues.length === 0,
    issues: [...new Set(issues)],
    checkpointHash: String(checkpoint.checkpointHash || ""),
    resumeKey: String(checkpoint.resumeKey || ""),
    queuedLabelCount: Array.isArray(checkpoint.queue)
      ? checkpoint.queue.length
      : 0,
  });
}

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

function activationGroupControlResourceDependencyRank(
  state,
  group,
  rawOptions = {},
) {
  if (rawOptions.prioritizeControlResourceDependencies !== true) return 0;
  const actorPieceKeys = new Set(group.actorPieceKeys || []);
  const members = (state.pieces || []).filter((piece) =>
    actorPieceKeys.has(piece.pieceKey));
  const includesController = members.some((piece) =>
    piece.isWarcaster === true || piece.isWarlock === true ||
    piece.isInfernalMaster === true || piece.canAllocateFocus === true ||
    piece.canLeechFury === true);
  if (includesController) return 0;
  const includesControlledCohort = members.some((piece) =>
    (piece.isWarjack === true || piece.isWarbeast === true) &&
    Boolean(piece.controllerPieceKey || piece.battlegroupControllerPieceKey ||
      piece.metadata?.controllerPieceKey));
  return includesControlledCohort ? 1 : 2;
}

function candidateActor(candidate = {}) {
  return (candidate.predecessorState?.pieces || []).find((piece) =>
    piece.pieceKey === candidate.actorPieceKey) || null;
}

function actorWithinControllerControlRange(candidate = {}) {
  const actor = candidateActor(candidate);
  if (!actor) return false;
  const controllerPieceKey = String(actor.controllerPieceKey ||
    actor.battlegroupControllerPieceKey || actor.metadata?.controllerPieceKey || "");
  const controller = (candidate.predecessorState?.pieces || []).find((piece) =>
    piece.pieceKey === controllerPieceKey && alive(piece));
  if (!controller) return false;
  const controlRangeIn = Math.max(0, numeric(
    controller.controlRangeIn ?? controller.ctrl,
    numeric(controller.arc) * 2,
  ));
  const closestDistanceIn = Math.max(0,
    Math.hypot(
      numeric(actor.position?.xIn) - numeric(controller.position?.xIn),
      numeric(actor.position?.yIn) - numeric(controller.position?.yIn),
    ) - baseRadius(actor) - baseRadius(controller));
  return closestDistanceIn <= controlRangeIn + 0.001;
}

function activationCandidateControlResourceDependencyRank(
  candidate,
  rawOptions = {},
) {
  if (rawOptions.prioritizeControlResourceDependencies !== true) return 0;
  if ([
    "resource_prefix_movement_activation_inverse_v1",
    "movement_resource_suffix_activation_inverse_v1",
  ].includes(candidate.operatorKey)) return 0;
  const actor = candidateActor(candidate);
  const controlledCohort = Boolean(actor) &&
    (actor.isWarjack === true || actor.isWarbeast === true) &&
    Boolean(actor.controllerPieceKey || actor.battlegroupControllerPieceKey ||
      actor.metadata?.controllerPieceKey);
  if (!controlledCohort) return 1;
  if (candidate.movementProposal?.relationKind ===
      "controller_control_range_power_up_avoidance_origin") return 0;
  const restoredResourcePoints = Number(
    candidate.reverseRestoredResourcePoints || 0,
  );
  if (restoredResourcePoints !== 0 &&
      actorWithinControllerControlRange(candidate)) return 0;
  if (candidate.operatorKey === "pass_activation_inverse_v1") return 2;
  return restoredResourcePoints !== 0 ? 3 : 1;
}

function completeBaseDistanceFromOwnEdge(state = {}, piece = {}, edgeKey = "") {
  const radius = baseRadius(piece);
  if (edgeKey === "south") return numeric(piece.position?.yIn) + radius;
  if (edgeKey === "north") {
    return numeric(state.board?.heightIn, 48) -
      numeric(piece.position?.yIn) + radius;
  }
  if (edgeKey === "west") return numeric(piece.position?.xIn) + radius;
  if (edgeKey === "east") {
    return numeric(state.board?.widthIn, 48) -
      numeric(piece.position?.xIn) + radius;
  }
  return Number.NEGATIVE_INFINITY;
}

function predecessorStateObligationViolations(state = {}, rawOptions = {}) {
  const violations = [];
  for (const obligation of rawOptions.predecessorStateObligations || []) {
    if (obligation.obligationKind !==
        "leader_outside_killbox_before_first_penalty") continue;
    const leader = (state.pieces || []).find((piece) =>
      piece.pieceKey === obligation.leaderPieceKey && alive(piece));
    const observedDistanceIn = leader
      ? completeBaseDistanceFromOwnEdge(
        state,
        leader,
        obligation.ownTableEdgeKey,
      )
      : Number.NEGATIVE_INFINITY;
    if (observedDistanceIn > numeric(obligation.killBoxDistanceIn, 12) + 0.001) {
      continue;
    }
    violations.push(stableGraphValue({
      ...obligation,
      reason: leader
        ? "leader_still_inside_killbox"
        : "leader_preimage_missing_or_not_in_play",
      observedCompleteBaseDistanceFromOwnEdgeIn:
        Number.isFinite(observedDistanceIn) ? observedDistanceIn : null,
    }));
  }
  return violations;
}

function activationBoundaryStateObligationViolations(
  state = {},
  rawOptions = {},
) {
  const violations = predecessorStateObligationViolations(state, rawOptions);
  for (const obligation of rawOptions.activationBoundaryStateObligations || []) {
    if (obligation.obligationKind === "side_legal_deployment_geometry") {
      const audit = auditWarmachineSideDeploymentGeometryV1(state, {
        sideKey: obligation.sideKey,
        deployments: rawOptions.deployments,
      });
      if (audit.ok) continue;
      violations.push(stableGraphValue({
        ...obligation,
        reason: "side_legal_deployment_geometry_unsatisfied",
        failedChecks: audit.failedChecks,
        deploymentFailedChecks: audit.deploymentAudit?.failedChecks || [],
        baseOutliers: audit.deploymentAudit?.baseOutliers || [],
        overlapPairs: audit.deploymentAudit?.overlapPairs || [],
        disconnectedUnitGroups:
          audit.deploymentAudit?.disconnectedUnitGroups || [],
        attachmentDistanceOutliers:
          audit.deploymentAudit?.attachmentDistanceOutliers || [],
        crossSideOverlapPairs: audit.crossSideOverlapPairs || [],
        auditHash: audit.auditHash,
      }));
      continue;
    }
    if (obligation.obligationKind ===
        "declared_movement_deployment_reachability_lower_bound") {
      const audit =
        auditWarmachineDeclaredMovementDeploymentReachabilityLowerBoundV1(
          state,
          {
            sideKey: obligation.sideKey,
            deployments: rawOptions.deployments,
            movementGroups: obligation.movementGroups,
          },
        );
      if (audit.ok) continue;
      violations.push(stableGraphValue({
        ...obligation,
        reason:
          "declared_movement_deployment_reachability_lower_bound_unsatisfied",
        failedChecks: audit.failedChecks,
        violations: audit.violations,
        auditHash: audit.auditHash,
      }));
    }
  }
  return violations;
}

function edge(candidate = {}) {
  return {
    candidateKey: candidate.candidateKey,
    operatorKey: candidate.operatorKey,
    actorPieceKey: candidate.actorPieceKey,
    targetPieceKey: candidate.targetPieceKey || "",
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
    preActivationResourcePoints:
      Number(candidate.preActivationResourcePoints || 0),
    reverseRestoredResourcePoints:
      Number(candidate.reverseRestoredResourcePoints || 0),
    resourceSpendOrder: String(candidate.resourceSpendOrder || ""),
    resourcePrefixActionKeys: candidate.resourcePrefixActionKeys || [],
    resourceSuffixActionKeys: candidate.resourceSuffixActionKeys || [],
    matchedProbability: candidate.matchedProbability || null,
    matchedProbabilityInterval: candidate.matchedProbabilityInterval || null,
    matchedProbabilityExact: candidate.matchedProbabilityExact === true,
    adversarialContextKey: String(candidate.adversarialContextKey || ""),
    provenance: candidate.provenance || null,
    predecessorStateInvariantAudit:
      candidate.predecessorStateInvariantAudit || null,
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
  const movementGroupKeysWitnessScoped = Array.isArray(
    rawOptions.movementGroupKeys,
  );
  const movementGroupKeySet = new Set(
    (rawOptions.movementGroupKeys || []).map(String),
  );
  const chargeCombatActorPieceKeysScoped = Array.isArray(
    rawOptions.chargeCombatActorPieceKeys,
  );
  const chargeCombatActorPieceKeySet = new Set(
    (rawOptions.chargeCombatActorPieceKeys || []).map(String),
  );
  const groupOrderIndex = new Map((rawOptions.groupOrderKeys || [])
    .map(String).map((groupKey, index) => [groupKey, index]));
  const frontierOrder = rawOptions.frontierOrder === "best_first_to_deployment"
    ? "best_first_to_deployment"
    : "breadth_first_by_activation_depth";
  const rootStateHash = warmachineReverseStateSemanticHashV1(root);
  const initialQueue = [{
    labelKey: labelKey(rootStateHash, []),
    state: root,
    stateHash: rootStateHash,
    depth: 0,
    reverseEdges: [],
  }];
  const resumeContract = {
    rootStateHash,
    sideKey,
    rawOptions,
  };
  const resumeKey = buildWarmachineActivationSequenceResumeCheckpointV1({
    ...resumeContract,
    queue: initialQueue,
    labelKeys: initialQueue.map((row) => row.labelKey),
    uniqueStateHashes: [rootStateHash],
  }).resumeKey;
  const requestedResumeCheckpoint = rawOptions.resumeCheckpoint ||
    rawOptions.resumeCheckpoints?.[resumeKey] || null;
  if (requestedResumeCheckpoint) {
    const resumeAudit = auditWarmachineActivationSequenceResumeCheckpointV1(
      requestedResumeCheckpoint,
      resumeContract,
    );
    if (!resumeAudit.ok) {
      throw new Error(`activation_resume_checkpoint_rejected:${
        resumeAudit.issues.join(",")}`);
    }
  }
  const queue = requestedResumeCheckpoint
    ? requestedResumeCheckpoint.queue.map(activationCheckpointLabel)
    : initialQueue;
  const labelKeys = new Set(requestedResumeCheckpoint?.labelKeys ||
    queue.map((row) => row.labelKey));
  const uniqueStateHashes = new Set(
    requestedResumeCheckpoint?.uniqueStateHashes || [rootStateHash],
  );
  const boundaryLabels = requestedResumeCheckpoint
    ? requestedResumeCheckpoint.boundaryLabels.map(activationCheckpointLabel)
    : [];
  const unresolved = requestedResumeCheckpoint
    ? stableGraphValue(requestedResumeCheckpoint.unresolved || [])
    : [];
  if (!requestedResumeCheckpoint) {
    unresolved.push(...(rawOptions.predecessorStateObligations || []).map((row) => ({
      reason: "predecessor_obligation_alternative_source_families_deferred",
      detail: stableGraphValue(row),
    })));
  }
  const rejected = requestedResumeCheckpoint
    ? stableGraphValue(requestedResumeCheckpoint.rejected || [])
    : [];
  const expansionCache = new Map();
  const expansionLedgeredStateHashes = new Set(
    requestedResumeCheckpoint?.expansionLedgeredStateHashes || [],
  );
  let expandedLabelCount = Number(
    requestedResumeCheckpoint?.expandedLabelCount || 0,
  );
  let generatedEdgeCount = Number(
    requestedResumeCheckpoint?.generatedEdgeCount || 0,
  );
  const publishCheckpoint = (stage) => {
    if (typeof rawOptions.onCheckpoint !== "function") return;
    emitProgress("activation_checkpoint_build_started", { checkpointStage: stage });
    const checkpoint = buildWarmachineActivationSequenceResumeCheckpointV1({
      ...resumeContract,
      queue,
      boundaryLabels,
      labelKeys,
      uniqueStateHashes,
      expansionLedgeredStateHashes,
      unresolved,
      rejected,
      expandedLabelCount,
      generatedEdgeCount,
    });
    emitProgress("activation_checkpoint_build_ready", {
      checkpointStage: stage,
      checkpointHash: checkpoint.checkpointHash,
    });
    rawOptions.onCheckpoint({
      stage,
      resumeKey,
      checkpoint,
    });
    emitProgress("activation_checkpoint_published", {
      checkpointStage: stage,
      checkpointHash: checkpoint.checkpointHash,
    });
  };
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
    const currentStateInvariantAudit = auditWarmachineReverseStateBoundaryV1(
      current.state,
      { boundaryKind: "activation_reverse_frontier" },
    );
    if (!currentStateInvariantAudit.ok) {
      rejected.push({
        labelKey: current.labelKey,
        stateHash: current.stateHash,
        depth: current.depth,
        reason: "reverse_predecessor_state_invariant_rejected",
        stateInvariantAudit:
          summarizeWarmachineReverseStateBoundaryAuditV1(
            currentStateInvariantAudit,
          ),
        issues: currentStateInvariantAudit.issues,
      });
      publishCheckpoint("activation_state_invariant_rejected");
      continue;
    }
    if (boundaryReached(current.state, sideKey)) {
      const obligationViolations = activationBoundaryStateObligationViolations(
        current.state,
        rawOptions,
      );
      if (obligationViolations.length) {
        unresolved.push({
          labelKey: current.labelKey,
          stateHash: current.stateHash,
          depth: current.depth,
          reason: "activation_predecessor_obligation_unsatisfied",
          obligationViolations,
        });
        publishCheckpoint("activation_predecessor_obligation_unsatisfied");
        continue;
      }
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
        publishCheckpoint("activation_boundary_witness_budget_reached");
        break;
      }
      publishCheckpoint("activation_boundary_reached");
      continue;
    }
    if (current.depth >= maximumDepth) {
      unresolved.push({
        labelKey: current.labelKey,
        stateHash: current.stateHash,
        depth: current.depth,
        reason: "activation_reverse_depth_budget_exhausted",
      });
      publishCheckpoint("activation_depth_budget_reached");
      continue;
    }
    let expansion = expansionCache.get(current.stateHash);
    if (!expansion) {
      const inverseGroups = inverseActivationGroups(current.state, sideKey);
      const orderedGroups = inverseGroups.slice().sort((left, right) => {
        const dependencyOrder =
          activationGroupControlResourceDependencyRank(
            current.state,
            left,
            rawOptions,
          ) - activationGroupControlResourceDependencyRank(
            current.state,
            right,
            rawOptions,
          );
        const leftOrder = groupOrderIndex.has(left.groupKey)
          ? groupOrderIndex.get(left.groupKey)
          : Number.POSITIVE_INFINITY;
        const rightOrder = groupOrderIndex.has(right.groupKey)
          ? groupOrderIndex.get(right.groupKey)
          : Number.POSITIVE_INFINITY;
        return dependencyOrder || leftOrder - rightOrder ||
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
      const chargeCombatActorPieceKeys = chargeCombatActorPieceKeysScoped
        ? scopedActorPieceKeys.filter((pieceKey) =>
          chargeCombatActorPieceKeySet.has(pieceKey))
        : scopedActorPieceKeys;
      const selectedGroupKey = selectedGroups.length === 1
        ? selectedGroups[0].groupKey
        : "";
      const expansionMaximumCandidates = Math.max(0, Math.floor(numeric(
        rawOptions.maximumCandidatesPerExpansionByGroupKey?.[selectedGroupKey],
        maximumCandidatesPerExpansion,
      )));
      const movementMaximumStrictCandidates = Math.max(0, Math.floor(numeric(
        rawOptions.maximumMovementStrictCandidatesByGroupKey?.[selectedGroupKey],
        rawOptions.maximumMovementStrictCandidatesPerExpansion,
      )));
      const movementGroups = movementGroupKeysWitnessScoped
        ? selectedGroups.filter((group) => movementGroupKeySet.has(group.groupKey))
        : selectedGroups;
      const movementActorPieceKeys = movementGroups.flatMap((group) =>
        group.actorPieceKeys);
      const reservedDeploymentPieceKeys = orderedGroups.filter((group) =>
        group.groupKey !== selectedGroupKey &&
        movementGroupKeySet.has(group.groupKey)).flatMap((group) =>
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
        : movementActorPieceKeys.length
          ? generateWarmachineMovementActivationPredecessorsV1(current.state, {
          sideKey,
          actorPieceKeys: movementActorPieceKeys,
          deployments: rawOptions.deployments,
          actionTypes: rawOptions.movementActionTypes,
          originProposals: rawOptions.originProposals,
          deploymentSlotGapIn: rawOptions.deploymentSlotGapIn,
          maximumDeploymentSlotOrigins: rawOptions.maximumDeploymentSlotOrigins,
          maximumDeploymentSlotRings: rawOptions.maximumDeploymentSlotRings,
          includeDeploymentSlotAlternatives:
            rawOptions.includeDeploymentSlotAlternatives === true,
          includeUnitDeploymentFormationAlternatives:
            rawOptions.includeUnitDeploymentFormationAlternatives === true,
          maximumUnitDeploymentFormationCandidates:
            rawOptions.maximumUnitDeploymentFormationCandidates,
          unitDeploymentFormationGridStepIn:
            rawOptions.unitDeploymentFormationGridStepIn,
          unitDeploymentFormationRotationCount:
            rawOptions.unitDeploymentFormationRotationCount,
          reservedDeploymentPieceKeys,
          maximumUnitMovementAnchorsPerGroup:
            rawOptions.maximumUnitMovementAnchorsPerGroup,
          includeResourceSpendPrefixes:
            rawOptions.includeResourceSpendPrefixes === true,
          resourceSpendPrefixActorPieceKeys:
            rawOptions.resourceSpendPrefixActorPieceKeys,
          requireResourceSpendPrefixActorPieceKeys:
            rawOptions.requireResourceSpendPrefixActorPieceKeys,
          includePostMovementResourceSpendSuffixes:
            rawOptions.includePostMovementResourceSpendSuffixes === true,
          resourcePrefixTargetPieceKeys: rawOptions.resourcePrefixTargetPieceKeys,
          maximumResourcePrefixTargets: rawOptions.maximumResourcePrefixTargets,
          maximumResourcePrefixDepth: rawOptions.maximumResourcePrefixDepth,
          maximumResourcePrefixLabels: rawOptions.maximumResourcePrefixLabels,
          maximumResourcePrefixRoutes: rawOptions.maximumResourcePrefixRoutes,
          maximumResourceSuffixTargets: rawOptions.maximumResourceSuffixTargets,
          maximumResourceSuffixDepth: rawOptions.maximumResourceSuffixDepth,
          maximumResourceSuffixLabels: rawOptions.maximumResourceSuffixLabels,
          maximumResourceSuffixRoutes: rawOptions.maximumResourceSuffixRoutes,
          maximumResourceSuffixMovementProposals:
            rawOptions.maximumResourceSuffixMovementProposals,
          predecessorStateObligations:
            rawOptions.predecessorStateObligations || [],
          prioritizeResourceContinuityFallbacks:
            rawOptions.prioritizeControlResourceDependencies === true,
          maximumStrictCandidates: Math.max(
            expansionMaximumCandidates,
            movementMaximumStrictCandidates,
          ),
          maximumStrictCandidateAttempts:
            rawOptions.maximumMovementStrictCandidateAttempts,
          dedupeEquivalentPathWitnessesForReachabilityBudget:
            rawOptions.dedupeEquivalentPathWitnessesForReachabilityBudget ===
              true,
          rejectedAuditLimit: rawOptions.rejectedAuditLimit,
          onProgress: (event = {}) => {
            const { stage: movementStage, ...detail } = event;
            emitProgress("movement_predecessor_progress", {
              movementStage,
              ...detail,
            });
          },
          queryKey: `${rawOptions.queryKey || "activation-v2"}:movement:${current.stateHash}`,
        })
          : { candidates: [], rejected: [], unresolved: [] };
      const chargeCombat = rawOptions.includeChargeCombat === true &&
          chargeCombatActorPieceKeys.length
        ? generateWarmachineChargeCombatActivationPredecessorsV1(
          current.state,
          {
            sideKey,
            actorPieceKeys: chargeCombatActorPieceKeys,
            targetPieceKeys: rawOptions.chargeTargetPieceKeys,
            chargePredecessorProposals:
              rawOptions.chargePredecessorProposals,
            includeAutomaticChargeOrigins:
              rawOptions.includeAutomaticChargeOrigins !== false,
            chargeOriginDistancesIn: rawOptions.chargeOriginDistancesIn,
            maximumChargeProposals: rawOptions.maximumChargeProposals,
            maximumCandidates: rawOptions.maximumChargeCombatCandidates,
            rejectedAuditLimit: rawOptions.rejectedAuditLimit,
            queryKey: `${rawOptions.queryKey || "activation-v2"}:charge-combat:${current.stateHash}`,
          },
        )
        : { candidates: [], rejected: [], unresolved: [] };
      const declaredMovementWitnessGroup =
        movementGroupKeysWitnessScoped &&
        movementGroupKeySet.has(selectedGroupKey);
      const orderedCandidates = [
        ...pass.candidates,
        ...movement.candidates,
        ...chargeCombat.candidates,
      ].sort((left, right) =>
          Number(declaredMovementWitnessGroup &&
            Boolean(right.movementProposal)) -
            Number(declaredMovementWitnessGroup &&
              Boolean(left.movementProposal)) ||
          numeric(declaredMovementWitnessGroup
            ? left.movementProposal?.proposalPriority
            : 0) - numeric(declaredMovementWitnessGroup
              ? right.movementProposal?.proposalPriority
              : 0) ||
          predecessorStateObligationViolations(
            left.predecessorState,
            rawOptions,
          ).length - predecessorStateObligationViolations(
            right.predecessorState,
            rawOptions,
          ).length ||
          activationCandidateControlResourceDependencyRank(left, rawOptions) -
            activationCandidateControlResourceDependencyRank(right, rawOptions) ||
          warmachineDeploymentGeometryDebtV1(left.predecessorState, rawOptions) -
            warmachineDeploymentGeometryDebtV1(right.predecessorState, rawOptions) ||
          Number(right.reverseRestoredResourcePoints || 0) -
            Number(left.reverseRestoredResourcePoints || 0) ||
          left.candidateKey.localeCompare(right.candidateKey));
      const candidates = expansionMaximumCandidates > 0
        ? orderedCandidates.slice(0, expansionMaximumCandidates)
        : orderedCandidates;
      const omittedCandidates = expansionMaximumCandidates > 0
        ? orderedCandidates.slice(expansionMaximumCandidates)
        : [];
      expansion = {
        candidates,
        rejected: [
          ...(pass.rejected || []),
          ...(movement.rejected || []),
          ...(chargeCombat.rejected || []),
        ],
        unresolved: [
          ...(pass.unresolved || []),
          ...(movement.unresolved || []),
          ...(chargeCombat.unresolved || []),
          ...(rawOptions.includeChargeCombat === true &&
              chargeCombatActorPieceKeysScoped
            ? scopedActorPieceKeys.filter((pieceKey) =>
              !chargeCombatActorPieceKeySet.has(pieceKey)).map((pieceKey) => ({
              reason: "charge_combat_actor_scope_not_enabled",
              actorPieceKey: pieceKey,
              detail: "This bounded witness call did not expand charge-combat predecessors for this actor; the omitted family remains unresolved.",
            }))
            : []),
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
          ...(movementGroupKeysWitnessScoped
            ? selectedGroups.filter((group) =>
              !movementGroupKeySet.has(group.groupKey)).map((group) => ({
              reason: "activation_reverse_movement_family_witness_deferred",
              groupKey: group.groupKey,
              actorPieceKeys: group.actorPieceKeys,
              claimBoundary:
                "This route witness declares the group as a non-mover; other legal movement predecessors remain unresolved.",
            }))
            : []),
        ],
      };
      emitProgress("activation_expansion_ready", {
        labelKey: current.labelKey,
        stateHash: current.stateHash,
        depth: current.depth,
        selectedGroups: stableGraphValue(selectedGroups),
        selectedCandidates: stableGraphValue(candidates.map((candidate) => ({
          candidateKey: candidate.candidateKey,
          operatorKey: candidate.operatorKey,
          actorPieceKey: candidate.actorPieceKey,
          activationGroupId: candidate.activationGroupId || "",
          actionType: candidate.actionType,
          movementOrigin: candidate.movementProposal?.origin || null,
          movementRelationKind:
            candidate.movementProposal?.relationKind || "",
          transitionActionKey: candidate.transitionActionKey,
          targetPieceKey: candidate.targetPieceKey || "",
          predecessorStateHash: candidate.predecessorStateHash,
        }))),
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
    emitProgress("activation_expansion_ledger_ready", {
      labelKey: current.labelKey,
      stateHash: current.stateHash,
      depth: current.depth,
    });
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
      publishCheckpoint("activation_inverse_dead_end");
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
    emitProgress("activation_label_queue_ready", {
      labelKey: current.labelKey,
      stateHash: current.stateHash,
      depth: current.depth,
    });
    publishCheckpoint("activation_label_expanded");
  }
  emitProgress("activation_reverse_complete");
  for (const boundary of boundaryLabels) {
    boundary.deploymentGeometryDebt = warmachineDeploymentGeometryDebtV1(
      boundary.state,
      rawOptions,
    );
  }
  if (frontierOrder === "best_first_to_deployment") {
    boundaryLabels.sort((left, right) =>
      right.deploymentGeometryDebt - left.deploymentGeometryDebt ||
      left.labelKey.localeCompare(right.labelKey));
  }
  const runtimeResumeCheckpoint =
    buildWarmachineActivationSequenceResumeCheckpointV1({
      ...resumeContract,
      queue,
      boundaryLabels,
      labelKeys,
      uniqueStateHashes,
      expansionLedgeredStateHashes,
      unresolved,
      rejected,
      expandedLabelCount,
      generatedEdgeCount,
    });
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
      includeChargeCombat: rawOptions.includeChargeCombat === true,
      chargeCombatActorPieceKeys: chargeCombatActorPieceKeysScoped
        ? [...chargeCombatActorPieceKeySet].sort()
        : [],
      maximumChargeProposals: Math.max(0, Math.floor(numeric(
        rawOptions.maximumChargeProposals,
        0,
      ))),
      maximumPassActorsPerExpansion: Math.max(0, Math.floor(numeric(
        rawOptions.maximumPassActorsPerExpansion,
        0,
      ))),
      groupOrderKeys: [...groupOrderIndex.keys()],
      prioritizeControlResourceDependencies:
        rawOptions.prioritizeControlResourceDependencies === true,
      predecessorStateObligationCount:
        (rawOptions.predecessorStateObligations || []).length,
    },
    claimBoundary: "Pass, movement, Host-validated resource-prefix movement and opt-in charge-combat activations are peer inverse activation families. A charge candidate includes its target-bound straight movement, mandatory first charge attack and selected completion sequence; actor scopes, omitted origins, attacks, reactions and Chance classes remain unresolved. Optional control-resource dependency ordering reverses controllers before their controlled cohorts and those cohorts before ordinary groups; it is a rules-feasibility ordering only, and every omitted activation order remains unresolved. Restored resources affect reachability ordering only after deployment geometry ties; this is not strategy scoring. Distinct activation orders remain distinct route labels even when their clean rules states converge, and expansion results may be memoized by exact state only. Every budget omission and unsupported attack, spell, resource or trigger activation remains unresolved.",
  };
  return {
    ...core,
    runtimeBoundaries: boundaryLabels,
    resumeCheckpointAccepted: Boolean(requestedResumeCheckpoint),
    runtimeResumeCheckpoint,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: boundaryLabels.length > 0,
  };
}
