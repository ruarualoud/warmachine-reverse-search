import { fork } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertWarmachineSearchConsoleCommandV1,
  createWarmachineSearchConsoleEventV1,
  validateWarmachineSearchConsoleSeedV1,
} from "../src/report/search-console-contract-v1.mjs";
import { WARMACHINE_SEARCH_CONSOLE_PRESET_CATALOG_V1 } from
  "../src/report/search-console-presets-v1.mjs";
import { projectWarmachineSearchConsoleScenarioCoverageV1 } from
  "../src/report/search-console-scenario-coverage-v1.mjs";
import { WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSETS_V1 } from
  "../src/report/search-console-exact-card-assets-v1.mjs";
import { WARMACHINE_SEARCH_CONSOLE_OFFICIAL_SCENARIO_ASSETS_V1 } from
  "../src/report/search-console-official-scenario-assets-v1.mjs";
import { enrichWarmachineSearchConsolePresentationV1 } from
  "../src/report/search-console-presentation-evidence-v1.mjs";
import { collectWarmachineReplayPieceIdentitiesV1 } from
  "../src/report/search-console-presentation-evidence-v1.mjs";
import { buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-assassination-terminal-anchor-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerAssassinationTerminalRepresentativeRejectEvidenceV1,
} from
  "../src/reverse/steamroller-assassination-terminal-representative-reject-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerSimultaneousLeaderTerminalAnchorEvidenceV1,
} from
  "../src/reverse/steamroller-simultaneous-leader-terminal-anchor-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerStrygonSpraySimultaneousLeaderTerminalEvidenceV1,
} from
  "../src/reverse/steamroller-strygon-spray-simultaneous-leader-terminal-evidence-v1.mjs";
import { buildWarmachineSteamrollerFixedRoundTerminalAnchorEvidenceV1 } from
  "../src/reverse/steamroller-fixed-round-terminal-anchor-evidence-v1.mjs";
import { buildWarmachineSteamrollerScoreTerminalRepresentativeEvidenceV1 } from
  "../src/reverse/steamroller-score-terminal-representative-evidence-v1.mjs";
import {
  buildWarmachineSteamrollerScoreTerminalRepresentativeRejectEvidenceV1,
} from
  "../src/reverse/steamroller-score-terminal-representative-reject-evidence-v1.mjs";
import { buildWarmachineSteamrollerTerminalRepresentativeMaterializationLedgerV1 } from
  "../src/reverse/steamroller-terminal-representative-materialization-ledger-v1.mjs";
import { selectWarmachineSteamrollerTerminalRepresentativesV1 } from
  "../src/reverse/steamroller-terminal-representative-selector-v1.mjs";
import { warmachineHost } from "../src/warmachine-host-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "web", "search-console");
const mediaLibraryRoot = path.resolve(process.env.WARMACHINE_MEDIA_ROOT || path.join(
  warmachineHost.receipt.projectDRoot,
  "android-shell",
  "assets",
  "media-library",
));
const wartableWarmachineAssetRoot = path.resolve(
  process.env.WARMACHINE_WARTABLE_ASSET_ROOT || path.join(
    warmachineHost.receipt.projectDRoot,
    "layer3-local",
    "assets",
    "warmachine",
  ),
);
const sessionsRoot = path.resolve(process.env.WARMACHINE_SEARCH_CONSOLE_DATA_DIR ||
  path.join(root, ".scratch", "search-console-sessions-v1"));
const workerPath = path.join(root, "scripts", "run-search-console-worker-v1.mjs");
const host = String(process.env.HOST || "127.0.0.1");
const port = Number(process.env.PORT || 4317);
const sessions = new Map();
const children = new Map();
const subscribers = new Map();
const presentationSnapshotCache = new Map();
const mediaLibraryIndex = (() => {
  const indexPath = path.join(mediaLibraryRoot, "index.json");
  if (!fs.existsSync(indexPath)) return new Map();
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  return new Map((index.entries || []).map((entry) => [
    `/${String(entry.path || "").replace(/^\/+/, "")}`,
    entry,
  ]));
})();

