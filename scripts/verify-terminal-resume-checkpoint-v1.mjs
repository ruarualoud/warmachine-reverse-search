import assert from "node:assert/strict";

import {
  auditWarmachineTerminalRootedResumeCheckpointV1,
  buildWarmachineTerminalRootedResumeCheckpointV1,
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
});
const auditInput = { terminalStateHash, terminalCell, deployments, rawOptions };
const accepted = auditWarmachineTerminalRootedResumeCheckpointV1(
  checkpoint,
  auditInput,
);
assert.equal(accepted.ok, true, JSON.stringify(accepted));

const drifted = auditWarmachineTerminalRootedResumeCheckpointV1({
  ...checkpoint,
  hostReceiptHash: "stale-host-receipt",
}, auditInput);
assert.equal(drifted.ok, false);
assert.ok(drifted.issues.includes("ruleset_dependency_drift"));

const contractChanged = auditWarmachineTerminalRootedResumeCheckpointV1(
  checkpoint,
  {
    ...auditInput,
    rawOptions: { ...rawOptions, includeMovement: true },
  },
);
assert.ok(contractChanged.issues.includes("resume_checkpoint_search_contract_mismatch"));

const stateTamperedCheckpoint = structuredClone(checkpoint);
stateTamperedCheckpoint.frontiers[0].state.turnNumber = 1;
const stateTampered = auditWarmachineTerminalRootedResumeCheckpointV1(
  stateTamperedCheckpoint,
  auditInput,
);
assert.ok(stateTampered.issues.includes("resume_checkpoint_state_hash_mismatch"));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_terminal_resume_checkpoint_v1",
  checkpointHash: checkpoint.checkpointHash,
  frontierCount: checkpoint.frontierCount,
  driftDispositionReason: drifted.issues[0],
  contractMismatchDetected: true,
  tamperedStateDetected: true,
}, null, 2));
