import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  applyRulesV1Action,
  auditRulesV1StaticPlacement,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";
import {
  warmachineSteamrollerTerminalScenarioSubcellKeyV1,
} from "./steamroller-terminal-scenario-corpus-v1.mjs";
import { WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA } from
  "./terminal-hypothesis-v1.mjs";
import { buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1 } from
  "./steamroller-terminal-execution-roster-witness-v1.mjs";

export const WARMACHINE_STEAMROLLER_FIXED_ROUND_TERMINAL_ANCHOR_EVIDENCE_V1_SCHEMA =
  "warmachine_steamroller_fixed_round_terminal_anchor_evidence_v1";

const FIXED_SCENARIO_KEYS = Object.freeze([
  "trench_warfare",
  "wolves_at_our_heels",
  "pressure_point",
  "high_stakes",
  "fault_line",
  "payload",
]);

const RUNTIME_WINDOW_FIELDS = Object.freeze([
  "unitActivationWindow",
  "anyTimeActivationWindow",
  "initialAttackWindow",
  "combatPurchaseWindow",
  "activationForfeitWindow",
  "vengeanceWindow",
]);

const SCENARIO_MUTATION_EVENT_TYPES = new Set([
  "high_stakes_countdown_removed",
  "high_stakes_magical_blast_damage",
  "high_stakes_element_detonated",
  "wolves_objective_progressed",
  "wolves_third_token_goal_checked",
  "payload_objective_moved",
]);

function isLeader(piece = {}) {
  return piece.isWarcaster || piece.isWarlock ||
    /warcaster|warlock/i.test(`${piece.modelRole || ""} ${piece.modelType || ""}`);
}

function setTerminalResourcesToMaximum(piece = {}) {
  const current = Math.max(0, Number(piece.resourcePoints || 0));
  const maximum = Math.max(current, Number(
    piece.resourceMax ?? piece.focusMax ?? piece.furyMax ?? piece.arc ?? 0,
  ));
  piece.resourcePoints = maximum;
  if ("resource2" in piece) piece.resource2 = maximum;
  if ("focus" in piece) piece.focus = maximum;
  if ("focusPoints" in piece) piece.focusPoints = maximum;
  if ("fury" in piece) piece.fury = maximum;
  if ("furyPoints" in piece) piece.furyPoints = maximum;
}

function matchingCell(corpus = {}, scenarioKey = "") {
  return (corpus.cells || []).find((cell) =>
    cell.scenarioKey === scenarioKey &&
    cell.terminalClassKey === "fixed_round_limit_result" &&
    cell.attackerSideKey === "player1" &&
    cell.defenderSideKey === "player2" &&
    cell.endingSideKey === "player2" &&
    cell.winnerSideKey === "player1" &&
    cell.loserSideKey === "player2" &&
    cell.resultKind === "win" &&
    cell.tiebreakClassKey === "victory_point_advantage" &&
    cell.sourceResolutionStatus === "officially_confirmed" &&
    cell.roundClass?.representativeRoundNumber === 7) || null;
}

function partitionCoordinates(cell = {}) {
  const requested = {
    lifecycle: "both_rosters_complete",
    damage: "critical_models_undamaged",
    resource: "maximum_native_resource",
    leaderControl: "outside_or_not_required",
    baseTopology: "legal_separated",
    scenarioControl: "not_applicable",
    scenarioTerrainSetup: cell.scenarioKey === "fault_line"
      ? "not_applicable"
      : "all_flags_fallback_no_valid_terrain",
    trenchCacheLifecycle: "both_caches_active",
    wolvesProgressState: "all_progress_zero",
    wolvesTokenDecision: "no_owned_40mm_objective_secured",
    wolvesObjectiveMove: "move_not_triggered",
    highStakesCountdownState: "all_elements_at_five",
    highStakesFuseResolution: "random_target_without_50mm_secured",
    highStakesBlastClosure: "no_detonation",
    payloadLifecycle: "both_payloads_active",
    payloadMoveDecision: "no_owned_50mm_objective_secured",
    madeToHaulDecision: "not_triggered",
  };
  return Object.fromEntries(Object.keys(cell.partitions || {}).map((key) => {
    const value = requested[key];
    if (!cell.partitions[key].includes(value)) {
      throw new Error(`fixed_round_anchor_partition_value_missing:${key}:${value}`);
    }
    return [key, value];
  }));
}

function placeSideInSafeRows(state = {}, sideKey = "", yRows = []) {
  const pieces = (state.pieces || []).filter((piece) =>
    piece.sideKey === sideKey && !isLeader(piece))
    .sort((left, right) => String(left.pieceKey || "").localeCompare(
      String(right.pieceKey || ""),
    ));
  const columns = 19;
  if (pieces.length > columns * yRows.length) {
    throw new Error(`fixed_round_anchor_safe_rows_capacity_exceeded:${sideKey}`);
  }
  for (const [index, piece] of pieces.entries()) {
    piece.position = {
      xIn: 2 + (index % columns) * 2.4,
      yIn: yRows[Math.floor(index / columns)],
    };
  }
}

