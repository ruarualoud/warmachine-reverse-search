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
import { warmachineSteamrollerTerminalScenarioSubcellKeyV1 } from
  "./steamroller-terminal-scenario-corpus-v1.mjs";
import { buildWarmachineSteamrollerScoreTerminalAnchorProposalV1 } from
  "./steamroller-score-terminal-anchor-proposals-v1.mjs";
import { buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1 } from
  "./steamroller-terminal-execution-roster-witness-v1.mjs";

export const WARMACHINE_STEAMROLLER_STRYGON_SPRAY_SIMULTANEOUS_LEADER_TERMINAL_EVIDENCE_V1_SCHEMA =
  "warmachine_steamroller_strygon_spray_simultaneous_leader_terminal_evidence_v1";

const STRYGON_PIECE_KEY = "player2_strygon_8_1";
const NYMARA_PIECE_KEY = "player2_nymara_the_shadowblade_1_1";
const SEPSIRA_PIECE_KEY = "player1_master_necrosurgeon_sepsira_1_1";
const TOXIC_SPITTLE_PROFILE_KEY = "e1b2dda1-a26e-482a-94f0-e335a30dfaa3";
const CRITICAL_SLOW_ATOM_KEY = "critical_slow_living_on_critical_hit_status";
const RUNTIME_WINDOW_FIELDS = Object.freeze([
  "unitActivationWindow",
  "anyTimeActivationWindow",
  "initialAttackWindow",
  "combatPurchaseWindow",
  "activationForfeitWindow",
  "vengeanceWindow",
]);

function isLeader(piece = {}) {
  return piece.isWarcaster || piece.isWarlock ||
    /warcaster|warlock/i.test(`${piece.modelRole || ""} ${piece.modelType || ""}`);
}

function alive(piece = {}) {
  return piece.destroyed !== true && piece.removedFromPlay !== true &&
    Number(piece.damage?.boxesRemaining ?? piece.boxesRemaining ?? 1) > 0;
}

