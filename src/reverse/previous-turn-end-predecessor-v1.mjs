import { enumerateWarmachineBenchmarkActionsV2 } from
  "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { expandWarmachineStrictPolicyStepV1 } from
  "../search/strict-policy-step-v1.mjs";
import { normalizeRulesV1State, warmachineHost } from "../warmachine-host-runtime.mjs";
import { buildWarmachineReverseReachabilityCandidateSetV2 } from
  "./reachability-contract-v2.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "./terminal-event-predecessor-v1.mjs";
import { warmachinePieceInPlayV1 } from "./piece-lifecycle-v1.mjs";
import { restoreWarmachineScenarioSettlementPreimageV1 } from
  "./scenario-settlement-preimage-v1.mjs";

export const WARMACHINE_PREVIOUS_TURN_END_PREDECESSOR_V1_SCHEMA =
  "warmachine_previous_turn_end_predecessor_v1";

function alive(piece = {}) {
  return warmachinePieceInPlayV1(piece);
}

function oppositeSide(sideKey = "") {
  if (sideKey === "player1") return "player2";
  if (sideKey === "player2") return "player1";
  throw new Error(`previous_turn_unknown_side:${sideKey}`);
}

function previousTurnRole(successor = {}) {
  const currentSideKey = String(successor.activeSideKey || "");
  const endingSideKey = oppositeSide(currentSideKey);
  const firstPlayerSideKey = String(
    successor.firstPlayerSideKey ||
    successor.scenario?.attackerSideKey ||
    "player1",
  );
  const completedRound = endingSideKey !== firstPlayerSideKey &&
    currentSideKey === firstPlayerSideKey;
  const endingTurnNumber = Number(successor.turnNumber) - Number(completedRound);
  return {
    currentSideKey,
    endingSideKey,
    firstPlayerSideKey,
    completedRound,
    endingTurnNumber,
  };
}

function scoreMap(raw = {}) {
  return Object.fromEntries(Object.entries(raw).map(([sideKey, value]) => [
    sideKey,
    Math.max(0, Number(value || 0)),
  ]).sort(([left], [right]) => left.localeCompare(right)));
}

function statusTagSet(piece = {}) {
  return new Set([
    ...(piece.statusTags || []),
    ...(piece.statuses || []),
  ].map(String));
}

function warjackLikeProposal(piece = {}) {
  const text = `${piece.modelRole || ""} ${piece.modelType || ""} ${piece.label || ""}`;
  return Boolean(
    piece.isWarjack || piece.warjack || /warjack|jack/i.test(text) ||
    (piece.resourceKind === "focus" && piece.canReceiveFocus),
  );
}

function warcasterLikeProposal(piece = {}) {
  const text = `${piece.modelRole || ""} ${piece.modelType || ""} ${piece.label || ""}`;
  return Boolean(piece.isWarcaster || /warcaster/i.test(text));
}

function autonomousMonstrosityProposal(piece = {}) {
  const tags = statusTagSet(piece);
  const text = `${piece.modelRole || ""} ${piece.modelType || ""} ${piece.label || ""}`;
  return Boolean(piece.isMonstrosity || /monstrosit/i.test(text)) &&
    !tags.has("inert") && Boolean(piece.isAutonomous || tags.has("autonomous"));
}

function setPieceResourcePoints(piece = {}, points = 0) {
  const value = Math.max(0, Math.floor(Number(points || 0)));
  piece.resourcePoints = value;
  piece.resource2 = value;
  if (piece.resourceKind === "focus" || "focus" in piece) piece.focus = value;
  if (piece.resourceKind === "fury" || "fury" in piece) piece.fury = value;
  if (piece.resourceKind === "essence" || "essence" in piece) {
    piece.essence = value;
    piece.essencePoints = value;
  }
}

