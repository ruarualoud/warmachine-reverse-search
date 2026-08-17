import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  applyRulesV1Action,
  auditRulesV1StaticPlacement,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import {
  buildWarmachineFixedRoundTerminalHypothesisCellFromEvidenceV1,
} from "./steamroller-fixed-round-terminal-anchor-evidence-v1.mjs";
import {
  warmachineSteamrollerTerminalScenarioSubcellKeyV1,
} from "./steamroller-terminal-scenario-corpus-v1.mjs";
import {
  generateWarmachineTerminalEventPredecessorsV1,
  warmachineReverseStateSemanticHashV1,
} from "./terminal-event-predecessor-v1.mjs";

export const WARMACHINE_STEAMROLLER_TERMINAL_MUTABLE_STATE_EVIDENCE_V1_SCHEMA =
  "warmachine_steamroller_terminal_mutable_state_evidence_v1";

const TARGET_PIECES = Object.freeze({
  winnerLoss: "player1_mechanithrall_swarm_2_1",
  loserLoss: "player2_the_devoted_12_1",
  removedFromPlay: "player2_the_devoted_13_1",
  reserveUnitPrefix: "player2_the_merciless_14_",
  warjack: "player1_raptor_20_1",
  warbeast: "player2_strygon_8_1",
  player1Leader: "player1_master_necrosurgeon_sepsira_1_1",
  player2Leader: "player2_nymara_the_shadowblade_1_1",
});

function pieceByKey(state, pieceKey) {
  const piece = (state.pieces || []).find((candidate) =>
    candidate.pieceKey === pieceKey);
  if (!piece) throw new Error(`mutable_terminal_piece_missing:${pieceKey}`);
  return piece;
}

function addStatusTags(piece, ...tags) {
  piece.statusTags = [...new Set([
    ...(piece.statusTags || []),
    ...tags.filter(Boolean),
  ])].sort();
}

function setPieceResource(piece, points) {
  const value = Math.max(0, Number(points || 0));
  piece.resourcePoints = value;
  if ("resource2" in piece) piece.resource2 = value;
  if ("focus" in piece) piece.focus = value;
  if ("focusPoints" in piece) piece.focusPoints = value;
  if ("fury" in piece) piece.fury = value;
  if ("furyPoints" in piece) piece.furyPoints = value;
}

function setAllResources(state, pointsForPiece = () => 0) {
  for (const piece of state.pieces || []) {
    if (Number(piece.resourceMax || 0) <= 0) continue;
    setPieceResource(piece, pointsForPiece(piece));
  }
}

function markDestroyed(piece, { removedFromPlay = false } = {}) {
  piece.damage = {
    ...(piece.damage || {}),
    boxesRemaining: 0,
  };
  piece.destroyed = true;
  piece.destroyedTriggerOccurred = true;
  piece.damageLifecycleStage = removedFromPlay ? "removed_from_play" : "destroyed";
  piece.removedFromPlay = removedFromPlay;
  piece.activated = false;
  piece.activationKey = "";
  piece.offTable = true;
  piece.notDeployed = true;
  addStatusTags(
    piece,
    "destroyed",
    "off_table",
    "not_deployed",
    removedFromPlay ? "removed_from_play" : "",
  );
}

function markReserveUnit(state) {
  const members = (state.pieces || []).filter((piece) =>
    piece.pieceKey.startsWith(TARGET_PIECES.reserveUnitPrefix));
  if (members.length !== 5 || members.some((piece) => piece.canAmbush !== true)) {
    throw new Error("mutable_terminal_ambush_reserve_source_missing");
  }
  for (const piece of members) {
    piece.offTable = true;
    piece.notDeployed = true;
    piece.activated = false;
    addStatusTags(piece, "off_table", "not_deployed");
  }
  return members.map((piece) => piece.pieceKey).sort();
}

function partiallyDamage(piece, remaining) {
  const maximum = Number(piece.damage?.maxBoxes || 1);
  if (!(remaining > 0 && remaining < maximum)) {
    throw new Error(`mutable_terminal_partial_damage_invalid:${piece.pieceKey}`);
  }
  piece.damage = { ...(piece.damage || {}), boxesRemaining: remaining };
}

