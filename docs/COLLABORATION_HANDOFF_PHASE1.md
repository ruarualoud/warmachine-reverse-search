# Warmachine 严格对抗搜索：Phase 1 共同开发交接

**作者：Manus AI**  
**日期：2026-08-18**  
**工作分支：`manus/phase1-ruleset-ticket05`**

> 本交接的目标不是把已有筛选分数包装为“最优解”，而是建立一个能逐步回答“在明确规则、局面、场景、预算与对手应对范围下，哪些对抗关系已经严格闭合”的系统。任何未闭合分支、超时、未知规则或预算延迟都必须保留在分母中。

## 0. 2026-08-19 核查更正（并行团队先读）

一次独立执行核查已确认本阶段存在方向性错误，完整诊断与整改路线见 `docs/EXECUTION_AUDIT_AND_REMEDIATION_GUIDE.md`，实测收据见 `docs/research/execution-audit-20260819.json`。并行团队在开工前必须知悉三件事。

第一，本文第 1.1 节描述的 checkpoint `a88ee01a` 与 `43/64` 已过时。**唯一生产基线为 v4 计划 `6768bd50ccd9a8321de9818b90192feaa0f889c7582dda6d2b6cd5d566bf3512`，已结算 `50/64`**。v5 至 v8 的四次合同迁移造成 `48` 项已结算处置被无关作废（v8 仅 `2/64`），v8 仅作历史工件保留。

第二，两项阻塞搜索推进的关键发现必须优先于任何搜索工作。Engine CI 分片验证此前因参数风格不匹配而静默空跑，正确命令为 `--shard-count=8 --shard-index=<N> --execute`；真实分母 `263` 个验证器，分片 `1` 实际执行后 `39` 项中 `8` 项失败，分片 `2`-`7` 共 `205` 个仍未执行。刺杀几何枚举分母 `7936` 无任何剪枝，单任务约 `70` 机时、剩余 `14` 项约 `988` 机时，属不可完成量级。

第三，本文第 2 节定义的 AND-OR 与 chance 节点闭合模型（即 Ticket 08）**尚未实现**。这意味着即使 Ticket 05/06/07 全部闭合，也只能得到单侧路线存在性，不能输出任何 `PROVEN_CONDITIONAL` 的对抗关系。Ticket 08 是最终目标的真正瓶颈。

### 0.1 整改期分工

| 线 | 负责内容 | 与他线的耦合 |
|---|---|---|
| A | R1：Engine 八分片逐个 `--execute` 执行并修复回归 | 与搜索完全解耦，优先级最高 |
| B | R0 状态归一、R2 族级合同分离、远端同步修复 | 修改计划/checkpoint schema，需先小 PR 固定 |
| C | Ticket 05a 折叠内核与等价性对照实验 | 依赖 B 的族级合同 |
| D | Ticket 06/07 纵向连接原型（可用现有 `12` 项 strict root 起步） | 只消费稳定 schema |
| E | Ticket 08 概率对抗闭包设计 | 与 D 共享终局证据格式 |

切分原则：按目标族与任务键切分，**禁止按槽位切分**（会造成同一任务 checkpoint 写冲突）。使用批执行器的 `taskKeys` 参数分配互不重叠集合，各自写入独立 checkpoint 分片，最后经一次显式合并汇总。合并规则仍为 `merge_only_when_exact_task_rosters_representative_map_deployment_initiative_and_receipts_match`。

### 0.2 合同治理规则（强制）

本次核查最核心的流程教训是缺少合同变更的准入标准。此后：候选块大小、日志频率、进程隔离、超时阈值、新增可观测性、以及已有槽位序内的更细断点均**不得**升级合同或重建计划；只有枚举集合、枚举顺序、完成语义或规则收据发生变化才需升级，且**仅限受影响目标族**。升级前必须先写迁移影响说明（列出受影响族、预期作废项数、不受影响族的保留依据）；同一族在一个验收周期内只应变更一次。

## 1. 当前可复现基线

