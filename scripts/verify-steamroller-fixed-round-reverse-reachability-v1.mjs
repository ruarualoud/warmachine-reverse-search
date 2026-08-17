import assert from "node:assert/strict";

import {
  WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_LAYOUTS_V1,
} from "../src/contracts/steamroller-2026-official-scenario-layout-v1.mjs";
import { replayWarmachineTerminalReverseRouteV1 } from
  "../src/reverse/replay-terminal-reverse-route-v1.mjs";
import {
  buildWarmachineFixedRoundTerminalHypothesisCellFromEvidenceV1,
  buildWarmachineSteamrollerFixedRoundTerminalAnchorEvidenceV1,
} from "../src/reverse/steamroller-fixed-round-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1 } from
  "../src/reverse/steamroller-terminal-execution-roster-witness-v1.mjs";
import { generateWarmachineTerminalEventPredecessorsV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";
import { searchWarmachineTerminalRootedToDeploymentV1 } from
  "../src/reverse/terminal-rooted-to-deployment-v1.mjs";

const scenarioKey = "trench_warfare";
const scoreAnchors = buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1();
const fixed = buildWarmachineSteamrollerFixedRoundTerminalAnchorEvidenceV1({
  corpus: scoreAnchors.corpus,
  rosterWitness: buildWarmachineSteamrollerTerminalExecutionRosterWitnessV1(),
  scenarioProposals: scoreAnchors.proposals,
  scenarioKeys: [scenarioKey],
});
const runtimeRoot = fixed.runtime[0];
const terminalCell =
  buildWarmachineFixedRoundTerminalHypothesisCellFromEvidenceV1(runtimeRoot);
const terminalOptions = {
  terminalActionTypes: ["end_turn"],
  maximumTerminalActions: 1,
  resourcePreimagePointsByPieceKey: runtimeRoot.publicRoot.resourceBefore,
};
const terminal = generateWarmachineTerminalEventPredecessorsV1(
  runtimeRoot.primary.transition.nextState,
  terminalCell,
  terminalOptions,
);

assert.equal(terminal.strictCandidateCount, 1, JSON.stringify(terminal.unresolved));
assert.equal(terminal.strictRejectedCount, 0, JSON.stringify(terminal.rejected));
assert.equal(terminal.unresolvedCount, 0, JSON.stringify(terminal.unresolved));
assert.equal(terminal.candidates[0].operatorKey, "fixed_round_turn_end_inverse_v1");
assert.deepEqual(terminal.candidates[0].matchedProbability, {
  numerator: "1",
  denominator: "1",
  decimal: 1,
});
assert.equal(terminal.candidates[0].strictReplaySteps[0].actionType, "end_turn");

let fullTurn = null;
if (process.argv.includes("--full-turn")) {
  const activationGroupKey = (piece = {}) => String(
    piece.unitGroupId || piece.unitId || piece.metadata?.unitGroupId ||
    piece.metadata?.unitId || piece.pieceKey,
  );
  const activationGroupOrderKeysBySide = Object.fromEntries(
    ["player1", "player2"].map((sideKey) => [
      sideKey,
      [...new Set(runtimeRoot.state.pieces.filter((piece) =>
        piece.sideKey === sideKey).map(activationGroupKey))].sort(),
    ]),
  );
  const search = searchWarmachineTerminalRootedToDeploymentV1(
    runtimeRoot.primary.transition.nextState,
    terminalCell,
    {
      deployments:
        WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_LAYOUTS_V1[scenarioKey]
          .deployments,
      firstPlayerSideKey: "player1",
      terminalEventOptions: terminalOptions,
      maximumReverseTurns: 1,
      maximumRouteLabels: 6,
      maximumUniqueStates: 6,
      maximumCompletedRoutes: 1,
      maximumActivationDepth: 128,
      maximumActivationLabels: 128,
      maximumActivationUniqueStates: 128,
      maximumActivationGroupsPerExpansion: 1,
      maximumActivationCandidatesPerExpansion: 1,
      maximumActivationPassActorsPerExpansion: 1,
      stopAfterActivationBoundaryRouteCount: 1,
      activationGroupOrderKeys: activationGroupOrderKeysBySide.player2,
      activationGroupOrderKeysBySide,
      includeMovement: false,
      includePass: true,
      resourceEnvelopeModes: ["unchanged"],
      controlResidueModes: ["empty_previous_control"],
      nextSideActivationRestoreModes: ["all_alive_activated"],
      maximumControlSteps: 128,
    },
  );
  assert.equal(search.runtimeReachedPriorTurnFrontiers.length, 1,
    JSON.stringify({ rejected: search.rejected, unresolved: search.unresolved }));
  const frontier = search.runtimeReachedPriorTurnFrontiers[0];
  assert.equal(frontier.reversedPriorTurnCount, 1);
  assert.equal(frontier.state.turnNumber, 7);
  assert.equal(frontier.state.activeSideKey, "player1");
  assert.equal(frontier.state.phaseKey, "control");
  const replay = replayWarmachineTerminalReverseRouteV1({
    candidateKey: "fixed-round-trench-warfare-one-prior-turn-v1",
    predecessorState: frontier.state,
    predecessorStateHash: frontier.stateHash,
    reverseEdges: frontier.reverseEdges,
  }, runtimeRoot.primary.transition.nextState, {
    routeKey: "verify-fixed-round-trench-warfare-one-prior-turn-v1",
    maximumControlSteps: 128,
  });
  assert.equal(replay.fullRouteStrictReplayCertified, true,
    JSON.stringify(replay.failures));
  fullTurn = {
    reachedPriorTurnFrontierCount: search.reachedPriorTurnFrontierCount,
    activationGroupCountBySide: Object.fromEntries(Object.entries(
      activationGroupOrderKeysBySide,
    ).map(([sideKey, keys]) => [sideKey, keys.length])),
    reverseOperatorKeys: search.reachedPriorTurnFrontiers[0]
      .incrementalReverseOperatorKeys,
    fullRouteStrictReplayCertified: replay.fullRouteStrictReplayCertified,
    rejectedBranchCount: search.rejectedBranchCount,
    unresolvedReasonKeys: [...new Set(search.unresolved.map((row) => row.reason))]
      .sort(),
  };
}

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_steamroller_fixed_round_reverse_reachability_v1",
  scenarioKey,
  terminalEventPredecessorCount: terminal.strictCandidateCount,
  operatorKey: terminal.candidates[0].operatorKey,
  matchedProbability: terminal.candidates[0].matchedProbability,
  fullTurnRequested: process.argv.includes("--full-turn"),
  fullTurn,
}, null, 2));
