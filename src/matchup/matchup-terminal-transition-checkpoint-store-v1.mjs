import fs from "node:fs";
import path from "node:path";

import { stableGraphHash, stableGraphValue } from
  "../graph/typed-facts-v2.mjs";
import {
  auditWarmachineMatchupTerminalTransitionProgressV1,
} from "./matchup-terminal-transition-recovery-v1.mjs";

export const WARMACHINE_MATCHUP_TERMINAL_TRANSITION_POINTER_V1_SCHEMA =
  "warmachine_matchup_terminal_transition_pointer_v1";

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function fsyncDirectory(directoryPath) {
  const descriptor = fs.openSync(directoryPath, "r");
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function writeDurableExclusive(filePath, text) {
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, text, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertProgress(progress = {}) {
  const audit = auditWarmachineMatchupTerminalTransitionProgressV1(progress);
  if (!audit.ok) {
    throw new Error(`transition_checkpoint_progress_invalid:${
      audit.issues.join(",")}`);
  }
}

function pointerFor(progress = {}) {
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_MATCHUP_TERMINAL_TRANSITION_POINTER_V1_SCHEMA,
    progressHash: progress.progressHash,
    checkpointFile: `${progress.progressHash}.json`,
  });
  return { ...core, pointerHash: stableGraphHash(core) };
}

function assertPointer(pointer = {}) {
  const core = { ...pointer };
  const declared = String(core.pointerHash || "");
  delete core.pointerHash;
  if (pointer.schemaVersion !==
      WARMACHINE_MATCHUP_TERMINAL_TRANSITION_POINTER_V1_SCHEMA ||
      !declared || stableGraphHash(core) !== declared ||
      pointer.checkpointFile !== `${pointer.progressHash}.json` ||
      path.basename(pointer.checkpointFile) !== pointer.checkpointFile) {
    throw new Error("transition_checkpoint_pointer_invalid");
  }
}

function storePaths(storeRoot = "") {
  const root = path.resolve(storeRoot);
  return {
    root,
    checkpoints: path.join(root, "checkpoints"),
    control: path.join(root, "control"),
    lock: path.join(root, "control", "writer.lock"),
    current: path.join(root, "CURRENT"),
  };
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

function acquireWriterLock(paths) {
  ensureDirectory(paths.control);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.mkdirSync(paths.lock);
      writeDurableExclusive(
        path.join(paths.lock, "owner.json"),
        `${JSON.stringify({ pid: process.pid })}\n`,
      );
      fsyncDirectory(paths.control);
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let owner = null;
      try {
        owner = readJson(path.join(paths.lock, "owner.json"));
      } catch {}
      if (processAlive(Number(owner?.pid))) {
        throw new Error("transition_checkpoint_writer_lock_held");
      }
      fs.rmSync(paths.lock, { recursive: true, force: true });
      fsyncDirectory(paths.control);
    }
  }
  throw new Error("transition_checkpoint_writer_lock_recovery_failed");
}

function releaseWriterLock(paths) {
  fs.rmSync(paths.lock, { recursive: true, force: true });
  fsyncDirectory(paths.control);
}

function writeImmutableCheckpoint(paths, progress) {
  ensureDirectory(paths.checkpoints);
  const filePath = path.join(paths.checkpoints, `${progress.progressHash}.json`);
  const text = `${JSON.stringify(progress, null, 2)}\n`;
  try {
    writeDurableExclusive(filePath, text);
    fsyncDirectory(paths.checkpoints);
  } catch (error) {
    if (error?.code !== "EEXIST" || fs.readFileSync(filePath, "utf8") !== text) {
      throw error;
    }
  }
  return filePath;
}

function publishPointer(paths, pointer) {
  const temporaryPath = path.join(
    paths.root,
    `CURRENT.tmp-${process.pid}-${Date.now()}`,
  );
  writeDurableExclusive(
    temporaryPath,
    `${JSON.stringify(pointer, null, 2)}\n`,
  );
  fs.renameSync(temporaryPath, paths.current);
  fsyncDirectory(paths.root);
}

export function loadWarmachineMatchupTerminalTransitionCheckpointV1(
  storeRoot = "",
) {
  const paths = storePaths(storeRoot);
  const pointer = readJson(paths.current);
  assertPointer(pointer);
  const progress = readJson(path.join(paths.checkpoints, pointer.checkpointFile));
  assertProgress(progress);
  if (progress.progressHash !== pointer.progressHash) {
    throw new Error("transition_checkpoint_pointer_progress_mismatch");
  }
  return stableGraphValue(progress);
}

export function commitWarmachineMatchupTerminalTransitionCheckpointV1(raw = {}) {
  const paths = storePaths(raw.storeRoot);
  const progress = raw.progress || {};
  assertProgress(progress);
  ensureDirectory(paths.root);
  ensureDirectory(paths.checkpoints);
  ensureDirectory(paths.control);
  acquireWriterLock(paths);
  try {
    const currentHash = fs.existsSync(paths.current)
      ? loadWarmachineMatchupTerminalTransitionCheckpointV1(paths.root).progressHash
      : "";
    const expectedHash = String(raw.expectedProgressHash || "");
    if (currentHash !== expectedHash) {
      throw new Error(`transition_checkpoint_compare_and_swap_failed:${
        expectedHash}:${currentHash}`);
    }
    writeImmutableCheckpoint(paths, progress);
    raw.onFaultPoint?.("after_checkpoint_write_before_pointer_publish");
    publishPointer(paths, pointerFor(progress));
    return stableGraphValue(progress);
  } finally {
    releaseWriterLock(paths);
  }
}

export function initializeWarmachineMatchupTerminalTransitionCheckpointV1(
  raw = {},
) {
  const paths = storePaths(raw.storeRoot);
  if (fs.existsSync(paths.current)) {
    const current = loadWarmachineMatchupTerminalTransitionCheckpointV1(
      paths.root,
    );
    if (current.progressHash !== raw.progress?.progressHash) {
      throw new Error("transition_checkpoint_already_initialized");
    }
    return current;
  }
  return commitWarmachineMatchupTerminalTransitionCheckpointV1({
    storeRoot: paths.root,
    expectedProgressHash: "",
    progress: raw.progress,
  });
}
