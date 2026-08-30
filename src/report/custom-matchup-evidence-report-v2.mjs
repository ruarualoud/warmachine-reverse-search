import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_CUSTOM_MATCHUP_EVIDENCE_REPORT_V2_SCHEMA =
  "warmachine_custom_matchup_evidence_report_v2";

const REQUIRED_ROUTE_FAMILIES = Object.freeze(["assassination", "score"]);

function uniqueSorted(values = []) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null)
    .map(String).filter(Boolean))].sort();
}

function sealedRosterPoolContext(pool = {}, baseReport = {}) {
  const poolCore = { ...pool };
  const poolSetHash = String(poolCore.poolSetHash || "");
  delete poolCore.poolSetHash;
  if (!poolSetHash || stableGraphHash(poolCore) !== poolSetHash) {
    throw new Error("custom_matchup_report_roster_pool_hash_invalid");
  }
  if (pool.quality?.exactForceBuilderLegality !== true ||
      pool.subjectPool?.quality?.exactListLegality !== true ||
      pool.challengerPool?.quality?.exactListLegality !== true ||
      pool.subjectPool?.enumerationAudit?.allReturnedRostersForceBuilderLegal !== true ||
      pool.challengerPool?.enumerationAudit?.allReturnedRostersForceBuilderLegal !== true) {
    throw new Error("custom_matchup_report_roster_pool_not_exact_legal");
  }
  if (String(pool.taskHash || "") !== String(baseReport.task?.taskHash || "") ||
      String(pool.source?.remoteVersion || "") !==
        String(baseReport.source?.remoteVersion || "")) {
    throw new Error("custom_matchup_report_roster_pool_source_mismatch");
  }
  const subjectRosters = pool.subjectPool?.rosters || [];
  const challengerRosters = pool.challengerPool?.rosters || [];
  if (subjectRosters.length !== Number(baseReport.counts?.subjectRosterCount || 0) ||
      challengerRosters.length !==
        Number(baseReport.counts?.challengerRosterCount || 0)) {
    throw new Error("custom_matchup_report_roster_pool_count_mismatch");
  }
  const rows = [
    ...subjectRosters.map((roster) => ({ roster, taskSideKey: "subject" })),
    ...challengerRosters.map((roster) => ({ roster, taskSideKey: "challenger" })),
  ];
  const byKey = new Map();
  for (const row of rows) {
    const rosterKey = String(row.roster?.key || "");
    if (!rosterKey || byKey.has(rosterKey)) {
      throw new Error(`custom_matchup_report_roster_key_invalid:${rosterKey}`);
    }
    byKey.set(rosterKey, row);
  }
  for (const opening of baseReport.representativeOpenings || []) {
    const subject = byKey.get(String(opening.subjectRosterKey || ""));
    const challenger = byKey.get(String(opening.challengerRosterKey || ""));
    if (subject?.taskSideKey !== "subject" ||
        challenger?.taskSideKey !== "challenger") {
      throw new Error("custom_matchup_report_representative_roster_pool_mismatch");
    }
  }
  return { pool, poolSetHash, byKey };
}

