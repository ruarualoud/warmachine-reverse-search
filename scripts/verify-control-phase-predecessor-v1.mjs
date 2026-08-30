import assert from "node:assert/strict";

import { executeWarmachineBenchmarkControlPhaseV2 } from
  "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import { generateWarmachineControlPhasePredecessorsV1 } from
  "../src/reverse/control-phase-predecessor-v1.mjs";
import { reverseWarmachineActivationSequenceV2 } from
  "../src/reverse/activation-sequence-predecessor-v2.mjs";
import {
  reissueWarmachineTerminalReverseRouteV1,
  replayWarmachineTerminalReverseRouteV1,
} from
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

const allocationBaselineReverse = generateWarmachineControlPhasePredecessorsV1(
  forward.state,
  {
    resourceEnvelopeModes: ["reverse_focus_allocation_baseline"],
    controlResidueModes: ["absent"],
    maximumControlSteps: 16,
  },
);
assert.equal(allocationBaselineReverse.strictCandidateCount, 1,
  JSON.stringify(allocationBaselineReverse.unresolved));
const allocationBaselineCandidate = allocationBaselineReverse.candidates[0];
assert.equal(allocationBaselineCandidate.predecessorState.pieces.find((entry) =>
  entry.pieceKey === "p1-caster").resourcePoints, 8);
assert.equal(allocationBaselineCandidate.predecessorState.pieces.find((entry) =>
  entry.pieceKey === "p1-jack").resourcePoints, 0);
assert.ok(allocationBaselineCandidate.strictReplaySteps.some((step) =>
  step.actionType === "allocate_resource" && step.targetPieceKey === "p1-jack"));

const furyControlStart = structuredClone(controlStart);
furyControlStart.stateKey = "control-fury-leech-predecessor-start";
furyControlStart.pieces = [
  piece("p1-lock", {
    modelRole: "warlock",
    modelType: "Warlock",
    isWarlock: true,
    resourceKind: "fury",
    resourcePoints: 0,
    resourceMax: 6,
    arc: 6,
    controlRangeIn: 12,
    battlegroupId: "p1-fury-bg",
  }),
  piece("p1-beast", {
    modelRole: "warbeast",
    modelType: "Warbeast",
    isWarbeast: true,
    position: { xIn: 10, yIn: 8 },
    resourceKind: "fury",
    resourcePoints: 1,
    resourceMax: 4,
    furyThreshold: 4,
    controllerPieceKey: "p1-lock",
    battlegroupControllerPieceKey: "p1-lock",
    battlegroupId: "p1-fury-bg",
  }),
  piece("p2-fury-leader", {
    sideKey: "player2",
    modelRole: "warlock",
    modelType: "Warlock",
    isWarlock: true,
    position: { xIn: 38, yIn: 38 },
    resourceKind: "fury",
    resourcePoints: 0,
    resourceMax: 6,
    arc: 6,
  }),
];
for (const entry of furyControlStart.pieces) {
  entry.resource2 = entry.resourcePoints;
  entry.fury = entry.resourcePoints;
}
const furyForward = executeWarmachineBenchmarkControlPhaseV2(furyControlStart, {
  routeKey: "verify-control-fury-leech-forward",
  maximumSteps: 16,
  selectAction: ({ scoped }) => scoped.enumeration.actions.find((action) =>
    action.actionType === "leech_fury" && action.targetPieceKey === "p1-beast") ||
    scoped.enumeration.actions.find((action) => [
      "end_maintenance_phase",
      "end_control_replenishment",
      "end_control_phase",
    ].includes(action.actionType)) || scoped.enumeration.actions[0] || null,
});
assert.equal(furyForward.ok, true, JSON.stringify(furyForward.failures));
assert.equal(furyForward.state.pieces.find((entry) =>
  entry.pieceKey === "p1-lock").resourcePoints, 1);
assert.equal(furyForward.state.pieces.find((entry) =>
  entry.pieceKey === "p1-beast").resourcePoints, 0);
const furyReverse = generateWarmachineControlPhasePredecessorsV1(
  furyForward.state,
  {
    resourceEnvelopeModes: ["reverse_single_fury_leech_baseline"],
    controlResidueModes: ["absent"],
    maximumControlSteps: 16,
  },
);
assert.equal(furyReverse.strictCandidateCount, 1,
  JSON.stringify(furyReverse.unresolved));
const furyCandidate = furyReverse.candidates[0];
assert.equal(furyCandidate.predecessorState.pieces.find((entry) =>
  entry.pieceKey === "p1-lock").resourcePoints, 0);
assert.equal(furyCandidate.predecessorState.pieces.find((entry) =>
  entry.pieceKey === "p1-beast").resourcePoints, 1);
assert.ok(furyCandidate.strictReplaySteps.some((step) =>
  step.actionType === "leech_fury" && step.targetPieceKey === "p1-beast"));

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

