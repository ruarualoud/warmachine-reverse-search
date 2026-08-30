#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyRulesV1Action,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  resolveWarmachineHostPath,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = path.join(
  REPOSITORY_ROOT,
  "build/reports/warmachine-semantic-slice-23-7-host-parity-v1.json",
);
const ENGINE_REPORT_PATH = resolveWarmachineHostPath(
  "build/function3-data/warmachine-semantic-slice-23-7-v1/report.json",
);
const CHILD_SLICES = ["23.7a", "23.7b", "23.7c"];

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readSearchChild(sliceKey) {
  return JSON.parse(fs.readFileSync(path.join(
    REPOSITORY_ROOT,
    `build/reports/warmachine-semantic-slice-${sliceKey.replaceAll(".", "-")}-host-parity-v1.json`,
  ), "utf8"));
}

function scenarioTerrain(terrainKey, xIn, yIn) {
  return {
    terrainKey,
    type: "scenario terrain",
    isScenarioTerrain: true,
    xIn,
    yIn,
    widthIn: 2,
    heightIn: 2,
    sourceFlagKey: `${terrainKey}-flag`,
    sourceFlagPosition: { xIn, yIn },
    scenarioTerrainSetupChoiceRequired: true,
    scenarioTerrainSetupChoiceResolved: true,
    scenarioTerrainFallbackUsed: true,
    scenarioTerrainSelectionCandidateKeys: [],
  };
}

function leader(pieceKey, sideKey, yIn, forceEntryId) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey,
    modelRole: "warcaster",
    modelType: "warcaster",
    isWarcaster: true,
    forceEntryId,
    pointCost: 0,
    position: { xIn: -5, yIn: -5 },
    baseSizeIn: 1.18,
    offTable: true,
    notDeployed: true,
    statusTags: ["off_table", "not_deployed"],
    damage: { boxesRemaining: 18, maxBoxes: 18 },
    deploymentDestinations: [{ key: `${sideKey}-leader-slot`, xIn: 24, yIn }],
  };
}

const engineReport = JSON.parse(fs.readFileSync(ENGINE_REPORT_PATH, "utf8"));
assert.equal(engineReport.ok, true);
assert.equal(engineReport.sliceKey, "23.7");
assert.equal(engineReport.parentSliceStrictCertified, true);
assert.deepEqual(engineReport.childSliceKeys, CHILD_SLICES);
assert.equal(engineReport.semanticRuleCount, 36);
assert.equal(engineReport.primitiveCount, 23);
assert.equal(engineReport.oracleFixtureCount, 109);
assert.equal(engineReport.mutationObligationCount, 67);
assert.equal(engineReport.killedMutationCount, 67);
assert.equal(engineReport.microFixtureCount, 108);
assert.equal(engineReport.interactionCaseCount, 3);

const childReports = Object.fromEntries(CHILD_SLICES.map((sliceKey) => {
  const report = readSearchChild(sliceKey);
  assert.equal(report.ok, true, `${sliceKey}: Search child report is not green`);
  assert.equal(report.sliceKey, sliceKey);
  assert.equal(report.engineSourceReceiptHash,
    engineReport.childReceiptHashes[sliceKey].sourceReceiptHash,
    `${sliceKey}: Search child binds stale Engine receipt`);
  return [sliceKey, report];
}));
assert.equal(childReports["23.7a"].realRosterEvidence.hostReceiptHash,
  warmachineHost.receipt.receiptHash);
assert.equal(childReports["23.7b"].hostReceiptHash, warmachineHost.receipt.receiptHash);
assert.equal(childReports["23.7c"].hostReceiptHash, warmachineHost.receipt.receiptHash);

