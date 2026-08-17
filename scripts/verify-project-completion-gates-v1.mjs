import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildWarmachineProjectCompletionGateReportV1,
  WARMACHINE_PROJECT_COMPLETION_GATE_GROUPS_V1,
} from "../src/validation/project-completion-gates-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const excludedVerifierNames = new Set([
  "verify-all.mjs",
  "verify-project-completion-gates-v1.mjs",
]);
const discoveredVerifierNames = fs.readdirSync(scriptsDirectory)
  .filter((name) => /^verify-.*\.mjs$/.test(name) && !excludedVerifierNames.has(name))
  .sort();
const verifierResults = [];
const originalConsoleLog = console.log;

for (const group of WARMACHINE_PROJECT_COMPLETION_GATE_GROUPS_V1) {
  for (const verifierName of group.verifiers) {
    const startedAt = performance.now();
    let failure = null;
    console.log = () => {};
    try {
      await import(`./${verifierName}`);
    } catch (error) {
      failure = error;
    } finally {
      console.log = originalConsoleLog;
    }
    verifierResults.push({
      verifierName,
      gateKey: group.gateKey,
      passed: failure === null,
      durationMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
      errorName: failure?.name || "",
      errorMessage: failure?.message || "",
    });
    if (failure) throw failure;
  }
}

const report = buildWarmachineProjectCompletionGateReportV1({
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  discoveredVerifierNames,
  verifierResults,
});
assert.equal(report.readiness.projectReadyForBoundedResearchUse, true);
assert.equal(report.readiness.strictForwardHostRemainsRulesAuthority, true);
assert.equal(report.readiness.reverseSearchMayAffectRules, false);
assert.equal(report.readiness.completeContinuousStateSpaceExhausted, false);
assert.equal(report.readiness.globalOptimalityProven, false);
assert.equal(report.trainingTruth, false);

const evidencePath = new URL(
  "../docs/research/project-completion-gates-v1-verification.json",
  import.meta.url,
);
fs.writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: "verify_warmachine_project_completion_gates_v1",
  reportHash: report.reportHash,
  hostReceiptHash: report.hostReceiptHash,
  gateCount: report.gateCount,
  passedGateCount: report.passedGateCount,
  verifierCount: report.verifierCount,
  passedVerifierCount: report.passedVerifierCount,
  gateRows: report.gateRows.map((gate) => ({
    gateKey: gate.gateKey,
    verifierCount: gate.verifierCount,
    passedVerifierCount: gate.passedVerifierCount,
    durationMs: gate.durationMs,
    passed: gate.passed,
  })),
  readiness: report.readiness,
  claimBoundary: report.claimBoundary,
}, null, 2));
