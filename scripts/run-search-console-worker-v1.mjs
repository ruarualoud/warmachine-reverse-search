import fs from "node:fs";
import path from "node:path";

import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import {
  prepareWarmachineSearchConsolePresetV1,
  WARMACHINE_SEARCH_CONSOLE_PRESET_MATERIALIZER_REVISION_V1,
} from
  "../src/report/search-console-preset-materializer-v1.mjs";
import { projectWarmachineSearchConsoleSnapshotV1 } from
  "../src/report/search-console-projection-v1.mjs";
import { validateWarmachineSearchConsoleSeedV1 } from
  "../src/report/search-console-contract-v1.mjs";
import { searchWarmachineTerminalRootedToDeploymentV1 } from
  "../src/reverse/terminal-rooted-to-deployment-v1.mjs";

function send(message) {
  if (typeof process.send === "function") process.send(message);
}

function event(eventType, payload = {}) {
  send({ messageType: "event", eventType, payload });
}

function activationGroupKey(piece = {}) {
  return String(
    piece.unitGroupId || piece.unitId || piece.metadata?.unitGroupId ||
    piece.metadata?.unitId || piece.pieceKey,
  );
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function buildPreset(seed, progress) {
  const cacheRoot = path.resolve(process.env.WARMACHINE_SEARCH_CONSOLE_ROOT_CACHE_DIR ||
    path.join(process.cwd(), ".scratch", "search-console-root-cache-v1"));
  const cacheKey = stableGraphHash({
    hostReceiptHash: seed.hostReceiptHash,
    goalType: seed.goalType,
    presetKey: seed.presetKey,
    scenarioKey: seed.scenarioKey,
    roundNumber: seed.roundNumber,
    anchorKey: seed.anchorKey,
    randomSeed: seed.randomSeed,
    presetMaterializerRevision: WARMACHINE_SEARCH_CONSOLE_PRESET_MATERIALIZER_REVISION_V1,
  });
  const cachePath = path.join(cacheRoot, `${cacheKey}.json`);
  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (cached.hostReceiptHash === seed.hostReceiptHash && cached.cacheKey === cacheKey &&
        cached.presetMaterializerRevision ===
          WARMACHINE_SEARCH_CONSOLE_PRESET_MATERIALIZER_REVISION_V1) {
      return { ...cached.prepared, cacheHit: true };
    }
  }
  let prepared;
  try {
    prepared = prepareWarmachineSearchConsolePresetV1(seed, {
      onStrictReplayProgress: progress,
    });
  } catch (error) {
    const evidence = error.searchConsolePresetEvidence || {};
    event("seed_rejected", {
      seedKey: seed.seedKey,
      issues: [evidence.reason || error.message || "search_console_preset_root_not_materialized"],
      goalType: seed.goalType,
      anchorKey: seed.anchorKey,
      randomSeed: seed.randomSeed,
      ...evidence,
    });
    throw error;
  }
  atomicWriteJson(cachePath, {
    schemaVersion: "warmachine_search_console_root_cache_v1",
    cacheKey,
    hostReceiptHash: seed.hostReceiptHash,
    presetMaterializerRevision: WARMACHINE_SEARCH_CONSOLE_PRESET_MATERIALIZER_REVISION_V1,
    prepared,
  });
  return { ...prepared, cacheHit: false };
}

function buildExact(seed) {
  return {
    corpus: null,
    root: { terminalState: seed.terminalState },
    cell: seed.terminalCell,
    deployments: seed.deployments,
  };
}

