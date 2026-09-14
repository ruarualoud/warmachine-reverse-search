import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { evaluateWarmachineInitialStateAdversarialValuesV2 } from
  "../matchup/initial-state-adversarial-value-v2.mjs";
import { warmachineRuleBehaviorStateHashV1 } from
  "../state/semantic-hash-v1.mjs";
import {
  applyRulesV1Action,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import {
  buildWarmachineCurrentDecisionWindowDomainFromHostEnumerationV1,
} from "./current-decision-window-domain-v1.mjs";

export const WARMACHINE_KNOWN_ROUTE_ADVERSARIAL_COUNTEREXAMPLE_V1_SCHEMA =
  "warmachine_known_route_adversarial_counterexample_v1";
export const WARMACHINE_KNOWN_ROUTE_LOCAL_VALUE_V1_SCHEMA =
  "warmachine_known_route_local_value_v1";

const CURRENT_HOST_TIMING_BRIDGE_ACTION_TYPES = new Set([
  "end_control_allocation",
  "end_control_upkeep",
  "end_control_threshold",
]);

function array(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueSorted(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function requireText(value, reason) {
  const text = String(value || "");
  if (!text) throw new Error(reason);
  return text;
}

function sealedRouteUnit(raw = {}) {
  const fixtureHash = requireText(
    raw.fixtureHash,
    "known_route_counterexample_fixture_hash_required",
  );
  const core = { ...raw };
  delete core.fixtureHash;
  if (stableGraphHash(core) !== fixtureHash) {
    throw new Error("known_route_counterexample_fixture_hash_invalid");
  }
  if (!raw.replayMaterial?.openingState ||
      !array(raw.replayMaterial?.receipts).length) {
    throw new Error("known_route_counterexample_replay_material_required");
  }
  return raw;
}

function taskContract(raw = {}, routeUnit = {}) {
  const horizonKind = requireText(
    raw.horizonKind,
    "known_route_counterexample_horizon_kind_required",
  );
  const horizonRound = Number(raw.horizonRound);
  if (!Number.isInteger(horizonRound) || horizonRound < 1) {
    throw new Error("known_route_counterexample_horizon_round_invalid");
  }
  const futureChanceVisible = raw.futureChanceVisible === true;
  if (futureChanceVisible) {
    throw new Error("known_route_counterexample_future_chance_visibility_forbidden");
  }
  return stableGraphValue({
    taskKey: requireText(raw.taskKey,
      "known_route_counterexample_task_key_required"),
    querySideKey: requireText(raw.querySideKey || routeUnit.winnerSideKey,
      "known_route_counterexample_query_side_required"),
    goalKey: requireText(raw.goalKey,
      "known_route_counterexample_goal_key_required"),
    goalKind: String(raw.goalKind || "route_terminal_goal"),
    terminalFamilyKey: String(
      raw.terminalFamilyKey || routeUnit.terminalFamilyKey || "",
    ),
    terminalSourceKey: String(
      raw.terminalSourceKey || routeUnit.terminalSourceKey || "",
    ),
    horizonKind,
    horizonRound,
    informationContractKey: requireText(
      raw.informationContractKey,
      "known_route_counterexample_information_contract_required",
    ),
    futureChanceVisible,
    observationBoundary:
      String(raw.observationBoundary || "host_state_before_each_decision"),
  });
}

function replayBoundary(routeUnit = {}, rawOptions = {}, receipts = []) {
  if (rawOptions.settlementTransitionIndex === undefined) {
    return {
      state: normalizeRulesV1State(routeUnit.replayMaterial.openingState),
      startStepIndex: 0,
      boundaryKind: "route_opening",
      fullOpeningPrefixIncluded: true,
      sourceSettlementTransitionIndex: null,
    };
  }
  const settlementTransitionIndex = Number(
    rawOptions.settlementTransitionIndex,
  );
  const settlement = array(
    routeUnit.replayMaterial.settlementTransitions,
  )[settlementTransitionIndex];
  if (!Number.isInteger(settlementTransitionIndex) ||
      settlementTransitionIndex < 0 || !settlement?.successorState) {
    throw new Error("known_route_counterexample_settlement_boundary_invalid");
  }
  const startStepIndex = Number(rawOptions.startStepIndex);
  if (!Number.isInteger(startStepIndex) || startStepIndex < 0 ||
      startStepIndex >= receipts.length) {
    throw new Error("known_route_counterexample_start_step_invalid");
  }
  const state = normalizeRulesV1State(settlement.successorState);
  const firstSaved = receipts[startStepIndex] || {};
  if (Number(firstSaved.turnNumberBefore) !== Number(state.turnNumber) ||
      String(firstSaved.activeSideKeyBefore || "") !==
        String(state.activeSideKey || "") ||
      String(firstSaved.phaseKeyBefore || "") !== String(state.phaseKey || "")) {
    throw new Error("known_route_counterexample_settlement_step_mismatch");
  }
  return {
    state,
    startStepIndex,
    boundaryKind: "sealed_historical_settlement_successor",
    fullOpeningPrefixIncluded: false,
    sourceSettlementTransitionIndex: settlementTransitionIndex,
  };
}

function terminalEvents(events = []) {
  return array(events).filter((event) => event.eventType === "terminal")
    .map((event) => stableGraphValue({
      eventType: "terminal",
      winnerSideKey: String(event.winnerSideKey || ""),
      reason: String(event.reason || ""),
      marker: String(event.marker || ""),
    }));
}

function branchGoalReached(steps = [], contract = {}) {
  return steps.some((step) => array(step.terminalEvents).some((event) =>
    event.winnerSideKey === contract.querySideKey));
}

function compactStep({
  stepIndex,
  state,
  enumeration,
  action = null,
  transition = null,
  selectionKind,
  missingReason = "",
  bridgeOrdinal = null,
  savedStepActionKey = "",
}) {
  const missingCandidateActions = missingReason
    ? array(enumeration?.actions).map((candidate) => stableGraphValue({
      actionKey: String(candidate.actionKey || ""),
      actionType: String(candidate.actionType || ""),
      actorPieceKey: String(candidate.actorPieceKey || ""),
      targetPieceKey: String(candidate.targetPieceKey || ""),
      controlPhaseEndAmbushWindowOpen:
        candidate.metadata?.controlPhaseEndAmbushWindowOpen === true,
      controlPhaseEndAmbushWindowClose:
        candidate.metadata?.controlPhaseEndAmbushWindowClose === true,
    }))
    : [];
  const core = stableGraphValue({
    stepIndex,
    selectionKind,
    bridgeOrdinal,
    savedStepActionKey,
    stateKeyBefore: String(
      enumeration?.state?.stateKey || state?.stateKey || "",
    ),
    decisionOwnerSideKey: String(enumeration?.decisionSideKey || ""),
    acceptedActionCount: Number(enumeration?.actionCount ||
      array(enumeration?.actions).length),
    rejectedActionCount: Number(enumeration?.rejectedActionCount ||
      array(enumeration?.rejectedActions).length),
    actionKey: String(action?.actionKey || ""),
    actionType: String(action?.actionType || ""),
    actorPieceKey: String(action?.actorPieceKey || ""),
    targetPieceKey: String(action?.targetPieceKey || ""),
    transitionAccepted: transition?.ok === true,
    reason: String(missingReason || transition?.reason || ""),
    missingCandidateActions,
    terminalEvents: terminalEvents(transition?.events),
    eventTypes: array(transition?.events).map((event) =>
      String(event.eventType || "")),
    stateKeyAfter: transition?.ok === true
      ? String(transition.nextState?.stateKey || "")
      : "",
  });
  return { ...core, stepReceiptHash: stableGraphHash(core) };
}

function currentHostTimingBridgeAction(enumeration = {}) {
  const accepted = array(enumeration.actions);
  if (accepted.length !== 1) return null;
  return CURRENT_HOST_TIMING_BRIDGE_ACTION_TYPES.has(accepted[0].actionType)
    ? accepted[0]
    : null;
}

function currentHostAmbushEndWindowAction(
  enumeration = {},
  saved = {},
  windowStep = "open",
) {
  if (saved.actionType !== "end_control_phase") return null;
  const metadataKey = windowStep === "close"
    ? "controlPhaseEndAmbushWindowClose"
    : "controlPhaseEndAmbushWindowOpen";
  const activeSideKey = String(enumeration.state?.activeSideKey || "");
  const expectedActionKey = activeSideKey
    ? `control:${windowStep}-ambush-end-window:${activeSideKey}:v1`
    : "";
  const sameTypeCandidates = array(enumeration.actions).filter((candidate) =>
    candidate.actionType === "end_control_phase");
  const taggedCandidates = sameTypeCandidates.filter((candidate) =>
    candidate.metadata?.[metadataKey] === true ||
    candidate.actionKey === expectedActionKey);
  if (taggedCandidates.length === 1) return taggedCandidates[0];
  return sameTypeCandidates.length === 1 ? sameTypeCandidates[0] : null;
}

function currentHostControlPhaseNoOpBridgeAction(
  enumeration = {},
  saved = {},
) {
  if (saved.actionType !== "end_control_phase") return null;
  if (enumeration.state?.phaseKey !== "control" ||
      enumeration.state?.controlPhaseStepKey !== "control_remaining") {
    return null;
  }
  return array(enumeration.actions)
    .filter((candidate) =>
      candidate.actionType ===
        "rule_atom_control_phase_apparition_placement" &&
      candidate.metadata?.mandatoryControlPhase === true &&
      candidate.metadata?.apparitionPlacementKey === "current-location")
    .sort((left, right) =>
      String(left.actorPieceKey || "").localeCompare(
        String(right.actorPieceKey || ""),
      ) || String(left.actionKey || "").localeCompare(
        String(right.actionKey || ""),
      ))[0] || null;
}

function selectedOriginalAction(enumeration = {}, saved = {}) {
  return array(enumeration.actions).find((action) =>
    action.actionKey === saved.actionKey) || null;
}

function selectedAlternateAction(enumeration = {}, selector = {}) {
  return array(enumeration.actions).find((action) =>
    (!selector.actionKey || action.actionKey === selector.actionKey) &&
    (!selector.actionType || action.actionType === selector.actionType) &&
    (!selector.actorPieceKey ||
      action.actorPieceKey === selector.actorPieceKey) &&
    (!selector.targetPieceKey ||
      action.targetPieceKey === selector.targetPieceKey)) || null;
}

function strictAction(action = {}, patch = {}, enumeration = {}) {
  if (patch.actionKey && patch.actionKey !== action.actionKey) {
    throw new Error("known_route_counterexample_action_patch_key_mismatch");
  }
  return {
    ...action,
    ...patch,
    actionKey: action.actionKey,
    metadata: {
      ...(action.metadata || {}),
      ...(patch.metadata || {}),
    },
    __warmachineTrustedRulesV1Enumeration: enumeration,
  };
}

function focusedSavedEnumerationOptions(saved = {}) {
  const explicit = saved.enumerationOptions || {};
  if (Object.keys(explicit).length) return explicit;
  const actionType = String(saved.actionType || "");
  const actorPieceKey = String(saved.actorPieceKey || "");
  if (actionType === "allocate_resource") {
    return {
      actionFamilyKeys: ["resource", "timing"],
      actorPieceKeys: actorPieceKey ? [actorPieceKey] : [],
    };
  }
  if ([
    "end_maintenance_phase",
    "end_control_replenishment",
    "end_control_phase",
    "end_turn",
  ].includes(actionType)) {
    return {
      actionFamilyKeys: ["timing"],
      includeActorlessActions: true,
    };
  }
  return actorPieceKey ? { actorPieceKeys: [actorPieceKey] } : explicit;
}

function applySavedStep(stateInput, saved = {}, stepIndex, options = {}) {
  let state = normalizeRulesV1State(stateInput);
  const enumerationOptions = focusedSavedEnumerationOptions(saved);
  let enumeration = options.enumeration || enumerateRulesV1Actions(
    state,
    enumerationOptions,
  );
  let action = options.alternateSelector
    ? selectedAlternateAction(enumeration, options.alternateSelector)
    : selectedOriginalAction(enumeration, saved);
  const alignmentSteps = [];
  if (!action && !options.enumeration && !options.alternateSelector) {
    const openAmbushWindow = currentHostAmbushEndWindowAction(
      enumeration,
      saved,
      "open",
    );
    if (openAmbushWindow) {
      const openTransition = applyRulesV1Action(
        enumeration.state,
        strictAction(openAmbushWindow, {}, enumeration),
      );
      const openStep = compactStep({
        stepIndex,
        state,
        enumeration,
        action: openAmbushWindow,
        transition: openTransition,
        selectionKind: "current_host_timing_bridge",
        bridgeOrdinal: 0,
        savedStepActionKey: String(saved.actionKey || ""),
      });
      if (openTransition.ok !== true) {
        return {
          ok: false,
          nextState: null,
          step: openStep,
          alignmentSteps,
        };
      }
      alignmentSteps.push(openStep);
      state = openTransition.nextState;
      enumeration = enumerateRulesV1Actions(state, enumerationOptions);
      const declineAmbush = currentHostAmbushEndWindowAction(
        enumeration,
        saved,
        "close",
      );
      if (declineAmbush) {
        const declineTransition = applyRulesV1Action(
          enumeration.state,
          strictAction(declineAmbush, {}, enumeration),
        );
        return {
          ok: declineTransition.ok === true,
          nextState: declineTransition.ok === true
            ? normalizeRulesV1State(declineTransition.nextState)
            : null,
          action: declineAmbush,
          transition: declineTransition,
          alignmentSteps,
          step: compactStep({
            stepIndex,
            state,
            enumeration,
            action: declineAmbush,
            transition: declineTransition,
            selectionKind: "saved_route_optional_window_decline",
            savedStepActionKey: String(saved.actionKey || ""),
          }),
        };
      }
    }
  }
  if (!options.enumeration && !options.alternateSelector) {
    for (let bridgeOrdinal = 0; !action && bridgeOrdinal < 8;
      bridgeOrdinal += 1) {
      const bridgeAction = currentHostTimingBridgeAction(enumeration);
      if (!bridgeAction) break;
      const bridgeTransition = applyRulesV1Action(
        enumeration.state,
        strictAction(bridgeAction, {}, enumeration),
      );
      const bridgeStep = compactStep({
        stepIndex,
        state,
        enumeration,
        action: bridgeAction,
        transition: bridgeTransition,
        selectionKind: "current_host_timing_bridge",
        bridgeOrdinal,
        savedStepActionKey: String(saved.actionKey || ""),
      });
      if (bridgeTransition.ok !== true) {
        return {
          ok: false,
          nextState: null,
          step: bridgeStep,
          alignmentSteps,
        };
      }
      alignmentSteps.push(bridgeStep);
      state = bridgeTransition.nextState;
      enumeration = enumerateRulesV1Actions(state, enumerationOptions);
      action = selectedOriginalAction(enumeration, saved);
    }
  }
  if (!action && !options.enumeration && !options.alternateSelector) {
    for (let bridgeOrdinal = alignmentSteps.length;
      !action && bridgeOrdinal < 128; bridgeOrdinal += 1) {
      const bridgeAction = currentHostControlPhaseNoOpBridgeAction(
        enumeration,
        saved,
      );
      if (!bridgeAction) break;
      const bridgeTransition = applyRulesV1Action(
        enumeration.state,
        strictAction(bridgeAction, {}, enumeration),
      );
      const bridgeStep = compactStep({
        stepIndex,
        state,
        enumeration,
        action: bridgeAction,
        transition: bridgeTransition,
        selectionKind: "current_host_timing_bridge",
        bridgeOrdinal,
        savedStepActionKey: String(saved.actionKey || ""),
      });
      if (bridgeTransition.ok !== true) {
        return {
          ok: false,
          nextState: null,
          step: bridgeStep,
          alignmentSteps,
        };
      }
      alignmentSteps.push(bridgeStep);
      state = bridgeTransition.nextState;
      enumeration = enumerateRulesV1Actions(state, enumerationOptions);
      action = selectedOriginalAction(enumeration, saved);
    }
  }
  if (!action && alignmentSteps.length &&
      !options.enumeration && !options.alternateSelector) {
    const alignedResult = applySavedStep(state, saved, stepIndex);
    return {
      ...alignedResult,
      alignmentSteps: [
        ...alignmentSteps,
        ...alignedResult.alignmentSteps,
      ],
    };
  }
  let selectedEnumeration = enumeration;
  if (!action && !options.enumeration &&
      Object.keys(saved.enumerationOptions || {}).length === 0 &&
      Object.keys(enumerationOptions).length > 0) {
    selectedEnumeration = enumerateRulesV1Actions(
      state,
      saved.enumerationOptions || {},
    );
    action = options.alternateSelector
      ? selectedAlternateAction(selectedEnumeration, options.alternateSelector)
      : selectedOriginalAction(selectedEnumeration, saved);
  }
  if (!action) {
    return {
      ok: false,
      nextState: null,
      step: compactStep({
        stepIndex,
        state,
        enumeration: selectedEnumeration,
        action: null,
        transition: null,
        selectionKind: options.alternateSelector
          ? "opponent_counterresponse"
          : "saved_cooperative_route",
        missingReason: options.alternateSelector
          ? "alternate_action_not_in_current_host_enumeration"
          : "saved_action_not_in_current_host_enumeration",
      }),
      alignmentSteps,
    };
  }
  const patch = options.alternateSelector
    ? stableGraphValue(options.actionPatch || {})
    : stableGraphValue(saved.persistedAction || {});
  const transition = applyRulesV1Action(
    selectedEnumeration.state,
    strictAction(action, patch, selectedEnumeration),
  );
  return {
    ok: transition.ok === true,
    nextState: transition.ok === true
      ? normalizeRulesV1State(transition.nextState)
      : null,
    action,
    transition,
    alignmentSteps,
    step: compactStep({
      stepIndex,
      state,
      enumeration: selectedEnumeration,
      action,
      transition,
      selectionKind: options.alternateSelector
        ? "opponent_counterresponse"
        : "saved_cooperative_route",
    }),
  };
}

function replaySavedSuffix(
  stateInput,
  receipts = [],
  startIndex = 0,
  onProgress = null,
  branchKey = "saved_route",
) {
  let state = normalizeRulesV1State(stateInput);
  const steps = [];
  for (let stepIndex = startIndex; stepIndex < receipts.length; stepIndex += 1) {
    const result = applySavedStep(state, receipts[stepIndex], stepIndex);
    steps.push(...result.alignmentSteps, result.step);
    onProgress?.({
      stage: "route_branch_step_complete",
      branchKey,
      stepIndex,
      totalStepCount: receipts.length,
      transitionAccepted: result.ok,
      reason: result.step.reason,
      insertedTimingBridgeCount: result.alignmentSteps.length,
    });
    if (!result.ok) {
      return {
        completed: false,
        blockedAtStepIndex: stepIndex,
        blockReason: result.step.reason,
        state,
        steps,
      };
    }
    state = result.nextState;
  }
  return {
    completed: true,
    blockedAtStepIndex: null,
    blockReason: "",
    state,
    steps,
  };
}

function compactBranch(branch = {}, contract = {}) {
  const goalReached = branchGoalReached(branch.steps, contract);
  const core = stableGraphValue({
    completed: branch.completed === true,
    goalReached,
    blockedAtStepIndex: branch.blockedAtStepIndex,
    blockReason: String(branch.blockReason || ""),
    stepCount: array(branch.steps).length,
    insertedTimingBridgeCount: array(branch.steps).filter((step) =>
      step.selectionKind === "current_host_timing_bridge").length,
    steps: stableGraphValue(branch.steps || []),
    finalStateHash: branch.state
      ? warmachineRuleBehaviorStateHashV1(branch.state)
      : "",
  });
  return { ...core, branchReceiptHash: stableGraphHash(core) };
}

export function replayWarmachineKnownRouteAdversarialCounterexampleV1(
  routeUnitInput = {},
  rawOptions = {},
) {
  const routeUnit = sealedRouteUnit(routeUnitInput);
  const contract = taskContract(rawOptions.taskContract || {}, routeUnit);
  const onProgress = typeof rawOptions.onProgress === "function"
    ? rawOptions.onProgress
    : null;
  const receipts = routeUnit.replayMaterial.receipts;
  const boundary = replayBoundary(routeUnit, rawOptions, receipts);
  const deviationStepIndex = Number(rawOptions.deviationStepIndex);
  if (!Number.isInteger(deviationStepIndex) || deviationStepIndex < 0 ||
      deviationStepIndex >= receipts.length ||
      deviationStepIndex < boundary.startStepIndex) {
    throw new Error("known_route_counterexample_deviation_step_invalid");
  }
  const savedDeviation = receipts[deviationStepIndex];
  const alternateSelector = stableGraphValue({
    ...(rawOptions.alternateSelector || {}),
  });
  if (!alternateSelector.actionKey && !alternateSelector.actionType) {
    throw new Error("known_route_counterexample_alternate_selector_required");
  }

  let prefixState = boundary.state;
  const prefixSteps = [];
  let prefixFailure = null;
  for (let stepIndex = boundary.startStepIndex;
    stepIndex < deviationStepIndex;
    stepIndex += 1) {
    const result = applySavedStep(prefixState, receipts[stepIndex], stepIndex);
    prefixSteps.push(...result.alignmentSteps, result.step);
    onProgress?.({
      stage: "shared_prefix_step_complete",
      stepIndex,
      totalStepCount: receipts.length,
      deviationStepIndex,
      transitionAccepted: result.ok,
      reason: result.step.reason,
      insertedTimingBridgeCount: result.alignmentSteps.length,
    });
    if (!result.ok) {
      prefixFailure = result.step;
      break;
    }
    prefixState = result.nextState;
  }

  let currentWindow = null;
  let originalBranch = null;
  let counterBranch = null;
  let counterDecisionOwnerSideKey = "";
  let selectedCounterActionKey = "";
  if (!prefixFailure) {
    onProgress?.({
      stage: "deviation_window_enumeration_start",
      deviationStepIndex,
    });
    const fullEnumeration = enumerateRulesV1Actions(
      prefixState,
      focusedSavedEnumerationOptions(savedDeviation),
    );
    onProgress?.({
      stage: "deviation_host_enumeration_complete",
      deviationStepIndex,
      decisionOwnerSideKey: String(fullEnumeration.decisionSideKey || ""),
      acceptedActionCount: Number(fullEnumeration.actionCount || 0),
      rejectedActionCount: Number(fullEnumeration.rejectedActionCount || 0),
      actorScopeApplied: fullEnumeration.actorScopeApplied === true,
      actionFamilyScopeApplied:
        fullEnumeration.actionFamilyScopeApplied === true,
    });
    currentWindow =
      buildWarmachineCurrentDecisionWindowDomainFromHostEnumerationV1(
        prefixState,
        fullEnumeration,
        { enumeratedInputStateReference: prefixState },
      );
    rawOptions.onDeviationWindowMaterialized?.({
      inputState: prefixState,
      enumeration: fullEnumeration,
      currentWindow,
    });
    onProgress?.({
      stage: "deviation_window_projection_complete",
      deviationStepIndex,
      decisionOwnerSideKey: String(fullEnumeration.decisionSideKey || ""),
      acceptedActionCount: Number(fullEnumeration.actionCount || 0),
      rejectedActionCount: Number(fullEnumeration.rejectedActionCount || 0),
      currentDecisionWindowDomainHash:
        currentWindow.currentDecisionWindowDomainHash,
    });
    counterDecisionOwnerSideKey = String(fullEnumeration.decisionSideKey || "");
    const originalFirst = applySavedStep(
      prefixState,
      savedDeviation,
      deviationStepIndex,
      { enumeration: fullEnumeration },
    );
    onProgress?.({
      stage: "route_branch_step_complete",
      branchKey: "cooperative_route",
      stepIndex: deviationStepIndex,
      totalStepCount: receipts.length,
      transitionAccepted: originalFirst.ok,
      reason: originalFirst.step.reason,
      insertedTimingBridgeCount: originalFirst.alignmentSteps.length,
    });
    if (originalFirst.ok) {
      const suffix = replaySavedSuffix(
        originalFirst.nextState,
        receipts,
        deviationStepIndex + 1,
        onProgress,
        "cooperative_route",
      );
      originalBranch = {
        ...suffix,
        steps: [
          ...originalFirst.alignmentSteps,
          originalFirst.step,
          ...suffix.steps,
        ],
      };
    } else {
      originalBranch = {
        completed: false,
        blockedAtStepIndex: deviationStepIndex,
        blockReason: originalFirst.step.reason,
        state: prefixState,
        steps: [...originalFirst.alignmentSteps, originalFirst.step],
      };
    }
    if (originalBranch.completed &&
        branchGoalReached(originalBranch.steps, contract)) {
      const counterFirst = applySavedStep(
        prefixState,
        savedDeviation,
        deviationStepIndex,
        {
          enumeration: fullEnumeration,
          alternateSelector,
          actionPatch: rawOptions.alternateActionPatch || {},
        },
      );
      onProgress?.({
        stage: "counterresponse_step_complete",
        branchKey: "opponent_counterresponse",
        stepIndex: deviationStepIndex,
        totalStepCount: receipts.length,
        transitionAccepted: counterFirst.ok,
        reason: counterFirst.step.reason,
      });
      selectedCounterActionKey = String(counterFirst.action?.actionKey || "");
      if (counterFirst.ok) {
        const suffix = replaySavedSuffix(
          counterFirst.nextState,
          receipts,
          deviationStepIndex + 1,
          onProgress,
          "opponent_counterresponse",
        );
        counterBranch = {
          ...suffix,
          steps: [
            ...counterFirst.alignmentSteps,
            counterFirst.step,
            ...suffix.steps,
          ],
        };
      } else {
        counterBranch = {
          completed: false,
          blockedAtStepIndex: deviationStepIndex,
          blockReason: counterFirst.step.reason,
          state: prefixState,
          steps: [...counterFirst.alignmentSteps, counterFirst.step],
        };
      }
    } else {
      counterBranch = {
        completed: false,
        blockedAtStepIndex: deviationStepIndex,
        blockReason: "cooperative_route_not_current_host_replayed",
        state: prefixState,
        steps: [],
      };
    }
  }

  const compactOriginal = compactBranch(originalBranch || {
    completed: false,
    blockedAtStepIndex: prefixFailure?.stepIndex ?? null,
    blockReason: prefixFailure?.reason || "shared_prefix_not_current_host_replayable",
    state: prefixState,
    steps: [],
  }, contract);
  const compactCounter = compactBranch(counterBranch || {
    completed: false,
    blockedAtStepIndex: prefixFailure?.stepIndex ?? null,
    blockReason: prefixFailure?.reason || "shared_prefix_not_current_host_replayable",
    state: prefixState,
    steps: [],
  }, contract);
  const originalActionKey = String(savedDeviation.actionKey || "");
  const counterActionStep = compactCounter.steps.find((step) =>
    step.selectionKind === "opponent_counterresponse");
  const counterActionAccepted = Boolean(
    counterActionStep?.transitionAccepted && selectedCounterActionKey,
  );
  const responseOwnedByOpponent = Boolean(
    counterDecisionOwnerSideKey &&
    counterDecisionOwnerSideKey !== contract.querySideKey,
  );
  const distinctCounterAction = Boolean(
    selectedCounterActionKey && selectedCounterActionKey !== originalActionKey,
  );
  const currentHostConditionalCooperativeSuffixExists = Boolean(
    !prefixFailure && compactOriginal.completed && compactOriginal.goalReached,
  );
  const currentHostCooperativeRouteExists = Boolean(
    boundary.fullOpeningPrefixIncluded &&
    currentHostConditionalCooperativeSuffixExists,
  );
  const counterBlocksFixedRoute = Boolean(
    counterActionAccepted && !compactCounter.goalReached &&
    (!compactCounter.completed || compactCounter.goalReached === false),
  );
  const knownCounterexampleStrict = Boolean(
    currentHostConditionalCooperativeSuffixExists && responseOwnedByOpponent &&
    distinctCounterAction && counterBlocksFixedRoute,
  );
  const authority = currentWindow?.authority || {};
  const openingStateHash = warmachineRuleBehaviorStateHashV1(
    routeUnit.replayMaterial.openingState,
  );
  const historicalOpeningHostMatchesCurrent =
    String(routeUnit.hostReceiptHash || "") ===
      String(warmachineHost.receipt?.receiptHash || "");
  const openingEvidenceCore = stableGraphValue({
    openingStateHash,
    routeFixtureHash: routeUnit.fixtureHash,
    historicalStrictOpeningEvidenceHash:
      String(routeUnit.strictOpeningEvidenceHash || ""),
    historicalRouteHostReceiptHash: String(routeUnit.hostReceiptHash || ""),
    currentHostReceiptHash: String(warmachineHost.receipt?.receiptHash || ""),
    historicalOpeningHostMatchesCurrent,
    currentOpeningDeploymentRecertified: false,
  });
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_KNOWN_ROUTE_ADVERSARIAL_COUNTEREXAMPLE_V1_SCHEMA,
    taskContract: contract,
    routeIdentity: {
      routeKey: String(routeUnit.routeKey || ""),
      routeId: String(routeUnit.routeId || ""),
      routeFixtureHash: routeUnit.fixtureHash,
      terminalFamilyKey: String(routeUnit.terminalFamilyKey || ""),
      terminalSourceKey: String(routeUnit.terminalSourceKey || ""),
      winnerSideKey: String(routeUnit.winnerSideKey || ""),
    },
    currentHostReceiptHash: String(warmachineHost.receipt?.receiptHash || ""),
    currentHostAuthority: stableGraphValue({
      authorityReceiptHash: String(authority.authorityReceiptHash || ""),
      globalStrictReady: authority.globalStrictReady === true,
      strictExecutorReady: authority.strictExecutorReady === true,
      quarantineActive: authority.quarantineActive !== false,
    }),
    openingEvidence: {
      ...openingEvidenceCore,
      openingReplayEvidenceHash: stableGraphHash(openingEvidenceCore),
    },
    replayBoundary: {
      boundaryKind: boundary.boundaryKind,
      startStepIndex: boundary.startStepIndex,
      boundaryStateHash: warmachineRuleBehaviorStateHashV1(boundary.state),
      fullOpeningPrefixIncluded: boundary.fullOpeningPrefixIncluded,
      sourceSettlementTransitionIndex:
        boundary.sourceSettlementTransitionIndex,
      currentReachabilityFromOpeningCertified: false,
    },
    deviation: {
      stepIndex: deviationStepIndex,
      currentDecisionWindowDomainHash:
        String(currentWindow?.currentDecisionWindowDomainHash || ""),
      decisionOwnerSideKey: counterDecisionOwnerSideKey,
      originalActionKey,
      selectedCounterActionKey,
      responseOwnedByOpponent,
      distinctCounterAction,
    },
    sharedPrefix: {
      completed: prefixFailure === null,
      stepCount: prefixSteps.length,
      insertedTimingBridgeCount: prefixSteps.filter((step) =>
        step.selectionKind === "current_host_timing_bridge").length,
      failure: prefixFailure,
      stepReceiptHashes: prefixSteps.map((step) => step.stepReceiptHash),
      prefixReceiptHash: stableGraphHash(stableGraphValue(prefixSteps)),
    },
    cooperativeRoute: compactOriginal,
    counterresponseRoute: compactCounter,
    currentHostConditionalCooperativeSuffixExists,
    currentHostCooperativeRouteExists,
    counterActionAccepted,
    counterBlocksFixedRoute,
    knownCounterexampleStrict,
    cooperativeRouteProbability: null,
    adaptivePolicyValueProven: false,
    currentOpeningDeploymentRecertified: false,
    strategyValuePublicationAllowed: false,
    unresolvedReasons: uniqueSorted([
      ...(!historicalOpeningHostMatchesCurrent
        ? ["historical_opening_host_receipt_stale"]
        : []),
      "current_opening_deployment_not_recertified",
      ...(!currentHostCooperativeRouteExists
        ? ["cooperative_route_not_current_host_replayed"]
        : []),
      ...(!boundary.fullOpeningPrefixIncluded
        ? ["opening_to_conditional_boundary_not_current_host_replayed"]
        : []),
      ...(!knownCounterexampleStrict
        ? ["known_opponent_counterexample_not_strict"]
        : []),
      "candidate_domain_incomplete",
      "opponent_response_domain_incomplete",
      "chance_domain_incomplete",
      "adaptive_continuation_domain_incomplete",
    ]),
    claimBoundary:
      "The current Host replays one saved cooperative route suffix and one legal opponent deviation from a single shared prefix. A sealed historical settlement boundary may shorten this replay, but then opening-to-boundary reachability remains explicitly uncertified. A deviation that makes the saved suffix fail is a counterexample to that fixed cooperative script only, not proof that every adaptive policy loses.",
  });
  onProgress?.({
    stage: "known_route_counterexample_complete",
    currentHostCooperativeRouteExists,
    counterBlocksFixedRoute,
    knownCounterexampleStrict,
  });
  return {
    ...core,
    counterexampleReceiptHash: stableGraphHash(core),
    ok: knownCounterexampleStrict,
  };
}

function validateCounterexampleReceipt(raw = {}) {
  const receiptHash = requireText(
    raw.counterexampleReceiptHash,
    "known_route_local_value_counterexample_hash_required",
  );
  const core = { ...raw };
  delete core.counterexampleReceiptHash;
  delete core.ok;
  if (stableGraphHash(core) !== receiptHash) {
    throw new Error("known_route_local_value_counterexample_hash_invalid");
  }
  return raw;
}

function exactFailureResponse(counterexample = {}) {
  return {
    responseKey: `known-counter-${counterexample.deviation.selectedCounterActionKey}`,
    chanceLedger: {
      successNumerator: 0,
      failureNumerator: 1,
      prunedNumerator: 0,
      unresolvedNumerator: 0,
      denominator: 1,
    },
    strictReplayComplete: counterexample.knownCounterexampleStrict === true,
    assumptionClosureComplete: counterexample.knownCounterexampleStrict === true,
    hostReceiptHash: counterexample.currentHostReceiptHash,
    evidence: {
      counterexampleReceiptHash: counterexample.counterexampleReceiptHash,
      currentDecisionWindowDomainHash:
        counterexample.deviation.currentDecisionWindowDomainHash,
      selectedCounterActionKey:
        counterexample.deviation.selectedCounterActionKey,
      cooperativeBranchReceiptHash:
        counterexample.cooperativeRoute.branchReceiptHash,
      counterresponseBranchReceiptHash:
        counterexample.counterresponseRoute.branchReceiptHash,
      fixedRouteFailureOnly: true,
    },
  };
}

function evaluateLocalValue(counterexample = {}, opponentResponses = []) {
  const opening = counterexample.openingEvidence;
  return evaluateWarmachineInitialStateAdversarialValuesV2({
    hostReceiptHash: counterexample.currentHostReceiptHash,
    subjectTaskSideKey: counterexample.taskContract.querySideKey,
    initialStates: [{
      initialStateKey:
        `route-opening-${counterexample.routeIdentity.routeFixtureHash}`,
      strictOpeningEvidence: {
        certified: opening.currentOpeningDeploymentRecertified === true,
        stateHash: opening.openingStateHash,
        evidenceHash: opening.openingReplayEvidenceHash,
        hostReceiptHash: counterexample.currentHostReceiptHash,
      },
      candidateSetComplete: false,
      policyCandidates: [{
        candidateKey:
          `fixed-cooperative-script:${counterexample.routeIdentity.routeKey}`,
        responseSetComplete: false,
        opponentResponses,
      }],
      address: {
        routeKey: counterexample.routeIdentity.routeKey,
        taskKey: counterexample.taskContract.taskKey,
        goalKey: counterexample.taskContract.goalKey,
      },
      routeLabels: [{
        routeKey: counterexample.routeIdentity.routeKey,
        terminalFamilyKey: counterexample.routeIdentity.terminalFamilyKey,
        terminalSourceKey: counterexample.routeIdentity.terminalSourceKey,
        currentHostCooperativeRouteExists:
          counterexample.currentHostCooperativeRouteExists,
      }],
    }],
  });
}

export function buildWarmachineKnownRouteLocalAdversarialValueV1(
  counterexampleInput = {},
) {
  const counterexample = validateCounterexampleReceipt(counterexampleInput);
  const before = evaluateLocalValue(counterexample, []);
  const after = evaluateLocalValue(
    counterexample,
    counterexample.knownCounterexampleStrict
      ? [exactFailureResponse(counterexample)]
      : [],
  );
  const beforeRow = before.rows[0];
  const afterRow = after.rows[0];
  const beforeCandidate = beforeRow.policyCandidates[0];
  const afterCandidate = afterRow.policyCandidates[0];
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_KNOWN_ROUTE_LOCAL_VALUE_V1_SCHEMA,
    taskContract: counterexample.taskContract,
    currentHostReceiptHash: counterexample.currentHostReceiptHash,
    counterexampleReceiptHash: counterexample.counterexampleReceiptHash,
    routeIdentity: counterexample.routeIdentity,
    routeExistence: {
      currentHostConditionalCooperativeSuffixExists:
        counterexample.currentHostConditionalCooperativeSuffixExists,
      currentHostCooperativeRouteExists:
        counterexample.currentHostCooperativeRouteExists,
      cooperativeRouteProbability: null,
      strictRouteBranchReceiptHash:
        counterexample.cooperativeRoute.branchReceiptHash,
    },
    knownOpponentCounterresponse: {
      strict: counterexample.knownCounterexampleStrict,
      actionKey: counterexample.deviation.selectedCounterActionKey,
      ownerSideKey: counterexample.deviation.decisionOwnerSideKey,
      blocksFixedCooperativeScript:
        counterexample.counterBlocksFixedRoute,
      branchReceiptHash:
        counterexample.counterresponseRoute.branchReceiptHash,
    },
    fixedRouteScriptValueBeforeKnownCounterresponse:
      beforeCandidate.strictValueInterval,
    fixedRouteScriptValueAfterKnownCounterresponse:
      afterCandidate.strictValueInterval,
    wholeGameValueAfterKnownCounterresponse:
      afterRow.strictGameValueInterval,
    routeUpperBoundTightenedByKnownCounterresponse: Boolean(
      beforeCandidate.strictValueInterval.upperBound >
        afterCandidate.strictValueInterval.upperBound,
    ),
    wholeGameStillOpenBecauseCandidateDomainIncomplete:
      afterRow.strictGameValueInterval.lowerBound === 0 &&
      afterRow.strictGameValueInterval.upperBound === 1,
    cooperativeRouteIsAdversarialGuarantee: false,
    currentReachabilityFromOpeningCertified:
      counterexample.replayBoundary.currentReachabilityFromOpeningCertified,
    adaptivePolicyValueProven: false,
    strategyValuePublicationAllowed: false,
    unresolvedReasons: uniqueSorted([
      ...counterexample.unresolvedReasons,
      ...afterRow.missingClosureKeys,
    ]),
    valueEvidence: {
      beforeValueSetHash: before.valueSetHash,
      afterValueSetHash: after.valueSetHash,
      beforeRowValueHash: beforeRow.valueHash,
      afterRowValueHash: afterRow.valueHash,
    },
    claimBoundary:
      "The strict counterresponse lowers the upper bound of one fixed cooperative script, while the whole-game interval remains [0,1] because other subject candidates, adaptive continuations, opponent responses, Chance and current opening certification are incomplete. Route existence and game value are deliberately separate.",
  });
  return {
    ...core,
    localValueReceiptHash: stableGraphHash(core),
    ok: counterexample.knownCounterexampleStrict === true,
  };
}