规则引擎修复位于 `warmachine-strict-engine` 的提交 `b0c2e557b9adbb68282d655c69e212dd0c9940a3`。该提交把七个微型对局的历史期望漂移逐项审计为显式严格掷骰、精确概率或未映射场景的 fail-closed 负向断言；`verify:micro` 为 **108/108**，并已与核心和 Steamroller 严格门一同通过。[1]

搜索器随后在提交 `41f5fc8835b2012996b55e81142a4f2dbfa2d19e` 提升了规则集基线，并在提交 `40058930475cd6a74bedbfbbbcd58c7dc2de2fbd` 移除了 Ticket 05 对未提交历史大型工件的默认依赖。当前审阅基线为 `warmachine-ruleset-2026-08-18-remote-40041-v6`：**380** 个规则原子、**466** 个 hook operators、**196** 个 primitives 与 **501** 个 declared interactions。[2] [3]

| 范围 | 当前事实 | 可作出的声明 | 不可作出的声明 |
|---|---|---|---|
| 规则执行 | 核心、概率、微型与 Steamroller 门已通过 | 当前收据下已审计的规则与夹具有效 | 全卡牌、全局面或跨版本完全正确 |
| 图谱与收据 | typed graph 无结构问题；规则版本已提升 | 当前图谱可作为**排序与证据索引** | 图谱可硬剪枝、或图谱已证明可达性 |
| Ticket 05 | 64 个选中任务、39 个唯一严格开局、7 个场景 | 任务绑定与已注册适配器的处置可复放 | 从合法部署到终局的完整路径已证明 |
| 对抗强度 | 初始状态值仍为区间，筛选指数仅用于候选排序 | 明确预算内的条件性候选关系 | 自然胜率、稳定强度或全局最优 |

### 1.1 Ticket 05 当前分母

当前生产 checkpoint 为 `a88ee01af256096ed8e3947d45911f1a3760259f2b12244fd8caf4e6dcbf185e`。在 64 个选中任务中，12 个 `strict_materialized`、4 个 `strict_rejected`、21 个 `proposal_filtered`、6 个 `rules_unknown`、0 个 `input_invalid`、21 个 `budget_deferred`；候选质量守恒。因而 **43/64 已结算，21/64 明确为未注册适配器导致的预算延迟**。这 21 个任务不是拒绝、不可达或失败的同义词。[4]

## 2. “最优对抗关系”的严格定义

系统应把每个状态建模为一个带机会节点的 AND-OR 图。MAX 节点选择当前方动作，MIN 节点枚举对方所有合法应对，chance 节点枚举规则给定的随机结果；严格引擎是唯一合法性与终局裁判。

| 节点类型 | 允许闭合的条件 | 聚合规则 | 未闭合原因 |
|---|---|---|---|
| MAX | 所有进入比较的动作已按同一边界验证；胜者存在性可复放 | 取子值最大值或上界/下界 | 未生成合法动作、超时、启发式值混入 |
| MIN | 对方合法应对分母为完整集合 | 取子值最小值或上界/下界 | 漏掉反制、对方动作未重放 |
| Chance | 结果集合完整、概率来源受规则收据约束、总和为 1 | 按登记概率加权 | 漏分支、概率未知、仅作了采样 |
| Terminal | 终局事件与裁决可从根状态逐步重放 | 固定终局值 | 仅有候选终态或终局事件缺失 |

只有当目标根以下必要 MAX/MIN/chance 分支全部闭合、未知值为零、关键路线独立回放一致时，才可标记为 **`PROVEN_CONDITIONAL`**。它的完整声明必须包含规则收据、根状态族、场景矩阵分母、搜索预算和概率口径。任何深度截断、采样、筛选、单路线或开放区间仅可标为 **`EXPLORATORY`** 或 **`OPEN_INTERVAL`**。

## 3. 场景与对抗覆盖矩阵

覆盖单位不是“运行次数”，而是如下版本化地址的一个合法单元：

`ruleset × data × scenario × map × terrain_partition × roster_A × roster_B × first_player × side_assignment × root_state × chance_partition`

