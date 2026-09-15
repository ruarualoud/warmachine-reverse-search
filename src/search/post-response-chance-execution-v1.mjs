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
  const reportProgress = (stage, detail = {}) => rawOptions.onProgress?.({
    stage,
    ...detail,
  });
  reportProgress("post_response_chance_classes_start");
  const chance = buildWarmachineExactPostResponseChanceClassesV1(
    action,
    response,
    primaryChanceClass,
    { state: scoped.state },
  );
  reportProgress("post_response_chance_classes_complete", {
    exactComplete: chance.exactComplete === true,
    classCount: chance.classes?.length || 0,
  });
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
    reportProgress("post_response_transition_start", {
      postResponseChanceClassKey: postResponseChanceClass.classKey,
    });
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
        precomputedStrictChanceOutcomeComplete: true,
        onProgress: (detail) => reportProgress("post_response_transition_progress", {
          postResponseChanceClassKey: postResponseChanceClass.classKey,
          detail,
        }),
      },
    );
    reportProgress("post_response_transition_complete", {
      postResponseChanceClassKey: postResponseChanceClass.classKey,
      transitionOk: executed.ok,
    });
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
