#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const timeoutMs = 120_000;

const verifierNames = Object.freeze([
  "verify-upstream-warmachine-contract.mjs",
  "verify-search-execution-receipt-v1.mjs",
  "verify-ruleset-snapshot-v1.mjs",
  "verify-fixed-steamroller-fixture-clean-baseline-v1.mjs",
  "verify-matchup-terminal-root-batch-clean-baseline-v1.mjs",
  "verify-matchup-terminal-task-execution-batch-clean-baseline-v1.mjs",
]);

const results = verifierNames.map((verifierName) => {
  const child = spawnSync(process.execPath, [path.join(scriptDirectory, verifierName)], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
  const stderr = String(child.stderr || "");
  const stdout = String(child.stdout || "");
  return {
    verifierName,
    passed: child.status === 0 && !child.error,
    exitCode: child.status,
    signal: String(child.signal || ""),
    timedOut: child.error?.code === "ETIMEDOUT",
    missingInputArtifactFailure: /ENOENT|no such file or directory/i.test(
      `${stderr}\n${stdout}`,
    ),
    stdoutTail: stdout.slice(-1_500),
    stderrTail: stderr.slice(-2_500),
  };
});

const failedVerifierNames = results.filter((result) => !result.passed)
  .map((result) => result.verifierName);
const missingInputArtifactVerifierNames = results
  .filter((result) => result.missingInputArtifactFailure)
  .map((result) => result.verifierName);
const report = {
  schemaVersion: "warmachine_cross_repo_clean_baseline_v1",
  executionStatus: failedVerifierNames.length ? "incomplete_or_failed" : "complete",
  gatePassed: failedVerifierNames.length === 0 &&
    missingInputArtifactVerifierNames.length === 0,
  verifierCount: results.length,
  passedVerifierCount: results.filter((result) => result.passed).length,
  failedVerifierCount: failedVerifierNames.length,
  failedVerifierNames,
  missingInputArtifactFailureCount: missingInputArtifactVerifierNames.length,
  missingInputArtifactVerifierNames,
  results,
  claimBoundary: "This clean baseline proves current Engine loading, composite execution receipts, ruleset snapshot compatibility, self-generated batch checkpoint semantics and self-generated task execution. It does not execute the full terminal materializer, geometry or product gate denominator.",
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.gatePassed) process.exit(1);
