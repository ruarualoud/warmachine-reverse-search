#!/usr/bin/env node

import assert from "node:assert/strict";

import { loadWarmachineMatchupTemplateRoomV1 } from
  "./load-matchup-template-room-v1.mjs";
import {
  auditWarmachineDeclaredMapTopologyV1,
  buildWarmachineDeclaredMapTopologyRealizationV1,
} from "../src/matchup/declared-map-topology-realization-v1.mjs";
import { buildSepsiraSixSwarmVsFaneTaskV1 } from
  "../src/matchup/custom-matchup-task-v1.mjs";
import { bindWarmachineSteamrollerFallbackOpeningV1 } from
  "../src/matchup/steamroller-opening-binders-v1.mjs";
import { buildWarmachineSteamrollerOpeningMapTemplateV1 } from
  "../src/matchup/steamroller-opening-map-template-v1.mjs";
import { stableGraphHash } from "../src/graph/typed-facts-v2.mjs";
import { buildWarmachineRulesV1StateFromLayer3Room } from
  "../src/warmachine-construction-host-runtime.mjs";

const { loadedRoomStore, templateRoom } = loadWarmachineMatchupTemplateRoomV1();
const task = buildSepsiraSixSwarmVsFaneTaskV1();
const baseTemplateHash = stableGraphHash({
  roomStoreContentHash: loadedRoomStore.contentHash,
  roomId: templateRoom.id,
  shapes: templateRoom.shapes,
  deployments: templateRoom.deployments,
});
const rows = [];
for (const mapProfile of task.stateDomain.mapProfiles) {
  const left = buildWarmachineDeclaredMapTopologyRealizationV1({
    templateRoom,
    baseTemplateHash,
    mapProfile,
  });
  const right = buildWarmachineDeclaredMapTopologyRealizationV1({
    templateRoom,
    baseTemplateHash,
    mapProfile,
  });
  assert.equal(left.realizationHash, right.realizationHash);
  assert.equal(left.topologyAudit.topologyAuditHash,
    right.topologyAudit.topologyAuditHash);
  assert.equal(left.topologyAudit.ok, true);
  assert.equal(left.topologyAudit.topologyContractMatches, true);
  assert.equal(left.topologyAudit.outOfBoundsTerrainKeys.length, 0);
  assert.equal(left.topologyAudit.overlappingTerrainPairs.length, 0);
  const firstPlayerResults = [];
  for (const firstPlayerSideKey of ["player1", "player2"]) {
    const exactMap = buildWarmachineSteamrollerOpeningMapTemplateV1({
      templateRoom: left.templateRoom,
      baseTemplateHash,
      mapKey: mapProfile.mapKey,
      scenarioKey: "two_fronts",
      firstPlayerSideKey,
      scenarioTerrainSetupClassKey: "all_selected_from_single_candidate",
      topologyAudit: left.topologyAudit,
      topologyRealizationHash: left.realizationHash,
    });
    assert.equal(exactMap.topologyAuditHash, left.topologyAudit.topologyAuditHash);
    assert.equal(exactMap.topologyRealizationHash, left.realizationHash);
    const emptyMapRoom = structuredClone(exactMap.templateRoom);
    emptyMapRoom.tokens = {};
    if (emptyMapRoom.game) delete emptyMapRoom.game.rulesV1RuntimeState;
    const state = buildWarmachineRulesV1StateFromLayer3Room(
      emptyMapRoom,
      { strictMode: true, enforceStrictExecutor: true },
    );
    const bound = bindWarmachineSteamrollerFallbackOpeningV1(state, {
      scenarioKey: "two_fronts",
      firstPlayerSideKey,
      scenarioTerrainSetupClassKey: "all_selected_from_single_candidate",
    });
    assert.equal(bound.scenarioTerrainSetupClassKey,
      "all_selected_from_single_candidate");
    assert.equal(bound.staticPlacementAudit.ok, true);
    firstPlayerResults.push({
      firstPlayerSideKey,
      templateHash: exactMap.templateHash,
      bindingHash: bound.bindingHash,
    });
  }
  rows.push({
    mapKey: mapProfile.mapKey,
    realizationHash: left.realizationHash,
    topologyAuditHash: left.topologyAudit.topologyAuditHash,
    observedTopology: left.topologyAudit.observedTopology,
    terrainCount: left.topologyAudit.terrainCount,
    firstPlayerResults,
  });
}

assert.equal(new Set(rows.map((row) => row.realizationHash)).size, rows.length);
assert.ok(rows.find((row) => row.mapKey === "open_lanes")
  .observedTopology.laneOpenness > rows.find((row) =>
    row.mapKey === "mixed_table").observedTopology.laneOpenness);
assert.ok(rows.find((row) => row.mapKey === "mixed_table")
  .observedTopology.laneOpenness > rows.find((row) =>
    row.mapKey === "dense_chokepoints").observedTopology.laneOpenness);

const openProfile = task.stateDomain.mapProfiles.find((row) =>
  row.mapKey === "open_lanes");
const open = buildWarmachineDeclaredMapTopologyRealizationV1({
  templateRoom,
  baseTemplateHash,
  mapProfile: openProfile,
});
const mislabeled = auditWarmachineDeclaredMapTopologyV1({
  mapKey: "dense_chokepoints",
  mapProfile: task.stateDomain.mapProfiles.find((row) =>
    row.mapKey === "dense_chokepoints"),
  templateRoom: open.templateRoom,
});
assert.equal(mislabeled.ok, false);
assert.ok(Object.values(mislabeled.metricChecks).some((row) => !row.passed));
const outOfBoundsRoom = structuredClone(open.templateRoom);
outOfBoundsRoom.shapes.center_obstruction.x = -1;
const outOfBounds = auditWarmachineDeclaredMapTopologyV1({
  mapKey: "open_lanes",
  mapProfile: openProfile,
  templateRoom: outOfBoundsRoom,
});
assert.equal(outOfBounds.ok, false);
assert.deepEqual(outOfBounds.outOfBoundsTerrainKeys, ["center_obstruction"]);

process.stdout.write(`${JSON.stringify({
  ok: true,
  rows,
  negativeCases: {
    mislabeledGeometryRejected: true,
    outOfBoundsGeometryRejected: true,
  },
}, null, 2)}\n`);
