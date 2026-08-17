export const WARMACHINE_SEARCH_CONSOLE_OFFICIAL_SCENARIO_ASSETS_V1_SCHEMA =
  "warmachine_search_console_official_scenario_assets_v1";

import {
  WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_LAYOUTS_V1,
  WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_SOURCE_V1,
} from "../contracts/steamroller-2026-official-scenario-layout-v1.mjs";

export const WARMACHINE_SEARCH_CONSOLE_OFFICIAL_SCENARIO_ASSETS_V1 = Object.freeze(
  Object.fromEntries(Object.entries(
    WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_LAYOUTS_V1,
  ).map(([scenarioKey, layout]) => [
    scenarioKey,
    Object.freeze({
      schemaVersion: WARMACHINE_SEARCH_CONSOLE_OFFICIAL_SCENARIO_ASSETS_V1_SCHEMA,
      scenarioKey,
      scenarioNumber: layout.scenarioNumber,
      assetUrl: `/assets/scenarios/steamroller-2026-map-${layout.scenarioNumber}.png`,
      sha256: layout.sha256,
      sourceMemberPath: layout.sourceMemberPath ||
        `Media/Publications/OrganizedPlay/WM-Steamroller-2026-JanuaryRules-Map${layout.scenarioNumber}.png`,
      officialGeometryBound: layout.geometryExactWithinBranch === true,
      scenarioElementPlacementBranch: layout.scenarioElementPlacementBranch,
      ...WARMACHINE_STEAMROLLER_2026_OFFICIAL_SCENARIO_SOURCE_V1,
    }),
  ])),
);