function maintenanceResourcePreimageProposals(successor = {}, rawOptions = {}) {
  const requestedModes = Array.isArray(rawOptions.maintenanceResourcePreimageModes)
    ? [...new Set(rawOptions.maintenanceResourcePreimageModes.map(String))]
    : ["preserve_cleanup_result"];
  const allowedModes = requestedModes.filter((mode) => [
    "preserve_cleanup_result",
    "focus_warjack_power_up_pass_baseline",
    "focus_battlegroup_control_pass_baseline",
  ].includes(mode));
  const currentSideKey = String(successor.activeSideKey || "");
  const proposals = [];
  for (const mode of allowedModes) {
    const pointsByPieceKey = {};
    if ([
      "focus_warjack_power_up_pass_baseline",
      "focus_battlegroup_control_pass_baseline",
    ].includes(mode)) {
      for (const piece of successor.pieces || []) {
        if (piece.sideKey !== currentSideKey || !alive(piece)) continue;
        if (warjackLikeProposal(piece) && !autonomousMonstrosityProposal(piece)) {
          const cap = Math.max(0, Math.floor(Number(piece.resourceMax ?? 3))) || 3;
          pointsByPieceKey[piece.pieceKey] = Math.min(1, cap);
        } else if (mode === "focus_battlegroup_control_pass_baseline" &&
            warcasterLikeProposal(piece)) {
          const cap = Math.max(0, Math.floor(Number(
            piece.resourceMax ?? piece.arc ?? 0,
          )));
          pointsByPieceKey[piece.pieceKey] = Math.min(
            cap,
            Math.max(0, Math.floor(Number(piece.arc ?? cap))),
          );
        }
      }
    }
    proposals.push({ mode, pointsByPieceKey: stableGraphValue(pointsByPieceKey) });
  }
  const explicit = rawOptions.explicitMaintenanceResourcePreimages;
  if (Array.isArray(explicit)) {
    for (const [index, row] of explicit.entries()) {
      const pointsByPieceKey = Object.fromEntries(Object.entries(
        row?.pointsByPieceKey || {},
      ).map(([pieceKey, points]) => [
        String(pieceKey),
        Math.max(0, Math.floor(Number(points || 0))),
      ]).sort(([left], [right]) => left.localeCompare(right)));
      proposals.push({
        mode: String(row?.mode || `explicit_bounded_${index + 1}`),
        pointsByPieceKey,
      });
    }
  }
  const unique = new Map();
  for (const proposal of proposals) {
    const key = stableGraphHash(proposal.pointsByPieceKey);
    if (!unique.has(key)) unique.set(key, proposal);
  }
  return [...unique.values()].sort((left, right) =>
    Number(left.mode !== "focus_battlegroup_control_pass_baseline") -
      Number(right.mode !== "focus_battlegroup_control_pass_baseline") ||
    left.mode.localeCompare(right.mode));
}

function semanticDifferenceRows(left, right, path = "", rows = [], limit = 64) {
  if (rows.length >= limit || Object.is(left, right)) return rows;
  if (typeof left !== typeof right || left === null || right === null ||
      typeof left !== "object") {
    rows.push(stableGraphValue({ path, executed: left, expected: right }));
    return rows;
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => key !== "stateKey").sort();
  for (const key of keys) {
    semanticDifferenceRows(
      left[key],
      right[key],
      path ? `${path}.${key}` : key,
      rows,
      limit,
    );
    if (rows.length >= limit) break;
  }
  return rows;
}

function settlementRowsForPreviousTurn(successor, endingSideKey, endingTurnNumber) {
  const prefixes = [
    `turn_end:${endingSideKey}`,
    `turn_end:${endingSideKey}:`,
  ];
  const rows = [];
  const retained = [];
  for (const row of successor.scenario?.scoringHistory || []) {
    const window = String(row.scoringWindow || "");
    const matchesWindow = prefixes.some((prefix) =>
      window === prefix || window.startsWith(prefix));
    if (Number(row.round) === endingTurnNumber && matchesWindow) rows.push(row);
    else retained.push(row);
  }
  return { rows, retained };
}

function subtractSettlementScore(successorScore = {}, rows = []) {
  const score = scoreMap(successorScore);
  for (const row of rows) {
    const sideKey = String(row.sideKey || "");
    const points = Math.max(0, Number(row.points || 0));
    if (!sideKey || Number(score[sideKey] || 0) < points) {
      throw new Error("previous_turn_score_history_exceeds_successor_score");
    }
    score[sideKey] = Number(score[sideKey] || 0) - points;
  }
  return score;
}

