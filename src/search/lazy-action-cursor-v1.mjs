import {
  buildRulesV1GeneratedMovementTargetPlan,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  WARMACHINE_ENUMERATION_ATTACK_SEQUENCE_KEYS,
  WARMACHINE_ENUMERATION_BOOST_CONFIGURATION_KEYS,
  WARMACHINE_ENUMERATION_MOVEMENT_PATH_KIND_KEYS,
} from "../warmachine-host-runtime.mjs";
import { createHash } from "node:crypto";

export const WARMACHINE_LAZY_ACTION_CURSOR_SCHEMA = "warmachine_lazy_action_cursor_v1";
export const WARMACHINE_ACTION_DIMENSION_CURSOR_SCHEMA = "warmachine_action_dimension_cursor_v1";
export const WARMACHINE_GENERATED_MOVEMENT_TARGET_CURSOR_SCHEMA = "warmachine_generated_movement_target_cursor_v1";
export const WARMACHINE_TARGET_CURSOR_SCHEMA = "warmachine_target_cursor_v1";
export const WARMACHINE_BOOST_CONFIGURATION_CURSOR_SCHEMA = "warmachine_boost_configuration_cursor_v1";
export const WARMACHINE_RESOURCE_AMOUNT_CURSOR_SCHEMA = "warmachine_resource_amount_cursor_v1";
export const WARMACHINE_EFFECT_PROFILE_CURSOR_SCHEMA = "warmachine_effect_profile_cursor_v1";
export const WARMACHINE_ATTACK_SEQUENCE_CURSOR_SCHEMA = "warmachine_attack_sequence_cursor_v1";
export const WARMACHINE_MOVEMENT_PATH_KIND_CURSOR_SCHEMA = "warmachine_movement_path_kind_cursor_v1";

function stableHash(value, length = 20) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, length);
}

function alive(piece = {}) {
  return piece.destroyed !== true && piece.removedFromPlay !== true && piece.offTable !== true && piece.notDeployed !== true;
}

function arrayValues(value) {
  return Array.isArray(value) ? value : [];
}

function activeRuntimeActorPieceKeys(state = {}) {
  const keys = new Set();
  const add = (value) => {
    if (Array.isArray(value)) {
      for (const entry of value) add(entry);
      return;
    }
    const key = String(value || "");
    if (key) keys.add(key);
  };
  const windows = [
    state.unitActivationWindow,
    state.anyTimeActivationWindow,
    state.initialAttackWindow,
    state.combatPurchaseWindow,
    state.activationForfeitWindow,
    state.vengeanceWindow,
    state.repositionWindow,
  ].filter(Boolean);
  for (const window of windows) {
    add(window.actorPieceKey);
    add(window.activationActorPieceKey);
    add(window.selectedModelPieceKey);
    add(window.currentPieceKey);
    add(window.pendingActorPieceKeys);
    add(window.pendingPieceKeys);
    add(window.pendingTrooperPieceKeys);
    add(window.eligiblePieceKeys);
    add(window.affectedPieceKeys);
  }
  const activeKeys = new Set(state.pieces
    .filter((piece) => piece.sideKey === state.activeSideKey && alive(piece))
    .map((piece) => piece.pieceKey));
  return Array.from(keys).filter((pieceKey) => activeKeys.has(pieceKey)).sort();
}

function activationGroupKey(piece = {}) {
  return String(piece.unitGroupId || piece.unitId || piece.metadata?.unitGroupId || piece.metadata?.unitId || piece.pieceKey);
}

function priorityIndex(group = {}, priorityActorPieceKeys = []) {
  const indexByPieceKey = new Map(priorityActorPieceKeys.map((pieceKey, index) => [String(pieceKey), index]));
  const indexes = group.actorPieceKeys.map((pieceKey) => indexByPieceKey.get(pieceKey)).filter(Number.isFinite);
  return indexes.length ? Math.min(...indexes) : Number.POSITIVE_INFINITY;
}

function defaultActionFamily(action = {}) {
  const type = String(action.actionType || "").toLowerCase();
  if (/score|contest|objective/.test(type)) return "scenario";
  if (/attack|charge|slam|throw|headbutt|trample|spell|animus/.test(type)) return "attack_or_effect";
  if (/advance|run|move|place|reposition/.test(type)) return "movement";
  if (/focus|fury|force|leech|resource|upkeep/.test(type)) return "resource";
  if (/^end_|activation_end|pass|forfeit|resolve|decline|stand_up|shake/.test(type)) return "timing";
  return "special";
}

function actionTargetKey(action = {}) {
  return String(
    action.targetPieceKey || action.targetUnitGroupId || action.targetZoneKey || action.targetFlagKey ||
      action.objectiveKey || action.scenarioElementKey || "__no_target__",
  );
}

function actionParameterIdentity(action = {}) {
  const metadata = action.metadata || {};
  return {
    actionType: String(action.actionType || ""),
    destination: action.destination || metadata.destination || null,
    attackProfileKey: String(action.attackProfileKey || metadata.attackProfileKey || metadata.weaponProfileKey || ""),
    spellKey: String(action.spellKey || metadata.spellKey || metadata.spellName || ""),
    animusKey: String(action.animusKey || metadata.animusKey || metadata.animusName || ""),
    resourceKind: String(action.resourceKind || metadata.resourceKind || ""),
    resourceCost: Number(action.resourceCost ?? metadata.resourceCost ?? 0),
    resourceAmount: Number(action.resourceAmount ?? action.amount ?? metadata.amount ?? 0),
    boostedAttack: metadata.boostedAttack === true || metadata.boostedHit === true,
    boostedDamage: metadata.boostedDamage === true,
    participantPieceKeys: arrayValues(action.participantPieceKeys || metadata.participantPieceKeys).map(String).sort(),
    affectedPieceKeys: arrayValues(action.affectedPieceKeys || metadata.affectedPieceKeys).map(String).sort(),
    direction: String(action.direction || metadata.direction || ""),
    mode: String(action.mode || metadata.mode || ""),
  };
}

function normalizedActionEntry(value = {}) {
  const action = value.action || value;
  return {
    action,
    family: String(value.family || action.searchActionFamily || defaultActionFamily(action)),
    score: Number.isFinite(Number(value.score)) ? Number(value.score) : 0,
    cursorRank: Number.isFinite(Number(value.cursorRank)) ? Number(value.cursorRank) : Number.POSITIVE_INFINITY,
  };
}

function cloneKnownRegularMovementActionByActor(value = {}) {
  return Object.fromEntries(Object.entries(value || {}).map(([actorPieceKey, evidence]) => [
    actorPieceKey,
    {
      run: evidence?.run === true,
      advance: evidence?.advance === true,
    },
  ]));
}

function updateKnownRegularMovementActionByActor(known = {}, enumeration = {}) {
  const updated = cloneKnownRegularMovementActionByActor(known);
  for (const candidate of enumeration.actions || []) {
    const actorPieceKey = String(candidate.actorPieceKey || "");
    if (!actorPieceKey) continue;
    const actionType = String(candidate.actionType || "");
    if (!updated[actorPieceKey]) updated[actorPieceKey] = { run: false, advance: false };
    if (actionType === "run") updated[actorPieceKey].run = true;
    if (["advance", "unit_group_advance", "contest_zone_move"].includes(actionType)) {
      updated[actorPieceKey].advance = true;
    }
  }
  return updated;
}

function normalizeGeneratedMovementCursor(plan = {}, cursor = {}) {
  let phaseIndex = Math.max(0, Math.floor(Number(cursor.phaseIndex) || 0));
  let nextTargetIndex = Math.max(0, Math.floor(Number(cursor.nextTargetIndex) || 0));
  while (phaseIndex < plan.phaseRows.length && nextTargetIndex >= plan.phaseRows[phaseIndex].candidateCount) {
    phaseIndex += 1;
    nextTargetIndex = 0;
  }
  return {
    phaseIndex,
    nextTargetIndex,
    knownRegularMovementActionByActor: cloneKnownRegularMovementActionByActor(
      cursor.knownRegularMovementActionByActor || {},
    ),
  };
}

