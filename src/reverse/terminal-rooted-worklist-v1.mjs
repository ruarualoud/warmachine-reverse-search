import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineHost } from "../warmachine-host-runtime.mjs";
import { generateWarmachineControlPhasePredecessorsV1 } from
  "./control-phase-predecessor-v1.mjs";
import {
  reverseWarmachinePassActivationSequenceV1,
} from "./pass-activation-predecessor-v1.mjs";
import { generateWarmachinePreviousTurnEndPredecessorsV1 } from
  "./previous-turn-end-predecessor-v1.mjs";
import { buildWarmachineReverseReachabilityCandidateSetV2 } from
  "./reachability-contract-v2.mjs";
import {
  generateWarmachineTerminalEventPredecessorsV1,
  warmachineReverseStateSemanticHashV1,
} from "./terminal-event-predecessor-v1.mjs";

export const WARMACHINE_TERMINAL_ROOTED_WORKLIST_V1_SCHEMA =
  "warmachine_terminal_rooted_worklist_v1";

function edgeFromCandidate(candidate = {}, layerKey = "") {
  return {
    layerKey,
    operatorKey: String(candidate.operatorKey || ""),
    predecessorStateKey: String(candidate.predecessorStateKey || ""),
    predecessorStateHash: String(candidate.predecessorStateHash || ""),
    successorStateKey: String(candidate.successorStateKey || ""),
    successorStateHash: String(candidate.successorStateHash || ""),
    transitionActionKey: String(candidate.transitionActionKey || ""),
    strictReceiptHash: String(candidate.strictReceiptHash || ""),
    strictStepReceiptHashes: stableGraphValue(candidate.strictStepReceiptHashes || []),
    strictWitness: candidate.strictWitness === true,
  };
}

function passEdges(sequence = {}, layerKey = "") {
  return (sequence.runtimeBoundaries || []).flatMap(() => []);
}

function unresolvedRecord(stageKey, stateHash, report = {}, extra = {}) {
  return {
    stageKey,
    stateHash: String(stateHash || ""),
    reason: report.unresolvedCount > 0
      ? `${stageKey}_contains_unresolved_branches`
      : report.strictRejectedCount > 0
        ? `${stageKey}_strict_candidates_rejected`
        : `${stageKey}_no_reverse_candidate`,
    strictRejectedCount: Number(report.strictRejectedCount || 0),
    unresolvedCount: Number(report.unresolvedCount || 0),
    rejected: stableGraphValue(report.rejected || []),
    unresolved: stableGraphValue(report.unresolved || []),
    ...extra,
  };
}

function sequenceBoundaryRows(sequence = {}, layerKey = "") {
  return (sequence.runtimeBoundaries || []).map((boundary) => ({
    state: boundary.state,
    stateKey: String(boundary.state.stateKey || ""),
    stateHash: warmachineReverseStateSemanticHashV1(boundary.state),
    edges: (boundary.reverseEdges || []).map((edge) => ({
      layerKey,
      operatorKey: "pass_activation_inverse_v1",
      predecessorStateKey: "",
      predecessorStateHash: edge.predecessorStateHash,
      successorStateKey: "",
      successorStateHash: edge.successorStateHash,
      transitionActionKey: edge.transitionActionKey,
      strictReceiptHash: edge.strictReceiptHash,
      strictStepReceiptHashes: [],
      strictWitness: true,
      actorPieceKey: edge.actorPieceKey,
    })),
    reverseDepth: boundary.depth,
  }));
}

