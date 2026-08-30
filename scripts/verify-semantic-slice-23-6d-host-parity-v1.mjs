#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyRulesV1Action,
  buildWarmachineRulesV1StateFromLayer3Room,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  resolveWarmachineHostPath,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = path.join(
  REPOSITORY_ROOT,
  "build/reports/warmachine-semantic-slice-23-6d-host-parity-v1.json",
);

function sha256(absolutePath) {
  return createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
}

function piece(overrides = {}) {
  const boxesRemaining = overrides.boxesRemaining ?? 8;
  const maxBoxes = overrides.maxBoxes ?? 10;
  return {
    pieceKey: overrides.pieceKey || "piece",
    label: overrides.label || overrides.pieceKey || "Piece",
    sideKey: overrides.sideKey || "player1",
    position: overrides.position || { xIn: 10, yIn: 10 },
    baseSizeIn: overrides.baseSizeIn ?? 1.18,
    speedIn: overrides.speedIn ?? 6,
    defense: overrides.defense ?? 12,
    armor: overrides.armor ?? 16,
    isLiving: overrides.isLiving ?? true,
    damage: overrides.damage || { boxesRemaining, maxBoxes },
    statusTags: overrides.statusTags || [],
    specialRules: overrides.specialRules || [],
    ...overrides,
  };
}

function master(overrides = {}) {
  return piece({
    pieceKey: "master",
    label: "Zaateroth, The Weaver of Shadows",
    modelType: "Infernal Master",
    modelRole: "Infernal Master",
    cardType: "Infernal Master",
    isInfernalMaster: true,
    assassinationTarget: true,
    resourceKind: "essence",
    resourcePoints: 2,
    resourceMax: 99,
    arc: 7,
    controlRangeIn: 10,
    battlegroupId: "bg-a",
    ...overrides,
  });
}

function horror(overrides = {}) {
  return piece({
    pieceKey: "horror",
    label: "Tormentor",
    modelType: "Horror",
    modelRole: "Horror",
    cardType: "Horror",
    isHorror: true,
    isLiving: false,
    resourceKind: "essence",
    resourcePoints: 1,
    resourceMax: 88,
    ess: 3,
    battlegroupId: "bg-a",
    controllerPieceKey: "master",
    position: { xIn: 13, yIn: 10 },
    ...overrides,
  });
}

function state(pieces, overrides = {}) {
  return {
    stateKey: overrides.stateKey || "search-host-essence-parity",
    strictMode: true,
    phaseKey: "control",
    controlPhaseStepKey: "control_replenishment",
    activeSideKey: "player1",
    turnNumber: 1,
    roundNumber: 1,
    firstPlayerSideKey: "player1",
    secondPlayerSideKey: "player2",
    board: { widthIn: 48, heightIn: 48 },
    terrain: [],
    scenario: {},
    pieces,
    ...overrides,
  };
}

function enumerate(input) {
  return enumerateRulesV1Actions(input, {
    includeActorlessActions: true,
    includeUntargetedActions: true,
  });
}

const engineReportPath = resolveWarmachineHostPath(
  "build/function3-data/warmachine-semantic-slice-23-6d-v1/report.json",
);
const engineReport = JSON.parse(fs.readFileSync(engineReportPath, "utf8"));
assert.equal(engineReport.ok, true);
assert.equal(engineReport.sliceKey, "23.6d");
assert.equal(engineReport.semanticRuleCount, 13);
assert.equal(engineReport.primitiveCount, 13);
assert.equal(engineReport.oracleFixtureCount, 30);
assert.equal(engineReport.killedMutationCount, 16);
assert.equal(engineReport.killedMutationCount, engineReport.mutationObligationCount);
assert.match(engineReport.sourceReceiptHash, /^[0-9a-f]{64}$/);
assert.match(engineReport.authorityReceiptHash, /^[0-9a-f]{64}$/);

const boundEngineSourcePaths = [
  "scripts/warmachine-rules-v1.mjs",
  "scripts/warmachine-essence-resource-primitives-v1.mjs",
  "scripts/layer3-function3-adapter.mjs",
];
for (const relativePath of boundEngineSourcePaths) {
  assert.equal(
    warmachineHost.receipt.sourceHashes[relativePath],
    engineReport.sourceHashes[relativePath],
    `Search Host source drifted from certified Engine report: ${relativePath}`,
  );
}

const registry = JSON.parse(fs.readFileSync(resolveWarmachineHostPath(
  "data/function3-rules/warmachine-semantic-rule-registry-v1.json",
), "utf8"));
const oracle = JSON.parse(fs.readFileSync(resolveWarmachineHostPath(
  "data/function3-rules/warmachine-essence-resource-oracle-manifest-v1.json",
), "utf8"));
assert.equal(registry.scope.certifiedSliceKeys.includes("23.6d"), true);
assert.equal(oracle.sliceReady, true);

