import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { resolveWarmachineHostPath } from
  "../src/warmachine-host-runtime.mjs";

const HISTORICAL_ROOM_ID = "room_f1823ced-bf71-4392-8669-c6330d237efb";

function loadJsonWithHash(filePath) {
  const bytes = fs.readFileSync(filePath);
  return {
    value: JSON.parse(bytes),
    contentHash: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function loadWarmachineMatchupTemplateRoomV1() {
  const historicalRoomStorePath = resolveWarmachineHostPath(
    "build/warmachine-ai/sepsira-swarm-vs-fane-v20260805/local-layer3/state.json",
  );
  const fixtureRoomStorePath = resolveWarmachineHostPath(
    "fixtures/ruleset-baseline/fixed-roster-room.json",
  );
  const roomStorePath = fs.existsSync(historicalRoomStorePath)
    ? historicalRoomStorePath
    : fixtureRoomStorePath;
  const loadedRoomStore = loadJsonWithHash(roomStorePath);
  const templateRoom = loadedRoomStore.value.roomsById?.[HISTORICAL_ROOM_ID] ||
    Object.values(loadedRoomStore.value.roomsById || {})
      .sort((left, right) => String(left.id || "").localeCompare(
        String(right.id || ""),
      ))[0];
  if (!templateRoom) {
    throw new Error("matchup_template_room_missing");
  }
  return {
    loadedRoomStore,
    templateRoom,
    sourceKind: roomStorePath === historicalRoomStorePath
      ? "historical_room_store"
      : "fixed_ruleset_fixture",
  };
}