const terminalAnchorCoverage = buildWarmachineSteamrollerScoreTerminalAnchorEvidenceV1();
const terminalScenarioCorpus = terminalAnchorCoverage.corpus;
const terminalAssassinationAnchorCoverage =
  buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
    corpus: terminalScenarioCorpus,
  });
const terminalAssassinationMovementCoverage =
  buildWarmachineSteamrollerAssassinationTerminalAnchorEvidenceV1({
    corpus: terminalScenarioCorpus,
    rosterWitness: terminalAssassinationAnchorCoverage.proposal.runtimeWitness,
    actionRange: "outside_direct_action_range_requires_prior_movement",
  });
const terminalSimultaneousLeaderCoverage =
  buildWarmachineSteamrollerSimultaneousLeaderTerminalAnchorEvidenceV1({
    corpus: terminalScenarioCorpus,
    rosterWitness: terminalAssassinationAnchorCoverage.proposal.runtimeWitness,
    scenarioProposal: terminalAnchorCoverage.proposals.find((proposal) =>
      proposal.hostScenarioKey === "high_stakes"),
  });
const terminalSimultaneousLeaderPresenceCoverage =
  buildWarmachineSteamrollerSimultaneousLeaderTerminalAnchorEvidenceV1({
    corpus: terminalScenarioCorpus,
    rosterWitness: terminalAssassinationAnchorCoverage.proposal.runtimeWitness,
    scenarioProposal: terminalAnchorCoverage.proposals.find((proposal) =>
      proposal.hostScenarioKey === "high_stakes"),
    tiebreakClassKey: "victory_points_tied_scenario_presence_advantage",
  });
const terminalStrygonSprayCoverage =
  buildWarmachineSteamrollerStrygonSpraySimultaneousLeaderTerminalEvidenceV1({
    corpus: terminalScenarioCorpus,
    rosterWitness: terminalAssassinationAnchorCoverage.proposal.runtimeWitness,
    scenarioProposal: terminalAnchorCoverage.proposals.find((proposal) =>
      proposal.hostScenarioKey === "high_stakes"),
  });
const terminalFixedRoundCoverage =
  buildWarmachineSteamrollerFixedRoundTerminalAnchorEvidenceV1({
    corpus: terminalScenarioCorpus,
    rosterWitness: terminalAssassinationAnchorCoverage.proposal.runtimeWitness,
    scenarioProposals: terminalAnchorCoverage.proposals,
  });
const terminalRepresentativeSelection =
  selectWarmachineSteamrollerTerminalRepresentativesV1({
    corpus: terminalScenarioCorpus,
    maximumSkeletonCells: 96,
    maximumRepresentativeSubcells: 50000,
    pinnedRepresentatives: [
      ...terminalAnchorCoverage.evidence.roots,
      ...terminalAssassinationAnchorCoverage.evidence.roots,
      ...terminalAssassinationMovementCoverage.evidence.roots,
      ...terminalSimultaneousLeaderCoverage.evidence.roots,
      ...terminalSimultaneousLeaderPresenceCoverage.evidence.roots,
      ...terminalStrygonSprayCoverage.evidence.roots,
      ...terminalFixedRoundCoverage.evidence.roots,
    ],
  });
const terminalScoreRepresentativeCoverage =
  buildWarmachineSteamrollerScoreTerminalRepresentativeEvidenceV1({
    corpus: terminalScenarioCorpus,
    representativeSelection: terminalRepresentativeSelection,
    anchorEvidence: terminalAnchorCoverage,
    anchorProposals: terminalAnchorCoverage.proposals,
  });
const terminalScoreRepresentativeRejectCoverage =
  buildWarmachineSteamrollerScoreTerminalRepresentativeRejectEvidenceV1({
    corpus: terminalScenarioCorpus,
    representativeSelection: terminalRepresentativeSelection,
    anchorEvidence: terminalAnchorCoverage,
    anchorProposals: terminalAnchorCoverage.proposals,
  });
