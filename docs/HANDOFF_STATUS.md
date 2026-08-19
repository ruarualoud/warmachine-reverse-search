# 团队交接状态

更新时间：2026-08-19。

> **2026-08-19 核查更正（恢复开发前必读本段）**
>
> 下文「已验证进度」节记载的计划 `b8bd8427` / checkpoint `d1bfd770` / `37` 已处置**已过时**，与 `docs/DEVELOPMENT_PLAN.md` 及实际指针 `CURRENT.json` 三处互不一致。完整诊断、整改路线与验收标准见 `docs/EXECUTION_AUDIT_AND_REMEDIATION_GUIDE.md`，实测收据见 `docs/research/execution-audit-20260819.json`。
>
> 唯一生产基线：**v4 计划 `6768bd50ccd9a8321de9818b90192feaa0f889c7582dda6d2b6cd5d566bf3512`，已结算 `50/64`**。v5 至 v8 的四次合同迁移造成 `48` 项已结算处置被无关作废（v8 计划 `4215fc135da9` 仅 `2/64`，且其 64 个 taskKey 集合与 v4 完全相同），其中得分 `11/11`、固定轮次 `13/13`、同时胜负 `16/16` 三族与刺杀几何分块这一唯一真实语义变化无关。v8 仅作为历史工件保留，执行入口回退至 v4。
>
> 两项阻塞搜索推进的关键发现。第一，Engine CI 分片验证此前因参数风格不匹配而静默空跑，正确命令必须为 `--shard-count=8 --shard-index=<N> --execute`（连字符风格且显式 `--execute`）；真实分母为 `263` 个验证器 / `8` 分片，分片 `1` 实际执行后 `39` 项中 **`8` 项失败**，分片 `2`-`7` 共 `205` 个验证器仍未执行。第二，刺杀几何枚举分母 `7936 = 31 candidates × 8 anchors × 32 angles` 无任何剪枝，单任务约 `70` 机时、剩余 `14` 项刺杀约 `988` 机时，属不可完成量级。
>
> **在 R1（八分片真实执行与回归修复）与 Ticket 05a（折叠内核）完成前，不得向几何搜索投入机时。** 规则收据未冻结时产出的搜索结果会在收据变更后全部 fail-closed。

## 仓库状态

- `warmachine-strict-engine`：从当前本地工作树导出的独立规则/原子/数据/验证仓库。
- `warmachine-reverse-search`：独立搜索、批处理和报告仓库，通过内容哈希 Host receipt 依赖 Engine。
- 当前 Engine 审核提交：`acdfe8a`（`fix: close engine shard zero strict regressions`，已与 origin 同步）；其前身为 `b0c2e557b9adbb68282d655c69e212dd0c9940a3`。
- 搜索仓本地 HEAD `bfabb6a`，origin 停在 `bb993e0`；`ccbd305`、`b65b2f6`、`af1ca35`、`bfabb6a` 四个提交因 GitHub 认证失效未推送，并行团队从远端获取的状态落后于本地。
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
2. Engine `verify:micro` 已为 `108/108`；这一结果仅覆盖已声明的微型夹具。全规则声明仍须结合当前数据分母、规则来源分母、真实卡牌正反 strict 场景与其余受影响门禁，不能以单一微型门禁代替。**2026-08-19 核查补充**：CI 分片矩阵的真实分母为 `263` 个验证器（`235` 规则原子 + `28` 严格转换），仅分片 `0` 与 `1` 被实际执行；分片 `1` 有 `8` 项失败（`attack-type`、`bag-man`、`banish`、`blade-glide`、`blood-shadow`、`rune-mark`、`skewer` 七个规则原子，以及超时的 `strict-movement-los-template`）。`skewer` 的自由打击窗口为空与已修复的 `Snacking`、`Critical Smite` 同源，提示自由打击窗口构造存在系统性缺陷。规则层健康度在八分片全部通过前不得视为已知。
3. Ticket 05 的当前产物证明有限计划、任务专属开局和已注册适配器的处置守恒；它不证明从合法部署到终局的可达路径，也不把 `21` 个 `budget_deferred` 视为结果。后续应为这些家族补充任务适配器并在同一 checkpoint 合同下恢复。
4. Ticket 06/07 尚无任务专属的合法部署到终局完整 strict 路线。
5. 初始状态值仍以区间/筛选为主，不具备自然胜率声明条件。**Ticket 08（概率对抗闭包）尚未启动，它是判定对抗优劣的必要条件**：AND/min 对手节点、条件概率质量守恒、未展开上界与初始状态归并均未实现。即使 Ticket 05/06/07 全部闭合，也只能证明单侧存在获胜路线，不能得出优劣结论。
6. 全阵营独有机制的搜索可调用矩阵尚未闭合。
7. 媒体库不在 Git；控制台真实棋子需要单独配置资源根。
8. 旧 parity 脚本仍加载 Engine 中的 legacy reverse 模块，只用于迁移比较，不是长期双实现许可。
9. 最终目标的对象口径需澄清：用户所称「Narro」对应代码中的 `Fane of Nyrro`，其 `factionName` 为 **Dusk**，并非独立阵营。可求解命题限定为固定题 `sepsira-six-swarms-vs-fane-v1`（subject 为 Cryx/Necrofactorium/Sepsira 六队 Swarm，challenger 为 Dusk/Fane of Nyrro 全领袖）及其冻结条件轴，不是阵营级全局对抗。
10. `8` 个硬编码几何锚点对七个 Steamroller 场景的代表性未经证明。这是先于折叠的覆盖度问题：若锚点本身不足以代表场景拓扑，则 Ticket 05 的结论只对这 `8` 个锚点成立。
11. 合同治理规则自 2026-08-19 生效：纯性能参数与可观测性变更不得升级合同或重建计划；枚举集合、枚举顺序或完成语义变更才需升级，且**仅限受影响目标族**；升级前必须先写迁移影响说明；同一族在一个验收周期内只应变更一次。
