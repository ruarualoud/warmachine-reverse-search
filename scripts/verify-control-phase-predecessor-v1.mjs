import assert from "node:assert/strict";

import { executeWarmachineBenchmarkControlPhaseV2 } from
  "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import { generateWarmachineControlPhasePredecessorsV1 } from
  "../src/reverse/control-phase-predecessor-v1.mjs";
import { replayWarmachineTerminalReverseRouteV1 } from
  "../src/reverse/replay-terminal-reverse-route-v1.mjs";

function piece(pieceKey, overrides = {}) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey: "player1",
    modelRole: "warrior",
    modelType: "warrior model",
    position: { xIn: 8, yIn: 8 },
    baseSizeIn: 1.18,
    defense: 12,
    armor: 16,
    damage: { boxesRemaining: 20, maxBoxes: 20 },
    resourceKind: "generic_resource",
    resourcePoints: 0,
    resourceMax: 0,
    arc: 0,
    statusTags: [],
    specialRules: [],
    activated: false,
    cardSnapshot: { id: `card-${pieceKey}`, pointCostNumber: 0 },
    ...overrides,
  };
}

function differingPaths(left, right, path = "state", output = []) {
  if (Object.is(left, right)) return output;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    output.push({ path, left, right });
    return output;
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) differingPaths(left[key], right[key], `${path}.${key}`, output);
  return output;
}

const controlStart = {
  stateKey: "control-resource-predecessor-start",
  activeSideKey: "player1",
  phaseKey: "control",
  controlPhaseStepKey: "maintenance",
  turnNumber: 2,
  strictMode: true,
  enforceStrictExecutor: true,
  ruleAtomRuntimeMode: "authoritative",
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    piece("p1-caster", {
      modelRole: "warcaster",
      modelType: "warcaster",
      isWarcaster: true,
      resourceKind: "focus",
      resourcePoints: 0,
      resourceMax: 8,
      arc: 8,
      controlRangeIn: 14,
      battlegroupId: "p1-bg",
    }),
    piece("p1-jack", {
      modelRole: "warjack",
      modelType: "warjack",
      isWarjack: true,
      position: { xIn: 10, yIn: 8 },
      resourceKind: "focus",
      resourcePoints: 0,
      resourceMax: 3,
      controllerPieceKey: "p1-caster",
      battlegroupId: "p1-bg",
    }),
    piece("p2-leader", {
      sideKey: "player2",
      modelRole: "warcaster",
      modelType: "warcaster",
      isWarcaster: true,
      position: { xIn: 38, yIn: 38 },
      resourceKind: "focus",
      resourcePoints: 0,
      resourceMax: 6,
      arc: 6,
    }),
  ],
  terrain: [],
  scenario: {
    zones: [],
    flags: [],
    objectives: [],
    caches: [],
    score: { player1: 0, player2: 0 },
    victoryThreshold: 5,
  },
};

function targetControlAction({ state, scoped }) {
  const jack = state.pieces.find((entry) => entry.pieceKey === "p1-jack");
  const allocation = scoped.enumeration.actions.find((action) =>
    action.actionType === "allocate_resource" &&
    action.targetPieceKey === "p1-jack");
  if (allocation && Number(jack.resourcePoints || 0) < 2) return allocation;
  return scoped.enumeration.actions.find((action) => [
    "end_maintenance_phase",
    "end_control_replenishment",
    "end_control_phase",
  ].includes(action.actionType)) || scoped.enumeration.actions[0] || null;
}

const forward = executeWarmachineBenchmarkControlPhaseV2(controlStart, {
  routeKey: "verify-control-resource-predecessor-forward",
  maximumSteps: 16,
  selectAction: targetControlAction,
});
assert.equal(forward.ok, true, JSON.stringify(forward.failures));
assert.equal(forward.state.phaseKey, "activation");
assert.equal(forward.state.pieces.find((entry) =>
  entry.pieceKey === "p1-jack").resourcePoints, 2);
assert.ok(forward.receipts.some((receipt) => receipt.actionType === "allocate_resource"));

const reverse = generateWarmachineControlPhasePredecessorsV1(forward.state, {
  resourceEnvelopeKey: "search_focus_predecessor",
  resourceEnvelopeModes: ["zero_active_focus"],
  controlResidueModes: ["absent"],
  maximumControlSteps: 16,
  includeRuntimeDiagnostics: true,
});
assert.equal(reverse.ok, true, JSON.stringify({
  rejected: reverse.rejected,
  unresolved: reverse.unresolved,
  differences: differingPaths(
    reverse.runtimeDiagnostics[0]?.expectedSuccessorState || {},
    reverse.runtimeDiagnostics[0]?.executedSuccessorState || {},
  ).slice(0, 32),
}));
assert.equal(reverse.strictCandidateCount, 1);
assert.equal(reverse.strictRejectedCount, 0);
assert.equal(reverse.unresolvedCount, 0);
const candidate = reverse.candidates[0];
assert.equal(candidate.resourceEnvelopeMode, "zero_active_focus");
assert.equal(candidate.predecessorState.pieces.find((entry) =>
  entry.pieceKey === "p1-caster").resourcePoints, 0);
