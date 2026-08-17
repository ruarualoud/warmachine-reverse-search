import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_PROBABILITY_DAG_SCHEMA = "warmachine_probability_dag_v1";

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
  const sign = value.numerator < 0n ? "-" : "";
  const top = absolute(value.numerator);
  const whole = top / value.denominator;
  let remainder = top % value.denominator;
  if (remainder === 0n) return `${sign}${whole}`;
  let decimals = "";
  for (let index = 0; index < places && remainder !== 0n; index += 1) {
    remainder *= 10n;
    decimals += String(remainder / value.denominator);
    remainder %= value.denominator;
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

function parseThreshold(value = "0") {
  const text = String(value ?? "0").trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error("invalid_low_probability_threshold");
  const [whole, fractional = ""] = text.split(".");
  return rational(BigInt(`${whole}${fractional}`), 10n ** BigInt(fractional.length));
}

function outcomeProbability(outcome = {}) {
  const value = rational(outcome.numerator ?? 0, outcome.denominator ?? 1);
  if (value.numerator < 0n || compare(value, rational(1n, 1n)) > 0) {
    throw new Error("chance_outcome_probability_out_of_range");
  }
  return value;
}

function nodeIdentity(depth, stateKey) {
  return `prob-node-${stableGraphHash({ depth, stateKey }, 24)}`;
}

function terminalOutcome(value) {
  const normalized = String(value || "");
  return ["success", "failure", "unresolved"].includes(normalized) ? normalized : "";
}

export function buildWarmachineProbabilityDagV1(rootInput = {}, expandNode, rawOptions = {}) {
  if (typeof expandNode !== "function") throw new Error("probability_dag_expand_node_required");
  const threshold = parseThreshold(rawOptions.lowProbabilityThreshold ?? "0");
  const maximumUncertainMassForDecision = parseThreshold(
    rawOptions.maximumUncertainMassForDecision ?? "0",
  );
  const maximumDepth = Math.max(0, Number(rawOptions.maximumDepth ?? 64));
  const maximumExpandedNodes = Math.max(0, Number(rawOptions.maximumExpandedNodes ?? 100_000));
  const rootStateKey = String(rootInput.stateKey || "root");
  const rootNodeKey = nodeIdentity(0, rootStateKey);
  const nodeMap = new Map();
  const edgeRows = [];
  const localMassChecks = [];
  let frontier = [{
    nodeKey: rootNodeKey,
    stateKey: rootStateKey,
    depth: 0,
    payload: stableGraphValue(rootInput.payload ?? null),
    payloadHash: stableGraphHash(rootInput.payload ?? null),
    mass: rational(1n, 1n),
    outcome: terminalOutcome(rootInput.outcome),
    reason: String(rootInput.reason || ""),
    incomingEdgeKeys: [],
  }];
  let expandedNodeCount = 0;

  while (frontier.length) {
    const nextByNodeKey = new Map();
    for (const working of frontier.sort((left, right) => left.nodeKey.localeCompare(right.nodeKey))) {
      let status = "pending";
      let reason = working.reason;
      let expansion = null;
      if (working.outcome) {
        status = working.outcome;
      } else if (working.depth >= maximumDepth) {
        status = "unresolved";
        reason = "maximum_depth_reached";
      } else if (compare(working.mass, threshold) < 0) {
        status = "pruned_low_probability";
        reason = "cumulative_probability_below_declared_threshold";
      } else if (expandedNodeCount >= maximumExpandedNodes) {
        status = "unresolved";
        reason = "maximum_expanded_nodes_reached";
      } else {
        expansion = expandNode({
          nodeKey: working.nodeKey,
          stateKey: working.stateKey,
          depth: working.depth,
          payload: stableGraphValue(working.payload),
          cumulativeProbability: probabilityRecord(working.mass),
        }) || { nodeType: "unresolved", reason: "empty_expansion" };
        expandedNodeCount += 1;
        if (expansion.nodeType === "terminal") {
          status = terminalOutcome(expansion.outcome) || "unresolved";
          reason = String(expansion.reason || "");
        } else if (expansion.nodeType === "unresolved") {
          status = "unresolved";
          reason = String(expansion.reason || "unsupported_probability_expansion");
        } else if (expansion.nodeType !== "chance") {
          throw new Error("probability_dag_expansion_must_be_chance_or_terminal");
        }
      }

      const node = {
        nodeKey: working.nodeKey,
        stateKey: working.stateKey,
        depth: working.depth,
        payload: stableGraphValue(working.payload),
        payloadHash: working.payloadHash,
        cumulativeProbability: probabilityRecord(working.mass),
        incomingEdgeKeys: working.incomingEdgeKeys.slice().sort(),
        status,
        reason,
        chanceEventKey: expansion?.nodeType === "chance"
          ? String(expansion.chanceEventKey || working.nodeKey)
          : "",
      };
      nodeMap.set(node.nodeKey, node);
      if (expansion?.nodeType !== "chance") continue;

      const outcomes = Array.isArray(expansion.outcomes) ? expansion.outcomes : [];
      if (!outcomes.length) throw new Error("chance_expansion_requires_outcomes");
      let localMass = rational(0n, 1n);
      const prepared = outcomes.map((outcome, outcomeIndex) => {
        const conditional = outcomeProbability(outcome);
        localMass = add(localMass, conditional);
        return { outcome, outcomeIndex, conditional };
      });
      const localMassConserved = compare(localMass, rational(1n, 1n)) === 0;
      localMassChecks.push({
        nodeKey: node.nodeKey,
        chanceEventKey: node.chanceEventKey,
        outcomeCount: prepared.length,
        outcomeMass: probabilityRecord(localMass),
        massConserved: localMassConserved,
      });
      if (!localMassConserved) throw new Error("chance_outcome_mass_not_conserved");
      node.status = "expanded";

      for (const { outcome, outcomeIndex, conditional } of prepared) {
        const childStateKey = String(outcome.stateKey ||
          `${working.stateKey}:${String(outcome.outcomeKey || outcomeIndex)}`);
        const childNodeKey = nodeIdentity(working.depth + 1, childStateKey);
        const contribution = multiply(working.mass, conditional);
        const edgeCore = {
          parentNodeKey: node.nodeKey,
          childNodeKey,
          chanceEventKey: node.chanceEventKey,
          outcomeKey: String(outcome.outcomeKey || outcomeIndex),
          conditionalProbability: probabilityRecord(conditional),
          contributedCumulativeProbability: probabilityRecord(contribution),
          evidence: stableGraphValue(outcome.evidence ?? null),
        };
        const edgeKey = `prob-edge-${stableGraphHash({ ...edgeCore, outcomeIndex }, 24)}`;
        edgeRows.push({ edgeKey, ...edgeCore });
        const payload = stableGraphValue(outcome.payload ?? null);
        const payloadHash = stableGraphHash(payload);
        const existing = nextByNodeKey.get(childNodeKey);
        if (existing) {
          if (existing.payloadHash !== payloadHash || existing.outcome !== terminalOutcome(outcome.outcome)) {
            throw new Error("merged_probability_state_payload_mismatch");
          }
          existing.mass = add(existing.mass, contribution);
          existing.incomingEdgeKeys.push(edgeKey);
        } else {
          nextByNodeKey.set(childNodeKey, {
            nodeKey: childNodeKey,
            stateKey: childStateKey,
            depth: working.depth + 1,
            payload,
            payloadHash,
            mass: contribution,
            outcome: terminalOutcome(outcome.outcome),
            reason: String(outcome.reason || ""),
            incomingEdgeKeys: [edgeKey],
          });
        }
      }
    }
    frontier = Array.from(nextByNodeKey.values());
  }

  const massByStatus = {
    success: rational(0n, 1n),
    failure: rational(0n, 1n),
    pruned_low_probability: rational(0n, 1n),
    unresolved: rational(0n, 1n),
  };
  for (const node of nodeMap.values()) {
    if (!(node.status in massByStatus)) continue;
    const value = rational(
      BigInt(node.cumulativeProbability.numerator),
      BigInt(node.cumulativeProbability.denominator),
    );
    massByStatus[node.status] = add(massByStatus[node.status], value);
  }
  const finalMass = Object.values(massByStatus).reduce(add, rational(0n, 1n));
  const successUpperBound = add(
    massByStatus.success,
    add(massByStatus.pruned_low_probability, massByStatus.unresolved),
  );
  const uncertainMass = add(massByStatus.pruned_low_probability, massByStatus.unresolved);
  const nodes = Array.from(nodeMap.values()).sort((left, right) =>
    left.depth - right.depth || left.nodeKey.localeCompare(right.nodeKey));
  const edges = edgeRows.sort((left, right) => left.edgeKey.localeCompare(right.edgeKey));
  const core = {
    schemaVersion: WARMACHINE_PROBABILITY_DAG_SCHEMA,
    rootNodeKey,
    lowProbabilityThreshold: probabilityRecord(threshold),
    maximumUncertainMassForDecision: probabilityRecord(maximumUncertainMassForDecision),
    maximumDepth,
    maximumExpandedNodes,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    expandedNodeCount,
    nodes,
    edges,
    localMassChecks,
    finalMass: {
      success: probabilityRecord(massByStatus.success),
      failure: probabilityRecord(massByStatus.failure),
      prunedLowProbability: probabilityRecord(massByStatus.pruned_low_probability),
      unresolved: probabilityRecord(massByStatus.unresolved),
      total: probabilityRecord(finalMass),
      massConserved: compare(finalMass, rational(1n, 1n)) === 0,
      successProbabilityInterval: {
        lowerBound: probabilityRecord(massByStatus.success),
        upperBound: probabilityRecord(successUpperBound),
        exact: compare(successUpperBound, massByStatus.success) === 0,
      },
      uncertain: probabilityRecord(uncertainMass),
      decisionReady: compare(uncertainMass, maximumUncertainMassForDecision) <= 0,
    },
    claimBoundary: "Low-probability branches stop expanding only after same-depth equivalent states merge. Their nodes, incoming edges and probability mass remain in the DAG. Opponent choices are not chance events and must be aggregated separately as adversarial AND/min unless an explicit response distribution is supplied.",
  };
  return {
    ...core,
    probabilityDagHash: stableGraphHash(core),
    ok: core.finalMass.massConserved && localMassChecks.every((row) => row.massConserved),
  };
}
