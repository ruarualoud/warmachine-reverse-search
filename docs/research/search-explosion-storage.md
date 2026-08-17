# 搜索爆炸的存储、去重与外存执行研究结论

## Wayfinder 结论

- 研究票：`研究搜索爆炸的存储、去重与外存执行`
- 结论：通过研究门禁，可以进入独立存储层原型，但不能直接把研究 demo 当成生产实现。
- 选择：采用“内存热前沿 + 内容寻址对象 + 不可变候选分段 + 精确延迟重复检测 + 独立路线/概率账 + 事务检查点”的分层外存 DAG。
- 放弃：完整 JSON 树、纯内存全图、有限 transposition table 作为真值、Bloom/短哈希 hard dedupe、只保留 frontier、每状态只留一个 score，以及用 SQLite 逐节点随机 upsert 作为最终大规模数据面。
- 证据：一手资料综述见 [文献证据草稿](search-explosion-storage-literature-draft.md)，可重复有限实验见 [研究脚本](../../scripts/research-search-explosion-storage-demo.mjs) 和 [测量结果](search-explosion-storage-demo.json)。

## 研究问题的答案

搜索爆炸不能只按“节点数量”处理。必须分别计算并持久化：

- `V`：唯一完整规则状态。
- `G`：尚未精确去重的状态提议。
- `E`：动作、选择者、随机 outcome 与 strict receipt 不同的边。
- `L`：同一状态上的终局证明、Pareto 成本、主动兑换、意图和训练来源标签。
- `C`：具有稳定随机事件与 outcome 身份的概率贡献。
- `U`：预算截断、未展开对手回复、缺失随机 outcome 和规则未知形成的 unresolved 质量。

状态汇合只能减少 `V` 和后继计算，不能自动减少 `E/L/C/U`。因此状态对象、边、路线标签、概率贡献、strict receipt 和 checkpoint 必须使用不同身份与表；把它们全部压进一个 `stateHash` 会丢失路线和错误累计概率。

## 一手研究依据

### 外存与去重

