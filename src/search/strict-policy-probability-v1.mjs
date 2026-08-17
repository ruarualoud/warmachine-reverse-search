import {
  enumerateWarmachineBenchmarkActionsV2,
  executeScopedWarmachineBenchmarkActionV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { normalizeRulesV1State } from "../warmachine-host-runtime.mjs";
import { buildWarmachineExactActionChanceClasses } from "./chance-outcomes-v1.mjs";
import { buildWarmachineProbabilityDagV1 } from "./probability-dag-v1.mjs";

export const WARMACHINE_STRICT_POLICY_PROBABILITY_SCHEMA =
  "warmachine_strict_policy_probability_v1";

function terminalOutcome(value) {
  const normalized = String(value || "");
  return ["success", "failure", "unresolved"].includes(normalized) ? normalized : "";
}

function terminalEvents(events = []) {
  return events.filter((event) => event.eventType === "terminal");
}

export function evaluateWarmachineStrictPolicyProbabilityV1(
  initialStateInput = {},
  selectPolicyAction,
  rawOptions = {},
) {
  if (typeof selectPolicyAction !== "function") {
    throw new Error("strict_probability_policy_selector_required");
  }
  const initialState = normalizeRulesV1State(initialStateInput);
  const rootStateHash = stableGraphHash(initialState);
  const rootStateKey = `strict-state:${rootStateHash}`;
  const stateByKey = new Map([[rootStateKey, initialState]]);
  const chanceAudits = [];
  const classifyResult = typeof rawOptions.classifyResult === "function"
    ? rawOptions.classifyResult
    : ({ events }) => {
      const terminal = terminalEvents(events)[0];
      if (!terminal) return { outcome: "continue" };
      return {
        outcome: terminal.winnerSideKey === rawOptions.successWinnerSideKey ? "success" : "failure",
        reason: String(terminal.reason || "terminal"),
      };
    };

  const dag = buildWarmachineProbabilityDagV1(
    { stateKey: rootStateKey, payload: { stateHash: rootStateHash } },
    ({ stateKey, depth }) => {
      const state = stateByKey.get(stateKey);
      if (!state) return { nodeType: "unresolved", reason: "strict_state_payload_missing" };
      const decision = selectPolicyAction({ state, stateKey, depth }) || {};
      if (decision.nodeType === "terminal" || terminalOutcome(decision.outcome)) {
        return {
          nodeType: "terminal",
          outcome: terminalOutcome(decision.outcome) || "unresolved",
          reason: String(decision.reason || "policy_terminal"),
        };
      }
      const scoped = decision.scoped || enumerateWarmachineBenchmarkActionsV2(
        state,
        decision.enumerationScope || {},
      );
      const action = decision.action || scoped.enumeration.actions.find((candidate) =>
        candidate.actionKey === decision.actionKey);
      if (!action) {
        return { nodeType: "unresolved", reason: "policy_action_not_in_strict_legal_space" };
      }
      const model = buildWarmachineExactActionChanceClasses(action, { state: scoped.state });
      chanceAudits.push({
        stateKey,
        depth,
        actionKey: action.actionKey,
        exactComplete: model.exactComplete,
        classCount: model.classCount || 0,
        massNumerator: model.massNumerator || 0,
        massDenominator: model.massDenominator || 0,
        reasons: model.reasons || [],
      });
      if (!model.exactComplete) {
        return {
          nodeType: "unresolved",
          reason: `exact_chance_not_closed:${(model.reasons || []).join(",")}`,
        };
      }
      return {
        nodeType: "chance",
        chanceEventKey: `${stateKey}:${action.actionKey}`,
        outcomes: model.classes.map((chanceClass) => {
          const result = executeScopedWarmachineBenchmarkActionV2(
            scoped,
            action,
            { actionKey: action.actionKey },
            {
              routeKey: `${rawOptions.routeKey || "strict-policy-probability"}:${depth}:${chanceClass.classKey}`,
              actionPatch: {
                ...(decision.actionPatch || {}),
                strictRollOutcome: chanceClass.strictRollOutcome,
              },
            },
          );
          if (!result.ok) {
            return {
              outcomeKey: chanceClass.classKey,
              numerator: chanceClass.numerator,
              denominator: chanceClass.denominator,
              stateKey: `${stateKey}:strict-reject:${chanceClass.classKey}`,
              outcome: "unresolved",
              reason: result.reason || "strict_chance_transition_rejected",
              payload: { transitionAccepted: false },
              evidence: {
                actionKey: action.actionKey,
                chanceClassKey: chanceClass.classKey,
                receiptHash: result.receipt?.receiptHash || "",
                transitionAccepted: false,
                reason: result.reason || "strict_chance_transition_rejected",
              },
            };
          }
          const resultStateHash = stableGraphHash(result.state);
          const classification = classifyResult({
            state: result.state,
            events: result.transition.events || [],
            action,
            chanceClass,
            depth,
          }) || { outcome: "continue" };
          const outcome = terminalOutcome(classification.outcome);
          const childStateKey = `strict-state:${resultStateHash}:${String(decision.nextPolicyCursor || depth + 1)}`;
          if (!outcome) stateByKey.set(childStateKey, result.state);
          return {
            outcomeKey: chanceClass.classKey,
            numerator: chanceClass.numerator,
            denominator: chanceClass.denominator,
            stateKey: childStateKey,
            ...(outcome ? { outcome } : {}),
            reason: String(classification.reason || ""),
            payload: {
              stateHash: resultStateHash,
              classification: outcome || "continue",
            },
            evidence: {
              actionKey: action.actionKey,
              chanceClassKey: chanceClass.classKey,
              strictRollOutcome: stableGraphValue(chanceClass.strictRollOutcome),
              receiptHash: result.receipt?.receiptHash || "",
              resultStateHash,
              transitionAccepted: true,
              terminalEvents: stableGraphValue(terminalEvents(result.transition.events || [])),
            },
          };
        }),
      };
    },
    rawOptions,
  );
  const core = {
    schemaVersion: WARMACHINE_STRICT_POLICY_PROBABILITY_SCHEMA,
    routeKey: String(rawOptions.routeKey || "strict-policy-probability"),
    rootStateHash,
    probabilityDagHash: dag.probabilityDagHash,
    chanceAudits: stableGraphValue(chanceAudits),
    finalMass: dag.finalMass,
    strictRejectedChanceEdgeCount: dag.edges.filter((edge) =>
      edge.evidence?.transitionAccepted === false).length,
    claimBoundary: "Every reported probability edge is an exact dice equivalence class applied through the shared rules-v1 strict executor. Unsupported special-rule chance remains unresolved; low-probability pruning changes expansion only and remains inside the final success interval.",
  };
  return {
    ...core,
    strictPolicyProbabilityHash: stableGraphHash(core),
    ok: dag.ok && core.strictRejectedChanceEdgeCount === 0,
    dag,
  };
}
