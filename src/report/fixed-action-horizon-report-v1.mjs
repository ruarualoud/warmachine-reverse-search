import { stableGraphHash, stableGraphValue } from "../graph/typed-facts-v2.mjs";

export const WARMACHINE_FIXED_ACTION_HORIZON_REPORT_V1_SCHEMA =
  "warmachine_fixed_action_horizon_report_v1";

function gcd(left, right) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

function rational(numerator = 0n, denominator = 1n) {
  const rawNumerator = BigInt(numerator);
  const rawDenominator = BigInt(denominator);
  if (rawDenominator <= 0n) throw new Error("action_horizon_probability_denominator_invalid");
  const divisor = gcd(rawNumerator, rawDenominator);
  return {
    numerator: rawNumerator / divisor,
    denominator: rawDenominator / divisor,
  };
}

function add(left, right) {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiply(left, right) {
  return rational(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function compare(left, right) {
  const difference = left.numerator * right.denominator -
    right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function probability(value = {}) {
  return rational(value.numerator ?? 0, value.denominator ?? 1);
}

function probabilityRecord(value) {
  return {
    numerator: String(value.numerator),
    denominator: String(value.denominator),
    decimal: Number(value.numerator) / Number(value.denominator),
  };
}

function classifyActionHorizonLeaf(label = {}, rootDepth = 0) {
  if (label.status === "success") return "success";
  if (label.status === "failure") return "failure";
  if (label.depth === rootDepth + 1 && label.status === "unresolved" &&
      label.reason === "maximum_policy_depth_reached") return "failure";
  return "unresolved";
}

function chooseResponse(rows, quantifier, boundKey) {
  if (!rows.length) throw new Error("action_horizon_response_set_empty");
  const ownerMax = String(quantifier || "").includes("owner_max");
  return rows.slice().sort((left, right) => {
    const order = compare(left[boundKey], right[boundKey]);
    return (ownerMax ? -order : order) || left.responseKey.localeCompare(right.responseKey);
  })[0];
}

function buildActionHorizonSolver(labelByKey, edgeByKey, rootDepth) {
  const solved = new Map();
  const active = new Set();
  const solveResponse = (response = {}) => {
    let lower = rational();
    let upper = rational();
    let total = rational();
    const outcomeCounts = { success: 0, failure: 0, unresolved: 0 };
    for (const branch of response.branches || []) {
      const mass = probability(branch.conditionalProbability);
      total = add(total, mass);
      const edge = edgeByKey.get(branch.edgeKey);
      const child = edge?.childLabelKey ? solveLabel(edge.childLabelKey) : {
        lower: rational(0n),
        upper: rational(1n),
      };
      lower = add(lower, multiply(mass, child.lower));
      upper = add(upper, multiply(mass, child.upper));
      const outcome = compare(child.lower, rational(1n)) === 0 &&
          compare(child.upper, rational(1n)) === 0
        ? "success"
        : compare(child.lower, rational(0n)) === 0 &&
            compare(child.upper, rational(0n)) === 0
          ? "failure"
          : "unresolved";
      outcomeCounts[outcome] += 1;
    }
    if (compare(total, rational(1n)) !== 0) {
      throw new Error(`action_horizon_response_mass_not_conserved:${response.responseKey}`);
    }
    return {
      responseKey: response.responseKey,
      branchCount: (response.branches || []).length,
      outcomeCounts,
      lower,
      upper,
    };
  };
  const solveLabel = (labelKey) => {
    if (solved.has(labelKey)) return solved.get(labelKey);
    if (active.has(labelKey)) throw new Error(`action_horizon_cycle:${labelKey}`);
    const label = labelByKey.get(labelKey) || {};
    active.add(labelKey);
    const directOutcome = classifyActionHorizonLeaf(label, rootDepth);
    let result;
    if (directOutcome === "success") {
      result = { lower: rational(1n), upper: rational(1n) };
    } else if (directOutcome === "failure") {
      result = { lower: rational(0n), upper: rational(0n) };
    } else if (label.status !== "expanded" || !label.expansion) {
      result = { lower: rational(0n), upper: rational(1n) };
    } else if (label.expansion.expansionType === "deterministic") {
      const edge = edgeByKey.get(label.expansion.edgeKey);
      result = edge?.childLabelKey
        ? solveLabel(edge.childLabelKey)
        : { lower: rational(0n), upper: rational(1n) };
    } else {
      let lower = rational();
      let upper = rational();
      let primaryMass = rational();
      for (const group of label.expansion.groups || []) {
        const primary = probability(group.conditionalProbability);
        primaryMass = add(primaryMass, primary);
        const responseRows = (group.responses || []).filter((response) => {
          const branchLabels = (response.branches || []).map((branch) =>
            labelByKey.get(edgeByKey.get(branch.edgeKey)?.childLabelKey || "")).filter(Boolean);
          return !branchLabels.length || !branchLabels.every((candidate) =>
            candidate.status === "response_unavailable");
        }).map(solveResponse);
        if (label.expansion.responseSetComplete !== true || !responseRows.length) {
          upper = add(upper, primary);
          continue;
        }
        const selectedLower = chooseResponse(
          responseRows,
          label.expansion.quantifier,
          "lower",
        );
        const selectedUpper = chooseResponse(
          responseRows,
          label.expansion.quantifier,
          "upper",
        );
        lower = add(lower, multiply(primary, selectedLower.lower));
        upper = add(upper, multiply(primary, selectedUpper.upper));
      }
      if (compare(primaryMass, rational(1n)) !== 0) {
        throw new Error(`action_horizon_primary_mass_not_conserved:${labelKey}`);
      }
      result = { lower, upper };
    }
    active.delete(labelKey);
    solved.set(labelKey, result);
    return result;
  };
  return { solveLabel, solveResponse };
}

function markdown(report) {
  const action = report.selectedAction;
  const target = report.opening.target;
  const caster = report.opening.caster;
  const interval = report.actionHorizonValue;
  return `${[
    "# Warmachine 固定单动作严格搜索报告",
    "",
    `- 报告哈希：\`${report.reportHash}\``,
    `- 搜索检查点：\`${report.source.checkpointId}\``,
    `- Host 回执：\`${report.source.hostReceiptHash}\``,
    `- 固定动作源：深度 ${report.route.sourceDepth}，标签 \`${report.route.sourceLabelKey}\``,
    `- 严格执行拒绝：${report.counts.strictRejectedEdgeCount}`,
    `- 当前动作：${action.actionType}，${action.actorPieceKey} -> ${action.targetPieceKey}`,
    `- 施法者资源：Focus ${caster.focus}`,
    `- 目标状态：${target.boxesRemaining}/${target.maxBoxes} 生命格，Fury ${target.fury}`,
    "",
    "## 本动作结论",
    "",
    `在声明的“只判断这个动作是否立即完成刺杀”有限目标下，成功概率为 **${interval.lowerBound.decimal}**。该值精确：${interval.exact ? "是" : "否"}。`,
    `动作生成器的伤害期望为 ${action.expectedDamage ?? "未提供"}；根动作声明 ${report.counts.chanceClassCount} 个精确骰类和 ${report.counts.responseKeyCount} 种防守选择，当前已物化 ${report.counts.successorLabelCount} 个不同后继。`,
    `动作内部工作标签：总计 ${report.counts.chanceResponseWorkLabelCount}，已执行 ${report.counts.executedChanceResponseWorkLabelCount}，因精确界已闭合而保留未执行 ${report.counts.remainingChanceResponseWorkLabelCount}。`,
    `Chance 结算后动态不可用的防守响应：${report.counts.unavailableResponseEdgeCount}。`,
    interval.exact
      ? `本动作的立即刺杀概率已经闭合为 ${interval.lowerBound.decimal}。`
      : `本动作仍有未执行分支，当前立即刺杀区间为 [${interval.lowerBound.decimal}, ${interval.upperBound.decimal}]。`,
    "",
    "## 防守响应",
    "",
    ...report.responseSummary.map((row) =>
      `- \`${row.responseKey}\`：${row.branchCount} 个严格后继；动作内成功下界 ${row.lowerBound.decimal}，上界 ${row.upperBound.decimal}。`),
    "",
    "## 结论边界",
    "",
    `整段后续对局仍为 **[${report.postActionContinuationInterval.lowerBound.decimal}, ${report.postActionContinuationInterval.upperBound.decimal}]**。这些后继没有被记成整局失败，而是继续保存在外部 DAG 中。`,
    "本报告只证明当前固定路线上的这一项动作结论；它不证明当前激活、整局、军表、地图或阵营最优。",
    "",
  ].join("\n")}\n`;
}

export function buildWarmachineFixedActionHorizonReportV1(rawInput = {}) {
  const probabilityReport = rawInput.probabilityReport || {};
  const route = rawInput.route || {};
  const labels = probabilityReport.labels || [];
  const edges = probabilityReport.edges || [];
  const labelByKey = new Map(labels.map((label) => [label.labelKey, label]));
  const edgeByKey = new Map(edges.map((edge) => [edge.edgeKey, edge]));
  const root = labelByKey.get(probabilityReport.rootLabelKey) ||
    labels.find((label) => label.expansion?.expansionType === "chance");
  if (!root || root.expansion?.expansionType !== "chance") {
    throw new Error("action_horizon_chance_root_missing");
  }
  const groups = root.expansion.groups || [];
  const horizonSolver = buildActionHorizonSolver(labelByKey, edgeByKey, root.depth);
  let lower = rational();
  let upper = rational();
  let primaryMass = rational();
  const responseAggregate = new Map();
  const groupAudits = [];
  for (const group of groups) {
    const primary = probability(group.conditionalProbability);
    primaryMass = add(primaryMass, primary);
    const responseRows = (group.responses || []).filter((response) => {
      const branchLabels = (response.branches || []).map((branch) =>
        labelByKey.get(edgeByKey.get(branch.edgeKey)?.childLabelKey || "")).filter(Boolean);
      return !branchLabels.length || !branchLabels.every((candidate) =>
        candidate.status === "response_unavailable");
    }).map(horizonSolver.solveResponse);
    const selectedLower = chooseResponse(responseRows, root.expansion.quantifier, "lower");
    const selectedUpper = chooseResponse(responseRows, root.expansion.quantifier, "upper");
    lower = add(lower, multiply(primary, selectedLower.lower));
    upper = add(upper, multiply(primary, selectedUpper.upper));
    groupAudits.push({
      groupKey: group.groupKey,
      chanceClassKeys: group.chanceClassKeys,
      primaryProbability: probabilityRecord(primary),
      selectedLowerResponseKey: selectedLower.responseKey,
      selectedUpperResponseKey: selectedUpper.responseKey,
      responseCount: responseRows.length,
    });
    for (const row of responseRows) {
      const current = responseAggregate.get(row.responseKey) || {
        responseKey: row.responseKey,
        branchCount: 0,
        lower: rational(),
        upper: rational(),
      };
      current.branchCount += row.branchCount;
      current.lower = add(current.lower, multiply(primary, row.lower));
      current.upper = add(current.upper, multiply(primary, row.upper));
      responseAggregate.set(row.responseKey, current);
    }
  }
  if (compare(primaryMass, rational(1n)) !== 0) {
    throw new Error("action_horizon_primary_mass_not_conserved");
  }
  const openingState = route.state || {};
  const caster = openingState.pieces?.find((piece) =>
    piece.pieceKey === rawInput.casterPieceKey) || {};
  const target = openingState.pieces?.find((piece) =>
    piece.pieceKey === rawInput.targetPieceKey) || {};
  const responseSummary = Array.from(responseAggregate.values()).sort((left, right) =>
    left.responseKey.localeCompare(right.responseKey)).map((row) => ({
      responseKey: row.responseKey,
      branchCount: row.branchCount,
      lowerBound: probabilityRecord(row.lower),
      upperBound: probabilityRecord(row.upper),
    }));
  const core = {
    schemaVersion: WARMACHINE_FIXED_ACTION_HORIZON_REPORT_V1_SCHEMA,
    source: stableGraphValue(rawInput.source || {}),
    route: {
      checkpointReceiptHash: String(route.checkpointReceiptHash || ""),
      transitionCount: Number(route.transitionCount || 0),
      sourceDepth: Number(route.sourceDepth ?? route.transitionCount ?? root.depth),
      sourceLabelKey: String(route.sourceLabelKey || root.labelKey),
    },
    opening: {
      caster: {
        pieceKey: String(caster.pieceKey || ""),
        focus: Number(caster.focus || 0),
        boxesRemaining: Number(caster.damage?.boxesRemaining || 0),
      },
      target: {
        pieceKey: String(target.pieceKey || ""),
        fury: Number(target.fury || 0),
        boxesRemaining: Number(target.damage?.boxesRemaining || 0),
        maxBoxes: Number(target.damage?.maxBoxes || 0),
      },
    },
    selectedAction: stableGraphValue(route.nextAction || {}),
    actionHorizonValue: {
      exact: compare(lower, upper) === 0,
      lowerBound: probabilityRecord(lower),
      upperBound: probabilityRecord(upper),
      objective: "selected_action_immediately_destroys_target_leader",
      cutoffTreatment: "alive_continue_leaf_is_failure_for_action_horizon_only",
      completionBasis: compare(lower, upper) === 0
        ? labels.some((label) =>
          Boolean(label.chanceResponseWork?.workKey) && label.status === "unresolved")
          ? "adversarial_min_max_bound_closed_with_dominated_work_resumable"
          : "all_declared_action_work_executed"
        : "open_action_work_interval",
    },
    postActionContinuationInterval: probabilityReport.probabilityInterval,
    counts: {
      chanceClassCount: Number(probabilityReport.stepAudits?.find((audit) =>
        audit.labelKey === root.labelKey)?.chanceAudit?.classCount || groups.length),
      adversarialContextCount: Number(probabilityReport.frontierAudits?.at(-1)
        ?.adversarialContextCount || 0),
      responseKeyCount: responseSummary.length,
      successorLabelCount: labels.filter((label) => label.depth === root.depth + 1).length,
      chanceResponseWorkLabelCount: labels.filter((label) =>
        Boolean(label.chanceResponseWork?.workKey)).length,
      executedChanceResponseWorkLabelCount: labels.filter((label) =>
        Boolean(label.chanceResponseWork?.workKey) && label.status !== "unresolved").length,
      remainingChanceResponseWorkLabelCount: labels.filter((label) =>
        Boolean(label.chanceResponseWork?.workKey) && label.status === "unresolved").length,
      strictRejectedEdgeCount:
        Number(probabilityReport.strictRejectedResponseEdgeCount || 0) +
        Number(probabilityReport.strictRejectedDeterministicEdgeCount || 0),
      unavailableResponseEdgeCount:
        Number(probabilityReport.unavailableResponseEdgeCount || 0),
    },
    responseSummary,
    groupAudits,
    claimBoundary: "This exact value is only for whether the selected action immediately destroys the target leader. Every live continuation remains unresolved in the original post-action interval and external DAG; this report does not value the activation, turn, match, roster, map or faction.",
  };
  const report = {
    ...core,
    reportHash: stableGraphHash(stableGraphValue(core)),
  };
  return { ...report, markdown: markdown(report) };
}