function routeRosterSideProjection(context, rosterKey, expectedTaskSideKey) {
  const row = context.byKey.get(String(rosterKey || ""));
  const roster = row?.roster || {};
  const entries = roster.entries || [];
  const pointTotalFromEntries = entries.reduce((total, entry) =>
    total + Number(entry.linePoints || 0), 0);
  const physicalModelCountFromEntries = entries.reduce((total, entry) =>
    total + Number(entry.physicalModels || 0), 0);
  const declaredPointTotal = Number(roster.totalPoints ?? -1);
  const declaredPhysicalModelCount = Number(roster.physicalModels ?? -1);
  const pointLimit = Number((expectedTaskSideKey === "subject"
    ? context.pool.subjectPool : context.pool.challengerPool)?.pointLimit ?? -1);
  const membershipMatches = row?.taskSideKey === expectedTaskSideKey;
  const pointAccountingComplete = membershipMatches && pointLimit >= 0 &&
    declaredPointTotal === pointLimit && pointTotalFromEntries === declaredPointTotal;
  const physicalModelAccountingComplete = membershipMatches &&
    declaredPhysicalModelCount >= 0 &&
    physicalModelCountFromEntries === declaredPhysicalModelCount;
  const warningsEmpty = membershipMatches && (roster.warnings || []).length === 0;
  const exactForceBuilderLegal = membershipMatches && pointAccountingComplete &&
    physicalModelAccountingComplete && warningsEmpty;
  const pointLedger = stableGraphValue({
    rosterKey: String(roster.key || rosterKey || ""),
    pointLimit,
    declaredPointTotal,
    pointTotalFromEntries,
    entryPoints: entries.map((entry) => ({
      entryId: String(entry.entryId || ""),
      cardId: String(entry.cardId || ""),
      linePoints: Number(entry.linePoints || 0),
      optionSelections: stableGraphValue(entry.optionSelections || {}),
      attachedTo: String(entry.attachedTo || ""),
      battlegroupController: String(entry.battlegroupController || ""),
    })),
  });
  return stableGraphValue({
    rosterKey: String(roster.key || rosterKey || ""),
    taskSideKey: expectedTaskSideKey,
    membershipMatches,
    exactForceBuilderLegal,
    leaderName: String(roster.leader || ""),
    armyName: String(roster.army || ""),
    factionName: String(roster.faction || ""),
    pointLimit,
    pointTotal: declaredPointTotal,
    pointAccountingComplete,
    physicalModelCount: declaredPhysicalModelCount,
    physicalModelAccountingComplete,
    entryCount: entries.length,
    warningsEmpty,
    rosterContentHash: membershipMatches ? stableGraphHash(roster) : "",
    pointLedgerHash: membershipMatches ? stableGraphHash(pointLedger) : "",
  });
}

function routeRosterProjection(route = {}, valueRow = {}, context = {},
  representativeRosterKey = "", representativePairKeys = new Set()) {
  const subject = routeRosterSideProjection(
    context,
    route.subjectRosterKey,
    "subject",
  );
  const challenger = routeRosterSideProjection(
    context,
    route.challengerRosterKey,
    "challenger",
  );
  const combinedPhysicalModelCount = Number(subject.physicalModelCount || 0) +
    Number(challenger.physicalModelCount || 0);
  const addressModelCount = Number(valueRow.address?.physicalModelCount ?? -1);
  const leaderMatches = challenger.leaderName === String(route.leaderName || "");
  const combinedModelCountMatches = combinedPhysicalModelCount === addressModelCount;
  const exactRosterEvidenceComplete = subject.exactForceBuilderLegal === true &&
    challenger.exactForceBuilderLegal === true && leaderMatches &&
    combinedModelCountMatches;
  const pairKey = `${subject.rosterKey}::${challenger.rosterKey}`;
  return stableGraphValue({
    poolSetHash: context.poolSetHash,
    subject,
    challenger,
    combinedPhysicalModelCount,
    addressPhysicalModelCount: addressModelCount,
    combinedModelCountMatches,
    challengerLeaderMatchesRoute: leaderMatches,
    exactRosterEvidenceComplete,
    challengerMatchesScreeningRepresentative:
      challenger.rosterKey === String(representativeRosterKey || ""),
    rosterPairInRepresentativeOpeningSet: representativePairKeys.has(pairKey),
  });
}

