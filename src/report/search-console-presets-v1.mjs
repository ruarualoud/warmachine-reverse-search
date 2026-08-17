const SCORE_ANCHOR_SCENARIOS = Object.freeze([
  ["trench-warfare", "trench_warfare", "Trench Warfare"],
  ["two-fronts", "two_fronts", "Two Fronts"],
  ["wolves-at-our-heels", "wolves_at_our_heels", "Wolves at Our Heels"],
  ["pressure-point", "pressure_point", "Pressure Point"],
  ["high-stakes", "high_stakes", "High Stakes"],
  ["fault-line", "fault_line", "Fault Line"],
  ["payload", "payload", "Payload"],
]);

function scoreAnchorSeed(hostScenarioKey) {
  return Object.freeze({
    presetKey: `steamroller-score-anchor-${hostScenarioKey}`,
    materializerKind: "steamroller_score_terminal_anchor_v1",
    goalType: "scenario_score",
    roundNumber: 3,
    label: "第三回合严格得分锚点",
    description: "从防守方第三回合结束的真实得分胜利反推；前两次得分由 strict 历史生成，当前只证明双 Leader 微型军表。",
    randomSeed: "steamroller-score-terminal-anchor-v1",
    rosterDomainKey: "score-terminal-anchor-two-leader-micro-roster-domain-v1",
    anchors: Object.freeze([Object.freeze({
      anchorKey: `score-terminal-anchor:${hostScenarioKey}`,
      label: "官方场景元素得分点",
    })]),
  });
}

const SCORE_ANCHOR_CATALOG = SCORE_ANCHOR_SCENARIOS.map(
  ([scenarioKey, hostScenarioKey, label]) => Object.freeze({
    scenarioKey,
    hostScenarioKey,
    label,
    packet: "Steamroller 2026",
    victorySeeds: Object.freeze([scoreAnchorSeed(hostScenarioKey)]),
  }),
);

const twoFronts = SCORE_ANCHOR_CATALOG.find((scenario) =>
  scenario.hostScenarioKey === "two_fronts");

export const WARMACHINE_SEARCH_CONSOLE_PRESET_CATALOG_V1 = Object.freeze([
  Object.freeze({
    scenarioKey: "two-fronts",
    hostScenarioKey: "two_fronts",
    label: "Two Fronts",
    packet: "Steamroller 2026",
    victorySeeds: Object.freeze([
      Object.freeze({
        presetKey: "fixed-cryx-fane-assassination",
        materializerKind: "fixed_cryx_fane_assassination_v1",
        goalType: "assassination",
        roundNumber: 3,
        label: "第三回合刺杀",
        description: "从对方 Leader 被最后一击移除的终局反推。",
        randomSeed: "fixed-terminal-position-domain-v1",
        anchors: Object.freeze([
          ["round-three-west-lower-objective-flank", "西侧下方交战点"],
          ["round-three-west-upper-objective-flank", "西侧上方交战点"],
          ["round-three-east-lower-objective-flank", "东侧下方交战点"],
          ["round-three-east-upper-objective-flank", "东侧上方交战点"],
        ].map(([anchorKey, label]) => Object.freeze({ anchorKey, label }))),
      }),
      Object.freeze({
        presetKey: "fixed-cryx-fane-score",
        materializerKind: "fixed_cryx_fane_score_v1",
        goalType: "scenario_score",
        roundNumber: 3,
        label: "第三回合得分胜利",
        description: "从对手回合结束时 3 分领先的结算终局反推。",
        randomSeed: "fixed-terminal-score-position-domain-v1",
        anchors: Object.freeze([
          ["round-three-left-50-outer", "蓝方 50mm 目标外沿"],
          ["round-three-left-50-lower", "蓝方 50mm 目标南沿"],
          ["round-three-right-50-outer", "红方 50mm 目标外沿"],
          ["round-three-right-50-lower", "红方 50mm 目标南沿"],
        ].map(([anchorKey, label]) => Object.freeze({ anchorKey, label }))),
      }),
      twoFronts.victorySeeds[0],
    ]),
  }),
  ...SCORE_ANCHOR_CATALOG.filter((scenario) => scenario.hostScenarioKey !== "two_fronts"),
]);

export function findWarmachineSearchConsolePresetV1(presetKey) {
  for (const scenario of WARMACHINE_SEARCH_CONSOLE_PRESET_CATALOG_V1) {
    const victorySeed = scenario.victorySeeds.find((entry) =>
      entry.presetKey === String(presetKey || ""));
    if (victorySeed) return { scenario, victorySeed };
  }
  return null;
}

export function auditWarmachineSearchConsolePresetReferenceV1(seed = {}) {
  const match = findWarmachineSearchConsolePresetV1(seed.presetKey);
  const issues = [];
  if (!match) return { ok: false, issues: ["search_console_seed_preset_unknown"] };
  if (match.scenario.scenarioKey !== seed.scenarioKey) {
    issues.push("search_console_seed_preset_scenario_mismatch");
  }
  if (match.victorySeed.goalType !== seed.goalType) {
    issues.push("search_console_seed_preset_goal_mismatch");
  }
  if (Number(match.victorySeed.roundNumber) !== Number(seed.roundNumber)) {
    issues.push("search_console_seed_preset_round_mismatch");
  }
  if (!match.victorySeed.anchors.some((anchor) => anchor.anchorKey === seed.anchorKey)) {
    issues.push("search_console_seed_preset_anchor_unknown");
  }
  return { ok: issues.length === 0, issues, match };
}
