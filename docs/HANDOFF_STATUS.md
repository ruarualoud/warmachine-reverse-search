# 团队交接状态

更新时间：2026-08-18。

## 仓库状态

- `warmachine-strict-engine`：从当前本地工作树导出的独立规则/原子/数据/验证仓库。
- `warmachine-reverse-search`：独立搜索、批处理和报告仓库，通过内容哈希 Host receipt 依赖 Engine。
- 当前 Engine 交接提交：`c87c08ca514c401605a3ba88c7b2a3fd1250172f`。
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

Ticket 05 的 Gorman 六项 WIP 中，仅 terrain-blocked 任务 `matchup-terminal-task-d3eddbffd6f093feebd6b96874a7c54b` 已单独通过，处置为 `strict_rejected / line_of_sight_blocked`，报告哈希 `f96b076878afd0f0f31a49fbdf9e95c5a3972057972a8528921c6f11f44731d9`。其余五项和更新后的聚合门没有运行，不得计入完成数。

交接时重新运行规则集影响分析，impact hash 为 `b35c373881c9d0ef52cc7ab2c020017178f5e9b924defab0ca509aaa77f8eac0`。新增原子是 `rampant_fury_same_activation_second_frenzy` 与 `spontaneous_combustion_continuous_effect_damage_dice_and_expiration`，受影响钩子为 `action_contribution`、`attack_hit`、`damage_modifier`。完整机器可读报告见 `docs/research/handoff-ruleset-impact-20260818.json`。

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

1. 已审阅 ruleset baseline 是 `378` 原子/`463` 钩子，当前 Engine 是 `380/466`；`verify:ruleset-snapshot` 应继续 fail-closed，直到团队完成影响报告、strict/skill 门和 review receipt 后正式提升基线。
2. Engine `verify:micro` 当前为 `101/108`；七个漂移项已记录在 Engine `docs/HANDOFF_STATUS.md`，不能把核心 smoke 通过误述为全规则门通过。
3. Ticket 05 最新六任务代码仍是部分验证状态。
4. Ticket 06 已有一条 78 模型 Two Fronts 合法部署到刺杀终局的完整 strict 路线；Ticket 07 的任务专属得分路线仍未闭合。Ticket 06 是存在性见证，不证明自然胜率或分支完备性。
5. 初始状态值仍以区间/筛选为主，不具备自然胜率声明条件。
6. 全阵营独有机制的搜索可调用矩阵尚未闭合。
7. 媒体库不在 Git；控制台真实棋子需要单独配置资源根。
8. 旧 parity 脚本仍加载 Engine 中的 legacy reverse 模块，只用于迁移比较，不是长期双实现许可。
