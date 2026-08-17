export const WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_LAYOUT_V1_SCHEMA =
  "warmachine_steamroller_2026_official_scenario_layout_v1";

export const WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_SOURCE_V1 = Object.freeze({
  sourceKind: "official_steamroller_2026_publication_media",
  sourceArchiveName: "media publication steamroller 2026.zip",
  sourceArchiveSha256: "10abc84e7f5feb5dbeff721aa378440a8e825191a9614843b2eb4a846c00fef8",
  sourcePublicationText: "warmachine_data/publications/other/steamroller_2026.txt",
  sourcePublicationTextSha256: "992e499267cf37d705223fb980e7a524b9f5f274495883e35d59eae65ab3bf96",
  coreRulesPublicationText: "warmachine_data/publications/other/warmachine_mkiv_rules.txt",
  coreRulesPublicationTextSha256: "bf7ad8f97279644febd1602e30d85ecb71e780dbde96d3534277fc73345ea377",
  battlefieldSourceRectPx: Object.freeze({ x: 24, y: 24, width: 976, height: 976 }),
  coordinateConvention: "x_west_to_east_y_south_to_north",
  measurementConvention: "diagram_distances_are_table_edge_to_base_edge",
  deploymentConvention: "attacker_red_south_6in_defender_blue_north_11in",
});

const MAP_METADATA = Object.freeze({
  trench_warfare: Object.freeze({ scenarioNumber: 1, scenarioName: "Trench Warfare", sha256: "a49bf8f09e7294e5e3977458369f63bb7c5caa03dc0a728132dbd39a50feb547" }),
  two_fronts: Object.freeze({ scenarioNumber: 2, scenarioName: "Two Fronts", sha256: "e2089eb41699e6a53485f32bda99c5f80f90d291829b0b4458035c9976dfefde" }),
  wolves_at_our_heels: Object.freeze({ scenarioNumber: 3, scenarioName: "Wolves at Our Heels", sha256: "89b17faef766e925819c778876a5694c5e2763075404a12430f1ab3e0ef49dd6" }),
  pressure_point: Object.freeze({ scenarioNumber: 4, scenarioName: "Pressure Point", sha256: "85bc44a7ae8d21d3d68051e1577700b6900206b48fd3e30425ab547146cdfb5b" }),
  high_stakes: Object.freeze({ scenarioNumber: 5, scenarioName: "High Stakes", sha256: "92b4df1d2ac31308ad44d3fd271271c79967d3e32ac1a8b0e5d26a960fa6db3a" }),
  fault_line: Object.freeze({ scenarioNumber: 6, scenarioName: "Fault Line", sha256: "e504b4749041a086eefd07cc296f9636abb6491c140e481a578c33b23d149be3" }),
  payload: Object.freeze({ scenarioNumber: 7, scenarioName: "Payload", sha256: "bc89904e6207f9f5d9f26e990e6fb3eee907a1ea01ed4f9bd400607b4b2a0841" }),
});

function rounded(value) {
  return Number(value.toFixed(6));
}

function baseRadiusIn(baseSizeMm) {
  return baseSizeMm / 25.4 / 2;
}

function centerFromEdgeMeasurements({
  baseSizeMm,
  xEdge,
  xDistanceIn,
  yEdge,
  yDistanceIn,
}) {
  const radiusIn = baseRadiusIn(baseSizeMm);
  return {
    xIn: rounded(xEdge === "west"
      ? xDistanceIn + radiusIn
      : 48 - xDistanceIn - radiusIn),
    yIn: rounded(yEdge === "south"
      ? yDistanceIn + radiusIn
      : 48 - yDistanceIn - radiusIn),
    edgeMeasurement: {
      xEdge,
      xDistanceIn,
      yEdge,
      yDistanceIn,
      baseSizeMm,
    },
  };
}

function sourceFor(scenarioKey, elementKind) {
  const map = MAP_METADATA[scenarioKey];
  return {
    placementSource: `official_steamroller_2026_map_${map.scenarioNumber}_${elementKind}`,
    sourceMemberPath: `Media/Publications/OrganizedPlay/WM-Steamroller-2026-JanuaryRules-Map${map.scenarioNumber}.png`,
    sourceImageSha256: map.sha256,
  };
}

