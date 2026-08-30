import { executeScopedWarmachineBenchmarkActionV2 } from
  "../benchmark/fixed-steamroller-benchmark-v2.mjs";
import {
  buildWarmachineExactPostResponseChanceClassesV1,
  warmachineExactChanceClassActionPatch,
} from "./chance-outcomes-v1.mjs";

export const WARMACHINE_POST_RESPONSE_CHANCE_EXECUTION_V1_SCHEMA =
  "warmachine_post_response_chance_execution_v1";

export function executeWarmachineExactPostResponseChanceV1(
  scoped = {},
  action = {},
  response = {},
  primaryChanceClass = {},
  rawOptions = {},
) {
  const chance = buildWarmachineExactPostResponseChanceClassesV1(
    action,
    response,
    primaryChanceClass,
    { state: scoped.state },
  );
  if (!chance.exactComplete) {
    return {
      schemaVersion: WARMACHINE_POST_RESPONSE_CHANCE_EXECUTION_V1_SCHEMA,
      exactComplete: false,
      chance,
      outcomes: [],
      rejectedTransitionCount: 0,
    };
  }
  const outcomes = chance.classes.map((postResponseChanceClass) => {
    const executed = executeScopedWarmachineBenchmarkActionV2(
      scoped,
      response.action,
      { actionKey: response.action.actionKey },
      {
        routeKey: `${rawOptions.routeKey || "post-response-chance"}:${postResponseChanceClass.classKey}`,
        actionPatch: {
          ...(rawOptions.actionPatch || {}),
          ...warmachineExactChanceClassActionPatch(postResponseChanceClass),
        },
      },
    );
    return { postResponseChanceClass, executed };
  });
  return {
    schemaVersion: WARMACHINE_POST_RESPONSE_CHANCE_EXECUTION_V1_SCHEMA,
    exactComplete: true,
    chance,
    outcomes,
    rejectedTransitionCount: outcomes.filter((entry) => !entry.executed.ok).length,
  };
}