export function enumerateNextWarmachineGeneratedMovementTargetBatch(inputState = {}, cursor = {}, options = {}) {
  const state = normalizeRulesV1State(inputState);
  const actorPieceKeys = arrayValues(options.actorPieceKeys).map(String).filter(Boolean).sort();
  const plan = buildRulesV1GeneratedMovementTargetPlan(state, { actorPieceKeys });
  const normalizedCursor = normalizeGeneratedMovementCursor(plan, cursor);
  const phaseRow = plan.phaseRows[normalizedCursor.phaseIndex] || null;
  if (!phaseRow) {
    return {
      schemaVersion: WARMACHINE_GENERATED_MOVEMENT_TARGET_CURSOR_SCHEMA,
      plan,
      enumeration: null,
      selectedDescriptors: [],
      cursor: { ...normalizedCursor, exhausted: true },
      exhausted: true,
      remainingCandidateCount: 0,
      claimBoundary: "all ordinary generated tactical and open-lane run/advance destination candidates were enumerated",
    };
  }
  const targetBatchSize = Math.max(1, Math.floor(Number(options.targetBatchSize) || 4));
  const selectedDescriptors = phaseRow.descriptors.slice(
    normalizedCursor.nextTargetIndex,
    normalizedCursor.nextTargetIndex + targetBatchSize,
  );
  const enumeration = enumerateRulesV1Actions(state, {
    actorPieceKeys,
    includeActorlessActions: options.includeActorlessActions === true,
    targetPieceKeys: arrayValues(options.targetPieceKeys).map(String).filter(Boolean),
    includeUntargetedActions: options.includeUntargetedActions !== false,
    actionFamilyKeys: ["movement"],
    generatedMovementTargetKeys: selectedDescriptors.map((descriptor) => descriptor.targetScopeKey),
    generatedMovementTargetPhase: phaseRow.phase,
    knownRegularMovementActionByActor: normalizedCursor.knownRegularMovementActionByActor,
    movementPathKindKeys: arrayValues(options.movementPathKindKeys).map(String).filter(Boolean),
  });
  const knownRegularMovementActionByActor = phaseRow.phase === "tactical"
    ? updateKnownRegularMovementActionByActor(
      normalizedCursor.knownRegularMovementActionByActor,
      enumeration,
    )
    : normalizedCursor.knownRegularMovementActionByActor;
  let followingPhaseIndex = normalizedCursor.phaseIndex;
  let followingTargetIndex = normalizedCursor.nextTargetIndex + selectedDescriptors.length;
  if (followingTargetIndex >= phaseRow.candidateCount) {
    followingPhaseIndex += 1;
    followingTargetIndex = 0;
  }
  const following = normalizeGeneratedMovementCursor(plan, {
    phaseIndex: followingPhaseIndex,
    nextTargetIndex: followingTargetIndex,
    knownRegularMovementActionByActor,
  });
  const exhausted = following.phaseIndex >= plan.phaseRows.length;
  const remainingCandidateCount = exhausted ? 0 : plan.phaseRows
    .slice(following.phaseIndex)
    .reduce((sum, row, index) => sum + row.candidateCount - (index === 0 ? following.nextTargetIndex : 0), 0);
  return {
    schemaVersion: WARMACHINE_GENERATED_MOVEMENT_TARGET_CURSOR_SCHEMA,
    plan,
    enumeration,
    phase: phaseRow.phase,
    selectedDescriptors,
    selectedTargetScopeKeys: selectedDescriptors.map((descriptor) => descriptor.targetScopeKey),
    cursor: {
      ...following,
      exhausted,
    },
    exhausted,
    remainingCandidateCount,
    claimBoundary: exhausted
      ? "all ordinary generated tactical and open-lane run/advance destination candidates were enumerated"
      : "unseen generated movement destinations remain legal-space unknowns and must stay unresolved",
  };
}

export function exhaustWarmachineGeneratedMovementTargetCursor(inputState = {}, options = {}) {
  let cursor = {
    phaseIndex: 0,
    nextTargetIndex: 0,
    knownRegularMovementActionByActor: {},
    exhausted: false,
  };
  const batches = [];
  const actions = new Map();
  const rejectedActions = new Map();
  do {
    const batch = enumerateNextWarmachineGeneratedMovementTargetBatch(inputState, cursor, options);
    batches.push(batch);
    for (const candidate of batch.enumeration?.actions || []) actions.set(candidate.actionKey, candidate);
    for (const candidate of batch.enumeration?.rejectedActions || []) {
      const key = `${candidate.actionKey}:${JSON.stringify(candidate.rejection?.issues || {})}`;
      rejectedActions.set(key, candidate);
    }
    cursor = batch.cursor;
  } while (!cursor.exhausted);
  return {
    schemaVersion: WARMACHINE_GENERATED_MOVEMENT_TARGET_CURSOR_SCHEMA,
    plan: batches[0]?.plan || buildRulesV1GeneratedMovementTargetPlan(inputState, options),
    batches,
    actionCount: actions.size,
    actions: Array.from(actions.values()).sort((left, right) => left.actionKey.localeCompare(right.actionKey)),
    rejectedActionCount: rejectedActions.size,
    rejectedActions: Array.from(rejectedActions.values()),
    exhausted: true,
  };
}

function mergeGeneratedMovementTargetEnumerations(batches = []) {
  const first = batches.find((batch) => batch.enumeration)?.enumeration || null;
  if (!first) return null;
  const actions = new Map();
  const rejectedActions = new Map();
  for (const batch of batches) {
    for (const candidate of batch.enumeration?.actions || []) actions.set(candidate.actionKey, candidate);
    for (const candidate of batch.enumeration?.rejectedActions || []) {
      const key = `${candidate.actionKey}:${JSON.stringify(candidate.rejection?.issues || {})}`;
      rejectedActions.set(key, candidate);
    }
  }
  return {
    ...first,
    actionCount: actions.size,
    actions: Array.from(actions.values()),
    rejectedActionCount: rejectedActions.size,
    rejectedActions: Array.from(rejectedActions.values()),
    generatedMovementTargetCursorApplied: true,
    generatedMovementTargetBatchCount: batches.length,
    generatedMovementTargetPhases: Array.from(new Set(batches.map((batch) => batch.phase).filter(Boolean))),
    generatedMovementTargetKeys: batches.flatMap((batch) => batch.selectedTargetScopeKeys || []),
  };
}

export function buildWarmachineTargetCursorPlan(inputState = {}, options = {}) {
  const state = normalizeRulesV1State(inputState);
  const priorityTargetPieceKeys = arrayValues(options.priorityTargetPieceKeys).map(String).filter(Boolean);
  const priorityByPieceKey = new Map(priorityTargetPieceKeys.map((pieceKey, index) => [pieceKey, index]));
  const targetPieceKeys = Array.from(new Set([
    ...state.pieces.filter(alive).map((piece) => piece.pieceKey),
    ...arrayValues(state.scenario?.zones).map((entry) => entry.zoneKey),
    ...arrayValues(state.scenario?.flags).map((entry) => entry.flagKey),
    ...arrayValues(state.scenario?.objectives).map((entry) => entry.objectiveKey || entry.pieceKey),
    ...arrayValues(state.objectives).map((entry) => entry.objectiveKey || entry.pieceKey),
    ...arrayValues(state.terrain).map((entry) => entry.terrainKey),
  ].map(String).filter(Boolean))).sort((left, right) =>
    (priorityByPieceKey.get(left) ?? Number.POSITIVE_INFINITY) -
      (priorityByPieceKey.get(right) ?? Number.POSITIVE_INFINITY) || left.localeCompare(right));
  return {
    schemaVersion: WARMACHINE_TARGET_CURSOR_SCHEMA,
    activeSideKey: state.activeSideKey,
    targetPieceKeys,
    targetCount: targetPieceKeys.length,
    priorityTargetPieceKeys: priorityTargetPieceKeys.filter((pieceKey) => targetPieceKeys.includes(pieceKey)),
    claimBoundary: "all live model, scenario-element, objective, and terrain target identifiers; actorless and otherwise untargeted actions are emitted once outside target pages",
  };
}

