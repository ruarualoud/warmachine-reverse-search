import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_DECLARED_MAP_TOPOLOGY_REALIZATION_V1_SCHEMA =
  "warmachine_declared_map_topology_realization_v1";
export const WARMACHINE_DECLARED_MAP_TOPOLOGY_AUDIT_V1_SCHEMA =
  "warmachine_declared_map_topology_audit_v1";

const BOARD_WIDTH_IN = 48;
const BOARD_HEIGHT_IN = 48;
const REFERENCE_BASE_RADIUS_IN = 1;

const EXPECTED_TOPOLOGY_BY_MAP_KEY = Object.freeze({
  open_lanes: Object.freeze({
    laneOpenness: "high",
    losBlocking: "low",
    movementChokepoints: "low",
    roughTerrainLoad: "low",
  }),
  mixed_table: Object.freeze({
    laneOpenness: "medium",
    losBlocking: "medium",
    movementChokepoints: "medium",
    roughTerrainLoad: "medium",
  }),
  dense_chokepoints: Object.freeze({
    laneOpenness: "low",
    losBlocking: "high",
    movementChokepoints: "high",
    roughTerrainLoad: "high",
  }),
});

const METRIC_BANDS_BY_MAP_KEY = Object.freeze({
  open_lanes: Object.freeze({
    laneOpenness: Object.freeze([0.9, 1]),
    losBlocking: Object.freeze([0, 0.1]),
    movementChokepoints: Object.freeze([0, 0.15]),
    roughTerrainLoad: Object.freeze([0, 0.01]),
  }),
  mixed_table: Object.freeze({
    laneOpenness: Object.freeze([0.7, 0.9]),
    losBlocking: Object.freeze([0.1, 0.3]),
    movementChokepoints: Object.freeze([0.15, 0.4]),
    roughTerrainLoad: Object.freeze([0.01, 0.03]),
  }),
  dense_chokepoints: Object.freeze({
    laneOpenness: Object.freeze([0, 0.45]),
    losBlocking: Object.freeze([0.55, 1]),
    movementChokepoints: Object.freeze([0.6, 1]),
    roughTerrainLoad: Object.freeze([0.04, 1]),
  }),
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 9) {
  const scale = 10 ** digits;
  return Math.round((numeric(value) + Number.EPSILON) * scale) / scale;
}

function terrainShape(id, raw = {}) {
  return {
    id,
    type: "Rect",
    label: String(raw.label || id),
    x: numeric(raw.x),
    y: numeric(raw.y),
    width: numeric(raw.width),
    height: numeric(raw.height),
    blocksMovement: raw.blocksMovement === true,
    blocksLineOfSight: raw.blocksLineOfSight === true,
    roughTerrain: raw.roughTerrain === true,
    movementCostMultiplier: raw.roughTerrain === true ? 2 : 1,
    exactWithinScope: true,
    strictTerrainSpecificRulesMapped: true,
  };
}

function openLaneTerrain() {
  return {
    center_obstruction: terrainShape("center_obstruction", {
      label: "Central Obstruction",
      x: 24,
      y: 24,
      width: 2,
      height: 5,
      blocksMovement: true,
      blocksLineOfSight: true,
    }),
    west_hill: terrainShape("west_hill", {
      label: "West Hill",
      x: 9,
      y: 17,
      width: 8,
      height: 4,
    }),
    east_hill: terrainShape("east_hill", {
      label: "East Hill",
      x: 39,
      y: 31,
      width: 8,
      height: 4,
    }),
    west_shallow_water: terrainShape("west_shallow_water", {
      label: "West Shallow Water",
      x: 6,
      y: 31,
      width: 4,
      height: 2,
      roughTerrain: true,
    }),
  };
}

function denseTerrain() {
  const shapes = {
    center_obstruction: terrainShape("center_obstruction", {
      label: "Central Obstruction",
      x: 24,
      y: 24,
      width: 2,
      height: 5,
      blocksMovement: true,
      blocksLineOfSight: true,
    }),
  };
  for (const [index, x] of [4, 14, 24, 34, 44].entries()) {
    const id = `north_wall_${index + 1}`;
    shapes[id] = terrainShape(id, {
      label: `North Blocking Wall ${index + 1}`,
      x,
      y: 16,
      width: 6,
      height: 2,
      blocksMovement: true,
      blocksLineOfSight: true,
    });
  }
  for (const [index, x] of [9, 21, 33, 43].entries()) {
    const id = `south_forest_${index + 1}`;
    shapes[id] = terrainShape(id, {
      label: `South Rough Forest ${index + 1}`,
      x,
      y: 32,
      width: 8,
      height: 4,
      blocksLineOfSight: true,
      roughTerrain: true,
    });
  }
  return shapes;
}

function rect(shape = {}) {
  const width = numeric(shape.width ?? shape.widthIn);
  const height = numeric(shape.height ?? shape.heightIn);
  const x = numeric(shape.x ?? shape.center?.xIn, 24);
  const y = numeric(shape.y ?? shape.center?.yIn, 24);
  return {
    left: x - width / 2,
    right: x + width / 2,
    top: y - height / 2,
    bottom: y + height / 2,
    width,
    height,
  };
}

function mergeIntervals(intervals = [], minimum = 0, maximum = BOARD_WIDTH_IN) {
  const rows = intervals.map(([left, right]) => [
    Math.max(minimum, numeric(left)),
    Math.min(maximum, numeric(right)),
  ]).filter(([left, right]) => right > left)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged = [];
  for (const row of rows) {
    const tail = merged[merged.length - 1];
    if (!tail || row[0] > tail[1]) merged.push([...row]);
    else tail[1] = Math.max(tail[1], row[1]);
  }
  return merged;
}

function intervalLength(intervals = []) {
  return intervals.reduce((total, [left, right]) => total + right - left, 0);
}

function overlap(left = {}, right = {}) {
  const a = rect(left);
  const b = rect(right);
  return a.left < b.right && a.right > b.left && a.top < b.bottom &&
    a.bottom > b.top;
}

function inBand(value, [minimum, maximum]) {
  return value >= minimum - 1e-9 && value <= maximum + 1e-9;
}

function terrainRows(templateRoom = {}) {
  return Object.values(templateRoom.shapes || {}).filter((shape) =>
    shape?.scenario !== true);
}

export function auditWarmachineDeclaredMapTopologyV1(raw = {}) {
  const mapKey = String(raw.mapKey || "");
  const mapProfile = raw.mapProfile || {};
  const expectedTopology = EXPECTED_TOPOLOGY_BY_MAP_KEY[mapKey];
  const bands = METRIC_BANDS_BY_MAP_KEY[mapKey];
  if (!expectedTopology || !bands) {
    throw new Error(`declared_map_topology_profile_unsupported:${mapKey}`);
  }
  const room = raw.templateRoom || {};
  const boardWidthIn = numeric(room.game?.width, BOARD_WIDTH_IN);
  const boardHeightIn = numeric(room.game?.height, BOARD_HEIGHT_IN);
  const terrain = terrainRows(room);
  const geometryRows = terrain.map((shape) => ({ shape, rect: rect(shape) }));
  const outOfBoundsTerrainKeys = geometryRows.filter(({ rect: bounds }) =>
    bounds.width <= 0 || bounds.height <= 0 || bounds.left < 0 || bounds.top < 0 ||
    bounds.right > boardWidthIn || bounds.bottom > boardHeightIn)
    .map(({ shape }) => String(shape.id || shape.key || shape.label || ""));
  const overlappingTerrainPairs = [];
  for (let leftIndex = 0; leftIndex < terrain.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < terrain.length; rightIndex += 1) {
      if (overlap(terrain[leftIndex], terrain[rightIndex])) {
        overlappingTerrainPairs.push([
          String(terrain[leftIndex].id || terrain[leftIndex].label || leftIndex),
          String(terrain[rightIndex].id || terrain[rightIndex].label || rightIndex),
        ]);
      }
    }
  }
  const losProjection = mergeIntervals(terrain.filter((shape) =>
    shape.blocksLineOfSight === true).map((shape) => {
    const bounds = rect(shape);
    return [bounds.left, bounds.right];
  }), 0, boardWidthIn);
  const losBlocking = round(intervalLength(losProjection) / boardWidthIn);
  const laneOpenness = round(1 - losBlocking);
  const movementSampleY = [...new Set(terrain.filter((shape) =>
    shape.blocksMovement === true).flatMap((shape) => {
    const bounds = rect(shape);
    return [bounds.top, (bounds.top + bounds.bottom) / 2, bounds.bottom];
  }))].sort((left, right) => left - right);
  let maximumMovementBlockFraction = 0;
  let maximumMovementBlockYIn = null;
  for (const yIn of movementSampleY) {
    const intervals = terrain.filter((shape) => {
      if (shape.blocksMovement !== true) return false;
      const bounds = rect(shape);
      return yIn >= bounds.top - 1e-9 && yIn <= bounds.bottom + 1e-9;
    }).map((shape) => {
      const bounds = rect(shape);
      return [
        bounds.left - REFERENCE_BASE_RADIUS_IN,
        bounds.right + REFERENCE_BASE_RADIUS_IN,
      ];
    });
    const fraction = intervalLength(mergeIntervals(
      intervals,
      0,
      boardWidthIn,
    )) / boardWidthIn;
    if (fraction > maximumMovementBlockFraction) {
      maximumMovementBlockFraction = fraction;
      maximumMovementBlockYIn = yIn;
    }
  }
  const movementChokepoints = round(maximumMovementBlockFraction);
  const roughAreaIn2 = terrain.filter((shape) => shape.roughTerrain === true)
    .reduce((total, shape) => {
      const bounds = rect(shape);
      return total + bounds.width * bounds.height;
    }, 0);
  const roughTerrainLoad = round(roughAreaIn2 / (boardWidthIn * boardHeightIn));
  const observedTopology = {
    laneOpenness,
    losBlocking,
    movementChokepoints,
    roughTerrainLoad,
  };
  const declaredTopology = stableGraphValue(mapProfile.terrainTopology || {});
  const topologyContractMatches = Object.entries(expectedTopology).every(
    ([key, value]) => declaredTopology[key] === value,
  );
  const metricChecks = Object.fromEntries(Object.entries(observedTopology).map(
    ([metricKey, value]) => [metricKey, {
      value,
      minimum: bands[metricKey][0],
      maximum: bands[metricKey][1],
      passed: inBand(value, bands[metricKey]),
    }],
  ));
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_DECLARED_MAP_TOPOLOGY_AUDIT_V1_SCHEMA,
    mapKey,
    mapProfileLabel: String(mapProfile.label || ""),
    sourceKind: String(mapProfile.sourceKind || ""),
    expectedTopology,
    declaredTopology,
    topologyContractMatches,
    board: { widthIn: boardWidthIn, heightIn: boardHeightIn },
    terrainCount: terrain.length,
    terrainKeys: terrain.map((shape) => String(shape.id || shape.label || "")).sort(),
    outOfBoundsTerrainKeys,
    overlappingTerrainPairs,
    observedTopology,
    metricChecks,
    movementChokepointWitnessYIn: maximumMovementBlockYIn,
    measurementContract: {
      laneOpenness: "one_minus_union_of_north_south_los_blocker_x_projections",
      losBlocking: "union_of_north_south_los_blocker_x_projections",
      movementChokepoints:
        "maximum_horizontal_blocked_fraction_with_one_inch_reference_base_radius",
      roughTerrainLoad: "nonoverlapping_rough_terrain_area_divided_by_board_area",
      continuousPathReachabilityClaimed: false,
    },
    ok: topologyContractMatches && outOfBoundsTerrainKeys.length === 0 &&
      overlappingTerrainPairs.length === 0 &&
      Object.values(metricChecks).every((row) => row.passed),
    claimBoundary: "The audit certifies one finite exact terrain realization against the declared topology bands. It is not a probability distribution over tournament tables and does not replace strict movement, LOS, placement or scenario-terrain execution.",
  });
  return { ...core, topologyAuditHash: stableGraphHash(core) };
}