const terminalAssassinationRepresentativeRejectCoverage =
  buildWarmachineSteamrollerAssassinationTerminalRepresentativeRejectEvidenceV1({
    corpus: terminalScenarioCorpus,
    representativeSelection: terminalRepresentativeSelection,
    rosterWitness: terminalAssassinationAnchorCoverage.proposal.runtimeWitness,
  });
const terminalRepresentativeMaterializationLedger =
  buildWarmachineSteamrollerTerminalRepresentativeMaterializationLedgerV1({
    corpus: terminalScenarioCorpus,
    representativeSelection: terminalRepresentativeSelection,
    evidenceSets: [
      terminalScoreRepresentativeCoverage.evidence,
      terminalScoreRepresentativeRejectCoverage.evidence,
      terminalAssassinationAnchorCoverage.evidence,
      terminalAssassinationMovementCoverage.evidence,
      terminalSimultaneousLeaderCoverage.evidence,
      terminalSimultaneousLeaderPresenceCoverage.evidence,
      terminalStrygonSprayCoverage.evidence,
      terminalFixedRoundCoverage.evidence,
      terminalAssassinationRepresentativeRejectCoverage,
    ],
    maximumProposedTasks: 0,
  });
const terminalScenarioCoverage = projectWarmachineSearchConsoleScenarioCoverageV1({
  corpus: terminalScenarioCorpus,
  presetCatalog: WARMACHINE_SEARCH_CONSOLE_PRESET_CATALOG_V1,
  representativeSelection: terminalRepresentativeSelection,
  representativeMaterializationLedger: terminalRepresentativeMaterializationLedger,
});

const catalog = {
  schemaVersion: "warmachine_search_console_catalog_v1",
  hostReceiptHash: warmachineHost.receipt.receiptHash,
  terminalAnchorEvidence: terminalAnchorCoverage.evidence,
  terminalAssassinationAnchorEvidence: terminalAssassinationAnchorCoverage.evidence,
  terminalAssassinationMovementEvidence:
    terminalAssassinationMovementCoverage.evidence,
  terminalSimultaneousLeaderEvidence: terminalSimultaneousLeaderCoverage.evidence,
  terminalSimultaneousLeaderPresenceEvidence:
    terminalSimultaneousLeaderPresenceCoverage.evidence,
  terminalStrygonSprayEvidence: terminalStrygonSprayCoverage.evidence,
  terminalFixedRoundEvidence: terminalFixedRoundCoverage.evidence,
  terminalAssassinationRepresentativeRejectEvidence:
    terminalAssassinationRepresentativeRejectCoverage,
  terminalScoreRepresentativeEvidence: terminalScoreRepresentativeCoverage.evidence,
  terminalScoreRepresentativeRejectEvidence:
    terminalScoreRepresentativeRejectCoverage.evidence,
  terminalScenarioCoverage,
  replayPresentationAssets: {
    exactCardAssetCount: Object.keys(WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSETS_V1).length,
    officialScenarioMapAssetCount: Object.keys(
      WARMACHINE_SEARCH_CONSOLE_OFFICIAL_SCENARIO_ASSETS_V1,
    ).length,
    fuzzyIdentityMatchingUsed: false,
  },
  scenarios: terminalScenarioCoverage.scenarios,
  defaultConfig: {
    searchMode: "long_horizon",
    maximumReverseTurns: 1,
    maximumRouteLabels: 8,
    maximumUniqueStates: 8,
    maximumCompletedRoutes: 4,
    maximumActivationLabels: 64,
    stopAfterActivationBoundaryRouteCount: 1,
    includeMovement: false,
  },
  claimBoundary: "The seven-scenario corpus and runnable terminal-root presets are separate. A corpus cell without a runnable preset remains explicit materialization debt and is not a reachability or training claim.",
};

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function publicSession(session) {
  const {
    directory: _directory,
    childPid: _childPid,
    checkpointPath: _checkpointPath,
    ...value
  } = session;
  return value;
}

