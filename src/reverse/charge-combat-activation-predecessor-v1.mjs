import {
  bindWarmachineBenchmarkExplicitMovementPathV2,
  buildWarmachineBenchmarkStrictRollOutcomeV2,
  enumerateWarmachineBenchmarkActionsV2,
  executeWarmachineBenchmarkActivationV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { normalizeRulesV1State, warmachineHost } from
  "../warmachine-host-runtime.mjs";
import { buildWarmachineReverseReachabilityCandidateSetV2 } from
  "./reachability-contract-v2.mjs";
import {
  auditWarmachineReverseStateBoundaryV1,
  summarizeWarmachineReverseStateBoundaryAuditV1,
} from "./reverse-state-invariants-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";
import { warmachinePieceInPlayV1 } from "./piece-lifecycle-v1.mjs";

export const WARMACHINE_CHARGE_COMBAT_ACTIVATION_PREDECESSOR_V1_SCHEMA =
  "warmachine_charge_combat_activation_predecessor_v1";

function numeric(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function point(value = {}) {
  const source = value.position || value;
  return {
    xIn: numeric(source.xIn),
    yIn: numeric(source.yIn),
  };
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
    alive(piece) && piece.sideKey === actor.sideKey &&
      activationGroupId(piece) === groupId)
    .sort((left, right) => left.pieceKey.localeCompare(right.pieceKey));
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

function resourcePreimageValues(actor = {}) {
  const successorPoints = Math.max(0, Math.floor(numeric(
    actor.resourcePoints ?? actor.resource2 ?? actor.focus ?? actor.fury,
  )));
  const maximum = Math.max(
    successorPoints,
    Math.floor(numeric(actor.resourceMax)),
    Math.floor(numeric(actor.resource2Max)),
    Math.floor(numeric(actor.furyThreshold)),
  );
  const values = new Set([successorPoints]);
  if (actor.isWarjack === true) values.add(successorPoints + 1);
  if (actor.isWarbeast === true) values.add(Math.max(0, successorPoints - 1));
  return [...values].filter((value) => value <= maximum)
    .sort((left, right) => left - right);
}

function clearActivationRuntime(state = {}) {
  state.activationForfeitWindow = null;
  state.anyTimeActivationWindow = null;
  state.initialAttackWindow = null;
  state.combatPurchaseWindow = null;
  state.unitActivationWindow = null;
  state.activationPreludeActorPieceKey = "";
  state.activationPreludeKind = "";
  state.soulTakerActivationPreludeActorPieceKey = "";
}

function applyPiecePatches(state = {}, patches = {}) {
  for (const [pieceKey, patch] of Object.entries(patches || {})) {
    const piece = (state.pieces || []).find((candidate) =>
      candidate.pieceKey === pieceKey);
    if (!piece) continue;
    Object.assign(piece, structuredClone(patch || {}));
    if (patch?.damage) {
      piece.damage = {
        ...(piece.damage || {}),
        ...structuredClone(patch.damage),
      };
    }
  }
}

function translatedGroupOrigins(groupPieces = [], actor = {}, origin = {}) {
  const actorDestination = point(actor);
  const delta = {
    xIn: point(origin).xIn - actorDestination.xIn,
    yIn: point(origin).yIn - actorDestination.yIn,
  };
  return Object.fromEntries(groupPieces.map((piece) => [
    piece.pieceKey,
    {
      xIn: point(piece).xIn + delta.xIn,
      yIn: point(piece).yIn + delta.yIn,
    },
  ]));
}

function restoreChargePredecessor(successor, proposal, resourcePoints) {
  const state = structuredClone(successor);
  applyPiecePatches(state, proposal.predecessorPiecePatches);
  const actor = state.pieces.find((piece) =>
    piece.pieceKey === proposal.actorPieceKey);
  if (!actor) return null;
  const members = activationGroupPieces(state, actor);
  const originsByPieceKey = {
    ...translatedGroupOrigins(members, actor, proposal.origin),
    ...(proposal.originsByPieceKey || {}),
  };
  for (const member of members) {
    member.position = point(originsByPieceKey[member.pieceKey]);
    member.activated = false;
    member.activationKey = "";
    member.aimed = false;
  }
  setPieceResourcePoints(actor, resourcePoints);
  clearActivationRuntime(state);
  state.stateKey = `charge-combat-predecessor-${stableGraphHash({
    successorStateHash: warmachineReverseStateSemanticHashV1(successor),
    proposalKey: proposal.proposalKey,
    resourcePoints,
  }, 24)}`;
  return normalizeRulesV1State(state);
}

function stripChargePath(stateInput = {}, pathKey = "") {
  const state = structuredClone(normalizeRulesV1State(stateInput));
  state.explicitMovementPaths = (state.explicitMovementPaths || []).filter((entry) =>
    String(entry.pathKey || entry.key || "") !== pathKey);
  for (const piece of state.pieces || []) {
    piece.explicitMovementPaths = (piece.explicitMovementPaths || []).filter((entry) =>
      String(entry.pathKey || entry.key || "") !== pathKey);
    if (piece.metadata?.explicitMovementPaths) {
      piece.metadata.explicitMovementPaths =
        piece.metadata.explicitMovementPaths.filter((entry) =>
          String(entry.pathKey || entry.key || "") !== pathKey);
    }
  }
  return normalizeRulesV1State(state);
}

function automaticOriginRows(successor, actor, target, rawOptions = {}) {
  const actorDestination = point(actor);
  const targetPosition = point(target);
  const away = {
    xIn: actorDestination.xIn - targetPosition.xIn,
    yIn: actorDestination.yIn - targetPosition.yIn,
  };
  const length = Math.hypot(away.xIn, away.yIn);
  if (length <= 0.001) return [];
  const direction = { xIn: away.xIn / length, yIn: away.yIn / length };
  const allowanceIn = Math.max(0, numeric(actor.speedIn) + 3);
  const requestedDistances = Array.isArray(rawOptions.chargeOriginDistancesIn)
    ? rawOptions.chargeOriginDistancesIn.map(Number)
    : [Math.min(3, allowanceIn), allowanceIn];
  return [...new Set(requestedDistances
    .filter((value) => Number.isFinite(value) && value > 0.001 &&
      value <= allowanceIn + 0.001)
    .map((value) => Math.round(value * 1_000) / 1_000))]
    .map((movementDistanceIn) => ({
      proposalKey: `auto-charge-${actor.pieceKey}-${target.pieceKey}-${movementDistanceIn}`,
      actorPieceKey: actor.pieceKey,
      targetPieceKey: target.pieceKey,
      origin: {
        xIn: actorDestination.xIn + direction.xIn * movementDistanceIn,
        yIn: actorDestination.yIn + direction.yIn * movementDistanceIn,
      },
      movementDistanceIn,
      proposalSource: "target_ray_charge_origin_event_cells_v1",
      predecessorPiecePatches: {},
      actionPatchesByStep: {},
    }));
}

function explicitProposalRows(rawOptions = {}) {
  return (rawOptions.chargePredecessorProposals || []).map((raw, index) => ({
    proposalKey: String(raw.proposalKey || `explicit-charge-${index}`),
    actorPieceKey: String(raw.actorPieceKey || ""),
    targetPieceKey: String(raw.targetPieceKey || ""),
    origin: point(raw.origin),
    originsByPieceKey: stableGraphValue(raw.originsByPieceKey || {}),
    movementDistanceIn: numeric(raw.movementDistanceIn),
    proposalSource: String(raw.proposalSource ||
      "caller_supplied_charge_predecessor_v1"),
    predecessorPiecePatches: stableGraphValue(
      raw.predecessorPiecePatches || {},
    ),
    actionPatchesByStep: stableGraphValue(raw.actionPatchesByStep || {}),
    chargeActionKey: String(raw.chargeActionKey || ""),
    chargeProfileKey: String(raw.chargeProfileKey || ""),
  }));
}

function actionDestinationsMatchSuccessor(action = {}, successor = {}, groupPieces = []) {
  if (groupPieces.length <= 1) return true;
  const rows = action.destinationsByModel ||
    action.metadata?.destinationsByModel || [];
  const byPieceKey = new Map(rows.map((row) => [
    String(row.pieceKey || row.modelPieceKey || ""),
    point(row.to || row.destination || row),
  ]));
  return groupPieces.every((piece) => {
    const expected = (successor.pieces || []).find((candidate) =>
      candidate.pieceKey === piece.pieceKey);
    const observed = byPieceKey.get(piece.pieceKey);
    return expected && observed && samePoint(expected, observed);
  });
}

function chargeActionCandidate(actions, proposal, successor, groupPieces, pathKey) {
  return actions.filter((action) =>
    action.actorPieceKey === proposal.actorPieceKey &&
      action.targetPieceKey === proposal.targetPieceKey &&
      [
        "charge",
        "unit_group_charge",
        "cavalry_charge",
        "assault_charge",
        "failed_charge",
        "unit_group_failed_charge",
      ]
        .includes(action.actionType) &&
      (!proposal.chargeActionKey || action.actionKey === proposal.chargeActionKey) &&
      (!proposal.chargeProfileKey ||
        action.metadata?.attackProfile?.profileKey === proposal.chargeProfileKey) &&
      (!pathKey || action.metadata?.explicitStraightChargeLaneKey === pathKey) &&
      actionDestinationsMatchSuccessor(action, successor, groupPieces))
    .sort((left, right) => {
      const priority = (action) => action.actionType === "unit_group_charge"
        ? 0
        : action.actionType === "charge"
          ? 1
          : action.actionType === "cavalry_charge"
            ? 2
            : action.actionType === "assault_charge"
              ? 3
              : action.actionType === "unit_group_failed_charge"
                ? 4
                : 5;
      return priority(left) - priority(right) ||
        left.actionKey.localeCompare(right.actionKey);
    })[0] || null;
}

function defaultAttackPatch(action = {}) {
  if (!action.metadata?.attackResolution) return {};
  return {
    strictRollOutcome: buildWarmachineBenchmarkStrictRollOutcomeV2(action, {
      attackDie: 1,
      damageDie: 1,
      locationDie: 1,
    }),
  };
}

function plannedPatch(proposal = {}, stepIndex = 0, action = {}) {
  const explicit = proposal.actionPatchesByStep?.[stepIndex] ||
    proposal.actionPatchesByStep?.[String(stepIndex)] || null;
  return explicit ? structuredClone(explicit) : defaultAttackPatch(action);
}

function continuationAction(actions = [], proposal = {}) {
  const chargeAttack = actions.filter((action) =>
    action.actorPieceKey &&
      action.targetPieceKey === proposal.targetPieceKey &&
      /unit_charge_melee_attack|charge.*attack/.test(action.actionType))
    .sort((left, right) => left.actionKey.localeCompare(right.actionKey))[0];
  if (chargeAttack) return chargeAttack;
  const completionPriorities = [
    "end_initial_attack_window",
    "end_combat_purchase_window",
    "end_unit_trooper_combat_action",
    "end_any_time_activation_window",
    "forfeit_combat_action",
    "unit_forfeit_combat_action",
    "pass",
  ];
  for (const actionType of completionPriorities) {
    const found = actions.find((action) => action.actionType === actionType);
    if (found) return found;
  }
  const mandatoryAttack = actions.filter((action) =>
    /melee_attack|ranged_attack/.test(action.actionType))
    .sort((left, right) => left.actionKey.localeCompare(right.actionKey))[0];
  if (mandatoryAttack) return mandatoryAttack;
  return actions.filter((action) =>
    /end_|pass|activation_complete|forfeit/.test(action.actionType))
    .sort((left, right) => left.actionKey.localeCompare(right.actionKey))[0] ||
    null;
}

function strictReplaySteps(receipts = []) {
  return stableGraphValue(receipts.map((receipt) => ({
    actionKey: String(receipt.actionKey || ""),
    actionType: String(receipt.actionType || ""),
    actorPieceKey: String(receipt.actorPieceKey || ""),
    targetPieceKey: String(receipt.targetPieceKey || ""),
    actionPatch: stableGraphValue({
      ...(receipt.persistedAction?.strictRollOutcome
        ? { strictRollOutcome: receipt.persistedAction.strictRollOutcome }
        : {}),
      ...(receipt.persistedAction?.steamroller2026Decision
        ? { steamroller2026Decision:
          receipt.persistedAction.steamroller2026Decision }
        : {}),
    }),
  })));
}

export function generateWarmachineChargeCombatActivationPredecessorsV1(
  successorStateInput = {},
  rawOptions = {},
) {
  const inputSuccessor = normalizeRulesV1State(successorStateInput);
  const requestedActors = Array.isArray(rawOptions.actorPieceKeys)
    ? new Set(rawOptions.actorPieceKeys.map(String))
    : null;
  const requestedTargets = Array.isArray(rawOptions.targetPieceKeys)
    ? new Set(rawOptions.targetPieceKeys.map(String))
    : null;
  const successor = enumerateWarmachineBenchmarkActionsV2(inputSuccessor, {
    ...(requestedActors?.size ? { actorPieceKeys: [...requestedActors].sort() } : {}),
    actionFamilyKeys: ["attack_or_effect", "movement", "timing"],
  }).state;
  const successorStateHash = warmachineReverseStateSemanticHashV1(successor);
  const sideKey = String(rawOptions.sideKey || successor.activeSideKey || "");
  const invariantAudit = auditWarmachineReverseStateBoundaryV1(successor, {
    boundaryKind: "charge_combat_inverse_successor",
  });
  const actors = invariantAudit.ok
    ? (successor.pieces || []).filter((piece) =>
      alive(piece) && piece.sideKey === sideKey && piece.activated === true &&
        (!requestedActors || requestedActors.has(piece.pieceKey)))
    : [];
  const explicitRows = explicitProposalRows(rawOptions);
  const automaticRows = [];
  if (rawOptions.includeAutomaticChargeOrigins !== false) {
    for (const actor of actors) {
      for (const target of (successor.pieces || []).filter((piece) =>
        alive(piece) && piece.sideKey !== actor.sideKey &&
          (!requestedTargets || requestedTargets.has(piece.pieceKey)))) {
        automaticRows.push(...automaticOriginRows(successor, actor, target, rawOptions));
      }
    }
  }
  const proposalRows = [...explicitRows, ...automaticRows]
    .filter((proposal) => proposal.actorPieceKey && proposal.targetPieceKey)
    .sort((left, right) => left.proposalKey.localeCompare(right.proposalKey));
  const maximumProposals = Math.max(0, Math.floor(numeric(
    rawOptions.maximumChargeProposals,
    0,
  )));
  const selectedProposals = maximumProposals > 0
    ? proposalRows.slice(0, maximumProposals)
    : proposalRows;
  const omittedProposals = maximumProposals > 0
    ? proposalRows.slice(maximumProposals)
    : [];
  const candidates = [];
  const rejected = invariantAudit.ok ? [] : [{
    reason: "reverse_predecessor_state_invariant_rejected",
    stateInvariantAudit: summarizeWarmachineReverseStateBoundaryAuditV1(
      invariantAudit,
    ),
    issues: invariantAudit.issues,
  }];
  const unresolved = omittedProposals.map((proposal) => ({
    reason: "charge_combat_predecessor_proposal_budget_deferred",
    proposalKey: proposal.proposalKey,
    actorPieceKey: proposal.actorPieceKey,
    targetPieceKey: proposal.targetPieceKey,
  }));
  let strictAttemptCount = 0;

  for (const proposal of selectedProposals) {
    const successorActor = (successor.pieces || []).find((piece) =>
      piece.pieceKey === proposal.actorPieceKey);
    if (!successorActor || successorActor.sideKey !== sideKey ||
        successorActor.activated !== true) {
      rejected.push({
        reason: "charge_combat_predecessor_actor_unavailable",
        proposalKey: proposal.proposalKey,
        actorPieceKey: proposal.actorPieceKey,
      });
      continue;
    }
    const successorGroup = activationGroupPieces(successor, successorActor);
    for (const resourcePoints of resourcePreimageValues(successorActor)) {
      const predecessor = restoreChargePredecessor(
        successor,
        proposal,
        resourcePoints,
      );
      if (!predecessor) continue;
      const predecessorAudit = auditWarmachineReverseStateBoundaryV1(
        predecessor,
        { boundaryKind: "charge_combat_inverse_predecessor" },
      );
      if (!predecessorAudit.ok) {
        rejected.push({
          reason: "reverse_predecessor_state_invariant_rejected",
          proposalKey: proposal.proposalKey,
          actorPieceKey: proposal.actorPieceKey,
          stateInvariantAudit:
            summarizeWarmachineReverseStateBoundaryAuditV1(predecessorAudit),
          issues: predecessorAudit.issues,
        });
        continue;
      }
      strictAttemptCount += 1;
      const pathKey = `reverse-charge-${stableGraphHash({
        successorStateHash,
        proposalKey: proposal.proposalKey,
        resourcePoints,
      }, 20)}`;
      const prepared = bindWarmachineBenchmarkExplicitMovementPathV2(
        predecessor,
        {
          actorPieceKey: proposal.actorPieceKey,
          targetPieceKey: proposal.targetPieceKey,
          actionType: "charge",
          pathKey,
          waypoints: [point(successorActor)],
          proposalSource: proposal.proposalSource,
          label: `Reverse charge-combat preimage ${proposal.proposalKey}`,
        },
      );
      let selectedChargeAction = null;
      const activation = executeWarmachineBenchmarkActivationV2(
        prepared,
        activationGroupId(successorActor),
        {
          routeKey: `charge-combat-predecessor:${proposal.proposalKey}`,
          repeatIntent: true,
          maxSteps: Math.max(12, successorGroup.length * 6 + 12),
          rejectedAuditLimit: Number(rawOptions.rejectedAuditLimit || 0),
          enumerationScopeForStep: ({ stepIndex }) => stepIndex === 0
            ? {
              actionFamilyKeys: ["attack_or_effect", "movement", "timing"],
              targetPieceKeys: [proposal.targetPieceKey],
              includeUntargetedActions: true,
            }
            : {
              actionFamilyKeys: ["attack_or_effect", "resource", "timing"],
              targetPieceKeys: [proposal.targetPieceKey],
              includeUntargetedActions: true,
            },
          selectAction: ({ scoped, stepIndex }) => {
            const action = stepIndex === 0
              ? chargeActionCandidate(
                scoped.enumeration.actions,
                proposal,
                successor,
                successorGroup,
                pathKey,
              )
              : continuationAction(scoped.enumeration.actions, proposal);
            if (!action) return null;
            if (stepIndex === 0) selectedChargeAction = action;
            const patch = plannedPatch(proposal, stepIndex, action);
            return {
              actionKey: action.actionKey,
              ...(Object.keys(patch).length ? { actionPatch: patch } : {}),
            };
          },
        },
      );
      if (!activation.ok || !activation.completed || !selectedChargeAction) {
        rejected.push({
          reason: activation.reason ||
            "strict_charge_combat_activation_rejected",
          proposalKey: proposal.proposalKey,
          actorPieceKey: proposal.actorPieceKey,
          targetPieceKey: proposal.targetPieceKey,
          resourcePoints,
          selectionAudit: stableGraphValue(activation.selectionAudit || []),
        });
        continue;
      }
      const sanitized = stripChargePath(activation.state, pathKey);
      const executedStateHash = warmachineReverseStateSemanticHashV1(sanitized);
      if (executedStateHash !== successorStateHash) {
        unresolved.push({
          reason: "charge_combat_activation_has_uninverted_side_effects",
          proposalKey: proposal.proposalKey,
          actorPieceKey: proposal.actorPieceKey,
          targetPieceKey: proposal.targetPieceKey,
          resourcePoints,
          executedStateHash,
          expectedSuccessorStateHash: successorStateHash,
          strictReceiptHashes: activation.receiptHashes,
        });
        continue;
      }
      const predecessorStateHash =
        warmachineReverseStateSemanticHashV1(predecessor);
      const replaySteps = strictReplaySteps(activation.receipts || []);
      const core = {
        candidateKind: ["failed_charge", "unit_group_failed_charge"]
          .includes(selectedChargeAction.actionType)
          ? "concrete_failed_charge_activation_predecessor"
          : "concrete_charge_combat_activation_predecessor",
        successorKind: "state_after_charge_activation",
        predecessorKind: "state_before_charge_activation",
        operatorKey: ["failed_charge", "unit_group_failed_charge"]
          .includes(selectedChargeAction.actionType)
          ? "failed_charge_activation_inverse_v1"
          : "charge_combat_activation_inverse_v1",
        actorPieceKey: proposal.actorPieceKey,
        targetPieceKey: proposal.targetPieceKey,
        activationGroupId: activationGroupId(successorActor),
        activationGroupPieceKeys: successorGroup.map((piece) => piece.pieceKey),
        actionType: selectedChargeAction.actionType,
        transitionActionKey: selectedChargeAction.actionKey,
        predecessorStateHash,
        successorStateHash,
        strictWitness: true,
        strictRejected: false,
        strictReceiptHash: activation.activationReceiptHash,
        strictStepReceiptHashes: activation.receiptHashes,
        strictTransitionCount: activation.transitionCount,
        strictReplaySteps: replaySteps,
        preActivationResourcePoints: resourcePoints,
        reverseRestoredResourcePoints: resourcePoints - numeric(
          successorActor.resourcePoints ?? successorActor.resource2,
        ),
        movementProposal: stableGraphValue({
          proposalKey: proposal.proposalKey,
          proposalSource: proposal.proposalSource,
          relationKind: "target_bound_straight_charge_combat_preimage",
          origin: point(proposal.origin),
          destination: point(successorActor),
          targetPieceKey: proposal.targetPieceKey,
          pathKey,
          pathShape: "one_exact_straight_segment",
        }),
        unresolvedReasons: [],
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
          summarizeWarmachineReverseStateBoundaryAuditV1(predecessorAudit),
      };
      candidates.push({
        ...core,
        candidateKey: `charge-combat-activation-predecessor-${
          stableGraphHash(core, 32)}`,
        predecessorState: predecessor,
      });
    }
  }

  candidates.sort((left, right) =>
    left.candidateKey.localeCompare(right.candidateKey));
  const publicCandidates = candidates.map(({
    predecessorState: _state,
    ...candidate
  }) => candidate);
  const candidateSet = buildWarmachineReverseReachabilityCandidateSetV2(
    publicCandidates,
    {
      queryKey: String(rawOptions.queryKey ||
        `charge-combat-activation:${sideKey}:${successorStateHash}`),
      successorStateKey: String(successor.stateKey || ""),
      maximumCandidates: rawOptions.maximumCandidates ?? publicCandidates.length,
    },
  );
  const core = {
    schemaVersion:
      WARMACHINE_CHARGE_COMBAT_ACTIVATION_PREDECESSOR_V1_SCHEMA,
    sideKey,
    successorStateHash,
    candidateActorCount: actors.length,
    proposalCount: proposalRows.length,
    selectedProposalCount: selectedProposals.length,
    strictAttemptCount,
    strictCandidateCount: candidates.length,
    strictRejectedCount: rejected.length,
    unresolvedCount: unresolved.length,
    publicCandidates: stableGraphValue(publicCandidates),
    rejected: stableGraphValue(rejected),
    unresolved: stableGraphValue(unresolved),
    successorStateInvariantAudit:
      summarizeWarmachineReverseStateBoundaryAuditV1(invariantAudit),
    candidateSet,
    claimBoundary: "Each accepted row is one complete Host-strict charge activation. A successful charge includes one target-bound straight segment, the mandatory first charge attack, every selected continuation and activation completion; a failed charge includes the exact legal movement and immediate activation end without inventing an attack. The full execution must reproduce the exact supplied successor. Automatic target-ray origins are finite proposals only. Explicit target lifecycle/health preimages, omitted origins, unselected attack sequences, additional attacks, reactions and Chance classes remain unresolved until separately supplied and exhausted; no strategy or optimality claim follows.",
  };
  return {
    ...core,
    candidates,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: candidateSet.reachabilityContractOk && candidates.length > 0,
  };
}
