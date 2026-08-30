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
  steamroller2026ScenarioProfiles,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = path.join(
  REPOSITORY_ROOT,
  "build/reports/warmachine-semantic-slice-23-7c-host-parity-v1.json",
);
const ENGINE_REPORT_PATH = resolveWarmachineHostPath(
  "build/function3-data/warmachine-semantic-slice-23-7c-v1/report.json",
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
    modelType: overrides.modelType || overrides.modelRole || "warrior",
    position: overrides.position || { xIn: 24, yIn: 24 },
    baseSizeIn: overrides.baseSizeIn ?? 1.18,
    speedIn: overrides.speedIn ?? 6,
    defense: overrides.defense ?? 12,
    armor: overrides.armor ?? 16,
    damage: {
      boxesRemaining: overrides.boxesRemaining ?? 5,
      maxBoxes: overrides.maxBoxes ?? overrides.boxesRemaining ?? 5,
    },
    statusTags: overrides.statusTags || [],
    attackProfiles: overrides.attackProfiles || [],
    ...overrides,
  };
}

function leader(overrides = {}) {
  return piece({
    modelRole: "warcaster",
    modelType: "warcaster",
    isWarcaster: true,
    ...overrides,
  });
}

function objective(objectiveKey, baseSizeMm, xIn, yIn, ownerSideKey = "", overrides = {}) {
  return { objectiveKey, baseSizeMm, xIn, yIn, ownerSideKey, ...overrides };
}

function scenarioTerrain(terrainKey, xIn, yIn, ownerSideKey = "", overrides = {}) {
  return {
    terrainKey,
    type: "scenario terrain",
    isScenarioTerrain: true,
    xIn,
    yIn,
    widthIn: 2,
    heightIn: 2,
    ownerSideKey,
    sourceFlagKey: `${terrainKey}-flag`,
    sourceFlagPosition: { xIn, yIn },
    scenarioTerrainSetupChoiceRequired: true,
    scenarioTerrainSetupChoiceResolved: true,
    scenarioTerrainFallbackUsed: true,
    scenarioTerrainSelectionCandidateKeys: [],
    ...overrides,
  };
}

function scenarioFixture(scenarioName) {
  if (scenarioName === "Wolves at Our Heels") return {
    objectives: [
      objective("p1-40", 40, 18, 22, "player1", { progressTokens: 2, linkedObjectiveKey: "p1-50" }),
      objective("p1-50", 50, 24, 22, "player1"),
      objective("p2-40", 40, 30, 26, "player2", { progressTokens: 0, linkedObjectiveKey: "p2-50" }),
      objective("p2-50", 50, 36, 26, "player2"),
    ],
    terrain: [
      scenarioTerrain("p1-wolves-terrain", 12, 36, "player1"),
      scenarioTerrain("p2-wolves-terrain", 36, 12, "player2"),
    ],
  };
  if (scenarioName === "Payload") return {
    objectives: [
      objective("p1-payload", 50, 20, 24, "player1", { deliveryTerrainKey: "p2-payload-terrain" }),
      objective("p2-payload", 50, 36, 30, "player2", { deliveryTerrainKey: "p1-payload-terrain" }),
      objective("p1-40", 40, 18, 22, "player1"),
      objective("p2-40", 40, 34, 34, "player2"),
    ],
    terrain: [
      scenarioTerrain("p1-payload-terrain", 10, 36, "player1"),
      scenarioTerrain("p2-payload-terrain", 24, 24, "player2"),
    ],
  };
  if (scenarioName === "High Stakes") return {
    objectives: [
      objective("center-50", 50, 24, 24, "", { countdownTokens: 5 }),
      objective("left-40", 40, 14, 24),
      objective("right-40", 40, 34, 24),
    ],
    terrain: [
      scenarioTerrain("red-fuse", 12, 36, "player1", { countdownTokens: 5 }),
      scenarioTerrain("blue-fuse", 36, 12, "player2", { countdownTokens: 5 }),
    ],
  };
  return {
    objectives: [objective("center-50", 50, 24, 24)],
    terrain: [
      scenarioTerrain("pressure-a", 8, 34),
      scenarioTerrain("pressure-b", 16, 36),
      scenarioTerrain("pressure-c", 32, 12),
      scenarioTerrain("pressure-d", 40, 14),
    ],
  };
}