function writeSession(session) {
  atomicWriteJson(path.join(session.directory, "status.json"), publicSession(session));
}

function broadcast(sessionId, event) {
  for (const response of subscribers.get(sessionId) || []) {
    response.write(`id: ${event.sequence}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`);
  }
}

function appendEvent(session, eventType, payload = {}) {
  session.eventSequence += 1;
  const event = createWarmachineSearchConsoleEventV1({
    sessionId: session.sessionId,
    sequence: session.eventSequence,
    eventType,
    state: session.state,
    payload,
  });
  fs.mkdirSync(session.directory, { recursive: true });
  fs.appendFileSync(path.join(session.directory, "events.ndjson"),
    `${JSON.stringify(event)}\n`, "utf8");
  session.updatedAt = event.occurredAt;
  writeSession(session);
  broadcast(session.sessionId, event);
  return event;
}

function readEvents(session, after = 0) {
  const eventPath = path.join(session.directory, "events.ndjson");
  if (!fs.existsSync(eventPath)) return [];
  return fs.readFileSync(eventPath, "utf8").trim().split("\n")
    .filter(Boolean).map((line) => JSON.parse(line))
    .filter((event) => event.sequence > after);
}

function loadSessions() {
  fs.mkdirSync(sessionsRoot, { recursive: true });
  for (const name of fs.readdirSync(sessionsRoot)) {
    const directory = path.join(sessionsRoot, name);
    const statusPath = path.join(directory, "status.json");
    if (!fs.existsSync(statusPath)) continue;
    try {
      const loaded = JSON.parse(fs.readFileSync(statusPath, "utf8"));
      const session = {
        ...loaded,
        directory,
        childPid: null,
        checkpointPath: loaded.checkpointFileName
          ? path.join(directory, loaded.checkpointFileName)
          : "",
      };
      if (["running", "paused"].includes(session.state)) {
        const priorPid = loaded.pid || null;
        session.state = "interrupted";
        session.pid = null;
        sessions.set(session.sessionId, session);
        appendEvent(session, "search_interrupted", {
          reason: "search_console_server_restart",
          priorPid,
        });
      } else {
        session.pid = null;
        sessions.set(session.sessionId, session);
        writeSession(session);
      }
    } catch (error) {
      process.stderr.write(`Skipped corrupt session ${name}: ${error.message}\n`);
    }
  }
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function checkpointPathForPresentation(session) {
  const candidates = [
    session.checkpointPath,
    session.checkpointFileName ? path.join(session.directory, session.checkpointFileName) : "",
    session.attemptNumber ? path.join(session.directory, `checkpoint-${session.attemptNumber}.json`) : "",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function encodeAssetPath(value = "") {
  return String(value).split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function exactMediaAssetsForPresentation(snapshot = {}, checkpoint = null) {
  const { identities } = collectWarmachineReplayPieceIdentitiesV1({ snapshot, checkpoint });
  const assets = {};
  for (const identity of identities.values()) {
    const portraitPath = `/${String(identity.portraitPath || "").replace(/^\/+/, "")}`;
    if (portraitPath === "/") continue;
    const sourceMemberPath = portraitPath.slice(1);
    const filePath = path.resolve(mediaLibraryRoot, sourceMemberPath);
    if (!filePath.startsWith(`${mediaLibraryRoot}${path.sep}`) || !fs.existsSync(filePath)) {
      continue;
    }
    const indexEntry = mediaLibraryIndex.get(portraitPath) || {};
    assets[portraitPath] = {
      assetUrl: `/wartable-media/${encodeAssetPath(portraitPath)}`,
      sha256: createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"),
      sourceKind: "official_warmachine_app_media_library_exact_path",
      sourceArchiveName: String(indexEntry.sourceArchive || ""),
      sourceMemberPath,
    };
  }
  return assets;
}

function presentationSnapshot(session) {
  const checkpointPath = checkpointPathForPresentation(session);
  const resultMtime = fs.statSync(session.resultPath).mtimeMs;
  const checkpointMtime = checkpointPath ? fs.statSync(checkpointPath).mtimeMs : 0;
  const cacheKey = `${session.resultPath}:${resultMtime}:${checkpointPath}:${checkpointMtime}`;
  const cached = presentationSnapshotCache.get(session.sessionId);
  if (cached?.cacheKey === cacheKey) return cached.snapshot;
  const snapshot = JSON.parse(fs.readFileSync(session.resultPath, "utf8"));
  const checkpoint = checkpointPath
    ? JSON.parse(fs.readFileSync(checkpointPath, "utf8"))
    : null;
  const enriched = enrichWarmachineSearchConsolePresentationV1({
    snapshot,
    checkpoint,
    checkpointFileName: checkpointPath ? path.basename(checkpointPath) : "",
    checkpointHash: session.checkpointHash,
    exactAssetByCardId: WARMACHINE_SEARCH_CONSOLE_EXACT_CARD_ASSETS_V1,
    exactMediaAssetByPortraitPath: exactMediaAssetsForPresentation(snapshot, checkpoint),
    scenarioAssetByScenarioKey: WARMACHINE_SEARCH_CONSOLE_OFFICIAL_SCENARIO_ASSETS_V1,
    currentHostReceiptHash: warmachineHost.receipt.receiptHash,
  });
  presentationSnapshotCache.set(session.sessionId, { cacheKey, snapshot: enriched });
  return enriched;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 12 * 1024 * 1024) {
        reject(new Error("request_body_too_large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("request_json_invalid"));
      }
    });
    request.on("error", reject);
  });
}

function createSession(body) {
  const validation = validateWarmachineSearchConsoleSeedV1(body.seed || {});
  const now = new Date().toISOString();
  const sessionId = `wmrs-${randomUUID()}`;
  const directory = path.join(sessionsRoot, sessionId);
  const session = {
    schemaVersion: "warmachine_search_console_session_v1",
    sessionId,
    state: validation.ok ? "ready" : "seed_rejected",
    createdAt: now,
    updatedAt: now,
    eventSequence: 0,
    attemptNumber: 0,
    seed: validation.seed || body.seed || {},
    seedValidation: validation,
    config: { ...catalog.defaultConfig, ...(body.config || {}) },
    resultAvailable: false,
    resultPath: "",
    checkpointAvailable: false,
    checkpointHash: "",
    checkpointFrontierCount: 0,
    checkpointPath: "",
    checkpointFileName: "",
    lastError: "",
    pid: null,
    directory,
    childPid: null,
  };
  fs.mkdirSync(directory, { recursive: true });
  sessions.set(sessionId, session);
  appendEvent(session, "session_created", {
    seedKey: validation.seed?.seedKey || "",
    seedKind: validation.seed?.seedKind || "",
  });
  appendEvent(session, validation.ok ? "seed_validated" : "seed_rejected", {
    issues: validation.issues,
    strictCertified: validation.strictCertified,
    presetMaterializationPending: validation.presetMaterializationPending,
  });
  return session;
}

function startSession(session) {
  assertWarmachineSearchConsoleCommandV1("start", session.state);
  session.attemptNumber += 1;
  session.state = "running";
  session.lastError = "";
  session.resultAvailable = false;
  const resultPath = path.join(session.directory, `result-${session.attemptNumber}.json`);
  const checkpointPath = path.join(
    session.directory,
    `checkpoint-${session.attemptNumber}.json`,
  );
  const resumeCheckpointPath = session.checkpointAvailable && session.checkpointPath
    ? session.checkpointPath
    : "";
  const child = fork(workerPath, [], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  session.pid = child.pid;
  session.childPid = child.pid;
  session.resultPath = resultPath;
  children.set(session.sessionId, child);
  const logPath = path.join(session.directory, `worker-${session.attemptNumber}.log`);
  const log = fs.createWriteStream(logPath, { flags: "a" });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  appendEvent(session, "search_started", {
    attemptNumber: session.attemptNumber,
    pid: child.pid,
    config: session.config,
  });
  let resultReceived = false;
  child.on("message", (message) => {
    if (message?.messageType === "event") {
      appendEvent(session, message.eventType, message.payload || {});
      if (message.eventType === "seed_rejected") {
        session.state = "seed_rejected";
        session.lastError = (message.payload?.issues || []).join(",") ||
          "search_console_seed_rejected";
      }
      return;
    }
    if (message?.messageType === "result") {
      resultReceived = true;
      session.resultAvailable = true;
      session.checkpointAvailable = Number(message.checkpointFrontierCount || 0) > 0 &&
        fs.existsSync(String(message.checkpointPath || ""));
      session.checkpointPath = session.checkpointAvailable
        ? String(message.checkpointPath || "")
        : "";
      session.checkpointFileName = session.checkpointAvailable
        ? path.basename(session.checkpointPath)
        : "";
      session.checkpointHash = String(message.checkpointHash || "");
      session.checkpointFrontierCount = Number(message.checkpointFrontierCount || 0);
      appendEvent(session, "result_published", {
        resultPath: path.basename(message.resultPath),
        snapshotHash: message.snapshotHash,
        ok: message.ok,
        summary: message.summary,
        checkpointAvailable: session.checkpointAvailable,
        checkpointHash: session.checkpointHash,
        checkpointFrontierCount: session.checkpointFrontierCount,
      });
      return;
    }
    if (message?.messageType === "error") {
      session.lastError = String(message.errorMessage || "search_console_worker_failed");
    }
  });
  child.once("exit", (code, signal) => {
    log.end();
    children.delete(session.sessionId);
    session.pid = null;
    session.childPid = null;
    if (session.state === "cancelled" || session.state === "seed_rejected") return;
    if (code === 0 && resultReceived) {
      session.state = "completed";
      appendEvent(session, "search_completed", {
        attemptNumber: session.attemptNumber,
        exitCode: code,
      });
    } else {
      session.state = "failed";
      appendEvent(session, "search_failed", {
        attemptNumber: session.attemptNumber,
        exitCode: code,
        signal,
        errorMessage: session.lastError || "search_console_worker_exited_without_result",
      });
    }
  });
  child.send({
    messageType: "start",
    sessionId: session.sessionId,
    seed: session.seed,
    config: session.config,
    resultPath,
    checkpointPath,
    resumeCheckpointPath,
  });
}

function commandSession(session, type, payload = {}) {
  assertWarmachineSearchConsoleCommandV1(type, session.state);
  const child = children.get(session.sessionId);
  if (type === "start") {
    const nextConfig = { ...session.config, ...(payload.config || {}) };
    const semanticConfigChanged = ["searchMode", "includeMovement"].some((key) =>
      String(nextConfig[key] ?? "") !== String(session.config[key] ?? ""));
    if (semanticConfigChanged && session.checkpointAvailable) {
      session.checkpointAvailable = false;
      session.checkpointHash = "";
      session.checkpointFrontierCount = 0;
      session.checkpointPath = "";
      session.checkpointFileName = "";
      appendEvent(session, "search_progress", {
        source: "reverse_worklist",
        stage: "resume_checkpoint_invalidated",
        reason: "search_contract_change",
      });
    }
    session.config = nextConfig;
    startSession(session);
  } else if (type === "pause") {
    if (!child?.kill("SIGSTOP")) throw new Error("search_console_pause_signal_failed");
    session.state = "paused";
    appendEvent(session, "search_paused", { pid: child.pid });
  } else if (type === "resume") {
    if (!child?.kill("SIGCONT")) throw new Error("search_console_resume_signal_failed");
    session.state = "running";
    appendEvent(session, "search_resumed", { pid: child.pid });
  } else if (type === "cancel") {
    child?.kill("SIGCONT");
    child?.kill("SIGTERM");
    session.state = "cancelled";
    session.pid = null;
    session.childPid = null;
    children.delete(session.sessionId);
    appendEvent(session, "search_cancelled", { reason: String(payload.reason || "user_request") });
  }
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function serveAsset(response, pathname, prefix, assetRoot) {
  if (!pathname.startsWith(prefix)) return false;
  const requested = decodeURIComponent(pathname.slice(prefix.length));
  const filePath = path.resolve(assetRoot, requested);
  if (!filePath.startsWith(`${assetRoot}${path.sep}`) || !fs.existsSync(filePath) ||
      !fs.statSync(filePath).isFile()) return false;
  response.writeHead(200, {
    "content-type": contentType(filePath),
    "cache-control": "public, max-age=3600",
  });
  fs.createReadStream(filePath).pipe(response);
  return true;
}

function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(publicRoot, requested);
  if (!filePath.startsWith(`${publicRoot}${path.sep}`) || !fs.existsSync(filePath)) return false;
  response.writeHead(200, {
    "content-type": contentType(filePath),
    "cache-control": "no-cache",
  });
  fs.createReadStream(filePath).pipe(response);
  return true;
}

loadSessions();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean);
  try {
    if (request.method === "GET" && url.pathname === "/api/v1/catalog") {
      sendJson(response, 200, catalog);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/v1/sessions") {
      sendJson(response, 200, {
        sessions: [...sessions.values()].map(publicSession)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/v1/seeds/validate") {
      sendJson(response, 200, validateWarmachineSearchConsoleSeedV1((await readBody(request)).seed));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/v1/sessions") {
      const body = await readBody(request);
      const session = createSession(body);
      if (body.autoStart === true && session.state === "ready") startSession(session);
      sendJson(response, 201, publicSession(session));
      return;
    }
    if (parts[0] === "api" && parts[1] === "v1" && parts[2] === "sessions" && parts[3]) {
      const session = sessions.get(parts[3]);
      if (!session) {
        sendJson(response, 404, { error: "search_console_session_not_found" });
        return;
      }
      if (request.method === "GET" && parts.length === 4) {
        sendJson(response, 200, publicSession(session));
        return;
      }
      if (request.method === "GET" && parts[4] === "snapshot") {
        if (!session.resultAvailable || !fs.existsSync(session.resultPath)) {
          sendJson(response, 404, { error: "search_console_snapshot_not_available" });
          return;
        }
        sendJson(response, 200, presentationSnapshot(session));
        return;
      }
      if (request.method === "GET" && parts[4] === "events") {
        const after = Number(url.searchParams.get("after") || request.headers["last-event-id"] || 0);
        if (url.searchParams.get("stream") === "1") {
          response.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          });
          for (const event of readEvents(session, after)) {
            response.write(`id: ${event.sequence}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`);
          }
          if (!subscribers.has(session.sessionId)) subscribers.set(session.sessionId, new Set());
          subscribers.get(session.sessionId).add(response);
          const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15_000);
          request.once("close", () => {
            clearInterval(heartbeat);
            subscribers.get(session.sessionId)?.delete(response);
          });
        } else {
          sendJson(response, 200, { events: readEvents(session, after) });
        }
        return;
      }
      if (request.method === "POST" && parts[4] === "commands") {
        const body = await readBody(request);
        commandSession(session, String(body.commandType || ""), body);
        sendJson(response, 200, publicSession(session));
        return;
      }
    }
    if (request.method === "GET" &&
        serveAsset(response, url.pathname, "/wartable-media/", mediaLibraryRoot)) return;
    if (request.method === "GET" &&
        serveAsset(response, url.pathname, "/wartable-assets/", wartableWarmachineAssetRoot)) return;
    if (request.method === "GET" && serveStatic(response, url.pathname)) return;
    sendJson(response, 404, { error: "not_found" });
  } catch (error) {
    sendJson(response, 400, { error: String(error?.message || error) });
  }
});

server.listen(port, host, () => {
  process.stdout.write(`Warmachine reverse-search console: http://${host}:${port}\n`);
});

function shutdown() {
  for (const child of children.values()) {
    child.kill("SIGCONT");
    child.kill("SIGTERM");
  }
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
