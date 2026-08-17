import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_INITIAL_STATE_DOMAIN_V1_SCHEMA =
  "warmachine_initial_state_domain_v1";

function sortedRows(rows = [], key) {
  return rows.map((row) => stableGraphValue(row))
    .sort((left, right) => String(left[key] || "").localeCompare(String(right[key] || "")));
}

function product(values = []) {
  return values.reduce((total, value) => total * BigInt(value), 1n);
}

function axisWeight(row = {}) {
  const value = Number(row.weight);
  return Number.isFinite(value) ? value : null;
}

function mixedRadixSelection(axes = [], rawIndex = 0n) {
  let index = BigInt(rawIndex);
  const selected = Array(axes.length);
  for (let axisIndex = axes.length - 1; axisIndex >= 0; axisIndex -= 1) {
    const axis = axes[axisIndex];
    const length = BigInt(axis.rows.length);
    selected[axisIndex] = axis.rows[Number(index % length)];
    index /= length;
  }
  return selected;
}

export function buildWarmachineInitialStateDomainV1(raw = {}) {
  const task = raw.task || {};
  if (task.validation?.ok !== true) {
    throw new Error(`custom_matchup_task_invalid:${(task.validation?.issues || []).join(",")}`);
  }
  const axes = [
    {
      axisKey: "subject_roster",
      rows: sortedRows(raw.subjectRosters || [], "rosterKey"),
    },
    {
      axisKey: "challenger_roster",
      rows: sortedRows(raw.challengerRosters || [], "rosterKey"),
    },
    {
      axisKey: "scenario",
      rows: task.stateDomain.scenarioKeys.map((scenarioKey) => ({ scenarioKey })),
    },
    {
      axisKey: "map",
      rows: sortedRows(task.stateDomain.mapProfiles || [], "mapKey"),
    },
    {
      axisKey: "first_player",
      rows: sortedRows(task.stateDomain.firstPlayerRows || [], "taskSideKey"),
    },
    {
      axisKey: "deployment",
      rows: sortedRows(task.stateDomain.deploymentSeeds || [], "deploymentSeedKey"),
    },
  ];
  const emptyAxes = axes.filter((axis) => !axis.rows.length).map((axis) => axis.axisKey);
  if (emptyAxes.length) throw new Error(`initial_state_domain_axis_empty:${emptyAxes.join(",")}`);
  const cellCount = product(axes.map((axis) => axis.rows.length));
  const allWeightsDeclared = axes.every((axis) =>
    axis.axisKey === "scenario" || axis.axisKey.endsWith("roster") ||
      axis.rows.every((row) => axisWeight(row) != null));
  const core = {
    schemaVersion: WARMACHINE_INITIAL_STATE_DOMAIN_V1_SCHEMA,
    taskKey: task.taskKey,
    taskHash: task.taskHash,
    axes: axes.map((axis) => ({
      axisKey: axis.axisKey,
      count: axis.rows.length,
      rows: axis.rows,
    })),
    cellCount: cellCount.toString(),
    materializationMode: "mixed_radix_lazy_page",
    allWeightsDeclared,
    naturalWinRateAggregationAllowed:
      task.validation.naturalWinRateAggregationAllowed === true && allWeightsDeclared,
    strictOpeningCount: axes.find((axis) => axis.axisKey === "deployment").rows
      .filter((row) => row.exactOpeningStateHash && row.strictDeploymentReceiptHash).length,
    claimBoundary: "A cell is an address in the declared finite opening proposal universe. It becomes a strict initial state only after exact rosters, map terrain, scenario, initiative, deployment coordinates and the current construction Host receipt are materialized and audited.",
  };
  return { ...core, domainHash: stableGraphHash(core) };
}

export function pageWarmachineInitialStateDomainV1(domain = {}, rawOptions = {}) {
  const axes = domain.axes || [];
  const total = BigInt(domain.cellCount || 0);
  const offset = BigInt(Math.max(0, Math.floor(Number(rawOptions.offset || 0))));
  const limit = Math.max(0, Math.min(10_000, Math.floor(Number(rawOptions.limit || 100))));
  const end = offset >= total ? offset : offset + BigInt(limit) > total
    ? total
    : offset + BigInt(limit);
  const cells = [];
  for (let index = offset; index < end; index += 1n) {
    const selected = mixedRadixSelection(axes, index);
    const byAxis = Object.fromEntries(axes.map((axis, axisIndex) => [
      axis.axisKey,
      selected[axisIndex],
    ]));
    const weightRows = Object.values(byAxis).map(axisWeight);
    const cellWeight = weightRows.every((value) => value != null)
      ? weightRows.reduce((productValue, value) => productValue * value, 1)
      : null;
    const identity = {
      taskHash: domain.taskHash,
      subjectRosterKey: byAxis.subject_roster.rosterKey,
      challengerRosterKey: byAxis.challenger_roster.rosterKey,
      scenarioKey: byAxis.scenario.scenarioKey,
      mapKey: byAxis.map.mapKey,
      firstPlayerTaskSideKey: byAxis.first_player.taskSideKey,
      deploymentSeedKey: byAxis.deployment.deploymentSeedKey,
    };
    cells.push({
      cellIndex: index.toString(),
      initialStateKey: `initial-${stableGraphHash(identity)}`,
      ...identity,
      subjectLeaderName: String(byAxis.subject_roster.leaderName || ""),
      challengerLeaderName: String(byAxis.challenger_roster.leaderName || ""),
      cellWeight,
      materializationStatus:
        byAxis.deployment.exactOpeningStateHash && byAxis.deployment.strictDeploymentReceiptHash
          ? "strict_opening_reference"
          : "proposal_only",
      exactOpeningStateHash: String(byAxis.deployment.exactOpeningStateHash || ""),
      strictDeploymentReceiptHash: String(byAxis.deployment.strictDeploymentReceiptHash || ""),
    });
  }
  return {
    schemaVersion: "warmachine_initial_state_domain_page_v1",
    domainHash: domain.domainHash,
    offset: offset.toString(),
    limit,
    returnedCount: cells.length,
    nextOffset: end < total ? end.toString() : null,
    cells,
  };
}
