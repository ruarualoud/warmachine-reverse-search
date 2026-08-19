# 全量 Ticket 长期执行基线

**基线日期：2026-08-18（于 2026-08-19 核查后修订）**  
**共同分支：`manus/phase1-ruleset-ticket05`**

> 本文把“完成”限定为：实现已进入目标仓库、所列门禁通过、规则与数据收据匹配、可重放工件存在，且任何未闭合质量有显式标签。没有满足这些条件的内容只能记为进行中、延期或探索，不可记为完成。

> **2026-08-19 核查更正**：本账本新增 R0、R1、R2 与 Ticket 05a 四个整改阶段，并修正了 E-01 的真实分母。完整诊断见 `docs/EXECUTION_AUDIT_AND_REMEDIATION_GUIDE.md`，实测收据见 `docs/research/execution-audit-20260819.json`。唯一生产基线为 v4 计划 `6768bd50ccd9`（已结算 `50/64`）；v5-v8 四次合同迁移造成 `48` 项已结算处置被无关作废，而两计划的十项收据逐项对比**完全一致**，证明作废无实质依据。

## 整改阶段（2026-08-19 新增，优先于所有 Ticket）

| 阶段 | 内容 | 完成定义 | 依赖 |
|---|---|---|---|
| R0 | 状态归一与证据抢救 | `CURRENT.json`、`DEVELOPMENT_PLAN.md`、`HANDOFF_STATUS.md` 三处指向同一 v4 基线；收据一致比对固化为可重复验证器；未推送提交已同步 | 无 |
| R1 | Engine 八分片真实执行 | `8` 个分片均以 `--shard-count=8 --shard-index=<N> --execute` 执行，`263` 个验证器全通过，汇总收据入库 | 无（与搜索解耦） |
| R2 | 族级合同分离 | 合同版本改为目标族映射；有验证器证明单族升级不影响其他族计数 | R0 |
| 05a | 折叠内核（自 Ticket 14 前置） | 三级剪枝各有等价性对照实验收据，覆盖至少 `3` 个结构不同任务 | R1、R2 |

在 R1 与 05a 完成前，**不得向几何搜索投入机时**：规则收据未冻结时产出的结果会在收据变更后全部 fail-closed，而 `7936` 分母在无剪枝下属不可完成量级（单任务约 `70` 机时）。

## 范围冻结

| 范围 | 编号 | 当前状态 | 完成定义 | 依赖 |
|---|---|---|---|---|
| Wayfinder | 01–04 | 已完成 | 以既有开发计划的完成记录为准 | 已纳入当前规则收据 |
| Wayfinder | 05 | 部分完成 | `64/64` 任务有精确处置、质量守恒、checkpoint 可恢复、收据漂移拒绝旧结果；并完成合法部署至终局路线要求 | 规则收据、适配器、开局批、任务路线 |
| Wayfinder | 06 | 未完成 | 至少一条 Cryx/Fane 刺杀根从合法部署到同一终局独立 strict replay | 05、移动/激活/资源/chance/反应连接器 |
| Wayfinder | 07 | 未完成 | 至少一条合法部署到真实得分胜利路线逐步 strict replay | 05、Steamroller 历史与计分前驱 |
| Wayfinder | 08 | 未完成 | AND/MIN/chance 分母、质量守恒、开放上界和初始值区间均可重算 | 06、07 |
| Wayfinder | 09 | 未完成 | 四位 Fane 领袖、军表、地图、部署、先后手、刺杀/得分路线和可点击证据齐备 | 08、场景矩阵 |
| Wayfinder | 10 | 未完成 | 只消费稳定 schema 的控制台、队列和可视化；不伪造媒体 | 05、08、稳定 schema |
| Wayfinder | 11 | 未完成 | atom/hook 至动作、终局与真实 strict 场景矩阵闭合；三种结构显著不同阵营端到端 | 05、08、10 |
| Wayfinder | 12 | 部分完成 | 复合 receipt、语义影响、定向重建和受影响/未受影响证据边界通过纯构筑与规则原子两类变化验证 | 03、04、05 |
| Wayfinder | 13 | 未完成 | 一个聚合门运行 focused、纵向、跨阵营、恢复、漂移与浏览器门；有一条刺杀和一条得分部署至终局路线 | 09、10、11、12 |
| Engine | E-01 | 部分完成 | focused atom/strict verifier 矩阵可分片执行并发布精确覆盖分母。**已知真实分母：`263` 个验证器（`235` 规则原子 + `28` 严格转换）/ `8` 分片；分片 `0` 已通过，分片 `1` 为 `31/39`（`8` 项失败），分片 `2`-`7` 共 `205` 个未执行** | 规则原子、真实卡牌正反场景矩阵 |
| Engine | E-02 | 待账本确认 | `380/466` 影响审计、批准 Engine receipt 和搜索器消费记录一致 | E-01、搜索器规则基线 |
| Search 基础设施 | S-01 | 未完成 | pure reverse modules 按依赖迁移，改用 Host contract，focused verifiers 通过，legacy bridge 删除 | 稳定 Host contract |
| Search 证据 | S-02 | 未完成 | Ticket 17、execution-roster witness、全阵营搜索可调用矩阵的明细分母与 strict 路线闭合 | 05–12 |

