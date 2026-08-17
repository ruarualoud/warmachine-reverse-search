import {
  applyRulesV1Action,
  buildWarmachineRulesV1ActionWithStrictRngOutcome,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  strictOpponentReactionRequirementsForAction,
  warmachineHost,
} from "../warmachine-host-runtime.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { buildWarmachineTerminalPredecessorAlgebraV2 } from "./predecessor-algebra-v2.mjs";
import { buildWarmachineMinimalTerminalProofV2 } from "./terminal-proof-v2.mjs";

export const WARMACHINE_STRICT_TERMINAL_ROUTE_WITNESS_V2_SCHEMA =
  "warmachine_strict_terminal_route_witness_v2";
export const WARMACHINE_EXECUTED_TERMINAL_ROUTE_WITNESS_V2_SCHEMA =
  "warmachine_executed_terminal_route_witness_v2";

function selectedAction(enumeration = {}, step = {}) {
  const actions = enumeration.actions || [];
  if (step.actionKey) {
    return actions.find((action) => action.actionKey === step.actionKey) || null;
  }
  return actions.find((action) =>
    (!step.actionType || action.actionType === step.actionType) &&
    (!step.actorPieceKey || action.actorPieceKey === step.actorPieceKey) &&
    (!step.targetPieceKey || action.targetPieceKey === step.targetPieceKey) &&
    (!step.targetElementKey || action.targetElementKey === step.targetElementKey)) || null;
}

function compactRejectedAction(action = {}) {
  const profile = action.metadata?.attackProfile || {};
  const unmodeledEffects = action.metadata?.attackResolution?.unmodeledSpecialRuleEffects || [];
  return stableGraphValue({
    actionKey: String(action.actionKey || ""),
    actionType: String(action.actionType || ""),
    actorPieceKey: String(action.actorPieceKey || ""),
    targetPieceKey: String(action.targetPieceKey || ""),
    profile: profileKey(profile) ? {
      profileKey: profileKey(profile),
      name: String(profile.name || ""),
      mode: String(profile.mode || ""),
      sourceCardId: String(profile.sourceCardId || ""),
      sourceCardName: String(profile.sourceCardName || ""),
      sourceWeaponId: String(profile.sourceWeaponId || ""),
    } : null,
    legality: action.legality || null,
    rejection: action.rejection || null,
    unmodeledSpecialRuleEffects: unmodeledEffects.map((effect) => ({
      ruleKey: String(effect.ruleKey || ""),
      ruleName: String(effect.ruleName || ""),
      implementationStatus: String(effect.implementationStatus || ""),
      message: String(effect.message || ""),
      combinationKey: String(effect.combinationKey || ""),
    })),
  });
}

function profileKey(profile = {}) {
  return String(profile.profileKey || profile.weaponKey || profile.spellKey || "");
}

function relevantRejectedActions(enumeration = {}, step = {}, maximum = 32) {
  return (enumeration.rejectedActions || []).filter((action) =>
    (!step.actionType || action.actionType === step.actionType) &&
    (!step.actorPieceKey || action.actorPieceKey === step.actorPieceKey) &&
    (!step.targetPieceKey || action.targetPieceKey === step.targetPieceKey) &&
    (!step.targetElementKey || action.targetElementKey === step.targetElementKey))
    .slice(0, maximum)
    .map(compactRejectedAction);
}

function materializeAction(action, state, enumeration, step, routeKey) {
  const explicitPatch = stableGraphValue(step.actionPatch || {});
  const explicitOutcome = explicitPatch.strictRollOutcome || explicitPatch.steamroller2026Decision ||
    explicitPatch.metadata?.strictRollOutcome || explicitPatch.metadata?.steamroller2026Decision;
  const baseAction = explicitOutcome || step.materializeStrictRng === false
    ? action
    : buildWarmachineRulesV1ActionWithStrictRngOutcome(action, {
      room: {
        id: routeKey,
        game: {
          round: state.turnNumber,
          turnNumber: state.turnNumber,
          activeSideKey: state.activeSideKey,
        },
      },
      sourceContext: {
        rulesV1State: state,
        rulesV1Enumeration: enumeration,
      },
      selectedActionKey: action.actionKey,
    });
  return {
    ...baseAction,
    ...explicitPatch,
    metadata: {
      ...(baseAction.metadata || {}),
      ...(explicitPatch.metadata || {}),
    },
    __warmachineTrustedRulesV1Enumeration: enumeration,
  };
}