const normalized = normalizeRulesV1State(state([
  master({ resourcePoints: undefined, resourceMax: 99 }),
  horror({ resourcePoints: 7, resourceMax: 88 }),
]));
assert.equal(normalized.pieces.find((entry) => entry.pieceKey === "master").resourceMax, 7);
assert.equal(normalized.pieces.find((entry) => entry.pieceKey === "master").resourcePoints, 7);
assert.equal(normalized.pieces.find((entry) => entry.pieceKey === "horror").resourceMax, 3);
assert.equal(normalized.pieces.find((entry) => entry.pieceKey === "horror").resourcePoints, 3);

const replenishState = state([
  master({ resourcePoints: 2 }),
  horror(),
  piece({ pieceKey: "cultist", position: { xIn: 12, yIn: 10 }, isLiving: true }),
]);
const replenishEnumeration = enumerate(replenishState);
const leech = replenishEnumeration.actions.find((entry) =>
  entry.actionType === "leech_life_force_essence" && entry.actorPieceKey === "master");
assert.ok(leech);
assert.equal(replenishEnumeration.actions.some((entry) =>
  entry.actionType === "leech_life_force_essence" && entry.actorPieceKey === "horror"), false);
const afterLeech = applyRulesV1Action(replenishState, leech);
assert.equal(afterLeech.ok, true);
const afterLeechEnumeration = enumerate(afterLeech.nextState);
assert.equal(afterLeechEnumeration.actions.some((entry) =>
  entry.actionType === "sacrifice_for_essence"), false);
assert.equal(afterLeechEnumeration.rejectedActions.some((entry) =>
  entry.actionType === "sacrifice_for_essence" &&
  entry.targetPieceKey === "cultist" &&
  entry.rejection?.reason === "essence_replenishment_method_already_selected"), true);

const allocationState = state([
  master({ resourcePoints: 4 }),
  horror({ resourcePoints: 1 }),
  horror({
    pieceKey: "other-horror",
    battlegroupId: "bg-b",
    controllerPieceKey: "other-master",
    position: { xIn: 14, yIn: 10 },
  }),
  horror({ pieceKey: "full-horror", resourcePoints: 3, position: { xIn: 15, yIn: 10 } }),
], { controlPhaseStepKey: "control_remaining" });
const allocationEnumeration = enumerate(allocationState);
const allocation = allocationEnumeration.actions.find((entry) =>
  entry.actionType === "allocate_resource" &&
  entry.resourceKind === "essence" &&
  entry.targetPieceKey === "horror");
assert.ok(allocation);
assert.equal(allocation.metadata?.lineOfSightRequired, false);
assert.equal(allocationEnumeration.rejectedActions.some((entry) =>
  entry.actionType === "allocate_resource" &&
  entry.targetPieceKey === "other-horror" &&
  entry.rejection?.reason === "target_not_in_infernal_master_battlegroup"), true);
assert.equal(allocationEnumeration.rejectedActions.some((entry) =>
  entry.actionType === "allocate_resource" &&
  entry.targetPieceKey === "full-horror" &&
  entry.rejection?.reason === "target_current_ess_reached"), true);
const afterAllocation = applyRulesV1Action(allocationState, allocation);
assert.equal(afterAllocation.ok, true);
assert.equal(afterAllocation.nextState.pieces.find((entry) =>
  entry.pieceKey === "master").resourcePoints, 3);
assert.equal(afterAllocation.nextState.pieces.find((entry) =>
  entry.pieceKey === "horror").resourcePoints, 2);

const healingState = state([
  master({ resourcePoints: 2, boxesRemaining: 8, maxBoxes: 10 }),
  horror({ resourcePoints: 1, boxesRemaining: 8, maxBoxes: 10 }),
], { phaseKey: "activation", controlPhaseStepKey: "" });
const healingEnumeration = enumerate(healingState);
const healSelf = healingEnumeration.actions.find((entry) =>
  entry.actionType === "essence_heal" &&
  entry.actorPieceKey === "master" &&
  entry.targetPieceKey === "master");
assert.ok(healSelf);
assert.ok(healingEnumeration.actions.find((entry) =>
  entry.actionType === "essence_heal" &&
  entry.actorPieceKey === "master" &&
  entry.targetPieceKey === "horror"));
const afterHealing = applyRulesV1Action(healingState, healSelf);
assert.equal(afterHealing.ok, true);
assert.equal(afterHealing.nextState.pieces.find((entry) =>
  entry.pieceKey === "master").resourcePoints, 1);
assert.equal(afterHealing.nextState.pieces.find((entry) =>
  entry.pieceKey === "master").damage.boxesRemaining, 9);

