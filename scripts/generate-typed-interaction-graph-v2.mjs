#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildWarmachineCapabilityBottleneckV2,
  buildWarmachineRosterSourceProjectionV2,
  buildWarmachineTerminalQueryProjectionV2,
} from "../src/graph/capability-query-v2.mjs";
import { buildWarmachineTypedInteractionGraphV2 } from "../src/graph/typed-interaction-graph-v2.mjs";
import {
  buildWarmachineRulesV1StateFromLayer3Room,
  resolveWarmachineHostPath,
} from "../src/warmachine-host-runtime.mjs";

const outputDirectory = path.resolve("build", "typed-interaction-graph-v2");
const graph = buildWarmachineTypedInteractionGraphV2();
const roomPath = resolveWarmachineHostPath(
  "build/warmachine-ai/sepsira-swarm-vs-fane-v20260805/strict-construction-search-v2/deep/" +
  "cryx-recursion-screen-fane-ashmael-scenario-blender-balanced-collision-player1-e4937ca7b578/" +
  "input-room-store.tmp.json",
);
const roomStore = JSON.parse(await readFile(roomPath, "utf8"));
const room = Object.values(roomStore.roomsById || {})[0];
const state = buildWarmachineRulesV1StateFromLayer3Room(room, {
  strictMode: true,
  enforceStrictExecutor: true,
});
const rosterProjection = buildWarmachineRosterSourceProjectionV2(state, graph);
const assassinationProjection = buildWarmachineTerminalQueryProjectionV2(state, {
  templateKey: "fixed-106-assassination",
  goalType: "assassination",
}, graph);
const scenarioProjection = buildWarmachineTerminalQueryProjectionV2(state, {
  templateKey: "fixed-106-scenario",
  goalType: "scenario_score",
}, graph);
const capabilityBottleneck = buildWarmachineCapabilityBottleneckV2(assassinationProjection);
const report = {
  schemaVersion: "warmachine_typed_interaction_graph_v2_generation_report",
  ok: graph.validation.structuralOk,
  graphHash: graph.graphHash,
  upstreamReceiptHash: graph.upstreamReceiptHash,
  counts: graph.counts,
  nodeKindCounts: graph.nodeKindCounts,
  edgeKindCounts: graph.edgeKindCounts,
  issueCount: graph.issues.length,
  issues: graph.issues,
  hardPruningEnabled: graph.hardPruningEnabled,
  reasonsHardPruningDisabled: graph.reasonsHardPruningDisabled,
  realRosterProjection: {
    roomPath,
    projectionHash: rosterProjection.projectionHash,
    counts: rosterProjection.counts,
  },
  assassinationProjection: {
    projectionHash: assassinationProjection.projectionHash,
    counts: assassinationProjection.counts,
  },
  scenarioProjection: {
    projectionHash: scenarioProjection.projectionHash,
    counts: scenarioProjection.counts,
  },
  capabilityBottleneck: {
    bottleneckHash: capabilityBottleneck.bottleneckHash,
    counts: capabilityBottleneck.counts,
  },
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, "graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
await writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(outputDirectory, "roster-projection.json"),
  `${JSON.stringify(rosterProjection, null, 2)}\n`);
await writeFile(path.join(outputDirectory, "assassination-projection.json"),
  `${JSON.stringify(assassinationProjection, null, 2)}\n`);
await writeFile(path.join(outputDirectory, "scenario-projection.json"),
  `${JSON.stringify(scenarioProjection, null, 2)}\n`);
await writeFile(path.join(outputDirectory, "capability-bottleneck.json"),
  `${JSON.stringify(capabilityBottleneck, null, 2)}\n`);
console.log(JSON.stringify({
  ...report,
  graphPath: path.join(outputDirectory, "graph.json"),
  reportPath: path.join(outputDirectory, "report.json"),
  rosterProjectionPath: path.join(outputDirectory, "roster-projection.json"),
  assassinationProjectionPath: path.join(outputDirectory, "assassination-projection.json"),
  scenarioProjectionPath: path.join(outputDirectory, "scenario-projection.json"),
  capabilityBottleneckPath: path.join(outputDirectory, "capability-bottleneck.json"),
}, null, 2));

if (!report.ok) process.exit(1);
