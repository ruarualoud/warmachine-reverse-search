#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildWarmachineFixedSteamrollerFixtureV2 } from
  "../src/benchmark/fixed-steamroller-fixture-v2.mjs";
import { buildSepsiraSixSwarmVsFaneTaskV1 } from
  "../src/matchup/custom-matchup-task-v1.mjs";
import { buildWarmachineTaskLocalRuleClosureV1 } from
  "../src/contracts/task-local-rule-closure-v1.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputPath = path.join(
  repositoryRoot,
  "config/warmachine-fixed-cryx-nymara-task-rule-closure-v1.json",
);

const task = buildSepsiraSixSwarmVsFaneTaskV1();
const fixture = buildWarmachineFixedSteamrollerFixtureV2();
const report = buildWarmachineTaskLocalRuleClosureV1({
  task,
  state: fixture.stateTemplate,
  fixtureHash: fixture.fixtureHash,
  openingStateHash: fixture.opening.stateHash,
});

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  ok: true,
  outputPath: path.relative(repositoryRoot, outputPath),
  taskLocalRuleClosureHash: report.taskLocalRuleClosureHash,
  candidateAtomCount: report.taskAtomInteractions.candidateAtomCount,
  candidateInteractionCount: report.taskAtomInteractions.candidateInteractionCount,
  unresolvedInteractionCount: report.taskAtomInteractions.unresolvedInteractionCount,
  selectedUnresolvedInteractionCount:
    report.taskAtomInteractions.selectedUnresolvedInteractionCount,
  relevantGlobalUnresolvedHookGroupCount:
    report.taskHookConcurrency.relevantGlobalUnresolvedGroupCount,
  readiness: report.readiness,
}, null, 2)}\n`);