function searchOptions(seed, prepared, config) {
  const terminalResourcePreimagePointsByPieceKey = Object.fromEntries(
    (prepared.corpus?.terminalResourceAssumptions || []).map((assumption) => [
      assumption.pieceKey,
      Number(assumption.resourcePointsBeforeTerminalTurnEnd ??
        assumption.resourcePoints ?? 0),
    ]),
  );
  const maximumReverseTurns = boundedInteger(config.maximumReverseTurns, 1, 0, 6);
  const longHorizonMode = String(config.searchMode || "long_horizon") ===
    "long_horizon";
  const activationGroupOrderKeysBySide = Object.fromEntries(
    ["player1", "player2"].map((sideKey) => [
      sideKey,
      [...new Set((prepared.root.terminalState.pieces || [])
        .filter((piece) => piece.sideKey === sideKey)
        .map(activationGroupKey))].sort(),
    ]),
  );
  const activationGroupOrderKeys = activationGroupOrderKeysBySide[
    String(prepared.cell.endingSideKey || prepared.root.terminalState.activeSideKey || "")
  ] || [];
  const maximumRouteLabels = boundedInteger(config.maximumRouteLabels, 8, 1, 20_000);
  const maximumUniqueStates = boundedInteger(config.maximumUniqueStates, 8, 1, 20_000);
  const maximumCompletedRoutes = boundedInteger(config.maximumCompletedRoutes, 4, 1, 100);
  const maximumActivationLabels = boundedInteger(
    config.maximumActivationLabels,
    64,
    8,
    4_000,
  );
  const terminalEventOptions = seed.seedKind === "exact_terminal_root"
    ? seed.terminalEventOptions
    : seed.goalType === "scenario_score"
      ? {
        terminalActionTypes: ["end_turn"],
        maximumTerminalActions: 1,
        resourcePreimagePointsByPieceKey: terminalResourcePreimagePointsByPieceKey,
      }
      : { terminalActionTypes: ["melee_attack"], maximumTerminalActions: 1 };
  return {
    deployments: prepared.deployments,
    firstPlayerSideKey: String(config.firstPlayerSideKey || "player1"),
    terminalEventOptions,
    maximumReverseTurns,
    maximumRouteLabels,
    maximumUniqueStates,
    maximumCompletedRoutes,
    stopAfterCompletedRouteCount: boundedInteger(
      config.stopAfterCompletedRouteCount,
      1,
      0,
      100,
    ),
    frontierOrder: String(config.frontierOrder || "best_first_to_deployment"),
    maximumActivationDepth: boundedInteger(config.maximumActivationDepth, 64, 0, 512),
    maximumActivationLabels,
    maximumActivationUniqueStates: maximumActivationLabels,
    maximumActivationGroupsPerExpansion: boundedInteger(
      config.maximumActivationGroupsPerExpansion,
      1,
      1,
      32,
    ),
    maximumActivationCandidatesPerExpansion: boundedInteger(
      config.maximumActivationCandidatesPerExpansion,
      1,
      1,
      32,
    ),
    maximumActivationPassActorsPerExpansion: boundedInteger(
      config.maximumActivationPassActorsPerExpansion,
      1,
      1,
      32,
    ),
    stopAfterActivationBoundaryRouteCount: boundedInteger(
      config.stopAfterActivationBoundaryRouteCount,
      1,
      1,
      64,
    ),
    activationGroupOrderKeys,
    activationGroupOrderKeysBySide,
    prioritizeControlResourceDependencies:
      config.prioritizeControlResourceDependencies !== false,
    activationFrontierOrder: "best_first_to_deployment",
    includeMovement: config.includeMovement === true,
    includePass: true,
    movementActionTypes: config.includeMovement === true ? ["advance", "run"] : [],
    resourceEnvelopeKey: seed.goalType === "scenario_score"
      ? "search_control_predecessor"
      : "search_focus_predecessor",
    resourceEnvelopeModes: [longHorizonMode
      ? "reverse_focus_control_pass_baseline"
      : "reverse_focus_control_baseline"],
    controlResidueModes: [longHorizonMode
      ? "empty_previous_control"
      : "absent"],
    nextSideActivationRestoreModes: longHorizonMode
      ? ["all_alive_activated"]
      : ["preserve_reset_state"],
    ...(longHorizonMode
      ? {
        previousTurnEndMaintenanceResourcePreimageModes: [
          "focus_battlegroup_control_pass_baseline",
        ],
        recordMaintenanceResourcePreimageCoverageDebt: true,
      }
      : {}),
    maximumControlSteps: 128,
    maximumDeploymentSlotOrigins: boundedInteger(config.maximumDeploymentSlotOrigins, 4, 1, 16),
    maximumDeploymentSlotRings: boundedInteger(config.maximumDeploymentSlotRings, 1, 0, 6),
    certifyFullRouteStrictReplay: true,
    progressEveryLabels: 1,
    onProgress: (payload) => event("search_progress", { source: "reverse_worklist", ...payload }),
    onActivationProgress: (payload) => event("search_progress", {
      source: "activation_inverse",
      ...payload,
    }),
    onControlProgress: (payload) => event("search_progress", {
      source: "control_inverse",
      ...payload,
    }),
  };
}

