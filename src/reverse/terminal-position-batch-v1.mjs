import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { warmachineHost } from "../warmachine-host-runtime.mjs";
import { generateWarmachineTerminalPositionDomainV1 } from
  "./terminal-position-domain-v1.mjs";
import { searchWarmachineTerminalRootedToDeploymentV1 } from
  "./terminal-rooted-to-deployment-v1.mjs";
import { materializeWarmachineTerminalSpatialCellsV1 } from
  "./terminal-spatial-materializer-v1.mjs";

export const WARMACHINE_TERMINAL_POSITION_BATCH_V1_SCHEMA =
  "warmachine_terminal_position_batch_v1";

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function publicSearchReport(search = {}) {
  const {
    routes: _routes,
    runtimeDiagnostics: _runtimeDiagnostics,
    ...report
  } = search;
  return stableGraphValue(report);
}

function terminalActionForCell(cell = {}, rawOptions = {}) {
  return rawOptions.terminalActionByCellKey?.[cell.cellKey] ||
    rawOptions.terminalActionByParentCellKey?.[cell.parentTerminalCellKey] ||
    rawOptions.terminalAction || null;
}

export function runWarmachineTerminalPositionBatchV1(
  stateTemplateInput = {},
  terminalCellsInput = [],
  rawOptions = {},
) {
  const positionDomain = generateWarmachineTerminalPositionDomainV1(
    stateTemplateInput,
    terminalCellsInput,
    rawOptions.positionDomainOptions || {},
  );
  const terminalActionByCellKey = Object.fromEntries(positionDomain.proposals
    .map((cell) => [cell.cellKey, terminalActionForCell(cell, rawOptions)])
    .filter(([, action]) => action));
  const materialization = materializeWarmachineTerminalSpatialCellsV1(
    stateTemplateInput,
    positionDomain.proposals,
    {
      ...(rawOptions.materializationOptions || {}),
      terminalActionByCellKey,
    },
  );
  const maximumSearches = Math.max(0, Math.floor(numeric(
    rawOptions.maximumSearches,
    materialization.runtimeRoots.length,
  )));
  const cellByKey = new Map(positionDomain.proposals.map((cell) => [cell.cellKey, cell]));
  const searchRows = [];
  const runtimeSearches = [];
  const searchDeferred = [];
  const sortedRoots = [...materialization.runtimeRoots]
    .sort((left, right) => left.cellKey.localeCompare(right.cellKey));
  for (const [index, root] of sortedRoots.entries()) {
    if (index >= maximumSearches) {
      searchDeferred.push({
        cellKey: root.cellKey,
        rootKey: root.rootKey,
        reason: "terminal_position_reverse_search_budget_exhausted",
      });
      continue;
    }
    const cell = cellByKey.get(root.cellKey);
    if (!cell) {
      searchDeferred.push({
        cellKey: root.cellKey,
        rootKey: root.rootKey,
        reason: "terminal_position_materialized_cell_identity_missing",
      });
      continue;
    }
    rawOptions.onProgress?.({
      schemaVersion: "warmachine_terminal_position_batch_progress_v1",
      stage: "position_search_started",
      cellKey: cell.cellKey,
      positionSearchIndex: index,
      positionSearchCount: Math.min(maximumSearches, sortedRoots.length),
    });
    const search = searchWarmachineTerminalRootedToDeploymentV1(
      root.terminalState,
      cell,
      {
        ...(rawOptions.reverseSearchOptions || {}),
        onProgress: rawOptions.onReverseSearchProgress
          ? (event) => rawOptions.onReverseSearchProgress({ cellKey: cell.cellKey, ...event })
          : undefined,
      },
    );
    const row = {
      cellKey: cell.cellKey,
      parentTerminalCellKey: String(cell.parentTerminalCellKey || ""),
      rootKey: root.rootKey,
      terminalStateHash: root.terminalStateHash,
      positionSearchIndex: index,
      disposition: search.legalDeploymentRouteCount > 0
        ? "legal_deployment_route_found"
        : "searched_no_legal_deployment_route_yet",
      legalDeploymentRouteCount: search.legalDeploymentRouteCount,
      fullRouteStrictReplayCertifiedCount: search.fullRouteStrictReplayCertifiedCount,
      unresolvedCount: search.unresolvedCount,
      rejectedBranchCount: search.rejectedBranchCount,
      searchReportHash: search.reportHash,
      searchReport: publicSearchReport(search),
    };
    searchRows.push(stableGraphValue(row));
    runtimeSearches.push({ cell, root, search });
    rawOptions.onProgress?.({
      schemaVersion: "warmachine_terminal_position_batch_progress_v1",
      stage: "position_search_completed",
      cellKey: cell.cellKey,
      positionSearchIndex: index,
      disposition: row.disposition,
      legalDeploymentRouteCount: row.legalDeploymentRouteCount,
    });
  }
  const materializedByKey = new Set(materialization.roots.map((root) => root.cellKey));
  const searchedByKey = new Map(searchRows.map((row) => [row.cellKey, row]));
  const materializationRejectedByKey = new Map(materialization.rejected.map((row) => [
    row.cellKey,
    row,
  ]));
  const materializationDeferredByKey = new Map(materialization.deferred.map((row) => [
    row.cellKey,
    row,
  ]));
  const searchDeferredByKey = new Map(searchDeferred.map((row) => [row.cellKey, row]));
  const dispositionLedger = positionDomain.proposals.map((cell) => {
    const searched = searchedByKey.get(cell.cellKey);
    const materializationRejected = materializationRejectedByKey.get(cell.cellKey);
    const materializationDeferred = materializationDeferredByKey.get(cell.cellKey);
    const deferredSearch = searchDeferredByKey.get(cell.cellKey);
    return stableGraphValue({
      cellKey: cell.cellKey,
      parentTerminalCellKey: String(cell.parentTerminalCellKey || ""),
      proposed: true,
      strictMaterialized: materializedByKey.has(cell.cellKey),
      reverseSearched: Boolean(searched),
      disposition: searched?.disposition ||
        (materializationRejected ? "materialization_rejected" :
          materializationDeferred ? "materialization_budget_deferred" :
            deferredSearch ? "reverse_search_budget_deferred" :
              "materialization_not_accounted"),
      reason: materializationRejected?.reason || materializationDeferred?.reason ||
        deferredSearch?.reason || "",
    });
  });
  const proposedAccountedCount = dispositionLedger.filter((row) =>
    row.disposition !== "materialization_not_accounted").length;
  const core = {
    schemaVersion: WARMACHINE_TERMINAL_POSITION_BATCH_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    parentCellCount: positionDomain.parentCellCount,
    positionConsideredCount: positionDomain.consideredCount,
    positionProposedCount: positionDomain.proposedCount,
    positionGenerationRejectedCount: positionDomain.rejectedCount,
    positionGenerationDeferredCount: positionDomain.deferredCount,
    strictMaterializedCount: materialization.strictMaterializedCount,
    materializationRejectedCount: materialization.rejectedCount,
    materializationDeferredCount: materialization.deferredCount,
    reverseSearchedCount: searchRows.length,
    reverseSearchDeferredCount: searchDeferred.length,
    legalDeploymentPositionCount: searchRows.filter((row) =>
      row.legalDeploymentRouteCount > 0).length,
    strictReplayCertifiedPositionCount: searchRows.filter((row) =>
      row.fullRouteStrictReplayCertifiedCount > 0).length,
    proposedAccountedCount,
    proposedDenominatorComplete: proposedAccountedCount === positionDomain.proposedCount,
    fullGenerationAndSearchDenominatorComplete:
      positionDomain.deferredCount === 0 &&
      materialization.deferredCount === 0 &&
      searchDeferred.length === 0 &&
      proposedAccountedCount === positionDomain.proposedCount,
    positionDomainReportHash: positionDomain.reportHash,
    materializationReportHash: materialization.reportHash,
    searchRows: stableGraphValue(searchRows),
    generationRejected: stableGraphValue(positionDomain.rejected),
    generationDeferred: stableGraphValue(positionDomain.deferred),
    materializationRejected: stableGraphValue(materialization.rejected),
    materializationDeferred: stableGraphValue(materialization.deferred),
    searchDeferred: stableGraphValue(searchDeferred),
    dispositionLedger: stableGraphValue(dispositionLedger),
    oracleIsolationAudit: {
      ...positionDomain.oracleIsolationAudit,
      searchStartsFromStrictMaterializedLaterRoundRoot: true,
      deploymentUsedOnlyAsReverseEndpointAudit: true,
      passed: positionDomain.oracleIsolationAudit.passed === true,
    },
    trainingTruth: false,
    claimBoundary: "Every strict-materialized later-round coordinate cell is an independent reverse-search root. Deployment geometry is consulted only by the terminal-to-deployment endpoint audit. A found route proves one cell's reachability witness; rejected, unresolved and budget-deferred cells remain separate denominator entries and no unsearched cell inherits another cell's result.",
  };
  return {
    ...core,
    positionDomain,
    materialization,
    runtimeSearches,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: searchRows.length > 0 && proposedAccountedCount === positionDomain.proposedCount,
  };
}