function interval(raw = {}) {
  const lowerBound = Number(raw.lowerBound ?? raw.lower?.decimal ?? 0);
  const upperBound = Number(raw.upperBound ?? raw.upper?.decimal ?? 1);
  if (!Number.isFinite(lowerBound) || !Number.isFinite(upperBound) ||
      lowerBound < 0 || upperBound > 1 || lowerBound > upperBound) {
    throw new Error("custom_matchup_report_value_interval_invalid");
  }
  return stableGraphValue({
    lowerBound,
    upperBound,
    exact: raw.exact === true && lowerBound === upperBound,
    lower: raw.lower || null,
    upper: raw.upper || null,
  });
}

function compactRoster(roster = {}) {
  return stableGraphValue({
    rosterKey: String(roster.rosterKey || roster.key || ""),
    leaderName: String(roster.leaderName || roster.leader || ""),
    armyName: String(roster.armyName || roster.army || ""),
    pointTotal: Number(roster.pointTotal ?? roster.totalPoints ?? 0),
    physicalModelCount: Number(roster.physicalModelCount ?? roster.physicalModels ?? 0),
    entries: (roster.entries || []).map((entry) => stableGraphValue({
      entryId: String(entry.entryId || ""),
      cardId: String(entry.cardId || ""),
      name: String(entry.name || ""),
      cardTypeName: String(entry.cardTypeName || ""),
      linePoints: Number(entry.linePoints || 0),
      physicalModels: Number(entry.physicalModels || 0),
      attachedTo: String(entry.attachedTo || ""),
      battlegroupController: String(entry.battlegroupController || ""),
      options: String(entry.options || ""),
      optionSelections: stableGraphValue(entry.optionSelections || {}),
    })),
    exportText: String(roster.exportText || ""),
  });
}

function screeningAxes(row = {}) {
  const raw = row.rawDimensions || {};
  return stableGraphValue({
    damageAndRemovalProxy: {
      meleeRemoval: Number(raw.melee_removal || 0),
      rangedRemoval: Number(raw.ranged_removal || 0),
      antiToughRemoval: Number(raw.anti_tough_removal || 0),
      resourceOptimizedRemoval: Number(raw.resource_optimized_removal || 0),
    },
    controlProxy: Number(raw.control || 0),
    scenarioProxy: {
      scenario: Number(raw.scenario || 0),
      modelCount: Number(raw.model_count || 0),
      mobility: Number(raw.mobility || 0),
    },
    counterattackStateProxy: {
      defense: Number(raw.defense || 0),
      resourceFreeRemoval: Number(raw.resource_free_removal || 0),
    },
    sustainProxy: {
      recursion: Number(raw.recursion || 0),
      modelCount: Number(raw.model_count || 0),
      resourceFreeRemoval: Number(raw.resource_free_removal || 0),
    },
    evidenceClass: "screening_order_only",
    strictRouteValue: false,
    naturalProbability: false,
  });
}

function openingCoverage(openings = []) {
  const topologyCertifiedOpenings = openings.filter((row) =>
    row.exactMapTopologyAuditOk === true &&
    String(row.exactMapTopologyAuditHash || "") &&
    String(row.exactMapTopologyRealizationHash || ""));
  const mapKeys = uniqueSorted(topologyCertifiedOpenings.map((row) => row.mapKey));
  return stableGraphValue({
    strictOpeningCount: openings.length,
    topologyCertifiedStrictOpeningCount: topologyCertifiedOpenings.length,
    scenarioKeys: uniqueSorted(openings.map((row) => row.scenarioKey)),
    mapKeys,
    uncertifiedMapKeys: uniqueSorted(openings.filter((row) =>
      !topologyCertifiedOpenings.includes(row)).map((row) => row.mapKey)),
    mapTopologyEvidence: mapKeys.map((mapKey) => ({
      mapKey,
      strictOpeningCount: topologyCertifiedOpenings.filter((row) =>
        row.mapKey === mapKey).length,
      topologyAuditHashes: uniqueSorted(topologyCertifiedOpenings.filter((row) =>
        row.mapKey === mapKey).map((row) => row.exactMapTopologyAuditHash)),
      topologyRealizationHashes: uniqueSorted(topologyCertifiedOpenings.filter((row) =>
        row.mapKey === mapKey).map((row) => row.exactMapTopologyRealizationHash)),
      observedTopologyRows: [...new Map(topologyCertifiedOpenings.filter((row) =>
        row.mapKey === mapKey).map((row) => [
        stableGraphHash(row.exactMapTopologyObserved || {}),
        stableGraphValue(row.exactMapTopologyObserved || {}),
      ])).values()],
    })),
    deploymentSeedKeys: uniqueSorted(openings.map((row) => row.deploymentSeedKey)),
    firstPlayerTaskSideKeys: uniqueSorted(openings.map((row) =>
      row.firstPlayerTaskSideKey)),
    formationKeys: uniqueSorted(openings.map((row) => row.formationKey)),
    strictOpeningStateHashes: uniqueSorted(openings.map((row) =>
      row.strictOpeningStateHash)),
    strictDeploymentReceiptHashes: uniqueSorted(openings.map((row) =>
      row.strictDeploymentReceiptHash)),
  });
}

