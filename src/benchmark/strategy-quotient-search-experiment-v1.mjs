import {
  buildWarmachineGoalConditionedStrategyQuotientV1,
} from "../search/goal-conditioned-strategy-quotient-v1.mjs";

export const WARMACHINE_STRATEGY_QUOTIENT_SEARCH_EXPERIMENT_V1_SCHEMA =
  "warmachine_strategy_quotient_search_experiment_v1";

function terminal(stateKey, goal, material) {
  return {
    stateKey,
    owner: "terminal",
    remainingPly: 0,
    comparisonKey: "terminal",
    strategyContextKey: "terminal-context",
    terminalVector: { goal, material },
  };
}

function outcome(stateKey, numerator = 1, denominator = 1) {
  return { stateKey, numerator, denominator };
}

function action(actionKey, stateKey) {
  return { actionKey, outcomes: [outcome(stateKey)] };
}

function actionState(
  stateKey,
  owner,
  actions,
  comparisonKey = "opening-cell",
  strategyContextKey = "reachable-opening-cell-context",
) {
  return {
    stateKey,
    owner,
    remainingPly: 1,
    comparisonKey,
    strategyContextKey,
    actions,
  };
}

function padded(prefix, index) {
  return `${prefix}-${String(index).padStart(3, "0")}`;
}

function buildFixture({ coordinateDuplicateCount, dominatedDetourCount, unreachableCount }) {
  const states = [
    terminal("terminal-zero", 0, 0),
    terminal("terminal-base", 1, 2),
    terminal("terminal-hidden", 1, 4),
    terminal("terminal-goal", 2, 0),
    terminal("terminal-material", 0, 6),
  ];
  const universeStateKeys = [];
  const reverseEnvelope = [];
  const coordinateKeys = [];
  const detourKeys = [];
  const unreachableKeys = [];

  for (let index = 0; index < coordinateDuplicateCount; index += 1) {
    const stateKey = padded("coordinate", index);
    coordinateKeys.push(stateKey);
    universeStateKeys.push(stateKey);
    states.push(actionState(stateKey, "max", [
      action(`same-strike-at-coordinate-${index}`, "terminal-base"),
    ]));
    reverseEnvelope.push(index === 0
      ? { stateKey, disposition: "retained" }
      : {
          stateKey,
          disposition: "dominance_pruned",
          witnessStateKey: coordinateKeys[0],
        });
  }

  for (let index = 0; index < dominatedDetourCount; index += 1) {
    const stateKey = padded("detour", index);
    detourKeys.push(stateKey);
    universeStateKeys.push(stateKey);
    states.push(actionState(stateKey, "max", [
      action(`irrelevant-detour-${index}`, "terminal-zero"),
    ]));
    reverseEnvelope.push({
      stateKey,
      disposition: "dominance_pruned",
      witnessStateKey: coordinateKeys[0],
    });
  }

  states.push(
    actionState("opponent-safe", "min", [
      action("ordinary-response", "terminal-base"),
    ]),
    actionState("opponent-harmful", "min", [
      action("ordinary-response", "terminal-base"),
      action("hidden-counterplay", "terminal-zero"),
    ]),
    {
      stateKey: "chance-dominated",
      owner: "chance",
      remainingPly: 1,
      comparisonKey: "opening-cell",
      strategyContextKey: "reachable-opening-cell-context",
      outcomes: [outcome("terminal-zero", 1, 2), outcome("terminal-base", 1, 2)],
    },
    {
      stateKey: "chance-dominating",
      owner: "chance",
      remainingPly: 1,
      comparisonKey: "opening-cell",
      strategyContextKey: "reachable-opening-cell-context",
      outcomes: [outcome("terminal-base")],
    },
    {
      stateKey: "chance-equal-mean-a",
      owner: "chance",
      remainingPly: 1,
      comparisonKey: "opening-cell",
      strategyContextKey: "reachable-opening-cell-context",
      outcomes: [outcome("terminal-base")],
    },
    {
      stateKey: "chance-equal-mean-b",
      owner: "chance",
      remainingPly: 1,
      comparisonKey: "opening-cell",
      strategyContextKey: "reachable-opening-cell-context",
      outcomes: [outcome("terminal-zero", 1, 2), outcome("terminal-goal", 1, 2)],
    },
    actionState("goal-specialist", "max", [
      action("trade-everything-for-goal", "terminal-goal"),
    ]),
    actionState("material-specialist", "max", [
      action("deny-goal-preserve-material", "terminal-material"),
    ]),
    actionState("hidden-superior", "max", [
      action("reverse-generator-does-not-know-this-rule-chain", "terminal-hidden"),
    ]),
    actionState("upper-bound-candidate", "max", [
      action("bounded-no-gain-line", "terminal-zero"),
    ]),
  );

  const fixedCandidateKeys = [
    "opponent-safe",
    "opponent-harmful",
    "chance-dominated",
    "chance-dominating",
    "chance-equal-mean-a",
    "chance-equal-mean-b",
    "goal-specialist",
    "material-specialist",
    "hidden-superior",
    "upper-bound-candidate",
  ];
  universeStateKeys.push(...fixedCandidateKeys);
  reverseEnvelope.push(
    { stateKey: "opponent-safe", disposition: "retained" },
    {
      stateKey: "opponent-harmful",
      disposition: "dominance_pruned",
      witnessStateKey: "opponent-safe",
    },
    {
      stateKey: "chance-dominated",
      disposition: "dominance_pruned",
      witnessStateKey: "chance-dominating",
    },
    { stateKey: "chance-dominating", disposition: "retained" },
    { stateKey: "chance-equal-mean-a", disposition: "retained" },
    { stateKey: "chance-equal-mean-b", disposition: "retained" },
    { stateKey: "goal-specialist", disposition: "retained" },
    { stateKey: "material-specialist", disposition: "retained" },
    {
      stateKey: "upper-bound-candidate",
      disposition: "upper_bound_pruned",
      witnessStateKey: coordinateKeys[0],
      witnessPolicy: { [coordinateKeys[0]]: "same-strike-at-coordinate-0" },
    },
  );

  for (let index = 0; index < unreachableCount; index += 1) {
    const stateKey = padded("reverse-only-unreachable", index);
    unreachableKeys.push(stateKey);
    universeStateKeys.push(stateKey);
    states.push(actionState(stateKey, "max", [
      action(`attractive-but-unreachable-${index}`, "terminal-hidden"),
    ], "opening-cell", "reverse-only-unreachable-context"));
    reverseEnvelope.push({ stateKey, disposition: "proven_unreachable" });
  }

  const openingOrder = [
    ...coordinateKeys,
    ...detourKeys,
    "opponent-harmful",
    "chance-dominated",
    "upper-bound-candidate",
    "opponent-safe",
    "chance-dominating",
    "chance-equal-mean-a",
    "chance-equal-mean-b",
    "goal-specialist",
    "material-specialist",
    "hidden-superior",
  ];
  states.push({
    stateKey: "declared-opening",
    owner: "max",
    remainingPly: 2,
    comparisonKey: "opening",
    strategyContextKey: "declared-opening-context",
    actions: openingOrder.map((stateKey) => action(`enter-${stateKey}`, stateKey)),
  });

  return {
    states,
    universeStateKeys,
    reverseEnvelope,
    openingOrder,
    hiddenStateKey: "hidden-superior",
    reverseDiscoveredStateKeys: universeStateKeys.filter((key) => key !== "hidden-superior"),
  };
}

