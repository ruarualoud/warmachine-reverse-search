#!/usr/bin/env node

import assert from "node:assert/strict";

import { buildWarmachineFixedSteamrollerFixtureV2 } from
  "../src/benchmark/fixed-steamroller-fixture-v2.mjs";

const fixture = buildWarmachineFixedSteamrollerFixtureV2({
  seed: "fixed-steamroller-clean-baseline-v1",
});

assert.equal(
  fixture.source.poolPath,
  "fixtures/ruleset-baseline/construction-pool-report.json",
);
assert.equal(
  fixture.source.roomStorePath,
  "fixtures/ruleset-baseline/fixed-roster-room.json",
);
assert.equal(fixture.source.historicalBuildDependencyUsed, false);
assert.equal(fixture.nested.counts.strictLegalOpeningCount, 1);
assert.equal(fixture.opening.strictDeploymentLegal, true);
assert.equal(fixture.opening.rosterProvenance.completeForHardPruning, true);
assert.equal(fixture.bound.modelCount, 103);
assert.equal(fixture.bound.mechanithrallSwarmGroupCount, 6);
assert.equal(fixture.bound.scenarioKey, "two_fronts");

process.stdout.write(`${JSON.stringify({
  ok: true,
  historicalBuildDependencyUsed: false,
  poolPath: fixture.source.poolPath,
  poolContentHash: fixture.source.poolContentHash,
  roomStorePath: fixture.source.roomStorePath,
  roomStoreContentHash: fixture.source.roomStoreContentHash,
  fixtureHash: fixture.fixtureHash,
  strictLegalOpeningCount: fixture.nested.counts.strictLegalOpeningCount,
  modelCount: fixture.bound.modelCount,
}, null, 2)}\n`);