function prepareScenarioState(fixture = {}, proposal = {}, scenarioKey = "") {
  const state = structuredClone(proposal.predecessorState || {});
  state.pieces = structuredClone(fixture.stateTemplate?.pieces || []);
  for (const field of RUNTIME_WINDOW_FIELDS) delete state[field];
  state.strictMode = true;
  state.enforceStrictExecutor = true;
  state.activeSideKey = "player2";
  state.phaseKey = "activation";
  state.turnNumber = 7;
  state.outcome = null;
  state.terminal = null;
  state.metadata = {
    ...(state.metadata || {}),
    strictMode: true,
    enforceStrictExecutor: true,
    terminalCorpusWitness: true,
  };
  state.scenario.score = { player1: 1, player2: 0 };
  state.scenario.scoringHistory = [];
  for (const objective of state.scenario.objectives || []) {
    if (scenarioKey === "high_stakes") {
      objective.countdownTokens = 5;
      objective.countdownDetonated = false;
    }
    if (scenarioKey === "wolves_at_our_heels") {
      objective.progressTokens = 0;
    }
    if (scenarioKey === "payload") {
      objective.active = true;
      objective.removedFromPlay = false;
      objective.delivered = false;
    }
  }
  for (const terrain of state.terrain || []) {
    if (scenarioKey === "high_stakes") {
      terrain.countdownTokens = 5;
      terrain.countdownDetonated = false;
    }
  }
  for (const piece of state.pieces || []) {
    piece.activated = true;
    piece.activationKey = "";
    setTerminalResourcesToMaximum(piece);
  }
  placeSideInSafeRows(state, "player1", [2, 4.4, 6.8]);
  placeSideInSafeRows(state, "player2", [41.2, 43.6, 46]);
  const leaders = state.pieces.filter(isLeader);
  const player1Leader = leaders.find((piece) => piece.sideKey === "player1");
  const player2Leader = leaders.find((piece) => piece.sideKey === "player2");
  if (!player1Leader || !player2Leader) {
    throw new Error("fixed_round_anchor_leaders_missing");
  }
  player1Leader.position = { xIn: 22, yIn: 25.015748 };
  player2Leader.position = { xIn: 26, yIn: 25.015748 };
  state.stateKey = `${scenarioKey}-round-7-fixed-terminal-anchor-predecessor:v1`;
  return normalizeRulesV1State(state);
}

function executeAnchor(state = {}, actionPatch = {}) {
  const enumeration = enumerateRulesV1Actions(state, { actionFamilyKeys: ["timing"] });
  const action = (enumeration.actions || []).find((candidate) =>
    candidate.actionType === "end_turn");
  if (!action) {
    throw new Error(`fixed_round_anchor_end_turn_missing:${stableGraphHash({
      rejectedActions: enumeration.rejectedActions || [],
    })}`);
  }
  const inputAction = {
    actionKey: action.actionKey,
    ...(actionPatch || {}),
    __warmachineTrustedRulesV1Enumeration: enumeration,
  };
  const transition = applyRulesV1Action(state, inputAction);
  const predecessorStateHash = warmachineReverseStateSemanticHashV1(state);
  const terminalStateHash = warmachineReverseStateSemanticHashV1(transition.nextState || {});
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
    inputAction,
    transition,
    predecessorStateHash,
    terminalStateHash,
    receiptHash: stableGraphHash(receiptCore),
  };
}

function maximumNativeResourceAudit(state = {}) {
  const resourceLedger = (state.pieces || [])
    .filter((piece) => Number(piece.resourceMax || 0) > 0)
    .map((piece) => ({
      pieceKey: piece.pieceKey,
      resourcePoints: Number(piece.resourcePoints || 0),
      resourceMax: Number(piece.resourceMax || 0),
    }));
  return stableGraphValue({
    resourceLedger,
    passed: resourceLedger.length > 0 && resourceLedger.every((row) =>
      row.resourcePoints === row.resourceMax),
  });
}

