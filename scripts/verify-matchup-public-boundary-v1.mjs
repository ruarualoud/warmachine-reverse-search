#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildWarmachineActivationGroups as buildLocalActivationGroups,
  evaluateWarmachineMatchupState as evaluateLocalState,
} from "../src/search/matchup-search-v1.mjs";
import {
  loadLegacyReverseSearchModules,
  resolveWarmachineEngineRoot,
} from "../src/upstream-project-d.mjs";
import {
  materializeRulesV1ParameterizedLifecycleReplacementAction,
  normalizeRulesV1State,
} from "../src/warmachine-host-runtime.mjs";

const forgedSchemaState = {
  schemaVersion: "forged_or_stale_matchup_state_v0",
  stateKey: "forged-schema-must-normalize",
  activeSideKey: "player1",
  phaseKey: "activation",
  turnNumber: 2,
  strictMode: true,
  board: { widthIn: 48, heightIn: 48 },
  pieces: [{
    pieceKey: "leader",
    label: "Leader",
    sideKey: "player1",
    modelRole: "warcaster",
    position: { xIn: 8, yIn: 8 },
    damage: { boxesRemaining: 12, maxBoxes: 12 },
  }],
  terrain: [],
  scenario: { zones: [], flags: [], score: { player1: 0, player2: 0 } },
};
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const originalEngineRoot = process.env.WARMACHINE_ENGINE_ROOT;
const originalProjectDRoot = process.env.WARMACHINE_PROJECT_D_ROOT;
delete process.env.WARMACHINE_ENGINE_ROOT;
delete process.env.WARMACHINE_PROJECT_D_ROOT;
assert.equal(
  resolveWarmachineEngineRoot(),
  path.resolve(repositoryRoot, "..", "warmachine-strict-engine"),
  "default Host resolution must bind the independent strict Engine repository only",
);
if (originalEngineRoot == null) delete process.env.WARMACHINE_ENGINE_ROOT;
else process.env.WARMACHINE_ENGINE_ROOT = originalEngineRoot;
if (originalProjectDRoot == null) delete process.env.WARMACHINE_PROJECT_D_ROOT;
else process.env.WARMACHINE_PROJECT_D_ROOT = originalProjectDRoot;
const normalized = normalizeRulesV1State(forgedSchemaState);
assert.equal(
  typeof materializeRulesV1ParameterizedLifecycleReplacementAction,
  "function",
  "Search Host must expose the Engine's parameterized lifecycle replacement boundary",
);
const expectedEvaluation = evaluateLocalState(normalized, { perspectiveSideKey: "player1" });
const expectedGroups = buildLocalActivationGroups(normalized);

assert.deepEqual(
  evaluateLocalState(forgedSchemaState, { perspectiveSideKey: "player1" }),
  expectedEvaluation,
  "public evaluation must normalize a forged or stale schema instead of trusting its tag",
);
assert.deepEqual(
  buildLocalActivationGroups(forgedSchemaState),
  expectedGroups,
  "public activation grouping must normalize a forged or stale schema instead of trusting its tag",
);

const { modules } = await loadLegacyReverseSearchModules({ moduleKeys: ["matchupSearch"] });
assert.deepEqual(
  modules.matchupSearch.evaluateWarmachineMatchupState(
    forgedSchemaState,
    { perspectiveSideKey: "player1" },
  ),
  expectedEvaluation,
  "strict Engine compatibility entry must enforce the same normalization boundary",
);
assert.deepEqual(
  modules.matchupSearch.buildWarmachineActivationGroups(forgedSchemaState),
  expectedGroups,
  "strict Engine compatibility grouping must enforce the same normalization boundary",
);

console.log(JSON.stringify({
  ok: true,
  verifier: "matchup-public-boundary-v1",
  forgedSchemaVersion: forgedSchemaState.schemaVersion,
  normalizedSchemaVersion: normalized.schemaVersion,
  activationGroupCount: expectedGroups.length,
}, null, 2));