export function enumerateNextWarmachineTargetBatch(inputState = {}, cursor = {}, options = {}) {
  const state = normalizeRulesV1State(inputState);
  const plan = buildWarmachineTargetCursorPlan(state, options);
  const nextTargetIndex = Math.max(0, Math.floor(Number(cursor.nextTargetIndex) || 0));
  const targetBatchSize = Math.max(1, Math.floor(Number(options.targetBatchSize) || 8));
  const selectedTargetPieceKeys = plan.targetPieceKeys.slice(nextTargetIndex, nextTargetIndex + targetBatchSize);
  const includeUntargetedActions = cursor.untargetedActionsEnumerated !== true &&
    options.includeUntargetedActions !== false;
  const enumeration = enumerateRulesV1Actions(state, selectedTargetPieceKeys.length ? {
    actorPieceKeys: arrayValues(options.actorPieceKeys).map(String).filter(Boolean),
    includeActorlessActions: options.includeActorlessActions === true,
    targetPieceKeys: selectedTargetPieceKeys,
    includeUntargetedActions,
    actionFamilyKeys: arrayValues(options.actionFamilyKeys).map(String).filter(Boolean),
    boostConfigurationKeys: arrayValues(options.boostConfigurationKeys).map(String).filter(Boolean),
    resourceAmountMode: options.resourceAmountMode,
    resourceAmountValues: arrayValues(options.resourceAmountValues).map(Number).filter(Number.isFinite),
    effectProfileMode: options.effectProfileMode,
    effectProfileKeys: arrayValues(options.effectProfileKeys).map(String).filter(Boolean),
    attackSequenceKeys: arrayValues(options.attackSequenceKeys).map(String).filter(Boolean),
    movementPathKindKeys: arrayValues(options.movementPathKindKeys).map(String).filter(Boolean),
  } : {
    actorPieceKeys: arrayValues(options.actorPieceKeys).map(String).filter(Boolean),
    includeActorlessActions: options.includeActorlessActions === true,
    actionFamilyKeys: arrayValues(options.actionFamilyKeys).map(String).filter(Boolean),
    boostConfigurationKeys: arrayValues(options.boostConfigurationKeys).map(String).filter(Boolean),
    resourceAmountMode: options.resourceAmountMode,
    resourceAmountValues: arrayValues(options.resourceAmountValues).map(Number).filter(Number.isFinite),
    effectProfileMode: options.effectProfileMode,
    effectProfileKeys: arrayValues(options.effectProfileKeys).map(String).filter(Boolean),
    attackSequenceKeys: arrayValues(options.attackSequenceKeys).map(String).filter(Boolean),
    movementPathKindKeys: arrayValues(options.movementPathKindKeys).map(String).filter(Boolean),
  });
  const followingTargetIndex = nextTargetIndex + selectedTargetPieceKeys.length;
  const exhausted = followingTargetIndex >= plan.targetPieceKeys.length;
  const remainingTargetPieceKeys = plan.targetPieceKeys.slice(followingTargetIndex);
  return {
    schemaVersion: WARMACHINE_TARGET_CURSOR_SCHEMA,
    plan,
    enumeration,
    selectedTargetPieceKeys,
    includeUntargetedActions,
    cursor: {
      nextTargetIndex: followingTargetIndex,
      untargetedActionsEnumerated: cursor.untargetedActionsEnumerated === true || includeUntargetedActions,
      exhausted,
    },
    exhausted,
    remainingTargetPieceKeys,
    remainingTargetCount: remainingTargetPieceKeys.length,
    claimBoundary: exhausted
      ? "all live target model batches were enumerated"
      : "unseen target batches remain legal-space unknowns and must stay unresolved",
  };
}

export function exhaustWarmachineTargetCursor(inputState = {}, options = {}) {
  let cursor = { nextTargetIndex: 0, untargetedActionsEnumerated: false, exhausted: false };
  const batches = [];
  const actions = new Map();
  const rejectedActions = new Map();
  do {
    const batch = enumerateNextWarmachineTargetBatch(inputState, cursor, options);
    batches.push(batch);
    for (const candidate of batch.enumeration?.actions || []) actions.set(candidate.actionKey, candidate);
    for (const candidate of batch.enumeration?.rejectedActions || []) {
      const key = `${candidate.actionKey}:${JSON.stringify(candidate.rejection?.issues || {})}`;
      rejectedActions.set(key, candidate);
    }
    cursor = batch.cursor;
  } while (!cursor.exhausted);
  return {
    schemaVersion: WARMACHINE_TARGET_CURSOR_SCHEMA,
    plan: batches[0]?.plan || buildWarmachineTargetCursorPlan(inputState, options),
    batches,
    actionCount: actions.size,
    actions: Array.from(actions.values()).sort((left, right) => left.actionKey.localeCompare(right.actionKey)),
    rejectedActionCount: rejectedActions.size,
    rejectedActions: Array.from(rejectedActions.values()),
    exhausted: true,
  };
}

export function buildWarmachineBoostConfigurationCursorPlan(options = {}) {
  const requestedPriority = arrayValues(options.priorityBoostConfigurationKeys).map(String).filter(Boolean);
  const known = new Set(WARMACHINE_ENUMERATION_BOOST_CONFIGURATION_KEYS);
  const boostConfigurationKeys = Array.from(new Set([
    ...requestedPriority.filter((key) => known.has(key)),
    ...WARMACHINE_ENUMERATION_BOOST_CONFIGURATION_KEYS,
  ]));
  return {
    schemaVersion: WARMACHINE_BOOST_CONFIGURATION_CURSOR_SCHEMA,
    boostConfigurationKeys,
    configurationCount: boostConfigurationKeys.length,
    priorityBoostConfigurationKeys: requestedPriority.filter((key) => known.has(key)),
    claimBoundary: "the four mutually exclusive attack-roll boost configurations; non-boost actions belong to the unboosted partition",
  };
}

export function enumerateNextWarmachineBoostConfigurationBatch(inputState = {}, cursor = {}, options = {}) {
  const state = normalizeRulesV1State(inputState);
  const plan = buildWarmachineBoostConfigurationCursorPlan(options);
  const nextConfigurationIndex = Math.max(0, Math.floor(Number(cursor.nextConfigurationIndex) || 0));
  const configurationBatchSize = Math.max(1, Math.floor(Number(options.configurationBatchSize) || 1));
  const selectedBoostConfigurationKeys = plan.boostConfigurationKeys.slice(
    nextConfigurationIndex,
    nextConfigurationIndex + configurationBatchSize,
  );
  const enumeration = selectedBoostConfigurationKeys.length
    ? enumerateRulesV1Actions(state, {
      actorPieceKeys: arrayValues(options.actorPieceKeys).map(String).filter(Boolean),
      includeActorlessActions: options.includeActorlessActions === true,
      targetPieceKeys: arrayValues(options.targetPieceKeys).map(String).filter(Boolean),
      includeUntargetedActions: options.includeUntargetedActions !== false,
      actionFamilyKeys: arrayValues(options.actionFamilyKeys).map(String).filter(Boolean),
      boostConfigurationKeys: selectedBoostConfigurationKeys,
    })
    : null;
  const followingConfigurationIndex = nextConfigurationIndex + selectedBoostConfigurationKeys.length;
  const exhausted = followingConfigurationIndex >= plan.configurationCount;
  const remainingBoostConfigurationKeys = plan.boostConfigurationKeys.slice(followingConfigurationIndex);
  return {
    schemaVersion: WARMACHINE_BOOST_CONFIGURATION_CURSOR_SCHEMA,
    plan,
    enumeration,
    selectedBoostConfigurationKeys,
    cursor: { nextConfigurationIndex: followingConfigurationIndex, exhausted },
    exhausted,
    remainingBoostConfigurationKeys,
    remainingConfigurationCount: remainingBoostConfigurationKeys.length,
    claimBoundary: exhausted
      ? "all four boost configurations were enumerated"
      : "unseen boost configurations remain legal-space unknowns and must stay unresolved",
  };
}

export function exhaustWarmachineBoostConfigurationCursor(inputState = {}, options = {}) {
  let cursor = { nextConfigurationIndex: 0, exhausted: false };
  const batches = [];
  const actions = new Map();
  const rejectedActions = new Map();
  do {
    const batch = enumerateNextWarmachineBoostConfigurationBatch(inputState, cursor, options);
    batches.push(batch);
    for (const candidate of batch.enumeration?.actions || []) actions.set(candidate.actionKey, candidate);
    for (const candidate of batch.enumeration?.rejectedActions || []) {
      const key = `${candidate.actionKey}:${JSON.stringify(candidate.rejection?.issues || {})}`;
      rejectedActions.set(key, candidate);
    }
    cursor = batch.cursor;
  } while (!cursor.exhausted);
  return {
    schemaVersion: WARMACHINE_BOOST_CONFIGURATION_CURSOR_SCHEMA,
    plan: batches[0]?.plan || buildWarmachineBoostConfigurationCursorPlan(options),
    batches,
    actionCount: actions.size,
    actions: Array.from(actions.values()).sort((left, right) => left.actionKey.localeCompare(right.actionKey)),
    rejectedActionCount: rejectedActions.size,
    rejectedActions: Array.from(rejectedActions.values()),
    exhausted: true,
  };
}

