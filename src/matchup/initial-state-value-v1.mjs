import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_INITIAL_STATE_VALUE_V1_SCHEMA =
  "warmachine_initial_state_value_v1";

function clampProbability(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function interval(raw = {}) {
  const lowerBound = clampProbability(raw.lowerBound, 0);
  const upperBound = Math.max(lowerBound, clampProbability(raw.upperBound, 1));
  return {
    lowerBound,
    upperBound,
    exact: Math.abs(upperBound - lowerBound) <= 1e-12,
  };
}

function rationalMass(edge = {}) {
  if (Number.isFinite(Number(edge.probability))) return clampProbability(edge.probability, 0);
  const numerator = Number(edge.probabilityNumerator);
  const denominator = Number(edge.probabilityDenominator);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return clampProbability(numerator / denominator, 0);
}

function choose(rows = [], selector = Math.max) {
  if (!rows.length) return interval();
  return interval({
    lowerBound: selector(...rows.map((row) => row.lowerBound)),
    upperBound: selector(...rows.map((row) => row.upperBound)),
  });
}

export function solveWarmachineValueGraphV1(raw = {}) {
  const subjectTaskSideKey = String(raw.subjectTaskSideKey || "challenger");
  const nodes = new Map((raw.nodes || []).map((node) => [String(node.nodeId || ""), node]));
  const outgoing = new Map();
  for (const edge of raw.edges || []) {
    const fromNodeId = String(edge.fromNodeId || "");
    if (!outgoing.has(fromNodeId)) outgoing.set(fromNodeId, []);
    outgoing.get(fromNodeId).push(edge);
  }
  const memo = new Map();
  const visiting = new Set();
  const diagnostics = [];

  const solve = (nodeId) => {
    if (memo.has(nodeId)) return memo.get(nodeId);
    if (visiting.has(nodeId)) {
      const result = { ...interval(), status: "unresolved_cycle", nodeId };
      diagnostics.push({ nodeId, reason: "value_graph_cycle" });
      return result;
    }
    const node = nodes.get(nodeId);
    if (!node) {
      const result = { ...interval(), status: "unresolved_missing_node", nodeId };
      diagnostics.push({ nodeId, reason: "value_graph_node_missing" });
      return result;
    }
    visiting.add(nodeId);
    let result;
    if (node.nodeKind === "terminal") {
      const winnerTaskSideKey = String(node.winnerTaskSideKey || "");
      const value = winnerTaskSideKey === subjectTaskSideKey ? 1 : 0;
      result = { ...interval({ lowerBound: value, upperBound: value }), status: "terminal", nodeId };
    } else if (node.nodeKind === "unresolved") {
      result = { ...interval(node.interval || {}), status: "unresolved", nodeId };
    } else {
      const edges = (outgoing.get(nodeId) || []).slice()
        .sort((left, right) => String(left.edgeId || "").localeCompare(String(right.edgeId || "")));
      const childRows = edges.map((edge) => ({ edge, value: solve(String(edge.toNodeId || "")) }));
      if (node.nodeKind === "chance") {
        let knownMass = 0;
        let lowerBound = 0;
        let upperBound = 0;
        let massInvalid = false;
        for (const row of childRows) {
          const mass = rationalMass(row.edge);
          if (mass == null) {
            massInvalid = true;
            continue;
          }
          knownMass += mass;
          lowerBound += mass * row.value.lowerBound;
          upperBound += mass * row.value.upperBound;
        }
        if (knownMass > 1 + 1e-9) massInvalid = true;
        const unseenMass = Math.max(0, 1 - Math.min(1, knownMass));
        result = {
          ...interval({
            lowerBound: massInvalid ? 0 : lowerBound,
            upperBound: massInvalid ? 1 : upperBound + unseenMass,
          }),
          status: massInvalid
            ? "unresolved_invalid_chance_mass"
            : unseenMass > 1e-12 ? "unresolved_chance_mass" : "chance_solved",
          nodeId,
          knownChanceMass: massInvalid ? null : knownMass,
          unseenChanceMass: massInvalid ? null : unseenMass,
        };
        if (massInvalid) diagnostics.push({ nodeId, reason: "chance_mass_invalid" });
      } else {
        const controllerTaskSideKey = String(node.controllerTaskSideKey || "");
        const selected = controllerTaskSideKey === subjectTaskSideKey
          ? choose(childRows.map((row) => row.value), Math.max)
          : choose(childRows.map((row) => row.value), Math.min);
        result = {
          ...selected,
          status: controllerTaskSideKey === subjectTaskSideKey
            ? "subject_choice_solved"
            : "opponent_choice_solved",
          nodeId,
          alternativeCount: childRows.length,
        };
      }
    }
    visiting.delete(nodeId);
    memo.set(nodeId, result);
    return result;
  };

  const roots = (raw.rootNodeIds || []).map(String).filter(Boolean)
    .map((nodeId) => solve(nodeId));
  return {
    schemaVersion: "warmachine_value_graph_solution_v1",
    subjectTaskSideKey,
    roots,
    solvedNodeCount: memo.size,
    diagnostics: stableGraphValue(diagnostics),
    claimBoundary: "Controlled choices maximize the subject interval, opponent choices minimize it, Chance sums exact declared mass, and every missing node, cycle or unexpanded mass remains [0,1].",
  };
}

export function solveWarmachineInitialStateValuesV1(raw = {}) {
  const graphSolution = solveWarmachineValueGraphV1({
    subjectTaskSideKey: raw.subjectTaskSideKey,
    nodes: raw.nodes,
    edges: raw.edges,
    rootNodeIds: (raw.initialStates || []).map((state) => state.rootNodeId),
  });
  const valuesByRoot = new Map(graphSolution.roots.map((row) => [row.nodeId, row]));
  const rows = (raw.initialStates || []).map((state) => {
    const solved = valuesByRoot.get(String(state.rootNodeId || "")) || {
      ...interval(),
      status: "unresolved_root_missing",
    };
    const core = {
      schemaVersion: WARMACHINE_INITIAL_STATE_VALUE_V1_SCHEMA,
      initialStateKey: String(state.initialStateKey || ""),
      rootNodeId: String(state.rootNodeId || ""),
      lowerBound: solved.lowerBound,
      upperBound: solved.upperBound,
      exact: solved.exact,
      solveStatus: solved.status,
      strictOpeningStateHash: String(state.strictOpeningStateHash || ""),
      strictDeploymentReceiptHash: String(state.strictDeploymentReceiptHash || ""),
      strictOpening: Boolean(
        state.strictOpeningStateHash && state.strictDeploymentReceiptHash,
      ),
      policyEstimate: Number.isFinite(Number(state.policyEstimate))
        ? clampProbability(state.policyEstimate)
        : null,
      policyEstimateLabel: String(state.policyEstimateLabel || ""),
      policyEstimateIsNaturalWinRate: false,
      unresolvedProbabilityMass: Math.max(0, solved.upperBound - solved.lowerBound),
    };
    return { ...core, valueHash: stableGraphHash(core) };
  });
  const core = {
    schemaVersion: "warmachine_initial_state_value_set_v1",
    subjectTaskSideKey: graphSolution.subjectTaskSideKey,
    valueCount: rows.length,
    exactValueCount: rows.filter((row) => row.exact).length,
    strictOpeningValueCount: rows.filter((row) => row.strictOpening).length,
    unresolvedValueCount: rows.filter((row) => !row.exact).length,
    rows,
    graphDiagnostics: graphSolution.diagnostics,
    naturalWinRateClaimed: false,
    globalOptimalityProven: false,
    claimBoundary: "Each interval belongs to one exact declared initial-state address. A separately labelled policy estimate never narrows a strict game-theoretic interval and is not a natural win rate.",
  };
  return { ...core, valueSetHash: stableGraphHash(core) };
}