function fixtureScoringHistory(score = {}) {
  const running = { player1: 0, player2: 0 };
  const history = [];
  for (const sideKey of ["player1", "player2"]) {
    const points = Number(score[sideKey] || 0);
    if (points <= 0) continue;
    const scoreBefore = { ...running };
    running[sideKey] += points;
    history.push({
      key: `fixture-prehistory:${sideKey}`,
      round: 1,
      sideKey,
      elementType: "fixture_prehistory",
      elementKey: `${sideKey}-prior-score`,
      scoringWindow: "fixture_prehistory",
      points,
      sourceEventType: "fixture_prehistory",
      reason: "fixture_prehistory",
      sequence: history.length + 1,
      scoreBefore,
      scoreAfter: { ...running },
    });
  }
  return history;
}

function steamrollerState(overrides = {}) {
  const scenarioName = overrides.scenario?.scenarioName || "Pressure Point";
  const fixture = scenarioFixture(scenarioName);
  const score = overrides.scenario?.score || { player1: 0, player2: 0 };
  return normalizeRulesV1State({
    stateKey: overrides.stateKey || "search-host-parity-23-7c",
    activeSideKey: overrides.activeSideKey || "player2",
    firstPlayerSideKey: overrides.firstPlayerSideKey || overrides.scenario?.attackerSideKey || "player1",
    phaseKey: overrides.phaseKey || "activation",
    turnNumber: overrides.turnNumber ?? 2,
    strictMode: true,
    ruleAtomRuntimeMode: "authoritative",
    board: { widthIn: 48, heightIn: 48 },
    pieces: overrides.pieces || [],
    terrain: overrides.terrain || fixture.terrain,
    deploymentBackEdgeBySide: { player1: "south", player2: "north" },
    setupSequence: overrides.setupSequence,
    scenario: {
      packetKey: "steamroller-2026",
      packetYear: "2026",
      scenarioName,
      attackerSideKey: "player1",
      defenderSideKey: "player2",
      scoringStartSideKey: "player2",
      scoringStartTurnNumber: 2,
      score,
      objectives: fixture.objectives,
      caches: fixture.caches || [],
      ...(overrides.scenario || {}),
      scoringHistory: overrides.scenario?.scoringHistory || fixtureScoringHistory(score),
    },
  });
}

function endTurn(inputState, input = {}) {
  const enumeration = enumerateRulesV1Actions(inputState);
  const action = enumeration.actions.find((candidate) => candidate.actionType === "end_turn");
  assert.ok(action, `missing Search Host end_turn; rejected=${JSON.stringify(enumeration.rejectedActions.map((candidate) => candidate.rejection))}`);
  const transition = applyRulesV1Action(enumeration.state || inputState, {
    ...action,
    ...input,
    metadata: { ...(action.metadata || {}), ...(input.metadata || {}) },
  });
  return { action, transition };
}

const engineReport = JSON.parse(fs.readFileSync(ENGINE_REPORT_PATH, "utf8"));
assert.equal(engineReport.ok, true);
assert.equal(engineReport.sliceKey, "23.7c");
assert.equal(engineReport.sliceStrictCertified, true);
assert.equal(engineReport.parentSliceStrictCertified, false);
assert.equal(engineReport.semanticRuleCount, 16);
assert.equal(engineReport.primitiveCount, 10);
assert.equal(engineReport.oracleFixtureCount, 51);
assert.equal(engineReport.mutationObligationCount, 30);
assert.equal(engineReport.killedMutationCount, 30);
assert.equal(engineReport.microFixtureCount, 108);