function routeProjection(route = {}, valueRow = null, options = {}) {
  const closure = valueRow?.closure || route.closure || {};
  const strictOpeningComplete = closure.strictOpeningComplete === true ||
    route.strictOpeningComplete === true;
  const strictReplayComplete = closure.strictReplayComplete === true ||
    route.strictReplayComplete === true;
  const assumptionClosureComplete = closure.assumptionClosureComplete === true ||
    route.assumptionClosureComplete === true;
  const familyKey = String(route.terminalFamilyKey || "");
  if (!REQUIRED_ROUTE_FAMILIES.includes(familyKey)) {
    throw new Error(`custom_matchup_report_route_family_invalid:${familyKey}`);
  }
  const routeLabel = (valueRow?.routeLabels || []).find((row) =>
    String(row.routeKey || "") === String(route.routeKey || ""));
  const routeLabelMatchesValue = Boolean(routeLabel) &&
    String(routeLabel.terminalFamilyKey || "") === familyKey &&
    String(routeLabel.terminalSourceKey || "") ===
      String(route.terminalSourceKey || "");
  const valueOpening = valueRow?.strictOpeningEvidence || {};
  const routeOpeningAddress = stableGraphValue(route.openingAddress || {});
  const valueOpeningAddress = stableGraphValue(valueRow?.address || {});
  const routeOpeningEvidence = stableGraphValue({
    strictOpeningStateHash: String(route.strictOpeningStateHash || ""),
    strictOpeningEvidenceHash: String(route.strictOpeningEvidenceHash || ""),
    valueStateHash: String(valueOpening.stateHash || ""),
    valueEvidenceHash: String(valueOpening.evidenceHash || ""),
    openingAddress: routeOpeningAddress,
    valueAddress: valueOpeningAddress,
    stateHashMatchesValue: Boolean(route.strictOpeningStateHash) &&
      String(route.strictOpeningStateHash) === String(valueOpening.stateHash || ""),
    evidenceHashMatchesValue: Boolean(route.strictOpeningEvidenceHash) &&
      String(route.strictOpeningEvidenceHash) ===
        String(valueOpening.evidenceHash || ""),
    addressMatchesValue: stableGraphHash(routeOpeningAddress) ===
      stableGraphHash(valueOpeningAddress),
    currentHostCertified: valueOpening.certified === true &&
      valueOpening.currentHostReceiptMatches === true,
  });
  const strictOpeningIdentityComplete =
    routeOpeningEvidence.stateHashMatchesValue === true &&
    routeOpeningEvidence.evidenceHashMatchesValue === true &&
    routeOpeningEvidence.addressMatchesValue === true &&
    routeOpeningEvidence.currentHostCertified === true;
  const routeRosterEvidence = routeRosterProjection(
    route,
    valueRow,
    options.rosterContext,
    options.representativeRosterKey,
    options.representativePairKeys,
  );
  const strictRouteExists = strictOpeningComplete && strictReplayComplete &&
    assumptionClosureComplete && routeLabelMatchesValue &&
    strictOpeningIdentityComplete &&
    routeRosterEvidence.exactRosterEvidenceComplete === true;
  const core = stableGraphValue({
    routeKey: String(route.routeKey || ""),
    leaderName: String(route.leaderName || ""),
    initialStateKey: String(route.initialStateKey || ""),
    terminalFamilyKey: familyKey,
    terminalSourceKey: String(route.terminalSourceKey || ""),
    challengerSideKey: String(route.challengerSideKey || "player2"),
    winnerSideKey: String(route.winnerSideKey || ""),
    outcomeForChallenger: String(route.winnerSideKey || "") ===
      String(route.challengerSideKey || "player2") ? "win" : "loss",
    strictRouteExists,
    strictOpeningComplete,
    strictOpeningIdentityComplete,
    strictReplayComplete,
    assumptionClosureComplete,
    routeLabelMatchesValue,
    routeOpeningEvidence,
    routeRosterEvidence,
    reverseEdgeCount: route.reverseEdgeCount === null ||
      route.reverseEdgeCount === undefined ? null : Number(route.reverseEdgeCount),
    rejectedBranchCount: Number(route.rejectedBranchCount || 0),
    unresolvedBranchCount: Number(route.unresolvedBranchCount || 0),
    routeCostKnown: route.routeCostKnown === true,
    strictGameValueInterval: interval(valueRow?.strictGameValueInterval ||
      route.strictGameValueInterval || {}),
    missingClosureKeys: uniqueSorted(valueRow?.missingClosureKeys ||
      route.missingClosureKeys || []),
    observedRouteDelta: stableGraphValue(route.observedRouteDelta || {}),
    evidenceRefs: (route.evidenceRefs || []).map((row) => stableGraphValue(row)),
    evidenceHashes: stableGraphValue(route.evidenceHashes || {}),
    claimBoundary: strictRouteExists
      ? "One current-Host strict route exists for this exact legal roster pair, opening identity and terminal source. The route roster may differ from the screening representative. Candidate, opponent-response and Chance closure remain separate."
      : "This route label lacks complete current-Host opening identity, exact legal roster-pair, value-label or replay/history closure. It cannot establish reachability or value by itself.",
  });
  if (!core.routeKey || !core.leaderName || !core.initialStateKey) {
    throw new Error("custom_matchup_report_route_identity_invalid");
  }
  return { ...core, routeEvidenceHash: stableGraphHash(core) };
}

