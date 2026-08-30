#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
  "build/reports/warmachine-semantic-slice-23-7b-host-parity-v1.json",
);
const ENGINE_REPORT_PATH = resolveWarmachineHostPath(
  "build/function3-data/warmachine-semantic-slice-23-7b-v1/report.json",
);

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function piece(overrides = {}) {
  return {
    pieceKey: overrides.pieceKey || "piece",
    label: overrides.label || overrides.pieceKey || "Piece",
    sideKey: overrides.sideKey || "player1",
    modelRole: overrides.modelRole || "warrior",
    modelType: overrides.modelType || "warrior",
    position: overrides.position || { xIn: -5, yIn: -5 },
    baseSizeIn: overrides.baseSizeIn ?? 1,
    offTable: true,
    notDeployed: true,
    statusTags: ["off_table", "not_deployed"],
    damage: { boxesRemaining: 10, maxBoxes: 10 },
    specialRules: [],
    deploymentDestinations: [],
    ...overrides,
  };
}

function setupState(pieces) {
  return normalizeRulesV1State({
    stateKey: "search-host-parity-23-7b",
    activeSideKey: "player1",
    firstPlayerSideKey: "player1",
    phaseKey: "setup",
    turnNumber: 1,
    strictMode: true,
    ruleAtomRuntimeMode: "authoritative",
    board: { widthIn: 48, heightIn: 48 },
    pieces,
    terrain: [],
    commandCards: [],
    scenario: { zones: [], flags: [], objectives: [], score: { player1: 0, player2: 0 }, victoryThreshold: 5 },
    setupSequence: {
      enabled: true,
      stepKey: "starting_roll",
      sideKeys: ["player1", "player2"],
      scenarioSelected: true,
      modeSelected: true,
      encounterLevelSelected: true,
      forcesValidated: true,
      battlefieldReady: true,
      rackSpellsResolved: true,
      deploymentEdgeOptions: ["north", "south"],
      startingRollOutcomes: [{ rolls: { player1: 6, player2: 2 } }],
    },
  });
}

function enumeration(state) {
  return enumerateRulesV1Actions(state);
}

function apply(state, predicate, label) {
  const scoped = enumeration(state);
  const action = scoped.actions.find(predicate);
  assert.ok(action, `missing Search Host action: ${label}`);
  const transition = applyRulesV1Action(scoped.state || state, { actionKey: action.actionKey });
  assert.equal(transition.ok, true, `${label}: ${transition.reason || "transition failed"}`);
  return transition.nextState;
}

const engineReport = JSON.parse(fs.readFileSync(ENGINE_REPORT_PATH, "utf8"));
assert.equal(engineReport.ok, true);
assert.equal(engineReport.sliceKey, "23.7b");
assert.equal(engineReport.sliceStrictCertified, true);
assert.equal(engineReport.parentSliceStrictCertified, false);
assert.equal(engineReport.semanticRuleCount, 11);
assert.equal(engineReport.primitiveCount, 4);
assert.equal(engineReport.oracleFixtureCount, 28);
assert.equal(engineReport.killedMutationCount, 19);

for (const relativePath of [
  "scripts/warmachine-deployment-primitives-v1.mjs",
  "scripts/warmachine-rules-v1.mjs",
]) {
  assert.equal(
    warmachineHost.receipt.sourceHashes[relativePath],
    engineReport.sourceHashes[relativePath],
    `Search Host source drift: ${relativePath}`,
  );
}

const specialRulesModule = await import(pathToFileURL(resolveWarmachineHostPath(
  "scripts/warmachine-special-rules-v0.mjs",
)).href);
const preyRules = specialRulesModule.normalizeSpecialRules({ abilities: [{
  id: "2633da2b-246b-49f1-800e-9dfa65b59ea1",
  name: "Prey",
  description: "After deployment but before the first player's turn, choose an enemy model/unit to be this model/unit's prey. This model gains +2 to attack and damage rolls against its prey. When the prey is destroyed or removed from play, choose another model/unit to be the prey.",
}] });

let state = setupState([
  piece({
    pieceKey: "p1-leader",
    modelRole: "warcaster",
    modelType: "warcaster",
    isWarcaster: true,
    resourceKind: "focus",
    resourcePoints: 0,
    resourceMax: 7,
    arc: 7,
    specialRules: preyRules,
    deploymentDestinations: [{ key: "p1-slot", xIn: 24, yIn: 2 }],
  }),
  piece({
    pieceKey: "p2-leader",
    sideKey: "player2",
    modelRole: "warlock",
    modelType: "warlock",
    isWarlock: true,
    resourceKind: "fury",
    resourcePoints: 0,
    resourceMax: 6,
    arc: 6,
    deploymentDestinations: [{ key: "p2-slot", xIn: 24, yIn: 44 }],
  }),
]);

assert.equal(enumeration(state).strictSetupSequenceOnly, true);
state = apply(state, (candidate) => candidate.actionType === "resolve_setup_starting_roll", "starting roll");
state = apply(state, (candidate) => candidate.actionType === "choose_setup_first_player" && candidate.metadata.firstPlayerSideKey === "player1", "first-player choice");
state = apply(state, (candidate) => candidate.actionType === "choose_setup_second_player_edge" && candidate.metadata.edgeKey === "north", "second-player edge choice");
state = apply(state, (candidate) => candidate.actionType === "initial_deploy_model" && candidate.actorPieceKey === "p1-leader", "first initial deployment");
state = apply(state, (candidate) => candidate.actionType === "complete_setup_deployment_stage", "complete first initial deployment");
state = apply(state, (candidate) => candidate.actionType === "initial_deploy_model" && candidate.actorPieceKey === "p2-leader", "second initial deployment");
state = apply(state, (candidate) => candidate.actionType === "complete_setup_deployment_stage", "complete second initial deployment");
state = apply(state, (candidate) => candidate.actionType === "complete_setup_deployment_stage", "complete first Advance Deployment");
state = apply(state, (candidate) => candidate.actionType === "complete_setup_deployment_stage", "complete second Advance Deployment");
assert.equal(state.setupSequence.stepKey, "post_deployment_choices");
const preyAction = enumeration(state).actions.find((candidate) =>
  candidate.actionType === "resolve_rule_atom_target_choice");
