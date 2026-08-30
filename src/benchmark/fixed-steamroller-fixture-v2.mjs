import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  buildWarmachineRosterPoolSourceEvidenceV2,
  runWarmachineNestedRosterDeploymentSearchV2,
} from "../construction/nested-roster-deployment-v2.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";
import { resolveWarmachineHostPath, warmachineHost } from "../warmachine-host-runtime.mjs";
import { bindWarmachineTwoFrontsOpeningV2 } from "./fixed-steamroller-benchmark-v2.mjs";

export const WARMACHINE_FIXED_STEAMROLLER_FIXTURE_V2_SCHEMA =
  "warmachine_fixed_steamroller_fixture_v2";

const LEGACY_BUILD_DIR = "build/warmachine-ai/sepsira-swarm-vs-fane-v20260805";
const DEFAULT_POOL_PATH = "fixtures/ruleset-baseline/construction-pool-report.json";
const DEFAULT_ROOM_STORE_PATH = "fixtures/ruleset-baseline/fixed-roster-room.json";
const DEFAULT_ROOM_ID = "construction-cryx-recursion-screen-fane-ashmael-scenario-blender-balanced-collision-player1-e4937ca7b578";

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function loadJsonWithHash(filePath) {
  const bytes = fs.readFileSync(filePath);
  return {
    value: JSON.parse(bytes),
    contentHash: createHash("sha256").update(bytes).digest("hex"),
  };
}

function hostRelativePath(filePath) {
  return path.relative(resolveWarmachineHostPath("."), filePath).split(path.sep).join("/");
}

export function buildWarmachineFixedSteamrollerFixtureV2(rawOptions = {}) {
  const legacyBaseDir = rawOptions.buildDir
    ? resolveWarmachineHostPath(rawOptions.buildDir || LEGACY_BUILD_DIR)
    : "";
  const poolPath = rawOptions.poolPath
    ? resolveWarmachineHostPath(rawOptions.poolPath)
    : legacyBaseDir
      ? path.join(legacyBaseDir, "strict-construction-pool-v1", "report.json")
      : resolveWarmachineHostPath(DEFAULT_POOL_PATH);
  const roomStorePath = rawOptions.roomStorePath
    ? resolveWarmachineHostPath(rawOptions.roomStorePath)
    : legacyBaseDir
      ? path.join(legacyBaseDir, "local-layer3", "state.json")
      : resolveWarmachineHostPath(DEFAULT_ROOM_STORE_PATH);
  const loadedPool = loadJsonWithHash(poolPath);
  const pool = loadedPool.value;
  const sourceMetadata = {
    sourceContentHash: loadedPool.contentHash,
    sourceSchemaVersion: pool.schemaVersion,
    exactListLegality: pool.quality.exactListLegality,
    forceBuilderContract: pool.algorithm.finalLegality,
    remoteVersion: pool.source.remoteVersion,
    exhaustiveAllFactionRosters: pool.algorithm.exhaustiveAllLists,
  };
  const cryxSourceEvidence = buildWarmachineRosterPoolSourceEvidenceV2(
    pool.cryxLists,
    sourceMetadata,
  );
  const faneSourceEvidence = buildWarmachineRosterPoolSourceEvidenceV2(
    pool.faneLists,
    sourceMetadata,
  );
  const roomStore = loadJsonWithHash(roomStorePath);
  const roomId = String(rawOptions.roomId || DEFAULT_ROOM_ID);
  const templateRoom = requireValue(
    roomStore.value.roomsById?.[roomId],
    `Fixed construction template is unavailable: ${roomId}`,
  );
  const cryxList = requireValue(pool.cryxLists.find((list) =>
    /sepsira/i.test(String(list.leader || "")) &&
    list.entries.filter((entry) =>
      /mechanithrall swarm\s+#\d+$/i.test(String(entry.name || ""))).length === 6),
  "A legal Sepsira roster with six Mechanithrall Swarm units is required");
  const faneList = requireValue(
    pool.faneLists[Math.max(0, Number(rawOptions.faneListIndex || 0))],
    "A legal Fane roster is required",
  );
  const nested = runWarmachineNestedRosterDeploymentSearchV2({
    templateRoom,
    rosterPoolsBySide: { player1: [cryxList], player2: [faneList] },
    sourceEvidenceBySide: { player1: cryxSourceEvidence, player2: faneSourceEvidence },
    maximumSelectedRostersBySide: { player1: 1, player2: 1 },
    maximumRosterPairs: 1,
    maximumArchetypesPerSide: 1,
    maximumFormationPairsPerRosterPair: 1,
    formationArchetypeKeysBySide: {
      player1: [String(rawOptions.cryxFormationArchetypeKey || "center_break")],
      player2: [String(rawOptions.faneFormationArchetypeKey || "balanced_layered")],
    },
    firstPlayerSideKeys: [String(rawOptions.firstPlayerSideKey || "player1")],
    includeStates: true,
    seed: String(rawOptions.seed || "fixed-steamroller-fixture-v2"),
    searchMode: "fixed_roster_to_deployment",
  });
  if (nested.counts.strictLegalOpeningCount !== 1 || !nested.openings[0]) {
    throw new Error(`Expected one strict legal fixed opening, received ${nested.counts.strictLegalOpeningCount}`);
  }
  const opening = nested.openings[0];
  if (opening.strictDeploymentLegal !== true ||
      opening.rosterProvenance.completeForHardPruning !== true ||
      opening.rosterPointLedger.sides.player1.rosterPoints !== 100 ||
      opening.rosterPointLedger.sides.player2.rosterPoints !== 100) {
    throw new Error("Fixed opening did not satisfy the 100-point construction and deployment contract");
  }
  const bound = bindWarmachineTwoFrontsOpeningV2(opening.state);
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_FIXED_STEAMROLLER_FIXTURE_V2_SCHEMA,
    hostReceiptHash: warmachineHost.receipt.receiptHash,
    source: {
      poolPath: hostRelativePath(poolPath),
      poolContentHash: loadedPool.contentHash,
      roomStorePath: hostRelativePath(roomStorePath),
      roomStoreContentHash: roomStore.contentHash,
      roomId,
      remoteVersion: String(sourceMetadata.remoteVersion || ""),
      historicalBuildDependencyUsed: Boolean(legacyBaseDir),
    },
    rosters: {
      player1: {
        listKey: cryxList.key,
        leader: cryxList.leader,
        rosterPoints: opening.rosterPointLedger.sides.player1.rosterPoints,
      },
      player2: {
        listKey: faneList.key,
        leader: faneList.leader,
        rosterPoints: opening.rosterPointLedger.sides.player2.rosterPoints,
      },
    },
    opening: {
      openingKey: opening.openingKey,
      formationKey: opening.formationKey,
      strictDeploymentLegal: opening.strictDeploymentLegal,
      modelCount: bound.modelCount,
      stateHash: bound.stateHash,
      scenarioKey: bound.scenarioKey,
      mechanithrallSwarmGroupCount: bound.mechanithrallSwarmGroupCount,
    },
    constructionSearch: {
      strictLegalOpeningCount: nested.counts.strictLegalOpeningCount,
      proposalMassConserved: nested.proposalMassConserved,
      completeForHardPruning: opening.rosterProvenance.completeForHardPruning,
    },
    claimBoundary: "This fixture proves fixed roster legality and one legal deployment template. The deployment coordinates are not later-round terminal coordinates and may not be used as a reverse-search terminal root.",
  });
  return {
    ...core,
    fixtureHash: stableGraphHash(core),
    cryxList,
    faneList,
    nested,
    opening,
    bound,
    stateTemplate: bound.state,
  };
}
