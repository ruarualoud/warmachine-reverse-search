import { isMainThread, parentPort, workerData } from "node:worker_threads";

import { evaluateWarmachineStrictFrontierContinuationEntryV1 } from
  "./frontier-continuation-batch-v1.mjs";

export const WARMACHINE_FRONTIER_CONTINUATION_WORKER_V1_SCHEMA =
  "warmachine_frontier_continuation_worker_v1";

async function executeTask(task, emit) {
  if (task.schemaVersion !== WARMACHINE_FRONTIER_CONTINUATION_WORKER_V1_SCHEMA) {
    throw new Error("continuation_worker_schema_mismatch");
  }
  const moduleUrl = String(task.policyModuleUrl || "");
  if (!moduleUrl.startsWith("file:")) {
    throw new Error("continuation_worker_policy_must_be_local_file_module");
  }
  await emit({
    messageType: "started",
    taskKey: task.taskKey,
    labelKey: task.entry?.labelKey,
  });
  const policyModule = await import(moduleUrl);
  const factory = policyModule[String(task.policyFactoryExportName || "")];
  if (typeof factory !== "function") {
    throw new Error("continuation_worker_policy_factory_missing");
  }
  const policy = factory(task.policyConfig || {}, {
    schemaVersion: WARMACHINE_FRONTIER_CONTINUATION_WORKER_V1_SCHEMA,
    taskKey: task.taskKey,
    labelKey: task.entry?.labelKey,
  });
  if (typeof policy?.selectPolicyAction !== "function") {
    throw new Error("continuation_worker_policy_selector_missing");
  }
  const report = evaluateWarmachineStrictFrontierContinuationEntryV1(
    task.entry,
    policy.selectPolicyAction,
    {
      ...(task.continuationOptions || {}),
      ...(typeof policy.classifyState === "function"
        ? { classifyState: policy.classifyState }
        : {}),
      ...(typeof policy.classifyResult === "function"
        ? { classifyResult: policy.classifyResult }
        : {}),
    },
  );
  await emit({
    messageType: "completed",
    taskKey: task.taskKey,
    labelKey: task.entry.labelKey,
    report,
  });
}

if (!isMainThread) {
  await executeTask(workerData || {}, async (message) => parentPort.postMessage(message));
} else if (process.env.WARMACHINE_FRONTIER_CONTINUATION_CHILD === "1") {
  process.once("message", async (task) => {
    const emit = (message) => new Promise((resolve, reject) => {
      process.send(message, (error) => error ? reject(error) : resolve());
    });
    try {
      await executeTask(task || {}, emit);
      process.disconnect();
    } catch (error) {
      try {
        await emit({
          messageType: "failed",
          taskKey: task?.taskKey,
          labelKey: task?.entry?.labelKey,
          errorMessage: String(error?.message || error),
        });
      } catch {
        process.stderr.write(`${error?.stack || error}\n`);
      }
      process.exitCode = 1;
      process.disconnect();
    }
  });
}