export function replayWarmachineTerminalRouteStrictV2(
  initialStateInput = {},
  routeSteps = [],
  terminalSpecification = {},
  rawOptions = {},
) {
  const startedAtMs = performance.now();
  const progress = (stage, detail = {}) => rawOptions.onProgress?.({
    stage,
    elapsedMs: Math.round(performance.now() - startedAtMs),
    ...detail,
  });
  progress("strict_route_normalize_start");
  let state = normalizeRulesV1State(initialStateInput);
  progress("strict_route_normalize_complete");
  const routeKey = String(rawOptions.routeKey ||
    `strict-terminal-route-${stableGraphHash({ terminalSpecification, routeSteps }, 24)}`);
  const receipts = [];
  const allEvents = [];
  let rejected = null;

  for (const [stepIndex, step] of routeSteps.entries()) {
    progress("strict_route_enumeration_start", { stepIndex });
    const enumeration = enumerateRulesV1Actions(state, step.enumerationOptions || {});
    const enumeratedState = enumeration.state;
    progress("strict_route_enumeration_complete", {
      stepIndex,
      actionCount: enumeration.actions?.length || 0,
      rejectedActionCount: enumeration.rejectedActions?.length || 0,
      trustedEnumerationStateIdentityAvailable: enumeratedState === enumeration.state,
    });
    const action = selectedAction(enumeration, step);
    if (!action) {
      rejected = {
        stepIndex,
        reason: "selected_action_not_in_strict_enumeration",
        requestedActionKey: String(step.actionKey || ""),
        requestedActionType: String(step.actionType || ""),
        legalActionCount: (enumeration.actions || []).length,
        rejectedActionCount: (enumeration.rejectedActions || []).length,
        relevantRejectedActions: relevantRejectedActions(enumeration, step),
      };
      break;
    }
    const reactionRequirements = strictOpponentReactionRequirementsForAction(
      action,
      {
        rulesV1State: enumeratedState,
        rulesV1Enumeration: enumeration,
      },
      enumeratedState.activeSideKey,
    );
    progress("strict_route_reaction_requirements_complete", {
      stepIndex,
      reactionRequirementCount: reactionRequirements?.length || 0,
    });
    const strictAction = materializeAction(
      action,
      enumeratedState,
      enumeration,
      step,
      routeKey,
    );
    progress("strict_route_action_materialized", { stepIndex, actionKey: action.actionKey });
    const transition = applyRulesV1Action(enumeratedState, strictAction);
    progress("strict_route_action_applied", { stepIndex, transitionOk: transition.ok === true });
    const persistedAction = { ...strictAction };
    delete persistedAction.__warmachineTrustedRulesV1Enumeration;
    const receiptCore = {
      schemaVersion: "warmachine_strict_terminal_route_step_receipt_v2",
      routeKey,
      stepIndex,
      stateKeyBefore: String(enumeratedState.stateKey || ""),
      turnNumberBefore: enumeratedState.turnNumber,
      activeSideKeyBefore: String(enumeratedState.activeSideKey || ""),
      phaseKeyBefore: String(enumeratedState.phaseKey || ""),
      actionKey: action.actionKey,
      actionType: action.actionType,
      actorPieceKey: String(action.actorPieceKey || ""),
      targetPieceKey: String(action.targetPieceKey || ""),
      persistedAction,
      reactionRequirements: stableGraphValue(reactionRequirements || null),
      trustedEnumerationStateIdentityUsed: enumeration.state === enumeratedState,
      transitionOk: transition.ok === true,
      rejection: stableGraphValue(transition.rejection || transition.error || null),
      events: stableGraphValue(transition.events || []),
      nextStateKey: String(transition.nextState?.stateKey || ""),
      upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    };
    receipts.push({ ...receiptCore, receiptHash: stableGraphHash(receiptCore) });
    allEvents.push(...(transition.events || []));
    if (!transition.ok) {
      rejected = {
        stepIndex,
        reason: String(transition.reason || "strict_transition_rejected"),
        actionKey: action.actionKey,
        rejection: stableGraphValue(transition.rejection || transition.error || null),
        events: stableGraphValue(transition.events || []),
      };
      break;
    }
    state = transition.nextState;
  }

  const terminalReceiptCore = {
    routeKey,
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    stepReceiptHashes: receipts.map((receipt) => receipt.receiptHash),
    finalStateKey: String(state.stateKey || ""),
    events: stableGraphValue(allEvents),
  };
  const terminalReceiptHash = stableGraphHash(terminalReceiptCore);
  const terminalStepReceipt = receipts.find((receipt) =>
    receipt.events.some((event) => event?.eventType === "terminal"));
  progress("strict_route_terminal_proof_start");
  const proof = buildWarmachineMinimalTerminalProofV2(state, terminalSpecification, {
    strictEvents: allEvents,
    strictReceiptHash: terminalReceiptHash,
    endingSideKey: terminalSpecification.endingSideKey,
    scoringSideKey: terminalSpecification.scoringSideKey,
    terminalTurnNumber: terminalStepReceipt?.turnNumberBefore,
    terminalPhaseKey: terminalStepReceipt?.phaseKeyBefore,
  });
  progress("strict_route_terminal_proof_complete", { strictCertified: proof.strictCertified === true });
  const strictWitness = !rejected && receipts.length === routeSteps.length && proof.strictCertified;
  progress("strict_route_predecessor_algebra_start");
  const algebra = buildWarmachineTerminalPredecessorAlgebraV2(
    state,
    terminalSpecification,
    {
      ...rawOptions,
      proof,
      completeRouteStrictWitness: strictWitness,
      strictEvents: allEvents,
      strictReceiptHash: terminalReceiptHash,
    },
  );
  progress("strict_route_predecessor_algebra_complete", {
    predecessorCount: algebra.predecessors?.length || 0,
  });
  const core = {
    schemaVersion: WARMACHINE_STRICT_TERMINAL_ROUTE_WITNESS_V2_SCHEMA,
    routeKey,
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    initialStateKey: String(normalizeRulesV1State(initialStateInput).stateKey || ""),
    finalStateKey: String(state.stateKey || ""),
    requestedStepCount: routeSteps.length,
    appliedStepCount: receipts.filter((receipt) => receipt.transitionOk).length,
    receipts,
    terminalReceiptHash,
    proof,
    algebraHash: algebra.algebraHash,
    rejected,
    strictWitness,
    strategyRobustnessProven: false,
    chanceMassComplete: false,
    opponentResponseSetComplete: false,
    trainingTruth: strictWitness,
    claimBoundary: "A strict witness proves this concrete action, choice, reaction and random-outcome route only. It does not prove the route survives every opponent response or aggregate Chance mass.",
  };
  return { ...core, witnessHash: stableGraphHash(core), finalState: state, algebra };
}

