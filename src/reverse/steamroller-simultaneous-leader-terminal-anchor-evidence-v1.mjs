import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  applyRulesV1Action,
  auditRulesV1StaticPlacement,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import {
  generateWarmachineTerminalEventPredecessorsV1,
  warmachineReverseStateSemanticHashV1,
} from
  "./terminal-event-predecessor-v1.mjs";
import { WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA } from
  "./terminal-hypothesis-v1.mjs";
import {
  warmachineSteamrollerTerminalScenarioSubcellKeyV1,
} from "./steamroller-terminal-scenario-corpus-v1.mjs";
import { buildWarmachineSteamrollerScoreTerminalAnchorProposalV1 } from
  "./steamroller-score-terminal-anchor-proposals-v1.mjs";
import { buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1 } from
  "./steamroller-terminal-execution-roster-witness-v1.mjs";

export const WARMACHINE_STEAMROLLER_SIMULTANEOUS_LEADER_TERMINAL_ANCHOR_EVIDENCE_V1_SCHEMA =
  "warmachine_steamroller_simultaneous_leader_terminal_anchor_evidence_v1";

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

function alive(piece = {}) {
  return piece.destroyed !== true && piece.removedFromPlay !== true &&
    Number(piece.damage?.boxesRemaining ?? piece.boxesRemaining ?? 1) > 0;
}

function matchingCorpusCell(corpus = {}, tiebreakClassKey = "victory_point_advantage") {
  return (corpus.cells || []).find((cell) =>
    cell.scenarioKey === "high_stakes" &&
    cell.terminalClassKey === "simultaneous_leader_tiebreak" &&
    cell.attackerSideKey === "player2" &&
    cell.defenderSideKey === "player1" &&
    cell.winnerSideKey === "player2" &&
    cell.loserSideKey === "player1" &&
    cell.endingSideKey === "player2" &&
    cell.tiebreakClassKey === tiebreakClassKey &&
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
    leaderControl: "outside_or_not_required",
    lineOfSight: "non_targeting_not_required",
    baseTopology: "legal_separated",
    scenarioTerrainSetup: "all_flags_fallback_no_valid_terrain",
    highStakesCountdownState: "one_nonzero_element_reduced",
    highStakesFuseResolution: "random_target_without_50mm_secured",
    highStakesBlastClosure: "exact_damage_roll_for_every_affected_model",
  };
  return Object.fromEntries(Object.keys(cell.partitions || {})
    .map((key) => [key, requested[key]]));
}

function placeCompleteUnitAroundObjective(state = {}, unitGroupId = "", objective = {}) {
  const members = (state.pieces || []).filter((piece) => piece.unitGroupId === unitGroupId)
    .sort((left, right) => String(left.pieceKey || "").localeCompare(
      String(right.pieceKey || ""),
    ));
  if (members.length !== 6) {
    throw new Error("simultaneous_leader_anchor_presence_unit_incomplete");
  }
  const radiusIn = 2.5;
  for (const [index, member] of members.entries()) {
    const radians = (Math.PI * 2 * index) / members.length;
    member.position = {
      xIn: Number(objective.xIn) + Math.cos(radians) * radiusIn,
      yIn: Number(objective.yIn) + Math.sin(radians) * radiusIn,
    };
  }
  return members.map((member) => member.pieceKey);
}

function clearSideFromScenarioPresence(state = {}, sideKey = "") {
  const pieces = (state.pieces || []).filter((piece) => piece.sideKey === sideKey)
    .sort((left, right) => String(left.pieceKey || "").localeCompare(
      String(right.pieceKey || ""),
    ));
  for (const [index, piece] of pieces.entries()) {
    piece.position = {
      xIn: 2 + (index % 12) * 2.2,
      yIn: 2 + Math.floor(index / 12) * 2.2,
    };
  }
  return pieces.map((piece) => piece.pieceKey);
}