export function buildWarmachineResourceAmountCursorPlan(options = {}) {
  const priorityResourceAmounts = Array.from(new Set(
    arrayValues(options.priorityResourceAmounts).map(Number).filter(Number.isFinite),
  ));
  const partitions = priorityResourceAmounts.map((resourceAmount) => ({
    partitionKey: `exact:${resourceAmount}`,
    mode: "include",
    resourceAmountValues: [resourceAmount],
    exactResourceAmount: resourceAmount,
  }));
  partitions.push({
    partitionKey: priorityResourceAmounts.length ? "remaining" : "all",
    mode: priorityResourceAmounts.length ? "exclude" : "all",
    resourceAmountValues: priorityResourceAmounts,
    exactResourceAmount: null,
  });
  return {
    schemaVersion: WARMACHINE_RESOURCE_AMOUNT_CURSOR_SCHEMA,
    priorityResourceAmounts,
    partitions,
    partitionCount: partitions.length,
    claimBoundary: "priority exact resource amounts followed by one open-ended complement partition; amountless actions remain invariant",
  };
}

export function enumerateNextWarmachineResourceAmountBatch(inputState = {}, cursor = {}, options = {}) {
  const state = normalizeRulesV1State(inputState);
  const plan = buildWarmachineResourceAmountCursorPlan(options);
  const nextPartitionIndex = Math.max(0, Math.floor(Number(cursor.nextPartitionIndex) || 0));
  const selectedPartition = plan.partitions[nextPartitionIndex] || null;
  const scopedOptions = selectedPartition?.mode === "all" ? {} : {
    resourceAmountMode: selectedPartition?.mode,
    resourceAmountValues: selectedPartition?.resourceAmountValues || [],
  };
  const enumeration = selectedPartition ? enumerateRulesV1Actions(state, {
    actorPieceKeys: arrayValues(options.actorPieceKeys).map(String).filter(Boolean),
    includeActorlessActions: options.includeActorlessActions === true,
    targetPieceKeys: arrayValues(options.targetPieceKeys).map(String).filter(Boolean),
    includeUntargetedActions: options.includeUntargetedActions !== false,
    actionFamilyKeys: arrayValues(options.actionFamilyKeys).map(String).filter(Boolean),
    ...scopedOptions,
  }) : null;
  const followingPartitionIndex = nextPartitionIndex + Number(Boolean(selectedPartition));
  const exhausted = followingPartitionIndex >= plan.partitionCount;
  return {
    schemaVersion: WARMACHINE_RESOURCE_AMOUNT_CURSOR_SCHEMA,
    plan,
    enumeration,
    selectedPartition,
    cursor: { nextPartitionIndex: followingPartitionIndex, exhausted },
    exhausted,
    remainingPartitions: plan.partitions.slice(followingPartitionIndex),
    remainingPartitionCount: Math.max(0, plan.partitionCount - followingPartitionIndex),
    claimBoundary: exhausted
      ? "all priority resource amounts and the open-ended complement were enumerated"
      : "unseen resource-amount partitions remain legal-space unknowns and must stay unresolved",
  };
}

export function exhaustWarmachineResourceAmountCursor(inputState = {}, options = {}) {
  let cursor = { nextPartitionIndex: 0, exhausted: false };
  const batches = [];
  const actions = new Map();
  const rejectedActions = new Map();
  do {
    const batch = enumerateNextWarmachineResourceAmountBatch(inputState, cursor, options);
    batches.push(batch);
    for (const candidate of batch.enumeration?.actions || []) actions.set(candidate.actionKey, candidate);
    for (const candidate of batch.enumeration?.rejectedActions || []) {
      const key = `${candidate.actionKey}:${JSON.stringify(candidate.rejection?.issues || {})}`;
      rejectedActions.set(key, candidate);
    }
    cursor = batch.cursor;
  } while (!cursor.exhausted);
  return {
    schemaVersion: WARMACHINE_RESOURCE_AMOUNT_CURSOR_SCHEMA,
    plan: batches[0]?.plan || buildWarmachineResourceAmountCursorPlan(options),
    batches,
    actionCount: actions.size,
    actions: Array.from(actions.values()).sort((left, right) => left.actionKey.localeCompare(right.actionKey)),
    rejectedActionCount: rejectedActions.size,
    rejectedActions: Array.from(rejectedActions.values()),
    exhausted: true,
  };
}

export function buildWarmachineEffectProfileCursorPlan(options = {}) {
  const priorityEffectProfileKeys = Array.from(new Set(
    arrayValues(options.priorityEffectProfileKeys).map(String).filter(Boolean),
  ));
  const partitions = priorityEffectProfileKeys.map((effectProfileKey) => ({
    partitionKey: `exact:${effectProfileKey}`,
    mode: "include",
    effectProfileKeys: [effectProfileKey],
    exactEffectProfileKey: effectProfileKey,
  }));
  partitions.push({
    partitionKey: priorityEffectProfileKeys.length ? "remaining" : "all",
    mode: priorityEffectProfileKeys.length ? "exclude" : "all",
    effectProfileKeys: priorityEffectProfileKeys,
    exactEffectProfileKey: "",
  });
  return {
    schemaVersion: WARMACHINE_EFFECT_PROFILE_CURSOR_SCHEMA,
    priorityEffectProfileKeys,
    partitions,
    partitionCount: partitions.length,
    claimBoundary: "priority exact spell/animus profiles followed by one open-ended complement; non-effect actions remain invariant",
  };
}

export function enumerateNextWarmachineEffectProfileBatch(inputState = {}, cursor = {}, options = {}) {
  const state = normalizeRulesV1State(inputState);
  const plan = buildWarmachineEffectProfileCursorPlan(options);
  const nextPartitionIndex = Math.max(0, Math.floor(Number(cursor.nextPartitionIndex) || 0));
  const selectedPartition = plan.partitions[nextPartitionIndex] || null;
  const scopedOptions = selectedPartition?.mode === "all" ? {} : {
    effectProfileMode: selectedPartition?.mode,
    effectProfileKeys: selectedPartition?.effectProfileKeys || [],
  };
  const enumeration = selectedPartition ? enumerateRulesV1Actions(state, {
    actorPieceKeys: arrayValues(options.actorPieceKeys).map(String).filter(Boolean),
    includeActorlessActions: options.includeActorlessActions === true,
    targetPieceKeys: arrayValues(options.targetPieceKeys).map(String).filter(Boolean),
    includeUntargetedActions: options.includeUntargetedActions !== false,
    actionFamilyKeys: arrayValues(options.actionFamilyKeys).map(String).filter(Boolean),
    ...scopedOptions,
  }) : null;
  const followingPartitionIndex = nextPartitionIndex + Number(Boolean(selectedPartition));
  const exhausted = followingPartitionIndex >= plan.partitionCount;
  return {
    schemaVersion: WARMACHINE_EFFECT_PROFILE_CURSOR_SCHEMA,
    plan,
    enumeration,
    selectedPartition,
    cursor: { nextPartitionIndex: followingPartitionIndex, exhausted },
    exhausted,
    remainingPartitions: plan.partitions.slice(followingPartitionIndex),
    remainingPartitionCount: Math.max(0, plan.partitionCount - followingPartitionIndex),
    claimBoundary: exhausted
      ? "all priority effect profiles and the open-ended complement were enumerated"
      : "unseen spell/animus profile partitions remain legal-space unknowns and must stay unresolved",
  };
}

export function exhaustWarmachineEffectProfileCursor(inputState = {}, options = {}) {
  let cursor = { nextPartitionIndex: 0, exhausted: false };
  const batches = [];
  const actions = new Map();
  const rejectedActions = new Map();
  do {
    const batch = enumerateNextWarmachineEffectProfileBatch(inputState, cursor, options);
    batches.push(batch);
    for (const candidate of batch.enumeration?.actions || []) actions.set(candidate.actionKey, candidate);
    for (const candidate of batch.enumeration?.rejectedActions || []) {
      const key = `${candidate.actionKey}:${JSON.stringify(candidate.rejection?.issues || {})}`;
      rejectedActions.set(key, candidate);
    }
    cursor = batch.cursor;
  } while (!cursor.exhausted);
  return {
    schemaVersion: WARMACHINE_EFFECT_PROFILE_CURSOR_SCHEMA,
    plan: batches[0]?.plan || buildWarmachineEffectProfileCursorPlan(options),
    batches,
    actionCount: actions.size,
    actions: Array.from(actions.values()).sort((left, right) => left.actionKey.localeCompare(right.actionKey)),
    rejectedActionCount: rejectedActions.size,
    rejectedActions: Array.from(rejectedActions.values()),
    exhausted: true,
  };
}

