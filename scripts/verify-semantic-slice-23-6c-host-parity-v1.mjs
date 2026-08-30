#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyRulesV1Action,
  enumerateRulesV1Actions,
  resolveWarmachineHostPath,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = path.join(
  REPOSITORY_ROOT,
  "build/reports/warmachine-semantic-slice-23-6c-host-parity-v1.json",
);

function sha256(absolutePath) {
  return createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
}

function piece(overrides = {}) {
  return {
    pieceKey: overrides.pieceKey || "piece",
    sideKey: "player1",
    position: { xIn: 8, yIn: 8 },
    baseSizeIn: 1.18,
    speedIn: 6,
    defense: 12,
    armor: 16,
    boxesRemaining: 8,
    maxBoxes: 8,
    ...overrides,
  };
}

function state(pieces, overrides = {}) {
  return {
    stateKey: overrides.stateKey || "search-host-spell-parity",
    strictMode: true,
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 2,
    board: { widthIn: 48, heightIn: 48 },
    pieces,
    ...overrides,
  };
}

function warlock(overrides = {}) {
  return piece({
    pieceKey: "warlock",
    label: "Warlock",
    modelRole: "warlock",
    modelType: "warlock",
    resourceKind: "fury",
    resourcePoints: 6,
    resourceMax: 6,
    arc: 6,
    controlRangeIn: 12,
    canLeechFury: true,
    battlegroupId: "bg-1",
    ...overrides,
  });
}

function warbeast(overrides = {}) {
  return piece({
    pieceKey: "warbeast",
    label: "Warbeast",
    position: { xIn: 12, yIn: 8 },
    modelRole: "warbeast",
    modelType: "warbeast",
    resourceKind: "fury",
    resourcePoints: 0,
    resourceMax: 4,
    furyThreshold: 9,
    canForceFury: true,
    controllerPieceKey: "warlock",
    battlegroupId: "bg-1",
    cardSnapshot: {
      id: "search-host-warbeast-card",
      name: "Search Host Warbeast",
      cardTypeName: "Warbeast",
      spells: [{
        id: "rage",
        name: "Rage",
        cost: "2",
        rng: "6",
        aoe: "-",
        pow: "-",
        dur: "Turn",
        off: "No",
        description: "Target friendly Faction warbeast gains +2 to its melee damage rolls.",
      }],
      models: [],
    },
    ...overrides,
  });
}

const engineReportPath = resolveWarmachineHostPath(
  "build/function3-data/warmachine-semantic-slice-23-6c-v1/report.json",
);
const engineReport = JSON.parse(fs.readFileSync(engineReportPath, "utf8"));
assert.equal(engineReport.ok, true);
assert.equal(engineReport.sliceKey, "23.6c");
assert.equal(engineReport.semanticRuleCount, 7);
assert.equal(engineReport.primitiveCount, 8);
assert.equal(engineReport.oracleFixtureCount, 26);
assert.equal(engineReport.killedMutationCount, engineReport.mutationObligationCount);
assert.match(engineReport.authorityReceiptHash, /^[0-9a-f]{64}$/);

const boundEngineSourcePaths = [
  "scripts/warmachine-rules-v1.mjs",
  "scripts/warmachine-spell-primitives-v1.mjs",
  "scripts/layer3-function3-adapter.mjs",
];
for (const relativePath of boundEngineSourcePaths) {
  assert.equal(
    warmachineHost.receipt.sourceHashes[relativePath],
    engineReport.sourceHashes[relativePath],
    `Search Host source drifted from the certified Engine report: ${relativePath}`,
  );
}

const registry = JSON.parse(fs.readFileSync(resolveWarmachineHostPath(
  "data/function3-rules/warmachine-semantic-rule-registry-v1.json",
), "utf8"));
const oracle = JSON.parse(fs.readFileSync(resolveWarmachineHostPath(
  "data/function3-rules/warmachine-spell-oracle-manifest-v1.json",
), "utf8"));
assert.equal(registry.scope.certifiedSliceKeys.includes("23.6c"), true);
assert.equal(oracle.sliceReady, true);

const animusState = state([warlock(), warbeast()]);
const animusEnumeration = enumerateRulesV1Actions(animusState);
const ownAnimus = animusEnumeration.actions.find((action) =>
  action.actionType === "cast_animus" &&
  action.actorPieceKey === "warbeast" &&
  action.targetPieceKey === "warbeast");