function objective(scenarioKey, objectiveKey, label, baseSizeMm, measurement, ownerSideKey = "", overrides = {}) {
  return {
    objectiveKey,
    label,
    baseSizeMm,
    ownerSideKey,
    active: true,
    geometryExactWithinScope: true,
    geometryIssues: [],
    ...centerFromEdgeMeasurements({ baseSizeMm, ...measurement }),
    ...sourceFor(scenarioKey, "objective"),
    ...overrides,
  };
}

function flagTerrain(scenarioKey, terrainKey, label, measurement, ownerSideKey = "", overrides = {}) {
  const baseSizeMm = 30;
  const radiusIn = rounded(baseRadiusIn(baseSizeMm));
  return {
    terrainKey,
    label,
    type: "scenario terrain",
    isScenarioTerrain: true,
    isObstruction: true,
    blocksMovement: true,
    blocksLineOfSight: true,
    scenarioTerrainWithinImpossible: true,
    shape: "circle",
    baseSizeMm,
    radiusIn,
    widthIn: rounded(radiusIn * 2),
    heightIn: rounded(radiusIn * 2),
    ownerSideKey,
    active: true,
    geometryExactWithinScope: true,
    geometryIssues: [],
    sourceFlagKey: terrainKey,
    scenarioTerrainSetupChoiceRequired: true,
    scenarioTerrainSetupChoiceResolved: true,
    scenarioTerrainFallbackUsed: true,
    scenarioTerrainSelectionCandidateKeys: [],
    placementMode: "official_flag_obstruction_fallback_no_valid_terrain_within_5in",
    ...centerFromEdgeMeasurements({ baseSizeMm, ...measurement }),
    ...sourceFor(scenarioKey, "flag"),
    ...overrides,
  };
}

function cache(scenarioKey, cacheKey, label, measurement, ownerSideKey = "") {
  const baseSizeMm = 30;
  return {
    cacheKey,
    label,
    baseSizeMm,
    baseSizeIn: rounded(baseSizeMm / 25.4),
    ownerSideKey,
    contestingRangeIn: 3,
    active: true,
    geometryExactWithinScope: true,
    geometryIssues: [],
    ...centerFromEdgeMeasurements({ baseSizeMm, ...measurement }),
    ...sourceFor(scenarioKey, "cache"),
  };
}

function deploymentZones(scenarioKey) {
  return {
    p1_deploy: {
      id: "p1_deploy",
      sideKey: "player1",
      setupRole: "attacker",
      backEdge: "south",
      x: 24,
      y: 3,
      width: 48,
      height: 6,
      geometryExactWithinScope: true,
      ...sourceFor(scenarioKey, "attacker_deployment_zone"),
    },
    p2_deploy: {
      id: "p2_deploy",
      sideKey: "player2",
      setupRole: "defender",
      backEdge: "north",
      x: 24,
      y: 42.5,
      width: 48,
      height: 11,
      geometryExactWithinScope: true,
      ...sourceFor(scenarioKey, "defender_deployment_zone"),
    },
  };
}

function layout(scenarioKey, { objectives = [], terrain = [], caches = [] }) {
  const map = MAP_METADATA[scenarioKey];
  return {
    schemaVersion: WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_LAYOUT_V1_SCHEMA,
    scenarioKey,
    ...map,
    objectives,
    terrain,
    caches,
    deployments: deploymentZones(scenarioKey),
    deploymentBackEdgeBySide: { player1: "south", player2: "north" },
    deploymentGeometryExactWithinScope: true,
    scenarioElementPlacementBranch: "no_valid_terrain_within_5in_flags_are_30mm_obstructions",
    geometryExactWithinBranch: true,
    claimBoundary: "Objective, cache, printed flag fallback centers and the attacker/defender deployment bands are derived from the official scenario diagram. A player-selected Scenario Terrain piece within 5 inches of a flag is a separate setup branch and is not represented by this fallback layout.",
  };
}

