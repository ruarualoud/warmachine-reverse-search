#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  buildWarmachineRulesetSemanticIndexV1,
  compareWarmachineRulesetSemanticIndexesV1,
} from "../src/contracts/ruleset-change-impact-v1.mjs";

const REVIEW_SCHEMA = "warmachine_ruleset_update_review_v1";
const UPDATE_DIR = path.resolve(".scratch", "ruleset-update-v1");
const BASELINE_PATH = path.resolve("config", "warmachine-ruleset-baseline-v1.json");
const INDEX_PATH = path.resolve("config", "warmachine-ruleset-semantic-index-v1.json");

function argValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function requireCondition(condition, reason) {
  if (!condition) throw new Error(reason);
}

function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  fs.renameSync(temporaryPath, filePath);
}

const reviewPath = path.resolve(argValue("review-receipt"));
requireCondition(argValue("review-receipt"), "ruleset_review_receipt_required");
const review = readJson(reviewPath);
const candidateIndex = readJson(path.join(UPDATE_DIR, "current-semantic-index.json"));
const candidateBaseline = readJson(path.join(UPDATE_DIR, "candidate-ruleset-baseline.json"));
const impact = readJson(path.join(UPDATE_DIR, "impact-report.json"));

requireCondition(review.schemaVersion === REVIEW_SCHEMA, "ruleset_review_schema_mismatch");
requireCondition(review.approved === true, "ruleset_update_not_approved");
requireCondition(String(review.approvedBy || "").trim(), "ruleset_update_approver_missing");
requireCondition(String(review.approvedAt || "").trim(), "ruleset_update_approval_time_missing");
requireCondition(String(review.reviewedBaselineKey || "").trim() &&
  !String(review.reviewedBaselineKey).startsWith("candidate-"),
"reviewed_ruleset_baseline_key_invalid");
requireCondition(review.candidateSemanticIndexHash === candidateIndex.semanticIndexHash,
  "ruleset_review_candidate_index_mismatch");
requireCondition(review.impactHash === impact.impactHash, "ruleset_review_impact_mismatch");
requireCondition(review.strictGatesPassed === true &&
  Array.isArray(review.strictGateEvidence) && review.strictGateEvidence.length > 0,
"ruleset_review_strict_gates_missing");
requireCondition(review.skillGatesPassed === true &&
  Array.isArray(review.skillGateEvidence) && review.skillGateEvidence.length > 0,
"ruleset_review_skill_gates_missing");

const reviewedBaseline = {
  ...candidateBaseline,
  baselineKey: review.reviewedBaselineKey,
};
const reviewedIndex = buildWarmachineRulesetSemanticIndexV1({ baseline: reviewedBaseline });
const unreviewedDrift = compareWarmachineRulesetSemanticIndexesV1(
  candidateIndex,
  reviewedIndex,
);
requireCondition(unreviewedDrift.compatible === true,
  `ruleset_changed_after_review:${unreviewedDrift.changeClasses.join(",")}`);

atomicWriteJson(BASELINE_PATH, reviewedBaseline);
atomicWriteJson(INDEX_PATH, reviewedIndex);

console.log(JSON.stringify({
  ok: true,
  reviewedBaselineKey: reviewedBaseline.baselineKey,
  semanticIndexHash: reviewedIndex.semanticIndexHash,
  candidateSemanticIndexHash: candidateIndex.semanticIndexHash,
  impactHash: impact.impactHash,
  approvedBy: review.approvedBy,
  strictGateEvidenceCount: review.strictGateEvidence.length,
  skillGateEvidenceCount: review.skillGateEvidence.length,
  note: "The reviewed baseline and semantic index were regenerated and promoted together.",
}, null, 2));