export function buildWarmachineAttackSequenceCursorPlan(options = {}) {
  const known = new Set(WARMACHINE_ENUMERATION_ATTACK_SEQUENCE_KEYS);
  const requestedPriority = arrayValues(options.priorityAttackSequenceKeys).map(String).filter((key) => known.has(key));
  const attackSequenceKeys = Array.from(new Set([
    ...requestedPriority,
    ...WARMACHINE_ENUMERATION_ATTACK_SEQUENCE_KEYS,
  ]));
  return {
    schemaVersion: WARMACHINE_ATTACK_SEQUENCE_CURSOR_SCHEMA,
    priorityAttackSequenceKeys: requestedPriority,
    attackSequenceKeys,
    partitions: attackSequenceKeys.map((attackSequenceKey) => ({
      partitionKey: `exact:${attackSequenceKey}`,
      attackSequenceKeys: [attackSequenceKey],
      exactAttackSequenceKey: attackSequenceKey,
    })),
    partitionCount: attackSequenceKeys.length,
    claimBoundary: "base attacks/effects and additional attacks are exhaustive mutually exclusive attack-sequence partitions; non-attack actions remain invariant",
  };
}

export function enumerateNextWarmachineAttackSequenceBatch(inputState = {}, cursor = {}, options = {}) {
  const state = normalizeRulesV1State(inputState);
  const plan = buildWarmachineAttackSequenceCursorPlan(options);
  const nextPartitionIndex = Math.max(0, Math.floor(Number(cursor.nextPartitionIndex) || 0));
  const selectedPartition = plan.partitions[nextPartitionIndex] || null;
  const enumeration = selectedPartition ? enumerateRulesV1Actions(state, {
    actorPieceKeys: arrayValues(options.actorPieceKeys).map(String).filter(Boolean),
    includeActorlessActions: options.includeActorlessActions === true,
    targetPieceKeys: arrayValues(options.targetPieceKeys).map(String).filter(Boolean),
    includeUntargetedActions: options.includeUntargetedActions !== false,
    actionFamilyKeys: arrayValues(options.actionFamilyKeys).map(String).filter(Boolean),
    attackSequenceKeys: selectedPartition.attackSequenceKeys,
  }) : null;
  const followingPartitionIndex = nextPartitionIndex + Number(Boolean(selectedPartition));
  const exhausted = followingPartitionIndex >= plan.partitionCount;
  return {
    schemaVersion: WARMACHINE_ATTACK_SEQUENCE_CURSOR_SCHEMA,
    plan,
    enumeration,
    selectedPartition,
    cursor: { nextPartitionIndex: followingPartitionIndex, exhausted },
    exhausted,
    remainingPartitions: plan.partitions.slice(followingPartitionIndex),
    remainingPartitionCount: Math.max(0, plan.partitionCount - followingPartitionIndex),
    claimBoundary: exhausted
      ? "both base and additional attack-sequence partitions were enumerated"
      : "unseen attack-sequence partitions remain legal-space unknowns and must stay unresolved",
  };
}

export function exhaustWarmachineAttackSequenceCursor(inputState = {}, options = {}) {
  let cursor = { nextPartitionIndex: 0, exhausted: false };
  const batches = [];
  const actions = new Map();
  const rejectedActions = new Map();
  do {
    const batch = enumerateNextWarmachineAttackSequenceBatch(inputState, cursor, options);
    batches.push(batch);
    for (const candidate of batch.enumeration?.actions || []) actions.set(candidate.actionKey, candidate);
    for (const candidate of batch.enumeration?.rejectedActions || []) {
      const key = `${candidate.actionKey}:${JSON.stringify(candidate.rejection?.issues || {})}`;
      rejectedActions.set(key, candidate);
    }
    cursor = batch.cursor;
  } while (!cursor.exhausted);
  return {
    schemaVersion: WARMACHINE_ATTACK_SEQUENCE_CURSOR_SCHEMA,
    plan: batches[0]?.plan || buildWarmachineAttackSequenceCursorPlan(options),
    batches,
    actionCount: actions.size,
    actions: Array.from(actions.values()).sort((left, right) => left.actionKey.localeCompare(right.actionKey)),
    rejectedActionCount: rejectedActions.size,
    rejectedActions: Array.from(rejectedActions.values()),
    exhausted: true,
  };
}

export function buildWarmachineMovementPathKindCursorPlan(options = {}) {
  const known = new Set(WARMACHINE_ENUMERATION_MOVEMENT_PATH_KIND_KEYS);
  const requestedPriority = arrayValues(options.priorityMovementPathKindKeys).map(String).filter((key) => known.has(key));
  const movementPathKindKeys = Array.from(new Set([
    ...requestedPriority,
    ...WARMACHINE_ENUMERATION_MOVEMENT_PATH_KIND_KEYS,
  ]));
  return {
    schemaVersion: WARMACHINE_MOVEMENT_PATH_KIND_CURSOR_SCHEMA,
    priorityMovementPathKindKeys: requestedPriority,
    movementPathKindKeys,
    partitions: movementPathKindKeys.map((movementPathKindKey) => ({
      partitionKey: `exact:${movementPathKindKey}`,
      movementPathKindKeys: [movementPathKindKey],
      exactMovementPathKindKey: movementPathKindKey,
    })),
    partitionCount: movementPathKindKeys.length,
    claimBoundary: "ordinary/no-path, explicit waypoint, and auto-routed paths are exhaustive mutually exclusive action partitions",
  };
}

export function enumerateNextWarmachineMovementPathKindBatch(inputState = {}, cursor = {}, options = {}) {
  const state = normalizeRulesV1State(inputState);
  const plan = buildWarmachineMovementPathKindCursorPlan(options);
  const nextPartitionIndex = Math.max(0, Math.floor(Number(cursor.nextPartitionIndex) || 0));
  const selectedPartition = plan.partitions[nextPartitionIndex] || null;
  const enumeration = selectedPartition ? enumerateRulesV1Actions(state, {
    actorPieceKeys: arrayValues(options.actorPieceKeys).map(String).filter(Boolean),
    includeActorlessActions: options.includeActorlessActions === true,
    targetPieceKeys: arrayValues(options.targetPieceKeys).map(String).filter(Boolean),
    includeUntargetedActions: options.includeUntargetedActions !== false,
    actionFamilyKeys: arrayValues(options.actionFamilyKeys).map(String).filter(Boolean),
    movementPathKindKeys: selectedPartition.movementPathKindKeys,
  }) : null;
  const followingPartitionIndex = nextPartitionIndex + Number(Boolean(selectedPartition));
  const exhausted = followingPartitionIndex >= plan.partitionCount;
  return {
    schemaVersion: WARMACHINE_MOVEMENT_PATH_KIND_CURSOR_SCHEMA,
    plan,
    enumeration,
    selectedPartition,
    cursor: { nextPartitionIndex: followingPartitionIndex, exhausted },
    exhausted,
    remainingPartitions: plan.partitions.slice(followingPartitionIndex),
    remainingPartitionCount: Math.max(0, plan.partitionCount - followingPartitionIndex),
    claimBoundary: exhausted
      ? "ordinary/no-path, explicit waypoint, and auto-routed path partitions were enumerated"
      : "unseen movement-path partitions remain legal-space unknowns and must stay unresolved",
  };
}

export function exhaustWarmachineMovementPathKindCursor(inputState = {}, options = {}) {
  let cursor = { nextPartitionIndex: 0, exhausted: false };
  const batches = [];
  const actions = new Map();
  const rejectedActions = new Map();
  do {
    const batch = enumerateNextWarmachineMovementPathKindBatch(inputState, cursor, options);
    batches.push(batch);
    for (const candidate of batch.enumeration?.actions || []) actions.set(candidate.actionKey, candidate);
    for (const candidate of batch.enumeration?.rejectedActions || []) {
      const key = `${candidate.actionKey}:${JSON.stringify(candidate.rejection?.issues || {})}`;
      rejectedActions.set(key, candidate);
    }
    cursor = batch.cursor;
  } while (!cursor.exhausted);
  return {
    schemaVersion: WARMACHINE_MOVEMENT_PATH_KIND_CURSOR_SCHEMA,
    plan: batches[0]?.plan || buildWarmachineMovementPathKindCursorPlan(options),
    batches,
    actionCount: actions.size,
    actions: Array.from(actions.values()).sort((left, right) => left.actionKey.localeCompare(right.actionKey)),
    rejectedActionCount: rejectedActions.size,
    rejectedActions: Array.from(rejectedActions.values()),
    exhausted: true,
  };
}

