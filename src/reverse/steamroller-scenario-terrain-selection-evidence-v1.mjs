import { bindWarmachineScenarioTerrainSetupChoicesV1 } from
  "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { warmachineSteamroller2026OfficialScenarioLayoutV1 } from
  "../contracts/steamroller-2026-official-scenario-layout-v1.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { auditRulesV1SteamrollerScenarioTerrainSetup, warmachineHost } from
  "../warmachine-host-runtime.mjs";
import { buildWarmachineSteamrollerScoreTerminalAnchorProposalV1,
  WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_ROSTER_RECEIPT_V1 } from
  "./steamroller-score-terminal-anchor-proposals-v1.mjs";
import { materializeWarmachineSteamrollerScoreTerminalBatchV1 } from
  "./steamroller-score-terminal-materialization-batch-v1.mjs";
import { buildWarmachineSteamrollerTerminalScenarioCorpusV1 } from
  "./steamroller-terminal-scenario-corpus-v1.mjs";

export const WARMACHINE_STEAMROLLER_SCENARIO_TERRAIN_SELECTION_EVIDENCE_V1_SCHEMA =
  "warmachine_steamroller_scenario_terrain_selection_evidence_v1";

function terrainCandidate(terrainKey, type, xIn, yIn) {
  return {
    terrainKey,
    type,
    isForest: type === "forest",
    grantsElevation: type === "hill",
    blocksLineOfSight: type === "forest",
    xIn,
    yIn,
    widthIn: 3,
    heightIn: 3,
    geometryExactWithinScope: true,
    geometryIssues: [],
  };
}

function pressurePointNonfirstFixture() {
  const layout = warmachineSteamroller2026OfficialScenarioLayoutV1("pressure_point");
  const ordinaryTerrain = [];
  const choices = [];
  for (const [index, flag] of layout.terrain.entries()) {
    ordinaryTerrain.push(
      terrainCandidate(`${flag.terrainKey}-choice-a`, "forest", flag.xIn + 2, flag.yIn),
      terrainCandidate(`${flag.terrainKey}-choice-z`, "hill", flag.xIn - 2, flag.yIn),
    );
    choices.push({
      sourceFlagKey: flag.sourceFlagKey,
      selectedTerrainKey: `${flag.terrainKey}-choice-z`,
      setupOrderIndex: index,
    });
  }
  return { ordinaryTerrain, choices };
}

function edgeDistanceProbe() {
  const state = {
    stateKey: "scenario-terrain-edge-distance-probe-v1",
    strictMode: true,
    enforceStrictExecutor: true,
    terrain: [{
      terrainKey: "edge-distance-flag",
      type: "scenario terrain",
      isScenarioTerrain: true,
      scenarioTerrain: true,
      scenarioElement: true,
      xIn: 10,
      yIn: 10,
      widthIn: 30 / 25.4,
      heightIn: 30 / 25.4,
      radiusIn: 30 / 25.4 / 2,
      shape: "circle",
      sourceFlagKey: "edge-distance-flag",
      sourceFlagPosition: { xIn: 4, yIn: 10 },
      scenarioTerrainSetupChoiceRequired: true,
      scenarioTerrainSetupChoiceResolved: true,
      scenarioTerrainFallbackUsed: false,
      scenarioTerrainSelectionCandidateKeys: ["edge-distance-flag"],
      scenarioTerrainSelectionDistanceIn: 4.819,
      scenarioTerrainSelectionCenterDistanceIn: 6,
      scenarioTerrainSetupOrderIndex: 0,
      geometryExactWithinScope: true,
      geometryIssues: [],
    }],
  };
  return auditRulesV1SteamrollerScenarioTerrainSetup(state);
}

export function buildWarmachineSteamrollerScenarioTerrainSelectionEvidenceV1({
  corpus = null,
} = {}) {
  const baselineCorpus = corpus || buildWarmachineSteamrollerTerminalScenarioCorpusV1({
    rosterReceiptHash: WARMACHINE_STEAMROLLER_SCORE_TERMINAL_ANCHOR_ROSTER_RECEIPT_V1,
  });
  const fixture = pressurePointNonfirstFixture();
  const proposal = buildWarmachineSteamrollerScoreTerminalAnchorProposalV1(
    "pressure_point",
    {
      proposalKey: "pressure-point-multi-candidate-nonfirst-v1",
      ordinaryTerrain: fixture.ordinaryTerrain,
      scenarioTerrainChoices: fixture.choices,
    },
  );
  const batch = materializeWarmachineSteamrollerScoreTerminalBatchV1({
    corpus: baselineCorpus,
    proposals: [proposal],
  });
  if (batch.strictMaterializedRootCount !== 1 || batch.runtimeRoots.length !== 1) {
    throw new Error(`scenario_terrain_selection_materialization_failed:${batch.batchHash}`);
  }
  const publicRoot = batch.results[0];
  const runtimeRoot = batch.runtimeRoots[0];
  const setupAudit = auditRulesV1SteamrollerScenarioTerrainSetup(
    runtimeRoot.predecessorState,
  );
  const edgeProbe = edgeDistanceProbe();
  if (!setupAudit.ok ||
      setupAudit.setupClassKey !== "at_least_one_nonfirst_candidate_selected" ||
      setupAudit.entryCount !== 4 ||
      !setupAudit.entries.every((entry) => entry.candidateKeys.length === 2) ||
      !edgeProbe.ok || edgeProbe.entries?.[0]?.selectedCenterDistanceIn <= 5 ||
      edgeProbe.entries?.[0]?.selectedDistanceIn > 5) {
    throw new Error(`scenario_terrain_selection_audit_failed:${stableGraphHash({
      setupAudit,
      edgeProbe,
    })}`);
  }
  const root = stableGraphValue({
    ...publicRoot,
    setupAuditHash: stableGraphHash(setupAudit),
    setupClassKey: setupAudit.setupClassKey,
    selectedScenarioTerrainKeys: setupAudit.entries.map((entry) => entry.terrainKey).sort(),
    candidateCountByFlag: Object.fromEntries(setupAudit.entries.map((entry) => [
      entry.sourceFlagKey,
      entry.candidateKeys.length,
    ])),
    edgeDistanceProbeHash: stableGraphHash(edgeProbe),
  });
  const core = {
    schemaVersion: WARMACHINE_STEAMROLLER_SCENARIO_TERRAIN_SELECTION_EVIDENCE_V1_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    strictMaterializedRootCount: 1,
    strictRejectedRootCount: 0,
    roots: [root],
    setupAudit: stableGraphValue(setupAudit),
    edgeDistanceProbe: stableGraphValue(edgeProbe),
    claimBoundary: "This evidence proves one exact Pressure Point terminal root where all four flags had two valid ordinary-terrain candidates and the player selected the nonfirst candidate for every flag. The current Host recomputes candidates from exact terrain geometry and setup order, executes two historical scoring windows plus the terminal settlement, and independently replays the terminal action. It does not prove the remaining Scenario Terrain setup partitions, arbitrary tournament tables, deployment reachability, strategy value or training truth.",
    trainingTruth: false,
  };
  return {
    evidence: stableGraphValue({ ...core, evidenceHash: stableGraphHash(core) }),
    runtimeRoot,
  };
}