function familyCoverage(routes = [], familyKey) {
  const matching = routes.filter((route) => route.terminalFamilyKey === familyKey);
  return stableGraphValue({
    familyKey,
    routeEvidenceCount: matching.length,
    strictRouteCount: matching.filter((route) => route.strictRouteExists).length,
    favorableStrictRouteCount: matching.filter((route) =>
      route.strictRouteExists && route.outcomeForChallenger === "win").length,
    unfavorableStrictRouteCount: matching.filter((route) =>
      route.strictRouteExists && route.outcomeForChallenger === "loss").length,
    completeForTicket09: matching.some((route) => route.strictRouteExists),
  });
}

export function buildWarmachineCustomMatchupEvidenceReportV2(raw = {}) {
  const baseReport = raw.baseReport || {};
  const initialValues = raw.initialValueEvidence || {};
  const historyEvidence = raw.historyEvidence || {};
  const hostReceiptHash = String(baseReport.source?.hostReceiptHash || "");
  if (!hostReceiptHash || initialValues.hostReceiptHash !== hostReceiptHash ||
      historyEvidence.hostReceiptHash !== hostReceiptHash) {
    throw new Error("custom_matchup_report_host_receipt_mismatch");
  }
  if (initialValues.naturalWinRateClaimed === true ||
      initialValues.aggregation?.naturalWinRateClaimed === true) {
    throw new Error("custom_matchup_report_unverified_natural_win_rate");
  }
  const rosterContext = sealedRosterPoolContext(raw.rosterPool || {}, baseReport);
  const valueByInitialState = new Map((initialValues.rows || []).map((row) =>
    [String(row.initialStateKey || ""), row]));
  const leaderNames = uniqueSorted((baseReport.leaderConclusions || []).map((row) =>
    row.leaderName));
  if (!leaderNames.length) throw new Error("custom_matchup_report_leaders_required");
  const requiredMapKeys = uniqueSorted(Object.keys(
    baseReport.screening?.mapWeights || {},
  ));
  const requiredDeploymentSeedKeys = uniqueSorted(
    baseReport.task?.stateDomain?.deploymentSeeds?.map((row) =>
      row.deploymentSeedKey) || [],
  );
  const requiredFirstPlayerTaskSideKeys = uniqueSorted(
    baseReport.task?.stateDomain?.firstPlayerRows?.map((row) => row.taskSideKey) || [],
  );
  const leaderSet = new Set(leaderNames);
  const representativeRosterByLeader = new Map(
    (baseReport.leaderConclusions || []).map((row) => [
      String(row.leaderName || ""),
      String(row.robustBestRosterKey || ""),
    ]),
  );
  const representativePairKeys = new Set(
    (baseReport.representativeOpenings || []).map((opening) =>
      `${String(opening.subjectRosterKey || "")}::${String(
        opening.challengerRosterKey || "",
      )}`),
  );
  const routes = (raw.routes || []).map((route) => {
    if (!leaderSet.has(String(route.leaderName || ""))) {
      throw new Error(`custom_matchup_report_route_leader_unknown:${route.leaderName}`);
    }
    const valueRow = valueByInitialState.get(String(route.initialStateKey || ""));
    if (!valueRow) {
      throw new Error(`custom_matchup_report_route_value_missing:${route.initialStateKey}`);
    }
    return routeProjection(route, valueRow, {
      rosterContext,
      representativeRosterKey: representativeRosterByLeader.get(
        String(route.leaderName || ""),
      ),
      representativePairKeys,
    });
  }).sort((left, right) => left.leaderName.localeCompare(right.leaderName) ||
    left.terminalFamilyKey.localeCompare(right.terminalFamilyKey) ||
    left.routeKey.localeCompare(right.routeKey));
  const screeningByRoster = new Map((baseReport.screening?.rows || []).map((row) =>
    [String(row.rosterKey || ""), row]));
  const leaderReports = (baseReport.leaderConclusions || []).map((leader) => {
    const leaderName = String(leader.leaderName || "");
    const bestRosterKey = String(leader.robustBestRosterKey || "");
    const openings = (baseReport.representativeOpenings || []).filter((opening) =>
      String(opening.challengerRoster?.leaderName || "") === leaderName);
    const bestOpening = openings.find((opening) =>
      String(opening.challengerRosterKey || "") === bestRosterKey) || openings[0];
    if (!bestOpening) {
      throw new Error(`custom_matchup_report_leader_opening_missing:${leaderName}`);
    }
    const leaderRoutes = routes.filter((route) => route.leaderName === leaderName);
    const strictOpeningCoverage = openingCoverage(openings);
    const routeFamilyCoverage = Object.fromEntries(REQUIRED_ROUTE_FAMILIES.map((familyKey) =>
      [familyKey, familyCoverage(leaderRoutes, familyKey)]));
    const missingMapKeys = requiredMapKeys.filter((mapKey) =>
      !strictOpeningCoverage.mapKeys.includes(mapKey));
    const missingDeploymentSeedKeys = requiredDeploymentSeedKeys.filter((deploymentSeedKey) =>
      !strictOpeningCoverage.deploymentSeedKeys.includes(deploymentSeedKey));
    const missingFirstPlayerTaskSideKeys = requiredFirstPlayerTaskSideKeys.filter((sideKey) =>
      !strictOpeningCoverage.firstPlayerTaskSideKeys.includes(sideKey));
    const completeForTicket09 = Object.values(routeFamilyCoverage).every((row) =>
      row.completeForTicket09) && missingMapKeys.length === 0 &&
      missingDeploymentSeedKeys.length === 0 &&
      missingFirstPlayerTaskSideKeys.length === 0;
    const screening = screeningByRoster.get(bestRosterKey) || {};
    const core = stableGraphValue({
      leaderName,
      representativeRoster: compactRoster(bestOpening.challengerRoster),
      representativeRosterKey: bestRosterKey,
      finiteLegalRosterCount: Number(leader.finiteRosterCount || 0),
      paretoRosterCount: Number(leader.paretoRosterCount || 0),
      strictOpeningCoverage,
      screeningEvidence: {
        robustScreeningIndex: Number(leader.robustBestScreeningIndex || 0),
        mapScreeningIndexes: stableGraphValue(leader.mapScreeningIndexes || {}),
        strongestDimensions: stableGraphValue(leader.strongestDimensions || []),
        comparisonAxes: screeningAxes(screening),
        evidenceClass: "candidate_ordering_only",
        naturalWinRate: null,
      },
      routes: leaderRoutes,
      routeFamilyCoverage,
      completeForTicket09,
      missingRouteFamilyKeys: REQUIRED_ROUTE_FAMILIES.filter((familyKey) =>
        !routeFamilyCoverage[familyKey].completeForTicket09),
      missingMapKeys,
      missingDeploymentSeedKeys,
      missingFirstPlayerTaskSideKeys,
      strictInitialValueIntervals: leaderRoutes.map((route) => ({
        initialStateKey: route.initialStateKey,
        routeKey: route.routeKey,
        interval: route.strictGameValueInterval,
      })),
      naturalWinRate: null,
      globalFactionOptimalityProven: false,
    });
    return { ...core, leaderEvidenceHash: stableGraphHash(core) };
  }).sort((left, right) => left.leaderName.localeCompare(right.leaderName));
  const routeSearchQueue = leaderReports.flatMap((leader) =>
    leader.missingRouteFamilyKeys.map((familyKey) => stableGraphValue({
      taskKey: `ticket09-${stableGraphHash({ leaderName: leader.leaderName, familyKey }, 24)}`,
      taskKind: "strict_route_evidence",
      leaderName: leader.leaderName,
      terminalFamilyKey: familyKey,
      representativeRosterKey: leader.representativeRosterKey,
      requiredEvidence: [
        "sealed_force_builder_legal_roster_pair",
        "current_host_strict_opening",
        "route_opening_identity_binding",
        "opening_to_terminal_route",
        "independent_strict_replay",
        "history_bound_terminal_binding",
        "unresolved_and_rejected_mass_ledger",
      ],
      schedulingOnly: true,
      strategyConclusion: false,
    })));
  const mapSearchQueue = leaderReports.flatMap((leader) =>
    leader.missingMapKeys.map((mapKey) => stableGraphValue({
      taskKey: `ticket09-${stableGraphHash({
        leaderName: leader.leaderName,
        mapKey,
        taskKind: "strict_map_opening",
      }, 24)}`,
      taskKind: "strict_map_opening",
      leaderName: leader.leaderName,
      mapKey,
      representativeRosterKey: leader.representativeRosterKey,
      requiredEvidence: [
        "exact_terrain_geometry",
        "declared_topology_profile_audit",
        "current_host_strict_opening",
        "deployment_and_first_player_axis_binding",
      ],
      schedulingOnly: true,
      strategyConclusion: false,
    })));
  const searchQueue = [...routeSearchQueue, ...mapSearchQueue].sort((left, right) =>
    left.leaderName.localeCompare(right.leaderName) ||
    left.taskKind.localeCompare(right.taskKind) ||
    String(left.terminalFamilyKey || left.mapKey || "").localeCompare(
      String(right.terminalFamilyKey || right.mapKey || ""),
    ));
  const reportComplete = leaderReports.every((leader) => leader.completeForTicket09);
  const {
    generatedAt: _baseGeneratedAt,
    reportHash: _baseGenerationArtifactHash,
    ...stableBaseEvidence
  } = baseReport;
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_CUSTOM_MATCHUP_EVIDENCE_REPORT_V2_SCHEMA,
    taskHash: String(baseReport.task?.taskHash || ""),
    hostReceiptHash,
    source: stableGraphValue({
      baseEvidenceHash: stableGraphHash(stableBaseEvidence),
      initialValueReportHash: String(initialValues.reportHash || ""),
      initialValueSetHash: String(initialValues.valueSetHash || ""),
      historyReportHash: String(historyEvidence.reportHash || ""),
      dataContentHash: String(baseReport.source?.dataContentHash || ""),
      poolContentHash: String(baseReport.source?.poolContentHash || ""),
      rosterPoolSetHash: rosterContext.poolSetHash,
      mapTopologyRealizationSetHash: String(
        baseReport.source?.mapTopologyRealizationSetHash || "",
      ),
      remoteVersion: String(baseReport.source?.remoteVersion || ""),
    }),
    counts: {
      leaderCount: leaderReports.length,
      finiteSubjectRosterCount: Number(baseReport.counts?.subjectRosterCount || 0),
      finiteChallengerRosterCount: Number(baseReport.counts?.challengerRosterCount || 0),
      strictRepresentativeOpeningCount: Number(
        baseReport.counts?.strictRepresentativeOpeningCount || 0,
      ),
      routeEvidenceCount: routes.length,
      strictRouteCount: routes.filter((route) => route.strictRouteExists).length,
      favorableStrictRouteCount: routes.filter((route) =>
        route.strictRouteExists && route.outcomeForChallenger === "win").length,
      unfavorableStrictRouteCount: routes.filter((route) =>
        route.strictRouteExists && route.outcomeForChallenger === "loss").length,
      leadersCompleteForTicket09: leaderReports.filter((leader) =>
        leader.completeForTicket09).length,
      pendingSearchTaskCount: searchQueue.length,
      pendingRouteSearchTaskCount: routeSearchQueue.length,
      pendingMapOpeningTaskCount: mapSearchQueue.length,
    },
    leaderReports,
    routes,
    pendingSearchQueue: searchQueue,
    initialValueAggregation: stableGraphValue(initialValues.aggregation || {}),
    historyBinding: stableGraphValue({
      reportHash: historyEvidence.reportHash,
      invalidFourZeroRewrite: historyEvidence.invalidFourZeroRewrite,
    }),
    completion: {
      reportComplete,
      requiredLeaderCount: leaderReports.length,
      requiredRouteFamilies: REQUIRED_ROUTE_FAMILIES,
      requiredMapKeys,
      requiredDeploymentSeedKeys,
      requiredFirstPlayerTaskSideKeys,
      missingSearchTaskCount: searchQueue.length,
    },
    naturalWinRate: null,
    naturalWinRateClaimed: false,
    globalOptimalityProven: false,
    trainingTruth: false,
    claimBoundary: "This report separates finite Force Builder legality, ordering-only screening proxies, strict opening evidence, discovered route evidence and adversarial value closure. A strict route proves one reachable history only. Missing candidates, responses, Chance mass or initial-state distributions remain unresolved; no screening index or representative frequency is a win rate.",
  });
  return {
    ...core,
    generatedAt: String(raw.generatedAt || new Date().toISOString()),
    reportHash: stableGraphHash(core),
    ok: true,
  };
}