function mergeTargetEnumerations(batches = []) {
  const first = batches.find((batch) => batch.enumeration)?.enumeration || null;
  if (!first) return null;
  const actions = new Map();
  const rejectedActions = new Map();
  for (const batch of batches) {
    for (const candidate of batch.enumeration?.actions || []) actions.set(candidate.actionKey, candidate);
    for (const candidate of batch.enumeration?.rejectedActions || []) {
      const key = `${candidate.actionKey}:${JSON.stringify(candidate.rejection?.issues || {})}`;
      rejectedActions.set(key, candidate);
    }
  }
  return {
    ...first,
    actionCount: actions.size,
    actions: Array.from(actions.values()),
    rejectedActionCount: rejectedActions.size,
    rejectedActions: Array.from(rejectedActions.values()),
    targetCursorApplied: true,
    targetBatchCount: batches.length,
    targetScopePieceKeys: Array.from(new Set(batches.flatMap((batch) => batch.selectedTargetPieceKeys))).sort(),
    untargetedActionsIncludedInTargetScope: batches.some((batch) => batch.includeUntargetedActions),
  };
}

export function buildWarmachineActionDimensionCursorPlan(inputActions = []) {
  const entries = inputActions.map(normalizedActionEntry)
    .filter((entry) => entry.action?.actionKey);
  const families = new Map();
  for (const entry of entries) {
    const targetKey = actionTargetKey(entry.action);
    const parameterIdentity = actionParameterIdentity(entry.action);
    const parameterKey = `parameter-${stableHash(parameterIdentity)}`;
    if (!families.has(entry.family)) families.set(entry.family, new Map());
    const targets = families.get(entry.family);
    if (!targets.has(targetKey)) targets.set(targetKey, new Map());
    const parameters = targets.get(targetKey);
    if (!parameters.has(parameterKey)) parameters.set(parameterKey, { parameterIdentity, entries: [] });
    parameters.get(parameterKey).entries.push(entry);
  }
  const familyRows = Array.from(families, ([familyKey, targets]) => {
    const targetRows = Array.from(targets, ([targetKey, parameters]) => {
      const parameterRows = Array.from(parameters, ([parameterKey, parameter]) => ({
        parameterKey,
        parameterIdentity: parameter.parameterIdentity,
        actionEntries: parameter.entries.slice().sort((left, right) =>
          left.cursorRank - right.cursorRank || right.score - left.score ||
            left.action.actionKey.localeCompare(right.action.actionKey)),
        minimumCursorRank: Math.min(...parameter.entries.map((entry) => entry.cursorRank)),
        maximumOrderingScore: Math.max(...parameter.entries.map((entry) => entry.score)),
      })).sort((left, right) =>
        left.minimumCursorRank - right.minimumCursorRank ||
        right.maximumOrderingScore - left.maximumOrderingScore || left.parameterKey.localeCompare(right.parameterKey));
      return {
        targetKey,
        parameterRows,
        actionCount: parameterRows.reduce((sum, row) => sum + row.actionEntries.length, 0),
        minimumCursorRank: Math.min(...parameterRows.map((row) => row.minimumCursorRank)),
        maximumOrderingScore: Math.max(...parameterRows.map((row) => row.maximumOrderingScore)),
      };
    }).sort((left, right) =>
      left.minimumCursorRank - right.minimumCursorRank ||
      right.maximumOrderingScore - left.maximumOrderingScore || left.targetKey.localeCompare(right.targetKey));
    return {
      familyKey,
      targetRows,
      actionCount: targetRows.reduce((sum, row) => sum + row.actionCount, 0),
      minimumCursorRank: Math.min(...targetRows.map((row) => row.minimumCursorRank)),
      maximumOrderingScore: Math.max(...targetRows.map((row) => row.maximumOrderingScore)),
    };
  }).sort((left, right) =>
    left.minimumCursorRank - right.minimumCursorRank ||
    right.maximumOrderingScore - left.maximumOrderingScore || left.familyKey.localeCompare(right.familyKey));
  const parameterBatches = familyRows.flatMap((family) => family.targetRows.flatMap((target) =>
    target.parameterRows.map((parameter) => ({
      familyKey: family.familyKey,
      targetKey: target.targetKey,
      parameterKey: parameter.parameterKey,
      parameterIdentity: parameter.parameterIdentity,
      actionEntries: parameter.actionEntries,
      actionCount: parameter.actionEntries.length,
      minimumCursorRank: parameter.minimumCursorRank,
      maximumOrderingScore: parameter.maximumOrderingScore,
    })))).sort((left, right) =>
    left.minimumCursorRank - right.minimumCursorRank ||
    right.maximumOrderingScore - left.maximumOrderingScore ||
    left.familyKey.localeCompare(right.familyKey) || left.targetKey.localeCompare(right.targetKey) ||
    left.parameterKey.localeCompare(right.parameterKey));
  return {
    schemaVersion: WARMACHINE_ACTION_DIMENSION_CURSOR_SCHEMA,
    familyRows,
    parameterBatches,
    familyCount: familyRows.length,
    targetCount: familyRows.reduce((sum, family) => sum + family.targetRows.length, 0),
    parameterBatchCount: parameterBatches.length,
    actionCount: entries.length,
    exhaustiveInputActionKeys: entries.map((entry) => entry.action.actionKey).sort(),
  };
}

export function enumerateNextWarmachineActionDimensionBatch(inputActions = [], cursor = {}, options = {}) {
  const plan = buildWarmachineActionDimensionCursorPlan(inputActions);
  const nextParameterBatchIndex = Math.max(0, Math.floor(Number(cursor.nextParameterBatchIndex) || 0));
  const parameterBatchSize = Math.max(1, Math.floor(Number(options.parameterBatchSize) || 1));
  const selectedParameterBatches = plan.parameterBatches.slice(
    nextParameterBatchIndex,
    nextParameterBatchIndex + parameterBatchSize,
  );
  const followingParameterBatchIndex = nextParameterBatchIndex + selectedParameterBatches.length;
  const exhausted = followingParameterBatchIndex >= plan.parameterBatches.length;
  const remainingParameterBatches = plan.parameterBatches.slice(followingParameterBatchIndex);
  return {
    schemaVersion: WARMACHINE_ACTION_DIMENSION_CURSOR_SCHEMA,
    plan,
    selectedParameterBatches,
    actionEntries: selectedParameterBatches.flatMap((batch) => batch.actionEntries),
    actions: selectedParameterBatches.flatMap((batch) => batch.actionEntries.map((entry) => entry.action)),
    cursor: { nextParameterBatchIndex: followingParameterBatchIndex, exhausted },
    exhausted,
    remainingParameterBatchCount: remainingParameterBatches.length,
    remainingActionCount: remainingParameterBatches.reduce((sum, batch) => sum + batch.actionCount, 0),
    claimBoundary: exhausted
      ? "all action-family, target, and parameter batches were enumerated"
      : "unseen action-family, target, or parameter batches remain legal-space unknowns and must stay unresolved",
  };
}

export function exhaustWarmachineActionDimensionCursor(inputActions = [], options = {}) {
  let cursor = { nextParameterBatchIndex: 0, exhausted: false };
  const batches = [];
  const actions = new Map();
  do {
    const batch = enumerateNextWarmachineActionDimensionBatch(inputActions, cursor, options);
    batches.push(batch);
    for (const action of batch.actions) actions.set(action.actionKey, action);
    cursor = batch.cursor;
  } while (!cursor.exhausted);
  return {
    schemaVersion: WARMACHINE_ACTION_DIMENSION_CURSOR_SCHEMA,
    plan: batches[0]?.plan || buildWarmachineActionDimensionCursorPlan(inputActions),
    batches,
    actionCount: actions.size,
    actions: Array.from(actions.values()).sort((left, right) => left.actionKey.localeCompare(right.actionKey)),
    exhausted: true,
  };
}