export function buildWarmachineSteamrollerFixedRoundTerminalAnchorEvidenceV1({
  corpus = {},
  rosterWitness = null,
  scenarioProposals = [],
  scenarioKeys = FIXED_SCENARIO_KEYS,
} = {}) {
  if (corpus.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
    throw new Error("fixed_round_anchor_corpus_host_mismatch");
  }
  const runtimeWitness = rosterWitness ||
    buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1();
  if (runtimeWitness.witness?.complete !== true) {
    throw new Error("fixed_round_anchor_execution_roster_incomplete");
  }
  const roots = [];
  const runtime = [];
  const selectedScenarioKeys = [...new Set(scenarioKeys.map(String))].sort();
  if (!selectedScenarioKeys.length || selectedScenarioKeys.some((scenarioKey) =>
    !FIXED_SCENARIO_KEYS.includes(scenarioKey))) {
    throw new Error("fixed_round_anchor_scenario_selection_invalid");
  }
  for (const scenarioKey of selectedScenarioKeys) {
    const cell = matchingCell(corpus, scenarioKey);
    const proposal = scenarioProposals.find((row) => row.hostScenarioKey === scenarioKey);
    if (!cell || !proposal) {
      throw new Error(`fixed_round_anchor_scenario_missing:${scenarioKey}`);
    }
    const coordinates = partitionCoordinates(cell);
    const subcellKey = warmachineSteamrollerTerminalScenarioSubcellKeyV1(cell, coordinates);
    const state = prepareScenarioState(runtimeWitness.fixture, proposal, scenarioKey);
    const resourceAudit = maximumNativeResourceAudit(state);
    if (!resourceAudit.passed) {
      throw new Error(`fixed_round_anchor_maximum_native_resource_mismatch:${scenarioKey}:${stableGraphHash(resourceAudit)}`);
    }
    const placementAudit = auditRulesV1StaticPlacement(state);
    if (!placementAudit.ok) {
      throw new Error(`fixed_round_anchor_static_placement_rejected:${scenarioKey}:${stableGraphHash(placementAudit)}:${JSON.stringify(placementAudit.issues || placementAudit.rejected || placementAudit.rejections || [])}`);
    }
    const primary = executeAnchor(state, proposal.actionPatch || {});
    const replay = executeAnchor(state, proposal.actionPatch || {});
    const roundLimitEvent = (primary.transition.events || []).find((event) =>
      event.eventType === "scenario_round_limit");
    const terminalEvent = (primary.transition.events || []).find((event) =>
      event.eventType === "terminal" && event.reason === "scenario_round_limit_tiebreak");
    const replayTerminalEvent = (replay.transition.events || []).find((event) =>
      event.eventType === "terminal" && event.reason === "scenario_round_limit_tiebreak");
    if (primary.transition.ok !== true || replay.transition.ok !== true ||
        roundLimitEvent?.winnerSideKey !== "player1" ||
        terminalEvent?.winnerSideKey !== "player1" ||
        replayTerminalEvent?.winnerSideKey !== "player1" ||
        primary.terminalStateHash !== replay.terminalStateHash) {
      const failure = stableGraphValue({
        primaryOk: primary.transition.ok === true,
        primaryReason: primary.transition.reason || primary.transition.rejection?.reason || "",
        replayOk: replay.transition.ok === true,
        replayReason: replay.transition.reason || replay.transition.rejection?.reason || "",
        primaryEventTypes: (primary.transition.events || []).map((event) => event.eventType),
        primaryTerminalState: {
          activeSideKey: primary.transition.nextState?.activeSideKey || "",
          turnNumber: Number(primary.transition.nextState?.turnNumber || 0),
          score: primary.transition.nextState?.scenario?.score || {},
          outcome: primary.transition.nextState?.outcome || null,
        },
        roundLimitEvent: roundLimitEvent || null,
        terminalEvent: terminalEvent || null,
        replayTerminalEvent: replayTerminalEvent || null,
        terminalStateHashesMatch: primary.terminalStateHash === replay.terminalStateHash,
      });
      throw new Error(`fixed_round_anchor_strict_execution_failed:${scenarioKey}:${stableGraphHash({
        primary: primary.transition,
        replay: replay.transition,
      })}:${JSON.stringify(failure)}`);
    }
    roots.push(stableGraphValue({
      disposition: "strict_materialized",
      authority: "rules_v1_host",
      strictRulesConclusion: false,
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      scenarioKey,
      cellKey: cell.cellKey,
      subcellKey,
      terminalClassKey: cell.terminalClassKey,
      tiebreakClassKey: cell.tiebreakClassKey,
      sourceResolutionStatus: cell.sourceResolutionStatus,
      representativeRoundNumber: cell.roundClass.representativeRoundNumber,
      endingSideKey: cell.endingSideKey,
      winnerSideKey: cell.winnerSideKey,
      actionKey: primary.action.actionKey,
      actionType: primary.action.actionType,
      receiptHash: primary.receiptHash,
      replayReceiptHash: replay.receiptHash,
      strictReplayCertified: true,
      predecessorStateHash: primary.predecessorStateHash,
      terminalStateHash: primary.terminalStateHash,
      partitionCoordinates: coordinates,
      executionRosterWitnessHash: runtimeWitness.witness.witnessHash,
      executionRosterModelCount: runtimeWitness.witness.modelCount,
      scoreBefore: state.scenario?.score || {},
      scoreAfter: primary.transition.nextState?.scenario?.score || {},
      resourceBefore: Object.fromEntries((state.pieces || [])
        .filter((piece) => Number(piece.resourcePoints || 0) > 0)
        .map((piece) => [piece.pieceKey, Number(piece.resourcePoints)])),
      resourcePartitionAudit: resourceAudit,
      roundLimitEvent,
      terminalEvent,
      staticPlacementAuditHash: stableGraphHash(placementAudit),
      historicalReachabilityProven: false,
      reachabilityProven: false,
      trainingTruth: false,
    }));
    runtime.push({
      scenarioKey,
      state,
      placementAudit,
      primary,
      replay,
      cell,
      proposal,
      publicRoot: roots.at(-1),
    });
  }
  const core = {
    schemaVersion:
      WARMACHINE_STEAMROLLER_FIXED_ROUND_TERMINAL_ANCHOR_EVIDENCE_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    corpusHash: corpus.corpusHash,
    executionRosterWitness: runtimeWitness.witness,
    strictMaterializedRootCount: roots.length,
    strictRejectedRootCount: 0,
    roots,
    claimBoundary: "This evidence proves one exact complete-roster Defender-round-seven VP-tiebreak terminal subcell for each selected fixed-length Steamroller 2026 scenario. Every state passes Host static placement, end-turn enumeration, execution and independent replay. It does not prove the authored round-seven state is reachable from deployment, cover all fixed-round partitions, establish strategy value or provide training truth.",
    trainingTruth: false,
  };
  return {
    evidence: stableGraphValue({ ...core, evidenceHash: stableGraphHash(core) }),
    runtime,
  };
}

