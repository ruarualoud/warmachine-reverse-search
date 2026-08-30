import {
  bindWarmachineBenchmarkExplicitMovementPathV2,
  buildWarmachineBenchmarkStrictRollOutcomeV2,
  enumerateWarmachineBenchmarkActionsV2,
  executeScopedWarmachineBenchmarkActionV2,
  executeWarmachineBenchmarkActivationV2,
  warmachineBenchmarkRuntimeWindowActiveV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  buildRulesV1MovementPathProposalPlan,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { buildWarmachineReverseReachabilityCandidateSetV2 } from
  "./reachability-contract-v2.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";
import { warmachinePieceInPlayV1 } from "./piece-lifecycle-v1.mjs";
import { generateWarmachineUnitDeploymentFormationPredecessorsV1 } from
  "./unit-deployment-formation-predecessor-v1.mjs";
import {
  auditWarmachineReverseStateBoundaryV1,
  summarizeWarmachineReverseStateBoundaryAuditV1,
} from "./reverse-state-invariants-v1.mjs";

export const WARMACHINE_MOVEMENT_ACTIVATION_PREDECESSOR_V1_SCHEMA =
  "warmachine_movement_activation_predecessor_v1";

function numeric(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function point(value = {}) {
  const source = value.position || value;
  return { xIn: numeric(source.xIn), yIn: numeric(source.yIn) };
}

function distance(left = {}, right = {}) {
  const a = point(left);
  const b = point(right);
  return Math.hypot(a.xIn - b.xIn, a.yIn - b.yIn);
}

function samePoint(left = {}, right = {}) {
  return distance(left, right) <= 0.001;
}

function movementPathWitnessIssues(proposal = {}) {
  const issues = [];
  const waypoints = proposal.waypoints;
  if (!Array.isArray(waypoints) || !waypoints.length || waypoints.some((entry) =>
    !Number.isFinite(Number(entry?.xIn)) ||
    !Number.isFinite(Number(entry?.yIn)))) {
    issues.push("movement_waypoints_missing_or_nonfinite");
  }
  if ((proposal.activationGroupPieceKeys || []).length > 1) {
    const pathsByModel = proposal.pathsByModel;
    if (!Array.isArray(pathsByModel) || !pathsByModel.length) {
      issues.push("unit_paths_by_model_missing");
    } else {
      for (const entry of pathsByModel) {
        if (!String(entry?.pieceKey || "") ||
            !Array.isArray(entry?.waypoints) || !entry.waypoints.length ||
            entry.waypoints.some((waypoint) =>
              !Number.isFinite(Number(waypoint?.xIn)) ||
              !Number.isFinite(Number(waypoint?.yIn)))) {
          issues.push("unit_path_piece_or_waypoints_invalid");
          break;
        }
      }
    }
  }
  return issues;
}

function alive(piece = {}) {
  return warmachinePieceInPlayV1(piece);
}

function setPieceResourcePoints(piece = {}, points = 0) {
  const value = Math.max(0, Math.floor(numeric(points)));
  piece.resourcePoints = value;
  piece.resource2 = value;
  if (String(piece.resourceKind || "") === "focus" || "focus" in piece) {
    piece.focus = value;
  }
  if (String(piece.resourceKind || "") === "fury" || "fury" in piece) {
    piece.fury = value;
  }
}

function actorResourcePoints(state = {}, actorPieceKey = "") {
  return Math.max(0, Math.floor(numeric((state.pieces || []).find((piece) =>
    piece.pieceKey === actorPieceKey)?.resourcePoints)));
}

function movementResourcePreimagePlans(
  cleanPredecessor,
  actorPieceKey,
  actionType,
) {
  const actor = (cleanPredecessor.pieces || []).find((piece) =>
    piece.pieceKey === actorPieceKey);
  const successorResourcePoints = actorResourcePoints(
    cleanPredecessor,
    actorPieceKey,
  );
  const resourcePoints = new Set([successorResourcePoints]);
  if (actionType === "run" &&
      (actor?.isWarjack === true || actor?.isWarbeast === true)) {
    const resourceMaximum = Math.max(
      successorResourcePoints,
      Math.floor(numeric(actor.resourceMax)),
      Math.floor(numeric(actor.resource2Max)),
      Math.floor(numeric(actor.furyThreshold)),
    );
    for (let points = 0; points <= resourceMaximum; points += 1) {
      resourcePoints.add(points);
    }
  }
  const expectedPaidRunResourcePoints = actionType === "run" &&
      actor?.isWarjack === true
    ? successorResourcePoints + 1
    : actionType === "run" && actor?.isWarbeast === true
      ? Math.max(0, successorResourcePoints - 1)
      : successorResourcePoints;
  return [...resourcePoints].sort((left, right) => left - right).map((points) => {
    const predecessorState = structuredClone(cleanPredecessor);
    const predecessorActor = predecessorState.pieces.find((piece) =>
      piece.pieceKey === actorPieceKey);
    setPieceResourcePoints(predecessorActor, points);
    predecessorState.stateKey = `movement-resource-preimage-${stableGraphHash({
      cleanPredecessorStateHash:
        warmachineReverseStateSemanticHashV1(cleanPredecessor),
      actorPieceKey,
      actionType,
      resourcePoints: points,
    }, 24)}`;
    return {
      predecessorState: normalizeRulesV1State(predecessorState),
      preActivationResourcePoints: points,
      reverseResourceDelta: points - successorResourcePoints,
      resourcePreimagePriority:
        Math.abs(points - expectedPaidRunResourcePoints),
      strictReplaySteps: [],
    };
  });
}

function resourcePrefixTargetDomain(state = {}, actor = {}, rawOptions = {}) {
  const requested = Array.isArray(rawOptions.resourcePrefixTargetPieceKeys)
    ? [...new Set(rawOptions.resourcePrefixTargetPieceKeys.map(String))]
    : null;
  const maximumTargets = Math.max(1, Math.floor(numeric(
    rawOptions.maximumResourcePrefixTargets,
    8,
  )));
  const legalEnemies = (state.pieces || []).filter((piece) =>
    alive(piece) && piece.sideKey !== actor.sideKey).sort((left, right) =>
    distance(actor, left) - distance(actor, right) ||
      left.pieceKey.localeCompare(right.pieceKey));
  const eligible = requested
    ? legalEnemies.filter((piece) => requested.includes(piece.pieceKey))
    : legalEnemies;
  return {
    targetPieceKeys: eligible.slice(0, maximumTargets).map((piece) => piece.pieceKey),
    omittedTargetPieceKeys: eligible.slice(maximumTargets).map((piece) => piece.pieceKey),
  };
}

function resourcePrefixSpellRangeOrigins(
  state = {},
  actor = {},
  actionTypes = [],
  rawOptions = {},
) {
  const targetResourcePoints = actorResourcePoints(state, actor.pieceKey);
  const resourceMax = Math.max(0, Math.floor(numeric(actor.resourceMax)));
  const enabledActorPieceKeys = Array.isArray(
    rawOptions.resourceSpendPrefixActorPieceKeys,
  ) ? new Set(rawOptions.resourceSpendPrefixActorPieceKeys.map(String)) : null;
  if (rawOptions.includeResourceSpendPrefixes !== true ||
      (enabledActorPieceKeys && !enabledActorPieceKeys.has(actor.pieceKey)) ||
      actor.isWarcaster !== true || actor.resourceKind !== "focus" ||
      resourceMax <= targetResourcePoints) {
    return { rows: [], omitted: [] };
  }
  const spellRanges = [...new Set((actor.attackProfiles || [])
    .filter((profile) => profile.mode === "spell" && numeric(profile.rangeIn) > 0)
    .map((profile) => numeric(profile.rangeIn)))]
    .sort((left, right) => right - left);
  if (!spellRanges.length) return { rows: [], omitted: [] };

  const targetDomain = resourcePrefixTargetDomain(state, actor, rawOptions);
  const targetKeys = new Set(targetDomain.targetPieceKeys);
  const targets = (state.pieces || []).filter((piece) =>
    targetKeys.has(piece.pieceKey));
  const destination = point(actor);
  const rows = [];
  for (const target of targets) {
    const targetPosition = point(target);
    const delta = {
      xIn: destination.xIn - targetPosition.xIn,
      yIn: destination.yIn - targetPosition.yIn,
    };
    const destinationCenterDistance = Math.hypot(delta.xIn, delta.yIn);
    if (destinationCenterDistance <= 0.001) continue;
    const direction = {
      xIn: delta.xIn / destinationCenterDistance,
      yIn: delta.yIn / destinationCenterDistance,
    };
    for (const spellRangeIn of spellRanges) {
      const maximumCenterDistanceIn =
        spellRangeIn + baseRadius(actor) + baseRadius(target);
      if (destinationCenterDistance <= maximumCenterDistanceIn + 0.001) {
        continue;
      }
      for (const rangeFraction of [0.995, 0.9]) {
        const originCenterDistanceIn = maximumCenterDistanceIn * rangeFraction;
        const origin = {
          xIn: targetPosition.xIn + direction.xIn * originCenterDistanceIn,
          yIn: targetPosition.yIn + direction.yIn * originCenterDistanceIn,
        };
        for (const actionType of actionTypes) {
          const speedIn = Math.max(0, numeric(actor.speedIn));
          const allowanceIn = actionType === "run" ? speedIn + 5 : speedIn;
          if (distance(origin, destination) > allowanceIn + 0.001) continue;
          rows.push({
            proposalKey: `${actor.pieceKey}:${actionType}:resource-prefix-range:${
              target.pieceKey}:${spellRangeIn}:${rangeFraction}`,
            actorPieceKey: actor.pieceKey,
            actionType,
            origin,
            waypoints: [destination],
            proposalAllowanceIn: allowanceIn,
            proposalSource: "resource_prefix_spell_range_preimage_v1",
            deploymentSlotKey: "",
            originPlacementIssues: predecessorOriginPlacementIssues(
              state,
              actor,
              origin,
            ),
            relationKind: "resource_prefix_spell_range_origin",
            resourcePrefixTargetPieceKey: target.pieceKey,
            resourcePrefixSpellRangeIn: spellRangeIn,
            resourcePrefixRangeFraction: rangeFraction,
          });
        }
      }
    }
  }
  return {
    rows,
    omitted: targetDomain.omittedTargetPieceKeys.map((targetPieceKey) => ({
      actorPieceKey: actor.pieceKey,
      targetPieceKey,
      reason: "resource_prefix_origin_target_budget_deferred",
    })),
  };
}

function resourcePrefixAction(action = {}, actorPieceKey = "") {
  const resolution = action.metadata?.attackResolution || null;
  if (action.actorPieceKey !== actorPieceKey) return false;
  if (action.actionType === "shed_fury") return true;
  return action.actionType === "offensive_spell" &&
    numeric(action.resourceCost) > 0 && resolution &&
    resolution.autoHit !== true && resolution.automaticHit !== true;
}

function resourcePrefixSpend(action = {}) {
  if (action.actionType === "shed_fury") {
    return Math.max(0, numeric(action.metadata?.furyRemoved));
  }
  return Math.max(0, numeric(action.resourceCost));
}

function resourceSpendPrefixRoutes(cleanPredecessor, actorPieceKey, rawOptions = {}) {
  const enabledActorPieceKeys = Array.isArray(
    rawOptions.resourceSpendPrefixActorPieceKeys,
  ) ? new Set(rawOptions.resourceSpendPrefixActorPieceKeys.map(String)) : null;
  if (rawOptions.includeResourceSpendPrefixes !== true ||
      (enabledActorPieceKeys && !enabledActorPieceKeys.has(actorPieceKey))) {
    return { routes: [], unresolved: [] };
  }
  const actor = (cleanPredecessor.pieces || []).find((piece) =>
    piece.pieceKey === actorPieceKey);
  const targetResourcePoints = actorResourcePoints(cleanPredecessor, actorPieceKey);
  const resourceMax = Math.max(0, Math.floor(numeric(actor?.resourceMax)));
  const eligible = ((actor?.isWarcaster === true &&
      String(actor.resourceKind || "") === "focus") ||
    (actor?.isWarlock === true && String(actor.resourceKind || "") === "fury")) &&
    resourceMax > targetResourcePoints;
  if (!eligible) return { routes: [], unresolved: [] };

  const predecessor = structuredClone(cleanPredecessor);
  const predecessorActor = predecessor.pieces.find((piece) =>
    piece.pieceKey === actorPieceKey);
  setPieceResourcePoints(predecessorActor, resourceMax);
  predecessor.stateKey = `resource-prefix-movement-predecessor-${stableGraphHash({
    cleanPredecessorStateHash:
      warmachineReverseStateSemanticHashV1(cleanPredecessor),
    actorPieceKey,
    resourceMax,
    targetResourcePoints,
  }, 24)}`;
  const normalizedPredecessor = normalizeRulesV1State(predecessor);
  const targetDomain = resourcePrefixTargetDomain(
    normalizedPredecessor,
    predecessorActor,
    rawOptions,
  );
  const maximumDepth = Math.max(1, Math.floor(numeric(
    rawOptions.maximumResourcePrefixDepth,
    resourceMax - targetResourcePoints,
  )));
  const maximumLabels = Math.max(1, Math.floor(numeric(
    rawOptions.maximumResourcePrefixLabels,
    64,
  )));
  const maximumRoutes = Math.max(1, Math.floor(numeric(
    rawOptions.maximumResourcePrefixRoutes,
    4,
  )));
  const queue = [{
    state: normalizedPredecessor,
    strictReplaySteps: [],
    strictReceiptHashes: [],
  }];
  const visitedStateHashes = new Set();
  const routes = [];
  const unresolved = targetDomain.omittedTargetPieceKeys.length
    ? [{
      actorPieceKey,
      reason: "resource_prefix_target_budget_deferred",
      omittedTargetPieceKeys: targetDomain.omittedTargetPieceKeys,
    }]
    : [];
  rawOptions.onProgress?.({
    stage: "resource_prefix_search_started",
    actorPieceKey,
    movementProposalKey: String(rawOptions.movementProposalKey || ""),
    maximumDepth,
    maximumLabels,
    maximumRoutes,
  });
  while (queue.length && visitedStateHashes.size < maximumLabels &&
      routes.length < maximumRoutes) {
    const current = queue.pop();
    const stateHash = warmachineReverseStateSemanticHashV1(current.state);
    if (visitedStateHashes.has(stateHash)) continue;
    visitedStateHashes.add(stateHash);
    const currentPoints = actorResourcePoints(current.state, actorPieceKey);
    rawOptions.onProgress?.({
      stage: "resource_prefix_label_started",
      actorPieceKey,
      movementProposalKey: String(rawOptions.movementProposalKey || ""),
      visitedLabelCount: visitedStateHashes.size,
      queuedLabelCount: queue.length,
      routeCount: routes.length,
      currentResourcePoints: currentPoints,
      targetResourcePoints,
    });
    if (currentPoints === targetResourcePoints && current.strictReplaySteps.length) {
      routes.push({
        predecessorState: normalizedPredecessor,
        endingState: current.state,
        restoredResourcePoints: resourceMax - targetResourcePoints,
        preActivationResourcePoints: resourceMax,
        strictReplaySteps: current.strictReplaySteps,
        strictReceiptHashes: current.strictReceiptHashes,
      });
      continue;
    }
    if (currentPoints < targetResourcePoints ||
        current.strictReplaySteps.length >= maximumDepth) {
      unresolved.push({
        actorPieceKey,
        stateHash,
        currentResourcePoints: currentPoints,
        targetResourcePoints,
        reason: currentPoints < targetResourcePoints
          ? "resource_prefix_overspent_target"
          : "resource_prefix_depth_budget_exhausted",
      });
      continue;
    }
    const scoped = enumerateWarmachineBenchmarkActionsV2(current.state, {
      activationGroupKey: warmachineBenchmarkRuntimeWindowActiveV2(current.state)
        ? ""
        : actorPieceKey,
      targetPieceKeys: targetDomain.targetPieceKeys,
      includeUntargetedActions: true,
      actionFamilyKeys: ["attack_or_effect", "resource", "special"],
    });
    const actions = (scoped.enumeration.actions || []).filter((action) =>
      resourcePrefixAction(action, actorPieceKey) &&
      resourcePrefixSpend(action) > 0 &&
      resourcePrefixSpend(action) <= currentPoints - targetResourcePoints)
      .sort((left, right) =>
        Math.abs(currentPoints - targetResourcePoints - resourcePrefixSpend(left)) -
          Math.abs(currentPoints - targetResourcePoints - resourcePrefixSpend(right)) ||
        resourcePrefixSpend(right) - resourcePrefixSpend(left) ||
        left.actionKey.localeCompare(right.actionKey));
    if (!actions.length) {
      unresolved.push({
        actorPieceKey,
        stateHash,
        currentResourcePoints: currentPoints,
        targetResourcePoints,
        reason: "resource_prefix_strict_action_not_available",
      });
      continue;
    }
    for (const action of actions) {
      const strictRollOutcome = action.metadata?.attackResolution
        ? buildWarmachineBenchmarkStrictRollOutcomeV2(action, {
          attackDie: 1,
          damageDie: 1,
          locationDie: 1,
        })
        : null;
      const executed = executeScopedWarmachineBenchmarkActionV2(
        scoped,
        action,
        { actionKey: action.actionKey },
        {
          routeKey: `resource-prefix-movement:${actorPieceKey}:${action.actionKey}`,
          actionPatch: strictRollOutcome ? { strictRollOutcome } : {},
        },
      );
      if (!executed.ok || (executed.receipt?.reactionRequirements || []).length) {
        unresolved.push({
          actorPieceKey,
          stateHash,
          actionKey: action.actionKey,
          reason: !executed.ok
            ? executed.reason || "resource_prefix_strict_transition_rejected"
            : "resource_prefix_opponent_reaction_required",
          receiptHash: String(executed.receipt?.receiptHash || ""),
        });
        continue;
      }
      const nextState = executed.normalizedState || normalizeRulesV1State(executed.state);
      const nextPoints = actorResourcePoints(nextState, actorPieceKey);
      if (nextPoints >= currentPoints) continue;
      queue.push({
        state: nextState,
        strictReplaySteps: [
          ...current.strictReplaySteps,
          stableGraphValue({
            actionKey: action.actionKey,
            actionType: action.actionType,
            actorPieceKey: String(action.actorPieceKey || ""),
            targetPieceKey: String(action.targetPieceKey || ""),
            actionPatch: strictRollOutcome ? { strictRollOutcome } : {},
          }),
        ],
        strictReceiptHashes: [
          ...current.strictReceiptHashes,
          String(executed.receipt?.receiptHash || ""),
        ].filter(Boolean),
      });
    }
  }
  if (queue.length) {
    unresolved.push({
      actorPieceKey,
      reason: "resource_prefix_label_or_route_budget_exhausted",
      deferredLabelCount: queue.length,
      maximumLabels,
      maximumRoutes,
    });
  }
  if (!routes.length) {
    unresolved.push({
      actorPieceKey,
      preActivationResourcePoints: resourceMax,
      targetResourcePoints,
      reason: "resource_prefix_exact_spend_route_not_found",
    });
  }
  rawOptions.onProgress?.({
    stage: "resource_prefix_search_completed",
    actorPieceKey,
    movementProposalKey: String(rawOptions.movementProposalKey || ""),
    visitedLabelCount: visitedStateHashes.size,
    deferredLabelCount: queue.length,
    routeCount: routes.length,
    unresolvedCount: unresolved.length,
  });
  return { routes, unresolved };
}

function resourceSpendSuffixRoutes(
  cleanPredecessor,
  actorPieceKey,
  proposal,
  rawOptions = {},
) {
  if (rawOptions.includePostMovementResourceSpendSuffixes !== true) {
    return { routes: [], unresolved: [] };
  }
  const actor = (cleanPredecessor.pieces || []).find((piece) =>
    piece.pieceKey === actorPieceKey);
  const targetResourcePoints = actorResourcePoints(
    cleanPredecessor,
    actorPieceKey,
  );
  const resourceMax = Math.max(0, Math.floor(numeric(actor?.resourceMax)));
  if (actor?.isWarcaster !== true ||
      String(actor.resourceKind || "") !== "focus" ||
      resourceMax <= targetResourcePoints ||
      (proposal.activationGroupPieceKeys || []).length !== 1) {
    return { routes: [], unresolved: [] };
  }

  const predecessor = structuredClone(cleanPredecessor);
  const predecessorActor = predecessor.pieces.find((piece) =>
    piece.pieceKey === actorPieceKey);
  setPieceResourcePoints(predecessorActor, resourceMax);
  predecessor.stateKey = `resource-suffix-movement-predecessor-${stableGraphHash({
    cleanPredecessorStateHash:
      warmachineReverseStateSemanticHashV1(cleanPredecessor),
    actorPieceKey,
    proposalIdentity: proposal.identity,
    resourceMax,
    targetResourcePoints,
  }, 24)}`;
  const normalizedPredecessor = normalizeRulesV1State(predecessor);
  const discoveryPathKey = `reverse-suffix-discovery-${stableGraphHash({
    proposalIdentity: proposal.identity,
    actorPieceKey,
    resourceMax,
  }, 20)}`;
  const prepared = bindWarmachineBenchmarkExplicitMovementPathV2(
    normalizedPredecessor,
    {
      actorPieceKey,
      actionType: proposal.actionType,
      pathKey: discoveryPathKey,
      waypoints: proposal.waypoints,
      pathsByModel: [],
      proposalSource: proposal.proposalSource,
      label: `Reverse ${proposal.actionType} post-movement resource discovery`,
    },
  );
  const actionKey = `${actorPieceKey}:${proposal.actionType}-path:${
    discoveryPathKey}:v1`;
  const scoped = enumerateWarmachineBenchmarkActionsV2(prepared, {
    activationGroupKey: actorPieceKey,
    actionFamilyKeys: ["movement", "timing"],
    movementPathKindKeys: ["explicit_path"],
  });
  const movementAction = scoped.enumeration.actions.find((action) =>
    action.actionKey === actionKey);
  if (!movementAction) {
    return {
      routes: [],
      unresolved: [{
        actorPieceKey,
        proposalKey: proposal.proposalKey,
        actionKey,
        reason: "resource_suffix_movement_action_not_available",
      }],
    };
  }
  const moved = executeScopedWarmachineBenchmarkActionV2(
    scoped,
    movementAction,
    { actionKey },
    {
      routeKey: `resource-suffix-movement-discovery:${proposal.proposalKey}`,
    },
  );
  if (!moved.ok || (moved.receipt?.reactionRequirements || []).length) {
    return {
      routes: [],
      unresolved: [{
        actorPieceKey,
        proposalKey: proposal.proposalKey,
        actionKey,
        reason: !moved.ok
          ? moved.reason || "resource_suffix_movement_strict_rejected"
          : "resource_suffix_movement_opponent_reaction_required",
        receiptHash: String(moved.receipt?.receiptHash || ""),
      }],
    };
  }
  const movedState = moved.normalizedState || normalizeRulesV1State(moved.state);
  if (!warmachineBenchmarkRuntimeWindowActiveV2(movedState)) {
    return { routes: [], unresolved: [] };
  }
  const postMovementTarget = structuredClone(movedState);
  const postMovementActor = postMovementTarget.pieces.find((piece) =>
    piece.pieceKey === actorPieceKey);
  setPieceResourcePoints(postMovementActor, targetResourcePoints);
  postMovementTarget.stateKey = `resource-suffix-target-${stableGraphHash({
    movedStateHash: warmachineReverseStateSemanticHashV1(movedState),
    actorPieceKey,
    targetResourcePoints,
  }, 24)}`;
  const discovered = resourceSpendPrefixRoutes(
    normalizeRulesV1State(postMovementTarget),
    actorPieceKey,
    {
      ...rawOptions,
      includeResourceSpendPrefixes: true,
      maximumResourcePrefixTargets:
        rawOptions.maximumResourceSuffixTargets ??
        rawOptions.maximumResourcePrefixTargets,
      maximumResourcePrefixDepth:
        rawOptions.maximumResourceSuffixDepth ??
        rawOptions.maximumResourcePrefixDepth,
      maximumResourcePrefixLabels:
        rawOptions.maximumResourceSuffixLabels ??
        rawOptions.maximumResourcePrefixLabels,
      maximumResourcePrefixRoutes:
        rawOptions.maximumResourceSuffixRoutes ??
        rawOptions.maximumResourcePrefixRoutes,
      movementProposalKey: proposal.proposalKey,
      onProgress: (event = {}) => rawOptions.onProgress?.({
        ...event,
        stage: String(event.stage || "").replace(
          "resource_prefix",
          "resource_suffix",
        ),
      }),
    },
  );
  return {
    routes: discovered.routes.map((route) => ({
      ...route,
      predecessorState: normalizedPredecessor,
      movementFirst: true,
      resourceSpendOrder: "movement_then_resource_suffix",
      preActivationResourcePoints: resourceMax,
      restoredResourcePoints: resourceMax - targetResourcePoints,
    })),
    unresolved: discovered.unresolved.map((row) => ({
      ...row,
      reason: String(row.reason || "resource_suffix_unresolved").replace(
        "resource_prefix",
        "resource_suffix",
      ),
    })),
  };
}

function stripMovementProposal(stateInput = {}, pathKey = "") {
  const state = structuredClone(normalizeRulesV1State(stateInput));
  state.explicitMovementPaths = (state.explicitMovementPaths || []).filter((entry) =>
    String(entry.pathKey || entry.key || "") !== pathKey);
  for (const piece of state.pieces || []) {
    piece.explicitMovementPaths = (piece.explicitMovementPaths || []).filter((entry) =>
      String(entry.pathKey || entry.key || "") !== pathKey);
    if (piece.metadata?.explicitMovementPaths) {
      piece.metadata.explicitMovementPaths = piece.metadata.explicitMovementPaths.filter((entry) =>
        String(entry.pathKey || entry.key || "") !== pathKey);
    }
  }
  return normalizeRulesV1State(state);
}

function deploymentZoneForSide(rawOptions = {}, sideKey = "") {
  const deployments = rawOptions.deployments || {};
  const source = sideKey === "player1"
    ? deployments.p1_deploy || deployments.player1
    : deployments.p2_deploy || deployments.player2;
  if (!source) return null;
  return {
    x: numeric(source.x),
    y: numeric(source.y),
    width: Math.max(0, numeric(source.width)),
    height: Math.max(0, numeric(source.height)),
  };
}

function baseRadius(piece = {}) {
  return Math.max(0, numeric(piece.baseSizeIn ?? piece.baseDiameterIn, 1.18) / 2);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function predecessorOriginPlacementIssues(successor, actor, origin) {
  const issues = [];
  const actorRadius = baseRadius(actor);
  const boardWidth = numeric(successor.board?.widthIn, 48);
  const boardHeight = numeric(successor.board?.heightIn, 48);
  if (origin.xIn - actorRadius < -0.001 || origin.xIn + actorRadius > boardWidth + 0.001 ||
      origin.yIn - actorRadius < -0.001 || origin.yIn + actorRadius > boardHeight + 0.001) {
    issues.push({ reason: "reverse_predecessor_base_outside_table" });
  }
  for (const piece of successor.pieces || []) {
    if (piece.pieceKey === actor.pieceKey || !alive(piece)) continue;
    const minimumSeparationIn = actorRadius + baseRadius(piece);
    const observedSeparationIn = distance(origin, piece);
    if (observedSeparationIn + 0.001 >= minimumSeparationIn) continue;
    issues.push({
      reason: "reverse_predecessor_base_overlap",
      blockerPieceKey: piece.pieceKey,
      observedSeparationIn,
      minimumSeparationIn,
    });
  }
  return stableGraphValue(issues);
}

function killBoxBoundaryEventOrigins(
  successor,
  actor,
  destination,
  edgeKey,
  boundaryCoordinateIn,
  allowanceIn,
) {
  const horizontalBoundary = ["south", "north"].includes(edgeKey);
  const radiusIn = baseRadius(actor);
  const boardLimitIn = horizontalBoundary
    ? numeric(successor.board?.widthIn, 48)
    : numeric(successor.board?.heightIn, 48);
  const destinationLateralIn = horizontalBoundary
    ? destination.xIn
    : destination.yIn;
  const destinationPerpendicularIn = horizontalBoundary
    ? destination.yIn
    : destination.xIn;
  const perpendicularDistanceIn = Math.abs(
    boundaryCoordinateIn - destinationPerpendicularIn,
  );
  if (perpendicularDistanceIn > allowanceIn + 0.001) return [];
  const maximumLateralTravelIn = Math.sqrt(Math.max(
    0,
    allowanceIn ** 2 - perpendicularDistanceIn ** 2,
  ));
  const minimumLateralIn = Math.max(
    radiusIn,
    destinationLateralIn - maximumLateralTravelIn,
  );
  const maximumLateralIn = Math.min(
    boardLimitIn - radiusIn,
    destinationLateralIn + maximumLateralTravelIn,
  );
  if (minimumLateralIn > maximumLateralIn + 0.001) return [];
  const events = new Set([
    minimumLateralIn,
    maximumLateralIn,
    clamp(destinationLateralIn, minimumLateralIn, maximumLateralIn),
  ]);
  for (const blocker of (successor.pieces || []).filter((piece) =>
    piece.pieceKey !== actor.pieceKey && alive(piece))) {
    const blockerPosition = point(blocker);
    const blockerPerpendicularIn = horizontalBoundary
      ? blockerPosition.yIn
      : blockerPosition.xIn;
    const blockerLateralIn = horizontalBoundary
      ? blockerPosition.xIn
      : blockerPosition.yIn;
    const minimumSeparationIn = radiusIn + baseRadius(blocker);
    const perpendicularSeparationIn = Math.abs(
      blockerPerpendicularIn - boundaryCoordinateIn,
    );
    if (perpendicularSeparationIn >= minimumSeparationIn) continue;
    const blockedHalfWidthIn = Math.sqrt(Math.max(
      0,
      minimumSeparationIn ** 2 - perpendicularSeparationIn ** 2,
    ));
    for (const lateralIn of [
      blockerLateralIn - blockedHalfWidthIn - 0.01,
      blockerLateralIn + blockedHalfWidthIn + 0.01,
    ]) {
      if (lateralIn >= minimumLateralIn - 0.001 &&
          lateralIn <= maximumLateralIn + 0.001) {
        events.add(clamp(lateralIn, minimumLateralIn, maximumLateralIn));
      }
    }
  }
  const orderedEvents = [...events].sort((left, right) => left - right);
  const candidateCoordinates = new Set(orderedEvents);
  for (let index = 0; index + 1 < orderedEvents.length; index += 1) {
    candidateCoordinates.add((orderedEvents[index] + orderedEvents[index + 1]) / 2);
  }
  return [...candidateCoordinates].map((lateralIn) => {
    const origin = horizontalBoundary
      ? { xIn: lateralIn, yIn: boundaryCoordinateIn }
      : { xIn: boundaryCoordinateIn, yIn: lateralIn };
    return {
      origin,
      lateralOffsetIn: Math.abs(lateralIn - destinationLateralIn),
      originPlacementIssues: predecessorOriginPlacementIssues(
        successor,
        actor,
        origin,
      ),
    };
  }).filter((row) => distance(row.origin, destination) <= allowanceIn + 0.001)
    .sort((left, right) =>
      Number(left.originPlacementIssues.length > 0) -
        Number(right.originPlacementIssues.length > 0) ||
      left.lateralOffsetIn - right.lateralOffsetIn);
}

function leaderKillBoxAvoidanceOrigins(
  successor,
  actor,
  actionTypes,
  rawOptions = {},
) {
  const obligations = (rawOptions.predecessorStateObligations || []).filter((row) =>
    row.obligationKind === "leader_outside_killbox_before_first_penalty" &&
    row.leaderPieceKey === actor.pieceKey);
  if (!obligations.length) return { rows: [], omitted: [] };
  const destination = point(actor);
  const radiusIn = baseRadius(actor);
  const boardWidthIn = numeric(successor.board?.widthIn, 48);
  const boardHeightIn = numeric(successor.board?.heightIn, 48);
  const rows = [];
  for (const obligation of obligations) {
    const distanceIn = Math.max(0, numeric(obligation.killBoxDistanceIn, 12));
    for (const boundaryDepthIn of [0.01, 0.5]) {
      let boundaryCoordinateIn = null;
      if (obligation.ownTableEdgeKey === "south") {
        boundaryCoordinateIn = distanceIn - radiusIn + boundaryDepthIn;
      } else if (obligation.ownTableEdgeKey === "north") {
        boundaryCoordinateIn =
          boardHeightIn - distanceIn + radiusIn - boundaryDepthIn;
      } else if (obligation.ownTableEdgeKey === "west") {
        boundaryCoordinateIn = distanceIn - radiusIn + boundaryDepthIn;
      } else if (obligation.ownTableEdgeKey === "east") {
        boundaryCoordinateIn =
          boardWidthIn - distanceIn + radiusIn - boundaryDepthIn;
      }
      if (boundaryCoordinateIn == null) continue;
      for (const actionType of actionTypes) {
        const allowanceIn = actionType === "run"
          ? Math.max(0, numeric(actor.speedIn)) + 5
          : Math.max(0, numeric(actor.speedIn));
        const eventOrigins = killBoxBoundaryEventOrigins(
          successor,
          actor,
          destination,
          obligation.ownTableEdgeKey,
          boundaryCoordinateIn,
          allowanceIn,
        );
        for (const [eventIndex, eventOrigin] of eventOrigins.entries()) {
          rows.push({
            proposalKey: `${actor.pieceKey}:${actionType}:killbox-avoidance:${
              obligation.sourceScoringLedgerKey}:${boundaryDepthIn}:${eventIndex}`,
            actorPieceKey: actor.pieceKey,
            actionType,
            origin: eventOrigin.origin,
            waypoints: [destination],
            proposalAllowanceIn: allowanceIn,
            proposalSource: "first_killbox_penalty_preimage_v1",
            deploymentSlotKey: "",
            originPlacementIssues: eventOrigin.originPlacementIssues,
            relationKind: "leader_killbox_avoidance_origin",
            predecessorObligationKey: obligation.sourceScoringLedgerKey,
            ownTableEdgeKey: obligation.ownTableEdgeKey,
            killBoxDistanceIn: distanceIn,
            boundaryDepthIn,
            killBoxLateralOffsetIn: eventOrigin.lateralOffsetIn,
          });
        }
      }
    }
  }
  return {
    rows,
    omitted: obligations.map((obligation) => ({
      actorPieceKey: actor.pieceKey,
      sourceScoringLedgerKey: obligation.sourceScoringLedgerKey,
      reason: "leader_killbox_avoidance_alternative_position_sources_deferred",
      deferredAlternativeFamilies: obligation.deferredAlternativeFamilies || [],
    })),
  };
}

function activationGroupId(piece = {}) {
  return String(
    piece.unitGroupId || piece.unitId || piece.metadata?.unitGroupId ||
      piece.metadata?.unitId || piece.pieceKey || "",
  );
}

function activationGroupPieces(state = {}, actor = {}) {
  const groupId = activationGroupId(actor);
  if (!actor.unitGroupId && !actor.unitId && !actor.metadata?.unitGroupId &&
      !actor.metadata?.unitId) {
    return [actor].filter(Boolean);
  }
  return (state.pieces || []).filter((piece) =>
    alive(piece) && piece.sideKey === actor.sideKey && activationGroupId(piece) === groupId)
    .sort((left, right) => left.pieceKey.localeCompare(right.pieceKey));
}

function predecessorGroupPlacementIssues(successor, groupPieces, originsByPieceKey) {
  const issues = [];
  const movingPieceKeys = new Set(groupPieces.map((piece) => piece.pieceKey));
  const boardWidth = numeric(successor.board?.widthIn, 48);
  const boardHeight = numeric(successor.board?.heightIn, 48);
  for (const actor of groupPieces) {
    const origin = point(originsByPieceKey[actor.pieceKey]);
    const actorRadius = baseRadius(actor);
    if (origin.xIn - actorRadius < -0.001 ||
        origin.xIn + actorRadius > boardWidth + 0.001 ||
        origin.yIn - actorRadius < -0.001 ||
        origin.yIn + actorRadius > boardHeight + 0.001) {
      issues.push({
        reason: "reverse_predecessor_base_outside_table",
        actorPieceKey: actor.pieceKey,
      });
    }
    for (const piece of successor.pieces || []) {
      if (movingPieceKeys.has(piece.pieceKey) || !alive(piece)) continue;
      const minimumSeparationIn = actorRadius + baseRadius(piece);
      const observedSeparationIn = distance(origin, piece);
      if (observedSeparationIn + 0.001 >= minimumSeparationIn) continue;
      issues.push({
        reason: "reverse_predecessor_base_overlap",
        actorPieceKey: actor.pieceKey,
        blockerPieceKey: piece.pieceKey,
        observedSeparationIn,
        minimumSeparationIn,
      });
    }
  }
  for (let leftIndex = 0; leftIndex < groupPieces.length; leftIndex += 1) {
    const left = groupPieces[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < groupPieces.length; rightIndex += 1) {
      const right = groupPieces[rightIndex];
      const minimumSeparationIn = baseRadius(left) + baseRadius(right);
      const observedSeparationIn = distance(
        originsByPieceKey[left.pieceKey],
        originsByPieceKey[right.pieceKey],
      );
      if (observedSeparationIn + 0.001 >= minimumSeparationIn) continue;
      issues.push({
        reason: "reverse_predecessor_moving_group_base_overlap",
        actorPieceKey: left.pieceKey,
        blockerPieceKey: right.pieceKey,
        observedSeparationIn,
        minimumSeparationIn,
      });
    }
  }
  return stableGraphValue(issues);
}

function deploymentOriginCandidates(successor, actor, bounds, nearest, rawOptions = {}) {
  const gapIn = Math.max(0.001, numeric(rawOptions.deploymentSlotGapIn, 0.05));
  const maximumOrigins = Math.max(1, Math.floor(numeric(
    rawOptions.maximumDeploymentSlotOrigins,
    16,
  )));
  const maximumRings = Math.max(0, Math.floor(numeric(
    rawOptions.maximumDeploymentSlotRings,
    3,
  )));
  const actorRadius = baseRadius(actor);
  const otherPieces = (successor.pieces || []).filter((piece) =>
    piece.pieceKey !== actor.pieceKey && alive(piece)).sort((left, right) =>
    String(left.pieceKey).localeCompare(String(right.pieceKey)));
  const maximumSeparationIn = otherPieces.reduce((maximum, piece) =>
    Math.max(maximum, actorRadius + baseRadius(piece) + gapIn),
  Math.max(2 * actorRadius + gapIn, 0.25));
  const rows = [{
    slotKey: "nearest",
    origin: nearest,
    proposalSource: "nearest_strict_deployment_projection_v1",
  }];
  const directions = [
    { key: "south", x: 0, y: -1 },
    { key: "north", x: 0, y: 1 },
    { key: "west", x: -1, y: 0 },
    { key: "east", x: 1, y: 0 },
    { key: "southwest", x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
    { key: "northwest", x: -Math.SQRT1_2, y: Math.SQRT1_2 },
    { key: "southeast", x: Math.SQRT1_2, y: -Math.SQRT1_2 },
    { key: "northeast", x: Math.SQRT1_2, y: Math.SQRT1_2 },
  ];
  const addOffsetRows = (
    center,
    separationIn,
    keyPrefix,
    proposalSource = "finite_base_aware_deployment_slot_v1",
    reservation = null,
  ) => {
    for (const direction of directions) {
      rows.push({
        slotKey: `${keyPrefix}:${direction.key}`,
        origin: {
          xIn: clamp(center.xIn + direction.x * separationIn, bounds.xMin, bounds.xMax),
          yIn: clamp(center.yIn + direction.y * separationIn, bounds.yMin, bounds.yMax),
        },
        proposalSource,
        ...(reservation ? {
          reservedDeploymentPieceKey: reservation.pieceKey,
          reservedDeploymentOrigin: reservation.origin,
          reservedDeploymentSeparationIn: reservation.separationIn,
        } : {}),
      });
    }
  };
  const reservedDeploymentPieceKeys = new Set(
    (rawOptions.reservedDeploymentPieceKeys || []).map(String),
  );
  for (const reservedPiece of otherPieces.filter((piece) =>
    reservedDeploymentPieceKeys.has(piece.pieceKey))) {
    const reservedRadius = baseRadius(reservedPiece);
    const zoneBounds = {
      xMin: bounds.xMin - actorRadius,
      xMax: bounds.xMax + actorRadius,
      yMin: bounds.yMin - actorRadius,
      yMax: bounds.yMax + actorRadius,
    };
    const reservedProjection = {
      xIn: clamp(
        point(reservedPiece).xIn,
        zoneBounds.xMin + reservedRadius,
        zoneBounds.xMax - reservedRadius,
      ),
      yIn: clamp(
        point(reservedPiece).yIn,
        zoneBounds.yMin + reservedRadius,
        zoneBounds.yMax - reservedRadius,
      ),
    };
    const reservedSeparationIn = actorRadius + reservedRadius + gapIn;
    addOffsetRows(
      reservedProjection,
      reservedSeparationIn,
      `reserved:${reservedPiece.pieceKey}`,
      "finite_future_deployment_reservation_slot_v1",
      {
        pieceKey: reservedPiece.pieceKey,
        origin: reservedProjection,
        separationIn: reservedSeparationIn,
      },
    );
  }
  const nearestBlockingPieces = [];
  for (const piece of otherPieces) {
    const piecePosition = point(piece);
    const separationIn = actorRadius + baseRadius(piece) + gapIn;
    if (distance(nearest, piecePosition) > separationIn + 0.001) continue;
    nearestBlockingPieces.push(piece);
    addOffsetRows(piecePosition, separationIn, `around:${piece.pieceKey}`);
  }
  if (nearestBlockingPieces.length ||
      rawOptions.includeDeploymentSlotAlternatives === true) {
    for (let ring = 1; ring <= maximumRings; ring += 1) {
      addOffsetRows(nearest, maximumSeparationIn * ring, `nearest-ring:${ring}`);
    }
  }
  const unique = new Map();
  for (const row of rows) {
    const key = stableGraphHash(point(row.origin), 20);
    const originPlacementIssues = predecessorOriginPlacementIssues(
      successor,
      actor,
      point(row.origin),
    );
    if (row.reservedDeploymentOrigin && distance(
      row.origin,
      row.reservedDeploymentOrigin,
    ) + 0.001 < numeric(row.reservedDeploymentSeparationIn)) {
      originPlacementIssues.push({
        reason: "reverse_reserved_deployment_slot_overlap",
        actorPieceKey: actor.pieceKey,
        blockerPieceKey: row.reservedDeploymentPieceKey,
        observedSeparationIn: distance(row.origin, row.reservedDeploymentOrigin),
        minimumSeparationIn: numeric(row.reservedDeploymentSeparationIn),
      });
    }
    if (!unique.has(key)) unique.set(key, {
      ...row,
      originPlacementIssues: stableGraphValue(originPlacementIssues),
    });
  }
  const ordered = [...unique.values()].sort((left, right) =>
    Number(left.originPlacementIssues.length > 0) -
      Number(right.originPlacementIssues.length > 0) ||
    Number(right.slotKey === "nearest") - Number(left.slotKey === "nearest") ||
    Number(right.slotKey.startsWith("reserved:")) -
      Number(left.slotKey.startsWith("reserved:")) ||
    distance(left.origin, nearest) - distance(right.origin, nearest) ||
    left.slotKey.localeCompare(right.slotKey));
  return {
    candidates: ordered.slice(0, maximumOrigins),
    omitted: ordered.slice(maximumOrigins).map((row) => stableGraphValue({
      slotKey: row.slotKey,
      origin: row.origin,
      proposalSource: row.proposalSource,
      originPlacementIssues: row.originPlacementIssues,
      reason: "deployment_slot_origin_budget_exhausted",
    })),
  };
}

function terrainExpandedBounds(terrain = {}, paddingIn = 0) {
  const halfWidthIn = Math.max(0, numeric(terrain.widthIn ?? terrain.width,
    numeric(terrain.radiusIn) * 2)) / 2;
  const halfHeightIn = Math.max(0, numeric(terrain.heightIn ?? terrain.height,
    numeric(terrain.radiusIn) * 2)) / 2;
  const angleRad = numeric(terrain.rotationDegrees) * Math.PI / 180;
  const extentXIn = Math.abs(Math.cos(angleRad)) * halfWidthIn +
    Math.abs(Math.sin(angleRad)) * halfHeightIn + paddingIn;
  const extentYIn = Math.abs(Math.sin(angleRad)) * halfWidthIn +
    Math.abs(Math.cos(angleRad)) * halfHeightIn + paddingIn;
  const center = point(terrain);
  return {
    xMin: center.xIn - extentXIn,
    xMax: center.xIn + extentXIn,
    yMin: center.yIn - extentYIn,
    yMax: center.yIn + extentYIn,
  };
}

function controllerControlRangeResourceOrigins(successor, actor, actionTypes) {
  if (!actionTypes.includes("run") || actor.isWarjack !== true) {
    return { rows: [], omitted: [] };
  }
  const controllerPieceKey = String(actor.controllerPieceKey ||
    actor.battlegroupControllerPieceKey || actor.metadata?.controllerPieceKey || "");
  const controller = (successor.pieces || []).find((piece) =>
    piece.pieceKey === controllerPieceKey && alive(piece));
  if (!controller) return { rows: [], omitted: [] };
  const controlRangeIn = Math.max(0, numeric(
    controller.controlRangeIn ?? controller.ctrl,
    numeric(controller.arc) * 2,
  ));
  if (controlRangeIn <= 0) return { rows: [], omitted: [] };
  const destination = point(actor);
  const controllerPosition = point(controller);
  const centerDistanceIn = distance(controllerPosition, destination);
  const maximumCenterDistanceIn = Math.max(0,
    controlRangeIn + baseRadius(controller) + baseRadius(actor) - 0.05);
  const runAllowanceIn = Math.max(0, numeric(actor.speedIn) + 5);
  if (centerDistanceIn <= maximumCenterDistanceIn + 0.001 ||
      centerDistanceIn - maximumCenterDistanceIn > runAllowanceIn + 0.001) {
    return { rows: [], omitted: [] };
  }
  const directionRad = Math.atan2(
    destination.yIn - controllerPosition.yIn,
    destination.xIn - controllerPosition.xIn,
  );
  const radialRows = [0, -15, 15, -30, 30, -45, 45].map((offsetDeg) => {
    const angleRad = directionRad + offsetDeg * Math.PI / 180;
    const origin = {
      xIn: controllerPosition.xIn + Math.cos(angleRad) * maximumCenterDistanceIn,
      yIn: controllerPosition.yIn + Math.sin(angleRad) * maximumCenterDistanceIn,
    };
    return {
      proposalKey: `${actor.pieceKey}:run:controller-control-range:${offsetDeg}`,
      actorPieceKey: actor.pieceKey,
      actionType: "run",
      origin,
      waypoints: [destination],
      proposalAllowanceIn: runAllowanceIn,
      proposalSource: "controller_control_range_resource_origin_v1",
      deploymentSlotKey: `controller-control-range:${offsetDeg}`,
      originPlacementIssues: predecessorOriginPlacementIssues(
        successor,
        actor,
        origin,
      ),
      relationKind: "controller_control_range_resource_origin",
    };
  }).filter((row) => distance(row.origin, destination) <= runAllowanceIn + 0.001);
  const cornerRows = [];
  for (const terrain of (successor.terrain || []).filter((entry) =>
    entry.blocksMovement === true)) {
    const bounds = terrainExpandedBounds(terrain, baseRadius(actor) + 0.8);
    const corners = {
      southwest: { xIn: bounds.xMin - 0.01, yIn: bounds.yMin - 0.01 },
      southeast: { xIn: bounds.xMax + 0.01, yIn: bounds.yMin - 0.01 },
      northwest: { xIn: bounds.xMin - 0.01, yIn: bounds.yMax + 0.01 },
      northeast: { xIn: bounds.xMax + 0.01, yIn: bounds.yMax + 0.01 },
    };
    const adjacentCorners = {
      southwest: ["northwest", "southeast"],
      southeast: ["northeast", "southwest"],
      northwest: ["southwest", "northeast"],
      northeast: ["southeast", "northwest"],
    };
    for (const [cornerKey, origin] of Object.entries(corners)) {
      if (distance(controllerPosition, origin) > maximumCenterDistanceIn + 0.001) {
        continue;
      }
      for (const viaCornerKey of adjacentCorners[cornerKey]) {
        const via = corners[viaCornerKey];
        const proposedPathLengthIn = distance(origin, via) +
          distance(via, destination);
        if (proposedPathLengthIn > runAllowanceIn + 0.001) continue;
        cornerRows.push({
          proposalKey: `${actor.pieceKey}:run:controller-control-range-blocker:${
            terrain.terrainKey || "terrain"}:${cornerKey}:via:${viaCornerKey}`,
          actorPieceKey: actor.pieceKey,
          actionType: "run",
          origin,
          waypoints: [via, destination],
          proposalAllowanceIn: runAllowanceIn,
          proposalSource: "controller_control_range_blocker_corner_route_v1",
          deploymentSlotKey: `controller-control-range-blocker:${
            terrain.terrainKey || "terrain"}:${cornerKey}:via:${viaCornerKey}`,
          originPlacementIssues: predecessorOriginPlacementIssues(
            successor,
            actor,
            origin,
          ),
          relationKind: "controller_control_range_blocker_corner_origin",
        });
      }
    }
  }
  return {
    rows: [...cornerRows, ...radialRows],
    omitted: [{
      actorPieceKey: actor.pieceKey,
      controllerPieceKey,
      reason: "controller_control_range_origin_continuum_deferred",
      sampledOffsetDegrees: [0, -15, 15, -30, 30, -45, 45],
      sampledBlockingTerrainKeys: [...new Set(cornerRows.map((row) =>
        row.deploymentSlotKey.split(":")[1]))].sort(),
    }],
  };
}

function controllerPowerUpAvoidanceOrigins(successor, actor, actionTypes) {
  const canRunWithoutFocus = actor.runWithoutSpendingFocus === true ||
    actor.freeRun === true || actor.freeRunCharge === true ||
    actor.runWithoutBeingForced === true;
  if (!actionTypes.includes("run") || actor.isWarjack !== true ||
      !canRunWithoutFocus || actorResourcePoints(successor, actor.pieceKey) !== 0) {
    return { rows: [], omitted: [] };
  }
  const controllerPieceKey = String(actor.controllerPieceKey ||
    actor.battlegroupControllerPieceKey || actor.metadata?.controllerPieceKey || "");
  const controller = (successor.pieces || []).find((piece) =>
    piece.pieceKey === controllerPieceKey && alive(piece));
  if (!controller) return { rows: [], omitted: [] };
  const controlRangeIn = Math.max(0, numeric(
    controller.controlRangeIn ?? controller.ctrl,
    numeric(controller.arc) * 2,
  ));
  if (controlRangeIn <= 0) return { rows: [], omitted: [] };
  const destination = point(actor);
  const controllerPosition = point(controller);
  const maximumPowerUpCenterDistanceIn =
    controlRangeIn + baseRadius(controller) + baseRadius(actor);
  const avoidanceRadiusIn = maximumPowerUpCenterDistanceIn + 0.05;
  const runAllowanceIn = Math.max(0, numeric(actor.speedIn) + 5);
  const directionRad = Math.atan2(
    destination.yIn - controllerPosition.yIn,
    destination.xIn - controllerPosition.xIn,
  );
  const normalizeAngle = (angleRad) => {
    const fullCircle = Math.PI * 2;
    return ((angleRad % fullCircle) + fullCircle) % fullCircle;
  };
  const angleEvents = new Set([
    directionRad,
    ...[10, 20, 30, 45, 60, 75, 90].flatMap((offsetDeg) => [
      directionRad - offsetDeg * Math.PI / 180,
      directionRad + offsetDeg * Math.PI / 180,
    ]),
  ].map((angleRad) => normalizeAngle(angleRad)));
  const addCircleIntersectionAngles = (otherCenter, otherRadiusIn) => {
    const centerDistanceIn = distance(controllerPosition, otherCenter);
    if (centerDistanceIn <= 0.000001) return;
    const cosine = (
      avoidanceRadiusIn ** 2 + centerDistanceIn ** 2 - otherRadiusIn ** 2
    ) / (2 * avoidanceRadiusIn * centerDistanceIn);
    if (cosine < -1.000001 || cosine > 1.000001) return;
    const centerAngleRad = Math.atan2(
      otherCenter.yIn - controllerPosition.yIn,
      otherCenter.xIn - controllerPosition.xIn,
    );
    const deltaRad = Math.acos(Math.max(-1, Math.min(1, cosine)));
    angleEvents.add(normalizeAngle(centerAngleRad - deltaRad));
    angleEvents.add(normalizeAngle(centerAngleRad + deltaRad));
  };
  addCircleIntersectionAngles(destination, runAllowanceIn);
  const actorRadiusIn = baseRadius(actor);
  for (const blocker of (successor.pieces || []).filter((piece) =>
    piece.pieceKey !== actor.pieceKey && alive(piece))) {
    addCircleIntersectionAngles(
      point(blocker),
      actorRadiusIn + baseRadius(blocker),
    );
  }
  const boardWidthIn = numeric(successor.board?.widthIn, 48);
  const boardHeightIn = numeric(successor.board?.heightIn, 48);
  for (const xIn of [actorRadiusIn, boardWidthIn - actorRadiusIn]) {
    const cosine = (xIn - controllerPosition.xIn) / avoidanceRadiusIn;
    if (cosine < -1 || cosine > 1) continue;
    const angleRad = Math.acos(cosine);
    angleEvents.add(normalizeAngle(angleRad));
    angleEvents.add(normalizeAngle(-angleRad));
  }
  for (const yIn of [actorRadiusIn, boardHeightIn - actorRadiusIn]) {
    const sine = (yIn - controllerPosition.yIn) / avoidanceRadiusIn;
    if (sine < -1 || sine > 1) continue;
    const angleRad = Math.asin(sine);
    angleEvents.add(normalizeAngle(angleRad));
    angleEvents.add(normalizeAngle(Math.PI - angleRad));
  }
  const orderedEvents = [...angleEvents].sort((left, right) => left - right);
  const candidateAngles = new Set(orderedEvents);
  for (let index = 0; index < orderedEvents.length; index += 1) {
    const left = orderedEvents[index];
    const right = index + 1 < orderedEvents.length
      ? orderedEvents[index + 1]
      : orderedEvents[0] + Math.PI * 2;
    candidateAngles.add(normalizeAngle(left + (right - left) / 2));
  }
  const rows = [...candidateAngles].sort((left, right) => left - right)
    .map((angleRad, index) => {
    const origin = {
      xIn: controllerPosition.xIn + Math.cos(angleRad) *
        avoidanceRadiusIn,
      yIn: controllerPosition.yIn + Math.sin(angleRad) *
        avoidanceRadiusIn,
    };
    return {
      proposalKey: `${actor.pieceKey}:run:avoid-power-up:angular-cell:${index}`,
      actorPieceKey: actor.pieceKey,
      actionType: "run",
      origin,
      waypoints: [destination],
      proposalAllowanceIn: runAllowanceIn,
      proposalSource: "controller_power_up_avoidance_angular_cells_v1",
      deploymentSlotKey: `avoid-power-up:angular-cell:${index}`,
      originPlacementIssues: predecessorOriginPlacementIssues(
        successor,
        actor,
        origin,
      ),
      relationKind: "controller_control_range_power_up_avoidance_origin",
    };
  }).filter((row) => distance(row.origin, destination) <= runAllowanceIn + 0.001);
  return {
    rows,
    omitted: rows.length ? [{
      actorPieceKey: actor.pieceKey,
      controllerPieceKey,
      reason: "controller_power_up_avoidance_radial_depth_deferred",
      angularCellCount: candidateAngles.size,
      avoidanceRadiusIn,
    }] : [],
  };
}

export function enumerateWarmachineControllerPowerUpAvoidanceOriginsV1(
  stateInput = {},
  actorPieceKey = "",
) {
  const state = normalizeRulesV1State(stateInput);
  const actor = (state.pieces || []).find((piece) =>
    piece.pieceKey === actorPieceKey);
  if (!actor) throw new Error("power_up_avoidance_actor_not_found");
  return stableGraphValue(controllerPowerUpAvoidanceOrigins(
    state,
    actor,
    ["run"],
  ));
}

function generatedOriginsForActor(successor, actor, rawOptions = {}) {
  const destination = point(actor);
  const actionTypes = Array.isArray(rawOptions.actionTypes)
    ? rawOptions.actionTypes.map(String)
    : ["advance", "run"];
  const rows = [];
  const omitted = [];
  const killBoxAvoidanceOrigins = leaderKillBoxAvoidanceOrigins(
    successor,
    actor,
    actionTypes,
    rawOptions,
  );
  rows.push(...killBoxAvoidanceOrigins.rows);
  omitted.push(...killBoxAvoidanceOrigins.omitted);
  const resourcePrefixOrigins = resourcePrefixSpellRangeOrigins(
    successor,
    actor,
    actionTypes,
    rawOptions,
  );
  rows.push(...resourcePrefixOrigins.rows);
  omitted.push(...resourcePrefixOrigins.omitted);
  const powerUpAvoidanceOrigins = controllerPowerUpAvoidanceOrigins(
    successor,
    actor,
    actionTypes,
  );
  rows.push(...powerUpAvoidanceOrigins.rows);
  omitted.push(...powerUpAvoidanceOrigins.omitted);
  const controllerResourceOrigins = controllerControlRangeResourceOrigins(
    successor,
    actor,
    actionTypes,
  );
  rows.push(...controllerResourceOrigins.rows);
  omitted.push(...controllerResourceOrigins.omitted);
  if (actionTypes.includes("run") &&
      (actor.isWarjack === true || actor.isWarbeast === true)) {
    rows.push({
      proposalKey: `${actor.pieceKey}:run:zero-distance-resource-spend`,
      actorPieceKey: actor.pieceKey,
      actionType: "run",
      origin: destination,
      waypoints: [destination],
      proposalAllowanceIn: numeric(actor.speedIn, 0) + 5,
      proposalSource: "zero_distance_resource_spend_v1",
      deploymentSlotKey: "",
      originPlacementIssues: predecessorOriginPlacementIssues(
        successor,
        actor,
        destination,
      ),
      relationKind: "same_position_run_resource_preimage",
    });
  }
  const zone = deploymentZoneForSide(rawOptions, actor.sideKey);
  if (zone) {
    const radius = baseRadius(actor);
    const bounds = {
      xMin: zone.x - zone.width / 2 + radius,
      xMax: zone.x + zone.width / 2 - radius,
      yMin: zone.y - zone.height / 2 + radius,
      yMax: zone.y + zone.height / 2 - radius,
    };
    const nearestOrigin = {
      xIn: clamp(destination.xIn, bounds.xMin, bounds.xMax),
      yIn: clamp(destination.yIn, bounds.yMin, bounds.yMax),
    };
    const deploymentOriginDomain = deploymentOriginCandidates(
      successor,
      actor,
      bounds,
      nearestOrigin,
      rawOptions,
    );
    omitted.push(...deploymentOriginDomain.omitted);
    for (const [deploymentOriginOrdinal, deploymentOrigin] of
      deploymentOriginDomain.candidates.entries()) {
      for (const actionType of actionTypes) {
        const speedIn = numeric(actor.speedIn, 0);
        const allowance = actionType === "run" ? speedIn + 5 : speedIn;
        const deploymentDistance = distance(deploymentOrigin.origin, destination);
        if (!samePoint(deploymentOrigin.origin, destination) &&
            deploymentDistance <= allowance + 0.001) {
          rows.push({
            proposalKey: `${actor.pieceKey}:${actionType}:deployment-slot:${deploymentOrigin.slotKey}`,
            actorPieceKey: actor.pieceKey,
            actionType,
            origin: deploymentOrigin.origin,
            waypoints: [destination],
            proposalAllowanceIn: allowance,
            proposalSource: deploymentOrigin.proposalSource,
            deploymentSlotKey: deploymentOrigin.slotKey,
            deploymentOriginOrdinal,
            originPlacementIssues: predecessorOriginPlacementIssues(
              successor,
              actor,
              deploymentOrigin.origin,
            ),
            relationKind: "deployment_to_successor_straight_path",
          });
        } else if (deploymentDistance > allowance + 0.001 && allowance > 0) {
          for (const stepFraction of [1, 0.75, 0.5, 0.25]) {
            const ratio = (allowance * stepFraction) / deploymentDistance;
            const steppedOrigin = {
              xIn: destination.xIn +
                (deploymentOrigin.origin.xIn - destination.xIn) * ratio,
              yIn: destination.yIn +
                (deploymentOrigin.origin.yIn - destination.yIn) * ratio,
            };
            rows.push({
              proposalKey: `${actor.pieceKey}:${actionType}:step-${stepFraction}:${deploymentOrigin.slotKey}`,
              actorPieceKey: actor.pieceKey,
              actionType,
              origin: steppedOrigin,
              waypoints: [destination],
              proposalAllowanceIn: allowance,
              proposalSource: "finite_step_toward_strict_deployment_v1",
              deploymentSlotKey: deploymentOrigin.slotKey,
              deploymentOriginOrdinal,
              originPlacementIssues: predecessorOriginPlacementIssues(
                successor,
                actor,
                steppedOrigin,
              ),
              relationKind: "earlier_turn_progress_toward_deployment",
              stepFraction,
            });
          }
        }
      }
    }
    const members = activationGroupPieces(successor, actor);
    if (members.length > 1 &&
        rawOptions.includeUnitDeploymentFormationAlternatives === true) {
      for (const actionType of actionTypes) {
        const formationDomain =
          generateWarmachineUnitDeploymentFormationPredecessorsV1({
            members,
            otherPieces: successor.pieces || [],
            deploymentZone: zone,
            actionType,
            gapIn: rawOptions.deploymentSlotGapIn,
            gridStepIn: rawOptions.unitDeploymentFormationGridStepIn,
            rotationCount: rawOptions.unitDeploymentFormationRotationCount,
            maximumCandidates:
              rawOptions.maximumUnitDeploymentFormationCandidates,
            validateCandidate: (formation) => {
              const candidateState = structuredClone(successor);
              for (const member of members) {
                const candidatePiece = candidateState.pieces.find((piece) =>
                  piece.pieceKey === member.pieceKey);
                if (candidatePiece &&
                    formation.originsByPieceKey?.[member.pieceKey]) {
                  candidatePiece.position = point(
                    formation.originsByPieceKey[member.pieceKey],
                  );
                }
              }
              const audit = auditWarmachineReverseStateBoundaryV1(
                candidateState,
                {
                  boundaryKind: "unit_deployment_formation_predecessor",
                  requireStaticUnitFormation: true,
                },
              );
              const summary =
                summarizeWarmachineReverseStateBoundaryAuditV1(audit);
              return {
                ok: audit.ok,
                auditHash: summary.auditHash,
                issueCodes: summary.issueCodes,
                hostStaticPlacementPassed:
                  summary.hostStaticPlacementPassed,
                hostStaticUnitFormationPassed:
                  summary.hostStaticUnitFormationPassed,
              };
            },
          });
        if (!formationDomain.candidates.length) {
          omitted.push(stableGraphValue({
            actorPieceKey: actor.pieceKey,
            actionType,
            reason: "unit_deployment_formation_candidate_not_found",
            reportHash: formationDomain.reportHash || "",
            testedAssignmentCount:
              formationDomain.testedAssignmentCount || 0,
            candidateValidationRejectedCount:
              formationDomain.candidateValidationRejectedCount || 0,
            candidateValidationRejectedIssueCodes:
              formationDomain.candidateValidationRejectedIssueCodes || [],
          }));
        }
        for (const [deploymentOriginOrdinal, formation] of
          formationDomain.candidates.entries()) {
          const actorOrigin = formation.originsByPieceKey[actor.pieceKey];
          rows.push({
            proposalKey: `${actor.pieceKey}:${actionType}:unit-deployment-formation:${formation.candidateKey}`,
            actorPieceKey: actor.pieceKey,
            actionType,
            origin: actorOrigin,
            originsByPieceKey: formation.originsByPieceKey,
            waypoints: [destination],
            proposalAllowanceIn: actionType === "run"
              ? numeric(actor.speedIn) + 5
              : numeric(actor.speedIn),
            proposalSource: "finite_unit_deployment_formation_v1",
            deploymentSlotKey: formation.candidateKey,
            deploymentOriginOrdinal,
            originPlacementIssues: [],
            relationKind: "unit_group_deployment_reformation",
            unitDeploymentFormationEvidence: stableGraphValue({
              candidateKey: formation.candidateKey,
              assignmentKey: formation.assignmentKey,
              maximumMovementDistanceIn:
                formation.maximumMovementDistanceIn,
              totalMovementDistanceIn: formation.totalMovementDistanceIn,
              trajectoryAudit: formation.trajectoryAudit,
              reportHash: formationDomain.reportHash,
            }),
          });
        }
      }
    }
  }
  const supplied = Array.isArray(rawOptions.originProposals)
    ? rawOptions.originProposals.filter((row) =>
      !row.actorPieceKey || row.actorPieceKey === actor.pieceKey)
    : [];
  rows.push(...supplied.map((row, index) => ({
    proposalKey: String(row.proposalKey ||
      `${actor.pieceKey}:${row.actionType || "advance"}:supplied:${index}`),
    actorPieceKey: actor.pieceKey,
    actionType: row.actionType === "run" ? "run" : "advance",
    origin: point(row.origin),
    waypoints: (row.waypoints || [destination]).map(point),
    originsByPieceKey: row.originsByPieceKey,
    destinationsByPieceKey: row.destinationsByPieceKey,
    pathsByModel: row.pathsByModel,
    proposalPriority: Number.isFinite(Number(row.proposalPriority))
      ? Number(row.proposalPriority)
      : 0,
    proposalAllowanceIn: row.proposalAllowanceIn == null
      ? null
      : Math.max(0, Number(row.proposalAllowanceIn)),
    proposalSource: String(row.proposalSource || "caller_terminal_relation_materializer"),
    deploymentSlotKey: String(row.deploymentSlotKey || "supplied"),
    originPlacementIssues: predecessorOriginPlacementIssues(
      successor,
      actor,
      point(row.origin),
    ),
    relationKind: String(row.relationKind || "supplied_explicit_path"),
    resourceRefund: Math.max(0, Number(row.resourceRefund || 0)),
  })));
  const unique = new Map();
  for (const row of rows) {
    if (!row.origin) continue;
    const resourceSpendingZeroDistanceRun =
      samePoint(row.origin, destination) && row.actionType === "run" &&
      (actor.isWarjack === true || actor.isWarbeast === true);
    if (samePoint(row.origin, destination) && !resourceSpendingZeroDistanceRun) continue;
    const identity = stableGraphValue({
      actorPieceKey: row.actorPieceKey,
      actionType: row.actionType,
      origin: row.origin,
      waypoints: row.waypoints,
      proposalAllowanceIn: row.proposalAllowanceIn,
      deploymentSlotKey: row.deploymentSlotKey,
      originPlacementIssues: row.originPlacementIssues,
      originsByPieceKey: row.originsByPieceKey,
      pathsByModel: row.pathsByModel,
      resourceRefund: row.resourceRefund || 0,
    });
    unique.set(stableGraphHash(identity), { ...row, identity });
  }
  const proposals = [...unique.values()].sort((left, right) =>
      numeric(left.proposalPriority, 0) - numeric(right.proposalPriority, 0) ||
      Number(left.originPlacementIssues.length > 0) -
        Number(right.originPlacementIssues.length > 0) ||
      Number(right.relationKind === "leader_killbox_avoidance_origin") -
        Number(left.relationKind === "leader_killbox_avoidance_origin") ||
      numeric(left.killBoxLateralOffsetIn, 1_000_000) -
        numeric(right.killBoxLateralOffsetIn, 1_000_000) ||
      Number(right.relationKind === "resource_prefix_spell_range_origin") -
        Number(left.relationKind === "resource_prefix_spell_range_origin") ||
      Number(right.relationKind ===
        "controller_control_range_blocker_corner_origin") -
        Number(left.relationKind ===
          "controller_control_range_blocker_corner_origin") ||
      Number(right.relationKind ===
        "controller_control_range_power_up_avoidance_origin") -
        Number(left.relationKind ===
          "controller_control_range_power_up_avoidance_origin") ||
      Number(right.relationKind === "controller_control_range_resource_origin") -
        Number(left.relationKind === "controller_control_range_resource_origin") ||
      Number(right.relationKind === "deployment_to_successor_straight_path") -
        Number(left.relationKind === "deployment_to_successor_straight_path") ||
      Number(right.relationKind === "unit_group_deployment_reformation") -
        Number(left.relationKind === "unit_group_deployment_reformation") ||
      numeric(left.deploymentOriginOrdinal, 1_000_000) -
        numeric(right.deploymentOriginOrdinal, 1_000_000) ||
      numeric(right.stepFraction, 0) - numeric(left.stepFraction, 0) ||
      distance(right.origin, destination) - distance(left.origin, destination) ||
      left.proposalKey.localeCompare(right.proposalKey));
  if (rawOptions.prioritizeResourceContinuityFallbacks === true) {
    proposals.sort((left, right) =>
      Number(right.relationKind === "resource_prefix_spell_range_origin") -
        Number(left.relationKind === "resource_prefix_spell_range_origin") ||
      Number(right.relationKind === "same_position_run_resource_preimage") -
        Number(left.relationKind === "same_position_run_resource_preimage"));
  }
  return {
    proposals,
    omitted,
  };
}

function materializeActivationGroupProposal(successor, actor, proposal) {
  const members = activationGroupPieces(successor, actor);
  const actorDestination = point(actor);
  const actorOrigin = point(proposal.origin);
  const offset = {
    xIn: actorOrigin.xIn - actorDestination.xIn,
    yIn: actorOrigin.yIn - actorDestination.yIn,
  };
  const suppliedOrigins = proposal.originsByPieceKey || {};
  const originsByPieceKey = Object.fromEntries(members.map((member) => [
    member.pieceKey,
    suppliedOrigins[member.pieceKey]
      ? point(suppliedOrigins[member.pieceKey])
      : {
        xIn: point(member).xIn + offset.xIn,
        yIn: point(member).yIn + offset.yIn,
      },
  ]));
  const destinationsByPieceKey = Object.fromEntries(members.map((member) => [
    member.pieceKey,
    point(member),
  ]));
  const pathsByModel = members.map((member) => ({
    pieceKey: member.pieceKey,
    waypoints: [destinationsByPieceKey[member.pieceKey]],
  }));
  const groupProposal = {
    ...proposal,
    activationGroupId: activationGroupId(actor),
    activationGroupPieceKeys: members.map((member) => member.pieceKey),
    originsByPieceKey,
    destinationsByPieceKey,
    pathsByModel,
    originPlacementIssues: predecessorGroupPlacementIssues(
      successor,
      members,
      originsByPieceKey,
    ),
    relationKind: members.length > 1 &&
        !String(proposal.relationKind || "").startsWith("unit_group_")
      ? `unit_group_translation:${proposal.relationKind}`
      : proposal.relationKind,
  };
  groupProposal.identity = stableGraphValue({
    ...proposal.identity,
    activationGroupId: groupProposal.activationGroupId,
    activationGroupPieceKeys: groupProposal.activationGroupPieceKeys,
    originsByPieceKey,
    destinationsByPieceKey,
  });
  return groupProposal;
}

function hostPathProposalVariants(cleanPredecessor, proposal) {
  if (samePoint(proposal.origin,
    proposal.destinationsByPieceKey?.[proposal.actorPieceKey] ||
      proposal.waypoints?.at(-1))) {
    return [proposal];
  }
  if (proposal.relationKind ===
      "controller_control_range_blocker_corner_origin") {
    return [proposal];
  }
  if ((proposal.activationGroupPieceKeys || []).length > 1) {
    const destination =
      proposal.destinationsByPieceKey?.[proposal.actorPieceKey];
    if (!destination) return [proposal];
    const plan = buildRulesV1MovementPathProposalPlan(cleanPredecessor, {
      actorPieceKey: proposal.actorPieceKey,
      actionType: proposal.actionType,
      destination,
      ignoredPieceKeys: [proposal.actorPieceKey],
      targetKey: proposal.proposalKey,
      keyBase: `${proposal.proposalKey}:${proposal.actorPieceKey}`,
    });
    if (!plan.ok || !plan.proposals?.length) return [proposal];
    return plan.proposals.map((pathProposal) => {
      const actorPath = pathProposal.waypoints.map(point);
      const pathsByModel = proposal.activationGroupPieceKeys.map((pieceKey) => ({
        pieceKey,
        waypoints: pieceKey === proposal.actorPieceKey
          ? actorPath
          : [point(proposal.destinationsByPieceKey[pieceKey])],
      }));
      const variant = {
        ...proposal,
        proposalKey: `${proposal.proposalKey}:path:${pathProposal.proposalKey}`,
        proposalSource: pathProposal.proposalKind === "host_auto_routed"
          ? "host_per_model_auto_routed_reverse_path_v1"
          : proposal.proposalSource,
        waypoints: actorPath,
        pathsByModel,
        hostPathProposal: stableGraphValue(pathProposal),
      };
      variant.identity = stableGraphValue({
        ...proposal.identity,
        waypoints: actorPath,
        pathsByModel,
        hostPathProposalKey: pathProposal.proposalKey,
      });
      return variant;
    });
  }
  const plan = buildRulesV1MovementPathProposalPlan(cleanPredecessor, {
    actorPieceKey: proposal.actorPieceKey,
    actionType: proposal.actionType,
    destination: proposal.destinationsByPieceKey?.[proposal.actorPieceKey] ||
      proposal.waypoints?.at(-1),
    ignoredPieceKeys: proposal.activationGroupPieceKeys,
    targetKey: proposal.proposalKey,
    keyBase: proposal.proposalKey,
  });
  if (!plan.ok || !plan.proposals?.length) return [proposal];
  return plan.proposals.map((pathProposal) => {
    const waypoints = pathProposal.waypoints.map(point);
    const pathsByModel = (proposal.pathsByModel || []).map((entry) =>
      entry.pieceKey === proposal.actorPieceKey
        ? { ...entry, waypoints }
        : entry);
    const variant = {
      ...proposal,
      proposalKey: `${proposal.proposalKey}:path:${pathProposal.proposalKey}`,
      proposalSource: pathProposal.proposalKind === "host_auto_routed"
        ? "host_auto_routed_reverse_path_v1"
        : proposal.proposalSource,
      waypoints,
      pathsByModel,
      hostPathProposal: stableGraphValue(pathProposal),
    };
    variant.identity = stableGraphValue({
      ...proposal.identity,
      waypoints,
      pathsByModel,
      hostPathProposalKey: pathProposal.proposalKey,
    });
    return variant;
  });
}

function unitMovementAnchorDeploymentDebt(successor, actor, rawOptions = {}) {
  const zone = deploymentZoneForSide(rawOptions, actor.sideKey);
  if (!zone) return Number.POSITIVE_INFINITY;
  const actionTypes = Array.isArray(rawOptions.actionTypes)
    ? rawOptions.actionTypes.map(String)
    : ["advance", "run"];
  const generated = generatedOriginsForActor(successor, actor, {
    ...rawOptions,
    actionTypes,
  });
  let minimumDebt = Number.POSITIVE_INFINITY;
  for (const baseProposal of generated.proposals) {
    const proposal = materializeActivationGroupProposal(
      successor,
      actor,
      baseProposal,
    );
    let debt = numeric(proposal.originPlacementIssues?.length) * 1_000;
    for (const member of activationGroupPieces(successor, actor)) {
      const origin = point(proposal.originsByPieceKey[member.pieceKey]);
      const radius = baseRadius(member);
      const xMin = zone.x - zone.width / 2 + radius;
      const xMax = zone.x + zone.width / 2 - radius;
      const yMin = zone.y - zone.height / 2 + radius;
      const yMax = zone.y + zone.height / 2 - radius;
      debt += Math.max(0, xMin - origin.xIn, origin.xIn - xMax) +
        Math.max(0, yMin - origin.yIn, origin.yIn - yMax);
    }
    minimumDebt = Math.min(minimumDebt, debt);
  }
  return minimumDebt;
}

function restoreActivationGroupBeforeMovement(successor, proposal) {
  const state = structuredClone(successor);
  const actor = state.pieces.find((piece) => piece.pieceKey === proposal.actorPieceKey);
  if (!actor) throw new Error(`movement_predecessor_actor_missing:${proposal.actorPieceKey}`);
  for (const memberPieceKey of proposal.activationGroupPieceKeys || [actor.pieceKey]) {
    const member = state.pieces.find((piece) => piece.pieceKey === memberPieceKey);
    if (!member) {
      throw new Error(`movement_predecessor_group_member_missing:${memberPieceKey}`);
    }
    member.position = point(proposal.originsByPieceKey?.[memberPieceKey] || proposal.origin);
    member.activated = false;
    member.activationKey = "";
    member.aimed = false;
  }
  if (proposal.resourceRefund > 0) {
    actor.resourcePoints = numeric(actor.resourcePoints) + proposal.resourceRefund;
    actor.resource2 = actor.resourcePoints;
    if (actor.resourceKind === "focus") actor.focus = actor.resourcePoints;
    if (actor.resourceKind === "fury") actor.fury = actor.resourcePoints;
  }
  state.activationForfeitWindow = null;
  state.anyTimeActivationWindow = null;
  state.initialAttackWindow = null;
  state.combatPurchaseWindow = null;
  state.activationPreludeActorPieceKey = "";
  state.activationPreludeKind = "";
  state.soulTakerActivationPreludeActorPieceKey = "";
  state.stateKey = `movement-activation-predecessor-${stableGraphHash({
    successorStateHash: warmachineReverseStateSemanticHashV1(successor),
    proposal: proposal.identity,
  }, 24)}`;
  return normalizeRulesV1State(state);
}

export function generateWarmachineMovementActivationPredecessorsV1(
  successorStateInput = {},
  rawOptions = {},
) {
  const inputSuccessor = normalizeRulesV1State(successorStateInput);
  const inputSuccessorSemanticHash = warmachineReverseStateSemanticHashV1(inputSuccessor);
  const requested = Array.isArray(rawOptions.actorPieceKeys)
    ? new Set(rawOptions.actorPieceKeys.map(String))
    : null;
  const successor = enumerateWarmachineBenchmarkActionsV2(inputSuccessor, {
    ...(requested?.size ? { actorPieceKeys: [...requested].sort() } : {}),
    actionFamilyKeys: ["movement", "timing"],
  }).state;
  const successorSemanticHash = warmachineReverseStateSemanticHashV1(successor);
  const sideKey = String(rawOptions.sideKey || successor.activeSideKey || "");
  const successorStateInvariantAudit = auditWarmachineReverseStateBoundaryV1(
    successor,
    { boundaryKind: "movement_inverse_successor" },
  );
  const allActors = (successor.pieces || []).filter((piece) =>
    alive(piece) && piece.sideKey === sideKey && piece.activated === true &&
    (!requested || requested.has(piece.pieceKey)))
    .sort((left, right) => left.pieceKey.localeCompare(right.pieceKey));
  const actors = successorStateInvariantAudit.ok ? allActors : [];
  const candidates = [];
  const rejected = successorStateInvariantAudit.ok ? [] : [{
    reason: "reverse_predecessor_state_invariant_rejected",
    boundaryKind: "movement_inverse_successor",
    stateHash: successorSemanticHash,
    stateInvariantAudit:
      summarizeWarmachineReverseStateBoundaryAuditV1(
        successorStateInvariantAudit,
      ),
    issues: successorStateInvariantAudit.issues,
  }];
  const unresolved = [];
  const maximumStrictCandidates = Math.max(0, Math.floor(numeric(
    rawOptions.maximumStrictCandidates,
    0,
  )));
  const maximumStrictCandidateAttempts = Math.max(0, Math.floor(numeric(
    rawOptions.maximumStrictCandidateAttempts,
    0,
  )));
  let strictCandidateBudgetCutoffReached = false;
  let strictCandidateAttemptBudgetCutoffReached = false;
  let strictCandidateAttemptCount = 0;
  const movementActors = [];
  const seenUnitGroups = new Set();
  const explicitOriginProposalActorPieceKeys = new Set(
    (rawOptions.originProposals || [])
      .map((proposal) => String(proposal?.actorPieceKey || ""))
      .filter(Boolean),
  );
  const maximumUnitMovementAnchors = Math.max(0, Math.floor(numeric(
    rawOptions.maximumUnitMovementAnchorsPerGroup,
    0,
  )));
  for (const actor of actors) {
    const members = activationGroupPieces(successor, actor);
    if (members.length <= 1) {
      movementActors.push(actor);
      continue;
    }
    const groupId = activationGroupId(actor);
    if (seenUnitGroups.has(groupId)) continue;
    seenUnitGroups.add(groupId);
    const anchors = actors.filter((candidate) => activationGroupId(candidate) === groupId)
      .sort((left, right) =>
        Number(explicitOriginProposalActorPieceKeys.has(right.pieceKey)) -
          Number(explicitOriginProposalActorPieceKeys.has(left.pieceKey)) ||
        unitMovementAnchorDeploymentDebt(successor, left, rawOptions) -
          unitMovementAnchorDeploymentDebt(successor, right, rawOptions) ||
        left.pieceKey.localeCompare(right.pieceKey));
    const selectedAnchors = maximumUnitMovementAnchors > 0
      ? anchors.slice(0, maximumUnitMovementAnchors)
      : anchors;
    const omittedAnchors = maximumUnitMovementAnchors > 0
      ? anchors.slice(maximumUnitMovementAnchors)
      : [];
    movementActors.push(...selectedAnchors);
    unresolved.push(...omittedAnchors.map((candidate) => ({
      reason: "unit_movement_anchor_budget_deferred",
      activationGroupId: groupId,
      actorPieceKey: candidate.pieceKey,
      activationGroupPieceKeys: members.map((member) => member.pieceKey),
      deploymentGeometryDebt:
        unitMovementAnchorDeploymentDebt(successor, candidate, rawOptions),
    })));
  }
  let proposalCount = 0;
  let resourcePrefixRouteCount = 0;
  let resourceSuffixRouteCount = 0;
  let resourceSuffixMovementProposalCount = 0;
  let movementResourcePreimageCount = 0;
  let equivalentPathWitnessDeferredCount = 0;
  const acceptedReachabilityWitnessFamilies = new Map();
  const maximumResourceSuffixMovementProposals = Math.max(0, Math.floor(numeric(
    rawOptions.maximumResourceSuffixMovementProposals,
    0,
  )));
  movementActorLoop:
  for (const actor of movementActors) {
    const requiredResourcePrefixActorPieceKeys = new Set(
      (rawOptions.requireResourceSpendPrefixActorPieceKeys || []).map(String),
    );
    const requireResourcePrefix =
      requiredResourcePrefixActorPieceKeys.has(actor.pieceKey);
    const members = activationGroupPieces(successor, actor);
    const requestedActionTypes = Array.isArray(rawOptions.actionTypes)
      ? rawOptions.actionTypes.map(String)
      : ["advance", "run"];
    const supportedActionTypes = requestedActionTypes;
    const generatedOrigins = generatedOriginsForActor(successor, actor, {
      ...rawOptions,
      actionTypes: supportedActionTypes,
    });
    const proposals = generatedOrigins.proposals.map((proposal) =>
      materializeActivationGroupProposal(successor, actor, proposal));
    rawOptions.onProgress?.({
      stage: "movement_predecessor_actor_started",
      actorPieceKey: actor.pieceKey,
      activationGroupId: activationGroupId(actor),
      proposalCount: proposals.length,
      strictCandidateAttemptCount,
      acceptedStrictCandidateCount: candidates.length,
    });
    proposalCount += proposals.length;
    unresolved.push(...generatedOrigins.omitted.map((row) => stableGraphValue({
      actorPieceKey: actor.pieceKey,
      activationGroupId: activationGroupId(actor),
      ...row,
    })));
    for (const baseProposal of proposals) {
      if (maximumStrictCandidateAttempts > 0 &&
          strictCandidateAttemptCount >= maximumStrictCandidateAttempts) {
        strictCandidateAttemptBudgetCutoffReached = true;
        break movementActorLoop;
      }
      const cleanPredecessor = restoreActivationGroupBeforeMovement(successor, baseProposal);
      const movementResourcePreimages = movementResourcePreimagePlans(
        cleanPredecessor,
        actor.pieceKey,
        baseProposal.actionType,
      );
      movementResourcePreimageCount += movementResourcePreimages.length;
      const activationPlans = [];
      for (const resourcePreimage of movementResourcePreimages) {
        if (!requireResourcePrefix) {
          activationPlans.push({
            ...resourcePreimage,
            restoredResourcePoints: resourcePreimage.reverseResourceDelta,
          });
        }
        const resourcePrefixes = resourceSpendPrefixRoutes(
          resourcePreimage.predecessorState,
          actor.pieceKey,
          {
            ...rawOptions,
            movementProposalKey: baseProposal.proposalKey,
          },
        );
        resourcePrefixRouteCount += resourcePrefixes.routes.length;
        if (requireResourcePrefix && !resourcePrefixes.routes.length) {
          unresolved.push(stableGraphValue({
            actorPieceKey: actor.pieceKey,
            activationGroupId: activationGroupId(actor),
            proposalKey: baseProposal.proposalKey,
            reason: "required_resource_prefix_route_not_found",
          }));
        }
        unresolved.push(...resourcePrefixes.unresolved.map((row) => stableGraphValue({
          actorPieceKey: actor.pieceKey,
          activationGroupId: activationGroupId(actor),
          proposalKey: baseProposal.proposalKey,
          movementResourcePreimagePoints:
            resourcePreimage.preActivationResourcePoints,
          ...row,
        })));
        activationPlans.push(...resourcePrefixes.routes.map((route) => ({
          ...route,
          resourcePreimagePriority:
            resourcePreimage.resourcePreimagePriority,
          restoredResourcePoints:
            route.preActivationResourcePoints -
            actorResourcePoints(cleanPredecessor, actor.pieceKey),
        })));
      }
      activationPlans.sort((left, right) =>
        Number(left.resourcePreimagePriority || 0) -
          Number(right.resourcePreimagePriority || 0) ||
        Number(right.restoredResourcePoints || 0) -
          Number(left.restoredResourcePoints || 0) ||
        String((left.strictReplaySteps || []).map((step) => step.actionKey).join("|"))
          .localeCompare(String((right.strictReplaySteps || [])
            .map((step) => step.actionKey).join("|"))));
      const pathProposals = hostPathProposalVariants(cleanPredecessor, baseProposal);
      proposalCount += Math.max(0, pathProposals.length - 1);
      for (const proposal of pathProposals) {
        const pathWitnessIssues = movementPathWitnessIssues(proposal);
        if (pathWitnessIssues.length) {
          rejected.push(stableGraphValue({
            actorPieceKey: actor.pieceKey,
            activationGroupId: proposal.activationGroupId,
            activationGroupPieceKeys: proposal.activationGroupPieceKeys,
            proposalKey: proposal.proposalKey,
            reason: "reverse_movement_path_witness_invalid",
            pathWitnessIssues,
            predecessorStateHash:
              warmachineReverseStateSemanticHashV1(cleanPredecessor),
          }));
          rawOptions.onProgress?.({
            stage: "movement_path_witness_rejected",
            actorPieceKey: actor.pieceKey,
            activationGroupId: proposal.activationGroupId,
            proposalKey: proposal.proposalKey,
            pathWitnessIssues,
            strictCandidateAttemptCount,
            acceptedStrictCandidateCount: candidates.length,
          });
          continue;
        }
        if (proposal.originPlacementIssues?.length) {
          rejected.push({
            actorPieceKey: actor.pieceKey,
            activationGroupId: proposal.activationGroupId,
            activationGroupPieceKeys: proposal.activationGroupPieceKeys,
            proposalKey: proposal.proposalKey,
            reason: "reverse_movement_predecessor_origin_geometry_rejected",
            originPlacementIssues: proposal.originPlacementIssues,
            predecessorStateHash: warmachineReverseStateSemanticHashV1(cleanPredecessor),
          });
          continue;
        }
        const proposalActivationPlans = [...activationPlans];
        const resourceSuffixEligible =
          rawOptions.includePostMovementResourceSpendSuffixes === true &&
          actor.isWarcaster === true &&
          String(actor.resourceKind || "") === "focus" &&
          proposal.actionType === "advance";
        const suffixProposalBudgetReached = resourceSuffixEligible &&
          maximumResourceSuffixMovementProposals > 0 &&
          resourceSuffixMovementProposalCount >=
            maximumResourceSuffixMovementProposals;
        if (suffixProposalBudgetReached) {
          unresolved.push(stableGraphValue({
            actorPieceKey: actor.pieceKey,
            activationGroupId: activationGroupId(actor),
            proposalKey: proposal.proposalKey,
            reason: "resource_suffix_movement_proposal_budget_deferred",
            maximumResourceSuffixMovementProposals,
          }));
        }
        if (resourceSuffixEligible && !suffixProposalBudgetReached) {
          resourceSuffixMovementProposalCount += 1;
        }
        const resourceSuffixes = suffixProposalBudgetReached
          ? { routes: [], unresolved: [] }
          : resourceSpendSuffixRoutes(
            cleanPredecessor,
            actor.pieceKey,
            proposal,
            rawOptions,
          );
        resourceSuffixRouteCount += resourceSuffixes.routes.length;
        unresolved.push(...resourceSuffixes.unresolved.map((row) => stableGraphValue({
          actorPieceKey: actor.pieceKey,
          activationGroupId: activationGroupId(actor),
          proposalKey: proposal.proposalKey,
          ...row,
        })));
        proposalActivationPlans.push(...resourceSuffixes.routes);
        proposalActivationPlans.sort((left, right) =>
          Number(left.resourcePreimagePriority || 0) -
            Number(right.resourcePreimagePriority || 0) ||
          Number(right.restoredResourcePoints || 0) -
            Number(left.restoredResourcePoints || 0) ||
          Number(left.movementFirst === true) -
            Number(right.movementFirst === true) ||
          String((left.strictReplaySteps || []).map((step) => step.actionKey).join("|"))
            .localeCompare(String((right.strictReplaySteps || [])
              .map((step) => step.actionKey).join("|"))));
        for (const activationPlan of proposalActivationPlans) {
          const proposedPredecessorStateHash =
            warmachineReverseStateSemanticHashV1(
              activationPlan.predecessorState,
            );
          const reachabilityWitnessFamilyKey = stableGraphHash({
            predecessorStateHash: proposedPredecessorStateHash,
            actionType: proposal.actionType,
            resourceSpendOrder: String(activationPlan.resourceSpendOrder ||
              "resource_prefix_then_movement"),
            resourceStepActionKeys: (activationPlan.strictReplaySteps || [])
              .map((step) => step.actionKey),
          });
          const representativeWitness =
            acceptedReachabilityWitnessFamilies.get(
              reachabilityWitnessFamilyKey,
            );
          if (rawOptions.dedupeEquivalentPathWitnessesForReachabilityBudget ===
                true && representativeWitness) {
            equivalentPathWitnessDeferredCount += 1;
            unresolved.push(stableGraphValue({
              reason: "movement_equivalent_path_witness_not_reexecuted",
              actorPieceKey: actor.pieceKey,
              activationGroupId: proposal.activationGroupId,
              actionType: proposal.actionType,
              proposalKey: proposal.proposalKey,
              predecessorStateHash: proposedPredecessorStateHash,
              reachabilityWitnessFamilyKey,
              representativeCandidateKey:
                representativeWitness.candidateKey,
              representativeStrictReceiptHash:
                representativeWitness.strictReceiptHash,
              detail: "A Host-strict path already reaches the same semantic predecessor with the same action and resource sequence. This bounded reachability call keeps that representative, but the alternate path's reactions, Chance outcomes and route label remain unresolved.",
            }));
            continue;
          }
          if (maximumStrictCandidateAttempts > 0 &&
              strictCandidateAttemptCount >= maximumStrictCandidateAttempts) {
            strictCandidateAttemptBudgetCutoffReached = true;
            break movementActorLoop;
          }
          const predecessorStateInvariantAudit =
            auditWarmachineReverseStateBoundaryV1(
              activationPlan.predecessorState,
              { boundaryKind: "movement_inverse_predecessor" },
            );
          if (!predecessorStateInvariantAudit.ok) {
            rejected.push({
              actorPieceKey: actor.pieceKey,
              activationGroupId: proposal.activationGroupId,
              proposalKey: proposal.proposalKey,
              reason: "reverse_predecessor_state_invariant_rejected",
              predecessorStateHash: warmachineReverseStateSemanticHashV1(
                activationPlan.predecessorState,
              ),
              stateInvariantAudit:
                summarizeWarmachineReverseStateBoundaryAuditV1(
                  predecessorStateInvariantAudit,
                ),
              issues: predecessorStateInvariantAudit.issues,
            });
            continue;
          }
          strictCandidateAttemptCount += 1;
          rawOptions.onProgress?.({
            stage: "movement_strict_attempt_started",
            actorPieceKey: actor.pieceKey,
            activationGroupId: proposal.activationGroupId,
            proposalKey: proposal.proposalKey,
            strictCandidateAttemptCount,
            acceptedStrictCandidateCount: candidates.length,
            preActivationResourcePoints:
              activationPlan.preActivationResourcePoints,
          });
          const pathKey = `reverse-${stableGraphHash({
            proposalIdentity: proposal.identity,
            preActivationResourcePoints: activationPlan.preActivationResourcePoints,
            resourceSpendOrder: String(activationPlan.resourceSpendOrder ||
              "resource_prefix_then_movement"),
            resourceSpendActionKeys: activationPlan.strictReplaySteps.map((step) =>
              step.actionKey),
          }, 20)}`;
          const preparedPredecessor = bindWarmachineBenchmarkExplicitMovementPathV2(
            activationPlan.predecessorState,
            {
              actorPieceKey: actor.pieceKey,
              actionType: proposal.actionType,
              pathKey,
              waypoints: proposal.waypoints,
              pathsByModel: proposal.activationGroupPieceKeys.length > 1
                ? proposal.pathsByModel
                : [],
              proposalSource: proposal.proposalSource,
              label: `Reverse ${proposal.actionType} preimage ${proposal.relationKind}`,
            },
          );
          const actionKey = proposal.activationGroupPieceKeys.length > 1
            ? `${actor.pieceKey}:${proposal.actionType}-unit-path:${pathKey}:v1`
            : `${actor.pieceKey}:${proposal.actionType}-path:${pathKey}:v1`;
          const activationGroupKey = proposal.activationGroupPieceKeys.length > 1
            ? proposal.activationGroupId
            : actor.pieceKey;
          const resourceSteps = activationPlan.strictReplaySteps || [];
          const movementFirst = activationPlan.movementFirst === true;
          const movementPlanStep = {
            actionKey,
            actionType: proposal.actionType,
            actorPieceKey: actor.pieceKey,
            movementStep: true,
          };
          const plannedSteps = movementFirst
            ? [movementPlanStep, ...resourceSteps]
            : [...resourceSteps, movementPlanStep];
          const movementStepIndex = movementFirst ? 0 : resourceSteps.length;
          const diagnosticScoped = Number(rawOptions.rejectedAuditLimit || 0) > 0
            ? enumerateWarmachineBenchmarkActionsV2(preparedPredecessor, {
              activationGroupKey,
              actionFamilyKeys: resourceSteps.length
                ? ["attack_or_effect", "movement", "resource", "special", "timing"]
                : ["movement", "timing"],
              movementPathKindKeys: resourceSteps.length ? [] : ["explicit_path"],
            })
            : null;
          const executed = executeWarmachineBenchmarkActivationV2(
            preparedPredecessor,
            activationGroupKey,
            {
              routeKey: `movement-predecessor:${proposal.proposalKey}`,
              repeatIntent: resourceSteps.length > 0,
              enumerationScopeForStep: ({ stepIndex }) =>
                stepIndex >= plannedSteps.length
                  ? {
                    actionFamilyKeys: ["timing"],
                  }
                  : plannedSteps[stepIndex]?.movementStep === true
                    ? {
                      actionFamilyKeys: ["movement", "timing"],
                      movementPathKindKeys: ["explicit_path"],
                    }
                    : {
                      actionFamilyKeys: ["attack_or_effect", "resource", "special"],
                    },
              selectAction: ({ scoped, stepIndex }) => {
                const plannedStep = plannedSteps[stepIndex];
                if (plannedStep) {
                  const plannedAction = scoped.enumeration.actions.find((action) =>
                    action.actionKey === plannedStep.actionKey);
                  return plannedAction
                    ? {
                      actionKey: plannedAction.actionKey,
                      actionPatch: plannedStep.actionPatch || {},
                    }
                    : null;
                }
                return null;
              },
              rejectedAuditLimit: Number(rawOptions.rejectedAuditLimit || 0),
            },
          );
          if (!executed.ok || !executed.completed) {
            const movementAudit = executed.selectionAudit?.[movementStepIndex] ||
              executed.selectionAudit?.[0] || null;
            const rejectedAction = movementAudit?.rejectedActions?.find((row) =>
              row.actionKey === actionKey) || null;
            rejected.push({
              actorPieceKey: actor.pieceKey,
              proposalKey: proposal.proposalKey,
              actionKey,
              resourcePrefixActionKeys: movementFirst
                ? []
                : resourceSteps.map((step) => step.actionKey),
              resourceSuffixActionKeys: movementFirst
                ? resourceSteps.map((step) => step.actionKey)
                : [],
              preActivationResourcePoints: activationPlan.preActivationResourcePoints,
              reason: executed.reason || rejectedAction?.reason ||
                "strict_movement_activation_rejected",
              rejectedAction,
              legalActorActionKeys: (diagnosticScoped?.enumeration.actions || [])
                .filter((row) => row.actorPieceKey === actor.pieceKey)
                .map((row) => row.actionKey).sort(),
              rejectedActorActions: (diagnosticScoped?.enumeration.rejectedActions || [])
                .filter((row) => row.actorPieceKey === actor.pieceKey)
                .slice(0, Math.max(0, Number(rawOptions.rejectedAuditLimit || 0)))
                .map((row) => stableGraphValue({
                  actionKey: row.actionKey,
                  actionType: row.actionType,
                  reason: row.rejection?.reason || row.metadata?.rejectionReason || "",
                  reasons: row.rejection?.reasons || [],
                  issues: row.rejection?.issues || [],
                  movementCost: row.metadata?.movementCost || null,
                  movementAllowanceIn: row.metadata?.movementAllowanceIn ?? null,
                  speedIn: row.metadata?.speedIn ?? null,
                })),
              predecessorStateHash: warmachineReverseStateSemanticHashV1(
                activationPlan.predecessorState,
              ),
            });
            continue;
          }
          const rawExecutedStateHash = warmachineReverseStateSemanticHashV1(executed.state);
          const sanitizedExecuted = stripMovementProposal(executed.state, pathKey);
          const sanitizedExecutedHash = warmachineReverseStateSemanticHashV1(sanitizedExecuted);
          if (sanitizedExecutedHash !== successorSemanticHash) {
            unresolved.push({
              actorPieceKey: actor.pieceKey,
              proposalKey: proposal.proposalKey,
              actionKey,
              resourcePrefixActionKeys: movementFirst
                ? []
                : resourceSteps.map((step) => step.actionKey),
              resourceSuffixActionKeys: movementFirst
                ? resourceSteps.map((step) => step.actionKey)
                : [],
              preActivationResourcePoints: activationPlan.preActivationResourcePoints,
              reason: "movement_activation_has_uninverted_side_effects",
              predecessorStateHash: warmachineReverseStateSemanticHashV1(
                activationPlan.predecessorState,
              ),
              rawExecutedStateHash,
              sanitizedExecutedStateHash: sanitizedExecutedHash,
              expectedSuccessorStateHash: successorSemanticHash,
              strictReceiptHashes: executed.receiptHashes,
            });
            continue;
          }
          const predecessorStateHash = warmachineReverseStateSemanticHashV1(
            activationPlan.predecessorState,
          );
          const searchPreparedStateHash = warmachineReverseStateSemanticHashV1(
            preparedPredecessor,
          );
          const movementReceipt = (executed.receipts || []).find((receipt) =>
            receipt.actionKey === actionKey);
          const hasResourceSpend = resourceSteps.length > 0;
          const resourcePrefixActionKeys = movementFirst
            ? []
            : resourceSteps.map((step) => step.actionKey);
          const resourceSuffixActionKeys = movementFirst
            ? resourceSteps.map((step) => step.actionKey)
            : [];
          const core = {
            candidateKind: hasResourceSpend
              ? movementFirst
                ? "concrete_movement_resource_suffix_activation_predecessor"
                : "concrete_resource_prefix_movement_activation_predecessor"
              : "concrete_movement_activation_predecessor",
            successorKind: "state_after_movement_activation",
            predecessorKind: "state_before_movement_activation",
            operatorKey: hasResourceSpend
              ? movementFirst
                ? "movement_resource_suffix_activation_inverse_v1"
                : "resource_prefix_movement_activation_inverse_v1"
              : "movement_activation_inverse_v1",
            actorPieceKey: actor.pieceKey,
            activationGroupId: proposal.activationGroupId,
            activationGroupPieceKeys: proposal.activationGroupPieceKeys,
            actionType: proposal.actionType,
            preActivationResourcePoints: activationPlan.preActivationResourcePoints,
            reverseRestoredResourcePoints: activationPlan.restoredResourcePoints || 0,
            movementResourcePreimagePoints:
              activationPlan.preActivationResourcePoints,
            resourcePreimagePriority:
              activationPlan.resourcePreimagePriority || 0,
            resourceSpendOrder: hasResourceSpend
              ? movementFirst
                ? "movement_then_resource_suffix"
                : "resource_prefix_then_movement"
              : "movement_only",
            resourcePrefixActionCount: resourcePrefixActionKeys.length,
            resourcePrefixActionKeys,
            resourceSuffixActionCount: resourceSuffixActionKeys.length,
            resourceSuffixActionKeys,
            predecessorStateKey: String(activationPlan.predecessorState.stateKey || ""),
            predecessorStateHash,
            searchPreparedStateHash,
            successorStateKey: String(successor.stateKey || ""),
            successorStateHash: successorSemanticHash,
            rawExecutedStateHash,
            transitionActionKey: plannedSteps[0]?.actionKey || actionKey,
            strictWitness: true,
            strictRejected: false,
            strictReceiptHash: executed.activationReceiptHash,
            strictStepReceiptHashes: executed.receiptHashes,
            strictTransitionCount: executed.transitionCount,
            strictReplaySteps: stableGraphValue((executed.receipts || []).map((receipt) => ({
              actionKey: String(receipt.actionKey || ""),
              actionType: String(receipt.actionType || ""),
              actorPieceKey: String(receipt.actorPieceKey || ""),
              targetPieceKey: String(receipt.targetPieceKey || ""),
              actionPatch: stableGraphValue({
                ...(receipt.persistedAction?.strictRollOutcome
                  ? { strictRollOutcome: receipt.persistedAction.strictRollOutcome }
                  : {}),
                ...(receipt.persistedAction?.steamroller2026Decision
                  ? { steamroller2026Decision: receipt.persistedAction.steamroller2026Decision }
                  : {}),
              }),
            }))),
            strictMovementAllowanceIn:
              movementReceipt?.persistedAction?.metadata?.movementAllowanceIn ?? null,
            unresolvedReasons: [],
            movementProposal: stableGraphValue({
              proposalKey: proposal.proposalKey,
              proposalSource: proposal.proposalSource,
              proposalPriority: numeric(proposal.proposalPriority, 0),
              actionType: proposal.actionType,
              relationKind: proposal.relationKind,
              deploymentSlotKey: proposal.deploymentSlotKey,
              originPlacementIssues: proposal.originPlacementIssues,
              origin: proposal.origin,
              destination: point(actor),
              waypoints: proposal.waypoints,
              originsByPieceKey: proposal.originsByPieceKey,
              destinationsByPieceKey: proposal.destinationsByPieceKey,
              pathsByModel: proposal.activationGroupPieceKeys.length > 1
                ? proposal.pathsByModel
                : [],
              proposalAllowanceIn: proposal.proposalAllowanceIn,
              pathKey,
              resourceSpendOrder: hasResourceSpend
                ? movementFirst
                  ? "movement_then_resource_suffix"
                  : "resource_prefix_then_movement"
                : "movement_only",
              resourcePrefixActionKeys,
              resourceSuffixActionKeys,
              resourcePrefixTargetPieceKey:
                proposal.resourcePrefixTargetPieceKey || "",
              resourcePrefixSpellRangeIn:
                proposal.resourcePrefixSpellRangeIn ?? null,
              resourcePrefixRangeFraction:
                proposal.resourcePrefixRangeFraction ?? null,
            }),
            searchContextIsolation: {
              proposalPathStoredOutsideRulesPredecessor: true,
              rawStrictSuccessorContainsProposalPath: true,
              onlyNamedProposalPathRemovedBeforeGameStateComparison: true,
            },
            provenance: {
              upstreamReceiptHash: warmachineHost.receipt.receiptHash,
              oracleOpeningRead: false,
              oracleRouteRead: false,
              oracleIntermediateStateRead: false,
            },
            predecessorStateInvariantAudit:
              summarizeWarmachineReverseStateBoundaryAuditV1(
                predecessorStateInvariantAudit,
              ),
          };
          const candidate = {
            ...core,
            candidateKey: `movement-activation-predecessor-${stableGraphHash(core, 32)}`,
            predecessorState: activationPlan.predecessorState,
          };
          candidates.push(candidate);
          acceptedReachabilityWitnessFamilies.set(
            reachabilityWitnessFamilyKey,
            {
              candidateKey: candidate.candidateKey,
              strictReceiptHash: candidate.strictReceiptHash,
            },
          );
          if (maximumStrictCandidates > 0 &&
              candidates.length >= maximumStrictCandidates) {
            strictCandidateBudgetCutoffReached = true;
            break movementActorLoop;
          }
        }
      }
    }
  }
  if (strictCandidateBudgetCutoffReached) {
    unresolved.push(stableGraphValue({
      reason: "movement_strict_candidate_budget_deferred",
      maximumStrictCandidates,
      acceptedStrictCandidateCount: candidates.length,
      candidateActorCount: actors.length,
      candidateMovementAnchorCount: movementActors.length,
      detail: "The search-requested accepted-candidate budget was reached. Remaining deployment origins, path variants and resource preimages were not executed and retain unresolved mass.",
    }));
  }
  if (strictCandidateAttemptBudgetCutoffReached) {
    unresolved.push(stableGraphValue({
      reason: "movement_strict_candidate_attempt_budget_deferred",
      maximumStrictCandidateAttempts,
      executedStrictCandidateAttemptCount: strictCandidateAttemptCount,
      acceptedStrictCandidateCount: candidates.length,
      candidateActorCount: actors.length,
      candidateMovementAnchorCount: movementActors.length,
      detail: "The search-requested Host execution-attempt budget was reached before all deployment origins, path variants and resource preimages were tested. Every unexecuted combination retains unresolved mass.",
    }));
  }
  candidates.sort((left, right) => left.candidateKey.localeCompare(right.candidateKey));
  const publicCandidates = candidates.map(({ predecessorState: _state, ...candidate }) => candidate);
  const candidateSet = buildWarmachineReverseReachabilityCandidateSetV2(publicCandidates, {
    queryKey: String(rawOptions.queryKey ||
      `movement-activation:${sideKey}:${successorSemanticHash}`),
    successorStateKey: String(successor.stateKey || ""),
    maximumCandidates: rawOptions.maximumCandidates ?? publicCandidates.length,
  });
  const core = {
    schemaVersion: WARMACHINE_MOVEMENT_ACTIVATION_PREDECESSOR_V1_SCHEMA,
    sideKey,
    inputSuccessorStateKey: String(inputSuccessor.stateKey || ""),
    inputSuccessorSemanticHash,
    successorStateKey: String(successor.stateKey || ""),
    successorSemanticHash,
    candidateActorCount: allActors.length,
    attemptedCandidateActorCount: actors.length,
    candidateMovementAnchorCount: movementActors.length,
    candidateActivationGroupCount: new Set(actors.map(activationGroupId)).size,
    proposalCount,
    resourcePrefixRouteCount,
    resourceSuffixRouteCount,
    resourceSuffixMovementProposalCount,
    maximumResourceSuffixMovementProposals,
    movementResourcePreimageCount,
    equivalentPathWitnessDeferredCount,
    dedupeEquivalentPathWitnessesForReachabilityBudget:
      rawOptions.dedupeEquivalentPathWitnessesForReachabilityBudget === true,
    maximumStrictCandidates,
    strictCandidateBudgetCutoffReached,
    maximumStrictCandidateAttempts,
    strictCandidateAttemptCount,
    strictCandidateAttemptBudgetCutoffReached,
    strictCandidateCount: candidates.length,
    strictRejectedCount: rejected.length,
    unresolvedCount: unresolved.length,
    publicCandidates: stableGraphValue(publicCandidates),
    rejected: stableGraphValue(rejected),
    unresolved: stableGraphValue(unresolved),
    successorStateInvariantAudit:
      summarizeWarmachineReverseStateBoundaryAuditV1(
        successorStateInvariantAudit,
      ),
    candidateSet,
    claimBoundary: "Origins, route waypoints, finite Warjack/Warbeast run-resource preimages and resource-spend sequences are reverse proposals, not hidden forward traces. Every run-resource preimage from zero through the actor's declared resource maximum is submitted to Host strict execution, so spent Focus, forced Fury and free-run exceptions are accepted only through exact successor equality. Resource sequences may occur before movement or, only when the Host keeps an activation window open, after movement; both are limited to Host-enumerated unboosted offensive spells with explicit minimum dice and preserve all missed-target branches as exact strict transitions. Unsupported resource sinks and every target/label omission remain unresolved. The path is attached only to the strict search context. Acceptance requires rules-v1 to validate every resource action, allowance, path segment, collision, final placement and activation completion in its declared order, after which removing only that named path must reproduce the supplied successor exactly. A bounded caller may keep one strict reachability representative for the same semantic predecessor, action type and resource sequence; every alternate path remains explicitly unresolved for reactions, Chance and route-label value.",
  };
  return {
    ...core,
    candidates,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: candidateSet.reachabilityContractOk && candidates.length > 0,
  };
}