function disableRaptorCortex(piece) {
  const columns = structuredClone(piece.damage?.gridColumns || []);
  if (columns.length !== 6) {
    throw new Error("mutable_terminal_raptor_grid_missing");
  }
  let newlyMarked = 0;
  for (const column of columns) {
    for (const cell of column || []) {
      if (cell?.systemKey !== "cortex" || cell.marked === true) continue;
      cell.marked = true;
      newlyMarked += 1;
    }
  }
  if (newlyMarked !== 4) {
    throw new Error(`mutable_terminal_raptor_cortex_count:${newlyMarked}`);
  }
  piece.damage = {
    ...(piece.damage || {}),
    boxesRemaining: Number(piece.damage.maxBoxes) - newlyMarked,
    gridColumns: columns,
    systems: { ...(piece.damage.systems || {}), cortex: 0 },
  };
  setPieceResource(piece, 0);
  return newlyMarked;
}

function disableStrygonBody(piece) {
  const capacity = Number(piece.damage?.aspectCapacityBySystem?.body || 0);
  if (capacity !== 4 || Number(piece.damage?.systems?.mind) !== 5 ||
      Number(piece.damage?.systems?.spirit) !== 10) {
    throw new Error("mutable_terminal_strygon_aspect_capacity_missing");
  }
  piece.damage = {
    ...(piece.damage || {}),
    boxesRemaining: Number(piece.damage.maxBoxes) - capacity,
    systems: { ...(piece.damage.systems || {}), body: 0 },
  };
  return capacity;
}

const VARIANT_SPECS = Object.freeze([
  {
    key: "winner-prior-losses",
    dimensionKey: "lifecycle",
    value: "winner_prior_losses",
    mutate(state) {
      markDestroyed(pieceByKey(state, TARGET_PIECES.winnerLoss));
      return { affectedPieceKeys: [TARGET_PIECES.winnerLoss] };
    },
  },
  {
    key: "loser-prior-losses",
    dimensionKey: "lifecycle",
    value: "loser_prior_losses",
    mutate(state) {
      markDestroyed(pieceByKey(state, TARGET_PIECES.loserLoss));
      return { affectedPieceKeys: [TARGET_PIECES.loserLoss] };
    },
  },
  {
    key: "both-sides-prior-losses",
    dimensionKey: "lifecycle",
    value: "both_sides_prior_losses",
    mutate(state) {
      markDestroyed(pieceByKey(state, TARGET_PIECES.winnerLoss));
      markDestroyed(pieceByKey(state, TARGET_PIECES.loserLoss));
      return { affectedPieceKeys: [TARGET_PIECES.winnerLoss, TARGET_PIECES.loserLoss] };
    },
  },
  {
    key: "removed-from-play-history",
    dimensionKey: "lifecycle",
    value: "removed_from_play_history",
    mutate(state) {
      markDestroyed(pieceByKey(state, TARGET_PIECES.removedFromPlay), {
        removedFromPlay: true,
      });
      return { affectedPieceKeys: [TARGET_PIECES.removedFromPlay] };
    },
  },
  {
    key: "ambush-reserve-history",
    dimensionKey: "lifecycle",
    value: "reserve_replacement_or_dormant_history",
    mutate(state) {
      return {
        affectedPieceKeys: markReserveUnit(state),
        sourceCapability: "canAmbush",
      };
    },
  },
  {
    key: "critical-models-partially-damaged",
    dimensionKey: "damage",
    value: "critical_models_partially_damaged",
    mutate(state) {
      const player1 = pieceByKey(state, TARGET_PIECES.player1Leader);
      const player2 = pieceByKey(state, TARGET_PIECES.player2Leader);
      partiallyDamage(player1, Number(player1.damage.maxBoxes) - 1);
      partiallyDamage(player2, Number(player2.damage.maxBoxes) - 1);
      return { affectedPieceKeys: [player1.pieceKey, player2.pieceKey] };
    },
  },
  {
    key: "leader-at-terminal-threshold",
    dimensionKey: "damage",
    value: "leader_at_terminal_threshold",
    mutate(state) {
      const leader = pieceByKey(state, TARGET_PIECES.player2Leader);
      partiallyDamage(leader, 1);
      return { affectedPieceKeys: [leader.pieceKey], terminalThresholdBoxes: 1 };
    },
  },
  {
    key: "warjack-cortex-disabled",
    dimensionKey: "damage",
    value: "warjack_system_disabled",
    mutate(state) {
      const warjack = pieceByKey(state, TARGET_PIECES.warjack);
      return {
        affectedPieceKeys: [warjack.pieceKey],
        disabledSystem: "cortex",
        markedSystemBoxes: disableRaptorCortex(warjack),
      };
    },
  },
  {
    key: "warbeast-body-disabled",
    dimensionKey: "damage",
    value: "warbeast_aspect_disabled",
    mutate(state) {
      const warbeast = pieceByKey(state, TARGET_PIECES.warbeast);
      return {
        affectedPieceKeys: [warbeast.pieceKey],
        disabledAspect: "body",
        disabledAspectCapacity: disableStrygonBody(warbeast),
        historicalDamageBranchClaimed: false,
        historicalDamageBranchReason: "current_card_has_aspect_totals_but_no_six_branch_layout",
      };
    },
  },
  {
    key: "zero-available-resource",
    dimensionKey: "resource",
    value: "zero_available",
    mutate() {
      return { resourceClass: "all_native_resource_pools_zero" };
    },
  },
  {
    key: "one-additional-purchase-resource",
    dimensionKey: "resource",
    value: "one_additional_purchase_available",
    mutate(state) {
      const warjack = pieceByKey(state, TARGET_PIECES.warjack);
      setPieceResource(warjack, 1);
      return {
        affectedPieceKeys: [warjack.pieceKey],
        resourceClass: "one_focus_available_for_one_standard_purchase",
      };
    },
  },
]);

