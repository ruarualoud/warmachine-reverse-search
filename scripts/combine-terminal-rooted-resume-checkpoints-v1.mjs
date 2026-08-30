#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";

function argumentValues(name) {
  return process.argv.filter((argument) =>
    argument.startsWith(`--${name}=`)).map((argument) =>
    argument.slice(name.length + 3));
}

function argumentValue(name, fallback = "") {
  return argumentValues(name)[0] || fallback;
}

function writeJsonAtomic(targetPath, value) {
  const target = path.resolve(targetPath);
  const directory = path.dirname(target);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx");
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, target);
    const directoryDescriptor = fs.openSync(directory, "r");
    try {
      fs.fsyncSync(directoryDescriptor);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  }
}

function checkpointCore(checkpoint = {}) {
  const { checkpointHash: _checkpointHash, ...core } = checkpoint;
  return stableGraphValue(core);
}

const checkpointPaths = argumentValues("checkpoint").map((value) =>
  path.resolve(value));
const outputPath = path.resolve(argumentValue("output"));
assert.equal(checkpointPaths.length >= 2, true,
  "at least two --checkpoint inputs are required");
assert.notEqual(outputPath, path.resolve(""), "--output is required");
const checkpoints = checkpointPaths.map((checkpointPath) =>
  JSON.parse(fs.readFileSync(checkpointPath, "utf8")));

for (const checkpoint of checkpoints) {
  assert.equal(stableGraphHash(checkpointCore(checkpoint)), checkpoint.checkpointHash,
    "input checkpoint hash mismatch");
}
const invariantKeys = [
  "schemaVersion",
  "hostReceiptHash",
  "searchSourceClosureHash",
  "terminalStateHash",
  "terminalCellKey",
  "resumeContractHash",
];
for (const checkpoint of checkpoints.slice(1)) {
  for (const key of invariantKeys) {
    assert.deepEqual(checkpoint[key], checkpoints[0][key],
      `checkpoint ${key} mismatch`);
  }
}

const labels = new Map();
for (const checkpoint of checkpoints) {
  for (const frontier of checkpoint.frontiers || []) {
    assert.equal(warmachineReverseStateSemanticHashV1(frontier.state),
      frontier.stateHash, "frontier semantic hash mismatch");
    const prior = labels.get(frontier.labelKey);
    if (prior) {
      assert.equal(stableGraphHash(prior), stableGraphHash(frontier),
        "same label key has conflicting frontier content");
    } else {
      labels.set(frontier.labelKey, frontier);
    }
  }
}
const frontiers = [...labels.values()].sort((left, right) =>
  left.labelKey.localeCompare(right.labelKey));
const base = checkpoints[0];
const core = stableGraphValue({
  schemaVersion: base.schemaVersion,
  hostReceiptHash: base.hostReceiptHash,
  searchSourceClosureHash: base.searchSourceClosureHash,
  terminalStateHash: base.terminalStateHash,
  terminalCellKey: base.terminalCellKey,
  resumeContractHash: base.resumeContractHash,
  frontierCount: frontiers.length,
  frontiers,
});
const output = {
  ...core,
  checkpointHash: stableGraphHash(core),
};
writeJsonAtomic(outputPath, output);

process.stdout.write(`${JSON.stringify({
  ok: true,
  inputCheckpointCount: checkpoints.length,
  inputFrontierCount: checkpoints.reduce((sum, checkpoint) =>
    sum + Number(checkpoint.frontierCount || 0), 0),
  mergedFrontierCount: output.frontierCount,
  distinctExactStateCount: new Set(frontiers.map((frontier) =>
    frontier.stateHash)).size,
  checkpointHash: output.checkpointHash,
  outputPath,
}, null, 2)}\n`);