当前 Ticket 05 已建立七个 Steamroller 场景、三类地形分区、双方真实军表和先手绑定的有限开局层，但尚未对所有合法组合做完整对抗闭合。下一阶段必须产出矩阵清单，并使用下列状态枚举，而非将缺失单元视为平局或负例。

| `matrix_status` | 含义 | 是否可进候选排序 | 是否可进最优证明 |
|---|---|---:|---:|
| `VALID_COMPLETE` | 严格终局、重放与分支门全部通过 | 是 | 仅与其余闭合分母共同满足时可以 |
| `DRAW_COMPLETE` | 严格平局且双边路径闭合 | 是 | 是 |
| `TIMEOUT_OPEN` | 预算或节点上限触发 | 否 | 否 |
| `ENGINE_ERROR` | 引擎或接口异常 | 否 | 否 |
| `ILLEGAL_INPUT` | 局面、部署或动作被 Host 拒绝 | 否 | 否 |
| `BUDGET_DEFERRED` | 合法任务尚未获得适配器/预算 | 否 | 否 |

每轮报告必须写出：计划合法单元数、启动数、完成且可复核数、超时数、非法数、引擎错误数、延迟数，以及以计划合法单元为分母的覆盖率。对声称存在相对优势的阵容对，必须同时报告阵容互换与双方先手；对称性不能假定，必须由状态、地图和规则验证。

## 4. 有限资源下的执行策略

建议使用五层流水线；前两层只缩小或排序候选，后三层才可产出严格证据。

| 层级 | 输入与输出 | 固定资源规则 | 声明级别 |
|---|---|---|---|
| L0：收据与输入校验 | 规则/数据/地图收据、状态哈希、任务契约 | 哈希不一致即拒绝恢复 | 无结论 |
| L1：无损预过滤 | 格式错误、重复状态、Host 已拒绝动作 | 必须保存拒绝原因与原分母 | 候选管理 |
| L2：图谱排序与适配器选择 | terminal obligations、来源绑定、能力瓶颈 | `hardPruningEnabled=false` 前不得删分支 | 探索排序 |
| L3：分片严格物化 | 任务专属根、MAX/MIN 动作、chance 结果 | 单批最多 16 任务；单写 checkpoint | 条件性路径证据 |
| L4：独立回放与聚合 | 终局事件、资源守恒、父子哈希与概率 | 失败即把祖先降为开放状态 | `PROVEN_CONDITIONAL` 候选 |

执行器应采用内容寻址 checkpoint，至少保存 `state_hash`、`parent_hash`、`ruleset_receipt_hash`、`data_hash`、`engine_commit`、`search_config_hash`、随机流位置、已闭合分支、待处理队列、内存/节点/墙钟消耗与失败分类。规则、数据、图谱、构筑池或适配器语义发生漂移时，受影响 checkpoint 必须拒绝恢复；不得混用旧路线和新基线。[2]

预算优先级为：首先完成已经启动的对称配对与回放；随后补齐 chance 分支较小而区分度高的终局族；最后扩展高分支、开放区间的状态。上/下界剪枝仅在其正确性由完整子树界限证明时可用；采样只能生成探索排序，绝不能进入证明通道。

## 5. 并行团队边界与交接接口

规则引擎仓只拥有合法状态、动作枚举、动作执行、终局裁决和规则收据；搜索仓只拥有任务拆分、分支顺序、预算、证明聚合和报告。任何“搜索器改规则以便跑通”的修改都应被拒绝。