function baselineCoordinates(cell) {
  const requested = {
    lifecycle: "both_rosters_complete",
    damage: "critical_models_undamaged",
    resource: "zero_available",
    leaderControl: "outside_or_not_required",
    baseTopology: "legal_separated",
    scenarioControl: "not_applicable",
    scenarioTerrainSetup: "all_flags_fallback_no_valid_terrain",
    trenchCacheLifecycle: "both_caches_active",
  };
  return Object.fromEntries(Object.entries(cell.partitions || {}).map(
    ([dimensionKey, values]) => {
      const value = requested[dimensionKey];
      if (!values.includes(value)) {
        throw new Error(`mutable_terminal_baseline_missing:${dimensionKey}:${value}`);
      }
      return [dimensionKey, value];
    },
  ));
}

function executeEndTurn(state, actionPatch = {}) {
  const enumeration = enumerateRulesV1Actions(state, {
    actionFamilyKeys: ["timing"],
  });
  const action = (enumeration.actions || []).find((candidate) =>
    candidate.actionType === "end_turn");
  if (!action) {
    throw new Error(`mutable_terminal_end_turn_missing:${stableGraphHash({
      rejected: enumeration.rejectedActions || [],
    })}`);
  }
  const transition = applyRulesV1Action(state, {
    actionKey: action.actionKey,
    ...(actionPatch || {}),
    __warmachineTrustedRulesV1Enumeration: enumeration,
  });
  const preparedState = enumeration.state;
  const predecessorStateHash = warmachineReverseStateSemanticHashV1(preparedState);
  const terminalStateHash = warmachineReverseStateSemanticHashV1(
    transition.nextState || {},
  );
  const receiptCore = stableGraphValue({
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    predecessorStateHash,
    actionKey: action.actionKey,
    actionPatch,
    events: transition.events || [],
    terminalStateHash,
  });
  return {
    action,
    enumeration,
    preparedState,
    transition,
    predecessorStateHash,
    terminalStateHash,
    receiptHash: stableGraphHash(receiptCore),
  };
}

function stateAudit(state, spec, mutationEvidence) {
  const affected = (mutationEvidence.affectedPieceKeys || []).map((pieceKey) => {
    const piece = pieceByKey(state, pieceKey);
    return stableGraphValue({
      pieceKey,
      sideKey: piece.sideKey,
      destroyed: piece.destroyed === true,
      removedFromPlay: piece.removedFromPlay === true,
      offTable: piece.offTable === true,
      notDeployed: piece.notDeployed === true,
      canAmbush: piece.canAmbush === true,
      boxesRemaining: Number(piece.damage?.boxesRemaining || 0),
      maxBoxes: Number(piece.damage?.maxBoxes || 0),
      systems: piece.damage?.systems || {},
      resourcePoints: Number(piece.resourcePoints || 0),
      resourceMax: Number(piece.resourceMax || 0),
    });
  });
  const resources = (state.pieces || []).filter((piece) =>
    Number(piece.resourceMax || 0) > 0).map((piece) => ({
    pieceKey: piece.pieceKey,
    resourcePoints: Number(piece.resourcePoints || 0),
    resourceMax: Number(piece.resourceMax || 0),
  }));
  const nonzeroResources = resources.filter((row) => row.resourcePoints > 0);
  const resourcePassed = spec.value === "zero_available"
    ? nonzeroResources.length === 0
    : spec.value === "one_additional_purchase_available"
      ? nonzeroResources.length === 1 && nonzeroResources[0].pieceKey === TARGET_PIECES.warjack &&
        nonzeroResources[0].resourcePoints === 1
      : true;
  return stableGraphValue({
    variantKey: spec.key,
    dimensionKey: spec.dimensionKey,
    partitionValue: spec.value,
    affected,
    resources,
    mutationEvidence,
    resourcePassed,
    passed: resourcePassed && affected.every((row) => row.pieceKey),
  });
}

