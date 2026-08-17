import {
  buildWarmachineBenchmarkMaximumStrictRollOutcomeV2,
  executeWarmachineBenchmarkActivationV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  auditRulesV1StaticPlacement,
  closestPointDistanceIn,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";
import {
  warmachineSteamrollerTerminalScenarioSubcellKeyV1,
} from "./steamroller-terminal-scenario-corpus-v1.mjs";
import { buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1 } from
  "./steamroller-terminal-execution-roster-witness-v1.mjs";

export const WARMACHINE_STEAMROLLER_ASSASSINATION_TERMINAL_ANCHOR_EVIDENCE_V1_SCHEMA =
  "warmachine_steamroller_assassination_terminal_anchor_evidence_v1";

const RUNTIME_WINDOW_FIELDS = Object.freeze([
  "unitActivationWindow",
  "anyTimeActivationWindow",
  "initialAttackWindow",
  "combatPurchaseWindow",
  "activationForfeitWindow",
  "vengeanceWindow",
]);

function isLeader(piece = {}) {
  return piece.isWarcaster || piece.isWarlock || piece.isLeader ||
    /warcaster|warlock|leader/i.test(`${piece.modelRole || ""} ${piece.modelType || ""}`);
}

function alive(piece = {}) {
  return piece.destroyed !== true && piece.removedFromPlay !== true &&
    Number(piece.damage?.boxesRemaining ?? piece.boxesRemaining ?? 1) > 0;
}

function activationGroupKeyForPiece(piece = {}) {
  return String(
    piece.unitGroupId ||
      piece.unitId ||
      piece.metadata?.unitGroupId ||
      piece.metadata?.unitId ||
      piece.pieceKey ||
      "",
  );
}

function zeroResources(piece = {}) {
  piece.resourcePoints = 0;
  if ("resource2" in piece) piece.resource2 = 0;
  if ("focus" in piece) piece.focus = 0;
  if ("focusPoints" in piece) piece.focusPoints = 0;
  if ("fury" in piece) piece.fury = 0;
  if ("furyPoints" in piece) piece.furyPoints = 0;
}

function restoreAtOneBox(piece = {}) {
  piece.destroyed = false;
  piece.destroyedTriggerOccurred = false;
  piece.removedFromPlay = false;
  piece.offTable = false;
  piece.disabled = false;
  piece.boxed = false;
  piece.damageLifecycleStage = "";
  piece.damage = { ...(piece.damage || {}), boxesRemaining: 1 };
  if ("boxesRemaining" in piece) piece.boxesRemaining = 1;
}

function baseRadiusIn(piece = {}) {
  return Number(piece.baseSizeIn || 1.18) / 2;
}

function meleeRangeIn(piece = {}) {
  const profiles = [
    ...(piece.weaponProfiles || []),
    ...(piece.cardSnapshot?.weaponProfiles || []),
  ].filter((profile) => String(profile?.mode || "").toLowerCase() === "melee");
  return Math.max(0, ...profiles.map((profile) => Number(profile.rangeIn || 0)),
    Number(piece.meleeRangeIn || 1));
}

function actionEdgeGapIn(actor = {}, actionRange = "strictly_inside") {
  const rangeIn = meleeRangeIn(actor);
  if (actionRange === "strictly_inside") return Math.max(0.05, rangeIn / 4);
  if (actionRange === "on_boundary") return rangeIn;
  if (actionRange === "outside_direct_action_range_requires_prior_movement") {
    return rangeIn + 0.25;
  }
  throw new Error(`assassination_anchor_action_range_unknown:${actionRange}`);
}

function leaderControlEdgeGapIn(controller = {}, leaderControl = "strictly_inside") {
  const rangeIn = Math.max(0, Number(controller.controlRangeIn || 0));
  if (!rangeIn) throw new Error("assassination_anchor_controller_range_missing");
  if (leaderControl === "strictly_inside") return Math.min(1.7, rangeIn / 4);
  if (leaderControl === "on_boundary") return rangeIn;
  if (leaderControl === "outside_or_not_required") return rangeIn + 0.25;
  throw new Error(`assassination_anchor_leader_control_unknown:${leaderControl}`);
}

function relationBand(distanceIn, rangeIn) {
  if (Math.abs(distanceIn - rangeIn) <= 0.001) return "on_boundary";
  return distanceIn < rangeIn ? "strictly_inside" : "outside";
}

function authorTwoFrontsAssassinationState(
  fixture = {},
  actionRange = "strictly_inside",
  leaderControl = "strictly_inside",
) {
  const state = structuredClone(fixture.stateTemplate || {});
  for (const field of RUNTIME_WINDOW_FIELDS) delete state[field];
  state.strictMode = true;
  state.enforceStrictExecutor = true;
  state.activeSideKey = "player1";
  state.phaseKey = "activation";
  state.turnNumber = 2;
  state.outcome = null;
  state.terminal = null;
  state.metadata = {
    ...(state.metadata || {}),
    strictMode: true,
    enforceStrictExecutor: true,
    terminalCorpusWitness: true,
  };
  for (const piece of state.pieces || []) {
    piece.activated = false;
    piece.activationKey = "";
    zeroResources(piece);
  }
  const actor = state.pieces.find((piece) =>
    piece.sideKey === "player1" && /raptor/i.test(`${piece.label || ""} ${piece.name || ""}`));
  const controller = state.pieces.find((piece) =>
    piece.sideKey === "player1" && isLeader(piece));
  const target = state.pieces.find((piece) =>
    piece.sideKey === "player2" && isLeader(piece));
  if (!actor || !controller || !target) {
    throw new Error("assassination_anchor_required_piece_identity_missing");
  }
  const actorPosition = { xIn: 17.5, yIn: 20 };
  const actorMeleeRangeIn = meleeRangeIn(actor);
  const edgeGapIn = actionEdgeGapIn(actor, actionRange);
  const targetPosition = {
    xIn: actorPosition.xIn + baseRadiusIn(actor) + baseRadiusIn(target) + edgeGapIn,
    yIn: actorPosition.yIn,
  };
  const controllerControlRangeIn = Math.max(0, Number(controller.controlRangeIn || 0));
  const controllerEdgeGapIn = leaderControlEdgeGapIn(controller, leaderControl);
  const controllerPosition = {
    xIn: actorPosition.xIn,
    yIn: actorPosition.yIn - baseRadiusIn(actor) - baseRadiusIn(controller) -
      controllerEdgeGapIn,
  };
  actor.position = actorPosition;
  target.position = targetPosition;
  controller.position = controllerPosition;
  restoreAtOneBox(target);
  state.stateKey = `two-fronts-round-2-assassination-anchor-predecessor:${actionRange}:${leaderControl}:v1`;
  const normalized = normalizeRulesV1State(state);
  const normalizedActor = normalized.pieces.find((piece) => piece.pieceKey === actor.pieceKey);
  const normalizedController = normalized.pieces.find((piece) =>
    piece.pieceKey === controller.pieceKey);
  const normalizedTarget = normalized.pieces.find((piece) => piece.pieceKey === target.pieceKey);
  const actorTargetEdgeDistanceIn = closestPointDistanceIn(normalizedActor, normalizedTarget);
  const actorControllerEdgeDistanceIn = closestPointDistanceIn(
    normalizedActor,
    normalizedController,
  );
  const observedActionRangeBand = relationBand(actorTargetEdgeDistanceIn, actorMeleeRangeIn);
  const observedLeaderControlBand = relationBand(
    actorControllerEdgeDistanceIn,
    controllerControlRangeIn,
  );
  const expectedActionRangeBand = actionRange ===
      "outside_direct_action_range_requires_prior_movement"
    ? "outside"
    : actionRange;
  const expectedLeaderControlBand = leaderControl === "outside_or_not_required"
    ? "outside"
    : leaderControl;
  if (observedActionRangeBand !== expectedActionRangeBand ||
      observedLeaderControlBand !== expectedLeaderControlBand) {
    throw new Error(`assassination_anchor_relation_band_mismatch:${stableGraphHash({
      actionRange,
      leaderControl,
      actorTargetEdgeDistanceIn,
      actorMeleeRangeIn,
      actorControllerEdgeDistanceIn,
      controllerControlRangeIn,
      observedActionRangeBand,
      observedLeaderControlBand,
    })}`);
  }
  return {
    state: normalized,
    actorPieceKey: actor.pieceKey,
    controllerPieceKey: controller.pieceKey,
    targetPieceKey: target.pieceKey,
    geometry: {
      actorPosition,
      targetPosition,
      controllerPosition,
      edgeGapIn,
      actorMeleeRangeIn,
      actorTargetCenterDistanceIn: Math.hypot(
        actorPosition.xIn - targetPosition.xIn,
        actorPosition.yIn - targetPosition.yIn,
      ),
      actorTargetEdgeDistanceIn,
      actionRangeBand: observedActionRangeBand,
      controllerControlRangeIn,
      actorControllerCenterDistanceIn: Math.hypot(
        actorPosition.xIn - controllerPosition.xIn,
        actorPosition.yIn - controllerPosition.yIn,
      ),
      actorControllerEdgeDistanceIn,
      leaderControlBand: observedLeaderControlBand,
    },
  };
}

function matchingCorpusCell(corpus = {}) {
  return (corpus.cells || []).find((cell) =>
    cell.scenarioKey === "two_fronts" &&
    cell.terminalClassKey === "unique_leader_assassination" &&
    cell.attackerSideKey === "player1" &&
    cell.defenderSideKey === "player2" &&
    cell.winnerSideKey === "player1" &&
    cell.loserSideKey === "player2" &&
    cell.endingSideKey === "player1" &&
    cell.causalActionFamily === "active_attack_or_effect" &&
    cell.roundClass?.exactRoundNumber === true &&
    cell.roundClass?.representativeRoundNumber === 2) || null;
}

function partitionCoordinates(
  cell = {},
  actionRange = "strictly_inside",
  leaderControl = "strictly_inside",
) {
  const requested = {
    lifecycle: "both_rosters_complete",
    damage: "leader_at_terminal_threshold",
    resource: "zero_available",
    actionRange,
    leaderControl,
    lineOfSight: "clear",
    baseTopology: "legal_separated",
    scenarioTerrainSetup: "all_selected_from_single_candidate",
  };
  return Object.fromEntries(Object.keys(cell.partitions || {}).map((key) => [key, requested[key]]));
}

function terminalEvents(result = {}) {
  return (result.receipts || []).flatMap((receipt) => receipt.events || [])
    .filter((event) => event.eventType === "terminal");
}

function actionSequence(result = {}) {
  return (result.receipts || []).map((receipt) => stableGraphValue({
    actionKey: receipt.actionKey || "",
    actionType: receipt.actionType || "",
    actorPieceKey: receipt.actorPieceKey || "",
    targetPieceKey: receipt.targetPieceKey || "",
  }));
}

function executeAnchor(state = {}, actorPieceKey = "", targetPieceKey = "", routeKey = "") {
  const actor = (state.pieces || []).find((piece) => piece.pieceKey === actorPieceKey) || null;
  if (
    !actor ||
    actor.sideKey !== state.activeSideKey ||
    !alive(actor) ||
    actor.activated === true
  ) throw new Error("assassination_anchor_activation_actor_unavailable");
  const groupKey = activationGroupKeyForPiece(actor);
  if (!groupKey) throw new Error("assassination_anchor_activation_group_missing");
  return executeWarmachineBenchmarkActivationV2(state, groupKey, {
    routeKey,
    repeatIntent: true,
    enumerationScopeForStep: () => ({
      targetPieceKeys: [targetPieceKey],
      includeUntargetedActions: true,
      actionFamilyKeys: ["attack_or_effect", "timing", "resource"],
    }),
    intent: {
      preferAttack: true,
      targetPieceKey,
      requireTargetMatch: true,
      avoidFeat: true,
    },
    selectAction: ({ scoped }) => {
      const action = (scoped.enumeration.actions || []).find((candidate) =>
        candidate.actorPieceKey === actorPieceKey &&
        candidate.targetPieceKey === targetPieceKey &&
        /attack/.test(candidate.actionType) &&
        candidate.metadata?.damageTransfer !== true);
      return action ? {
        actionKey: action.actionKey,
        actionPatch: {
          strictRollOutcome: buildWarmachineBenchmarkMaximumStrictRollOutcomeV2(action),
        },
      } : null;
    },
    maxSteps: 8,
  });
}

export function buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
  corpus = {},
  rosterWitness = null,
  actionRange = "strictly_inside",
  leaderControl = "strictly_inside",
} = {}) {
  const proposal = buildWarmachineSteamrollerAssassinationTerminalAnchorProposalV1({
    corpus,
    rosterWitness,
    actionRange,
    leaderControl,
  });
  const {
    authored,
    cell,
    coordinates,
    placementAudit,
    runtimeWitness,
    subcellKey,
  } = proposal;
  const executed = executeAnchor(
    authored.state,
    authored.actorPieceKey,
    authored.targetPieceKey,
    `assassination-terminal-anchor:${subcellKey}:primary`,
  );
  const replayed = executeAnchor(
    authored.state,
    authored.actorPieceKey,
    authored.targetPieceKey,
    `assassination-terminal-anchor:${subcellKey}:replay`,
  );
  const observedTerminalEvents = terminalEvents(executed);
  const replayTerminalEvents = terminalEvents(replayed);
  const terminal = observedTerminalEvents.find((event) =>
    event.winnerSideKey === "player1");
  const replayTerminal = replayTerminalEvents.find((event) =>
    event.winnerSideKey === "player1");
  const terminalStateHash = warmachineReverseStateSemanticHashV1(executed.state || {});
  const replayStateHash = warmachineReverseStateSemanticHashV1(replayed.state || {});
  const executedActionSequence = actionSequence(executed);
  const replayActionSequence = actionSequence(replayed);
  const actionSequenceHash = stableGraphHash(executedActionSequence);
  const replayActionSequenceHash = stableGraphHash(replayActionSequence);
  if (!executed.ok || !replayed.ok || !terminal || !replayTerminal ||
      terminalStateHash !== replayStateHash || actionSequenceHash !== replayActionSequenceHash) {
    throw new Error(`assassination_anchor_strict_execution_failed:${stableGraphHash({
      executed: { ok: executed.ok, reason: executed.reason, terminal: terminal || null },
      replayed: { ok: replayed.ok, reason: replayed.reason, terminal: replayTerminal || null },
      terminalStateHash,
      replayStateHash,
      actionSequenceHash,
      replayActionSequenceHash,
    })}`);
  }
  const primaryReceipt = executed.receipts.find((receipt) =>
    (receipt.events || []).some((event) => event.eventType === "terminal"));
  const replayReceipt = replayed.receipts.find((receipt) =>
    (receipt.events || []).some((event) => event.eventType === "terminal"));
  const causalAttackReceipt = executed.receipts.find((receipt) =>
    /attack/.test(String(receipt.actionType || "")) &&
    receipt.actorPieceKey === authored.actorPieceKey &&
    receipt.targetPieceKey === authored.targetPieceKey);
  const root = stableGraphValue({
    disposition: "strict_materialized",
    authority: "rules_v1_host",
    strictRulesConclusion: false,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    scenarioKey: cell.scenarioKey,
    cellKey: cell.cellKey,
    subcellKey,
    terminalClassKey: cell.terminalClassKey,
    actionKey: causalAttackReceipt?.actionKey || "",
    actionType: causalAttackReceipt?.actionType || "",
    terminalSettlementActionKey: primaryReceipt?.actionKey || "",
    terminalSettlementActionType: primaryReceipt?.actionType || "",
    receiptHash: primaryReceipt?.receiptHash || "",
    replayReceiptHash: replayReceipt?.receiptHash || "",
    strictReplayCertified: true,
    predecessorStateHash: warmachineReverseStateSemanticHashV1(authored.state),
    terminalStateHash,
    actionSequenceHash,
    actionSequence: executedActionSequence.map((action) => ({
      actionKey: action.actionKey,
      actionType: action.actionType,
      actorPieceKey: action.actorPieceKey,
      targetPieceKey: action.targetPieceKey,
    })),
    partitionCoordinates: coordinates,
    executionRosterWitnessHash: runtimeWitness.witness.witnessHash,
    executionRosterModelCount: runtimeWitness.witness.modelCount,
    actorPieceKey: authored.actorPieceKey,
    controllerPieceKey: authored.controllerPieceKey,
    targetPieceKey: authored.targetPieceKey,
    geometry: authored.geometry,
    staticPlacementAuditHash: stableGraphHash(placementAudit),
    historicalReachabilityProven: false,
    reachabilityProven: false,
    trainingTruth: false,
  });
  const core = {
    schemaVersion: WARMACHINE_STEAMROLLER_ASSASSINATION_TERMINAL_ANCHOR_EVIDENCE_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    corpusHash: corpus.corpusHash,
    executionRosterWitness: runtimeWitness.witness,
    actionRange,
    leaderControl,
    strictMaterializedRootCount: 1,
    strictRejectedRootCount: 0,
    roots: [root],
    claimBoundary: "This evidence proves one exact Two Fronts round-two active-attack assassination subcell from a complete legal 100-point roster state. The Host validates static placement, legal action enumeration, any movement encoded by the selected attack action, damage/lifecycle/terminal resolution and independent replay. The authored later-round state is not yet proven reachable from deployment and is not training truth.",
    trainingTruth: false,
  };
  return {
    proposal,
    evidence: stableGraphValue({ ...core, evidenceHash: stableGraphHash(core) }),
    runtime: {
      authoredState: authored.state,
      executed,
      replayed,
      placementAudit,
    },
  };
}