const staleHashRoute = structuredClone(route);
staleHashRoute.predecessorStateHash = "stale-opening-state-hash";
staleHashRoute.reverseEdges[0].predecessorStateHash = "stale-predecessor-state-hash";
staleHashRoute.reverseEdges[0].successorStateHash = "stale-successor-state-hash";
staleHashRoute.reverseEdges[0].strictReceiptHash = "stale-receipt-hash";
staleHashRoute.reverseEdges[0].strictStepReceiptHashes = ["stale-step-receipt-hash"];
const reissued = reissueWarmachineTerminalReverseRouteV1(
  staleHashRoute,
  forward.state,
  { routeKey: "verify-control-resource-current-host-reissue" },
);
assert.equal(reissued.ok, true, JSON.stringify(reissued.failures));
assert.equal(reissued.priorReceiptHashesConsultedForExecution, false);
assert.equal(reissued.storedActionWitnessesConsultedForExecution, true);
assert.equal(reissued.reissuedRoute.reverseEdges[0].predecessorStateHash,
  candidate.predecessorStateHash);
assert.notEqual(reissued.reissuedRoute.reverseEdges[0].strictReceiptHash,
  "stale-receipt-hash");
const reissuedReplay = replayWarmachineTerminalReverseRouteV1(
  reissued.reissuedRoute,
  forward.state,
  { routeKey: "verify-control-resource-reissued-route-replay" },
);
assert.equal(reissuedReplay.ok, true, JSON.stringify(reissuedReplay.failures));

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

const powerUpSpentActivationEnd = structuredClone(mixedForward.state);
powerUpSpentActivationEnd.stateKey = "power-up-spent-activation-end";
powerUpSpentActivationEnd.pieces = powerUpSpentActivationEnd.pieces.filter((entry) =>
  entry.pieceKey !== "p1-focus-support");
for (const entry of powerUpSpentActivationEnd.pieces) {
  if (entry.sideKey !== "player1") continue;
  entry.activated = true;
  if (entry.pieceKey === "p1-caster") entry.resourcePoints = 8;
  if (entry.pieceKey === "p1-jack") entry.resourcePoints = 0;
  entry.resource2 = entry.resourcePoints;
  if (entry.resourceKind === "focus") entry.focus = entry.resourcePoints;
}
powerUpSpentActivationEnd.pieces.find((entry) =>
  entry.pieceKey === "p1-jack").position = { xIn: 30, yIn: 8 };
const spentPowerUpActivationReverse = reverseWarmachineActivationSequenceV2(
  powerUpSpentActivationEnd,
  {
    sideKey: "player1",
    deployments: {
      p1_deploy: { id: "p1_deploy", x: 8, y: 8, width: 16, height: 16 },
      p2_deploy: { id: "p2_deploy", x: 40, y: 40, width: 16, height: 16 },
    },
    movementActionTypes: ["run"],
    maximumDepth: 4,
    maximumLabels: 8,
    maximumUniqueStates: 8,
    maximumGroupsPerExpansion: 1,
    maximumCandidatesPerExpansion: 1,
    maximumMovementStrictCandidateAttempts: 8,
    groupOrderKeys: ["p1-jack", "p1-caster"],
    stopAfterBoundaryRouteCount: 1,
  },
);
assert.equal(spentPowerUpActivationReverse.runtimeBoundaries.length, 1,
  JSON.stringify(spentPowerUpActivationReverse.unresolved));
const spentPowerUpBoundary = spentPowerUpActivationReverse.runtimeBoundaries[0];
const controllerAnchoredRunEdge = spentPowerUpBoundary.reverseEdges.find((edge) =>
  edge.actorPieceKey === "p1-jack" && edge.actionType === "run");
assert.ok(controllerAnchoredRunEdge, JSON.stringify(spentPowerUpBoundary.reverseEdges));
assert.equal(controllerAnchoredRunEdge.reverseRestoredResourcePoints, 1);
assert.equal(controllerAnchoredRunEdge.movementProposal.proposalSource,
  "controller_control_range_resource_origin_v1");
const spentPowerUpControlReverse = generateWarmachineControlPhasePredecessorsV1(
  spentPowerUpBoundary.state,
  {
    resourceEnvelopeModes: ["reverse_focus_control_baseline"],
    controlResidueModes: ["absent"],
    maximumControlSteps: 16,
  },
);
assert.equal(spentPowerUpControlReverse.strictCandidateCount, 1,
  JSON.stringify({
    rejected: spentPowerUpControlReverse.rejected,
    unresolved: spentPowerUpControlReverse.unresolved,
  }));
assert.equal(spentPowerUpControlReverse.candidates[0].predecessorState.pieces.find(
  (entry) => entry.pieceKey === "p1-jack").resourcePoints, 0);

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
  allocationBaselineStrictCandidateCount:
    allocationBaselineReverse.strictCandidateCount,
  furyLeechBaselineStrictCandidateCount: furyReverse.strictCandidateCount,
  passBaselineWarcasterFocusPreserved: 8,
  reportHash: reverse.reportHash,
}, null, 2));
