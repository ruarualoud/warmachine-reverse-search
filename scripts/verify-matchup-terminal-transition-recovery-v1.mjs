#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  bindWarmachineBenchmarkExplicitMovementPathV2,
  executeWarmachineBenchmarkActivationV2,
} from "../src/benchmark/fixed-steamroller-benchmark-v2.mjs";
import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import {
  auditWarmachineMatchupTerminalTransitionProgressV1,
  buildWarmachineMatchupTerminalTransitionProgressV1,
  executeWarmachineMatchupTerminalTransitionChunkV1,
} from "../src/matchup/matchup-terminal-transition-recovery-v1.mjs";
import {
  commitWarmachineMatchupTerminalTransitionCheckpointV1,
  initializeWarmachineMatchupTerminalTransitionCheckpointV1,
  loadWarmachineMatchupTerminalTransitionCheckpointV1,
} from "../src/matchup/matchup-terminal-transition-checkpoint-store-v1.mjs";
import {
  acquireWarmachineMatchupTerminalRootBatchWriterV1,
  commitWarmachineMatchupTerminalRootBatchCheckpointFileV1,
  releaseWarmachineMatchupTerminalRootBatchWriterV1,
} from
  "../src/matchup/matchup-terminal-root-batch-checkpoint-store-v1.mjs";
import {
  auditWarmachineMatchupAssassinationTransitionProgressV1,
  buildWarmachineMatchupAssassinationTransitionProgressV1,
} from "../src/matchup/matchup-assassination-transition-progress-v1.mjs";
import {
  buildWarmachineMatchupTerminalCandidatePlanV1,
  buildWarmachineMatchupTerminalCandidateProgressV1,
} from "../src/matchup/matchup-terminal-candidate-ledger-v1.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(
  scriptDirectory,
  "fixtures/transition-recovery-worker-v1.mjs",
);
const rootBatchWorkerPath = path.join(
  scriptDirectory,
  "fixtures/root-batch-checkpoint-worker-v1.mjs",
);

function model(overrides = {}) {
  return {
    pieceKey: overrides.pieceKey,
    label: overrides.pieceKey,
    sideKey: overrides.sideKey || "player1",
    modelRole: "model",
    modelType: "model",
    position: overrides.position,
    baseSizeIn: 1.18,
    speedIn: overrides.speedIn || 6,
    defense: 12,
    armor: 16,
    mat: 6,
    rat: 6,
    damage: { boxesRemaining: 10, maxBoxes: 10 },
    statusTags: [],
    specialRules: [],
    attackProfiles: [],
    activated: false,
  };
}

function realRejectedActivation() {
  const mover = model({
    pieceKey: "ticket17-mover",
    position: { xIn: 2, yIn: 10 },
  });
  const enemy = model({
    pieceKey: "ticket17-enemy",
    sideKey: "player2",
    position: { xIn: 18, yIn: 18 },
  });
  const initial = {
    stateKey: "ticket17-real-reject",
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 1,
    strictMode: true,
    board: { widthIn: 24, heightIn: 24 },
    pieces: [mover, enemy],
    terrain: [],
    scenario: { zones: [], flags: [], score: { player1: 0, player2: 0 } },
  };
  const state = bindWarmachineBenchmarkExplicitMovementPathV2(initial, {
    actorPieceKey: mover.pieceKey,
    actionType: "advance",
    pathKey: "legal",
    waypoints: [{ xIn: 5, yIn: 10 }],
    proposalSource: "ticket17_real_reject",
  });
  const actionKey = `${mover.pieceKey}:advance-path:legal:v1`;
  return executeWarmachineBenchmarkActivationV2(state, mover.pieceKey, {
    routeKey: "ticket17-real-rejected-activation",
    enumerationScope: {
      actionFamilyKeys: ["movement", "timing"],
      movementPathKindKeys: ["explicit_path"],
    },
    selectAction: ({ stepIndex }) => stepIndex === 0
      ? { actionKey, actionPatch: { actionKey: "tampered-action-key" } }
      : null,
    maxSteps: 1,
  });
}

