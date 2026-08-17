import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { normalizeRulesV1State } from "../warmachine-host-runtime.mjs";
import {
  deriveWarmachineAdversarialContextKeyV1,
  mergeWarmachineAdversarialProbabilityFrontierV1,
} from "./adversarial-frontier-ledger-v1.mjs";
import { expandWarmachineStrictPolicyStepV1 } from "./strict-policy-step-v1.mjs";

export const WARMACHINE_STRICT_POLICY_FRONTIER_PROBABILITY_AND_MIN_V3_SCHEMA =
  "warmachine_strict_policy_frontier_probability_and_min_v3";

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
  if (bottom === 0n) throw new Error("frontier_policy_probability_denominator_zero");
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

function exactInterval(outcome) {
  if (outcome === "success") return { lower: rational(1n), upper: rational(1n), exact: true };
  if (outcome === "failure") return { lower: rational(0n), upper: rational(0n), exact: true };
  return { lower: rational(0n), upper: rational(1n), exact: false };
}

function intervalRecord(interval) {
  return {
    lowerBound: probabilityRecord(interval.lower),
    upperBound: probabilityRecord(interval.upper),
    exact: interval.exact === true && compare(interval.lower, interval.upper) === 0,
  };
}

function emptyMassVector() {
  return {
    success: rational(0n),
    failure: rational(0n),
    prunedLowProbability: rational(0n),
    unresolved: rational(0n),
  };
}

function terminalMassVector(status) {
  const result = emptyMassVector();
  if (status === "success") result.success = rational(1n);
  else if (status === "failure") result.failure = rational(1n);
  else if (status === "pruned_low_probability") result.prunedLowProbability = rational(1n);
  else result.unresolved = rational(1n);
  return result;
}

function addMassVectors(left, right) {
  const result = emptyMassVector();
  for (const key of Object.keys(result)) result[key] = add(left[key], right[key]);
  return result;
}

function scaleMassVector(vector, factor) {
  const result = emptyMassVector();
  for (const key of Object.keys(result)) result[key] = multiply(vector[key], factor);
  return result;
}

function massVectorRecord(vector) {
  const total = Object.values(vector).reduce(add, rational(0n));
  return {
    success: probabilityRecord(vector.success),
    failure: probabilityRecord(vector.failure),
    prunedLowProbability: probabilityRecord(vector.prunedLowProbability),
    unresolved: probabilityRecord(vector.unresolved),
    total: probabilityRecord(total),
    massConserved: compare(total, rational(1n)) === 0,
  };
}

function continuationKey(outcome, reason = "", terminalEvents = []) {
  const normalized = terminalOutcome(outcome);
  if (!normalized) return "continue";
  return `terminal-${stableGraphHash({
    outcome: normalized,
    reason: String(reason || ""),
    terminalEvents: stableGraphValue(terminalEvents || []),
  }, 32)}`;
}

function decisionQuantifier(responseSet, perspectiveSideKey) {
  if (Number(responseSet.responseCount || 0) <= 1 && !responseSet.ownerSideKey) {
    return "deterministic_singleton";
  }
  if (responseSet.ownerSideKey === perspectiveSideKey) return "owner_max";
  if (responseSet.ownerSideKey) return "opponent_and_min";
  return "deterministic_singleton";
}

function chooseResponse(rows, quantifier, bound) {
  const direction = quantifier === "owner_max" ? -1 : 1;
  return rows.slice().sort((left, right) => {
    const comparison = compare(left.result.interval[bound], right.result.interval[bound]);
    return direction * comparison || left.responseKey.localeCompare(right.responseKey);
  })[0];
}

