#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  buildWarmachineRulesetSemanticIndexV1,
  compareWarmachineRulesetSemanticIndexesV1,
  loadReviewedWarmachineRulesetSemanticIndexV1,
} from "../src/contracts/ruleset-change-impact-v1.mjs";
import { buildWarmachineRulesetSnapshotV1 } from
  "../src/contracts/ruleset-snapshot-v1.mjs";
import { warmachineRulesetBaselineV1 } from
  "../src/contracts/ruleset-baseline-v1.mjs";

const outputDirectory = path.resolve(".scratch", "ruleset-update-v1");
fs.mkdirSync(outputDirectory, { recursive: true });

const currentIndex = buildWarmachineRulesetSemanticIndexV1();
const reviewedIndex = loadReviewedWarmachineRulesetSemanticIndexV1();
const impact = compareWarmachineRulesetSemanticIndexesV1(reviewedIndex, currentIndex);
const snapshot = buildWarmachineRulesetSnapshotV1();
const candidateBaseline = {
  ...warmachineRulesetBaselineV1,
  baselineKey: `candidate-${currentIndex.cardData.remoteVersion || "unknown"}-${
    currentIndex.semanticIndexHash.slice(0, 12)}`,
  host: snapshot.observed.host,
  reverseRegistry: snapshot.observed.reverseRegistry,
  interactionGraph: snapshot.observed.interactionGraph,
  fixedRosterProjection: snapshot.observed.fixedRosterProjection,
  cardData: snapshot.observed.cardData,
  constructionPool: snapshot.observed.constructionPool,
};

fs.writeFileSync(
  path.join(outputDirectory, "current-semantic-index.json"),
  `${JSON.stringify(currentIndex, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(outputDirectory, "candidate-ruleset-baseline.json"),
  `${JSON.stringify(candidateBaseline, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(outputDirectory, "impact-report.json"),
  `${JSON.stringify(impact, null, 2)}\n`,
);

console.log(JSON.stringify({
  ok: true,
  outputDirectory,
  compatible: impact.compatible,
  semanticDrift: impact.semanticDrift,
  changeClasses: impact.changeClasses,
  requiredActions: impact.requiredActions,
  counts: currentIndex.counts,
  impactHash: impact.impactHash,
  note: "Candidate files do not replace the reviewed baseline.",
}, null, 2));
