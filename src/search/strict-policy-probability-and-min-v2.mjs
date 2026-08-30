import {
  enumerateWarmachineBenchmarkActionsV2,
  executeScopedWarmachineBenchmarkActionV2,
} from "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { normalizeRulesV1State } from "../warmachine-host-runtime.mjs";
import {
  buildWarmachineExactActionChanceClasses,
  warmachineExactChanceClassActionPatch,
} from "./chance-outcomes-v1.mjs";
import { groupWarmachineAdversarialChanceClassesV1 } from
  "./adversarial-chance-equivalence-v1.mjs";
import {
  buildWarmachineOpponentResponseSetV1,
  canonicalWarmachineActingSideActionsV1,
} from "./opponent-response-v1.mjs";
import { executeWarmachineExactPostResponseChanceV1 } from
  "./post-response-chance-execution-v1.mjs";

export const WARMACHINE_STRICT_POLICY_PROBABILITY_AND_MIN_V2_SCHEMA =
  "warmachine_strict_policy_probability_and_min_v2";

function absolute(value) {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(left, right) {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function rational(numerator = 0n, denominator = 1n) {
  let top = typeof numerator === "bigint" ? numerator : BigInt(numerator);
  let bottom = typeof denominator === "bigint" ? denominator : BigInt(denominator);
  if (bottom === 0n) throw new Error("probability_denominator_must_be_nonzero");
  if (bottom < 0n) {
    top = -top;
    bottom = -bottom;
  }
  const divisor = greatestCommonDivisor(top, bottom);
  return { numerator: top / divisor, denominator: bottom / divisor };
}

function add(left, right) {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiply(left, right) {
  return rational(left.numerator * right.numerator, left.denominator * right.denominator);
}

function compare(left, right) {
  const delta = left.numerator * right.denominator - right.numerator * left.denominator;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

function decimalString(value, places = 12) {
  const normalized = rational(value.numerator, value.denominator);
  const sign = normalized.numerator < 0n ? "-" : "";
  const top = absolute(normalized.numerator);
  const whole = top / normalized.denominator;
  let remainder = top % normalized.denominator;
  if (remainder === 0n) return `${sign}${whole}`;
  let decimals = "";
  for (let index = 0; index < places && remainder !== 0n; index += 1) {
    remainder *= 10n;
    decimals += String(remainder / normalized.denominator);
    remainder %= normalized.denominator;
  }
  return `${sign}${whole}.${decimals}`;
}

function probabilityRecord(value) {
  const normalized = rational(value.numerator, value.denominator);
  return {
    numerator: String(normalized.numerator),
    denominator: String(normalized.denominator),
    decimal: decimalString(normalized),
  };
}

function terminalOutcome(value) {
  const normalized = String(value || "");
  return ["success", "failure", "unresolved"].includes(normalized) ? normalized : "";
}

function terminalEvents(events = []) {
  return events.filter((event) => event.eventType === "terminal");
}

function exactOutcomeInterval(outcome = "unresolved") {
  if (outcome === "success") {
    return { lower: rational(1n), upper: rational(1n), exact: true };
  }
  if (outcome === "failure") {
    return { lower: rational(0n), upper: rational(0n), exact: true };
  }
  return { lower: rational(0n), upper: rational(1n), exact: false };
}

function intervalRecord(interval) {
  return {
    lowerBound: probabilityRecord(interval.lower),
    upperBound: probabilityRecord(interval.upper),
    exact: interval.exact === true && compare(interval.lower, interval.upper) === 0,
  };
}

function aggregateResponseIntervals(rows, ownerSideKey, perspectiveSideKey, responseSetComplete) {
  if (!rows.length) {
    return {
      interval: exactOutcomeInterval("unresolved"),
      quantifier: "missing_response_set",
      selectedLowerResponseKey: "",
      selectedUpperResponseKey: "",
      complete: false,
    };
  }
  const maximize = Boolean(ownerSideKey && ownerSideKey === perspectiveSideKey);
  const minimize = Boolean(ownerSideKey && ownerSideKey !== perspectiveSideKey);
  const lowerRows = rows.slice().sort((left, right) => {
    const order = compare(left.interval.lower, right.interval.lower);
    return (maximize ? -order : order) || left.responseKey.localeCompare(right.responseKey);
  });
  const upperRows = rows.slice().sort((left, right) => {
    const order = compare(left.interval.upper, right.interval.upper);
    return (maximize ? -order : order) || left.responseKey.localeCompare(right.responseKey);
  });
  const selectedLower = lowerRows[0];
  const selectedUpper = upperRows[0];
  const complete = responseSetComplete === true && rows.every((row) =>
    row.transitionAccepted === true && row.interval.exact === true);
  return {
    interval: {
      lower: selectedLower.interval.lower,
      upper: selectedUpper.interval.upper,
      exact: complete && compare(selectedLower.interval.lower, selectedUpper.interval.upper) === 0,
    },
    quantifier: maximize ? "owner_max" : minimize ? "opponent_and_min" : "deterministic_singleton",
    selectedLowerResponseKey: selectedLower.responseKey,
    selectedUpperResponseKey: selectedUpper.responseKey,
    complete,
  };
}

function graphNodeKey(kind, identity) {
  return `${kind}-${stableGraphHash(identity, 24)}`;
}

function zeroThreshold(value) {
  return /^0+(?:\.0+)?$/.test(String(value ?? "0").trim());
}

export function evaluateWarmachineStrictPolicyProbabilityAndMinV2(
  initialStateInput = {},
  selectPolicyAction,
  rawOptions = {},
) {
  if (typeof selectPolicyAction !== "function") {
    throw new Error("strict_probability_and_min_policy_selector_required");
  }
  if (!zeroThreshold(rawOptions.lowProbabilityThreshold)) {
    throw new Error("strict_probability_and_min_nonzero_threshold_requires_frontier_merge");
  }

  const initialState = normalizeRulesV1State(initialStateInput);
  const perspectiveSideKey = String(rawOptions.perspectiveSideKey || initialState.activeSideKey || "");
  const routeKey = String(rawOptions.routeKey || "strict-policy-probability-and-min");
  const maximumDepth = Math.max(0, Number(rawOptions.maximumDepth ?? 16));
  const maximumEvaluatedStates = Math.max(1, Number(rawOptions.maximumEvaluatedStates ?? 100_000));
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

  const nodeMap = new Map();
  const edges = [];
  const chanceAudits = [];
  const responseAudits = [];
  const deterministicTransitionAudits = [];
  const adversarialChanceEquivalenceAudits = [];
  const unresolvedReasons = new Set();
  const solvedByStateCursor = new Map();
  const activeStateCursors = new Set();
  let evaluatedStateCount = 0;
  let stateMergeCount = 0;
  let strictRejectedResponseEdgeCount = 0;
  let strictRejectedDeterministicEdgeCount = 0;

  const registerNode = (node) => {
    const existing = nodeMap.get(node.nodeKey);
    if (existing) {
      const incoming = new Set([
        ...(existing.incomingChancePathProbabilities || []),
        ...(node.incomingChancePathProbabilities || []),
      ].map((entry) => JSON.stringify(entry)));
      existing.incomingChancePathProbabilities = Array.from(incoming)
        .map((entry) => JSON.parse(entry))
        .sort((left, right) => left.numerator.localeCompare(right.numerator) ||
          left.denominator.localeCompare(right.denominator));
      return existing;
    }
    nodeMap.set(node.nodeKey, node);
    return node;
  };

  const addEdge = (edge) => {
    const edgeKey = `policy-edge-${stableGraphHash({ ...edge, edgeIndex: edges.length }, 24)}`;
    edges.push({ edgeKey, ...stableGraphValue(edge) });
    return edgeKey;
  };

  const terminalResult = ({ outcome, reason, stateHash, cursor, depth, cumulativeProbability }) => {
    const normalizedOutcome = terminalOutcome(outcome) || "unresolved";
    if (normalizedOutcome === "unresolved") unresolvedReasons.add(String(reason || "unresolved"));
    const interval = exactOutcomeInterval(normalizedOutcome);
    const nodeKey = graphNodeKey("terminal", {
      stateHash,
      cursor,
      depth,
      outcome: normalizedOutcome,
      reason: String(reason || ""),
    });
    registerNode({
      nodeKey,
      nodeType: "terminal",
      stateHash,
      cursor,
      depth,
      outcome: normalizedOutcome,
      reason: String(reason || ""),
      interval: intervalRecord(interval),
      incomingChancePathProbabilities: [probabilityRecord(cumulativeProbability)],
    });
    return { nodeKey, interval, exactComplete: interval.exact };
  };

  const solve = (stateInput, cursorInput, depth, cumulativeProbability) => {
    const state = normalizeRulesV1State(stateInput);
    const stateHash = stableGraphHash(state);
    const cursor = String(cursorInput ?? depth);
    const stateCursorKey = `${depth}:${cursor}:${stateHash}`;
    const classifiedState = classifyState({ state, stateHash, cursor, depth }) || {};
    const classifiedOutcome = terminalOutcome(classifiedState.outcome);
    if (classifiedOutcome) {
      return terminalResult({
        outcome: classifiedOutcome,
        reason: classifiedState.reason || "classified_state_terminal",
        stateHash,
        cursor,
        depth,
        cumulativeProbability,
      });
    }
    if (depth >= maximumDepth) {
      return terminalResult({
        outcome: "unresolved",
        reason: "maximum_policy_depth_reached",
        stateHash,
        cursor,
        depth,
        cumulativeProbability,
      });
    }
    const memoized = solvedByStateCursor.get(stateCursorKey);
    if (memoized) {
      stateMergeCount += 1;
      registerNode({
        ...nodeMap.get(memoized.nodeKey),
        incomingChancePathProbabilities: [probabilityRecord(cumulativeProbability)],
      });
      return memoized;
    }
    if (activeStateCursors.has(stateCursorKey)) {
      return terminalResult({
        outcome: "unresolved",
        reason: "policy_state_cycle_detected",
        stateHash,
        cursor,
        depth,
        cumulativeProbability,
      });
    }
    if (evaluatedStateCount >= maximumEvaluatedStates) {
      return terminalResult({
        outcome: "unresolved",
        reason: "maximum_evaluated_states_reached",
        stateHash,
        cursor,
        depth,
        cumulativeProbability,
      });
    }

    evaluatedStateCount += 1;
    activeStateCursors.add(stateCursorKey);
    const decision = selectPolicyAction({ state, stateHash, cursor, depth }) || {};
    const policyOutcome = terminalOutcome(decision.outcome);
    if (decision.nodeType === "terminal" || policyOutcome) {
      activeStateCursors.delete(stateCursorKey);
      const result = terminalResult({
        outcome: policyOutcome || "unresolved",
        reason: decision.reason || "policy_terminal",
        stateHash,
        cursor,
        depth,
        cumulativeProbability,
      });
      solvedByStateCursor.set(stateCursorKey, result);
      return result;
    }

    const scoped = decision.scoped || enumerateWarmachineBenchmarkActionsV2(
      state,
      decision.enumerationScope || {},
    );
    const canonicalActions = canonicalWarmachineActingSideActionsV1(scoped.enumeration);
    const action = decision.action || canonicalActions.find((candidate) =>
      candidate.actionKey === decision.actionKey) || null;
    if (!action || !canonicalActions.some((candidate) => candidate.actionKey === action.actionKey)) {
      activeStateCursors.delete(stateCursorKey);
      const result = terminalResult({
        outcome: "unresolved",
        reason: "policy_action_not_in_canonical_strict_legal_space",
        stateHash,
        cursor,
        depth,
        cumulativeProbability,
      });
      solvedByStateCursor.set(stateCursorKey, result);
      return result;
    }

    const policyNodeKey = graphNodeKey("policy", { stateHash, cursor, depth });
    registerNode({
      nodeKey: policyNodeKey,
      nodeType: "policy",
      stateHash,
      cursor,
      depth,
      actionKey: action.actionKey,
      incomingChancePathProbabilities: [probabilityRecord(cumulativeProbability)],
    });
    if (decision.deterministicAction === true) {
      if (action.metadata?.attackResolution) {
        activeStateCursors.delete(stateCursorKey);
        const child = terminalResult({
          outcome: "unresolved",
          reason: "declared_deterministic_action_has_attack_resolution",
          stateHash,
          cursor,
          depth: depth + 1,
          cumulativeProbability,
        });
        addEdge({
          edgeType: "unresolved_deterministic_action",
          parentNodeKey: policyNodeKey,
          childNodeKey: child.nodeKey,
          actionKey: action.actionKey,
          cumulativeChanceProbability: probabilityRecord(cumulativeProbability),
        });
        nodeMap.get(policyNodeKey).interval = intervalRecord(child.interval);
        const result = { nodeKey: policyNodeKey, interval: child.interval, exactComplete: false };
        solvedByStateCursor.set(stateCursorKey, result);
        return result;
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
      const unexpectedReactionRequirements = executed.receipt?.reactionRequirements || [];
      if (!executed.ok || unexpectedReactionRequirements.length) {
        if (!executed.ok) strictRejectedDeterministicEdgeCount += 1;
        activeStateCursors.delete(stateCursorKey);
        const reason = !executed.ok
          ? executed.reason || "strict_deterministic_transition_rejected"
          : "declared_deterministic_action_has_opponent_reaction_requirements";
        const child = terminalResult({
          outcome: "unresolved",
          reason,
          stateHash,
          cursor,
          depth: depth + 1,
          cumulativeProbability,
        });
        deterministicTransitionAudits.push({
          policyNodeKey,
          actionKey: action.actionKey,
          transitionAccepted: executed.ok === true,
          reactionRequirementCount: unexpectedReactionRequirements.length,
          reason,
          receiptHash: executed.receipt?.receiptHash || "",
        });
        addEdge({
          edgeType: "deterministic_transition",
          parentNodeKey: policyNodeKey,
          childNodeKey: child.nodeKey,
          actionKey: action.actionKey,
          transitionAccepted: executed.ok === true,
          reactionRequirementCount: unexpectedReactionRequirements.length,
          reason,
          receiptHash: executed.receipt?.receiptHash || "",
          cumulativeChanceProbability: probabilityRecord(cumulativeProbability),
        });
        nodeMap.get(policyNodeKey).interval = intervalRecord(child.interval);
        const result = { nodeKey: policyNodeKey, interval: child.interval, exactComplete: false };
        solvedByStateCursor.set(stateCursorKey, result);
        return result;
      }

      const classification = classifyResult({
        state: executed.state,
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
      const nextCursor = String(decision.nextPolicyCursor ?? depth + 1);
      const child = outcome
        ? terminalResult({
          outcome,
          reason: classification.reason || "classified_deterministic_terminal",
          stateHash: stableGraphHash(executed.state),
          cursor: nextCursor,
          depth: depth + 1,
          cumulativeProbability,
        })
        : solve(executed.state, nextCursor, depth + 1, cumulativeProbability);
      deterministicTransitionAudits.push({
        policyNodeKey,
        actionKey: action.actionKey,
        transitionAccepted: true,
        reactionRequirementCount: 0,
        reason: "",
        receiptHash: executed.receipt?.receiptHash || "",
        resultStateHash: stableGraphHash(executed.state),
      });
      addEdge({
        edgeType: "deterministic_transition",
        parentNodeKey: policyNodeKey,
        childNodeKey: child.nodeKey,
        actionKey: action.actionKey,
        transitionAccepted: true,
        reactionRequirementCount: 0,
        receiptHash: executed.receipt?.receiptHash || "",
        resultStateHash: stableGraphHash(executed.state),
        cumulativeChanceProbability: probabilityRecord(cumulativeProbability),
        terminalEvents: stableGraphValue(terminalEvents(executed.transition.events || [])),
      });
      nodeMap.get(policyNodeKey).interval = intervalRecord(child.interval);
      activeStateCursors.delete(stateCursorKey);
      const result = {
        nodeKey: policyNodeKey,
        interval: child.interval,
        exactComplete: child.exactComplete,
      };
      solvedByStateCursor.set(stateCursorKey, result);
      return result;
    }
    const chance = buildWarmachineExactActionChanceClasses(action, { state: scoped.state });
    const chanceAudit = {
      policyNodeKey,
      stateHash,
      cursor,
      depth,
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
    chanceAudits.push(chanceAudit);
    if (!chance.exactComplete) {
      activeStateCursors.delete(stateCursorKey);
      const reason = `exact_chance_not_closed:${(chance.reasons || []).join(",")}`;
      const child = terminalResult({
        outcome: "unresolved",
        reason,
        stateHash,
        cursor,
        depth: depth + 1,
        cumulativeProbability,
      });
      addEdge({
        edgeType: "unresolved_action",
        parentNodeKey: policyNodeKey,
        childNodeKey: child.nodeKey,
        actionKey: action.actionKey,
        cumulativeChanceProbability: probabilityRecord(cumulativeProbability),
      });
      nodeMap.get(policyNodeKey).interval = intervalRecord(child.interval);
      const result = { nodeKey: policyNodeKey, interval: child.interval, exactComplete: false };
      solvedByStateCursor.set(stateCursorKey, result);
      return result;
    }

    const responseSet = buildWarmachineOpponentResponseSetV1(action, scoped.enumeration);
    const chanceNodeKey = graphNodeKey("chance", {
      stateHash,
      cursor,
      depth,
      actionKey: action.actionKey,
    });
    registerNode({
      nodeKey: chanceNodeKey,
      nodeType: "chance",
      stateHash,
      cursor,
      depth,
      actionKey: action.actionKey,
      classCount: chance.classCount,
      denominator: String(chance.massDenominator),
      incomingChancePathProbabilities: [probabilityRecord(cumulativeProbability)],
    });
    addEdge({
      edgeType: "policy_action",
      parentNodeKey: policyNodeKey,
      childNodeKey: chanceNodeKey,
      actionKey: action.actionKey,
      cumulativeChanceProbability: probabilityRecord(cumulativeProbability),
    });

    const nextCursor = String(decision.nextPolicyCursor ?? depth + 1);
    const preparedChanceClasses = [];
    for (const chanceClass of chance.classes) {
      const preparedResponses = [];
      for (const response of responseSet.responses) {
        if (!response.action) {
          preparedResponses.push({
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
          preparedResponses.push({
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
            strictRejectedResponseEdgeCount += 1;
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
              terminalEvents: stableGraphValue(terminalEvents(executed.transition.events || [])),
              executedState: null,
              strictRollOutcome: stableGraphValue(postResponseChanceClass.strictRollOutcome),
            };
          }
          const classification = classifyResult({
            state: executed.state,
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
            resultStateHash: stableGraphHash(executed.state),
            outcome: terminalOutcome(classification.outcome) || "continue",
            outcomeReason: String(classification.reason || ""),
            receiptHash: executed.receipt?.receiptHash || "",
            terminalEvents: stableGraphValue(terminalEvents(executed.transition.events || [])),
            executedState: executed.state,
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
        preparedResponses.push({
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
          terminalEvents: [],
          executedState: postResponseOutcomes.length === 1
            ? postResponseOutcomes[0].executedState
            : null,
          postResponseChanceExactComplete: true,
          postResponseChance: stableGraphValue(postResponseExecution.chance),
          postResponseOutcomes,
        });
      }
      preparedChanceClasses.push({ chanceClass, responses: preparedResponses });
    }

    const equivalence = groupWarmachineAdversarialChanceClassesV1(
      preparedChanceClasses,
      {
        ownerSideKey: responseSet.ownerSideKey,
        decisionKind: responseSet.decisionKind,
        responseSetComplete: responseSet.responseSetComplete,
      },
    );
    if (!equivalence.ok) throw new Error("adversarial_chance_equivalence_mass_not_conserved");
    const equivalenceAudit = {
      schemaVersion: equivalence.schemaVersion,
      policyNodeKey,
      chanceNodeKey,
      actionKey: action.actionKey,
      equivalenceHash: equivalence.equivalenceHash,
      inputClassCount: equivalence.inputClassCount,
      equivalenceGroupCount: equivalence.equivalenceGroupCount,
      mergedClassCount: equivalence.mergedClassCount,
      denominator: equivalence.denominator,
      inputMassNumerator: equivalence.inputMassNumerator,
      groupedMassNumerator: equivalence.groupedMassNumerator,
      massConserved: equivalence.massConserved,
      groups: equivalence.groups.map((group) => ({
        groupKey: group.groupKey,
        signatureHash: group.signatureHash,
        numerator: group.numerator,
        denominator: group.denominator,
        classCount: group.classCount,
        chanceClassKeys: group.chanceClassKeys,
        classEvidence: group.classEvidence,
      })),
    };
    adversarialChanceEquivalenceAudits.push(equivalenceAudit);
    Object.assign(chanceAudit, {
      equivalenceHash: equivalence.equivalenceHash,
      equivalenceGroupCount: equivalence.equivalenceGroupCount,
      mergedClassCount: equivalence.mergedClassCount,
      equivalenceMassConserved: equivalence.massConserved,
    });
    Object.assign(nodeMap.get(chanceNodeKey), {
      equivalenceGroupCount: equivalence.equivalenceGroupCount,
      mergedClassCount: equivalence.mergedClassCount,
    });

    let chanceLower = rational(0n);
    let chanceUpper = rational(0n);
    let localChanceMass = rational(0n);
    let chanceExact = true;
    for (const group of equivalence.groups) {
      const conditional = rational(group.numerator, group.denominator);
      const childCumulativeProbability = multiply(cumulativeProbability, conditional);
      localChanceMass = add(localChanceMass, conditional);
      const responseNodeKey = graphNodeKey("response", {
        stateHash,
        cursor,
        depth,
        actionKey: action.actionKey,
        adversarialChanceGroupKey: group.groupKey,
      });
      registerNode({
        nodeKey: responseNodeKey,
        nodeType: "opponent_response",
        stateHash,
        cursor,
        depth,
        actionKey: action.actionKey,
        adversarialChanceGroupKey: group.groupKey,
        chanceClassKeys: group.chanceClassKeys,
        classCount: group.classCount,
        ownerSideKey: responseSet.ownerSideKey,
        decisionKind: responseSet.decisionKind,
        responseSetComplete: responseSet.responseSetComplete,
        conditionalProbability: probabilityRecord(conditional),
        cumulativeChanceProbability: probabilityRecord(childCumulativeProbability),
        incomingChancePathProbabilities: [probabilityRecord(childCumulativeProbability)],
      });
      for (const prepared of group.classes) {
        const classConditional = rational(
          prepared.chanceClass.numerator,
          prepared.chanceClass.denominator,
        );
        addEdge({
          edgeType: "chance_outcome",
          parentNodeKey: chanceNodeKey,
          childNodeKey: responseNodeKey,
          actionKey: action.actionKey,
          chanceClassKey: prepared.chanceClass.classKey,
          adversarialChanceGroupKey: group.groupKey,
          conditionalProbability: probabilityRecord(classConditional),
          contributedGroupProbability: probabilityRecord(conditional),
          cumulativeChanceProbability: probabilityRecord(
            multiply(cumulativeProbability, classConditional),
          ),
          strictRollOutcome: stableGraphValue(prepared.chanceClass.strictRollOutcome),
          strictActionPatch: warmachineExactChanceClassActionPatch(prepared.chanceClass),
        });
      }

      const responseRows = [];
      for (const preparedResponse of group.representative.responses) {
        const equivalentExecutionEvidence = group.classes.map((prepared) => {
          const response = prepared.responses.find((candidate) =>
            candidate.responseKey === preparedResponse.responseKey);
          return {
            chanceClassKey: prepared.chanceClass.classKey,
            responseKey: response?.responseKey || preparedResponse.responseKey,
            actionKey: response?.actionKey || preparedResponse.actionKey,
            receiptHash: response?.receiptHash || "",
            transitionAccepted: response?.transitionAccepted === true,
            resultStateHash: response?.resultStateHash || "",
            reason: response?.reason || "",
            postResponseOutcomeEvidence: (response?.postResponseOutcomes || []).map((outcome) => ({
              classKey: outcome.classKey,
              receiptHash: outcome.receiptHash,
              transitionAccepted: outcome.transitionAccepted,
              resultStateHash: outcome.resultStateHash,
              reason: outcome.reason,
            })),
          };
        }).sort((left, right) => left.chanceClassKey.localeCompare(right.chanceClassKey));
        const postChanceNodeKey = graphNodeKey("post_response_chance", {
          stateHash,
          cursor,
          depth,
          actionKey: action.actionKey,
          adversarialChanceGroupKey: group.groupKey,
          responseKey: preparedResponse.responseKey,
        });
        registerNode({
          nodeKey: postChanceNodeKey,
          nodeType: "post_response_chance",
          stateHash,
          cursor: nextCursor,
          depth: depth + 1,
          actionKey: action.actionKey,
          adversarialChanceGroupKey: group.groupKey,
          responseKey: preparedResponse.responseKey,
          responseChoice: preparedResponse.choice,
          recipientPieceKey: preparedResponse.recipientPieceKey,
          classCount: preparedResponse.postResponseOutcomes?.length || 0,
          responsePrecedesChance: true,
          incomingChancePathProbabilities: [probabilityRecord(childCumulativeProbability)],
        });
        addEdge({
          edgeType: "owned_response",
          parentNodeKey: responseNodeKey,
          childNodeKey: postChanceNodeKey,
          adversarialChanceGroupKey: group.groupKey,
          chanceClassKeys: group.chanceClassKeys,
          responseKey: preparedResponse.responseKey,
          actionKey: preparedResponse.actionKey,
          choice: preparedResponse.choice,
          recipientPieceKey: preparedResponse.recipientPieceKey,
          transitionAccepted: preparedResponse.transitionAccepted,
          reason: preparedResponse.reason,
          equivalentExecutionEvidence,
          cumulativeChanceProbability: probabilityRecord(childCumulativeProbability),
          ownedResponsePrecedesPostResponseChance: true,
        });

        let responseLower = rational(0n);
        let responseUpper = rational(0n);
        let postResponseMass = rational(0n);
        let responseExact = preparedResponse.transitionAccepted &&
          preparedResponse.postResponseChanceExactComplete !== false;
        let representativeChildNodeKey = "";
        const postResponseOutcomes = preparedResponse.postResponseOutcomes?.length
          ? preparedResponse.postResponseOutcomes
          : [{
              classKey: "post-response-unresolved",
              probabilityNumerator: 1,
              probabilityDenominator: 1,
              transitionAccepted: false,
              reason: preparedResponse.reason || "strict_response_transition_rejected",
              resultStateHash: stateHash,
              outcome: "unresolved",
              outcomeReason: preparedResponse.reason || "strict_response_transition_rejected",
              receiptHash: preparedResponse.receiptHash,
              terminalEvents: preparedResponse.terminalEvents,
              executedState: null,
            }];
        for (const postResponseOutcome of postResponseOutcomes) {
          const postConditional = rational(
            postResponseOutcome.probabilityNumerator,
            postResponseOutcome.probabilityDenominator,
          );
          postResponseMass = add(postResponseMass, postConditional);
          const branchCumulativeProbability = multiply(
            childCumulativeProbability,
            postConditional,
          );
          let child;
          if (!postResponseOutcome.transitionAccepted) {
            child = terminalResult({
              outcome: "unresolved",
              reason: postResponseOutcome.reason || "strict_response_transition_rejected",
              stateHash,
              cursor: nextCursor,
              depth: depth + 1,
              cumulativeProbability: branchCumulativeProbability,
            });
          } else {
            const outcome = terminalOutcome(postResponseOutcome.outcome);
            child = outcome
              ? terminalResult({
                  outcome,
                  reason: postResponseOutcome.outcomeReason || "classified_transition_terminal",
                  stateHash: postResponseOutcome.resultStateHash,
                  cursor: nextCursor,
                  depth: depth + 1,
                  cumulativeProbability: branchCumulativeProbability,
                })
              : solve(
                  postResponseOutcome.executedState,
                  nextCursor,
                  depth + 1,
                  branchCumulativeProbability,
                );
          }
          representativeChildNodeKey ||= child.nodeKey;
          responseLower = add(responseLower, multiply(postConditional, child.interval.lower));
          responseUpper = add(responseUpper, multiply(postConditional, child.interval.upper));
          if (!child.interval.exact) responseExact = false;
          addEdge({
            edgeType: "post_response_chance_outcome",
            parentNodeKey: postChanceNodeKey,
            childNodeKey: child.nodeKey,
            responseKey: preparedResponse.responseKey,
            actionKey: preparedResponse.actionKey,
            postResponseChanceClassKey: postResponseOutcome.classKey,
            conditionalProbability: probabilityRecord(postConditional),
            cumulativeChanceProbability: probabilityRecord(branchCumulativeProbability),
            transitionAccepted: postResponseOutcome.transitionAccepted,
            reason: postResponseOutcome.reason,
            receiptHash: postResponseOutcome.receiptHash,
            resultStateHash: postResponseOutcome.resultStateHash,
            terminalEvents: postResponseOutcome.terminalEvents,
            strictRollOutcome: postResponseOutcome.strictRollOutcome,
          });
        }
        const postResponseMassConserved = compare(postResponseMass, rational(1n)) === 0;
        if (!postResponseMassConserved) responseExact = false;
        const responseInterval = {
          lower: responseLower,
          upper: responseUpper,
          exact: responseExact && compare(responseLower, responseUpper) === 0,
        };
        Object.assign(nodeMap.get(postChanceNodeKey), {
          localChanceMass: probabilityRecord(postResponseMass),
          localChanceMassConserved: postResponseMassConserved,
          interval: intervalRecord(responseInterval),
        });
        responseRows.push({
          responseKey: preparedResponse.responseKey,
          choice: preparedResponse.choice,
          recipientPieceKey: preparedResponse.recipientPieceKey,
          interval: responseInterval,
          transitionAccepted: preparedResponse.transitionAccepted,
          childNodeKey: postChanceNodeKey,
          representativeChildNodeKey,
        });
      }

      const aggregated = aggregateResponseIntervals(
        responseRows,
        responseSet.ownerSideKey,
        perspectiveSideKey,
        responseSet.responseSetComplete,
      );
      responseAudits.push({
        responseNodeKey,
        actionKey: action.actionKey,
        adversarialChanceGroupKey: group.groupKey,
        chanceClassKeys: group.chanceClassKeys,
        classCount: group.classCount,
        ownerSideKey: responseSet.ownerSideKey,
        decisionKind: responseSet.decisionKind,
        responseSetComplete: responseSet.responseSetComplete,
        postResponseChanceComplete: responseRows.every((row) => row.interval.exact),
        responseCount: responseRows.length,
        quantifier: aggregated.quantifier,
        selectedLowerResponseKey: aggregated.selectedLowerResponseKey,
        selectedUpperResponseKey: aggregated.selectedUpperResponseKey,
        interval: intervalRecord(aggregated.interval),
      });
      Object.assign(nodeMap.get(responseNodeKey), {
        quantifier: aggregated.quantifier,
        selectedLowerResponseKey: aggregated.selectedLowerResponseKey,
        selectedUpperResponseKey: aggregated.selectedUpperResponseKey,
        interval: intervalRecord(aggregated.interval),
      });
      chanceLower = add(chanceLower, multiply(conditional, aggregated.interval.lower));
      chanceUpper = add(chanceUpper, multiply(conditional, aggregated.interval.upper));
      if (!aggregated.complete || !aggregated.interval.exact) chanceExact = false;
    }

    const localMassConserved = compare(localChanceMass, rational(1n)) === 0;
    const interval = {
      lower: chanceLower,
      upper: chanceUpper,
      exact: chanceExact && localMassConserved && compare(chanceLower, chanceUpper) === 0,
    };
    Object.assign(nodeMap.get(chanceNodeKey), {
      localChanceMass: probabilityRecord(localChanceMass),
      localChanceMassConserved: localMassConserved,
      interval: intervalRecord(interval),
    });
    Object.assign(nodeMap.get(policyNodeKey), { interval: intervalRecord(interval) });
    activeStateCursors.delete(stateCursorKey);
    const result = { nodeKey: policyNodeKey, interval, exactComplete: interval.exact };
    solvedByStateCursor.set(stateCursorKey, result);
    return result;
  };

  const root = solve(initialState, rawOptions.initialPolicyCursor ?? 0, 0, rational(1n));
  const nodes = Array.from(nodeMap.values()).sort((left, right) =>
    left.depth - right.depth || left.nodeKey.localeCompare(right.nodeKey));
  const sortedEdges = edges.slice().sort((left, right) => left.edgeKey.localeCompare(right.edgeKey));
  const chanceMassComplete = chanceAudits.every((audit) =>
    audit.exactComplete === true && audit.massNumerator === audit.massDenominator) &&
    nodes.filter((node) => ["chance", "post_response_chance"].includes(node.nodeType)).every((node) =>
      node.localChanceMassConserved === true);
  const opponentResponseSetComplete = responseAudits.every((audit) =>
    audit.responseSetComplete === true && audit.postResponseChanceComplete === true);
  const core = {
    schemaVersion: WARMACHINE_STRICT_POLICY_PROBABILITY_AND_MIN_V2_SCHEMA,
    routeKey,
    perspectiveSideKey,
    rootStateHash: stableGraphHash(initialState),
    rootNodeKey: root.nodeKey,
    exactComplete: root.interval.exact && chanceMassComplete && opponentResponseSetComplete,
    chanceMassComplete,
    opponentResponseSetComplete,
    probabilityInterval: intervalRecord(root.interval),
    maximumDepth,
    maximumEvaluatedStates,
    evaluatedStateCount,
    stateMergeCount,
    nodeCount: nodes.length,
    edgeCount: sortedEdges.length,
    strictRejectedResponseEdgeCount,
    strictRejectedDeterministicEdgeCount,
    unresolvedReasons: Array.from(unresolvedReasons).sort(),
    chanceAudits: stableGraphValue(chanceAudits),
    adversarialChanceEquivalenceAudits: stableGraphValue(
      adversarialChanceEquivalenceAudits,
    ),
    responseAudits: stableGraphValue(responseAudits),
    deterministicTransitionAudits: stableGraphValue(deterministicTransitionAudits),
    nodes,
    edges: sortedEdges,
    quantifierContract: {
      policyActions: "fixed_by_caller_before_each_chance_node",
      chance: "exact_conditional_probability_weighted_sum",
      ownerResponses: "owner_max",
      opponentResponses: "opponent_adversarial_and_min",
      postResponseChance: "exact_conditional_probability_weighted_sum_after_owned_response",
    },
    capabilityBoundary: {
      multiActionPolicy: true,
      callerDeclaredDeterministicStrictActions: true,
      exactPrimaryAttackChance: true,
      opponentOwnedDamageTransfer: true,
      exactPostTransferDamageLocationChance: true,
      sameDepthStateAndCursorMemoization: true,
      adversarialResponseVectorEquivalence: true,
      nonzeroLowProbabilityThreshold: false,
    },
    claimBoundary: "This finite stochastic-game DAG evaluates one caller-fixed multi-action policy. Exact primary-attack Chance nodes are summed, defender-owned choices are AND/min before exact post-response transferred-damage location Chance, strict receipts bind every executed nested outcome edge, complete identical owner-aware response distributions reuse one continuation, and same-depth equivalent state/cursor pairs reuse one conditional evaluation. Nonzero low-probability pruning remains fail-closed until an adversarial-context-aware same-depth frontier merge is implemented; no global strategy optimality is claimed.",
  };
  return {
    ...core,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: chanceMassComplete && strictRejectedResponseEdgeCount === 0 &&
      strictRejectedDeterministicEdgeCount === 0,
  };
}
