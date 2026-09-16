import {
  enumerateWarmachineBenchmarkActionsV2,
  executeScopedWarmachineBenchmarkActionV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { normalizeRulesV1State } from "../warmachine-host-runtime.mjs";
import { groupWarmachineAdversarialChanceClassesV1 } from
  "./adversarial-chance-equivalence-v1.mjs";
import {
  buildWarmachineExactActionChanceClasses,
} from "./chance-outcomes-v1.mjs";
import {
  buildWarmachineOpponentResponseSetV1,
  canonicalWarmachineActingSideActionsV1,
  conditionWarmachineOpponentResponseSetForChanceClassV1,
} from "./opponent-response-v1.mjs";
import { executeWarmachineExactPostResponseChanceV1 } from
  "./post-response-chance-execution-v1.mjs";

export const WARMACHINE_STRICT_POLICY_STEP_V1_SCHEMA = "warmachine_strict_policy_step_v1";
export const WARMACHINE_CHANCE_RESPONSE_WORK_V1_SCHEMA =
  "warmachine_chance_response_work_v1";

function terminalOutcome(value) {
  const normalized = String(value || "");
  return ["success", "failure", "unresolved"].includes(normalized) ? normalized : "";
}

function terminalEvents(events = []) {
  return events.filter((event) => event.eventType === "terminal");
}

function unresolvedStep(base, reason, extra = {}) {
  return {
    ...base,
    stepType: "unresolved",
    outcome: "unresolved",
    reason: String(reason || "strict_policy_step_unresolved"),
    ...extra,
  };
}

function terminalStep(base, outcome, reason, extra = {}) {
  return {
    ...base,
    stepType: "terminal",
    outcome: terminalOutcome(outcome) || "unresolved",
    reason: String(reason || "strict_policy_step_terminal"),
    ...extra,
  };
}

function buildChanceResponseWorkCursor(
  action,
  chance,
  chanceClass,
  responseSet,
  response,
  decision,
) {
  const identity = {
    schemaVersion: WARMACHINE_CHANCE_RESPONSE_WORK_V1_SCHEMA,
    actionKey: String(action.actionKey || ""),
    chanceModelHash: stableGraphHash(stableGraphValue(chance)),
    chanceClassKey: String(chanceClass.classKey || ""),
    chanceClassHash: stableGraphHash(stableGraphValue(chanceClass)),
    responseSetHash: String(responseSet.responseSetHash || ""),
    responseKey: String(response.responseKey || ""),
    responseActionKey: String(response.actionKey || ""),
    nextCursor: String(decision.nextPolicyCursor ?? ""),
    actionPatch: stableGraphValue(decision.actionPatch || {}),
  };
  return {
    ...identity,
    workKey: `chance-response-work-${stableGraphHash(identity, 32)}`,
  };
}

function resolveChanceResponseWork(work, action, chance, responseSet) {
  if (work?.schemaVersion !== WARMACHINE_CHANCE_RESPONSE_WORK_V1_SCHEMA) {
    return { ok: false, reason: "chance_response_work_schema_invalid" };
  }
  if (String(action.actionKey || "") !== String(work.actionKey || "") ||
      stableGraphHash(stableGraphValue(chance)) !== String(work.chanceModelHash || "") ||
      String(responseSet.responseSetHash || "") !== String(work.responseSetHash || "")) {
    return { ok: false, reason: "chance_response_work_source_drift" };
  }
  const chanceClass = (chance.classes || []).find((candidate) =>
    candidate.classKey === work.chanceClassKey) || null;
  const response = (responseSet.responses || []).find((candidate) =>
    candidate.responseKey === work.responseKey) || null;
  if (!chanceClass || !response ||
      stableGraphHash(stableGraphValue(chanceClass)) !== String(work.chanceClassHash || "") ||
      String(response.actionKey || "") !== String(work.responseActionKey || "")) {
    return { ok: false, reason: "chance_response_work_member_drift" };
  }
  const expectedWork = buildChanceResponseWorkCursor(
    action,
    chance,
    chanceClass,
    responseSet,
    response,
    {
      nextPolicyCursor: work.nextCursor,
      actionPatch: work.actionPatch,
    },
  );
  if (expectedWork.workKey !== work.workKey) {
    return { ok: false, reason: "chance_response_work_hash_mismatch" };
  }
  return { ok: true, chanceClass, response };
}

function executePreparedChanceResponse({
  scoped,
  action,
  response,
  chanceClass,
  routeKey,
  depth,
  cursor,
  actionPatch,
  classifyResult,
  reportProgress,
}) {
  if (!response.action) {
    return {
      strictRejectedResponseCount: 0,
      preparedResponse: {
        responseKey: response.responseKey,
        actionKey: response.actionKey,
        choice: response.choice,
        recipientPieceKey: response.recipientPieceKey,
        transitionAccepted: false,
        reason: "opponent_response_action_missing_from_strict_enumeration",
        resultStateHash: "",
        outcome: "unresolved",
        outcomeReason: "opponent_response_action_missing_from_strict_enumeration",
        receiptHash: "",
        runtimeReceipt: null,
        terminalEvents: [],
        executedState: null,
      },
    };
  }
  reportProgress("response_execution_start", {
    chanceClassKey: chanceClass.classKey,
    responseKey: response.responseKey,
  });
  const postResponseExecution = executeWarmachineExactPostResponseChanceV1(
    scoped,
    action,
    response,
    chanceClass,
    {
      routeKey: `${routeKey}:${depth}:${chanceClass.classKey}:${response.responseKey}`,
      actionPatch,
      onProgress: (detail) => reportProgress("response_execution_progress", {
        chanceClassKey: chanceClass.classKey,
        responseKey: response.responseKey,
        detail,
      }),
    },
  );
  reportProgress("response_execution_complete", {
    chanceClassKey: chanceClass.classKey,
    responseKey: response.responseKey,
    exactComplete: postResponseExecution.exactComplete,
    outcomeCount: postResponseExecution.outcomes.length,
  });
  if (!postResponseExecution.exactComplete) {
    return {
      strictRejectedResponseCount: 0,
      preparedResponse: {
        responseKey: response.responseKey,
        actionKey: response.action.actionKey,
        choice: response.choice,
        recipientPieceKey: response.recipientPieceKey,
        transitionAccepted: false,
        reason: (postResponseExecution.chance.reasons || []).join(",") ||
          "post_response_chance_not_exact",
        resultStateHash: "",
        outcome: "unresolved",
        outcomeReason: "post_response_chance_not_exact",
        receiptHash: "",
        runtimeReceipt: null,
        terminalEvents: [],
        executedState: null,
        postResponseChanceExactComplete: false,
        postResponseChance: stableGraphValue(postResponseExecution.chance),
        postResponseOutcomes: [],
      },
    };
  }
  let strictRejectedResponseCount = 0;
  const postResponseOutcomes = postResponseExecution.outcomes.map((entry) => {
    const executed = entry.executed;
    const postResponseChanceClass = entry.postResponseChanceClass;
    if (!executed.ok) {
      strictRejectedResponseCount += 1;
      return {
        classKey: postResponseChanceClass.classKey,
        probabilityNumerator: postResponseChanceClass.numerator,
        probabilityDenominator: postResponseChanceClass.denominator,
        transitionAccepted: false,
        reason: executed.reason || "strict_response_transition_rejected",
        resultStateHash: "",
        outcome: "unresolved",
        outcomeReason: executed.reason || "strict_response_transition_rejected",
        receiptHash: executed.receipt?.receiptHash || "",
        runtimeReceipt: executed.receipt || null,
        terminalEvents: stableGraphValue(terminalEvents(executed.transition.events || [])),
        executedState: null,
        strictRollOutcome: stableGraphValue(postResponseChanceClass.strictRollOutcome),
      };
    }
    const successorState = executed.normalizedState || normalizeRulesV1State(executed.state);
    const classification = classifyResult({
      state: successorState,
      events: executed.transition.events || [],
      action: response.action,
      baseAction: action,
      chanceClass,
      postResponseChanceClass,
      response,
      cursor,
      depth,
    }) || { outcome: "continue" };
    return {
      classKey: postResponseChanceClass.classKey,
      probabilityNumerator: postResponseChanceClass.numerator,
      probabilityDenominator: postResponseChanceClass.denominator,
      transitionAccepted: true,
      reason: "",
      resultStateHash: stableGraphHash(successorState),
      outcome: terminalOutcome(classification.outcome) || "continue",
      outcomeReason: String(classification.reason || ""),
      receiptHash: executed.receipt?.receiptHash || "",
      runtimeReceipt: executed.receipt || null,
      terminalEvents: stableGraphValue(terminalEvents(executed.transition.events || [])),
      executedState: successorState,
      strictRollOutcome: stableGraphValue(postResponseChanceClass.strictRollOutcome),
    };
  });
  const transitionAccepted = postResponseOutcomes.every((entry) =>
    entry.transitionAccepted === true);
  const responseUnavailable = response.choice === "transfer" &&
    postResponseOutcomes.length > 0 &&
    postResponseOutcomes.every((entry) =>
      entry.transitionAccepted !== true && entry.reason === "strict_damage_transfer_rejected");
  const semanticVector = postResponseOutcomes.map((entry) => ({
    classKey: entry.classKey,
    probabilityNumerator: entry.probabilityNumerator,
    probabilityDenominator: entry.probabilityDenominator,
    transitionAccepted: entry.transitionAccepted,
    reason: entry.reason,
    resultStateHash: entry.resultStateHash,
    outcome: entry.outcome,
    outcomeReason: entry.outcomeReason,
    terminalEvents: entry.terminalEvents,
  }));
  return {
    strictRejectedResponseCount: responseUnavailable ? 0 : strictRejectedResponseCount,
    responseUnavailable,
    preparedResponse: {
      responseKey: response.responseKey,
      actionKey: response.action.actionKey,
      choice: response.choice,
      recipientPieceKey: response.recipientPieceKey,
      transitionAccepted,
      reason: transitionAccepted
        ? ""
        : postResponseOutcomes.find((entry) => !entry.transitionAccepted)?.reason ||
          "strict_response_transition_rejected",
      resultStateHash: transitionAccepted ? stableGraphHash(semanticVector) : "",
      outcome: "post_response_chance",
      outcomeReason: "",
      receiptHash: postResponseOutcomes.length === 1
        ? postResponseOutcomes[0].receiptHash
        : "",
      runtimeReceipt: postResponseOutcomes.length === 1
        ? postResponseOutcomes[0].runtimeReceipt
        : null,
      terminalEvents: [],
      executedState: postResponseOutcomes.length === 1
        ? postResponseOutcomes[0].executedState
        : null,
      postResponseChanceExactComplete: true,
      postResponseChance: stableGraphValue(postResponseExecution.chance),
      postResponseOutcomes,
    },
  };
}

export function expandWarmachineStrictPolicyStepV1(
  stateInput = {},
  selectPolicyAction,
  rawOptions = {},
) {
  if (typeof selectPolicyAction !== "function") {
    throw new Error("strict_policy_step_selector_required");
  }
  const stateAlreadyNormalized = rawOptions.inputStateAlreadyNormalized === true;
  const state = stateAlreadyNormalized ? stateInput : normalizeRulesV1State(stateInput);
  const stateHash = String(rawOptions.inputStateHash || stableGraphHash(state));
  const depth = Math.max(0, Number(rawOptions.depth ?? 0));
  const cursor = String(rawOptions.cursor ?? depth);
  const routeKey = String(rawOptions.routeKey || "strict-policy-step");
  const perspectiveSideKey = String(rawOptions.perspectiveSideKey || state.activeSideKey || "");
  const chanceResponseWork = rawOptions.chanceResponseWork || null;
  const reportProgress = (stage, detail = {}) => rawOptions.onProgress?.({
    stage,
    depth,
    cursor,
    ...stableGraphValue(detail),
  });
  const classifyState = typeof rawOptions.classifyState === "function"
    ? rawOptions.classifyState
    : () => ({ outcome: "continue" });
  const classifyResult = typeof rawOptions.classifyResult === "function"
    ? rawOptions.classifyResult
    : ({ events }) => {
      const terminal = terminalEvents(events)[0];
      if (!terminal) return { outcome: "continue" };
      return {
        outcome: terminal.winnerSideKey === perspectiveSideKey ? "success" : "failure",
        reason: String(terminal.reason || "terminal"),
      };
    };
  const base = {
    schemaVersion: WARMACHINE_STRICT_POLICY_STEP_V1_SCHEMA,
    stateHash,
    cursor,
    depth,
    perspectiveSideKey,
    strictRejectedResponseCount: 0,
    strictRejectedDeterministicCount: 0,
  };

  const classifiedState = classifyState({ state, stateHash, cursor, depth }) || {};
  if (terminalOutcome(classifiedState.outcome)) {
    return terminalStep(
      base,
      classifiedState.outcome,
      classifiedState.reason || "classified_state_terminal",
    );
  }

  reportProgress("policy_selection_start");
  const decision = selectPolicyAction({
    state,
    stateHash,
    cursor,
    depth,
    stateAlreadyNormalized,
  }) || {};
  reportProgress("policy_selection_complete", {
    actionKey: decision.actionKey || decision.action?.actionKey || "",
  });
  const policyOutcome = terminalOutcome(decision.outcome);
  if (decision.nodeType === "terminal" || policyOutcome) {
    return terminalStep(base, policyOutcome || "unresolved", decision.reason || "policy_terminal");
  }
  reportProgress("action_enumeration_start", {
    reusedPolicyEnumeration: Boolean(decision.scoped),
  });
  const scoped = decision.scoped || enumerateWarmachineBenchmarkActionsV2(
    state,
    decision.enumerationScope || {},
  );
  reportProgress("action_enumeration_complete", {
    legalActionCount: scoped.enumeration.actions.length,
    rejectedActionCount: (scoped.enumeration.rejectedActions || []).length,
  });
  const canonicalActions = canonicalWarmachineActingSideActionsV1(scoped.enumeration);
  const action = decision.action || canonicalActions.find((candidate) =>
    candidate.actionKey === decision.actionKey) || null;
  if (!action || !canonicalActions.some((candidate) => candidate.actionKey === action.actionKey)) {
    return unresolvedStep(base, "policy_action_not_in_canonical_strict_legal_space");
  }
  const actionAudit = {
    actionKey: action.actionKey,
    actionType: String(action.actionType || ""),
    actorPieceKey: String(action.actorPieceKey || ""),
    targetPieceKey: String(action.targetPieceKey || ""),
    nextCursor: String(chanceResponseWork?.nextCursor ?? decision.nextPolicyCursor ?? depth + 1),
  };

  if (decision.deterministicAction === true) {
    if (action.metadata?.attackResolution) {
      return unresolvedStep(base, "declared_deterministic_action_has_attack_resolution", {
        action: actionAudit,
      });
    }
    const executed = executeScopedWarmachineBenchmarkActionV2(
      scoped,
      action,
      { actionKey: action.actionKey },
      {
        routeKey: `${routeKey}:${depth}:deterministic`,
        actionPatch: decision.actionPatch || {},
        skipStrictRngForProvablyDeterministicAction: true,
        onProgress: (detail) => reportProgress("deterministic_execution_progress", detail),
      },
    );
    const reactionRequirements = executed.receipt?.reactionRequirements || [];
    if (!executed.ok || reactionRequirements.length) {
      return unresolvedStep(
        {
          ...base,
          strictRejectedDeterministicCount: executed.ok ? 0 : 1,
        },
        !executed.ok
          ? executed.reason || "strict_deterministic_transition_rejected"
          : "declared_deterministic_action_has_opponent_reaction_requirements",
        {
          action: actionAudit,
          receiptHash: executed.receipt?.receiptHash || "",
          transitionAccepted: executed.ok === true,
          reactionRequirementCount: reactionRequirements.length,
        },
      );
    }
    const successorState = executed.normalizedState || normalizeRulesV1State(executed.state);
    const classification = classifyResult({
      state: successorState,
      events: executed.transition.events || [],
      action,
      baseAction: action,
      chanceClass: null,
      response: null,
      cursor,
      depth,
      deterministicAction: true,
    }) || { outcome: "continue" };
    const outcome = terminalOutcome(classification.outcome);
    return {
      ...base,
      stepType: "deterministic",
      action: actionAudit,
      successor: {
        state: successorState,
        stateHash: stableGraphHash(successorState),
        cursor: actionAudit.nextCursor,
        outcome,
        reason: String(classification.reason || ""),
        receiptHash: executed.receipt?.receiptHash || "",
        runtimeReceipt: executed.receipt || null,
        transitionAccepted: true,
        terminalEvents: stableGraphValue(terminalEvents(executed.transition.events || [])),
      },
    };
  }

  const chanceContextCache = rawOptions.chanceContextCache instanceof Map
    ? rawOptions.chanceContextCache
    : null;
  const chanceContextCacheKey = `${stateHash}|${action.actionKey}`;
  const cachedChanceContext = chanceContextCache?.get(chanceContextCacheKey) || null;
  reportProgress("chance_classes_start", {
    actionKey: action.actionKey,
    reusedChanceContext: Boolean(cachedChanceContext),
  });
  const chance = cachedChanceContext?.chance ||
    buildWarmachineExactActionChanceClasses(action, { state: scoped.state });
  reportProgress("chance_classes_complete", {
    actionKey: action.actionKey,
    exactComplete: chance.exactComplete === true,
    classCount: chance.classCount || chance.classes?.length || 0,
  });
  const chanceAudit = {
    actionKey: action.actionKey,
    exactComplete: chance.exactComplete === true,
    classCount: chance.classCount || 0,
    massNumerator: chance.massNumerator || 0,
    massDenominator: chance.massDenominator || 0,
    reasons: chance.reasons || [],
    deterministicSuccessorEffectTypes: chance.deterministicSuccessorEffectTypes || [],
    preChanceResolvedEffectTypes: chance.preChanceResolvedEffectTypes || [],
    provablyInactiveSuccessorEffectTypes: chance.provablyInactiveSuccessorEffectTypes || [],
  };
  if (!chance.exactComplete) {
    return unresolvedStep(
      base,
      `exact_chance_not_closed:${(chance.reasons || []).join(",")}`,
      { action: actionAudit, chanceAudit },
    );
  }

  const responseSet = cachedChanceContext?.responseSet ||
    buildWarmachineOpponentResponseSetV1(action, scoped.enumeration);
  const responseSetByChanceClassKey = cachedChanceContext?.responseSetByChanceClassKey ||
    new Map(chance.classes.map((chanceClass) => [
      chanceClass.classKey,
      conditionWarmachineOpponentResponseSetForChanceClassV1(responseSet, chanceClass),
    ]));
  const conditionedResponseSetsComplete = Array.from(responseSetByChanceClassKey.values())
    .every((conditioned) => conditioned.responseSetComplete === true);
  if (chanceContextCache && !cachedChanceContext) {
    chanceContextCache.set(chanceContextCacheKey, {
      chance,
      responseSet,
      responseSetByChanceClassKey,
    });
  }
  reportProgress("response_set_complete", {
    responseCount: responseSet.responses.length,
    responseSetComplete: conditionedResponseSetsComplete,
  });

  if (chanceResponseWork) {
    if (String(decision.nextPolicyCursor ?? "") !== String(chanceResponseWork.nextCursor || "") ||
        stableGraphHash(stableGraphValue(decision.actionPatch || {})) !==
          stableGraphHash(stableGraphValue(chanceResponseWork.actionPatch || {}))) {
      return unresolvedStep(base, "chance_response_work_policy_drift", {
        action: actionAudit,
        chanceAudit,
      });
    }
    const workChanceClass = (chance.classes || []).find((candidate) =>
      candidate.classKey === chanceResponseWork.chanceClassKey) || null;
    const workResponseSet = responseSetByChanceClassKey.get(workChanceClass?.classKey) ||
      responseSet;
    const resolvedWork = resolveChanceResponseWork(
      chanceResponseWork,
      action,
      chance,
      workResponseSet,
    );
    if (!resolvedWork.ok) {
      return unresolvedStep(base, resolvedWork.reason, { action: actionAudit, chanceAudit });
    }
    const executedWork = executePreparedChanceResponse({
      scoped,
      action,
      response: resolvedWork.response,
      chanceClass: resolvedWork.chanceClass,
      routeKey,
      depth,
      cursor,
      actionPatch: chanceResponseWork.actionPatch || {},
      classifyResult,
      reportProgress,
    });
    const preparedResponse = executedWork.preparedResponse;
    if (executedWork.responseUnavailable) {
      return {
        ...base,
        stepType: "response_unavailable",
        reason: preparedResponse.reason || "strict_response_unavailable_after_chance",
        action: actionAudit,
        chanceResponseWork: stableGraphValue(chanceResponseWork),
        chanceAudit: {
          ...chanceAudit,
          classCount: 1,
          massNumerator: 1,
          massDenominator: 1,
          equivalenceHash: `chance-response-work-${chanceResponseWork.workKey}`,
          equivalenceGroupCount: 1,
          mergedClassCount: 0,
          equivalenceMassConserved: true,
        },
        responseSet: {
          ownerSideKey: "",
          decisionKind: "resolved_chance_response_work",
          responseSetComplete: true,
          responseCount: 0,
        },
        responseUnavailable: {
          responseKey: resolvedWork.response.responseKey,
          actionKey: preparedResponse.actionKey,
          choice: preparedResponse.choice,
          recipientPieceKey: preparedResponse.recipientPieceKey,
          reason: preparedResponse.reason,
          postResponseOutcomes: (preparedResponse.postResponseOutcomes || []).map((outcome) => ({
            classKey: outcome.classKey,
            reason: outcome.reason,
            receiptHash: outcome.receiptHash,
          })),
        },
        runtimeReceipts: (preparedResponse.postResponseOutcomes || [])
          .map((outcome) => outcome.runtimeReceipt).filter(Boolean),
      };
    }
    return {
      ...base,
      stepType: "chance",
      strictRejectedResponseCount: executedWork.strictRejectedResponseCount,
      action: actionAudit,
      chanceResponseWork: stableGraphValue(chanceResponseWork),
      chanceAudit: {
        ...chanceAudit,
        classCount: 1,
        massNumerator: 1,
        massDenominator: 1,
        equivalenceHash: `chance-response-work-${chanceResponseWork.workKey}`,
        equivalenceGroupCount: 1,
        mergedClassCount: 0,
        equivalenceMassConserved: true,
      },
      responseSet: {
        ownerSideKey: "",
        decisionKind: "resolved_chance_response_work",
        responseSetComplete: true,
        responseCount: 1,
      },
      groups: [{
        groupKey: `resolved-${chanceResponseWork.workKey}`,
        numerator: 1,
        denominator: 1,
        classCount: 1,
        chanceClassKeys: [resolvedWork.chanceClass.classKey],
        classEvidence: [{
          chanceClassKey: resolvedWork.chanceClass.classKey,
          numerator: 1,
          denominator: 1,
          strictRollOutcome: stableGraphValue(resolvedWork.chanceClass.strictRollOutcome),
          responseEvidence: [{
            responseKey: `resolved-${resolvedWork.response.responseKey}`,
            actionKey: preparedResponse.actionKey,
            receiptHash: preparedResponse.receiptHash,
            transitionAccepted: preparedResponse.transitionAccepted,
            resultStateHash: preparedResponse.resultStateHash,
            reason: preparedResponse.reason,
            postResponseOutcomes: (preparedResponse.postResponseOutcomes || []).map((outcome) => ({
              classKey: outcome.classKey,
              receiptHash: outcome.receiptHash,
              transitionAccepted: outcome.transitionAccepted,
              resultStateHash: outcome.resultStateHash,
              reason: outcome.reason,
            })),
          }],
        }],
        responses: [{
          responseKey: `resolved-${resolvedWork.response.responseKey}`,
          actionKey: preparedResponse.actionKey,
          choice: preparedResponse.choice,
          recipientPieceKey: preparedResponse.recipientPieceKey,
          transitionAccepted: preparedResponse.transitionAccepted,
          reason: preparedResponse.reason,
          state: preparedResponse.executedState,
          stateHash: preparedResponse.resultStateHash,
          outcome: preparedResponse.outcome,
          outcomeReason: preparedResponse.outcomeReason,
          receiptHash: preparedResponse.receiptHash,
          runtimeReceipts: (preparedResponse.postResponseOutcomes || [])
            .map((outcome) => outcome.runtimeReceipt).filter(Boolean),
          terminalEvents: preparedResponse.terminalEvents,
          postResponseChanceExactComplete:
            preparedResponse.postResponseChanceExactComplete !== false,
          postResponseChance: preparedResponse.postResponseChance,
          postResponseOutcomes: preparedResponse.postResponseOutcomes,
          equivalentExecutionEvidence: [{
            chanceClassKey: resolvedWork.chanceClass.classKey,
            responseKey: resolvedWork.response.responseKey,
            actionKey: preparedResponse.actionKey,
            transitionAccepted: preparedResponse.transitionAccepted,
            reason: preparedResponse.reason,
            stateHash: preparedResponse.resultStateHash,
            receiptHash: preparedResponse.receiptHash,
            postResponseOutcomeEvidence: (preparedResponse.postResponseOutcomes || [])
              .map((outcome) => ({
                classKey: outcome.classKey,
                transitionAccepted: outcome.transitionAccepted,
                reason: outcome.reason,
                stateHash: outcome.resultStateHash,
                receiptHash: outcome.receiptHash,
              })),
          }],
        }],
      }],
    };
  }

  if (rawOptions.deferChanceResponseExecution === true) {
    const groups = chance.classes.map((chanceClass) => {
      const classResponseSet = responseSetByChanceClassKey.get(chanceClass.classKey);
      return {
      groupKey: `deferred-chance-class-${stableGraphHash({
        actionKey: action.actionKey,
        chanceClassKey: chanceClass.classKey,
      }, 24)}`,
      numerator: chanceClass.numerator,
      denominator: chanceClass.denominator,
      classCount: 1,
      chanceClassKeys: [chanceClass.classKey],
      classEvidence: [{
        chanceClassKey: chanceClass.classKey,
        numerator: chanceClass.numerator,
        denominator: chanceClass.denominator,
        strictRollOutcome: stableGraphValue(chanceClass.strictRollOutcome),
        responseEvidence: [],
      }],
      responses: classResponseSet.responses.map((response) => ({
        responseKey: response.responseKey,
        actionKey: response.actionKey,
        choice: response.choice,
        recipientPieceKey: response.recipientPieceKey,
        transitionAccepted: Boolean(response.action),
        reason: response.action
          ? ""
          : "opponent_response_action_missing_from_strict_enumeration",
        workCursor: buildChanceResponseWorkCursor(
          action,
          chance,
          chanceClass,
          classResponseSet,
          response,
          decision,
        ),
      })),
    };
    });
    return {
      ...base,
      stepType: "chance_worklist",
      action: actionAudit,
      chanceAudit: {
        ...chanceAudit,
        equivalenceHash: "deferred_until_chance_response_execution",
        equivalenceGroupCount: groups.length,
        mergedClassCount: 0,
        equivalenceMassConserved:
          BigInt(String(chance.massNumerator)) === BigInt(String(chance.massDenominator)),
      },
      responseSet: {
        ownerSideKey: responseSet.ownerSideKey,
        decisionKind: responseSet.decisionKind,
        responseSetComplete: conditionedResponseSetsComplete,
        responseCount: responseSet.responses.length,
      },
      groups,
    };
  }

  const preparedChanceClasses = [];
  let strictRejectedResponseCount = 0;
  for (const chanceClass of chance.classes) {
    reportProgress("chance_class_start", {
      chanceClassKey: chanceClass.classKey,
    });
    const responses = [];
    const classResponseSet = responseSetByChanceClassKey.get(chanceClass.classKey);
    for (const response of classResponseSet.responses) {
      if (!response.action) {
        responses.push({
          responseKey: response.responseKey,
          actionKey: response.actionKey,
          choice: response.choice,
          recipientPieceKey: response.recipientPieceKey,
          transitionAccepted: false,
          reason: "opponent_response_action_missing_from_strict_enumeration",
          resultStateHash: "",
          outcome: "unresolved",
          outcomeReason: "opponent_response_action_missing_from_strict_enumeration",
          receiptHash: "",
          runtimeReceipt: null,
          terminalEvents: [],
          executedState: null,
        });
        continue;
      }
      reportProgress("response_execution_start", {
        chanceClassKey: chanceClass.classKey,
        responseKey: response.responseKey,
      });
      const postResponseExecution = executeWarmachineExactPostResponseChanceV1(
        scoped,
        action,
        response,
        chanceClass,
        {
          routeKey: `${routeKey}:${depth}:${chanceClass.classKey}:${response.responseKey}`,
          actionPatch: decision.actionPatch || {},
          onProgress: (detail) => reportProgress("response_execution_progress", {
            chanceClassKey: chanceClass.classKey,
            responseKey: response.responseKey,
            detail,
          }),
        },
      );
      reportProgress("response_execution_complete", {
        chanceClassKey: chanceClass.classKey,
        responseKey: response.responseKey,
        exactComplete: postResponseExecution.exactComplete,
        outcomeCount: postResponseExecution.outcomes.length,
      });
      if (!postResponseExecution.exactComplete) {
        responses.push({
          responseKey: response.responseKey,
          actionKey: response.action.actionKey,
          choice: response.choice,
          recipientPieceKey: response.recipientPieceKey,
          transitionAccepted: false,
          reason: (postResponseExecution.chance.reasons || []).join(",") ||
            "post_response_chance_not_exact",
          resultStateHash: "",
          outcome: "unresolved",
          outcomeReason: "post_response_chance_not_exact",
          receiptHash: "",
          runtimeReceipt: null,
          terminalEvents: [],
          executedState: null,
          postResponseChanceExactComplete: false,
          postResponseChance: stableGraphValue(postResponseExecution.chance),
          postResponseOutcomes: [],
        });
        continue;
      }
      const postResponseOutcomes = postResponseExecution.outcomes.map((entry) => {
        const executed = entry.executed;
        const postResponseChanceClass = entry.postResponseChanceClass;
        if (!executed.ok) {
          strictRejectedResponseCount += 1;
          return {
            classKey: postResponseChanceClass.classKey,
            probabilityNumerator: postResponseChanceClass.numerator,
            probabilityDenominator: postResponseChanceClass.denominator,
            transitionAccepted: false,
            reason: executed.reason || "strict_response_transition_rejected",
            resultStateHash: "",
            outcome: "unresolved",
            outcomeReason: executed.reason || "strict_response_transition_rejected",
            receiptHash: executed.receipt?.receiptHash || "",
            runtimeReceipt: executed.receipt || null,
            terminalEvents: stableGraphValue(terminalEvents(executed.transition.events || [])),
            executedState: null,
            strictRollOutcome: stableGraphValue(postResponseChanceClass.strictRollOutcome),
          };
        }
        const successorState = executed.normalizedState || normalizeRulesV1State(executed.state);
        const classification = classifyResult({
          state: successorState,
          events: executed.transition.events || [],
          action: response.action,
          baseAction: action,
          chanceClass,
          postResponseChanceClass,
          response,
          cursor,
          depth,
        }) || { outcome: "continue" };
        return {
          classKey: postResponseChanceClass.classKey,
          probabilityNumerator: postResponseChanceClass.numerator,
          probabilityDenominator: postResponseChanceClass.denominator,
          transitionAccepted: true,
          reason: "",
          resultStateHash: stableGraphHash(successorState),
          outcome: terminalOutcome(classification.outcome) || "continue",
          outcomeReason: String(classification.reason || ""),
          receiptHash: executed.receipt?.receiptHash || "",
          runtimeReceipt: executed.receipt || null,
          terminalEvents: stableGraphValue(terminalEvents(executed.transition.events || [])),
          executedState: successorState,
          strictRollOutcome: stableGraphValue(postResponseChanceClass.strictRollOutcome),
        };
      });
      const transitionAccepted = postResponseOutcomes.every((entry) =>
        entry.transitionAccepted === true);
      const semanticVector = postResponseOutcomes.map((entry) => ({
        classKey: entry.classKey,
        probabilityNumerator: entry.probabilityNumerator,
        probabilityDenominator: entry.probabilityDenominator,
        transitionAccepted: entry.transitionAccepted,
        reason: entry.reason,
        resultStateHash: entry.resultStateHash,
        outcome: entry.outcome,
        outcomeReason: entry.outcomeReason,
        terminalEvents: entry.terminalEvents,
      }));
      responses.push({
        responseKey: response.responseKey,
        actionKey: response.action.actionKey,
        choice: response.choice,
        recipientPieceKey: response.recipientPieceKey,
        transitionAccepted,
        reason: transitionAccepted
          ? ""
          : postResponseOutcomes.find((entry) => !entry.transitionAccepted)?.reason ||
            "strict_response_transition_rejected",
        resultStateHash: transitionAccepted
          ? stableGraphHash(semanticVector)
          : "",
        outcome: "post_response_chance",
        outcomeReason: "",
        receiptHash: postResponseOutcomes.length === 1
          ? postResponseOutcomes[0].receiptHash
          : "",
        runtimeReceipt: postResponseOutcomes.length === 1
          ? postResponseOutcomes[0].runtimeReceipt
          : null,
        terminalEvents: [],
        executedState: postResponseOutcomes.length === 1
          ? postResponseOutcomes[0].executedState
          : null,
        postResponseChanceExactComplete: true,
        postResponseChance: stableGraphValue(postResponseExecution.chance),
        postResponseOutcomes,
      });
    }
    preparedChanceClasses.push({ chanceClass, responses });
    reportProgress("chance_class_complete", {
      chanceClassKey: chanceClass.classKey,
      responseCount: responses.length,
    });
  }
  const equivalence = groupWarmachineAdversarialChanceClassesV1(preparedChanceClasses, {
    ownerSideKey: responseSet.ownerSideKey,
    decisionKind: responseSet.decisionKind,
    responseSetComplete: conditionedResponseSetsComplete,
  });
  if (!equivalence.ok) return unresolvedStep(base, "adversarial_chance_mass_not_conserved");
  const groups = equivalence.groups.map((group) => ({
    groupKey: group.groupKey,
    numerator: group.numerator,
    denominator: group.denominator,
    classCount: group.classCount,
    chanceClassKeys: group.chanceClassKeys,
    classEvidence: stableGraphValue(group.classEvidence),
    responses: group.representative.responses.map((response) => ({
      responseKey: response.responseKey,
      actionKey: response.actionKey,
      choice: response.choice,
      recipientPieceKey: response.recipientPieceKey,
      transitionAccepted: response.transitionAccepted,
      reason: response.reason,
      state: response.executedState,
      stateHash: response.resultStateHash,
      outcome: response.outcome,
      outcomeReason: response.outcomeReason,
      receiptHash: response.receiptHash,
      runtimeReceipts: group.classes.flatMap((prepared) => {
        const equivalent = prepared.responses.find((candidate) =>
          candidate.responseKey === response.responseKey);
        return (equivalent?.postResponseOutcomes || []).map((outcome) =>
          outcome.runtimeReceipt).filter(Boolean);
      }),
      terminalEvents: response.terminalEvents,
      postResponseChanceExactComplete: response.postResponseChanceExactComplete !== false,
      postResponseChance: response.postResponseChance,
      postResponseOutcomes: response.postResponseOutcomes,
      equivalentExecutionEvidence: group.classes.map((prepared) => {
        const equivalent = prepared.responses.find((candidate) =>
          candidate.responseKey === response.responseKey);
        return {
          chanceClassKey: prepared.chanceClass.classKey,
          responseKey: equivalent?.responseKey || response.responseKey,
          actionKey: equivalent?.actionKey || response.actionKey,
          transitionAccepted: equivalent?.transitionAccepted === true,
          reason: equivalent?.reason || "",
          stateHash: equivalent?.resultStateHash || "",
          receiptHash: equivalent?.receiptHash || "",
          postResponseOutcomeEvidence: (equivalent?.postResponseOutcomes || []).map((outcome) => ({
            classKey: outcome.classKey,
            transitionAccepted: outcome.transitionAccepted,
            reason: outcome.reason,
            stateHash: outcome.resultStateHash,
            receiptHash: outcome.receiptHash,
          })),
        };
      }).sort((left, right) => left.chanceClassKey.localeCompare(right.chanceClassKey)),
    })),
  }));
  return {
    ...base,
    stepType: "chance",
    strictRejectedResponseCount,
    action: actionAudit,
    chanceAudit: {
      ...chanceAudit,
      equivalenceHash: equivalence.equivalenceHash,
      equivalenceGroupCount: equivalence.equivalenceGroupCount,
      mergedClassCount: equivalence.mergedClassCount,
      equivalenceMassConserved: equivalence.massConserved,
    },
    responseSet: {
      ownerSideKey: responseSet.ownerSideKey,
      decisionKind: responseSet.decisionKind,
      responseSetComplete: conditionedResponseSetsComplete,
      responseCount: responseSet.responses.length,
    },
    groups,
  };
}
