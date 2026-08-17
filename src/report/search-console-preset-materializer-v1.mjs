import { buildWarmachineFixedTerminalPositionCorpusV1 } from
  "../benchmark/fixed-terminal-position-corpus-v1.mjs";
import { buildWarmachineFixedTerminalScorePositionCorpusV1 } from
  "../benchmark/fixed-terminal-score-position-corpus-v1.mjs";
import { warmachineSteamroller2026OfficialScenarioLayoutV1 } from
  "../contracts/steamroller-2026-official-scenario-layout-v1.mjs";
import { stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  buildWarmachineScoreTerminalHypothesisCellFromMaterializedRootV1,
  materializeWarmachineSteamrollerScoreTerminalBatchV1,
} from "../reverse/steamroller-score-terminal-materialization-batch-v1.mjs";
import {
  buildWarmachineSteamrollerScoreTerminalAnchorProposalV1,
  WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_ROSTER_RECEIPT_V1,
} from "../reverse/steamroller-score-terminal-anchor-proposals-v1.mjs";
import { buildWarmachineSteamrollerTerminalScenarioCorpusV1 } from
  "../reverse/steamroller-terminal-scenario-corpus-v1.mjs";
import { findWarmachineSearchConsolePresetV1 } from "./search-console-presets-v1.mjs";

export const WARMACHINE_SEARCH_CONSOLE_PRESET_MATERIALIZER_V1_SCHEMA =
  "warmachine_search_console_preset_materializer_v1";
export const WARMACHINE_SEARCH_CONSOLE_PRESET_MATERIALIZER_REVISION_V1 =
  "2026-08-13-strict-score-history-and-scenario-partitions-2";

function rejectPreset(seed = {}, details = {}) {
  const error = new Error(details.reason || "search_console_preset_root_not_materialized");
  error.searchConsolePresetEvidence = { seed, ...details };
  throw error;
}

function prepareFixedRosterPreset(seed = {}, materializerKind = "", progress = null) {
  const common = {
    seed: seed.randomSeed,
    maximumProposals: 4,
    maximumMaterializedCells: 1,
    materializationAnchorKeys: [seed.anchorKey],
    positionAnchorKeys: [seed.anchorKey],
    onStrictReplayProgress: progress,
  };
  const corpus = materializerKind === "fixed_cryx_fane_score_v1"
    ? buildWarmachineFixedTerminalScorePositionCorpusV1(common)
    : buildWarmachineFixedTerminalPositionCorpusV1(common);
  const root = corpus.materialized.runtimeRoots[0];
  if (!root) rejectPreset(seed, {
    reason: "search_console_preset_root_not_materialized",
    proposedCellCount: corpus.positionDomain?.proposals?.length || 0,
    strictRejectedCount: corpus.materialized?.rejected?.length || 0,
    deferredCount: corpus.materialized?.deferred?.length || 0,
  });
  const cell = corpus.positionDomain.proposals.find((entry) => entry.cellKey === root.cellKey);
  if (!cell) rejectPreset(seed, { reason: "search_console_preset_terminal_cell_missing" });
  return {
    corpus: { terminalResourceAssumptions: corpus.terminalResourceAssumptions },
    root,
    cell,
    deployments: corpus.fixture.opening.room.deployments,
    materializationKind: materializerKind,
  };
}

function prepareSteamrollerScoreAnchorPreset(seed = {}, match = null) {
  const scenarioKey = match?.scenario?.hostScenarioKey || "";
  const proposal = buildWarmachineSteamrollerScoreTerminalAnchorProposalV1(scenarioKey);
  if (proposal.proposalKey !== seed.anchorKey) {
    rejectPreset(seed, { reason: "search_console_preset_anchor_proposal_mismatch" });
  }
  const corpus = buildWarmachineSteamrollerTerminalScenarioCorpusV1({
    rosterReceiptHash: WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_ROSTER_RECEIPT_V1,
  });
  const batch = materializeWarmachineSteamrollerScoreTerminalBatchV1({
    corpus,
    proposals: [proposal],
  });
  const root = batch.runtimeRoots[0];
  if (!root) rejectPreset(seed, {
    reason: "search_console_preset_score_anchor_not_materialized",
    materializationResults: batch.results,
  });
  const hypothesisCell = buildWarmachineScoreTerminalHypothesisCellFromMaterializedRootV1(root);
  const cell = stableGraphValue({
    ...hypothesisCell,
    rosterScope: "two_leader_micro",
    completionTarget: "prior_turn_frontier",
    historicalReachability: "strict_from_defender_round2_scoring_gate_only",
    legalDeploymentClaimAllowed: false,
  });
  if (Number(cell.roundNumber) !== Number(seed.roundNumber)) {
    rejectPreset(seed, {
      reason: "search_console_preset_round_mismatch",
      expectedRoundNumber: cell.roundNumber,
      observedRoundNumber: seed.roundNumber,
    });
  }
  const layout = warmachineSteamroller2026OfficialScenarioLayoutV1(scenarioKey);
  if (!layout?.deploymentGeometryExactWithinScope) {
    rejectPreset(seed, { reason: "search_console_preset_official_deployment_missing" });
  }
  return {
    corpus: {
      terminalResourceAssumptions: [],
      sourceCorpusHash: corpus.corpusHash,
      rosterReceiptHash: WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_ROSTER_RECEIPT_V1,
    },
    root,
    cell,
    deployments: layout.deployments,
    materializationKind: "steamroller_score_terminal_anchor_v1",
    materializationEvidence: batch.results[0],
  };
}

export function prepareWarmachineSearchConsolePresetV1(
  seed = {},
  { onStrictReplayProgress = null } = {},
) {
  const match = findWarmachineSearchConsolePresetV1(seed.presetKey);
  if (!match) rejectPreset(seed, { reason: "search_console_seed_preset_unknown" });
  const kind = String(match.victorySeed.materializerKind || "");
  if (kind === "steamroller_score_terminal_anchor_v1") {
    return prepareSteamrollerScoreAnchorPreset(seed, match);
  }
  if (["fixed_cryx_fane_assassination_v1", "fixed_cryx_fane_score_v1"].includes(kind)) {
    return prepareFixedRosterPreset(seed, kind, onStrictReplayProgress);
  }
  rejectPreset(seed, { reason: `search_console_preset_materializer_unknown:${kind}` });
}
