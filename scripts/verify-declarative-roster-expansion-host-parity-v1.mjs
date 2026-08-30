#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import {
  loadWarmachineCardData,
  loadWarmachineForceBuilder,
  resolveWarmachineEnginePath,
} from "../src/warmachine-construction-assets-runtime.mjs";
import { warmachineConstructionHost } from "../src/warmachine-construction-host-runtime.mjs";

const SEARCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED_RELATIVE_PATH =
  "scripts/warmachine-rule-atoms/generated/declarative-roster-source-specs-current-v1.mjs";
const generated = await import(pathToFileURL(resolveWarmachineEnginePath(GENERATED_RELATIVE_PATH)).href);
const commandSpecs = generated.WARMACHINE_DECLARATIVE_COMMAND_ATTACHMENT_SPECS_CURRENT_V1;
const mercenarySpecs = generated.WARMACHINE_DECLARATIVE_NAMED_ARMY_MERCENARY_SPECS_CURRENT_V1;
const metadata = generated.WARMACHINE_DECLARATIVE_ROSTER_SOURCE_SPECS_CURRENT_V1_METADATA;

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".mjs") ? [absolute] : [];
  });
}

const Builder = await loadWarmachineForceBuilder();
const data = await loadWarmachineCardData();
assert.equal(String(data.source?.remoteVersion || ""), metadata.dataVersion);
assert.equal(
  sha256(resolveWarmachineEnginePath("android-shell/assets/default/warmachine-lite-data.json")),
  metadata.dataSha256,
  "Search must consume the exact data identity that generated the declarative roster contracts",
);
assert.equal(commandSpecs.length, 79);
assert.equal(mercenarySpecs.length, 10);

const cardById = new Map(data.cards.map((card) => [String(card.id), card]));
const armyById = new Map(data.armies.map((army) => [String(army.id), army]));
let attachmentPairCount = 0;
let mercenaryPairCount = 0;
for (const spec of commandSpecs) {
  for (const attachmentCardId of spec.attachmentCardIds) {
    const attachment = cardById.get(attachmentCardId);
    assert.ok(attachment, `Search data missing attachment ${attachmentCardId}`);
    const hosts = spec.allowedHostCardIds
      .map((hostCardId) => cardById.get(hostCardId))
      .filter((host) => (host?.validAttachmentIds || []).includes(attachmentCardId));
    assert.ok(hosts.length > 0, `${attachment.name} has no shared structured host`);
    for (const host of hosts) {
      assert.equal(Builder.attachmentCanBeAddedToHost(attachment, host), true);
      attachmentPairCount += 1;
    }
  }
}
for (const spec of mercenarySpecs) {
  for (const sourceCardId of spec.sourceCardIds) {
    const card = cardById.get(sourceCardId);
    assert.ok(card, `Search data missing Mercenary card ${sourceCardId}`);
    for (const armyId of spec.allowedArmyIds) {
      const army = armyById.get(armyId);
      assert.ok(army, `Search data missing Army ${armyId}`);
      assert.equal(Builder.cardAllowedInForce(data, { armyId, entries: [] }, sourceCardId), true);
      mercenaryPairCount += 1;
    }
  }
}

const sourceIds = new Set([...commandSpecs, ...mercenarySpecs].map((spec) => spec.sourceId));
const atomKeys = new Set([...commandSpecs, ...mercenarySpecs].map((spec) => spec.atomKey));
const duplicateFiles = sourceFiles(path.join(SEARCH_ROOT, "src")).filter((filePath) => {
  const source = fs.readFileSync(filePath, "utf8");
  return [...sourceIds].some((sourceId) => source.includes(sourceId)) ||
    [...atomKeys].some((atomKey) => source.includes(atomKey));
});
assert.deepEqual(duplicateFiles, [], "Search must not duplicate generated roster-rule semantics");

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "warmachine_declarative_roster_expansion_host_parity_v1",
  dataVersion: metadata.dataVersion,
  dataSha256: metadata.dataSha256,
  generatedManifestSha256: sha256(resolveWarmachineEnginePath(GENERATED_RELATIVE_PATH)),
  commandAttachmentSourceCount: commandSpecs.length,
  namedArmyMercenarySourceCount: mercenarySpecs.length,
  attachmentPairCount,
  mercenaryPairCount,
  constructionHostReceiptHash: warmachineConstructionHost.receipt.receiptHash,
  searchSideRuleImplementationCount: duplicateFiles.length,
  sharedForceBuilderMethods: ["attachmentCanBeAddedToHost", "cardAllowedInForce"],
  globalStrictReady: false,
  trainingTruth: false,
  searchValueAuthority: false,
  claimBoundary: "Search consumes Engine-owned generated declarative roster contracts through shared current data and Force Builder; Unlimited Arena faction eligibility remains outside this slice.",
}, null, 2));
