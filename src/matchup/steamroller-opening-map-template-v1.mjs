import { createHash } from "node:crypto";

import { warmachineSteamroller2026OfficialScenarioLayoutV1 } from
  "../contracts/steamroller-2026-official-scenario-layout-v1.mjs";
import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_STEAMROLLER_OPENING_MAP_TEMPLATE_V1_SCHEMA =
  "warmachine_steamroller_opening_map_template_v1";

export function orientWarmachineSteamrollerDeploymentLayoutV1(
  layoutInput = {},
  firstPlayerSideKey = "player1",
) {
  if (!["player1", "player2"].includes(firstPlayerSideKey)) {
    throw new Error(`steamroller_opening_first_player_invalid:${firstPlayerSideKey}`);
  }
  const layout = structuredClone(layoutInput);
  const defenderSideKey = firstPlayerSideKey === "player1" ? "player2" : "player1";
  const zones = Object.values(layout.deployments || {});
  const attackerZone = zones.find((zone) => zone.setupRole === "attacker");
  const defenderZone = zones.find((zone) => zone.setupRole === "defender");
  if (!attackerZone || !defenderZone) {
    throw new Error(`steamroller_opening_deployment_roles_missing:${
      layout.scenarioKey || ""}`);
  }
  const zoneForSide = (sourceZone, sideKey) => ({
    ...structuredClone(sourceZone),
    id: `${sideKey === "player1" ? "p1" : "p2"}_deploy`,
    zoneKey: `${sideKey === "player1" ? "p1" : "p2"}_deploy`,
    deploymentZoneKey: `${sideKey === "player1" ? "p1" : "p2"}_deploy`,
    sideKey,
  });
  layout.deployments = {
    p1_deploy: zoneForSide(
      firstPlayerSideKey === "player1" ? attackerZone : defenderZone,
      "player1",
    ),
    p2_deploy: zoneForSide(
      firstPlayerSideKey === "player2" ? attackerZone : defenderZone,
      "player2",
    ),
  };
  layout.deploymentBackEdgeBySide = Object.fromEntries(
    Object.values(layout.deployments).map((zone) => [zone.sideKey, zone.backEdge]),
  );
  layout.attackerSideKey = firstPlayerSideKey;
  layout.defenderSideKey = defenderSideKey;
  return layout;
}

export function buildWarmachineSteamrollerOpeningMapTemplateV1(raw = {}) {
  const scenarioKey = String(raw.scenarioKey || "");
  const mapKey = String(raw.mapKey || "");
  const scenarioTerrainSetupClassKey = String(
    raw.scenarioTerrainSetupClassKey || "",
  );
  const firstPlayerSideKey = String(raw.firstPlayerSideKey || "player1");
  const sourceLayout = warmachineSteamroller2026OfficialScenarioLayoutV1(scenarioKey);
  if (!raw.templateRoom || !raw.baseTemplateHash || !mapKey) {
    throw new Error("steamroller_opening_map_template_source_incomplete");
  }
  const topologyAudit = raw.topologyAudit || null;
  if (topologyAudit && (topologyAudit.ok !== true ||
      String(topologyAudit.mapKey || "") !== mapKey ||
      !topologyAudit.topologyAuditHash)) {
    throw new Error(`steamroller_opening_map_topology_audit_invalid:${mapKey}`);
  }
  if (!sourceLayout?.deploymentGeometryExactWithinScope) {
    throw new Error(`steamroller_opening_deployment_layout_unavailable:${scenarioKey}`);
  }
  const layout = orientWarmachineSteamrollerDeploymentLayoutV1(
    sourceLayout,
    firstPlayerSideKey,
  );
  const templateRoom = structuredClone(raw.templateRoom);
  templateRoom.shapes = Object.fromEntries(Object.entries(templateRoom.shapes || {})
    .filter(([, shape]) => shape?.scenario !== true)
    .filter(([shapeKey]) =>
      scenarioTerrainSetupClassKey !== "all_flags_fallback_no_valid_terrain" ||
      shapeKey !== "center_obstruction"));
  templateRoom.deployments = structuredClone(layout.deployments);
  const identity = stableGraphValue({
    schemaVersion: WARMACHINE_STEAMROLLER_OPENING_MAP_TEMPLATE_V1_SCHEMA,
    baseTemplateHash: String(raw.baseTemplateHash),
    officialScenarioLayoutHash: layout.sha256,
    scenarioKey,
    mapKey,
    firstPlayerSideKey,
    scenarioTerrainSetupClassKey,
    topologyAuditHash: String(topologyAudit?.topologyAuditHash || ""),
    shapes: templateRoom.shapes,
    deployments: templateRoom.deployments,
  });
  return {
    templateRoom,
    templateHash: stableGraphHash(identity),
    templateContentSha256: createHash("sha256")
      .update(JSON.stringify(templateRoom)).digest("hex"),
    sourceKind: "scenario_compatible_realization_of_declared_topology_profile",
    scenarioKey,
    firstPlayerSideKey,
    scenarioTerrainSetupClassKey,
    topologyAudit: topologyAudit ? stableGraphValue(topologyAudit) : null,
    topologyAuditHash: String(topologyAudit?.topologyAuditHash || ""),
    topologyRealizationHash: String(raw.topologyRealizationHash || ""),
    officialScenarioLayoutHash: layout.sha256,
  };
}
