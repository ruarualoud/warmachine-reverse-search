#!/usr/bin/env node

import process from "node:process";

import { stableGraphHash } from
  "../../src/graph/typed-facts-v2.mjs";
import {
  executeWarmachineMatchupTerminalTransitionChunkV1,
} from "../../src/matchup/matchup-terminal-transition-recovery-v1.mjs";
import {
  commitWarmachineMatchupTerminalTransitionCheckpointV1,
  loadWarmachineMatchupTerminalTransitionCheckpointV1,
} from "../../src/matchup/matchup-terminal-transition-checkpoint-store-v1.mjs";

const storeRoot = String(process.argv[2] || "");
const faultPoint = String(process.argv[3] || "none");
if (!storeRoot) throw new Error("transition_recovery_worker_store_required");

const killSelf = () => process.kill(process.pid, "SIGKILL");
let current = loadWarmachineMatchupTerminalTransitionCheckpointV1(storeRoot);
let injected = false;

while (current.status === "in_progress") {
  if (!injected && faultPoint === "before_action") killSelf();
  const next = executeWarmachineMatchupTerminalTransitionChunkV1({
    progress: current,
    maximumTransitionCount: 1,
    runTransition: (state) => {
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
    },
  });
  if (!injected && faultPoint === "after_host_return") killSelf();
  current = commitWarmachineMatchupTerminalTransitionCheckpointV1({
    storeRoot,
    expectedProgressHash: current.progressHash,
    progress: next,
    onFaultPoint: (point) => {
      if (!injected && faultPoint === point) killSelf();
    },
  });
  injected = true;
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  status: current.status,
  progressHash: current.progressHash,
  committedTransitionCount: current.committedTransitionCount,
})}\n`);
