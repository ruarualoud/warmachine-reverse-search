import assert from "node:assert/strict";
import { access } from "node:fs/promises";

import {
  loadWarmachineCardData,
  loadWarmachineForceBuilder,
  resolveWarmachineEnginePath,
} from "../src/warmachine-construction-assets-runtime.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

await access(resolveWarmachineEnginePath("scripts/warmachine-rules-v1.mjs"));
const data = await loadWarmachineCardData();
const forceBuilder = await loadWarmachineForceBuilder();

assert.equal(warmachineHost.strictForwardExecutionIsAuthority, true);
assert.equal(warmachineHost.searchMayAffectRules, false);
assert.match(warmachineHost.receipt.receiptHash, /^[0-9a-f]{64}$/);
assert.ok(data && typeof data === "object");
assert.ok(forceBuilder && typeof forceBuilder === "object");

console.log(JSON.stringify({
  schemaVersion: "warmachine_reverse_search_handoff_contract_v1",
  engineRoot: warmachineHost.receipt.projectDRoot,
  engineGitRevision: warmachineHost.receipt.gitRevision,
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  trackedEngineDirty: warmachineHost.receipt.trackedWorktreeDirty,
  strictForwardExecutionIsAuthority: true,
  searchMayAffectRules: false,
  forceBuilderLoaded: true,
  cardDataLoaded: true
}, null, 2));
