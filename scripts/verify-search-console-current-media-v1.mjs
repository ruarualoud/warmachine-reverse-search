import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSETS_V1,
  WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSET_SOURCE_V1,
} from "../src/report/search-console-exact-card-assets-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.resolve(process.env.WARMACHINE_CURRENT_DATA_PATH ||
  path.join(root, ".scratch", "latest-warmachine-lite-data.json"));
const archiveRoot = path.resolve(process.env.WARMACHINE_CURRENT_MEDIA_ARCHIVE_ROOT ||
  path.join(root, ".scratch", "replay-media-source-v1"));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

assert.ok(fs.existsSync(dataPath), `missing_current_data_snapshot:${dataPath}`);
const dataBytes = fs.readFileSync(dataPath);
const data = JSON.parse(dataBytes.toString("utf8"));
assert.equal(data.source?.remoteVersion,
  WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSET_SOURCE_V1.remoteVersion,
"current_data_remote_version_drift");
assert.equal(data.generatedAt,
  WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSET_SOURCE_V1.generatedAt,
"current_data_generated_at_drift");
assert.equal(sha256(dataBytes),
  WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSET_SOURCE_V1.cardDataSha256,
"current_data_hash_drift");

const cardById = new Map((data.cards || []).map((card) => [String(card.id || ""), card]));
const archiveHashes = {};
for (const [archiveName, expectedHash] of Object.entries(
  WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSET_SOURCE_V1.sourceArchiveSha256ByName,
)) {
  const archivePath = path.join(archiveRoot, archiveName);
  assert.ok(fs.existsSync(archivePath), `missing_current_media_archive:${archivePath}`);
  const actualHash = sha256(fs.readFileSync(archivePath));
  assert.equal(actualHash, expectedHash, `current_media_archive_hash_drift:${archiveName}`);
  archiveHashes[archiveName] = actualHash;
}

const cards = [];
for (const [cardId, asset] of Object.entries(WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSETS_V1)) {
  const card = cardById.get(cardId);
  assert.ok(card, `missing_current_card:${cardId}`);
  assert.equal(String(card.name || ""), asset.cardName, `current_card_name_drift:${cardId}`);

  const archivePath = path.join(archiveRoot, asset.sourceArchiveName);
  const memberBytes = execFileSync("unzip", ["-p", archivePath, asset.sourceMemberPath], {
    maxBuffer: 16 * 1024 * 1024,
  });
  const memberHash = sha256(memberBytes);
  assert.equal(memberHash, asset.sha256, `current_media_member_hash_drift:${cardId}`);

  const frozenPath = path.join(root, "web", "search-console",
    asset.assetUrl.replace(/^\/+/, ""));
  assert.ok(fs.existsSync(frozenPath), `missing_frozen_report_asset:${cardId}`);
  const frozenHash = sha256(fs.readFileSync(frozenPath));
  assert.equal(frozenHash, memberHash, `frozen_report_asset_hash_drift:${cardId}`);

  cards.push({
    cardId,
    cardName: asset.cardName,
    sourceArchiveName: asset.sourceArchiveName,
    sourceMemberPath: asset.sourceMemberPath,
    sha256: frozenHash,
  });
}

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_search_console_current_media_v1",
  remoteVersion: data.source.remoteVersion,
  generatedAt: data.generatedAt,
  cardDataSha256: sha256(dataBytes),
  exactCardAssetCount: cards.length,
  sourceArchiveCount: Object.keys(archiveHashes).length,
  archiveHashes,
  cards,
}, null, 2));
