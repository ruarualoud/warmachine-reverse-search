import assert from "node:assert/strict";

import {
  auditWarmachineTerminalRootedResumeCheckpointV1,
  buildWarmachineTerminalRootedResumeCheckpointV1,
  partitionWarmachineTerminalRootedResumeUnresolvedV1,
} from "../src/reverse/terminal-rooted-to-deployment-v1.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";

const terminalStateHash = "terminal-hash";
const terminalCell = { cellKey: "checkpoint-cell", goalType: "assassination" };
const deployments = {
  player1: { id: "player1", x: 8, y: 24, width: 16, height: 36 },
};
const rawOptions = {
  firstPlayerSideKey: "player1",
  includePass: true,
  includeMovement: false,
  controlResidueModes: ["empty_previous_control"],
};
const state = {
  stateKey: "checkpoint-frontier",
  activeSideKey: "player1",
  phaseKey: "control",
  controlPhaseStepKey: "maintenance",
  turnNumber: 2,
  strictMode: true,
  enforceStrictExecutor: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [],
  terrain: [],
  scenario: { score: { player1: 0, player2: 0 } },
};
const stateHash = warmachineReverseStateSemanticHashV1(state);
const checkpoint = buildWarmachineTerminalRootedResumeCheckpointV1({
  terminalStateHash,
  terminalCell,
  deployments,
  rawOptions,
  deferredFrontiers: [{
    labelKey: "checkpoint-label",
    state,
    stateHash,
    reverseEdges: [],
    reversedPriorTurnCount: 1,
    deploymentGeometryDebt: 3,
  }],
  searchProgress: {
    processedLabelCount: 7,
    expandedLabelCount: 5,
    unresolved: [{
      stageKey: "checkpoint_regression",
      reason: "budget_deferred",
    }],
    rejected: [{
      stageKey: "checkpoint_regression",
      reason: "strict_rejected",
    }],
  },
});
const auditInput = { terminalStateHash, terminalCell, deployments, rawOptions };
const accepted = auditWarmachineTerminalRootedResumeCheckpointV1(
  checkpoint,
  auditInput,
);
assert.equal(accepted.ok, true, JSON.stringify(accepted));
assert.equal(accepted.carriedUnresolvedCount, 1);
assert.equal(accepted.carriedRejectedCount, 1);
assert.equal(checkpoint.searchProgress.processedLabelCount, 7);
assert.equal(checkpoint.searchProgress.expandedLabelCount, 5);

const resumedDispositions =
  partitionWarmachineTerminalRootedResumeUnresolvedV1([
    {
      stageKey: "recursive_turn",
      stateHash,
      reason: "terminal_to_deployment_reverse_turn_budget_exhausted",
    },
    {
      stageKey: "recursive_turn",
      stateHash: "different-state",
      reason: "terminal_to_deployment_reverse_turn_budget_exhausted",
    },
    {
      stageKey: "activation",
      stateHash,
      reason: "activation_reverse_candidate_budget_deferred",
    },
  ], checkpoint.frontiers);
assert.equal(resumedDispositions.reopened.length, 1);
assert.equal(resumedDispositions.carried.length, 2);

const drifted = auditWarmachineTerminalRootedResumeCheckpointV1({
  ...checkpoint,
  hostReceiptHash: "stale-host-receipt",
}, auditInput);
assert.equal(drifted.ok, false);
assert.ok(drifted.issues.includes("ruleset_dependency_drift"));

const searchSourceDrifted = auditWarmachineTerminalRootedResumeCheckpointV1({
  ...checkpoint,
  searchSourceClosureHash: "stale-search-source-closure",
}, auditInput);
assert.equal(searchSourceDrifted.ok, false);
assert.ok(searchSourceDrifted.issues.includes("reverse_search_execution_source_drift"));

const contractChanged = auditWarmachineTerminalRootedResumeCheckpointV1(
  checkpoint,
  {
    ...auditInput,
    rawOptions: { ...rawOptions, includeMovement: true },
  },
);
assert.ok(contractChanged.issues.includes("resume_checkpoint_search_contract_mismatch"));

