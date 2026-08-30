import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_GOAL_CONDITIONED_STRATEGY_QUOTIENT_V1_SCHEMA =
  "warmachine_goal_conditioned_strategy_quotient_v1";

function absolute(value) {
  return value < 0n ? -value : value;
}

function gcd(left, right) {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function lcm(left, right) {
  if (left === 0n || right === 0n) return 0n;
  return absolute((left / gcd(left, right)) * right);
}

function rational(numerator = 0n, denominator = 1n, fieldName = "rational") {
  let top;
  let bottom;
  try {
    top = typeof numerator === "bigint" ? numerator : BigInt(numerator);
    bottom = typeof denominator === "bigint" ? denominator : BigInt(denominator);
  } catch {
    throw new Error(`${fieldName}_invalid`);
  }
  if (bottom === 0n) throw new Error(`${fieldName}_denominator_zero`);
  if (bottom < 0n) {
    top = -top;
    bottom = -bottom;
  }
  const divisor = gcd(top, bottom);
  return { numerator: top / divisor, denominator: bottom / divisor };
}

function add(left, right) {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiply(left, right) {
  return rational(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function compare(left, right) {
  const delta = left.numerator * right.denominator -
    right.numerator * left.denominator;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

function rationalRecord(value) {
  const normalized = rational(value.numerator, value.denominator);
  return {
    numerator: String(normalized.numerator),
    denominator: String(normalized.denominator),
  };
}

const ZERO = rational(0n);
const ONE = rational(1n);

function objectiveVector(raw, objectiveKeys, fieldName, defaultZero = false) {
  const source = raw && typeof raw === "object" ? raw : {};
  const vector = {};
  for (const key of objectiveKeys) {
    if (!(key in source) && !defaultZero) {
      throw new Error(`${fieldName}_objective_missing:${key}`);
    }
    const value = source[key] ?? { numerator: 0, denominator: 1 };
    vector[key] = rational(
      value?.numerator ?? value,
      value?.denominator ?? 1,
      `${fieldName}.${key}`,
    );
  }
  return vector;
}

function addVectors(left, right, objectiveKeys) {
  return Object.fromEntries(objectiveKeys.map((key) => [key, add(left[key], right[key])]));
}

function weightedVector(distribution, vectorsByState, objectiveKeys) {
  const result = Object.fromEntries(objectiveKeys.map((key) => [key, ZERO]));
  for (const outcome of distribution) {
    const vector = vectorsByState(outcome.stateKey);
    for (const key of objectiveKeys) {
      result[key] = add(result[key], multiply(outcome.probability, vector[key]));
    }
  }
  return result;
}

function componentwiseAtLeast(left, right, objectiveKeys) {
  return objectiveKeys.every((key) => compare(left[key], right[key]) >= 0);
}

function vectorRecord(vector, objectiveKeys) {
  return Object.fromEntries(objectiveKeys.map((key) => [key, rationalRecord(vector[key])]));
}

function normalizeDistribution(rawOutcomes, stateByKey, fieldName) {
  if (!Array.isArray(rawOutcomes) || rawOutcomes.length === 0) {
    throw new Error(`${fieldName}_outcomes_required`);
  }
  const massByState = new Map();
  let total = ZERO;
  for (const [index, raw] of rawOutcomes.entries()) {
    const stateKey = String(raw.stateKey || "");
    if (!stateByKey.has(stateKey)) {
      throw new Error(`${fieldName}_unknown_successor:${stateKey}`);
    }
    const probability = rational(
      raw.numerator ?? raw.probability?.numerator ?? 0,
      raw.denominator ?? raw.probability?.denominator ?? 1,
      `${fieldName}.${index}.probability`,
    );
    if (probability.numerator <= 0n) {
      throw new Error(`${fieldName}_probability_must_be_positive:${index}`);
    }
    total = add(total, probability);
    massByState.set(stateKey, add(massByState.get(stateKey) || ZERO, probability));
  }
  if (compare(total, ONE) !== 0) throw new Error(`${fieldName}_mass_not_one`);
  return Array.from(massByState, ([stateKey, probability]) => ({ stateKey, probability }))
    .sort((left, right) => left.stateKey.localeCompare(right.stateKey));
}

function pairKey(leftStateKey, rightStateKey) {
  return `${leftStateKey}\u0000${rightStateKey}`;
}

function exactDistributionLift(left, right, relation) {
  const denominators = [...left, ...right].map((row) => row.probability.denominator);
  const commonDenominator = denominators.reduce((value, next) => lcm(value, next), 1n);
  const leftMass = left.map((row) => ({
    ...row,
    mass: row.probability.numerator * (commonDenominator / row.probability.denominator),
  }));
  const rightMass = right.map((row) => ({
    ...row,
    mass: row.probability.numerator * (commonDenominator / row.probability.denominator),
  }));
  const total = leftMass.reduce((sum, row) => sum + row.mass, 0n);
  if (rightMass.reduce((sum, row) => sum + row.mass, 0n) !== total) {
    return { ok: false, coupling: [] };
  }

  const source = 0;
  const leftOffset = 1;
  const rightOffset = leftOffset + leftMass.length;
  const sink = rightOffset + rightMass.length;
  const graph = Array.from({ length: sink + 1 }, () => []);
  function addEdge(from, to, capacity, metadata = null) {
    const forward = { to, reverse: graph[to].length, capacity, original: capacity, metadata };
    const backward = { to: from, reverse: graph[from].length, capacity: 0n, original: 0n, metadata: null };
    graph[from].push(forward);
    graph[to].push(backward);
  }
  leftMass.forEach((row, index) => addEdge(source, leftOffset + index, row.mass));
  rightMass.forEach((row, index) => addEdge(rightOffset + index, sink, row.mass));
  leftMass.forEach((leftRow, leftIndex) => {
    rightMass.forEach((rightRow, rightIndex) => {
      if (relation.has(pairKey(leftRow.stateKey, rightRow.stateKey))) {
        addEdge(
          leftOffset + leftIndex,
          rightOffset + rightIndex,
          total,
          { leftStateKey: leftRow.stateKey, rightStateKey: rightRow.stateKey },
        );
      }
    });
  });

  let flow = 0n;
  while (flow < total) {
    const parent = Array(sink + 1).fill(null);
    const queue = [source];
    parent[source] = { from: -1, edgeIndex: -1 };
    for (let cursor = 0; cursor < queue.length && parent[sink] === null; cursor += 1) {
      const from = queue[cursor];
      for (let edgeIndex = 0; edgeIndex < graph[from].length; edgeIndex += 1) {
        const edge = graph[from][edgeIndex];
        if (edge.capacity > 0n && parent[edge.to] === null) {
          parent[edge.to] = { from, edgeIndex };
          queue.push(edge.to);
          if (edge.to === sink) break;
        }
      }
    }
    if (parent[sink] === null) break;
    let increment = total - flow;
    for (let node = sink; node !== source;) {
      const step = parent[node];
      increment = increment < graph[step.from][step.edgeIndex].capacity
        ? increment
        : graph[step.from][step.edgeIndex].capacity;
      node = step.from;
    }
    for (let node = sink; node !== source;) {
      const step = parent[node];
      const edge = graph[step.from][step.edgeIndex];
      edge.capacity -= increment;
      graph[node][edge.reverse].capacity += increment;
      node = step.from;
    }
    flow += increment;
  }

  const coupling = [];
  for (let leftIndex = 0; leftIndex < leftMass.length; leftIndex += 1) {
    for (const edge of graph[leftOffset + leftIndex]) {
      if (!edge.metadata || edge.original <= edge.capacity) continue;
      coupling.push({
        ...edge.metadata,
        mass: rationalRecord(rational(edge.original - edge.capacity, commonDenominator)),
      });
    }
  }
  return { ok: flow === total, coupling };
}

function normalizeGame(raw) {
  const objectiveKeys = [...new Set((raw.objectiveKeys || []).map(String))].filter(Boolean);
  if (!objectiveKeys.length) throw new Error("strategy_quotient_objective_keys_required");
  const rawStates = Array.isArray(raw.states) ? raw.states : [];
  if (!rawStates.length) throw new Error("strategy_quotient_states_required");
  const stateByKey = new Map();
  for (const rawState of rawStates) {
    const stateKey = String(rawState.stateKey || "");
    if (!stateKey || stateByKey.has(stateKey)) {
      throw new Error(`strategy_quotient_state_key_invalid:${stateKey}`);
    }
    const owner = String(rawState.owner || "");
    if (!["max", "min", "chance", "terminal"].includes(owner)) {
      throw new Error(`strategy_quotient_owner_invalid:${stateKey}`);
    }
    const remainingPly = Number(rawState.remainingPly);
    if (!Number.isInteger(remainingPly) || remainingPly < 0) {
      throw new Error(`strategy_quotient_remaining_ply_invalid:${stateKey}`);
    }
    stateByKey.set(stateKey, {
      stateKey,
      owner,
      remainingPly,
      comparisonKey: String(rawState.comparisonKey || "default"),
      informationKey: String(rawState.informationKey || "public"),
      strategyContextKey: String(rawState.strategyContextKey || ""),
      raw: rawState,
    });
  }

  for (const state of stateByKey.values()) {
    const fieldName = `strategy_quotient_state.${state.stateKey}`;
    if (state.owner === "terminal") {
      state.terminalVector = objectiveVector(
        state.raw.terminalVector,
        objectiveKeys,
        `${fieldName}.terminalVector`,
      );
      state.actions = [];
      state.distribution = [];
      continue;
    }
    if (state.remainingPly === 0) {
      throw new Error(`${fieldName}_nonterminal_at_zero_ply`);
    }
    if (state.owner === "chance") {
      state.distribution = normalizeDistribution(
        state.raw.outcomes,
        stateByKey,
        `${fieldName}.chance`,
      );
      state.actions = [];
    } else {
      const rawActions = Array.isArray(state.raw.actions) ? state.raw.actions : [];
      if (!rawActions.length) throw new Error(`${fieldName}_actions_required`);
      const actionKeys = new Set();
      state.actions = rawActions.map((rawAction, index) => {
        const actionKey = String(rawAction.actionKey || "");
        if (!actionKey || actionKeys.has(actionKey)) {
          throw new Error(`${fieldName}_action_key_invalid:${actionKey}`);
        }
        actionKeys.add(actionKey);
        return {
          actionKey,
          immediateVector: objectiveVector(
            rawAction.immediateVector,
            objectiveKeys,
            `${fieldName}.actions.${index}.immediateVector`,
            true,
          ),
          distribution: normalizeDistribution(
            rawAction.outcomes,
            stateByKey,
            `${fieldName}.actions.${index}`,
          ),
        };
      });
      state.distribution = [];
    }
  }

  for (const state of stateByKey.values()) {
    const distributions = state.owner === "chance"
      ? [state.distribution]
      : state.actions.map((action) => action.distribution);
    for (const distribution of distributions) {
      for (const outcome of distribution) {
        const successor = stateByKey.get(outcome.stateKey);
        if (successor.remainingPly >= state.remainingPly) {
          throw new Error(`strategy_quotient_non_decreasing_ply:${state.stateKey}:${successor.stateKey}`);
        }
      }
    }
  }
  return { objectiveKeys, stateByKey };
}

function compatiblePair(left, right) {
  return left.owner === right.owner &&
    left.remainingPly === right.remainingPly &&
    left.comparisonKey === right.comparisonKey &&
    left.informationKey === right.informationKey &&
    left.strategyContextKey === right.strategyContextKey;
}

function actionLift(leftAction, rightAction, relation, objectiveKeys) {
  if (!componentwiseAtLeast(rightAction.immediateVector, leftAction.immediateVector, objectiveKeys)) {
    return { ok: false, coupling: [] };
  }
  return exactDistributionLift(leftAction.distribution, rightAction.distribution, relation);
}

function simulationStepHolds(left, right, relation, objectiveKeys) {
  if (!compatiblePair(left, right)) return false;
  if (left.owner === "terminal") {
    return componentwiseAtLeast(right.terminalVector, left.terminalVector, objectiveKeys);
  }
  if (left.owner === "chance") {
    return exactDistributionLift(left.distribution, right.distribution, relation).ok;
  }
  if (left.owner === "max") {
    return left.actions.every((leftAction) => right.actions.some((rightAction) =>
      actionLift(leftAction, rightAction, relation, objectiveKeys).ok));
  }
  return right.actions.every((rightAction) => left.actions.some((leftAction) =>
    actionLift(leftAction, rightAction, relation, objectiveKeys).ok));
}

function buildGreatestSimulation(stateByKey, objectiveKeys) {
  const states = Array.from(stateByKey.values());
  let relation = new Set();
  for (const left of states) {
    for (const right of states) {
      if (!compatiblePair(left, right)) continue;
      if (left.owner !== "terminal" ||
          componentwiseAtLeast(right.terminalVector, left.terminalVector, objectiveKeys)) {
        relation.add(pairKey(left.stateKey, right.stateKey));
      }
    }
  }
  let iterations = 0;
  let removed;
  do {
    removed = 0;
    iterations += 1;
    const next = new Set(relation);
    for (const key of relation) {
      const [leftKey, rightKey] = key.split("\u0000");
      if (!simulationStepHolds(
        stateByKey.get(leftKey),
        stateByKey.get(rightKey),
        relation,
        objectiveKeys,
      )) {
        next.delete(key);
        removed += 1;
      }
    }
    relation = next;
  } while (removed > 0);
  return { relation, iterations };
}

function buildGreatestBisimulation(stateByKey, objectiveKeys) {
  const states = Array.from(stateByKey.values());
  let relation = new Set();
  for (const left of states) {
    for (const right of states) {
      if (!compatiblePair(left, right)) continue;
      if (left.owner !== "terminal" ||
          (componentwiseAtLeast(right.terminalVector, left.terminalVector, objectiveKeys) &&
           componentwiseAtLeast(left.terminalVector, right.terminalVector, objectiveKeys))) {
        relation.add(pairKey(left.stateKey, right.stateKey));
      }
    }
  }
  let iterations = 0;
  let removed;
  do {
    removed = 0;
    iterations += 1;
    const next = new Set(relation);
    const checked = new Set();
    for (const key of relation) {
      const [leftKey, rightKey] = key.split("\u0000");
      const unorderedKey = [leftKey, rightKey].sort().join("\u0000");
      if (checked.has(unorderedKey)) continue;
      checked.add(unorderedKey);
      const left = stateByKey.get(leftKey);
      const right = stateByKey.get(rightKey);
      const holds = simulationStepHolds(left, right, relation, objectiveKeys) &&
        simulationStepHolds(right, left, relation, objectiveKeys);
      if (!holds) {
        if (next.delete(pairKey(leftKey, rightKey))) removed += 1;
        if (next.delete(pairKey(rightKey, leftKey))) removed += 1;
      }
    }
    relation = next;
  } while (removed > 0);
  return { relation, iterations };
}

function simulationWitness(left, right, relation, objectiveKeys) {
  if (left.owner === "terminal") {
    return { terminalDominance: true };
  }
  if (left.owner === "chance") {
    return {
      chanceLift: exactDistributionLift(left.distribution, right.distribution, relation),
    };
  }
  const requirements = left.owner === "max" ? left.actions : right.actions;
  const candidates = left.owner === "max" ? right.actions : left.actions;
  const actionMappings = requirements.map((requiredAction) => {
    const candidate = candidates.map((candidateAction) => {
      const leftAction = left.owner === "max" ? requiredAction : candidateAction;
      const rightAction = left.owner === "max" ? candidateAction : requiredAction;
      return {
        candidateAction,
        lift: actionLift(leftAction, rightAction, relation, objectiveKeys),
      };
    }).find((row) => row.lift.ok);
    return {
      requiredActionKey: requiredAction.actionKey,
      matchingActionKey: candidate?.candidateAction.actionKey || "",
      coupling: candidate?.lift.coupling || [],
    };
  });
  return { quantifier: left.owner === "max" ? "forall_left_exists_right" : "forall_right_exists_left", actionMappings };
}

function equivalenceClasses(stateByKey, bisimulationRelation) {
  const parent = new Map(Array.from(stateByKey.keys(), (key) => [key, key]));
  function find(key) {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(key) !== key) {
      const next = parent.get(key);
      parent.set(key, root);
      key = next;
    }
    return root;
  }
  function union(left, right) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    parent.set(rightRoot, leftRoot.localeCompare(rightRoot) <= 0 ? leftRoot : rightRoot);
    parent.set(leftRoot, leftRoot.localeCompare(rightRoot) <= 0 ? leftRoot : rightRoot);
  }
  for (const left of stateByKey.keys()) {
    for (const right of stateByKey.keys()) {
      if (bisimulationRelation.has(pairKey(left, right))) {
        union(left, right);
      }
    }
  }
  const groups = new Map();
  for (const key of stateByKey.keys()) {
    const root = find(key);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(key);
  }
  return Array.from(groups.values())
    .map((stateKeys) => ({
      representativeStateKey: [...stateKeys].sort()[0],
      stateKeys: [...stateKeys].sort(),
    }))
    .sort((left, right) => left.representativeStateKey.localeCompare(right.representativeStateKey));
}

function reachableStateKeys(initialStateKeys, stateByKey) {
  const reached = new Set();
  const queue = [...initialStateKeys];
  while (queue.length) {
    const key = queue.shift();
    if (reached.has(key)) continue;
    reached.add(key);
    const state = stateByKey.get(key);
    const distributions = state.owner === "chance"
      ? [state.distribution]
      : state.actions.map((action) => action.distribution);
    for (const distribution of distributions) {
      for (const outcome of distribution) {
        if (!reached.has(outcome.stateKey)) queue.push(outcome.stateKey);
      }
    }
  }
  return reached;
}

function buildOptimisticUpper(stateKey, stateByKey, objectiveKeys, memo = new Map()) {
  if (memo.has(stateKey)) return memo.get(stateKey);
  const state = stateByKey.get(stateKey);
  let result;
  if (state.owner === "terminal") {
    result = state.terminalVector;
  } else if (state.owner === "chance") {
    result = weightedVector(
      state.distribution,
      (key) => buildOptimisticUpper(key, stateByKey, objectiveKeys, memo),
      objectiveKeys,
    );
  } else {
    const actionVectors = state.actions.map((action) => addVectors(
      action.immediateVector,
      weightedVector(
        action.distribution,
        (key) => buildOptimisticUpper(key, stateByKey, objectiveKeys, memo),
        objectiveKeys,
      ),
      objectiveKeys,
    ));
    result = Object.fromEntries(objectiveKeys.map((key) => [key,
      actionVectors.reduce((selected, vector) =>
        compare(vector[key], selected) > 0 ? vector[key] : selected,
      actionVectors[0][key]),
    ]));
  }
  memo.set(stateKey, result);
  return result;
}

function buildPolicyGuarantee(stateKey, policy, stateByKey, objectiveKeys, memo = new Map()) {
  if (memo.has(stateKey)) return memo.get(stateKey);
  const state = stateByKey.get(stateKey);
  let result;
  if (state.owner === "terminal") {
    result = state.terminalVector;
  } else if (state.owner === "chance") {
    result = weightedVector(
      state.distribution,
      (key) => buildPolicyGuarantee(key, policy, stateByKey, objectiveKeys, memo),
      objectiveKeys,
    );
  } else {
    const actions = state.owner === "max"
      ? state.actions.filter((action) => action.actionKey === policy[stateKey])
      : state.actions;
    if (!actions.length) throw new Error(`strategy_quotient_policy_action_missing:${stateKey}`);
    const actionVectors = actions.map((action) => addVectors(
      action.immediateVector,
      weightedVector(
        action.distribution,
        (key) => buildPolicyGuarantee(key, policy, stateByKey, objectiveKeys, memo),
        objectiveKeys,
      ),
      objectiveKeys,
    ));
    result = state.owner === "max"
      ? actionVectors[0]
      : Object.fromEntries(objectiveKeys.map((key) => [key,
        actionVectors.reduce((selected, vector) =>
          compare(vector[key], selected) < 0 ? vector[key] : selected,
        actionVectors[0][key]),
      ]));
  }
  memo.set(stateKey, result);
  return result;
}

function buildDispositionLedger(raw, context) {
  const requested = new Map();
  for (const row of raw.reverseEnvelope || []) {
    const stateKey = String(row.stateKey || "");
    if (!context.stateByKey.has(stateKey) || requested.has(stateKey)) {
      throw new Error(`strategy_quotient_disposition_state_invalid:${stateKey}`);
    }
    requested.set(stateKey, row);
  }
  const retainedRequested = new Set(Array.from(requested.values())
    .filter((row) => row.disposition === "retained")
    .map((row) => String(row.stateKey)));
  const ledger = [];
  for (const stateKey of context.universeStateKeys) {
    const row = requested.get(stateKey);
    const requestedDisposition = String(row?.disposition || "unresolved");
    const witnessStateKey = String(row?.witnessStateKey || "");
    let disposition = requestedDisposition;
    let certificateValid = false;
    let reason = "";
    let certificate = null;
    if (!row) {
      disposition = "unresolved";
      certificateValid = true;
      reason = "reverse_envelope_omission";
    } else if (requestedDisposition === "retained") {
      certificateValid = true;
      reason = "retained_by_reverse_envelope";
    } else if (requestedDisposition === "proven_unreachable") {
      certificateValid = !context.reachable.has(stateKey);
      reason = certificateValid ? "absent_from_complete_forward_reachability" : "state_is_forward_reachable";
      certificate = { initialStateKeys: context.initialStateKeys };
    } else if (requestedDisposition === "dominance_pruned") {
      const witness = context.stateByKey.get(witnessStateKey);
      certificateValid = Boolean(witness) && retainedRequested.has(witnessStateKey) &&
        context.relation.has(pairKey(stateKey, witnessStateKey));
      reason = certificateValid ? "goal_conditioned_alternating_simulation" :
        "dominance_witness_invalid_or_not_retained";
      if (certificateValid) {
        certificate = {
          witnessStateKey,
          probabilityAlternatingBisimilar:
            context.bisimulationRelation.has(pairKey(stateKey, witnessStateKey)),
          simulationWitness: simulationWitness(
            context.stateByKey.get(stateKey),
            witness,
            context.relation,
            context.objectiveKeys,
          ),
        };
      }
    } else if (requestedDisposition === "upper_bound_pruned") {
      const witness = context.stateByKey.get(witnessStateKey);
      try {
        const optimisticUpper = buildOptimisticUpper(
          stateKey,
          context.stateByKey,
          context.objectiveKeys,
        );
        const guaranteedLower = witness && retainedRequested.has(witnessStateKey)
          ? buildPolicyGuarantee(
            witnessStateKey,
            row.witnessPolicy || {},
            context.stateByKey,
            context.objectiveKeys,
          )
          : null;
        certificateValid = Boolean(guaranteedLower) &&
          componentwiseAtLeast(guaranteedLower, optimisticUpper, context.objectiveKeys);
        reason = certificateValid ? "retained_policy_lower_dominates_candidate_optimistic_upper" :
          "upper_bound_witness_invalid_or_insufficient";
        certificate = {
          witnessStateKey,
          optimisticUpper: vectorRecord(optimisticUpper, context.objectiveKeys),
          guaranteedLower: guaranteedLower
            ? vectorRecord(guaranteedLower, context.objectiveKeys)
            : null,
        };
      } catch (error) {
        certificateValid = false;
        reason = String(error?.message || error);
      }
    } else if (requestedDisposition === "unresolved") {
      certificateValid = true;
      reason = String(row.reason || "explicitly_unresolved");
    } else {
      disposition = "unresolved";
      reason = `unsupported_disposition:${requestedDisposition}`;
    }
    if (!certificateValid && disposition !== "unresolved") disposition = "unresolved";
    if (disposition === "unresolved") {
      const failedCertificate = certificate;
      const optimisticUpper = buildOptimisticUpper(
        stateKey,
        context.stateByKey,
        context.objectiveKeys,
      );
      certificate = {
        failedCertificate,
        optimisticUpper: vectorRecord(optimisticUpper, context.objectiveKeys),
      };
    }
    ledger.push({
      stateKey,
      requestedDisposition,
      disposition,
      certificateValid,
      reason,
      certificate,
      entersForwardComplementChallenge: disposition === "unresolved",
    });
  }
  return ledger;
}

export function buildWarmachineGoalConditionedStrategyQuotientV1(raw = {}) {
  const hostReceiptHash = String(raw.hostReceiptHash || "");
  const declarationReceiptHash = String(raw.declarationReceiptHash || "");
  if (!hostReceiptHash) throw new Error("strategy_quotient_host_receipt_required");
  if (!declarationReceiptHash) throw new Error("strategy_quotient_declaration_receipt_required");
  const { objectiveKeys, stateByKey } = normalizeGame(raw);
  const initialStateKeys = [...new Set((raw.initialStateKeys || []).map(String))].sort();
  if (!initialStateKeys.length || initialStateKeys.some((key) => !stateByKey.has(key))) {
    throw new Error("strategy_quotient_initial_states_invalid");
  }
  const universeStateKeys = [...new Set((raw.universeStateKeys ||
    Array.from(stateByKey.keys())).map(String))].sort();
  if (!universeStateKeys.length || universeStateKeys.some((key) => !stateByKey.has(key))) {
    throw new Error("strategy_quotient_universe_invalid");
  }
  const { relation, iterations } = buildGreatestSimulation(stateByKey, objectiveKeys);
  const bisimulation = buildGreatestBisimulation(stateByKey, objectiveKeys);
  const reachable = reachableStateKeys(initialStateKeys, stateByKey);
  const dispositionLedger = buildDispositionLedger(raw, {
    stateByKey,
    objectiveKeys,
    universeStateKeys,
    initialStateKeys,
    relation,
    bisimulationRelation: bisimulation.relation,
    reachable,
  });
  const unresolvedStateKeys = dispositionLedger
    .filter((row) => row.disposition === "unresolved")
    .map((row) => row.stateKey);
  const forwardComplementChallengeQueue = dispositionLedger
    .filter((row) => row.disposition === "unresolved")
    .map((row) => ({
      stateKey: row.stateKey,
      reason: row.reason,
      optimisticUpper: row.certificate.optimisticUpper,
    }));
  const invalidCertificateCount = dispositionLedger
    .filter((row) => !row.certificateValid).length;
  const cegarDebtCount = Number(raw.cegarDebtCount || 0);
  if (!Number.isInteger(cegarDebtCount) || cegarDebtCount < 0) {
    throw new Error("strategy_quotient_cegar_debt_invalid");
  }
  const strategyContextMissingStateKeys = Array.from(stateByKey.values())
    .filter((state) => !state.strategyContextKey)
    .map((state) => state.stateKey)
    .sort();
  const domainClosure = {
    ruleQuotientComplete: raw.ruleQuotientComplete === true,
    terminalRootDomainComplete: raw.terminalRootDomainComplete === true,
    objectiveBasisComplete: raw.objectiveBasisComplete === true,
    strategySemanticsComplete: raw.strategySemanticsComplete === true,
    opponentResponseDomainComplete: raw.opponentResponseDomainComplete === true,
    chanceDomainComplete: raw.chanceDomainComplete === true,
    strategyContextComplete: raw.strategyContextComplete === true &&
      strategyContextMissingStateKeys.length === 0,
  };
  const missingDomainClosureKeys = Object.entries(domainClosure)
    .filter(([, complete]) => !complete)
    .map(([key]) => key);
  const denominatorConserved = dispositionLedger.length === universeStateKeys.length &&
    new Set(dispositionLedger.map((row) => row.stateKey)).size === universeStateKeys.length;
  const effectiveStrategyQuotientComplete = missingDomainClosureKeys.length === 0 &&
    denominatorConserved && invalidCertificateCount === 0 &&
    unresolvedStateKeys.length === 0 && cegarDebtCount === 0;
  const equivalentClasses = equivalenceClasses(stateByKey, bisimulation.relation);
  const dominancePairs = [];
  for (const leftStateKey of stateByKey.keys()) {
    for (const rightStateKey of stateByKey.keys()) {
      if (leftStateKey !== rightStateKey && relation.has(pairKey(leftStateKey, rightStateKey))) {
        dominancePairs.push({ leftStateKey, rightStateKey });
      }
    }
  }
  dominancePairs.sort((left, right) =>
    left.leftStateKey.localeCompare(right.leftStateKey) ||
    left.rightStateKey.localeCompare(right.rightStateKey));
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_GOAL_CONDITIONED_STRATEGY_QUOTIENT_V1_SCHEMA,
    hostReceiptHash,
    declarationReceiptHash,
    objectiveKeys,
    domainClosure,
    missingDomainClosureKeys,
    stateCount: stateByKey.size,
    universeStateCount: universeStateKeys.length,
    initialStateKeys,
    reachableStateCount: reachable.size,
    alternatingSimulationIterations: iterations,
    alternatingSimulationPairCount: relation.size,
    probabilityAlternatingBisimulationIterations: bisimulation.iterations,
    probabilityAlternatingBisimulationPairCount: bisimulation.relation.size,
    equivalentClasses,
    dominancePairs,
    dispositionLedger,
    dispositionCounts: Object.fromEntries([
      "retained",
      "proven_unreachable",
      "dominance_pruned",
      "upper_bound_pruned",
      "unresolved",
    ].map((disposition) => [disposition,
      dispositionLedger.filter((row) => row.disposition === disposition).length,
    ])),
    denominatorConserved,
    invalidCertificateCount,
    cegarDebtCount,
    strategyContextKeyCount: new Set(Array.from(stateByKey.values())
      .map((state) => state.strategyContextKey)
      .filter(Boolean)).size,
    strategyContextMissingStateKeys,
    forwardComplementChallengeStateKeys: unresolvedStateKeys,
    forwardComplementChallengeQueue,
    effectiveStrategyQuotientComplete,
    allPotentiallyEffectiveStrategyClassesPreserved: effectiveStrategyQuotientComplete,
    completenessClaimAllowed: effectiveStrategyQuotientComplete,
    claimBoundary: "Completeness is relative to the bound Host/declaration receipt, finite rule quotient, initial-distribution/history/observation/reachability strategy context, information model, horizon and objective vector. Reverse omission is unresolved; only verified unreachability, alternating dominance or componentwise bound certificates may hard-prune. The result does not cover unknown objectives, future rules or infinite horizon.",
  });
  return {
    ...core,
    quotientHash: stableGraphHash(core),
    ok: invalidCertificateCount === 0 && denominatorConserved,
  };
}
