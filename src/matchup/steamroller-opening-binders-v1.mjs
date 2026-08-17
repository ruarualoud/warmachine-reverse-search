import { warmachineSteamroller2026OfficialScenarioLayoutV1 } from
  "../contracts/steamroller-2026-official-scenario-layout-v1.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { orientWarmachineSteamrollerDeploymentLayoutV1 } from
  "./steamroller-opening-map-template-v1.mjs";
import { bindWarmachineScenarioTerrainSetupChoicesV1 } from
  "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import {
  auditRulesV1StaticPlacement,
  auditRulesV1SteamrollerScenarioTerrainSetup,
  normalizeRulesV1State,
  steamroller2026ScenarioProfile,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";

const RUNTIME_WINDOW_FIELDS = Object.freeze([
  "unitActivationWindow",
  "anyTimeActivationWindow",
  "initialAttackWindow",
  "combatPurchaseWindow",
  "activationForfeitWindow",
  "vengeanceWindow",
]);

export const WARMACHINE_STEAMROLLER_OPENING_BINDER_SCENARIO_KEYS_V1 =
  Object.freeze([
    "trench_warfare",
    "two_fronts",
    "wolves_at_our_heels",
    "pressure_point",
    "high_stakes",
    "fault_line",
    "payload",
  ]);

function openingBindingError(code = "", details = {}) {
  const evidenceHash = stableGraphHash(details);
  const error = new Error(`${code}:${details.scenarioKey || ""}:${evidenceHash}`);
  error.code = code;
  error.evidence = stableGraphValue(details);
  return error;
}

function resetOpeningRuntimeState(stateInput = {}, firstPlayerSideKey = "player1") {
  const state = structuredClone(stateInput);
  for (const field of RUNTIME_WINDOW_FIELDS) delete state[field];
  for (const piece of state.pieces || []) piece.activated = false;
  state.activeSideKey = firstPlayerSideKey;
  state.phaseKey = "control";
  state.turnNumber = 1;
  state.strictMode = true;
  state.enforceStrictExecutor = true;
  state.metadata = {
    ...(state.metadata || {}),
    strictMode: true,
    enforceStrictExecutor: true,
    scenarioOpeningBinderKey: "steamroller_2026_official_fallback_v1",
  };
  return state;
}

function initializeScenarioSpecialState(scenarioKey = "", layout = {}) {
  const objectives = structuredClone(layout.objectives || []);
  const terrain = structuredClone(layout.terrain || []);
  if (scenarioKey === "high_stakes") {
    for (const objective of objectives) {
      if (Number(objective.baseSizeMm) === 50) objective.countdownTokens = 5;
    }
    for (const entry of terrain) entry.countdownTokens = 5;
  }
  if (scenarioKey === "wolves_at_our_heels") {
    for (const objective of objectives) {
      if (Number(objective.baseSizeMm) === 40) objective.progressTokens = 0;
    }
  }
  return { objectives, terrain };
}

function selectScenarioTerrainForPartition(
  stateInput = {},
  scenarioKey = "",
  requestedSetupClassKey = "",
) {
  const state = normalizeRulesV1State(stateInput);
  const audit = auditRulesV1SteamrollerScenarioTerrainSetup(state);
  const requested = String(requestedSetupClassKey || "");
  if (!requested || requested === audit.setupClassKey) {
    if (!audit.ok) {
      throw new Error(`steamroller_opening_scenario_terrain_invalid:${
        scenarioKey}:${stableGraphHash(audit)}`);
    }
    return { state, audit };
  }
  if (requested === "all_selected_from_single_candidate") {
    const choices = (audit.entries || []).map((entry, index) => ({
      sourceFlagKey: String(entry.sourceFlagKey || ""),
      selectedTerrainKey: entry.candidateKeys?.length === 1
        ? String(entry.candidateKeys[0]) : "",
      setupOrderIndex: index,
    }));
    if (!choices.length || choices.some((choice) =>
      !choice.sourceFlagKey || !choice.selectedTerrainKey)) {
      throw new Error(`steamroller_opening_scenario_terrain_partition_unavailable:${
        scenarioKey}:${requested}`);
    }
    const bound = bindWarmachineScenarioTerrainSetupChoicesV1(state, choices);
    if (bound.audit.setupClassKey !== requested) {
      throw new Error(`steamroller_opening_scenario_terrain_partition_mismatch:${
        scenarioKey}:${requested}:${bound.audit.setupClassKey}`);
    }
    return bound;
  }
  throw new Error(`steamroller_opening_scenario_terrain_partition_unavailable:${
    scenarioKey}:${requested}:${audit.setupClassKey}`);
}

