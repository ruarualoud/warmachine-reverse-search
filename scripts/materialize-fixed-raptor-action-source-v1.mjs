#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { materializeWarmachineFixedRaptorActionSourceV1 } from
  "../src/benchmark/fixed-raptor-action-source-v1.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routeCachePath = path.resolve(
  process.env.WARMACHINE_RAPTOR_ROUTE_CACHE ||
    path.join(
      projectRoot,
      ".scratch/fixed-steamroller-assassination-probability-checkpoint-center_break-v2.json",
    ),
);
const outputPath = path.resolve(
  process.env.WARMACHINE_RAPTOR_ACTION_SOURCE_OUTPUT ||
    path.join(projectRoot, ".scratch/current-host-raptor-nymara-action-source-v1.json"),
);
if (!fs.existsSync(routeCachePath)) {
  throw new Error(`fixed_raptor_route_cache_missing:${routeCachePath}`);
}
const cached = JSON.parse(fs.readFileSync(routeCachePath, "utf8"));
const source = materializeWarmachineFixedRaptorActionSourceV1(cached.route || {});
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(source, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  ok: true,
  outputPath,
  sourceHash: source.sourceHash,
  hostReceiptHash: source.hostReceiptHash,
  routeTransitionCount: source.routeTransitionCount,
  sourceStateHash: source.sourceStateHash,
  legalTargetActionCount: source.legalTargetActionCount,
  legalTargetActions: source.legalTargetActions.map((action) => ({
    actionKey: action.actionKey,
    actionType: action.actionType,
    expectedDamage: action.expectedDamage,
  })),
}, null, 2)}\n`);
