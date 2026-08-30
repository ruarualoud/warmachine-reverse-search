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
  "build/reports/warmachine-semantic-slice-23-6-host-parity-v1.json",
);

function sha256(absolutePath) {
  return createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
}

function piece(overrides = {}) {
  return {
    pieceKey: overrides.pieceKey || "piece",
    label: overrides.label || overrides.pieceKey || "Piece",
    sideKey: overrides.sideKey || "player1",
    position: overrides.position || { xIn: 8, yIn: 8 },
    baseSizeIn: overrides.baseSizeIn ?? 1.18,
    speedIn: 6,
    defense: 12,
    armor: 16,
    boxesRemaining: 8,
    maxBoxes: 8,
    statusTags: [],
    specialRules: [],
    ...overrides,
  };
}

function state(pieces, overrides = {}) {
  return {
    stateKey: overrides.stateKey || "search-parent-resource-parity",
    strictMode: true,
    activeSideKey: "player1",
    phaseKey: "activation",
    turnNumber: 2,
    roundNumber: 2,
    board: { widthIn: 48, heightIn: 48 },
    terrain: [],
    scenario: {},
    pieces,
    ...overrides,
  };
}

function supportSpell(id) {
  return {
    id,
    name: `Ward ${id}`,
    cost: "1",
    rng: "8",
    aoe: "-",
    pow: "-",
    dur: "Turn",
    off: "No",
    description: "Target friendly Faction model gains +2 ARM.",
  };
}

function warcaster(overrides = {}) {
  return piece({
    pieceKey: "caster",
    cardType: "Warcaster",
    modelRole: "warcaster",
    modelType: "warcaster",
    resourceKind: "focus",
    resourcePoints: 4,
    resourceMax: 6,
    arc: 6,
    controlRangeIn: 12,
    battlegroupId: "focus-bg",
    spells: [supportSpell("focus-ward")],
    ...overrides,
  });
}

function warjack(overrides = {}) {
  return piece({
    pieceKey: "jack",
    position: { xIn: 10, yIn: 8 },
    cardType: "Warjack",
    modelRole: "warjack",
    modelType: "warjack",
    resourceKind: "focus",
    resourcePoints: 1,
    resourceMax: 3,
    controllerPieceKey: "caster",
    battlegroupId: "focus-bg",
    ...overrides,
  });
}

function warlock(overrides = {}) {
  return piece({
    pieceKey: "lock",
    cardType: "Warlock",
    modelRole: "warlock",
    modelType: "warlock",
    resourceKind: "fury",
    resourcePoints: 4,
    resourceMax: 6,
    arc: 6,
    controlRangeIn: 12,
    battlegroupId: "fury-bg",
    spells: [supportSpell("fury-ward")],
    ...overrides,
  });
}

function warbeast(overrides = {}) {
  return piece({
    pieceKey: "beast",
    position: { xIn: 10, yIn: 8 },
    cardType: "Warbeast",
    modelRole: "warbeast",
    modelType: "warbeast",
    resourceKind: "fury",
    resourcePoints: 1,
    resourceMax: 4,
    canForceFury: true,
    controllerPieceKey: "lock",
    battlegroupId: "fury-bg",
    ...overrides,
  });
}

function master(overrides = {}) {
  return piece({
    pieceKey: "master",
    cardType: "Infernal Master",
    modelRole: "Infernal Master",
    modelType: "Infernal Master",
    isInfernalMaster: true,
    resourceKind: "essence",
    resourcePoints: 4,
    resourceMax: 7,
    arc: 7,
    controlRangeIn: 12,
    battlegroupId: "essence-bg",
    spells: [supportSpell("essence-ward")],
    ...overrides,
  });
}

function horror(overrides = {}) {
  return piece({
    pieceKey: "horror",
    position: { xIn: 10, yIn: 8 },
    cardType: "Horror",
    modelRole: "Horror",
    modelType: "Horror",
    isHorror: true,
    isLiving: false,
    resourceKind: "essence",
    resourcePoints: 1,
    resourceMax: 3,
    ess: 3,
    controllerPieceKey: "master",
    battlegroupId: "essence-bg",
    ...overrides,
  });
}

function enumerate(input) {
  return enumerateRulesV1Actions(input, {
    includeActorlessActions: true,
    includeUntargetedActions: true,
  });
}