function authorHighStakesSimultaneousLeaderState(
  fixture = {},
  scenarioProposal = {},
  tiebreakClassKey = "victory_point_advantage",
) {
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
  const scenarioPresenceTiebreak = tiebreakClassKey ===
    "victory_points_tied_scenario_presence_advantage";
  state.scenario.score = scenarioPresenceTiebreak
    ? { player1: 4, player2: 2 }
    : { player1: 2, player2: 5 };
  state.scenario.scoringHistory = [];
  for (const objective of state.scenario.objectives || []) {
    if (Number(objective.baseSizeMm || 0) === 50) {
      objective.countdownTokens = objective.objectiveKey === "center-50" ? 1 : 5;
      objective.countdownDetonated = false;
    }
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
  const scenarioTerrainClearancePositions = new Map([
    ["player1_mechanithrall_swarm_3_3", { xIn: 18, yIn: 32 }],
    ["player1_mechanithrall_swarm_6_4", { xIn: 20, yIn: 32 }],
  ]);
  for (const piece of state.pieces || []) {
    const position = scenarioTerrainClearancePositions.get(piece.pieceKey);
    if (position) piece.position = position;
  }
  const friendlyLeader = state.pieces.find((piece) =>
    piece.sideKey === "player2" && isLeader(piece));
  const enemyLeader = state.pieces.find((piece) =>
    piece.sideKey === "player1" && isLeader(piece));
  const blastSource = (state.scenario.objectives || []).find((objective) =>
    objective.objectiveKey === "center-50");
  const presenceObjective = (state.scenario.objectives || []).find((objective) =>
    objective.objectiveKey === "right-40");
  if (!friendlyLeader || !enemyLeader || !blastSource || !presenceObjective) {
    throw new Error("simultaneous_leader_anchor_required_piece_identity_missing");
  }
  friendlyLeader.position = {
    xIn: Number(blastSource.xIn) - 2,
    yIn: Number(blastSource.yIn),
  };
  enemyLeader.position = {
    xIn: Number(blastSource.xIn) + 2,
    yIn: Number(blastSource.yIn),
  };
  restoreAtOneBox(friendlyLeader);
  restoreAtOneBox(enemyLeader);
  const scenarioPresencePieceKeys = scenarioPresenceTiebreak
    ? [
      ...clearSideFromScenarioPresence(state, "player1"),
      ...placeCompleteUnitAroundObjective(
        state,
        "player2_the_merciless_16",
        presenceObjective,
      ),
    ]
    : [];
  enemyLeader.position = {
    xIn: Number(blastSource.xIn) + 2,
    yIn: Number(blastSource.yIn),
  };
  state.stateKey = scenarioPresenceTiebreak
    ? "high-stakes-round-3-simultaneous-leader-presence-anchor-predecessor:v1"
    : "high-stakes-round-3-simultaneous-leader-anchor-predecessor:v1";
  return {
    state: normalizeRulesV1State(state),
    friendlyLeaderPieceKey: friendlyLeader.pieceKey,
    enemyLeaderPieceKey: enemyLeader.pieceKey,
    blastSourceKey: blastSource.objectiveKey,
    scenarioPresencePieceKeys,
    geometry: {
      blastSourcePosition: { xIn: blastSource.xIn, yIn: blastSource.yIn },
      friendlyLeaderPosition: friendlyLeader.position,
      enemyLeaderPosition: enemyLeader.position,
    },
  };
}

function executeAnchor(authored = {}) {
  const enumeration = enumerateRulesV1Actions(authored.state, {
    actionFamilyKeys: ["timing"],
  });
  const action = (enumeration.actions || []).find((candidate) =>
    candidate.actionType === "end_turn");
  if (!action) {
    throw new Error(`simultaneous_leader_anchor_end_turn_action_missing:${stableGraphHash({
      rejectedActions: enumeration.rejectedActions || [],
    })}:${JSON.stringify({
      legal: (enumeration.actions || []).map((candidate) => ({
        actionType: candidate.actionType,
        actorPieceKey: candidate.actorPieceKey,
        targetPieceKey: candidate.targetPieceKey,
        profileKey: candidate.metadata?.attackProfile?.profileKey || "",
      })),
      rejected: (enumeration.rejectedActions || []).map((candidate) => ({
          actionType: candidate.actionType,
          targetPieceKey: candidate.targetPieceKey,
          reason: candidate.rejection?.reason || "",
          issues: candidate.rejection?.issues || [],
        })),
    })}`);
  }
  const inputAction = {
    actionKey: action.actionKey,
    steamroller2026Decision: {
      highStakes: {
        fuseRoll: 3,
        fuseTargetKey: authored.blastSourceKey,
        blastDamageDiceByPieceKey: {
          [authored.friendlyLeaderPieceKey]: [6, 6],
          [authored.enemyLeaderPieceKey]: [6, 6],
        },
      },
    },
  };
  const transition = applyRulesV1Action(authored.state, inputAction);
  const predecessorStateHash = warmachineReverseStateSemanticHashV1(authored.state);
  const terminalStateHash = warmachineReverseStateSemanticHashV1(transition.nextState || {});
  const receiptCore = stableGraphValue({
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    predecessorStateHash,
    actionKey: action.actionKey,
    inputAction,
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

function buildReverseCell({
  authored = {},
  cell = {},
  subcellKey = "",
  primary = {},
} = {}) {
  const scoreBefore = authored.state.scenario?.score || {};
  const scoreAfter = primary.transition.nextState?.scenario?.score || {};
  const sideKeys = [...new Set([...Object.keys(scoreBefore), ...Object.keys(scoreAfter)])]
    .sort();
  const scoreGainBySide = Object.fromEntries(sideKeys.map((sideKey) => [
    sideKey,
    Number(scoreAfter[sideKey] || 0) - Number(scoreBefore[sideKey] || 0),
  ]));
  const scenarioMutationEvents = (primary.transition.events || []).filter((event) => [
    "high_stakes_countdown_removed",
    "high_stakes_magical_blast_damage",
    "high_stakes_element_detonated",
  ].includes(event.eventType));
  return stableGraphValue({
    schemaVersion: WARMACHINE_TERMINAL_HYPOTHESIS_CELL_V1_SCHEMA,
    cellKey: subcellKey,
    sourceCorpusCellKey: cell.cellKey,
    goalType: "simultaneous_leader_tiebreak",
    scenarioKey: cell.scenarioKey,
    roundNumber: Number(authored.state.turnNumber),
    winnerSideKey: cell.winnerSideKey,
    loserSideKey: cell.loserSideKey,
    endingSideKey: cell.endingSideKey,
    attackerSideKey: cell.attackerSideKey,
    defenderSideKey: cell.defenderSideKey,
    scoreBeforeTerminalCell: { scoreBySide: scoreBefore },
    terminalScoreGainCell: { scoreGainBySide },
    terminalActionPatch: {
      steamroller2026Decision: primary.inputAction.steamroller2026Decision,
    },
    scenarioSettlementInverseWitness: {
      sourceReceiptHash: primary.receiptHash,
      scenarioMutationEvents,
      exactWithinMaterializedRoot: true,
      postSettlementActivationResetApplied: true,
    },
    provenance: {
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      sourceMaterializedSubcellKey: subcellKey,
      forwardOpeningRead: false,
      intermediateRouteRead: false,
    },
    trainingTruth: false,
  });
}

export function buildWarmachineSteamrollerSimultaneousLeaderTerminalAnchorEvidenceV1({
  corpus = {},
  rosterWitness = null,
  scenarioProposal = null,
  tiebreakClassKey = "victory_point_advantage",
} = {}) {
  if (corpus.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
    throw new Error("simultaneous_leader_anchor_corpus_host_mismatch");
  }
  const runtimeWitness = rosterWitness ||
    buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1();
  if (runtimeWitness.witness?.complete !== true) {
    throw new Error("simultaneous_leader_anchor_execution_roster_incomplete");
  }
  const cell = matchingCorpusCell(corpus, tiebreakClassKey);
  if (!cell) throw new Error("simultaneous_leader_anchor_corpus_cell_missing");
  const runtimeScenarioProposal = scenarioProposal ||
    buildWarmachineSteamrollerScoreTerminalAnchorProposalV1("high_stakes");
  if (runtimeScenarioProposal.hostScenarioKey !== "high_stakes") {
    throw new Error("simultaneous_leader_anchor_high_stakes_scenario_missing");
  }
  const coordinates = partitionCoordinates(cell);
  const subcellKey = warmachineSteamrollerTerminalScenarioSubcellKeyV1(cell, coordinates);
  const authored = authorHighStakesSimultaneousLeaderState(
    runtimeWitness.fixture,
    runtimeScenarioProposal,
    tiebreakClassKey,
  );
  const placementAudit = auditRulesV1StaticPlacement(authored.state);
  if (!placementAudit.ok) {
    throw new Error(`simultaneous_leader_anchor_static_placement_rejected:${stableGraphHash(placementAudit)}:${JSON.stringify(placementAudit.issues || placementAudit.rejected || placementAudit.rejections || [])}`);
  }
  const primary = executeAnchor(authored);
  const replay = executeAnchor(authored);
  const primaryTerminal = (primary.transition.events || []).find((event) =>
    event.eventType === "terminal" &&
    event.reason === "steamroller_2026_simultaneous_leaders_tiebreak_resolved" &&
    event.winnerSideKey === "player2");
  const replayTerminal = (replay.transition.events || []).find((event) =>
    event.eventType === "terminal" &&
    event.reason === "steamroller_2026_simultaneous_leaders_tiebreak_resolved" &&
    event.winnerSideKey === "player2");
  const simultaneous = (primary.transition.events || []).find((event) =>
    event.eventType === "simultaneous_leader_destruction");
  const leadersAfter = (primary.transition.nextState?.pieces || []).filter(isLeader);
  if (primary.transition.ok !== true || replay.transition.ok !== true ||
      !primaryTerminal || !replayTerminal || !simultaneous ||
      primary.terminalStateHash !== replay.terminalStateHash ||
      leadersAfter.some(alive)) {
    const failureDetail = {
      primary: {
        ok: primary.transition.ok,
        reason: primary.transition.reason,
        terminal: primaryTerminal || null,
        simultaneous: simultaneous || null,
        events: (primary.transition.events || []).map((event) => ({
          eventType: event.eventType,
          targetKey: event.targetKey || "",
          targetPieceKey: event.targetPieceKey || "",
          winnerSideKey: event.winnerSideKey || "",
          reason: event.reason || "",
        })),
      },
      replay: {
        ok: replay.transition.ok,
        reason: replay.transition.reason,
        terminal: replayTerminal || null,
      },
      leadersAfter: leadersAfter.map((piece) => ({
        pieceKey: piece.pieceKey,
        alive: alive(piece),
      })),
    };
    throw new Error(`simultaneous_leader_anchor_strict_execution_failed:${stableGraphHash(failureDetail)}:${JSON.stringify(failureDetail)}`);
  }
  const reverseCell = buildReverseCell({ authored, cell, subcellKey, primary });
  const reverse = generateWarmachineTerminalEventPredecessorsV1(
    primary.transition.nextState,
    reverseCell,
  );
  if (reverse.strictCandidateCount !== 1 || reverse.strictRejectedCount !== 0 ||
      reverse.unresolvedCount !== 0 ||
      reverse.candidates[0].predecessorStateHash !== primary.predecessorStateHash) {
    const reverseFailure = {
      strictCandidateCount: reverse.strictCandidateCount,
      strictRejectedCount: reverse.strictRejectedCount,
      unresolved: reverse.unresolved,
      rejected: reverse.rejected,
      expectedPredecessorStateHash: primary.predecessorStateHash,
      observedPredecessorStateHash: reverse.candidates[0]?.predecessorStateHash || "",
    };
    throw new Error(`simultaneous_leader_anchor_reverse_failed:${stableGraphHash(
      reverseFailure,
    )}:${JSON.stringify(reverseFailure)}`);
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
    terminalStepReverseCertified: true,
    strictPredecessorCount: reverse.strictCandidateCount,
    reversePredecessorStateHash: reverse.candidates[0].predecessorStateHash,
    reverseMatchedProbability: reverse.candidates[0].matchedProbability,
    predecessorStateHash: primary.predecessorStateHash,
    terminalStateHash: primary.terminalStateHash,
    partitionCoordinates: coordinates,
    executionRosterWitnessHash: runtimeWitness.witness.witnessHash,
    executionRosterModelCount: runtimeWitness.witness.modelCount,
    friendlyLeaderPieceKey: authored.friendlyLeaderPieceKey,
    enemyLeaderPieceKey: authored.enemyLeaderPieceKey,
    blastSourceKey: authored.blastSourceKey,
    geometry: authored.geometry,
    scoreBefore: authored.state.scenario?.score || {},
    scoreAfter: primary.transition.nextState?.scenario?.score || {},
    tiebreakClassKey: cell.tiebreakClassKey,
    scenarioPresencePieceKeys: authored.scenarioPresencePieceKeys,
    simultaneousEvent: simultaneous,
    staticPlacementAuditHash: stableGraphHash(placementAudit),
    historicalReachabilityProven: false,
    reachabilityProven: false,
    trainingTruth: false,
  });
  const core = {
    schemaVersion:
      WARMACHINE_STEAMROLLER_SIMULTANEOUS_LEADER_TERMINAL_ANCHOR_EVIDENCE_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    corpusHash: corpus.corpusHash,
    executionRosterWitness: runtimeWitness.witness,
    strictMaterializedRootCount: 1,
    strictRejectedRootCount: 0,
    roots: [root],
    claimBoundary: "This evidence proves one exact High Stakes round-three simultaneous-Leader-removal subcell from complete legal 100-point rosters. A Host-owned scenario fuse detonates an official 50mm objective, applies explicit POW 14 magical blast rolls to both Leaders, resolves both lifecycles, battlegroup side effects, final scoring and the selected VP/Scenario Presence tiebreak class, then an independent replay reaches the same semantic state. One exact terminal-step predecessor is restored and strict-replayed; the authored later-round state is not yet proven reachable from deployment and is not training truth.",
    trainingTruth: false,
  };
  return {
    evidence: stableGraphValue({ ...core, evidenceHash: stableGraphHash(core) }),
    runtime: {
      authoredState: authored.state,
      primary,
      replay,
      reverseCell,
      reverse,
      placementAudit,
    },
  };
}