export function buildWarmachineSteamrollerAssassinationTerminalAnchorProposalV1({
  corpus = {},
  rosterWitness = null,
  actionRange = "strictly_inside",
  leaderControl = "strictly_inside",
} = {}) {
  if (corpus.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
    throw new Error("assassination_anchor_corpus_host_mismatch");
  }
  const runtimeWitness = rosterWitness ||
    buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1();
  if (runtimeWitness.witness?.complete !== true) {
    throw new Error("assassination_anchor_execution_roster_incomplete");
  }
  const cell = matchingCorpusCell(corpus);
  if (!cell) throw new Error("assassination_anchor_corpus_cell_missing");
  const coordinates = partitionCoordinates(cell, actionRange, leaderControl);
  const subcellKey = warmachineSteamrollerTerminalScenarioSubcellKeyV1(cell, coordinates);
  const authored = authorTwoFrontsAssassinationState(
    runtimeWitness.fixture,
    actionRange,
    leaderControl,
  );
  const placementAudit = auditRulesV1StaticPlacement(authored.state);
  if (!placementAudit.ok) {
    throw new Error(`assassination_anchor_static_placement_rejected:${stableGraphHash(placementAudit)}`);
  }
  const core = {
    schemaVersion: "warmachine_steamroller_assassination_terminal_anchor_proposal_v1",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    corpusHash: corpus.corpusHash,
    cellKey: cell.cellKey,
    subcellKey,
    partitionCoordinates: coordinates,
    executionRosterWitnessHash: runtimeWitness.witness.witnessHash,
    authoredStateHash: warmachineReverseStateSemanticHashV1(authored.state),
    claimBoundary: "This proposal binds a complete roster-backed later-round state to one corpus subcell. It is not a Host rule conclusion or a reachability proof.",
    trainingTruth: false,
  };
  return {
    ...stableGraphValue({ ...core, proposalHash: stableGraphHash(core) }),
    authored,
    cell,
    coordinates,
    placementAudit,
    runtimeWitness,
    subcellKey,
  };
}
