import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import {
  WARMACHINE_STEAMROLLER_TERMINAL_CLASS_KEYS_V1,
} from "../reverse/steamroller-terminal-scenario-corpus-v1.mjs";

export const WARMACHINE_SEARCH_CONSOLE_SCENARIO_COVERAGE_V1_SCHEMA =
  "warmachine_search_console_scenario_coverage_v1";

const TERMINAL_CLASS_LABELS = Object.freeze({
  unique_leader_assassination: "唯一 Leader 留场刺杀",
  simultaneous_leader_tiebreak: "双方 Leader 同时移除判定",
  lead_three_after_opponent_turn_scoring: "对手回合计分后领先 3 分",
  fixed_round_limit_result: "固定轮次结算",
});

function sumStringCounts(rows = [], key = "") {
  return String(rows.reduce((total, row) => total + BigInt(row[key] || 0), 0n));
}

function executionCountsForMass(totalMass = 0n, tasks = []) {
  const strictMaterialized = BigInt(tasks.filter((row) =>
    row.disposition === "strict_materialized").length);
  const strictRejected = BigInt(tasks.filter((row) =>
    row.disposition === "strict_rejected").length);
  if (strictMaterialized + strictRejected > totalMass) {
    throw new Error("search_console_execution_evidence_exceeds_corpus_mass");
  }
  return {
    strictMaterializedSubcellCount: String(strictMaterialized),
    strictRejectedSubcellCount: String(strictRejected),
    budgetDeferredSubcellCount: String(totalMass - strictMaterialized - strictRejected),
  };
}

function projectTerminalClass(cells = [], terminalClassKey = "", tasks = null) {
  const classCells = cells.filter((cell) => cell.terminalClassKey === terminalClassKey);
  const proposedSubcellCount = sumStringCounts(classCells, "subcellDenominator");
  const execution = tasks
    ? executionCountsForMass(
      BigInt(proposedSubcellCount),
      tasks.filter((row) => row.terminalClassKey === terminalClassKey),
    )
    : {
        strictMaterializedSubcellCount: sumStringCounts(
          classCells,
          "strictMaterializedSubcellCount",
        ),
        strictRejectedSubcellCount: sumStringCounts(
          classCells,
          "strictRejectedSubcellCount",
        ),
        budgetDeferredSubcellCount: sumStringCounts(
          classCells,
          "budgetDeferredSubcellCount",
        ),
      };
  return stableGraphValue({
    terminalClassKey,
    label: TERMINAL_CLASS_LABELS[terminalClassKey] || terminalClassKey,
    cellCount: classCells.length,
    sourceUnresolvedCellCount: classCells.filter((cell) =>
      cell.sourceResolutionStatus !== "officially_confirmed").length,
    proposedSubcellCount,
    ...execution,
  });
}

