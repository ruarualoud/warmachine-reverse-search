import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_TERMINAL_DEMAND_ROSTER_ROUTING_V1_SCHEMA =
  "warmachine_terminal_demand_roster_routing_v1";

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function goalAllowed(task = {}, goalFamily = "") {
  const goals = new Set(task.terminalGoalTypes || []);
  if (["assassination", "simultaneous_leader_tiebreak"].includes(goalFamily)) {
    return goals.has("assassination");
  }
  if (["scenario_score_threshold", "fixed_round_tiebreak"].includes(goalFamily)) {
    return goals.has("scenario_score");
  }
  return false;
}

function roundAllowed(task = {}, group = {}) {
  const minimum = numeric(task.horizon?.minimumTerminalRound, 1);
  const maximum = numeric(task.horizon?.maximumTerminalRound, minimum);
  if (!group.exactRoundNumbers?.length) return true;
  return group.exactRoundNumbers.some((round) => round >= minimum && round <= maximum);
}

function dispositionPriority(counts = {}) {
  if (numeric(counts.strict_materialization_pending) > 0) return 0;
  if (numeric(counts.round_equivalence_unresolved) > 0) return 1;
  if (numeric(counts.expected_strict_reject) > 0) return 2;
  if (numeric(counts.source_unresolved) > 0) return 3;
  return 4;
}

function goalPriority(goalFamily = "") {
  return {
    assassination: 0,
    scenario_score_threshold: 1,
    simultaneous_leader_tiebreak: 2,
    fixed_round_tiebreak: 3,
  }[goalFamily] ?? 4;
}

function roundPriority(roundBand = "") {
  return {
    early_round_2_3: 0,
    middle_round_4_5: 1,
    late_round_6_plus: 2,
    symbolic_later_round: 3,
  }[roundBand] ?? 4;
}

function rosterRank(rows = [], profileKey = "", maximum = 4) {
  return [...rows].sort((left, right) =>
    numeric(right.constructionGoalScores?.[profileKey]) -
      numeric(left.constructionGoalScores?.[profileKey]) ||
    String(left.key || left.rosterKey).localeCompare(String(right.key || right.rosterKey)))
    .slice(0, maximum)
    .map((roster) => ({
      rosterKey: String(roster.key || roster.rosterKey || ""),
      sourceListKey: String(roster.sourceListKey || roster.key || ""),
      leaderName: String(roster.leader || roster.leaderName || ""),
      constructionGoalScore: numeric(roster.constructionGoalScores?.[profileKey]),
      exactForceBuilderLegal: (roster.warnings || []).length === 0,
    }));
}

function rosterCandidatesByLeader(rows = [], profileKey = "", maximumPerLeader = 2) {
  const byLeader = new Map();
  for (const roster of rows) {
    const leaderName = String(roster.leader || roster.leaderName || "unknown");
    if (!byLeader.has(leaderName)) byLeader.set(leaderName, []);
    byLeader.get(leaderName).push(roster);
  }
  return [...byLeader.entries()].sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, rosters]) => rosterRank(rosters, profileKey, maximumPerLeader));
}

