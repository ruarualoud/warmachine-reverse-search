#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { replayWarmachineTerminalReverseRouteV1 } from
  "../src/reverse/replay-terminal-reverse-route-v1.mjs";

function argumentValue(name, fallback = "") {
  return process.argv.find((argument) =>
    argument.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
}

const checkpointPath = path.resolve(argumentValue("checkpoint"));
const bundlePath = path.resolve(argumentValue("bundle"));
const frontierIndex = Math.max(0, Math.floor(Number(argumentValue(
  "frontier-index",
  "0",
))));
assert.equal(fs.existsSync(checkpointPath), true, "checkpoint file is required");
assert.equal(fs.existsSync(bundlePath), true, "materialized bundle file is required");

const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
const materialized = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
const frontier = checkpoint.frontiers?.[frontierIndex];
assert.equal(Boolean(frontier), true, `frontier index out of range: ${frontierIndex}`);

const replay = replayWarmachineTerminalReverseRouteV1({
  candidateKey: String(frontier.labelKey || `frontier-${frontierIndex}`),
  predecessorState: frontier.state,
  predecessorStateHash: frontier.stateHash,
  reverseEdges: frontier.reverseEdges || [],
}, materialized.runtime?.terminalState || {}, {
  routeKey: `verify-materialized-historical-frontier-current-replay:${frontierIndex}`,
});
assert.equal(replay.ok, true, JSON.stringify(replay.failures, null, 2));
assert.equal(replay.priorReceiptHashesConsultedForExecution, false);
assert.equal(replay.freshEnumerationBeforeEveryTransition, true);

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion: "verify_materialized_historical_frontier_current_replay_v1",
  frontierIndex,
  labelKey: frontier.labelKey,
  stateHash: frontier.stateHash,
  reversedPriorTurnCount: frontier.reversedPriorTurnCount,
  reverseEdgeCount: replay.reverseEdgeCount,
  replayedEdgeCount: replay.replayedEdgeCount,
  freshStrictTransitionCount: replay.freshStrictTransitionCount,
  fullRouteStrictReplayCertified: replay.fullRouteStrictReplayCertified,
  priorReceiptHashesConsultedForExecution:
    replay.priorReceiptHashesConsultedForExecution,
  replayHash: replay.replayHash,
}, null, 2)}\n`);