export function bindWarmachineSteamrollerFallbackOpeningV1(
  openingStateInput = {},
  rawOptions = {},
) {
  const scenarioKey = String(rawOptions.scenarioKey || "");
  if (!WARMACHINE_STEAMROLLER_OPENING_BINDER_SCENARIO_KEYS_V1.includes(
    scenarioKey,
  )) {
    throw new Error(`steamroller_opening_scenario_unsupported:${scenarioKey}`);
  }
  const firstPlayerSideKey = String(rawOptions.firstPlayerSideKey || "player1");
  if (!["player1", "player2"].includes(firstPlayerSideKey)) {
    throw new Error(`steamroller_opening_first_player_invalid:${firstPlayerSideKey}`);
  }
  const defenderSideKey = firstPlayerSideKey === "player1" ? "player2" : "player1";
  const profile = steamroller2026ScenarioProfile(scenarioKey);
  const sourceLayout = warmachineSteamroller2026OfficialScenarioLayoutV1(scenarioKey);
  if (!profile || !sourceLayout || profile.scenarioKey !== scenarioKey ||
      sourceLayout.scenarioKey !== scenarioKey) {
    throw new Error(`steamroller_opening_source_unavailable:${scenarioKey}`);
  }
  const layout = orientWarmachineSteamrollerDeploymentLayoutV1(
    sourceLayout,
    firstPlayerSideKey,
  );
  const sourceState = normalizeRulesV1State(openingStateInput);
  const state = resetOpeningRuntimeState(sourceState, firstPlayerSideKey);
  const special = initializeScenarioSpecialState(scenarioKey, layout);
  state.terrain = [
    ...(state.terrain || []).filter((terrain) =>
      terrain?.isScenarioTerrain !== true &&
      String(terrain?.type || "").toLowerCase() !== "scenario terrain"),
    ...special.terrain,
  ];
  state.board = { widthIn: 48, heightIn: 48, ...(state.board || {}) };
  state.deploymentBackEdgeBySide = structuredClone(layout.deploymentBackEdgeBySide);
  state.deploymentZones = Object.values(layout.deployments || {}).map((zone) => ({
    ...structuredClone(zone),
    zoneKey: String(zone.id || zone.zoneKey || ""),
    deploymentZoneKey: String(zone.id || zone.deploymentZoneKey || ""),
    xIn: Number(zone.xIn ?? zone.x),
    yIn: Number(zone.yIn ?? zone.y),
    widthIn: Number(zone.widthIn ?? zone.width),
    heightIn: Number(zone.heightIn ?? zone.height),
    deploymentZoneExactWithinScope: zone.geometryExactWithinScope === true,
  }));
  state.deploymentComplete = true;
  state.scenario = {
    packetKey: "steamroller-2026",
    packetYear: "2026",
    scenarioKey,
    scenarioName: profile.name,
    attackerSideKey: firstPlayerSideKey,
    defenderSideKey,
    scoringStartSideKey: defenderSideKey,
    scoringStartTurnNumber: 2,
    fixedRoundLimit: Number(profile.fixedRoundLimit || 0),
    deploymentZoneCount: state.deploymentZones.length,
    score: { player1: 0, player2: 0 },
    objectives: special.objectives,
    caches: structuredClone(layout.caches || []),
    scenarioState: {},
  };
  state.stateKey = String(rawOptions.stateKey ||
    `${scenarioKey}-opening-${stableGraphHash({
      sourceStateKey: sourceState.stateKey,
      pieces: state.pieces,
      firstPlayerSideKey,
    })}`);
  const scenarioTerrainBinding = selectScenarioTerrainForPartition(
    state,
    scenarioKey,
    rawOptions.scenarioTerrainSetupClassKey,
  );
  const normalized = scenarioTerrainBinding.state;
  const scenarioTerrainSetupAudit = scenarioTerrainBinding.audit;
  const staticPlacementAudit = auditRulesV1StaticPlacement(normalized);
  if (!staticPlacementAudit.ok) {
    throw openingBindingError("steamroller_opening_static_placement_invalid", {
      scenarioKey,
      scenarioTerrainSetupClassKey: scenarioTerrainSetupAudit.setupClassKey,
      audit: staticPlacementAudit,
    });
  }
  const core = stableGraphValue({
    schemaVersion: "warmachine_steamroller_opening_binding_v1",
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    sourceStateKey: String(sourceState.stateKey || ""),
    stateKey: normalized.stateKey,
    stateHash: stableGraphHash(normalized),
    scenarioKey,
    scenarioName: profile.name,
    firstPlayerSideKey,
    defenderSideKey,
    scoringStartSideKey: defenderSideKey,
    scoringStartTurnNumber: 2,
    fixedRoundLimit: Number(profile.fixedRoundLimit || 0),
    deploymentZoneCount: normalized.deploymentZones.length,
    objectiveCount: normalized.scenario.objectives.length,
    cacheCount: normalized.scenario.caches.length,
    scenarioTerrainCount: normalized.terrain.filter((terrain) =>
      terrain.isScenarioTerrain).length,
    scenarioTerrainSetupClassKey: scenarioTerrainSetupAudit.setupClassKey,
    scenarioTerrainSetupAuditHash: stableGraphHash(scenarioTerrainSetupAudit),
    staticPlacementAuditHash: stableGraphHash(staticPlacementAudit),
    geometrySourceSchemaVersion: layout.schemaVersion,
    geometrySourceImageHash: layout.sha256,
    strictMode: normalized.strictMode === true,
  });
  return {
    ...core,
    bindingHash: stableGraphHash(core),
    scenarioTerrainSetupAudit,
    staticPlacementAudit,
    state: normalized,
  };
}

export function buildWarmachineSteamrollerFallbackOpeningBindersV1() {
  return Object.fromEntries(WARMACHINE_STEAMROLLER_OPENING_BINDER_SCENARIO_KEYS_V1.map(
    (scenarioKey) => [scenarioKey, (state, rawOptions = {}) =>
      bindWarmachineSteamrollerFallbackOpeningV1(state, {
        ...rawOptions,
        scenarioKey,
      })],
  ));
}