[Aggarwal-Vitter 外存模型](https://doi.org/10.1145/48529.48535)说明外存成本由块 I/O 主导；[Korf 的 DDD](https://cdn.aaai.org/AAAI/2004/AAAI04-103.pdf)把逐节点随机查表改成追加、分区、排序和顺序归并。[Korf 的 JACM 后续工作](https://doi.org/10.1145/1455248.1455250)与 [External A*](https://doi.org/10.1007/978-3-540-30221-6_18)证明该方向能把远大于内存的隐式图落盘，但它们的图结构和代价前提不能直接移植为 Warmachine 的最优性结论。

结论是采用 DDD 的 I/O 结构，不继承其未满足前提的搜索证明。Warmachine 的同一状态可以跨批次重现，也可以收到更优标签，所以必须与历史 exact index 归并并允许 reopen。

### 状态汇合与路线保存

[Martins 多准则最短路](https://doi.org/10.1016/0377-2217(84)90077-8)要求每个状态保留多个非支配标签；Pareto 集在最坏情况下仍可能指数增长。[来源半环](https://doi.org/10.1145/1265530.1265535)说明共享结果与保留多种推导来源并不冲突。OR、AND、Chance 必须分别聚合：

- OR 是可选策略，不相加成功概率。
- AND 是必须覆盖的对手回复或义务，未展开项进入 unresolved。
- Chance 只有在同一随机事件的互斥完备 outcome 内才能求和。

因此，同一规则状态可以共享前驱或后继计算，但每条终局证明后缀、成本、交换、意图、训练来源和概率贡献仍单独存在。

### 内容寻址、并发与恢复

[IPFS 的 Merkle DAG](https://research.protocol.ai/publications/ipfs-content-addressed-versioned-p2p-file-system/benet2014.pdf)和 [Git pack](https://git-scm.com/docs/gitformat-pack)证明不可变内容、共享对象、压缩和 delta 可以共存。不过内容哈希只是索引和完整性证据，不是行为等价证明；摘要命中后仍需比较对象类型、schema、长度、Host 凭据和完整规范字节。

[HDA*](https://doi.org/10.1016/j.artint.2012.10.007)支持用稳定哈希 owner 分摊并行搜索，但不自带消息持久性、崩溃恢复或全局终止保证。第一版应使用单机分区单写者；每个提交具有稳定幂等身份，持久提交后才确认消息。检查点采用 WAL/事务语义，[SQLite WAL](https://sqlite.org/wal.html)只作为单机原型证据，正式数据面仍采用不可变分段与批量归并。

## 真实测量

测量绑定以下 Host receipt：

- Git revision：`de88f85fb2579a937bc5bddf246e5794fdfdd7da`
- Receipt：`76b9205b5219fe81d324c2831261762895e2dcd75c10f36ff5ea1b52d400cbab`
- Host 状态：dirty，`176` 个 tracked dirty path。
- 样本：Cryx/Fane 真实房间，`106` 个模型，规范状态 `65` 个顶层字段，`17` 个激活组。

由于 Host 是 dirty，数字只对测量文件记录的四个关键源码哈希有效；源码、数据或 schema 漂移后必须重新测量。

| 对象 | 未压缩 | gzip-9 |
| --- | ---: | ---: |
| 规范规则状态 | 1,601,108 B | 53,885 B |
| 一步后的规范状态 | 1,601,702 B | 54,054 B |
| 持久 strict action | 9,449 B | 2,627 B |
| strict receipt | 11,576 B | 3,828 B |
| 路线标签均值 | 882 B | 标签集合 723 B |
| 真实一步叶级 delta | 720 B | 354 B |

这一步真实 strict 行动只改变：

- `pieces/51/position/xIn`
- `anyTimeActivationWindow`

所以逐节点复制 1.60 MB 状态明显不合适。完整状态仍是身份与校验真值，但物理存储应采用周期全量对象加有界 delta；delta 过大或链过长时重建全量对象。

## 三种表示比较

有限 demo 保存相同的 `2` 个实际规则状态、`1` 条 strict 边、`8` 个路线标签、`2` 个终局证明后缀和每个后缀各一组完整 Chance 质量。

| 表示 | 逻辑/最终体积 | 说明 |
| --- | ---: | --- |
| 完整 JSON 树 | 25,792,984 B | 每条路线复制首尾完整状态、边和标签 |
| 规范内存 DAG | 3,230,297 B | 两个唯一状态与一条边共享，标签分开 |
| 事务外存 DAG | 167,936 B | gzip 对象、索引、事务页、checkpoint 和 GC 后的 SQLite 文件 |

- 单看结构共享，内存 DAG 比树小 `7.985` 倍。
- 结构共享加压缩后，有限外存文件比未压缩树小 `153.588` 倍。
- 第二个数字混合了结构去重和压缩，不能冒充纯算法压缩比。
- SQLite 结果证明事务和语义合同可行，不证明 SQLite 随机写适合大规模 DDD。

## 正确性实验

有限 demo 通过以下检查：

1. 两名并发 worker 对 `8` 个路线标签各提交一次，共 `16` 次提交，最终仍是 `8` 个标签。
2. 状态和边分别保持 `2` 与 `1`，未因路线汇合丢掉两个终局后缀。
3. 两个终局后缀都保留 `2/3 resolved + 1/3 unresolved`，重复提交没有重复累计概率。
4. deliberate exchange、intent 和 training provenance 均能从外存恢复。
5. worker 在事务未提交时被终止，重开数据库后 phantom route 不存在。
6. 强制让不同规范字节命中同一 state ID 时 fail closed。
7. 使用不同 Host receipt 继续旧图时 fail closed。
8. 从活动路线和边做可达标记后，孤立状态被回收，活动状态未丢失。
9. 内存基准与外存恢复的路线集合先按稳定 route ID 排序，再计算相同语义摘要；结果一致，提交顺序不影响语义。

## 选定存储合同

### 对象身份

- `rulesStateId = H(type, schema, Host receipt, canonical rules bytes)`
- `edgeId = H(source state, actor/choice, action, random event/outcome, target state, strict receipt)`
- `routeLabelId = H(search context, terminal suffix, edge chain, Pareto vector, exchange, intent, provenance)`
- `chanceContributionId = H(random event, outcome, incoming route label)`
- `checkpointRootId = H(receipt, immutable segment manifest, partition watermarks, frontier, in-flight ledger)`

每个哈希都做域分离。哈希命中后比较类型、schema、长度、receipt 和规范字节；碰撞成为审计错误，不能覆盖已有对象。

### 写入流程

1. worker 把 node proposal、edge、label、chance contribution 和 strict receipt 顺序追加到临时候选 segment。
2. segment 封存后写长度、记录数、完整校验和和 Host receipt，不再原地修改。
3. 按完整 `searchMemoKey` 摘要的稳定前缀分区；初始采用 `256` 个逻辑 bucket，可在 checkpoint 边界重新分片。
4. 分区内排序，与已提交 exact index 顺序归并。
5. 状态按完整规范字节复核后新建或复用；边、标签和概率贡献按各自身份做集合并。
6. 对 Chance event 检查 outcome 是否互斥、分母一致以及 resolved + unresolved 是否为 1。
7. 对 Pareto 标签只在上下文相同、全部维度支配且扩展保序已证明时 hard delete；否则冷存或标记 budget unresolved。
8. 对象、索引、水位和 checkpoint manifest 形成同一事务发布边界，发布后才确认 worker 输入。

### 状态压缩

- 每个状态 ID 始终由完整规范字节计算，物理 delta 不参与状态等价。
- delta 链初始上限为 `16`；达到上限即写新的 gzip 全量基对象。
- 压缩 delta 超过对应全量对象的 `25%` 时直接写全量对象。
- 规则 schema、Host receipt、Steamroller packet 或静态数据凭据变化时禁止跨边界 delta。
- 读取后重新构造完整规范字节并校验 state ID，校验失败 fail closed。

`16` 和 `25%` 是第一版可测阈值，不是理论常数；多层原型必须记录读取放大、delta 分位数和重建时间后再校准。

### 热内存与外存

RAM 只保存：当前 frontier、展开队列、segment 缓冲、归并缓冲、热点 exact-index 页和标签优先队列。冷图、完整边、全部标签、proof suffix、receipt 和 unresolved 账始终落盘。

Frontier search 只能减少热工作集，不能成为唯一持久真值。有限 transposition table 只做可丢缓存，eviction 只导致重算，不能改变覆盖声明。

### Checkpoint 与恢复

Checkpoint 必须绑定：

- Host、规则、数据、场景包和规范 schema receipt。
- 已封存 segment 及校验和。
- 每个分区已归并水位。
- 热 frontier 的持久 manifest。
- worker inbox/outbox 和未确认批次。
- 状态、边、标签、Chance contribution 与 strict receipt 的提交水位。
- unresolved 原因与质量。

恢复只读取最后完整 checkpoint root。receipt 漂移、segment 缺失、校验失败、概率事件不闭合或消息确认先于持久提交时，都冻结旧图并 fail closed。

### 垃圾回收

从活动 checkpoint、最终报告和训练导出根做标记；对象至少跨过两个已完成 checkpoint 世代后才能回收。正在写入或未归并 segment 不参与 sweep。Host receipt 漂移时旧图只读冻结，不做跨版本重解释和立即清理。

## 容量模型与预算

第一版规划采用比单步实测更保守的单位预算：

- 每个唯一状态平均物理增量：`1,024 B`
- 每个状态保留边：`2.5`
- 每条边：`8,192 B`
- 每个状态路线标签：`2`
- 每个标签：`2,048 B`
- 归并、压缩和 GC 写放大：`4x`

得到 live 平均约 `25,600 B / 唯一状态`。该值没有把“边数和标签数可能指数增长”隐藏进节点数；每次运行必须同时显示 `V/G/E/L/C/U`，并在实际长尾超过预算时提前停机。

| 环境 | 热 RAM | 磁盘硬预算 | segment | live 状态估计 | 计入 4x 写放大的安全状态估计 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 微型正确性题 | 512 MiB | 2 GiB | 64 MiB | 83,886 | 20,971 |
| 当前本地 Cryx/Fane | 1 GiB | 8 GiB | 128 MiB | 335,544 | 83,886 |
| 配置完备服务器目标 | 4 GiB | 256 GiB | 256 MiB | 10,737,418 | 2,684,354 |

测量时本地仅有 `33.87 GiB` 可用，因此本地 Cryx/Fane 必须在自由空间低于 `20 GiB` 前停止生成新 segment。`8 GiB` 是硬上限，不是建议一次全部占满。

这些只是存储可承受规模，不是可搜索深度保证。真实多层运行必须测量：

- 每层 `G/V` 汇合率。
- 每状态边与标签分布的 `p50/p95/p99/max`。
- delta、action、receipt 与 label 压缩分位数。
- segment 排序、归并、checkpoint、恢复和 GC 时间。
- 写放大、reopen 率、跨 owner 边比例和负载倾斜。
- resolved/unresolved Chance 质量与未覆盖对手回复。

## 实现阶段门禁

研究结束后，独立存储层原型必须满足：

1. 不使用 Project D 规则源码作为存储实现；Host 仅提供规则状态、动作和 strict receipt。
2. 在微型可穷举图上与完整 JSON 树逐对象、逐边、逐标签、逐概率贡献等价。
3. 在真实 106 模型多层小批次上记录实际容量分位数，而不是继续沿用本报告单步样本。
4. 使用不可变 segment + exact merge 验证顺序 I/O；SQLite 只保留控制平面或小规模索引候选。
5. 对并发重复、乱序、worker kill、主进程 kill、partial segment、partial merge 和 receipt 漂移做故障注入。
6. 在达到 RAM、磁盘、时间或标签预算时停止并完整报告 unresolved，不静默删分支。
7. 只有门禁通过后，才能让多层前驱代数依赖该存储层运行。

## 仍然未知

- 单步 delta 样本不足以决定真实 delta 分布，`16` 层链和 `25%` 全量阈值需要多层原型校准。
- `2.5` 条边和 `2` 个标签是保守规划输入，不是 Cryx/Fane 实测均值。
- 分区是否应只用 hash 前缀，还是加入终局层/绝对轮次局部性，需要真实 I/O 对比；任何局部分区都不能缩小 exact 去重范围。
- Pareto 标签长尾仍可能成为主要爆炸源；研究没有发现可在不改变问题的情况下保证多项式标签数的方法。
- 分布式执行需要持久 inbox/outbox 和全局终止检测；在这些能力完成前只允许单机分区单写者。