const boundaryContractChanged = auditWarmachineTerminalRootedResumeCheckpointV1(
  checkpoint,
  {
    ...auditInput,
    rawOptions: {
      ...rawOptions,
      requireTurnOneSideDeploymentBoundary: true,
      unitDeploymentFormationTurnNumbers: [1],
    },
  },
);
assert.ok(boundaryContractChanged.issues.includes(
  "resume_checkpoint_search_contract_mismatch",
));

const boundaryRouteBudgetChanged =
  auditWarmachineTerminalRootedResumeCheckpointV1(
    checkpoint,
    {
      ...auditInput,
      rawOptions: {
        ...rawOptions,
        stopAfterActivationBoundaryRouteCount: 4,
      },
    },
  );
assert.ok(boundaryRouteBudgetChanged.issues.includes(
  "resume_checkpoint_search_contract_mismatch",
));

const materializedBoundaryBudgetChanged =
  auditWarmachineTerminalRootedResumeCheckpointV1(
    checkpoint,
    {
      ...auditInput,
      rawOptions: {
        ...rawOptions,
        currentTurnMaximumHistoricalBoundaryCandidateCount: 4,
      },
    },
  );
assert.ok(materializedBoundaryBudgetChanged.issues.includes(
  "resume_checkpoint_search_contract_mismatch",
));

const actionFamilyContractChanges = [
  { includeChargeCombat: true },
  { chargeCombatActorPieceKeys: ["charger"] },
  { chargeTargetPieceKeys: ["target"] },
  { maximumChargeCombatCandidates: 2 },
  { dedupeEquivalentPathWitnessesForReachabilityBudget: true },
  {
    movementOriginProposalsByTurnAndSide: {
      "2:player1": [{
        actorPieceKey: "mover",
        actionType: "run",
        origin: { xIn: 1, yIn: 2 },
      }],
    },
  },
];
for (const changedOptions of actionFamilyContractChanges) {
  const changed = auditWarmachineTerminalRootedResumeCheckpointV1(
    checkpoint,
    {
      ...auditInput,
      rawOptions: { ...rawOptions, ...changedOptions },
    },
  );
  assert.ok(changed.issues.includes(
    "resume_checkpoint_search_contract_mismatch",
  ), JSON.stringify(changedOptions));
}

const stateTamperedCheckpoint = structuredClone(checkpoint);
stateTamperedCheckpoint.frontiers[0].state.turnNumber = 1;
const stateTampered = auditWarmachineTerminalRootedResumeCheckpointV1(
  stateTamperedCheckpoint,
  auditInput,
);
assert.ok(stateTampered.issues.includes("resume_checkpoint_state_hash_mismatch"));

const qualityLedgerTamperedCheckpoint = structuredClone(checkpoint);
qualityLedgerTamperedCheckpoint.searchProgress.unresolved[0].reason =
  "tampered_budget_deferred";
const qualityLedgerTampered = auditWarmachineTerminalRootedResumeCheckpointV1(
  qualityLedgerTamperedCheckpoint,
  auditInput,
);
assert.ok(qualityLedgerTampered.issues.includes(
  "resume_checkpoint_hash_mismatch",
));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_terminal_resume_checkpoint_v1",
  checkpointHash: checkpoint.checkpointHash,
  frontierCount: checkpoint.frontierCount,
  driftDispositionReason: drifted.issues[0],
  searchSourceDriftDetected: true,
  contractMismatchDetected: true,
  boundaryContractMismatchDetected: true,
  boundaryRouteBudgetContractMismatchDetected: true,
  materializedBoundaryBudgetContractMismatchDetected: true,
  actionFamilyContractMismatchDetected: true,
  tamperedStateDetected: true,
  carriedQualityLedgerPreserved: true,
  tamperedQualityLedgerDetected: true,
}, null, 2));
