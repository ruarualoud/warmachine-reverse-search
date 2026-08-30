import assert from "node:assert/strict";

import {
  buildWarmachineGoalConditionedStrategyQuotientV1,
} from "../src/search/goal-conditioned-strategy-quotient-v1.mjs";

function terminal(stateKey, terminalValue, material = 0) {
  return {
    stateKey,
    owner: "terminal",
    remainingPly: 0,
    comparisonKey: "terminal",
    strategyContextKey: "terminal-context",
    terminalVector: { terminalValue, material },
  };
}

function outcome(stateKey, numerator = 1, denominator = 1) {
  return { stateKey, numerator, denominator };
}

function actionState(stateKey, owner, actions) {
  return {
    stateKey,
    owner,
    remainingPly: 1,
    comparisonKey: "candidate-root",
    strategyContextKey: "reachable-candidate-context",
    actions,
  };
}

function action(actionKey, stateKey) {
  return { actionKey, outcomes: [outcome(stateKey)] };
}

const candidateStateKeys = [
  "coordinate-a",
  "coordinate-b",
  "detour",
  "opponent-safe",
  "opponent-harmful",
  "chance-dominated",
  "chance-dominating",
  "chance-equal-mean-a",
  "chance-equal-mean-b",
  "hidden-superior",
  "upper-bound-candidate",
  "unreachable-candidate",
];

const states = [
  terminal("terminal-zero", 0, 0),
  terminal("terminal-one", 1, 0),
  terminal("terminal-one-material", 1, 1),
  terminal("terminal-two", 2, 0),
  actionState("coordinate-a", "max", [action("strike", "terminal-one")]),
  actionState("coordinate-b", "max", [action("same-strike-different-coordinate", "terminal-one")]),
  actionState("detour", "max", [action("wait", "terminal-zero")]),
  actionState("opponent-safe", "min", [action("ordinary-response", "terminal-one")]),
  actionState("opponent-harmful", "min", [
    action("ordinary-response", "terminal-one"),
    action("hidden-counterplay", "terminal-zero"),
  ]),
  {
    stateKey: "chance-dominated",
    owner: "chance",
    remainingPly: 1,
    comparisonKey: "candidate-root",
    strategyContextKey: "reachable-candidate-context",
    outcomes: [outcome("terminal-zero", 1, 2), outcome("terminal-one", 1, 2)],
  },
  {
    stateKey: "chance-dominating",
    owner: "chance",
    remainingPly: 1,
    comparisonKey: "candidate-root",
    strategyContextKey: "reachable-candidate-context",
    outcomes: [outcome("terminal-one")],
  },
  {
    stateKey: "chance-equal-mean-a",
    owner: "chance",
    remainingPly: 1,
    comparisonKey: "candidate-root",
    strategyContextKey: "reachable-candidate-context",
    outcomes: [outcome("terminal-one")],
  },
  {
    stateKey: "chance-equal-mean-b",
    owner: "chance",
    remainingPly: 1,
    comparisonKey: "candidate-root",
    strategyContextKey: "reachable-candidate-context",
    outcomes: [outcome("terminal-zero", 1, 2), outcome("terminal-two", 1, 2)],
  },
  actionState("hidden-superior", "max", [action("unanticipated-line", "terminal-one-material")]),
  actionState("upper-bound-candidate", "max", [action("bounded-line", "terminal-zero")]),
  actionState("unreachable-candidate", "max", [action("unreachable-line", "terminal-one-material")]),
  {
    stateKey: "declared-opening",
    owner: "max",
    remainingPly: 2,
    comparisonKey: "opening",
    strategyContextKey: "declared-opening-context",
    actions: candidateStateKeys
      .filter((stateKey) => stateKey !== "unreachable-candidate")
      .map((stateKey) => action(`enter-${stateKey}`, stateKey)),
  },
];

