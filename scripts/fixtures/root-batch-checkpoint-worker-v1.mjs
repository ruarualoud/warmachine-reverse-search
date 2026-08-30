#!/usr/bin/env node

import process from "node:process";

import { stableGraphHash, stableGraphValue } from
  "../../src/graph/typed-facts-v2.mjs";
import {
  acquireWarmachineMatchupTerminalRootBatchWriterV1,
  commitWarmachineMatchupTerminalRootBatchCheckpointFileV1,
  loadWarmachineMatchupTerminalRootBatchCheckpointFileV1,
  releaseWarmachineMatchupTerminalRootBatchWriterV1,
} from
  "../../src/matchup/matchup-terminal-root-batch-checkpoint-store-v1.mjs";

const checkpointPath = process.argv[2];
const faultPoint = process.argv[3] || "none";
const owner = acquireWarmachineMatchupTerminalRootBatchWriterV1(checkpointPath);
const current = loadWarmachineMatchupTerminalRootBatchCheckpointFileV1(
  checkpointPath,
);
const core = stableGraphValue({
  schemaVersion: "ticket17_root_batch_checkpoint_fixture_v1",
  revision: Number(current.revision || 0) + 1,
  committedValue: Number(current.committedValue || 0) + 1,
});
const next = { ...core, checkpointHash: stableGraphHash(core) };
commitWarmachineMatchupTerminalRootBatchCheckpointFileV1({
  checkpointPath,
  owner,
  expectedCheckpointHash: current.checkpointHash,
  checkpoint: next,
  onFaultPoint: (observed) => {
    if (observed === faultPoint) process.kill(process.pid, "SIGKILL");
  },
});
releaseWarmachineMatchupTerminalRootBatchWriterV1(checkpointPath, owner);
