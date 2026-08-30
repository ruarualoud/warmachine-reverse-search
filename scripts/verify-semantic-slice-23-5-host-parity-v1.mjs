#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  materializeRulesV1ParameterizedLifecycleReplacementAction,
  resolveWarmachineHostPath,
  warmachineHost,
} from "../src/warmachine-host-runtime.mjs";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = path.join(
  REPOSITORY_ROOT,
  "build/reports/warmachine-semantic-slice-23-5-host-parity-v1.json",
);
const VERIFIERS = Object.freeze({
  chanceParity: "verify-chance-outcomes-parity.mjs",
  postResponseChance: "verify-post-response-chance-outcomes-v1.mjs",
  strictAction: "verify-strict-action-probability-and-min-v2.mjs",
  strictPolicyStep: "verify-strict-policy-step-v1.mjs",
  publicBoundary: "verify-matchup-public-boundary-v1.mjs",
});

function run(relativeScript) {
  const result = spawnSync(process.execPath, [path.join("scripts", relativeScript)], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(JSON.stringify({
      relativeScript,
      status: result.status,
      signal: result.signal,
      error: result.error?.message || "",
      stdout: result.stdout,
      stderr: result.stderr,
    }));
  }
  return String(result.stdout || "").trim();
}

function parseSingleJson(output, relativeScript) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`${relativeScript}: expected one JSON receipt: ${error.message}`);
  }
}

function sha256(absolutePath) {
  return createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
}

const registry = JSON.parse(fs.readFileSync(resolveWarmachineHostPath(
  "data/function3-rules/warmachine-semantic-rule-registry-v1.json",
), "utf8"));
const oracle = JSON.parse(fs.readFileSync(resolveWarmachineHostPath(
  "data/function3-rules/warmachine-attack-damage-oracle-manifest-v1.json",
), "utf8"));
const dag = JSON.parse(fs.readFileSync(resolveWarmachineHostPath(
  "data/function3-rules/warmachine-timing-dag-v1.json",
), "utf8"));
assert.equal(registry.scope.certifiedSliceKeys.includes("23.5"), true);
assert.equal(oracle.sliceReady, true);
assert.deepEqual(oracle.openSliceDebts, []);
assert.equal(dag.certifiedSliceKeys.includes("23.5"), true);
assert.equal(
  typeof materializeRulesV1ParameterizedLifecycleReplacementAction,
  "function",
  "Search Host must expose exact Dragoon replacement materialization",
);

const outputs = Object.fromEntries(Object.entries(VERIFIERS).map(
  ([key, relativeScript]) => [key, run(relativeScript)],
));
assert.match(outputs.chanceParity, /"schemaVersion": "verify_chance_outcomes_parity_v1"/);
assert.match(outputs.chanceParity, /"classes": 30/);
assert.match(outputs.chanceParity, /"engineExecutedChanceClassCount": 12/);
const postResponse = parseSingleJson(outputs.postResponseChance, VERIFIERS.postResponseChance);
const strictAction = parseSingleJson(outputs.strictAction, VERIFIERS.strictAction);
const strictPolicyStep = parseSingleJson(outputs.strictPolicyStep, VERIFIERS.strictPolicyStep);
const publicBoundary = parseSingleJson(outputs.publicBoundary, VERIFIERS.publicBoundary);
assert.equal(postResponse.ok, true);
assert.equal(postResponse.exactGargantuanClassCount, 6);
assert.equal(postResponse.exactGargantuanAcceptedOutcomeCount, 6);
assert.deepEqual(postResponse.unresolvedWarbeastReasons,
  ["damage_transfer_recipient_layout_not_exact"]);
assert.equal(strictAction.ok, true);
assert.equal(strictAction.chanceClassCount, 12);
assert.equal(strictAction.opponentResponseCount, 2);
assert.equal(strictAction.probabilityInterval.exact, true);
assert.equal(strictPolicyStep.ok, true);
assert.equal(publicBoundary.ok, true);

const sourcePaths = [
  ...Object.values(VERIFIERS).map((file) => path.join(REPOSITORY_ROOT, "scripts", file)),
  path.join(REPOSITORY_ROOT, "scripts/verify-semantic-slice-23-5-host-parity-v1.mjs"),
  path.join(REPOSITORY_ROOT, "src/search/chance-outcomes-v1.mjs"),
  path.join(REPOSITORY_ROOT, "src/search/post-response-chance-execution-v1.mjs"),
  path.join(REPOSITORY_ROOT, "src/search/strict-action-probability-and-min-v2.mjs"),
  path.join(REPOSITORY_ROOT, "src/search/strict-policy-step-v1.mjs"),
  path.join(REPOSITORY_ROOT, "src/upstream-project-d.mjs"),
  path.join(REPOSITORY_ROOT, "src/warmachine-host-runtime.mjs"),
];
const sourceHashes = Object.fromEntries(sourcePaths.sort().map((absolutePath) => [
  path.relative(REPOSITORY_ROOT, absolutePath),
  sha256(absolutePath),
]));
const reportCore = {
  ok: true,
  schemaVersion: "warmachine_semantic_slice_23_5_host_parity_v1",
  sliceKey: "23.5",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  engineSemanticRuleCount: oracle.certifiedSemanticRuleKeys.length,
  primaryChanceClassCount: strictAction.chanceClassCount,
  opponentResponseCount: strictAction.opponentResponseCount,
  postResponseLifeSpiralChanceClassCount: postResponse.exactGargantuanClassCount,
  engineAcceptedPostResponseOutcomeCount:
    postResponse.exactGargantuanAcceptedOutcomeCount,
  responseBeforeRecipientLocationChance: true,
  playerChoiceSeparatedFromChance: true,
  chanceMassConserved: true,
  searchSideRuleImplementationCount: 0,
  sourceHashes,
  globalStrictReady: false,
  trainingTruth: false,
  claimBoundary: "This receipt proves Slice 23.5 Search/Host parity for current primary Chance, defender-owned damage transfer, post-response damage-layout Chance, strict Engine successors and the parameterized Dragoon Host boundary. Full Root/App/Layer3 publication parity remains Slice 23.10.",
};
const report = {
  ...reportCore,
  reportHash: createHash("sha256").update(JSON.stringify(reportCore)).digest("hex"),
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
