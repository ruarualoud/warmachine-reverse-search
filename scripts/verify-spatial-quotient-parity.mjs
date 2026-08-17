import assert from "node:assert/strict";

import {
  buildWarmachineCertifiedSpatialAutomorphisms,
  buildWarmachineKillingSpreeRelationCell,
  buildWarmachineUnitPermutationQuotient,
  quotientWarmachineReverseAlternatives,
} from "../src/reverse/spatial-quotient-v1.mjs";
import { loadLegacyReverseSearchModules } from "../src/upstream-project-d.mjs";

function piece(pieceKey, sideKey, xIn, yIn, overrides = {}) {
  return {
    pieceKey,
    sideKey,
    position: { xIn, yIn },
    baseSizeIn: 1,
    boxesRemaining: 1,
    modelRole: "warrior",
    ...overrides,
  };
}

function alternative(alternativeKey, bridgeTargetPieceKey = "") {
  return bridgeTargetPieceKey ? {
    alternativeKey,
    predecessorKind: "killing_spree_destroy_advance_additional_melee",
    sourceAtomKey: "killing_spree_destroy_advance_additional_melee",
    actorPieceKey: "actor",
    terminalTargetPieceKey: "terminal",
    bridgeTargetPieceKey,
  } : {
    alternativeKey,
    predecessorKind: "direct_terminal_attack",
    actorPieceKey: "actor",
    terminalTargetPieceKey: "terminal",
  };
}

const symmetricState = {
  board: { widthIn: 20, heightIn: 20 },
  pieces: [
    piece("actor", "player1", 4, 10, { boxesRemaining: 8, meleeRangeIn: 1 }),
    piece("terminal", "player2", 12, 10, { boxesRemaining: 18, modelRole: "warlock" }),
    piece("bridge-a", "player2", 7, 8),
    piece("bridge-b", "player2", 7, 12),
  ],
  terrain: [],
  scenario: { zones: [], flags: [], objectives: [] },
};
const alternatives = [
  alternative("direct"),
  alternative("bridge-a-route", "bridge-a"),
  alternative("bridge-b-route", "bridge-b"),
];
const symmetryOptions = {
  declaredTransforms: ["mirror_y"],
  fixedPieceKeys: ["actor", "terminal"],
};
const asymmetricTerrainState = {
  ...symmetricState,
  terrain: [{ terrainKey: "north-wall", type: "wall", xIn: 6, yIn: 3, widthIn: 2, heightIn: 1 }],
};
const asymmetricRuleState = {
  ...symmetricState,
  pieces: symmetricState.pieces.map((entry) => entry.pieceKey === "bridge-b"
    ? { ...entry, advantages: ["Tough"] }
    : entry),
};
const unitState = {
  pieces: [
    piece("grunt-a", "player1", 1, 1, { unitGroupId: "unit-a", label: "Grunt" }),
    piece("grunt-b", "player1", 2, 1, { unitGroupId: "unit-a", label: "Grunt" }),
    piece("grunt-c", "player1", 3, 1, { unitGroupId: "unit-a", label: "Grunt" }),
    piece("warden", "player1", 4, 1, { unitGroupId: "unit-a", label: "Warden", armor: 15 }),
  ],
};

const { modules: legacyModules } = await loadLegacyReverseSearchModules();
const legacy = legacyModules.spatialQuotient;

const cases = [
  {
    label: "certified automorphism",
    local: () => buildWarmachineCertifiedSpatialAutomorphisms(symmetricState, symmetryOptions),
    upstream: () => legacy.buildWarmachineCertifiedSpatialAutomorphisms(symmetricState, symmetryOptions),
  },
  {
    label: "terrain breaks automorphism",
    local: () => buildWarmachineCertifiedSpatialAutomorphisms(asymmetricTerrainState, symmetryOptions),
    upstream: () => legacy.buildWarmachineCertifiedSpatialAutomorphisms(asymmetricTerrainState, symmetryOptions),
  },
  {
    label: "rule state breaks automorphism",
    local: () => buildWarmachineCertifiedSpatialAutomorphisms(asymmetricRuleState, symmetryOptions),
    upstream: () => legacy.buildWarmachineCertifiedSpatialAutomorphisms(asymmetricRuleState, symmetryOptions),
  },
  {
    label: "unit permutation quotient",
    local: () => buildWarmachineUnitPermutationQuotient(unitState, "unit-a", { distinguishedPieceKeys: ["warden"] }),
    upstream: () => legacy.buildWarmachineUnitPermutationQuotient(unitState, "unit-a", { distinguishedPieceKeys: ["warden"] }),
  },
  {
    label: "Killing Spree relation cell",
    local: () => buildWarmachineKillingSpreeRelationCell(symmetricState, {
      actorPieceKey: "actor",
      bridgeTargetPieceKey: "bridge-a",
      terminalTargetPieceKey: "terminal",
      meleeRangeIn: 1,
      maximumAdvanceIn: 1,
    }),
    upstream: () => legacy.buildWarmachineKillingSpreeRelationCell(symmetricState, {
      actorPieceKey: "actor",
      bridgeTargetPieceKey: "bridge-a",
      terminalTargetPieceKey: "terminal",
      meleeRangeIn: 1,
      maximumAdvanceIn: 1,
    }),
  },
  {
    label: "incomplete Killing Spree relation cell",
    local: () => buildWarmachineKillingSpreeRelationCell(symmetricState, {
      actorPieceKey: "missing",
      bridgeTargetPieceKey: "bridge-a",
      terminalTargetPieceKey: "terminal",
    }),
    upstream: () => legacy.buildWarmachineKillingSpreeRelationCell(symmetricState, {
      actorPieceKey: "missing",
      bridgeTargetPieceKey: "bridge-a",
      terminalTargetPieceKey: "terminal",
    }),
  },
  {
    label: "reverse alternative quotient",
    local: () => quotientWarmachineReverseAlternatives(symmetricState, alternatives, symmetryOptions),
    upstream: () => legacy.quotientWarmachineReverseAlternatives(symmetricState, alternatives, symmetryOptions),
  },
];

for (const fixture of cases) {
  assert.deepEqual(fixture.local(), fixture.upstream(), `${fixture.label} diverged from the migration source`);
}

const symmetry = buildWarmachineCertifiedSpatialAutomorphisms(symmetricState, symmetryOptions);
const quotient = quotientWarmachineReverseAlternatives(symmetricState, alternatives, symmetryOptions);
const terrain = buildWarmachineCertifiedSpatialAutomorphisms(asymmetricTerrainState, symmetryOptions);
const unit = buildWarmachineUnitPermutationQuotient(unitState, "unit-a", { distinguishedPieceKeys: ["warden"] });
assert.deepEqual(symmetry.acceptedTransformKeys, ["identity", "mirror_y"]);
assert.equal(quotient.expandedAlternativeCount, 3);
assert.equal(quotient.quotientAlternativeCount, 2);
assert.equal(quotient.certifiedCollapsedCount, 1);
assert.equal(terrain.rejectedTransforms[0]?.reason, "environment_not_invariant");
assert.equal(unit.labelledPermutationCountUpperBound, 6);
assert.equal(unit.quotientRepresentativeCount, 2);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_spatial_quotient_parity_v1",
  parityCaseCount: cases.length,
  acceptedTransforms: symmetry.acceptedTransformKeys,
  certifiedCollapsedCount: quotient.certifiedCollapsedCount,
  anonymousUnitPermutationUpperBound: unit.labelledPermutationCountUpperBound,
}, null, 2));