const baseEnvelope = [
  { stateKey: "coordinate-a", disposition: "retained" },
  { stateKey: "coordinate-b", disposition: "dominance_pruned", witnessStateKey: "coordinate-a" },
  { stateKey: "detour", disposition: "dominance_pruned", witnessStateKey: "coordinate-a" },
  { stateKey: "opponent-safe", disposition: "retained" },
  { stateKey: "opponent-harmful", disposition: "dominance_pruned", witnessStateKey: "opponent-safe" },
  { stateKey: "chance-dominated", disposition: "dominance_pruned", witnessStateKey: "chance-dominating" },
  { stateKey: "chance-dominating", disposition: "retained" },
  { stateKey: "chance-equal-mean-a", disposition: "retained" },
  { stateKey: "chance-equal-mean-b", disposition: "retained" },
  {
    stateKey: "upper-bound-candidate",
    disposition: "upper_bound_pruned",
    witnessStateKey: "coordinate-a",
    witnessPolicy: { "coordinate-a": "strike" },
  },
  { stateKey: "unreachable-candidate", disposition: "proven_unreachable" },
];

function build(reverseEnvelope = baseEnvelope, overrides = {}) {
  return buildWarmachineGoalConditionedStrategyQuotientV1({
    hostReceiptHash: "focused-host-receipt",
    declarationReceiptHash: "focused-objective-receipt",
    objectiveKeys: ["terminalValue", "material"],
    ruleQuotientComplete: true,
    terminalRootDomainComplete: true,
    objectiveBasisComplete: true,
    strategySemanticsComplete: true,
    opponentResponseDomainComplete: true,
    chanceDomainComplete: true,
    strategyContextComplete: true,
    cegarDebtCount: 0,
    states,
    initialStateKeys: ["declared-opening"],
    universeStateKeys: candidateStateKeys,
    reverseEnvelope,
    ...overrides,
  });
}

const incomplete = build();
assert.equal(incomplete.ok, true);
assert.equal(incomplete.effectiveStrategyQuotientComplete, false);
assert.equal(incomplete.allPotentiallyEffectiveStrategyClassesPreserved, false);
assert.deepEqual(incomplete.forwardComplementChallengeStateKeys, ["hidden-superior"]);
const hiddenChallenge = incomplete.forwardComplementChallengeQueue[0];
assert.equal(hiddenChallenge.reason, "reverse_envelope_omission");
assert.deepEqual(hiddenChallenge.optimisticUpper, {
  material: { numerator: "1", denominator: "1" },
  terminalValue: { numerator: "1", denominator: "1" },
});

const coordinateClass = incomplete.equivalentClasses.find((row) =>
  row.stateKeys.includes("coordinate-a"));
assert.deepEqual(coordinateClass.stateKeys, ["coordinate-a", "coordinate-b"]);
assert.equal(incomplete.equivalentClasses.some((row) =>
  row.stateKeys.includes("opponent-safe") && row.stateKeys.includes("opponent-harmful")), false);
assert.equal(incomplete.equivalentClasses.some((row) =>
  row.stateKeys.includes("chance-equal-mean-a") && row.stateKeys.includes("chance-equal-mean-b")), false);

const harmfulDisposition = incomplete.dispositionLedger.find((row) =>
  row.stateKey === "opponent-harmful");
assert.equal(harmfulDisposition.disposition, "dominance_pruned");
assert.equal(harmfulDisposition.certificate.probabilityAlternatingBisimilar, false);
assert.equal(harmfulDisposition.certificate.simulationWitness.quantifier, "forall_right_exists_left");
const chanceDisposition = incomplete.dispositionLedger.find((row) =>
  row.stateKey === "chance-dominated");
assert.equal(chanceDisposition.disposition, "dominance_pruned");
assert.equal(chanceDisposition.certificate.simulationWitness.chanceLift.ok, true);
assert.equal(chanceDisposition.certificate.simulationWitness.chanceLift.coupling.length, 2);
const boundDisposition = incomplete.dispositionLedger.find((row) =>
  row.stateKey === "upper-bound-candidate");