for (const relativePath of [
  "scripts/warmachine-rules-v1.mjs",
  "scripts/warmachine-steamroller-primitives-v1.mjs",
  "scripts/warmachine-steamroller-2026-v1.mjs",
]) {
  assert.equal(
    warmachineHost.receipt.sourceHashes[relativePath],
    engineReport.sourceHashes[relativePath],
    `Search Host source drift: ${relativePath}`,
  );
}
assert.equal(steamroller2026ScenarioProfiles().length, 7);

const sharedScorers = [
  leader({ pieceKey: "p1-leader", sideKey: "player1", position: { xIn: 22.8, yIn: 24 }, activated: true }),
  leader({ pieceKey: "p2-leader", sideKey: "player2", position: { xIn: 25.2, yIn: 24 }, activated: true }),
];
const preScoring = endTurn(steamrollerState({
  stateKey: "search-host-attacker-second-turn-before-scoring",
  activeSideKey: "player1",
  pieces: sharedScorers,
})).transition;
assert.equal(preScoring.ok, true);
assert.deepEqual(preScoring.nextState.scenario.score, { player1: 0, player2: 0 });
assert.ok(preScoring.events.some((event) => event.eventType === "scenario_scoring_not_started"));

const bothSides = endTurn(steamrollerState({
  stateKey: "search-host-defender-second-turn-both-sides-score",
  pieces: sharedScorers,
})).transition;
assert.equal(bothSides.ok, true);
assert.deepEqual(bothSides.nextState.scenario.score, { player1: 2, player2: 2 });
assert.equal(bothSides.events.filter((event) => event.eventType === "scenario_score").length, 2);

const duplicateScore = { player1: 1, player2: 0 };
const duplicateRows = fixtureScoringHistory(duplicateScore);
const invalidLedgerEnumeration = enumerateRulesV1Actions(steamrollerState({
  stateKey: "search-host-duplicate-ledger-fails-closed",
  pieces: sharedScorers,
  scenario: {
    score: duplicateScore,
    scoringHistory: [...duplicateRows, { ...duplicateRows[0], sequence: 2 }],
  },
}));
const invalidLedgerRejection = invalidLedgerEnumeration.rejectedActions.find((action) =>
  action.actionType === "end_turn");
assert.ok(invalidLedgerRejection?.rejection?.evidence?.issues?.some((issue) =>
  issue.reason === "steamroller_scoring_history_duplicate_key"));

const setupInput = steamrollerState({
  stateKey: "search-host-steamroller-scenario-setup",
  phaseKey: "setup",
  turnNumber: 1,
  pieces: [
    leader({ pieceKey: "p1-setup", sideKey: "player1", position: { xIn: -5, yIn: -5 }, offTable: true, notDeployed: true, statusTags: ["off_table", "not_deployed"] }),
    leader({ pieceKey: "p2-setup", sideKey: "player2", position: { xIn: -5, yIn: -5 }, offTable: true, notDeployed: true, statusTags: ["off_table", "not_deployed"] }),
  ],
  setupSequence: {
    enabled: true,
    stepKey: "steamroller_scenario_setup",
    firstPlayerSideKey: "player1",
    secondPlayerSideKey: "player2",
    attackerSideKey: "player1",
    defenderSideKey: "player2",
  },
});
const setupAction = enumerateRulesV1Actions(setupInput).actions.find((action) =>
  action.actionType === "complete_steamroller_scenario_setup");
assert.ok(setupAction);
const setupTransition = applyRulesV1Action(setupInput, setupAction);
assert.equal(setupTransition.ok, true);
assert.equal(setupTransition.nextState.setupSequence.stepKey, "first_initial_deployment");

