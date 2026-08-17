#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildWarmachineRulesetSemanticIndexV1,
  compareWarmachineRulesetSemanticIndexesV1,
  loadReviewedWarmachineRulesetSemanticIndexV1,
} from "../src/contracts/ruleset-change-impact-v1.mjs";
import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";

const EVIDENCE_PATH = new URL(
  "../docs/research/ruleset-change-impact-v1-verification.json",
  import.meta.url,
);

function cloneWithHash(index) {
  const clone = structuredClone(index);
  clone.semanticIndexHash = stableGraphHash({ fixture: clone });
  return clone;
}

const reviewed = loadReviewedWarmachineRulesetSemanticIndexV1();
const current = buildWarmachineRulesetSemanticIndexV1();
const unchanged = compareWarmachineRulesetSemanticIndexesV1(reviewed, current);
assert.equal(unchanged.compatible, true, JSON.stringify(unchanged.changeClasses));
assert.equal(unchanged.semanticDrift, false);
assert.deepEqual(unchanged.requiredActions, []);

const mappedSource = Object.values(reviewed.ruleSources)
  .find((row) => row.mappedAtomKeys.length > 0);
assert.ok(mappedSource);
const reuse = cloneWithHash(reviewed);
reuse.cards["fixture-new-card"] = {
  cardId: "fixture-new-card",
  name: "Fixture New Card",
  factionId: "fixture-faction",
  factionName: "Fixture",
  cardTypeName: "Solo",
  rulesHash: "1".repeat(64),
  constructionHash: "2".repeat(64),
  metadataHash: "3".repeat(64),
  ruleSourceIds: ["fixture-reused-source"],
  behaviorTokenKeys: [],
};
reuse.ruleSources["fixture-reused-source"] = {
  sourceId: "fixture-reused-source",
  sourceKinds: ["model_ability"],
  names: ["Fixture Reuse"],
  semanticHashes: ["4".repeat(64)],
  fingerprintHashes: [mappedSource.fingerprintHashes[0]],
  mappedAtomKeys: [],
  ambiguousSourceIdentity: false,
};
const reuseImpact = compareWarmachineRulesetSemanticIndexesV1(reviewed, reuse);
assert.deepEqual(reuseImpact.ruleSources.semanticReuseReviewSourceIds,
  ["fixture-reused-source"]);
assert.equal(reuseImpact.ruleSources.newSemanticGapSourceIds.length, 0);
assert.equal(reuseImpact.gates.checkpointResumeAllowed, false);
assert.ok(reuseImpact.requiredActions.includes(
  "review_and_bind_exact_semantic_reuse_candidates",
));

const unknown = structuredClone(reuse);
unknown.ruleSources["fixture-reused-source"].fingerprintHashes = ["5".repeat(64)];
unknown.semanticIndexHash = stableGraphHash({ fixture: unknown });
const unknownImpact = compareWarmachineRulesetSemanticIndexesV1(reviewed, unknown);
assert.deepEqual(unknownImpact.ruleSources.newSemanticGapSourceIds,
  ["fixture-reused-source"]);
assert.equal(unknownImpact.gates.unknownNewSemanticsFailClosed, false);
assert.ok(unknownImpact.requiredActions.includes(
  "classify_then_bind_generic_execution_or_implement_new_atom_hooks",
));

const atomDrift = cloneWithHash(reviewed);
const atomKey = Object.keys(atomDrift.atoms)[0];
atomDrift.atoms[atomKey].semanticHash = "6".repeat(64);
const atomImpact = compareWarmachineRulesetSemanticIndexesV1(reviewed, atomDrift);
assert.ok(atomImpact.blastRadius.impactedAtomKeys.includes(atomKey));
assert.equal(atomImpact.blastRadius.allStrictWitnessesRequireRevalidation, true);
assert.equal(atomImpact.gates.priorTrainingMaterialCurrent, false);

const constructionDrift = cloneWithHash(reviewed);
const cardId = Object.keys(constructionDrift.cards)[0];
constructionDrift.cards[cardId].constructionHash = "7".repeat(64);
const constructionImpact = compareWarmachineRulesetSemanticIndexesV1(
  reviewed,
  constructionDrift,
);
assert.deepEqual(constructionImpact.cards.constructionChanged, [cardId]);
assert.equal(constructionImpact.blastRadius.coreExecutorChanged, false);
assert.equal(constructionImpact.blastRadius.constructionPoolsRequireRevalidation, true);

const coreDrift = cloneWithHash(reviewed);
const hostPath = Object.keys(coreDrift.hostSourceHashes)[0];
coreDrift.hostSourceHashes[hostPath] = "8".repeat(64);
const coreImpact = compareWarmachineRulesetSemanticIndexesV1(reviewed, coreDrift);
assert.deepEqual(coreImpact.hostSourcesChanged, [hostPath]);
assert.equal(coreImpact.blastRadius.coreExecutorChanged, true);
assert.equal(coreImpact.blastRadius.allStrictWitnessesRequireRevalidation, true);

const evidence = {
  schemaVersion: "warmachine_ruleset_change_impact_v1_verification",
  generatedAt: new Date().toISOString(),
  current: {
    semanticIndexHash: current.semanticIndexHash,
    counts: current.counts,
    impact: unchanged,
  },
  probes: {
    exactSemanticReuse: reuseImpact,
    unknownNewSemantics: unknownImpact,
    atomDrift: atomImpact,
    constructionOnlyDrift: constructionImpact,
    coreExecutorDrift: coreImpact,
  },
};
fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  marker: "incremental_ruleset_change_impact_fail_closed_v20260811",
  semanticIndexHash: current.semanticIndexHash,
  counts: current.counts,
  currentCompatible: unchanged.compatible,
  exactReuseRequiresReview: reuseImpact.ruleSources.semanticReuseReviewSourceIds.length,
  unknownSemanticsFailClosed: !unknownImpact.gates.unknownNewSemanticsFailClosed,
  atomDriftInvalidatesWitnesses:
    atomImpact.blastRadius.allStrictWitnessesRequireRevalidation,
  constructionDriftInvalidatesPools:
    constructionImpact.blastRadius.constructionPoolsRequireRevalidation,
  coreDriftInvalidatesWitnesses:
    coreImpact.blastRadius.allStrictWitnessesRequireRevalidation,
}, null, 2));
