#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function argumentValue(prefix, fallback = "") {
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadNdjson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const progressLogPath = path.resolve(argumentValue("--progress-log="));
const checkpointPath = argumentValue("--checkpoint=");
const staleAfterMs = Math.max(1, numeric(
  argumentValue("--stale-after-ms=", "300000"),
  300000,
));
const nowMs = Math.max(0, numeric(argumentValue("--now-ms=", String(Date.now())), Date.now()));
const events = loadNdjson(progressLogPath);
const latestEvent = events.at(-1) || null;
const cursorEvents = events.filter((event) => [
  "geometry_slot_start",
  "geometry_slot_complete",
  "task_candidate_chunk_complete",
].includes(String(event.stage || "")));
const latestCursor = cursorEvents.at(-1) || null;
const eventAgeMs = latestEvent ? Math.max(0, nowMs - numeric(latestEvent.atMs)) : null;
const cursorAgeMs = latestCursor ? Math.max(0, nowMs - numeric(latestCursor.atMs)) : null;
const checkpoint = checkpointPath && fs.existsSync(checkpointPath)
  ? loadJson(checkpointPath)
  : null;
const inProgressTasks = (checkpoint?.tasks || []).filter((task) =>
  task.searchProgress !== null && task.searchProgress !== undefined).map((task) => ({
    taskKey: task.taskKey,
    status: task.status,
    candidatePlanHash: String(task.searchProgress.candidatePlan?.candidatePlanHash || ""),
    progressHash: String(task.searchProgress.progress?.progressHash || ""),
    nextSlotIndex: numeric(task.searchProgress.progress?.nextSlotIndex),
    totalSlotCount: numeric(task.searchProgress.candidatePlan?.totalSlotCount),
    remainingSlotCount: numeric(task.searchProgress.progress?.remainingSlotCount),
    updatedAtMs: numeric(task.searchProgress.updatedAtMs),
  }));
const completedTaskCount = (checkpoint?.tasks || []).filter((task) =>
  task.status === "completed").length;
const queuedTaskCount = (checkpoint?.tasks || []).filter((task) =>
  task.status === "queued").length;
const hasObservableProgress = Boolean(latestEvent && latestCursor);
const noProgressAlert = Boolean(latestEvent && eventAgeMs > staleAfterMs);
const core = {
  schemaVersion: "ticket05_progress_observation_v1",
  observedAtMs: nowMs,
  progressLogPath,
  checkpointPath: checkpointPath ? path.resolve(checkpointPath) : null,
  eventCount: events.length,
  latestEvent,
  latestCursor,
  eventAgeMs,
  cursorAgeMs,
  staleAfterMs,
  status: !latestEvent
    ? "no_progress_events"
    : noProgressAlert
      ? "no_progress_alert"
      : hasObservableProgress
        ? "actively_observable"
        : "initializing_without_cursor",
  noProgressAlert,
  resourceSnapshot: latestEvent ? {
    pid: numeric(latestEvent.pid),
    rssBytes: numeric(latestEvent.rssBytes),
    heapUsedBytes: numeric(latestEvent.heapUsedBytes),
    heapTotalBytes: numeric(latestEvent.heapTotalBytes),
    externalBytes: numeric(latestEvent.externalBytes),
  } : null,
  checkpoint: checkpoint ? {
    checkpointHash: String(checkpoint.checkpointHash || ""),
    revision: numeric(checkpoint.revision),
    completedTaskCount,
    queuedTaskCount,
    inProgressTaskCount: inProgressTasks.length,
    inProgressTasks,
  } : null,
  claimBoundary: "This observer reports only emitted progress events and sealed checkpoint state. A recent event proves activity logging, not that the remaining candidate set is exhausted, legal, reachable, optimal, or strategically favorable.",
};
process.stdout.write(`${JSON.stringify(core, null, 2)}\n`);
