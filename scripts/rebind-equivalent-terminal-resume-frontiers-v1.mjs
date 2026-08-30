#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";

function argumentValue(name, fallback = "") {
  return process.argv.find((argument) =>
    argument.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
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
  return core;
}

function executionProjection(edge = {}) {
  const movementProposal = edge.movementProposal || null;
  const strictReplaySteps = edge.strictReplaySteps || [];
  return stableGraphValue({
    operatorKey: String(edge.operatorKey || ""),
    layerKey: String(edge.layerKey || ""),
    actionType: String(edge.actionType || ""),
    actorPieceKey: String(edge.actorPieceKey || ""),
    targetPieceKey: String(edge.targetPieceKey || ""),
    activationGroupId: String(edge.activationGroupId || ""),
    transitionActionKey: String(edge.transitionActionKey || ""),
    strictReplaySteps,
    matchingOutcomes: strictReplaySteps.length
      ? []
      : edge.matchingOutcomes || [],
    movementProposal: movementProposal
      ? {
        pathKey: String(movementProposal.pathKey || ""),
        waypoints: movementProposal.waypoints || [],
        pathsByModel: movementProposal.pathsByModel || [],
      }
      : null,
  });
}

function routeExecutionWitness(frontier = {}) {
  const recomputedStateHash = warmachineReverseStateSemanticHashV1(
    frontier.state || {},
  );
  assert.equal(recomputedStateHash, String(frontier.stateHash || ""),
    `frontier semantic state hash mismatch: ${frontier.labelKey || ""}`);
  return stableGraphValue({
    stateHash: recomputedStateHash,
    edges: (frontier.reverseEdges || []).map(executionProjection),
  });
}

function checkpointFrontier(row = {}) {
  return stableGraphValue({
    labelKey: String(row.labelKey || ""),
    state: row.state,
    stateHash: String(row.stateHash || ""),
    reverseEdges: row.reverseEdges || [],
    reversedPriorTurnCount: Number(row.reversedPriorTurnCount || 0),
    deploymentGeometryDebt: Number(row.deploymentGeometryDebt || 0),
  });
}

const sourcePath = path.resolve(argumentValue("source-checkpoint"));
const reissuedPath = path.resolve(argumentValue("reissued-checkpoint"));
const outputPath = path.resolve(argumentValue("output"));
const proofPath = path.resolve(argumentValue("proof-output"));
assert.notEqual(sourcePath, path.resolve(""),
  "--source-checkpoint is required");
assert.notEqual(reissuedPath, path.resolve(""),
  "--reissued-checkpoint is required");
assert.notEqual(outputPath, path.resolve(""), "--output is required");
assert.notEqual(proofPath, path.resolve(""), "--proof-output is required");

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const reissued = JSON.parse(fs.readFileSync(reissuedPath, "utf8"));
assert.equal(stableGraphHash(stableGraphValue(checkpointCore(source))),
  source.checkpointHash, "source checkpoint hash mismatch");
assert.equal(stableGraphHash(stableGraphValue(checkpointCore(reissued))),
  reissued.checkpointHash, "reissued checkpoint hash mismatch");
assert.equal((source.frontiers || []).length > 0, true,
  "source checkpoint has no frontiers");
assert.equal(reissued.frontiers?.length, 1,
  "reissued checkpoint must contain exactly one strict route witness");

const sourceWitness = routeExecutionWitness(source.frontiers[0]);
const sourceWitnessHash = stableGraphHash(sourceWitness);
const sourceLabelKeys = source.frontiers.map((frontier) =>
  String(frontier.labelKey || ""));
assert.equal(new Set(sourceLabelKeys).size, sourceLabelKeys.length,
  "source frontier labels must be unique");
for (const [index, frontier] of source.frontiers.entries()) {
  assert.equal(stableGraphHash(routeExecutionWitness(frontier)),
    sourceWitnessHash,
  `source frontier ${index} is not execution-equivalent to frontier zero`);
}

const reissuedFrontier = reissued.frontiers[0];
assert.equal(reissuedFrontier.reversedPriorTurnCount,
  source.frontiers[0].reversedPriorTurnCount);
assert.equal((reissuedFrontier.reverseEdges || []).length,
  (source.frontiers[0].reverseEdges || []).length);
const reboundFrontiers = source.frontiers.map((sourceFrontier) =>
  checkpointFrontier({
    ...reissuedFrontier,
    labelKey: `counterlead-reissued:${sourceFrontier.labelKey}`,
    reversedPriorTurnCount: sourceFrontier.reversedPriorTurnCount,
    deploymentGeometryDebt: sourceFrontier.deploymentGeometryDebt,
  }));
const reboundCore = stableGraphValue({
  ...checkpointCore(reissued),
  frontierCount: reboundFrontiers.length,
  frontiers: reboundFrontiers,
});
const rebound = {
  ...reboundCore,
  checkpointHash: stableGraphHash(reboundCore),
};

const proofCore = stableGraphValue({
  schemaVersion: "warmachine_equivalent_terminal_resume_frontier_rebind_v1",
  sourceCheckpointPath: path.relative(process.cwd(), sourcePath),
  sourceCheckpointHash: source.checkpointHash,
  reissuedCheckpointPath: path.relative(process.cwd(), reissuedPath),
  reissuedCheckpointHash: reissued.checkpointHash,
  outputCheckpointPath: path.relative(process.cwd(), outputPath),
  outputCheckpointHash: rebound.checkpointHash,
  sourceFrontierCount: source.frontiers.length,
  sourceExecutionWitnessHash: sourceWitnessHash,
  reissuedStrictRouteStateHash: reissuedFrontier.stateHash,
  reissuedStrictRouteEdgeCount: reissuedFrontier.reverseEdges.length,
  reboundLabelKeys: reboundFrontiers.map((frontier) => frontier.labelKey),
  exactSourceStateAndOrderedActionWitnessEquivalence: true,
  oneCurrentHostStrictReissueAppliedToEquivalentLabels: true,
  priorReceiptHashesConsultedForExecution: false,
  trainingTruth: false,
  claimBoundary: "This proof reuses one freshly reissued current-Host route only across source frontiers with the same exact state and the same ordered execution-relevant action witness. It preserves label multiplicity but does not claim that distinct non-equivalent routes may share a reissue.",
});
const proof = {
  ...proofCore,
  proofHash: stableGraphHash(proofCore),
};
writeJsonAtomic(outputPath, rebound);
writeJsonAtomic(proofPath, proof);

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion: proof.schemaVersion,
  sourceFrontierCount: proof.sourceFrontierCount,
  exactSourceStateAndOrderedActionWitnessEquivalence: true,
  oneCurrentHostStrictReissueAppliedToEquivalentLabels: true,
  outputFrontierCount: rebound.frontierCount,
  outputCheckpointHash: rebound.checkpointHash,
  proofHash: proof.proofHash,
  outputPath,
  proofPath,
}, null, 2)}\n`);