**明确排除为核心完成条件的项目：** Excarnate/Sepsira/Raptor persisted policy 与固定刺杀 forward oracle 保持可选的只读候选比较工具；它们不可计入 reverse progress 或“全 Ticket 完成”。媒体目录、历史 monorepo 文档与旧线上工件须在产品阶段单独治理，不能以其缺失替代严格规则/搜索验收。

## 当前已知事实与禁止误读

当前规则基线是 `380` 原子、`466` hook operators、`196` primitives、`501` declared interactions。Engine 的微型夹具为 `108/108`，但这不是全规则证明。Ticket 05 当前有 64 个选中任务和 39 个唯一严格开局；处置账本中 21 个 `budget_deferred` 保持未完成，不能被改写为拒绝、不可达或搜索失败。[1] [2]

| 结果标签 | 进入严格聚合 | 含义 |
|---|---:|---|
| `STRICT_COMPLETE` | 是 | 根状态、动作、反应、chance、终局与独立回放均闭合 |
| `STRICT_REJECTED` | 是，但仅作为精确拒绝 | Host 在已定义输入上给出可复放拒绝 |
| `FILTERED_EXACT` | 否 | 精确候选筛除，不外推全家族 |
| `RULES_UNKNOWN` | 否 | 规则来源、Host 或 atom 证据缺口 |
| `BUDGET_DEFERRED` | 否 | 合法任务未获得 adapter 或预算 |
| `OPEN_INTERVAL` | 否 | MAX/MIN/chance 任一必要分支未闭合 |

## 跨仓提交与恢复契约

每项实现必须把 Engine 与 Search 的提交哈希、规则收据、数据版本、构筑池哈希、搜索配置哈希、根状态哈希、父状态哈希、随机流位置、分支分母和工件 manifest 一同写入。规则/数据/接口漂移使 checkpoint 自动失效；不得将旧结果迁移到新收据。

并行实施可独立修改 adapter、前驱连接器、场景矩阵或报告层，但不得同时修改共享状态 schema、receipt schema 或规则语义。合并顺序必须是：**R1 Engine 八分片收据与门禁 → R0/R2 状态归一与族级合同 → Ticket 05a 折叠内核 → Search Host contract → Ticket 05/06/07 strict 路线 → Ticket 08 聚合 → 覆盖与产品层**。每次合并先运行受影响 focused 门，再运行跨仓收据门。

合同治理规则（强制，2026-08-19 生效）：候选块大小、日志频率、进程隔离、超时阈值、新增可观测性与已有槽位序内的更细断点均**不得**升级合同或重建计划；只有枚举集合、枚举顺序、完成语义或规则收据变化才需升级，且仅限受影响目标族。升级前必须先写迁移影响说明（受影响族、预期作废项数、不受影响族的保留依据）；同一族在一个验收周期内只应变更一次。

## 长期状态报告格式

每次状态更新均采用：`范围 | 计划分母 | 已验证分子 | 开放/延迟数 | 规则收据 | checkpoint | 门禁命令 | claim_level`。当任一字段缺失时，任务状态为 `UNACCEPTED`。

## 参考资料

[1]: DEVELOPMENT_PLAN.md "Wayfinder 01–13 依赖和完成门"
[2]: HANDOFF_STATUS.md "当前规则收据与 Ticket 05 处置账本"
[3]: EXECUTION_AUDIT_AND_REMEDIATION_GUIDE.md "2026-08-19 执行核查与整改指导"
[4]: research/execution-audit-20260819.json "执行核查实测收据"