export function buildWarmachineLazyActionCursorPlan(inputState = {}, options = {}) {
  const state = normalizeRulesV1State(inputState);
  if (state.phaseKey === "control") {
    return {
      schemaVersion: WARMACHINE_LAZY_ACTION_CURSOR_SCHEMA,
      phaseKey: state.phaseKey,
      activeSideKey: state.activeSideKey,
      mode: "full_phase_enumeration",
      groups: [{ groupKey: "control-phase-global", actorPieceKeys: [], pieceCount: 0 }],
      groupCount: 1,
    };
  }
  const runtimeActorPieceKeys = activeRuntimeActorPieceKeys(state);
  const runtimeActorSet = new Set(runtimeActorPieceKeys);
  const candidatePieces = state.pieces.filter((piece) =>
    piece.sideKey === state.activeSideKey &&
    alive(piece) &&
    (runtimeActorSet.size ? runtimeActorSet.has(piece.pieceKey) : piece.activated !== true));
  const groupsByKey = new Map();
  for (const piece of candidatePieces) {
    const groupKey = runtimeActorSet.size ? "active-runtime-window" : activationGroupKey(piece);
    if (!groupsByKey.has(groupKey)) groupsByKey.set(groupKey, []);
    groupsByKey.get(groupKey).push(piece.pieceKey);
  }
  let groups = Array.from(groupsByKey, ([groupKey, actorPieceKeys]) => ({
    groupKey,
    actorPieceKeys: Array.from(new Set(actorPieceKeys)).sort(),
    pieceCount: new Set(actorPieceKeys).size,
  }));
  if (!groups.length) groups = [{ groupKey: "activation-phase-global", actorPieceKeys: [], pieceCount: 0 }];
  const priorityActorPieceKeys = arrayValues(options.priorityActorPieceKeys).map(String);
  groups.sort((left, right) =>
    priorityIndex(left, priorityActorPieceKeys) - priorityIndex(right, priorityActorPieceKeys) ||
    left.groupKey.localeCompare(right.groupKey));
  return {
    schemaVersion: WARMACHINE_LAZY_ACTION_CURSOR_SCHEMA,
    phaseKey: state.phaseKey,
    activeSideKey: state.activeSideKey,
    mode: runtimeActorSet.size ? "forced_runtime_window" : "activation_group_batches",
    groups,
    groupCount: groups.length,
    runtimeActorPieceKeys,
    priorityActorPieceKeys,
  };
}