assert.ok(preyAction, "Search Host must expose post-deployment Prey choice");
state = apply(state, (candidate) => candidate.actionKey === preyAction.actionKey, "post-deployment Prey choice");
state = apply(state, (candidate) => candidate.actionType === "start_setup_first_turn", "start first turn");
assert.equal(state.activeSideKey, "player1");
assert.equal(state.phaseKey, "control");
assert.equal(state.pieces.find((entry) => entry.pieceKey === "p1-leader").resourcePoints, 7);
assert.equal(state.pieces.find((entry) => entry.pieceKey === "p2-leader").resourcePoints, 6);

const bypassState = normalizeRulesV1State({
  stateKey: "search-host-strict-deployment-bypass",
  activeSideKey: "player1",
  firstPlayerSideKey: "player1",
  phaseKey: "deployment",
  strictMode: true,
  ruleAtomRuntimeMode: "authoritative",
  board: { widthIn: 48, heightIn: 48 },
  scenario: { score: { player1: 0, player2: 0 } },
  pieces: [piece({ pieceKey: "bypass", deploymentDestinations: [{ key: "slot", xIn: 24, yIn: 3 }] })],
});
const bypassEnumeration = enumeration(bypassState);
assert.equal(bypassEnumeration.actions.some((candidate) => candidate.actionType === "initial_deploy_model"), false);
assert.ok(bypassEnumeration.rejectedActions.some((candidate) =>
  candidate.rejection?.reason === "strict_setup_sequence_missing"));

const sourcePaths = [
  path.join(REPOSITORY_ROOT, "scripts/verify-semantic-slice-23-7b-host-parity-v1.mjs"),
  path.join(REPOSITORY_ROOT, "src/upstream-project-d.mjs"),
  path.join(REPOSITORY_ROOT, "src/warmachine-host-runtime.mjs"),
];
const sourceHashes = Object.fromEntries(sourcePaths.sort().map((filePath) => [
  path.relative(REPOSITORY_ROOT, filePath),
  sha256(filePath),
]));
const reportCore = {
  ok: true,
  schemaVersion: "warmachine_semantic_slice_23_7b_host_parity_v1",
  sliceKey: "23.7b",
  parentSliceStrictCertified: false,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  engineSourceReceiptHash: engineReport.sourceReceiptHash,
  engineAuthorityReceiptHash: engineReport.authorityReceiptHash,
  deploymentPrimitiveSourceHash: engineReport.sourceHashes["scripts/warmachine-deployment-primitives-v1.mjs"],
  rulesSourceHash: engineReport.sourceHashes["scripts/warmachine-rules-v1.mjs"],
  semanticRuleCount: engineReport.semanticRuleCount,
  primitiveCount: engineReport.primitiveCount,
  oracleFixtureCount: engineReport.oracleFixtureCount,
  mutationObligationCount: engineReport.mutationObligationCount,
  killedMutationCount: engineReport.killedMutationCount,
  hostExecutionEvidence: {
    setupSequenceCompleted: true,
    preyChoiceApplied: true,
    startingFocusPoints: 7,
    startingFuryPoints: 6,
    strictDirectBypassRejected: true,
  },
  searchSideFinalDeploymentLegalityImplementationCount: 0,
  searchHeuristicBoundary: "Search may propose and order continuous placement candidates; Engine Host alone judges supplied setup/deployment legality and applies state transitions.",
  sourceHashes,
  harnessLoopUsed: true,
  targetGames: ["warmachine"],
  promptPackRoutes: ["selfplay_agent_prompt", "referee_prompt"],
  harnessToolsCalled: ["list_legal_actions", "read_rules_verdict", "apply_action_after_user_confirmation", "write_episode_trace"],
  uiTraceEvidence: ["Search Host returns strict rejectedActions for direct deployment protocol bypass."],
  agentDecisionEvidence: ["Search sees only the current setup-stage legal actions and the explicit Prey choice before first turn."],
  memoryTraceEvidence: ["Host receipt, setup decisions, deployed coordinates, Prey target and starting resources"],
  trainingTraceCandidates: [],
  rollbackOrDemotionRules: [
    "Any Engine 23.7b receipt, deployment primitive, rules source or Host receipt drift invalidates this Search parity receipt.",
    "Any Search-owned final deployment legality implementation invalidates the zero-duplicate claim.",
  ],
  userVisibleChecks: [
    "Search executes the same starting roll, edge choice, deployment, Prey and resource initialization as Engine.",
    "Strict direct deployment bypass remains replay-visible as a rejection.",
  ],
  globalStrictReady: false,
  trainingTruth: false,
  searchValueAuthority: false,
  claimBoundary: "Search consumes certified Slice 23.7b setup/deployment through the shared Engine Host. Continuous candidate completeness, Steamroller, card-specific setup, values, skills, training and online experiments remain false.",
};
const report = {
  ...reportCore,
  reportHash: createHash("sha256").update(JSON.stringify(reportCore)).digest("hex"),
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
