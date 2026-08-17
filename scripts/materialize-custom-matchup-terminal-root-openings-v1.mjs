#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildWarmachineSteamrollerFallbackOpeningBindersV1 } from
  "../src/matchup/steamroller-opening-binders-v1.mjs";
import { buildWarmachineSteamrollerOpeningMapTemplateV1 } from
  "../src/matchup/steamroller-opening-map-template-v1.mjs";
import { materializeWarmachineMatchupTerminalRootOpeningBatchV1 } from
  "../src/matchup/matchup-terminal-root-opening-batch-v1.mjs";
import { resolveWarmachineHostPath } from "../src/warmachine-host-runtime.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reverseDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(process.argv.find((argument) =>
  argument.startsWith("--output="))?.slice("--output=".length) ||
  path.join(reverseDirectory,
    ".scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1"));

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadJsonWithHash(filePath) {
  const bytes = fs.readFileSync(filePath);
  return {
    value: JSON.parse(bytes),
    contentHash: createHash("sha256").update(bytes).digest("hex"),
  };
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function sourcePool(poolKey, section, sourceContentHash, sourceSchemaVersion) {
  return {
    poolKey,
    lists: section.rosters,
    sourceContentHash,
    sourceSchemaVersion,
    exactListLegality: section.quality.exactListLegality,
    forceBuilderContract: section.algorithm.finalLegality,
    remoteVersion: section.source.remoteVersion,
    exhaustiveAllFactionRosters: false,
  };
}

const report = loadJson(path.join(outputDirectory, "report.json"));
const loadedPool = loadJsonWithHash(path.join(
  outputDirectory,
  "goal-conditioned-roster-pool.json",
));
const pool = loadedPool.value;
const batchRoot = path.join(outputDirectory, "terminal-root-batch-v1");
const current = loadJson(path.join(batchRoot, "CURRENT.json"));
const planDirectory = path.join(batchRoot, current.relativePlanDirectory);
const plan = loadJson(path.join(planDirectory, "plan.json"));
const roomStorePath = resolveWarmachineHostPath(
  "fixtures/ruleset-baseline/fixed-roster-room.json",
);
const loadedRoomStore = loadJsonWithHash(roomStorePath);
const templateRoom = Object.values(loadedRoomStore.value.roomsById || {})[0];
if (!templateRoom) {
  throw new Error("matchup_terminal_opening_batch_map_template_missing");
}
const templateHash = createHash("sha256").update(JSON.stringify({
  roomStoreContentHash: loadedRoomStore.contentHash,
  roomId: templateRoom.id,
  shapes: templateRoom.shapes,
  deployments: templateRoom.deployments,
})).digest("hex");

function exactMapTemplateForOpening(row = {}) {
  return buildWarmachineSteamrollerOpeningMapTemplateV1({
    templateRoom,
    baseTemplateHash: templateHash,
    mapKey: row.mapKey,
    scenarioKey: row.scenarioKey,
    firstPlayerSideKey: row.firstPlayerTaskSideKey === "challenger"
      ? "player2" : "player1",
    scenarioTerrainSetupClassKey: row.scenarioTerrainSetupClassKey,
  });
}
const result = materializeWarmachineMatchupTerminalRootOpeningBatchV1({
  task: report.task,
  plan,
  poolsByTaskSideKey: {
    subject: sourcePool(
      report.task.sides.subject.sourcePoolKey,
      pool.subjectPool,
      loadedPool.contentHash,
      pool.schemaVersion,
    ),
    challenger: sourcePool(
      report.task.sides.challenger.sourcePoolKey,
      pool.challengerPool,
      loadedPool.contentHash,
      pool.schemaVersion,
    ),
  },
  exactMapTemplatesByKey: {
    mixed_table: {
      templateRoom,
      templateHash,
      sourceKind: "content_bound_historical_exact_terrain_template",
    },
  },
  resolveExactMapTemplate: exactMapTemplateForOpening,
  scenarioBindersByKey: buildWarmachineSteamrollerFallbackOpeningBindersV1(),
});
writeJsonAtomic(path.join(planDirectory, "opening-batch-report.json"), result.report);
writeJsonAtomic(path.join(planDirectory, "opening-batch-runtime.json"), result.runtime);
process.stdout.write(`${JSON.stringify({
  ok: result.report.terminalTaskMassConserved &&
    result.report.failedUniqueOpeningCount === 0 &&
    result.report.unresolvedUniqueOpeningCount === 0,
  reportHash: result.report.reportHash,
  runtimeHash: result.runtime.runtimeHash,
  selectedTerminalTaskCount: result.report.selectedTerminalTaskCount,
  uniqueOpeningTaskCount: result.report.uniqueOpeningTaskCount,
  deploymentSearchCount: result.report.deploymentSearchCount,
  strictUniqueOpeningCount: result.report.strictUniqueOpeningCount,
  failedUniqueOpeningCount: result.report.failedUniqueOpeningCount,
  terminalTaskDispositionCounts: result.report.terminalTaskDispositionCounts,
}, null, 2)}\n`);
