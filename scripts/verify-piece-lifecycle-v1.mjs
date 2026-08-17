import assert from "node:assert/strict";

import { reverseWarmachineActivationSequenceV2 } from
  "../src/reverse/activation-sequence-predecessor-v2.mjs";
import {
  warmachinePieceInPlayV1,
  warmachinePieceLifecycleStageV1,
} from "../src/reverse/piece-lifecycle-v1.mjs";
import { buildWarmachineRosterProvenanceV2 } from
  "../src/reverse/terminal-proof-v2.mjs";
import { warmachineReverseStateSemanticHashV1 } from
  "../src/reverse/terminal-event-predecessor-v1.mjs";

function piece(pieceKey, overrides = {}) {
  return {
    pieceKey,
    label: pieceKey,
    sideKey: "player1",
    modelRole: "solo",
    modelType: "warrior model",
    position: { xIn: 12, yIn: 12 },
    baseSizeIn: 1.18,
    defense: 12,
    armor: 14,
    damage: { boxesRemaining: 5, maxBoxes: 5 },
    statusTags: [],
    attackProfiles: [],
    activated: true,
    cardSnapshot: { id: `card-${pieceKey}`, pointCostNumber: 1 },
    ...overrides,
  };
}

const lifecyclePieces = [
  piece("live"),
  piece("reserve", { notDeployed: true }),
  piece("dormant", { replacementStartsDormant: true }),
  piece("rfp", { removed_from_play: true }),
  piece("destroyed", { destroyed: true }),
  piece("disabled", {
    disabled: true,
    statusTags: ["disabled"],
    damage: { boxesRemaining: 1, maxBoxes: 5 },
  }),
];
assert.deepEqual(lifecyclePieces.map((entry) =>
  warmachinePieceLifecycleStageV1(entry)), [
  "in_play",
  "not_deployed",
  "dormant",
  "removed_from_play",
  "destroyed",
  "disabled",
]);
assert.deepEqual(lifecyclePieces.map(warmachinePieceInPlayV1),
  [true, false, false, false, false, false]);

const state = {
  stateKey: "piece-lifecycle-reverse-activation-successor",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 2,
  strictMode: true,
  enforceStrictExecutor: true,
  ruleAtomRuntimeMode: "authoritative",
  board: { widthIn: 48, heightIn: 48 },
  pieces: [
    ...lifecyclePieces,
    piece("wounded", {
      sideKey: "player2",
      position: { xIn: 35, yIn: 30 },
      activated: false,
      damage: { boxesRemaining: 3, maxBoxes: 10 },
    }),
    piece("damaged-jack", {
      sideKey: "player2",
      position: { xIn: 37, yIn: 32 },
      activated: false,
      isWarjack: true,
      modelRole: "warjack",
      damage: {
        boxesRemaining: 8,
        maxBoxes: 20,
        systems: { cortex: 0, movement: 2, leftArm: 1, rightArm: 0 },
        systemDamageOrder: ["cortex", "rightArm"],
      },
    }),
    piece("damaged-beast", {
      sideKey: "player2",
      position: { xIn: 39, yIn: 34 },
      activated: false,
      isWarbeast: true,
      modelRole: "warbeast",
      damage: {
        boxesRemaining: 9,
        maxBoxes: 24,
        systems: { body: 3, mind: 0, spirit: 2 },
        systemDamageOrder: ["mind"],
      },
    }),
    piece("enemy", {
      sideKey: "player2",
      position: { xIn: 40, yIn: 36 },
      activated: false,
    }),
  ],
  terrain: [],
  scenario: {
    zones: [],
    flags: [],
    objectives: [],
    score: { player1: 0, player2: 0 },
  },
};
const reverse = reverseWarmachineActivationSequenceV2(state, {
  sideKey: "player1",
  includeMovement: false,
  includePass: true,
  maximumDepth: 1,
  maximumLabels: 8,
  maximumUniqueStates: 8,
  onProgress: process.env.WARMACHINE_LIFECYCLE_PROGRESS === "1"
    ? (entry) => console.error(JSON.stringify(entry))
    : undefined,
});
assert.equal(reverse.ok, true, JSON.stringify(reverse.unresolved));
assert.equal(reverse.boundaryRouteCount, 1);
assert.deepEqual(reverse.runtimeBoundaries[0].reverseEdges[0].activationGroupPieceKeys,
  ["live"]);