function zeroResources(piece = {}) {
  piece.resourcePoints = 0;
  for (const field of ["resource2", "focus", "focusPoints", "fury", "furyPoints"]) {
    if (field in piece) piece[field] = 0;
  }
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

function matchingCorpusCell(corpus = {}) {
  return (corpus.cells || []).find((cell) =>
    cell.scenarioKey === "high_stakes" &&
    cell.terminalClassKey === "simultaneous_leader_tiebreak" &&
    cell.attackerSideKey === "player2" &&
    cell.defenderSideKey === "player1" &&
    cell.winnerSideKey === "player2" &&
    cell.loserSideKey === "player1" &&
    cell.endingSideKey === "player2" &&
    cell.tiebreakClassKey === "victory_point_advantage" &&
    cell.causalActionFamily === "single_simultaneous_resolution_window" &&
    cell.roundClass?.exactRoundNumber === true &&
    cell.roundClass?.representativeRoundNumber === 3) || null;
}

function partitionCoordinates(cell = {}) {
  const requested = {
    lifecycle: "both_rosters_complete",
    damage: "leader_at_terminal_threshold",
    resource: "zero_available",
    actionRange: "strictly_inside",
    leaderControl: "strictly_inside",
    lineOfSight: "clear",
    baseTopology: "legal_separated",
    scenarioTerrainSetup: "all_flags_fallback_no_valid_terrain",
    highStakesCountdownState: "all_elements_at_five",
    highStakesFuseResolution: "random_target_without_50mm_secured",
    highStakesBlastClosure: "no_detonation",
  };
  return Object.fromEntries(Object.keys(cell.partitions || {})
    .map((key) => [key, requested[key]]));
}

function authorState(fixture = {}, scenarioProposal = {}) {
  const state = structuredClone(scenarioProposal.predecessorState || {});
  state.pieces = structuredClone(fixture.stateTemplate?.pieces || []);
  for (const field of RUNTIME_WINDOW_FIELDS) delete state[field];
  state.strictMode = true;
  state.enforceStrictExecutor = true;
  state.activeSideKey = "player2";
  state.phaseKey = "activation";
  state.turnNumber = 3;
  state.outcome = null;
  state.terminal = null;
  state.metadata = {
    ...(state.metadata || {}),
    strictMode: true,
    enforceStrictExecutor: true,
    terminalCorpusWitness: true,
  };
  state.scenario.score = { player1: 2, player2: 5 };
  state.scenario.scoringHistory = [];
  for (const objective of state.scenario.objectives || []) {
    objective.countdownTokens = 5;
    objective.countdownDetonated = false;
  }
  for (const terrain of state.terrain || []) {
    terrain.countdownTokens = 5;
    terrain.countdownDetonated = false;
  }
  for (const piece of state.pieces || []) {
    piece.activated = true;
    piece.activationKey = "";
    zeroResources(piece);
  }
  const clearancePositions = new Map([
    ["player1_mechanithrall_swarm_3_3", { xIn: 18, yIn: 32 }],
    ["player1_mechanithrall_swarm_6_4", { xIn: 20, yIn: 32 }],
  ]);
  for (const piece of state.pieces || []) {
    const position = clearancePositions.get(piece.pieceKey);
    if (position) piece.position = position;
  }
  const actor = state.pieces.find((piece) => piece.pieceKey === STRYGON_PIECE_KEY);
  const friendlyLeader = state.pieces.find((piece) => piece.pieceKey === NYMARA_PIECE_KEY);
  const enemyLeader = state.pieces.find((piece) => piece.pieceKey === SEPSIRA_PIECE_KEY);
  if (!actor || !friendlyLeader || !enemyLeader) {
    throw new Error("strygon_spray_terminal_required_piece_identity_missing");
  }
  actor.activated = false;
  actor.position = { xIn: 18.2, yIn: 25.015748 };
  friendlyLeader.position = { xIn: 22, yIn: 25.015748 };
  enemyLeader.position = { xIn: 26, yIn: 25.015748 };
  restoreAtOneBox(friendlyLeader);
  restoreAtOneBox(enemyLeader);
  state.stateKey = "high-stakes-round-3-strygon-spray-simultaneous-leader-predecessor:v1";
  return {
    state: normalizeRulesV1State(state),
    actorPieceKey: actor.pieceKey,
    friendlyLeaderPieceKey: friendlyLeader.pieceKey,
    enemyLeaderPieceKey: enemyLeader.pieceKey,
    geometry: {
      actorPosition: actor.position,
      friendlyLeaderPosition: friendlyLeader.position,
      enemyLeaderPosition: enemyLeader.position,
    },
  };
}

function sealedResourceBoostDecline(ruleState = {}, actorPieceKey = "", targetPieceKey = "", rollKind = "") {
  const window = ruleState.preRollTokenBoostWindow || null;
  if (window?.active === false || window?.paymentKind !== "resource" ||
      window?.actorPieceKey !== actorPieceKey ||
      window?.targetPieceKey !== targetPieceKey || window?.phase !== rollKind) {
    throw new Error(`strygon_spray_${rollKind}_boost_decline_window_mismatch:${stableGraphHash(window || {})}`);
  }
  return {
    actionKey: `${actorPieceKey}:pre-roll-resource-boost:${window.rollIndex || 1}:decline:v1`,
  };
}

function executeAnchor(authored = {}) {
  const enumeration = enumerateRulesV1Actions(authored.state, {
    actorPieceKeys: [authored.actorPieceKey],
    targetPieceKeys: [authored.enemyLeaderPieceKey],
    actionFamilyKeys: ["attack_or_effect"],
    includeActorlessActions: false,
    includeUntargetedActions: false,
  });
  const action = (enumeration.actions || []).find((candidate) =>
    candidate.actorPieceKey === authored.actorPieceKey &&
    candidate.targetPieceKey === authored.enemyLeaderPieceKey &&
    candidate.actionType === "ranged_attack" &&
    candidate.metadata?.attackProfile?.profileKey === TOXIC_SPITTLE_PROFILE_KEY);
  if (!action) {
    throw new Error(`strygon_spray_terminal_action_missing:${stableGraphHash({
      rejectedActions: enumeration.rejectedActions || [],
    })}`);
  }
  const secondaryKeys = (action.metadata?.spraySecondaryTargets || [])
    .map((target) => target.pieceKey);
  if (!secondaryKeys.includes(authored.friendlyLeaderPieceKey)) {
    throw new Error("strygon_spray_terminal_friendly_leader_not_secondary_target");
  }
  const criticalSlowEffect = (action.metadata?.ruleAtomEffects || []).find((effect) =>
    effect.atomKey === CRITICAL_SLOW_ATOM_KEY && effect.active !== false);
  if (!criticalSlowEffect ||
      !action.metadata?.attackProfile?.damageTypes?.includes("corrosion")) {
    throw new Error("strygon_spray_terminal_current_data_semantics_missing");
  }
  const inputAction = {
    actionKey: action.actionKey,
    steamroller2026Decision: { highStakes: { fuseRoll: 1 } },
    strictRollOutcome: {
      attackDice: [6, 6],
      damageDice: [6, 6],
      sprayAttackDamageByTarget: {
        [authored.friendlyLeaderPieceKey]: {
          attackDice: [6, 6],
          damageDice: [6, 6],
        },
      },
    },
  };
  const transitions = [];
  let transition = applyRulesV1Action(enumeration.state, {
    ...inputAction,
    __warmachineTrustedRulesV1Enumeration: enumeration,
  });
  transitions.push(transition);
  for (const rollKind of ["attack_roll", "damage_roll"]) {
    if (transition.ok !== true ||
        transition.reason !== "pre_roll_resource_boost_decision_required") {
      throw new Error(`strygon_spray_terminal_${rollKind}_boost_window_missing:${transition.reason || "unknown"}`);
    }
    const decline = sealedResourceBoostDecline(
      transition.nextState,
      authored.actorPieceKey,
      authored.friendlyLeaderPieceKey,
      rollKind,
    );
    transition = applyRulesV1Action(transition.nextState, {
      actionKey: decline.actionKey,
    });
    transitions.push(transition);
  }
  const events = transitions.flatMap((entry) => entry.events || []);
  const predecessorStateHash = warmachineReverseStateSemanticHashV1(authored.state);
  const terminalStateHash = warmachineReverseStateSemanticHashV1(transition.nextState || {});
  const receiptCore = stableGraphValue({
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    predecessorStateHash,
    inputAction,
    actionKeys: transitions.map((entry) => entry.action?.actionKey || ""),
    events,
    terminalStateHash,
  });
  return {
    action,
    enumeration,
    inputAction,
    transitions,
    transition,
    events,
    predecessorStateHash,
    terminalStateHash,
    receiptHash: stableGraphHash(receiptCore),
  };
}

export function buildWarmachineSteamrollerStrygonSpraySimultaneousLeaderTerminalEvidenceV1({
  corpus = {},
  rosterWitness = null,
  scenarioProposal = null,
} = {}) {
  if (corpus.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
    throw new Error("strygon_spray_terminal_corpus_host_mismatch");
  }
  const runtimeWitness = rosterWitness ||
    buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1();
  if (runtimeWitness.witness?.complete !== true) {
    throw new Error("strygon_spray_terminal_execution_roster_incomplete");
  }
  const cell = matchingCorpusCell(corpus);
  if (!cell) throw new Error("strygon_spray_terminal_corpus_cell_missing");
  const runtimeScenarioProposal = scenarioProposal ||
    buildWarmachineSteamrollerScoreTerminalAnchorProposalV1("high_stakes");
  if (runtimeScenarioProposal.hostScenarioKey !== "high_stakes") {
    throw new Error("strygon_spray_terminal_high_stakes_scenario_missing");
  }
  const coordinates = partitionCoordinates(cell);
  const subcellKey = warmachineSteamrollerTerminalScenarioSubcellKeyV1(cell, coordinates);
  const authored = authorState(runtimeWitness.fixture, runtimeScenarioProposal);
  const placementAudit = auditRulesV1StaticPlacement(authored.state);
  if (!placementAudit.ok) {
    throw new Error(`strygon_spray_terminal_static_placement_rejected:${stableGraphHash(placementAudit)}`);
  }
  const primary = executeAnchor(authored);
  const replay = executeAnchor(authored);
  const primaryTerminal = primary.events.find((event) =>
    event.eventType === "terminal" &&
    event.reason === "steamroller_2026_simultaneous_leaders_tiebreak_resolved" &&
    event.winnerSideKey === "player2");
  const replayTerminal = replay.events.find((event) =>
    event.eventType === "terminal" &&
    event.reason === "steamroller_2026_simultaneous_leaders_tiebreak_resolved" &&
    event.winnerSideKey === "player2");
  const simultaneous = primary.events.find((event) =>
    event.eventType === "simultaneous_leader_destruction");
  const leadersAfter = (primary.transition.nextState?.pieces || []).filter(isLeader);
  const criticalSlowTargets = primary.events.filter((event) =>
    event.eventType === "critical_slow_applied" &&
    event.atomKey === CRITICAL_SLOW_ATOM_KEY)
    .map((event) => event.targetPieceKey).sort();
  if (primary.transition.ok !== true || replay.transition.ok !== true ||
      !primaryTerminal || !replayTerminal || !simultaneous ||
      primary.terminalStateHash !== replay.terminalStateHash ||
      leadersAfter.some(alive) ||
      !criticalSlowTargets.includes(authored.friendlyLeaderPieceKey) ||
      !criticalSlowTargets.includes(authored.enemyLeaderPieceKey) ||
      primary.events.some((event) => /continuous_corrosion/i.test(event.eventType || ""))) {
    throw new Error(`strygon_spray_terminal_strict_execution_failed:${stableGraphHash({
      primaryOk: primary.transition.ok,
      primaryReason: primary.transition.reason,
      replayOk: replay.transition.ok,
      replayReason: replay.transition.reason,
      primaryTerminal,
      replayTerminal,
      simultaneous,
      leadersAfter: leadersAfter.map((piece) => ({ pieceKey: piece.pieceKey, alive: alive(piece) })),
      criticalSlowTargets,
      eventTypes: primary.events.map((event) => event.eventType),
    })}`);
  }
  const root = stableGraphValue({
    disposition: "strict_materialized",
    authority: "rules_v1_host",
    strictRulesConclusion: false,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    scenarioKey: cell.scenarioKey,
    cellKey: cell.cellKey,
    subcellKey,
    terminalClassKey: cell.terminalClassKey,
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
    actorPieceKey: authored.actorPieceKey,
    friendlyLeaderPieceKey: authored.friendlyLeaderPieceKey,
    enemyLeaderPieceKey: authored.enemyLeaderPieceKey,
    attackProfileKey: TOXIC_SPITTLE_PROFILE_KEY,
    criticalSlowAtomKey: CRITICAL_SLOW_ATOM_KEY,
    geometry: authored.geometry,
    scoreBefore: authored.state.scenario?.score || {},
    scoreAfter: primary.transition.nextState?.scenario?.score || {},
    tiebreakClassKey: cell.tiebreakClassKey,
    simultaneousEvent: simultaneous,
    staticPlacementAuditHash: stableGraphHash(placementAudit),
    historicalReachabilityProven: false,
    reachabilityProven: false,
    trainingTruth: false,
  });
  const core = {
    schemaVersion:
      WARMACHINE_STEAMROLLER_STRYGON_SPRAY_SIMULTANEOUS_LEADER_TERMINAL_EVIDENCE_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    corpusHash: corpus.corpusHash,
    executionRosterWitness: runtimeWitness.witness,
    strictMaterializedRootCount: 1,
    strictRejectedRootCount: 0,
    roots: [root],
    claimBoundary: "This evidence proves one exact High Stakes round-three complete-roster subcell in which current-data Toxic Spittle legally targets Sepsira, independently includes Nymara as a spray secondary, explicitly declines both secondary resource boosts, removes both one-box Leaders in one simultaneous attack batch, preserves the sealed High Stakes final-scoring decision, and resolves the VP tiebreak. It does not prove deployment reachability or strategy quality and is not training truth.",
    trainingTruth: false,
  };
  return {
    evidence: stableGraphValue({ ...core, evidenceHash: stableGraphHash(core) }),
    runtime: { authoredState: authored.state, primary, replay, placementAudit },
  };
}