const room = {
  id: "search-host-layer3-essence-room",
  game: {
    gameKey: "search-host-layer3-essence",
    phase: "control",
    phaseKey: "control",
    controlPhaseStepKey: "control_remaining",
    activeSideKey: "player1",
    strictExecutorMode: true,
    turnNumber: 1,
    board: { widthIn: 48, heightIn: 48 },
  },
  tokens: {
    master: {
      id: "master",
      side: "player1",
      x: 10,
      y: 10,
      baseSizeIn: 1.18,
      modelRole: "Infernal Master",
      modelType: "Infernal Master",
      arc: 9,
      resourceKind: "essence",
      essence: 6,
      resource2: 6,
      resource2Max: 99,
      battlegroupId: "bg-a",
    },
    horror: {
      id: "horror",
      side: "player1",
      x: 13,
      y: 10,
      baseSizeIn: 1.97,
      modelRole: "Horror",
      modelType: "Horror",
      ess: 3,
      resourceKind: "essence",
      essence: 1,
      resource2: 1,
      resource2Max: 99,
      battlegroupId: "bg-a",
      controllerPieceKey: "master",
    },
  },
  terrain: {},
  widgets: {},
  logs: {},
};
const bridged = buildWarmachineRulesV1StateFromLayer3Room(room, {
  strictMode: true,
  enforceStrictExecutor: true,
});
const bridgedMaster = bridged.pieces.find((entry) => entry.pieceKey === "master");
const bridgedHorror = bridged.pieces.find((entry) => entry.pieceKey === "horror");
assert.equal(bridgedMaster.isInfernalMaster, true);
assert.equal(bridgedMaster.resourcePoints, 6);
assert.equal(bridgedMaster.resourceMax, 9);
assert.equal(bridgedHorror.isHorror, true);
assert.equal(bridgedHorror.resourcePoints, 1);
assert.equal(bridgedHorror.resourceMax, 3);

const sourcePaths = [
  path.join(REPOSITORY_ROOT, "scripts/verify-semantic-slice-23-6d-host-parity-v1.mjs"),
  path.join(REPOSITORY_ROOT, "src/upstream-project-d.mjs"),
  path.join(REPOSITORY_ROOT, "src/warmachine-host-runtime.mjs"),
];
const sourceHashes = Object.fromEntries(sourcePaths.sort().map((absolutePath) => [
  path.relative(REPOSITORY_ROOT, absolutePath),
  sha256(absolutePath),
]));
const reportCore = {
  ok: true,
  schemaVersion: "warmachine_semantic_slice_23_6d_host_parity_v1",
  sliceKey: "23.6d",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  engineSourceReceiptHash: engineReport.sourceReceiptHash,
  engineAuthorityReceiptHash: engineReport.authorityReceiptHash,
  boundEngineSourcePaths,
  semanticRuleCount: engineReport.semanticRuleCount,
  primitiveCount: engineReport.primitiveCount,
  oracleFixtureCount: engineReport.oracleFixtureCount,
  mutationObligationCount: engineReport.mutationObligationCount,
  killedMutationCount: engineReport.killedMutationCount,
  searchHostCases: [
    "current_arc_and_ess_override_forged_resource_max",
    "life_force_leech_legal_for_master_not_horror",
    "mixed_replenishment_method_rejected_and_replayable",
    "owned_horror_allocation_without_los_requirement",
    "wrong_battlegroup_and_full_current_ess_allocation_rejected",
    "essence_allocation_mutates_master_and_horror",
    "essence_healing_enumerates_and_executes",
    "layer3_infernal_horror_identity_and_essence_state_preserved",
  ],
  searchSideRuleImplementationCount: 0,
  sourceHashes,
  harnessLoopUsed: true,
  targetGames: ["warmachine"],
  promptPackRoutes: [],
  harnessToolsCalled: [
    "normalizeRulesV1State",
    "enumerateRulesV1Actions",
    "applyRulesV1Action",
    "buildWarmachineRulesV1StateFromLayer3Room",
  ],
  uiTraceEvidence: [
    "Layer3 Infernal Master and Horror identity, current capacity and Essence counters survive the Search Host bridge",
  ],
  agentDecisionEvidence: [
    "legal Essence actions and exact rejected alternatives are conserved by Search Host enumeration",
  ],
  memoryTraceEvidence: [
    "the selected per-turn Essence replenishment method remains present after Host transition",
  ],
  trainingTraceCandidates: [],
  rollbackOrDemotionRules: [
    "engine_source_receipt_drift_invalidates_this_host_parity_receipt",
    "failed_host_transition_or_rejected_action_replay_demotes_slice_23_6d_search_consumption",
  ],
  userVisibleChecks: [
    "Infernal Master and Horror Essence counters are visible through the Layer3 bridge",
    "illegal mixed replenishment and allocation targets retain exact reject reasons",
  ],
  globalStrictReady: false,
  trainingTruth: false,
  searchValueAuthority: false,
  claimBoundary: "This receipt proves only that Search consumes the exact Engine sources certified by bounded Slice 23.6d and observes representative Essence legal, rejected, transition and Layer3 behavior without implementing resource rules. It does not certify parent Slice 23.6, card-specific resource interactions, global Strict, complete action-space search, strategy values, skills, training or online experiments.",
};
const report = {
  ...reportCore,
  reportHash: createHash("sha256").update(JSON.stringify(reportCore)).digest("hex"),
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
