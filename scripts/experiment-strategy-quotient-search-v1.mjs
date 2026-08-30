import assert from "node:assert/strict";

import {
  runStrategyQuotientSearchExperimentV1,
} from "../src/benchmark/strategy-quotient-search-experiment-v1.mjs";

const experiment = runStrategyQuotientSearchExperimentV1({
  coordinateDuplicateCount: 24,
  dominatedDetourCount: 24,
  unreachableCount: 8,
});

assert.equal(experiment.experimentPassed, true);
assert.equal(experiment.firstPass.complete, false);
assert.deepEqual(experiment.firstPass.complementChallengeStateKeys, ["hidden-superior"]);
assert.equal(experiment.methods.hybrid.complete, true);
assert.equal(experiment.methods.hybrid.recall, 1);
assert.equal(experiment.methods.hybrid.unsafeHardPruneCount, 0);
assert.equal(experiment.safeguards.equalMeanDifferentChanceDistributionMerged, false);
assert.equal(experiment.safeguards.opponentExtraResponseMerged, false);
assert.equal(
  experiment.safeguards.unreachableFutureEquivalentStrategyContextMerged,
  false,
);
assert.equal(experiment.methods.pureReverseFull.complete, false);
assert.ok(experiment.methods.pureReverseFull.recall < 1);
assert.ok(
  experiment.methods.hybrid.expensiveStrictRootExpansions <
  experiment.methods.pureForwardFull.expensiveStrictRootExpansions,
);

console.log(JSON.stringify(experiment, null, 2));