assert.equal(boundDisposition.disposition, "upper_bound_pruned");
assert.deepEqual(boundDisposition.certificate.optimisticUpper, {
  material: { numerator: "0", denominator: "1" },
  terminalValue: { numerator: "0", denominator: "1" },
});
assert.deepEqual(boundDisposition.certificate.guaranteedLower, {
  material: { numerator: "0", denominator: "1" },
  terminalValue: { numerator: "1", denominator: "1" },
});

const complete = build([
  ...baseEnvelope,
  { stateKey: "hidden-superior", disposition: "retained" },
]);
assert.equal(complete.ok, true);
assert.equal(complete.denominatorConserved, true);
assert.equal(complete.invalidCertificateCount, 0);
assert.equal(complete.forwardComplementChallengeStateKeys.length, 0);
assert.equal(complete.effectiveStrategyQuotientComplete, true);
assert.equal(complete.allPotentiallyEffectiveStrategyClassesPreserved, true);
const deterministicRepeat = build([
  { stateKey: "hidden-superior", disposition: "retained" },
  ...[...baseEnvelope].reverse(),
], { states: [...states].reverse() });
assert.equal(deterministicRepeat.quotientHash, complete.quotientHash);

const invalidOpponentPruneEnvelope = baseEnvelope
  .filter((row) => !["opponent-safe", "opponent-harmful"].includes(row.stateKey));
invalidOpponentPruneEnvelope.push(
  { stateKey: "opponent-harmful", disposition: "retained" },
  { stateKey: "opponent-safe", disposition: "dominance_pruned", witnessStateKey: "opponent-harmful" },
  { stateKey: "hidden-superior", disposition: "retained" },
);
const invalidOpponentPrune = build(invalidOpponentPruneEnvelope);
assert.equal(invalidOpponentPrune.ok, false);
assert.equal(invalidOpponentPrune.effectiveStrategyQuotientComplete, false);
assert.deepEqual(invalidOpponentPrune.forwardComplementChallengeStateKeys, ["opponent-safe"]);
assert.equal(invalidOpponentPrune.dispositionLedger.find((row) =>
  row.stateKey === "opponent-safe").reason, "dominance_witness_invalid_or_not_retained");

const unresolvedCegar = build([
  ...baseEnvelope,
  { stateKey: "hidden-superior", disposition: "retained" },
], { cegarDebtCount: 1 });
assert.equal(unresolvedCegar.effectiveStrategyQuotientComplete, false);

const incompleteObjectiveBasis = build([
  ...baseEnvelope,
  { stateKey: "hidden-superior", disposition: "retained" },
], { objectiveBasisComplete: false });
assert.equal(incompleteObjectiveBasis.effectiveStrategyQuotientComplete, false);
assert.deepEqual(incompleteObjectiveBasis.missingDomainClosureKeys, ["objectiveBasisComplete"]);

const missingStrategyContextStates = states.map((state) =>
  state.stateKey === "hidden-superior"
    ? { ...state, strategyContextKey: "" }
    : state);
const missingStrategyContext = build([
  ...baseEnvelope,
  { stateKey: "hidden-superior", disposition: "retained" },
], { states: missingStrategyContextStates });
assert.equal(missingStrategyContext.effectiveStrategyQuotientComplete, false);
assert.deepEqual(missingStrategyContext.missingDomainClosureKeys, ["strategyContextComplete"]);
assert.deepEqual(missingStrategyContext.strategyContextMissingStateKeys, ["hidden-superior"]);

console.log(JSON.stringify({
  schemaVersion: complete.schemaVersion,
  stateCount: complete.stateCount,
  universeStateCount: complete.universeStateCount,
  alternatingSimulationPairCount: complete.alternatingSimulationPairCount,
  probabilityAlternatingBisimulationPairCount:
    complete.probabilityAlternatingBisimulationPairCount,
  equivalentClassCount: complete.equivalentClasses.length,
  dispositionCounts: complete.dispositionCounts,
  incompleteComplementChallenge: incomplete.forwardComplementChallengeQueue,
  invalidOpponentPruneRejected: invalidOpponentPrune.ok === false,
  effectiveStrategyQuotientComplete: complete.effectiveStrategyQuotientComplete,
  quotientHash: complete.quotientHash,
}, null, 2));