| 工作包 | 允许修改区域 | 必交付工件 | 合并前门禁 |
|---|---|---|---|
| A：规则与原子 | `warmachine-strict-engine` 的规则、夹具、引擎文档 | 引擎提交、原子影响表、全量验证日志 | `verify`、`verify:micro`、`verify:steamroller` |
| B：未注册适配器 | 搜索器 `src/matchup` 与任务验证器 | 每个 `budget_deferred` 家族的 adapter、严格/拒绝示例、处置质量表 | 任务适配器验证、执行批验证 |
| C：Ticket 06/07 | 任务专属 materializer 与 fixture | 合法部署至终局的明确闭合或 fail-closed 状态 | 独立重放、状态哈希和终局门 |
| D：覆盖与报告 | 矩阵生成、统计、只读报告 | 可重算矩阵、覆盖分母、失败分类、开放队列 | 不改变状态/规则；重放抽样 100% 一致 |
| E：性能与恢复 | 调度、checkpoint、缓存、对称性证据 | 前后预算、节点、闭合率与回归比较 | 不降低完整性门禁，不写共享 checkpoint |

每项交接包都必须包含以下最小字段：`task_id`、`state_hash`、`parent_hash`、`ruleset_receipt_hash`、`data_version`、`engine_commit`、`search_config_hash`、`node_kind`、`legal_branch_count`、`verified_branch_count`、`replay_status`、`disposition`、`claim_level`、`artifact_manifest_hash`。缺字段、规则漂移、重放不一致或资源守恒失败时，协调方必须退回该包。

合并顺序固定为：**A 规则接口与基线 → B/C 搜索适配层 → D 覆盖报告 → E 性能优化**。每一步必须在干净工作树用同一 Engine receipt 复跑；策略优化不得与规则语义变更混入同一不可分提交。

## 6. 立即可领取的下一工作

当前最有价值的工作不是增加筛选分数，而是清除严格证明分母中的开放项。优先顺序如下。

1. 为 Ticket 05 的 21 个 `budget_deferred` 任务按目标族建立显式 adapter；每增加一个 adapter，先用一个严格物化例和一个 Host 拒绝例固定边界，再运行同一 checkpoint 的恢复。
2. 完成 Ticket 06/07 的“合法部署 → 对手应对 → 终局事件”完整路线。若无法闭合，必须交付带原因的 `OPEN_INTERVAL`，不得只提交成功路径。
3. 建立矩阵 manifest，并优先补齐所有已选阵容对的阵容互换与先手交换。随后补齐七场景和三地形分区的失败/超时/延迟分母。
4. 引入 AND-OR proof ledger：MAX、MIN 与 chance 分支的全量分母、概率守恒和父子聚合检查应成为独立门禁，而不是报告后处理。
5. 在覆盖已闭合的一小组对局上评估缓存、对称性消除和增量哈希；报告节点数、时间、内存、闭合率和重放一致率的前后差异。性能改动不得改变合法动作集合或 claim level。

## 7. 复现命令

以下命令必须在两个仓库同级、搜索器已设置 `WARMACHINE_ENGINE_ROOT` 时运行。Scratch 输出不应提交，但每次交接应保存相应的 manifest hash 与摘要。

```bash
# Engine
cd warmachine-strict-engine
npm run verify
npm run verify:micro
npm run verify:steamroller

# Search：规则收据与图谱
cd ../warmachine-reverse-search
export WARMACHINE_ENGINE_ROOT=../warmachine-strict-engine
npm run verify:upstream
npm run verify:ruleset-snapshot
npm run verify:ruleset-impact
npm run verify:primitives
npm run verify:regression
npm run verify:interaction-graph

# Ticket 05：当前基线上的批计划、开局和处置门
npm run verify:custom-matchup-terminal-root-batch
npm run verify:custom-matchup-terminal-root-opening-batch
npm run verify:custom-matchup-terminal-task-execution-batch
```

## 参考资料

[1]: ../../warmachine-strict-engine/docs/HANDOFF_STATUS.md "规则引擎交接与微型夹具审计"
[2]: HANDOFF_STATUS.md "搜索器交接、规则收据与 Ticket 05 状态"
[3]: research/ruleset-review-20260818.json "规则集提升审核收据"
[4]: ../.scratch/custom-matchup-reports/sepsira-six-swarms-vs-fane-v1/terminal-root-batch-v1/ "当前 Ticket 05 计划与 checkpoint（本地运行工件）"