export function projectWarmachineSearchConsoleScenarioCoverageV1({
  corpus = {},
  presetCatalog = [],
  representativeSelection = null,
  representativeMaterializationLedger = null,
} = {}) {
  if (corpus.coverage?.denominatorComplete !== true) {
    throw new Error("search_console_scenario_coverage_denominator_incomplete");
  }
  if (representativeSelection && representativeSelection.corpusHash !== corpus.corpusHash) {
    throw new Error("search_console_representative_selection_corpus_mismatch");
  }
  if (representativeMaterializationLedger &&
      (representativeMaterializationLedger.corpusHash !== corpus.corpusHash ||
       representativeMaterializationLedger.selectionHash !== representativeSelection?.selectionHash)) {
    throw new Error("search_console_representative_materialization_ledger_mismatch");
  }
  const presetsByHostScenario = new Map((presetCatalog || []).map((scenario) => [
    scenario.hostScenarioKey || scenario.scenarioKey,
    scenario,
  ]));
  const scenarios = (corpus.scenarios || []).map((scenario) => {
    const cells = (corpus.cells || []).filter((cell) =>
      cell.scenarioKey === scenario.scenarioKey);
    const preset = presetsByHostScenario.get(scenario.scenarioKey);
    const victorySeeds = [...(preset?.victorySeeds || [])];
    const representatives = (representativeSelection?.selectedRepresentatives || [])
      .filter((row) => row.scenarioKey === scenario.scenarioKey);
    const representativeTasks = (representativeMaterializationLedger?.tasks || [])
      .filter((row) => row.scenarioKey === scenario.scenarioKey);
    const pendingRows = representativeTasks.length
      ? representativeTasks.filter((row) => ["proposed", "budget_deferred"].includes(
        row.disposition,
      ))
      : representatives;
    const proposedScenarioSubcellCount = sumStringCounts(cells, "subcellDenominator");
    const scenarioExecution = representativeTasks.length
      ? executionCountsForMass(BigInt(proposedScenarioSubcellCount), representativeTasks)
      : {
          strictMaterializedSubcellCount: sumStringCounts(
            cells,
            "strictMaterializedSubcellCount",
          ),
          strictRejectedSubcellCount: sumStringCounts(cells, "strictRejectedSubcellCount"),
          budgetDeferredSubcellCount: sumStringCounts(cells, "budgetDeferredSubcellCount"),
        };
    return stableGraphValue({
      scenarioKey: preset?.scenarioKey || scenario.scenarioKey,
      hostScenarioKey: scenario.scenarioKey,
      scenarioNumber: scenario.scenarioNumber,
      label: scenario.name,
      packet: preset?.packet || "Steamroller 2026",
      fixedRoundLimit: scenario.fixedRoundLimit,
      scoringSourceFamilies: scenario.scoringSourceFamilies,
      victorySeeds,
      runnablePresetCount: victorySeeds.length,
      runnable: victorySeeds.length > 0,
      coverage: {
        cellCount: cells.length,
        sourceUnresolvedCellCount: cells.filter((cell) =>
          cell.sourceResolutionStatus !== "officially_confirmed").length,
        selectedRepresentativeSubcellCount: representatives.length,
        strictMaterializedRepresentativeCount: representativeTasks.filter((row) =>
          row.disposition === "strict_materialized").length,
        strictRejectedRepresentativeCount: representativeTasks.filter((row) =>
          row.disposition === "strict_rejected").length,
        proposedRepresentativeCount: representativeTasks.filter((row) =>
          row.disposition === "proposed").length,
        budgetDeferredRepresentativeCount: representativeTasks.filter((row) =>
          row.disposition === "budget_deferred").length,
        strictMaterializationPendingRepresentativeCount: pendingRows.filter((row) =>
          row.expectedNextDisposition === "strict_materialization_pending").length,
        expectedStrictRejectRepresentativeCount: pendingRows.filter((row) =>
          row.expectedNextDisposition === "expected_strict_reject").length,
        unresolvedRepresentativeCount: representativeTasks.length
          ? representativeTasks.filter((row) => [
            "source_unresolved",
            "round_equivalence_unresolved",
          ].includes(row.disposition)).length
          : representatives.filter((row) => [
            "source_unresolved",
            "round_equivalence_unresolved",
          ].includes(row.expectedNextDisposition)).length,
        proposedSubcellCount: proposedScenarioSubcellCount,
        ...scenarioExecution,
        terminalClasses: WARMACHINE_STEAMROLLER_TERMINAL_CLASS_KEYS_V1.map((key) =>
          projectTerminalClass(cells, key, representativeTasks.length
            ? representativeTasks
            : null)),
      },
    });
  });
  const hostScenarioKeys = new Set(scenarios.map((scenario) => scenario.hostScenarioKey));
  const orphanPresetScenarioKeys = [...presetsByHostScenario.keys()].filter((scenarioKey) =>
    !hostScenarioKeys.has(scenarioKey));
  if (orphanPresetScenarioKeys.length) {
    throw new Error(
      `search_console_preset_scenario_missing_from_corpus:${orphanPresetScenarioKeys.sort().join(",")}`,
    );
  }
  const corpusMass = BigInt(corpus.counts?.proposedSubcellCount || 0);
  const globalExecution = representativeMaterializationLedger
    ? executionCountsForMass(corpusMass, representativeMaterializationLedger.tasks || [])
    : {
        strictMaterializedSubcellCount:
          corpus.counts?.strictMaterializedSubcellCount || "0",
        strictRejectedSubcellCount: corpus.counts?.strictRejectedSubcellCount || "0",
        budgetDeferredSubcellCount: corpus.counts?.budgetDeferredSubcellCount || "0",
      };
  const core = {
    schemaVersion: WARMACHINE_SEARCH_CONSOLE_SCENARIO_COVERAGE_V1_SCHEMA,
    corpusHash: corpus.corpusHash,
    scenarioCount: scenarios.length,
    runnableScenarioCount: scenarios.filter((scenario) => scenario.runnable).length,
    proposedSubcellCount: corpus.counts?.proposedSubcellCount || "0",
    ...globalExecution,
    sourceUnresolvedCellCount: corpus.counts?.sourceUnresolvedCellCount || 0,
    representativePlan: representativeSelection ? stableGraphValue({
      selectionHash: representativeSelection.selectionHash,
      selectedSkeletonCellCount:
        representativeSelection.skeletonCoverage?.selectedSkeletonCellCount || 0,
      selectedRepresentativeSubcellCount:
        representativeSelection.denominator?.selectedRepresentativeSubcellCount || "0",
      unselectedSubcellCount:
        representativeSelection.denominator?.unselectedSubcellCount ||
        corpus.counts?.proposedSubcellCount || "0",
      skeletonObligationCoverageComplete:
        representativeSelection.skeletonCoverage?.completeWithinDeclaredObligations === true,
      partitionValueCoverageComplete:
        representativeSelection.partitionValueCoverage?.completeWithinSelectedSkeletons === true,
      representativeDispositionCounts:
        representativeSelection.representativeDispositionCounts || {},
      executionLedgerHash: representativeMaterializationLedger?.ledgerHash || "",
      executionDispositionCounts:
        representativeMaterializationLedger?.dispositionCounts || {},
      remainingExpectedNextDispositionCounts:
        representativeMaterializationLedger?.remainingExpectedNextDispositionCounts || {},
      evidencePinCoverage: representativeSelection.evidencePinCoverage || null,
      interactionStrength: representativeSelection.policy?.interactionStrength || 0,
      eagerCartesianEnumerationUsed:
        representativeSelection.policy?.eagerCartesianEnumerationUsed === true,
    }) : null,
    scenarios,
    claimBoundary: "场景全集覆盖与可运行搜索根是两套独立状态。代表账本中的 current-Host strict materialized/rejected 证据会从全局预算质量中精确扣除；其余质量继续保持 deferred。只有带 victorySeeds 的场景可启动；覆盖单元在 strict 物化、反向搜索和独立重放前均不是可达性或训练真值。",
  };
  return stableGraphValue({
    ...core,
    coverageHash: stableGraphHash(core),
  });
}