assert.equal(candidate.predecessorState.pieces.find((entry) =>
  entry.pieceKey === "p1-jack").resourcePoints, 0);
assert.ok(candidate.strictReplaySteps.some((step) =>
  step.actionType === "allocate_resource" && step.targetPieceKey === "p1-jack"));

const route = {
  candidateKey: "control-phase-resource-only-route",
  predecessorState: candidate.predecessorState,
  predecessorStateHash: candidate.predecessorStateHash,
  reverseEdges: [{
    ...candidate,
    predecessorState: undefined,
    strictReceipts: undefined,
    layerKey: "control-resource-verification",
  }],
};
const replay = replayWarmachineTerminalReverseRouteV1(route, forward.state, {
  routeKey: "verify-control-resource-predecessor-replay",
  maximumControlSteps: 16,
});
assert.equal(replay.ok, true, JSON.stringify(replay.failures));
assert.equal(replay.fullRouteStrictReplayCertified, true);
assert.equal(replay.steps[0].actionKeys.length, candidate.strictReplaySteps.length);

const mixedControlStart = structuredClone(controlStart);
mixedControlStart.stateKey = "control-resource-mixed-focus-start";
mixedControlStart.pieces.push(piece("p1-focus-support", {
  position: { xIn: 12, yIn: 8 },
  resourceKind: "focus",
  resourcePoints: 5,
  resourceMax: 6,
}));
const mixedForward = executeWarmachineBenchmarkControlPhaseV2(mixedControlStart, {
  routeKey: "verify-control-resource-mixed-focus-forward",
  maximumSteps: 16,
  selectAction: ({ scoped }) => scoped.enumeration.actions.find((action) => [
    "end_maintenance_phase",
    "end_control_replenishment",
    "end_control_phase",
  ].includes(action.actionType)) || scoped.enumeration.actions[0] || null,
});
assert.equal(mixedForward.ok, true, JSON.stringify(mixedForward.failures));
assert.equal(mixedForward.state.pieces.find((entry) =>
  entry.pieceKey === "p1-caster").resourcePoints, 8);
assert.equal(mixedForward.state.pieces.find((entry) =>
  entry.pieceKey === "p1-jack").resourcePoints, 1);
assert.equal(mixedForward.state.pieces.find((entry) =>
  entry.pieceKey === "p1-focus-support").resourcePoints, 5);
const mixedReverse = generateWarmachineControlPhasePredecessorsV1(mixedForward.state, {
  resourceEnvelopeKey: "search_focus_predecessor",
  resourceEnvelopeModes: ["reverse_focus_control_baseline"],
  controlResidueModes: ["absent"],
  maximumControlSteps: 16,
});
assert.equal(mixedReverse.ok, true, JSON.stringify(mixedReverse.unresolved));
assert.equal(mixedReverse.strictCandidateCount, 1);
const mixedCandidate = mixedReverse.candidates[0];
assert.equal(mixedCandidate.predecessorState.pieces.find((entry) =>
  entry.pieceKey === "p1-caster").resourcePoints, 0);
assert.equal(mixedCandidate.predecessorState.pieces.find((entry) =>
  entry.pieceKey === "p1-jack").resourcePoints, 0);
assert.equal(mixedCandidate.predecessorState.pieces.find((entry) =>
  entry.pieceKey === "p1-focus-support").resourcePoints, 5);
assert.equal(mixedCandidate.strictReplaySteps.some((step) =>
  step.actionType === "allocate_resource"), false);

const passBaselineReverse = generateWarmachineControlPhasePredecessorsV1(
  mixedForward.state,
  {
    resourceEnvelopeModes: ["reverse_focus_control_pass_baseline"],
    controlResidueModes: ["absent"],
    maximumControlSteps: 16,
  },
);
assert.equal(passBaselineReverse.strictCandidateCount, 1,
  JSON.stringify(passBaselineReverse.unresolved));
const passBaselineCandidate = passBaselineReverse.candidates[0];
assert.equal(passBaselineCandidate.predecessorState.pieces.find((entry) =>
  entry.pieceKey === "p1-caster").resourcePoints, 8);
assert.equal(passBaselineCandidate.predecessorState.pieces.find((entry) =>
  entry.pieceKey === "p1-jack").resourcePoints, 0);
assert.equal(passBaselineCandidate.predecessorState.pieces.find((entry) =>
  entry.pieceKey === "p1-focus-support").resourcePoints, 5);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_control_phase_predecessor_v1",
  targetJackFocus: 2,
  strictCandidateCount: reverse.strictCandidateCount,
  strictTransitionCount: candidate.strictTransitionCount,
  strictReplayActionTypes: candidate.strictReplaySteps.map((step) => step.actionType),
  fullRouteStrictReplayCertified: replay.fullRouteStrictReplayCertified,
  mixedFocusBaselineStrictCandidateCount: mixedReverse.strictCandidateCount,
  mixedFocusSupportPreserved: true,
  passBaselineWarcasterFocusPreserved: 8,
  reportHash: reverse.reportHash,
}, null, 2));