function restorePreviousTurnEnd(
  controlStart,
  nextSideActivationRestoreMode = "all_alive_activated",
  maintenanceResourcePreimage = {
    mode: "preserve_cleanup_result",
    pointsByPieceKey: {},
  },
  settlementWitness = null,
) {
  const {
    currentSideKey,
    endingSideKey,
    firstPlayerSideKey,
    completedRound,
    endingTurnNumber,
  } = previousTurnRole(controlStart);
  if (endingTurnNumber < 1) throw new Error("previous_turn_number_underflow");
  const settlement = settlementRowsForPreviousTurn(
    controlStart,
    endingSideKey,
    endingTurnNumber,
  );
  const state = structuredClone(controlStart);
  state.activeSideKey = endingSideKey;
  state.turnNumber = endingTurnNumber;
  state.phaseKey = "activation";
  state.controlPhaseStepKey = "";
  state.controlPhaseProgressed = false;
  state.controlPhaseEndAmbushWindow = false;
  state.activationForfeitWindow = null;
  state.anyTimeActivationWindow = null;
  state.initialAttackWindow = null;
  state.combatPurchaseWindow = null;
  state.activationPreludeActorPieceKey = "";
  state.activationPreludeKind = "";
  state.soulTakerActivationPreludeActorPieceKey = "";
  state.scenario = {
    ...(state.scenario || {}),
    score: subtractSettlementScore(state.scenario?.score || {}, settlement.rows),
    scoringHistory: settlement.retained,
  };
  const scenarioSettlementRestoration = restoreWarmachineScenarioSettlementPreimageV1(
    state,
    settlementWitness,
  );
  for (const piece of state.pieces || []) {
    if (!alive(piece)) continue;
    if (piece.sideKey === endingSideKey) {
      piece.activated = true;
    }
    if (piece.sideKey === currentSideKey) {
      piece.activated = nextSideActivationRestoreMode === "all_alive_activated";
      if (Object.hasOwn(
        maintenanceResourcePreimage.pointsByPieceKey || {},
        piece.pieceKey,
      )) {
        setPieceResourcePoints(
          piece,
          maintenanceResourcePreimage.pointsByPieceKey[piece.pieceKey],
        );
      }
    }
  }
  state.stateKey = `previous-turn-end-predecessor-${stableGraphHash({
    successorStateHash: warmachineReverseStateSemanticHashV1(controlStart),
    currentSideKey,
    endingSideKey,
    firstPlayerSideKey,
    completedRound,
    endingTurnNumber,
    removedScoringLedgerKeys: settlement.rows.map((row) => row.key).sort(),
    activationRestoreMode: nextSideActivationRestoreMode,
    maintenanceResourcePreimage,
    settlementWitnessHash: settlementWitness
      ? stableGraphHash(settlementWitness)
      : "",
  }, 24)}`;
  return {
    state: normalizeRulesV1State(state),
    mutation: {
      operatorKey: "previous_turn_end_inverse_v1",
      currentSideKey,
      endingSideKey,
      firstPlayerSideKey,
      completedRound,
      endingTurnNumber,
      removedScoringLedgerKeys: settlement.rows.map((row) => row.key).sort(),
      scoreBeforeTurnEnd: state.scenario.score,
      activationRestoreMode: nextSideActivationRestoreMode,
      maintenanceResourcePreimage: stableGraphValue(maintenanceResourcePreimage),
      scenarioSettlementRestoration,
      sourceSettlementReceiptHash: String(settlementWitness?.sourceReceiptHash || ""),
      actionPatch: stableGraphValue(settlementWitness?.actionPatch || {}),
      endingSideControlResidueMode: "preserve_successor_shape",
    },
  };
}

