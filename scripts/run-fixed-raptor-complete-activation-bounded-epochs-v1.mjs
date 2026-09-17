#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const epochRunnerPath = path.join(
  repositoryRoot,
  "scripts/run-fixed-raptor-complete-activation-rolling-shards-v1.mjs",
);

function argument(name, fallback = "") {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}

function positiveInteger(name, fallback, maximum) {
  const value = Number(argument(name, String(fallback)));
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`complete_activation_bounded_epochs_${name}_invalid`);
  }
  return value;
}

function nonnegativeInteger(name, fallback, maximum) {
  const value = Number(argument(name, String(fallback)));
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new Error(`complete_activation_bounded_epochs_${name}_invalid`);
  }
  return value;
}

function writeAtomically(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, value);
  fs.renameSync(temporaryPath, filePath);
}

function pendingChanceResponseCount(checkpoint = {}) {
  const pending = new Set(checkpoint.workQueue || []);
  return (checkpoint.workItems || []).filter((work) =>
    work.workKind === "chance_response" &&
      work.status === "pending" &&
      pending.has(work.workKey)).length;
}

function freeDiskGiB(targetPath) {
  const stats = fs.statfsSync(targetPath);
  return Number(stats.bavail * stats.bsize) / (1024 ** 3);
}

async function runEpoch(args) {
  const child = spawn(process.execPath, [epochRunnerPath, ...args], {
    cwd: repositoryRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (code !== 0) {
    throw new Error(`complete_activation_bounded_epoch_failed:${code}`);
  }
  let summary;
  try {
    summary = JSON.parse(stdout);
  } catch {
    throw new Error("complete_activation_bounded_epoch_summary_invalid");
  }
  if (!summary?.ok || !summary.runRoot) {
    throw new Error("complete_activation_bounded_epoch_summary_incomplete");
  }
  return summary;
}

async function archiveFinalizedRun(runRoot) {
  const receiptPath = path.join(runRoot, "receipt.json");
  if (!fs.existsSync(receiptPath)) {
    throw new Error("complete_activation_bounded_epoch_final_receipt_missing");
  }
  const resultFiles = fs.readdirSync(runRoot)
    .filter((name) => name.endsWith(".result.json"))
    .sort();
  const rows = [];
  for (const name of resultFiles) {
    const sourcePath = path.join(runRoot, name);
    const archiveName = `${name}.gz`;
    const archivePath = path.join(runRoot, archiveName);
    const temporaryPath = `${archivePath}.tmp-${process.pid}`;
    const sourceBytes = fs.statSync(sourcePath).size;
    await pipeline(
      createReadStream(sourcePath),
      createGzip({ level: 1 }),
      createWriteStream(temporaryPath, { flags: "wx" }),
    );
    fs.renameSync(temporaryPath, archivePath);
    const archiveBytes = fs.statSync(archivePath).size;
    fs.unlinkSync(sourcePath);
    rows.push({ archiveName, archiveBytes, sourceName: name, sourceBytes });
  }
  const archive = {
    schemaVersion: "warmachine_complete_activation_epoch_archive_v1",
    runRoot,
    receiptPath,
    resultCount: rows.length,
    sourceBytes: rows.reduce((sum, row) => sum + row.sourceBytes, 0),
    archiveBytes: rows.reduce((sum, row) => sum + row.archiveBytes, 0),
    rows,
  };
  writeAtomically(
    path.join(runRoot, "result-archive.json"),
    `${JSON.stringify(archive, null, 2)}\n`,
  );
  return archive;
}

async function main() {
  const evidenceRootArgument = argument("evidence-root");
  if (!evidenceRootArgument) {
    throw new Error("complete_activation_bounded_epochs_evidence_root_required");
  }
  const evidenceRoot = path.resolve(evidenceRootArgument);
  const checkpointPath = path.join(evidenceRoot, "checkpoint.json");
  const workers = positiveInteger("workers", 6, 12);
  const chunkSize = positiveInteger("chunk-size", 4, 64);
  const epochWorkUnitBudget = positiveInteger(
    "epoch-work-unit-budget",
    256,
    512,
  );
  const checkpointWorkUnits = positiveInteger(
    "checkpoint-work-units",
    96,
    512,
  );
  const minimumFreeGiB = positiveInteger("minimum-free-gib", 8, 128);
  const maxEpochs = nonnegativeInteger("max-epochs", 0, 4096);
  let completedEpochs = 0;

  while (maxEpochs === 0 || completedEpochs < maxEpochs) {
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    const pendingBefore = pendingChanceResponseCount(checkpoint);
    if (pendingBefore === 0) break;
    const freeBefore = freeDiskGiB(evidenceRoot);
    if (freeBefore < minimumFreeGiB) {
      throw new Error(
        `complete_activation_bounded_epochs_disk_guard:${freeBefore.toFixed(2)}`,
      );
    }
    const epochIndex = completedEpochs + 1;
    process.stdout.write(`${JSON.stringify({
      event: "bounded_epoch_started",
      epochIndex,
      pendingBefore,
      freeDiskGiB: Number(freeBefore.toFixed(2)),
      epochWorkUnitBudget,
    })}\n`);
    const summary = await runEpoch([
      `--evidence-root=${evidenceRoot}`,
      `--workers=${workers}`,
      `--chunk-size=${chunkSize}`,
      `--work-unit-budget=${Math.min(epochWorkUnitBudget, pendingBefore)}`,
      `--checkpoint-work-units=${Math.min(checkpointWorkUnits, pendingBefore)}`,
    ]);
    const archive = await archiveFinalizedRun(summary.runRoot);
    const nextCheckpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    const pendingAfter = pendingChanceResponseCount(nextCheckpoint);
    if (pendingAfter >= pendingBefore) {
      throw new Error("complete_activation_bounded_epochs_no_progress");
    }
    completedEpochs += 1;
    process.stdout.write(`${JSON.stringify({
      event: "bounded_epoch_completed",
      epochIndex,
      pendingBefore,
      pendingAfter,
      completedWorkCount: summary.completedWorkCount,
      mergedCheckpointHash: summary.mergedCheckpointHash,
      resultCount: archive.resultCount,
      sourceBytes: archive.sourceBytes,
      archiveBytes: archive.archiveBytes,
    })}\n`);
  }

  const finalCheckpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  process.stdout.write(`${JSON.stringify({
    ok: true,
    completedEpochs,
    checkpointHash: finalCheckpoint.checkpointHash,
    pendingChanceResponseCount: pendingChanceResponseCount(finalCheckpoint),
  }, null, 2)}\n`);
}

await main();