const boundEngineSourcePaths = {
  "scripts/warmachine-rules-v1.mjs": engineReport.sourceHashes["scripts/warmachine-rules-v1.mjs"],
  "scripts/warmachine-deployment-primitives-v1.mjs": childReports["23.7b"].deploymentPrimitiveSourceHash,
  "scripts/warmachine-steamroller-primitives-v1.mjs": childReports["23.7c"].steamrollerPrimitiveSourceHash,
  "scripts/warmachine-steamroller-2026-v1.mjs": childReports["23.7c"].steamrollerProfileSourceHash,
};
for (const [relativePath, expectedHash] of Object.entries(boundEngineSourcePaths)) {
  assert.equal(warmachineHost.receipt.sourceHashes[relativePath], expectedHash,
    `Search Host drifted from parent-certified Engine source: ${relativePath}`);
}

const lifecycleInput = normalizeRulesV1State({
  stateKey: "search-parent-23-7-force-through-scenario-setup",
  strictMode: true,
  ruleAtomRuntimeMode: "authoritative",
  activeSideKey: "player1",
  firstPlayerSideKey: "player1",
  phaseKey: "setup",
  turnNumber: 1,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    leader("p1-leader", "player1", 2, "p1-leader-entry"),
    leader("p2-leader", "player2", 46, "p2-leader-entry"),
  ],
  terrain: [
    scenarioTerrain("pressure-a", 8, 34),
    scenarioTerrain("pressure-b", 16, 36),
    scenarioTerrain("pressure-c", 32, 12),
    scenarioTerrain("pressure-d", 40, 14),
  ],
  scenario: {
    packetKey: "steamroller-2026",
    packetYear: "2026",
    scenarioName: "Pressure Point",
    attackerSideKey: "player1",
    defenderSideKey: "player2",
    scoringStartSideKey: "player2",
    scoringStartTurnNumber: 2,
    score: { player1: 0, player2: 0 },
    scoringHistory: [],
    objectives: [{ objectiveKey: "center-50", baseSizeMm: 50, xIn: 24, yIn: 24 }],
    deploymentZones: [
      { zoneKey: "p1-initial", sideKey: "player1", xIn: 24, yIn: 3.5, widthIn: 48, heightIn: 7, backTableEdgeKey: "south", strictDeploymentZoneGeometryMapped: true },
      { zoneKey: "p2-initial", sideKey: "player2", xIn: 24, yIn: 44.5, widthIn: 48, heightIn: 7, backTableEdgeKey: "north", strictDeploymentZoneGeometryMapped: true },
    ],
  },
  deploymentBackEdgeBySide: { player1: "south", player2: "north" },
  setupSequence: {
    enabled: true,
    stepKey: "steamroller_scenario_setup",
    firstPlayerSideKey: "player1",
    secondPlayerSideKey: "player2",
    attackerSideKey: "player1",
    defenderSideKey: "player2",
  },
});
const setupEnumeration = enumerateRulesV1Actions(lifecycleInput);
const setupAction = setupEnumeration.actions.find((action) =>
  action.actionType === "complete_steamroller_scenario_setup");
assert.ok(setupAction, JSON.stringify(setupEnumeration.rejectedActions.map((action) => action.rejection)));
const setupTransition = applyRulesV1Action(lifecycleInput, setupAction);
assert.equal(setupTransition.ok, true);
assert.equal(setupTransition.nextState.setupSequence.stepKey, "first_initial_deployment");
assert.equal(setupTransition.nextState.pieces.find((piece) =>
  piece.pieceKey === "p1-leader")?.forceEntryId, "p1-leader-entry");
const deploymentEnumeration = enumerateRulesV1Actions(setupTransition.nextState);
const deploymentAction = deploymentEnumeration.actions.find((action) =>
  action.actionType === "initial_deploy_model" && action.actorPieceKey === "p1-leader");
assert.ok(deploymentAction, JSON.stringify(deploymentEnumeration.rejectedActions.map((action) => action.rejection)));
const deploymentTransition = applyRulesV1Action(setupTransition.nextState, deploymentAction);
assert.equal(deploymentTransition.ok, true);
assert.equal(deploymentTransition.nextState.pieces.find((piece) =>
  piece.pieceKey === "p1-leader")?.offTable, false);
assert.equal(deploymentTransition.nextState.scenario.scenarioKey, "pressure_point");

