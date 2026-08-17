# 团队交接状态

更新时间：2026-08-18。

## 仓库状态

- `warmachine-strict-engine`：从当前本地工作树导出的独立规则/原子/数据/验证仓库。
- `warmachine-reverse-search`：独立搜索、批处理和报告仓库，通过内容哈希 Host receipt 依赖 Engine。
- 当前 Engine 审核提交：`b0c2e557b9adbb68282d655c69e212dd0c9940a3`（来自交接提交 `c87c08ca514c401605a3ba88c7b2a3fd1250172f` 的独立分支审计修复）。
- 两仓建议同级克隆；搜索仓库优先读取 `WARMACHINE_ENGINE_ROOT`。
- `.scratch`、`build`、线上记录和媒体没有进入 Git；Wayfinder 地图/工单保留。

## 已验证进度

Wayfinder：`4/13` 已完成，Ticket 05 进行中。

| 项目 | 数量 |
| --- | ---: |
| 计划任务 | 64 |
| 已处置 | 37 |
| 任务专属 strict root | 12 |
| Host strict reject | 2 |
| 精确候选过滤 | 17 |
| 规则来源未决 | 6 |
| 预算延迟 | 27 |

生产计划哈希：`b8bd842761ff3ece6560b3cb4d59323214b08be74d3dcbcada5c4cbbd9d5a3a2`。

checkpoint 哈希：`d1bfd77088e9304c630158ad36b695b3335727e24fbf54c1c367b368407c58bb`。

Ticket 05 已在新规则收据下重新生成 `64` 个任务、`39` 个唯一严格开局、`4` 个分片；开局覆盖七个 Steamroller 场景和三类地形设置。执行采用三个连续的 16 任务上限批次，当前生产 checkpoint `a88ee01af256096ed8e3947d45911f1a3760259f2b12244fd8caf4e6dcbf185e` 中有 `12` 个 `strict_materialized`、`4` 个 `strict_rejected`、`21` 个 `proposal_filtered`、`6` 个 `rules_unknown`、`0` 个 `input_invalid` 与 `21` 个明确的 `budget_deferred`；候选质量守恒。`43/64` 为已结算任务，剩余 `21/64` 是未注册适配器的预算延迟，既不能计入终局完成数，也不能改写成拒绝或不可达。批执行、批计划和开局批验证均已通过。

交接时重新运行规则集影响分析，impact hash 为 `b35c373881c9d0ef52cc7ab2c020017178f5e9b924defab0ca509aaa77f8eac0`。新增原子是 `rampant_fury_same_activation_second_frenzy` 与 `spontaneous_combustion_continuous_effect_damage_dice_and_expiration`，受影响钩子为 `action_contribution`、`attack_hit`、`damage_modifier`。该影响已由 `docs/research/ruleset-review-20260818.json` 审核，基线提升为 `warmachine-ruleset-2026-08-18-remote-40041-v6`，当前收据为 `380` 原子、`466` hook operators、`196` primitives、`501` declared interactions。typed graph 生成与验证均改用 Engine 导出的 `fixtures/ruleset-baseline/fixed-roster-room.json`，不再依赖未提交的历史大型房间工件。

## 交接烟雾验证

```bash
cd warmachine-strict-engine
npm run verify

cd ../warmachine-reverse-search
npm run verify:handoff
npm run verify:upstream
npm run verify:custom-matchup-task
npm run verify:custom-task-force-builder
npm run status:custom-matchup-wayfinder
```

Ticket 05 恢复时先查看：

```text
.scratch/warmachine-custom-matchup-wayfinder-v1/map.md
.scratch/warmachine-custom-matchup-wayfinder-v1/issues/05-batched-terminal-root-materialization.md
src/matchup/matchup-simultaneous-terminal-task-materializer-v1.mjs
scripts/verify-matchup-simultaneous-terminal-task-materializer-v1.mjs
scripts/verify-matchup-gorman-experimental-warhead-filter-tasks-v1.mjs
```

大型旧计划和 checkpoint 未提交。需要完全复现旧哈希时，从原工件存储恢复；没有工件时用当前代码重新生成新计划，不要伪造旧 checkpoint。

## 风险

1. 已审阅 ruleset baseline 已提升为 `380` 原子/`466` hook operators；`verify:ruleset-snapshot`、`verify:ruleset-impact`、typed graph、原语和回归门均已在该收据下重建通过。历史 checkpoint、路线、报告和训练材料仍必须以旧 receipt 漂移失效，不能恢复或混用。
2. Engine `verify:micro` 已为 `108/108`；这一结果仅覆盖已声明的微型夹具。全规则声明仍须结合当前数据分母、规则来源分母、真实卡牌正反 strict 场景与其余受影响门禁，不能以单一微型门禁代替。
3. Ticket 05 的当前产物证明有限计划、任务专属开局和已注册适配器的处置守恒；它不证明从合法部署到终局的可达路径，也不把 `21` 个 `budget_deferred` 视为结果。后续应为这些家族补充任务适配器并在同一 checkpoint 合同下恢复。
4. Ticket 06/07 尚无任务专属的合法部署到终局完整 strict 路线。
5. 初始状态值仍以区间/筛选为主，不具备自然胜率声明条件。
6. 全阵营独有机制的搜索可调用矩阵尚未闭合。
7. 媒体库不在 Git；控制台真实棋子需要单独配置资源根。
8. 旧 parity 脚本仍加载 Engine 中的 legacy reverse 模块，只用于迁移比较，不是长期双实现许可。