function buildQuotient(fixture, reverseEnvelope) {
  return buildWarmachineGoalConditionedStrategyQuotientV1({
    hostReceiptHash: "experiment-host-receipt-v1",
    declarationReceiptHash: "experiment-objective-receipt-v1",
    objectiveKeys: ["goal", "material"],
    ruleQuotientComplete: true,
    terminalRootDomainComplete: true,
    objectiveBasisComplete: true,
    strategySemanticsComplete: true,
    opponentResponseDomainComplete: true,
    chanceDomainComplete: true,
    strategyContextComplete: true,
    cegarDebtCount: 0,
    states: fixture.states,
    initialStateKeys: ["declared-opening"],
    universeStateKeys: fixture.universeStateKeys,
    reverseEnvelope,
  });
}

function universeClasses(quotient, universeStateKeys) {
  const universe = new Set(universeStateKeys);
  return quotient.equivalentClasses
    .map((row) => row.stateKeys.filter((stateKey) => universe.has(stateKey)))
    .filter((stateKeys) => stateKeys.length > 0)
    .map((stateKeys) => ({
      classKey: stateKeys[0],
      stateKeys,
    }));
}

function effectiveClassKeys(quotient, classes, reachableStateKeys) {
  const reachable = new Set(reachableStateKeys);
  const classByState = new Map();
  for (const row of classes) {
    for (const stateKey of row.stateKeys) classByState.set(stateKey, row.classKey);
  }
  const reachableClasses = classes.filter((row) =>
    row.stateKeys.some((stateKey) => reachable.has(stateKey)));
  const strictDominated = new Set();
  const dominance = new Set(quotient.dominancePairs.map((row) =>
    `${row.leftStateKey}\u0000${row.rightStateKey}`));
  for (const leftClass of reachableClasses) {
    const left = leftClass.stateKeys[0];
    for (const rightClass of reachableClasses) {
      if (leftClass.classKey === rightClass.classKey) continue;
      const right = rightClass.stateKeys[0];
      const leftToRight = dominance.has(`${left}\u0000${right}`);
      const rightToLeft = dominance.has(`${right}\u0000${left}`);
      if (leftToRight && !rightToLeft) {
        strictDominated.add(leftClass.classKey);
        break;
      }
    }
  }
  return reachableClasses
    .map((row) => row.classKey)
    .filter((classKey) => !strictDominated.has(classKey))
    .sort();
}