function byKey(input, pieceKey) {
  return input.pieces.find((entry) => entry.pieceKey === pieceKey);
}

const engineReportPath = resolveWarmachineHostPath(
  "build/function3-data/warmachine-semantic-slice-23-6-v1/report.json",
);
const engineReport = JSON.parse(fs.readFileSync(engineReportPath, "utf8"));
assert.equal(engineReport.ok, true);
assert.equal(engineReport.sliceKey, "23.6");
assert.equal(engineReport.parentSliceStrictCertified, true);
assert.equal(engineReport.semanticRuleCount, 33);
assert.equal(engineReport.primitiveCount, 36);
assert.equal(engineReport.oracleFixtureCount, 113);
assert.equal(engineReport.killedMutationCount, 50);
assert.equal(engineReport.killedMutationCount, engineReport.mutationObligationCount);
assert.equal(engineReport.interactionCaseCount, 9);

const boundEngineSourcePaths = [
  "scripts/warmachine-rules-v1.mjs",
  "scripts/warmachine-control-resource-primitives-v1.mjs",
  "scripts/warmachine-fury-primitives-v1.mjs",
  "scripts/warmachine-spell-primitives-v1.mjs",
  "scripts/warmachine-essence-resource-primitives-v1.mjs",
  "scripts/layer3-function3-adapter.mjs",
];
for (const relativePath of boundEngineSourcePaths) {
  assert.equal(
    warmachineHost.receipt.sourceHashes[relativePath],
    engineReport.sourceHashes[relativePath],
    `Search Host source drifted from certified parent Engine report: ${relativePath}`,
  );
}

const cases = [];
for (const config of [
  { kind: "focus", actor: "caster", target: "jack", pieces: [warcaster(), warjack()] },
  { kind: "fury", actor: "lock", target: "beast", pieces: [warlock(), warbeast()] },
  { kind: "essence", actor: "master", target: "horror", pieces: [master(), horror()] },
]) {
  const input = state(config.pieces, { stateKey: `search-${config.kind}-spell` });
  const action = enumerate(input).actions.find((entry) =>
    entry.actionType === "cast_support_spell" &&
    entry.actorPieceKey === config.actor &&
    entry.targetPieceKey === config.target);
  assert.ok(action);
  assert.equal(action.resourceKind, config.kind);
  const before = normalizeRulesV1State(input);
  const transition = applyRulesV1Action(input, action);
  assert.equal(transition.ok, true);
  assert.equal(byKey(transition.nextState, config.actor).resourcePoints,
    byKey(before, config.actor).resourcePoints - 1);
  assert.equal(byKey(transition.nextState, config.target).resourcePoints,
    byKey(before, config.target).resourcePoints);
  cases.push(`${config.kind}_spell_host_resource_isolation`);
}

for (const config of [
  {
    kind: "focus",
    actor: "caster",
    target: "jack",
    input: state([warcaster(), warjack()], {
      stateKey: "search-focus-allocation",
      phaseKey: "control",
      controlPhaseStepKey: "control_remaining",
    }),
  },
  {
    kind: "essence",
    actor: "master",
    target: "horror",
    input: state([master(), horror()], {
      stateKey: "search-essence-allocation",
      phaseKey: "control",
      controlPhaseStepKey: "control_remaining",
    }),
  },
]) {
  const action = enumerate(config.input).actions.find((entry) =>
    entry.actionType === "allocate_resource" &&
    entry.resourceKind === config.kind &&
    entry.actorPieceKey === config.actor &&
    entry.targetPieceKey === config.target);
  assert.ok(action);
  const before = normalizeRulesV1State(config.input);
  const transition = applyRulesV1Action(config.input, action);
  assert.equal(transition.ok, true);
  assert.equal(byKey(transition.nextState, config.actor).resourcePoints,
    byKey(before, config.actor).resourcePoints - 1);
  assert.equal(byKey(transition.nextState, config.target).resourcePoints,
    byKey(before, config.target).resourcePoints + 1);
  cases.push(`${config.kind}_allocation_host_resource_isolation`);
}