export function buildWarmachineFixedRoundTerminalHypothesisCellFromEvidenceV1(
  runtimeRow = {},
) {
  const { state, primary, cell, proposal, publicRoot } = runtimeRow;
  const successor = primary?.transition?.nextState;
  if (!state || !successor || !cell || !publicRoot ||
      publicRoot.disposition !== "strict_materialized") {
    throw new Error("fixed_round_materialized_runtime_root_required");
  }
  const scoreBefore = stableGraphValue(state.scenario?.score || {});
  const scoreAfter = stableGraphValue(successor.scenario?.score || {});
  const sideKeys = [...new Set([
    ...Object.keys(scoreBefore),
    ...Object.keys(scoreAfter),
  ])].sort();
  const scoreGainBySide = Object.fromEntries(sideKeys.map((sideKey) => [
    sideKey,
    Number(scoreAfter[sideKey] || 0) - Number(scoreBefore[sideKey] || 0),
  ]));
  const scenarioMutationEvents = (primary.transition.events || []).filter((event) =>
    SCENARIO_MUTATION_EVENT_TYPES.has(event.eventType));
  const core = {
    schemaVersion: WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA,
    cellKey: publicRoot.subcellKey,
    sourceCorpusCellKey: publicRoot.cellKey,
    goalType: "fixed_round_limit_result",
    scenarioKey: publicRoot.scenarioKey,
    roundNumber: Number(state.turnNumber),
    resultKind: cell.resultKind,
    winnerSideKey: cell.winnerSideKey,
    loserSideKey: cell.loserSideKey,
    endingSideKey: cell.endingSideKey,
    attackerSideKey: cell.attackerSideKey,
    defenderSideKey: cell.defenderSideKey,
    tiebreakClassKey: cell.tiebreakClassKey,
    sourceResolutionStatus: cell.sourceResolutionStatus,
    scoreBeforeTerminalCell: { scoreBySide: scoreBefore },
    terminalScoreGainCell: { scoreGainBySide: stableGraphValue(scoreGainBySide) },
    terminalActionPatch: stableGraphValue(proposal?.actionPatch || {}),
    scenarioSettlementInverseWitness: stableGraphValue({
      sourceReceiptHash: primary.receiptHash,
      scenarioMutationEvents,
      exactWithinMaterializedRoot: true,
      postSettlementActivationResetApplied: true,
    }),
    geometryRelationCell: stableGraphValue({
      relationKey: `fixed-round-anchor:${publicRoot.scenarioKey}`,
      exactCoordinatesKnown: true,
      exactCoordinates: Object.fromEntries((state.pieces || []).map((piece) => [
        piece.pieceKey,
        stableGraphValue(piece.position || {}),
      ])),
      relationChecks: [],
      materializationRequired: false,
    }),
    predecessorHistoryEvidence: {
      turnEndSettlementWitnesses: [],
    },
    provenance: {
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      sourceMaterializedSubcellKey: publicRoot.subcellKey,
      forwardOpeningRead: false,
      intermediateRouteRead: false,
    },
    trainingTruth: false,
  };
  return stableGraphValue({
    ...core,
    hypothesisBridgeHash: stableGraphHash(core),
  });
}