const wolvesInput = steamrollerState({
  stateKey: "search-host-wolves-short-move-rejected",
  pieces: [
    leader({ pieceKey: "p1-leader", sideKey: "player1", position: { xIn: 18, yIn: 22 }, activated: true }),
    leader({ pieceKey: "p2-leader", sideKey: "player2", position: { xIn: 40, yIn: 24 }, activated: true }),
  ],
  scenario: { scenarioName: "Wolves at Our Heels" },
});
const wolvesAttempt = endTurn(wolvesInput, {
  steamroller2026Decision: {
    wolves: {
      addTokenByObjectiveKey: { "p1-40": true },
      opponentMoveByObjectiveKey: {
        "p1-40": {
          destination: { xIn: 20, yIn: 22 },
          pathPoints: [{ xIn: 18, yIn: 22 }, { xIn: 20, yIn: 22 }],
        },
      },
    },
  },
}).transition;
assert.equal(wolvesAttempt.ok, false);
assert.equal(wolvesAttempt.reason, "steamroller_objective_move_must_use_full_distance_or_stop_short");

const payloadInput = steamrollerState({
  stateKey: "search-host-payload-haul-contact-stop",
  pieces: [
    leader({ pieceKey: "p1-leader", sideKey: "player1", position: { xIn: 20, yIn: 26.5 }, activated: true }),
    piece({ pieceKey: "p1-cohort", sideKey: "player1", modelRole: "warjack", modelType: "warjack", isWarjack: true, position: { xIn: 15, yIn: 24 }, baseSizeIn: 1.18, activated: true }),
    leader({ pieceKey: "p2-leader", sideKey: "player2", position: { xIn: 40, yIn: 40 }, activated: true }),
  ],
  scenario: { scenarioName: "Payload" },
});
const payloadTransition = endTurn(payloadInput, {
  steamroller2026Decision: {
    payload: {
      moveByObjectiveKey: { "p1-payload": { distanceIn: 1 } },
      madeToHaulByObjectiveKey: { "p1-payload": { cohortPieceKey: "p1-cohort" } },
    },
  },
}).transition;
assert.equal(payloadTransition.ok, true);
const payloadEvent = payloadTransition.events.find((event) =>
  event.eventType === "payload_objective_moved" && event.objectiveKey === "p1-payload");
assert.equal(payloadEvent?.haulMovementResolution?.stoppedOnContact, true);
assert.equal(payloadEvent?.haulMovementResolution?.stoppingContact?.blockerKey, "objective:p1-payload");

const highStakes = endTurn(steamrollerState({
  stateKey: "search-host-high-stakes-random-input-required",
  turnNumber: 3,
  pieces: [
    leader({ pieceKey: "p1-leader", sideKey: "player1", position: { xIn: 10, yIn: 24 }, activated: true }),
    leader({ pieceKey: "p2-leader", sideKey: "player2", position: { xIn: 38, yIn: 24 }, activated: true }),
  ],
  scenario: { scenarioName: "High Stakes" },
})).transition;
assert.equal(highStakes.ok, false);
assert.equal(highStakes.reason, "high_stakes_fuse_roll_required");
assert.equal(highStakes.events[0]?.stateMutationBlocked, true);