export function buildWarmachineTerminalDemandRosterRoutingV1(raw = {}) {
  const task = raw.task || {};
  const demandGroups = raw.demandGroups || {};
  const subjectRosters = raw.subjectRosters || [];
  const challengerRosters = raw.challengerRosters || [];
  const maximumSubjectCandidates = Math.max(1, Math.floor(numeric(
    raw.maximumSubjectCandidatesPerGroup,
    4,
  )));
  const maximumChallengerCandidatesPerLeader = Math.max(1, Math.floor(numeric(
    raw.maximumChallengerCandidatesPerLeaderPerGroup,
    2,
  )));
  const evidencePinsBySubcell = new Map((raw.evidencePins || []).map((pin) => [
    String(pin.subcellKey || ""),
    pin,
  ]));
  const scenarioKeys = new Set(task.stateDomain?.scenarioKeys || []);
  const eligibleGroups = (demandGroups.groups || []).filter((group) =>
    goalAllowed(task, group.signature?.goalFamily) &&
    roundAllowed(task, group) &&
    group.scenarioKeys.some((scenarioKey) => scenarioKeys.has(scenarioKey)));
  const routedGroups = eligibleGroups.map((group) => {
    const profileKey = group.constructionMacroProfileKey;
    const engineEvidencePins = group.representativeKeys.map((subcellKey) =>
      evidencePinsBySubcell.get(subcellKey)).filter(Boolean);
    const core = stableGraphValue({
      groupKey: group.groupKey,
      constructionMacroProfileKey: profileKey,
      goalFamily: group.signature.goalFamily,
      roundBand: group.signature.roundBand,
      scenarioKeys: group.scenarioKeys.filter((scenarioKey) => scenarioKeys.has(scenarioKey)),
      exactRoundNumbers: group.exactRoundNumbers.filter((round) =>
        round >= task.horizon.minimumTerminalRound && round <= task.horizon.maximumTerminalRound),
      representativeCount: group.representativeCount,
      representativeKeys: group.representativeKeys,
      cellKeys: group.cellKeys,
      requirements: group.requirements,
      evaluationStandard: group.evaluationStandard,
      subjectRosterCandidates: rosterRank(
        subjectRosters,
        profileKey,
        maximumSubjectCandidates,
      ),
      challengerRosterCandidates: rosterCandidatesByLeader(
        challengerRosters,
        profileKey,
        maximumChallengerCandidatesPerLeader,
      ),
      expectedDispositionCounts: group.expectedDispositionCounts,
      sourceResolutionStatuses: group.sourceResolutionStatuses,
      rulesEngineCapabilityEvidence: {
        pinnedEvidenceCount: engineEvidencePins.length,
        strictReplayCertifiedCount: engineEvidencePins.filter((pin) =>
          pin.strictReplayCertified).length,
        pins: engineEvidencePins,
        matchupRosterRouteProven: false,
      },
      queuePriority: {
        disposition: dispositionPriority(group.expectedDispositionCounts),
        goal: goalPriority(group.signature.goalFamily),
        round: roundPriority(group.signature.roundBand),
      },
      evaluationStatus: "queued_strict_terminal_root_materialization",
      strictTerminalRootCount: 0,
      strictReachableRouteCount: 0,
      strictRejectedRouteCount: 0,
      unresolvedRouteCount: group.representativeCount,
      naturalProbabilityMass: null,
      gameValueInterval: { lowerBound: 0, upperBound: 1 },
    });
    return { ...core, routingGroupHash: stableGraphHash(core) };
  }).sort((left, right) =>
    left.queuePriority.disposition - right.queuePriority.disposition ||
    left.queuePriority.goal - right.queuePriority.goal ||
    left.queuePriority.round - right.queuePriority.round ||
    left.groupKey.localeCompare(right.groupKey));
  const profileMap = new Map();
  for (const group of routedGroups) {
    if (!profileMap.has(group.constructionMacroProfileKey)) {
      profileMap.set(group.constructionMacroProfileKey, []);
    }
    profileMap.get(group.constructionMacroProfileKey).push(group.groupKey);
  }
  const processingQueues = [...profileMap.entries()].map(([profileKey, groupKeys]) => ({
    constructionMacroProfileKey: profileKey,
    groupCount: groupKeys.length,
    groupKeys,
    nextGroupKey: groupKeys[0] || "",
    completedGroupCount: 0,
    status: "queued",
  })).sort((left, right) => left.constructionMacroProfileKey.localeCompare(
    right.constructionMacroProfileKey,
  ));
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_TERMINAL_DEMAND_ROSTER_ROUTING_V1_SCHEMA,
    taskHash: task.taskHash,
    demandGroupSetHash: demandGroups.demandGroupSetHash,
    sourceDemandGroupCount: demandGroups.groupCount,
    eligibleDemandGroupCount: routedGroups.length,
    deferredDemandGroupCount: demandGroups.groupCount - routedGroups.length,
    constructionMacroProfileCount: processingQueues.length,
    routedGroups,
    processingQueues,
    counts: {
      queuedGroupCount: routedGroups.length,
      strictEvaluatedGroupCount: 0,
      strictTerminalRootCount: 0,
      strictReachableRouteCount: 0,
      strictRejectedRouteCount: 0,
      rulesEngineEvidencePinCount: (raw.evidencePins || []).length,
    },
    strategyScoreUsedForReachability: false,
    representativeFrequencyUsedAsProbability: false,
    naturalWinRateClaimed: false,
    globalOptimalityProven: false,
    claimBoundary: "Routing assigns exact legal roster candidates to each task-eligible detailed terminal demand group through its shared construction macro profile. Candidate ordering is construction screening only. Every queued group remains [0,1] until strict terminal root materialization, reverse expansion and independent forward replay update its evidence counts.",
  });
  return { ...core, routingHash: stableGraphHash(core) };
}
