import {
  enumerateWarmachineBenchmarkActionsV2,
  executeScopedWarmachineBenchmarkActionV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { buildWarmachineFixedTerminalPositionCorpusV1 } from
  "../benchmark/fixed-terminal-position-corpus-v1.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { buildWarmachineMinimalTerminalProofV2 } from "./terminal-proof-v2.mjs";
import { buildWarmachineTerminalHypothesisDomainV1 } from "./terminal-hypothesis-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";
import { warmachineSteamrollerTerminalScenarioSubcellKeyV1 } from
  "./steamroller-terminal-scenario-corpus-v1.mjs";

export const WARMACHINE_STEAMROLLER_CHANNELED_EXCARNATE_TERMINAL_EVIDENCE_V1_SCHEMA =
  "warmachine_steamroller_channeled_excarnate_terminal_evidence_v1";

const EXCARNATE_SOURCE_ID = "4f023171-2883-4306-a19a-06e83a9004ec";
const EXCARNATE_ATOM_KEY = "excarnate_box_living_enemy_warrior_rfp_add_grunt";
const TERMINAL_ACTION_TYPE = "boosted_hit_damage_channeled_offensive_spell";

function isLeader(piece = {}) {
  return piece.isWarcaster || piece.isWarlock || piece.isLeader ||
    /warcaster|warlock|leader/i.test(`${piece.modelRole || ""} ${piece.modelType || ""}`);
}

function setResourcePoints(piece = {}, points = 0) {
  piece.resourcePoints = points;
  piece.resource2 = points;
  for (const field of ["focus", "focusPoints", "fury", "furyPoints"]) {
    if (field in piece) piece[field] = points;
  }
}

function resourcePoints(piece = {}) {
  return Number(
    piece.resourcePoints ?? piece.focus ?? piece.focusPoints ??
      piece.fury ?? piece.furyPoints ?? 0,
  );
}

function baseRadiusIn(piece = {}) {
  return Number(piece.baseRadiusIn ?? Number(piece.baseSizeIn || 1.18) / 2);
}

function edgeDistanceIn(left = {}, right = {}) {
  return Math.max(0, Math.hypot(
    Number(left.position?.xIn || 0) - Number(right.position?.xIn || 0),
    Number(left.position?.yIn || 0) - Number(right.position?.yIn || 0),
  ) - baseRadiusIn(left) - baseRadiusIn(right));
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
    cell.roundClass?.representativeRoundNumber === 3) || null;
}

function partitionCoordinates(cell = {}, resourcePartitionValue = "exact_terminal_payment") {
  const requested = {
    lifecycle: "both_rosters_complete",
    damage: "leader_at_terminal_threshold",
    resource: resourcePartitionValue,
    actionRange: "strictly_inside",
    leaderControl: "strictly_inside",
    lineOfSight: "clear",
    baseTopology: "legal_separated",
    scenarioTerrainSetup: "all_selected_from_single_candidate",
  };
  return Object.fromEntries(Object.keys(cell.partitions || {}).map((key) => [
    key,
    requested[key],
  ]));
}