function benchmarkReceiptIntegrity(receipt = {}) {
  const persisted = { ...receipt };
  delete persisted.receiptHash;
  return {
    expectedReceiptHash: stableGraphHash(persisted),
    suppliedReceiptHash: String(receipt.receiptHash || ""),
  };
}

export function certifyWarmachineExecutedTerminalRouteStrictV2(
  initialStateInput = {},
  finalStateInput = {},
  strictReceipts = [],
  terminalSpecification = {},
  rawOptions = {},
) {
  const initialState = normalizeRulesV1State(initialStateInput);
  const finalState = normalizeRulesV1State(finalStateInput);
  const routeKey = String(rawOptions.routeKey ||
    `executed-terminal-route-${stableGraphHash({ terminalSpecification, receiptHashes:
      strictReceipts.map((receipt) => receipt.receiptHash) }, 24)}`);
  const initialStateHash = stableGraphHash(initialState);
  const finalStateHash = stableGraphHash(finalState);
  const issues = [];
  let expectedStateHash = initialStateHash;
  for (const [stepIndex, receipt] of strictReceipts.entries()) {
    const integrity = benchmarkReceiptIntegrity(receipt);
    if (receipt.schemaVersion !== "warmachine_fixed_benchmark_step_receipt_v2") {
      issues.push({ stepIndex, reason: "unsupported_strict_receipt_schema" });
    }
    if (integrity.suppliedReceiptHash !== integrity.expectedReceiptHash) {
      issues.push({ stepIndex, reason: "strict_receipt_hash_mismatch" });
    }
    if (receipt.upstreamReceiptHash !== warmachineHost.receipt.receiptHash) {
      issues.push({ stepIndex, reason: "strict_receipt_upstream_drift" });
    }
    if (receipt.transitionOk !== true) {
      issues.push({ stepIndex, reason: "strict_receipt_transition_not_accepted" });
    }
    if (!receipt.persistedAction || typeof receipt.persistedAction !== "object") {
      issues.push({ stepIndex, reason: "strict_receipt_action_missing" });
    }
    if (String(receipt.stateHashInput || "") !== expectedStateHash) {
      issues.push({
        stepIndex,
        reason: "strict_receipt_state_chain_mismatch",
        expectedStateHash,
        observedStateHash: String(receipt.stateHashInput || ""),
      });
    }
    if (!String(receipt.stateHashBefore || "")) {
      issues.push({ stepIndex, reason: "strict_receipt_enumeration_state_hash_missing" });
    }
    expectedStateHash = String(receipt.stateHashAfter || "");
  }
  if (!strictReceipts.length) issues.push({ reason: "strict_route_has_no_receipts" });
  if (strictReceipts.length && expectedStateHash !== finalStateHash) {
    issues.push({
      reason: "strict_route_final_state_hash_mismatch",
      expectedStateHash,
      observedFinalStateHash: finalStateHash,
    });
  }
  const allEvents = strictReceipts.flatMap((receipt) => receipt.events || []);
  const terminalReceiptCore = {
    routeKey,
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    stepReceiptHashes: strictReceipts.map((receipt) => receipt.receiptHash),
    initialStateHash,
    finalStateHash,
    events: stableGraphValue(allEvents),
  };
  const terminalReceiptHash = stableGraphHash(terminalReceiptCore);
  const terminalStepReceipt = strictReceipts.find((receipt) =>
    (receipt.events || []).some((event) => event?.eventType === "terminal"));
  const proof = buildWarmachineMinimalTerminalProofV2(finalState, terminalSpecification, {
    strictEvents: allEvents,
    strictReceiptHash: terminalReceiptHash,
    endingSideKey: terminalSpecification.endingSideKey,
    scoringSideKey: terminalSpecification.scoringSideKey,
    terminalTurnNumber: terminalStepReceipt?.turnNumberBefore,
    terminalPhaseKey: terminalStepReceipt?.phaseKeyBefore,
  });
  const strictWitness = issues.length === 0 && proof.strictCertified;
  const algebra = buildWarmachineTerminalPredecessorAlgebraV2(
    finalState,
    terminalSpecification,
    {
      ...rawOptions,
      proof,
      completeRouteStrictWitness: strictWitness,
      strictEvents: allEvents,
      strictReceiptHash: terminalReceiptHash,
    },
  );
  const core = {
    schemaVersion: WARMACHINE_EXECUTED_TERMINAL_ROUTE_WITNESS_V2_SCHEMA,
    routeKey,
    upstreamReceiptHash: warmachineHost.receipt.receiptHash,
    initialStateKey: String(initialState.stateKey || ""),
    finalStateKey: String(finalState.stateKey || ""),
    initialStateHash,
    finalStateHash,
    requestedStepCount: strictReceipts.length,
    acceptedStepCount: strictReceipts.filter((receipt) => receipt.transitionOk === true).length,
    stepReceiptHashes: strictReceipts.map((receipt) => receipt.receiptHash),
    terminalReceiptHash,
    proof,
    algebraHash: algebra.algebraHash,
    issues,
    strictWitness,
    routeExecutionValidated: issues.length === 0,
    strategyRobustnessProven: false,
    chanceMassComplete: false,
    opponentResponseSetComplete: false,
    trainingTruth: strictWitness,
    claimBoundary: "This witness validates a hash-chained route already executed by the current strict Host and its exact terminal event. It proves only this concrete cooperative route, not opponent robustness, Chance coverage, strategy value or search completeness.",
  };
  return { ...core, witnessHash: stableGraphHash(core), finalState, algebra };
}