assert.equal(reverse.runtimeBoundaries[0].state.pieces.find((entry) =>
  entry.pieceKey === "live").activated, false);
assert.equal(reverse.runtimeBoundaries[0].state.pieces.filter((entry) =>
  ["reserve", "dormant", "rfp", "destroyed", "disabled"].includes(entry.pieceKey))
  .every((entry) => entry.activated === true), true);

const provenance = buildWarmachineRosterProvenanceV2(state);
assert.equal(provenance.modelCount, state.pieces.length);
assert.deepEqual(Object.fromEntries(provenance.rows.filter((row) =>
  row.sideKey === "player1").map((row) => [row.pieceKey, row.lifecycleStage])), {
  destroyed: "destroyed",
  disabled: "disabled",
  dormant: "dormant",
  live: "in_play",
  reserve: "not_deployed",
  rfp: "removed_from_play",
});
const wounded = provenance.rows.find((row) => row.pieceKey === "wounded");
const damagedJack = provenance.rows.find((row) => row.pieceKey === "damaged-jack");
const damagedBeast = provenance.rows.find((row) => row.pieceKey === "damaged-beast");
assert.deepEqual({
  boxesRemaining: wounded.damageState.boxesRemaining,
  maxBoxes: wounded.damageState.maxBoxes,
}, { boxesRemaining: 3, maxBoxes: 10 });
assert.deepEqual(damagedJack.damageState.crippledSystemKeys, ["cortex", "rightArm"]);
assert.equal(damagedJack.damageState.warjackSystemState.cortex, 0);
assert.deepEqual(damagedBeast.damageState.warbeastAspectState,
  { body: 3, mind: 0, spirit: 2 });

const baseSemanticHash = warmachineReverseStateSemanticHashV1(state);
const semanticVariants = {
  missingModel: structuredClone(state),
  remainingBoxes: structuredClone(state),
  warjackSystem: structuredClone(state),
  warbeastBranch: structuredClone(state),
  removedFromPlay: structuredClone(state),
  reserveLifecycle: structuredClone(state),
  disabledCapability: structuredClone(state),
};
semanticVariants.missingModel.pieces = semanticVariants.missingModel.pieces.filter((entry) =>
  entry.pieceKey !== "wounded");
semanticVariants.remainingBoxes.pieces.find((entry) =>
  entry.pieceKey === "wounded").damage.boxesRemaining = 2;
semanticVariants.warjackSystem.pieces.find((entry) =>
  entry.pieceKey === "damaged-jack").damage.systems.cortex = 1;
semanticVariants.warbeastBranch.pieces.find((entry) =>
  entry.pieceKey === "damaged-beast").damage.systems.mind = 1;
delete semanticVariants.removedFromPlay.pieces.find((entry) =>
  entry.pieceKey === "rfp").removed_from_play;
delete semanticVariants.reserveLifecycle.pieces.find((entry) =>
  entry.pieceKey === "reserve").notDeployed;
semanticVariants.disabledCapability.pieces.find((entry) =>
  entry.pieceKey === "disabled").statusTags = [];
const semanticVariantHashes = Object.fromEntries(Object.entries(semanticVariants).map(
  ([key, variant]) => [key, warmachineReverseStateSemanticHashV1(variant)],
));
assert.equal(Object.values(semanticVariantHashes).every((hash) =>
  hash !== baseSemanticHash), true, JSON.stringify({
  baseSemanticHash,
  semanticVariantHashes,
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_piece_lifecycle_v1",
  lifecycleStages: Object.fromEntries(lifecyclePieces.map((entry) => [
    entry.pieceKey,
    warmachinePieceLifecycleStageV1(entry),
  ])),
  activationActorPieceKeys:
    reverse.runtimeBoundaries[0].reverseEdges[0].activationGroupPieceKeys,
  rosterModelCount: provenance.modelCount,
  woundedDamageState: wounded.damageState,
  damagedWarjackState: damagedJack.damageState,
  damagedWarbeastState: damagedBeast.damageState,
  semanticIdentityVariantCount: Object.keys(semanticVariantHashes).length,
  semanticVariantHashes,
  provenanceHash: provenance.provenanceHash,
}, null, 2));