const rejectedActivation = realRejectedActivation();
assert.equal(rejectedActivation.ok, false);
assert.equal(rejectedActivation.reason, "strict_action_not_enumerated");
assert.equal(rejectedActivation.transitionCount, 0);
assert.equal(rejectedActivation.receipts.length, 0);
assert.equal(rejectedActivation.rejectedReceipts.length, 1);
assert.equal(rejectedActivation.rejectedReceipts[0].transitionOk, false);
assert.equal(rejectedActivation.startingStateHash,
  rejectedActivation.endingStateHash);

const initialProgress = buildWarmachineMatchupTerminalTransitionProgressV1({
  executionKey: "ticket17-transition-sequence",
  activationGroupKey: "group-a",
  executionReceiptHash: "execution-receipt-a",
  initialState: { counter: 0 },
});
const runSuccessfulTransition = (state) => {
  const counter = Number(state.counter || 0) + 1;
  const nextState = { counter };
  return {
    ok: true,
    completed: counter >= 3,
    state: nextState,
    receipt: {
      receiptHash: `receipt-${counter}`,
      actionKey: `action-${counter}`,
      transitionOk: true,
      stateHashAfter: stableGraphHash(nextState),
    },
    selectionAudit: [{ actionKey: `action-${counter}` }],
  };
};
const oneShot = executeWarmachineMatchupTerminalTransitionChunkV1({
  progress: initialProgress,
  maximumTransitionCount: 8,
  runTransition: runSuccessfulTransition,
});
assert.equal(oneShot.status, "completed");
assert.equal(oneShot.committedTransitionCount, 3);

let chunked = initialProgress;
while (chunked.status === "in_progress") {
  chunked = executeWarmachineMatchupTerminalTransitionChunkV1({
    progress: chunked,
    maximumTransitionCount: 1,
    runTransition: runSuccessfulTransition,
  });
}
assert.equal(chunked.status, "completed");
assert.deepEqual(chunked.committedState, oneShot.committedState);
assert.deepEqual(chunked.committedReceiptHashes, oneShot.committedReceiptHashes);
assert.deepEqual(chunked.committedSelectionAudit, oneShot.committedSelectionAudit);
assert.equal(auditWarmachineMatchupTerminalTransitionProgressV1(chunked).ok, true);

const failed = executeWarmachineMatchupTerminalTransitionChunkV1({
  progress: initialProgress,
  maximumTransitionCount: 1,
  runTransition: () => ({
    ok: false,
    reason: "strict_action_not_enumerated",
    state: { counter: 99 },
    receipt: {
      receiptHash: "rejected-receipt-1",
      actionKey: "rejected-action-1",
      transitionOk: false,
    },
  }),
});
assert.equal(failed.status, "failed");
assert.equal(failed.disposition, "strict_rejected");
assert.equal(failed.committedTransitionCount, 0);
assert.deepEqual(failed.committedState, initialProgress.committedState);
assert.deepEqual(failed.committedReceipts, []);
assert.equal(failed.rejectionEvidence.length, 1);
assert.equal(failed.rejectionEvidence[0].receipt.transitionOk, false);

const failedCandidatePlan = buildWarmachineMatchupTerminalCandidatePlanV1({
  taskKey: "ticket17-failed-candidate-task",
  behaviorSignatureHash: "ticket17-failed-candidate-behavior",
  goalFamilyContractVersion: "ticket17-assassination-v1",
  candidateEnumerationVersion: "ticket17-single-slot-v1",
  executionReceiptHash: "execution-receipt-a",
  slots: [{
    actorPieceKey: "actor",
    targetPieceKey: "target",
    geometryCandidateKey: "geometry",
    actionLineKey: "line",
    attackProfileKey: "profile",
    attackMode: "melee",
    attackSourceKind: "weapon",
  }],
});
const failedCandidateProgress =
  buildWarmachineMatchupTerminalCandidateProgressV1({
    candidatePlan: failedCandidatePlan,
  });
