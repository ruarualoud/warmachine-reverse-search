import { stableGraphHash } from "../graph/typed-facts-v2.mjs";
import { normalizeRulesV1State } from "../warmachine-host-runtime.mjs";

function semanticProjection(value, key = "") {
  if (Array.isArray(value)) {
    const projected = value.map((entry) => semanticProjection(entry));
    if (key === "terrain") {
      return projected.sort((left, right) =>
        String(left?.terrainKey || "").localeCompare(String(right?.terrainKey || "")));
    }
    return projected;
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([childKey, child]) =>
      childKey !== "stateKey" &&
      childKey !== "explicitMovementPaths" && !(
        childKey === "upkeepsPaidThisControlPhase" &&
        Array.isArray(child) && child.length === 0
      ))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([childKey, child]) => [childKey, semanticProjection(child, childKey || key)]));
}

function canonicalContinuousMovementActionKey(value = "") {
  return String(value).replace(
    /^([^:]+):((?:advance|run)(?:-auto)?-path):[^:]+:(v\d+)$/,
    "$1:$2:<continuous-path-choice>:$3",
  );
}

function ruleBehaviorProjection(value, key = "") {
  if (Array.isArray(value)) {
    const projected = value.map((entry) => ruleBehaviorProjection(entry, key));
    if (key === "terrain") {
      return projected.sort((left, right) =>
        String(left?.terrainKey || "").localeCompare(String(right?.terrainKey || "")));
    }
    if (key === "sourceActionKeys") {
      return [...new Set(projected.map(String))].sort();
    }
    return projected;
  }
  if (!value || typeof value !== "object") {
    return key === "sourceActionKey" || key === "sourceActionKeys"
      ? canonicalContinuousMovementActionKey(value)
      : value;
  }
  return Object.fromEntries(Object.entries(value)
    .filter(([childKey, child]) =>
      childKey !== "stateKey" &&
      childKey !== "explicitMovementPaths" && !(
        childKey === "upkeepsPaidThisControlPhase" &&
        Array.isArray(child) && child.length === 0
      ))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([childKey, child]) => [
      childKey,
      ruleBehaviorProjection(child, childKey || key),
    ]));
}

export function warmachineReverseStateSemanticHashV1(stateInput = {}) {
  return stableGraphHash(semanticProjection(normalizeRulesV1State(stateInput)));
}

export function warmachineRuleBehaviorStateProjectionV1(stateInput = {}) {
  return ruleBehaviorProjection(normalizeRulesV1State(stateInput));
}

export function warmachineRuleBehaviorStateHashV1(stateInput = {}) {
  return stableGraphHash(warmachineRuleBehaviorStateProjectionV1(stateInput));
}
