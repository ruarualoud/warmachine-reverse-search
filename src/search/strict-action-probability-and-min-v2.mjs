import {
  enumerateWarmachineBenchmarkActionsV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { normalizeRulesV1State } from "../warmachine-host-runtime.mjs";
import {
  buildWarmachineExactActionChanceClasses,
  warmachineExactChanceClassActionPatch,
} from "./chance-outcomes-v1.mjs";
import {
  buildWarmachineOpponentResponseSetV1,
  canonicalWarmachineActingSideActionsV1,
} from "./opponent-response-v1.mjs";
import { executeWarmachineExactPostResponseChanceV1 } from
  "./post-response-chance-execution-v1.mjs";

export const WARMACHINE_STRICT_ACTION_PROBABILITY_AND_MIN_V2_SCHEMA =
  "warmachine_strict_action_probability_and_min_v2";

function outcomeInterval(rawOutcome = "unresolved") {
  const outcome = String(rawOutcome || "unresolved");
  if (outcome === "success") return { outcome, lowerBound: 1, upperBound: 1, complete: true };
  if (outcome === "failure") return { outcome, lowerBound: 0, upperBound: 0, complete: true };
  return { outcome: "unresolved", lowerBound: 0, upperBound: 1, complete: false };
}

function terminalEvents(events = []) {
  return events.filter((event) => event.eventType === "terminal");
}

function aggregateOwnedResponses(rows = [], ownerSideKey = "", perspectiveSideKey = "") {
  const maximize = Boolean(ownerSideKey && ownerSideKey === perspectiveSideKey);
  const ordered = rows.slice().sort((left, right) =>
    maximize
      ? right.interval.lowerBound - left.interval.lowerBound || right.interval.upperBound - left.interval.upperBound
      : left.interval.upperBound - right.interval.upperBound || left.interval.lowerBound - right.interval.lowerBound);
  const selected = ordered[0] || null;
  return {
    quantifier: maximize ? "owner_max" : "opponent_min",
    lowerBound: selected?.interval.lowerBound ?? 0,
    upperBound: selected?.interval.upperBound ?? 1,
    complete: rows.length > 0 && rows.every((row) => row.interval.complete === true),
    selectedResponseKey: selected?.responseKey || "",
  };
}

export function evaluateWarmachineStrictActionProbabilityAndMinV2(
  initialStateInput = {},
  rawOptions = {},
) {
  const initialState = normalizeRulesV1State(initialStateInput);
  const scoped = rawOptions.scoped || enumerateWarmachineBenchmarkActionsV2(
    initialState,
    rawOptions.enumerationScope || {},
  );
  const actingActions = canonicalWarmachineActingSideActionsV1(scoped.enumeration);
  const action = rawOptions.action || actingActions.find((candidate) =>
    candidate.actionKey === rawOptions.actionKey) || null;
  if (!action) throw new Error("strict_action_probability_action_not_in_canonical_acting_space");
  const chance = buildWarmachineExactActionChanceClasses(action, { state: scoped.state });
  const perspectiveSideKey = String(rawOptions.perspectiveSideKey || scoped.state.activeSideKey || "");
  const classifyResult = typeof rawOptions.classifyResult === "function"
    ? rawOptions.classifyResult
    : ({ events }) => {
      const terminal = terminalEvents(events)[0];
      if (!terminal) return { outcome: "unresolved", reason: "no_terminal_after_one_action" };
      return {
        outcome: terminal.winnerSideKey === perspectiveSideKey ? "success" : "failure",
        reason: String(terminal.reason || "terminal"),
      };
    };
  if (!chance.exactComplete) {
    const core = {
      schemaVersion: WARMACHINE_STRICT_ACTION_PROBABILITY_AND_MIN_V2_SCHEMA,
      actionKey: action.actionKey,
      perspectiveSideKey,
      exactComplete: false,
      chanceMassComplete: false,
      opponentResponseSetComplete: false,
      reasons: chance.reasons || [],
      probabilityInterval: { lowerBound: 0, upperBound: 1, exact: false },
      chanceNodes: [],
      claimBoundary: "The selected action is outside the exact primary attack/spell cursor; no exact probability or adversarial claim is made.",
    };
    return { ...core, reportHash: stableGraphHash(stableGraphValue(core)), ok: false };
  }

  const responseSet = buildWarmachineOpponentResponseSetV1(action, scoped.enumeration);
  const chanceNodes = chance.classes.map((chanceClass) => {
    const responseRows = responseSet.responses.map((response) => {
      if (!response.action) {
        return {
          responseKey: response.responseKey,
          actionKey: response.actionKey,
          interval: outcomeInterval("unresolved"),
          transitionAccepted: false,
          reason: "opponent_response_action_missing_from_strict_enumeration",
        };
      }
      const postResponseExecution = executeWarmachineExactPostResponseChanceV1(
        scoped,
        action,
        response,
        chanceClass,
        {
          routeKey: `${rawOptions.routeKey || "strict-action-and-min"}:${chanceClass.classKey}:${response.responseKey}`,
        },
      );
      if (!postResponseExecution.exactComplete) {
        return {
          responseKey: response.responseKey,
          actionKey: response.action.actionKey,
          choice: response.choice,
          recipientPieceKey: response.recipientPieceKey,
          interval: outcomeInterval("unresolved"),
          transitionAccepted: false,
          reason: (postResponseExecution.chance.reasons || []).join(",") ||
            "post_response_chance_not_exact",
          postResponseChance: stableGraphValue(postResponseExecution.chance),
        };
      }
      const postResponseOutcomes = postResponseExecution.outcomes.map((entry) => {
        const result = entry.executed;
        const postResponseChanceClass = entry.postResponseChanceClass;
        if (!result.ok) {
          return {
            classKey: postResponseChanceClass.classKey,
            probabilityNumerator: postResponseChanceClass.numerator,
            probabilityDenominator: postResponseChanceClass.denominator,
            interval: outcomeInterval("unresolved"),
            transitionAccepted: false,
            reason: result.reason || "strict_response_transition_rejected",
            receiptHash: result.receipt?.receiptHash || "",
          };
        }
        const classification = classifyResult({
          state: result.state,
          events: result.transition.events || [],
          action: response.action,
          baseAction: action,
          chanceClass,
          postResponseChanceClass,
          response,
        }) || {};
        return {
          classKey: postResponseChanceClass.classKey,
          probabilityNumerator: postResponseChanceClass.numerator,
          probabilityDenominator: postResponseChanceClass.denominator,
          strictRollOutcome: stableGraphValue(postResponseChanceClass.strictRollOutcome),
          interval: outcomeInterval(classification.outcome),
          transitionAccepted: true,
          reason: String(classification.reason || ""),
          receiptHash: result.receipt?.receiptHash || "",
          resultStateHash: stableGraphHash(result.state),
          terminalEvents: stableGraphValue(terminalEvents(result.transition.events || [])),
        };
      });
      const postDenominator = postResponseExecution.chance.massDenominator;
      const postLowerNumerator = postResponseOutcomes.reduce((sum, entry) =>
        sum + entry.probabilityNumerator * entry.interval.lowerBound, 0);
      const postUpperNumerator = postResponseOutcomes.reduce((sum, entry) =>
        sum + entry.probabilityNumerator * entry.interval.upperBound, 0);
      const transitionAccepted = postResponseOutcomes.every((entry) =>
        entry.transitionAccepted === true);
      const complete = transitionAccepted &&
        postResponseExecution.chance.massNumerator === postDenominator &&
        postResponseOutcomes.every((entry) => entry.interval.complete === true);
      const postOutcomeKinds = new Set(postResponseOutcomes.map((entry) =>
        entry.interval.outcome));
      return {
        responseKey: response.responseKey,
        actionKey: response.action.actionKey,
        choice: response.choice,
        recipientPieceKey: response.recipientPieceKey,
        interval: {
          outcome: complete && postOutcomeKinds.size === 1
            ? postResponseOutcomes[0].interval.outcome
            : complete && postLowerNumerator === postUpperNumerator
              ? "exact_post_response_chance"
              : "unresolved",
          lowerBound: postLowerNumerator / postDenominator,
          upperBound: postUpperNumerator / postDenominator,
          complete,
        },
        transitionAccepted,
        reason: transitionAccepted
          ? ""
          : postResponseOutcomes.find((entry) => !entry.transitionAccepted)?.reason ||
            "strict_response_transition_rejected",
        receiptHash: postResponseOutcomes.length === 1
          ? postResponseOutcomes[0].receiptHash
          : "",
        receiptHashes: postResponseOutcomes.map((entry) => entry.receiptHash).filter(Boolean),
        postResponseChance: stableGraphValue(postResponseExecution.chance),
        postResponseOutcomes,
      };
    });
    return {
      chanceClassKey: chanceClass.classKey,
      probabilityNumerator: chanceClass.numerator,
      probabilityDenominator: chanceClass.denominator,
      strictRollOutcome: stableGraphValue(chanceClass.strictRollOutcome),
      strictActionPatch: warmachineExactChanceClassActionPatch(chanceClass),
      opponentDecisionKind: responseSet.decisionKind,
      opponentDecisionOwnerSideKey: responseSet.ownerSideKey,
      responseSetComplete: responseSet.responseSetComplete,
      responses: responseRows,
      interval: aggregateOwnedResponses(
        responseRows,
        responseSet.ownerSideKey,
        perspectiveSideKey,
      ),
    };
  });
  const denominator = chance.massDenominator;
  const lowerNumerator = chanceNodes.reduce((sum, node) =>
    sum + node.probabilityNumerator * node.interval.lowerBound, 0);
  const upperNumerator = chanceNodes.reduce((sum, node) =>
    sum + node.probabilityNumerator * node.interval.upperBound, 0);
  const chanceMassComplete = chance.massNumerator === denominator;
  const opponentResponseSetComplete = responseSet.responseSetComplete &&
    chanceNodes.every((node) => node.responseSetComplete && node.interval.complete);
  const exact = chanceMassComplete && opponentResponseSetComplete && lowerNumerator === upperNumerator;
  const core = {
    schemaVersion: WARMACHINE_STRICT_ACTION_PROBABILITY_AND_MIN_V2_SCHEMA,
    routeKey: String(rawOptions.routeKey || "strict-action-and-min"),
    actionKey: action.actionKey,
    perspectiveSideKey,
    exactComplete: exact,
    chanceMassComplete,
    opponentResponseSetComplete,
    chanceClassCount: chance.classCount,
    opponentResponseCount: responseSet.responses.length,
    opponentDecisionKind: responseSet.decisionKind,
    opponentDecisionOwnerSideKey: responseSet.ownerSideKey,
    quantifierContract: {
      actingAction: "fixed_or_or_selected_before_this_evaluator",
      chance: "exact_probability_mass_weighted_sum",
      opponentResponses: responseSet.ownerSideKey === perspectiveSideKey ? "owner_max" : "opponent_and_min",
    },
    probabilityInterval: {
      lowerNumerator,
      upperNumerator,
      denominator,
      lowerBound: lowerNumerator / denominator,
      upperBound: upperNumerator / denominator,
      exact,
    },
    chanceNodes,
    claimBoundary: "This finite DAG proves one selected strict attack or offensive spell only: exact retained dice mass is summed, and each complete defender-owned damage-transfer set is aggregated by AND/min. It does not prove a multi-action policy or global game optimality.",
  };
  return {
    ...core,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: chanceMassComplete && opponentResponseSetComplete &&
      chanceNodes.every((node) => node.responses.every((response) => response.transitionAccepted)),
  };
}