export function buildWarmachineDeclaredMapTopologyRealizationV1(raw = {}) {
  const mapProfile = raw.mapProfile || {};
  const mapKey = String(mapProfile.mapKey || raw.mapKey || "");
  if (!raw.templateRoom || !raw.baseTemplateHash) {
    throw new Error("declared_map_topology_realization_source_incomplete");
  }
  const templateRoom = structuredClone(raw.templateRoom);
  const scenarioShapes = Object.fromEntries(Object.entries(templateRoom.shapes || {})
    .filter(([, shape]) => shape?.scenario === true));
  let terrainShapes;
  if (mapKey === "mixed_table") {
    terrainShapes = Object.fromEntries(Object.entries(templateRoom.shapes || {})
      .filter(([, shape]) => shape?.scenario !== true)
      .map(([key, shape]) => [key, structuredClone(shape)]));
  } else if (mapKey === "open_lanes") {
    terrainShapes = openLaneTerrain();
  } else if (mapKey === "dense_chokepoints") {
    terrainShapes = denseTerrain();
  } else {
    throw new Error(`declared_map_topology_profile_unsupported:${mapKey}`);
  }
  templateRoom.shapes = { ...scenarioShapes, ...terrainShapes };
  const topologyAudit = auditWarmachineDeclaredMapTopologyV1({
    mapKey,
    mapProfile,
    templateRoom,
  });
  if (!topologyAudit.ok) {
    throw new Error(`declared_map_topology_audit_failed:${mapKey}:${
      topologyAudit.topologyAuditHash}`);
  }
  const core = stableGraphValue({
    schemaVersion: WARMACHINE_DECLARED_MAP_TOPOLOGY_REALIZATION_V1_SCHEMA,
    mapKey,
    baseTemplateHash: String(raw.baseTemplateHash),
    topologyAuditHash: topologyAudit.topologyAuditHash,
    terrainShapes,
    sourceKind: "finite_exact_realization_of_declared_topology_profile",
    naturalMapDistributionClaimed: false,
  });
  return {
    ...core,
    realizationHash: stableGraphHash(core),
    templateRoom,
    topologyAudit,
  };
}

export const WARMACHINE_DECLARED_MAP_TOPOLOGY_BANDS_V1 =
  METRIC_BANDS_BY_MAP_KEY;
