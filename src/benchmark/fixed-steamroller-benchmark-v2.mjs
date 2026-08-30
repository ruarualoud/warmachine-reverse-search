import {
  applyRulesV1Action,
  auditRulesV1SteamrollerScenarioTerrainSetup,
  buildRulesV1GeneratedMovementTargetPlan,
  buildWarmachineRulesV1ActionWithStrictRngOutcome,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  steamroller2026ScenarioProfile,
  strictOpponentReactionRequirementsForAction,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { warmachineSteamroller2026OfficialScenarioLayoutV1 } from
  "../contracts/steamroller-2026-official-scenario-layout-v1.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { buildWarmachineActivationGroups } from "../search/matchup-search-v1.mjs";
import { warmachineBenchmarkGameStateHashV2 } from
  "./benchmark-game-state-hash-v2.mjs";

export const WARMACHINE_FIXED_STEAMROLLER_BENCHMARK_V2_SCHEMA =
  "warmachine_fixed_steamroller_benchmark_v2";

const TWO_FRONTS_LAYOUT = warmachineSteamroller2026OfficialScenarioLayoutV1("two_fronts");
const TWO_FRONTS_OBJECTIVES = Object.freeze(TWO_FRONTS_LAYOUT.objectives);
const TWO_FRONTS_TERRAIN = Object.freeze(TWO_FRONTS_LAYOUT.terrain[0]);

const RUNTIME_WINDOW_FIELDS = Object.freeze([
  "unitActivationWindow",
  "anyTimeActivationWindow",
  "initialAttackWindow",
  "combatPurchaseWindow",
  "activationForfeitWindow",
  "vengeanceWindow",
]);

function clone(value) {
  return structuredClone(value);
}

function alive(piece = {}) {
  return piece.destroyed !== true && piece.removedFromPlay !== true &&
    Number(piece.boxesRemaining ?? piece.damage?.boxesRemaining ?? 1) > 0;
}

function addPieceKeys(output, value) {
  if (Array.isArray(value)) {
    for (const entry of value) addPieceKeys(output, entry);
    return;
  }
  const pieceKey = String(value || "");
  if (pieceKey) output.add(pieceKey);
}

function runtimeWindowActorPieceKeys(state = {}) {
  const keys = new Set();
  const unit = state.unitActivationWindow || {};
  addPieceKeys(keys, unit.currentTrooperPieceKey);
  addPieceKeys(keys, unit.selectedModelPieceKey);
  addPieceKeys(keys, unit.pendingTrooperPieceKeys);
  addPieceKeys(keys, unit.charge?.pendingTrooperPieceKeys);
  addPieceKeys(keys, unit.assault?.pendingTrooperPieceKeys);
  addPieceKeys(keys, unit.aim?.pendingTrooperPieceKeys);
  for (const field of RUNTIME_WINDOW_FIELDS.slice(1)) {
    const window = state[field] || {};
    addPieceKeys(keys, window.actorPieceKey);
    addPieceKeys(keys, window.activationActorPieceKey);
    addPieceKeys(keys, window.selectedModelPieceKey);
    addPieceKeys(keys, window.currentPieceKey);
    addPieceKeys(keys, window.pendingActorPieceKeys);
    addPieceKeys(keys, window.pendingPieceKeys);
    addPieceKeys(keys, window.eligiblePieceKeys);
  }
  const active = new Set((state.pieces || [])
    .filter((piece) => piece.sideKey === state.activeSideKey && alive(piece))
    .map((piece) => piece.pieceKey));
  return [...keys].filter((pieceKey) => active.has(pieceKey)).sort();
}

function runtimeWindowActive(state = {}) {
  return RUNTIME_WINDOW_FIELDS.some((field) => {
    const window = state[field];
    return Boolean(window?.active || window?.phase);
  });
}

export {
  runtimeWindowActive as warmachineBenchmarkRuntimeWindowActiveV2,
  runtimeWindowActorPieceKeys as warmachineBenchmarkRuntimeWindowActorPieceKeysV2,
};

function resetOpeningRuntimeState(state = {}) {
  const next = clone(state);
  for (const field of RUNTIME_WINDOW_FIELDS) delete next[field];
  for (const piece of next.pieces || []) piece.activated = false;
  next.activeSideKey = "player1";
  next.phaseKey = "control";
  next.turnNumber = 1;
  next.strictMode = true;
  next.enforceStrictExecutor = true;
  next.metadata = {
    ...(next.metadata || {}),
    strictMode: true,
    enforceStrictExecutor: true,
    benchmarkKey: "sepsira-six-swarms-vs-fane-two-fronts-v2",
  };
  return next;
}

export function bindWarmachineScenarioTerrainSetupChoicesV1(
  stateInput = {},
  rawChoices = [],
) {
  const state = structuredClone(stateInput);
  const choices = [...rawChoices].map((choice, index) => ({
    sourceFlagKey: String(choice.sourceFlagKey || ""),
    selectedTerrainKey: String(choice.selectedTerrainKey || ""),
    setupOrderIndex: Math.max(0, Number(choice.setupOrderIndex ?? index)),
  })).sort((left, right) => left.setupOrderIndex - right.setupOrderIndex ||
    left.sourceFlagKey.localeCompare(right.sourceFlagKey));
  const flags = (state.terrain || []).filter((terrain) =>
    terrain.isScenarioTerrain || terrain.scenarioTerrain || terrain.scenarioElement);
  if (flags.length !== choices.length) {
    throw new Error(`Scenario Terrain choice count mismatch: ${choices.length}/${flags.length}`);
  }
  for (const choice of choices) {
    const flagIndex = state.terrain.findIndex((terrain) =>
      String(terrain.sourceFlagKey || terrain.terrainKey || "") === choice.sourceFlagKey);
    const selectedIndex = state.terrain.findIndex((terrain) =>
      String(terrain.terrainKey || "") === choice.selectedTerrainKey);
    if (flagIndex < 0 || selectedIndex < 0 || flagIndex === selectedIndex) {
      throw new Error(`Scenario Terrain choice unavailable: ${choice.sourceFlagKey}:${choice.selectedTerrainKey}`);
    }
    const flag = state.terrain[flagIndex];
    const selected = state.terrain[selectedIndex];
    state.terrain[selectedIndex] = {
      ...selected,
      isScenarioTerrain: true,
      scenarioTerrain: true,
      scenarioElement: true,
      ownerSideKey: flag.ownerSideKey,
      sourceFlagKey: flag.sourceFlagKey || flag.terrainKey,
      sourceFlagPosition: { xIn: flag.xIn, yIn: flag.yIn },
      scenarioTerrainSetupChoiceRequired: true,
      scenarioTerrainSetupChoiceResolved: true,
      scenarioTerrainFallbackUsed: false,
      scenarioTerrainSelectionCandidateKeys: [],
      scenarioTerrainSetupOrderIndex: choice.setupOrderIndex,
      geometryExactWithinScope: true,
      geometryIssues: [],
      placementMode: "player_selected_terrain_within_5in_of_official_flag",
      placementSource: `${flag.placementSource || "steamroller_2026_flag"}_plus_selected_terrain`,
    };
    state.terrain.splice(flagIndex, 1);
  }
  let normalized = normalizeRulesV1State(state);
  const provisional = auditRulesV1SteamrollerScenarioTerrainSetup(normalized);
  for (const entry of provisional.entries || []) {
    if (entry.selectedDistanceIn == null) continue;
    const selected = state.terrain.find((terrain) => terrain.terrainKey === entry.terrainKey);
    selected.scenarioTerrainSelectionCandidateKeys = entry.candidateKeys;
    selected.scenarioTerrainSelectionDistanceIn = entry.selectedDistanceIn;
    selected.scenarioTerrainSelectionCenterDistanceIn = entry.selectedCenterDistanceIn;
  }
  normalized = normalizeRulesV1State(state);
  const audit = auditRulesV1SteamrollerScenarioTerrainSetup(normalized);
  if (!audit.ok) {
    throw new Error(`Scenario Terrain choices are invalid: ${stableGraphHash(audit)}`);
  }
  return { state: normalized, audit };
}

export function bindWarmachineTwoFrontsOpeningV2(openingStateInput = {}, rawOptions = {}) {
  const sourceState = normalizeRulesV1State(openingStateInput);
  const state = resetOpeningRuntimeState(sourceState);
  const profile = steamroller2026ScenarioProfile("Two Fronts");
  if (!profile || profile.scenarioKey !== "two_fronts") {
    throw new Error("Steamroller 2026 Two Fronts profile is unavailable");
  }
  const retainedTerrain = (state.terrain || []).filter((terrain) =>
    terrain?.isScenarioTerrain !== true && String(terrain?.type || "").toLowerCase() !== "scenario terrain");
  const selectedScenarioTerrainKey = String(
    rawOptions.selectedScenarioTerrainKey || "center_obstruction",
  );
  const selectedScenarioTerrainIndex = retainedTerrain.findIndex((terrain) =>
    String(terrain.terrainKey || "") === selectedScenarioTerrainKey);
  if (selectedScenarioTerrainIndex < 0) {
    throw new Error(`Two Fronts scenario terrain selection is unavailable: ${selectedScenarioTerrainKey}`);
  }
  const selectedScenarioTerrain = retainedTerrain[selectedScenarioTerrainIndex];
  const flagDistanceIn = Math.hypot(
    Number(selectedScenarioTerrain.xIn || 0) - Number(TWO_FRONTS_TERRAIN.xIn || 0),
    Number(selectedScenarioTerrain.yIn || 0) - Number(TWO_FRONTS_TERRAIN.yIn || 0),
  );
  retainedTerrain[selectedScenarioTerrainIndex] = {
    ...selectedScenarioTerrain,
    isScenarioTerrain: true,
    scenarioTerrain: true,
    scenarioElement: true,
    ownerSideKey: TWO_FRONTS_TERRAIN.ownerSideKey,
    sourceFlagKey: TWO_FRONTS_TERRAIN.sourceFlagKey,
    sourceFlagPosition: { xIn: TWO_FRONTS_TERRAIN.xIn, yIn: TWO_FRONTS_TERRAIN.yIn },
    scenarioTerrainSetupChoiceRequired: true,
    scenarioTerrainSetupChoiceResolved: true,
    scenarioTerrainFallbackUsed: false,
    scenarioTerrainSelectionCandidateKeys: [],
    scenarioTerrainSelectionCenterDistanceIn: flagDistanceIn,
    scenarioTerrainSetupOrderIndex: 0,
    geometryExactWithinScope: true,
    geometryIssues: [],
    placementMode: "player_selected_terrain_within_5in_of_official_flag",
    placementSource: "official_steamroller_2026_map_2_plus_selected_terrain",
  };
  state.terrain = retainedTerrain;
  state.board = { widthIn: 48, heightIn: 48, ...(state.board || {}) };
  state.deploymentBackEdgeBySide = { player1: "south", player2: "north" };
  const attackerSideKey = String(rawOptions.firstPlayerSideKey ||
    rawOptions.attackerSideKey || "player1");
  if (!["player1", "player2"].includes(attackerSideKey)) {
    throw new Error(`Two Fronts attacker side is invalid: ${attackerSideKey}`);
  }
  const defenderSideKey = attackerSideKey === "player1" ? "player2" : "player1";
  state.scenario = {
    packetKey: "steamroller-2026",
    packetYear: "2026",
    scenarioName: "Two Fronts",
    attackerSideKey,
    defenderSideKey,
    scoringStartSideKey: defenderSideKey,
    scoringStartTurnNumber: 2,
    score: { player1: 0, player2: 0 },
    objectives: clone(TWO_FRONTS_OBJECTIVES),
    caches: [],
    scenarioState: {},
  };
  state.stateKey = String(rawOptions.stateKey ||
    `two-fronts-opening-${stableGraphHash({ sourceStateKey: sourceState.stateKey, pieces: state.pieces })}`);
  const provisional = normalizeRulesV1State(state);
  const provisionalSetupAudit =
    auditRulesV1SteamrollerScenarioTerrainSetup(provisional);
  const provisionalEntry = provisionalSetupAudit.entries?.find((entry) =>
    entry.terrainKey === selectedScenarioTerrainKey);
  if (!provisionalEntry || provisionalEntry.selectedDistanceIn == null) {
    throw new Error(`Two Fronts scenario terrain selection exceeds 5 inches: ${selectedScenarioTerrainKey}`);
  }
  const selectedIndex = state.terrain.findIndex((terrain) =>
    terrain.terrainKey === selectedScenarioTerrainKey);
  state.terrain[selectedIndex].scenarioTerrainSelectionCandidateKeys =
    provisionalEntry.candidateKeys;
  state.terrain[selectedIndex].scenarioTerrainSelectionDistanceIn =
    provisionalEntry.selectedDistanceIn;
  state.terrain[selectedIndex].scenarioTerrainSelectionCenterDistanceIn =
    provisionalEntry.selectedCenterDistanceIn;
  const normalized = normalizeRulesV1State(state);
  const scenarioTerrainSetupAudit =
    auditRulesV1SteamrollerScenarioTerrainSetup(normalized);
  if (!scenarioTerrainSetupAudit.ok) {
    throw new Error(`Two Fronts scenario terrain selection is invalid: ${stableGraphHash(
      scenarioTerrainSetupAudit,
    )}`);
  }
  const leaders = normalized.pieces.filter((piece) => piece.isWarcaster || piece.isWarlock);
  const swarmGroups = new Set(normalized.pieces
    .filter((piece) => /mechanithrall swarm/i.test(`${piece.label || ""} ${piece.name || ""}`))
    .map((piece) => String(piece.unitGroupId || piece.unitId || piece.rosterEntryId || piece.pieceKey)));
  const core = {
    schemaVersion: "warmachine_two_fronts_opening_binding_v2",
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    sourceStateKey: String(sourceState.stateKey || ""),
    stateKey: normalized.stateKey,
    stateHash: stableGraphHash(normalized),
    scenarioKey: profile.scenarioKey,
    scenarioName: normalized.scenario.scenarioName,
    modelCount: normalized.pieces.length,
    leaderPieceKeys: leaders.map((piece) => piece.pieceKey).sort(),
    mechanithrallSwarmGroupCount: swarmGroups.size,
    retainedOrdinaryTerrainCount: retainedTerrain.length,
    scenarioTerrainCount: normalized.terrain.filter((terrain) => terrain.isScenarioTerrain).length,
    selectedScenarioTerrainKey,
    scenarioTerrainFallbackUsed: false,
    scenarioTerrainSetupAuditHash: stableGraphHash(scenarioTerrainSetupAudit),
    objectiveCount: normalized.scenario.objectives.length,
    firstPlayerSideKey: normalized.activeSideKey,
    strictMode: normalized.strictMode === true,
  };
  return { ...core, bindingHash: stableGraphHash(core), state: normalized };
}

export function bindWarmachineBenchmarkExplicitMovementPathV2(
  stateInput = {},
  rawPlan = {},
) {
  const state = normalizeRulesV1State(stateInput);
  const actorPieceKey = String(rawPlan.actorPieceKey || "");
  const actor = state.pieces.find((piece) => piece.pieceKey === actorPieceKey);
  if (!actor) throw new Error(`Explicit movement path actor is unavailable: ${actorPieceKey}`);
  const requestedActionType = String(rawPlan.actionType || "advance");
  const actionType = ["advance", "run", "charge"].includes(requestedActionType)
    ? requestedActionType
    : "advance";
  const targetPieceKey = String(rawPlan.targetPieceKey || "");
  if (actionType === "charge" && !targetPieceKey) {
    throw new Error("Explicit charge path requires targetPieceKey");
  }
  const waypoints = (rawPlan.waypoints || []).map((entry) => ({
    xIn: Number(entry.xIn),
    yIn: Number(entry.yIn),
  }));
  if (!waypoints.length || waypoints.some((entry) =>
    !Number.isFinite(entry.xIn) || !Number.isFinite(entry.yIn))) {
    throw new Error("Explicit movement path requires finite waypoints");
  }
  const rawPathsByModel = rawPlan.pathsByModel || rawPlan.modelPaths || [];
  const pathEntries = Array.isArray(rawPathsByModel)
    ? rawPathsByModel
    : Object.entries(rawPathsByModel).map(([pieceKey, entry]) => ({
      pieceKey,
      ...(Array.isArray(entry) ? { waypoints: entry } : entry),
    }));
  const pathsByModel = pathEntries.map((entry = {}) => {
    const pieceKey = String(entry.pieceKey || entry.modelPieceKey || "");
    const modelWaypoints = (entry.waypoints || []).map((waypoint) => ({
      xIn: Number(waypoint.xIn),
      yIn: Number(waypoint.yIn),
    }));
    if (!pieceKey || !modelWaypoints.length || modelWaypoints.some((waypoint) =>
      !Number.isFinite(waypoint.xIn) || !Number.isFinite(waypoint.yIn))) {
      throw new Error("Explicit unit movement paths require a pieceKey and finite waypoints");
    }
    return { pieceKey, waypoints: modelWaypoints };
  }).sort((left, right) => left.pieceKey.localeCompare(right.pieceKey));
  const pathKey = String(rawPlan.pathKey ||
    `reverse-candidate-${stableGraphHash({
      actorPieceKey,
      actionType,
      targetPieceKey,
      waypoints,
      pathsByModel,
    }).slice(0, 16)}`);
  const path = {
    key: pathKey,
    pathKey,
    label: String(rawPlan.label || "Reverse candidate strict path"),
    actorPieceKey,
    actionType,
    ...(targetPieceKey ? { targetPieceKey } : {}),
    waypoints,
    ...(pathsByModel.length ? { pathsByModel } : {}),
    reverseCandidatePath: true,
    proposalSource: String(rawPlan.proposalSource || "terminal_predecessor_geometry_v2"),
  };
  state.explicitMovementPaths = [
    ...(state.explicitMovementPaths || []).filter((entry) =>
      String(entry.pathKey || entry.key || "") !== pathKey),
    path,
  ];
  state.stateKey = `${state.stateKey || "benchmark"}:path:${stableGraphHash(path).slice(0, 16)}`;
  return normalizeRulesV1State(state);
}

export function enumerateWarmachineBenchmarkActionsV2(stateInput = {}, rawScope = {}) {
  const state = normalizeRulesV1State(stateInput);
  const inputStateHash = stableGraphHash(state);
  const inputGameStateHash = warmachineBenchmarkGameStateHashV2(state);
  const runtimeActorKeys = runtimeWindowActive(state) ? runtimeWindowActorPieceKeys(state) : [];
  let actorPieceKeys = Array.isArray(rawScope.actorPieceKeys)
    ? rawScope.actorPieceKeys.map(String).filter(Boolean).sort()
    : runtimeActorKeys;
  let activationGroup = null;
  if (!actorPieceKeys.length && rawScope.activationGroupKey) {
    activationGroup = buildWarmachineActivationGroups(state)
      .find((group) => group.groupKey === rawScope.activationGroupKey) || null;
    actorPieceKeys = activationGroup?.actorPieceKeys || [];
  }
  const options = {
    ...(actorPieceKeys.length ? { actorPieceKeys } : {}),
    ...(Array.isArray(rawScope.targetPieceKeys) ? { targetPieceKeys: rawScope.targetPieceKeys } : {}),
    ...(Array.isArray(rawScope.actionFamilyKeys) ? { actionFamilyKeys: rawScope.actionFamilyKeys } : {}),
    ...(Array.isArray(rawScope.movementPathKindKeys)
      ? { movementPathKindKeys: rawScope.movementPathKindKeys }
      : {}),
    ...(Array.isArray(rawScope.generatedMovementTargetKeys)
      ? { generatedMovementTargetKeys: rawScope.generatedMovementTargetKeys }
      : {}),
    ...(rawScope.generatedMovementTargetPhase
      ? { generatedMovementTargetPhase: rawScope.generatedMovementTargetPhase }
      : {}),
    ...(rawScope.knownRegularMovementActionByActor
      ? { knownRegularMovementActionByActor: rawScope.knownRegularMovementActionByActor }
      : {}),
    ...(rawScope.includeActorlessActions === true ? { includeActorlessActions: true } : {}),
    ...(rawScope.includeUntargetedActions === false ? { includeUntargetedActions: false } : {}),
  };
  const enumeration = enumerateRulesV1Actions(state, options);
  return {
    // rules-v1 trusts a scoped enumeration only when apply receives this exact state object.
    state: enumeration.state,
    inputStateHash,
    inputGameStateHash,
    enumerationStateHash: stableGraphHash(enumeration.state),
    enumerationGameStateHash: warmachineBenchmarkGameStateHashV2(
      enumeration.state,
    ),
    activationGroup,
    runtimeWindowActive: runtimeWindowActive(state),
    actorPieceKeys,
    options,
    enumeration,
  };
}

export function buildWarmachineBenchmarkMovementScopeV2(
  stateInput = {},
  actorPieceKeys = [],
  waypoint = {},
  rawOptions = {},
) {
  const state = normalizeRulesV1State(stateInput);
  const plan = buildRulesV1GeneratedMovementTargetPlan(state, { actorPieceKeys });
  const maximumTargetsPerActionType = Math.max(1, Number(rawOptions.maximumTargetsPerActionType || 1));
  const requestedActionTypes = new Set(rawOptions.actionTypes || ["run", "advance"]);
  const selected = [];
  for (const actionType of requestedActionTypes) {
    selected.push(...plan.descriptors
      .filter((descriptor) => descriptor.phase === "tactical" && descriptor.actionType === actionType)
      .sort((left, right) => distance(left.point, waypoint) - distance(right.point, waypoint) ||
        left.targetScopeKey.localeCompare(right.targetScopeKey))
      .slice(0, maximumTargetsPerActionType));
  }
  return {
    actionFamilyKeys: ["movement", "timing"],
    generatedMovementTargetPhase: "tactical",
    generatedMovementTargetKeys: selected.map((descriptor) => descriptor.targetScopeKey),
    movementPathKindKeys: ["ordinary_or_no_path", "auto_routed_path", "explicit_path"],
    planCandidateCount: plan.candidateCount,
    selectedDescriptors: selected,
  };
}

function selectedAction(enumeration = {}, selector = {}) {
  if (selector.actionKey) {
    return (enumeration.actions || []).find((action) => action.actionKey === selector.actionKey) || null;
  }
  return (enumeration.actions || []).find((action) =>
    (!selector.actionType || action.actionType === selector.actionType) &&
    (!selector.actorPieceKey || action.actorPieceKey === selector.actorPieceKey) &&
    (!selector.targetPieceKey || action.targetPieceKey === selector.targetPieceKey)) || null;
}

function materializeStrictAction(state, enumeration, action, rawOptions = {}) {
  rawOptions.onProgress?.({ stage: "before_reaction_requirements", actionKey: action.actionKey });
  const reactionRequirements = strictOpponentReactionRequirementsForAction(
    action,
    { rulesV1State: state, rulesV1Enumeration: enumeration },
    state.activeSideKey,
  );
  rawOptions.onProgress?.({
    stage: "after_reaction_requirements",
    actionKey: action.actionKey,
    reactionRequirementCount: reactionRequirements.length,
  });
  rawOptions.onProgress?.({ stage: "before_rng_materialization", actionKey: action.actionKey });
  const baseAction = buildWarmachineRulesV1ActionWithStrictRngOutcome(action, {
    room: {
      id: String(rawOptions.routeKey || "fixed-steamroller-benchmark-v2"),
      game: {
        round: state.turnNumber,
        turnNumber: state.turnNumber,
        activeSideKey: state.activeSideKey,
      },
    },
    sourceContext: { rulesV1State: state, rulesV1Enumeration: enumeration },
    selectedActionKey: action.actionKey,
    reactionResolutionPolicy: String(rawOptions.reactionResolutionPolicy || ""),
    humanReactionChoices: rawOptions.humanReactionChoices || null,
  });
  rawOptions.onProgress?.({ stage: "after_rng_materialization", actionKey: action.actionKey });
  const actionPatch = clone(rawOptions.actionPatch || {});
  const patchedStrictRollOutcome = actionPatch.strictRollOutcome
    ? {
      ...(baseAction.strictRollOutcome || baseAction.metadata?.strictRollOutcome || {}),
      ...clone(actionPatch.strictRollOutcome),
    }
    : null;
  return {
    reactionRequirements,
    action: {
      ...baseAction,
      ...actionPatch,
      ...(patchedStrictRollOutcome ? { strictRollOutcome: patchedStrictRollOutcome } : {}),
      metadata: {
        ...(baseAction.metadata || {}),
        ...(actionPatch.metadata || {}),
        ...(patchedStrictRollOutcome ? {
          strictRollOutcome: clone(patchedStrictRollOutcome),
          strictChanceOutcomeSource: "exact_basic_primary_attack_equivalence_class_v1",
        } : {}),
      },
      __warmachineTrustedRulesV1Enumeration: enumeration,
    },
  };
}

export function executeScopedWarmachineBenchmarkActionV2(scoped, action, selector, rawOptions = {}) {
  const materialized = materializeStrictAction(
    scoped.state,
    scoped.enumeration,
    action,
    rawOptions,
  );
  rawOptions.onProgress?.({ stage: "before_rules_apply", actionKey: action.actionKey });
  const transition = applyRulesV1Action(scoped.state, materialized.action);
  rawOptions.onProgress?.({
    stage: "after_rules_apply",
    actionKey: action.actionKey,
    transitionOk: transition.ok === true,
  });
  const persistedAction = { ...materialized.action };
  delete persistedAction.__warmachineTrustedRulesV1Enumeration;
  const normalizedNextState = transition.nextState
    ? normalizeRulesV1State(transition.nextState)
    : null;
  const receiptCore = {
    schemaVersion: "warmachine_fixed_benchmark_step_receipt_v2",
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    stateHashInput: scoped.inputStateHash,
    stateHashBefore: scoped.enumerationStateHash,
    gameStateHashInput: scoped.inputGameStateHash,
    gameStateHashBefore: scoped.enumerationGameStateHash,
    turnNumberBefore: scoped.state.turnNumber,
    activeSideKeyBefore: scoped.state.activeSideKey,
    phaseKeyBefore: scoped.state.phaseKey,
    selected: stableGraphValue(selector),
    enumerationOptions: stableGraphValue(scoped.options),
    legalActionCount: scoped.enumeration.actions.length,
    rejectedActionCount: (scoped.enumeration.rejectedActions || []).length,
    actionKey: action.actionKey,
    actionType: action.actionType,
    actorPieceKey: String(action.actorPieceKey || ""),
    targetPieceKey: String(action.targetPieceKey || ""),
    persistedAction: stableGraphValue(persistedAction),
    reactionRequirements: stableGraphValue(materialized.reactionRequirements),
    transitionOk: transition.ok === true,
    reason: String(transition.reason || ""),
    events: stableGraphValue(transition.events || []),
    stateHashAfter: normalizedNextState ? stableGraphHash(normalizedNextState) : "",
    gameStateHashAfter: normalizedNextState
      ? warmachineBenchmarkGameStateHashV2(normalizedNextState)
      : "",
  };
  return {
    ok: transition.ok === true,
    reason: String(transition.reason || ""),
    state: transition.ok ? transition.nextState : scoped.state,
    normalizedState: transition.ok ? normalizedNextState : scoped.state,
    transition,
    scoped,
    receipt: { ...receiptCore, receiptHash: stableGraphHash(receiptCore) },
  };
}

export function executeWarmachineBenchmarkActionV2(stateInput = {}, selector = {}, rawOptions = {}) {
  const scoped = enumerateWarmachineBenchmarkActionsV2(stateInput, rawOptions.enumerationScope || {});
  const action = selectedAction(scoped.enumeration, selector);
  if (!action) {
    const rejectionCore = {
      schemaVersion: "warmachine_fixed_benchmark_step_receipt_v2",
      upstreamReceiptHash: warmachineHost.receipt.receiptHash,
      stateHashInput: scoped.inputStateHash,
      stateHashBefore: scoped.enumerationStateHash,
      selected: stableGraphValue(selector),
      enumerationOptions: stableGraphValue(scoped.options),
      legalActionCount: scoped.enumeration.actions.length,
      rejectedActionCount: (scoped.enumeration.rejectedActions || []).length,
      transitionOk: false,
      reason: "selected_action_not_in_scoped_strict_enumeration",
    };
    return {
      ok: false,
      reason: rejectionCore.reason,
      state: scoped.state,
      scoped,
      receipt: { ...rejectionCore, receiptHash: stableGraphHash(rejectionCore) },
    };
  }
  return executeScopedWarmachineBenchmarkActionV2(scoped, action, selector, rawOptions);
}

function actionDestination(action = {}, actor = {}) {
  const rows = action.destinationsByModel || action.metadata?.destinationsByModel || [];
  if (rows.length) {
    return {
      xIn: rows.reduce((sum, row) => sum + Number(row.to?.xIn || 0), 0) / rows.length,
      yIn: rows.reduce((sum, row) => sum + Number(row.to?.yIn || 0), 0) / rows.length,
    };
  }
  return action.destination || actor.position || null;
}

function distance(left = {}, right = {}) {
  return Math.hypot(Number(left.xIn || 0) - Number(right.xIn || 0),
    Number(left.yIn || 0) - Number(right.yIn || 0));
}

export function buildWarmachineBenchmarkStrictRollOutcomeV2(action = {}, rawOptions = {}) {
  const resolution = action.metadata?.attackResolution || {};
  const attackDiceCount = Math.max(1, Math.floor(Number(
    resolution.attackDiceCount ?? resolution.diceCount ?? 2,
  )));
  const damageDiceCount = Math.max(1, Math.floor(Number(
    resolution.damageDiceCount ?? 2,
  )));
  const attackDie = Math.max(1, Math.min(6, Math.floor(Number(rawOptions.attackDie ?? 6))));
  const damageDie = Math.max(1, Math.min(6, Math.floor(Number(rawOptions.damageDie ?? 6))));
  const locationDie = Math.max(1, Math.min(6, Math.floor(Number(rawOptions.locationDie ?? 6))));
  return {
    attackDice: Array.from({ length: attackDiceCount }, () => attackDie),
    ...(resolution.damageRollNotRequired === true
      ? {}
      : { damageDice: Array.from({ length: damageDiceCount }, () => damageDie) }),
    locationDice: [locationDie],
  };
}

export function buildWarmachineBenchmarkMaximumStrictRollOutcomeV2(action = {}) {
  return buildWarmachineBenchmarkStrictRollOutcomeV2(action, {
    attackDie: 6,
    damageDie: 6,
    locationDie: 6,
  });
}

export function warmachineBenchmarkStrictContinuationWindowOnlyV2(enumeration = {}) {
  return Boolean(
    enumeration.mandatoryBeforeOptionalMarker ||
    Object.entries(enumeration).some(([key, value]) =>
      /^strict[A-Z].*WindowOnly$/.test(key) && value === true),
  );
}

function actionIntentScore(action = {}, state = {}, intent = {}) {
  const type = String(action.actionType || "").toLowerCase();
  const actor = (state.pieces || []).find((piece) => piece.pieceKey === action.actorPieceKey) || {};
  const targetMatch = intent.targetPieceKey && action.targetPieceKey === intent.targetPieceKey;
  const attackLike = /attack|charge|slam|throw|headbutt|trample|spell|animus/.test(type);
  const movementLike = /advance|run|charge|move|place|reposition/.test(type);
  const completionLike = /pass|end_|activation_complete|forfeit/.test(type);
  let score = 0;
  if (targetMatch) score += 10_000;
  if (intent.preferAttack && attackLike) score += 1_000;
  if (intent.preferMovement && movementLike) score += 200;
  if (type === "charge") score += 80;
  if (type === "run") score += 40;
  if (type === "advance") score += 20;
  if (intent.waypoint && movementLike) {
    const before = distance(actor.position || {}, intent.waypoint);
    const after = distance(actionDestination(action, actor) || {}, intent.waypoint);
    score += (before - after) * 100;
  }
  if (intent.completionOnly && completionLike) score += 2_000;
  if (intent.avoidFeat !== false && type === "use_feat") score -= 10_000;
  if (type === "pass") score += intent.completionOnly ? 40 : -40;
  if (type === "forfeit_normal_movement") score -= 80;
  return score;
}

export function chooseWarmachineBenchmarkActionV2(actions = [], state = {}, intent = {}) {
  const completionCandidates = intent.completionOnly
    ? actions.filter((action) => /pass|end_|activation_complete|forfeit/.test(
      String(action.actionType || "").toLowerCase(),
    ))
    : [];
  const sourceActions = completionCandidates.length ? completionCandidates : actions;
  let candidates = sourceActions.filter((action) => {
    if (!completionCandidates.length && intent.actionTypes?.length && !intent.actionTypes.includes(action.actionType)) return false;
    if (!completionCandidates.length && intent.targetPieceKey && intent.requireTargetMatch === true &&
        action.targetPieceKey !== intent.targetPieceKey) return false;
    return true;
  });
  if (!candidates.length && intent.targetPieceKey && intent.requireTargetMatch === true) {
    candidates = sourceActions.filter((action) =>
      /pass|end_|activation_complete|forfeit|decline/.test(
        String(action.actionType || "").toLowerCase(),
      ));
  }
  return candidates.slice().sort((left, right) =>
    actionIntentScore(right, state, intent) - actionIntentScore(left, state, intent) ||
    left.actionKey.localeCompare(right.actionKey))[0] || null;
}

export function summarizeWarmachineBenchmarkRejectedActionV2(action = {}) {
  return {
    actionKey: String(action.actionKey || ""),
    actionType: String(action.actionType || ""),
    actorPieceKey: String(action.actorPieceKey || ""),
    targetPieceKey: String(action.targetPieceKey || ""),
    reason: String(action.rejection?.reason || action.metadata?.rejectionReason || ""),
    reasons: stableGraphValue(action.rejection?.reasons || []),
    issues: stableGraphValue(action.rejection?.issues || []),
    destination: action.destination ? stableGraphValue(action.destination) : null,
    blockerKind: String(action.rejection?.evidence?.losGeometry?.blockerKind ||
      action.rejection?.evidence?.blocker?.blockerKind || ""),
    blockerKeys: stableGraphValue(action.rejection?.evidence?.losGeometry?.blockerKeys || []),
    movementCostIn: action.metadata?.movementCost?.costIn ?? null,
    movementAllowanceIn: action.metadata?.movementAllowanceIn ?? null,
  };
}

function activationCompletedByEvents(events = []) {
  return events.some((event) =>
    event.eventType === "activation_complete" || event.eventType === "unit_group_activation_complete");
}

function terminalReachedByEvents(events = []) {
  return events.some((event) => event.eventType === "terminal");
}

export function executeWarmachineBenchmarkActivationV2(
  stateInput = {},
  activationGroupKey = "",
  rawOptions = {},
) {
  let state = normalizeRulesV1State(stateInput);
  const startingSideKey = state.activeSideKey;
  const initialGroup = buildWarmachineActivationGroups(state)
    .find((group) => group.groupKey === activationGroupKey) ||
    (rawOptions.resumeInitialGroup?.groupKey === activationGroupKey
      ? stableGraphValue(rawOptions.resumeInitialGroup)
      : null);
  if (!initialGroup) {
    return {
      ok: false,
      reason: "activation_group_not_available",
      activationGroupKey,
      state,
      receipts: [],
    };
  }
  const groupPieceKeys = new Set(initialGroup.actorPieceKeys);
  const receipts = [];
  const rejectedReceipts = [];
  const selectionAudit = [];
  let attemptCount = 0;
  let completed = false;
  let paused = false;
  let pausedAtStepIndex = -1;
  let pausedBeforeAction = null;
  let reason = "";
  const maxSteps = Math.max(1, Number(rawOptions.maxSteps || initialGroup.pieceCount * 4 + 8));
  const stepIndexOffset = Math.max(0, Math.floor(Number(
    rawOptions.stepIndexOffset || 0,
  )));
  for (let localStepIndex = 0; localStepIndex < maxSteps;
    localStepIndex += 1) {
    const stepIndex = stepIndexOffset + localStepIndex;
    const inRuntimeWindow = runtimeWindowActive(state);
    const requestedEnumerationScope = typeof rawOptions.enumerationScopeForStep === "function"
      ? rawOptions.enumerationScopeForStep({ state, stepIndex, initialGroup, inRuntimeWindow }) || {}
      : rawOptions.enumerationScope || {};
    const automaticCompletionStep = stepIndex > 0 && rawOptions.repeatIntent !== true &&
      typeof rawOptions.enumerationScopeForStep !== "function";
    const stepEnumerationScope = automaticCompletionStep
      ? inRuntimeWindow
        ? {}
        : { actionFamilyKeys: ["timing"] }
      : requestedEnumerationScope;
    rawOptions.onProgress?.({ stage: "before_enumeration", stepIndex, activationGroupKey });
    const scoped = enumerateWarmachineBenchmarkActionsV2(state, {
      activationGroupKey: inRuntimeWindow ? "" : activationGroupKey,
      ...stepEnumerationScope,
    });
    rawOptions.onProgress?.({
      stage: "after_enumeration",
      stepIndex,
      activationGroupKey,
      legalActionCount: scoped.enumeration.actions.length,
      rejectedActionCount: (scoped.enumeration.rejectedActions || []).length,
    });
    rawOptions.onEnumeration?.({
      state,
      scoped,
      stepIndex,
      initialGroup,
      activationGroupKey,
    });
    const intent = typeof rawOptions.intent === "function"
      ? rawOptions.intent({ state, scoped, stepIndex, initialGroup })
      : { ...(rawOptions.intent || {}) };
    if (stepIndex > 0 && rawOptions.repeatIntent !== true) intent.completionOnly = true;
    const strictContinuationWindowOnly = warmachineBenchmarkStrictContinuationWindowOnlyV2(
      scoped.enumeration,
    );
    if (strictContinuationWindowOnly) {
      intent.requireTargetMatch = false;
      intent.actionTypes = [];
      intent.completionOnly = false;
      intent.strictContinuationWindowOnly = true;
      intent.decisionSideKey = scoped.enumeration.decisionSideKey || state.activeSideKey;
    }
    const policyChoice = typeof rawOptions.selectAction === "function"
      ? rawOptions.selectAction({ state, scoped, stepIndex, initialGroup, intent })
      : null;
    const action = typeof policyChoice === "string"
      ? scoped.enumeration.actions.find((candidate) => candidate.actionKey === policyChoice)
      : policyChoice?.actionKey
        ? scoped.enumeration.actions.find((candidate) => candidate.actionKey === policyChoice.actionKey)
        : policyChoice || chooseWarmachineBenchmarkActionV2(scoped.enumeration.actions, state, intent);
    if (!action) {
      reason = "activation_policy_found_no_scoped_legal_action";
      break;
    }
    if (typeof rawOptions.stopBeforeAction === "function" && rawOptions.stopBeforeAction({
      state,
      scoped,
      stepIndex,
      initialGroup,
      intent,
      action,
      policyChoice,
    }) === true) {
      paused = true;
      pausedAtStepIndex = stepIndex;
      pausedBeforeAction = summarizeWarmachineBenchmarkActionV2(action);
      reason = "paused_before_selected_action";
      break;
    }
    const selector = { actionKey: action.actionKey };
    rawOptions.onProgress?.({
      stage: "before_strict_transition",
      stepIndex,
      activationGroupKey,
      actionKey: action.actionKey,
    });
    const result = executeScopedWarmachineBenchmarkActionV2(scoped, action, selector, {
      ...rawOptions,
      actionPatch: policyChoice?.actionPatch || rawOptions.actionPatch,
      routeKey: `${rawOptions.routeKey || "fixed-benchmark"}:${activationGroupKey}:${stepIndex}`,
    });
    attemptCount += 1;
    rawOptions.onTransition?.({
      stateBefore: state,
      scoped,
      action,
      result,
      stepIndex,
      initialGroup,
      activationGroupKey,
    });
    rawOptions.onProgress?.({
      stage: "after_strict_transition",
      stepIndex,
      activationGroupKey,
      actionKey: action.actionKey,
      transitionOk: result.ok,
    });
    selectionAudit.push({
      stepIndex,
      runtimeWindowActive: inRuntimeWindow,
      automaticCompletionStep,
      enumerationScope: stableGraphValue(stepEnumerationScope),
      intent: stableGraphValue(intent),
      selectedAction: summarizeWarmachineBenchmarkActionV2(action),
      legalActionCount: scoped.enumeration.actions.length,
      rejectedActionCount: (scoped.enumeration.rejectedActions || []).length,
      ...(Number(rawOptions.rejectedAuditLimit || 0) > 0 ? {
        rejectedActions: (scoped.enumeration.rejectedActions || [])
          .slice(0, Math.max(0, Number(rawOptions.rejectedAuditLimit || 0)))
          .map(summarizeWarmachineBenchmarkRejectedActionV2),
      } : {}),
    });
    if (!result.ok) {
      rejectedReceipts.push(result.receipt);
      reason = result.reason || "strict_activation_transition_rejected";
      break;
    }
    receipts.push(result.receipt);
    state = result.normalizedState || normalizeRulesV1State(result.state);
    if (activationCompletedByEvents(result.transition.events || []) ||
        terminalReachedByEvents(result.transition.events || [])) {
      completed = true;
      break;
    }
    const remainingGroup = buildWarmachineActivationGroups(state)
      .find((group) => group.groupKey === activationGroupKey);
    const groupRuntimeKeys = runtimeWindowActorPieceKeys(state)
      .filter((pieceKey) => groupPieceKeys.has(pieceKey));
    if (!remainingGroup && !groupRuntimeKeys.length) {
      completed = true;
      break;
    }
    if (state.activeSideKey !== startingSideKey) {
      reason = "active_side_changed_before_activation_completed";
      break;
    }
    if (rawOptions.pauseAfterTransitionBudget === true &&
        localStepIndex + 1 >= maxSteps) {
      paused = true;
      pausedAtStepIndex = stepIndex + 1;
      reason = "paused_after_transition_budget";
      break;
    }
  }
  if (!completed && !paused && !reason) reason = "activation_step_budget_exhausted";
  const core = {
    schemaVersion: "warmachine_fixed_benchmark_activation_receipt_v2",
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    activationGroupKey,
    actorPieceKeys: initialGroup.actorPieceKeys,
    resumeInitialGroup: stableGraphValue(initialGroup),
    startingSideKey,
    startingStateHash: stableGraphHash(normalizeRulesV1State(stateInput)),
    endingStateHash: stableGraphHash(state),
    completed,
    paused,
    pausedAtStepIndex,
    pausedBeforeAction,
    transitionCount: receipts.length,
    receiptHashes: receipts.map((receipt) => receipt.receiptHash),
    rejectedTransitionCount: rejectedReceipts.length,
    rejectedReceiptHashes: rejectedReceipts.map((receipt) =>
      receipt.receiptHash),
    attemptCount,
    selectionAudit,
    reason,
  };
  return {
    ...core,
    activationReceiptHash: stableGraphHash(core),
    ok: completed || paused,
    state,
    normalizedState: state,
    receipts,
    rejectedReceipts,
  };
}

function defaultTurnIntent() {
  return { completionOnly: true, avoidFeat: true };
}

export function executeWarmachineBenchmarkTurnV2(stateInput = {}, rawOptions = {}) {
  let state = normalizeRulesV1State(stateInput);
  const startingSideKey = state.activeSideKey;
  const startingTurnNumber = state.turnNumber;
  const startingStateHash = stableGraphHash(state);
  const activationReceipts = [];
  const allStepReceipts = [];
  const failures = [];
  const activatedGroupKeys = [];
  const maximumActivations = Math.max(1, Number(rawOptions.maximumActivations || 64));
  for (let activationIndex = 0; activationIndex < maximumActivations; activationIndex += 1) {
    if (state.activeSideKey !== startingSideKey) break;
    const groups = buildWarmachineActivationGroups(state);
    if (!groups.length) break;
    const requestedGroupKey = typeof rawOptions.selectActivationGroup === "function"
      ? rawOptions.selectActivationGroup({ state, groups, activationIndex, activatedGroupKeys })
      : "";
    const group = groups.find((candidate) => candidate.groupKey === requestedGroupKey) || groups[0];
    const intent = typeof rawOptions.intentForActivationGroup === "function"
      ? rawOptions.intentForActivationGroup({ state, group, activationIndex, activatedGroupKeys }) || defaultTurnIntent()
      : rawOptions.intentByActivationGroupKey?.[group.groupKey] || defaultTurnIntent();
    const enumerationScope = intent.preferMovement && intent.waypoint
      ? buildWarmachineBenchmarkMovementScopeV2(
        state,
        group.actorPieceKeys,
        intent.waypoint,
        intent.movementScopeOptions || {},
      )
      : {
        actionFamilyKeys: intent.preferAttack
          ? ["attack_or_effect", "timing", "resource"]
          : ["timing"],
        ...(intent.targetPieceKey ? {
          targetPieceKeys: [intent.targetPieceKey],
          includeUntargetedActions: true,
        } : {}),
      };
    rawOptions.onProgress?.({
      stage: "before_activation",
      startingSideKey,
      activationIndex,
      activationGroupKey: group.groupKey,
      intent: stableGraphValue(intent),
    });
    const activation = executeWarmachineBenchmarkActivationV2(state, group.groupKey, {
      routeKey: `${rawOptions.routeKey || "fixed-benchmark-turn"}:${startingSideKey}:${activationIndex}`,
      enumerationScope,
      intent,
      repeatIntent: intent.repeatIntent === true,
      maxSteps: intent.maxSteps,
      actionPatch: intent.actionPatch,
      selectAction: intent.selectAction,
      onEnumeration: intent.onEnumeration,
      enumerationScopeForStep: intent.enumerationScopeForStep,
      rejectedAuditLimit: rawOptions.rejectedAuditLimit,
      onProgress: rawOptions.onActivationProgress,
    });
    activationReceipts.push({
      activationGroupKey: group.groupKey,
      activationReceiptHash: activation.activationReceiptHash || "",
      completed: activation.completed === true,
      transitionCount: activation.transitionCount || 0,
      selectionAudit: activation.selectionAudit || [],
      reason: activation.reason || "",
    });
    allStepReceipts.push(...(activation.receipts || []));
    rawOptions.onProgress?.({
      stage: "after_activation",
      startingSideKey,
      activationIndex,
      activationGroupKey: group.groupKey,
      completed: activation.completed === true,
      transitionCount: activation.transitionCount || 0,
    });
    if (!activation.ok) {
      failures.push({
        activationIndex,
        activationGroupKey: group.groupKey,
        reason: activation.reason || "activation_failed",
      });
      break;
    }
    state = activation.state;
    activatedGroupKeys.push(group.groupKey);
  }
  const remainingGroups = state.activeSideKey === startingSideKey
    ? buildWarmachineActivationGroups(state)
    : [];
  let endTurnResult = null;
  let preEndState = null;
  if (!failures.length && !remainingGroups.length && state.activeSideKey === startingSideKey) {
    preEndState = state;
    rawOptions.onProgress?.({ stage: "before_end_turn", startingSideKey });
    endTurnResult = executeWarmachineBenchmarkActionV2(state, { actionType: "end_turn" }, {
      routeKey: `${rawOptions.routeKey || "fixed-benchmark-turn"}:${startingSideKey}:end-turn`,
      enumerationScope: {
        actionFamilyKeys: ["timing"],
        includeActorlessActions: true,
      },
      onProgress: rawOptions.onActivationProgress,
    });
    allStepReceipts.push(endTurnResult.receipt);
    if (endTurnResult.ok) state = endTurnResult.state;
    else failures.push({ reason: endTurnResult.reason || "end_turn_failed" });
    rawOptions.onProgress?.({
      stage: "after_end_turn",
      startingSideKey,
      transitionOk: endTurnResult.ok,
      nextActiveSideKey: state.activeSideKey,
      nextPhaseKey: state.phaseKey,
      nextTurnNumber: state.turnNumber,
    });
  }
  const turnCompleted = !failures.length && state.activeSideKey !== startingSideKey;
  const core = {
    schemaVersion: "warmachine_fixed_benchmark_turn_receipt_v2",
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    startingSideKey,
    startingTurnNumber,
    startingStateHash,
    endingStateHash: stableGraphHash(state),
    endingActiveSideKey: state.activeSideKey,
    endingPhaseKey: state.phaseKey,
    endingTurnNumber: state.turnNumber,
    activatedGroupKeys,
    activationCount: activationReceipts.length,
    activationReceipts,
    remainingActivationGroupKeys: remainingGroups.map((group) => group.groupKey),
    endTurnReceiptHash: endTurnResult?.receipt?.receiptHash || "",
    stepReceiptHashes: allStepReceipts.map((receipt) => receipt.receiptHash),
    failures,
    turnCompleted,
  };
  return {
    ...core,
    turnReceiptHash: stableGraphHash(core),
    ok: turnCompleted,
    state,
    preEndState,
    stepReceipts: allStepReceipts,
  };
}

function controlActionScore(action = {}) {
  const type = String(action.actionType || "").toLowerCase();
  const mandatory = action.metadata?.mandatoryControlPhase === true ? 10_000 : 0;
  const resolve = /resolve|leech|remove_fury|frenzy|threshold|upkeep|maintenance/.test(type)
    ? 1_000
    : 0;
  const terminal = /end_control|begin_activation|advance_to_activation/.test(type) ? -1_000 : 0;
  return mandatory + resolve + terminal;
}

export function executeWarmachineBenchmarkControlPhaseV2(stateInput = {}, rawOptions = {}) {
  let state = normalizeRulesV1State(stateInput);
  const startingStateHash = stableGraphHash(state);
  const startingSideKey = state.activeSideKey;
  const receipts = [];
  const selectionAudit = [];
  const failures = [];
  const maximumSteps = Math.max(1, Number(rawOptions.maximumSteps || 64));
  for (let stepIndex = 0; stepIndex < maximumSteps && state.phaseKey === "control"; stepIndex += 1) {
    rawOptions.onProgress?.({ stage: "before_control_enumeration", stepIndex, startingSideKey });
    const scoped = enumerateWarmachineBenchmarkActionsV2(state);
    rawOptions.onProgress?.({
      stage: "after_control_enumeration",
      stepIndex,
      startingSideKey,
      legalActionCount: scoped.enumeration.actions.length,
      rejectedActionCount: (scoped.enumeration.rejectedActions || []).length,
      mandatoryFiltered: scoped.enumeration.mandatoryControlPhaseActionsFiltered === true,
    });
    const policyChoice = typeof rawOptions.selectAction === "function"
      ? rawOptions.selectAction({ state, scoped, stepIndex })
      : null;
    const action = typeof policyChoice === "string"
      ? scoped.enumeration.actions.find((candidate) => candidate.actionKey === policyChoice)
      : policyChoice?.actionKey
        ? scoped.enumeration.actions.find((candidate) => candidate.actionKey === policyChoice.actionKey)
        : policyChoice || scoped.enumeration.actions.slice().sort((left, right) =>
          controlActionScore(right) - controlActionScore(left) ||
          left.actionKey.localeCompare(right.actionKey))[0];
    if (!action) {
      failures.push({ stepIndex, reason: "control_phase_has_no_scoped_legal_action" });
      break;
    }
    const result = executeScopedWarmachineBenchmarkActionV2(
      scoped,
      action,
      { actionKey: action.actionKey },
      {
        routeKey: `${rawOptions.routeKey || "fixed-benchmark-control"}:${startingSideKey}:${stepIndex}`,
        actionPatch: policyChoice?.actionPatch || rawOptions.actionPatch,
        onProgress: rawOptions.onActionProgress,
      },
    );
    rawOptions.onTransition?.({
      stateBefore: state,
      scoped,
      action,
      result,
      stepIndex,
      startingSideKey,
    });
    selectionAudit.push({
      stepIndex,
      selectedAction: summarizeWarmachineBenchmarkActionV2(action),
      legalActionCount: scoped.enumeration.actions.length,
      rejectedActionCount: (scoped.enumeration.rejectedActions || []).length,
      mandatoryFiltered: scoped.enumeration.mandatoryControlPhaseActionsFiltered === true,
    });
    receipts.push(result.receipt);
    if (!result.ok) {
      failures.push({ stepIndex, actionKey: action.actionKey, reason: result.reason || "control_transition_failed" });
      break;
    }
    state = result.state;
  }
  const controlCompleted = !failures.length && state.phaseKey === "activation" &&
    state.activeSideKey === startingSideKey;
  if (!controlCompleted && !failures.length) {
    failures.push({ reason: "control_phase_step_budget_exhausted" });
  }
  const core = {
    schemaVersion: "warmachine_fixed_benchmark_control_phase_receipt_v2",
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    startingSideKey,
    startingStateHash,
    endingStateHash: stableGraphHash(state),
    endingPhaseKey: state.phaseKey,
    endingTurnNumber: state.turnNumber,
    selectionAudit,
    transitionCount: receipts.length,
    stepReceiptHashes: receipts.map((receipt) => receipt.receiptHash),
    failures,
    controlCompleted,
  };
  return {
    ...core,
    controlReceiptHash: stableGraphHash(core),
    ok: controlCompleted,
    state,
    receipts,
  };
}

export function executeWarmachineBenchmarkHoldTurnsToTerminalV2(
  stateInput = {},
  rawOptions = {},
) {
  let state = normalizeRulesV1State(stateInput);
  const receipts = [];
  const checkpoints = [];
  const failures = [];
  const maximumTurns = Math.max(1, Number(rawOptions.maximumTurns || 8));
  const expectedWinnerSideKey = String(rawOptions.expectedWinnerSideKey || "");
  let terminalEvent = null;
  for (let turnIndex = 0; turnIndex < maximumTurns && !terminalEvent; turnIndex += 1) {
    const startingSideKey = state.activeSideKey;
    const startingTurnNumber = state.turnNumber;
    const control = executeWarmachineBenchmarkControlPhaseV2(state, {
      routeKey: `${rawOptions.routeKey || "fixed-benchmark-hold"}:${turnIndex}:control`,
      onProgress: rawOptions.onControlProgress,
    });
    receipts.push(...control.receipts);
    if (!control.ok) {
      failures.push({
        turnIndex,
        stage: "control",
        failures: stableGraphValue(control.failures),
      });
      state = control.state;
      break;
    }
    const turn = executeWarmachineBenchmarkTurnV2(control.state, {
      routeKey: `${rawOptions.routeKey || "fixed-benchmark-hold"}:${turnIndex}:turn`,
      onProgress: rawOptions.onTurnProgress,
    });
    receipts.push(...turn.stepReceipts);
    state = turn.state;
    const settlementEvents = turn.stepReceipts.flatMap((receipt) => receipt.events || [])
      .filter((event) => event.eventType === "steamroller_2026_turn_end_settled");
    const terminalEvents = turn.stepReceipts.flatMap((receipt) => receipt.events || [])
      .filter((event) => event.eventType === "terminal");
    checkpoints.push({
      turnIndex,
      endingSideKey: startingSideKey,
      endingTurnNumber: startingTurnNumber,
      nextSideKey: turn.endingActiveSideKey,
      nextTurnNumber: turn.endingTurnNumber,
      score: stableGraphValue(state.scenario?.score || {}),
      settlementEvents: stableGraphValue(settlementEvents),
      terminalEvents: stableGraphValue(terminalEvents),
      controlReceiptHash: control.controlReceiptHash,
      turnReceiptHash: turn.turnReceiptHash,
    });
    if (!turn.ok) {
      failures.push({
        turnIndex,
        stage: "activation_or_turn_end",
        failures: stableGraphValue(turn.failures),
      });
      break;
    }
    terminalEvent = terminalEvents[0] || null;
    rawOptions.onProgress?.({
      turnIndex,
      endingSideKey: startingSideKey,
      endingTurnNumber: startingTurnNumber,
      score: state.scenario?.score || {},
      terminalEvent,
    });
  }
  if (!terminalEvent && !failures.length) {
    failures.push({ reason: "hold_turn_budget_exhausted_before_terminal" });
  }
  if (terminalEvent && expectedWinnerSideKey &&
      terminalEvent.winnerSideKey !== expectedWinnerSideKey) {
    failures.push({
      reason: "unexpected_terminal_winner",
      expectedWinnerSideKey,
      observedWinnerSideKey: terminalEvent.winnerSideKey,
    });
  }
  const core = {
    schemaVersion: "warmachine_fixed_benchmark_hold_to_terminal_v2",
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    startingStateHash: stableGraphHash(normalizeRulesV1State(stateInput)),
    endingStateHash: stableGraphHash(state),
    maximumTurns,
    completedTurnCount: checkpoints.length,
    transitionCount: receipts.length,
    stepReceiptHashes: receipts.map((receipt) => receipt.receiptHash),
    checkpoints,
    terminalEvent: stableGraphValue(terminalEvent),
    failures,
    reachedTerminal: Boolean(terminalEvent),
  };
  return {
    ...core,
    routeReceiptHash: stableGraphHash(core),
    ok: failures.length === 0 && Boolean(terminalEvent),
    state,
    receipts,
  };
}

function pieceBoxesRemaining(piece = null) {
  return Number(piece?.boxesRemaining ?? piece?.damage?.boxesRemaining ?? 0);
}

function terminalEventsFromReceipts(receipts = []) {
  return receipts.flatMap((receipt) => receipt.events || [])
    .filter((event) => event.eventType === "terminal");
}

export function executeWarmachineBenchmarkAssassinationRouteV2(
  openingStateInput = {},
  rawOptions = {},
) {
  const openingState = normalizeRulesV1State(openingStateInput);
  const raptorPieceKey = String(rawOptions.raptorPieceKey || "");
  const attackerLeaderPieceKey = String(rawOptions.attackerLeaderPieceKey || "");
  const targetLeaderPieceKey = String(rawOptions.targetLeaderPieceKey || "");
  const raptorWaypoint = stableGraphValue(rawOptions.raptorWaypoint || { xIn: 28, yIn: 30 });
  const attackerLeaderWaypoint = stableGraphValue(rawOptions.attackerLeaderWaypoint || { xIn: 14, yIn: 24 });
  const clearanceActivationGroupKeys = Array.from(new Set(
    (rawOptions.clearanceActivationGroupKeys || []).map(String).filter(Boolean),
  ));
  const clearanceWaypointByGroupKey = rawOptions.clearanceWaypointByGroupKey || {};
  const routeKey = String(rawOptions.routeKey || "fixed-two-fronts-assassination-route-v2");
  const failures = [];
  const receipts = [];
  const stages = {};
  const positionTimeline = [];
  const openingRaptor = openingState.pieces.find((piece) => piece.pieceKey === raptorPieceKey);
  const attackerLeader = openingState.pieces.find((piece) => piece.pieceKey === attackerLeaderPieceKey);
  const targetLeader = openingState.pieces.find((piece) => piece.pieceKey === targetLeaderPieceKey);
  if (!openingRaptor || !attackerLeader || !targetLeader) {
    return {
      schemaVersion: "warmachine_fixed_benchmark_assassination_route_v2",
      ok: false,
      failures: [{
        stage: "opening",
        reason: "assassination_route_piece_identity_missing",
        raptorPieceKey,
        attackerLeaderPieceKey,
        targetLeaderPieceKey,
      }],
      state: openingState,
      receipts,
    };
  }
  const recordPositions = (stageKey, state) => {
    const projection = (pieceKey) => {
      const piece = state.pieces.find((entry) => entry.pieceKey === pieceKey);
      return piece ? {
        pieceKey,
        position: stableGraphValue(piece.position || null),
        resourcePoints: Number(piece.resourcePoints || 0),
        controlRangeIn: Number(piece.controlRangeIn || 0),
        boxesRemaining: pieceBoxesRemaining(piece),
      } : { pieceKey, missing: true };
    };
    positionTimeline.push({
      stageKey,
      raptor: projection(raptorPieceKey),
      attackerLeader: projection(attackerLeaderPieceKey),
      targetLeader: projection(targetLeaderPieceKey),
    });
  };
  recordPositions("opening", openingState);

  const openingControl = executeWarmachineBenchmarkControlPhaseV2(openingState, {
    routeKey: `${routeKey}:player1:turn1:control`,
    selectAction: ({ state, scoped }) => {
      const raptor = state.pieces.find((piece) => piece.pieceKey === raptorPieceKey);
      const allocation = scoped.enumeration.actions.find((action) =>
        action.actionType === "allocate_resource" && action.targetPieceKey === raptorPieceKey);
      if (allocation && Number(raptor?.resourcePoints || 0) < 1) return allocation;
      if (Number(raptor?.resourcePoints || 0) >= 1) {
        return scoped.enumeration.actions.find((action) => action.actionType === "end_control_phase") || null;
      }
      return null;
    },
  });
  stages.openingControl = openingControl;
  receipts.push(...openingControl.receipts);
  if (!openingControl.ok) failures.push({ stage: "opening_control", failures: openingControl.failures });

  let state = openingControl.state;
  const openingGroups = buildWarmachineActivationGroups(state);
  const raptorGroup = openingGroups.find((group) => group.actorPieceKeys.includes(raptorPieceKey));
  const attackerLeaderGroup = openingGroups.find((group) =>
    group.actorPieceKeys.includes(attackerLeaderPieceKey));
  const openingActivationOrder = [
    ...clearanceActivationGroupKeys,
    raptorGroup?.groupKey,
    attackerLeaderGroup?.groupKey,
  ].filter(Boolean);
  if (!failures.length && (!raptorGroup || !attackerLeaderGroup)) {
    failures.push({ stage: "opening_activation_groups", reason: "required_activation_group_missing" });
  }
  if (!failures.length) {
    const attackerFirstTurn = executeWarmachineBenchmarkTurnV2(state, {
      routeKey: `${routeKey}:player1:turn1`,
      rejectedAuditLimit: 12,
      selectActivationGroup: ({ groups }) => openingActivationOrder.find((groupKey) =>
        groups.some((group) => group.groupKey === groupKey)) || groups[0].groupKey,
      intentForActivationGroup: ({ group }) => group.groupKey === raptorGroup.groupKey
        ? {
          preferMovement: true,
          waypoint: raptorWaypoint,
          avoidFeat: true,
          selectAction: rawOptions.requireOpeningRaptorExplicitPath === true
            ? ({ scoped }) => scoped.enumeration.actions.find((action) =>
              action.actorPieceKey === raptorPieceKey &&
              action.actionType === "run" &&
              /:run-path:/.test(action.actionKey)) || null
            : undefined,
        }
        : group.groupKey === attackerLeaderGroup.groupKey
          ? rawOptions.openingLeaderRun === true
            ? {
              preferMovement: true,
              waypoint: attackerLeaderWaypoint,
              movementScopeOptions: {
                actionTypes: ["run"],
                maximumTargetsPerActionType: 12,
              },
              avoidFeat: true,
              selectAction: ({ state: activationState, scoped }) => {
                const leader = activationState.pieces.find((piece) =>
                  piece.pieceKey === attackerLeaderPieceKey);
                return scoped.enumeration.actions.filter((action) =>
                  action.actorPieceKey === attackerLeaderPieceKey &&
                  action.actionType === "run").sort((left, right) =>
                  distance(actionDestination(left, leader), attackerLeaderWaypoint) -
                  distance(actionDestination(right, leader), attackerLeaderWaypoint) ||
                  left.actionKey.localeCompare(right.actionKey))[0] || null;
              },
            }
            : {
            preferMovement: true,
            waypoint: attackerLeaderWaypoint,
            avoidFeat: true,
            repeatIntent: true,
            enumerationScopeForStep: ({ state: activationState }) => ({
              ...buildWarmachineBenchmarkMovementScopeV2(
                activationState,
                group.actorPieceKeys,
                attackerLeaderWaypoint,
                { maximumTargetsPerActionType: 4 },
              ),
              actionFamilyKeys: ["movement", "timing", "special"],
            }),
            selectAction: ({ scoped }) => scoped.enumeration.actions.find((action) =>
              action.actorPieceKey === attackerLeaderPieceKey &&
              action.actionType === "precision_strike_battle_plan") || null,
            }
          : clearanceActivationGroupKeys.includes(group.groupKey)
            ? {
              preferMovement: true,
              waypoint: stableGraphValue(
                clearanceWaypointByGroupKey[group.groupKey] || raptorWaypoint,
              ),
              movementScopeOptions: { maximumTargetsPerActionType: 12 },
              maxSteps: 16,
              avoidFeat: true,
            }
          : { completionOnly: true, avoidFeat: true },
    });
    stages.attackerFirstTurn = attackerFirstTurn;
    receipts.push(...attackerFirstTurn.stepReceipts);
    state = attackerFirstTurn.state;
    recordPositions("after_attacker_first_turn", state);
    if (!attackerFirstTurn.ok) {
      failures.push({ stage: "attacker_first_turn", failures: attackerFirstTurn.failures });
    }
  }

  if (!failures.length) {
    const defenderControl = executeWarmachineBenchmarkControlPhaseV2(state, {
      routeKey: `${routeKey}:player2:turn1:control`,
    });
    stages.defenderControl = defenderControl;
    receipts.push(...defenderControl.receipts);
    state = defenderControl.state;
    if (!defenderControl.ok) failures.push({ stage: "defender_control", failures: defenderControl.failures });
  }

  if (!failures.length) {
    const defenderGroups = buildWarmachineActivationGroups(state);
    const defenderLeaderGroup = defenderGroups.find((group) =>
      group.actorPieceKeys.includes(targetLeaderPieceKey));
    const raptor = state.pieces.find((piece) => piece.pieceKey === raptorPieceKey);
    if (!defenderLeaderGroup || !raptor) {
      failures.push({ stage: "defender_activation_groups", reason: "required_activation_group_missing" });
    } else {
      const defenderTurn = executeWarmachineBenchmarkTurnV2(state, {
        routeKey: `${routeKey}:player2:turn1`,
        selectActivationGroup: ({ groups, activationIndex }) =>
          activationIndex === 0 && groups.some((group) => group.groupKey === defenderLeaderGroup.groupKey)
            ? defenderLeaderGroup.groupKey
            : groups[0].groupKey,
        intentForActivationGroup: ({ group }) => group.groupKey === defenderLeaderGroup.groupKey
          ? {
            preferMovement: true,
            waypoint: raptor.position,
            movementScopeOptions: {
              actionTypes: ["run"],
              maximumTargetsPerActionType: 12,
            },
            avoidFeat: true,
            selectAction: rawOptions.requireDefenderLeaderExplicitPath === true
              ? ({ scoped }) => scoped.enumeration.actions.find((action) =>
                action.actorPieceKey === targetLeaderPieceKey &&
                action.actionType === "run" &&
                /:run-path:/.test(action.actionKey)) || null
              : undefined,
          }
          : { completionOnly: true, avoidFeat: true },
      });
      stages.defenderTurn = defenderTurn;
      receipts.push(...defenderTurn.stepReceipts);
      state = defenderTurn.state;
      recordPositions("after_defender_first_turn", state);
      if (!defenderTurn.ok) failures.push({ stage: "defender_turn", failures: defenderTurn.failures });
    }
  }

  if (!failures.length) {
    const attackerSecondControl = executeWarmachineBenchmarkControlPhaseV2(state, {
      routeKey: `${routeKey}:player1:turn2:control`,
      selectAction: ({ state: controlState, scoped }) => {
        const raptor = controlState.pieces.find((piece) => piece.pieceKey === raptorPieceKey);
        const allocation = scoped.enumeration.actions.find((action) =>
          action.actionType === "allocate_resource" && action.targetPieceKey === raptorPieceKey);
        if (allocation && Number(raptor?.resourcePoints || 0) < 3) return allocation;
        if (Number(raptor?.resourcePoints || 0) >= 3) {
          return scoped.enumeration.actions.find((action) => action.actionType === "end_control_phase") || null;
        }
        return scoped.enumeration.actions.find((action) => action.actionType === "end_control_phase") || null;
      },
    });
    stages.attackerSecondControl = attackerSecondControl;
    receipts.push(...attackerSecondControl.receipts);
    state = attackerSecondControl.state;
    recordPositions("after_attacker_second_control", state);
    if (!attackerSecondControl.ok) {
      failures.push({ stage: "attacker_second_control", failures: attackerSecondControl.failures });
    }
  }

  if (!failures.length) {
    const attackerGroups = buildWarmachineActivationGroups(state);
    const casterGroup = attackerGroups.find((group) =>
      group.actorPieceKeys.includes(attackerLeaderPieceKey));
    const finalRaptorGroup = attackerGroups.find((group) => group.actorPieceKeys.includes(raptorPieceKey));
    if (!casterGroup || !finalRaptorGroup) {
      failures.push({ stage: "attacker_second_activation_groups", reason: "required_activation_group_missing" });
    } else {
      let spellProbe = null;
      const casterActivation = executeWarmachineBenchmarkActivationV2(state, casterGroup.groupKey, {
        routeKey: `${routeKey}:player1:turn2:caster`,
        repeatIntent: true,
        enumerationScopeForStep: () => ({
          targetPieceKeys: [targetLeaderPieceKey],
          includeUntargetedActions: true,
          actionFamilyKeys: ["movement", "attack_or_effect", "timing", "resource", "special"],
        }),
        intent: {
          preferAttack: true,
          targetPieceKey: targetLeaderPieceKey,
          requireTargetMatch: false,
          avoidFeat: true,
        },
        selectAction: ({ state: activationState, scoped, stepIndex }) => {
          const target = activationState.pieces.find((piece) => piece.pieceKey === targetLeaderPieceKey);
          const caster = activationState.pieces.find((piece) => piece.pieceKey === attackerLeaderPieceKey);
          const raptor = activationState.pieces.find((piece) => piece.pieceKey === raptorPieceKey);
          const precisionStrike = scoped.enumeration.actions.find((action) =>
            action.actorPieceKey === attackerLeaderPieceKey &&
            action.actionType === "precision_strike_battle_plan") || null;
          const targetedSpells = scoped.enumeration.actions.filter((action) =>
            action.targetPieceKey === targetLeaderPieceKey &&
            /spell/.test(action.actionType) &&
            action.metadata?.damageTransfer !== true);
          const breathStealerAlreadyApplied = target?.statusEffects?.some((effect) =>
            effect.ruleAtomKey === "breath_stealer_spell_hit_speed_defense_penalty_one_round" &&
            effect.active !== false) === true;
          const advance = scoped.enumeration.actions
            .filter((action) =>
              action.actorPieceKey === attackerLeaderPieceKey && action.actionType === "advance")
            .sort((left, right) =>
              distance(actionDestination(left, caster), raptor?.position || {}) -
              distance(actionDestination(right, caster), raptor?.position || {}) ||
              left.actionKey.localeCompare(right.actionKey))[0];
          if (!spellProbe && !precisionStrike) {
            spellProbe = {
              observedAtStepIndex: stepIndex,
              precisionStrikeAlreadyUsed: activationState.pieces.find((piece) =>
                piece.pieceKey === attackerLeaderPieceKey)?.statusEffects?.some((effect) =>
                effect.ruleAtomKey === "precision_strike_battle_plan_friendly_los_and_movement_aura_one_turn" &&
                effect.active !== false) === true,
              targetBoxesRemaining: pieceBoxesRemaining(target),
              legalTargetedSpells: targetedSpells.map(summarizeWarmachineBenchmarkActionV2),
              targetedRejectedActions: scoped.enumeration.rejectedActions
                .filter((action) => action.targetPieceKey === targetLeaderPieceKey)
                .slice(0, 40)
                .map(summarizeWarmachineBenchmarkRejectedActionV2),
            };
          }
          if (precisionStrike) return precisionStrike;
          if (pieceBoxesRemaining(target) > 17 && targetedSpells.length && !breathStealerAlreadyApplied) {
            const spell = targetedSpells.slice().sort((left, right) =>
              Number(right.expectedDamage || 0) - Number(left.expectedDamage || 0) ||
              left.actionKey.localeCompare(right.actionKey))[0];
            return {
              actionKey: spell.actionKey,
              actionPatch: {
                strictRollOutcome: buildWarmachineBenchmarkMaximumStrictRollOutcomeV2(spell),
              },
            };
          }
          if (rawOptions.exhaustTargetedSpells === true && targetedSpells.length) {
            const spell = targetedSpells.slice().sort((left, right) =>
              Number(right.expectedDamage || 0) - Number(left.expectedDamage || 0) ||
              left.actionKey.localeCompare(right.actionKey))[0];
            return {
              actionKey: spell.actionKey,
              actionPatch: {
                strictRollOutcome: buildWarmachineBenchmarkMaximumStrictRollOutcomeV2(spell),
              },
            };
          }
          if (advance) return advance;
          return scoped.enumeration.actions.find((action) =>
            /pass|end_|activation_complete/.test(action.actionType)) || null;
        },
        stopBeforeAction: rawOptions.stopBeforeFirstStochasticAction === true
          ? ({ action }) => Boolean(action.metadata?.attackResolution)
          : null,
        maxSteps: 8,
      });
      stages.casterActivation = { ...casterActivation, spellProbe };
      receipts.push(...casterActivation.receipts);
      state = casterActivation.state;
      if (!casterActivation.ok) {
        failures.push({
          stage: "caster_activation",
          reason: casterActivation.reason,
          spellProbe,
          selectionAudit: casterActivation.selectionAudit,
        });
      } else if (!spellProbe?.legalTargetedSpells?.length) {
        failures.push({
          stage: "caster_activation",
          reason: "no_strict_targeted_spell_action",
          spellProbe,
          selectionAudit: casterActivation.selectionAudit,
        });
      } else if (!casterActivation.selectionAudit.some((row) =>
        row.selectedAction?.actionType === "precision_strike_battle_plan")) {
        failures.push({
          stage: "caster_activation",
          reason: "precision_strike_battle_plan_not_executed_before_targeted_spell",
          spellProbe,
          selectionAudit: casterActivation.selectionAudit,
        });
      }

      if (!failures.length && rawOptions.stopBeforeFirstStochasticAction === true &&
          casterActivation.paused === true) {
        const checkpointCore = {
          schemaVersion: "warmachine_fixed_benchmark_assassination_chance_checkpoint_v2",
          upstreamReceiptHash: warmachineHost.receipt.receiptHash,
          routeKey,
          startingStateHash: stableGraphHash(openingState),
          checkpointStateHash: stableGraphHash(state),
          raptorPieceKey,
          attackerLeaderPieceKey,
          targetLeaderPieceKey,
          targetStartingBoxes: pieceBoxesRemaining(targetLeader),
          targetCheckpointBoxes: pieceBoxesRemaining(state.pieces.find((piece) =>
            piece.pieceKey === targetLeaderPieceKey)),
          transitionCount: receipts.length,
          receiptHashes: receipts.map((receipt) => receipt.receiptHash),
          pausedAtStepIndex: casterActivation.pausedAtStepIndex,
          nextAction: stableGraphValue(casterActivation.pausedBeforeAction),
          positionTimeline: stableGraphValue(positionTimeline),
          failures: [],
        };
        return {
          ...checkpointCore,
          checkpointReceiptHash: stableGraphHash(checkpointCore),
          ok: true,
          state,
          receipts,
          stages,
        };
      }

      const casterTerminalReached = terminalEventsFromReceipts(receipts).some((event) =>
        event.winnerSideKey === openingState.activeSideKey);
      if (!failures.length && !casterTerminalReached) {
        const raptorActivation = executeWarmachineBenchmarkActivationV2(
          state,
          finalRaptorGroup.groupKey,
          {
            routeKey: `${routeKey}:player1:turn2:raptor`,
            repeatIntent: true,
            enumerationScopeForStep: ({ stepIndex }) => ({
              targetPieceKeys: [targetLeaderPieceKey],
              includeUntargetedActions: true,
              actionFamilyKeys: stepIndex === 0
                ? ["movement", "attack_or_effect", "timing", "resource"]
                : ["attack_or_effect", "timing", "resource"],
            }),
            intent: {
              preferAttack: true,
              targetPieceKey: targetLeaderPieceKey,
              requireTargetMatch: true,
              avoidFeat: true,
            },
            selectAction: ({ scoped }) => {
              const targeted = scoped.enumeration.actions.filter((action) =>
                action.targetPieceKey === targetLeaderPieceKey &&
                action.metadata?.damageTransfer !== true &&
                /attack|charge|slam|throw|headbutt|trample/.test(action.actionType));
              const action = targeted.slice().sort((left, right) =>
                Number(right.actionType === "charge") - Number(left.actionType === "charge") ||
                Number(right.expectedDamage || 0) - Number(left.expectedDamage || 0) ||
                left.actionKey.localeCompare(right.actionKey))[0];
              return action ? {
                actionKey: action.actionKey,
                actionPatch: {
                  strictRollOutcome: buildWarmachineBenchmarkMaximumStrictRollOutcomeV2(action),
                },
              } : null;
            },
            maxSteps: 8,
          },
        );
        stages.raptorActivation = raptorActivation;
        receipts.push(...raptorActivation.receipts);
        state = raptorActivation.state;
        if (!raptorActivation.ok) {
          failures.push({
            stage: "raptor_activation",
            reason: raptorActivation.reason,
            selectionAudit: raptorActivation.selectionAudit,
          });
        }
      }
    }
  }

  const terminalEvents = terminalEventsFromReceipts(receipts);
  if (!failures.length && !terminalEvents.some((event) =>
    event.winnerSideKey === openingState.activeSideKey)) {
    failures.push({ stage: "terminal", reason: "assassination_terminal_not_reached", terminalEvents });
  }
  const core = {
    schemaVersion: "warmachine_fixed_benchmark_assassination_route_v2",
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    routeKey,
    startingStateHash: stableGraphHash(openingState),
    endingStateHash: stableGraphHash(state),
    raptorPieceKey,
    attackerLeaderPieceKey,
    targetLeaderPieceKey,
    targetStartingBoxes: pieceBoxesRemaining(targetLeader),
    opponentDefensePolicy: "decline_damage_transfer_existential_witness_v2",
    adversarialOpponentDefenseProven: false,
    targetEndingBoxes: pieceBoxesRemaining(state.pieces.find((piece) =>
      piece.pieceKey === targetLeaderPieceKey)),
    transitionCount: receipts.length,
    receiptHashes: receipts.map((receipt) => receipt.receiptHash),
    terminalEvents: stableGraphValue(terminalEvents),
    positionTimeline: stableGraphValue(positionTimeline),
    failures: stableGraphValue(failures),
  };
  return {
    ...core,
    routeReceiptHash: stableGraphHash(core),
    ok: failures.length === 0,
    state,
    receipts,
    stages,
  };
}

export function summarizeWarmachineBenchmarkActionV2(action = {}) {
  return {
    actionKey: String(action.actionKey || ""),
    actionType: String(action.actionType || ""),
    actorPieceKey: String(action.actorPieceKey || ""),
    targetPieceKey: String(action.targetPieceKey || ""),
    destination: stableGraphValue(action.destination || null),
    destinationsByModel: stableGraphValue(action.destinationsByModel || action.metadata?.destinationsByModel || []),
    attackProfileKey: String(action.attackProfileKey || action.metadata?.attackProfileKey || action.metadata?.weaponProfileKey || ""),
    expectedDamage: Number(action.expectedDamage || 0),
  };
}