export function enumerateNextWarmachineLazyActionBatch(inputState = {}, cursor = {}, options = {}) {
  const state = normalizeRulesV1State(inputState);
  const plan = buildWarmachineLazyActionCursorPlan(state, options);
  const nextGroupIndex = Math.max(0, Math.floor(Number(cursor.nextGroupIndex) || 0));
  const groupBatchSize = Math.max(1, Math.floor(Number(options.groupBatchSize) || 1));
  const selectedGroups = plan.groups.slice(nextGroupIndex, nextGroupIndex + groupBatchSize);
  if (!selectedGroups.length) {
    return {
      schemaVersion: WARMACHINE_LAZY_ACTION_CURSOR_SCHEMA,
      plan,
      enumeration: null,
      selectedGroups: [],
      cursor: { nextGroupIndex, exhausted: true },
      exhausted: true,
      remainingGroupCount: 0,
    };
  }
  const actorPieceKeys = Array.from(new Set(selectedGroups.flatMap((group) => group.actorPieceKeys))).sort();
  const fullPhaseEnumeration = plan.mode === "full_phase_enumeration" || actorPieceKeys.length === 0;
  const requestedTargetPieceKeys = arrayValues(options.targetPieceKeys).map(String).filter(Boolean).sort();
  const requestedActionFamilyKeys = arrayValues(options.actionFamilyKeys).map(String).filter(Boolean).sort();
  const requestedBoostConfigurationKeys = arrayValues(options.boostConfigurationKeys).map(String).filter(Boolean).sort();
  const requestedResourceAmountValues = arrayValues(options.resourceAmountValues).map(Number).filter(Number.isFinite)
    .sort((left, right) => left - right);
  const requestedResourceAmountMode = options.resourceAmountMode === "exclude" ? "exclude" : "include";
  const requestedEffectProfileKeys = arrayValues(options.effectProfileKeys).map(String).filter(Boolean).sort();
  const requestedEffectProfileMode = options.effectProfileMode === "exclude" ? "exclude" : "include";
  const requestedAttackSequenceKeys = arrayValues(options.attackSequenceKeys).map(String).filter(Boolean).sort();
  const requestedMovementPathKindKeys = arrayValues(options.movementPathKindKeys).map(String).filter(Boolean).sort();
  const requestedTargetSet = new Set(requestedTargetPieceKeys);
  let remainingPotentialTargetPieceKeys = requestedTargetSet.size
    ? state.pieces.filter((piece) => alive(piece) && !requestedTargetSet.has(piece.pieceKey))
      .map((piece) => piece.pieceKey).sort()
    : [];
  const cacheKey = [
    String(options.stateCacheKey || ""),
    fullPhaseEnumeration ? "full" : actorPieceKeys.join(","),
    requestedTargetPieceKeys.join(",") || "all-targets",
    requestedActionFamilyKeys.join(",") || "all-families",
    requestedBoostConfigurationKeys.join(",") || "all-boost-configurations",
    requestedResourceAmountValues.length ? `${requestedResourceAmountMode}:${requestedResourceAmountValues.join(",")}` : "all-resource-amounts",
    requestedEffectProfileKeys.length ? `${requestedEffectProfileMode}:${requestedEffectProfileKeys.join(",")}` : "all-effect-profiles",
    requestedAttackSequenceKeys.join(",") || "all-attack-sequences",
    requestedMovementPathKindKeys.join(",") || "all-movement-path-kinds",
    Math.max(0, Math.floor(Number(options.movementTargetBatchSize) || 0)),
    Math.max(0, Math.floor(Number(options.maximumMovementTargetBatches) || 0)),
    JSON.stringify(options.movementTargetCursor || {}),
    Math.max(0, Math.floor(Number(options.targetBatchSize) || 0)),
    Math.max(0, Math.floor(Number(options.maximumTargetBatches) || 0)),
    JSON.stringify(options.targetCursor || {}),
    nextGroupIndex === 0 ? "with-actorless" : "actor-only",
  ].join("|");
  const enumerationCache = options.enumerationCache instanceof Map ? options.enumerationCache : null;
  let enumeration = enumerationCache?.get(cacheKey) || null;
  const enumerationCacheHit = Boolean(enumeration);
  let generatedMovementTargetBatches = [];
  let generatedMovementTargetCursor = null;
  let generatedMovementTargetsRemaining = 0;
  let targetBatches = [];
  let targetCursor = null;
  let targetsRemaining = 0;
  if (!enumeration) {
    const movementTargetPagingEnabled = !fullPhaseEnumeration &&
      requestedActionFamilyKeys.length === 1 &&
      requestedActionFamilyKeys[0] === "movement" &&
      Number(options.movementTargetBatchSize) > 0 &&
      Number(options.maximumMovementTargetBatches) > 0;
    const targetPagingEnabled = !fullPhaseEnumeration &&
      requestedActionFamilyKeys.length === 1 &&
      requestedActionFamilyKeys[0] !== "movement" &&
      Number(options.targetBatchSize) > 0 &&
      Number(options.maximumTargetBatches) > 0;
    if (movementTargetPagingEnabled) {
      generatedMovementTargetCursor = options.movementTargetCursor || {
        phaseIndex: 0,
        nextTargetIndex: 0,
        knownRegularMovementActionByActor: {},
        exhausted: false,
      };
      const maximumMovementTargetBatches = Math.max(1, Math.floor(Number(options.maximumMovementTargetBatches) || 1));
      while (!generatedMovementTargetCursor.exhausted && generatedMovementTargetBatches.length < maximumMovementTargetBatches) {
        const movementBatch = enumerateNextWarmachineGeneratedMovementTargetBatch(
          state,
          generatedMovementTargetCursor,
          {
            actorPieceKeys,
            includeActorlessActions: nextGroupIndex === 0,
            targetPieceKeys: requestedTargetPieceKeys,
            includeUntargetedActions: options.includeUntargetedActions !== false,
            targetBatchSize: options.movementTargetBatchSize,
            boostConfigurationKeys: requestedBoostConfigurationKeys,
            resourceAmountMode: requestedResourceAmountMode,
            resourceAmountValues: requestedResourceAmountValues,
            effectProfileMode: requestedEffectProfileMode,
            effectProfileKeys: requestedEffectProfileKeys,
            attackSequenceKeys: requestedAttackSequenceKeys,
            movementPathKindKeys: requestedMovementPathKindKeys,
          },
        );
        generatedMovementTargetBatches.push(movementBatch);
        generatedMovementTargetCursor = movementBatch.cursor;
        generatedMovementTargetsRemaining = movementBatch.remainingCandidateCount;
      }
      enumeration = mergeGeneratedMovementTargetEnumerations(generatedMovementTargetBatches);
      if (enumeration) {
        enumeration.generatedMovementTargetCursor = generatedMovementTargetCursor;
        enumeration.generatedMovementTargetsRemaining = generatedMovementTargetsRemaining;
        enumeration.generatedMovementTargetCursorExhausted = generatedMovementTargetCursor?.exhausted === true;
      } else {
        enumeration = enumerateRulesV1Actions(state, {
          actorPieceKeys,
          includeActorlessActions: nextGroupIndex === 0,
          targetPieceKeys: requestedTargetPieceKeys,
          includeUntargetedActions: options.includeUntargetedActions !== false,
          actionFamilyKeys: requestedActionFamilyKeys,
          boostConfigurationKeys: requestedBoostConfigurationKeys,
          resourceAmountMode: requestedResourceAmountMode,
          resourceAmountValues: requestedResourceAmountValues,
          effectProfileMode: requestedEffectProfileMode,
          effectProfileKeys: requestedEffectProfileKeys,
          attackSequenceKeys: requestedAttackSequenceKeys,
          movementPathKindKeys: requestedMovementPathKindKeys,
        });
        enumeration.generatedMovementTargetCursorApplied = true;
        enumeration.generatedMovementTargetCursor = generatedMovementTargetCursor;
        enumeration.generatedMovementTargetsRemaining = 0;
        enumeration.generatedMovementTargetCursorExhausted = true;
      }
    } else if (targetPagingEnabled) {
      targetCursor = options.targetCursor || {
        nextTargetIndex: 0,
        untargetedActionsEnumerated: false,
        exhausted: false,
      };
      const maximumTargetBatches = Math.max(1, Math.floor(Number(options.maximumTargetBatches) || 1));
      while (!targetCursor.exhausted && targetBatches.length < maximumTargetBatches) {
        const targetBatch = enumerateNextWarmachineTargetBatch(state, targetCursor, {
          actorPieceKeys,
          includeActorlessActions: nextGroupIndex === 0,
          priorityTargetPieceKeys: requestedTargetPieceKeys,
          includeUntargetedActions: options.includeUntargetedActions !== false,
          actionFamilyKeys: requestedActionFamilyKeys,
          targetBatchSize: options.targetBatchSize,
          boostConfigurationKeys: requestedBoostConfigurationKeys,
          resourceAmountMode: requestedResourceAmountMode,
          resourceAmountValues: requestedResourceAmountValues,
          effectProfileMode: requestedEffectProfileMode,
          effectProfileKeys: requestedEffectProfileKeys,
          attackSequenceKeys: requestedAttackSequenceKeys,
          movementPathKindKeys: requestedMovementPathKindKeys,
        });
        targetBatches.push(targetBatch);
        targetCursor = targetBatch.cursor;
        targetsRemaining = targetBatch.remainingTargetCount;
        remainingPotentialTargetPieceKeys = targetBatch.remainingTargetPieceKeys;
      }
      enumeration = mergeTargetEnumerations(targetBatches);
      if (enumeration) {
        enumeration.targetCursor = targetCursor;
        enumeration.targetsRemaining = targetsRemaining;
        enumeration.remainingTargetPieceKeys = remainingPotentialTargetPieceKeys;
        enumeration.targetCursorExhausted = targetCursor?.exhausted === true;
      }
    } else {
      enumeration = enumerateRulesV1Actions(state, fullPhaseEnumeration ? {} : {
        actorPieceKeys,
        includeActorlessActions: nextGroupIndex === 0,
        targetPieceKeys: requestedTargetPieceKeys,
        includeUntargetedActions: options.includeUntargetedActions !== false,
        actionFamilyKeys: requestedActionFamilyKeys,
        boostConfigurationKeys: requestedBoostConfigurationKeys,
        resourceAmountMode: requestedResourceAmountMode,
        resourceAmountValues: requestedResourceAmountValues,
        effectProfileMode: requestedEffectProfileMode,
        effectProfileKeys: requestedEffectProfileKeys,
        attackSequenceKeys: requestedAttackSequenceKeys,
        movementPathKindKeys: requestedMovementPathKindKeys,
      });
    }
    const cacheLimit = Math.max(0, Math.floor(Number(options.enumerationCacheLimit) || 0));
    if (enumerationCache && (!cacheLimit || enumerationCache.size < cacheLimit)) enumerationCache.set(cacheKey, enumeration);
  }
  const followingGroupIndex = nextGroupIndex + selectedGroups.length;
  const exhausted = followingGroupIndex >= plan.groups.length;
  return {
    schemaVersion: WARMACHINE_LAZY_ACTION_CURSOR_SCHEMA,
    plan,
    enumeration,
    selectedGroups,
    actorPieceKeys,
    enumerationCacheHit,
    cursor: { nextGroupIndex: followingGroupIndex, exhausted },
    exhausted,
    remainingGroupCount: Math.max(0, plan.groups.length - followingGroupIndex),
    targetScopeApplied: enumeration.targetScopeApplied === true,
    targetScopePieceKeys: enumeration.targetScopePieceKeys || [],
    actionFamilyScopeApplied: enumeration.actionFamilyScopeApplied === true,
    actionFamilyScopeKeys: enumeration.actionFamilyScopeKeys || [],
    remainingActionFamilyKeys: enumeration.remainingActionFamilyKeys || [],
    generatedMovementTargetCursorApplied: enumeration.generatedMovementTargetCursorApplied === true,
    generatedMovementTargetBatches,
    generatedMovementTargetCursor: generatedMovementTargetCursor || enumeration.generatedMovementTargetCursor || null,
    generatedMovementTargetsRemaining: generatedMovementTargetsRemaining || enumeration.generatedMovementTargetsRemaining || 0,
    generatedMovementTargetCursorExhausted: generatedMovementTargetCursor?.exhausted === true ||
      enumeration.generatedMovementTargetCursorExhausted === true,
    targetCursorApplied: enumeration.targetCursorApplied === true,
    targetBatches,
    targetCursor: targetCursor || enumeration.targetCursor || null,
    targetsRemaining: targetsRemaining || enumeration.targetsRemaining || 0,
    targetCursorExhausted: targetCursor?.exhausted === true || enumeration.targetCursorExhausted === true,
    remainingPotentialTargetPieceKeys: targetBatches.length
      ? remainingPotentialTargetPieceKeys
      : enumeration.remainingTargetPieceKeys || remainingPotentialTargetPieceKeys,
    remainingPotentialTargetPieceCount: targetBatches.length
      ? remainingPotentialTargetPieceKeys.length
      : (enumeration.remainingTargetPieceKeys || remainingPotentialTargetPieceKeys).length,
    boostConfigurationScopeApplied: enumeration.boostConfigurationScopeApplied === true,
    boostConfigurationKeys: enumeration.boostConfigurationKeys || [],
    remainingBoostConfigurationKeys: enumeration.remainingBoostConfigurationKeys || [],
    resourceAmountScopeApplied: enumeration.resourceAmountScopeApplied === true,
    resourceAmountMode: enumeration.resourceAmountMode || "",
    resourceAmountValues: enumeration.resourceAmountValues || [],
    effectProfileScopeApplied: enumeration.effectProfileScopeApplied === true,
    effectProfileMode: enumeration.effectProfileMode || "",
    effectProfileKeys: enumeration.effectProfileKeys || [],
    attackSequenceScopeApplied: enumeration.attackSequenceScopeApplied === true,
    attackSequenceKeys: enumeration.attackSequenceKeys || [],
    remainingAttackSequenceKeys: enumeration.remainingAttackSequenceKeys || [],
    movementPathKindScopeApplied: enumeration.movementPathKindScopeApplied === true,
    movementPathKindKeys: enumeration.movementPathKindKeys || [],
    remainingMovementPathKindKeys: enumeration.remainingMovementPathKindKeys || [],
    claimBoundary: exhausted
      ? "all activation-group batches were enumerated"
      : "unseen activation groups remain legal-space unknowns and must stay unresolved",
  };
}

export function exhaustWarmachineLazyActionCursor(inputState = {}, options = {}) {
  let cursor = { nextGroupIndex: 0, exhausted: false };
  const batches = [];
  const actions = new Map();
  const rejectedActions = new Map();
  do {
    const batch = enumerateNextWarmachineLazyActionBatch(inputState, cursor, options);
    batches.push(batch);
    for (const candidate of batch.enumeration?.actions || []) actions.set(candidate.actionKey, candidate);
    for (const candidate of batch.enumeration?.rejectedActions || []) {
      const key = `${candidate.actionKey}:${JSON.stringify(candidate.rejection?.issues || {})}`;
      rejectedActions.set(key, candidate);
    }
    cursor = batch.cursor;
  } while (!cursor.exhausted);
  return {
    schemaVersion: WARMACHINE_LAZY_ACTION_CURSOR_SCHEMA,
    plan: batches[0]?.plan || buildWarmachineLazyActionCursorPlan(inputState, options),
    batches,
    actionCount: actions.size,
    actions: Array.from(actions.values()).sort((left, right) => left.actionKey.localeCompare(right.actionKey)),
    rejectedActionCount: rejectedActions.size,
    rejectedActions: Array.from(rejectedActions.values()),
    exhausted: true,
  };
}