function prepareTerminalState(positionCorpus = {}) {
  const positionRoot = positionCorpus.materialized?.runtimeRoots?.[0];
  if (!positionRoot) throw new Error("channeled_excarnate_position_root_missing");
  const state = structuredClone(positionRoot.preTerminalState);
  const actor = state.pieces.find((piece) =>
    piece.sideKey === "player1" && /master necrosurgeon sepsira/i.test(
      `${piece.label || ""} ${piece.name || ""}`,
    ));
  const target = state.pieces.find((piece) =>
    piece.sideKey === "player2" && isLeader(piece));
  if (!actor || !target) throw new Error("channeled_excarnate_actor_or_target_missing");
  setResourcePoints(actor, 5);
  target.damage = { ...(target.damage || {}), boxesRemaining: 11 };
  if ("boxesRemaining" in target) target.boxesRemaining = 11;
  target.destroyed = false;
  target.removedFromPlay = false;
  target.offTable = false;
  target.disabled = false;
  target.boxed = false;
  target.damageLifecycleStage = "";
  const normalized = normalizeRulesV1State(state);
  const scoped = enumerateWarmachineBenchmarkActionsV2(normalized, {
    actorPieceKeys: [actor.pieceKey],
    targetPieceKeys: [target.pieceKey],
    actionFamilyKeys: ["attack_or_effect"],
    includeActorlessActions: false,
    includeUntargetedActions: false,
  });
  const action = (scoped.enumeration.actions || []).find((candidate) =>
    candidate.actionType === TERMINAL_ACTION_TYPE &&
    candidate.actionKey.includes(EXCARNATE_SOURCE_ID) &&
    !candidate.actionKey.includes(":transfer-") &&
    String(candidate.metadata?.channelerPieceKey ||
      candidate.metadata?.attackResolution?.channelerPieceKey || "") ===
        "player1_raptor_22_1");
  if (!action) {
    throw new Error(`channeled_excarnate_action_missing:${stableGraphHash({
      rejected: (scoped.enumeration.rejectedActions || []).filter((candidate) =>
        candidate.actorPieceKey === actor.pieceKey &&
        candidate.targetPieceKey === target.pieceKey),
    })}`);
  }
  const channelerPieceKey = String(action.metadata?.channelerPieceKey ||
    action.metadata?.attackResolution?.channelerPieceKey || "");
  const channeler = scoped.state.pieces.find((piece) =>
    piece.pieceKey === channelerPieceKey);
  if (!channeler) throw new Error("channeled_excarnate_channeler_missing");
  return { state: scoped.state, scoped, action, actor, target, channeler, positionRoot };
}

function executeTerminal(prepared = {}, routeKey = "") {
  return executeScopedWarmachineBenchmarkActionV2(
    prepared.scoped,
    prepared.action,
    { actionKey: prepared.action.actionKey },
    {
      routeKey,
      actionPatch: {
        strictRollOutcome: {
          attackDice: [6, 6, 6],
          damageDice: [6, 6, 6],
        },
        strictRuleAtomReturnGruntOutcome: {
          atomKey: EXCARNATE_ATOM_KEY,
          decline: true,
        },
      },
    },
  );
}

function buildReverseCell(prepared = {}, positionCorpus = {}) {
  const exactCoordinates = Object.fromEntries((prepared.state.pieces || []).map((piece) => [
    piece.pieceKey,
    piece.position,
  ]));
  const domain = buildWarmachineTerminalHypothesisDomainV1({
    scenarioKey: "two-fronts",
    scenarioPacketKey: "steamroller-2026",
    scenarioPacketYear: "2026",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    rosterReceiptHash: positionCorpus.fixture.fixtureHash,
    specs: [{
      goalType: "assassination",
      roundNumbers: [3],
      winnerSideKeys: ["player1"],
      loserSideKeys: ["player2"],
      endingSideKeys: ["player1"],
      causalActionFamilies: ["strict_channeled_spell"],
      actorPieceKeys: [prepared.actor.pieceKey],
      targetLeaderPieceKeys: [prepared.target.pieceKey],
      targetBoxesBeforeFinal: [11],
      resourceEnvelopeKeys: ["exact_channeled_excarnate_payment"],
      geometryRelationCells: [{
        relationKind: "later_round_channeled_spell_terminal",
        actorToTargetRangeBand: "channeler_strictly_inside_spell_range",
        lineOfSightRelation: "channeler_clear_los",
        pathRelation: "no_movement_in_terminal_step",
        baseRelation: "legal_nonoverlap",
        exactCoordinatesKnown: true,
        exactCoordinates: { piecePositions: exactCoordinates },
        relationChecks: [{
          relationKey: "sepsira-controls-terminal-channeler",
          relationKind: "maximum_edge_distance",
          sourcePieceKey: prepared.actor.pieceKey,
          targetPieceKey: prepared.channeler.pieceKey,
          maximumDistanceIn: Number(prepared.actor.controlRangeIn || 14),
        }, {
          relationKey: "terminal-channeler-inside-excarnate-range",
          relationKind: "maximum_edge_distance",
          sourcePieceKey: prepared.channeler.pieceKey,
          targetPieceKey: prepared.target.pieceKey,
          maximumDistanceIn: 10,
        }],
      }],
      assumptionSources: {
        goalType: "user_constrained",
        roundNumber: "user_constrained",
        winnerSideKey: "user_constrained",
        loserSideKey: "rule_derived",
        endingSideKey: "user_constrained",
        causalActionFamily: "optimistic_proposal",
        actorPieceKey: "optimistic_proposal",
        targetLeaderPieceKey: "user_constrained",
        targetBoxesBeforeFinal: "optimistic_proposal",
        resourceEnvelopeKey: "optimistic_proposal",
        geometryRelationCell: "optimistic_proposal",
      },
    }],
  });
  return domain.cells[0];
}

