import {
  bindWarmachineBenchmarkExplicitMovementPathV2,
  enumerateWarmachineBenchmarkActionsV2,
  executeWarmachineBenchmarkActivationV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { normalizeRulesV1State, warmachineHost } from "../warmachine-host-runtime.mjs";
import { buildWarmachineReverseReachabilityCandidateSetV2 } from
  "./reachability-contract-v2.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";
import { warmachinePieceInPlayV1 } from "./piece-lifecycle-v1.mjs";

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

function alive(piece = {}) {
  return warmachinePieceInPlayV1(piece);
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
  const addOffsetRows = (center, separationIn, keyPrefix) => {
    for (const direction of directions) {
      rows.push({
        slotKey: `${keyPrefix}:${direction.key}`,
        origin: {
          xIn: clamp(center.xIn + direction.x * separationIn, bounds.xMin, bounds.xMax),
          yIn: clamp(center.yIn + direction.y * separationIn, bounds.yMin, bounds.yMax),
        },
        proposalSource: "finite_base_aware_deployment_slot_v1",
      });
    }
  };
  const nearestBlockingPieces = [];
  for (const piece of otherPieces) {
    const piecePosition = point(piece);
    const separationIn = actorRadius + baseRadius(piece) + gapIn;
    if (distance(nearest, piecePosition) > separationIn + 0.001) continue;
    nearestBlockingPieces.push(piece);
    addOffsetRows(piecePosition, separationIn, `around:${piece.pieceKey}`);
  }
  if (nearestBlockingPieces.length) {
    for (let ring = 1; ring <= maximumRings; ring += 1) {
      addOffsetRows(nearest, maximumSeparationIn * ring, `nearest-ring:${ring}`);
    }
  }
  const unique = new Map();
  for (const row of rows) {
    const key = stableGraphHash(point(row.origin), 20);
    if (!unique.has(key)) unique.set(key, {
      ...row,
      originPlacementIssues: predecessorOriginPlacementIssues(
        successor,
        actor,
        point(row.origin),
      ),
    });
  }
  const ordered = [...unique.values()].sort((left, right) =>
    Number(right.slotKey === "nearest") - Number(left.slotKey === "nearest") ||
    Number(left.originPlacementIssues.length > 0) -
      Number(right.originPlacementIssues.length > 0) ||
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

function generatedOriginsForActor(successor, actor, rawOptions = {}) {
  const destination = point(actor);
  const actionTypes = Array.isArray(rawOptions.actionTypes)
    ? rawOptions.actionTypes.map(String)
    : ["advance", "run"];
  const rows = [];
  const omitted = [];
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
    for (const deploymentOrigin of deploymentOriginDomain.candidates) {
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
            originPlacementIssues: predecessorOriginPlacementIssues(
              successor,
              actor,
              deploymentOrigin.origin,
            ),
            relationKind: "deployment_to_successor_straight_path",
          });
        } else if (deploymentDistance > allowance + 0.001 && allowance > 0) {
          const ratio = allowance / deploymentDistance;
          const steppedOrigin = {
            xIn: destination.xIn +
              (deploymentOrigin.origin.xIn - destination.xIn) * ratio,
            yIn: destination.yIn +
              (deploymentOrigin.origin.yIn - destination.yIn) * ratio,
          };
          rows.push({
            proposalKey: `${actor.pieceKey}:${actionType}:maximum-step:${deploymentOrigin.slotKey}`,
            actorPieceKey: actor.pieceKey,
            actionType,
            origin: steppedOrigin,
            waypoints: [destination],
            proposalAllowanceIn: allowance,
            proposalSource: "maximum_step_toward_strict_deployment_v1",
            deploymentSlotKey: deploymentOrigin.slotKey,
            originPlacementIssues: predecessorOriginPlacementIssues(
              successor,
              actor,
              steppedOrigin,
            ),
            relationKind: "earlier_turn_progress_toward_deployment",
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
    if (!row.origin || samePoint(row.origin, destination)) continue;
    const identity = stableGraphValue({
      actorPieceKey: row.actorPieceKey,
      actionType: row.actionType,
      origin: row.origin,
      waypoints: row.waypoints,
      proposalAllowanceIn: row.proposalAllowanceIn,
      deploymentSlotKey: row.deploymentSlotKey,
      originPlacementIssues: row.originPlacementIssues,
      resourceRefund: row.resourceRefund || 0,
    });
    unique.set(stableGraphHash(identity), { ...row, identity });
  }
  return {
    proposals: [...unique.values()].sort((left, right) =>
      left.proposalKey.localeCompare(right.proposalKey)),
    omitted,
  };
}

function restoreActorBeforeMovement(successor, proposal) {
  const state = structuredClone(successor);
  const actor = state.pieces.find((piece) => piece.pieceKey === proposal.actorPieceKey);
  if (!actor) throw new Error(`movement_predecessor_actor_missing:${proposal.actorPieceKey}`);
  actor.position = point(proposal.origin);
  actor.activated = false;
  actor.activationKey = "";
  actor.aimed = false;
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
  const successor = enumerateWarmachineBenchmarkActionsV2(inputSuccessor).state;
  const successorSemanticHash = warmachineReverseStateSemanticHashV1(successor);
  const requested = Array.isArray(rawOptions.actorPieceKeys)
    ? new Set(rawOptions.actorPieceKeys.map(String))
    : null;
  const sideKey = String(rawOptions.sideKey || successor.activeSideKey || "");
  const actors = (successor.pieces || []).filter((piece) =>
    alive(piece) && piece.sideKey === sideKey && piece.activated === true &&
    (!requested || requested.has(piece.pieceKey)))
    .sort((left, right) => left.pieceKey.localeCompare(right.pieceKey));
  const candidates = [];
  const rejected = [];
  const unresolved = [];
  let proposalCount = 0;
  for (const actor of actors) {
    const generatedOrigins = generatedOriginsForActor(successor, actor, rawOptions);
    const proposals = generatedOrigins.proposals;
    proposalCount += proposals.length;
    unresolved.push(...generatedOrigins.omitted.map((row) => stableGraphValue({
      actorPieceKey: actor.pieceKey,
      ...row,
    })));
    for (const proposal of proposals) {
      const cleanPredecessor = restoreActorBeforeMovement(successor, proposal);
      if (proposal.originPlacementIssues?.length) {
        rejected.push({
          actorPieceKey: actor.pieceKey,
          proposalKey: proposal.proposalKey,
          reason: "reverse_movement_predecessor_origin_geometry_rejected",
          originPlacementIssues: proposal.originPlacementIssues,
          predecessorStateHash: warmachineReverseStateSemanticHashV1(cleanPredecessor),
        });
        continue;
      }
      const pathKey = `reverse-${stableGraphHash(proposal.identity, 20)}`;
      const preparedPredecessor = bindWarmachineBenchmarkExplicitMovementPathV2(
        cleanPredecessor,
        {
          actorPieceKey: actor.pieceKey,
          actionType: proposal.actionType,
          pathKey,
          waypoints: proposal.waypoints,
          proposalSource: proposal.proposalSource,
          label: `Reverse ${proposal.actionType} preimage ${proposal.relationKind}`,
        },
      );
      const actionKey = `${actor.pieceKey}:${proposal.actionType}-path:${pathKey}:v1`;
      const diagnosticScoped = Number(rawOptions.rejectedAuditLimit || 0) > 0
        ? enumerateWarmachineBenchmarkActionsV2(preparedPredecessor, {
          activationGroupKey: actor.pieceKey,
          actionFamilyKeys: ["movement", "timing"],
          movementPathKindKeys: ["explicit_path"],
        })
        : null;
      const executed = executeWarmachineBenchmarkActivationV2(
        preparedPredecessor,
        actor.pieceKey,
        {
          routeKey: `movement-predecessor:${proposal.proposalKey}`,
          enumerationScopeForStep: ({ stepIndex }) => stepIndex === 0
            ? {
              actionFamilyKeys: ["movement", "timing"],
              movementPathKindKeys: ["explicit_path"],
            }
            : {},
          selectAction: ({ scoped, stepIndex }) => stepIndex === 0
            ? scoped.enumeration.actions.find((action) => action.actionKey === actionKey) || null
            : null,
          rejectedAuditLimit: Number(rawOptions.rejectedAuditLimit || 0),
        },
      );
      if (!executed.ok || !executed.completed) {
        const firstAudit = executed.selectionAudit?.[0] || null;
        const rejectedAction = firstAudit?.rejectedActions?.find((row) =>
          row.actionKey === actionKey) || null;
        rejected.push({
          actorPieceKey: actor.pieceKey,
          proposalKey: proposal.proposalKey,
          actionKey,
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
          predecessorStateHash: warmachineReverseStateSemanticHashV1(cleanPredecessor),
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
          reason: "movement_activation_has_uninverted_side_effects",
          predecessorStateHash: warmachineReverseStateSemanticHashV1(cleanPredecessor),
          rawExecutedStateHash,
          sanitizedExecutedStateHash: sanitizedExecutedHash,
          expectedSuccessorStateHash: successorSemanticHash,
          strictReceiptHashes: executed.receiptHashes,
        });
        continue;
      }
      const predecessorStateHash = warmachineReverseStateSemanticHashV1(cleanPredecessor);
      const searchPreparedStateHash = warmachineReverseStateSemanticHashV1(preparedPredecessor);
      const core = {
        candidateKind: "concrete_movement_activation_predecessor",
        successorKind: "state_after_movement_activation",
        predecessorKind: "state_before_movement_activation",
        operatorKey: "movement_activation_inverse_v1",
        actorPieceKey: actor.pieceKey,
        actionType: proposal.actionType,
        predecessorStateKey: String(cleanPredecessor.stateKey || ""),
        predecessorStateHash,
        searchPreparedStateHash,
        successorStateKey: String(successor.stateKey || ""),
        successorStateHash: successorSemanticHash,
        rawExecutedStateHash,
        transitionActionKey: actionKey,
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
          executed.receipts?.[0]?.persistedAction?.metadata?.movementAllowanceIn ?? null,
        unresolvedReasons: [],
        movementProposal: stableGraphValue({
          proposalKey: proposal.proposalKey,
          proposalSource: proposal.proposalSource,
          relationKind: proposal.relationKind,
          deploymentSlotKey: proposal.deploymentSlotKey,
          originPlacementIssues: proposal.originPlacementIssues,
          origin: proposal.origin,
          destination: point(actor),
          waypoints: proposal.waypoints,
          proposalAllowanceIn: proposal.proposalAllowanceIn,
          pathKey,
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
      };
      candidates.push({
        ...core,
        candidateKey: `movement-activation-predecessor-${stableGraphHash(core, 32)}`,
        predecessorState: cleanPredecessor,
      });
    }
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
    candidateActorCount: actors.length,
    proposalCount,
    strictCandidateCount: candidates.length,
    strictRejectedCount: rejected.length,
    unresolvedCount: unresolved.length,
    publicCandidates: stableGraphValue(publicCandidates),
    rejected: stableGraphValue(rejected),
    unresolved: stableGraphValue(unresolved),
    candidateSet,
    claimBoundary: "Origins and route waypoints are reverse proposals, not hidden forward traces. The proposal is attached only to the strict enumeration-prepared search context; the clean predecessor rules state excludes it. Acceptance requires rules-v1 to validate allowance, every path segment, model/terrain collision, final placement and activation completion, after which removing only that named search proposal must reproduce the supplied successor exactly.",
  };
  return {
    ...core,
    candidates,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: candidateSet.reachabilityContractOk && candidates.length > 0,
  };
}
