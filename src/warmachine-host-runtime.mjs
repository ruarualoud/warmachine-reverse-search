import { loadWarmachineHost } from "./upstream-project-d.mjs";
import path from "node:path";

export const warmachineHost = await loadWarmachineHost();

export const {
  recognizedWarmachineRuleAtomByAtomKey,
  recognizedWarmachineRuleAtoms,
  warmachineRuleAtomSourceContractStatus,
} = warmachineHost.atoms;

export const {
  applyRulesV1Action,
  auditRulesV1StaticPlacement,
  auditRulesV1StaticUnitFormation,
  auditRulesV1SteamrollerScenarioTerrainSetup,
  buildRulesV1GeneratedMovementTargetPlan,
  closestPointDistanceIn,
  enumerateRulesV1Actions,
  normalizeRulesV1State,
  scoreScenarioElements,
  WARMACHINE_ENUMERATION_ATTACK_SEQUENCE_KEYS,
  WARMACHINE_ENUMERATION_BOOST_CONFIGURATION_KEYS,
  WARMACHINE_ENUMERATION_MOVEMENT_PATH_KIND_KEYS,
} = warmachineHost.rules;

export const {
  buildWarmachineRulesV1StateFromLayer3Room,
  buildWarmachineRulesV1ActionWithStrictRngOutcome,
  strictOpponentReactionRequirementsForAction,
} = warmachineHost.adapter;

export const {
  enumerateWarmachineExactD6EquivalenceClasses,
  warmachineExactPrimaryAttackTerminalProbability,
} = warmachineHost.probability;

export const {
  WARMACHINE_STEAMROLLER_2026_SCHEMA,
  steamroller2026ScenarioKey,
  steamroller2026ScenarioProfile,
  steamroller2026ScenarioProfiles,
} = warmachineHost.steamroller;

export function resolveWarmachineHostPath(relativePath = "") {
  return path.join(warmachineHost.receipt.projectDRoot, relativePath);
}
