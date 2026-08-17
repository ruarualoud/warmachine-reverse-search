import assert from "node:assert/strict";

import {
  loadLegacyReverseSearchModules,
  loadWarmachineHost,
  resolveProjectDRoot,
} from "../src/index.mjs";

const host = await loadWarmachineHost();
assert.equal(host.receipt.projectDRoot, resolveProjectDRoot());
assert.equal(host.schemaVersion, "warmachine_host_contract_v1");
assert.equal(host.strictForwardExecutionIsAuthority, true);
assert.equal(host.searchMayAffectRules, false);
assert.match(host.receipt.gitRevision, /^(?:[0-9a-f]{40}|unavailable)$/);
assert.match(host.receipt.receiptHash, /^[0-9a-f]{64}$/);
assert.ok(Object.keys(host.receipt.sourceHashes).length > 5);
for (const relativePath of [
  "scripts/warmachine-rules-v1.mjs",
  "scripts/warmachine-special-rules-v0.mjs",
  "scripts/warmachine-rule-atoms-v1.mjs",
  "scripts/warmachine-steamroller-2026-v1.mjs",
]) {
  assert.match(host.receipt.sourceHashes[relativePath] || "", /^[0-9a-f]{64}$/,
    `transitive Host receipt must include ${relativePath}`);
}
assert.ok(Object.values(host.receipt.sourceHashes).every((value) => /^[0-9a-f]{64}$/.test(value)));
assert.equal(host.steamroller.steamroller2026ScenarioProfiles().length, 7);
assert.equal(host.steamroller.steamroller2026ScenarioProfile("payload")?.scenarioNumber, 7);

const atoms = host.atoms.recognizedWarmachineRuleAtoms();
const hooks = atoms.flatMap((atom) => atom.hooks || []);
assert.ok(atoms.length > 0);
assert.ok(hooks.length >= atoms.length);
const atomValidation = host.atoms.validateWarmachineRuleAtomRegistry();
assert.equal(atomValidation.ok, true);
assert.equal(typeof host.probability.warmachineExactPrimaryAttackTerminalProbability, "function");

const legacy = await loadLegacyReverseSearchModules();
assert.equal(legacy.migrationOnly, true);
const reverseRegistry = legacy.modules.primitiveContracts.buildWarmachineReversePrimitiveContractRegistry();
assert.equal(reverseRegistry.counts.atomCount, atoms.length);
assert.equal(reverseRegistry.counts.hookOperatorCount, hooks.length);
assert.ok(reverseRegistry.counts.primitiveCount > 0);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_host_contract_v1",
  upstream: {
    projectDRoot: host.receipt.projectDRoot,
    gitRevision: host.receipt.gitRevision,
    trackedWorktreeDirty: host.receipt.trackedWorktreeDirty,
    trackedDirtyPathCount: host.receipt.trackedDirtyPathCount,
    receiptHash: host.receipt.receiptHash,
    sourceHashes: host.receipt.sourceHashes,
  },
  hostContract: {
    strictForwardExecutionIsAuthority: host.strictForwardExecutionIsAuthority,
    searchMayAffectRules: host.searchMayAffectRules,
    atomCount: atoms.length,
    hookOperatorCount: hooks.length,
    steamroller2026ScenarioCount: host.steamroller.steamroller2026ScenarioProfiles().length,
  },
  migrationBridge: {
    migrationOnly: legacy.migrationOnly,
    reverseRegistry: reverseRegistry.counts,
  },
}, null, 2));