export function generateWarmachinePreviousTurnEndPredecessorsV1(
  controlStartStateInput = {},
  rawOptions = {},
) {
  const successor = normalizeRulesV1State(controlStartStateInput);
  const successorSemanticHash = warmachineReverseStateSemanticHashV1(successor);
  if (successor.phaseKey !== "control" ||
      !["", "maintenance"].includes(String(successor.controlPhaseStepKey || ""))) {
    throw new Error("previous_turn_predecessor_requires_control_start_successor");
  }
  const candidates = [];
  const rejected = [];
  const unresolved = [];
  const runtimeDiagnostics = [];
  const restoreModes = Array.isArray(rawOptions.nextSideActivationRestoreModes)
    ? [...new Set(rawOptions.nextSideActivationRestoreModes.map(String))]
    : ["preserve_reset_state", "all_alive_activated"];
  const resourcePreimages = maintenanceResourcePreimageProposals(successor, rawOptions);
  const settlementWitnesses = Array.isArray(rawOptions.scenarioSettlementWitnesses)
    ? rawOptions.scenarioSettlementWitnesses
    : [];
  if (rawOptions.recordMaintenanceResourcePreimageCoverageDebt === true) {
    unresolved.push({
      predecessorStateHash: successorSemanticHash,
      reason: "previous_turn_end_maintenance_resource_preimage_universe_deferred",
      declaredModes: resourcePreimages.map((row) => row.mode),
      omittedUniverse: [
        "mixed_focus_spending_per_warjack",
        "controller_resource_above_arc_before_cleanup",
        "card_specific_maintenance_resource_mutation",
      ],
    });
  }
  for (const restoreMode of restoreModes.filter((mode) =>
    ["preserve_reset_state", "all_alive_activated"].includes(mode)).sort()) {
    for (const resourcePreimage of resourcePreimages) {
      const previousTurn = previousTurnRole(successor);
      const expectedEndingSideKey = previousTurn.endingSideKey;
      const expectedEndingTurnNumber = previousTurn.endingTurnNumber;
      const matchingWitnesses = settlementWitnesses.filter((witness) =>
        witness.endingSideKey === expectedEndingSideKey &&
        Number(witness.endingTurnNumber) === expectedEndingTurnNumber);
      const settlementWitness = matchingWitnesses[0] || null;
      if (matchingWitnesses.length > 1) {
        unresolved.push({
          predecessorStateHash: successorSemanticHash,
          reason: "previous_turn_end_settlement_witness_ambiguous",
          endingSideKey: expectedEndingSideKey,
          endingTurnNumber: expectedEndingTurnNumber,
          witnessCount: matchingWitnesses.length,
        });
        continue;
      }
      if (settlementWitness?.successorStateSemanticHash &&
          settlementWitness.successorStateSemanticHash !== successorSemanticHash) {
        unresolved.push({
          predecessorStateHash: successorSemanticHash,
          reason: "previous_turn_end_settlement_witness_successor_mismatch",
          endingSideKey: expectedEndingSideKey,
          endingTurnNumber: expectedEndingTurnNumber,
          expectedSuccessorStateHash: settlementWitness.successorStateSemanticHash,
          observedSuccessorStateHash: successorSemanticHash,
        });
        continue;
      }
      const proposal = restorePreviousTurnEnd(
        successor,
        restoreMode,
        resourcePreimage,
        settlementWitness,
      );
      if (proposal.mutation.scenarioSettlementRestoration?.unresolvedReasons?.length) {
        unresolved.push({
          predecessorStateHash: warmachineReverseStateSemanticHashV1(proposal.state),
          reason: "previous_turn_end_scenario_settlement_inverse_unresolved",
          mutation: proposal.mutation,
        });
        continue;
      }
      if (settlementWitness?.predecessorStateSemanticHash &&
          settlementWitness.predecessorStateSemanticHash !==
            warmachineReverseStateSemanticHashV1(proposal.state)) {
        unresolved.push({
          predecessorStateHash: warmachineReverseStateSemanticHashV1(proposal.state),
          reason: "previous_turn_end_settlement_witness_predecessor_mismatch",
          expectedPredecessorStateHash: settlementWitness.predecessorStateSemanticHash,
          mutation: proposal.mutation,
        });
        continue;
      }
      const scoped = enumerateWarmachineBenchmarkActionsV2(proposal.state, {
        includeActorlessActions: true,
        actionFamilyKeys: ["timing"],
      });
      const actions = (scoped.enumeration.actions || []).filter((action) =>
        action.actionType === "end_turn");
      if (!actions.length) {
        unresolved.push({
          predecessorStateHash: warmachineReverseStateSemanticHashV1(proposal.state),
          reason: "previous_turn_end_action_not_in_strict_legal_space",
          mutation: proposal.mutation,
          rejectedEndTurnActions: (scoped.enumeration.rejectedActions || [])
            .filter((action) => action.actionType === "end_turn")
            .map((action) => stableGraphValue(action)),
        });
      }
      for (const action of actions) {
        const step = expandWarmachineStrictPolicyStepV1(
          proposal.state,
          () => ({
            scoped,
            action,
            deterministicAction: true,
            nextPolicyCursor: 1,
            actionPatch: settlementWitness?.actionPatch || {},
          }),
          {
            routeKey: `previous-turn-end-predecessor:${proposal.mutation.endingSideKey}:${proposal.mutation.endingTurnNumber}`,
            perspectiveSideKey: successor.activeSideKey,
          },
        );
        const strictMatch = step.stepType === "deterministic" &&
          step.successor?.transitionAccepted === true && step.successor.state &&
          warmachineReverseStateSemanticHashV1(step.successor.state) === successorSemanticHash;
        if (!strictMatch) {
          const row = {
            predecessorStateHash: warmachineReverseStateSemanticHashV1(proposal.state),
            actionKey: action.actionKey,
            reason: step.stepType !== "deterministic"
              ? step.reason || `previous_turn_end_step_${step.stepType}`
              : "strict_previous_turn_end_successor_does_not_match",
            executedSuccessorStateHash: step.successor?.state
              ? warmachineReverseStateSemanticHashV1(step.successor.state)
              : "",
            expectedSuccessorStateHash: successorSemanticHash,
            receiptHash: String(step.successor?.receiptHash || ""),
            mutation: proposal.mutation,
            semanticDifferences: step.successor?.state
              ? semanticDifferenceRows(step.successor.state, successor)
              : [],
          };
          if (step.stepType === "unresolved") unresolved.push(row);
          else rejected.push(row);
          if (rawOptions.includeRuntimeDiagnostics === true) {
            runtimeDiagnostics.push({
              actionKey: action.actionKey,
              predecessorState: proposal.state,
              executedSuccessorState: step.successor?.state || null,
              expectedSuccessorState: successor,
            });
          }
          continue;
        }
        const predecessorStateHash = warmachineReverseStateSemanticHashV1(proposal.state);
        const core = {
          candidateKind: "concrete_previous_turn_end_predecessor",
          successorKind: "next_side_control_phase_start",
          predecessorKind: "previous_side_turn_end",
          operatorKey: proposal.mutation.operatorKey,
          predecessorStateKey: String(proposal.state.stateKey || ""),
          predecessorStateHash,
          successorStateKey: String(successor.stateKey || ""),
          successorStateHash: successorSemanticHash,
          transitionActionKey: action.actionKey,
          endingSideKey: proposal.mutation.endingSideKey,
          endingTurnNumber: proposal.mutation.endingTurnNumber,
          strictWitness: true,
          strictRejected: false,
          strictReceiptHash: step.successor.receiptHash,
          strictReplaySteps: stableGraphValue([{
            actionKey: action.actionKey,
            actionType: action.actionType,
            actorPieceKey: String(action.actorPieceKey || ""),
            targetPieceKey: String(action.targetPieceKey || ""),
            actionPatch: stableGraphValue({
              ...(settlementWitness?.actionPatch || {}),
            }),
          }]),
          unresolvedReasons: [],
          mutation: stableGraphValue(proposal.mutation),
          provenance: {
            upstreamReceiptHash: warmachineHost.receipt.receiptHash,
            oracleOpeningRead: false,
            oracleRouteRead: false,
            oracleIntermediateStateRead: false,
          },
        };
        candidates.push({
          ...core,
          candidateKey: `previous-turn-end-predecessor-${stableGraphHash(core, 32)}`,
          predecessorState: proposal.state,
        });
      }
    }
  }
  candidates.sort((left, right) =>
    Number(left.mutation?.activationRestoreMode === "preserve_reset_state") -
      Number(right.mutation?.activationRestoreMode === "preserve_reset_state") ||
    left.candidateKey.localeCompare(right.candidateKey));
  const publicCandidates = candidates.map(({ predecessorState: _state, ...candidate }) => candidate);
  const candidateSet = buildWarmachineReverseReachabilityCandidateSetV2(publicCandidates, {
    queryKey: String(rawOptions.queryKey ||
      `previous-turn:${successor.activeSideKey}:${successor.turnNumber}`),
    successorStateKey: String(successor.stateKey || ""),
    maximumCandidates: rawOptions.maximumCandidates ?? publicCandidates.length,
  });
  const core = {
    schemaVersion: WARMACHINE_PREVIOUS_TURN_END_PREDECESSOR_V1_SCHEMA,
    successorStateKey: String(successor.stateKey || ""),
    successorSemanticHash,
    strictCandidateCount: candidates.length,
    strictRejectedCount: rejected.length,
    unresolvedCount: unresolved.length,
    publicCandidates: stableGraphValue(publicCandidates),
    rejected: stableGraphValue(rejected),
    unresolved: stableGraphValue(unresolved),
    maintenanceResourcePreimageProposalUniverse: {
      declaredModes: resourcePreimages.map((row) => row.mode),
      exactOverAllPossiblePreimages: false,
      omittedAlternativesRecorded: rawOptions.recordMaintenanceResourcePreimageCoverageDebt === true,
    },
    candidateSet,
    oracleIsolationAudit: {
      inputKinds: ["control_phase_start_state"],
      openingRead: false,
      forwardRouteRead: false,
      intermediateStateRead: false,
      passed: true,
    },
    claimBoundary: "This inverse reconstructs only the immediately preceding end-turn state. It subtracts score solely from exact persisted current-settlement ledger rows, restores timing and activation reset fields, and accepts only a full strict end-turn successor match. Missing lifecycle/status history remains unresolved rather than ignored.",
  };
  return {
    ...core,
    candidates,
    runtimeDiagnostics,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: candidateSet.reachabilityContractOk && candidates.length > 0,
  };
}
