#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadWarmachineCardData,
  loadWarmachineForceBuilder,
  resolveWarmachineEnginePath,
} from "../src/warmachine-construction-assets-runtime.mjs";
import { warmachineConstructionHost } from "../src/warmachine-construction-host-runtime.mjs";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = path.join(
  REPOSITORY_ROOT,
  "build/reports/warmachine-semantic-slice-23-7a-host-parity-v1.json",
);
const GENERIC_ROSTER_PATH = path.join(
  REPOSITORY_ROOT,
  "src/matchup/generic-roster-pool-v1.mjs",
);

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function runJson(relativeScript) {
  const result = spawnSync(process.execPath, [path.join("scripts", relativeScript)], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.message || relativeScript);
  assert.equal(result.status, 0, JSON.stringify({
    relativeScript,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
  }));
  return JSON.parse(String(result.stdout || "").trim());
}

const engineReportPath = resolveWarmachineEnginePath(
  "build/function3-data/warmachine-semantic-slice-23-7a-v1/report.json",
);
const engineReport = JSON.parse(fs.readFileSync(engineReportPath, "utf8"));
assert.equal(engineReport.ok, true);
assert.equal(engineReport.sliceKey, "23.7a");
assert.equal(engineReport.sliceStrictCertified, true);
assert.equal(engineReport.parentSliceStrictCertified, false);
assert.equal(engineReport.semanticRuleCount, 9);
assert.equal(engineReport.primitiveCount, 9);
assert.equal(engineReport.oracleFixtureCount, 30);
assert.equal(engineReport.killedMutationCount, 18);

const Builder = await loadWarmachineForceBuilder();
const data = await loadWarmachineCardData();
for (const method of [
  "cardPhysicalModelSpecs",
  "effectivePhysicalModelsByEntry",
  "computeForceSummary",
  "validateForceForEncounter",
  "controllerCanControlBattlegroupMember",
]) {
  assert.equal(typeof Builder[method], "function", `shared Force Builder missing ${method}`);
}

const builderRelativePath = "android-shell/assets/companion/force-builder.js";
const dataRelativePath = "android-shell/assets/default/warmachine-lite-data.json";
assert.equal(
  warmachineConstructionHost.receipt.sourceHashes[builderRelativePath],
  engineReport.sourceHashes[builderRelativePath],
  "Construction Host must bind the certified Force Builder source",
);
assert.equal(
  sha256(resolveWarmachineEnginePath(dataRelativePath)),
  engineReport.sourceHashes[dataRelativePath],
  "Search card data must match the certified current-data identity",
);

const genericRosterSource = fs.readFileSync(GENERIC_ROSTER_PATH, "utf8");
assert.equal(/function\s+modelCount\s*\(/.test(genericRosterSource), false);
assert.equal(/pointCostDescription/.test(genericRosterSource), false);
assert.equal(/Builder\.cardPhysicalModelSpecs\(/.test(genericRosterSource), true);
assert.equal(/Builder\.effectivePhysicalModelsByEntry\(/.test(genericRosterSource), true);
assert.equal(/Builder\.validateForceForEncounter\(/.test(genericRosterSource), true);

const mechanithrall = data.cards.find((card) => card.name === "Mechanithrall Swarm");
const kithguard = data.cards.find((card) => card.name === "Kithguard Infantry");
assert.ok(mechanithrall && kithguard);
assert.equal(Builder.cardPhysicalModelSpecs(mechanithrall).length, 5);
assert.equal(Builder.cardPhysicalModelSpecs(kithguard).length, 5);

const customBuilder = runJson("verify-custom-task-force-builder-v1.mjs");
assert.equal(customBuilder.ok, true);
assert.ok(customBuilder.sepsiraSubjectRosterCount > 0);
assert.ok(customBuilder.faneRosterCount > 0);
assert.equal(customBuilder.fixedCompleteRosterCount, 1);
assert.equal(customBuilder.forceBuilderSourceHash, engineReport.forceBuilderParity.engineBuilderHash);
assert.equal(customBuilder.constructionHostReceiptHash, warmachineConstructionHost.receipt.receiptHash);

const sourcePaths = [
  path.join(REPOSITORY_ROOT, "scripts/verify-semantic-slice-23-7a-host-parity-v1.mjs"),
  GENERIC_ROSTER_PATH,
  path.join(REPOSITORY_ROOT, "src/warmachine-construction-assets-runtime.mjs"),
  path.join(REPOSITORY_ROOT, "src/warmachine-construction-host-runtime.mjs"),
];
const sourceHashes = Object.fromEntries(sourcePaths.sort().map((filePath) => [
  path.relative(REPOSITORY_ROOT, filePath),
  sha256(filePath),
]));
const reportCore = {
  ok: true,
  schemaVersion: "warmachine_semantic_slice_23_7a_host_parity_v1",
  sliceKey: "23.7a",
  parentSliceStrictCertified: false,
  constructionHostReceiptHash: warmachineConstructionHost.receipt.receiptHash,
  engineSourceReceiptHash: engineReport.sourceReceiptHash,
  engineAuthorityReceiptHash: engineReport.authorityReceiptHash,
  forceBuilderSourceHash: engineReport.forceBuilderParity.engineBuilderHash,
  currentDataSourceHash: engineReport.sourceHashes[dataRelativePath],
  semanticRuleCount: engineReport.semanticRuleCount,
  primitiveCount: engineReport.primitiveCount,
  oracleFixtureCount: engineReport.oracleFixtureCount,
  mutationObligationCount: engineReport.mutationObligationCount,
  killedMutationCount: engineReport.killedMutationCount,
  realRosterEvidence: customBuilder,
  searchSideFinalLegalityImplementationCount: 0,
  searchHeuristicBoundary: "Search may own proposal generation, loadout enumeration, goal scoring and ordering; shared Force Builder validation alone accepts a final roster.",
  sourceHashes,
  harnessLoopUsed: true,
  targetGames: ["warmachine"],
  promptPackRoutes: [],
  harnessToolsCalled: [
    "loadWarmachineForceBuilder",
    "WarmachineForceBuilder.cardPhysicalModelSpecs",
    "WarmachineForceBuilder.effectivePhysicalModelsByEntry",
    "WarmachineForceBuilder.validateForceForEncounter",
  ],
  uiTraceEvidence: [],
  agentDecisionEvidence: [
    "Every accepted generated roster has a shared structured encounter-validation receipt before it can seed Search.",
  ],
  memoryTraceEvidence: [
    "Force Builder source hash, current-data hash, card identity, physical-model count and controller relations",
  ],
  trainingTraceCandidates: [],
  rollbackOrDemotionRules: [
    "Any Engine 23.7a receipt, Force Builder, current-data or construction Host drift invalidates this Search parity receipt.",
    "Any Search-owned final roster-legality parser invalidates the zero-duplicate claim.",
  ],
  userVisibleChecks: [
    "Sepsira and all four Fane leader candidate families still produce real legal rosters after strict validation.",
    "The attachment fixture now includes a legal non-Lesser Leader Cohort instead of preserving the old illegal list.",
  ],
  globalStrictReady: false,
  trainingTruth: false,
  searchValueAuthority: false,
  claimBoundary: "Search consumes certified Slice 23.7a construction and runtime identity through the shared Force Builder. Deployment, Steamroller, card-specific construction, full Search action coverage, values, skills, training and online experiments remain false.",
};
const report = {
  ...reportCore,
  reportHash: createHash("sha256").update(JSON.stringify(reportCore)).digest("hex"),
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