const sourcePaths = [
  path.join(REPOSITORY_ROOT, "scripts/verify-semantic-slice-23-7c-host-parity-v1.mjs"),
  path.join(REPOSITORY_ROOT, "src/upstream-project-d.mjs"),
  path.join(REPOSITORY_ROOT, "src/warmachine-host-runtime.mjs"),
];
const sourceHashes = Object.fromEntries(sourcePaths.sort().map((filePath) => [
  path.relative(REPOSITORY_ROOT, filePath),
  sha256(filePath),
]));
const reportCore = {
  ok: true,
  schemaVersion: "warmachine_semantic_slice_23_7c_host_parity_v1",
  sliceKey: "23.7c",
  parentSliceStrictCertified: false,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  engineSourceReceiptHash: engineReport.sourceReceiptHash,
  engineAuthorityReceiptHash: engineReport.authorityReceiptHash,
  rulesSourceHash: engineReport.sourceHashes["scripts/warmachine-rules-v1.mjs"],
  steamrollerPrimitiveSourceHash: engineReport.sourceHashes["scripts/warmachine-steamroller-primitives-v1.mjs"],
  steamrollerProfileSourceHash: engineReport.sourceHashes["scripts/warmachine-steamroller-2026-v1.mjs"],
  semanticRuleCount: engineReport.semanticRuleCount,
  primitiveCount: engineReport.primitiveCount,
  oracleFixtureCount: engineReport.oracleFixtureCount,
  mutationObligationCount: engineReport.mutationObligationCount,
  killedMutationCount: engineReport.killedMutationCount,
  microFixtureCount: engineReport.microFixtureCount,
  hostExecutionEvidence: {
    scenarioProfileCount: steamroller2026ScenarioProfiles().length,
    preScoringScore: preScoring.nextState.scenario.score,
    bothSidesScore: bothSides.nextState.scenario.score,
    duplicateLedgerRejected: true,
    scenarioSetupNextStepKey: setupTransition.nextState.setupSequence.stepKey,
    wolvesShortMoveRejectedReason: wolvesAttempt.reason,
    payloadHaulStoppedOnContact: payloadEvent.haulMovementResolution.stoppedOnContact,
    payloadHaulBlockerKey: payloadEvent.haulMovementResolution.stoppingContact.blockerKey,
    highStakesMissingRandomRejectedReason: highStakes.reason,
  },
  searchSideFinalScenarioLegalityImplementationCount: 0,
  searchHeuristicBoundary: "Search may propose scenario choices and predecessor hypotheses; Engine Host alone validates Steamroller setup, scoring, movement, ledger and terminal legality and applies successor state.",
  sourceHashes,
  harnessLoopUsed: true,
  targetGames: ["warmachine"],
  promptPackRoutes: ["selfplay_agent_prompt", "referee_prompt"],
  harnessToolsCalled: ["list_legal_actions", "read_rules_verdict", "preview_action", "apply_action_after_user_confirmation", "write_episode_trace"],
  uiTraceEvidence: [
    "Search Host exposes replayable score-ledger rejection reasons and before/after scenario scores.",
    "Wolves and Payload objective movement reports preserve exact Engine movement-resolution evidence.",
  ],
  agentDecisionEvidence: [
    "The Search action space withholds scoring before the Defender's second turn and exposes source-owned scenario decisions at turn end.",
    "Caller-forged short objective movement and missing High Stakes randomness fail closed without state mutation.",
  ],
  memoryTraceEvidence: ["Host receipt, attacker/defender identity, score ledger, objective state, scenario decisions and terminal events"],
  trainingTraceCandidates: [],
  rollbackOrDemotionRules: [
    "Any Engine 23.7c receipt, rules, Steamroller primitive/profile or Host receipt drift invalidates this Search parity receipt.",
    "Any Search-owned final Steamroller legality implementation invalidates the zero-duplicate claim.",
  ],
  userVisibleChecks: [
    "Search and Engine agree when scoring starts and that both players score at an open window.",
    "Illegal short Wolves movement is rejected, while Payload hauling stops at first legal base contact.",
    "Scenario setup and missing random inputs remain explicit, replay-auditable transitions.",
  ],
  globalStrictReady: false,
  trainingTruth: false,
  searchValueAuthority: false,
  skillPromotionAllowed: false,
  onlineExperimentAllowed: false,
  claimBoundary: "Search consumes certified Slice 23.7c Steamroller 2026 semantics through the shared Engine Host. Defenses/card-specific interactions, parent 23.7, generated interaction closure, values, skills, training and online experiments remain false.",
};
const report = {
  ...reportCore,
  reportHash: createHash("sha256").update(JSON.stringify(reportCore)).digest("hex"),
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
