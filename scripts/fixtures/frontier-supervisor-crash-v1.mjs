import { startWarmachineFrontierContinuationSupervisorV1 } from
  "../../src/search/frontier-continuation-supervisor-v1.mjs";

const statusPath = String(process.argv[2] || "");
const supervisor = startWarmachineFrontierContinuationSupervisorV1(statusPath, {
  fixtureKey: "frontier-supervisor-kill-recovery-v1",
});
supervisor.record({
  taskKey: "crash-task",
  labelKey: "crash-label",
  eventType: "started",
  state: "running",
});
process.send?.({ ready: true, runKey: supervisor.runKey });
setInterval(() => {}, 60_000);