async function run(message) {
  const sessionId = String(message.sessionId || "");
  const resultPath = path.resolve(String(message.resultPath || ""));
  const checkpointPath = path.resolve(String(message.checkpointPath ||
    `${resultPath}.checkpoint.json`));
  const validation = validateWarmachineSearchConsoleSeedV1(message.seed || {});
  if (!validation.ok) {
    throw new Error(`search_console_worker_seed_invalid:${validation.issues.join(",")}`);
  }
  const seed = validation.seed;
  event("seed_validation_started", { seedKey: seed.seedKey, workerValidation: true });
  event("seed_validated", {
    seedKey: seed.seedKey,
    seedKind: seed.seedKind,
    strictCertified: validation.strictCertified,
    presetMaterializationPending: validation.presetMaterializationPending,
  });
  const materializationProgress = (payload) => event("search_progress", {
    source: "strict_materialization",
    ...payload,
  });
  const prepared = seed.seedKind === "preset_reference"
    ? buildPreset(seed, materializationProgress)
    : buildExact(seed);
  event("root_materialized", {
    cellKey: prepared.cell.cellKey,
    goalType: prepared.cell.goalType,
    roundNumber: prepared.cell.roundNumber,
    anchorKey: seed.anchorKey,
    terminalStateKey: prepared.root.terminalState.stateKey,
    cacheHit: prepared.cacheHit === true,
  });
  event("search_progress", { source: "reverse_worklist", stage: "reverse_search_started" });
  const options = searchOptions(seed, prepared, message.config || {});
  const resumeCheckpointPath = String(message.resumeCheckpointPath || "");
  if (resumeCheckpointPath && fs.existsSync(resumeCheckpointPath)) {
    options.resumeCheckpoint = JSON.parse(fs.readFileSync(resumeCheckpointPath, "utf8"));
    event("search_progress", {
      source: "reverse_worklist",
      stage: "resume_checkpoint_loaded",
      checkpointHash: String(options.resumeCheckpoint.checkpointHash || ""),
      frontierCount: Number(options.resumeCheckpoint.frontierCount || 0),
    });
  }
  const search = searchWarmachineTerminalRootedToDeploymentV1(
    prepared.root.terminalState,
    prepared.cell,
    options,
  );
  atomicWriteJson(checkpointPath, search.runtimeResumeCheckpoint);
  event("search_progress", {
    source: "reverse_worklist",
    stage: "resume_checkpoint_persisted",
    checkpointHash: search.runtimeResumeCheckpoint.checkpointHash,
    frontierCount: search.runtimeResumeCheckpoint.frontierCount,
    resumeRequested: search.resumeCheckpoint.requested,
    resumeAccepted: search.resumeCheckpoint.accepted,
  });
  const knownFrontiers = search.runtimeReachedPriorTurnFrontiers?.length
    ? search.runtimeReachedPriorTurnFrontiers
    : search.resumeCheckpoint?.accepted === true
      ? (search.runtimeResumeCheckpoint?.frontiers || []).filter((frontier) =>
        Number(frontier.reversedPriorTurnCount || 0) > 0)
      : [];
  event("search_progress", {
    source: "strict_publication_replay",
    stage: "independent_strict_replay_started",
    candidateCount: knownFrontiers.length + (search.routes || []).length,
  });
  if (!search.runtimeReachedPriorTurnFrontiers?.length && knownFrontiers.length) {
    event("search_progress", {
      source: "strict_publication_replay",
      stage: "resume_frontier_republished",
      candidateCount: knownFrontiers.length,
    });
  }
  const publicationSearch = {
    ...search,
    runtimeReachedPriorTurnFrontiers: knownFrontiers,
  };
  const snapshot = projectWarmachineSearchConsoleSnapshotV1({
    sessionId,
    seed,
    terminalCell: prepared.cell,
    terminalState: prepared.root.terminalState,
    search: publicationSearch,
  });
  event("search_progress", {
    source: "strict_publication_replay",
    stage: "independent_strict_replay_completed",
    strictCertifiedBranchCount: snapshot.searchCoverage.strictCertifiedBranchCount,
  });
  atomicWriteJson(resultPath, snapshot);
  send({
    messageType: "result",
    resultPath,
    snapshotHash: snapshot.snapshotHash,
    ok: snapshot.ok,
    summary: snapshot.searchCoverage,
    checkpointPath,
    checkpointHash: search.runtimeResumeCheckpoint.checkpointHash,
    checkpointFrontierCount: search.runtimeResumeCheckpoint.frontierCount,
  });
}

process.once("message", (message) => {
  if (message?.messageType !== "start") {
    send({ messageType: "error", errorMessage: "search_console_worker_start_required" });
    process.exitCode = 1;
    return;
  }
  run(message).then(() => {
    process.exitCode = 0;
    setImmediate(() => process.disconnect?.());
  }).catch((error) => {
    send({
      messageType: "error",
      errorMessage: String(error?.stack || error?.message || error),
    });
    process.exitCode = 1;
    setImmediate(() => process.disconnect?.());
  });
});