function classRecall(selectedStateKeys, effectiveKeys, classes) {
  const selected = new Set(selectedStateKeys);
  const found = classes
    .filter((row) => effectiveKeys.includes(row.classKey))
    .filter((row) => row.stateKeys.some((stateKey) => selected.has(stateKey)))
    .map((row) => row.classKey)
    .sort();
  return {
    foundClassKeys: found,
    missingClassKeys: effectiveKeys.filter((classKey) => !found.includes(classKey)),
    recallNumerator: found.length,
    recallDenominator: effectiveKeys.length,
    recall: effectiveKeys.length ? found.length / effectiveKeys.length : 1,
  };
}

function deterministicShuffle(values, seed) {
  const result = [...values];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const selected = state % (index + 1);
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
}

function budgetedRecallDistribution(sourceStateKeys, budget, effectiveKeys, classes) {
  const recalls = [];
  for (let seed = 1; seed <= 128; seed += 1) {
    const selected = deterministicShuffle(sourceStateKeys, seed).slice(0, budget);
    recalls.push(classRecall(selected, effectiveKeys, classes).recall);
  }
  return {
    permutationCount: recalls.length,
    minimumRecall: Math.min(...recalls),
    meanRecall: recalls.reduce((sum, value) => sum + value, 0) / recalls.length,
    maximumRecall: Math.max(...recalls),
    completeRecallPermutationCount: recalls.filter((value) => value === 1).length,
  };
}

function elapsedMilliseconds(started) {
  return Number(process.hrtime.bigint() - started) / 1_000_000;
}

