import {
  buildWarmachineRosterPoolSourceEvidenceV2,
  runWarmachineNestedRosterDeploymentSearchV2,
} from "../construction/nested-roster-deployment-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_REPRESENTATIVE_OPENING_MATERIALIZER_V1_SCHEMA =
  "warmachine_representative_opening_materializer_v1";

const DEPLOYMENT_ARCHETYPES = Object.freeze({
  balanced: Object.freeze({
    player1: "balanced_layered",
    player2: "balanced_layered",
  }),
  compact_center: Object.freeze({
    player1: "center_break",
    player2: "support_bubbles",
  }),
  wide: Object.freeze({
    player1: "wide_screen",
    player2: "scenario_fan",
  }),
  refused_flank: Object.freeze({
    player1: "refused_north",
    player2: "refused_south",
  }),
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sourceMetadata(pool = {}) {
  return {
    sourceContentHash: pool.sourceContentHash,
    sourceSchemaVersion: pool.sourceSchemaVersion,
    exactListLegality: pool.exactListLegality === true,
    forceBuilderContract: pool.forceBuilderContract,
    remoteVersion: pool.remoteVersion,
    exhaustiveAllFactionRosters: pool.exhaustiveAllFactionRosters === true,
  };
}

function rosterByKey(pool = {}, rosterKey = "") {
  return (pool.lists || []).find((list) => String(list.key || "") === String(rosterKey || ""));
}

function firstPlayerSideKey(taskSideKey = "subject") {
  return taskSideKey === "challenger" ? "player2" : "player1";
}

function presentationPieces(state = {}) {
  return (state.pieces || []).map((piece) => ({
    pieceKey: String(piece.pieceKey || ""),
    sideKey: String(piece.sideKey || ""),
    label: String(piece.label || piece.name || piece.pieceKey || ""),
    cardId: String(piece.cardId || piece.metadata?.cardId || ""),
    unitGroupId: String(piece.unitGroupId || piece.unitId || ""),
    baseDiameterIn: numeric(piece.baseDiameterIn || piece.baseSizeIn, 1.18),
    xIn: numeric(piece.position?.xIn ?? piece.xIn),
    yIn: numeric(piece.position?.yIn ?? piece.yIn),
    isLeader: piece.isWarcaster === true || piece.isWarlock === true,
  }));
}

function exactMapTemplateForRow(raw = {}, row = {}) {
  return typeof raw.resolveExactMapTemplate === "function"
    ? raw.resolveExactMapTemplate(row)
    : raw.exactMapTemplatesByKey?.[row.mapKey];
}

function materializationTasks(raw = {}) {
  const task = raw.task || {};
  const exactMapKeys = Object.keys(raw.exactMapTemplatesByKey || {}).sort();
  const exactScenarioKeys = Object.keys(raw.scenarioBindersByKey || {}).sort();
  const requestedScenarioKeys = raw.scenarioKeys || task.stateDomain?.scenarioKeys || [];
  const requestedMapKeys = raw.mapKeys ||
    task.stateDomain?.mapProfiles?.map((row) => row.mapKey) || [];
  const requestedFirstPlayerTaskSideKeys = new Set(raw.firstPlayerTaskSideKeys ||
    task.stateDomain?.firstPlayerRows?.map((row) => row.taskSideKey) || []);
  const requestedDeploymentSeedKeys = new Set(raw.deploymentSeedKeys ||
    task.stateDomain?.deploymentSeeds?.map((row) => row.deploymentSeedKey) || []);
  const taskScenarioKeys = new Set(task.stateDomain?.scenarioKeys || []);
  const taskMapKeys = new Set(task.stateDomain?.mapProfiles?.map((row) => row.mapKey) || []);
  const taskFirstPlayerTaskSideKeys = new Set(task.stateDomain?.firstPlayerRows
    ?.map((row) => row.taskSideKey) || []);
  const taskDeploymentSeedKeys = new Set(task.stateDomain?.deploymentSeeds
    ?.map((row) => row.deploymentSeedKey) || []);
  if (requestedScenarioKeys.some((key) => !taskScenarioKeys.has(key)) ||
      requestedMapKeys.some((key) => !taskMapKeys.has(key)) ||
      [...requestedFirstPlayerTaskSideKeys].some((key) =>
        !taskFirstPlayerTaskSideKeys.has(key)) ||
      [...requestedDeploymentSeedKeys].some((key) =>
        !taskDeploymentSeedKeys.has(key))) {
    throw new Error("representative_opening_requested_axis_outside_task_domain");
  }
  const deploymentSeeds = (task.stateDomain?.deploymentSeeds || []).filter((row) =>
    requestedDeploymentSeedKeys.has(row.deploymentSeedKey));
  const firstPlayers = (task.stateDomain?.firstPlayerRows || []).filter((row) =>
    requestedFirstPlayerTaskSideKeys.has(row.taskSideKey));
  const explicitRows = raw.openingTasks || [];
  const rows = explicitRows.length
    ? explicitRows.map((row) => ({
      subjectRosterKey: String(row.subjectRosterKey || ""),
      challengerRosterKey: String(row.challengerRosterKey || ""),
      pairReason: String(row.pairReason || "exact_opening_task"),
      scenarioKey: String(row.scenarioKey || ""),
      mapKey: String(row.mapKey || ""),
      firstPlayerTaskSideKey: String(row.firstPlayerTaskSideKey || ""),
      deploymentSeedKey: String(row.deploymentSeedKey || ""),
      scenarioTerrainSetupClassKey: String(
        row.scenarioTerrainSetupClassKey || "",
      ),
      exactMapAvailable: exactMapKeys.includes(String(row.mapKey || "")) ||
        Boolean(exactMapTemplateForRow(raw, row)),
      exactScenarioBinderAvailable: exactScenarioKeys.includes(
        String(row.scenarioKey || ""),
      ),
    }))
    : [];
  if (!explicitRows.length) {
    for (const pair of raw.rosterPairs || []) {
      for (const scenarioKey of requestedScenarioKeys) {
        for (const mapKey of requestedMapKeys) {
          for (const firstPlayer of firstPlayers) {
            for (const deployment of deploymentSeeds) {
              rows.push({
                subjectRosterKey: pair.subjectRosterKey,
                challengerRosterKey: pair.challengerRosterKey,
                pairReason: String(pair.pairReason || "representative_shortlist"),
                scenarioKey,
                mapKey,
                firstPlayerTaskSideKey: firstPlayer.taskSideKey,
                deploymentSeedKey: deployment.deploymentSeedKey,
                scenarioTerrainSetupClassKey: "",
                exactMapAvailable: exactMapKeys.includes(mapKey),
                exactScenarioBinderAvailable: exactScenarioKeys.includes(scenarioKey),
              });
            }
          }
        }
      }
    }
  }
  if (rows.some((row) => !taskScenarioKeys.has(row.scenarioKey) ||
      !taskMapKeys.has(row.mapKey) ||
      !taskFirstPlayerTaskSideKeys.has(row.firstPlayerTaskSideKey) ||
      !taskDeploymentSeedKeys.has(row.deploymentSeedKey))) {
    throw new Error("representative_opening_explicit_axis_outside_task_domain");
  }
  return rows;
}

function deploymentIdentity(row = {}, exactMapTemplate = {}) {
  return stableGraphValue({
    subjectRosterKey: row.subjectRosterKey,
    challengerRosterKey: row.challengerRosterKey,
    mapKey: row.mapKey,
    firstPlayerTaskSideKey: row.firstPlayerTaskSideKey,
    deploymentSeedKey: row.deploymentSeedKey,
    exactMapTemplateHash: String(exactMapTemplate.templateHash || ""),
  });
}

function openingFailureDisposition(reason = "") {
  if (/selected_roster_missing|deployment_seed_not_mapped|axis_outside_task_domain/.test(
    reason,
  )) {
    return { disposition: "input_invalid", authority: "input_contract" };
  }
  if (/scenario_terrain_partition_(unavailable|mismatch)/.test(reason)) {
    return { disposition: "proposal_filtered", authority: "search_relation" };
  }
  if (/scenario_unsupported|source_unavailable/.test(reason)) {
    return { disposition: "rules_unknown", authority: "rules_source" };
  }
  return { disposition: "strict_rejected", authority: "rules_v1_host" };
}

export function materializeWarmachineRepresentativeOpeningsV1(raw = {}) {
  const task = raw.task || {};
  if (task.validation?.ok !== true) {
    throw new Error(`custom_matchup_task_invalid:${(task.validation?.issues || []).join(",")}`);
  }
  const pools = raw.poolsByTaskSideKey || {};
  const subjectPool = pools.subject || {};
  const challengerPool = pools.challenger || {};
  const subjectEvidence = buildWarmachineRosterPoolSourceEvidenceV2(
    subjectPool.lists || [],
    sourceMetadata(subjectPool),
  );
  const challengerEvidence = buildWarmachineRosterPoolSourceEvidenceV2(
    challengerPool.lists || [],
    sourceMetadata(challengerPool),
  );
  const proposedTasks = materializationTasks(raw);
  const maximumOpenings = Math.max(1, Math.floor(numeric(
    raw.maximumMaterializedOpenings ?? task.searchBudget?.maximumMaterializedOpenings,
    64,
  )));
  const selectedTasks = proposedTasks.filter((row) =>
    row.exactMapAvailable && row.exactScenarioBinderAvailable).slice(0, maximumOpenings);
  const unresolved = proposedTasks.filter((row) =>
    !row.exactMapAvailable || !row.exactScenarioBinderAvailable).map((row) => ({
    ...row,
    disposition: "proposal_only",
    reasons: [
      ...(!row.exactMapAvailable ? ["exact_map_template_missing"] : []),
      ...(!row.exactScenarioBinderAvailable ? ["exact_scenario_binder_missing"] : []),
    ],
  }));
  if (proposedTasks.filter((row) =>
    row.exactMapAvailable && row.exactScenarioBinderAvailable).length > selectedTasks.length) {
    unresolved.push(...proposedTasks.filter((row) =>
      row.exactMapAvailable && row.exactScenarioBinderAvailable).slice(selectedTasks.length)
      .map((row) => ({
        ...row,
        disposition: "budget_deferred",
        reasons: ["opening_materialization_budget"],
      })));
  }
  const openings = [];
  const rejected = [];
  const deploymentCache = new Map();
  for (const row of selectedTasks) {
    const subjectRoster = rosterByKey(subjectPool, row.subjectRosterKey);
    const challengerRoster = rosterByKey(challengerPool, row.challengerRosterKey);
    if (!subjectRoster || !challengerRoster) {
      rejected.push({
        ...row,
        disposition: "input_invalid",
        authority: "input_contract",
        reason: "selected_roster_missing_from_source_pool",
      });
      continue;
    }
    const deployment = DEPLOYMENT_ARCHETYPES[row.deploymentSeedKey];
    if (!deployment) {
      rejected.push({
        ...row,
        disposition: "input_invalid",
        authority: "input_contract",
        reason: "deployment_seed_not_mapped_to_strict_archetypes",
      });
      continue;
    }
    try {
      const exactMapTemplate = exactMapTemplateForRow(raw, row);
      if (!exactMapTemplate?.templateRoom || !exactMapTemplate.templateHash) {
        throw new Error("exact_map_template_missing_for_opening_task");
      }
      const deploymentKey = stableGraphHash(deploymentIdentity(
        row,
        exactMapTemplate,
      ));
      let nested = deploymentCache.get(deploymentKey);
      if (!nested) {
        nested = runWarmachineNestedRosterDeploymentSearchV2({
          templateRoom: exactMapTemplate.templateRoom,
          rosterPoolsBySide: {
            player1: [subjectRoster],
            player2: [challengerRoster],
          },
          sourceEvidenceBySide: {
            player1: subjectEvidence,
            player2: challengerEvidence,
          },
          maximumSelectedRostersBySide: { player1: 1, player2: 1 },
          maximumRosterPairs: 1,
          maximumArchetypesPerSide: 1,
          maximumFormationPairsPerRosterPair: 1,
          formationArchetypeKeysBySide: {
            player1: [deployment.player1],
            player2: [deployment.player2],
          },
          firstPlayerSideKeys: [firstPlayerSideKey(row.firstPlayerTaskSideKey)],
          includeStates: true,
          seed: `${task.taskHash}:${deploymentKey}`,
          searchMode: "custom_task_representative_opening_v1",
        });
        deploymentCache.set(deploymentKey, nested);
      }
      const opening = nested.openings[0];
      if (!opening || opening.strictDeploymentLegal !== true) {
        rejected.push({
          ...row,
          disposition: "strict_rejected",
          authority: "rules_v1_host",
          reason: "strict_deployment_not_materialized",
          nestedCounts: nested.counts,
          rejectedDeployments: nested.rejectedDeployments,
        });
        continue;
      }
      const bound = raw.scenarioBindersByKey[row.scenarioKey](opening.state, {
        mapKey: row.mapKey,
        task,
        firstPlayerTaskSideKey: row.firstPlayerTaskSideKey,
        firstPlayerSideKey: firstPlayerSideKey(row.firstPlayerTaskSideKey),
        scenarioTerrainSetupClassKey: row.scenarioTerrainSetupClassKey,
      });
      const strictOpeningStateHash = String(bound.stateHash || stableGraphHash(bound.state));
      const strictDeploymentReceiptHash = stableGraphHash({
        openingKey: opening.openingKey,
        deploymentAudit: opening.deploymentAudit,
        deploymentCertificates: opening.deploymentCertificates,
        nestedSearchHash: nested.searchHash,
      });
      const identity = {
        taskHash: task.taskHash,
        subjectRosterKey: row.subjectRosterKey,
        challengerRosterKey: row.challengerRosterKey,
        scenarioKey: row.scenarioKey,
        mapKey: row.mapKey,
        firstPlayerTaskSideKey: row.firstPlayerTaskSideKey,
        deploymentSeedKey: row.deploymentSeedKey,
        scenarioTerrainSetupClassKey: row.scenarioTerrainSetupClassKey,
      };
      openings.push({
        ...row,
        initialStateKey: `initial-${stableGraphHash(identity)}`,
        openingKey: opening.openingKey,
        formationKey: opening.formationKey,
        formationArchetypes: opening.archetypes,
        strictOpeningStateHash,
        strictDeploymentReceiptHash,
        scenarioBindingHash: String(bound.bindingHash || ""),
        scenarioTerrainSetupClassKey:
          String(bound.scenarioTerrainSetupClassKey || ""),
        scenarioTerrainSetupAuditHash:
          String(bound.scenarioTerrainSetupAuditHash || ""),
        staticPlacementAuditHash: String(bound.staticPlacementAuditHash || ""),
        exactMapTemplateHash: String(
          exactMapTemplate.templateHash || "",
        ),
        exactMapTopologyAuditHash: String(
          exactMapTemplate.topologyAuditHash || "",
        ),
        exactMapTopologyRealizationHash: String(
          exactMapTemplate.topologyRealizationHash || "",
        ),
        exactMapTopologyAuditOk: exactMapTemplate.topologyAudit?.ok === true,
        exactMapTopologyObserved: stableGraphValue(
          exactMapTemplate.topologyAudit?.observedTopology || {},
        ),
        modelCount: opening.modelCount,
        rosterPointLedger: opening.rosterPointLedger,
        deploymentAudit: opening.deploymentAudit,
        presentationPieces: presentationPieces(bound.state),
        state: raw.includeFullStates === true ? bound.state : undefined,
        disposition: "strict_opening_materialized",
      });
    } catch (error) {
      const reason = String(error?.message || error);
      rejected.push({
        ...row,
        ...openingFailureDisposition(reason),
        reason,
        errorCode: String(error?.code || ""),
        evidence: stableGraphValue(error?.evidence || null),
      });
    }
  }
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_REPRESENTATIVE_OPENING_MATERIALIZER_V1_SCHEMA,
    taskKey: task.taskKey,
    taskHash: task.taskHash,
    proposedOpeningCount: proposedTasks.length,
    selectedMaterializationCount: selectedTasks.length,
    strictOpeningCount: openings.length,
    strictRejectedCount: rejected.length,
    deploymentSearchCount: deploymentCache.size,
    unresolvedCount: unresolved.length,
    openings,
    rejected,
    unresolved,
    exactMapKeys: Object.keys(raw.exactMapTemplatesByKey || {}).sort(),
    exactScenarioKeys: Object.keys(raw.scenarioBindersByKey || {}).sort(),
    globalOptimalityProven: false,
    naturalOpeningDistributionClaimed: false,
    trainingTruth: false,
    claimBoundary: "Returned openings have exact Force Builder rosters, construction-host deployment geometry and scenario binding. Missing map/scenario binders and budget-deferred combinations remain explicit; finite deployment archetypes do not exhaust continuous legal deployment space.",
  });
  return { ...core, materializationHash: stableGraphHash(core) };
}

export const WARMACHINE_REPRESENTATIVE_DEPLOYMENT_ARCHETYPES_V1 =
  DEPLOYMENT_ARCHETYPES;
