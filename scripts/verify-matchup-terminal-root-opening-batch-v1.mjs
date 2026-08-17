#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { warmachineSteamroller2026OfficialScenarioLayoutV1 } from
  "../src/contracts/steamroller-2026-official-scenario-layout-v1.mjs";
import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import {
  WARMACHINE_STEAMROLLER_OPENING_BINDER_SCENARIO_KEYS_V1,
} from "../src/matchup/steamroller-opening-binders-v1.mjs";
import { orientWarmachineSteamrollerDeploymentLayoutV1 } from
  "../src/matchup/steamroller-opening-map-template-v1.mjs";
import { warmachineConstructionHost } from
  "../src/warmachine-construction-host-runtime.mjs";
import {
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  auditRulesV1SteamrollerScenarioTerrainSetup,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(reverseDirectory,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1"));

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertSealed(artifact = {}, hashField = "") {
  const core = structuredClone(artifact);
  const declaredHash = String(core[hashField] || "");
  delete core[hashField];
  assert.equal(stableGraphHash(core), declaredHash);
}

function firstPlayerSideKey(taskSideKey = "") {
  return taskSideKey === "challenger" ? "player2" : "player1";
}

function oppositeSide(sideKey = "") {
  return sideKey === "player1" ? "player2" : "player1";
}

function baseRadiusIn(piece = {}) {
  return Number(piece.baseDiameterIn || piece.baseSizeIn || 1.18) / 2;
}

function completeBaseInsideZone(piece = {}, zone = {}) {
  const radius = baseRadiusIn(piece);
  const x = Number(piece.position?.xIn ?? piece.xIn);
  const y = Number(piece.position?.yIn ?? piece.yIn);
  const halfWidth = Number(zone.widthIn ?? zone.width) / 2;
  const halfHeight = Number(zone.heightIn ?? zone.height) / 2;
  const centerX = Number(zone.xIn ?? zone.x);
  const centerY = Number(zone.yIn ?? zone.y);
  return x - radius >= centerX - halfWidth - 0.001 &&
    x + radius <= centerX + halfWidth + 0.001 &&
    y - radius >= centerY - halfHeight - 0.001 &&
    y + radius <= centerY + halfHeight + 0.001;
}

for (const firstSideKey of ["player1", "player2"]) {
  const source = warmachineSteamroller2026OfficialScenarioLayoutV1("two_fronts");
  const oriented = orientWarmachineSteamrollerDeploymentLayoutV1(source, firstSideKey);
  const defenderSideKey = oppositeSide(firstSideKey);
  assert.equal(oriented.deployments[`${firstSideKey === "player1" ? "p1" : "p2"}_deploy`]
    .setupRole, "attacker");
  assert.equal(oriented.deployments[`${defenderSideKey === "player1" ? "p1" : "p2"}_deploy`]
    .setupRole, "defender");
  assert.equal(oriented.deploymentBackEdgeBySide[firstSideKey], "south");
  assert.equal(oriented.deploymentBackEdgeBySide[defenderSideKey], "north");
}

const batchRoot = path.join(outputDirectory, "terminal-root-batch-v1");
const current = loadJson(path.join(batchRoot, "CURRENT.json"));
assertSealed(current, "currentHash");
assert.equal(current.hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(current.constructionHostReceiptHash,
  warmachineConstructionHost.receipt.receiptHash);
const planDirectory = path.join(batchRoot, current.relativePlanDirectory);
const plan = loadJson(path.join(planDirectory, "plan.json"));
const report = loadJson(path.join(planDirectory, "opening-batch-report.json"));
const runtime = loadJson(path.join(planDirectory, "opening-batch-runtime.json"));
assertSealed(plan, "planHash");
assertSealed(report, "reportHash");
assertSealed(runtime, "runtimeHash");
assert.equal(plan.planHash, current.planHash);
assert.equal(report.planHash, plan.planHash);
assert.equal(runtime.planHash, plan.planHash);
assert.equal(runtime.reportHash, report.reportHash);
assert.equal(report.taskHash, current.taskHash);
assert.equal(runtime.taskHash, current.taskHash);
assert.equal(report.hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(runtime.hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(report.constructionHostReceiptHash,
  warmachineConstructionHost.receipt.receiptHash);
assert.equal(runtime.constructionHostReceiptHash,
  warmachineConstructionHost.receipt.receiptHash);

assert.equal(report.selectedTerminalTaskCount, plan.selectedTaskCount);
assert.equal(report.selectedTerminalTaskCount, 64);
assert.equal(report.uniqueOpeningTaskCount, 39);
assert.equal(report.deploymentSearchCount, report.uniqueOpeningTaskCount);
assert.equal(report.strictUniqueOpeningCount, report.uniqueOpeningTaskCount);
assert.equal(report.failedUniqueOpeningCount, 0);
assert.equal(report.unresolvedUniqueOpeningCount, 0);
assert.equal(report.terminalTaskMassConserved, true);
assert.deepEqual(report.terminalTaskDispositionCounts, {
  strict_opening_materialized: 64,
});
assert.equal(report.taskLedger.length, 64);
assert.deepEqual(
  [...new Set(report.taskLedger.map((row) => row.terminalTaskKey))].sort(),
  plan.selectedTasks.map((row) => row.taskKey).sort(),
);
assert.equal(report.taskLedger.every((row) =>
  row.disposition === "strict_opening_materialized" &&
  row.authority === "rules_v1_host" && row.strictOpeningStateHash &&
  row.strictDeploymentReceiptHash && row.scenarioBindingHash), true);
assert.equal(report.deploymentToTerminalReachabilityProven, false);
assert.equal(report.trainingTruth, false);
assert.equal(runtime.trainingTruth, false);
assert.equal(new Set(runtime.openings.map((opening) => opening.openingKey)).size,
  runtime.openings.length);
assert.equal(runtime.openings.every((opening) =>
  opening.openingKey.startsWith("matchup-terminal-opening-") &&
  Boolean(opening.constructionOpeningKey)), true);

const runtimeOpeningByKey = new Map(runtime.openings.map((opening) => [
  opening.openingKey,
  opening,
]));
for (const ledgerRow of report.taskLedger) {
  const terminalTask = plan.selectedTasks.find((task) =>
    task.taskKey === ledgerRow.terminalTaskKey);
  const opening = runtimeOpeningByKey.get(ledgerRow.openingKey);
  assert.ok(terminalTask);
  assert.ok(opening);
  assert.equal(ledgerRow.constructionOpeningKey, opening.constructionOpeningKey);
  assert.equal(ledgerRow.strictOpeningStateHash, opening.strictOpeningStateHash);
  assert.equal(ledgerRow.scenarioBindingHash, opening.scenarioBindingHash);
  assert.equal(opening.scenarioKey, terminalTask.representative.scenarioKey);
  assert.equal(opening.subjectRosterKey,
    terminalTask.executionEnvelope.sourceRosterKeys.subject);
  assert.equal(opening.challengerRosterKey,
    terminalTask.executionEnvelope.sourceRosterKeys.challenger);
}

const scenarioKeys = [...new Set(runtime.openings.map((opening) =>
  opening.scenarioKey))].sort();
assert.deepEqual(scenarioKeys,
  [...WARMACHINE_STEAMROLLER_OPENING_BINDER_SCENARIO_KEYS_V1].sort());
const observedTerrainPartitions = new Set(runtime.openings.map((opening) =>
  opening.scenarioTerrainSetupClassKey));
assert.equal(observedTerrainPartitions.has("all_flags_fallback_no_valid_terrain"), true);
assert.equal(observedTerrainPartitions.has("all_selected_from_single_candidate"), true);
assert.equal(observedTerrainPartitions.has("not_applicable"), true);

for (const opening of runtime.openings) {
  const state = opening.state;
  const firstSideKey = firstPlayerSideKey(opening.firstPlayerTaskSideKey);
  const defenderSideKey = oppositeSide(firstSideKey);
  const expectedLayout = orientWarmachineSteamrollerDeploymentLayoutV1(
    warmachineSteamroller2026OfficialScenarioLayoutV1(opening.scenarioKey),
    firstSideKey,
  );
  assert.equal(opening.disposition, "strict_opening_materialized");
  assert.equal(state.strictMode, true);
  assert.equal(state.deploymentComplete, true);
  assert.equal(state.firstPlayerSideKey, firstSideKey);
  assert.equal(state.activeSideKey, firstSideKey);
  assert.equal(state.scenario.scenarioKey, opening.scenarioKey);
  assert.equal(state.scenario.attackerSideKey, firstSideKey);
  assert.equal(state.scenario.defenderSideKey, defenderSideKey);
  assert.equal(state.scenario.scoringStartSideKey, defenderSideKey);
  assert.equal(state.scenario.scoringStartTurnNumber, 2);
  assert.deepEqual(state.deploymentBackEdgeBySide,
    expectedLayout.deploymentBackEdgeBySide);
  assert.equal(state.deploymentZones.length, 2);
  for (const sideKey of ["player1", "player2"]) {
    const observedZone = state.deploymentZones.find((zone) => zone.sideKey === sideKey);
    const expectedZone = expectedLayout.deployments[`${sideKey === "player1"
      ? "p1" : "p2"}_deploy`];
    assert.ok(observedZone);
    assert.equal(observedZone.setupRole, expectedZone.setupRole);
    assert.equal(observedZone.backEdge, expectedZone.backEdge);
    assert.equal(Number(observedZone.widthIn), Number(expectedZone.width));
    assert.equal(Number(observedZone.heightIn), Number(expectedZone.height));
    assert.equal((state.pieces || []).filter((piece) => piece.sideKey === sideKey)
      .every((piece) => completeBaseInsideZone(piece, observedZone)), true);
  }
  assert.equal(opening.deploymentAudit.ok, true);
  assert.equal(opening.deploymentAudit.baseOutsideCount, 0);
  assert.equal(opening.deploymentAudit.overlapPairCount, 0);
  assert.equal(opening.deploymentAudit.disconnectedUnitGroupCount, 0);
  assert.equal(auditRulesV1StaticPlacement(state).ok, true);
  assert.equal(auditRulesV1StaticUnitFormation(state).ok, true);
  const terrainAudit = auditRulesV1SteamrollerScenarioTerrainSetup(state);
  assert.equal(terrainAudit.ok, true);
  assert.equal(terrainAudit.setupClassKey,
    opening.scenarioTerrainSetupClassKey);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  planHash: plan.planHash,
  reportHash: report.reportHash,
  runtimeHash: runtime.runtimeHash,
  terminalTaskCount: report.selectedTerminalTaskCount,
  uniqueOpeningCount: report.uniqueOpeningTaskCount,
  scenarioKeys,
  firstPlayerTaskSideKeys: [...new Set(runtime.openings.map((opening) =>
    opening.firstPlayerTaskSideKey))].sort(),
  terrainPartitions: [...observedTerrainPartitions].sort(),
}, null, 2)}\n`);
