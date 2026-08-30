import { stableGraphHash } from "../graph/typed-facts-v2.mjs";
import { normalizeRulesV1State } from "../warmachine-host-runtime.mjs";

function stripPathStateKeySuffix(stateKey = "") {
  return String(stateKey).replace(/:path:[a-f0-9]{16}/gi, "");
}

export function projectWarmachineBenchmarkGameStateV2(stateInput = {}) {
  const state = structuredClone(normalizeRulesV1State(stateInput));
  delete state.explicitMovementPaths;
  state.stateKey = stripPathStateKeySuffix(state.stateKey);
  for (const piece of state.pieces || []) {
    delete piece.explicitMovementPaths;
    if (piece.metadata && typeof piece.metadata === "object") {
      delete piece.metadata.explicitMovementPaths;
    }
  }
  return normalizeRulesV1State(state);
}

export function warmachineBenchmarkGameStateHashV2(stateInput = {}) {
  return stableGraphHash(projectWarmachineBenchmarkGameStateV2(stateInput));
}
