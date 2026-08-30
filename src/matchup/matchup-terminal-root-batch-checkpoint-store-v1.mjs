import fs from "node:fs";
import path from "node:path";

import { stableGraphHash, stableGraphValue } from
  "../graph/typed-facts-v2.mjs";

function fsyncDirectory(directoryPath) {
  const descriptor = fs.openSync(directoryPath, "r");
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

function pathsFor(checkpointPath = "") {
  const checkpoint = path.resolve(checkpointPath);
  return {
    checkpoint,
    directory: path.dirname(checkpoint),
    lock: `${checkpoint}.writer.lock`,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertCheckpointHash(checkpoint = {}) {
  const core = { ...checkpoint };
  const declaredHash = String(core.checkpointHash || "");
  delete core.checkpointHash;
  if (!declaredHash || stableGraphHash(core) !== declaredHash) {
    throw new Error("terminal_root_checkpoint_store_hash_invalid");
  }
}

function readOwner(paths) {
  return readJson(path.join(paths.lock, "owner.json"));
}

export function acquireWarmachineMatchupTerminalRootBatchWriterV1(
  checkpointPath = "",
) {
  const paths = pathsFor(checkpointPath);
  fs.mkdirSync(paths.directory, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.mkdirSync(paths.lock);
      const core = stableGraphValue({
        pid: process.pid,
        checkpointPath: paths.checkpoint,
        acquiredAtMs: Date.now(),
      });
      const owner = { ...core, ownerToken: stableGraphHash(core) };
      const ownerPath = path.join(paths.lock, "owner.json");
      const descriptor = fs.openSync(ownerPath, "wx", 0o600);
      try {
        fs.writeFileSync(descriptor, `${JSON.stringify(owner)}\n`, "utf8");
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fsyncDirectory(paths.directory);
      return stableGraphValue(owner);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let owner = null;
      try {
        owner = readOwner(paths);
      } catch {}
      if (processAlive(Number(owner?.pid))) {
        throw new Error("terminal_root_checkpoint_writer_lock_held");
      }
      fs.rmSync(paths.lock, { recursive: true, force: true });
      fsyncDirectory(paths.directory);
    }
  }
  throw new Error("terminal_root_checkpoint_writer_lock_recovery_failed");
}

function assertOwner(paths, owner = {}) {
  const persisted = readOwner(paths);
  if (!owner.ownerToken || persisted.ownerToken !== owner.ownerToken ||
      persisted.pid !== process.pid ||
      persisted.checkpointPath !== paths.checkpoint) {
    throw new Error("terminal_root_checkpoint_writer_ownership_invalid");
  }
}

export function loadWarmachineMatchupTerminalRootBatchCheckpointFileV1(
  checkpointPath = "",
) {
  const checkpoint = readJson(path.resolve(checkpointPath));
  assertCheckpointHash(checkpoint);
  return stableGraphValue(checkpoint);
}

export function commitWarmachineMatchupTerminalRootBatchCheckpointFileV1(
  raw = {},
) {
  const paths = pathsFor(raw.checkpointPath);
  assertOwner(paths, raw.owner);
  const current = loadWarmachineMatchupTerminalRootBatchCheckpointFileV1(
    paths.checkpoint,
  );
  if (current.checkpointHash !== String(raw.expectedCheckpointHash || "")) {
    throw new Error("terminal_root_checkpoint_compare_and_swap_failed");
  }
  const checkpoint = stableGraphValue(raw.checkpoint || {});
  assertCheckpointHash(checkpoint);
  const temporaryPath = `${paths.checkpoint}.unpublished-${
    process.pid}-${checkpoint.checkpointHash}`;
  const descriptor = fs.openSync(temporaryPath, "wx", 0o600);
  try {
    fs.writeFileSync(
      descriptor,
      `${JSON.stringify(checkpoint, null, 2)}\n`,
      "utf8",
    );
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  raw.onFaultPoint?.("after_checkpoint_write_before_publish");
  fs.renameSync(temporaryPath, paths.checkpoint);
  fsyncDirectory(paths.directory);
  return checkpoint;
}

export function releaseWarmachineMatchupTerminalRootBatchWriterV1(
  checkpointPath = "",
  owner = {},
) {
  const paths = pathsFor(checkpointPath);
  assertOwner(paths, owner);
  fs.rmSync(paths.lock, { recursive: true, force: true });
  fsyncDirectory(paths.directory);
}