export function evaluateWarmachineStrictPolicyFrontierProbabilityAndMinV3(
  initialStateInput = {},
  selectPolicyAction,
  rawOptions = {},
) {
  if (typeof selectPolicyAction !== "function") {
    throw new Error("strict_frontier_policy_selector_required");
  }
  const initialState = normalizeRulesV1State(initialStateInput);
  const perspectiveSideKey = String(rawOptions.perspectiveSideKey || initialState.activeSideKey || "");
  const routeKey = String(rawOptions.routeKey || "strict-frontier-policy");
  const maximumDepth = Math.max(0, Number(rawOptions.maximumDepth ?? 16));
  const maximumEvaluatedStates = Math.max(1, Number(rawOptions.maximumEvaluatedStates ?? 100_000));
  const lowProbabilityThreshold = String(rawOptions.lowProbabilityThreshold ?? "0");
  const rootContextKey = String(rawOptions.rootAdversarialContextKey || "adversarial-context-root");
  const initialDepth = Math.max(0, Number(rawOptions.initialDepth ?? 0));
  const initialContribution = rawOptions.initialCumulativeProbability || {
    numerator: "1",
    denominator: "1",
  };
  const classifyState = typeof rawOptions.classifyState === "function"
    ? rawOptions.classifyState
    : () => ({ outcome: "continue" });
  const classifyResult = typeof rawOptions.classifyResult === "function"
    ? rawOptions.classifyResult
    : undefined;
  const labels = new Map();
  const edges = new Map();
  const frontierAudits = [];
  const stepAudits = [];
  const unresolvedReasons = new Set();
  const runtimeReceiptByHash = new Map();
  let evaluatedStateCount = 0;
  let strictRejectedResponseEdgeCount = 0;
  let strictRejectedDeterministicEdgeCount = 0;
  let stateMergeCount = 0;

  const classifyRaw = (entry) => {
    if (terminalOutcome(entry.outcome) || !entry.state) return entry;
    const classified = classifyState({
      state: entry.state,
      stateHash: entry.stateHash,
      cursor: entry.cursor,
      depth: entry.depth,
    }) || {};
    const outcome = terminalOutcome(classified.outcome);
    if (!outcome) return entry;
    return {
      ...entry,
      outcome,
      reason: String(classified.reason || "classified_state_terminal"),
      continuationKey: continuationKey(
        outcome,
        classified.reason || "classified_state_terminal",
      ),
      thresholdEligible: false,
    };
  };

  let rawFrontier = [classifyRaw({
    state: initialState,
    stateHash: stableGraphHash(initialState),
    cursor: String(rawOptions.initialPolicyCursor ?? initialDepth),
    depth: initialDepth,
    adversarialContextKey: rootContextKey,
    continuationKey: String(rawOptions.initialContinuationKey || "continue"),
    contribution: initialContribution,
    incomingEdgeKey: "root",
    routeKey,
    outcome: "",
    reason: "",
    thresholdEligible: true,
  })];

  while (rawFrontier.length) {
    const rawByEdge = new Map(rawFrontier.map((entry) => [entry.incomingEdgeKey, entry]));
    const ledger = mergeWarmachineAdversarialProbabilityFrontierV1(rawFrontier, {
      lowProbabilityThreshold,
    });
    frontierAudits.push({
      depth: rawFrontier[0]?.depth ?? 0,
      ledgerHash: ledger.ledgerHash,
      inputEntryCount: ledger.inputEntryCount,
      mergedFrontierCount: ledger.mergedFrontierCount,
      mergedEntryCount: ledger.mergedEntryCount,
      inputMass: ledger.inputMass,
      groupedMass: ledger.groupedMass,
      massConserved: ledger.massConserved,
      expandedFrontierCount: ledger.expandedFrontierCount,
      prunedFrontierCount: ledger.prunedFrontierCount,
      bypassedThresholdFrontierCount: ledger.bypassedThresholdFrontierCount,
      adversarialContextCount: ledger.contextAudits.length,
      contextAuditHash: stableGraphHash(stableGraphValue(ledger.contextAudits)),
      massSemantics: "route_ledger_mass_not_probability_across_owner_choices",
    });
    stateMergeCount += ledger.mergedEntryCount;
    const nextRawFrontier = [];

    for (const row of ledger.frontier) {
      const incomingEntries = row.incoming.map((incoming) => rawByEdge.get(incoming.incomingEdgeKey));
      if (incomingEntries.some((entry) => !entry)) {
        throw new Error("frontier_incoming_entry_missing");
      }
      const representative = incomingEntries[0];
      for (const incoming of row.incoming) {
        if (incoming.incomingEdgeKey === "root") continue;
        const edge = edges.get(incoming.incomingEdgeKey);
        if (!edge) throw new Error("frontier_edge_missing_before_child_binding");
        edge.childLabelKey = row.frontierKey;
      }
      const label = {
        labelKey: row.frontierKey,
        depth: row.depth,
        stateHash: row.stateHash,
        cursor: row.cursor,
        adversarialContextKey: row.adversarialContextKey,
        continuationKey: row.continuationKey,
        cumulativeProbability: row.cumulativeProbability,
        incomingEdgeKeys: row.incoming.map((incoming) => incoming.incomingEdgeKey).sort(),
        incomingProbabilityContributions: row.incoming.map((incoming) => ({
          incomingEdgeKey: incoming.incomingEdgeKey,
          contribution: incoming.contribution,
          routeKey: incoming.routeKey,
        })).sort((left, right) => left.incomingEdgeKey.localeCompare(right.incomingEdgeKey)),
        status: "pending",
        reason: "",
        expansion: null,
        runtimeState: representative.state,
      };
      labels.set(label.labelKey, label);

      const preclassifiedOutcome = terminalOutcome(representative.outcome);
      if (preclassifiedOutcome) {
        label.status = preclassifiedOutcome;
        label.reason = representative.reason;
        if (preclassifiedOutcome === "unresolved") unresolvedReasons.add(label.reason);
        continue;
      }
      if (row.status === "pruned_low_probability") {
        label.status = "pruned_low_probability";
        label.reason = row.reason;
        continue;
      }
      if (label.depth >= maximumDepth) {
        label.status = "unresolved";
        label.reason = "maximum_policy_depth_reached";
        unresolvedReasons.add(label.reason);
        continue;
      }
      if (evaluatedStateCount >= maximumEvaluatedStates) {
        label.status = "unresolved";
        label.reason = "maximum_evaluated_states_reached";
        unresolvedReasons.add(label.reason);
        continue;
      }

      evaluatedStateCount += 1;
      const step = expandWarmachineStrictPolicyStepV1(
        representative.state,
        selectPolicyAction,
        {
          routeKey,
          perspectiveSideKey,
          depth: label.depth,
          cursor: label.cursor,
          classifyState,
          ...(classifyResult ? { classifyResult } : {}),
        },
      );
      strictRejectedResponseEdgeCount += step.strictRejectedResponseCount || 0;
      strictRejectedDeterministicEdgeCount += step.strictRejectedDeterministicCount || 0;
      stepAudits.push(stableGraphValue({
        labelKey: label.labelKey,
        stepType: step.stepType,
        action: step.action || null,
        chanceAudit: step.chanceAudit || null,
        responseSet: step.responseSet || null,
        strictRejectedResponseCount: step.strictRejectedResponseCount || 0,
        strictRejectedDeterministicCount: step.strictRejectedDeterministicCount || 0,
        reason: step.reason || "",
      }));
      if (step.stepType === "terminal" || step.stepType === "unresolved") {
        label.status = terminalOutcome(step.outcome) || "unresolved";
        label.reason = step.reason;
        if (label.status === "unresolved") unresolvedReasons.add(label.reason);
        continue;
      }

      label.status = "expanded";
      if (step.stepType === "deterministic") {
        const successor = step.successor;
        if (successor.receiptHash && successor.runtimeReceipt) {
          runtimeReceiptByHash.set(successor.receiptHash, successor.runtimeReceipt);
        }
        const edgeKey = `frontier-edge-${stableGraphHash({
          parentLabelKey: label.labelKey,
          actionKey: step.action.actionKey,
          edgeType: "deterministic_transition",
        }, 32)}`;
        edges.set(edgeKey, {
          edgeKey,
          edgeType: "deterministic_transition",
          parentLabelKey: label.labelKey,
          childLabelKey: "",
          actionKey: step.action.actionKey,
          receiptHash: successor.receiptHash,
          transitionAccepted: successor.transitionAccepted,
          conditionalProbability: probabilityRecord(rational(1n)),
        });
        label.expansion = { expansionType: "deterministic", edgeKey };
        nextRawFrontier.push(classifyRaw({
          state: successor.state,
          stateHash: successor.stateHash,
          cursor: successor.cursor,
          depth: label.depth + 1,
          adversarialContextKey: label.adversarialContextKey,
          continuationKey: continuationKey(
            successor.outcome,
            successor.reason,
            successor.terminalEvents,
          ),
          contribution: row.cumulativeProbability,
          incomingEdgeKey: edgeKey,
          routeKey,
          outcome: successor.outcome,
          reason: successor.reason,
          thresholdEligible: !terminalOutcome(successor.outcome),
        }));
        continue;
      }

      const quantifier = decisionQuantifier(step.responseSet, perspectiveSideKey);
      const expansionGroups = [];
      for (const group of step.groups) {
        const conditional = rational(group.numerator, group.denominator);
        const groupResponses = [];
        const responseNodeKey = `frontier-response-${stableGraphHash({
          parentLabelKey: label.labelKey,
          actionKey: step.action.actionKey,
          groupKey: group.groupKey,
        }, 32)}`;
        for (const response of group.responses) {
          for (const receipt of response.runtimeReceipts || []) {
            if (receipt?.receiptHash) runtimeReceiptByHash.set(receipt.receiptHash, receipt);
          }
          const nextContextKey = deriveWarmachineAdversarialContextKeyV1(
            label.adversarialContextKey,
            {
              quantifier,
              ownerSideKey: step.responseSet.ownerSideKey,
              decisionKind: step.responseSet.decisionKind,
              responseNodeKey,
              responseKey: response.responseKey,
            },
          );
          const edgeKey = `frontier-edge-${stableGraphHash({
            parentLabelKey: label.labelKey,
            groupKey: group.groupKey,
            responseKey: response.responseKey,
          }, 32)}`;
          edges.set(edgeKey, {
            edgeKey,
            edgeType: "chance_owned_response",
            parentLabelKey: label.labelKey,
            childLabelKey: "",
            actionKey: step.action.actionKey,
            adversarialChanceGroupKey: group.groupKey,
            chanceClassKeys: group.chanceClassKeys,
            responseKey: response.responseKey,
            choice: response.choice,
            recipientPieceKey: response.recipientPieceKey,
            quantifier,
            conditionalProbability: probabilityRecord(conditional),
            transitionAccepted: response.transitionAccepted,
            representativeReceiptHash: response.receiptHash,
            equivalentExecutionEvidence: response.equivalentExecutionEvidence,
          });
          const contribution = multiply(
            rational(row.cumulativeProbability.numerator, row.cumulativeProbability.denominator),
            conditional,
          );
          const outcome = response.transitionAccepted
            ? terminalOutcome(response.outcome)
            : "unresolved";
          const reason = response.transitionAccepted
            ? response.outcomeReason
            : response.reason || "strict_response_transition_rejected";
          const stateHash = response.transitionAccepted
            ? response.stateHash
            : `synthetic:${stableGraphHash({ labelKey: label.labelKey, groupKey: group.groupKey,
              responseKey: response.responseKey, reason })}`;
          nextRawFrontier.push(classifyRaw({
            state: response.state,
            stateHash,
            cursor: step.action.nextCursor,
            depth: label.depth + 1,
            adversarialContextKey: nextContextKey,
            continuationKey: continuationKey(outcome, reason, response.terminalEvents),
            contribution: probabilityRecord(contribution),
            incomingEdgeKey: edgeKey,
            routeKey,
            outcome,
            reason,
            thresholdEligible: !outcome,
          }));
          groupResponses.push({ responseKey: response.responseKey, edgeKey });
        }
        expansionGroups.push({
          groupKey: group.groupKey,
          chanceClassKeys: group.chanceClassKeys,
          classEvidence: group.classEvidence,
          conditionalProbability: probabilityRecord(conditional),
          responses: groupResponses,
        });
      }
      label.expansion = {
        expansionType: "chance",
        actionKey: step.action.actionKey,
        quantifier,
        responseSetComplete: step.responseSet.responseSetComplete,
        groups: expansionGroups,
      };
    }
    rawFrontier = nextRawFrontier;
  }

  const solved = new Map();
  const solveLabel = (labelKey) => {
    if (solved.has(labelKey)) return solved.get(labelKey);
    const label = labels.get(labelKey);
    if (!label) throw new Error(`frontier_policy_label_missing:${labelKey}`);
    let result;
    if (["success", "failure"].includes(label.status)) {
      result = {
        interval: exactInterval(label.status),
        lowerMass: terminalMassVector(label.status),
        upperMass: terminalMassVector(label.status),
      };
    } else if (label.status === "pruned_low_probability") {
      result = {
        interval: exactInterval("unresolved"),
        lowerMass: terminalMassVector("pruned_low_probability"),
        upperMass: terminalMassVector("pruned_low_probability"),
      };
    } else if (label.status !== "expanded" || !label.expansion) {
      result = {
        interval: exactInterval("unresolved"),
        lowerMass: terminalMassVector("unresolved"),
        upperMass: terminalMassVector("unresolved"),
      };
    } else if (label.expansion.expansionType === "deterministic") {
      const edge = edges.get(label.expansion.edgeKey);
      result = solveLabel(edge.childLabelKey);
    } else {
      let lower = rational(0n);
      let upper = rational(0n);
      let lowerMass = emptyMassVector();
      let upperMass = emptyMassVector();
      let exact = label.expansion.responseSetComplete === true;
      for (const group of label.expansion.groups) {
        const conditional = rational(
          group.conditionalProbability.numerator,
          group.conditionalProbability.denominator,
        );
        const responseRows = group.responses.map((response) => {
          const edge = edges.get(response.edgeKey);
          return {
            responseKey: response.responseKey,
            result: solveLabel(edge.childLabelKey),
          };
        });
        let selectedLower;
        let selectedUpper;
        if (!label.expansion.responseSetComplete || !responseRows.length) {
          const unresolved = {
            responseKey: "incomplete_response_set",
            result: {
              interval: exactInterval("unresolved"),
              lowerMass: terminalMassVector("unresolved"),
              upperMass: terminalMassVector("unresolved"),
            },
          };
          selectedLower = unresolved;
          selectedUpper = unresolved;
          exact = false;
        } else {
          selectedLower = chooseResponse(responseRows, label.expansion.quantifier, "lower");
          selectedUpper = chooseResponse(responseRows, label.expansion.quantifier, "upper");
          if (!selectedLower.result.interval.exact || !selectedUpper.result.interval.exact ||
              selectedLower.responseKey !== selectedUpper.responseKey) exact = false;
        }
        group.selectedLowerResponseKey = selectedLower.responseKey;
        group.selectedUpperResponseKey = selectedUpper.responseKey;
        lower = add(lower, multiply(conditional, selectedLower.result.interval.lower));
        upper = add(upper, multiply(conditional, selectedUpper.result.interval.upper));
        lowerMass = addMassVectors(
          lowerMass,
          scaleMassVector(selectedLower.result.lowerMass, conditional),
        );
        upperMass = addMassVectors(
          upperMass,
          scaleMassVector(selectedUpper.result.upperMass, conditional),
        );
      }
      result = {
        interval: { lower, upper, exact: exact && compare(lower, upper) === 0 },
        lowerMass,
        upperMass,
      };
    }
    solved.set(labelKey, result);
    label.interval = intervalRecord(result.interval);
    return result;
  };

  const rootLabel = Array.from(labels.values()).find((label) =>
    label.depth === initialDepth && label.incomingEdgeKeys.includes("root"));
  if (!rootLabel) throw new Error("strict_frontier_policy_root_label_missing");
  const root = solveLabel(rootLabel.labelKey);
  const lowerPolicyMass = massVectorRecord(root.lowerMass);
  const upperPolicyMass = massVectorRecord(root.upperMass);
  const publicLabels = Array.from(labels.values()).map(({ runtimeState: _state, ...label }) =>
    stableGraphValue(label)).sort((left, right) =>
    left.depth - right.depth || left.labelKey.localeCompare(right.labelKey));
  const publicEdges = Array.from(edges.values()).map(stableGraphValue).sort((left, right) =>
    left.edgeKey.localeCompare(right.edgeKey));
  const chanceMassComplete = stepAudits.filter((audit) => audit.stepType === "chance")
    .every((audit) => audit.chanceAudit?.exactComplete === true &&
      audit.chanceAudit?.equivalenceMassConserved === true);
  const opponentResponseSetComplete = stepAudits.filter((audit) => audit.stepType === "chance")
    .every((audit) => audit.responseSet?.responseSetComplete === true);
  const core = {
    schemaVersion: WARMACHINE_STRICT_POLICY_FRONTIER_PROBABILITY_AND_MIN_V3_SCHEMA,
    routeKey,
    perspectiveSideKey,
    rootStateHash: stableGraphHash(initialState),
    rootLabelKey: rootLabel.labelKey,
    initialDepth,
    initialCumulativeProbability: probabilityRecord(rational(
      initialContribution.numerator,
      initialContribution.denominator,
    )),
    lowProbabilityThreshold,
    maximumDepth,
    maximumEvaluatedStates,
    evaluatedStateCount,
    stateMergeCount,
    strictRejectedResponseEdgeCount,
    strictRejectedDeterministicEdgeCount,
    chanceMassComplete,
    opponentResponseSetComplete,
    probabilityInterval: intervalRecord(root.interval),
    lowerAdversarialPolicyMass: lowerPolicyMass,
    upperAdversarialPolicyMass: upperPolicyMass,
    exactComplete: root.interval.exact && chanceMassComplete && opponentResponseSetComplete,
    unresolvedReasons: Array.from(unresolvedReasons).sort(),
    frontierAudits: stableGraphValue(frontierAudits),
    stepAudits: stableGraphValue(stepAudits),
    labelCount: publicLabels.length,
    edgeCount: publicEdges.length,
    labels: publicLabels,
    edges: publicEdges,
    quantifierContract: {
      chance: "exact_conditional_probability_weighted_sum",
      ownerResponses: "owner_max",
      opponentResponses: "opponent_adversarial_and_min",
      threshold: "after_same_layer_state_cursor_continuation_and_adversarial_context_merge",
    },
    frontierMassSemantics: "A frontier audit sums route-label mass inside and across adversarial contexts for storage accounting, so it may exceed one. Only the lower/upper selected adversarial policy ledgers are probability measures and each must total one.",
    claimBoundary: "This finite layered stochastic-game evaluator expands only caller-fixed strict policy actions. It merges cumulative Chance mass before thresholding only within one canonical state, cursor, terminal suffix and adversarial response context. Different owner choices never add probability. Every pruned label, incoming edge, original roll class and strict receipt remains auditable; lower and upper adversarial policy ledgers each conserve success, failure, pruned and unresolved mass separately. No global strategy optimum is claimed.",
  };
  const report = {
    ...core,
    reportHash: stableGraphHash(stableGraphValue(core)),
    ok: chanceMassComplete && lowerPolicyMass.massConserved && upperPolicyMass.massConserved &&
      strictRejectedResponseEdgeCount === 0 && strictRejectedDeterministicEdgeCount === 0,
  };
  if (rawOptions.includeRuntimeCheckpoint !== true) return report;
  const stateEntries = Array.from(labels.values()).filter((label) => label.runtimeState).map((label) => ({
    labelKey: label.labelKey,
    depth: label.depth,
    stateHash: label.stateHash,
    cursor: label.cursor,
    adversarialContextKey: label.adversarialContextKey,
    continuationKey: label.continuationKey,
    cumulativeProbability: label.cumulativeProbability,
    incomingEdgeKeys: label.incomingEdgeKeys,
    status: label.status,
    reason: label.reason,
    state: label.runtimeState,
  })).sort((left, right) => left.depth - right.depth ||
    left.labelKey.localeCompare(right.labelKey));
  const receipts = Array.from(runtimeReceiptByHash.entries()).map(([receiptHash, receipt]) => ({
    receiptHash,
    receipt,
  })).sort((left, right) => left.receiptHash.localeCompare(right.receiptHash));
  const runtimeCore = {
    schemaVersion: "warmachine_strict_policy_frontier_runtime_checkpoint_v1",
    reportHash: report.reportHash,
    routeKey,
    stateEntryCount: stateEntries.length,
    receiptCount: receipts.length,
    resumableLabelKeys: stateEntries.filter((entry) => entry.status === "unresolved" &&
      ["maximum_evaluated_states_reached", "maximum_policy_depth_reached"]
        .includes(entry.reason)).map((entry) => entry.labelKey),
    stateEntries,
    receipts,
  };
  return {
    ...report,
    runtimeCheckpoint: {
      ...runtimeCore,
      checkpointHash: stableGraphHash(stableGraphValue({
        ...runtimeCore,
        stateEntries: stateEntries.map(({ state, ...entry }) => ({
          ...entry,
          stateHash: stableGraphHash(state),
        })),
        receipts: receipts.map(({ receiptHash }) => receiptHash),
      })),
    },
  };
}