export function runStrategyQuotientSearchExperimentV1(options = {}) {
  const fixture = buildFixture({
    coordinateDuplicateCount: Number(options.coordinateDuplicateCount ?? 24),
    dominatedDetourCount: Number(options.dominatedDetourCount ?? 24),
    unreachableCount: Number(options.unreachableCount ?? 8),
  });

  const firstPassStarted = process.hrtime.bigint();
  const firstPass = buildQuotient(fixture, fixture.reverseEnvelope);
  const firstPassMilliseconds = elapsedMilliseconds(firstPassStarted);
  const complementKeys = firstPass.forwardComplementChallengeStateKeys;
  const completedEnvelope = [
    ...fixture.reverseEnvelope,
    ...complementKeys.map((stateKey) => ({ stateKey, disposition: "retained" })),
  ];
  const completedStarted = process.hrtime.bigint();
  const completed = buildQuotient(fixture, completedEnvelope);
  const completedMilliseconds = elapsedMilliseconds(completedStarted);

  const classes = universeClasses(completed, fixture.universeStateKeys);
  const reachableStateKeys = fixture.openingOrder;
  const effectiveKeys = effectiveClassKeys(completed, classes, reachableStateKeys);
  const retainedKeys = completed.dispositionLedger
    .filter((row) => row.disposition === "retained")
    .map((row) => row.stateKey);
  const hybridExpensiveRootBudget = retainedKeys.length + complementKeys.length;
  const forwardBudgetedKeys = fixture.openingOrder.slice(0, hybridExpensiveRootBudget);
  const reverseBudgetedKeys = fixture.reverseDiscoveredStateKeys.slice(0, hybridExpensiveRootBudget);

  const pureForwardFull = {
    method: "pure_strict_forward",
    complete: true,
    expensiveStrictRootExpansions: reachableStateKeys.length,
    symbolicPairChecksUpperBound: 0,
    ...classRecall(reachableStateKeys, effectiveKeys, classes),
  };
  const pureForwardSameBudget = {
    method: "pure_strict_forward_same_expensive_budget",
    complete: false,
    expensiveStrictRootExpansions: forwardBudgetedKeys.length,
    symbolicPairChecksUpperBound: 0,
    randomizedOrdering: budgetedRecallDistribution(
      reachableStateKeys,
      forwardBudgetedKeys.length,
      effectiveKeys,
      classes,
    ),
    ...classRecall(forwardBudgetedKeys, effectiveKeys, classes),
  };
  const pureReverseFull = {
    method: "pure_symbolic_reverse",
    complete: false,
    expensiveStrictRootExpansions: fixture.reverseDiscoveredStateKeys.length,
    symbolicPairChecksUpperBound: 0,
    unresolvedStateKeys: [fixture.hiddenStateKey],
    ...classRecall(fixture.reverseDiscoveredStateKeys, effectiveKeys, classes),
  };
  const pureReverseSameBudget = {
    method: "pure_symbolic_reverse_same_expensive_budget",
    complete: false,
    expensiveStrictRootExpansions: reverseBudgetedKeys.length,
    symbolicPairChecksUpperBound: 0,
    unresolvedStateKeys: [fixture.hiddenStateKey],
    randomizedOrdering: budgetedRecallDistribution(
      fixture.reverseDiscoveredStateKeys,
      reverseBudgetedKeys.length,
      effectiveKeys,
      classes,
    ),
    ...classRecall(reverseBudgetedKeys, effectiveKeys, classes),
  };
  const hybrid = {
    method: "reverse_overapprox_strategy_quotient_forward_complement",
    complete: completed.effectiveStrategyQuotientComplete,
    expensiveStrictRootExpansions: hybridExpensiveRootBudget,
    retainedRootCount: retainedKeys.length,
    complementChallengeCount: complementKeys.length,
    certifiedPruneCount: completed.dispositionLedger.filter((row) =>
      ["proven_unreachable", "dominance_pruned", "upper_bound_pruned"].includes(row.disposition)).length,
    unsafeHardPruneCount: completed.invalidCertificateCount,
    unresolvedStateKeys: completed.forwardComplementChallengeStateKeys,
    symbolicPairChecksUpperBound:
      completed.stateCount * completed.stateCount *
      (completed.alternatingSimulationIterations +
       completed.probabilityAlternatingBisimulationIterations),
    firstPassMilliseconds,
    completedMilliseconds,
    strictRootReductionVersusCompleteForward:
      1 - hybridExpensiveRootBudget / reachableStateKeys.length,
    ...classRecall(retainedKeys, effectiveKeys, classes),
  };

  const equalMeanMerged = completed.equivalentClasses.some((row) =>
    row.stateKeys.includes("chance-equal-mean-a") &&
    row.stateKeys.includes("chance-equal-mean-b"));
  const opponentCounterplayMerged = completed.equivalentClasses.some((row) =>
    row.stateKeys.includes("opponent-safe") && row.stateKeys.includes("opponent-harmful"));
  const unreachableFutureEquivalentMerged = completed.equivalentClasses.some((row) =>
    row.stateKeys.includes(fixture.hiddenStateKey) &&
    row.stateKeys.some((stateKey) => stateKey.startsWith("reverse-only-unreachable-")));
  const coordinateClass = classes.find((row) => row.stateKeys.includes("coordinate-000"));
  const experimentPassed = hybrid.complete && hybrid.recall === 1 &&
    hybrid.unsafeHardPruneCount === 0 && complementKeys.includes(fixture.hiddenStateKey) &&
    !equalMeanMerged && !opponentCounterplayMerged && !unreachableFutureEquivalentMerged &&
    coordinateClass?.stateKeys.length === Number(options.coordinateDuplicateCount ?? 24) &&
    hybrid.expensiveStrictRootExpansions < pureForwardFull.expensiveStrictRootExpansions;

  return {
    schemaVersion: WARMACHINE_STRATEGY_QUOTIENT_SEARCH_EXPERIMENT_V1_SCHEMA,
    fixture: {
      coordinateDuplicateCount: Number(options.coordinateDuplicateCount ?? 24),
      dominatedDetourCount: Number(options.dominatedDetourCount ?? 24),
      unreachableCount: Number(options.unreachableCount ?? 8),
      candidateCellCount: fixture.universeStateKeys.length,
      reachableCandidateCellCount: reachableStateKeys.length,
      exactBehaviorClassCount: classes.length,
      exactPotentiallyEffectiveClassCount: effectiveKeys.length,
      exactPotentiallyEffectiveClassKeys: effectiveKeys,
    },
    firstPass: {
      complete: firstPass.effectiveStrategyQuotientComplete,
      complementChallengeStateKeys: complementKeys,
      invalidCertificateCount: firstPass.invalidCertificateCount,
    },
    safeguards: {
      coordinateDuplicatesMerged: coordinateClass?.stateKeys.length || 0,
      equalMeanDifferentChanceDistributionMerged: equalMeanMerged,
      opponentExtraResponseMerged: opponentCounterplayMerged,
      unreachableFutureEquivalentStrategyContextMerged: unreachableFutureEquivalentMerged,
      reverseOmissionRecoveredByComplement: complementKeys.includes(fixture.hiddenStateKey),
    },
    methods: {
      pureForwardFull,
      pureForwardSameBudget,
      pureReverseFull,
      pureReverseSameBudget,
      hybrid,
    },
    experimentPassed,
    claimBoundary: "This finite experiment validates the accounting, certificates, counterexample recovery and downstream-root reduction on the declared fixture. It does not prove that the real Warmachine Q_rule is finite or complete, nor that the hybrid method always outperforms forward search.",
  };
}