const sourcePaths = [
  path.join(REPOSITORY_ROOT, "scripts/verify-semantic-slice-23-7-host-parity-v1.mjs"),
  path.join(REPOSITORY_ROOT, "src/upstream-project-d.mjs"),
  path.join(REPOSITORY_ROOT, "src/warmachine-host-runtime.mjs"),
];
const sourceHashes = Object.fromEntries(sourcePaths.sort().map((filePath) => [
  path.relative(REPOSITORY_ROOT, filePath),
  sha256(filePath),
]));
const childReportHashes = Object.fromEntries(CHILD_SLICES.map((sliceKey) => [
  sliceKey,
  childReports[sliceKey].reportHash,
]));
const reportCore = {
  ok: true,
  schemaVersion: "warmachine_semantic_slice_23_7_host_parity_v1",
  sliceKey: "23.7",
  childSliceKeys: CHILD_SLICES,
  parentSliceStrictCertified: true,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  engineSourceReceiptHash: engineReport.sourceReceiptHash,
  engineAuthorityReceiptHash: engineReport.authorityReceiptHash,
  engineReportHash: engineReport.reportHash,
  semanticRuleCount: engineReport.semanticRuleCount,
  primitiveCount: engineReport.primitiveCount,
  oracleFixtureCount: engineReport.oracleFixtureCount,
  mutationObligationCount: engineReport.mutationObligationCount,
  killedMutationCount: engineReport.killedMutationCount,
  microFixtureCount: engineReport.microFixtureCount,
  interactionCaseCount: engineReport.interactionCaseCount,
  childReportHashes,
  boundEngineSourcePaths,
  hostExecutionEvidence: {
    scenarioSetupNextStepKey: setupTransition.nextState.setupSequence.stepKey,
    forceEntryIdentityPreserved: true,
    firstDeploymentApplied: true,
    scenarioIdentityPreserved: deploymentTransition.nextState.scenario.scenarioKey,
  },
  searchSideFinalLifecycleLegalityImplementationCount: 0,
  searchHeuristicBoundary: "Search proposes rosters, placements and scenario decisions; shared Force Builder and Engine Host alone accept final force, setup, deployment, score and terminal transitions.",
  sourceHashes,
  harnessLoopUsed: true,
  targetGames: ["warmachine"],
  promptPackRoutes: ["selfplay_agent_prompt", "referee_prompt"],
  harnessToolsCalled: ["list_legal_actions", "read_rules_verdict", "preview_action", "apply_action_after_user_confirmation", "write_episode_trace"],
  uiTraceEvidence: ["Search replays one continuous force-entry to scenario-setup to deployment chain through the current Host receipt."],
  agentDecisionEvidence: ["The Search-visible action set exposes only the current setup/deployment actor while retaining exact scenario and roster identity."],
  memoryTraceEvidence: ["force-builder receipt, Host receipt, force entries, setup choices, deployment positions, scenario state and score ledger"],
  trainingTraceCandidates: [],
  rollbackOrDemotionRules: [
    "Any child Search/Engine receipt, shared Host source or parent lifecycle replay drift demotes Search parent Slice 23.7.",
    "Any Search-owned final lifecycle legality implementation invalidates the zero-duplicate claim.",
  ],
  userVisibleChecks: [
    "The same current Host validates army identity, scenario setup and deployment without a Search-side rules fork.",
    "The first deployed model retains its force entry and exact Pressure Point scenario identity.",
  ],
  globalStrictReady: false,
  trainingTruth: false,
  searchValueAuthority: false,
  skillPromotionAllowed: false,
  onlineExperimentAllowed: false,
  claimBoundary: "Search consumes parent Slice 23.7 from ordinary force construction through core deployment and bounded exact Steamroller 2026. Card-specific interactions, generated interaction closure, full publication parity, values, skills, training and online experiments remain false.",
};
const report = {
  ...reportCore,
  reportHash: createHash("sha256").update(JSON.stringify(reportCore)).digest("hex"),
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
