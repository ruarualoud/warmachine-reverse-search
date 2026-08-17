import { readFileSync } from "node:fs";

const BASELINE_URL = new URL(
  "../../config/warmachine-ruleset-baseline-v1.json",
  import.meta.url,
);

export const warmachineRulesetBaselineV1 = Object.freeze(
  JSON.parse(readFileSync(BASELINE_URL, "utf8")),
);

export const WARMACHINE_RULESET_BASELINE_V1_SCHEMA =
  warmachineRulesetBaselineV1.schemaVersion;
