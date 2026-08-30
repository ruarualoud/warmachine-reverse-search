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
} from "./opponent-response-v1.mjs";
import { executeWarmachineExactPostResponseChanceV1 } from
  "./post-response-chance-execution-v1.mjs";

export const WARMACHINE_STRICT_POLICY_STEP_V1_SCHEMA = "warmachine_strict_policy_step_v1";

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

export function expandWarmachineStrictPolicyStepV1(
  stateInput = {},
  selectPolicyAction,
  rawOptions = {},
) {
  if (typeof selectPolicyAction !== "function") {
    throw new Error("strict_policy_step_selector_required");
  }
  const state = normalizeRulesV1State(stateInput);
  const stateHash = stableGraphHash(state);
  const depth = Math.max(0, Number(rawOptions.depth ?? 0));
  const cursor = String(rawOptions.cursor ?? depth);
  const routeKey = String(rawOptions.routeKey || "strict-policy-step");
  const perspectiveSideKey = String(rawOptions.perspectiveSideKey || state.activeSideKey || "");
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

  const decision = selectPolicyAction({ state, stateHash, cursor, depth }) || {};
  const policyOutcome = terminalOutcome(decision.outcome);
  if (decision.nodeType === "terminal" || policyOutcome) {
    return terminalStep(base, policyOutcome || "unresolved", decision.reason || "policy_terminal");
  }
  const scoped = decision.scoped || enumerateWarmachineBenchmarkActionsV2(
    state,
    decision.enumerationScope || {},
  );
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
    nextCursor: String(decision.nextPolicyCursor ?? depth + 1),
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

  const chance = buildWarmachineExactActionChanceClasses(action, { state: scoped.state });
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

  const responseSet = buildWarmachineOpponentResponseSetV1(action, scoped.enumeration);
  const preparedChanceClasses = [];
  let strictRejectedResponseCount = 0;
  for (const chanceClass of chance.classes) {
    const responses = [];
    for (const response of responseSet.responses) {
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
      const postResponseExecution = executeWarmachineExactPostResponseChanceV1(
        scoped,
        action,
        response,
        chanceClass,
        {
          routeKey: `${routeKey}:${depth}:${chanceClass.classKey}:${response.responseKey}`,
          actionPatch: decision.actionPatch || {},
        },
      );
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
  }
  const equivalence = groupWarmachineAdversarialChanceClassesV1(preparedChanceClasses, {
    ownerSideKey: responseSet.ownerSideKey,
    decisionKind: responseSet.decisionKind,
    responseSetComplete: responseSet.responseSetComplete,
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
      responseSetComplete: responseSet.responseSetComplete,
      responseCount: responseSet.responses.length,
    },
    groups,
  };
}