export function buildWarmachineSteamrollerChanneledExcarnateTerminalEvidenceV1({
  corpus = {},
  positionCorpus = null,
  resourcePartitionValues = ["exact_terminal_payment"],
} = {}) {
  if (corpus.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
    throw new Error("channeled_excarnate_corpus_host_mismatch");
  }
  const runtimePositionCorpus = positionCorpus ||
    buildWarmachineFixedTerminalPositionCorpusV1({
      maximumProposals: 1,
      maximumMaterializedCells: 1,
    });
  const prepared = prepareTerminalState(runtimePositionCorpus);
  const positionGenerationEvidence = runtimePositionCorpus.positionDomain.proposals[0]
    ?.geometryRelationCell?.generationEvidence || {};
  const placementAudit = auditRulesV1StaticPlacement(prepared.state);
  const anchorPieceKeyByUnitGroupKey = Object.fromEntries(
    (positionGenerationEvidence.remainingPlacementEvidence?.unitFormationAudit || [])
      .map((row) => [row.unitGroupKey, row.anchorPieceKey]),
  );
  const formationAudit = auditRulesV1StaticUnitFormation(
    prepared.state,
    { anchorPieceKeyByUnitGroupKey },
  );
  if (!placementAudit.ok || !formationAudit.ok) {
    throw new Error(`channeled_excarnate_static_audit_failed:${stableGraphHash({
      placementAudit,
      formationAudit,
    })}`);
  }
  const primary = executeTerminal(prepared, "channeled-excarnate-terminal:primary");
  const replayPrepared = prepareTerminalState(runtimePositionCorpus);
  const replay = executeTerminal(replayPrepared, "channeled-excarnate-terminal:replay");
  if (!primary.ok || !replay.ok) {
    throw new Error(`channeled_excarnate_strict_execution_failed:${stableGraphHash({
      primary: { ok: primary.ok, reason: primary.reason },
      replay: { ok: replay.ok, reason: replay.reason },
    })}`);
  }
  const primaryEvents = primary.transition.events || [];
  const replayEvents = replay.transition.events || [];
  const terminalEvent = primaryEvents.find((event) => event.eventType === "terminal" &&
    event.reason === "steamroller_2026_only_side_with_leader_models_remaining" &&
    event.winnerSideKey === "player1");
  const replayTerminalEvent = replayEvents.find((event) => event.eventType === "terminal" &&
    event.reason === "steamroller_2026_only_side_with_leader_models_remaining" &&
    event.winnerSideKey === "player1");
  const terminalStateHash = warmachineReverseStateSemanticHashV1(primary.normalizedState);
  const replayStateHash = warmachineReverseStateSemanticHashV1(replay.normalizedState);
  const proof = buildWarmachineMinimalTerminalProofV2(
    primary.normalizedState,
    { goalType: "assassination", winnerSideKey: "player1" },
    {
      strictEvents: primaryEvents,
      strictReceiptHash: primary.receipt.receiptHash,
      endingSideKey: "player1",
      terminalTurnNumber: 3,
      terminalPhaseKey: "activation",
    },
  );
  if (!terminalEvent || !replayTerminalEvent || terminalStateHash !== replayStateHash ||
      proof.strictCertified !== true) {
    throw new Error(`channeled_excarnate_terminal_proof_failed:${stableGraphHash({
      terminalEvent,
      replayTerminalEvent,
      terminalStateHash,
      replayStateHash,
      proof,
    })}`);
  }
  const targetAfter = primary.normalizedState.pieces.find((piece) =>
    piece.pieceKey === prepared.target.pieceKey);
  const actorAfter = primary.normalizedState.pieces.find((piece) =>
    piece.pieceKey === prepared.actor.pieceKey);
  const resourceEvent = primaryEvents.find((event) =>
    event.eventType === "resource_spent" && event.actorPieceKey === prepared.actor.pieceKey);
  const wildEvents = primaryEvents.filter((event) =>
    event.eventType === "warbeast_became_wild");
  const expectedBattlegroupPieceKeys = prepared.state.pieces.filter((piece) =>
    piece.controllerPieceKey === prepared.target.pieceKey && piece.isWarbeast === true)
    .map((piece) => piece.pieceKey).sort();
  const observedWildPieceKeys = wildEvents.map((event) => event.targetPieceKey).sort();
  const requiredEventTypes = [
    "spell_declared",
    "spell_channeled",
    "resource_spent",
    "damage",
    "disabled",
    "boxed",
    "removed_from_play",
    `${EXCARNATE_ATOM_KEY}_grunt_return_declined`,
    "resource_collection_prevented",
    "battlegroup_controller_destruction_resolved",
    "terminal",
  ];
  const missingEventTypes = requiredEventTypes.filter((eventType) =>
    !primaryEvents.some((event) => event.eventType === eventType));
  if (resourcePoints(prepared.actor) !== 5 || resourcePoints(actorAfter) !== 0 ||
      Number(resourceEvent?.amount) !== 5 || targetAfter?.removedFromPlay !== true ||
      primaryEvents.some((event) => event.eventType === "destroyed" &&
        event.targetPieceKey === prepared.target.pieceKey) || missingEventTypes.length ||
      stableGraphHash(expectedBattlegroupPieceKeys) !== stableGraphHash(observedWildPieceKeys)) {
    throw new Error(`channeled_excarnate_transition_contract_failed:${stableGraphHash({
      resourceBefore: resourcePoints(prepared.actor),
      resourceAfter: resourcePoints(actorAfter),
      resourceEvent,
      targetAfter,
      missingEventTypes,
      expectedBattlegroupPieceKeys,
      observedWildPieceKeys,
    })}`);
  }

  const cell = matchingCorpusCell(corpus);
  if (!cell) throw new Error("channeled_excarnate_terminal_corpus_cell_missing");
  const selectedResourcePartitionValues = [...new Set(
    resourcePartitionValues.map(String),
  )].sort();
  const supportedResourcePartitionValues = new Set([
    "exact_terminal_payment",
    "controller_transfer_or_channel_available",
  ]);
  if (!selectedResourcePartitionValues.length ||
      selectedResourcePartitionValues.some((value) =>
        !supportedResourcePartitionValues.has(value))) {
    throw new Error("channeled_excarnate_resource_partition_selection_invalid");
  }
  const reverseCell = buildReverseCell(prepared, runtimePositionCorpus);
  const channelerPieceKey = prepared.channeler.pieceKey;
  const rootTemplate = {
    disposition: "strict_materialized",
    authority: "rules_v1_host",
    strictRulesConclusion: false,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    scenarioKey: cell.scenarioKey,
    cellKey: cell.cellKey,
    terminalClassKey: cell.terminalClassKey,
    actionKey: prepared.action.actionKey,
    actionType: prepared.action.actionType,
    receiptHash: primary.receipt.receiptHash,
    replayReceiptHash: replay.receipt.receiptHash,
    strictReplayCertified: true,
    predecessorStateHash: warmachineReverseStateSemanticHashV1(prepared.state),
    terminalStateHash,
    positionDomainCellKey: prepared.positionRoot.cellKey,
    executionRosterModelCount: prepared.state.pieces.length,
    actorPieceKey: prepared.actor.pieceKey,
    targetPieceKey: prepared.target.pieceKey,
    channelerPieceKey,
    spellSourceId: EXCARNATE_SOURCE_ID,
    spellName: "Excarnate",
    resourceEvidence: {
      kind: resourceEvent.resourceKind,
      before: resourcePoints(prepared.actor),
      spent: Number(resourceEvent.amount),
      after: resourcePoints(actorAfter),
      exactTerminalPayment: true,
      controllerChannelRelationshipAvailable: true,
      controllerChannelRelationshipUsed: true,
    },
    geometry: {
      actorPosition: prepared.actor.position,
      channelerPosition: prepared.channeler.position,
      targetPosition: prepared.target.position,
      actorChannelerEdgeDistanceIn: edgeDistanceIn(prepared.actor, prepared.channeler),
      actorControlRangeIn: Number(prepared.actor.controlRangeIn || 0),
      channelerTargetEdgeDistanceIn: edgeDistanceIn(prepared.channeler, prepared.target),
      spellRangeIn: 10,
    },
    lifecycleEvidence: {
      targetBoxesBefore: 11,
      targetRemovedFromPlay: targetAfter.removedFromPlay === true,
      destroyedEventSuppressed: !primaryEvents.some((event) =>
        event.eventType === "destroyed" && event.targetPieceKey === prepared.target.pieceKey),
      returnGruntDeclined: true,
      resourceCollectionPrevented: true,
      battlegroupWildPieceKeys: observedWildPieceKeys,
    },
    strictTerminalProofHash: proof.proofHash,
    staticPlacementAuditHash: stableGraphHash(placementAudit),
    staticUnitFormationAuditHash: stableGraphHash(formationAudit),
    deploymentCoordinatesRead:
      positionGenerationEvidence.remainingPlacementEvidence?.deploymentCoordinatesRead === true,
    historicalReachabilityProven: false,
    reachabilityProven: false,
    trainingTruth: false,
  };
  const roots = selectedResourcePartitionValues.map((resourcePartitionValue) => {
    const coordinates = partitionCoordinates(cell, resourcePartitionValue);
    const subcellKey = warmachineSteamrollerTerminalScenarioSubcellKeyV1(
      cell,
      coordinates,
    );
    return stableGraphValue({
      ...rootTemplate,
      subcellKey,
      partitionCoordinates: coordinates,
      resourceEvidence: {
        ...rootTemplate.resourceEvidence,
        partitionValue: resourcePartitionValue,
      },
    });
  });
  const core = {
    schemaVersion:
      WARMACHINE_STEAMROLLER_CHANNELED_EXCARNATE_TERMINAL_EVIDENCE_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    corpusHash: corpus.corpusHash,
    strictMaterializedRootCount: roots.length,
    strictRejectedRootCount: 0,
    roots,
    claimBoundary: "This evidence proves one exact Two Fronts round-three terminal subcell on a complete 103-model roster state. The Project D Host enumerates and twice executes Sepsira's boosted-hit-and-damage Excarnate through Raptor 22, spends exactly five focus, applies 11 damage, resolves Disabled then Boxed then Excarnate removal from play with the optional Grunt addition declined, suppresses Destroyed/resource collection, makes the defeated warlock's six warbeasts wild and emits the assassination terminal. The full-board positions are generated without reading deployment coordinates and pass Host placement/formation audit. The prior history remains unproven, Chance mass is not closed here, and this is not training truth or strategy evidence.",
    trainingTruth: false,
  };
  return {
    evidence: stableGraphValue({ ...core, evidenceHash: stableGraphHash(core) }),
    runtime: {
      preTerminalState: prepared.state,
      terminalState: primary.normalizedState,
      primary,
      replay,
      reverseCell,
      controllerDestructionResourcePointsByPieceKey: Object.fromEntries(
        prepared.state.pieces.filter((piece) =>
          expectedBattlegroupPieceKeys.includes(piece.pieceKey)).map((piece) => [
          piece.pieceKey,
          resourcePoints(piece),
        ]),
      ),
      controllerDestructionStatusPreimageByPieceKey: Object.fromEntries(
        expectedBattlegroupPieceKeys.map((pieceKey) => [pieceKey, { wild: false }]),
      ),
      controllerDestructionUpkeepPreimageByControllerPieceKey: {
        [prepared.target.pieceKey]: { mode: "none_active" },
      },
      placementAudit,
      formationAudit,
      positionGenerationEvidence,
    },
  };
}