{
  const input = state([warlock(), warbeast({ resourcePoints: 0 })], {
    stateKey: "search-fury-force",
  });
  const action = enumerate(input).actions.find((entry) =>
    entry.actionType === "force_fury" &&
    entry.actorPieceKey === "beast" &&
    entry.metadata?.resourceAmount === 1);
  assert.ok(action);
  const transition = applyRulesV1Action(input, action);
  assert.equal(transition.ok, true);
  assert.equal(byKey(transition.nextState, "lock").resourcePoints, 4);
  assert.equal(byKey(transition.nextState, "beast").resourcePoints, 1);
  cases.push("fury_force_host_resource_isolation");
}

{
  const fake = piece({
    pieceKey: "fake-essence-user",
    modelRole: "solo",
    modelType: "solo",
    resourceKind: "essence",
    resourcePoints: 3,
    resourceMax: 7,
    arc: 7,
    boxesRemaining: 6,
    maxBoxes: 8,
  });
  const input = state([fake], { stateKey: "search-resource-role-forgery" });
  assert.notEqual(byKey(normalizeRulesV1State(input), "fake-essence-user").isInfernalMaster, true);
  assert.equal(enumerate(input).actions.some((entry) => [
    "leech_life_force_essence",
    "sacrifice_for_essence",
    "allocate_resource",
    "essence_heal",
  ].includes(entry.actionType)), false);
  cases.push("resource_kind_cannot_forge_controller_role_through_host");
}

assert.equal(cases.length, 7);

const sourcePaths = [
  path.join(REPOSITORY_ROOT, "scripts/verify-semantic-slice-23-6-host-parity-v1.mjs"),
  path.join(REPOSITORY_ROOT, "src/upstream-project-d.mjs"),
  path.join(REPOSITORY_ROOT, "src/warmachine-host-runtime.mjs"),
];
const sourceHashes = Object.fromEntries(sourcePaths.sort().map((absolutePath) => [
  path.relative(REPOSITORY_ROOT, absolutePath),
  sha256(absolutePath),
]));
const reportCore = {
  ok: true,
  schemaVersion: "warmachine_semantic_slice_23_6_host_parity_v1",
  sliceKey: "23.6",
  parentSliceStrictCertified: true,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  engineSourceReceiptHash: engineReport.sourceReceiptHash,
  engineAuthorityReceiptHash: engineReport.authorityReceiptHash,
  engineReportHash: engineReport.reportHash,
  boundEngineSourcePaths,
  semanticRuleCount: engineReport.semanticRuleCount,
  primitiveCount: engineReport.primitiveCount,
  oracleFixtureCount: engineReport.oracleFixtureCount,
  mutationObligationCount: engineReport.mutationObligationCount,
  killedMutationCount: engineReport.killedMutationCount,
  searchHostCaseCount: cases.length,
  searchHostCases: cases,
  searchSideRuleImplementationCount: 0,
  sourceHashes,
  harnessLoopUsed: true,
  targetGames: ["warmachine"],
  promptPackRoutes: [],
  harnessToolsCalled: [
    "normalizeRulesV1State",
    "enumerateRulesV1Actions",
    "applyRulesV1Action",
  ],
  uiTraceEvidence: [
    "Search consumes the same Layer3 adapter source certified for Focus, Fury and Essence counters",
  ],
  agentDecisionEvidence: [
    "Search Host exposes resource-typed spell, allocation and force actions without cross-system mutations",
  ],
  memoryTraceEvidence: [
    "resource-specific transition ledgers remain Engine-owned and present after Host application",
  ],
  trainingTraceCandidates: [],
  rollbackOrDemotionRules: [
    "any Engine source or parent receipt drift invalidates this Search Host parity receipt",
    "card-specific resource replacements remain outside parent Slice 23.6",
  ],
  userVisibleChecks: [
    "Focus, Fury and Essence action costs and counters remain distinguishable through Search Host",
  ],
  globalStrictReady: false,
  trainingTruth: false,
  searchValueAuthority: false,
  claimBoundary: "This receipt certifies Search Host consumption of the ordinary parent Slice 23.6 Focus, Fury, spell and Essence runtime without Search-owned resource rules. It does not certify card-specific replacements, global Strict, complete action-space search, strategy values, skills, training or online experiments.",
};
const report = {
  ...reportCore,
  reportHash: createHash("sha256").update(JSON.stringify(reportCore)).digest("hex"),
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