const candidateCursorProgress =
  buildWarmachineMatchupAssassinationTransitionProgressV1({
    taskKey: failedCandidatePlan.taskKey,
    behaviorSignatureHash: failedCandidatePlan.behaviorSignatureHash,
    executionReceiptHash: failedCandidatePlan.executionReceiptHash,
    candidatePlan: failedCandidatePlan,
    candidateProgress: failedCandidateProgress,
    activeSlotIndex: 0,
    activeCandidateIdentityHash:
      failedCandidatePlan.slots[0].candidateIdentityHash,
    completedActionLines: [],
    actionLineIndex: 0,
    actionLineIdentityHash: "candidate_cursor_pending_action_line",
    phase: "candidate",
    primaryProgress: {},
    replayProgress: null,
  });
assert.equal(
  auditWarmachineMatchupAssassinationTransitionProgressV1(
    candidateCursorProgress,
  ).ok,
  true,
);
assert.throws(() =>
  buildWarmachineMatchupAssassinationTransitionProgressV1({
    taskKey: failedCandidatePlan.taskKey,
    behaviorSignatureHash: failedCandidatePlan.behaviorSignatureHash,
    executionReceiptHash: failedCandidatePlan.executionReceiptHash,
    candidatePlan: failedCandidatePlan,
    candidateProgress: failedCandidateProgress,
    activeSlotIndex: 0,
    activeCandidateIdentityHash:
      failedCandidatePlan.slots[0].candidateIdentityHash,
    completedActionLines: [],
    actionLineIndex: 0,
    actionLineIdentityHash: "failed-line",
    phase: "primary",
    primaryProgress: failed,
    replayProgress: null,
  }), /assassination_transition_primary_phase_invalid/);

const tampered = structuredClone(chunked);
tampered.committedState.counter = 99;
assert.equal(auditWarmachineMatchupTerminalTransitionProgressV1(tampered).ok,
  false);