const LAYOUTS = {
  trench_warfare: layout("trench_warfare", {
    objectives: [
      objective("trench_warfare", "p2-40", "Blue 40mm", 40, { xEdge: "west", xDistanceIn: 22, yEdge: "north", yDistanceIn: 12 }, "player2"),
      objective("trench_warfare", "p2-50", "Blue 50mm", 50, { xEdge: "west", xDistanceIn: 12, yEdge: "north", yDistanceIn: 21 }, "player2"),
      objective("trench_warfare", "p1-40", "Red 40mm", 40, { xEdge: "east", xDistanceIn: 22, yEdge: "south", yDistanceIn: 14 }, "player1"),
      objective("trench_warfare", "p1-50", "Red 50mm", 50, { xEdge: "east", xDistanceIn: 12, yEdge: "south", yDistanceIn: 25 }, "player1"),
    ],
    terrain: [
      flagTerrain("trench_warfare", "p2-trench", "Blue flag", { xEdge: "east", xDistanceIn: 6, yEdge: "north", yDistanceIn: 15 }, "player2"),
      flagTerrain("trench_warfare", "p1-trench", "Red flag", { xEdge: "west", xDistanceIn: 6, yEdge: "south", yDistanceIn: 17 }, "player1"),
    ],
    caches: [
      cache("trench_warfare", "p2-cache", "Blue cache", { xEdge: "west", xDistanceIn: 20, yEdge: "north", yDistanceIn: 18 }, "player2"),
      cache("trench_warfare", "p1-cache", "Red cache", { xEdge: "east", xDistanceIn: 20, yEdge: "south", yDistanceIn: 22 }, "player1"),
    ],
  }),
  two_fronts: layout("two_fronts", {
    objectives: [
      objective("two_fronts", "left-40", "Blue 40mm", 40, { xEdge: "west", xDistanceIn: 12, yEdge: "north", yDistanceIn: 19 }),
      objective("two_fronts", "right-40", "Red 40mm", 40, { xEdge: "west", xDistanceIn: 8, yEdge: "south", yDistanceIn: 20 }),
      objective("two_fronts", "left-50", "Blue 50mm", 50, { xEdge: "east", xDistanceIn: 12, yEdge: "north", yDistanceIn: 17 }),
      objective("two_fronts", "right-50", "Red 50mm", 50, { xEdge: "east", xDistanceIn: 8, yEdge: "south", yDistanceIn: 19 }),
    ],
    terrain: [
      flagTerrain("two_fronts", "center-terrain", "Blue flag", { xEdge: "west", xDistanceIn: 23, yEdge: "north", yDistanceIn: 24 }, "player2"),
    ],
  }),
  wolves_at_our_heels: layout("wolves_at_our_heels", {
    objectives: [
      objective("wolves_at_our_heels", "p2-40", "Blue 40mm", 40, { xEdge: "east", xDistanceIn: 8, yEdge: "north", yDistanceIn: 15 }, "player2", { linkedObjectiveKey: "p2-50" }),
      objective("wolves_at_our_heels", "p2-50", "Blue 50mm", 50, { xEdge: "east", xDistanceIn: 19, yEdge: "north", yDistanceIn: 20 }, "player2"),
      objective("wolves_at_our_heels", "p1-40", "Red 40mm", 40, { xEdge: "west", xDistanceIn: 8, yEdge: "south", yDistanceIn: 20 }, "player1", { linkedObjectiveKey: "p1-50" }),
      objective("wolves_at_our_heels", "p1-50", "Red 50mm", 50, { xEdge: "west", xDistanceIn: 19, yEdge: "south", yDistanceIn: 24 }, "player1"),
    ],
    terrain: [
      flagTerrain("wolves_at_our_heels", "p2-wolves-terrain", "Blue flag", { xEdge: "west", xDistanceIn: 12, yEdge: "north", yDistanceIn: 20 }, "player2"),
      flagTerrain("wolves_at_our_heels", "p1-wolves-terrain", "Red flag", { xEdge: "east", xDistanceIn: 12, yEdge: "south", yDistanceIn: 20 }, "player1"),
    ],
  }),
  pressure_point: layout("pressure_point", {
    objectives: [
      objective("pressure_point", "center-50", "50mm", 50, { xEdge: "east", xDistanceIn: 23, yEdge: "south", yDistanceIn: 22 }),
    ],
    terrain: [
      flagTerrain("pressure_point", "pressure-a", "North-west flag", { xEdge: "west", xDistanceIn: 12, yEdge: "north", yDistanceIn: 20 }),
      flagTerrain("pressure_point", "pressure-b", "North-east flag", { xEdge: "east", xDistanceIn: 12, yEdge: "north", yDistanceIn: 20 }),
      flagTerrain("pressure_point", "pressure-c", "South-west flag", { xEdge: "west", xDistanceIn: 6, yEdge: "north", yDistanceIn: 31 }),
      flagTerrain("pressure_point", "pressure-d", "South-east flag", { xEdge: "east", xDistanceIn: 6, yEdge: "north", yDistanceIn: 31 }),
    ],
  }),
  high_stakes: layout("high_stakes", {
    objectives: [
      objective("high_stakes", "center-50", "50mm", 50, { xEdge: "east", xDistanceIn: 23, yEdge: "north", yDistanceIn: 22 }),
      objective("high_stakes", "left-40", "Red 40mm", 40, { xEdge: "west", xDistanceIn: 14, yEdge: "south", yDistanceIn: 18 }),
      objective("high_stakes", "right-40", "Blue 40mm", 40, { xEdge: "east", xDistanceIn: 14, yEdge: "north", yDistanceIn: 17 }),
    ],
    terrain: [
      flagTerrain("high_stakes", "blue-fuse", "Blue flag", { xEdge: "west", xDistanceIn: 8, yEdge: "north", yDistanceIn: 23 }, "player2"),
      flagTerrain("high_stakes", "red-fuse", "Red flag", { xEdge: "east", xDistanceIn: 8, yEdge: "south", yDistanceIn: 20 }, "player1"),
    ],
  }),
  fault_line: layout("fault_line", {
    objectives: [
      objective("fault_line", "p2-40-a", "Blue left 40mm", 40, { xEdge: "west", xDistanceIn: 8, yEdge: "north", yDistanceIn: 25 }, "player2"),
      objective("fault_line", "p2-40-b", "Blue right 40mm", 40, { xEdge: "east", xDistanceIn: 8, yEdge: "north", yDistanceIn: 15 }, "player2"),
      objective("fault_line", "p2-50", "Blue 50mm", 50, { xEdge: "east", xDistanceIn: 23, yEdge: "north", yDistanceIn: 20 }, "player2"),
      objective("fault_line", "p1-40-a", "Red left 40mm", 40, { xEdge: "west", xDistanceIn: 8, yEdge: "south", yDistanceIn: 15 }, "player1"),
      objective("fault_line", "p1-40-b", "Red right 40mm", 40, { xEdge: "east", xDistanceIn: 8, yEdge: "south", yDistanceIn: 25 }, "player1"),
      objective("fault_line", "p1-50", "Red 50mm", 50, { xEdge: "west", xDistanceIn: 23, yEdge: "south", yDistanceIn: 20 }, "player1"),
    ],
  }),
  payload: layout("payload", {
    objectives: [
      objective("payload", "p2-payload", "Blue 50mm payload", 50, { xEdge: "west", xDistanceIn: 9, yEdge: "north", yDistanceIn: 16 }, "player2", { deliveryTerrainKey: "p1-payload-terrain" }),
      objective("payload", "p2-40", "Blue 40mm", 40, { xEdge: "west", xDistanceIn: 20, yEdge: "north", yDistanceIn: 20 }, "player2"),
      objective("payload", "p1-40", "Red 40mm", 40, { xEdge: "east", xDistanceIn: 20, yEdge: "south", yDistanceIn: 20 }, "player1"),
      objective("payload", "p1-payload", "Red 50mm payload", 50, { xEdge: "east", xDistanceIn: 9, yEdge: "south", yDistanceIn: 16 }, "player1", { deliveryTerrainKey: "p2-payload-terrain" }),
    ],
    terrain: [
      flagTerrain("payload", "p2-payload-terrain", "Blue flag", { xEdge: "east", xDistanceIn: 16, yEdge: "north", yDistanceIn: 19 }, "player2"),
      flagTerrain("payload", "p1-payload-terrain", "Red flag", { xEdge: "west", xDistanceIn: 16, yEdge: "south", yDistanceIn: 19 }, "player1"),
    ],
  }),
};

export const WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_LAYOUTS_V1 =
  Object.freeze(Object.fromEntries(Object.entries(LAYOUTS).map(([key, value]) => [
    key,
    Object.freeze(value),
  ])));

export function warmachineSteamroller2026OfficialScenarioLayoutV1(scenarioKey = "") {
  const layoutValue = WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_LAYOUTS_V1[
    String(scenarioKey || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")
  ];
  return layoutValue ? structuredClone(layoutValue) : null;
}