export function searchWarmachineTerminalRootedOpponentTurnV1(
  terminalStateInput = {},
  terminalCell = {},
  rawOptions = {},
) {
  const maximumRoutes = Math.max(1, Number(rawOptions.maximumRoutes || 1_000));
  const terminal = generateWarmachineTerminalEventPredecessorsV1(
    terminalStateInput,
    terminalCell,
    rawOptions.terminalEventOptions || {},
  );
  const unresolved = [];
  const routes = [];
  if (!terminal.candidates.length) {
    unresolved.push(unresolvedRecord(
      "terminal_event",
      terminal.successorSemanticHash,
      terminal,
    ));
  }
  for (const terminalCandidate of terminal.candidates) {
    const currentSideKey = terminalCell.endingSideKey;
    const currentActivation = reverseWarmachinePassActivationSequenceV1(
      terminalCandidate.predecessorState,
      {
        sideKey: currentSideKey,
        maximumDepth: rawOptions.maximumActivationDepth,
        maximumStates: rawOptions.maximumActivationStates,
        queryKey: `${terminalCell.cellKey}:current-activation`,
      },
    );
    if (!currentActivation.runtimeBoundaries.length) {
      unresolved.push({
        stageKey: "current_activation",
        stateHash: terminalCandidate.predecessorStateHash,
        reason: "current_activation_requires_non_pass_inverse",
        unresolved: stableGraphValue(currentActivation.unresolved || []),
      });
      continue;
    }
    for (const currentBoundary of sequenceBoundaryRows(
      currentActivation,
      "current_activation",
    )) {
      const currentControl = generateWarmachineControlPhasePredecessorsV1(
        currentBoundary.state,
        {
          resourceEnvelopeKey: String(rawOptions.resourceEnvelopeKey || "unchanged"),
          maximumControlSteps: rawOptions.maximumControlSteps,
          queryKey: `${terminalCell.cellKey}:current-control`,
        },
      );
      if (!currentControl.candidates.length) {
        unresolved.push(unresolvedRecord(
          "current_control",
          currentBoundary.stateHash,
          currentControl,
        ));
        continue;
      }
      for (const controlCandidate of currentControl.candidates) {
        const previousEnd = generateWarmachinePreviousTurnEndPredecessorsV1(
          controlCandidate.predecessorState,
          { queryKey: `${terminalCell.cellKey}:previous-end` },
        );
        if (!previousEnd.candidates.length) {
          unresolved.push(unresolvedRecord(
            "previous_turn_end",
            controlCandidate.predecessorStateHash,
            previousEnd,
          ));
          continue;
        }
        for (const previousEndCandidate of previousEnd.candidates) {
          const opponentSideKey = previousEndCandidate.endingSideKey;
          const opponentActivation = reverseWarmachinePassActivationSequenceV1(
            previousEndCandidate.predecessorState,
            {
              sideKey: opponentSideKey,
              maximumDepth: rawOptions.maximumOpponentActivationDepth,
              maximumStates: rawOptions.maximumOpponentActivationStates,
              queryKey: `${terminalCell.cellKey}:opponent-activation`,
            },
          );
          if (!opponentActivation.runtimeBoundaries.length) {
            unresolved.push({
              stageKey: "opponent_activation",
              stateHash: previousEndCandidate.predecessorStateHash,
              reason: "opponent_activation_requires_non_pass_inverse",
              unresolved: stableGraphValue(opponentActivation.unresolved || []),
            });
            continue;
          }
          for (const opponentBoundary of sequenceBoundaryRows(
            opponentActivation,
            "opponent_activation",
          )) {
            const opponentControl = generateWarmachineControlPhasePredecessorsV1(
              opponentBoundary.state,
              {
                resourceEnvelopeKey: String(rawOptions.resourceEnvelopeKey || "unchanged"),
                maximumControlSteps: rawOptions.maximumControlSteps,
                queryKey: `${terminalCell.cellKey}:opponent-control`,
              },
            );
            if (!opponentControl.candidates.length) {
              unresolved.push(unresolvedRecord(
                "opponent_control",
                opponentBoundary.stateHash,
                opponentControl,
              ));
              continue;
            }
            for (const opponentControlCandidate of opponentControl.candidates) {
              if (routes.length >= maximumRoutes) {
                unresolved.push({
                  stageKey: "route_output",
                  stateHash: opponentControlCandidate.predecessorStateHash,
                  reason: "terminal_rooted_route_budget_exhausted",
                });
                continue;
              }
              const reverseEdges = [
                edgeFromCandidate(terminalCandidate, "victory_event"),
                ...currentBoundary.edges,
                edgeFromCandidate(controlCandidate, "current_control"),
                edgeFromCandidate(previousEndCandidate, "previous_turn_end"),
                ...opponentBoundary.edges,
                edgeFromCandidate(opponentControlCandidate, "opponent_control"),
              ];
              const strictReceiptHashes = [...new Set(reverseEdges.flatMap((edge) => [
                edge.strictReceiptHash,
                ...(edge.strictStepReceiptHashes || []),
              ]).filter(Boolean))].sort();
              const core = {
                candidateKind: "terminal_rooted_complete_opponent_turn_predecessor",
                successorKind: `${terminalCell.goalType}_terminal`,
                predecessorKind: "opponent_control_phase_start",
                terminalCellKey: terminalCell.cellKey,
                terminalStateHash: terminal.successorSemanticHash,
                predecessorStateKey: opponentControlCandidate.predecessorStateKey,
                predecessorStateHash: opponentControlCandidate.predecessorStateHash,
                successorStateKey: String(terminalStateInput.stateKey || ""),
                successorStateHash: terminal.successorSemanticHash,
                transitionActionKey: terminalCandidate.transitionActionKey,
                endingSideKey: currentSideKey,
                opponentSideKey,
                reverseEdges: stableGraphValue(reverseEdges),
                reverseLayerKeys: reverseEdges.map((edge) => edge.layerKey),
                strictReceiptHashes,
                strictReceiptHash: strictReceiptHashes[0] || "",
                strictWitness: reverseEdges.every((edge) => edge.strictWitness === true),
                strictRejected: false,
                unresolvedReasons: [],
                completeOpponentTurnRecovered: true,
                legalDeploymentReached: false,
                trainingTruth: false,
                provenance: {
                  upstreamReceiptHash: warmachineHost.receipt.receiptHash,
                  oracleOpeningRead: false,
                  oracleRouteRead: false,
                  oracleIntermediateStateRead: false,
                },
              };
              routes.push({
                ...core,
                candidateKey: `terminal-rooted-route-${stableGraphHash(core, 32)}`,
                predecessorState: opponentControlCandidate.predecessorState,
              });
            }
          }
        }
      }
    }
  }
  routes.sort((left, right) => left.candidateKey.localeCompare(right.candidateKey));
  const publicCandidates = routes.map(({ predecessorState: _state, ...candidate }) => candidate);
  const candidateSet = buildWarmachineReverseReachabilityCandidateSetV2(publicCandidates, {
    queryKey: terminalCell.cellKey,
    successorStateKey: String(terminalStateInput.stateKey || ""),
    maximumCandidates: publicCandidates.length,
  });
  const core = {
    schemaVersion: WARMACHINE_TERMINAL_ROOTED_WORKLIST_V1_SCHEMA,
    terminalCellKey: terminalCell.cellKey,
    terminalGoalType: terminalCell.goalType,
    terminalStateHash: terminal.successorSemanticHash,
    routeCount: routes.length,
    unresolvedCount: unresolved.length,
    publicCandidates: stableGraphValue(publicCandidates),
    unresolved: stableGraphValue(unresolved),
    candidateSet,
    oracleIsolationAudit: {
      inputKinds: ["terminal_state", "terminal_hypothesis_cell", "reverse_budgets"],
      openingRead: false,
      forwardRouteRead: false,
      intermediateStateRead: false,
      passed: terminal.oracleIsolationAudit.passed === true,
    },
    claimBoundary: "This terminal-rooted worklist reverses one current terminal-bearing turn segment plus one complete opponent turn only for activations whose side effects are exact strict pass transitions. Every other activation family remains unresolved. Reaching the opponent control start is not legal-deployment reachability, training truth, strategy robustness or optimality.",
  };
  return {
    ...core,
    routes,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: candidateSet.reachabilityContractOk && routes.length > 0,
  };
}
