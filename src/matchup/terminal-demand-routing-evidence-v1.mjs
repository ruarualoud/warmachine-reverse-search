import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_TERMINAL_DEMAND_ROUTING_EVIDENCE_V1_SCHEMA =
  "warmachine_terminal_demand_routing_evidence_v1";

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function candidateRejectedCount(report = {}) {
  return (report.attempts || []).reduce((sum, attempt) =>
    sum + numeric(attempt.materialization?.dispositionCounts?.strict_rejected), 0);
}

export function buildWarmachineTerminalDemandRoutingEvidenceV1(raw = {}) {
  const routing = raw.routing || {};
  const reports = Array.isArray(raw.terminalRootReports)
    ? raw.terminalRootReports
    : [raw.terminalRootReports].filter(Boolean);
  const routedGroupsByKey = new Map((routing.routedGroups || []).map((group) => [
    String(group.groupKey || ""),
    group,
  ]));
  const evidenceGroups = reports.map((report) => {
    const group = routedGroupsByKey.get(String(report.routingGroupKey || ""));
    if (!group) {
      throw new Error(`terminal_demand_evidence_group_missing:${report.routingGroupKey}`);
    }
    const binding = report.representativeBinding || {};
    if (!group.representativeKeys?.includes(binding.subcellKey)) {
      throw new Error(`terminal_demand_evidence_representative_mismatch:${
        binding.subcellKey}`);
    }
    const taskRosterTerminalRouteProven =
      report.matchupTerminalRootProven === true &&
      report.taskRosterTerminalRouteProven === true &&
      binding.bindingProven === true &&
      report.independentReplayEvidence?.independentStrictReplayProven === true;
    const representativeEvidence = group.representativeKeys.map((subcellKey) => {
      const selected = subcellKey === binding.subcellKey;
      return stableGraphValue({
        subcellKey,
        cellKey: selected ? binding.cellKey : "",
        taskRosterTerminalRootProven: selected && taskRosterTerminalRouteProven,
        strictTerminalRootCount: selected && taskRosterTerminalRouteProven ? 1 : 0,
        deploymentToTerminalReachabilityProven: false,
        strictReachableRouteCount: 0,
        unresolvedRouteCount: 1,
        terminalRootReportHash: selected ? String(report.reportHash || "") : "",
        independentReplayHash: selected
          ? String(report.independentReplayEvidence?.independentReplayHash || "")
          : "",
      });
    });
    const core = stableGraphValue({
      groupKey: group.groupKey,
      baseRoutingGroupHash: group.routingGroupHash,
      constructionMacroProfileKey: group.constructionMacroProfileKey,
      representativeCount: group.representativeCount,
      representativeEvidence,
      strictTerminalRootCount: representativeEvidence.reduce((sum, row) =>
        sum + row.strictTerminalRootCount, 0),
      strictReachableRouteCount: 0,
      strictRejectedRouteCount: 0,
      strictRejectedCandidateCount: candidateRejectedCount(report),
      unresolvedRouteCount: group.representativeCount,
      taskRosterTerminalRouteProven,
      deploymentToTerminalReachabilityProven: false,
      rulesEngineCapabilityEvidenceUnchanged: true,
      genericCapabilityPinMatchupRosterRouteProven:
        group.rulesEngineCapabilityEvidence?.matchupRosterRouteProven === true,
      gameValueInterval: { lowerBound: 0, upperBound: 1 },
      naturalWinRate: null,
      trainingTruth: false,
    });
    return { ...core, evidenceGroupHash: stableGraphHash(core) };
  });
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_TERMINAL_DEMAND_ROUTING_EVIDENCE_V1_SCHEMA,
    taskHash: String(routing.taskHash || ""),
    baseRoutingHash: String(routing.routingHash || ""),
    evidenceGroups,
    counts: {
      evaluatedGroupCount: evidenceGroups.length,
      strictTerminalRootCount: evidenceGroups.reduce((sum, group) =>
        sum + group.strictTerminalRootCount, 0),
      strictReachableRouteCount: 0,
      strictRejectedRouteCount: 0,
      unresolvedRouteCount: evidenceGroups.reduce((sum, group) =>
        sum + group.unresolvedRouteCount, 0),
    },
    baseRoutingMutated: false,
    deploymentToTerminalReachabilityProven: false,
    naturalWinRateClaimed: false,
    globalOptimalityProven: false,
    trainingTruth: false,
    claimBoundary: "This append-only overlay records task-roster terminal roots separately from deployment reachability. A strict independently replayed terminal action increments terminal-root evidence only; every representative remains unresolved until reverse history reaches a legal opening and independently replays the full route.",
  });
  return { ...core, evidenceHash: stableGraphHash(core) };
}
