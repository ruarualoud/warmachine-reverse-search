import { loadWarmachineConstructionHost } from "./upstream-project-d.mjs";

export const warmachineConstructionHost = await loadWarmachineConstructionHost();

export const {
  auditDeploymentTokens,
  buildHeuristicDeploymentPlan,
  buildRosterTokens,
} = warmachineConstructionHost.deployment;

export const {
  buildWarmachineFormationRuleInteractionProfile,
  evaluateWarmachineFormationEffectiveness,
} = warmachineConstructionHost.formation;

export const {
  WARMACHINE_RULES_V1_RUNTIME_WINDOW_FIELDS,
  buildWarmachineRulesV1StateFromLayer3Room,
} = warmachineConstructionHost.core.adapter;
