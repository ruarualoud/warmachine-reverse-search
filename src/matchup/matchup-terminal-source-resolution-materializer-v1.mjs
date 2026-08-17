import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineConstructionHost } from
  "../warmachine-construction-host-runtime.mjs";
import { warmachineHost } from "../warmachine-host-runtime.mjs";

export const WARMACHINE_MATCHUP_TERMINAL_SOURCE_RESOLUTION_REPORT_V1_SCHEMA =
  "warmachine_matchup_terminal_source_resolution_report_v1";

export function warmachineMatchupTerminalSourceResolutionUnresolvedV1(
  terminalTask = {},
) {
  return String(terminalTask.representative?.sourceResolutionStatus || "") !==
    "officially_confirmed";
}

function assertTaskOpeningBinding(terminalTask = {}, opening = {}) {
  const checks = [
    [opening.subjectRosterKey,
      terminalTask.executionEnvelope?.sourceRosterKeys?.subject],
    [opening.challengerRosterKey,
      terminalTask.executionEnvelope?.sourceRosterKeys?.challenger],
    [opening.scenarioKey, terminalTask.representative?.scenarioKey],
    [opening.mapKey, terminalTask.mapKey],
    [opening.deploymentSeedKey, terminalTask.deploymentSeedKey],
    [opening.firstPlayerTaskSideKey, terminalTask.firstPlayerTaskSideKey],
    [opening.strictOpeningStateHash, stableGraphHash(opening.state || {})],
  ];
  if (checks.some(([observed, expected]) => String(observed || "") !==
      String(expected || ""))) {
    throw new Error("matchup_terminal_source_resolution_opening_binding_invalid");
  }
}

export function materializeWarmachineMatchupSourceUnresolvedTerminalTaskV1(
  raw = {},
) {
  const terminalTask = raw.terminalTask || {};
  const opening = raw.opening || {};
  if (!terminalTask.taskKey || !terminalTask.representative?.subcellKey) {
    throw new Error("matchup_terminal_source_resolution_task_required");
  }
  if (!warmachineMatchupTerminalSourceResolutionUnresolvedV1(terminalTask)) {
    throw new Error("matchup_terminal_source_resolution_official_task_not_supported");
  }
  assertTaskOpeningBinding(terminalTask, opening);
  const canonical = terminalTask.representative.canonicalTerminal || {};
  const sourceResolutionStatus = String(
    terminalTask.representative.sourceResolutionStatus || "",
  );
  if (canonical.resultKind !== "tie" || canonical.winnerSideKey ||
      canonical.loserSideKey ||
      sourceResolutionStatus !==
        "official_second_tiebreak_still_tied_result_unresolved") {
    throw new Error("matchup_terminal_source_resolution_unrecognized_boundary");
  }
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_MATCHUP_TERMINAL_SOURCE_RESOLUTION_REPORT_V1_SCHEMA,
    terminalTaskKey: terminalTask.taskKey,
    representativeSubcellKey: terminalTask.representative.subcellKey,
    terminalClassKey: terminalTask.representative.terminalClassKey,
    scenarioKey: terminalTask.representative.scenarioKey,
    representativeRoundNumber: terminalTask.representative.roundNumber,
    sourceResolutionStatus,
    disposition: "rules_unknown",
    reason: "official_vp_and_scenario_presence_tiebreaks_still_equal_result_unresolved",
    authority: "steamroller_source_resolution_boundary",
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    constructionHostReceiptHash:
      warmachineConstructionHost.receipt.receiptHash,
    openingBinding: {
      openingKey: opening.openingKey,
      constructionOpeningKey: opening.constructionOpeningKey,
      strictOpeningStateHash: opening.strictOpeningStateHash,
      strictDeploymentReceiptHash: opening.strictDeploymentReceiptHash,
      scenarioBindingHash: opening.scenarioBindingHash,
    },
    hostExecutionAttempted: false,
    strictReplayCertified: false,
    matchupTerminalRootProven: false,
    deploymentToTerminalReachabilityProven: false,
    gameValueInterval: { lowerBound: 0, upperBound: 1 },
    naturalWinRate: null,
    trainingTruth: false,
    claimBoundary: "The official packet defines VP and Scenario Presence tiebreakers but does not resolve equality after both. This exact representative remains rules_unknown; its legal opening does not create a terminal result, reverse route, value or training label.",
  });
  return {
    report: { ...core, reportHash: stableGraphHash(core) },
    runtime: null,
  };
}

export function buildWarmachineMatchupSourceUnresolvedTerminalAdapterV1() {
  return Object.freeze({
    supports: ({ terminalTask } = {}) =>
      warmachineMatchupTerminalSourceResolutionUnresolvedV1(terminalTask),
    materialize: materializeWarmachineMatchupSourceUnresolvedTerminalTaskV1,
  });
}