const borrowedAnimus = animusEnumeration.actions.find((action) =>
  action.actionType === "cast_animus" &&
  action.actorPieceKey === "warlock" &&
  action.targetPieceKey === "warbeast");
assert.ok(ownAnimus, "Search Host must expose a warbeast's own animus");
assert.ok(borrowedAnimus, "Search Host must expose an in-control borrowed animus");
assert.equal(borrowedAnimus.metadata?.borrowedAnimus, true);

const ownTransition = applyRulesV1Action(animusState, { actionKey: ownAnimus.actionKey });
assert.equal(ownTransition.ok, true);
const afterOwn = enumerateRulesV1Actions(ownTransition.nextState);
assert.equal(afterOwn.actions.some((action) =>
  action.actionType === "cast_animus" && action.actorPieceKey === "warbeast"), false);
assert.equal(afterOwn.rejectedActions.some((action) =>
  action.actionType === "cast_animus" &&
  action.actorPieceKey === "warbeast" &&
  action.rejection?.reason === "animus_once_per_activation_already_cast"), true);

const outOfControl = state([
  warlock(),
  warbeast({ position: { xIn: 30, yIn: 8 } }),
], { stateKey: "search-host-borrowed-animus-out-of-control" });
assert.equal(enumerateRulesV1Actions(outOfControl).actions.some((action) =>
  action.actionType === "cast_animus" && action.actorPieceKey === "warlock"), false);

const upkeepCaster = piece({
  pieceKey: "upkeep-caster",
  modelRole: "warcaster",
  modelType: "warcaster",
  resourceKind: "focus",
  resourcePoints: 1,
  resourceMax: 6,
  upkeepSpells: [{
    spellKey: "printed-cost-three",
    name: "Printed Cost Three",
    cost: 3,
    text: "Mapped upkeep effect.",
    executableEffects: [{ effectType: "status_add", statusTag: "maintained" }],
  }],
});
const upkeepAction = enumerateRulesV1Actions(state(
  [upkeepCaster],
  { stateKey: "search-host-upkeep-fixed-one", phaseKey: "control" },
)).actions.find((action) => action.actionType === "upkeep_spell");
assert.ok(upkeepAction);
assert.equal(upkeepAction.resourceCost, 1);

const sourcePaths = [
  path.join(REPOSITORY_ROOT, "scripts/verify-semantic-slice-23-6c-host-parity-v1.mjs"),
  path.join(REPOSITORY_ROOT, "src/upstream-project-d.mjs"),
  path.join(REPOSITORY_ROOT, "src/warmachine-host-runtime.mjs"),
];
const sourceHashes = Object.fromEntries(sourcePaths.sort().map((absolutePath) => [
  path.relative(REPOSITORY_ROOT, absolutePath),
  sha256(absolutePath),
]));
const reportCore = {
  ok: true,
  schemaVersion: "warmachine_semantic_slice_23_6c_host_parity_v1",
  sliceKey: "23.6c",
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
    "upkeep_maintenance_fixed_cost_one",
    "warbeast_own_animus",
    "warlock_borrowed_animus_in_control",
    "borrowed_animus_out_of_control_rejected",
    "warbeast_animus_once_per_activation",
  ],
  searchSideRuleImplementationCount: 0,
  sourceHashes,
  harnessLoopUsed: true,
  targetGames: ["warmachine"],
  promptPackRoutes: [],
  harnessToolsCalled: ["enumerateRulesV1Actions", "applyRulesV1Action"],
  uiTraceEvidence: [],
  agentDecisionEvidence: [],
  memoryTraceEvidence: [],
  trainingTraceCandidates: [],
  rollbackOrDemotionRules: [
    "engine_source_receipt_drift_invalidates_this_host_parity_receipt",
    "failed_host_execution_demotes_slice_23_6c_search_consumption",
  ],
  userVisibleChecks: [
    "fixed-cost upkeep is visible through Search Host enumeration",
    "own and borrowed animus actions are visible with strict negative rejection",
  ],
  globalStrictReady: false,
  trainingTruth: false,
  searchValueAuthority: false,
  claimBoundary: "This receipt proves only that Search consumes the exact Engine sources certified by bounded Slice 23.6c and observes representative upkeep/animus positive and negative behavior without implementing spell rules. It does not certify parent Slice 23.6, global Strict, complete action-space search, strategy values, skills, training or online experiments.",
};
const report = {
  ...reportCore,
  reportHash: createHash("sha256").update(JSON.stringify(reportCore)).digest("hex"),
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
