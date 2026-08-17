#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildWarmachineRulesetSnapshotV1,
  compareWarmachineRulesetBaselineV1,
} from "../src/contracts/ruleset-snapshot-v1.mjs";
import { warmachineRulesetBaselineV1 } from
  "../src/contracts/ruleset-baseline-v1.mjs";

const EVIDENCE_PATH = new URL(
  "../docs/research/ruleset-snapshot-v1-verification.json",
  import.meta.url,
);

const snapshot = buildWarmachineRulesetSnapshotV1();
assert.equal(snapshot.current, true, JSON.stringify(snapshot.failClosedReasons));
assert.equal(snapshot.checkpointResumeAllowed, true);
assert.equal(snapshot.priorCalibrationUsable, true);
assert.equal(snapshot.priorTrainingMaterialCurrent, true);
assert.equal(snapshot.cardDataMirror.matches, true);
assert.equal(snapshot.observed.cardData.remoteVersion, "40041");
assert.equal(
  snapshot.observed.reverseRegistry.typedObligationOnlyCount,
  warmachineRulesetBaselineV1.reverseRegistry.typedObligationOnlyCount,
);

const atomDriftBaseline = structuredClone(warmachineRulesetBaselineV1);
atomDriftBaseline.host.atomCount += 1;
const atomDrift = compareWarmachineRulesetBaselineV1(
  snapshot.observed,
  atomDriftBaseline,
);
assert.equal(atomDrift.compatible, false);
assert.equal(atomDrift.checkpointResumeAllowed, false);
assert.ok(atomDrift.differences.some((difference) => difference.path === "host.atomCount"));

const dataDriftBaseline = structuredClone(warmachineRulesetBaselineV1);
dataDriftBaseline.cardData.contentHash = "0".repeat(64);
const dataDrift = compareWarmachineRulesetBaselineV1(
  snapshot.observed,
  dataDriftBaseline,
);
assert.equal(dataDrift.compatible, false);
assert.equal(dataDrift.priorCalibrationUsable, false);
assert.ok(dataDrift.differences.some((difference) => difference.path === "cardData.contentHash"));

const evidence = {
  schemaVersion: "warmachine_ruleset_snapshot_v1_verification",
  generatedAt: new Date().toISOString(),
  snapshot,
  driftProbes: { atomDrift, dataDrift },
};
fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  marker: "composite_ruleset_snapshot_fail_closed_v20260811",
  baselineKey: snapshot.baselineKey,
  snapshotHash: snapshot.snapshotHash,
  semanticRulesetHash: snapshot.semanticRulesetHash,
  authorityReceiptHash: snapshot.authorityReceiptHash,
  cardDataMirrorMatches: snapshot.cardDataMirror.matches,
  current: snapshot.current,
  atomDriftFailsClosed: !atomDrift.compatible,
  dataDriftFailsClosed: !dataDrift.compatible,
}, null, 2));