const faultPoints = [
  "before_action",
  "after_host_return",
  "after_checkpoint_write_before_pointer_publish",
];
const recoveryRows = [];
for (const faultPoint of faultPoints) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wm-ticket17-"));
  try {
    initializeWarmachineMatchupTerminalTransitionCheckpointV1({
      storeRoot,
      progress: initialProgress,
    });
    const firstCommitted = executeWarmachineMatchupTerminalTransitionChunkV1({
      progress: initialProgress,
      maximumTransitionCount: 1,
      runTransition: runSuccessfulTransition,
    });
    commitWarmachineMatchupTerminalTransitionCheckpointV1({
      storeRoot,
      expectedProgressHash: initialProgress.progressHash,
      progress: firstCommitted,
    });
    const killed = spawnSync(process.execPath, [workerPath, storeRoot, faultPoint], {
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(killed.signal, "SIGKILL", `${faultPoint}:${killed.stderr}`);
    const afterKill = loadWarmachineMatchupTerminalTransitionCheckpointV1(
      storeRoot,
    );
    assert.equal(afterKill.progressHash, firstCommitted.progressHash);
    assert.equal(afterKill.committedTransitionCount, 1);

    const resumed = spawnSync(process.execPath, [workerPath, storeRoot, "none"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(resumed.status, 0, `${faultPoint}:${resumed.stderr}`);
    const final = loadWarmachineMatchupTerminalTransitionCheckpointV1(storeRoot);
    assert.equal(final.status, "completed");
    assert.deepEqual(final.committedState, oneShot.committedState);
    assert.deepEqual(final.committedReceiptHashes,
      oneShot.committedReceiptHashes);
    assert.deepEqual(final.committedReceiptHashes,
      ["receipt-1", "receipt-2", "receipt-3"]);
    assert.throws(() =>
      commitWarmachineMatchupTerminalTransitionCheckpointV1({
        storeRoot,
        expectedProgressHash: initialProgress.progressHash,
        progress: oneShot,
      }), /transition_checkpoint_compare_and_swap_failed/);
    recoveryRows.push({
      faultPoint,
      afterKillProgressHash: afterKill.progressHash,
      finalProgressHash: final.progressHash,
    });
  } finally {
    fs.rmSync(storeRoot, { recursive: true, force: true });
  }
}

const rootStoreDirectory = fs.mkdtempSync(path.join(
  os.tmpdir(),
  "wm-ticket17-root-store-",
));
let rootStoreRecovery = null;
try {
  const checkpointPath = path.join(rootStoreDirectory, "checkpoint.json");
  const rootCore = {
    schemaVersion: "ticket17_root_batch_checkpoint_fixture_v1",
    revision: 0,
    committedValue: 0,
  };
  const rootInitial = {
    ...rootCore,
    checkpointHash: stableGraphHash(rootCore),
  };
  fs.writeFileSync(
    checkpointPath,
    `${JSON.stringify(rootInitial, null, 2)}\n`,
    "utf8",
  );
  const owner = acquireWarmachineMatchupTerminalRootBatchWriterV1(
    checkpointPath,
  );
  assert.throws(() =>
    acquireWarmachineMatchupTerminalRootBatchWriterV1(checkpointPath),
  /terminal_root_checkpoint_writer_lock_held/);
  releaseWarmachineMatchupTerminalRootBatchWriterV1(checkpointPath, owner);
  const killed = spawnSync(process.execPath, [
    rootBatchWorkerPath,
    checkpointPath,
    "after_checkpoint_write_before_publish",
  ], { encoding: "utf8", timeout: 30_000 });
  assert.equal(killed.signal, "SIGKILL", killed.stderr);
  const afterKill = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  assert.equal(afterKill.checkpointHash, rootInitial.checkpointHash);
  assert.equal(afterKill.committedValue, 0);
  const resumed = spawnSync(process.execPath, [
    rootBatchWorkerPath,
    checkpointPath,
    "none",
  ], { encoding: "utf8", timeout: 30_000 });
  assert.equal(resumed.status, 0, resumed.stderr);
  const afterResume = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  assert.equal(afterResume.committedValue, 1);
  const staleOwner = acquireWarmachineMatchupTerminalRootBatchWriterV1(
    checkpointPath,
  );
  const staleCore = {
    schemaVersion: "ticket17_root_batch_checkpoint_fixture_v1",
    revision: 2,
    committedValue: 2,
  };
  assert.throws(() =>
    commitWarmachineMatchupTerminalRootBatchCheckpointFileV1({
      checkpointPath,
      owner: staleOwner,
      expectedCheckpointHash: rootInitial.checkpointHash,
      checkpoint: {
        ...staleCore,
        checkpointHash: stableGraphHash(staleCore),
      },
    }), /terminal_root_checkpoint_compare_and_swap_failed/);
  releaseWarmachineMatchupTerminalRootBatchWriterV1(
    checkpointPath,
    staleOwner,
  );
  rootStoreRecovery = {
    checkpointHashBefore: rootInitial.checkpointHash,
    checkpointHashAfter: afterResume.checkpointHash,
    unpublishedCheckpointIgnored: true,
    staleWriterRecovered: true,
    singleWriterEnforced: true,
    staleCompareAndSwapRejected: true,
  };
} finally {
  fs.rmSync(rootStoreDirectory, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion: "verify_matchup_terminal_transition_recovery_v1",
  realStrictRejectSeparated: true,
  oneShotProgressHash: oneShot.progressHash,
  chunkedProgressHash: chunked.progressHash,
  failedProgressHash: failed.progressHash,
  faultPointCount: recoveryRows.length,
  recoveryRows,
  rootStoreRecovery,
  claimBoundary: "This verifier proves transition receipt separation, sealed progress, one-shot/chunk equivalence and durable recovery for three injected process-kill points. It does not prove every terminal adapter, route or operating-system failure mode.",
}, null, 2)}\n`);
