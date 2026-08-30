#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

import { stableGraphHash, stableGraphValue } from
  "../src/graph/typed-facts-v2.mjs";
import {
  auditWarmachineReverseStateBoundaryV1,
  summarizeWarmachineReverseStateBoundaryAuditV1,
} from "../src/reverse/reverse-state-invariants-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const evidenceRoot = path.join(
  repositoryRoot,
  ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1",
);
const outputPath = path.join(
  evidenceRoot,
  "ticket09-archived-route-state-invariant-audit-v1.json",
);

const sourceFiles = [
  "ticket09-auricant-assassination-route-unit-v1.json",
  "ticket09-hysene-assassination-route-unit-v1.json",
  "ticket09-nymara-assassination-route-unit-v1.json",
  "ticket07-score-forward-route-fixture-v1.json",
  "ticket09-ashmael-score-forward-route-fixture-v1.json",
  "ticket09-auricant-score-forward-route-fixture-v1.json",
  "ticket09-nymara-score-forward-route-fixture-v1.json",
  "ticket09-ashmael-score-strict-route-opening-v1.json",
  "ticket09-auricant-score-strict-route-opening-v1.json",
  "ticket07-score-current-turn-reverse-checkpoint-v1.json",
  "ticket09-ashmael-score-current-turn-reverse-checkpoint-v1.json",
  "ticket09-auricant-score-current-turn-reverse-checkpoint-v1.json",
  "ticket09-nymara-score-current-turn-reverse-checkpoint-v1.json",
  "ticket07-score-historical-resume-checkpoint-v1.json.gz",
  "ticket09-ashmael-score-historical-resume-checkpoint-v1.json.gz",
  "ticket09-auricant-score-historical-resume-checkpoint-v1.json.gz",
  "ticket09-nymara-score-historical-resume-checkpoint-v1.json.gz",
  "ticket07-score-root-to-opening-deepest-frontier-v1.json.gz",
  "ticket09-auricant-score-root-to-opening-deepest-frontier-v1.json.gz",
  "ticket09-nymara-score-root-to-opening-deepest-frontier-v1.json.gz",
];

function fileHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseArtifact(filePath) {
  const bytes = fs.readFileSync(filePath);
  const json = filePath.endsWith(".gz") ? gunzipSync(bytes) : bytes;
  return { bytes, value: JSON.parse(json.toString("utf8")) };
}

function collectStateAudits(value, sourceFile, rawPath = "$", rows = []) {
  if (!value || typeof value !== "object") return rows;
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectStateAudits(
      child,
      sourceFile,
      `${rawPath}[${index}]`,
      rows,
    ));
    return rows;
  }
  if (Array.isArray(value.pieces) && value.board &&
      Number.isFinite(Number(value.board.widthIn)) &&
      Number.isFinite(Number(value.board.heightIn))) {
    const audit = auditWarmachineReverseStateBoundaryV1(value, {
      boundaryKind: "archived_route_state",
      requireStaticUnitFormation: false,
    });
    rows.push(stableGraphValue({
      sourceFile,
      statePath: rawPath,
      stateKey: String(value.stateKey || ""),
      semanticContext: {
        turnNumber: Number(value.turnNumber || 0),
        activeSideKey: String(value.activeSideKey || ""),
        phaseKey: String(value.phaseKey || ""),
        pieceCount: value.pieces.length,
      },
      audit: summarizeWarmachineReverseStateBoundaryAuditV1(audit),
      issues: audit.issues,
    }));
    return rows;
  }
  for (const [key, child] of Object.entries(value)) {
    collectStateAudits(child, sourceFile, `${rawPath}.${key}`, rows);
  }
  return rows;
}

const files = [];
const stateRows = [];
for (const sourceFile of sourceFiles) {
  const filePath = path.join(evidenceRoot, sourceFile);
  if (!fs.existsSync(filePath)) {
    files.push({ sourceFile, missing: true });
    continue;
  }
  const artifact = parseArtifact(filePath);
  const rows = collectStateAudits(artifact.value, sourceFile);
  stateRows.push(...rows);
  files.push({
    sourceFile,
    missing: false,
    byteLength: artifact.bytes.length,
    fileHash: fileHash(artifact.bytes),
    discoveredStateCount: rows.length,
  });
}

const uniqueByStateHash = new Map();
for (const row of stateRows) {
  const stateHash = row.audit.normalizedStateHash;
  const existing = uniqueByStateHash.get(stateHash);
  if (existing) {
    existing.references.push({
      sourceFile: row.sourceFile,
      statePath: row.statePath,
      stateKey: row.stateKey,
    });
    continue;
  }
  uniqueByStateHash.set(stateHash, {
    ...row,
    references: [{
      sourceFile: row.sourceFile,
      statePath: row.statePath,
      stateKey: row.stateKey,
    }],
  });
}
const uniqueStates = [...uniqueByStateHash.values()].sort((left, right) =>
  left.audit.normalizedStateHash.localeCompare(right.audit.normalizedStateHash));
const issueCodeCounts = {};
for (const row of uniqueStates.filter((entry) => !entry.audit.ok)) {
  for (const issue of row.issues) {
    const code = String(issue.code || issue.reason || "unknown_issue");
    issueCodeCounts[code] = Number(issueCodeCounts[code] || 0) + 1;
  }
}
const core = stableGraphValue({
  schemaVersion: "warmachine_ticket09_archived_route_state_invariant_audit_v1",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  files,
  counts: {
    declaredSourceFileCount: sourceFiles.length,
    presentSourceFileCount: files.filter((row) => !row.missing).length,
    missingSourceFileCount: files.filter((row) => row.missing).length,
    discoveredStateReferenceCount: stateRows.length,
    uniqueStateCount: uniqueStates.length,
    legalUniqueStateCount: uniqueStates.filter((row) => row.audit.ok).length,
    illegalUniqueStateCount: uniqueStates.filter((row) => !row.audit.ok).length,
  },
  issueCodeCounts,
  illegalStates: uniqueStates.filter((row) => !row.audit.ok),
  legalStateSummaries: uniqueStates.filter((row) => row.audit.ok).map((row) => ({
    sourceFile: row.sourceFile,
    statePath: row.statePath,
    stateKey: row.stateKey,
    semanticContext: row.semanticContext,
    audit: row.audit,
    referenceCount: row.references.length,
  })),
  currentArtifactsAllStateInvariantClean:
    uniqueStates.length > 0 && uniqueStates.every((row) => row.audit.ok),
  claimBoundary: "This audit traverses every complete rules state retained in the declared Ticket 09 assassination route units, score forward fixtures, strict score openings, checkpoints and deepest reverse frontiers. It proves permanent static-placement and search-owned structural invariants only for retained state objects. Unit formation is intentionally not a permanent state invariant; deployment and unit Normal Movement formation are certified at their dedicated transition boundaries. Missing per-action states and routes that did not persist their inverse intermediates remain uncertified and require fresh replay or regeneration.",
});
const report = {
  ...core,
  reportHash: stableGraphHash(core),
};
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  schemaVersion: report.schemaVersion,
  outputPath,
  counts: report.counts,
  issueCodeCounts: report.issueCodeCounts,
  currentArtifactsAllStateInvariantClean:
    report.currentArtifactsAllStateInvariantClean,
  reportHash: report.reportHash,
}, null, 2));
