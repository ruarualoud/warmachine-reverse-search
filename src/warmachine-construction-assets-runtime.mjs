import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveWarmachineEngineRoot } from "./upstream-project-d.mjs";

export const WARMACHINE_FORCE_BUILDER_RELATIVE_PATH =
  "android-shell/assets/companion/force-builder.js";
export const WARMACHINE_CARD_DATA_RELATIVE_PATH =
  "android-shell/assets/default/warmachine-lite-data.json";

export function resolveWarmachineEnginePath(relativePath = "") {
  return path.join(resolveWarmachineEngineRoot(), relativePath);
}

export async function loadWarmachineForceBuilder() {
  globalThis.window = globalThis;
  await import(pathToFileURL(
    resolveWarmachineEnginePath(WARMACHINE_FORCE_BUILDER_RELATIVE_PATH),
  ).href);
  if (!globalThis.WarmachineForceBuilder) {
    throw new Error("warmachine_force_builder_contract_missing");
  }
  return globalThis.WarmachineForceBuilder;
}

export async function loadWarmachineCardData() {
  return JSON.parse(await readFile(
    resolveWarmachineEnginePath(WARMACHINE_CARD_DATA_RELATIVE_PATH),
    "utf8",
  ));
}
