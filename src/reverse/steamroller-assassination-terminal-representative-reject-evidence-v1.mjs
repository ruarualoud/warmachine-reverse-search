import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  auditRulesV1StaticPlacement,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";
import { buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1 } from
  "./steamroller-terminal-execution-roster-witness-v1.mjs";

export const
WARMACHINE_STEAMROLLER_ASSASSINATION_TERMINAL_REPRESENTATIVE_REJECT_EVIDENCE_V1_SCHEMA =
  "warmachine_steamroller_assassination_terminal_representative_reject_evidence_v1";

const INVALID_BASE_TOPOLOGIES = new Set([
  "illegal_overlap_expected_reject",
  "outside_table_expected_reject",
]);

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

function baseRadiusIn(piece = {}) {
  return Number(piece.baseSizeIn || 1.18) / 2;
}

function zeroResources(piece = {}) {
  piece.resourcePoints = 0;
  if ("resource2" in piece) piece.resource2 = 0;
  if ("focus" in piece) piece.focus = 0;
  if ("focusPoints" in piece) piece.focusPoints = 0;
  if ("fury" in piece) piece.fury = 0;
  if ("furyPoints" in piece) piece.furyPoints = 0;
}

function authorRejectedState(fixture = {}, cell = {}, representative = {}) {
  const state = structuredClone(fixture.stateTemplate || {});
  for (const field of RUNTIME_WINDOW_FIELDS) delete state[field];
  state.strictMode = true;
  state.enforceStrictExecutor = true;
  state.activeSideKey = cell.endingSideKey;
  state.phaseKey = "activation";
  state.turnNumber = cell.roundClass?.representativeRoundNumber || 0;
  state.outcome = null;
  state.terminal = null;
  for (const piece of state.pieces || []) {
    piece.activated = false;
    piece.activationKey = "";
    zeroResources(piece);
  }
  const actor = state.pieces.find((piece) =>
    piece.sideKey === cell.winnerSideKey && isLeader(piece));
  const target = state.pieces.find((piece) =>
    piece.sideKey === cell.loserSideKey && isLeader(piece));
  if (!actor || !target) {
    throw new Error("assassination_reject_required_leader_identity_missing");
  }
  const topology = representative.coordinates?.baseTopology;
  if (topology === "illegal_overlap_expected_reject") {
    actor.position = { xIn: 17.5, yIn: 20 };
    target.position = { xIn: 17.5, yIn: 20 };
  } else if (topology === "outside_table_expected_reject") {
    actor.position = { xIn: baseRadiusIn(actor), yIn: 20 };
    target.position = { xIn: -baseRadiusIn(target) - 0.25, yIn: 20 };
  } else {
    throw new Error(`assassination_reject_topology_unsupported:${topology || ""}`);
  }
  state.stateKey = `assassination-terminal-reject:${representative.subcellKey}`;
  return {
    state: normalizeRulesV1State(state),
    actorPieceKey: actor.pieceKey,
    targetPieceKey: target.pieceKey,
    topology,
  };
}

function selectedRepresentatives(corpus = {}, representativeSelection = {}) {
  const cellsByKey = new Map((corpus.cells || []).map((cell) => [cell.cellKey, cell]));
  const candidates = (representativeSelection.selectedRepresentatives || [])
    .flatMap((representative) => {
    const cell = cellsByKey.get(representative.cellKey);
    if (!cell || cell.terminalClassKey !== "unique_leader_assassination" ||
        representative.expectedNextDisposition !== "expected_strict_reject" ||
        !INVALID_BASE_TOPOLOGIES.has(representative.coordinates?.baseTopology)) return [];
    return [{ cell, representative }];
  }).sort((left, right) =>
      left.representative.coordinates.baseTopology.localeCompare(
        right.representative.coordinates.baseTopology,
      ) || left.representative.subcellKey.localeCompare(right.representative.subcellKey));
  const selectedByTopology = new Map();
  for (const candidate of candidates) {
    const topology = candidate.representative.coordinates.baseTopology;
    if (!selectedByTopology.has(topology)) selectedByTopology.set(topology, candidate);
  }
  return [...selectedByTopology.values()];
}

export function buildWarmachineSteamrollerAssassinationTerminalRepresentativeRejectEvidenceV1({
  corpus = {},
  representativeSelection = {},
  rosterWitness = null,
} = {}) {
  if (corpus.hostReceiptHash !== warmachineHost.receipt.receiptHash) {
    throw new Error("assassination_reject_corpus_host_mismatch");
  }
  if (representativeSelection.corpusHash !== corpus.corpusHash) {
    throw new Error("assassination_reject_selection_corpus_mismatch");
  }
  const runtimeWitness = rosterWitness ||
    buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1();
  if (runtimeWitness.witness?.complete !== true) {
    throw new Error("assassination_reject_execution_roster_incomplete");
  }
  const selected = selectedRepresentatives(corpus, representativeSelection);
  const roots = selected.map(({ cell, representative }) => {
    const authored = authorRejectedState(runtimeWitness.fixture, cell, representative);
    const staticPlacementAudit = auditRulesV1StaticPlacement(authored.state);
    if (staticPlacementAudit.ok) {
      throw new Error(`assassination_reject_static_placement_unexpectedly_legal:${
        representative.subcellKey}`);
    }
    const receiptHash = stableGraphHash({
      operation: "rules_v1_static_placement_audit",
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      inputStateHash: warmachineReverseStateSemanticHashV1(authored.state),
      audit: staticPlacementAudit,
    });
    return stableGraphValue({
      disposition: "strict_rejected",
      authority: "rules_v1_host",
      strictRulesConclusion: true,
      hostReceiptHash: warmachineHost.receipt.receiptHash,
      scenarioKey: cell.scenarioKey,
      cellKey: cell.cellKey,
      subcellKey: representative.subcellKey,
      terminalClassKey: cell.terminalClassKey,
      reason: "assassination_terminal_static_placement_rejected",
      receiptHash,
      replayReceiptHash: "",
      strictReplayCertified: false,
      partitionCoordinates: representative.coordinates,
      executionRosterWitnessHash: runtimeWitness.witness.witnessHash,
      executionRosterModelCount: runtimeWitness.witness.modelCount,
      actorPieceKey: authored.actorPieceKey,
      targetPieceKey: authored.targetPieceKey,
      topology: authored.topology,
      staticPlacementIssueCodes: (staticPlacementAudit.issues || [])
        .map((issue) => String(issue.code || issue.reason || "")).filter(Boolean).sort(),
      historicalReachabilityProven: false,
      reachabilityProven: false,
      trainingTruth: false,
    });
  });
  const core = {
    schemaVersion:
      WARMACHINE_STEAMROLLER_ASSASSINATION_TERMINAL_REPRESENTATIVE_REJECT_EVIDENCE_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    corpusHash: corpus.corpusHash,
    selectionHash: representativeSelection.selectionHash,
    executionRosterWitness: runtimeWitness.witness,
    selectedRepresentativeCount: selected.length,
    strictRejectedCount: roots.length,
    roots,
    completeWithinSelectedScope: selected.length > 0 && roots.length === selected.length,
    claimBoundary: "Each root is a current-Host static-placement rejection for one exact selected assassination representative and invalid base-topology class backed by complete legal rosters. It proves only that authored invalid state, not the executable reactive/continuous terminal cause, reverse reachability, probability, strategy value or the rest of the coarse partition.",
    trainingTruth: false,
  };
  return stableGraphValue({ ...core, evidenceHash: stableGraphHash(core) });
}