export function buildWarmachineSteamrollerTerminalMutableStateEvidenceV1({
  fixedRoundRuntimeRow = null,
  variants = VARIANT_SPECS.map((spec) => spec.key),
} = {}) {
  if (!fixedRoundRuntimeRow?.state ||
      fixedRoundRuntimeRow.publicRoot?.scenarioKey !== "trench_warfare") {
    throw new Error("mutable_terminal_trench_warfare_fixed_round_root_required");
  }
  if (fixedRoundRuntimeRow.publicRoot.hostReceiptHash !==
      warmachineHost.receipt.receiptHash) {
    throw new Error("mutable_terminal_host_receipt_mismatch");
  }
  const selected = new Set(variants.map(String));
  if (selected.size !== variants.length || [...selected].some((key) =>
    !VARIANT_SPECS.some((spec) => spec.key === key))) {
    throw new Error("mutable_terminal_variant_selection_invalid");
  }
  const roots = [];
  const runtime = [];
  for (const spec of VARIANT_SPECS.filter((candidate) => selected.has(candidate.key))) {
    let state = structuredClone(fixedRoundRuntimeRow.state);
    setAllResources(state, () => 0);
    const mutationEvidence = spec.mutate(state);
    state.stateKey = `trench-warfare-fixed-round-${spec.key}-predecessor:v1`;
    state = normalizeRulesV1State(state);
    const authoredStateAudit = stateAudit(state, spec, mutationEvidence);
    if (!authoredStateAudit.passed) {
      throw new Error(`mutable_terminal_state_audit_failed:${spec.key}:${stableGraphHash(authoredStateAudit)}`);
    }
    const placementAudit = auditRulesV1StaticPlacement(state);
    if (!placementAudit.ok) {
      throw new Error(`mutable_terminal_static_rejected:${spec.key}:${stableGraphHash(placementAudit)}`);
    }
    const primary = executeEndTurn(state, fixedRoundRuntimeRow.proposal?.actionPatch || {});
    const replay = executeEndTurn(state, fixedRoundRuntimeRow.proposal?.actionPatch || {});
    const preparedState = primary.preparedState;
    const audit = stateAudit(preparedState, spec, mutationEvidence);
    if (!audit.passed || primary.predecessorStateHash !== replay.predecessorStateHash) {
      throw new Error(`mutable_terminal_prepared_state_audit_failed:${spec.key}:${stableGraphHash({
        audit,
        primaryPredecessorStateHash: primary.predecessorStateHash,
        replayPredecessorStateHash: replay.predecessorStateHash,
      })}`);
    }
    const terminalEvent = (primary.transition.events || []).find((event) =>
      event.eventType === "terminal" &&
      event.reason === "scenario_round_limit_tiebreak");
    if (primary.transition.ok !== true || replay.transition.ok !== true ||
        terminalEvent?.winnerSideKey !== "player1" ||
        primary.terminalStateHash !== replay.terminalStateHash) {
      throw new Error(`mutable_terminal_execution_failed:${spec.key}:${stableGraphHash({
        primary: primary.transition,
        replay: replay.transition,
      })}`);
    }
    const coordinates = baselineCoordinates(fixedRoundRuntimeRow.cell);
    coordinates[spec.dimensionKey] = spec.value;
    const subcellKey = warmachineSteamrollerTerminalScenarioSubcellKeyV1(
      fixedRoundRuntimeRow.cell,
      coordinates,
    );
    const resourceBefore = Object.fromEntries((preparedState.pieces || [])
      .filter((piece) => Number(piece.resourceMax || 0) > 0)
      .map((piece) => [piece.pieceKey, Number(piece.resourcePoints || 0)]));
    const publicRoot = stableGraphValue({
      disposition: "strict_materialized",
      authority: "rules_v1_host",
      strictRulesConclusion: false,
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      scenarioKey: fixedRoundRuntimeRow.publicRoot.scenarioKey,
      cellKey: fixedRoundRuntimeRow.publicRoot.cellKey,
      subcellKey,
      terminalClassKey: fixedRoundRuntimeRow.publicRoot.terminalClassKey,
      tiebreakClassKey: fixedRoundRuntimeRow.publicRoot.tiebreakClassKey,
      sourceResolutionStatus: fixedRoundRuntimeRow.publicRoot.sourceResolutionStatus,
      representativeRoundNumber: fixedRoundRuntimeRow.publicRoot.representativeRoundNumber,
      endingSideKey: fixedRoundRuntimeRow.publicRoot.endingSideKey,
      winnerSideKey: fixedRoundRuntimeRow.publicRoot.winnerSideKey,
      actionKey: primary.action.actionKey,
      actionType: primary.action.actionType,
      receiptHash: primary.receiptHash,
      replayReceiptHash: replay.receiptHash,
      strictReplayCertified: true,
      predecessorStateHash: primary.predecessorStateHash,
      terminalStateHash: primary.terminalStateHash,
      partitionCoordinates: coordinates,
      executionRosterWitnessHash:
        fixedRoundRuntimeRow.publicRoot.executionRosterWitnessHash,
      executionRosterModelCount:
        fixedRoundRuntimeRow.publicRoot.executionRosterModelCount,
      variantKey: spec.key,
      mutableStateAudit: audit,
      scoreBefore: preparedState.scenario?.score || {},
      scoreAfter: primary.transition.nextState?.scenario?.score || {},
      resourceBefore,
      staticPlacementAuditHash: stableGraphHash(placementAudit),
      historicalReachabilityProven: false,
      reachabilityProven: false,
      trainingTruth: false,
    });
    const runtimeRow = {
      state: preparedState,
      primary,
      replay,
      placementAudit,
      cell: fixedRoundRuntimeRow.cell,
      proposal: fixedRoundRuntimeRow.proposal,
      publicRoot,
    };
    const terminalCell =
      buildWarmachineFixedRoundTerminalHypothesisCellFromEvidenceV1(runtimeRow);
    const reverse = generateWarmachineTerminalEventPredecessorsV1(
      primary.transition.nextState,
      terminalCell,
      {
        terminalActionTypes: ["end_turn"],
        maximumTerminalActions: 1,
        resourcePreimagePointsByPieceKey: resourceBefore,
      },
    );
    if (reverse.strictCandidateCount !== 1 || reverse.strictRejectedCount !== 0 ||
        reverse.unresolvedCount !== 0 ||
        reverse.candidates[0].predecessorStateHash !== primary.predecessorStateHash) {
      const failure = stableGraphValue({
        strictCandidateCount: reverse.strictCandidateCount,
        rejected: reverse.rejected,
        unresolved: reverse.unresolved,
        expected: primary.predecessorStateHash,
        observed: reverse.candidates[0]?.predecessorStateHash || "",
      });
      throw new Error(`mutable_terminal_reverse_failed:${spec.key}:${JSON.stringify(failure)}`);
    }
    roots.push(stableGraphValue({
      ...publicRoot,
      reverseOperatorKey: reverse.candidates[0].operatorKey,
      reversePredecessorStateHash: reverse.candidates[0].predecessorStateHash,
      exactTerminalInverseCertified: true,
    }));
    runtime.push({ ...runtimeRow, terminalCell, reverse });
  }
  const core = {
    schemaVersion: WARMACHINE_STEAMROLLER_TERMINAL_MUTABLE_STATE_EVIDENCE_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    strictMaterializedRootCount: roots.length,
    strictRejectedRootCount: 0,
    roots,
    coverage: stableGraphValue({
      requestedVariantCount: selected.size,
      materializedVariantCount: roots.length,
      lifecycleValues: roots.filter((root) =>
        root.mutableStateAudit.dimensionKey === "lifecycle").map((root) =>
        root.mutableStateAudit.partitionValue).sort(),
      damageValues: roots.filter((root) =>
        root.mutableStateAudit.dimensionKey === "damage").map((root) =>
        root.mutableStateAudit.partitionValue).sort(),
      resourceValues: roots.filter((root) =>
        root.mutableStateAudit.dimensionKey === "resource").map((root) =>
        root.mutableStateAudit.partitionValue).sort(),
      exactTerminalInverseCount: roots.filter((root) =>
        root.exactTerminalInverseCertified).length,
    }),
    claimBoundary: "These complete-roster authored round-seven states prove exact current lifecycle, remaining-health, warjack-system, warbeast-aspect and resource representatives through the rules-v1 Host, independent replay and exact terminal inverse. The Strygon aspect root proves current Body capacity and disabled behavior from card totals but does not invent or claim a historical six-branch damage path. None proves reachability from deployment, strategy value or training truth.",
    trainingTruth: false,
  };
  return {
    evidence: stableGraphValue({ ...core, evidenceHash: stableGraphHash(core) }),
    runtime,
  };
}

export const WARMACHINE_STEAMROLLER_TERMINAL_MUTABLE_STATE_VARIANT_KEYS_V1 =
  Object.freeze(VARIANT_SPECS.map((spec) => spec.key));
