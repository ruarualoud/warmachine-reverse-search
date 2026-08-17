import {
  buildWarmachineBenchmarkMaximumStrictRollOutcomeV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  applyRulesV1Action,
  auditRulesV1StaticPlacement,
  closestPointDistanceIn,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";
import { warmachineSteamrollerTerminalScenarioSubcellKeyV1 } from
  "./steamroller-terminal-scenario-corpus-v1.mjs";

export const WARMACHINE_STEAMROLLER_TERMINAL_LOS_RELATION_EVIDENCE_V1_SCHEMA =
  "warmachine_steamroller_terminal_los_relation_evidence_v1";

const NYMARA_PIECE_KEY = "player2_nymara_the_shadowblade_1_1";
const STRYGON_PIECE_KEY = "player2_strygon_8_1";
const SEPSIRA_PIECE_KEY = "player1_master_necrosurgeon_sepsira_1_1";
const BLOCKER_PIECE_KEY = "player1_raptor_20_1";
const TETHERED_JAVELIN_PROFILE_KEY = "cedcaadf-a92b-468e-93b5-3bf7161b7aac";
const LOS_VALUES = Object.freeze([
  "terrain_blocked",
  "model_blocked",
  "stealth_blocks_beyond_five",
  "true_sight_or_ignore_stealth_override",
]);
const RUNTIME_WINDOW_FIELDS = Object.freeze([
  "unitActivationWindow",
  "anyTimeActivationWindow",
  "initialAttackWindow",
  "combatPurchaseWindow",
  "activationForfeitWindow",
  "vengeanceWindow",
  "preRollTokenBoostWindow",
]);

function isLeader(piece = {}) {
  return piece.isWarcaster || piece.isWarlock || piece.isLeader ||
    /warcaster|warlock|leader/i.test(`${piece.modelRole || ""} ${piece.modelType || ""}`);
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

function restoreAlive(piece = {}, boxesRemaining = null) {
  const maximum = Math.max(1, Number(
    piece.damage?.maxBoxes ?? piece.maxBoxes ?? piece.boxesRemaining ?? 1,
  ));
  const boxes = boxesRemaining == null ? maximum : Math.max(1, Number(boxesRemaining));
  piece.destroyed = false;
  piece.destroyedTriggerOccurred = false;
  piece.removedFromPlay = false;
  piece.offTable = false;
  piece.disabled = false;
  piece.boxed = false;
  piece.damageLifecycleStage = "";
  piece.damage = { ...(piece.damage || {}), boxesRemaining: boxes };
  if ("boxesRemaining" in piece) piece.boxesRemaining = boxes;
}

function grantAuthoredStealthStatus(target = {}) {
  const rule = {
    schemaVersion: "warmachine_special_rules_v0",
    ruleKey: "stealth",
    name: "Stealth",
    families: ["defense", "targeting"],
    effectTags: ["ranged_spell_automatic_miss_over_five"],
    implementationStatus: "scoped_effect",
    sourceKinds: ["authored_terminal_current_state"],
    sourceIds: ["terminal-los-authored-stealth-status-v1"],
    sourceNames: ["Authored terminal Stealth status"],
    sourceTexts: [
      "Ranged and arcane attacks targeting this model from more than 5 inches away automatically miss.",
    ],
  };
  target.specialRules = [
    ...(target.specialRules || []).filter((entry) =>
      String(entry?.ruleKey || entry || "").toLowerCase() !== "stealth"),
    rule,
  ];
  target.metadata = {
    ...(target.metadata || {}),
    authoredTerminalStealthStatus: true,
    authoredTerminalStealthHistoricalSourceProven: false,
  };
}

function grantAuthoredTrueSightStatus(actor = {}) {
  const rule = {
    schemaVersion: "warmachine_special_rules_v0",
    ruleKey: "true_sight",
    name: "True Sight",
    families: ["targeting"],
    effectTags: ["ignore_stealth"],
    implementationStatus: "scoped_effect",
    sourceKinds: ["authored_terminal_current_state"],
    sourceIds: ["terminal-los-authored-true-sight-status-v1"],
    sourceNames: ["Authored terminal True Sight status"],
    sourceTexts: ["This model ignores Stealth when determining ranged and arcane attacks."],
  };
  actor.specialRules = [
    ...(actor.specialRules || []).filter((entry) =>
      String(entry?.ruleKey || entry || "").toLowerCase() !== "true_sight"),
    rule,
  ];
  actor.metadata = {
    ...(actor.metadata || {}),
    authoredTerminalTrueSightStatus: true,
    authoredTerminalTrueSightHistoricalSourceProven: false,
  };
}

function matchingCorpusCell(corpus = {}) {
  return (corpus.cells || []).find((cell) =>
    cell.scenarioKey === "high_stakes" &&
    cell.terminalClassKey === "unique_leader_assassination" &&
    cell.attackerSideKey === "player2" &&
    cell.defenderSideKey === "player1" &&
    cell.winnerSideKey === "player2" &&
    cell.loserSideKey === "player1" &&
    cell.endingSideKey === "player2" &&
    cell.causalActionFamily === "active_attack_or_effect" &&
    cell.roundClass?.exactRoundNumber === true &&
    cell.roundClass?.representativeRoundNumber === 3) || null;
}

function partitionCoordinates(cell = {}, lineOfSight = "clear") {
  const requested = {
    lifecycle: "both_rosters_complete",
    damage: "leader_at_terminal_threshold",
    resource: "zero_available",
    actionRange: "strictly_inside",
    leaderControl: "strictly_inside",
    lineOfSight,
    baseTopology: "legal_separated",
    scenarioTerrainSetup: "all_flags_fallback_no_valid_terrain",
    highStakesCountdownState: "all_elements_at_five",
    highStakesFuseResolution: "random_target_without_50mm_secured",
    highStakesBlastClosure: "no_detonation",
  };
  return Object.fromEntries(Object.keys(cell.partitions || {})
    .map((key) => [key, requested[key]]));
}

function authorState(baselineState = {}, lineOfSight = "") {
  if (!LOS_VALUES.includes(lineOfSight)) {
    throw new Error(`terminal_los_relation_unknown:${lineOfSight}`);
  }
  const state = structuredClone(baselineState || {});
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
    terminalLosRelation: lineOfSight,
  };
  for (const piece of state.pieces || []) {
    piece.activated = true;
    piece.activationKey = "";
    zeroResources(piece);
  }
  const nymara = state.pieces.find((piece) => piece.pieceKey === NYMARA_PIECE_KEY);
  const strygon = state.pieces.find((piece) => piece.pieceKey === STRYGON_PIECE_KEY);
  const target = state.pieces.find((piece) => piece.pieceKey === SEPSIRA_PIECE_KEY);
  const blocker = state.pieces.find((piece) => piece.pieceKey === BLOCKER_PIECE_KEY);
  if (!nymara || !strygon || !target || !blocker ||
      !isLeader(nymara) || !isLeader(target)) {
    throw new Error("terminal_los_relation_required_piece_identity_missing");
  }
  const override = lineOfSight === "true_sight_or_ignore_stealth_override";
  const actor = nymara;
  actor.activated = false;
  actor.position = { xIn: 16, yIn: 36 };
  target.position = { xIn: 23, yIn: 36 };
  strygon.position = { xIn: 16, yIn: 32 };
  restoreAlive(nymara);
  restoreAlive(target, 1);
  if (["stealth_blocks_beyond_five", "true_sight_or_ignore_stealth_override"]
    .includes(lineOfSight)) {
    grantAuthoredStealthStatus(target);
  }
  if (override) grantAuthoredTrueSightStatus(actor);
  if (lineOfSight === "model_blocked") {
    blocker.position = { xIn: 19.5, yIn: 36 };
  }
  if (lineOfSight === "terrain_blocked") {
    state.terrain = [...(state.terrain || []), {
      terrainKey: "terminal-los-relation-obstruction",
      type: "obstruction",
      xIn: 19.5,
      yIn: 36,
      widthIn: 1.5,
      heightIn: 4,
      rotationDegrees: 0,
      blocksLineOfSight: true,
      blocksMovement: false,
      exactWithinScope: true,
      strictGeometryRelevant: true,
      geometryExactWithinScope: true,
    }];
  }
  state.stateKey = `high-stakes-round-3-terminal-los-relation:${lineOfSight}:v1`;
  const normalized = normalizeRulesV1State(state);
  const normalizedActor = normalized.pieces.find((piece) => piece.pieceKey === actor.pieceKey);
  const normalizedTarget = normalized.pieces.find((piece) => piece.pieceKey === target.pieceKey);
  return {
    state: normalized,
    actorPieceKey: actor.pieceKey,
    targetPieceKey: target.pieceKey,
    blockerPieceKey: lineOfSight === "model_blocked" ? blocker.pieceKey : "",
    attackProfileKey: TETHERED_JAVELIN_PROFILE_KEY,
    lineOfSight,
    geometry: {
      actorPosition: normalizedActor.position,
      targetPosition: normalizedTarget.position,
      actorTargetEdgeDistanceIn: closestPointDistanceIn(normalizedActor, normalizedTarget),
      authoredTerrainBlockerKey: lineOfSight === "terrain_blocked"
        ? "terminal-los-relation-obstruction"
        : "",
      authoredModelBlockerPieceKey: lineOfSight === "model_blocked" ? blocker.pieceKey : "",
    },
  };
}

function matchingAttackRows(authored = {}) {
  const enumeration = enumerateRulesV1Actions(authored.state, {
    actorPieceKeys: [authored.actorPieceKey],
    targetPieceKeys: [authored.targetPieceKey],
    actionFamilyKeys: ["attack_or_effect"],
    includeActorlessActions: false,
    includeUntargetedActions: false,
  });
  const matches = (candidate) =>
    candidate.actorPieceKey === authored.actorPieceKey &&
    candidate.targetPieceKey === authored.targetPieceKey &&
    candidate.actionType === "ranged_attack" &&
    candidate.metadata?.attackProfile?.profileKey === authored.attackProfileKey;
  return {
    enumeration,
    action: (enumeration.actions || []).find(matches) || null,
    rejected: (enumeration.rejectedActions || []).find(matches) || null,
  };
}

function applyWithExplicitBoostDeclines(rows = {}, authored = {}) {
  const inputAction = {
    actionKey: rows.action.actionKey,
    steamroller2026Decision: { highStakes: { fuseRoll: 1 } },
    strictRollOutcome: buildWarmachineBenchmarkMaximumStrictRollOutcomeV2(rows.action),
  };
  const transitions = [];
  let transition = applyRulesV1Action(rows.enumeration.state, {
    ...inputAction,
    __warmachineTrustedRulesV1Enumeration: rows.enumeration,
  });
  transitions.push(transition);
  for (let index = 0; index < 8 && transition.ok !== true; index += 1) {
    if (transition.reason !== "pre_roll_resource_boost_decision_required") break;
    const window = transition.nextState?.preRollTokenBoostWindow || {};
    const declineAction = {
      actionKey: `${authored.actorPieceKey}:pre-roll-resource-boost:${window.rollIndex || 1}:decline:v1`,
    };
    transition = applyRulesV1Action(transition.nextState, declineAction);
    transitions.push(transition);
  }
  const events = transitions.flatMap((entry) => entry.events || []);
  const receiptCore = stableGraphValue({
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    predecessorStateHash: warmachineReverseStateSemanticHashV1(authored.state),
    inputAction,
    actionKeys: transitions.map((entry) => entry.action?.actionKey || ""),
    events,
    terminalStateHash: warmachineReverseStateSemanticHashV1(transition.nextState || {}),
  });
  return {
    inputAction,
    transitions,
    transition,
    events,
    terminalStateHash: receiptCore.terminalStateHash,
    receiptHash: stableGraphHash(receiptCore),
  };
}

function rejectedRoot({ authored, cell, coordinates, runtimeWitness }) {
  const primary = matchingAttackRows(authored);
  const replay = matchingAttackRows(authored);
  if (primary.action || replay.action || !primary.rejected || !replay.rejected ||
      primary.rejected.rejection?.reason !== "line_of_sight_blocked" ||
      stableGraphHash(primary.rejected) !== stableGraphHash(replay.rejected)) {
    throw new Error(`terminal_los_relation_expected_reject_missing:${stableGraphHash({
      lineOfSight: authored.lineOfSight,
      primaryAction: primary.action,
      primaryRejected: primary.rejected,
      replayAction: replay.action,
      replayRejected: replay.rejected,
    })}`);
  }
  const receipt = (rows) => stableGraphHash({
    operation: "rules_v1_action_enumeration_rejection",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    inputStateHash: warmachineReverseStateSemanticHashV1(authored.state),
    rejectedAction: rows.rejected,
  });
  return stableGraphValue({
    disposition: "strict_rejected",
    authority: "rules_v1_host",
    strictRulesConclusion: true,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    scenarioKey: cell.scenarioKey,
    cellKey: cell.cellKey,
    subcellKey: warmachineSteamrollerTerminalScenarioSubcellKeyV1(cell, coordinates),
    terminalClassKey: cell.terminalClassKey,
    reason: "terminal_los_relation_direct_attack_rejected",
    receiptHash: receipt(primary),
    replayReceiptHash: receipt(replay),
    strictReplayCertified: true,
    partitionCoordinates: coordinates,
    executionRosterWitnessHash: runtimeWitness.witness.witnessHash,
    executionRosterModelCount: runtimeWitness.witness.modelCount,
    actorPieceKey: authored.actorPieceKey,
    targetPieceKey: authored.targetPieceKey,
    blockerPieceKey: primary.rejected.rejection?.evidence?.blockerPieceKey ||
      authored.blockerPieceKey,
    blockerTerrainKey: primary.rejected.rejection?.evidence?.terrainKey ||
      authored.geometry.authoredTerrainBlockerKey,
    rejectionReason: primary.rejected.rejection.reason,
    geometry: authored.geometry,
    historicalReachabilityProven: false,
    reachabilityProven: false,
    trainingTruth: false,
  });
}

function stealthFilteredRoot({ authored, cell, coordinates, runtimeWitness }) {
  const primaryRows = matchingAttackRows(authored);
  const replayRows = matchingAttackRows(authored);
  if (!primaryRows.action || primaryRows.rejected || !replayRows.action ||
      primaryRows.action.metadata?.attackResolution?.automaticMiss !== true ||
      replayRows.action.metadata?.attackResolution?.automaticMiss !== true) {
    throw new Error("terminal_los_relation_stealth_automatic_miss_missing");
  }
  const primary = applyWithExplicitBoostDeclines(primaryRows, authored);
  const replay = applyWithExplicitBoostDeclines(replayRows, authored);
  const targetBefore = authored.state.pieces.find((piece) =>
    piece.pieceKey === authored.targetPieceKey);
  const targetAfter = primary.transition.nextState?.pieces?.find((piece) =>
    piece.pieceKey === authored.targetPieceKey);
  const automaticMiss = primary.events.some((event) =>
    ["attack_automatically_missed", "strict_automatic_miss_outcome_applied"]
      .includes(event.eventType));
  if (primary.transition.ok !== true || replay.transition.ok !== true || !automaticMiss ||
      !alive(targetAfter) ||
      Number(targetAfter.damage?.boxesRemaining ?? targetAfter.boxesRemaining) !==
        Number(targetBefore.damage?.boxesRemaining ?? targetBefore.boxesRemaining) ||
      primary.events.some((event) => event.eventType === "terminal") ||
      primary.terminalStateHash !== replay.terminalStateHash) {
    throw new Error(`terminal_los_relation_stealth_filter_failed:${stableGraphHash({
      primaryOk: primary.transition.ok,
      replayOk: replay.transition.ok,
      automaticMiss,
      targetAfter,
      eventTypes: primary.events.map((event) => event.eventType),
    })}`);
  }
  return stableGraphValue({
    disposition: "proposal_filtered",
    authority: "rules_v1_host",
    strictRulesConclusion: false,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    scenarioKey: cell.scenarioKey,
    cellKey: cell.cellKey,
    subcellKey: warmachineSteamrollerTerminalScenarioSubcellKeyV1(cell, coordinates),
    terminalClassKey: cell.terminalClassKey,
    reason: "stealth_legal_automatic_miss_did_not_reach_terminal_relation",
    receiptHash: primary.receiptHash,
    replayReceiptHash: replay.receiptHash,
    strictReplayCertified: true,
    partitionCoordinates: coordinates,
    executionRosterWitnessHash: runtimeWitness.witness.witnessHash,
    executionRosterModelCount: runtimeWitness.witness.modelCount,
    actorPieceKey: authored.actorPieceKey,
    targetPieceKey: authored.targetPieceKey,
    actionKey: primaryRows.action.actionKey,
    actionType: primaryRows.action.actionType,
    automaticMissMarker:
      primaryRows.action.metadata?.attackResolution?.automaticMissMarker || "",
    geometry: authored.geometry,
    historicalStealthSourceProven: false,
    historicalReachabilityProven: false,
    reachabilityProven: false,
    trainingTruth: false,
  });
}

function overrideMaterializedRoot({ authored, cell, coordinates, runtimeWitness }) {
  const primaryRows = matchingAttackRows(authored);
  const replayRows = matchingAttackRows(authored);
  const effects = primaryRows.action?.metadata?.specialRuleAnalysis?.effects || [];
  if (!primaryRows.action || primaryRows.rejected || !replayRows.action ||
      primaryRows.action.metadata?.attackResolution?.automaticMiss === true ||
      !effects.some((effect) => effect.effectType === "ignore_stealth")) {
    throw new Error(`terminal_los_relation_ignore_stealth_missing:${JSON.stringify({
      actionPresent: Boolean(primaryRows.action),
      rejectedReason: primaryRows.rejected?.rejection?.reason || "",
      automaticMiss: primaryRows.action?.metadata?.attackResolution?.automaticMiss,
      effects: effects.map((effect) => ({
        atomKey: effect.atomKey || "",
        ruleKey: effect.ruleKey || "",
        effectType: effect.effectType || "",
        primitiveType: effect.primitive?.primitiveType || "",
        ignoreStealth: effect.primitive?.ignoreStealth === true,
      })),
      modifierEffects: primaryRows.action?.metadata?.attackResolution?.modifierEffects || [],
    })}`);
  }
  const primary = applyWithExplicitBoostDeclines(primaryRows, authored);
  const replay = applyWithExplicitBoostDeclines(replayRows, authored);
  const terminal = primary.events.find((event) =>
    event.eventType === "terminal" && event.winnerSideKey === "player2");
  const replayTerminal = replay.events.find((event) =>
    event.eventType === "terminal" && event.winnerSideKey === "player2");
  if (primary.transition.ok !== true || replay.transition.ok !== true ||
      !terminal || !replayTerminal || primary.terminalStateHash !== replay.terminalStateHash) {
    throw new Error(`terminal_los_relation_override_execution_failed:${JSON.stringify({
      primaryOk: primary.transition.ok,
      primaryReason: primary.transition.reason,
      replayOk: replay.transition.ok,
      replayReason: replay.transition.reason,
      terminal: terminal ? {
        reason: terminal.reason,
        winnerSideKey: terminal.winnerSideKey,
      } : null,
      replayTerminal: replayTerminal ? {
        reason: replayTerminal.reason,
        winnerSideKey: replayTerminal.winnerSideKey,
      } : null,
      eventTypes: primary.events.map((event) => event.eventType),
      transitionCount: primary.transitions.length,
    })}`);
  }
  return stableGraphValue({
    disposition: "strict_materialized",
    authority: "rules_v1_host",
    strictRulesConclusion: false,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    scenarioKey: cell.scenarioKey,
    cellKey: cell.cellKey,
    subcellKey: warmachineSteamrollerTerminalScenarioSubcellKeyV1(cell, coordinates),
    terminalClassKey: cell.terminalClassKey,
    reason: "ignore_stealth_override_reached_terminal_relation",
    receiptHash: primary.receiptHash,
    replayReceiptHash: replay.receiptHash,
    strictReplayCertified: true,
    partitionCoordinates: coordinates,
    executionRosterWitnessHash: runtimeWitness.witness.witnessHash,
    executionRosterModelCount: runtimeWitness.witness.modelCount,
    actorPieceKey: authored.actorPieceKey,
    targetPieceKey: authored.targetPieceKey,
    actionKey: primaryRows.action.actionKey,
    actionType: primaryRows.action.actionType,
    ignoreStealthEffects: effects.filter((effect) =>
      effect.effectType === "ignore_stealth").map((effect) => ({
      ruleKey: effect.ruleKey || "",
      effectType: effect.effectType,
      marker: effect.marker || "",
    })),
    geometry: authored.geometry,
    terminalEvent: terminal,
    historicalStealthSourceProven: false,
    historicalTrueSightSourceProven: false,
    historicalReachabilityProven: false,
    reachabilityProven: false,
    trainingTruth: false,
  });
}

export function buildWarmachineSteamrollerTerminalLosRelationEvidenceV1({
  corpus = {},
  rosterWitness = null,
  baselineState = null,
} = {}) {
  if (corpus.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
    throw new Error("terminal_los_relation_corpus_host_mismatch");
  }
  if (rosterWitness?.witness?.complete !== true || !baselineState) {
    throw new Error("terminal_los_relation_complete_roster_baseline_missing");
  }
  const cell = matchingCorpusCell(corpus);
  if (!cell) throw new Error("terminal_los_relation_corpus_cell_missing");
  const roots = [];
  const runtime = [];
  for (const lineOfSight of LOS_VALUES) {
    const authored = authorState(baselineState, lineOfSight);
    const placementAudit = auditRulesV1StaticPlacement(authored.state);
    if (!placementAudit.ok) {
      throw new Error(`terminal_los_relation_static_placement_rejected:${lineOfSight}:${stableGraphHash(placementAudit)}`);
    }
    const coordinates = partitionCoordinates(cell, lineOfSight);
    const parameters = { authored, cell, coordinates, runtimeWitness: rosterWitness };
    const root = lineOfSight === "stealth_blocks_beyond_five"
      ? stealthFilteredRoot(parameters)
      : lineOfSight === "true_sight_or_ignore_stealth_override"
        ? overrideMaterializedRoot(parameters)
        : rejectedRoot(parameters);
    roots.push(root);
    runtime.push({ authoredState: authored.state, placementAudit, root });
  }
  const core = {
    schemaVersion: WARMACHINE_STEAMROLLER_TERMINAL_LOS_RELATION_EVIDENCE_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    corpusHash: corpus.corpusHash,
    executionRosterWitness: rosterWitness.witness,
    strictMaterializedRootCount: roots.filter((root) =>
      root.disposition === "strict_materialized").length,
    strictRejectedRootCount: roots.filter((root) =>
      root.disposition === "strict_rejected").length,
    proposalFilteredRootCount: roots.filter((root) =>
      root.disposition === "proposal_filtered").length,
    inputInvalidRootCount: 0,
    roots,
    claimBoundary: "These roots bind four exact complete-roster LOS relation hypotheses to the current rules-v1 Host. Terrain and model blockers are direct-action strict rejections; Stealth beyond 5 inches is a legal independently replayed automatic miss and therefore proposal_filtered; an authored current-state True Sight status ignores the authored current-state Stealth status and reaches an independently replayed terminal state. The temporary statuses and all later-round positions have no proven source history, historical reachability or training authority.",
    trainingTruth: false,
  };
  return {
    evidence: stableGraphValue({ ...core, evidenceHash: stableGraphHash(core) }),
    runtime,
  };
}
